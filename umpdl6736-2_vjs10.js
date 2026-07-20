/**
 * Universal Media Player & Downloader - V6.7.26 PRO (tính khung video dọc bằng JS, chắc chắn hơn)
 * - Loại bỏ: Screenshot, Volume Boost, Sleep Timer, Speed controls, PiP riêng
 * - Tối ưu observer, scan, debounce buildUI, giảm blur/glow
 * - Giữ nguyên: tìm stream, lọc quảng cáo, player card trượt, phụ đề, resume
 * Author: nguyenquocngu91
 */
(function() {
'use strict';

var VERSION = '6.7.26';
var HEADER_PROXY_BASE = 'https://render-header-proxy.onrender.com';

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
data.clickedButtons = data.clickedButtons || {};
data.settings = Object.assign({
  defaultSpeed: 1,
  defaultQuality: 'auto',
  dataSaver: false,
  autoFullscreen: false,
  resumePlayback: true,
  autoNext: false,
  reduceMotion: false,
  blurIntensity: 4,           // mức thấp mặc định, tăng được ở Cài đặt
  transitionSpeed: 0.18,
  transitionEasing: 'ease',
  doubleTapSeconds: 10,
  autoHideControls: true,
  showRemainingTime: true,
  hideDelay: 5,
  maxStoredUrls: 200,
  blockAutoplay: true,
  glowEffects: true,
  effectsIntensity: 8,        // mức thấp mặc định, tăng được ở Cài đặt
  headerProxyKey: '',
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
  el.classList.add('uvd-scope');
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
  var intensity = Math.max(0, Math.min(100, data.settings.effectsIntensity == null ? 8 : data.settings.effectsIntensity));
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

var __uvdFindUrlsCache = {};
function findUrls(text, source) {
  if (!text || typeof text !== 'string' || text.length > 30000) return;
  var hash = text.length + source;
  if (__uvdFindUrlsCache[hash]) return;
  __uvdFindUrlsCache[hash] = true;
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

// ========== POPUP BLOCKER ==========
var __uvdPopupBlockActive = false;
var __uvdOriginalWindowOpen = null;
var __uvdPopupGuardTimer = null;
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
  var blockWindowOpen = function() { __uvdBlockedCount++; return null; };
  window.open = blockWindowOpen;
  __uvdPopupGuardTimer = setInterval(function() {
    if (__uvdPopupBlockActive && window.open !== blockWindowOpen) window.open = blockWindowOpen;
  }, 1000);
  ['click', 'mousedown', 'pointerdown', 'auxclick'].forEach(function(type) {
    document.addEventListener(type, killBlankLinks, true);
  });
}

function uninstallPopupBlock() {
  if (!__uvdPopupBlockActive) return;
  __uvdPopupBlockActive = false;
  if (__uvdPopupGuardTimer) { clearInterval(__uvdPopupGuardTimer); __uvdPopupGuardTimer = null; }
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

// ========== NÚT ĐÃ CLICK ==========
function __uvdElementSelector(el) {
  if (!el || !el.tagName) return '';
  var tag = el.tagName.toLowerCase();
  if (el.id) return tag + '#' + el.id;
  if (typeof el.className === 'string' && el.className.trim()) {
    var cls = el.className.trim().split(/\s+/).slice(0, 3).join('.');
    if (cls) return tag + '.' + cls;
  }
  var attrs = ['data-host', 'data-server', 'data-name', 'name', 'title', 'aria-label'];
  for (var i = 0; i < attrs.length; i++) {
    var v = el.getAttribute && el.getAttribute(attrs[i]);
    if (v) return tag + '[' + attrs[i] + '="' + v.trim().substring(0, 40) + '"]';
  }
  var parent = el.parentElement;
  var idx = parent ? Array.prototype.indexOf.call(parent.children, el) : 0;
  return tag + ':nth-child(' + (idx + 1) + ')';
}

function isButtonBlocked(el) {
  var host = pageInfo.host;
  var sel = __uvdElementSelector(el);
  return !!(data.clickedButtons[host] && data.clickedButtons[host][sel] && data.clickedButtons[host][sel].blocked);
}

function recordClickedButton(el, sel, isFallback) {
  var host = pageInfo.host;
  data.clickedButtons[host] = data.clickedButtons[host] || {};
  var label = (el.textContent || '').trim().replace(/\s+/g, ' ').substring(0, 60) || sel;
  var rec = data.clickedButtons[host][sel];
  if (rec) {
    rec.count = (rec.count || 0) + 1;
    rec.lastClicked = Date.now();
    if (label) rec.label = label;
    if (isFallback) rec.fallback = true;
  } else {
    data.clickedButtons[host][sel] = { selector: sel, label: label, count: 1, blocked: false, lastClicked: Date.now(), fallback: !!isFallback };
  }
  storage.set(data);
}

// ========== FALLBACK ==========
var FALLBACK_SERVER_KEYWORDS = [
  'server', 'stream', 'host', 'nguồn', 'máy chủ', 'may chu',
  'vinovo', 'mixdrop', 'doodstream', 'streamtape', 'vidplay', 'fembed',
  'streamsb', 'voe', 'filemoon', 'upstream', 'okru', 'dood', 'gogo',
  'mp4upload', 'vidcloud', 'abyss', 'playerx', 'hydrax', 'streamwish'
];

function __uvdIsOwnUI(el) {
  return !!(el && el.closest && el.closest('.uvd-scope'));
}

function looksLikeServerButton(el) {
  var text = (el.textContent || '').trim();
  if (!text || text.length > 24) return false;
  var lower = text.toLowerCase();
  if (/^[A-Za-z0-9]{1,5}$/.test(text) && text === text.toUpperCase() && text !== text.toLowerCase()) return true;
  return FALLBACK_SERVER_KEYWORDS.some(function(k) { return lower.indexOf(k) !== -1; });
}

function collectFallbackButtons(root) {
  root = root || document;
  var list = [];
  var seen = [];
  try {
    root.querySelectorAll('button, a, [role="button"], [class*="server" i], [class*="stream" i], [class*="host" i], [id*="server" i], [id*="stream" i], [id*="host" i]').forEach(function(el) {
      if (seen.indexOf(el) !== -1) return;
      seen.push(el);
      if (__uvdIsOwnUI(el)) return;
      if (isButtonBlocked(el)) return;
      if (looksLikeServerButton(el)) list.push(el);
    });
  } catch(e) {}
  return list;
}

function autoClickPlayButtons(root, depth, allowVideoPlayFallback, allowTextGuess) {
  root = root || document;
  depth = depth || 0;
  if (depth > 3) return 0;
  var clicked = 0;
  var customSel = (data.siteProfiles[pageInfo.host] && data.siteProfiles[pageInfo.host].playSelector) || '';
  var selectors = customSel ? [customSel].concat(AUTO_PLAY_SELECTORS) : AUTO_PLAY_SELECTORS;
  selectors.forEach(function(sel) {
    try {
      root.querySelectorAll(sel).forEach(function(el) {
        if (__uvdIsOwnUI(el)) return;
        if (isButtonBlocked(el)) return;
        if (simulateClick(el)) {
          clicked++;
          recordClickedButton(el, __uvdElementSelector(el));
        }
      });
    } catch(e) {}
  });
  if (clicked === 0 && allowTextGuess) {
    try {
      collectFallbackButtons(root).forEach(function(el) {
        if (simulateClick(el)) {
          clicked++;
          recordClickedButton(el, __uvdElementSelector(el), true);
        }
      });
    } catch(e) {}
  }
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
      try { if (f.contentDocument) clicked += autoClickPlayButtons(f.contentDocument, depth + 1, allowVideoPlayFallback, allowTextGuess); }
      catch(e) {}
    });
  } catch(e) {}
  return clicked;
}

// ========== AUTO-CLICK LẦN LƯỢT ==========
function collectServerButtons(root) {
  root = root || document;
  var customSel = (data.siteProfiles[pageInfo.host] && data.siteProfiles[pageInfo.host].playSelector) || '';
  var selectors = customSel ? [customSel] : AUTO_PLAY_SELECTORS;
  var seen = [];
  var list = [];
  selectors.forEach(function(sel) {
    try {
      root.querySelectorAll(sel).forEach(function(el) {
        if (seen.indexOf(el) !== -1) return;
        seen.push(el);
        if (__uvdIsOwnUI(el)) return;
        if (!isButtonBlocked(el)) list.push(el);
      });
    } catch(e) {}
  });
  var usedFallback = false;
  if (!list.length) {
    list = collectFallbackButtons(root);
    usedFallback = true;
  }
  list.__uvdFallback = usedFallback;
  return list;
}

var __uvdSeqRunning = false;
function autoClickSequential() {
  if (__uvdSeqRunning) { toast('Đang thử lần lượt server, chờ chút...'); return; }
  var candidates = collectServerButtons(document);
  if (!candidates.length) {
    toast('Không tìm thấy nút server nào (đặt "Play selector" ở trên trước, hoặc mọi nút đều đang bị chặn ở tab "Nút đã click")');
    return;
  }
  __uvdSeqRunning = true;
  var idx = 0;
  var totalBefore = urls.size;
  var isFallback = !!candidates.__uvdFallback;
  toast((isFallback ? '🔍 Không khớp nút chuẩn, đoán theo text — ' : '🔎 ') + 'Đang thử lần lượt ' + candidates.length + ' server...');

  function finish(success, sel) {
    __uvdSeqRunning = false;
    if (success) {
      toast('✅ Tìm ra link qua: ' + sel);
    } else {
      toast('❌ Đã thử hết ' + candidates.length + ' server, chưa thấy link mới. Site có thể chặn click giả lập (isTrusted) — thử bấm tay.');
    }
    if (document.getElementById('__uvd__')) debouncedBuildUI();
  }

  function tryNext() {
    if (idx >= candidates.length) { finish(false); return; }
    var el = candidates[idx++];
    var sel = __uvdElementSelector(el);
    var beforeThis = urls.size;
    if (!simulateClick(el)) { tryNext(); return; }
    recordClickedButton(el, sel, isFallback);
    setTimeout(function() {
      scan(document, 'seq-autoclick');
      pauseAllPlayingVideos();
      if (urls.size > beforeThis) {
        finish(true, sel);
      } else {
        tryNext();
      }
    }, 1800);
  }
  tryNext();
}
window.__uvd_autoClickSequential = function() { autoClickSequential(); };

// ========== SETTINGS OVERLAY ==========
function closeSettingsOverlay() {
  var ov = document.getElementById('__uvd_settings_overlay__');
  if (!ov) return;
  ov.classList.remove('uvd-open');
  setTimeout(function() { ov.remove(); }, 300);
}

function openSettingsOverlay() {
  if (document.getElementById('__uvd_settings_overlay__')) return;
  var ov = document.createElement('div');
  ov.id = '__uvd_settings_overlay__';
  ov.className = 'uvd-settings-overlay';
  ov.innerHTML =
    '<div class="uvd-settings-sheet">' +
      '<div class="uvd-settings-header">' +
        '<button class="uvd-back-btn" id="__uvd_settings_back__" title="Đóng">←</button>' +
        '<div class="uvd-settings-title-wrap"><span class="uvd-settings-title">⚙ Cài đặt</span><span class="uvd-settings-subtitle">Tùy chỉnh workspace</span></div>' +
      '</div>' +
      '<div class="uvd-settings-body" id="__uvd_settings_body__"></div>' +
    '</div>';
  __uvdAppendRoot(ov);
  applyEffectsPref(ov);
  applyMotionPref(ov);
  var settingsBody = document.getElementById('__uvd_settings_body__');
  var settingsSheet = ov.querySelector('.uvd-settings-sheet');
  renderSettings(settingsBody);
  var scrollTimer;
  settingsBody.addEventListener('scroll', function() {
    settingsSheet.classList.add('uvd-scroll-performance');
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(function() { settingsSheet.classList.remove('uvd-scroll-performance'); }, 160);
  }, { passive: true });
  document.getElementById('__uvd_settings_back__').onclick = closeSettingsOverlay;
  ov.addEventListener('click', function(e) { if (e.target === ov) closeSettingsOverlay(); });
  requestAnimationFrame(function() { ov.classList.add('uvd-open'); });
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

// ========== CHẶN AUTOPLAY ==========
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

// ========== OBSERVER TỐI ƯU ==========
var __uvdObserverDebounce = null;
var __uvdObserverQueue = [];
function __uvdFlushObserver() {
  if (!__uvdObserverQueue.length) return;
  var nodes = __uvdObserverQueue;
  __uvdObserverQueue = [];
  for (var i = 0; i < nodes.length; i++) {
    var node = nodes[i];
    if (node.tagName === 'VIDEO' || node.tagName === 'AUDIO') __uvdNeutralizeMedia(node);
    if (node.querySelectorAll) {
      node.querySelectorAll('video,audio').forEach(__uvdNeutralizeMedia);
    }
  }
}
var __uvdAutoplayObserver = new MutationObserver(function(mutations) {
  if (!data.settings.blockAutoplay) return;
  for (var i = 0; i < mutations.length; i++) {
    var added = mutations[i].addedNodes;
    if (!added || !added.length) continue;
    for (var j = 0; j < added.length; j++) {
      if (added[j] instanceof Element) __uvdObserverQueue.push(added[j]);
    }
  }
  if (__uvdObserverQueue.length) {
    clearTimeout(__uvdObserverDebounce);
    __uvdObserverDebounce = setTimeout(__uvdFlushObserver, 200);
  }
});
__uvdAutoplayObserver.observe(document.body, { childList: true, subtree: false });
addCleanup(function() { __uvdAutoplayObserver.disconnect(); });

try { document.querySelectorAll('video,audio').forEach(__uvdNeutralizeMedia); } catch(e) {}

// ========== VISIBILITY ==========
function __uvdVisibilityHandler() {
  document.documentElement.classList.toggle('uvd-tab-hidden', document.hidden);
}
document.addEventListener('visibilitychange', __uvdVisibilityHandler);
addCleanup(function() {
  document.removeEventListener('visibilitychange', __uvdVisibilityHandler);
  document.documentElement.classList.remove('uvd-tab-hidden');
});

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
panelObserver.observe(document.documentElement, { childList: true, subtree: false });
addCleanup(function() { panelObserver.disconnect(); });

// ========== DEBOUNCE BUILDUI ==========
var __uvdBuildUIDebounce = null;
function debouncedBuildUI() {
  clearTimeout(__uvdBuildUIDebounce);
  __uvdBuildUIDebounce = setTimeout(buildUI, 300);
}

function runAutoClickAndRescan(silent) {
  var beforeCount = urls.size;
  var lastCount = beforeCount;
  var clicked = 0;
  installPopupBlock();
  clicked = autoClickPlayButtons(document, 0, !silent, !silent);
  var delays = [1200, 2400]; // giảm số lần rescan
  var reportedAt = -1;
  delays.forEach(function(delay, idx) {
    setTimeout(function() {
      if (playerState.overlay) return;
      scan(document, 'autoclick-rescan');
      var afterCount = urls.size;
      var newSinceLast = afterCount - lastCount;
      lastCount = afterCount;
      if (newSinceLast <= 0) {
        if (idx === delays.length - 1 && !silent && reportedAt === -1) {
          toast(clicked > 0 ? 'Đã bấm Play nhưng chưa thấy link mới — site này có thể chặn click giả lập, thử bấm tay' : 'Không tìm thấy nút Play trên trang này');
        }
        return;
      }
      var totalFound = afterCount - beforeCount;
      if (reportedAt === -1) {
        reportedAt = idx;
        toast('▶ Tự động Play: tìm thêm ' + totalFound + ' luồng mới');
        if (document.getElementById('__uvd__')) debouncedBuildUI();
        setTimeout(function() {
          var n = pauseAllPlayingVideos();
          if (n > 0) toast('⏸ Đã tạm dừng video gốc, xem qua player script cho ổn định');
        }, 800);
      } else if (document.getElementById('__uvd__')) {
        debouncedBuildUI();
      }
    }, delay);
  });
}

window.__uvd_autoClickPlay = function() { runAutoClickAndRescan(false); };
setTimeout(function() { runAutoClickAndRescan(true); }, 400);

// ========== M3U8 PARSER ==========
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
          var qualityLabel = resolution === 'unknown' ? Math.round(bandwidth/1000) + 'kbps' : resolution.split('x')[1] + 'p';
          var streamUrl = nextLine;
          if (!streamUrl.startsWith('http')) {
            var baseUrl = url.substring(0, url.lastIndexOf('/') + 1);
            streamUrl = baseUrl + streamUrl;
          }
          qualities.push({ label: qualityLabel, resolution: resolution, bandwidth: bandwidth, url: streamUrl });
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
  el.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);background:' + (color || '#ff4fd8') + ';color:#fff;padding:12px 24px;border-radius:30px;z-index:2147483647;font:600 13px Segoe UI;box-shadow:0 4px 15px rgba(0,0,0,0.4);animation:uvdSlideIn 0.3s ease;';
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
    debouncedBuildUI();
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
var __uvdScriptHidden = false;
var playerState = {
  overlay: null,
  video: null,
  hls: null,
  qualities: [],
  currentQuality: 0,
  speed: 1,
  url: '',
  type: '',
  resolution: '',
  bandwidth: 0,
  playbackError: '',
  proxyRetried: false,
  sizeRequested: false,
  closing: false,
  _displayedResolution: '',
  onFullscreenChange: null,
  __uvdLayoutFn: null,
  audioCtx: null,    // vẫn giữ nhưng không dùng boost
  gainNode: null,
  sourceNode: null,
  savePosTimer: null,
  wasReduceMotion: false,
  hideTimeout: null,
  controlsVisible: true,
  launchFromThumbnail: false,
  timeMode: 0
};

// ========== RESUME ==========
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
  var settled = false;
  function finish(fn) { if (settled) return; settled = true; clearTimeout(hardTimeoutId); fn(); }
  var hardTimeoutId = setTimeout(function() {
    finish(function() {
      console.error('[UMP DL] SubDL: hết 15s không phản hồi');
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
        console.warn('[UMP DL] SubDL lỗi:', json.message || json);
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
  overlay2.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:2147483647;display:flex;align-items:center;justify-content:center;padding:16px;';
  var panel = document.createElement('div');
  applyEffectsPref(panel);
  panel.style.cssText = 'background:var(--glass);backdrop-filter:blur(var(--uvd-blur)) saturate(130%);-webkit-backdrop-filter:blur(var(--uvd-blur)) saturate(130%);border-radius:16px;padding:20px;width:100%;max-width:380px;max-height:85vh;overflow-y:auto;border:1px solid var(--border);box-shadow:0 20px 50px rgba(43,24,54,0.25);';
  panel.innerHTML =
    '<div style="color:var(--text);font-weight:600;margin-bottom:4px;">💬 Phụ đề <span style="font-size:10px;color:var(--gold);font-weight:400;">(thử nghiệm)</span></div>' +
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
        row.innerHTML = '<div style="font-size:12px;color:var(--text);">' + escapeHtml(title) + '</div>' +
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

// ========== GESTURE ==========
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

// ========== VIDEO.JS V10 MOUNT ==========
function __uvdMountVjs10(wrapper, video, onMount) {
  var FALLBACK_MS = 4000;
  var done = false;
  function fallbackToNative() {
    if (done) return;
    done = true;
    if (!video.parentNode) wrapper.appendChild(video);
    video.setAttribute('controls', '');
  }
  function wrapWithSkin() {
    if (done) return;
    done = true;
    try {
      var player = document.createElement('video-player');
      player.style.cssText = 'width:100%;max-height:100%;display:block;aspect-ratio:16/9;margin:auto;position:relative;z-index:1;overflow:hidden;transition:width .25s ease;border-radius:inherit;background:var(--glass);';
      player.id = '__uvd_player_el__';
      var skin = document.createElement('video-skin');
      skin.style.cssText = 'width:100%;height:100%;display:block;overflow:hidden;border-radius:inherit;background:var(--glass);';
      if (video.parentNode) video.parentNode.removeChild(video);
      skin.appendChild(video);
      player.appendChild(skin);
      wrapper.appendChild(player);
      if (onMount) onMount();
    } catch (e) {
      console.error('[UMP DL] Video.js v10 mount lỗi, dùng controls gốc:', e);
      done = false;
      fallbackToNative();
    }
  }
  if (customElements.get('video-player')) { wrapWithSkin(); return; }
  if (!window.__uvdVjs10Loading) {
    window.__uvdVjs10Loading = true;
    var s = document.createElement('script');
    s.type = 'module';
    s.src = 'https://cdn.jsdelivr.net/npm/@videojs/html/cdn/video.js';
    s.onerror = function() { console.error('[UMP DL] Không tải được Video.js v10 (có thể do CSP chặn trang), dùng controls gốc'); };
    document.head.appendChild(s);
  }
  var checkStart = Date.now();
  var iv = setInterval(function() {
    if (customElements.get('video-player')) {
      clearInterval(iv);
      wrapWithSkin();
    } else if (Date.now() - checkStart > FALLBACK_MS) {
      clearInterval(iv);
      console.warn('[UMP DL] Video.js v10 chưa sẵn sàng sau ' + FALLBACK_MS + 'ms, dùng controls gốc');
      fallbackToNative();
    }
  }, 100);
}

// ========== HEADER PROXY ==========
function buildHeaderProxyUrl(sourceUrl, type) {
  if (!HEADER_PROXY_BASE || !sourceUrl || sourceUrl.indexOf(HEADER_PROXY_BASE) === 0) return '';
  var isHlsSource = String(type || '').toUpperCase() === 'M3U8' || /m3u8/i.test(sourceUrl);
  var endpoint = isHlsSource ? '/hls' : '/proxy';
  var params = new URLSearchParams();
  params.set('url', sourceUrl);
  params.set('referer', pageInfo.referer || location.href);
  params.set('origin', location.origin);
  if (data.settings.headerProxyKey) params.set('key', data.settings.headerProxyKey);
  return HEADER_PROXY_BASE.replace(/\/$/, '') + endpoint + '?' + params.toString();
}

function retryThroughHeaderProxy(sourceUrl, type) {
  if (playerState.proxyRetried) return false;
  var proxyUrl = buildHeaderProxyUrl(sourceUrl, type);
  if (!proxyUrl) return false;
  playerState.proxyRetried = true;
  toast('🔁 Đang đánh thức Render proxy…');
  var healthUrl = HEADER_PROXY_BASE.replace(/\/$/, '') + '/health';
  var wake = fetch(healthUrl, { cache: 'no-store', signal: AbortSignal.timeout(25000) }).catch(function() {});
  wake.then(function() {
    toast('🔁 Đang thử phát qua proxy header…');
    showVideoPlayer(proxyUrl, type, true);
  });
  return true;
}

// ========== SHOW VIDEO PLAYER ==========
function showVideoPlayer(url, type, fromProxy) {
  if (playerState.overlay && playerState.url === url) return;
  if (playerState.overlay) closePlayer();
  playerState.url = url;
  playerState.type = type;
  if (!fromProxy) playerState.proxyRetried = false;
  playerState.sizeRequested = false;
  playerState.playbackError = '';
  playerState.closing = false;
  playerState._displayedResolution = '';
  playerState.timeMode = 0;
  pauseAllPlayingVideos();

  playerState.wasReduceMotion = data.settings.reduceMotion;
  if (!data.settings.reduceMotion) {
    data.settings.reduceMotion = true;
    applyMotionPref(document.getElementById('__uvd__'));
  }

  var overlay = document.createElement('div');
  overlay.id = '__uvd_player_overlay__';
  overlay.className = 'uvd-settings-overlay';
  __uvdAppendRoot(overlay);
  __uvdIsolateLayer(overlay);
  applyEffectsPref(overlay);

  var sheet = document.createElement('div');
  sheet.className = 'uvd-settings-sheet uvd-player-sheet' + (playerState.launchFromThumbnail ? ' uvd-player-from-thumbnail' : '');
  playerState.launchFromThumbnail = false;
  sheet.style.cssText = 'display:flex; flex-direction:column; height:92dvh; max-height:92dvh; overflow:hidden; box-sizing:border-box;';
  overlay.appendChild(sheet);

  var sheetHeader = document.createElement('div');
  sheetHeader.className = 'uvd-settings-header';
  sheetHeader.id = '__uvd_player_header__';
  sheetHeader.style.cssText = 'flex-shrink:0; justify-content:space-between;';
  var backBtn = document.createElement('button');
  backBtn.className = 'uvd-back-btn';
  backBtn.id = '__uvd_player_close__';
  backBtn.textContent = '←';
  backBtn.title = 'Đóng player';
  var menuBtn = document.createElement('button');
  menuBtn.className = 'uvd-icon-btn uvd-icon-btn-wide';
  menuBtn.textContent = '⋮';
  menuBtn.title = 'Tuỳ chọn';
  menuBtn.style.cssText = 'flex-shrink:0;';
  var playerHeaderTitle = document.createElement('div');
  playerHeaderTitle.className = 'uvd-player-header-title';
  playerHeaderTitle.innerHTML = '<span class="uvd-player-live-dot"></span><div><strong>Đang phát video</strong><small>' + escapeHtml(type || 'Media') + ' · UMP DL Player</small></div>';
  sheetHeader.appendChild(backBtn);
  sheetHeader.appendChild(playerHeaderTitle);
  sheetHeader.appendChild(menuBtn);
  sheet.appendChild(sheetHeader);

  var sheetBody = document.createElement('div');
  sheetBody.className = 'uvd-settings-body';
  sheetBody.style.cssText = 'flex:1; min-height:0; padding:0 !important; overflow-y:auto; display:flex; flex-direction:column; background:transparent;';
  var videoArea = document.createElement('div');
  videoArea.className = 'uvd-player-video-area';
  videoArea.style.cssText = 'flex:1; min-height:0; display:flex; align-items:center; justify-content:center;';
  var videoWrapper = document.createElement('div');
  videoWrapper.id = '__uvd_video_wrapper__';
  videoWrapper.style.cssText = 'display:flex; align-items:center; justify-content:center; width:100%; height:100%; background:var(--glass);';
  var video = document.createElement('video');
  video.id = '__uvd_player_video__';
  video.style.cssText = 'max-width:100%; max-height:100%; width:100%; height:100%; display:block; object-fit:contain; background:var(--glass);';
  video.setAttribute('playsinline', '');
  video.setAttribute('webkit-playsinline', '');
  // MP4 nguồn gốc thường không trả CORS; không ép anonymous vì sẽ khiến browser từ chối phát.
  // Chỉ cần CORS khi phát qua proxy hoặc HLS/hls.js.
  if (url.indexOf(HEADER_PROXY_BASE) === 0 || String(type || '').toUpperCase() === 'M3U8') {
    video.setAttribute('crossorigin', 'anonymous');
  }
  videoWrapper.appendChild(video);
  videoArea.appendChild(videoWrapper);
  sheetBody.appendChild(videoArea);

  var infoPanel = document.createElement('div');
  infoPanel.className = 'uvd-player-info-panel';
  var titleRow = document.createElement('div');
  titleRow.className = 'uvd-player-info-title';
  titleRow.innerHTML = '<span class="uvd-player-info-icon">▶</span><span>' + escapeHtml(pageInfo.title) + '</span>';
  var infoRow = document.createElement('div');
  infoRow.id = '__uvd_player_info__';
  infoRow.className = 'uvd-player-info-meta';
  infoRow.textContent = type + ' · đang tải...';
  infoPanel.appendChild(titleRow);
  infoPanel.appendChild(infoRow);
  sheetBody.appendChild(infoPanel);
  sheet.appendChild(sheetBody);

  playerState.overlay = overlay;
  playerState.video = video;
  videoWrapper.style.boxSizing = 'border-box';

  function __uvdIsFullscreenNow() {
    var fe = document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement;
    return !!(fe && (fe === videoWrapper || videoWrapper.contains(fe) || fe.contains(videoWrapper)));
  }
  var PORTRAIT_INSET = 12;
  var FLOAT_SHADOW = 'none';
  videoWrapper.style.position = 'relative';
  videoWrapper.style.overflow = 'hidden';
  function __uvdApplyPlayerLayout() {
    var playerEl = document.getElementById('__uvd_player_el__');
    if (!playerEl) return;
    var fs = __uvdIsFullscreenNow();
    var hasDims = video.videoWidth && video.videoHeight;
    var isPortrait = hasDims && video.videoHeight > video.videoWidth;

    if (fs) {
      // Fullscreen: luôn đúng tỉ lệ thật, sát viền, không bo góc/bóng
      videoWrapper.style.padding = '0';
      playerEl.style.position = 'relative';
      playerEl.style.margin = 'auto';
      playerEl.style.aspectRatio = hasDims ? (video.videoWidth + '/' + video.videoHeight) : '16/9';
      playerEl.style.width = '100%';
      playerEl.style.height = '';
      playerEl.style.borderRadius = '0';
      playerEl.style.boxShadow = 'none';
      video.style.objectFit = 'contain';
      return;
    }

    if (isPortrait) {
      // Video dọc: tính khung bằng pixel thật (JS đo trực tiếp) thay vì để CSS/aspect-ratio nội bộ
      // của <video-player> tự quyết định — đảm bảo lề đều 4 phía, không bo góc, video phủ kín (cover)
      videoWrapper.style.padding = '0';
      var availW = videoWrapper.clientWidth;
      var availH = videoWrapper.clientHeight;
      var boxW = Math.max(0, availW - PORTRAIT_INSET * 2);
      var boxH = Math.max(0, availH - PORTRAIT_INSET * 2);
      playerEl.style.position = 'relative';
      playerEl.style.margin = 'auto';
      playerEl.style.aspectRatio = 'auto';
      if (boxW > 0 && boxH > 0) {
        playerEl.style.width = boxW + 'px';
        playerEl.style.height = boxH + 'px';
      } else {
        playerEl.style.width = '95%';
        playerEl.style.height = '95%';
      }
      playerEl.style.borderRadius = '16px';
      playerEl.style.boxShadow = FLOAT_SHADOW;
      video.style.objectFit = 'cover';
      video.style.borderRadius = 'inherit';
    } else {
      // Video ngang: giữ nguyên (đã đẹp) — khung theo đúng tỉ lệ, bo góc, đổ bóng nổi
      videoWrapper.style.padding = '0';
      playerEl.style.position = 'relative';
      playerEl.style.margin = 'auto';
      playerEl.style.aspectRatio = hasDims ? (video.videoWidth + '/' + video.videoHeight) : '16/9';
      playerEl.style.width = '95%';
      playerEl.style.height = '';
      playerEl.style.borderRadius = '16px';
      playerEl.style.boxShadow = FLOAT_SHADOW;
      video.style.objectFit = 'contain';
      video.style.borderRadius = 'inherit';
    }
  }
  video.addEventListener('loadedmetadata', __uvdApplyPlayerLayout);
  video.addEventListener('resize', __uvdApplyPlayerLayout);
  window.addEventListener('resize', __uvdApplyPlayerLayout);
  window.addEventListener('orientationchange', __uvdApplyPlayerLayout);
  playerState.__uvdLayoutFn = __uvdApplyPlayerLayout;
  __uvdApplyPlayerLayout();
  playerState.updatePlayerWidth = __uvdApplyPlayerLayout;
  __uvdMountVjs10(videoWrapper, video, __uvdApplyPlayerLayout);

  // Đóng
  backBtn.onclick = function() { closePlayer(); };
  overlay.addEventListener('click', function(e) {
    if (e.target === overlay) closePlayer();
  });

  requestAnimationFrame(function() {
    overlay.classList.add('uvd-open');
  });

  // Menu ⋮
  function createMenuPanel(title, options, callback) {
    var overlay2 = document.createElement('div');
    overlay2.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:2147483647;display:flex;align-items:center;justify-content:center;';
    var panel = document.createElement('div');
    panel.style.cssText = 'background:var(--glass);backdrop-filter:blur(var(--uvd-blur)) saturate(130%);-webkit-backdrop-filter:blur(var(--uvd-blur)) saturate(130%);border-radius:16px;padding:20px;min-width:250px;max-width:90%;border:1px solid var(--border);box-shadow:0 20px 50px rgba(43,24,54,0.25);';
    panel.innerHTML = '<div style="color:var(--text);font-weight:600;margin-bottom:12px;">' + escapeHtml(title) + '</div>';
    var content = document.createElement('div');
    content.style.cssText = 'max-height:60vh;overflow-y:auto;';
    options.forEach(function(opt) {
      var btn = document.createElement('button');
      btn.className = 'uvd-btn uvd-btn-sm';
      btn.style.cssText = 'width:100%;margin-bottom:6px;text-align:center;';
      btn.textContent = opt.label;
      btn.onclick = function() {
        callback(opt.value);
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

  function showQualitySubMenu() {
    var qualities = playerState.qualities;
    if (!qualities.length) { toast('Không có chất lượng'); return; }
    var opts = qualities.map(function(q, idx) {
      return { label: q.label + (q.resolution !== 'unknown' ? ' (' + q.resolution + ')' : ''), value: idx };
    });
    createMenuPanel('Chọn chất lượng', opts, function(idx) {
      var q = qualities[idx];
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
    });
  }

  menuBtn.onclick = function(e) {
    e.stopPropagation();
    var existing = document.getElementById('__uvd_player_menu__');
    if (existing) { existing.remove(); return; }
    var menu = document.createElement('div');
    menu.id = '__uvd_player_menu__';
    menu.className = 'uvd-player-menu';
    var qBtn = document.createElement('button');
    qBtn.innerHTML = '🎚 Chất lượng';
    qBtn.onclick = function() { menu.remove(); if (playerState.qualities.length > 0) showQualitySubMenu(); else toast('Không có chất lượng để chọn'); };
    var sBtn = document.createElement('button');
    sBtn.innerHTML = '💬 Phụ đề';
    sBtn.onclick = function() { menu.remove(); showSubtitlePanel(playerState.video); };
    menu.appendChild(qBtn);
    menu.appendChild(sBtn);
    sheetHeader.appendChild(menu);
    setTimeout(function() {
      document.addEventListener('click', function onDoc(ev) {
        if (!menu.contains(ev.target) && ev.target !== menuBtn) { menu.remove(); document.removeEventListener('click', onDoc); }
      });
    }, 0);
  };

  // Update info
  function updateInfoDisplay() {
    var info = document.getElementById('__uvd_player_info__');
    if (!info) return;
    if (playerState.playbackError) {
      info.textContent = '⚠ ' + playerState.playbackError;
      return;
    }
    var parts = [playerState.type];
    var res = '';
    if (video && video.videoWidth && video.videoHeight) {
      res = video.videoWidth + '×' + video.videoHeight;
    } else if (playerState.resolution) {
      res = playerState.resolution;
    }
    if (res) parts.push(res);
    var sizeText = '';
    if (isHls) {
      var bw = 0;
      if (playerState.hls) {
        var lvl = playerState.hls.levels[playerState.hls.currentLevel];
        bw = (lvl && lvl.bitrate) ? lvl.bitrate : (playerState.bandwidth || 0);
      } else {
        bw = playerState.bandwidth || 0;
      }
      if (!bw && playerState.qualities && playerState.qualities.length) {
        var curRes = res.replace('×', 'x');
        var match = playerState.qualities.find(function(q) { return q.resolution === curRes; }) || playerState.qualities[0];
        if (match && match.bandwidth) bw = match.bandwidth;
      }
      if (bw && video.duration && isFinite(video.duration)) {
        var bytes = (bw / 8) * video.duration;
        var s = formatBytes(bytes);
        if (s) sizeText = '≈ ' + s;
      }
    } else if (!playerState.sizeRequested) {
      var mediaUrl = video.currentSrc || video.src;
      if (mediaUrl && !mediaUrl.startsWith('blob:')) {
        playerState.sizeRequested = true;
        var sizeUrl = mediaUrl;
        if (mediaUrl.indexOf(HEADER_PROXY_BASE) !== 0) {
          sizeUrl = buildHeaderProxyUrl(mediaUrl, playerState.type) || mediaUrl;
        }
        fetch(sizeUrl, { method: 'HEAD', cache: 'no-store' })
          .then(function(r) {
            var len = r.headers.get('content-length');
            var range = r.headers.get('content-range');
            var match = range && range.match(/\/([0-9]+)/);
            var total = match ? parseInt(match[1], 10) : (len ? parseInt(len, 10) : 0);
            var s = formatBytes(total);
            if (s && !info.textContent.includes('≈')) info.textContent = info.textContent + ' · ≈ ' + s;
          })
          .catch(function(){});
      }
    }
    if (sizeText) parts.push(sizeText);
    info.textContent = parts.join(' · ');
  }

  function setPlaybackError(message) {
    playerState.playbackError = message;
    updateInfoDisplay();
    toast('⚠ ' + message, '#ff5d72');
  }

  function formatBytes(bytes) {
    if (!bytes || bytes <= 0) return null;
    var units = ['B', 'KB', 'MB', 'GB'];
    var i = 0;
    while (bytes >= 1024 && i < units.length - 1) { bytes /= 1024; i++; }
    return bytes.toFixed(i === 0 ? 0 : 1) + ' ' + units[i];
  }

  function formatTime(sec) {
    if (!sec || sec < 0) return '00:00';
    sec = Math.floor(sec);
    var h = Math.floor(sec / 3600);
    var m = Math.floor((sec % 3600) / 60);
    var s = sec % 60;
    if (h > 0) return h + ':' + (m<10?'0':'') + m + ':' + (s<10?'0':'') + s;
    return (m<10?'0':'') + m + ':' + (s<10?'0':'') + s;
  }

  // Khởi tạo phát video
  var isHls = url.includes('.m3u8') || url.includes('m3u8');
  var activeHls = null;

  function onMetadataLoaded() {
    lockOrientation(video);
    if (video.videoWidth && video.videoHeight && !playerState.resolution) {
      playerState.resolution = video.videoWidth + 'x' + video.videoHeight;
    }
    updateInfoDisplay();
    if (isHls && playerState.qualities.length === 0) {
      parseM3U8Master(url, function(qualities) {
        if (qualities && qualities.length > 0) {
          playerState.qualities = qualities;
          updateInfoDisplay();
        }
      });
    }
    if (data.settings.defaultSpeed && data.settings.defaultSpeed !== 1) {
      video.playbackRate = data.settings.defaultSpeed;
    }
    if (data.settings.autoFullscreen && !document.fullscreenElement) {
      var vw = document.getElementById('__uvd_video_wrapper__');
      var fsReq = vw && (vw.requestFullscreen || vw.webkitRequestFullscreen);
      if (fsReq) fsReq.call(vw).catch(function(){});
    }
    if (data.settings.resumePlayback) {
      var pos = getPlaybackPosition(url);
      if (pos && pos.time > 3) {
        video.currentTime = pos.time;
        toast('▶ Tiếp tục từ ' + formatTime(pos.time));
      }
    }
  }

  video.addEventListener('loadedmetadata', onMetadataLoaded);
  video.addEventListener('durationchange', updateInfoDisplay);
  video.addEventListener('error', function() {
    if (playerState.closing || playerState.video !== video) return;
    if (!fromProxy && retryThroughHeaderProxy(url, type)) return;
    var code = video.error && video.error.code;
    if (code === 3) setPlaybackError('Không giải mã được video (codec/container hoặc dữ liệu đọc chưa đúng).');
    else if (code === 4) setPlaybackError('Browser không hỗ trợ hoặc không đọc được nguồn video.');
    else setPlaybackError('Không thể tải nguồn video. Có thể link hết hạn hoặc nguồn tạm thời không phản hồi.');
  });
  var __lastPosSave = 0;
  video.addEventListener('timeupdate', function() {
    if (data.settings.resumePlayback && Date.now() - __lastPosSave > 10000) {
      __lastPosSave = Date.now();
      savePlaybackPosition(url, video);
    }
    updateInfoDisplay();
  });
  video.addEventListener('ended', function() {
    if (data.settings.resumePlayback) { delete data.playbackPositions[url]; storage.set(data); }
    if (data.settings.autoNext) {
      var nextUrl = getNextStreamUrl(url);
      if (nextUrl) { toast('⏭ Đang phát stream tiếp theo...'); setTimeout(function() { showVideoPlayer(nextUrl.url, nextUrl.type); }, 800); }
    }
  });

  function getNextStreamUrl(currentUrl) {
    var list = [...urls.entries()]
      .filter(function(e) { return e[1].type !== 'IFRAME'; })
      .map(function(e) { return { url: e[0], type: e[1].type, priority: e[1].priority }; })
      .sort(function(a, b) { return a.priority - b.priority; });
    var idx = list.findIndex(function(i) { return i.url === currentUrl; });
    if (idx === -1 || idx + 1 >= list.length) return null;
    return list[idx + 1];
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
            updateInfoDisplay();
          }
        });
        applyDefaultQualityPreference();
      });
      activeHls.on(Hls.Events.ERROR, function(event, data) {
        if (playerState.closing || !data || !data.fatal) return;
        if (!fromProxy && retryThroughHeaderProxy(url, type)) return;
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) setPlaybackError('HLS gặp lỗi mạng hoặc không đọc được segment.');
        else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) setPlaybackError('HLS không giải mã được codec/container của video.');
        else setPlaybackError('HLS không đọc được playlist hoặc segment.');
      });
      activeHls.on(Hls.Events.LEVEL_SWITCHED, function(event, data) {
        var lvl = activeHls.levels[data.level];
        if (lvl) {
          playerState.resolution = (lvl.width && lvl.height) ? (lvl.width + 'x' + lvl.height) : '';
          playerState.bandwidth = lvl.bitrate || 0;
        }
        updateInfoDisplay();
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

  function applyDefaultQualityPreference() {
    if (!activeHls || !activeHls.levels || !activeHls.levels.length) return;
    var pref = data.settings.dataSaver ? 'lowest' : data.settings.defaultQuality;
    if (pref === 'auto' || !pref) return;
    var levels = activeHls.levels;
    var bestIdx = 0;
    for (var i = 1; i < levels.length; i++) {
      if (pref === 'highest' && levels[i].bitrate > levels[bestIdx].bitrate) bestIdx = i;
      if (pref === 'lowest' && levels[i].bitrate < levels[bestIdx].bitrate) bestIdx = i;
    }
    activeHls.currentLevel = bestIdx;
  }

  attachPlayerGestures(videoWrapper, video);

  function onFullscreenChange() {
    var isFullscreen = !!(document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement);
    if (isFullscreen) lockOrientation(video);
    else unlockOrientation();
    __uvdApplyPlayerLayout();
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
}

// ========== CLOSE PLAYER ==========
function closePlayer() {
  if (playerState.overlay) {
    playerState.closing = true;
    if (data.settings.resumePlayback && playerState.url && playerState.video) {
      savePlaybackPosition(playerState.url, playerState.video);
    }
    clearTimeout(playerState.hideTimeout);
    if (playerState.audioCtx) {
      try { playerState.audioCtx.close(); } catch(e) {}
      playerState.audioCtx = null;
      playerState.gainNode = null;
      playerState.sourceNode = null;
    }
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
    if (playerState.__uvdLayoutFn) {
      window.removeEventListener('resize', playerState.__uvdLayoutFn);
      window.removeEventListener('orientationchange', playerState.__uvdLayoutFn);
      playerState.__uvdLayoutFn = null;
    }
    unlockOrientation();

    var overlay = playerState.overlay;
    overlay.classList.remove('uvd-open');
    var overlayRef = overlay;
    setTimeout(function() {
      if (overlayRef.parentNode) overlayRef.remove();
    }, 280);

    playerState.overlay = null;
    playerState.video = null;
    playerState.qualities = [];
    playerState.resolution = '';
    playerState.bandwidth = 0;

    data.settings.reduceMotion = playerState.wasReduceMotion;
    var __uvdMainPanel = document.getElementById('__uvd__');
    applyMotionPref(__uvdMainPanel);
    if (__uvdMainPanel) __uvdMainPanel.style.visibility = '';
    storage.set(data);
  }
}

// ========== CSS ==========
if (document.getElementById('__uvd_css__')) document.getElementById('__uvd_css__').remove();
var style = document.createElement('style');
style.id = '__uvd_css__';
style.textContent = `
:root{--uvd-blur:4px;--uvd-transition:0.18s ease}
@keyframes uvdSlideIn{from{transform:translate(-50%,-20px);opacity:0}to{transform:translate(-50%,0);opacity:1}}
@keyframes uvdPulse{0%,100%{opacity:1;box-shadow:0 0 5px var(--accent)}50%{opacity:0.4;box-shadow:0 0 20px var(--accent)}}
@keyframes uvdScaleIn{from{opacity:0;transform:scale(0.94)}to{opacity:1;transform:scale(1)}}
@keyframes uvdRipple{to{transform:scale(4);opacity:0}}
@keyframes uvdCardEnter{from{opacity:0;transform:translate3d(0,10px,0)}to{opacity:1;transform:translate3d(0,0,0)}}
@keyframes uvdLiquidDrift{0%{transform:translate(-6%,-4%) scale(1)}50%{transform:translate(4%,6%) scale(1.12)}100%{transform:translate(-6%,-4%) scale(1)}}
@keyframes uvdFadeIn{from{opacity:0}to{opacity:1}}
.uvd-scope,.uvd-scope *{box-sizing:border-box}
.uvd-glass-card,.uvd-glass-panel,.uvd-settings-sheet:not(.uvd-player-sheet),.uvd-card{position:relative;background:var(--glass);backdrop-filter:blur(var(--uvd-blur)) saturate(135%);-webkit-backdrop-filter:blur(var(--uvd-blur)) saturate(135%);border:1px solid var(--border);color:var(--text);box-shadow:0 12px 32px rgba(112,45,126,.12),0 0 0 1px rgba(255,255,255,.12) inset,0 1px 0 rgba(255,255,255,.62) inset;transition:backdrop-filter var(--uvd-transition),background var(--uvd-transition),border-color var(--uvd-transition),box-shadow var(--uvd-transition)}
.uvd-glass-panel{border-radius:var(--radius-lg);font-family:-apple-system,BlinkMacSystemFont,'SF Pro Display','Segoe UI',Roboto,sans-serif;font-size:var(--fs-base);padding:16px;width:100%;position:relative;overflow:hidden;max-width:1000px;margin:auto}
.uvd-settings-sheet:not(.uvd-player-sheet){border-radius:32px 32px 0 0;transition:transform .3s cubic-bezier(.22,1,.36,1)!important}
.uvd-glass-card::before,.uvd-glass-panel::before,.uvd-settings-sheet:not(.uvd-player-sheet)::before,.uvd-card::before{content:'';position:absolute;top:0;left:10%;right:10%;height:1px;z-index:2;background:linear-gradient(90deg,transparent,rgba(255,47,200,.55),rgba(155,61,255,.5),transparent);opacity:.8;pointer-events:none}
.uvd-glass-panel::before{content:'';position:absolute;top:0;left:8%;right:8%;height:1px;z-index:2;background:linear-gradient(90deg,transparent,rgba(255,47,200,0.6),rgba(155,61,255,0.6),transparent);opacity:0.7}
.uvd-settings-overlay{position:fixed;inset:0;z-index:2147483647;display:flex;align-items:flex-end;justify-content:center;background:rgba(0,0,0,0);transition:background .28s ease}
.uvd-icon-btn{background:var(--btn-bg);border:1px solid var(--border);color:var(--accent2);width:36px;height:36px;border-radius:var(--radius-sm);cursor:pointer;display:inline-flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0;position:relative;overflow:hidden;transition:all var(--uvd-transition)}
.uvd-icon-btn:active{transform:scale(.9)}
.uvd-player-card{width:100%;max-width:1000px;margin:auto;display:flex;flex-direction:column;border-radius:22px 22px 0 0;overflow:hidden;background:var(--glass);box-shadow:0 -10px 40px rgba(0,0,0,0.6);max-height:94dvh}
.uvd-player-menu{position:absolute;top:48px;right:12px;z-index:20;background:var(--glass);backdrop-filter:blur(var(--uvd-blur)) saturate(130%);-webkit-backdrop-filter:blur(var(--uvd-blur)) saturate(130%);border:1px solid var(--border);border-radius:var(--radius-md);overflow:hidden;min-width:170px;box-shadow:0 10px 30px rgba(0,0,0,0.6);animation:uvdFadeIn .15s ease}
.uvd-player-menu button{display:flex;align-items:center;gap:10px;width:100%;padding:12px 14px;background:transparent;border:none;color:var(--text);font-size:13px;font-weight:600;text-align:left;cursor:pointer}
.uvd-player-menu button:active{background:var(--btn-accent-bg)}
.uvd-player-menu button+button{border-top:1px solid var(--border)}
.uvd-icon-btn-wide{width:auto;padding:0 10px;font-size:13px;font-weight:600;gap:4px}
.uvd-liquid-bg{position:absolute;inset:-20%;z-index:0;pointer-events:none;background:radial-gradient(closest-side,rgba(255,47,200,0.14),transparent 70%) 20% 25%/60% 60% no-repeat;filter:blur(28px);animation:uvdLiquidDrift 16s ease-in-out infinite}
.uvd-reduce-motion .uvd-liquid-bg{display:none}
.uvd-settings-overlay.uvd-open{background:rgba(0,0,0,0.55)}
.uvd-settings-sheet{width:100%;max-width:1000px;max-height:92dvh;display:flex;flex-direction:column;transform:translate3d(0,100%,0);will-change:transform;backface-visibility:hidden;transition:transform .3s cubic-bezier(.22,1,.36,1);border-radius:32px 32px 0 0;overflow:hidden;background:var(--glass);backdrop-filter:blur(var(--uvd-blur)) saturate(130%);-webkit-backdrop-filter:blur(var(--uvd-blur)) saturate(130%);border:1px solid var(--border);box-shadow:0 -20px 50px rgba(0,0,0,0.8)}
.uvd-settings-overlay.uvd-open .uvd-settings-sheet{transform:translate3d(0,0,0)}
.uvd-player-sheet{transition:none!important;will-change:auto!important}
@keyframes uvdPlayerFromThumb{from{opacity:0;transform:translate3d(0,28px,0) scale(.965);filter:blur(2px)}to{opacity:1;transform:translate3d(0,0,0) scale(1);filter:blur(0)}}
.uvd-player-sheet.uvd-player-from-thumbnail{animation:uvdPlayerFromThumb .34s cubic-bezier(.22,1,.36,1) both}
.uvd-settings-header{display:flex;align-items:center;gap:10px;padding:14px 16px;border-bottom:1px solid var(--border);flex-shrink:0}
.uvd-settings-header .uvd-back-btn{background:var(--glass-hi);border:1px solid var(--border);color:var(--text);width:34px;height:34px;border-radius:var(--radius-sm);cursor:pointer;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0}
.uvd-settings-title-wrap{display:flex;flex-direction:column;gap:2px;min-width:0}.uvd-settings-title{font-weight:800;font-size:16px;color:var(--accent);text-shadow:0 0 12px rgba(255,47,200,0.5)}.uvd-settings-subtitle{font-size:10px;color:var(--text3);font-weight:600}.uvd-player-header-title{display:flex;align-items:center;gap:8px;min-width:0;flex:1;justify-content:flex-start;margin-left:10px;color:var(--text)}.uvd-player-header-title strong{display:block;font-size:14px;font-weight:800;white-space:nowrap}.uvd-settings-sheet.uvd-scroll-performance,.uvd-settings-sheet.uvd-scroll-performance .uvd-card{backdrop-filter:none!important;-webkit-backdrop-filter:none!important}.uvd-settings-sheet.uvd-scroll-performance .uvd-card{box-shadow:0 2px 10px rgba(112,45,126,.08),0 0 0 1px rgba(255,255,255,.12) inset}.uvd-settings-sheet.uvd-scroll-performance::before{display:none}.uvd-player-header-title small{display:block;margin-top:2px;color:var(--text3);font-size:9px;text-align:center}.uvd-player-live-dot{width:8px;height:8px;flex:0 0 8px;border-radius:50%;background:var(--accent);box-shadow:0 0 0 4px rgba(255,47,200,.12),0 0 12px rgba(255,47,200,.7);animation:uvdPulse 2s infinite}
.uvd-player-video-area{position:relative;overflow:hidden;background:radial-gradient(circle at 18% 18%,rgba(255,47,200,.16),transparent 34%),radial-gradient(circle at 84% 76%,rgba(155,61,255,.14),transparent 40%),linear-gradient(135deg,rgba(255,238,249,.92),rgba(245,232,255,.94));}
.uvd-player-video-area::before{content:'';position:absolute;inset:-25%;pointer-events:none;background:conic-gradient(from 120deg at 50% 50%,transparent,rgba(255,47,200,.08),transparent 28%,rgba(155,61,255,.08),transparent 55%);filter:blur(22px);animation:uvdLiquidDrift 18s ease-in-out infinite}
.uvd-player-video-area::after{content:'';position:absolute;inset:0;pointer-events:none;opacity:.3;background-image:linear-gradient(rgba(255,255,255,.16) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.16) 1px,transparent 1px);background-size:36px 36px;mask-image:linear-gradient(to bottom,transparent,black 25%,black 75%,transparent)}
.uvd-player-video-area>#__uvd_video_wrapper__{position:relative;z-index:1}
.uvd-player-info-panel{flex-shrink:0;padding:14px 18px 18px;border-top:1px solid var(--border);background:linear-gradient(180deg,rgba(255,47,200,0.05),rgba(155,61,255,0.03));}
.uvd-player-info-title{display:flex;align-items:center;gap:8px;font-weight:700;font-size:15px;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-bottom:6px}
.uvd-player-info-icon{flex-shrink:0;width:22px;height:22px;border-radius:50%;background:var(--grad-liquid);color:#fff;font-size:10px;display:inline-flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(255,47,200,0.4)}
.uvd-player-info-meta{font-size:11px;font-weight:600;color:var(--accent2);background:var(--btn-bg);border:1px solid var(--border);display:inline-block;padding:4px 12px;border-radius:999px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}
.uvd-settings-body{overflow-y:auto;padding:14px 16px;flex:1}
.uvd-tab-hidden .uvd-liquid-bg{animation-play-state:paused}
.uvd-panel-content{position:relative;z-index:1;display:flex;flex-direction:column;height:100%;min-height:0}
.uvd-app-shell{padding:18px 18px 14px!important;border-radius:30px!important}
.uvd-app-shell::after{content:'';position:absolute;inset:0;pointer-events:none;background:linear-gradient(180deg,rgba(255,255,255,.18),transparent 24%);z-index:0}
.uvd-app-shell>.uvd-panel-content{z-index:1}
.uvd-app-shell #__uvd_header__{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:0 0 16px;margin:0 0 14px;border-bottom:1px solid var(--border);flex-shrink:0}
.uvd-brand{display:flex;align-items:center;gap:10px;min-width:0}
.uvd-brand-mark{display:inline-flex;align-items:center;justify-content:center;width:38px;height:38px;border-radius:14px;background:var(--grad-liquid);color:#fff;font-size:15px;box-shadow:0 5px 14px rgba(255,47,200,.25)}
.uvd-brand-name{font-size:17px;font-weight:800;letter-spacing:-.02em;color:var(--text)}
.uvd-brand-name span{background:var(--grad-liquid);-webkit-background-clip:text;background-clip:text;color:transparent}
.uvd-brand-sub{margin-top:2px;color:var(--text3);font-size:10px;font-weight:600;letter-spacing:.04em;text-transform:uppercase}
.uvd-header-actions{display:flex;gap:5px;flex-wrap:wrap;justify-content:flex-end}
.uvd-header-actions .uvd-btn-icon{width:32px;height:32px;border-radius:11px;font-size:14px}
.uvd-header-actions .uvd-close-action{color:var(--danger)}
.uvd-context-bar{display:flex;align-items:flex-end;justify-content:space-between;gap:12px;padding:14px 15px;margin-bottom:14px;border:1px solid var(--border);border-radius:20px;background:linear-gradient(135deg,rgba(255,47,200,.09),rgba(155,61,255,.06));flex-shrink:0}
.uvd-context-main{min-width:0;display:flex;flex-direction:column;gap:5px}
.uvd-context-kicker{font-size:9px;font-weight:800;letter-spacing:.12em;color:var(--accent);opacity:.8}
.uvd-context-title{max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;border:0;padding:0;background:transparent;color:var(--text);font:700 15px inherit;text-align:left;cursor:pointer}
.uvd-context-meta{display:flex;justify-content:flex-end;flex-wrap:wrap;gap:5px}
.uvd-meta-chip{border:1px solid var(--border);border-radius:999px;padding:6px 9px;max-width:210px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;background:rgba(255,255,255,.28);color:var(--accent2);font-size:10px;cursor:pointer}
.uvd-meta-chip:hover{background:var(--btn-accent-bg)}
.uvd-reduce-motion *{animation:none!important;transition:none!important}
.uvd-reduce-motion .uvd-glass-panel{backdrop-filter:blur(0)!important;-webkit-backdrop-filter:blur(0)!important;background:rgba(255,248,252,.98)!important;border-color:rgba(255,47,200,.18)}
.uvd-reduce-motion .uvd-glass-panel .uvd-panel-content{color:var(--text)}
.uvd-reduce-motion .uvd-glass-panel .uvd-tab{color:var(--text2)}
.uvd-reduce-motion .uvd-glass-panel .uvd-tab.uvd-tab-active{color:#fff}
.uvd-reduce-motion .uvd-glass-panel .uvd-card{background:rgba(155,61,255,.06)}
.uvd-reduce-motion .uvd-glass-panel .uvd-btn{background:rgba(155,61,255,.09)}
.uvd-tabbar{display:flex;gap:2px;padding:6px 8px;background:rgba(155,61,255,.07);border:1px solid var(--border);border-radius:999px;margin-bottom:10px;flex-shrink:0;overflow-x:auto;overflow-y:hidden;-webkit-overflow-scrolling:touch;scrollbar-width:none;position:relative}
.uvd-tabbar::-webkit-scrollbar{display:none}
.uvd-tab-indicator{position:absolute;top:4px;bottom:4px;left:0;width:0;border-radius:999px;background:var(--grad-liquid);z-index:0;box-shadow:0 3px 12px rgba(255,47,200,.45);transition:transform .4s cubic-bezier(.4,0,.2,1),width .4s cubic-bezier(.4,0,.2,1)}
.uvd-tab{position:relative;z-index:1;flex:1 1 0%;min-width:max-content;background:transparent;border:none;color:var(--text2);font-weight:600;font-size:var(--fs-sm);padding:9px 16px;border-radius:999px;cursor:pointer;white-space:nowrap;text-align:center}
.uvd-tab.uvd-tab-active{color:#fff;text-shadow:0 1px 4px rgba(0,0,0,.3)}
.uvd-filter-bar{display:flex;gap:6px;overflow-x:auto;padding:0 0 10px;scrollbar-width:none;flex-shrink:0}
.uvd-filter-bar::-webkit-scrollbar{display:none}
.uvd-filter-btn{flex:0 0 auto;border:1px solid var(--border);border-radius:999px;padding:6px 12px;background:rgba(255,255,255,.24);color:var(--text2);font-size:11px;font-weight:700;cursor:pointer}
.uvd-filter-btn:hover{background:var(--btn-accent-bg);color:var(--accent2)}
.uvd-filter-btn.uvd-filter-active{background:var(--grad-liquid);border-color:transparent;color:#fff;box-shadow:0 4px 12px rgba(255,47,200,.2)}
.uvd-scope{color:var(--text);font-family:-apple-system,BlinkMacSystemFont,'SF Pro Display','Segoe UI',Roboto,sans-serif;--bg:rgba(255,246,251,0.97);--glass:rgba(255,250,253,0.82);--glass-hi:rgba(155,61,255,0.08);--border:rgba(255,47,200,0.22);--text:#2b1836;--text2:#7c6a8f;--text3:#a698ba;--accent:#ff2fc8;--accent2:#9b3dff;--danger:#ff5d72;--gold:#e0900a;--success:#1fa97a;--card-bg:rgba(255,255,255,0.55);--fs-xs:11px;--fs-sm:12px;--fs-base:13px;--fs-md:14px;--fs-lg:16px;--radius-sm:14px;--radius-md:20px;--radius-lg:32px;--grad-liquid:linear-gradient(135deg,var(--accent),var(--accent2));--glow-px:0px;--glow-op:0;--btn-bg:rgba(255,47,200,0.10);--btn-danger-bg:rgba(255,93,114,0.16);--btn-danger-border:rgba(255,93,114,0.35);--btn-success-bg:rgba(31,169,122,0.14);--btn-success-border:rgba(31,169,122,0.35);--btn-accent-bg:rgba(255,47,200,0.16);--btn-purple-bg:rgba(155,61,255,0.16);--btn-gold-bg:rgba(224,144,10,0.16)}
.uvd-fx-on .uvd-btn{transition:box-shadow .25s ease,transform .15s ease}
.uvd-fx-on .uvd-btn:active{transform:scale(.95)}
.uvd-fx-on.uvd-glass-panel,.uvd-fx-on #__uvd_player_header__{box-shadow:0 0 var(--glow-px) rgba(255,47,200,var(--glow-op)),0 8px 30px rgba(0,0,0,0.5)}
.uvd-fx-on .uvd-card,.uvd-fx-on .uvd-settings-sheet:not(.uvd-player-sheet){box-shadow:0 0 var(--glow-px) rgba(255,47,200,var(--glow-op)),0 12px 32px rgba(112,45,126,.12),0 0 0 1px rgba(255,255,255,.12) inset}
.uvd-fx-on #__uvd_player_close__{box-shadow:0 0 calc(var(--glow-px)*.6) rgba(255,93,114,var(--glow-op))}
.uvd-overlay{position:fixed;inset:0;background:rgba(2,3,6,.92);backdrop-filter:blur(10px) saturate(120%);z-index:2147483647;display:flex;align-items:center;justify-content:center;padding:16px;overflow-y:auto}
.uvd-toggle-switch{width:44px;height:26px;border-radius:14px;background:rgba(43,24,54,.14);border:none;position:relative;cursor:pointer;flex-shrink:0;transition:background .2s ease;padding:0}
.uvd-toggle-switch .uvd-toggle-knob{position:absolute;top:3px;left:3px;width:20px;height:20px;border-radius:50%;background:#fff;transition:transform .2s ease;box-shadow:0 1px 3px rgba(0,0,0,.4)}
.uvd-toggle-switch.uvd-toggle-on{background:var(--grad-liquid)}
.uvd-restore-btn{position:fixed;right:14px;bottom:14px;z-index:2147483647;display:flex;align-items:center;gap:6px;padding:10px 16px;border-radius:999px;border:1px solid var(--border);background:var(--glass);backdrop-filter:blur(var(--uvd-blur)) saturate(130%);-webkit-backdrop-filter:blur(var(--uvd-blur)) saturate(130%);box-shadow:0 8px 24px rgba(0,0,0,0.6);color:var(--text);font-size:13px;font-weight:700;cursor:pointer;animation:uvdScaleIn .25s ease both}
.uvd-restore-btn span.uvd-restore-dot{width:8px;height:8px;border-radius:50%;background:var(--grad-liquid);box-shadow:0 0 8px rgba(255,47,200,0.7);animation:uvdPulse 2s infinite}
.uvd-restore-btn:active{transform:scale(.95)}
.uvd-toggle-switch.uvd-toggle-on .uvd-toggle-knob{transform:translateX(18px)}
.uvd-scroll::-webkit-scrollbar{width:4px}
.uvd-scroll::-webkit-scrollbar-thumb{background:var(--accent);border-radius:4px}
.uvd-scroll::-webkit-scrollbar-track{background:transparent}
.uvd-btn{background:var(--glass-hi);border:1px solid var(--border);color:var(--text);padding:9px 16px;border-radius:var(--radius-md);font-weight:600;font-size:var(--fs-base);cursor:pointer;text-align:center;position:relative;overflow:hidden;display:inline-block;box-shadow:0 2px 8px rgba(43,24,54,0.14);line-height:1.3;transition:all var(--uvd-transition)}
.uvd-btn:active{transform:scale(.96)}
.uvd-btn-sm{padding:7px 12px;font-size:var(--fs-sm);border-radius:var(--radius-sm)}
.uvd-btn-icon{background:var(--glass-hi);border:1px solid var(--border);color:var(--text);width:34px;height:34px;border-radius:var(--radius-sm);cursor:pointer;display:inline-flex;align-items:center;justify-content:center;position:relative;overflow:hidden;box-shadow:0 3px 8px rgba(0,0,0,0.35),0 1px 0 rgba(255,255,255,0.08) inset;transition:all var(--uvd-transition)}
.uvd-btn-icon:active{transform:scale(.92)}
.uvd-card{position:relative;width:100%;max-width:100%;min-width:0;border-radius:var(--radius-md);padding:14px;margin:0 0 10px;font-size:var(--fs-base);animation:uvdCardEnter .28s cubic-bezier(.22,1,.36,1) both;will-change:transform}
.uvd-app-shell .uvd-scroll{min-width:0;max-width:100%;overflow-x:hidden}
.uvd-app-shell #__uvd_stream_list__{padding-left:0!important;padding-right:0!important}

.uvd-card:hover{transform:translateY(-3px);border-color:rgba(255,47,200,.38);box-shadow:0 16px 34px rgba(112,45,126,.18),0 0 0 1px rgba(255,47,200,.16) inset,0 1px 0 rgba(255,255,255,.7) inset}
.uvd-card-preview{position:relative;width:100%;height:140px;margin:0 0 13px;overflow:hidden;border-radius:16px;background:linear-gradient(135deg,rgba(255,47,200,.18),rgba(155,61,255,.2));isolation:isolate;transition:height .24s ease,aspect-ratio .24s ease}.uvd-card-preview.uvd-thumb-portrait{height:220px}.uvd-card-preview.uvd-thumb-landscape{height:140px}
.uvd-thumb-image,.uvd-thumb-video{position:absolute;inset:0;width:100%;height:100%;display:block;object-fit:cover}
.uvd-thumb-image{background:linear-gradient(120deg,rgba(255,47,200,.22),rgba(155,61,255,.2));transition:filter .25s ease}
.uvd-thumb-video{opacity:0;transition:opacity .25s ease}
.uvd-thumb-ready .uvd-thumb-video{opacity:1}
.uvd-thumb-fallback{filter:saturate(1.15) brightness(1.03)}
.uvd-thumb-sheen{position:absolute;inset:0;z-index:1;background:linear-gradient(180deg,rgba(20,8,30,.04),rgba(20,8,30,.42));pointer-events:none}
.uvd-thumb-type{position:absolute;z-index:2;top:10px;left:11px;padding:5px 9px;border:1px solid rgba(255,255,255,.34);border-radius:999px;background:rgba(43,24,54,.3);backdrop-filter:blur(8px);color:#fff;font-size:10px;font-weight:800;letter-spacing:.06em}
.uvd-thumb-play{position:absolute;z-index:3;left:50%;top:50%;width:48px;height:48px;transform:translate(-50%,-50%);border:1px solid rgba(255,255,255,.55);border-radius:50%;background:rgba(255,255,255,.88);color:var(--accent);font-size:20px;cursor:pointer;box-shadow:0 8px 20px rgba(43,24,54,.22);transition:transform .18s ease,background .18s ease}
.uvd-thumb-play:hover{transform:translate(-50%,-50%) scale(1.08);background:#fff}
.uvd-thumb-strip{display:flex;align-items:center;gap:7px;padding:0 0 10px;overflow-x:auto;scrollbar-width:none}
.uvd-thumb-strip::-webkit-scrollbar{display:none}
.uvd-thumb-strip-label{flex:0 0 auto;color:var(--text3);font-size:9px;font-weight:800;letter-spacing:.08em;writing-mode:vertical-rl;transform:rotate(180deg)}
.uvd-extra-thumb{position:relative;flex:0 0 76px;height:48px;overflow:hidden;padding:0;border:1px solid var(--border);border-radius:10px;background:rgba(255,47,200,.08);cursor:pointer}
.uvd-extra-thumb img{display:block;width:100%;height:100%;object-fit:cover}
.uvd-extra-thumb::after{content:'';position:absolute;inset:0;background:linear-gradient(180deg,transparent,rgba(43,24,54,.5))}
.uvd-extra-thumb span{position:absolute;z-index:1;right:5px;bottom:3px;color:#fff;font-size:9px;font-weight:700}
@keyframes uvdThumbLaunch{0%{transform:scale(1);filter:brightness(1)}45%{transform:scale(1.012);filter:brightness(1.08)}100%{transform:scale(1);filter:brightness(1)}}
.uvd-card.uvd-thumb-launch{animation:uvdThumbLaunch .28s ease both;z-index:3}
.uvd-card.uvd-thumb-launch .uvd-card-preview{transform:scale(1.012);border-radius:var(--radius-md) var(--radius-md) 14px 14px;box-shadow:0 0 0 2px rgba(255,47,200,.22),0 8px 20px rgba(155,61,255,.16);transition:transform .26s cubic-bezier(.22,1,.36,1),box-shadow .26s ease}
.uvd-card.uvd-thumb-launch .uvd-thumb-play{transform:translate(-50%,-50%) scale(1.18);background:#fff}
.uvd-card-head{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:10px}
.uvd-block-btn{width:30px;height:30px;padding:0;border:1px solid rgba(255,93,114,.22);border-radius:10px;background:rgba(255,93,114,.08);color:var(--danger);opacity:.8;cursor:pointer}
.uvd-block-btn:hover{opacity:1;background:rgba(255,93,114,.16)}
.uvd-card-url-label{margin:0 0 5px 2px;color:var(--text3);font-size:9px;font-weight:800;letter-spacing:.1em}
.uvd-card-actions{margin-top:10px}
.uvd-card-actions .uvd-btn{min-height:36px}
.uvd-action-menu{position:relative}
.uvd-action-menu summary{list-style:none;display:flex;align-items:center;justify-content:space-between;min-height:38px;padding:9px 12px;border:1px solid var(--border);border-radius:var(--radius-sm);background:rgba(255,47,200,.09);color:var(--accent2);font-size:12px;font-weight:700;cursor:pointer;user-select:none}
.uvd-action-menu summary::-webkit-details-marker{display:none}
.uvd-action-menu[open] summary{border-radius:var(--radius-sm) var(--radius-sm) 0 0;background:rgba(255,47,200,.15)}
.uvd-action-menu summary span{font-size:16px;transition:transform .18s ease}
.uvd-action-menu[open] summary span{transform:rotate(180deg)}
.uvd-action-list{display:grid;grid-template-columns:1fr 1fr;gap:7px;padding:9px;border:1px solid var(--border);border-top:0;border-radius:0 0 var(--radius-sm) var(--radius-sm);background:rgba(255,250,253,.66);backdrop-filter:blur(12px)}
.uvd-action-list .uvd-btn{width:100%;min-width:0}
@media (max-width:560px){.uvd-app-shell{top:8px!important;left:8px!important;right:8px!important;height:calc(100dvh - 16px)!important;padding:14px 12px 10px!important;border-radius:26px!important}.uvd-app-shell #__uvd_header__{align-items:flex-start}.uvd-brand-sub{display:none}.uvd-header-actions{max-width:190px}.uvd-header-actions .uvd-btn-icon{width:29px;height:29px;font-size:13px}.uvd-context-bar{display:block;padding:12px;margin-bottom:10px}.uvd-context-meta{justify-content:flex-start;margin-top:9px}.uvd-meta-chip{max-width:48%}.uvd-tab{padding:8px 11px}.uvd-card{padding:12px}.uvd-grid-2{gap:6px}.uvd-card-actions .uvd-btn{padding:7px 8px;font-size:11px}.uvd-card-preview.uvd-thumb-portrait{height:190px}}
@media (prefers-reduced-motion:reduce){.uvd-card:hover{transform:none}}
.uvd-card-badges{display:flex;align-items:center;gap:6px;min-width:0}.uvd-type-badge{display:inline-block;padding:4px 12px;border-radius:var(--radius-sm);font-size:var(--fs-xs);font-weight:700;background:linear-gradient(135deg,rgba(255,47,200,0.22),rgba(155,61,255,0.18));color:var(--accent);border:1px solid rgba(255,47,200,0.28);letter-spacing:.03em}.uvd-card-status{display:inline-flex;align-items:center;padding:4px 8px;border-radius:999px;font-size:9px;font-weight:800;letter-spacing:.04em;white-space:nowrap}.uvd-status-loading{color:var(--gold);background:rgba(224,144,10,.12);border:1px solid rgba(224,144,10,.25)}.uvd-status-ok{color:var(--success);background:rgba(31,169,122,.12);border:1px solid rgba(31,169,122,.25)}.uvd-status-muted{color:var(--text3);background:rgba(43,24,54,.06);border:1px solid var(--border)}
.uvd-url-box{background:var(--btn-bg);border-radius:var(--radius-sm);padding:12px;font-family:'SFMono-Regular',Consolas,monospace;font-size:var(--fs-sm);font-weight:600;word-break:break-all;color:var(--accent2);max-height:100px;overflow-y:auto;line-height:1.5;border:1px solid var(--border)}
.uvd-grid-2{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.uvd-grid-3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px}
.uvd-ripple{position:absolute;border-radius:50%;background:rgba(255,255,255,0.5);transform:scale(0);animation:uvdRipple .6s ease-out}
.uvd-profile-card{display:flex;align-items:center;gap:14px;background:linear-gradient(135deg,rgba(255,47,200,0.14),rgba(155,61,255,0.08));border:1px solid rgba(255,47,200,0.25);border-radius:var(--radius-lg);padding:16px;margin-bottom:10px;animation:uvdCardEnter .4s ease both}
.uvd-profile-avatar{flex-shrink:0;width:56px;height:56px;border-radius:50%;background:var(--grad-liquid);color:#fff;font-weight:700;font-size:18px;display:flex;align-items:center;justify-content:center;box-shadow:0 6px 18px rgba(255,47,200,0.4),0 0 0 3px rgba(255,255,255,0.08)}
.uvd-profile-info{min-width:0}
.uvd-profile-name{font-weight:700;font-size:15px;color:var(--text)}
.uvd-profile-role{font-size:11.5px;color:var(--text2);margin-top:2px}
.uvd-profile-tags{display:flex;flex-wrap:wrap;gap:5px;margin-top:8px}
.uvd-tag{font-size:10px;font-weight:600;padding:3px 9px;border-radius:999px;background:rgba(155,61,255,.09);border:1px solid var(--border);color:var(--text2)}
.uvd-profile-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:14px}
.uvd-stat{background:var(--card-bg);border:1px solid var(--border);border-radius:var(--radius-md);padding:10px 6px;text-align:center}
.uvd-stat-num{font-size:18px;font-weight:700;color:var(--accent)}
.uvd-stat-label{font-size:10px;color:var(--text3);margin-top:2px}
.uvd-section-title{display:flex;align-items:center;gap:8px;font-weight:700;font-size:13px;color:var(--text);margin:16px 0 8px}
.uvd-section-num{width:20px;height:20px;border-radius:50%;background:var(--grad-liquid);color:#fff;font-size:11px;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;box-shadow:0 2px 8px rgba(255,47,200,0.4)}
.uvd-timeline-card{border-left:2px solid rgba(255,47,200,0.3)}
.uvd-inline-code{display:inline-block;background:rgba(0,0,0,0.35);padding:3px 9px;border-radius:6px;color:var(--accent2);font-family:'SFMono-Regular',Consolas,monospace;font-size:11px;border:1px solid rgba(255,255,255,0.06);margin:2px 0}
.uvd-profile-footer{text-align:center;font-size:11px;color:var(--text3);margin-top:14px;padding-top:12px;border-top:1px solid var(--border)}
.uvd-step{display:flex;gap:10px;align-items:flex-start;margin-bottom:12px}
.uvd-step:last-child{margin-bottom:0}
.uvd-step-num{flex-shrink:0;width:24px;height:24px;border-radius:50%;background:var(--grad-liquid);color:#fff;font-size:12px;font-weight:700;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(255,47,200,0.4)}
.uvd-step-text{font-size:13px;color:var(--text2);line-height:1.65;padding-top:2px}
.uvd-step-text strong{color:var(--text)}
.uvd-callout{display:flex;gap:10px;align-items:flex-start;background:rgba(255,47,200,0.1);border:1px solid rgba(255,47,200,0.25);border-left:3px solid var(--accent);border-radius:10px;padding:10px 12px;margin-top:10px;font-size:12px;color:var(--text2);line-height:1.6}
.uvd-callout-icon{flex-shrink:0;font-size:15px}
.uvd-callout.uvd-callout-warn{background:rgba(255,184,77,0.1);border-color:rgba(255,184,77,0.3);border-left-color:var(--gold)}
.uvd-code-block{position:relative;background:var(--btn-bg);border:1px solid var(--border);border-radius:10px;margin:8px 0}
.uvd-code-block textarea{width:100%;background:transparent;border:none;color:var(--accent2);font-weight:600;padding:10px 40px 10px 12px;font-size:10px;font-family:'SFMono-Regular',Consolas,monospace;resize:none}
.uvd-code-copy{position:absolute;top:6px;right:6px;width:26px;height:26px;border-radius:8px;background:rgba(155,61,255,.09);border:1px solid var(--border);color:var(--text2);font-size:12px;cursor:pointer;display:flex;align-items:center;justify-content:center}
.uvd-code-copy:active{background:rgba(155,61,255,.22)}
`;
document.head.appendChild(style);

// ========== ẨN / HIỆN SCRIPT (giữ popup blocker chạy nền) ==========
function __uvdRemoveRestoreBtn() {
  var b = document.getElementById('__uvd_restore_btn__');
  if (b) b.remove();
}
function __uvdShowRestoreBtn() {
  __uvdRemoveRestoreBtn();
  var btn = document.createElement('button');
  btn.id = '__uvd_restore_btn__';
  btn.className = 'uvd-restore-btn uvd-scope';
  btn.innerHTML = '<span class="uvd-restore-dot"></span>UMP DL';
  btn.title = 'Mở lại UMP DL (popup vẫn đang bị chặn)';
  btn.onclick = function() { __uvdSetHidden(false); };
  __uvdAppendRoot(btn);
}
function __uvdSetHidden(hidden) {
  __uvdScriptHidden = hidden;
  var panel = document.getElementById('__uvd__');
  if (panel) panel.style.display = hidden ? 'none' : '';
  if (hidden) __uvdShowRestoreBtn();
  else __uvdRemoveRestoreBtn();
}

// ========== FIX LAYER ==========
function __uvdSyncViewport() {}
function __uvdIsolateLayer(el) {
  if (!el) return;
  el.style.willChange = 'transform';
  el.style.transform = 'translateZ(0)';
  el.style.isolation = 'isolate';
  el.style.contain = 'layout paint style';
}

// ========== BUILD UI ==========
function buildUI() {
  var arr = [...urls.entries()].map(function(e) {
    return { url: e[0], type: e[1].type, source: e[1].source, priority: e[1].priority };
  }).sort(function(a, b) { return a.priority - b.priority; });

  var panel = document.getElementById('__uvd__');
  if (panel) panel.remove();
  
  panel = document.createElement('div');
  panel.id = '__uvd__';
  panel.className = 'uvd-glass-panel uvd-app-shell';
  panel.style.cssText = 'position:fixed;top:15px;left:15px;right:15px;height:calc(100dvh - 30px);z-index:2147483647;animation:uvdScaleIn 0.4s ease;overscroll-behavior:contain;' + (playerState.overlay ? 'visibility:hidden;' : '');
  
  var liquidBg = document.createElement('div');
  liquidBg.className = 'uvd-liquid-bg';
  panel.appendChild(liquidBg);
  
  var content = document.createElement('div');
  content.className = 'uvd-panel-content';
  panel.appendChild(content);
  
  var header = document.createElement('div');
  header.id = '__uvd_header__';
  header.style.cssText = 'flex-shrink:0;';
  header.innerHTML =
    '<div class="uvd-brand">' +
      '<span class="uvd-brand-mark">▶</span>' +
      '<div><div class="uvd-brand-name">UMP DL <span>V' + VERSION + '</span></div>' +
      '<div class="uvd-brand-sub">Universal media workspace</div></div>' +
    '</div>' +
    '<div class="uvd-header-actions">' +
      '<button class="uvd-btn-icon" id="__uvd_autoplay__" title="Tự động bấm Play">▶</button>' +
      '<button class="uvd-btn-icon" id="__uvd_seq_autoplay__" title="Thử lần lượt từng server">⏭</button>' +
      '<button class="uvd-btn-icon" id="__uvd_settings_btn__" title="Cài đặt">⚙</button>' +
      '<button class="uvd-btn-icon" id="__uvd_refresh__" title="Làm mới">↻</button>' +
      '<button class="uvd-btn-icon" id="__uvd_hide__" title="Ẩn script">▾</button>' +
      '<button class="uvd-btn-icon uvd-close-action" id="__uvd_close__" title="Đóng">×</button>' +
    '</div>';
  content.appendChild(header);
  
  var tabbar = document.createElement('div');
  tabbar.className = 'uvd-tabbar';
  var indicator = document.createElement('div');
  indicator.className = 'uvd-tab-indicator';
  indicator.id = '__uvd_tab_indicator__';
  tabbar.appendChild(indicator);
  
  var clickedCountForHost = Object.keys(data.clickedButtons[pageInfo.host] || {}).length;
  var tabList = [
    { id: 'streams', text: 'Streams (' + arr.length + ')' },
    { id: 'clicked', text: 'Nút đã click' + (clickedCountForHost ? ' (' + clickedCountForHost + ')' : '') },
    { id: 'player', text: 'Trình phát' }
  ];
  
  tabList.forEach(function(t) {
    var b = document.createElement('button');
    b.className = 'uvd-tab';
    b.dataset.tab = t.id;
    b.textContent = t.text;
    tabbar.appendChild(b);
  });
  content.appendChild(tabbar);

  var streamFilter = 'ALL';
  var filterBar = document.createElement('div');
  filterBar.className = 'uvd-filter-bar';
  ['ALL','MP4','M3U8','IFRAME','BLOB'].forEach(function(filter) {
    var filterBtn = document.createElement('button');
    filterBtn.className = 'uvd-filter-btn' + (filter === 'ALL' ? ' uvd-filter-active' : '');
    filterBtn.dataset.filter = filter;
    filterBtn.textContent = filter === 'ALL' ? 'Tất cả' : filter;
    filterBtn.onclick = function() {
      streamFilter = filter;
      filterBar.querySelectorAll('.uvd-filter-btn').forEach(function(b) { b.classList.toggle('uvd-filter-active', b.dataset.filter === filter); });
      renderTab('streams');
    };
    filterBar.appendChild(filterBtn);
  });
  content.appendChild(filterBar);
  
  function moveIndicatorTo(btn) {
    if (!btn) return;
    var width = btn.offsetWidth;
    indicator.style.width = width + 'px';
    indicator.style.transform = 'translateX(' + btn.offsetLeft + 'px)';
    if (btn.scrollIntoView) btn.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
  }
  
  var info = document.createElement('div');
  info.style.cssText = 'flex-shrink:0;';
  var savedPlaySel = (data.siteProfiles[pageInfo.host] && data.siteProfiles[pageInfo.host].playSelector) || '';
  info.className = 'uvd-context-bar';
  info.innerHTML =
    '<div class="uvd-context-main">' +
      '<span class="uvd-context-kicker">CURRENT SESSION</span>' +
      '<button id="__uvd_title__" class="uvd-context-title">' + escapeHtml(pageInfo.title) + '</button>' +
    '</div>' +
    '<div class="uvd-context-meta">' +
      '<button id="__uvd_referer__" class="uvd-meta-chip">↗ ' + escapeHtml(pageInfo.host || pageInfo.referer) + '</button>' +
      '<button id="__uvd_playsel__" class="uvd-meta-chip">◉ ' + escapeHtml(savedPlaySel || 'Play selector chưa đặt') + '</button>' +
    '</div>';
  content.appendChild(info);
  
  var contentWrapper = document.createElement('div');
  contentWrapper.className = 'uvd-scroll';
  contentWrapper.style.cssText = 'flex:1;overflow:hidden;position:relative;min-height:0;';
  
  var streamList = document.createElement('div');
  streamList.id = '__uvd_stream_list__';
  streamList.className = 'uvd-scroll';
  streamList.style.cssText = 'overflow-y:auto;overflow-x:hidden;height:100%;padding:0;min-width:0;';
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
  
  __uvdAppendRoot(panel);
  __uvdIsolateLayer(panel);
  applyEffectsPref(panel);
  applyMotionPref(panel);
  if (__uvdScriptHidden) { panel.style.display = 'none'; __uvdShowRestoreBtn(); }
  else { __uvdRemoveRestoreBtn(); }
  
  panel.querySelectorAll('.uvd-btn, .uvd-btn-icon, .uvd-tab').forEach(function(btn) {
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
    
    if (tabId === 'streams') renderStreams(streamList, streamFilter === 'ALL' ? arr : arr.filter(function(item) { return String(item.type || '').toUpperCase() === streamFilter; }));
    else if (tabId === 'clicked') renderClickedButtons(streamList);
    else if (tabId === 'player') renderPlayerSettings(streamList);
  }
  
  document.querySelectorAll('[data-tab]').forEach(function(t) {
    t.onclick = function() { renderTab(this.dataset.tab); };
  });
  
  renderTab('streams');
  
  window.addEventListener('resize', function() {
    moveIndicatorTo(document.querySelector('.uvd-tab.uvd-tab-active'));
  });
  
  document.getElementById('__uvd_close__').onclick = function() {
    if (playerState.overlay) closePlayer();
    stopMonitor();
    panel.remove();
    __uvdRemoveRestoreBtn();
    __uvdScriptHidden = false;
    runCleanup();
    urls.clear();
    if (typeof style !== 'undefined' && style.parentNode) style.remove();
  };
  document.getElementById('__uvd_refresh__').onclick = function() { debouncedBuildUI(); toast('Đã làm mới'); };
  document.getElementById('__uvd_hide__').onclick = function() {
    __uvdSetHidden(true);
    toast('Đã ẩn script — vẫn chặn popup nền, chạm nút UMP DL để mở lại');
  };
  document.getElementById('__uvd_autoplay__').onclick = function() {
    var n = autoClickPlayButtons(document, 0, false, true);
    toast(n > 0 ? 'Đã thử bấm Play (' + n + ' nút)' : 'Không tìm thấy nút Play, thử đặt selector riêng ở Cài đặt');
    setTimeout(function() { debouncedBuildUI(); }, 1200);
  };
  document.getElementById('__uvd_seq_autoplay__').onclick = function() { autoClickSequential(false); };
  document.getElementById('__uvd_settings_btn__').onclick = openSettingsOverlay;
  
  document.getElementById('__uvd_title__').onclick = function() {
    var newTitle = prompt('Tên file:', pageInfo.title);
    if (newTitle) { 
      newTitle = newTitle.replace(/[^\w\s\u00C0-\u1EF9.-]/g, '').substring(0,100);
      pageInfo.title = newTitle; 
      this.textContent = escapeHtml(pageInfo.title);
    }
  };
  
  document.getElementById('__uvd_referer__').onclick = function() {
    var newRef = prompt('Referer:', pageInfo.referer);
    if (newRef) {
      pageInfo.referer = newRef;
      this.textContent = escapeHtml(newRef);
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
      this.textContent = escapeHtml(newSel || '(chưa đặt · bấm để thêm)');
      if (newSel) {
        toast('Đã lưu selector cho ' + pageInfo.host);
        autoClickPlayButtons(document, 0, false);
        setTimeout(function() { debouncedBuildUI(); }, 1000);
      } else {
        toast('Đã xóa selector riêng');
      }
    }
  };
  
  window.__uvd_showPlayer = function(url, type) {
    showVideoPlayer(url, type);
  };
}

// ========== RENDER STREAMS ==========
var UVD_LAZY_BATCH = 40;

function buildStreamCardHTML(item, i) {
  var actionsHtml;
  if (item.type === 'BLOB') {
    actionsHtml =
      '<button class="uvd-btn uvd-btn-sm" data-action="play" data-url="' + encodeURIComponent(item.url) + '" data-type="' + escapeHtml(item.type) + '" style="background:rgba(255,47,200,0.25);">Xem</button>' +
      '<button class="uvd-btn uvd-btn-sm" data-action="blobdl" data-url="' + encodeURIComponent(item.url) + '" style="background:rgba(52,211,153,0.22);">⬇ Tải Blob</button>' +
      '<div style="grid-column:1/3;font-size:11px;color:var(--text3);line-height:1.4;">Blob chỉ tải được nếu là file gốc (không áp dụng cho stream HLS/DASH qua MediaSource).</div>';
  } else {
    actionsHtml =
      '<button class="uvd-btn uvd-btn-sm" data-action="share" data-url="' + encodeURIComponent(item.url) + '" style="background:rgba(155,61,255,0.22);">Chia sẻ</button>' +
      '<button class="uvd-btn uvd-btn-sm" data-action="copy" data-url="' + encodeURIComponent(item.url) + '">Sao chép</button>' +
      (item.type === 'IFRAME' ?
        '<button class="uvd-btn uvd-btn-sm" data-action="iframe" data-url="' + encodeURIComponent(item.url) + '" style="text-align:center;grid-column:1/3;">Mở iframe</button>' :
        (item.type === 'M3U8' ?
          '<button class="uvd-btn uvd-btn-sm" data-action="quality" data-url="' + encodeURIComponent(item.url) + '">Chất lượng</button>' +
          '<button class="uvd-btn uvd-btn-sm" data-action="play" data-url="' + encodeURIComponent(item.url) + '" data-type="' + escapeHtml(item.type) + '" style="background:rgba(255,47,200,0.25);">Xem</button>' +
          '<button class="uvd-btn uvd-btn-sm" data-action="cmd" data-url="' + encodeURIComponent(item.url) + '" data-type="' + escapeHtml(item.type) + '" style="grid-column:1/3;">Lệnh tải</button>' :
          '<button class="uvd-btn uvd-btn-sm" data-action="play" data-url="' + encodeURIComponent(item.url) + '" data-type="' + escapeHtml(item.type) + '" style="background:rgba(255,47,200,0.25);">Xem</button>' +
          '<button class="uvd-btn uvd-btn-sm" data-action="cmd" data-url="' + encodeURIComponent(item.url) + '" data-type="' + escapeHtml(item.type) + '">Lệnh tải</button>'
        )
      );
  }
  actionsHtml = '<details class="uvd-action-menu"><summary>Thao tác <span>⌄</span></summary><div class="uvd-action-list">' + actionsHtml + '</div></details>';
  return (
    '<div class="uvd-card" data-type="' + escapeHtml(item.type) + '" data-url="' + escapeHtml(item.url) + '">' +
      '<div class="uvd-card-preview" data-thumb-url="' + escapeHtml(item.url) + '">' +
        '<div class="uvd-thumb-image"></div>' +
        '<div class="uvd-thumb-sheen"></div>' +
        '<span class="uvd-thumb-type">' + escapeHtml(item.type) + '</span>' +
        '<button class="uvd-btn uvd-thumb-play" data-action="play" data-url="' + encodeURIComponent(item.url) + '" data-type="' + escapeHtml(item.type) + '" title="Xem video">▶</button>' +
      '</div>' +
      '<div class="uvd-card-head">' +
        '<div class="uvd-card-badges"><span class="uvd-type-badge">#' + (i+1) + ' ' + escapeHtml(item.type) + '</span><span class="uvd-card-status ' + ((item.type === 'MP4' || item.type === 'M3U8') ? 'uvd-status-loading' : 'uvd-status-muted') + '">' + ((item.type === 'MP4' || item.type === 'M3U8') ? 'PREVIEW…' : 'NO PREVIEW') + '</span></div>' +
        '<button class="uvd-block-btn" data-url="' + encodeURIComponent(item.url) + '" title="Chặn link này">⛔</button>' +
      '</div>' +
      '<div class="uvd-card-url-label">DIRECT MEDIA URL</div>' +
      '<div class="uvd-url-box">' + escapeHtml(item.url) + '</div>' +
      '<div class="uvd-card-actions">' + actionsHtml + '</div>' +
    '</div>'
  );
}

function loadExtraVideoThumbnails(preview) {
  if (!preview || preview.dataset.extraThumbs === 'loading' || preview.dataset.extraThumbs === 'ready') return;
  var media = preview.__thumbVideo;
  if (!media) return;
  if (!isFinite(media.duration) || media.duration <= 1) {
    if (!preview.dataset.extraThumbPending) {
      preview.dataset.extraThumbPending = '1';
      media.addEventListener('loadedmetadata', function() {
        preview.dataset.extraThumbPending = '';
        loadExtraVideoThumbnails(preview);
      }, { once: true });
    }
    try { media.load(); } catch(e) {}
    return;
  }
  var card = preview.closest('.uvd-card');
  if (!card) return;
  preview.dataset.extraThumbs = 'loading';
  var times = [12, 30, 60, 90, 120].map(function(t) {
    return Math.min(t, Math.max(0, media.duration - .5));
  }).filter(function(t, i, a) { return a.indexOf(t) === i; });
  var strip = document.createElement('div');
  strip.className = 'uvd-thumb-strip';
  strip.innerHTML = '<span class="uvd-thumb-strip-label">CẢNH KHÁC</span>';
  card.insertBefore(strip, card.querySelector('.uvd-card-head'));
  var canvas = document.createElement('canvas');
  canvas.width = 320;
  canvas.height = 180;
  var index = 0;
  function next() {
    if (index >= times.length) {
      preview.dataset.extraThumbs = 'ready';
      return;
    }
    var time = times[index++];
    var done = false;
    function capture() {
      if (done) return;
      done = true;
      try {
        var ctx = canvas.getContext('2d');
        ctx.drawImage(media, 0, 0, canvas.width, canvas.height);
        var item = document.createElement('button');
        item.className = 'uvd-extra-thumb';
        item.type = 'button';
        item.title = 'Xem từ giây ' + Math.round(time);
        item.innerHTML = '<img alt=""><span>' + Math.round(time) + 's</span>';
        item.querySelector('img').src = canvas.toDataURL('image/jpeg', .72);
        item.onclick = function() {
          try { media.currentTime = time; } catch(e) {}
          var play = card.querySelector('.uvd-thumb-play');
          if (play) play.click();
        };
        strip.appendChild(item);
      } catch(e) {
        // Canvas bị CORS thì vẫn giữ thumbnail chính, không làm hỏng card.
      }
      media.removeEventListener('seeked', capture);
      next();
    }
    media.addEventListener('seeked', capture, { once: true });
    try { media.currentTime = time; } catch(e) { capture(); }
    setTimeout(capture, 1800);
  }
  next();
}

function hydrateVideoThumbnails(root) {
  if (!root) return;
  root.querySelectorAll('.uvd-card-preview[data-thumb-url]').forEach(function(preview) {
    if (preview.dataset.thumbState) return;
    var card = preview.closest('.uvd-card');
    var type = card ? (card.dataset.type || '').toUpperCase() : '';
    if (type !== 'MP4' && type !== 'M3U8' && type !== 'VIDEO') {
      preview.dataset.thumbState = 'unsupported';
      return;
    }
    preview.dataset.thumbState = 'loading';
    var image = preview.querySelector('.uvd-thumb-image');
    var media = document.createElement('video');
    media.className = 'uvd-thumb-video';
    media.muted = true;
    media.defaultMuted = true;
    media.playsInline = true;
    media.preload = 'metadata';
    media.setAttribute('aria-hidden', 'true');
    var thumbUrl = preview.getAttribute('data-thumb-url');
    var thumbHls = null;
    preview.__thumbVideo = media;
    function showFrame() {
      preview.dataset.thumbState = 'ready';
      var status = card && card.querySelector('.uvd-card-status');
      if (status) { status.textContent = 'PREVIEW OK'; status.className = 'uvd-card-status uvd-status-ok'; }
      if (media.videoWidth && media.videoHeight) {
        preview.classList.toggle('uvd-thumb-portrait', media.videoHeight > media.videoWidth);
        preview.classList.toggle('uvd-thumb-landscape', media.videoWidth >= media.videoHeight);
      }
      if (image) image.classList.add('uvd-thumb-ready');
      try { media.pause(); } catch(e) {}
    }
    media.addEventListener('loadedmetadata', function() {
      try {
        if (isFinite(media.duration) && media.duration > 1) {
          // Bỏ qua logo/intro ở đầu video; ưu tiên thumbnail khoảng giây 12.
          var thumbTime = Math.min(Math.max(12, media.duration * .2), Math.max(0, media.duration - .5));
          media.currentTime = thumbTime;
        }
      } catch(e) {}
    });
    media.addEventListener('loadeddata', showFrame, { once: true });
    media.addEventListener('seeked', showFrame, { once: true });
    media.addEventListener('error', function() {
      preview.dataset.thumbState = 'unavailable';
      var errorStatus = card && card.querySelector('.uvd-card-status');
      if (errorStatus) { errorStatus.textContent = 'NO PREVIEW'; errorStatus.className = 'uvd-card-status uvd-status-muted'; }
      if (image) image.classList.add('uvd-thumb-fallback');
      try { media.remove(); } catch(e) {}
    }, { once: true });
    if (image) image.appendChild(media);
    var pressTimer = null;
    preview.addEventListener('touchstart', function() {
      pressTimer = setTimeout(function() { loadExtraVideoThumbnails(preview); }, 520);
    }, { passive: true });
    preview.addEventListener('touchend', function() { if (pressTimer) clearTimeout(pressTimer); }, { passive: true });
    preview.addEventListener('touchcancel', function() { if (pressTimer) clearTimeout(pressTimer); }, { passive: true });
    if (type === 'M3U8' && window.Hls && Hls.isSupported()) {
      try {
        thumbHls = new Hls({ maxBufferLength: 2, maxMaxBufferLength: 4 });
        thumbHls.loadSource(thumbUrl);
        thumbHls.attachMedia(media);
        thumbHls.on(Hls.Events.ERROR, function(_, data) {
          if (data && data.fatal) {
            preview.dataset.thumbState = 'unavailable';
            var hlsStatus = card && card.querySelector('.uvd-card-status');
            if (hlsStatus) { hlsStatus.textContent = 'NO PREVIEW'; hlsStatus.className = 'uvd-card-status uvd-status-muted'; }
            if (image) image.classList.add('uvd-thumb-fallback');
          }
        });
      } catch(e) { media.src = thumbUrl; }
    } else {
      media.src = thumbUrl;
    }
    setTimeout(function() {
      if (preview.dataset.thumbState === 'loading') {
        preview.dataset.thumbState = 'timeout';
        var timeoutStatus = card && card.querySelector('.uvd-card-status');
        if (timeoutStatus) { timeoutStatus.textContent = 'TIMEOUT'; timeoutStatus.className = 'uvd-card-status uvd-status-muted'; }
        if (image) image.classList.add('uvd-thumb-fallback');
      }
    }, 9000);
  });
}

function renderStreams(container, arr) {
  if (!arr.length) {
    container.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text2);">Không phát hiện stream nào.</div>';
    return;
  }

  var listWrap = document.createElement('div');
  container.appendChild(listWrap);
  var rendered = 0;
  var moreBtn = null;

  function renderNextBatch() {
    var end = Math.min(rendered + UVD_LAZY_BATCH, arr.length);
    var html = '';
    for (var i = rendered; i < end; i++) html += buildStreamCardHTML(arr[i], i);
    var frag = document.createElement('div');
    frag.innerHTML = html;
    while (frag.firstChild) listWrap.appendChild(frag.firstChild);
    hydrateVideoThumbnails(listWrap);
    rendered = end;

    if (moreBtn) { moreBtn.remove(); moreBtn = null; }
    if (rendered < arr.length) {
      moreBtn = document.createElement('button');
      moreBtn.className = 'uvd-btn uvd-btn-sm uvd-more-btn';
      moreBtn.style.cssText = 'width:100%;margin-top:8px;';
      moreBtn.textContent = 'Xem thêm (' + (arr.length - rendered) + ')';
      moreBtn.onclick = function() { renderNextBatch(); };
      container.appendChild(moreBtn);
    }
  }
  renderNextBatch();

  container.onclick = function(e) {
    if (!e.target.closest('.uvd-action-menu')) container.querySelectorAll('.uvd-action-menu[open]').forEach(function(menu) { menu.open = false; });
    var blockBtn = e.target.closest('.uvd-block-btn');
    if (blockBtn) {
      addRipple({ currentTarget: blockBtn, clientX: e.clientX, clientY: e.clientY });
      var urlToBlock = decodeURIComponent(blockBtn.dataset.url);
      var pattern = urlToBlock;
      try {
        var u = new URL(urlToBlock);
        pattern = u.hostname;
      } catch(ex) {}
      if (confirm('Chặn tất cả stream chứa "' + pattern + '" ?')) {
        addToFilterlist(pattern);
        toast('Đã chặn "' + pattern + '"');
      }
      return;
    }
    var actionBtn = e.target.closest('.uvd-btn[data-action]');
    if (actionBtn) {
      addRipple({ currentTarget: actionBtn, clientX: e.clientX, clientY: e.clientY });
      var u2 = decodeURIComponent(actionBtn.dataset.url);
      var action = actionBtn.dataset.action;
      var t = actionBtn.dataset.type;
      var actionMenu = actionBtn.closest('.uvd-action-menu');
      if (actionMenu) actionMenu.open = false;
      addToHistory(u2, t || 'IFRAME');
      if (action === 'share') shareUrl(u2);
      else if (action === 'copy') { copy(u2); toast('Đã sao chép!'); }
      else if (action === 'quality') showQualityPicker(u2);
      else if (action === 'play') {
        var launchCard = actionBtn.closest('.uvd-card');
        if (launchCard) launchCard.classList.add('uvd-thumb-launch');
        setTimeout(function() {
          if (launchCard) launchCard.classList.remove('uvd-thumb-launch');
          playerState.launchFromThumbnail = true;
          window.__uvd_showPlayer(u2, t || 'MP4');
        }, 260);
      }
      else if (action === 'cmd') showCommandPicker(u2, t);
      else if (action === 'iframe') window.__uvdSafeOpen(u2);
      else if (action === 'blobdl') downloadBlobUrl(u2);
      return;
    }
    if (e.target === moreBtn) return;
  };
}

// ========== DOWNLOAD BLOB ==========
function downloadBlobUrl(url) {
  toast('Đang lấy dữ liệu blob...');
  fetch(url)
    .then(function(res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.blob();
    })
    .then(function(blob) {
      if (!blob || blob.size === 0) {
        toast('Blob rỗng — có thể đây là stream MediaSource, không tải được trực tiếp.');
        return;
      }
      var mime = blob.type || '';
      var ext = '.bin';
      if (mime.indexOf('mp4') !== -1) ext = '.mp4';
      else if (mime.indexOf('webm') !== -1) ext = '.webm';
      else if (mime.indexOf('ogg') !== -1) ext = '.ogv';
      else if (mime.indexOf('quicktime') !== -1) ext = '.mov';
      else if (mime.indexOf('mpegurl') !== -1) ext = '.m3u8';
      else if (mime.indexOf('audio/') !== -1) ext = '.mp3';
      var base = (pageInfo.title || 'uvd_blob').replace(/[\\/:*?"<>|]+/g, '_').trim().slice(0, 80) || 'uvd_blob';
      var filename = base + ext;
      var objUrl = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = objUrl;
      a.download = filename;
      a.click();
      setTimeout(function() { URL.revokeObjectURL(objUrl); }, 15000);
      toast('Đã tải: ' + filename + ' (' + (blob.size / 1048576).toFixed(1) + 'MB)');
    })
    .catch(function(err) {
      toast('Không tải được blob: ' + (err && err.message ? err.message : 'lỗi không rõ') + '. Đây thường là stream MediaSource (HLS/DASH) — không thể tải trực tiếp kiểu này.');
    });
}

// ========== COMMAND PICKER ==========
function showCommandPicker(url, type) {
  var cmds = makeCommands(url, type, pageInfo.title);
  var opts = Object.keys(cmds).map(function(k) {
    var c = cmds[k];
    return { label: c.label, value: c.cmd };
  });
  var overlay = document.createElement('div');
  overlay.className = 'uvd-overlay';
  var panel = document.createElement('div');
  panel.className = 'uvd-glass-panel';
  panel.style.cssText = 'max-width:600px;margin:auto;';
  var titleDiv = document.createElement('div');
  titleDiv.style.cssText = 'font-weight:700;margin-bottom:12px;';
  titleDiv.textContent = 'Chọn lệnh tải';
  panel.appendChild(titleDiv);
  var content = document.createElement('div');
  content.style.cssText = 'overflow-y:auto;max-height:60vh;';
  opts.forEach(function(opt) {
    var card = document.createElement('div');
    card.className = 'uvd-card';
    card.innerHTML = '<div style="font-weight:600;color:var(--accent);">' + escapeHtml(opt.label) + '</div><div class="uvd-url-box">' + escapeHtml(opt.value) + '</div>';
    var btn = document.createElement('button');
    btn.className = 'uvd-btn uvd-btn-sm';
    btn.style.cssText = 'width:100%;';
    btn.textContent = 'Chỉnh sửa & Copy';
    btn.onclick = function() {
      overlay.remove();
      showEditor(opt.value);
    };
    card.appendChild(btn);
    content.appendChild(card);
  });
  panel.appendChild(content);
  var closeBtn = document.createElement('button');
  closeBtn.className = 'uvd-btn uvd-btn-sm';
  closeBtn.style.cssText = 'width:100%;margin-top:10px;background:var(--danger);';
  closeBtn.textContent = 'Đóng';
  closeBtn.onclick = function() { overlay.remove(); };
  panel.appendChild(closeBtn);
  overlay.appendChild(panel);
  __uvdAppendRoot(overlay);
}

function showEditor(text) {
  var overlay = document.createElement('div');
  overlay.className = 'uvd-overlay';
  var panel = document.createElement('div');
  panel.className = 'uvd-glass-panel';
  panel.style.cssText = 'max-width:600px;margin:auto;';
  panel.innerHTML = 
    '<div style="font-weight:700;margin-bottom:8px;">Chỉnh sửa lệnh</div>' +
    '<textarea style="width:100%;height:120px;background:var(--btn-bg);border:1px solid var(--border);border-radius:10px;color:var(--accent2);font-weight:600;padding:12px;font-family:monospace;">' + escapeHtml(text) + '</textarea>' +
    '<div class="uvd-grid-2" style="margin-top:12px;">' +
      '<button class="uvd-btn uvd-btn-sm" id="__uvd_ed_copy__">Sao chép</button>' +
      '<button class="uvd-btn uvd-btn-sm" id="__uvd_ed_share__" style="background:var(--btn-purple-bg);">Chia sẻ</button>' +
    '</div>' +
    '<button class="uvd-btn uvd-btn-sm close-editor" style="width:100%;margin-top:8px;background:var(--danger);">Đóng</button>';
  overlay.appendChild(panel);
  __uvdAppendRoot(overlay);
  
  overlay.querySelector('#__uvd_ed_copy__').onclick = function() {
    copy(overlay.querySelector('textarea').value);
    overlay.remove();
    toast('Đã sao chép!');
  };
  overlay.querySelector('#__uvd_ed_share__').onclick = function() {
    shareUrl(overlay.querySelector('textarea').value);
    overlay.remove();
  };
  overlay.querySelector('.close-editor').onclick = function() { overlay.remove(); };
}

function showQualityPicker(url) {
  var overlay = document.createElement('div');
  overlay.className = 'uvd-overlay';
  var panel = document.createElement('div');
  panel.className = 'uvd-glass-panel';
  panel.style.cssText = 'max-width:600px;margin:auto;text-align:center;';
  panel.textContent = 'Đang phân tích M3U8...';
  overlay.appendChild(panel);
  __uvdAppendRoot(overlay);
  
  parseM3U8Master(url, function(qualities) {
    if (!qualities) {
      panel.innerHTML = '<div style="color:var(--danger);">Không phải Master Playlist</div><button class="uvd-btn uvd-btn-sm close-overlay-btn" style="margin-top:12px;background:var(--danger);width:100%;">Đóng</button>';
      panel.querySelector('.close-overlay-btn').onclick = function() { overlay.remove(); };
      return;
    }
    panel.innerHTML = '';
    var title = document.createElement('div');
    title.style.cssText = 'font-weight:700;margin-bottom:12px;';
    title.textContent = 'Chọn chất lượng (' + qualities.length + ')';
    panel.appendChild(title);
    var content = document.createElement('div');
    content.style.cssText = 'overflow-y:auto;max-height:60vh;';
    qualities.forEach(function(q) {
      var card = document.createElement('div');
      card.className = 'uvd-card';
      card.innerHTML = '<b>' + escapeHtml(q.label) + '</b> <span style="color:var(--text3);">' + Math.round(q.bandwidth/1000) + 'kbps</span>';
      var grid = document.createElement('div');
      grid.className = 'uvd-grid-3';
      grid.style.marginTop = '8px';
      var shareBtn = document.createElement('button');
      shareBtn.className = 'uvd-btn uvd-btn-sm';
      shareBtn.textContent = 'Chia sẻ';
      shareBtn.onclick = function() { shareUrl(q.url); overlay.remove(); };
      grid.appendChild(shareBtn);
      var playBtn = document.createElement('button');
      playBtn.className = 'uvd-btn uvd-btn-sm';
      playBtn.style.background = 'rgba(255,47,200,0.25)';
      playBtn.textContent = 'Xem';
      playBtn.onclick = function() { overlay.remove(); window.__uvd_showPlayer(q.url, 'M3U8'); };
      grid.appendChild(playBtn);
      var cmdBtn = document.createElement('button');
      cmdBtn.className = 'uvd-btn uvd-btn-sm';
      cmdBtn.textContent = 'Lệnh';
      cmdBtn.onclick = function() { overlay.remove(); showCommandPicker(q.url, 'M3U8'); };
      grid.appendChild(cmdBtn);
      card.appendChild(grid);
      content.appendChild(card);
    });
    panel.appendChild(content);
    var closeBtn = document.createElement('button');
    closeBtn.className = 'uvd-btn uvd-btn-sm';
    closeBtn.style.cssText = 'width:100%;margin-top:10px;background:var(--danger);';
    closeBtn.textContent = 'Đóng';
    closeBtn.onclick = function() { overlay.remove(); };
    panel.appendChild(closeBtn);
  });
}

// ========== TOGGLE ROW ==========
function buildToggleRow(id, label, checked) {
  return '<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border);">' +
    '<span style="font-size:13px;color:var(--text2);">' + escapeHtml(label) + '</span>' +
    '<button id="' + id + '" class="uvd-toggle-switch' + (checked ? ' uvd-toggle-on' : '') + '"><span class="uvd-toggle-knob"></span></button>' +
  '</div>';
}

// ========== RENDER PLAYER SETTINGS ==========
function renderPlayerSettings(container) {
  var s = data.settings;
  container.innerHTML =
    '<div class="uvd-card">' +
      '<div style="font-weight:600;margin-bottom:10px;">🎬 Mặc định khi mở trình phát</div>' +
      '<div style="font-size:12px;color:var(--text2);margin-bottom:6px;">Tốc độ phát mặc định</div>' +
      '<select id="__uvd_set_speed__" style="width:100%;padding:10px;background:rgba(0,0,0,0.4);color:#fff;border:1px solid var(--border);border-radius:10px;margin-bottom:12px;">' +
        [0.5,0.75,1,1.25,1.5,2].map(function(v){ return '<option value="'+v+'"'+(s.defaultSpeed===v?' selected':'')+'>'+v+'x</option>'; }).join('') +
      '</select>' +
      '<div style="font-size:12px;color:var(--text2);margin-bottom:6px;">Chất lượng mặc định (HLS)</div>' +
      '<select id="__uvd_set_quality__" style="width:100%;padding:10px;background:rgba(0,0,0,0.4);color:#fff;border:1px solid var(--border);border-radius:10px;">' +
        '<option value="auto"' + (s.defaultQuality==='auto'?' selected':'') + '>Tự động (Auto)</option>' +
        '<option value="highest"' + (s.defaultQuality==='highest'?' selected':'') + '>Cao nhất</option>' +
        '<option value="lowest"' + (s.defaultQuality==='lowest'?' selected':'') + '>Thấp nhất (tiết kiệm data)</option>' +
      '</select>' +
    '</div>' +

    '<div class="uvd-card">' +
      '<div style="font-weight:600;margin-bottom:10px;">⚙️ Tuỳ chọn</div>' +
      buildToggleRow('__uvd_toggle_resume__', 'Nhớ vị trí xem dở (Resume)', s.resumePlayback) +
      buildToggleRow('__uvd_toggle_autofs__', 'Tự động toàn màn hình khi mở', s.autoFullscreen) +
      buildToggleRow('__uvd_toggle_autonext__', 'Tự động phát stream tiếp theo', s.autoNext) +
      buildToggleRow('__uvd_toggle_datasaver__', 'Chế độ tiết kiệm data (ép chất lượng thấp)', s.dataSaver) +
      buildToggleRow('__uvd_toggle_autohide__', 'Tự động ẩn thanh điều khiển', s.autoHideControls) +
      buildToggleRow('__uvd_toggle_showremaining__', 'Hiển thị thời gian còn lại', s.showRemainingTime) +
    '</div>' +

    '<div class="uvd-card">' +
      '<div style="font-weight:600;margin-bottom:10px;">🔄 Tua nhanh</div>' +
      '<div style="font-size:12px;color:var(--text2);margin-bottom:6px;">Số giây tua khi chạm đúp trái/phải</div>' +
      '<input type="number" id="__uvd_doubletap_seconds__" min="1" max="60" step="1" value="' + s.doubleTapSeconds + '" style="width:100%;padding:10px;background:rgba(0,0,0,0.4);color:#fff;border:1px solid var(--border);border-radius:10px;">' +
    '</div>' +

    '<div class="uvd-card">' +
      '<div style="font-weight:600;margin-bottom:10px;">⏱️ Tự động ẩn sau</div>' +
      '<div style="font-size:12px;color:var(--text2);margin-bottom:6px;">Số giây trước khi ẩn thanh điều khiển</div>' +
      '<input type="number" id="__uvd_hide_delay__" min="1" max="30" step="1" value="' + s.hideDelay + '" style="width:100%;padding:10px;background:rgba(0,0,0,0.4);color:#fff;border:1px solid var(--border);border-radius:10px;">' +
    '</div>' +

    '<div style="text-align:center;font-size:11px;color:var(--text3);margin-top:4px;">Vị trí xem dở đã lưu: ' + Object.keys(data.playbackPositions||{}).length + ' video</div>';

  container.querySelectorAll('.uvd-toggle-switch').forEach(function(btn) {
    btn.onclick = function() {
      var isOn = btn.classList.toggle('uvd-toggle-on');
      switch (btn.id) {
        case '__uvd_toggle_resume__': s.resumePlayback = isOn; break;
        case '__uvd_toggle_autofs__': s.autoFullscreen = isOn; break;
        case '__uvd_toggle_autonext__': s.autoNext = isOn; break;
        case '__uvd_toggle_datasaver__': s.dataSaver = isOn; break;
        case '__uvd_toggle_autohide__': s.autoHideControls = isOn; break;
        case '__uvd_toggle_showremaining__': s.showRemainingTime = isOn; break;
      }
      storage.set(data);
    };
  });

  document.getElementById('__uvd_set_speed__').onchange = function() {
    s.defaultSpeed = parseFloat(this.value);
    storage.set(data);
  };
  document.getElementById('__uvd_set_quality__').onchange = function() {
    s.defaultQuality = this.value;
    storage.set(data);
  };
  document.getElementById('__uvd_doubletap_seconds__').onchange = function() {
    var val = parseInt(this.value) || 10;
    if (val < 1) val = 1;
    if (val > 60) val = 60;
    s.doubleTapSeconds = val;
    storage.set(data);
    toast('Đã đặt tua ' + val + ' giây');
  };
  document.getElementById('__uvd_hide_delay__').onchange = function() {
    var val = parseInt(this.value) || 5;
    if (val < 1) val = 1;
    if (val > 30) val = 30;
    s.hideDelay = val;
    storage.set(data);
    toast('Đã đặt ẩn sau ' + val + ' giây');
  };
}

// ========== RENDER CLICKED BUTTONS ==========
function renderClickedButtons(container) {
  var host = pageInfo.host;
  var map = data.clickedButtons[host] || {};
  var entries = Object.keys(map).map(function(k) { return map[k]; })
    .sort(function(a, b) { return (b.lastClicked || 0) - (a.lastClicked || 0); });

  var html =
    '<div class="uvd-card">' +
      '<div style="font-weight:600;margin-bottom:6px;">🖱️ Danh sách nút đã click (tổng ' + entries.length + ')</div>' +
      '<div style="font-size:12px;color:var(--text2);margin-bottom:10px;">Bật/tắt để chặn hoặc cho phép click lại. Nút bị chặn sẽ tự bỏ qua ở lần Auto Play kế tiếp trên site <span style="color:var(--accent2);font-family:monospace;">' + escapeHtml(host) + '</span>.</div>';

  if (!entries.length) {
    html += '<div style="text-align:center;color:var(--text3);font-size:12px;padding:16px 0;">Chưa có nút nào được auto-click ghi lại trên site này. Bấm ▶ ở góc trên để thử.</div>';
  } else {
    entries.forEach(function(rec, i) {
      var id = '__uvd_clkbtn_' + i + '__';
      html +=
        '<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--border);">' +
          '<div style="min-width:0;flex:1;">' +
            '<div style="font-family:monospace;font-size:12.5px;color:var(--text);word-break:break-all;">' + escapeHtml(rec.selector) + (rec.fallback ? ' <span style="font-family:-apple-system,sans-serif;font-size:10px;color:#facc15;background:rgba(250,204,21,0.15);padding:1px 6px;border-radius:6px;">🔍 đoán</span>' : '') + '</div>' +
            '<div style="font-size:11px;color:var(--text3);margin-top:2px;">' + (rec.count || 1) + ' lần · ' + escapeHtml((rec.label || '').substring(0,40)) + '</div>' +
          '</div>' +
          '<button data-sel="' + escapeHtml(rec.selector) + '" id="' + id + '" class="uvd-toggle-switch' + (rec.blocked ? ' uvd-toggle-on' : '') + '"><span class="uvd-toggle-knob"></span></button>' +
        '</div>';
    });
    html += '<button id="__uvd_clkbtn_clear__" class="uvd-btn uvd-btn-sm" style="width:100%;margin-top:12px;background:var(--danger);">Xoá toàn bộ danh sách (site này)</button>';
  }
  html += '</div>';
  container.innerHTML = html;

  container.querySelectorAll('.uvd-toggle-switch[data-sel]').forEach(function(btn) {
    btn.onclick = function() {
      var sel = btn.getAttribute('data-sel');
      var isOn = btn.classList.toggle('uvd-toggle-on');
      if (data.clickedButtons[host] && data.clickedButtons[host][sel]) {
        data.clickedButtons[host][sel].blocked = isOn;
        storage.set(data);
        toast(isOn ? '🚫 Đã chặn nút này' : '✅ Đã cho phép click lại');
      }
    };
  });

  var clearBtn = document.getElementById('__uvd_clkbtn_clear__');
  if (clearBtn) {
    clearBtn.onclick = function() {
      delete data.clickedButtons[host];
      storage.set(data);
      renderClickedButtons(container);
      toast('Đã xoá danh sách nút đã click cho site này');
    };
  }
}

// ========== RENDER SETTINGS ==========
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
          '<span class="uvd-tag">UMP DL v' + VERSION + ' PRO</span>' +
          '<span class="uvd-tag">Vanilla JS</span>' +
          '<span class="uvd-tag">HLS · M3U8</span>' +
          '<span class="uvd-tag">Adblock</span>' +
          '<span class="uvd-tag">Resume · Tua đúp · PiP</span>' +
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
      '<div style="font-weight:600;margin-bottom:8px;">⚡ Hiệu năng</div>' +
      buildToggleRow('__uvd_toggle_reducemotion__', 'Bật chế độ hiệu suất (giảm hiệu ứng)', data.settings.reduceMotion) +
      '<div style="font-size:12px;color:var(--text2);margin:10px 0 4px;">Cường độ làm mờ (blur): <span id="__uvd_blur_val__">' + data.settings.blurIntensity + 'px</span></div>' +
      '<input type="range" id="__uvd_blur_range__" min="0" max="20" step="1" value="' + data.settings.blurIntensity + '" style="width:100%;">' +
      '<div style="font-size:12px;color:var(--text2);margin:10px 0 4px;">Tốc độ chuyển tiếp: <span id="__uvd_transition_val__">' + data.settings.transitionSpeed + 's</span></div>' +
      '<input type="range" id="__uvd_transition_range__" min="0" max="0.8" step="0.05" value="' + data.settings.transitionSpeed + '" style="width:100%;">' +
      '<div style="font-size:11px;color:var(--text3);margin-top:6px;">Giảm blur và tốc độ transition để máy chạy mượt hơn.</div>' +
    '</div>' +

    '<div class="uvd-card">' +
      '<div style="font-weight:600;margin-bottom:8px;">✨ Hiệu ứng giao diện</div>' +
      buildToggleRow('__uvd_toggle_glow__', 'Hiệu ứng phát sáng (glow) cho nút & panel', data.settings.glowEffects) +
      '<div style="font-size:12px;color:var(--text2);margin:10px 0 4px;">Cường độ hiệu ứng: <span id="__uvd_fx_val__">' + data.settings.effectsIntensity + '%</span></div>' +
      '<input type="range" id="__uvd_fx_range__" min="0" max="100" step="5" value="' + data.settings.effectsIntensity + '" style="width:100%;">' +
      '<div style="font-size:11px;color:var(--text3);margin-top:6px;">Tắt hoàn toàn nếu đã bật chế độ hiệu suất ở trên.</div>' +
    '</div>' +

    '<div class="uvd-card">' +
      '<div style="font-weight:600;margin-bottom:8px;">🌐 Header proxy</div>' +
      '<div style="font-size:12px;color:var(--text2);margin-bottom:8px;">Tự thử Render proxy khi MP4/HLS lỗi do thiếu Referer hoặc User-Agent.</div>' +
      '<input id="__uvd_proxy_key__" type="password" autocomplete="off" placeholder="PROXY_KEY (nếu Render yêu cầu)" value="' + escapeHtml(data.settings.headerProxyKey || '') + '" style="width:100%;padding:10px 12px;background:var(--btn-bg);border:1px solid var(--border);border-radius:var(--radius-sm);color:var(--accent2);font-size:12px;">' +
      '<div style="font-size:10px;color:var(--text3);margin-top:6px;">Proxy: ' + escapeHtml(HEADER_PROXY_BASE) + '</div>' +
    '</div>' +

    '<div class="uvd-card">' +
      '<div style="font-weight:600;margin-bottom:8px;">⛔ Chặn tự phát</div>' +
      buildToggleRow('__uvd_toggle_blockautoplay__', 'Chặn mạnh web tự mở/phát video sau khi chạy script', data.settings.blockAutoplay) +
      '<div style="font-size:11px;color:var(--text3);margin-top:6px;">Video/audio do chính trang web tự bật (quảng cáo, autoplay ẩn...) sẽ luôn bị tạm dừng ngay. Video mở qua UMP DL Player không bị ảnh hưởng.</div>' +
    '</div>' +

    '<div class="uvd-card">' +
      '<div style="font-weight:600;margin-bottom:8px;">🛡️ Lọc quảng cáo (Filterlist)</div>' +
      '<div style="font-size:12px;color:var(--text2);margin-bottom:8px;">' +
        'Nhập mỗi dòng một từ khóa hoặc domain (vd: <code>doubleclick.net</code>). Hỗ trợ regex nếu bắt đầu bằng <code>regex:</code>. Các URL chứa pattern sẽ bị bỏ qua.' +
      '</div>' +
      '<textarea id="__uvd_filter_text__" style="width:100%;height:80px;background:var(--btn-bg);border:1px solid var(--border);border-radius:10px;color:var(--accent2);font-weight:600;padding:12px;font-size:12px;">' + escapeHtml((data.filterlist||[]).join('\n')) + '</textarea>' +
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
      '<div class="uvd-step"><span class="uvd-step-num">1</span><span class="uvd-step-text">Mở một trang web bất kỳ, bấm vào biểu tượng <strong>⭐ Bookmark</strong> trên thanh địa chỉ.</span></div>' +
      '<div class="uvd-step"><span class="uvd-step-num">2</span><span class="uvd-step-text">Chọn <strong>"Chỉnh sửa"</strong> (Edit).</span></div>' +
      '<div class="uvd-step"><span class="uvd-step-num">3</span><span class="uvd-step-text"><strong>Đặt tên</strong> dễ nhớ, ví dụ: <code class="uvd-inline-code">UMP DL</code></span></div>' +
      '<div class="uvd-step"><span class="uvd-step-num">4</span><span class="uvd-step-text"><strong>Xóa toàn bộ địa chỉ</strong> trong ô URL, dán đoạn code sau vào:</span></div>' +
      '<div class="uvd-code-block"><textarea readonly rows="3">' + escapeHtml(bookmarkletCode) + '</textarea><button class="uvd-code-copy" data-copy-target="bookmarklet" title="Sao chép">📋</button></div>' +
      '<div class="uvd-step"><span class="uvd-step-num">5</span><span class="uvd-step-text">Bấm <strong>Lưu</strong> (Save).</span></div>' +
      '<div class="uvd-callout"><span class="uvd-callout-icon">💡</span><span>Từ lần sau, bạn chỉ cần gõ tên bookmark (<strong style="color:var(--accent);">UMP DL</strong>) vào thanh địa chỉ rồi chọn nó để kích hoạt. Script luôn tự động cập nhật phiên bản mới nhất.</span></div>' +
    '</div>' +

    '<div class="uvd-section-title"><span class="uvd-section-num">2</span> Sử dụng</div>' +
    '<div class="uvd-card uvd-timeline-card">' +
      '<div class="uvd-step"><span class="uvd-step-num">•</span><span class="uvd-step-text">Mở trang web có video</span></div>' +
      '<div class="uvd-step"><span class="uvd-step-num">•</span><span class="uvd-step-text">Gõ tên bookmark (vd: <code class="uvd-inline-code">UMP DL</code>) vào thanh địa chỉ và chọn nó</span></div>' +
      '<div class="uvd-step"><span class="uvd-step-num">•</span><span class="uvd-step-text">Chọn stream và bấm <strong style="color:var(--accent);">Xem</strong> để mở player overlay</span></div>' +
      '<div class="uvd-step"><span class="uvd-step-num">•</span><span class="uvd-step-text">Trong player: thanh công cụ gồm <strong style="color:var(--accent);">Chất lượng</strong>, <strong style="color:var(--accent);">Tốc độ (+/-)</strong>, <strong style="color:var(--accent);">Toàn màn hình</strong>, <strong style="color:var(--accent);">PiP</strong>, <strong style="color:var(--accent);">Hẹn giờ</strong>, <strong style="color:var(--accent);">Boost</strong>, <strong style="color:var(--accent);">Mute</strong>, <strong style="color:var(--accent);">📷 Screenshot</strong>, <strong style="color:var(--accent);">📌 Ghim</strong></span></div>' +
      '<div class="uvd-step"><span class="uvd-step-num">•</span><span class="uvd-step-text">Chạm đúp 2 lần vào nửa trái/phải video để tua lùi/tiến (số giây tùy chỉnh trong tab Trình phát)</span></div>' +
      '<div class="uvd-step"><span class="uvd-step-num">•</span><span class="uvd-step-text">Click vào thời gian để chuyển đổi giữa <strong>còn lại</strong> / <strong>đã qua</strong> / <strong>tổng</strong>.</span></div>' +
      '<div class="uvd-callout"><span class="uvd-callout-icon">▶</span><span>Nút <strong style="color:var(--accent);">▶</strong> trên header: tự động bấm giúp các nút Play ẩn để link stream lộ ra. Nếu không ăn, đặt CSS selector riêng ở dòng "Play selector".</span></div>' +
    '</div>' +

    '<div class="uvd-section-title"><span class="uvd-section-num">3</span> Tải video với yt-dlp và Termux</div>' +
    '<div class="uvd-card uvd-timeline-card">' +
      '<div class="uvd-step"><span class="uvd-step-num">1</span><span class="uvd-step-text"><strong>Cài đặt yt-dlp trên Termux:</strong></span></div>' +
      '<code class="uvd-inline-code" style="display:block;margin:4px 0;">pkg update && pkg upgrade -y</code>' +
      '<code class="uvd-inline-code" style="display:block;margin:4px 0;">pkg install python ffmpeg -y</code>' +
      '<code class="uvd-inline-code" style="display:block;margin:4px 0 10px;">pip install yt-dlp</code>' +
      '<div class="uvd-step"><span class="uvd-step-num">2</span><span class="uvd-step-text">Mở tab <strong style="color:var(--accent);">Streams</strong>, chọn stream cần tải</span></div>' +
      '<div class="uvd-step"><span class="uvd-step-num">3</span><span class="uvd-step-text">Bấm <strong style="color:var(--accent);">Lệnh tải</strong> → chọn lệnh phù hợp, sao chép</span></div>' +
      '<div class="uvd-step"><span class="uvd-step-num">4</span><span class="uvd-step-text">Mở Termux, dán lệnh vào và bấm Enter để tải</span></div>' +
      '<div class="uvd-callout uvd-callout-warn"><span class="uvd-callout-icon">⚠️</span><span><strong style="color:var(--text);">Lưu ý:</strong> Nhớ cấp quyền lưu file cho Termux (Android 11+): <code class="uvd-inline-code">termux-setup-storage</code></span></div>' +
    '</div>' +

    '<div class="uvd-profile-footer">© ' + new Date().getFullYear() + ' nguyenquocngu91 · UMP DL v' + VERSION + ' · Made for Chrome Android</div>';

  container.querySelectorAll('.uvd-btn').forEach(function(b) { b.addEventListener('click', addRipple); });

  container.querySelectorAll('.uvd-code-copy').forEach(function(b) {
    b.onclick = function() {
      if (this.dataset.copyTarget === 'bookmarklet') { copy(bookmarkletCode); toast('Đã sao chép code bookmarklet!'); }
    };
  });

  document.getElementById('__uvd_toggle_reducemotion__').onclick = function() {
    var isOn = this.classList.toggle('uvd-toggle-on');
    data.settings.reduceMotion = isOn;
    storage.set(data);
    applyMotionPref(document.getElementById('__uvd__'));
    toast(isOn ? 'Đã bật chế độ hiệu suất' : 'Đã tắt chế độ hiệu suất');
  };

  document.getElementById('__uvd_blur_range__').oninput = function() {
    var val = parseInt(this.value);
    data.settings.blurIntensity = val;
    document.getElementById('__uvd_blur_val__').textContent = val + 'px';
    storage.set(data);
    applyMotionPref(document.getElementById('__uvd__'));
    if (playerState.overlay) applyMotionPref(playerState.overlay);
    var settingsOverlay = document.getElementById('__uvd_settings_overlay__');
    if (settingsOverlay) applyMotionPref(settingsOverlay);
  };

  document.getElementById('__uvd_transition_range__').oninput = function() {
    var val = parseFloat(this.value);
    data.settings.transitionSpeed = val;
    document.getElementById('__uvd_transition_val__').textContent = val + 's';
    storage.set(data);
    applyMotionPref(document.getElementById('__uvd__'));
    if (playerState.overlay) applyMotionPref(playerState.overlay);
    var settingsOverlay = document.getElementById('__uvd_settings_overlay__');
    if (settingsOverlay) applyMotionPref(settingsOverlay);
  };

  document.getElementById('__uvd_toggle_glow__').onclick = function() {
    var isOn = this.classList.toggle('uvd-toggle-on');
    data.settings.glowEffects = isOn;
    storage.set(data);
    applyEffectsPref(document.getElementById('__uvd__'));
    if (playerState.overlay) applyEffectsPref(playerState.overlay);
    toast(isOn ? 'Đã bật hiệu ứng phát sáng' : 'Đã tắt hiệu ứng phát sáng');
  };

  document.getElementById('__uvd_fx_range__').oninput = function() {
    var val = parseInt(this.value);
    data.settings.effectsIntensity = val;
    document.getElementById('__uvd_fx_val__').textContent = val + '%';
    storage.set(data);
    applyEffectsPref(document.getElementById('__uvd__'));
    if (playerState.overlay) applyEffectsPref(playerState.overlay);
  };

  var proxyKeyInput = document.getElementById('__uvd_proxy_key__');
  if (proxyKeyInput) proxyKeyInput.onchange = function() {
    data.settings.headerProxyKey = this.value.trim();
    storage.set(data);
    toast(data.settings.headerProxyKey ? 'Đã lưu proxy key' : 'Đã xóa proxy key');
  };

  document.getElementById('__uvd_toggle_blockautoplay__').onclick = function() {
    var isOn = this.classList.toggle('uvd-toggle-on');
    data.settings.blockAutoplay = isOn;
    storage.set(data);
    if (isOn) { try { document.querySelectorAll('video,audio').forEach(__uvdNeutralizeMedia); } catch(e) {} }
    toast(isOn ? 'Đã bật chặn tự phát (mạnh)' : 'Đã tắt chặn tự phát');
  };

  document.getElementById('__uvd_backup__').onclick = function() {
    var blob = new Blob([JSON.stringify(data)],{type:'application/json'});
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'uvd_backup.json'; a.click();
  };
  
  document.getElementById('__uvd_restore__').onclick = function() {
    var inp = document.createElement('input'); inp.type='file'; inp.accept='.json';
    inp.onchange = function(e) {
      var reader = new FileReader();
      reader.onload = function(ev) {
        try { data = Object.assign(data, JSON.parse(ev.target.result)); storage.set(data); toast('Đã nhập!'); debouncedBuildUI(); }
        catch(ex) { toast('File không hợp lệ','var(--danger)'); }
      };
      reader.readAsText(e.target.files[0]);
    };
    inp.click();
  };
  
  document.getElementById('__uvd_reset__').onclick = function() {
    if (confirm('Xóa toàn bộ dữ liệu?')) {
      localStorage.removeItem(STORAGE_KEY);
      data = { favorites: [], siteProfiles: {}, history: [], filterlist: [], playbackPositions: {}, clickedButtons: {}, settings: Object.assign({}, data.settings) };
      compileAdFilters();
      debouncedBuildUI();
    }
  };

  document.getElementById('__uvd_save_filter__').onclick = function() {
    var raw = document.getElementById('__uvd_filter_text__').value;
    data.filterlist = raw.split('\n').map(function(s) { return s.trim(); }).filter(Boolean);
    storage.set(data);
    compileAdFilters();
    toast('Đã lưu filterlist (' + data.filterlist.length + ' mục) · áp dụng ngay');
    debouncedBuildUI();
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

// ========== START ==========
buildUI();
console.log('V' + VERSION + ' UMP DL PRO - tối ưu hiệu năng');
toast('V' + VERSION + ' PRO sẵn sàng!');

})();
