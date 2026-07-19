const express = require('express');
const { Readable } = require('node:stream');

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
  if (ALLOWED_HOSTS.size && !ALLOWED_HOSTS.has(target.hostname.toLowerCase())) {
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
    'accept': req.get('accept') || '*/*'
  };
  const range = req.get('range');
  if (range) headers.range = range;
  const referer = refererOverride || req.query.referer || process.env.DEFAULT_REFERER;
  if (referer) headers.referer = referer;
  const origin = req.query.origin || process.env.DEFAULT_ORIGIN;
  if (origin) headers.origin = origin;
  if (req.query.cookie) headers.cookie = req.query.cookie;
  return headers;
}

async function fetchSource(target, req, referer) {
  return fetch(target, {
    headers: requestHeaders(req, target, referer),
    redirect: 'follow',
    signal: AbortSignal.timeout(30000)
  });
}

function forwardMediaHeaders(source, res) {
  for (const name of ['content-type', 'content-length', 'content-range', 'accept-ranges', 'etag', 'last-modified', 'cache-control']) {
    const value = source.headers.get(name);
    if (value) res.setHeader(name, value);
  }
}

function proxyUrl(target, req, referer) {
  const params = new URLSearchParams({ url: target.toString() });
  if (referer) params.set('referer', referer);
  if (req.query.origin) params.set('origin', req.query.origin);
  if (PROXY_KEY) params.set('key', PROXY_KEY);
  return `${req.protocol}://${req.get('host')}/proxy?${params.toString()}`;
}

function rewritePlaylist(text, playlistUrl, req, referer) {
  return text.split(/\r?\n/).map((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      return line.replace(/URI="([^"]+)"/g, (_, uri) => {
        try { return `URI="${proxyUrl(new URL(uri, playlistUrl), req, referer)}"`; }
        catch (_) { return `URI="${uri}"`; }
      });
    }
    try { return proxyUrl(new URL(trimmed, playlistUrl), req, referer); }
    catch (_) { return line; }
  }).join('\n');
}

app.get('/health', (_req, res) => res.json({ ok: true, service: 'umpdl-header-proxy' }));

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
    res.status(502).json({ error: 'Không đọc được HLS playlist', detail: error.message });
  }
});

app.use((_req, res) => res.status(404).json({ error: 'Not found' }));
app.listen(PORT, () => console.log(`UMP DL proxy listening on ${PORT}`));
