/**
 * UMP DL PRO - Minimalist Edition
 * - CSS cực nhẹ (xoá hết glow, blur, animation)
 * - Tự động click các nút server (button[id^="video-host-"])
 * - Player overlay với Video.js v10 (tải từ CDN)
 * - Giữ nguyên tab: Streams, Nút đã click, Cài đặt
 * - Icon text (▶, ⚙, ✕, ▼, ...)
 * - Tác giả: nguyenquocngu91 (mod)
 */
(function() {
  'use strict';

  // ========== VERSION ==========
  var VERSION = '6.7.16-mod-minimal';

  // ========== ICONS (text only) ==========
  var ICONS = {
    play: '▶',
    servers: '⛁',
    refresh: '↻',
    close: '✕',
    chevronDown: '▼'
  };

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
  data.clickedSelectors = data.clickedSelectors || [];
  data.blockedSelectors = data.blockedSelectors || [];
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
    glowEffects: false,   // mặc định tắt
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

  // ========== GET UNIQUE SELECTOR ==========
  function getUniqueSelector(el) {
    if (!el || el === document.body) return 'body';
    var path = [];
    while (el && el !== document.body) {
      var selector = el.tagName.toLowerCase();
      if (el.id) { selector += '#' + el.id; path.unshift(selector); break; }
      if (el.className && typeof el.className === 'string') {
        var classes = el.className.trim().split(/\s+/).filter(Boolean);
        if (classes.length) selector += '.' + classes.join('.');
      }
      var parent = el.parentElement;
      if (parent) {
        var siblings = parent.children;
        var same = 0;
        for (var i = 0; i < siblings.length; i++) {
          if (siblings[i].tagName === el.tagName) same++;
        }
        if (same > 1) {
          var index = 1;
          for (var j = 0; j < siblings.length; j++) {
            if (siblings[j] === el) break;
            if (siblings[j].tagName === el.tagName) index++;
          }
          selector += ':nth-of-type(' + index + ')';
        }
      }
      path.unshift(selector);
      el = parent;
    }
    return path.join(' > ');
  }

  // ========== AUTO-CLICK SERVERS (IMPROVED) ==========
  function autoClickServersAndScan() {
    var candidates = [];
    // Ưu tiên button[id^="video-host-"]
    document.querySelectorAll('button[id^="video-host-"]').forEach(function(el) {
      var sel = getUniqueSelector(el);
      if (data.blockedSelectors.indexOf(sel) === -1) candidates.push(el);
    });
    // Nếu chưa có, dò tất cả nút có thể click
    if (candidates.length === 0) {
      document.querySelectorAll('body *').forEach(function(el) {
        if (el.closest && (el.closest('#__uvd__') || el.closest('#__uvd_player_overlay__'))) return;
        var txt = (el.textContent || '').trim();
        if (!txt || txt.length > 10) return;
        var cs = getComputedStyle(el);
        var clickable = cs.cursor === 'pointer' || el.tagName === 'BUTTON' || !!el.onclick;
        if (clickable && !el.closest('a[href]')) {
          var sel2 = getUniqueSelector(el);
          if (data.blockedSelectors.indexOf(sel2) === -1) candidates.push(el);
        }
      });
    }
    if (candidates.length === 0) {
      toast('Không tìm thấy nút server nào để click. Hãy thử bấm tay hoặc kiểm tra selector.');
      return;
    }

    toast('Tìm thấy ' + candidates.length + ' nút server, đang click lần lượt...');
    var i = 0;
    var totalUrlsBefore = urls.size;

    function clickNext() {
      if (i >= candidates.length) {
        scan(document, 'server-scan-final');
        var newUrls = urls.size - totalUrlsBefore;
        toast('Đã click xong ' + candidates.length + ' nút, tìm thấy ' + newUrls + ' luồng mới.');
        buildUI();
        return;
      }
      var el = candidates[i++];
      var selector = getUniqueSelector(el);
      if (data.clickedSelectors.indexOf(selector) === -1) {
        data.clickedSelectors.push(selector);
        storage.set(data);
      }
      try { el.click(); } catch(e) {}
      setTimeout(function() {
        scan(document, 'server-scan');
        if (urls.size === totalUrlsBefore) {
          setTimeout(function() {
            scan(document, 'server-scan-retry');
            clickNext();
          }, 600);
        } else {
          clickNext();
        }
      }, 1200);
    }
    clickNext();
  }

  // ========== AUTO-CLICK PLAY BUTTONS ==========
  var AUTO_PLAY_SELECTORS = [
    'button[id^="video-host-"]',
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

  // ========== TOAST ==========
  function toast(msg, color) {
    var el = document.createElement('div');
    el.textContent = msg;
    el.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);background:' + (color || '#4f7cff') + ';color:#fff;padding:10px 20px;border-radius:8px;z-index:2147483649;font:600 13px sans-serif;box-shadow:0 4px 12px rgba(0,0,0,0.5);';
    __uvdAppendRoot(el);
    setTimeout(function() { el.remove(); }, 2500);
  }

  // ========== CSS (minimal) ==========
  if (document.getElementById('__uvd_css__')) document.getElementById('__uvd_css__').remove();
  var style = document.createElement('style');
  style.id = '__uvd_css__';
  style.textContent = `
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:sans-serif}
    :root{--bg:#0b0d15;--card:#161922;--border:#2a2e3d;--text:#e8ecf4;--text2:#8e94b0;--accent:#4f7cff}
    .uvd-glass-panel{position:fixed;top:10px;left:10px;right:10px;height:calc(100dvh - 20px);background:var(--bg);border:1px solid var(--border);border-radius:8px;z-index:2147483647;display:flex;flex-direction:column;overflow:hidden;font-size:13px;color:var(--text)}
    .uvd-panel-content{display:flex;flex-direction:column;height:100%;padding:8px 10px;gap:6px}
    #__uvd_header__{display:flex;justify-content:space-between;align-items:center;flex-shrink:0;gap:6px;padding-bottom:6px;border-bottom:1px solid var(--border)}
    #__uvd_header__ .logo{font-weight:bold;font-size:15px}
    #__uvd_header__ .logo span{color:var(--accent)}
    #__uvd_header__ .btns{display:flex;gap:4px}
    .uvd-btn{background:var(--card);border:1px solid var(--border);color:var(--text);padding:4px 10px;border-radius:6px;cursor:pointer;font-size:12px;font-weight:600;transition:.1s}
    .uvd-btn:hover{background:#2a2e3d}
    .uvd-btn-sm{padding:3px 8px;font-size:11px}
    .uvd-tabbar{display:flex;gap:2px;background:var(--card);border-radius:6px;padding:2px;flex-shrink:0}
    .uvd-tab{flex:1;background:transparent;border:none;color:var(--text2);padding:6px 0;border-radius:4px;font-weight:600;font-size:12px;cursor:pointer}
    .uvd-tab.uvd-tab-active{background:var(--accent);color:#fff}
    #__uvd_info__{font-size:11px;color:var(--text2);line-height:1.6;flex-shrink:0}
    #__uvd_info__ .hl{color:var(--accent);cursor:pointer;text-decoration:underline}
    .uvd-scroll{flex:1;overflow-y:auto;min-height:0;padding-right:2px}
    .uvd-card{background:var(--card);border:1px solid var(--border);border-radius:6px;padding:8px 10px;margin-bottom:6px;font-size:12px}
    .uvd-card .type{display:inline-block;background:var(--accent);color:#fff;padding:1px 8px;border-radius:10px;font-size:10px;font-weight:bold}
    .uvd-card .url{background:#0a0c14;border-radius:4px;padding:6px;font-family:monospace;font-size:11px;word-break:break-all;margin:4px 0;color:var(--text2)}
    .uvd-grid-2{display:grid;grid-template-columns:1fr 1fr;gap:4px;margin-top:4px}
    .uvd-grid-2 .uvd-btn{width:100%;text-align:center}
    .uvd-toggle{display:inline-flex;align-items:center;gap:6px;font-size:12px;cursor:pointer}
    .uvd-toggle input{display:none}
    .uvd-toggle .slider{width:32px;height:18px;background:var(--border);border-radius:12px;position:relative;transition:.15s;flex-shrink:0}
    .uvd-toggle .slider::after{content:'';width:14px;height:14px;background:#fff;border-radius:50%;position:absolute;top:2px;left:2px;transition:.15s}
    .uvd-toggle input:checked+.slider{background:var(--accent)}
    .uvd-toggle input:checked+.slider::after{left:16px}
    .uvd-profile-card{background:var(--card);border-radius:6px;padding:12px;display:flex;gap:12px;align-items:center;border:1px solid var(--border);margin-bottom:6px}
    .uvd-profile-avatar{width:40px;height:40px;background:var(--accent);border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:bold;color:#fff;flex-shrink:0}
    .uvd-profile-info .name{font-weight:bold;font-size:14px}
    .uvd-profile-info .role{font-size:11px;color:var(--text2)}
    .uvd-tag{display:inline-block;background:var(--border);padding:1px 8px;border-radius:12px;font-size:10px;color:var(--text2);margin-right:4px}
    .uvd-stat{background:var(--card);border:1px solid var(--border);border-radius:4px;padding:6px;text-align:center;font-size:11px;color:var(--text2)}
    .uvd-stat .num{font-weight:bold;font-size:16px;color:var(--text)}
    .uvd-step{display:flex;gap:8px;margin-bottom:6px;font-size:12px;color:var(--text2)}
    .uvd-step .num{background:var(--accent);color:#fff;border-radius:50%;width:20px;height:20px;display:flex;align-items:center;justify-content:center;font-weight:bold;font-size:11px;flex-shrink:0}
    .uvd-inline-code{background:var(--border);padding:1px 6px;border-radius:4px;font-family:monospace;font-size:11px}
    .uvd-code-block{background:#0a0c14;border-radius:4px;padding:6px;margin:4px 0;position:relative}
    .uvd-code-block textarea{width:100%;background:transparent;border:none;color:var(--accent);font-family:monospace;font-size:11px;resize:none;outline:none}
    .uvd-callout{background:var(--card);border-left:3px solid var(--accent);padding:6px 10px;font-size:12px;color:var(--text2);margin-top:6px}
    .uvd-footer{display:flex;gap:4px;flex-wrap:wrap;flex-shrink:0;padding-top:4px;border-top:1px solid var(--border);margin-top:4px}
    .uvd-footer .uvd-btn{flex:1;text-align:center;font-size:11px}
    .uvd-author{text-align:center;font-size:10px;color:var(--text2);padding:4px 0}
    /* player overlay */
    #__uvd_player_overlay__{position:fixed;inset:0;background:rgba(0,0,0,0.95);z-index:2147483648;display:flex;flex-direction:column}
    #__uvd_player_header__{background:#111;padding:6px 12px;display:flex;justify-content:space-between;align-items:center;flex-shrink:0;border-bottom:1px solid #333}
    #__uvd_player_header__ .title{font-weight:bold;font-size:14px;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    #__uvd_player_header__ .btns{display:flex;gap:4px}
    #__uvd_video_wrapper__{flex:1;display:flex;align-items:center;justify-content:center;background:#000}
    #__uvd_video_wrapper__ video{max-width:100%;max-height:100%;width:100%;height:100%;object-fit:contain}
    #__uvd_player_footer__{background:#111;padding:4px 12px;display:flex;justify-content:space-between;font-size:11px;color:#aaa;flex-shrink:0;border-top:1px solid #333}
    /* hide unwanted */
    .uvd-liquid-bg, .uvd-tab-indicator, .uvd-ripple {display:none !important}
    .uvd-panel-minimized .uvd-panel-content > *:not(#__uvd_header__){display:none}
  `;
  document.head.appendChild(style);

  // ========== RENDER CLICKED SELECTORS ==========
  function renderClickedSelectors(container) {
    var list = data.clickedSelectors || [];
    var blocked = data.blockedSelectors || [];
    if (!list.length) {
      container.innerHTML = '<div style="text-align:center;padding:30px;color:var(--text3);">Chưa có nút nào được click tự động.</div>';
      return;
    }
    var html = '<div style="font-weight:600;margin-bottom:12px;">Danh sách nút đã click (tổng ' + list.length + ')</div>';
    html += '<div style="font-size:12px;color:var(--text2);margin-bottom:12px;">Bật/toggle để chặn hoặc cho phép click lại.</div>';
    list.forEach(function(sel) {
      var isBlocked = blocked.indexOf(sel) !== -1;
      html += '<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--border);">' +
        '<label class="uvd-toggle"><input type="checkbox"' + (isBlocked ? ' checked' : '') + ' data-selector="' + encodeURIComponent(sel) + '"><span class="slider"></span></label>' +
        '<span style="font-size:11px;color:var(--text2);word-break:break-all;font-family:monospace;">' + escapeHtml(sel) + '</span>' +
      '</div>';
    });
    container.innerHTML = html;
    container.querySelectorAll('.uvd-toggle input').forEach(function(cb) {
      cb.onchange = function() {
        var sel = decodeURIComponent(this.dataset.selector);
        if (this.checked) {
          if (data.blockedSelectors.indexOf(sel) === -1) data.blockedSelectors.push(sel);
        } else {
          var idx = data.blockedSelectors.indexOf(sel);
          if (idx !== -1) data.blockedSelectors.splice(idx, 1);
        }
        storage.set(data);
        toast(this.checked ? 'Đã chặn nút này' : 'Đã bỏ chặn');
      };
    });
  }

  // ========== BUILD UI (minimal) ==========
  function buildUI() {
    var arr = [...urls.entries()].map(function(e) {
      return { url: e[0], type: e[1].type, source: e[1].source, priority: e[1].priority };
    }).sort(function(a, b) { return a.priority - b.priority; });

    var panel = document.getElementById('__uvd__');
    if (panel) panel.remove();

    panel = document.createElement('div');
    panel.id = '__uvd__';
    panel.className = 'uvd-glass-panel';
    panel.style.cssText = 'position:fixed;top:15px;left:15px;right:15px;height:calc(100dvh - 30px);z-index:2147483647;';
    var content = document.createElement('div');
    content.className = 'uvd-panel-content';
    panel.appendChild(content);

    // Header
    var header = document.createElement('div');
    header.id = '__uvd_header__';
    header.innerHTML =
      '<div class="logo">UMP DL <span>v' + VERSION + '</span></div>' +
      '<div class="btns">' +
        '<button class="uvd-btn uvd-btn-sm" id="__uvd_autoplay__">' + ICONS.play + '</button>' +
        '<button class="uvd-btn uvd-btn-sm" id="__uvd_scan_servers__">' + ICONS.servers + '</button>' +
        '<button class="uvd-btn uvd-btn-sm" id="__uvd_minimize_script__">' + ICONS.chevronDown + '</button>' +
        '<button class="uvd-btn uvd-btn-sm" id="__uvd_refresh__">' + ICONS.refresh + '</button>' +
        '<button class="uvd-btn uvd-btn-sm" id="__uvd_close__">' + ICONS.close + '</button>' +
      '</div>';
    content.appendChild(header);

    // Tabbar
    var tabbar = document.createElement('div');
    tabbar.className = 'uvd-tabbar';
    var tabs = [
      { id: 'streams', text: 'Streams (' + arr.length + ')' },
      { id: 'clicked', text: 'Nút đã click' },
      { id: 'settings', text: 'Cài đặt' }
    ];
    tabs.forEach(function(t) {
      var b = document.createElement('button');
      b.className = 'uvd-tab';
      b.dataset.tab = t.id;
      b.textContent = t.text;
      tabbar.appendChild(b);
    });
    content.appendChild(tabbar);

    // Info line
    var info = document.createElement('div');
    info.id = '__uvd_info__';
    var savedPlaySel = (data.siteProfiles[pageInfo.host] && data.siteProfiles[pageInfo.host].playSelector) || '';
    info.innerHTML =
      'Tên: <span class="hl" id="__uvd_title__">' + escapeHtml(pageInfo.title) + '</span> (sửa)<br>' +
      'Referer: <span class="hl" id="__uvd_referer__">' + escapeHtml(pageInfo.referer) + '</span><br>' +
      'Play selector: <span class="hl" id="__uvd_playsel__">' + escapeHtml(savedPlaySel || '(chưa đặt · bấm để thêm)') + '</span>';
    content.appendChild(info);

    // Scroll container
    var scroll = document.createElement('div');
    scroll.className = 'uvd-scroll';
    var streamList = document.createElement('div');
    streamList.id = '__uvd_stream_list__';
    scroll.appendChild(streamList);
    content.appendChild(scroll);

    // Footer
    var footer = document.createElement('div');
    footer.className = 'uvd-footer';
    ['TXT','JSON','M3U','CSV'].forEach(function(f) {
      var btn = document.createElement('button');
      btn.className = 'uvd-btn uvd-btn-sm';
      btn.textContent = f;
      btn.onclick = function() { exportData(f.toLowerCase()); };
      footer.appendChild(btn);
    });
    content.appendChild(footer);

    var author = document.createElement('div');
    author.className = 'uvd-author';
    author.textContent = '© nguyenquocngu91';
    content.appendChild(author);

    __uvdAppendRoot(panel);

    // Tab switching
    var currentTab = 'streams';
    function renderTab(tabId) {
      currentTab = tabId;
      document.querySelectorAll('[data-tab]').forEach(function(t) {
        if (t.dataset.tab === tabId) t.classList.add('uvd-tab-active');
        else t.classList.remove('uvd-tab-active');
      });
      streamList.innerHTML = '';
      if (tabId === 'streams') renderStreams(streamList, arr);
      else if (tabId === 'settings') renderSettings(streamList);
      else if (tabId === 'clicked') renderClickedSelectors(streamList);
    }
    document.querySelectorAll('[data-tab]').forEach(function(t) {
      t.onclick = function() { renderTab(this.dataset.tab); };
    });
    renderTab('streams');

    // Event bindings
    document.getElementById('__uvd_close__').onclick = function() { panel.remove(); };
    document.getElementById('__uvd_refresh__').onclick = function() { buildUI(); toast('Đã làm mới'); };
    document.getElementById('__uvd_scan_servers__').onclick = autoClickServersAndScan;
    document.getElementById('__uvd_autoplay__').onclick = function() {
      var n = autoClickPlayButtons(document, 0, false);
      toast(n > 0 ? 'Đã thử bấm Play (' + n + ' nút)' : 'Không tìm thấy nút Play, thử đặt selector riêng ở Cài đặt');
      setTimeout(function() { buildUI(); }, 1200);
    };
    document.getElementById('__uvd_minimize_script__').onclick = function() {
      panel.classList.toggle('uvd-panel-minimized');
      this.textContent = panel.classList.contains('uvd-panel-minimized') ? '▲' : '▼';
    };

    document.getElementById('__uvd_title__').onclick = function() {
      var newTitle = prompt('Tên file:', pageInfo.title);
      if (newTitle) { pageInfo.title = newTitle; this.textContent = escapeHtml(pageInfo.title); }
    };
    document.getElementById('__uvd_referer__').onclick = function() {
      var newRef = prompt('Referer:', pageInfo.referer);
      if (newRef) {
        pageInfo.referer = newRef;
        this.textContent = escapeHtml(newRef);
        data.siteProfiles[pageInfo.host] = Object.assign({}, data.siteProfiles[pageInfo.host], { referer: newRef, userAgent: pageInfo.userAgent });
        storage.set(data);
      }
    };
    document.getElementById('__uvd_playsel__').onclick = function() {
      var current = (data.siteProfiles[pageInfo.host] && data.siteProfiles[pageInfo.host].playSelector) || '';
      var newSel = prompt('CSS selector của nút Play trên site này:', current);
      if (newSel !== null) {
        newSel = newSel.trim();
        data.siteProfiles[pageInfo.host] = Object.assign({}, data.siteProfiles[pageInfo.host], { playSelector: newSel });
        storage.set(data);
        this.textContent = escapeHtml(newSel || '(chưa đặt · bấm để thêm)');
        if (newSel) {
          toast('Đã lưu selector riêng');
          autoClickPlayButtons(document, 0, false);
          setTimeout(buildUI, 1000);
        }
      }
    };

    window.__uvd_showPlayer = function(url, type) {
      showVideoPlayer(url, type);
    };
  }

  // ========== RENDER STREAMS (simplified) ==========
  function renderStreams(container, arr) {
    if (!arr.length) {
      container.innerHTML = '<div style="padding:20px;color:var(--text2);text-align:center;">Không tìm thấy stream nào.</div>';
      return;
    }
    arr.forEach(function(item, i) {
      var card = document.createElement('div');
      card.className = 'uvd-card';
      card.innerHTML =
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">' +
          '<span class="type">#' + (i+1) + ' ' + escapeHtml(item.type) + '</span>' +
          '<button class="uvd-block-btn" data-url="' + encodeURIComponent(item.url) + '" style="background:none;border:none;color:#aaa;cursor:pointer;font-size:14px;">⛔</button>' +
        '</div>' +
        '<div class="url">' + escapeHtml(item.url) + '</div>' +
        '<div class="uvd-grid-2">' +
          (item.type === 'BLOB' ?
            '<button class="uvd-btn uvd-btn-sm" data-action="play" data-url="' + encodeURIComponent(item.url) + '" data-type="BLOB">Xem</button>' +
            '<button class="uvd-btn uvd-btn-sm" data-action="blobdl" data-url="' + encodeURIComponent(item.url) + '">Tải blob</button>' :
            (item.type === 'IFRAME' ?
              '<button class="uvd-btn uvd-btn-sm" data-action="iframe" data-url="' + encodeURIComponent(item.url) + '">Mở mới</button>' +
              '<button class="uvd-btn uvd-btn-sm" data-action="iframe-inline" data-url="' + encodeURIComponent(item.url) + '">Mở tại chỗ</button>' :
              '<button class="uvd-btn uvd-btn-sm" data-action="play" data-url="' + encodeURIComponent(item.url) + '" data-type="' + escapeHtml(item.type) + '">Xem</button>' +
              '<button class="uvd-btn uvd-btn-sm" data-action="cmd" data-url="' + encodeURIComponent(item.url) + '" data-type="' + escapeHtml(item.type) + '">Lệnh tải</button>'
            )
          ) +
          '<button class="uvd-btn uvd-btn-sm" data-action="copy" data-url="' + encodeURIComponent(item.url) + '">Copy</button>' +
          '<button class="uvd-btn uvd-btn-sm" data-action="share" data-url="' + encodeURIComponent(item.url) + '">Chia sẻ</button>' +
        '</div>';
      container.appendChild(card);
    });

    container.onclick = function(e) {
      var blockBtn = e.target.closest('.uvd-block-btn');
      if (blockBtn) {
        var urlToBlock = decodeURIComponent(blockBtn.dataset.url);
        var pattern = urlToBlock;
        try { pattern = new URL(urlToBlock).hostname; } catch(ex) {}
        if (confirm('Chặn tất cả stream chứa "' + pattern + '" ?')) {
          data.filterlist.push(pattern);
          storage.set(data);
          compileAdFilters();
          toast('Đã chặn "' + pattern + '"');
          buildUI();
        }
        return;
      }
      var actionBtn = e.target.closest('.uvd-btn[data-action]');
      if (!actionBtn) return;
      var u2 = decodeURIComponent(actionBtn.dataset.url);
      var action = actionBtn.dataset.action;
      var t = actionBtn.dataset.type;
      if (action === 'copy') { copy(u2); toast('Đã sao chép!'); }
      else if (action === 'share') shareUrl(u2);
      else if (action === 'play') window.__uvd_showPlayer(u2, t || 'MP4');
      else if (action === 'cmd') showCommandPicker(u2, t);
      else if (action === 'iframe') window.open(u2, '_blank');
      else if (action === 'iframe-inline') showInlineIframe(u2);
      else if (action === 'blobdl') downloadBlobUrl(u2);
    };
  }

  // ========== SETTINGS (minimal) ==========
  function renderSettings(container) {
    var s = data.settings;
    var totalStreams = urls.size;
    var bookmarkletCode = "javascript:(function(){var s=document.createElement('script');s.src='https://cdn.jsdelivr.net/gh/nguyenquocngu93/bookmarklet-@main/umpdl.js?force='+Date.now();document.head.appendChild(s);})();";

    container.innerHTML =
      '<div class="uvd-profile-card">' +
        '<div class="uvd-profile-avatar">NQ</div>' +
        '<div class="uvd-profile-info"><div class="name">nguyenquocngu91</div><div class="role">UMP DL v' + VERSION + '</div></div>' +
      '</div>' +
      '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-bottom:6px;">' +
        '<div class="uvd-stat"><div class="num">' + totalStreams + '</div>Streams</div>' +
        '<div class="uvd-stat"><div class="num">' + data.favorites.length + '</div>Yêu thích</div>' +
        '<div class="uvd-stat"><div class="num">' + (data.history||[]).length + '</div>Lịch sử</div>' +
        '<div class="uvd-stat"><div class="num" style="color:#ff5d72;">' + __uvdAdBlockedCount + '</div>Chặn</div>' +
      '</div>' +

      '<div class="uvd-card">' +
        '<div style="font-weight:600;margin-bottom:6px;">Tốc độ mặc định</div>' +
        '<select id="__uvd_set_speed__" style="width:100%;padding:6px;background:#0a0c14;color:#fff;border:1px solid var(--border);border-radius:4px;">' +
          [0.5,0.75,1,1.25,1.5,2].map(function(v){ return '<option value="'+v+'"'+(s.defaultSpeed===v?' selected':'')+'>'+v+'x</option>'; }).join('') +
        '</select>' +
      '</div>' +

      '<div class="uvd-card">' +
        '<div style="font-weight:600;margin-bottom:6px;">Tùy chọn</div>' +
        toggleRow('__uvd_toggle_resume__', 'Nhớ vị trí xem dở', s.resumePlayback) +
        toggleRow('__uvd_toggle_autofs__', 'Tự động toàn màn hình', s.autoFullscreen) +
        toggleRow('__uvd_toggle_autonext__', 'Tự động phát tiếp', s.autoNext) +
        toggleRow('__uvd_toggle_datasaver__', 'Tiết kiệm data (chất lượng thấp)', s.dataSaver) +
        toggleRow('__uvd_toggle_autohide__', 'Tự động ẩn thanh điều khiển', s.autoHideControls) +
      '</div>' +

      '<div class="uvd-card">' +
        '<div style="font-weight:600;margin-bottom:6px;">Tăng âm lượng</div>' +
        toggleRow('__uvd_toggle_boost__', 'Bật tăng âm lượng mặc định', s.volumeBoost) +
        '<div style="font-size:12px;color:var(--text2);margin:4px 0;">Mức tăng: <span id="__uvd_boost_val__">' + s.volumeBoostMax + '%</span></div>' +
        '<input type="range" id="__uvd_boost_range__" min="100" max="300" step="10" value="' + s.volumeBoostMax + '" style="width:100%;">' +
      '</div>' +

      '<div class="uvd-card">' +
        '<div style="font-weight:600;margin-bottom:6px;">Tua nhanh</div>' +
        '<input type="number" id="__uvd_doubletap_seconds__" min="1" max="60" step="1" value="' + s.doubleTapSeconds + '" style="width:100%;padding:6px;background:#0a0c14;color:#fff;border:1px solid var(--border);border-radius:4px;">' +
      '</div>' +

      '<div class="uvd-card">' +
        '<div style="font-weight:600;margin-bottom:6px;">Chặn tự phát</div>' +
        toggleRow('__uvd_toggle_blockautoplay__', 'Chặn mạnh web tự phát video', s.blockAutoplay) +
      '</div>' +

      '<div class="uvd-card">' +
        '<div style="font-weight:600;margin-bottom:6px;">Lọc quảng cáo</div>' +
        '<textarea id="__uvd_filter_text__" style="width:100%;height:60px;background:#0a0c14;border:1px solid var(--border);border-radius:4px;color:var(--text);padding:6px;font-size:11px;">' + escapeHtml((data.filterlist||[]).join('\n')) + '</textarea>' +
        '<div style="display:flex;gap:4px;margin-top:4px;">' +
          '<button class="uvd-btn uvd-btn-sm" id="__uvd_save_filter__">Lưu</button>' +
          '<button class="uvd-btn uvd-btn-sm" id="__uvd_import_filter__">Import</button>' +
        '</div>' +
      '</div>' +

      '<div class="uvd-card">' +
        '<div style="font-weight:600;margin-bottom:6px;">Sao lưu</div>' +
        '<div style="display:flex;gap:4px;">' +
          '<button class="uvd-btn uvd-btn-sm" id="__uvd_backup__">Xuất</button>' +
          '<button class="uvd-btn uvd-btn-sm" id="__uvd_restore__">Nhập</button>' +
          '<button class="uvd-btn uvd-btn-sm" id="__uvd_reset__" style="background:#ff5d72;border-color:#ff5d72;">Đặt lại</button>' +
        '</div>' +
      '</div>' +

      '<div class="uvd-card">' +
        '<div style="font-weight:600;margin-bottom:4px;">Bookmarklet code</div>' +
        '<div class="uvd-code-block"><textarea readonly rows="2">' + escapeHtml(bookmarkletCode) + '</textarea><button class="uvd-btn uvd-btn-sm" id="__uvd_copy_bm__" style="position:absolute;top:4px;right:4px;">Copy</button></div>' +
      '</div>';

    // toggle events
    container.querySelectorAll('.uvd-toggle input').forEach(function(cb) {
      cb.onchange = function() {
        var isOn = this.checked;
        switch (this.id) {
          case '__uvd_toggle_resume__': s.resumePlayback = isOn; break;
          case '__uvd_toggle_autofs__': s.autoFullscreen = isOn; break;
          case '__uvd_toggle_autonext__': s.autoNext = isOn; break;
          case '__uvd_toggle_datasaver__': s.dataSaver = isOn; break;
          case '__uvd_toggle_boost__': s.volumeBoost = isOn; break;
          case '__uvd_toggle_autohide__': s.autoHideControls = isOn; break;
          case '__uvd_toggle_blockautoplay__': s.blockAutoplay = isOn; break;
        }
        storage.set(data);
      };
    });

    document.getElementById('__uvd_set_speed__').onchange = function() {
      s.defaultSpeed = parseFloat(this.value);
      storage.set(data);
    };
    document.getElementById('__uvd_boost_range__').oninput = function() {
      s.volumeBoostMax = parseInt(this.value);
      document.getElementById('__uvd_boost_val__').textContent = s.volumeBoostMax + '%';
      storage.set(data);
    };
    document.getElementById('__uvd_doubletap_seconds__').onchange = function() {
      var val = parseInt(this.value) || 10;
      if (val < 1) val = 1; if (val > 60) val = 60;
      s.doubleTapSeconds = val;
      storage.set(data);
    };
    document.getElementById('__uvd_save_filter__').onclick = function() {
      var raw = document.getElementById('__uvd_filter_text__').value;
      data.filterlist = raw.split('\n').map(function(s) { return s.trim(); }).filter(Boolean);
      storage.set(data);
      compileAdFilters();
      toast('Đã lưu filterlist');
      buildUI();
    };
    document.getElementById('__uvd_import_filter__').onclick = function() {
      var inp = document.createElement('input'); inp.type='file'; inp.accept='.txt,.json';
      inp.onchange = function(e) {
        var reader = new FileReader();
        reader.onload = function(ev) {
          var text = ev.target.result;
          try { var j = JSON.parse(text); if (Array.isArray(j.filterlist)) text = j.filterlist.join('\n'); } catch(ex) {}
          document.getElementById('__uvd_filter_text__').value = text;
        };
        reader.readAsText(e.target.files[0]);
      };
      inp.click();
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
          catch(ex) { toast('File không hợp lệ','#ff5d72'); }
        };
        reader.readAsText(e.target.files[0]);
      };
      inp.click();
    };
    document.getElementById('__uvd_reset__').onclick = function() {
      if (confirm('Xóa toàn bộ dữ liệu?')) {
        localStorage.removeItem(STORAGE_KEY);
        data = { favorites: [], siteProfiles: {}, history: [], filterlist: [], playbackPositions: {}, clickedSelectors: [], blockedSelectors: [], settings: Object.assign({}, data.settings) };
        compileAdFilters();
        buildUI();
      }
    };
    document.getElementById('__uvd_copy_bm__').onclick = function() {
      copy(bookmarkletCode);
      toast('Đã sao chép code bookmarklet!');
    };
  }

  function toggleRow(id, label, checked) {
    return '<div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;border-bottom:1px solid var(--border);">' +
      '<span style="font-size:12px;color:var(--text2);">' + escapeHtml(label) + '</span>' +
      '<label class="uvd-toggle"><input type="checkbox" id="' + id + '"' + (checked ? ' checked' : '') + '><span class="slider"></span></label>' +
    '</div>';
  }

  // ========== PLAYER (Video.js v10) ==========
  function showVideoPlayer(url, type) {
    // Close existing overlay
    var oldOv = document.getElementById('__uvd_player_overlay__');
    if (oldOv) oldOv.remove();

    var overlay = document.createElement('div');
    overlay.id = '__uvd_player_overlay__';
    document.body.appendChild(overlay);

    // Header
    var header = document.createElement('div');
    header.id = '__uvd_player_header__';
    header.innerHTML =
      '<span class="title">▶ ' + escapeHtml(pageInfo.title) + ' (' + escapeHtml(type) + ')</span>' +
      '<div class="btns">' +
        '<button class="uvd-btn uvd-btn-sm" id="__uvd_player_close__">' + ICONS.close + '</button>' +
      '</div>';
    overlay.appendChild(header);

    // Video wrapper
    var wrapper = document.createElement('div');
    wrapper.id = '__uvd_video_wrapper__';
    overlay.appendChild(wrapper);

    // Footer
    var footer = document.createElement('div');
    footer.id = '__uvd_player_footer__';
    footer.innerHTML = '<span>Đang tải...</span><span id="__uvd_player_time__">00:00</span>';
    overlay.appendChild(footer);

    // Create video element
    var video = document.createElement('video');
    video.id = '__uvd_player_video__';
    video.setAttribute('playsinline', '');
    video.setAttribute('webkit-playsinline', '');
    video.setAttribute('crossorigin', 'anonymous');
    wrapper.appendChild(video);

    // Load Video.js v10
    if (typeof videojs === 'undefined') {
      var vjsScript = document.createElement('script');
      vjsScript.src = 'https://cdn.jsdelivr.net/npm/video.js@10/dist/video.min.js';
      vjsScript.onload = function() { initVideoJS(url, type, video, wrapper, footer); };
      document.head.appendChild(vjsScript);
      var vjsCss = document.createElement('link');
      vjsCss.rel = 'stylesheet';
      vjsCss.href = 'https://cdn.jsdelivr.net/npm/video.js@10/dist/video-js.min.css';
      document.head.appendChild(vjsCss);
    } else {
      initVideoJS(url, type, video, wrapper, footer);
    }

    document.getElementById('__uvd_player_close__').onclick = function() {
      overlay.remove();
    };
  }

  function initVideoJS(url, type, video, wrapper, footer) {
    // Set src
    if (type === 'M3U8' || type === 'MPD') {
      video.src = url;
      video.setAttribute('data-setup', '{"techOrder": ["html5"], "html5": { "nativeVideoTracks": false } }');
    } else {
      video.src = url;
    }

    var player = videojs(video, {
      controls: true,
      autoplay: false,
      fluid: true,
      techOrder: ['html5']
    });

    player.ready(function() {
      document.getElementById('__uvd_player_footer__').querySelector('span').textContent = 'Đang phát';
      // Update time
      player.on('timeupdate', function() {
        var time = player.currentTime();
        var dur = player.duration();
        if (dur) {
          var min = Math.floor(time / 60);
          var sec = Math.floor(time % 60);
          document.getElementById('__uvd_player_time__').textContent =
            (min < 10 ? '0' : '') + min + ':' + (sec < 10 ? '0' : '') + sec;
        }
      });
    });
  }

  // ========== UTILITIES ==========
  function copy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }

  function shareUrl(url) {
    if (navigator.share) { navigator.share({ title: pageInfo.title, url: url }).catch(function(){}); }
    else { toast('Thiết bị không hỗ trợ chia sẻ'); }
  }

  function showInlineIframe(url) {
    var old = document.getElementById('__uvd_inline_iframe_overlay__');
    if (old) old.remove();
    var ov = document.createElement('div');
    ov.id = '__uvd_inline_iframe_overlay__';
    ov.style.cssText = 'position:fixed;inset:0;z-index:2147483646;background:#000;display:flex;flex-direction:column;';
    var bar = document.createElement('div');
    bar.style.cssText = 'flex-shrink:0;padding:8px 12px;background:#111;display:flex;align-items:center;gap:8px;font-size:12px;color:#ddd;';
    bar.innerHTML = '<span style="flex:1;">Xem iframe tại chỗ</span><button class="uvd-btn uvd-btn-sm" id="__uvd_inline_close__">Đóng</button>';
    ov.appendChild(bar);
    var frame = document.createElement('iframe');
    frame.src = url;
    frame.style.cssText = 'flex:1;width:100%;border:none;background:#000;';
    frame.setAttribute('allow', 'autoplay; encrypted-media; picture-in-picture; fullscreen');
    frame.setAttribute('allowfullscreen', '');
    ov.appendChild(frame);
    __uvdAppendRoot(ov);
    document.getElementById('__uvd_inline_close__').onclick = function() { ov.remove(); };
  }

  function downloadBlobUrl(url) {
    toast('Đang tải blob...');
    fetch(url).then(function(res) { return res.blob(); }).then(function(blob) {
      if (!blob || blob.size === 0) { toast('Blob rỗng hoặc không tải được'); return; }
      var objUrl = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = objUrl;
      a.download = (pageInfo.title || 'video') + '.mp4';
      a.click();
      setTimeout(function() { URL.revokeObjectURL(objUrl); }, 10000);
      toast('Đã tải blob!');
    }).catch(function() { toast('Không tải được blob (có thể là stream)'); });
  }

  function showCommandPicker(url, type) {
    var cmds = {
      'yt-dlp': 'yt-dlp --referer "' + pageInfo.referer + '" -o "' + pageInfo.title + '.%(ext)s" "' + url + '"',
      'ffmpeg': 'ffmpeg -headers "Referer: ' + pageInfo.referer + '" -i "' + url + '" -c copy "' + pageInfo.title + '.mp4"',
      'curl': 'curl -H "Referer: ' + pageInfo.referer + '" -o "' + pageInfo.title + '.mp4" "' + url + '"'
    };
    var overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.8);z-index:2147483649;display:flex;align-items:center;justify-content:center;';
    var panel = document.createElement('div');
    panel.style.cssText = 'background:#1a1c26;padding:16px;border-radius:8px;max-width:500px;width:90%;';
    panel.innerHTML = '<div style="font-weight:bold;margin-bottom:8px;">Chọn lệnh tải</div>';
    Object.keys(cmds).forEach(function(name) {
      var btn = document.createElement('button');
      btn.className = 'uvd-btn uvd-btn-sm';
      btn.style.cssText = 'display:block;width:100%;margin:4px 0;';
      btn.textContent = name;
      btn.onclick = function() {
        overlay.remove();
        copy(cmds[name]);
        toast('Đã sao chép lệnh');
      };
      panel.appendChild(btn);
    });
    var closeBtn = document.createElement('button');
    closeBtn.className = 'uvd-btn uvd-btn-sm';
    closeBtn.textContent = 'Đóng';
    closeBtn.onclick = function() { overlay.remove(); };
    panel.appendChild(closeBtn);
    overlay.appendChild(panel);
    __uvdAppendRoot(overlay);
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

  // ========== INIT ==========
  scan(document, 'main');
  // Auto-run server scan after 5s
  setTimeout(function() {
    if (!document.getElementById('__uvd__')) {
      autoClickServersAndScan();
    }
  }, 5000);

  buildUI();
  toast('V' + VERSION + ' Minimal sẵn sàng!');
})();