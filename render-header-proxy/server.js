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
    // Tokens captured from the original browser player are passed to the
    // protected fMP4 init/segment host, not just the manifest URL.
    if (req.query.access_token && /(?:^|\.)iw01\.xyz$/i.test(target.hostname) && !target.searchParams.has('access_token')) {
      target.searchParams.set('access_token', req.query.access_token);
    }
    const source = await fetchSource(target, req, req.query.referer);
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
