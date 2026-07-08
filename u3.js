/**
 * Universal Media Player v3.0 - Final
 * Code quét: V2 gốc của bạn (chuẩn, chỉ bắt stream)
 * UI: Scan button + Media list popup + Command modal
 */
(function() {
    'use strict';
    
    // ========== CLEANUP ==========
    ['__ump__', '__ump_scan_btn__', '__ump_backdrop__', '__ump_media_list__', '__ump_modal__', '__ump_toast__', '__ump_styles__'].forEach(function(id) {
        var el = document.getElementById(id);
        if (el) el.remove();
    });
    
    // ========== STYLES ==========
    var style = document.createElement('style');
    style.id = '__ump_styles__';
    style.textContent = 
        '#__ump_scan_btn__{position:fixed;bottom:20px;right:20px;background:#ff6b6b;color:#fff;border:none;padding:14px 22px;border-radius:50px;cursor:pointer;font-weight:bold;box-shadow:0 4px 15px rgba(255,107,107,0.5);z-index:2147483646;font-size:14px;font-family:Arial;transition:transform 0.2s}' +
        '#__ump_scan_btn__:active{transform:scale(0.95)}' +
        '#__ump_backdrop__{position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:2147483645;display:none}' +
        '#__ump_backdrop__.show{display:block}' +
        '#__ump_media_list__{position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:#1a1a1a;border-radius:10px;z-index:2147483647;max-width:90vw;width:550px;max-height:80vh;display:none;flex-direction:column;box-shadow:0 10px 40px rgba(0,0,0,0.8);font-family:Arial}' +
        '#__ump_media_list__.show{display:flex}' +
        '#__ump_list_header__{background:#2a2a2a;padding:14px 18px;border-radius:10px 10px 0 0;display:flex;justify-content:space-between;align-items:center}' +
        '#__ump_list_title__{color:#fff;font-size:15px;font-weight:bold}' +
        '#__ump_list_content__{padding:12px;overflow-y:auto;flex:1;color:#fff}' +
        '.ump-item{background:#2a2a2a;padding:11px 13px;margin:7px 0;border-radius:7px;cursor:pointer;border:2px solid transparent;transition:all 0.15s}' +
        '.ump-item:hover,.ump-item:active{background:#333;border-color:#ff6b6b}' +
        '.ump-item-title{font-size:13px;font-weight:bold;color:#fff;margin-bottom:4px;word-break:break-all}' +
        '.ump-item-url{font-size:10px;color:#999;margin-bottom:4px;word-break:break-all;font-family:monospace}' +
        '.ump-item-meta{display:flex;gap:6px;flex-wrap:wrap}' +
        '.ump-badge{padding:3px 8px;border-radius:4px;font-size:10px;font-weight:bold;color:#fff}' +
        '.ump-badge.m3u8{background:#9c27b0}.ump-badge.mpd{background:#2196f3}.ump-badge.mp4{background:#ff9800}.ump-badge.webm{background:#4caf50}.ump-badge.mkv{background:#607d8b}.ump-badge.iframe{background:#f44336}' +
        '#__ump_modal__{position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:#1a1a1a;padding:20px;border-radius:10px;z-index:2147483647;max-width:90vw;width:500px;max-height:80vh;overflow-y:auto;display:none;box-shadow:0 10px 40px rgba(0,0,0,0.8);font-family:Arial;color:#fff}' +
        '#__ump_modal__.show{display:block}' +
        '#__ump_toast__{position:fixed;bottom:90px;right:20px;padding:12px 20px;border-radius:8px;z-index:2147483647;display:none;font-family:Arial;font-size:13px;font-weight:bold;color:#fff;box-shadow:0 4px 15px rgba(0,0,0,0.4)}' +
        '#__ump_toast__.show{display:block;animation:umpFadeIn 0.3s ease}' +
        '@keyframes umpFadeIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}';
    document.head.appendChild(style);
    
    // ========== PAGE INFO ==========
    var pageInfo = {
        title: (document.title || 'video').replace(/[^\w\s\u00C0-\u1EF9]/g, '').substring(0, 60).trim() || 'video',
        url: location.href,
        host: location.hostname.replace(/^www\./, ''),
        referer: location.origin + '/',
        origin: location.origin
    };
    
    var streamItems = [];
    
    // ========== UI ELEMENTS ==========
    var scanBtn = document.createElement('button');
    scanBtn.id = '__ump_scan_btn__';
    scanBtn.textContent = '🎬 Scan Media';
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
            '<span id="__ump_list_title__">📹 Stream Links</span>' +
            '<button id="__ump_close_list__" style="background:#f44336;color:#fff;border:0;padding:7px 12px;border-radius:5px;cursor:pointer;font-size:12px;font-weight:bold">✕</button>' +
        '</div>' +
        '<div id="__ump_list_content__"></div>';
    document.body.appendChild(mediaList);
    
    var modal = document.createElement('div');
    modal.id = '__ump_modal__';
    modal.innerHTML = 
        '<h3 style="margin:0 0 12px;color:#ff6b6b">📝 Download Command</h3>' +
        '<textarea id="__ump_command__" readonly rows="6" style="width:100%;padding:10px;background:#2a2a2a;border:1px solid #444;color:#fff;border-radius:6px;font-family:monospace;font-size:11px;box-sizing:border-box;resize:vertical"></textarea>' +
        '<div style="display:flex;gap:10px;margin-top:12px">' +
            '<button id="__ump_copy_cmd__" style="flex:1;background:#4CAF50;color:#fff;border:0;padding:10px;border-radius:6px;cursor:pointer;font-weight:bold;font-size:13px">📋 Copy</button>' +
            '<button id="__ump_close_modal__" style="flex:1;background:#f44336;color:#fff;border:0;padding:10px;border-radius:6px;cursor:pointer;font-weight:bold;font-size:13px">✕ Close</button>' +
        '</div>';
    document.body.appendChild(modal);
    
    var toast = document.createElement('div');
    toast.id = '__ump_toast__';
    document.body.appendChild(toast);
    
    document.getElementById('__ump_close_list__').onclick = function() {
        mediaList.classList.remove('show');
        backdrop.classList.remove('show');
    };
    document.getElementById('__ump_close_modal__').onclick = function() {
        modal.classList.remove('show');
        backdrop.classList.remove('show');
    };
    document.getElementById('__ump_copy_cmd__').onclick = function() {
        copyText(document.getElementById('__ump_command__').value);
        showToast('✅ Copied!', '#4CAF50');
    };
    
    // ========== SCAN MEDIA (CODE GỐC V2 CỦA BẠN) ==========
    function scanMedia() {
        showToast('🔍 Đang quét...', '#ff6b6b');
        
        // === CODE QUÉT GỐC - KHÔNG SỬA ===
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
                    if (i.src) urls.set(i.src, { type: 'IFRAME', source: 'iframe#' + idx, priority: 99 });
                    try { if (i.contentDocument) scan(i.contentDocument, 'iframe#' + idx); } catch(e) {}
                });
            } catch(e) {}
        }
        
        scan(document, 'main');
        try {
            performance.getEntriesByType('resource').forEach(function(e) { findUrls(e.name, 'network'); });
        } catch(e) {}
        
        var arr = [...urls.entries()].map(function(e) {
            return { url: e[0], type: e[1].type, source: e[1].source, priority: e[1].priority };
        }).sort(function(a, b) { return a.priority - b.priority; });
        
        streamItems = arr.filter(function(x) { return x.type !== 'IFRAME'; });
        
        // Thêm filename + quality
        streamItems.forEach(function(item) {
            item.filename = getFileName(item.url);
            item.quality = guessQuality(item.url);
        });
        
        // Hiển thị
        if (streamItems.length > 0) {
            showToast('✅ Tìm thấy ' + streamItems.length + ' stream', '#4CAF50');
        } else if (arr.length > 0) {
            streamItems = arr;
            showToast('⚠️ Chỉ có ' + arr.length + ' link/iframe', '#FF9800');
        } else {
            showToast('❌ Không tìm thấy gì', '#f44336');
        }
        
        showMediaList();
    }
    
    function showMediaList() {
        var content = document.getElementById('__ump_list_content__');
        content.innerHTML = '';
        
        if (streamItems.length === 0) {
            content.innerHTML = '<div style="text-align:center;padding:40px;color:#888">😕 Không tìm thấy stream nào<br><small>Hãy bấm Play video rồi thử lại</small></div>';
        } else {
            streamItems.forEach(function(item, i) {
                var typeClass = item.type.toLowerCase();
                var div = document.createElement('div');
                div.className = 'ump-item';
                div.innerHTML = 
                    '<div class="ump-item-title">#' + (i+1) + ' ' + escapeHTML(item.filename) + '</div>' +
                    '<div class="ump-item-url">' + escapeHTML(item.url.substring(0, 90)) + (item.url.length > 90 ? '...' : '') + '</div>' +
                    '<div class="ump-item-meta">' +
                        '<span class="ump-badge ' + typeClass + '">' + item.type + '</span>' +
                        (item.quality !== 'Auto' ? '<span class="ump-badge" style="background:#666">' + item.quality + '</span>' : '') +
                        '<span class="ump-badge" style="background:#444">' + item.source + '</span>' +
                    '</div>';
                div.onclick = function() {
                    mediaList.classList.remove('show');
                    backdrop.classList.remove('show');
                    openPlayer(item);
                };
                content.appendChild(div);
            });
        }
        
        mediaList.classList.add('show');
        backdrop.classList.add('show');
    }
    
    // ========== PLAYER ==========
    function openPlayer(streamInfo) {
        var overlay = document.createElement('div');
        overlay.id = '__ump__';
        overlay.style.cssText = 'position:fixed;inset:0;background:#000;z-index:2147483647;font-family:Arial;overflow:hidden';
        
        var video = document.createElement('video');
        video.style.cssText = 'width:100%;height:100%;position:absolute;top:0;left:0;object-fit:contain;background:#000';
        video.crossOrigin = 'anonymous';
        video.playsInline = true;
        video.autoplay = true;
        overlay.appendChild(video);
        
        // Loading
        var loading = document.createElement('div');
        loading.innerHTML = '<div style="background:rgba(0,0,0,0.7);color:#fff;padding:18px 28px;border-radius:10px;text-align:center;font-size:14px">⏳<br><small>Loading...</small></div>';
        loading.style.cssText = 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);z-index:50;pointer-events:none';
        overlay.appendChild(loading);
        
        // Top bar
        var topBar = document.createElement('div');
        topBar.style.cssText = 'position:absolute;top:0;left:0;right:0;padding:10px 12px;display:flex;align-items:center;gap:6px;z-index:100;background:linear-gradient(180deg,rgba(0,0,0,0.85),transparent);transition:opacity 0.3s';
        topBar.innerHTML = 
            '<span style="color:#fff;font-size:12px;font-weight:bold;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + escapeHTML(pageInfo.title) + '</span>' +
            '<button id="__ump_fs_btn__" style="background:rgba(255,255,255,0.2);color:#fff;border:0;width:34px;height:34px;border-radius:50%;font-size:16px;cursor:pointer;flex-shrink:0">⛶</button>' +
            '<button id="__ump_menu_btn__" style="background:rgba(255,255,255,0.2);color:#fff;border:0;width:34px;height:34px;border-radius:50%;font-size:14px;cursor:pointer;flex-shrink:0">⋮</button>' +
            '<button id="__ump_close_btn__" style="background:#f44336;color:#fff;border:0;width:34px;height:34px;border-radius:50%;font-size:16px;font-weight:bold;cursor:pointer;flex-shrink:0">✕</button>';
        overlay.appendChild(topBar);
        
        // Controls
        var controls = document.createElement('div');
        controls.style.cssText = 'position:absolute;bottom:0;left:0;right:0;padding:12px 10px 12px;z-index:100;background:linear-gradient(0deg,rgba(0,0,0,0.9),transparent);transition:opacity 0.3s';
        controls.innerHTML = 
            '<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">' +
                '<span id="__ump_cur__" style="color:#fff;font-size:11px;font-family:monospace;min-width:38px">0:00</span>' +
                '<input type="range" id="__ump_seek__" min="0" max="100" value="0" step="0.1" style="flex:1;height:5px;appearance:none;-webkit-appearance:none;background:rgba(255,255,255,0.3);border-radius:3px;outline:none;cursor:pointer">' +
                '<span id="__ump_dur__" style="color:#fff;font-size:11px;font-family:monospace;min-width:38px">0:00</span>' +
            '</div>' +
            '<div style="display:flex;justify-content:center;gap:8px;margin-bottom:8px">' +
                '<button data-a="seek-10" style="background:rgba(255,255,255,0.2);color:#fff;border:0;padding:8px 14px;border-radius:6px;font-size:11px;font-weight:bold;cursor:pointer">⏪ 10s</button>' +
                '<button id="__ump_play__" style="background:#4CAF50;color:#fff;border:0;padding:8px 20px;border-radius:20px;font-size:16px;font-weight:bold;cursor:pointer;min-width:55px">⏸</button>' +
                '<button data-a="seek+10" style="background:rgba(255,255,255,0.2);color:#fff;border:0;padding:8px 14px;border-radius:6px;font-size:11px;font-weight:bold;cursor:pointer">10s ⏩</button>' +
            '</div>' +
            '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:5px;margin-bottom:5px">' +
                '<button data-a="speed-" style="background:rgba(255,255,255,0.12);color:#fff;border:0;padding:8px;border-radius:5px;font-size:11px;cursor:pointer">🐢</button>' +
                '<button id="__ump_spd__" style="background:rgba(76,175,80,0.4);color:#fff;border:0;padding:8px;border-radius:5px;font-size:11px;font-weight:bold;cursor:pointer">1x</button>' +
                '<button data-a="speed+" style="background:rgba(255,255,255,0.12);color:#fff;border:0;padding:8px;border-radius:5px;font-size:11px;cursor:pointer">🐰</button>' +
                '<button data-a="mute" style="background:rgba(255,255,255,0.12);color:#fff;border:0;padding:8px;border-radius:5px;font-size:11px;cursor:pointer">🔇</button>' +
            '</div>' +
            '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:5px;margin-bottom:5px">' +
                '<button data-a="direct" style="background:rgba(76,175,80,0.5);color:#fff;border:0;padding:9px;border-radius:5px;font-size:11px;font-weight:bold;cursor:pointer">▶ Direct</button>' +
                '<button data-a="proxy" style="background:rgba(33,150,243,0.5);color:#fff;border:0;padding:9px;border-radius:5px;font-size:11px;font-weight:bold;cursor:pointer">🔄 Proxy</button>' +
                '<button data-a="redirect" style="background:rgba(244,67,54,0.5);color:#fff;border:0;padding:9px;border-radius:5px;font-size:11px;font-weight:bold;cursor:pointer">↗ Redirect</button>' +
            '</div>' +
            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:5px">' +
                '<button data-a="cmd" style="background:rgba(156,39,176,0.5);color:#fff;border:0;padding:10px;border-radius:5px;font-size:12px;font-weight:bold;cursor:pointer">💻 yt-dlp</button>' +
                '<button data-a="share" style="background:rgba(255,107,107,0.5);color:#fff;border:0;padding:10px;border-radius:5px;font-size:12px;font-weight:bold;cursor:pointer">📱 Share</button>' +
            '</div>';
        overlay.appendChild(controls);
        
        document.body.appendChild(overlay);
        
        // === LOAD VIDEO ===
        var url = streamInfo.url;
        var hlsInstance = null;
        
        function loadStream(mode) {
            if (hlsInstance) { hlsInstance.destroy(); hlsInstance = null; }
            video.src = '';
            var finalUrl = url;
            
            if (mode === 'proxy') {
                finalUrl = 'https://corsproxy.io/?' + encodeURIComponent(url);
                showToast('🔄 CORS Proxy', '#2196F3');
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
                    dashjs.MediaPlayer().create().initialize(video, finalUrl, true);
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
        }
        
        loadStream('direct');
        
        // === VIDEO EVENTS ===
        video.addEventListener('loadedmetadata', function() {
            loading.remove();
            document.getElementById('__ump_dur__').textContent = formatTime(video.duration);
            document.getElementById('__ump_seek__').max = video.duration;
        });
        video.addEventListener('play', function() { document.getElementById('__ump_play__').textContent = '⏸'; });
        video.addEventListener('pause', function() { document.getElementById('__ump_play__').textContent = '▶'; });
        video.addEventListener('timeupdate', function() {
            document.getElementById('__ump_cur__').textContent = formatTime(video.currentTime);
            document.getElementById('__ump_seek__').value = video.currentTime;
        });
        video.addEventListener('waiting', function() { loading.style.display = 'block'; });
        video.addEventListener('canplay', function() { loading.style.display = 'none'; });
        video.addEventListener('error', function() {
            loading.innerHTML = '<div style="background:rgba(0,0,0,0.9);color:#f44336;padding:18px 25px;border-radius:10px;text-align:center">❌<br><small>Lỗi - Thử Bypass</small></div>';
            loading.style.display = 'block';
        });
        
        // === HANDLERS ===
        document.getElementById('__ump_play__').onclick = function() {
            video.paused ? video.play() : video.pause();
        };
        document.getElementById('__ump_seek__').oninput = function() {
            video.currentTime = parseFloat(this.value);
        };
        
        controls.querySelectorAll('button[data-a]').forEach(function(btn) {
            btn.onclick = function() {
                var a = this.dataset.a;
                if (a === 'seek-10') video.currentTime = Math.max(0, video.currentTime - 10);
                if (a === 'seek+10') video.currentTime = Math.min(video.duration || Infinity, video.currentTime + 10);
                if (a === 'speed-') { video.playbackRate = Math.max(0.25, video.playbackRate - 0.25); updateSpd(); }
                if (a === 'speed+') { video.playbackRate = Math.min(16, video.playbackRate + 0.25); updateSpd(); }
                if (a === 'mute') { video.muted = !video.muted; showToast(video.muted ? '🔇 Muted' : '🔊 Sound', '#666'); }
                if (a === 'share') shareUrl(url);
                if (a === 'cmd') showCommandModal(streamInfo);
                if (a === 'direct') loadStream('direct');
                if (a === 'proxy') loadStream('proxy');
                if (a === 'redirect') loadStream('redirect');
            };
        });
        
        function updateSpd() { document.getElementById('__ump_spd__').textContent = video.playbackRate + 'x'; }
        document.getElementById('__ump_spd__').onclick = function() { video.playbackRate = 1; updateSpd(); };
        
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
        
        // Auto-hide
        var hideTimer;
        function showCtrl() {
            topBar.style.opacity = '1'; controls.style.opacity = '1';
            clearTimeout(hideTimer);
            hideTimer = setTimeout(function() {
                if (!video.paused) { topBar.style.opacity = '0'; controls.style.opacity = '0'; }
            }, 3000);
        }
        overlay.addEventListener('mousemove', showCtrl);
        overlay.addEventListener('touchstart', showCtrl);
        overlay.addEventListener('click', function(e) {
            if (e.target === video || e.target === overlay) { video.paused ? video.play() : video.pause(); }
            showCtrl();
        });
        showCtrl();
    }
    
    // ========== MENU ==========
    function showMenu(streamInfo) {
        var menu = document.createElement('div');
        menu.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:2147483648;display:flex;align-items:center;justify-content:center;padding:15px;font-family:Arial';
        menu.innerHTML = 
            '<div style="background:#1a1a1a;border-radius:10px;padding:16px;max-width:350px;width:100%;color:#fff;max-height:85vh;overflow-y:auto">' +
                '<h3 style="color:#ff6b6b;margin:0 0 12px">⚙️ Menu</h3>' +
                '<div style="background:#2a2a2a;padding:8px;border-radius:6px;margin-bottom:12px;font-size:10px;color:#aaa;word-break:break-all;font-family:monospace">' + escapeHTML(streamInfo.url.substring(0, 100)) + '</div>' +
                '<div style="display:flex;flex-direction:column;gap:6px">' +
                    '<button data-m="copy" style="background:#607D8B;color:#fff;border:0;padding:10px;border-radius:6px;cursor:pointer;text-align:left;font-size:12px">📋 Copy URL</button>' +
                    '<button data-m="share" style="background:#FF6B6B;color:#fff;border:0;padding:10px;border-radius:6px;cursor:pointer;text-align:left;font-size:12px">📱 Share</button>' +
                    '<button data-m="cmd" style="background:#9C27B0;color:#fff;border:0;padding:10px;border-radius:6px;cursor:pointer;text-align:left;font-size:12px">💻 yt-dlp Command</button>' +
                    '<button data-m="ffmpeg" style="background:#795548;color:#fff;border:0;padding:10px;border-radius:6px;cursor:pointer;text-align:left;font-size:12px">🎬 FFmpeg Command</button>' +
                    '<button data-m="open" style="background:#2196F3;color:#fff;border:0;padding:10px;border-radius:6px;cursor:pointer;text-align:left;font-size:12px">🔗 Open in New Tab</button>' +
                '</div>' +
                '<button id="__ump_m_close__" style="background:#f44336;color:#fff;border:0;padding:10px;border-radius:6px;width:100%;margin-top:12px;cursor:pointer;font-size:12px;font-weight:bold">← Close</button>' +
            '</div>';
        document.body.appendChild(menu);
        
        menu.querySelectorAll('[data-m]').forEach(function(btn) {
            btn.onclick = function() {
                var m = this.dataset.m;
                var url = streamInfo.url;
                if (m === 'copy') { copyText(url); showToast('✓ Copied', '#4CAF50'); }
                if (m === 'share') shareUrl(url);
                if (m === 'cmd') { showCommandModal(streamInfo); menu.remove(); return; }
                if (m === 'ffmpeg') { copyText('ffmpeg -headers "Referer: ' + pageInfo.referer + '" -i "' + url + '" -c copy "' + pageInfo.title + '.mp4"'); showToast('✓ Copied', '#4CAF50'); }
                if (m === 'open') window.open(url, '_blank');
                menu.remove();
            };
        });
        document.getElementById('__ump_m_close__').onclick = function() { menu.remove(); };
    }
    
    // ========== COMMAND MODAL ==========
    function showCommandModal(streamInfo) {
        document.getElementById('__ump_command__').value = 
            '# yt-dlp\nyt-dlp --referer "' + pageInfo.referer + '" -f best -o "' + pageInfo.title + '.%(ext)s" "' + streamInfo.url + '"\n\n' +
            '# yt-dlp + aria2c\nyt-dlp --external-downloader aria2c -x 16 -k 1M "' + streamInfo.url + '"\n\n' +
            '# FFmpeg\nffmpeg -headers "Referer: ' + pageInfo.referer + '" -i "' + streamInfo.url + '" -c copy "' + pageInfo.title + '.mp4"';
        backdrop.classList.add('show');
        modal.classList.add('show');
    }
    
    function closeAll() {
        var player = document.getElementById('__ump__');
        if (player) {
            var v = player.querySelector('video');
            if (v) { v.pause(); v.src = ''; }
            if (window.__ump_hls__) { window.__ump_hls__.destroy(); window.__ump_hls__ = null; }
            player.remove();
        }
        mediaList.classList.remove('show');
        modal.classList.remove('show');
        backdrop.classList.remove('show');
    }
    
    // ========== HELPERS ==========
    function formatTime(s) {
        if (isNaN(s) || !isFinite(s)) return '0:00';
        var h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60);
        return (h > 0 ? h + ':' + (m < 10 ? '0' : '') : '') + m + ':' + (sec < 10 ? '0' : '') + sec;
    }
    
    function copyText(text) {
        var t = document.createElement('textarea');
        t.value = text; t.style.position = 'fixed'; t.style.left = '-9999px';
        document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove();
    }
    
    function showToast(msg, bg) {
        var t = document.getElementById('__ump_toast__');
        t.textContent = msg; t.style.background = bg || '#4CAF50';
        t.classList.add('show');
        clearTimeout(t._t);
        t._t = setTimeout(function() { t.classList.remove('show'); }, 2500);
    }
    
    function shareUrl(url) {
        if (navigator.share) navigator.share({ title: pageInfo.title, url: url }).catch(function(){});
        else { copyText(url); showToast('✓ Copied', '#4CAF50'); }
    }
    
    function getFileName(url) {
        try {
            var name = new URL(url).pathname.split('/').pop().split('?')[0];
            return decodeURIComponent(name) || 'video';
        } catch(e) { return 'video'; }
    }
    
    function guessQuality(url) {
        if (/2160|4k/i.test(url)) return '4K';
        if (/1440|2k/i.test(url)) return '2K';
        if (/1080/i.test(url)) return '1080p';
        if (/720/i.test(url)) return '720p';
        if (/480/i.test(url)) return '480p';
        if (/360/i.test(url)) return '360p';
        return 'Auto';
    }
    
    function escapeHTML(str) {
        var div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }
    
    console.log('🎬 UMP v3 Final - Code quét V2 + UI đẹp');
})();