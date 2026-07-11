/**
 * Universal Video Downloader V5.1 – Dark Liquid Edition
 * - Native Chrome player (clean & simple)
 * - Consistent, refined glassmorphism UI throughout
 * - Auto-orientation fullscreen: video dọc → full dọc, video ngang → full ngang
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
  { re: /https?:\/\/[^\s"'<>()\\]+\.ts[^\s"'<>()\\]*/gi, type: 'TS', priority: 7 }
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
  var ext = type.toLowerCase() === 'iframe' ? 'mp4' : type.toLowerCase();
  var ref = pageInfo.referer;
  var origin = pageInfo.origin;
  var ua = pageInfo.userAgent;
  return {
    'yt-dlp': { label: 'yt-dlp (cơ bản)', cmd: 'yt-dlp --referer "' + ref + '" -o "' + t + '.%(ext)s" "' + url + '"' },
    'yt-dlp-bypass': { label: 'yt-dlp (bypass)', cmd: 'yt-dlp --force-ipv4 --no-check-certificate --user-agent "' + ua + '" --referer "' + ref + '" --add-header "Origin: ' + origin + '" -f "bv*+ba/best" --merge-output-format mp4 -o "' + t + '.%(ext)s" "' + url + '"' },
    'yt-dlp-aria': { label: 'yt-dlp + aria2', cmd: 'yt-dlp --referer "' + ref + '" --downloader aria2c -o "' + t + '.%(ext)s" "' + url + '"' },
    'ffmpeg': { label: 'FFmpeg', cmd: 'ffmpeg -headers "Referer: ' + ref + '\\r\\nOrigin: ' + origin + '" -i "' + url + '" -c copy "' + t + '.mp4"' },
    'curl': { label: 'cURL', cmd: 'curl -H "Referer: ' + ref + '" -o "' + t + '.' + ext + '" "' + url + '"' }
  };
}

// ========== UTILS ==========
function copy(text) {
  var ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove();
}

function toast(msg, color) {
  var el = document.createElement('div');
  el.textContent = msg;
  el.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);background:' + (color || '#3b82f6') + ';color:#fff;padding:12px 24px;border-radius:30px;z-index:2147483649;font:600 13px Segoe UI;box-shadow:0 4px 15px rgba(0,0,0,0.4);animation:uvdSlideIn 0.3s ease;';
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

// ========== PREVIEW IN NEW TAB ==========
function openPreviewInNewTab(url, type) {
  var html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Video Preview</title>';
  if (type === 'M3U8') {
    html += '<script src="https://cdn.jsdelivr.net/npm/hls.js@latest"><\/script>';
  }
  html += '<style>body{margin:0;background:#000;display:flex;align-items:center;justify-content:center;height:100vh;}video{max-width:100%;max-height:100%;}</style>';
  html += '</head><body>';
  html += '<video id="video" controls autoplay playsinline style="width:100%;height:100%;object-fit:contain;"></video>';
  html += '<script>';
  if (type === 'M3U8') {
    html += 'if (Hls.isSupported()) { var hls = new Hls(); hls.loadSource("' + url + '"); hls.attachMedia(document.getElementById("video")); } else if (document.getElementById("video").canPlayType("application/vnd.apple.mpegurl")) { document.getElementById("video").src = "' + url + '"; }';
  } else {
    html += 'document.getElementById("video").src = "' + url + '";';
  }
  html += '<\/script></body></html>';
  var blob = new Blob([html], {type: 'text/html'});
  var blobUrl = URL.createObjectURL(blob);
  window.open(blobUrl, '_blank');
}

// ========== FULLSCREEN WITH AUTO ORIENTATION ==========
// Video dọc (cao > rộng) -> khóa xoay dọc (portrait)
// Video ngang (rộng > cao) -> khóa xoay ngang (landscape)
//
// LƯU Ý QUAN TRỌNG: screen.orientation.lock() là API "xin phép" hệ điều hành.
// Trong Chrome Android / WebView (đặc biệt app như Lampa), hệ thống thường
// chấp nhận trong chốc lát rồi tự trả cảm biến vật lý về hướng thật của máy
// -> đây là nguyên nhân video xoay được ~1s rồi tự về dọc.
// Giải pháp: dùng CSS transform để ép xoay hình ảnh (không phụ thuộc OS),
// và có "watchdog" kiểm tra liên tục, hễ hệ thống kéo về sai hướng là
// tự động áp lại ngay, nên không thể bị trả về được nữa.
var __uvdOrientWatchdog = null;
var __uvdOrientTarget = null;

function enterFullscreenAuto(element, video) {
  var requestFS = element.requestFullscreen || element.webkitRequestFullscreen || 
                  element.mozRequestFullScreen || element.msRequestFullscreen;
  
  if (!requestFS) {
    toast('Trình duyệt không hỗ trợ fullscreen', 'var(--danger)');
    return;
  }
  
  var promise = requestFS.call(element);
  
  function afterFullscreen() {
    lockAutoOrientation(video, element);
  }
  
  if (promise && promise.then) {
    promise.then(afterFullscreen).catch(function(err) {
      console.warn('Fullscreen error:', err);
      afterFullscreen();
    });
  } else {
    setTimeout(afterFullscreen, 100);
  }
}

function isDocFullscreen() {
  return !!(document.fullscreenElement || document.webkitFullscreenElement || 
            document.mozFullScreenElement || document.msFullscreenElement);
}

function tryNativeOrientationLock(target) {
  try {
    if (screen.orientation && screen.orientation.lock) {
      screen.orientation.lock(target).catch(function() {});
    } else if (screen.lockOrientation) {
      screen.lockOrientation(target);
    } else if (screen.mozLockOrientation) {
      screen.mozLockOrientation(target);
    } else if (screen.msLockOrientation) {
      screen.msLockOrientation(target);
    }
  } catch(e) {}
}

// Ép xoay bằng CSS nếu hướng thực tế của màn hình (viewport) không khớp
// với hướng mong muốn — bất kể hệ thống nghĩ gì.
function enforceVisualOrientation(wrapper, target) {
  if (!isDocFullscreen()) { clearForceRotate(wrapper); return; }
  var wantLandscape = target === 'landscape';
  var actualLandscape = window.innerWidth > window.innerHeight;
  if (wantLandscape !== actualLandscape) {
    wrapper.classList.add('uvd-force-rotate');
    if (!wrapper.dataset.rotateDir) wrapper.dataset.rotateDir = '90';
    wrapper.classList.toggle('uvd-rotate-neg', wrapper.dataset.rotateDir === '-90');
    ensureFlipButton(wrapper);
  } else {
    wrapper.classList.remove('uvd-force-rotate', 'uvd-rotate-neg');
    removeFlipButton();
  }
}

function ensureFlipButton(wrapper) {
  if (document.getElementById('__uvd_flip_btn__')) return;
  var btn = document.createElement('button');
  btn.id = '__uvd_flip_btn__';
  btn.className = 'uvd-flip-btn';
  btn.title = 'Video bị lộn ngược? Bấm để xoay lại';
  btn.textContent = '⟲';
  btn.onclick = function(e) {
    e.stopPropagation();
    wrapper.dataset.rotateDir = wrapper.dataset.rotateDir === '90' ? '-90' : '90';
    wrapper.classList.toggle('uvd-rotate-neg', wrapper.dataset.rotateDir === '-90');
  };
  document.body.appendChild(btn);
}

function removeFlipButton() {
  var btn = document.getElementById('__uvd_flip_btn__');
  if (btn) btn.remove();
}

function clearForceRotate(wrapper) {
  if (wrapper) wrapper.classList.remove('uvd-force-rotate', 'uvd-rotate-neg');
  removeFlipButton();
  if (__uvdOrientWatchdog) { clearInterval(__uvdOrientWatchdog); __uvdOrientWatchdog = null; }
  __uvdOrientTarget = null;
}

function lockAutoOrientation(video, wrapper) {
  function applyLock() {
    var isPortrait = video.videoHeight > 0 && video.videoHeight > video.videoWidth;
    __uvdOrientTarget = isPortrait ? 'portrait' : 'landscape';
    tryNativeOrientationLock(__uvdOrientTarget);
    // Kiểm tra ngay sau đó — nếu native lock không thực sự giữ được
    // hướng thì CSS sẽ tự đảm nhiệm việc xoay hình.
    setTimeout(function() { enforceVisualOrientation(wrapper, __uvdOrientTarget); }, 300);
  }
  
  if (video.videoWidth && video.videoHeight) {
    applyLock();
  } else {
    video.addEventListener('loadedmetadata', applyLock, { once: true });
    setTimeout(function() {
      if (!__uvdOrientTarget && video.videoWidth && video.videoHeight) applyLock();
    }, 400);
  }
  
  // Watchdog: hệ thống có thể "kéo về" hướng cũ bất cứ lúc nào (thường ~1s
  // sau khi lock) — kiểm tra định kỳ và tự áp lại CSS ép xoay nếu cần.
  if (__uvdOrientWatchdog) clearInterval(__uvdOrientWatchdog);
  __uvdOrientWatchdog = setInterval(function() {
    if (!isDocFullscreen()) { clearForceRotate(wrapper); return; }
    if (__uvdOrientTarget) enforceVisualOrientation(wrapper, __uvdOrientTarget);
  }, 400);
  
  window.addEventListener('orientationchange', function() {
    if (__uvdOrientTarget) enforceVisualOrientation(wrapper, __uvdOrientTarget);
  });
  window.addEventListener('resize', function() {
    if (__uvdOrientTarget) enforceVisualOrientation(wrapper, __uvdOrientTarget);
  });
}

document.addEventListener('fullscreenchange', handleFullscreenChange);
document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
document.addEventListener('mozfullscreenchange', handleFullscreenChange);
document.addEventListener('MSFullscreenChange', handleFullscreenChange);

function handleFullscreenChange() {
  var isFullscreen = !!(document.fullscreenElement || document.webkitFullscreenElement || 
                       document.mozFullScreenElement || document.msFullscreenElement);
  
  if (!isFullscreen) {
    var wrapper = document.getElementById('__uvd_video_wrapper__');
    clearForceRotate(wrapper);
    try {
      if (screen.orientation && screen.orientation.unlock) {
        screen.orientation.unlock();
      } else if (screen.unlockOrientation) {
        screen.unlockOrientation();
      } else if (screen.mozUnlockOrientation) {
        screen.mozUnlockOrientation();
      } else if (screen.msUnlockOrientation) {
        screen.msUnlockOrientation();
      }
    } catch(e) {}
  }
}

// ========== BUILD UI ==========
if (document.getElementById('__uvd_css__')) document.getElementById('__uvd_css__').remove();
var style = document.createElement('style');
style.id = '__uvd_css__';
style.textContent = `
@keyframes uvdSlideIn{from{transform:translate(-50%,-20px);opacity:0}to{transform:translate(-50%,0);opacity:1}}
@keyframes uvdPulse{0%,100%{opacity:1;box-shadow:0 0 5px var(--accent)}50%{opacity:0.4;box-shadow:0 0 20px var(--accent)}}
@keyframes uvdFadeIn{from{opacity:0}to{opacity:1}}
@keyframes uvdScaleIn{from{opacity:0;transform:scale(0.94)}to{opacity:1;transform:scale(1)}}
@keyframes uvdSlideUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}
@keyframes uvdRipple{to{transform:scale(4);opacity:0}}
@keyframes uvdCardEnter{from{opacity:0;transform:translateY(15px)}to{opacity:1;transform:translateY(0)}}
@keyframes uvdFloatBtnIn{from{transform:scale(0);opacity:0}to{transform:scale(1);opacity:1}}
@keyframes uvdLiquidDrift {
  0% { transform: translate(-6%, -4%) scale(1); }
  50% { transform: translate(4%, 6%) scale(1.12); }
  100% { transform: translate(-6%, -4%) scale(1); }
}
@keyframes uvdShimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}
@keyframes uvdBadgePop {
  from { opacity:0; transform: translateY(-4px) scale(0.9); }
  to { opacity:1; transform: translateY(0) scale(1); }
}

:root {
  --bg: rgba(3,4,8,0.97);
  --glass: rgba(12,14,20,0.85);
  --glass-hi: rgba(255,255,255,0.06);
  --border: rgba(255,255,255,0.08);
  --text: #f3f5ff;
  --text2: #9ca3bd;
  --text3: #5d6377;
  --accent: #6d8cff;
  --accent2: #b98bff;
  --danger: #ff5d72;
  --gold: #ffb84d;
  --card-bg: rgba(255,255,255,0.03);
  --fs-xs: 11px;
  --fs-sm: 12px;
  --fs-base: 13px;
  --fs-md: 14px;
  --fs-lg: 16px;
  --radius-sm: 12px;
  --radius-md: 16px;
  --radius-lg: 26px;
  --grad-liquid: linear-gradient(135deg, var(--accent), var(--accent2));
}

* { box-sizing: border-box; }

.uvd-overlay {
  position:fixed; inset:0; background:rgba(2,3,6,0.92);
  backdrop-filter:blur(18px) saturate(120%); z-index:2147483648;
  display:flex; align-items:center; justify-content:center;
  padding:16px; overflow-y:auto;
}

.uvd-glass-panel {
  background:var(--glass); backdrop-filter:blur(28px) saturate(130%);
  -webkit-backdrop-filter:blur(28px) saturate(130%);
  border:1px solid var(--border); border-radius:var(--radius-lg);
  box-shadow:0 20px 50px rgba(0,0,0,0.8), 0 0 0 1px rgba(255,255,255,0.03) inset,
    0 1px 0 rgba(255,255,255,0.08) inset;
  color:var(--text); font-family:-apple-system,BlinkMacSystemFont,'SF Pro Display','Segoe UI',Roboto,sans-serif;
  font-size:var(--fs-base);
  padding:16px; width:100%; position:relative; overflow:hidden;
}

.uvd-glass-panel::before {
  content:''; position:absolute; top:0; left:8%; right:8%; height:1px; z-index:2;
  background:linear-gradient(90deg, transparent, rgba(109,140,255,0.6), rgba(185,139,255,0.6), transparent);
  opacity:0.7;
}

.uvd-liquid-bg {
  position:absolute; inset:-30%; z-index:0; pointer-events:none;
  background:
    radial-gradient(closest-side, rgba(109,140,255,0.12), transparent 70%) 15% 20% / 55% 55% no-repeat,
    radial-gradient(closest-side, rgba(185,139,255,0.10), transparent 70%) 85% 75% / 60% 60% no-repeat;
  filter: blur(50px);
  animation: uvdLiquidDrift 16s ease-in-out infinite;
}

@media (prefers-reduced-motion: reduce) { .uvd-liquid-bg { animation: none; } }

.uvd-panel-content { position:relative; z-index:1; display:flex; flex-direction:column; height:100%; min-height:0; }

#__uvd_video_wrapper__:fullscreen,
#__uvd_video_wrapper__:-webkit-full-screen,
#__uvd_video_wrapper__:-moz-full-screen,
#__uvd_video_wrapper__:-ms-fullscreen {
  width: 100vw !important;
  height: 100vh !important;
  background: #000 !important;
}

#__uvd_video_wrapper__:fullscreen video,
#__uvd_video_wrapper__:-webkit-full-screen video,
#__uvd_video_wrapper__:-moz-full-screen video,
#__uvd_video_wrapper__:-ms-fullscreen video {
  width: 100% !important;
  height: 100% !important;
  object-fit: contain !important;
}

/* Ép xoay bằng CSS khi hệ thống không giữ được screen.orientation.lock().
   Áp dụng SAU các quy tắc fullscreen ở trên nên sẽ được ưu tiên hơn. */
#__uvd_video_wrapper__:fullscreen.uvd-force-rotate,
#__uvd_video_wrapper__:-webkit-full-screen.uvd-force-rotate,
#__uvd_video_wrapper__:-moz-full-screen.uvd-force-rotate,
#__uvd_video_wrapper__:-ms-fullscreen.uvd-force-rotate {
  width: 100vh !important;
  height: 100vw !important;
  position: fixed !important;
  top: 50% !important;
  left: 50% !important;
  transform: translate(-50%, -50%) rotate(90deg) !important;
  transform-origin: center center !important;
  transition: none !important;
}

#__uvd_video_wrapper__:fullscreen.uvd-force-rotate.uvd-rotate-neg,
#__uvd_video_wrapper__:-webkit-full-screen.uvd-force-rotate.uvd-rotate-neg,
#__uvd_video_wrapper__:-moz-full-screen.uvd-force-rotate.uvd-rotate-neg,
#__uvd_video_wrapper__:-ms-fullscreen.uvd-force-rotate.uvd-rotate-neg {
  transform: translate(-50%, -50%) rotate(-90deg) !important;
}

.uvd-flip-btn {
  position:fixed; z-index:2147483647; bottom:16px; right:16px;
  width:44px; height:44px; border-radius:50%; border:1px solid rgba(255,255,255,0.25);
  background:rgba(20,22,30,0.75); color:#fff; font-size:18px; cursor:pointer;
  display:flex; align-items:center; justify-content:center; backdrop-filter:blur(8px);
  box-shadow:0 4px 14px rgba(0,0,0,0.5);
}

.uvd-scroll::-webkit-scrollbar{width:4px}
.uvd-scroll::-webkit-scrollbar-thumb{background:var(--accent);border-radius:4px}
.uvd-scroll::-webkit-scrollbar-track{background:transparent}

.uvd-btn {
  background:var(--glass-hi); border:1px solid var(--border);
  color:var(--text); padding:9px 16px; border-radius:var(--radius-md);
  font-weight:600; font-size:var(--fs-base); cursor:pointer; transition: all 0.2s;
  backdrop-filter:blur(10px); text-align:center; position:relative;
  overflow:hidden; display:inline-block;
  box-shadow:0 3px 10px rgba(0,0,0,0.4), 0 1px 0 rgba(255,255,255,0.08) inset;
  line-height:1.3;
}

.uvd-btn:hover {
  background:rgba(255,255,255,0.10); border-color:rgba(255,255,255,0.20);
  transform:translateY(-1px); box-shadow:0 5px 14px rgba(0,0,0,0.5), 0 1px 0 rgba(255,255,255,0.12) inset;
}

.uvd-btn:active { transform:scale(0.96); }

.uvd-btn-sm {
  padding: 7px 12px;
  font-size: var(--fs-sm);
  border-radius: var(--radius-sm);
}

.uvd-btn-primary {
  background:var(--grad-liquid); border-color:transparent; color:#fff;
  box-shadow:0 5px 16px rgba(109,140,255,0.4), 0 1px 0 rgba(255,255,255,0.25) inset;
}

.uvd-btn-primary:hover { filter:brightness(1.08); box-shadow:0 7px 20px rgba(109,140,255,0.5); }

.uvd-btn-icon {
  background:var(--glass-hi); border:1px solid var(--border);
  color:var(--text); width:34px; height:34px; border-radius:var(--radius-sm);
  cursor:pointer; display:inline-flex; align-items:center; justify-content:center;
  transition: all 0.2s; backdrop-filter:blur(10px); position:relative; overflow:hidden;
  box-shadow:0 3px 8px rgba(0,0,0,0.35), 0 1px 0 rgba(255,255,255,0.08) inset;
}

.uvd-btn-icon:hover { background:rgba(255,255,255,0.10); border-color:rgba(255,255,255,0.20); }
.uvd-btn-icon:active { transform:scale(0.92); }
.uvd-btn-icon span { display:block; }

.uvd-card {
  background:var(--card-bg); border:1px solid var(--border);
  border-radius:var(--radius-md); padding:14px; margin-bottom:10px;
  font-size:var(--fs-base); backdrop-filter:blur(6px);
  box-shadow:0 1px 0 rgba(255,255,255,0.04) inset;
  transition: transform 0.3s cubic-bezier(.4,0,.2,1), box-shadow 0.3s ease, background 0.3s ease, border-color 0.3s ease;
  animation:uvdCardEnter 0.4s ease both;
}

.uvd-card:nth-child(odd) { animation-delay:0.05s; }
.uvd-card:nth-child(even) { animation-delay:0.1s; }

.uvd-card:hover {
  transform:translateY(-3px);
  box-shadow:0 14px 30px rgba(0,0,0,0.7), 0 0 0 1px rgba(109,140,255,0.30) inset, 0 0 24px rgba(109,140,255,0.08);
  background:rgba(255,255,255,0.05);
  border-color:rgba(109,140,255,0.25);
}

.uvd-type-badge {
  display:inline-block; padding:4px 12px; border-radius:var(--radius-sm);
  font-size:var(--fs-xs); font-weight:700;
  background:linear-gradient(135deg, rgba(109,140,255,0.22), rgba(185,139,255,0.18));
  color:var(--accent); border:1px solid rgba(109,140,255,0.28);
  letter-spacing:0.03em; box-shadow:0 1px 0 rgba(255,255,255,0.06) inset;
}

.uvd-url-box {
  background:rgba(0,0,0,0.5); border-radius:var(--radius-sm); padding:12px;
  font-family:'SFMono-Regular',Consolas,monospace; font-size:var(--fs-sm); word-break:break-all;
  color:var(--text2); max-height:100px; overflow-y:auto; line-height:1.5;
  border:1px solid rgba(255,255,255,0.04);
}

.uvd-grid-2 { display:grid; grid-template-columns:1fr 1fr; gap:8px; }
.uvd-grid-3 { display:grid; grid-template-columns:1fr 1fr 1fr; gap:6px; }

.uvd-tabbar {
  position:relative; display:flex; gap:2px; padding:4px;
  background:rgba(255,255,255,0.04); border:1px solid var(--border);
  border-radius:999px; margin-bottom:10px;
}

.uvd-tab-indicator {
  position:absolute; top:4px; bottom:4px; left:4px; width:0;
  border-radius:999px; background:var(--grad-liquid); z-index:0;
  box-shadow:0 3px 12px rgba(109,140,255,0.45);
  transition: transform 0.4s cubic-bezier(.4,0,.2,1), width 0.4s cubic-bezier(.4,0,.2,1);
}

.uvd-tab {
  position:relative; z-index:1; flex:1; min-width:0; background:transparent;
  border:none; color:var(--text2); font-weight:600; font-size:var(--fs-sm);
  padding:9px 6px; border-radius:999px; cursor:pointer; transition:color 0.25s;
  white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
}

.uvd-tab.uvd-tab-active { color:#fff; text-shadow:0 1px 4px rgba(0,0,0,0.3); }

#__uvd_orient_badge__ { animation: uvdBadgePop 0.3s ease both; font-weight:600; }

#__uvd_min_float__ {
  position:fixed; bottom:20px; right:20px; width:54px; height:54px;
  border-radius:50%; background:var(--grad-liquid); color:#fff;
  border:1px solid rgba(255,255,255,0.25); box-shadow:0 8px 22px rgba(0,0,0,0.6), 0 0 20px rgba(109,140,255,0.35);
  z-index:2147483647; cursor:pointer; display:flex; align-items:center;
  justify-content:center; font-weight:700; font-size:var(--fs-lg);
  transition: transform 0.3s; animation:uvdFloatBtnIn 0.3s ease;
  backdrop-filter:blur(10px);
}

#__uvd_min_float__:hover { transform:scale(1.1); }

.uvd-ripple {
  position:absolute; border-radius:50%; background:rgba(255,255,255,0.5);
  transform:scale(0); animation:uvdRipple 0.6s ease-out;
}
`;
document.head.appendChild(style);

function buildUI() {
  var arr = [...urls.entries()].map(function(e) {
    return { url: e[0], type: e[1].type, source: e[1].source, priority: e[1].priority };
  }).sort(function(a, b) { return a.priority - b.priority; });

  var panel = document.getElementById('__uvd__');
  if (panel) panel.remove();
  
  panel = document.createElement('div');
  panel.id = '__uvd__';
  panel.className = 'uvd-glass-panel';
  panel.style.cssText = 'position:fixed;top:15px;left:15px;right:15px;bottom:15px;z-index:2147483647;animation:uvdScaleIn 0.4s ease;';
  
  var liquidBg = document.createElement('div');
  liquidBg.className = 'uvd-liquid-bg';
  panel.appendChild(liquidBg);
  
  var content = document.createElement('div');
  content.className = 'uvd-panel-content';
  panel.appendChild(content);
  
  // Header
  var header = document.createElement('div');
  header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding-bottom:12px;border-bottom:1px solid var(--border);margin-bottom:10px;';
  header.innerHTML = 
    '<div style="display:flex;align-items:center;gap:8px;">' +
      '<span style="width:10px;height:10px;background:var(--grad-liquid);border-radius:50%;animation:uvdPulse 2s infinite;box-shadow:0 0 8px rgba(109,140,255,0.6);"></span>' +
      '<span style="font-weight:700;font-size:16px;letter-spacing:-0.01em;">Universal DL <span style="background:var(--grad-liquid);-webkit-background-clip:text;background-clip:text;color:transparent;">V5.1</span></span>' +
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
  info.style.cssText = 'margin-bottom:10px;font-size:12px;';
  info.innerHTML = 
    '<span style="color:var(--text2);">Tên: </span>' +
    '<span id="__uvd_title__" style="color:var(--accent);text-decoration:underline;cursor:pointer;">' + pageInfo.title + '</span> ' +
    '<span style="color:var(--text3);">(sửa)</span><br>' +
    '<span style="color:var(--text2);">Referer: </span>' +
    '<span id="__uvd_referer__" style="color:var(--accent2);font-family:monospace;text-decoration:underline;cursor:pointer;font-size:11px;">' + pageInfo.referer + '</span>';
  content.appendChild(info);
  
  // Content area
  var contentWrapper = document.createElement('div');
  contentWrapper.className = 'uvd-scroll';
  contentWrapper.style.cssText = 'flex:1;overflow:hidden;position:relative;min-height:0;';
  
  var streamList = document.createElement('div');
  streamList.id = '__uvd_stream_list__';
  streamList.className = 'uvd-scroll';
  streamList.style.cssText = 'overflow-y:auto;height:100%;padding-right:4px;';
  contentWrapper.appendChild(streamList);
  
  var playerContainer = document.createElement('div');
  playerContainer.id = '__uvd_player_container__';
  playerContainer.style.cssText = 'display:none;flex-direction:column;height:100%;background:var(--glass);border-radius:var(--radius-md);overflow:hidden;border:1px solid var(--border);';
  contentWrapper.appendChild(playerContainer);
  
  content.appendChild(contentWrapper);
  
  // Footer
  var footer = document.createElement('div');
  footer.style.cssText = 'display:flex;gap:6px;margin-top:10px;flex-wrap:wrap;';
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
    
    playerContainer.style.display = 'none';
    playerContainer.innerHTML = '';
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
  
  window.__uvd_showPreview = openPreviewInNewTab;
}

function renderStreams(container, arr) {
  if (!arr.length) {
    container.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text2);">Không phát hiện stream nào.</div>';
    return;
  }
  
  arr.forEach(function(item, i) {
    var card = document.createElement('div');
    card.className = 'uvd-card';
    var fav = isFavorite(item.url);
    
    card.innerHTML = 
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">' +
        '<span class="uvd-type-badge">#' + (i+1) + ' ' + item.type + '</span>' +
        '<button class="uvd-fav-btn uvd-ripple-btn" data-url="' + encodeURIComponent(item.url) + '" data-type="' + item.type + '" style="background:none;border:none;font-size:18px;cursor:pointer;color:' + (fav ? 'var(--gold)' : 'var(--text3)') + ';">' + (fav ? '★' : '☆') + '</button>' +
      '</div>' +
      '<div class="uvd-url-box">' + item.url + '</div>' +
      '<div class="uvd-grid-2" style="margin-top:8px;">' +
        '<button class="uvd-btn uvd-btn-sm uvd-ripple-btn" data-action="share" data-url="' + encodeURIComponent(item.url) + '" style="background:rgba(139,92,246,0.2);">Chia sẻ</button>' +
        '<button class="uvd-btn uvd-btn-sm uvd-ripple-btn" data-action="copy" data-url="' + encodeURIComponent(item.url) + '">Sao chép</button>' +
        (item.type === 'IFRAME' ? 
          '<a href="' + item.url + '" class="uvd-btn uvd-btn-sm uvd-ripple-btn" style="text-align:center;grid-column:1/3;text-decoration:none;">Mở iframe</a>' :
          (item.type === 'M3U8' ?
            '<button class="uvd-btn uvd-btn-sm uvd-ripple-btn" data-action="quality" data-url="' + encodeURIComponent(item.url) + '">Chất lượng</button>' +
            '<button class="uvd-btn uvd-btn-sm uvd-ripple-btn" data-action="preview" data-url="' + encodeURIComponent(item.url) + '" data-type="' + item.type + '">Xem trước</button>' +
            '<button class="uvd-btn uvd-btn-sm uvd-ripple-btn" data-action="cmd" data-url="' + encodeURIComponent(item.url) + '" data-type="' + item.type + '" style="grid-column:1/3;">Lệnh tải</button>' :
            '<button class="uvd-btn uvd-btn-sm uvd-ripple-btn" data-action="preview" data-url="' + encodeURIComponent(item.url) + '" data-type="' + item.type + '">Xem trước</button>' +
            '<button class="uvd-btn uvd-btn-sm uvd-ripple-btn" data-action="cmd" data-url="' + encodeURIComponent(item.url) + '" data-type="' + item.type + '">Lệnh tải</button>'
          )
        ) +
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
      this.style.color = isFav ? 'var(--gold)' : 'var(--text3)';
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
      else if (action === 'preview') openPreviewInNewTab(u, t);
      else if (action === 'cmd') showCommandPicker(u, t);
    };
  });
}

function showCommandPicker(url, type) {
  var cmds = makeCommands(url, type, pageInfo.title);
  var overlay = document.createElement('div');
  overlay.className = 'uvd-overlay';
  
  var html = '<div class="uvd-glass-panel" style="max-width:600px;margin:auto;">';
  html += '<div style="font-weight:700;margin-bottom:12px;">Chọn lệnh tải</div>';
  html += '<div style="overflow-y:auto;max-height:60vh;">';
  
  Object.keys(cmds).forEach(function(k) {
    var c = cmds[k];
    html += '<div class="uvd-card">' +
      '<div style="font-weight:600;color:var(--accent);">' + c.label + '</div>' +
      '<div class="uvd-url-box">' + c.cmd + '</div>' +
      '<button class="uvd-btn uvd-btn-sm cmd-select" data-cmd="' + encodeURIComponent(c.cmd) + '" style="width:100%;">Chỉnh sửa & Copy</button>' +
    '</div>';
  });
  
  html += '</div><button class="uvd-btn uvd-btn-sm close-overlay-btn" style="width:100%;margin-top:10px;background:var(--danger);">Đóng</button></div>';
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
    '<div class="uvd-glass-panel" style="max-width:600px;margin:auto;">' +
      '<div style="font-weight:700;margin-bottom:8px;">Chỉnh sửa lệnh</div>' +
      '<textarea style="width:100%;height:120px;background:rgba(0,0,0,0.5);border:1px solid var(--border);border-radius:10px;color:var(--text);padding:12px;font-family:monospace;">' + text + '</textarea>' +
      '<div class="uvd-grid-2" style="margin-top:12px;">' +
        '<button class="uvd-btn uvd-btn-sm" id="__uvd_ed_copy__">Sao chép</button>' +
        '<button class="uvd-btn uvd-btn-sm" id="__uvd_ed_share__" style="background:rgba(139,92,246,0.3);">Chia sẻ</button>' +
      '</div>' +
      '<button class="uvd-btn uvd-btn-sm close-editor" style="width:100%;margin-top:8px;background:var(--danger);">Đóng</button>' +
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
  overlay.innerHTML = '<div class="uvd-glass-panel" style="max-width:600px;margin:auto;">Đang phân tích M3U8...</div>';
  document.body.appendChild(overlay);
  
  parseM3U8Master(url, function(qualities) {
    if (!qualities) {
      overlay.innerHTML = '<div class="uvd-glass-panel" style="max-width:600px;margin:auto;text-align:center;">' +
        '<div style="color:var(--danger);">Không phải Master Playlist</div>' +
        '<button class="uvd-btn uvd-btn-sm close-overlay-btn" style="margin-top:12px;background:var(--danger);width:100%;">Đóng</button></div>';
      overlay.querySelector('.close-overlay-btn').onclick = function() { overlay.remove(); };
      return;
    }
    
    var html = '<div class="uvd-glass-panel" style="max-width:600px;margin:auto;">';
    html += '<div style="font-weight:700;margin-bottom:12px;">Chọn chất lượng (' + qualities.length + ')</div>';
    html += '<div style="overflow-y:auto;max-height:60vh;">';
    
    qualities.forEach(function(q) {
      html += '<div class="uvd-card">' +
        '<b>' + q.label + '</b> <span style="color:var(--text3);">' + Math.round(q.bandwidth/1000) + 'kbps</span>' +
        '<div class="uvd-grid-3" style="margin-top:8px;">' +
          '<button class="uvd-btn uvd-btn-sm q-act" data-url="' + encodeURIComponent(q.url) + '" data-action="share" style="background:rgba(139,92,246,0.2);">Chia sẻ</button>' +
          '<button class="uvd-btn uvd-btn-sm q-act" data-url="' + encodeURIComponent(q.url) + '" data-action="preview">Xem</button>' +
          '<button class="uvd-btn uvd-btn-sm q-act" data-url="' + encodeURIComponent(q.url) + '" data-action="cmd">Lệnh</button>' +
        '</div>' +
      '</div>';
    });
    
    html += '</div><button class="uvd-btn uvd-btn-sm close-overlay-btn" style="width:100%;margin-top:10px;background:var(--danger);">Đóng</button></div>';
    overlay.innerHTML = html;
    
    overlay.querySelectorAll('.uvd-btn').forEach(function(b) { b.addEventListener('click', addRipple); });
    overlay.querySelector('.close-overlay-btn').onclick = function() { overlay.remove(); };
    
    overlay.querySelectorAll('.q-act').forEach(function(b) {
      b.onclick = function() {
        var u = decodeURIComponent(this.dataset.url);
        var action = this.dataset.action;
        overlay.remove();
        if (action === 'share') shareUrl(u);
        else if (action === 'preview') openPreviewInNewTab(u, 'M3U8');
        else showCommandPicker(u, 'M3U8');
      };
    });
  });
}

function renderFavorites(container) {
  if (!data.favorites.length) {
    container.innerHTML = '<div style="text-align:center;padding:30px;color:var(--text2);">Chưa có yêu thích.</div>';
    return;
  }
  
  data.favorites.forEach(function(f, i) {
    var card = document.createElement('div');
    card.className = 'uvd-card';
    card.innerHTML = 
      '<div style="display:flex;justify-content:space-between;"><b style="color:var(--gold);">★ '+ f.type + '</b><span style="font-size:11px;color:var(--text3);">' + new Date(f.timestamp).toLocaleDateString() + '</span></div>' +
      '<div style="margin:4px 0;">' + f.title + '</div>' +
      '<div class="uvd-url-box">' + f.url + '</div>' +
      '<div class="uvd-grid-3">' +
        '<button class="uvd-btn uvd-btn-sm fav-act" data-url="' + encodeURIComponent(f.url) + '" data-action="share" style="background:rgba(139,92,246,0.2);">Chia sẻ</button>' +
        '<button class="uvd-btn uvd-btn-sm fav-act" data-url="' + encodeURIComponent(f.url) + '" data-action="copy">Copy</button>' +
        '<button class="uvd-btn uvd-btn-sm fav-del" data-idx="' + i + '" style="background:var(--danger);">Xóa</button>' +
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
    container.innerHTML = '<div style="text-align:center;padding:30px;color:var(--text2);">Chưa có lịch sử.</div>';
    return;
  }
  
  container.innerHTML = '<button class="uvd-btn uvd-btn-sm" id="__uvd_clear_hist__" style="width:100%;margin-bottom:10px;background:var(--danger);">Xóa toàn bộ lịch sử</button>';
  document.getElementById('__uvd_clear_hist__').addEventListener('click', addRipple);
  document.getElementById('__uvd_clear_hist__').onclick = function() {
    if (confirm('Xóa toàn bộ lịch sử?')) { data.history = []; storage.set(data); renderHistory(container); }
  };
  
  hist.forEach(function(h) {
    var card = document.createElement('div');
    card.className = 'uvd-card';
    card.innerHTML = 
      '<div style="display:flex;justify-content:space-between;"><b style="color:var(--accent);">' + h.type + '</b><span style="font-size:11px;color:var(--text3);">' + new Date(h.timestamp).toLocaleString() + '</span></div>' +
      '<div>' + h.title + '</div><div class="uvd-url-box">' + h.url + '</div>';
    container.appendChild(card);
  });
}

function renderSettings(container) {
  var profile = data.userProfile || {};
  var bookmarkletCode = 'javascript:(function(){var s=document.createElement("script");s.src="https://cdn.jsdelivr.net/gh/nguyenquocngu93/uvd@v5.1/uvd_v5.1-1.js";document.head.appendChild(s);})();';
  
  container.innerHTML = 
    '<div class="uvd-card"><div style="font-weight:600;">Sao lưu & Khôi phục</div>' +
      '<button class="uvd-btn uvd-btn-sm" id="__uvd_backup__" style="width:100%;margin-bottom:6px;">Xuất dữ liệu</button>' +
      '<button class="uvd-btn uvd-btn-sm" id="__uvd_restore__" style="width:100%;margin-bottom:6px;">Nhập dữ liệu</button>' +
      '<button class="uvd-btn uvd-btn-sm" id="__uvd_reset__" style="width:100%;background:var(--danger);">Đặt lại tất cả</button></div>' +
    
    '<div class="uvd-card"><div style="font-weight:600;">📖 Hướng dẫn sử dụng Bookmarklet</div>' +
      '<div style="font-size:12px;color:var(--text2);margin:6px 0;">Kéo bookmarklet dưới đây vào thanh bookmark của trình duyệt, sau đó nhấn vào bookmark khi đang xem video để mở công cụ.</div>' +
      '<div style="background:rgba(0,0,0,0.5);padding:8px;border-radius:6px;font-family:monospace;font-size:11px;word-break:break-all;border:1px solid var(--border);">' + bookmarkletCode + '</div>' +
      '<button class="uvd-btn uvd-btn-sm" id="__uvd_copy_bookmarklet__" style="margin-top:6px;">Sao chép bookmarklet</button></div>' +
    
    '<div class="uvd-card"><div style="font-weight:600;">👤 Profile</div>' +
      '<div style="display:flex;align-items:center;gap:12px;margin:8px 0;">' +
        '<div style="width:48px;height:48px;border-radius:50%;background:var(--glass-hi);border:2px solid var(--border);display:flex;align-items:center;justify-content:center;font-size:20px;color:var(--text2);overflow:hidden;">' +
          (profile.avatar ? '<img src="' + profile.avatar + '" style="width:100%;height:100%;object-fit:cover;">' : '👤') +
        '</div>' +
        '<div style="flex:1;">' +
          '<input type="text" id="__uvd_profile_name__" placeholder="Tên của bạn" value="' + (profile.name || '') + '" style="width:100%;background:rgba(0,0,0,0.3);border:1px solid var(--border);border-radius:8px;padding:6px 10px;color:var(--text);margin-bottom:4px;">' +
          '<input type="text" id="__uvd_profile_avatar__" placeholder="URL ảnh đại diện" value="' + (profile.avatar || '') + '" style="width:100%;background:rgba(0,0,0,0.3);border:1px solid var(--border);border-radius:8px;padding:6px 10px;color:var(--text);">' +
        '</div>' +
      '</div>' +
      '<textarea id="__uvd_profile_bio__" placeholder="Giới thiệu ngắn" style="width:100%;background:rgba(0,0,0,0.3);border:1px solid var(--border);border-radius:8px;padding:6px 10px;color:var(--text);resize:vertical;min-height:50px;">' + (profile.bio || '') + '</textarea>' +
      '<button class="uvd-btn uvd-btn-sm" id="__uvd_save_profile__" style="margin-top:6px;">Lưu Profile</button></div>' +
    
    '<div class="uvd-card" style="margin-top:10px;color:var(--text2);">Phiên bản 5.1 Dark Liquid · Toàn màn hình tự động xoay theo hướng video<br>Yêu thích: ' + data.favorites.length + ' · Lịch sử: ' + (data.history||[]).length + '</div>';
  
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
        catch(ex) { toast('File không hợp lệ','var(--danger)'); }
      };
      reader.readAsText(e.target.files[0]);
    };
    inp.click();
  };
  
  document.getElementById('__uvd_reset__').onclick = function() {
    if (confirm('Xóa toàn bộ dữ liệu?')) { localStorage.removeItem(STORAGE_KEY); data = {favorites:[],siteProfiles:{},history:[],userProfile:{}}; buildUI(); }
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

buildUI();

var autoRefresh = setInterval(function() {
  if (!document.getElementById('__uvd__') && !document.getElementById('__uvd_min_float__')) {
    clearInterval(autoRefresh); stopMonitor();
  }
}, 2000);

console.log('V5.1 Dark Liquid Edition - Auto-Orientation Player Ready');
toast('V5.1 sẵn sàng — Toàn màn hình tự động xoay!');

})();