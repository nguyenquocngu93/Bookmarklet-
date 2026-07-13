/**
 * Universal Media Player & Downloader - V6.2
 * - Tối ưu code trùng lặp, thêm minimize script panel
 * Author: nguyenquocngu91
 * CDN: cdn.jsdelivr.net/gh/nguyenquocngu93/bookmarklet-@main/umpdl.js
 */
(function() {
'use strict';

// ========== INIT ==========
var VERSION = '6.2';
var old = document.getElementById('__uvd__');
if (old) old.remove();
var minBtn = document.getElementById('__uvd_min_float__');
if (minBtn) minBtn.remove();

var STORAGE_KEY = 'uvd_data_v54';
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
data.filterlist = data.filterlist || [];

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

// ========== AD FILTER ==========
var __uvdAdBlockedCount = 0;

function isAdUrl(url) {
  if (!data.filterlist || !data.filterlist.length) return false;
  var lowerUrl = url.toLowerCase();
  for (var i = 0; i < data.filterlist.length; i++) {
    var pattern = data.filterlist[i].trim().toLowerCase();
    if (!pattern) continue;
    if (pattern.startsWith('regex:')) {
      try {
        var re = new RegExp(pattern.slice(6), 'i');
        if (re.test(url)) return true;
      } catch(e) {}
    } else {
      if (lowerUrl.indexOf(pattern) !== -1) return true;
    }
  }
  return false;
}

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
  { re: /blob:https?:\/\/[^\s"'<>()\\]+/gi, type: 'BLOB', priority: 8 }
];

function findUrls(text, source) {
  if (!text || typeof text !== 'string') return;
  patterns.forEach(function(p) {
    var matches = text.match(p.re);
    if (matches) {
      matches.forEach(function(u) {
        u = u.replace(/\\u002F/g, '/').replace(/\\\//g, '/').replace(/&amp;/g, '&').replace(/\\"/g, '');
        if (isAdUrl(u)) {
          __uvdAdBlockedCount++;
          return;
        }
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
      if (i.src) {
        var iframeUrl = i.src;
        if (!isAdUrl(iframeUrl)) {
          urls.set(iframeUrl, { type: 'IFRAME', source: 'iframe#' + idx, priority: 99, timestamp: Date.now() });
        } else {
          __uvdAdBlockedCount++;
        }
      }
      try { if (i.contentDocument) scan(i.contentDocument, 'iframe#' + idx); }
      catch(e) {}
    });
  } catch(e) {}
}

// ========== POPUP / NEW-TAB BLOCKER ==========
var __uvdPopupBlockActive = false;
var __uvdOriginalWindowOpen = null;
var __uvdBlockedCount = 0;

window.__uvdSafeOpen = function(url) {
  if (__uvdOriginalWindowOpen) {
    return __uvdOriginalWindowOpen(url, '_blank');
  }
  return window.open(url, '_blank');
};

function killBlankLinks(e) {
  var t = e.target;
  if (t.closest && (t.closest('#__uvd__') || t.closest('#__uvd_player_overlay__') || t.closest('#__uvd_min_float__'))) return;
  while (t && t !== document) {
    if (t && t.tagName === 'A') {
      var tg = t.target;
      if (tg && tg !== '_self' && tg !== '_top' && tg !== '_parent') {
        e.preventDefault();
        e.stopPropagation();
        __uvdBlockedCount++;
        return;
      }
    }
    t = t.parentNode;
  }
}

function installPopupBlock() {
  if (__uvdPopupBlockActive) return;
  __uvdPopupBlockActive = true;
  __uvdOriginalWindowOpen = window.open;
  window.open = function() { __uvdBlockedCount++; return null; };
  ['click', 'mousedown', 'pointerdown', 'auxclick'].forEach(function(type) {
    document.addEventListener(type, killBlankLinks, true);
  });
}

function uninstallPopupBlock() {
  if (!__uvdPopupBlockActive) return;
  __uvdPopupBlockActive = false;
  if (__uvdOriginalWindowOpen) window.open = __uvdOriginalWindowOpen;
  ['click', 'mousedown', 'pointerdown', 'auxclick'].forEach(function(type) {
    document.removeEventListener(type, killBlankLinks, true);
  });
}

// ========== AUTO-CLICK PLAY (hợp nhất) ==========
var AUTO_PLAY_SELECTORS = [
  '.fluid_initial_play', '.fluid_control_play', '.fluid_initial_play_button',
  '.jw-display-icon-container', '.jw-icon-display', '.jw-icon-playback',
  '.vjs-big-play-button', '.vjs-play-control',
  '.plyr__control--overlaid', '.plyr__control[data-plyr="play"]',
  '.fp-play', '.fp-playbtn', '.flowplayer .fp-ui',
  '.mejs-overlay-play', '.mejs-play > button', '.mejs-overlay-button',
  '.play-button', '.playbtn', '.btn-play', '.video-play-button', '.play-icon',
  '.play-overlay', '.overlay-play', '.video-play', '.player-play-button',
  '.vjs-poster', '.video-thumb-play', '.play-btn-circle',
  '[aria-label="Play"]', '[aria-label="play"]', '[aria-label="Play Video"]',
  '[title="Play"]', '[title="play"]', '[title="Play Video"]',
  'button.play', 'div.play', 'span.play'
];

function simulateClick(el) {
  try {
    var rect = el.getBoundingClientRect();
    if (!rect.width || !rect.height) return false;
    var x = rect.left + rect.width / 2;
    var y = rect.top + rect.height / 2;
    ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'].forEach(function(type) {
      var ev;
      try {
        ev = new MouseEvent(type, { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y });
      } catch(e) {
        ev = document.createEvent('MouseEvent');
        ev.initMouseEvent(type, true, true, window, 0, 0, 0, x, y, false, false, false, false, 0, null);
      }
      el.dispatchEvent(ev);
    });
    if (typeof el.click === 'function') el.click();
    return true;
  } catch(e) { return false; }
}

function autoClickPlayButtons(root, depth, allowVideoPlayFallback) {
  root = root || document;
  depth = depth || 0;
  if (depth > 3) return 0;
  var clicked = 0;
  
  // Ưu tiên selector tùy chỉnh từ site profile
  var customSel = (data.siteProfiles[pageInfo.host] && data.siteProfiles[pageInfo.host].playSelector) || '';
  var selectors = customSel ? [customSel].concat(AUTO_PLAY_SELECTORS) : AUTO_PLAY_SELECTORS;
  
  selectors.forEach(function(sel) {
    try {
      root.querySelectorAll(sel).forEach(function(el) {
        if (simulateClick(el)) clicked++;
      });
    } catch(e) {}
  });
  
  if (allowVideoPlayFallback) {
    try {
      root.querySelectorAll('video').forEach(function(v) {
        if (v.paused) {
          var wasMuted = v.muted;
          v.muted = true;
          var p = v.play();
          if (p && p.then) {
            p.then(function() {
              setTimeout(function() {
                try { v.pause(); v.currentTime = 0; v.muted = wasMuted; } catch(e) {}
              }, 600);
            }).catch(function() {});
          }
        }
      });
    } catch(e) {}
  }
  
  try {
    root.querySelectorAll('iframe').forEach(function(f) {
      try { if (f.contentDocument) clicked += autoClickPlayButtons(f.contentDocument, depth + 1, allowVideoPlayFallback); }
      catch(e) {}
    });
  } catch(e) {}
  
  return clicked;
}

function pauseAllPlayingVideos(root, depth) {
  root = root || document;
  depth = depth || 0;
  var pausedCount = 0;
  try {
    root.querySelectorAll('video').forEach(function(v) {
      if (!v.paused) {
        try { v.pause(); pausedCount++; } catch(e) {}
      }
    });
  } catch(e) {}
  if (depth < 2) {
    try {
      root.querySelectorAll('iframe').forEach(function(f) {
        try { if (f.contentDocument) pausedCount += pauseAllPlayingVideos(f.contentDocument, depth + 1); }
        catch(e) {}
      });
    } catch(e) {}
  }
  return pausedCount;
}

// ========== LIVE MONITORING ==========
var originalFetch = window.fetch;
var originalXHROpen = XMLHttpRequest.prototype.open;

function installMonitor() {
  window.fetch = function() {
    var url = arguments[0];
    if (typeof url === 'string') {
      if (!isAdUrl(url)) findUrls(url, 'fetch:live');
    } else if (url && url.url) {
      if (!isAdUrl(url.url)) findUrls(url.url, 'fetch:live');
    }
    return originalFetch.apply(this, arguments);
  };
  XMLHttpRequest.prototype.open = function(method, url) {
    if (url && !isAdUrl(url)) findUrls(url, 'xhr:live');
    return originalXHROpen.apply(this, arguments);
  };
}

function stopMonitor() {
  window.fetch = originalFetch;
  XMLHttpRequest.prototype.open = originalXHROpen;
  uninstallPopupBlock();
}

scan(document, 'main');
try { performance.getEntriesByType('resource').forEach(function(e) { if (!isAdUrl(e.name)) findUrls(e.name, 'network:perf'); }); } catch(e) {}
installMonitor();
installPopupBlock();

function runAutoClickAndRescan(silent) {
  var beforeCount = urls.size;
  var clicked = 0;
  blockPopupsDuring(2500, function() {
    clicked = autoClickPlayButtons(document, 0, !silent);
  });
  setTimeout(function() {
    scan(document, 'autoclick-rescan');
    var afterCount = urls.size;
    var found = afterCount - beforeCount;
    if (found > 0) {
      toast('▶ Tự động Play: tìm thêm ' + found + ' luồng mới');
      if (document.getElementById('__uvd__')) buildUI();
      setTimeout(function() {
        var n = pauseAllPlayingVideos();
        if (n > 0) toast('⏸ Đã tạm dừng video gốc, xem qua player script cho ổn định');
      }, 800);
    } else if (!silent) {
      toast(clicked > 0 ? 'Đã bấm Play nhưng chưa thấy link mới, thử lại sau vài giây' : 'Không tìm thấy nút Play trên trang này');
    }
  }, 1200);
}

function blockPopupsDuring(durationMs, fn) {
  installPopupBlock();
  fn();
}

window.__uvd_autoClickPlay = function() { runAutoClickAndRescan(false); };
setTimeout(function() { runAutoClickAndRescan(true); }, 400);

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
  if (navigator.share) {
    navigator.share({ title: pageInfo.title, url: url }).catch(function() { toast('Không thể chia sẻ'); });
  } else {
    toast('Thiết bị không hỗ trợ chia sẻ');
  }
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

// ========== ORIENTATION LOCK ==========
function lockOrientation(video) {
  if (!video || !video.videoWidth || !video.videoHeight) return;
  var isPortrait = video.videoHeight > video.videoWidth;
  var target = isPortrait ? 'portrait' : 'landscape';
  try {
    if (screen.orientation && screen.orientation.lock) screen.orientation.lock(target).catch(function(){});
  } catch(e) {}
}

function unlockOrientation() {
  try {
    if (screen.orientation && screen.orientation.unlock) screen.orientation.unlock();
  } catch(e) {}
}

// ========== PLAYER STATE ==========
var playerState = {
  overlay: null,
  mini: null,
  video: null,
  hls: null,
  qualities: [],
  currentQuality: 0,
  speed: 1,
  isMinimized: false,
  url: '',
  type: '',
  resolution: '',
  bandwidth: 0,
  _displayedResolution: '',
  onFullscreenChange: null
};

// ========== OVERLAY PLAYER ==========
function showVideoPlayer(url, type) {
  if (playerState.overlay && playerState.url === url) return;
  if (playerState.overlay) closePlayer();
  playerState.url = url;
  playerState.type = type;
  playerState._displayedResolution = '';
  pauseAllPlayingVideos();

  var overlay = document.createElement('div');
  overlay.id = '__uvd_player_overlay__';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);z-index:2147483648;display:flex;flex-direction:column;animation:uvdFadeIn 0.3s ease;';
  document.body.appendChild(overlay);
  playerState.overlay = overlay;

  var header = document.createElement('div');
  header.style.cssText = 'padding:10px 16px;background:rgba(20,22,30,0.65);backdrop-filter:blur(20px) saturate(180%);-webkit-backdrop-filter:blur(20px) saturate(180%);display:flex;flex-direction:column;flex-shrink:0;border-bottom:1px solid rgba(255,255,255,0.2);box-shadow:0 4px 20px rgba(0,0,0,0.5);';

  var titleRow = document.createElement('div');
  titleRow.style.cssText = 'display:flex;align-items:center;justify-content:space-between;';
  var titleInfo = document.createElement('div');
  titleInfo.className = 'uvd-title-info';
  titleInfo.style.cssText = 'min-width:0;flex:1;';
  titleInfo.innerHTML = '<div style="font-weight:600;font-size:14px;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">▶ ' + pageInfo.title + '</div><div style="font-size:11px;color:#aaa;margin-top:2px;">' + type + '</div>';
  titleRow.appendChild(titleInfo);

  var btnGroup = document.createElement('div');
  btnGroup.style.cssText = 'display:flex;gap:6px;flex-shrink:0;';
  var minVideoBtn = document.createElement('button');
  minVideoBtn.className = 'uvd-btn uvd-btn-sm';
  minVideoBtn.style.cssText = 'background:rgba(255,255,255,0.15);color:#fff;font-size:12px;';
  minVideoBtn.textContent = '⛶';
  minVideoBtn.onclick = minimizePlayer;
  btnGroup.appendChild(minVideoBtn);
  var closeBtn = document.createElement('button');
  closeBtn.id = '__uvd_player_close__';
  closeBtn.className = 'uvd-btn uvd-btn-sm';
  closeBtn.style.cssText = 'background:rgba(255,0,0,0.3);color:#fff;';
  closeBtn.textContent = '✕';
  btnGroup.appendChild(closeBtn);
  titleRow.appendChild(btnGroup);
  header.appendChild(titleRow);

  var toolbar = document.createElement('div');
  toolbar.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;margin-top:8px;';
  var qualityBtn = document.createElement('button');
  qualityBtn.className = 'uvd-btn uvd-btn-sm';
  qualityBtn.style.cssText = 'background:rgba(255,255,255,0.1);color:#fff;font-size:12px;';
  qualityBtn.textContent = 'Chất lượng';
  qualityBtn.onclick = function() {
    if (playerState.qualities.length > 0) showQualitySubMenu();
    else toast('Không có chất lượng để chọn');
  };
  toolbar.appendChild(qualityBtn);
  var speedBtn = document.createElement('button');
  speedBtn.className = 'uvd-btn uvd-btn-sm';
  speedBtn.style.cssText = 'background:rgba(255,255,255,0.1);color:#fff;font-size:12px;';
  speedBtn.textContent = 'Tốc độ';
  speedBtn.onclick = showSpeedSubMenu;
  toolbar.appendChild(speedBtn);
  var fsBtn = document.createElement('button');
  fsBtn.className = 'uvd-btn uvd-btn-sm';
  fsBtn.style.cssText = 'background:rgba(255,255,255,0.1);color:#fff;font-size:12px;';
  fsBtn.textContent = 'Toàn màn hình';
  fsBtn.onclick = function() {
    var videoWrapper = document.getElementById('__uvd_video_wrapper__');
    var fs = videoWrapper.requestFullscreen || videoWrapper.webkitRequestFullscreen || videoWrapper.mozRequestFullScreen || videoWrapper.msRequestFullscreen;
    if (fs) fs.call(videoWrapper);
  };
  toolbar.appendChild(fsBtn);
  if (type === 'MP4' || type === 'MKV' || type === 'WEBM') {
    var downloadBtn = document.createElement('button');
    downloadBtn.className = 'uvd-btn uvd-btn-sm';
    downloadBtn.style.cssText = 'background:rgba(34,197,94,0.3);color:#fff;font-size:12px;';
    downloadBtn.textContent = 'Tải xuống';
    downloadBtn.onclick = function() {
      var a = document.createElement('a');
      a.href = url;
      a.download = pageInfo.title + '.' + type.toLowerCase();
      document.body.appendChild(a);
      a.click();
      a.remove();
      toast('Đang tải xuống...');
    };
    toolbar.appendChild(downloadBtn);
  }
  if (type === 'M3U8' || type === 'MPD') {
    var shareBtn = document.createElement('button');
    shareBtn.className = 'uvd-btn uvd-btn-sm';
    shareBtn.style.cssText = 'background:rgba(139,92,246,0.3);color:#fff;font-size:12px;';
    shareBtn.textContent = 'Chia sẻ';
    shareBtn.onclick = function() { shareUrl(url); };
    toolbar.appendChild(shareBtn);
  }
  header.appendChild(toolbar);
  overlay.appendChild(header);

  var videoWrapper = document.createElement('div');
  videoWrapper.id = '__uvd_video_wrapper__';
  videoWrapper.style.cssText = 'flex:1;display:flex;align-items:center;justify-content:center;background:#000;position:relative;overflow:hidden;';
  var video = document.createElement('video');
  video.id = '__uvd_player_video__';
  video.style.cssText = 'max-width:100%;max-height:100%;width:auto;height:auto;display:block;object-fit:contain;';
  video.setAttribute('controls', '');
  video.setAttribute('playsinline', '');
  video.setAttribute('webkit-playsinline', '');
  video.setAttribute('crossorigin', 'anonymous');
  videoWrapper.appendChild(video);
  overlay.appendChild(videoWrapper);
  playerState.video = video;

  var footer = document.createElement('div');
  footer.style.cssText = 'padding:8px 16px;background:rgba(0,0,0,0.7);border-top:1px solid rgba(255,255,255,0.1);font-size:12px;color:#aaa;display:flex;justify-content:space-between;flex-shrink:0;';
  footer.innerHTML = '<span id="__uvd_player_status__">Đang tải...</span><span id="__uvd_player_size__" style="color:#8ab4ff;">Đang ước tính dung lượng...</span><span id="__uvd_player_time__"></span>';
  overlay.appendChild(footer);

  function showQualitySubMenu() {
    var overlay2 = document.createElement('div');
    overlay2.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:2147483649;display:flex;align-items:center;justify-content:center;';
    var panel = document.createElement('div');
    panel.style.cssText = 'background:rgba(20,22,30,0.95);border-radius:16px;padding:20px;min-width:250px;max-width:90%;border:1px solid rgba(255,255,255,0.15);';
    panel.innerHTML = '<div style="color:#fff;font-weight:600;margin-bottom:12px;">Chọn chất lượng</div>';
    var sel = document.createElement('select');
    sel.style.cssText = 'width:100%;padding:10px;background:rgba(255,255,255,0.1);color:#fff;border:1px solid rgba(255,255,255,0.2);border-radius:8px;font-size:14px;';
    playerState.qualities.forEach(function(q, idx) {
      var opt = document.createElement('option');
      opt.value = idx;
      opt.textContent = q.label + (q.resolution !== 'unknown' ? ' (' + q.resolution + ')' : '');
      sel.appendChild(opt);
    });
    sel.onchange = function() {
      var idx = parseInt(this.value);
      var q = playerState.qualities[idx];
      if (q && playerState.hls) {
        var levels = playerState.hls.levels;
        for (var i = 0; i < levels.length; i++) {
          if (levels[i].height === parseInt(q.resolution.split('x')[1]) || levels[i].bitrate === q.bandwidth) {
            playerState.hls.currentLevel = i;
            break;
          }
        }
        toast('Chuyển sang ' + q.label);
      }
      overlay2.remove();
    };
    panel.appendChild(sel);
    var closeBtn = document.createElement('button');
    closeBtn.textContent = 'Đóng';
    closeBtn.style.cssText = 'width:100%;margin-top:12px;padding:10px;background:rgba(255,0,0,0.3);color:#fff;border:0;border-radius:8px;font-weight:600;';
    closeBtn.onclick = function() { overlay2.remove(); };
    panel.appendChild(closeBtn);
    overlay2.appendChild(panel);
    document.body.appendChild(overlay2);
  }

  function showSpeedSubMenu() {
    var overlay2 = document.createElement('div');
    overlay2.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:2147483649;display:flex;align-items:center;justify-content:center;';
    var panel = document.createElement('div');
    panel.style.cssText = 'background:rgba(20,22,30,0.95);border-radius:16px;padding:20px;min-width:250px;max-width:90%;border:1px solid rgba(255,255,255,0.15);';
    panel.innerHTML = '<div style="color:#fff;font-weight:600;margin-bottom:12px;">Chọn tốc độ</div>';
    var speeds = [0.5, 0.75, 1, 1.25, 1.5, 2];
    var grid = document.createElement('div');
    grid.style.cssText = 'display:grid;grid-template-columns:repeat(3,1fr);gap:8px;';
    speeds.forEach(function(s) {
      var btn = document.createElement('button');
      btn.textContent = s + 'x';
      btn.style.cssText = 'padding:10px;background:rgba(255,255,255,0.1);color:#fff;border:1px solid rgba(255,255,255,0.2);border-radius:8px;cursor:pointer;font-size:14px;';
      if (s === 1) btn.style.background = 'rgba(109,140,255,0.3)';
      btn.onclick = function() {
        video.playbackRate = s;
        toast('Tốc độ: ' + s + 'x');
        overlay2.remove();
      };
      grid.appendChild(btn);
    });
    panel.appendChild(grid);
    var closeBtn = document.createElement('button');
    closeBtn.textContent = 'Đóng';
    closeBtn.style.cssText = 'width:100%;margin-top:12px;padding:10px;background:rgba(255,0,0,0.3);color:#fff;border:0;border-radius:8px;font-weight:600;';
    closeBtn.onclick = function() { overlay2.remove(); };
    panel.appendChild(closeBtn);
    overlay2.appendChild(panel);
    document.body.appendChild(overlay2);
  }

  var isHls = url.includes('.m3u8') || url.includes('m3u8');
  var activeHls = null;

  function updateTitleDisplay() {
    var infoDiv = document.querySelector('#__uvd_player_overlay__ .uvd-title-info');
    if (!infoDiv) return;
    var currentRes = '';
    if (video && video.videoWidth && video.videoHeight) {
      currentRes = video.videoWidth + 'x' + video.videoHeight;
    } else if (playerState.resolution) {
      currentRes = playerState.resolution;
    }
    if (playerState._displayedResolution !== currentRes) {
      playerState._displayedResolution = currentRes;
      var sub = playerState.type + (currentRes ? ' · ' + currentRes : '');
      infoDiv.innerHTML = '<div style="font-weight:600;font-size:14px;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">▶ ' + pageInfo.title + '</div><div style="font-size:11px;color:#aaa;margin-top:2px;">' + sub + '</div>';
    }
  }

  function formatBytes(bytes) {
    if (!bytes || bytes <= 0) return null;
    var units = ['B', 'KB', 'MB', 'GB'];
    var i = 0;
    while (bytes >= 1024 && i < units.length - 1) { bytes /= 1024; i++; }
    return bytes.toFixed(i === 0 ? 0 : 1) + ' ' + units[i];
  }

  function updateSizeEstimate() {
    var el = document.getElementById('__uvd_player_size__');
    if (!el) return;
    if (isHls && playerState.hls) {
      var lvl = playerState.hls.levels[playerState.hls.currentLevel];
      var bw = lvl ? lvl.bitrate : playerState.bandwidth;
      if (bw && video.duration) {
        var bytes = (bw / 8) * video.duration;
        var s = formatBytes(bytes);
        el.textContent = s ? '≈ ' + s : 'Không rõ dung lượng';
      } else {
        el.textContent = 'Đang ước tính dung lượng...';
      }
    } else {
      el.textContent = 'Đang kiểm tra dung lượng...';
      fetch(url, { method: 'HEAD', headers: { 'Referer': pageInfo.referer } })
        .then(function(r) {
          var len = r.headers.get('content-length');
          var s = len ? formatBytes(parseInt(len)) : null;
          el.textContent = s ? '≈ ' + s : 'Không rõ dung lượng';
        })
        .catch(function() { el.textContent = 'Không rõ dung lượng'; });
    }
  }

  var statusEl = document.getElementById('__uvd_player_status__');
  video.addEventListener('waiting', function() { if (statusEl) statusEl.textContent = '• Đang buffering...'; });
  video.addEventListener('playing', function() { if (statusEl) statusEl.textContent = '• Đang phát'; });
  video.addEventListener('ended', function() { if (statusEl) statusEl.textContent = '• Đã kết thúc'; });
  video.addEventListener('pause', function() { if (statusEl && !video.ended) statusEl.textContent = '• Tạm dừng'; });

  function onMetadataLoaded() {
    lockOrientation(video);
    if (statusEl) statusEl.textContent = '• Đang phát';
    if (video.videoWidth && video.videoHeight && !playerState.resolution) {
      playerState.resolution = video.videoWidth + 'x' + video.videoHeight;
    }
    updateTitleDisplay();
    updateSizeEstimate();
    if (isHls && playerState.qualities.length === 0) {
      parseM3U8Master(url, function(qualities) {
        if (qualities && qualities.length > 0) {
          playerState.qualities = qualities;
          updateSizeEstimate();
        }
      });
    }
  }

  video.addEventListener('loadedmetadata', onMetadataLoaded);
  video.addEventListener('durationchange', updateSizeEstimate);
  video.addEventListener('timeupdate', function() {
    var t = video.currentTime;
    var d = video.duration;
    if (d) document.getElementById('__uvd_player_time__').textContent = formatTime(t) + ' / ' + formatTime(d);
    updateTitleDisplay();
  });

  function formatTime(sec) {
    var m = Math.floor(sec / 60);
    var s = Math.floor(sec % 60);
    return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
  }

  if (isHls) {
    if (window.Hls && Hls.isSupported()) {
      activeHls = new Hls();
      activeHls.loadSource(url);
      activeHls.attachMedia(video);
      activeHls.on(Hls.Events.MANIFEST_PARSED, function() {
        setTimeout(function() { lockOrientation(video); }, 100);
        parseM3U8Master(url, function(qualities) {
          if (qualities && qualities.length > 0) {
            playerState.qualities = qualities;
            updateSizeEstimate();
          }
        });
      });
      activeHls.on(Hls.Events.LEVEL_SWITCHED, function(event, data) {
        var lvl = activeHls.levels[data.level];
        if (lvl) {
          playerState.resolution = (lvl.width && lvl.height) ? (lvl.width + 'x' + lvl.height) : '';
          playerState.bandwidth = lvl.bitrate || 0;
        }
        updateTitleDisplay();
        updateSizeEstimate();
      });
      playerState.hls = activeHls;
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = url;
    } else {
      var s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/hls.js@latest';
      s.onload = function() { showVideoPlayer(url, type); };
      document.head.appendChild(s);
      return;
    }
  } else {
    video.src = url;
  }

  document.getElementById('__uvd_player_close__').onclick = function() {
    closePlayer();
    document.getElementById('__uvd_stream_list__').style.display = 'block';
  };

  function onFullscreenChange() {
    var isFullscreen = !!(document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement);
    if (isFullscreen) lockOrientation(video);
    else unlockOrientation();
  }
  playerState.onFullscreenChange = onFullscreenChange;
  document.addEventListener('fullscreenchange', onFullscreenChange);
  document.addEventListener('webkitfullscreenchange', onFullscreenChange);
  document.addEventListener('mozfullscreenchange', onFullscreenChange);
  document.addEventListener('MSFullscreenChange', onFullscreenChange);
}

function minimizePlayer() {
  if (playerState.isMinimized) return;
  playerState.isMinimized = true;
  var overlay = playerState.overlay;
  var video = playerState.video;
  video.pause();
  
  var mini = document.createElement('div');
  mini.id = '__uvd_player_mini__';
  mini.style.cssText = 'position:fixed;bottom:20px;right:20px;width:160px;height:90px;background:#000;border-radius:12px;z-index:2147483647;cursor:pointer;box-shadow:0 8px 30px rgba(0,0,0,0.8);border:2px solid rgba(255,255,255,0.2);overflow:hidden;transition: opacity 0.25s ease, transform 0.25s ease;';
  
  var canvas = document.createElement('canvas');
  canvas.width = 160;
  canvas.height = 90;
  var ctx = canvas.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, 160, 90);
  if (video.videoWidth) {
    try { ctx.drawImage(video, 0, 0, 160, 90); } catch(e) {}
  }
  mini.appendChild(canvas);
  
  var label = document.createElement('div');
  label.textContent = '▶ ' + pageInfo.title;
  label.style.cssText = 'position:absolute;bottom:4px;left:8px;color:#fff;font-size:11px;font-weight:600;text-shadow:0 2px 4px rgba(0,0,0,0.8);background:rgba(0,0,0,0.5);padding:2px 8px;border-radius:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:90%;';
  mini.appendChild(label);
  
  document.body.appendChild(mini);
  playerState.mini = mini;
  
  overlay.style.transition = 'opacity 0.25s ease';
  overlay.style.opacity = '0';
  setTimeout(function() { overlay.style.display = 'none'; }, 260);
  mini.onclick = restorePlayer;
}

function restorePlayer() {
  if (!playerState.isMinimized) return;
  playerState.isMinimized = false;
  var overlay = playerState.overlay;
  var mini = playerState.mini;
  if (mini) {
    mini.style.transition = 'opacity 0.2s ease';
    mini.style.opacity = '0';
    setTimeout(function() { mini.remove(); }, 220);
    playerState.mini = null;
  }
  overlay.style.display = 'flex';
  overlay.style.transition = 'opacity 0.25s ease';
  overlay.style.opacity = '1';
  if (playerState.video) {
    playerState.video.play().catch(function(){});
  }
}

function closePlayer() {
  if (playerState.overlay) {
    if (playerState.mini) { playerState.mini.remove(); playerState.mini = null; }
    if (playerState.video) {
      playerState.video.pause();
      playerState.video.src = '';
    }
    if (playerState.hls) { playerState.hls.destroy(); playerState.hls = null; }
    if (playerState.onFullscreenChange) {
      document.removeEventListener('fullscreenchange', playerState.onFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', playerState.onFullscreenChange);
      document.removeEventListener('mozfullscreenchange', playerState.onFullscreenChange);
      document.removeEventListener('MSFullscreenChange', playerState.onFullscreenChange);
    }
    unlockOrientation();
    playerState.overlay.remove();
    playerState.overlay = null;
    playerState.video = null;
    playerState.isMinimized = false;
    playerState.qualities = [];
    playerState.resolution = '';
    playerState.bandwidth = 0;
  }
}

// ========== CSS ==========
if (document.getElementById('__uvd_css__')) document.getElementById('__uvd_css__').remove();
var style = document.createElement('style');
style.id = '__uvd_css__';
style.textContent = `
@keyframes uvdSlideIn{from{transform:translate(-50%,-20px);opacity:0}to{transform:translate(-50%,0);opacity:1}}
@keyframes uvdPulse{0%,100%{opacity:1;box-shadow:0 0 5px var(--accent)}50%{opacity:0.4;box-shadow:0 0 20px var(--accent)}}
@keyframes uvdScaleIn{from{opacity:0;transform:scale(0.94)}to{opacity:1;transform:scale(1)}}
@keyframes uvdRipple{to{transform:scale(4);opacity:0}}
@keyframes uvdCardEnter{from{opacity:0;transform:translateY(15px)}to{opacity:1;transform:translateY(0)}}
@keyframes uvdFloatBtnIn{from{transform:scale(0);opacity:0}to{transform:scale(1);opacity:1}}
@keyframes uvdLiquidDrift{0%{transform:translate(-6%,-4%) scale(1)}50%{transform:translate(4%,6%) scale(1.12)}100%{transform:translate(-6%,-4%) scale(1)}}
@keyframes uvdFadeIn{from{opacity:0}to{opacity:1}}
:root{--bg:rgba(3,4,8,0.97);--glass:rgba(12,14,20,0.85);--glass-hi:rgba(255,255,255,0.06);--border:rgba(255,255,255,0.08);--text:#f3f5ff;--text2:#9ca3bd;--text3:#5d6377;--accent:#6d8cff;--accent2:#b98bff;--danger:#ff5d72;--gold:#ffb84d;--card-bg:rgba(255,255,255,0.03);--fs-xs:11px;--fs-sm:12px;--fs-base:13px;--fs-md:14px;--fs-lg:16px;--radius-sm:12px;--radius-md:16px;--radius-lg:26px;--grad-liquid:linear-gradient(135deg,var(--accent),var(--accent2))}
*{box-sizing:border-box}
.uvd-overlay{position:fixed;inset:0;background:rgba(2,3,6,0.92);backdrop-filter:blur(18px) saturate(120%);z-index:2147483648;display:flex;align-items:center;justify-content:center;padding:16px;overflow-y:auto}
.uvd-glass-panel{background:var(--glass);backdrop-filter:blur(28px) saturate(130%);-webkit-backdrop-filter:blur(28px) saturate(130%);border:1px solid var(--border);border-radius:var(--radius-lg);box-shadow:0 20px 50px rgba(0,0,0,0.8),0 0 0 1px rgba(255,255,255,0.03) inset,0 1px 0 rgba(255,255,255,0.08) inset;color:var(--text);font-family:-apple-system,BlinkMacSystemFont,'SF Pro Display','Segoe UI',Roboto,sans-serif;font-size:var(--fs-base);padding:16px;width:100%;position:relative;overflow:hidden;max-width:1000px;margin:auto}
.uvd-glass-panel::before{content:'';position:absolute;top:0;left:8%;right:8%;height:1px;z-index:2;background:linear-gradient(90deg,transparent,rgba(109,140,255,0.6),rgba(185,139,255,0.6),transparent);opacity:0.7}
.uvd-liquid-bg{position:absolute;inset:-30%;z-index:0;pointer-events:none;background:radial-gradient(closest-side,rgba(109,140,255,0.12),transparent 70%) 15% 20%/55% 55% no-repeat,radial-gradient(closest-side,rgba(185,139,255,0.10),transparent 70%) 85% 75%/60% 60% no-repeat;filter:blur(50px);animation:uvdLiquidDrift 16s ease-in-out infinite}
@media (prefers-reduced-motion:reduce){.uvd-liquid-bg{animation:none}}
.uvd-panel-content{position:relative;z-index:1;display:flex;flex-direction:column;height:100%;min-height:0}
.uvd-scroll::-webkit-scrollbar{width:4px}
.uvd-scroll::-webkit-scrollbar-thumb{background:var(--accent);border-radius:4px}
.uvd-scroll::-webkit-scrollbar-track{background:transparent}
.uvd-btn{background:var(--glass-hi);border:1px solid var(--border);color:var(--text);padding:9px 16px;border-radius:var(--radius-md);font-weight:600;font-size:var(--fs-base);cursor:pointer;transition:all 0.2s;backdrop-filter:blur(10px);text-align:center;position:relative;overflow:hidden;display:inline-block;box-shadow:0 3px 10px rgba(0,0,0,0.4),0 1px 0 rgba(255,255,255,0.08) inset;line-height:1.3}
.uvd-btn:hover{background:rgba(255,255,255,0.10);border-color:rgba(255,255,255,0.20);transform:translateY(-1px);box-shadow:0 5px 14px rgba(0,0,0,0.5),0 1px 0 rgba(255,255,255,0.12) inset}
.uvd-btn:active{transform:scale(0.96)}
.uvd-btn-sm{padding:7px 12px;font-size:var(--fs-sm);border-radius:var(--radius-sm)}
.uvd-btn-icon{background:var(--glass-hi);border:1px solid var(--border);color:var(--text);width:34px;height:34px;border-radius:var(--radius-sm);cursor:pointer;display:inline-flex;align-items:center;justify-content:center;transition:all 0.2s;backdrop-filter:blur(10px);position:relative;overflow:hidden;box-shadow:0 3px 8px rgba(0,0,0,0.35),0 1px 0 rgba(255,255,255,0.08) inset}
.uvd-btn-icon:hover{background:rgba(255,255,255,0.10);border-color:rgba(255,255,255,0.20)}
.uvd-btn-icon:active{transform:scale(0.92)}
.uvd-card{background:var(--card-bg);border:1px solid var(--border);border-radius:var(--radius-md);padding:14px;margin-bottom:10px;font-size:var(--fs-base);backdrop-filter:blur(6px);box-shadow:0 1px 0 rgba(255,255,255,0.04) inset;transition:transform 0.3s cubic-bezier(.4,0,.2,1),box-shadow 0.3s ease,background 0.3s ease,border-color 0.3s ease;animation:uvdCardEnter 0.4s ease both;color:var(--text)}
.uvd-card:hover{transform:translateY(-3px);box-shadow:0 14px 30px rgba(0,0,0,0.7),0 0 0 1px rgba(109,140,255,0.30) inset,0 0 24px rgba(109,140,255,0.08);background:rgba(255,255,255,0.05);border-color:rgba(109,140,255,0.25)}
.uvd-type-badge{display:inline-block;padding:4px 12px;border-radius:var(--radius-sm);font-size:var(--fs-xs);font-weight:700;background:linear-gradient(135deg,rgba(109,140,255,0.22),rgba(185,139,255,0.18));color:var(--accent);border:1px solid rgba(109,140,255,0.28);letter-spacing:0.03em}
.uvd-url-box{background:rgba(0,0,0,0.5);border-radius:var(--radius-sm);padding:12px;font-family:'SFMono-Regular',Consolas,monospace;font-size:var(--fs-sm);word-break:break-all;color:var(--text2);max-height:100px;overflow-y:auto;line-height:1.5;border:1px solid rgba(255,255,255,0.04)}
.uvd-grid-2{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.uvd-grid-3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px}
.uvd-tabbar{position:relative;display:flex;gap:2px;padding:4px;background:rgba(255,255,255,0.04);border:1px solid var(--border);border-radius:999px;margin-bottom:10px;flex-shrink:0}
.uvd-tab-indicator{position:absolute;top:4px;bottom:4px;left:4px;width:0;border-radius:999px;background:var(--grad-liquid);z-index:0;box-shadow:0 3px 12px rgba(109,140,255,0.45);transition:transform 0.4s cubic-bezier(.4,0,.2,1),width 0.4s cubic-bezier(.4,0,.2,1)}
.uvd-tab{position:relative;z-index:1;flex:1;min-width:0;background:transparent;border:none;color:var(--text2);font-weight:600;font-size:var(--fs-sm);padding:9px 6px;border-radius:999px;cursor:pointer;transition:color 0.25s;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.uvd-tab.uvd-tab-active{color:#fff;text-shadow:0 1px 4px rgba(0,0,0,0.3)}
.uvd-ripple{position:absolute;border-radius:50%;background:rgba(255,255,255,0.5);transform:scale(0);animation:uvdRipple 0.6s ease-out}
.uvd-profile-card{display:flex;align-items:center;gap:14px;background:linear-gradient(135deg,rgba(109,140,255,0.14),rgba(185,139,255,0.08));border:1px solid rgba(109,140,255,0.25);border-radius:var(--radius-lg);padding:16px;margin-bottom:10px;animation:uvdCardEnter 0.4s ease both}
.uvd-profile-avatar{flex-shrink:0;width:56px;height:56px;border-radius:50%;background:var(--grad-liquid);color:#fff;font-weight:700;font-size:18px;display:flex;align-items:center;justify-content:center;box-shadow:0 6px 18px rgba(109,140,255,0.4),0 0 0 3px rgba(255,255,255,0.08)}
.uvd-profile-info{min-width:0}
.uvd-profile-name{font-weight:700;font-size:15px;color:var(--text)}
.uvd-profile-role{font-size:11.5px;color:var(--text2);margin-top:2px}
.uvd-profile-tags{display:flex;flex-wrap:wrap;gap:5px;margin-top:8px}
.uvd-tag{font-size:10px;font-weight:600;padding:3px 9px;border-radius:999px;background:rgba(255,255,255,0.08);border:1px solid var(--border);color:var(--text2)}
.uvd-profile-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:14px}
.uvd-stat{background:var(--card-bg);border:1px solid var(--border);border-radius:var(--radius-md);padding:10px 6px;text-align:center}
.uvd-stat-num{font-size:18px;font-weight:700;color:var(--accent)}
.uvd-stat-label{font-size:10px;color:var(--text3);margin-top:2px}
.uvd-section-title{display:flex;align-items:center;gap:8px;font-weight:700;font-size:13px;color:var(--text);margin:16px 0 8px}
.uvd-section-num{width:20px;height:20px;border-radius:50%;background:var(--grad-liquid);color:#fff;font-size:11px;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;box-shadow:0 2px 8px rgba(109,140,255,0.4)}
.uvd-timeline-card{border-left:2px solid rgba(109,140,255,0.3)}
.uvd-inline-code{display:inline-block;background:rgba(0,0,0,0.35);padding:3px 9px;border-radius:6px;color:var(--accent2);font-family:'SFMono-Regular',Consolas,monospace;font-size:11px;border:1px solid rgba(255,255,255,0.06);margin:2px 0}
.uvd-profile-footer{text-align:center;font-size:11px;color:var(--text3);margin-top:14px;padding-top:12px;border-top:1px solid var(--border)}
/* Float button styles */
#__uvd_min_float__{position:fixed;bottom:20px;right:20px;z-index:2147483648;display:flex;gap:8px;background:rgba(12,14,20,0.9);backdrop-filter:blur(20px);border-radius:30px;padding:6px;box-shadow:0 8px 25px rgba(0,0,0,0.7);border:1px solid rgba(255,255,255,0.15);animation:uvdFloatBtnIn 0.35s ease}
#__uvd_min_float__ .uvd-float-btn{width:40px;height:40px;border-radius:50%;background:rgba(255,255,255,0.1);border:none;color:#fff;font-size:18px;display:flex;align-items:center;justify-content:center;cursor:pointer;transition:0.2s}
#__uvd_min_float__ .uvd-float-btn:hover{background:rgba(255,255,255,0.2);transform:scale(1.08)}
`;
document.head.appendChild(style);

// ========== SCRIPT MINIMIZE / RESTORE ==========
function minimizeScriptPanel() {
  var panel = document.getElementById('__uvd__');
  if (!panel) return;
  panel.style.display = 'none';

  var existingFloat = document.getElementById('__uvd_min_float__');
  if (existingFloat) existingFloat.remove();

  var float = document.createElement('div');
  float.id = '__uvd_min_float__';
  float.innerHTML = `
    <button class="uvd-float-btn" id="__uvd_float_play__" title="Tự động Play">▶</button>
    <button class="uvd-float-btn" id="__uvd_float_restore__" title="Mở rộng Script">🗖</button>
    <button class="uvd-float-btn" id="__uvd_float_reload__" title="Làm mới">↻</button>
    <button class="uvd-float-btn" id="__uvd_float_close__" title="Đóng Script">✕</button>
  `;
  document.body.appendChild(float);

  document.getElementById('__uvd_float_play__').onclick = function() {
    autoClickPlayButtons(document, 0, false);
    toast('Đã thử bấm Play');
  };
  document.getElementById('__uvd_float_restore__').onclick = restoreScriptPanel;
  document.getElementById('__uvd_float_reload__').onclick = function() {
    restoreScriptPanel();
    buildUI();
    toast('Đã làm mới');
  };
  document.getElementById('__uvd_float_close__').onclick = function() {
    float.remove();
    stopMonitor();
    var p = document.getElementById('__uvd__');
    if (p) p.remove();
  };
}

function restoreScriptPanel() {
  var panel = document.getElementById('__uvd__');
  if (panel) panel.style.display = '';
  var float = document.getElementById('__uvd_min_float__');
  if (float) float.remove();
}

// ========== BUILD UI MAIN ==========
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
  
  var header = document.createElement('div');
  header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding-bottom:12px;border-bottom:1px solid var(--border);margin-bottom:10px;flex-shrink:0;';
  header.innerHTML = 
    '<div style="display:flex;align-items:center;gap:8px;">' +
      '<span style="width:10px;height:10px;background:var(--grad-liquid);border-radius:50%;animation:uvdPulse 2s infinite;box-shadow:0 0 8px rgba(109,140,255,0.6);"></span>' +
      '<span style="font-weight:700;font-size:16px;letter-spacing:-0.01em;">UMP DL <span style="background:var(--grad-liquid);-webkit-background-clip:text;background-clip:text;color:transparent;">V' + VERSION + '</span></span>' +
    '</div>' +
    '<div style="display:flex;gap:6px;">' +
      '<button class="uvd-btn-icon" id="__uvd_autoplay__" title="Tự động bấm Play">▶</button>' +
      '<button class="uvd-btn-icon" id="__uvd_minimize_script__" title="Thu nhỏ Script">🗕</button>' +
      '<button class="uvd-btn-icon" id="__uvd_refresh__" title="Làm mới">↻</button>' +
      '<button class="uvd-btn-icon" id="__uvd_close__" title="Đóng">×</button>' +
    '</div>';
  content.appendChild(header);
  
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
  
  var info = document.createElement('div');
  info.style.cssText = 'margin-bottom:10px;font-size:12px;flex-shrink:0;';
  var savedPlaySel = (data.siteProfiles[pageInfo.host] && data.siteProfiles[pageInfo.host].playSelector) || '';
  info.innerHTML = 
    '<span style="color:var(--text2);">Tên: </span>' +
    '<span id="__uvd_title__" style="color:var(--accent);text-decoration:underline;cursor:pointer;">' + pageInfo.title + '</span> ' +
    '<span style="color:var(--text3);">(sửa)</span><br>' +
    '<span style="color:var(--text2);">Referer: </span>' +
    '<span id="__uvd_referer__" style="color:var(--accent2);font-family:monospace;text-decoration:underline;cursor:pointer;font-size:11px;">' + pageInfo.referer + '</span><br>' +
    '<span style="color:var(--text2);">Play selector: </span>' +
    '<span id="__uvd_playsel__" style="color:var(--accent2);font-family:monospace;text-decoration:underline;cursor:pointer;font-size:11px;">' + (savedPlaySel || '(chưa đặt · bấm để thêm)') + '</span>';
  content.appendChild(info);
  
  var contentWrapper = document.createElement('div');
  contentWrapper.className = 'uvd-scroll';
  contentWrapper.style.cssText = 'flex:1;overflow:hidden;position:relative;min-height:0;';
  
  var streamList = document.createElement('div');
  streamList.id = '__uvd_stream_list__';
  streamList.className = 'uvd-scroll';
  streamList.style.cssText = 'overflow-y:auto;height:100%;padding-right:4px;';
  contentWrapper.appendChild(streamList);
  
  content.appendChild(contentWrapper);
  
  var footer = document.createElement('div');
  footer.style.cssText = 'display:flex;gap:6px;margin-top:10px;flex-wrap:wrap;flex-shrink:0;';
  ['TXT','JSON','M3U','CSV'].forEach(function(f) {
    var btn = document.createElement('button');
    btn.className = 'uvd-btn uvd-btn-sm';
    btn.textContent = f;
    btn.style.flex = '1 0 auto';
    btn.onclick = function() { exportData(f.toLowerCase()); };
    footer.appendChild(btn);
  });
  content.appendChild(footer);
  
  var author = document.createElement('div');
  author.style.cssText = 'text-align:center;font-size:11px;color:var(--text3);margin-top:8px;flex-shrink:0;';
  author.textContent = '© nguyenquocngu91';
  content.appendChild(author);
  
  document.body.appendChild(panel);
  
  document.querySelectorAll('.uvd-btn, .uvd-btn-icon, .uvd-tab').forEach(function(btn) {
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
  document.getElementById('__uvd_autoplay__').onclick = function() {
    var n = autoClickPlayButtons(document, 0, false);
    toast(n > 0 ? 'Đã thử bấm Play (' + n + ' nút)' : 'Không tìm thấy nút Play, thử đặt selector riêng ở Cài đặt');
    setTimeout(function() { buildUI(); }, 1200);
  };
  document.getElementById('__uvd_minimize_script__').onclick = minimizeScriptPanel;
  
  document.getElementById('__uvd_title__').onclick = function() {
    var newTitle = prompt('Tên file:', pageInfo.title);
    if (newTitle) { pageInfo.title = newTitle.replace(/[^\w\s\u00C0-\u1EF9.-]/g, '').substring(0,100); this.textContent = pageInfo.title; }
  };
  
  document.getElementById('__uvd_referer__').onclick = function() {
    var newRef = prompt('Referer:', pageInfo.referer);
    if (newRef) {
      pageInfo.referer = newRef;
      this.textContent = newRef;
      data.siteProfiles[pageInfo.host] = Object.assign({}, data.siteProfiles[pageInfo.host], { referer: newRef, userAgent: pageInfo.userAgent });
      storage.set(data);
      toast('Đã lưu referer cho ' + pageInfo.host);
    }
  };
  
  document.getElementById('__uvd_playsel__').onclick = function() {
    var current = (data.siteProfiles[pageInfo.host] && data.siteProfiles[pageInfo.host].playSelector) || '';
    var newSel = prompt('CSS selector của nút Play trên site này (ví dụ: .video-play-button):', current);
    if (newSel !== null) {
      newSel = newSel.trim();
      data.siteProfiles[pageInfo.host] = Object.assign({}, data.siteProfiles[pageInfo.host], { playSelector: newSel });
      storage.set(data);
      this.textContent = newSel || '(chưa đặt · bấm để thêm)';
      if (newSel) {
        toast('Đã lưu selector cho ' + pageInfo.host);
        autoClickPlayButtons(document, 0, false);
        setTimeout(function() { buildUI(); }, 1000);
      } else {
        toast('Đã xóa selector riêng');
      }
    }
  };
  
  window.__uvd_showPlayer = function(url, type) {
    showVideoPlayer(url, type);
  };
}

// ========== RENDER FUNCTIONS ==========
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
        '<button class="uvd-fav-btn" data-url="' + encodeURIComponent(item.url) + '" data-type="' + item.type + '" style="background:none;border:none;font-size:18px;cursor:pointer;color:' + (fav ? 'var(--gold)' : 'var(--text3)') + ';">' + (fav ? '★' : '☆') + '</button>' +
      '</div>' +
      '<div class="uvd-url-box">' + item.url + '</div>' +
      '<div class="uvd-grid-2" style="margin-top:8px;">' +
        '<button class="uvd-btn uvd-btn-sm" data-action="share" data-url="' + encodeURIComponent(item.url) + '" style="background:rgba(139,92,246,0.2);">Chia sẻ</button>' +
        '<button class="uvd-btn uvd-btn-sm" data-action="copy" data-url="' + encodeURIComponent(item.url) + '">Sao chép</button>' +
        (item.type === 'IFRAME' ? 
          '<button class="uvd-btn uvd-btn-sm" data-action="iframe" data-url="' + encodeURIComponent(item.url) + '" style="text-align:center;grid-column:1/3;">Mở iframe</button>' :
          (item.type === 'M3U8' ?
            '<button class="uvd-btn uvd-btn-sm" data-action="quality" data-url="' + encodeURIComponent(item.url) + '">Chất lượng</button>' +
            '<button class="uvd-btn uvd-btn-sm" data-action="play" data-url="' + encodeURIComponent(item.url) + '" data-type="' + item.type + '" style="background:rgba(109,140,255,0.25);">Xem</button>' +
            '<button class="uvd-btn uvd-btn-sm" data-action="cmd" data-url="' + encodeURIComponent(item.url) + '" data-type="' + item.type + '" style="grid-column:1/3;">Lệnh tải</button>' :
            '<button class="uvd-btn uvd-btn-sm" data-action="play" data-url="' + encodeURIComponent(item.url) + '" data-type="' + item.type + '" style="background:rgba(109,140,255,0.25);">Xem</button>' +
            '<button class="uvd-btn uvd-btn-sm" data-action="cmd" data-url="' + encodeURIComponent(item.url) + '" data-type="' + item.type + '">Lệnh tải</button>'
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
      else if (action === 'play') window.__uvd_showPlayer(u, t || 'MP4');
      else if (action === 'cmd') showCommandPicker(u, t);
      else if (action === 'iframe') {
        window.__uvdSafeOpen(u);
      }
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
          '<button class="uvd-btn uvd-btn-sm q-act" data-url="' + encodeURIComponent(q.url) + '" data-action="play" style="background:rgba(109,140,255,0.25);">Xem</button>' +
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
        else if (action === 'play') window.__uvd_showPlayer(u, 'M3U8');
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
  var totalStreams = urls.size;
  var bookmarkletCode = "javascript:(function(){var s=document.createElement('script');s.src='https://cdn.jsdelivr.net/gh/nguyenquocngu93/bookmarklet-@main/umpdl.js?force='+Date.now();document.head.appendChild(s);})();";

  container.innerHTML =
    '<div class="uvd-profile-card">' +
      '<div class="uvd-profile-avatar">NQ</div>' +
      '<div class="uvd-profile-info">' +
        '<div class="uvd-profile-name">nguyenquocngu91</div>' +
        '<div class="uvd-profile-role">Bookmarklet Developer · Universal Media Tools</div>' +
        '<div class="uvd-profile-tags">' +
          '<span class="uvd-tag">UMP DL v' + VERSION + '</span>' +
          '<span class="uvd-tag">Vanilla JS</span>' +
          '<span class="uvd-tag">HLS · M3U8</span>' +
          '<span class="uvd-tag">Adblock</span>' +
        '</div>' +
      '</div>' +
    '</div>' +

    '<div class="uvd-profile-stats" style="grid-template-columns:repeat(4,1fr);">' +
      '<div class="uvd-stat"><div class="uvd-stat-num">' + totalStreams + '</div><div class="uvd-stat-label">Streams</div></div>' +
      '<div class="uvd-stat"><div class="uvd-stat-num">' + data.favorites.length + '</div><div class="uvd-stat-label">Yêu thích</div></div>' +
      '<div class="uvd-stat"><div class="uvd-stat-num">' + (data.history||[]).length + '</div><div class="uvd-stat-label">Lịch sử</div></div>' +
      '<div class="uvd-stat"><div class="uvd-stat-num" style="color:#ff5d72;">' + __uvdBlockedCount + '</div><div class="uvd-stat-label">Đã chặn popup</div></div>' +
    '</div>' +

    '<div class="uvd-card">' +
      '<div style="font-weight:600;margin-bottom:8px;">🛡️ Lọc quảng cáo (Filterlist)</div>' +
      '<div style="font-size:12px;color:var(--text2);margin-bottom:8px;">' +
        'Nhập mỗi dòng một từ khóa hoặc domain (vd: <code>doubleclick.net</code>). Hỗ trợ regex nếu bắt đầu bằng <code>regex:</code>. Các URL chứa pattern sẽ bị bỏ qua.' +
      '</div>' +
      '<textarea id="__uvd_filter_text__" style="width:100%;height:80px;background:rgba(0,0,0,0.5);border:1px solid var(--border);border-radius:10px;color:var(--text);padding:12px;font-size:12px;">' + (data.filterlist||[]).join('\n') + '</textarea>' +
      '<div class="uvd-grid-2" style="margin-top:8px;">' +
        '<button class="uvd-btn uvd-btn-sm" id="__uvd_save_filter__">💾 Lưu</button>' +
        '<button class="uvd-btn uvd-btn-sm" id="__uvd_import_filter__">📂 Import file</button>' +
      '</div>' +
      '<div style="margin-top:6px;font-size:11px;color:var(--text3);">Đã chặn <span id="__uvd_blocked_ads__">' + __uvdAdBlockedCount + '</span> URL quảng cáo trong phiên này.</div>' +
    '</div>' +

    '<div class="uvd-card">' +
      '<div style="font-weight:600;margin-bottom:8px;">Sao lưu & Khôi phục</div>' +
      '<button class="uvd-btn uvd-btn-sm" id="__uvd_backup__" style="width:100%;margin-bottom:6px;">Xuất dữ liệu</button>' +
      '<button class="uvd-btn uvd-btn-sm" id="__uvd_restore__" style="width:100%;margin-bottom:6px;">Nhập dữ liệu</button>' +
      '<button class="uvd-btn uvd-btn-sm" id="__uvd_reset__" style="width:100%;background:var(--danger);">Đặt lại tất cả</button>' +
    '</div>' +

    '<div class="uvd-section-title"><span class="uvd-section-num">1</span> Cài đặt Bookmarklet</div>' +
    '<div class="uvd-card uvd-timeline-card">' +
      '<div style="font-size:13px;color:var(--text2);line-height:1.7;">' +
        '<strong style="color:var(--text);">Cách tạo bookmarklet trên Chrome Android:</strong><br>' +
        '➊ Mở một trang web bất kỳ, bấm vào biểu tượng ⭐ (Bookmark) trên thanh địa chỉ.<br>' +
        '➋ Chọn <strong>"Chỉnh sửa"</strong> (hoặc "Edit").<br>' +
        '➌ <strong>Đặt tên</strong> dễ nhớ, ví dụ: <code>UMP DL</code>.<br>' +
        '➍ <strong>Xóa toàn bộ địa chỉ</strong> trong ô URL, sau đó dán đoạn code sau vào:<br>' +
        '<textarea readonly style="width:100%;height:60px;background:rgba(0,0,0,0.5);border:1px solid var(--border);border-radius:10px;color:var(--text);padding:8px;font-size:10px;margin:6px 0;">' + bookmarkletCode + '</textarea>' +
        '➎ Bấm <strong>Lưu</strong> (Save).<br>' +
        '<span style="color:var(--accent);">💡 Từ lần sau, bạn chỉ cần gõ tên bookmark (UMP DL) vào thanh địa chỉ rồi chọn nó để kích hoạt.</span><br>' +
        '<span style="color:var(--text3);">Script luôn tự động cập nhật phiên bản mới nhất.</span>' +
      '</div>' +
    '</div>' +

    '<div class="uvd-section-title"><span class="uvd-section-num">2</span> Sử dụng</div>' +
    '<div class="uvd-card uvd-timeline-card">' +
      '<div style="font-size:13px;color:var(--text2);line-height:1.7;">' +
        '• Mở trang web có video<br>' +
        '• Gõ tên bookmark (vd: <code>UMP DL</code>) vào thanh địa chỉ và chọn nó<br>' +
        '• Chọn stream và bấm <strong style="color:var(--accent);">Xem</strong> để mở player overlay<br>' +
        '• Trong player: thanh công cụ gồm <strong style="color:var(--accent);">Chất lượng</strong>, <strong style="color:var(--accent);">Tốc độ</strong>, <strong style="color:var(--accent);">Toàn màn hình</strong><br>' +
        '• Nút <strong style="color:var(--accent);">⛶</strong> cạnh nút đóng để thu nhỏ video<br>' +
        '• Nút <strong style="color:var(--accent);">▶</strong> trên header: tự động bấm giúp các nút Play ẩn (eporner, JAV...) để link stream lộ ra. Nếu không ăn, đặt CSS selector riêng ở dòng "Play selector" bên dưới tên file.' +
      '</div>' +
    '</div>' +

    '<div class="uvd-section-title"><span class="uvd-section-num">3</span> Tải video với yt-dlp và Termux</div>' +
    '<div class="uvd-card uvd-timeline-card">' +
      '<div style="font-size:13px;color:var(--text2);line-height:1.7;">' +
        '<strong style="color:var(--text);">Cài đặt yt-dlp trên Termux:</strong><br>' +
        '<code class="uvd-inline-code">pkg update && pkg upgrade -y</code><br>' +
        '<code class="uvd-inline-code">pkg install python ffmpeg -y</code><br>' +
        '<code class="uvd-inline-code">pip install yt-dlp</code><br><br>' +
        '<strong style="color:var(--text);">Sau khi cài đặt, copy lệnh từ tab "Lệnh tải":</strong><br>' +
        '• Mở tab <strong style="color:var(--accent);">Streams</strong>, chọn stream cần tải<br>' +
        '• Bấm <strong style="color:var(--accent);">Lệnh tải</strong> → chọn lệnh phù hợp<br>' +
        '• Copy lệnh, mở Termux, dán vào và bấm Enter để tải.<br><br>' +
        '<strong style="color:var(--text);">Lưu ý:</strong> Nhớ cấp quyền lưu file cho Termux (Android 11+):<br>' +
        '<code class="uvd-inline-code">termux-setup-storage</code>' +
      '</div>' +
    '</div>' +

    '<div class="uvd-profile-footer">© ' + new Date().getFullYear() + ' nguyenquocngu91 · UMP DL v' + VERSION + ' · Made for Chrome Android</div>';

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
    if (confirm('Xóa toàn bộ dữ liệu?')) { localStorage.removeItem(STORAGE_KEY); data = {favorites:[],siteProfiles:{},history:[],filterlist:[]}; buildUI(); }
  };

  document.getElementById('__uvd_save_filter__').onclick = function() {
    var raw = document.getElementById('__uvd_filter_text__').value;
    data.filterlist = raw.split('\n').map(function(s) { return s.trim(); }).filter(Boolean);
    storage.set(data);
    toast('Đã lưu filterlist (' + data.filterlist.length + ' mục). Tải lại trang để áp dụng triệt để.');
  };

  document.getElementById('__uvd_import_filter__').onclick = function() {
    var inp = document.createElement('input'); inp.type='file'; inp.accept='.txt,.json';
    inp.onchange = function(e) {
      var reader = new FileReader();
      reader.onload = function(ev) {
        var text = ev.target.result;
        try {
          var j = JSON.parse(text);
          if (Array.isArray(j.filterlist)) text = j.filterlist.join('\n');
        } catch(ex) {}
        document.getElementById('__uvd_filter_text__').value = text;
      };
      reader.readAsText(e.target.files[0]);
    };
    inp.click();
  };
}

buildUI();

var autoRefresh = setInterval(function() {
  if (!document.getElementById('__uvd__') && !document.getElementById('__uvd_min_float__')) {
    clearInterval(autoRefresh); stopMonitor();
  }
}, 2000);

console.log('V6.2 UMP DL - Minimize script panel, optimized');
toast('V6.2 sẵn sàng!');

})();

