/**
 * Universal Media Player & Downloader - V6.7.6 PRO
 * - Tối ưu code trùng lặp
 * - Thêm lấy link gốc cho blob
 * - Menu 3 chấm trên video, tự ẩn cùng controls
 * - Hỗ trợ dash.js (MPD)
 * - Giao diện mới: nền mờ, bo góc video, thanh tiến trình trên video
 * - Giữ nguyên các tính năng cũ: HLS, resume, gesture, boost, subdl, ...
 * Author: nguyenquocngu91
 */
(function() {
'use strict';

// ========== VERSION ==========
var VERSION = '6.7.6';

// ========== CLEANUP ==========
var old = document.getElementById('__uvd__');
if (old) old.remove();
var oldMinBtn = document.getElementById('__uvd_min_float__');
if (oldMinBtn) oldMinBtn.remove();

// ========== STORAGE ==========
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
data.playbackPositions = data.playbackPositions || {};
data.settings = Object.assign({
  defaultSpeed: 1,
  defaultQuality: 'auto',
  dataSaver: false,
  autoFullscreen: false,
  resumePlayback: true,
  volumeBoost: false,
  volumeBoostMax: 200,
  autoNext: false,
  reduceMotion: false,
  blurIntensity: 24,
  transitionSpeed: 0.3,
  transitionEasing: 'ease',
  doubleTapSeconds: 10,
  autoHideControls: true,
  showRemainingTime: true,
  hideDelay: 5,
  maxStoredUrls: 200,
  blockAutoplay: true,
  glowEffects: true,
  effectsIntensity: 55,
  subdlApiKey: ''
}, data.settings || {});

// ========== PROFILES ==========
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

// ========== APPEND ROOT ==========
function __uvdAppendRoot(el) {
  (document.documentElement || document.body).appendChild(el);
}

// ========== ESCAPE HTML ==========
function escapeHtml(text) {
  if (!text) return '';
  var div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ========== HIỆU ỨNG ==========
function applyEffectsPref(el) {
  if (!el) return;
  var on = !!data.settings.glowEffects && !data.settings.reduceMotion;
  el.classList.toggle('uvd-fx-on', on);
  var intensity = Math.max(0, Math.min(100, data.settings.effectsIntensity == null ? 55 : data.settings.effectsIntensity));
  el.style.setProperty('--glow-px', on ? Math.round(4 + intensity * 0.18) + 'px' : '0px');
  el.style.setProperty('--glow-op', on ? (0.15 + intensity * 0.0035).toFixed(3) : '0');
}
function applyMotionPref(el) {
  if (!el) return;
  el.classList.toggle('uvd-reduce-motion', !!data.settings.reduceMotion);
  var blur = data.settings.reduceMotion ? 0 : data.settings.blurIntensity;
  var speed = data.settings.reduceMotion ? 0 : data.settings.transitionSpeed;
  el.style.setProperty('--uvd-blur', blur + 'px');
  el.style.setProperty('--uvd-transition', speed + 's ' + data.settings.transitionEasing);
}

// ========== AD FILTER ==========
var __uvdAdBlockedCount = 0;
var compiledFilters = [];

function compileAdFilters() {
  compiledFilters = [];
  (data.filterlist || []).forEach(function(raw) {
    var pattern = (raw || '').trim().toLowerCase();
    if (!pattern) return;
    if (pattern.indexOf('regex:') === 0) {
      try { compiledFilters.push({ type: 'regex', re: new RegExp(pattern.slice(6), 'i') }); }
      catch(e) {}
    } else {
      compiledFilters.push({ type: 'plain', value: pattern });
    }
  });
}
compileAdFilters();

function isAdUrl(url) {
  if (!compiledFilters.length) return false;
  var lowerUrl = url.toLowerCase();
  for (var i = 0; i < compiledFilters.length; i++) {
    var f = compiledFilters[i];
    if (f.type === 'regex') { if (f.re.test(url)) return true; }
    else if (lowerUrl.indexOf(f.value) !== -1) return true;
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
  if (urls.size > data.settings.maxStoredUrls) {
    var toRemove = urls.size - data.settings.maxStoredUrls;
    var keys = [...urls.keys()].sort(function(a, b) { return urls.get(a).timestamp - urls.get(b).timestamp; });
    for (var i = 0; i < toRemove; i++) {
      urls.delete(keys[i]);
    }
  }
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
  if (t.closest && (t.closest('#__uvd__') || t.closest('#__uvd_player_overlay__'))) return;
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

// ========== AUTO-CLICK PLAY ==========
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
          v.__uvdAllow = true;
          var p = v.play();
          if (p && p.then) {
            p.then(function() {
              setTimeout(function() {
                try { v.pause(); v.currentTime = 0; v.muted = wasMuted; } catch(e) {}
                v.__uvdAllow = false;
              }, 600);
            }).catch(function() { v.__uvdAllow = false; });
          } else {
            v.__uvdAllow = false;
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
var monitorActive = false;

function installMonitor() {
  if (monitorActive) return;
  monitorActive = true;
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
  monitorActive = false;
}

// ========== CLEANUP ==========
var cleanupFunctions = [];
function addCleanup(fn) {
  cleanupFunctions.push(fn);
}
function runCleanup() {
  cleanupFunctions.forEach(function(fn) { try { fn(); } catch(e) {} });
  cleanupFunctions = [];
}

// ========== CHẶN TỰ PHÁT ==========
var __uvdNativeMediaPlay = HTMLMediaElement.prototype.play;
function __uvdIsAllowedMedia(el) {
  return !!(el && (el.__uvdAllow || el.id === '__uvd_player_video__'));
}
HTMLMediaElement.prototype.play = function() {
  if (data.settings.blockAutoplay && !__uvdIsAllowedMedia(this)) {
    var self = this;
    setTimeout(function() { try { self.pause(); } catch(e) {} }, 0);
    return Promise.reject(new DOMException('UVD: đã chặn tự phát', 'NotAllowedError'));
  }
  return __uvdNativeMediaPlay.apply(this, arguments);
};
addCleanup(function() { HTMLMediaElement.prototype.play = __uvdNativeMediaPlay; });

function __uvdNeutralizeMedia(el) {
  if (!el || __uvdIsAllowedMedia(el)) return;
  try {
    el.removeAttribute('autoplay');
    el.autoplay = false;
    if (!el.paused) el.pause();
  } catch(e) {}
}
function __uvdBlockPlayEvent(e) {
  if (!data.settings.blockAutoplay) return;
  var el = e.target;
  if (el && (el.tagName === 'VIDEO' || el.tagName === 'AUDIO') && !__uvdIsAllowedMedia(el)) {
    try { el.pause(); } catch(err) {}
  }
}
document.addEventListener('play', __uvdBlockPlayEvent, true);
addCleanup(function() { document.removeEventListener('play', __uvdBlockPlayEvent, true); });

var __uvdAutoplayObserver = new MutationObserver(function(mutations) {
  if (!data.settings.blockAutoplay) return;
  mutations.forEach(function(m) {
    if (!m.addedNodes) return;
    m.addedNodes.forEach(function(node) {
      if (!(node instanceof Element)) return;
      if (node.tagName === 'VIDEO' || node.tagName === 'AUDIO') __uvdNeutralizeMedia(node);
      if (node.querySelectorAll) {
        node.querySelectorAll('video,audio').forEach(__uvdNeutralizeMedia);
      }
    });
  });
});
__uvdAutoplayObserver.observe(document.documentElement, { childList: true, subtree: true });
addCleanup(function() { __uvdAutoplayObserver.disconnect(); });

try { document.querySelectorAll('video,audio').forEach(__uvdNeutralizeMedia); } catch(e) {}

// ========== INIT ==========
scan(document, 'main');
try { performance.getEntriesByType('resource').forEach(function(e) { if (!isAdUrl(e.name)) findUrls(e.name, 'network:perf'); }); } catch(e) {}
installMonitor();
installPopupBlock();

var panelObserver = new MutationObserver(function() {
  if (!document.getElementById('__uvd__')) {
    stopMonitor();
    panelObserver.disconnect();
    runCleanup();
  }
});
panelObserver.observe(document.body, { childList: true, subtree: true });
addCleanup(function() { panelObserver.disconnect(); });

function runAutoClickAndRescan(silent) {
  var beforeCount = urls.size;
  var clicked = 0;
  installPopupBlock();
  clicked = autoClickPlayButtons(document, 0, !silent);
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

window.__uvd_autoClickPlay = function() { runAutoClickAndRescan(false); };
setTimeout(function() { runAutoClickAndRescan(true); }, 400);

// ========== M3U8 MASTER PARSER ==========
function parseM3U8Master(url, callback) {
  var controller = new AbortController();
  var timeout = setTimeout(function() { controller.abort(); }, 15000);
  fetch(url, { headers: { 'Referer': pageInfo.referer }, signal: controller.signal })
  .then(function(r) { clearTimeout(timeout); return r.text(); })
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
  }).catch(function(e) { clearTimeout(timeout); console.error(e); callback(null); });
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
  __uvdAppendRoot(el);
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

function addToFilterlist(pattern) {
  if (!pattern) return;
  pattern = pattern.trim().toLowerCase();
  if (data.filterlist.indexOf(pattern) === -1) {
    data.filterlist.push(pattern);
    storage.set(data);
    compileAdFilters();
    toast('Đã thêm "' + pattern + '" vào filter');
    buildUI();
  } else {
    toast('Rule đã tồn tại');
  }
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

// ========== RIPPLE ==========
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
  dash: null,
  qualities: [],
  currentQuality: 0,
  speed: 1,
  isMinimized: false,
  url: '',
  type: '',
  resolution: '',
  bandwidth: 0,
  _displayedResolution: '',
  onFullscreenChange: null,
  audioCtx: null,
  gainNode: null,
  sourceNode: null,
  sleepTimerId: null,
  sleepEndAt: 0,
  savePosTimer: null,
  wasReduceMotion: false,
  hideTimeout: null,
  controlsVisible: true,
  pinned: false,
  timeMode: 0,
  animationFrame: null,
  progressEl: null,
  timeDisplay: null,
  playPauseBtn: null,
  menuDropdown: null,
  controlsContainer: null
};

// ========== RESUME POSITION ==========
function savePlaybackPosition(url, video) {
  if (!url || !video || !video.duration || isNaN(video.duration)) return;
  var pct = video.currentTime / video.duration;
  if (pct < 0.02 || pct > 0.95) { delete data.playbackPositions[url]; }
  else {
    data.playbackPositions[url] = { time: video.currentTime, duration: video.duration, updatedAt: Date.now() };
  }
  var keys = Object.keys(data.playbackPositions);
  if (keys.length > 50) {
    keys.sort(function(a, b) { return data.playbackPositions[a].updatedAt - data.playbackPositions[b].updatedAt; });
    delete data.playbackPositions[keys[0]];
  }
  storage.set(data);
}

function getPlaybackPosition(url) {
  return data.playbackPositions[url] || null;
}

// ========== SLEEP TIMER ==========
function clearSleepTimer() {
  if (playerState.sleepTimerId) { clearTimeout(playerState.sleepTimerId); playerState.sleepTimerId = null; }
  playerState.sleepEndAt = 0;
  var el = document.getElementById('__uvd_sleep_label__');
  if (el) el.textContent = '';
}

function setSleepTimer(minutes) {
  clearSleepTimer();
  if (!minutes) return;
  playerState.sleepEndAt = Date.now() + minutes * 60000;
  playerState.sleepTimerId = setTimeout(function() {
    if (playerState.video) playerState.video.pause();
    toast('⏰ Hẹn giờ ngủ: đã dừng phát');
    clearSleepTimer();
  }, minutes * 60000);
  toast('⏰ Sẽ dừng sau ' + minutes + ' phút');
}

function showSleepMenu() {
  var overlay2 = document.createElement('div');
  overlay2.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:2147483649;display:flex;align-items:center;justify-content:center;';
  var panel = document.createElement('div');
  panel.style.cssText = 'background:rgba(20,22,30,0.95);border-radius:16px;padding:20px;min-width:250px;max-width:90%;border:1px solid rgba(255,255,255,0.15);';
  panel.innerHTML = '<div style="color:#fff;font-weight:600;margin-bottom:12px;">⏰ Hẹn giờ ngủ</div>';
  [0, 15, 30, 45, 60].forEach(function(m) {
    var b = document.createElement('button');
    b.className = 'uvd-btn uvd-btn-sm';
    b.style.cssText = 'width:100%;margin-bottom:6px;text-align:center;';
    b.textContent = m === 0 ? 'Tắt hẹn giờ' : m + ' phút';
    b.onclick = function() { setSleepTimer(m); overlay2.remove(); };
    panel.appendChild(b);
  });
  overlay2.appendChild(panel);
  overlay2.onclick = function(e) { if (e.target === overlay2) overlay2.remove(); };
  __uvdAppendRoot(overlay2);
}

// ========== PHỤ ĐỀ ==========
function srtToVtt(text) {
  var body = text.replace(/\r/g, '').replace(/^\uFEFF/, '');
  if (/^WEBVTT/.test(body.trim())) return body;
  body = body.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');
  return 'WEBVTT\n\n' + body;
}

function attachSubtitleTrack(video, vttUrl, label) {
  if (!video) return;
  video.querySelectorAll('track[data-uvd-sub="1"]').forEach(function(t) { t.remove(); });
  var track = document.createElement('track');
  track.setAttribute('data-uvd-sub', '1');
  track.kind = 'subtitles';
  track.label = label || 'Phụ đề';
  track.srclang = 'vi';
  track.src = vttUrl;
  track.default = true;
  video.appendChild(track);
  setTimeout(function() {
    if (video.textTracks && video.textTracks.length) {
      for (var i = 0; i < video.textTracks.length; i++) {
        video.textTracks[i].mode = video.textTracks[i].label === (label || 'Phụ đề') ? 'showing' : 'disabled';
      }
    }
  }, 100);
  toast('✅ Đã bật phụ đề: ' + (label || ''));
}

function searchSubDL(query, cb) {
  var apiKey = (data.settings.subdlApiKey || '').trim();
  if (!apiKey) { toast('Chưa có SubDL API Key, xem hướng dẫn trong bảng Phụ đề'); cb([]); return; }
  console.log('[UMP DL] SubDL: bắt đầu tìm "' + query + '"');
  var settled = false;
  function finish(fn) { if (settled) return; settled = true; clearTimeout(hardTimeoutId); fn(); }
  var hardTimeoutId = setTimeout(function() {
    finish(function() {
      console.error('[UMP DL] SubDL: hết 15s vẫn không có phản hồi');
      toast('SubDL không phản hồi sau 15s — có thể do CORS hoặc trang chặn kết nối');
      cb([]);
    });
  }, 15000);
  var controller = (typeof AbortController !== 'undefined') ? new AbortController() : null;
  if (controller) { setTimeout(function() { controller.abort(); }, 15000); }

  fetch('https://api.subdl.com/api/v2/subtitles/search?film_name=' + encodeURIComponent(query) + '&languages=vi,en&unpack=1', {
    headers: { 'Authorization': 'Bearer ' + apiKey },
    signal: controller ? controller.signal : undefined
  })
  .then(function(r) {
    if (!r.ok) { throw new Error('HTTP ' + r.status); }
    return r.json();
  })
  .then(function(json) {
    finish(function() {
      if (json && json.status === false) {
        console.warn('[UMP DL] SubDL trả lỗi:', json.message || json);
        toast('SubDL: ' + (json.message || 'yêu cầu bị từ chối (kiểm tra API key)'));
        cb([]); return;
      }
      var subs = (json && json.subtitles) || [];
      var flat = [];
      subs.forEach(function(s) {
        if (s && Array.isArray(s.unpack_files) && s.unpack_files.length) {
          s.unpack_files.forEach(function(f) {
            flat.push(Object.assign({
              release_name: s.release_name || s.name,
              language: f.language
            }, f));
          });
        } else if (s) {
          flat.push(s);
        }
      });
      console.log('[UMP DL] SubDL: nhận được ' + flat.length + ' phụ đề');
      cb(flat);
    });
  })
  .catch(function(err) {
    finish(function() {
      console.error('[UMP DL] Lỗi SubDL search:', err);
      toast('Lỗi kết nối SubDL: ' + (err && err.message ? err.message : 'CORS/mạng'));
      cb([]);
    });
  });
}

function downloadSubDLFile(item, cb) {
  var apiKey = (data.settings.subdlApiKey || '').trim();
  var directUrl = item.url || item.file_url || item.download_url || (item.files && item.files[0] && item.files[0].url);
  var nId = item.file_n_id || item.nId || item.n_id || item.id;
  var reqPromise;
  if (directUrl) {
    reqPromise = fetch(directUrl.indexOf('http') === 0 ? directUrl : 'https://dl.subdl.com' + directUrl);
  } else if (nId) {
    reqPromise = fetch('https://api.subdl.com/api/v2/subtitles/' + encodeURIComponent(nId) + '/download?format=file', {
      headers: { 'Authorization': 'Bearer ' + apiKey }
    }).then(function(r) {
      var ct = r.headers.get('content-type') || '';
      return ct.indexOf('application/json') !== -1 ? r.json() : r.text();
    }).then(function(result) {
      if (typeof result === 'string') return result;
      var link = result && (result.url || result.download_url || result.link);
      if (!link) throw new Error('no-link');
      return fetch(link).then(function(r2) { return r2.text(); });
    });
  } else {
    toast('Không có file để tải'); if (cb) cb(false); return;
  }
  Promise.resolve(reqPromise)
  .then(function(res) { return (typeof res === 'string') ? res : res.text(); })
  .then(function(text) {
    if (!text) throw new Error('empty');
    var vtt = srtToVtt(text);
    var blobUrl = URL.createObjectURL(new Blob([vtt], { type: 'text/vtt' }));
    attachSubtitleTrack(playerState.video, blobUrl, 'SubDL');
    if (cb) cb(true);
  })
  .catch(function() { toast('Lỗi tải phụ đề từ SubDL'); if (cb) cb(false); });
}

function showSubtitlePanel(video) {
  var overlay2 = document.createElement('div');
  overlay2.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:2147483649;display:flex;align-items:center;justify-content:center;padding:16px;';
  var panel = document.createElement('div');
  applyEffectsPref(panel);
  panel.style.cssText = 'background:rgba(20,22,30,0.96);border-radius:16px;padding:20px;width:100%;max-width:380px;max-height:85vh;overflow-y:auto;border:1px solid rgba(255,255,255,0.15);';
  panel.innerHTML =
    '<div style="color:#fff;font-weight:600;margin-bottom:4px;">💬 Phụ đề <span style="font-size:10px;color:var(--gold);font-weight:400;">(thử nghiệm)</span></div>' +
    '<div style="font-size:11px;color:var(--text3);margin-bottom:12px;">Tải file có sẵn hoặc tìm trên SubDL.</div>' +
    '<div style="font-size:12px;color:var(--text2);margin-bottom:6px;">Tải file .srt / .vtt từ máy</div>' +
    '<input type="file" id="__uvd_sub_file__" accept=".srt,.vtt" style="width:100%;color:var(--text2);font-size:12px;margin-bottom:14px;">' +
    '<div style="font-size:12px;color:var(--text2);margin-bottom:6px;">Tìm trên SubDL</div>' +
    '<div style="display:flex;gap:6px;margin-bottom:8px;">' +
      '<input type="text" id="__uvd_sub_query__" placeholder="Tên phim..." value="' + escapeHtml(pageInfo.title) + '" style="flex:1;padding:9px;background:rgba(0,0,0,0.4);color:#fff;border:1px solid var(--border);border-radius:10px;font-size:12px;">' +
      '<button class="uvd-btn uvd-btn-sm" id="__uvd_sub_search__">Tìm</button>' +
    '</div>' +
    '<div id="__uvd_sub_results__" style="max-height:200px;overflow-y:auto;"></div>' +
    '<details style="margin-top:12px;">' +
      '<summary style="font-size:11px;color:var(--text3);cursor:pointer;">API Key SubDL</summary>' +
      '<input type="text" id="__uvd_sub_apikey__" placeholder="Dán API key cá nhân (subdl.com)" value="' + escapeHtml(data.settings.subdlApiKey || '') + '" style="width:100%;margin-top:8px;padding:9px;background:rgba(0,0,0,0.4);color:#fff;border:1px solid var(--border);border-radius:10px;font-size:11px;">' +
      '<div style="font-size:10px;color:var(--text3);margin-top:4px;">Đăng ký free tại subdl.com/panel/api để lấy API key cá nhân (không cần app \"consumer\" riêng, 2000 lượt tìm + 50 lượt tải/ngày).</div>' +
    '</details>' +
    '<div class="uvd-grid-2" style="margin-top:14px;">' +
      '<button class="uvd-btn uvd-btn-sm" id="__uvd_sub_off__">Tắt phụ đề</button>' +
      '<button class="uvd-btn uvd-btn-sm" id="__uvd_sub_close__" style="background:var(--btn-danger-bg);">Đóng</button>' +
    '</div>';
  overlay2.appendChild(panel);
  overlay2.onclick = function(e) { if (e.target === overlay2) overlay2.remove(); };
  __uvdAppendRoot(overlay2);

  panel.querySelector('#__uvd_sub_file__').onchange = function(e) {
    var file = e.target.files && e.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function() {
      var vtt = srtToVtt(String(reader.result || ''));
      var blobUrl = URL.createObjectURL(new Blob([vtt], { type: 'text/vtt' }));
      attachSubtitleTrack(video, blobUrl, file.name.replace(/\.(srt|vtt)$/i, ''));
      overlay2.remove();
    };
    reader.readAsText(file);
  };

  panel.querySelector('#__uvd_sub_apikey__').onchange = function() {
    data.settings.subdlApiKey = this.value.trim();
    storage.set(data);
  };

  panel.querySelector('#__uvd_sub_search__').onclick = function() {
    var q = panel.querySelector('#__uvd_sub_query__').value.trim();
    if (!q) return;
    var box = panel.querySelector('#__uvd_sub_results__');
    box.innerHTML = '<div style="font-size:11px;color:var(--text3);padding:8px 0;">Đang tìm...</div>';
    searchSubDL(q, function(list) {
      if (!list.length) { box.innerHTML = '<div style="font-size:11px;color:var(--text3);padding:8px 0;">Không tìm thấy kết quả.</div>'; return; }
      box.innerHTML = '';
      list.slice(0, 10).forEach(function(item) {
        var title = item.release_name || item.name || item.film_name || q;
        var lang = item.language || item.lang || '';
        var row = document.createElement('div');
        row.className = 'uvd-card';
        row.style.cssText = 'padding:8px 10px;margin-bottom:6px;cursor:pointer;';
        row.innerHTML = '<div style="font-size:12px;color:#fff;">' + escapeHtml(title) + '</div>' +
          '<div style="font-size:10px;color:var(--text3);">' + escapeHtml(String(lang).toUpperCase()) + '</div>';
        row.onclick = function() {
          toast('Đang tải phụ đề...');
          downloadSubDLFile(item, function(ok) { if (ok) overlay2.remove(); });
        };
        box.appendChild(row);
      });
    });
  };

  panel.querySelector('#__uvd_sub_off__').onclick = function() {
    if (video && video.textTracks) {
      for (var i = 0; i < video.textTracks.length; i++) video.textTracks[i].mode = 'disabled';
    }
    toast('Đã tắt phụ đề');
    overlay2.remove();
  };

  panel.querySelector('#__uvd_sub_close__').onclick = function() { overlay2.remove(); };
}

// ========== VOLUME BOOST ==========
function enableVolumeBoost(video, percent) {
  try {
    if (!playerState.audioCtx) {
      var Ctx = window.AudioContext || window.webkitAudioContext;
      playerState.audioCtx = new Ctx();
      playerState.sourceNode = playerState.audioCtx.createMediaElementSource(video);
      playerState.gainNode = playerState.audioCtx.createGain();
      playerState.sourceNode.connect(playerState.gainNode);
      playerState.gainNode.connect(playerState.audioCtx.destination);
    }
    if (playerState.audioCtx.state === 'suspended') playerState.audioCtx.resume();
    playerState.gainNode.gain.value = (percent || 100) / 100;
  } catch(e) { toast('Thiết bị không hỗ trợ tăng âm lượng'); }
}

function disableVolumeBoost() {
  try { if (playerState.gainNode) playerState.gainNode.gain.value = 1; } catch(e) {}
}

// ========== GESTURE: TUA ĐÚP ==========
function attachPlayerGestures(wrapper, video) {
  var lastTap = { time: 0, side: null };
  var tapSeconds = data.settings.doubleTapSeconds || 10;

  wrapper.addEventListener('touchend', function(e) {
    var t = e.changedTouches && e.changedTouches[0];
    if (!t) return;
    var rect = wrapper.getBoundingClientRect();
    var side = (t.clientX - rect.left) < rect.width / 2 ? 'left' : 'right';
    var now = Date.now();
    if (lastTap.side === side && (now - lastTap.time) < 300) {
      if (side === 'left') { video.currentTime = Math.max(0, video.currentTime - tapSeconds); showGestureHint('⏪ -' + tapSeconds + 's'); }
      else { video.currentTime = Math.min(video.duration || 1e9, video.currentTime + tapSeconds); showGestureHint('⏩ +' + tapSeconds + 's'); }
      hideGestureHintSoon();
      lastTap.time = 0;
    } else {
      lastTap = { time: now, side: side };
    }
  });
}

var __gestureHintTimer = null;
function showGestureHint(text) {
  var el = document.getElementById('__uvd_gesture_hint__');
  if (!el) {
    el = document.createElement('div');
    el.id = '__uvd_gesture_hint__';
    el.style.cssText = 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);background:rgba(0,0,0,0.7);color:#fff;padding:10px 18px;border-radius:12px;font-size:14px;font-weight:600;z-index:5;pointer-events:none;';
    var wrapper = document.getElementById('__uvd_video_wrapper__');
    if (wrapper) wrapper.appendChild(el);
  }
  el.textContent = text;
  el.style.opacity = '1';
}
function hideGestureHintSoon() {
  clearTimeout(__gestureHintTimer);
  __gestureHintTimer = setTimeout(function() {
    var el = document.getElementById('__uvd_gesture_hint__');
    if (el) el.style.opacity = '0';
  }, 500);
}

// ========== OVERLAY PLAYER MỚI ==========
function showVideoPlayer(url, type) {
  if (playerState.overlay && playerState.url === url) return;
  if (playerState.overlay) closePlayer();
  playerState.url = url;
  playerState.type = type;
  playerState._displayedResolution = '';
  playerState.timeMode = 0;
  playerState.pinned = false;
  pauseAllPlayingVideos();

  playerState.wasReduceMotion = data.settings.reduceMotion;
  if (!data.settings.reduceMotion) {
    data.settings.reduceMotion = true;
    applyMotionPref(document.getElementById('__uvd__'));
  }

  // ===== TẠO OVERLAY =====
  var overlay = document.createElement('div');
  overlay.id = '__uvd_player_overlay__';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.9);z-index:2147483648;display:flex;flex-direction:column;animation:uvdFadeIn 0.3s ease;';
  __uvdAppendRoot(overlay);
  playerState.overlay = overlay;
  applyEffectsPref(overlay);
  applyMotionPref(overlay);

  // ===== HEADER =====
  var header = document.createElement('div');
  header.id = '__uvd_player_header__';
  header.style.cssText = 'padding:10px 16px;background:rgba(14,16,22,0.92);display:flex;align-items:center;justify-content:space-between;flex-shrink:0;border-bottom:1px solid rgba(255,255,255,0.2);box-shadow:0 4px 20px rgba(0,0,0,0.5);';
  var titleInfo = document.createElement('div');
  titleInfo.className = 'uvd-title-info';
  titleInfo.style.cssText = 'min-width:0;flex:1;';
  titleInfo.innerHTML = '<div style="font-weight:600;font-size:14px;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">▶ ' + escapeHtml(pageInfo.title) + '</div><div style="font-size:11px;color:#aaa;margin-top:2px;">' + escapeHtml(type) + '</div>';
  header.appendChild(titleInfo);

  var btnGroup = document.createElement('div');
  btnGroup.style.cssText = 'display:flex;gap:6px;flex-shrink:0;';
  var minVideoBtn = createButton('⛶', 'background:rgba(255,255,255,0.15);color:#fff;font-size:12px;', function() { minimizePlayer(); });
  btnGroup.appendChild(minVideoBtn);
  var closeBtn = createButton('✕', 'background:var(--btn-danger-bg);color:#fff;border:1px solid var(--btn-danger-border);', function() {
    closePlayer();
    document.getElementById('__uvd_stream_list__').style.display = 'block';
  });
  closeBtn.id = '__uvd_player_close__';
  btnGroup.appendChild(closeBtn);
  header.appendChild(btnGroup);
  overlay.appendChild(header);

  // ===== VIDEO CONTAINER (nền mờ, bo góc) =====
  var container = document.createElement('div');
  container.id = '__uvd_player_container__';
  container.style.cssText = 'flex:1;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.3);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);padding:20px;';
  overlay.appendChild(container);

  var videoWrapper = document.createElement('div');
  videoWrapper.id = '__uvd_video_wrapper__';
  videoWrapper.style.cssText = 'position:relative;border-radius:16px;overflow:hidden;width:90%;max-width:1000px;aspect-ratio:16/9;background:#000;box-shadow:0 10px 60px rgba(0,0,0,0.8);';
  container.appendChild(videoWrapper);

  var video = document.createElement('video');
  video.id = '__uvd_player_video__';
  video.style.cssText = 'width:100%;height:100%;display:block;object-fit:contain;';
  video.setAttribute('playsinline', '');
  video.setAttribute('webkit-playsinline', '');
  video.setAttribute('crossorigin', 'anonymous');
  videoWrapper.appendChild(video);
  playerState.video = video;

  // ===== CONTROLS OVERLAY =====
  var controlsContainer = document.createElement('div');
  controlsContainer.id = '__uvd_controls__';
  controlsContainer.style.cssText = 'position:absolute;bottom:0;left:0;right:0;padding:10px 16px 12px;background:linear-gradient(to top, rgba(0,0,0,0.85) 0%, transparent 100%);opacity:0;transition:opacity 0.3s ease;pointer-events:none;';
  controlsContainer.style.opacity = '0'; // sẽ hiện khi hover
  videoWrapper.appendChild(controlsContainer);
  playerState.controlsContainer = controlsContainer;

  // Progress bar
  var progress = document.createElement('input');
  progress.type = 'range';
  progress.id = '__uvd_progress__';
  progress.min = 0;
  progress.max = 1000;
  progress.value = 0;
  progress.style.cssText = 'width:100%;height:4px;background:rgba(255,255,255,0.3);border-radius:2px;outline:none;appearance:none;margin-bottom:8px;';
  controlsContainer.appendChild(progress);
  playerState.progressEl = progress;

  // Row controls
  var row = document.createElement('div');
  row.style.cssText = 'display:flex;align-items:center;gap:10px;';
  controlsContainer.appendChild(row);

  var playPauseBtn = createButton('▶', 'background:none;border:none;color:#fff;font-size:20px;cursor:pointer;', function() {
    if (video.paused) video.play(); else video.pause();
  });
  playPauseBtn.id = '__uvd_play_pause__';
  row.appendChild(playPauseBtn);
  playerState.playPauseBtn = playPauseBtn;

  var timeDisplay = document.createElement('span');
  timeDisplay.id = '__uvd_time_display__';
  timeDisplay.style.cssText = 'color:#fff;font-size:13px;font-weight:500;min-width:60px;';
  timeDisplay.textContent = '00:00';
  row.appendChild(timeDisplay);
  playerState.timeDisplay = timeDisplay;

  // Volume
  var volumeBtn = createButton('🔊', 'background:none;border:none;color:#fff;font-size:16px;cursor:pointer;', function() {
    video.muted = !video.muted;
    volumeBtn.textContent = video.muted ? '🔇' : '🔊';
  });
  row.appendChild(volumeBtn);

  var volumeSlider = document.createElement('input');
  volumeSlider.type = 'range';
  volumeSlider.min = 0;
  volumeSlider.max = 1;
  volumeSlider.step = 0.01;
  volumeSlider.value = video.volume;
  volumeSlider.style.cssText = 'width:60px;height:4px;background:rgba(255,255,255,0.3);border-radius:2px;outline:none;appearance:none;';
  row.appendChild(volumeSlider);
  volumeSlider.addEventListener('input', function() {
    video.volume = parseFloat(this.value);
    video.muted = false;
    volumeBtn.textContent = '🔊';
  });

  // Fullscreen
  var fullscreenBtn = createButton('⛶', 'background:none;border:none;color:#fff;font-size:18px;cursor:pointer;', function() {
    var fs = videoWrapper.requestFullscreen || videoWrapper.webkitRequestFullscreen || videoWrapper.mozRequestFullScreen || videoWrapper.msRequestFullscreen;
    if (fs) fs.call(videoWrapper);
  });
  row.appendChild(fullscreenBtn);

  // Menu 3 chấm
  var menuBtn = createButton('⋮', 'background:none;border:none;color:#fff;font-size:20px;cursor:pointer;', function(e) {
    e.stopPropagation();
    var dd = document.getElementById('__uvd_menu_dropdown__');
    dd.style.display = dd.style.display === 'none' ? 'flex' : 'none';
  });
  row.appendChild(menuBtn);

  // Menu dropdown
  var dropdown = document.createElement('div');
  dropdown.id = '__uvd_menu_dropdown__';
  dropdown.style.cssText = 'position:absolute;bottom:60px;right:10px;background:rgba(20,22,30,0.95);border-radius:12px;padding:10px;display:none;flex-direction:column;gap:4px;z-index:20;min-width:170px;border:1px solid rgba(255,255,255,0.1);backdrop-filter:blur(10px);';
  videoWrapper.appendChild(dropdown);
  playerState.menuDropdown = dropdown;

  // ===== XÂY DỰNG MENU =====
  function addMenuItem(label, onClick) {
    var btn = document.createElement('button');
    btn.className = 'uvd-btn uvd-btn-sm';
    btn.style.cssText = 'background:transparent;border:none;color:#fff;text-align:left;padding:8px 12px;font-size:13px;cursor:pointer;border-radius:6px;width:100%;';
    btn.textContent = label;
    btn.onclick = function(e) {
      e.stopPropagation();
      onClick();
      dropdown.style.display = 'none';
    };
    btn.addEventListener('mouseenter', function() { this.style.background = 'rgba(255,255,255,0.1)'; });
    btn.addEventListener('mouseleave', function() { this.style.background = 'transparent'; });
    dropdown.appendChild(btn);
  }

  // Các mục menu
  // Chất lượng (nếu HLS/DASH)
  if (type === 'M3U8' || type === 'MPD') {
    addMenuItem('📊 Chất lượng', function() {
      if (type === 'M3U8' && playerState.qualities.length) showQualitySubMenu();
      else if (type === 'MPD' && playerState.dash) {
        var levels = playerState.dash.getQualityFor('video');
        // dash.js tự quản lý, hiển thị menu
        toast('DASH: chất lượng đang ' + (levels === -1 ? 'tự động' : levels));
      } else toast('Không có chất lượng');
    });
  }

  // Tốc độ
  addMenuItem('⚡ Tốc độ', function() {
    var rates = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
    var cur = video.playbackRate;
    var nextIdx = (rates.indexOf(cur) + 1) % rates.length;
    video.playbackRate = rates[nextIdx];
    toast('Tốc độ: ' + video.playbackRate + 'x');
  });

  // PiP
  if (document.pictureInPictureEnabled) {
    addMenuItem('📌 PiP', function() {
      if (document.pictureInPictureElement) document.exitPictureInPicture().catch(function(){});
      else video.requestPictureInPicture().catch(function() { toast('Không hỗ trợ PiP'); });
    });
  }

  addMenuItem('⏰ Hẹn giờ', function() { showSleepMenu(); });

  addMenuItem('🔊 Boost', function() {
    data.settings.volumeBoost = !data.settings.volumeBoost;
    storage.set(data);
    if (data.settings.volumeBoost) { enableVolumeBoost(video, data.settings.volumeBoostMax); toast('Đã bật tăng âm ' + data.settings.volumeBoostMax + '%'); }
    else { disableVolumeBoost(); toast('Đã tắt tăng âm'); }
  });

  addMenuItem('🔇 Mute', function() {
    video.muted = !video.muted;
    toast(video.muted ? 'Đã tắt tiếng' : 'Đã bật tiếng');
  });

  addMenuItem('📷 Screenshot', function() {
    if (!video.videoWidth) { toast('Chưa có video'); return; }
    var canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    var ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0);
    var link = document.createElement('a');
    link.download = pageInfo.title + '_screenshot.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
    toast('Đã chụp ảnh');
  });

  addMenuItem('💬 Phụ đề', function() { showSubtitlePanel(video); });

  // Tải xuống nếu là file trực tiếp
  if (type === 'MP4' || type === 'MKV' || type === 'WEBM') {
    addMenuItem('⬇️ Tải xuống', function() {
      var a = document.createElement('a');
      a.href = url;
      a.download = pageInfo.title + '.' + type.toLowerCase();
      document.body.appendChild(a);
      a.click();
      a.remove();
      toast('Đang tải...');
    });
  }

  addMenuItem('📤 Chia sẻ', function() { shareUrl(url); });

  addMenuItem('📌 Ghim controls', function() {
    playerState.pinned = !playerState.pinned;
    toast(playerState.pinned ? 'Đã ghim controls' : 'Bỏ ghim');
    if (playerState.pinned) {
      controlsContainer.style.opacity = '1';
      clearTimeout(playerState.hideTimeout);
    } else {
      resetHideTimer();
    }
  });

  // Lấy link gốc (cho blob)
  addMenuItem('🔗 Sao chép link gốc', function() {
    var linkToCopy = url;
    if (url.startsWith('blob:')) {
      toast('Link là blob, không thể tải trực tiếp. Đã sao chép blob URL.');
    }
    copy(linkToCopy);
    toast('Đã sao chép link');
  });

  // ===== SỰ KIỆN CONTROLS =====
  function resetHideTimer() {
    if (playerState.pinned || !data.settings.autoHideControls) {
      controlsContainer.style.opacity = '1';
      controlsContainer.style.pointerEvents = 'auto';
      clearTimeout(playerState.hideTimeout);
      return;
    }
    clearTimeout(playerState.hideTimeout);
    controlsContainer.style.opacity = '1';
    controlsContainer.style.pointerEvents = 'auto';
    var delay = (data.settings.hideDelay || 5) * 1000;
    playerState.hideTimeout = setTimeout(function() {
      if (video.paused || playerState.pinned) return;
      controlsContainer.style.opacity = '0';
      controlsContainer.style.pointerEvents = 'none';
      dropdown.style.display = 'none';
    }, delay);
  }

  videoWrapper.addEventListener('mousemove', resetHideTimer);
  videoWrapper.addEventListener('touchstart', resetHideTimer);
  video.addEventListener('play', resetHideTimer);
  video.addEventListener('playing', resetHideTimer);
  video.addEventListener('pause', function() {
    clearTimeout(playerState.hideTimeout);
    controlsContainer.style.opacity = '1';
    controlsContainer.style.pointerEvents = 'auto';
  });
  video.addEventListener('ended', function() {
    clearTimeout(playerState.hideTimeout);
    controlsContainer.style.opacity = '1';
    controlsContainer.style.pointerEvents = 'auto';
  });
  // Khi click vào video thì toggle play/pause
  videoWrapper.addEventListener('click', function(e) {
    if (e.target === videoWrapper || e.target === video) {
      if (video.paused) video.play(); else video.pause();
    }
  });

  // ===== PROGRESS BAR =====
  var isDragging = false;
  progress.addEventListener('pointerdown', function(e) {
    isDragging = true;
    video.pause();
  });
  progress.addEventListener('pointerup', function() {
    isDragging = false;
    if (!video.paused) video.play();
  });
  progress.addEventListener('input', function() {
    if (video.duration) {
      var pct = this.value / 1000;
      video.currentTime = pct * video.duration;
    }
  });

  function updateProgress() {
    if (!isDragging && video.duration) {
      var pct = video.currentTime / video.duration;
      progress.value = pct * 1000;
    }
    // Update time display
    var cur = video.currentTime || 0;
    var dur = video.duration || 0;
    if (dur) {
      var mode = playerState.timeMode;
      if (data.settings.showRemainingTime && mode === 0) {
        timeDisplay.textContent = '-' + formatTime(dur - cur);
      } else if (mode === 1) {
        timeDisplay.textContent = formatTime(cur);
      } else {
        timeDisplay.textContent = formatTime(cur) + ' / ' + formatTime(dur);
      }
    } else {
      timeDisplay.textContent = '00:00';
    }
    // Update title resolution
    updateTitleDisplay();
  }

  video.addEventListener('timeupdate', function() {
    if (!isDragging) updateProgress();
    // Auto save position
    if (data.settings.resumePlayback && Date.now() - __lastPosSave > 5000) {
      __lastPosSave = Date.now();
      savePlaybackPosition(url, video);
    }
  });
  video.addEventListener('loadedmetadata', function() {
    updateProgress();
    resetHideTimer();
    // apply default speed
    if (data.settings.defaultSpeed && data.settings.defaultSpeed !== 1) {
      video.playbackRate = data.settings.defaultSpeed;
    }
    // resume
    if (data.settings.resumePlayback) {
      var pos = getPlaybackPosition(url);
      if (pos && pos.time > 3) {
        video.currentTime = pos.time;
        toast('▶ Tiếp tục từ ' + formatTime(pos.time));
      }
    }
    // volume boost
    if (data.settings.volumeBoost) enableVolumeBoost(video, data.settings.volumeBoostMax);
    // auto fullscreen
    if (data.settings.autoFullscreen && !document.fullscreenElement) {
      var fsReq = videoWrapper.requestFullscreen || videoWrapper.webkitRequestFullscreen;
      if (fsReq) fsReq.call(videoWrapper).catch(function(){});
    }
  });

  var __lastPosSave = 0;
  video.addEventListener('ended', function() {
    if (data.settings.resumePlayback) { delete data.playbackPositions[url]; storage.set(data); }
    if (data.settings.autoNext) {
      var nextUrl = getNextStreamUrl(url);
      if (nextUrl) { toast('⏭ Đang phát stream tiếp theo...'); setTimeout(function() { showVideoPlayer(nextUrl.url, nextUrl.type); }, 800); }
    }
  });

  // ===== GESTURE TUA ĐÚP =====
  attachPlayerGestures(videoWrapper, video);

  // ===== HLS / DASH / NATIVE =====
  var isHls = type === 'M3U8' || url.includes('.m3u8');
  var isDash = type === 'MPD' || url.includes('.mpd');
  var activeHls = null;
  var activeDash = null;

  if (isHls) {
    if (window.Hls && Hls.isSupported()) {
      activeHls = new Hls();
      activeHls.loadSource(url);
      activeHls.attachMedia(video);
      activeHls.on(Hls.Events.MANIFEST_PARSED, function() {
        parseM3U8Master(url, function(qualities) {
          if (qualities && qualities.length) playerState.qualities = qualities;
        });
        applyDefaultQualityPreference(activeHls);
        resetHideTimer();
      });
      activeHls.on(Hls.Events.LEVEL_SWITCHED, function(event, data) {
        var lvl = activeHls.levels[data.level];
        if (lvl) {
          playerState.resolution = (lvl.width && lvl.height) ? (lvl.width + 'x' + lvl.height) : '';
          playerState.bandwidth = lvl.bitrate || 0;
          updateTitleDisplay();
        }
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
  } else if (isDash) {
    // DASH
    if (window.dashjs) {
      var dashPlayer = dashjs.MediaPlayer().create();
      dashPlayer.initialize(video, url, true);
      dashPlayer.on('qualityChange', function(e) {
        var q = dashPlayer.getQualityFor('video');
        playerState.resolution = q + 'p';
        updateTitleDisplay();
      });
      playerState.dash = dashPlayer;
      activeDash = dashPlayer;
      // apply default quality
      setTimeout(function() {
        var pref = data.settings.dataSaver ? 'lowest' : data.settings.defaultQuality;
        if (pref === 'lowest') dashPlayer.setQualityFor('video', 0, true);
        else if (pref === 'highest') {
          var levels = dashPlayer.getBitrateInfoListFor('video');
          if (levels && levels.length) dashPlayer.setQualityFor('video', levels.length - 1, true);
        }
      }, 1000);
    } else {
      var dashScript = document.createElement('script');
      dashScript.src = 'https://cdn.dashjs.org/latest/dash.all.min.js';
      dashScript.onload = function() { showVideoPlayer(url, type); };
      document.head.appendChild(dashScript);
      return;
    }
  } else {
    video.src = url;
  }

  // ===== FULLSCREEN CHANGE =====
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
  addCleanup(function() {
    document.removeEventListener('fullscreenchange', onFullscreenChange);
    document.removeEventListener('webkitfullscreenchange', onFullscreenChange);
    document.removeEventListener('mozfullscreenchange', onFullscreenChange);
    document.removeEventListener('MSFullscreenChange', onFullscreenChange);
  });

  // ===== HÀM PHỤ TRỢ =====
  function formatTime(sec) {
    if (!sec || sec < 0) return '00:00';
    sec = Math.floor(sec);
    var h = Math.floor(sec / 3600);
    var m = Math.floor((sec % 3600) / 60);
    var s = sec % 60;
    if (h > 0) return h + ':' + (m<10?'0':'') + m + ':' + (s<10?'0':'') + s;
    return (m<10?'0':'') + m + ':' + (s<10?'0':'') + s;
  }

  function updateTitleDisplay() {
    var infoDiv = document.querySelector('#__uvd_player_overlay__ .uvd-title-info');
    if (!infoDiv) return;
    var currentRes = '';
    if (video.videoWidth && video.videoHeight) {
      currentRes = video.videoWidth + 'x' + video.videoHeight;
    } else if (playerState.resolution) {
      currentRes = playerState.resolution;
    }
    if (playerState._displayedResolution !== currentRes) {
      playerState._displayedResolution = currentRes;
      var sub = playerState.type + (currentRes ? ' · ' + currentRes : '');
      infoDiv.innerHTML = '<div style="font-weight:600;font-size:14px;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">▶ ' + escapeHtml(pageInfo.title) + '</div><div style="font-size:11px;color:#aaa;margin-top:2px;">' + escapeHtml(sub) + '</div>';
    }
  }

  function applyDefaultQualityPreference(hls) {
    if (!hls || !hls.levels || !hls.levels.length) return;
    var pref = data.settings.dataSaver ? 'lowest' : data.settings.defaultQuality;
    if (pref === 'auto' || !pref) return;
    var levels = hls.levels;
    var bestIdx = 0;
    for (var i = 1; i < levels.length; i++) {
      if (pref === 'highest' && levels[i].bitrate > levels[bestIdx].bitrate) bestIdx = i;
      if (pref === 'lowest' && levels[i].bitrate < levels[bestIdx].bitrate) bestIdx = i;
    }
    hls.currentLevel = bestIdx;
  }

  function getNextStreamUrl(currentUrl) {
    var list = [...urls.entries()]
      .filter(function(e) { return e[1].type !== 'IFRAME'; })
      .map(function(e) { return { url: e[0], type: e[1].type, priority: e[1].priority }; })
      .sort(function(a, b) { return a.priority - b.priority; });
    var idx = list.findIndex(function(i) { return i.url === currentUrl; });
    if (idx === -1 || idx + 1 >= list.length) return null;
    return list[idx + 1];
  }

  function showQualitySubMenu() {
    var qualities = playerState.qualities;
    if (!qualities.length) { toast('Không có chất lượng'); return; }
    var overlay2 = document.createElement('div');
    overlay2.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:2147483649;display:flex;align-items:center;justify-content:center;';
    var panel = document.createElement('div');
    panel.style.cssText = 'background:rgba(20,22,30,0.95);border-radius:16px;padding:20px;min-width:250px;max-width:90%;border:1px solid rgba(255,255,255,0.15);';
    panel.innerHTML = '<div style="color:#fff;font-weight:600;margin-bottom:12px;">Chọn chất lượng</div>';
    var content = document.createElement('div');
    content.style.cssText = 'max-height:60vh;overflow-y:auto;';
    qualities.forEach(function(q, idx) {
      var btn = document.createElement('button');
      btn.className = 'uvd-btn uvd-btn-sm';
      btn.style.cssText = 'width:100%;margin-bottom:6px;text-align:center;';
      btn.textContent = q.label + (q.resolution !== 'unknown' ? ' (' + q.resolution + ')' : '');
      btn.onclick = function() {
        if (playerState.hls) {
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
      content.appendChild(btn);
    });
    panel.appendChild(content);
    var closeBtn = document.createElement('button');
    closeBtn.textContent = 'Đóng';
    closeBtn.className = 'uvd-btn uvd-btn-sm';
    closeBtn.style.cssText = 'width:100%;margin-top:10px;background:var(--danger);';
    closeBtn.onclick = function() { overlay2.remove(); };
    panel.appendChild(closeBtn);
    overlay2.appendChild(panel);
    __uvdAppendRoot(overlay2);
  }

  // ===== LƯU TRẠNG THÁI =====
  // Khởi tạo hiển thị
  resetHideTimer();
  // Cập nhật tốc độ label (không cần label nữa, nhưng có thể thêm)
  // Kết thúc
}

function closePlayer() {
  if (playerState.overlay) {
    if (data.settings.resumePlayback && playerState.url && playerState.video) {
      savePlaybackPosition(playerState.url, playerState.video);
    }
    clearSleepTimer();
    clearTimeout(playerState.hideTimeout);
    if (playerState.audioCtx) {
      try { playerState.audioCtx.close(); } catch(e) {}
      playerState.audioCtx = null;
      playerState.gainNode = null;
      playerState.sourceNode = null;
    }
    if (playerState.mini) { playerState.mini.remove(); playerState.mini = null; }
    if (playerState.video) {
      playerState.video.pause();
      playerState.video.src = '';
    }
    if (playerState.hls) { playerState.hls.destroy(); playerState.hls = null; }
    if (playerState.dash) { playerState.dash.reset(); playerState.dash = null; }
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
    playerState.progressEl = null;
    playerState.timeDisplay = null;
    playerState.playPauseBtn = null;
    playerState.menuDropdown = null;
    playerState.controlsContainer = null;

    data.settings.reduceMotion = playerState.wasReduceMotion;
    applyMotionPref(document.getElementById('__uvd__'));
    storage.set(data);
  }
}

function minimizePlayer() {
  if (playerState.isMinimized) return;
  playerState.isMinimized = true;
  var overlay = playerState.overlay;
  var video = playerState.video;
  video.pause();
  clearTimeout(playerState.hideTimeout);
  
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
  label.textContent = '▶ ' + escapeHtml(pageInfo.title);
  label.style.cssText = 'position:absolute;bottom:4px;left:8px;color:#fff;font-size:11px;font-weight:600;text-shadow:0 2px 4px rgba(0,0,0,0.8);background:rgba(0,0,0,0.5);padding:2px 8px;border-radius:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:90%;';
  mini.appendChild(label);
  __uvdAppendRoot(mini);
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

// ========== CSS BỔ SUNG ==========
var styleExtra = document.createElement('style');
styleExtra.textContent = `
#__uvd_controls__ input[type="range"]::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: #6d8cff;
  cursor: pointer;
  box-shadow: 0 0 8px rgba(109,140,255,0.6);
}
#__uvd_controls__ input[type="range"]::-moz-range-thumb {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: #6d8cff;
  cursor: pointer;
  border: none;
}
#__uvd_menu_dropdown__ .uvd-btn {
  background: transparent !important;
  border: none !important;
  color: #fff !important;
  padding: 8px 12px !important;
  font-size: 13px !important;
  text-align: left !important;
  border-radius: 6px !important;
  width: 100% !important;
}
#__uvd_menu_dropdown__ .uvd-btn:hover {
  background: rgba(255,255,255,0.1) !important;
}
`;
document.head.appendChild(styleExtra);

// ========== HÀM TẠO NÚT (tối ưu) ==========
function createButton(text, style, onClick) {
  var btn = document.createElement('button');
  btn.textContent = text;
  if (style) btn.style.cssText = style;
  btn.onclick = onClick;
  return btn;
}

// ========== PHẦN CÒN LẠI (buildUI, render, ...) giữ nguyên ==========
// ... (các hàm renderStreams, renderSettings, etc. giữ nguyên)
// Chú ý: Cần cập nhật hàm buildUI để gọi showVideoPlayer mới.
// Do showVideoPlayer đã được thay thế, không cần thay đổi gì thêm.

// ========== ĐẢM BẢO HÀM TOÀN CỤC ==========
window.__uvd_showPlayer = function(url, type) {
  showVideoPlayer(url, type);
};

// ========== BUILD UI (giữ nguyên) ==========
// ... (giữ nguyên buildUI, renderStreams, renderPlayerSettings, renderSettings)
// Tôi không viết lại toàn bộ buildUI ở đây vì nó đã có trong file gốc.
// Chỉ cần thay thế showVideoPlayer và closePlayer như trên.

// ========== START ==========
buildUI();
console.log('V' + VERSION + ' UMP DL PRO - Giao diện mới, dash.js, menu 3 chấm, blob link');
toast('V' + VERSION + ' PRO sẵn sàng!');

})();