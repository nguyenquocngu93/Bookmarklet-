const express = require('express');
const path = require('node:path');
const { Agent } = require('undici');
const { Readable } = require('node:stream');

const insecureDispatcher = new Agent({ connect: { rejectUnauthorized: false } });

const app = express();
app.set('trust proxy', 1);
const PORT = process.env.PORT || 10000;
const PROXY_KEY = process.env.PROXY_KEY || '';
const ALLOWED_HOSTS = new Set(
  (process.env.ALLOWED_HOSTS || '')
    .split(',')
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean)
);
const MAX_REDIRECTS = Number(process.env.MAX_REDIRECTS || 5);
const PUBLIC_BASE_URL = (process.env.PUBLIC_BASE_URL || '').replace(/\/$/, '');
const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || '';
const TMDB_BEARER_TOKEN = process.env.TMDB_BEARER_TOKEN || '';

app.disable('x-powered-by');
app.use(express.json({ limit: '512kb' }));
app.use((req, res, next) => {
  const started = Date.now();
  res.on('finish', () => {
    let sourceHost = '';
    try { if (req.query.url) sourceHost = new URL(req.query.url).host; } catch (_) {}
    console.log(`[${req.method}] ${req.path} source=${sourceHost || '-'} status=${res.statusCode} ${Date.now() - started}ms`);
  });
  next();
});
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Type, X-Proxy-Key');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Expose-Headers', 'Accept-Ranges, Content-Length, Content-Range, Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

function isPrivateHost(hostname) {
  const host = hostname.toLowerCase();
  return host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0' ||
    host === '::1' || host.startsWith('10.') || host.startsWith('192.168.') ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(host) || host.endsWith('.local');
}

function parseTarget(raw) {
  if (!raw) throw new Error('Thiếu URL nguồn');
  const target = new URL(raw);
  if (!['http:', 'https:'].includes(target.protocol)) throw new Error('Chỉ hỗ trợ HTTP/HTTPS');
  if (isPrivateHost(target.hostname)) throw new Error('Không cho phép host nội bộ');
  const hostname = target.hostname.toLowerCase();
  const hostAllowed = [...ALLOWED_HOSTS].some((allowed) =>
    hostname === allowed || hostname.endsWith(`.${allowed}`)
  );
  if (ALLOWED_HOSTS.size && !hostAllowed) {
    throw new Error('Host chưa nằm trong ALLOWED_HOSTS');
  }
  return target;
}

function authorized(req) {
  if (!PROXY_KEY) return true;
  return req.get('x-proxy-key') === PROXY_KEY || req.query.key === PROXY_KEY;
}

function requestHeaders(req, target, refererOverride, skipRange) {
  const headers = {
    'user-agent': req.query.ua || process.env.DEFAULT_USER_AGENT ||
      'Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36',
    'accept': req.get('accept') || '*/*',
    'accept-encoding': 'identity'
  };
  const range = req.get('range');
  if (range && !skipRange) headers.range = range;
  // Do not forward cache validators. A source 304 has no body, which is unsafe
  // for a relay: the browser cache belongs to the proxy URL, not the source URL.
  // If-Range is still useful together with Range for byte-range media requests.
  const ifRange = req.get('if-range');
  if (ifRange) headers['if-range'] = ifRange;
  const referer = refererOverride || req.query.referer || process.env.DEFAULT_REFERER;
  if (referer) headers.referer = referer;
  const origin = req.query.origin || process.env.DEFAULT_ORIGIN;
  if (origin) headers.origin = origin;
  if (origin) {
    headers['sec-fetch-site'] = 'same-site';
    headers['sec-fetch-mode'] = 'cors';
    headers['sec-fetch-dest'] = 'video';
  }
  if (req.query.cookie) headers.cookie = req.query.cookie;
  return headers;
}

async function fetchSource(target, req, referer, skipRange) {
  let current = target;
  for (let attempt = 0; attempt <= MAX_REDIRECTS; attempt++) {
    const response = await fetch(current, {
      headers: requestHeaders(req, current, referer, skipRange),
      redirect: 'manual',
      dispatcher: process.env.ALLOW_INSECURE_TLS === 'true' ? insecureDispatcher : undefined,
      signal: AbortSignal.timeout(30000)
    });
    if (![301, 302, 303, 307, 308].includes(response.status)) return response;
    const location = response.headers.get('location');
    if (!location) return response;
    current = parseTarget(new URL(location, current).toString());
  }
  throw new Error('Quá nhiều redirect');
}

function forwardMediaHeaders(source, res) {
  for (const name of ['content-type', 'content-length', 'content-range', 'accept-ranges']) {
    const value = source.headers.get(name);
    if (value) res.setHeader(name, value);
  }
}

// Some hosts disguise MPEG-TS segments as PNG files for CDN delivery. The
// PNG header/padding is not part of the HLS segment; hls.js must receive the
// transport stream starting at the first 0x47 sync byte.
function findMpegTsOffset(buffer) {
  const packetSize = 188;
  const packetCount = 5;
  const lastStart = Math.min(buffer.length - packetSize * packetCount, 64 * 1024);
  if (lastStart < 0) return -1;
  for (let offset = 0; offset <= lastStart; offset++) {
    let aligned = true;
    for (let packet = 0; packet < packetCount; packet++) {
      if (buffer[offset + packet * packetSize] !== 0x47) {
        aligned = false;
        break;
      }
    }
    if (aligned) return offset;
  }
  return -1;
}

function isPng(contentType) {
  return /^image\/png(?:;|$)/i.test(contentType || '');
}

function proxyUrl(target, req, referer, isPlaylist) {
  const params = new URLSearchParams({ url: target.toString() });
  if (referer) params.set('referer', referer);
  if (req.query.origin) params.set('origin', req.query.origin);
  if (req.query.ua) params.set('ua', req.query.ua);
  // Preserve a user/session-bound media token across rewritten HLS children.
  if (req.query.access_token) params.set('access_token', req.query.access_token);
  if (PROXY_KEY) params.set('key', PROXY_KEY);
  const endpoint = isPlaylist ? '/hls' : '/proxy';
  const forwardedProto = (req.get('x-forwarded-proto') || '').split(',')[0].trim();
  const protocol = forwardedProto || req.protocol || 'https';
  const base = PUBLIC_BASE_URL || `${protocol}://${req.get('host')}`;
  return `${base}${endpoint}?${params.toString()}`;
}

function looksLikePlaylist(url) {
  return /(?:\.m3u8|m3u8)(?:$|[?#])/i.test(url);
}

function resolvePlaylistUri(rawUri, playlistUrl) {
  const base = new URL(playlistUrl);
  const target = new URL(rawUri, base);
  // This provider signs the playlist with query parameters and uses relative
  // init/segment names. Carry the token query onto relative child URLs.
  if (!target.search && base.search && !/^https?:\/\//i.test(rawUri)) target.search = base.search;
  return target;
}

function rewritePlaylist(text, playlistUrl, req, referer) {
  let expectingVariantPlaylist = false;
  return text.split(/\r?\n/).map((line) => {
    const trimmed = line.trim();
    if (!trimmed) return line;

    if (trimmed.startsWith('#')) {
      const isVariantTag = trimmed.startsWith('#EXT-X-STREAM-INF') ||
        trimmed.startsWith('#EXT-X-I-FRAME-STREAM-INF') ||
        (trimmed.startsWith('#EXT-X-MEDIA') && /TYPE=AUDIO/i.test(trimmed));
      if (isVariantTag) expectingVariantPlaylist = true;
      return line.replace(/URI="([^"]+)"/g, (_, uri) => {
        try {
          const target = resolvePlaylistUri(uri, playlistUrl);
          const isPlaylist = expectingVariantPlaylist || looksLikePlaylist(target.toString());
          return `URI="${proxyUrl(target, req, referer, isPlaylist)}"`;
        } catch (_) { return `URI="${uri}"`; }
      });
    }

    try {
      const target = resolvePlaylistUri(trimmed, playlistUrl);
      const isPlaylist = expectingVariantPlaylist || looksLikePlaylist(target.toString());
      expectingVariantPlaylist = false;
      return proxyUrl(target, req, referer, isPlaylist);
    } catch (_) { return line; }
  }).join('\n');
}

function validProfileId(id) {
  return /^[A-Za-z0-9_-]{8,80}$/.test(id || '');
}
function withoutHistory(payload) {
  const safe = payload && typeof payload === 'object' ? { ...payload } : {};
  delete safe.history;
  delete safe.playbackPositions;
  return safe;
}

async function syncRequest(method, profileId, body) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    const error = new Error('Supabase chưa được cấu hình trên Render');
    error.status = 503;
    throw error;
  }
  const endpoint = method === 'PUT'
    ? `${SUPABASE_URL}/rest/v1/umpdl_profiles`
    : `${SUPABASE_URL}/rest/v1/umpdl_profiles?profile_id=eq.${encodeURIComponent(profileId)}`;
  const headers = {
    apikey: SUPABASE_SERVICE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
    'Content-Type': 'application/json',
    Prefer: method === 'PUT' ? 'resolution=merge-duplicates,return=representation' : 'return=representation'
  };
  // PostgREST upsert is a POST with resolution=merge-duplicates. A PUT with
  // a filter only updates an existing row and silently saves nothing for a
  // newly generated profile ID.
  const requestMethod = method === 'PUT' ? 'POST' : method;
  const response = await fetch(endpoint, { method: requestMethod, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await response.text();
  if (!response.ok) {
    const error = new Error(`Supabase ${response.status}: ${text.slice(0, 300)}`);
    error.status = 502;
    throw error;
  }
  return text ? JSON.parse(text) : null;
}

app.get('/sync/:profileId', async (req, res) => {
  const { profileId } = req.params;
  if (!validProfileId(profileId)) return res.status(400).json({ error: 'Profile ID không hợp lệ' });
  try {
    const rows = await syncRequest('GET', profileId);
    const record = rows && rows[0] ? rows[0] : { profile_id: profileId, payload: {}, updated_at: null };
    record.payload = withoutHistory(record.payload);
    res.json(record);
  } catch (error) {
    res.status(error.status || 502).json({ error: error.message });
  }
});

app.put('/sync/:profileId', async (req, res) => {
  const { profileId } = req.params;
  if (!validProfileId(profileId)) return res.status(400).json({ error: 'Profile ID không hợp lệ' });
  if (!req.body || typeof req.body !== 'object') return res.status(400).json({ error: 'Payload không hợp lệ' });
  try {
    const rows = await syncRequest('PUT', profileId, {
      profile_id: profileId,
      payload: withoutHistory(req.body),
      updated_at: new Date().toISOString()
    });
    res.json(rows && rows[0] ? rows[0] : { ok: true });
  } catch (error) {
    res.status(error.status || 502).json({ error: error.message });
  }
});

app.delete('/sync/:profileId', async (req, res) => {
  const { profileId } = req.params;
  if (!validProfileId(profileId)) return res.status(400).json({ error: 'Profile ID không hợp lệ' });
  try {
    await syncRequest('DELETE', profileId);
    res.json({ ok: true });
  } catch (error) {
    res.status(error.status || 502).json({ error: error.message });
  }
});


// ========== ANONYMOUS COMMUNITY LEARNING ==========
// This store deliberately never receives browsing history, page titles, media
// URLs, cookies or profile IDs. It contains only aggregate votes keyed by a
// normalized hostname (or public TMDB id) and safe, host-only ad block rules.
const LEARNING_MIN_BLOCK_VOTES = Math.max(1, Number(process.env.LEARNING_MIN_BLOCK_VOTES || 3));
const LEARNING_MAX_RULES = Math.max(20, Math.min(500, Number(process.env.LEARNING_MAX_RULES || 200)));
const LEARNING_RATE_LIMIT = Math.max(5, Number(process.env.LEARNING_RATE_LIMIT || 40));
const learningRateBuckets = new Map();

function learningHeaders() {
  return {
    apikey: SUPABASE_SERVICE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation'
  };
}

function validLearningHost(subject) {
  const host = String(subject || '').trim().toLowerCase().replace(/^www\./, '');
  if (!host || host.length > 253 || !host.includes('.')) return '';
  if (!/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(host)) return '';
  return host;
}

function normalizeLearningSubject(kind, subject) {
  if (kind === 'tmdb') return /^(?:movie|tv):\d{1,12}$/.test(String(subject || '')) ? String(subject) : '';
  return validLearningHost(subject);
}

function allowLearningWrite(req) {
  const key = String(req.ip || req.get('x-forwarded-for') || 'unknown').slice(0, 128);
  const now = Date.now();
  const bucket = learningRateBuckets.get(key) || { startedAt: now, count: 0 };
  if (now - bucket.startedAt > 60 * 60 * 1000) { bucket.startedAt = now; bucket.count = 0; }
  bucket.count += 1;
  learningRateBuckets.set(key, bucket);
  return bucket.count <= LEARNING_RATE_LIMIT;
}

async function submitLearningVote(kind, subject, vote) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    const error = new Error('Kho học cộng đồng chưa được cấu hình');
    error.status = 503;
    throw error;
  }
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/umpdl_apply_learning_vote`, {
    method: 'POST', headers: learningHeaders(),
    body: JSON.stringify({ p_kind: kind, p_subject: subject, p_vote: vote })
  });
  const text = await response.text();
  if (!response.ok) {
    const error = new Error(`Supabase learning ${response.status}: ${text.slice(0, 300)}`);
    error.status = 502;
    throw error;
  }
  return text ? JSON.parse(text) : null;
}

app.post('/learning/vote', async (req, res) => {
  const body = req.body || {};
  const kind = String(body.kind || '').toLowerCase();
  const vote = String(body.vote || '').toLowerCase();
  const subject = normalizeLearningSubject(kind, body.subject);
  if (!['video', 'iframe', 'ad', 'tmdb'].includes(kind) || !['up', 'down'].includes(vote) || !subject) {
    return res.status(400).json({ error: 'Vote học cộng đồng không hợp lệ' });
  }
  if (!allowLearningWrite(req)) return res.status(429).json({ error: 'Đã giới hạn vote tạm thời, thử lại sau nha' });
  try {
    const rows = await submitLearningVote(kind, subject, vote);
    res.json({ ok: true, aggregate: Array.isArray(rows) ? rows[0] || null : rows || null });
  } catch (error) {
    res.status(error.status || 502).json({ error: error.message });
  }
});

app.get('/learning/rules', async (_req, res) => {
  // Only vetted aggregate ad hosts are returned. No user history or URLs are
  // ever read from this endpoint, and no remote JavaScript is executed.
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return res.json({ configured: false, blockHosts: [] });
  try {
    const endpoint = `${SUPABASE_URL}/rest/v1/umpdl_learning?kind=eq.ad&down_votes=gte.${encodeURIComponent(LEARNING_MIN_BLOCK_VOTES)}&select=subject,up_votes,down_votes&order=down_votes.desc&limit=${LEARNING_MAX_RULES}`;
    const response = await fetch(endpoint, { headers: learningHeaders() });
    const text = await response.text();
    if (!response.ok) throw new Error(`Supabase learning ${response.status}: ${text.slice(0, 300)}`);
    const rows = text ? JSON.parse(text) : [];
    const blockHosts = (Array.isArray(rows) ? rows : [])
      .filter((row) => validLearningHost(row.subject) && Number(row.down_votes || 0) > Number(row.up_votes || 0))
      .map((row) => validLearningHost(row.subject));
    res.json({ configured: true, blockHosts, minVotes: LEARNING_MIN_BLOCK_VOTES });
  } catch (error) {
    res.status(502).json({ error: error.message, blockHosts: [] });
  }
});

app.get('/health', (_req, res) => res.json({ ok: true, service: 'umpdl-header-proxy' }));

// ========== HYBRID AI IFRAME CLASSIFIER ==========
// The bookmarklet never ships an LLM key. Instead it POSTs the shortlist of
// iframe URLs to POST /classify on this server. The server reads its own env
// vars. Supported providers (priority order):
//   1. Google Gemini  -> GEMINI_API_KEY (GEMINI_MODEL default gemini-2.0-flash)
//   2. OpenAI-compatible -> OPENAI_API_KEY (AI_BASE_URL, AI_MODEL default gpt-4o-mini)
// If neither key is configured, the server returns { configured:false } and the
// bookmarklet keeps its local heuristic ranking.
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const AI_BASE_URL = (process.env.AI_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, '');
const AI_MODEL = process.env.AI_MODEL || 'gpt-4o-mini';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
const GEMINI_BASE_URL = (process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta').replace(/\/+$/, '');

function classifySystemPrompt() {
  return [
    'Bạn là bộ phân loại iframe cho tool tải video. Đầu vào là một trang phim phát media qua iframe embed.',
    'Phân loại TỪNG iframe thành đúng MỘT nhãn: "PLAYER" (khả năng cao là iframe embed player video thật),',
    '"JUNK" (iframe quảng cáo, popup, tracker, casino/betting, analytics, pixel), hoặc "UNKNOWN".',
    'Dựa vào host, path, query, tên tham số (e/embed/player/stream/watch) và từ khóa.',
    'Chỉ trả về JSON thuần, dạng: {"results":[{"url":"...","verdict":"PLAYER|JUNK|UNKNOWN","reason":"ngắn gọn"}]}.'
  ].join(' ');
}

function parseResults(content) {
  const match = String(content || '').match(/\[\s*\{[\s\S]*\}\s*\]/);
  let results = [];
  if (match) {
    try { results = JSON.parse(match[0]); } catch (_) { results = []; }
  } else {
    try { results = JSON.parse(content); } catch (_) { results = []; }
  }
  return Array.isArray(results) ? results : [];
}

async function callGemini(userPrompt) {
  const resp = await fetch(
    `${GEMINI_BASE_URL}/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          { role: 'user', parts: [{ text: `${classifySystemPrompt()}\n\n${userPrompt}` }] }
        ],
        generationConfig: { temperature: 0 }
      }),
      signal: AbortSignal.timeout(25000)
    }
  );
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    const err = new Error(`Gemini ${resp.status}: ${text.slice(0, 200)}`);
    err.status = resp.status;
    throw err;
  }
  const data = await resp.json();
  const content = (data && data.candidates && data.candidates[0] && data.candidates[0].content &&
    data.candidates[0].content.parts && data.candidates[0].content.parts.map((p) => p.text || '').join('')) || '';
  return parseResults(content);
}

async function callOpenAI(userPrompt) {
  const resp = await fetch(`${AI_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: AI_MODEL,
      temperature: 0,
      messages: [
        { role: 'system', content: classifySystemPrompt() },
        { role: 'user', content: userPrompt }
      ]
    }),
    signal: AbortSignal.timeout(25000)
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    const err = new Error(`AI ${resp.status}: ${text.slice(0, 200)}`);
    err.status = resp.status;
    throw err;
  }
  const data = await resp.json();
  const content = (data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '';
  return parseResults(content);
}

app.post('/classify', async (req, res) => {
  if (!OPENAI_API_KEY && !GEMINI_API_KEY) return res.json({ configured: false, results: null });
  const body = req.body || {};
  const candidates = Array.isArray(body.candidates) ? body.candidates.slice(0, 25) : [];
  if (!candidates.length) return res.json({ configured: true, results: [] });
  const pageLine = `Trang: ${body.pageHost || ''} "${body.pageTitle || ''}" (${body.pageUrl || ''})`;
  const listText = candidates.map((c, i) => `${i + 1}. ${c.url} (heuristic score ${c.score}, ${c.verdict || 'UNKNOWN'})`).join('\n');
  const userPrompt = `${pageLine}\n\nDanh sách iframe:\n${listText}\n\nHãy trả verdict cho từng URL.`;

  try {
    // Gemini takes priority when configured (user's primary provider).
    const results = GEMINI_API_KEY ? await callGemini(userPrompt) : await callOpenAI(userPrompt);
    res.json({ configured: true, provider: GEMINI_API_KEY ? 'gemini' : 'openai', results });
  } catch (error) {
    console.error('[classify error]', error.message);
    // Fall back to the other provider if available.
    if (GEMINI_API_KEY && OPENAI_API_KEY) {
      try {
        const results = await callOpenAI(userPrompt);
        return res.json({ configured: true, provider: 'openai', results });
      } catch (e) {
        console.error('[classify fallback error]', e.message);
        return res.status(502).json({ configured: true, results: [], error: e.message });
      }
    }
    res.status(502).json({ configured: true, results: [], error: error.message });
  }
});

app.get('/userscript.js', (_req, res) => {
  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
  res.sendFile(path.join(__dirname, 'userscript', 'umpdl.user.js'));
});

app.get('/tampermonkey.user.js', (_req, res) => {
  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
  res.sendFile(path.join(__dirname, 'userscript', 'umpdl-tampermonkey.user.js'));
});

app.get('/bookmarklet.js', (_req, res) => {
  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.sendFile(path.join(__dirname, 'bookmarklet.js'));
});

// Optional TMDB metadata bridge. Its bearer token is a Render environment
// variable, so browser users never receive it.
app.get('/tmdb/search', async (req, res) => {
  const query = String(req.query.query || '').trim().slice(0, 160);
  if (!query) return res.status(400).json({ error: 'Thiếu query TMDB' });
  if (!TMDB_BEARER_TOKEN) return res.status(503).json({ error: 'TMDB chưa được cấu hình trên Render' });
  try {
    const tmdbUrl = 'https://api.themoviedb.org/3/search/multi?query=' + encodeURIComponent(query) + '&language=vi-VN&include_adult=false';
    const response = await fetch(tmdbUrl, { headers: { Authorization: `Bearer ${TMDB_BEARER_TOKEN}`, accept: 'application/json' }, signal: AbortSignal.timeout(15000) });
    const body = await response.text();
    if (!response.ok) return res.status(response.status).send(body);
    res.type('application/json').send(body);
  } catch (error) { res.status(502).json({ error: 'Không tìm được TMDB: ' + error.message }); }
});

app.get('/tmdb/:kind/:id', async (req, res) => {
  const kind = req.params.kind;
  const id = req.params.id;
  if (!['movie', 'tv'].includes(kind) || !/^\d+$/.test(id)) return res.status(400).json({ error: 'TMDB path không hợp lệ' });
  if (!TMDB_BEARER_TOKEN) return res.status(503).json({ error: 'TMDB chưa được cấu hình trên Render' });
  try {
    const tmdbUrl = `https://api.themoviedb.org/3/${kind}/${id}?append_to_response=credits,images&include_image_language=vi,en,null&language=vi-VN`;
    const response = await fetch(tmdbUrl, { headers: { Authorization: `Bearer ${TMDB_BEARER_TOKEN}`, accept: 'application/json' }, signal: AbortSignal.timeout(15000) });
    const body = await response.text();
    if (!response.ok) return res.status(response.status).send(body);
    res.type('application/json').send(body);
  } catch (error) { res.status(502).json({ error: 'Không lấy được TMDB: ' + error.message }); }
});

app.get('/proxy', async (req, res) => {
  if (!authorized(req)) return res.status(401).json({ error: 'Thiếu hoặc sai PROXY_KEY' });
  let target;
  try { target = parseTarget(req.query.url); }
  catch (error) { return res.status(400).json({ error: error.message }); }

  try {
    // Tokens captured from the original browser player are passed to the
    // protected fMP4 init/segment host, not just the manifest URL.
    if (req.query.access_token && /(?:^|\.)iw01\.xyz$/i.test(target.hostname) && !target.searchParams.has('access_token')) {
      target.searchParams.set('access_token', req.query.access_token);
    }
    let source = await fetchSource(target, req, req.query.referer);
    if (source.status === 403 && req.get('range')) {
      console.log(`[proxy retry] source=${target.host} retryWithoutRange=true`);
      source = await fetchSource(target, req, req.query.referer, true);
    }
    const sourceType = source.headers.get('content-type') || '';

    // This host returns each MPEG-TS segment as a PNG-looking wrapper with
    // the real transport stream appended after the PNG IEND/padding. Buffer
    // only PNG responses so normal MP4/TS proxying remains streaming.
    if (isPng(sourceType) && source.body) {
      const wrapped = Buffer.from(await source.arrayBuffer());
      const offset = findMpegTsOffset(wrapped);
      res.status(source.status);
      forwardMediaHeaders(source, res);
      res.setHeader('Cache-Control', 'no-store');
      if (offset >= 0) {
        const segment = wrapped.subarray(offset);
        res.setHeader('Content-Type', 'video/mp2t');
        res.setHeader('Content-Length', String(segment.length));
        res.removeHeader('Content-Range');
        res.removeHeader('Accept-Ranges');
        console.log(`[proxy normalize] source=${target.host} type=${sourceType} offset=${offset} bytes=${wrapped.length}->${segment.length}`);
        return res.end(segment);
      }
      // Preserve a genuine PNG response if it does not contain an aligned
      // MPEG-TS payload; this keeps /proxy useful for non-HLS callers.
      return res.end(wrapped);
    }

    res.status(source.status);
    forwardMediaHeaders(source, res);
    // Prevent a conditional request to the source from turning into a body-less
    // 304 response for hls.js/native media loaders.
    res.setHeader('Cache-Control', 'no-store');
    if (!source.body) return res.end();
    Readable.fromWeb(source.body).on('error', () => res.destroy()).pipe(res);
  } catch (error) {
    console.error('[proxy error]', error.message);
    res.status(502).json({ error: 'Không lấy được nguồn', detail: error.message });
  }
});

app.get('/hls', async (req, res) => {
  if (!authorized(req)) return res.status(401).json({ error: 'Thiếu hoặc sai PROXY_KEY' });
  let target;
  try { target = parseTarget(req.query.url); }
  catch (error) { return res.status(400).json({ error: error.message }); }

  try {
    const source = await fetchSource(target, req, req.query.referer);
    const contentType = source.headers.get('content-type') || '';
    const text = await source.text();
    if (!source.ok) return res.status(source.status).send(text.slice(0, 1000));
    if (!text.includes('#EXTM3U') && !contentType.includes('mpegurl')) {
      return res.status(415).json({ error: 'Nguồn không phải HLS playlist' });
    }
    const rewritten = rewritePlaylist(text, target, req, req.query.referer);
    const rewrittenLinks = (rewritten.match(/https?:\/\/[^\s"']+/g) || []).length;
    const proxyRouteCount = (rewritten.match(/\/proxy\?/g) || []).length;
    const hlsRouteCount = (rewritten.match(/\/hls\?/g) || []).length;
    console.log(`[hls playlist] type=${contentType || '-'} bytes=${text.length} extm3u=${text.includes('#EXTM3U')} links=${rewrittenLinks} proxyRoutes=${proxyRouteCount} hlsRoutes=${hlsRouteCount}`);
    res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
    res.setHeader('Cache-Control', 'no-store');
    res.send(rewritten);
  } catch (error) {
    console.error('[hls error]', error.message);
    res.status(502).json({ error: 'Không đọc được HLS playlist', detail: error.message });
  }
});

app.use((_req, res) => res.status(404).json({ error: 'Not found' }));
app.listen(PORT, () => console.log(`UMP DL proxy listening on ${PORT}`));
