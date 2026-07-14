/**
 * Universal Media Player v2.4 - Native Player (Fast & Stable)
 * - Dùng video native với UI tùy chỉnh
 * - Không cần tải CDN, nhanh hơn
 * - Đủ tính năng: play/pause, tua, tốc độ, toàn màn hình, PiP
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
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:2147483647;display:flex;align-items:center;justify-content:center;padding:15px;font-family:Arial,Helvetica,sans-serif;';
        
        var html = '<div style="background:#fff;border-radius:16px;padding:20px;max-width:500px;width:100%;color:#333;max-height:85vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,0.5);">';
        html += '<div style="text-align:center;margin-bottom:16px;">';
        html += '<h2 style="color:#4CAF50;margin:0;font-size:18px;">🎬 Chọn Stream</h2>';
        html += '<span style="font-size:12px;color:#999;">' + playable.length + ' luồng tìm thấy</span>';
        html += '</div>';
        
        playable.forEach(function(item, i) {
            var typeColor = item.type === 'M3U8' ? '#4CAF50' : (item.type === 'MP4' ? '#FF9800' : '#2196F3');
            html += '<div style="background:#f5f5f5;padding:12px;margin-bottom:8px;border-radius:10px;border-left:4px solid ' + typeColor + ';">';
            html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">';
            html += '<span style="background:' + typeColor + ';color:#fff;padding:2px 10px;border-radius:4px;font-size:10px;font-weight:bold;">#' + (i+1) + ' ' + item.type + '</span>';
            html += '<span style="color:#999;font-size:9px;">' + item.source + '</span>';
            html += '</div>';
            html += '<div style="font-family:monospace;font-size:10px;color:#666;word-break:break-all;margin-bottom:8px;max-height:32px;overflow:hidden;">' + item.url.substring(0, 80) + '</div>';
            html += '<button class="__ump_play__" data-idx="' + i + '" style="background:#4CAF50;color:#fff;border:0;padding:10px;border-radius:8px;font-weight:bold;width:100%;cursor:pointer;font-size:13px;transition:0.2s;">▶️ Xem</button>';
            html += '</div>';
        });
        
        if (all.length > playable.length) {
            html += '<button id="__ump_show_all__" style="background:#999;color:#fff;border:0;padding:10px;border-radius:8px;font-weight:bold;width:100%;margin-top:8px;font-size:12px;cursor:pointer;">📋 Xem tất cả (' + all.length + ')</button>';
        }
        
        html += '<button id="__ump_close__" style="background:#f44336;color:#fff;border:0;padding:10px;border-radius:8px;font-weight:bold;width:100%;margin-top:8px;font-size:13px;cursor:pointer;">✕ Đóng</button>';
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
        overlay.style.cssText = 'position:fixed;inset:0;background:#f5f5f5;z-index:2147483647;overflow-y:auto;padding:15px;color:#333;font-family:Arial,Helvetica,sans-serif;';
        
        var html = '<div style="text-align:center;margin-bottom:15px;">';
        html += '<h2 style="color:#4CAF50;margin:5px 0;">🎬 Media Finder (' + arr.length + ')</h2>';
        html += '</div>';
        
        if (arr.length === 0) {
            html += '<div style="text-align:center;padding:40px;color:#666;background:#fff;border-radius:8px;">❌ Không tìm thấy media<br><small>Bấm Play video trước rồi chạy lại</small></div>';
        } else {
            arr.forEach(function(item, i) {
                var typeColor = item.type === 'IFRAME' ? '#2196F3' : '#4CAF50';
                html += '<div style="background:#fff;padding:12px;margin-bottom:8px;border-radius:10px;border-left:4px solid ' + typeColor + ';box-shadow:0 2px 8px rgba(0,0,0,0.08);">';
                html += '<div style="display:flex;justify-content:space-between;margin-bottom:5px;">';
                html += '<span style="background:' + typeColor + ';color:#fff;padding:2px 10px;border-radius:4px;font-size:10px;font-weight:bold;">#' + (i+1) + ' ' + item.type + '</span>';
                html += '</div>';
                html += '<div style="font-family:monospace;font-size:9px;color:#666;word-break:break-all;margin-bottom:8px;max-height:40px;overflow-y:auto;">' + item.url + '</div>';
                html += '<div style="display:flex;gap:4px;flex-wrap:wrap;">';
                if (item.type === 'IFRAME') {
                    html += '<a href="' + item.url + '" style="background:#2196F3;color:#fff;padding:8px 12px;border-radius:6px;font-size:11px;text-decoration:none;flex:1;text-align:center;font-weight:bold;">➡️ Vào</a>';
                } else {
                    html += '<button class="__ump_play_alt__" data-idx="' + i + '" style="background:#4CAF50;color:#fff;border:0;padding:8px 12px;border-radius:6px;font-size:11px;font-weight:bold;flex:1;cursor:pointer;">▶️ Play</button>';
                }
                html += '<button class="__ump_copy__" data-url="' + encodeURIComponent(item.url) + '" style="background:#607D8B;color:#fff;border:0;padding:8px 12px;border-radius:6px;font-size:11px;font-weight:bold;flex:1;cursor:pointer;">📋 Copy</button>';
                html += '<button class="__ump_share__" data-url="' + encodeURIComponent(item.url) + '" style="background:#FF6B6B;color:#fff;border:0;padding:8px 12px;border-radius:6px;font-size:11px;font-weight:bold;flex:1;cursor:pointer;">📱 Share</button>';
                html += '</div>';
                html += '</div>';
            });
        }
        
        html += '<button id="__ump_close__" style="background:#f44336;color:#fff;border:0;padding:14px;border-radius:8px;font-weight:bold;width:100%;margin-top:15px;font-size:13px;cursor:pointer;">✕ Đóng</button>';
        
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
    
    // ========== PLAYER (Native + UI đẹp) ==========
    var overlayRef = null;
    var videoRef = null;
    var hlsRef = null;
    var dashRef = null;
    
    function openPlayer(streamInfo) {
        activateGuard();
        
        // Đóng player cũ
        if (overlayRef) {
            if (videoRef) {
                videoRef.pause();
                videoRef.src = '';
                videoRef.remove();
                videoRef = null;
            }
            if (hlsRef) {
                hlsRef.destroy();
                hlsRef = null;
            }
            if (dashRef) {
                dashRef.destroy();
                dashRef = null;
            }
            overlayRef.remove();
            overlayRef = null;
        }
        
        // OVERLAY
        var overlay = document.createElement('div');
        overlay.id = '__ump__';
        overlay.style.cssText = 'position:fixed;inset:0;background:#000;z-index:2147483647;display:flex;flex-direction:column;font-family:Arial,Helvetica,sans-serif;overflow:hidden;';
        document.body.appendChild(overlay);
        overlayRef = overlay;
        
        // VIDEO WRAPPER
        var wrapper = document.createElement('div');
        wrapper.id = '__ump_wrapper__';
        wrapper.style.cssText = 'flex:1;display:flex;align-items:center;justify-content:center;background:#000;position:relative;';
        overlay.appendChild(wrapper);
        
        // VIDEO ELEMENT
        var video = document.createElement('video');
        video.id = '__ump_video__';
        video.style.cssText = 'width:100%;height:100%;object-fit:contain;background:#000;';
        video.setAttribute('playsinline', '');
        video.setAttribute('webkit-playsinline', '');
        video.setAttribute('crossorigin', 'anonymous');
        video.autoplay = true;
        wrapper.appendChild(video);
        videoRef = video;
        
        // LOADING
        var loading = document.createElement('div');
        loading.id = '__ump_loading__';
        loading.innerHTML = '<div style="color:#fff;text-align:center;"><div style="font-size:40px;animation:__ump_spin 1s linear infinite;">⏳</div><div style="font-size:14px;margin-top:10px;font-weight:300;">Đang tải...</div></div>';
        loading.style.cssText = 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);z-index:50;pointer-events:none;text-align:center;';
        wrapper.appendChild(loading);
        
        // CSS animation
        var style = document.createElement('style');
        style.textContent = '@keyframes __ump_spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }';
        document.head.appendChild(style);
        
        // ========== TOP BAR ==========
        var topBar = document.createElement('div');
        topBar.id = '__ump_topbar__';
        topBar.style.cssText = 'position:absolute;top:0;left:0;right:0;background:linear-gradient(180deg,rgba(0,0,0,0.85),transparent);padding:10px 14px;display:flex;justify-content:space-between;align-items:center;z-index:100;transition:opacity 0.4s;';
        topBar.innerHTML = 
            '<div style="color:#fff;flex:1;overflow:hidden;padding-right:10px;">' +
                '<div style="font-weight:600;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + pageInfo.title + '</div>' +
                '<div style="opacity:0.6;font-size:10px;margin-top:2px;">' + streamInfo.type + ' · ' + pageInfo.host + '</div>' +
            '</div>' +
            '<button id="__ump_menu_btn__" style="background:rgba(255,255,255,0.15);color:#fff;border:1px solid rgba(255,255,255,0.1);padding:6px 12px;border-radius:8px;margin-right:6px;font-size:16px;cursor:pointer;backdrop-filter:blur(4px);">⚙️</button>' +
            '<button id="__ump_close_player__" style="background:rgba(244,67,54,0.8);color:#fff;border:0;padding:6px 14px;border-radius:8px;font-size:14px;font-weight:bold;cursor:pointer;backdrop-filter:blur(4px);">✕</button>';
        overlay.appendChild(topBar);
        
        // ========== BOTTOM CONTROLS ==========
        var controls = document.createElement('div');
        controls.id = '__ump_controls__';
        controls.style.cssText = 'position:absolute;bottom:0;left:0;right:0;background:linear-gradient(0deg,rgba(0,0,0,0.9),transparent);padding:12px 14px 14px;z-index:100;transition:opacity 0.4s;';
        
        // Progress bar
        var progressHtml = '<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">';
        progressHtml += '<span id="__ump_time_cur__" style="color:#fff;font-size:11px;font-family:monospace;min-width:40px;">0:00</span>';
        progressHtml += '<input type="range" id="__ump_seek__" min="0" max="100" value="0" step="0.1" style="flex:1;height:4px;-webkit-appearance:none;background:rgba(255,255,255,0.25);border-radius:4px;outline:none;cursor:pointer;">';
        progressHtml += '<span id="__ump_time_dur__" style="color:#fff;font-size:11px;font-family:monospace;min-width:40px;">0:00</span>';
        progressHtml += '</div>';
        
        // Controls row 1: Play/Pause + Seek buttons
        progressHtml += '<div style="display:flex;justify-content:center;align-items:center;gap:12px;margin-bottom:8px;">';
        progressHtml += '<button class="__ump_ctrl__" data-a="seek-10" style="background:rgba(255,255,255,0.12);color:#fff;border:1px solid rgba(255,255,255,0.08);padding:6px 14px;border-radius:8px;font-size:12px;cursor:pointer;backdrop-filter:blur(4px);">⏪10s</button>';
        progressHtml += '<button id="__ump_play_pause__" style="background:#4CAF50;color:#fff;border:0;padding:10px 24px;border-radius:30px;font-size:18px;font-weight:bold;min-width:60px;cursor:pointer;box-shadow:0 4px 20px rgba(76,175,80,0.3);">⏸</button>';
        progressHtml += '<button class="__ump_ctrl__" data-a="seek+10" style="background:rgba(255,255,255,0.12);color:#fff;border:1px solid rgba(255,255,255,0.08);padding:6px 14px;border-radius:8px;font-size:12px;cursor:pointer;backdrop-filter:blur(4px);">10s⏩</button>';
        progressHtml += '</div>';
        
        // Controls row 2: Speed, Volume, Mute, Fullscreen, PiP, Screenshot
        progressHtml += '<div style="display:flex;justify-content:center;gap:6px;flex-wrap:wrap;">';
        progressHtml += '<button class="__ump_ctrl__" data-a="speed-" style="background:rgba(255,255,255,0.08);color:#fff;border:1px solid rgba(255,255,255,0.06);padding:5px 10px;border-radius:6px;font-size:11px;cursor:pointer;">🐢</button>';
        progressHtml += '<button id="__ump_speed_display__" class="__ump_ctrl__" data-a="speed-reset" style="background:rgba(76,175,80,0.3);color:#fff;border:1px solid rgba(76,175,80,0.2);padding:5px 12px;border-radius:6px;font-size:11px;font-weight:bold;cursor:pointer;">1x</button>';
        progressHtml += '<button class="__ump_ctrl__" data-a="speed+" style="background:rgba(255,255,255,0.08);color:#fff;border:1px solid rgba(255,255,255,0.06);padding:5px 10px;border-radius:6px;font-size:11px;cursor:pointer;">🐰</button>';
        progressHtml += '<button id="__ump_vol_btn__" class="__ump_ctrl__" data-a="volume" style="background:rgba(255,255,255,0.08);color:#fff;border:1px solid rgba(255,255,255,0.06);padding:5px 10px;border-radius:6px;font-size:11px;cursor:pointer;">🔊</button>';
        progressHtml += '<button class="__ump_ctrl__" data-a="mute" style="background:rgba(255,255,255,0.08);color:#fff;border:1px solid rgba(255,255,255,0.06);padding:5px 10px;border-radius:6px;font-size:11px;cursor:pointer;">🔇</button>';
        progressHtml += '<button class="__ump_ctrl__" data-a="fullscreen" style="background:rgba(255,255,255,0.08);color:#fff;border:1px solid rgba(255,255,255,0.06);padding:5px 10px;border-radius:6px;font-size:11px;cursor:pointer;">⛶</button>';
        progressHtml += '<button class="__ump_ctrl__" data-a="pip" style="background:rgba(255,255,255,0.08);color:#fff;border:1px solid rgba(255,255,255,0.06);padding:5px 10px;border-radius:6px;font-size:11px;cursor:pointer;">📺</button>';
        progressHtml += '<button class="__ump_ctrl__" data-a="screenshot" style="background:rgba(255,255,255,0.08);color:#fff;border:1px solid rgba(255,255,255,0.06);padding:5px 10px;border-radius:6px;font-size:11px;cursor:pointer;">📸</button>';
        progressHtml += '<button class="__ump_ctrl__" data-a="loop" style="background:rgba(255,255,255,0.08);color:#fff;border:1px solid rgba(255,255,255,0.06);padding:5px 10px;border-radius:6px;font-size:11px;cursor:pointer;">🔁</button>';
        progressHtml += '</div>';
        
        // Controls row 3: Bypass + Download
        progressHtml += '<div style="display:flex;gap:4px;margin-top:6px;flex-wrap:wrap;">';
        progressHtml += '<button class="__ump_ctrl__" data-a="bypass-direct" style="background:rgba(76,175,80,0.3);color:#fff;border:1px solid rgba(76,175,80,0.2);padding:5px 10px;border-radius:6px;font-size:10px;flex:1;cursor:pointer;">▶ Direct</button>';
        progressHtml += '<button class="__ump_ctrl__" data-a="bypass-proxy" style="background:rgba(33,150,243,0.3);color:#fff;border:1px solid rgba(33,150,243,0.2);padding:5px 10px;border-radius:6px;font-size:10px;flex:1;cursor:pointer;">🔄 Proxy</button>';
        progressHtml += '<button class="__ump_ctrl__" data-a="bypass-redirect" style="background:rgba(244,67,54,0.3);color:#fff;border:1px solid rgba(244,67,54,0.2);padding:5px 10px;border-radius:6px;font-size:10px;flex:1;cursor:pointer;">↗ Redirect</button>';
        progressHtml += '</div>';
        
        controls.innerHTML = progressHtml;
        overlay.appendChild(controls);
        
        // ========== LOAD VIDEO ==========
        var url = streamInfo.url;
        var isHls = url.includes('.m3u8') || url.includes('m3u8');
        var isMpd = url.includes('.mpd') || url.includes('mpd');
        
        function loadVideo(srcUrl) {
            if (isHls) {
                // Dùng hls.js nếu có
                if (window.Hls && Hls.isSupported()) {
                    var hls = new Hls({
                        xhrSetup: function(xhr) {
                            xhr.setRequestHeader('Referer', pageInfo.referer);
                        }
                    });
                    hls.loadSource(srcUrl);
                    hls.attachMedia(video);
                    hls.on(Hls.Events.MANIFEST_PARSED, function() {
                        if (loading.parentNode) loading.remove();
                        // Cập nhật duration
                        setTimeout(function() {
                            if (video.duration) {
                                document.getElementById('__ump_time_dur__').textContent = formatTime(video.duration);
                            }
                        }, 500);
                        // Lấy chất lượng nếu có
                        if (hls.levels && hls.levels.length > 1) {
                            window.__ump_hls_levels__ = hls.levels;
                        }
                    });
                    hls.on(Hls.Events.ERROR, function(e, data) {
                        if (data.fatal) {
                            console.error('HLS fatal error:', data);
                            if (loading.parentNode) {
                                loading.innerHTML = '<div style="color:#ff9800;text-align:center;"><div style="font-size:30px;">⚠️</div><div style="font-size:13px;">Lỗi HLS, thử bypass</div></div>';
                            }
                        }
                    });
                    hlsRef = hls;
                } else {
                    // Fallback: thử phát trực tiếp
                    video.src = srcUrl;
                    video.onloadedmetadata = function() {
                        if (loading.parentNode) loading.remove();
                    };
                }
            } else if (isMpd) {
                // Dùng dash.js
                if (window.dashjs) {
                    var dash = dashjs.MediaPlayer().create();
                    dash.initialize(video, srcUrl, true);
                    dashRef = dash;
                    video.onloadedmetadata = function() {
                        if (loading.parentNode) loading.remove();
                    };
                } else {
                    // Tải dash.js
                    var dashScript = document.createElement('script');
                    dashScript.src = 'https://cdn.jsdelivr.net/npm/dashjs@latest/dist/dash.all.min.js';
                    dashScript.onload = function() {
                        var dash = dashjs.MediaPlayer().create();
                        dash.initialize(video, srcUrl, true);
                        dashRef = dash;
                        video.onloadedmetadata = function() {
                            if (loading.parentNode) loading.remove();
                        };
                    };
                    document.head.appendChild(dashScript);
                }
            } else {
                // MP4, WEBM, MKV
                video.src = srcUrl;
                video.onloadedmetadata = function() {
                    if (loading.parentNode) loading.remove();
                    document.getElementById('__ump_time_dur__').textContent = formatTime(video.duration);
                };
            }
        }
        
        loadVideo(url);
        
        // ========== VIDEO EVENTS ==========
        video.addEventListener('play', function() {
            document.getElementById('__ump_play_pause__').innerHTML = '⏸';
        });
        video.addEventListener('pause', function() {
            document.getElementById('__ump_play_pause__').innerHTML = '▶';
        });
        video.addEventListener('timeupdate', function() {
            document.getElementById('__ump_time_cur__').textContent = formatTime(video.currentTime);
            document.getElementById('__ump_seek__').value = video.currentTime;
        });
        video.addEventListener('loadedmetadata', function() {
            document.getElementById('__ump_seek__').max = video.duration;
            document.getElementById('__ump_time_dur__').textContent = formatTime(video.duration);
        });
        video.addEventListener('error', function(e) {
            console.error('Video error:', e);
            if (loading.parentNode) {
                loading.innerHTML = '<div style="color:#f44336;text-align:center;"><div style="font-size:30px;">❌</div><div style="font-size:13px;">Không thể phát video</div><button onclick="window.__ump_reload__()" style="background:#fff;color:#000;border:0;padding:6px 16px;border-radius:6px;margin-top:8px;cursor:pointer;">🔄 Thử lại</button></div>';
            }
        });
        window.__ump_reload__ = function() {
            if (video) {
                video.load();
                video.play();
            }
        };
        
        // ========== CONTROLS HANDLERS ==========
        document.getElementById('__ump_play_pause__').onclick = function() {
            if (video.paused) video.play(); else video.pause();
        };
        
        document.getElementById('__ump_seek__').oninput = function() {
            video.currentTime = parseFloat(this.value);
        };
        
        controls.querySelectorAll('.__ump_ctrl__').forEach(function(b) {
            b.onclick = function() {
                var action = this.dataset.a;
                
                if (action === 'seek-10') video.currentTime = Math.max(0, video.currentTime - 10);
                else if (action === 'seek+10') video.currentTime = Math.min(video.duration || 9999, video.currentTime + 10);
                else if (action === 'speed-') { video.playbackRate = Math.max(0.25, video.playbackRate - 0.25); updateSpeedDisplay(); }
                else if (action === 'speed+') { video.playbackRate = Math.min(4, video.playbackRate + 0.25); updateSpeedDisplay(); }
                else if (action === 'speed-reset') { video.playbackRate = 1; updateSpeedDisplay(); }
                else if (action === 'volume') {
                    var v = prompt('Âm lượng (0-200%):', Math.round(video.volume * 100));
                    if (v !== null) {
                        var vol = parseFloat(v) / 100;
                        video.volume = Math.min(1, Math.max(0, vol));
                        if (vol > 1) boostVolume(vol);
                        document.getElementById('__ump_vol_btn__').innerText = '🔊' + Math.round(vol * 100);
                    }
                }
                else if (action === 'mute') {
                    video.muted = !video.muted;
                    this.style.background = video.muted ? 'rgba(244,67,54,0.4)' : 'rgba(255,255,255,0.08)';
                }
                else if (action === 'fullscreen') {
                    if (!document.fullscreenElement) {
                        overlay.requestFullscreen && overlay.requestFullscreen().catch(function(){});
                    } else {
                        document.exitFullscreen && document.exitFullscreen().catch(function(){});
                    }
                }
                else if (action === 'pip') {
                    if (document.pictureInPictureElement) document.exitPictureInPicture();
                    else if (video.requestPictureInPicture) video.requestPictureInPicture().catch(function(){});
                    else showToast('❌ PiP không hỗ trợ', '#f44336');
                }
                else if (action === 'screenshot') takeScreenshot(video);
                else if (action === 'loop') {
                    video.loop = !video.loop;
                    this.style.background = video.loop ? 'rgba(76,175,80,0.4)' : 'rgba(255,255,255,0.08)';
                    showToast(video.loop ? '🔁 Loop ON' : '🔁 Loop OFF', '#4CAF50');
                }
                else if (action === 'bypass-direct' || action === 'bypass-proxy' || action === 'bypass-redirect') {
                    video.pause();
                    video.src = '';
                    if (hlsRef) { hlsRef.destroy(); hlsRef = null; }
                    if (dashRef) { dashRef.destroy(); dashRef = null; }
                    
                    var finalUrl = action === 'bypass-proxy' ? 'https://corsproxy.io/?' + encodeURIComponent(url) : url;
                    if (action === 'bypass-redirect') { window.location.href = url; return; }
                    
                    loading.style.display = 'block';
                    loading.innerHTML = '<div style="color:#fff;text-align:center;"><div style="font-size:40px;animation:__ump_spin 1s linear infinite;">⏳</div><div style="font-size:14px;margin-top:10px;">Đang tải lại...</div></div>';
                    loadVideo(finalUrl);
                    showToast('🔄 Bypass: ' + action, '#2196F3');
                }
            };
        });
        
        function updateSpeedDisplay() {
            document.getElementById('__ump_speed_display__').innerText = video.playbackRate + 'x';
        }
        
        // ========== AUTO HIDE ==========
        var hideTimer;
        function showControls() {
            topBar.style.opacity = '1';
            controls.style.opacity = '1';
            clearTimeout(hideTimer);
            hideTimer = setTimeout(function() {
                if (!video.paused) {
                    topBar.style.opacity = '0';
                    controls.style.opacity = '0';
                }
            }, 4000);
        }
        overlay.addEventListener('mousemove', showControls);
        overlay.addEventListener('touchstart', showControls);
        overlay.addEventListener('click', function(e) {
            if (e.target === video || e.target === wrapper) {
                if (video.paused) video.play(); else video.pause();
            }
            showControls();
        });
        showControls();
        
        // ========== TOP BAR ==========
        document.getElementById('__ump_close_player__').onclick = function() {
            if (video) { video.pause(); video.src = ''; }
            if (hlsRef) { hlsRef.destroy(); hlsRef = null; }
            if (dashRef) { dashRef.destroy(); dashRef = null; }
            if (document.fullscreenElement) document.exitFullscreen().catch(function(){});
            deactivateGuard();
            overlay.remove();
            overlayRef = null;
        };
        
        document.getElementById('__ump_menu_btn__').onclick = function() { 
            showMenu(streamInfo, video); 
        };
    }
    
    // ========== MENU ==========
    function showMenu(streamInfo, video) {
        var menu = document.createElement('div');
        menu.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:2147483648;display:flex;align-items:center;justify-content:center;padding:20px;';
        
        var html = '<div style="background:#1a1a2e;border-radius:16px;padding:20px;max-width:380px;width:100%;color:#eee;max-height:80vh;overflow-y:auto;border:1px solid rgba(255,255,255,0.08);box-shadow:0 20px 60px rgba(0,0,0,0.6);">';
        html += '<h3 style="color:#4CAF50;margin:0 0 12px;font-size:16px;">📋 Menu</h3>';
        html += '<div style="background:rgba(255,255,255,0.05);padding:10px;border-radius:8px;margin-bottom:14px;font-size:10px;color:#aaa;word-break:break-all;font-family:monospace;max-height:60px;overflow-y:auto;">' + streamInfo.url.substring(0, 120) + '</div>';
        
        html += '<div style="display:flex;flex-direction:column;gap:6px;">';
        var items = [
            ['copy-url', '📋 Copy URL', '#607D8B'],
            ['share-url', '📱 Share', '#FF6B6B'],
            ['open-new', '🔗 Mở tab mới', '#2196F3'],
            ['dl-mp4', '⬇️ Download', '#FF9800'],
            ['dl-cmd', '💻 Copy yt-dlp', '#9C27B0'],
            ['dl-ffmpeg', '🎬 Copy FFmpeg', '#795548'],
            ['reload-video', '🔄 Reload video', '#009688'],
            ['rename', '✏️ Rename file', '#3F51B5'],
            ['bypass-menu', '🛡️ Bypass Options', '#FF5722']
        ];
        items.forEach(function(item) {
            html += '<button class="__ump_m__" data-a="' + item[0] + '" style="background:' + item[2] + ';color:#fff;border:0;padding:10px 14px;border-radius:8px;font-weight:bold;text-align:left;font-size:13px;cursor:pointer;transition:0.2s;">' + item[1] + '</button>';
        });
        html += '</div>';
        html += '<button id="__ump_m_close__" style="background:#f44336;color:#fff;border:0;padding:12px;border-radius:8px;width:100%;margin-top:14px;font-weight:bold;font-size:14px;cursor:pointer;">← Quay lại</button>';
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
                    if (video) { var t = video.currentTime; video.src = video.src; video.currentTime = t; }
                    showToast('🔄 Reloaded', '#009688');
                }
                else if (a === 'rename') {
                    var n = prompt('Tên file mới:', pageInfo.title);
                    if (n) pageInfo.title = n.replace(/[^\w\s\u00C0-\u1EF9.-]/g, '').substring(0, 100);
                    // Cập nhật top bar
                    var topTitle = document.querySelector('#__ump_topbar__ div div:first-child');
                    if (topTitle) topTitle.textContent = pageInfo.title;
                }
                else if (a === 'bypass-menu') {
                    menu.remove();
                    showBypassMenu(streamInfo);
                }
                if (a !== 'bypass-menu') menu.remove();
            };
        });
        document.getElementById('__ump_m_close__').onclick = function() { menu.remove(); };
    }
    
    // ========== BYPASS MENU ==========
    function showBypassMenu(streamInfo) {
        var bmenu = document.createElement('div');
        bmenu.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:2147483649;display:flex;align-items:center;justify-content:center;padding:20px;';
        
        var html = '<div style="background:#1a1a2e;border-radius:16px;padding:20px;max-width:360px;width:100%;color:#eee;border:1px solid rgba(255,255,255,0.08);">';
        html += '<h3 style="color:#FF5722;margin:0 0 12px;font-size:16px;">🛡️ Bypass Options</h3>';
        html += '<p style="font-size:12px;color:#aaa;margin-bottom:14px;">Dùng khi video bị chặn (CORS, Referer...)</p>';
        var modes = [
            ['direct', '▶ Direct (mặc định)', '#4CAF50'],
            ['proxy', '🔄 CORS Proxy', '#2196F3'],
            ['redirect', '↗ Redirect (mở tab)', '#f44336']
        ];
        modes.forEach(function(m) {
            html += '<button class="__ump_bypass__" data-mode="' + m[0] + '" style="background:' + m[2] + ';color:#fff;border:0;padding:12px;border-radius:8px;width:100%;margin-bottom:6px;font-weight:bold;font-size:14px;cursor:pointer;">' + m[1] + '</button>';
        });
        html += '<button id="__ump_bypass_close__" style="background:#555;color:#fff;border:0;padding:12px;border-radius:8px;width:100%;margin-top:10px;font-size:13px;cursor:pointer;">← Quay lại</button>';
        html += '</div>';
        
        bmenu.innerHTML = html;
        document.body.appendChild(bmenu);
        
        bmenu.querySelectorAll('.__ump_bypass__').forEach(function(b) {
            b.onclick = function() {
                var mode = this.dataset.mode;
                bmenu.remove();
                
                var video = document.getElementById('__ump_video__');
                var url = streamInfo.url;
                
                if (mode === 'redirect') {
                    window.location.href = url;
                    return;
                }
                
                if (video) {
                    video.pause();
                    video.src = '';
                    if (hlsRef) { hlsRef.destroy(); hlsRef = null; }
                    if (dashRef) { dashRef.destroy(); dashRef = null; }
                    
                    var finalUrl = mode === 'proxy' ? 'https://corsproxy.io/?' + encodeURIComponent(url) : url;
                    var loading = document.getElementById('__ump_loading__');
                    if (loading) {
                        loading.style.display = 'block';
                        loading.innerHTML = '<div style="color:#fff;text-align:center;"><div style="font-size:40px;animation:__ump_spin 1s linear infinite;">⏳</div><div style="font-size:14px;margin-top:10px;">Đang tải lại...</div></div>';
                    }
                    
                    var isHls = finalUrl.includes('.m3u8') || finalUrl.includes('m3u8');
                    if (isHls && window.Hls) {
                        var hls = new Hls({
                            xhrSetup: function(xhr) {
                                xhr.setRequestHeader('Referer', pageInfo.referer);
                            }
                        });
                        hls.loadSource(finalUrl);
                        hls.attachMedia(video);
                        hlsRef = hls;
                    } else {
                        video.src = finalUrl;
                    }
                    video.play();
                    showToast('🔄 Loaded: ' + mode, mode === 'proxy' ? '#2196F3' : '#4CAF50');
                }
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
        if (h > 0) return h + ':' + (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
        return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
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
        t.style.cssText = 'position:fixed;top:70px;left:50%;transform:translateX(-50%);background:' + (color || '#333') + ';color:#fff;padding:8px 18px;border-radius:20px;z-index:2147483649;font:bold 12px Arial;box-shadow:0 4px 20px rgba(0,0,0,0.4);';
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
            showToast('✓ Copied', '#FF6B6B');
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
            showToast('⬇️ Đang tải...', '#2196F3');
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
                showToast('📸 Đã lưu', '#4CAF50');
            });
        } catch(e) { showToast('❌ Lỗi CORS', '#f44336'); }
    }
    
    function boostVolume(gain) {
        try {
            if (!window.__ump_audioctx__) {
                var ctx = new (window.AudioContext || window.webkitAudioContext)();
                var source = ctx.createMediaElementSource(document.getElementById('__ump_video__'));
                var gainNode = ctx.createGain();
                source.connect(gainNode);
                gainNode.connect(ctx.destination);
                window.__ump_audioctx__ = { ctx: ctx, gain: gainNode };
            }
            window.__ump_audioctx__.gain.gain.value = gain;
        } catch(e) { console.error('Boost failed:', e); }
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
        
        window.open = function(url) {
            console.log('🚫 Blocked window.open:', url);
            return null;
        };
        
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
                    if (linkHost !== pageInfo.host) {
                        e.preventDefault();
                        e.stopPropagation();
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
    
    console.log('🎬 UMP v2.4 - Native Player (Fast & Stable)');
})();

