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
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, DELETE, OPTIONS');
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
    res.json(rows && rows[0] ? rows[0] : { profile_id: profileId, payload: {}, updated_at: null });
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
      payload: req.body,
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

app.get('/health', (_req, res) => res.json({ ok: true, service: 'umpdl-header-proxy' }));

app.get('/player', (_req, res) => {
  // Lightweight standalone player. The source is kept in location.hash so it
  // is not sent as a query parameter to Render logs.
  res.type('html').set('Cache-Control', 'no-store').send(`<!doctype html>
<html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>UMP DL Player</title>
<style>
:root{color-scheme:light;font-family:system-ui,-apple-system,Segoe UI,sans-serif;background:#f2faf8;color:#123c38}*{box-sizing:border-box}body{margin:0;min-height:100vh;background:radial-gradient(circle at 10% 0,#ccfbf1,transparent 38%),linear-gradient(145deg,#f2faf8,#ecfeff);display:flex;justify-content:center;padding:18px}.shell{width:min(100%,900px);margin:auto;background:rgba(255,255,255,.86);border:1px solid rgba(15,118,110,.25);border-radius:26px;box-shadow:0 18px 50px rgba(15,118,110,.16);overflow:hidden}.head{display:flex;align-items:center;gap:12px;padding:15px 18px;border-bottom:1px solid rgba(15,118,110,.18);background:linear-gradient(135deg,rgba(255,255,255,.95),rgba(204,251,241,.55))}.dot{width:10px;height:10px;border-radius:50%;background:#0f766e;box-shadow:0 0 0 5px rgba(20,184,166,.14)}h1{font-size:17px;margin:0;color:#0f766e}small{display:block;color:#365f59;margin-top:3px}.stage{background:#092522;aspect-ratio:16/9;display:flex;align-items:center;justify-content:center}video{width:100%;height:100%;display:block;background:#092522;object-fit:contain}.controls{display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:12px 16px}.controls button,.controls select{border:1px solid rgba(15,118,110,.25);border-radius:12px;padding:9px 11px;background:#fff;color:#0f5f59;font-weight:700}.status{padding:0 16px 15px;color:#52736e;font-size:12px;word-break:break-word}.error{color:#b4233d}
</style></head><body><main class="shell"><header class="head"><span class="dot"></span><div><h1>UMP DL Player</h1><small id="meta">Đang chuẩn bị nguồn HLS…</small></div></header><section class="stage"><video id="video" controls playsinline></video></section><div class="controls"><select id="quality" aria-label="Chất lượng"><option value="-1">Tự động</option></select><button id="full">Toàn màn hình</button><button id="reload">Tải lại</button></div><div class="status" id="status">Đang tải player…</div></main><script src="https://cdn.jsdelivr.net/npm/hls.js@latest"></script><script>
(function(){'use strict';var video=document.getElementById('video'),quality=document.getElementById('quality'),status=document.getElementById('status'),meta=document.getElementById('meta'),hls=null,source='';
function setStatus(text,error){status.textContent=text;status.className='status'+(error?' error':'');}
try{var raw=decodeURIComponent(location.hash.slice(1));var cfg=JSON.parse(raw);source=cfg.src||'';meta.textContent=(cfg.type||'M3U8')+' · tab riêng';}catch(e){setStatus('Không đọc được cấu hình player.',true);return;}
var bridgeBlobUrl='';
window.addEventListener('message',function(e){
  if(!e.data)return;
  if(e.data.type==='umpdl-manifest'&&e.data.text){
    try{if(bridgeBlobUrl)URL.revokeObjectURL(bridgeBlobUrl);bridgeBlobUrl=URL.createObjectURL(new Blob([e.data.text],{type:'application/vnd.apple.mpegurl'}));source=bridgeBlobUrl;load();setStatus('Đang phát manifest bridge từ trang mẹ…');}catch(err){setStatus('Không tạo được manifest Blob.',true);}
  }else if(e.data.type==='umpdl-session-source'&&e.data.src){source=e.data.src;load();}
});
try{if(window.opener)window.opener.postMessage({type:'umpdl-player-ready'},'*');}catch(e){}
if(!source){setStatus('Thiếu nguồn HLS.',true);return;}
function load(){if(hls){hls.destroy();hls=null;}quality.innerHTML='<option value="-1">Tự động</option>';setStatus('Đang tải HLS…');if(window.Hls&&Hls.isSupported()){hls=new Hls({enableWorker:true,lowLatencyMode:false,backBufferLength:30,maxBufferLength:30});hls.on(Hls.Events.MANIFEST_PARSED,function(){var levels=hls.levels||[];levels.forEach(function(l,i){var o=document.createElement('option');o.value=i;o.textContent=(l.height?l.height+'p':'Level '+(i+1))+(l.bitrate?' · '+Math.round(l.bitrate/1000)+'kbps':'');quality.appendChild(o);});setStatus('Đã tải '+levels.length+' mức chất lượng.');});hls.on(Hls.Events.ERROR,function(_,d){if(d&&d.fatal)setStatus('HLS lỗi: '+(d.details||d.type||'không xác định'),true);});hls.loadSource(source);hls.attachMedia(video);}else if(video.canPlayType('application/vnd.apple.mpegurl')){video.src=source;setStatus('Đang dùng HLS native.');}else setStatus('Trình duyệt không hỗ trợ HLS.',true);}
quality.onchange=function(){if(!hls)return;if(this.value==='-1'){hls.currentLevel=-1;setStatus('Đã bật chất lượng tự động.');}else{hls.currentLevel=Number(this.value);hls.nextLevel=Number(this.value);setStatus('Đã khóa '+this.options[this.selectedIndex].text+'.');}};document.getElementById('full').onclick=function(){var x=document.querySelector('.stage');(x.requestFullscreen||x.webkitRequestFullscreen).call(x).catch(function(){});};document.getElementById('reload').onclick=load;load();})();
</script></body></html>`);
});

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
