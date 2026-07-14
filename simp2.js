/**
Universal Media Player v3.3 (Video.js v10 - Unpkg Edition)
Fix: Dùng unpkg CDN + Retry logic + Better error handling
*/
(function() {
'use strict';

// ========== CONFIG ==========
var VJS_VERSION = '10.0.0';
var CDN_URLS = {
    unpkg: {
        css: 'https://unpkg.com/video.js@' + VJS_VERSION + '/dist/video-js.min.css',
        js: 'https://unpkg.com/video.js@' + VJS_VERSION + '/dist/video.min.js'
    },
    jsdelivr: {
        css: 'https://cdn.jsdelivr.net/npm/video.js@' + VJS_VERSION + '/dist/video-js.min.css',
        js: 'https://cdn.jsdelivr.net/npm/video.js@' + VJS_VERSION + '/dist/video.min.js'
    },
    cdnjs: {
        css: 'https://cdnjs.cloudflare.com/ajax/libs/video.js/' + VJS_VERSION + '/video-js.min.css',
        js: 'https://cdnjs.cloudflare.com/ajax/libs/video.js/' + VJS_VERSION + '/video.min.js'
    }
};

var vjsLoaded = false;
var currentCdn = 'unpkg'; // Ưu tiên unpkg trước

// ========== LOAD VIDEO.JS V10 ==========
function loadVideoJS() {
    return new Promise(function(resolve) {
        if (window.videojs) {
            console.log('[UMP] Video.js đã có sẵn');
            vjsLoaded = true;
            resolve(true);
            return;
        }
        
        console.log('[UMP] Đang tải Video.js v' + VJS_VERSION + ' từ ' + currentCdn + '...');
        
        // Load CSS
        var link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = CDN_URLS[currentCdn].css;
        document.head.appendChild(link);
        
        // Load JS với timeout
        var script = document.createElement('script');
        script.src = CDN_URLS[currentCdn].js;
        script.async = true;
        
        var loadTimeout = setTimeout(function() {
            console.warn('[UMP] ' + currentCdn + ' timeout, thử CDN khác...');
            tryNextCdn(resolve);
        }, 8000);
        
        script.onload = function() {
            clearTimeout(loadTimeout);
            // Đợi window.videojs sẵn sàng
            var checkReady = setInterval(function() {
                if (window.videojs) {
                    clearInterval(checkReady);
                    vjsLoaded = true;
                    console.log('[UMP] ✓ Video.js v' + VJS_VERSION + ' loaded từ ' + currentCdn);
                    resolve(true);
                }
            }, 50);
        };
        
        script.onerror = function() {
            clearTimeout(loadTimeout);
            console.error('[UMP] ' + currentCdn + ' load failed');
            tryNextCdn(resolve);
        };
        
        document.head.appendChild(script);
    });
}

function tryNextCdn(resolve) {
    var cdnOrder = ['unpkg', 'jsdelivr', 'cdnjs'];
    var currentIndex = cdnOrder.indexOf(currentCdn);
    
    if (currentIndex < cdnOrder.length - 1) {
        currentCdn = cdnOrder[currentIndex + 1];
        console.log('[UMP] Chuyển sang ' + currentCdn + '...');
        
        // Xóa script cũ
        var scripts = document.querySelectorAll('script[src*="video.js"]');
        scripts.forEach(function(s) { s.remove(); });
        
        loadVideoJS().then(resolve);
    } else {
        console.error('[UMP] ❌ Tất cả CDN failed');
        resolve(false);
    }
}

// Load Video.js trước khi init
loadVideoJS().then(function(success) {
    if (success) {
        console.log('[UMP] ✅ Sử dụng Video.js v10');
    } else {
        console.log('[UMP] ⚠️ Dùng native player (Video.js không available)');
    }
    setTimeout(initPlayer, 100); // Đợi thêm 100ms để chắc chắn
});

function initPlayer() {
    var old = document.getElementById('ump');
    if (old) old.remove();

    // ========== PAGE INFO ==========
    var pageInfo = {
        title: (document.title || 'video').replace(/[^\w\s\u00C0-\u1EF9]/g, '').substring(0, 60).trim() || 'video',
        url: location.href,
        host: location.hostname.replace(/^www\./, ''),
        referer: location.origin + '/',
        origin: location.origin
    };

    // ========== FIND VIDEOS (giữ nguyên code cũ) ==========
    var urls = new Map();
    var patterns = [
        { re: /https?:\/\/[^\s"'<>()\]]+\.m3u8[^\s"'<>()\]]*/gi, type: 'M3U8', priority: 1 },
        { re: /https?:\/\/[^\s"'<>()\]]+\.mpd[^\s"'<>()\]]*/gi, type: 'MPD', priority: 2 },
        { re: /https?:\/\/[^\s"'<>()\]]+\.mp4[^\s"'<>()\]]*/gi, type: 'MP4', priority: 3 },
        { re: /https?:\/\/[^\s"'<>()\]]+\.webm[^\s"'<>()\]]*/gi, type: 'WEBM', priority: 4 },
        { re: /https?:\/\/[^\s"'<>()\]]+\.mkv[^\s"'<>()\]]*/gi, type: 'MKV', priority: 5 }
    ];

    function findUrls(text, source) {
        if (!text || typeof text !== 'string') return;
        patterns.forEach(function(p) {
            var matches = text.match(p.re);
            if (matches) {
                matches.forEach(function(u) {
                    u = u.replace(/\u002F/g, '/').replace(/&/g, '&').replace(/\"/g, '');
                    if (!urls.has(u) || urls.get(u).priority > p.priority) {
                        urls.set(u, { type: p.type, source: source, priority: p.priority });
                    }
                });
            }
        });
    }

    function scan(doc, src) {
        try {
            doc.querySelectorAll('video, source, audio').forEach(function(v) {
                if (v.src) findUrls(v.src, src);
                if (v.currentSrc) findUrls(v.currentSrc, src);
            });
            doc.querySelectorAll('script').forEach(function(s) { findUrls(s.textContent, src); });
            findUrls(doc.documentElement.outerHTML, src);
            doc.querySelectorAll('iframe').forEach(function(i, idx) {
                if (i.src) urls.set(i.src, { type: 'IFRAME', source: 'iframe#' + idx, priority: 99 });
                try { if (i.contentDocument) scan(i.contentDocument, 'iframe#' + idx); } catch(e) {}
            });
        } catch(e) {}
    }

    scan(document, 'main');
    try { performance.getEntriesByType('resource').forEach(function(e) { findUrls(e.name, 'network'); }); } catch(e) {}

    var arr = [...urls.entries()].map(function(e) {
        return { url: e[0], type: e[1].type, source: e[1].source, priority: e[1].priority };
    }).sort(function(a, b) { return a.priority - b.priority; });

    var playable = arr.filter(function(x) { return x.type !== 'IFRAME'; });

    if (playable.length === 0) { showFinderPanel(arr); return; }
    if (playable.length === 1) { openPlayer(playable[0]); }
    else { showQuickSelector(playable, arr); }
}

// ========== CÁC HÀM KHÁC (giữ nguyên từ uni.js) ==========
// Copy toàn bộ showQuickSelector, showFinderPanel, openPlayer, showMenu, etc. từ code cũ
// Chỉ sửa phần initVideoJSPlayer để dùng window.videojs

function showQuickSelector(playable, all) {
    // ... (giống code cũ)
}

function showFinderPanel(arr) {
    // ... (giống code cũ)
}

function openPlayer(streamInfo) {
    activateGuard();
    
    var overlay = document.createElement('div');
    overlay.id = '__ump__';
    overlay.style.cssText = 'position:fixed;inset:0;background:#000;z-index:2147483647;display:flex;flex-direction:column;font-family:Arial;overflow:hidden;';
    
    // Top Bar
    var topBar = document.createElement('div');
    topBar.id = '__ump_topbar__';
    topBar.style.cssText = 'position:absolute;top:0;left:0;right:0;background:linear-gradient(180deg,rgba(0,0,0,0.8),transparent);padding:8px 10px;display:flex;justify-content:space-between;align-items:center;z-index:100;';
    topBar.innerHTML = 
        '<div style="color:#fff;font-size:11px;flex:1;overflow:hidden;padding-right:8px;">' +
            '<div style="font-weight:bold;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + pageInfo.title + '</div>' +
            '<div style="opacity:0.7;font-size:9px;">' + streamInfo.type + ' · ' + pageInfo.host + '</div>' +
        '</div>' +
        '<button id="__ump_menu_btn__" style="background:rgba(255,255,255,0.2);color:#fff;border:0;padding:6px 10px;border-radius:4px;margin-right:4px;font-size:12px;">⋮</button>' +
        '<button id="__ump_close_player__" style="background:rgba(244,67,54,0.9);color:#fff;border:0;padding:6px 10px;border-radius:4px;font-size:12px;font-weight:bold;">✕</button>';
    overlay.appendChild(topBar);
    
    // Video Container
    var videoContainer = document.createElement('div');
    videoContainer.style.cssText = 'flex:1;position:relative;width:100%;height:100%;background:#000;';
    
    var videoEl = document.createElement('video');
    videoEl.id = '__ump_video__';
    videoEl.className = 'video-js vjs-default-skin';
    videoEl.style.cssText = 'width:100%!important;height:100%!important;position:absolute;top:0;left:0;object-fit:contain;';
    videoEl.crossOrigin = 'anonymous';
    videoEl.playsInline = true;
    videoContainer.appendChild(videoEl);
    overlay.appendChild(videoContainer);
    document.body.appendChild(overlay);
    
    // Quyết định dùng Video.js hay native
    if (vjsLoaded && window.videojs) {
        initVideoJSPlayer(videoEl, streamInfo);
    } else {
        initNativePlayer(videoEl, streamInfo, overlay);
    }
    
    // Close button
    document.getElementById('__ump_close_player__').onclick = function() {
        if (window.__ump_vjs_player__) {
            window.__ump_vjs_player__.dispose();
            window.__ump_vjs_player__ = null;
        }
        overlay.remove();
        deactivateGuard();
    };
    
    document.getElementById('__ump_menu_btn__').onclick = function() { showMenu(streamInfo); };
}

function initVideoJSPlayer(videoEl, streamInfo) {
    console.log('[UMP] Khởi tạo Video.js player');
    
    var player = window.videojs(videoEl, {
        controls: true,
        autoplay: true,
        preload: 'auto',
        language: 'vi',
        playbackRates: [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 4, 8, 16],
        fill: true,
        html5: { vhs: { overrideNative: true } }
    });
    
    window.__ump_vjs_player__ = player;
    
    // Set source
    var type = streamInfo.type === 'M3U8' ? 'application/x-mpegURL' : 
               streamInfo.type === 'MPD' ? 'application/dash+xml' : 'video/mp4';
    
    player.src({ src: streamInfo.url, type: type });
    
    player.ready(function() {
        console.log('[UMP] Video.js ready');
    });
    
    player.on('error', function() {
        console.error('[UMP] Video.js error');
        showToast('❌ Lỗi video - thử bypass', '#f44336');
    });
}

function initNativePlayer(videoEl, streamInfo, overlay) {
    console.log('[UMP] Khởi tạo native player');
    // Dùng code native từ uni.js cũ
    videoEl.controls = false;
    videoEl.autoplay = true;
    videoEl.src = streamInfo.url;
    
    // Thêm custom controls...
}

function showMenu(streamInfo) { /* ... */ }
function activateGuard() { /* ... */ }
function deactivateGuard() { /* ... */ }
function showToast(msg, color) { /* ... */ }

console.log('[UMP] UMP v3.3 (Unpkg) loaded');
})();

