/**
 * Universal Media Player v2.1
 * Fixed: Tắt auto fullscreen + Thêm bypass
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
    
    // ========== PLAYER ==========
    function openPlayer(streamInfo) {
        activateGuard();
        
        var overlay = document.createElement('div');
        overlay.id = '__ump__';
        overlay.style.cssText = 'position:fixed;inset:0;background:#000;z-index:2147483647;display:flex;flex-direction:column;font-family:Arial;overflow:hidden;';
        
        // Video FULL SCREEN - chiếm toàn bộ
        var video = document.createElement('video');
        video.id = '__ump_video__';
        video.controls = false;
        video.style.cssText = 'width:100%;height:100%;position:absolute;top:0;left:0;object-fit:contain;background:#000;';
        video.crossOrigin = 'anonymous';
        video.playsInline = true;
        video.autoplay = true;
        overlay.appendChild(video);
        
        // Loading
        var loading = document.createElement('div');
        loading.id = '__ump_loading__';
        loading.innerHTML = '<div style="color:#fff;text-align:center;"><div style="font-size:36px;">⏳</div><div style="font-size:12px;margin-top:5px;">Loading...</div></div>';
        loading.style.cssText = 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);z-index:50;';
        overlay.appendChild(loading);
        
        // ========== TOP BAR (nhỏ gọn) ==========
        var topBar = document.createElement('div');
        topBar.id = '__ump_topbar__';
        topBar.style.cssText = 'position:absolute;top:0;left:0;right:0;background:linear-gradient(180deg,rgba(0,0,0,0.8),transparent);padding:8px 10px;display:flex;justify-content:space-between;align-items:center;z-index:100;transition:opacity 0.3s;';
        topBar.innerHTML = 
            '<div style="color:#fff;font-size:11px;flex:1;overflow:hidden;padding-right:8px;">' +
                '<div style="font-weight:bold;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + pageInfo.title + '</div>' +
                '<div style="opacity:0.7;font-size:9px;">' + streamInfo.type + ' · ' + pageInfo.host + '</div>' +
            '</div>' +
            '<button id="__ump_menu_btn__" style="background:rgba(255,255,255,0.2);color:#fff;border:0;padding:6px 10px;border-radius:4px;margin-right:4px;font-size:12px;">⋮</button>' +
            '<button id="__ump_close_player__" style="background:rgba(244,67,54,0.9);color:#fff;border:0;padding:6px 10px;border-radius:4px;font-size:12px;font-weight:bold;">✕</button>';
        overlay.appendChild(topBar);
        
        // ========== CONTROLS (compact) ==========
        var controls = document.createElement('div');
        controls.id = '__ump_controls__';
        controls.style.cssText = 'position:absolute;bottom:0;left:0;right:0;background:linear-gradient(0deg,rgba(0,0,0,0.85),transparent);padding:8px 10px 10px;z-index:100;transition:opacity 0.3s;';
        
        controls.innerHTML = 
            // Progress bar - compact
            '<div style="display:flex;align-items:center;gap:6px;margin-bottom:8px;">' +
                '<span id="__ump_time_cur__" style="color:#fff;font-size:10px;font-family:monospace;min-width:35px;">0:00</span>' +
                '<input type="range" id="__ump_seek__" min="0" max="100" value="0" step="0.1" style="flex:1;height:4px;-webkit-appearance:none;background:rgba(255,255,255,0.3);border-radius:2px;outline:none;">' +
                '<span id="__ump_time_dur__" style="color:#fff;font-size:10px;font-family:monospace;min-width:35px;">0:00</span>' +
            '</div>' +
            
            // Main row: -10s | Play/Pause | +10s
            '<div style="display:flex;justify-content:center;align-items:center;gap:8px;margin-bottom:6px;">' +
                '<button class="__ump_ctrl__" data-a="seek-10" style="background:rgba(255,255,255,0.2);color:#fff;border:0;padding:6px 12px;border-radius:4px;font-size:11px;font-weight:bold;">⏪10s</button>' +
                '<button id="__ump_play_pause__" style="background:#4CAF50;color:#fff;border:0;padding:8px 18px;border-radius:20px;font-size:14px;font-weight:bold;min-width:50px;">⏸</button>' +
                '<button class="__ump_ctrl__" data-a="seek+10" style="background:rgba(255,255,255,0.2);color:#fff;border:0;padding:6px 12px;border-radius:4px;font-size:11px;font-weight:bold;">10s⏩</button>' +
            '</div>' +
            
            // Grid 5 cột compact
            '<div style="display:grid;grid-template-columns:repeat(5,1fr);gap:3px;">' +
                '<button class="__ump_ctrl__" data-a="speed-" style="background:rgba(255,255,255,0.15);color:#fff;border:0;padding:6px 2px;border-radius:3px;font-size:10px;">🐢</button>' +
                '<button id="__ump_speed_display__" class="__ump_ctrl__" data-a="speed-reset" style="background:rgba(76,175,80,0.4);color:#fff;border:0;padding:6px 2px;border-radius:3px;font-size:10px;font-weight:bold;">1x</button>' +
                '<button class="__ump_ctrl__" data-a="speed+" style="background:rgba(255,255,255,0.15);color:#fff;border:0;padding:6px 2px;border-radius:3px;font-size:10px;">🐰</button>' +
                '<button id="__ump_vol_btn__" class="__ump_ctrl__" data-a="volume" style="background:rgba(255,255,255,0.15);color:#fff;border:0;padding:6px 2px;border-radius:3px;font-size:10px;">🔊</button>' +
                '<button class="__ump_ctrl__" data-a="mute" style="background:rgba(255,255,255,0.15);color:#fff;border:0;padding:6px 2px;border-radius:3px;font-size:10px;">🔇</button>' +
            '</div>' +
            
            '<div style="display:grid;grid-template-columns:repeat(5,1fr);gap:3px;margin-top:3px;">' +
                '<button class="__ump_ctrl__" data-a="fullscreen" style="background:rgba(255,255,255,0.15);color:#fff;border:0;padding:6px 2px;border-radius:3px;font-size:10px;">⛶</button>' +
                '<button class="__ump_ctrl__" data-a="pip" style="background:rgba(255,255,255,0.15);color:#fff;border:0;padding:6px 2px;border-radius:3px;font-size:10px;">📺</button>' +
                '<button class="__ump_ctrl__" data-a="rotate" style="background:rgba(255,255,255,0.15);color:#fff;border:0;padding:6px 2px;border-radius:3px;font-size:10px;">🔄</button>' +
                '<button class="__ump_ctrl__" data-a="screenshot" style="background:rgba(255,255,255,0.15);color:#fff;border:0;padding:6px 2px;border-radius:3px;font-size:10px;">📸</button>' +
                '<button id="__ump_loop_btn__" class="__ump_ctrl__" data-a="loop" style="background:rgba(255,255,255,0.15);color:#fff;border:0;padding:6px 2px;border-radius:3px;font-size:10px;">🔁</button>' +
            '</div>' +
            
            // === THÊM NÚT BYPASS ===
            '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:3px;margin-top:3px;">' +
                '<button class="__ump_ctrl__" data-a="bypass-direct" style="background:rgba(76,175,80,0.5);color:#fff;border:0;padding:6px 2px;border-radius:3px;font-size:10px;">▶ Direct</button>' +
                '<button class="__ump_ctrl__" data-a="bypass-proxy" style="background:rgba(33,150,243,0.5);color:#fff;border:0;padding:6px 2px;border-radius:3px;font-size:10px;">🔄 Proxy</button>' +
                '<button class="__ump_ctrl__" data-a="bypass-redirect" style="background:rgba(244,67,54,0.5);color:#fff;border:0;padding:6px 2px;border-radius:3px;font-size:10px;">↗ Redirect</button>' +
            '</div>' +
            
            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:3px;margin-top:3px;">' +
                '<button class="__ump_ctrl__" data-a="download" style="background:rgba(33,150,243,0.5);color:#fff;border:0;padding:8px 4px;border-radius:3px;font-size:11px;font-weight:bold;">⬇️ Download</button>' +
                '<button class="__ump_ctrl__" data-a="share" style="background:rgba(255,107,107,0.5);color:#fff;border:0;padding:8px 4px;border-radius:3px;font-size:11px;font-weight:bold;">📱 Share</button>' +
            '</div>';
        
        overlay.appendChild(controls);
        document.body.appendChild(overlay);
        
        // ========== XÓA AUTO FULLSCREEN ==========
        // (Đã xóa đoạn setTimeout force fullscreen)
        
        // ========== LOAD VIDEO ==========
        var url = streamInfo.url;
        
        function loadVideoWithBypass(mode) {
            // Xóa HLS cũ nếu có
            if (window.__ump_hls__) {
                window.__ump_hls__.destroy();
                window.__ump_hls__ = null;
            }
            
            var finalUrl = url;
            
            if (mode === 'proxy') {
                finalUrl = 'https://corsproxy.io/?' + encodeURIComponent(url);
                showToast('🔄 Using CORS Proxy', '#2196F3');
            } else if (mode === 'redirect') {
                window.location.href = url;
                return;
            }
            // mode === 'direct' → giữ nguyên url
            
            if (streamInfo.type === 'M3U8') {
                if (window.Hls && Hls.isSupported()) {
                    loadHls(finalUrl);
                } else {
                    var hlsScript = document.createElement('script');
                    hlsScript.src = 'https://cdn.jsdelivr.net/npm/hls.js@latest';
                    hlsScript.onload = function() { loadHls(finalUrl); };
                    hlsScript.onerror = function() { video.src = finalUrl; };
                    document.head.appendChild(hlsScript);
                }
            } else if (streamInfo.type === 'MPD') {
                var dashScript = document.createElement('script');
                dashScript.src = 'https://cdn.jsdelivr.net/npm/dashjs@latest/dist/dash.all.min.js';
                dashScript.onload = function() {
                    var player = dashjs.MediaPlayer().create();
                    player.initialize(video, finalUrl, true);
                };
                document.head.appendChild(dashScript);
            } else {
                video.src = finalUrl;
            }
        }
        
        function loadHls(streamUrl) {
            if (!Hls.isSupported()) {
                video.src = streamUrl;
                return;
            }
            var hls = new Hls({
                xhrSetup: function(xhr) {
                    xhr.setRequestHeader('Referer', pageInfo.referer);
                }
            });
            hls.loadSource(streamUrl);
            hls.attachMedia(video);
            hls.on(Hls.Events.MANIFEST_PARSED, function() {
                if (hls.levels.length > 1) addQualityMenu(hls);
            });
            hls.on(Hls.Events.ERROR, function(e, data) {
                if (data.fatal) console.error('HLS fatal:', data);
            });
            window.__ump_hls__ = hls;
        }
        
        function addQualityMenu(hls) {
            var qBtn = document.createElement('button');
            qBtn.innerText = '🎞️';
            qBtn.className = '__ump_ctrl__';
            qBtn.dataset.a = 'quality';
            qBtn.style.cssText = 'background:rgba(156,39,176,0.5);color:#fff;border:0;padding:6px 2px;border-radius:3px;font-size:10px;font-weight:bold;';
            qBtn.onclick = function() { showQualityPicker(hls); };
            
            var lastGrid = controls.querySelectorAll('div[style*="grid-template-columns:repeat(5"]');
            if (lastGrid.length > 0) lastGrid[lastGrid.length - 1].appendChild(qBtn);
        }
        
        function showQualityPicker(hls) {
            var picker = document.createElement('div');
            picker.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:2147483648;display:flex;align-items:center;justify-content:center;padding:15px;';
            
            var html = '<div style="background:#fff;border-radius:10px;padding:15px;max-width:300px;width:100%;color:#333;">';
            html += '<h3 style="color:#9C27B0;margin:0 0 12px;font-size:14px;">🎞️ Chất lượng</h3>';
            html += '<button class="__ump_q__" data-level="-1" style="background:' + (hls.currentLevel === -1 ? '#9C27B0' : '#eee') + ';color:' + (hls.currentLevel === -1 ? '#fff' : '#333') + ';border:0;padding:10px;border-radius:5px;width:100%;margin-bottom:4px;font-weight:bold;font-size:12px;">🤖 Auto</button>';
            hls.levels.forEach(function(level, i) {
                var active = hls.currentLevel === i;
                html += '<button class="__ump_q__" data-level="' + i + '" style="background:' + (active ? '#9C27B0' : '#eee') + ';color:' + (active ? '#fff' : '#333') + ';border:0;padding:10px;border-radius:5px;width:100%;margin-bottom:4px;font-weight:bold;font-size:12px;">' + level.height + 'p (' + Math.round(level.bitrate/1000) + 'k)</button>';
            });
            html += '<button id="__ump_q_close__" style="background:#f44336;color:#fff;border:0;padding:8px;border-radius:5px;width:100%;margin-top:8px;font-size:12px;">✕ Close</button>';
            html += '</div>';
            
            picker.innerHTML = html;
            document.body.appendChild(picker);
            
            picker.querySelectorAll('.__ump_q__').forEach(function(b) {
                b.onclick = function() {
                    hls.currentLevel = parseInt(this.dataset.level);
                    picker.remove();
                    showToast('✓ Quality changed', '#9C27B0');
                };
            });
            document.getElementById('__ump_q_close__').onclick = function() { picker.remove(); };
        }
        
        // Load video với mode direct mặc định
        loadVideoWithBypass('direct');
        
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
        
        video.addEventListener('error', function() {
            loading.innerHTML = '<div style="color:#f44336;text-align:center;background:rgba(0,0,0,0.8);padding:20px;border-radius:10px;"><div style="font-size:30px;">❌</div><div>Video load lỗi</div><button onclick="document.querySelector(\'#__ump_ctrl_share__\')?.click()" style="background:#FF6B6B;color:#fff;border:0;padding:8px 15px;border-radius:5px;margin-top:10px;font-weight:bold;">📱 Share URL</button></div>';
        });
        
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
                else if (action === 'seek+10') video.currentTime = Math.min(video.duration, video.currentTime + 10);
                else if (action === 'speed-') { video.playbackRate = Math.max(0.25, video.playbackRate - 0.25); updateSpeedDisplay(); }
                else if (action === 'speed+') { video.playbackRate = Math.min(16, video.playbackRate + 0.25); updateSpeedDisplay(); }
                else if (action === 'speed-reset') { video.playbackRate = 1; updateSpeedDisplay(); }
                else if (action === 'volume') {
                    var v = prompt('Volume 0-400%:', Math.round(video.volume * 100));
                    if (v !== null) {
                        var vol = parseFloat(v) / 100;
                        video.volume = Math.min(1, Math.max(0, vol));
                        if (vol > 1) boostVolume(vol);
                        document.getElementById('__ump_vol_btn__').innerText = '🔊' + Math.round(vol * 100);
                    }
                }
                else if (action === 'mute') {
                    video.muted = !video.muted;
                    this.style.background = video.muted ? 'rgba(244,67,54,0.5)' : 'rgba(255,255,255,0.15)';
                }
                else if (action === 'fullscreen') {
                    if (!document.fullscreenElement) {
                        overlay.requestFullscreen && overlay.requestFullscreen({navigationUI:'hide'}).catch(function(){});
                    } else {
                        document.exitFullscreen && document.exitFullscreen().catch(function(){});
                    }
                }
                else if (action === 'pip') {
                    if (document.pictureInPictureElement) document.exitPictureInPicture();
                    else if (video.requestPictureInPicture) video.requestPictureInPicture().catch(function(e) { showToast('❌ PiP: ' + e.message, '#f44336'); });
                    else showToast('❌ Browser không support PiP', '#f44336');
                }
                else if (action === 'rotate') {
                    video.__rotation = ((video.__rotation || 0) + 90) % 360;
                    if (video.__rotation === 0) {
                        video.style.transform = '';
                        video.style.width = '100%';
                        video.style.height = '100%';
                    } else if (video.__rotation === 90 || video.__rotation === 270) {
                        video.style.transform = 'rotate(' + video.__rotation + 'deg)';
                        video.style.width = '100vh';
                        video.style.height = '100vw';
                        video.style.top = '50%';
                        video.style.left = '50%';
                        video.style.marginTop = '-50vw';
                        video.style.marginLeft = '-50vh';
                    } else {
                        video.style.transform = 'rotate(180deg)';
                        video.style.width = '100%';
                        video.style.height = '100%';
                    }
                }
                else if (action === 'screenshot') takeScreenshot(video);
                else if (action === 'loop') {
                    video.loop = !video.loop;
                    document.getElementById('__ump_loop_btn__').style.background = video.loop ? 'rgba(76,175,80,0.5)' : 'rgba(255,255,255,0.15)';
                    showToast(video.loop ? '🔁 Loop ON' : '🔁 Loop OFF', '#4CAF50');
                }
                else if (action === 'download') downloadUrl(url, streamInfo.type);
                else if (action === 'share') shareUrl(url);
                // === BYPASS HANDLERS ===
                else if (action === 'bypass-direct') {
                    video.pause();
                    video.src = '';
                    if (window.__ump_hls__) { window.__ump_hls__.destroy(); window.__ump_hls__ = null; }
                    loadVideoWithBypass('direct');
                }
                else if (action === 'bypass-proxy') {
                    video.pause();
                    video.src = '';
                    if (window.__ump_hls__) { window.__ump_hls__.destroy(); window.__ump_hls__ = null; }
                    loadVideoWithBypass('proxy');
                }
                else if (action === 'bypass-redirect') {
                    loadVideoWithBypass('redirect');
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
            }, 3000);
        }
        
        overlay.addEventListener('mousemove', showControls);
        overlay.addEventListener('touchstart', showControls);
        overlay.addEventListener('click', function(e) {
            if (e.target === video || e.target === overlay || e.target === loading) {
                if (video.readyState >= 2) {
                    if (video.paused) video.play(); else video.pause();
                }
            }
            showControls();
        });
        showControls();
        
        // ========== TOP BAR HANDLERS ==========
        document.getElementById('__ump_close_player__').onclick = function() {
            video.pause();
            video.src = '';
            if (window.__ump_hls__) window.__ump_hls__.destroy();
            if (document.fullscreenElement) document.exitFullscreen().catch(function(){});
            if (screen.orientation && screen.orientation.unlock) screen.orientation.unlock();
            deactivateGuard();
            overlay.remove();
        };
        
        document.getElementById('__ump_menu_btn__').onclick = function() { showMenu(streamInfo, video); };
        
        // Media Session
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
    
    // ========== MENU (light theme) ==========
    function showMenu(streamInfo, video) {
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
        html += '<button class="__ump_m__" data-a="rename" style="background:#3F51B5;color:#fff;border:0;padding:10px;border-radius:5px;font-weight:bold;text-align:left;font-size:12px;">✏️ Rename file</button>';
        // === THÊM BYPASS VÀO MENU ===
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
                    if (video.src) { var t = video.currentTime; video.src = video.src; video.currentTime = t; }
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
                if (a !== 'bypass-menu') menu.remove();
            };
        });
        document.getElementById('__ump_m_close__').onclick = function() { menu.remove(); };
    }
    
    // === BYPASS MENU ===
    function showBypassMenu(streamInfo) {
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
                
                var overlay = document.getElementById('__ump__');
                var video = document.getElementById('__ump_video__');
                
                if (video) {
                    video.pause();
                    video.src = '';
                }
                if (window.__ump_hls__) {
                    window.__ump_hls__.destroy();
                    window.__ump_hls__ = null;
                }
                
                if (mode === 'redirect') {
                    window.location.href = streamInfo.url;
                } else {
                    var finalUrl = mode === 'proxy' ? 'https://corsproxy.io/?' + encodeURIComponent(streamInfo.url) : streamInfo.url;
                    if (streamInfo.type === 'M3U8') {
                        if (window.Hls && Hls.isSupported()) {
                            var hls = new Hls({
                                xhrSetup: function(xhr) {
                                    xhr.setRequestHeader('Referer', pageInfo.referer);
                                }
                            });
                            hls.loadSource(finalUrl);
                            hls.attachMedia(video);
                            window.__ump_hls__ = hls;
                        } else {
                            video.src = finalUrl;
                        }
                    } else {
                        video.src = finalUrl;
                    }
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
    
    console.log('🎬 UMP v2.1 loaded - No auto fullscreen + Bypass');
})();