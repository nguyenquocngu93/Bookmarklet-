const express = require('express');
const path = require('node:path');
const { Agent } = require('undici');
const { Readable } = require('node:stream');

const insecureDispatcher = new Agent({ connect: { rejectUnauthorized: false } });

const app = express();
const PORT = process.env.PORT || 10000;
const PROXY_KEY = process.env.PROXY_KEY || '';
const ALLOWED_HOSTS = new Set(
  (process.env.ALLOWED_HOSTS || '')
    .split(',')
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean)
);
const MAX_REDIRECTS = Number(process.env.MAX_REDIRECTS || 5);

app.disable('x-powered-by');
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

function requestHeaders(req, target, refererOverride) {
  const headers = {
    'user-agent': req.query.ua || process.env.DEFAULT_USER_AGENT ||
      'Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36',
    'accept': req.get('accept') || '*/*',
    'accept-encoding': 'identity'
  };
  const range = req.get('range');
  if (range) headers.range = range;
  for (const name of ['if-range', 'if-none-match', 'if-modified-since']) {
    const value = req.get(name);
    if (value) headers[name] = value;
  }
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

async function fetchSource(target, req, referer) {
  let current = target;
  for (let attempt = 0; attempt <= MAX_REDIRECTS; attempt++) {
    const response = await fetch(current, {
      headers: requestHeaders(req, current, referer),
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
  for (const name of ['content-type', 'content-length', 'content-range', 'accept-ranges', 'etag', 'last-modified', 'cache-control']) {
    const value = source.headers.get(name);
    if (value) res.setHeader(name, value);
  }
}

function proxyUrl(target, req, referer, isPlaylist) {
  const params = new URLSearchParams({ url: target.toString() });
  if (referer) params.set('referer', referer);
  if (req.query.origin) params.set('origin', req.query.origin);
  if (PROXY_KEY) params.set('key', PROXY_KEY);
  const endpoint = isPlaylist ? '/hls' : '/proxy';
  return `${req.protocol}://${req.get('host')}${endpoint}?${params.toString()}`;
}

function looksLikePlaylist(url) {
  return /(?:\.m3u8|m3u8)(?:$|[?#])/i.test(url);
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
          const target = new URL(uri, playlistUrl);
          const isPlaylist = expectingVariantPlaylist || looksLikePlaylist(target.toString());
          return `URI="${proxyUrl(target, req, referer, isPlaylist)}"`;
        } catch (_) { return `URI="${uri}"`; }
      });
    }

    try {
      const target = new URL(trimmed, playlistUrl);
      const isPlaylist = expectingVariantPlaylist || looksLikePlaylist(target.toString());
      expectingVariantPlaylist = false;
      return proxyUrl(target, req, referer, isPlaylist);
    } catch (_) { return line; }
  }).join('\n');
}

app.get('/health', (_req, res) => res.json({ ok: true, service: 'umpdl-header-proxy' }));

app.get('/bookmarklet.js', (_req, res) => {
  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.sendFile(path.join(__dirname, 'bookmarklet.js'));
});

app.get('/proxy', async (req, res) => {
  if (!authorized(req)) return res.status(401).json({ error: 'Thiếu hoặc sai PROXY_KEY' });
  let target;
  try { target = parseTarget(req.query.url); }
  catch (error) { return res.status(400).json({ error: error.message }); }

  try {
    const source = await fetchSource(target, req, req.query.referer);
    res.status(source.status);
    forwardMediaHeaders(source, res);
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
    res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
    res.setHeader('Cache-Control', 'no-store');
    res.send(rewritePlaylist(text, target, req, req.query.referer));
  } catch (error) {
    console.error('[hls error]', error.message);
    res.status(502).json({ error: 'Không đọc được HLS playlist', detail: error.message });
  }
});

app.use((_req, res) => res.status(404).json({ error: 'Not found' }));
app.listen(PORT, () => console.log(`UMP DL proxy listening on ${PORT}`));
