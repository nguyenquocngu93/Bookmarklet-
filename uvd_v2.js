javascript:(function(){
'use strict';

/* ============================================================
   UVD v2 — quét link video + phát bằng Video.js v10
   Viết lại hoàn toàn: không kế thừa code/kiến trúc bản cũ.
   ============================================================ */

var VERSION = '2.0.0';
var ROOT_ID = '__uvd2_root__';

// ---------- Dọn instance cũ nếu có ----------
var old = document.getElementById(ROOT_ID);
if (old) { old.remove(); if (window.__uvd2Cleanup) { try { window.__uvd2Cleanup(); } catch(e){} } }
var cleanupFns = [];
function onCleanup(fn) { cleanupFns.push(fn); }
window.__uvd2Cleanup = function() { cleanupFns.forEach(function(fn){ try { fn(); } catch(e){} }); };

// ---------- State ----------
var found = new Map(); // url -> {type, title}
var pageTitle = (document.title || 'video').trim().slice(0, 80);

// ---------- CSS ----------
var style = document.createElement('style');
style.id = '__uvd2_style__';
style.textContent = [
':root{',
'--uvd2-bg:rgba(252,247,255,0.88);--uvd2-glass:rgba(255,255,255,0.62);--uvd2-card:rgba(255,255,255,0.55);',
'--uvd2-border:rgba(90,40,120,0.14);--uvd2-text:#3a1e5c;--uvd2-text2:#7a5c96;--uvd2-text3:#a893c0;',
'--uvd2-on-dark:#f5f2ff;--uvd2-accent:#9b5cff;--uvd2-accent2:#ff8fd6;--uvd2-danger:#ff5d8a;',
'--uvd2-grad:linear-gradient(135deg,var(--uvd2-accent),var(--uvd2-accent2));',
'--uvd2-r-sm:14px;--uvd2-r-md:20px;--uvd2-r-lg:28px;',
'--uvd2-shadow:0 20px 50px rgba(90,40,120,0.18),0 2px 10px rgba(90,40,120,0.08);',
'}',
'#'+ROOT_ID+' *{box-sizing:border-box;font-family:-apple-system,BlinkMacSystemFont,"SF Pro Display","Segoe UI",Roboto,sans-serif;}',

/* Floating action button */
'.uvd2-fab{position:fixed;right:18px;bottom:calc(18px + env(safe-area-inset-bottom,0px));width:58px;height:58px;border-radius:50%;',
'background:var(--uvd2-grad);box-shadow:0 10px 30px rgba(155,92,255,0.45);border:none;color:#fff;font-size:24px;',
'z-index:2147483000;display:flex;align-items:center;justify-content:center;cursor:pointer;transition:transform .2s ease;}',
'.uvd2-fab:active{transform:scale(0.92);}',
'.uvd2-fab-badge{position:absolute;top:-2px;right:-2px;background:#fff;color:var(--uvd2-accent);border-radius:999px;',
'min-width:22px;height:22px;font-size:12px;font-weight:800;display:flex;align-items:center;justify-content:center;',
'box-shadow:0 2px 8px rgba(0,0,0,0.25);padding:0 5px;}',

/* Bottom sheet */
'.uvd2-sheet-backdrop{position:fixed;inset:0;background:rgba(30,10,50,0.35);backdrop-filter:blur(2px);z-index:2147483001;',
'opacity:0;transition:opacity .25s ease;}',
'.uvd2-sheet-backdrop.uvd2-show{opacity:1;}',
'.uvd2-sheet{position:fixed;left:0;right:0;bottom:0;max-height:82vh;background:var(--uvd2-bg);backdrop-filter:blur(28px) saturate(150%);',
'-webkit-backdrop-filter:blur(28px) saturate(150%);border-radius:28px 28px 0 0;box-shadow:var(--uvd2-shadow);',
'z-index:2147483002;transform:translateY(100%);transition:transform .32s cubic-bezier(.32,.72,0,1);',
'display:flex;flex-direction:column;border-top:1px solid var(--uvd2-border);}',
'.uvd2-sheet.uvd2-show{transform:translateY(0);}',
'.uvd2-sheet-handle{width:40px;height:5px;background:var(--uvd2-border);border-radius:999px;margin:10px auto 4px;flex-shrink:0;}',
'.uvd2-sheet-head{display:flex;align-items:center;justify-content:space-between;padding:10px 18px 14px;flex-shrink:0;}',
'.uvd2-sheet-title{font-weight:800;font-size:17px;color:var(--uvd2-text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:80%;}',
'.uvd2-icon-btn{width:34px;height:34px;border-radius:50%;background:var(--uvd2-card);border:1px solid var(--uvd2-border);',
'color:var(--uvd2-text2);display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:16px;flex-shrink:0;}',
'.uvd2-sheet-body{overflow-y:auto;padding:0 14px 24px;flex:1;}',
'.uvd2-empty{text-align:center;padding:50px 20px;color:var(--uvd2-text3);font-size:13px;}',

/* Listing card */
'.uvd2-card{background:var(--uvd2-card);border:1px solid var(--uvd2-border);border-radius:var(--uvd2-r-md);',
'padding:14px;margin-bottom:10px;box-shadow:0 8px 20px rgba(90,40,120,0.08);animation:uvd2In .3s ease both;}',
'@keyframes uvd2In{from{opacity:0;transform:translateY(8px);}to{opacity:1;transform:translateY(0);}}',
'.uvd2-card-top{display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;}',
'.uvd2-chip{display:inline-block;padding:4px 10px;border-radius:999px;font-size:10px;font-weight:800;letter-spacing:.03em;',
'background:rgba(155,92,255,0.14);color:var(--uvd2-accent);}',
'.uvd2-card-url{font-size:11px;color:var(--uvd2-text3);font-family:ui-monospace,Consolas,monospace;white-space:nowrap;',
'overflow:hidden;text-overflow:ellipsis;margin-bottom:10px;}',
'.uvd2-cta{width:100%;background:var(--uvd2-grad);color:#fff;border:none;padding:12px;border-radius:999px;',
'font-weight:800;font-size:13px;cursor:pointer;box-shadow:0 6px 16px rgba(155,92,255,0.35);}',
'.uvd2-cta:active{transform:scale(0.97);}',

/* Player overlay */
'.uvd2-player{position:fixed;inset:0;background:#000;z-index:2147483003;display:flex;flex-direction:column;}',
'.uvd2-player-head{display:flex;align-items:center;justify-content:space-between;padding:12px 14px;',
'background:rgba(10,5,20,0.6);flex-shrink:0;}',
'.uvd2-player-title{color:var(--uvd2-on-dark);font-size:13px;font-weight:700;overflow:hidden;text-overflow:ellipsis;',
'white-space:nowrap;max-width:80%;}',
'.uvd2-player-close{width:34px;height:34px;border-radius:50%;background:rgba(255,93,138,0.25);border:1px solid rgba(255,93,138,0.4);',
'color:var(--uvd2-on-dark);font-size:16px;display:flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0;}',
'.uvd2-player-body{flex:1;display:flex;align-items:center;justify-content:center;overflow:hidden;position:relative;}'
].join('');
document.head.appendChild(style);
onCleanup(function(){ var s = document.getElementById('__uvd2_style__'); if (s) s.remove(); });

// ---------- Root container ----------
var root = document.createElement('div');
root.id = ROOT_ID;
document.documentElement.appendChild(root);
onCleanup(function(){ root.remove(); });

// ---------- FAB ----------
var fab = document.createElement('button');
fab.className = 'uvd2-fab';
fab.textContent = '▶';
root.appendChild(fab);
var badge = document.createElement('span');
badge.className = 'uvd2-fab-badge';
badge.textContent = '0';
badge.style.display = 'none';
fab.appendChild(badge);

function updateBadge() {
  var n = found.size;
  badge.textContent = n > 99 ? '99+' : String(n);
  badge.style.display = n > 0 ? 'flex' : 'none';
}

// ---------- Bottom sheet ----------
var backdrop = document.createElement('div');
backdrop.className = 'uvd2-sheet-backdrop';
root.appendChild(backdrop);

var sheet = document.createElement('div');
sheet.className = 'uvd2-sheet';
sheet.innerHTML =
  '<div class="uvd2-sheet-handle"></div>' +
  '<div class="uvd2-sheet-head">' +
    '<span class="uvd2-sheet-title">' + esc(pageTitle) + '</span>' +
    '<button class="uvd2-icon-btn" id="__uvd2_close_sheet__">✕</button>' +
  '</div>' +
  '<div class="uvd2-sheet-body" id="__uvd2_list__"></div>';
root.appendChild(sheet);

function esc(s) {
  return String(s).replace(/[&<>"']/g, function(c) {
    return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c];
  });
}

function openSheet() {
  renderList();
  backdrop.classList.add('uvd2-show');
  sheet.classList.add('uvd2-show');
}
function closeSheet() {
  backdrop.classList.remove('uvd2-show');
  sheet.classList.remove('uvd2-show');
}
fab.onclick = openSheet;
backdrop.onclick = closeSheet;
document.getElementById('__uvd2_close_sheet__').onclick = closeSheet;

function renderList() {
  var list = document.getElementById('__uvd2_list__');
  if (!found.size) {
    list.innerHTML = '<div class="uvd2-empty">Chưa tìm thấy video nào trên trang này.<br>Thử phát video trên trang trước.</div>';
    return;
  }
  var html = '';
  var i = 0;
  found.forEach(function(info, url) {
    i++;
    html +=
      '<div class="uvd2-card">' +
        '<div class="uvd2-card-top"><span class="uvd2-chip">' + esc(info.type) + '</span></div>' +
        '<div class="uvd2-card-url">' + esc(url) + '</div>' +
        '<button class="uvd2-cta" data-play-url="' + encodeURIComponent(url) + '" data-play-type="' + esc(info.type) + '">▶ Xem</button>' +
      '</div>';
  });
  list.innerHTML = html;
  list.querySelectorAll('[data-play-url]').forEach(function(btn) {
    btn.onclick = function() {
      closeSheet();
      openPlayer(decodeURIComponent(btn.dataset.playUrl), btn.dataset.playType);
    };
  });
}

// ---------- Detector ----------
var RX = /\.(m3u8|mpd|mp4|webm|mkv)(\?|#|$)/i;
function typeOf(url) {
  var m = url.match(/\.(m3u8|mpd|mp4|webm|mkv)(\?|#|$)/i);
  return m ? m[1].toUpperCase() : 'MP4';
}
function addFound(url, type) {
  if (!url || found.has(url)) return;
  if (url.indexOf('blob:') === 0) return;
  found.set(url, { type: type || typeOf(url) });
  updateBadge();
}

// Quét DOM: video/source/iframe
function scanDom() {
  document.querySelectorAll('video[src], source[src]').forEach(function(el) {
    if (RX.test(el.src)) addFound(el.src);
  });
  document.querySelectorAll('video').forEach(function(v) {
    if (v.currentSrc && RX.test(v.currentSrc)) addFound(v.currentSrc);
  });
}
scanDom();
var domObserver = new MutationObserver(function(){ scanDom(); });
domObserver.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['src'] });
onCleanup(function(){ domObserver.disconnect(); });

// Hook fetch + XHR để bắt link mạng (m3u8/mp4/...)
var origFetch = window.fetch;
window.fetch = function(input, init) {
  try {
    var url = typeof input === 'string' ? input : (input && input.url);
    if (url && RX.test(url)) addFound(url);
  } catch(e) {}
  return origFetch.apply(this, arguments);
};
onCleanup(function(){ window.fetch = origFetch; });

var origOpen = XMLHttpRequest.prototype.open;
XMLHttpRequest.prototype.open = function(method, url) {
  try { if (url && RX.test(url)) addFound(url); } catch(e) {}
  return origOpen.apply(this, arguments);
};
onCleanup(function(){ XMLHttpRequest.prototype.open = origOpen; });

// ---------- Player (Video.js v10, có fallback native an toàn) ----------
function openPlayer(url, type) {
  var overlay = document.createElement('div');
  overlay.className = 'uvd2-player';
  overlay.innerHTML =
    '<div class="uvd2-player-head">' +
      '<span class="uvd2-player-title">' + esc(pageTitle) + ' · ' + esc(type) + '</span>' +
      '<button class="uvd2-player-close" id="__uvd2_pclose__">✕</button>' +
    '</div>' +
    '<div class="uvd2-player-body" id="__uvd2_pbody__"></div>';
  root.appendChild(overlay);

  document.getElementById('__uvd2_pclose__').onclick = function() { overlay.remove(); };

  var body = document.getElementById('__uvd2_pbody__');
  var video = document.createElement('video');
  video.id = '__uvd2_video__';
  video.style.cssText = 'width:100%;height:100%;display:block;object-fit:contain;';
  video.setAttribute('playsinline', '');
  video.setAttribute('webkit-playsinline', '');
  video.setAttribute('crossorigin', 'anonymous');
  video.autoplay = true;
  body.appendChild(video);

  mountVjs(body, video, url, type);
}

// hls.js lazy-load, chỉ dùng khi cần (M3U8 mà video.js v10 không tự lo được)
function withHls(cb) {
  if (window.Hls) { cb(); return; }
  var s = document.createElement('script');
  s.src = 'https://cdn.jsdelivr.net/npm/hls.js@latest';
  s.onload = cb;
  s.onerror = function() { console.error('[UVD2] Không tải được hls.js'); cb(); };
  document.head.appendChild(s);
}

function attachSource(video, url, type) {
  if (type === 'M3U8') {
    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = url; // Safari native HLS
    } else {
      withHls(function() {
        if (window.Hls && Hls.isSupported()) {
          var hls = new Hls();
          hls.loadSource(url);
          hls.attachMedia(video);
        } else {
          video.src = url; // fallback cuối
        }
      });
    }
  } else {
    video.src = url;
  }
}

function mountVjs(wrapper, video, url, type) {
  var FALLBACK_MS = 4000;
  var done = false;
  function toNative() {
    if (done) return;
    done = true;
    if (!video.parentNode) wrapper.appendChild(video);
    video.setAttribute('controls', '');
    attachSource(video, url, type);
  }
  function withSkin() {
    if (done) return;
    done = true;
    try {
      var player = document.createElement('video-player');
      player.style.cssText = 'width:100%;height:100%;display:block;';
      var skin = document.createElement('video-skin');
      skin.style.cssText = 'width:100%;height:100%;display:block;';
      video.style.cssText = 'width:100%;height:100%;display:block;object-fit:contain;';
      if (video.parentNode) video.parentNode.removeChild(video);
      skin.appendChild(video);
      player.appendChild(skin);
      wrapper.appendChild(player);
      attachSource(video, url, type);
      // Watchdog: nếu render kích thước 0 (bug beta), fallback về controls gốc
      setTimeout(function() {
        if (player.parentNode && (player.offsetWidth === 0 || player.offsetHeight === 0)) {
          console.error('[UVD2] Video.js v10 render lỗi kích thước, fallback controls gốc');
          if (video.parentNode) video.parentNode.removeChild(video);
          player.remove();
          done = false;
          toNative();
        }
      }, 1500);
    } catch (e) {
      console.error('[UVD2] Video.js v10 mount lỗi:', e);
      done = false;
      toNative();
    }
  }
  if (customElements.get('video-player')) { withSkin(); return; }
  if (!window.__uvd2VjsLoading) {
    window.__uvd2VjsLoading = true;
    var s = document.createElement('script');
    s.type = 'module';
    s.src = 'https://cdn.jsdelivr.net/npm/@videojs/html/cdn/video.js';
    s.onerror = function() { console.error('[UVD2] Không tải được Video.js v10 (CSP?), dùng controls gốc'); };
    document.head.appendChild(s);
  }
  var start = Date.now();
  var iv = setInterval(function() {
    if (customElements.get('video-player')) { clearInterval(iv); withSkin(); }
    else if (Date.now() - start > FALLBACK_MS) { clearInterval(iv); toNative(); }
  }, 100);
}

// ---------- Mở sheet ngay khi kích hoạt ----------
updateBadge();
setTimeout(openSheet, 150);

})();
