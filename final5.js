/**
 * Universal Video Downloader V5.1 – Dark Liquid Edition (Final Fix)
 * - UI hoàn toàn độc lập, không bị web ảnh hưởng
 * - Fullscreen hoạt động tốt
 * - Tab hiển thị đầy đủ chữ
 * - Trình phát HLS tích hợp ngay trong panel (không mở tab mới)
 * - Hỗ trợ blob (hiển thị cảnh báo)
 * - Thêm ffplay/mpv để xem trực tiếp
 * Author: nguyenquocngu93
 */
(function() {
'use strict';

// ========== INIT ==========
var old = document.getElementById('__uvd__');
if (old) old.remove();
var minBtn = document.getElementById('__uvd_min_float__');
if (minBtn) minBtn.remove();

var STORAGE_KEY = 'uvd_data_v50';
var storage = {
  get: function() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; }
    catch(e) { return {}; }
  },
  set: function(data) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); }
    catch(e) {}
  }
};

var data = storage.get();
data.favorites = data.favorites || [];
data.siteProfiles = data.siteProfiles || {};
data.history = data.history || [];

// Profile mặc định
if (!data.userProfile || !data.userProfile.name) {
  data.userProfile = {
    avatar: 'https://img.upanh.moe/7x24tS9W/a3a68f4d9e99.webp',
    name: 'Nguyễn Quốc Ngự',
    bio: 'Thích code và video 📹'
  };
}
data.userProfile = data.userProfile || { avatar: '', name: '', bio: '' };

var defaultProfiles = {
  'videoplay.us': { referer: 'https://videoplay.us/', userAgent: '' },
  'streamtape.com': { referer: 'https://streamtape.com/', userAgent: '' },
  'ok.ru': { referer: 'https://ok.ru/', userAgent: '' },
  'fembed.com': { referer: 'https://fembed.com/', userAgent: '' },
  'mp4upload.com': { referer: 'https://mp4upload.com/', userAgent: '' }
};

var host = location.hostname.replace('www.', '');
var profile = data.siteProfiles[host] || defaultProfiles[host] || {
  referer: location.origin + '/',
  origin: location.origin,
  userAgent: navigator.userAgent
};

var pageInfo = {
  title: (document.title || 'video').replace(/[^\w\s\u00C0-\u1EF9]/g, '').substring(0, 60).trim() || 'video',
  url: location.href,
  host: host,
  referer: profile.referer,
  origin: location.origin,
  userAgent: profile.userAgent || navigator.userAgent
};

// ========== URL DETECTION ==========
var urls = new Map();
var patterns = [
  { re: /https?:\/\/[^\s"'<>()\\]+\.m3u8[^\s"'<>()\\]*/gi, type: 'M3U8', priority: 1 },
  { re: /https?:\/\/[^\s"'<>()\\]+\.mpd[^\s"'<>()\\]*/gi, type: 'MPD', priority: 2 },
  { re: /https?:\/\/[^\s"'<>()\\]+\.mp4[^\s"'<>()\\]*/gi, type: 'MP4', priority: 3 },
  { re: /https?:\/\/[^\s"'<>()\\]+\.webm[^\s"'<>()\\]*/gi, type: 'WEBM', priority: 4 },
  { re: /https?:\/\/[^\s"'<>()\\]+\.mkv[^\s"'<>()\\]*/gi, type: 'MKV', priority: 5 },
  { re: /https?:\/\/[^\s"'<>()\\]+\.flv[^\s"'<>()\\]*/gi, type: 'FLV', priority: 6 },
  { re: /https?:\/\/[^\s"'<>()\\]+\.ts[^\s"'<>()\\]*/gi, type: 'TS', priority: 7 },
  { re: /blob:https?:\/\/[^\s"'<>()\\]+/gi, type: 'BLOB', priority: 0 }
];

function findUrls(text, source) {
  if (!text || typeof text !== 'string') return;
  patterns.forEach(function(p) {
    var matches = text.match(p.re);
    if (matches) {
      matches.forEach(function(u) {
        u = u.replace(/\\u002F/g, '/').replace(/\\\//g, '/').replace(/&amp;/g, '&').replace(/\\"/g, '');
        if (!urls.has(u) || urls.get(u).priority > p.priority) {
          urls.set(u, { type: p.type, source: source, priority: p.priority, timestamp: Date.now() });
        }
      });
    }
  });
}

function scan(doc, src) {
  try {
    doc.querySelectorAll('video, source, audio').forEach(function(v) {
      if (v.src) findUrls(v.src, src + ':element');
      if (v.currentSrc) findUrls(v.currentSrc, src + ':current');
    });
    doc.querySelectorAll('script').forEach(function(s) {
      findUrls(s.textContent, src + ':script');
    });
    findUrls(doc.documentElement.outerHTML, src + ':html');
    doc.querySelectorAll('iframe').forEach(function(i, idx) {
      if (i.src) urls.set(i.src, { type: 'IFRAME', source: 'iframe#' + idx, priority: 99, timestamp: Date.now() });
      try { if (i.contentDocument) scan(i.contentDocument, 'iframe#' + idx); }
      catch(e) {}
    });
  } catch(e) {}
}

// ========== LIVE MONITORING ==========
var originalFetch = window.fetch;
var originalXHROpen = XMLHttpRequest.prototype.open;

function installMonitor() {
  window.fetch = function() {
    var url = arguments[0];
    if (typeof url === 'string') findUrls(url, 'fetch:live');
    else if (url && url.url) findUrls(url.url, 'fetch:live');
    return originalFetch.apply(this, arguments);
  };
  XMLHttpRequest.prototype.open = function(method, url) {
    if (url) findUrls(url, 'xhr:live');
    return originalXHROpen.apply(this, arguments);
  };
}

function stopMonitor() {
  window.fetch = originalFetch;
  XMLHttpRequest.prototype.open = originalXHROpen;
}

scan(document, 'main');
try { performance.getEntriesByType('resource').forEach(function(e) { findUrls(e.name, 'network:perf'); }); } catch(e) {}
installMonitor();

// ========== M3U8 MASTER PARSER ==========
function parseM3U8Master(url, callback) {
  if (url.startsWith('blob:')) { callback(null); return; }
  fetch(url, { headers: { 'Referer': pageInfo.referer } })
  .then(function(r) { return r.text(); })
  .then(function(text) {
    if (!text.includes('#EXT-X-STREAM-INF')) { callback(null); return; }
    var qualities = [];
    var lines = text.split('\n');
    for (var i = 0; i < lines.length; i++) {
      if (lines[i].startsWith('#EXT-X-STREAM-INF')) {
        var info = lines[i];
        var nextLine = (lines[i + 1] || '').trim();
        if (nextLine && !nextLine.startsWith('#')) {
          var resolution = (info.match(/RESOLUTION=(\d+x\d+)/) || [])[1] || 'unknown';
          var bandwidth = parseInt((info.match(/BANDWIDTH=(\d+)/) || [])[1] || 0);
          var codecs = (info.match(/CODECS="([^"]+)"/) || [])[1] || '';
          var quality = resolution.split('x')[1] || bandwidth;
          var qualityLabel = resolution === 'unknown' ? Math.round(bandwidth/1000) + 'kbps' : quality + 'p';
          var streamUrl = nextLine;
          if (!streamUrl.startsWith('http')) {
            var baseUrl = url.substring(0, url.lastIndexOf('/') + 1);
            streamUrl = baseUrl + streamUrl;
          }
          qualities.push({ label: qualityLabel, resolution: resolution, bandwidth: bandwidth, codecs: codecs, url: streamUrl });
        }
      }
    }
    qualities.sort(function(a, b) { return (parseInt(b.resolution.split('x')[1]) || 0) - (parseInt(a.resolution.split('x')[1]) || 0); });
    callback(qualities);
  }).catch(function(e) { console.error(e); callback(null); });
}

// ========== COMMANDS ==========
function makeCommands(url, type, title) {
  var t = title;
  var ext = type.toLowerCase() === 'iframe' ? 'mp4' : (type === 'BLOB' ? 'blob' : type.toLowerCase());
  var ref = pageInfo.referer;
  var origin = pageInfo.origin;
  var ua = pageInfo.userAgent;

  var base = {
    'yt-dlp': { label: 'yt-dlp (cơ bản)', cmd: 'yt-dlp --referer "' + ref + '" -o "' + t + '.%(ext)s" "' + url + '"' },
    'yt-dlp-bypass': { label: 'yt-dlp (bypass)', cmd: 'yt-dlp --force-ipv4 --no-check-certificate --user-agent "' + ua + '" --referer "' + ref + '" --add-header "Origin: ' + origin + '" -f "bv*+ba/best" --merge-output-format mp4 -o "' + t + '.%(ext)s" "' + url + '"' },
    'yt-dlp-aria': { label: 'yt-dlp + aria2', cmd: 'yt-dlp --referer "' + ref + '" --downloader aria2c -o "' + t + '.%(ext)s" "' + url + '"' },
    'ffmpeg': { label: 'FFmpeg (tải)', cmd: 'ffmpeg -headers "Referer: ' + ref + '\\r\\nOrigin: ' + origin + '" -i "' + url + '" -c copy "' + t + '.mp4"' },
    'ffplay': { label: 'FFplay (xem trực tiếp)', cmd: 'ffplay -headers "Referer: ' + ref + '\\r\\nOrigin: ' + origin + '" -i "' + url + '"' },
    'mpv': { label: 'MPV (xem trực tiếp)', cmd: 'mpv --referer="' + ref + '" --user-agent="' + ua + '" "' + url + '"' },
    'curl': { label: 'cURL (tải)', cmd: 'curl -H "Referer: ' + ref + '" -o "' + t + '.' + ext + '" "' + url + '"' }
  };

  if (type === 'BLOB') {
    return {
      'warning': { label: '⚠️ Blob không tải trực tiếp', cmd: 'Mở DevTools → Network → tìm request gốc (m3u8/mp4) hoặc dùng yt-dlp thử.' },
      ...base
    };
  }
  return base;
}

// ========== UTILS ==========
function copy(text) {
  var ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove();
}

function toast(msg, color) {
  var el = document.createElement('div');
  el.textContent = msg;
  el.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);background:' + (color || '#6d8cff') + ';color:#fff;padding:12px 24px;border-radius:30px;z-index:2147483649;font:600 13px Segoe UI;box-shadow:0 4px 15px rgba(0,0,0,0.4);animation:uvdSlideIn 0.3s ease;';
  document.body.appendChild(el);
  setTimeout(function() { el.remove(); }, 2500);
}

function shareUrl(url) {
  if (navigator.share) navigator.share({ title: pageInfo.title, url: url }).catch(function() { copy(url); toast('Đã sao chép'); });
  else { copy(url); toast('Đã sao chép – Mở YTDLnis'); }
}

function addToHistory(url, type) {
  data.history = data.history || [];
  data.history.unshift({ url, type, title: pageInfo.title, host: pageInfo.host, timestamp: Date.now() });
  if (data.history.length > 50) data.history = data.history.slice(0, 50);
  storage.set(data);
}

function isFavorite(url) { return data.favorites.some(function(f) { return f.url === url; }); }

function toggleFavorite(url, type) {
  var idx = data.favorites.findIndex(function(f) { return f.url === url; });
  if (idx >= 0) { data.favorites.splice(idx, 1); toast('Đã xóa khỏi yêu thích'); }
  else { data.favorites.unshift({ url, type, title: pageInfo.title, host: pageInfo.host, timestamp: Date.now() }); toast('Đã thêm vào yêu thích'); }
  storage.set(data);
  return isFavorite(url);
}

function exportData(format) {
  var arr = [...urls.entries()].map(function(e) { return { url: e[0], type: e[1].type, source: e[1].source, title: pageInfo.title }; });
  var content, mime, filename;
  if (format === 'json') {
    content = JSON.stringify({ page: pageInfo, streams: arr }, null, 2);
    mime = 'application/json'; filename = pageInfo.title + '_streams.json';
  } else if (format === 'csv') {
    content = 'Type,URL,Source,Title\n' + arr.map(a => a.type + ',"' + a.url + '",' + a.source + ',"' + a.title + '"').join('\n');
    mime = 'text/csv'; filename = pageInfo.title + '_streams.csv';
  } else if (format === 'm3u') {
    content = '#EXTM3U\n' + arr.filter(a => a.type !== 'IFRAME').map(a => '#EXTINF:-1,' + a.title + ' [' + a.type + ']\n' + a.url).join('\n');
    mime = 'audio/x-mpegurl'; filename = pageInfo.title + '.m3u';
  } else {
    content = arr.map(a => a.url).join('\n');
    mime = 'text/plain'; filename = pageInfo.title + '_urls.txt';
  }
  var blob = new Blob([content], { type: mime });
  var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename; a.click();
  URL.revokeObjectURL(a.href);
  toast('Đã xuất ' + format.toUpperCase());
}

// ========== RIPPLE EFFECT ==========
function addRipple(e) {
  var btn = e.currentTarget;
  var ripple = document.createElement('span');
  ripple.className = 'uvd-ripple';
  var rect = btn.getBoundingClientRect();
  var size = Math.max(rect.width, rect.height);
  ripple.style.width = ripple.style.height = size + 'px';
  ripple.style.left = (e.clientX - rect.left - size/2) + 'px';
  ripple.style.top = (e.clientY - rect.top - size/2) + 'px';
  btn.appendChild(ripple);
  ripple.addEventListener('animationend', function() { ripple.remove(); });
}

// ========== PLAYER TRONG PANEL (HLS) ==========
var activeHls = null;

function showPlayerInPanel(url, type) {
  var container = document.getElementById('__uvd_player_container__');
  var streamList = document.getElementById('__uvd_stream_list__');
  
  if (!container) return;
  
  // Ẩn stream list, hiện player
  streamList.style.display = 'none';
  container.style.display = 'flex';
  container.innerHTML = '';
  
  // Header player
  var header = document.createElement('div');
  header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:10px 14px;background:rgba(255,255,255,0.04);border-bottom:1px solid var(--uvd-border);';
  header.innerHTML = 
    '<div style="font-weight:600;color:var(--uvd-text);font-size:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">▶ ' + pageInfo.title + '</div>' +
    '<button class="uvd-btn uvd-btn-sm" id="__uvd_close_player__" style="background:var(--uvd-danger);border:none;color:#fff;padding:4px 12px;border-radius:8px;cursor:pointer;font-weight:600;font-size:12px;">✕ Đóng</button>';
  container.appendChild(header);
  
  // Video wrapper
  var wrapper = document.createElement('div');
  wrapper.id = '__uvd_video_wrapper__';
  wrapper.style.cssText = 'flex:1;background:#000;display:flex;align-items:center;justify-content:center;min-height:200px;position:relative;';
  
  var video = document.createElement('video');
  video.id = '__uvd_player_video__';
  video.style.cssText = 'width:100%;height:100%;max-height:70vh;display:block;object-fit:contain;';
  video.setAttribute('controls', '');
  video.setAttribute('playsinline', '');
  video.setAttribute('webkit-playsinline', '');
  video.setAttribute('crossorigin', 'anonymous');
  
  wrapper.appendChild(video);
  container.appendChild(wrapper);
  
  // Actions
  var actions = document.createElement('div');
  actions.style.cssText = 'display:flex;gap:8px;padding:10px 14px;background:rgba(255,255,255,0.04);border-top:1px solid var(--uvd-border);flex-wrap:wrap;';
  actions.innerHTML = 
    '<button class="uvd-btn uvd-btn-sm" id="__uvd_player_fullscreen__" style="background:rgba(109,140,255,0.2);border:1px solid var(--uvd-border);color:var(--uvd-text);padding:6px 14px;border-radius:8px;cursor:pointer;font-weight:600;font-size:12px;">⛶ Fullscreen</button>' +
    '<button class="uvd-btn uvd-btn-sm" id="__uvd_player_copy__" style="background:var(--uvd-glass-hi);border:1px solid var(--uvd-border);color:var(--uvd-text);padding:6px 14px;border-radius:8px;cursor:pointer;font-weight:600;font-size:12px;">📋 Copy URL</button>' +
    '<button class="uvd-btn uvd-btn-sm" id="__uvd_player_cmd__" style="background:rgba(245,158,11,0.2);border:1px solid var(--uvd-border);color:var(--uvd-text);padding:6px 14px;border-radius:8px;cursor:pointer;font-weight:600;font-size:12px;">⚡ Lệnh tải</button>';
  container.appendChild(actions);
  
  // Xử lý fullscreen
  document.getElementById('__uvd_player_fullscreen__').onclick = function() {
    var el = document.getElementById('__uvd_player_container__');
    if (el.requestFullscreen) el.requestFullscreen();
    else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
    else if (el.mozRequestFullScreen) el.mozRequestFullScreen();
    else if (el.msRequestFullscreen) el.msRequestFullscreen();
    else toast('Trình duyệt không hỗ trợ fullscreen');
  };
  
  document.getElementById('__uvd_player_copy__').onclick = function() { copy(url); toast('Đã sao chép URL!'); };
  
  document.getElementById('__uvd_player_cmd__').onclick = function() { showCommandPicker(url, type); };
  
  document.getElementById('__uvd_close_player__').onclick = function() {
    if (activeHls) { activeHls.destroy(); activeHls = null; }
    video.pause();
    video.src = '';
    container.style.display = 'none';
    streamList.style.display = 'block';
  };
  
  // Load video
  if (type === 'BLOB') {
    toast('Không thể phát blob URL', '#ff5d72');
    document.getElementById('__uvd_close_player__').click();
    return;
  }
  
  if (type === 'M3U8') {
    if (typeof Hls !== 'undefined' && Hls.isSupported()) {
      if (activeHls) activeHls.destroy();
      activeHls = new Hls();
      activeHls.loadSource(url);
      activeHls.attachMedia(video);
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = url;
    } else {
      // Tải HLS.js nếu chưa có
      var script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/hls.js@latest';
      script.onload = function() { showPlayerInPanel(url, type); };
      document.head.appendChild(script);
      return;
    }
  } else {
    video.src = url;
  }
}

// ========== CSS (hoàn toàn độc lập) ==========
if (document.getElementById('__uvd_css__')) document.getElementById('__uvd_css__').remove();
var style = document.createElement('style');
style.id = '__uvd_css__';
style.textContent = `
@keyframes uvdSlideIn{from{transform:translate(-50%,-20px);opacity:0}to{transform:translate(-50%,0);opacity:1}}
@keyframes uvdPulse{0%,100%{opacity:1;box-shadow:0 0 5px #6d8cff}50%{opacity:0.4;box-shadow:0 0 20px #6d8cff}}
@keyframes uvdScaleIn{from{opacity:0;transform:scale(0.94)}to{opacity:1;transform:scale(1)}}
@keyframes uvdRipple{to{transform:scale(4);opacity:0}}
@keyframes uvdCardEnter{from{opacity:0;transform:translateY(15px)}to{opacity:1;transform:translateY(0)}}
@keyframes uvdFloatBtnIn{from{transform:scale(0);opacity:0}to{transform:scale(1);opacity:1}}
@keyframes uvdBadgePop{from{opacity:0;transform:translateY(-4px) scale(0.9)}to{opacity:1;transform:translateY(0) scale(1)}}
@keyframes uvdLiquidDrift{0%{transform:translate(-6%,-4%) scale(1)}50%{transform:translate(4%,6%) scale(1.12)}100%{transform:translate(-6%,-4%) scale(1)}}

:root {
  --uvd-bg: rgba(3,4,8,0.97);
  --uvd-glass: rgba(12,14,20,0.92);
  --uvd-glass-hi: rgba(255,255,255,0.06);
  --uvd-border: rgba(255,255,255,0.08);
  --uvd-text: #f0f2ff;
  --uvd-text2: #9ca3bd;
  --uvd-text3: #5d6377;
  --uvd-accent: #6d8cff;
  --uvd-accent2: #b98bff;
  --uvd-danger: #ff5d72;
  --uvd-gold: #ffb84d;
  --uvd-card-bg: rgba(255,255,255,0.03);
  --uvd-fs-xs: 11px;
  --uvd-fs-sm: 12px;
  --uvd-fs-base: 13px;
  --uvd-fs-md: 14px;
  --uvd-fs-lg: 16px;
  --uvd-radius-sm: 10px;
  --uvd-radius-md: 14px;
  --uvd-radius-lg: 24px;
  --uvd-grad-liquid: linear-gradient(135deg, #6d8cff, #b98bff);
}

/* Panel chính - hoàn toàn độc lập */
.uvd-glass-panel {
  position: fixed !important;
  top: 12px !important;
  left: 12px !important;
  right: 12px !important;
  bottom: 12px !important;
  z-index: 2147483647 !important;
  display: flex !important;
  flex-direction: column !important;
  background: var(--uvd-glass) !important;
  backdrop-filter: blur(28px) saturate(130%) !important;
  -webkit-backdrop-filter: blur(28px) saturate(130%) !important;
  border: 1px solid var(--uvd-border) !important;
  border-radius: var(--uvd-radius-lg) !important;
  box-shadow: 0 20px 60px rgba(0,0,0,0.9), 0 0 0 1px rgba(255,255,255,0.03) inset !important;
  padding: 16px !important;
  overflow: hidden !important;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
  color: var(--uvd-text) !important;
  line-height: 1.4 !important;
  animation: uvdScaleIn 0.35s ease !important;
}

/* Tất cả phần tử con trong panel dùng chung font */
.uvd-glass-panel * {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
  box-sizing: border-box !important;
}

.uvd-panel-content {
  position: relative !important;
  z-index: 1 !important;
  display: flex !important;
  flex-direction: column !important;
  height: 100% !important;
  min-height: 0 !important;
}

.uvd-liquid-bg {
  position: absolute;
  inset: -30%;
  z-index: 0;
  pointer-events: none;
  background: radial-gradient(closest-side, rgba(109,140,255,0.10), transparent 70%) 15% 20% / 55% 55% no-repeat,
              radial-gradient(closest-side, rgba(185,139,255,0.08), transparent 70%) 85% 75% / 60% 60% no-repeat;
  filter: blur(50px);
  animation: uvdLiquidDrift 16s ease-in-out infinite;
}

@media (prefers-reduced-motion: reduce) { .uvd-liquid-bg { animation: none; } }

.uvd-overlay {
  position: fixed;
  inset: 0;
  background: rgba(2,3,6,0.92);
  backdrop-filter: blur(18px) saturate(120%);
  z-index: 2147483648;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  overflow-y: auto;
}

.uvd-overlay > div {
  max-width: 600px;
  width: 100%;
  background: var(--uvd-glass);
  backdrop-filter: blur(28px);
  border: 1px solid var(--uvd-border);
  border-radius: var(--uvd-radius-lg);
  padding: 20px;
  color: var(--uvd-text);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

.uvd-scroll::-webkit-scrollbar { width: 4px; }
.uvd-scroll::-webkit-scrollbar-thumb { background: var(--uvd-accent); border-radius: 4px; }
.uvd-scroll::-webkit-scrollbar-track { background: transparent; }

.uvd-btn {
  background: var(--uvd-glass-hi);
  border: 1px solid var(--uvd-border);
  color: var(--uvd-text);
  padding: 8px 16px;
  border-radius: var(--uvd-radius-md);
  font-weight: 600;
  font-size: var(--uvd-fs-base);
  cursor: pointer;
  transition: all 0.2s;
  backdrop-filter: blur(10px);
  text-align: center;
  position: relative;
  overflow: hidden;
  display: inline-block;
  box-shadow: 0 2px 8px rgba(0,0,0,0.3);
  line-height: 1.3;
}

.uvd-btn:hover {
  background: rgba(255,255,255,0.10);
  border-color: rgba(255,255,255,0.20);
  transform: translateY(-1px);
  box-shadow: 0 4px 14px rgba(0,0,0,0.4);
}

.uvd-btn:active { transform: scale(0.96); }

.uvd-btn-sm {
  padding: 6px 12px;
  font-size: var(--uvd-fs-sm);
  border-radius: var(--uvd-radius-sm);
}

.uvd-btn-primary {
  background: var(--uvd-grad-liquid);
  border-color: transparent;
  color: #fff;
  box-shadow: 0 4px 16px rgba(109,140,255,0.35);
}

.uvd-btn-primary:hover { filter: brightness(1.08); box-shadow: 0 6px 20px rgba(109,140,255,0.45); }

.uvd-btn-icon {
  background: var(--uvd-glass-hi);
  border: 1px solid var(--uvd-border);
  color: var(--uvd-text);
  width: 34px;
  height: 34px;
  border-radius: var(--uvd-radius-sm);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
  backdrop-filter: blur(10px);
  position: relative;
  overflow: hidden;
  box-shadow: 0 2px 8px rgba(0,0,0,0.3);
}

.uvd-btn-icon:hover { background: rgba(255,255,255,0.10); border-color: rgba(255,255,255,0.20); }
.uvd-btn-icon:active { transform: scale(0.92); }
.uvd-btn-icon span { display: block; }

.uvd-card {
  background: var(--uvd-card-bg);
  border: 1px solid var(--uvd-border);
  border-radius: var(--uvd-radius-md);
  padding: 14px;
  margin-bottom: 10px;
  font-size: var(--uvd-fs-base);
  backdrop-filter: blur(6px);
  box-shadow: 0 1px 0 rgba(255,255,255,0.04) inset;
  transition: transform 0.3s cubic-bezier(.4,0,.2,1), box-shadow 0.3s ease, background 0.3s ease, border-color 0.3s ease;
  animation: uvdCardEnter 0.4s ease both;
}

.uvd-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 10px 30px rgba(0,0,0,0.5), 0 0 0 1px rgba(109,140,255,0.20) inset;
  background: rgba(255,255,255,0.05);
  border-color: rgba(109,140,255,0.20);
}

.uvd-type-badge {
  display: inline-block;
  padding: 3px 12px;
  border-radius: var(--uvd-radius-sm);
  font-size: var(--uvd-fs-xs);
  font-weight: 700;
  background: linear-gradient(135deg, rgba(109,140,255,0.22), rgba(185,139,255,0.18));
  color: var(--uvd-accent);
  border: 1px solid rgba(109,140,255,0.25);
  letter-spacing: 0.03em;
}

.uvd-url-box {
  background: rgba(0,0,0,0.5);
  border-radius: var(--uvd-radius-sm);
  padding: 10px;
  font-family: 'Courier New', monospace;
  font-size: var(--uvd-fs-sm);
  word-break: break-all;
  color: var(--uvd-text2);
  max-height: 80px;
  overflow-y: auto;
  line-height: 1.5;
  border: 1px solid rgba(255,255,255,0.04);
}

.uvd-grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.uvd-grid-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 6px; }

.uvd-tabbar {
  position: relative;
  display: flex;
  gap: 2px;
  padding: 4px;
  background: rgba(255,255,255,0.04);
  border: 1px solid var(--uvd-border);
  border-radius: 999px;
  margin-bottom: 10px;
  flex-shrink: 0;
}

.uvd-tab-indicator {
  position: absolute;
  top: 4px;
  bottom: 4px;
  left: 4px;
  width: 0;
  border-radius: 999px;
  background: var(--uvd-grad-liquid);
  z-index: 0;
  box-shadow: 0 3px 12px rgba(109,140,255,0.45);
  transition: transform 0.4s cubic-bezier(.4,0,.2,1), width 0.4s cubic-bezier(.4,0,.2,1);
}

.uvd-tab {
  position: relative;
  z-index: 1;
  flex: 1;
  min-width: 0;
  background: transparent;
  border: none;
  color: var(--uvd-text2);
  font-weight: 600;
  font-size: var(--uvd-fs-sm);
  padding: 8px 6px;
  border-radius: 999px;
  cursor: pointer;
  transition: color 0.25s;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.uvd-tab.uvd-tab-active { color: #fff; text-shadow: 0 1px 4px rgba(0,0,0,0.3); }

.uvd-ripple {
  position: absolute;
  border-radius: 50%;
  background: rgba(255,255,255,0.4);
  transform: scale(0);
  animation: uvdRipple 0.6s ease-out;
}

#__uvd_min_float__ {
  position: fixed;
  bottom: 20px;
  right: 20px;
  width: 54px;
  height: 54px;
  border-radius: 50%;
  background: var(--uvd-grad-liquid);
  color: #fff;
  border: 1px solid rgba(255,255,255,0.25);
  box-shadow: 0 8px 24px rgba(0,0,0,0.6), 0 0 20px rgba(109,140,255,0.35);
  z-index: 2147483647;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: var(--uvd-fs-lg);
  transition: transform 0.3s;
  animation: uvdFloatBtnIn 0.3s ease;
  backdrop-filter: blur(10px);
}

#__uvd_min_float__:hover { transform: scale(1.1); }

#__uvd_player_container__ {
  display: none;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  background: var(--uvd-glass);
  border-radius: var(--uvd-radius-md);
  overflow: hidden;
  border: 1px solid var(--uvd-border);
}

#__uvd_video_wrapper__ {
  flex: 1;
  min-height: 200px;
  background: #000;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
}

#__uvd_video_wrapper__ video {
  width: 100%;
  height: 100%;
  max-height: 70vh;
  display: block;
  object-fit: contain;
}

#__uvd_player_container__:fullscreen {
  background: #000 !important;
  border: none !important;
  border-radius: 0 !important;
}

#__uvd_player_container__:fullscreen #__uvd_video_wrapper__ {
  min-height: 0;
  height: 100%;
}

#__uvd_player_container__:fullscreen video {
  max-height: 100vh;
}
`;
document.head.appendChild(style);

// ========== BUILD UI ==========
function buildUI() {
  var arr = [...urls.entries()].map(function(e) {
    return { url: e[0], type: e[1].type, source: e[1].source, priority: e[1].priority };
  }).sort(function(a, b) { return a.priority - b.priority; });

  var panel = document.getElementById('__uvd__');
  if (panel) panel.remove();
  
  panel = document.createElement('div');
  panel.id = '__uvd__';
  panel.className = 'uvd-glass-panel';
  
  var liquidBg = document.createElement('div');
  liquidBg.className = 'uvd-liquid-bg';
  panel.appendChild(liquidBg);
  
  var content = document.createElement('div');
  content.className = 'uvd-panel-content';
  panel.appendChild(content);
  
  // Header
  var header = document.createElement('div');
  header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding-bottom:10px;border-bottom:1px solid var(--uvd-border);margin-bottom:10px;flex-shrink:0;';
  header.innerHTML = 
    '<div style="display:flex;align-items:center;gap:8px;">' +
      '<span style="width:10px;height:10px;background:var(--uvd-grad-liquid);border-radius:50%;animation:uvdPulse 2s infinite;box-shadow:0 0 8px rgba(109,140,255,0.6);"></span>' +
      '<span style="font-weight:700;font-size:16px;color:var(--uvd-text);">Universal DL <span style="background:var(--uvd-grad-liquid);-webkit-background-clip:text;background-clip:text;color:transparent;">V5.1</span></span>' +
    '</div>' +
    '<div style="display:flex;gap:6px;">' +
      '<button class="uvd-btn-icon uvd-ripple-btn" id="__uvd_minimize__" title="Thu nhỏ"><span style="font-size:18px;">−</span></button>' +
      '<button class="uvd-btn-icon uvd-ripple-btn" id="__uvd_refresh__" title="Làm mới"><span style="font-size:16px;">↻</span></button>' +
      '<button class="uvd-btn-icon uvd-ripple-btn" id="__uvd_close__" title="Đóng"><span style="font-size:16px;">×</span></button>' +
    '</div>';
  content.appendChild(header);
  
  // Tabs
  var tabbar = document.createElement('div');
  tabbar.className = 'uvd-tabbar';
  var indicator = document.createElement('div');
  indicator.className = 'uvd-tab-indicator';
  indicator.id = '__uvd_tab_indicator__';
  tabbar.appendChild(indicator);
  
  var tabList = [
    { id: 'streams', text: 'Streams (' + arr.length + ')' },
    { id: 'favorites', text: 'Yêu thích (' + data.favorites.length + ')' },
    { id: 'history', text: 'Lịch sử (' + (data.history||[]).length + ')' },
    { id: 'settings', text: 'Cài đặt' }
  ];
  
  tabList.forEach(function(t) {
    var b = document.createElement('button');
    b.className = 'uvd-tab';
    b.dataset.tab = t.id;
    b.textContent = t.text;
    tabbar.appendChild(b);
  });
  content.appendChild(tabbar);
  
  function moveIndicatorTo(btn) {
    if (!btn) return;
    indicator.style.width = btn.offsetWidth + 'px';
    indicator.style.transform = 'translateX(' + btn.offsetLeft + 'px)';
  }
  
  // Info
  var info = document.createElement('div');
  info.style.cssText = 'margin-bottom:8px;font-size:12px;flex-shrink:0;';
  info.innerHTML = 
    '<span style="color:var(--uvd-text2);">Tên: </span>' +
    '<span id="__uvd_title__" style="color:var(--uvd-accent);text-decoration:underline;cursor:pointer;">' + pageInfo.title + '</span> ' +
    '<span style="color:var(--uvd-text3);">(sửa)</span><br>' +
    '<span style="color:var(--uvd-text2);">Referer: </span>' +
    '<span id="__uvd_referer__" style="color:var(--uvd-accent2);font-family:monospace;text-decoration:underline;cursor:pointer;font-size:11px;">' + pageInfo.referer + '</span>';
  content.appendChild(info);
  
  // Content area
  var contentWrapper = document.createElement('div');
  contentWrapper.style.cssText = 'flex:1;overflow:hidden;position:relative;min-height:0;';
  
  var streamList = document.createElement('div');
  streamList.id = '__uvd_stream_list__';
  streamList.style.cssText = 'overflow-y:auto;height:100%;padding-right:4px;';
  contentWrapper.appendChild(streamList);
  
  var playerContainer = document.createElement('div');
  playerContainer.id = '__uvd_player_container__';
  contentWrapper.appendChild(playerContainer);
  
  content.appendChild(contentWrapper);
  
  // Footer
  var footer = document.createElement('div');
  footer.style.cssText = 'display:flex;gap:6px;margin-top:10px;flex-wrap:wrap;flex-shrink:0;';
  ['TXT','JSON','M3U','CSV'].forEach(function(f) {
    var btn = document.createElement('button');
    btn.className = 'uvd-btn uvd-btn-sm uvd-ripple-btn';
    btn.textContent = f;
    btn.style.flex = '1 0 auto';
    btn.onclick = function() { exportData(f.toLowerCase()); };
    footer.appendChild(btn);
  });
  content.appendChild(footer);
  
  document.body.appendChild(panel);
  
  // Ripple
  document.querySelectorAll('.uvd-ripple-btn, .uvd-btn, .uvd-btn-icon, .uvd-tab').forEach(function(btn) {
    btn.addEventListener('click', addRipple);
  });
  
  var currentTab = 'streams';
  function renderTab(tabId) {
    currentTab = tabId;
    document.querySelectorAll('[data-tab]').forEach(function(t) {
      if (t.dataset.tab === tabId) {
        t.classList.add('uvd-tab-active');
        moveIndicatorTo(t);
      } else {
        t.classList.remove('uvd-tab-active');
      }
    });
    
    // Đóng player nếu đang mở
    if (activeHls) { activeHls.destroy(); activeHls = null; }
    var video = document.getElementById('__uvd_player_video__');
    if (video) { video.pause(); video.src = ''; }
    playerContainer.style.display = 'none';
    streamList.style.display = 'block';
    streamList.innerHTML = '';
    
    if (tabId === 'streams') renderStreams(streamList, arr);
    else if (tabId === 'favorites') renderFavorites(streamList);
    else if (tabId === 'history') renderHistory(streamList);
    else if (tabId === 'settings') renderSettings(streamList);
  }
  
  document.querySelectorAll('[data-tab]').forEach(function(t) {
    t.onclick = function() { renderTab(this.dataset.tab); };
  });
  
  renderTab('streams');
  
  window.addEventListener('resize', function() {
    moveIndicatorTo(document.querySelector('.uvd-tab.uvd-tab-active'));
  });
  
  document.getElementById('__uvd_close__').onclick = function() { stopMonitor(); panel.remove(); };
  document.getElementById('__uvd_refresh__').onclick = function() { buildUI(); toast('Đã làm mới'); };
  
  document.getElementById('__uvd_title__').onclick = function() {
    var newTitle = prompt('Tên file:', pageInfo.title);
    if (newTitle) { pageInfo.title = newTitle.replace(/[^\w\s\u00C0-\u1EF9.-]/g, '').substring(0,100); this.textContent = pageInfo.title; }
  };
  
  document.getElementById('__uvd_referer__').onclick = function() {
    var newRef = prompt('Referer:', pageInfo.referer);
    if (newRef) {
      pageInfo.referer = newRef;
      this.textContent = newRef;
      data.siteProfiles[pageInfo.host] = { referer: newRef, userAgent: pageInfo.userAgent };
      storage.set(data);
      toast('Đã lưu referer cho ' + pageInfo.host);
    }
  };
  
  document.getElementById('__uvd_minimize__').onclick = function() {
    panel.style.display = 'none';
    var floatBtn = document.getElementById('__uvd_min_float__');
    if (!floatBtn) {
      floatBtn = document.createElement('button');
      floatBtn.id = '__uvd_min_float__';
      floatBtn.textContent = 'U';
      floatBtn.title = 'Khôi phục Universal DL';
      floatBtn.onclick = function() { panel.style.display = 'flex'; floatBtn.remove(); };
      document.body.appendChild(floatBtn);
    }
  };
}

// ========== RENDER FUNCTIONS ==========
function renderStreams(container, arr) {
  if (!arr.length) {
    container.innerHTML = '<div style="text-align:center;padding:40px;color:var(--uvd-text2);">Không phát hiện stream nào.</div>';
    return;
  }
  
  arr.forEach(function(item, i) {
    var card = document.createElement('div');
    card.className = 'uvd-card';
    var fav = isFavorite(item.url);
    var isBlob = (item.type === 'BLOB');
    
    var actionsHtml = '';
    if (item.type === 'IFRAME') {
      actionsHtml = '<a href="' + item.url + '" class="uvd-btn uvd-btn-sm uvd-ripple-btn" style="text-align:center;grid-column:1/3;text-decoration:none;">Mở iframe</a>';
    } else if (isBlob) {
      actionsHtml = '<button class="uvd-btn uvd-btn-sm uvd-ripple-btn" data-action="cmd" data-url="' + encodeURIComponent(item.url) + '" data-type="' + item.type + '" style="grid-column:1/3;background:rgba(255,215,0,0.2);">⚠️ Lệnh (blob)</button>';
    } else if (item.type === 'M3U8') {
      actionsHtml = 
        '<button class="uvd-btn uvd-btn-sm uvd-ripple-btn" data-action="quality" data-url="' + encodeURIComponent(item.url) + '">Chất lượng</button>' +
        '<button class="uvd-btn uvd-btn-sm uvd-ripple-btn" data-action="play" data-url="' + encodeURIComponent(item.url) + '" data-type="' + item.type + '" style="background:rgba(109,140,255,0.2);">▶ Phát</button>' +
        '<button class="uvd-btn uvd-btn-sm uvd-ripple-btn" data-action="cmd" data-url="' + encodeURIComponent(item.url) + '" data-type="' + item.type + '" style="grid-column:1/3;">Lệnh tải</button>';
    } else {
      actionsHtml = 
        '<button class="uvd-btn uvd-btn-sm uvd-ripple-btn" data-action="play" data-url="' + encodeURIComponent(item.url) + '" data-type="' + item.type + '" style="background:rgba(109,140,255,0.2);">▶ Phát</button>' +
        '<button class="uvd-btn uvd-btn-sm uvd-ripple-btn" data-action="cmd" data-url="' + encodeURIComponent(item.url) + '" data-type="' + item.type + '">Lệnh tải</button>';
    }
    
    card.innerHTML = 
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">' +
        '<span class="uvd-type-badge">#' + (i+1) + ' ' + item.type + (isBlob ? ' ⚠️' : '') + '</span>' +
        '<button class="uvd-fav-btn uvd-ripple-btn" data-url="' + encodeURIComponent(item.url) + '" data-type="' + item.type + '" style="background:none;border:none;font-size:18px;cursor:pointer;color:' + (fav ? 'var(--uvd-gold)' : 'var(--uvd-text3)') + ';">' + (fav ? '★' : '☆') + '</button>' +
      '</div>' +
      '<div class="uvd-url-box">' + item.url + '</div>' +
      '<div class="uvd-grid-2" style="margin-top:6px;">' +
        '<button class="uvd-btn uvd-btn-sm uvd-ripple-btn" data-action="share" data-url="' + encodeURIComponent(item.url) + '" style="background:rgba(139,92,246,0.2);">Chia sẻ</button>' +
        '<button class="uvd-btn uvd-btn-sm uvd-ripple-btn" data-action="copy" data-url="' + encodeURIComponent(item.url) + '">Sao chép</button>' +
        actionsHtml +
      '</div>';
    
    container.appendChild(card);
  });
  
  container.querySelectorAll('.uvd-btn, .uvd-fav-btn').forEach(function(b) {
    b.addEventListener('click', addRipple);
  });
  
  container.querySelectorAll('.uvd-fav-btn').forEach(function(b) {
    b.onclick = function() {
      var u = decodeURIComponent(this.dataset.url);
      var isFav = toggleFavorite(u, this.dataset.type);
      this.textContent = isFav ? '★' : '☆';
      this.style.color = isFav ? 'var(--uvd-gold)' : 'var(--uvd-text3)';
    };
  });
  
  container.querySelectorAll('.uvd-btn[data-action]').forEach(function(b) {
    b.onclick = function() {
      var u = decodeURIComponent(this.dataset.url);
      var action = this.dataset.action;
      var t = this.dataset.type;
      addToHistory(u, t || 'IFRAME');
      
      if (action === 'share') shareUrl(u);
      else if (action === 'copy') { copy(u); toast('Đã sao chép!'); }
      else if (action === 'quality') showQualityPicker(u);
      else if (action === 'play') showPlayerInPanel(u, t);
      else if (action === 'cmd') showCommandPicker(u, t);
    };
  });
}

function showCommandPicker(url, type) {
  var cmds = makeCommands(url, type, pageInfo.title);
  var overlay = document.createElement('div');
  overlay.className = 'uvd-overlay';
  
  var html = '<div>';
  html += '<div style="font-weight:700;margin-bottom:12px;font-size:var(--uvd-fs-md);">Chọn lệnh tải</div>';
  html += '<div style="overflow-y:auto;max-height:60vh;">';
  
  Object.keys(cmds).forEach(function(k) {
    var c = cmds[k];
    html += '<div style="background:var(--uvd-card-bg);border:1px solid var(--uvd-border);border-radius:var(--uvd-radius-md);padding:14px;margin-bottom:10px;">' +
      '<div style="font-weight:600;color:var(--uvd-accent);font-size:var(--uvd-fs-base);">' + c.label + '</div>' +
      '<div style="background:rgba(0,0,0,0.5);border-radius:var(--uvd-radius-sm);padding:10px;font-family:monospace;font-size:var(--uvd-fs-sm);word-break:break-all;color:var(--uvd-text2);max-height:80px;overflow-y:auto;line-height:1.5;border:1px solid rgba(255,255,255,0.04);margin:6px 0;">' + c.cmd + '</div>' +
      '<button class="uvd-btn uvd-btn-sm cmd-select" data-cmd="' + encodeURIComponent(c.cmd) + '" style="width:100%;">Chỉnh sửa & Copy</button>' +
    '</div>';
  });
  
  html += '</div><button class="uvd-btn uvd-btn-sm close-overlay-btn" style="width:100%;margin-top:10px;background:var(--uvd-danger);">Đóng</button></div>';
  overlay.innerHTML = html;
  document.body.appendChild(overlay);
  
  overlay.querySelectorAll('.uvd-btn').forEach(function(b) { b.addEventListener('click', addRipple); });
  overlay.querySelector('.close-overlay-btn').onclick = function() { overlay.remove(); };
  
  overlay.querySelectorAll('.cmd-select').forEach(function(b) {
    b.onclick = function() {
      overlay.remove();
      showEditor(decodeURIComponent(this.dataset.cmd));
    };
  });
}

function showEditor(text) {
  var overlay = document.createElement('div');
  overlay.className = 'uvd-overlay';
  overlay.innerHTML = 
    '<div>' +
      '<div style="font-weight:700;margin-bottom:8px;font-size:var(--uvd-fs-md);">Chỉnh sửa lệnh</div>' +
      '<textarea style="width:100%;height:120px;background:rgba(0,0,0,0.5);border:1px solid var(--uvd-border);border-radius:var(--uvd-radius-sm);color:var(--uvd-text);padding:12px;font-family:monospace;font-size:var(--uvd-fs-sm);resize:vertical;">' + text + '</textarea>' +
      '<div class="uvd-grid-2" style="margin-top:12px;">' +
        '<button class="uvd-btn uvd-btn-sm" id="__uvd_ed_copy__">Sao chép</button>' +
        '<button class="uvd-btn uvd-btn-sm" id="__uvd_ed_share__" style="background:rgba(139,92,246,0.3);">Chia sẻ</button>' +
      '</div>' +
      '<button class="uvd-btn uvd-btn-sm close-editor" style="width:100%;margin-top:8px;background:var(--uvd-danger);">Đóng</button>' +
    '</div>';
  document.body.appendChild(overlay);
  
  overlay.querySelectorAll('.uvd-btn').forEach(function(b) { b.addEventListener('click', addRipple); });
  
  document.getElementById('__uvd_ed_copy__').onclick = function() {
    copy(overlay.querySelector('textarea').value);
    overlay.remove();
    toast('Đã sao chép!');
  };
  
  document.getElementById('__uvd_ed_share__').onclick = function() {
    shareUrl(overlay.querySelector('textarea').value);
    overlay.remove();
  };
  
  overlay.querySelector('.close-editor').onclick = function() { overlay.remove(); };
}

function showQualityPicker(url) {
  var overlay = document.createElement('div');
  overlay.className = 'uvd-overlay';
  overlay.innerHTML = '<div style="text-align:center;">Đang phân tích M3U8...</div>';
  document.body.appendChild(overlay);
  
  parseM3U8Master(url, function(qualities) {
    if (!qualities) {
      overlay.innerHTML = '<div><div style="color:var(--uvd-danger);font-weight:600;">Không phải Master Playlist</div><button class="uvd-btn uvd-btn-sm close-overlay-btn" style="margin-top:12px;background:var(--uvd-danger);width:100%;">Đóng</button></div>';
      overlay.querySelector('.close-overlay-btn').onclick = function() { overlay.remove(); };
      return;
    }
    
    var html = '<div>';
    html += '<div style="font-weight:700;margin-bottom:12px;font-size:var(--uvd-fs-md);">Chọn chất lượng (' + qualities.length + ')</div>';
    html += '<div style="overflow-y:auto;max-height:60vh;">';
    
    qualities.forEach(function(q) {
      html += '<div style="background:var(--uvd-card-bg);border:1px solid var(--uvd-border);border-radius:var(--uvd-radius-md);padding:14px;margin-bottom:10px;">' +
        '<b style="color:var(--uvd-text);">' + q.label + '</b> <span style="color:var(--uvd-text3);">' + Math.round(q.bandwidth/1000) + 'kbps</span>' +
        '<div class="uvd-grid-3" style="margin-top:8px;">' +
          '<button class="uvd-btn uvd-btn-sm q-act" data-url="' + encodeURIComponent(q.url) + '" data-action="share" style="background:rgba(139,92,246,0.2);">Chia sẻ</button>' +
          '<button class="uvd-btn uvd-btn-sm q-act" data-url="' + encodeURIComponent(q.url) + '" data-action="play" style="background:rgba(109,140,255,0.2);">▶ Phát</button>' +
          '<button class="uvd-btn uvd-btn-sm q-act" data-url="' + encodeURIComponent(q.url) + '" data-action="cmd">Lệnh</button>' +
        '</div>' +
      '</div>';
    });
    
    html += '</div><button class="uvd-btn uvd-btn-sm close-overlay-btn" style="width:100%;margin-top:10px;background:var(--uvd-danger);">Đóng</button></div>';
    overlay.innerHTML = html;
    
    overlay.querySelectorAll('.uvd-btn').forEach(function(b) { b.addEventListener('click', addRipple); });
    overlay.querySelector('.close-overlay-btn').onclick = function() { overlay.remove(); };
    
    overlay.querySelectorAll('.q-act').forEach(function(b) {
      b.onclick = function() {
        var u = decodeURIComponent(this.dataset.url);
        var action = this.dataset.action;
        overlay.remove();
        if (action === 'share') shareUrl(u);
        else if (action === 'play') showPlayerInPanel(u, 'M3U8');
        else showCommandPicker(u, 'M3U8');
      };
    });
  });
}

function renderFavorites(container) {
  if (!data.favorites.length) {
    container.innerHTML = '<div style="text-align:center;padding:30px;color:var(--uvd-text2);">Chưa có yêu thích.</div>';
    return;
  }
  
  data.favorites.forEach(function(f, i) {
    var card = document.createElement('div');
    card.className = 'uvd-card';
    card.innerHTML = 
      '<div style="display:flex;justify-content:space-between;"><b style="color:var(--uvd-gold);">★ '+ f.type + '</b><span style="font-size:11px;color:var(--uvd-text3);">' + new Date(f.timestamp).toLocaleDateString() + '</span></div>' +
      '<div style="margin:4px 0;color:var(--uvd-text);">' + f.title + '</div>' +
      '<div class="uvd-url-box">' + f.url + '</div>' +
      '<div class="uvd-grid-3">' +
        '<button class="uvd-btn uvd-btn-sm fav-act" data-url="' + encodeURIComponent(f.url) + '" data-action="share" style="background:rgba(139,92,246,0.2);">Chia sẻ</button>' +
        '<button class="uvd-btn uvd-btn-sm fav-act" data-url="' + encodeURIComponent(f.url) + '" data-action="copy">Copy</button>' +
        '<button class="uvd-btn uvd-btn-sm fav-del" data-idx="' + i + '" style="background:var(--uvd-danger);">Xóa</button>' +
      '</div>';
    container.appendChild(card);
  });
  
  container.querySelectorAll('.uvd-btn').forEach(function(b) { b.addEventListener('click', addRipple); });
  
  container.querySelectorAll('.fav-act').forEach(function(b) {
    b.onclick = function() {
      var u = decodeURIComponent(this.dataset.url);
      if (this.dataset.action === 'share') shareUrl(u);
      else { copy(u); toast('Đã sao chép!'); }
    };
  });
  
  container.querySelectorAll('.fav-del').forEach(function(b) {
    b.onclick = function() {
      data.favorites.splice(parseInt(this.dataset.idx), 1);
      storage.set(data);
      renderFavorites(container);
      toast('Đã xóa');
    };
  });
}

function renderHistory(container) {
  var hist = data.history || [];
  if (!hist.length) {
    container.innerHTML = '<div style="text-align:center;padding:30px;color:var(--uvd-text2);">Chưa có lịch sử.</div>';
    return;
  }
  
  container.innerHTML = '<button class="uvd-btn uvd-btn-sm" id="__uvd_clear_hist__" style="width:100%;margin-bottom:10px;background:var(--uvd-danger);">Xóa toàn bộ lịch sử</button>';
  document.getElementById('__uvd_clear_hist__').addEventListener('click', addRipple);
  document.getElementById('__uvd_clear_hist__').onclick = function() {
    if (confirm('Xóa toàn bộ lịch sử?')) { data.history = []; storage.set(data); renderHistory(container); }
  };
  
  hist.forEach(function(h) {
    var card = document.createElement('div');
    card.className = 'uvd-card';
    card.innerHTML = 
      '<div style="display:flex;justify-content:space-between;"><b style="color:var(--uvd-accent);">' + h.type + '</b><span style="font-size:11px;color:var(--uvd-text3);">' + new Date(h.timestamp).toLocaleString() + '</span></div>' +
      '<div style="color:var(--uvd-text);">' + h.title + '</div><div class="uvd-url-box">' + h.url + '</div>';
    container.appendChild(card);
  });
}

function renderSettings(container) {
  var profile = data.userProfile || {};
  var bookmarkletCode = 'javascript:(function(){var s=document.createElement("script");s.src="https://cdn.jsdelivr.net/gh/nguyenquocngu93/uvd@v5.1/uvd_v5.1-1.js";document.head.appendChild(s);})();';
  
  container.innerHTML = 
    '<div class="uvd-card"><div style="font-weight:600;color:var(--uvd-text);">Sao lưu & Khôi phục</div>' +
      '<button class="uvd-btn uvd-btn-sm" id="__uvd_backup__" style="width:100%;margin-bottom:6px;">Xuất dữ liệu</button>' +
      '<button class="uvd-btn uvd-btn-sm" id="__uvd_restore__" style="width:100%;margin-bottom:6px;">Nhập dữ liệu</button>' +
      '<button class="uvd-btn uvd-btn-sm" id="__uvd_reset__" style="width:100%;background:var(--uvd-danger);">Đặt lại tất cả</button></div>' +
    
    '<div class="uvd-card"><div style="font-weight:600;color:var(--uvd-text);">📖 Hướng dẫn sử dụng Bookmarklet</div>' +
      '<div style="font-size:12px;color:var(--uvd-text2);margin:6px 0;">Kéo bookmarklet dưới đây vào thanh bookmark của trình duyệt, sau đó nhấn vào bookmark khi đang xem video để mở công cụ.</div>' +
      '<div style="background:rgba(0,0,0,0.5);padding:8px;border-radius:6px;font-family:monospace;font-size:11px;word-break:break-all;border:1px solid var(--uvd-border);color:var(--uvd-text2);">' + bookmarkletCode + '</div>' +
      '<button class="uvd-btn uvd-btn-sm" id="__uvd_copy_bookmarklet__" style="margin-top:6px;">Sao chép bookmarklet</button></div>' +
    
    '<div class="uvd-card"><div style="font-weight:600;color:var(--uvd-text);">👤 Profile</div>' +
      '<div style="display:flex;align-items:center;gap:12px;margin:8px 0;">' +
        '<div style="width:48px;height:48px;border-radius:50%;background:var(--uvd-glass-hi);border:2px solid var(--uvd-border);display:flex;align-items:center;justify-content:center;font-size:20px;color:var(--uvd-text2);overflow:hidden;">' +
          (profile.avatar ? '<img src="' + profile.avatar + '" style="width:100%;height:100%;object-fit:cover;">' : '👤') +
        '</div>' +
        '<div style="flex:1;">' +
          '<input type="text" id="__uvd_profile_name__" placeholder="Tên của bạn" value="' + (profile.name || '') + '" style="width:100%;background:rgba(0,0,0,0.3);border:1px solid var(--uvd-border);border-radius:8px;padding:6px 10px;color:var(--uvd-text);margin-bottom:4px;">' +
          '<input type="text" id="__uvd_profile_avatar__" placeholder="URL ảnh đại diện" value="' + (profile.avatar || '') + '" style="width:100%;background:rgba(0,0,0,0.3);border:1px solid var(--uvd-border);border-radius:8px;padding:6px 10px;color:var(--uvd-text);">' +
        '</div>' +
      '</div>' +
      '<textarea id="__uvd_profile_bio__" placeholder="Giới thiệu ngắn" style="width:100%;background:rgba(0,0,0,0.3);border:1px solid var(--uvd-border);border-radius:8px;padding:6px 10px;color:var(--uvd-text);resize:vertical;min-height:50px;">' + (profile.bio || '') + '</textarea>' +
      '<button class="uvd-btn uvd-btn-sm" id="__uvd_save_profile__" style="margin-top:6px;background:var(--uvd-grad-liquid);color:#fff;">Lưu Profile</button></div>' +
    
    '<div class="uvd-card" style="margin-top:10px;color:var(--uvd-text2);font-size:var(--uvd-fs-sm);">Phiên bản 5.1 Dark Liquid · Toàn màn hình tự động xoay theo hướng video<br>Yêu thích: ' + data.favorites.length + ' · Lịch sử: ' + (data.history||[]).length + '</div>';
  
  container.querySelectorAll('.uvd-btn').forEach(function(b) { b.addEventListener('click', addRipple); });
  
  document.getElementById('__uvd_backup__').onclick = function() {
    var blob = new Blob([JSON.stringify(data)],{type:'application/json'});
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'uvd_backup.json'; a.click();
  };
  
  document.getElementById('__uvd_restore__').onclick = function() {
    var inp = document.createElement('input'); inp.type='file'; inp.accept='.json';
    inp.onchange = function(e) {
      var reader = new FileReader();
      reader.onload = function(ev) {
        try { data = Object.assign(data, JSON.parse(ev.target.result)); storage.set(data); toast('Đã nhập!'); buildUI(); }
        catch(ex) { toast('File không hợp lệ','#ff5d72'); }
      };
      reader.readAsText(e.target.files[0]);
    };
    inp.click();
  };
  
  document.getElementById('__uvd_reset__').onclick = function() {
    if (confirm('Xóa toàn bộ dữ liệu?')) { localStorage.removeItem(STORAGE_KEY); data = {favorites:[],siteProfiles:{},history:[],userProfile:{avatar:'https://img.upanh.moe/7x24tS9W/a3a68f4d9e99.webp',name:'Nguyễn Quốc Ngự',bio:'Thích code và video 📹'}}; buildUI(); }
  };
  
  document.getElementById('__uvd_copy_bookmarklet__').onclick = function() {
    copy(bookmarkletCode);
    toast('Đã sao chép bookmarklet!');
  };
  
  document.getElementById('__uvd_save_profile__').onclick = function() {
    var name = document.getElementById('__uvd_profile_name__').value.trim();
    var avatar = document.getElementById('__uvd_profile_avatar__').value.trim();
    var bio = document.getElementById('__uvd_profile_bio__').value.trim();
    data.userProfile = { name: name, avatar: avatar, bio: bio };
    storage.set(data);
    toast('Đã lưu Profile!');
    renderSettings(container);
  };
}

// ========== KHỞI CHẠY ==========
buildUI();

var autoRefresh = setInterval(function() {
  if (!document.getElementById('__uvd__') && !document.getElementById('__uvd_min_float__')) {
    clearInterval(autoRefresh); stopMonitor();
  }
}, 2000);

console.log('V5.1 Dark Liquid Edition - Final Fix (player in panel, fixed UI)');
toast('V5.1 sẵn sàng — Phát HLS ngay trong panel!');

})();