/**
 * Universal Media Player & Downloader - V8.0 (Video.js)
 * - Thay player tự xây bằng Video.js 8 + plugins:
 *   + quality-menu, quality-levels
 *   + seek-buttons (tua 10s)
 *   + playback rate (tốc độ)
 *   + screenshot (tự viết)
 * - Hiệu ứng glassmorphism cho control bar
 * - Giữ nguyên các tính năng: auto-click, danh sách stream, filter, settings, nút đã click.
 * - Giao diện sạch, nhẹ, dễ mở rộng.
 *
 * Author: nguyenquocngu91
 * Version: 8.0.0
 */
(function() {
  'use strict';

  // ========== VERSION ==========
  var VERSION = '8.0.0';

  // ========== CLEANUP ==========
  var old = document.getElementById('__uvd__');
  if (old) old.remove();
  var oldMinBtn = document.getElementById('__uvd_min_float__');
  if (oldMinBtn) oldMinBtn.remove();

  // ========== STORAGE ==========
  var STORAGE_KEY = 'uvd_data_v80';
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
    // Giới hạn số URL
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

  function __uvdClickedRecord(sel) {
    var host = pageInfo.host;
    return (data.clickedButtons[host] && data.clickedButtons[host][sel]) || null;
  }

  function isButtonBlocked(el) {
    var rec = __uvdClickedRecord(__uvdElementSelector(el));
    return !!(rec && rec.blocked);
  }

  function recordClickedButton(el, sel) {
    var host = pageInfo.host;
    data.clickedButtons[host] = data.clickedButtons[host] || {};
    var label = (el.textContent || '').trim().replace(/\s+/g, ' ').substring(0, 60) || sel;
    var rec = data.clickedButtons[host][sel];
    if (rec) {
      rec.count = (rec.count || 0) + 1;
      rec.lastClicked = Date.now();
      if (label) rec.label = label;
    } else {
      data.clickedButtons[host][sel] = { selector: sel, label: label, count: 1, blocked: false, lastClicked: Date.now() };
    }
    storage.set(data);
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
          if (isButtonBlocked(el)) return;
          if (simulateClick(el)) {
            clicked++;
            recordClickedButton(el, __uvdElementSelector(el));
          }
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

  // ========== AUTO-CLICK LẦN LƯỢT ==========
  var __uvdSeqRunning = false;
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
          if (!isButtonBlocked(el)) list.push(el);
        });
      } catch(e) {}
    });
    return list;
  }

  function autoClickSequential() {
    if (__uvdSeqRunning) { toast('Đang thử lần lượt server, chờ chút...'); return; }
    var candidates = collectServerButtons(document);
    if (!candidates.length) {
      toast('Không tìm thấy nút server nào');
      return;
    }
    __uvdSeqRunning = true;
    var idx = 0;
    var totalBefore = urls.size;
    toast('🔎 Đang thử lần lượt ' + candidates.length + ' server...');

    function finish(success, sel) {
      __uvdSeqRunning = false;
      if (success) {
        toast('✅ Tìm ra link qua: ' + sel);
      } else {
        toast('❌ Đã thử hết ' + candidates.length + ' server, chưa thấy link mới.');
      }
      if (document.getElementById('__uvd__')) buildUI();
    }

    function tryNext() {
      if (idx >= candidates.length) { finish(false); return; }
      var el = candidates[idx++];
      var sel = __uvdElementSelector(el);
      var beforeThis = urls.size;
      if (!simulateClick(el)) { tryNext(); return; }
      recordClickedButton(el, sel);
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
  document.addEventListener('play', function(e) {
    if (!data.settings.blockAutoplay) return;
    var el = e.target;
    if (el && (el.tagName === 'VIDEO' || el.tagName === 'AUDIO') && !__uvdIsAllowedMedia(el)) {
      try { el.pause(); } catch(err) {}
    }
  }, true);
  addCleanup(function() { document.removeEventListener('play', __uvdBlockPlayEvent, true); });

  // Observer chặn tự phát (tối ưu)
  var __uvdPendingMediaNodes = [];
  var __uvdMediaFlushScheduled = false;
  function __uvdFlushMediaQueue() {
    __uvdMediaFlushScheduled = false;
    if (!data.settings.blockAutoplay) { __uvdPendingMediaNodes.length = 0; return; }
    var nodes = __uvdPendingMediaNodes;
    __uvdPendingMediaNodes = [];
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
        if (added[j] instanceof Element) __uvdPendingMediaNodes.push(added[j]);
      }
    }
    if (__uvdPendingMediaNodes.length && !__uvdMediaFlushScheduled) {
      __uvdMediaFlushScheduled = true;
      (window.requestAnimationFrame || setTimeout)(__uvdFlushMediaQueue, 16);
    }
  });
  __uvdAutoplayObserver.observe(document.documentElement, { childList: true, subtree: true });
  addCleanup(function() { __uvdAutoplayObserver.disconnect(); });

  try { document.querySelectorAll('video,audio').forEach(__uvdNeutralizeMedia); } catch(e) {}

  function __uvdVisibilityHandler() {
    document.documentElement.classList.toggle('uvd-tab-hidden', document.hidden);
  }
  document.addEventListener('visibilitychange', __uvdVisibilityHandler);
  addCleanup(function() {
    document.removeEventListener('visibilitychange', __uvdVisibilityHandler);
    document.documentElement.classList.remove('uvd-tab-hidden');
  });

  // ========== INIT SCAN ==========
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

  function runAutoClickAndRescan(silent) {
    var beforeCount = urls.size;
    var clicked = 0;
    installPopupBlock();
    clicked = autoClickPlayButtons(document, 0, !silent);
    var delays = [1200, 2200, 3400];
    var reportedAt = -1;
    delays.forEach(function(delay, idx) {
      setTimeout(function() {
        scan(document, 'autoclick-rescan');
        var afterCount = urls.size;
        var found = afterCount - beforeCount;
        if (found > 0 && reportedAt === -1) {
          reportedAt = idx;
          toast('▶ Tự động Play: tìm thêm ' + found + ' luồng mới');
          if (document.getElementById('__uvd__')) buildUI();
          setTimeout(function() {
            var n = pauseAllPlayingVideos();
            if (n > 0) toast('⏸ Đã tạm dừng video gốc');
          }, 800);
        } else if (found > 0 && document.getElementById('__uvd__')) {
          buildUI();
        } else if (idx === delays.length - 1 && !silent && reportedAt === -1) {
          toast(clicked > 0 ? 'Đã bấm Play nhưng chưa thấy link mới' : 'Không tìm thấy nút Play');
        }
      }, delay);
    });
  }

  window.__uvd_autoClickPlay = function() { runAutoClickAndRescan(false); };
  setTimeout(function() { runAutoClickAndRescan(true); }, 400);

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

  // ========== CSS (có thêm glassmorphism cho Video.js) ==========
  if (document.getElementById('__uvd_css__')) document.getElementById('__uvd_css__').remove();
  var style = document.createElement('style');
  style.id = '__uvd_css__';
  style.textContent = `
:root {
  --uvd-blur: 24px;
  --uvd-transition: 0.3s ease;
}
@keyframes uvdSlideIn{from{transform:translate(-50%,-20px);opacity:0}to{transform:translate(-50%,0);opacity:1}}
@keyframes uvdPulse{0%,100%{opacity:1;box-shadow:0 0 5px var(--accent)}50%{opacity:0.4;box-shadow:0 0 20px var(--accent)}}
@keyframes uvdScaleIn{from{opacity:0;transform:scale(0.94)}to{opacity:1;transform:scale(1)}}
@keyframes uvdRipple{to{transform:scale(4);opacity:0}}
@keyframes uvdCardEnter{from{opacity:0;transform:translateY(15px)}to{opacity:1;transform:translateY(0)}}
@keyframes uvdLiquidDrift{0%{transform:translate(-6%,-4%) scale(1)}50%{transform:translate(4%,6%) scale(1.12)}100%{transform:translate(-6%,-4%) scale(1)}}
@keyframes uvdFadeIn{from{opacity:0}to{opacity:1}}
*{box-sizing:border-box}
.uvd-glass-panel{background:var(--glass);backdrop-filter:blur(var(--uvd-blur)) saturate(130%);-webkit-backdrop-filter:blur(var(--uvd-blur)) saturate(130%);border:1px solid var(--border);border-radius:var(--radius-lg);box-shadow:0 20px 50px rgba(0,0,0,0.8),0 0 0 1px rgba(255,255,255,0.03) inset,0 1px 0 rgba(255,255,255,0.08) inset;color:var(--text);font-family:-apple-system,BlinkMacSystemFont,'SF Pro Display','Segoe UI',Roboto,sans-serif;font-size:var(--fs-base);padding:16px;width:100%;position:relative;overflow:hidden;max-width:1000px;margin:auto;transition: backdrop-filter var(--uvd-transition), background var(--uvd-transition);}
.uvd-glass-panel::before{content:'';position:absolute;top:0;left:8%;right:8%;height:1px;z-index:2;background:linear-gradient(90deg,transparent,rgba(109,140,255,0.6),rgba(185,139,255,0.6),transparent);opacity:0.7}
.uvd-liquid-bg{position:absolute;inset:-30%;z-index:0;pointer-events:none;background:radial-gradient(closest-side,rgba(109,140,255,0.12),transparent 70%) 15% 20%/55% 55% no-repeat,radial-gradient(closest-side,rgba(185,139,255,0.10),transparent 70%) 85% 75%/60% 60% no-repeat;filter:blur(50px);animation:uvdLiquidDrift 16s ease-in-out infinite}
@media (prefers-reduced-motion:reduce){.uvd-liquid-bg{animation:none}}
.uvd-tab-hidden .uvd-liquid-bg{animation-play-state:paused}
.uvd-panel-content{position:relative;z-index:1;display:flex;flex-direction:column;height:100%;min-height:0}
.uvd-tabbar{display:flex;gap:2px;padding:6px 8px;background:rgba(255,255,255,0.04);border:1px solid var(--border);border-radius:999px;margin-bottom:10px;flex-shrink:0;overflow-x:auto;overflow-y:hidden;-webkit-overflow-scrolling:touch;scrollbar-width:none;position:relative;}
.uvd-tabbar::-webkit-scrollbar{display:none}
.uvd-tab-indicator{position:absolute;top:4px;bottom:4px;left:0;width:0;border-radius:999px;background:var(--grad-liquid);z-index:0;box-shadow:0 3px 12px rgba(109,140,255,0.45);transition:transform 0.4s cubic-bezier(.4,0,.2,1),width 0.4s cubic-bezier(.4,0,.2,1)}
.uvd-tab{position:relative;z-index:1;flex:1;background:transparent;border:none;color:var(--text2);font-weight:600;font-size:var(--fs-sm);padding:9px 16px;border-radius:999px;cursor:pointer;white-space:nowrap;text-align:center;min-width:0;}
.uvd-tab.uvd-tab-active{color:#fff;text-shadow:0 1px 4px rgba(0,0,0,0.3)}

:root{--bg:rgba(3,4,8,0.97);--glass:rgba(12,14,20,0.85);--glass-hi:rgba(255,255,255,0.06);--border:rgba(255,255,255,0.08);--text:#f3f5ff;--text2:#9ca3bd;--text3:#5d6377;--accent:#6d8cff;--accent2:#b98bff;--danger:#ff5d72;--gold:#ffb84d;--success:#34d399;--card-bg:rgba(255,255,255,0.03);--fs-xs:11px;--fs-sm:12px;--fs-base:13px;--fs-md:14px;--fs-lg:16px;--radius-sm:12px;--radius-md:16px;--radius-lg:26px;--grad-liquid:linear-gradient(135deg,var(--accent),var(--accent2));--glow-px:0px;--glow-op:0;--btn-bg:rgba(255,255,255,0.1);--btn-danger-bg:rgba(255,93,114,0.22);--btn-danger-border:rgba(255,93,114,0.4);--btn-success-bg:rgba(52,211,153,0.2);--btn-success-border:rgba(52,211,153,0.4);--btn-accent-bg:rgba(109,140,255,0.28);--btn-purple-bg:rgba(167,139,250,0.24);--btn-gold-bg:rgba(255,184,77,0.26)}
.uvd-fx-on .uvd-btn{transition:box-shadow .25s ease,transform .15s ease}
.uvd-fx-on .uvd-btn:active{transform:scale(0.95)}
.uvd-fx-on.uvd-glass-panel,.uvd-fx-on #__uvd_player_header__{box-shadow:0 0 var(--glow-px) rgba(109,140,255,var(--glow-op)),0 8px 30px rgba(0,0,0,0.5)}
.uvd-fx-on #__uvd_player_close__{box-shadow:0 0 calc(var(--glow-px) * 0.6) rgba(255,93,114,var(--glow-op))}
.uvd-overlay{position:fixed;inset:0;background:rgba(2,3,6,0.92);backdrop-filter:blur(10px) saturate(120%);z-index:2147483648;display:flex;align-items:center;justify-content:center;padding:16px;overflow-y:auto}
.uvd-toggle-switch{width:44px;height:26px;border-radius:14px;background:rgba(255,255,255,0.15);border:none;position:relative;cursor:pointer;flex-shrink:0;transition:background .2s ease;padding:0;}
.uvd-toggle-switch .uvd-toggle-knob{position:absolute;top:3px;left:3px;width:20px;height:20px;border-radius:50%;background:#fff;transition:transform .2s ease;box-shadow:0 1px 3px rgba(0,0,0,0.4);}
.uvd-toggle-switch.uvd-toggle-on{background:var(--grad-liquid);}
.uvd-toggle-switch.uvd-toggle-on .uvd-toggle-knob{transform:translateX(18px);}
.uvd-scroll::-webkit-scrollbar{width:4px}
.uvd-scroll::-webkit-scrollbar-thumb{background:var(--accent);border-radius:4px}
.uvd-scroll::-webkit-scrollbar-track{background:transparent}
.uvd-btn{background:var(--glass-hi);border:1px solid var(--border);color:var(--text);padding:9px 16px;border-radius:var(--radius-md);font-weight:600;font-size:var(--fs-base);cursor:pointer;text-align:center;position:relative;overflow:hidden;display:inline-block;box-shadow:0 3px 10px rgba(0,0,0,0.4),0 1px 0 rgba(255,255,255,0.08) inset;line-height:1.3;transition:all var(--uvd-transition);}
.uvd-btn:active{transform:scale(0.96)}
.uvd-btn-sm{padding:7px 12px;font-size:var(--fs-sm);border-radius:var(--radius-sm)}
.uvd-btn-icon{background:var(--glass-hi);border:1px solid var(--border);color:var(--text);width:34px;height:34px;border-radius:var(--radius-sm);cursor:pointer;display:inline-flex;align-items:center;justify-content:center;position:relative;overflow:hidden;box-shadow:0 3px 8px rgba(0,0,0,0.35),0 1px 0 rgba(255,255,255,0.08) inset;transition:all var(--uvd-transition);}
.uvd-btn-icon:active{transform:scale(0.92)}
.uvd-card{background:var(--card-bg);border:1px solid var(--border);border-radius:var(--radius-md);padding:14px;margin-bottom:10px;font-size:var(--fs-base);box-shadow:0 1px 0 rgba(255,255,255,0.04) inset;animation:uvdCardEnter 0.4s ease both;color:var(--text);transition:all var(--uvd-transition);}
.uvd-card:hover{transform:translateY(-5px) scale(1.01);box-shadow:0 18px 40px rgba(0,0,0,0.8),0 0 0 1px rgba(109,140,255,0.4) inset;}
.uvd-type-badge{display:inline-block;padding:4px 12px;border-radius:var(--radius-sm);font-size:var(--fs-xs);font-weight:700;background:linear-gradient(135deg,rgba(109,140,255,0.22),rgba(185,139,255,0.18));color:var(--accent);border:1px solid rgba(109,140,255,0.28);letter-spacing:0.03em}
.uvd-url-box{background:rgba(0,0,0,0.5);border-radius:var(--radius-sm);padding:12px;font-family:'SFMono-Regular',Consolas,monospace;font-size:var(--fs-sm);word-break:break-all;color:var(--text2);max-height:100px;overflow-y:auto;line-height:1.5;border:1px solid rgba(255,255,255,0.04)}
.uvd-grid-2{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.uvd-grid-3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px}
.uvd-ripple{position:absolute;border-radius:50%;background:rgba(255,255,255,0.5);transform:scale(0);animation:uvdRipple 0.6s ease-out}
.uvd-profile-card{display:flex;align-items:center;gap:14px;background:linear-gradient(135deg,rgba(109,140,255,0.14),rgba(185,139,255,0.08));border:1px solid rgba(109,140,255,0.25);border-radius:var(--radius-lg);padding:16px;margin-bottom:10px;animation:uvdCardEnter 0.4s ease both}
.uvd-profile-avatar{flex-shrink:0;width:56px;height:56px;border-radius:50%;background:var(--grad-liquid);color:#fff;font-weight:700;font-size:18px;display:flex;align-items:center;justify-content:center;box-shadow:0 6px 18px rgba(109,140,255,0.4),0 0 0 3px rgba(255,255,255,0.08)}
.uvd-profile-info{min-width:0}
.uvd-profile-name{font-weight:700;font-size:15px;color:var(--text)}
.uvd-profile-role{font-size:11.5px;color:var(--text2);margin-top:2px}
.uvd-profile-tags{display:flex;flex-wrap:wrap;gap:5px;margin-top:8px}
.uvd-tag{font-size:10px;font-weight:600;padding:3px 9px;border-radius:999px;background:rgba(255,255,255,0.08);border:1px solid var(--border);color:var(--text2)}
.uvd-profile-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:14px}
.uvd-stat{background:var(--card-bg);border:1px solid var(--border);border-radius:var(--radius-md);padding:10px 6px;text-align:center}
.uvd-stat-num{font-size:18px;font-weight:700;color:var(--accent)}
.uvd-stat-label{font-size:10px;color:var(--text3);margin-top:2px}
.uvd-section-title{display:flex;align-items:center;gap:8px;font-weight:700;font-size:13px;color:var(--text);margin:16px 0 8px}
.uvd-section-num{width:20px;height:20px;border-radius:50%;background:var(--grad-liquid);color:#fff;font-size:11px;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;box-shadow:0 2px 8px rgba(109,140,255,0.4)}
.uvd-timeline-card{border-left:2px solid rgba(109,140,255,0.3)}
.uvd-inline-code{display:inline-block;background:rgba(0,0,0,0.35);padding:3px 9px;border-radius:6px;color:var(--accent2);font-family:'SFMono-Regular',Consolas,monospace;font-size:11px;border:1px solid rgba(255,255,255,0.06);margin:2px 0}
.uvd-profile-footer{text-align:center;font-size:11px;color:var(--text3);margin-top:14px;padding-top:12px;border-top:1px solid var(--border)}
.uvd-step{display:flex;gap:10px;align-items:flex-start;margin-bottom:12px}
.uvd-step:last-child{margin-bottom:0}
.uvd-step-num{flex-shrink:0;width:24px;height:24px;border-radius:50%;background:var(--grad-liquid);color:#fff;font-size:12px;font-weight:700;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(109,140,255,0.4)}
.uvd-step-text{font-size:13px;color:var(--text2);line-height:1.65;padding-top:2px}
.uvd-step-text strong{color:var(--text)}
.uvd-callout{display:flex;gap:10px;align-items:flex-start;background:rgba(109,140,255,0.1);border:1px solid rgba(109,140,255,0.25);border-left:3px solid var(--accent);border-radius:10px;padding:10px 12px;margin-top:10px;font-size:12px;color:var(--text2);line-height:1.6}
.uvd-callout-icon{flex-shrink:0;font-size:15px}
.uvd-callout.uvd-callout-warn{background:rgba(255,184,77,0.1);border-color:rgba(255,184,77,0.3);border-left-color:var(--gold)}
.uvd-code-block{position:relative;background:rgba(0,0,0,0.5);border:1px solid var(--border);border-radius:10px;margin:8px 0;}
.uvd-code-block textarea{width:100%;background:transparent;border:none;color:var(--accent2);padding:10px 40px 10px 12px;font-size:10px;font-family:'SFMono-Regular',Consolas,monospace;resize:none;}
.uvd-code-copy{position:absolute;top:6px;right:6px;width:26px;height:26px;border-radius:8px;background:rgba(255,255,255,0.08);border:1px solid var(--border);color:var(--text2);font-size:12px;cursor:pointer;display:flex;align-items:center;justify-content:center;}
.uvd-code-copy:active{background:rgba(255,255,255,0.18);}

/* ===== GLASS EFFECT CHO VIDEO.JS CONTROL BAR ===== */
#__uvd_player_overlay__ .video-js .vjs-control-bar {
  background: rgba(0, 0, 0, 0.35) !important;
  backdrop-filter: blur(12px) !important;
  -webkit-backdrop-filter: blur(12px) !important;
  border-radius: 16px !important;
  margin: 0 12px 12px 12px !important;
  width: calc(100% - 24px) !important;
  left: 12px !important;
  bottom: 12px !important;
  border: 1px solid rgba(255, 255, 255, 0.15);
  box-shadow: 0 8px 32px rgba(0,0,0,0.4);
}
/* Nút trong control bar */
#__uvd_player_overlay__ .video-js .vjs-button {
  color: #eee !important;
}
/* Thanh tiến trình */
#__uvd_player_overlay__ .video-js .vjs-progress-holder .vjs-play-progress {
  background: linear-gradient(135deg, #6d8cff, #b98bff) !important;
}
/* Big play button ở giữa (kính mờ) */
#__uvd_player_overlay__ .video-js .vjs-big-play-button {
  background: rgba(255,255,255,0.15) !important;
  backdrop-filter: blur(8px) !important;
  -webkit-backdrop-filter: blur(8px) !important;
  border: 1px solid rgba(255,255,255,0.3);
  border-radius: 50% !important;
  width: 72px !important;
  height: 72px !important;
  line-height: 72px !important;
  font-size: 2.5em !important;
}
`;
  document.head.appendChild(style);

  // ========== LOAD VIDEO.JS 8 & PLUGINS ==========
  function loadVideoJsAndPlugins(callback) {
    if (typeof videojs !== 'undefined' && videojs.registerPlugin && videojs.getPlugin('qualityMenu')) {
      callback(); return;
    }
    var scripts = [
      'https://vjs.zencdn.net/8.16.1/video.min.js',
      'https://cdn.jsdelivr.net/npm/videojs-contrib-quality-levels@3.0.0/dist/videojs-contrib-quality-levels.min.js',
      'https://cdn.jsdelivr.net/npm/videojs-contrib-quality-menu@3.0.0/dist/videojs-contrib-quality-menu.min.js',
      'https://cdn.jsdelivr.net/npm/videojs-seek-buttons@3.0.0/dist/videojs-seek-buttons.min.js'
    ];
    if (!document.querySelector('link[href*="video-js.css"]')) {
      var css = document.createElement('link');
      css.rel = 'stylesheet';
      css.href = 'https://vjs.zencdn.net/8.16.1/video-js.css';
      document.head.appendChild(css);
    }
    var loaded = 0;
    function onLoad() {
      loaded++;
      if (loaded >= scripts.length) {
        registerScreenshotPlugin();
        callback();
      }
    }
    scripts.forEach(function(src) {
      var s = document.createElement('script');
      s.src = src;
      s.onload = onLoad;
      s.onerror = function() { console.warn('Lỗi tải:', src); onLoad(); };
      document.head.appendChild(s);
    });
  }

  function registerScreenshotPlugin() {
    if (typeof videojs === 'undefined') return;
    videojs.registerPlugin('screenshot', function() {
      var player = this;
      var button = new videojs.Button(player, { controlText: 'Chụp ảnh màn hình' });
      button.addClass('vjs-screenshot-button');
      button.el().innerHTML = '📷';
      button.on('click', function() {
        var video = player.el().querySelector('video');
        if (!video || !video.videoWidth) {
          toast('Chưa có video để chụp');
          return;
        }
        var canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        canvas.getContext('2d').drawImage(video, 0, 0);
        var link = document.createElement('a');
        link.download = 'screenshot.png';
        link.href = canvas.toDataURL('image/png');
        link.click();
        toast('📸 Đã chụp ảnh màn hình');
      });
      player.controlBar.addChild(button, {}, player.controlBar.children_.length - 1);
    });
  }

  // ========== PLAYER STATE ==========
  var playerState = {
    overlay: null,
    player: null,
    video: null,
    url: '',
    type: ''
  };

  // ========== SHOW VIDEO PLAYER ==========
  function showVideoPlayer(url, type) {
    if (playerState.overlay) closePlayer();
    playerState.url = url;
    playerState.type = type;

    var overlay = document.createElement('div');
    overlay.id = '__uvd_player_overlay__';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.96);z-index:2147483648;display:flex;flex-direction:column;animation:uvdFadeIn 0.3s ease;';
    __uvdAppendRoot(overlay);
    __uvdIsolateLayer(overlay);
    playerState.overlay = overlay;

    var header = document.createElement('div');
    header.style.cssText = 'padding:8px 16px;background:rgba(14,16,22,0.92);display:flex;justify-content:space-between;align-items:center;flex-shrink:0;border-bottom:1px solid rgba(255,255,255,0.1);';
    header.innerHTML = 
      '<span style="font-weight:600;font-size:14px;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:70%;">▶ ' + escapeHtml(pageInfo.title) + '</span>' +
      '<button id="__uvd_player_close__" style="background:rgba(255,93,114,0.25);border:1px solid rgba(255,93,114,0.4);color:#fff;padding:6px 14px;border-radius:8px;cursor:pointer;font-weight:600;font-size:13px;">✕ Đóng</button>';
    overlay.appendChild(header);

    var wrapper = document.createElement('div');
    wrapper.id = '__uvd_video_wrapper__';
    wrapper.style.cssText = 'flex:1;display:flex;align-items:center;justify-content:center;background:#000;position:relative;';
    var videoEl = document.createElement('video');
    videoEl.id = '__uvd_player_video__';
    videoEl.className = 'video-js vjs-default-skin vjs-big-play-centered';
    videoEl.style.cssText = 'width:100%;height:100%;display:block;object-fit:contain;';
    videoEl.setAttribute('playsinline', '');
    videoEl.setAttribute('crossorigin', 'anonymous');
    wrapper.appendChild(videoEl);
    overlay.appendChild(wrapper);

    function initPlayer() {
      if (typeof videojs === 'undefined') {
        toast('Video.js chưa tải xong, thử lại');
        return;
      }
      var player = videojs(videoEl, {
        controls: true,
        autoplay: false,
        preload: 'auto',
        fluid: false,
        playbackRates: [0.5, 0.75, 1, 1.25, 1.5, 2],
        controlBar: {
          children: [
            'playToggle',
            'seekButtons',
            'currentTimeDisplay',
            'timeDivider',
            'durationDisplay',
            'progressControl',
            'liveDisplay',
            'remainingTimeDisplay',
            'playbackRateMenuButton',
            'qualityMenu',
            'screenshot',
            'volumePanel',
            'fullscreenToggle'
          ]
        }
      });

      if (type === 'M3U8' || url.includes('.m3u8') || type === 'MPD') {
        player.src({ src: url, type: 'application/x-mpegURL' });
      } else {
        player.src(url);
      }

      player.ready(function() {
        player.play().catch(function() {});
        toast('▶ Đang phát');
      });

      playerState.player = player;
      playerState.video = videoEl;

      document.getElementById('__uvd_player_close__').onclick = function() {
        closePlayer();
      };
    }

    if (typeof videojs !== 'undefined' && videojs.registerPlugin && videojs.getPlugin('qualityMenu')) {
      initPlayer();
    } else {
      loadVideoJsAndPlugins(function() {
        initPlayer();
      });
    }
  }

  // ========== CLOSE PLAYER ==========
  function closePlayer() {
    if (playerState.player) {
      playerState.player.dispose();
      playerState.player = null;
    }
    if (playerState.overlay) {
      playerState.overlay.remove();
      playerState.overlay = null;
    }
    playerState.video = null;
    playerState.url = '';
    playerState.type = '';
  }

  // ========== ISOLATE LAYER ==========
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
    panel.className = 'uvd-glass-panel';
    panel.style.cssText = 'position:fixed;top:15px;left:15px;right:15px;height:calc(100dvh - 30px);z-index:2147483647;animation:uvdScaleIn 0.4s ease;overscroll-behavior:contain;';

    var liquidBg = document.createElement('div');
    liquidBg.className = 'uvd-liquid-bg';
    panel.appendChild(liquidBg);

    var content = document.createElement('div');
    content.className = 'uvd-panel-content';
    panel.appendChild(content);

    var header = document.createElement('div');
    header.id = '__uvd_header__';
    header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding-bottom:12px;border-bottom:1px solid var(--border);margin-bottom:10px;flex-shrink:0;';
    header.innerHTML =
      '<div style="display:flex;align-items:center;gap:8px;">' +
        '<span style="width:10px;height:10px;background:var(--grad-liquid);border-radius:50%;animation:uvdPulse 2s infinite;box-shadow:0 0 8px rgba(109,140,255,0.6);"></span>' +
        '<span style="font-weight:700;font-size:16px;letter-spacing:-0.01em;">UMP DL <span style="background:var(--grad-liquid);-webkit-background-clip:text;background-clip:text;color:transparent;">V' + VERSION + '</span></span>' +
      '</div>' +
      '<div style="display:flex;gap:6px;">' +
        '<button class="uvd-btn-icon" id="__uvd_autoplay__" title="Tự động bấm Play (bấm hết cùng lúc)">▶</button>' +
        '<button class="uvd-btn-icon" id="__uvd_seq_autoplay__" title="Thử lần lượt từng server tới khi ra link">⏭</button>' +
        '<button class="uvd-btn-icon" id="__uvd_minimize_script__" title="Thu nhỏ Script">▼</button>' +
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

    var clickedCountForHost = Object.keys(data.clickedButtons[pageInfo.host] || {}).length;
    var tabList = [
      { id: 'streams', text: 'Streams (' + arr.length + ')' },
      { id: 'clicked', text: 'Nút đã click' + (clickedCountForHost ? ' (' + clickedCountForHost + ')' : '') },
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
      var width = btn.offsetWidth;
      indicator.style.width = width + 'px';
      indicator.style.transform = 'translateX(' + btn.offsetLeft + 'px)';
      if (btn.scrollIntoView) btn.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
    }

    var info = document.createElement('div');
    info.style.cssText = 'margin-bottom:10px;font-size:12px;flex-shrink:0;';
    var savedPlaySel = (data.siteProfiles[pageInfo.host] && data.siteProfiles[pageInfo.host].playSelector) || '';
    info.innerHTML =
      '<span style="color:var(--text2);">Tên: </span>' +
      '<span id="__uvd_title__" style="color:var(--accent);text-decoration:underline;cursor:pointer;">' + escapeHtml(pageInfo.title) + '</span> ' +
      '<span style="color:var(--text3);">(sửa)</span><br>' +
      '<span style="color:var(--text2);">Referer: </span>' +
      '<span id="__uvd_referer__" style="color:var(--accent2);font-family:monospace;text-decoration:underline;cursor:pointer;font-size:11px;">' + escapeHtml(pageInfo.referer) + '</span><br>' +
      '<span style="color:var(--text2);">Play selector: </span>' +
      '<span id="__uvd_playsel__" style="color:var(--accent2);font-family:monospace;text-decoration:underline;cursor:pointer;font-size:11px;">' + escapeHtml(savedPlaySel || '(chưa đặt · bấm để thêm)') + '</span>';
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

    __uvdAppendRoot(panel);
    __uvdIsolateLayer(panel);
    applyEffectsPref(panel);
    applyMotionPref(panel);

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
      if (tabId === 'streams') renderStreams(streamList, arr);
      else if (tabId === 'clicked') renderClickedButtons(streamList);
      else if (tabId === 'settings') renderSettings(streamList);
    }

    document.querySelectorAll('[data-tab]').forEach(function(t) {
      t.onclick = function() { renderTab(this.dataset.tab); };
    });
    renderTab('streams');

    window.addEventListener('resize', function() {
      moveIndicatorTo(document.querySelector('.uvd-tab.uvd-tab-active'));
    });

    document.getElementById('__uvd_close__').onclick = function() {
      stopMonitor();
      panel.remove();
      runCleanup();
    };
    document.getElementById('__uvd_refresh__').onclick = function() { buildUI(); toast('Đã làm mới'); };
    document.getElementById('__uvd_autoplay__').onclick = function() {
      var n = autoClickPlayButtons(document, 0, false);
      toast(n > 0 ? 'Đã thử bấm Play (' + n + ' nút)' : 'Không tìm thấy nút Play, thử đặt selector riêng ở Cài đặt');
      setTimeout(function() { buildUI(); }, 1200);
    };
    document.getElementById('__uvd_seq_autoplay__').onclick = function() { autoClickSequential(); };
    document.getElementById('__uvd_minimize_script__').onclick = minimizeScriptPanel;

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

  // ========== RENDER STREAMS ==========
  var UVD_LAZY_BATCH = 40;

  function buildStreamCardHTML(item, i) {
    var actionsHtml;
    if (item.type === 'BLOB') {
      actionsHtml =
        '<button class="uvd-btn uvd-btn-sm" data-action="play" data-url="' + encodeURIComponent(item.url) + '" data-type="' + escapeHtml(item.type) + '" style="background:rgba(109,140,255,0.25);">Xem</button>' +
        '<button class="uvd-btn uvd-btn-sm" data-action="blobdl" data-url="' + encodeURIComponent(item.url) + '" style="background:rgba(52,211,153,0.22);">⬇ Tải Blob</button>' +
        '<div style="grid-column:1/3;font-size:11px;color:var(--text3);line-height:1.4;">Blob chỉ tải được nếu là file gốc (không áp dụng cho stream HLS/DASH qua MediaSource).</div>';
    } else {
      actionsHtml =
        '<button class="uvd-btn uvd-btn-sm" data-action="share" data-url="' + encodeURIComponent(item.url) + '" style="background:rgba(139,92,246,0.2);">Chia sẻ</button>' +
        '<button class="uvd-btn uvd-btn-sm" data-action="copy" data-url="' + encodeURIComponent(item.url) + '">Sao chép</button>' +
        (item.type === 'IFRAME' ?
          '<button class="uvd-btn uvd-btn-sm" data-action="iframe" data-url="' + encodeURIComponent(item.url) + '" style="text-align:center;grid-column:1/3;">Mở iframe</button>' :
          (item.type === 'M3U8' || item.type === 'MPD' ?
            '<button class="uvd-btn uvd-btn-sm" data-action="play" data-url="' + encodeURIComponent(item.url) + '" data-type="' + escapeHtml(item.type) + '" style="background:rgba(109,140,255,0.25);">Xem</button>' +
            '<button class="uvd-btn uvd-btn-sm" data-action="cmd" data-url="' + encodeURIComponent(item.url) + '" data-type="' + escapeHtml(item.type) + '" style="grid-column:1/3;">Lệnh tải</button>' :
            '<button class="uvd-btn uvd-btn-sm" data-action="play" data-url="' + encodeURIComponent(item.url) + '" data-type="' + escapeHtml(item.type) + '" style="background:rgba(109,140,255,0.25);">Xem</button>' +
            '<button class="uvd-btn uvd-btn-sm" data-action="cmd" data-url="' + encodeURIComponent(item.url) + '" data-type="' + escapeHtml(item.type) + '">Lệnh tải</button>'
          )
        );
    }
    return (
      '<div class="uvd-card" data-type="' + escapeHtml(item.type) + '" data-url="' + escapeHtml(item.url) + '">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">' +
          '<span class="uvd-type-badge">#' + (i+1) + ' ' + escapeHtml(item.type) + '</span>' +
          '<button class="uvd-block-btn" data-url="' + encodeURIComponent(item.url) + '" style="background:none;border:none;font-size:16px;cursor:pointer;color:#fff;opacity:0.5;" title="Chặn link này">⛔</button>' +
        '</div>' +
        '<div class="uvd-url-box">' + escapeHtml(item.url) + '</div>' +
        '<div class="uvd-grid-2" style="margin-top:8px;">' + actionsHtml + '</div>' +
      '</div>'
    );
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
        addToHistory(u2, t || 'IFRAME');
        if (action === 'share') shareUrl(u2);
        else if (action === 'copy') { copy(u2); toast('Đã sao chép!'); }
        else if (action === 'play') window.__uvd_showPlayer(u2, t || 'MP4');
        else if (action === 'cmd') showCommandPicker(u2, t);
        else if (action === 'iframe') window.__uvdSafeOpen(u2);
        else if (action === 'blobdl') downloadBlobUrl(u2);
        return;
      }
      if (e.target === moreBtn) return;
    };
  }

  // ========== TẢI BLOB ==========
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
      '<textarea style="width:100%;height:120px;background:rgba(0,0,0,0.5);border:1px solid var(--border);border-radius:10px;color:var(--text);padding:12px;font-family:monospace;">' + escapeHtml(text) + '</textarea>' +
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
              '<div style="font-family:monospace;font-size:12.5px;color:var(--text);word-break:break-all;">' + escapeHtml(rec.selector) + '</div>' +
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
    var bookmarkletCode = "javascript:(function(){var s=document.createElement('script');s.src='https://cdn.jsdelivr.net/gh/nguyenquocngu93/bookmarklet-@main/umpdl_v8_videojs.js?force='+Date.now();document.head.appendChild(s);})();";

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
            '<span class="uvd-tag">Video.js 8</span>' +
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
        '<div style="font-weight:600;margin-bottom:8px;">⚡ Hiệu năng</div>' +
        buildToggleRow('__uvd_toggle_reducemotion__', 'Bật chế độ hiệu suất (giảm hiệu ứng)', data.settings.reduceMotion) +
        '<div style="font-size:12px;color:var(--text2);margin:10px 0 4px;">Cường độ làm mờ (blur): <span id="__uvd_blur_val__">' + data.settings.blurIntensity + 'px</span></div>' +
        '<input type="range" id="__uvd_blur_range__" min="0" max="30" step="1" value="' + data.settings.blurIntensity + '" style="width:100%;">' +
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
        '<div style="font-weight:600;margin-bottom:8px;">⛔ Chặn tự phát</div>' +
        buildToggleRow('__uvd_toggle_blockautoplay__', 'Chặn mạnh web tự mở/phát video sau khi chạy script', data.settings.blockAutoplay) +
        '<div style="font-size:11px;color:var(--text3);margin-top:6px;">Video/audio do chính trang web tự bật (quảng cáo, autoplay ẩn...) sẽ luôn bị tạm dừng ngay. Video mở qua UMP DL Player không bị ảnh hưởng.</div>' +
      '</div>' +

      '<div class="uvd-card">' +
        '<div style="font-weight:600;margin-bottom:8px;">🛡️ Lọc quảng cáo (Filterlist)</div>' +
        '<div style="font-size:12px;color:var(--text2);margin-bottom:8px;">' +
          'Nhập mỗi dòng một từ khóa hoặc domain (vd: <code>doubleclick.net</code>). Hỗ trợ regex nếu bắt đầu bằng <code>regex:</code>. Các URL chứa pattern sẽ bị bỏ qua.' +
        '</div>' +
        '<textarea id="__uvd_filter_text__" style="width:100%;height:80px;background:rgba(0,0,0,0.5);border:1px solid var(--border);border-radius:10px;color:var(--text);padding:12px;font-size:12px;">' + escapeHtml((data.filterlist||[]).join('\n')) + '</textarea>' +
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
        '<div class="uvd-step"><span class="uvd-step-num">•</span><span class="uvd-step-text">Player có các nút: Play/Pause, tua lùi/tiến, chất lượng, tốc độ, chụp ảnh, fullscreen.</span></div>' +
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
    };

    document.getElementById('__uvd_transition_range__').oninput = function() {
      var val = parseFloat(this.value);
      data.settings.transitionSpeed = val;
      document.getElementById('__uvd_transition_val__').textContent = val + 's';
      storage.set(data);
      applyMotionPref(document.getElementById('__uvd__'));
    };

    document.getElementById('__uvd_toggle_glow__').onclick = function() {
      var isOn = this.classList.toggle('uvd-toggle-on');
      data.settings.glowEffects = isOn;
      storage.set(data);
      applyEffectsPref(document.getElementById('__uvd__'));
      toast(isOn ? 'Đã bật hiệu ứng phát sáng' : 'Đã tắt hiệu ứng phát sáng');
    };

    document.getElementById('__uvd_fx_range__').oninput = function() {
      var val = parseInt(this.value);
      data.settings.effectsIntensity = val;
      document.getElementById('__uvd_fx_val__').textContent = val + '%';
      storage.set(data);
      applyEffectsPref(document.getElementById('__uvd__'));
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
          try { data = Object.assign(data, JSON.parse(ev.target.result)); storage.set(data); toast('Đã nhập!'); buildUI(); }
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
        buildUI();
      }
    };

    document.getElementById('__uvd_save_filter__').onclick = function() {
      var raw = document.getElementById('__uvd_filter_text__').value;
      data.filterlist = raw.split('\n').map(function(s) { return s.trim(); }).filter(Boolean);
      storage.set(data);
      compileAdFilters();
      toast('Đã lưu filterlist (' + data.filterlist.length + ' mục) · áp dụng ngay');
      buildUI();
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

  function buildToggleRow(id, label, checked) {
    return '<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border);">' +
      '<span style="font-size:13px;color:var(--text2);">' + escapeHtml(label) + '</span>' +
      '<button id="' + id + '" class="uvd-toggle-switch' + (checked ? ' uvd-toggle-on' : '') + '"><span class="uvd-toggle-knob"></span></button>' +
    '</div>';
  }

  // ========== MINIMIZE / RESTORE ==========
  function setMinimizeBtnState(minimized) {
    var btn = document.getElementById('__uvd_minimize_script__');
    if (!btn) return;
    btn.textContent = minimized ? '▲' : '▼';
    btn.title = minimized ? 'Mở rộng Script' : 'Thu nhỏ Script';
    btn.onclick = minimized ? restoreScriptPanel : minimizeScriptPanel;
  }

  function minimizeScriptPanel() {
    var panel = document.getElementById('__uvd__');
    var header = document.getElementById('__uvd_header__');
    if (!panel || !header || panel.classList.contains('uvd-panel-minimized')) return;
    var startHeight = panel.getBoundingClientRect().height;
    var targetHeight = (header.getBoundingClientRect().bottom - panel.getBoundingClientRect().top) + 16;
    panel.style.height = startHeight + 'px';
    panel.style.transition = 'height .38s cubic-bezier(.4,0,.2,1)';
    void panel.offsetHeight;
    panel.classList.add('uvd-panel-minimized');
    panel.style.height = targetHeight + 'px';
    setMinimizeBtnState(true);
  }

  function restoreScriptPanel() {
    var panel = document.getElementById('__uvd__');
    if (!panel || !panel.classList.contains('uvd-panel-minimized')) return;
    var targetHeight = window.innerHeight - 30;
    panel.style.transition = 'height .38s cubic-bezier(.4,0,.2,1)';
    panel.classList.remove('uvd-panel-minimized');
    panel.style.height = targetHeight + 'px';
    panel.addEventListener('transitionend', function onEnd(e) {
      if (e.propertyName !== 'height') return;
      panel.removeEventListener('transitionend', onEnd);
      panel.style.height = 'calc(100dvh - 30px)';
      panel.style.transition = '';
    });
    setMinimizeBtnState(false);
  }

  // ========== START ==========
  buildUI();
  toast('V' + VERSION + ' PRO (Video.js 8) sẵn sàng!');
  console.log('UMP DL V' + VERSION + ' loaded with Video.js 8');
})();