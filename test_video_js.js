/**
 * Universal Media Player v2.2 - Video.js Edition
 * - Tích hợp Video.js v10 thay cho video thô
 * - Giao diện kính mờ (Glassmorphism)
 * - Giữ nguyên quick selector, finder, bypass, menu
 * - Không auto fullscreen
 */
(function() {
    'use strict';
    
    var old = document.getElementById('__ump__');
    if (old) old.remove();
    
    // ========== PAGE INFO ==========
    var pageInfo = {
        title: (document.title || 'video').replace(/[^\w\s\u00C0-\u1EF9]/g, '').substring(0, 60).trim() || 'video',
        url: location.href,
        host: location.hostname.replace(/^www\./, ''),
        referer: location.origin + '/',
        origin: location.origin
    };
    
    // ========== FIND VIDEOS ==========
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
    
    var playable = arr.filter(function(x) { return x.type !== 'IFRAME'; });
    
    if (playable.length === 0) {
        showFinderPanel(arr);
        return;
    }
    
    if (playable.length === 1) {
        openPlayer(playable[0]);
    } else {
        showQuickSelector(playable, arr);
    }
    
    // ========== QUICK SELECTOR ==========
    function showQuickSelector(playable, all) {
        var overlay = document.createElement('div');
        overlay.id = '__ump__';
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:2147483647;display:flex;align-items:center;justify-content:center;padding:15px;font-family:Arial;';
        
        var html = '<div style="background:#fff;border:2px solid #4CAF50;border-radius:12px;padding:15px;max-width:450px;width:100%;color:#333;max-height:85vh;overflow-y:auto;box-shadow:0 10px 40px rgba(0,0,0,0.3);">';
        html += '<div style="text-align:center;margin-bottom:12px;">';
        html += '<h2 style="color:#4CAF50;margin:0;font-size:16px;">🎬 Chọn Stream (' + playable.length + ')</h2>';
        html += '</div>';
        
        playable.forEach(function(item, i) {
            var typeColor = item.type === 'M3U8' ? '#4CAF50' : (item.type === 'MP4' ? '#FF9800' : '#2196F3');
            html += '<div style="background:#f5f5f5;padding:10px;margin-bottom:6px;border-radius:6px;border-left:3px solid ' + typeColor + ';">';
            html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:5px;">';
            html += '<span style="background:' + typeColor + ';color:#fff;padding:2px 8px;border-radius:3px;font-size:10px;font-weight:bold;">#' + (i+1) + ' ' + item.type + '</span>';
            html += '<span style="color:#999;font-size:9px;">' + item.source + '</span>';
            html += '</div>';
            html += '<div style="font-family:monospace;font-size:9px;color:#666;word-break:break-all;margin-bottom:6px;max-height:30px;overflow-y:auto;">' + item.url.substring(0, 80) + '</div>';
            html += '<button class="__ump_play__" data-idx="' + i + '" style="background:#4CAF50;color:#fff;border:0;padding:8px;border-radius:4px;font-weight:bold;width:100%;cursor:pointer;font-size:12px;">▶️ Play</button>';
            html += '</div>';
        });
        
        if (all.length > playable.length) {
            html += '<button id="__ump_show_all__" style="background:#999;color:#fff;border:0;padding:8px;border-radius:5px;font-weight:bold;width:100%;margin-top:8px;font-size:12px;">📋 Xem tất cả (' + all.length + ')</button>';
        }
        
        html += '<button id="__ump_close__" style="background:#f44336;color:#fff;border:0;padding:8px;border-radius:5px;font-weight:bold;width:100%;margin-top:8px;font-size:12px;">✕ Hủy</button>';
        html += '</div>';
        
        overlay.innerHTML = html;
        document.body.appendChild(overlay);
        
        overlay.querySelectorAll('.__ump_play__').forEach(function(b) {
            b.onclick = function() {
                var idx = parseInt(this.dataset.idx);
                overlay.remove();
                openPlayer(playable[idx]);
            };
        });
        
        document.getElementById('__ump_close__').onclick = function() { overlay.remove(); };
        
        var showAll = document.getElementById('__ump_show_all__');
        if (showAll) {
            showAll.onclick = function() {
                overlay.remove();
                showFinderPanel(all);
            };
        }
    }
    
    // ========== FINDER PANEL ==========
    function showFinderPanel(arr) {
        var overlay = document.createElement('div');
        overlay.id = '__ump__';
        overlay.style.cssText = 'position:fixed;inset:0;background:#f5f5f5;z-index:2147483647;overflow-y:auto;padding:15px;color:#333;font-family:Arial;';
        
        var html = '<div style="text-align:center;margin-bottom:15px;">';
        html += '<h2 style="color:#4CAF50;margin:5px 0;">🎬 Media Finder (' + arr.length + ')</h2>';
        html += '</div>';
        
        if (arr.length === 0) {
            html += '<div style="text-align:center;padding:40px;color:#666;background:#fff;border-radius:8px;">❌ Không tìm thấy media<br><small>Bấm Play video trước rồi chạy lại</small></div>';
        } else {
            arr.forEach(function(item, i) {
                var typeColor = item.type === 'IFRAME' ? '#2196F3' : '#4CAF50';
                html += '<div style="background:#fff;padding:10px;margin-bottom:6px;border-radius:6px;border-left:3px solid ' + typeColor + ';box-shadow:0 1px 3px rgba(0,0,0,0.1);">';
                html += '<div style="display:flex;justify-content:space-between;margin-bottom:5px;">';
                html += '<span style="background:' + typeColor + ';color:#fff;padding:2px 8px;border-radius:3px;font-size:10px;font-weight:bold;">#' + (i+1) + ' ' + item.type + '</span>';
                html += '</div>';
                html += '<div style="font-family:monospace;font-size:9px;color:#666;word-break:break-all;margin-bottom:6px;max-height:40px;overflow-y:auto;">' + item.url + '</div>';
                html += '<div style="display:flex;gap:4px;flex-wrap:wrap;">';
                if (item.type === 'IFRAME') {
                    html += '<a href="' + item.url + '" style="background:#2196F3;color:#fff;padding:6px 10px;border-radius:4px;font-size:10px;text-decoration:none;flex:1;text-align:center;font-weight:bold;">➡️ Vào</a>';
                } else {
                    html += '<button class="__ump_play_alt__" data-idx="' + i + '" style="background:#4CAF50;color:#fff;border:0;padding:6px 10px;border-radius:4px;font-size:10px;font-weight:bold;flex:1;">▶️ Play</button>';
                }
                html += '<button class="__ump_copy__" data-url="' + encodeURIComponent(item.url) + '" style="background:#607D8B;color:#fff;border:0;padding:6px 10px;border-radius:4px;font-size:10px;font-weight:bold;flex:1;">📋 Copy</button>';
                html += '<button class="__ump_share__" data-url="' + encodeURIComponent(item.url) + '" style="background:#FF6B6B;color:#fff;border:0;padding:6px 10px;border-radius:4px;font-size:10px;font-weight:bold;flex:1;">📱 Share</button>';
                html += '</div>';
                html += '</div>';
            });
        }
        
        html += '<button id="__ump_close__" style="background:#f44336;color:#fff;border:0;padding:12px;border-radius:5px;font-weight:bold;width:100%;margin-top:15px;">✕ Đóng</button>';
        
        overlay.innerHTML = html;
        document.body.appendChild(overlay);
        
        overlay.querySelectorAll('.__ump_play_alt__').forEach(function(b) {
            b.onclick = function() {
                var idx = parseInt(this.dataset.idx);
                overlay.remove();
                openPlayer(arr[idx]);
            };
        });
        
        overlay.querySelectorAll('.__ump_copy__').forEach(function(b) {
            b.onclick = function() {
                copy(decodeURIComponent(this.dataset.url));
                this.innerText = '✓';
            };
        });
        
        overlay.querySelectorAll('.__ump_share__').forEach(function(b) {
            b.onclick = function() {
                shareUrl(decodeURIComponent(this.dataset.url));
            };
        });
        
        document.getElementById('__ump_close__').onclick = function() { overlay.remove(); };
    }
    
    // ========== PLAYER VỚI VIDEO.JS ==========
    var playerRef = null;
    var overlayRef = null;
    var videoElRef = null;
    var hlsRef = null;
    
    function openPlayer(streamInfo) {
        activateGuard();
        
        // Đóng player cũ nếu có
        if (overlayRef) {
            if (playerRef) {
                playerRef.dispose();
                playerRef = null;
            }
            if (videoElRef) {
                videoElRef.remove();
                videoElRef = null;
            }
            overlayRef.remove();
            overlayRef = null;
        }
        if (hlsRef) {
            hlsRef.destroy();
            hlsRef = null;
        }
        
        // Overlay
        var overlay = document.createElement('div');
        overlay.id = '__ump__';
        overlay.style.cssText = 'position:fixed;inset:0;background:#000;z-index:2147483647;display:flex;flex-direction:column;font-family:Arial;overflow:hidden;';
        document.body.appendChild(overlay);
        overlayRef = overlay;
        
        // Video wrapper (cho Video.js)
        var wrapper = document.createElement('div');
        wrapper.id = '__ump_wrapper__';
        wrapper.style.cssText = 'flex:1;display:flex;align-items:center;justify-content:center;background:#000;position:relative;';
        overlay.appendChild(wrapper);
        
        // Thẻ video
        var video = document.createElement('video');
        video.id = '__ump_video__';
        video.className = 'video-js vjs-big-play-centered vjs-default-skin';
        video.style.cssText = 'width:100%;height:100%;object-fit:contain;';
        video.setAttribute('playsinline', '');
        video.setAttribute('webkit-playsinline', '');
        video.setAttribute('crossorigin', 'anonymous');
        wrapper.appendChild(video);
        videoElRef = video;
        
        // Loading
        var loading = document.createElement('div');
        loading.id = '__ump_loading__';
        loading.innerHTML = '<div style="color:#fff;text-align:center;"><div style="font-size:36px;">⏳</div><div style="font-size:12px;margin-top:5px;">Loading...</div></div>';
        loading.style.cssText = 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);z-index:50;pointer-events:none;';
        wrapper.appendChild(loading);
        
        // ========== TOP BAR ==========
        var topBar = document.createElement('div');
        topBar.id = '__ump_topbar__';
        topBar.style.cssText = 'position:absolute;top:0;left:0;right:0;background:linear-gradient(180deg,rgba(0,0,0,0.8),transparent);padding:8px 10px;display:flex;justify-content:space-between;align-items:center;z-index:100;transition:opacity 0.3s;';
        topBar.innerHTML = 
            '<div style="color:#fff;font-size:11px;flex:1;overflow:hidden;padding-right:8px;">' +
                '<div style="font-weight:bold;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + pageInfo.title + '</div>' +
                '<div style="opacity:0.7;font-size:9px;">' + streamInfo.type + ' · ' + pageInfo.host + '</div>' +
            '</div>' +
            '<button id="__ump_menu_btn__" style="background:rgba(255,255,255,0.2);color:#fff;border:0;padding:6px 10px;border-radius:4px;margin-right:4px;font-size:12px;cursor:pointer;">⋮</button>' +
            '<button id="__ump_close_player__" style="background:rgba(244,67,54,0.9);color:#fff;border:0;padding:6px 10px;border-radius:4px;font-size:12px;font-weight:bold;cursor:pointer;">✕</button>';
        overlay.appendChild(topBar);
        
        // ========== TẢI VIDEO.JS ==========
        function loadVideoJS(callback) {
            if (typeof videojs !== 'undefined' && videojs.version && parseInt(videojs.version) >= 10) {
                callback();
                return;
            }
            var link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = 'https://cdn.jsdelivr.net/npm/video.js@10.2.1/dist/video-js.min.css';
            document.head.appendChild(link);
            var script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/npm/video.js@10.2.1/dist/video.min.js';
            script.onload = function() {
                var vhsScript = document.createElement('script');
                vhsScript.src = 'https://cdn.jsdelivr.net/npm/@videojs/http-streaming@3.2.0/dist/videojs-http-streaming.min.js';
                vhsScript.onload = callback;
                document.head.appendChild(vhsScript);
            };
            document.head.appendChild(script);
        }
        
        loadVideoJS(function() {
            // CSS kính mờ
            var glassStyle = document.createElement('style');
            glassStyle.id = '__ump_glass_css__';
            glassStyle.textContent = `
                .video-js .vjs-control-bar {
                    background: rgba(10, 12, 20, 0.7) !important;
                    backdrop-filter: blur(12px) saturate(130%) !important;
                    -webkit-backdrop-filter: blur(12px) saturate(130%) !important;
                    border-top: 1px solid rgba(255,255,255,0.1);
                }
                .video-js .vjs-big-play-button {
                    background: rgba(109, 140, 255, 0.3) !important;
                    backdrop-filter: blur(8px) !important;
                    border: 1px solid rgba(255,255,255,0.2) !important;
                    border-radius: 50% !important;
                    box-shadow: 0 0 30px rgba(109, 140, 255, 0.2);
                }
                .video-js .vjs-big-play-button:hover {
                    background: rgba(109, 140, 255, 0.5) !important;
                }
                .video-js .vjs-control {
                    color: #eee !important;
                }
                .video-js .vjs-progress-control .vjs-progress-holder {
                    background: rgba(255,255,255,0.15) !important;
                }
                .video-js .vjs-progress-control .vjs-play-progress {
                    background: #6d8cff !important;
                }
            `;
            document.head.appendChild(glassStyle);
            
            // Khởi tạo Video.js
            try {
                var player = videojs(video, {
                    autoplay: true,
                    controls: true,
                    responsive: true,
                    fluid: true,
                    html5: {
                        vhs: {
                            enableLowInitialPlaylist: true,
                            overrideNative: true
                        }
                    },
                    requestOptions: {
                        headers: {
                            'Referer': pageInfo.referer
                        }
                    }
                });
                playerRef = player;
                
                // Xóa loading khi đã sẵn sàng
                player.on('loadedmetadata', function() {
                    if (loading.parentNode) loading.remove();
                });
                
                // Xử lý lỗi
                player.on('error', function() {
                    var err = player.error();
                    console.error('Video.js error:', err);
                    var msg = err ? err.message : 'Không thể phát video';
                    if (loading.parentNode) {
                        loading.innerHTML = '<div style="color:#f44336;text-align:center;"><div style="font-size:30px;">❌</div><div style="font-size:12px;">' + msg + '</div></div>';
                    }
                });
                
                // Set source
                var url = streamInfo.url;
                var isHls = url.includes('.m3u8') || url.includes('m3u8');
                var sourceType = isHls ? 'application/x-mpegURL' : 'video/mp4';
                player.src({ src: url, type: sourceType });
                
                // Lưu player vào window để dùng từ menu
                window.__ump_player__ = player;
                window.__ump_stream__ = streamInfo;
                
            } catch(e) {
                console.error('Lỗi khởi tạo Video.js:', e);
                loading.innerHTML = '<div style="color:#f44336;text-align:center;"><div style="font-size:30px;">❌</div><div style="font-size:12px;">Lỗi: ' + e.message + '</div></div>';
            }
        });
        
        // ========== TOP BAR HANDLERS ==========
        document.getElementById('__ump_close_player__').onclick = function() {
            if (playerRef) {
                playerRef.dispose();
                playerRef = null;
            }
            if (videoElRef) {
                videoElRef.remove();
                videoElRef = null;
            }
            if (hlsRef) {
                hlsRef.destroy();
                hlsRef = null;
            }
            if (document.fullscreenElement) document.exitFullscreen().catch(function(){});
            if (screen.orientation && screen.orientation.unlock) screen.orientation.unlock();
            deactivateGuard();
            overlay.remove();
            overlayRef = null;
        };
        
        document.getElementById('__ump_menu_btn__').onclick = function() { 
            showMenu(streamInfo, videoElRef); 
        };
        
        // ========== AUTO HIDE TOP BAR ==========
        var hideTimer;
        function showControls() {
            topBar.style.opacity = '1';
            clearTimeout(hideTimer);
            hideTimer = setTimeout(function() {
                if (playerRef && !playerRef.paused()) {
                    topBar.style.opacity = '0';
                }
            }, 3000);
        }
        
        overlay.addEventListener('mousemove', showControls);
        overlay.addEventListener('touchstart', showControls);
        showControls();
    }
    
    // ========== MENU (giữ nguyên, thêm bypass) ==========
    function showMenu(streamInfo, video) {
        var menu = document.createElement('div');
        menu.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:2147483648;display:flex;align-items:center;justify-content:center;padding:15px;';
        
        var html = '<div style="background:#fff;border-radius:10px;padding:15px;max-width:350px;width:100%;color:#333;max-height:85vh;overflow-y:auto;box-shadow:0 10px 40px rgba(0,0,0,0.4);">';
        html += '<h3 style="color:#4CAF50;margin:0 0 12px;font-size:14px;">📋 Menu</h3>';
        html += '<div style="background:#f5f5f5;padding:8px;border-radius:6px;margin-bottom:12px;font-size:10px;color:#666;word-break:break-all;font-family:monospace;">' + streamInfo.url.substring(0, 100) + '</div>';
        
        html += '<div style="display:flex;flex-direction:column;gap:5px;">';
        html += '<button class="__ump_m__" data-a="copy-url" style="background:#607D8B;color:#fff;border:0;padding:10px;border-radius:5px;font-weight:bold;text-align:left;font-size:12px;cursor:pointer;">📋 Copy URL</button>';
        html += '<button class="__ump_m__" data-a="share-url" style="background:#FF6B6B;color:#fff;border:0;padding:10px;border-radius:5px;font-weight:bold;text-align:left;font-size:12px;cursor:pointer;">📱 Share (YTDLnis...)</button>';
        html += '<button class="__ump_m__" data-a="open-new" style="background:#2196F3;color:#fff;border:0;padding:10px;border-radius:5px;font-weight:bold;text-align:left;font-size:12px;cursor:pointer;">🔗 Mở tab mới</button>';
        html += '<button class="__ump_m__" data-a="dl-mp4" style="background:#FF9800;color:#fff;border:0;padding:10px;border-radius:5px;font-weight:bold;text-align:left;font-size:12px;cursor:pointer;">⬇️ Download trực tiếp</button>';
        html += '<button class="__ump_m__" data-a="dl-cmd" style="background:#9C27B0;color:#fff;border:0;padding:10px;border-radius:5px;font-weight:bold;text-align:left;font-size:12px;cursor:pointer;">💻 Copy yt-dlp cmd</button>';
        html += '<button class="__ump_m__" data-a="dl-ffmpeg" style="background:#795548;color:#fff;border:0;padding:10px;border-radius:5px;font-weight:bold;text-align:left;font-size:12px;cursor:pointer;">🎬 Copy FFmpeg cmd</button>';
        html += '<button class="__ump_m__" data-a="reload-video" style="background:#009688;color:#fff;border:0;padding:10px;border-radius:5px;font-weight:bold;text-align:left;font-size:12px;cursor:pointer;">🔄 Reload video</button>';
        html += '<button class="__ump_m__" data-a="rename" style="background:#3F51B5;color:#fff;border:0;padding:10px;border-radius:5px;font-weight:bold;text-align:left;font-size:12px;cursor:pointer;">✏️ Rename file</button>';
        html += '<button class="__ump_m__" data-a="bypass-menu" style="background:#FF5722;color:#fff;border:0;padding:10px;border-radius:5px;font-weight:bold;text-align:left;font-size:12px;cursor:pointer;">🛡️ Bypass Options...</button>';
        html += '<button class="__ump_m__" data-a="vjs-settings" style="background:#4CAF50;color:#fff;border:0;padding:10px;border-radius:5px;font-weight:bold;text-align:left;font-size:12px;cursor:pointer;">⚙️ Video.js Settings</button>';
        html += '</div>';
        html += '<button id="__ump_m_close__" style="background:#f44336;color:#fff;border:0;padding:10px;border-radius:5px;width:100%;margin-top:12px;font-weight:bold;font-size:12px;cursor:pointer;">← Back</button>';
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
                    var player = window.__ump_player__;
                    if (player) {
                        var cur = player.currentTime();
                        var src = player.src();
                        player.src({ src: src });
                        player.ready(function() { player.currentTime(cur); });
                    }
                    showToast('🔄 Reloaded', '#009688');
                }
                else if (a === 'rename') {
                    var n = prompt('Tên file mới:', pageInfo.title);
                    if (n) pageInfo.title = n.replace(/[^\w\s\u00C0-\u1EF9.-]/g, '').substring(0, 100);
                }
                else if (a === 'bypass-menu') {
                    menu.remove();
                    showBypassMenu(streamInfo);
                }
                else if (a === 'vjs-settings') {
                    var player = window.__ump_player__;
                    if (player) {
                        // Mở menu quality nếu có
                        var tech = player.tech();
                        var vhs = tech && tech.vhs;
                        if (vhs && vhs.playlists) {
                            var levels = [];
                            // Lấy các level
                            for (var i = 0; i < vhs.playlists.master.playlists.length; i++) {
                                var pl = vhs.playlists.master.playlists[i];
                                if (pl && pl.attributes) {
                                    levels.push({
                                        height: pl.attributes.RESOLUTION ? pl.attributes.RESOLUTION.height : 0,
                                        bitrate: pl.attributes.BANDWIDTH || 0,
                                        id: i
                                    });
                                }
                            }
                            if (levels.length > 0) {
                                showQualityPicker(levels, player);
                            } else {
                                showToast('Không có chất lượng để chọn', '#4CAF50');
                            }
                        } else {
                            showToast('Mở menu settings của Video.js trên thanh điều khiển', '#4CAF50');
                        }
                    }
                }
                if (a !== 'bypass-menu' && a !== 'vjs-settings') menu.remove();
            };
        });
        
        document.getElementById('__ump_m_close__').onclick = function() { menu.remove(); };
    }
    
    // ========== QUALITY PICKER ==========
    function showQualityPicker(levels, player) {
        var picker = document.createElement('div');
        picker.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:2147483649;display:flex;align-items:center;justify-content:center;padding:15px;';
        
        var html = '<div style="background:#fff;border-radius:10px;padding:15px;max-width:300px;width:100%;color:#333;">';
        html += '<h3 style="color:#9C27B0;margin:0 0 12px;font-size:14px;">🎞️ Chất lượng</h3>';
        html += '<button class="__ump_q__" data-level="-1" style="background:#9C27B0;color:#fff;border:0;padding:10px;border-radius:5px;width:100%;margin-bottom:4px;font-weight:bold;font-size:12px;cursor:pointer;">🤖 Auto</button>';
        levels.sort(function(a, b) { return a.height - b.height; });
        levels.forEach(function(level) {
            html += '<button class="__ump_q__" data-level="' + level.id + '" style="background:#eee;color:#333;border:0;padding:10px;border-radius:5px;width:100%;margin-bottom:4px;font-weight:bold;font-size:12px;cursor:pointer;">' + (level.height || '?') + 'p (' + Math.round(level.bitrate/1000) + 'k)</button>';
        });
        html += '<button id="__ump_q_close__" style="background:#f44336;color:#fff;border:0;padding:8px;border-radius:5px;width:100%;margin-top:8px;font-size:12px;cursor:pointer;">✕ Close</button>';
        html += '</div>';
        
        picker.innerHTML = html;
        document.body.appendChild(picker);
        
        picker.querySelectorAll('.__ump_q__').forEach(function(b) {
            b.onclick = function() {
                var levelId = parseInt(this.dataset.level);
                var tech = player.tech();
                var vhs = tech && tech.vhs;
                if (vhs) {
                    if (levelId === -1) {
                        vhs.playlists.media();
                    } else {
                        var pl = vhs.playlists.master.playlists[levelId];
                        if (pl) vhs.playlists.media(pl);
                    }
                    showToast('✓ Chất lượng đã thay đổi', '#9C27B0');
                }
                picker.remove();
            };
        });
        document.getElementById('__ump_q_close__').onclick = function() { picker.remove(); };
    }
    
    // ========== BYPASS MENU ==========
    function showBypassMenu(streamInfo) {
        var bmenu = document.createElement('div');
        bmenu.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:2147483649;display:flex;align-items:center;justify-content:center;padding:15px;font-family:Arial;';
        
        var html = '<div style="background:#fff;border-radius:10px;padding:15px;max-width:350px;width:100%;color:#333;">';
        html += '<h3 style="color:#FF5722;margin:0 0 12px;font-size:14px;">🛡️ Bypass Options</h3>';
        html += '<p style="font-size:11px;color:#666;margin-bottom:10px;">Dùng khi video bị chặn (Turbovid, Streamtape...)</p>';
        html += '<button class="__ump_bypass__" data-mode="direct" style="background:#4CAF50;color:#fff;border:0;padding:12px;border-radius:5px;width:100%;margin-bottom:6px;font-weight:bold;font-size:13px;cursor:pointer;">▶ Direct (mặc định)</button>';
        html += '<button class="__ump_bypass__" data-mode="proxy" style="background:#2196F3;color:#fff;border:0;padding:12px;border-radius:5px;width:100%;margin-bottom:6px;font-weight:bold;font-size:13px;cursor:pointer;">🔄 CORS Proxy (corsproxy.io)</button>';
        html += '<button class="__ump_bypass__" data-mode="redirect" style="background:#f44336;color:#fff;border:0;padding:12px;border-radius:5px;width:100%;margin-bottom:6px;font-weight:bold;font-size:13px;cursor:pointer;">↗ Redirect (mở tab gốc)</button>';
        html += '<button id="__ump_bypass_close__" style="background:#999;color:#fff;border:0;padding:10px;border-radius:5px;width:100%;margin-top:8px;font-size:12px;cursor:pointer;">← Quay lại</button>';
        html += '</div>';
        
        bmenu.innerHTML = html;
        document.body.appendChild(bmenu);
        
        bmenu.querySelectorAll('.__ump_bypass__').forEach(function(b) {
            b.onclick = function() {
                var mode = this.dataset.mode;
                bmenu.remove();
                
                var player = window.__ump_player__;
                var url = streamInfo.url;
                
                if (mode === 'redirect') {
                    window.location.href = url;
                    return;
                }
                
                var finalUrl = mode === 'proxy' ? 'https://corsproxy.io/?' + encodeURIComponent(url) : url;
                
                if (player) {
                    var isHls = finalUrl.includes('.m3u8') || finalUrl.includes('m3u8');
                    var sourceType = isHls ? 'application/x-mpegURL' : 'video/mp4';
                    player.src({ src: finalUrl, type: sourceType });
                    player.play();
                }
                showToast('🔄 Loaded: ' + mode, mode === 'proxy' ? '#2196F3' : '#4CAF50');
            };
        });
        
        document.getElementById('__ump_bypass_close__').onclick = function() {
            bmenu.remove();
            showMenu(streamInfo, document.getElementById('__ump_video__'));
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
    
    function takeScreenshot(video) {
        try {
            var canvas = document.createElement('canvas');
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            var ctx = canvas.getContext('2d');
            ctx.drawImage(video, 0, 0);
            canvas.toBlob(function(blob) {
                var a = document.createElement('a');
                a.href = URL.createObjectURL(blob);
                a.download = pageInfo.title + '_' + Math.floor(video.currentTime) + 's.png';
                a.click();
                setTimeout(function() { URL.revokeObjectURL(a.href); }, 1000);
                showToast('📸 Saved', '#4CAF50');
            });
        } catch(e) { showToast('❌ CORS error', '#f44336'); }
    }
    
    // ========== GUARD ==========
    function activateGuard() {
        if (window.__ump_guard_active__) return;
        window.__ump_guard_active__ = true;
        
        window.__ump_originals__ = {
            open: window.open,
            assign: location.assign,
            replace: location.replace
        };
        
        var blocked = 0;
        
        window.open = function(url) {
            blocked++;
            console.log('🚫 Blocked window.open:', url);
            return null;
        };
        
        try {
            location.assign = function(url) { blocked++; console.log('🚫 assign:', url); };
            location.replace = function(url) { blocked++; console.log('🚫 replace:', url); };
        } catch(e) {}
        
        window.onbeforeunload = null;
        
        window.__ump_click_blocker__ = function(e) {
            var link = e.target.closest('a');
            if (link && link.href && !link.href.startsWith('#') && !link.href.startsWith('javascript:')) {
                try {
                    var linkHost = new URL(link.href).hostname;
                    if (linkHost !== pageInfo.host) {
                        e.preventDefault();
                        e.stopPropagation();
                        blocked++;
                    }
                } catch(err) {}
            }
        };
        document.addEventListener('click', window.__ump_click_blocker__, true);
    }
    
    function deactivateGuard() {
        if (!window.__ump_guard_active__) return;
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
        window.__ump_guard_active__ = false;
    }
    
    console.log('🎬 UMP v2.2 - Video.js Edition loaded');
})();

