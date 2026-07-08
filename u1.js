/**
 * Universal Media Player v3.0 - FIXED
 * - DÙNG CODE QUÉT CỦA BẠN (urls Map + priority)
 * - CHỈ HIỆN STREAM LINK (M3U8, MPD, MP4, WEBM, MKV)
 * - UI đẹp, scan button, command modal
 */
(function() {
    'use strict';
    
    // Cleanup old instances
    var oldPlayer = document.getElementById('__ump__');
    if (oldPlayer) oldPlayer.remove();
    var oldBtn = document.getElementById('__ump_scan_btn__');
    if (oldBtn) oldBtn.remove();
    var oldBackdrop = document.getElementById('__ump_backdrop__');
    if (oldBackdrop) oldBackdrop.remove();
    var oldList = document.getElementById('__ump_media_list__');
    if (oldList) oldList.remove();
    var oldModal = document.getElementById('__ump_modal__');
    if (oldModal) oldModal.remove();
    var oldToast = document.getElementById('__ump_toast__');
    if (oldToast) oldToast.remove();
    var oldStyles = document.getElementById('__ump_styles__');
    if (oldStyles) oldStyles.remove();
    
    // ========== STYLES ==========
    var style = document.createElement('style');
    style.id = '__ump_styles__';
    style.textContent = 
        '#__ump_scan_btn__{position:fixed;bottom:20px;right:20px;background:#ff6b6b;color:#fff;border:none;padding:15px 20px;border-radius:50px;cursor:pointer;font-weight:bold;box-shadow:0 4px 12px rgba(255,107,107,0.4);z-index:2147483646;font-size:14px;font-family:Arial;transition:transform 0.2s}' +
        '#__ump_scan_btn__:active{transform:scale(0.95)}' +
        '#__ump_backdrop__{position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:2147483645;display:none}' +
        '#__ump_backdrop__.show{display:block}' +
        '#__ump_media_list__{position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:#1a1a1a;border-radius:8px;z-index:2147483647;max-width:90%;width:600px;max-height:80vh;display:none;flex-direction:column;box-shadow:0 8px 32px rgba(0,0,0,0.8);font-family:Arial}' +
        '#__ump_media_list__.show{display:flex}' +
        '#__ump_list_header__{background:#2a2a2a;padding:15px 20px;border-radius:8px 8px 0 0;display:flex;justify-content:space-between;align-items:center}' +
        '#__ump_list_title__{color:#fff;font-size:16px;font-weight:bold}' +
        '#__ump_list_content__{padding:10px;overflow-y:auto;flex:1;color:#fff}' +
        '.ump-item{background:#2a2a2a;padding:12px;margin:8px 0;border-radius:6px;cursor:pointer;transition:all 0.2s;border:2px solid transparent}' +
        '.ump-item:hover{background:#333;border-color:#ff6b6b}' +
        '.ump-item-title{font-size:13px;font-weight:500;margin-bottom:5px;word-break:break-all;color:#fff}' +
        '.ump-item-url{font-size:10px;color:#888;margin-bottom:5px;word-break:break-all;font-family:monospace}' +
        '.ump-item-info{color:#888;font-size:11px;display:flex;gap:8px;flex-wrap:wrap}' +
        '.ump-badge{padding:2px 8px;border-radius:3px;font-size:10px;font-weight:bold;color:#fff}' +
        '.ump-badge.m3u8{background:#9c27b0}.ump-badge.mpd{background:#2196f3}.ump-badge.mp4{background:#FF9800}.ump-badge.webm{background:#4CAF50}.ump-badge.mkv{background:#607D8B}' +
        '#__ump_modal__{position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:#1a1a1a;padding:20px;border-radius:8px;z-index:2147483647;max-width:90%;width:500px;max-height:80vh;overflow-y:auto;display:none;box-shadow:0 8px 32px rgba(0,0,0,0.8);font-family:Arial;color:#fff}' +
        '#__ump_modal__.show{display:block}' +
        '#__ump_toast__{position:fixed;bottom:80px;right:20px;background:#4CAF50;color:#fff;padding:12px 20px;border-radius:4px;z-index:2147483647;display:none;box-shadow:0 4px 12px rgba(0,0,0,0.3);font-family:Arial;font-size:13px}' +
        '#__ump_toast__.show{display:block}' +
        '@keyframes umpSlideIn{from{transform:translateX(400px);opacity:0}to{transform:translateX(0);opacity:1}}' +
        '#__ump_toast__.show{animation:umpSlideIn 0.3s ease}';
    document.head.appendChild(style);
    
    // ========== PAGE INFO ==========
    var pageInfo = {
        title: (document.title || 'video').replace(/[^\w\s\u00C0-\u1EF9]/g, '').substring(0, 60).trim() || 'video',
        url: location.href,
        host: location.hostname.replace(/^www\./, ''),
        referer: location.origin + '/',
        origin: location.origin
    };
    
    // ========== GLOBAL STATE ==========
    var streamItems = [];
    
    // ========== TẠO UI ==========
    var scanBtn = document.createElement('button');
    scanBtn.id = '__ump_scan_btn__';
    scanBtn.innerHTML = '🎬 Scan Media';
    scanBtn.onclick = scanMedia;
    document.body.appendChild(scanBtn);
    
    var backdrop = document.createElement('div');
    backdrop.id = '__ump_backdrop__';
    backdrop.onclick = closeAll;
    document.body.appendChild(backdrop);
    
    var mediaList = document.createElement('div');
    mediaList.id = '__ump_media_list__';
    mediaList.innerHTML = 
        '<div id="__ump_list_header__">' +
            '<div id="__ump_list_title__">📹 Stream Links</div>' +
            '<button id="__ump_close_list__" style="background:#ff6b6b;color:#fff;border:0;padding:8px 12px;border-radius:4px;cursor:pointer;font-size:12px">✕</button>' +
        '</div>' +
        '<div id="__ump_list_content__"></div>';
    document.body.appendChild(mediaList);
    
    var modal = document.createElement('div');
    modal.id = '__ump_modal__';
    modal.innerHTML = 
        '<h3 style="margin-top:0;color:#ff6b6b">📝 Lệnh Download</h3>' +
        '<textarea id="__ump_command__" readonly rows="6" style="width:100%;padding:10px;background:#2a2a2a;border:1px solid #444;color:#fff;border-radius:4px;font-family:monospace;font-size:12px;box-sizing:border-box;resize:vertical"></textarea>' +
        '<div style="display:flex;gap:10px;margin-top:10px">' +
            '<button id="__ump_copy_cmd__" style="flex:1;background:#4CAF50;color:#fff;border:0;padding:10px;border-radius:4px;cursor:pointer;font-weight:bold">📋 Copy</button>' +
            '<button id="__ump_close_modal__" style="flex:1;background:#ff6b6b;color:#fff;border:0;padding:10px;border-radius:4px;cursor:pointer;font-weight:bold">✕ Đóng</button>' +
        '</div>';
    document.body.appendChild(modal);
    
    var toast = document.createElement('div');
    toast.id = '__ump_toast__';
    document.body.appendChild(toast);
    
    // ========== EVENT LISTENERS ==========
    document.getElementById('__ump_close_list__').onclick = closeMediaList;
    document.getElementById('__ump_close_modal__').onclick = closeModal;
    document.getElementById('__ump_copy_cmd__').onclick = function() {
        copy(document.getElementById('__ump_command__').value);
        showToast('✅ Đã copy!', '#4CAF50');
    };
    
    // ========== QUÉT MEDIA - CODE GỐC CỦA BẠN ==========
    function scanMedia() {
        showToast('🔍 Đang quét stream...', '#ff6b6b');
        
        // === CODE QUÉT GỐC CỦA BẠN (KHÔNG SỬA) ===
        var urls = new Map();
        var patterns = [
            { re: /https?:\/\/[^\s"'<>()\\]+\.m3u8[^\s"'<>()\\]*/gi, type: 'M3U8', priority: 1 },
            { re: /https?:\/\/[^\s"'<>()\\]+\.mpd[^\s"'<>()\\]*/gi, type: 'MPD', priority: 2 },
            { re: /https?:\/\/[^\s"'<>()\\]+\.mp4[^\s"'<>()\\]*/gi, type: 'MP4', priority: 3 },
            { re: /https?:\/\/[^\s"'<>()\\]+\.webm[^\s"'<>()\\]*/gi, type: 'WEBM', priority: 4 },
            { re: /https?:\/\/[^\s"'<>()\\]+\.mkv[^\s"'<>()\\]*/gi, type: 'MKV', priority: 5 }
        ];
        
        function findUrls(text, source) {
            if (!text || typeof text !== 'string') return;
            patterns.forEach(function(p) {
                var matches = text.match(p.re);
                if (matches) {
                    matches.forEach(function(u) {
                        u = u.replace(/\\u002F/g, '/').replace(/\\\//g, '/').replace(/&amp;/g, '&').replace(/\\"/g, '');
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
                    if (i.src) {
                        // Vẫn add iframe để xem sau, nhưng không tính là stream
                        urls.set(i.src, { type: 'IFRAME', source: 'iframe#' + idx, priority: 99 });
                    }
                    try { if (i.contentDocument) scan(i.contentDocument, 'iframe#' + idx); } catch(e) {}
                });
            } catch(e) {}
        }
        
        scan(document, 'main');
        try {
            performance.getEntriesByType('resource').forEach(function(e) { findUrls(e.name, 'network'); });
        } catch(e) {}
        
        // === LỌC: CHỈ LẤY STREAM (M3U8, MPD, MP4, WEBM, MKV) ===
        var allUrls = [...urls.entries()].map(function(e) {
            return { url: e[0], type: e[1].type, source: e[1].source, priority: e[1].priority };
        }).sort(function(a, b) { return a.priority - b.priority; });
        
        // Lọc bỏ IFRAME
        streamItems = allUrls.filter(function(x) { return x.type !== 'IFRAME'; });
        
        // Thêm metadata
        streamItems.forEach(function(item) {
            item.filename = getFileName(item.url);
            item.quality = guessQuality(item.url);
        });
        
        // === HIỂN THỊ ===
        if (streamItems.length > 0) {
            showToast('✅ Tìm thấy ' + streamItems.length + ' stream', '#4CAF50');
            showMediaList();
        } else {
            // Nếu không có stream, hiển thị tất cả (bao gồm iframe)
            streamItems = allUrls;
            if (streamItems.length > 0) {
                showToast('⚠️ Chỉ tìm thấy ' + streamItems.length + ' link (không có stream)', '#FF9800');
                showMediaList();
            } else {
                showToast('❌ Không tìm thấy gì! Hãy bấm Play video trước', '#f44336');
            }
        }
    }
    
    // ========== HIỂN THỊ DANH SÁCH ==========
    function showMediaList() {
        var content = document.getElementById('__ump_list_content__');
        content.innerHTML = '';
        
        if (streamItems.length === 0) {
            content.innerHTML = '<div style="color:#888;text-align:center;padding:40px">Không có stream nào</div>';
        } else {
            streamItems.forEach(function(item, i) {
                var badgeClass = item.type.toLowerCase();
                
                var div = document.createElement('div');
                div.className = 'ump-item';
                div.innerHTML = 
                    '<div class="ump-item-title">#' + (i+1) + ' ' + item.filename + '</div>' +
                    '<div class="ump-item-url">' + item.url.substring(0, 100) + (item.url.length > 100 ? '...' : '') + '</div>' +
                    '<div class="ump-item-info">' +
                        '<span class="ump-badge ' + badgeClass + '">' + item.type + '</span>' +
                        (item.quality !== 'Auto' ? '<span class="ump-badge" style="background:#666">' + item.quality + '</span>' : '') +
                        '<span class="ump-badge" style="background:#555">' + item.source + '</span>' +
                    '</div>';
                
                div.onclick = function() {
                    closeMediaList();
                    openPlayer(item);
                };
                content.appendChild(div);
            });
        }
        
        backdrop.classList.add('show');
        mediaList.classList.add('show');
    }
    
    function closeMediaList() {
        backdrop.classList.remove('show');
        mediaList.classList.remove('show');
    }
    
    // ========== PLAYER ==========
    function openPlayer(streamInfo) {
        var overlay = document.createElement('div');
        overlay.id = '__ump__';
        overlay.style.cssText = 'position:fixed;inset:0;background:#000;z-index:2147483647;display:flex;flex-direction:column;font-family:Arial;overflow:hidden';
        
        var video = document.createElement('video');
        video.id = '__ump_video__';
        video.controls = false;
        video.style.cssText = 'width:100%;height:100%;position:absolute;top:0;left:0;object-fit:contain;background:#000';
        video.crossOrigin = 'anonymous';
        video.playsInline = true;
        video.autoplay = true;
        overlay.appendChild(video);
        
        var loading = document.createElement('div');
        loading.innerHTML = '<div style="color:#fff;text-align:center;background:rgba(0,0,0,0.7);padding:20px 30px;border-radius:10px">⏳<br><small>Loading...</small></div>';
        loading.style.cssText = 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);z-index:50';
        overlay.appendChild(loading);
        
        // Top bar
        var topBar = document.createElement('div');
        topBar.style.cssText = 'position:absolute;top:0;left:0;right:0;padding:10px;display:flex;justify-content:space-between;align-items:center;z-index:100;background:linear-gradient(180deg,rgba(0,0,0,0.8),transparent);transition:opacity 0.3s';
        topBar.innerHTML = 
            '<div style="color:#fff;font-size:12px;flex:1;overflow:hidden;padding-right:10px">' +
                '<div style="font-weight:bold;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + pageInfo.title + '</div>' +
                '<div style="opacity:0.7;font-size:9px">' + streamInfo.type + (streamInfo.quality !== 'Auto' ? ' · ' + streamInfo.quality : '') + '</div>' +
            '</div>' +
            '<button id="__ump_fs_btn__" style="background:rgba(255,255,255,0.2);color:#fff;border:0;width:32px;height:32px;border-radius:50%;font-size:16px;margin-right:4px;cursor:pointer">⛶</button>' +
            '<button id="__ump_menu_btn__" style="background:rgba(255,255,255,0.2);color:#fff;border:0;width:32px;height:32px;border-radius:50%;font-size:14px;margin-right:4px;cursor:pointer">⋮</button>' +
            '<button id="__ump_close_btn__" style="background:#f44336;color:#fff;border:0;width:32px;height:32px;border-radius:50%;font-size:14px;font-weight:bold;cursor:pointer">✕</button>';
        overlay.appendChild(topBar);
        
        // Controls
        var controls = document.createElement('div');
        controls.style.cssText = 'position:absolute;bottom:0;left:0;right:0;padding:15px 10px 10px;z-index:100;background:linear-gradient(0deg,rgba(0,0,0,0.85),transparent);transition:opacity 0.3s';
        controls.innerHTML = 
            '<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">' +
                '<span id="__ump_time_cur__" style="color:#fff;font-size:11px;font-family:monospace;min-width:40px">0:00</span>' +
                '<input type="range" id="__ump_seek__" min="0" max="100" value="0" step="0.1" style="flex:1;height:4px;-webkit-appearance:none;background:rgba(255,255,255,0.3);border-radius:2px;outline:none">' +
                '<span id="__ump_time_dur__" style="color:#fff;font-size:11px;font-family:monospace;min-width:40px">0:00</span>' +
            '</div>' +
            '<div style="display:flex;justify-content:center;align-items:center;gap:10px;margin-bottom:8px">' +
                '<button class="__ump_ctrl__" data-a="seek-10" style="background:rgba(255,255,255,0.2);color:#fff;border:0;padding:8px 14px;border-radius:4px;font-size:11px;font-weight:bold;cursor:pointer">⏪10s</button>' +
                '<button id="__ump_play_pause__" style="background:#4CAF50;color:#fff;border:0;padding:10px 20px;border-radius:20px;font-size:16px;font-weight:bold;cursor:pointer;min-width:50px">⏸</button>' +
                '<button class="__ump_ctrl__" data-a="seek+10" style="background:rgba(255,255,255,0.2);color:#fff;border:0;padding:8px 14px;border-radius:4px;font-size:11px;font-weight:bold;cursor:pointer">10s⏩</button>' +
            '</div>' +
            '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:4px;margin-bottom:4px">' +
                '<button class="__ump_ctrl__" data-a="speed-" style="background:rgba(255,255,255,0.15);color:#fff;border:0;padding:8px;border-radius:4px;font-size:10px;cursor:pointer">🐢</button>' +
                '<button id="__ump_speed_display__" style="background:rgba(76,175,80,0.4);color:#fff;border:0;padding:8px;border-radius:4px;font-size:10px;font-weight:bold;cursor:pointer">1x</button>' +
                '<button class="__ump_ctrl__" data-a="speed+" style="background:rgba(255,255,255,0.15);color:#fff;border:0;padding:8px;border-radius:4px;font-size:10px;cursor:pointer">🐰</button>' +
                '<button class="__ump_ctrl__" data-a="mute" style="background:rgba(255,255,255,0.15);color:#fff;border:0;padding:8px;border-radius:4px;font-size:10px;cursor:pointer">🔇</button>' +
            '</div>' +
            '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:4px;margin-bottom:4px">' +
                '<button class="__ump_ctrl__" data-a="bypass-direct" style="background:rgba(76,175,80,0.5);color:#fff;border:0;padding:8px;border-radius:4px;font-size:10px;cursor:pointer">▶ Direct</button>' +
                '<button class="__ump_ctrl__" data-a="bypass-proxy" style="background:rgba(33,150,243,0.5);color:#fff;border:0;padding:8px;border-radius:4px;font-size:10px;cursor:pointer">🔄 Proxy</button>' +
                '<button class="__ump_ctrl__" data-a="bypass-redirect" style="background:rgba(244,67,54,0.5);color:#fff;border:0;padding:8px;border-radius:4px;font-size:10px;cursor:pointer">↗ Redirect</button>' +
            '</div>' +
            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:4px">' +
                '<button class="__ump_ctrl__" data-a="cmd" style="background:rgba(156,39,176,0.5);color:#fff;border:0;padding:10px;border-radius:4px;font-size:11px;font-weight:bold;cursor:pointer">💻 yt-dlp</button>' +
                '<button class="__ump_ctrl__" data-a="share" style="background:rgba(255,107,107,0.5);color:#fff;border:0;padding:10px;border-radius:4px;font-size:11px;font-weight:bold;cursor:pointer">📱 Share</button>' +
            '</div>';
        overlay.appendChild(controls);
        document.body.appendChild(overlay);
        
        // === LOAD VIDEO ===
        var url = streamInfo.url;
        var hlsInstance = null;
        
        function loadVideoWithBypass(mode) {
            if (hlsInstance) { hlsInstance.destroy(); hlsInstance = null; }
            video.src = '';
            var finalUrl = url;
            
            if (mode === 'proxy') {
                finalUrl = 'https://corsproxy.io/?' + encodeURIComponent(url);
                showToast('🔄 Using CORS Proxy', '#2196F3');
            } else if (mode === 'redirect') {
                window.location.href = url;
                return;
            }
            
            if (streamInfo.type === 'M3U8') {
                if (window.Hls && Hls.isSupported()) {
                    loadHls(finalUrl);
                } else {
                    var s = document.createElement('script');
                    s.src = 'https://cdn.jsdelivr.net/npm/hls.js@latest';
                    s.onload = function() { loadHls(finalUrl); };
                    s.onerror = function() { video.src = finalUrl; };
                    document.head.appendChild(s);
                }
            } else if (streamInfo.type === 'MPD') {
                var s = document.createElement('script');
                s.src = 'https://cdn.jsdelivr.net/npm/dashjs@latest/dist/dash.all.min.js';
                s.onload = function() {
                    var player = dashjs.MediaPlayer().create();
                    player.initialize(video, finalUrl, true);
                };
                document.head.appendChild(s);
            } else {
                video.src = finalUrl;
            }
        }
        
        function loadHls(streamUrl) {
            if (!Hls.isSupported()) { video.src = streamUrl; return; }
            hlsInstance = new Hls({
                xhrSetup: function(xhr) { xhr.setRequestHeader('Referer', pageInfo.referer); }
            });
            hlsInstance.loadSource(streamUrl);
            hlsInstance.attachMedia(video);
            window.__ump_hls__ = hlsInstance;
        }
        
        loadVideoWithBypass('direct');
        
        // === VIDEO EVENTS ===
        video.addEventListener('loadedmetadata', function() {
            loading.remove();
            document.getElementById('__ump_time_dur__').textContent = formatTime(video.duration);
            document.getElementById('__ump_seek__').max = video.duration;
        });
        video.addEventListener('play', function() { document.getElementById('__ump_play_pause__').innerHTML = '⏸'; });
        video.addEventListener('pause', function() { document.getElementById('__ump_play_pause__').innerHTML = '▶'; });
        video.addEventListener('timeupdate', function() {
            document.getElementById('__ump_time_cur__').textContent = formatTime(video.currentTime);
            document.getElementById('__ump_seek__').value = video.currentTime;
        });
        video.addEventListener('waiting', function() { loading.style.display = 'block'; });
        video.addEventListener('canplay', function() { loading.style.display = 'none'; });
        video.addEventListener('error', function() {
            loading.innerHTML = '<div style="color:#f44336;text-align:center;background:rgba(0,0,0,0.8);padding:20px;border-radius:10px">❌<br>Video lỗi<br><small>Thử Bypass bên dưới</small></div>';
            loading.style.display = 'block';
        });
        
        // === HANDLERS ===
        document.getElementById('__ump_play_pause__').onclick = function() { video.paused ? video.play() : video.pause(); };
        document.getElementById('__ump_seek__').oninput = function() { video.currentTime = parseFloat(this.value); };
        
        controls.querySelectorAll('.__ump_ctrl__').forEach(function(b) {
            b.onclick = function() {
                var a = this.dataset.a;
                if (a === 'seek-10') video.currentTime = Math.max(0, video.currentTime - 10);
                else if (a === 'seek+10') video.currentTime = Math.min(video.duration, video.currentTime + 10);
                else if (a === 'speed-') { video.playbackRate = Math.max(0.25, video.playbackRate - 0.25); updateSpeed(); }
                else if (a === 'speed+') { video.playbackRate = Math.min(16, video.playbackRate + 0.25); updateSpeed(); }
                else if (a === 'mute') { video.muted = !video.muted; showToast(video.muted ? '🔇 Muted' : '🔊 Unmuted', '#666'); }
                else if (a === 'share') shareUrl(url);
                else if (a === 'cmd') showCommandModal(streamInfo);
                else if (a === 'bypass-direct') loadVideoWithBypass('direct');
                else if (a === 'bypass-proxy') loadVideoWithBypass('proxy');
                else if (a === 'bypass-redirect') loadVideoWithBypass('redirect');
            };
        });
        
        function updateSpeed() { document.getElementById('__ump_speed_display__').innerText = video.playbackRate + 'x'; }
        document.getElementById('__ump_speed_display__').onclick = function() { video.playbackRate = 1; updateSpeed(); };
        
        document.getElementById('__ump_fs_btn__').onclick = function() {
            if (!document.fullscreenElement) overlay.requestFullscreen({navigationUI:'hide'}).catch(function(){});
            else document.exitFullscreen().catch(function(){});
        };
        
        document.getElementById('__ump_menu_btn__').onclick = function() { showMenu(streamInfo); };
        
        document.getElementById('__ump_close_btn__').onclick = function() {
            video.pause(); video.src = '';
            if (hlsInstance) hlsInstance.destroy();
            if (document.fullscreenElement) document.exitFullscreen().catch(function(){});
            overlay.remove();
        };
        
        // Auto-hide controls
        var hideTimer;
        function resetHideTimer() {
            topBar.style.opacity = '1'; controls.style.opacity = '1';
            clearTimeout(hideTimer);
            hideTimer = setTimeout(function() {
                if (!video.paused) { topBar.style.opacity = '0'; controls.style.opacity = '0'; }
            }, 3000);
        }
        overlay.addEventListener('mousemove', resetHideTimer);
        overlay.addEventListener('touchstart', resetHideTimer);
        overlay.addEventListener('click', function(e) {
            if (e.target === video || e.target === overlay) { video.paused ? video.play() : video.pause(); }
            resetHideTimer();
        });
        resetHideTimer();
        
        // Media Session
        if ('mediaSession' in navigator) {
            navigator.mediaSession.metadata = new MediaMetadata({ title: pageInfo.title, artist: pageInfo.host });
            navigator.mediaSession.setActionHandler('play', function() { video.play(); });
            navigator.mediaSession.setActionHandler('pause', function() { video.pause(); });
            navigator.mediaSession.setActionHandler('seekbackward', function() { video.currentTime -= 10; });
            navigator.mediaSession.setActionHandler('seekforward', function() { video.currentTime += 10; });
        }
    }
    
    // ========== MENU ==========
    function showMenu(streamInfo) {
        var menu = document.createElement('div');
        menu.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:2147483648;display:flex;align-items:center;justify-content:center;padding:15px;font-family:Arial';
        menu.innerHTML = 
            '<div style="background:#1a1a1a;border-radius:10px;padding:15px;max-width:350px;width:100%;color:#fff;max-height:85vh;overflow-y:auto">' +
                '<h3 style="color:#ff6b6b;margin:0 0 12px">⚙️ Menu</h3>' +
                '<div style="background:#2a2a2a;padding:8px;border-radius:6px;margin-bottom:12px;font-size:10px;color:#aaa;word-break:break-all;font-family:monospace">' + streamInfo.url.substring(0, 100) + '</div>' +
                '<div style="display:flex;flex-direction:column;gap:5px">' +
                    '<button class="__ump_m__" data-a="copy-url" style="background:#607D8B;color:#fff;border:0;padding:10px;border-radius:5px;cursor:pointer;text-align:left">📋 Copy URL</button>' +
                    '<button class="__ump_m__" data-a="share-url" style="background:#FF6B6B;color:#fff;border:0;padding:10px;border-radius:5px;cursor:pointer;text-align:left">📱 Share</button>' +
                    '<button class="__ump_m__" data-a="cmd" style="background:#9C27B0;color:#fff;border:0;padding:10px;border-radius:5px;cursor:pointer;text-align:left">💻 yt-dlp Command</button>' +
                    '<button class="__ump_m__" data-a="cmd-ffmpeg" style="background:#795548;color:#fff;border:0;padding:10px;border-radius:5px;cursor:pointer;text-align:left">🎬 FFmpeg Command</button>' +
                    '<button class="__ump_m__" data-a="open-new" style="background:#2196F3;color:#fff;border:0;padding:10px;border-radius:5px;cursor:pointer;text-align:left">🔗 Mở tab mới</button>' +
                '</div>' +
                '<button id="__ump_m_close__" style="background:#f44336;color:#fff;border:0;padding:10px;border-radius:5px;width:100%;margin-top:12px;cursor:pointer">← Đóng</button>' +
            '</div>';
        document.body.appendChild(menu);
        
        menu.querySelectorAll('.__ump_m__').forEach(function(b) {
            b.onclick = function() {
                var a = this.dataset.a, url = streamInfo.url;
                if (a === 'copy-url') { copy(url); showToast('✓ Copied', '#4CAF50'); }
                else if (a === 'share-url') shareUrl(url);
                else if (a === 'cmd') { showCommandModal(streamInfo); menu.remove(); return; }
                else if (a === 'cmd-ffmpeg') {
                    copy('ffmpeg -headers "Referer: ' + pageInfo.referer + '" -i "' + url + '" -c copy "' + pageInfo.title + '.mp4"');
                    showToast('✓ FFmpeg copied', '#4CAF50');
                }
                else if (a === 'open-new') window.open(url, '_blank');
                menu.remove();
            };
        });
        document.getElementById('__ump_m_close__').onclick = function() { menu.remove(); };
    }
    
    // ========== COMMAND MODAL ==========
    function showCommandModal(streamInfo) {
        var cmd = 
            '# yt-dlp\nyt-dlp --referer "' + pageInfo.referer + '" -f best -o "' + pageInfo.title + '.%(ext)s" "' + streamInfo.url + '"\n\n' +
            '# yt-dlp + aria2c\nyt-dlp --external-downloader aria2c --external-downloader-args "-x 16 -k 1M" "' + streamInfo.url + '"\n\n' +
            '# FFmpeg\nffmpeg -headers "Referer: ' + pageInfo.referer + '" -i "' + streamInfo.url + '" -c copy "' + pageInfo.title + '.mp4"';
        
        document.getElementById('__ump_command__').value = cmd;
        backdrop.classList.add('show');
        modal.classList.add('show');
    }
    
    function closeModal() {
        backdrop.classList.remove('show');
        modal.classList.remove('show');
    }
    
    function closeAll() {
        closeMediaList();
        closeModal();
        var player = document.getElementById('__ump__');
        if (player) {
            var video = player.querySelector('video');
            if (video) { video.pause(); video.src = ''; }
            if (window.__ump_hls__) { window.__ump_hls__.destroy(); window.__ump_hls__ = null; }
            player.remove();
        }
    }
    
    // ========== HELPERS ==========
    function formatTime(sec) {
        if (isNaN(sec) || !isFinite(sec)) return '0:00';
        var h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = Math.floor(sec % 60);
        return (h > 0 ? h + ':' + (m < 10 ? '0' : '') : '') + m + ':' + (s < 10 ? '0' : '') + s;
    }
    
    function copy(text) {
        var t = document.createElement('textarea');
        t.value = text; document.body.appendChild(t); t.select();
        document.execCommand('copy'); t.remove();
    }
    
    function showToast(msg, color) {
        var t = document.getElementById('__ump_toast__');
        t.textContent = msg;
        t.style.background = color || '#4CAF50';
        t.classList.add('show');
        clearTimeout(t._timeout);
        t._timeout = setTimeout(function() { t.classList.remove('show'); }, 2500);
    }
    
    function shareUrl(url) {
        if (navigator.share) navigator.share({ title: pageInfo.title, url: url }).catch(function(){});
        else { copy(url); showToast('✓ Copied', '#4CAF50'); }
    }
    
    function guessQuality(url) {
        if (/2160p|4k/i.test(url)) return '4K';
        if (/1440p|2k/i.test(url)) return '2K';
        if (/1080p/i.test(url)) return '1080p';
        if (/720p/i.test(url)) return '720p';
        if (/480p/i.test(url)) return '480p';
        if (/360p/i.test(url)) return '360p';
        return 'Auto';
    }
    
    function getFileName(url) {
        try {
            var pathname = new URL(url).pathname;
            var name = pathname.split('/').pop().split('?')[0];
            return decodeURIComponent(name) || 'video_' + Date.now();
        } catch(e) { return 'video_' + Date.now(); }
    }
    
    console.log('🎬 UMP v3.0 Fixed - Dùng code quét của bạn, chỉ bắt stream');
})();