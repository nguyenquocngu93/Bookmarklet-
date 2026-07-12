/**
Universal Media Player & Downloader - V5.10
Overlay player với toolbar
Chọn chất lượng, tốc độ, fullscreen, thu nhỏ
Giữ referer, hỗ trợ HLS
Tự động bấm nút Play cho các site lazy-load (eporner, JAV site...)
Chặn popup/tab lạ THÔNG MINH (chỉ chặn click giả, cho qua click thật của user)
Không tự play video ngoài ý muốn; tự pause video gốc sau khi lấy link
Hiển thị độ phân giải đúng khi đổi chất lượng + ước tính dung lượng video
Đồng bộ Favorites/History qua Jsonbin.io (multi-device)
Tự nhận diện và đánh dấu video quảng cáo
Author: nguyenquocngu91
*/
(function() {
'use strict';
// ========== INIT ==========
var VERSION = '5.10';
var old = document.getElementById('uvd');
if (old) old.remove();
var minBtn = document.getElementById('uvd_min_float');
if (minBtn) minBtn.remove();
var STORAGE_KEY = 'uvd_data_v54';
var SYNC_CONFIG_KEY = 'uvd_sync_config_v10';
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
var syncConfig = (function() {
  try { return JSON.parse(localStorage.getItem(SYNC_CONFIG_KEY)) || {}; }
  catch(e) { return {}; }
})();

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
  { re: /https?:\/\/[^\s"'<>()\]]+\.m3u8[^\s"'<>()\]]*/gi, type: 'M3U8', priority: 1 },
  { re: /https?:\/\/[^\s"'<>()\]]+\.mpd[^\s"'<>()\]]*/gi, type: 'MPD', priority: 2 },
  { re: /https?:\/\/[^\s"'<>()\]]+\.mp4[^\s"'<>()\]]*/gi, type: 'MP4', priority: 3 },
  { re: /https?:\/\/[^\s"'<>()\]]+\.webm[^\s"'<>()\]]*/gi, type: 'WEBM', priority: 4 },
  { re: /https?:\/\/[^\s"'<>()\]]+\.mkv[^\s"'<>()\]]*/gi, type: 'MKV', priority: 5 },
  { re: /https?:\/\/[^\s"'<>()\]]+\.flv[^\s"'<>()\]]*/gi, type: 'FLV', priority: 6 },
  { re: /https?:\/\/[^\s"'<>()\]]+\.ts[^\s"'<>()\]]*/gi, type: 'TS', priority: 7 },
  { re: /blob:https?:\/\/[^\s"'<>()\]]+/gi, type: 'BLOB', priority: 8 }
];

function findUrls(text, source) {
  if (!text || typeof text !== 'string') return;
  patterns.forEach(function(p) {
    var matches = text.match(p.re);
    if (matches) {
      matches.forEach(function(u) {
        u = u.replace(/\u002F/g, '/').replace(/&/g, '&').replace(/"/g, '');
        if (!urls.has(u) || urls.get(u).priority > p.priority) {
          urls.set(u, {
            type: p.type, source: source, priority: p.priority,
            timestamp: Date.now(), isAd: detectAd(u, null)
          });
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
      if (i.src) urls.set(i.src, {
        type: 'IFRAME', source: 'iframe#' + idx,
        priority: 99, timestamp: Date.now(),
        isAd: detectAd(i.src, i)
      });
      try { if (i.contentDocument) scan(i.contentDocument, 'iframe#' + idx); }
      catch(e) {}
    });
  } catch(e) {}
}

// ========== AD DETECTION ==========
var AD_URL_KEYWORDS = [
  'doubleclick', 'googlesyndication', 'googlevideo/ad', 'googleads',
  'adservice', 'adnxs', 'adsystem', 'advertising', 'ads.', '/ads/',
  'preroll', 'midroll', 'postroll', 'interstitial', 'sponsor',
  'promo.', 'promotion', 'adserver', 'adclick', 'adtech',
  'moatads', 'spotx', 'pubmatic', 'criteo', 'outbrain',
  'taboola', 'adcolony', 'inmobi', 'unityads', 'ironsource'
];
var AD_CONTAINER_PATTERNS = [
  'ad-container', 'ad-wrapper', 'ad-slot', 'ad-banner', 'ad-box',
  'advertisement', 'ads-player', 'sponsor', 'promo-video',
  'preroll', 'midroll', 'ad-frame', 'ad-overlay'
];

function detectAd(url, videoEl) {
  if (!url) return false;
  var lowerUrl = url.toLowerCase();
  for (var i = 0; i < AD_URL_KEYWORDS.length; i++) {
    if (lowerUrl.indexOf(AD_URL_KEYWORDS[i]) !== -1) return true;
  }
  if (videoEl) {
    var parent = videoEl.parentElement;
    var depth = 0;
    while (parent && parent !== document.body && depth < 8) {
      var cls = (' ' + (parent.className || '') + ' ').toLowerCase();
      var id = (' ' + (parent.id || '') + ' ').toLowerCase();
      for (var j = 0; j < AD_CONTAINER_PATTERNS.length; j++) {
        var pat = AD_CONTAINER_PATTERNS[j];
        if (cls.indexOf(' ' + pat) !== -1 || id.indexOf(' ' + pat) !== -1) {
          return true;
        }
      }
      parent = parent.parentElement;
      depth++;
    }
  }
  return false;
}

function recheckAdFlags() {
  urls.forEach(function(meta, url) {
    if (!meta.isAd) {
      meta.isAd = detectAd(url, null);
    }
  });
}

// ========== POPUP / NEW-TAB BLOCKER (THÔNG MINH) ==========
// Chỉ chặn click GIẢ từ JS (isTrusted=false), cho qua click THẬT của user.
// Điều này cho phép người dùng vẫn mở được iframe/link target="_blank"
// khi họ chủ động click, trong khi vẫn chặn popunder từ quảng cáo.
var __uvdPopupBlockActive = false;
var __uvdOriginalWindowOpen = null;
var __uvdBlockedCount = 0;

function killBlankLinks(e) {
  // Click thật từ người dùng luôn có isTrusted=true → cho qua
  if (e.isTrusted) return;
  var t = e.target;
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
  window.open = function() {
    // Cho qua nếu có dấu hiệu user gesture (dù hiếm khi xảy ra)
    __uvdBlockedCount++;
    return null;
  };
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

function blockPopupsDuring(durationMs, fn) {
  installPopupBlock();
  fn();
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
        ev = new MouseEvent(type, {
          bubbles: true, cancelable: true, view: window,
          clientX: x, clientY: y
        });
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
  var clicked = 0;
  AUTO_PLAY_SELECTORS.forEach(function(sel) {
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
  if (depth < 2) {
    try {
      root.querySelectorAll('iframe').forEach(function(f) {
        try { if (f.contentDocument) clicked += autoClickPlayButtons(f.contentDocument, depth + 1, allowVideoPlayFallback); }
        catch(e) {}
      });
    } catch(e) {}
  }
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
  uninstallPopupBlock();
}

scan(document, 'main');
try { performance.getEntriesByType('resource').forEach(function(e) { findUrls(e.name, 'network:perf'); }); } catch(e) {}
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
    recheckAdFlags();
    var afterCount = urls.size;
    var found = afterCount - beforeCount;
    if (found > 0) {
      toast('▶ Tự động Play: tìm thêm ' + found + ' luồng mới');
      if (document.getElementById('uvd')) buildUI();
      setTimeout(function() {
        var n = pauseAllPlayingVideos();
        if (n > 0) toast('⏸ Đã tạm dừng video gốc');
      }, 800);
    } else if (!silent) {
      toast(clicked > 0 ? 'Đã bấm Play nhưng chưa thấy link mới' : 'Không tìm thấy nút Play');
    }
  }, 1200);
}
window.__uvd_autoClickPlay = function() { runAutoClickAndRescan(false); };
setTimeout(function() { runAutoClickAndRescan(true); }, 400);

// ========== JSONBIN CLOUD SYNC ==========
var JsonbinSync = {
  API_BASE: 'https://api.jsonbin.io/v3/b',

  isEnabled: function() {
    return !!(syncConfig.apiKey && syncConfig.binId);
  },

  saveConfig: function() {
    try { localStorage.setItem(SYNC_CONFIG_KEY, JSON.stringify(syncConfig)); }
    catch(e) {}
  },

  // Tạo bin mới trên jsonbin
  createBin: function(apiKey, callback) {
    var payload = {
      favorites: data.favorites || [],
      history: data.history || [],
      siteProfiles: data.siteProfiles || {},
      lastSync: Date.now(),
      version: VERSION
    };
    fetch(this.API_BASE, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Master-Key': apiKey
      },
      body: JSON.stringify(payload)
    })
    .then(function(r) { return r.json(); })
    .then(function(res) {
      if (res && res.metadata && res.metadata.id) {
        callback(null, res.metadata.id);
      } else {
        callback(res && res.message ? res.message : 'Lỗi tạo bin');
      }
    })
    .catch(function(e) { callback(e.message || 'Lỗi mạng'); });
  },

  // Push local → cloud
  push: function() {
    if (!this.isEnabled()) return;
    var payload = {
      favorites: data.favorites || [],
      history: data.history || [],
      siteProfiles: data.siteProfiles || {},
      lastSync: Date.now(),
      version: VERSION
    };
    fetch(this.API_BASE + '/' + syncConfig.binId, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'X-Master-Key': syncConfig.apiKey
      },
      body: JSON.stringify(payload)
    })
    .then(function(r) { return r.json(); })
    .then(function(res) {
      if (res && res.message === 'Success') {
        syncConfig.lastSync = Date.now();
        JsonbinSync.saveConfig();
      }
    })
    .catch(function(e) { console.warn('[UMP DL] Sync push lỗi:', e); });
  },

  // Pull cloud → local (merge thông minh)
  pull: function(callback) {
    if (!this.isEnabled()) { if (callback) callback('Chưa cấu hình sync'); return; }
    var self = this;
    fetch(this.API_BASE + '/' + syncConfig.binId + '/latest', {
      headers: { 'X-Master-Key': syncConfig.apiKey }
    })
    .then(function(r) { return r.json(); })
    .then(function(res) {
      if (!res || !res.record) {
        if (callback) callback('Bin trống hoặc không tồn tại');
        return;
      }
      self.mergeFromCloud(res.record);
      if (callback) callback(null);
    })
    .catch(function(e) { if (callback) callback(e.message || 'Lỗi mạng'); });
  },

  // Merge 2 chiều: giữ item có timestamp mới hơn, dedup theo url
  mergeFromCloud: function(cloud) {
    var changed = false;

    // Merge favorites
    var favMap = {};
    (data.favorites || []).forEach(function(f) { favMap[f.url] = f; });
    (cloud.favorites || []).forEach(function(f) {
      if (!favMap[f.url] || (f.timestamp && f.timestamp > (favMap[f.url].timestamp || 0))) {
        favMap[f.url] = f;
        changed = true;
      }
    });
    data.favorites = Object.values(favMap);

    // Merge history
    var hisMap = {};
    (data.history || []).forEach(function(h) { hisMap[h.url + '|' + h.timestamp] = h; });
    (cloud.history || []).forEach(function(h) {
      var key = h.url + '|' + h.timestamp;
      if (!hisMap[key]) {
        hisMap[key] = h;
        changed = true;
      }
    });
    data.history = Object.values(hisMap)
      .sort(function(a, b) { return (b.timestamp || 0) - (a.timestamp || 0); })
      .slice(0, 100);

    // Merge siteProfiles
    data.siteProfiles = Object.assign({}, data.siteProfiles || {}, cloud.siteProfiles || {});

    if (changed) {
      storage.set(data);
    }
  },

  // Hook: gọi sau mỗi thao tác thay đổi fav/history
  schedulePush: (function() {
    var timer = null;
    return function() {
      if (!JsonbinSync.isEnabled()) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(function() {
        JsonbinSync.push();
        timer = null;
      }, 1500);
    };
  })()
};

// Pull từ cloud khi khởi động (nếu đã cấu hình)
if (JsonbinSync.isEnabled()) {
  JsonbinSync.pull(function(err) {
    if (!err) console.log('[UMP DL] Đã đồng bộ từ cloud');
  });
}

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
            qualities.push({
              label: qualityLabel, resolution: resolution,
              bandwidth: bandwidth, codecs: codecs, url: streamUrl
            });
          }
        }
      }
      qualities.sort(function(a, b) {
        return (parseInt(b.resolution.split('x')[1]) || 0) -
               (parseInt(a.resolution.split('x')[1]) || 0);
      });
      callback(qualities);
    })
    .catch(function(e) { console.error(e); callback(null); });
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
    'ffmpeg': { label: 'FFmpeg', cmd: 'ffmpeg -headers "Referer: ' + ref + '\r\nOrigin: ' + origin + '" -i "' + url + '" -c copy "' + t + '.mp4"' },
    'curl': { label: 'cURL', cmd: 'curl -H "Referer: ' + ref + '" -o "' + t + '.' + ext + '" "' + url + '"' }
  };
}

// ========== UTILS ==========
function copy(text) {
  var ta = document.createElement('textarea');
  ta.value = text;
  document.body.appendChild(ta);
  ta.select();
  document.execCommand('copy');
  ta.remove();
}

function toast(msg, color) {
  var el = document.createElement('div');
  el.textContent = msg;
  el.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);background:' + (color || '#3b82f6') + ';color:#fff;padding:12px 24px;border-radius:30px;z-index:2147483649;font:600 13px Segoe UI;box-shadow:0 4px 15px rgba(0,0,0,0.4);animation:uvdSlideIn 0.3s ease;max-width:90%;text-align:center;';
  document.body.appendChild(el);
  setTimeout(function() { el.remove(); }, 2500);
}

function shareUrl(url) {
  if (navigator.share) navigator.share({ title: pageInfo.title, url: url }).catch(function() { copy(url); toast('Đã sao chép'); });
  else { copy(url); toast('Đã sao chép'); }
}

function addToHistory(url, type) {
  data.history = data.history || [];
  data.history.unshift({
    url: url, type: type, title: pageInfo.title,
    host: pageInfo.host, timestamp: Date.now()
  });
  if (data.history.length > 100) data.history = data.history.slice(0, 100);
  storage.set(data);
  JsonbinSync.schedulePush();
}

function isFavorite(url) {
  return data.favorites.some(function(f) { return f.url === url; });
}

function toggleFavorite(url, type) {
  var idx = data.favorites.findIndex(function(f) { return f.url === url; });
  if (idx >= 0) {
    data.favorites.splice(idx, 1);
    toast('Đã xóa khỏi yêu thích');
  } else {
    data.favorites.unshift({
      url: url, type: type, title: pageInfo.title,
      host: pageInfo.host, timestamp: Date.now()
    });
    toast('Đã thêm vào yêu thích');
  }
  storage.set(data);
  JsonbinSync.schedulePush();
  return isFavorite(url);
}

function exportData(format) {
  var arr = [...urls.entries()].map(function(e) {
    return { url: e[0], type: e[1].type, source: e[1].source, title: pageInfo.title };
  });
  var content, mime, filename;
  if (format === 'json') {
    content = JSON.stringify({ page: pageInfo, streams: arr }, null, 2);
    mime = 'application/json'; filename = pageInfo.title + '_streams.json';
  } else if (format === 'csv') {
    content = 'Type,URL,Source,Title\n' + arr.map(function(a) {
      return a.type + ',"' + a.url + '",' + a.source + ',"' + a.title + '"';
    }).join('\n');
    mime = 'text/csv'; filename = pageInfo.title + '_streams.csv';
  } else if (format === 'm3u') {
    content = '#EXTM3U\n' + arr.filter(function(a) { return a.type !== 'IFRAME'; })
      .map(function(a) { return '#EXTINF:-1,' + a.title + ' [' + a.type + ']\n' + a.url; })
      .join('\n');
    mime = 'audio/x-mpegurl'; filename = pageInfo.title + '.m3u';
  } else {
    content = arr.map(function(a) { return a.url; }).join('\n');
    mime = 'text/plain'; filename = pageInfo.title + '_urls.txt';
  }
  var blob = new Blob([content], { type: mime });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
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
    if (screen.orientation && screen.orientation.lock) {
      screen.orientation.lock(target).catch(function(){});
    }
  } catch(e) {}
}

function unlockOrientation() {
  try {
    if (screen.orientation && screen.orientation.unlock) screen.orientation.unlock();
  } catch(e) {}
}

// ========== PLAYER STATE ==========
var playerState = {
  overlay: null, mini: null, video: null, hls: null,
  qualities: [], currentQuality: 0, speed: 1,
  isMinimized: false, url: '', type: '',
  resolution: '', bandwidth: 0,
  onFullscreenChange: null, menuOpen: false
};

// ========== OVERLAY PLAYER ==========
function showVideoPlayer(url, type) {
  if (playerState.overlay) closePlayer();
  playerState.url = url;
  playerState.type = type;
  pauseAllPlayingVideos();

  var overlay = document.createElement('div');
  overlay.id = 'uvd_player_overlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.95);z-index:2147483648;display:flex;flex-direction:column;animation:uvdFadeIn 0.3s ease;';
  document.body.appendChild(overlay);
  playerState.overlay = overlay;

  var header = document.createElement('div');
  header.style.cssText = 'padding:10px 16px;background:rgba(0,0,0,0.7);display:flex;flex-direction:column;flex-shrink:0;border-bottom:1px solid rgba(255,255,255,0.1);';

  var titleRow = document.createElement('div');
  titleRow.style.cssText = 'display:flex;align-items:center;justify-content:space-between;';
  var titleInfo = document.createElement('div');
  titleInfo.className = 'uvd-title-info';
  titleInfo.style.cssText = 'min-width:0;flex:1;';
  titleInfo.innerHTML =
    '<div style="font-weight:600;font-size:14px;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">▶ ' + pageInfo.title + '</div>' +
    '<div style="font-size:11px;color:#aaa;margin-top:2px;">' + type +
    (playerState.resolution ? ' · ' + playerState.resolution : '') + '</div>';
  titleRow.appendChild(titleInfo);

  var btnGroup = document.createElement('div');
  btnGroup.style.cssText = 'display:flex;gap:6px;flex-shrink:0;';
  var minVideoBtn = document.createElement('button');
  minVideoBtn.className = 'uvd-btn uvd-btn-sm uvd-ripple-btn';
  minVideoBtn.style.cssText = 'background:rgba(255,255,255,0.1);color:#fff;font-size:12px;';
  minVideoBtn.textContent = '⛶';
  minVideoBtn.onclick = function() { minimizePlayer(); };
  btnGroup.appendChild(minVideoBtn);
  var closeBtn = document.createElement('button');
  closeBtn.id = 'uvd_player_close';
  closeBtn.className = 'uvd-btn uvd-btn-sm uvd-ripple-btn';
  closeBtn.style.cssText = 'background:rgba(255,0,0,0.3);color:#fff;';
  closeBtn.textContent = '✕';
  btnGroup.appendChild(closeBtn);
  titleRow.appendChild(btnGroup);
  header.appendChild(titleRow);

  var toolbar = document.createElement('div');
  toolbar.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;margin-top:8px;';

  var qualityBtn = document.createElement('button');
  qualityBtn.className = 'uvd-btn uvd-btn-sm uvd-ripple-btn';
  qualityBtn.style.cssText = 'background:rgba(255,255,255,0.1);color:#fff;font-size:12px;';
  qualityBtn.textContent = 'Chất lượng';
  qualityBtn.onclick = function() {
    if (playerState.qualities.length > 0) showQualitySubMenu();
    else toast('Không có chất lượng để chọn');
  };
  toolbar.appendChild(qualityBtn);

  var speedBtn = document.createElement('button');
  speedBtn.className = 'uvd-btn uvd-btn-sm uvd-ripple-btn';
  speedBtn.style.cssText = 'background:rgba(255,255,255,0.1);color:#fff;font-size:12px;';
  speedBtn.textContent = 'Tốc độ';
  speedBtn.onclick = function() { showSpeedSubMenu(); };
  toolbar.appendChild(speedBtn);

  var fsBtn = document.createElement('button');
  fsBtn.className = 'uvd-btn uvd-btn-sm uvd-ripple-btn';
  fsBtn.style.cssText = 'background:rgba(255,255,255,0.1);color:#fff;font-size:12px;';
  fsBtn.textContent = 'Toàn màn hình';
  fsBtn.onclick = function() {
    var videoWrapper = document.getElementById('uvd_video_wrapper');
    var fs = videoWrapper.requestFullscreen || videoWrapper.webkitRequestFullscreen ||
             videoWrapper.mozRequestFullScreen || videoWrapper.msRequestFullscreen;
    if (fs) fs.call(videoWrapper);
  };
  toolbar.appendChild(fsBtn);

  if (type === 'MP4' || type === 'MKV' || type === 'WEBM') {
    var downloadBtn = document.createElement('button');
    downloadBtn.className = 'uvd-btn uvd-btn-sm uvd-ripple-btn';
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
    shareBtn.className = 'uvd-btn uvd-btn-sm uvd-ripple-btn';
    shareBtn.style.cssText = 'background:rgba(139,92,246,0.3);color:#fff;font-size:12px;';
    shareBtn.textContent = 'Chia sẻ';
    shareBtn.onclick = function() { shareUrl(url); };
    toolbar.appendChild(shareBtn);
  }

  header.appendChild(toolbar);
  overlay.appendChild(header);

  var videoWrapper = document.createElement('div');
  videoWrapper.id = 'uvd_video_wrapper';
  videoWrapper.style.cssText = 'flex:1;display:flex;align-items:center;justify-content:center;background:#000;position:relative;';
  var video = document.createElement('video');
  video.id = 'uvd_player_video';
  video.style.cssText = 'width:100%;height:100%;display:block;object-fit:contain;';
  video.setAttribute('controls', '');
  video.setAttribute('playsinline', '');
  video.setAttribute('webkit-playsinline', '');
  video.setAttribute('crossorigin', 'anonymous');
  videoWrapper.appendChild(video);
  overlay.appendChild(videoWrapper);
  playerState.video = video;

  var footer = document.createElement('div');
  footer.style.cssText = 'padding:8px 16px;background:rgba(0,0,0,0.7);border-top:1px solid rgba(255,255,255,0.1);font-size:12px;color:#aaa;display:flex;justify-content:space-between;flex-shrink:0;';
  footer.innerHTML = '<span id="__uvd_player_status__">Đang tải...</span>' +
    '<span id="__uvd_player_size__" style="color:#8ab4ff;">Đang ước tính...</span>' +
    '<span id="__uvd_player_time__"></span>';
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
    var closeBtn2 = document.createElement('button');
    closeBtn2.textContent = 'Đóng';
    closeBtn2.style.cssText = 'width:100%;margin-top:12px;padding:10px;background:rgba(255,0,0,0.3);color:#fff;border:0;border-radius:8px;font-weight:600;';
    closeBtn2.onclick = function() { overlay2.remove(); };
    panel.appendChild(closeBtn2);
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
    var closeBtn2 = document.createElement('button');
    closeBtn2.textContent = 'Đóng';
    closeBtn2.style.cssText = 'width:100%;margin-top:12px;padding:10px;background:rgba(255,0,0,0.3);color:#fff;border:0;border-radius:8px;font-weight:600;';
    closeBtn2.onclick = function() { overlay2.remove(); };
    panel.appendChild(closeBtn2);
    overlay2.appendChild(panel);
    document.body.appendChild(overlay2);
  }

  var isHls = url.includes('.m3u8') || url.includes('m3u8');
  var activeHls = null;

  function updateTitleDisplay() {
    var infoDiv = document.querySelector('#uvd_player_overlay .uvd-title-info');
    if (!infoDiv) return;
    var sub = playerState.type + (playerState.resolution ? ' · ' + playerState.resolution : '');
    infoDiv.innerHTML =
      '<div style="font-weight:600;font-size:14px;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">▶ ' + pageInfo.title + '</div>' +
      '<div style="font-size:11px;color:#aaa;margin-top:2px;">' + sub + '</div>';
  }

  function formatBytes(bytes) {
    if (!bytes || bytes <= 0) return null;
    var units = ['B', 'KB', 'MB', 'GB'];
    var i = 0;
    while (bytes >= 1024 && i < units.length - 1) { bytes /= 1024; i++; }
    return bytes.toFixed(i === 0 ? 0 : 1) + ' ' + units[i];
  }

  function updateSizeEstimate() {
    var el = document.getElementById('uvd_player_size');
    if (!el) return;
    if (isHls) {
      var bwBits = playerState.bandwidth;
      if (!bwBits && playerState.qualities.length) bwBits = playerState.qualities[0].bandwidth;
      if (bwBits && video.duration) {
        var bytes = (bwBits / 8) * video.duration;
        var s = formatBytes(bytes);
        el.textContent = s ? '≈ ' + s : 'Không rõ';
      } else {
        el.textContent = 'Đang ước tính...';
      }
    } else {
      el.textContent = 'Đang kiểm tra...';
      fetch(url, { method: 'HEAD', headers: { 'Referer': pageInfo.referer } })
        .then(function(r) {
          var len = r.headers.get('content-length');
          var s = len ? formatBytes(parseInt(len)) : null;
          el.textContent = s ? '≈ ' + s : 'Không rõ';
        })
        .catch(function() { el.textContent = 'Không rõ'; });
    }
  }

  function onMetadataLoaded() {
    lockOrientation(video);
    document.getElementById('uvd_player_status').textContent = 'Đang phát';
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
    if (d) {
      document.getElementById('uvd_player_time').textContent = formatTime(t) + ' / ' + formatTime(d);
    }
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
        var lvl = activeHls.levels && activeHls.levels[data.level];
        if (lvl) {
          playerState.resolution = lvl.width + 'x' + lvl.height;
          playerState.bandwidth = lvl.bitrate;
          updateTitleDisplay();
          updateSizeEstimate();
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
  } else {
    video.src = url;
  }

  document.getElementById('uvd_player_close').addEventListener('click', addRipple);
  document.getElementById('uvd_player_close').onclick = function() {
    closePlayer();
    var sl = document.getElementById('uvd_stream_list');
    if (sl) sl.style.display = 'block';
  };

  function onFullscreenChange() {
    var isFullscreen = !!(document.fullscreenElement || document.webkitFullscreenElement ||
                          document.mozFullScreenElement || document.msFullscreenElement);
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
  mini.id = 'uvd_player_mini';
  mini.style.cssText = 'position:fixed;bottom:20px;right:20px;width:160px;height:90px;background:#000;border-radius:12px;z-index:2147483647;cursor:pointer;box-shadow:0 8px 30px rgba(0,0,0,0.8);border:2px solid rgba(255,255,255,0.2);overflow:hidden;';
  var canvas = document.createElement('canvas');
  canvas.width = 160; canvas.height = 90;
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
  mini.onclick = function() { restorePlayer(); };
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
  if (playerState.video) playerState.video.play().catch(function(){});
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
if (document.getElementById('uvd_css')) document.getElementById('uvd_css').remove();
var style = document.createElement('style');
style.id = 'uvd_css';
style.textContent = `
@keyframes uvdSlideIn{from{transform:translate(-50%,-20px);opacity:0}to{transform:translate(-50%,0);opacity:1}}
@keyframes uvdPulse{0%,100%{opacity:1;box-shadow:0 0 5px var(--accent)}50%{opacity:0.4;box-shadow:0 0 20px var(--accent)}}
@keyframes uvdScaleIn{from{opacity:0;transform:scale(0.94)}to{opacity:1;transform:scale(1)}}
@keyframes uvdRipple{to{transform:scale(4);opacity:0}}
@keyframes uvdCardEnter{from{opacity:0;transform:translateY(15px)}to{opacity:1;transform:translateY(0)}}
@keyframes uvdFloatBtnIn{from{transform:scale(0);opacity:0}to{transform:scale(1);opacity:1}}
@keyframes uvdLiquidDrift {
  0% { transform: translate(-6%, -4%) scale(1); }
  50% { transform: translate(4%, 6%) scale(1.12); }
  100% { transform: translate(-6%, -4%) scale(1); }
}
@keyframes uvdFadeIn{from{opacity:0}to{opacity:1}}
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
  max-width:1000px; margin:auto;
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
  transform:translateY(-1px);
}
.uvd-btn:active { transform:scale(0.96); }
.uvd-btn-sm {
  padding: 7px 12px;
  font-size: var(--fs-sm);
  border-radius: var(--radius-sm);
}
.uvd-btn-icon {
  background:var(--glass-hi); border:1px solid var(--border);
  color:var(--text); width:34px; height:34px; border-radius:var(--radius-sm);
  cursor:pointer; display:inline-flex; align-items:center; justify-content:center;
  transition: all 0.2s; backdrop-filter:blur(10px); position:relative; overflow:hidden;
}
.uvd-btn-icon:hover { background:rgba(255,255,255,0.10); }
.uvd-btn-icon:active { transform:scale(0.92); }
.uvd-card {
  background:var(--card-bg); border:1px solid var(--border);
  border-radius:var(--radius-md); padding:14px; margin-bottom:10px;
  font-size:var(--fs-base); backdrop-filter:blur(6px);
  transition: transform 0.3s cubic-bezier(.4,0,.2,1), box-shadow 0.3s ease, background 0.3s ease, border-color 0.3s ease;
  animation:uvdCardEnter 0.4s ease both;
}
.uvd-card:hover {
  transform:translateY(-3px);
  box-shadow:0 14px 30px rgba(0,0,0,0.7), 0 0 0 1px rgba(109,140,255,0.30) inset;
  background:rgba(255,255,255,0.05);
  border-color:rgba(109,140,255,0.25);
}
.uvd-card.uvd-card-ad {
  border-color:rgba(255,93,114,0.4);
  background:rgba(255,93,114,0.06);
}
.uvd-card.uvd-card-ad:hover {
  border-color:rgba(255,93,114,0.6);
  box-shadow:0 14px 30px rgba(255,93,114,0.2);
}
.uvd-type-badge {
  display:inline-block; padding:4px 12px; border-radius:var(--radius-sm);
  font-size:var(--fs-xs); font-weight:700;
  background:linear-gradient(135deg, rgba(109,140,255,0.22), rgba(185,139,255,0.18));
  color:var(--accent); border:1px solid rgba(109,140,255,0.28);
  letter-spacing:0.03em;
}
.uvd-type-badge-ad {
  background:linear-gradient(135deg, rgba(255,93,114,0.3), rgba(255,140,93,0.2));
  color:var(--danger); border-color:rgba(255,93,114,0.5);
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
  border-radius:999px; margin-bottom:10px; flex-shrink:0;
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
#uvd_min_float {
  position:fixed; bottom:20px; right:20px; width:54px; height:54px;
  border-radius:50%; background:var(--grad-liquid); color:#fff;
  border:1px solid rgba(255,255,255,0.25); box-shadow:0 8px 22px rgba(0,0,0,0.6);
  z-index:2147483647; cursor:pointer; display:flex; align-items:center;
  justify-content:center; font-weight:700; font-size:var(--fs-lg);
  transition: transform 0.3s; animation:uvdFloatBtnIn 0.3s ease;
}
#uvd_min_float:hover { transform:scale(1.1); }
.uvd-ripple {
  position:absolute; border-radius:50%; background:rgba(255,255,255,0.5);
  transform:scale(0); animation:uvdRipple 0.6s ease-out;
}
.uvd-profile-card {
  display:flex; align-items:center; gap:14px;
  background:linear-gradient(135deg, rgba(109,140,255,0.14), rgba(185,139,255,0.08));
  border:1px solid rgba(109,140,255,0.25); border-radius:var(--radius-lg);
  padding:16px; margin-bottom:10px; animation:uvdCardEnter 0.4s ease both;
}
.uvd-profile-avatar {
  flex-shrink:0; width:56px; height:56px; border-radius:50%;
  background:var(--grad-liquid); color:#fff; font-weight:700; font-size:18px;
  display:flex; align-items:center; justify-content:center;
}
.uvd-profile-info { min-width:0; }
.uvd-profile-name { font-weight:700; font-size:15px; color:var(--text); }
.uvd-profile-role { font-size:11.5px; color:var(--text2); margin-top:2px; }
.uvd-profile-tags { display:flex; flex-wrap:wrap; gap:5px; margin-top:8px; }
.uvd-tag {
  font-size:10px; font-weight:600; padding:3px 9px; border-radius:999px;
  background:rgba(255,255,255,0.08); border:1px solid var(--border); color:var(--text2);
}
.uvd-profile-stats {
  display:grid; grid-template-columns:repeat(3,1fr); gap:8px; margin-bottom:14px;
}
.uvd-stat {
  background:var(--card-bg); border:1px solid var(--border); border-radius:var(--radius-md);
  padding:10px 6px; text-align:center;
}
.uvd-stat-num { font-size:18px; font-weight:700; color:var(--accent); }
.uvd-stat-label { font-size:10px; color:var(--text3); margin-top:2px; }
.uvd-section-title {
  display:flex; align-items:center; gap:8px; font-weight:700; font-size:13px;
  color:var(--text); margin:16px 0 8px;
}
.uvd-section-num {
  width:20px; height:20px; border-radius:50%; background:var(--grad-liquid);
  color:#fff; font-size:11px; display:inline-flex; align-items:center; justify-content:center;
  flex-shrink:0;
}
.uvd-timeline-card { border-left:2px solid rgba(109,140,255,0.3); }
.uvd-inline-code {
  display:inline-block; background:rgba(0,0,0,0.35); padding:3px 9px; border-radius:6px;
  color:var(--accent2); font-family:'SFMono-Regular',Consolas,monospace; font-size:11px;
  border:1px solid rgba(255,255,255,0.06); margin:2px 0;
}
.uvd-profile-footer {
  text-align:center; font-size:11px; color:var(--text3); margin-top:14px; padding-top:12px;
  border-top:1px solid var(--border);
}
.uvd-sync-status {
  display:inline-block; padding:3px 10px; border-radius:999px;
  font-size:10px; font-weight:600; margin-left:6px;
}
.uvd-sync-on { background:rgba(34,197,94,0.2); color:#22c55e; border:1px solid rgba(34,197,94,0.4); }
.uvd-sync-off { background:rgba(255,93,114,0.2); color:var(--danger); border:1px solid rgba(255,93,114,0.4); }
.uvd-input {
  width:100%; padding:10px; background:rgba(0,0,0,0.4);
  border:1px solid var(--border); border-radius:8px;
  color:var(--text); font-size:12px; font-family:monospace;
  margin-bottom:8px;
}
.uvd-input:focus { outline:none; border-color:var(--accent); }
`;
document.head.appendChild(style);

// ========== BUILD UI ==========
var hideAds = false;

function buildUI() {
  var arr = [...urls.entries()].map(function(e) {
    return {
      url: e[0], type: e[1].type, source: e[1].source,
      priority: e[1].priority, isAd: !!e[1].isAd
    };
  }).sort(function(a, b) {
    if (a.isAd !== b.isAd) return a.isAd ? 1 : -1;
    return a.priority - b.priority;
  });

  var panel = document.getElementById('uvd');
  if (panel) panel.remove();
  panel = document.createElement('div');
  panel.id = 'uvd';
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
  var syncBadge = JsonbinSync.isEnabled()
    ? '<span class="uvd-sync-status uvd-sync-on">☁ Sync ON</span>'
    : '<span class="uvd-sync-status uvd-sync-off">☁ Sync OFF</span>';
  header.innerHTML =
    '<div style="display:flex;align-items:center;gap:8px;">' +
      '<span style="width:10px;height:10px;background:var(--grad-liquid);border-radius:50%;animation:uvdPulse 2s infinite;"></span>' +
      '<span style="font-weight:700;font-size:16px;">UMP DL <span style="background:var(--grad-liquid);-webkit-background-clip:text;background-clip:text;color:transparent;">V' + VERSION + '</span></span>' +
      syncBadge +
    '</div>' +
    '<div style="display:flex;gap:6px;">' +
      '<button class="uvd-btn-icon uvd-ripple-btn" id="__uvd_autoplay__" title="Tự động bấm Play"><span style="font-size:15px;">▶</span></button>' +
      '<button class="uvd-btn-icon uvd-ripple-btn" id="__uvd_minimize__" title="Thu nhỏ"><span style="font-size:18px;">−</span></button>' +
      '<button class="uvd-btn-icon uvd-ripple-btn" id="__uvd_refresh__" title="Làm mới"><span style="font-size:16px;">↻</span></button>' +
      '<button class="uvd-btn-icon uvd-ripple-btn" id="__uvd_close__" title="Đóng"><span style="font-size:16px;">×</span></button>' +
    '</div>';
  content.appendChild(header);

  var tabbar = document.createElement('div');
  tabbar.className = 'uvd-tabbar';
  var indicator = document.createElement('div');
  indicator.className = 'uvd-tab-indicator';
  indicator.id = 'uvd_tab_indicator';
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
    '<span id="__uvd_title__" style="color:var(--accent);text-decoration:underline;cursor:pointer;">' + pageInfo.title + '</span>' +
    '<span style="color:var(--text3);"> (sửa)</span><br>' +
    '<span style="color:var(--text2);">Referer: </span>' +
    '<span id="__uvd_referer__" style="color:var(--accent2);font-family:monospace;text-decoration:underline;cursor:pointer;font-size:11px;">' + pageInfo.referer + '</span><br>' +
    '<span style="color:var(--text2);">Play selector: </span>' +
    '<span id="__uvd_playsel__" style="color:var(--accent2);font-family:monospace;text-decoration:underline;cursor:pointer;font-size:11px;">' + (savedPlaySel || '(chưa đặt · bấm để thêm)') + '</span>';
  content.appendChild(info);

  var contentWrapper = document.createElement('div');
  contentWrapper.className = 'uvd-scroll';
  contentWrapper.style.cssText = 'flex:1;overflow:hidden;position:relative;min-height:0;';
  var streamList = document.createElement('div');
  streamList.id = 'uvd_stream_list';
  streamList.className = 'uvd-scroll';
  streamList.style.cssText = 'overflow-y:auto;height:100%;padding-right:4px;';
  contentWrapper.appendChild(streamList);
  content.appendChild(contentWrapper);

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

  var author = document.createElement('div');
  author.style.cssText = 'text-align:center;font-size:11px;color:var(--text3);margin-top:8px;flex-shrink:0;';
  author.textContent = '© nguyenquocngu91';
  content.appendChild(author);

  document.body.appendChild(panel);

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

  document.getElementById('uvd_close').onclick = function() { stopMonitor(); panel.remove(); };
  document.getElementById('uvd_refresh').onclick = function() { buildUI(); toast('Đã làm mới'); };
  document.getElementById('uvd_autoplay').onclick = function() {
    toast('▶ Đang thử bấm Play...');
    window.__uvd_autoClickPlay();
  };

  document.getElementById('uvd_title').onclick = function() {
    var newTitle = prompt('Tên file:', pageInfo.title);
    if (newTitle) {
      pageInfo.title = newTitle.replace(/[^\w\s\u00C0-\u1EF9.-]/g, '').substring(0,100);
      this.textContent = pageInfo.title;
    }
  };
  document.getElementById('uvd_referer').onclick = function() {
    var newRef = prompt('Referer:', pageInfo.referer);
    if (newRef) {
      pageInfo.referer = newRef;
      this.textContent = newRef;
      data.siteProfiles[pageInfo.host] = Object.assign({}, data.siteProfiles[pageInfo.host], { referer: newRef, userAgent: pageInfo.userAgent });
      storage.set(data);
      JsonbinSync.schedulePush();
      toast('Đã lưu referer');
    }
  };
  document.getElementById('uvd_playsel').onclick = function() {
    var current = (data.siteProfiles[pageInfo.host] && data.siteProfiles[pageInfo.host].playSelector) || '';
    var newSel = prompt('CSS selector của nút Play:', current);
    if (newSel !== null) {
      newSel = newSel.trim();
      data.siteProfiles[pageInfo.host] = Object.assign({}, data.siteProfiles[pageInfo.host], { playSelector: newSel });
      storage.set(data);
      JsonbinSync.schedulePush();
      this.textContent = newSel || '(chưa đặt)';
      if (newSel) {
        toast('Đã lưu selector');
        autoClickPlayButtons(document, 0, false);
        setTimeout(function() { buildUI(); }, 1000);
      }
    }
  };

  document.getElementById('uvd_minimize').onclick = function() {
    var panelEl = document.getElementById('uvd');
    var liquidBgEl = panelEl.querySelector('.uvd-liquid-bg');
    if (liquidBgEl) liquidBgEl.style.animationPlayState = 'paused';
    panelEl.style.transition = 'opacity 0.22s ease';
    panelEl.style.opacity = '0';
    setTimeout(function() {
      panelEl.style.display = 'none';
      var floatBtn = document.getElementById('__uvd_min_float__');
      if (!floatBtn) {
        floatBtn = document.createElement('button');
        floatBtn.id = '__uvd_min_float__';
        floatBtn.textContent = 'U';
        floatBtn.title = 'Khôi phục UMP DL';
        floatBtn.style.cssText = 'position:fixed;bottom:20px;right:20px;width:54px;height:54px;border-radius:50%;background:var(--grad-liquid);color:#fff;border:1px solid rgba(255,255,255,0.25);box-shadow:0 8px 22px rgba(0,0,0,0.6);z-index:2147483647;cursor:pointer;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:16px;animation:uvdFloatBtnIn 0.3s ease;';
        floatBtn.onclick = function() {
          panelEl.style.display = 'flex';
          if (liquidBgEl) liquidBgEl.style.animationPlayState = 'running';
          panelEl.style.transition = 'opacity 0.22s ease';
          panelEl.style.opacity = '1';
          floatBtn.remove();
        };
        document.body.appendChild(floatBtn);
      }
    }, 230);
  };

  window.__uvd_showPlayer = function(url, type) {
    showVideoPlayer(url, type);
  };
}

// ========== RENDER STREAMS ==========
function renderStreams(container, arr) {
  var visibleArr = hideAds ? arr.filter(function(it) { return !it.isAd; }) : arr;
  var adCount = arr.filter(function(it) { return it.isAd; }).length;

  if (!visibleArr.length) {
    container.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text2);">' +
      (hideAds && adCount > 0 ? 'Đã ẩn ' + adCount + ' quảng cáo. Bấm "Hiện QC" để xem lại.' : 'Không phát hiện stream nào.') +
      '</div>';
    return;
  }

  // Filter toggle
  var filterBar = document.createElement('div');
  filterBar.style.cssText = 'display:flex;gap:6px;margin-bottom:10px;align-items:center;flex-wrap:wrap;';
  filterBar.innerHTML =
    '<button class="uvd-btn uvd-btn-sm uvd-ripple-btn" id="__uvd_toggle_ads__" style="' +
      (hideAds ? 'background:rgba(255,93,114,0.2);color:var(--danger);' : 'background:rgba(255,255,255,0.08);') + '">' +
      (hideAds ? '👁 Hiện QC (' + adCount + ')' : '🚫 Ẩn QC (' + adCount + ')') +
    '</button>' +
    '<span style="font-size:11px;color:var(--text3);">Phát hiện ' + arr.length + ' luồng, ' + adCount + ' quảng cáo</span>';
  container.appendChild(filterBar);

  visibleArr.forEach(function(item, i) {
    var card = document.createElement('div');
    card.className = 'uvd-card' + (item.isAd ? ' uvd-card-ad' : '');
    var fav = isFavorite(item.url);
    var adBadge = item.isAd ? '<span class="uvd-type-badge uvd-type-badge-ad" style="margin-left:6px;">🚫 QC</span>' : '';
    card.innerHTML =
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">' +
        '<span class="uvd-type-badge">#' + (i+1) + ' ' + item.type + adBadge + '</span>' +
        '<button class="uvd-fav-btn uvd-ripple-btn" data-url="' + encodeURIComponent(item.url) + '" data-type="' + item.type + '" style="background:none;border:none;font-size:18px;cursor:pointer;color:' + (fav ? 'var(--gold)' : 'var(--text3)') + ';">' + (fav ? '★' : '☆') + '</button>' +
      '</div>' +
      '<div class="uvd-url-box">' + item.url + '</div>' +
      '<div class="uvd-grid-2" style="margin-top:8px;">' +
        '<button class="uvd-btn uvd-btn-sm uvd-ripple-btn" data-action="share" data-url="' + encodeURIComponent(item.url) + '" style="background:rgba(139,92,246,0.2);">Chia sẻ</button>' +
        '<button class="uvd-btn uvd-btn-sm uvd-ripple-btn" data-action="copy" data-url="' + encodeURIComponent(item.url) + '">Sao chép</button>' +
        (item.type === 'IFRAME' ?
          '<a href="' + item.url + '" class="uvd-btn uvd-btn-sm uvd-ripple-btn" style="text-align:center;grid-column:1/3;text-decoration:none;" target="_blank">Mở iframe</a>' :
          (item.type === 'M3U8' ?
            '<button class="uvd-btn uvd-btn-sm uvd-ripple-btn" data-action="quality" data-url="' + encodeURIComponent(item.url) + '">Chất lượng</button>' +
            '<button class="uvd-btn uvd-btn-sm uvd-ripple-btn" data-action="play" data-url="' + encodeURIComponent(item.url) + '" data-type="' + item.type + '" style="background:rgba(109,140,255,0.25);">Xem</button>' +
            '<button class="uvd-btn uvd-btn-sm uvd-ripple-btn" data-action="cmd" data-url="' + encodeURIComponent(item.url) + '" data-type="' + item.type + '" style="grid-column:1/3;">Lệnh tải</button>' :
            '<button class="uvd-btn uvd-btn-sm uvd-ripple-btn" data-action="play" data-url="' + encodeURIComponent(item.url) + '" data-type="' + item.type + '" style="background:rgba(109,140,255,0.25);">Xem</button>' +
            '<button class="uvd-btn uvd-btn-sm uvd-ripple-btn" data-action="cmd" data-url="' + encodeURIComponent(item.url) + '" data-type="' + item.type + '">Lệnh tải</button>'
          )
        ) +
      '</div>';
    container.appendChild(card);
  });

  container.querySelectorAll('.uvd-btn, .uvd-fav-btn').forEach(function(b) {
    b.addEventListener('click', addRipple);
  });

  var toggleBtn = document.getElementById('uvd_toggle_ads');
  if (toggleBtn) {
    toggleBtn.onclick = function() {
      hideAds = !hideAds;
      buildUI();
    };
  }

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
  document.getElementById('uvd_ed_copy').onclick = function() {
    copy(overlay.querySelector('textarea').value);
    overlay.remove();
    toast('Đã sao chép!');
  };
  document.getElementById('uvd_ed_share').onclick = function() {
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
        '</div></div>';
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
      '<div style="display:flex;justify-content:space-between;"><b style="color:var(--gold);">★ ' + f.type + '</b><span style="font-size:11px;color:var(--text3);">' + new Date(f.timestamp).toLocaleDateString() + '</span></div>' +
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
      JsonbinSync.schedulePush();
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
  document.getElementById('uvd_clear_hist').addEventListener('click', addRipple);
  document.getElementById('uvd_clear_hist').onclick = function() {
    if (confirm('Xóa toàn bộ lịch sử?')) {
      data.history = [];
      storage.set(data);
      JsonbinSync.schedulePush();
      renderHistory(container);
    }
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

// ========== SETTINGS (có section Sync) ==========
function renderSettings(container) {
  var totalStreams = urls.size;
  var adCount = 0;
  urls.forEach(function(m) { if (m.isAd) adCount++; });

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
          '<span class="uvd-tag">☁ Jsonbin Sync</span>' +
        '</div>' +
      '</div>' +
    '</div>' +
    '<div class="uvd-profile-stats" style="grid-template-columns:repeat(4,1fr);">' +
      '<div class="uvd-stat"><div class="uvd-stat-num">' + totalStreams + '</div><div class="uvd-stat-label">Streams</div></div>' +
      '<div class="uvd-stat"><div class="uvd-stat-num">' + data.favorites.length + '</div><div class="uvd-stat-label">Yêu thích</div></div>' +
      '<div class="uvd-stat"><div class="uvd-stat-num">' + (data.history||[]).length + '</div><div class="uvd-stat-label">Lịch sử</div></div>' +
      '<div class="uvd-stat"><div class="uvd-stat-num" style="color:var(--danger);">' + adCount + '</div><div class="uvd-stat-label">Đã phát hiện QC</div></div>' +
    '</div>' +

    // ===== SECTION: ĐỒNG BỘ ĐÁM MÂY =====
    '<div class="uvd-section-title"><span class="uvd-section-num">☁</span> Đồng bộ đám mây (Jsonbin.io)</div>' +
    '<div class="uvd-card uvd-timeline-card">' +
      '<div style="font-size:12px;color:var(--text2);line-height:1.7;margin-bottom:10px;">' +
        'Đồng bộ <b style="color:var(--accent);">Yêu thích</b> và <b style="color:var(--accent);">Lịch sử</b> giữa nhiều thiết bị. ' +
        'Đăng ký miễn phí tại <span style="color:var(--accent2);">jsonbin.io</span> → lấy API Key từ Dashboard.' +
      '</div>' +
      '<label style="font-size:11px;color:var(--text3);display:block;margin-bottom:4px;">API Key (X-Master-Key):</label>' +
      '<input class="uvd-input" id="__uvd_sync_apikey__" type="password" placeholder="$2a$10$xxxxx..." value="' + (syncConfig.apiKey || '') + '">' +
      '<label style="font-size:11px;color:var(--text3);display:block;margin-bottom:4px;">Bin ID:</label>' +
      '<input class="uvd-input" id="__uvd_sync_binid__" placeholder="Để trống nếu muốn tạo bin mới" value="' + (syncConfig.binId || '') + '">' +
      '<div class="uvd-grid-2" style="margin-top:8px;">' +
        '<button class="uvd-btn uvd-btn-sm" id="__uvd_sync_save__" style="background:rgba(34,197,94,0.25);">💾 Lưu & Tạo bin mới</button>' +
        '<button class="uvd-btn uvd-btn-sm" id="__uvd_sync_pull__" style="background:rgba(109,140,255,0.25);">⬇ Pull từ cloud</button>' +
        '<button class="uvd-btn uvd-btn-sm" id="__uvd_sync_push__" style="background:rgba(139,92,246,0.25);">⬆ Push lên cloud</button>' +
        '<button class="uvd-btn uvd-btn-sm" id="__uvd_sync_clear__" style="background:var(--danger);">✕ Ngắt đồng bộ</button>' +
      '</div>' +
      '<div id="__uvd_sync_status__" style="margin-top:10px;font-size:11px;color:var(--text3);"></div>' +
    '</div>' +

    // ===== SECTION: SAO LƯU =====
    '<div class="uvd-card">' +
      '<div style="font-weight:600;margin-bottom:8px;">Sao lưu cục bộ</div>' +
      '<button class="uvd-btn uvd-btn-sm" id="__uvd_backup__" style="width:100%;margin-bottom:6px;">Xuất dữ liệu (JSON)</button>' +
      '<button class="uvd-btn uvd-btn-sm" id="__uvd_restore__" style="width:100%;margin-bottom:6px;">Nhập dữ liệu</button>' +
      '<button class="uvd-btn uvd-btn-sm" id="__uvd_reset__" style="width:100%;background:var(--danger);">Đặt lại tất cả</button>' +
    '</div>' +

    '<div class="uvd-section-title"><span class="uvd-section-num">1</span> Cài đặt Bookmarklet</div>' +
    '<div class="uvd-card uvd-timeline-card">' +
      '<div class="uvd-url-box" style="font-size:10px;">javascript:(function(){var s=document.createElement(\'script\');s.src=\'https://cdn.jsdelivr.net/gh/nguyenquocngu93/bookmarklet-@main/umpdl.js?force=\'+Date.now();document.head.appendChild(s);})();</div>' +
      '<div style="font-size:12px;color:var(--text3);line-height:1.7;margin-top:10px;">' +
        '<strong style="color:var(--text2);">Cách cài trên Chrome Android:</strong><br>' +
        '➊ Copy code trên → ➋ Mở trang bất kỳ → ➌ Dán vào URL bar → ➍ Bookmark lại → ➎ Bấm bookmark mỗi khi cần dùng.' +
      '</div>' +
    '</div>' +

    '<div class="uvd-section-title"><span class="uvd-section-num">2</span> Sử dụng</div>' +
    '<div class="uvd-card uvd-timeline-card">' +
      '<div style="font-size:13px;color:var(--text2);line-height:1.7;">' +
        '• Bấm bookmark để mở script<br>' +
        '• Chọn stream → <b style="color:var(--accent);">Xem</b> để mở player<br>' +
        '• Player có: Chất lượng / Tốc độ / Toàn màn hình / Thu nhỏ<br>' +
        '• Nút <b style="color:var(--accent);">🚫 Ẩn QC</b> trong tab Streams để lọc video quảng cáo<br>' +
        '• Nút <b style="color:var(--accent);">☁ Sync ON</b> ở header cho biết đang đồng bộ cloud<br>' +
        '• Nút <b style="color:var(--accent);">▶</b> tự click nút Play ẩn (eporner, JAV...)' +
      '</div>' +
    '</div>' +

    '<div class="uvd-section-title"><span class="uvd-section-num">3</span> Tải với yt-dlp + Termux</div>' +
    '<div class="uvd-card uvd-timeline-card">' +
      '<div style="font-size:13px;color:var(--text2);line-height:1.7;">' +
        '<code class="uvd-inline-code">pkg update && pkg upgrade -y</code><br>' +
        '<code class="uvd-inline-code">pkg install python ffmpeg -y</code><br>' +
        '<code class="uvd-inline-code">pip install yt-dlp</code><br>' +
        '<code class="uvd-inline-code">termux-setup-storage</code><br><br>' +
        'Copy lệnh từ tab Streams → <b style="color:var(--accent);">Lệnh tải</b> → dán vào Termux.' +
      '</div>' +
    '</div>' +

    '<div class="uvd-profile-footer">© ' + new Date().getFullYear() + ' nguyenquocngu91 · UMP DL v' + VERSION + '</div>';

  container.querySelectorAll('.uvd-btn').forEach(function(b) { b.addEventListener('click', addRipple); });

  // ===== Sync handlers =====
  var statusEl = document.getElementById('uvd_sync_status');
  function setSyncStatus(msg, color) {
    if (statusEl) {
      statusEl.textContent = msg;
      statusEl.style.color = color || 'var(--text3)';
    }
  }

  document.getElementById('uvd_sync_save').onclick = function() {
    var apiKey = document.getElementById('uvd_sync_apikey').value.trim();
    var binId = document.getElementById('uvd_sync_binid').value.trim();
    if (!apiKey) { setSyncStatus('❌ Cần nhập API Key', 'var(--danger)'); return; }
    setSyncStatus('⏳ Đang xử lý...');
    if (binId) {
      // Dùng bin có sẵn
      syncConfig.apiKey = apiKey;
      syncConfig.binId = binId;
      JsonbinSync.saveConfig();
      JsonbinSync.push();
      setSyncStatus('✅ Đã lưu. Đang push lần đầu...', '#22c55e');
      setTimeout(function() { buildUI(); }, 1500);
    } else {
      // Tạo bin mới
      JsonbinSync.createBin(apiKey, function(err, newBinId) {
        if (err) {
          setSyncStatus('❌ Lỗi: ' + err, 'var(--danger)');
          return;
        }
        syncConfig.apiKey = apiKey;
        syncConfig.binId = newBinId;
        syncConfig.lastSync = Date.now();
        JsonbinSync.saveConfig();
        setSyncStatus('✅ Đã tạo bin: ' + newBinId, '#22c55e');
        setTimeout(function() { buildUI(); }, 1500);
      });
    }
  };

  document.getElementById('uvd_sync_pull').onclick = function() {
    if (!JsonbinSync.isEnabled()) {
      setSyncStatus('❌ Chưa cấu hình sync', 'var(--danger)');
      return;
    }
    setSyncStatus('⏳ Đang pull từ cloud...');
    JsonbinSync.pull(function(err) {
      if (err) {
        setSyncStatus('❌ Lỗi: ' + err, 'var(--danger)');
      } else {
        setSyncStatus('✅ Đã pull thành công. Đang reload...', '#22c55e');
        setTimeout(function() { buildUI(); }, 1200);
      }
    });
  };

  document.getElementById('uvd_sync_push').onclick = function() {
    if (!JsonbinSync.isEnabled()) {
      setSyncStatus('❌ Chưa cấu hình sync', 'var(--danger)');
      return;
    }
    setSyncStatus('⏳ Đang push lên cloud...');
    JsonbinSync.push();
    setTimeout(function() {
      setSyncStatus('✅ Đã push', '#22c55e');
    }, 1500);
  };

  document.getElementById('uvd_sync_clear').onclick = function() {
    if (confirm('Ngắt đồng bộ và xóa cấu hình sync?')) {
      syncConfig = {};
      JsonbinSync.saveConfig();
      setSyncStatus('Đã ngắt sync');
      setTimeout(function() { buildUI(); }, 800);
    }
  };

  // ===== Backup handlers =====
  document.getElementById('uvd_backup').onclick = function() {
    var blob = new Blob([JSON.stringify(data, null, 2)], {type:'application/json'});
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'uvd_backup.json';
    a.click();
  };
  document.getElementById('uvd_restore').onclick = function() {
    var inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = '.json';
    inp.onchange = function(e) {
      var reader = new FileReader();
      reader.onload = function(ev) {
        try {
          data = Object.assign(data, JSON.parse(ev.target.result));
          storage.set(data);
          JsonbinSync.schedulePush();
          toast('Đã nhập!');
          buildUI();
        } catch(ex) { toast('File không hợp lệ', 'var(--danger)'); }
      };
      reader.readAsText(e.target.files[0]);
    };
    inp.click();
  };
  document.getElementById('uvd_reset').onclick = function() {
    if (confirm('Xóa toàn bộ dữ liệu?')) {
      localStorage.removeItem(STORAGE_KEY);
      data = { favorites: [], siteProfiles: {}, history: [] };
      JsonbinSync.schedulePush();
      buildUI();
    }
  };
}

buildUI();

var autoRefresh = setInterval(function() {
  if (!document.getElementById('uvd') && !document.getElementById('uvd_min_float')) {
    clearInterval(autoRefresh);
    stopMonitor();
  }
}, 2000);

console.log('V5.10 UMP DL - Smart Popup Block + Jsonbin Sync + Ad Detection');
toast('V5.10 sẵn sàng!' + (JsonbinSync.isEnabled() ? ' ☁ Sync ON' : ''));
})();

