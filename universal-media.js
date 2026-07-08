/**
 * Universal Media Player
 * Tìm video → Player custom với full controls → Share + Guard
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
    
    // Filter chỉ giữ playable (M3U8, MP4, MPD, WEBM)
    var playable = arr.filter(function(x) { return x.type !== 'IFRAME'; });
    
    if (playable.length === 0) {
        // Không có video playable, hiện selector cũ
        showFinderPanel(arr);
        return;
    }
    
    // Có video playable → tự động chọn cái tốt nhất và mở player
    if (playable.length === 1) {
        openPlayer(playable[0]);
    } else {
        showQuickSelector(playable, arr);
    }
    
    // ========== QUICK SELECTOR ==========
    function showQuickSelector(playable, all) {
        var overlay = document.createElement('div');
        overlay.id = '__ump__';
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.95);z-index:2147483647;display:flex;align-items:center;justify-content:center;padding:15px;font-family:Arial;';
        
        var html = '<div style="background:#1a1a1a;border:2px solid #4CAF50;border-radius:15px;padding:20px;max-width:500px;width:100%;color:#fff;max-height:90vh;overflow-y:auto;">';
        html += '<div style="text-align:center;margin-bottom:15px;">';
        html += '<div style="font-size:36px;">🎬</div>';
        html += '<h2 style="color:#4CAF50;margin:5px 0;font-size:18px;">Chọn Stream để Play</h2>';
        html += '<div style="color:#aaa;font-size:11px;">Tìm thấy ' + playable.length + ' stream</div>';
        html += '</div>';
        
        playable.forEach(function(item, i) {
            var typeColor = item.type === 'M3U8' ? '#4CAF50' : (item.type === 'MP4' ? '#FF9800' : '#2196F3');
            html += '<div style="background:#2a2a2a;padding:12px;margin-bottom:8px;border-radius:8px;border-left:4px solid ' + typeColor + ';">';
            html += '<div style="display:flex;justify-content:space-between;margin-bottom:6px;">';
            html += '<span style="background:' + typeColor + ';color:#fff;padding:3px 10px;border-radius:3px;font-size:11px;font-weight:bold;">#' + (i+1) + ' ' + item.type + '</span>';
            html += '<span style="color:#666;font-size:10px;">' + item.source + '</span>';
            html += '</div>';
            html += '<div style="font-family:monospace;font-size:10px;color:#ccc;word-break:break-all;margin-bottom:8px;max-height:40px;overflow-y:auto;">' + item.url.substring(0, 100) + '</div>';
            html += '<button class="__ump_play__" data-idx="' + i + '" style="background:#4CAF50;color:#fff;border:0;padding:10px;border-radius:5px;font-weight:bold;width:100%;cursor:pointer;">▶️ Play stream này</button>';
            html += '</div>';
        });
        
        if (all.length > playable.length) {
            html += '<div style="margin-top:10px;">';
            html += '<button id="__ump_show_all__" style="background:#666;color:#fff;border:0;padding:10px;border-radius:5px;font-weight:bold;width:100%;">📋 Xem tất cả (' + all.length + ' - có iframe)</button>';
            html += '</div>';
        }
        
        html += '<button id="__ump_close__" style="background:#f44336;color:#fff;border:0;padding:10px;border-radius:5px;font-weight:bold;width:100%;margin-top:10px;">✕ Hủy</button>';
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
    
    // ========== FINDER PANEL (khi không playable) ==========
    function showFinderPanel(arr) {
        var overlay = document.createElement('div');
        overlay.id = '__ump__';
        overlay.style.cssText = 'position:fixed;inset:0;background:#0a0a0a;z-index:2147483647;overflow-y:auto;padding:15px;color:#fff;font-family:Arial;';
        
        var html = '<div style="text-align:center;margin-bottom:15px;">';
        html += '<div style="font-size:36px;">🎬</div>';
        html += '<h2 style="color:#4CAF50;">Media Finder</h2>';
        html += '<div style="color:#aaa;font-size:11px;">Tìm thấy ' + arr.length + ' items</div>';
        html += '</div>';
        
        if (arr.length === 0) {
            html += '<div style="text-align:center;padding:40px;color:#aaa;">❌ Không tìm thấy media<br><small>Bấm Play video trước rồi chạy lại</small></div>';
        } else {
            arr.forEach(function(item, i) {
                var typeColor = item.type === 'IFRAME' ? '#2196F3' : '#4CAF50';
                html += '<div style="background:#2a2a2a;padding:12px;margin-bottom:8px;border-radius:8px;border-left:4px solid ' + typeColor + ';">';
                html += '<div style="display:flex;justify-content:space-between;margin-bottom:6px;">';
                html += '<span style="background:' + typeColor + ';color:#fff;padding:3px 10px;border-radius:3px;font-size:11px;font-weight:bold;">#' + (i+1) + ' ' + item.type + '</span>';
                html += '</div>';
                html += '<div style="font-family:monospace;font-size:10px;color:#ccc;word-break:break-all;margin-bottom:8px;max-height:60px;overflow-y:auto;">' + item.url + '</div>';
                html += '<div style="display:flex;gap:5px;flex-wrap:wrap;">';
                if (item.type === 'IFRAME') {
                    html += '<a href="' + item.url + '" style="background:#2196F3;color:#fff;padding:8px 12px;border-radius:4px;font-size:11px;text-decoration:none;flex:1;text-align:center;font-weight:bold;">➡️ Vào iframe</a>';
                } else {
                    html += '<button class="__ump_play_alt__" data-idx="' + i + '" style="background:#4CAF50;color:#fff;border:0;padding:8px 12px;border-radius:4px;font-size:11px;font-weight:bold;flex:1;">▶️ Play</button>';
                }
                html += '<button class="__ump_copy__" data-url="' + encodeURIComponent(item.url) + '" style="background:#607D8B;color:#fff;border:0;padding:8px 12px;border-radius:4px;font-size:11px;font-weight:bold;flex:1;">📋 Copy</button>';
                html += '<button class="__ump_share__" data-url="' + encodeURIComponent(item.url) + '" style="background:#FF6B6B;color:#fff;border:0;padding:8px 12px;border-radius:4px;font-size:11px;font-weight:bold;flex:1;">📱 Share</button>';
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
                this.innerText = '✓ Copied';
            };
        });
        
        overlay.querySelectorAll('.__ump_share__').forEach(function(b) {
            b.onclick = function() {
                shareUrl(decodeURIComponent(this.dataset.url));
            };
        });
        
        document.getElementById('__ump_close__').onclick = function() { overlay.remove(); };
    }
    
    // ========== PLAYER ==========
    function openPlayer(streamInfo) {
        // Activate Redirect Guard trước
        activateGuard();
        
        var overlay = document.createElement('div');
        overlay.id = '__ump__';
        overlay.style.cssText = 'position:fixed;inset:0;background:#000;z-index:2147483647;display:flex;flex-direction:column;font-family:Arial;';
        
        // Top bar
        var topBar = document.createElement('div');
        topBar.id = '__ump_topbar__';
        topBar.style.cssText = 'background:linear-gradient(180deg,rgba(0,0,0,0.9),transparent);padding:10px 15px;display:flex;justify-content:space-between;align-items:center;position:absolute;top:0;left:0;right:0;z-index:100;transition:opacity 0.3s;';
        topBar.innerHTML = 
            '<div style="color:#fff;font-size:12px;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding-right:10px;">' +
                '<div style="font-weight:bold;">' + pageInfo.title + '</div>' +
                '<div style="opacity:0.7;font-size:10px;">' + streamInfo.type + ' · ' + pageInfo.host + '</div>' +
            '</div>' +
            '<button id="__ump_menu_btn__" style="background:rgba(255,255,255,0.2);color:#fff;border:0;padding:8px 12px;border-radius:5px;margin-right:5px;font-size:14px;">⋮</button>' +
            '<button id="__ump_close_player__" style="background:rgba(255,0,0,0.7);color:#fff;border:0;padding:8px 12px;border-radius:5px;font-size:14px;font-weight:bold;">✕</button>';
        overlay.appendChild(topBar);
        
        // Video container
        var videoContainer = document.createElement('div');
        videoContainer.style.cssText = 'flex:1;display:flex;align-items:center;justify-content:center;position:relative;';
        
        var video = document.createElement('video');
        video.id = '__ump_video__';
        video.controls = false; // Custom controls
        video.style.cssText = 'width:100%;height:100%;max-height:100%;';
        video.crossOrigin = 'anonymous';
        video.playsInline = true;
        video.autoplay = true;
        
        // Loading indicator
        var loading = document.createElement('div');
        loading.id = '__ump_loading__';
        loading.innerHTML = '<div style="color:#fff;text-align:center;"><div style="font-size:40px;">⏳</div><div>Loading...</div></div>';
        loading.style.cssText = 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);z-index:50;';
        
        videoContainer.appendChild(video);
        videoContainer.appendChild(loading);
        overlay.appendChild(videoContainer);
        
        // Controls
        var controls = document.createElement('div');
        controls.id = '__ump_controls__';
        controls.style.cssText = 'background:linear-gradient(0deg,rgba(0,0,0,0.9),transparent);padding:15px;position:absolute;bottom:0;left:0;right:0;z-index:100;transition:opacity 0.3s;';
        
        controls.innerHTML = 
            // Progress bar
            '<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">' +
                '<span id="__ump_time_cur__" style="color:#fff;font-size:11px;font-family:monospace;min-width:45px;">0:00</span>' +
                '<input type="range" id="__ump_seek__" min="0" max="100" value="0" step="0.1" style="flex:1;height:6px;-webkit-appearance:none;background:rgba(255,255,255,0.3);border-radius:3px;outline:none;">' +
                '<span id="__ump_time_dur__" style="color:#fff;font-size:11px;font-family:monospace;min-width:45px;">0:00</span>' +
            '</div>' +
            
            // Main controls
            '<div style="display:flex;justify-content:space-between;align-items:center;gap:5px;flex-wrap:wrap;">' +
                '<button class="__ump_ctrl__" data-a="seek-10" style="background:rgba(255,255,255,0.2);color:#fff;border:0;padding:10px 12px;border-radius:5px;font-size:14px;font-weight:bold;">⏪ 10s</button>' +
                '<button id="__ump_play_pause__" style="background:#4CAF50;color:#fff;border:0;padding:12px 20px;border-radius:50px;font-size:18px;font-weight:bold;min-width:60px;">⏸</button>' +
                '<button class="__ump_ctrl__" data-a="seek+10" style="background:rgba(255,255,255,0.2);color:#fff;border:0;padding:10px 12px;border-radius:5px;font-size:14px;font-weight:bold;">10s ⏩</button>' +
            '</div>' +
            
            // Secondary controls
            '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:5px;margin-top:10px;">' +
                '<button class="__ump_ctrl__" data-a="speed-" style="background:rgba(255,255,255,0.15);color:#fff;border:0;padding:8px;border-radius:4px;font-size:11px;">🐢 -0.25</button>' +
                '<button id="__ump_speed_display__" class="__ump_ctrl__" data-a="speed-reset" style="background:rgba(76,175,80,0.3);color:#fff;border:0;padding:8px;border-radius:4px;font-size:11px;font-weight:bold;">1x</button>' +
                '<button class="__ump_ctrl__" data-a="speed+" style="background:rgba(255,255,255,0.15);color:#fff;border:0;padding:8px;border-radius:4px;font-size:11px;">🐰 +0.25</button>' +
                '<button class="__ump_ctrl__" data-a="volume" style="background:rgba(255,255,255,0.15);color:#fff;border:0;padding:8px;border-radius:4px;font-size:11px;">🔊 100%</button>' +
                
                '<button class="__ump_ctrl__" data-a="mute" style="background:rgba(255,255,255,0.15);color:#fff;border:0;padding:8px;border-radius:4px;font-size:11px;">🔇 Mute</button>' +
                '<button class="__ump_ctrl__" data-a="fullscreen" style="background:rgba(255,255,255,0.15);color:#fff;border:0;padding:8px;border-radius:4px;font-size:11px;">⛶ Full</button>' +
                '<button class="__ump_ctrl__" data-a="pip" style="background:rgba(255,255,255,0.15);color:#fff;border:0;padding:8px;border-radius:4px;font-size:11px;">📺 PiP</button>' +
                '<button class="__ump_ctrl__" data-a="rotate" style="background:rgba(255,255,255,0.15);color:#fff;border:0;padding:8px;border-radius:4px;font-size:11px;">🔄 Rotate</button>' +
                
                '<button class="__ump_ctrl__" data-a="screenshot" style="background:rgba(255,255,255,0.15);color:#fff;border:0;padding:8px;border-radius:4px;font-size:11px;">📸 Shot</button>' +
                '<button class="__ump_ctrl__" data-a="loop" style="background:rgba(255,255,255,0.15);color:#fff;border:0;padding:8px;border-radius:4px;font-size:11px;">🔁 Loop</button>' +
                '<button class="__ump_ctrl__" data-a="download" style="background:rgba(33,150,243,0.4);color:#fff;border:0;padding:8px;border-radius:4px;font-size:11px;font-weight:bold;">⬇️ DL</button>' +
                '<button class="__ump_ctrl__" data-a="share" style="background:rgba(255,107,107,0.4);color:#fff;border:0;padding:8px;border-radius:4px;font-size:11px;font-weight:bold;">📱 Share</button>' +
            '</div>';
        
        overlay.appendChild(controls);
        document.body.appendChild(overlay);
        
        // ========== LOAD VIDEO ==========
        var url = streamInfo.url;
        
        if (streamInfo.type === 'M3U8') {
            // Try HLS.js
            if (window.Hls && Hls.isSupported()) {
                loadHls();
            } else {
                var hlsScript = document.createElement('script');
                hlsScript.src = 'https://cdn.jsdelivr.net/npm/hls.js@latest';
                hlsScript.onload = loadHls;
                hlsScript.onerror = function() {
                    // Try native HLS (iOS Safari)
                    video.src = url;
                };
                document.head.appendChild(hlsScript);
            }
        } else if (streamInfo.type === 'MPD') {
            // Try dash.js
            var dashScript = document.createElement('script');
            dashScript.src = 'https://cdn.jsdelivr.net/npm/dashjs@latest/dist/dash.all.min.js';
            dashScript.onload = function() {
                var player = dashjs.MediaPlayer().create();
                player.initialize(video, url, true);
            };
            document.head.appendChild(dashScript);
        } else {
            video.src = url;
        }
        
        function loadHls() {
            if (!Hls.isSupported()) {
                video.src = url;
                return;
            }
            var hls = new Hls({
                xhrSetup: function(xhr) {
                    xhr.setRequestHeader('Referer', pageInfo.referer);
                }
            });
            hls.loadSource(url);
            hls.attachMedia(video);
            hls.on(Hls.Events.MANIFEST_PARSED, function() {
                console.log('✅ HLS loaded, levels:', hls.levels.length);
                if (hls.levels.length > 1) {
                    addQualityMenu(hls);
                }
            });
            hls.on(Hls.Events.ERROR, function(e, data) {
                if (data.fatal) {
                    console.error('HLS fatal:', data);
                    showToast('❌ HLS error: ' + data.details, '#f44336');
                }
            });
            window.__ump_hls__ = hls;
        }
        
        function addQualityMenu(hls) {
            // Add quality button to controls
            var qBtn = document.createElement('button');
            qBtn.innerText = '🎞️ ' + (hls.levels[hls.currentLevel] ? hls.levels[hls.currentLevel].height + 'p' : 'Auto');
            qBtn.className = '__ump_ctrl__';
            qBtn.dataset.a = 'quality';
            qBtn.style.cssText = 'background:rgba(156,39,176,0.4);color:#fff;border:0;padding:8px;border-radius:4px;font-size:11px;font-weight:bold;';
            qBtn.onclick = function() { showQualityPicker(hls); };
            
            // Add to secondary controls (find grid)
            var grid = controls.querySelector('div[style*="grid-template-columns"]');
            if (grid) grid.appendChild(qBtn);
        }
        
        function showQualityPicker(hls) {
            var picker = document.createElement('div');
            picker.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.9);z-index:2147483648;display:flex;align-items:center;justify-content:center;padding:20px;';
            
            var html = '<div style="background:#1a1a1a;border-radius:12px;padding:20px;max-width:400px;width:100%;color:#fff;">';
            html += '<h3 style="color:#9C27B0;margin:0 0 15px;">🎞️ Chọn chất lượng</h3>';
            
            html += '<button class="__ump_q__" data-level="-1" style="background:' + (hls.currentLevel === -1 ? '#9C27B0' : '#333') + ';color:#fff;border:0;padding:12px;border-radius:6px;width:100%;margin-bottom:5px;font-weight:bold;">🤖 Auto</button>';
            
            hls.levels.forEach(function(level, i) {
                var active = hls.currentLevel === i;
                html += '<button class="__ump_q__" data-level="' + i + '" style="background:' + (active ? '#9C27B0' : '#333') + ';color:#fff;border:0;padding:12px;border-radius:6px;width:100%;margin-bottom:5px;font-weight:bold;">' + level.height + 'p (' + Math.round(level.bitrate/1000) + ' kbps)</button>';
            });
            
            html += '<button id="__ump_q_close__" style="background:#f44336;color:#fff;border:0;padding:10px;border-radius:5px;width:100%;margin-top:10px;">✕ Close</button>';
            html += '</div>';
            
            picker.innerHTML = html;
            document.body.appendChild(picker);
            
            picker.querySelectorAll('.__ump_q__').forEach(function(b) {
                b.onclick = function() {
                    var lvl = parseInt(this.dataset.level);
                    hls.currentLevel = lvl;
                    picker.remove();
                    var qBtn = controls.querySelector('[data-a="quality"]');
                    if (qBtn) qBtn.innerText = '🎞️ ' + (lvl === -1 ? 'Auto' : hls.levels[lvl].height + 'p');
                    showToast('✓ Quality: ' + (lvl === -1 ? 'Auto' : hls.levels[lvl].height + 'p'), '#9C27B0');
                };
            });
            document.getElementById('__ump_q_close__').onclick = function() { picker.remove(); };
        }
        
        // ========== VIDEO EVENTS ==========
        video.addEventListener('loadedmetadata', function() {
            loading.remove();
            document.getElementById('__ump_time_dur__').textContent = formatTime(video.duration);
            document.getElementById('__ump_seek__').max = video.duration;
        });
        
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
        
        video.addEventListener('error', function(e) {
            loading.innerHTML = '<div style="color:#f44336;text-align:center;"><div style="font-size:40px;">❌</div><div>Video load lỗi</div><div style="font-size:11px;margin-top:5px;opacity:0.8;">Có thể do CORS hoặc format không support</div><button onclick="document.getElementById(\'__ump_share_from_error__\')?.click()" style="background:#FF6B6B;color:#fff;border:0;padding:10px 20px;border-radius:5px;margin-top:10px;font-weight:bold;">📱 Share URL để tải app khác</button></div>';
            
            var errorShare = document.createElement('button');
            errorShare.id = '__ump_share_from_error__';
            errorShare.style.display = 'none';
            errorShare.onclick = function() { shareUrl(url); };
            document.body.appendChild(errorShare);
        });
        
        // ========== CONTROLS HANDLERS ==========
        document.getElementById('__ump_play_pause__').onclick = function() {
            if (video.paused) video.play();
            else video.pause();
        };
        
        document.getElementById('__ump_seek__').oninput = function() {
            video.currentTime = parseFloat(this.value);
        };
        
        controls.querySelectorAll('.__ump_ctrl__').forEach(function(b) {
            b.onclick = function() {
                var action = this.dataset.a;
                
                if (action === 'seek-10') {
                    video.currentTime = Math.max(0, video.currentTime - 10);
                } else if (action === 'seek+10') {
                    video.currentTime = Math.min(video.duration, video.currentTime + 10);
                } else if (action === 'speed-') {
                    video.playbackRate = Math.max(0.25, video.playbackRate - 0.25);
                    updateSpeedDisplay();
                } else if (action === 'speed+') {
                    video.playbackRate = Math.min(16, video.playbackRate + 0.25);
                    updateSpeedDisplay();
                } else if (action === 'speed-reset') {
                    video.playbackRate = 1;
                    updateSpeedDisplay();
                } else if (action === 'volume') {
                    var newVol = prompt('Volume 0-400% (100 = 100%):', Math.round(video.volume * 100));
                    if (newVol !== null) {
                        var v = parseFloat(newVol) / 100;
                        video.volume = Math.min(1, Math.max(0, v));
                        // Boost > 100% needs AudioContext
                        if (v > 1) boostVolume(v);
                        this.innerText = '🔊 ' + Math.round(v * 100) + '%';
                    }
                } else if (action === 'mute') {
                    video.muted = !video.muted;
                    this.innerText = video.muted ? '🔇 Unmute' : '🔇 Mute';
                } else if (action === 'fullscreen') {
                    if (!document.fullscreenElement) {
                        overlay.requestFullscreen && overlay.requestFullscreen().catch(function(){});
                    } else {
                        document.exitFullscreen && document.exitFullscreen().catch(function(){});
                    }
                } else if (action === 'pip') {
                    if (document.pictureInPictureElement) {
                        document.exitPictureInPicture();
                    } else if (video.requestPictureInPicture) {
                        video.requestPictureInPicture().catch(function(e){
                            showToast('❌ PiP: ' + e.message, '#f44336');
                        });
                    } else {
                        showToast('❌ Browser không support PiP', '#f44336');
                    }
                } else if (action === 'rotate') {
                    video.__rotation = ((video.__rotation || 0) + 90) % 360;
                    video.style.transform = 'rotate(' + video.__rotation + 'deg)';
                    if (video.__rotation === 90 || video.__rotation === 270) {
                        video.style.width = '100vh';
                        video.style.height = '100vw';
                    } else {
                        video.style.width = '100%';
                        video.style.height = '100%';
                    }
                } else if (action === 'screenshot') {
                    takeScreenshot(video);
                } else if (action === 'loop') {
                    video.loop = !video.loop;
                    this.innerText = video.loop ? '🔁 Loop ON' : '🔁 Loop';
                    this.style.background = video.loop ? 'rgba(76,175,80,0.5)' : 'rgba(255,255,255,0.15)';
                } else if (action === 'download') {
                    downloadUrl(url, streamInfo.type);
                } else if (action === 'share') {
                    shareUrl(url);
                }
            };
        });
        
        function updateSpeedDisplay() {
            document.getElementById('__ump_speed_display__').innerText = video.playbackRate + 'x';
        }
        
        // ========== AUTO HIDE CONTROLS ==========
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
            }, 3000);
        }
        
        overlay.addEventListener('mousemove', showControls);
        overlay.addEventListener('touchstart', showControls);
        overlay.addEventListener('click', showControls);
        showControls();
        
        // ========== TOP BAR ==========
        document.getElementById('__ump_close_player__').onclick = function() {
            video.pause();
            video.src = '';
            if (window.__ump_hls__) window.__ump_hls__.destroy();
            deactivateGuard();
            overlay.remove();
        };
        
        document.getElementById('__ump_menu_btn__').onclick = function() {
            showMenu(streamInfo, video);
        };
        
        // Media Session API
        if ('mediaSession' in navigator) {
            navigator.mediaSession.metadata = new MediaMetadata({
                title: pageInfo.title,
                artist: pageInfo.host,
                album: 'Universal Media Player'
            });
            navigator.mediaSession.setActionHandler('play', function() { video.play(); });
            navigator.mediaSession.setActionHandler('pause', function() { video.pause(); });
            navigator.mediaSession.setActionHandler('seekbackward', function() { video.currentTime -= 10; });
            navigator.mediaSession.setActionHandler('seekforward', function() { video.currentTime += 10; });
        }
    }
    
    // ========== MENU (⋮) ==========
    function showMenu(streamInfo, video) {
        var menu = document.createElement('div');
        menu.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.9);z-index:2147483648;display:flex;align-items:center;justify-content:center;padding:20px;';
        
        var html = '<div style="background:#1a1a1a;border:2px solid #4CAF50;border-radius:15px;padding:20px;max-width:400px;width:100%;color:#fff;max-height:90vh;overflow-y:auto;">';
        html += '<h3 style="color:#4CAF50;margin:0 0 15px;">📋 Menu</h3>';
        
        html += '<div style="background:#2a2a2a;padding:10px;border-radius:8px;margin-bottom:15px;font-size:11px;color:#aaa;word-break:break-all;">' + streamInfo.url.substring(0, 100) + '</div>';
        
        html += '<div style="display:flex;flex-direction:column;gap:8px;">';
        html += '<button class="__ump_m__" data-a="copy-url" style="background:#607D8B;color:#fff;border:0;padding:12px;border-radius:6px;font-weight:bold;text-align:left;">📋 Copy URL</button>';
        html += '<button class="__ump_m__" data-a="share-url" style="background:#FF6B6B;color:#fff;border:0;padding:12px;border-radius:6px;font-weight:bold;text-align:left;">📱 Share URL (YTDLnis...)</button>';
        html += '<button class="__ump_m__" data-a="open-new" style="background:#2196F3;color:#fff;border:0;padding:12px;border-radius:6px;font-weight:bold;text-align:left;">🔗 Mở tab mới</button>';
        html += '<button class="__ump_m__" data-a="dl-mp4" style="background:#FF9800;color:#fff;border:0;padding:12px;border-radius:6px;font-weight:bold;text-align:left;">⬇️ Download trực tiếp</button>';
        html += '<button class="__ump_m__" data-a="dl-cmd" style="background:#9C27B0;color:#fff;border:0;padding:12px;border-radius:6px;font-weight:bold;text-align:left;">💻 Copy lệnh yt-dlp</button>';
        html += '<button class="__ump_m__" data-a="dl-ffmpeg" style="background:#795548;color:#fff;border:0;padding:12px;border-radius:6px;font-weight:bold;text-align:left;">🎬 Copy lệnh FFmpeg</button>';
        html += '<button class="__ump_m__" data-a="reload-video" style="background:#009688;color:#fff;border:0;padding:12px;border-radius:6px;font-weight:bold;text-align:left;">🔄 Reload video</button>';
        html += '<button class="__ump_m__" data-a="rename" style="background:#3F51B5;color:#fff;border:0;padding:12px;border-radius:6px;font-weight:bold;text-align:left;">✏️ Rename (tên file)</button>';
        html += '</div>';
        
        html += '<button id="__ump_m_close__" style="background:#666;color:#fff;border:0;padding:12px;border-radius:6px;width:100%;margin-top:15px;font-weight:bold;">← Back</button>';
        html += '</div>';
        
        menu.innerHTML = html;
        document.body.appendChild(menu);
        
        menu.querySelectorAll('.__ump_m__').forEach(function(b) {
            b.onclick = function() {
                var a = this.dataset.a;
                var url = streamInfo.url;
                
                if (a === 'copy-url') {
                    copy(url);
                    showToast('✓ Copied URL', '#4CAF50');
                } else if (a === 'share-url') {
                    shareUrl(url);
                } else if (a === 'open-new') {
                    window.open(url, '_blank');
                } else if (a === 'dl-mp4') {
                    downloadUrl(url, streamInfo.type);
                } else if (a === 'dl-cmd') {
                    var cmd = 'yt-dlp --referer "' + pageInfo.referer + '" -f "best" --hls-use-mpegts --merge-output-format mp4 -o "' + pageInfo.title + '.%(ext)s" "' + url + '"';
                    copy(cmd);
                    showToast('✓ Copied yt-dlp command', '#9C27B0');
                } else if (a === 'dl-ffmpeg') {
                    var cmd = 'ffmpeg -headers "Referer: ' + pageInfo.referer + '" -i "' + url + '" -c copy "' + pageInfo.title + '.mp4"';
                    copy(cmd);
                    showToast('✓ Copied ffmpeg command', '#795548');
                } else if (a === 'reload-video') {
                    if (video.src) {
                        var currentTime = video.currentTime;
                        video.src = video.src;
                        video.currentTime = currentTime;
                    }
                    showToast('🔄 Reloaded', '#009688');
                } else if (a === 'rename') {
                    var newName = prompt('Tên file mới:', pageInfo.title);
                    if (newName) pageInfo.title = newName.replace(/[^\w\s\u00C0-\u1EF9.-]/g, '').substring(0, 100);
                }
                
                menu.remove();
            };
        });
        
        document.getElementById('__ump_m_close__').onclick = function() { menu.remove(); };
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
        t.style.cssText = 'position:fixed;top:80px;left:50%;transform:translateX(-50%);background:' + (color || '#333') + ';color:#fff;padding:10px 18px;border-radius:20px;z-index:2147483649;font:bold 12px Arial;box-shadow:0 4px 15px rgba(0,0,0,0.5);';
        document.body.appendChild(t);
        setTimeout(function() { t.remove(); }, 2500);
    }
    
    function shareUrl(url) {
        if (navigator.share) {
            navigator.share({
                title: pageInfo.title,
                url: url
            }).catch(function(err) {
                if (err.name !== 'AbortError') {
                    copy(url);
                    showToast('✓ Copied (Share failed)', '#FF6B6B');
                }
            });
        } else {
            copy(url);
            showToast('✓ Copied - Mở YTDLnis để tải', '#FF6B6B');
        }
    }
    
    function downloadUrl(url, type) {
        if (type === 'M3U8' || type === 'MPD') {
            // Stream không tải trực tiếp được
            shareUrl(url);
            showToast('⚠️ Stream cần app riêng để tải', '#FF9800');
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
                showToast('📸 Screenshot saved', '#4CAF50');
            });
        } catch(e) {
            showToast('❌ Screenshot lỗi (CORS?)', '#f44336');
        }
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
        } catch(e) {
            console.error('Boost failed:', e);
        }
    }
    
    // ========== REDIRECT GUARD ==========
    function activateGuard() {
        if (window.__ump_guard_active__) return;
        window.__ump_guard_active__ = true;
        
        // Save originals
        window.__ump_originals__ = {
            open: window.open,
            assign: location.assign,
            replace: location.replace
        };
        
        var blocked = 0;
        
        // Block window.open
        window.open = function(url) {
            blocked++;
            console.log('🚫 [Player Guard] Blocked window.open:', url);
            updateGuardBadge(blocked);
            return null;
        };
        
        // Block location changes
        try {
            location.assign = function(url) {
                blocked++;
                console.log('🚫 [Player Guard] Blocked assign:', url);
                updateGuardBadge(blocked);
            };
            location.replace = function(url) {
                blocked++;
                console.log('🚫 [Player Guard] Blocked replace:', url);
                updateGuardBadge(blocked);
            };
        } catch(e) {}
        
        // Block onbeforeunload (site cố redirect)
        window.onbeforeunload = null;
        
        // Block link clicks going external
        window.__ump_click_blocker__ = function(e) {
            var link = e.target.closest('a');
            if (link && link.href && !link.href.startsWith('#') && !link.href.startsWith('javascript:')) {
                try {
                    var linkHost = new URL(link.href).hostname;
                    if (linkHost !== pageInfo.host) {
                        e.preventDefault();
                        e.stopPropagation();
                        blocked++;
                        updateGuardBadge(blocked);
                        console.log('🚫 [Player Guard] Blocked link:', link.href);
                    }
                } catch(err) {}
            }
        };
        document.addEventListener('click', window.__ump_click_blocker__, true);
        
        // Add guard badge
        var badge = document.createElement('div');
        badge.id = '__ump_guard_badge__';
        badge.innerHTML = '🛡️ 0 blocked';
        badge.style.cssText = 'position:fixed;top:60px;right:10px;background:#4CAF50;color:#fff;padding:6px 12px;border-radius:15px;z-index:2147483646;font:bold 11px Arial;box-shadow:0 3px 10px rgba(0,0,0,0.5);';
        document.body.appendChild(badge);
    }
    
    function updateGuardBadge(count) {
        var badge = document.getElementById('__ump_guard_badge__');
        if (badge) {
            badge.innerHTML = '🛡️ ' + count + ' blocked';
            badge.style.background = count > 0 ? '#c62828' : '#4CAF50';
        }
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
        
        var badge = document.getElementById('__ump_guard_badge__');
        if (badge) badge.remove();
        
        window.__ump_guard_active__ = false;
    }
    
    console.log('🎬 Universal Media Player loaded');
})();