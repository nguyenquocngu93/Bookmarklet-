/**
 * Universal Media Player & Downloader - V6.7.26 PRO (tính khung video dọc bằng JS, chắc chắn hơn)
 * - Loại bỏ: Screenshot, Volume Boost, Sleep Timer, Speed controls, PiP riêng
 * - Tối ưu observer, scan, debounce buildUI, giảm blur/glow
 * - Giữ nguyên: tìm stream, lọc quảng cáo, player card trượt, phụ đề, resume
 * Author: nguyenquocngu91
 */
(function() {
'use strict';

var __uvdLoadedFromBookmarkletScript = !!(document.currentScript && document.currentScript.src && /bookmarklet\.js/i.test(document.currentScript.src));
var __uvdUserscriptMode = window.__uvdUserscriptMode === true && !__uvdLoadedFromBookmarkletScript;
var __uvdUserscriptFrameMode = __uvdUserscriptMode && window.top !== window.self;
var __uvdBooting = true;
window.__uvdBootPhase = 'start';
function __uvdReportBootError(reason) {
  try {
    var message = reason && (reason.message || reason.reason || reason) || 'unknown error';
    var phase = window.__uvdBootPhase || 'unknown';
    console.error('[Mèo cào media] Boot error at ' + phase + ':', reason);
    if (document.getElementById('__uvd_boot_error__')) return;
    var box = document.createElement('div');
    box.id = '__uvd_boot_error__';
    box.textContent = 'Mèo cào media không khởi động được ở bước ' + phase + ': ' + String(message);
    box.style.cssText = 'position:fixed;left:12px;right:12px;top:12px;z-index:2147483647;padding:14px 16px;border-radius:14px;background:#134e4a;color:#fff;font:600 13px/1.45 -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;box-shadow:0 8px 26px rgba(0,0,0,.45);';
    (document.body || document.documentElement).appendChild(box);
    setTimeout(function() { if (box.parentNode) box.remove(); }, 12000);
  } catch(e) { console.error('[Mèo cào media] Boot error reporter failed', e); }
}
window.addEventListener('error', function(event) {
  // Ignore generic cross-origin page errors (Chrome reports these as the
  // unhelpful "Script error."). Only surface an Error with a real stack
  // while UMP itself is booting.
  if (__uvdBooting && event && event.error && event.error.stack && event.message !== 'Script error.') {
    __uvdReportBootError(event.error);
  }
});
window.addEventListener('unhandledrejection', function(event) {
  if (__uvdBooting && event && event.reason && (event.reason.stack || event.reason.name)) {
    __uvdReportBootError(event.reason);
  }
});

var VERSION = '6.7.27';
var BOOKMARKLET_NAME = 'mèo cào media';
var HEADER_PROXY_BASE = 'https://saunhung-saunhung.hf.space';
var RENDER_PROXY_BASE = 'https://render-header-proxy.onrender.com';
// TMDB discovery is kept in source but paused while the scanner is the focus.
var __uvdTmdbFeatureEnabled = false;

// ========== CLEANUP ==========
var old = document.getElementById('__uvd__');
if (old) old.remove();
var oldMinBtn = document.getElementById('__uvd_min_float__');
if (oldMinBtn) oldMinBtn.remove();
var oldDiggingPopup = document.getElementById('__uvd_digging_popup__');
if (oldDiggingPopup) oldDiggingPopup.remove();

// ========== STORAGE ==========
// Keep userscript state completely separate from the bookmarklet state.
// This includes history, settings, learned Play selectors and filterlist.
var STORAGE_KEY = __uvdUserscriptMode ? 'uvd_userscript_data_v1' : 'uvd_data_v54';
var storage = {
  get: function() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; }
    catch(e) { return {}; }
  },
  set: function(data) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); }
    catch(e) {}
    if (typeof __uvdSyncSchedule === 'function') __uvdSyncSchedule();
  }
};

function __uvdDecodeConfig(raw) {
  if (!raw) return null;
  try {
    var normalized = raw.replace(/-/g, '+').replace(/_/g, '/');
    while (normalized.length % 4) normalized += '=';
    var json = decodeURIComponent(escape(atob(normalized)));
    return JSON.parse(json);
  } catch(e) { return null; }
}
function __uvdReadLinkConfig() {
  try {
    var script = document.currentScript;
    if (!script || !script.src) {
      var scripts = document.querySelectorAll('script[src]');
      for (var i = scripts.length - 1; i >= 0; i--) {
        if (/bookmarklet\.js/i.test(scripts[i].src)) { script = scripts[i]; break; }
      }
    }
    if (!script || !script.src) return null;
    return __uvdDecodeConfig(new URL(script.src).searchParams.get('cfg'));
  } catch(e) { return null; }
}
var __uvdLinkConfig = __uvdReadLinkConfig();

var data = storage.get();
data.favorites = data.favorites || [];
data.siteProfiles = data.siteProfiles || {};
data.history = data.history || [];
data.filterlist = data.filterlist || [];
data.playbackPositions = data.playbackPositions || {};
data.clickedButtons = data.clickedButtons || {};
data.userVotes = data.userVotes || {};        // { host|url: { up: n, down: n } } cute votes
data.tmdbVotes = data.tmdbVotes || {};        // { normalized title + tmdb id: { up, down, updatedAt } }
data.learnedVideos = data.learnedVideos || {}; // { host: { player, junk, up, down, updatedAt } }
data.settings = Object.assign({
  defaultSpeed: 1,
  defaultQuality: 'auto',
  dataSaver: false,
  autoFullscreen: false,
  resumePlayback: true,
  autoNext: false,
  reduceMotion: false,
  effectSpeed: 1,
  shadowIntensity: 34,
  cornerRadius: 22,
  doubleTapSeconds: 10,
  autoHideControls: false,
  showRemainingTime: true,
  hideDelay: 5,
  maxStoredUrls: 200,
  blockAutoplay: true,
  autoClickPlay: true,
  hideMode: 'floating',
  theme: 'light',             // tạm khóa Light; Dark Glass sẽ hoàn thiện sau
  headerProxyKey: '',
  subdlApiKey: '',
  tmdbApiKey: '',
  syncProfileId: '',
  aiIframeFilter: true,
  llmProxyUrl: '',
  tutorialMuted: false
}, data.settings || {});
if (__uvdLinkConfig) {
  if (__uvdLinkConfig.settings) data.settings = Object.assign({}, data.settings, __uvdLinkConfig.settings);
  if (__uvdLinkConfig.siteProfiles) data.siteProfiles = Object.assign({}, data.siteProfiles, __uvdLinkConfig.siteProfiles);
  if (Array.isArray(__uvdLinkConfig.filterlist)) data.filterlist = __uvdLinkConfig.filterlist.slice();
  if (Array.isArray(__uvdLinkConfig.history)) data.history = __uvdLinkConfig.history.slice();
  if (Array.isArray(__uvdLinkConfig.favorites)) data.favorites = __uvdLinkConfig.favorites.slice();
  storage.set(data);
}
// Tạm thời chỉ dùng Light Teal; Dark Glass sẽ quay lại sau khi hoàn thiện
// contrast toàn bộ component.
data.settings.theme = 'light';

var __uvdAutoClickDefaultsVersion = 1;
if (data.settings.__uvdAutoClickDefaultsVersion !== __uvdAutoClickDefaultsVersion) {
  data.settings.autoClickPlay = true;
  data.settings.__uvdAutoClickDefaultsVersion = __uvdAutoClickDefaultsVersion;
  storage.set(data);
}

var __uvdSmoothDefaultsVersion = 1;
if (data.settings.__uvdSmoothDefaultsVersion !== __uvdSmoothDefaultsVersion) {
  data.settings.reduceMotion = true;
  data.settings.__uvdSmoothDefaultsVersion = __uvdSmoothDefaultsVersion;
  storage.set(data);
}

var __uvdSurfaceTuningVersion = 1;
if (data.settings.__uvdSurfaceTuningVersion !== __uvdSurfaceTuningVersion) {
  data.settings.effectSpeed = 1;
  data.settings.shadowIntensity = 34;
  data.settings.cornerRadius = 22;
  // Blur/glow are retired. Let the new speed control be visible by default;
  // the separate performance toggle remains available for anyone who needs it.
  data.settings.reduceMotion = false;
  data.settings.__uvdSurfaceTuningVersion = __uvdSurfaceTuningVersion;
  storage.set(data);
}

// ========== CLOUD SYNC ==========
var __uvdSyncTimer = null;
// Keep history from every device. The previous whole-array replacement could
// erase a newly watched item when another device uploaded a stale payload.
function __uvdMergeHistory(localList, remoteList) {
  var byUrl = {};
  function add(item) {
    if (!item || !item.url) return;
    var key = String(item.url);
    var current = byUrl[key];
    if (!current) { byUrl[key] = Object.assign({}, item); return; }
    var incomingTime = Number(item.timestamp) || 0;
    var currentTime = Number(current.timestamp) || 0;
    // Keep fields (thumbnail/resolution/title) accumulated on either device,
    // while the most recently watched record wins conflicting values.
    byUrl[key] = incomingTime >= currentTime
      ? Object.assign({}, current, item)
      : Object.assign({}, item, current);
  }
  (Array.isArray(remoteList) ? remoteList : []).forEach(add);
  (Array.isArray(localList) ? localList : []).forEach(add);
  return Object.keys(byUrl).map(function(key) { return byUrl[key]; })
    .sort(function(a, b) { return (Number(b.timestamp) || 0) - (Number(a.timestamp) || 0); })
    .slice(0, 100);
}
function __uvdPersistLocalOnly() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch(e) {}
}
// History thumbnails are useful on the device that captured them, but 100 base64
// frames can exceed the proxy request limit and make an otherwise valid sync
// fail with 413. Sync compact metadata; local thumbnails are preserved by the
// merge function whenever they already exist.
function __uvdHistoryForSync(list) {
  return __uvdMergeHistory(list, []).map(function(entry) {
    var copy = Object.assign({}, entry);
    if (typeof copy.thumbnail === 'string' && (copy.thumbnail.indexOf('data:') === 0 || copy.thumbnail.length > 12000)) delete copy.thumbnail;
    return copy;
  });
}
function __uvdMergeStringLists(localList, remoteList) {
  var seen = {};
  return (Array.isArray(remoteList) ? remoteList : []).concat(Array.isArray(localList) ? localList : [])
    .map(function(item) { return String(item || '').trim(); })
    .filter(function(item) { if (!item || seen[item]) return false; seen[item] = true; return true; });
}
function __uvdMergeSyncPayload(payload, preferLocal) {
  if (!payload || typeof payload !== 'object') return;
  var localSettings = data.settings || {};
  var remoteSettings = payload.settings || {};
  // A newly entered profile first loads remote settings. Normal uploads then
  // keep this device's explicit edits when two devices are both active.
  data.settings = preferLocal
    ? Object.assign({}, remoteSettings, localSettings, { syncProfileId: localSettings.syncProfileId })
    : Object.assign({}, localSettings, remoteSettings, { syncProfileId: localSettings.syncProfileId });
  data.siteProfiles = preferLocal
    ? Object.assign({}, payload.siteProfiles || {}, data.siteProfiles || {})
    : Object.assign({}, data.siteProfiles || {}, payload.siteProfiles || {});
  data.filterlist = __uvdMergeStringLists(data.filterlist, payload.filterlist);
  data.history = __uvdMergeHistory(data.history, payload.history);
  data.favorites = __uvdMergeStringLists(data.favorites, payload.favorites);
  data.userVotes = preferLocal ? Object.assign({}, payload.userVotes || {}, data.userVotes || {}) : Object.assign({}, data.userVotes || {}, payload.userVotes || {});
  data.tmdbVotes = preferLocal ? Object.assign({}, payload.tmdbVotes || {}, data.tmdbVotes || {}) : Object.assign({}, data.tmdbVotes || {}, payload.tmdbVotes || {});
  data.learnedHosts = preferLocal ? Object.assign({}, payload.learnedHosts || {}, data.learnedHosts || {}) : Object.assign({}, data.learnedHosts || {}, payload.learnedHosts || {});
  data.learnedVideos = preferLocal ? Object.assign({}, payload.learnedVideos || {}, data.learnedVideos || {}) : Object.assign({}, data.learnedVideos || {}, payload.learnedVideos || {});
  __uvdLearnedHosts = data.learnedHosts || {};
}
function __uvdSyncPayload() {
  var settings = Object.assign({}, data.settings);
  delete settings.headerProxyKey;
  delete settings.subdlApiKey;
  delete settings.tmdbApiKey;
  return {
    settings: settings,
    siteProfiles: data.siteProfiles,
    filterlist: data.filterlist,
    history: __uvdHistoryForSync(data.history),
    favorites: data.favorites,
    userVotes: data.userVotes,
    tmdbVotes: data.tmdbVotes,
    learnedHosts: data.learnedHosts,
    learnedVideos: data.learnedVideos
  };
}
var __uvdSyncLastError = '';
var __uvdSyncLoading = false;
function __uvdSyncResponse(response, label) {
  if (response.ok) return response.json().catch(function() { return {}; });
  return response.text().catch(function() { return ''; }).then(function(text) {
    var detail = '';
    try { detail = (JSON.parse(text).error || '').replace(/\s+/g, ' '); } catch(e) { detail = String(text || '').replace(/\s+/g, ' '); }
    var error = new Error((label || 'Sync') + ' HTTP ' + response.status + (detail ? ': ' + detail.slice(0, 160) : ''));
    error.status = response.status;
    throw error;
  });
}
// Some media sites allow the bookmarklet script but lock connect-src with CSP,
// which blocks fetch() only on that one domain. A hidden Render iframe performs
// the same request from Render's own origin. MessageChannel keeps the returned
// profile off the host page's window.message listeners.
function __uvdSyncBridgeRequest(method, profileId, payload) {
  if (!window.MessageChannel || !RENDER_PROXY_BASE) return Promise.reject(new Error('Trang chặn kết nối đồng bộ (không có bridge)'));
  return new Promise(function(resolve, reject) {
    var frame = document.createElement('iframe');
    var done = false;
    var timer = null;
    function finish(error, value) {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try { frame.remove(); } catch(e) {}
      if (error) reject(error); else resolve(value);
    }
    frame.setAttribute('aria-hidden', 'true');
    frame.tabIndex = -1;
    frame.style.cssText = 'position:fixed!important;width:1px!important;height:1px!important;left:-9999px!important;top:-9999px!important;opacity:0!important;pointer-events:none!important;border:0!important;';
    frame.onload = function() {
      try {
        var channel = new MessageChannel();
        channel.port1.onmessage = function(event) {
          var result = event && event.data || {};
          if (!result.ok) {
            var error = new Error(result.error || ('Sync bridge HTTP ' + (result.status || 0)));
            error.status = result.status;
            finish(error);
            return;
          }
          try { finish(null, result.body ? JSON.parse(result.body) : {}); }
          catch(e) { finish(new Error('Bridge trả dữ liệu đồng bộ không hợp lệ')); }
        };
        var targetOrigin = new URL(RENDER_PROXY_BASE).origin;
        frame.contentWindow.postMessage({ type: 'umpdl-sync-bridge', method: method, profileId: profileId, payload: payload || null }, targetOrigin, [channel.port2]);
      } catch(e) { finish(e); }
    };
    frame.onerror = function() { finish(new Error('Trang chặn iframe bridge đồng bộ')); };
    timer = setTimeout(function() { finish(new Error('Bridge đồng bộ mất quá lâu')); }, 12000);
    frame.src = RENDER_PROXY_BASE.replace(/\/$/, '') + '/sync-bridge';
    try { (document.documentElement || document.body).appendChild(frame); }
    catch(e) { finish(e); }
  });
}
function __uvdSyncRequest(syncUrl, method, profileId, payload) {
  var options = method === 'PUT'
    ? { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), cache: 'no-store' }
    : { cache: 'no-store' };
  return fetch(syncUrl, options)
    .then(function(response) { return __uvdSyncResponse(response, method === 'PUT' ? 'Lưu đồng bộ' : 'Tải đồng bộ'); })
    .catch(function(error) {
      // HTTP errors mean Render/Supabase responded and need to be shown as-is.
      // Network/CSP errors have no status, so try the same-origin Render bridge.
      if (error && error.status) throw error;
      return __uvdSyncBridgeRequest(method, profileId, payload);
    });
}
function __uvdSyncUploadMerged() {
  if (!data || !data.settings || !data.settings.syncProfileId) return Promise.resolve(false);
  var syncUrl = RENDER_PROXY_BASE + '/sync/' + encodeURIComponent(data.settings.syncProfileId);
  __uvdSyncLastError = '';
  function upload() {
    return __uvdSyncRequest(syncUrl, 'PUT', data.settings.syncProfileId, __uvdSyncPayload()).then(function() { return true; });
  }
  // Always read and merge the whole profile before writing. The old version
  // merged only history, so a second device could overwrite profiles, filters
  // and favorites with an empty local state.
  return __uvdSyncRequest(syncUrl, 'GET', data.settings.syncProfileId)
    .then(function(remote) {
      if (remote && remote.payload) {
        __uvdMergeSyncPayload(remote.payload, true);
        compileAdFilters();
        __uvdPersistLocalOnly();
      }
      return upload();
    })
    .catch(function(error) {
      __uvdSyncLastError = (error && error.message) ? error.message : 'Không thể kết nối máy chủ đồng bộ';
      return false;
    });
}
function __uvdSyncSchedule() {
  if (!data || !data.settings || !data.settings.syncProfileId || __uvdSyncLoading) return;
  clearTimeout(__uvdSyncTimer);
  __uvdSyncTimer = setTimeout(function() { __uvdSyncUploadMerged().catch(function() {}); }, 1500);
}
function __uvdSyncNow() {
  if (!data.settings.syncProfileId) __uvdCreateSyncProfileId();
  clearTimeout(__uvdSyncTimer);
  return __uvdSyncUploadMerged();
}
function __uvdSyncLoad(silent) {
  if (!data.settings.syncProfileId) return Promise.resolve(false);
  __uvdSyncLoading = true;
  __uvdSyncLastError = '';
  var syncUrl = RENDER_PROXY_BASE + '/sync/' + encodeURIComponent(data.settings.syncProfileId);
  return __uvdSyncRequest(syncUrl, 'GET', data.settings.syncProfileId)
    .then(function(remote) {
      if (!remote || !remote.payload) return false;
      __uvdMergeSyncPayload(remote.payload, false);
      compileAdFilters();
      storage.set(data);
      if (document.getElementById('__uvd__')) debouncedBuildUI();
      if (!silent) toast('☁ Đã tải cấu hình đồng bộ');
      return true;
    })
    .catch(function(error) {
      __uvdSyncLastError = (error && error.message) ? error.message : 'Không thể kết nối máy chủ đồng bộ';
      if (!silent) toast('☁ Đồng bộ chưa kết nối được');
      return false;
    })
    .then(function(result) { __uvdSyncLoading = false; return result; }, function() { __uvdSyncLoading = false; return false; });
}
function __uvdCreateSyncProfileId() {
  var bytes = new Uint8Array(16);
  if (window.crypto && crypto.getRandomValues) crypto.getRandomValues(bytes);
  else for (var i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  var id = 'u_' + Array.from(bytes).map(function(b) { return b.toString(16).padStart(2, '0'); }).join('');
  data.settings.syncProfileId = id;
  storage.set(data);
  return id;
}

// ========== PROFILES ==========
var defaultProfiles = {
  'videoplay.us': { referer: 'https://videoplay.us/', userAgent: '' },
  'streamtape.com': { referer: 'https://streamtape.com/', userAgent: '' },
  'ok.ru': { referer: 'https://ok.ru/', userAgent: '' },
  'fembed.com': { referer: 'https://fembed.com/', userAgent: '' },
  'mp4upload.com': { referer: 'https://mp4upload.com/', userAgent: '' },
  'abyssplayer.com': { referer: 'https://abyssplayer.com/', userAgent: '', playSelector: '#overlay' }
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
  applyThemePref(el);
  applyEffectsPref(el);
  applyMotionPref(el);
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
function __uvdClampNumber(value, min, max, fallback) {
  value = Number(value);
  if (!isFinite(value)) value = fallback;
  return Math.max(min, Math.min(max, value));
}
function applyEffectsPref(el) {
  if (!el) return;
  var speed = __uvdClampNumber(data.settings.effectSpeed, .5, 1.8, 1);
  var shadow = __uvdClampNumber(data.settings.shadowIntensity, 0, 100, 34);
  var radius = Math.round(__uvdClampNumber(data.settings.cornerRadius, 12, 36, 22));
  var transition = data.settings.reduceMotion ? 0 : (.24 / speed);
  var mascot = data.settings.reduceMotion ? 0 : (1.8 / speed);
  el.classList.remove('uvd-fx-on');
  el.classList.add('uvd-tunable-ui');
  el.style.setProperty('--uvd-transition', transition.toFixed(3) + 's cubic-bezier(.22,1,.36,1)');
  el.style.setProperty('--uvd-transition-duration', transition.toFixed(3) + 's');
  el.style.setProperty('--uvd-motion-duration', mascot.toFixed(2) + 's');
  el.style.setProperty('--uvd-shadow-alpha', (.025 + shadow * .0018).toFixed(3));
  el.style.setProperty('--uvd-shadow-y', Math.round(2 + shadow * .10) + 'px');
  el.style.setProperty('--uvd-shadow-blur', Math.round(6 + shadow * .24) + 'px');
  el.style.setProperty('--radius-sm', Math.max(8, radius - 8) + 'px');
  el.style.setProperty('--radius-md', radius + 'px');
  el.style.setProperty('--radius-lg', Math.min(48, radius + 10) + 'px');
  // Extra breathing room grows a little with very rounded corners so content
  // does not visually touch the curved edge at the maximum radius setting.
  el.style.setProperty('--uvd-corner-inset', Math.max(0, Math.round((radius - 18) * .32)) + 'px');
}
function applyMotionPref(el) {
  if (!el) return;
  el.classList.toggle('uvd-reduce-motion', !!data.settings.reduceMotion);
  // Surface blur is intentionally retired. The interface is solid pastel now.
  el.style.setProperty('--uvd-blur', '0px');
}
function __uvdRefreshSurfaceTuning() {
  document.querySelectorAll('.uvd-scope').forEach(function(el) {
    applyEffectsPref(el);
    applyMotionPref(el);
  });
}
function applyThemePref(el) {
  if (!el) return;
  el.classList.toggle('uvd-theme-dark', (data.settings && data.settings.theme) === 'dark');
}

// ========== AD FILTER ==========
var __uvdAdBlockedCount = 0;
var compiledFilters = [];
var compiledExceptions = [];

function compileFilterPattern(raw) {
  var pattern = (raw || '').trim().toLowerCase();
  if (!pattern || pattern.charAt(0) === '!' || pattern.charAt(0) === '[' || pattern.indexOf('##') !== -1 || pattern.indexOf('#@#') !== -1) return null;
  pattern = pattern.split('$')[0].trim();
  if (!pattern) return null;
  if (pattern.indexOf('regex:') === 0) {
    try { return { type: 'regex', re: new RegExp(pattern.slice(6), 'i') }; } catch(e) { return null; }
  }
  // Common AdGuard/uBlock host rule: ||ads.example^ → ads.example
  if (pattern.indexOf('||') === 0) pattern = pattern.slice(2);
  pattern = pattern.replace(/^\|+|\|+$/g, '').replace(/\^.*$/, '').replace(/^\*\./, '');
  if (!pattern) return null;
  return { type: 'plain', value: pattern };
}
function compileAdFilters() {
  compiledFilters = [];
  compiledExceptions = [];
  (data.filterlist || []).forEach(function(raw) {
    var text = String(raw || '').trim();
    if (!text) return;
    if (text.indexOf('@@') === 0) {
      var exception = compileFilterPattern(text.slice(2));
      if (exception) compiledExceptions.push(exception);
      return;
    }
    var rule = compileFilterPattern(text);
    if (rule) compiledFilters.push(rule);
  });
}
if (Array.isArray(data.filterlist) && data.filterlist.length > 5000) {
  data.filterlist = [];
  storage.set(data);
}
compileAdFilters();

var DEFAULT_AD_MARKERS = [
  'go.mnaspm.com', 'go.mayzaent.com', 'smartpop', 'popunder', 'popads',
  'doubleclick.net', 'googlesyndication.com', 'adservice.google.com',
  'adsterra', 'trafficjunky', 'exoclick', 'onclickads', 'redirect-ad'
];
// ========== ANONYMOUS COMMUNITY LEARNING ==========
// Only normalized hostnames (or public TMDB ids) leave the browser. Never send
// watch history, page/title, media URL path/query, cookies or profile ID.
var __uvdSharedAdHosts = [];
var __uvdSharedAdRulesLoaded = false;
function __uvdLearningHost(value) {
  var raw = String(value || '').trim().toLowerCase();
  if (!raw) return '';
  raw = raw.replace(/^\|\|/, '').replace(/\^.*$/, '').replace(/^\*\./, '').replace(/^www\./, '');
  try { if (/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) raw = new URL(raw).hostname.toLowerCase().replace(/^www\./, ''); } catch(e) { return ''; }
  if (!raw || raw.length > 253 || !raw.includes('.') || !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(raw)) return '';
  return raw;
}
function __uvdIsSharedAdHost(url) {
  var host = __uvdLearningHost(url);
  return !!host && __uvdSharedAdHosts.some(function(rule) { return host === rule || host.endsWith('.' + rule); });
}
function __uvdSubmitCommunityVote(kind, subject, vote) {
  if (!['video','iframe','ad','tmdb'].includes(kind) || !['up','down'].includes(vote)) return;
  if (kind === 'tmdb') {
    if (!/^(?:movie|tv):\d{1,12}$/.test(String(subject || ''))) return;
  } else {
    subject = __uvdLearningHost(subject);
    if (!subject) return;
  }
  try {
    fetch(RENDER_PROXY_BASE.replace(/\/$/, '') + '/learning/vote', {
      method: 'POST', cache: 'no-store', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: kind, subject: subject, vote: vote })
    }).catch(function() {});
  } catch(e) {}
}
function __uvdLoadSharedAdRules() {
  if (__uvdSharedAdRulesLoaded) return;
  __uvdSharedAdRulesLoaded = true;
  try {
    fetch(RENDER_PROXY_BASE.replace(/\/$/, '') + '/learning/rules', { cache: 'no-store' })
      .then(function(r) { return r.ok ? r.json() : null; })
      .then(function(payload) {
        var hosts = payload && Array.isArray(payload.blockHosts) ? payload.blockHosts : [];
        __uvdSharedAdHosts = hosts.map(__uvdLearningHost).filter(Boolean).filter(function(host, index, list) { return list.indexOf(host) === index; }).slice(0, 200);
      }).catch(function() {});
  } catch(e) {}
}

function isAdUrl(url) {
  var lowerUrl = String(url || '').toLowerCase();
  for (var ex = 0; ex < compiledExceptions.length; ex++) {
    var allow = compiledExceptions[ex];
    if (allow.type === 'regex' ? allow.re.test(url) : lowerUrl.indexOf(allow.value) !== -1) return false;
  }
  if (__uvdIsSharedAdHost(url)) return true;
  for (var d = 0; d < DEFAULT_AD_MARKERS.length; d++) {
    if (lowerUrl.indexOf(DEFAULT_AD_MARKERS[d]) !== -1) return true;
  }
  if (!compiledFilters.length) return false;
  for (var i = 0; i < compiledFilters.length; i++) {
    var f = compiledFilters[i];
    if (f.type === 'regex') { if (f.re.test(url)) return true; }
    else if (lowerUrl.indexOf(f.value) !== -1) return true;
  }
  return false;
}

// ========== URL DETECTION ==========
var urls = new Map();
var __uvdPinnedMasters = new Set();
var __uvdUrlSequence = 0;
var __uvdMediaAccessTokens = [];
// Intro flow: a digging cat stays on top until the user chooses a found
// media/iframe route or closes it. The normal UMP panel remains hidden behind
// the selected popup and is restored only when that popup is dismissed.
var __uvdDiggingFlow = {
  active: false,
  found: false,
  completed: false,
  released: false,
  route: '',
  url: '',
  type: '',
  transitionTimer: null,
  waitTimer: null,
  runTimer: null,
  realtimeTimer: null,
  realtimeEndTimer: null,
  iframeProbeTimer: null,
  removeTimer: null
};
// One-shot handoff flag: target popups use it to rise from below immediately
// after the digging cat has flown out of the viewport.
var __uvdDiggingPopupHandoff = false;
var __uvdDiggingWaitMs = 20000;
function __uvdConsumeDiggingPopupHandoff() {
  var handoff = __uvdDiggingPopupHandoff;
  __uvdDiggingPopupHandoff = false;
  return handoff;
}
function __uvdIsDiggingDirectType(type) {
  return ['M3U8', 'MP4', 'MPD', 'WEBM', 'TS'].indexOf(String(type || '').toUpperCase()) !== -1;
}
// A captured URL is only a lead.  It becomes a result after a real media
// element supplies a long-form duration, pixels/resolution and a canvas frame.
// This deliberately rejects trailers, short ad clips and bare network URLs.
var __uvdVerificationQueue = [];
var __uvdVerificationRunning = 0;
var __uvdVerificationMaxConcurrent = 2;
var __uvdVerificationTimeoutMs = 8500;
var __uvdTrustedVerificationTimeoutMs = 6500;
var __uvdVerificationRetryMs = 12000;
function __uvdHasLongMediaMetadata(item) {
  return !!item && isFinite(item.durationSeconds) && Number(item.durationSeconds) >= 600 &&
    Number(item.videoWidth || 0) > 0 && Number(item.videoHeight || 0) > 0;
}
function __uvdIsQualifiedMediaItem(item) {
  if (!item || item.demo === true) return false;
  var fullyVerified = item.verified === true && !!item.thumbnail &&
    isFinite(item.durationSeconds) && item.durationSeconds > __uvdDemoPreviewMaxSeconds &&
    Number(item.videoWidth || 0) > 0 && Number(item.videoHeight || 0) > 0;
  // Slow/CORS-limited hosts can expose reliable duration + dimensions but deny
  // canvas thumbnail capture. A 10+ minute real video with decoded metadata is
  // strong enough for the digging flow; it should not wait behind a thumbnail.
  return fullyVerified || __uvdHasLongMediaMetadata(item);
}
function __uvdQualifiedDirectEntries() {
  return __uvdHasRealDirectStreams().filter(function(entry) {
    return !__uvdIsRejectedVideo(entry[0]) && __uvdIsQualifiedMediaItem(entry[1]);
  });
}
function __uvdCaptureVerifiedThumbnail(media) {
  if (!media || !media.videoWidth || !media.videoHeight) return '';
  try {
    var canvas = document.createElement('canvas');
    canvas.width = 240; canvas.height = 135;
    var ctx = canvas.getContext('2d');
    ctx.drawImage(media, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', .62);
  } catch(e) { return ''; }
}
function __uvdPromoteVerifiedMedia(url, media) {
  var item = urls.get(url);
  if (!item || !media) return false;
  var duration = Number(media.duration || 0);
  // A VOD duration plus actual decoded pixels is the required data proof.
  if (!isFinite(duration) || duration <= __uvdDemoPreviewMaxSeconds || !media.videoWidth || !media.videoHeight) return false;
  var thumbnail = __uvdCaptureVerifiedThumbnail(media);
  item.durationSeconds = duration;
  item.videoWidth = media.videoWidth;
  item.videoHeight = media.videoHeight;
  item.resolution = media.videoWidth + '×' + media.videoHeight;
  item.demo = false;
  if (!thumbnail) {
    if (!__uvdHasLongMediaMetadata(item)) return false;
    item.metadataVerified = true;
    item.previewReady = false;
    item.verification = 'metadata';
  } else {
    item.thumbnail = thumbnail;
    item.verified = true;
    item.previewReady = true;
    item.verification = 'ready';
  }
  var done = item.__uvdVerificationDone;
  delete item.__uvdVerificationDone;
  if (typeof done === 'function') done(true);
  __uvdMarkDiggingLinkFound(url, item.type);
  if (typeof debouncedBuildUI === 'function') debouncedBuildUI();
  return true;
}
function __uvdPromoteDiggingMetadata(url, media) {
  var item = urls.get(url);
  if (!item || !media) return false;
  var duration = Number(media.duration || 0);
  if (!isFinite(duration) || duration < 600 || !media.videoWidth || !media.videoHeight) return false;
  item.durationSeconds = duration;
  item.videoWidth = media.videoWidth;
  item.videoHeight = media.videoHeight;
  item.resolution = media.videoWidth + '×' + media.videoHeight;
  item.metadataVerified = true;
  item.previewReady = false;
  item.demo = false;
  item.verification = 'metadata';
  var done = item.__uvdVerificationDone;
  delete item.__uvdVerificationDone;
  if (typeof done === 'function') done(true);
  __uvdMarkDiggingLinkFound(url, item.type);
  if (typeof debouncedBuildUI === 'function') debouncedBuildUI();
  return true;
}
function __uvdVerificationPriority(url) {
  var item = urls.get(url) || {};
  if (__uvdIsRejectedVideo(url)) return -1000;
  var score = __uvdLearnedVideoVerdict(url) === 'PLAYER' ? 100 : 0;
  if (item.isMaster || (Number(item.qualityCount) || 0) > 1) score += 45;
  if (item.resolution || item.hasThumbnail || item.thumbnail) score += 25;
  if (item.source && /(?:element|current|manifest)/i.test(item.source)) score += 12;
  return score;
}
function __uvdQueueMediaVerification(url) {
  var item = urls.get(url);
  if (!item || !__uvdIsDiggingDirectType(item.type) || __uvdIsRejectedVideo(url) || __uvdIsQualifiedMediaItem(item) || item.demo === true) return;
  if (item.verification === 'queued' || item.verification === 'checking') return;
  if (item.verification === 'failed' && Date.now() - (item.verificationFailedAt || 0) < __uvdVerificationRetryMs) return;
  item.verification = 'queued';
  __uvdVerificationQueue.push(url);
  // Votes from trusted hosts and already-rich metadata are verified first.
  __uvdVerificationQueue.sort(function(a, b) { return __uvdVerificationPriority(b) - __uvdVerificationPriority(a); });
  setTimeout(__uvdPumpMediaVerification, 0);
}
function __uvdPumpMediaVerification() {
  if (__uvdVerificationRunning >= __uvdVerificationMaxConcurrent) return;
  var url = '';
  var item = null;
  while (__uvdVerificationQueue.length && !item) {
    url = __uvdVerificationQueue.shift();
    var candidate = urls.get(url);
    if (candidate && !__uvdIsRejectedVideo(url) && !__uvdIsQualifiedMediaItem(candidate) && candidate.demo !== true) item = candidate;
  }
  if (!item) return;
  __uvdVerificationRunning += 1;
  item.verification = 'checking';
  var stage = document.createElement('div');
  stage.className = 'uvd-verification-stage';
  stage.setAttribute('aria-hidden', 'true');
  stage.style.cssText = 'position:fixed;left:0;top:0;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none;z-index:-1;';
  // Reuse the exact thumbnail loader used by a visible stream card.  The card
  // stays offscreen until the loader has both metadata and an actual frame.
  stage.innerHTML = buildStreamCardHTML({ url: url, type: item.type, resolution: item.resolution || '', thumbnail: '', verified: false }, 0);
  try { (document.body || document.documentElement).appendChild(stage); } catch(e) {}
  var finished = false;
  function finish(ok) {
    if (finished) return;
    finished = true;
    var latest = urls.get(url);
    if (latest && latest.verification !== 'ready') {
      latest.verification = ok ? 'ready' : 'failed';
      if (!ok) latest.verificationFailedAt = Date.now();
    }
    if (latest) delete latest.__uvdVerificationDone;
    var preview = stage.querySelector('.uvd-card-preview');
    try { if (preview && preview.__uvdThumbHls) preview.__uvdThumbHls.destroy(); } catch(e) {}
    try { stage.remove(); } catch(e) {}
    __uvdVerificationRunning = Math.max(0, __uvdVerificationRunning - 1);
    if (!ok && typeof debouncedBuildUI === 'function') debouncedBuildUI();
    setTimeout(__uvdPumpMediaVerification, 0);
  }
  item.__uvdVerificationDone = finish;
  try {
    hydrateVideoThumbnails(stage);
    var preview = stage.querySelector('.uvd-card-preview');
    // The staging card has no scroll viewport, so deliberately start its
    // loader instead of waiting for IntersectionObserver visibility.
    if (preview && preview.__uvdStartThumb) preview.__uvdStartThumb();
    else finish(false);
  } catch(e) { finish(false); }
  var verificationTimeout = __uvdLearnedVideoVerdict(url) === 'PLAYER' ? __uvdTrustedVerificationTimeoutMs : __uvdVerificationTimeoutMs;
  setTimeout(function() { finish(false); }, verificationTimeout);
  // If there are several candidates already waiting, start another slot now.
  if (__uvdVerificationQueue.length) setTimeout(__uvdPumpMediaVerification, 0);
}
function __uvdMarkDiggingLinkFound(url, type) {
  if (!__uvdIsDiggingDirectType(type)) return;
  var item = urls.get(url);
  if (!__uvdIsQualifiedMediaItem(item)) { __uvdQueueMediaVerification(url); return; }
  __uvdDiggingFlow.found = true;
  __uvdDiggingFlow.route = 'media';
  __uvdDiggingFlow.url = url || __uvdDiggingFlow.url;
  __uvdDiggingFlow.type = type || __uvdDiggingFlow.type;
  // During initial synchronous scanning the UI does not exist yet. Once it
  // does, redraw it before the reveal animation so the new card is already
  // waiting underneath the popup.
  if (document.getElementById('__uvd__') && typeof debouncedBuildUI === 'function') debouncedBuildUI();
  if (__uvdDiggingFlow.active && typeof __uvdUpdateDiggingPopup === 'function') __uvdUpdateDiggingPopup();
}
function __uvdRememberAccessToken(url) {
  try {
    var parsed = new URL(url, location.href);
    var token = parsed.searchParams.get('access_token');
    if (!token) return;
    var existing = __uvdMediaAccessTokens.find(function(item) { return item.host === parsed.hostname && item.token === token; });
    if (existing) { existing.updatedAt = Date.now(); return; }
    __uvdMediaAccessTokens.push({ host: parsed.hostname, path: parsed.pathname, token: token, updatedAt: Date.now() });
    if (__uvdMediaAccessTokens.length > 8) __uvdMediaAccessTokens.shift();
  } catch(e) {}
}
function __uvdGetLatestMediaAccessToken(url) {
  var list = __uvdMediaAccessTokens.slice().sort(function(a, b) { return b.updatedAt - a.updatedAt; });
  if (!list.length) return '';
  return list[0].token;
}
function __uvdAppendAccessToken(url, token) {
  if (!token || !url) return url;
  try {
    var parsed = new URL(url, location.href);
    if (!/customers\.iw01\.xyz$/i.test(parsed.hostname) || parsed.searchParams.has('access_token')) return parsed.toString();
    parsed.searchParams.set('access_token', token);
    return parsed.toString();
  } catch(e) { return url; }
}
var patterns = [
  { re: /https?:\/\/[^\s"'<>()\\]+\/v\d+\/miy\/[^\s"'<>()\\]+\.txt(?:\?[^\s"'<>()\\]*)?/gi, type: 'M3U8', priority: 1 },
  { re: /(?:https?:)?\/\/[^\s"'<>()\\]+\/m3u8\/[^\s"'<>()\\]*/gi, type: 'M3U8', priority: 1 },
  { re: /(?:https?:)?\/\/[^\s"'<>()\\]+\.m3u8[^\s"'<>()\\]*/gi, type: 'M3U8', priority: 1 },
  { re: /(?:https?:)?\/\/[^\s"'<>()\\]+(?:tapecontent\.net|mixdrop[^\s"'<>()\\]*)[^\s"'<>()\\]+\.mp4[^\s"'<>()\\]*/gi, type: 'MP4', priority: 3 },
  { re: /(?:https?:)?\/\/streamtape\.com\/(?:get_video|gbt_video)\?[^\s"'<>()\\]*/gi, type: 'MP4', priority: 3 },
  { re: /https?:\/\/[^\s"'<>()\\]+\.mpd[^\s"'<>()\\]*/gi, type: 'MPD', priority: 2 },
  { re: /https?:\/\/[^\s"'<>()\\]+\.mp4[^\s"'<>()\\]*/gi, type: 'MP4', priority: 3 },
  { re: /https?:\/\/[^\s"'<>()\\]+\.webm[^\s"'<>()\\]*/gi, type: 'WEBM', priority: 4 },
  { re: /https?:\/\/[^\s"'<>()\\]+\.mkv[^\s"'<>()\\]*/gi, type: 'MKV', priority: 5 },
  { re: /https?:\/\/[^\s"'<>()\\]+\.flv[^\s"'<>()\\]*/gi, type: 'FLV', priority: 6 },
  { re: /https?:\/\/[^\s"'<>()\\]+\.ts[^\s"'<>()\\]*/gi, type: 'TS', priority: 7 },
  { re: /blob:https?:\/\/[^\s"'<>()\\]+/gi, type: 'BLOB', priority: 8 }
];

var __uvdFindUrlsCache = {};
function __uvdIsEmbedMediaUrl(url) {
  try {
    var parsed = new URL(url, location.href);
    var path = (parsed.pathname || '').toLowerCase();
    var host = (parsed.hostname || '').replace(/^www\./, '');
    var abyssEmbed = host === 'abyssplayer.com' && /^\/[^\/]+\/?$/.test(path);
    var supremeServer = /(?:^|\.)supremejav\.com$/.test(host) && path.indexOf('/supjav.php') === 0;
    var hashPlayer = (host === 'stb.strp2p.com' || host === 'player.upn.one') && !!parsed.hash;
    return /\/(?:e|embed)(?:\/|$)/.test(path) || (host === 'streamtape.com' && path.indexOf('/e/') === 0) || abyssEmbed || supremeServer || hashPlayer;
  } catch(e) { return false; }
}
function __uvdLooksLikeHlsUrl(url) {
  try {
    var parsed = new URL(url, location.href);
    var path = (parsed.pathname || '').toLowerCase();
    // javynow-style URLs end in .mp4 but are actually HLS playlists. Their
    // segment URLs contain /seg= and must remain ordinary proxy segments.
    return path.indexOf('/seg=') === -1 && (/\/media=hls(?:\/|$)/i.test(path) || /\/v\d+\/miy\/[^/]+\.txt$/i.test(path) || /\.m3u8$/i.test(path));
  } catch(e) { return /media=hls/i.test(String(url || '')) && !/\/seg=/i.test(String(url || '')); }
}
function __uvdIsLikelyHlsSegmentUrl(url) {
  return /(?:\/seg=|segment|chunk|frag|\.ts(?:[?#]|$)|\.m4s(?:[?#]|$)|\.aac(?:[?#]|$)|\.image(?:[?#]|$)|init-[^/?#]+\.mp4(?:[?#]|$))/i.test(String(url || ''));
}
var __uvdMatthewFrozen = false;
function __uvdIsMatthewHost() { return /(?:^|\.)matthewhotelscience\.com$/i.test(pageInfo.host); }
function __uvdFreezeMatthewPage() {
  if (!__uvdIsMatthewHost() || __uvdMatthewFrozen) return;
  __uvdMatthewFrozen = true;
  document.documentElement.classList.add('uvd-page-frozen');
  try { installPopupBlock(); } catch(e) {}
  toast('🧊 Đã khóa page sau khi bắt được video');
}
// ========== AI/HEURISTIC IFRAME CLASSIFIER — network evidence ==========
// The bookmarklet cannot read inside a cross-origin iframe, but it CAN watch
// every media URL that appears in the parent page (HTML, script text, fetch,
// XHR, resource timing). We bucket those media hosts into __uvdMediaEvidence.
// If a discovered iframe's host shows media evidence, that iframe very likely
// contains the real player (the "standard file"), not an ad/tracker iframe.
var __uvdMediaEvidence = {};
function __uvdMediaHostOf(url) {
  try { return new URL(url, location.href).hostname.replace(/^www\./, '').toLowerCase(); } catch(e) { return ''; }
}
function __uvdFeedMediaEvidence(url) {
  var host = __uvdMediaHostOf(url);
  if (!host || !__uvdIsLikelyMediaEvidenceUrl(url)) return;
  __uvdMediaEvidence[host] = (__uvdMediaEvidence[host] || 0) + 1;
  if (__uvdMediaEvidence[host] > 20) __uvdMediaEvidence[host] = 20;
}
function __uvdIsLikelyMediaEvidenceUrl(url) {
  return /\.(?:m3u8|mp4|webm|mkv|mpd)(?:[?#]|$)|m3u8|manifest|playlist|master|media=hls|get_video|gbt_video|tapecontent|mxcontent|vincdn|miixdrop|mixdrop|upload18/i.test(String(url || ''));
}
// Common media-player hosts (embed servers) that are almost always the real player.
var __uvdKnownPlayerHosts = [
  'streamtape.com', 'mixdrop.co', 'mixdrop.com', 'miixdrop.com', 'doodstream.com',
  'dood.re', 'dood.ws', 'vidplay.online', 'vidplay.site', 'filemoon.sx', 'streamsb.net',
  'voe.sx', 'fembed.com', 'mp4upload.com', 'vidcloud9.com', 'abyssplayer.com', 'hydrax.net',
  'streamwish.to', 'uptostream.com', 'ok.ru', 'videoplay.us', 'supjav.com', 'embtaku.com',
  'videoplay.us', 'dood.yt', 'javxxx.me', 'vinovo.to', 'upload18.org', 'tapecontent.net',
  'mxcontent.net', 'vincdn.net', 'stb.strp2p.com', 'player.upn.one'
];
// ========== SELF-LEARNING for UNKNOWN iframes ==========
// Persist learned verdicts per host so an UNKNOWN iframe that turns out to be
// the real player (user opens it / it serves media) is recognized next time.
data.learnedHosts = data.learnedHosts || {};
var __uvdLearnedHosts = data.learnedHosts;
function __uvdLearnIframe(host, verdict) {
  if (!host) return;
  var rec = __uvdLearnedHosts[host] = __uvdLearnedHosts[host] || { player: 0, junk: 0, updatedAt: 0 };
  if (verdict === 'PLAYER') rec.player = (rec.player || 0) + 1;
  else if (verdict === 'JUNK') rec.junk = (rec.junk || 0) + 1;
  rec.updatedAt = Date.now();
  data.learnedHosts = __uvdLearnedHosts;
  storage.set(data);
}
function __uvdLearnedVerdict(host) {
  var rec = host && __uvdLearnedHosts[host];
  if (!rec) return null;
  // Require 2 signals of the same kind to lock a verdict (avoid noise).
  if ((rec.player || 0) >= 2 && (rec.player || 0) > (rec.junk || 0)) return 'PLAYER';
  if ((rec.junk || 0) >= 2 && (rec.junk || 0) > (rec.player || 0)) return 'JUNK';
  return null;
}
// ========== CUTE USER VOTING ==========
// Users can upvote (♥ đáng yêu) or downvote (💩 rác) any iframe host or video
// host. Votes feed the self-learning counters and are synced via Supabase.
// Vote được tính theo DOMAIN (không theo từng URL — link hàng nghìn thì vote theo
// từng link vô nghĩa). Domain A tốt thì mọi link từ A đều tốt, domain B dởm thì
// mọi link từ B đều bị đánh thấp. Key vote = domain.
function __uvdVoteKeyFor(host) { return host ? 'd:' + host : ''; }
function __uvdVoteDomainKey(url) {
  if (!url) return '';
  url = String(url);
  // Key dạng 'd:host' / 'h:host' -> host.
  if (url.indexOf('d:') === 0 || url.indexOf('h:') === 0) return url.slice(2);
  // Đã là hostname trần (không có scheme) -> dùng trực tiếp.
  if (url.indexOf('://') === -1) return url.toLowerCase().replace(/^www\./, '');
  return __uvdMediaHostOf(url);
}
function __uvdVote(url) {
  var host = __uvdVoteDomainKey(url);
  if (!host) return { up: 0, down: 0 };
  var rec = data.userVotes['d:' + host];
  return rec ? { up: rec.up || 0, down: rec.down || 0 } : { up: 0, down: 0 };
}
function __uvdCastVote(url, kind, context) {
  var host = __uvdVoteDomainKey(url);
  if (!host) return;
  var key = 'd:' + host;
  var rec = data.userVotes[key] = data.userVotes[key] || { up: 0, down: 0, updatedAt: 0 };
  if (kind === 'up') rec.up = (rec.up || 0) + 1;
  else if (kind === 'down') rec.down = (rec.down || 0) + 1;
  rec.updatedAt = Date.now();
  if (host) __uvdLearnIframe(host, kind === 'up' ? 'PLAYER' : 'JUNK');
  // Feed into video host learning (separate counters).
  if (host) {
    var v = data.learnedVideos[host] = data.learnedVideos[host] || { player: 0, junk: 0, up: 0, down: 0, updatedAt: 0 };
    if (kind === 'up') { v.player = (v.player || 0) + 1; v.up = (v.up || 0) + 1; }
    else { v.junk = (v.junk || 0) + 1; v.down = (v.down || 0) + 1; }
    v.updatedAt = Date.now();
  }
  data.learnedVideos = data.learnedVideos || {};
  storage.set(data);
  var localItem = urls.get(url);
  __uvdSubmitCommunityVote(context || (localItem && localItem.type === 'IFRAME' ? 'iframe' : 'video'), host, kind);
}
// Shared feedback copy. Votes are stored locally/synced with the user's
// profile and feed the existing host/iframe learning signals.
var __uvdFeedbackNotice = '⚠️ Script không thể nhận diện chính xác 100%. Hãy chung tay vote để cải thiện script nha ♡';
function __uvdFeedbackNoticeHtml(extraClass) {
  return '<div class="uvd-feedback-note' + (extraClass ? ' ' + extraClass : '') + '">' + __uvdFeedbackNotice + '</div>';
}
function __uvdCreateDetectionVoteControls(url, context) {
  var labels = context === 'iframe'
    ? { up: '♥ Đúng player', down: '💩 Không phải player', subject: 'iframe' }
    : { up: '♥ Video đúng', down: '💩 Video sai', subject: 'video' };
  var wrap = document.createElement('div');
  wrap.className = 'uvd-feedback-actions';
  var up = document.createElement('button');
  var down = document.createElement('button');
  up.type = down.type = 'button';
  up.className = 'uvd-feedback-vote uvd-feedback-vote-up';
  down.className = 'uvd-feedback-vote uvd-feedback-vote-down';
  function refresh() {
    var tally = __uvdVote(url);
    up.textContent = labels.up + ' (' + (tally.up || 0) + ')';
    down.textContent = labels.down + ' (' + (tally.down || 0) + ')';
  }
  up.onclick = function(e) { e.stopPropagation(); __uvdCastVote(url, 'up', context); refresh(); toast('Cảm ơn cưng đã xác nhận ' + labels.subject + ' ♡'); };
  down.onclick = function(e) { e.stopPropagation(); __uvdCastVote(url, 'down', context); refresh(); toast('Đã ghi nhận ' + labels.subject + ' chưa đúng — Mèo sẽ né dần nha.'); };
  wrap.appendChild(up); wrap.appendChild(down); refresh();
  return wrap;
}
function __uvdLearnedVideoVerdict(url) {
  var host = __uvdVoteDomainKey(url);
  var rec = host && (data.learnedVideos || {})[host];
  if (!rec) return null;
  var up = Math.max(Number(rec.up) || 0, Number(rec.player) || 0);
  var down = Math.max(Number(rec.down) || 0, Number(rec.junk) || 0);
  if (down >= 2 && down > up) return 'JUNK';
  if (up >= 2 && up > down) return 'PLAYER';
  return null;
}
function __uvdIsLearnedJunkVideo(url) {
  return __uvdLearnedVideoVerdict(url) === 'JUNK';
}
function __uvdVideoScore(url, type) {
  var host = __uvdMediaHostOf(url);
  var v = host && (data.learnedVideos || {})[host];
  var score = __uvdIsRejectedVideo(url) ? -100 : 0;
  if (v) score += ((v.up || 0) * 8) - ((v.down || 0) * 12);
  // Metadata & preview bonus: a link that already has resolution/quality or a
  // thumbnail is treated as more "real" than a bare URL.
  var item = urls.get(url);
  if (item) {
    if (item.qualityCount || item.isMaster) score += 25;
    if (item.resolution) score += 15;
    if (item.demo === false) score += 10;
  }
  if (String(type || '').toUpperCase() === 'M3U8' && /master\.m3u8/i.test(url)) score += 20;
  return score;
}
// Read the latest labels already obtained in the Streams tab before opening
// the compact popup.  The tab is the canonical source for HLS level metadata
// and for a card that was intentionally marked QUALITY ONLY.
function __uvdSyncPopupMetadataFromStreamTab() {
  try {
    document.querySelectorAll('#__uvd_stream_list__ .uvd-card[data-url]').forEach(function(card) {
      var url = card.dataset && card.dataset.url;
      var item = url && urls.get(url);
      if (!item) return;
      var status = (card.querySelector('.uvd-card-status') || {}).textContent || '';
      var meta = (card.querySelector('[data-card-stream-meta]') || {}).textContent || '';
      var text = (status + ' ' + meta).toLowerCase();
      if (/quality\s*only/.test(text)) {
        item.qualityOnly = true;
        item.qualityLabel = 'QUALITY ONLY';
        return;
      }
      var qualityMatch = text.match(/(?:master\s*[··]\s*|đa chất lượng\s*[··]\s*)(\d+)\s*(?:quality|mức)/i);
      if (qualityMatch && Number(qualityMatch[1]) > 1) {
        item.qualityCount = Math.max(Number(item.qualityCount) || 0, Number(qualityMatch[1]));
        item.isMaster = true;
        item.qualityOnly = false;
        item.qualityLabel = 'ĐA CHẤT LƯỢNG';
      }
    });
  } catch(e) {}
}
function __uvdPopupQualityTier(stream) {
  var item = stream && (stream.item || urls.get(stream.url)) || {};
  // QUALITY ONLY is a fallback/limited card, never let score or recency lift
  // it above normal results. A master with 2+ levels is always the first tier.
  if (item.qualityOnly === true) return 0;
  if ((Number(item.qualityCount) || 0) > 1 || item.isMaster === true) return 3;
  if (item.resolution || (Number(item.qualityCount) || 0) > 0) return 2;
  return 1;
}
function __uvdPopupResolutionRank(item, url) {
  item = item || {};
  var width = Number(item.videoWidth || 0), height = Number(item.videoHeight || 0);
  var resolution = String(item.resolution || __uvdGetUrlResolution(url) || '');
  var dims = resolution.match(/(\d{3,4})\s*[×x]\s*(\d{3,4})/i);
  if (dims) { width = width || Number(dims[1]); height = height || Number(dims[2]); }
  var p = resolution.match(/(2160|1440|1080|720|480|360|240)p/i);
  if (p) height = Math.max(height, Number(p[1]));
  return height * 10000 + width;
}
function __uvdSortStreamsForPopup(direct) {
  __uvdSyncPopupMetadataFromStreamTab();
  return direct.slice().map(function(stream) {
    var item = urls.get(stream.url) || stream.item || {};
    return Object.assign({}, stream, { item: item });
  }).sort(function(a, b) {
    var ra = __uvdPopupResolutionRank(a.item, a.url), rb = __uvdPopupResolutionRank(b.item, b.url);
    if (ra !== rb) return rb - ra;
    var ta = __uvdPopupQualityTier(a), tb = __uvdPopupQualityTier(b);
    if (ta !== tb) return tb - ta;
    var sa = __uvdVideoScore(a.url, a.type), sb = __uvdVideoScore(b.url, b.type);
    return (sb - sa) || ((urls.get(b.url) ? (urls.get(b.url).timestamp || 0) : 0) - (urls.get(a.url) ? (urls.get(a.url).timestamp || 0) : 0));
  });
}
// Once one useful stream is fully described, more background harvesting is
// usually just duplicate HLS variants/ads. Manual Preload/Refresh still works.
var __uvdAutoScanPaused = false;
function __uvdHasUsefulStreamInList() {
  return [...urls.entries()].some(function(entry) {
    var item = entry[1] || {};
    if (!__uvdIsDiggingDirectType(item.type) || item.demo === true) return false;
    return (Number(item.qualityCount) || 0) > 0 || item.isMaster === true ||
      item.hasThumbnail === true || !!item.thumbnail || !!item.resolution ||
      (Number(item.videoWidth || 0) > 0 && Number(item.videoHeight || 0) > 0) ||
      Number(item.durationSeconds || 0) > 0;
  });
}
function __uvdPauseAutomaticScanningIfReady() {
  if (__uvdAutoScanPaused || !__uvdHasUsefulStreamInList()) return false;
  __uvdAutoScanPaused = true;
  // Stop passive network hooks and recurring digging/one-shot timers only.
  // Explicit user actions (Preload, Refresh, Play) can still request a rescan.
  try { stopLiveMonitorOnly(); } catch(e) {}
  try { __uvdStopDiggingRealtimeCapture(); } catch(e) {}
  if (typeof __uvdEpornerGateTimer !== 'undefined' && __uvdEpornerGateTimer) { clearInterval(__uvdEpornerGateTimer); __uvdEpornerGateTimer = null; }
  if (typeof __uvdOneShotCaptureTimer !== 'undefined' && __uvdOneShotCaptureTimer) { clearTimeout(__uvdOneShotCaptureTimer); __uvdOneShotCaptureTimer = null; }
  if (typeof __uvdOneShotCaptureActive !== 'undefined') __uvdOneShotCaptureActive = false;
  if (typeof __uvdLiveCaptureMode !== 'undefined') __uvdLiveCaptureMode = false;
  return true;
}
function __uvdBeginManualCaptureWindow() {
  // Manual buttons are an explicit request, so briefly re-enable capture.
  __uvdAutoScanPaused = false;
}
function __uvdRefreshCapture() {
  __uvdBeginManualCaptureWindow();
  if (__uvdIsMatthewHost()) __uvdMatthewFrozen = false;
  document.documentElement.classList.remove('uvd-page-frozen');
  installMonitor();
  __uvdInstallOneShotClickCapture();
  __uvdStartOneShotCapture('boot');
  if (data.settings.autoClickPlay) setTimeout(function() { runAutoClickAndRescan(true); }, 500);
  installPopupBlock();
  try { scan(document, 'manual-refresh'); performance.getEntriesByType('resource').forEach(function(e) { if (e.name && !isAdUrl(e.name)) findUrls(e.name, 'manual-refresh:performance'); }); } catch(e) {}
  __uvdPauseAutomaticScanningIfReady();
  debouncedBuildUI();
  toast('↻ Đã quét lại nguồn video');
}
function __uvdStartMatthewGuard() {
  if (!__uvdIsMatthewHost()) return;
  var handler = function(e) {
    var a = e.target && e.target.closest ? e.target.closest('a') : null;
    if (!a || __uvdIsOwnUI(a) || !a.href || __uvdIsAllowedExternalOpen(a.href)) return;
    try {
      var u = new URL(a.href, location.href);
      if (u.hostname !== location.hostname) { e.preventDefault(); e.stopPropagation(); __uvdBlockedCount++; }
    } catch(ex) {}
  };
  document.addEventListener('click', handler, true);
  addCleanup(function() { document.removeEventListener('click', handler, true); });
}

function __uvdAddDetectedMediaUrl(url, type, source) {
  if (!url || typeof url !== 'string' || isAdUrl(url)) return false;
  // Android browsers may expose AV1 download links before the H.264 variant.
  // Prefer the browser-safe H.264 MP4 for direct playback.
  if (/\/dload\/.*(?:-av1|_av1)\.mp4(?:[?#]|$)/i.test(url) && /Android/i.test(navigator.userAgent)) return false;
  // Bucket the media host so iframe classification can reward iframes whose
  // origin actually serves media on this page.
  __uvdFeedMediaEvidence(url);
  if (/master\.m3u8/i.test(url)) __uvdPinnedMasters.add(url);
  if (/^blob:/i.test(url)) type = 'BLOB';
  else if (__uvdIsEmbedMediaUrl(url)) type = 'IFRAME';
  else if (__uvdLooksLikeHlsUrl(url) || String(type || '').toUpperCase() === 'M3U8') type = 'M3U8';
  type = type || 'MP4';
  if (__uvdIsDiggingDirectType(type) && __uvdIsRejectedVideo(url)) return false;
  if (__uvdIsMatthewHost() && type === 'M3U8') setTimeout(__uvdFreezeMatthewPage, 0);
  var priorityMap = { M3U8: 1, MPD: 2, MP4: 3, WEBM: 4, BLOB: 8, IFRAME: 99 };
  var priority = priorityMap[type] || 6;
  var existing = urls.get(url);
  if (!existing || existing.type !== type || existing.priority > priority) {
    urls.set(url, { type: type, source: source, priority: priority, timestamp: Date.now(), sequence: ++__uvdUrlSequence, verification: 'new', isMaster: type === 'M3U8' && /master\.m3u8/i.test(url) });
    if (__uvdIsDiggingDirectType(type)) __uvdQueueMediaVerification(url);
    __uvdMarkDiggingLinkFound(url, type);
    if (__uvdUserscriptFrameMode) {
      try {
        window.top.postMessage({ type: 'umpdl-iframe-media-found', url: url, mediaType: type, source: source || 'userscript-core', pageUrl: location.href }, '*');
      } catch(e) {}
    }
    return true;
  }
  // A delayed media source may have failed its previous strict thumbnail
  // attempt; realtime sweeps may retry it after the cooldown above.
  if (existing && __uvdIsDiggingDirectType(existing.type)) __uvdQueueMediaVerification(url);
  return false;
}
function findPlaylistBodyUrls(text, source) {
  if (!text || typeof text !== 'string' || text.indexOf('#EXTM3U') === -1) return false;
  var changed = false;
  var expectingVariant = false;
  function addPlaylistUrl(raw) {
    var u = (raw || '').trim().replace(/^['"]|['"]$/g, '')
      .replace(/\\u002F/g, '/').replace(/\\\//g, '/').replace(/&amp;/g, '&').replace(/\\"/g, '');
    if (!/^https?:\/\//i.test(u)) return;
    if (__uvdAddDetectedMediaUrl(u, 'M3U8', source + ':playlist')) changed = true;
  }
  text.split(/\r?\n/).forEach(function(line) {
    var trimmed = line.trim();
    if (!trimmed) return;
    if (/^#EXT-X-STREAM-INF/i.test(trimmed)) {
      expectingVariant = true;
      return;
    }
    if (/^#EXT-X-I-FRAME-STREAM-INF/i.test(trimmed) || (/^#EXT-X-MEDIA/i.test(trimmed) && /TYPE=AUDIO/i.test(trimmed))) {
      var uri = (trimmed.match(/URI="([^"]+)"/i) || [])[1];
      if (uri) addPlaylistUrl(uri);
      return;
    }
    if (expectingVariant) {
      if (trimmed.charAt(0) !== '#') addPlaylistUrl(trimmed);
      expectingVariant = false;
    }
  });
  return changed;
}
var __uvdMediaPauseTimer = null;
function __uvdPausePageAfterMediaFound() {
  if (typeof playerState !== 'undefined' && playerState && playerState.overlay) return;
  clearTimeout(__uvdMediaPauseTimer);
  __uvdMediaPauseTimer = setTimeout(function() {
    try { pauseAllPlayingVideos(); } catch(e) {}
    setTimeout(function() { try { pauseAllPlayingVideos(); } catch(e) {} }, 700);
  }, 80);
}
function __uvdIsJwTelemetryUrl(url) {
  try {
    var parsed = new URL(url, location.href);
    return /(?:^|\.)jwpltx\.com$/i.test(parsed.hostname) && /(?:^|\/)ping\.gif$/i.test(parsed.pathname);
  } catch(e) { return /jwpltx\.com/i.test(String(url || '')) && /ping\.gif/i.test(String(url || '')); }
}
function __uvdExtractJwMediaUrl(url, source) {
  try {
    var parsed = new URL(url, location.href);
    var candidates = ['mu', 'file', 'src', 'source', 'url'];
    for (var i = 0; i < candidates.length; i++) {
      var raw = parsed.searchParams.get(candidates[i]);
      if (!raw || !/^https?:/i.test(raw)) continue;
      var mediaType = /\/m3u8\//i.test(raw) || /\.m3u8(?:[?#]|$)/i.test(raw) ? 'M3U8' : (__uvdLooksLikeHlsUrl(raw) ? 'M3U8' : 'MP4');
      if (__uvdAddDetectedMediaUrl(raw, mediaType, source + ':jwplayer-param')) return true;
    }
  } catch(e) {}
  return false;
}
function __uvdIsFalseMp4TelemetryUrl(url) {
  try {
    var parsed = new URL(url, location.href);
    return /(?:ping\.gif|beacon|analytics)/i.test(parsed.pathname) || /(?:^|\.)jwpltx\.com$/i.test(parsed.hostname);
  } catch(e) { return /(?:ping\\.gif|jwpltx\\.com)/i.test(String(url || '')); }
}
function findUrls(text, source) {
  if (!text || typeof text !== 'string' || text.length > 300000) return;
  if (text.length > 30000 && String(source || '').indexOf(':body') === -1 && String(source || '').indexOf(':playlist') === -1) return;
  var hash = text.length + source;
  if (__uvdFindUrlsCache[hash]) return;
  __uvdFindUrlsCache[hash] = true;
  var isPlaylistBody = text.indexOf('#EXTM3U') !== -1;
  var changed = findPlaylistBodyUrls(text, source);
  // Do not run generic .mp4/.ts/image URL matching over an HLS playlist.
  // Those URLs are segments, not independent streams; adding them caused
  // live capture to show hundreds of TikTok/CDN links as fake M3U8 entries.
  if (isPlaylistBody) {
    __uvdDismissIframeWorkflowIfVideoFound();
    if (changed) {
      __uvdPausePageAfterMediaFound();
    }
    return;
  }
  patterns.forEach(function(p) {
    var matches = text.match(p.re);
    if (matches) {
      matches.forEach(function(u) {
        u = u.replace(/\\u002F/g, '/').replace(/\\\//g, '/').replace(/&amp;/g, '&').replace(/\\"/g, '');
        if (/^\/\//.test(u)) u = 'https:' + u;
        if (__uvdIsJwTelemetryUrl(u)) {
          __uvdExtractJwMediaUrl(u, source);
          return;
        }
        if (p.type === 'MP4' && __uvdIsFalseMp4TelemetryUrl(u)) return;
        __uvdRememberAccessToken(u);
        // /dload/ links are explicit download buttons, not hidden playback sources.
        if (/\/dload\//i.test(u)) return;
        if (/\/dload\/.*(?:-av1|_av1)\.mp4(?:[?#]|$)/i.test(u) && /Android/i.test(navigator.userAgent)) return;
        if (__uvdIsLikelyHlsSegmentUrl(u)) return;
        if (isAdUrl(u)) {
          __uvdAdBlockedCount++;
          return;
        }
        // Use one canonical insertion path so master playlists are pinned,
        // duplicates are de-duplicated and explicit download links are ignored.
        var detectedType = __uvdLooksLikeHlsUrl(u) ? 'M3U8' : p.type;
        if (__uvdAddDetectedMediaUrl(u, detectedType, source)) {
          changed = true;
          if (['M3U8','MP4','MPD','WEBM','BLOB','TS'].indexOf(detectedType) !== -1) __uvdPausePageAfterMediaFound();
        }
      });
    }
  });
  if (urls.size > data.settings.maxStoredUrls) {
    var toRemove = urls.size - data.settings.maxStoredUrls;
    var keys = [...urls.keys()].filter(function(key) { return !__uvdPinnedMasters.has(key); }).sort(function(a, b) { return urls.get(a).timestamp - urls.get(b).timestamp; });
    for (var i = 0; i < toRemove; i++) {
      urls.delete(keys[i]);
    }
  }
  // Keep capture silent. Rebuilding the entire card list for every newly
  // seen URL was the source of the visible UI flash. Preload/Auto Play do a
  // single deliberate refresh after their capture window.
  __uvdDismissIframeWorkflowIfVideoFound();
}

function scan(doc, src, light) {
  try {
    if (doc === document && __uvdIsEmbedMediaUrl(location.href)) {
      urls.set(location.href, { type: 'IFRAME', source: 'location', priority: 99, timestamp: Date.now() });
    }
    doc.querySelectorAll('a[href],[onclick],[data-href],[data-url],[data-server]').forEach(function(el) {
      var href = el.getAttribute && (el.getAttribute('href') || el.getAttribute('data-href') || el.getAttribute('data-url') || el.getAttribute('data-server'));
      var onclick = el.getAttribute && el.getAttribute('onclick');
      var label = (el.textContent || el.getAttribute('aria-label') || '').trim().toLowerCase();
      if (href && (/server|play|watch|stream|download|\brg\b|\bsuby\b/.test(label) || /m3u8|mp4|video|stream|play|download/i.test(href))) {
        if (__uvdIsEmbedMediaUrl(href)) __uvdAddDetectedMediaUrl(href, 'IFRAME', src + ':server-link');
        else findUrls(href, src + ':server-link');
      }
      if (onclick && /window\.open|location|href|server|play|stream/i.test(onclick)) findUrls(onclick, src + ':onclick');
    });
    doc.querySelectorAll('[data-link],[data-src],[data-video-url],[data-file],[data-hls],[data-m3u8]').forEach(function(el) {
      ['data-link','data-src','data-video-url','data-file','data-hls','data-m3u8'].forEach(function(attr) {
        var value = el.getAttribute && el.getAttribute(attr);
        if (value) findUrls(value, src + ':' + attr);
      });
    });
    doc.querySelectorAll('video, source, audio').forEach(function(v) {
      var tag = (v.tagName || '').toUpperCase();
      var typeHint = ((v.getAttribute && (v.getAttribute('type') || v.getAttribute('data-type') || '')) + ' ' + (v.src || '')).toLowerCase();
      var mediaType = /m3u8|mpegurl|hls/.test(typeHint) ? 'M3U8' : (/video\//.test(typeHint) || tag === 'VIDEO' || tag === 'SOURCE' ? 'MP4' : '');
      var elementUrl = v.src || (v.getAttribute && (v.getAttribute('data-src') || v.getAttribute('data-video-url')));
      if (elementUrl) {
        if (!__uvdAddDetectedMediaUrl(elementUrl, mediaType, src + ':element')) findUrls(elementUrl, src + ':element');
        else if (mediaType) __uvdPausePageAfterMediaFound();
      }
      if (v.currentSrc) {
        if (!__uvdAddDetectedMediaUrl(v.currentSrc, mediaType, src + ':current')) findUrls(v.currentSrc, src + ':current');
      }
    });
    doc.querySelectorAll('script').forEach(function(s) {
      findUrls(s.textContent, src + ':script');
    });
    if (!light) findUrls(doc.documentElement.outerHTML, src + ':html');
    doc.querySelectorAll('iframe').forEach(function(i, idx) {
      if (i.src) {
        var iframeUrl = i.src;
        // Giữ mọi iframe có URL để ní tự quyết định chặn hay mở. Việc
        // đoán iframe quảng cáo ở đây từng làm mất nhầm player hợp lệ.
        // AI classifier chỉ gắn nhãn (PLAYER/JUNK/UNKNOWN) để ưu tiên hiển thị,
        // không tự xóa iframe nào.
        var cls = __uvdClassifyIframe(iframeUrl, i);
        urls.set(iframeUrl, { type: 'IFRAME', source: 'iframe#' + idx, priority: 99, timestamp: Date.now(), aiVerdict: cls.verdict, aiScore: cls.score, aiReasons: cls.reasons });
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
var __uvdManualServerClickUntil = 0;
var __uvdAllowedOpenUrls = {};

function __uvdAllowExternalOpen(url) {
  try { __uvdAllowedOpenUrls[new URL(url, location.href).href] = Date.now() + 15000; } catch(e) {}
}
function __uvdIsAllowedExternalOpen(url) {
  try {
    var key = new URL(url, location.href).href;
    return __uvdAllowedOpenUrls[key] && __uvdAllowedOpenUrls[key] > Date.now();
  } catch(e) { return false; }
}
function __uvdOpenAllowedExternal(url) {
  __uvdAllowExternalOpen(url);
  var opened = null;
  try {
    if (__uvdOriginalWindowOpen) opened = __uvdOriginalWindowOpen.call(window, url, '_blank');
  } catch(e) {}
  // Fallback for a stale/previous popup blocker: an allowed anchor click is
  // still initiated by the user's button tap and bypasses our own window.open hook.
  if (!opened) {
    try {
      var a = document.createElement('a');
      a.href = url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch(e) {}
  }
  return opened;
}

window.__uvdSafeOpen = function(url) {
  return __uvdOpenAllowedExternal(url);
};

function __uvdOpenIframeWindow(url) {
  __uvdAllowExternalOpen(url);
  var opened = null;
  try {
    if (__uvdOriginalWindowOpen) opened = __uvdOriginalWindowOpen.call(window, url, '_blank', 'popup,width=960,height=700,resizable=yes,scrollbars=yes');
  } catch(e) {}
  if (!opened) opened = __uvdOpenAllowedExternal(url);
  return opened;
}

function killBlankLinks(e) {
  var t = e.target;
  if (pageInfo.host === 'jav.guru' && t && t.closest && looksLikeServerButton(t.closest('button,a,[role="button"],div'))) {
    __uvdManualServerClickUntil = Date.now() + 8000;
    __uvdGrantPagePlayback(10000);
    return;
  }
  if (t.closest && (t.closest('#__uvd__') || t.closest('#__uvd_player_overlay__'))) return;
  while (t && t !== document) {
    if (t && t.tagName === 'A') {
      if (__uvdIsAllowedExternalOpen(t.href)) return;
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
  if (!window.__uvdNativeWindowOpen) window.__uvdNativeWindowOpen = window.open;
  __uvdOriginalWindowOpen = window.__uvdNativeWindowOpen;
  var blockWindowOpen = function() {
    if (pageInfo.host === 'jav.guru' && Date.now() < __uvdManualServerClickUntil && __uvdOriginalWindowOpen) {
      return __uvdOriginalWindowOpen.apply(window, arguments);
    }
    __uvdBlockedCount++;
    return null;
  };
  window.open = blockWindowOpen;
  __uvdPopupGuardTimer = setInterval(function() {
    if (__uvdPopupBlockActive && window.open !== blockWindowOpen) window.open = blockWindowOpen;
  }, 1000);
  ['click', 'mousedown', 'pointerdown', 'pointerup', 'touchend', 'auxclick'].forEach(function(type) {
    document.addEventListener(type, killBlankLinks, true);
  });
}

function uninstallPopupBlock() {
  if (!__uvdPopupBlockActive) return;
  __uvdPopupBlockActive = false;
  if (__uvdPopupGuardTimer) { clearInterval(__uvdPopupGuardTimer); __uvdPopupGuardTimer = null; }
  if (__uvdOriginalWindowOpen) window.open = __uvdOriginalWindowOpen;
  ['click', 'mousedown', 'pointerdown', 'pointerup', 'touchend', 'auxclick'].forEach(function(type) {
    document.removeEventListener(type, killBlankLinks, true);
  });
}

// ========== UNIVERSAL OVERLAY BLOCKER ==========
// The host may place transparent fixed/absolute links or panels over the
// video. Keep this scan debounced and limited to the video rectangle so it
// does not continuously walk the whole page during playback.
var __uvdOverlayBlockState = null;
function __uvdGetPageVideo() {
  var found = null;
  try {
    document.querySelectorAll('video').forEach(function(v) {
      if (found || __uvdIsOwnUI(v)) return;
      var r = v.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) found = v;
    });
  } catch(e) {}
  return found;
}
function __uvdOverlayScan() {
  var state = __uvdOverlayBlockState;
  if (!state || (typeof playerState !== 'undefined' && playerState && playerState.overlay)) return;
  var video = __uvdGetPageVideo();
  if (!video) return;
  var vr = video.getBoundingClientRect();
  if (!vr.width || !vr.height) return;
  try {
    document.querySelectorAll('a[href],div').forEach(function(el) {
      if (__uvdIsOwnUI(el) || el === video || el.contains(video) || video.contains(el)) return;
      var style = getComputedStyle(el);
      var pos = style.position;
      if (pos !== 'absolute' && pos !== 'fixed' && pos !== 'sticky') return;
      var r = el.getBoundingClientRect();
      var overlaps = !(r.right < vr.left || r.left > vr.right || r.bottom < vr.top || r.top > vr.bottom);
      if (!overlaps) return;
      var z = parseInt(style.zIndex, 10) || 0;
      var isAnchor = el.tagName === 'A';
      var isOverlayDiv = el.tagName === 'DIV' && z > 1 && !el.querySelector('video,iframe,button,input,select,textarea');
      if (!isAnchor && !isOverlayDiv) return;
      if (!state.touched.has(el)) {
        state.touched.set(el, {
          pointerEvents: el.style.pointerEvents,
          display: el.style.display,
          opacity: el.style.opacity,
          href: isAnchor ? el.getAttribute('href') : null
        });
      }
      el.style.pointerEvents = 'none';
      if (isAnchor) {
        el.style.display = 'none';
        el.removeAttribute('href');
      } else {
        el.style.opacity = '0';
      }
    });
  } catch(e) {}
}
function __uvdBlockExternalLink(e) {
  var state = __uvdOverlayBlockState;
  if (!state) return;
  var target = e.target;
  var a = target && target.closest ? target.closest('a') : null;
  if (!a || __uvdIsOwnUI(a) || !a.href || a.href.indexOf('#') === 0 || __uvdIsAllowedExternalOpen(a.href)) return;
  try {
    var url = new URL(a.href, location.href);
    if (url.hostname !== location.hostname) {
      e.preventDefault();
      e.stopPropagation();
      __uvdBlockedCount++;
    }
  } catch(ex) {}
}
function installUniversalOverlayBlocker() {
  // Jav Guru uses clickable JS server buttons; the overlay detector can
  // mistake their container for an ad layer and make the buttons inert.
  if (pageInfo.host === 'jav.guru' || /(?:^|\.)morencius\.com$/i.test(pageInfo.host) || __uvdIsProtectedInteractivePlayer()) return;
  if (__uvdOverlayBlockState) return;
  var state = __uvdOverlayBlockState = { scanTimer: null, interval: null, observer: null, touched: new Map() };
  state.schedule = function() {
    clearTimeout(state.scanTimer);
    state.scanTimer = setTimeout(__uvdOverlayScan, 300);
  };
  ['click', 'pointerup', 'touchend', 'auxclick'].forEach(function(type) { document.addEventListener(type, __uvdBlockExternalLink, true); });
  state.observer = new MutationObserver(state.schedule);
  try { state.observer.observe(document.body, { childList: true, subtree: true }); } catch(e) {}
  state.interval = setInterval(state.schedule, 3500);
  state.schedule();
}
function uninstallUniversalOverlayBlocker() {
  var state = __uvdOverlayBlockState;
  if (!state) return;
  clearTimeout(state.scanTimer);
  if (state.interval) clearInterval(state.interval);
  if (state.observer) state.observer.disconnect();
  ['click', 'pointerup', 'touchend', 'auxclick'].forEach(function(type) { document.removeEventListener(type, __uvdBlockExternalLink, true); });
  state.touched.forEach(function(original, el) {
    try {
      el.style.pointerEvents = original.pointerEvents;
      el.style.display = original.display;
      el.style.opacity = original.opacity;
      if (original.href !== null) el.setAttribute('href', original.href);
    } catch(e) {}
  });
  __uvdOverlayBlockState = null;
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
    __uvdGrantPagePlayback(8000);
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

function __uvdLooksLikePlayElement(el) {
  if (!el || __uvdIsOwnUI(el)) return false;
  var text = (el.textContent || '').trim().toLowerCase();
  var id = (el.id || '').toLowerCase();
  var cls = (typeof el.className === 'string' ? el.className : '').toLowerCase();
  var aria = (el.getAttribute && (el.getAttribute('aria-label') || '') || '').toLowerCase();
  return /play|start|watch|overlay|playback|xem|phát/.test(text + ' ' + id + ' ' + cls + ' ' + aria);
}
function __uvdLearnPlaySelector(e) {
  var target = e && e.target;
  if (!target || __uvdIsOwnUI(target)) return;
  var el = target.closest && target.closest('button,a,[role="button"],[id],[class]');
  if (!el || (pageInfo.host === 'jav.guru' && looksLikeServerButton(el)) || !__uvdLooksLikePlayElement(el)) return;
  var selector = __uvdElementSelector(el);
  if (!selector) return;
  data.siteProfiles[pageInfo.host] = data.siteProfiles[pageInfo.host] || {};
  if (data.siteProfiles[pageInfo.host].playSelector === selector) return;
  data.siteProfiles[pageInfo.host].playSelector = selector;
  storage.set(data);
  console.info('[Mèo cào media] Đã học Play selector cho ' + pageInfo.host + ': ' + selector);
}
function installPlaySelectorLearning() {
  document.addEventListener('click', __uvdLearnPlaySelector, true);
  addCleanup(function() { document.removeEventListener('click', __uvdLearnPlaySelector, true); });
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
  if (pageInfo.host === 'supjav.com') {
    var supjavButtons = collectFallbackButtons(root);
    supjavButtons.__uvdFallback = true;
    return supjavButtons;
  }
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
    var beforeDirect = [...urls.values()].filter(function(item) {
      return ['M3U8','MP4','MPD','WEBM','BLOB','TS'].indexOf(item.type) !== -1;
    }).length;
    if (!simulateClick(el)) { tryNext(); return; }
    recordClickedButton(el, sel, isFallback);
    setTimeout(function() {
      scan(document, 'seq-autoclick');
      pauseAllPlayingVideos();
      var afterDirect = [...urls.values()].filter(function(item) {
        return ['M3U8','MP4','MPD','WEBM','BLOB','TS'].indexOf(item.type) !== -1;
      }).length;
      // A supremejav server URL is only an intermediate page; do not report
      // it as a successful media link and keep trying the other servers.
      if (afterDirect > beforeDirect) {
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
  ov.className = 'uvd-settings-overlay uvd-settings-clean';
  ov.innerHTML =
    '<div class="uvd-settings-sheet">' +
      '<div class="uvd-settings-hero">' +
        '<span class="uvd-settings-hero-mascot">' + (typeof __uvdTabMascotPanda !== 'undefined' ? __uvdTabMascotPanda : __uvdHeaderMascot) + '</span>' +
        '<div class="uvd-settings-hero-text">' +
          '<div class="uvd-settings-hero-title">Cài đặt Mèo cào media ♡</div>' +
          '<div class="uvd-settings-hero-sub">Chỉnh cho cưng xinh xắn nè 🎀 Mèo gợi ý: cứ bấm thoải mái, phần hướng dẫn ở dưới cùng nha!</div>' +
        '</div>' +
      '</div>' +
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

function __uvdStopThumbnailHls() {
  try {
    document.querySelectorAll('.uvd-thumb-video').forEach(function(video) {
      var preview = video.closest('.uvd-card-preview');
      var hls = preview && preview.__uvdThumbHls;
      if (hls) { try { hls.destroy(); } catch(e) {} preview.__uvdThumbHls = null; }
      try { video.pause(); } catch(e) {}
    });
  } catch(e) {}
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

// ========== LOW POWER PLAYBACK MODE ==========
var __uvdLowPowerMode = false;
function __uvdStartAutoplayObserver() {
  try { __uvdAutoplayObserver.observe(document.body, { childList: true, subtree: false }); } catch(e) {}
}
function __uvdEnterLowPowerMode() {
  if (__uvdLowPowerMode) return;
  __uvdLowPowerMode = true;
  if (!/eporner\./i.test(pageInfo.host)) {
    stopLiveMonitorOnly();
    try { __uvdAutoplayObserver.disconnect(); } catch(e) {}
    try { uninstallUniversalOverlayBlocker(); } catch(e) {}
  }
  // Do not freeze the host page: users must still be able to click server
  // buttons while UMP is hidden/low-power. Popup blocking remains active.
  document.documentElement.classList.remove('uvd-page-frozen');
  var panel = document.getElementById('__uvd__');
  if (panel) panel.style.display = 'none';
  toast('🔋 Đã giảm tải nền — video vẫn tiếp tục phát');
}
function __uvdExitLowPowerMode() {
  if (!__uvdLowPowerMode) return;
  __uvdLowPowerMode = false;
  document.documentElement.classList.remove('uvd-page-frozen');
  installMonitor();
  if (!__uvdPopupBlockActive) installPopupBlock();
  var panel = document.getElementById('__uvd__');
  if (panel) panel.style.display = '';
  toast('☀️ Đã bật lại giám sát UMP');
}

// ========== LIVE MONITORING ==========
var originalFetch = window.fetch;
var originalXHROpen = XMLHttpRequest.prototype.open;
var __uvdPerformanceObserver = null;
var monitorActive = false;

function installMonitor() {
  if (__uvdAutoScanPaused || monitorActive) return;
  monitorActive = true;
  window.fetch = function() {
    var url = arguments[0];
    if (typeof url === 'string') {
      __uvdRememberAccessToken(url);
      if (!isAdUrl(url) && !__uvdIsLikelyHlsSegmentUrl(url)) findUrls(url, 'fetch:live');
    } else if (url && url.url) {
      __uvdRememberAccessToken(url.url);
      if (!isAdUrl(url.url) && !__uvdIsLikelyHlsSegmentUrl(url.url)) findUrls(url.url, 'fetch:live');
    }
    var requestPromise = originalFetch.apply(this, arguments);
    Promise.resolve(requestPromise).then(function(response) {
      try {
        var responseUrl = response && response.url;
        var contentType = response && response.headers && (response.headers.get('content-type') || '');
        if (responseUrl && !isAdUrl(responseUrl)) {
          if (/mpegurl/i.test(contentType)) __uvdAddDetectedMediaUrl(responseUrl, 'M3U8', 'fetch:manifest');
          else findUrls(responseUrl, 'fetch:response');
        }
        var inspectResponseBody = /mpegurl/i.test(contentType) ||
          (/json/i.test(contentType) && /api|source|video|media|play|stream|manifest|playlist/i.test(responseUrl || '')) ||
          /m3u8|manifest|playlist/i.test(responseUrl || '');
        if (response && response.clone && inspectResponseBody) {
          response.clone().text().then(function(body) {
            findUrls(body, 'fetch:body');
          }).catch(function() {});
        }
      } catch(e) {}
    }).catch(function() {});
    return requestPromise;
  };
  XMLHttpRequest.prototype.open = function(method, url) {
    __uvdRememberAccessToken(url);
    if (url && !isAdUrl(url) && !__uvdIsLikelyHlsSegmentUrl(url)) findUrls(url, 'xhr:live');
    if (!this.__uvdBodyHooked) {
      this.__uvdBodyHooked = true;
      this.addEventListener('load', function() {
        try {
          var xhrType = this.getResponseHeader('content-type') || '';
          var xhrBody = typeof this.responseText === 'string' ? this.responseText : '';
          if (this.responseURL && !isAdUrl(this.responseURL)) {
            if (/mpegurl/i.test(xhrType) || xhrBody.indexOf('#EXTM3U') !== -1) __uvdAddDetectedMediaUrl(this.responseURL, 'M3U8', 'xhr:manifest');
            else findUrls(this.responseURL, 'xhr:response');
          }
          if (xhrBody) findUrls(xhrBody, 'xhr:body');
        } catch(e) {}
      });
    }
    return originalXHROpen.apply(this, arguments);
  };
  if (typeof PerformanceObserver !== 'undefined') {
    try {
      __uvdPerformanceObserver = new PerformanceObserver(function(list) {
        list.getEntries().forEach(function(entry) {
          if (entry && entry.name) { __uvdRememberAccessToken(entry.name); }
          if (entry && entry.name && !isAdUrl(entry.name) && !__uvdIsLikelyHlsSegmentUrl(entry.name)) { if (/\.m3u8(?:[?#]|$)/i.test(entry.name)) __uvdAddDetectedMediaUrl(entry.name, 'M3U8', 'network:observer:manifest'); else findUrls(entry.name, 'network:observer'); }
        });
      });
      __uvdPerformanceObserver.observe({ type: 'resource', buffered: true });
      addCleanup(function() {
        if (__uvdPerformanceObserver) {
          __uvdPerformanceObserver.disconnect();
          __uvdPerformanceObserver = null;
        }
      });
    } catch(e) {}
  }
}

function stopLiveMonitorOnly() {
  window.fetch = originalFetch;
  XMLHttpRequest.prototype.open = originalXHROpen;
  if (__uvdPerformanceObserver) {
    try { __uvdPerformanceObserver.disconnect(); } catch(e) {}
    __uvdPerformanceObserver = null;
  }
  monitorActive = false;
}
function stopMonitor() {
  stopLiveMonitorOnly();
  uninstallPopupBlock();
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
var __uvdPagePlaybackGraceUntil = 0;
function __uvdGrantPagePlayback(ms) {
  __uvdPagePlaybackGraceUntil = Math.max(__uvdPagePlaybackGraceUntil, Date.now() + (ms || 8000));
}
function __uvdPagePlaybackAllowed() {
  return __uvdScriptHidden || /(?:^|\.)morencius\.com$/i.test(pageInfo.host) || Date.now() < __uvdPagePlaybackGraceUntil;
}
function __uvdIsAllowedMedia(el) {
  return !!(el && (el.__uvdAllow || el.id === '__uvd_player_video__'));
}
HTMLMediaElement.prototype.play = function() {
  if (data.settings.blockAutoplay && !__uvdIsAllowedMedia(this) && !__uvdPagePlaybackAllowed()) {
    var self = this;
    self.__uvdPausedByUvd = true;
    setTimeout(function() { try { self.pause(); } catch(e) {} }, 0);
    return Promise.reject(new DOMException('UVD: autoplay blocked', 'NotAllowedError'));
  }
  return __uvdNativeMediaPlay.apply(this, arguments);
};
addCleanup(function() { HTMLMediaElement.prototype.play = __uvdNativeMediaPlay; });

function __uvdNeutralizeMedia(el) {
  if (!el || __uvdIsAllowedMedia(el) || __uvdPagePlaybackAllowed()) return;
  var mediaUrl = el.currentSrc || el.src || '';
  if (mediaUrl && isAdUrl(mediaUrl)) {
    try { el.muted = true; el.volume = 0; el.pause(); el.removeAttribute('autoplay'); } catch(e) {}
    return;
  }
  try {
    el.removeAttribute('autoplay');
    el.autoplay = false;
    if (!el.paused) { el.__uvdPausedByUvd = true; el.pause(); }
  } catch(e) {}
}
function __uvdBlockPlayEvent(e) {
  if (!data.settings.blockAutoplay || __uvdPagePlaybackAllowed()) return;
  var el = e.target;
  if (el && (el.tagName === 'VIDEO' || el.tagName === 'AUDIO') && !__uvdIsAllowedMedia(el)) {
    try { el.__uvdPausedByUvd = true; el.pause(); } catch(err) {}
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
  if (!data.settings.blockAutoplay || __uvdPagePlaybackAllowed()) return;
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

// ========== AD GATE CAPTURE (EPORNER) ==========
// First inspect only data that the page already exposes (DOM scripts, source
// tags and resource timing). No ad/play click is synthesized and no protected
// API is guessed. If a public playlist is not exposed, the normal post-gate
// watcher below remains the safe fallback.
var __uvdEpornerPreAdProbeTimer = null;
var __uvdEpornerPreAdFound = false;
function __uvdStartEpornerPreAdProbe() {
  if (!/eporner\./i.test(pageInfo.host) || __uvdEpornerPreAdProbeTimer) return;
  var startedAt = Date.now();
  function stop() {
    if (__uvdEpornerPreAdProbeTimer) clearInterval(__uvdEpornerPreAdProbeTimer);
    __uvdEpornerPreAdProbeTimer = null;
  }
  function probe() {
    if (__uvdAutoScanPaused || Date.now() - startedAt > 9000 || (playerState && playerState.overlay)) { stop(); return; }
    try {
      // Light scan includes <video>, <source>, data-* and inline player config
      // without walking/clicking an ad gate.
      scan(document, 'eporner:pre-ad', true);
      document.querySelectorAll('script').forEach(function(script) {
        var text = script.textContent || '';
        if (/m3u8|master|playlist|hls/i.test(text)) findUrls(text, 'eporner:pre-ad:script');
      });
      performance.getEntriesByType('resource').forEach(function(entry) {
        var name = entry && entry.name || '';
        if (!name || isAdUrl(name) || __uvdIsLikelyHlsSegmentUrl(name)) return;
        if (/\.m3u8(?:[?#]|$)|(?:master|playlist|manifest)/i.test(name)) __uvdAddDetectedMediaUrl(name, 'M3U8', 'eporner:pre-ad:resource');
      });
      var publicPlaylist = [...urls.entries()].some(function(entry) {
        var item = entry[1] || {};
        return item.type === 'M3U8' && (/eporner:pre-ad:script/i.test(item.source || '') || /master|playlist|manifest/i.test(entry[0]));
      });
      if (publicPlaylist) { __uvdEpornerPreAdFound = true; stop(); }
    } catch(e) {}
  }
  probe();
  if (!__uvdEpornerPreAdFound) __uvdEpornerPreAdProbeTimer = setInterval(probe, 650);
  addCleanup(stop);
}
var __uvdEpornerGateTimer = null;
function __uvdStartEpornerAdGate() {
  if (!/eporner\./i.test(pageInfo.host) || __uvdEpornerPreAdFound || __uvdEpornerGateTimer) return;
  var seen = {};
  var startedAt = Date.now();
  __uvdGrantPagePlayback(30000);
  var gateClick = function() { __uvdGrantPagePlayback(30000); };
  document.addEventListener('click', gateClick, true);
  function tick() {
    if (__uvdAutoScanPaused) { clearInterval(__uvdEpornerGateTimer); __uvdEpornerGateTimer = null; return; }
    if (Date.now() - startedAt > 180000 || (playerState && playerState.overlay)) return;
    try {
      document.querySelectorAll('video').forEach(function(video) {
        if (__uvdIsOwnUI(video)) return;
        // Let the page's ad gate run silently; do not click Play or open ads.
        video.muted = true;
        video.defaultMuted = true;
        video.volume = 0;
      });
      performance.getEntriesByType('resource').forEach(function(entry) {
        var name = entry && entry.name;
        if (!name || isAdUrl(name) || !/\.m3u8(?:[?#]|$)/i.test(name) || seen[name]) return;
        seen[name] = true;
        if (__uvdAddDetectedMediaUrl(name, 'M3U8', 'eporner:ad-gate')) {
          if (/master\.m3u8/i.test(name)) {
            clearInterval(__uvdEpornerGateTimer);
            __uvdEpornerGateTimer = null;
            __uvdLiveUiDirty = false;
            if (document.getElementById('__uvd__')) debouncedBuildUI();
            toast('✅ Đã bắt được master HLS sau bước quảng cáo');
          }
        }
      });
    } catch(e) {}
  }
  tick();
  if (!__uvdAutoScanPaused) __uvdEpornerGateTimer = setInterval(tick, 1200);
  addCleanup(function() { clearInterval(__uvdEpornerGateTimer); __uvdEpornerGateTimer = null; document.removeEventListener('click', gateClick, true); });
}

var __uvdOneShotCaptureTimer = null;
var __uvdOneShotCaptureActive = false;
function __uvdFinishOneShotCapture() {
  if (!__uvdOneShotCaptureActive) return;
  try {
    scan(document, 'one-shot-final');
    performance.getEntriesByType('resource').forEach(function(entry) {
      if (!entry || !entry.name || isAdUrl(entry.name)) return;
      if (/\.m3u8(?:[?#]|$)/i.test(entry.name)) __uvdAddDetectedMediaUrl(entry.name, 'M3U8', 'one-shot:manifest');
      else findUrls(entry.name, 'one-shot:performance');
    });
  } catch(e) {}
  __uvdOneShotCaptureActive = false;
  __uvdLiveCaptureMode = false;
  if (__uvdOneShotCaptureTimer) { clearTimeout(__uvdOneShotCaptureTimer); __uvdOneShotCaptureTimer = null; }
  stopLiveMonitorOnly();
  debouncedBuildUI();
}
function __uvdStartOneShotCapture(reason) {
  __uvdStartHardEmbedBlocker();
  if (__uvdOneShotCaptureActive) return;
  __uvdOneShotCaptureActive = true;
  __uvdLiveCaptureMode = true;
  installMonitor();
  clearTimeout(__uvdOneShotCaptureTimer);
  __uvdOneShotCaptureTimer = setTimeout(__uvdFinishOneShotCapture, reason === 'boot' ? 2200 : 10000);
}
function __uvdInstallOneShotClickCapture() {
  var handler = function(e) {
    if (__uvdIsOwnUI(e.target)) return;
    var el = e.target && e.target.closest ? e.target.closest('button,a,[role="button"],[class],[id]') : null;
    if (!el) return;
    if (__uvdLooksLikePlayElement(el) || looksLikeServerButton(el)) __uvdStartOneShotCapture('user');
  };
  document.addEventListener('click', handler, true);
  addCleanup(function() { document.removeEventListener('click', handler, true); });
}

// ========== HARD EMBED BLOCKER ==========
var __uvdHardEmbedBlockerActive = false;
var __uvdHardEmbedBlockerTimer = null;
var __uvdHardEmbedHidden = [];
function __uvdIsProtectedInteractivePlayer() {
  return /(?:^|\.)player\.upn\.one$/i.test(location.hostname);
}
function __uvdHardEmbedIsPage() {
  if (__uvdIsProtectedInteractivePlayer()) return false;
  return /videoplay|streamtape|mixdrop|miixdrop|vinovo|javxxx|upload18/i.test(location.hostname) || /\/e\//i.test(location.pathname) || !!document.querySelector('video');
}
function __uvdHardEmbedScan() {
  var video = document.querySelector('video');
  if (!video || !video.getBoundingClientRect) return;
  var vr = video.getBoundingClientRect();
  document.querySelectorAll('a,div').forEach(function(el) {
    if (!el || el === video || el.contains(video) || video.contains(el) || __uvdIsOwnUI(el)) return;
    var s = getComputedStyle(el), r = el.getBoundingClientRect();
    var overlap = !(r.right < vr.left || r.left > vr.right || r.bottom < vr.top || r.top > vr.bottom);
    var positioned = s.position === 'absolute' || s.position === 'fixed' || s.position === 'sticky';
    if (!overlap || !positioned) return;
    var z = parseInt(s.zIndex, 10) || 0;
    var text = ((el.id || '') + ' ' + (typeof el.className === 'string' ? el.className : '') + ' ' + (el.textContent || '')).toLowerCase();
    var adLike = /ad|advert|popup|popunder|overlay|banner|click|redirect|traffic/.test(text);
    if (el.tagName === 'A' && (adLike || z > 1)) {
      el.style.setProperty('pointer-events', 'none', 'important');
      el.style.setProperty('display', 'none', 'important');
      el.removeAttribute('href');
      __uvdHardEmbedHidden.push(el);
    } else if (el.tagName === 'DIV' && z > 1 && adLike && !el.querySelector('video,iframe,button,input,select,textarea')) {
      el.style.setProperty('pointer-events', 'none', 'important');
      el.style.setProperty('opacity', '0', 'important');
      __uvdHardEmbedHidden.push(el);
    }
  });
}
function __uvdStartHardEmbedBlocker() {
  if (__uvdHardEmbedBlockerActive || !__uvdHardEmbedIsPage()) return;
  __uvdHardEmbedBlockerActive = true;
  installPopupBlock();
  __uvdHardEmbedScan();
  __uvdHardEmbedBlockerTimer = setInterval(__uvdHardEmbedScan, 700);
  addCleanup(function() {
    if (__uvdHardEmbedBlockerTimer) clearInterval(__uvdHardEmbedBlockerTimer);
    __uvdHardEmbedBlockerTimer = null;
    __uvdHardEmbedBlockerActive = false;
    __uvdHardEmbedHidden.forEach(function(el) { if (el && el.isConnected) { el.style.pointerEvents = ''; el.style.display = ''; el.style.opacity = ''; } });
    __uvdHardEmbedHidden = [];
  });
}

// ========== JAVHUB AD/BANNER CLEANUP ==========
var __uvdJavhubHidden = [];
var __uvdJavhubAdObserver = null;
function __uvdIsJavhubPage() { return /(?:^|\\.)javhub\\.net$/i.test(location.hostname); }
function __uvdHideJavhubAds() {
  if (!__uvdIsJavhubPage()) return;
  var selectors = [
    'iframe[src*="bluetrafficstream"]',
    'a[href*="bluetrafficstream"]',
    'a[href*="/membership"]',
    '[id*="banner"]','[class*="banner"]',
    '[id*="advert"]','[class*="advert"]',
    '[id*="popunder"]','[class*="popunder"]',
    '[id*="popup"]','[class*="popup"]'
  ].join(',');
  document.querySelectorAll(selectors).forEach(function(el) {
    if (!el || el.closest('#__uvd__') || el.closest('#__uvd_player_overlay__')) return;
    var target = el;
    if (el.matches('a[href*="/membership"]') && el.parentElement && el.parentElement.querySelector('img')) target = el.parentElement;
    if (target.dataset.uvdJavhubHidden) return;
    target.dataset.uvdJavhubHidden = '1';
    target.dataset.uvdJavhubDisplay = target.style.display || '';
    target.style.setProperty('display', 'none', 'important');
    __uvdJavhubHidden.push(target);
  });
}
function __uvdStartJavhubAdGuard() {
  if (!__uvdIsJavhubPage()) return;
  __uvdHideJavhubAds();
  __uvdJavhubAdObserver = new MutationObserver(function() { __uvdHideJavhubAds(); });
  __uvdJavhubAdObserver.observe(document.documentElement, { childList: true, subtree: true });
  var adClickHandler = function(e) {
    var link = e.target && e.target.closest ? e.target.closest('a,button,[role="button"]') : null;
    if (!link || link.closest('#__uvd__') || link.closest('#__uvd_player_overlay__')) return;
    var href = link.href || link.getAttribute('data-href') || '';
    if (/bluetrafficstream|popunder|popup|ad[s_-]?/i.test(href)) {
      e.preventDefault(); e.stopPropagation(); __uvdBlockedCount++;
    }
  };
  document.addEventListener('click', adClickHandler, true);
  addCleanup(function() {
    document.removeEventListener('click', adClickHandler, true);
    if (__uvdJavhubAdObserver) { __uvdJavhubAdObserver.disconnect(); __uvdJavhubAdObserver = null; }
    __uvdJavhubHidden.forEach(function(el) {
      if (el && el.dataset.uvdJavhubHidden) {
        el.style.display = el.dataset.uvdJavhubDisplay || '';
        delete el.dataset.uvdJavhubHidden;
        delete el.dataset.uvdJavhubDisplay;
      }
    });
    __uvdJavhubHidden = [];
  });
}

// ========== EMBED DIRECT MEDIA CAPTURE ==========
function __uvdStartEmbedDirectCapture() {
  if (!/(?:^|\\.)streamtape\\.com$|(?:^|\\.)miixdrop(?:\\.[a-z]+)?$|(?:^|\\.)mixdrop(?:\\.[a-z]+)?$|(?:^|\\.)vinovo(?:\\.[a-z]+)?$|(?:^|\\.)javxxx\\.me$|(?:^|\\.)upload18\\.org$/i.test(location.hostname)) return;
  var timer = null;
  var poll = null;
  var scanMedia = function() {
    if (__uvdAutoScanPaused) { clearTimeout(timer); clearInterval(poll); return; }
    try {
      document.querySelectorAll('video,source,audio').forEach(function(el) {
        var u = el.currentSrc || el.src || el.getAttribute('src') || el.getAttribute('data-src') || '';
        if (u && !/^blob:/i.test(u)) __uvdAddDetectedMediaUrl(u, /m3u8/i.test(u) ? 'M3U8' : 'MP4', 'embed:media-event');
      });
      performance.getEntriesByType('resource').forEach(function(entry) {
        if (!entry || !entry.name || isAdUrl(entry.name)) return;
        if (/(?:tapecontent\\.net|mxcontent\\.net|vincdn\\.net|miixdrop|mixdrop|vinovo|upload18)/i.test(entry.name)) findUrls(entry.name, 'embed:resource');
        // Some custom players hide the playlist behind a blob/MediaSource. A
        // resource URL with these playlist hints is useful even without a
        // .m3u8 suffix.
        else if (/(?:m3u8|hls|manifest|playlist|master|media\\?|stream|segments?)/i.test(entry.name)) {
          __uvdAddDetectedMediaUrl(entry.name, 'M3U8', 'embed:resource:playlist');
        }
      });
      scan(document, 'embed:rescan', true);
    } catch(e) {}
  };
  var onMediaEvent = function(e) {
    if (!e.target || !/^(VIDEO|AUDIO|SOURCE)$/.test(e.target.tagName)) return;
    scanMedia();
    clearTimeout(timer);
    timer = setTimeout(scanMedia, 500);
  };
  document.addEventListener('play', onMediaEvent, true);
  document.addEventListener('loadedmetadata', onMediaEvent, true);
  document.addEventListener('canplay', onMediaEvent, true);
  poll = setInterval(scanMedia, 1200);
  addCleanup(function() {
    clearTimeout(timer);
    clearInterval(poll);
    document.removeEventListener('play', onMediaEvent, true);
    document.removeEventListener('loadedmetadata', onMediaEvent, true);
    document.removeEventListener('canplay', onMediaEvent, true);
  });
  scanMedia();
}

// ========== USERSCRIPT IFRAME BRIDGE ==========
function __uvdRequestIframeBridgeReplay() {
  try {
    document.querySelectorAll('iframe').forEach(function(frame) {
      if (frame.contentWindow) frame.contentWindow.postMessage({ type: 'umpdl-iframe-bridge-request' }, '*');
    });
  } catch(e) {}
}
function __uvdInstallIframeBridgeReceiver() {
  if (window.__uvdIframeBridgeReceiverInstalled) return;
  window.__uvdIframeBridgeReceiverInstalled = true;
  window.addEventListener('message', function (event) {
    var data = event && event.data;
    if (!data || (data.type !== 'umpdl-iframe-media-found' && data.type !== 'umpdl-iframe-bridge-ready')) return;
    if (data.pageUrl) {
      try {
        var pageOrigin = new URL(data.pageUrl).origin;
        if (event.origin !== pageOrigin) return;
      } catch (e) { return; }
    }
    if (data.type === 'umpdl-iframe-bridge-ready') {
      try { event.source.postMessage({ type: 'umpdl-iframe-bridge-request' }, event.origin); } catch (e) {}
      return;
    }
    if (data.type === 'umpdl-iframe-media-found' && data.url) {
      if (__uvdAddDetectedMediaUrl(data.url, data.mediaType || 'MP4', 'userscript:' + (data.source || 'iframe'))) {
        debouncedBuildUI();
        toast('🔗 Userscript đã bắt được ' + (data.mediaType || 'media') + ' trong iframe');
      }
    }
  });
}

// ========== INIT ==========
try {
  __uvdInstallIframeBridgeReceiver();
  setTimeout(__uvdRequestIframeBridgeReplay, 100);
  setTimeout(__uvdRequestIframeBridgeReplay, 1200);
  window.__uvdBootPhase = 'scan';
  scan(document, 'main');
  try { performance.getEntriesByType('resource').forEach(function(e) { if (!e || !e.name || isAdUrl(e.name)) return; if (/\.m3u8(?:[?#]|$)/i.test(e.name)) __uvdAddDetectedMediaUrl(e.name, 'M3U8', 'network:perf:manifest'); else findUrls(e.name, 'network:perf'); }); } catch(e) {}
  window.__uvdBootPhase = 'monitor';
  installMonitor();
  installPopupBlock();
  __uvdStartEpornerPreAdProbe();
  setTimeout(function() { if (!__uvdEpornerPreAdFound) __uvdStartEpornerAdGate(); }, 1800);
  __uvdStartJavhubAdGuard();
  __uvdStartEmbedDirectCapture();
  installUniversalOverlayBlocker();
  __uvdStartAutoplayObserver();
  __uvdStartMatthewGuard();
  installPlaySelectorLearning();
  installIframeWorkflowVideoWatcher();
  // At 20s, keep the digging popup visible and offer its iframe route;
  // the iframe list itself opens only after the user taps “Vào link”.
  if (data.settings.aiIframeFilter) setTimeout(function() {
    if (__uvdDiggingFlow.active) __uvdUpdateDiggingIframeReady();
  }, __uvdDiggingWaitMs);
  // If real (non-junk) video links were captured, offer a cute popup listing
  // them so the user can tap to watch directly.
  setTimeout(function() { __uvdMaybeOfferMediaPopup(false); }, 3500);
  if (data.settings.autoClickPlay) setTimeout(function() { runAutoClickAndRescan(true); }, 500);
  // SupJAV exposes its real servers behind short labels (RG/SUBY/etc.).
  // Try those server controls automatically after the initial scan; do not
  // auto-click generic Play buttons on this host because they trigger ads.
} catch (initError) {
  __uvdReportBootError(initError);
}

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
  __uvdBuildUIDebounce = setTimeout(buildUI, 700);
}
var __uvdLiveUiRefreshTimer = null;
var __uvdLastLiveUiRefresh = 0;
var __uvdLiveCaptureMode = false;
var __uvdLiveUiDirty = false;
function scheduleLiveUiRefresh() {
  if (__uvdLiveCaptureMode) {
    __uvdLiveUiDirty = true;
    return;
  }
  if (__uvdEpornerGateTimer) { __uvdLiveUiDirty = true; return; }
  if (!document.getElementById('__uvd__') || (playerState && playerState.overlay)) return;
  var wait = Math.max(0, 1800 - (Date.now() - __uvdLastLiveUiRefresh));
  clearTimeout(__uvdLiveUiRefreshTimer);
  __uvdLiveUiRefreshTimer = setTimeout(function() {
    __uvdLastLiveUiRefresh = Date.now();
    debouncedBuildUI();
  }, wait);
}

function runAutoClickAndRescan(silent) {
  if (silent && __uvdAutoScanPaused) return;
  var beforeCount = urls.size;
  var lastCount = beforeCount;
  var clicked = 0;
  installPopupBlock();
  clicked = autoClickPlayButtons(document, 0, !silent, !silent);
  var delays = [1200, 2400]; // giảm số lần rescan
  var reportedAt = -1;
  delays.forEach(function(delay, idx) {
    setTimeout(function() {
      if (playerState.overlay || (silent && __uvdAutoScanPaused)) return;
      scan(document, 'autoclick-rescan');
      var afterCount = urls.size;
      var newSinceLast = afterCount - lastCount;
      lastCount = afterCount;
      if (newSinceLast <= 0) {
        if (idx === delays.length - 1 && reportedAt !== -1 && document.getElementById('__uvd__')) debouncedBuildUI();
        if (idx === delays.length - 1 && !silent && reportedAt === -1) {
          toast(clicked > 0 ? 'Đã bấm Play nhưng chưa thấy link mới — site này có thể chặn click giả lập, thử bấm tay' : 'Không tìm thấy nút Play trên trang này');
        }
        return;
      }
      var totalFound = afterCount - beforeCount;
      if (reportedAt === -1) {
        reportedAt = idx;
        setTimeout(function() {
          var n = pauseAllPlayingVideos();
          if (n > 0) toast('⏸ Đã tạm dừng video gốc, xem qua player script cho ổn định');
        }, 800);
      }
      // Rebuild once after the capture window, not once per discovered variant.
      if (idx === delays.length - 1 && document.getElementById('__uvd__')) debouncedBuildUI();
    }, delay);
  });
}

function runPreloadCapture() {
  __uvdBeginManualCaptureWindow();
  __uvdStartHardEmbedBlocker();
  installMonitor();
  installPopupBlock();
  __uvdLiveCaptureMode = true;
  __uvdLiveUiDirty = false;
  toast('⏺ Đã bật bắt link realtime — giờ hãy bấm Play thật trên trang');
  var delays = [0, 700, 1800, 3500, 6000];
  delays.forEach(function(delay) {
    setTimeout(function() {
      try {
        scan(document, 'preload', delay !== 0);
        __uvdDismissIframeWorkflowIfVideoFound();
        performance.getEntriesByType('resource').forEach(function(entry) {
          if (!isAdUrl(entry.name)) { if (/\.m3u8(?:[?#]|$)/i.test(entry.name)) __uvdAddDetectedMediaUrl(entry.name, 'M3U8', 'preload:manifest'); else findUrls(entry.name, 'preload:performance'); }
        });
      } catch(e) {}
      if (delay === delays[delays.length - 1]) {
        __uvdLiveCaptureMode = false;
        __uvdPauseAutomaticScanningIfReady();
        if (__uvdLiveUiDirty) {
          __uvdLiveUiDirty = false;
          scheduleLiveUiRefresh();
        }
      } else {
        scheduleLiveUiRefresh();
      }
    }, delay);
  });
}
window.__uvd_preload = function() { runPreloadCapture(); };

window.__uvd_autoClickPlay = function() { runAutoClickAndRescan(false); };

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
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).catch(function() {
      var ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove();
    });
    return;
  }
  var ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove();
}

function toast(msg, color) {
  // Toast nằm dưới đáy, xếp chồng không đè lên nhau (tránh trùng vị trí header/UI).
  var wrap = document.getElementById('__uvd_toast_wrap__');
  if (!wrap) {
    wrap = document.createElement('div');
    wrap.id = '__uvd_toast_wrap__';
    wrap.style.cssText = 'position:fixed;left:12px;right:12px;bottom:22px;display:flex;flex-direction:column;align-items:center;gap:8px;z-index:2147483647;pointer-events:none;';
    __uvdAppendRoot(wrap);
  }
  var el = document.createElement('div');
  el.textContent = msg;
  el.style.cssText = 'max-width:86vw;background:' + (color || 'linear-gradient(135deg,#ff9fb4,#f76c8c)') + ';color:#fff;padding:12px 20px;border-radius:999px;font:700 13px Segoe UI;box-shadow:0 6px 20px rgba(247,108,140,.4),inset 0 1px 0 rgba(255,255,255,.4);border:1px solid rgba(255,255,255,.5);text-align:center;animation:uvdSlideIn 0.3s cubic-bezier(.22,1,.36,1) both;transition:opacity .22s ease,transform .22s ease;';
  wrap.appendChild(el);
  while (wrap.children.length > 3) wrap.removeChild(wrap.firstChild);
  setTimeout(function() {
    el.style.opacity = '0';
    el.style.transform = 'translateY(-10px)';
    setTimeout(function() { el.remove(); }, 220);
  }, 2500);
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
  var old = data.history.find(function(item) { return item.url === url; });
  data.history = data.history.filter(function(item) { return item.url !== url; });
  var entry = old || {};
  entry.url = url;
  entry.type = type;
  entry.title = pageInfo.title;
  entry.host = pageInfo.host;
  entry.pageUrl = pageInfo.url;
  entry.timestamp = Date.now();
  data.history.unshift(entry);
  if (data.history.length > 100) data.history = data.history.slice(0, 100);
  storage.set(data);
}

function addToFilterlist(pattern) {
  if (!pattern) return;
  pattern = pattern.trim().toLowerCase();
  if (data.filterlist.indexOf(pattern) === -1) {
    data.filterlist.push(pattern);
    storage.set(data);
    compileAdFilters();
    __uvdSubmitCommunityVote('ad', pattern, 'down');
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
  usingNativeHls: false,
  nativeFallbackTimer: null,
  nativePlayAttempted: false,
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
  proxyFallbackTimer: null,
  vjsMountCancel: null,
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
function __uvdResumeTimeLabel(sec) {
  sec = Math.max(0, Math.floor(Number(sec) || 0));
  var h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return h ? h + ':' + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0') : String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
}
function __uvdOpenResumePrompt(video, url, pos, onPick) {
  var old = document.getElementById('__uvd_resume_prompt__');
  if (old) old.remove();
  var overlay = document.createElement('div');
  overlay.id = '__uvd_resume_prompt__';
  overlay.className = 'uvd-resume-overlay';
  var at = __uvdResumeTimeLabel(pos && pos.time);
  var total = __uvdResumeTimeLabel((pos && pos.duration) || (video && video.duration));
  overlay.innerHTML = '<div class="uvd-resume-card">' +
    '<div class="uvd-resume-mascot">' + __uvdHeaderMascot + '</div>' +
    '<div class="uvd-resume-kicker">mèo nhớ cưng nè</div>' +
    '<div class="uvd-resume-title">Phim đang xem dở ♡</div>' +
    '<div class="uvd-resume-copy">Cưng dừng ở <b>' + at + '</b>' + (total !== '00:00' ? ' / ' + total : '') + '. Muốn xem tiếp hay mở lại từ đầu?</div>' +
    '<div class="uvd-resume-actions"><button type="button" id="__uvd_resume_start__">↺ Từ đầu</button><button type="button" id="__uvd_resume_continue__">▶ Xem tiếp</button></div>' +
  '</div>';
  __uvdAppendRoot(overlay);
  function choose(kind) {
    if (!overlay.isConnected) return;
    overlay.remove();
    if (typeof onPick === 'function') onPick(kind);
  }
  overlay.querySelector('#__uvd_resume_start__').onclick = function() { choose('start'); };
  overlay.querySelector('#__uvd_resume_continue__').onclick = function() { choose('continue'); };
}

// ========== TMDB PLAYER RECOGNITION ==========
function __uvdTmdbCleanTitle(raw) {
  return String(raw || '')
    .replace(/https?:\/\/\S+/gi, ' ').replace(/\[[^\]]*\]|\([^)]*(?:1080|720|vietsub|thuyết minh|lồng tiếng)[^)]*\)/gi, ' ')
    .replace(/\b(?:tap|tập|episode|ep|phần|season|s\d+e\d+)\s*\d*\b/gi, ' ')
    .replace(/\b(?:xem|phim|full|trailer|teaser|1080p|720p|480p|m3u8|mp4|vietsub|thuyet minh|long tieng|full hd|watch online)\b/gi, ' ')
    .replace(/[_|·–—-]+/g, ' ').replace(/\s+/g, ' ').trim()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D');
}
function __uvdTmdbSimilarity(query, candidate) {
  query = __uvdTmdbCleanTitle(query).toLowerCase();
  candidate = __uvdTmdbCleanTitle(candidate).toLowerCase();
  if (!query || !candidate) return 0;
  if (query === candidate) return 1;
  if (query.indexOf(candidate) !== -1 || candidate.indexOf(query) !== -1) return 0.84;
  var q = query.split(/\s+/).filter(function(x) { return x.length > 1 || /^\d+$/.test(x); });
  var c = candidate.split(/\s+/);
  var hits = q.filter(function(x) { return c.indexOf(x) !== -1; }).length;
  return hits / Math.max(q.length, c.length, 1);
}
function __uvdTmdbJson(path, localUrl) {
  var proxy = RENDER_PROXY_BASE.replace(/\/$/, '') + '/tmdb/' + path;
  return fetch(proxy, { cache: 'no-store' }).then(function(r) {
    if (!r.ok) throw new Error('proxy ' + r.status);
    return r.json();
  }).catch(function() {
    if (!localUrl) return null;
    return fetch(localUrl, { cache: 'no-store' }).then(function(r) { return r.ok ? r.json() : null; }).catch(function() { return null; });
  });
}
function __uvdTmdbRawTitleSources(title) {
  var raw = [title, pageInfo && pageInfo.title, document.title];
  try {
    var og = document.querySelector('meta[property="og:title"],meta[name="twitter:title"]');
    var h1 = document.querySelector('h1');
    if (og && og.content) raw.push(og.content);
    if (h1 && h1.textContent) raw.push(h1.textContent);
  } catch(e) {}
  var seen = {};
  return raw.map(function(value) { return String(value || '').replace(/\s+/g, ' ').trim(); }).filter(function(value) {
    var key = value.toLowerCase();
    if (value.length < 3 || seen[key]) return false;
    seen[key] = true;
    return true;
  }).slice(0, 5);
}
function __uvdTmdbSourceTitles(title) {
  var seen = {};
  return __uvdTmdbRawTitleSources(title).map(function(value) { return __uvdTmdbCleanTitle(value); }).filter(function(value) {
    var key = value.toLowerCase();
    if (value.length < 3 || seen[key]) return false;
    seen[key] = true;
    return true;
  }).slice(0, 4);
}
function __uvdTmdbEnglishFragments(rawTitles) {
  var generic = { xem:1, phim:1, tap:1, episode:1, full:1, vietsub:1, thuyet:1, minh:1, ma:1, cay:1, lua:1, dia:1, nguc:1 };
  var seen = {}, found = [];
  (rawTitles || []).forEach(function(raw) {
    // Vietnamese pages often append the official English title after the local
    // one (e.g. "Ma Cây Lửa Địa Ngục Evil Dead Burn"). Extract that ASCII
    // title directly so TMDB English works even without an AI translator.
    var matches = String(raw || '').match(/(?:[A-Z][A-Za-z0-9'’:-]*\s+){1,7}[A-Z][A-Za-z0-9'’:-]*/g) || [];
    matches.forEach(function(match) {
      var clean = __uvdTmdbCleanTitle(match);
      var words = clean.toLowerCase().split(/\s+/).filter(Boolean);
      if (words.length < 2 || generic[words[0]] || words.every(function(word) { return generic[word]; })) return;
      var key = clean.toLowerCase();
      if (!seen[key]) { seen[key] = true; found.push(clean); }
    });
  });
  return found.slice(0, 4);
}
function __uvdTmdbTranslateTitles(titles) {
  titles = (titles || []).slice(0, 4);
  if (!titles.length) return Promise.resolve([]);
  return fetch(RENDER_PROXY_BASE.replace(/\/$/, '') + '/tmdb/translate-title', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ titles: titles }), cache: 'no-store'
  }).then(function(response) { return response.ok ? response.json() : null; }).then(function(payload) {
    if (!payload || !Array.isArray(payload.translations)) return [];
    var seen = {};
    return payload.translations.map(function(item) { return __uvdTmdbCleanTitle(item && item.english); }).filter(function(value) {
      var key = value.toLowerCase();
      if (value.length < 3 || seen[key]) return false;
      seen[key] = true;
      return true;
    }).slice(0, 4);
  }).catch(function() { return []; });
}
function __uvdTmdbSearchAll(specs, key) {
  specs = (specs || []).slice(0, 10);
  if (!specs.length) return Promise.resolve([]);
  return Promise.all(specs.map(function(spec) {
    var language = spec.language === 'en-US' ? 'en-US' : 'vi-VN';
    var local = key ? 'https://api.themoviedb.org/3/search/multi?api_key=' + encodeURIComponent(key) + '&query=' + encodeURIComponent(spec.query) + '&language=' + encodeURIComponent(language) + '&include_adult=false' : '';
    return __uvdTmdbJson('search?query=' + encodeURIComponent(spec.query) + '&language=' + encodeURIComponent(language), local).then(function(result) {
      return { query: spec.query, language: language, results: result && Array.isArray(result.results) ? result.results : [] };
    });
  }));
}
function __uvdTmdbSearchSpecs(titles, englishTitles) {
  var specs = [], seen = {};
  function add(query, language) {
    query = __uvdTmdbCleanTitle(query);
    var key = language + '|' + query.toLowerCase();
    if (query.length < 3 || seen[key]) return;
    seen[key] = true;
    specs.push({ query: query, language: language });
  }
  (titles || []).forEach(function(title, index) {
    var words = String(title || '').split(/\s+/).filter(Boolean);
    add(title, 'vi-VN');
    // Only derive shorter variants from the primary page title. This leaves
    // request budget for English/original-title matching instead of issuing
    // three searches for every duplicate browser title.
    if (index === 0) {
      add(words.slice(0, 6).join(' '), 'vi-VN');
      add(words.slice(-4).join(' '), 'vi-VN');
    }
  });
  (englishTitles || []).forEach(function(title) { add(title, 'en-US'); });
  return specs.slice(0, 8);
}
function __uvdTmdbKindOf(movie) {
  return movie && movie.media_type === 'tv' ? 'tv' : (movie && movie.media_type === 'movie' ? 'movie' : (movie && movie.first_air_date ? 'tv' : 'movie'));
}
function __uvdTmdbVoteKey(sourceTitle, movie) {
  var normalized = __uvdTmdbCleanTitle(sourceTitle).toLowerCase().slice(0, 160) || 'untitled';
  return normalized + '|' + __uvdTmdbKindOf(movie) + ':' + String(movie && movie.id || '');
}
function __uvdTmdbVoteTally(sourceTitle, movie) {
  return data.tmdbVotes[__uvdTmdbVoteKey(sourceTitle, movie)] || { up: 0, down: 0 };
}
function __uvdTmdbFeedbackScore(sourceTitle, movie) {
  var vote = __uvdTmdbVoteTally(sourceTitle, movie);
  return Math.max(-0.42, Math.min(0.24, (vote.up || 0) * 0.08 - (vote.down || 0) * 0.21));
}
function __uvdCastTmdbVote(sourceTitle, movie, kind) {
  if (!movie || !movie.id) return { up: 0, down: 0 };
  var key = __uvdTmdbVoteKey(sourceTitle, movie);
  var rec = data.tmdbVotes[key] = data.tmdbVotes[key] || { up: 0, down: 0, updatedAt: 0 };
  if (kind === 'up') rec.up = (rec.up || 0) + 1;
  else if (kind === 'down') rec.down = (rec.down || 0) + 1;
  rec.updatedAt = Date.now();
  storage.set(data);
  __uvdSubmitCommunityVote('tmdb', __uvdTmdbKindOf(movie) + ':' + movie.id, kind);
  return rec;
}
function __uvdFindTmdbMovie(title) {
  var rawTitles = __uvdTmdbRawTitleSources(title);
  var sourceTitles = __uvdTmdbSourceTitles(title);
  if (!sourceTitles.length) return Promise.resolve(null);
  var primary = sourceTitles[0];
  var key = String(data.settings.tmdbApiKey || '').trim();
  var yearMatch = primary.match(/\b(19\d{2}|20\d{2})\b/);
  var year = yearMatch && yearMatch[1];
  return __uvdTmdbTranslateTitles(sourceTitles).then(function(translatedTitles) {
    var detectedEnglish = __uvdTmdbEnglishFragments(rawTitles);
    var englishTitles = __uvdMergeStringLists(detectedEnglish, translatedTitles);
    var allTitles = sourceTitles.concat(englishTitles);
    var specs = __uvdTmdbSearchSpecs(sourceTitles, englishTitles);
    return __uvdTmdbSearchAll(specs, key).then(function(groups) {
      var byId = {}, best = null, bestScore = 0;
      groups.forEach(function(group) {
        (group.results || []).forEach(function(item) {
          if (!item || (item.media_type && item.media_type !== 'movie' && item.media_type !== 'tv')) return;
          var kind = __uvdTmdbKindOf(item);
          var dedupeKey = kind + ':' + item.id;
          var candidateTitle = item.title || item.name || '';
          var originalTitle = item.original_title || item.original_name || '';
          var score = Math.max(__uvdTmdbSimilarity(group.query, candidateTitle), __uvdTmdbSimilarity(group.query, originalTitle));
          allTitles.forEach(function(query) {
            score = Math.max(score, __uvdTmdbSimilarity(query, candidateTitle), __uvdTmdbSimilarity(query, originalTitle));
          });
          var itemYear = String(item.release_date || item.first_air_date || '').slice(0, 4);
          if (year && itemYear === year) score += 0.24;
          if (item.popularity) score += Math.min(0.05, Number(item.popularity) / 2000);
          score += __uvdTmdbFeedbackScore(title, item);
          if (!byId[dedupeKey] || score > byId[dedupeKey].score) byId[dedupeKey] = { item: item, score: score };
        });
      });
      Object.keys(byId).forEach(function(id) {
        var candidate = byId[id];
        if (candidate.score > bestScore) { best = candidate.item; bestScore = candidate.score; }
      });
      // Multilingual queries are more resilient, but keep the threshold high
      // enough to avoid confidently showing the wrong movie.
      if (!best || bestScore < 0.54) return null;
      var kind = __uvdTmdbKindOf(best);
      var detailLocal = key ? 'https://api.themoviedb.org/3/' + kind + '/' + best.id + '?api_key=' + encodeURIComponent(key) + '&append_to_response=credits,images&include_image_language=vi,en,null&language=vi-VN' : '';
      return __uvdTmdbJson(kind + '/' + best.id, detailLocal).then(function(detail) {
        if (detail) detail.__uvdMatchedTitle = primary;
        return detail || null;
      });
    });
  });
}
function __uvdTmdbPresentation(movie) {
  var logos = movie && movie.images && movie.images.logos || [];
  var logo = logos.filter(function(x) { return x && x.file_path; }).sort(function(a, b) {
    return (a.iso_639_1 === 'vi' ? -1 : 0) || (a.iso_639_1 === 'en' ? -1 : 0);
  })[0];
  var crew = movie && movie.credits && movie.credits.crew || [];
  var director = crew.filter(function(x) { return x && (x.job === 'Director' || x.job === 'Creator'); })[0] || null;
  var castList = (movie && movie.credits && movie.credits.cast || []).slice(0, 12).map(function(person) {
    return { name: String(person && person.name || ''), character: String(person && person.character || ''), image: person && person.profile_path ? 'https://image.tmdb.org/t/p/w185' + person.profile_path : '' };
  }).filter(function(person) { return person.name; });
  return {
    logo: logo && logo.file_path ? 'https://image.tmdb.org/t/p/w500' + logo.file_path : '',
    poster: movie && movie.poster_path ? 'https://image.tmdb.org/t/p/w342' + movie.poster_path : '',
    backdrop: movie && movie.backdrop_path ? 'https://image.tmdb.org/t/p/w1280' + movie.backdrop_path : '',
    title: movie && (movie.title || movie.name || movie.original_title || movie.original_name) || '',
    original: movie && (movie.original_title || movie.original_name) || '',
    year: String(movie && (movie.release_date || movie.first_air_date) || '').slice(0, 4),
    runtime: Number(movie && (movie.runtime || (movie.episode_run_time && movie.episode_run_time[0])) || 0),
    status: String(movie && movie.status || ''),
    language: String(movie && movie.original_language || '').toUpperCase(),
    country: String(movie && movie.production_countries && movie.production_countries[0] && (movie.production_countries[0].iso_3166_1 || movie.production_countries[0].name) || ''),
    tagline: String(movie && movie.tagline || '').trim(),
    votes: Number(movie && movie.vote_count || 0),
    genres: (movie && movie.genres || []).slice(0, 3).map(function(x) { return x.name; }).join(' · '),
    cast: castList.map(function(person) { return person.name; }).join(' · '),
    directors: crew.filter(function(x) { return x && (x.job === 'Director' || x.job === 'Creator'); }).slice(0, 3).map(function(x) { return x.name; }).filter(Boolean).join(' · '),
    director: director ? { name: String(director.name || ''), role: director.job === 'Creator' ? 'Creator' : 'Director', image: director.profile_path ? 'https://image.tmdb.org/t/p/w185' + director.profile_path : '' } : null,
    actors: castList,
    overview: String(movie && movie.overview || '').trim()
  };
}
function __uvdApplyPlayerTmdbState(bar, movie, confirmed) {
  if (!bar || !movie) return;
  var panel = bar.__uvdPlayerInfoPanel;
  if (!panel) return;
  var presentation = __uvdTmdbPresentation(movie);
  var handle = bar.__uvdPlayerInfoHandle;
  if (handle) {
    handle.hidden = false;
    handle.setAttribute('aria-expanded', 'false');
    handle.setAttribute('title', 'Mở trang thông tin phim');
  }
  if (confirmed) {
    var titleMain = panel.querySelector('.uvd-player-title-main');
    if (titleMain) {
      titleMain.classList.add('uvd-player-title-confirmed');
      // The player stays simple: title source becomes a calm state label. The
      // movie logo belongs to the dedicated full-information page instead.
      titleMain.textContent = 'Bạn đang xem';
      titleMain.dataset.tmdbTitle = presentation.title || '';
    }
  }
}
function __uvdOpenMovieInfoPage(movie, sourceTitle, bar) {
  if (!movie) return;
  var old = document.getElementById('__uvd_movie_info__');
  if (old) old.remove();
  var presentation = __uvdTmdbPresentation(movie);
  var facts = [
    presentation.year,
    presentation.runtime ? presentation.runtime + ' phút' : '',
    presentation.status,
    presentation.language ? 'Ngôn ngữ ' + presentation.language : '',
    movie.vote_average ? 'TMDB ' + Number(movie.vote_average).toFixed(1) + ' / ' + presentation.votes + ' vote' : ''
  ].filter(Boolean);
  var directorHtml = presentation.director ? '<section class="uvd-movie-info-people-section uvd-movie-info-director-section"><h3>Đạo diễn</h3><div class="uvd-movie-info-director">' + (presentation.director.image ? '<img src="' + escapeHtml(presentation.director.image) + '" alt="">' : '<span>🎬</span>') + '<div><strong>' + escapeHtml(presentation.director.name) + '</strong><small>' + escapeHtml(presentation.director.role) + '</small></div></div></section>' : '';
  var actorsHtml = presentation.actors && presentation.actors.length ? '<section class="uvd-movie-info-people-section"><h3>Diễn viên</h3><div class="uvd-movie-info-actors">' + presentation.actors.map(function(person) { return '<article>' + (person.image ? '<img src="' + escapeHtml(person.image) + '" alt="">' : '<span>◉</span>') + '<strong>' + escapeHtml(person.name) + '</strong>' + (person.character ? '<small>' + escapeHtml(person.character) + '</small>' : '') + '</article>'; }).join('') + '</div></section>' : '';
  var overlay = document.createElement('div');
  overlay.id = '__uvd_movie_info__';
  overlay.className = 'uvd-movie-info-overlay';
  var sheet = document.createElement('section');
  sheet.className = 'uvd-movie-info-sheet';
  var backdropStyle = presentation.backdrop ? ' style="background-image:url(\'' + escapeHtml(presentation.backdrop) + '\')"' : '';
  sheet.innerHTML =
    '<button type="button" class="uvd-movie-info-close" title="Quay lại Player">←</button>' +
    '<div class="uvd-movie-info-body">' +
      '<div class="uvd-movie-info-hero"' + backdropStyle + '><div class="uvd-movie-info-hero-scrim"></div></div>' +
      '<section class="uvd-movie-info-surface">' +
        '<div class="uvd-movie-info-meta-line">' + escapeHtml([presentation.year, presentation.country].filter(Boolean).join(', ')) + '</div>' +
        '<div class="uvd-movie-info-logo">' + (presentation.logo ? '<img src="' + escapeHtml(presentation.logo) + '" alt="' + escapeHtml(presentation.title) + '">' : '<span>' + escapeHtml(presentation.title || 'THÔNG TIN PHIM') + '</span>') + '</div>' +
        '<h2>' + escapeHtml(presentation.title || 'Thông tin phim') + '</h2>' +
        (presentation.tagline ? '<p class="uvd-movie-info-tagline">' + escapeHtml(presentation.tagline) + '</p>' : (presentation.original && presentation.original !== presentation.title ? '<p class="uvd-movie-info-tagline">' + escapeHtml(presentation.original) + '</p>' : '')) +
        '<div class="uvd-movie-info-facts">' + facts.map(function(fact) { return '<span>' + escapeHtml(fact) + '</span>'; }).join('') + '</div>' +
        (presentation.genres ? '<div class="uvd-movie-info-tags">' + presentation.genres.split(' · ').map(function(genre) { return '<span>' + escapeHtml(genre) + '</span>'; }).join('') + '</div>' : '') +
        '<section class="uvd-movie-info-content"><h3>Tóm tắt</h3><p class="uvd-movie-info-overview">' + escapeHtml(presentation.overview || 'TMDB chưa có tóm tắt công khai cho phim này.') + '</p>' + directorHtml + actorsHtml + '</section>' +
      '</section>' +
    '</div>';
  overlay.appendChild(sheet);
  __uvdAppendRoot(overlay);
  function close() { overlay.classList.remove('uvd-open'); setTimeout(function() { try { overlay.remove(); } catch(e) {} }, 260); }
  sheet.querySelector('.uvd-movie-info-close').onclick = close;
  overlay.addEventListener('click', function(event) { if (event.target === overlay) close(); });
  requestAnimationFrame(function() { overlay.classList.add('uvd-open'); });
}
function __uvdRenderPlayerTmdb(bar, movie, sourceTitle) {
  if (!bar || !movie) return;
  var presentation = __uvdTmdbPresentation(movie);
  bar.innerHTML = '<div class="uvd-player-tmdb-mini-copy"><strong>Đã nhận diện: ' + escapeHtml(presentation.title || 'phim trên TMDB') + '</strong><span>TMDB ' + (movie.vote_average ? Number(movie.vote_average).toFixed(1) : '—') + (presentation.year ? ' · ' + escapeHtml(presentation.year) : '') + (presentation.genres ? ' · ' + escapeHtml(presentation.genres) : '') + '</span></div>' +
    '<div class="uvd-feedback-actions uvd-tmdb-feedback-actions"><button type="button" class="uvd-feedback-vote uvd-feedback-vote-up" data-tmdb-vote="up"></button><button type="button" class="uvd-feedback-vote uvd-feedback-vote-down" data-tmdb-vote="down"></button></div>';
  function refreshVotes() {
    var tally = __uvdTmdbVoteTally(sourceTitle, movie);
    var up = bar.querySelector('[data-tmdb-vote="up"]');
    var down = bar.querySelector('[data-tmdb-vote="down"]');
    if (up) up.textContent = '♥ Đúng phim (' + (tally.up || 0) + ')';
    if (down) down.textContent = '💩 Sai phim (' + (tally.down || 0) + ')';
    return tally;
  }
  var up = bar.querySelector('[data-tmdb-vote="up"]');
  var down = bar.querySelector('[data-tmdb-vote="down"]');
  if (up) up.onclick = function(e) {
    e.stopPropagation();
    __uvdCastTmdbVote(sourceTitle, movie, 'up');
    refreshVotes();
    __uvdApplyPlayerTmdbState(bar, movie, true);
    toast('Cảm ơn cưng đã xác nhận thông tin phim ♡');
  };
  if (down) down.onclick = function(e) {
    e.stopPropagation();
    __uvdCastTmdbVote(sourceTitle, movie, 'down');
    bar.hidden = true; bar.textContent = '';
    var panel = bar.__uvdPlayerInfoPanel;
    if (panel) {
      var titleMain = panel.querySelector('.uvd-player-title-main');
      if (titleMain && titleMain.classList.contains('uvd-player-title-confirmed')) {
        titleMain.classList.remove('uvd-player-title-confirmed');
        titleMain.textContent = titleMain.dataset.originalTitle || sourceTitle;
      }
    }
    var handle = bar.__uvdPlayerInfoHandle;
    if (handle) handle.hidden = true;
  };
  var tally = refreshVotes();
  var confirmed = !!(tally.up && tally.up > tally.down);
  __uvdApplyPlayerTmdbState(bar, movie, confirmed);
  var handle = bar.__uvdPlayerInfoHandle;
  if (handle) handle.onclick = function(e) { e.stopPropagation(); __uvdOpenMovieInfoPage(movie, sourceTitle, bar); };
  bar.hidden = false;
}
function __uvdRenderTmdbUnavailable(bar, title) {
  if (!bar) return;
  bar.classList.remove('uvd-player-tmdb-loading');
  bar.hidden = false;
  bar.innerHTML = '<span class="uvd-player-tmdb-loading">🔎 Mèo chưa khớp TMDB đủ chắc để hiện sai phim.</span><button type="button" class="uvd-btn uvd-btn-sm uvd-tmdb-retry">Thử nhận diện lại</button>';
  var handle = bar.__uvdPlayerInfoHandle;
  if (handle) handle.hidden = true;
  var retry = bar.querySelector('.uvd-tmdb-retry');
  if (retry) retry.onclick = function(e) { e.stopPropagation(); __uvdRecognizePlayerMovie(title, bar); };
}
function __uvdRecognizePlayerMovie(title, bar) {
  if (!__uvdTmdbFeatureEnabled || !bar) return;
  bar.hidden = false;
  bar.classList.add('uvd-player-tmdb-loading');
  bar.textContent = '🔎 Mèo đang đối chiếu tiêu đề trang với TMDB...';
  __uvdFindTmdbMovie(title).then(function(movie) {
    if (!movie) { __uvdRenderTmdbUnavailable(bar, title); return; }
    bar.classList.remove('uvd-player-tmdb-loading');
    __uvdRenderPlayerTmdb(bar, movie, title);
  }).catch(function() { __uvdRenderTmdbUnavailable(bar, title); });
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
      console.error('[Mèo cào media] SubDL: hết 15s không phản hồi');
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
        console.warn('[Mèo cào media] SubDL lỗi:', json.message || json);
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
      console.error('[Mèo cào media] Lỗi SubDL search:', err);
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
  panel.style.cssText = 'background:var(--glass);backdrop-filter:blur(var(--uvd-blur)) saturate(130%);-webkit-backdrop-filter:blur(var(--uvd-blur)) saturate(130%);border-radius:16px;padding:20px;width:100%;max-width:380px;max-height:85vh;overflow-y:auto;border:1px solid var(--border);box-shadow:0 20px 50px rgba(15,58,56,0.25);';
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
  var FALLBACK_MS = 10000;
  var done = false;
  var scriptAttempts = 0;
  var cancelled = false;
  var iv = null;
  function cancel() {
    cancelled = true;
    if (iv) { clearInterval(iv); iv = null; }
  }
  function fallbackToNative() {
    if (done || cancelled) return;
    done = true;
    if (iv) { clearInterval(iv); iv = null; }
    if (!video.parentNode) wrapper.appendChild(video);
    video.setAttribute('controls', '');
  }
  function wrapWithSkin() {
    if (done || cancelled || !video.isConnected) return;
    done = true;
    if (iv) { clearInterval(iv); iv = null; }
    try {
      var player = document.createElement('video-player');
      // Flat mount: video-player is the only visual frame. video-skin is
      // retained because VJS10 needs it, but it has no independent radius or
      // background, avoiding nested rounded boxes.
      player.style.cssText = 'width:100%;max-height:100%;display:block;aspect-ratio:16/9;margin:auto;position:relative;z-index:1;overflow:hidden;transition:width .25s ease;border-radius:0;background:transparent;--media-border-radius:0;';
      player.id = '__uvd_player_el__';
      player.className = 'uvd-player-loading';
      var skin = document.createElement('video-skin');
      skin.style.cssText = 'width:100%;height:100%;display:block;overflow:hidden;border-radius:0;background:transparent;';
      if (video.parentNode) video.parentNode.removeChild(video);
      video.removeAttribute('controls');
      skin.appendChild(video);
      player.appendChild(skin);
      wrapper.appendChild(player);
      if (onMount) onMount();
    } catch (e) {
      console.error('[Mèo cào media] Video.js v10 mount lỗi, dùng controls gốc:', e);
      done = false;
      fallbackToNative();
    }
  }
  if (customElements.get('video-player')) { wrapWithSkin(); return cancel; }
  function requestVjs10Script() {
    if (customElements.get('video-player') || scriptAttempts >= 2) return;
    scriptAttempts++;
    window.__uvdVjs10Loading = true;
    var s = document.createElement('script');
    s.type = 'module';
    s.src = 'https://cdn.jsdelivr.net/npm/@videojs/html/cdn/video.js?v=' + Date.now();
    s.onerror = function() { window.__uvdVjs10Loading = false; console.error('[Mèo cào media] Không tải được Video.js v10'); };
    document.head.appendChild(s);
  }
  if (!customElements.get('video-player')) requestVjs10Script();
  var checkStart = Date.now();
  iv = setInterval(function() {
    if (cancelled) { clearInterval(iv); iv = null; return; }
    if (customElements.get('video-player')) {
      wrapWithSkin();
    } else if (Date.now() - checkStart > FALLBACK_MS) {
      if (scriptAttempts < 2) {
        window.__uvdVjs10Loading = false;
        requestVjs10Script();
        checkStart = Date.now();
      } else {
        clearInterval(iv); iv = null;
        console.warn('[Mèo cào media] Video.js v10 chưa sẵn sàng, dùng controls gốc');
        fallbackToNative();
      }
    }
  }, 100);
  return cancel;
}

// ========== HLS LOADER ==========
// Share one lazy hls.js load between the player and HLS thumbnails. Without
// this, thumbnail video elements fall back to a raw .m3u8 URL on Android
// Chromium, which has no native HLS support.
function __uvdFindClientMpegTsOffset(data) {
  if (!data || typeof data === 'string') return -1;
  var bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  var packetSize = 188;
  var packetCount = 5;
  var limit = Math.min(bytes.length - packetSize * packetCount, 64 * 1024);
  if (limit < 0) return -1;
  for (var offset = 0; offset <= limit; offset++) {
    var aligned = true;
    for (var packet = 0; packet < packetCount; packet++) {
      if (bytes[offset + packet * packetSize] !== 0x47) { aligned = false; break; }
    }
    if (aligned) return offset;
  }
  return -1;
}
function __uvdNormalizeClientHlsData(data) {
  var offset = __uvdFindClientMpegTsOffset(data);
  if (offset <= 0) return data;
  var bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  return bytes.buffer.slice(bytes.byteOffset + offset, bytes.byteOffset + bytes.byteLength);
}
function __uvdMakeHlsConfig(HlsCtor, options) {
  var config = Object.assign({
    maxBufferLength: 12,
    maxMaxBufferLength: 24,
    backBufferLength: 20,
    maxBufferSize: 30 * 1000 * 1000,
    capLevelToPlayerSize: true,
    enableWorker: true
  }, options || {});
  var BaseLoader = HlsCtor && HlsCtor.DefaultConfig && HlsCtor.DefaultConfig.loader;
  if (!BaseLoader) return config;
  if (!HlsCtor.__uvdPngStripLoader) {
    HlsCtor.__uvdPngStripLoader = class UvdPngStripLoader extends BaseLoader {
      load(context, config, callbacks) {
        var token = __uvdGetLatestMediaAccessToken(context && context.url);
        if (token && context && context.url) context.url = __uvdAppendAccessToken(context.url, token);
        var originalSuccess = callbacks.onSuccess;
        callbacks.onSuccess = function(response, stats, loadedContext, networkDetails) {
          try {
            if (response && response.data && typeof response.data !== 'string') {
              response.data = __uvdNormalizeClientHlsData(response.data);
            }
          } catch(e) {}
          originalSuccess(response, stats, loadedContext, networkDetails);
        };
        return super.load(context, config, callbacks);
      }
    };
  }
  config.loader = HlsCtor.__uvdPngStripLoader;
  config.fLoader = HlsCtor.__uvdPngStripLoader;
  return config;
}

function __uvdEnsureHls(onReady, onError) {
  if (window.Hls) {
    onReady(window.Hls);
    return;
  }
  window.__uvdHlsWaiters = window.__uvdHlsWaiters || [];
  window.__uvdHlsWaiters.push({ ready: onReady, error: onError });
  if (window.__uvdHlsLoading) return;
  window.__uvdHlsLoading = true;
  var script = document.createElement('script');
  script.src = 'https://cdnjs.cloudflare.com/ajax/libs/hls.js/1.6.13/hls.min.js';
  script.onload = function() {
    window.__uvdHlsLoading = false;
    var waiters = window.__uvdHlsWaiters || [];
    window.__uvdHlsWaiters = [];
    if (window.Hls) waiters.forEach(function(waiter) { try { waiter.ready(window.Hls); } catch(e) {} });
    else waiters.forEach(function(waiter) { try { if (waiter.error) waiter.error(new Error('hls.js không đăng ký được')); } catch(e) {} });
  };
  script.onerror = function() {
    window.__uvdHlsLoading = false;
    var waiters = window.__uvdHlsWaiters || [];
    window.__uvdHlsWaiters = [];
    waiters.forEach(function(waiter) { try { if (waiter.error) waiter.error(new Error('Không tải được hls.js')); } catch(e) {} });
  };
  document.head.appendChild(script);
}

// ========== HEADER PROXY ==========
function buildHeaderProxyUrl(sourceUrl, type) {
  if (!HEADER_PROXY_BASE || !sourceUrl || sourceUrl.indexOf(HEADER_PROXY_BASE) === 0) return '';
  var isHlsSource = String(type || '').toUpperCase() === 'M3U8' || /m3u8/i.test(sourceUrl);
  var endpoint = isHlsSource ? '/hls' : '/proxy';
  var params = new URLSearchParams();
  params.set('url', sourceUrl);
  params.set('referer', /(?:^|\.)morencius\.com$/i.test(pageInfo.host) ? location.href : (pageInfo.referer || location.href));
  params.set('origin', location.origin);
  params.set('ua', navigator.userAgent);
  if (document.cookie) params.set('cookie', document.cookie);
  var accessToken = __uvdGetLatestMediaAccessToken(sourceUrl);
  if (accessToken) params.set('access_token', accessToken);
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

// ========== BLOB / MEDIASOURCE SOURCE REUSE ==========
function findSourceVideoElement(url) {
  function searchDoc(doc) {
    try {
      var videos = doc.querySelectorAll('video');
      for (var i = 0; i < videos.length; i++) {
        if (videos[i].currentSrc === url || videos[i].src === url) return videos[i];
      }
      var frames = doc.querySelectorAll('iframe');
      for (var j = 0; j < frames.length; j++) {
        try { if (frames[j].contentDocument) { var found = searchDoc(frames[j].contentDocument); if (found) return found; } } catch(e) {}
      }
    } catch(e) {}
    return null;
  }
  return searchDoc(document);
}

function openPlayerSettingsOverlay() {
  if (document.getElementById('__uvd_player_settings_overlay__')) return;
  var overlay = document.createElement('div');
  overlay.id = '__uvd_player_settings_overlay__';
  overlay.className = 'uvd-settings-overlay uvd-player-settings-overlay';
  overlay.innerHTML = '<div class="uvd-settings-sheet uvd-player-settings-sheet"><div class="uvd-settings-header"><button class="uvd-back-btn" type="button">←</button><span class="uvd-player-settings-mascot">' + (typeof __uvdTabMascotHamster !== 'undefined' ? __uvdTabMascotHamster : '🐹') + '</span><div class="uvd-settings-title-wrap"><span class="uvd-settings-title">⚙ Cài đặt Player</span><span class="uvd-settings-subtitle">Chỉ áp dụng cho trình phát</span></div></div><div class="uvd-settings-body"></div></div>';
  __uvdAppendRoot(overlay);
  var sheet = overlay.querySelector('.uvd-player-settings-sheet');
  var body = overlay.querySelector('.uvd-settings-body');
  renderPlayerSettings(body);
  function close() { overlay.classList.remove('uvd-open'); setTimeout(function() { try { overlay.remove(); } catch(e) {} }, 220); }
  overlay.querySelector('.uvd-back-btn').onclick = close;
  overlay.addEventListener('click', function(e) { if (e.target === overlay) close(); });
  requestAnimationFrame(function() { overlay.classList.add('uvd-open'); });
}

// ========== SHOW VIDEO PLAYER ==========
function showVideoPlayer(url, type, fromProxy, forceReinit, forceHlsJs, titleOverride) {
  // forceHlsJs is used only after native HLS has failed. It must be a real
  // parameter: an undeclared flag here would stop the player before hls.js
  // gets a chance to take over, leaving the loading spinner forever.
  forceHlsJs = !!forceHlsJs;
  // These tokenized TXT playlists use relative child playlists that need the
  // k/kx query carried onto every child URL. Start them through /hls directly
  // instead of waiting for the direct source to fail first.
  if (!fromProxy && /\/v\d+\/miy\/[^?#]+\.txt(?:[?#]|$)/i.test(url)) {
    var tokenizedProxy = buildHeaderProxyUrl(url, 'M3U8');
    if (tokenizedProxy) {
      toast('🔗 Đang mở HLS token qua proxy…');
      showVideoPlayer(tokenizedProxy, 'M3U8', true, forceReinit, forceHlsJs);
      return;
    }
  }
  // When hls.js is loaded lazily, the player shell already exists. Allow the
  // same URL to be re-initialized after the library finishes loading.
  if (playerState.overlay && playerState.url === url && !forceReinit) return;
  if (playerState.overlay) closePlayer();
  // Khi đổi quality bằng URL variant, giữ lại catalog của master để menu
  // vẫn có toàn bộ các mức ở player kế tiếp.
  var preservedQualityCatalog = window.__uvdQualitySwitchCatalog || null;
  window.__uvdQualitySwitchCatalog = null;
  playerState.qualities = preservedQualityCatalog && preservedQualityCatalog.length ? preservedQualityCatalog : [];
  playerState.url = url;
  playerState.type = type;
  __uvdStopThumbnailHls();
  if (!fromProxy) playerState.proxyRetried = false;
  if (playerState.proxyFallbackTimer) clearTimeout(playerState.proxyFallbackTimer);
  if (playerState.nativeFallbackTimer) clearTimeout(playerState.nativeFallbackTimer);
  playerState.proxyFallbackTimer = null;
  playerState.nativeFallbackTimer = null;
  playerState.nativePlayAttempted = false;
  playerState.usingNativeHls = false;
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
  // Card skin is isolated from the media engine.
  overlay.className = 'uvd-settings-overlay uvd-player-overlay uvd-player-card-v2';
  __uvdAppendRoot(overlay);
  __uvdIsolateLayer(overlay);
  applyEffectsPref(overlay);

  var sheet = document.createElement('div');
  sheet.className = 'uvd-settings-sheet uvd-player-sheet' + (playerState.launchFromThumbnail ? ' uvd-player-from-thumbnail' : '');
  playerState.launchFromThumbnail = false;
  sheet.style.cssText = 'display:flex;flex-direction:column;width:min(92vw,640px);height:auto;max-height:calc(100dvh - 24px);overflow:hidden;box-sizing:border-box;';
  overlay.appendChild(sheet);

  var sheetHeader = document.createElement('div');
  sheetHeader.className = 'uvd-settings-header uvd-player-header';
  sheetHeader.id = '__uvd_player_header__';
  sheetHeader.style.cssText = 'flex-shrink:0;';

  var backBtn = document.createElement('button');
  backBtn.className = 'uvd-back-btn';
  backBtn.id = '__uvd_player_close__';
  backBtn.textContent = '✕';
  backBtn.title = 'Đóng player';

  var menuBtn = document.createElement('button');
  menuBtn.className = 'uvd-icon-btn uvd-icon-btn-wide uvd-player-menu-btn';
  menuBtn.textContent = '⋮';
  menuBtn.title = 'Tuỳ chọn';
  menuBtn.setAttribute('aria-label', 'Mở tuỳ chọn player');
  var playerSettingsBtn = document.createElement('button');
  playerSettingsBtn.className = 'uvd-icon-btn uvd-player-settings-btn';
  playerSettingsBtn.textContent = '⚙';
  playerSettingsBtn.title = 'Cài đặt Player';
  playerSettingsBtn.setAttribute('aria-label', 'Mở cài đặt Player');
  playerSettingsBtn.onclick = function(e) { e.stopPropagation(); openPlayerSettingsOverlay(); };

  var playerHeaderTitle = document.createElement('div');
  playerHeaderTitle.className = 'uvd-player-header-title';
  playerHeaderTitle.style.cssText = '';
  playerHeaderTitle.innerHTML = '<span class="uvd-player-moving-mascot">' + (typeof __uvdTabMascotHamster !== 'undefined' ? __uvdTabMascotHamster : __uvdHeaderMascot) + '</span><div class="uvd-player-title-copy"><strong>Hamster mở video nè ♡</strong><small><span class="uvd-player-type-badge">' + escapeHtml(type || 'Media') + '</span><span>Mèo cào media · dễ thương</span></small></div>';
  sheetHeader.appendChild(backBtn);
  sheetHeader.appendChild(playerHeaderTitle);
  sheetHeader.appendChild(playerSettingsBtn);
  sheetHeader.appendChild(menuBtn);
  sheet.appendChild(sheetHeader);

  var sheetBody = document.createElement('div');
  sheetBody.className = 'uvd-settings-body';
  sheetBody.style.cssText = 'flex:0 1 auto;min-height:0;padding:0 !important;overflow-y:auto;display:flex;flex-direction:column;background:transparent;';
  var videoArea = document.createElement('div');
  videoArea.className = 'uvd-player-video-area uvd-player-pending';
  videoArea.style.cssText = 'flex:0 0 auto;min-height:0;display:flex;align-items:center;justify-content:center;';
  var videoWrapper = document.createElement('div');
  videoWrapper.id = '__uvd_video_wrapper__';
  videoWrapper.style.cssText = 'display:flex;align-items:center;justify-content:center;width:100%;background:#08080a;overflow:hidden;';
  var video = null;
  var reusedOriginalVideo = false;
  if (String(type || '').toUpperCase() === 'BLOB') {
    var sourceVideo = findSourceVideoElement(url);
    if (sourceVideo) {
      video = sourceVideo;
      reusedOriginalVideo = true;
      playerState.originalVideoParent = sourceVideo.parentNode;
      playerState.originalVideoNextSibling = sourceVideo.nextSibling;
    } else {
      toast('Không tìm thấy thẻ video gốc cho blob — hãy mở player khi video nguồn vẫn đang chạy.');
    }
  }
  if (!video) video = document.createElement('video');
  video.id = '__uvd_player_video__';
  video.style.cssText = 'max-width:100%; max-height:100%; width:100%; height:100%; display:block; object-fit:contain; background:var(--glass);';
  video.setAttribute('playsinline', '');
  video.setAttribute('webkit-playsinline', '');
  // Native controls are enabled only by fallbackToNative(). Keeping them
  // here would render Chrome controls underneath the Video.js v10 skin.
  if (!reusedOriginalVideo && (url.indexOf(HEADER_PROXY_BASE) === 0 || String(type || '').toUpperCase() === 'M3U8')) {
    video.setAttribute('crossorigin', 'anonymous');
  }
  videoWrapper.appendChild(video);
  videoArea.appendChild(videoWrapper);
  sheetBody.appendChild(videoArea);

  var infoPanel = document.createElement('div');
  infoPanel.className = 'uvd-player-info-panel uvd-player-cute-panel';
  var infoHandle = document.createElement('button');
  infoHandle.type = 'button';
  infoHandle.className = 'uvd-player-info-handle';
  infoHandle.hidden = true;
  infoHandle.setAttribute('aria-expanded', 'false');
  infoHandle.innerHTML = '<span></span>';
  infoPanel.appendChild(infoHandle);
  var playerTitle = titleOverride || pageInfo.title;
  var titleRow = document.createElement('div');
  titleRow.className = 'uvd-player-info-title';
  titleRow.innerHTML = '<span class="uvd-player-mascot-holding">' + __uvdPlayerMascotHoldingVideo + '</span><div class="uvd-player-title-text"><span class="uvd-player-title-main">' + escapeHtml(playerTitle) + '</span><span class="uvd-player-title-sub">hamster đang cầm video cho cưng nè ♡</span></div>';
  var playerTitleMain = titleRow.querySelector('.uvd-player-title-main');
  if (playerTitleMain) playerTitleMain.dataset.originalTitle = playerTitle;
  var infoRow = document.createElement('div');
  infoRow.id = '__uvd_player_info__';
  infoRow.className = 'uvd-player-info-meta';
  infoRow.innerHTML = '<span class="uvd-meta-type">' + escapeHtml(type || 'VIDEO') + '</span><span class="uvd-meta-dot">·</span><span>đang tải...</span><span class="uvd-meta-bow">🎀</span>';
  infoPanel.appendChild(titleRow);
  infoPanel.appendChild(infoRow);
  var tmdbBar = document.createElement('div');
  tmdbBar.id = '__uvd_player_tmdb_bar__';
  tmdbBar.className = 'uvd-player-tmdb-bar';
  tmdbBar.hidden = true;
  tmdbBar.__uvdPlayerInfoPanel = infoPanel;
  tmdbBar.__uvdPlayerInfoHandle = infoHandle;
  if (__uvdTmdbFeatureEnabled) infoPanel.appendChild(tmdbBar);
  sheetBody.appendChild(infoPanel);
  sheet.appendChild(sheetBody);

  playerState.overlay = overlay;
  playerState.video = video;
  playerState.reusedOriginalVideo = reusedOriginalVideo;
  if (__uvdTmdbFeatureEnabled) setTimeout(function() { __uvdRecognizePlayerMovie(playerTitle, tmdbBar); }, 280);
  // Low-power mode is entered after the sheet has finished sliding in.
  // Keep the video surface hidden during this short warm-up.
  videoWrapper.style.boxSizing = 'border-box';

  function __uvdBrightenPlayer() {
    clearTimeout(playerState.dimTimeout);
    sheet.classList.remove('uvd-player-dimmed');
  }
  function __uvdArmPlayerDim() {
    // Auto-hide/cinema dim is intentionally disabled; keep the player UI visible.
    clearTimeout(playerState.dimTimeout);
    sheet.classList.remove('uvd-player-dimmed');
  }
  ['pointerdown', 'touchstart', 'mousemove'].forEach(function(type) {
    videoWrapper.addEventListener(type, __uvdBrightenPlayer, { passive: true });
  });
  video.addEventListener('playing', __uvdArmPlayerDim);
  video.addEventListener('pause', __uvdBrightenPlayer);

  function __uvdIsFullscreenNow() {
    var fe = document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement;
    return !!(fe && (fe === videoWrapper || videoWrapper.contains(fe) || fe.contains(videoWrapper)));
  }
  videoWrapper.style.position = 'relative';
  videoWrapper.style.overflow = 'hidden';
  function __uvdApplyPlayerLayout() {
    var playerEl = document.getElementById('__uvd_player_el__');
    if (!playerEl) return;
    var skinEl = playerEl.querySelector('video-skin');
    var fs = __uvdIsFullscreenNow();
    var hasDims = video.videoWidth && video.videoHeight;
    var ratio = hasDims ? (video.videoWidth / video.videoHeight) : (16 / 9);
    var isPortrait = hasDims && ratio < 1;
    var viewportW = window.innerWidth || 390;
    var viewportH = window.innerHeight || 720;
    if (fs) {
      videoArea.style.height = '100%';
      videoWrapper.style.width = '100%';
      videoWrapper.style.height = '100%';
      videoWrapper.style.borderRadius = '0';
      playerEl.style.width = '100%';
      playerEl.style.height = '100%';
      playerEl.style.borderRadius = '0';
      playerEl.style.boxShadow = 'none';
      video.style.objectFit = 'contain';
      return;
    }
    // The popup card hugs the actual media frame. Portrait sources receive a
    // narrow tall frame; landscape sources a wide 16:9-style frame. There is
    // no fixed 80/92dvh player sheet and no decorative shadow competing with
    // the video controls.
    var maxWidth = isPortrait ? Math.min(viewportW * .68, 360) : Math.min(viewportW * .90, 640);
    var maxHeight = isPortrait ? viewportH * .58 : viewportH * .54;
    var frameW = maxWidth;
    var frameH = frameW / ratio;
    if (frameH > maxHeight) { frameH = maxHeight; frameW = frameH * ratio; }
    frameW = Math.max(160, Math.round(frameW));
    frameH = Math.max(110, Math.round(frameH));
    var frameRadius = '22px';
    sheet.style.setProperty('--uvd-player-card-width', Math.min(viewportW * .92, Math.max(frameW + 2, 300)) + 'px');
    sheet.style.height = 'auto';
    sheet.style.maxHeight = 'calc(100dvh - 24px)';
    sheetBody.style.flex = '0 1 auto';
    videoArea.style.flex = '0 0 auto';
    videoArea.style.height = frameH + 'px';
    videoArea.style.margin = '16px 0 18px';
    videoArea.style.background = 'transparent';
    videoWrapper.style.width = frameW + 'px';
    videoWrapper.style.height = frameH + 'px';
    videoWrapper.style.margin = '0 auto';
    videoWrapper.style.padding = '0';
    videoWrapper.style.borderRadius = frameRadius;
    videoWrapper.style.background = '#08080a';
    playerEl.style.position = 'relative';
    playerEl.style.margin = '0';
    playerEl.style.aspectRatio = frameW + '/' + frameH;
    playerEl.style.width = frameW + 'px';
    playerEl.style.height = frameH + 'px';
    playerEl.style.borderRadius = frameRadius;
    playerEl.style.boxShadow = 'none';
    playerEl.style.setProperty('background', '#08080a', 'important');
    playerEl.style.setProperty('--media-border-radius', frameRadius);
    video.style.objectFit = 'contain';
    video.style.borderRadius = frameRadius;
    video.style.setProperty('background', '#08080a', 'important');
    if (skinEl) {
      skinEl.style.setProperty('background', '#08080a', 'important');
      skinEl.style.borderRadius = frameRadius;
    }
  }
  video.addEventListener('loadedmetadata', __uvdApplyPlayerLayout);
  video.addEventListener('resize', __uvdApplyPlayerLayout);
  window.addEventListener('resize', __uvdApplyPlayerLayout);
  window.addEventListener('orientationchange', __uvdApplyPlayerLayout);
  playerState.__uvdLayoutFn = __uvdApplyPlayerLayout;
  __uvdApplyPlayerLayout();
  playerState.updatePlayerWidth = __uvdApplyPlayerLayout;
  var forceNativeBlobPlayer = reusedOriginalVideo && /(?:^|\.)api\.phimsrv\.com$/i.test(pageInfo.host);
  var forceNativeInteractivePlayer = __uvdIsProtectedInteractivePlayer();
  if (forceNativeBlobPlayer || forceNativeInteractivePlayer) {
    // Phimsrv/ArtPlayer owns a MediaSource blob; UPN also has its own
    // verification/player controls. Do not wrap either one with Video.js,
    // because the extra skin can hide the only usable Play control.
    video.setAttribute('controls', '');
    video.style.borderRadius = '24px';
    playerState.vjsMountCancel = null;
  } else {
    playerState.vjsMountCancel = __uvdMountVjs10(videoWrapper, video, __uvdApplyPlayerLayout);
  }
  // Đóng
  backBtn.onclick = function() { closePlayer(); };
  overlay.addEventListener('click', function(e) {
    if (e.target === overlay) closePlayer();
  });

  requestAnimationFrame(function() {
    overlay.classList.add('uvd-open');
  });
  setTimeout(function() {
    if (playerState.closing || !playerState.overlay) return;
    __uvdEnterLowPowerMode();
    videoArea.classList.remove('uvd-player-pending');
  }, data.settings.reduceMotion ? 180 : 420);

  // Menu ⋮
  function createMenuPanel(title, options, callback) {
    // Dùng cùng visual language với menu ⋮ của header player.
    var overlay2 = document.createElement('div');
    overlay2.className = 'uvd-quality-menu-layer';
    overlay2.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:transparent;';
    var panel = document.createElement('div');
    panel.className = 'uvd-player-menu uvd-quality-menu-panel uvd-player-clean-menu';
    panel.style.cssText = 'position:absolute;top:56px;right:12px;min-width:210px;max-width:min(90vw,300px);max-height:70vh;overflow:auto;';
    var heading = document.createElement('div');
    heading.className = 'uvd-quality-menu-title';
    heading.textContent = title;
    panel.appendChild(heading);
    options.forEach(function(opt) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = opt.label;
      if (opt.active) btn.className = 'uvd-quality-option-active';
      btn.onclick = function(e) {
        e.stopPropagation();
        callback(opt.value);
        overlay2.remove();
      };
      panel.appendChild(btn);
    });
    var closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.textContent = '← Quay lại';
    closeBtn.className = 'uvd-quality-menu-back';
    closeBtn.onclick = function(e) { e.stopPropagation(); overlay2.remove(); };
    panel.appendChild(closeBtn);
    overlay2.appendChild(panel);
    overlay2.addEventListener('click', function(e) { if (e.target === overlay2) overlay2.remove(); });
    __uvdAppendRoot(overlay2);
  }

  function showQualitySubMenu() {
    var hls = playerState.hls || activeHls || (playerState.video && playerState.video.__uvdHls) || window.__uvdActiveHls;
    var qualities = playerState.qualities || [];
    // Dùng level thật của hls.js, không phụ thuộc fetch master bị CORS/403.
    if (hls && hls.levels && hls.levels.length > 1) {
      qualities = hls.levels.map(function(level, idx) {
        var height = level.height || 0;
        return { label: height ? height + 'p' : (level.bitrate ? Math.round(level.bitrate / 1000) + 'kbps' : 'Level ' + (idx + 1)), resolution: (level.width && height) ? level.width + 'x' + height : 'unknown', bandwidth: level.bitrate || 0, levelIndex: idx, url: level.url || (level.urlSet && level.urlSet[0]) || '' };
      });
    }
    if (!qualities.length) { toast('Playlist này không có nhiều chất lượng'); return; }
    var opts = [{ label: '✓ Tự động', value: -1, active: !hls || hls.currentLevel === -1 }];
    qualities.forEach(function(q) {
      var active = hls && hls.currentLevel >= 0 && q.levelIndex === hls.currentLevel;
      opts.push({ label: (active ? '✓ ' : '') + q.label + (q.bandwidth ? ' · ' + Math.round(q.bandwidth / 1000) + 'kbps' : ''), value: q, active: active });
    });
    createMenuPanel('Chọn chất lượng', opts, function(value) {
      var hlsInstance = playerState.hls || activeHls || (playerState.video && playerState.video.__uvdHls) || window.__uvdActiveHls;
      // Nếu HLS instance bị mất do player wrapper tái khởi tạo, vẫn cho phép
      // chuyển sang variant URL đã lấy từ master playlist thay vì báo lỗi.
      if (!hlsInstance || !hlsInstance.levels) {
        if (value && value.url) {
          toast('Đang chuyển sang ' + value.label + '…');
          window.__uvdQualitySwitchCatalog = (playerState.qualities || []).slice();
          window.__uvd_showPlayer(value.url, 'M3U8', false, true, true);
        } else {
          toast('HLS chưa sẵn sàng — playlist không cung cấp URL chất lượng');
        }
        return;
      }
      if (value === -1) {
        hlsInstance.currentLevel = -1;
        hlsInstance.nextLevel = -1;
        toast('Đã bật chất lượng tự động');
        updateInfoDisplay();
        return;
      }
      var target = value.levelIndex;
      if (target === undefined) target = hlsInstance.levels.findIndex(function(level) { return (value.resolution !== 'unknown' && level.height === parseInt(value.resolution.split('x')[1])) || (value.bandwidth && level.bitrate === value.bandwidth); });
      if (target >= 0 && target < hlsInstance.levels.length) {
        hlsInstance.currentLevel = target;
        hlsInstance.nextLevel = target;
        hlsInstance.autoLevelEnabled = false;
        playerState.currentQuality = target;
        toast('Đã khóa ở: ' + value.label);
        updateInfoDisplay();
      } else if (value && value.url) {
        window.__uvdQualitySwitchCatalog = (playerState.qualities || []).slice();
        toast('Đang chuyển sang ' + value.label + '…');
        window.__uvd_showPlayer(value.url, 'M3U8', false, true, true);
      } else toast('Không tìm thấy level ' + value.label);
    });
  }

  menuBtn.onclick = function(e) {
    e.stopPropagation();
    sheet.classList.remove('uvd-player-dimmed');
    var existing = document.getElementById('__uvd_player_menu__');
    if (existing) { existing.remove(); menuBtn.classList.remove('uvd-menu-open'); return; }
    menuBtn.classList.add('uvd-menu-open');
    var menu = document.createElement('div');
    menu.id = '__uvd_player_menu__';
    menu.className = 'uvd-player-menu uvd-header-popover uvd-player-clean-menu';
    var qBtn = document.createElement('button');
    qBtn.innerHTML = '🎚 Chất lượng';
    qBtn.onclick = function() { menu.remove(); menuBtn.classList.remove('uvd-menu-open'); if (playerState.qualities.length > 0) showQualitySubMenu(); else toast('Không có chất lượng để chọn'); };
    var sBtn = document.createElement('button');
    sBtn.innerHTML = '💬 Phụ đề';
    sBtn.onclick = function() { menu.remove(); menuBtn.classList.remove('uvd-menu-open'); showSubtitlePanel(playerState.video); };
    var powerBtn = document.createElement('button');
    powerBtn.innerHTML = __uvdLowPowerMode ? '☀️ Bật lại giám sát' : '🔋 Giảm tải nền';
    powerBtn.onclick = function() { menu.remove(); menuBtn.classList.remove('uvd-menu-open'); __uvdLowPowerMode ? __uvdExitLowPowerMode() : __uvdEnterLowPowerMode(); };
    menu.appendChild(qBtn);
    menu.appendChild(sBtn);
    menu.appendChild(powerBtn);
    sheet.appendChild(menu);
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
      var errorHeaderMeta = document.getElementById('__uvd_player_header_meta__');
      info.textContent = '⚠ ' + playerState.playbackError;
      if (errorHeaderMeta) errorHeaderMeta.textContent = 'Đang phát video · ' + playerState.playbackError;
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
            if (s && !info.textContent.includes('≈')) {
              info.textContent = info.textContent + ' · ≈ ' + s;
              var asyncHeaderMeta = document.getElementById('__uvd_player_header_meta__');
              if (asyncHeaderMeta) asyncHeaderMeta.textContent = 'Đang phát video · ' + info.textContent;
            }
          })
          .catch(function(){});
      }
    }
    if (sizeText) parts.push(sizeText);
    var headerMeta = document.getElementById('__uvd_player_header_meta__');
    var playerMeta = parts.join(' · ');
    info.textContent = playerMeta;
    if (headerMeta) headerMeta.textContent = 'Đang phát video · ' + playerMeta;
  }

  function setPlaybackError(message) {
    playerState.playbackError = message;
    updateInfoDisplay();
    try {
      document.querySelectorAll('.uvd-card[data-url]').forEach(function(card) {
        if (card.getAttribute('data-url') === url || card.getAttribute('data-url') === playerState.url) {
          var status = card.querySelector('.uvd-card-status');
          if (status) { status.textContent = 'LINK LỖI'; status.className = 'uvd-card-status uvd-status-error'; }
        }
      });
    } catch(e) {}
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
  var isHls = String(type || '').toUpperCase() === 'M3U8' || /m3u8/i.test(url) || __uvdLooksLikeHlsUrl(url);
  var activeHls = null;

  var __uvdResumePromptShown = false;
  function onMetadataLoaded() {
    if (playerState.proxyFallbackTimer) { clearTimeout(playerState.proxyFallbackTimer); playerState.proxyFallbackTimer = null; }
    var mountedPlayer = document.getElementById('__uvd_player_el__');
    if (mountedPlayer) mountedPlayer.classList.remove('uvd-player-loading');
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
    if (data.settings.resumePlayback && !__uvdResumePromptShown) {
      var pos = getPlaybackPosition(url);
      if (pos && pos.time > 3 && (!pos.duration || pos.time < pos.duration - 3)) {
        __uvdResumePromptShown = true;
        try { video.pause(); } catch(e) {}
        __uvdOpenResumePrompt(video, url, pos, function(choice) {
          if (choice === 'continue') {
            try { video.currentTime = Math.min(pos.time, Math.max(0, (video.duration || pos.duration || pos.time) - 1)); video.play().catch(function(){}); } catch(e) {}
            toast('▶ Xem tiếp từ ' + formatTime(pos.time));
          } else {
            try { video.currentTime = 0; video.play().catch(function(){}); } catch(e) {}
            delete data.playbackPositions[url]; storage.set(data);
            toast('↺ Đã bắt đầu lại từ đầu');
          }
        });
      }
    }
  }

  video.addEventListener('loadedmetadata', onMetadataLoaded);
  video.addEventListener('durationchange', updateInfoDisplay);
  video.addEventListener('error', function() {
    if (playerState.closing || playerState.video !== video) return;
    if (playerState.usingNativeHls && !forceHlsJs) { showVideoPlayer(url, type, fromProxy, true, true); return; }
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

  video.addEventListener('play', function() { playerState.nativePlayAttempted = true; });
  video.addEventListener('playing', function() { if (playerState.nativeFallbackTimer) { clearTimeout(playerState.nativeFallbackTimer); playerState.nativeFallbackTimer = null; } });

  if (isHls) {
    var nativeHlsType = video.canPlayType('application/vnd.apple.mpegurl');
    var canTryNativeHls = !forceHlsJs && !!nativeHlsType && !fromProxy && !__uvdMediaAccessTokens.length;
    if (canTryNativeHls) {
      playerState.usingNativeHls = true;
      video.src = url;
      playerState.nativeFallbackTimer = setTimeout(function() {
        if (playerState.closing || playerState.video !== video || !playerState.usingNativeHls) return;
        var metadataReady = video.readyState >= 2 && video.videoWidth > 0 && isFinite(video.duration) && video.duration > 0;
        if (!metadataReady || playerState.nativePlayAttempted) showVideoPlayer(url, type, fromProxy, true, true);
      }, 8000);
    } else if (window.Hls && Hls.isSupported()) {
      activeHls = new Hls(__uvdMakeHlsConfig(Hls));
      // Giữ instance ở state/video ngay khi tạo. Một số playlist phát được
      // trước MANIFEST_PARSED nên callback menu không nên chỉ dựa vào biến
      // local activeHls.
      playerState.hls = activeHls;
      video.__uvdHls = activeHls;
      window.__uvdActiveHls = activeHls;
      activeHls.loadSource(url);
      activeHls.attachMedia(video);
      activeHls.on(Hls.Events.MANIFEST_PARSED, function() {
        setTimeout(function() { lockOrientation(video); }, 100);
        // Lấy level từ playlist thật mà hls.js đang phát, kể cả nguồn proxy.
        var parsedHlsLevels = (activeHls.levels || []).map(function(level, idx) {
          return { label: level.height ? level.height + 'p' : (level.bitrate ? Math.round(level.bitrate / 1000) + 'kbps' : 'Level ' + (idx + 1)), resolution: (level.width && level.height) ? level.width + 'x' + level.height : 'unknown', bandwidth: level.bitrate || 0, levelIndex: idx, url: level.url || (level.urlSet && level.urlSet[0]) || '' };
        });
        // Một variant playlist chỉ có một level; đừng ghi đè catalog master
        // đã giữ lại, nếu không lần chọn quality thứ hai sẽ mất danh sách.
        if (parsedHlsLevels.length > 1 || !playerState.qualities.length) playerState.qualities = parsedHlsLevels;
        updateInfoDisplay();
        if (!playerState.qualities.length) {
          parseM3U8Master(url, function(qualities) {
            if (qualities && qualities.length > 0) { playerState.qualities = qualities; updateInfoDisplay(); }
          });
        }
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
    } else if (video.canPlayType('application/vnd.apple.mpegurl') && /Safari/i.test(navigator.userAgent) && !/Chrome|CriOS|Android|Vivaldi/i.test(navigator.userAgent)) {
      // Chỉ dùng HLS native trên Safari thật. Android Chromium/Vivaldi đôi khi trả "maybe"
      // nhưng không tải segment ổn định, nên buộc dùng hls.js để đi qua proxy từng segment.
      video.src = url;
    } else {
      __uvdEnsureHls(function() {
        if (playerState.closing || playerState.video !== video) return;
        // Preserve fromProxy. Without this, a lazy hls.js load could restart
        // the proxy fallback as if the source were direct.
        showVideoPlayer(url, type, fromProxy, true, forceHlsJs);
      }, function() {
        if (playerState.closing || playerState.video !== video) return;
        setPlaybackError('Không tải được hls.js — thử tải lại bookmarklet hoặc kiểm tra CSP/CDN.');
      });
      return;
    }
  } else if (reusedOriginalVideo) {
    // Preserve the existing MediaSource attached to the original video node.
    setTimeout(function() { try { video.play().catch(function(){}); } catch(e) {} }, 50);
  } else {
    video.src = url;
  }

  if (!fromProxy && !reusedOriginalVideo) {
    playerState.proxyFallbackTimer = setTimeout(function() {
      if (!playerState.closing && playerState.video === video && !video.videoWidth && !playerState.playbackError) {
        if (retryThroughHeaderProxy(url, type)) toast('⏳ Nguồn gốc đang treo, chuyển sang proxy…');
      }
    }, 12000);
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
    __uvdExitLowPowerMode();
    if (data.settings.resumePlayback && playerState.url && playerState.video) {
      savePlaybackPosition(playerState.url, playerState.video);
    }
    clearTimeout(playerState.hideTimeout);
    clearTimeout(playerState.dimTimeout);
    clearTimeout(playerState.nativeFallbackTimer);
    if (playerState.proxyFallbackTimer) { clearTimeout(playerState.proxyFallbackTimer); playerState.proxyFallbackTimer = null; }
    if (playerState.audioCtx) {
      try { playerState.audioCtx.close(); } catch(e) {}
      playerState.audioCtx = null;
      playerState.gainNode = null;
      playerState.sourceNode = null;
    }
    if (playerState.vjsMountCancel) {
      playerState.vjsMountCancel();
      playerState.vjsMountCancel = null;
    }
    if (playerState.hls) { playerState.hls.destroy(); playerState.hls = null; }
    if (window.__uvdActiveHls) window.__uvdActiveHls = null;
    if (playerState.video && playerState.video.__uvdHls) playerState.video.__uvdHls = null;
    if (playerState.video) {
      playerState.video.pause();
      if (playerState.reusedOriginalVideo && playerState.originalVideoParent) {
        try {
          if (playerState.originalVideoNextSibling && playerState.originalVideoNextSibling.parentNode === playerState.originalVideoParent) playerState.originalVideoParent.insertBefore(playerState.video, playerState.originalVideoNextSibling);
          else playerState.originalVideoParent.appendChild(playerState.video);
        } catch(e) {}
      } else {
        playerState.video.removeAttribute('src');
        try { playerState.video.load(); } catch(e) {}
      }
    }
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
@keyframes uvdPulse{0%,100%{opacity:1;box-shadow:0 0 5px #ff9fb4}50%{opacity:0.4;box-shadow:0 0 20px #ff9fb4}}
@keyframes uvdScaleIn{from{opacity:0;transform:scale(0.94)}to{opacity:1;transform:scale(1)}}
@keyframes uvdRipple{to{transform:scale(4);opacity:0}}
@keyframes uvdCardEnter{from{opacity:0;transform:translate3d(0,10px,0)}to{opacity:1;transform:translate3d(0,0,0)}}
@keyframes uvdLiquidDrift{0%{transform:translate(-6%,-4%) scale(1)}50%{transform:translate(4%,6%) scale(1.12)}100%{transform:translate(-6%,-4%) scale(1)}}
@keyframes uvdFadeIn{from{opacity:0}to{opacity:1}}
@keyframes uvdDigDirt{0%,100%{transform:translateY(0) rotate(0);opacity:.52}50%{transform:translateY(-7px) rotate(12deg);opacity:1}}
@keyframes uvdDigOverlayOut{from{opacity:1}to{opacity:0}}
@keyframes uvdDigBoxFlyUp{from{opacity:1;transform:translate3d(0,0,0) scale(1)}to{opacity:0;transform:translate3d(0,-120vh,0) scale(.9)}}
@keyframes uvdPopupRiseAfterDig{from{opacity:0;transform:translate3d(0,96px,0) scale(.97)}to{opacity:1;transform:translate3d(0,0,0) scale(1)}}
@keyframes uvdMascotHop{0%,100%{transform:translateY(0) rotate(0)}50%{transform:translateY(-7px) rotate(-2deg)}}
@keyframes uvdMascotWiggle{0%,100%{transform:rotate(-3deg)}50%{transform:rotate(4deg)}}
@keyframes uvdDigLegLeft{from{transform:translateY(0) rotate(10deg)}to{transform:translateY(7px) rotate(-15deg)}}
@keyframes uvdDigLegRight{from{transform:translateY(6px) rotate(-10deg)}to{transform:translateY(0) rotate(15deg)}}
@keyframes uvdDigShovel{from{transform:rotate(-5deg) translateY(0)}to{transform:rotate(7deg) translateY(8px)}}
@keyframes uvdPandaEarWiggle{0%,100%{transform:rotate(-5deg)}50%{transform:rotate(8deg)}}
@keyframes uvdHamsterPop{0%,100%{transform:scale(1)}50%{transform:scale(1.14)}}
@keyframes uvdRaccoonTailWag{0%,100%{transform:rotate(-10deg) translateX(0)}50%{transform:rotate(14deg) translateX(1px)}}
@keyframes uvdPawTap{0%,100%{transform:translateY(0) rotate(-16deg)}50%{transform:translateY(-3px) rotate(-10deg)}}
@keyframes uvdBoardFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-2px)}}
.uvd-scope,.uvd-scope *{box-sizing:border-box}
.uvd-glass-card,.uvd-glass-panel,.uvd-settings-sheet:not(.uvd-player-sheet),.uvd-card{position:relative;background:var(--glass);backdrop-filter:blur(var(--uvd-blur)) saturate(135%);-webkit-backdrop-filter:blur(var(--uvd-blur)) saturate(135%);border:1px solid var(--border);color:var(--text);box-shadow:0 12px 32px rgba(15,118,110,.12),0 0 0 1px rgba(255,255,255,.12) inset,0 1px 0 rgba(255,255,255,.62) inset;transition:backdrop-filter var(--uvd-transition),background var(--uvd-transition),border-color var(--uvd-transition),box-shadow var(--uvd-transition)}
.uvd-glass-panel{border-radius:var(--radius-lg);font-family:-apple-system,BlinkMacSystemFont,'SF Pro Display','Segoe UI',Roboto,sans-serif;font-size:var(--fs-base);padding:16px;width:100%;position:relative;overflow:hidden;max-width:1000px;margin:auto}
.uvd-settings-sheet:not(.uvd-player-sheet){border-radius:32px 32px 0 0;transition:transform .3s cubic-bezier(.22,1,.36,1)!important}
.uvd-glass-card::before,.uvd-glass-panel::before,.uvd-settings-sheet:not(.uvd-player-sheet)::before,.uvd-card::before{content:'';position:absolute;top:0;left:10%;right:10%;height:1px;z-index:2;background:linear-gradient(90deg,transparent,rgba(255,159,180,.22),rgba(6,182,212,.5),transparent);opacity:.8;pointer-events:none}
.uvd-glass-panel::before{content:'';position:absolute;top:0;left:8%;right:8%;height:1px;z-index:2;background:linear-gradient(90deg,transparent,rgba(255,159,180,.22),rgba(6,182,212,0.6),transparent);opacity:0.7}
.uvd-settings-overlay{position:fixed;inset:0;z-index:2147483647;display:flex;align-items:flex-end;justify-content:center;background:rgba(0,0,0,0);transition:background .28s ease}
#__uvd_video_wrapper__:fullscreen,#__uvd_video_wrapper__:fullscreen::backdrop,#__uvd_video_wrapper__:fullscreen video,#__uvd_video_wrapper__:fullscreen video-player,#__uvd_video_wrapper__:fullscreen video-skin,#__uvd_player_video__:fullscreen,#__uvd_player_video__:fullscreen::backdrop{background:#000!important}
#__uvd_player_el__ video-skin,#__uvd_player_el__ video{border-radius:inherit!important}#__uvd_player_el__{background:#fff8fc!important;overflow:hidden!important;border-radius:24px!important}#__uvd_player_el__ video-skin{background:#fff8fc!important}#__uvd_player_el__.uvd-player-loading,#__uvd_player_el__.uvd-player-loading video-skin,#__uvd_player_el__.uvd-player-loading video{border-radius:24px!important;overflow:hidden!important}
#__uvd_video_wrapper__:fullscreen #__uvd_player_el__,#__uvd_video_wrapper__:fullscreen #__uvd_player_el__ video-skin,#__uvd_video_wrapper__:fullscreen #__uvd_player_el__ video{border-radius:0!important}
.uvd-icon-btn{background:var(--btn-bg);border:1px solid var(--border);color:#d85c7a;width:36px;height:36px;border-radius:var(--radius-sm);cursor:pointer;display:inline-flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0;position:relative;overflow:hidden;transition:all var(--uvd-transition)}
.uvd-icon-btn:active{transform:scale(.9)}
.uvd-player-card{width:100%;max-width:1000px;margin:auto;display:flex;flex-direction:column;border-radius:22px 22px 0 0;overflow:hidden;background:var(--glass);box-shadow:0 -10px 40px rgba(0,0,0,0.6);max-height:94dvh}
.uvd-player-menu{position:absolute;top:48px;right:12px;z-index:2147483647!important;opacity:1!important;filter:none!important;mix-blend-mode:normal!important;background:#0f3a36!important;backdrop-filter:none!important;-webkit-backdrop-filter:none!important;border:1px solid rgba(94,234,212,.55);border-radius:var(--radius-md);overflow:hidden;min-width:190px;box-shadow:0 12px 30px rgba(0,0,0,.55);animation:uvdFadeIn .15s ease}.uvd-player-menu button{color:#fff!important;background:transparent!important}.uvd-player-menu button:hover{background:rgba(255,159,180,.22)!important}
.uvd-player-menu button{display:flex;align-items:center;gap:10px;width:100%;padding:12px 14px;background:transparent;border:none;color:var(--text);font-size:13px;font-weight:600;text-align:left;cursor:pointer}
.uvd-player-menu button:active{background:var(--btn-accent-bg)}
.uvd-player-menu button+button{border-top:1px solid var(--border)}
.uvd-header-popover{top:54px!important;right:12px!important;min-width:210px!important;border-radius:18px!important;overflow:visible!important}.uvd-header-popover::before{content:'';position:absolute;right:24px;top:-8px;width:15px;height:15px;background:#0f3a36;border-left:1px solid rgba(94,234,212,.55);border-top:1px solid rgba(94,234,212,.55);transform:rotate(45deg);z-index:0}.uvd-header-popover::after{content:'';position:absolute;right:18px;top:-15px;width:30px;height:18px;background:rgba(255,159,180,.22);filter:blur(10px);pointer-events:none}.uvd-header-popover button:first-of-type{border-top:none!important}.uvd-quality-menu-layer{pointer-events:auto}.uvd-quality-menu-panel{padding:6px!important}.uvd-quality-menu-title{padding:8px 10px 7px;color:#fff;font-size:12px;font-weight:800;border-bottom:1px solid rgba(94,234,212,.28);margin-bottom:2px}.uvd-quality-menu-panel button{min-height:38px;padding:10px 12px!important;font-size:12px!important}.uvd-quality-menu-panel .uvd-quality-option-active{color:#5eead4!important;background:rgba(255,159,180,.22)!important}.uvd-quality-menu-panel .uvd-quality-menu-back{color:#ccfbf1!important;font-size:11px!important}
.uvd-icon-btn-wide{width:auto;padding:0 10px;font-size:13px;font-weight:600;gap:4px}
.uvd-liquid-bg{position:absolute;inset:-20%;z-index:0;pointer-events:none;background:radial-gradient(closest-side,rgba(255,159,180,.22),transparent 70%) 20% 25%/60% 60% no-repeat;filter:blur(28px);animation:uvdLiquidDrift 16s ease-in-out infinite}
.uvd-reduce-motion .uvd-liquid-bg{display:none}
.uvd-settings-overlay.uvd-open{background:rgba(0,0,0,0.55)}.uvd-player-overlay.uvd-open{background:rgba(0,0,0,.9)}
.uvd-settings-sheet{width:100%;max-width:1000px;max-height:92dvh;display:flex;flex-direction:column;transform:translate3d(0,100%,0);will-change:transform;backface-visibility:hidden;transition:transform .3s cubic-bezier(.22,1,.36,1);border-radius:32px 32px 0 0;overflow:hidden;background:var(--glass);backdrop-filter:blur(var(--uvd-blur)) saturate(130%);-webkit-backdrop-filter:blur(var(--uvd-blur)) saturate(130%);border:1px solid var(--border);box-shadow:0 -20px 50px rgba(0,0,0,0.8)}
.uvd-settings-overlay.uvd-open .uvd-settings-sheet{transform:translate3d(0,0,0)}
.uvd-player-sheet{position:relative;transition:none!important;will-change:auto!important}
@keyframes uvdPlayerFromThumb{from{opacity:0;transform:translate3d(0,28px,0) scale(.965);filter:blur(2px)}to{opacity:1;transform:translate3d(0,0,0) scale(1);filter:blur(0)}}
.uvd-player-sheet.uvd-player-from-thumbnail{animation:uvdPlayerFromThumb .34s cubic-bezier(.22,1,.36,1) both}
.uvd-settings-header{display:flex;align-items:center;gap:10px;padding:14px 16px;border-bottom:1px solid var(--border);flex-shrink:0}
.uvd-settings-header .uvd-back-btn{background:var(--glass-hi);border:1px solid var(--border);color:var(--text);width:34px;height:34px;border-radius:var(--radius-sm);cursor:pointer;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0}
.uvd-settings-title-wrap{display:flex;flex-direction:column;gap:2px;min-width:0}.uvd-settings-title{font-weight:800;font-size:16px;color:var(--accent-text);text-shadow:0 0 12px rgba(255,159,180,.22)}.uvd-settings-subtitle{font-size:10px;color:var(--text3);font-weight:600}.uvd-player-header-title{display:flex;align-items:center;gap:8px;min-width:0;flex:1;justify-content:flex-start;margin-left:10px;color:var(--text)}.uvd-player-header-title strong{display:block;font-size:14px;font-weight:800;white-space:nowrap}.uvd-player-sheet .uvd-settings-header{min-height:96px!important;padding:20px 20px!important;gap:12px!important}.uvd-player-sheet .uvd-back-btn,.uvd-player-sheet .uvd-icon-btn{width:44px;height:44px;border-radius:16px}.uvd-settings-sheet.uvd-scroll-performance,.uvd-settings-sheet.uvd-scroll-performance .uvd-card{backdrop-filter:none!important;-webkit-backdrop-filter:none!important}.uvd-settings-sheet.uvd-scroll-performance .uvd-card{box-shadow:0 2px 10px rgba(15,118,110,.08),0 0 0 1px rgba(255,255,255,.12) inset}.uvd-settings-sheet.uvd-scroll-performance::before{display:none}.uvd-player-sheet .uvd-settings-header{background:linear-gradient(150deg,#fff0f5 0%,#ffe3ec 60%,#fff8fc 100%)!important;border-bottom:2px solid rgba(255,159,180,.22)!important;box-shadow:0 6px 18px rgba(247,108,140,.12),inset 0 1px 0 rgba(255,255,255,.8)!important;min-height:96px!important;padding:20px 20px!important}.uvd-player-sheet .uvd-player-header-title{color:var(--text)}.uvd-player-sheet .uvd-player-header-title small{color:var(--text2);font-weight:650}.uvd-player-header-title small{display:block;margin-top:2px;color:var(--text3);font-size:9px;text-align:center}.uvd-player-live-dot{width:8px;height:8px;flex:0 0 8px;border-radius:50%;background:#ff9fb4;box-shadow:0 0 0 4px rgba(255,159,180,.22),0 0 12px rgba(255,159,180,.22);animation:uvdPulse 2s infinite}
.uvd-player-header{position:relative;min-height:76px!important;padding:14px 18px!important;gap:12px!important;overflow:hidden}.uvd-player-header::before{content:'';position:absolute;left:7%;right:7%;top:0;height:1px;background:linear-gradient(90deg,transparent,rgba(255,159,180,.22),rgba(6,182,212,.35),transparent);opacity:.55}.uvd-player-header::after{content:'';position:absolute;width:150px;height:70px;right:54px;top:-34px;background:rgba(255,159,180,.22);filter:blur(24px);border-radius:50%;pointer-events:none}.uvd-player-header>*{position:relative;z-index:1}.uvd-player-header .uvd-back-btn,.uvd-player-header .uvd-player-menu-btn{width:42px!important;height:42px!important;padding:0!important;border-radius:14px!important;background:rgba(255,255,255,.58)!important;border:1px solid rgba(255,159,180,.22)!important;color:#d85c7a!important;box-shadow:0 4px 12px rgba(15,118,110,.08),inset 0 1px 0 rgba(255,255,255,.8);font-size:20px!important;line-height:1}.uvd-player-header .uvd-player-menu-btn{font-size:25px!important;font-weight:800!important}.uvd-player-header .uvd-back-btn,.uvd-player-header .uvd-player-menu-btn{transition:transform .16s ease,background .16s ease,border-color .16s ease,box-shadow .16s ease}.uvd-player-header .uvd-back-btn:hover,.uvd-player-header .uvd-player-menu-btn:hover{background:rgba(255,159,180,.22)!important;border-color:rgba(255,159,180,.22)!important;transform:translateY(-1px);box-shadow:0 7px 18px rgba(13,148,136,.16),inset 0 1px 0 rgba(255,255,255,.9)}.uvd-player-header .uvd-player-menu-btn:active{transform:scale(.92)!important;background:linear-gradient(145deg,rgba(255,159,180,.22),rgba(6,182,212,.16))!important;border-color:rgba(6,182,212,.55)!important;box-shadow:0 2px 7px rgba(8,145,178,.18),inset 0 2px 5px rgba(13,148,136,.12)}.uvd-player-header .uvd-player-menu-btn:focus-visible{outline:3px solid rgba(255,159,180,.22);outline-offset:3px}.uvd-player-header .uvd-player-menu-btn.uvd-menu-open{background:linear-gradient(145deg,rgba(255,159,180,.22),rgba(6,182,212,.12))!important;border-color:rgba(6,182,212,.45)!important;box-shadow:0 5px 14px rgba(8,145,178,.14),inset 0 1px 0 rgba(255,255,255,.9)}.uvd-player-title-copy{min-width:0;display:flex;flex-direction:column;gap:4px}.uvd-player-title-copy strong{font-size:15px!important;letter-spacing:-.01em;background:linear-gradient(110deg,#0f766e 0%,#06b6d4 52%,#0d9488 100%);-webkit-background-clip:text;background-clip:text;color:transparent;text-shadow:0 0 14px rgba(6,182,212,.24);filter:saturate(1.18)}.uvd-player-title-copy small{display:flex;align-items:center;gap:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.uvd-player-type-badge{display:inline-flex;align-items:center;padding:3px 7px;border-radius:999px;background:rgba(255,159,180,.22);border:1px solid rgba(255,159,180,.22);color:#d85c7a;font-size:9px;line-height:1;font-weight:800;letter-spacing:.04em}.uvd-player-sheet .uvd-player-header-title{margin-left:2px;gap:9px}.uvd-player-sheet .uvd-player-header-title small{margin-top:0;text-align:left}.uvd-player-sheet .uvd-player-header-title small>span:last-child{color:var(--text3);font-size:10px;font-weight:650}@media (max-width:420px){.uvd-player-header{min-height:68px!important;padding:12px 14px!important;gap:9px!important}.uvd-player-header .uvd-back-btn,.uvd-player-header .uvd-player-menu-btn{width:38px!important;height:38px!important;border-radius:13px!important}.uvd-player-title-copy strong{font-size:13px!important}.uvd-player-sheet .uvd-player-header-title{gap:7px}.uvd-player-type-badge{font-size:8px;padding:3px 6px}}
.uvd-player-video-area{position:relative;overflow:hidden;background:radial-gradient(circle at 18% 18%,rgba(255,159,180,.22),transparent 34%),radial-gradient(circle at 84% 76%,rgba(6,182,212,.14),transparent 40%),linear-gradient(135deg,rgba(235,251,248,.92),rgba(245,232,255,.94));}.uvd-player-video-area.uvd-player-pending>#__uvd_video_wrapper__{opacity:0;pointer-events:none}.uvd-player-video-area.uvd-player-pending::before{content:'Chuẩn bị trình phát…';position:absolute;z-index:2;left:50%;top:50%;transform:translate(-50%,-50%);padding:9px 14px;border:1px solid var(--border);border-radius:999px;background:rgba(248,253,252,.62);backdrop-filter:blur(10px);color:#d85c7a;font-size:12px;font-weight:750;white-space:nowrap}
.uvd-player-video-area::before{content:'';position:absolute;inset:-25%;pointer-events:none;background:conic-gradient(from 120deg at 50% 50%,transparent,rgba(255,159,180,.22),transparent 28%,rgba(6,182,212,.08),transparent 55%);filter:blur(22px);animation:uvdLiquidDrift 18s ease-in-out infinite}
.uvd-player-video-area::after{content:'';position:absolute;inset:0;pointer-events:none;opacity:.3;background-image:linear-gradient(rgba(255,255,255,.16) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.16) 1px,transparent 1px);background-size:36px 36px;mask-image:linear-gradient(to bottom,transparent,black 25%,black 75%,transparent)}
.uvd-player-video-area>#__uvd_video_wrapper__{position:relative;z-index:1}
.uvd-player-info-panel{flex-shrink:0;padding:14px 18px 18px;border-top:1px solid var(--border);background:linear-gradient(180deg,rgba(255,159,180,.22),rgba(6,182,212,0.03));}
.uvd-player-info-title{display:flex;align-items:center;gap:8px;font-weight:700;font-size:15px;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-bottom:6px}
.uvd-player-info-icon{flex-shrink:0;width:22px;height:22px;border-radius:50%;background:var(--grad-liquid);color:#fff;font-size:10px;display:inline-flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(255,159,180,.22)}
.uvd-player-info-meta{font-size:12px;font-weight:750;color:#d85c7a;background:rgba(255,159,180,.22);border:1px solid rgba(255,159,180,.22);display:inline-block;padding:6px 13px;border-radius:999px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%;letter-spacing:.01em}.uvd-player-info-panel{backdrop-filter:blur(6px) saturate(120%);-webkit-backdrop-filter:blur(6px) saturate(120%)}.uvd-player-info-title{font-size:16px;font-weight:800} @media (max-width:420px){.uvd-player-sheet .uvd-settings-header{padding:16px 16px!important;min-height:82px!important}.uvd-player-sheet .uvd-back-btn,.uvd-player-sheet .uvd-icon-btn{width:42px!important;height:42px!important;border-radius:14px!important}.uvd-player-header-title{margin-left:8px}.uvd-player-header-title strong{font-size:15px!important}}
.uvd-player-sheet.uvd-player-dimmed .uvd-settings-header,.uvd-player-sheet.uvd-player-dimmed .uvd-player-info-panel{opacity:.22;transition:opacity .35s ease}.uvd-player-sheet.uvd-player-dimmed .uvd-player-video-area::after{background-image:none;background:rgba(0,0,0,.12)}
.uvd-iframe-card{padding:16px!important;background:linear-gradient(145deg,rgba(248,253,252,.9),rgba(236,254,255,.7))!important}.uvd-iframe-card-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin-bottom:12px}.uvd-iframe-card-head>div{display:flex;flex-direction:column;gap:7px;min-width:0}.uvd-iframe-card-head strong{font-size:14px;color:var(--text)}.uvd-iframe-card .uvd-card-stream-meta{margin:0 0 12px;background:rgba(14,116,144,.07);color:var(--text2)}.uvd-ai-badge{display:inline-block;width:max-content;padding:3px 8px;border-radius:6px;font-size:9px;font-weight:800;letter-spacing:.04em;color:#fff}.uvd-ai-badge.uvd-ai-player{background:#1fa97a}.uvd-ai-badge.uvd-ai-junk{background:#ff5d72}.uvd-ai-badge.uvd-ai-unknown{background:#c9862a}.uvd-iframe-actions{display:flex;flex-wrap:wrap;gap:7px;margin-top:12px}
/* ===== CUTE STREAM CARDS ===== */
.uvd-card.uvd-cute{background:linear-gradient(150deg,rgba(255,255,255,.9),rgba(255,240,247,.85))!important;border:1px solid rgba(255,159,180,.3)!important;border-radius:22px!important;box-shadow:0 8px 22px rgba(247,108,140,.12),0 0 0 1px rgba(255,255,255,.6) inset!important}
.uvd-card.uvd-cute:hover{border-color:rgba(247,108,140,.5)!important;box-shadow:0 14px 30px rgba(247,108,140,.22)!important}
.uvd-cute .uvd-type-badge{background:linear-gradient(135deg,rgba(255,214,228,.6),rgba(255,182,198,.5))!important;color:#d85c7a!important;border:1px solid rgba(255,159,180,.35)!important;border-radius:10px!important}
.uvd-cute .uvd-card-status{font-size:8.5px!important}
.uvd-cute .uvd-card-url-label{color:#d85c7a!important}
.uvd-cute .uvd-card-stream-meta{background:rgba(255,214,228,.35)!important;border-color:rgba(255,159,180,.3)!important;color:#c95073!important;border-radius:12px!important}
.uvd-card-guide{display:flex;align-items:center;gap:6px;padding:7px 11px;margin:0 0 9px;border-radius:12px;background:linear-gradient(135deg,rgba(255,214,228,.45),rgba(239,221,255,.4))!important;border:1px solid rgba(255,159,180,.3)!important;color:#a05668!important;font-size:11px;font-weight:700;line-height:1.45}
.uvd-junk-advice{display:inline-flex;align-items:center;gap:6px;padding:7px 12px;border-radius:12px;background:rgba(255,93,114,.14);border:1px solid rgba(255,93,114,.34);color:#ff5d72;font-size:11px;font-weight:800}
.uvd-cute-actions{display:flex;flex-wrap:wrap;align-items:center;gap:6px}
.uvd-votechip{display:inline-flex;align-items:center;gap:3px;padding:4px 9px;border-radius:999px;font-size:10px;font-weight:800;cursor:pointer;border:none;transition:transform .15s ease}
.uvd-votechip:active{transform:scale(.88)}
.uvd-votechip-up{background:linear-gradient(135deg,#ffe3ec,#ffd6e4);color:#e84a72;border:1px solid rgba(232,74,114,.25)}
.uvd-votechip-down{background:linear-gradient(135deg,#ffe9e9,#ffdede);color:#ff5d72;border:1px solid rgba(255,93,114,.25)}
.uvd-cute .uvd-card-preview{border-radius:18px;border:1px solid rgba(255,159,180,.25)}.uvd-iframe-actions .uvd-btn{flex:1 1 120px;min-height:38px}
.uvd-iframe-card .uvd-cute-actions{margin-top:10px;padding-top:10px;border-top:1px dashed rgba(194,150,255,.25)}
/* ===== CUTE LAYOUT: header pill, context pill, body pill ===== */
.uvd-context-bar.uvd-context-cute{display:flex;align-items:center;gap:10px;padding:12px 14px;margin-bottom:14px;border:1px solid rgba(194,150,255,.35)!important;border-radius:22px!important;background:linear-gradient(150deg,#f8f4ff,#f3ecff)!important;box-shadow:0 6px 18px rgba(150,90,220,.14),0 0 0 1px rgba(255,255,255,.6) inset!important}
.uvd-context-emoji{flex:0 0 auto;width:38px;height:38px;display:flex;align-items:center;justify-content:center;font-size:22px;background:linear-gradient(150deg,#ffe0ea,#ffd6e4);border-radius:50%;box-shadow:0 4px 10px rgba(247,108,140,.18)}
.uvd-context-cute .uvd-context-kicker{color:#9a6ce0!important;font-weight:800;letter-spacing:.04em;font-size:9px}
.uvd-context-cute .uvd-context-title{color:#7a4fb0!important;font-weight:800;font-size:14px}
.uvd-context-cute .uvd-meta-chip{background:rgba(255,255,255,.7)!important;border:1px solid rgba(194,150,255,.3)!important;color:#8a6ab0!important;border-radius:999px!important;font-size:10px!important}
.uvd-body-cute{background:rgba(255,240,247,.55)!important;border:1px solid rgba(255,159,180,.25)!important;border-radius:28px!important;padding:0!important;overflow:hidden!important;-webkit-mask-image:-webkit-radial-gradient(white,black)!important;mask-image:radial-gradient(white,black)!important;box-shadow:0 5px 16px rgba(247,108,140,.1),0 0 0 1px rgba(255,255,255,.55) inset!important}
.uvd-body-cute #__uvd_stream_list__{padding:8px!important}
.uvd-iframe-window-link{text-decoration:none;display:inline-flex;align-items:center;justify-content:center}.uvd-settings-body{overflow-y:auto;padding:14px 16px;flex:1;contain:layout style;overscroll-behavior:contain;-webkit-overflow-scrolling:touch}.uvd-settings-sheet:not(.uvd-player-sheet) .uvd-card{backdrop-filter:none!important;-webkit-backdrop-filter:none!important;box-shadow:0 4px 14px rgba(15,118,110,.07),0 0 0 1px rgba(255,255,255,.5) inset!important;transition:none!important;animation:none!important}.uvd-settings-sheet:not(.uvd-player-sheet) .uvd-settings-body>.uvd-card{content-visibility:auto;contain:layout paint style;contain-intrinsic-size:0 170px}.uvd-settings-sheet:not(.uvd-player-sheet).uvd-scroll-performance{backdrop-filter:none!important;-webkit-backdrop-filter:none!important;background:rgba(248,253,252,.98)!important}
.uvd-tab-hidden .uvd-liquid-bg{animation-play-state:paused}
.uvd-panel-content{position:relative;z-index:1;display:flex;flex-direction:column;height:100%;min-height:0}
.uvd-app-shell{padding:0!important;border-radius:32px!important;background:linear-gradient(165deg,rgba(255,247,250,.85),rgba(255,233,244,.8))!important;border:1px solid rgba(255,159,180,.3)!important;box-shadow:0 24px 60px rgba(247,108,140,.2),0 0 0 1px rgba(255,255,255,.5) inset!important;overflow:visible!important}.uvd-app-shell.uvd-panel-collapsed{top:15px!important;bottom:auto!important;height:auto!important;max-height:none!important;padding:10px 14px!important}.uvd-app-shell.uvd-panel-collapsed .uvd-panel-content>*:not(#__uvd_header__){max-height:0!important;min-height:0!important;margin-top:0!important;margin-bottom:0!important;padding-top:0!important;padding-bottom:0!important;border-width:0!important;opacity:0!important;overflow:hidden!important;transform:translateY(-28px);pointer-events:none!important;transition:max-height .65s cubic-bezier(.22,1,.36,1),opacity .5s ease,transform .65s cubic-bezier(.22,1,.36,1),margin .65s cubic-bezier(.22,1,.36,1),padding .65s cubic-bezier(.22,1,.36,1)}.uvd-app-shell.uvd-panel-collapsed #__uvd_header__{padding:0!important;margin:0!important;border-bottom:0!important}
.uvd-app-shell::after{display:none!important}
.uvd-app-shell>.uvd-panel-content{z-index:1}
.uvd-app-shell #__uvd_header__{display:flex;align-items:center;justify-content:space-between;gap:14px;min-width:0;padding:10px 14px;margin:0 0 12px;max-height:200px;border-bottom:0!important;flex-shrink:0;overflow:visible;background:linear-gradient(150deg,rgba(255,244,248,.72),rgba(255,236,246,.66))!important;border:1px solid rgba(255,159,180,.32)!important;border-radius:26px!important;box-shadow:0 5px 16px rgba(247,108,140,.14),0 0 0 1px rgba(255,255,255,.6) inset!important;backdrop-filter:blur(14px) saturate(150%);-webkit-backdrop-filter:blur(14px) saturate(150%)}
.uvd-brand{display:flex;align-items:center;gap:12px;min-width:0;flex:1 1 auto}
.uvd-brand-mark{background:transparent!important;box-shadow:none!important;border:none!important;width:76px!important;height:76px!important;flex:0 0 76px!important;border-radius:0!important;filter:drop-shadow(0 8px 18px rgba(247,108,140,.32));animation:uvdMascotHop 2s ease-in-out infinite}.uvd-brand-mark::after{content:'';position:absolute;inset:-30%;background:linear-gradient(120deg,transparent 35%,rgba(255,255,255,.42) 50%,transparent 65%);transform:translateX(-60%) rotate(12deg);animation:uvdLogoShine 4.5s ease-in-out infinite}@keyframes uvdLogoShine{0%,65%{transform:translateX(-70%) rotate(12deg)}85%,100%{transform:translateX(70%) rotate(12deg)}}.uvd-logo-ring{position:relative;z-index:1;display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;border:2px solid rgba(255,255,255,.78);border-radius:50%;box-shadow:0 0 0 4px rgba(255,255,255,.13),0 0 14px rgba(255,255,255,.28)}.uvd-logo-ring span{font-size:14px;transform:translateX(1px)}
.uvd-brand-name{font-size:21px;font-weight:850;line-height:1.05;letter-spacing:-.025em;color:var(--text)}
.uvd-brand-version{margin-top:3px;font-size:16px;line-height:1.05;font-weight:850;background:var(--grad-liquid);-webkit-background-clip:text;background-clip:text;color:transparent}
.uvd-brand-sub{margin-top:5px;color:var(--text3);font-size:9px;font-weight:700;letter-spacing:.04em;text-transform:uppercase}
.uvd-header-actions{display:grid;grid-template-columns:repeat(3,34px);grid-auto-rows:34px;gap:6px;flex:0 0 114px;width:114px;min-width:114px;max-width:114px;justify-content:end;align-content:center;padding:2px 0}
.uvd-header-actions .uvd-btn-icon{width:34px;height:34px;flex:0 0 34px;border-radius:12px;font-size:14px;background:rgba(6,182,212,.10);box-shadow:0 3px 10px rgba(15,118,110,.10),0 0 0 1px rgba(255,255,255,.12) inset;transition:transform .16s ease,background .18s ease,box-shadow .18s ease}
.uvd-header-actions .uvd-btn-icon:hover{background:rgba(255,159,180,.22);box-shadow:0 5px 14px rgba(255,159,180,.22),0 0 0 1px rgba(255,255,255,.18) inset}
.uvd-header-actions .uvd-btn-icon:active{transform:scale(.9)}
#__uvd_preload__{color:#d85c7a;border-color:rgba(6,182,212,.32)}
.uvd-header-actions .uvd-close-action{color:var(--danger)}
/* ===== CUTE HEADER (kawaii pastel) ===== */
.uvd-brand-mark{background:transparent!important;box-shadow:none!important;border:none!important;width:76px!important;height:76px!important;flex:0 0 76px!important;border-radius:0!important;filter:drop-shadow(0 8px 18px rgba(247,108,140,.32));animation:uvdMascotHop 2s ease-in-out infinite}
.uvd-brand-mark.uvd-brand-mark-hero{width:88px!important;height:88px!important;flex:0 0 88px!important;transform:scale(1.1);background:transparent!important;border:none!important;box-shadow:none!important;filter:drop-shadow(0 10px 22px rgba(247,108,140,.34))}
.uvd-brand-mark.uvd-brand-mark-hero svg{width:100%;height:100%;display:block;animation:uvdMascotWiggle 1.6s ease-in-out infinite}
.uvd-brand-mark svg{display:block;width:100%;height:100%}
.uvd-brand-name{background:linear-gradient(120deg,#e84a72,#f76c8c,#c95cb8);-webkit-background-clip:text;background-clip:text;color:transparent;font-size:22px}
.uvd-brand-heart{color:#f76c8c;-webkit-text-fill-color:#f76c8c;font-size:17px}
.uvd-brand-version{background:linear-gradient(120deg,#f76c8c,#c95cb8);-webkit-background-clip:text;background-clip:text;color:transparent;margin-top:3px;font-size:13px;font-weight:800}
.uvd-brand-sub{color:#c95073!important;font-size:9px}
.uvd-header-actions .uvd-btn-icon{background:linear-gradient(150deg,#fff0f5,#ffe3ec)!important;border:1px solid rgba(255,159,180,.35)!important;color:#d85c7a!important;box-shadow:0 4px 12px rgba(247,108,140,.16),0 0 0 1px rgba(255,255,255,.7) inset!important}
.uvd-header-actions .uvd-btn-icon:hover{background:linear-gradient(150deg,#ffd6e4,#ffb6c6)!important;color:#fff!important;box-shadow:0 6px 16px rgba(247,108,140,.30)!important}
.uvd-header-actions .uvd-btn-icon:active{transform:scale(.88)}
.uvd-header-actions .uvd-close-action{color:#ff5d72!important}
.uvd-context-bar{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 14px;margin-bottom:8px;border:1px solid rgba(194,150,255,.35)!important;border-radius:22px!important;background:linear-gradient(150deg,#f8f4ff,#f3ecff)!important;flex-shrink:0;box-shadow:0 5px 16px rgba(150,90,220,.14),0 0 0 1px rgba(255,255,255,.6) inset!important}
.uvd-context-main{min-width:0;display:flex;flex-direction:column;gap:5px}
.uvd-context-kicker{font-size:9px;font-weight:800;letter-spacing:.12em;color:var(--accent-text);opacity:.8}
.uvd-context-title{max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;border:0;padding:0;background:transparent;color:var(--text);font:700 15px inherit;text-align:left;cursor:pointer}
.uvd-context-meta{display:flex;justify-content:flex-end;flex-wrap:wrap;gap:5px}
.uvd-meta-chip{border:1px solid var(--border);border-radius:999px;padding:6px 9px;max-width:210px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;background:rgba(255,255,255,.28);color:#d85c7a;font-size:10px;cursor:pointer}
.uvd-meta-chip:hover{background:var(--btn-accent-bg)}
.uvd-reduce-motion *{animation:none!important;transition:none!important}
.uvd-glass-panel.uvd-reduce-motion,.uvd-reduce-motion .uvd-settings-sheet{backdrop-filter:blur(6px)!important;-webkit-backdrop-filter:blur(6px)!important;background:rgba(248,253,252,.94)!important;border-color:rgba(255,159,180,.22)}
.uvd-reduce-motion .uvd-card,.uvd-reduce-motion .uvd-player-menu,.uvd-reduce-motion .uvd-action-list{backdrop-filter:blur(5px)!important;-webkit-backdrop-filter:blur(5px)!important;background:rgba(248,253,252,.9)!important;box-shadow:0 3px 12px rgba(15,118,110,.08),0 0 0 1px rgba(255,255,255,.5) inset!important}.uvd-reduce-motion .uvd-card{contain:layout paint style}.uvd-settings-body>.uvd-card,.uvd-settings-body>.uvd-section-title{content-visibility:auto;contain:layout paint style;contain-intrinsic-size:0 180px}
.uvd-reduce-motion .uvd-glass-panel .uvd-panel-content{color:var(--text)}
.uvd-reduce-motion .uvd-glass-panel .uvd-tab{color:var(--text2)}
.uvd-reduce-motion .uvd-glass-panel .uvd-tab.uvd-tab-active{color:#fff}
.uvd-tabbar{display:flex;gap:8px;padding:8px;background:rgba(255,255,255,.86)!important;border:1px solid rgba(255,159,180,.34)!important;border-radius:26px;margin:0 0 14px;flex-shrink:0;overflow-x:auto;overflow-y:visible!important;scrollbar-width:none;position:relative;z-index:3;box-shadow:0 8px 20px rgba(247,108,140,.14),0 0 0 1px rgba(255,255,255,.7) inset!important}
.uvd-tabbar::-webkit-scrollbar{display:none}
.uvd-tab-indicator{position:absolute;top:6px;bottom:6px;left:0;width:0;border-radius:20px;background:linear-gradient(135deg,#ff9fb4,#f76c8c);z-index:0;box-shadow:0 6px 16px rgba(247,108,140,.32);transition:transform .4s cubic-bezier(.34,1.56,.64,1),width .4s cubic-bezier(.34,1.56,.64,1)}
.uvd-tab{position:relative;z-index:1;flex:1 1 0%;min-width:86px;display:flex;flex-direction:column;align-items:center;gap:4px;background:transparent;border:none;color:#c06a84;font-weight:800;font-size:10.5px;padding:8px 10px 9px;border-radius:20px;cursor:pointer;white-space:nowrap;text-align:center;transition:transform .18s cubic-bezier(.22,1,.36,1),color .2s ease,background .2s ease}
.uvd-tab-mascot{width:36px;height:36px;display:flex;align-items:center;justify-content:center;background:transparent!important;border:none!important;box-shadow:none!important;filter:drop-shadow(0 3px 8px rgba(247,108,140,.18));transition:transform .18s ease}
.uvd-tab-mascot svg{width:100%;height:100%;display:block}
.uvd-tab-active .uvd-tab-mascot{transform:scale(1.12);animation:uvdMascotHop 1.8s ease-in-out infinite}
.uvd-tab-text{font-size:11px;line-height:1.1;max-width:100%;overflow:hidden;text-overflow:ellipsis}
.uvd-tab.uvd-tab-active{color:#fff!important;text-shadow:none!important;background:linear-gradient(135deg,#ff9fb4,#f76c8c)!important;box-shadow:0 6px 16px rgba(247,108,140,.34)!important;transform:translateY(-1px)}
.uvd-tab:hover{transform:translateY(-1px)}
.uvd-filter-bar{display:flex;gap:6px;overflow-x:auto;padding:0 0 10px;scrollbar-width:none;flex-shrink:0}
.uvd-filter-bar::-webkit-scrollbar{display:none}
.uvd-filter-btn{flex:0 0 auto;border:1px solid var(--border);border-radius:999px;padding:6px 12px;background:rgba(255,255,255,.24);color:var(--text2);font-size:11px;font-weight:700;cursor:pointer}
.uvd-filter-btn:hover{background:var(--btn-accent-bg);color:#d85c7a}
.uvd-filter-btn.uvd-filter-active{background:var(--grad-liquid);border-color:transparent;color:#fff;box-shadow:0 4px 12px rgba(255,159,180,.22)}
.uvd-filter-select{flex:0 0 auto;min-width:108px;border:1px solid var(--border);border-radius:999px;padding:6px 10px;background:rgba(255,255,255,.24);color:var(--text2);font-size:11px;font-weight:700;outline:none}
.uvd-scope{color:var(--text);font-family:-apple-system,BlinkMacSystemFont,'SF Pro Display','Segoe UI',Roboto,sans-serif;--bg:rgba(242,250,248,0.98);--glass:rgba(255,255,255,0.9);--glass-hi:rgba(15,118,110,0.08);--border:rgba(15,118,110,0.25);--text:#123c38;--text2:#365f59;--text3:#52736e;--accent:#0f766e;--accent-text:#0b5f59;--accent2:#0e7490;--danger:#ff5d72;--gold:#a86200;--success:#1fa97a;--card-bg:rgba(255,255,255,0.55);--fs-xs:11px;--fs-sm:12px;--fs-base:13px;--fs-md:14px;--fs-lg:16px;--radius-sm:14px;--radius-md:20px;--radius-lg:32px;--grad-liquid:linear-gradient(135deg,#ff9fb4,#d85c7a);--glow-px:0px;--glow-op:0;--btn-bg:rgba(15,118,110,0.10);--btn-danger-bg:rgba(255,93,114,0.16);--btn-danger-border:rgba(255,93,114,0.35);--btn-success-bg:rgba(31,169,122,0.14);--btn-success-border:rgba(31,169,122,0.35);--btn-accent-bg:rgba(15,118,110,0.16);--btn-purple-bg:rgba(14,116,144,0.14);--btn-gold-bg:rgba(224,144,10,0.16)}
.uvd-scope.uvd-theme-dark{--bg:rgba(10,18,24,0.92);--glass:rgba(20,34,42,0.6);--glass-hi:rgba(45,212,191,0.1);--border:rgba(94,234,212,0.2);--text:#e8fdf9;--text2:#9fd1c8;--text3:#7fb4ab;--accent:#2dd4bf;--accent-text:#5eead4;--accent2:#22d3ee;--danger:#ff6b81;--gold:#ffc46b;--success:#34d399;--card-bg:rgba(255,255,255,0.06);--btn-bg:rgba(45,212,191,0.12);--btn-danger-bg:rgba(255,107,129,0.16);--btn-danger-border:rgba(255,107,129,0.38);--btn-success-bg:rgba(52,211,153,0.14);--btn-success-border:rgba(52,211,153,0.38);--btn-accent-bg:rgba(45,212,191,0.18);--btn-purple-bg:rgba(34,211,238,0.16);--btn-gold-bg:rgba(255,196,107,0.16)}.uvd-scope.uvd-theme-dark .uvd-filter-btn{background:rgba(255,255,255,0.08)!important;color:var(--text2)!important}.uvd-scope.uvd-theme-dark .uvd-toggle-switch{background:rgba(255,255,255,0.14)}.uvd-scope.uvd-theme-dark .uvd-quality-menu-panel::before,.uvd-scope.uvd-theme-dark .uvd-thumb-menu .uvd-action-list::before{background:linear-gradient(135deg,rgba(22,36,44,0.98),rgba(22,36,44,0.98))!important;border-color:var(--border)!important}
.uvd-scope,.uvd-scope *{box-sizing:border-box}.uvd-scope button,.uvd-scope input,.uvd-scope select,.uvd-scope textarea{font-family:-apple-system,BlinkMacSystemFont,'SF Pro Display','Segoe UI',Roboto,sans-serif!important}.uvd-scope button{-webkit-appearance:none!important;appearance:none!important}.uvd-scope .uvd-filter-btn{background:rgba(255,255,255,.24)!important;border-color:var(--border)!important;color:var(--text2)!important}.uvd-scope .uvd-filter-btn.uvd-filter-active{background:var(--grad-liquid)!important;border-color:transparent!important;color:#fff!important}.uvd-scope .uvd-meta-chip{background:rgba(255,255,255,.28)!important;border-color:var(--border)!important;color:#d85c7a!important}
.uvd-fx-on .uvd-btn{transition:box-shadow .25s ease,transform .15s ease}
.uvd-fx-on .uvd-btn:active{transform:scale(.95)}
.uvd-fx-on.uvd-glass-panel,.uvd-fx-on #__uvd_player_header__{box-shadow:0 0 var(--glow-px) rgba(255,159,180,.22)),0 8px 30px rgba(0,0,0,0.5)}
.uvd-fx-on .uvd-card,.uvd-fx-on .uvd-settings-sheet:not(.uvd-player-sheet){box-shadow:0 0 var(--glow-px) rgba(255,159,180,.22)),0 12px 32px rgba(15,118,110,.12),0 0 0 1px rgba(255,255,255,.12) inset}
.uvd-fx-on #__uvd_player_close__{box-shadow:0 0 calc(var(--glow-px)*.6) rgba(255,93,114,var(--glow-op))}
.uvd-overlay{position:fixed;inset:0;background:rgba(2,3,6,.92);backdrop-filter:blur(10px) saturate(120%);z-index:2147483647;display:flex;align-items:center;justify-content:center;padding:16px;overflow-y:auto}
.uvd-toggle-switch{width:44px;height:26px;border-radius:14px;background:rgba(15,58,56,.14);border:none;position:relative;cursor:pointer;flex-shrink:0;transition:background .2s ease;padding:0}
.uvd-toggle-switch .uvd-toggle-knob{position:absolute;top:3px;left:3px;width:20px;height:20px;border-radius:50%;background:#fff;transition:transform .2s ease;box-shadow:0 1px 3px rgba(0,0,0,.4)}
.uvd-toggle-switch.uvd-toggle-on{background:linear-gradient(135deg,#ff9fb4,#f76c8c)!important}
.uvd-restore-btn{position:fixed;right:14px;bottom:14px;z-index:2147483647;display:flex;align-items:center;justify-content:center;width:46px;height:46px;padding:0;border-radius:50%;border:1px solid var(--border);background:var(--glass);backdrop-filter:blur(var(--uvd-blur)) saturate(130%);-webkit-backdrop-filter:blur(var(--uvd-blur)) saturate(130%);box-shadow:0 8px 24px rgba(0,0,0,.22),0 0 0 1px rgba(255,255,255,.5) inset;color:var(--accent-text);font-size:20px;font-weight:800;cursor:grab;animation:uvdScaleIn .25s ease both;touch-action:none}
.uvd-restore-btn span.uvd-restore-dot{width:13px;height:13px;border-radius:50%;background:var(--grad-liquid);box-shadow:0 0 12px rgba(255,159,180,.22);animation:uvdPulse 2s infinite}
.uvd-restore-btn:active{transform:scale(.95);cursor:grabbing}
.uvd-toggle-switch.uvd-toggle-on .uvd-toggle-knob{transform:translateX(18px)}
.uvd-scroll::-webkit-scrollbar{width:4px}
.uvd-scroll::-webkit-scrollbar-thumb{background:#ff9fb4;border-radius:4px}
.uvd-scroll::-webkit-scrollbar-track{background:transparent}
.uvd-btn{background:var(--glass-hi);border:1px solid var(--border);color:var(--text);padding:9px 16px;border-radius:var(--radius-md);font-weight:600;font-size:var(--fs-base);cursor:pointer;text-align:center;position:relative;overflow:hidden;display:inline-block;box-shadow:0 2px 8px rgba(15,58,56,0.14);line-height:1.3;transition:all var(--uvd-transition)}
.uvd-btn:active{transform:scale(.96)}
.uvd-btn-sm{padding:7px 12px;font-size:var(--fs-sm);border-radius:var(--radius-sm)}
.uvd-btn-icon{background:var(--glass-hi);border:1px solid var(--border);color:var(--text);width:34px;height:34px;border-radius:var(--radius-sm);cursor:pointer;display:inline-flex;align-items:center;justify-content:center;position:relative;overflow:hidden;box-shadow:0 3px 8px rgba(0,0,0,0.35),0 1px 0 rgba(255,255,255,0.08) inset;transition:all var(--uvd-transition)}
.uvd-btn-icon:active{transform:scale(.92)}
.uvd-card{position:relative;width:100%;max-width:100%;min-width:0;border-radius:var(--radius-md);padding:14px;margin:0 0 10px;font-size:var(--fs-base);animation:uvdCardEnter .28s cubic-bezier(.22,1,.36,1) both;will-change:transform}
.uvd-app-shell .uvd-scroll{min-width:0;max-width:100%;overflow-x:hidden}
.uvd-app-shell #__uvd_stream_list__{padding:10px!important;border-radius:28px!important;overflow-y:auto!important;overflow-x:hidden!important;scrollbar-width:none!important}

.uvd-card:hover{transform:translateY(-3px);border-color:rgba(255,159,180,.22);box-shadow:0 16px 34px rgba(15,118,110,.18),0 0 0 1px rgba(255,159,180,.22) inset,0 1px 0 rgba(255,255,255,.7) inset}
.uvd-card-preview{position:relative;width:100%;height:140px;margin:0 0 13px;overflow:visible;border-radius:16px;background:linear-gradient(135deg,rgba(255,159,180,.22),rgba(6,182,212,.2));isolation:isolate;transition:height .24s ease,aspect-ratio .24s ease}.uvd-card-preview.uvd-thumb-portrait{height:220px}.uvd-card-preview.uvd-thumb-landscape{height:140px}.uvd-card-preview>.uvd-thumb-image,.uvd-card-preview>.uvd-thumb-sheen{border-radius:inherit}
.uvd-thumb-image,.uvd-thumb-video{position:absolute;inset:0;width:100%;height:100%;display:block;object-fit:cover}.uvd-thumb-video{border-radius:inherit}
.uvd-thumb-image{background:linear-gradient(120deg,rgba(255,159,180,.22),rgba(6,182,212,.2));transition:filter .25s ease}
.uvd-thumb-video{opacity:0;transition:opacity .25s ease}
.uvd-thumb-ready .uvd-thumb-video{opacity:1}
.uvd-thumb-fallback{filter:saturate(1.15) brightness(1.03)}
.uvd-thumb-sheen{position:absolute;inset:0;z-index:1;background:linear-gradient(180deg,rgba(20,8,30,.04),rgba(20,8,30,.42));pointer-events:none}
.uvd-thumb-type{position:absolute;z-index:2;top:10px;left:11px;padding:5px 9px;border:1px solid rgba(255,255,255,.34);border-radius:999px;background:rgba(15,58,56,.3);backdrop-filter:blur(8px);color:#fff;font-size:10px;font-weight:800;letter-spacing:.06em}
.uvd-thumb-play{position:absolute;z-index:3;left:50%;top:50%;width:48px;height:48px;padding:0;display:flex;align-items:center;justify-content:center;line-height:1;box-sizing:border-box;transform:translate(-50%,-50%);border:1px solid rgba(255,255,255,.55);border-radius:50%;background:rgba(255,255,255,.88);color:var(--accent-text);font-size:20px;cursor:pointer;box-shadow:0 8px 20px rgba(15,58,56,.22);transition:transform .18s ease,background .18s ease}
.uvd-thumb-play:hover{transform:translate(-50%,-50%) scale(1.08);background:#fff}
.uvd-thumb-strip{display:flex;align-items:center;gap:7px;padding:0 0 10px;overflow-x:auto;scrollbar-width:none}
.uvd-thumb-strip::-webkit-scrollbar{display:none}
.uvd-thumb-strip-label{flex:0 0 auto;color:var(--text3);font-size:9px;font-weight:800;letter-spacing:.08em;writing-mode:vertical-rl;transform:rotate(180deg)}
.uvd-extra-thumb{position:relative;flex:0 0 76px;height:48px;overflow:hidden;padding:0;border:1px solid rgba(255,159,180,.3);border-radius:10px;background:rgba(255,159,180,.1);cursor:pointer}
.uvd-extra-thumb img{display:block;width:100%;height:100%;object-fit:cover}
.uvd-extra-thumb::after{content:'';position:absolute;inset:0;background:linear-gradient(180deg,transparent,rgba(15,58,56,.5))}
.uvd-extra-thumb span{position:absolute;z-index:1;right:5px;bottom:3px;color:#fff;font-size:9px;font-weight:700}
@keyframes uvdThumbLaunch{0%{transform:scale(1);filter:brightness(1)}45%{transform:scale(1.012);filter:brightness(1.08)}100%{transform:scale(1);filter:brightness(1)}}
.uvd-card.uvd-thumb-launch{animation:uvdThumbLaunch .28s ease both;z-index:3}
.uvd-card.uvd-thumb-launch .uvd-card-preview{transform:scale(1.012);border-radius:var(--radius-md) var(--radius-md) 14px 14px;box-shadow:0 0 0 2px rgba(255,159,180,.22),0 8px 20px rgba(6,182,212,.16);transition:transform .26s cubic-bezier(.22,1,.36,1),box-shadow .26s ease}
.uvd-card.uvd-thumb-launch .uvd-thumb-play{transform:translate(-50%,-50%) scale(1.18);background:#fff}
.uvd-card-head{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:10px}
.uvd-block-btn{width:30px;height:30px;padding:0;border:1px solid rgba(255,93,114,.22);border-radius:10px;background:rgba(255,93,114,.08);color:var(--danger);opacity:.8;cursor:pointer}
.uvd-block-btn:hover{opacity:1;background:rgba(255,93,114,.16)}
.uvd-card-url-label{margin:0 0 5px 2px;color:var(--text3);font-size:9px;font-weight:800;letter-spacing:.1em}
.uvd-card-actions{margin-top:10px}
.uvd-card-actions .uvd-btn{min-height:36px}
.uvd-action-menu{position:relative}
.uvd-thumb-menu{position:absolute;top:10px;right:10px;z-index:5}
.uvd-card:has(.uvd-thumb-menu[open]){z-index:30}
.uvd-card-preview:has(.uvd-thumb-menu[open]){z-index:30}
.uvd-thumb-menu[open]{z-index:9}
.uvd-thumb-menu summary{width:34px;height:34px;min-height:34px;padding:0;justify-content:center;border-radius:12px;background:rgba(15,58,56,.58);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);border-color:rgba(255,255,255,.42);color:#fff;font-size:22px;line-height:1;font-weight:800}
.uvd-thumb-menu summary:hover{background:rgba(15,58,56,.78)}
.uvd-thumb-menu .uvd-action-list{position:absolute;top:38px;right:0;width:190px;z-index:8;grid-template-columns:repeat(2,minmax(0,1fr));gap:5px;padding:6px;background:rgba(248,253,252,.97);border-radius:12px;box-shadow:0 12px 28px rgba(15,58,56,.24)}
.uvd-thumb-menu .uvd-action-list .uvd-btn{min-height:30px;padding:6px 8px;border-radius:10px;font-size:11px;line-height:1.15}
/* Thumbnail action menu: đồng bộ với popover của header player */
.uvd-thumb-menu summary{width:38px;height:38px;min-height:38px;border-radius:14px;background:rgba(248,253,252,.88);backdrop-filter:blur(12px) saturate(135%);-webkit-backdrop-filter:blur(12px) saturate(135%);border:1px solid rgba(255,159,180,.22);color:#06b6d4;font-size:25px;letter-spacing:-3px;line-height:32px;box-shadow:0 5px 14px rgba(15,118,110,.18),inset 0 1px 0 rgba(255,255,255,.9);transition:transform .16s ease,background .16s ease,box-shadow .16s ease}
.uvd-thumb-menu summary:hover{background:rgba(236,252,249,.98);box-shadow:0 8px 18px rgba(8,145,178,.2),inset 0 1px 0 rgba(255,255,255,.95);transform:translateY(-1px)}
.uvd-thumb-menu summary:active{transform:scale(.9);background:rgba(255,159,180,.22)}
.uvd-thumb-menu[open] summary{background:linear-gradient(145deg,rgba(255,159,180,.22),rgba(6,182,212,.14));border-color:rgba(6,182,212,.5);box-shadow:0 5px 14px rgba(8,145,178,.16)}
.uvd-thumb-menu .uvd-action-list{top:48px;right:-2px;width:205px;display:grid;grid-template-columns:1fr;gap:0;padding:6px;background:#0f3a36;border:1px solid rgba(94,234,212,.55);border-radius:18px;box-shadow:0 14px 32px rgba(15,58,56,.4);animation:uvdFadeIn .15s ease}
.uvd-thumb-menu .uvd-action-list::before{content:'';position:absolute;right:28px;top:-8px;width:15px;height:15px;background:#0f3a36;border-left:1px solid rgba(94,234,212,.55);border-top:1px solid rgba(94,234,212,.55);transform:rotate(45deg)}
.uvd-thumb-menu .uvd-action-list .uvd-btn{position:relative;z-index:1;min-height:36px;padding:9px 11px;border:0;border-radius:0;background:transparent!important;color:#fff!important;font-size:12px;line-height:1.15;text-align:left;box-shadow:none!important}
.uvd-thumb-menu .uvd-action-list .uvd-btn+.uvd-btn{border-top:1px solid rgba(94,234,212,.2)}
.uvd-thumb-menu .uvd-action-list .uvd-btn:hover{background:rgba(255,159,180,.22)!important;color:#fff!important}
/* Light pink-purple popovers: đồng bộ với toàn bộ UMP UI */
.uvd-player-menu,.uvd-quality-menu-panel{background:linear-gradient(145deg,rgba(248,253,252,.98),rgba(230,247,243,.98))!important;border-color:rgba(45,212,191,.38)!important;box-shadow:0 16px 34px rgba(130,57,145,.22),inset 0 1px 0 rgba(255,255,255,.9)!important;color:#134e4a!important}
.uvd-player-menu button,.uvd-quality-menu-panel button{color:#115e59!important;background:transparent!important}
.uvd-player-menu button:hover,.uvd-quality-menu-panel button:hover{background:rgba(255,159,180,.22)!important;color:#0d9488!important}
.uvd-player-menu button:active,.uvd-quality-menu-panel button:active{background:rgba(191,61,224,.2)!important}
.uvd-player-menu button+button{border-top-color:rgba(45,212,191,.2)!important}
.uvd-quality-menu-title{color:#0d9488!important;border-bottom-color:rgba(45,212,191,.22)!important}.uvd-quality-menu-panel .uvd-quality-option-active{color:#0891b2!important;background:rgba(255,159,180,.22)!important}.uvd-quality-menu-panel .uvd-quality-menu-back{color:#0e7490!important}
.uvd-header-popover::before,.uvd-quality-menu-panel::before{background:linear-gradient(135deg,#f0fdfa,#e6fbf7)!important;border-color:rgba(45,212,191,.38)!important}
.uvd-header-popover::after{background:rgba(45,212,191,.14)!important}
.uvd-thumb-menu .uvd-action-list{background:linear-gradient(145deg,rgba(248,253,252,.99),rgba(230,247,243,.99))!important;border-color:rgba(45,212,191,.38)!important;box-shadow:0 16px 34px rgba(130,57,145,.22),inset 0 1px 0 rgba(255,255,255,.9)!important}
.uvd-thumb-menu .uvd-action-list::before{background:linear-gradient(135deg,#f0fdfa,#e6fbf7)!important;border-color:rgba(45,212,191,.38)!important}
.uvd-thumb-menu .uvd-action-list .uvd-btn{color:#115e59!important}.uvd-thumb-menu .uvd-action-list .uvd-btn+.uvd-btn{border-top-color:rgba(45,212,191,.2)!important}.uvd-thumb-menu .uvd-action-list .uvd-btn:hover{background:rgba(255,159,180,.22)!important;color:#0d9488!important}
/* Keep the thumbnail trigger intact when details is open; the generic
   action-menu summary rule must not stretch or flatten this button. */
.uvd-thumb-menu>summary,.uvd-thumb-menu[open]>summary{display:flex!important;align-items:center!important;justify-content:center!important;width:38px!important;height:38px!important;min-height:38px!important;padding:0!important;border-radius:14px!important;box-sizing:border-box!important;line-height:38px!important;white-space:nowrap!important}.uvd-thumb-menu>summary::-webkit-details-marker{display:none!important}.uvd-thumb-menu>summary::marker{display:none}.uvd-thumb-menu>summary{overflow:hidden!important}.uvd-thumb-menu[open]>summary{background:linear-gradient(145deg,rgba(255,159,180,.22),rgba(6,182,212,.14))!important;border-color:rgba(6,182,212,.5)!important}
/* Shared micro-interactions: nút, popover và menu item */
.uvd-btn,.uvd-icon-btn,.uvd-back-btn,.uvd-thumb-menu>summary,.uvd-player-menu button,.uvd-quality-menu-panel button,.uvd-action-list .uvd-btn{transition:transform .16s cubic-bezier(.22,1,.36,1),background-color .16s ease,background .16s ease,border-color .16s ease,box-shadow .16s ease,color .16s ease,opacity .16s ease!important;-webkit-tap-highlight-color:transparent}
.uvd-btn:active,.uvd-icon-btn:active,.uvd-back-btn:active,.uvd-player-menu button:active,.uvd-quality-menu-panel button:active,.uvd-action-list .uvd-btn:active{transform:scale(.96)!important}
@keyframes uvdPopoverIn{from{opacity:0;transform:translate3d(0,-7px,0) scale(.96)}to{opacity:1;transform:translate3d(0,0,0) scale(1)}}
@keyframes uvdMenuItemIn{from{opacity:0;transform:translateX(5px)}to{opacity:1;transform:translateX(0)}}
.uvd-header-popover,.uvd-quality-menu-panel{transform-origin:top right;animation:uvdPopoverIn .2s cubic-bezier(.22,1,.36,1) both}
.uvd-header-popover button,.uvd-quality-menu-panel button{animation:uvdMenuItemIn .18s ease both}
.uvd-header-popover button:nth-child(2),.uvd-quality-menu-panel button:nth-child(2){animation-delay:.025s}.uvd-header-popover button:nth-child(3),.uvd-quality-menu-panel button:nth-child(3){animation-delay:.05s}.uvd-header-popover button:nth-child(4),.uvd-quality-menu-panel button:nth-child(4){animation-delay:.075s}
.uvd-thumb-menu .uvd-action-list{transform-origin:top right;animation:uvdPopoverIn .2s cubic-bezier(.22,1,.36,1) both}.uvd-thumb-menu .uvd-action-list .uvd-btn{animation:uvdMenuItemIn .18s ease both}.uvd-thumb-menu .uvd-action-list .uvd-btn:nth-child(2){animation-delay:.025s}.uvd-thumb-menu .uvd-action-list .uvd-btn:nth-child(3){animation-delay:.05s}.uvd-thumb-menu .uvd-action-list .uvd-btn:nth-child(4){animation-delay:.075s}
@media (prefers-reduced-motion:reduce){.uvd-btn,.uvd-icon-btn,.uvd-back-btn,.uvd-thumb-menu>summary,.uvd-player-menu button,.uvd-quality-menu-panel button,.uvd-action-list .uvd-btn{transition:none!important;animation:none!important}}
.uvd-action-menu summary{list-style:none;display:flex;align-items:center;justify-content:space-between;min-height:38px;padding:9px 12px;border:1px solid var(--border);border-radius:var(--radius-sm);background:rgba(255,159,180,.22);color:#d85c7a;font-size:12px;font-weight:700;cursor:pointer;user-select:none}
.uvd-action-menu summary::-webkit-details-marker{display:none}
.uvd-action-menu[open] summary{border-radius:var(--radius-sm) var(--radius-sm) 0 0;background:rgba(255,159,180,.22)}
.uvd-action-menu summary span{font-size:16px;transition:transform .18s ease}
.uvd-action-menu[open] summary span{transform:rotate(180deg)}
.uvd-action-list{display:grid;grid-template-columns:1fr 1fr;gap:7px;padding:9px;border:1px solid var(--border);border-top:0;border-radius:0 0 var(--radius-sm) var(--radius-sm);background:rgba(248,253,252,.66);backdrop-filter:blur(12px)}
.uvd-action-list .uvd-btn{width:100%;min-width:0}
@media (max-width:560px){.uvd-app-shell{top:8px!important;left:8px!important;right:8px!important;height:calc(100dvh - 16px)!important;padding:14px 12px 10px!important;border-radius:26px!important}.uvd-app-shell #__uvd_header__{display:flex;align-items:center;gap:10px;overflow:visible}.uvd-brand-sub{display:none}.uvd-brand{gap:9px}.uvd-brand-mark{background:transparent!important;box-shadow:none!important;border:none!important;width:76px!important;height:76px!important;flex:0 0 76px!important;border-radius:0!important;filter:drop-shadow(0 8px 18px rgba(247,108,140,.32));animation:uvdMascotHop 2s ease-in-out infinite}.uvd-brand-name{font-size:19px}.uvd-brand-version{font-size:15px}.uvd-header-actions{width:100px;min-width:100px;max-width:100px;flex-basis:100px;grid-template-columns:repeat(3,30px);grid-auto-rows:30px;gap:4px;padding:2px 0}.uvd-header-actions .uvd-btn-icon{width:30px;height:30px;flex-basis:30px;font-size:13px;border-radius:10px}.uvd-context-bar{display:block;padding:12px;margin-bottom:10px}.uvd-context-meta{justify-content:flex-start;margin-top:9px}.uvd-meta-chip{max-width:48%}.uvd-tab{padding:8px 11px}.uvd-card{padding:12px}.uvd-grid-2{gap:6px}.uvd-card-actions .uvd-btn{padding:7px 8px;font-size:11px}.uvd-card-preview.uvd-thumb-portrait{height:190px}}
@media (prefers-reduced-motion:reduce){.uvd-card:hover{transform:none}}
.uvd-card-badges{display:flex;align-items:center;gap:6px;min-width:0}.uvd-type-badge{display:inline-block;padding:4px 12px;border-radius:var(--radius-sm);font-size:var(--fs-xs);font-weight:700;background:linear-gradient(135deg,rgba(255,159,180,.22),rgba(6,182,212,0.18));color:var(--accent-text);border:1px solid rgba(255,159,180,.22);letter-spacing:.03em}.uvd-card-status{display:inline-flex;align-items:center;padding:4px 8px;border-radius:999px;font-size:9px;font-weight:800;letter-spacing:.04em;white-space:nowrap}.uvd-status-loading{color:var(--gold);background:rgba(224,144,10,.12);border:1px solid rgba(224,144,10,.25)}.uvd-status-error{color:var(--danger);background:rgba(255,93,114,.14);border:1px solid rgba(255,93,114,.3)}.uvd-status-ok{color:var(--success);background:rgba(31,169,122,.12);border:1px solid rgba(31,169,122,.25)}.uvd-status-muted{color:var(--text3);background:rgba(15,58,56,.06);border:1px solid var(--border)}
.uvd-card-stream-meta{display:flex;align-items:center;min-height:26px;margin:-3px 0 8px;padding:6px 9px;border:1px solid var(--border);border-radius:10px;background:rgba(6,182,212,.06);color:var(--text3);font-size:10px;font-weight:700;line-height:1.35;white-space:normal}.uvd-card-stream-meta.uvd-card-meta-ready{color:#d85c7a;background:rgba(6,182,212,.1)}
.uvd-url-box{background:var(--btn-bg);border-radius:var(--radius-sm);padding:12px;font-family:'SFMono-Regular',Consolas,monospace;font-size:var(--fs-sm);font-weight:600;word-break:break-all;color:#d85c7a;max-height:100px;overflow-y:auto;line-height:1.5;border:1px solid var(--border)}
.uvd-grid-2{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.uvd-grid-3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px}
.uvd-ripple{position:absolute;border-radius:50%;background:rgba(255,255,255,0.5);transform:scale(0);animation:uvdRipple .6s ease-out}
.uvd-profile-card{display:flex;align-items:center;gap:14px;background:linear-gradient(135deg,rgba(255,159,180,.22),rgba(6,182,212,0.08));border:1px solid rgba(255,159,180,.22);border-radius:var(--radius-lg);padding:16px;margin-bottom:10px;animation:uvdCardEnter .4s ease both}
.uvd-profile-avatar{flex-shrink:0;width:56px;height:56px;border-radius:50%;background:var(--grad-liquid);color:#fff;font-weight:700;font-size:18px;display:flex;align-items:center;justify-content:center;box-shadow:0 6px 18px rgba(255,159,180,.22),0 0 0 3px rgba(255,255,255,0.08)}
.uvd-profile-info{min-width:0}
.uvd-profile-name{font-weight:700;font-size:15px;color:var(--text)}
.uvd-profile-role{font-size:11.5px;color:var(--text2);margin-top:2px}
.uvd-profile-tags{display:flex;flex-wrap:wrap;gap:5px;margin-top:8px}
.uvd-tag{font-size:10px;font-weight:600;padding:3px 9px;border-radius:999px;background:rgba(6,182,212,.09);border:1px solid var(--border);color:var(--text2)}
.uvd-profile-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:14px}
.uvd-stat{background:var(--card-bg);border:1px solid var(--border);border-radius:var(--radius-md);padding:10px 6px;text-align:center}
.uvd-stat-num{font-size:18px;font-weight:700;color:var(--accent-text)}
.uvd-stat-label{font-size:10px;color:var(--text3);margin-top:2px}
.uvd-section-title{display:flex;align-items:center;gap:8px;font-weight:700;font-size:13px;color:var(--text);margin:16px 0 8px}
.uvd-section-num{width:20px;height:20px;border-radius:50%;background:var(--grad-liquid);color:#fff;font-size:11px;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;box-shadow:0 2px 8px rgba(255,159,180,.22)}
.uvd-timeline-card{border-left:2px solid rgba(255,159,180,.22)}
.uvd-inline-code{display:inline-block;background:rgba(0,0,0,0.35);padding:3px 9px;border-radius:6px;color:#d85c7a;font-family:'SFMono-Regular',Consolas,monospace;font-size:11px;border:1px solid rgba(255,255,255,0.06);margin:2px 0}
.uvd-profile-footer{text-align:center;font-size:11px;color:var(--text3);margin-top:10px;padding:14px 12px 10px;border-top:1px dashed rgba(255,159,180,.24);background:linear-gradient(150deg,rgba(255,246,251,.6),rgba(245,232,255,.5));border-radius:0 0 20px 20px}
.uvd-player-cute-panel{padding:14px 16px 12px!important;background:linear-gradient(150deg,#fffdfd 0%,#fff6fb 60%,#f5edff 100%)!important;border-top:2px solid rgba(255,159,180,.22)!important;border-radius:0 0 26px 26px!important;display:flex;flex-direction:column;gap:8px}
.uvd-player-info-title{display:flex;align-items:center;gap:12px;font-weight:800;font-size:14px;color:#7a4fb0;white-space:normal;overflow:visible;text-overflow:clip;line-height:1.3}
.uvd-player-mascot-holding{flex:0 0 64px;width:64px;height:48px;display:flex;align-items:center;justify-content:center;background:transparent!important;border:none!important;filter:drop-shadow(0 4px 10px rgba(247,108,140,.18));animation:uvdMascotHop 1.9s ease-in-out infinite}
.uvd-player-mascot-holding svg{width:100%;height:100%}
.uvd-player-title-text{display:flex;flex-direction:column;gap:2px;min-width:0;flex:1}
.uvd-player-title-main{font-size:14px;font-weight:800;color:#6b4d85;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:block}
.uvd-player-title-sub{font-size:11px;font-weight:600;color:#b68bea;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.uvd-player-info-meta{display:flex;align-items:center;gap:6px;padding:8px 12px;border-radius:999px;background:linear-gradient(135deg,rgba(243,236,255,.8),rgba(255,227,236,.7))!important;border:1px solid rgba(194,150,255,.24)!important;color:#8a6ab0!important;font-size:11px!important;max-width:100%}
.uvd-meta-type{font-weight:800;color:#9a6ce0;background:rgba(255,255,255,.6);padding:2px 8px;border-radius:999px;border:1px solid rgba(194,150,255,.22)}
.uvd-meta-dot{opacity:.5}
.uvd-meta-bow{margin-left:auto;font-size:12px}
.uvd-player-footer-cute{display:flex;align-items:center;justify-content:center;gap:6px;padding:8px 12px;font-size:10px;color:#b68bea;background:rgba(255,255,255,.5);border-top:1px dashed rgba(255,159,180,.18)}
.uvd-step{display:flex;gap:10px;align-items:flex-start;margin-bottom:12px}
.uvd-step:last-child{margin-bottom:0}
.uvd-step-num{flex-shrink:0;width:24px;height:24px;border-radius:50%;background:var(--grad-liquid);color:#fff;font-size:12px;font-weight:700;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(255,159,180,.22)}
.uvd-step-text{font-size:13px;color:var(--text2);line-height:1.65;padding-top:2px}
.uvd-step-text strong{color:var(--text)}
.uvd-callout{display:flex;gap:10px;align-items:flex-start;background:rgba(255,159,180,.22);border:1px solid rgba(255,159,180,.22);border-left:3px solid #ff9fb4;border-radius:10px;padding:10px 12px;margin-top:10px;font-size:12px;color:var(--text2);line-height:1.6}
.uvd-callout-icon{flex-shrink:0;font-size:15px}
.uvd-callout.uvd-callout-warn{background:rgba(255,184,77,0.1);border-color:rgba(255,184,77,0.3);border-left-color:var(--gold)}
.uvd-code-block{position:relative;background:var(--btn-bg);border:1px solid var(--border);border-radius:10px;margin:8px 0}
.uvd-code-block textarea{width:100%;background:transparent;border:none;color:#d85c7a;font-weight:600;padding:10px 40px 10px 12px;font-size:10px;font-family:'SFMono-Regular',Consolas,monospace;resize:none}
.uvd-code-copy{position:absolute;top:6px;right:6px;width:26px;height:26px;border-radius:8px;background:rgba(6,182,212,.09);border:1px solid var(--border);color:var(--text2);font-size:12px;cursor:pointer;display:flex;align-items:center;justify-content:center}
.uvd-code-copy:active{background:rgba(6,182,212,.22)}

/* ========== NORMAL UI POLISH ========== */
.uvd-app-shell .uvd-card{background:rgba(255,255,255,.76)!important;border-color:rgba(255,159,180,.22);box-shadow:0 7px 20px rgba(15,118,110,.08),0 0 0 1px rgba(255,255,255,.45) inset}
.uvd-app-shell .uvd-card:hover{transform:translateY(-2px);box-shadow:0 11px 24px rgba(15,118,110,.13),0 0 0 1px rgba(255,159,180,.22) inset}
.uvd-app-shell .uvd-filter-btn{background:rgba(255,255,255,.82)!important;color:#5d7f7a!important}
.uvd-app-shell .uvd-filter-btn.uvd-filter-active{color:#fff!important}
.uvd-card-preview{height:150px;border-radius:20px}.uvd-card-preview.uvd-thumb-portrait{height:235px}
.uvd-card-stream-meta{background:rgba(240,248,246,.9);border-color:rgba(6,182,212,.14);font-size:10px}
.uvd-url-box{max-height:64px;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden}
.uvd-context-bar{padding:12px 14px;margin-bottom:10px;background:rgba(242,250,249,.82)}
.uvd-section-title{margin-top:12px}
.uvd-settings-body>.uvd-card{content-visibility:auto;contain:layout paint style;contain-intrinsic-size:0 180px}
.uvd-empty-state{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;min-height:180px;padding:28px 18px;text-align:center;color:var(--text2)}
.uvd-empty-state strong{color:var(--text);font-size:15px}.uvd-empty-state span{font-size:12px;line-height:1.5}.uvd-history-list{display:flex;flex-direction:column;gap:10px}.uvd-history-card.uvd-cute{display:flex;gap:12px;min-width:0;padding:10px;border:1px solid rgba(255,159,180,.3)!important;border-radius:20px!important;background:linear-gradient(160deg,rgba(255,255,255,.94),rgba(255,240,247,.88))!important;box-shadow:0 8px 20px rgba(247,108,140,.12),0 0 0 1px rgba(255,255,255,.6) inset!important}.uvd-history-card.uvd-cute:hover{border-color:rgba(247,108,140,.5)!important}.uvd-history-card.uvd-cute .uvd-history-thumb{position:relative;display:flex;align-items:center;justify-content:center;flex:0 0 104px;height:72px;overflow:hidden;border-radius:15px;background:linear-gradient(135deg,#ffe0ea,#ffd6e4)!important;color:#e84a72;font-size:24px}.uvd-history-card.uvd-cute .uvd-history-thumb img{display:block;width:100%;height:100%;object-fit:cover}.uvd-history-card.uvd-cute .uvd-history-thumb small{position:absolute;left:7px;bottom:5px;padding:2px 7px;border-radius:999px;background:rgba(255,255,255,.75);color:#d85c7a;font-size:9px;font-weight:800;letter-spacing:.06em}.uvd-history-card.uvd-cute .uvd-history-body{min-width:0;flex:1}.uvd-history-card.uvd-cute .uvd-history-body strong{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#7a4fb0;font-size:13px}.uvd-history-card.uvd-cute .uvd-history-meta{margin-top:4px;color:#a0729a;font-size:10px}.uvd-history-card.uvd-cute .uvd-history-url{margin-top:5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#c95073;font:10px monospace}.uvd-history-card.uvd-cute .uvd-history-actions{display:flex;flex-wrap:wrap;gap:6px;margin-top:7px}.uvd-history-card.uvd-cute .uvd-history-actions .uvd-btn{padding:5px 9px;font-size:10px;background:rgba(255,214,228,.4)!important;border:1px solid rgba(255,159,180,.3)!important;color:#c95073!important;border-radius:12px!important}
.uvd-clkbtn-card{border-radius:22px!important;padding:16px!important}.uvd-clkbtn-card>div[style*="border-bottom"]{border-color:rgba(255,159,180,.28)!important}
.uvd-card-head{margin-bottom:7px}.uvd-card-badges{flex-wrap:wrap}.uvd-url-box{cursor:pointer;transition:border-color .16s ease,background .16s ease}.uvd-url-box:hover{border-color:rgba(247,108,140,.45);background:rgba(255,159,180,.14)}
.uvd-settings-details{margin:10px 0;border:1px solid rgba(255,159,180,.22);border-radius:18px;background:rgba(255,255,255,.48);overflow:hidden;transition:background .2s ease,border-color .2s ease}.uvd-settings-details>summary{display:flex;align-items:center;gap:8px;padding:11px 12px;list-style:none;cursor:pointer;color:var(--text);font-size:13px;font-weight:800}.uvd-settings-details>summary::-webkit-details-marker{display:none}.uvd-settings-details>summary .uvd-section-num{width:22px;height:22px}.uvd-details-chevron{margin-left:auto;font-size:18px;color:#d85c7a;transition:transform .18s ease}.uvd-settings-details[open] .uvd-details-chevron{transform:rotate(180deg)}.uvd-settings-details-body{padding:0 8px 8px}.uvd-settings-details-body>.uvd-card{margin-bottom:0}

/* ===== Thêm hiệu ứng chuyển động cho các khu vực còn tĩnh ===== */
@keyframes uvdBadgePop{0%{opacity:0;transform:scale(.7)}70%{transform:scale(1.06)}100%{opacity:1;transform:scale(1)}}
@keyframes uvdChipIn{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:translateY(0)}}
.uvd-filter-btn{transition:transform .16s cubic-bezier(.22,1,.36,1),background .18s ease,color .18s ease,box-shadow .18s ease,border-color .18s ease}
.uvd-filter-btn:hover{transform:translateY(-2px);box-shadow:0 6px 14px rgba(15,118,110,.14)}
.uvd-filter-btn:active{transform:scale(.94)}
.uvd-filter-btn.uvd-filter-active{animation:uvdBadgePop .22s cubic-bezier(.22,1,.36,1) both}
.uvd-filter-select{transition:border-color .18s ease,box-shadow .18s ease,background .18s ease}
.uvd-filter-select:hover{border-color:rgba(255,159,180,.22)}
.uvd-filter-select:focus{border-color:var(--accent-text);box-shadow:0 0 0 3px rgba(255,159,180,.22)}
.uvd-meta-chip{transition:transform .16s cubic-bezier(.22,1,.36,1),background .18s ease,color .18s ease,box-shadow .18s ease}
.uvd-meta-chip:hover{transform:translateY(-2px);box-shadow:0 6px 14px rgba(194,150,255,.22)}
.uvd-meta-chip:active{transform:scale(.95)}
.uvd-context-title{position:relative;transition:color .18s ease}
.uvd-context-title::after{content:'';position:absolute;left:0;right:100%;bottom:-2px;height:1px;background:linear-gradient(90deg,#ff9fb4,#b385f2);transition:right .22s cubic-bezier(.22,1,.36,1)}
.uvd-context-title:hover{color:#9a6ce0}
.uvd-context-title:hover::after{right:0}
.uvd-block-btn{transition:transform .16s cubic-bezier(.22,1,.36,1),background .18s ease,opacity .18s ease,box-shadow .18s ease}
.uvd-block-btn:hover{transform:translateY(-2px) rotate(-4deg);box-shadow:0 6px 14px rgba(255,93,114,.22)}
.uvd-block-btn:active{transform:scale(.9)}
.uvd-extra-thumb{transition:transform .18s cubic-bezier(.22,1,.36,1),box-shadow .18s ease}
.uvd-extra-thumb img{transition:transform .3s cubic-bezier(.22,1,.36,1)}
.uvd-extra-thumb:hover{transform:translateY(-2px);box-shadow:0 8px 18px rgba(247,108,140,.26)}
.uvd-extra-thumb:hover img{transform:scale(1.08)}
.uvd-type-badge,.uvd-card-status{transition:transform .16s ease,box-shadow .16s ease}
.uvd-status-loading{animation:uvdBadgePop .24s cubic-bezier(.22,1,.36,1) both}
.uvd-card-stream-meta{transition:color .2s ease,background .2s ease,border-color .2s ease}
.uvd-toggle-switch{transition:background .2s ease,box-shadow .2s ease}
.uvd-toggle-switch:hover{box-shadow:0 0 0 5px rgba(247,108,140,.14)}
.uvd-toggle-switch .uvd-toggle-knob{transition:transform .24s cubic-bezier(.34,1.56,.64,1)}
.uvd-tag{transition:transform .16s cubic-bezier(.22,1,.36,1),background .18s ease,color .18s ease}
.uvd-tag:hover{transform:translateY(-2px);background:rgba(255,159,180,.22);color:#d85c7a}
.uvd-stat{transition:transform .18s cubic-bezier(.22,1,.36,1),box-shadow .18s ease}
.uvd-stat:hover{transform:translateY(-3px);box-shadow:0 10px 22px rgba(15,118,110,.16)}
.uvd-history-card{transition:transform .18s cubic-bezier(.22,1,.36,1),box-shadow .18s ease;animation:uvdCardEnter .26s cubic-bezier(.22,1,.36,1) both}
.uvd-history-card:hover{transform:translateY(-3px) scale(1.01);box-shadow:0 12px 26px rgba(247,108,140,.2)}
.uvd-history-thumb img{transition:transform .3s ease}
.uvd-history-card:hover .uvd-history-thumb img{transform:scale(1.06)}
.uvd-empty-state{animation:uvdFadeIn .3s ease both}
.uvd-empty-state strong{animation:uvdChipIn .3s ease both}
.uvd-history-card:nth-child(2){animation-delay:.03s}.uvd-history-card:nth-child(3){animation-delay:.06s}.uvd-history-card:nth-child(4){animation-delay:.09s}.uvd-history-card:nth-child(5){animation-delay:.12s}
.uvd-extra-thumb{animation:uvdChipIn .22s ease both}
.uvd-extra-thumb:nth-child(2){animation-delay:.02s}.uvd-extra-thumb:nth-child(3){animation-delay:.04s}.uvd-extra-thumb:nth-child(4){animation-delay:.06s}.uvd-extra-thumb:nth-child(5){animation-delay:.08s}
.uvd-settings-body>.uvd-card:nth-child(1){animation-delay:0s}.uvd-settings-body>.uvd-card:nth-child(2){animation-delay:.02s}.uvd-settings-body>.uvd-card:nth-child(3){animation-delay:.04s}.uvd-settings-body>.uvd-card:nth-child(4){animation-delay:.06s}.uvd-settings-body>.uvd-card:nth-child(5){animation-delay:.08s}
@media (prefers-reduced-motion:reduce){.uvd-filter-btn,.uvd-meta-chip,.uvd-block-btn,.uvd-extra-thumb,.uvd-extra-thumb img,.uvd-tag,.uvd-stat,.uvd-history-card,.uvd-history-thumb img,.uvd-context-title::after,.uvd-toggle-switch{transition:none!important}.uvd-type-badge,.uvd-card-status,.uvd-thumb-type,.uvd-meta-chip,.uvd-history-card,.uvd-empty-state,.uvd-empty-state strong,.uvd-extra-thumb{animation:none!important}}
/* Card video + scrollbar cute (sửa gốc layout đã xong ở trên) */
.uvd-card.uvd-cute{background:linear-gradient(155deg,#ffffff 0%,#fff0f6 46%,#f7edff 100%)!important;border:1px solid rgba(255,159,180,.35)!important;border-radius:26px!important;padding:14px!important;box-shadow:0 12px 28px rgba(247,108,140,.16),0 2px 0 rgba(255,255,255,.85) inset,0 0 0 1px rgba(255,255,255,.7) inset!important;transition:transform .18s cubic-bezier(.22,1,.36,1),box-shadow .18s ease,border-color .18s ease!important}
.uvd-card.uvd-cute:hover{transform:translateY(-2px);border-color:rgba(255,159,180,.55)!important;box-shadow:0 18px 38px rgba(247,108,140,.24),0 2px 0 rgba(255,255,255,.85) inset,0 0 0 1px rgba(255,255,255,.75) inset!important}
.uvd-cute .uvd-card-preview{border-radius:18px!important;overflow:hidden!important;background:linear-gradient(135deg,#ffe3ee,#ecd9ff)!important;border:1px solid rgba(255,159,180,.3)!important;box-shadow:0 6px 14px rgba(194,150,255,.18) inset!important}
.uvd-cute .uvd-thumb-play{width:36px;height:36px;padding:0!important;display:flex!important;align-items:center!important;justify-content:center!important;line-height:1!important;box-sizing:border-box!important;border-radius:50%;background:rgba(255,255,255,.72)!important;border:1px solid rgba(255,159,180,.42)!important;color:#d85c7a!important;font-size:14px;backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);box-shadow:0 4px 12px rgba(247,108,140,.22)!important}
/* Ẩn nút ⋮ (3 chấm) trên thumbnail cùng các tính năng bên trong (tạm thời) */
.uvd-thumb-menu{display:none!important}
.uvd-cute .uvd-thumb-type{background:rgba(255,255,255,.7)!important;border:1px solid rgba(255,159,180,.35)!important;color:#d85c7a!important;border-radius:999px!important}
.uvd-cute .uvd-url-box{background:rgba(255,214,228,.28)!important;border:1px solid rgba(255,159,180,.28)!important;color:#c95073!important;border-radius:14px!important}
.uvd-cute .uvd-btn{background:rgba(255,214,228,.4)!important;border:1px solid rgba(255,159,180,.3)!important;color:#c95073!important;border-radius:14px!important}
.uvd-cute .uvd-btn[data-action="play"]{background:linear-gradient(135deg,#ff9fb4,#f76c8c)!important;border:none!important;color:#fff!important}
.uvd-cute .uvd-block-btn{background:rgba(255,93,114,.12)!important;border:1px solid rgba(255,93,114,.3)!important}
.uvd-scroll::-webkit-scrollbar-thumb{background:linear-gradient(180deg,#ff9fb4,#f76c8c)!important;border-radius:999px!important}
/* ===== BONG BÓNG COMIC (contentWrapper mới) ===== */
.uvd-bubble-wrap{position:relative;flex:1;min-height:0;display:flex;flex-direction:column;padding-top:2px}
.uvd-bubble{background:#ffffff!important;border:2px solid #ff9fb4!important;border-radius:26px!important;box-shadow:0 14px 34px rgba(247,108,140,.22),inset 0 0 0 1px rgba(255,255,255,.7)!important;padding:12px;flex:1;min-height:0;overflow:hidden;display:flex;flex-direction:column}
.uvd-bubble-title{display:flex;align-items:center;gap:10px;margin:0 0 10px;flex-shrink:0}
.uvd-bubble-tmascot{width:48px;height:48px;display:inline-flex;align-items:flex-end;justify-content:center;background:transparent!important;border:none!important;box-shadow:none!important;filter:drop-shadow(0 4px 10px rgba(247,108,140,.18));animation:uvdMascotHop 1.7s ease-in-out infinite}
.uvd-bubble-tmascot svg{width:100%;height:100%;border-radius:14px;display:block}
.uvd-bubble-tname{font-size:16px;font-weight:850;color:#e84a72;line-height:1.1}
.uvd-bubble-tsub{font-size:9px;color:#c9862a;font-weight:700}
.uvd-bubble #__uvd_stream_list__{border-radius:20px}
/* Popup con mèo đào link */
.uvd-digging-overlay{position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;padding:14px;background:rgba(45,22,47,.42);backdrop-filter:blur(7px);-webkit-backdrop-filter:blur(7px);animation:uvdFadeIn .22s ease both}
.uvd-digging-box{position:relative;width:min(100%,430px);min-height:490px;overflow:hidden;display:flex;flex-direction:column;justify-content:center;text-align:center;padding:30px 27px 27px;border:1px solid rgba(255,255,255,.9);border-radius:40px;background:linear-gradient(155deg,rgba(255,250,253,.99),rgba(255,231,242,.98) 54%,rgba(245,232,255,.98));box-shadow:0 30px 76px rgba(108,46,92,.44),0 0 0 7px rgba(255,255,255,.25) inset;transform:translateZ(0)}
.uvd-dig-close{position:absolute;top:15px;right:15px;width:35px;height:35px;padding:0;border:1px solid rgba(255,159,180,.35);border-radius:50%;background:rgba(255,255,255,.72);color:#d85c7a;font-size:21px;line-height:1;cursor:pointer;box-shadow:0 4px 11px rgba(247,108,140,.13)}
.uvd-dig-art{position:relative;width:270px;height:250px;margin:0 auto -10px;filter:drop-shadow(0 12px 15px rgba(222,100,140,.25))}
.uvd-dig-art svg{width:100%;height:100%;display:block}.uvd-dig-dirt{position:absolute;font-size:19px;line-height:1;animation:uvdDigDirt .9s ease-in-out infinite}.uvd-dig-dirt:nth-child(1){left:18px;bottom:33px;animation-delay:.08s}.uvd-dig-dirt:nth-child(2){right:16px;bottom:47px;animation-delay:.33s}.uvd-dig-dirt:nth-child(3){right:43px;bottom:17px;animation-delay:.58s}
.uvd-dig-kicker{font-size:11px;font-weight:850;letter-spacing:.13em;text-transform:uppercase;color:#c95073;position:relative;z-index:2;margin-top:4px}.uvd-dig-title{margin-top:12px;font-size:28px;font-weight:900;color:#d84972;line-height:1.2;position:relative;z-index:2}.uvd-dig-sub{min-height:23px;margin:10px auto 0;color:#956077;font-size:14px;font-weight:650;line-height:1.5;position:relative;z-index:2}.uvd-dig-action-row{display:flex;gap:8px;max-height:0;margin:0;overflow:hidden;opacity:0;transition:max-height .28s ease,margin .28s ease,opacity .22s ease}.uvd-dig-enter-btn{display:block;flex:1;min-width:0;max-height:0;margin:0;padding:0;overflow:hidden;opacity:0;border:0;border-radius:16px;background:linear-gradient(135deg,#ff91ae,#ef6689);color:#fff;font-size:16px;font-weight:850;box-shadow:0 8px 18px rgba(231,83,127,.3);transition:max-height .28s ease,padding .28s ease,opacity .22s ease,transform .18s ease}.uvd-dig-enter-btn:active{transform:scale(.97)}
.uvd-digging-overlay.uvd-dig-found .uvd-dig-title{color:#b85dc8}.uvd-digging-overlay.uvd-dig-found .uvd-dig-action-row{max-height:56px;margin-top:16px;opacity:1}.uvd-digging-overlay.uvd-dig-found .uvd-dig-enter-btn{max-height:54px;padding:14px 16px;opacity:1}.uvd-digging-overlay.uvd-dig-found .uvd-dig-dirt{animation-play-state:paused;opacity:.38}.uvd-dig-utility-row{display:flex;gap:8px;margin-top:10px}.uvd-dig-ui-btn{flex:1;min-width:0;margin:0;padding:9px 10px;border:1px solid rgba(179,133,242,.46);border-radius:14px;background:rgba(255,255,255,.58);color:#8a6ab0;font-size:11px;font-weight:850;box-shadow:0 4px 11px rgba(150,90,220,.1);cursor:pointer}.uvd-dig-ui-btn:active{transform:scale(.98);background:rgba(243,231,255,.85)}.uvd-dig-route-hint{max-height:0;margin:0;overflow:hidden;opacity:0;color:#8a6ab0;font-size:11.5px;font-weight:700;line-height:1.4;transition:max-height .28s ease,margin .28s ease,opacity .22s ease}.uvd-digging-overlay.uvd-dig-found .uvd-dig-route-hint{max-height:38px;margin-top:8px;opacity:1}
.uvd-digging-overlay.uvd-dig-exit{pointer-events:none;animation:uvdDigOverlayOut .58s ease forwards}.uvd-digging-overlay.uvd-dig-exit .uvd-digging-box{animation:uvdDigBoxFlyUp .58s cubic-bezier(.45,0,.72,.22) forwards}
.uvd-popup-from-digging{animation:uvdPopupRiseAfterDig .52s cubic-bezier(.22,1,.36,1) both!important}
.uvd-media-popup-mascot,.uvd-iframe-popup-mascot,.uvd-play-intro-mascot,.uvd-player-moving-mascot{display:inline-flex;align-items:center;justify-content:center;transform-origin:center bottom;animation:uvdMascotHop 1.75s ease-in-out infinite;transform:scale(1.2)}.uvd-media-popup-mascot svg,.uvd-iframe-popup-mascot svg,.uvd-play-intro-mascot svg,.uvd-player-moving-mascot svg{display:block;transform-origin:center;animation:uvdMascotWiggle 1.35s ease-in-out infinite;width:100%;height:100%}
.uvd-player-moving-mascot{width:72px!important;height:72px!important;flex:0 0 72px!important;margin-left:0!important;filter:drop-shadow(0 8px 18px rgba(247,108,140,.32))!important;animation:uvdMascotHop 1.9s ease-in-out infinite!important}.uvd-player-moving-mascot svg{width:100%!important;height:100%!important;animation:uvdMascotWiggle 1.6s ease-in-out infinite}
.uvd-dig-leg,.uvd-dig-shovel{transform-box:fill-box;transform-origin:center}.uvd-digging-overlay.uvd-dig-running{pointer-events:none}.uvd-digging-overlay.uvd-dig-running .uvd-dig-leg-left{animation:uvdDigLegLeft .17s ease-in-out infinite alternate}.uvd-digging-overlay.uvd-dig-running .uvd-dig-leg-right{animation:uvdDigLegRight .17s ease-in-out infinite alternate}.uvd-digging-overlay.uvd-dig-running .uvd-dig-shovel{animation:uvdDigShovel .21s ease-in-out infinite alternate}.uvd-digging-overlay.uvd-dig-running .uvd-dig-art{animation:uvdMascotHop .28s ease-in-out infinite alternate}
@media (max-width:390px){.uvd-digging-box{min-height:450px;padding:25px 21px 23px;border-radius:34px}.uvd-dig-art{width:225px;height:212px}.uvd-dig-title{font-size:25px}.uvd-dig-sub{font-size:13px}}



.uvd-cute-votes{display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin:8px 0}
.uvd-thumb-menu>summary,.uvd-thumb-menu[open]>summary{width:34px!important;height:34px!important;min-height:34px!important;border-radius:12px!important;background:rgba(255,255,255,.85)!important;border:1px solid rgba(255,159,180,.4)!important;color:#d85c7a!important;font-size:20px!important;letter-spacing:0!important;line-height:34px!important;box-shadow:0 4px 12px rgba(247,108,140,.2),inset 0 1px 0 rgba(255,255,255,.9)!important}
.uvd-thumb-menu>summary:hover{background:#fff!important;border-color:rgba(247,108,140,.6)!important;box-shadow:0 6px 16px rgba(247,108,140,.28)!important}
.uvd-thumb-menu .uvd-action-list{top:42px!important;right:0!important;width:auto!important;min-width:170px!important;display:flex!important;flex-direction:column!important;gap:0!important;padding:6px!important;background:linear-gradient(160deg,#fff6fa,#fff0f5)!important;border:1px solid rgba(255,159,180,.4)!important;border-radius:16px!important;box-shadow:0 12px 30px rgba(247,108,140,.28)!important;grid-template-columns:none!important}
.uvd-thumb-menu .uvd-action-list::before{display:none!important}
.uvd-thumb-menu .uvd-action-list .uvd-btn{min-height:32px!important;padding:8px 12px!important;border-radius:10px!important;background:transparent!important;color:#d85c7a!important;font-size:11px!important;text-align:left!important;box-shadow:none!important}
.uvd-thumb-menu .uvd-action-list .uvd-btn+.uvd-btn{border-top:1px solid rgba(255,159,180,.18)!important}
.uvd-thumb-menu .uvd-action-list .uvd-btn:hover{background:rgba(255,182,198,.25)!important;color:#f76c8c!important}
.uvd-player-sheet{border-radius:30px!important;border:1px solid rgba(255,159,180,.35)!important;box-shadow:0 24px 60px rgba(247,108,140,.28),inset 0 0 0 1px rgba(255,255,255,.6)!important;overflow:hidden!important}
.uvd-player-sheet .uvd-settings-header{background:linear-gradient(150deg,#fff0f5,#ffe3ec)!important;border-bottom:1px solid rgba(255,159,180,.25)!important}
.uvd-player-sheet .uvd-back-btn,.uvd-player-sheet .uvd-icon-btn{background:#fff!important;border:1px solid rgba(255,159,180,.4)!important;color:#d85c7a!important;border-radius:14px!important;box-shadow:0 4px 12px rgba(247,108,140,.16)!important}
.uvd-player-title-copy strong{background:linear-gradient(110deg,#e84a72,#f76c8c,#c95cb8)!important;-webkit-background-clip:text!important;background-clip:text!important;color:transparent!important;text-shadow:none!important}
.uvd-player-type-badge{background:rgba(255,182,198,.25)!important;border:1px solid rgba(255,159,180,.35)!important;color:#d85c7a!important}
.uvd-player-video-area{background:linear-gradient(150deg,#fff0f5,#f8e6ff)!important}
.uvd-player-video-area::before,.uvd-player-video-area::after{display:none!important}
.uvd-player-info-panel{background:linear-gradient(150deg,#f8f4ff,#f3ecff)!important;border-top:1px solid rgba(194,150,255,.25)!important}
.uvd-player-info-title{color:#7a4fb0!important}
.uvd-player-info-meta{color:#a0729a!important}
.uvd-plrow{display:flex;align-items:center;gap:9px;padding:9px;margin-bottom:7px;border-radius:16px;background:linear-gradient(160deg,rgba(255,255,255,.95),rgba(250,240,255,.9));border:1px solid rgba(194,150,255,.3);box-shadow:0 4px 12px rgba(150,90,220,.12);}
.uvd-plrow-meta{border-color:rgba(94,194,160,.45)!important;background:linear-gradient(160deg,rgba(255,255,255,.97),rgba(236,253,247,.92))!important}
.uvd-plrow-thumb{position:relative;flex:0 0 52px;width:52px;height:52px;border-radius:14px;background:linear-gradient(150deg,#ffe0ea,#ffd6e4);border:1px solid rgba(255,159,180,.35);display:flex;align-items:center;justify-content:center;font-size:22px;overflow:hidden}
.uvd-plrow-meta .uvd-plrow-thumb{background:linear-gradient(150deg,#d7f7ea,#b9f0dc);border-color:rgba(94,194,160,.4)}
.uvd-plrow-play{position:absolute;inset:0;border:none;background:rgba(0,0,0,.18);color:#fff;font-size:16px;opacity:0;cursor:pointer;transition:opacity .15s}
.uvd-plrow:hover .uvd-plrow-play{opacity:1}
.uvd-plrow-body{flex:1;min-width:0}
.uvd-plrow-head{display:flex;align-items:center;gap:5px;margin-bottom:3px;flex-wrap:wrap}
.uvd-plrow-badge{font-size:8px;font-weight:800;color:#fff;background:linear-gradient(135deg,#b385f2,#9a6ce0);border-radius:999px;padding:2px 7px;letter-spacing:.03em}
.uvd-plrow-meta .uvd-plrow-badge{background:linear-gradient(135deg,#5ec2a0,#3aa97f)}
.uvd-plrow-res{font-size:8px;font-weight:800;color:#c07fae;background:rgba(255,182,198,.2);border-radius:999px;padding:2px 7px}
.uvd-plrow-meta .uvd-plrow-res{color:#2c8c6a;background:rgba(94,194,160,.16)}
.uvd-plrow-url{font-size:9px;color:#8a6ab0;word-break:break-all;line-height:1.4}
.uvd-plrow-votes{display:flex;flex-direction:column;gap:4px;flex:0 0 auto}
.uvd-plvote{font-size:9px;font-weight:800;padding:3px 8px;border-radius:999px;cursor:pointer;border:1px solid}
.uvd-plvote.up{background:#ffe3ec;color:#e84a72;border-color:rgba(232,74,114,.25)}
.uvd-plvote.down{background:#ffe9e9;color:#ff5d72;border-color:rgba(255,93,114,.25)}
.uvd-plrow-watch{flex:0 0 auto;border:none;background:linear-gradient(135deg,#ff9fb4,#f76c8c);color:#fff;font-size:10px;font-weight:800;border-radius:12px;padding:8px 12px;cursor:pointer;box-shadow:0 4px 12px rgba(247,108,140,.3);white-space:nowrap}
.uvd-thumb-menu>summary,.uvd-thumb-menu[open]>summary{display:flex!important;align-items:center!important;justify-content:center!important;width:34px!important;height:34px!important;min-height:34px!important;padding:0!important;border-radius:12px!important;background:linear-gradient(150deg,#fff,#fff0f5)!important;border:1px solid rgba(255,159,180,.4)!important;color:#d85c7a!important;font-size:20px!important;line-height:34px!important;box-shadow:0 4px 12px rgba(247,108,140,.2),inset 0 1px 0 rgba(255,255,255,.9)!important;overflow:hidden!important}
.uvd-thumb-menu>summary:hover,.uvd-thumb-menu[open]>summary{background:#fff!important;border-color:rgba(247,108,140,.6)!important;box-shadow:0 6px 16px rgba(247,108,140,.3)!important}
.uvd-player-mascot{width:40px;height:40px;flex:0 0 40px;border-radius:14px;display:flex;align-items:center;justify-content:center;font-size:22px;background:linear-gradient(150deg,#ffe0ea,#ffd6e4);border:1px solid rgba(255,159,180,.4);box-shadow:0 4px 12px rgba(247,108,140,.25)}
.uvd-plcard{background:linear-gradient(160deg,rgba(255,255,255,.97),rgba(240,253,248,.93))!important;border:1px solid rgba(94,194,160,.4)!important;border-radius:20px!important;padding:10px;margin-bottom:10px;box-shadow:0 8px 20px rgba(94,194,160,.16),inset 0 0 0 1px rgba(255,255,255,.7)!important}
.uvd-plcard-preview{position:relative;height:150px;border-radius:16px;overflow:hidden;background:linear-gradient(135deg,#d7f7ea,#b9f0dc);border:1px solid rgba(94,194,160,.3);margin-bottom:8px}
.uvd-plcard-preview .uvd-thumb-sheen{position:absolute;inset:0;z-index:1;background:linear-gradient(180deg,transparent,rgba(20,60,50,.25));pointer-events:none}
.uvd-plcard-preview .uvd-plrow-watch{position:absolute;z-index:3;left:50%;top:50%;transform:translate(-50%,-50%);border:none;width:52px;height:52px;border-radius:50%;background:rgba(255,255,255,.92);color:#e84a72;font-size:20px;cursor:pointer;box-shadow:0 6px 16px rgba(247,108,140,.35);border:2px solid rgba(255,159,180,.6)}
.uvd-plcard-badge{position:absolute;z-index:2;top:8px;left:8px;font-size:9px;font-weight:800;color:#fff;background:linear-gradient(135deg,#5ec2a0,#3aa97f);border-radius:999px;padding:3px 9px;box-shadow:0 3px 8px rgba(58,169,127,.35)}
.uvd-plcard-head{display:flex;align-items:center;gap:6px;margin-bottom:5px;flex-wrap:wrap}
.uvd-plcard-note{font-size:12px;font-weight:800;color:#2c8c6a;margin-bottom:5px}
.uvd-plcard-url{font-size:12px;color:#1f7a5c;word-break:break-all;line-height:1.45;background:rgba(94,194,160,.12);border:1px solid rgba(94,194,160,.25);border-radius:10px;padding:6px 8px}
.uvd-plcard-strip{display:flex;align-items:center;gap:6px;padding:4px 2px 0;overflow-x:auto;scrollbar-width:none;margin-bottom:2px}
.uvd-plcard-strip::-webkit-scrollbar{display:none}
.uvd-plcard-strip-label{flex:0 0 auto;color:#3aa97f;font-size:8px;font-weight:800;letter-spacing:.06em;writing-mode:vertical-rl;transform:rotate(180deg)}
.uvd-plcard-strip:not(:has(.uvd-plcard-ext)){display:none}
.uvd-plcard-ext{position:relative;flex:0 0 70px;height:44px;overflow:hidden;border:1px solid rgba(94,194,160,.3);border-radius:9px;background:linear-gradient(135deg,#d7f7ea,#b9f0dc)}
.uvd-plcard-ext img{display:block;width:100%;height:100%;object-fit:cover}
.uvd-plcard-ext span{position:absolute;right:4px;bottom:2px;color:#fff;font-size:8px;font-weight:700;text-shadow:0 1px 3px rgba(0,0,0,.6)}
.uvd-plplain{position:relative;display:flex;align-items:center;gap:10px;padding:12px 14px;margin-bottom:10px;border-radius:18px;background:linear-gradient(155deg,#fffdfd 0%,#fff0f5 70%,#f5edff 100%);border:2px solid rgba(255,159,180,.28);box-shadow:0 6px 16px rgba(247,108,140,.12),inset 0 1px 0 #fff;transition:transform .15s ease,box-shadow .15s ease}
.uvd-plplain:hover{transform:translateY(-1px);box-shadow:0 10px 24px rgba(247,108,140,.18)}
.uvd-plplain-body{flex:1;min-width:0;position:relative;padding-right:28px}
.uvd-plplain-body::before{content:'🎀';position:absolute;right:6px;top:4px;font-size:13px;filter:drop-shadow(0 1px 2px rgba(247,108,140,.2))}
.uvd-plplain-url{font-size:12px;color:#7a5f9e;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;word-break:normal;line-height:1.4;background:rgba(243,236,255,.55);border:1px solid rgba(194,150,255,.20);border-radius:10px;padding:5px 8px;margin-top:4px;max-width:100%}
.uvd-iframe-cute-row{position:relative;display:flex;align-items:center;gap:10px;padding:12px 14px;margin-bottom:10px;border-radius:18px;background:linear-gradient(155deg,#fffdf6 0%,#fff0f5 70%,#f5edff 100%);border:2px solid rgba(255,159,180,.28);box-shadow:0 6px 16px rgba(247,108,140,.12)}
.uvd-iframe-cute-row .uvd-plplain-body{flex:1;min-width:0;position:relative;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:11px;color:#8a6ab0;padding-right:26px}
.uvd-iframe-cute-row .uvd-plplain-body::before{content:'🎀';position:absolute;right:6px;top:4px;font-size:12px;filter:drop-shadow(0 1px 2px rgba(247,108,140,.2))}
.uvd-plplain .uvd-plrow-watch,.uvd-iframe-cute-row .uvd-plrow-watch,.uvd-iframe-cute-row .uvd-btn{flex:0 0 auto;padding:10px 16px;border-radius:14px;font-weight:800;transition:transform .15s ease}
.uvd-plplain .uvd-plrow-watch:hover,.uvd-iframe-cute-row .uvd-btn:hover{transform:scale(1.04)}
/* Video popup - dong bo mau tim voi tho - purple */
#__uvd_media_links_prompt__ .uvd-plplain{border-color:rgba(194,150,255,.32)!important;background:linear-gradient(155deg,#fff 0%,#f8f4ff 65%,#f3ecff 100%)!important}
#__uvd_media_links_prompt__ .uvd-plplain-body::before{content:'🎀';color:#b68bea}
#__uvd_media_links_prompt__ .uvd-plplain-badge{background:#b385f2!important}
#__uvd_media_links_prompt__ .uvd-plplain-q{background:linear-gradient(135deg,#d9b8ff,#b385f2)!important}
#__uvd_media_links_prompt__ .uvd-plrow-watch{background:linear-gradient(135deg,#d9b8ff,#b385f2)!important;color:#fff!important;box-shadow:0 4px 14px rgba(179,133,242,.32)!important}
#__uvd_media_links_prompt__ .uvd-plplain-url{background:rgba(243,236,255,.6)!important;border-color:rgba(194,150,255,.22)!important}
/* Iframe popup - dong bo mau hong voi meo - pink */
#__uvd_iframe_workflow_prompt__ .uvd-iframe-cute-row{border-color:rgba(255,159,180,.32)!important;background:linear-gradient(155deg,#fff6fa 0%,#fff0f5 70%,#fff0f8 100%)!important}
#__uvd_iframe_workflow_prompt__ .uvd-iframe-cute-row .uvd-plplain-body::before{content:'🎀';color:#f5a0bd}
#__uvd_iframe_workflow_prompt__ .uvd-plplain-badge{background:#3aa97f!important}
#__uvd_iframe_workflow_prompt__ .uvd-iframe-cute-row .uvd-btn,#__uvd_iframe_workflow_prompt__ .uvd-plrow-watch{background:linear-gradient(135deg,#ff9fb4,#f76c8c)!important;color:#fff!important;box-shadow:0 4px 14px rgba(247,108,140,.32)!important}
#__uvd_iframe_workflow_prompt__ .uvd-plplain-body{color:#a05668!important}
#__uvd_iframe_workflow_prompt__ .uvd-plplain-url{word-break:break-all}

.uvd-farewell-mascots{display:flex;gap:6px;flex-wrap:wrap;justify-content:center;align-items:flex-end}
.uvd-farewell-mascots.uvd-farewell-big{gap:8px;min-height:160px;justify-content:center}
.uvd-fm{width:56px;height:56px;display:inline-flex;align-items:flex-end;justify-content:center;background:transparent!important;border:none!important;box-shadow:none!important;filter:drop-shadow(0 6px 12px rgba(247,108,140,.22));animation:uvdMascotHop 1.9s ease-in-out infinite}
.uvd-fm.uvd-fm-big{width:92px;height:92px;filter:drop-shadow(0 10px 20px rgba(247,108,140,.30))}
.uvd-fm.uvd-fm-big-full{width:140px;height:180px;filter:drop-shadow(0 14px 24px rgba(247,108,140,.34));animation:uvdMascotHop 2s ease-in-out infinite}
.uvd-fm.uvd-fm-big-full svg{width:100%;height:100%;animation:uvdMascotWiggle 1.8s ease-in-out infinite}
.uvd-fm svg{width:100%;height:100%;animation:uvdMascotWiggle 1.6s ease-in-out infinite}
.uvd-fm:nth-child(2){animation-delay:.14s}.uvd-fm:nth-child(3){animation-delay:.28s}
.uvd-farewell-art{display:flex;justify-content:center;align-items:flex-end;gap:10px;flex-wrap:wrap;min-height:150px;margin-bottom:10px}
.uvd-farewell-box{max-width:480px!important;min-height:600px!important}
.uvd-wave-arm{animation:uvdWaveArm 1.2s ease-in-out infinite;transform-box:fill-box}
.uvd-wave-arm2{animation:uvdWaveArm 1.2s ease-in-out infinite .2s;transform-box:fill-box}
@keyframes uvdWaveArm{0%,100%{transform:rotate(-12deg)}50%{transform:rotate(18deg)}}
.uvd-farewell-box .uvd-farewell-art .uvd-fm-big{width:110px;height:110px}.uvd-farewell-one{flex-direction:column;gap:0!important}.uvd-farewell-animal-name{margin-top:-8px;padding:5px 11px;border-radius:999px;background:rgba(255,255,255,.76);border:1px solid rgba(194,150,255,.25);box-shadow:0 4px 10px rgba(150,90,220,.1);color:#8a6ab0;font-size:10px;font-weight:900}.uvd-cry-tear{animation:uvdCryTear 1.2s ease-in-out infinite;transform-box:fill-box;transform-origin:center}@keyframes uvdCryTear{0%,100%{opacity:.85;transform:translateY(0) scale(.9)}50%{opacity:1;transform:translateY(4px) scale(1.08)}}

.uvd-plplain-quality{border-color:rgba(179,133,242,.5)!important;background:linear-gradient(150deg,rgba(255,255,255,.96),rgba(247,235,255,.92))!important}
.uvd-plplain-body{flex:1;min-width:0;display:flex;flex-direction:column;gap:3px}
.uvd-plplain-top{display:flex;align-items:center;flex-wrap:wrap;gap:5px}
.uvd-plplain-badge{display:inline-flex;align-items:center;padding:2px 8px;border-radius:999px;font-size:8.5px;font-weight:800;color:#fff;background:#b385f2;white-space:nowrap}
.uvd-plplain-q{display:inline-flex;align-items:center;padding:2px 8px;border-radius:999px;font-size:8.5px;font-weight:800;color:#fff;background:linear-gradient(135deg,#ff9fb4,#f76c8c);white-space:nowrap}
.uvd-plplain-url{font-size:11.5px;color:#7a5f9e;word-break:break-all;line-height:1.45}
.uvd-plplain-note{font-size:11px;font-weight:800;color:#8a6ab0!important;margin-top:2px}
.uvd-plplain-quality .uvd-plrow-watch{background:linear-gradient(135deg,#d9b8ff,#b385f2);font-size:11px;padding:10px 14px}
.uvd-player-sheet{border-radius:30px!important;border:1px solid rgba(255,159,180,.35)!important;box-shadow:0 24px 60px rgba(247,108,140,.3),inset 0 0 0 1px rgba(255,255,255,.6)!important;overflow:hidden!important}
.uvd-player-sheet .uvd-settings-header{background:linear-gradient(150deg,#fff0f5,#ffe3ec)!important;border-bottom:1px solid rgba(255,159,180,.25)!important}
.uvd-player-video-area{padding:14px!important;background:linear-gradient(150deg,#fff0f5,#f8e6ff)!important}
.uvd-player-video-area #__uvd_video_wrapper__{background:#fff!important;border-radius:22px!important;border:1px solid rgba(255,159,180,.3)!important;box-shadow:0 14px 34px rgba(247,108,140,.25),inset 0 0 0 1px rgba(255,255,255,.6)!important;overflow:hidden!important}
.uvd-player-info-panel{background:linear-gradient(150deg,#f8f4ff,#f3ecff)!important;border-top:1px solid rgba(194,150,255,.25)!important;border-radius:0 0 30px 30px}
.uvd-player-overlay{position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(28,14,40,.78);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)}
.uvd-player-overlay .uvd-player-sheet{width:100%;max-width:440px;height:auto!important;max-height:92dvh!important;border-radius:26px!important;border:1px solid rgba(194,150,255,.4)!important;background:linear-gradient(160deg,#f8f4ff,#f3ecff,#fff0f8)!important;box-shadow:0 24px 60px rgba(150,90,220,.35),0 0 0 6px rgba(255,255,255,.35) inset!important;overflow:hidden!important;margin:auto}
.uvd-player-overlay .uvd-player-sheet .uvd-settings-header{background:linear-gradient(150deg,#fff0f5,#ffe3ec)!important;border-bottom:1px solid rgba(255,159,180,.25)!important}
.uvd-player-overlay .uvd-player-sheet .uvd-back-btn,.uvd-player-overlay .uvd-player-sheet .uvd-icon-btn{background:#fff!important;border:1px solid rgba(255,159,180,.4)!important;color:#d85c7a!important;border-radius:14px!important}
.uvd-player-overlay .uvd-player-sheet .uvd-player-title-copy strong{background:linear-gradient(110deg,#e84a72,#f76c8c,#c95cb8)!important;-webkit-background-clip:text!important;background-clip:text!important;color:transparent!important}
.uvd-player-overlay .uvd-player-sheet .uvd-player-type-badge{background:rgba(255,182,198,.25)!important;border:1px solid rgba(255,159,180,.35)!important;color:#d85c7a!important}
.uvd-player-overlay .uvd-player-sheet .uvd-player-video-area{background:linear-gradient(150deg,#fff0f5,#f8e6ff)!important;padding:12px!important}
.uvd-player-overlay .uvd-player-sheet #__uvd_video_wrapper__{background:#fff!important;border-radius:18px!important;border:1px solid rgba(255,159,180,.3)!important;box-shadow:0 14px 34px rgba(247,108,140,.28),inset 0 0 0 1px rgba(255,255,255,.6)!important;overflow:hidden!important}
.uvd-player-overlay .uvd-player-sheet .uvd-player-info-panel{background:linear-gradient(150deg,#f8f4ff,#f3ecff)!important;border-top:1px solid rgba(194,150,255,.25)!important;border-radius:0 0 26px 26px}
.uvd-player-overlay.uvd-open{background:rgba(28,14,40,.78)!important;backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)}
.uvd-player-overlay{position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;padding:0;background:rgba(10,6,18,.82);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px)}
.uvd-player-overlay .uvd-player-sheet{width:100%;height:100dvh!important;max-height:100dvh!important;border-radius:0!important;border:none!important;background:linear-gradient(160deg,#f8f4ff,#f3ecff,#fff0f8)!important;box-shadow:none!important;overflow:hidden!important;margin:0}
.uvd-player-overlay .uvd-player-sheet .uvd-settings-header{background:linear-gradient(150deg,#fff0f5,#ffe3ec)!important;border-bottom:1px solid rgba(255,159,180,.25)!important;padding:14px 18px!important;min-height:64px!important}
.uvd-player-overlay .uvd-player-sheet .uvd-back-btn,.uvd-player-overlay .uvd-player-sheet .uvd-icon-btn{background:#fff!important;border:1px solid rgba(255,159,180,.4)!important;color:#d85c7a!important;border-radius:14px!important}
.uvd-player-overlay .uvd-player-sheet .uvd-player-title-copy strong{background:linear-gradient(110deg,#e84a72,#f76c8c,#c95cb8)!important;-webkit-background-clip:text!important;background-clip:text!important;color:transparent!important}
.uvd-player-overlay .uvd-player-sheet .uvd-player-type-badge{background:rgba(255,182,198,.25)!important;border:1px solid rgba(255,159,180,.35)!important;color:#d85c7a!important}
/* Bỏ cục background quanh player: video trải nền luôn */
.uvd-player-overlay .uvd-player-sheet .uvd-player-video-area{background:linear-gradient(150deg,#fff0f5,#f8e6ff)!important;padding:6px!important}
.uvd-player-overlay .uvd-player-sheet #__uvd_video_wrapper__{background:transparent!important;border:none!important;box-shadow:none!important;border-radius:0!important}
/* Trang trí phía dưới */
.uvd-player-overlay .uvd-player-sheet .uvd-player-info-panel{background:linear-gradient(150deg,#f8f4ff,#f3ecff)!important;border-top:1px solid rgba(194,150,255,.25)!important}
.uvd-player-deco{flex-shrink:0;display:flex;flex-direction:column;align-items:center;gap:2px;padding:10px 16px 16px;text-align:center;background:linear-gradient(150deg,#fff0f5,#f8e6ff)}
.uvd-player-deco-icon{font-size:34px;line-height:1;animation:uvdPulse 2s infinite}
.uvd-player-deco-text{font-size:13px;font-weight:800;color:#d85c7a}
.uvd-player-deco-sub{font-size:10px;color:#a0729a}
/* ===== Settings cute: hero mascot + hướng dẫn cute ===== */
.uvd-settings-overlay .uvd-settings-sheet{background:linear-gradient(180deg,#fff6fb 0%,#f6f0ff 100%)!important;border-radius:34px 34px 0 0!important}
.uvd-settings-overlay .uvd-settings-header{background:linear-gradient(150deg,#fff0f5,#ffe3ec)!important;border-bottom:1px solid rgba(255,159,180,.25)!important}
.uvd-settings-hero{display:flex;align-items:center;gap:16px;padding:18px 20px;background:linear-gradient(150deg,#ffe9f3 0%,#f3e6ff 60%,#fff5f8 100%);border-bottom:1px solid rgba(255,159,180,.22);min-height:96px}
.uvd-settings-hero-mascot{flex:0 0 auto;width:92px;height:92px;display:flex;align-items:center;justify-content:center;transform:scale(1.2);filter:drop-shadow(0 8px 16px rgba(247,108,140,.28));background:transparent!important;border:none!important;box-shadow:none!important;animation:uvdMascotHop 1.9s ease-in-out infinite}
.uvd-settings-hero-mascot svg{width:100%;height:100%;display:block;animation:uvdMascotWiggle 1.6s ease-in-out infinite}
.uvd-settings-hero-mascot.uvd-hero-big{width:124px;height:124px}
#_uvd_dig_fact_box__{animation:uvdScaleIn .3s ease both}
#__uvd_dig_fact_wrap__{animation:uvdFadeIn .4s ease both}
.uvd-hero-ear-bow{transform-box:fill-box;transform-origin:center;animation:uvdPandaEarWiggle 1.4s ease-in-out infinite}
.uvd-hero-cheek{transform-box:fill-box;transform-origin:center;animation:uvdHamsterPop 1.5s ease-in-out infinite}
.uvd-hero-heart{animation:uvdHeroHeartFloat 2.2s ease-in-out infinite}
@keyframes uvdHeroHeartFloat{0%,100%{transform:translateY(0) scale(1)}50%{transform:translateY(-6px) scale(1.15)}}
.uvd-settings-hero-text{min-width:0}
.uvd-settings-hero-title{font-size:20px;font-weight:800;color:#d85c7a}
.uvd-settings-hero-sub{font-size:12.5px;color:#a0729a;margin-top:3px;line-height:1.5}
/* Con thú cầm bảng tiêu đề trong phần hướng dẫn Cài đặt. */
.uvd-settings-animal-sign{position:relative;display:flex;align-items:flex-end;min-height:88px;margin:2px 0 10px;padding:5px 3px 0;isolation:isolate;overflow:visible}.uvd-settings-sign-mascot{position:relative;z-index:3;width:78px;height:78px;flex:0 0 78px;display:flex;align-items:flex-end;justify-content:center;background:transparent!important;border:none!important;box-shadow:none!important;filter:drop-shadow(0 6px 10px rgba(247,108,140,.22));animation:uvdMascotHop 1.8s ease-in-out infinite, uvdBoardFloat 2.4s ease-in-out infinite}.uvd-settings-sign-mascot svg{width:100%;height:100%;display:block;animation:uvdMascotWiggle 1.35s ease-in-out infinite}.uvd-settings-sign-board{position:relative;z-index:2;display:flex;flex:1;flex-direction:column;justify-content:center;min-width:0;min-height:62px;margin:0 0 9px -12px;padding:9px 12px 9px 18px;border:2px solid rgba(255,159,180,.45);border-radius:17px;background:linear-gradient(155deg,#fffdfd,#ffe9f2);box-shadow:0 6px 14px rgba(247,108,140,.15),inset 0 1px 0 #fff}.uvd-settings-sign-board::before{content:'✦';position:absolute;right:9px;top:7px;color:#f5a0bd;font-size:12px}.uvd-settings-sign-board strong{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#c95073;font-size:14px;font-weight:900;line-height:1.2}.uvd-settings-sign-board small{display:block;margin-top:3px;color:#9a6c89;font-size:10.5px;font-weight:650;line-height:1.3}.uvd-settings-sign-paw{position:absolute;z-index:4;left:56px;bottom:21px;width:18px;height:13px;border-radius:12px;background:#ffe3ed;border:2px solid #f6abc2;box-shadow:0 2px 4px rgba(247,108,140,.12)}.uvd-settings-sign-animal-name{position:absolute;left:50%;bottom:-2px;transform:translateX(-50%);padding:2px 5px;border-radius:999px;background:rgba(255,255,255,.9);border:1px solid rgba(255,159,180,.3);color:#a76380;font-size:7px;font-weight:900;letter-spacing:.05em;white-space:nowrap;box-shadow:0 2px 5px rgba(247,108,140,.14)}.uvd-settings-sign-paw-one{transform:rotate(-16deg)}.uvd-settings-sign-paw-two{left:67px;bottom:17px;transform:rotate(15deg)}.uvd-settings-sign-rabbit .uvd-settings-sign-board{border-color:rgba(194,150,255,.42);background:linear-gradient(155deg,#fffdfd,#f4ecff)}.uvd-settings-sign-rabbit .uvd-settings-sign-board strong{color:#9368c8}.uvd-settings-sign-rabbit .uvd-settings-sign-board::before{color:#b68bea}.uvd-settings-sign-bear .uvd-settings-sign-board{border-color:rgba(236,174,126,.48);background:linear-gradient(155deg,#fffdf9,#fff0e1)}.uvd-settings-sign-bear .uvd-settings-sign-board strong{color:#b87652}.uvd-settings-sign-bear .uvd-settings-sign-board::before{color:#e1a273}
.uvd-settings-sign-panda .uvd-settings-sign-board{border-color:rgba(90,90,90,.18);background:linear-gradient(155deg,#ffffff,#f2f0f3)}.uvd-settings-sign-panda .uvd-settings-sign-board strong{color:#4a4a4e}.uvd-settings-sign-panda .uvd-settings-sign-board::before{color:#9a9a9e}
.uvd-settings-sign-raccoon .uvd-settings-sign-board{border-color:rgba(160,156,150,.42);background:linear-gradient(155deg,#fdfcfa,#e8e6e0)}.uvd-settings-sign-raccoon .uvd-settings-sign-board strong{color:#6e6a64}.uvd-settings-sign-raccoon .uvd-settings-sign-board::before{color:#8b8680}
.uvd-settings-sign-hamster .uvd-settings-sign-board{border-color:rgba(252,191,106,.48);background:linear-gradient(155deg,#fffdf6,#fff0c8)}.uvd-settings-sign-hamster .uvd-settings-sign-board strong{color:#c07a2e}.uvd-settings-sign-hamster .uvd-settings-sign-board::before{color:#e8a84a}
.uvd-panda-ear{transform-box:fill-box;transform-origin:center;animation:uvdPandaEarWiggle 1.6s ease-in-out infinite}
.uvd-raccoon-tail{transform-box:fill-box;transform-origin:20px 48px;animation:uvdRaccoonTailWag 1.1s ease-in-out infinite}
.uvd-hamster-cheek{transform-box:fill-box;transform-origin:center;animation:uvdHamsterPop 1.3s ease-in-out infinite}
.uvd-settings-sign-mascot{animation:uvdMascotHop 1.8s ease-in-out infinite, uvdBoardFloat 2.4s ease-in-out infinite}
.uvd-settings-sign-paw{animation:uvdPawTap 1.2s ease-in-out infinite}
.uvd-settings-sign-paw-two{animation-delay:.25s}
.uvd-player-moving-mascot{animation:uvdMascotHop 1.4s ease-in-out infinite}
.uvd-player-moving-mascot svg{animation:uvdMascotWiggle 1.1s ease-in-out infinite, uvdHamsterPop 1.8s ease-in-out infinite}
.uvd-settings-overlay .uvd-settings-details{background:rgba(255,255,255,.72)!important;border:1px solid rgba(255,159,180,.3)!important;border-radius:20px!important}
.uvd-settings-overlay .uvd-settings-details>summary{color:#d85c7a!important;font-size:14px!important}
.uvd-settings-overlay .uvd-settings-details-body>.uvd-card{background:rgba(255,244,249,.6)!important}
.uvd-settings-overlay .uvd-settings-title{background:linear-gradient(110deg,#f76c8c,#b385f2);-webkit-background-clip:text;background-clip:text;color:transparent!important;text-shadow:none!important}
/* Settings cards hồng tím + footer nhắn nhủ cute */
.uvd-settings-overlay .uvd-card{background:linear-gradient(160deg,rgba(255,255,255,.94),rgba(250,240,255,.9))!important;border:1px solid rgba(194,150,255,.3)!important;border-radius:18px!important}
.uvd-settings-overlay .uvd-step-text{color:#6b4d85!important}
.uvd-settings-footer-cute{display:flex;flex-direction:column;align-items:center;text-align:center;gap:8px;margin:24px 4px 8px;padding:4px;background:transparent!important;border:none!important;box-shadow:none!important}
.uvd-settings-footer-mascot{display:flex;align-items:center;justify-content:center;width:116px;height:116px;transform:scale(1.5);filter:drop-shadow(0 8px 16px rgba(247,108,140,.35))}
.uvd-settings-footer-title{font-size:17px;font-weight:800;color:#c95073}
.uvd-settings-footer-sub{font-size:12.5px;color:#8a6ab0;margin-top:2px;line-height:1.6;max-width:92%}
/* Quét sạch màu xanh trong Cài đặt → tông hồng tím */
.uvd-settings-overlay .uvd-timeline-card{border-left:2px solid rgba(194,150,255,.35)!important}
.uvd-settings-overlay .uvd-step-num{background:linear-gradient(135deg,#ff9fb4,#b385f2)!important;box-shadow:0 2px 8px rgba(247,108,140,.35)!important}
.uvd-settings-overlay .uvd-inline-code{color:#9a6ce0!important;background:rgba(194,150,255,.12)!important;border-color:rgba(194,150,255,.2)!important}
.uvd-settings-overlay .uvd-callout{background:rgba(255,159,180,.1)!important;border:1px solid rgba(255,159,180,.25)!important;border-left:3px solid #f76c8c!important;color:#7a5f9e!important}
.uvd-settings-overlay .uvd-callout.uvd-callout-warn{background:rgba(255,184,77,.12)!important;border-color:rgba(255,184,77,.3)!important;border-left-color:#ffc46b!important}
.uvd-settings-overlay .uvd-code-block{background:rgba(194,150,255,.1)!important;border-color:rgba(194,150,255,.25)!important}
.uvd-settings-overlay .uvd-code-block textarea{color:#9a6ce0!important}
.uvd-settings-overlay .uvd-details-chevron{color:#b385f2!important}
.uvd-settings-overlay input,.uvd-settings-overlay select,.uvd-settings-overlay textarea{color:#7a5f9e!important;background:rgba(194,150,255,.12)!important;border-color:rgba(194,150,255,.3)!important}
.uvd-settings-overlay .uvd-btn{color:#9a6ce0!important;background:rgba(255,159,180,.16)!important;border-color:rgba(255,159,180,.32)!important}
.uvd-settings-overlay .uvd-toggle-switch{background:rgba(194,150,255,.25)!important}
.uvd-settings-overlay .uvd-toggle-switch .uvd-toggle-knob{background:linear-gradient(135deg,#ff9fb4,#b385f2)!important}
.uvd-settings-overlay .uvd-profile-card{background:linear-gradient(135deg,rgba(255,159,180,.16),rgba(194,150,255,.12))!important;border-color:rgba(255,159,180,.3)!important}
.uvd-settings-overlay .uvd-profile-avatar{background:linear-gradient(135deg,#ff9fb4,#b385f2)!important;box-shadow:0 6px 18px rgba(247,108,140,.4),0 0 0 3px rgba(255,255,255,.1)!important}
/* Profile avatar/copy cute: thay các tag kỹ thuật khô bằng cá tính của chủ tool. */
.uvd-settings-overlay .uvd-profile-card-cute{position:relative;display:flex;align-items:center;gap:14px;overflow:hidden;padding:16px!important;border-radius:26px!important;background:linear-gradient(135deg,rgba(255,232,242,.96),rgba(245,233,255,.94))!important;border:1px solid rgba(255,159,180,.36)!important;box-shadow:0 12px 26px rgba(247,108,140,.18),inset 0 1px 0 rgba(255,255,255,.85)!important}
.uvd-settings-overlay .uvd-profile-card-cute::before{display:none}
.uvd-settings-overlay .uvd-profile-card-cute>*{position:relative;z-index:1}
.uvd-settings-overlay .uvd-profile-avatar-cute{position:relative;width:76px;height:76px;flex-basis:76px;background:transparent!important;border:none!important;box-shadow:none!important;border-radius:0!important;overflow:visible;filter:drop-shadow(0 8px 16px rgba(247,108,140,.28))}
.uvd-profile-avatar-cat{display:flex;width:76px;height:76px;align-items:center;justify-content:center;background:transparent!important;border:none!important;box-shadow:none!important;animation:uvdMascotHop 2s ease-in-out infinite}
.uvd-profile-avatar-cat svg{width:100%;height:100%;display:block;animation:uvdMascotWiggle 1.5s ease-in-out infinite}
.uvd-settings-overlay .uvd-profile-card-cute .uvd-profile-copy-cute{background:transparent!important;border:none!important;box-shadow:none!important;padding:2px 0!important;width:auto;flex:1;text-align:left}
.uvd-settings-overlay .uvd-profile-card-cute{padding:22px 14px 14px!important;gap:14px!important}
.uvd-settings-overlay .uvd-profile-card-cute .uvd-profile-traits{justify-content:flex-start}
.uvd-settings-overlay .uvd-profile-card-cute .uvd-profile-traits{justify-content:center}.uvd-profile-avatar-heart{position:absolute;right:-7px;top:-8px;width:25px;height:25px;display:flex;align-items:center;justify-content:center;border-radius:50%;background:linear-gradient(135deg,#ff91ae,#d99cff);border:2px solid #fff;color:#fff;font-style:normal;font-size:18px;font-weight:900;line-height:1;box-shadow:0 4px 10px rgba(247,108,140,.28)}.uvd-profile-copy-cute{padding-right:2px}.uvd-profile-eyebrow{font-size:9px;font-weight:850;letter-spacing:.1em;text-transform:uppercase;color:#b283bd}.uvd-settings-overlay .uvd-profile-card-cute .uvd-profile-name{margin-top:2px;color:#c95073!important;font-size:16px!important;font-weight:900}.uvd-profile-personality{margin-top:3px;color:#7c5b82;font-size:11.5px;font-weight:650;line-height:1.42}.uvd-profile-traits{display:flex;flex-wrap:wrap;gap:5px;margin-top:8px}.uvd-profile-traits span{padding:4px 7px;border-radius:999px;background:rgba(255,255,255,.66);border:1px solid rgba(255,159,180,.26);color:#c95073;font-size:9.5px;font-weight:800}
/* Giữ hướng profile cũ: mèo nằm trong ô pastel mềm, nội dung gọn bên cạnh. */
.uvd-settings-overlay .uvd-profile-card-cute{padding:15px!important;gap:13px!important}.uvd-settings-overlay .uvd-profile-card-cute::before{display:block!important;content:'';position:absolute;width:145px;height:145px;right:-50px;top:-68px;border-radius:50%;background:rgba(255,255,255,.48);filter:blur(3px);pointer-events:none}.uvd-settings-overlay .uvd-profile-avatar-cute{width:76px!important;height:76px!important;flex-basis:76px!important;border-radius:24px!important;background:linear-gradient(145deg,#fff8fc,#ffdce9)!important;border:1px solid rgba(255,159,180,.42)!important;box-shadow:0 9px 18px rgba(247,108,140,.25),inset 0 2px 0 rgba(255,255,255,.9)!important;overflow:visible}.uvd-profile-avatar-cat{width:68px!important;height:68px!important}.uvd-settings-overlay .uvd-profile-card-cute .uvd-profile-copy-cute{padding:2px 0!important;text-align:left!important}.uvd-settings-overlay .uvd-profile-card-cute .uvd-profile-traits{justify-content:flex-start!important}
/* Avatar profile không dùng khung; gấu trúc header và mèo profile không bị trùng nhau. */
.uvd-settings-overlay .uvd-profile-avatar-cute{background:transparent!important;border:none!important;box-shadow:none!important;border-radius:0!important;filter:drop-shadow(0 8px 16px rgba(247,108,140,.28))}.uvd-profile-avatar-cat{width:76px!important;height:76px!important}
.uvd-settings-overlay .uvd-tag{background:rgba(255,159,180,.14)!important;color:#c95073!important;border-color:rgba(255,159,180,.3)!important}
.uvd-settings-overlay .uvd-stat-num{color:#d85c7a!important}
.uvd-settings-overlay .uvd-url-box{color:#9a6ce0!important;background:rgba(255,214,228,.28)!important;border-color:rgba(255,159,180,.3)!important}
.uvd-settings-overlay .uvd-section-num{background:linear-gradient(135deg,#ff9fb4,#b385f2)!important}
/* Cục link đầu tiên chĩa lên current tab (giống mũi chĩa menu player) */
#__uvd_stream_list__ .uvd-card.uvd-stream-first{position:relative}
#__uvd_stream_list__ .uvd-card.uvd-stream-first::before{content:'';position:absolute;top:-9px;left:26px;width:16px;height:16px;background:#ffffff;border-left:1px solid rgba(255,159,180,.4);border-top:1px solid rgba(255,159,180,.4);transform:rotate(45deg);z-index:3}
/* Cuộn xuống ẩn header để rộng chỗ, cuộn lên hiện lại (mượt) */
.uvd-panel-content #__uvd_header__{transition:max-height .45s cubic-bezier(.22,1,.36,1),opacity .4s ease,transform .45s cubic-bezier(.22,1,.36,1),margin .45s ease,padding .45s ease}
.uvd-scroll-hide-header #__uvd_header__{max-height:0!important;min-height:0!important;opacity:0!important;overflow:hidden!important;padding-top:0!important;padding-bottom:0!important;margin-top:0!important;margin-bottom:0!important;border-width:0!important;pointer-events:none!important;transform:translateY(-24px)}
/* ===== UNIFIED MAIN SHEET: less floating cards, footer belongs to body ===== */
.uvd-app-shell>.uvd-panel-content{gap:8px}.uvd-app-shell #__uvd_header__,.uvd-app-shell .uvd-context-bar,.uvd-app-shell .uvd-tabbar{margin:0!important}.uvd-app-shell #__uvd_header__{box-shadow:0 4px 13px rgba(247,108,140,.12),0 0 0 1px rgba(255,255,255,.62) inset!important}.uvd-app-shell .uvd-context-bar{box-shadow:0 3px 11px rgba(150,90,220,.1),0 0 0 1px rgba(255,255,255,.55) inset!important}.uvd-app-shell .uvd-tabbar{box-shadow:0 4px 12px rgba(247,108,140,.11),0 0 0 1px rgba(255,255,255,.65) inset!important}.uvd-app-shell .uvd-bubble-wrap{min-height:0;margin:0!important}.uvd-bubble .uvd-profile-footer.uvd-bubble-footer{flex:0 0 auto;margin:8px 6px 0!important;padding:10px 0 3px!important;border-top:1px solid rgba(255,159,180,.22)!important;border-radius:0!important;background:transparent!important;box-shadow:none!important;color:#9a7488!important;font-size:10px!important;line-height:1.45;text-align:center}.uvd-bubble .uvd-profile-footer.uvd-bubble-footer::before{display:none!important}
/* 6 slide tutorial: mỗi slide một thú đeo kính, có nhãn nhận diện rõ ràng. */
@keyframes uvdTutorialSpotlight{0%,100%{opacity:.48;transform:scale(.9) translateY(4px)}50%{opacity:.82;transform:scale(1.08) translateY(-3px)}}@keyframes uvdTutorialBeam{0%,100%{opacity:.28;transform:rotate(-8deg) scaleX(.92)}50%{opacity:.56;transform:rotate(8deg) scaleX(1.08)}}.uvd-tutorial-mascot-stage{position:relative;width:228px;height:206px;display:flex;flex-direction:column;align-items:center;justify-content:center;margin:4px auto 8px;background:transparent!important;border:none!important;box-shadow:none!important;overflow:visible;isolation:isolate}.uvd-tutorial-mascot-stage::before{content:'';position:absolute;z-index:-2;left:20px;right:20px;top:24px;bottom:16px;border-radius:50%;background:radial-gradient(ellipse at center,rgba(255,255,255,.95) 0%,rgba(255,218,238,.55) 42%,rgba(204,178,255,0) 74%);filter:blur(5px);animation:uvdTutorialSpotlight 2.4s ease-in-out infinite}.uvd-tutorial-mascot-stage::after{content:'';position:absolute;z-index:-1;width:142px;height:188px;top:4px;background:linear-gradient(90deg,transparent 0%,rgba(255,255,255,.68) 42%,rgba(255,218,239,.3) 58%,transparent 100%);clip-path:polygon(38% 0,62% 0,100% 100%,0 100%);filter:blur(2px);animation:uvdTutorialBeam 2.8s ease-in-out infinite}.uvd-tutorial-mascot-art{width:176px;height:184px;line-height:0;filter:drop-shadow(0 12px 16px rgba(247,108,140,.22));animation:uvdMascotHop 1.9s ease-in-out infinite}.uvd-tutorial-mascot-art svg{width:100%;height:100%;display:block;animation:uvdMascotWiggle 1.45s ease-in-out infinite}.uvd-tutorial-mascot-label{position:absolute;bottom:-10px;left:50%;transform:translateX(-50%);margin:0;padding:5px 11px;border-radius:999px;background:linear-gradient(135deg,#fff,#f4e8ff);border:1px solid rgba(194,150,255,.3);box-shadow:0 4px 10px rgba(150,90,220,.12);color:#8a6ab0;font-size:10px;font-weight:900;white-space:nowrap;letter-spacing:.03em}
/* ===== MOBILE COMFORT + HISTORY/SETTINGS POLISH ===== */
.uvd-dig-status-row{display:flex;justify-content:center;gap:6px;flex-wrap:wrap;margin-top:8px}.uvd-dig-status-row span{padding:4px 8px;border-radius:999px;background:rgba(255,255,255,.66);border:1px solid rgba(194,150,255,.24);color:#8a6ab0;font-size:9.5px;font-weight:850}
.uvd-history-toolbar{display:flex;flex-wrap:wrap;align-items:center;gap:7px;margin:0 0 10px;padding:4px 2px}.uvd-history-toolbar-title{font-size:15px;font-weight:900;color:#c95073}.uvd-history-filter-row{display:flex;gap:5px;flex-wrap:wrap;width:100%}.uvd-history-filter{padding:5px 9px;border:1px solid rgba(194,150,255,.28);border-radius:999px;background:rgba(255,255,255,.64);color:#8a6ab0;font-size:10px;font-weight:800;cursor:pointer}.uvd-history-filter-active{background:linear-gradient(135deg,#ff9fb4,#b385f2);border-color:transparent;color:#fff}.uvd-history-sync-chip{margin-left:auto;padding:4px 8px;border-radius:999px;background:rgba(194,150,255,.12);color:#8a6ab0;font-size:9px;font-weight:800}.uvd-history-title-row{display:flex;align-items:center;gap:6px}.uvd-history-title-row strong{flex:1;min-width:0}.uvd-history-star{width:28px;height:28px;border:1px solid rgba(255,159,180,.28);border-radius:10px;background:#fff;color:#d85c7a;font-size:16px;line-height:1;cursor:pointer}.uvd-history-star-on{background:linear-gradient(135deg,#ff9fb4,#f76c8c);color:#fff}.uvd-history-clear{width:100%;margin-top:10px!important;background:rgba(255,93,114,.14)!important;color:#d85c7a!important}.uvd-settings-group-title{display:flex;align-items:center;gap:8px;margin:18px 2px 8px;color:#a05f86;font-size:12px;font-weight:900;letter-spacing:.04em}.uvd-settings-group-title::after{content:'';height:1px;flex:1;background:linear-gradient(90deg,rgba(255,159,180,.34),transparent)}.uvd-settings-tutorial-card{display:flex;align-items:center;gap:10px;padding:12px!important;background:linear-gradient(135deg,rgba(255,239,247,.92),rgba(244,235,255,.9))!important}.uvd-settings-tutorial-card .uvd-settings-tutorial-mascot{width:44px;height:44px;flex:0 0 44px;display:flex;align-items:center;justify-content:center;animation:uvdMascotHop 1.8s ease-in-out infinite}.uvd-settings-tutorial-card .uvd-settings-tutorial-mascot svg{width:100%;height:100%}.uvd-settings-tutorial-card .uvd-btn{margin-left:auto;white-space:nowrap}
@keyframes uvdTutorialSlideRight{from{opacity:0;transform:translateX(28px)}to{opacity:1;transform:translateX(0)}}@keyframes uvdTutorialSlideLeft{from{opacity:0;transform:translateX(-28px)}to{opacity:1;transform:translateX(0)}}.uvd-tutorial-slide-next{animation:uvdTutorialSlideRight .3s cubic-bezier(.22,1,.36,1) both}.uvd-tutorial-slide-prev{animation:uvdTutorialSlideLeft .3s cubic-bezier(.22,1,.36,1) both}.uvd-tutorial-mute{margin-top:7px;border:0;background:transparent;color:#a47ca8;font-size:10px;font-weight:750;text-decoration:underline;cursor:pointer}.uvd-player-tmdb-bar{display:flex;align-items:center;gap:9px;margin-top:10px;padding:8px;border-radius:15px;background:linear-gradient(135deg,rgba(255,255,255,.72),rgba(243,235,255,.8));border:1px solid rgba(194,150,255,.24);text-align:left}.uvd-player-tmdb-loading{display:block;color:#8a6ab0;font-size:10px;font-weight:800}.uvd-player-tmdb-poster{width:43px;height:58px;flex:0 0 43px;overflow:hidden;border-radius:10px;background:#f2e7ff;display:flex;align-items:center;justify-content:center;font-size:18px}.uvd-player-tmdb-poster img{width:100%;height:100%;object-fit:cover}.uvd-player-tmdb-copy{min-width:0;flex:1}.uvd-player-tmdb-logo{display:block;max-width:150px;max-height:27px;object-fit:contain;object-position:left center;margin-bottom:3px}.uvd-player-tmdb-title{overflow:hidden;color:#785382;font-size:12px;font-weight:900;text-overflow:ellipsis;white-space:nowrap}.uvd-player-tmdb-meta{overflow:hidden;color:#8a6ab0;font-size:9.5px;font-weight:800;line-height:1.4;text-overflow:ellipsis;white-space:nowrap}.uvd-player-tmdb-cast{overflow:hidden;margin-top:3px;color:#a0789d;font-size:9px;line-height:1.3;text-overflow:ellipsis;white-space:nowrap}.uvd-resume-overlay{position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;padding:18px;background:rgba(28,14,40,.58);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);animation:uvdFadeIn .24s ease both}.uvd-resume-card{width:min(100%,360px);padding:22px 20px 18px;border-radius:30px;text-align:center;background:linear-gradient(155deg,#fff8fc,#fff0f7 58%,#f4ebff);border:1px solid rgba(255,255,255,.9);box-shadow:0 24px 60px rgba(108,46,92,.35),0 0 0 6px rgba(255,255,255,.24) inset;animation:uvdScaleIn .3s cubic-bezier(.22,1,.36,1) both}.uvd-resume-mascot{width:70px;height:70px;margin:0 auto 2px;animation:uvdMascotHop 1.8s ease-in-out infinite}.uvd-resume-mascot svg{width:100%;height:100%;display:block}.uvd-resume-kicker{font-size:9px;font-weight:900;letter-spacing:.11em;text-transform:uppercase;color:#b68bea}.uvd-resume-title{margin-top:5px;color:#d85c7a;font-size:21px;font-weight:900}.uvd-resume-copy{margin-top:7px;color:#805e83;font-size:12.5px;line-height:1.55}.uvd-resume-copy b{color:#9a6ce0}.uvd-resume-actions{display:grid;grid-template-columns:1fr 1.25fr;gap:8px;margin-top:16px}.uvd-resume-actions button{padding:11px 8px;border-radius:14px;border:1px solid rgba(194,150,255,.28);background:#fff;color:#8a6ab0;font-size:12px;font-weight:850;cursor:pointer}.uvd-resume-actions #__uvd_resume_continue__{border:0;background:linear-gradient(135deg,#ff9fb4,#b385f2);color:#fff;box-shadow:0 6px 14px rgba(247,108,140,.25)}.uvd-history-pager{display:flex;align-items:center;justify-content:center;gap:10px;padding:10px 0 2px;color:#8a6ab0;font-size:10px;font-weight:850}.uvd-history-pager button{width:30px;height:28px;border:1px solid rgba(194,150,255,.28);border-radius:9px;background:#fff;color:#8a6ab0;font-size:15px;font-weight:900;cursor:pointer}.uvd-history-pager button:disabled{opacity:.35;cursor:default}.uvd-card-preview.uvd-thumb-real-preview{height:220px!important;box-shadow:0 10px 22px rgba(247,108,140,.18),0 0 0 2px rgba(255,255,255,.58) inset!important}.uvd-card-preview.uvd-thumb-real-preview.uvd-thumb-portrait{height:285px!important}@media (max-width:560px){.uvd-card-preview.uvd-thumb-real-preview{height:178px!important}.uvd-card-preview.uvd-thumb-real-preview.uvd-thumb-portrait{height:235px!important}}
@media (max-width:560px){.uvd-app-shell{padding:10px!important}.uvd-app-shell>.uvd-panel-content{gap:7px}.uvd-app-shell #__uvd_header__{padding:8px 10px!important;gap:8px!important;border-radius:22px!important}.uvd-brand{gap:6px!important}.uvd-brand-mark,.uvd-brand-mark.uvd-brand-mark-hero{width:62px!important;height:62px!important;flex:0 0 62px!important;transform:none!important}.uvd-brand-name{font-size:17px!important;white-space:nowrap}.uvd-brand-version{font-size:10px!important;white-space:nowrap;margin-top:2px!important}.uvd-header-actions{width:94px!important;min-width:94px!important;max-width:94px!important;flex-basis:94px!important;grid-template-columns:repeat(3,29px)!important;grid-auto-rows:29px!important;gap:3px!important}.uvd-header-actions .uvd-btn-icon{width:29px!important;height:29px!important;font-size:12px!important}.uvd-context-bar{padding:10px!important;border-radius:18px!important}.uvd-context-title{font-size:13px!important}.uvd-context-meta{gap:4px!important;margin-top:7px!important}.uvd-meta-chip{padding:5px 7px!important;font-size:9px!important;max-width:49%!important}.uvd-tabbar{padding:6px!important;gap:3px!important;border-radius:22px!important}.uvd-tab{min-width:0!important;padding:6px 4px 7px!important;gap:2px!important}.uvd-tab-mascot{width:30px!important;height:30px!important}.uvd-tab-text{font-size:9px!important}.uvd-bubble{padding:10px!important;border-radius:22px!important}.uvd-bubble-title{margin-bottom:6px!important}.uvd-bubble-tmascot{width:36px!important;height:36px!important;flex-basis:36px!important}.uvd-bubble-tname{font-size:15px!important}.uvd-app-shell #__uvd_stream_list__{padding:8px!important}.uvd-card{padding:10px!important}.uvd-card-preview{height:122px!important;margin-bottom:9px!important}.uvd-card-preview.uvd-thumb-portrait{height:175px!important}.uvd-history-thumb{flex-basis:82px!important;height:62px!important}.uvd-history-actions .uvd-btn{padding:5px 7px!important;font-size:9px!important}.uvd-profile-footer{font-size:9px!important}.uvd-digging-box{min-height:0!important;padding:22px 18px 18px!important}.uvd-dig-art{transform:scale(.86)!important;margin:-18px auto -28px!important}.uvd-tutorial-mascot-stage{height:180px!important}.uvd-tutorial-mascot-art{width:150px!important;height:158px!important}}
@media (max-height:740px) and (max-width:560px){.uvd-brand-sub{display:none!important}.uvd-card-preview{height:110px!important}.uvd-bubble .uvd-profile-footer.uvd-bubble-footer{padding-top:7px!important}.uvd-context-kicker{display:none}#__uvd_dig_fact_wrap__{display:none!important}}
/* ===== MAIN UI CLEANUP – PHASE 1 =====
   Scoped to the main panel: player, popup and Settings styles remain intact. */
.uvd-main-clean{background:linear-gradient(165deg,#fff9fc 0%,#f9edf8 100%)!important;border:1px solid rgba(255,159,180,.26)!important;box-shadow:0 12px 32px rgba(99,57,99,.16)!important;overflow:hidden!important}.uvd-main-clean .uvd-liquid-bg{display:none!important}.uvd-main-clean>.uvd-panel-content{gap:8px!important;padding:0!important}.uvd-main-clean #__uvd_header__,.uvd-main-clean .uvd-context-bar,.uvd-main-clean .uvd-tabbar,.uvd-main-clean .uvd-bubble,.uvd-main-clean .uvd-card,.uvd-main-clean .uvd-profile-footer{backdrop-filter:none!important;-webkit-backdrop-filter:none!important}.uvd-main-clean #__uvd_header__{margin:0!important;padding:10px 14px!important;background:linear-gradient(135deg,#fff4f9,#ffeaf3)!important;border:1px solid rgba(255,159,180,.28)!important;border-radius:32px!important;box-shadow:0 3px 10px rgba(247,108,140,.1)!important}.uvd-main-clean .uvd-context-bar{margin:0!important;padding:10px 13px!important;background:linear-gradient(135deg,#fbf7ff,#f4efff)!important;border:1px solid rgba(194,150,255,.24)!important;border-radius:19px!important;box-shadow:0 2px 8px rgba(150,90,220,.08)!important}.uvd-main-clean .uvd-tabbar{margin:0!important;padding:6px!important;gap:4px!important;background:rgba(255,255,255,.84)!important;border:1px solid rgba(255,159,180,.24)!important;border-radius:22px!important;box-shadow:0 2px 8px rgba(247,108,140,.08)!important}.uvd-main-clean .uvd-bubble-wrap{margin:0!important;min-height:0}.uvd-main-clean .uvd-bubble{padding:10px!important;background:#fff!important;border:1px solid rgba(255,159,180,.32)!important;border-radius:24px!important;box-shadow:0 6px 18px rgba(247,108,140,.13)!important}.uvd-main-clean .uvd-bubble-title{margin:0 2px 7px!important}.uvd-main-clean #__uvd_stream_list__{padding:8px!important}.uvd-main-clean .uvd-card.uvd-cute{box-shadow:0 5px 14px rgba(247,108,140,.1)!important;border-color:rgba(255,159,180,.26)!important}.uvd-main-clean .uvd-card.uvd-cute:hover{transform:translateY(-1px)!important;box-shadow:0 8px 18px rgba(247,108,140,.16)!important}.uvd-main-clean .uvd-profile-footer.uvd-bubble-footer{background:transparent!important;box-shadow:none!important}.uvd-main-clean .uvd-context-emoji{box-shadow:none!important}.uvd-main-clean .uvd-tab-indicator{box-shadow:0 3px 9px rgba(247,108,140,.24)!important}
@media (max-width:560px){.uvd-main-clean{border-radius:24px!important}.uvd-main-clean #__uvd_header__{padding:8px 10px!important;border-radius:27px!important}.uvd-main-clean .uvd-context-bar{padding:9px 10px!important;border-radius:17px!important}.uvd-main-clean .uvd-tabbar{padding:5px!important;border-radius:19px!important}.uvd-main-clean .uvd-bubble{padding:9px!important;border-radius:20px!important}}

/* ===== SETTINGS CLEANUP – PHASE 2 =====
   Separate from main/player: removes the old glass stack only inside Settings. */
.uvd-settings-clean{background:rgba(35,18,40,.5)!important;backdrop-filter:blur(4px)!important;-webkit-backdrop-filter:blur(4px)!important}.uvd-settings-clean .uvd-settings-sheet:not(.uvd-player-sheet){background:linear-gradient(180deg,#fff9fc 0%,#f8effa 100%)!important;border:1px solid rgba(255,159,180,.28)!important;border-radius:36px 36px 0 0!important;box-shadow:0 -8px 28px rgba(90,48,88,.18)!important;backdrop-filter:none!important;-webkit-backdrop-filter:none!important}.uvd-settings-clean .uvd-settings-hero{min-height:auto!important;padding:16px 18px!important;background:linear-gradient(135deg,#fff0f6,#f4eafe)!important;border-bottom:1px solid rgba(255,159,180,.18)!important}.uvd-settings-clean .uvd-settings-hero-mascot{filter:drop-shadow(0 5px 10px rgba(247,108,140,.18))!important}.uvd-settings-clean .uvd-settings-header{padding:11px 14px!important;background:rgba(255,255,255,.66)!important;border-bottom:1px solid rgba(194,150,255,.18)!important;box-shadow:none!important}.uvd-settings-clean .uvd-settings-body{padding:12px!important;background:transparent!important;backdrop-filter:none!important;-webkit-backdrop-filter:none!important}.uvd-settings-clean .uvd-card,.uvd-settings-clean .uvd-settings-details,.uvd-settings-clean .uvd-profile-card{backdrop-filter:none!important;-webkit-backdrop-filter:none!important;box-shadow:0 4px 12px rgba(150,90,220,.08)!important}.uvd-settings-clean .uvd-card{background:rgba(255,255,255,.72)!important;border:1px solid rgba(194,150,255,.2)!important;border-radius:16px!important}.uvd-settings-clean .uvd-settings-details{margin:8px 0!important;background:rgba(255,255,255,.58)!important;border:1px solid rgba(255,159,180,.22)!important}.uvd-settings-clean .uvd-settings-details>summary{padding:10px 11px!important}.uvd-settings-clean .uvd-settings-group-title{margin:14px 2px 6px!important}.uvd-settings-clean input,.uvd-settings-clean select,.uvd-settings-clean textarea{background:rgba(255,255,255,.7)!important;box-shadow:none!important}.uvd-settings-clean .uvd-settings-tutorial-card{box-shadow:0 3px 10px rgba(247,108,140,.08)!important}.uvd-settings-clean .uvd-profile-card-cute{box-shadow:0 5px 14px rgba(247,108,140,.1)!important}.uvd-settings-clean .uvd-settings-footer-cute{margin:16px 4px 4px!important}.uvd-settings-clean .uvd-settings-footer-mascot{filter:drop-shadow(0 5px 10px rgba(247,108,140,.18))!important}
@media (max-width:560px){.uvd-settings-clean .uvd-settings-sheet:not(.uvd-player-sheet){border-radius:28px 28px 0 0!important}.uvd-settings-clean .uvd-settings-hero{padding:13px 14px!important;gap:10px!important}.uvd-settings-clean .uvd-settings-hero-mascot{width:72px!important;height:72px!important;transform:none!important}.uvd-settings-clean .uvd-settings-hero-title{font-size:18px!important}.uvd-settings-clean .uvd-settings-hero-sub{font-size:11px!important}.uvd-settings-clean .uvd-settings-body{padding:10px!important}.uvd-settings-clean .uvd-card{padding:11px!important}.uvd-settings-clean .uvd-settings-group-title{margin-top:12px!important}}

/* Player card uses the interface-rebuild snapshot above.
   Keep the later pastel menu palette separate from the card itself. */
/* Phase 3.1 – player menu palette and light rounded backdrop. */
.uvd-player-clean-menu{background:linear-gradient(155deg,#fffafd,#f6ecff)!important;border:1px solid rgba(194,150,255,.34)!important;box-shadow:0 12px 28px rgba(111,67,122,.2),0 0 0 1px rgba(255,255,255,.78) inset!important;color:#7a4f89!important}.uvd-player-clean-menu button{background:transparent!important;color:#8a6ab0!important;border-color:rgba(194,150,255,.16)!important}.uvd-player-clean-menu button:hover{background:rgba(255,159,180,.15)!important;color:#c95073!important}.uvd-player-clean-menu .uvd-quality-menu-title{color:#c95073!important;border-bottom-color:rgba(255,159,180,.22)!important}.uvd-player-clean-menu .uvd-quality-option-active{background:linear-gradient(135deg,rgba(255,159,180,.18),rgba(194,150,255,.16))!important;color:#c95073!important}.uvd-player-clean-menu .uvd-quality-menu-back{color:#8a6ab0!important}.uvd-player-clean-menu::before{background:linear-gradient(135deg,#fffafd,#f6ecff)!important;border-color:rgba(194,150,255,.34)!important}

/* ===== PLAYER CARD V2 — soft pastel modal =====
   Scope intentionally stops at card chrome: sheet, header and information panel. */
.uvd-player-card-v2{align-items:center!important;justify-content:center!important;padding:18px!important;background:rgba(74,43,78,.42)!important;backdrop-filter:blur(5px)!important;-webkit-backdrop-filter:blur(5px)!important}
.uvd-player-card-v2.uvd-open{background:radial-gradient(circle at 50% 22%,rgba(255,236,246,.54),rgba(137,99,152,.40) 60%,rgba(59,35,67,.52))!important}
.uvd-player-card-v2 .uvd-player-sheet{width:min(100%,590px)!important;height:min(86dvh,760px)!important;max-height:86dvh!important;margin:auto!important;border:1px solid rgba(255,255,255,.72)!important;border-radius:30px!important;background:linear-gradient(155deg,#fffafd 0%,#fff2f8 56%,#f3ecff 100%)!important;box-shadow:0 22px 58px rgba(74,43,78,.30),0 4px 16px rgba(247,108,140,.16),inset 0 1px 0 rgba(255,255,255,.92)!important;overflow:hidden!important}
.uvd-player-card-v2 .uvd-player-sheet .uvd-settings-header.uvd-player-header{min-height:74px!important;padding:13px 15px!important;background:linear-gradient(135deg,#fff7fb,#ffeaf4)!important;border-bottom:1px solid rgba(255,159,180,.25)!important;box-shadow:0 4px 12px rgba(247,108,140,.08)!important}
.uvd-player-card-v2 .uvd-player-sheet .uvd-player-title-copy strong{background:linear-gradient(105deg,#d85c7a,#b385f2)!important;-webkit-background-clip:text!important;background-clip:text!important;color:transparent!important;text-shadow:none!important}
.uvd-player-card-v2 .uvd-player-sheet .uvd-back-btn,.uvd-player-card-v2 .uvd-player-sheet .uvd-player-menu-btn{background:rgba(255,255,255,.82)!important;border-color:rgba(255,159,180,.28)!important;color:#c95073!important;box-shadow:0 4px 10px rgba(247,108,140,.12)!important}
.uvd-player-card-v2 .uvd-player-sheet .uvd-player-info-panel{padding:13px 15px 15px!important;background:linear-gradient(155deg,#fffafd,#f7efff)!important;border-top:1px solid rgba(194,150,255,.18)!important;border-radius:0!important;box-shadow:none!important}
.uvd-player-card-v2 .uvd-player-sheet .uvd-player-info-meta{background:rgba(255,255,255,.70)!important;border-color:rgba(194,150,255,.24)!important;color:#8a6ab0!important}
.uvd-player-card-v2 .uvd-player-sheet .uvd-player-tmdb-bar{background:rgba(255,255,255,.74)!important;border-color:rgba(194,150,255,.20)!important;box-shadow:none!important}
@media (max-width:560px){.uvd-player-card-v2{padding:10px!important}.uvd-player-card-v2 .uvd-player-sheet{width:100%!important;height:calc(100dvh - 20px)!important;max-height:calc(100dvh - 20px)!important;border-radius:25px!important}.uvd-player-card-v2 .uvd-player-sheet .uvd-settings-header.uvd-player-header{min-height:68px!important;padding:10px 12px!important}.uvd-player-card-v2 .uvd-player-sheet .uvd-player-info-panel{padding:11px 12px 12px!important}}


/* ===== COMMUNITY FEEDBACK — video, iframe and TMDB recognition ===== */
.uvd-feedback-note{margin:8px 0 5px;padding:7px 9px;border:1px solid rgba(194,150,255,.23);border-radius:11px;background:rgba(255,255,255,.62);color:#8a6ab0;font-size:10px;font-weight:700;line-height:1.4;text-align:left}.uvd-popup-feedback{margin:0 0 10px}.uvd-feedback-actions{display:flex;flex-wrap:wrap;gap:5px;margin-top:6px}.uvd-feedback-vote{appearance:none;padding:5px 7px;border:1px solid transparent;border-radius:999px;background:#fff;color:#8a6ab0;font:800 9px/1.15 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;cursor:pointer;transition:transform .14s ease,filter .14s ease}.uvd-feedback-vote:active{transform:scale(.94)}.uvd-feedback-vote:hover{filter:brightness(.98)}.uvd-feedback-vote-up{border-color:rgba(247,108,140,.27);background:rgba(255,225,237,.76);color:#c95073}.uvd-feedback-vote-down{border-color:rgba(194,150,255,.28);background:rgba(242,233,255,.82);color:#7d5ca5}.uvd-plplain-body .uvd-feedback-actions{margin:7px 0 1px}.uvd-iframe-cute-row .uvd-feedback-actions{margin:7px 0 0}.uvd-player-tmdb-copy .uvd-tmdb-feedback{margin:7px 0 5px;padding:6px 7px;font-size:9px}.uvd-player-tmdb-copy .uvd-tmdb-feedback-actions{margin-top:4px}
.uvd-stream-end{display:flex;align-items:center;justify-content:center;gap:9px;margin:14px 3px 5px;padding:11px 14px;border:1px dashed rgba(194,150,255,.34);border-radius:18px;background:linear-gradient(135deg,rgba(255,248,252,.82),rgba(246,238,255,.82));color:#8a6ab0;text-align:left}.uvd-stream-end-animal{display:flex;flex:0 0 42px;width:42px;height:42px;align-items:center;justify-content:center;filter:drop-shadow(0 4px 7px rgba(247,108,140,.18));animation:uvdMascotHop 2s ease-in-out infinite}.uvd-stream-end-animal svg{width:100%;height:100%;display:block}.uvd-stream-end strong{display:block;color:#c95073;font-size:11px;font-weight:900}.uvd-stream-end span:not(.uvd-stream-end-animal){display:block;margin-top:2px;font-size:9.5px;font-weight:700;line-height:1.35}
.uvd-card-learned-junk{opacity:.72!important}.uvd-thumb-play-blocked{pointer-events:none!important;background:rgba(255,235,240,.92)!important;color:#d85c7a!important;border-color:rgba(255,93,114,.35)!important}
/* ===== POPUP SCROLL SAFETY =====
   Short phones must be able to reach both the close button and the final action. */
#__uvd_media_links_prompt__,#__uvd_iframe_workflow_prompt__,#__uvd_play_intro__,#__uvd_resume_prompt__,#__uvd_tutorial__,#__uvd_farewell_popup__,.uvd-digging-overlay{overflow-y:auto!important;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;align-items:flex-start!important}#__uvd_media_links_prompt__>.uvd-glass-panel,#__uvd_iframe_workflow_prompt__>.uvd-glass-panel,#__uvd_play_intro__>div,#__uvd_resume_prompt__>.uvd-resume-card,#__uvd_tutorial__>div,#__uvd_farewell_popup__>.uvd-digging-box,.uvd-digging-overlay>.uvd-digging-box{flex:0 0 auto!important;max-height:calc(100dvh - 24px)!important;margin:auto!important;overflow-y:auto!important;overscroll-behavior:contain;-webkit-overflow-scrolling:touch}.uvd-digging-overlay>.uvd-digging-box,.uvd-farewell-box{min-height:0!important}@media (max-width:560px){#__uvd_media_links_prompt__,#__uvd_iframe_workflow_prompt__,#__uvd_play_intro__,#__uvd_resume_prompt__,#__uvd_tutorial__,#__uvd_farewell_popup__,.uvd-digging-overlay{padding:10px!important}#__uvd_media_links_prompt__>.uvd-glass-panel,#__uvd_iframe_workflow_prompt__>.uvd-glass-panel,#__uvd_play_intro__>div,#__uvd_resume_prompt__>.uvd-resume-card,#__uvd_tutorial__>div,#__uvd_farewell_popup__>.uvd-digging-box,.uvd-digging-overlay>.uvd-digging-box{max-height:calc(100dvh - 20px)!important}}.uvd-digging-overlay.uvd-dig-found #__uvd_dig_fact_wrap__{display:none!important}.uvd-digging-overlay.uvd-dig-found .uvd-dig-action-row{position:sticky;bottom:0;z-index:8;flex-shrink:0;max-height:72px!important;margin-top:16px!important;overflow:visible!important;opacity:1!important}.uvd-digging-overlay.uvd-dig-found #__uvd_dig_enter__{display:block!important;max-height:60px!important;padding:14px 16px!important;opacity:1!important;background:linear-gradient(135deg,#ff91ae,#ef6689)!important}


/* ===== QUICK WATCH + POPUP FRAME PREVIEW ===== */
.uvd-dig-watch-first-btn{display:block;flex:1;min-width:0;max-height:0;margin:0;padding:0;overflow:hidden;opacity:0;border:0;border-radius:16px;background:linear-gradient(135deg,#b385f2,#9a6ce0);color:#fff;font-size:15px;font-weight:850;box-shadow:0 8px 18px rgba(150,90,220,.28);transition:max-height .28s ease,padding .28s ease,opacity .22s ease,transform .18s ease}.uvd-dig-watch-first-btn:active{transform:scale(.97)}.uvd-digging-overlay.uvd-dig-found .uvd-dig-watch-first-btn{max-height:60px;padding:14px 16px;opacity:1}.uvd-plplain-actions{flex:0 0 auto;display:flex;flex-direction:column;align-items:stretch;gap:6px;min-width:112px}.uvd-plplain-actions .uvd-plrow-watch{width:100%;padding:9px 8px!important}.uvd-plrow-preview{width:100%;padding:7px 6px;border:1px solid rgba(194,150,255,.32);border-radius:11px;background:rgba(255,255,255,.72);color:#8a6ab0;font-size:9.5px;font-weight:850;cursor:pointer}.uvd-plrow-preview:active{transform:scale(.97)}.uvd-plrow-preview-box{position:relative;width:112px;height:63px;overflow:hidden;border:1px solid rgba(194,150,255,.28);border-radius:10px;background:linear-gradient(135deg,#f5edff,#ffeaf4);box-shadow:0 3px 9px rgba(150,90,220,.1)}.uvd-plrow-preview-box[hidden]{display:none!important}.uvd-plrow-preview-box .uvd-plrow-thumbimg{display:block;width:100%;height:100%;object-fit:cover}.uvd-plrow-preview-label{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;padding:5px;color:#8a6ab0;font-size:9px;font-weight:800;text-align:center;line-height:1.3}@media (max-width:390px){.uvd-plplain{gap:7px;padding:10px}.uvd-plplain-actions{min-width:94px}.uvd-plrow-preview-box{width:94px;height:53px}.uvd-dig-watch-first-btn{font-size:13px}}


/* ===== DIGGING POPUP REDESIGN ===== */
.uvd-digging-overlay{padding:16px!important;background:radial-gradient(circle at 50% 14%,rgba(255,230,242,.72),rgba(103,58,108,.48) 58%,rgba(39,24,49,.66))!important;backdrop-filter:blur(5px)!important;-webkit-backdrop-filter:blur(5px)!important}.uvd-digging-box{width:min(100%,480px)!important;min-height:610px!important;max-height:calc(100dvh - 32px)!important;justify-content:flex-start!important;gap:0!important;padding:20px 22px 20px!important;border:1px solid rgba(255,255,255,.88)!important;border-radius:32px!important;background:linear-gradient(160deg,#fffafd 0%,#fff0f6 54%,#f1e9ff 100%)!important;box-shadow:0 26px 64px rgba(65,32,70,.34),0 0 0 5px rgba(255,255,255,.22) inset!important}.uvd-dig-topline{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:1px 45px 0 2px}.uvd-dig-brand{color:#c95073;font-size:10px;font-weight:950;letter-spacing:.1em;text-transform:uppercase}.uvd-dig-mode{padding:4px 8px;border:1px solid rgba(194,150,255,.24);border-radius:999px;background:rgba(255,255,255,.68);color:#8a6ab0;font-size:9px;font-weight:850}.uvd-dig-close{top:13px!important;right:13px!important;width:34px!important;height:34px!important;border-color:rgba(255,159,180,.28)!important;background:rgba(255,255,255,.84)!important;color:#c95073!important;box-shadow:0 4px 12px rgba(247,108,140,.13)!important}.uvd-dig-art{width:270px!important;height:244px!important;margin:0 auto -9px!important;transform:none!important;filter:drop-shadow(0 11px 14px rgba(247,108,140,.2))!important}.uvd-dig-title{margin-top:4px!important;color:#c95073!important;font-size:25px!important;letter-spacing:-.03em}.uvd-dig-sub{min-height:0!important;margin-top:7px!important;max-width:330px;color:#805e83!important;font-size:12.5px!important}.uvd-dig-status-row{justify-content:center!important;gap:6px!important;margin-top:11px!important}.uvd-dig-status-row span{padding:5px 9px!important;border:1px solid rgba(194,150,255,.22)!important;border-radius:999px!important;background:rgba(255,255,255,.67)!important;color:#8a6ab0!important;font-size:9.5px!important;font-weight:850!important}.uvd-dig-action-row{display:grid!important;grid-template-columns:1fr 1fr;gap:8px!important}.uvd-dig-watch-first-btn,.uvd-dig-enter-btn{border-radius:14px!important;font-size:13px!important;box-shadow:0 7px 15px rgba(150,90,220,.18)!important}.uvd-dig-watch-first-btn{background:linear-gradient(135deg,#b385f2,#9a6ce0)!important}.uvd-dig-enter-btn{background:linear-gradient(135deg,#ff9fb4,#ef6689)!important}.uvd-dig-route-hint{max-height:42px!important;margin-top:8px!important;color:#9a6ce0!important;font-size:10px!important}.uvd-dig-utility-row{margin-top:8px!important}.uvd-dig-ui-btn{padding:8px 10px!important;border-radius:12px!important;background:rgba(255,255,255,.62)!important;border-color:rgba(194,150,255,.25)!important;color:#8a6ab0!important;font-size:10px!important;box-shadow:none!important}.uvd-dig-help{margin-top:10px;color:#9a6ce0;font-size:10.5px}.uvd-dig-help button{color:#c95073!important}.uvd-dig-tip{margin-top:9px;color:#a47ca8;font-size:9px;line-height:1.4}.uvd-digging-overlay.uvd-dig-found .uvd-dig-art{width:205px!important;height:184px!important;margin:0 auto -7px!important}.uvd-digging-overlay.uvd-dig-found .uvd-dig-title{font-size:23px!important;color:#9a6ce0!important}.uvd-digging-overlay.uvd-dig-found .uvd-dig-action-row{max-height:72px!important;margin-top:13px!important}.uvd-digging-overlay.uvd-dig-found .uvd-dig-watch-first-btn,.uvd-digging-overlay.uvd-dig-found .uvd-dig-enter-btn{max-height:60px!important;padding:13px 8px!important}.uvd-digging-overlay.uvd-dig-found .uvd-dig-route-hint{opacity:1!important}.uvd-digging-overlay.uvd-dig-found .uvd-dig-tip{display:none!important}@media (max-width:390px){.uvd-digging-box{min-height:560px!important;padding:16px 16px 17px!important;border-radius:27px!important}.uvd-dig-art{width:220px!important;height:198px!important}.uvd-dig-title{font-size:22px!important}.uvd-dig-sub{font-size:11.5px!important}.uvd-digging-overlay.uvd-dig-found .uvd-dig-art{width:166px!important;height:149px!important}.uvd-dig-watch-first-btn,.uvd-dig-enter-btn{font-size:11.5px!important}}


/* ===== VIDEO POPUP CHOICE LIST ===== */
#__uvd_media_links_prompt__ .uvd-media-choice-popup{max-width:560px!important}#__uvd_media_links_prompt__ .uvd-plplain{display:grid!important;grid-template-columns:minmax(0,1fr) 112px!important;align-items:start!important;gap:10px!important;padding:12px!important}#__uvd_media_links_prompt__ .uvd-plplain-body{min-width:0!important;padding-right:0!important}#__uvd_media_links_prompt__ .uvd-plplain-body::before{display:none!important}#__uvd_media_links_prompt__ .uvd-plplain-url{width:100%!important;min-width:0!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important;word-break:normal!important;padding:7px 9px!important;border-radius:11px!important;font-size:10.5px!important;letter-spacing:.01em}#__uvd_media_links_prompt__ .uvd-plplain-actions{width:112px!important;min-width:112px!important}#__uvd_media_links_prompt__ .uvd-plplain-note{line-height:1.35!important}@media (max-width:390px){#__uvd_media_links_prompt__ .uvd-plplain{grid-template-columns:minmax(0,1fr) 94px!important;gap:7px!important}#__uvd_media_links_prompt__ .uvd-plplain-actions{width:94px!important;min-width:94px!important}#__uvd_media_links_prompt__ .uvd-plplain-url{font-size:9.5px!important;padding:6px 7px!important}}


/* ===== LARGE VIDEO LINK PREVIEW ===== */
.uvd-media-preview-overlay{position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(38,22,48,.78);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);overflow-y:auto}.uvd-media-preview-panel{position:relative;width:min(100%,680px);max-height:calc(100dvh - 32px);margin:auto;overflow-y:auto;padding:20px;border:1px solid rgba(255,255,255,.82);border-radius:28px;background:linear-gradient(155deg,#fffafd,#fff0f7 54%,#f1e9ff);box-shadow:0 26px 68px rgba(65,32,70,.38),0 0 0 5px rgba(255,255,255,.18) inset;text-align:left}.uvd-media-preview-close{position:absolute;top:12px;right:12px;width:34px;height:34px;border:1px solid rgba(255,159,180,.3);border-radius:50%;background:rgba(255,255,255,.82);color:#c95073;font-size:17px;cursor:pointer}.uvd-media-preview-kicker{padding-right:42px;color:#b385f2;font-size:9px;font-weight:950;letter-spacing:.11em}.uvd-media-preview-title{margin-top:4px;color:#c95073;font-size:17px;font-weight:900}.uvd-media-preview-url{margin-top:8px;overflow:hidden;padding:7px 9px;border:1px solid rgba(194,150,255,.24);border-radius:11px;background:rgba(255,255,255,.64);color:#8a6ab0;font-size:10px;font-weight:750;white-space:nowrap;text-overflow:ellipsis}.uvd-media-preview-stage{position:relative;display:flex;align-items:center;justify-content:center;width:100%;min-height:180px;margin-top:12px;overflow:hidden;border:1px solid rgba(255,159,180,.28);border-radius:18px;background:linear-gradient(135deg,#f2e5ff,#ffdfea);color:#8a6ab0;font-size:11px;font-weight:800;aspect-ratio:16/9}.uvd-media-preview-stage img{display:block;width:100%;height:100%;object-fit:cover}.uvd-media-preview-scenes{margin-top:13px}.uvd-media-preview-scenes>strong{display:block;margin:0 0 7px 2px;color:#8a6ab0;font-size:11px}.uvd-media-preview-strip{display:flex;gap:7px;overflow-x:auto;padding-bottom:3px}.uvd-media-preview-scene{position:relative;flex:0 0 112px;height:63px;overflow:hidden;padding:0;border:1px solid rgba(194,150,255,.28);border-radius:10px;background:#f5edff;cursor:pointer}.uvd-media-preview-scene img{width:100%;height:100%;object-fit:cover}.uvd-media-preview-scene span{position:absolute;right:4px;bottom:3px;padding:2px 4px;border-radius:6px;background:rgba(48,27,58,.62);color:#fff;font-size:8px;font-weight:850}.uvd-media-preview-actions{display:grid;grid-template-columns:1.2fr .8fr;gap:8px;margin-top:15px}.uvd-media-preview-actions button{padding:11px 9px;border:1px solid rgba(194,150,255,.28);border-radius:13px;background:#fff;color:#8a6ab0;font-size:12px;font-weight:850;cursor:pointer}.uvd-media-preview-actions .uvd-media-preview-play{border:0;background:linear-gradient(135deg,#ff9fb4,#b385f2);color:#fff;box-shadow:0 7px 15px rgba(247,108,140,.22)}@media (max-width:420px){.uvd-media-preview-overlay{padding:10px}.uvd-media-preview-panel{padding:16px;border-radius:23px}.uvd-media-preview-stage{min-height:150px}.uvd-media-preview-scene{flex-basis:94px;height:53px}.uvd-media-preview-actions{grid-template-columns:1fr;gap:7px}}


/* ===== IFRAME PARENT-CONTEXT PROBE ===== */
.uvd-iframe-probe-actions{flex:0 0 auto;display:flex;flex-direction:column;gap:6px;min-width:126px}.uvd-iframe-probe-btn{padding:8px 7px;border:1px solid rgba(194,150,255,.3);border-radius:11px;background:rgba(255,255,255,.76);color:#8a6ab0;font-size:9.5px;font-weight:850;cursor:pointer}.uvd-iframe-probe-btn:active{transform:scale(.97)}@media (max-width:390px){.uvd-iframe-probe-actions{min-width:105px}.uvd-iframe-probe-btn{font-size:8.5px;padding:7px 5px}}


/* ===== PREVIEW SCENE GALLERY ===== */
.uvd-media-preview-stage .uvd-media-preview-format{position:absolute;top:9px;left:9px;padding:4px 7px;border:1px solid rgba(255,255,255,.52);border-radius:999px;background:rgba(48,27,58,.5);color:#fff;font-size:9px;font-weight:900;letter-spacing:.07em}.uvd-media-preview-stage-play{position:absolute;left:50%;top:50%;width:52px;height:52px;padding:0;border:1px solid rgba(255,255,255,.75);border-radius:50%;background:rgba(255,255,255,.9);color:#d85c7a;font-size:21px;line-height:1;transform:translate(-50%,-50%);box-shadow:0 8px 18px rgba(65,32,70,.22);cursor:pointer}.uvd-media-preview-scenes{margin-top:13px}.uvd-media-preview-strip{display:flex!important;align-items:center!important;gap:7px!important;overflow-x:auto!important;overflow-y:hidden!important;padding:0 0 5px!important;scrollbar-width:none}.uvd-media-preview-strip::-webkit-scrollbar{display:none}.uvd-media-preview-strip .uvd-thumb-strip-label{align-self:stretch;justify-content:center}.uvd-media-preview-strip .uvd-extra-thumb{flex:0 0 96px!important;height:60px!important;border-color:rgba(194,150,255,.28)!important;background:#f5edff!important}.uvd-media-preview-strip .uvd-extra-thumb img{width:100%;height:100%;object-fit:cover}@media (max-width:420px){.uvd-media-preview-strip .uvd-extra-thumb{flex-basis:82px!important;height:52px!important}}


/* ===== MINIMAL POPUP CONTROLS ===== */
.uvd-popup-back-btn{position:absolute;left:13px;top:13px;z-index:4;width:34px;height:34px;padding:0;border:1px solid rgba(194,150,255,.28);border-radius:50%;background:rgba(255,255,255,.82);color:#8a6ab0;font-size:19px;line-height:1;cursor:pointer;box-shadow:0 3px 10px rgba(150,90,220,.1)}.uvd-popup-back-btn:active{transform:scale(.94)}.uvd-digging-box .uvd-dig-art{margin-top:14px!important}


/* ===== CONTENT-AWARE POPUP EXPANSION ===== */
.uvd-auto-fit-popup{transition:height .38s cubic-bezier(.22,1,.36,1),max-height .38s cubic-bezier(.22,1,.36,1);overscroll-behavior:contain;-webkit-overflow-scrolling:touch}

/* ===== CANONICAL DIGGING POPUP: FIRST-SCREEN EXPERIENCE ===== */
/* This is deliberately scoped to the first popup so it cannot disturb Main UI,
   media list, iframe flow, farewell, or the compact preview card. */
#__uvd_digging_popup__{
  align-items:center!important;
  justify-content:center!important;
  padding:12px!important;
  overflow:hidden!important;
  background:radial-gradient(circle at 50% 8%,rgba(255,232,244,.88),rgba(128,82,145,.52) 52%,rgba(40,24,53,.73))!important
}
#__uvd_digging_popup__>.uvd-digging-box{
  box-sizing:border-box!important;
  width:min(94vw,680px)!important;
  height:90vh!important;
  height:min(90dvh,800px)!important;
  min-height:0!important;
  max-height:calc(100dvh - 24px)!important;
  margin:auto!important;
  padding:0!important;
  display:block!important;
  overflow-x:hidden!important;
  overflow-y:auto!important;
  overscroll-behavior:contain!important;
  border:1px solid rgba(255,255,255,.9)!important;
  border-radius:34px!important;
  background:linear-gradient(160deg,#fffdfd 0%,#fff0f6 48%,#f1eaff 100%)!important;
  box-shadow:0 28px 76px rgba(49,25,64,.46),0 0 0 6px rgba(255,255,255,.22) inset!important;
  text-align:center!important
}
#__uvd_digging_popup__>.uvd-digging-box::-webkit-scrollbar{width:6px}
#__uvd_digging_popup__>.uvd-digging-box::-webkit-scrollbar-thumb{border-radius:99px;background:rgba(179,133,242,.4)}
#__uvd_digging_popup__ .uvd-dig-layout{
  box-sizing:border-box;
  min-height:100%;
  padding:18px 28px 20px;
  display:flex;
  flex-direction:column;
  align-items:stretch
}
#__uvd_digging_popup__ .uvd-popup-back-btn,
#__uvd_digging_popup__ .uvd-dig-close{
  position:absolute!important;
  top:14px!important;
  z-index:6!important;
  width:36px!important;
  height:36px!important;
  padding:0!important;
  border-radius:50%!important;
  background:rgba(255,255,255,.88)!important;
  backdrop-filter:blur(7px);
  -webkit-backdrop-filter:blur(7px);
  box-shadow:0 5px 14px rgba(127,76,139,.14)!important
}
#__uvd_digging_popup__ .uvd-popup-back-btn{left:14px!important;color:#8a6ab0!important;border:1px solid rgba(194,150,255,.32)!important}
#__uvd_digging_popup__ .uvd-dig-close{right:14px!important;color:#c95073!important;border:1px solid rgba(255,159,180,.32)!important}
#__uvd_digging_popup__ .uvd-dig-hero{
  position:relative;
  isolation:isolate;
  flex:1 1 248px;
  min-height:216px;
  display:flex;
  align-items:center;
  justify-content:center;
  overflow:hidden;
  padding:28px 24px 23px
}
#__uvd_digging_popup__ .uvd-dig-hero::before{
  content:'';
  position:absolute;
  z-index:-2;
  width:min(75vw,340px);
  aspect-ratio:1;
  border-radius:50%;
  background:radial-gradient(circle at 48% 42%,rgba(255,255,255,.96) 0 19%,rgba(255,218,236,.67) 45%,rgba(222,202,255,.13) 70%,transparent 72%);
  filter:blur(1px)
}
#__uvd_digging_popup__ .uvd-dig-glow{
  position:absolute;
  z-index:-1;
  border-radius:50%;
  pointer-events:none;
  animation:uvdDigGlowDrift 4s ease-in-out infinite
}
#__uvd_digging_popup__ .uvd-dig-glow-one{width:14px;height:14px;top:28%;left:13%;background:#ffc1d5;box-shadow:0 0 0 7px rgba(255,193,213,.16)}
#__uvd_digging_popup__ .uvd-dig-glow-two{width:10px;height:10px;top:18%;right:14%;background:#cdb1ff;box-shadow:0 0 0 6px rgba(205,177,255,.16);animation-delay:-1.4s}
#__uvd_digging_popup__ .uvd-dig-art{
  position:relative!important;
  z-index:1;
  box-sizing:border-box;
  width:min(70vw,286px)!important;
  height:auto!important;
  aspect-ratio:260/250;
  margin:0!important;
  transform:none!important;
  filter:drop-shadow(0 14px 18px rgba(220,104,151,.24))!important
}
#__uvd_digging_popup__ .uvd-dig-art svg{width:100%!important;height:100%!important}
#__uvd_digging_popup__ .uvd-dig-live-line{
  position:absolute;
  z-index:2;
  bottom:4px;
  left:50%;
  display:flex;
  align-items:center;
  justify-content:center;
  gap:7px;
  max-width:calc(100% - 22px);
  padding:6px 11px;
  border:1px solid rgba(255,255,255,.8);
  border-radius:999px;
  background:rgba(255,255,255,.72);
  color:#936c9c;
  font-size:10px;
  font-weight:800;
  line-height:1.25;
  box-shadow:0 5px 14px rgba(150,90,220,.1);
  transform:translateX(-50%)
}
#__uvd_digging_popup__ .uvd-dig-live-line i{
  width:7px;
  height:7px;
  flex:0 0 7px;
  border-radius:50%;
  background:#ff86a7;
  box-shadow:0 0 0 4px rgba(255,134,167,.16);
  animation:uvdDigLivePulse 1.3s ease-in-out infinite
}
#__uvd_digging_popup__ .uvd-dig-copy{flex:0 0 auto;padding:0 7px;text-align:center}
#__uvd_digging_popup__ .uvd-dig-kicker{
  margin:0!important;
  color:#aa7ac5!important;
  font-size:10px!important;
  font-weight:950!important;
  letter-spacing:.15em!important
}
#__uvd_digging_popup__ .uvd-dig-title{
  margin:7px 0 0!important;
  color:#c95073!important;
  font-size:29px!important;
  font-weight:950!important;
  letter-spacing:-.045em!important;
  line-height:1.1!important
}
#__uvd_digging_popup__ .uvd-dig-sub{
  min-height:0!important;
  max-width:470px!important;
  margin:9px auto 0!important;
  color:#775c80!important;
  font-size:14px!important;
  font-weight:650!important;
  line-height:1.48!important
}
#__uvd_digging_popup__ .uvd-dig-status-row{
  display:flex!important;
  justify-content:center!important;
  gap:7px!important;
  margin:13px 0 0!important
}
#__uvd_digging_popup__ .uvd-dig-status-row span{
  padding:7px 11px!important;
  border:1px solid rgba(194,150,255,.27)!important;
  border-radius:999px!important;
  background:rgba(255,255,255,.76)!important;
  color:#8a6ab0!important;
  font-size:11px!important;
  font-weight:850!important;
  box-shadow:0 3px 9px rgba(150,90,220,.07)
}
#__uvd_digging_popup__ .uvd-dig-actions-area{flex:0 0 auto;min-height:0;padding:0 7px}
#__uvd_digging_popup__ .uvd-dig-action-row{
  position:static!important;
  display:grid!important;
  grid-template-columns:1fr 1fr;
  gap:10px!important;
  margin:0!important;
  max-height:0;
  overflow:hidden!important;
  opacity:0;
  transition:max-height .3s ease,margin .3s ease,opacity .25s ease
}
#__uvd_digging_popup__.uvd-dig-found .uvd-dig-action-row{
  max-height:68px!important;
  margin-top:18px!important;
  overflow:visible!important;
  opacity:1!important
}
#__uvd_digging_popup__ .uvd-dig-action-row.uvd-dig-one-action{grid-template-columns:1fr}
#__uvd_digging_popup__ .uvd-dig-watch-first-btn,
#__uvd_digging_popup__ .uvd-dig-enter-btn{
  min-height:56px;
  max-height:60px!important;
  padding:13px 12px!important;
  border-radius:16px!important;
  font-size:14px!important;
  font-weight:900!important;
  letter-spacing:.01em;
  box-shadow:0 9px 18px rgba(150,90,220,.19)!important
}
#__uvd_digging_popup__ .uvd-dig-watch-first-btn{background:linear-gradient(135deg,#b98df2,#9668d9)!important}
#__uvd_digging_popup__ .uvd-dig-enter-btn{background:linear-gradient(135deg,#ff9ab4,#ef6689)!important}
#__uvd_digging_popup__ .uvd-dig-route-hint{
  max-height:44px!important;
  margin:8px auto 0!important;
  color:#916ca4!important;
  font-size:11px!important;
  font-weight:700!important;
  line-height:1.35!important
}
#__uvd_digging_popup__ .uvd-dig-footer{
  flex:0 0 auto;
  margin-top:auto;
  padding:15px 7px 0;
  border-top:1px solid rgba(194,150,255,.16)
}
#__uvd_digging_popup__ .uvd-dig-utility-row{margin:0!important}
#__uvd_digging_popup__ .uvd-dig-ui-btn{
  width:100%;
  padding:10px 12px!important;
  border:1px solid rgba(194,150,255,.3)!important;
  border-radius:14px!important;
  background:rgba(255,255,255,.68)!important;
  color:#8666a2!important;
  font-size:11px!important;
  font-weight:850!important
}
#__uvd_digging_popup__ .uvd-dig-help{margin:10px 0 0!important;color:#9974a5!important;font-size:10.5px!important}
#__uvd_digging_popup__ .uvd-dig-help button{
  padding:0!important;
  border:0!important;
  background:transparent!important;
  color:#cf6687!important;
  font:inherit!important;
  font-weight:900!important;
  text-decoration:underline;
  cursor:pointer
}
#__uvd_digging_popup__ #__uvd_dig_fact_wrap__{margin-top:12px!important;text-align:center}
#__uvd_digging_popup__ #__uvd_dig_fact_btn__{
  max-width:100%;
  padding:8px 12px!important;
  border:1px dashed rgba(255,159,180,.46)!important;
  border-radius:999px!important;
  background:linear-gradient(135deg,#fff6fb,#f8efff)!important;
  color:#c95073!important;
  font-size:10.5px!important;
  font-weight:800!important;
  cursor:pointer
}
#__uvd_digging_popup__ #__uvd_dig_fact_box__{
  position:relative;
  margin-top:9px!important;
  padding:11px 30px 11px 12px!important;
  border:1px solid rgba(255,159,180,.25)!important;
  border-radius:14px!important;
  background:rgba(255,255,255,.7)!important;
  color:#765a84!important;
  font-size:11.5px!important;
  line-height:1.45!important;
  text-align:left!important
}
#__uvd_digging_popup__ #__uvd_dig_fact_box__>div:first-child{position:absolute;right:10px;top:8px}
#__uvd_digging_popup__ .uvd-dig-tip{margin:10px auto 0!important;color:#9c7fa8!important;font-size:10px!important;line-height:1.4!important}
#__uvd_digging_popup__.uvd-dig-found .uvd-dig-title{color:#9368c8!important}
#__uvd_digging_popup__.uvd-dig-found .uvd-dig-live-line i{background:#a47cea;box-shadow:0 0 0 4px rgba(164,124,234,.15);animation:none}
#__uvd_digging_popup__.uvd-dig-found .uvd-dig-tip{display:none!important}
#__uvd_digging_popup__.uvd-dig-found .uvd-dig-art{width:min(62vw,244px)!important}
@keyframes uvdDigGlowDrift{0%,100%{transform:translateY(0) scale(.92);opacity:.5}50%{transform:translateY(-10px) scale(1.1);opacity:1}}
@keyframes uvdDigLivePulse{0%,100%{transform:scale(.82);opacity:.6}50%{transform:scale(1.12);opacity:1}}
@media (max-width:560px){
  #__uvd_digging_popup__{padding:10px!important}
  #__uvd_digging_popup__>.uvd-digging-box{width:calc(100vw - 20px)!important;height:calc(100dvh - 20px)!important;max-height:calc(100dvh - 20px)!important;border-radius:29px!important}
  #__uvd_digging_popup__ .uvd-dig-layout{padding:16px 18px 17px}
  #__uvd_digging_popup__ .uvd-dig-hero{flex-basis:220px;min-height:195px;padding:30px 16px 22px}
  #__uvd_digging_popup__ .uvd-dig-title{font-size:26px!important}
  #__uvd_digging_popup__ .uvd-dig-sub{font-size:13px!important}
  #__uvd_digging_popup__ .uvd-dig-footer{padding-top:12px}
}
@media (max-height:650px) and (max-width:560px){
  #__uvd_digging_popup__ .uvd-dig-hero{flex-basis:184px;min-height:174px;padding-top:24px}
  #__uvd_digging_popup__ .uvd-dig-art{width:min(57vw,224px)!important}
  #__uvd_digging_popup__ .uvd-dig-title{font-size:23px!important}
  #__uvd_digging_popup__ .uvd-dig-status-row{margin-top:9px!important}
  #__uvd_digging_popup__ .uvd-dig-footer{padding-top:9px}
}
@media (prefers-reduced-motion:reduce){
  #__uvd_digging_popup__ .uvd-dig-glow,
  #__uvd_digging_popup__ .uvd-dig-live-line i{animation:none!important}
}

/* ===== POPUP DESIGN SYSTEM: VIDEO, IFRAME, FAREWELL & COMPACT TOOLS ===== */
/* Large workflow surfaces share one reliable frame.  Their content regions,
   rather than magic margins, are the only portions that scroll. */
#__uvd_media_links_prompt__,#__uvd_iframe_workflow_prompt__,#__uvd_farewell_popup__{
  align-items:center!important;
  justify-content:center!important;
  padding:12px!important;
  overflow:hidden!important;
  background:radial-gradient(circle at 50% 9%,rgba(255,229,242,.78),rgba(103,66,128,.56) 52%,rgba(38,23,51,.76))!important
}
#__uvd_media_links_prompt__>.uvd-glass-panel,
#__uvd_iframe_workflow_prompt__>.uvd-glass-panel{
  box-sizing:border-box!important;
  width:min(94vw,680px)!important;
  height:90vh!important;
  height:min(90dvh,800px)!important;
  min-height:0!important;
  max-height:calc(100dvh - 24px)!important;
  margin:auto!important;
  display:flex!important;
  flex-direction:column!important;
  overflow:hidden!important;
  border-radius:34px!important;
  background:linear-gradient(160deg,#fffdfd 0%,#fff0f7 48%,#f1eaff 100%)!important;
  box-shadow:0 28px 76px rgba(49,25,64,.46),0 0 0 6px rgba(255,255,255,.22) inset!important
}
#__uvd_media_links_prompt__ .uvd-workflow-hero,
#__uvd_iframe_workflow_prompt__ .uvd-workflow-hero{
  position:relative;
  isolation:isolate;
  flex:0 0 232px;
  display:flex;
  flex-direction:column;
  align-items:center;
  justify-content:center;
  overflow:hidden;
  padding:25px 26px 18px;
  background:radial-gradient(ellipse at 50% 26%,rgba(255,255,255,.92),rgba(255,219,238,.5) 46%,rgba(231,215,255,.18) 72%,transparent 73%)
}
#__uvd_media_links_prompt__ .uvd-workflow-hero::before,
#__uvd_iframe_workflow_prompt__ .uvd-workflow-hero::before{
  content:'';
  position:absolute;
  z-index:-1;
  width:280px;
  height:280px;
  border-radius:50%;
  background:radial-gradient(circle,rgba(255,255,255,.67),rgba(255,194,221,.18) 58%,transparent 70%);
  transform:translateY(-16px)
}
#__uvd_iframe_workflow_prompt__ .uvd-workflow-hero{background:radial-gradient(ellipse at 50% 26%,rgba(255,255,255,.92),rgba(255,224,235,.53) 46%,rgba(250,208,222,.18) 72%,transparent 73%)}
#__uvd_media_links_prompt__ .uvd-media-popup-mascot,
#__uvd_iframe_workflow_prompt__ .uvd-iframe-popup-mascot{
  width:158px!important;
  height:144px!important;
  margin:0 0 3px!important;
  line-height:0;
  transform:none!important;
  filter:drop-shadow(0 12px 16px rgba(247,108,140,.22));
  animation:uvdMascotHop 1.8s ease-in-out infinite!important
}
#__uvd_media_links_prompt__ .uvd-media-popup-mascot svg,
#__uvd_iframe_workflow_prompt__ .uvd-iframe-popup-mascot svg{animation:uvdMascotWiggle 1.45s ease-in-out infinite!important}
#__uvd_media_links_prompt__ .uvd-workflow-kicker,
#__uvd_iframe_workflow_prompt__ .uvd-workflow-kicker{
  color:#a776c3;
  font-size:10px;
  font-weight:950;
  letter-spacing:.14em;
  line-height:1.2
}
#__uvd_iframe_workflow_prompt__ .uvd-workflow-kicker{color:#cd7893}
#__uvd_media_links_prompt__ .uvd-popup-back-btn,
#__uvd_iframe_workflow_prompt__ .uvd-popup-back-btn,
#__uvd_media_links_prompt__ .uvd-workflow-close,
#__uvd_iframe_workflow_prompt__ .uvd-workflow-close{
  position:absolute!important;
  top:14px!important;
  z-index:5;
  width:36px!important;
  height:36px!important;
  padding:0!important;
  border-radius:50%!important;
  background:rgba(255,255,255,.88)!important;
  box-shadow:0 5px 14px rgba(127,76,139,.14)!important;
  cursor:pointer
}
#__uvd_media_links_prompt__ .uvd-popup-back-btn,
#__uvd_iframe_workflow_prompt__ .uvd-popup-back-btn{left:14px!important;border:1px solid rgba(194,150,255,.32)!important;color:#8a6ab0!important}
#__uvd_media_links_prompt__ .uvd-workflow-close,
#__uvd_iframe_workflow_prompt__ .uvd-workflow-close{right:14px!important;border:1px solid rgba(255,159,180,.32)!important;color:#c95073!important;font-size:17px!important;line-height:1}
#__uvd_media_links_prompt__ .uvd-workflow-body,
#__uvd_iframe_workflow_prompt__ .uvd-workflow-body{
  box-sizing:border-box;
  flex:1 1 auto;
  min-height:0;
  display:flex;
  flex-direction:column;
  padding:4px 28px 22px;
  text-align:center
}
#__uvd_media_links_prompt__ .uvd-workflow-title,
#__uvd_iframe_workflow_prompt__ .uvd-workflow-title{
  color:#8e67bd;
  font-size:23px;
  font-weight:950;
  letter-spacing:-.035em;
  line-height:1.13
}
#__uvd_iframe_workflow_prompt__ .uvd-workflow-title{color:#c95073}
#__uvd_media_links_prompt__ .uvd-workflow-copy,
#__uvd_iframe_workflow_prompt__ .uvd-workflow-copy{
  max-width:500px;
  margin:7px auto 11px;
  color:#765d83;
  font-size:13px;
  font-weight:650;
  line-height:1.5
}
#__uvd_media_links_prompt__ .uvd-workflow-copy b{color:#9568c0}
#__uvd_iframe_workflow_prompt__ .uvd-workflow-copy{color:#926276}
#__uvd_iframe_workflow_prompt__ .uvd-workflow-copy b{color:#cf6687}
#__uvd_media_links_prompt__ .uvd-popup-feedback,
#__uvd_iframe_workflow_prompt__ .uvd-popup-feedback{margin:0 0 10px!important;text-align:left}
#__uvd_media_links_prompt__ .uvd-workflow-list,
#__uvd_iframe_workflow_prompt__ .uvd-workflow-list{
  flex:1 1 auto;
  min-height:0;
  max-height:none!important;
  margin:0 0 13px!important;
  padding:2px 3px 1px;
  overflow-y:auto!important;
  overscroll-behavior:contain;
  text-align:left
}
#__uvd_media_links_prompt__ .uvd-workflow-list::-webkit-scrollbar,
#__uvd_iframe_workflow_prompt__ .uvd-workflow-list::-webkit-scrollbar{width:6px}
#__uvd_media_links_prompt__ .uvd-workflow-list::-webkit-scrollbar-thumb,
#__uvd_iframe_workflow_prompt__ .uvd-workflow-list::-webkit-scrollbar-thumb{border-radius:99px;background:rgba(179,133,242,.38)}
#__uvd_media_links_prompt__ .uvd-plplain,
#__uvd_iframe_workflow_prompt__ .uvd-iframe-cute-row{
  box-sizing:border-box;
  min-height:104px;
  margin:0 0 10px!important;
  padding:13px!important;
  border:1px solid rgba(194,150,255,.27)!important;
  border-radius:18px!important;
  background:linear-gradient(145deg,rgba(255,255,255,.92),rgba(248,240,255,.88))!important;
  box-shadow:0 6px 16px rgba(150,90,220,.1),inset 0 1px 0 rgba(255,255,255,.9)!important
}
#__uvd_iframe_workflow_prompt__ .uvd-iframe-cute-row{border-color:rgba(255,159,180,.3)!important;background:linear-gradient(145deg,rgba(255,255,255,.94),rgba(255,239,245,.9))!important}
#__uvd_media_links_prompt__ .uvd-plplain{grid-template-columns:minmax(0,1fr) 118px!important;gap:12px!important}
#__uvd_media_links_prompt__ .uvd-plplain-url{padding:8px 9px!important;font-size:11px!important;background:rgba(243,236,255,.6)!important}
#__uvd_media_links_prompt__ .uvd-plplain-note{font-size:10.5px!important}
#__uvd_media_links_prompt__ .uvd-plplain-actions{width:118px!important;min-width:118px!important;gap:7px!important}
#__uvd_media_links_prompt__ .uvd-plrow-watch,
#__uvd_media_links_prompt__ .uvd-plrow-preview,
#__uvd_iframe_workflow_prompt__ .uvd-iframe-probe-btn,
#__uvd_iframe_workflow_prompt__ .uvd-iframe-probe-actions .uvd-btn{
  min-height:42px;
  border-radius:12px!important;
  font-size:10.5px!important;
  font-weight:900!important
}
#__uvd_media_links_prompt__ .uvd-plrow-watch{border:0!important;background:linear-gradient(135deg,#ae84e7,#8960c9)!important;color:#fff!important;box-shadow:0 6px 13px rgba(150,90,220,.22)!important}
#__uvd_media_links_prompt__ .uvd-plrow-preview{background:#fff!important;color:#8a6ab0!important}
#__uvd_iframe_workflow_prompt__ .uvd-iframe-probe-actions{min-width:130px!important;gap:7px!important}
#__uvd_iframe_workflow_prompt__ .uvd-iframe-probe-btn{border-color:rgba(255,159,180,.32)!important;background:#fff!important;color:#c95073!important}
#__uvd_iframe_workflow_prompt__ .uvd-iframe-probe-actions .uvd-btn{background:linear-gradient(135deg,#ff9ab4,#ef6689)!important;color:#fff!important;box-shadow:0 6px 13px rgba(247,108,140,.2)!important}
#__uvd_media_links_prompt__ .uvd-workflow-later,
#__uvd_iframe_workflow_prompt__ .uvd-workflow-later{
  flex:0 0 auto;
  width:100%;
  min-height:48px;
  border:0!important;
  border-radius:15px!important;
  background:linear-gradient(135deg,#c5a0f4,#a477df)!important;
  color:#fff!important;
  font-size:12px!important;
  font-weight:900!important;
  box-shadow:0 8px 17px rgba(150,90,220,.2)!important
}
#__uvd_iframe_workflow_prompt__ .uvd-workflow-later{background:linear-gradient(135deg,#ff9ab4,#ef6689)!important;box-shadow:0 8px 17px rgba(247,108,140,.2)!important}

/* Farewell is also a full workflow card, but warmer and calmer than the
   discovery surfaces: the animal gets breathing room and the decision stays at
   the bottom, never marooned halfway up the panel. */
#__uvd_farewell_popup__>.uvd-farewell-box{
  box-sizing:border-box!important;
  width:min(94vw,680px)!important;
  height:90vh!important;
  height:min(90dvh,800px)!important;
  min-height:0!important;
  max-height:calc(100dvh - 24px)!important;
  margin:auto!important;
  padding:20px 28px 22px!important;
  display:flex!important;
  flex-direction:column!important;
  overflow-y:auto!important;
  border:1px solid rgba(255,255,255,.9)!important;
  border-radius:34px!important;
  background:linear-gradient(160deg,#fffdfd 0%,#fff0f6 49%,#f2eaff 100%)!important;
  box-shadow:0 28px 76px rgba(49,25,64,.46),0 0 0 6px rgba(255,255,255,.22) inset!important
}
#__uvd_farewell_popup__ .uvd-farewell-art{
  flex:1 1 250px;
  min-height:220px;
  width:min(78vw,340px)!important;
  height:auto!important;
  margin:0 auto 4px!important;
  display:flex;
  align-items:flex-end;
  justify-content:center;
  line-height:0
}
#__uvd_farewell_popup__ .uvd-farewell-kicker{margin:0!important;color:#aa7ac5!important;font-size:10px!important;font-weight:950!important;letter-spacing:.15em!important}
#__uvd_farewell_popup__ .uvd-farewell-title{margin-top:7px;color:#c95073;font-size:29px;font-weight:950;letter-spacing:-.045em;line-height:1.1}
#__uvd_farewell_popup__ .uvd-farewell-thanks{margin-top:8px;color:#8e69b4;font-size:14px;font-weight:850}
#__uvd_farewell_popup__ .uvd-farewell-copy{max-width:480px;margin:10px auto 0;color:#765d83;font-size:12.5px;font-weight:650;line-height:1.55}
#__uvd_farewell_popup__ .uvd-farewell-actions{display:grid;grid-template-columns:1fr 1.15fr;gap:10px;margin-top:18px}
#__uvd_farewell_popup__ .uvd-farewell-actions button{min-height:55px;border:0!important;border-radius:16px!important;font-size:13px!important;font-weight:900!important;cursor:pointer}
#__uvd_farewell_popup__ #__uvd_farewell_stay__{background:rgba(255,255,255,.82)!important;border:1px solid rgba(255,159,180,.3)!important;color:#c95073!important}
#__uvd_farewell_popup__ #__uvd_farewell_bye__{background:linear-gradient(135deg,#ff9ab4,#ef6689)!important;color:#fff!important;box-shadow:0 9px 18px rgba(247,108,140,.25)!important}

/* Compact tools remain compact: preparing a player, inspecting a preview, and
   resume choice should never inherit the tall workflow frame. */
#__uvd_play_intro__,#__uvd_media_preview__,#__uvd_resume_prompt__{align-items:center!important;justify-content:center!important;overflow:hidden!important}
#__uvd_play_intro__>.uvd-play-intro-card{
  box-sizing:border-box!important;
  width:min(92vw,440px)!important;
  height:auto!important;
  min-height:0!important;
  max-height:82dvh!important;
  margin:auto!important;
  padding:23px 24px 22px!important;
  border-radius:29px!important;
  overflow-y:auto!important;
  background:linear-gradient(160deg,#fffdfd,#fff0f7 56%,#f1eaff)!important;
  box-shadow:0 24px 60px rgba(49,25,64,.36),0 0 0 5px rgba(255,255,255,.24) inset!important
}
#__uvd_play_intro__ .uvd-play-intro-mascot{width:116px!important;height:108px!important;margin:0 auto 7px!important;line-height:0;transform:none!important;filter:drop-shadow(0 10px 15px rgba(247,108,140,.2))}
#__uvd_play_intro__ .uvd-play-intro-title{color:#946bc0;font-size:23px;font-weight:950;letter-spacing:-.035em}
#__uvd_play_intro__ .uvd-play-intro-copy{margin-top:7px;color:#765d83;font-size:13px;font-weight:650}
#__uvd_play_intro__ .uvd-play-intro-hint{margin:3px 0 15px;color:#9271a1;font-size:12px;line-height:1.45}
#__uvd_play_intro__ .uvd-play-intro-hint b{color:#9568c0}
#__uvd_play_intro__ .uvd-play-intro-open{width:100%;min-height:49px;border:0!important;border-radius:15px!important;background:linear-gradient(135deg,#b98df2,#9668d9)!important;color:#fff!important;font-size:13px!important;font-weight:900!important;box-shadow:0 8px 17px rgba(150,90,220,.22)!important}
#__uvd_media_preview__{padding:12px!important;background:rgba(38,22,48,.78)!important}
#__uvd_media_preview__>.uvd-media-preview-panel{
  box-sizing:border-box!important;
  width:min(92vw,480px)!important;
  height:auto!important;
  min-height:0!important;
  max-height:82dvh!important;
  margin:auto!important;
  padding:20px!important;
  overflow-y:auto!important;
  border-radius:29px!important;
  background:linear-gradient(160deg,#fffdfd,#fff0f7 55%,#f1eaff)!important
}
#__uvd_media_preview__ .uvd-media-preview-kicker{padding-right:42px;color:#a776c3!important}
#__uvd_media_preview__ .uvd-media-preview-title{font-size:18px!important;line-height:1.25}
#__uvd_media_preview__ .uvd-media-preview-stage{min-height:0!important;border-radius:17px!important}
#__uvd_media_preview__ .uvd-media-preview-actions{margin-top:13px!important}
#__uvd_resume_prompt__>.uvd-resume-card{width:min(92vw,390px)!important;min-height:0!important;padding:23px 22px 20px!important;border-radius:29px!important}
#__uvd_resume_prompt__ .uvd-resume-mascot{width:78px!important;height:78px!important}

@media (max-width:560px){
  #__uvd_media_links_prompt__,#__uvd_iframe_workflow_prompt__,#__uvd_farewell_popup__{padding:10px!important}
  #__uvd_media_links_prompt__>.uvd-glass-panel,
  #__uvd_iframe_workflow_prompt__>.uvd-glass-panel,
  #__uvd_farewell_popup__>.uvd-farewell-box{width:calc(100vw - 20px)!important;height:calc(100dvh - 20px)!important;max-height:calc(100dvh - 20px)!important}
  #__uvd_media_links_prompt__ .uvd-workflow-hero,
  #__uvd_iframe_workflow_prompt__ .uvd-workflow-hero{flex-basis:198px;padding:22px 18px 14px}
  #__uvd_media_links_prompt__ .uvd-media-popup-mascot,
  #__uvd_iframe_workflow_prompt__ .uvd-iframe-popup-mascot{width:138px!important;height:124px!important}
  #__uvd_media_links_prompt__ .uvd-workflow-body,
  #__uvd_iframe_workflow_prompt__ .uvd-workflow-body{padding:4px 17px 16px}
  #__uvd_media_links_prompt__ .uvd-workflow-title,
  #__uvd_iframe_workflow_prompt__ .uvd-workflow-title{font-size:20px}
  #__uvd_media_links_prompt__ .uvd-workflow-copy,
  #__uvd_iframe_workflow_prompt__ .uvd-workflow-copy{font-size:12px;margin-bottom:9px}
  #__uvd_media_links_prompt__ .uvd-plplain{grid-template-columns:minmax(0,1fr) 104px!important;gap:8px!important;padding:10px!important}
  #__uvd_media_links_prompt__ .uvd-plplain-actions{width:104px!important;min-width:104px!important}
  #__uvd_iframe_workflow_prompt__ .uvd-iframe-cute-row{padding:10px!important;gap:8px!important}
  #__uvd_iframe_workflow_prompt__ .uvd-iframe-probe-actions{min-width:107px!important}
  #__uvd_farewell_popup__>.uvd-farewell-box{padding:17px 19px!important}
  #__uvd_farewell_popup__ .uvd-farewell-art{flex-basis:210px;min-height:192px}
  #__uvd_farewell_popup__ .uvd-farewell-title{font-size:26px}
  #__uvd_farewell_popup__ .uvd-farewell-copy{font-size:12px}
}
@media (max-height:650px) and (max-width:560px){
  #__uvd_media_links_prompt__ .uvd-workflow-hero,
  #__uvd_iframe_workflow_prompt__ .uvd-workflow-hero{flex-basis:164px;padding-top:20px}
  #__uvd_media_links_prompt__ .uvd-media-popup-mascot,
  #__uvd_iframe_workflow_prompt__ .uvd-iframe-popup-mascot{width:112px!important;height:100px!important}
  #__uvd_farewell_popup__ .uvd-farewell-art{flex-basis:170px;min-height:155px}
  #__uvd_farewell_popup__ .uvd-farewell-title{font-size:23px}
  #__uvd_farewell_popup__ .uvd-farewell-thanks{margin-top:4px;font-size:12.5px}
  #__uvd_farewell_popup__ .uvd-farewell-copy{margin-top:6px;font-size:11px}
  #__uvd_farewell_popup__ .uvd-farewell-actions{margin-top:10px}
}
@media (prefers-reduced-motion:reduce){
  #__uvd_media_links_prompt__ .uvd-media-popup-mascot,
  #__uvd_iframe_workflow_prompt__ .uvd-iframe-popup-mascot,
  #__uvd_play_intro__ .uvd-play-intro-mascot{animation:none!important}
}

/* ===== DEFERRED POPUP REMINDER: PROMPT FIRST, SESSION RAIL AFTER ===== */
/* This is only reached after Video/Iframe has been consciously left. The small
   reminder popup asks once; "Để sau" folds its pending flow into Current Session. */
.uvd-popup-reminder-slot:empty{display:none}
.uvd-main-clean .uvd-popup-reminder-slot{margin:0!important;flex:0 0 auto}
.uvd-main-clean .uvd-popup-reminder-rail{
  display:grid;
  grid-template-columns:30px minmax(0,1fr);
  align-items:center;
  gap:7px;
  min-height:43px;
  padding:6px 9px;
  border:1px solid rgba(194,150,255,.28);
  border-radius:15px;
  background:linear-gradient(135deg,#fff9fd 0%,#f8efff 58%,#fff0f6 100%);
  box-shadow:0 5px 14px rgba(150,90,220,.1),inset 0 1px 0 rgba(255,255,255,.92);
  animation:uvdReminderFold .28s cubic-bezier(.22,1,.36,1) both
}
.uvd-popup-reminder-rail .uvd-popup-reminder-mascot{
  width:28px;
  height:28px;
  display:flex;
  align-items:center;
  justify-content:center;
  overflow:visible;
  border-radius:10px;
  background:radial-gradient(circle at 42% 32%,#fff,#ffe2ef 63%,#eee0ff)
}
.uvd-popup-reminder-rail .uvd-popup-reminder-mascot svg{width:25px;height:25px;display:block}
.uvd-popup-reminder-compact-open{
  min-width:0;
  overflow:hidden;
  padding:4px 2px;
  border:0;
  background:transparent;
  color:#806293;
  font-size:10px;
  font-weight:750;
  line-height:1.2;
  text-align:left;
  text-overflow:ellipsis;
  white-space:nowrap;
  cursor:pointer
}
.uvd-popup-reminder-compact-open span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.uvd-popup-reminder-compact-open b{color:#9a6ce0;font-weight:900}
.uvd-popup-reminder-compact-open:active{transform:scale(.98)}

#__uvd_popup_reminder_prompt__{
  position:fixed;
  inset:0;
  z-index:2147483647;
  display:flex;
  align-items:center;
  justify-content:center;
  padding:18px;
  background:rgba(36,21,49,.54);
  backdrop-filter:blur(7px);
  -webkit-backdrop-filter:blur(7px);
  animation:uvdFadeIn .22s ease both
}
#__uvd_popup_reminder_prompt__>.uvd-deferred-reminder-card{
  position:relative;
  box-sizing:border-box;
  width:min(92vw,440px);
  padding:23px 23px 20px;
  border:1px solid rgba(255,255,255,.88);
  border-radius:29px;
  background:linear-gradient(160deg,#fffdfd 0%,#fff0f7 54%,#f1eaff 100%);
  box-shadow:0 25px 65px rgba(49,25,64,.4),0 0 0 5px rgba(255,255,255,.2) inset;
  text-align:center;
  animation:uvdReminderAppear .34s cubic-bezier(.22,1,.36,1) both
}
.uvd-deferred-reminder-close{
  position:absolute;
  top:12px;
  right:12px;
  width:34px;
  height:34px;
  padding:0;
  border:1px solid rgba(255,159,180,.3);
  border-radius:50%;
  background:rgba(255,255,255,.82);
  color:#c95073;
  font-size:17px;
  cursor:pointer
}
.uvd-deferred-reminder-mascot{
  width:112px;
  height:100px;
  display:flex;
  align-items:center;
  justify-content:center;
  margin:0 auto 8px;
  border-radius:33px;
  background:radial-gradient(circle at 44% 30%,#fff 0%,#ffe1ed 58%,#eee2ff 100%);
  filter:drop-shadow(0 10px 14px rgba(247,108,140,.17))
}
.uvd-deferred-reminder-mascot svg{width:98px;height:88px;display:block;animation:uvdMascotHop 1.8s ease-in-out infinite}
.uvd-deferred-reminder-kicker{color:#aa7ac5;font-size:9px;font-weight:950;letter-spacing:.14em}
.uvd-deferred-reminder-title{margin-top:5px;color:#8d66bb;font-size:23px;font-weight:950;letter-spacing:-.035em;line-height:1.15}
.uvd-deferred-reminder-copy{max-width:350px;margin:8px auto 0;color:#775f81;font-size:12px;font-weight:650;line-height:1.5}
.uvd-deferred-reminder-actions{display:grid;grid-template-columns:1.2fr .8fr;gap:8px;margin-top:18px}
.uvd-deferred-reminder-actions button{min-height:47px;border-radius:14px;font-size:11px;font-weight:900;cursor:pointer}
.uvd-deferred-reminder-open{border:0;background:linear-gradient(135deg,#b488eb,#9369d0);color:#fff;box-shadow:0 7px 14px rgba(150,90,220,.22)}
.uvd-deferred-reminder-later{border:1px solid rgba(194,150,255,.3);background:#fff;color:#8967a1}
.uvd-deferred-reminder-open:active,.uvd-deferred-reminder-later:active,.uvd-deferred-reminder-close:active{transform:scale(.96)}
@keyframes uvdReminderAppear{from{opacity:0;transform:translateY(10px) scale(.96)}to{opacity:1;transform:translateY(0) scale(1)}}
@keyframes uvdReminderFold{from{opacity:.2;transform:translateY(-4px)}to{opacity:1;transform:translateY(0)}}
@media (max-width:560px){
  #__uvd_popup_reminder_prompt__{padding:14px}
  #__uvd_popup_reminder_prompt__>.uvd-deferred-reminder-card{width:min(94vw,420px);padding:20px 18px 17px;border-radius:25px}
  .uvd-deferred-reminder-mascot{width:96px;height:86px;border-radius:27px}
  .uvd-deferred-reminder-mascot svg{width:84px;height:76px}
  .uvd-deferred-reminder-title{font-size:20px}
  .uvd-deferred-reminder-copy{font-size:11px}
  .uvd-deferred-reminder-actions{margin-top:15px}
}
@media (prefers-reduced-motion:reduce){
  .uvd-popup-reminder-rail,.uvd-deferred-reminder-card,.uvd-deferred-reminder-mascot svg{animation:none!important}
}
/* ===== FAREWELL SCENE: COMPACT, CENTERED, AND DELIBERATE ===== */
/* The old flex-grow hero consumed all vertical space and stranded the mascot
   near the middle of a blank card. This scene has a bounded stage and a soft
   message panel, so every element belongs to the goodbye moment. */
#__uvd_farewell_popup__>.uvd-farewell-box{
  justify-content:center!important;
  gap:13px!important;
  padding:19px 27px 21px!important
}
#__uvd_farewell_popup__ .uvd-farewell-scene{
  position:relative;
  isolation:isolate;
  flex:0 0 236px;
  min-height:218px;
  display:flex;
  align-items:center;
  justify-content:center;
  overflow:hidden;
  border-radius:25px;
  background:radial-gradient(ellipse at 50% 45%,rgba(255,255,255,.84),rgba(255,219,237,.54) 48%,rgba(230,214,255,.16) 72%,transparent 73%)
}
#__uvd_farewell_popup__ .uvd-farewell-scene::before,
#__uvd_farewell_popup__ .uvd-farewell-scene::after{
  content:'';
  position:absolute;
  z-index:-1;
  border-radius:50%;
  pointer-events:none
}
#__uvd_farewell_popup__ .uvd-farewell-scene::before{width:12px;height:12px;top:25%;left:18%;background:#ffbed2;box-shadow:0 0 0 7px rgba(255,190,210,.16)}
#__uvd_farewell_popup__ .uvd-farewell-scene::after{width:9px;height:9px;right:19%;top:33%;background:#cdb2ff;box-shadow:0 0 0 6px rgba(205,178,255,.16)}
#__uvd_farewell_popup__ .uvd-farewell-art{
  flex:0 0 auto!important;
  min-height:0!important;
  width:min(70vw,270px)!important;
  height:202px!important;
  margin:0!important;
  display:flex!important;
  align-items:flex-end!important;
  justify-content:center!important;
  line-height:0!important
}
#__uvd_farewell_popup__ .uvd-farewell-art .uvd-farewell-mascots{min-height:0!important;align-items:flex-end!important}
#__uvd_farewell_popup__ .uvd-farewell-art .uvd-fm-big-full{width:172px!important;height:172px!important;filter:drop-shadow(0 11px 14px rgba(128,81,98,.18))}
#__uvd_farewell_popup__ .uvd-farewell-art .uvd-fm-big-full svg{width:100%!important;height:100%!important}
#__uvd_farewell_popup__ .uvd-farewell-animal-name{position:relative;z-index:2;margin-top:-8px!important;font-size:10px!important}
#__uvd_farewell_popup__ .uvd-farewell-message{
  flex:0 0 auto;
  box-sizing:border-box;
  width:100%;
  padding:14px 16px 13px;
  border:1px solid rgba(255,159,180,.2);
  border-radius:20px;
  background:rgba(255,255,255,.59);
  box-shadow:0 5px 13px rgba(247,108,140,.07),inset 0 1px 0 rgba(255,255,255,.88)
}
#__uvd_farewell_popup__ .uvd-farewell-kicker{margin:0!important;color:#aa7ac5!important;font-size:9px!important;font-weight:950!important;letter-spacing:.14em!important}
#__uvd_farewell_popup__ .uvd-farewell-title{margin-top:6px!important;color:#c95073!important;font-size:27px!important;line-height:1.08!important}
#__uvd_farewell_popup__ .uvd-farewell-thanks{margin-top:7px!important;color:#8e69b4!important;font-size:13px!important}
#__uvd_farewell_popup__ .uvd-farewell-copy{margin:8px auto 0!important;color:#765d83!important;font-size:11.5px!important;line-height:1.48!important}
#__uvd_farewell_popup__ .uvd-farewell-actions{flex:0 0 auto;margin:0!important}
#__uvd_farewell_popup__ .uvd-farewell-actions button{min-height:53px!important}
@media (max-width:560px){
  #__uvd_farewell_popup__>.uvd-farewell-box{gap:10px!important;padding:15px 17px 17px!important}
  #__uvd_farewell_popup__ .uvd-farewell-scene{flex-basis:212px;min-height:195px;border-radius:22px}
  #__uvd_farewell_popup__ .uvd-farewell-art{height:183px!important;width:min(70vw,244px)!important}
  #__uvd_farewell_popup__ .uvd-farewell-art .uvd-fm-big-full{width:158px!important;height:158px!important}
  #__uvd_farewell_popup__ .uvd-farewell-message{padding:12px 12px 11px;border-radius:18px}
  #__uvd_farewell_popup__ .uvd-farewell-title{font-size:24px!important}
  #__uvd_farewell_popup__ .uvd-farewell-copy{font-size:10.5px!important}
}
@media (max-height:650px) and (max-width:560px){
  #__uvd_farewell_popup__ .uvd-farewell-scene{flex-basis:168px;min-height:155px}
  #__uvd_farewell_popup__ .uvd-farewell-art{height:148px!important}
  #__uvd_farewell_popup__ .uvd-farewell-art .uvd-fm-big-full{width:128px!important;height:128px!important}
  #__uvd_farewell_popup__ .uvd-farewell-message{padding:9px 11px}
  #__uvd_farewell_popup__ .uvd-farewell-title{font-size:21px!important}
  #__uvd_farewell_popup__ .uvd-farewell-thanks{font-size:11.5px!important}
  #__uvd_farewell_popup__ .uvd-farewell-copy{margin-top:5px!important;font-size:9.5px!important}
  #__uvd_farewell_popup__ .uvd-farewell-actions button{min-height:47px!important}
}
/* Current Session always keeps a quiet guide, even before a result is proven. */
.uvd-popup-reminder-passive{min-width:0;overflow:hidden;color:#806293;font-size:10px;font-weight:750;line-height:1.2;text-overflow:ellipsis;white-space:nowrap}


/* ===== FLAT PASTEL SURFACE SYSTEM: SPEED, SHADOW, RADIUS ===== */
/* Blur and glow are retired. All bookmarklet roots use solid pastel surfaces;
   the three Settings sliders feed the variables below. */
.uvd-tunable-ui,
.uvd-tunable-ui .uvd-glass-panel,
.uvd-tunable-ui .uvd-glass-card,
.uvd-tunable-ui .uvd-card,
.uvd-tunable-ui .uvd-bubble,
.uvd-tunable-ui .uvd-settings-sheet,
.uvd-tunable-ui .uvd-media-preview-panel,
.uvd-tunable-ui .uvd-digging-box,
.uvd-tunable-ui .uvd-resume-card,
.uvd-tunable-ui .uvd-player-sheet,
.uvd-tunable-ui .uvd-restore-btn{
  backdrop-filter:none!important;
  -webkit-backdrop-filter:none!important
}
.uvd-tunable-ui.uvd-overlay,
.uvd-tunable-ui.uvd-digging-overlay,
.uvd-tunable-ui.uvd-media-preview-overlay,
.uvd-tunable-ui.uvd-settings-overlay,
.uvd-tunable-ui.uvd-player-overlay,
.uvd-tunable-ui.uvd-resume-overlay{
  backdrop-filter:none!important;
  -webkit-backdrop-filter:none!important
}
.uvd-tunable-ui.uvd-app-shell,
.uvd-tunable-ui.uvd-glass-panel,
.uvd-tunable-ui .uvd-settings-sheet,
.uvd-tunable-ui .uvd-media-preview-panel,
.uvd-tunable-ui .uvd-digging-box,
.uvd-tunable-ui .uvd-resume-card{
  border-radius:var(--radius-lg)!important;
  box-shadow:0 var(--uvd-shadow-y) var(--uvd-shadow-blur) rgba(91,56,104,var(--uvd-shadow-alpha))!important
}
.uvd-tunable-ui .uvd-card,
.uvd-tunable-ui .uvd-bubble,
.uvd-tunable-ui .uvd-context-bar,
.uvd-tunable-ui .uvd-tabbar,
.uvd-tunable-ui .uvd-settings-details,
.uvd-tunable-ui .uvd-popup-reminder-rail{
  border-radius:var(--radius-md)!important;
  box-shadow:0 var(--uvd-shadow-y) var(--uvd-shadow-blur) rgba(91,56,104,var(--uvd-shadow-alpha))!important
}
.uvd-tunable-ui .uvd-btn,
.uvd-tunable-ui .uvd-btn-icon,
.uvd-tunable-ui .uvd-meta-chip,
.uvd-tunable-ui .uvd-filter-btn,
.uvd-tunable-ui .uvd-toggle-switch,
.uvd-tunable-ui select,
.uvd-tunable-ui input,
.uvd-tunable-ui textarea{
  border-radius:var(--radius-sm)!important
}
.uvd-tunable-ui .uvd-btn,
.uvd-tunable-ui .uvd-btn-icon,
.uvd-tunable-ui .uvd-card,
.uvd-tunable-ui .uvd-tab,
.uvd-tunable-ui .uvd-meta-chip,
.uvd-tunable-ui .uvd-toggle-switch{
  transition-duration:var(--uvd-transition-duration)!important
}
.uvd-tunable-ui .uvd-brand-mark,
.uvd-tunable-ui .uvd-bubble-tmascot,
.uvd-tunable-ui .uvd-tab-active .uvd-tab-mascot,
.uvd-tunable-ui .uvd-popup-reminder-mascot svg,
.uvd-tunable-ui .uvd-deferred-reminder-mascot svg{
  animation-duration:var(--uvd-motion-duration)!important
}
/* ===== TUTORIAL: CONTENT-AWARE CARD, INTERNAL SCROLL ===== */
#__uvd_tutorial__{
  align-items:center!important;
  justify-content:center!important;
  padding:12px!important;
  overflow:hidden!important
}
#__uvd_tutorial__>.uvd-tutorial-box{
  box-sizing:border-box!important;
  width:min(94vw,520px)!important;
  min-height:0!important;
  max-height:calc(100dvh - 24px)!important;
  margin:auto!important;
  padding:18px 21px 15px!important;
  display:flex!important;
  flex-direction:column!important;
  overflow:hidden!important;
  border-radius:30px!important;
  background:linear-gradient(160deg,#fffdfd 0%,#fff0f7 53%,#f1eaff 100%)!important;
  box-shadow:0 var(--uvd-shadow-y) var(--uvd-shadow-blur) rgba(91,56,104,var(--uvd-shadow-alpha)),0 0 0 5px rgba(255,255,255,.2) inset!important
}
#__uvd_tutorial__ .uvd-tutorial-close{
  position:absolute;
  z-index:5;
  top:13px;
  right:13px;
  width:34px;
  height:34px;
  padding:0;
  border:1px solid rgba(255,159,180,.3);
  border-radius:50%;
  background:rgba(255,255,255,.84);
  color:#c95073;
  font-size:17px;
  line-height:1;
  cursor:pointer
}
#__uvd_tutorial__ .uvd-tutorial-mascot-stage{
  flex:0 0 174px;
  width:196px!important;
  height:174px!important;
  min-height:0!important;
  margin:0 auto 5px!important
}
#__uvd_tutorial__ .uvd-tutorial-mascot-art{width:145px!important;height:151px!important}
#__uvd_tutorial__ .uvd-tutorial-mascot-label{bottom:-4px!important;font-size:9px!important}
#__uvd_tutorial__ .uvd-tutorial-sub{
  flex:0 0 auto;
  padding:0 38px;
  color:#a777bf;
  font-size:9px;
  font-weight:950;
  letter-spacing:.12em;
  line-height:1.3;
  text-align:center;
  text-transform:uppercase
}
#__uvd_tutorial__ .uvd-tutorial-title{
  flex:0 0 auto;
  margin:5px 8px 10px;
  color:#c95073;
  font-size:22px;
  font-weight:950;
  letter-spacing:-.035em;
  line-height:1.15;
  text-align:center
}
#__uvd_tutorial__ .uvd-tutorial-scroll{
  flex:1 1 auto;
  min-height:0;
  overflow-y:auto;
  overscroll-behavior:contain;
  padding:0 3px 2px;
  scrollbar-width:thin
}
#__uvd_tutorial__ .uvd-tutorial-scroll::-webkit-scrollbar{width:5px}
#__uvd_tutorial__ .uvd-tutorial-scroll::-webkit-scrollbar-thumb{border-radius:99px;background:rgba(179,133,242,.38)}
#__uvd_tutorial__ .uvd-tutorial-text{
  padding:12px 13px;
  border:1px solid rgba(255,159,180,.2);
  border-radius:15px;
  background:rgba(255,255,255,.68);
  color:#6b4d85;
  font-size:12.5px;
  font-weight:650;
  line-height:1.55;
  overflow-wrap:anywhere;
  text-align:left
}
#__uvd_tutorial__ .uvd-tutorial-tip{
  margin-top:8px;
  padding:9px 11px;
  border:1px dashed rgba(255,159,180,.3);
  border-radius:13px;
  background:linear-gradient(155deg,#fffdfd,#ffe9f2);
  color:#8f68a0;
  font-size:10.5px;
  font-weight:650;
  line-height:1.45;
  overflow-wrap:anywhere;
  text-align:left
}
#__uvd_tutorial__ .uvd-tutorial-tip span{font-weight:900;color:#c95073}
#__uvd_tutorial__ .uvd-tutorial-nav{
  flex:0 0 auto;
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:9px;
  margin-top:11px
}
#__uvd_tutorial__ .uvd-tutorial-dots{display:flex;gap:5px;min-width:0}
#__uvd_tutorial__ .uvd-tutorial-dots span{width:7px;height:7px;border-radius:50%;background:rgba(255,159,180,.27)}
#__uvd_tutorial__ .uvd-tutorial-dots .uvd-tutorial-dot-active{width:18px;border-radius:99px;background:linear-gradient(90deg,#ff9fb4,#b385f2)}
#__uvd_tutorial__ .uvd-tutorial-nav-actions{display:flex;gap:7px;flex:0 0 auto}
#__uvd_tutorial__ .uvd-tutorial-nav-actions button{
  min-height:38px;
  padding:8px 11px;
  border:1px solid rgba(255,159,180,.28);
  border-radius:12px;
  background:#fff;
  color:#c95073;
  font-size:11px;
  font-weight:850;
  cursor:pointer
}
#__uvd_tutorial__ .uvd-tutorial-nav-actions #__uvd_tut_next__{border:0;background:linear-gradient(135deg,#ff9fb4,#f76c8c);color:#fff;box-shadow:0 5px 12px rgba(247,108,140,.22)}
#__uvd_tutorial__ .uvd-tutorial-nav-actions button:disabled{opacity:.42;cursor:default}
#__uvd_tutorial__ .uvd-tutorial-mute{flex:0 0 auto;margin:8px auto 0!important}
@media (max-width:560px){
  #__uvd_tutorial__{padding:10px!important}
  #__uvd_tutorial__>.uvd-tutorial-box{width:calc(100vw - 20px)!important;max-height:calc(100dvh - 20px)!important;padding:15px 16px 13px!important;border-radius:25px!important}
  #__uvd_tutorial__ .uvd-tutorial-mascot-stage{flex-basis:151px;width:174px!important;height:151px!important}
  #__uvd_tutorial__ .uvd-tutorial-mascot-art{width:127px!important;height:132px!important}
  #__uvd_tutorial__ .uvd-tutorial-title{font-size:19px;margin-bottom:8px}
  #__uvd_tutorial__ .uvd-tutorial-text{font-size:11.5px;padding:10px 11px}
  #__uvd_tutorial__ .uvd-tutorial-tip{font-size:10px}
  #__uvd_tutorial__ .uvd-tutorial-nav-actions button{min-height:35px;padding:7px 9px;font-size:10px}
}
@media (max-height:650px) and (max-width:560px){
  #__uvd_tutorial__ .uvd-tutorial-mascot-stage{flex-basis:118px;width:144px!important;height:118px!important;margin-bottom:2px!important}
  #__uvd_tutorial__ .uvd-tutorial-mascot-art{width:96px!important;height:102px!important}
  #__uvd_tutorial__ .uvd-tutorial-sub{font-size:8px}
  #__uvd_tutorial__ .uvd-tutorial-title{font-size:17px;margin:3px 5px 6px}
  #__uvd_tutorial__ .uvd-tutorial-tip{margin-top:6px;padding:7px 9px;font-size:9px}
  #__uvd_tutorial__ .uvd-tutorial-nav{margin-top:7px}
}
/* ===== CURRENT SESSION COPY, FAREWELL MEMORY, WIDE PREVIEW STAGE ===== */
.uvd-main-clean .uvd-popup-reminder-rail{min-height:59px!important;padding:7px 9px!important}
.uvd-popup-reminder-compact-open{
  display:grid!important;
  grid-template-columns:minmax(0,1fr) auto!important;
  grid-template-rows:auto auto!important;
  column-gap:8px;
  row-gap:2px;
  align-items:center!important;
  white-space:normal!important
}
.uvd-popup-reminder-compact-open .uvd-session-guide-copy{
  overflow:hidden!important;
  color:#735789;
  font-size:10.5px;
  font-weight:900;
  line-height:1.18;
  text-overflow:ellipsis;
  white-space:nowrap!important
}
.uvd-popup-reminder-compact-open small{
  grid-column:1;
  display:block;
  overflow:hidden;
  color:#9a7ca1;
  font-size:8.8px;
  font-weight:700;
  line-height:1.22;
  text-overflow:ellipsis;
  white-space:nowrap
}
.uvd-popup-reminder-compact-open b{grid-column:2;grid-row:1 / span 2;white-space:nowrap}
.uvd-popup-reminder-passive{display:flex;flex-direction:column;justify-content:center;gap:2px;white-space:normal!important}
.uvd-popup-reminder-passive strong{color:#735789;font-size:10.5px;line-height:1.18}
.uvd-popup-reminder-passive small{color:#9a7ca1;font-size:8.8px;line-height:1.22}

#__uvd_farewell_popup__ .uvd-farewell-memory{
  margin:11px 0 0;
  padding:9px 10px 10px;
  border:1px dashed rgba(194,150,255,.34);
  border-radius:14px;
  background:rgba(255,255,255,.52);
  color:#8b6a9b;
  font-size:9.5px;
  font-weight:850;
  line-height:1.35
}
#__uvd_farewell_popup__ .uvd-farewell-memory>span{display:block;margin-bottom:6px;color:#a16b95;font-size:9px;letter-spacing:.04em}
#__uvd_farewell_popup__ .uvd-farewell-memory>div{display:flex;justify-content:center;gap:5px;flex-wrap:wrap}
#__uvd_farewell_popup__ .uvd-farewell-memory i{padding:4px 6px;border:1px solid rgba(255,159,180,.2);border-radius:999px;background:rgba(255,255,255,.72);color:#7b618c;font-style:normal;white-space:nowrap}
@media (max-height:650px) and (max-width:560px){
  #__uvd_farewell_popup__ .uvd-farewell-memory{margin-top:7px;padding:7px 8px;font-size:8.5px}
  #__uvd_farewell_popup__ .uvd-farewell-memory>span{margin-bottom:4px;font-size:8px}
  #__uvd_farewell_popup__ .uvd-farewell-memory i{padding:3px 5px}
}

/* Preview inherits uvd-card-preview on purpose, but that old mobile rule had
   a fixed 122px height. Restore a real 16:9 stage so the main frame is as wide
   and useful as a Stream thumbnail. */
#__uvd_media_preview__>.uvd-media-preview-panel{width:min(94vw,560px)!important}
#__uvd_media_preview__ .uvd-media-preview-stage{
  width:100%!important;
  height:auto!important;
  min-height:0!important;
  aspect-ratio:16 / 9!important;
  margin-top:12px!important;
  border-radius:18px!important
}
#__uvd_media_preview__ .uvd-media-preview-stage img{width:100%!important;height:100%!important;object-fit:cover!important}
@media (max-width:560px){
  #__uvd_media_preview__>.uvd-media-preview-panel{width:calc(100vw - 20px)!important}
  #__uvd_media_preview__ .uvd-media-preview-stage{aspect-ratio:16 / 9!important}
}
/* TMDB may decline an uncertain title; keep a compact retry action instead of
   making the information area disappear with no explanation. */
.uvd-player-tmdb-bar .uvd-tmdb-retry{margin-left:auto;flex:0 0 auto;padding:6px 8px!important;font-size:9px!important;white-space:nowrap}

/* ===== PLAYER TMDB: EXPANDABLE INFORMATION SHEET ===== */
.uvd-player-info-panel{
  transition:max-height var(--uvd-transition-duration,.24s) cubic-bezier(.22,1,.36,1),
             padding var(--uvd-transition-duration,.24s) cubic-bezier(.22,1,.36,1)!important
}
.uvd-player-tmdb-bar{align-items:flex-start!important}
.uvd-player-tmdb-summary{display:flex;align-items:center;gap:9px;min-width:0;flex:1}
.uvd-tmdb-expand-toggle{flex:0 0 auto;padding:6px 8px;border:1px solid rgba(194,150,255,.26);border-radius:10px;background:rgba(255,255,255,.8);color:#8a6ab0;font-size:9px;font-weight:900;cursor:pointer;white-space:nowrap}
.uvd-player-tmdb-expanded{max-height:0;overflow:hidden;opacity:0;transform:translateY(18px);transition:max-height .42s cubic-bezier(.22,1,.36,1),opacity .28s ease,transform .42s cubic-bezier(.22,1,.36,1);pointer-events:none}
.uvd-player-info-panel.uvd-player-info-expanded .uvd-player-tmdb-expanded{max-height:360px;overflow-y:auto;opacity:1;transform:translateY(0);pointer-events:auto;margin-top:10px;padding-top:10px;border-top:1px solid rgba(194,150,255,.18)}
.uvd-player-tmdb-expanded-head{display:flex;align-items:center;gap:10px;min-width:0}
.uvd-player-tmdb-expanded-poster{width:62px;height:84px;flex:0 0 62px;overflow:hidden;border-radius:13px;background:#f2e7ff;display:flex;align-items:center;justify-content:center;font-size:22px}
.uvd-player-tmdb-expanded-poster img{width:100%;height:100%;object-fit:cover}
.uvd-player-tmdb-expanded-head>div:last-child{min-width:0;flex:1}
.uvd-player-tmdb-expanded-head strong{display:block;overflow:hidden;color:#76508d;font-size:14px;font-weight:950;line-height:1.25;text-overflow:ellipsis;white-space:nowrap}
.uvd-player-tmdb-expanded-head small{display:block;overflow:hidden;margin-top:3px;color:#9b7aa5;font-size:10px;font-weight:700;line-height:1.3;text-overflow:ellipsis;white-space:nowrap}
.uvd-player-tmdb-expanded>p{margin:9px 1px 0;color:#735f7d;font-size:11px;font-weight:650;line-height:1.5}
.uvd-player-tmdb-expanded-cast{display:flex;gap:7px;margin-top:8px;color:#8e7198;font-size:10px;line-height:1.4}
.uvd-player-tmdb-expanded-cast b{flex:0 0 auto;color:#8a6ab0}
.uvd-player-title-confirmed{display:flex!important;align-items:center;gap:8px;color:#8a6ab0!important}
.uvd-player-title-confirmed>span{font-size:10px;font-weight:950;letter-spacing:.08em;text-transform:uppercase;white-space:nowrap}
.uvd-player-title-confirmed img{display:block;max-width:146px;max-height:27px;object-fit:contain;object-position:left center}
@media (max-width:420px){
  .uvd-tmdb-expand-toggle{padding:5px 6px;font-size:8px}
  .uvd-player-info-panel.uvd-player-info-expanded .uvd-player-tmdb-expanded{max-height:310px}
  .uvd-player-tmdb-expanded-poster{width:54px;height:73px;flex-basis:54px}
  .uvd-player-tmdb-expanded>p{font-size:10px}
  .uvd-player-title-confirmed img{max-width:116px;max-height:23px}
}
/* ===== PLAYER INFO HANDLE + FULL TMDB SHEET ===== */
.uvd-player-info-panel{position:relative!important;padding-top:28px!important}
.uvd-player-info-handle{
  position:absolute;
  z-index:3;
  top:2px;
  left:50%;
  display:flex;
  align-items:center;
  justify-content:center;
  gap:6px;
  width:72px;
  height:24px;
  padding:0;
  border:0;
  border-radius:0 0 14px 14px;
  background:transparent;
  color:#8a6ab0;
  cursor:pointer;
  transform:translateX(-50%)
}
.uvd-player-info-handle[hidden]{display:none!important}
.uvd-player-info-handle span{display:block;width:35px;height:3px;border-radius:99px;background:rgba(138,106,176,.42);box-shadow:0 1px 0 rgba(255,255,255,.8)}
.uvd-player-info-handle i{font-style:normal;font-size:15px;font-weight:950;line-height:1;transition:transform var(--uvd-transition-duration,.24s) ease}
.uvd-player-info-handle.uvd-player-info-handle-open i{transform:rotate(180deg)}
.uvd-player-tmdb-bar{margin-top:8px!important;padding:9px!important;align-items:flex-start!important}
.uvd-player-tmdb-summary{display:flex;align-items:flex-start;gap:9px;min-width:0;flex:1}
.uvd-tmdb-expand-toggle{display:none!important}
.uvd-player-tmdb-copy{padding-top:1px}
.uvd-player-tmdb-copy .uvd-feedback-actions{margin-top:7px!important}
.uvd-player-tmdb-expanded{max-height:0;overflow:hidden;opacity:0;transform:translateY(22px);transition:max-height .42s cubic-bezier(.22,1,.36,1),opacity .28s ease,transform .42s cubic-bezier(.22,1,.36,1);pointer-events:none}
.uvd-player-info-panel.uvd-player-info-expanded .uvd-player-tmdb-expanded{max-height:440px;overflow-y:auto;opacity:1;transform:translateY(0);pointer-events:auto;margin-top:11px;padding:11px 2px 2px;border-top:1px solid rgba(194,150,255,.2)}
.uvd-player-tmdb-expanded::-webkit-scrollbar{width:4px}
.uvd-player-tmdb-expanded::-webkit-scrollbar-thumb{border-radius:99px;background:rgba(179,133,242,.35)}
.uvd-player-tmdb-expanded-head{display:flex;align-items:center;gap:11px;min-width:0}
.uvd-player-tmdb-expanded-poster{width:68px;height:93px;flex:0 0 68px;overflow:hidden;border-radius:14px;background:#f2e7ff;display:flex;align-items:center;justify-content:center;font-size:22px;box-shadow:0 5px 12px rgba(91,56,104,.12)}
.uvd-player-tmdb-expanded-poster img{width:100%;height:100%;object-fit:cover}
.uvd-player-tmdb-expanded-head>div:last-child{min-width:0;flex:1}
.uvd-player-tmdb-expanded-head strong{display:block;overflow:hidden;color:#76508d;font-size:15px;font-weight:950;line-height:1.25;text-overflow:ellipsis;white-space:nowrap}
.uvd-player-tmdb-expanded-head small{display:block;overflow:hidden;margin-top:4px;color:#9b7aa5;font-size:10px;font-weight:700;line-height:1.3;text-overflow:ellipsis;white-space:nowrap}
.uvd-player-tmdb-expanded-tags{display:flex;gap:5px;flex-wrap:wrap;margin:10px 0 0}
.uvd-player-tmdb-expanded-tags span{padding:4px 7px;border:1px solid rgba(194,150,255,.23);border-radius:999px;background:rgba(255,255,255,.7);color:#866a95;font-size:9px;font-weight:850}
.uvd-player-tmdb-expanded>p{margin:10px 1px 0;color:#735f7d;font-size:11px;font-weight:650;line-height:1.55}
.uvd-player-tmdb-expanded-row{display:grid;grid-template-columns:62px minmax(0,1fr);gap:7px;margin-top:8px;color:#8e7198;font-size:10.5px;line-height:1.45}
.uvd-player-tmdb-expanded-row b{color:#8a6ab0}
.uvd-player-title-confirmed{display:flex!important;align-items:center;gap:8px;color:#8a6ab0!important}
.uvd-player-title-confirmed>span{font-size:10px;font-weight:950;letter-spacing:.08em;text-transform:uppercase;white-space:nowrap}
.uvd-player-title-confirmed img{display:block;max-width:150px;max-height:29px;box-sizing:content-box;object-fit:contain;object-position:center;background:linear-gradient(135deg,#72507f,#3e3158);padding:4px 7px;border:1px solid rgba(255,255,255,.35);border-radius:8px;box-shadow:0 3px 8px rgba(91,56,104,.18)}
@media (max-width:420px){
  .uvd-player-info-panel{padding:27px 12px 12px!important}
  .uvd-player-info-panel.uvd-player-info-expanded .uvd-player-tmdb-expanded{max-height:360px}
  .uvd-player-tmdb-expanded-poster{width:57px;height:78px;flex-basis:57px}
  .uvd-player-tmdb-expanded>p{font-size:10px}
  .uvd-player-tmdb-expanded-row{grid-template-columns:54px minmax(0,1fr);font-size:9.5px}
  .uvd-player-title-confirmed img{max-width:118px;max-height:23px;padding:3px 5px}
}
/* ===== PLAYER POPUP CARD: MEDIA FIRST, NO DECORATIVE SHADOW ===== */
.uvd-player-card-v2{
  align-items:center!important;
  justify-content:center!important;
  padding:12px!important;
  background:rgba(7,5,10,.82)!important;
  backdrop-filter:none!important;
  -webkit-backdrop-filter:none!important
}
.uvd-player-card-v2 .uvd-player-sheet{
  width:var(--uvd-player-card-width,min(92vw,640px))!important;
  height:auto!important;
  max-height:calc(100dvh - 24px)!important;
  margin:auto!important;
  border:1px solid rgba(255,255,255,.72)!important;
  border-radius:28px!important;
  background:#fffafd!important;
  box-shadow:none!important;
  overflow:hidden!important
}
.uvd-player-card-v2 .uvd-player-sheet .uvd-settings-header.uvd-player-header{
  min-height:66px!important;
  padding:10px 13px!important;
  background:#fff5fa!important;
  border-bottom:1px solid rgba(255,159,180,.22)!important;
  box-shadow:none!important
}
.uvd-player-card-v2 .uvd-player-sheet .uvd-back-btn,
.uvd-player-card-v2 .uvd-player-sheet .uvd-icon-btn{box-shadow:none!important}
.uvd-player-card-v2 .uvd-player-sheet .uvd-player-video-area{
  flex:0 0 auto!important;
  padding:0!important;
  background:#fffafd!important;
  overflow:visible!important
}
.uvd-player-card-v2 .uvd-player-sheet #__uvd_video_wrapper__{
  border:0!important;
  border-radius:22px!important;
  background:#08080a!important;
  box-shadow:none!important
}
.uvd-player-card-v2 .uvd-player-sheet #__uvd_player_el__,
.uvd-player-card-v2 .uvd-player-sheet #__uvd_player_el__ video,
.uvd-player-card-v2 .uvd-player-sheet #__uvd_player_el__ video-skin{border-radius:22px!important;box-shadow:none!important}
.uvd-player-card-v2 .uvd-player-sheet .uvd-player-info-panel{
  padding:24px 13px 13px!important;
  background:#fffafd!important;
  border-top:1px solid rgba(194,150,255,.18)!important;
  border-radius:0!important;
  box-shadow:none!important
}
.uvd-player-card-v2 .uvd-player-sheet .uvd-player-info-title{margin-bottom:5px!important}
.uvd-player-card-v2 .uvd-player-sheet .uvd-player-info-meta{margin-top:5px!important;background:#fff!important;box-shadow:none!important}
.uvd-player-card-v2 .uvd-player-sheet .uvd-player-tmdb-bar{
  margin-top:8px!important;
  padding:8px 9px!important;
  border-radius:14px!important;
  background:#f8f1ff!important;
  border-color:rgba(194,150,255,.2)!important;
  box-shadow:none!important
}
.uvd-player-card-v2 .uvd-player-tmdb-mini-copy{min-width:0;flex:1}
.uvd-player-card-v2 .uvd-player-tmdb-mini-copy strong{display:block;overflow:hidden;color:#76508d;font-size:10.5px;font-weight:900;text-overflow:ellipsis;white-space:nowrap}
.uvd-player-card-v2 .uvd-player-tmdb-mini-copy span{display:block;overflow:hidden;margin-top:2px;color:#9b7aa5;font-size:9px;font-weight:700;text-overflow:ellipsis;white-space:nowrap}
.uvd-player-card-v2 .uvd-tmdb-feedback-actions{margin:7px 0 0!important}
.uvd-player-card-v2 .uvd-player-info-handle{top:0!important}
.uvd-player-card-v2 .uvd-player-info-handle span{background:rgba(138,106,176,.36)!important}

/* ===== MOVIE INFORMATION PAGE: BLACK BACKDROP + RISING SHEET ===== */
.uvd-movie-info-overlay{
  position:fixed;
  inset:0;
  z-index:2147483647;
  display:flex;
  align-items:flex-end;
  justify-content:center;
  padding:0;
  background:rgba(0,0,0,.86);
  backdrop-filter:none!important;
  -webkit-backdrop-filter:none!important;
  overflow:hidden
}
.uvd-movie-info-sheet{
  position:relative;
  box-sizing:border-box;
  width:min(100%,680px);
  max-height:92dvh;
  display:flex;
  flex-direction:column;
  overflow:hidden;
  border:1px solid rgba(255,255,255,.14);
  border-radius:30px 30px 0 0;
  background:linear-gradient(180deg,#17121d 0%,#100d15 100%);
  color:#f9f2fb;
  transform:translateY(105%);
  transition:transform .42s cubic-bezier(.22,1,.36,1)
}
.uvd-movie-info-overlay.uvd-open .uvd-movie-info-sheet{transform:translateY(0)}
.uvd-movie-info-close{
  position:absolute;
  z-index:5;
  top:13px;
  left:14px;
  width:38px;
  height:38px;
  padding:0;
  border:1px solid rgba(255,255,255,.18);
  border-radius:13px;
  background:rgba(0,0,0,.32);
  color:#fff;
  font-size:22px;
  cursor:pointer
}
.uvd-movie-info-hero{
  position:relative;
  isolation:isolate;
  flex:0 0 auto;
  padding:32px 60px 22px;
  overflow:hidden;
  text-align:center;
  background:radial-gradient(ellipse at 50% -20%,rgba(151,100,194,.55),rgba(50,30,69,.48) 45%,transparent 72%),linear-gradient(145deg,#21172b,#15101d)
}
.uvd-movie-info-hero-glow{position:absolute;z-index:-1;inset:auto -20% -85px;height:170px;background:radial-gradient(ellipse,rgba(218,114,160,.38),transparent 70%);filter:blur(12px)}
.uvd-movie-info-logo{min-height:38px;display:flex;align-items:center;justify-content:center}
.uvd-movie-info-logo img{display:block;max-width:230px;max-height:52px;box-sizing:content-box;object-fit:contain;background:#060508;padding:6px 10px;border:1px solid rgba(255,255,255,.22);border-radius:10px}
.uvd-movie-info-logo span{color:#fff;font-size:16px;font-weight:950;letter-spacing:.04em}
.uvd-movie-info-eyebrow{margin-top:13px;color:#d8b4f0;font-size:9px;font-weight:950;letter-spacing:.16em}
.uvd-movie-info-hero h2{margin:5px 0 0;color:#fff;font-size:25px;font-weight:950;letter-spacing:-.035em;line-height:1.15}
.uvd-movie-info-hero p{margin:4px 0 0;color:#c7b3d0;font-size:12px;font-weight:700}
.uvd-movie-info-facts{display:flex;justify-content:center;gap:5px;flex-wrap:wrap;margin-top:13px}
.uvd-movie-info-facts span{padding:4px 7px;border:1px solid rgba(255,255,255,.15);border-radius:999px;background:rgba(255,255,255,.09);color:#eadff0;font-size:9px;font-weight:800}
.uvd-movie-info-body{display:grid;grid-template-columns:112px minmax(0,1fr);gap:14px;min-height:0;overflow-y:auto;padding:16px 18px 28px}
.uvd-movie-info-body::-webkit-scrollbar{width:5px}.uvd-movie-info-body::-webkit-scrollbar-thumb{border-radius:99px;background:rgba(215,170,236,.35)}
.uvd-movie-info-poster{width:112px;height:158px;overflow:hidden;border-radius:16px;background:#28202f;display:flex;align-items:center;justify-content:center;font-size:28px;box-shadow:none}
.uvd-movie-info-poster img{width:100%;height:100%;object-fit:cover}
.uvd-movie-info-content{min-width:0}
.uvd-movie-info-tags{display:flex;gap:5px;flex-wrap:wrap;margin-bottom:11px}.uvd-movie-info-tags span{padding:4px 7px;border-radius:999px;background:rgba(223,151,197,.16);border:1px solid rgba(223,151,197,.22);color:#efc6df;font-size:9px;font-weight:850}
.uvd-movie-info-content h3{margin:0;color:#fff;font-size:12px;font-weight:950}.uvd-movie-info-overview{margin:6px 0 0;color:#d3c8d8;font-size:11px;font-weight:650;line-height:1.58}
.uvd-movie-info-row{display:grid;grid-template-columns:62px minmax(0,1fr);gap:8px;margin-top:11px;color:#d2c4d8;font-size:10.5px;font-weight:650;line-height:1.5}.uvd-movie-info-row b{color:#e9b9d6;font-weight:900}
@media (max-width:560px){
  .uvd-player-card-v2{padding:10px!important}.uvd-player-card-v2 .uvd-player-sheet{width:calc(100vw - 20px)!important;border-radius:24px!important}.uvd-player-card-v2 .uvd-player-sheet .uvd-settings-header.uvd-player-header{min-height:61px!important;padding:8px 10px!important}
  .uvd-movie-info-sheet{max-height:94dvh;border-radius:26px 26px 0 0}.uvd-movie-info-hero{padding:29px 50px 19px}.uvd-movie-info-hero h2{font-size:21px}.uvd-movie-info-logo img{max-width:185px;max-height:43px}.uvd-movie-info-body{grid-template-columns:86px minmax(0,1fr);gap:11px;padding:14px 14px 25px}.uvd-movie-info-poster{width:86px;height:123px;border-radius:13px}.uvd-movie-info-overview{font-size:10.5px}.uvd-movie-info-row{grid-template-columns:54px minmax(0,1fr);font-size:10px}
}
/* ===== PLAYER RHYTHM + LAMPA-LIKE MOVIE PAGE REFINEMENT ===== */
.uvd-player-card-v2 .uvd-player-sheet .uvd-player-video-area{padding:14px 0 12px!important}
.uvd-player-card-v2 .uvd-player-sheet .uvd-player-info-panel{margin-top:3px!important;padding:29px 16px 16px!important}
.uvd-player-card-v2 .uvd-player-sheet .uvd-player-info-title{margin-bottom:10px!important}
.uvd-player-card-v2 .uvd-player-sheet .uvd-player-info-meta{margin-top:7px!important}
.uvd-player-card-v2 .uvd-player-sheet .uvd-player-tmdb-bar{margin-top:14px!important;padding:10px 11px!important}
.uvd-player-info-handle{width:64px!important;gap:0!important}
.uvd-player-info-handle span{width:42px!important;height:4px!important;background:rgba(138,106,176,.46)!important}
.uvd-player-info-handle i{display:none!important}

.uvd-movie-info-overlay{background:rgba(0,0,0,.9)!important}
.uvd-movie-info-sheet{width:min(100%,720px)!important;max-height:94dvh!important;border-radius:28px 28px 0 0!important;border-color:rgba(255,255,255,.1)!important;background:#0d0b11!important;box-shadow:none!important}
.uvd-movie-info-close{background:rgba(0,0,0,.45)!important;border-color:rgba(255,255,255,.18)!important;backdrop-filter:none!important}
.uvd-movie-info-hero{height:248px;min-height:248px;padding:0!important;background-color:#17111f!important;background-size:cover!important;background-position:center top!important;overflow:hidden!important}
.uvd-movie-info-hero-scrim{position:absolute;inset:0;background:linear-gradient(180deg,rgba(5,4,8,.12) 0%,rgba(13,11,17,.38) 38%,#0d0b11 100%)}
.uvd-movie-info-hero::before{content:'';position:absolute;inset:0;background:linear-gradient(90deg,rgba(12,9,16,.45),transparent 55%);pointer-events:none}
.uvd-movie-info-logo{position:absolute;z-index:2;right:18px;bottom:28px;left:80px;justify-content:flex-end!important;min-height:0!important}
.uvd-movie-info-logo img{max-width:250px!important;max-height:55px!important;background:rgba(5,4,8,.72)!important;border-color:rgba(255,255,255,.2)!important;border-radius:9px!important;box-shadow:none!important}
.uvd-movie-info-body{display:block!important;min-height:0!important;overflow-y:auto!important;padding:0 18px 34px!important;background:#0d0b11!important}
.uvd-movie-info-main{position:relative;z-index:3;display:grid;grid-template-columns:120px minmax(0,1fr);gap:15px;margin-top:-54px}
.uvd-movie-info-poster{width:120px!important;height:174px!important;border-radius:15px!important;border:1px solid rgba(255,255,255,.16);background:#17131d!important;box-shadow:none!important}
.uvd-movie-info-title-block{align-self:end;min-width:0;padding-bottom:5px}
.uvd-movie-info-eyebrow{margin:0!important;color:#d8b4f0!important;font-size:9px!important;letter-spacing:.15em!important;text-align:left!important}
.uvd-movie-info-title-block h2{margin:5px 0 0!important;color:#fff!important;font-size:25px!important;font-weight:950!important;line-height:1.12!important;text-align:left!important}
.uvd-movie-info-title-block p{margin:5px 0 0!important;color:#bfb2c7!important;font-size:12px!important;text-align:left!important}
.uvd-movie-info-facts{justify-content:flex-start!important;margin-top:10px!important}.uvd-movie-info-facts span{background:rgba(255,255,255,.08)!important;border-color:rgba(255,255,255,.13)!important;color:#e2d7e6!important}
.uvd-movie-info-content{margin-top:18px!important;min-width:0}.uvd-movie-info-tags{margin-bottom:14px!important}.uvd-movie-info-tags span{background:rgba(223,151,197,.14)!important;border-color:rgba(223,151,197,.22)!important;color:#efc6df!important}
.uvd-movie-info-content h3{font-size:13px!important;color:#fff!important}.uvd-movie-info-overview{color:#d8cfdc!important;font-size:12px!important;line-height:1.65!important}.uvd-movie-info-row{color:#d4c7d9!important;font-size:11px!important;margin-top:13px!important}.uvd-movie-info-row b{color:#efc0db!important}
@media (max-width:560px){
  .uvd-player-card-v2 .uvd-player-sheet .uvd-player-video-area{padding:12px 0 10px!important}
  .uvd-player-card-v2 .uvd-player-sheet .uvd-player-info-panel{padding:28px 14px 15px!important}
  .uvd-movie-info-sheet{border-radius:25px 25px 0 0!important}.uvd-movie-info-hero{height:218px;min-height:218px}.uvd-movie-info-logo{right:14px;bottom:23px;left:72px}.uvd-movie-info-logo img{max-width:190px!important;max-height:43px!important}.uvd-movie-info-body{padding:0 14px 28px!important}.uvd-movie-info-main{grid-template-columns:96px minmax(0,1fr);gap:12px;margin-top:-42px}.uvd-movie-info-poster{width:96px!important;height:140px!important;border-radius:13px!important}.uvd-movie-info-title-block h2{font-size:21px!important}.uvd-movie-info-overview{font-size:11px!important;line-height:1.62!important}.uvd-movie-info-row{font-size:10px!important}
}
/* ===== LAMPA-LIKE MOVIE PAGE: BIG, SCROLLABLE, PEOPLE FIRST ===== */
.uvd-player-card-v2 .uvd-player-sheet .uvd-player-video-area{padding:0!important;margin:16px 0 18px!important}
.uvd-movie-info-sheet{height:94dvh!important;max-height:94dvh!important;border-radius:30px 30px 0 0!important}
.uvd-movie-info-logo img{background:transparent!important;border:0!important;padding:0!important;border-radius:0!important;box-shadow:none!important;filter:drop-shadow(0 3px 10px rgba(0,0,0,.8))}
.uvd-movie-info-logo span{text-shadow:0 3px 10px rgba(0,0,0,.8)}
.uvd-movie-info-hero{height:286px!important;min-height:286px!important}
.uvd-movie-info-body{padding-bottom:52px!important}
.uvd-movie-info-content{padding-bottom:8px!important}
.uvd-movie-info-people-section{margin-top:26px}
.uvd-movie-info-people-section h3{margin:0 0 12px;color:#fff;font-size:18px;font-weight:800}
.uvd-movie-info-director{display:flex;align-items:center;gap:13px;min-width:0}
.uvd-movie-info-director img,.uvd-movie-info-director>span{width:76px;height:76px;flex:0 0 76px;overflow:hidden;border-radius:14px;background:#24202a;display:flex;align-items:center;justify-content:center;object-fit:cover;font-size:24px}
.uvd-movie-info-director>div{min-width:0}.uvd-movie-info-director strong{display:block;color:#fff;font-size:17px;font-weight:800;line-height:1.25}.uvd-movie-info-director small{display:block;margin-top:4px;color:#c8b9ce;font-size:12px}
.uvd-movie-info-actors{display:flex;gap:12px;overflow-x:auto;overflow-y:hidden;padding:0 0 5px;scroll-snap-type:x proximity;scrollbar-width:none}.uvd-movie-info-actors::-webkit-scrollbar{display:none}
.uvd-movie-info-actors article{flex:0 0 110px;min-width:0;scroll-snap-align:start}.uvd-movie-info-actors img,.uvd-movie-info-actors article>span{display:block;width:110px;height:134px;overflow:hidden;border-radius:14px;background:#25202b;object-fit:cover;color:#bfa9c9;font-size:24px;line-height:134px;text-align:center}
.uvd-movie-info-actors strong{display:block;overflow:hidden;margin-top:7px;color:#fff;font-size:11px;font-weight:800;line-height:1.3;text-overflow:ellipsis;white-space:nowrap}.uvd-movie-info-actors small{display:block;display:-webkit-box;overflow:hidden;margin-top:2px;color:#bfb0c6;font-size:9px;line-height:1.3;-webkit-box-orient:vertical;-webkit-line-clamp:2}
@media (max-width:560px){
  .uvd-movie-info-sheet{height:95dvh!important;max-height:95dvh!important;border-radius:26px 26px 0 0!important}.uvd-movie-info-hero{height:254px!important;min-height:254px!important}.uvd-movie-info-people-section{margin-top:22px}.uvd-movie-info-people-section h3{font-size:17px}.uvd-movie-info-director img,.uvd-movie-info-director>span{width:70px;height:70px;flex-basis:70px}.uvd-movie-info-director strong{font-size:16px}.uvd-movie-info-actors{gap:10px}.uvd-movie-info-actors article{flex-basis:96px}.uvd-movie-info-actors img,.uvd-movie-info-actors article>span{width:96px;height:122px;line-height:122px;border-radius:13px}
}
/* ===== LAMPA REFERENCE LAYOUT: FULL DETAIL PAGE ===== */
.uvd-movie-info-overlay{align-items:stretch!important;background:#08070a!important}
.uvd-movie-info-sheet{width:100%!important;height:100dvh!important;max-height:100dvh!important;border:0!important;border-radius:0!important;background:#0d0b11!important;transform:translateY(100%)!important}
.uvd-movie-info-overlay.uvd-open .uvd-movie-info-sheet{transform:translateY(0)!important}
.uvd-movie-info-close{top:18px!important;left:18px!important;width:46px!important;height:46px!important;border-radius:14px!important;background:rgba(4,4,6,.48)!important}
.uvd-movie-info-hero{height:48dvh!important;min-height:48dvh!important;background-size:cover!important;background-position:center top!important}
.uvd-movie-info-hero-scrim{background:linear-gradient(180deg,rgba(7,6,9,.04) 0%,rgba(8,7,10,.16) 34%,rgba(13,11,17,.84) 78%,#0d0b11 100%)!important}
.uvd-movie-info-body{position:relative;z-index:2;display:block!important;flex:1 1 auto;min-height:0;overflow-y:auto!important;margin-top:-84px;padding:0!important;background:transparent!important}
.uvd-movie-info-surface{min-height:calc(52dvh + 84px);padding:30px 28px 48px;border-radius:34px 34px 0 0;background:linear-gradient(180deg,rgba(19,16,24,.94),#0d0b11 28%)}
.uvd-movie-info-meta-line{color:#ded6e1;font-size:15px;font-weight:650}
.uvd-movie-info-logo{position:static!important;justify-content:flex-start!important;margin:36px 0 15px;min-height:0!important}
.uvd-movie-info-logo img{max-width:310px!important;max-height:78px!important;object-position:left center!important;background:transparent!important;border:0!important;padding:0!important;box-shadow:none!important;filter:drop-shadow(0 3px 10px rgba(0,0,0,.9))}
.uvd-movie-info-logo span{color:#fff;font-size:26px;font-weight:950;letter-spacing:-.03em}
.uvd-movie-info-surface>h2{margin:0;color:#fff;font-size:28px;font-weight:950;line-height:1.13}
.uvd-movie-info-tagline{margin:8px 0 0;color:#e0d6e3;font-family:Georgia,serif;font-size:17px;line-height:1.35}
.uvd-movie-info-facts{justify-content:flex-start!important;margin-top:22px!important}.uvd-movie-info-facts span{padding:6px 9px!important;background:rgba(255,255,255,.08)!important;border-color:rgba(255,255,255,.14)!important;color:#f4eef6!important;font-size:11px!important}
.uvd-movie-info-tags{margin:20px 0 0!important}.uvd-movie-info-tags span{padding:6px 10px!important;background:rgba(223,151,197,.15)!important;border-color:rgba(223,151,197,.25)!important;color:#f0c7df!important;font-size:10px!important}
.uvd-movie-info-content{margin-top:30px!important;padding:0!important}.uvd-movie-info-content>h3{font-size:20px!important;color:#fff!important}.uvd-movie-info-overview{margin-top:12px!important;color:#ded6e1!important;font-size:14px!important;line-height:1.72!important}
.uvd-movie-info-people-section{margin-top:34px!important}.uvd-movie-info-people-section h3{font-size:22px!important;margin-bottom:16px!important;color:#fff!important}
.uvd-movie-info-director{gap:16px!important}.uvd-movie-info-director img,.uvd-movie-info-director>span{width:112px!important;height:112px!important;flex-basis:112px!important;border-radius:17px!important}.uvd-movie-info-director strong{font-size:23px!important}.uvd-movie-info-director small{font-size:15px!important;margin-top:7px!important}
.uvd-movie-info-actors{gap:16px!important;padding-bottom:10px!important}.uvd-movie-info-actors article{flex-basis:134px!important}.uvd-movie-info-actors img,.uvd-movie-info-actors article>span{width:134px!important;height:164px!important;border-radius:16px!important;line-height:164px!important}.uvd-movie-info-actors strong{font-size:13px!important;margin-top:9px!important}.uvd-movie-info-actors small{font-size:11px!important}
@media (max-width:560px){
  .uvd-movie-info-sheet{height:100dvh!important;max-height:100dvh!important}.uvd-movie-info-close{top:15px!important;left:15px!important;width:42px!important;height:42px!important}.uvd-movie-info-hero{height:44dvh!important;min-height:44dvh!important}.uvd-movie-info-body{margin-top:-68px!important}.uvd-movie-info-surface{min-height:calc(56dvh + 68px);padding:25px 24px 42px;border-radius:30px 30px 0 0}.uvd-movie-info-meta-line{font-size:14px}.uvd-movie-info-logo{margin:30px 0 13px}.uvd-movie-info-logo img{max-width:255px!important;max-height:65px!important}.uvd-movie-info-surface>h2{font-size:25px}.uvd-movie-info-tagline{font-size:16px}.uvd-movie-info-content{margin-top:26px!important}.uvd-movie-info-overview{font-size:13px!important;line-height:1.68!important}.uvd-movie-info-people-section{margin-top:30px!important}.uvd-movie-info-people-section h3{font-size:20px!important}.uvd-movie-info-director img,.uvd-movie-info-director>span{width:96px!important;height:96px!important;flex-basis:96px!important}.uvd-movie-info-director strong{font-size:20px!important}.uvd-movie-info-actors article{flex-basis:118px!important}.uvd-movie-info-actors img,.uvd-movie-info-actors article>span{width:118px!important;height:146px!important;line-height:146px!important}
}
/* ===== MOVIE HERO OVERLAP: LOGO/YEAR TOUCH THE BACKDROP ===== */
.uvd-movie-info-hero{margin:10px 10px 0;border-radius:28px 28px 0 0;overflow:hidden!important}
.uvd-movie-info-body{margin-top:-104px!important}
.uvd-movie-info-surface{position:relative;overflow:visible;padding-top:32px!important}
.uvd-movie-info-meta-line{position:relative;z-index:3;margin-top:-76px;text-shadow:0 2px 8px rgba(0,0,0,.85)}
.uvd-movie-info-logo{position:relative!important;z-index:3;margin-top:28px!important}
.uvd-movie-info-logo img{filter:drop-shadow(0 4px 12px rgba(0,0,0,.95))!important}
@media (max-width:560px){
  .uvd-movie-info-hero{margin:8px 8px 0;border-radius:24px 24px 0 0}.uvd-movie-info-body{margin-top:-90px!important}.uvd-movie-info-surface{padding-top:28px!important}.uvd-movie-info-meta-line{margin-top:-66px}.uvd-movie-info-logo{margin-top:24px!important}
}
/* ===== MOVIE PAGE: ONE SCROLL LAYER FOR BACKDROP + SURFACE ===== */
.uvd-movie-info-sheet{overflow:hidden!important}
.uvd-movie-info-body{display:block!important;flex:1 1 auto!important;min-height:0!important;overflow-y:auto!important;overflow-x:hidden!important;margin:0!important;padding:0!important;overscroll-behavior:contain}
.uvd-movie-info-body .uvd-movie-info-hero{margin:10px 10px 0;border-radius:28px 28px 0 0;overflow:hidden!important}
.uvd-movie-info-body .uvd-movie-info-surface{margin-top:-104px;position:relative;z-index:2;overflow:visible}
@media (max-width:560px){
  .uvd-movie-info-body .uvd-movie-info-hero{margin:8px 8px 0;border-radius:24px 24px 0 0}.uvd-movie-info-body .uvd-movie-info-surface{margin-top:-90px}
}
/* ===== FULL-WIDTH BACKDROP ALIGNMENT ===== */
.uvd-movie-info-body .uvd-movie-info-hero{margin:0!important;width:100%;border-radius:26px 26px 0 0}
.uvd-movie-info-surface{padding-left:28px!important;padding-right:28px!important}
.uvd-movie-info-meta-line{margin-top:-96px!important}
.uvd-movie-info-logo{justify-content:flex-start!important;margin-left:-40px!important;transform:none!important}
.uvd-movie-info-logo img{object-position:left center!important}
@media (max-width:560px){
  .uvd-movie-info-body .uvd-movie-info-hero{margin:0!important;border-radius:23px 23px 0 0}.uvd-movie-info-surface{padding-left:24px!important;padding-right:24px!important}.uvd-movie-info-meta-line{margin-top:-84px!important}.uvd-movie-info-logo{margin-left:-32px!important}
}
/* ===== POPUP CONTINUITY: NEVER FLASH THE HOST PAGE BETWEEN FLOWS ===== */
.uvd-popup-transition-under{pointer-events:none!important}
#__uvd_media_links_prompt__{background:rgba(28,14,40,.74)!important;backdrop-filter:none!important;-webkit-backdrop-filter:none!important}
#__uvd_play_intro__{background:rgba(45,22,47,.58)!important;backdrop-filter:none!important;-webkit-backdrop-filter:none!important}
/* The Player — not the video-link list — owns the cinematic black backdrop. */
#__uvd_player_overlay__{background:rgba(0,0,0,.94)!important;backdrop-filter:none!important;-webkit-backdrop-filter:none!important}

/* ===== SESSION DOCK: PAGE, SCANNER STATUS, VERIFIED GUIDE IN ONE SURFACE ===== */
.uvd-main-clean .uvd-session-dock{
  display:block!important;
  margin:0!important;
  padding:0!important;
  overflow:hidden;
  border:1px solid rgba(194,150,255,.24)!important;
  border-radius:22px!important;
  background:linear-gradient(145deg,#fffafd 0%,#f8f1ff 60%,#fff1f7 100%)!important;
  box-shadow:0 4px 12px rgba(150,90,220,.08)!important
}
.uvd-session-dock-head{padding:11px 13px 7px}
.uvd-session-status{display:flex;align-items:center;gap:6px;min-width:0;color:#9a70aa;font-size:8.5px;font-weight:950;letter-spacing:.1em;line-height:1.2}
.uvd-session-status-dot{width:7px;height:7px;flex:0 0 7px;border-radius:50%;background:#f29ab7;box-shadow:0 0 0 4px rgba(242,154,183,.15)}
.uvd-session-host{overflow:hidden;margin-left:auto;color:#a88ba8;font-size:8px;font-weight:800;letter-spacing:0;text-overflow:ellipsis;white-space:nowrap}
.uvd-session-title{width:100%;margin-top:5px!important;color:#705281!important;font-size:14px!important;font-weight:900!important;line-height:1.25!important}
.uvd-session-dock-tools{display:flex;gap:5px;overflow-x:auto;padding:0 13px 10px;scrollbar-width:none}.uvd-session-dock-tools::-webkit-scrollbar{display:none}
.uvd-session-dock-tools .uvd-meta-chip{flex:0 0 auto;background:rgba(255,255,255,.72)!important;border-color:rgba(194,150,255,.2)!important;color:#89699a!important;font-size:9px!important}
.uvd-session-dock .uvd-popup-reminder-slot{display:block!important;margin:0!important}.uvd-session-dock .uvd-popup-reminder-slot:empty{display:none!important}
.uvd-session-dock .uvd-popup-reminder-rail{margin:0!important;min-height:58px!important;padding:8px 12px!important;border:0!important;border-top:1px solid rgba(194,150,255,.16)!important;border-radius:0!important;background:rgba(255,255,255,.44)!important;box-shadow:none!important}
.uvd-session-dock.uvd-session-state-media .uvd-session-status{color:#9070b8}.uvd-session-dock.uvd-session-state-media .uvd-session-status-dot{background:#a787df;box-shadow:0 0 0 4px rgba(167,135,223,.15)}
.uvd-session-dock.uvd-session-state-iframe .uvd-session-status{color:#c36a87}.uvd-session-dock.uvd-session-state-iframe .uvd-session-status-dot{background:#f18ba8;box-shadow:0 0 0 4px rgba(241,139,168,.15)}
@media (max-width:560px){
  .uvd-main-clean .uvd-session-dock{border-radius:18px!important}.uvd-session-dock-head{padding:9px 10px 6px}.uvd-session-title{font-size:12px!important}.uvd-session-dock-tools{padding:0 10px 8px}.uvd-session-dock .uvd-popup-reminder-rail{min-height:56px!important;padding:7px 10px!important}
}
/* ===== GLOBAL POPUP RADIUS + RICHER FAREWELL ===== */
/* The user-facing corner slider reaches all popup surfaces, not only Main UI. */
.uvd-tunable-ui .uvd-digging-box,
.uvd-tunable-ui .uvd-glass-panel,
.uvd-tunable-ui .uvd-media-preview-panel,
.uvd-tunable-ui .uvd-resume-card,
.uvd-tunable-ui .uvd-play-intro-card,
.uvd-tunable-ui .uvd-settings-sheet:not(.uvd-player-sheet),
.uvd-tunable-ui .uvd-player-sheet{border-radius:var(--radius-lg)!important}
.uvd-tunable-ui .uvd-workflow-later,
.uvd-tunable-ui .uvd-play-intro-open,
.uvd-tunable-ui .uvd-media-preview-actions button,
.uvd-tunable-ui .uvd-dig-watch-first-btn,
.uvd-tunable-ui .uvd-dig-enter-btn,
.uvd-tunable-ui .uvd-farewell-actions button{border-radius:var(--radius-sm)!important}
.uvd-tunable-ui #__uvd_video_wrapper__,
.uvd-tunable-ui #__uvd_player_el__,
.uvd-tunable-ui #__uvd_player_el__ video,
.uvd-tunable-ui #__uvd_player_el__ video-skin{border-radius:var(--radius-md)!important}

#__uvd_farewell_popup__ .uvd-farewell-scene{position:relative!important;overflow:hidden!important}
#__uvd_farewell_popup__ .uvd-farewell-scene-spark{position:absolute;z-index:2;color:#c9a4ec;font-style:normal;font-size:16px;opacity:.7}
#__uvd_farewell_popup__ .uvd-farewell-spark-one{left:18%;top:26%}#__uvd_farewell_popup__ .uvd-farewell-spark-two{right:19%;top:32%;color:#f4a1bd;font-size:19px}
#__uvd_farewell_popup__ .uvd-farewell-scene-note{position:absolute;z-index:3;left:50%;bottom:3px;max-width:calc(100% - 24px);padding:6px 10px;border:1px solid rgba(255,255,255,.78);border-radius:999px;background:rgba(255,255,255,.72);color:#936c9c;font-size:9.5px;font-weight:850;line-height:1.25;transform:translateX(-50%);white-space:nowrap}
#__uvd_farewell_popup__ .uvd-farewell-next{display:flex;align-items:center;justify-content:center;gap:6px;margin-top:9px;padding:8px 10px;border-top:1px solid rgba(194,150,255,.15);color:#9b7aa5;font-size:9.5px;line-height:1.35}
#__uvd_farewell_popup__ .uvd-farewell-next b{color:#7b5e89;font-weight:850}
@media (max-width:560px){
  #__uvd_farewell_popup__ .uvd-farewell-scene-note{font-size:8.5px;padding:5px 8px}#__uvd_farewell_popup__ .uvd-farewell-next{margin-top:7px;padding:7px 5px;font-size:8.5px;gap:4px}
}
/* ===== POPUP VIDEO REUSES THE STREAM THUMBNAIL, FAREWELL TEXT BREATHING ===== */
#__uvd_media_links_prompt__ .uvd-popup-stream-card{margin:0 0 13px!important;padding:12px!important}
#__uvd_media_links_prompt__ .uvd-popup-stream-card .uvd-card-preview{margin:0 0 11px!important}
#__uvd_media_links_prompt__ .uvd-popup-stream-details{display:grid;grid-template-columns:minmax(0,1fr) 112px;gap:10px;align-items:start}
#__uvd_media_links_prompt__ .uvd-popup-stream-details .uvd-plplain-body{padding-right:0!important}
#__uvd_media_links_prompt__ .uvd-popup-stream-details .uvd-plplain-body::before{display:none!important}
#__uvd_media_links_prompt__ .uvd-popup-stream-details .uvd-plplain-url{width:100%!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important}
@media (max-width:390px){#__uvd_media_links_prompt__ .uvd-popup-stream-details{grid-template-columns:minmax(0,1fr) 98px;gap:8px}}

/* Keep the animal label safely above the farewell scene note. */
#__uvd_farewell_popup__ .uvd-farewell-art{box-sizing:border-box;padding-bottom:29px!important;align-items:center!important}
#__uvd_farewell_popup__ .uvd-farewell-art .uvd-farewell-mascots{transform:translateY(-5px)}
#__uvd_farewell_popup__ .uvd-farewell-animal-name{margin-top:2px!important;font-size:11px!important}
#__uvd_farewell_popup__ .uvd-farewell-scene-note{bottom:5px!important;font-size:10.5px!important}
#__uvd_farewell_popup__ .uvd-farewell-thanks{font-size:15px!important}
#__uvd_farewell_popup__ .uvd-farewell-copy{font-size:13px!important;line-height:1.58!important}
#__uvd_farewell_popup__ .uvd-farewell-memory{font-size:10.5px!important}
#__uvd_farewell_popup__ .uvd-farewell-next{font-size:10.5px!important}
#__uvd_farewell_popup__ .uvd-farewell-actions button{font-size:14px!important}
@media (max-width:560px){
  #__uvd_farewell_popup__ .uvd-farewell-art{padding-bottom:25px!important}#__uvd_farewell_popup__ .uvd-farewell-animal-name{font-size:10px!important}#__uvd_farewell_popup__ .uvd-farewell-scene-note{font-size:9px!important}#__uvd_farewell_popup__ .uvd-farewell-thanks{font-size:14px!important}#__uvd_farewell_popup__ .uvd-farewell-copy{font-size:12px!important}#__uvd_farewell_popup__ .uvd-farewell-memory,#__uvd_farewell_popup__ .uvd-farewell-next{font-size:9.5px!important}
}

/* Radius slider controls every regular action button; round icon controls stay circular by intent. */
.uvd-tunable-ui .uvd-plrow-watch,
.uvd-tunable-ui .uvd-plrow-preview,
.uvd-tunable-ui .uvd-iframe-probe-btn,
.uvd-tunable-ui .uvd-feedback-vote,
.uvd-tunable-ui .uvd-history-actions .uvd-btn,
.uvd-tunable-ui .uvd-tutorial-nav-actions button,
.uvd-tunable-ui .uvd-movie-info-close{border-radius:var(--radius-sm)!important}
/* ===== PREVIEW POPUP: THE ACTUAL STREAM THUMBNAIL COMPONENT ===== */
#__uvd_media_preview__ .uvd-media-preview-stream-host{margin-top:12px}
#__uvd_media_preview__ .uvd-preview-stream-shell{margin:0!important;padding:0!important;border:0!important;background:transparent!important;box-shadow:none!important}
#__uvd_media_preview__ .uvd-preview-stream-shell>:not(.uvd-card-preview){display:none!important}
#__uvd_media_preview__ .uvd-preview-stream-shell .uvd-card-preview{margin:0!important}
/* ===== BREAK THE HEADER FRAME: MASCOT STANDS ON ITS EDGE ===== */
.uvd-main-clean #__uvd_header__{position:relative!important;overflow:visible!important;padding-left:102px!important;min-height:82px!important}
.uvd-main-clean #__uvd_header__ .uvd-brand{position:relative;min-width:0;padding:0!important}
.uvd-main-clean #__uvd_header__ .uvd-header-standing-mascot{
  position:absolute!important;
  z-index:8;
  left:12px;
  bottom:-3px;
  width:88px!important;
  height:102px!important;
  margin:0!important;
  transform:none!important;
  transform-origin:center bottom!important;
  filter:drop-shadow(0 9px 14px rgba(247,108,140,.22))!important;
  overflow:visible!important
}
.uvd-main-clean #__uvd_header__ .uvd-header-standing-mascot::after{display:none!important}
.uvd-main-clean #__uvd_header__ .uvd-header-standing-mascot svg{width:100%!important;height:100%!important;display:block!important}
.uvd-main-clean #__uvd_header__ .uvd-brand-text{min-width:0;padding:4px 0}
@media (max-width:560px){
  .uvd-main-clean #__uvd_header__{padding-left:82px!important;min-height:68px!important}.uvd-main-clean #__uvd_header__ .uvd-header-standing-mascot{left:7px;bottom:-2px;width:70px!important;height:84px!important}.uvd-main-clean #__uvd_header__ .uvd-brand-text{padding:2px 0}
}
/* ===== PREVIEW POPUP IS A FOCUSED STREAM CARD ===== */
#__uvd_media_preview__>.uvd-stream-preview-panel{width:min(94vw,560px)!important}
#__uvd_media_preview__ .uvd-stream-preview-list{margin-top:12px;min-height:0;overflow-y:auto;overscroll-behavior:contain}
#__uvd_media_preview__ .uvd-stream-preview-list .uvd-card{margin:0!important}
#__uvd_media_preview__ .uvd-stream-preview-list .uvd-stream-end{display:none!important}
#__uvd_media_preview__ .uvd-media-preview-back{width:100%;margin-top:12px;padding:11px 9px;border:1px solid rgba(194,150,255,.28);border-radius:var(--radius-sm);background:#fff;color:#8a6ab0;font-size:12px;font-weight:850;cursor:pointer}
/* ===== HEADER MASCOT STANDS STILL + EVENLY-SPACED SCENE LABELS ===== */
.uvd-main-clean #__uvd_header__ .uvd-header-standing-mascot{left:10px!important;bottom:0!important;width:94px!important;height:108px!important;animation:none!important}
.uvd-main-clean #__uvd_header__ .uvd-header-standing-mascot svg{animation:none!important}
@media (max-width:560px){.uvd-main-clean #__uvd_header__{padding-left:90px!important}.uvd-main-clean #__uvd_header__ .uvd-header-standing-mascot{left:6px!important;bottom:0!important;width:78px!important;height:94px!important}}
/* ===== PREVIEW: STREAM CORE ONLY, VIDEO-POPUP PURPLE PALETTE ===== */
#__uvd_media_preview__>.uvd-stream-preview-panel{background:linear-gradient(160deg,#f8f4ff 0%,#f1e9ff 52%,#fff0f8 100%)!important;overflow-y:auto!important}
#__uvd_media_preview__ .uvd-media-preview-kicker{color:#9a72c7!important}
#__uvd_media_preview__ .uvd-media-preview-title{color:#8e67bd!important}
#__uvd_media_preview__ .uvd-media-preview-url{background:rgba(255,255,255,.7)!important;color:#8667a2!important}
#__uvd_media_preview__ .uvd-stream-preview-core{margin-top:12px;min-height:0}
#__uvd_media_preview__ .uvd-stream-preview-core-card{margin:0!important;padding:12px!important;border-color:rgba(194,150,255,.28)!important;background:linear-gradient(145deg,#fff,#f7f1ff)!important;box-shadow:none!important}
#__uvd_media_preview__ .uvd-stream-preview-core-card .uvd-card-preview{margin:0 0 10px!important}
#__uvd_media_preview__ .uvd-stream-preview-core-card .uvd-card-guide{background:rgba(229,216,255,.48)!important;border-color:rgba(194,150,255,.22)!important;color:#826494!important}
#__uvd_media_preview__ .uvd-stream-preview-core-card .uvd-card-stream-meta{background:rgba(241,233,255,.75)!important;border-color:rgba(194,150,255,.22)!important;color:#8667a2!important}
#__uvd_media_preview__ .uvd-media-preview-actions{margin-top:12px!important}
#__uvd_media_preview__ .uvd-media-preview-actions .uvd-media-preview-play{background:linear-gradient(135deg,#b98df2,#9668d9)!important;box-shadow:0 7px 15px rgba(150,90,220,.2)!important}
/* Standing mascot is positioned against the Header itself, never the text brand. */
.uvd-main-clean #__uvd_header__ .uvd-brand{position:static!important}

/* ===== FULL-BODY HEADER CAT + A LITTLE MORE ROOM AROUND MAIN UI ===== */
.uvd-main-clean.uvd-app-shell{height:calc(100dvh - 38px)!important}
.uvd-main-clean #__uvd_header__{padding-left:108px!important;min-height:88px!important}
.uvd-main-clean #__uvd_header__ .uvd-header-standing-mascot{left:8px!important;bottom:-5px!important;width:96px!important;height:132px!important}
@media (max-width:560px){
  .uvd-main-clean.uvd-app-shell{height:calc(100dvh - 30px)!important}.uvd-main-clean #__uvd_header__{padding-left:90px!important;min-height:72px!important}.uvd-main-clean #__uvd_header__ .uvd-header-standing-mascot{left:4px!important;bottom:-4px!important;width:80px!important;height:112px!important}
}
/* ===== STANDING CAT MOTION + COLLAPSED MAIN UI REPAIR ===== */
/* The compact mode must win over the normal viewport-height rule. */
.uvd-main-clean.uvd-app-shell.uvd-panel-collapsed{height:auto!important;min-height:0!important;max-height:none!important;bottom:auto!important}
.uvd-main-clean.uvd-app-shell.uvd-panel-collapsed #__uvd_header{padding-left:108px!important;min-height:88px!important;margin:0!important}
.uvd-main-clean #__uvd_header__ .uvd-header-standing-mascot{position:absolute!important;isolation:isolate;animation:none!important}
.uvd-main-clean #__uvd_header__ .uvd-header-standing-mascot svg{animation:uvdHeaderCatStand 2.6s ease-in-out infinite!important;transform-origin:center bottom}
.uvd-main-clean #__uvd_header__ .uvd-header-standing-mascot::before,
.uvd-main-clean #__uvd_header__ .uvd-header-standing-mascot::after{display:block!important;position:absolute;z-index:4;pointer-events:none;line-height:1;text-shadow:0 2px 8px rgba(247,108,140,.22)}
.uvd-main-clean #__uvd_header__ .uvd-header-standing-mascot::before{content:'✦';top:8px;right:-6px;color:#c9a4ec;font-size:16px;animation:uvdHeaderSparkle 1.8s ease-in-out infinite}
.uvd-main-clean #__uvd_header__ .uvd-header-standing-mascot::after{content:'♡';top:24px;left:-8px;color:#f58baa;font-size:15px;animation:uvdHeaderSparkle 2.1s ease-in-out infinite .5s}
@keyframes uvdHeaderCatStand{0%,100%{transform:translateY(0) rotate(0)}50%{transform:translateY(-4px) rotate(-1deg)}}
@keyframes uvdHeaderSparkle{0%,100%{opacity:.35;transform:translateY(2px) scale(.82)}50%{opacity:1;transform:translateY(-4px) scale(1.12)}}
@media (max-width:560px){
  .uvd-main-clean.uvd-app-shell.uvd-panel-collapsed #__uvd_header{padding-left:90px!important;min-height:72px!important}.uvd-main-clean #__uvd_header__ .uvd-header-standing-mascot::before{top:5px;right:-5px;font-size:14px}.uvd-main-clean #__uvd_header__ .uvd-header-standing-mascot::after{top:18px;left:-6px;font-size:13px}
}
@media (prefers-reduced-motion:reduce){.uvd-main-clean #__uvd_header__ .uvd-header-standing-mascot svg,.uvd-main-clean #__uvd_header__ .uvd-header-standing-mascot::before,.uvd-main-clean #__uvd_header__ .uvd-header-standing-mascot::after{animation:none!important}}
/* ===== COLLAPSED HEADER: KEEP CAT EARS + BRAND TEXT IN SEPARATE LANES ===== */
.uvd-main-clean.uvd-app-shell{overflow:visible!important}
.uvd-main-clean.uvd-app-shell.uvd-panel-collapsed #__uvd_header__{padding:0!important;overflow:visible!important}
.uvd-main-clean.uvd-app-shell.uvd-panel-collapsed #__uvd_header__ .uvd-brand-text{margin-left:108px!important;min-width:0!important}
@media (max-width:560px){
  .uvd-main-clean.uvd-app-shell.uvd-panel-collapsed #__uvd_header__ .uvd-brand-text{margin-left:90px!important}
}
/* ===== LET THE STANDING CAT BREAK THE OUTER MAIN-PANEL BORDER ===== */
.uvd-main-clean.uvd-app-shell{overflow:visible!important}
.uvd-main-clean #__uvd_header__{z-index:20!important;overflow:visible!important;padding-left:118px!important}
.uvd-main-clean #__uvd_header__ .uvd-header-standing-mascot{z-index:30!important;left:7px!important;bottom:-4px!important;width:108px!important;height:150px!important}
.uvd-main-clean.uvd-app-shell.uvd-panel-collapsed #__uvd_header__ .uvd-brand-text{margin-left:118px!important}
@media (max-width:560px){
  .uvd-main-clean #__uvd_header__{padding-left:102px!important}.uvd-main-clean #__uvd_header__ .uvd-header-standing-mascot{left:2px!important;bottom:-4px!important;width:92px!important;height:130px!important}.uvd-main-clean.uvd-app-shell.uvd-panel-collapsed #__uvd_header__ .uvd-brand-text{margin-left:102px!important}
}
/* ===== MAIN TOP BREATHING ROOM + SELECTIVE BLUR EXPERIMENT ===== */
.uvd-main-clean.uvd-app-shell{top:30px!important;height:calc(100dvh - 54px)!important}
@media (max-width:560px){.uvd-main-clean.uvd-app-shell{top:28px!important;height:calc(100dvh - 48px)!important}}
/* Blur is intentionally limited to navigation chrome. Stream cards and content
   remain solid for Android readability/performance. */
@supports ((backdrop-filter:blur(1px)) or (-webkit-backdrop-filter:blur(1px))){
  .uvd-main-clean #__uvd_header__{backdrop-filter:blur(6px) saturate(120%)!important;-webkit-backdrop-filter:blur(6px) saturate(120%)!important}
  .uvd-main-clean .uvd-session-dock{backdrop-filter:blur(4px) saturate(115%)!important;-webkit-backdrop-filter:blur(4px) saturate(115%)!important}
  .uvd-popup-back-btn,.uvd-workflow-close,.uvd-media-preview-close,.uvd-dig-close{backdrop-filter:blur(6px) saturate(120%);-webkit-backdrop-filter:blur(6px) saturate(120%)}
}
/* Session Dock is the disposable scroll chrome; Header always stays put. */
.uvd-main-clean.uvd-session-hidden .uvd-session-dock{display:none!important}
/* ===== SESSION FADE, CAT CONTRAST, GLOBAL VIDEO RADIUS ===== */
.uvd-main-clean .uvd-session-dock{max-height:230px;overflow:hidden;opacity:1;filter:blur(0);transform:translateY(0) scale(1);transition:max-height .56s cubic-bezier(.22,1,.36,1),opacity .36s ease,transform .56s cubic-bezier(.22,1,.36,1),filter .32s ease,border-width .24s ease;will-change:max-height,opacity,transform,filter}
.uvd-main-clean.uvd-session-hidden .uvd-session-dock{display:block!important;max-height:0!important;min-height:0!important;opacity:0!important;filter:blur(2px)!important;transform:translateY(-16px) scale(.985)!important;border-width:0!important;pointer-events:none!important}
/* Give the pink cat a pale halo so it separates from the pink header. */
.uvd-main-clean #__uvd_header__ .uvd-header-standing-mascot{filter:drop-shadow(0 0 1px rgba(255,255,255,.95)) drop-shadow(0 9px 14px rgba(247,108,140,.24))!important}
.uvd-main-clean #__uvd_header__ .uvd-header-standing-mascot::before{content:''!important;inset:13px 5px 8px!important;z-index:0!important;background:radial-gradient(ellipse at center,rgba(255,255,255,.96),rgba(255,232,244,.58) 56%,transparent 72%)!important;font-size:0!important;animation:uvdHeaderCatHalo 2.6s ease-in-out infinite!important}
.uvd-main-clean #__uvd_header__ .uvd-header-standing-mascot::after{content:'✦'!important;top:7px!important;right:-7px!important;left:auto!important;z-index:2!important;color:#c9a4ec!important;font-size:16px!important;animation:uvdHeaderSparkle 1.8s ease-in-out infinite!important}
.uvd-main-clean #__uvd_header__ .uvd-header-standing-mascot svg{position:relative;z-index:1}
@keyframes uvdHeaderCatHalo{0%,100%{opacity:.56;transform:scale(.94)}50%{opacity:.94;transform:scale(1.04)}}
/* The setting's corner radius must win over legacy Player/video declarations. */
.uvd-tunable-ui .uvd-session-dock{border-radius:var(--radius-md)!important}
.uvd-tunable-ui #__uvd_video_wrapper__,
.uvd-tunable-ui #__uvd_player_el__,
.uvd-tunable-ui #__uvd_player_el__ video,
.uvd-tunable-ui #__uvd_player_el__ video-skin,
.uvd-tunable-ui .uvd-player-video-area{border-radius:var(--radius-md)!important}
@media (prefers-reduced-motion:reduce){.uvd-main-clean .uvd-session-dock{transition:none!important}.uvd-main-clean #__uvd_header__ .uvd-header-standing-mascot::before{animation:none!important}}
/* ===== CORNER INSET: KEEP CONTENT AWAY FROM LARGE RADIUS EDGES ===== */
.uvd-tunable-ui .uvd-session-dock{padding:var(--uvd-corner-inset)!important}
.uvd-tunable-ui .uvd-player-info-panel{padding-left:calc(13px + var(--uvd-corner-inset))!important;padding-right:calc(13px + var(--uvd-corner-inset))!important}
.uvd-tunable-ui .uvd-media-preview-panel,.uvd-tunable-ui .uvd-play-intro-card{scroll-padding:var(--uvd-corner-inset)}
/* ===== UNIFIED POPUP ENTRANCE: RISE LIKE SETTINGS ===== */
@keyframes uvdPopupSheetUp{from{opacity:0;transform:translateY(78px) scale(.985)}to{opacity:1;transform:translateY(0) scale(1)}}
@keyframes uvdPopupBackdropIn{from{opacity:0}to{opacity:1}}
#__uvd_digging_popup__,
#__uvd_media_links_prompt__,
#__uvd_iframe_workflow_prompt__,
#__uvd_play_intro__,
#__uvd_media_preview__,
#__uvd_resume_prompt__,
#__uvd_farewell_popup__,
#__uvd_tutorial__,
#__uvd_popup_reminder_prompt__{animation:uvdPopupBackdropIn .22s ease both!important}
#__uvd_digging_popup__>.uvd-digging-box,
#__uvd_media_links_prompt__>.uvd-glass-panel,
#__uvd_iframe_workflow_prompt__>.uvd-glass-panel,
#__uvd_play_intro__>.uvd-play-intro-card,
#__uvd_media_preview__>.uvd-media-preview-panel,
#__uvd_resume_prompt__>.uvd-resume-card,
#__uvd_farewell_popup__>.uvd-farewell-box,
#__uvd_tutorial__>.uvd-tutorial-box,
#__uvd_popup_reminder_prompt__>.uvd-deferred-reminder-card,
#__uvd_player_overlay__>.uvd-player-sheet{animation:uvdPopupSheetUp .42s cubic-bezier(.22,1,.36,1) both!important}
/* Digging exits upward after its successor has mounted; this must override its
   entrance animation so the handoff stays continuous. */
#__uvd_digging_popup__.uvd-dig-exit>.uvd-digging-box{animation:uvdDigBoxFlyUp .58s cubic-bezier(.45,0,.72,.22) forwards!important}
@media (prefers-reduced-motion:reduce){
  #__uvd_digging_popup__,#__uvd_media_links_prompt__,#__uvd_iframe_workflow_prompt__,#__uvd_play_intro__,#__uvd_media_preview__,#__uvd_resume_prompt__,#__uvd_farewell_popup__,#__uvd_tutorial__,#__uvd_popup_reminder_prompt__,
  #__uvd_digging_popup__>.uvd-digging-box,#__uvd_media_links_prompt__>.uvd-glass-panel,#__uvd_iframe_workflow_prompt__>.uvd-glass-panel,#__uvd_play_intro__>.uvd-play-intro-card,#__uvd_media_preview__>.uvd-media-preview-panel,#__uvd_resume_prompt__>.uvd-resume-card,#__uvd_farewell_popup__>.uvd-farewell-box,#__uvd_tutorial__>.uvd-tutorial-box,#__uvd_popup_reminder_prompt__>.uvd-deferred-reminder-card,#__uvd_player_overlay__>.uvd-player-sheet{animation:none!important}
}
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
  btn.innerHTML = '<span class="uvd-restore-dot"></span>';
  btn.title = 'Kéo để di chuyển · bấm để hiện Mèo cào media';
  btn.style.touchAction = 'none';
  btn.onclick = function() { if (!btn.__uvdDragged) __uvdSetHidden(false); btn.__uvdDragged = false; };
  var dragging = false, startX = 0, startY = 0, startLeft = 0, startTop = 0;
  btn.addEventListener('pointerdown', function(e) {
    dragging = true; btn.__uvdDragged = false; startX = e.clientX; startY = e.clientY;
    var r = btn.getBoundingClientRect(); startLeft = r.left; startTop = r.top;
    try { btn.setPointerCapture(e.pointerId); } catch(ex) {}
    e.preventDefault();
  });
  btn.addEventListener('pointermove', function(e) {
    if (!dragging) return;
    var dx = e.clientX - startX, dy = e.clientY - startY;
    if (Math.abs(dx) + Math.abs(dy) > 5) btn.__uvdDragged = true;
    btn.style.left = Math.max(4, Math.min(window.innerWidth - btn.offsetWidth - 4, startLeft + dx)) + 'px';
    btn.style.top = Math.max(4, Math.min(window.innerHeight - btn.offsetHeight - 4, startTop + dy)) + 'px';
    btn.style.right = 'auto'; btn.style.bottom = 'auto';
  });
  btn.addEventListener('pointerup', function() { dragging = false; });
  __uvdAppendRoot(btn);
}
function __uvdSetHidden(hidden) {
  __uvdScriptHidden = hidden;
  var panel = document.getElementById('__uvd__');
  var hideMode = data.settings.hideMode === 'header' ? 'header' : 'floating';
  if (panel) {
    panel.style.display = hidden && hideMode === 'floating' ? 'none' : '';
    panel.classList.toggle('uvd-panel-collapsed', hidden && hideMode === 'header');
  }
  if (hidden) {
    __uvdStartHardEmbedBlocker();
    // Kiểu floating: hiện nút nổi kéo đi được để mở lại panel.
    if (hideMode === 'floating') __uvdShowRestoreBtn();
    else __uvdRemoveRestoreBtn();
    // Resume only media that UMP itself paused during its initial scan.
    try {
      document.querySelectorAll('video,audio').forEach(function(media) {
        if (media.__uvdPausedByUvd && !isAdUrl(media.currentSrc || media.src || '')) {
          media.__uvdPausedByUvd = false;
          var playResult = media.play();
          if (playResult && playResult.catch) playResult.catch(function() {});
        }
      });
    } catch(e) {}
  } else __uvdRemoveRestoreBtn();
}
// ========== POPUP OVERLAY: HIDE UI + DEFERRED SESSION REMINDER ==========
// Specialist popups temporarily cover Main UI. If a user leaves one, Main UI
// returns with a contextual reminder under Current Session instead of a float.
// A deferred workflow gets one dedicated reminder popup first. Only an
// explicit "Để sau" folds it into the current-session rail below.
var __uvdPopupReminder = { kind: '', collapsed: false };
var __uvdMediaPopupUserDeferred = false;
var __uvdIframeWorkflowUserDeferred = false;
function __uvdRemovePopupReopenBtn() {
  // Remove an old button left by a previous in-page version, if one exists.
  var old = document.getElementById('__uvd_popup_reopen__');
  if (old) old.remove();
}
function __uvdClearPopupReminder(kind) {
  if (kind && __uvdPopupReminder.kind && __uvdPopupReminder.kind !== kind) return;
  var prompt = document.getElementById('__uvd_popup_reminder_prompt__');
  if (prompt) prompt.remove();
  __uvdPopupReminder.kind = '';
  __uvdPopupReminder.collapsed = false;
  __uvdRenderPopupReminder();
}
function __uvdPopupReminderInfo() {
  var kind = __uvdPopupReminder.kind;
  if (kind === 'media') {
    var direct = __uvdQualifiedDirectEntries();
    if (!direct.length) return null;
    return {
      kind: 'media', count: direct.length,
      mascot: typeof __uvdTabMascotRabbit !== 'undefined' ? __uvdTabMascotRabbit : '🐰',
      kicker: 'POPUP VIDEO ĐANG CHỜ',
      title: 'Mèo đang giữ ' + direct.length + ' link video thật',
      compact: direct.length + ' video đã kiểm chứng đang chờ',
      copy: 'Cưng đã để flow này lại. Khi sẵn sàng, mở Popup Video để xem, so sánh và vote nha.',
      button: 'Mở Popup Video'
    };
  }
  if (kind === 'iframe') {
    // A parent probe can turn an iframe route into verified direct media while
    // the user is reading Main UI. Promote the reminder instead of showing an
    // obsolete iframe action.
    if (__uvdQualifiedDirectEntries().length) {
      var keepRailCollapsed = __uvdPopupReminder.collapsed;
      __uvdPopupReminder.kind = 'media';
      __uvdPopupReminder.collapsed = keepRailCollapsed;
      // The user deferred the workflow, not only its old iframe route. A
      // late parent-probe result must therefore remain a UI reminder instead
      // of surprising them with an automatic Video popup.
      __uvdIframeWorkflowUserDeferred = false;
      __uvdMediaPopupUserDeferred = true;
      return __uvdPopupReminderInfo();
    }
    var frames = __uvdCollectWorkflowFrames().filter(function(candidate) {
      return candidate.verdict === 'PLAYER' || candidate.verdict === 'UNKNOWN';
    });
    if (!frames.length) return null;
    return {
      kind: 'iframe', count: frames.length,
      mascot: typeof __uvdTabMascotPanda !== 'undefined' ? __uvdTabMascotPanda : '🖼️',
      kicker: 'POPUP IFRAME ĐANG CHỜ',
      title: 'Mèo vẫn giữ ' + frames.length + ' player iframe',
      compact: frames.length + ' player iframe đang chờ',
      copy: 'Mèo chưa tự bật lại đâu. Mở popup khi cưng muốn dò qua trang mẹ hoặc chọn iframe nha.',
      button: 'Mở Popup Iframe'
    };
  }
  return null;
}
function __uvdOpenDeferredPopup() {
  var kind = __uvdPopupReminder.kind;
  if (!kind) return;
  __uvdClearPopupReminder();
  if (kind === 'iframe') {
    __uvdIframeWorkflowUserDeferred = false;
    __uvdMaybeOfferIframeWorkflow(true);
  } else {
    __uvdMediaPopupUserDeferred = false;
    __uvdMaybeOfferMediaPopup(true);
  }
}
function __uvdCollapseReminderToRail() {
  var prompt = document.getElementById('__uvd_popup_reminder_prompt__');
  if (prompt) prompt.remove();
  if (!__uvdPopupReminder.kind) return;
  __uvdPopupReminder.collapsed = true;
  __uvdRenderPopupReminder();
}
function __uvdShowPopupReminderPrompt() {
  var old = document.getElementById('__uvd_popup_reminder_prompt__');
  if (old) old.remove();
  var info = __uvdPopupReminderInfo();
  if (!info || !__uvdPopupReminder.kind) return;
  var overlay = document.createElement('div');
  overlay.id = '__uvd_popup_reminder_prompt__';
  overlay.className = 'uvd-deferred-reminder-overlay';
  var card = document.createElement('section');
  card.className = 'uvd-deferred-reminder-card';
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-modal', 'true');
  card.setAttribute('aria-label', 'Nhắc mở lại ' + info.kind);
  card.innerHTML =
    '<button type="button" class="uvd-deferred-reminder-close" title="Để sau">×</button>' +
    '<div class="uvd-deferred-reminder-mascot">' + info.mascot + '</div>' +
    '<div class="uvd-deferred-reminder-kicker">MÈO NHẮC NHẸ NÈ</div>' +
    '<div class="uvd-deferred-reminder-title">' + escapeHtml(info.title) + '</div>' +
    '<div class="uvd-deferred-reminder-copy">' + escapeHtml(info.copy) + '</div>' +
    '<div class="uvd-deferred-reminder-actions">' +
      '<button type="button" class="uvd-deferred-reminder-open">' + escapeHtml(info.button) + '</button>' +
      '<button type="button" class="uvd-deferred-reminder-later">Để sau</button>' +
    '</div>';
  overlay.appendChild(card);
  __uvdAppendRoot(overlay);
  function openFlow() {
    try { overlay.remove(); } catch(e) {}
    __uvdOpenDeferredPopup();
  }
  function later() { __uvdCollapseReminderToRail(); }
  card.querySelector('.uvd-deferred-reminder-open').onclick = openFlow;
  card.querySelector('.uvd-deferred-reminder-later').onclick = later;
  card.querySelector('.uvd-deferred-reminder-close').onclick = later;
  overlay.addEventListener('click', function(event) { if (event.target === overlay) later(); });
}
function __uvdSessionPopupGuideInfo() {
  // Never lead the user toward raw network leads. The persistent session line
  // only counts media with the same proof required by Popup Video.
  var direct = __uvdQualifiedDirectEntries();
  if (direct.length) {
    return {
      kind: 'media',
      mascot: typeof __uvdTabMascotRabbit !== 'undefined' ? __uvdTabMascotRabbit : '🐰',
      compact: direct.length + ' link đã kiểm chứng sẵn sàng',
      message: 'Link nhiều quá không biết xem ở đâu?',
      detail: 'Chúng tui lựa và kiểm chứng cho bạn · ' + direct.length + ' link thật'
    };
  }
  var frames = __uvdCollectWorkflowFrames().filter(function(candidate) {
    return candidate.verdict === 'PLAYER' || candidate.verdict === 'UNKNOWN';
  });
  if (frames.length) {
    return {
      kind: 'iframe',
      mascot: typeof __uvdTabMascotPanda !== 'undefined' ? __uvdTabMascotPanda : '🖼️',
      compact: frames.length + ' player iframe đang chờ',
      message: 'Mèo đã lựa được player có triển vọng',
      detail: frames.length + ' iframe đang chờ cưng kiểm tra'
    };
  }
  return {
    kind: 'scan',
    mascot: typeof __uvdTabMascotCat !== 'undefined' ? __uvdTabMascotCat : '🐾',
    compact: 'Mèo đang lọc link',
    message: 'Chưa biết xem ở đâu hả?',
    detail: 'Mở video rồi bấm Play để Mèo lựa và kiểm chứng cho bạn nha'
  };
}
function __uvdOpenSessionPopup(kind) {
  if (kind !== 'media' && kind !== 'iframe') return;
  __uvdClearPopupReminder();
  if (kind === 'iframe') {
    __uvdIframeWorkflowUserDeferred = false;
    __uvdMaybeOfferIframeWorkflow(true);
  } else {
    __uvdMediaPopupUserDeferred = false;
    __uvdMaybeOfferMediaPopup(true);
  }
}
function __uvdRenderPopupReminder() {
  var slot = document.getElementById('__uvd_popup_reminder_slot__');
  if (!slot) return;
  slot.innerHTML = '';
  var pending = __uvdPopupReminder.kind ? __uvdPopupReminderInfo() : null;
  if (__uvdPopupReminder.kind && !pending) {
    __uvdPopupReminder.kind = '';
    __uvdPopupReminder.collapsed = false;
    var stalePrompt = document.getElementById('__uvd_popup_reminder_prompt__');
    if (stalePrompt) stalePrompt.remove();
  }
  // This rail is intentionally permanent under Current Session. The temporary
  // reminder popup is additive; it never replaces the verified-result guide.
  var info = pending || __uvdSessionPopupGuideInfo();
  var actionable = info.kind === 'media' || info.kind === 'iframe';
  var deferred = !!pending && actionable;
  var dock = slot.closest('#__uvd_session_dock__');
  if (dock) {
    dock.classList.remove('uvd-session-state-scan', 'uvd-session-state-media', 'uvd-session-state-iframe');
    dock.classList.add('uvd-session-state-' + (info.kind || 'scan'));
    var status = dock.querySelector('#__uvd_session_status__');
    if (status) status.textContent = info.kind === 'media' ? 'ĐÃ KIỂM CHỨNG' : (info.kind === 'iframe' ? 'ĐÃ THẤY PLAYER' : 'ĐANG LẮNG NGHE');
  }
  var reminder = document.createElement('section');
  reminder.className = 'uvd-popup-reminder uvd-popup-reminder-rail';
  reminder.setAttribute('aria-label', actionable ? 'Mở popup ' + info.kind : 'Trạng thái đào link');
  var guideMessage = info.message || info.compact;
  var guideDetail = info.detail || '';
  reminder.innerHTML = '<span class="uvd-popup-reminder-mascot">' + info.mascot + '</span>' +
    (actionable
      ? '<button type="button" class="uvd-popup-reminder-compact-open"><span class="uvd-session-guide-copy">' + escapeHtml(guideMessage) + '</span><small>' + escapeHtml(guideDetail) + '</small><b>' + (deferred ? 'Mở lại ♡' : 'Mở Popup ♡') + '</b></button>'
      : '<span class="uvd-popup-reminder-passive"><strong>' + escapeHtml(guideMessage) + '</strong><small>' + escapeHtml(guideDetail) + '</small></span>');
  slot.appendChild(reminder);
  var open = reminder.querySelector('.uvd-popup-reminder-compact-open');
  if (open) open.onclick = function() {
    if (deferred) __uvdOpenDeferredPopup();
    else __uvdOpenSessionPopup(info.kind);
  };
}
function __uvdSetPopupReminder(kind) {
  if (kind !== 'media' && kind !== 'iframe') return;
  __uvdPopupReminder.kind = kind;
  __uvdPopupReminder.collapsed = false;
  if (kind === 'media') __uvdMediaPopupUserDeferred = true;
  else __uvdIframeWorkflowUserDeferred = true;
  __uvdRenderPopupReminder();
  __uvdShowPopupReminderPrompt();
}
function __uvdShowPopupReopenBtn(kind) {
  // Compatibility name for existing cancellation paths. The flow is now:
  // a real reminder popup first, then a Current Session rail on "Để sau".
  __uvdSetPopupReminder(kind);
}
// Hide the whole UMP panel (cute popup takes priority and must not be covered).
var __uvdPopupActive = false;
function __uvdHideUiForPopup() {
  __uvdPopupActive = true;
  var p = document.getElementById('__uvd__');
  if (p) { p.style.display = 'none'; p.__uvdPopupHidden = true; }
}
function __uvdRestoreUiAfterPopup() {
  __uvdPopupActive = false;
  var p = document.getElementById('__uvd__');
  if (p && p.__uvdPopupHidden) { p.__uvdPopupHidden = false; p.style.display = ''; }
  __uvdRemovePopupReopenBtn();
  __uvdRenderPopupReminder();
}
function __uvdPopupDismiss() {
  __uvdRestoreUiAfterPopup();
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
// Popup cards expand only as their contents need, up to a safe viewport cap.
// This keeps short notices compact while long video/iframe/fact content gains room.
function __uvdAutoFitPopup(card, minRatio, maxRatio) {
  if (!card || !card.isConnected) return;
  minRatio = minRatio == null ? .52 : minRatio;
  maxRatio = maxRatio == null ? .90 : maxRatio;
  card.classList.add('uvd-auto-fit-popup');
  function fit() {
    if (!card.isConnected) return;
    var viewport = window.innerHeight || 720;
    var min = Math.round(viewport * minRatio);
    var max = Math.round(viewport * maxRatio);
    card.style.height = 'auto';
    card.style.maxHeight = max + 'px';
    var desired = card.scrollHeight;
    var target = Math.min(max, Math.max(min, desired));
    card.style.height = target + 'px';
    card.style.overflowY = desired > max ? 'auto' : 'hidden';
  }
  requestAnimationFrame(fit);
  setTimeout(fit, 100);
}

// ========== IFRAME WORKFLOW ==========
var __uvdIframeWorkflowAsked = false;
var __uvdIframeWorkflowDismissedAt = 0;
var __uvdIframeWorkflowEarliest = Date.now() + __uvdDiggingWaitMs - 500;
var __uvdDemoPreviewMaxSeconds = 90;
function __uvdIsLikelyVideoIframe(url) {
  if (__uvdIsEmbedMediaUrl(url)) return true;
  try {
    var parsed = new URL(url, location.href);
    return /player|video|embed|stream|watch/i.test((parsed.hostname || '') + ' ' + (parsed.pathname || ''));
  } catch(e) { return false; }
}
function __uvdIsDemoVideoElement(video) {
  if (!video) return false;
  var duration = video.duration;
  if ((!duration || isNaN(duration)) && video.readyState < 1) return !video.currentSrc && !video.src;
  if (isFinite(duration) && duration > 0 && duration <= __uvdDemoPreviewMaxSeconds) return true;
  var hint = ((video.currentSrc || video.src || '') + ' ' + (video.getAttribute('poster') || '')).toLowerCase();
  return /preview|trailer|sample|teaser|demo/.test(hint);
}
// AI-like weighted classifier for an opaque (cross-origin) iframe. We cannot
// read inside the frame, so we combine many weak signals into a score:
//  - URL host/path cues (known embed players, /e//embed/player/watch patterns)
//  - known ad/tracker/popup marker lists
//  - element geometry (size, aspect ratio, visibility, id/class hints)
//  - network evidence: does this iframe's host serve media on this page?
// Returns { score, verdict: 'PLAYER'|'JUNK'|'UNKNOWN', reasons:[...] }.
var __uvdAiJunkMarkers = [
  'doubleclick', 'googlesyndication', 'adservice', 'popunder', 'popads',
  'clickadu', 'exoclick', 'propeller', 'betting', 'casino', 'adsterra',
  'trafficjunky', 'onclickads', 'smartpop', 'go.mnaspm', 'go.mayzaent',
  'bluetrafficstream', 'juicyads', 'adcash', 'pop.js', 'pop-', 'advert',
  'ads?', '/ad/', '/ads', 'adserver', 'pubguru', 'prebid', 'criteo', 'taboola'
];
function __uvdClassifyIframe(url, element) {
  var lower = String(url || '').toLowerCase();
  var reasons = [];
  var score = 0;
  // 1) Hard ad markers -> strongly negative.
  for (var a = 0; a < __uvdAiJunkMarkers.length; a++) {
    if (lower.indexOf(__uvdAiJunkMarkers[a]) !== -1) { score = -100; reasons.push('junk:' + __uvdAiJunkMarkers[a]); break; }
  }
  if (isAdUrl(url)) { score -= 80; reasons.push('filterlist'); }
  // 2) Known player host or embed/path cues.
  var host = __uvdMediaHostOf(url);
  if (host && __uvdKnownPlayerHosts.indexOf(host) !== -1) { score += 55; reasons.push('known-player'); }
  // 2b) Self-learned verdict (from previous sessions) beats static guessing.
  var learned = __uvdLearnedVerdict(host);
  if (learned === 'PLAYER') { score += 65; reasons.push('learned-player'); }
  else if (learned === 'JUNK') { score -= 95; reasons.push('learned-junk'); }
  if (__uvdIsEmbedMediaUrl(url)) { score += 45; reasons.push('embed-url'); }
  if (/embed|player|video|stream|watch|\/e(?:\/|$)|\/v(?:\/|$)/i.test(lower)) score += 25;
  if (/player|video|stream|play|hls|tape|cdn|mixdrop|dood/i.test(lower)) score += 12;
  // 3) Network evidence: iframe host also serves media on this page.
  var ev = host ? (__uvdMediaEvidence[host] || 0) : 0;
  if (ev > 0) { score += 40 + Math.min(30, ev * 6); reasons.push('media-evidence:' + ev); }
  // 4) Geometry & DOM hints from the real iframe element.
  if (element) {
    try {
      var rect = element.getBoundingClientRect();
      if (rect.width >= 240 && rect.height >= 120) { score += 22; reasons.push('big'); }
      if (rect.width > 0 && rect.height > 0) {
        var ratio = rect.width / rect.height;
        if (ratio >= 1.2 && ratio <= 2.5) { score += 10; reasons.push('ratio16x9'); }
      }
      if (rect.width < 80 || rect.height < 60) score -= 20;
      var hint = ((element.id || '') + ' ' + (typeof element.className === 'string' ? element.className : '')).toLowerCase();
      if (/player|video|embed|stream|media/.test(hint)) { score += 18; reasons.push('elem-hint'); }
      var cs = getComputedStyle(element);
      if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') score -= 30;
    } catch(e) {}
  }
  // 5) small file-type/static iframes are junk.
  if (/\.(gif|png|jpe?g|css|js|woff2?|svg|ico)(?:[?#]|$)/i.test(lower)) score -= 25;
  var verdict = score >= 50 ? 'PLAYER' : (score <= -15 ? 'JUNK' : 'UNKNOWN');
  return { score: score, verdict: verdict, reasons: reasons };
}
function __uvdScoreIframeCandidate(url, element) {
  return __uvdClassifyIframe(url, element).score;
}
function __uvdCollectWorkflowFrames() {
  var map = {};
  function add(url, element) {
    if (!url || isAdUrl(url)) return;
    var cls = __uvdClassifyIframe(url, element);
    if (cls.score < -50) return;
    if (!map[url] || cls.score > map[url].score) map[url] = { url: url, score: cls.score, verdict: cls.verdict, reasons: cls.reasons, element: element };
  }
  [...urls.entries()].forEach(function(entry) {
    if (entry[1].type === 'IFRAME') add(entry[0], null);
  });
  try {
    if (__uvdIsEmbedMediaUrl(location.href)) add(location.href, null);
    document.querySelectorAll('iframe').forEach(function(frame) { if (frame.src) add(frame.src, frame); });
  } catch(e) {}
  return Object.keys(map).map(function(key) { return map[key]; }).sort(function(a, b) { return b.score - a.score; });
}

function __uvdHasOnlyIframeOrDemo() {
  var frames = __uvdCollectWorkflowFrames();
  if (!frames.length) return false;
  var direct = [...urls.entries()].filter(function(entry) {
    return ['M3U8','MP4','MPD','WEBM','TS'].indexOf(entry[1].type) !== -1;
  });
  if (!direct.length) return true;
  var videos = [];
  try { videos = [...document.querySelectorAll('video')].filter(function(video) { return !__uvdIsOwnUI(video); }); } catch(e) {}
  // A URL found in JSON/network is only a candidate until a real page video
  // has loaded. An unready video or a short demo must not suppress the iframe
  // workflow prompt.
  if (!videos.length) return true;
  // A real video element may still be initializing. Do not show the iframe
  // prompt while its duration/source is unresolved; wait for metadata first.
  if (videos.some(function(video) {
    return !!(video.currentSrc || video.src || video.querySelector('source[src]')) && video.readyState < 1 && !isFinite(video.duration);
  })) return false;
  var verifiedLongVideo = videos.some(function(video) {
    return video.readyState >= 2 && !__uvdIsDemoVideoElement(video);
  });
  if (verifiedLongVideo) return false;
  return true;
}
// Cute illustration for the "only iframe, no video link yet" popup.
// A soft kawaii cat searching with a magnifying glass (inline SVG, no external file).
var __uvdIframeCuteArt =
  '<svg width="240" height="180" viewBox="0 0 240 180" fill="none" xmlns="http://www.w3.org/2000/svg">' +
    '<ellipse cx="120" cy="150" rx="88" ry="16" fill="#f3d8e3" opacity="0.6"/>' +
    '<ellipse cx="120" cy="92" rx="66" ry="58" fill="#ffe0ea"/>' +
    '<path d="M60 62 L42 20 L92 50 Z" fill="#ffb6c6"/>' +
    '<path d="M180 62 L198 20 L148 50 Z" fill="#ffb6c6"/>' +
    '<path d="M60 62 L50 28 L82 52 Z" fill="#ff9fb4"/>' +
    '<path d="M180 62 L190 28 L158 52 Z" fill="#ff9fb4"/>' +
    '<circle cx="96" cy="88" r="10" fill="#5b3a40"/>' +
    '<circle cx="144" cy="88" r="10" fill="#5b3a40"/>' +
    '<circle cx="99" cy="85" r="3.4" fill="#fff"/>' +
    '<circle cx="147" cy="85" r="3.4" fill="#fff"/>' +
    '<ellipse cx="80" cy="102" rx="8" ry="5" fill="#ff8fa3" opacity="0.85"/>' +
    '<ellipse cx="160" cy="102" rx="8" ry="5" fill="#ff8fa3" opacity="0.85"/>' +
    '<ellipse cx="120" cy="103" rx="6" ry="7" fill="#5b3a40"/>' +
    '<ellipse cx="120" cy="101" rx="3.2" ry="3" fill="#e8788f"/>' +
    '<circle cx="176" cy="120" r="16" fill="#fff" stroke="#ff8fa3" stroke-width="4.5"/>' +
    '<line x1="188" y1="132" x2="202" y2="148" stroke="#ff8fa3" stroke-width="5" stroke-linecap="round"/>' +
    '<circle cx="170" cy="114" r="4" fill="#ffc2d1"/>' +
    '<text x="120" y="178" text-anchor="middle" font-size="13" font-weight="700" fill="#e8788f" font-family="Segoe UI, Arial, sans-serif">\uD83D\uDCAD  link video \u0111\u00E2u r\u1ED3i nh\u1EC9?</text>' +
  '</svg>';

// Cute header mascot — a round kawaii cat/film character (inline SVG).
var __uvdHeaderMascot =
  '<svg width="64" height="64" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">' +
    '<circle cx="32" cy="34" r="24" fill="#ffe0ea"/>' +
    '<circle cx="20" cy="20" r="11" fill="#ffb6c6"/>' +
    '<circle cx="44" cy="20" r="11" fill="#ffb6c6"/>' +
    '<path d="M20 20 L12 6 L28 14 Z" fill="#ff9fb4"/>' +
    '<path d="M44 20 L52 6 L36 14 Z" fill="#ff9fb4"/>' +
    '<circle cx="26" cy="34" r="3.6" fill="#5b3a40"/>' +
    '<circle cx="38" cy="34" r="3.6" fill="#5b3a40"/>' +
    '<circle cx="27" cy="33" r="1.2" fill="#fff"/>' +
    '<circle cx="39" cy="33" r="1.2" fill="#fff"/>' +
    '<ellipse cx="32" cy="41" rx="3.4" ry="4.4" fill="#5b3a40"/>' +
    '<ellipse cx="32" cy="39.5" rx="1.7" ry="1.8" fill="#e8788f"/>' +
    '<circle cx="20" cy="43" r="4" fill="#ffb6c6" opacity="0.9"/>' +
    '<circle cx="44" cy="43" r="4" fill="#ffb6c6" opacity="0.9"/>' +
    '<path d="M32 48 q2 4 0 6" stroke="#5b3a40" stroke-width="1.6" stroke-linecap="round" fill="none"/>' +
  '</svg>';
// NEW: hero mascot to cho Settings header - to, khong dong khung, co chuyen dong rieng, khong trung profile
var __uvdHeroMascot =
  '<svg width="120" height="120" viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">' +
    '<ellipse cx="60" cy="106" rx="42" ry="12" fill="#f3d8e3" opacity=".45"/>' +
    '<ellipse cx="60" cy="62" rx="44" ry="40" fill="#ffe0ea" stroke="#ffd6e6" stroke-width="1.6"/>' +
    '<circle cx="33" cy="36" r="18" fill="#ffb6c6"/><circle cx="87" cy="36" r="18" fill="#ffb6c6"/>' +
    '<path d="M33 36 L20 12 L52 26 Z" fill="#ff9fb4"/><path d="M87 36 L100 12 L68 26 Z" fill="#ff9fb4"/>' +
    '<g class="uvd-hero-ear-bow" style="transform-origin:88px 22px"><path d="M78 22 Q88 8 98 22 Q88 32 78 22 Z" fill="#f76c8c"/><circle cx="88" cy="22" r="5" fill="#fff"/><circle cx="88" cy="22" r="2.6" fill="#ff8fa3"/></g>' +
    '<circle cx="45" cy="64" r="7" fill="#5b3a40"/><circle cx="75" cy="64" r="7" fill="#5b3a40"/><circle cx="47" cy="62" r="2.4" fill="#fff"/><circle cx="77" cy="62" r="2.4" fill="#fff"/>' +
    '<g class="uvd-hero-cheek"><ellipse cx="38" cy="78" rx="9" ry="5.5" fill="#ff8fa3" opacity=".72"/><ellipse cx="82" cy="78" rx="9" ry="5.5" fill="#ff8fa3" opacity=".72"/></g>' +
    '<ellipse cx="60" cy="75" rx="7" ry="9" fill="#5b3a40"/><ellipse cx="60" cy="73" rx="3.2" ry="3.8" fill="#e8788f"/>' +
    '<path d="M60 84 q-7 7 -12 3 M60 84 q7 7 12 3" stroke="#5b3a40" stroke-width="2.2" stroke-linecap="round" fill="none"/>' +
    '<g class="uvd-hero-heart" style="transform-origin:60px 20px"><text x="60" y="18" text-anchor="middle" font-size="14" font-weight="900" fill="#f76c8c">♡</text></g>' +
  '</svg>';

// Full-body standing cat reserved for the Main Header. Its tall silhouette is
// intentional: it stands on the header edge rather than behaving like an icon.
var __uvdHeaderStandingCat =
  '<svg viewBox="0 0 120 170" fill="none" xmlns="http://www.w3.org/2000/svg">' +
    '<ellipse cx="62" cy="158" rx="38" ry="8" fill="#e8bfd1" opacity=".55"/>' +
    '<path d="M35 132 Q10 123 16 100 Q21 89 38 103" fill="#ffb5c8" stroke="#eb89a8" stroke-width="2"/>' +
    '<ellipse cx="61" cy="125" rx="32" ry="35" fill="#ffe0ea" stroke="#f3a5bd" stroke-width="2"/>' +
    '<ellipse cx="61" cy="142" rx="25" ry="17" fill="#fff7fb"/>' +
    '<path d="M38 111 Q28 122 32 135" stroke="#f58baa" stroke-width="7" stroke-linecap="round"/>' +
    '<path d="M84 111 Q94 122 90 135" stroke="#f58baa" stroke-width="7" stroke-linecap="round"/>' +
    '<ellipse cx="47" cy="154" rx="13" ry="8" fill="#ffe0ea" stroke="#f3a5bd" stroke-width="2"/>' +
    '<ellipse cx="75" cy="154" rx="13" ry="8" fill="#ffe0ea" stroke="#f3a5bd" stroke-width="2"/>' +
    '<path d="M31 83 L22 34 L50 62 Z" fill="#ffb4c9" stroke="#f3a5bd" stroke-width="2"/>' +
    '<path d="M91 83 L100 34 L72 62 Z" fill="#ffb4c9" stroke="#f3a5bd" stroke-width="2"/>' +
    '<path d="M31 76 L27 47 L46 66 Z" fill="#f57fa2"/><path d="M91 76 L95 47 L76 66 Z" fill="#f57fa2"/>' +
    '<ellipse cx="61" cy="84" rx="39" ry="34" fill="#ffe5ee" stroke="#f3a5bd" stroke-width="2"/>' +
    '<ellipse cx="48" cy="85" rx="5" ry="6" fill="#513843"/><ellipse cx="74" cy="85" rx="5" ry="6" fill="#513843"/>' +
    '<circle cx="49" cy="83" r="1.7" fill="#fff"/><circle cx="75" cy="83" r="1.7" fill="#fff"/>' +
    '<ellipse cx="61" cy="96" rx="4" ry="3.5" fill="#e8788f"/><path d="M61 100 q-6 7 -11 1 M61 100 q6 7 11 1" stroke="#513843" stroke-width="1.7" stroke-linecap="round" fill="none"/>' +
    '<ellipse cx="37" cy="98" rx="7" ry="4" fill="#ff9fba" opacity=".75"/><ellipse cx="85" cy="98" rx="7" ry="4" fill="#ff9fba" opacity=".75"/>' +
    '<path d="M80 58 Q89 48 98 58 Q89 67 80 58 Z" fill="#f76c8c"/><circle cx="89" cy="58" r="3.5" fill="#fff"/>' +
    '<text x="57" y="24" text-anchor="middle" font-size="14" font-weight="900" fill="#f76c8c">♡</text>' +
  '</svg>';

// Cute bear mascot for the settings footer (inline SVG).
var __uvdFooterMascot =
  '<svg width="72" height="72" viewBox="0 0 72 72" fill="none" xmlns="http://www.w3.org/2000/svg">' +
    '<circle cx="22" cy="22" r="13" fill="#f5d0b8"/>' +
    '<circle cx="50" cy="22" r="13" fill="#f5d0b8"/>' +
    '<circle cx="36" cy="38" r="24" fill="#fbe3d0"/>' +
    '<circle cx="27" cy="36" r="3.6" fill="#4a3550"/>' +
    '<circle cx="45" cy="36" r="3.6" fill="#4a3550"/>' +
    '<circle cx="28" cy="34.8" r="1.2" fill="#fff"/>' +
    '<circle cx="46" cy="34.8" r="1.2" fill="#fff"/>' +
    '<ellipse cx="36" cy="43" rx="3.4" ry="4" fill="#4a3550"/>' +
    '<ellipse cx="36" cy="41.8" rx="1.6" ry="1.8" fill="#e8788f"/>' +
    '<ellipse cx="25" cy="44" rx="5" ry="3.5" fill="#f8c8ac" opacity="0.9"/>' +
    '<ellipse cx="47" cy="44" rx="5" ry="3.5" fill="#f8c8ac" opacity="0.9"/>' +
  '</svg>';
// NEW: thu cam video - hamster dang om video player cute
var __uvdPlayerMascotHoldingVideo =
  '<svg width="120" height="90" viewBox="0 0 120 90" fill="none" xmlns="http://www.w3.org/2000/svg">' +
    '<ellipse cx="30" cy="78" rx="18" ry="6" fill="#fde2a8" opacity=".4"/>' +
    '<ellipse cx="30" cy="58" rx="20" ry="18" fill="#ffd38a" stroke="#fcbf6a" stroke-width="1.2"/>' +
    '<circle cx="18" cy="36" r="9" fill="#fcbf6a"/><circle cx="42" cy="36" r="9" fill="#fcbf6a"/>' +
    '<circle cx="24" cy="54" r="4" fill="#4a2c20"/><circle cx="36" cy="54" r="4" fill="#4a2c20"/>' +
    '<ellipse cx="20" cy="62" rx="6" ry="5" fill="#fff6c8"/><ellipse cx="40" cy="62" rx="6" ry="5" fill="#fff6c8"/>' +
    '<ellipse cx="30" cy="60" rx="2" ry="1.6" fill="#ff8fa3"/>' +
    '<g><rect x="55" y="22" width="56" height="36" rx="8" fill="#1a1a2e" stroke="#ff9fb4" stroke-width="1.5"/><rect x="58" y="25" width="50" height="26" rx="5" fill="#0f0f23"/><polygon points="74,32 74,46 86,39" fill="#ff9fb4"/><circle cx="62" cy="30" r="2" fill="#ff5d72"/><circle cx="67" cy="30" r="2" fill="#ffd38a"/><circle cx="72" cy="30" r="2" fill="#3aa97f"/></g>' +
    '<ellipse cx="18" cy="68" rx="8" ry="10" fill="#ffd38a" stroke="#fcbf6a" stroke-width="1"/><ellipse cx="42" cy="68" rx="8" ry="10" fill="#ffd38a" stroke="#fcbf6a" stroke-width="1"/>' +
  '</svg>';

// Cute rabbit mascot for the "found real video links" popup (inline SVG).
var __uvdMediaCuteArt =
  '<svg width="250" height="180" viewBox="0 0 250 180" fill="none" xmlns="http://www.w3.org/2000/svg">' +
    '<ellipse cx="125" cy="158" rx="92" ry="14" fill="#e7dcff" opacity="0.6"/>' +
    '<ellipse cx="125" cy="120" rx="60" ry="50" fill="#ffffff" stroke="#e4d5ff" stroke-width="2"/>' +
    '<path d="M78 120 Q60 40 96 58 Q90 90 96 112 Z" fill="#ffffff" stroke="#e4d5ff" stroke-width="2"/>' +
    '<path d="M172 120 Q190 40 154 58 Q160 90 154 112 Z" fill="#ffffff" stroke="#e4d5ff" stroke-width="2"/>' +
    '<path d="M80 52 Q72 44 74 40 Q86 40 92 50 Z" fill="#ffc9de"/>' +
    '<path d="M170 52 Q178 44 176 40 Q164 40 158 50 Z" fill="#ffc9de"/>' +
    '<circle cx="106" cy="112" r="7" fill="#4a3550"/>' +
    '<circle cx="144" cy="112" r="7" fill="#4a3550"/>' +
    '<circle cx="108.5" cy="110" r="2.4" fill="#fff"/>' +
    '<circle cx="146.5" cy="110" r="2.4" fill="#fff"/>' +
    '<ellipse cx="125" cy="122" rx="4.5" ry="5.5" fill="#ff9fb4"/>' +
    '<ellipse cx="125" cy="120.5" rx="2" ry="2" fill="#d85c7a"/>' +
    '<ellipse cx="95" cy="128" rx="6" ry="4" fill="#ffc9de" opacity="0.85"/>' +
    '<ellipse cx="155" cy="128" rx="6" ry="4" fill="#ffc9de" opacity="0.85"/>' +
    '<circle cx="125" cy="142" r="16" fill="#f0a5ff" opacity="0.85"/>' +
    '<path d="M120 138 L120 146 L130 142 Z" fill="#ffffff"/>' +
    '<circle cx="42" cy="60" r="7" fill="#ffd9e8" opacity="0.7"/>' +
    '<circle cx="208" cy="60" r="7" fill="#ffd9e8" opacity="0.7"/>' +
  '</svg>';

// Cute "Khi bấm Play" intro: con thỏ to ôm bắp rang + chữ "Giờ mở video nè" (inline SVG).
var __uvdPlayIntroArt =
  '<svg width="300" height="250" viewBox="0 0 300 250" fill="none" xmlns="http://www.w3.org/2000/svg">' +
    '<circle cx="50" cy="56" r="12" fill="#ffd9e8" opacity="0.7"/>' +
    '<circle cx="252" cy="50" r="10" fill="#ffe0ea" opacity="0.8"/>' +
    '<path d="M36 196 q-11 10 -8 22 q13 3 17 -13 Z" fill="#ffd9e8" opacity="0.6"/>' +
    '<ellipse cx="150" cy="216" rx="118" ry="16" fill="#e7dcff" opacity="0.6"/>' +
    '<ellipse cx="150" cy="176" rx="70" ry="56" fill="#ffffff" stroke="#e4d5ff" stroke-width="2"/>' +
    '<path d="M88 168 Q60 56 110 84 Q104 126 110 158 Z" fill="#ffffff" stroke="#e4d5ff" stroke-width="2"/>' +
    '<path d="M212 168 Q240 56 190 84 Q196 126 190 158 Z" fill="#ffffff" stroke="#e4d5ff" stroke-width="2"/>' +
    '<path d="M96 150 Q82 76 108 92 Q104 120 106 150 Z" fill="#ffc9de"/>' +
    '<path d="M204 150 Q218 76 192 92 Q196 120 194 150 Z" fill="#ffc9de"/>' +
    '<ellipse cx="150" cy="156" rx="60" ry="52" fill="#ffffff" stroke="#e4d5ff" stroke-width="2"/>' +
    '<circle cx="126" cy="148" r="8" fill="#4a3550"/>' +
    '<circle cx="174" cy="148" r="8" fill="#4a3550"/>' +
    '<circle cx="129" cy="145.5" r="2.6" fill="#fff"/>' +
    '<circle cx="177" cy="145.5" r="2.6" fill="#fff"/>' +
    '<ellipse cx="150" cy="161" rx="5" ry="6" fill="#ff9fb4"/>' +
    '<ellipse cx="150" cy="159.5" rx="2.2" ry="2.2" fill="#d85c7a"/>' +
    '<ellipse cx="106" cy="164" rx="9" ry="5.5" fill="#ffc9de" opacity="0.9"/>' +
    '<ellipse cx="194" cy="164" rx="9" ry="5.5" fill="#ffc9de" opacity="0.9"/>' +
    '<path d="M134 170 Q150 182 166 170" stroke="#4a3550" stroke-width="2.4" stroke-linecap="round" fill="none"/>' +
    '<path d="M112 210 L116 182 L184 182 L188 210 Z" fill="#f76c8c"/>' +
    '<ellipse cx="150" cy="182" rx="34" ry="10" fill="#ff8fa3"/>' +
    '<circle cx="136" cy="177" r="7" fill="#fff7d6"/>' +
    '<circle cx="152" cy="174" r="8" fill="#fff7d6"/>' +
    '<circle cx="168" cy="177" r="7" fill="#fff7d6"/>' +
    '<circle cx="143" cy="168" r="6" fill="#ffe9a8"/>' +
    '<circle cx="160" cy="167" r="6" fill="#ffe9a8"/>' +
    '<path d="M240 112 l4 10 10 4 -10 4 -4 10 -4 -10 -10 -4 10 -4 Z" fill="#ffd6e4"/>' +
    '<path d="M52 142 l3 8 8 3 -8 3 -3 8 -3 -8 -8 -3 8 -3 Z" fill="#e4d5ff"/>' +
    '<path d="M246 176 l3 7 7 3 -7 3 -3 7 -3 -7 -7 -3 7 -3 Z" fill="#ffd6e4"/>' +
  '</svg>';

// Popup đầu phiên: mèo đang đào link. SVG inline để vẫn chạy được ở site
// chặn ảnh/CDN bên ngoài.
var __uvdDiggingCatArt =
  '<svg viewBox="0 0 260 250" fill="none" xmlns="http://www.w3.org/2000/svg">' +
    '<ellipse cx="130" cy="230" rx="105" ry="14" fill="#e9bfd0" opacity=".6"/>' +
    '<path d="M30 210 Q44 185 72 197 Q86 177 112 194 Q133 178 154 194 Q180 180 198 200 Q224 190 236 214 Q208 233 170 224 Q132 239 94 225 Q57 234 30 210 Z" fill="#c98a62"/>' +
    '<path d="M36 210 Q65 198 86 212 M165 211 Q194 197 222 211" stroke="#a96f52" stroke-width="4" stroke-linecap="round" opacity=".55"/>' +
    '<g class="uvd-dig-shovel"><path d="M190 198 L207 65" stroke="#b57958" stroke-width="9" stroke-linecap="round"/><path d="M202 69 Q216 51 231 67" stroke="#b57958" stroke-width="9" stroke-linecap="round" fill="none"/><path d="M180 199 Q198 187 218 201 L212 222 Q194 228 178 212 Z" fill="#9c654d" stroke="#85513e" stroke-width="3"/></g>' +
    '<path d="M67 180 Q31 173 38 140 Q48 126 67 140" stroke="#ffabc3" stroke-width="15" stroke-linecap="round" fill="none"/>' +
    '<ellipse cx="127" cy="151" rx="76" ry="68" fill="#ffe5ee" stroke="#f6abc2" stroke-width="3"/>' +
    '<path d="M69 111 L55 58 L100 91 Z" fill="#ffb4c9" stroke="#f6abc2" stroke-width="3"/>' +
    '<path d="M185 111 L199 58 L154 91 Z" fill="#ffb4c9" stroke="#f6abc2" stroke-width="3"/>' +
    '<path d="M68 105 L62 70 L91 94 Z" fill="#f57fa2"/><path d="M186 105 L192 70 L163 94 Z" fill="#f57fa2"/>' +
    '<ellipse cx="127" cy="171" rx="47" ry="39" fill="#fff8fb" opacity=".92"/>' +
    '<ellipse cx="98" cy="139" rx="9" ry="10" fill="#4d3444"/><ellipse cx="156" cy="139" rx="9" ry="10" fill="#4d3444"/>' +
    '<circle cx="101" cy="136" r="3.2" fill="#fff"/><circle cx="159" cy="136" r="3.2" fill="#fff"/>' +
    '<ellipse cx="127" cy="153" rx="6" ry="5" fill="#ed7797"/><path d="M127 158 q-8 9 -16 0 M127 158 q8 9 16 0" stroke="#4d3444" stroke-width="2.2" stroke-linecap="round" fill="none"/>' +
    '<ellipse cx="76" cy="156" rx="13" ry="7" fill="#ffb7cd" opacity=".82"/><ellipse cx="178" cy="156" rx="13" ry="7" fill="#ffb7cd" opacity=".82"/>' +
    '<ellipse class="uvd-dig-leg uvd-dig-leg-right" cx="165" cy="179" rx="20" ry="15" fill="#ffe5ee" stroke="#f6abc2" stroke-width="3" transform="rotate(-18 165 179)"/>' +
    '<path d="M153 182 Q165 172 179 176" stroke="#f57fa2" stroke-width="4" stroke-linecap="round"/>' +
    '<ellipse class="uvd-dig-leg uvd-dig-leg-left" cx="92" cy="192" rx="25" ry="14" fill="#ffe5ee" stroke="#f6abc2" stroke-width="3" transform="rotate(12 92 192)"/>' +
    '<path d="M75 191 Q90 184 105 192" stroke="#f57fa2" stroke-width="4" stroke-linecap="round"/>' +
    '<path d="M28 90 l4 10 10 4 -10 4 -4 10 -4-10-10-4 10-4 Z" fill="#f4b7d8"/>' +
    '<path d="M218 118 l3 8 8 3 -8 3 -3 8 -3-8-8-3 8-3 Z" fill="#d5b3f4"/>' +
    '<circle cx="48" cy="119" r="5" fill="#ffd6e4"/><circle cx="212" cy="42" r="6" fill="#ffd6e4"/>' +
  '</svg>';

function __uvdDiggingIframeCandidates() {
  var allFrames = __uvdCollectWorkflowFrames();
  var candidates = allFrames.filter(function(candidate) { return candidate.score >= 20; });
  if (!candidates.length) candidates = allFrames.filter(function(candidate) { return candidate.verdict !== 'JUNK'; });
  return candidates.filter(function(candidate) { return candidate.verdict === 'PLAYER' || candidate.verdict === 'UNKNOWN'; });
}
function __uvdSetDiggingReady(kind, subtitle) {
  var flow = __uvdDiggingFlow;
  var overlay = document.getElementById('__uvd_digging_popup__');
  if (!flow.active || !overlay) return;
  flow.route = kind;
  overlay.classList.add('uvd-dig-found');
  var title = overlay.querySelector('#__uvd_dig_title__');
  var sub = overlay.querySelector('#__uvd_dig_sub__');
  if (title) title.textContent = kind === 'media' ? 'Mèo tìm được video!' : 'Mèo thấy player!';
  if (sub) sub.textContent = subtitle;
  // The primary path must never be squeezed out by an optional fact card.
  // Set the reveal inline as well as in CSS so host styles cannot collapse it.
  var actionRow = overlay.querySelector('.uvd-dig-action-row');
  var enterButton = overlay.querySelector('#__uvd_dig_enter__');
  var watchFirstButton = overlay.querySelector('#__uvd_dig_watch_first__');
  var canWatchFirst = kind === 'media';
  if (actionRow) {
    actionRow.style.maxHeight = '72px'; actionRow.style.marginTop = '16px'; actionRow.style.opacity = '1'; actionRow.style.overflow = 'visible';
    actionRow.classList.toggle('uvd-dig-one-action', !canWatchFirst);
  }
  if (enterButton) { enterButton.style.display = 'block'; enterButton.style.maxHeight = '60px'; enterButton.style.padding = '14px 16px'; enterButton.style.opacity = '1'; enterButton.style.background = 'linear-gradient(135deg,#ff91ae,#ef6689)'; }
  if (watchFirstButton) {
    watchFirstButton.style.display = canWatchFirst ? 'block' : 'none';
    watchFirstButton.style.maxHeight = canWatchFirst ? '60px' : '0';
    watchFirstButton.style.padding = canWatchFirst ? '14px 16px' : '0';
    watchFirstButton.style.opacity = canWatchFirst ? '1' : '0';
  }
  var factWrap = overlay.querySelector('#__uvd_dig_fact_wrap__');
  if (factWrap) factWrap.style.display = 'none';
  var digCard = overlay.querySelector('.uvd-digging-box');
  if (digCard) __uvdAutoFitPopup(digCard, .72, .90);
  var status = overlay.querySelector('#__uvd_dig_status__');
  var count = overlay.querySelector('#__uvd_dig_count__');
  if (status) status.textContent = kind === 'iframe' ? '🖼️ Đã thấy player iframe' : '✨ Đã đào được video';
  if (count) count.textContent = kind === 'iframe' ? '1 player' : (__uvdQualifiedDirectEntries().length + ' video đã kiểm chứng');
  var routeHint = overlay.querySelector('#__uvd_dig_route_hint__');
  if (routeHint) routeHint.textContent = kind === 'iframe'
    ? 'Bấm vào để chọn player iframe mèo đã tìm thấy nha ♡'
    : 'Xem ngay để phát link đầu tiên · Vào link để so sánh & vote nha ♡';
  var liveNote = overlay.querySelector('#__uvd_dig_live_note__');
  if (liveNote) liveNote.textContent = kind === 'iframe'
    ? 'Mèo đã lần ra một player có thể phát được!'
    : 'Mèo mang video về rồi nè — chọn cách xem thôi!';
}
function __uvdStopDiggingRealtimeCapture() {
  var flow = __uvdDiggingFlow;
  if (flow.realtimeTimer) clearInterval(flow.realtimeTimer);
  if (flow.realtimeEndTimer) clearTimeout(flow.realtimeEndTimer);
  flow.realtimeTimer = null;
  flow.realtimeEndTimer = null;
  if (__uvdLiveCaptureMode) {
    __uvdLiveCaptureMode = false;
    if (__uvdLiveUiDirty) { __uvdLiveUiDirty = false; scheduleLiveUiRefresh(); }
  }
}
function __uvdStartDiggingRealtimeCapture() {
  var flow = __uvdDiggingFlow;
  __uvdStopDiggingRealtimeCapture();
  try { __uvdStartHardEmbedBlocker(); installMonitor(); installPopupBlock(); } catch(e) {}
  __uvdLiveCaptureMode = true;
  function sweep() {
    if (!flow.active || __uvdAutoScanPaused) { __uvdStopDiggingRealtimeCapture(); return; }
    try {
      scan(document, 'dig-realtime', true);
      performance.getEntriesByType('resource').forEach(function(entry) {
        if (!entry || !entry.name || isAdUrl(entry.name) || __uvdIsLikelyHlsSegmentUrl(entry.name)) return;
        if (/\.m3u8(?:[?#]|$)/i.test(entry.name)) __uvdAddDetectedMediaUrl(entry.name, 'M3U8', 'dig-realtime:performance');
        else findUrls(entry.name, 'dig-realtime:performance');
      });
    } catch(e) {}
  }
  sweep();
  flow.realtimeTimer = setInterval(sweep, 1100);
  flow.realtimeEndTimer = setTimeout(__uvdStopDiggingRealtimeCapture, __uvdDiggingWaitMs + 1500);
}

function __uvdStopDiggingIframeProbe() {
  if (__uvdDiggingFlow.iframeProbeTimer) clearTimeout(__uvdDiggingFlow.iframeProbeTimer);
  __uvdDiggingFlow.iframeProbeTimer = null;
}
function __uvdProbeIframeDuringDig(stage) {
  var flow = __uvdDiggingFlow;
  if (!flow.active || flow.found) return;
  var candidates = __uvdDiggingIframeCandidates();
  if (!candidates.length) {
    if (stage < 2) flow.iframeProbeTimer = setTimeout(function() { __uvdProbeIframeDuringDig(stage + 1); }, 3000);
    return;
  }
  var strong = candidates.some(function(c) { return c.verdict === 'PLAYER' || c.score >= 50; });
  // Known/large/embed players appear almost immediately. UNKNOWN candidates
  // get one short extra evidence window first, avoiding ad iframe noise.
  if (strong || stage >= 1) {
    __uvdStopDiggingIframeProbe();
    clearTimeout(flow.waitTimer);
    flow.waitTimer = null;
    __uvdSetDiggingReady('iframe', strong ? 'Mèo thấy player iframe thật rồi — bấm vào link để chọn nha!' : 'Mèo thấy iframe có thể là player — bấm vào link để kiểm tra nha!');
  } else {
    flow.iframeProbeTimer = setTimeout(function() { __uvdProbeIframeDuringDig(1); }, 3500);
  }
}

function __uvdStartDiggingPopup() {
  var flow = __uvdDiggingFlow;
  if (flow.active || flow.completed || playerState.overlay) return;
  if (document.getElementById('__uvd_iframe_workflow_prompt__') || document.getElementById('__uvd_media_links_prompt__')) return;
  flow.active = true;
  flow.released = false;
  // Initial scans can finish before the UI mounts; preserve a direct result
  // and show its route as soon as the large digging popup is in the document.
  if (!flow.found) {
    urls.forEach(function(item, url) {
      if (!flow.found && item && __uvdIsDiggingDirectType(item.type) && __uvdIsQualifiedMediaItem(item)) {
        flow.found = true;
        flow.route = 'media';
        flow.url = url;
        flow.type = item.type;
      }
    });
  }
  // The script UI must wait behind the discovery flow and behind the popup
  // that follows it. It is restored only when that popup is dismissed.
  __uvdHideUiForPopup();
  var overlay = document.createElement('div');
  overlay.id = '__uvd_digging_popup__';
  overlay.className = 'uvd-digging-overlay';
  overlay.innerHTML =
    '<div class="uvd-digging-box" role="status" aria-live="polite">' +
      '<button type="button" class="uvd-popup-back-btn" id="__uvd_dig_back__" title="Quay lại">←</button>' +
      '<button type="button" class="uvd-dig-close" id="__uvd_dig_close__" title="Đóng">×</button>' +
      '<div class="uvd-dig-layout">' +
        '<section class="uvd-dig-hero" aria-label="Mèo đang đào link">' +
          '<div class="uvd-dig-glow uvd-dig-glow-one"></div><div class="uvd-dig-glow uvd-dig-glow-two"></div>' +
          '<div class="uvd-dig-art">' + __uvdDiggingCatArt + '<i class="uvd-dig-dirt">✦</i><i class="uvd-dig-dirt">•</i><i class="uvd-dig-dirt">✦</i></div>' +
          '<div class="uvd-dig-live-line"><i></i><span id="__uvd_dig_live_note__">Mèo đang lần theo dấu vết video…</span></div>' +
        '</section>' +
        '<section class="uvd-dig-copy">' +
          '<div class="uvd-dig-kicker">HÀNH TRÌNH TÌM VIDEO</div>' +
          '<div class="uvd-dig-title" id="__uvd_dig_title__">Đang đào link...</div>' +
          '<div class="uvd-dig-sub" id="__uvd_dig_sub__">Mèo sẽ đào kỹ khoảng 20 giây cho cưng nè ♡</div>' +
          '<div class="uvd-dig-status-row" id="__uvd_dig_status_row__"><span id="__uvd_dig_status__">🔎 Đang quét nguồn</span><span id="__uvd_dig_count__">0 link</span></div>' +
        '</section>' +
        '<section class="uvd-dig-actions-area">' +
          '<div class="uvd-dig-action-row">' +
            '<button type="button" class="uvd-dig-watch-first-btn" id="__uvd_dig_watch_first__">▶ Xem ngay</button>' +
            '<button type="button" class="uvd-dig-enter-btn" id="__uvd_dig_enter__">Vào link ♡</button>' +
          '</div>' +
          '<div class="uvd-dig-route-hint" id="__uvd_dig_route_hint__">Bấm vào để mở link mèo vừa đào được nha ♡</div>' +
        '</section>' +
        '<section class="uvd-dig-footer">' +
          '<div class="uvd-dig-utility-row"><button type="button" class="uvd-dig-ui-btn" id="__uvd_dig_ui__">☰ Vào UI đầy đủ</button></div>' +
          '<div class="uvd-dig-help">Chưa biết Mèo đang làm gì? <button type="button" id="__uvd_dig_help__">Xem hướng dẫn ♡</button></div>' +
          '<div id="__uvd_dig_fact_wrap__" style="display:none;">' +
            '<button type="button" id="__uvd_dig_fact_btn__">Đào lâu quá chán? 🎲 Bấm xem fact vui nè</button>' +
            '<div id="__uvd_dig_fact_box__" style="display:none;"><div>✨</div><div id="__uvd_dig_fact_text__">Đang lấy fact vui...</div></div>' +
          '</div>' +
          '<div class="uvd-dig-tip">💡 Tip: Mở video rồi bấm Play thật trên trang để Mèo bắt link nhanh hơn nha!</div>' +
        '</section>' +
      '</div>' +
    '</div>';
  __uvdAppendRoot(overlay);
  __uvdAutoFitPopup(overlay.querySelector('.uvd-digging-box'), .72, .90);
  var enter = overlay.querySelector('#__uvd_dig_enter__');
  if (enter) enter.onclick = __uvdOpenDiggingDestination;
  var watchFirst = overlay.querySelector('#__uvd_dig_watch_first__');
  if (watchFirst) watchFirst.onclick = __uvdWatchFirstDiggingStream;
  var goUi = overlay.querySelector('#__uvd_dig_ui__');
  if (goUi) goUi.onclick = function() {
    __uvdStopDiggingPopup(false);
    // Some pages rebuild the panel while the digging overlay is active. Force
    // the restored panel back to a visible state instead of leaving it hidden.
    requestAnimationFrame(function() {
      var panel = document.getElementById('__uvd__');
      if (!panel && typeof buildUI === 'function') { buildUI(); panel = document.getElementById('__uvd__'); }
      if (panel) { __uvdPopupActive = false; panel.__uvdPopupHidden = false; panel.style.display = ''; panel.style.visibility = ''; }
      // Choosing Main UI is a gentle detour from the popup-first route, not a
      // lost result. If digging has something usable, show the same reminder
      // prompt that appears after a Video/Iframe cancellation.
      var direct = __uvdQualifiedDirectEntries();
      if (direct.length) __uvdSetPopupReminder('media');
      else {
        var frames = __uvdDiggingIframeCandidates();
        if (frames.length) __uvdSetPopupReminder('iframe');
      }
    });
  };
  var help = overlay.querySelector('#__uvd_dig_help__');
  if (help) help.onclick = function(e){
    e.stopPropagation();
    if (data.settings.tutorialMuted) { toast('Đã tắt nhắc tutorial — mở lại trong Cài đặt nha ♡'); return; }
    // An popup dao truoc khi mo tutorial, giu UI an de tutorial noi len tren
    try { __uvdStopDiggingPopup(true); } catch(ex){}
    if (typeof __uvdShowTutorialSlides === 'function') __uvdShowTutorialSlides();
  };
  // Random fact feature - show after 8s if still digging
  var factWrap = overlay.querySelector('#__uvd_dig_fact_wrap__');
  var factBtn = overlay.querySelector('#__uvd_dig_fact_btn__');
  var factBox = overlay.querySelector('#__uvd_dig_fact_box__');
  var factText = overlay.querySelector('#__uvd_dig_fact_text__');
  var factTimer = null;
  function showFactWrap(){ if(factWrap) factWrap.style.display='block'; }
  factTimer = setTimeout(showFactWrap, 8000);
  if (factBtn && factBox && factText) {
    factBtn.onclick = function(e){
      e.stopPropagation();
      factBox.style.display='block';
      factText.textContent='Đang lấy fact vui từ internet... 🐾';
      // Try multiple fact APIs with fallback
      var apis = [
        {url:'https://catfact.ninja/fact', parse:function(j){return j.fact;}},
        {url:'https://uselessfacts.jsph.pl/api/v2/facts/random?language=en', parse:function(j){return j.text;}},
        {url:'https://official-joke-api.appspot.com/jokes/random', parse:function(j){return (j.setup? j.setup+' '+j.punchline : j.joke) || JSON.stringify(j);}}
      ];
      var tried=0;
      function tryNext(){
        if(tried>=apis.length){ factText.textContent='Ui không lấy được fact rồi 🥺 Thử lại sau nha! Mèo vẫn đang đào link đó!'; return; }
        var api = apis[tried++];
        fetch(api.url, {cache:'no-store'}).then(function(r){ return r.json(); }).then(function(j){
          var txt = '';
          try { txt = api.parse(j); } catch(ex){ txt = ''; }
          if (!txt) throw new Error('empty');
          // Translate? Keep original but add cute prefix
          factText.innerHTML = '🎀 <b>Fact vui nè:</b> ' + txt.replace(/</g,'&lt;') + '<br><br><span style="font-size:10px;color:#b68bea">Nguồn: ' + api.url + ' - random mỗi lần bấm nha!</span>';
        }).catch(function(){ tryNext(); });
      }
      tryNext();
    };
  }
  // Both controls leave this popup cleanly; the timer must not reveal a fact
  // after the card has gone away.
  var close = overlay.querySelector('#__uvd_dig_close__');
  if (close) close.onclick = function() { clearTimeout(factTimer); __uvdStopDiggingPopup(false); };
  var digBack = overlay.querySelector('#__uvd_dig_back__');
  if (digBack) digBack.onclick = function() { clearTimeout(factTimer); __uvdStopDiggingPopup(false); };
  var initialStatus = overlay.querySelector('#__uvd_dig_status__');
  if (initialStatus) initialStatus.textContent = '⚡ Đang quét realtime';
  __uvdStartDiggingRealtimeCapture();
  __uvdStopDiggingIframeProbe();
  flow.iframeProbeTimer = setTimeout(function() { __uvdProbeIframeDuringDig(0); }, 1800);
  clearTimeout(flow.waitTimer);
  // At the 20-second mark, do not dismiss this popup. On an iframe-only page
  // it simply changes to an explicit “Vào link” route for the user to choose.
  flow.waitTimer = setTimeout(function() {
    if (!flow.active) return;
    if (flow.found) __uvdUpdateDiggingPopup();
    else __uvdUpdateDiggingIframeReady();
  }, __uvdDiggingWaitMs);
  if (flow.found) setTimeout(__uvdUpdateDiggingPopup, 180);
}
function __uvdUpdateDiggingPopup() {
  var flow = __uvdDiggingFlow;
  if (!flow.active || !flow.found) return;
  clearTimeout(flow.waitTimer);
  flow.waitTimer = null;
  __uvdSetDiggingReady('media', 'Đào được link video rồi nè — bấm vào link thôi!');
}
function __uvdUpdateDiggingIframeReady() {
  var flow = __uvdDiggingFlow;
  if (!flow.active) return;
  if (flow.found) { __uvdUpdateDiggingPopup(); return; }
  var candidates = __uvdDiggingIframeCandidates();
  if (!candidates.length) {
    clearTimeout(flow.waitTimer);
    flow.waitTimer = setTimeout(__uvdUpdateDiggingIframeReady, 4000);
    return;
  }
  clearTimeout(flow.waitTimer);
  flow.waitTimer = null;
  __uvdSetDiggingReady('iframe', 'Mèo tìm thấy player iframe rồi nè — bấm vào link để chọn nha!');
}
function __uvdWatchFirstDiggingStream() {
  var flow = __uvdDiggingFlow;
  if (!flow.active) return;
  var direct = __uvdQualifiedDirectEntries();
  if (!direct.length) { __uvdOpenDiggingDestination(); return; }
  var first = __uvdSortStreamsForPopup(direct.map(function(entry) { return { url: entry[0], type: entry[1].type, item: entry[1] }; }))[0];
  if (!first) return;
  __uvdRunDiggingCatThenFly(function() {
    addToHistory(first.url, first.type || 'MP4');
    playerState.launchFromThumbnail = true;
    showVideoPlayer(first.url, first.type || 'MP4');
  });
}
function __uvdOpenDiggingDestination() {
  var flow = __uvdDiggingFlow;
  if (!flow.active) return;
  // A direct media URL is always preferred over an iframe fallback.
  var direct = __uvdQualifiedDirectEntries();
  if (direct.length) {
    var mapped = direct.map(function(entry) { return { url: entry[0], type: entry[1].type, item: entry[1] }; });
    __uvdRunDiggingCatThenFly(function() {
      __uvdOpenMediaLinksPopup(__uvdSortStreamsForPopup(mapped));
    });
    return;
  }
  var candidates = __uvdDiggingIframeCandidates();
  if (candidates.length) {
    __uvdRunDiggingCatThenFly(function() {
      __uvdOpenIframeWorkflowPrompt(candidates);
    });
    return;
  }
  var sub = document.getElementById('__uvd_dig_sub__');
  if (sub) sub.textContent = 'Mèo vẫn chưa đào được link, thử bấm Play trên trang rồi đợi thêm nha.';
}
function __uvdRunDiggingCatThenFly(onDone) {
  var flow = __uvdDiggingFlow;
  if (!flow.active) { if (typeof onDone === 'function') onDone(); return; }
  var overlay = document.getElementById('__uvd_digging_popup__');
  if (!overlay) { __uvdFlyDiggingPopupUp(onDone); return; }
  clearTimeout(flow.runTimer);
  overlay.classList.add('uvd-dig-running');
  // A few playful steps and shovel strokes make the cat feel alive before it
  // takes off toward the top of the screen.
  flow.runTimer = setTimeout(function() {
    flow.runTimer = null;
    if (overlay.isConnected) overlay.classList.remove('uvd-dig-running');
    __uvdFlyDiggingPopupUp(onDone);
  }, 820);
}
function __uvdFlyDiggingPopupUp(onDone) {
  var flow = __uvdDiggingFlow;
  if (!flow.active) { if (typeof onDone === 'function') onDone(); return; }
  clearTimeout(flow.transitionTimer);
  clearTimeout(flow.waitTimer);
  clearTimeout(flow.runTimer);
  __uvdStopDiggingIframeProbe();
  __uvdStopDiggingRealtimeCapture();
  clearTimeout(flow.removeTimer);
  flow.transitionTimer = null;
  flow.waitTimer = null;
  flow.runTimer = null;
  flow.removeTimer = null;
  flow.active = false;
  flow.released = true;
  flow.completed = true;
  var overlay = document.getElementById('__uvd_digging_popup__');
  if (!overlay) { if (typeof onDone === 'function') onDone(); return; }
  // Mount the next popup while this card still covers the host page. The
  // outgoing Digging card then exits underneath it, preventing a web-page flash.
  overlay.style.zIndex = '2147483646';
  overlay.classList.add('uvd-dig-exit');
  setTimeout(function() {
    __uvdDiggingPopupHandoff = true;
    if (typeof onDone === 'function') onDone();
  }, 110);
  setTimeout(function() {
    if (overlay.parentNode) overlay.remove();
  }, 590);
}
function __uvdStopDiggingPopup(keepUiHidden) {
  var flow = __uvdDiggingFlow;
  clearTimeout(flow.transitionTimer);
  clearTimeout(flow.waitTimer);
  clearTimeout(flow.runTimer);
  __uvdStopDiggingIframeProbe();
  __uvdStopDiggingRealtimeCapture();
  clearTimeout(flow.removeTimer);
  flow.transitionTimer = null;
  flow.waitTimer = null;
  flow.runTimer = null;
  flow.removeTimer = null;
  if (!flow.active && !document.getElementById('__uvd_digging_popup__')) return;
  flow.active = false;
  flow.released = true;
  flow.completed = true;
  var overlay = document.getElementById('__uvd_digging_popup__');
  if (overlay) overlay.remove();
  if (keepUiHidden) __uvdHideUiForPopup();
  else __uvdRestoreUiAfterPopup();
}

var __uvdMediaPopupShown = false;
var __uvdMediaPopupDismissedAt = 0;
// Khi bấm Play: hiện con thỏ ôm bắp rang vài giây rồi mới mở video player.
function __uvdShowPlayIntro(url, type) {
  var previewPopup = document.getElementById('__uvd_media_preview__');
  if (previewPopup) { try { previewPopup.remove(); } catch(e) {} }
  var anyPopup = document.getElementById('__uvd_media_links_prompt__');
  var old = document.getElementById('__uvd_play_intro__');
  if (old) old.remove();
  // Ẩn panel UMP để intro luôn nổi trên cùng (không bị UI đè).
  __uvdHideUiForPopup();
  var overlay = document.createElement('div');
  overlay.id = '__uvd_play_intro__';
  overlay.className = 'uvd-play-intro-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;padding:18px;' +
    'background:rgba(28,14,40,.78);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);animation:uvdFadeIn .3s ease both;';
  var box = document.createElement('div');
  box.className = 'uvd-play-intro-card';
  box.style.cssText = 'text-align:center;padding:26px 28px;border-radius:36px;max-width:520px;width:100%;' +
    'background:linear-gradient(160deg,#fff6fb 0%,#fdf0ff 100%);border:1px solid rgba(194,150,255,.45);' +
    'box-shadow:0 28px 72px rgba(150,90,220,.44),0 0 0 6px rgba(255,255,255,.4) inset;' +
    'animation:uvdScaleIn .38s cubic-bezier(.22,1,.36,1) both;';
  box.innerHTML =
    '<div class="uvd-play-intro-mascot">' + __uvdPlayIntroArt + '</div>' +
    '<div class="uvd-play-intro-title">Giờ mở video nè ♡</div>' +
    '<div class="uvd-play-intro-copy">Đang chuẩn bị link cho mấy cưng...</div>' +
    '<div class="uvd-play-intro-hint">Đợi vài giây hoặc bấm <b>Mở ngay</b> nha</div>' +
    '<button id="__uvd_play_intro_open__" class="uvd-btn uvd-btn-sm uvd-play-intro-open">Mở ngay ♡</button>';
  overlay.appendChild(box);
  __uvdAppendRoot(overlay);
  try { (document.body || document.documentElement).appendChild(overlay); } catch(e) {}
  overlay.style.zIndex = '2147483647';
  // The intro now owns the visual layer; retire the list only after intro is
  // in the document, so the page itself never shows between popups.
  if (anyPopup) {
    anyPopup.style.zIndex = '2147483646';
    anyPopup.classList.add('uvd-popup-transition-under');
    setTimeout(function() { try { anyPopup.remove(); } catch(e) {} }, 180);
  }
  var opened = false;
  function openIt() {
    if (opened || !overlay.isConnected) return;
    opened = true;
    playerState.launchFromThumbnail = true;
    try { window.__uvd_showPlayer(url, type || 'MP4'); } catch(e) {}
    // Player overlay is appended synchronously by showVideoPlayer. Keep intro
    // through that mount, then retire it below the player layer.
    setTimeout(function() { try { overlay.remove(); } catch(e) {} }, 120);
  }
  var openBtn = box.querySelector('#__uvd_play_intro_open__');
  if (openBtn) openBtn.onclick = function(e) { e.stopPropagation(); openIt(); };
  setTimeout(openIt, 3200);
  overlay.addEventListener('click', function(e) { if (e.target === overlay) openIt(); });
}

// ========== FAREWELL POPUP - gom het thu lai tam biet de thuong khi bam X (fix undefined + to nhu digging popup) ==========
function __uvdGetFarewellMascotsHtml(){
  // One new crying mascot per farewell. Random each time, no legacy trio.
  var tear = '<path class="uvd-cry-tear" d="M0 0 C-5 8 -5 12 0 16 C5 12 5 8 0 0 Z" fill="#86c9ff"/>';
  var animals = [
    { name: '🦊 Cáo rưng rưng', art: '<svg viewBox="0 0 130 155" fill="none" xmlns="http://www.w3.org/2000/svg"><ellipse cx="65" cy="143" rx="39" ry="8" fill="#ffd5c5" opacity=".55"/><path d="M40 130 Q18 126 25 102 Q30 90 44 105" fill="#f39a68" stroke="#dc744e" stroke-width="2"/><ellipse cx="65" cy="118" rx="31" ry="28" fill="#f49d69" stroke="#dc744e" stroke-width="2"/><path d="M36 67 L24 27 L58 52 Z" fill="#f49d69" stroke="#dc744e" stroke-width="2"/><path d="M94 67 L106 27 L72 52 Z" fill="#f49d69" stroke="#dc744e" stroke-width="2"/><ellipse cx="65" cy="78" rx="38" ry="32" fill="#ffb37d" stroke="#dc744e" stroke-width="2"/><ellipse cx="65" cy="98" rx="18" ry="12" fill="#fff4ea"/><circle cx="49" cy="77" r="5" fill="#3c3038"/><circle cx="81" cy="77" r="5" fill="#3c3038"/><ellipse cx="65" cy="91" rx="4" ry="3" fill="#43323a"/><path d="M56 101 Q65 95 74 101" stroke="#43323a" stroke-width="2" stroke-linecap="round"/><g transform="translate(43 82)">' + tear + '</g><g transform="translate(87 82)">' + tear + '</g><path d="M35 111 Q47 100 53 116" stroke="#fff4ea" stroke-width="10" stroke-linecap="round"/><path d="M95 111 Q83 100 77 116" stroke="#fff4ea" stroke-width="10" stroke-linecap="round"/></svg>' },
    { name: '🦦 Rái cá sụt sùi', art: '<svg viewBox="0 0 130 155" fill="none" xmlns="http://www.w3.org/2000/svg"><ellipse cx="65" cy="143" rx="38" ry="8" fill="#d9c4b7" opacity=".55"/><path d="M94 130 Q119 135 113 109 Q108 97 94 108" fill="#9a6f5d" stroke="#765244" stroke-width="2"/><ellipse cx="65" cy="117" rx="33" ry="29" fill="#aa7a63" stroke="#765244" stroke-width="2"/><circle cx="39" cy="50" r="11" fill="#8e624f"/><circle cx="91" cy="50" r="11" fill="#8e624f"/><ellipse cx="65" cy="78" rx="38" ry="32" fill="#b8866e" stroke="#765244" stroke-width="2"/><ellipse cx="65" cy="98" rx="22" ry="14" fill="#f6ddcd"/><circle cx="49" cy="76" r="5" fill="#342b31"/><circle cx="81" cy="76" r="5" fill="#342b31"/><ellipse cx="65" cy="92" rx="5" ry="3.5" fill="#342b31"/><path d="M55 102 Q65 96 75 102" stroke="#342b31" stroke-width="2" stroke-linecap="round"/><g transform="translate(43 81)">' + tear + '</g><g transform="translate(87 81)">' + tear + '</g><path d="M40 100 L27 96 M41 105 L27 109 M89 100 L103 96 M89 105 L103 109" stroke="#765244" stroke-width="1.7" stroke-linecap="round"/><ellipse cx="43" cy="116" rx="10" ry="7" fill="#f6ddcd"/><ellipse cx="87" cy="116" rx="10" ry="7" fill="#f6ddcd"/></svg>' },
    { name: '🐧 Cánh cụt rơi lệ', art: '<svg viewBox="0 0 130 155" fill="none" xmlns="http://www.w3.org/2000/svg"><ellipse cx="65" cy="143" rx="37" ry="8" fill="#d8d2ed" opacity=".6"/><ellipse cx="65" cy="114" rx="31" ry="34" fill="#34333f" stroke="#25242d" stroke-width="2"/><path d="M37 111 Q21 104 26 90 Q34 84 42 96" fill="#4c4b5a"/><path d="M93 111 Q109 104 104 90 Q96 84 88 96" fill="#4c4b5a"/><ellipse cx="65" cy="78" rx="38" ry="34" fill="#454451" stroke="#25242d" stroke-width="2"/><ellipse cx="65" cy="91" rx="27" ry="24" fill="#fff"/><circle cx="49" cy="76" r="5" fill="#292733"/><circle cx="81" cy="76" r="5" fill="#292733"/><path d="M57 92 L65 101 L73 92 Z" fill="#ffbb61"/><g transform="translate(43 81)">' + tear + '</g><g transform="translate(87 81)">' + tear + '</g><path d="M42 137 Q52 128 58 138" stroke="#ffbb61" stroke-width="6" stroke-linecap="round"/><path d="M88 137 Q78 128 72 138" stroke="#ffbb61" stroke-width="6" stroke-linecap="round"/></svg>' },
    { name: '🦫 Capybara buồn', art: '<svg viewBox="0 0 130 155" fill="none" xmlns="http://www.w3.org/2000/svg"><ellipse cx="65" cy="143" rx="40" ry="8" fill="#dac9b6" opacity=".55"/><ellipse cx="65" cy="116" rx="38" ry="28" fill="#a97755" stroke="#80583f" stroke-width="2"/><circle cx="40" cy="51" r="9" fill="#946545"/><circle cx="90" cy="51" r="9" fill="#946545"/><ellipse cx="65" cy="78" rx="42" ry="33" fill="#b6815d" stroke="#80583f" stroke-width="2"/><ellipse cx="65" cy="98" rx="24" ry="14" fill="#d9b38e"/><circle cx="49" cy="76" r="5" fill="#3c302d"/><circle cx="81" cy="76" r="5" fill="#3c302d"/><ellipse cx="65" cy="93" rx="7" ry="5" fill="#5a4035"/><path d="M54 103 Q65 96 76 103" stroke="#5a4035" stroke-width="2" stroke-linecap="round"/><g transform="translate(43 81)">' + tear + '</g><g transform="translate(87 81)">' + tear + '</g><path d="M47 117 Q54 108 60 119" stroke="#d9b38e" stroke-width="9" stroke-linecap="round"/><path d="M83 117 Q76 108 70 119" stroke="#d9b38e" stroke-width="9" stroke-linecap="round"/></svg>' },
    { name: '🐶 Cún mếu máo', art: '<svg viewBox="0 0 130 155" fill="none" xmlns="http://www.w3.org/2000/svg"><ellipse cx="65" cy="143" rx="39" ry="8" fill="#f5d6a8" opacity=".6"/><ellipse cx="65" cy="116" rx="33" ry="29" fill="#e8ad68" stroke="#c98749" stroke-width="2"/><path d="M35 76 Q17 56 28 37 Q45 40 52 65" fill="#b97845" stroke="#9b5e39" stroke-width="2"/><path d="M95 76 Q113 56 102 37 Q85 40 78 65" fill="#b97845" stroke="#9b5e39" stroke-width="2"/><ellipse cx="65" cy="78" rx="40" ry="34" fill="#f1bd77" stroke="#c98749" stroke-width="2"/><ellipse cx="65" cy="98" rx="19" ry="13" fill="#fff0d4"/><circle cx="49" cy="76" r="5" fill="#3c302d"/><circle cx="81" cy="76" r="5" fill="#3c302d"/><ellipse cx="65" cy="92" rx="5" ry="3.5" fill="#41312d"/><path d="M55 102 Q65 95 75 102" stroke="#41312d" stroke-width="2" stroke-linecap="round"/><g transform="translate(43 81)">' + tear + '</g><g transform="translate(87 81)">' + tear + '</g><path d="M55 108 Q65 120 75 108" fill="#ff8fa3" stroke="#c86976" stroke-width="1.2"/></svg>' },
    { name: '🐿️ Sóc nức nở', art: '<svg viewBox="0 0 130 155" fill="none" xmlns="http://www.w3.org/2000/svg"><ellipse cx="65" cy="143" rx="39" ry="8" fill="#f4d0b6" opacity=".55"/><path d="M95 130 Q122 116 111 79 Q103 58 88 78 Q108 88 95 104" fill="#e48555" stroke="#c86643" stroke-width="2"/><ellipse cx="62" cy="116" rx="31" ry="29" fill="#e99864" stroke="#c86643" stroke-width="2"/><path d="M38 70 L30 32 L58 57 Z" fill="#e48555" stroke="#c86643" stroke-width="2"/><path d="M87 70 L96 32 L70 57 Z" fill="#e48555" stroke="#c86643" stroke-width="2"/><ellipse cx="62" cy="78" rx="38" ry="33" fill="#efaa72" stroke="#c86643" stroke-width="2"/><ellipse cx="62" cy="99" rx="18" ry="12" fill="#fff1df"/><circle cx="46" cy="76" r="5" fill="#3c302d"/><circle cx="78" cy="76" r="5" fill="#3c302d"/><ellipse cx="62" cy="92" rx="4" ry="3" fill="#4a342c"/><path d="M52 102 Q62 95 72 102" stroke="#4a342c" stroke-width="2" stroke-linecap="round"/><g transform="translate(40 81)">' + tear + '</g><g transform="translate(84 81)">' + tear + '</g><path d="M63 120 L74 108 L85 120 Z" fill="#9c6b3b"/></svg>' }
  ];
  var pick = animals[Math.floor(Math.random() * animals.length)];
  return '<div class="uvd-farewell-mascots uvd-farewell-one"><span class="uvd-fm uvd-fm-big-full">' + pick.art + '</span><div class="uvd-farewell-animal-name">' + pick.name + '</div></div>';
}
function __uvdShowFarewellPopup(onConfirm) {
  var old = document.getElementById('__uvd_farewell_popup__');
  if (old) old.remove();
  __uvdHideUiForPopup();
  var overlay = document.createElement('div');
  overlay.id = '__uvd_farewell_popup__';
  overlay.className = 'uvd-digging-overlay uvd-farewell-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;padding:18px;background:rgba(28,14,40,.82);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);animation:uvdFadeIn .35s ease both;';
  var box = document.createElement('div');
  box.className = 'uvd-digging-box uvd-farewell-box';
  // To nhu popup dao link
  box.style.cssText = 'width:100%;max-width:540px;min-height:620px;padding:28px 24px 24px;border-radius:36px;text-align:center;background:linear-gradient(160deg,#fff6fb 0%,#fdf0ff 50%,#fff0f8 100%);border:1px solid rgba(255,159,180,.38);box-shadow:0 32px 80px rgba(150,90,220,.42),0 0 0 6px rgba(255,255,255,.44) inset;animation:uvdScaleIn .44s cubic-bezier(.22,1,.36,1) both;';
  var farewellVerified = __uvdQualifiedDirectEntries().length;
  var farewellHistory = (data.history || []).length;
  var farewellSync = data.settings && data.settings.syncProfileId ? '☁ Profile Sync sẵn sàng' : '💾 Ký ức lưu trên máy';
  box.innerHTML =
    '<section class="uvd-farewell-scene">' +
      '<i class="uvd-farewell-scene-spark uvd-farewell-spark-one">✦</i><i class="uvd-farewell-scene-spark uvd-farewell-spark-two">♡</i>' +
      '<div class="uvd-farewell-art">' + __uvdGetFarewellMascotsHtml() + '</div>' +
      '<div class="uvd-farewell-scene-note">Mèo vẫn ở đây, lần sau gọi tụi mình nha ♡</div>' +
    '</section>' +
    '<section class="uvd-farewell-message">' +
      '<div class="uvd-farewell-kicker">MÈO CÀO MEDIA · HẸN GẶP LẠI</div>' +
      '<div class="uvd-farewell-title">Tạm biệt cưng iu ♡</div>' +
      '<div class="uvd-farewell-thanks">Cảm ơn cưng đã dùng Mèo Cào Media nè!</div>' +
      '<div class="uvd-farewell-copy">Mấy đứa tụi mình sẽ nhớ cưng lắm đó 🥺<br>Hẹn gặp lại lần sau nha, chúc cưng xem phim vui vẻ! 🍿✨</div>' +
      '<div class="uvd-farewell-memory"><span>Trước khi đi, Mèo cất giúp cưng:</span><div><i>✨ ' + farewellVerified + ' link đã kiểm chứng</i><i>🕘 ' + farewellHistory + ' mục lịch sử</i><i>' + escapeHtml(farewellSync) + '</i></div></div>' +
      '<div class="uvd-farewell-next"><span>🐾 Lần sau chỉ cần chạy bookmark</span><b>Mèo sẽ đào tiếp đúng phiên này cho cưng.</b></div>' +
    '</section>' +
    '<div class="uvd-farewell-actions">' +
      '<button id="__uvd_farewell_stay__">Ở lại ♡</button>' +
      '<button id="__uvd_farewell_bye__">Tạm biệt 🐾</button>' +
    '</div>';
  overlay.appendChild(box);
  __uvdAppendRoot(overlay);
  try { (document.body||document.documentElement).appendChild(overlay); } catch(e){}
  __uvdAutoFitPopup(box, .62, .90);
  overlay.style.zIndex='2147483647';
  var done=false;
  function closeFarewell(confirm){
    if(done) return; done=true;
    overlay.remove();
    __uvdRestoreUiAfterPopup();
    if(confirm && typeof onConfirm==='function') onConfirm();
  }
  box.querySelector('#__uvd_farewell_stay__').onclick = function(){ closeFarewell(false); };
  box.querySelector('#__uvd_farewell_bye__').onclick = function(){ closeFarewell(true); };
  overlay.addEventListener('click', function(e){ if(e.target===overlay) closeFarewell(false); });
}

// ========== TUTORIAL SLIDES CUTE - huong dan su dung Meo Cao Media ==========
var __uvdTutorialSlides = [
  {
    mascot: (typeof __uvdHeroMascot !== 'undefined' ? __uvdHeroMascot : (typeof __uvdHeaderMascot !== 'undefined' ? __uvdHeaderMascot : '🐱')),
    title: 'Mèo cào media làm gì? ♡',
    sub: 'Popup đào là đường chính',
    text: 'Mèo cào media là bookmarklet bắt link video thật, lọc iframe và mở player cute. Khi chạy, Mèo đưa cưng vào Popup Đào trước; Main UI là bảng điều khiển để xem Stream, nút đã click, lịch sử và cài đặt khi cần.',
    tips: 'Mèo chỉ hướng cưng đến video đã được kiểm chứng, không lôi cả đống link network thô ra nha 🐾'
  },
  {
    mascot: (typeof __uvdTabMascotPanda !== 'undefined' ? __uvdTabMascotPanda : '🐼'),
    title: '1. Cài bookmarklet 🎀',
    sub: 'Chỉ làm một lần thôi',
    text: 'Mở một trang bất kỳ → tạo Bookmark → Chỉnh sửa → đặt tên "mèo cào media" → thay URL bằng code loader → Lưu. Mỗi lần bấm bookmark, loader sẽ lấy bản mới nhất từ Render.',
    tips: 'Không cần cài app hay userscript. Nếu code mới vừa được cập nhật, chạy lại bookmark một lần là nhận bản mới nha!'
  },
  {
    mascot: (typeof __uvdTabMascotRaccoon !== 'undefined' ? __uvdTabMascotRaccoon : '🦝'),
    title: '2. Bắt đầu bằng Popup Đào ⛏️',
    sub: 'Mèo tự lần dấu video',
    text: 'Vào trang phim rồi bấm bookmark. Popup Đào sẽ quét player, fetch/XHR và resource khoảng 20 giây. Khi có video thật, Mèo báo số link đã kiểm chứng; nếu chỉ thấy iframe có triển vọng, Mèo chuyển sang flow Iframe.',
    tips: 'Nếu trang chưa lộ nguồn, mở video thật trên trang rồi bấm Play. Mèo sẽ nghe được request mới tốt hơn nè.'
  },
  {
    mascot: (typeof __uvdTabMascotHamster !== 'undefined' ? __uvdTabMascotHamster : '🐹'),
    title: '3. Video, Iframe & Main UI',
    sub: 'Popup chính, UI hỗ trợ',
    text: 'Từ Popup Đào, bấm Xem ngay để phát link đầu tiên hoặc Vào link để mở Popup Video/Iframe. Nếu cưng chọn Vào UI, bấm ×, ← hay Để sau, Mèo hiện một popup nhắc nhỏ; bấm Để sau lần nữa thì flow được giữ thành thanh dưới Current Session.',
    tips: 'Dòng dưới Current Session luôn chỉ dẫn đến link đã kiểm chứng. Khi có nhiều link, cứ bấm Mở Popup ở đó thay vì đoán trong list nha.'
  },
  {
    mascot: (typeof __uvdTabMascotRabbit !== 'undefined' ? __uvdTabMascotRabbit : '🐰'),
    title: '4. Xem bằng Player 🎬',
    sub: 'Tùy chỉnh ngay trong player',
    text: 'Popup Video có Xem trước với thumbnail và các cảnh khác. Bấm Xem sẽ qua màn chuẩn bị rồi mở Player. Trong Player có chất lượng, toàn màn hình, phụ đề, tua hai lần chạm và nút ⚙ mở Cài đặt Player riêng.',
    tips: 'Cài đặt Player gồm tốc độ mặc định, Auto/quality, resume, data saver, auto-next và thời gian ẩn controls nha.'
  },
  {
    mascot: (typeof __uvdFooterMascot !== 'undefined' ? __uvdFooterMascot : '🐻'),
    title: '5. Main UI, giao diện & Sync ☁️',
    sub: 'Bảng điều khiển của Mèo',
    text: 'Main UI giữ Stream đầy đủ thumbnail/meta/play, Nút đã click, Lịch sử và Cài đặt. Cài đặt chính chỉnh tốc độ hiệu ứng, độ bóng, độ bo góc, kiểu ẩn script, AI iframe và Sync. Để đồng bộ: tạo/copy Profile ID, dán ID ở thiết bị khác rồi chờ Mèo tải profile trước khi bấm Đồng bộ ngay.',
    tips: 'Nếu một trang chặn Sync, Mèo thử bridge qua Render. Nút Đồng bộ sẽ báo lỗi cụ thể nếu Render/Supabase chưa sẵn sàng.'
  }
];

function __uvdShowTutorialSlides() {
  var old = document.getElementById('__uvd_tutorial__');
  if (old) old.remove();
  var overlay = document.createElement('div');
  overlay.id = '__uvd_tutorial__';
  overlay.className = 'uvd-digging-overlay uvd-tutorial-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;padding:14px;background:rgba(45,22,47,.48);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);animation:uvdFadeIn .3s ease both;';
  var box = document.createElement('div');
  box.className = 'uvd-digging-box uvd-tutorial-box';
  box.style.cssText = 'animation:uvdScaleIn .42s cubic-bezier(.22,1,.36,1) both;';
  var idx = 0;
  var direction = 'next';
  function getMascotBig(i){
    // Six brand-new tutorial animals. Every one wears the same cute study
    // glasses, but their silhouette, ears/tail and colors stay distinct.
    var glasses = '<g><circle cx="53" cy="75" r="11" fill="rgba(255,255,255,.42)" stroke="#36313d" stroke-width="3"/><circle cx="87" cy="75" r="11" fill="rgba(255,255,255,.42)" stroke="#36313d" stroke-width="3"/><line x1="64" y1="75" x2="76" y2="75" stroke="#36313d" stroke-width="3" stroke-linecap="round"/><line x1="42" y1="70" x2="31" y2="65" stroke="#36313d" stroke-width="2.4" stroke-linecap="round"/><line x1="98" y1="70" x2="109" y2="65" stroke="#36313d" stroke-width="2.4" stroke-linecap="round"/></g>';
    var animals = [
      // 1. Fox
      '<svg viewBox="0 0 140 170" fill="none" xmlns="http://www.w3.org/2000/svg"><ellipse cx="70" cy="150" rx="43" ry="9" fill="#ffd7c7" opacity=".55"/><path d="M42 130 Q18 126 25 100 Q31 87 45 103" fill="#f59b67" stroke="#df744e" stroke-width="2"/><ellipse cx="70" cy="120" rx="31" ry="29" fill="#f59b67" stroke="#df744e" stroke-width="2"/><path d="M38 72 L25 30 L61 55 Z" fill="#f59b67" stroke="#df744e" stroke-width="2"/><path d="M102 72 L115 30 L79 55 Z" fill="#f59b67" stroke="#df744e" stroke-width="2"/><path d="M35 38 L46 57 L31 52 Z" fill="#ffd5df"/><path d="M105 38 L94 57 L109 52 Z" fill="#ffd5df"/><ellipse cx="70" cy="84" rx="40" ry="34" fill="#ffb37c" stroke="#df744e" stroke-width="2"/><ellipse cx="70" cy="100" rx="17" ry="12" fill="#fff5ec"/><circle cx="53" cy="75" r="4" fill="#36313d"/><circle cx="87" cy="75" r="4" fill="#36313d"/>' + glasses + '<ellipse cx="70" cy="91" rx="4" ry="3" fill="#41343f"/><path d="M70 95 q-7 7 -13 1 M70 95 q7 7 13 1" stroke="#41343f" stroke-width="2" stroke-linecap="round"/><ellipse cx="44" cy="92" rx="7" ry="4" fill="#ff9fba" opacity=".65"/><ellipse cx="96" cy="92" rx="7" ry="4" fill="#ff9fba" opacity=".65"/><text x="70" y="20" text-anchor="middle" font-size="18" fill="#f76c8c">✦</text></svg>',
      // 2. Otter
      '<svg viewBox="0 0 140 170" fill="none" xmlns="http://www.w3.org/2000/svg"><ellipse cx="70" cy="150" rx="42" ry="9" fill="#d9c4b7" opacity=".55"/><path d="M95 132 Q123 137 118 112 Q113 99 96 110" fill="#9a6f5d" stroke="#775244" stroke-width="2"/><ellipse cx="70" cy="120" rx="34" ry="30" fill="#a97963" stroke="#775244" stroke-width="2"/><circle cx="43" cy="54" r="12" fill="#8d624f"/><circle cx="97" cy="54" r="12" fill="#8d624f"/><ellipse cx="70" cy="80" rx="39" ry="33" fill="#b6846d" stroke="#775244" stroke-width="2"/><ellipse cx="70" cy="98" rx="22" ry="14" fill="#f7dfcf"/><circle cx="53" cy="75" r="4" fill="#352b31"/><circle cx="87" cy="75" r="4" fill="#352b31"/>' + glasses + '<ellipse cx="70" cy="91" rx="5" ry="3.5" fill="#352b31"/><path d="M70 96 q-7 6 -14 0 M70 96 q7 6 14 0" stroke="#352b31" stroke-width="2" stroke-linecap="round"/><path d="M45 94 L31 91 M45 98 L31 102 M95 94 L109 91 M95 98 L109 102" stroke="#775244" stroke-width="1.8" stroke-linecap="round"/><ellipse cx="45" cy="115" rx="10" ry="7" fill="#f7dfcf"/><ellipse cx="95" cy="115" rx="10" ry="7" fill="#f7dfcf"/><text x="70" y="22" text-anchor="middle" font-size="17" fill="#b68bea">✦</text></svg>',
      // 3. Penguin
      '<svg viewBox="0 0 140 170" fill="none" xmlns="http://www.w3.org/2000/svg"><ellipse cx="70" cy="151" rx="40" ry="9" fill="#d7d1ee" opacity=".6"/><ellipse cx="70" cy="116" rx="32" ry="35" fill="#343340" stroke="#25242d" stroke-width="2"/><path d="M39 111 Q22 105 26 88 Q34 82 43 94" fill="#4a4959"/><path d="M101 111 Q118 105 114 88 Q106 82 97 94" fill="#4a4959"/><ellipse cx="70" cy="83" rx="39" ry="36" fill="#454451" stroke="#25242d" stroke-width="2"/><ellipse cx="70" cy="93" rx="27" ry="24" fill="#fff"/><circle cx="53" cy="75" r="4" fill="#292733"/><circle cx="87" cy="75" r="4" fill="#292733"/>' + glasses + '<path d="M62 91 L70 99 L78 91 Z" fill="#ffba5e" stroke="#e5903e" stroke-width="1.5"/><ellipse cx="45" cy="145" rx="13" ry="5" fill="#ffba5e"/><ellipse cx="95" cy="145" rx="13" ry="5" fill="#ffba5e"/><circle cx="43" cy="98" r="4" fill="#ffb7cd" opacity=".7"/><circle cx="97" cy="98" r="4" fill="#ffb7cd" opacity=".7"/><text x="70" y="23" text-anchor="middle" font-size="17" fill="#7b6ad5">✦</text></svg>',
      // 4. Capybara
      '<svg viewBox="0 0 140 170" fill="none" xmlns="http://www.w3.org/2000/svg"><ellipse cx="70" cy="151" rx="44" ry="9" fill="#dac9b6" opacity=".55"/><ellipse cx="70" cy="119" rx="39" ry="29" fill="#a97856" stroke="#80583f" stroke-width="2"/><circle cx="42" cy="53" r="10" fill="#946546"/><circle cx="98" cy="53" r="10" fill="#946546"/><ellipse cx="70" cy="80" rx="43" ry="34" fill="#b6815d" stroke="#80583f" stroke-width="2"/><ellipse cx="70" cy="98" rx="25" ry="15" fill="#d9b38e"/><circle cx="53" cy="75" r="4" fill="#3c302d"/><circle cx="87" cy="75" r="4" fill="#3c302d"/>' + glasses + '<ellipse cx="70" cy="94" rx="7" ry="5" fill="#5a4035"/><circle cx="64" cy="94" r="1.3" fill="#201b1a"/><circle cx="76" cy="94" r="1.3" fill="#201b1a"/><path d="M70 101 q-8 5 -14 0 M70 101 q8 5 14 0" stroke="#5a4035" stroke-width="1.8" stroke-linecap="round"/><path d="M112 112 q12 -12 15 -26" stroke="#79b96a" stroke-width="5" stroke-linecap="round"/><ellipse cx="112" cy="84" rx="8" ry="4" fill="#8ccc78" transform="rotate(-35 112 84)"/><text x="70" y="22" text-anchor="middle" font-size="17" fill="#d69658">✦</text></svg>',
      // 5. Dog
      '<svg viewBox="0 0 140 170" fill="none" xmlns="http://www.w3.org/2000/svg"><ellipse cx="70" cy="151" rx="42" ry="9" fill="#f5d6a8" opacity=".6"/><ellipse cx="70" cy="118" rx="34" ry="30" fill="#e8ae68" stroke="#c98749" stroke-width="2"/><path d="M37 76 Q17 56 28 37 Q45 40 52 65" fill="#b97845" stroke="#9b5e39" stroke-width="2"/><path d="M103 76 Q123 56 112 37 Q95 40 88 65" fill="#b97845" stroke="#9b5e39" stroke-width="2"/><ellipse cx="70" cy="80" rx="40" ry="34" fill="#f1bd77" stroke="#c98749" stroke-width="2"/><ellipse cx="70" cy="98" rx="19" ry="13" fill="#fff0d4"/><circle cx="53" cy="75" r="4" fill="#3c302d"/><circle cx="87" cy="75" r="4" fill="#3c302d"/>' + glasses + '<ellipse cx="70" cy="91" rx="5" ry="3.5" fill="#41312d"/><path d="M70 96 q-7 6 -13 0 M70 96 q7 6 13 0" stroke="#41312d" stroke-width="2" stroke-linecap="round"/><path d="M64 103 Q70 115 76 103" fill="#ff8fa3" stroke="#c86976" stroke-width="1.2"/><circle cx="44" cy="96" r="5" fill="#ffb7cd" opacity=".65"/><circle cx="96" cy="96" r="5" fill="#ffb7cd" opacity=".65"/><text x="70" y="22" text-anchor="middle" font-size="17" fill="#f09a58">✦</text></svg>',
      // 6. Squirrel
      '<svg viewBox="0 0 140 170" fill="none" xmlns="http://www.w3.org/2000/svg"><ellipse cx="70" cy="151" rx="42" ry="9" fill="#f6d3b7" opacity=".55"/><path d="M100 130 Q128 117 116 79 Q108 58 92 78 Q112 87 99 103" fill="#e48555" stroke="#c86643" stroke-width="2"/><ellipse cx="65" cy="119" rx="31" ry="29" fill="#e99864" stroke="#c86643" stroke-width="2"/><path d="M39 70 L31 32 L60 57 Z" fill="#e48555" stroke="#c86643" stroke-width="2"/><path d="M91 70 L100 32 L72 57 Z" fill="#e48555" stroke="#c86643" stroke-width="2"/><ellipse cx="65" cy="80" rx="38" ry="33" fill="#efaa72" stroke="#c86643" stroke-width="2"/><ellipse cx="65" cy="99" rx="18" ry="12" fill="#fff1df"/><circle cx="48" cy="75" r="4" fill="#3c302d"/><circle cx="82" cy="75" r="4" fill="#3c302d"/>' + glasses.replace(/53/g,'48').replace(/87/g,'82').replace(/64/g,'59').replace(/76/g,'71').replace(/42/g,'37').replace(/98/g,'93') + '<ellipse cx="65" cy="91" rx="4" ry="3" fill="#4a342c"/><path d="M65 96 q-7 6 -13 0 M65 96 q7 6 13 0" stroke="#4a342c" stroke-width="2" stroke-linecap="round"/><path d="M72 124 L83 112 L94 124 Z" fill="#9c6b3b"/><path d="M79 115 Q85 108 91 115" stroke="#75a85b" stroke-width="3" fill="none"/><text x="65" y="22" text-anchor="middle" font-size="17" fill="#e77d55">✦</text></svg>'
    ];
    return animals[i % animals.length];
  }
  function render() {
    var slide = __uvdTutorialSlides[idx];
    var bigMascot = getMascotBig(idx);
    var animalNames = ['🦊 Cáo kính hồng', '🦦 Rái cá ham học', '🐧 Cánh cụt thông thái', '🦫 Capybara bình tĩnh', '🐶 Cún lanh lợi', '🐿️ Sóc chăm chỉ'];
    var animalName = animalNames[idx] || '🐾 Thú cưng học bài';
    box.innerHTML =
      '<button id="__uvd_tut_close__" class="uvd-tutorial-close" title="Đóng">✕</button>' +
      '<div class="uvd-tutorial-mascot-stage uvd-tutorial-slide-' + direction + '"><div class="uvd-tutorial-mascot-art">' + bigMascot + '</div><span class="uvd-tutorial-mascot-label">' + animalName + '</span></div>' +
      '<div class="uvd-tutorial-sub">' + slide.sub + '</div>' +
      '<div class="uvd-tutorial-title">' + slide.title + '</div>' +
      '<div class="uvd-tutorial-scroll"><div class="uvd-tutorial-text">' + slide.text + '</div>' +
      '<div class="uvd-tutorial-tip"><span>💡 Tip:</span> ' + slide.tips + '</div></div>' +
      '<div class="uvd-tutorial-nav"><div class="uvd-tutorial-dots">' + __uvdTutorialSlides.map(function(_,i){return '<span class="' + (i===idx ? 'uvd-tutorial-dot-active' : '') + '"></span>'}).join('') + '</div><div class="uvd-tutorial-nav-actions"><button id="__uvd_tut_prev__"' + (idx===0 ? ' disabled' : '') + '>← Trước</button><button id="__uvd_tut_next__">' + (idx===__uvdTutorialSlides.length-1 ? 'Xong ♡' : 'Tiếp →') + '</button></div></div>';
    var mute = document.createElement('button');
    mute.type = 'button'; mute.className = 'uvd-tutorial-mute'; mute.textContent = 'Đừng tự nhắc tutorial nữa';
    mute.onclick = function(){ data.settings.tutorialMuted = true; storage.set(data); toast('Đã tắt nhắc tutorial — xem lại trong Cài đặt nha ♡'); try{ overlay.remove(); }catch(e){} try{ __uvdRestoreUiAfterPopup(); }catch(e){} };
    box.appendChild(mute);
    box.querySelector('#__uvd_tut_close__').onclick = function(){ try{ overlay.remove(); }catch(e){} try{ __uvdRestoreUiAfterPopup(); var p=document.getElementById('__uvd__'); if(p){p.style.display=''; p.__uvdPopupHidden=false;} }catch(e){} };
    var prev = box.querySelector('#__uvd_tut_prev__');
    if (prev) prev.onclick = function(){ if(idx>0){direction='prev'; idx--; render();} };
    var next = box.querySelector('#__uvd_tut_next__');
    if (next) next.onclick = function(){ if(idx<__uvdTutorialSlides.length-1){direction='next'; idx++; render();} else { try{ overlay.remove(); }catch(e){} try{ __uvdRestoreUiAfterPopup(); }catch(e){} } };
    requestAnimationFrame(function() { __uvdAutoFitPopup(box, .54, .88); });
  }
  overlay.appendChild(box);
  __uvdAppendRoot(overlay);
  __uvdAutoFitPopup(box, .54, .88);
  try { (document.body||document.documentElement).appendChild(overlay); } catch(e){}
  overlay.style.zIndex='2147483647';
  overlay.addEventListener('click', function(e){ if(e.target===overlay){ try{ overlay.remove(); }catch(ex){} try{ __uvdRestoreUiAfterPopup(); var p=document.getElementById('__uvd__'); if(p){p.style.display=''; p.__uvdPopupHidden=false;} }catch(ex){} } });
  render();
}

// Load a real video thumbnail

// Load a real video thumbnail (muted, capture first frame) for quality links.
// Preview deliberately delegates to Stream rendering. There is no separate
// thumbnail/capture implementation here: this modal is simply one Stream card
// in a focused popup so it can never drift visually or functionally from Tab Stream.
// Preview uses the Stream card core, not a second full Stream list or a
// custom thumbnail engine. Keep only the visual core through quality/meta.
function __uvdOpenMediaPreviewPopup(url, type) {
  var old = document.getElementById('__uvd_media_preview__');
  if (old) old.remove();
  var overlay = document.createElement('div');
  overlay.id = '__uvd_media_preview__';
  overlay.className = 'uvd-media-preview-overlay';
  var panel = document.createElement('div');
  panel.className = 'uvd-media-preview-panel uvd-stream-preview-panel';
  var compact = __uvdCompactPopupUrl(url);
  panel.innerHTML = '<button type="button" class="uvd-media-preview-close" title="Đóng">✕</button>' +
    '<div class="uvd-media-preview-kicker">XEM TRƯỚC LINK</div>' +
    '<div class="uvd-media-preview-title">' + escapeHtml(String(type || 'VIDEO').toUpperCase()) + ' · core Stream</div>' +
    '<div class="uvd-media-preview-url" title="' + escapeHtml(url) + '">↗ ' + escapeHtml(compact) + '</div>' +
    '<div class="uvd-stream-preview-core"></div>' +
    '<div class="uvd-media-preview-actions"><button type="button" class="uvd-media-preview-play">▶ Xem link này</button><button type="button" class="uvd-media-preview-back">← Quay lại list</button></div>';
  overlay.appendChild(panel);
  __uvdAppendRoot(overlay);
  try { (document.body || document.documentElement).appendChild(overlay); } catch(e) {}
  __uvdAutoFitPopup(panel, .44, .82);
  var streamCore = panel.querySelector('.uvd-stream-preview-core');
  var item = urls.get(url) || {};
  var previousRenderVotes = __uvdRenderVotes;
  __uvdRenderVotes = false;
  var source = document.createElement('div');
  source.innerHTML = buildStreamCardHTML(Object.assign({}, item, { url: url, type: type || item.type || 'MP4', resolution: item.resolution || __uvdGetUrlResolution(url) }), 0);
  __uvdRenderVotes = previousRenderVotes;
  var streamCard = source.firstElementChild;
  streamCard.classList.add('uvd-stream-preview-core-card');
  Array.prototype.slice.call(streamCard.querySelectorAll('.uvd-cute-votes,.uvd-card-url-label,.uvd-url-box')).forEach(function(el) { el.remove(); });
  streamCore.appendChild(streamCard);
  hydrateVideoThumbnails(streamCore);
  function close() { try { overlay.remove(); } catch(e) {} }
  function playThisLink() {
    close();
    addToHistory(url, type || 'MP4');
    setTimeout(function() { try { __uvdShowPlayIntro(url, type || 'MP4'); } catch(e) {} }, 40);
  }
  streamCore.addEventListener('click', function(e) {
    var action = e.target && e.target.closest && e.target.closest('[data-action]');
    if (!action) return;
    e.preventDefault(); e.stopPropagation();
    if (action.dataset.action === 'play') playThisLink();
    else if (action.dataset.action === 'quality') showQualityPicker(url);
    else if (action.dataset.action === 'copy') { copy(url); toast('Đã sao chép link'); }
  });
  panel.querySelector('.uvd-media-preview-play').onclick = playThisLink;
  panel.querySelector('.uvd-media-preview-close').onclick = close;
  panel.querySelector('.uvd-media-preview-back').onclick = close;
  overlay.addEventListener('click', function(e) { if (e.target === overlay) close(); });
}
function __uvdCompactPopupUrl(raw) {
  try {
    var parsed = new URL(raw, location.href);
    var host = parsed.hostname.replace(/^www\./i, '');
    var parts = parsed.pathname.split('/').filter(Boolean);
    var tail = parts.length > 2 ? '…/' + parts.slice(-2).join('/') : parts.join('/');
    var label = host + (tail ? '/' + tail : '');
    return label.length > 76 ? label.slice(0, 73) + '…' : label;
  } catch(e) {
    raw = String(raw || '');
    return raw.length > 76 ? raw.slice(0, 73) + '…' : raw;
  }
}
function __uvdOpenMediaLinksPopup(streams) {
  __uvdMediaPopupUserDeferred = false;
  __uvdClearPopupReminder();
  __uvdSyncPopupMetadataFromStreamTab();
  streams = __uvdSortStreamsForPopup(streams || []).filter(function(stream) {
    return __uvdIsQualifiedMediaItem(stream && (stream.item || urls.get(stream.url)));
  });
  if (!streams.length) return false;
  var old = document.getElementById('__uvd_media_links_prompt__');
  if (old) old.remove();
  // Hide the UMP panel so this popup is never covered by the UI.
  __uvdHideUiForPopup();
  var overlay = document.createElement('div');
  overlay.id = '__uvd_media_links_prompt__';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;padding:18px;' +
    'background:rgba(28,14,40,.74);backdrop-filter:none;-webkit-backdrop-filter:none;';
  var panel = document.createElement('div');
  panel.className = 'uvd-glass-panel uvd-media-choice-popup' + (__uvdConsumeDiggingPopupHandoff() ? ' uvd-popup-from-digging' : '');
  panel.style.cssText = 'width:100%;max-width:520px;margin:auto;text-align:center;border-radius:28px;overflow:hidden;' +
    'background:linear-gradient(160deg,#f8f4ff 0%,#f3ecff 45%,#fff0f8 100%);border:1px solid rgba(194,150,255,.4);' +
    'box-shadow:0 28px 72px rgba(150,90,220,.36),0 0 0 6px rgba(255,255,255,.35) inset;' +
    'animation:uvdScaleIn .34s cubic-bezier(.22,1,.36,1) both;';
  panel.innerHTML =
    '<div class="uvd-workflow-hero uvd-media-workflow-hero">' +
      '<button id="__uvd_media_links_close__" class="uvd-workflow-close" title="Đóng">✕</button>' +
      '<button id="__uvd_media_back__" class="uvd-popup-back-btn" title="Quay lại">←</button>' +
      '<div class="uvd-media-popup-mascot">' + __uvdMediaCuteArt + '</div>' +
      '<div class="uvd-workflow-kicker">KHO VIDEO MÈO VỪA TÌM ĐƯỢC</div>' +
    '</div>' +
    '<div class="uvd-workflow-body">' +
      '<div class="uvd-workflow-title">Tìm thấy ' + streams.length + ' link video rồi nè 🐰</div>' +
      '<div class="uvd-workflow-copy">Đã lọc bỏ link rác. Bấm <b>Xem</b> để mở video thật.</div>' +
      __uvdFeedbackNoticeHtml('uvd-popup-feedback') +
      '<div id="__uvd_media_links_list__" class="uvd-workflow-list"></div>' +
      '<button class="uvd-btn uvd-btn-sm uvd-workflow-later" id="__uvd_media_links_cancel__">Để sau</button>' +
    '</div>';
  var list = panel.querySelector('#__uvd_media_links_list__');
  __uvdRenderVotes = false;
  // Quay lại link đơn giản: mỗi link 1 dòng text + nút Xem (không thumbnail, không mũi chĩa).
  streams.slice(0, 8).forEach(function(stream, index) {
    var popupItem = stream.item || urls.get(stream.url) || {};
    var isMultiQuality = __uvdPopupQualityTier(stream) === 3;
    var isQualityOnly = __uvdPopupQualityTier(stream) === 0;
    var hasMeta = !!(popupItem.qualityCount || popupItem.isMaster || popupItem.resolution);
    var row = document.createElement('div');
    row.className = 'uvd-plplain';
    var mascots = [ (typeof __uvdTabMascotPanda !== 'undefined' ? __uvdTabMascotPanda : ''), (typeof __uvdTabMascotRaccoon !== 'undefined' ? __uvdTabMascotRaccoon : ''), (typeof __uvdTabMascotHamster !== 'undefined' ? __uvdTabMascotHamster : '') ];
    var mascotHtml = mascots[index % mascots.length] || mascots[0];
    var cuteIcon = document.createElement('div');
    cuteIcon.className = 'uvd-plplain-cute-icon';
    cuteIcon.innerHTML = mascotHtml;
    var paw1 = document.createElement('i'); paw1.className = 'uvd-plplain-paw uvd-plplain-paw-one';
    var paw2 = document.createElement('i'); paw2.className = 'uvd-plplain-paw uvd-plplain-paw-two';
    var body = document.createElement('div');
    body.className = 'uvd-plplain-body';
    var typeText = String(stream.type || 'MEDIA').toUpperCase();
    var badge = '<span class="uvd-plplain-badge">#' + (index + 1) + ' ' + typeText + '</span>';
    if (isMultiQuality) badge += ' <span class="uvd-plplain-q">✨ đa chất lượng · ưu tiên</span>';
    else if (isQualityOnly) badge += ' <span class="uvd-plplain-q uvd-plplain-quality-only">QUALITY ONLY · xếp sau</span>';
    else if (hasMeta) badge += ' <span class="uvd-plplain-q">✨ có metadata</span>';
    var popGuide = isQualityOnly
      ? '📎 Chỉ có một quality/preview — Mèo xếp sau các link đa chất lượng nha.'
      : (String(stream.type || '').toUpperCase() === 'M3U8'
        ? '📺 Playlist HLS — bấm Xem để chọn chất lượng nha.'
        : '📼 Link video thật — bấm Xem để phát ngay nha.');
    var compactUrl = __uvdCompactPopupUrl(stream.url);
    body.innerHTML = '<div class="uvd-plplain-top">' + badge + '</div>' +
      '<div class="uvd-plplain-url" title="' + escapeHtml(stream.url) + '">↗ ' + escapeHtml(compactUrl) + '</div>' +
      '<div class="uvd-plplain-note">' + popGuide + '</div>';
    body.appendChild(__uvdCreateDetectionVoteControls(stream.url, 'video'));
    var actions = document.createElement('div');
    actions.className = 'uvd-plplain-actions';
    var play = document.createElement('button');
    play.className = 'uvd-plrow-watch';
    play.textContent = 'Xem ♡';
    play.onclick = function() {
      var url = stream.url, type = stream.type || 'MP4';
      addToHistory(url, type);
      overlay.remove(); __uvdPopupDismiss();
      setTimeout(function() { try { __uvdShowPlayIntro(url, type); } catch(e) {} }, 60);
    };
    var preview = document.createElement('button');
    preview.type = 'button';
    preview.className = 'uvd-plrow-preview';
    preview.textContent = '⌁ Xem trước';
    preview.onclick = function(e) { e.stopPropagation(); __uvdOpenMediaPreviewPopup(stream.url, stream.type); };
    actions.appendChild(play);
    actions.appendChild(preview);
    row.appendChild(body);
    row.appendChild(actions);
    list.appendChild(row);
  });
  function closeMedia() {
    __uvdMediaPopupDismissedAt = Date.now();
    try { overlay.remove(); } catch(e){}
    __uvdPopupDismiss();
    // Force restore UI - fix bug X khong hien lai UI
    try {
      __uvdRestoreUiAfterPopup();
      var p = document.getElementById('__uvd__');
      if (p) { p.style.display = ''; p.__uvdPopupHidden = false; }
    } catch(e){}
    __uvdSetPopupReminder('media');
  }
  // "Để sau" returns to Main UI with its in-session reminder.
  var cancel = panel.querySelector('#__uvd_media_links_cancel__');
  if (cancel) cancel.onclick = function() {
    __uvdMediaPopupDismissedAt = Date.now();
    overlay.remove();
    __uvdRestoreUiAfterPopup();
    __uvdShowPopupReopenBtn('media');
  };
  // Nút X → đóng hẳn, mất luôn.
  var closeX = panel.querySelector('#__uvd_media_links_close__');
  if (closeX) closeX.onclick = closeMedia;
  var mediaBack = panel.querySelector('#__uvd_media_back__');
  if (mediaBack) mediaBack.onclick = function(e) { e.stopPropagation(); closeMedia(); };
  overlay.appendChild(panel);
  __uvdAppendRoot(overlay);
  __uvdAutoFitPopup(panel, .60, .90);
  // Make sure the popup sits above everything (including the main UMP panel).
  try { (document.body || document.documentElement).appendChild(overlay); } catch(e) {}
  overlay.style.zIndex = '2147483647';
  overlay.addEventListener('click', function(e) { if (e.target === overlay) closeMedia(); });
}
function __uvdHasRealDirectStreams() {
  var direct = [...urls.entries()].filter(function(entry) {
    // Blob (MediaSource) không tính là link video để mở popup.
    return ['M3U8','MP4','MPD','WEBM','TS'].indexOf(entry[1].type) !== -1;
  });
  return direct;
}
function __uvdIsDemoStream(entry) {
  var item = (entry && entry[1]) || {};
  if (item.demo === true) return true;
  if (/preview|trailer|sample|teaser|demo/i.test(String((entry && entry[0]) || ''))) return true;
  return false;
}
function __uvdMaybeOfferMediaPopup(force) {
  // The first captured link is presented by the digging cat intro and the
  // Streams body rising from below. Never open the legacy popup on top of it,
  // even for a reload/reopen request while the cat is still digging.
  var direct = __uvdQualifiedDirectEntries();
  if (__uvdDiggingFlow.active) return;
  if (!force && __uvdDiggingFlow.completed) return;
  if (!direct.length) return;
  if (playerState.overlay) return;
  if (!force && (__uvdMediaPopupShown || __uvdMediaPopupUserDeferred)) return;
  if (force) { __uvdMediaPopupDismissedAt = 0; __uvdMediaPopupUserDeferred = false; }
  if (Date.now() - (__uvdMediaPopupDismissedAt || 0) < 60000) return;
  // force only reopens a previously valid popup; it never bypasses the
  // duration + metadata + thumbnail proof required above.
  if (!direct.length) return;
  __uvdMediaPopupShown = true;
  var mapped = direct.map(function(e) { return { url: e[0], type: e[1].type, item: e[1] }; });
  __uvdOpenMediaLinksPopup(__uvdSortStreamsForPopup(mapped));
}

function __uvdProbeIframeThroughParent(iframeUrl, onReady) {
  var proxy = __uvdAiProxyBase();
  if (!proxy) { if (typeof onReady === 'function') onReady([]); return; }
  var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  var timeout = setTimeout(function() { if (controller) controller.abort(); }, 12000);
  fetch(proxy + '/iframe-probe', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ parentUrl: location.href, iframeUrl: iframeUrl }),
    signal: controller ? controller.signal : undefined
  }).then(function(response) { return response.ok ? response.json() : null; }).then(function(payload) {
    clearTimeout(timeout);
    var media = payload && Array.isArray(payload.media) ? payload.media : [];
    media.forEach(function(entry) { if (entry && entry.url) __uvdAddDetectedMediaUrl(entry.url, entry.type || 'MP4', 'iframe-parent-probe'); });
    if (typeof onReady === 'function') onReady(media);
  }).catch(function() { clearTimeout(timeout); if (typeof onReady === 'function') onReady([]); });
}

function __uvdOpenIframeWorkflowPrompt(candidates) {
  __uvdIframeWorkflowUserDeferred = false;
  __uvdClearPopupReminder();
  // The iframe helper replaces the initial digging state when no direct link
  // has appeared; do not leave two overlays competing for the screen.
  __uvdStopDiggingPopup(true);
  var old = document.getElementById('__uvd_iframe_workflow_prompt__');
  if (old) old.remove();
  // Hide the UMP panel so this popup is never covered by the UI.
  __uvdHideUiForPopup();
  var overlay = document.createElement('div');
  overlay.id = '__uvd_iframe_workflow_prompt__';
  // Dim the whole page behind so the cute notice stands out.
  overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;padding:18px;' +
    'background:rgba(12,8,20,.74);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);';
  var panel = document.createElement('div');
  panel.className = 'uvd-glass-panel' + (__uvdConsumeDiggingPopupHandoff() ? ' uvd-popup-from-digging' : '');
  panel.style.cssText = 'width:100%;max-width:520px;margin:auto;text-align:center;border-radius:28px;overflow:hidden;' +
    'background:linear-gradient(160deg,#fff6fa 0%,#fff0f5 45%,#fdf3ff 100%);border:1px solid rgba(255,159,180,.45);' +
    'box-shadow:0 28px 72px rgba(232,120,143,.38),0 0 0 6px rgba(255,255,255,.35) inset;' +
    'animation:uvdScaleIn .34s cubic-bezier(.22,1,.36,1) both;';
  var hasIntermediateServer = candidates.some(function(candidate) { return /supremejav\.com\/supjav\.php/i.test(candidate.url); });
  panel.innerHTML =
    '<div class="uvd-workflow-hero uvd-iframe-workflow-hero">' +
      '<button id="__uvd_iframe_workflow_close_x__" class="uvd-workflow-close" title="Đóng">✕</button>' +
      '<button id="__uvd_iframe_back__" class="uvd-popup-back-btn" title="Quay lại">←</button>' +
      '<div class="uvd-iframe-popup-mascot">' + __uvdIframeCuteArt + '</div>' +
      '<div class="uvd-workflow-kicker">MÈO ĐANG LẦN THEO PLAYER</div>' +
    '</div>' +
    '<div class="uvd-workflow-body">' +
      '<div class="uvd-workflow-title">' + (hasIntermediateServer ? 'Server trung gian cần mở 🥺' : 'Không có link video — chỉ có iframe 🥺') + '</div>' +
      '<div class="uvd-workflow-copy">' +
        (hasIntermediateServer
          ? 'Link này chưa phải video trực tiếp. Hãy mở server trung gian ở tab mới, sau đó bấm Mèo cào media lại trên tab đó để lấy link thật.'
          : 'Trang này chưa để lộ link video trực tiếp, chỉ có iframe embed. 👉 Bạn hãy <b>bấm vào iframe</b> bên dưới, đợi nó phát, rồi <b>chạy Mèo cào media lại một lần nữa</b> để lấy link video thật.') +
      '</div>' +
      __uvdFeedbackNoticeHtml('uvd-popup-feedback') +
      '<div id="__uvd_iframe_workflow_list__" class="uvd-workflow-list"></div>' +
      '<button class="uvd-btn uvd-btn-sm uvd-workflow-later" id="__uvd_iframe_workflow_cancel__">Để sau</button>' +
    '</div>';
  var list = panel.querySelector('#__uvd_iframe_workflow_list__');
  candidates.slice(0, 6).forEach(function(candidate, index) {
    var row = document.createElement('div');
    row.className = 'uvd-iframe-cute-row';
    row.style.cssText = ''; // moved to css class
    var iframeMascots = { 'PLAYER': (typeof __uvdTabMascotPanda !== 'undefined' ? __uvdTabMascotPanda : ''), 'JUNK': (typeof __uvdTabMascotRaccoon !== 'undefined' ? __uvdTabMascotRaccoon : ''), 'UNKNOWN': (typeof __uvdTabMascotHamster !== 'undefined' ? __uvdTabMascotHamster : '') };
    var icon = document.createElement('div');
    icon.className = 'uvd-iframe-cute-icon';
    icon.innerHTML = iframeMascots[candidate.verdict] || iframeMascots['UNKNOWN'];
    var ipaw1 = document.createElement('i'); ipaw1.className = 'uvd-plplain-paw uvd-plplain-paw-one';
    var ipaw2 = document.createElement('i'); ipaw2.className = 'uvd-plplain-paw uvd-plplain-paw-two';
    var label = document.createElement('div');
    label.className = 'uvd-plplain-body';
    label.style.cssText = 'flex:1;min-width:0;';
    var badgeColor = candidate.verdict === 'PLAYER' ? '#3aa97f' : (candidate.verdict === 'JUNK' ? '#ff5d72' : '#c9862a');
    var badgeText = candidate.verdict === 'PLAYER' ? 'PLAYER ✓' : (candidate.verdict === 'JUNK' ? 'JUNK ✗' : 'UNKNOWN ?');
    label.innerHTML = '<div style="margin-bottom:2px;"><span style="display:inline-block;padding:1px 7px;border-radius:6px;font-size:8.5px;font-weight:800;color:#fff;background:' + badgeColor + ';">' + badgeText + '</span> <span style="color:#c95073;font-weight:700;">#' + (index + 1) + '</span></div>' + escapeHtml(candidate.url);
    label.appendChild(__uvdCreateDetectionVoteControls(candidate.url, 'iframe'));
    if (candidate.verdict === 'JUNK') row.style.opacity = '0.55';
    var actionStack = document.createElement('div');
    actionStack.className = 'uvd-iframe-probe-actions';
    var probe = document.createElement('button');
    probe.type = 'button';
    probe.className = 'uvd-iframe-probe-btn';
    probe.textContent = '⚡ Dò qua trang mẹ';
    probe.onclick = function() {
      if (probe.dataset.busy === '1') return;
      probe.dataset.busy = '1'; probe.textContent = '⏳ Đang dò…';
      __uvdProbeIframeThroughParent(candidate.url, function(media) {
        probe.dataset.busy = '';
        if (!media.length) { probe.textContent = '⚡ Chưa thấy config'; return; }
        probe.textContent = '✅ Đã thấy ' + media.length + ' link';
        // Wait briefly for the normal strict verifier, then replace this
        // workflow with the direct-media popup when it has enough evidence.
        var tries = 0;
        function promoteDirect() {
          var direct = __uvdQualifiedDirectEntries();
          if (direct.length) {
            overlay.remove(); __uvdPopupDismiss();
            var mapped = direct.map(function(entry) { return { url: entry[0], type: entry[1].type, item: entry[1] }; });
            __uvdOpenMediaLinksPopup(__uvdSortStreamsForPopup(mapped));
            return;
          }
          if (++tries < 6) setTimeout(promoteDirect, 1500);
          else { probe.textContent = '✅ Đang kiểm chứng link…'; }
        }
        promoteDirect();
      });
    };
    var open = document.createElement('button');
    open.className = 'uvd-btn uvd-btn-sm';
    open.textContent = 'Mở + Copy';
    open.style.cssText = 'border-radius:12px;background:#ffb6c6;border:none;color:#fff;font-weight:700;';
    open.onclick = function() {
      copy(BOOKMARKLET_NAME);
      // Self-learn: the user opened this iframe believing it is the player.
      __uvdLearnIframe(__uvdMediaHostOf(candidate.url), 'PLAYER');
      addToHistory(candidate.url, 'IFRAME');
      window.__uvdSafeOpen(candidate.url);
      overlay.remove();
      // Popup is gone now, so restore the script UI as promised.
      __uvdPopupDismiss();
      toast('Đã mở iframe và copy: ' + BOOKMARKLET_NAME);
    };
    actionStack.appendChild(probe);
    actionStack.appendChild(open);
    row.appendChild(label);
    row.appendChild(actionStack);
    list.appendChild(row);
  });
  function closeIframe() {
    __uvdIframeWorkflowDismissedAt = Date.now();
    try { overlay.remove(); } catch(e){}
    __uvdPopupDismiss();
    try {
      __uvdRestoreUiAfterPopup();
      var p = document.getElementById('__uvd__');
      if (p) { p.style.display = ''; p.__uvdPopupHidden = false; }
    } catch(e){}
    __uvdSetPopupReminder('iframe');
  }
  // "Để sau" returns to Main UI with its in-session reminder.
  var cancel = panel.querySelector('#__uvd_iframe_workflow_cancel__');
  if (cancel) cancel.onclick = function() {
    __uvdIframeWorkflowDismissedAt = Date.now();
    overlay.remove();
    __uvdRestoreUiAfterPopup();
    __uvdShowPopupReopenBtn('iframe');
  };
  // Nút X → đóng hẳn, mất luôn.
  var closeX = panel.querySelector('#__uvd_iframe_workflow_close_x__');
  if (closeX) closeX.onclick = closeIframe;
  var iframeBack = panel.querySelector('#__uvd_iframe_back__');
  if (iframeBack) iframeBack.onclick = function(e) { e.stopPropagation(); closeIframe(); };
  overlay.appendChild(panel);
  __uvdAppendRoot(overlay);
  __uvdAutoFitPopup(panel, .60, .90);
  // Keep iframe popup above the main panel too.
  try { (document.body || document.documentElement).appendChild(overlay); } catch(e) {}
  overlay.style.zIndex = '2147483647';
  overlay.addEventListener('click', function(e) { if (e.target === overlay) closeIframe(); });
}
function __uvdHasRealVideoCandidate() {
  var direct = [...urls.entries()].filter(function(entry) {
    return ['M3U8','MP4','MPD','WEBM','TS'].indexOf(entry[1].type) !== -1;
  });
  if (direct.some(function(entry) { return entry[1].demo === false; })) return true;
  try {
    return [...document.querySelectorAll('video')].some(function(video) {
      return !__uvdIsOwnUI(video) && video.readyState >= 2 && !__uvdIsDemoVideoElement(video);
    });
  } catch(e) { return false; }
}
function __uvdDismissIframeWorkflowIfVideoFound() {
  var prompt = document.getElementById('__uvd_iframe_workflow_prompt__');
  if (!prompt || !__uvdHasRealVideoCandidate()) return;
  prompt.remove();
  __uvdIframeWorkflowAsked = true;
}
function installIframeWorkflowVideoWatcher() {
  ['loadedmetadata', 'loadeddata', 'durationchange', 'playing'].forEach(function(type) {
    document.addEventListener(type, __uvdDismissIframeWorkflowIfVideoFound, true);
  });
  addCleanup(function() {
    ['loadedmetadata', 'loadeddata', 'durationchange', 'playing'].forEach(function(type) {
      document.removeEventListener(type, __uvdDismissIframeWorkflowIfVideoFound, true);
    });
  });
  // Re-offer the "only iframe" popup whenever the user comes back to this tab.
  // Otherwise opening the iframe in a new tab and returning loses the notice.
  var __uvdReofferTimer = null;
  function __uvdCanReoffer() {
    if (__uvdDiggingFlow.active || __uvdDiggingFlow.completed) return false;
    // Re-offer only when there is no visible popup, the page is still
    // iframe-only (no real video yet), and the user has not explicitly
    // dismissed it within the last 60s.
    if (document.getElementById('__uvd_iframe_workflow_prompt__')) return false;
    if (!__uvdHasOnlyIframeOrDemo()) return false;
    if (__uvdIframeWorkflowUserDeferred) return false;
    if (Date.now() - (__uvdIframeWorkflowDismissedAt || 0) < 60000) return false;
    return true;
  }
  var onVisible = function() {
    if (document.visibilityState !== 'visible') return;
    if (__uvdDiggingFlow.active || __uvdDiggingFlow.completed) return;
    clearTimeout(__uvdReofferTimer);
    __uvdReofferTimer = setTimeout(function() {
      // Re-offer the iframe-only popup, or the found-media popup, on return.
      if (__uvdCanReoffer()) __uvdMaybeOfferIframeWorkflow(true);
      else __uvdMaybeOfferMediaPopup(true);
    }, 900);
  };
  document.addEventListener('visibilitychange', onVisible);
  // Also re-check once a while later (covers pages that never fire the change
  // but still allow the user to come back and find the notice gone).
  var __uvdReofferInterval = setInterval(function() {
    if (document.visibilityState !== 'visible') return;
    if (__uvdCanReoffer()) __uvdMaybeOfferIframeWorkflow(true);
  }, 45000);
  addCleanup(function() {
    document.removeEventListener('visibilitychange', onVisible);
    clearTimeout(__uvdReofferTimer);
    clearInterval(__uvdReofferInterval);
  });
}
// Hybrid AI layer: if the user has configured an LLM proxy URL in Settings,
// POST the shortlist of iframe candidates to POST /classify on that proxy so
// an external LLM (keyed by OPENAI_API_KEY on the server side only) can give a
// final PLAYER/JUNK/UNKNOWN verdict. If the proxy is missing, unreachable, or
// returns configured:false, we keep the local heuristic ranking unchanged.
function __uvdAskAiClassifyIframes(candidates, cb) {
  var proxy = __uvdAiProxyBase();
  if (!proxy || !data.settings.aiIframeFilter) { cb(candidates); return; }
  var payload = {
    pageUrl: location.href,
    pageHost: pageInfo.host,
    pageTitle: pageInfo.title,
    candidates: candidates.map(function(c) { return { url: c.url, score: c.score, verdict: c.verdict, reasons: c.reasons || [] }; })
  };
  var done = false;
  var controller = (typeof AbortController !== 'undefined') ? new AbortController() : null;
  var timer = setTimeout(function() { if (controller) controller.abort(); }, 9000);
  function settle(updated) { if (done) return; done = true; clearTimeout(timer); cb(updated); }
  fetch(proxy + '/classify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: controller ? controller.signal : undefined
  })
  .then(function(r) { return r.ok ? r.json() : null; })
  .then(function(json) {
    if (!json || json.configured === false || !Array.isArray(json.results)) { settle(candidates); return; }
    var byUrl = {};
    json.results.forEach(function(r) { if (r && r.url) byUrl[r.url] = r; });
    candidates.forEach(function(c) {
      var ai = byUrl[c.url];
      if (!ai || !ai.verdict) return;
      if (ai.verdict === 'PLAYER') { c.score = Math.max(c.score, 90); c.verdict = 'PLAYER'; c.aiSource = 'LLM'; }
      else if (ai.verdict === 'JUNK') { c.score = Math.min(c.score, -30); c.verdict = 'JUNK'; c.aiSource = 'LLM'; }
    });
    candidates.sort(function(a, b) { return b.score - a.score; });
    settle(candidates);
  })
  .catch(function() { settle(candidates); });
}

// Gemini sees only host + technical metadata here, never the media URL,
// source title, page title, cookie, token, or the video binary itself.
var __uvdAiMediaPending = {};
var __uvdAiMediaTimer = null;
var __uvdAiMediaAvailable = null;
function __uvdAiProxyBase() {
  return String(data.settings.llmProxyUrl || RENDER_PROXY_BASE || '').trim().replace(/\/$/, '');
}
function __uvdEstimateMediaBytes(item) {
  if (!item) return 0;
  if (Number(item.contentLength) > 0) return Number(item.contentLength);
  if (Number(item.bandwidth) > 0 && Number(item.durationSeconds) > 0) return Math.round((Number(item.bandwidth) / 8) * Number(item.durationSeconds));
  return 0;
}
function __uvdIsAiJunkVideo(url) {
  var item = urls.get(url);
  return !!(item && item.aiMediaVerdict === 'JUNK' && Number(item.aiMediaConfidence || 0) >= .72);
}
function __uvdIsRejectedVideo(url) {
  return __uvdIsLearnedJunkVideo(url) || __uvdIsAiJunkVideo(url);
}
function __uvdQueueAiMediaAnalysis(url) {
  var item = urls.get(url);
  if (!item || !__uvdIsDiggingDirectType(item.type) || __uvdIsRejectedVideo(url) || data.settings.aiIframeFilter === false || __uvdAiMediaAvailable === false) return;
  if (!(item.hasThumbnail || item.resolution || item.isMaster || (Number(item.qualityCount) || 0) > 0 || Number(item.durationSeconds) > 0)) return;
  if (item.aiMediaPending || (item.aiMediaAnalyzedAt && Date.now() - item.aiMediaAnalyzedAt < 15 * 60 * 1000)) return;
  item.aiMediaPending = true;
  __uvdAiMediaPending[url] = true;
  clearTimeout(__uvdAiMediaTimer);
  __uvdAiMediaTimer = setTimeout(__uvdFlushAiMediaAnalysis, 850);
}
function __uvdFlushAiMediaAnalysis() {
  __uvdAiMediaTimer = null;
  var proxy = __uvdAiProxyBase();
  var urlsToCheck = Object.keys(__uvdAiMediaPending).slice(0, 12);
  __uvdAiMediaPending = {};
  if (!proxy || !urlsToCheck.length) return;
  var lookup = {};
  var candidates = urlsToCheck.map(function(url, index) {
    var item = urls.get(url) || {};
    var id = 'm' + index;
    lookup[id] = url;
    return {
      id: id,
      host: __uvdMediaHostOf(url),
      type: item.type || '',
      qualityCount: item.qualityCount || 0,
      isMaster: !!item.isMaster,
      resolution: item.resolution || '',
      durationSeconds: item.durationSeconds || 0,
      estimatedBytes: __uvdEstimateMediaBytes(item),
      source: String(item.source || '').replace(/https?:\/\/\S+/gi, '')
    };
  }).filter(function(candidate) { return !!candidate.host; });
  if (!candidates.length) return;
  var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  var timer = setTimeout(function() { if (controller) controller.abort(); }, 9000);
  fetch(proxy + '/analyze-media', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ candidates: candidates }), signal: controller ? controller.signal : undefined
  }).then(function(r) { return r.ok ? r.json() : null; }).then(function(json) {
    clearTimeout(timer);
    if (!json || json.configured === false) { __uvdAiMediaAvailable = false; return; }
    __uvdAiMediaAvailable = true;
    (Array.isArray(json.results) ? json.results : []).forEach(function(result) {
      var url = lookup[result && result.id];
      var item = url && urls.get(url);
      if (!item || !result || !/^(VIDEO|JUNK|UNKNOWN)$/.test(result.verdict)) return;
      item.aiMediaVerdict = result.verdict;
      item.aiMediaConfidence = Math.max(0, Math.min(1, Number(result.confidence) || 0));
      item.aiMediaReason = String(result.reason || '').slice(0, 140);
      item.aiMediaAnalyzedAt = Date.now();
      item.aiMediaPending = false;
    });
    if (typeof debouncedBuildUI === 'function') debouncedBuildUI();
  }).catch(function() {
    clearTimeout(timer);
    urlsToCheck.forEach(function(url) { var item = urls.get(url); if (item) item.aiMediaPending = false; });
  });
}

function __uvdMaybeOfferIframeWorkflow(force) {
  if (__uvdDiggingFlow.active) return;
  __uvdDismissIframeWorkflowIfVideoFound();
  if (!force && Date.now() < __uvdIframeWorkflowEarliest) return;
  if (playerState.overlay) return;
  if (force) { __uvdIframeWorkflowDismissedAt = 0; __uvdIframeWorkflowUserDeferred = false; }
  if ((__uvdIframeWorkflowAsked || __uvdIframeWorkflowUserDeferred) && !force) return;
  if (!__uvdHasOnlyIframeOrDemo()) return;
  if (!data.settings.aiIframeFilter) return;
  var allFrames = __uvdCollectWorkflowFrames();
  // AI layer: prefer real players, drop hard junk unless nothing else exists.
  var candidates = allFrames.filter(function(candidate) { return candidate.score >= 20; });
  if (!candidates.length) candidates = allFrames.filter(function(c) { return c.verdict !== 'JUNK'; });
  // Chỉ hiện popup nếu có iframe thật (PLAYER) hoặc ít nhất là UNKNOWN.
  var hasUsable = candidates.some(function(c) { return c.verdict === 'PLAYER' || c.verdict === 'UNKNOWN'; });
  if (!candidates.length || !hasUsable) return;
  __uvdIframeWorkflowAsked = true;
  __uvdAskAiClassifyIframes(candidates, function(ranked) {
    if (playerState.overlay) return;
    var good = ranked.filter(function(c) { return c.verdict !== 'JUNK' || ranked.filter(function(x) { return x.verdict === 'JUNK'; }).length === ranked.length; });
    __uvdOpenIframeWorkflowPrompt(good.length ? good : ranked);
  });
}

// ========== BONG BÓNG COMIC: mascot từng tab ==========
var __uvdTabMascotCat =
  '<svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">' +
    '<circle cx="32" cy="36" r="22" fill="#ffe0ea"/><circle cx="21" cy="23" r="10" fill="#ffb6c6"/><circle cx="43" cy="23" r="10" fill="#ffb6c6"/>' +
    '<path d="M21 23 L13 9 L29 17 Z" fill="#ff9fb4"/><path d="M43 23 L51 9 L35 17 Z" fill="#ff9fb4"/>' +
    '<circle cx="27" cy="37" r="3.4" fill="#5b3a40"/><circle cx="37" cy="37" r="3.4" fill="#5b3a40"/>' +
    '<circle cx="28" cy="36" r="1.2" fill="#fff"/><circle cx="38" cy="36" r="1.2" fill="#fff"/>' +
    '<ellipse cx="32" cy="43" rx="3" ry="4" fill="#5b3a40"/><ellipse cx="32" cy="41.5" rx="1.5" ry="1.6" fill="#e8788f"/>' +
    '<path d="M12 12 q-3 -4 0 -6" stroke="#5b3a40" stroke-width="1.6" stroke-linecap="round" fill="none"/>' +
    '<path d="M52 12 q3 -4 0 -6" stroke="#5b3a40" stroke-width="1.6" stroke-linecap="round" fill="none"/>' +
  '</svg>';
var __uvdTabMascotBear =
  '<svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">' +
    '<ellipse cx="32" cy="40" rx="20" ry="19" fill="#ffe0c4"/><circle cx="20" cy="20" r="11" fill="#ffd0b0"/><circle cx="44" cy="20" r="11" fill="#ffd0b0"/>' +
    '<circle cx="20" cy="18" r="4" fill="#ffb894"/><circle cx="44" cy="18" r="4" fill="#ffb894"/>' +
    '<circle cx="26" cy="38" r="3.6" fill="#4a2c20"/><circle cx="38" cy="38" r="3.6" fill="#4a2c20"/>' +
    '<circle cx="27" cy="37" r="1.2" fill="#fff"/><circle cx="39" cy="37" r="1.2" fill="#fff"/>' +
    '<ellipse cx="32" cy="45" rx="4" ry="3.2" fill="#4a2c20"/><ellipse cx="32" cy="44" rx="2" ry="1.6" fill="#ff9fb4"/>' +
  '</svg>';
var __uvdTabMascotRabbit =
  '<svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">' +
    '<ellipse cx="32" cy="42" rx="18" ry="20" fill="#fff" stroke="#e4d5ff" stroke-width="1.6"/>' +
    '<path d="M16 42 Q4 10 22 22 Q17 32 18 40 Z" fill="#fff" stroke="#e4d5ff" stroke-width="1.6"/>' +
    '<path d="M48 42 Q60 10 42 22 Q47 32 46 40 Z" fill="#fff" stroke="#e4d5ff" stroke-width="1.6"/>' +
    '<path d="M16 16 q-3 -2 -3 -5 q0 -3 3 -2 q2 -2 4 1 z" fill="#ffc9de"/>' +
    '<path d="M48 16 q3 -2 3 -5 q0 -3 -3 -2 q-2 -2 -4 1 z" fill="#ffc9de"/>' +
    '<circle cx="26" cy="40" r="3.2" fill="#4a3550"/><circle cx="38" cy="40" r="3.2" fill="#4a3550"/>' +
    '<circle cx="27" cy="39" r="1.1" fill="#fff"/><circle cx="39" cy="39" r="1.1" fill="#fff"/>' +
    '<ellipse cx="32" cy="45" rx="2.4" ry="3.4" fill="#ff9fb4"/>' +
  '</svg>';
// NEW: gấu trúc, gấu mèo, hamster - phong phú và hạn chế trùng trong Settings + Player
var __uvdTabMascotPanda =
  '<svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">' +
    '<g class="uvd-panda-ear" style="transform-origin:18px 18px"><circle cx="18" cy="18" r="9" fill="#2b2b33"/><circle cx="18" cy="18" r="3" fill="#fff" opacity=".2"/></g>' +
    '<g class="uvd-panda-ear" style="transform-origin:46px 18px"><circle cx="46" cy="18" r="9" fill="#2b2b33"/><circle cx="46" cy="18" r="3" fill="#fff" opacity=".2"/></g>' +
    '<ellipse cx="32" cy="38" rx="20" ry="18" fill="#fff" stroke="#e8e0e6" stroke-width="1.5"/>' +
    '<ellipse cx="23" cy="36" rx="6.5" ry="7.5" fill="#2b2b33"/><ellipse cx="41" cy="36" rx="6.5" ry="7.5" fill="#2b2b33"/>' +
    '<circle cx="24.2" cy="37.5" r="2.4" fill="#fff"/><circle cx="40.2" cy="37.5" r="2.4" fill="#fff"/><circle cx="24.5" cy="38" r="1" fill="#111"/><circle cx="40.5" cy="38" r="1" fill="#111"/>' +
    '<ellipse cx="32" cy="44" rx="2.8" ry="2" fill="#2b2b33"/><ellipse cx="32" cy="47.5" rx="5" ry="3" fill="#fff"/><path d="M28 48 Q32 50 36 48" stroke="#2b2b33" stroke-width="1.2" stroke-linecap="round" fill="none"/>' +
    '<ellipse cx="19" cy="44" rx="4" ry="2.6" fill="#ffb6c6" opacity=".65"/><ellipse cx="45" cy="44" rx="4" ry="2.6" fill="#ffb6c6" opacity=".65"/>' +
  '</svg>';
var __uvdTabMascotRaccoon =
  '<svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">' +
    '<ellipse cx="32" cy="42" rx="18" ry="16" fill="#d6d2cc"/>' +
    '<path d="M18 24 L10 10 L26 18 Z" fill="#8b8680"/><path d="M46 24 L54 10 L38 18 Z" fill="#8b8680"/>' +
    '<path d="M18 24 L13 14 L23 20 Z" fill="#2e2d2b"/><path d="M46 24 L51 14 L41 20 Z" fill="#2e2d2b"/>' +
    '<ellipse cx="32" cy="35" rx="13" ry="9" fill="#3a3937"/><circle cx="24" cy="38" r="3.2" fill="#1e1e1e"/><circle cx="40" cy="38" r="3.2" fill="#1e1e1e"/><circle cx="25" cy="37" r="1.1" fill="#fff"/><circle cx="41" cy="37" r="1.1" fill="#fff"/>' +
    '<ellipse cx="32" cy="44" rx="2.6" ry="2" fill="#1e1e1e"/>' +
    '<g class="uvd-raccoon-tail" style="transform-origin:16px 50px"><ellipse cx="16" cy="50" rx="8" ry="5" fill="#a8a5a0" transform="rotate(-18 16 50)"/><path d="M10 49 Q12 47 14 49 Q16 51 18 49" stroke="#3a3937" stroke-width="1" stroke-linecap="round" fill="none" opacity=".6"/></g>' +
    '<ellipse cx="22" cy="46" rx="3.2" ry="2" fill="#b8b4ae" opacity=".7"/><ellipse cx="42" cy="46" rx="3.2" ry="2" fill="#b8b4ae" opacity=".7"/>' +
  '</svg>';
var __uvdTabMascotHamster =
  '<svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">' +
    '<ellipse cx="32" cy="42" rx="20" ry="17" fill="#fde2a8"/><ellipse cx="32" cy="40" rx="18" ry="15" fill="#ffd38a"/>' +
    '<circle cx="17" cy="22" r="8" fill="#fcbf6a"/><circle cx="47" cy="22" r="8" fill="#fcbf6a"/><circle cx="17" cy="22" r="3.5" fill="#e89f6a"/><circle cx="47" cy="22" r="3.5" fill="#e89f6a"/>' +
    '<circle cx="24" cy="36" r="3.1" fill="#4a2c20"/><circle cx="40" cy="36" r="3.1" fill="#4a2c20"/><circle cx="25" cy="35" r="1" fill="#fff"/><circle cx="41" cy="35" r="1" fill="#fff"/>' +
    '<g class="uvd-hamster-cheek"><ellipse cx="18" cy="45" rx="7" ry="6" fill="#fff6c8"/><ellipse cx="46" cy="45" rx="7" ry="6" fill="#fff6c8"/></g>' +
    '<ellipse cx="32" cy="42" rx="2" ry="1.8" fill="#ff8fa3"/><path d="M28 47 Q32 49 36 47" stroke="#4a2c20" stroke-width="1.2" stroke-linecap="round" fill="none"/>' +
  '</svg>';
var __uvdTabMeta = {
  streams: { mascot: __uvdTabMascotPanda, bg: 'linear-gradient(150deg,#f8f6f8,#e9e2ee)', name: 'Streams', sub: 'gấu trúc tìm link 🎋' },
  clicked: { mascot: __uvdTabMascotRaccoon, bg: 'linear-gradient(150deg,#eceae6,#d6d2cc)', name: 'Nút đã click', sub: 'gấu mèo mò nút 🦝' },
  history: { mascot: __uvdTabMascotHamster, bg: 'linear-gradient(150deg,#fff4d6,#ffd38a)', name: 'Lịch sử', sub: 'hamster giữ hạt 🐹' }
};

// ========== BUILD UI ==========

function __uvdGetUrlResolution(url) {
  var match = String(url || '').match(/(?:^|[-_/,])((?:2160|1440|1080|720|480|360|240))p(?:\b|[-_.,])/i);
  if (match) return match[1] + 'p';
  var wh = String(url || '').match(/(?:^|[-_])([0-9]{3,4})x([0-9]{3,4})(?:\b|[-_.])/i);
  return wh ? wh[2] + 'p' : '';
}

function __uvdStreamRank(item) {
  var type = String(item.type || '').toUpperCase();
  if (type === 'IFRAME') return 0;
  if (type === 'M3U8') {
    if (item.qualityCount > 1 || item.isMaster || /master\.m3u8|urlset|playlist/i.test(item.url)) return 100 + (item.qualityCount || 0);
    return 85;
  }
  if (type === 'MP4' || type === 'WEBM') return 70;
  if (type === 'BLOB') return 60;
  return 30;
}

// Main UI is a control room, not a disposable popup backdrop. Preserve the
// selected tab and its scroll position when a live capture refresh rebuilds it.
var __uvdMainUiViewState = { tab: 'streams', scrollTop: 0 };
function buildUI() {
  var arr = [...urls.entries()].map(function(e) {
    return { url: e[0], type: e[1].type, source: e[1].source, priority: e[1].priority, timestamp: e[1].timestamp || 0, sequence: e[1].sequence || 0, qualityCount: e[1].qualityCount || 0, isMaster: !!e[1].isMaster, resolution: __uvdGetUrlResolution(e[0]), aiVerdict: e[1].aiVerdict || '', aiScore: e[1].aiScore == null ? null : e[1].aiScore, aiReasons: e[1].aiReasons || [] };
  }).sort(function(a, b) { return (__uvdStreamRank(b) - __uvdStreamRank(a)) || ((a.sequence || 0) - (b.sequence || 0)); });
  // If a master playlist exists, keep its card as the canonical entry and
  // hide the variant playlists from the main list. They remain available
  // through the quality picker inside the player.
  var masterEntries = arr.filter(function(item) { return item.type === 'M3U8' && /master\.m3u8/i.test(item.url); });
  if (masterEntries.length) {
    arr = arr.filter(function(item) { return item.type !== 'M3U8' || /master\.m3u8/i.test(item.url); });
  }

  var panel = document.getElementById('__uvd__');
  if (panel) {
    var oldTab = panel.querySelector('.uvd-tab.uvd-tab-active');
    var oldList = panel.querySelector('#__uvd_stream_list__');
    if (oldTab && oldTab.dataset.tab) __uvdMainUiViewState.tab = oldTab.dataset.tab;
    if (oldList) __uvdMainUiViewState.scrollTop = oldList.scrollTop || 0;
    panel.remove();
  }

  panel = document.createElement('div');
  panel.id = '__uvd__';
  panel.className = 'uvd-glass-panel uvd-app-shell uvd-main-clean';
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
      '<span class="uvd-brand-mark uvd-brand-mark-hero uvd-header-standing-mascot">' + __uvdHeaderStandingCat + '</span>' +
      '<div class="uvd-brand-text">' +
        '<div class="uvd-brand-name">Mèo cào media <span class="uvd-brand-heart">♡</span></div>' +
        '<div class="uvd-brand-version">v' + VERSION + ' ✦ cute player</div>' +
        '<div class="uvd-brand-sub">mèo cào media · d\u1EC5 th\u01B0\u01A1ng 🎀</div>' +
      '</div>' +
    '</div>' +
    '<div class="uvd-header-actions">' +
      '<button class="uvd-btn-icon" id="__uvd_autoplay__" title="Tự động bấm Play">▶</button>' +
      '<button class="uvd-btn-icon" id="__uvd_preload__" title="Bắt link trước/sau Play">◉</button>' +
      '<button class="uvd-btn-icon" id="__uvd_seq_autoplay__" title="Reload và quét lại nguồn video">↻</button>' +
      '<button class="uvd-btn-icon" id="__uvd_iframe_btn__" title="Mở popup iframe">▣</button>' +
      '<button class="uvd-btn-icon" id="__uvd_settings_btn__" title="Cài đặt">⚙</button>' +
      '<button class="uvd-btn-icon" id="__uvd_hide__" title="Thu gọn/mở rộng Mèo cào media">▾</button>' +
      '<button class="uvd-btn-icon uvd-close-action" id="__uvd_close__" title="Đóng">×</button>' +
    '</div>';
  content.appendChild(header);

  var info = document.createElement('div');
  info.style.cssText = 'flex-shrink:0;';
  var savedPlaySel = (data.siteProfiles[pageInfo.host] && data.siteProfiles[pageInfo.host].playSelector) || '';
  info.className = 'uvd-context-bar uvd-context-cute uvd-session-dock';
  info.id = '__uvd_session_dock__';
  info.innerHTML =
    '<div class="uvd-session-dock-head">' +
      '<div class="uvd-session-status"><span class="uvd-session-status-dot"></span><span id="__uvd_session_status__">ĐANG LẮNG NGHE</span><span class="uvd-session-host">' + escapeHtml(pageInfo.host || pageInfo.referer) + '</span></div>' +
      '<button id="__uvd_title__" class="uvd-context-title uvd-session-title">' + escapeHtml(pageInfo.title) + '</button>' +
    '</div>' +
    '<div class="uvd-session-dock-tools">' +
      '<button id="__uvd_referer__" class="uvd-meta-chip">↗ Trang nguồn</button>' +
      '<button id="__uvd_playsel__" class="uvd-meta-chip">◉ ' + escapeHtml(savedPlaySel || 'Play selector chưa đặt') + '</button>' +
    '</div>' +
    '<div id="__uvd_popup_reminder_slot__" class="uvd-popup-reminder-slot"></div>';
  content.appendChild(info);

  var tabbar = document.createElement('div');
  tabbar.className = 'uvd-tabbar';
  var indicator = document.createElement('div');
  indicator.className = 'uvd-tab-indicator';
  indicator.id = '__uvd_tab_indicator__';
  tabbar.appendChild(indicator);

  var clickedCountForHost = Object.keys(data.clickedButtons[pageInfo.host] || {}).length;
  var tabList = [
    { id: 'streams', text: 'Streams (' + arr.length + ')', meta: __uvdTabMeta.streams },
    { id: 'clicked', text: 'Nút đã click' + (clickedCountForHost ? ' (' + clickedCountForHost + ')' : ''), meta: __uvdTabMeta.clicked },
    { id: 'history', text: 'Lịch sử (' + (data.history || []).length + ')', meta: __uvdTabMeta.history }
  ];

  tabList.forEach(function(t) {
    var b = document.createElement('button');
    b.className = 'uvd-tab';
    b.dataset.tab = t.id;
    var masc = t.meta && t.meta.mascot ? t.meta.mascot : '';
    b.innerHTML = '<span class="uvd-tab-mascot">' + masc + '</span><span class="uvd-tab-text">' + escapeHtml(t.text) + '</span>';
    tabbar.appendChild(b);
  });
  content.appendChild(tabbar);

  // Filter bar tạm gỡ bỏ (đã có tính năng vote để lọc rác). Giữ biến để không vỡ.
  var streamFilter = 'ALL';
  var streamResolution = 'ALL';
  var streamOrder = 'captured';

  function moveIndicatorTo(btn) {
    if (!btn) return;
    var width = btn.offsetWidth;
    indicator.style.width = width + 'px';
    indicator.style.transform = 'translateX(' + btn.offsetLeft + 'px)';
    if (btn.scrollIntoView) btn.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
  }

  // Bong bóng comic: nội dung tab nằm trong bong bóng.
  var bubbleWrap = document.createElement('div');
  bubbleWrap.className = 'uvd-bubble-wrap';
  var contentWrapper = document.createElement('div');
  contentWrapper.className = 'uvd-scroll uvd-bubble';
  contentWrapper.style.cssText = 'flex:1;overflow:hidden;position:relative;min-height:0;display:flex;flex-direction:column;';

  var bubbleTitle = document.createElement('div');
  bubbleTitle.className = 'uvd-bubble-title';
  bubbleTitle.id = '__uvd_bubble_title__';
  contentWrapper.appendChild(bubbleTitle);

  var streamList = document.createElement('div');
  streamList.id = '__uvd_stream_list__';
  streamList.className = 'uvd-scroll';
  streamList.style.cssText = 'overflow-y:auto;overflow-x:hidden;flex:1;min-height:0;padding:12px;min-width:0;-webkit-overflow-scrolling:touch;scroll-behavior:smooth;overscroll-behavior:contain;';
  contentWrapper.appendChild(streamList);
  // Header stays fixed in the main panel. Stream rows are compact now, so
  // hiding/revealing it no longer buys useful space and only causes jank.
  content.classList.remove('uvd-scroll-hide-header');

  // Footer belongs to the selected tab body, not to a separate card under it.
  // This keeps the visual hierarchy to hero → session → one main content sheet.
  var footer = document.createElement('div');
  footer.className = 'uvd-profile-footer uvd-bubble-footer';
  footer.textContent = '© ' + new Date().getFullYear() + ' nguyenquocngu91 · Mèo cào media v' + VERSION + ' · Made for Chrome Android';
  contentWrapper.appendChild(footer);

  bubbleWrap.appendChild(contentWrapper);
  content.appendChild(bubbleWrap);

  __uvdAppendRoot(panel);
  __uvdIsolateLayer(panel);
  // Header mascot is intentionally allowed to break the outer panel frame.
  // Paint containment would clip it even when CSS overflow is visible.
  panel.style.contain = 'layout style';
  applyEffectsPref(panel);
  applyMotionPref(panel);
  if (__uvdScriptHidden) { panel.style.display = 'none'; __uvdShowRestoreBtn(); }
  else { __uvdRemoveRestoreBtn(); }
  // Nếu có popup đang mở, giữ panel ẩn để không đè lên popup (kể cả sau khi rebuild).
  if (__uvdPopupActive) panel.style.display = 'none';
  __uvdRenderPopupReminder();

  panel.querySelectorAll('.uvd-btn, .uvd-btn-icon, .uvd-tab').forEach(function(btn) {
    btn.addEventListener('click', addRipple);
  });

  var currentTab = __uvdMainUiViewState.tab || 'streams';
  function renderTab(tabId) {
    var tabChanged = currentTab !== tabId;
    currentTab = tabId;
    __uvdMainUiViewState.tab = tabId;
    if (tabChanged) __uvdMainUiViewState.scrollTop = 0;
    var activeBtn = null;
    document.querySelectorAll('[data-tab]').forEach(function(t) {
      if (t.dataset.tab === tabId) {
        t.classList.add('uvd-tab-active');
        moveIndicatorTo(t);
        activeBtn = t;
      } else {
        t.classList.remove('uvd-tab-active');
      }
    });
    // Cập nhật tiêu đề bong bóng (con vật + tên tab)
    var bubbleTitleEl = document.getElementById('__uvd_bubble_title__');
    var tabMeta = __uvdTabMeta[tabId] || __uvdTabMeta.streams;
    var cnt = tabId === 'streams' ? arr.length
      : (tabId === 'history' ? (data.history || []).length
        : Object.keys(data.clickedButtons[pageInfo.host] || {}).length);
    if (bubbleTitleEl) {
      bubbleTitleEl.innerHTML = '<div class="uvd-bubble-tmascot" style="background:' + tabMeta.bg + '">' + tabMeta.mascot + '</div>' +
        '<div class="uvd-bubble-ttext"><div class="uvd-bubble-tname">' + tabMeta.name + '</div><div class="uvd-bubble-tsub">' + cnt + ' ' + tabMeta.sub + '</div></div>';
    }

    streamList.style.display = 'block';
    streamList.innerHTML = '';

    if (tabId === 'streams') {
      var visibleStreams = arr.filter(function(item) {
        return (streamFilter === 'ALL' || String(item.type || '').toUpperCase() === streamFilter) &&
          (streamResolution === 'ALL' || item.resolution === streamResolution);
      });
      if (streamOrder === 'newest') visibleStreams.sort(function(a, b) { return b.timestamp - a.timestamp; });
      else if (streamOrder === 'oldest') visibleStreams.sort(function(a, b) { return a.timestamp - b.timestamp; });
      else visibleStreams.sort(function(a, b) { return (__uvdStreamRank(b) - __uvdStreamRank(a)) || ((a.sequence || 0) - (b.sequence || 0)); });
      renderStreams(streamList, visibleStreams);
    }
    else if (tabId === 'clicked') renderClickedButtons(streamList);
    else if (tabId === 'history') renderHistory(streamList);
  }

  document.querySelectorAll('[data-tab]').forEach(function(t) {
    t.onclick = function() { renderTab(this.dataset.tab); };
  });
  // Do not animate/hide the mascot-heavy Header while reading — that causes
  // Android jank. Hide only the Session Dock after a deliberate downward scroll
  // and restore it as soon as the user turns upward.
  var sessionScrollAnchor = 0;
  var sessionHidden = false;
  streamList.addEventListener('scroll', function() {
    var top = streamList.scrollTop || 0;
    __uvdMainUiViewState.scrollTop = top;
    if (top <= 12) {
      sessionHidden = false;
      sessionScrollAnchor = top;
      panel.classList.remove('uvd-session-hidden');
      return;
    }
    if (!sessionHidden && top > sessionScrollAnchor + 26) {
      sessionHidden = true;
      sessionScrollAnchor = top;
      panel.classList.add('uvd-session-hidden');
    } else if (sessionHidden && top < sessionScrollAnchor - 14) {
      sessionHidden = false;
      sessionScrollAnchor = top;
      panel.classList.remove('uvd-session-hidden');
    }
  }, { passive: true });

  renderTab(currentTab);
  requestAnimationFrame(function() {
    if (!panel.isConnected || currentTab !== __uvdMainUiViewState.tab) return;
    streamList.scrollTop = __uvdMainUiViewState.scrollTop || 0;
  });

  if (window.__uvdPanelResizeHandler) window.removeEventListener('resize', window.__uvdPanelResizeHandler);
  window.__uvdPanelResizeHandler = function() {
    moveIndicatorTo(panel.querySelector('.uvd-tab.uvd-tab-active'));
  };
  window.addEventListener('resize', window.__uvdPanelResizeHandler);

  function __uvdRealClose(){
    if (playerState.overlay) closePlayer();
    stopMonitor();
    if (window.__uvdPanelResizeHandler) {
      window.removeEventListener('resize', window.__uvdPanelResizeHandler);
      window.__uvdPanelResizeHandler = null;
    }
    var p = document.getElementById('__uvd__');
    if (p) p.remove();
    __uvdRemoveRestoreBtn();
    __uvdScriptHidden = false;
    runCleanup();
    urls.clear();
    if (typeof style !== 'undefined' && style.parentNode) style.remove();
  }
  document.getElementById('__uvd_close__').onclick = function() {
    __uvdShowFarewellPopup(function(){ __uvdRealClose(); });
  };
  document.getElementById('__uvd_hide__').onclick = function() {
    var isCollapsed = panel.classList.contains('uvd-panel-collapsed');
    __uvdSetHidden(!isCollapsed);
    this.textContent = isCollapsed ? '▾' : '▴';
    this.title = isCollapsed ? 'Thu gọn Mèo cào media' : 'Mở rộng Mèo cào media';
    toast(isCollapsed ? 'Đã mở rộng Mèo cào media' : 'Đã thu gọn Mèo cào media — bấm lại để mở');
  };
  document.getElementById('__uvd_autoplay__').onclick = function() {
    var n = autoClickPlayButtons(document, 0, false, true);
    toast(n > 0 ? 'Đã thử bấm Play (' + n + ' nút)' : 'Không tìm thấy nút Play, thử đặt selector riêng ở Cài đặt');
    setTimeout(function() { debouncedBuildUI(); }, 1200);
  };
  document.getElementById('__uvd_preload__').onclick = function() { runPreloadCapture(); };
  var seqBtn = document.getElementById('__uvd_seq_autoplay__');
  seqBtn.textContent = '↻';
  seqBtn.title = 'Reload và quét lại nguồn video';
  seqBtn.onclick = function() {
    __uvdRefreshCapture();
    // Gắn "gọi lại popup" vào nút reload: quét lại xong là popup hiện lên.
    setTimeout(function() {
      if (playerState.overlay) return;
      if (__uvdHasOnlyIframeOrDemo()) __uvdMaybeOfferIframeWorkflow(true);
      else __uvdMaybeOfferMediaPopup(true);
    }, 2600);
  };
  document.getElementById('__uvd_settings_btn__').onclick = openSettingsOverlay;

  var iframeBtn = document.getElementById('__uvd_iframe_btn__');
  if (iframeBtn) {
    // Tự hiện khi trang chỉ có iframe/demo (chưa có video thật), ẩn khi đã có video.
    iframeBtn.style.display = __uvdHasOnlyIframeOrDemo() ? '' : 'none';
    iframeBtn.onclick = function() {
      if (__uvdHasOnlyIframeOrDemo()) __uvdMaybeOfferIframeWorkflow(true);
      else toast('Đã có video thật rồi, không cần mở iframe nha 🐰');
    };
  }

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

// ========== STREAM METADATA ==========
function __uvdFormatDuration(sec) {
  if (!isFinite(sec) || sec < 0) return '';
  sec = Math.floor(sec);
  var h = Math.floor(sec / 3600);
  var m = Math.floor((sec % 3600) / 60);
  var s = sec % 60;
  if (h > 0) return h + ':' + (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
  return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
}
function __uvdResolutionLabel(width, height) {
  if (!width && !height) return '';
  if (height) return height + 'p';
  return width + 'px';
}
function __uvdSetCardMetadata(card, meta) {
  if (!card) return;
  var el = card.querySelector('[data-card-stream-meta]');
  if (!el) return;
  if (meta.quality) card.dataset.cardQuality = meta.quality;
  var parts = [];
  if (meta.quality || card.dataset.cardQuality) parts.push(meta.quality || card.dataset.cardQuality);
  if (meta.resolution) parts.push(meta.resolution);
  if (meta.duration) parts.push('⏱ ' + meta.duration);
  el.textContent = parts.length ? parts.join('  ·  ') : 'Đang phân tích media…';
  el.classList.toggle('uvd-card-meta-ready', parts.length > 0);
}
function __uvdSetCardStatus(card, text, statusClass) {
  if (!card) return;
  var el = card.querySelector('.uvd-card-status');
  if (!el) return;
  el.textContent = text;
  el.className = 'uvd-card-status ' + (statusClass || 'uvd-status-muted');
}
function __uvdUpdateCardFromMedia(card, media, extra) {
  extra = extra || {};
  var meta = { quality: extra.quality || card.dataset.cardQuality || '', resolution: '', duration: '' };
  if (media && media.videoWidth && media.videoHeight) {
    meta.resolution = media.videoWidth + '×' + media.videoHeight + ' (' + __uvdResolutionLabel(media.videoWidth, media.videoHeight) + ')';
  } else if (extra.resolution) {
    meta.resolution = extra.resolution;
  }
  if (media && isFinite(media.duration) && media.duration > 0) {
    meta.duration = __uvdFormatDuration(media.duration);
    if (card.dataset.url && urls.has(card.dataset.url)) urls.get(card.dataset.url).demo = media.duration <= __uvdDemoPreviewMaxSeconds;
  } else if (extra.duration) {
    meta.duration = extra.duration;
  }
  __uvdSetCardMetadata(card, meta);
}
function __uvdDescribeHlsLevels(card, levels, media) {
  levels = (levels || []).filter(Boolean);
  var labels = levels.map(function(level) {
    return __uvdResolutionLabel(level.width, level.height) || (level.bitrate ? Math.round(level.bitrate / 1000) + 'kbps' : 'auto');
  }).filter(function(label, index, list) { return list.indexOf(label) === index; });
  labels.sort(function(a, b) { return (parseInt(b, 10) || 0) - (parseInt(a, 10) || 0); });
  var quality = labels.length > 1 ? 'Đa chất lượng · ' + labels.length + ' mức (' + labels.slice(0, 6).join(' · ') + (labels.length > 6 ? ' …' : '') + ')' : (labels[0] || 'M3U8');
  if (card && card.dataset.url && urls.has(card.dataset.url)) {
    var streamItem = urls.get(card.dataset.url);
    streamItem.qualityCount = labels.length;
    streamItem.isMaster = labels.length > 1;
    streamItem.qualityOnly = false;
    streamItem.qualityLabel = labels.length > 1 ? 'ĐA CHẤT LƯỢNG' : '';
  }
  __uvdPauseAutomaticScanningIfReady();
  if (card && card.dataset.url) __uvdQueueAiMediaAnalysis(card.dataset.url);
  var top = levels.slice().sort(function(a, b) { return (b.height || 0) - (a.height || 0); })[0] || {};
  if (card && card.dataset.url && urls.has(card.dataset.url)) {
    var sizedItem = urls.get(card.dataset.url);
    sizedItem.bandwidth = top.bitrate || sizedItem.bandwidth || 0;
    if (sizedItem.bandwidth && media && isFinite(media.duration) && media.duration > 0) sizedItem.estimatedBytes = Math.round((sizedItem.bandwidth / 8) * media.duration);
  }
  __uvdUpdateCardFromMedia(card, media, {    quality: quality,
    resolution: top.width && top.height ? (top.width + '×' + top.height + ' (' + __uvdResolutionLabel(top.width, top.height) + ')') : ''
  });
  var learnedJunk = card && card.dataset.url && __uvdIsLearnedJunkVideo(card.dataset.url);
  var aiJunk = card && card.dataset.url && __uvdIsAiJunkVideo(card.dataset.url);
  __uvdSetCardStatus(card, learnedJunk ? 'RÁC ĐÃ HỌC' : (aiJunk ? 'AI NGHI RÁC' : (labels.length > 1 ? 'MASTER · ' + labels.length + ' QUALITY' : 'PREVIEW…')), (learnedJunk || aiJunk) ? 'uvd-status-muted' : (labels.length > 1 ? 'uvd-status-ok' : 'uvd-status-loading'));
}

// ========== RENDER STREAMS ==========
var UVD_LAZY_BATCH = 20;

function __uvdTypeEmoji(type) {
  var t = String(type || '').toUpperCase();
  if (t === 'M3U8' || t === 'MPD') return '📺';   // TV: cute, ít phần đen
  if (t === 'MP4' || t === 'WEBM') return '📼';
  if (t === 'IFRAME') return '🖼️';
  if (t === 'BLOB') return '🌀';
  if (t === 'TS') return '📦';
  return '📎';
}
function __uvdVoteChips(url) {
  var v = __uvdVote(url);
  var host = __uvdVoteDomainKey(url);
  return '<span class="uvd-votechip uvd-votechip-up" data-vote-up="' + encodeURIComponent(host) + '">♥ ' + (v.up || 0) + '</span>' +
         '<span class="uvd-votechip uvd-votechip-down" data-vote-down="' + encodeURIComponent(host) + '">💩 ' + (v.down || 0) + '</span>';
}
var __uvdRenderVotes = true;
function buildStreamCardHTML(item, i) {
  var type = String(item.type || '').toUpperCase();
  var emoji = __uvdTypeEmoji(type);
  var voteChips = __uvdVoteChips(item.url);
  if (type === 'IFRAME') {
    var verdictBadge = item.aiVerdict === 'PLAYER'
      ? '<span class="uvd-ai-badge uvd-ai-player">player thật ✨</span>'
      : (item.aiVerdict === 'JUNK'
        ? '<span class="uvd-ai-badge uvd-ai-junk">rác 💩</span>'
        : '<span class="uvd-ai-badge uvd-ai-unknown">chưa rõ ❔</span>');
    var isJunk = item.aiVerdict === 'JUNK';
    var iframeGuide = isJunk
      ? '🚫 Link này bị đánh dấu là rác — đừng bấm nha, vote 💩 để chặn dần nè.'
      : (item.aiVerdict === 'PLAYER'
        ? 'Player thật đó nè ✨ — bấm "↗ mở" rồi chạy lại UMP để lấy link thật nha.'
        : 'Chưa rõ lắm — mở thử ở tab mới rồi chạy lại UMP lấy link thật nha 🥺');
    var iframeActions = isJunk
      ? '<span class="uvd-junk-advice">🚫 Không nên mở — đây là rác</span>'
      : '<a class="uvd-btn uvd-btn-sm uvd-iframe-window-link" href="' + escapeHtml(item.url) + '" target="_blank" rel="noopener noreferrer" title="Mở iframe">↗ mở</a>' +
        '<button class="uvd-btn uvd-btn-sm" data-action="iframe-copy" data-url="' + encodeURIComponent(item.url) + '">copy UMP</button>';
    return '<div class="uvd-card uvd-iframe-card uvd-cute" data-type="IFRAME" data-url="' + escapeHtml(item.url) + '">' +
      '<div class="uvd-iframe-card-head"><div><span class="uvd-type-badge">iframe</span>' + verdictBadge + '<strong>chưa phải video trực tiếp</strong></div><button class="uvd-block-btn" data-url="' + encodeURIComponent(item.url) + '" title="Chặn iframe này">⛔</button></div>' +
      '<div class="uvd-card-guide">' + iframeGuide + '</div>' +
      '<div class="uvd-card-url-label">IFRAME URL</div><div class="uvd-url-box" title="Bấm để sao chép URL">' + escapeHtml(item.url) + '</div>' +
      (__uvdRenderVotes ? '<div class="uvd-cute-votes">' + voteChips + '</div>' : '') +
      '<div class="uvd-cute-actions">' + iframeActions +
        '<button class="uvd-btn uvd-btn-sm" data-action="copy" data-url="' + encodeURIComponent(item.url) + '">sao chép</button>' +
      '</div>' +
      '</div>';
  }
  var learnedVideoVerdict = __uvdLearnedVideoVerdict(item.url);
  var aiMediaItem = urls.get(item.url) || item;
  var isLearnedVideoJunk = learnedVideoVerdict === 'JUNK';
  var isAiMediaJunk = !isLearnedVideoJunk && __uvdIsAiJunkVideo(item.url);
  var isRejectedVideo = isLearnedVideoJunk || isAiMediaJunk;
  var actionsHtml;
  if (isRejectedVideo) {
    actionsHtml = '<span class="uvd-junk-advice">🚫 Domain này đã bị học là rác — không nên xem</span>' +
      '<button class="uvd-btn uvd-btn-sm" data-action="copy" data-url="' + encodeURIComponent(item.url) + '">sao chép</button>';
  } else if (type === 'BLOB') {
    actionsHtml =
      '<button class="uvd-btn uvd-btn-sm" data-action="play" data-url="' + encodeURIComponent(item.url) + '" data-type="' + escapeHtml(item.type) + '">▶ xem</button>' +
      '<button class="uvd-btn uvd-btn-sm" data-action="blobdl" data-url="' + encodeURIComponent(item.url) + '">⬇ tải blob</button>' +
      '<div style="grid-column:1/3;font-size:11px;color:var(--text3);line-height:1.4;">blob chỉ tải được nếu là file gốc (không áp dụng cho stream HLS/DASH qua MediaSource).</div>';
  } else if (type === 'M3U8') {
    actionsHtml =
      '<button class="uvd-btn uvd-btn-sm" data-action="play" data-url="' + encodeURIComponent(item.url) + '" data-type="' + escapeHtml(item.type) + '">▶ xem</button>' +
      '<button class="uvd-btn uvd-btn-sm" data-action="quality" data-url="' + encodeURIComponent(item.url) + '">🎚 chất lượng</button>' +
      '<button class="uvd-btn uvd-btn-sm" data-action="cmd" data-url="' + encodeURIComponent(item.url) + '" data-type="' + escapeHtml(item.type) + '">⬇ lệnh tải</button>' +
      '<button class="uvd-btn uvd-btn-sm" data-action="copy" data-url="' + encodeURIComponent(item.url) + '">sao chép</button>';
  } else {
    actionsHtml =
      '<button class="uvd-btn uvd-btn-sm" data-action="play" data-url="' + encodeURIComponent(item.url) + '" data-type="' + escapeHtml(item.type) + '">▶ xem</button>' +
      '<button class="uvd-btn uvd-btn-sm" data-action="cmd" data-url="' + encodeURIComponent(item.url) + '" data-type="' + escapeHtml(item.type) + '">⬇ lệnh tải</button>' +
      '<button class="uvd-btn uvd-btn-sm" data-action="copy" data-url="' + encodeURIComponent(item.url) + '">sao chép</button>';
  }
  var actionMenuHtml = '<details class="uvd-action-menu uvd-thumb-menu"><summary title="Thao tác" aria-label="Thao tác">⋮</summary><div class="uvd-action-list">' + actionsHtml + '</div></details>';
  var metaLabel = item.resolution ? (' · ' + item.resolution) : '';
  var statusText = isRejectedVideo ? (isAiMediaJunk ? 'AI NGHI RÁC' : 'RÁC ĐÃ HỌC') : ((type === 'MP4' || type === 'M3U8') ? 'đang xem preview…' : 'chưa có preview');
  var statusClass = isRejectedVideo ? 'uvd-status-muted' : ((type === 'MP4' || type === 'M3U8') ? 'uvd-status-loading' : 'uvd-status-muted');
  var guideText;
  if (isLearnedVideoJunk) guideText = '🚫 Domain này đã nhận 2+ vote 💩. Mèo sẽ không gọi đây là link thật và sẽ tự bỏ qua ở lần quét sau.';
  else if (isAiMediaJunk) guideText = '🤖 Gemini thấy metadata giống quảng cáo/rác' + (aiMediaItem.aiMediaReason ? ': ' + escapeHtml(aiMediaItem.aiMediaReason) : '') + '. Mèo tạm ẩn khỏi kết quả tự động.';
  else if (type === 'M3U8') guideText = 'Playlist HLS nè 📺 — bấm Xem để chọn chất lượng nha.';
  else if (type === 'MP4' || type === 'WEBM') guideText = 'Link video thật nè 📼 — bấm Xem để phát ngay nha.';
  else if (type === 'BLOB') guideText = 'Blob MediaSource nè 🌀 — bấm Xem để phát trực tiếp.';
  else guideText = 'Link media nè — bấm Xem để phát thử nha.';
  var previewAction = isRejectedVideo
    ? '<span class="uvd-thumb-play uvd-thumb-play-blocked" title="Đã lọc là link rác">🚫</span>'
    : '<button class="uvd-btn uvd-thumb-play" data-action="play" data-url="' + encodeURIComponent(item.url) + '" data-type="' + escapeHtml(item.type) + '" title="Xem video">▶</button>';
  return (
    '<div class="uvd-card uvd-cute' + (isRejectedVideo ? ' uvd-card-learned-junk' : '') + '" data-type="' + escapeHtml(item.type) + '" data-url="' + escapeHtml(item.url) + '">' +
      '<div class="uvd-card-preview" data-thumb-url="' + escapeHtml(item.url) + '">' +
        '<div class="uvd-thumb-image"></div>' +
        '<div class="uvd-thumb-sheen"></div>' +
        '<span class="uvd-thumb-type">' + escapeHtml(item.type) + '</span>' +
        previewAction +
        actionMenuHtml +
      '</div>' +
      '<div class="uvd-card-head">' +
        '<div class="uvd-card-badges"><span class="uvd-type-badge">' + emoji + ' #' + (i+1) + '</span><span class="uvd-card-status ' + statusClass + '">' + statusText + '</span></div>' +
        '<button class="uvd-block-btn" data-url="' + encodeURIComponent(item.url) + '" title="Chặn link này">⛔</button>' +
      '</div>' +
      '<div class="uvd-card-guide">' + guideText + '</div>' +
      '<div class="uvd-card-stream-meta" data-card-stream-meta>' + escapeHtml(item.type) + metaLabel + '</div>' +
      (__uvdRenderVotes ? '<div class="uvd-cute-votes">' + voteChips + '</div>' : '') +
      '<div class="uvd-card-url-label">DIRECT MEDIA URL</div>' +
      '<div class="uvd-url-box" title="Bấm để sao chép URL">' + escapeHtml(item.url) + '</div>' +
    '</div>'
  );
}

function __uvdSceneTimes(duration, count) {
  count = count || 8;
  duration = Number(duration || 0);
  if (!isFinite(duration) || duration <= 1) return [];
  // Eight genuinely distributed interior points. Do not use a nearby fallback
  // frame: every thumbnail must represent its own point in the whole movie.
  var times = [];
  for (var i = 1; i <= count; i++) {
    var time = duration * i / (count + 1);
    times.push(Math.max(.25, Math.min(duration - .5, time)));
  }
  return times.filter(function(time, index, list) { return isFinite(time) && time > 0 && list.indexOf(time) === index; });
}
function __uvdSceneTimeLabel(seconds) {
  seconds = Math.max(0, Math.floor(Number(seconds) || 0));
  if (seconds < 60) return seconds + 's';
  var hours = Math.floor(seconds / 3600);
  var minutes = Math.floor((seconds % 3600) / 60);
  var secs = seconds % 60;
  if (hours) return hours + ':' + String(minutes).padStart(2, '0') + ':' + String(secs).padStart(2, '0');
  return minutes + ':' + String(secs).padStart(2, '0');
}
function __uvdSceneKey(time) { return String(Math.round(Number(time || 0) * 10)); }
function __uvdCacheStreamMainFrame(url, dataUrl) {
  var item = urls.get(url);
  if (item && dataUrl) item.previewThumbnail = dataUrl;
}
function __uvdCacheStreamScene(url, time, dataUrl) {
  var item = urls.get(url);
  if (!item || !dataUrl) return;
  item.sceneThumbnails = Array.isArray(item.sceneThumbnails) ? item.sceneThumbnails : [];
  var key = __uvdSceneKey(time);
  if (!item.sceneThumbnails.some(function(scene) { return __uvdSceneKey(scene.time) === key; })) {
    item.sceneThumbnails.push({ time: Number(time), image: dataUrl });
    item.sceneThumbnails.sort(function(a, b) { return a.time - b.time; });
    if (item.sceneThumbnails.length > 8) item.sceneThumbnails = item.sceneThumbnails.slice(0, 8);
  }
}
function __uvdCanvasFrame(media, width, height, quality) {
  try {
    var canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    canvas.getContext('2d').drawImage(media, 0, 0, width, height);
    return canvas.toDataURL('image/jpeg', quality || .68);
  } catch(e) { return ''; }
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
  var times = __uvdSceneTimes(media.duration, 8);
  var strip = document.createElement('div');
  strip.className = 'uvd-thumb-strip';
  strip.innerHTML = '<span class="uvd-thumb-strip-label">CẢNH KHÁC</span>';
  card.insertBefore(strip, card.querySelector('.uvd-card-head'));
  var canvas = document.createElement('canvas');
  canvas.width = 320; canvas.height = 180;
  var index = 0;
  function captureAt(time, done) {
    var finished = false;
    var timer = null;
    function finish(image) {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      media.removeEventListener('seeked', onSeeked);
      done(image || '');
    }
    function drawFrame() {
      try {
        var ctx = canvas.getContext('2d');
        ctx.drawImage(media, 0, 0, canvas.width, canvas.height);
        finish(canvas.toDataURL('image/jpeg', .72));
      } catch(e) { finish(''); }
    }
    function onSeeked() {
      // Decoded pixels often arrive one paint after seeked. Wait briefly, but
      // never substitute the previous frame if this seek cannot decode.
      setTimeout(drawFrame, 140);
    }
    media.addEventListener('seeked', onSeeked, { once: true });
    try {
      var alreadyThere = Math.abs(Number(media.currentTime || 0) - time) < .08;
      media.currentTime = time;
      if (alreadyThere) setTimeout(onSeeked, 40);
    } catch(e) { finish(''); return; }
    timer = setTimeout(function() { finish(''); }, 4800);
  }
  function next() {
    if (index >= times.length) {
      preview.dataset.extraThumbs = 'ready';
      return;
    }
    var time = times[index++];
    captureAt(time, function(sceneImage) {
      if (sceneImage) {
        var item = document.createElement('button');
        item.className = 'uvd-extra-thumb';
        item.type = 'button';
        item.title = 'Xem từ ' + __uvdSceneTimeLabel(time);
        item.innerHTML = '<img alt=""><span>' + __uvdSceneTimeLabel(time) + '</span>';
        item.querySelector('img').src = sceneImage;
        if (card.dataset.url) __uvdCacheStreamScene(card.dataset.url, time, sceneImage);
        item.onclick = function() {
          try { media.currentTime = time; } catch(e) {}
          if (card.dataset.url) __uvdShowPlayIntro(card.dataset.url, card.dataset.type || 'MP4');
        };
        strip.appendChild(item);
      }
      next();
    });
  }
  next();
}

function __uvdShouldSkipThumbnail(url) {
  if (/preview|trailer|sample|teaser|demo/i.test(url || '')) return true;
  try {
    return [...document.querySelectorAll('video')].some(function(video) {
      if (__uvdIsOwnUI(video)) return false;
      var same = video.currentSrc === url || video.src === url;
      return same && __uvdIsDemoVideoElement(video);
    });
  } catch(e) { return false; }
}
function hydrateVideoThumbnails(root) {
  if (!root) return;
  root.querySelectorAll('.uvd-card-preview[data-thumb-url]').forEach(function(preview) {
    if (preview.dataset.thumbState) return;
    var card = preview.closest('.uvd-card');
    var isVerificationStage = !!preview.closest('.uvd-verification-stage');
    var type = card ? (card.dataset.type || '').toUpperCase() : '';
    if (type !== 'MP4' && type !== 'M3U8' && type !== 'VIDEO' && type !== 'BLOB') {
      preview.dataset.thumbState = 'unsupported';
      return;
    }
    if (type === 'M3U8') {
      var existingHlsThumb = root.querySelector('.uvd-card-preview[data-uvd-hls-owner="1"]');
      if (existingHlsThumb && existingHlsThumb !== preview) {
        preview.dataset.thumbState = 'quality-only';
        var qualityOnlyItem = card && card.dataset.url && urls.get(card.dataset.url);
        if (qualityOnlyItem) { qualityOnlyItem.qualityOnly = true; qualityOnlyItem.qualityLabel = 'QUALITY ONLY'; }
        var qualityOnlyStatus = card && card.querySelector('.uvd-card-status');
        if (qualityOnlyStatus) { qualityOnlyStatus.textContent = 'QUALITY ONLY'; qualityOnlyStatus.className = 'uvd-card-status uvd-status-muted'; }
        return;
      }
      preview.dataset.uvdHlsOwner = '1';
    }
    var earlyThumbUrl = preview.getAttribute('data-thumb-url') || '';
    if (__uvdShouldSkipThumbnail(earlyThumbUrl)) {
      preview.dataset.thumbState = 'demo';
      var demoCardStatus = card && card.querySelector('.uvd-card-status');
      if (demoCardStatus) { demoCardStatus.textContent = 'DEMO · NO PREVIEW'; demoCardStatus.className = 'uvd-card-status uvd-status-muted'; }
      return;
    }
    preview.dataset.thumbState = 'loading';
    var image = preview.querySelector('.uvd-thumb-image');
    var thumbUrl = preview.getAttribute('data-thumb-url');
    var reusedBlobThumb = type === 'BLOB' ? findSourceVideoElement(thumbUrl) : null;
    var media = reusedBlobThumb || document.createElement('video');
    if (!reusedBlobThumb) {
      media.className = 'uvd-thumb-video';
      media.muted = true;
      media.defaultMuted = true;
      media.playsInline = true;
      media.preload = 'metadata';
      // Do not force anonymous CORS during Digging verification. Some hosts
      // provide duration/dimensions to a normal video element but reject canvas
      // access; metadata is enough for the 10-minute fast path below.
      media.setAttribute('aria-hidden', 'true');
    } else {
      media.classList.add('uvd-thumb-video');
      media.muted = true;
    }
    preview.__thumbVideo = media;
    if (reusedBlobThumb) {
      preview.dataset.thumbState = 'ready';
      preview.classList.add('uvd-thumb-real-preview');
      if (card) card.classList.add('uvd-card-has-real-preview');
      __uvdUpdateCardFromMedia(card, media);
      __uvdSetCardStatus(card, 'BLOB READY', 'uvd-status-ok');
      return;
    }
    var thumbProxyUrl = type === 'M3U8' ? (buildHeaderProxyUrl(thumbUrl, 'M3U8') || '') : '';
    // Prefer the same direct URL that the player can use. If the source has
    // CORS/PNG-wrapper problems, retry this thumbnail through Render.
    var thumbSources = type === 'M3U8' ? [thumbUrl].concat(thumbProxyUrl && thumbProxyUrl !== thumbUrl ? [thumbProxyUrl] : []) : [thumbUrl];
    var thumbHls = null;
    preview.__thumbVideo = media;
    function showFrame() {
      if (preview.dataset.thumbState === 'demo') return;
      preview.dataset.thumbState = 'ready';
      preview.classList.add('uvd-thumb-real-preview');
      if (card) card.classList.add('uvd-card-has-real-preview');
      __uvdUpdateCardFromMedia(card, media);
      var cardItem = card && card.dataset.url && urls.get(card.dataset.url);
      if (cardItem) {
        cardItem.hasThumbnail = true;
        var mainFrame = __uvdCanvasFrame(media, 320, 180, .64);
        if (mainFrame) __uvdCacheStreamMainFrame(card.dataset.url, mainFrame);
        cardItem.videoWidth = media.videoWidth || cardItem.videoWidth || 0;
        cardItem.videoHeight = media.videoHeight || cardItem.videoHeight || 0;
        if (media.videoWidth && media.videoHeight) cardItem.resolution = media.videoWidth + '×' + media.videoHeight;
        if (isFinite(media.duration) && media.duration > 0) cardItem.durationSeconds = media.duration;
      }
      __uvdPauseAutomaticScanningIfReady();
      if (card && card.dataset.url) __uvdQueueAiMediaAnalysis(card.dataset.url);
      var verifiedUrl = preview.getAttribute('data-thumb-url');
      if (isVerificationStage) __uvdPromoteVerifiedMedia(verifiedUrl, media);
      __uvdSaveHistoryMetadata(verifiedUrl, media, card);
      var status = card && card.querySelector('.uvd-card-status');
      var learnedJunk = card && card.dataset.url && __uvdIsLearnedJunkVideo(card.dataset.url);
      var aiJunk = card && card.dataset.url && __uvdIsAiJunkVideo(card.dataset.url);
      if (status) { status.textContent = learnedJunk ? 'RÁC ĐÃ HỌC' : (aiJunk ? 'AI NGHI RÁC' : 'PREVIEW OK'); status.className = 'uvd-card-status ' + ((learnedJunk || aiJunk) ? 'uvd-status-muted' : 'uvd-status-ok'); }
      if (media.videoWidth && media.videoHeight) {
        preview.classList.toggle('uvd-thumb-portrait', media.videoHeight > media.videoWidth);
        preview.classList.toggle('uvd-thumb-landscape', media.videoWidth >= media.videoHeight);
      }
      if (image) image.classList.add('uvd-thumb-ready');
      try { media.pause(); } catch(e) {}
    }
    media.addEventListener('loadedmetadata', function() {
      __uvdUpdateCardFromMedia(card, media);
      // Popup Đào should never wait for a canvas thumbnail when the source has
      // already proven itself as a long-form video through decoded metadata.
      if (isVerificationStage && __uvdPromoteDiggingMetadata(thumbUrl, media)) return;
      if (isFinite(media.duration) && media.duration > 0 && media.duration <= __uvdDemoPreviewMaxSeconds) {
        preview.dataset.thumbState = 'demo';
        __uvdSetCardStatus(card, 'DEMO · NO PREVIEW', 'uvd-status-muted');
        __uvdSetCardMetadata(card, { quality: 'Clip preview', duration: __uvdFormatDuration(media.duration) });
        try { if (thumbHls) thumbHls.destroy(); media.pause(); } catch(e) {}
        return;
      }
      try {
        if (isFinite(media.duration) && media.duration > 1) {
          // Thumbnail nhanh: không seek tới 20% của phim dài vì HLS sẽ phải
          // tải quá nhiều segment trước khi có frame. Một frame khoảng giây 12
          // đủ bỏ qua intro mà vẫn giữ preview nhẹ.
          var thumbTime = Math.min(12, Math.max(0, media.duration - .5));
          media.currentTime = thumbTime;
        }
      } catch(e) {}
    });
    media.addEventListener('loadeddata', showFrame, { once: true });
    media.addEventListener('seeked', showFrame, { once: true });
    media.addEventListener('error', function() {
      // hls.js may emit a media error while the thumbnail is being retried
      // with the alternate direct/proxy source. Do not remove the element yet.
      if (preview.__uvdThumbRetrying) return;
      preview.dataset.thumbState = 'unavailable';
      var errorStatus = card && card.querySelector('.uvd-card-status');
      if (errorStatus) { errorStatus.textContent = 'NO PREVIEW'; errorStatus.className = 'uvd-card-status uvd-status-muted'; }
      if (image) image.classList.add('uvd-thumb-fallback');
    });
    if (image) image.appendChild(media);
    var pressTimer = null;
    preview.addEventListener('touchstart', function() {
      pressTimer = setTimeout(function() {
        if (preview.__uvdStartThumb) preview.__uvdStartThumb();
        loadExtraVideoThumbnails(preview);
      }, 520);
    }, { passive: true });
    preview.addEventListener('touchend', function() { if (pressTimer) clearTimeout(pressTimer); }, { passive: true });
    preview.addEventListener('touchcancel', function() { if (pressTimer) clearTimeout(pressTimer); }, { passive: true });
    function markThumbUnavailable() {
      preview.dataset.thumbState = 'unavailable';
      var hlsStatus = card && card.querySelector('.uvd-card-status');
      if (hlsStatus) { hlsStatus.textContent = 'NO PREVIEW'; hlsStatus.className = 'uvd-card-status uvd-status-muted'; }
      if (image) image.classList.add('uvd-thumb-fallback');
    }
    var thumbStarted = false;
    var thumbAttempt = 0;
    function startThumbHls(HlsCtor) {
      if (!preview.isConnected || preview.dataset.thumbState !== 'loading') return;
      var sourceUrl = thumbSources[thumbAttempt];
      if (!sourceUrl) { markThumbUnavailable(); return; }
      try {
        if (thumbHls) thumbHls.destroy();
        thumbHls = new HlsCtor(__uvdMakeHlsConfig(HlsCtor, { maxBufferLength: 2, maxMaxBufferLength: 4 }));
        preview.__uvdThumbHls = thumbHls;
        thumbHls.loadSource(sourceUrl);
        thumbHls.attachMedia(media);
        thumbHls.on(HlsCtor.Events.MANIFEST_PARSED, function() {
          __uvdDescribeHlsLevels(card, thumbHls.levels, media);
        });
        thumbHls.on(HlsCtor.Events.LEVEL_SWITCHED, function() {
          __uvdDescribeHlsLevels(card, thumbHls.levels, media);
        });
        thumbHls.on(HlsCtor.Events.ERROR, function(_, data) {
          if (!data || !data.fatal) return;
          if (thumbAttempt + 1 < thumbSources.length) {
            // Direct HLS may work in the player while the Render relay is
            // required only for PNG-wrapped/CORS-restricted thumbnails.
            thumbAttempt++;
            preview.__uvdThumbRetrying = true;
            try { thumbHls.destroy(); } catch(e) {}
            try { media.pause(); media.removeAttribute('src'); media.load(); } catch(e) {}
            setTimeout(function() {
              preview.__uvdThumbRetrying = false;
              startThumbHls(HlsCtor);
            }, 120);
          } else {
            markThumbUnavailable();
          }
        });
      } catch(e) {
        if (thumbAttempt + 1 < thumbSources.length) {
          thumbAttempt++;
          setTimeout(function() { startThumbHls(HlsCtor); }, 120);
        } else {
          markThumbUnavailable();
        }
      }
    }
    function startThumbSource() {
      if (thumbStarted || !preview.isConnected) return;
      thumbStarted = true;
      if (type === 'M3U8') {
        __uvdEnsureHls(function(HlsCtor) {
          if (!HlsCtor.isSupported()) { markThumbUnavailable(); return; }
          startThumbHls(HlsCtor);
        }, markThumbUnavailable);
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
    }
    preview.__uvdStartThumb = startThumbSource;
    if (window.IntersectionObserver) {
      var thumbRoot = preview.closest('#__uvd_stream_list__, .uvd-workflow-list');
      var thumbObserver = new IntersectionObserver(function(entries) {
        if (entries[0] && entries[0].isIntersecting) {
          thumbObserver.disconnect();
          startThumbSource();
        }
      }, { root: thumbRoot || null, rootMargin: '240px' });
      preview.__thumbObserver = thumbObserver;
      thumbObserver.observe(preview);
    } else {
      startThumbSource();
    }
  });
}

function renderStreams(container, arr) {
  if (!arr.length) {
    container.innerHTML = '<div class="uvd-empty-state"><strong>Chưa thấy nguồn video</strong><span>Bấm Preload rồi bấm Play thật trên trang. Nếu trang chỉ có iframe, UMP sẽ gợi ý mở iframe.</span><button class="uvd-btn uvd-btn-sm" id="__uvd_empty_preload__">⏺ Bắt link realtime</button></div>';
    var emptyPreload = container.querySelector('#__uvd_empty_preload__');
    if (emptyPreload) emptyPreload.onclick = function() { runPreloadCapture(); };
    return;
  }

  var listWrap = document.createElement('div');
  container.appendChild(listWrap);
  var rendered = 0;
  var moreBtn = null;
  var endNote = null;
  function showEndNote() {
    if (endNote) endNote.remove();
    endNote = document.createElement('div');
    endNote.className = 'uvd-stream-end';
    var animal = typeof __uvdTabMascotHamster !== 'undefined' ? __uvdTabMascotHamster : '🐹';
    endNote.innerHTML = '<span class="uvd-stream-end-animal">' + animal + '</span><div><strong>Hết nội dung rồi nè ♡</strong><span>Mèo đã gom hết link trong phiên này cho cưng rồi.</span></div>';
    container.appendChild(endNote);
  }

  function renderNextBatch() {
    var end = Math.min(rendered + UVD_LAZY_BATCH, arr.length);
    var html = '';
    for (var i = rendered; i < end; i++) html += buildStreamCardHTML(arr[i], i);
    var frag = document.createElement('div');
    frag.innerHTML = html;
    while (frag.firstChild) listWrap.appendChild(frag.firstChild);
    if (rendered === 0) {
      var firstCard = listWrap.querySelector('.uvd-card');
      if (firstCard) firstCard.classList.add('uvd-stream-first');
    }
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
    } else {
      showEndNote();
    }
  }
  renderNextBatch();

  container.onclick = function(e) {
    if (!e.target.closest('.uvd-action-menu')) container.querySelectorAll('.uvd-action-menu[open]').forEach(function(menu) { menu.open = false; });
    // Cute vote chips (♥ / 💩) on stream cards.
    var voteUp = e.target.closest('[data-vote-up]');
    if (voteUp) {
      var vUrl = decodeURIComponent(voteUp.getAttribute('data-vote-up'));
      __uvdCastVote(vUrl, 'up');
      toast('Cảm ơn cưng! Đã yêu thích domain ' + vUrl + ' ♥');
      debouncedBuildUI();
      return;
    }
    var voteDown = e.target.closest('[data-vote-down]');
    if (voteDown) {
      var vdUrl = decodeURIComponent(voteDown.getAttribute('data-vote-down'));
      __uvdCastVote(vdUrl, 'down');
      toast('Cảm ơn cưng! Đã đánh dấu rác domain ' + vdUrl + ' 💩');
      debouncedBuildUI();
      return;
    }
    var urlBox = e.target.closest('.uvd-url-box');
    if (urlBox) {
      copy(urlBox.textContent || '');
      toast('Đã sao chép URL!');
      return;
    }
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
          __uvdShowPlayIntro(u2, t || 'MP4');
        }, 260);
      }
      else if (action === 'cmd') showCommandPicker(u2, t);
      else if (action === 'iframe-copy') {
        copy(BOOKMARKLET_NAME);
        toast('Đã copy tên bookmarklet: ' + BOOKMARKLET_NAME + ' — nhấn giữ link để chọn Open in new window');
      }
      else if (action === 'iframe-window') {
        var opened = __uvdOpenIframeWindow(u2);
        if (opened) toast('Đã mở cửa sổ iframe');
        else toast('Chrome đã chặn cửa sổ mới — nhấn giữ link iframe để dùng menu native');
      }
      else if (action === 'iframe') { copy(BOOKMARKLET_NAME); window.__uvdSafeOpen(u2); toast('Đã mở iframe tab và copy: ' + BOOKMARKLET_NAME); }
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
    card.innerHTML = '<div style="font-weight:600;color:var(--accent-text);">' + escapeHtml(opt.label) + '</div><div class="uvd-url-box">' + escapeHtml(opt.value) + '</div>';
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
    '<textarea style="width:100%;height:120px;background:var(--btn-bg);border:1px solid var(--border);border-radius:10px;color:#d85c7a;font-weight:600;padding:12px;font-family:monospace;">' + escapeHtml(text) + '</textarea>' +
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
      playBtn.style.background = 'rgba(255,159,180,.22)';
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

function __uvdSaveHistoryMetadata(url, media, card) {
  var entry = (data.history || []).find(function(item) { return item.url === url; });
  if (!entry || !media) return;
  entry.resolution = media.videoWidth && media.videoHeight ? media.videoWidth + '×' + media.videoHeight : entry.resolution || '';
  entry.duration = isFinite(media.duration) && media.duration > 0 ? __uvdFormatDuration(media.duration) : entry.duration || '';
  entry.quality = card && card.dataset.cardQuality ? card.dataset.cardQuality : (entry.quality || '');
  try {
    if (media.videoWidth && media.videoHeight && !entry.thumbnail) {
      var canvas = document.createElement('canvas');
      var width = Math.min(320, media.videoWidth);
      var height = Math.max(1, Math.round(width * media.videoHeight / media.videoWidth));
      canvas.width = width; canvas.height = height;
      canvas.getContext('2d').drawImage(media, 0, 0, width, height);
      entry.thumbnail = canvas.toDataURL('image/jpeg', .58);
    }
  } catch(e) {}
  storage.set(data);
}

// ========== RENDER HISTORY ==========
function __uvdHistoryRelativeTime(timestamp) {
  var delta = Math.max(0, Date.now() - (Number(timestamp) || 0));
  var mins = Math.floor(delta / 60000);
  if (mins < 1) return 'vừa xong';
  if (mins < 60) return mins + ' phút trước';
  var hours = Math.floor(mins / 60);
  if (hours < 24) return hours + ' giờ trước';
  return Math.floor(hours / 24) + ' ngày trước';
}
function __uvdIsFavorite(url) { return (data.favorites || []).indexOf(url) !== -1; }
function __uvdToggleFavorite(url) {
  data.favorites = data.favorites || [];
  var idx = data.favorites.indexOf(url);
  if (idx === -1) data.favorites.unshift(url); else data.favorites.splice(idx, 1);
  storage.set(data);
  return idx === -1;
}
function renderHistory(container) {
  container.innerHTML = '';
  var allEntries = (data.history || []).slice().sort(function(a, b) { return (b.timestamp || 0) - (a.timestamp || 0); });
  var filter = 'all';
  var page = 0;
  var pageSize = 10;
  var controls = document.createElement('div');
  controls.className = 'uvd-history-toolbar';
  controls.innerHTML = '<div class="uvd-history-toolbar-title">🕘 Lịch sử xem</div><div class="uvd-history-filter-row">' +
    '<button data-history-filter="all" class="uvd-history-filter uvd-history-filter-active">Tất cả</button>' +
    '<button data-history-filter="video" class="uvd-history-filter">Video</button>' +
    '<button data-history-filter="iframe" class="uvd-history-filter">Iframe</button>' +
    '<button data-history-filter="favorite" class="uvd-history-filter">♡ Đã ghim</button></div>' +
    '<div class="uvd-history-sync-chip">☁ ' + (data.settings.syncProfileId ? 'Lịch sử đang đồng bộ' : 'Chỉ lưu trên máy này') + '</div>';
  container.appendChild(controls);
  var wrap = document.createElement('div');
  wrap.className = 'uvd-history-list';
  container.appendChild(wrap);
  var clear = document.createElement('button');
  clear.className = 'uvd-btn uvd-btn-sm uvd-history-clear';
  clear.textContent = 'Xóa toàn bộ lịch sử';
  container.appendChild(clear);
  function visibleEntries() {
    return allEntries.filter(function(item) {
      var type = String(item.type || '').toUpperCase();
      if (filter === 'video') return type !== 'IFRAME';
      if (filter === 'iframe') return type === 'IFRAME';
      if (filter === 'favorite') return __uvdIsFavorite(item.url);
      return true;
    });
  }
  function draw() {
    wrap.innerHTML = '';
    var entries = visibleEntries();
    if (!entries.length) {
      wrap.innerHTML = '<div class="uvd-empty-state uvd-history-empty"><strong>Chưa có mục ở nhóm này</strong><span>Bấm Xem hoặc Mở nguồn để lưu lại nè ♡</span></div>';
      return;
    }
    var totalPages = Math.max(1, Math.ceil(entries.length / pageSize));
    page = Math.max(0, Math.min(page, totalPages - 1));
    entries.slice(page * pageSize, (page + 1) * pageSize).forEach(function(item) {
      var card = document.createElement('article');
      card.className = 'uvd-history-card uvd-cute';
      var type = item.type || 'MEDIA';
      var starred = __uvdIsFavorite(item.url);
      var thumb = item.thumbnail ? '<img src="' + escapeHtml(item.thumbnail) + '" alt="">' : '<span>▶</span>';
      card.innerHTML = '<div class="uvd-history-thumb">' + thumb + '<small>' + escapeHtml(type) + '</small></div>' +
        '<div class="uvd-history-body"><div class="uvd-history-title-row"><strong>' + escapeHtml(item.title || 'Video không có tên') + '</strong><button class="uvd-history-star' + (starred ? ' uvd-history-star-on' : '') + '">' + (starred ? '♥' : '♡') + '</button></div>' +
        '<div class="uvd-history-meta">' + escapeHtml(item.host || '') + ' · ' + __uvdHistoryRelativeTime(item.timestamp) + '</div>' +
        '<div class="uvd-history-meta">' + escapeHtml([item.quality, item.resolution, item.duration].filter(Boolean).join(' · ')) + '</div>' +
        '<div class="uvd-history-url">' + escapeHtml(item.url || '') + '</div>' +
        '<div class="uvd-history-actions"><button class="uvd-btn uvd-btn-sm history-play">' + (String(type).toUpperCase() === 'IFRAME' ? 'Mở nguồn' : 'Xem lại') + '</button><button class="uvd-btn uvd-btn-sm history-source"' + (item.pageUrl ? '' : ' disabled') + '>Nguồn gốc</button><button class="uvd-btn uvd-btn-sm history-copy">Sao chép</button><button class="uvd-btn uvd-btn-sm history-delete">Xóa</button></div></div>';
      card.querySelector('.history-play').onclick = function() { if (String(type).toUpperCase() === 'IFRAME') __uvdSafeOpen(item.url); else showVideoPlayer(item.url, type, false, false, false, item.title); };
      var sourceBtn = card.querySelector('.history-source');
      if (sourceBtn && item.pageUrl) sourceBtn.onclick = function() { __uvdSafeOpen(item.pageUrl); };
      card.querySelector('.history-copy').onclick = function() { copy(item.url); toast('Đã sao chép link lịch sử'); };
      card.querySelector('.history-delete').onclick = function() { data.history = data.history.filter(function(x) { return x.url !== item.url; }); storage.set(data); allEntries = allEntries.filter(function(x) { return x.url !== item.url; }); draw(); };
      card.querySelector('.uvd-history-star').onclick = function() { toast(__uvdToggleFavorite(item.url) ? 'Đã ghim vào yêu thích ♡' : 'Đã bỏ ghim'); draw(); };
      wrap.appendChild(card);
    });
    if (totalPages > 1) {
      var pager = document.createElement('div');
      pager.className = 'uvd-history-pager';
      pager.innerHTML = '<button type="button" class="uvd-history-page-prev"' + (page === 0 ? ' disabled' : '') + '>←</button><span>Trang ' + (page + 1) + ' / ' + totalPages + '</span><button type="button" class="uvd-history-page-next"' + (page >= totalPages - 1 ? ' disabled' : '') + '>→</button>';
      pager.querySelector('.uvd-history-page-prev').onclick = function() { if (page > 0) { page--; draw(); } };
      pager.querySelector('.uvd-history-page-next').onclick = function() { if (page < totalPages - 1) { page++; draw(); } };
      wrap.appendChild(pager);
    }
  }
  controls.querySelectorAll('[data-history-filter]').forEach(function(btn) {
    btn.onclick = function() { filter = this.dataset.historyFilter; page = 0; controls.querySelectorAll('[data-history-filter]').forEach(function(b) { b.classList.toggle('uvd-history-filter-active', b === btn); }); draw(); };
  });
  clear.onclick = function() { if (confirm('Xóa toàn bộ lịch sử xem?')) { data.history = []; storage.set(data); allEntries = []; draw(); } };
  draw();
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
    '<div class="uvd-card uvd-cute uvd-clkbtn-card">' +
      '<div style="font-weight:600;margin-bottom:6px;">🖱️ Danh sách nút đã click (tổng ' + entries.length + ')</div>' +
      '<div style="font-size:12px;color:var(--text2);margin-bottom:10px;">Bật/tắt để chặn hoặc cho phép click lại. Nút bị chặn sẽ tự bỏ qua ở lần Auto Play kế tiếp trên site <span style="color:#d85c7a;font-family:monospace;">' + escapeHtml(host) + '</span>.</div>';

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
function __uvdBuildConfigLink() {
  var safeSettings = Object.assign({}, data.settings);
  delete safeSettings.headerProxyKey;
  delete safeSettings.subdlApiKey;
  delete safeSettings.tmdbApiKey;
  // Keep the bookmarklet URL short. The shared data lives in Supabase;
  // the link only needs the profile ID (and a few safe defaults).
  var payload = { version: 2, settings: { syncProfileId: safeSettings.syncProfileId || '' } };
  var encoded = btoa(unescape(encodeURIComponent(JSON.stringify(payload)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  var scriptUrl = RENDER_PROXY_BASE + '/bookmarklet.js?cfg=' + encodeURIComponent(encoded) + '&v=' + Date.now();
  var packedUrl = btoa(scriptUrl);
  return "javascript:(function(){var u=atob('" + packedUrl + "');var e=document.createElement('script');e.src=u;e.onerror=function(){fetch(u).then(function(r){return r.text();}).then(function(c){(0,eval)(c);});};(document.head||document.documentElement).appendChild(e);})();";
}

function __uvdSettingsAnimalSign(kind, title, subtitle) {
  var map = {
    rabbit: __uvdTabMascotRabbit,
    bear: __uvdTabMascotBear,
    cat: __uvdHeaderMascot,
    panda: (typeof __uvdTabMascotPanda !== 'undefined' ? __uvdTabMascotPanda : __uvdHeaderMascot),
    raccoon: (typeof __uvdTabMascotRaccoon !== 'undefined' ? __uvdTabMascotRaccoon : __uvdTabMascotBear),
    hamster: (typeof __uvdTabMascotHamster !== 'undefined' ? __uvdTabMascotHamster : __uvdTabMascotRabbit)
  };
  var mascot = map[kind] || __uvdHeaderMascot;
  var animalName = { rabbit: 'THỎ', bear: 'GẤU', cat: 'MÈO', panda: 'PANDA', raccoon: 'GẤU MÈO', hamster: 'HAMSTER' }[kind] || 'THÚ CƯNG';
  var safeTitle = escapeHtml(title || 'Hướng dẫn sử dụng');
  var safeSubtitle = escapeHtml(subtitle || 'Mèo chỉ cưng từng bước nè ♡');
  return '<div class="uvd-settings-animal-sign uvd-settings-sign-' + kind + '">' +
    '<span class="uvd-settings-sign-mascot">' + mascot + '<b class="uvd-settings-sign-animal-name">' + animalName + '</b></span>' +
    '<i class="uvd-settings-sign-paw uvd-settings-sign-paw-one"></i><i class="uvd-settings-sign-paw uvd-settings-sign-paw-two"></i>' +
    '<div class="uvd-settings-sign-board"><strong>' + safeTitle + '</strong><small>' + safeSubtitle + '</small></div>' +
  '</div>';
}

function renderSettings(container) {
  var totalStreams = urls.size;
  var bookmarkletCode = "javascript:(function(){var u=atob('aHR0cHM6Ly9yZW5kZXItaGVhZGVyLXByb3h5Lm9ucmVuZGVyLmNvbS9ib29rbWFya2xldC5qcz9mb3JjZT0=')+Date.now();var e=document.createElement('script');e.src=u;e.onerror=function(){fetch(u).then(function(r){return r.text();}).then(function(c){(0,eval)(c);});};(document.head||document.documentElement).appendChild(e);})();";

  container.innerHTML =
    '<div class="uvd-profile-card uvd-profile-card-cute">' +
      '<div class="uvd-profile-avatar uvd-profile-avatar-cute"><span class="uvd-profile-avatar-cat">' + __uvdHeaderMascot + '</span><i class="uvd-profile-avatar-heart">♡</i></div>' +
      '<div class="uvd-profile-info uvd-profile-copy-cute">' +
        '<div class="uvd-profile-eyebrow">một chiếc mèo làm tool</div>' +
        '<div class="uvd-profile-name">nguyenquocngu91 <span>♡</span></div>' +
        '<div class="uvd-profile-personality">Hay tò mò, mê mày mò và thích biến những thứ khó hiểu thành nút bấm xinh xắn cho cưng.</div>' +
        '<div class="uvd-profile-traits">' +
          '<span>🐾 thích khám phá</span><span>🎀 mê UI cute</span><span>💗 chăm chút từng tí</span>' +
        '</div>' +
      '</div>' +
    '</div>' +

    '<div class="uvd-profile-stats" style="grid-template-columns:repeat(4,1fr);">' +
      '<div class="uvd-stat"><div class="uvd-stat-num">' + totalStreams + '</div><div class="uvd-stat-label">Streams</div></div>' +
      '<div class="uvd-stat"><div class="uvd-stat-num">' + data.favorites.length + '</div><div class="uvd-stat-label">Yêu thích</div></div>' +
      '<div class="uvd-stat"><div class="uvd-stat-num">' + (data.history||[]).length + '</div><div class="uvd-stat-label">Lịch sử</div></div>' +
      '<div class="uvd-stat"><div class="uvd-stat-num" style="color:#ff5d72;">' + __uvdBlockedCount + '</div><div class="uvd-stat-label">Đã chặn popup</div></div>' +
    '</div>' +

    '<div class="uvd-settings-group-title">🌷 Cơ bản cho cưng</div>' +
    '<div class="uvd-card">' +
      '<div style="font-weight:800;margin-bottom:5px;">🎛 Nhịp & bề mặt</div>' +
      '<div style="font-size:11px;color:var(--text3);margin-bottom:9px;">Giao diện pastel phẳng: không blur, không glow. Cưng chỉnh nhịp chuyển động, bóng và độ mềm của góc ở đây nha.</div>' +
      buildToggleRow('__uvd_toggle_reducemotion__', 'Chế độ hiệu suất (giảm chuyển động)', data.settings.reduceMotion) +
      '<div style="font-size:12px;color:var(--text2);margin:11px 0 4px;">Tốc độ hiệu ứng: <span id="__uvd_effect_speed_val__">' + Math.round(Number(data.settings.effectSpeed || 1) * 100) + '%</span></div>' +
      '<input type="range" id="__uvd_effect_speed_range__" min="0.5" max="1.8" step="0.1" value="' + data.settings.effectSpeed + '" style="width:100%;">' +
      '<div style="font-size:12px;color:var(--text2);margin:11px 0 4px;">Độ đổ bóng: <span id="__uvd_shadow_val__">' + data.settings.shadowIntensity + '%</span></div>' +
      '<input type="range" id="__uvd_shadow_range__" min="0" max="100" step="1" value="' + data.settings.shadowIntensity + '" style="width:100%;">' +
      '<div style="font-size:12px;color:var(--text2);margin:11px 0 4px;">Độ bo góc: <span id="__uvd_corner_val__">' + data.settings.cornerRadius + 'px</span></div>' +
      '<input type="range" id="__uvd_corner_range__" min="12" max="36" step="1" value="' + data.settings.cornerRadius + '" style="width:100%;">' +
    '</div>' +

    '<div class="uvd-card">' +
      '<div style="font-weight:600;margin-bottom:8px;">🫥 Khi thu gọn script</div>' +
      '<div style="font-size:12px;color:var(--text2);margin-bottom:8px;">Chọn cách Mèo cào media thu gọn khi cưng bấm nút ▾ trên Main UI.</div>' +
      '<select id="__uvd_hide_mode__" style="width:100%;padding:10px;background:var(--btn-bg);border:1px solid var(--border);border-radius:10px;color:#d85c7a;">' +
        '<option value="floating"' + (data.settings.hideMode === 'floating' ? ' selected' : '') + '>Icon floating di chuyển được (mặc định)</option>' +
        '<option value="header"' + (data.settings.hideMode === 'header' ? ' selected' : '') + '>Thu nhỏ còn header</option>' +
      '</select>' +
    '</div>' +

    '<div class="uvd-card">' +
      '<div style="font-weight:600;margin-bottom:8px;">🎨 Giao diện mới</div>' +
      '<div class="uvd-callout" style="margin-top:0;"><span class="uvd-callout-icon">🎀</span><span>Giao diện dùng nền pastel đặc, viền rõ và bóng mềm. Ba thanh chỉnh phía trên áp dụng cho Main UI lẫn popup nha.</span></div>' +
    '</div>' +

    '<div class="uvd-settings-group-title">🔎 Đào link nâng cao</div>' +
    '<div class="uvd-card">' +
      '<div style="font-weight:600;margin-bottom:8px;">🌐 Header proxy</div>' +
      '<div style="font-size:12px;color:var(--text2);margin-bottom:8px;">Tự thử Render proxy khi MP4/HLS lỗi do thiếu Referer hoặc User-Agent.</div>' +
      '<input id="__uvd_proxy_key__" type="password" autocomplete="off" placeholder="PROXY_KEY (nếu Render yêu cầu)" value="' + escapeHtml(data.settings.headerProxyKey || '') + '" style="width:100%;padding:10px 12px;background:var(--btn-bg);border:1px solid var(--border);border-radius:var(--radius-sm);color:#d85c7a;font-size:12px;">' +
      '<div style="font-size:10px;color:var(--text3);margin-top:6px;">Proxy: ' + escapeHtml(HEADER_PROXY_BASE) + '</div>' +
    '</div>' +

    '<div class="uvd-card">' +
      '<div style="font-weight:600;margin-bottom:8px;">🤖 AI lọc iframe rác</div>' +
      buildToggleRow('__uvd_toggle_aiframe__', 'Bật AI/heuristic phân loại iframe (giữ player thật, gắn nhãn rác)', data.settings.aiIframeFilter) +
      '<div style="font-size:12px;color:var(--text2);margin:10px 0 6px;">LLM proxy (tuỳ chọn, hybrid)</div>' +
      '<input id="__uvd_llm_proxy__" type="url" autocomplete="off" placeholder="https://render-header-proxy.onrender.com (để trống = Render mặc định)" value="' + escapeHtml(data.settings.llmProxyUrl || '') + '" style="width:100%;padding:10px 12px;background:var(--btn-bg);border:1px solid var(--border);border-radius:var(--radius-sm);color:#d85c7a;font-size:12px;">' +
      '<div style="font-size:10px;color:var(--text3);margin-top:6px;">Tầng AI dùng <b>GEMINI_API_KEY</b> trên Render để lọc iframe qua <b>/classify</b> và lọc media qua <b>/analyze-media</b>. Media chỉ gửi host + loại + resolution + thời lượng + dung lượng ước tính kỹ thuật; không gửi file video, URL đầy đủ hay key.</div>' +
    '</div>' +

    '<div class="uvd-settings-group-title">☁ Đồng bộ & lịch sử</div>' +
    (__uvdTmdbFeatureEnabled ? '<div class="uvd-card">' +
      '<div style="font-weight:600;margin-bottom:8px;">🎞 Nhận diện phim TMDB (tuỳ chọn)</div>' +
      '<div style="font-size:12px;color:var(--text2);margin-bottom:8px;">TMDB sẽ tự nhận diện tên phim trong player để hiện logo, cast và thông tin phim. Render token được ưu tiên; key local này chỉ là fallback, không sync/cloud.</div>' +
      '<input id="__uvd_tmdb_key__" type="password" autocomplete="off" placeholder="TMDB API key (v3)" value="' + escapeHtml(data.settings.tmdbApiKey || '') + '" style="width:100%;padding:10px 12px;background:var(--btn-bg);border:1px solid var(--border);border-radius:var(--radius-sm);color:#d85c7a;font-size:12px;">' +
    '</div>' : '') +

    '<div class="uvd-card">' +
      '<div style="font-weight:600;margin-bottom:8px;">🔗 Bookmarklet riêng</div>' +
      '<div style="font-size:12px;color:var(--text2);margin-bottom:8px;">Tạo link chạy với các cài đặt hiện tại. Link không chứa Proxy key hoặc SubDL API key.</div>' +
      '<input id="__uvd_config_link__" readonly value="' + escapeHtml(__uvdBuildConfigLink()) + '" style="width:100%;padding:10px 12px;background:var(--btn-bg);border:1px solid var(--border);border-radius:var(--radius-sm);color:#d85c7a;font-size:10px;">' +
      '<button class="uvd-btn uvd-btn-sm" id="__uvd_copy_config_link__" style="width:100%;margin-top:8px;">📋 Copy link bookmarklet riêng</button>' +
    '</div>' +

    '<div class="uvd-card">' +
      '<div style="font-weight:600;margin-bottom:8px;">☁ Đồng bộ cấu hình</div>' +
      '<div style="font-size:12px;color:var(--text2);margin-bottom:8px;">Đồng bộ site profile, filterlist, history và settings giữa các thiết bị.</div>' +
      '<input id="__uvd_sync_profile__" placeholder="Profile ID (vd: u_...)" value="' + escapeHtml(data.settings.syncProfileId || '') + '" style="width:100%;padding:10px 12px;background:var(--btn-bg);border:1px solid var(--border);border-radius:var(--radius-sm);color:#d85c7a;font-size:12px;">' +
      '<div class="uvd-grid-2" style="margin-top:8px;"><button class="uvd-btn uvd-btn-sm" id="__uvd_sync_create__">Tạo profile</button><button class="uvd-btn uvd-btn-sm" id="__uvd_sync_now__">Đồng bộ ngay</button></div>' +
    '</div>' +

    '<div class="uvd-settings-group-title">🛡️ Bảo vệ & lọc rác</div>' +
    '<div class="uvd-card">' +
      '<div style="font-weight:600;margin-bottom:8px;">⛔ Chặn tự phát</div>' +
      buildToggleRow('__uvd_toggle_blockautoplay__', 'Chặn mạnh web tự mở/phát video sau khi chạy script', data.settings.blockAutoplay) +
      buildToggleRow('__uvd_toggle_autoclick__', 'Tự động quét và bấm Play sau khi chạy script', data.settings.autoClickPlay) +
      '<div style="font-size:11px;color:var(--text3);margin-top:6px;">Video/audio do chính trang web tự bật (quảng cáo, autoplay ẩn...) sẽ luôn bị tạm dừng ngay. Video mở qua Mèo cào media Player không bị ảnh hưởng.</div>' +
    '</div>' +

    '<div class="uvd-card">' +
      '<div style="font-weight:600;margin-bottom:8px;">🛡️ Lọc quảng cáo (Filterlist)</div>' +
      '<div style="font-size:12px;color:var(--text2);margin-bottom:8px;">' +
        'Nhập mỗi dòng một rule. Hỗ trợ domain/từ khóa, regex (<code>regex:</code>) và rule AdGuard/uBlock như <code>||ads.example^</code>, ngoại lệ <code>@@||example.com^</code>. Rule áp dụng trước khi quét media.' +
      '</div>' +
      '<textarea id="__uvd_filter_text__" style="width:100%;height:80px;background:var(--btn-bg);border:1px solid var(--border);border-radius:10px;color:#d85c7a;font-weight:600;padding:12px;font-size:12px;">' + escapeHtml((data.filterlist||[]).join('\n')) + '</textarea>' +
      '<div class="uvd-grid-2" style="margin-top:8px;">' +
        '<button class="uvd-btn uvd-btn-sm" id="__uvd_save_filter__">💾 Lưu</button>' +
        '<button class="uvd-btn uvd-btn-sm" id="__uvd_import_filter__">📂 Import file</button>' +
      '</div>' +
      '<div style="margin-top:6px;font-size:11px;color:var(--text3);">Đã chặn <span id="__uvd_blocked_ads__">' + __uvdAdBlockedCount + '</span> URL quảng cáo trong phiên này.</div>' +
    '</div>' +

    '<div class="uvd-settings-group-title">📚 Hướng dẫn nhanh</div>' +
    '<div class="uvd-card uvd-settings-tutorial-card"><span class="uvd-settings-tutorial-mascot">' + __uvdTabMascotRabbit + '</span><div style="min-width:0;flex:1"><div style="font-weight:900;color:#c95073">Xem lại 6 slide hướng dẫn</div><div style="font-size:10.5px;color:#8a6ab0;margin-top:2px">Mở lại bất cứ lúc nào, không làm phiền nha ♡</div></div><button class="uvd-btn uvd-btn-sm" id="__uvd_tutorial_reopen__">Xem lại</button></div>' +
    '<details class="uvd-settings-details"><summary><span class="uvd-section-num">1</span><span>Cài đặt Bookmarklet</span><span class="uvd-details-chevron">⌄</span></summary>' +
    '<div class="uvd-settings-details-body">' + __uvdSettingsAnimalSign('rabbit', 'Cài đặt Bookmarklet', 'Thỏ giữ bảng, cưng làm theo từng bước nha 🐰') + '<div class="uvd-card uvd-timeline-card">' +
      '<div class="uvd-step"><span class="uvd-step-num">1</span><span class="uvd-step-text">Mở một trang web bất kỳ, bấm vào biểu tượng <strong>⭐ Bookmark</strong> trên thanh địa chỉ nhé.</span></div>' +
      '<div class="uvd-step"><span class="uvd-step-num">2</span><span class="uvd-step-text">Chọn <strong>"Chỉnh sửa"</strong> (Edit) nha.</span></div>' +
      '<div class="uvd-step"><span class="uvd-step-num">3</span><span class="uvd-step-text"><strong>Đặt tên</strong> dễ thương, ví dụ: <code class="uvd-inline-code">' + BOOKMARKLET_NAME + '</code></span></div>' +
      '<div class="uvd-step"><span class="uvd-step-num">4</span><span class="uvd-step-text"><strong>Xóa toàn bộ địa chỉ</strong> trong ô URL rồi dán đoạn code sau vào nha:</span></div>' +
      '<div class="uvd-code-block"><textarea readonly rows="3">' + escapeHtml(bookmarkletCode) + '</textarea><button class="uvd-code-copy" data-copy-target="bookmarklet" title="Sao chép">📋</button></div>' +
      '<div class="uvd-step"><span class="uvd-step-num">5</span><span class="uvd-step-text">Bấm <strong>Lưu</strong> (Save) là xong gọn nè.</span></div>' +
      '<div class="uvd-callout"><span class="uvd-callout-icon">💡</span><span>Từ lần sau, cưng chỉ cần gõ tên bookmark (<strong style="color:var(--accent-text);">Mèo cào media</strong>) vào thanh địa chỉ rồi chọn nó là chạy ngay. Script tự cập nhật bản mới nhất mỗi lần nha!</span></div>' +
    '</div></div></details>' +

    '<details class="uvd-settings-details"><summary><span class="uvd-section-num">2</span><span>Flow Popup Đào → Video/Iframe</span><span class="uvd-details-chevron">⌄</span></summary>' +
    '<div class="uvd-settings-details-body">' + __uvdSettingsAnimalSign('hamster', 'Flow popup hiện tại', 'Hamster chỉ đường từ Popup Đào đến video thật 🐹') + '<div class="uvd-card uvd-timeline-card">' +
      '<div class="uvd-step"><span class="uvd-step-num">1</span><span class="uvd-step-text">Mở trang phim rồi chạy bookmark <code class="uvd-inline-code">' + BOOKMARKLET_NAME + '</code>. Popup Đào sẽ hiện đầu tiên.</span></div>' +
      '<div class="uvd-step"><span class="uvd-step-num">2</span><span class="uvd-step-text">Đợi Mèo quét player/request. Khi có video thật, bấm <strong style="color:var(--accent-text);">Xem ngay</strong> hoặc <strong style="color:var(--accent-text);">Vào link</strong> để mở Popup Video.</span></div>' +
      '<div class="uvd-step"><span class="uvd-step-num">3</span><span class="uvd-step-text">Nếu trang chỉ có player iframe, Mèo sẽ mở flow Iframe để cưng dò qua trang mẹ hoặc mở đúng player.</span></div>' +
      '<div class="uvd-step"><span class="uvd-step-num">4</span><span class="uvd-step-text">Nếu chưa thấy nguồn, mở video trên trang và bấm Play thật. Mèo sẽ nghe fetch/XHR/playlist mới tốt hơn.</span></div>' +
      '<div class="uvd-callout"><span class="uvd-callout-icon">✨</span><span>Popup Video chỉ nhận link đã kiểm chứng. Link network thô hoặc video demo ngắn sẽ không được ưu tiên đâu nha.</span></div>' +
    '</div></div></details>' +

    '<details class="uvd-settings-details"><summary><span class="uvd-section-num">3</span><span>Main UI, Player & Đồng bộ</span><span class="uvd-details-chevron">⌄</span></summary>' +
    '<div class="uvd-settings-details-body">' + __uvdSettingsAnimalSign('panda', 'Main UI là bảng điều khiển', 'Panda giữ hộ kết quả khi cưng rời popup 🐼') + '<div class="uvd-card uvd-timeline-card">' +
      '<div class="uvd-step"><span class="uvd-step-num">•</span><span class="uvd-step-text">Bấm <strong style="color:var(--accent-text);">Vào UI</strong>, ×, ← hoặc Để sau trong flow sẽ hiện nhắc nhỏ. Bấm Để sau ở nhắc nhỏ thì flow nằm thành thanh dưới <strong>Current Session</strong>.</span></div>' +
      '<div class="uvd-step"><span class="uvd-step-num">•</span><span class="uvd-step-text">Dòng Current Session luôn chỉ đến <strong style="color:var(--accent-text);">link đã kiểm chứng</strong>; bấm Mở Popup ở đó để quay lại Video/Iframe mà không quét lại từ đầu.</span></div>' +
      '<div class="uvd-step"><span class="uvd-step-num">•</span><span class="uvd-step-text">Trong Player, bấm ⚙ để mở <strong>Cài đặt Player riêng</strong>: tốc độ, chất lượng, resume, data saver và controls.</span></div>' +
      '<div class="uvd-step"><span class="uvd-step-num">•</span><span class="uvd-step-text">Đồng bộ: tạo/copy Profile ID, dán vào thiết bị khác để Mèo tải profile trước, rồi bấm <strong>Đồng bộ ngay</strong>. Lịch sử metadata, site profile và filterlist sẽ được gộp.</span></div>' +
      '<div class="uvd-callout"><span class="uvd-callout-icon">☁</span><span>Nếu một website chặn request Sync, Mèo sẽ thử bridge qua Render. Nút Đồng bộ sẽ báo lý do nếu chưa kết nối được.</span></div>' +
    '</div></div></details>' +

    '<details class="uvd-settings-details"><summary><span class="uvd-section-num">4</span><span>Tải video với yt-dlp và Termux</span><span class="uvd-details-chevron">⌄</span></summary>' +
    '<div class="uvd-settings-details-body">' + __uvdSettingsAnimalSign('raccoon', 'Tải video với Termux', 'Gấu mèo cầm bảng chuẩn bị lệnh tải cho cưng 🦝') + '<div class="uvd-card uvd-timeline-card">' +
      '<div class="uvd-step"><span class="uvd-step-num">1</span><span class="uvd-step-text"><strong>Cài yt-dlp trên Termux nha:</strong></span></div>' +
      '<code class="uvd-inline-code" style="display:block;margin:4px 0;">pkg update && pkg upgrade -y</code>' +
      '<code class="uvd-inline-code" style="display:block;margin:4px 0;">pkg install python ffmpeg -y</code>' +
      '<code class="uvd-inline-code" style="display:block;margin:4px 0 10px;">pip install yt-dlp</code>' +
      '<div class="uvd-step"><span class="uvd-step-num">2</span><span class="uvd-step-text">Mở tab <strong style="color:var(--accent-text);">Streams</strong>, chọn stream cưng muốn tải nha</span></div>' +
      '<div class="uvd-step"><span class="uvd-step-num">3</span><span class="uvd-step-text">Bấm <strong style="color:var(--accent-text);">Lệnh tải</strong> → chọn lệnh phù hợp rồi sao chép nha</span></div>' +
      '<div class="uvd-step"><span class="uvd-step-num">4</span><span class="uvd-step-text">Mở Termux, dán lệnh vào rồi bấm Enter để tải nha</span></div>' +
      '<div class="uvd-callout uvd-callout-warn"><span class="uvd-callout-icon">⚠️</span><span><strong style="color:var(--text);">Lưu ý nhỏ:</strong> nhớ cấp quyền lưu file cho Termux (Android 11+) nha: <code class="uvd-inline-code">termux-setup-storage</code></span></div>' +
    '</div></div></details>' +

    '<div class="uvd-settings-footer-cute">' +
      '<span class="uvd-settings-footer-mascot">' + __uvdFooterMascot + '</span>' +
      '<div class="uvd-settings-footer-text">' +
        '<div class="uvd-settings-footer-title">Cảm ơn cưng đã dùng Mèo cào media nè ♡</div>' +
        '<div class="uvd-settings-footer-sub">Xem phim vui vẻ, có gì cần cứ bấm thoải mái nha 🍿✨ Còn nhiều mẹo hay phía trên đó!</div>' +
      '</div>' +
    '</div>' +
    '<div class="uvd-profile-footer">© ' + new Date().getFullYear() + ' nguyenquocngu91 · Mèo cào media v' + VERSION + ' · Made for Chrome Android</div>';

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
    __uvdRefreshSurfaceTuning();
    toast(isOn ? 'Đã giảm chuyển động để máy nhẹ hơn' : 'Đã bật lại nhịp hiệu ứng');
  };

  var effectSpeedRange = document.getElementById('__uvd_effect_speed_range__');
  if (effectSpeedRange) effectSpeedRange.oninput = function() {
    var val = __uvdClampNumber(this.value, .5, 1.8, 1);
    data.settings.effectSpeed = val;
    document.getElementById('__uvd_effect_speed_val__').textContent = Math.round(val * 100) + '%';
    storage.set(data);
    __uvdRefreshSurfaceTuning();
  };
  var shadowRange = document.getElementById('__uvd_shadow_range__');
  if (shadowRange) shadowRange.oninput = function() {
    var val = Math.round(__uvdClampNumber(this.value, 0, 100, 34));
    data.settings.shadowIntensity = val;
    document.getElementById('__uvd_shadow_val__').textContent = val + '%';
    storage.set(data);
    __uvdRefreshSurfaceTuning();
  };
  var cornerRange = document.getElementById('__uvd_corner_range__');
  if (cornerRange) cornerRange.oninput = function() {
    var val = Math.round(__uvdClampNumber(this.value, 12, 36, 22));
    data.settings.cornerRadius = val;
    document.getElementById('__uvd_corner_val__').textContent = val + 'px';
    storage.set(data);
    __uvdRefreshSurfaceTuning();
  };

  var hideModeInput = document.getElementById('__uvd_hide_mode__');
  if (hideModeInput) hideModeInput.onchange = function() {
    data.settings.hideMode = this.value === 'header' ? 'header' : 'floating';
    storage.set(data);
    toast(data.settings.hideMode === 'floating' ? 'Ẩn dạng icon floating' : 'Ẩn dạng header');
  };

  var proxyKeyInput = document.getElementById('__uvd_proxy_key__');
  if (proxyKeyInput) proxyKeyInput.onchange = function() {
    data.settings.headerProxyKey = this.value.trim();
    storage.set(data);
    toast(data.settings.headerProxyKey ? 'Đã lưu proxy key' : 'Đã xóa proxy key');
  };

  var aiToggle = document.getElementById('__uvd_toggle_aiframe__');
  if (aiToggle) aiToggle.onclick = function() {
    var isOn = this.classList.toggle('uvd-toggle-on');
    data.settings.aiIframeFilter = isOn;
    storage.set(data);
    toast(isOn ? 'Đã bật AI lọc iframe rác' : 'Đã tắt AI lọc iframe rác');
  };

  var llmProxyInput = document.getElementById('__uvd_llm_proxy__');
  if (llmProxyInput) llmProxyInput.onchange = function() {
    data.settings.llmProxyUrl = this.value.trim();
    storage.set(data);
    toast(data.settings.llmProxyUrl ? 'Đã lưu LLM proxy' : 'Dùng Render mặc định cho tầng AI');
  };
  var tmdbKeyInput = document.getElementById('__uvd_tmdb_key__');
  if (tmdbKeyInput) tmdbKeyInput.onchange = function() {
    data.settings.tmdbApiKey = this.value.trim();
    storage.set(data);
    toast(data.settings.tmdbApiKey ? 'Đã lưu TMDB key trên máy này' : 'Đã xóa TMDB key');
  };

  var copyConfigBtn = document.getElementById('__uvd_copy_config_link__');
  if (copyConfigBtn) copyConfigBtn.onclick = function() { copy(__uvdBuildConfigLink()); toast('Đã copy link bookmarklet riêng'); };
  var tutorialReopen = document.getElementById('__uvd_tutorial_reopen__');
  if (tutorialReopen) tutorialReopen.onclick = function() {
    data.settings.tutorialMuted = false;
    storage.set(data);
    __uvdShowTutorialSlides();
  };

  document.getElementById('__uvd_toggle_autoclick__').onclick = function() {
    var isOn = this.classList.toggle('uvd-toggle-on');
    data.settings.autoClickPlay = isOn;
    storage.set(data);
    toast(isOn ? 'Đã bật tự động quét/bấm Play' : 'Đã tắt tự động quét/bấm Play');
    if (isOn) runAutoClickAndRescan(false);
  };

  var syncInput = document.getElementById('__uvd_sync_profile__');
  if (syncInput) syncInput.onchange = function() {
    var profileId = this.value.trim();
    data.settings.syncProfileId = profileId;
    if (!profileId) { storage.set(data); toast('Đã bỏ profile đồng bộ'); return; }
    // Load first when a profile is pasted on a new device. This prevents the
    // scheduled local upload from replacing a populated remote profile.
    __uvdSyncLoading = true;
    storage.set(data);
    toast('☁ Đang tải profile đồng bộ...');
    __uvdSyncLoad(false).then(function(ok) {
      if (!ok) toast('☁ Chưa tải được profile: ' + (__uvdSyncLastError || 'kiểm tra Render/Supabase nha'));
    });
  };
  var syncCreate = document.getElementById('__uvd_sync_create__');
  if (syncCreate) syncCreate.onclick = function() {
    var id = __uvdCreateSyncProfileId();
    if (syncInput) syncInput.value = id;
    toast('Đã tạo profile: ' + id + ' · bấm Đồng bộ ngay để lưu');
  };
  var syncNow = document.getElementById('__uvd_sync_now__');
  if (syncNow) syncNow.onclick = function() {
    toast('☁ Đang gộp lịch sử và đồng bộ...');
    __uvdSyncNow().then(function(ok) {
      toast(ok ? '☁ Đã đồng bộ cấu hình và lịch sử' : '☁ Đồng bộ lỗi: ' + (__uvdSyncLastError || 'kiểm tra Render/Supabase nha'));
    });
  };

  document.getElementById('__uvd_toggle_blockautoplay__').onclick = function() {
    var isOn = this.classList.toggle('uvd-toggle-on');
    data.settings.blockAutoplay = isOn;
    storage.set(data);
    if (isOn) { try { document.querySelectorAll('video,audio').forEach(__uvdNeutralizeMedia); } catch(e) {} }
    toast(isOn ? 'Đã bật chặn tự phát (mạnh)' : 'Đã tắt chặn tự phát');
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
function __uvdUserscriptPageHasTarget() {
  try { return !!document.querySelector('video,audio,source,iframe'); } catch(e) { return false; }
}
function __uvdStartUserscriptUi() {
  if (document.getElementById('__uvd__')) return;
  window.__uvdBootPhase = 'build-ui';
  buildUI();
  setTimeout(function() { __uvdStartDiggingPopup(); }, 140);
  setTimeout(__uvdSyncLoad, 350);
  if (__uvdUserscriptMode) setTimeout(function() { __uvdSetHidden(true); }, 0);
}
try {
  __uvdLoadSharedAdRules();
  if (!__uvdUserscriptFrameMode) {
    if (!__uvdUserscriptMode || __uvdUserscriptPageHasTarget()) {
      __uvdStartUserscriptUi();
    } else {
      var __uvdUserscriptUiWatch = new MutationObserver(function() {
        if (__uvdUserscriptPageHasTarget()) {
          __uvdUserscriptUiWatch.disconnect();
          __uvdStartUserscriptUi();
        }
      });
      __uvdUserscriptUiWatch.observe(document.documentElement || document, { childList: true, subtree: true });
      setTimeout(function() { try { __uvdUserscriptUiWatch.disconnect(); } catch(e) {} }, 120000);
    }
  } else {
    console.log('[Mèo cào media] iframe capture mode active');
  }
  console.log('V' + VERSION + ' Mèo cào media PRO - tối ưu hiệu năng');
} catch (bootError) {
  __uvdReportBootError(bootError);
}
__uvdBooting = false;

})();
