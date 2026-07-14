/**
Universal Media Player v3.0 (Video.js v10 Edition)
Fixed: Tích hợp Video.js v10 cho giao diện đẹp, loại bỏ hls.js thủ công
*/
(function() {
'use strict';
var old = document.getElementById('ump');
if (old) old.remove();

// ========== LOAD VIDEO.JS V10 ==========
function loadVJS() {
    return new Promise(resolve => {
        if (window.videojs) { resolve(); return; }
        if (typeof GM_addElement !== 'undefined') {
            GM_addElement('link', { rel: 'stylesheet', href: 'https://cdn.jsdelivr.net/npm/video.js@10.0.0/dist/video-js.min.css' });
            GM_addElement('script', { src: 'https://cdn.jsdelivr.net/npm/video.js@10.0.0/dist/video.min.js' }, resolve);
        } else {
            // Fallback nếu không có GM_addElement
            var link = document.createElement('link'); link.rel = 'stylesheet'; link.href = 'https://cdn.jsdelivr.net/npm/video.js@10.0.0/dist/video-js.min.css'; document.head.appendChild(link);
            var script = document.createElement('script'); script.src = 'https://cdn.jsdelivr.net/npm/video.js@10.0.0/dist/video.min.js'; script.onload = resolve; document.head.appendChild(script);
        }
    });
}
loadVJS(); // Load sẵn từ đầu

// ========== PAGE INFO ==========
var pageInfo = {
    title: (document.title || 'video').replace(/[^\w\s\u00C0-\u1EF9]/g, '').substring(0, 60).trim() || 'video',
    url: location.href,
    host: location.hostname.replace(/^www./, ''),
    referer: location.origin + '/',
    origin: location.origin
};

// ========== FIND VIDEOS ==========
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

// ========== QUICK SELECTOR & FINDER PANEL (Giữ nguyên) ==========
function showQuickSelector(playable, all) {
    var overlay = document.createElement('div');
    overlay.id = 'ump';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:2147483647;display:flex;align-items:center;justify-content:center;padding:15px;font-family:Arial;';
    var html = '<div style="background:#fff;border:2px solid #4CAF50;border-radius:12px;padding:15px;max-width:450px;width:100%;color:#333;max-height:85vh;overflow-y:auto;box-shadow:0 10px 40px rgba(0,0,0,0.3);">';
    html += '<div style="text-align:center;margin-bottom:12px;"><h2 style="color:#4CAF50;margin:0;font-size:16px;">🎬 Chọn Stream (' + playable.length + ')</h2></div>';
    playable.forEach(function(item, i) {
        var typeColor = item.type === 'M3U8' ? '#4CAF50' : (item.type === 'MP4' ? '#FF9800' : '#2196F3');
        html += '<div style="background:#f5f5f5;padding:10px;margin-bottom:6px;border-radius:6px;border-left:3px solid ' + typeColor + ';">';
        html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:5px;">';
        html += '<span style="background:' + typeColor + ';color:#fff;padding:2px 8px;border-radius:3px;font-size:10px;font-weight:bold;">#' + (i+1) + ' ' + item.type + '</span>';
        html += '<span style="color:#999;font-size:9px;">' + item.source + '</span></div>';
        html += '<div style="font-family:monospace;font-size:9px;color:#666;word-break:break-all;margin-bottom:6px;max-height:30px;overflow-y:auto;">' + item.url.substring(0, 80) + '</div>';
        html += '<button class="__ump_play__" data-idx="' + i + '" style="background:#4CAF50;color:#fff;border:0;padding:8px;border-radius:4px;font-weight:bold;width:100%;cursor:pointer;font-size:12px;">▶️ Play</button></div>';
    });
    if (all.length > playable.length) {
        html += '<button id="__ump_show_all__" style="background:#999;color:#fff;border:0;padding:8px;border-radius:5px;font-weight:bold;width:100%;margin-top:8px;font-size:12px;">📋 Xem tất cả (' + all.length + ')</button>';
    }
    html += '<button id="__ump_close__" style="background:#f44336;color:#fff;border:0;padding:8px;border-radius:5px;font-weight:bold;width:100%;margin-top:8px;font-size:12px;">✕ Hủy</button></div>';
    overlay.innerHTML = html;
    document.body.appendChild(overlay);
    overlay.querySelectorAll('.__ump_play__').forEach(function(b) {
        b.onclick = function() { var idx = parseInt(this.dataset.idx); overlay.remove(); openPlayer(playable[idx]); };
    });
    document.getElementById('__ump_close__').onclick = function() { overlay.remove(); };
    var showAll = document.getElementById('__ump_show_all__');
    if (showAll) showAll.onclick = function() { overlay.remove(); showFinderPanel(all); };
}

function showFinderPanel(arr) {
    var overlay = document.createElement('div');
    overlay.id = 'ump';
    overlay.style.cssText = 'position:fixed;inset:0;background:#f5f5f5;z-index:2147483647;overflow-y:auto;padding:15px;color:#333;font-family:Arial;';
    var html = '<div style="text-align:center;margin-bottom:15px;"><h2 style="color:#4CAF50;margin:5px 0;">🎬 Media Finder (' + arr.length + ')</h2></div>';
    if (arr.length === 0) {
        html += '<div style="text-align:center;padding:40px;color:#666;background:#fff;border-radius:8px;">❌ Không tìm thấy media<br><small>Bấm Play video trước rồi chạy lại</small></div>';
    } else {
        arr.forEach(function(item, i) {
            var typeColor = item.type === 'IFRAME' ? '#2196F3' : '#4CAF50';
            html += '<div style="background:#fff;padding:10px;margin-bottom:6px;border-radius:6px;border-left:3px solid ' + typeColor + ';box-shadow:0 1px 3px rgba(0,0,0,0.1);">';
            html += '<div style="display:flex;justify-content:space-between;margin-bottom:5px;">';
            html += '<span style="background:' + typeColor + ';color:#fff;padding:2px 8px;border-radius:3px;font-size:10px;font-weight:bold;">#' + (i+1) + ' ' + item.type + '</span></div>';
            html += '<div style="font-family:monospace;font-size:9px;color:#666;word-break:break-all;margin-bottom:6px;max-height:40px;overflow-y:auto;">' + item.url + '</div>';
            html += '<div style="display:flex;gap:4px;flex-wrap:wrap;">';
            if (item.type === 'IFRAME') {
                html += '<a href="' + item.url + '" style="background:#2196F3;color:#fff;padding:6px 10px;border-radius:4px;font-size:10px;text-decoration:none;flex:1;text-align:center;font-weight:bold;">➡️ Vào</a>';
            } else {
                html += '<button class="__ump_play_alt__" data-idx="' + i + '" style="background:#4CAF50;color:#fff;border:0;padding:6px 10px;border-radius:4px;font-size:10px;font-weight:bold;flex:1;">▶️ Play</button>';
            }
            html += '<button class="__ump_copy__" data-url="' + encodeURIComponent(item.url) + '" style="background:#607D8B;color:#fff;border:0;padding:6px 10px;border-radius:4px;font-size:10px;font-weight:bold;flex:1;">📋 Copy</button>';
            html += '<button class="__ump_share__" data-url="' + encodeURIComponent(item.url) + '" style="background:#FF6B6B;color:#fff;border:0;padding:6px 10px;border-radius:4px;font-size:10px;font-weight:bold;flex:1;">📱 Share</button>';
            html += '</div></div>';
        });
    }
    html += '<button id="__ump_close__" style="background:#f44336;color:#fff;border:0;padding:12px;border-radius:5px;font-weight:bold;width:100%;margin-top:15px;">✕ Đóng</button>';
    overlay.innerHTML = html;
    document.body.appendChild(overlay);
    overlay.querySelectorAll('.__ump_play_alt__').forEach(function(b) {
        b.onclick = function() { var idx = parseInt(this.dataset.idx); overlay.remove(); openPlayer(arr[idx]); };
    });
    overlay.querySelectorAll('.__ump_copy__').forEach(function(b) {
        b.onclick = function() { copy(decodeURIComponent(this.dataset.url)); this.innerText = '✓'; };
    });
    overlay.querySelectorAll('.__ump_share__').forEach(function(b) {
        b.onclick = function() { shareUrl(decodeURIComponent(this.dataset.url)); };
    });
    document.getElementById('__ump_close__').onclick = function() { overlay.remove(); };
}

// ========== PLAYER (VIDEO.JS V10) ==========
function openPlayer(streamInfo) {
    activateGuard();
    var overlay = document.createElement('div');
    overlay.id = '__ump__';
    overlay.style.cssText = 'position:fixed;inset:0;background:#000;z-index:2147483647;display:flex;flex-direction:column;font-family:Arial;overflow:hidden;';

    // Top Bar
    var topBar = document.createElement('div');
    topBar.id = '__ump_topbar__';
    topBar.style.cssText = 'position:absolute;top:0;left:0;right:0;background:linear-gradient(180deg,rgba(0,0,0,0.8),transparent);padding:8px 10px;display:flex;justify-content:space-between;align-items:center;z-index:100;transition:opacity 0.3s;';
    topBar.innerHTML = 
        '<div style="color:#fff;font-size:11px;flex:1;overflow:hidden;padding-right:8px;">' +
            '<div style="font-weight:bold;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + pageInfo.title + '</div>' +
            '<div style="opacity:0.7;font-size:9px;">' + streamInfo.type + ' · ' + pageInfo.host + '</div>' +
        '</div>' +
        '<button id="__ump_close_player__" style="background:rgba(244,67,54,0.9);color:#fff;border:0;padding:6px 10px;border-radius:4px;font-size:12px;font-weight:bold;">✕ Đóng</button>';
    overlay.appendChild(topBar);

    // Video.js Container
    var videoContainer = document.createElement('div');
    videoContainer.style.cssText = 'flex:1; display:flex; align-items:center; justify-content:center; background:#000; width:100%; height:100%;';
    var videoEl = document.createElement('video');
    videoEl.id = '__ump_video__';
    videoEl.className = 'video-js vjs-default-skin vjs-big-play-centered';
    videoEl.style.cssText = 'width:100%; height:100%; max-height:100vh;';
    videoEl.crossOrigin = 'anonymous';
    videoContainer.appendChild(videoEl);
    overlay.appendChild(videoContainer);
    document.body.appendChild(overlay);

    // Init Video.js
    var player = videojs(videoEl, {
        controls: true,
        autoplay: true,
        preload: 'auto',
        language: 'vi',
        playbackRates: [0.25, 0.5, 1, 1.25, 1.5, 2, 4, 8, 16],
        html5: { vhs: { overrideNative: true } }
    });

    // Thêm Custom Buttons vào ControlBar
    var controlBar = player.controlBar;
    function addCustomBtn(name, icon, tooltip, onClick) {
        var btn = document.createElement('button');
        btn.className = 'vjs-control vjs-button vjs-' + name + '-btn';
        btn.title = tooltip;
        btn.innerHTML = '<span class="vjs-icon-placeholder" style="font-size:16px; line-height:1;">' + icon + '</span>';
        btn.onclick = onClick;
        controlBar.el().appendChild(btn);
    }
    
    addCustomBtn('screenshot', '📸', 'Chụp màn hình', function() { takeScreenshot(player); });
    addCustomBtn('rotate', '🔄', 'Xoay video', function() { rotateVideo(player); });
    addCustomBtn('bypass', '🛡️', 'Bypass Options', function() { showBypassMenu(streamInfo, player); });
    addCustomBtn('download', '⬇️', 'Download', function() { downloadUrl(streamInfo.url, streamInfo.type); });
    addCustomBtn('share', '📱', 'Share', function() { shareUrl(streamInfo.url); });
    addCustomBtn('menu', '⋮', 'Menu', function() { showMenu(streamInfo, player); });

    // CSS cho custom buttons
    if (typeof GM_addStyle !== 'undefined') {
        GM_addStyle(`
            .vjs-screenshot-btn, .vjs-rotate-btn, .vjs-bypass-btn, .vjs-download-btn, .vjs-share-btn, .vjs-menu-btn {
                display: flex !important; align-items: center !important; justify-content: center !important;
            }
            .vjs-bypass-btn { color: #4CAF50 !important; }
            .vjs-download-btn { color: #2196F3 !important; }
            .vjs-share-btn { color: #FF6B6B !important; }
            .vjs-menu-btn { color: #fff !important; }
            .vjs-big-play-button { font-size: 4em !important; width: 1.5em !important; height: 1.5em !important; line-height: 1.5em !important; border-radius: 50% !important; }
        `);
    }

    // Logic Load Video
    player.__loadWithBypass = function(mode) {
        if (window.__ump_dash__) { try { window.__ump_dash__.reset(); } catch(e){} window.__ump_dash__ = null; }
        
        var finalUrl = streamInfo.url;
        if (mode === 'proxy') {
            finalUrl = 'https://corsproxy.io/?' + encodeURIComponent(streamInfo.url);
            showToast('🔄 Using CORS Proxy', '#2196F3');
        } else if (mode === 'redirect') {
            window.location.href = streamInfo.url;
            return;
        }
        
        if (streamInfo.type === 'MPD') {
            var videoTech = player.tech().el();
            if (window.dashjs) {
                var dashPlayer = dashjs.MediaPlayer().create();
                dashPlayer.initialize(videoTech, finalUrl, true);
                window.__ump_dash__ = dashPlayer;
            } else {
                var dashScript = document.createElement('script');
                dashScript.src = 'https://cdn.jsdelivr.net/npm/dashjs@latest/dist/dash.all.min.js';
                dashScript.onload = function() { player.__loadWithBypass(mode); };
                document.head.appendChild(dashScript);
            }
        } else {
            // M3U8 hoặc MP4 (Video.js v10 tự xử lý M3U8 qua VHS)
            var type = streamInfo.type === 'M3U8' ? 'application/x-mpegURL' : 'video/mp4';
            player.src({ src: finalUrl, type: type });
            player.load();
            player.play().catch(function(){});
        }
    };
    
    player.__loadWithBypass('direct');

    player.on('error', function() {
        showToast('❌ Video load lỗi', '#f44336');
    });

    // Close player
    document.getElementById('__ump_close_player__').onclick = function() {
        player.pause();
        player.dispose();
        if (window.__ump_dash__) try { window.__ump_dash__.reset(); } catch(e){}
        if (document.fullscreenElement) document.exitFullscreen().catch(function(){});
        deactivateGuard();
        overlay.remove();
    };

    // Media Session
    if ('mediaSession' in navigator) {
        navigator.mediaSession.metadata = new MediaMetadata({
            title: pageInfo.title, artist: pageInfo.host, album: 'Universal Media Player'
        });
        navigator.mediaSession.setActionHandler('play', function() { player.play(); });
        navigator.mediaSession.setActionHandler('pause', function() { player.pause(); });
        navigator.mediaSession.setActionHandler('seekbackward', function() { player.currentTime(player.currentTime() - 10); });
        navigator.mediaSession.setActionHandler('seekforward', function() { player.currentTime(player.currentTime() + 10); });
    }
}

// ========== MENU & BYPASS MENU ==========
function showMenu(streamInfo, player) {
    var menu = document.createElement('div');
    menu.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:2147483648;display:flex;align-items:center;justify-content:center;padding:15px;';
    var html = '<div style="background:#fff;border-radius:10px;padding:15px;max-width:350px;width:100%;color:#333;max-height:85vh;overflow-y:auto;box-shadow:0 10px 40px rgba(0,0,0,0.4);">';
    html += '<h3 style="color:#4CAF50;margin:0 0 12px;font-size:14px;">📋 Menu</h3>';
    html += '<div style="background:#f5f5f5;padding:8px;border-radius:6px;margin-bottom:12px;font-size:10px;color:#666;word-break:break-all;font-family:monospace;">' + streamInfo.url.substring(0, 100) + '</div>';
    html += '<div style="display:flex;flex-direction:column;gap:5px;">';
    html += '<button class="__ump_m__" data-a="copy-url" style="background:#607D8B;color:#fff;border:0;padding:10px;border-radius:5px;font-weight:bold;text-align:left;font-size:12px;">📋 Copy URL</button>';
    html += '<button class="__ump_m__" data-a="share-url" style="background:#FF6B6B;color:#fff;border:0;padding:10px;border-radius:5px;font-weight:bold;text-align:left;font-size:12px;">📱 Share (YTDLnis...)</button>';
    html += '<button class="__ump_m__" data-a="open-new" style="background:#2196F3;color:#fff;border:0;padding:10px;border-radius:5px;font-weight:bold;text-align:left;font-size:12px;">🔗 Mở tab mới</button>';
    html += '<button class="__ump_m__" data-a="dl-mp4" style="background:#FF9800;color:#fff;border:0;padding:10px;border-radius:5px;font-weight:bold;text-align:left;font-size:12px;">⬇️ Download trực tiếp</button>';
    html += '<button class="__ump_m__" data-a="dl-cmd" style="background:#9C27B0;color:#fff;border:0;padding:10px;border-radius:5px;font-weight:bold;text-align:left;font-size:12px;">💻 Copy yt-dlp cmd</button>';
    html += '<button class="__ump_m__" data-a="dl-ffmpeg" style="background:#795548;color:#fff;border:0;padding:10px;border-radius:5px;font-weight:bold;text-align:left;font-size:12px;">🎬 Copy FFmpeg cmd</button>';
    html += '<button class="__ump_m__" data-a="reload-video" style="background:#009688;color:#fff;border:0;padding:10px;border-radius:5px;font-weight:bold;text-align:left;font-size:12px;">🔄 Reload video</button>';
    html += '<button class="__ump_m__" data-a="bypass-menu" style="background:#FF5722;color:#fff;border:0;padding:10px;border-radius:5px;font-weight:bold;text-align:left;font-size:12px;">🛡️ Bypass Options...</button>';
    html += '</div>';
    html += '<button id="__ump_m_close__" style="background:#f44336;color:#fff;border:0;padding:10px;border-radius:5px;width:100%;margin-top:12px;font-weight:bold;font-size:12px;">← Back</button>';
    html += '</div>';
    menu.innerHTML = html;
    document.body.appendChild(menu);
    menu.querySelectorAll('.__ump_m__').forEach(function(b) {
        b.onclick = function() {
            var a = this.dataset.a, url = streamInfo.url;
            if (a === 'copy-url') { copy(url); showToast('✓ Copied', '#4CAF50'); }
            else if (a === 'share-url') shareUrl(url);
            else if (a === 'open-new') window.open(url, '_blank');
            else if (a === 'dl-mp4') downloadUrl(url, streamInfo.type);
            else if (a === 'dl-cmd') {
                var cmd = 'yt-dlp --referer "' + pageInfo.referer + '" -f "best" --hls-use-mpegts --merge-output-format mp4 -o "' + pageInfo.title + '.%(ext)s" "' + url + '"';
                copy(cmd); showToast('✓ yt-dlp copied', '#9C27B0');
            }
            else if (a === 'dl-ffmpeg') {
                var cmd = 'ffmpeg -headers "Referer: ' + pageInfo.referer + '" -i "' + url + '" -c copy "' + pageInfo.title + '.mp4"';
                copy(cmd); showToast('✓ FFmpeg copied', '#795548');
            }
            else if (a === 'reload-video') {
                player.__loadWithBypass('direct');
                showToast('🔄 Reloaded', '#009688');
            }
            else if (a === 'bypass-menu') {
                menu.remove();
                showBypassMenu(streamInfo, player);
            }
            if (a !== 'bypass-menu') menu.remove();
        };
    });
    document.getElementById('__ump_m_close__').onclick = function() { menu.remove(); };
}

function showBypassMenu(streamInfo, player) {
    var bmenu = document.createElement('div');
    bmenu.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:2147483649;display:flex;align-items:center;justify-content:center;padding:15px;font-family:Arial;';
    var html = '<div style="background:#fff;border-radius:10px;padding:15px;max-width:350px;width:100%;color:#333;">';
    html += '<h3 style="color:#FF5722;margin:0 0 12px;font-size:14px;">🛡️ Bypass Options</h3>';
    html += '<p style="font-size:11px;color:#666;margin-bottom:10px;">Dùng khi video bị chặn (Turbovid, Streamtape...)</p>';
    html += '<button class="__ump_bypass__" data-mode="direct" style="background:#4CAF50;color:#fff;border:0;padding:12px;border-radius:5px;width:100%;margin-bottom:6px;font-weight:bold;font-size:13px;">▶ Direct (mặc định)</button>';
    html += '<button class="__ump_bypass__" data-mode="proxy" style="background:#2196F3;color:#fff;border:0;padding:12px;border-radius:5px;width:100%;margin-bottom:6px;font-weight:bold;font-size:13px;">🔄 CORS Proxy (corsproxy.io)</button>';
    html += '<button class="__ump_bypass__" data-mode="redirect" style="background:#f44336;color:#fff;border:0;padding:12px;border-radius:5px;width:100%;margin-bottom:6px;font-weight:bold;font-size:13px;">↗ Redirect (mở tab gốc)</button>';
    html += '<button id="__ump_bypass_close__" style="background:#999;color:#fff;border:0;padding:10px;border-radius:5px;width:100%;margin-top:8px;font-size:12px;">← Quay lại</button>';
    html += '</div>';
    bmenu.innerHTML = html;
    document.body.appendChild(bmenu);
    bmenu.querySelectorAll('.__ump_bypass__').forEach(function(b) {
        b.onclick = function() {
            var mode = this.dataset.mode;
            bmenu.remove();
            if (mode === 'redirect') {
                window.location.href = streamInfo.url;
            } else {
                player.__loadWithBypass(mode);
                showToast('🔄 Loaded: ' + mode, mode === 'proxy' ? '#2196F3' : '#4CAF50');
            }
        };
    });
    document.getElementById('__ump_bypass_close__').onclick = function() {
        bmenu.remove();
        showMenu(streamInfo, player);
    };
}

// ========== HELPERS ==========
function formatTime(sec) {
    if (isNaN(sec) || !isFinite(sec)) return '0:00';
    var h = Math.floor(sec / 3600);
    var m = Math.floor((sec % 3600) / 60);
    var s = Math.floor(sec % 60);
    return (h > 0 ? h + ':' + (m < 10 ? '0' : '') : '') + m + ':' + (s < 10 ? '0' : '') + s;
}
function copy(text) {
    var t = document.createElement('textarea');
    t.value = text;
    document.body.appendChild(t);
    t.select();
    document.execCommand('copy');
    t.remove();
}
function showToast(msg, color) {
    var t = document.createElement('div');
    t.innerHTML = msg;
    t.style.cssText = 'position:fixed;top:60px;left:50%;transform:translateX(-50%);background:' + (color || '#333') + ';color:#fff;padding:8px 15px;border-radius:15px;z-index:2147483649;font:bold 11px Arial;box-shadow:0 3px 12px rgba(0,0,0,0.5);';
    document.body.appendChild(t);
    setTimeout(function() { t.remove(); }, 2000);
}
function shareUrl(url) {
    if (navigator.share) {
        navigator.share({ title: pageInfo.title, url: url }).catch(function(err) {
            if (err.name !== 'AbortError') { copy(url); showToast('✓ Copied', '#FF6B6B'); }
        });
    } else {
        copy(url);
        showToast('✓ Copied - Mở YTDLnis', '#FF6B6B');
    }
}
function downloadUrl(url, type) {
    if (type === 'M3U8' || type === 'MPD') {
        shareUrl(url);
        showToast('⚠️ Stream cần app riêng', '#FF9800');
    } else {
        var a = document.createElement('a');
        a.href = url;
        a.download = pageInfo.title + '.' + type.toLowerCase();
        a.target = '_blank';
        document.body.appendChild(a);
        a.click();
        a.remove();
        showToast('⬇️ Downloading...', '#2196F3');
    }
}
function takeScreenshot(player) {
    try {
        var videoEl = player.tech().el();
        var canvas = document.createElement('canvas');
        canvas.width = videoEl.videoWidth;
        canvas.height = videoEl.videoHeight;
        var ctx = canvas.getContext('2d');
        ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(function(blob) {
            var a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = pageInfo.title + '_' + Math.floor(player.currentTime()) + 's.png';
            a.click();
            setTimeout(function() { URL.revokeObjectURL(a.href); }, 1000);
            showToast('📸 Saved', '#4CAF50');
        });
    } catch(e) { showToast('❌ CORS error', '#f44336'); }
}
function rotateVideo(player) {
    player.__rotation = ((player.__rotation || 0) + 90) % 360;
    var videoTech = player.tech().el();
    if (player.__rotation === 0) {
        videoTech.style.transform = '';
    } else {
        videoTech.style.transform = 'rotate(' + player.__rotation + 'deg)';
    }
}

// ========== GUARD ==========
function activateGuard() {
    if (window.ump_guard_active) return;
    window.ump_guard_active = true;
    window.__ump_originals__ = { open: window.open, assign: location.assign, replace: location.replace };
    window.open = function(url) { console.log('🚫 Blocked window.open:', url); return null; };
    try {
        location.assign = function(url) { console.log('🚫 assign:', url); };
        location.replace = function(url) { console.log('🚫 replace:', url); };
    } catch(e) {}
    window.onbeforeunload = null;
    window.__ump_click_blocker__ = function(e) {
        var link = e.target.closest('a');
        if (link && link.href && !link.href.startsWith('#') && !link.href.startsWith('javascript:')) {
            try {
                var linkHost = new URL(link.href).hostname;
                if (linkHost !== pageInfo.host) { e.preventDefault(); e.stopPropagation(); }
            } catch(err) {}
        }
    };
    document.addEventListener('click', window.__ump_click_blocker__, true);
}
function deactivateGuard() {
    if (!window.ump_guard_active) return;
    if (window.__ump_originals__) {
        window.open = window.__ump_originals__.open;
        try {
            location.assign = window.__ump_originals__.assign;
            location.replace = window.__ump_originals__.replace;
        } catch(e) {}
    }
    if (window.__ump_click_blocker__) {
        document.removeEventListener('click', window.__ump_click_blocker__, true);
    }
    window.ump_guard_active = false;
}

console.log('🎬 UMP v3.0 (Video.js v10) loaded');
})();

