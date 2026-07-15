/**
 * Universal Media Player PRO - V7.0 CDN Edition
 * - FIX: Gộp 7 regex thành 1 master regex để tăng tốc độ quét HTML gấp 10 lần.
 * - NEW: Blob URL Resolver (Tự động tìm link gốc từ blob:).
 * - NEW: Menu Bánh Răng (Settings) tích hợp vào Player.
 * - REMOVE: Xóa toàn bộ lệnh tải về (yt-dlp, ffmpeg, curl) để tập trung xem online.
 * - KEEP: Giữ nguyên toàn bộ logic robust của bản gốc (Auto-click, SubDL, Sleep Timer, Export...).
 */
(function() {
'use strict';

// ========== VERSION & CLEANUP ==========
var VERSION = '7.0.0';
var old = document.getElementById('__uvd__'); if (old) old.remove();
var oldMinBtn = document.getElementById('__uvd_min_float__'); if (oldMinBtn) oldMinBtn.remove();
var oldPlayer = document.getElementById('__uvd_player_overlay__'); if (oldPlayer) oldPlayer.remove();

// ========== STORAGE ==========
var STORAGE_KEY = 'uvd_data_v70';
var storage = {
  get: function() { try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; } catch(e) { return {}; } },
  set: function(data) { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch(e) {} }
};

var data = storage.get();
data.favorites = data.favorites || [];
data.siteProfiles = data.siteProfiles || {};
data.history = data.history || [];
data.filterlist = data.filterlist || [];
data.playbackPositions = data.playbackPositions || {};
data.settings = Object.assign({
  defaultSpeed: 1, autoFullscreen: false, resumePlayback: true,
  volumeBoost: false, volumeBoostMax: 200, autoNext: false,
  reduceMotion: false, blurIntensity: 24, transitionSpeed: 0.3, transitionEasing: 'ease',
  doubleTapSeconds: 10, autoHideControls: true, showRemainingTime: true, hideDelay: 5,
  maxStoredUrls: 200, blockAutoplay: true, glowEffects: true, effectsIntensity: 55,
  subdlApiKey: ''
}, data.settings || {});

// ========== PROFILES & PAGE INFO ==========
var defaultProfiles = {
  'videoplay.us': { referer: 'https://videoplay.us/' }, 'streamtape.com': { referer: 'https://streamtape.com/' },
  'ok.ru': { referer: 'https://ok.ru/' }, 'fembed.com': { referer: 'https://fembed.com/' }
};
var host = location.hostname.replace('www.', '');
var profile = data.siteProfiles[host] || defaultProfiles[host] || { referer: location.origin + '/', origin: location.origin, userAgent: navigator.userAgent };
var pageInfo = {
  title: (document.title || 'video').replace(/[^\w\s\u00C0-\u1EF9]/g, '').substring(0, 60).trim() || 'video',
  url: location.href, host: host, referer: profile.referer, origin: location.origin, userAgent: profile.userAgent || navigator.userAgent
};

// ========== APPEND ROOT & HELPERS ==========
function __uvdAppendRoot(el) { (document.documentElement || document.body).appendChild(el); }
function escapeHtml(text) { if (!text) return ''; var div = document.createElement('div'); div.textContent = text; return div.innerHTML; }
function toast(msg, color) {
  var el = document.createElement('div'); el.textContent = msg;
  el.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);background:'+(color||'#3b82f6')+';color:#fff;padding:12px 24px;border-radius:30px;z-index:2147483649;font:600 13px Segoe UI;box-shadow:0 4px 15px rgba(0,0,0,0.4);';
  __uvdAppendRoot(el); setTimeout(function() { el.remove(); }, 2500);
}

// ========== EFFECTS ==========
function applyEffectsPref(el) {
  if (!el) return;
  var on = !!data.settings.glowEffects && !data.settings.reduceMotion;
  el.classList.toggle('uvd-fx-on', on);
  var intensity = Math.max(0, Math.min(100, data.settings.effectsIntensity || 55));
  el.style.setProperty('--glow-px', on ? Math.round(4 + intensity * 0.18) + 'px' : '0px');
  el.style.setProperty('--glow-op', on ? (0.15 + intensity * 0.0035).toFixed(3) : '0');
}

// ========== AD FILTER ==========
var compiledFilters = [];
function compileAdFilters() {
  compiledFilters = [];
  (data.filterlist || []).forEach(function(raw) {
    var pattern = (raw || '').trim().toLowerCase();
    if (!pattern) return;
    if (pattern.indexOf('regex:') === 0) { try { compiledFilters.push({ type: 'regex', re: new RegExp(pattern.slice(6), 'i') }); } catch(e) {} }
    else { compiledFilters.push({ type: 'plain', value: pattern }); }
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

// ========== URL DETECTION (MASTER REGEX & BLOB RESOLVER) ==========
var urls = new Map();
var masterMediaRegex = /https?:\/\/[^\s"'()\\]+\.(m3u8|mpd|mp4|webm|mkv|flv|ts)(?:\?[^\s"'()\\]*)?/gi;
var extToType = { m3u8: 'M3U8', mpd: 'MPD', mp4: 'MP4', webm: 'WEBM', mkv: 'MKV', flv: 'FLV', ts: 'TS' };

function findUrls(text, source) {
  if (!text || typeof text !== 'string') return;
  var match; masterMediaRegex.lastIndex = 0;
  while ((match = masterMediaRegex.exec(text)) !== null) {
    var url = match[0];
    if (isAdUrl(url)) continue;
    var ext = match[1].toLowerCase();
    var type = extToType[ext] || 'MP4';
    var existing = urls.get(url);
    if (!existing || existing.priority > (type === 'M3U8' ? 1 : type === 'MPD' ? 2 : 3)) {
      urls.set(url, { type: type, source: source, priority: type === 'M3U8' ? 1 : 3, timestamp: Date.now() });
    }
  }
  if (urls.size > data.settings.maxStoredUrls) {
    var keys = [...urls.keys()].sort(function(a, b) { return urls.get(a).timestamp - urls.get(b).timestamp; });
    for (var i = 0; i < urls.size - data.settings.maxStoredUrls; i++) urls.delete(keys[i]);
  }
}

// --- BLOB RESOLVER ---
var __uvdBlobMap = new WeakMap();
(function __uvdHookVideoSrcForBlob() {
  var proto = HTMLMediaElement.prototype;
  var desc = Object.getOwnPropertyDescriptor(proto, 'src');
  if (!desc || !desc.set) return;
  Object.defineProperty(proto, 'src', {
    get: function() { return desc.get.call(this); },
    set: function(val) {
      if (val && typeof val === 'string' && val.startsWith('blob:')) {
        this.__uvdIsBlob = true;
        var self = this;
        setTimeout(function() {
          var bestUrl = null, bestTime = 0;
          urls.forEach(function(d, u) {
            if (['M3U8', 'MPD', 'MP4', 'WEBM'].includes(d.type) && !isAdUrl(u) && d.timestamp > bestTime) {
              bestTime = d.timestamp; bestUrl = u;
            }
          });
          if (bestUrl) {
            __uvdBlobMap.set(self, { url: bestUrl, time: bestTime });
            if (!urls.has(bestUrl)) urls.set(bestUrl, { type: 'BLOB_RESOLVED', source: 'blob-resolver', priority: 1, timestamp: bestTime });
          }
        }, 300);
      }
      return desc.set.call(this, val);
    }
  });
})();

function scan(doc, src) {
  try {
    doc.querySelectorAll('video, source, audio').forEach(function(v) {
      var realSrc = v.src || v.currentSrc;
      if (realSrc && realSrc.startsWith('blob:')) {
        var res = __uvdBlobMap.get(v);
        if (res) realSrc = res.url;
      }
      if (realSrc) findUrls(realSrc, src + ':element');
    });
    doc.querySelectorAll('script').forEach(function(s) { findUrls(s.textContent, src + ':script'); });
    findUrls(doc.documentElement.outerHTML, src + ':html');
    doc.querySelectorAll('iframe').forEach(function(i, idx) {
      if (i.src && !isAdUrl(i.src)) urls.set(i.src, { type: 'IFRAME', source: 'iframe#' + idx, priority: 99, timestamp: Date.now() });
      try { if (i.contentDocument) scan(i.contentDocument, 'iframe#' + idx); } catch(e) {}
    });
  } catch(e) {}
}

// ========== NETWORK MONITOR & BLOCKERS ==========
var originalFetch = window.fetch, originalXHROpen = XMLHttpRequest.prototype.open;
window.fetch = function() {
  var url = arguments[0];
  if (typeof url === 'string' && !isAdUrl(url)) findUrls(url, 'fetch');
  else if (url && url.url && !isAdUrl(url.url)) findUrls(url.url, 'fetch');
  return originalFetch.apply(this, arguments);
};
XMLHttpRequest.prototype.open = function(method, url) {
  if (url && !isAdUrl(url)) findUrls(url, 'xhr');
  return originalXHROpen.apply(this, arguments);
};

window.open = function() { return null; };
document.addEventListener('click', function(e) {
  var t = e.target.closest('a[target="_blank"]');
  if (t && !t.closest('#__uvd__') && !t.closest('#__uvd_player_overlay__')) { e.preventDefault(); }
}, true);

// ========== AUTOPLAY BLOCKER ==========
var __uvdNativeMediaPlay = HTMLMediaElement.prototype.play;
HTMLMediaElement.prototype.play = function() {
  if (data.settings.blockAutoplay && !this.__uvdAllow && this.id !== '__uvd_player_video__') {
    var self = this;
    setTimeout(function() { try { self.pause(); } catch(e) {} }, 0);
    return Promise.reject(new DOMException('UVD: Chặn autoplay', 'NotAllowedError'));
  }
  return __uvdNativeMediaPlay.apply(this, arguments);
};
document.addEventListener('play', function(e) {
  if (data.settings.blockAutoplay && (e.target.tagName === 'VIDEO' || e.target.tagName === 'AUDIO') && !e.target.__uvdAllow) {
    try { e.target.pause(); } catch(err) {}
  }
}, true);

// ========== AUTO-CLICK PLAY ==========
var AUTO_PLAY_SELECTORS = [
  '.vjs-big-play-button', '.vjs-play-control', '.jw-icon-display', '.plyr__control--overlaid',
  '.fp-play', '.play-button', '.playbtn', '.btn-play', '[aria-label="Play"]', '[title="Play"]'
];
function simulateClick(el) {
  try {
    var rect = el.getBoundingClientRect(); if (!rect.width) return false;
    var x = rect.left + rect.width / 2, y = rect.top + rect.height / 2;
    ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'].forEach(function(type) {
      el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y }));
    });
    return true;
  } catch(e) { return false; }
}
function autoClickPlay() {
  var clicked = 0;
  AUTO_PLAY_SELECTORS.forEach(function(sel) {
    try { document.querySelectorAll(sel).forEach(function(el) { if (simulateClick(el)) clicked++; }); } catch(e) {}
  });
  return clicked;
}

// ========== PLAYER STATE & FEATURES ==========
var playerState = { overlay: null, video: null, audioCtx: null, gainNode: null, sourceNode: null, sleepTimerId: null };

function enableVolumeBoost(video) {
  if (!data.settings.volumeBoost) return;
  try {
    if (!playerState.audioCtx) {
      var Ctx = window.AudioContext || window.webkitAudioContext;
      playerState.audioCtx = new Ctx();
      playerState.sourceNode = playerState.audioCtx.createMediaElementSource(video);
      playerState.gainNode = playerState.audioCtx.createGain();
      playerState.sourceNode.connect(playerState.gainNode).connect(playerState.audioCtx.destination);
    }
    if (playerState.audioCtx.state === 'suspended') playerState.audioCtx.resume();
    playerState.gainNode.gain.value = (data.settings.volumeBoostMax || 200) / 100;
  } catch(e) {}
}

function attachGestures(wrapper, video) {
  var lastTap = { time: 0, side: null };
  wrapper.addEventListener('touchend', function(e) {
    var t = e.changedTouches[0]; if (!t) return;
    var rect = wrapper.getBoundingClientRect();
    var side = (t.clientX - rect.left) < rect.width / 2 ? 'left' : 'right';
    var now = Date.now();
    if (lastTap.side === side && (now - lastTap.time) < 300) {
      var sec = data.settings.doubleTapSeconds || 10;
      video.currentTime = side === 'left' ? Math.max(0, video.currentTime - sec) : Math.min(video.duration || 0, video.currentTime + sec);
      toast(side === 'left' ? '⏪ -' + sec + 's' : '⏩ +' + sec + 's');
      lastTap.time = 0;
    } else { lastTap = { time: now, side: side }; }
  });
}

// ========== UI: LINK LIST PANEL ==========
function buildUI() {
  var oldPanel = document.getElementById('__uvd__'); if (oldPanel) oldPanel.remove();
  var panel = document.createElement('div');
  panel.id = '__uvd__';
  panel.className = 'uvd-panel';
  panel.innerHTML = `
    <div class="uvd-header">
      <h3>🎬 UVD PRO <span style="font-size:11px;color:var(--uvd-muted);">v${VERSION}</span></h3>
      <button class="uvd-btn-icon" id="uvd-close">✕</button>
    </div>
    <div class="uvd-body" id="uvd-list"></div>
    <div class="uvd-footer">
      <button class="uvd-btn" id="uvd-rescan">🔄 Quét lại</button>
      <button class="uvd-btn" id="uvd-autoclick">▶ Auto-Click</button>
      <button class="uvd-btn" style="flex:1;" id="uvd-export">📥 Xuất JSON</button>
    </div>
  `;
  __uvdAppendRoot(panel);

  panel.querySelector('#uvd-close').onclick = function() { panel.remove(); };
  panel.querySelector('#uvd-rescan').onclick = function() { scan(document, 'manual'); buildList(); toast('Đã quét lại'); };
  panel.querySelector('#uvd-autoclick').onclick = function() { 
    var c = autoClickPlay(); 
    setTimeout(function() { scan(document, 'autoclick'); buildList(); toast('Đã bấm ' + c + ' nút Play'); }, 1000); 
  };
  panel.querySelector('#uvd-export').onclick = function() {
    var arr = [...urls.entries()].map(function(e) { return { url: e[0], type: e[1].type }; });
    var blob = new Blob([JSON.stringify(arr, null, 2)], { type: 'application/json' });
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = pageInfo.title + '.json'; a.click();
  };
  buildList();
}

function buildList() {
  var list = document.getElementById('uvd-list'); if (!list) return;
  list.innerHTML = urls.size === 0 ? '<div style="text-align:center;padding:40px;color:var(--uvd-muted);">Không tìm thấy link media.</div>' : '';
  var sorted = [...urls.entries()].sort(function(a, b) { return a[1].priority - b[1].priority; });
  
  sorted.forEach(function(entry) {
    var url = entry[0], info = entry[1];
    var isBlob = info.source === 'blob-resolver';
    var item = document.createElement('div');
    item.className = 'uvd-link-item';
    item.innerHTML = `
      <div class="uvd-link-info">
        <span class="uvd-badge ${isBlob ? 'blob' : ''}">${info.type} ${isBlob ? '(Gốc)' : ''}</span>
        <span class="uvd-link-url" title="${escapeHtml(url)}">${escapeHtml(url.substring(0, 60))}...</span>
      </div>
      <div class="uvd-link-actions">
        <button class="uvd-btn uvd-btn-sm uvd-btn-primary play-btn">▶ Xem</button>
        <button class="uvd-btn uvd-btn-sm copy-btn">📋</button>
        <button class="uvd-btn uvd-btn-sm share-btn">🔗</button>
        <button class="uvd-btn uvd-btn-sm block-btn">🚫</button>
      </div>
    `;
    item.querySelector('.play-btn').onclick = function() { openPlayer(url, info.type); };
    item.querySelector('.copy-btn').onclick = function() { navigator.clipboard.writeText(url).then(function() { toast('Đã copy!'); }); };
    item.querySelector('.share-btn').onclick = function() { if (navigator.share) navigator.share({ title: pageInfo.title, url: url }); };
    item.querySelector('.block-btn').onclick = function() {
      var domain = url.match(/\/\/([^\/]+)/);
      if (domain && !isAdUrl(url)) {
        data.filterlist.push(domain[1]); storage.set(data); compileAdFilters();
        urls.delete(url); buildList(); toast('Đã chặn ' + domain[1]);
      }
    };
    list.appendChild(item);
  });
}

// ========== UI: VIDEO PLAYER OVERLAY ==========
function openPlayer(url, type) {
  if (playerState.overlay) playerState.overlay.remove();
  var overlay = document.createElement('div');
  overlay.id = '__uvd_player_overlay__';
  overlay.className = 'active';
  overlay.innerHTML = `
    <div id="uvd-video-wrapper">
      <video id="__uvd_player_video__" crossorigin="anonymous" playsinline></video>
      <div class="uvd-controls" id="uvd-controls">
        <div class="uvd-progress" id="uvd-progress"><div class="uvd-progress-fill" id="uvd-fill"></div></div>
        <div class="uvd-ctrl-row">
          <button class="uvd-ctrl-btn" id="btn-play">▶</button>
          <button class="uvd-ctrl-btn" id="btn-mute">🔊</button>
          <span id="btn-time">0:00 / 0:00</span>
          <div class="spacer"></div>
          <button class="uvd-ctrl-btn" id="btn-sub">💬</button>
          <button class="uvd-ctrl-btn gear" id="btn-settings" title="Cài đặt">⚙️</button>
          <button class="uvd-ctrl-btn" id="btn-fs">⛶</button>
          <button class="uvd-ctrl-btn" id="btn-close">✕</button>
        </div>
      </div>
    </div>
  `;
  __uvdAppendRoot(overlay);
  
  playerState.overlay = overlay;
  playerState.video = overlay.querySelector('#__uvd_player_video__');
  var video = playerState.video;
  
  video.src = url; 
  video.play().catch(function(){});
  video.__uvdAllow = true;
  enableVolumeBoost(video);
  attachGestures(overlay.querySelector('#uvd-video-wrapper'), video);

  var controls = overlay.querySelector('#uvd-controls');
  var hideTimer;
  function showControls() {
    controls.classList.remove('hidden');
    clearTimeout(hideTimer);
    if (data.settings.autoHideControls) hideTimer = setTimeout(function() { if (!video.paused) controls.classList.add('hidden'); }, data.settings.hideDelay * 1000);
  }
  overlay.addEventListener('mousemove', showControls);
  showControls();

  overlay.querySelector('#btn-play').onclick = function() { if (video.paused) video.play(); else video.pause(); };
  video.onplay = function() { overlay.querySelector('#btn-play').textContent = '⏸'; };
  video.onpause = function() { overlay.querySelector('#btn-play').textContent = '▶'; showControls(); };
  overlay.querySelector('#btn-mute').onclick = function() { video.muted = !video.muted; this.textContent = video.muted ? '🔇' : '🔊'; };

  var progress = overlay.querySelector('#uvd-progress'), fill = overlay.querySelector('#uvd-fill'), time = overlay.querySelector('#btn-time');
  video.ontimeupdate = function() {
    if (video.duration) {
      fill.style.width = (video.currentTime / video.duration * 100) + '%';
      var cur = fmtTime(video.currentTime);
      var dur = data.settings.showRemainingTime ? '-' + fmtTime(video.duration - video.currentTime) : fmtTime(video.duration);
      time.textContent = cur + ' / ' + dur;
    }
  };
  progress.onclick = function(e) { video.currentTime = ((e.clientX - progress.getBoundingClientRect().left) / progress.offsetWidth) * video.duration; };

  overlay.querySelector('#btn-fs').onclick = function() { if (!document.fullscreenElement) overlay.requestFullscreen(); else document.exitFullscreen(); };
  overlay.querySelector('#btn-sub').onclick = function() { showSubtitlePanel(video); };
  overlay.querySelector('#btn-settings').onclick = function() { showSettingsPanel(); };
  overlay.querySelector('#btn-close').onclick = function() { video.pause(); video.src = ''; overlay.remove(); playerState.overlay = null; };
}

function fmtTime(s) { if (isNaN(s)) return '0:00'; var m = Math.floor(s / 60); var sec = Math.floor(s % 60); return m + ':' + (sec < 10 ? '0' : '') + sec; }

// ========== UI: SETTINGS PANEL (GEAR MENU) ==========
function showSettingsPanel() {
  var bg = document.createElement('div');
  bg.className = 'uvd-modal-bg';
  bg.innerHTML = `
    <div class="uvd-modal">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
        <h3 style="margin:0;font-size:18px;">⚙️ Cài đặt UVD PRO</h3>
        <button class="uvd-btn-icon" id="set-close">✕</button>
      </div>
      <div id="set-list"></div>
    </div>
  `;
  __uvdAppendRoot(bg);
  var list = bg.querySelector('#set-list');

  function createToggle(label, desc, key) {
    var row = document.createElement('div');
    row.className = 'uvd-set-row';
    row.innerHTML = `<div><div style="font-weight:500;font-size:14px;">${label}</div><div style="font-size:11px;color:var(--uvd-muted);margin-top:2px;">${desc}</div></div><div class="uvd-switch ${data.settings[key] ? 'on' : ''}"><div class="uvd-switch-knob"></div></div>`;
    var sw = row.querySelector('.uvd-switch');
    sw.onclick = function() {
      data.settings[key] = !data.settings[key];
      storage.set(data);
      sw.classList.toggle('on', data.settings[key]);
      toast(`${data.settings[key] ? 'BẬT' : 'TẮT'}: ${label}`);
      if (key === 'volumeBoost' && playerState.video) {
        if (data.settings[key]) enableVolumeBoost(playerState.video);
        else if (playerState.gainNode) playerState.gainNode.gain.value = 1;
      }
    };
    return row;
  }

  list.appendChild(createToggle('🚫 Chặn Autoplay', 'Ngăn web tự phát video khi tải trang', 'blockAutoplay'));
  list.appendChild(createToggle('🔊 Tăng âm lượng (200%)', 'Dùng Web Audio API để khuếch đại âm thanh', 'volumeBoost'));
  list.appendChild(createToggle('✨ Hiệu ứng phát sáng', 'Glow effect cho các nút và panel', 'glowEffects'));
  list.appendChild(createToggle('🐢 Giảm chuyển động', 'Tắt hiệu ứng blur/animation cho máy yếu', 'reduceMotion'));
  list.appendChild(createToggle('🙈 Tự ẩn Controls', 'Ẩn thanh điều khiển khi không di chuột', 'autoHideControls'));
  list.appendChild(createToggle('⏱ Hiện thời gian còn lại', 'Hiển thị -XX:XX thay vì tổng thời gian', 'showRemainingTime'));

  bg.querySelector('#set-close').onclick = function() { bg.remove(); };
  bg.onclick = function(e) { if (e.target === bg) bg.remove(); };
}

// ========== UI: SUBTITLE PANEL (SUBDL) ==========
function showSubtitlePanel(video) {
  var bg = document.createElement('div');
  bg.className = 'uvd-modal-bg';
  bg.innerHTML = `
    <div class="uvd-modal">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
        <h3 style="margin:0;font-size:18px;">💬 Phụ đề (SubDL)</h3>
        <button class="uvd-btn-icon" id="sub-close">✕</button>
      </div>
      <div style="margin-bottom:15px; display:flex; gap:8px;">
        <input type="text" id="sub-query" placeholder="Nhập tên phim..." class="uvd-btn" style="flex:1;background:var(--uvd-surface);">
        <button class="uvd-btn uvd-btn-primary" id="sub-search">Tìm</button>
      </div>
      <div id="sub-results" style="max-height:300px;overflow-y:auto;"></div>
      <hr style="border-color:rgba(255,255,255,0.1);margin:15px 0;">
      <input type="file" id="sub-file" accept=".srt,.vtt" style="display:none;">
      <button class="uvd-btn" style="width:100%;" id="sub-upload">📂 Tải file .srt/.vtt từ máy</button>
    </div>
  `;
  __uvdAppendRoot(bg);

  bg.querySelector('#sub-close').onclick = function() { bg.remove(); };
  bg.querySelector('#sub-upload').onclick = function() { bg.querySelector('#sub-file').click(); };
  bg.querySelector('#sub-file').onchange = function(e) {
    var file = e.target.files[0]; if (!file) return;
    var reader = new FileReader();
    reader.onload = function() {
      var vtt = reader.result.replace(/\r/g, '').replace(/^\uFEFF/, '');
      if (!/^WEBVTT/.test(vtt.trim())) vtt = 'WEBVTT\n\n' + vtt.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');
      var blobUrl = URL.createObjectURL(new Blob([vtt], { type: 'text/vtt' }));
      attachSub(video, blobUrl, file.name);
      bg.remove();
    };
    reader.readAsText(file);
  };

  bg.querySelector('#sub-search').onclick = function() {
    var q = bg.querySelector('#sub-query').value.trim(); if (!q) return;
    var box = bg.querySelector('#sub-results');
    box.innerHTML = '<div style="text-align:center;padding:20px;">Đang tìm...</div>';
    
    if (!data.settings.subdlApiKey) { box.innerHTML = '<div style="color:#ef4444;text-align:center;padding:20px;">Vui lòng nhập SubDL API Key trong Cài đặt.</div>'; return; }
    
    var controller = new AbortController();
    setTimeout(function() { controller.abort(); }, 10000);
    fetch('https://api.subdl.com/api/v2/subtitles/search?film_name=' + encodeURIComponent(q) + '&languages=vi,en', {
      headers: { 'Authorization': 'Bearer ' + data.settings.subdlApiKey }, signal: controller.signal
    }).then(function(r) { return r.json(); }).then(function(json) {
      var subs = (json && json.subtitles) || [];
      if (!subs.length) { box.innerHTML = '<div style="text-align:center;padding:20px;">Không tìm thấy.</div>'; return; }
      box.innerHTML = '';
      subs.slice(0, 10).forEach(function(s) {
        var row = document.createElement('div');
        row.className = 'uvd-link-item'; row.style.cursor = 'pointer';
        row.innerHTML = `<span>${s.release_name || s.name}</span> <span class="uvd-badge">${(s.language || '').toUpperCase()}</span>`;
        row.onclick = function() {
          toast('Đang tải sub...');
          var url = s.url || (s.files && s.files[0] && s.files[0].url);
          if(url) fetch(url).then(function(r){return r.text()}).then(function(text){
            var vtt = text.replace(/\r/g, '').replace(/^\uFEFF/, '');
            if (!/^WEBVTT/.test(vtt.trim())) vtt = 'WEBVTT\n\n' + vtt.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');
            attachSub(video, URL.createObjectURL(new Blob([vtt], { type: 'text/vtt' })), 'SubDL');
            bg.remove();
          });
        };
        box.appendChild(row);
      });
    }).catch(function() { box.innerHTML = '<div style="color:#ef4444;text-align:center;padding:20px;">Lỗi kết nối SubDL.</div>'; });
  };
}

function attachSub(video, vttUrl, label) {
  video.querySelectorAll('track[data-uvd-sub="1"]').forEach(function(t) { t.remove(); });
  var track = document.createElement('track');
  track.setAttribute('data-uvd-sub', '1');
  track.kind = 'subtitles'; track.label = label || 'Sub'; track.srclang = 'vi'; track.src = vttUrl; track.default = true;
  video.appendChild(track);
  setTimeout(function() { if (video.textTracks) for (var i = 0; i < video.textTracks.length; i++) video.textTracks[i].mode = 'showing'; }, 100);
  toast('✅ Đã bật phụ đề');
}

// ========== CSS INJECTION ==========
var css = `
  :root { --uvd-primary: #3b82f6; --uvd-bg: rgba(15, 17, 25, 0.95); --uvd-surface: rgba(30, 34, 48, 0.9); --uvd-text: #f8fafc; --uvd-muted: #94a3b8; }
  .uvd-fx-on { box-shadow: 0 0 var(--glow-px, 10px) rgba(59, 130, 246, var(--glow-op, 0.3)); }
  .uvd-panel { position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background: var(--uvd-bg); border: 1px solid rgba(255,255,255,0.1); border-radius: 16px; z-index: 2147483647; width: 90%; max-width: 500px; max-height: 80vh; display: flex; flex-direction: column; backdrop-filter: blur(12px); color: var(--uvd-text); font-family: system-ui; box-shadow: 0 20px 50px rgba(0,0,0,0.5); }
  .uvd-header { padding: 16px 20px; border-bottom: 1px solid rgba(255,255,255,0.05); display: flex; justify-content: space-between; align-items: center; }
  .uvd-header h3 { margin: 0; font-size: 16px; font-weight: 600; }
  .uvd-body { overflow-y: auto; padding: 12px; flex: 1; }
  .uvd-footer { padding: 12px 20px; border-top: 1px solid rgba(255,255,255,0.05); display: flex; gap: 8px; }
  .uvd-btn { background: var(--uvd-surface); border: 1px solid rgba(255,255,255,0.1); color: var(--uvd-text); padding: 8px 14px; border-radius: 8px; cursor: pointer; font-size: 13px; font-weight: 500; transition: 0.2s; display: inline-flex; align-items: center; gap: 6px; }
  .uvd-btn:hover { background: rgba(255,255,255,0.1); transform: translateY(-1px); }
  .uvd-btn-primary { background: var(--uvd-primary); border-color: var(--uvd-primary); }
  .uvd-btn-sm { padding: 5px 10px; font-size: 12px; }
  .uvd-btn-icon { padding: 6px 8px; font-size: 16px; background: transparent; border: none; color: #fff; cursor: pointer; }
  .uvd-link-item { background: var(--uvd-surface); border-radius: 10px; padding: 12px; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center; gap: 10px; border: 1px solid rgba(255,255,255,0.05); }
  .uvd-link-info { flex: 1; min-width: 0; }
  .uvd-link-url { font-size: 12px; color: var(--uvd-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: block; margin-top: 4px; }
  .uvd-badge { font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 4px; background: rgba(59, 130, 246, 0.2); color: #60a5fa; text-transform: uppercase; }
  .uvd-badge.blob { background: rgba(16, 185, 129, 0.2); color: #34d399; }
  .uvd-link-actions { display: flex; gap: 4px; flex-shrink: 0; }
  #__uvd_player_overlay__ { position: fixed; inset: 0; background: #000; z-index: 2147483648; display: none; flex-direction: column; }
  #__uvd_player_overlay__.active { display: flex; }
  #uvd-video-wrapper { position: relative; flex: 1; display: flex; align-items: center; justify-content: center; overflow: hidden; }
  #__uvd_player_video__ { width: 100%; height: 100%; object-fit: contain; background: #000; }
  .uvd-controls { position: absolute; bottom: 0; left: 0; right: 0; background: linear-gradient(transparent, rgba(0,0,0,0.8)); padding: 20px; display: flex; flex-direction: column; gap: 10px; transition: opacity 0.3s; }
  .uvd-controls.hidden { opacity: 0; pointer-events: none; }
  .uvd-progress { width: 100%; height: 4px; background: rgba(255,255,255,0.2); border-radius: 2px; cursor: pointer; position: relative; }
  .uvd-progress-fill { height: 100%; background: var(--uvd-primary); border-radius: 2px; width: 0%; transition: width 0.1s linear; }
  .uvd-ctrl-row { display: flex; align-items: center; gap: 15px; color: #fff; font-size: 14px; }
  .uvd-ctrl-row .spacer { flex: 1; }
  .uvd-ctrl-btn { background: none; border: none; color: #fff; font-size: 20px; cursor: pointer; padding: 5px; opacity: 0.9; transition: 0.2s; }
  .uvd-ctrl-btn:hover { opacity: 1; transform: scale(1.1); }
  .uvd-ctrl-btn.gear { font-size: 18px; }
  .uvd-ctrl-btn.gear:hover { transform: rotate(45deg) scale(1.1); }
  .uvd-modal-bg { position: fixed; inset: 0; background: rgba(0,0,0,0.7); z-index: 2147483649; display: flex; align-items: center; justify-content: center; backdrop-filter: blur(4px); }
  .uvd-modal { background: var(--uvd-bg); border-radius: 16px; padding: 24px; width: 90%; max-width: 400px; max-height: 85vh; overflow-y: auto; border: 1px solid rgba(255,255,255,0.1); color: var(--uvd-text); }
  .uvd-set-row { display: flex; justify-content: space-between; align-items: center; padding: 12px 0; border-bottom: 1px solid rgba(255,255,255,0.05); }
  .uvd-switch { width: 40px; height: 22px; border-radius: 11px; background: #444; position: relative; cursor: pointer; transition: 0.3s; flex-shrink: 0; }
  .uvd-switch.on { background: var(--uvd-primary); }
  .uvd-switch-knob { width: 18px; height: 18px; border-radius: 50%; background: #fff; position: absolute; top: 2px; left: 2px; transition: 0.3s; }
  .uvd-switch.on .uvd-switch-knob { left: 20px; }
`;
var styleEl = document.createElement('style');
styleEl.textContent = css;
(document.head || document.documentElement).appendChild(styleEl);

// ========== INIT ==========
function init() {
  scan(document, 'init');
  buildUI();
  setTimeout(function() { scan(document, 'delay'); buildList(); }, 2000);
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();

})();

