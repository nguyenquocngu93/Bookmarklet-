/**
 * Universal Media Player V4 - Player Rewritten
 * - Phần scan + block ad giữ nguyên
 * - Video player viết lại hoàn toàn
 */
(function() {
    'use strict';
    
    var old = document.getElementById('__ump__');
    if (old) old.remove();
    
    // ========== AD IFRAME BLACKLIST ==========
    var AD_DOMAINS = [
        'jwpsrv.com', 'jwplayer.com/ads',
        'doubleclick.net', 'googlesyndication.com', 'googleadservices.com',
        'adnxs.com', 'adsystem.com', 'adservice.google',
        'popads.net', 'popcash.net', 'propellerads.com', 'popmyads.com',
        'exoclick.com', 'exosrv.com', 'trafficjunky.net', 'trafficstars.com',
        'juicyads.com', 'plugrush.com', 'ero-advertising.com',
        'adsterra.com', 'hilltopads.net', 'clickadu.com',
        'mgid.com', 'revcontent.com', 'taboola.com', 'outbrain.com',
        'zedo.com', 'infolinks.com', 'chitika.com',
        'yieldmo.com', 'adform.net', 'adroll.com',
        'openx.net', 'pubmatic.com', 'rubiconproject.com',
        'criteo.com', 'bidswitch.net', 'casalemedia.com',
        'contextweb.com', 'gumgum.com', 'sovrn.com',
        'admixer.net', 'adcolony.com', 'inmobi.com',
        'histats.com', 'quantcast.com', 'scorecardresearch.com'
    ];
    
    function blockAdIframes(doc) {
        var count = 0;
        try {
            doc.querySelectorAll('iframe').forEach(function(iframe) {
                var src = iframe.src || '';
                var isAd = AD_DOMAINS.some(function(domain) {
                    return src.toLowerCase().indexOf(domain) !== -1;
                });
                if (isAd) { iframe.remove(); count++; }
            });
        } catch(e) {}
        return count;
    }
    
    var initialBlocked = blockAdIframes(document);
    var iframeObserver = new MutationObserver(function(mutations) {
        mutations.forEach(function(m) {
            m.addedNodes.forEach(function(node) {
                if (node.nodeType === 1) {
                    if (node.tagName === 'IFRAME') {
                        var src = node.src || '';
                        if (AD_DOMAINS.some(function(d) { return src.toLowerCase().indexOf(d) !== -1; })) {
                            node.remove();
                        }
                    } else if (node.querySelectorAll) {
                        blockAdIframes(node);
                    }
                }
            });
        });
    });
    iframeObserver.observe(document.documentElement, { childList: true, subtree: true });
    
    // ========== PAGE INFO ==========
    var pageInfo = {
        title: (document.title || 'video').replace(/[^\w\s\u00C0-\u1EF9]/g, '').substring(0, 60).trim() || 'video',
        url: location.href,
        host: location.hostname.replace(/^www\./, ''),
        referer: location.origin + '/',
        origin: location.origin
    };
    
    // ========== FIND VIDEOS (GIỮ NGUYÊN) ==========
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
                    var isAd = AD_DOMAINS.some(function(d) { return i.src.toLowerCase().indexOf(d) !== -1; });
                    if (!isAd) urls.set(i.src, { type: 'IFRAME', source: 'iframe#' + idx, priority: 99 });
                }
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
    
    if (initialBlocked > 0) showToast('🚫 Blocked ' + initialBlocked + ' ads', '#f44336');
    
    if (playable.length === 0) {
        showFinderPanel(arr);
        return;
    }
    
    if (playable.length === 1) {
        openPlayer(playable[0]);
    } else {
        showQuickSelector(playable, arr);
    }
    
    // ========== QUICK SELECTOR (GIỮ NGUYÊN) ==========
    function showQuickSelector(playable, all) {
        var overlay = document.createElement('div');
        overlay.id = '__ump__';
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:2147483647;display:flex;align-items:center;justify-content:center;padding:15px;font-family:Arial;';
        
        var html = '<div style="background:#fff;border-radius:12px;padding:15px;max-width:450px;width:100%;color:#333;max-height:85vh;overflow-y:auto;box-shadow:0 10px 40px rgba(0,0,0,0.3);">';
        html += '<h2 style="color:#4CAF50;margin:0 0 12px;font-size:16px;text-align:center;">🎬 Chọn Stream (' + playable.length + ')</h2>';
        
        playable.forEach(function(item, i) {
            var typeColor = item.type === 'M3U8' ? '#4CAF50' : (item.type === 'MP4' ? '#FF9800' : '#2196F3');
            html += '<div style="background:#f5f5f5;padding:10px;margin-bottom:6px;border-radius:6px;border-left:3px solid ' + typeColor + ';">';
            html += '<span style="background:' + typeColor + ';color:#fff;padding:2px 8px;border-radius:3px;font-size:10px;font-weight:bold;">#' + (i+1) + ' ' + item.type + '</span>';
            html += '<div style="font-family:monospace;font-size:9px;color:#666;word-break:break-all;margin:5px 0;">' + item.url.substring(0, 80) + '</div>';
            html += '<button class="__ump_play__" data-idx="' + i + '" style="background:#4CAF50;color:#fff;border:0;padding:8px;border-radius:4px;font-weight:bold;width:100%;cursor:pointer;">▶️ Play</button>';
            html += '</div>';
        });
        
        if (all.length > playable.length) {
            html += '<button id="__ump_show_all__" style="background:#999;color:#fff;border:0;padding:8px;border-radius:5px;font-weight:bold;width:100%;margin-top:8px;">📋 Xem tất cả (' + all.length + ')</button>';
        }
        html += '<button id="__ump_close__" style="background:#f44336;color:#fff;border:0;padding:8px;border-radius:5px;font-weight:bold;width:100%;margin-top:8px;">✕ Hủy</button>';
        html += '</div>';
        
        overlay.innerHTML = html;
        document.body.appendChild(overlay);
        
        overlay.querySelectorAll('.__ump_play__').forEach(function(b) {
            b.onclick = function() { overlay.remove(); openPlayer(playable[parseInt(this.dataset.idx)]); };
        });
        document.getElementById('__ump_close__').onclick = function() { overlay.remove(); };
        var sa = document.getElementById('__ump_show_all__');
        if (sa) sa.onclick = function() { overlay.remove(); showFinderPanel(all); };
    }
    
    // ========== FINDER PANEL (GIỮ NGUYÊN) ==========
    function showFinderPanel(arr) {
        var overlay = document.createElement('div');
        overlay.id = '__ump__';
        overlay.style.cssText = 'position:fixed;inset:0;background:#f5f5f5;z-index:2147483647;overflow-y:auto;padding:15px;color:#333;font-family:Arial;';
        
        var html = '<h2 style="color:#4CAF50;margin:5px 0;text-align:center;">🎬 Media Finder (' + arr.length + ')</h2>';
        if (arr.length === 0) {
            html += '<div style="text-align:center;padding:40px;color:#666;background:#fff;border-radius:8px;">❌ Không tìm thấy media<br><small>Bấm Play video trước rồi chạy lại</small></div>';
        } else {
            arr.forEach(function(item, i) {
                var typeColor = item.type === 'IFRAME' ? '#2196F3' : '#4CAF50';
                html += '<div style="background:#fff;padding:10px;margin-bottom:6px;border-radius:6px;border-left:3px solid ' + typeColor + ';">';
                html += '<span style="background:' + typeColor + ';color:#fff;padding:2px 8px;border-radius:3px;font-size:10px;font-weight:bold;">#' + (i+1) + ' ' + item.type + '</span>';
                html += '<div style="font-family:monospace;font-size:9px;color:#666;word-break:break-all;margin:5px 0;">' + item.url + '</div>';
                html += '<div style="display:flex;gap:4px;">';
                if (item.type === 'IFRAME') {
                    html += '<a href="' + item.url + '" style="background:#2196F3;color:#fff;padding:6px 10px;border-radius:4px;font-size:10px;text-decoration:none;flex:1;text-align:center;font-weight:bold;">➡️ Vào</a>';
                } else {
                    html += '<button class="__ump_play_alt__" data-idx="' + i + '" style="background:#4CAF50;color:#fff;border:0;padding:6px 10px;border-radius:4px;font-size:10px;font-weight:bold;flex:1;">▶️ Play</button>';
                }
                html += '<button class="__ump_share__" data-url="' + encodeURIComponent(item.url) + '" style="background:#FF6B6B;color:#fff;border:0;padding:6px 10px;border-radius:4px;font-size:10px;font-weight:bold;flex:1;">📱 Share</button>';
                html += '</div></div>';
            });
        }
        html += '<button id="__ump_close__" style="background:#f44336;color:#fff;border:0;padding:12px;border-radius:5px;font-weight:bold;width:100%;margin-top:15px;">✕ Đóng</button>';
        
        overlay.innerHTML = html;
        document.body.appendChild(overlay);
        
        overlay.querySelectorAll('.__ump_play_alt__').forEach(function(b) {
            b.onclick = function() { overlay.remove(); openPlayer(arr[parseInt(this.dataset.idx)]); };
        });
        overlay.querySelectorAll('.__ump_share__').forEach(function(b) {
            b.onclick = function() { shareUrl(decodeURIComponent(this.dataset.url)); };
        });
        document.getElementById('__ump_close__').onclick = function() { overlay.remove(); };
    }
    
    // ==================== PLAYER V4 - REWRITTEN ====================
    function openPlayer(streamInfo) {
        activateGuard();
        
        // === TẠO OVERLAY ===
        var overlay = document.createElement('div');
        overlay.id = '__ump__';
        overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:#000;z-index:2147483647;';
        
        // === VIDEO ELEMENT ===
        var video = document.createElement('video');
        video.id = '__ump_video__';
        video.style.cssText = 'width:100%;height:100%;display:block;object-fit:contain;background:#000;';
        video.playsInline = true;
        video.autoplay = true;
        video.crossOrigin = 'anonymous';
        overlay.appendChild(video);
        
        // === LOADING ===
        var loading = document.createElement('div');
        loading.id = '__ump_loading__';
        loading.innerHTML = '<div style="background:rgba(0,0,0,0.7);color:#fff;padding:20px 30px;border-radius:10px;text-align:center;">⏳<br><small>Loading...</small></div>';
        loading.style.cssText = 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);z-index:100;pointer-events:none;font-family:Arial;';
        overlay.appendChild(loading);
        
        // === TOP BAR ===
        var topBar = document.createElement('div');
        topBar.style.cssText = 'position:absolute;top:0;left:0;right:0;padding:10px;display:flex;justify-content:space-between;align-items:center;z-index:50;background:linear-gradient(180deg,rgba(0,0,0,0.8),transparent);';
        topBar.innerHTML = 
            '<span style="color:#fff;font-size:13px;font-weight:bold;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;padding-right:10px;">' + pageInfo.title + '</span>' +
            '<button id="__ump_fullscreen_btn__" style="background:rgba(255,255,255,0.2);color:#fff;border:0;width:36px;height:36px;border-radius:50%;font-size:18px;margin-right:6px;cursor:pointer;">⛶</button>' +
            '<button id="__ump_menu_btn__" style="background:rgba(255,255,255,0.2);color:#fff;border:0;width:36px;height:36px;border-radius:50%;font-size:18px;margin-right:6px;cursor:pointer;">⋮</button>' +
            '<button id="__ump_close_btn__" style="background:#f44336;color:#fff;border:0;width:36px;height:36px;border-radius:50%;font-size:16px;font-weight:bold;cursor:pointer;">✕</button>';
        overlay.appendChild(topBar);
        
        // === PLAY BUTTON GIỮA ===
        var playBtn = document.createElement('button');
        playBtn.id = '__ump_play_btn__';
        playBtn.innerHTML = '▶';
        playBtn.style.cssText = 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:80px;height:80px;border-radius:50%;background:rgba(0,0,0,0.6);color:#fff;border:3px solid #fff;font-size:32px;cursor:pointer;z-index:60;display:flex;align-items:center;justify-content:center;transition:opacity 0.3s;';
        overlay.appendChild(playBtn);
        
        // === SEEK BUTTONS ===
        var seekBack = document.createElement('button');
        seekBack.innerHTML = '⏪';
        seekBack.style.cssText = 'position:absolute;top:50%;left:10%;transform:translateY(-50%);width:50px;height:50px;border-radius:50%;background:rgba(0,0,0,0.5);color:#fff;border:2px solid rgba(255,255,255,0.5);font-size:20px;cursor:pointer;z-index:60;display:flex;align-items:center;justify-content:center;transition:opacity 0.3s;';
        overlay.appendChild(seekBack);
        
        var seekFwd = document.createElement('button');
        seekFwd.innerHTML = '⏩';
        seekFwd.style.cssText = 'position:absolute;top:50%;right:10%;transform:translateY(-50%);width:50px;height:50px;border-radius:50%;background:rgba(0,0,0,0.5);color:#fff;border:2px solid rgba(255,255,255,0.5);font-size:20px;cursor:pointer;z-index:60;display:flex;align-items:center;justify-content:center;transition:opacity 0.3s;';
        overlay.appendChild(seekFwd);
        
        // === BOTTOM BAR (PROGRESS + TIME) ===
        var bottomBar = document.createElement('div');
        bottomBar.style.cssText = 'position:absolute;bottom:0;left:0;right:0;padding:15px 10px 10px;z-index:50;background:linear-gradient(0deg,rgba(0,0,0,0.8),transparent);';
        
        var progressWrapper = document.createElement('div');
        progressWrapper.style.cssText = 'position:relative;height:20px;margin-bottom:8px;';
        
        // Progress bar background
        var progressBg = document.createElement('div');
        progressBg.style.cssText = 'position:absolute;top:8px;left:0;right:0;height:4px;background:rgba(255,255,255,0.3);border-radius:2px;';
        progressWrapper.appendChild(progressBg);
        
        // Progress fill
        var progressFill = document.createElement('div');
        progressFill.id = '__ump_progress_fill__';
        progressFill.style.cssText = 'position:absolute;top:8px;left:0;height:4px;background:#4CAF50;border-radius:2px;width:0%;pointer-events:none;';
        progressWrapper.appendChild(progressFill);
        
        // Progress dot
        var progressDot = document.createElement('div');
        progressDot.id = '__ump_progress_dot__';
        progressDot.style.cssText = 'position:absolute;top:4px;left:0%;width:12px;height:12px;background:#4CAF50;border-radius:50%;transform:translateX(-50%);pointer-events:none;z-index:2;';
        progressWrapper.appendChild(progressDot);
        
        // Range input (trong suốt đè lên)
        var seekRange = document.createElement('input');
        seekRange.type = 'range';
        seekRange.id = '__ump_seek_range__';
        seekRange.min = '0';
        seekRange.max = '100';
        seekRange.value = '0';
        seekRange.step = '0.1';
        seekRange.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:20px;opacity:0;cursor:pointer;margin:0;z-index:3;';
        progressWrapper.appendChild(seekRange);
        
        bottomBar.appendChild(progressWrapper);
        
        // Time display
        var timeRow = document.createElement('div');
        timeRow.style.cssText = 'display:flex;justify-content:space-between;';
        var timeCur = document.createElement('span');
        timeCur.id = '__ump_time_cur__';
        timeCur.style.cssText = 'color:#fff;font-size:12px;font-family:monospace;';
        timeCur.textContent = '0:00';
        var timeDur = document.createElement('span');
        timeDur.id = '__ump_time_dur__';
        timeDur.style.cssText = 'color:#fff;font-size:12px;font-family:monospace;';
        timeDur.textContent = '0:00';
        timeRow.appendChild(timeCur);
        timeRow.appendChild(timeDur);
        bottomBar.appendChild(timeRow);
        
        overlay.appendChild(bottomBar);
        
        document.body.appendChild(overlay);
        
        // === LOAD VIDEO ===
        var url = streamInfo.url;
        var hlsInstance = null;
        
        if (streamInfo.type === 'M3U8') {
            if (window.Hls && Hls.isSupported()) {
                loadHls();
            } else {
                var s = document.createElement('script');
                s.src = 'https://cdn.jsdelivr.net/npm/hls.js@latest';
                s.onload = loadHls;
                s.onerror = function() { video.src = url; };
                document.head.appendChild(s);
            }
        } else if (streamInfo.type === 'MPD') {
            var s = document.createElement('script');
            s.src = 'https://cdn.jsdelivr.net/npm/dashjs@latest/dist/dash.all.min.js';
            s.onload = function() {
                var player = dashjs.MediaPlayer().create();
                player.initialize(video, url, true);
            };
            document.head.appendChild(s);
        } else {
            video.src = url;
        }
        
        function loadHls() {
            if (!Hls.isSupported()) { video.src = url; return; }
            hlsInstance = new Hls({
                xhrSetup: function(xhr) { xhr.setRequestHeader('Referer', pageInfo.referer); }
            });
            hlsInstance.loadSource(url);
            hlsInstance.attachMedia(video);
        }
        
        // === VIDEO EVENTS ===
        video.addEventListener('loadedmetadata', function() {
            loading.style.display = 'none';
            timeDur.textContent = formatTime(video.duration);
            seekRange.max = video.duration;
        });
        
        video.addEventListener('play', function() {
            playBtn.innerHTML = '⏸';
        });
        
        video.addEventListener('pause', function() {
            playBtn.innerHTML = '▶';
            playBtn.style.opacity = '1';
        });
        
        video.addEventListener('timeupdate', function() {
            var pct = (video.currentTime / video.duration) * 100 || 0;
            timeCur.textContent = formatTime(video.currentTime);
            seekRange.value = video.currentTime;
            progressFill.style.width = pct + '%';
            progressDot.style.left = pct + '%';
        });
        
        video.addEventListener('waiting', function() {
            loading.style.display = 'block';
        });
        
        video.addEventListener('canplay', function() {
            loading.style.display = 'none';
        });
        
        video.addEventListener('ended', function() {
            playBtn.innerHTML = '↺';
            playBtn.style.opacity = '1';
        });
        
        video.addEventListener('error', function() {
            loading.innerHTML = '<div style="background:rgba(0,0,0,0.8);color:#f44336;padding:20px;border-radius:10px;text-align:center;">❌<br>Video lỗi</div>';
            loading.style.display = 'block';
        });
        
        // === CLICK HANDLERS ===
        // Play/Pause
        function togglePlay() {
            if (video.paused || video.ended) {
                if (video.ended) { video.currentTime = 0; }
                video.play().catch(function(){});
            } else {
                video.pause();
            }
        }
        
        playBtn.onclick = function(e) {
            e.stopPropagation();
            togglePlay();
        };
        
        // Click video để play/pause
        video.onclick = function(e) {
            e.stopPropagation();
            togglePlay();
        };
        
        // Click overlay trống để play/pause
        overlay.onclick = function(e) {
            if (e.target === overlay) togglePlay();
        };
        
        // Seek buttons
        seekBack.onclick = function(e) {
            e.stopPropagation();
            video.currentTime = Math.max(0, video.currentTime - 10);
        };
        
        seekFwd.onclick = function(e) {
            e.stopPropagation();
            video.currentTime = Math.min(video.duration, video.currentTime + 10);
        };
        
        // Seek range
        seekRange.oninput = function(e) {
            e.stopPropagation();
            video.currentTime = parseFloat(this.value);
        };
        
        seekRange.addEventListener('touchstart', function(e) {
            e.stopPropagation();
        });
        
        seekRange.addEventListener('touchend', function(e) {
            e.stopPropagation();
        });
        
        // Fullscreen
        var isFullscreen = false;
        document.getElementById('__ump_fullscreen_btn__').onclick = function(e) {
            e.stopPropagation();
            if (!isFullscreen) {
                if (overlay.requestFullscreen) {
                    overlay.requestFullscreen({ navigationUI: 'hide' }).catch(function(){});
                }
                if (screen.orientation && screen.orientation.lock) {
                    screen.orientation.lock('landscape').catch(function(){});
                }
            } else {
                if (document.fullscreenElement) {
                    document.exitFullscreen().catch(function(){});
                }
                if (screen.orientation && screen.orientation.unlock) {
                    screen.orientation.unlock();
                }
            }
        };
        
        document.addEventListener('fullscreenchange', function() {
            isFullscreen = !!document.fullscreenElement;
        });
        
        // Menu
        document.getElementById('__ump_menu_btn__').onclick = function(e) {
            e.stopPropagation();
            showMenu(streamInfo, video, hlsInstance);
        };
        
        // Close
        document.getElementById('__ump_close_btn__').onclick = function(e) {
            e.stopPropagation();
            video.pause();
            video.src = '';
            if (hlsInstance) hlsInstance.destroy();
            if (document.fullscreenElement) document.exitFullscreen().catch(function(){});
            if (screen.orientation && screen.orientation.unlock) screen.orientation.unlock();
            deactivateGuard();
            overlay.remove();
        };
        
        // Auto-hide controls khi playing
        var hideTimer;
        function resetHideTimer() {
            topBar.style.opacity = '1';
            bottomBar.style.opacity = '1';
            seekBack.style.opacity = '1';
            seekFwd.style.opacity = '1';
            if (!video.paused) playBtn.style.opacity = '1';
            
            clearTimeout(hideTimer);
            if (!video.paused) {
                hideTimer = setTimeout(function() {
                    topBar.style.opacity = '0';
                    bottomBar.style.opacity = '0';
                    seekBack.style.opacity = '0';
                    seekFwd.style.opacity = '0';
                    playBtn.style.opacity = '0';
                }, 3000);
            }
        }
        
        overlay.addEventListener('mousemove', resetHideTimer);
        overlay.addEventListener('touchstart', resetHideTimer);
        overlay.addEventListener('click', resetHideTimer);
        resetHideTimer();
        
        // Media Session
        if ('mediaSession' in navigator) {
            navigator.mediaSession.metadata = new MediaMetadata({
                title: pageInfo.title,
                artist: pageInfo.host,
                album: 'UMP V4'
            });
            navigator.mediaSession.setActionHandler('play', function() { video.play(); });
            navigator.mediaSession.setActionHandler('pause', function() { video.pause(); });
            navigator.mediaSession.setActionHandler('seekbackward', function() { video.currentTime -= 10; });
            navigator.mediaSession.setActionHandler('seekforward', function() { video.currentTime += 10; });
        }
    }
    
    // ========== MENU (GIỮ NGUYÊN NHƯNG GỌN HƠN) ==========
    function showMenu(streamInfo, video, hls) {
        var menu = document.createElement('div');
        menu.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:2147483648;display:flex;align-items:center;justify-content:center;padding:15px;font-family:Arial;';
        
        var html = '<div style="background:#fff;border-radius:12px;padding:15px;max-width:380px;width:100%;color:#333;max-height:90vh;overflow-y:auto;">';
        html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">';
        html += '<h3 style="color:#4CAF50;margin:0;">⚙️ Menu</h3>';
        html += '<button id="__ump_m_close__" style="background:#f44336;color:#fff;border:0;width:30px;height:30px;border-radius:50%;font-weight:bold;cursor:pointer;">✕</button>';
        html += '</div>';
        
        // Quality
        if (hls && hls.levels && hls.levels.length > 1) {
            var current = hls.currentLevel === -1 ? 'Auto' : hls.levels[hls.currentLevel].height + 'p';
            html += '<div style="background:#f5f5f5;padding:10px;border-radius:6px;margin-bottom:10px;">';
            html += '<div style="color:#666;font-size:11px;margin-bottom:6px;">🎞️ Chất lượng (<b>' + current + '</b>)</div>';
            html += '<button class="__ump_q__" data-level="-1" style="margin:2px;padding:6px 12px;border:0;border-radius:4px;cursor:pointer;">Auto</button>';
            hls.levels.forEach(function(l, i) {
                html += '<button class="__ump_q__" data-level="' + i + '" style="margin:2px;padding:6px 12px;border:0;border-radius:4px;cursor:pointer;">' + l.height + 'p</button>';
            });
            html += '</div>';
        }
        
        // Speed
        html += '<div style="background:#f5f5f5;padding:10px;border-radius:6px;margin-bottom:10px;">';
        html += '<div style="color:#666;font-size:11px;margin-bottom:6px;">⚡ Tốc độ (<b>' + video.playbackRate + 'x</b>)</div>';
        [0.5, 0.75, 1, 1.25, 1.5, 2, 4].forEach(function(s) {
            html += '<button class="__ump_speed__" data-s="' + s + '" style="margin:2px;padding:6px 12px;border:0;border-radius:4px;cursor:pointer;">' + s + 'x</button>';
        });
        html += '</div>';
        
        // Actions
        html += '<div style="background:#f5f5f5;padding:10px;border-radius:6px;margin-bottom:10px;">';
        html += '<div style="color:#666;font-size:11px;margin-bottom:6px;">🎥 Actions</div>';
        html += '<button class="__ump_m__" data-a="pip" style="margin:2px;padding:8px 12px;border:0;border-radius:4px;cursor:pointer;background:#607D8B;color:#fff;">📺 PiP</button>';
        html += '<button class="__ump_m__" data-a="mute" style="margin:2px;padding:8px 12px;border:0;border-radius:4px;cursor:pointer;background:#607D8B;color:#fff;">🔇 Mute</button>';
        html += '<button class="__ump_m__" data-a="loop" style="margin:2px;padding:8px 12px;border:0;border-radius:4px;cursor:pointer;background:#607D8B;color:#fff;">🔁 Loop</button>';
        html += '<button class="__ump_m__" data-a="screenshot" style="margin:2px;padding:8px 12px;border:0;border-radius:4px;cursor:pointer;background:#607D8B;color:#fff;">📸 Screenshot</button>';
        html += '</div>';
        
        // Share & Download
        html += '<div style="background:#f5f5f5;padding:10px;border-radius:6px;margin-bottom:10px;">';
        html += '<div style="color:#666;font-size:11px;margin-bottom:6px;">📤 Share & Download</div>';
        html += '<button class="__ump_m__" data-a="share-url" style="display:block;width:100%;margin:3px 0;padding:10px;border:0;border-radius:4px;cursor:pointer;background:#FF6B6B;color:#fff;text-align:left;">📱 Share URL</button>';
        html += '<button class="__ump_m__" data-a="copy-url" style="display:block;width:100%;margin:3px 0;padding:10px;border:0;border-radius:4px;cursor:pointer;background:#607D8B;color:#fff;text-align:left;">📋 Copy URL</button>';
        html += '<button class="__ump_m__" data-a="dl-cmd" style="display:block;width:100%;margin:3px 0;padding:10px;border:0;border-radius:4px;cursor:pointer;background:#9C27B0;color:#fff;text-align:left;">💻 Copy yt-dlp</button>';
        html += '</div>';
        
        html += '<div style="font-size:11px;color:#666;">📊 Type: <b>' + streamInfo.type + '</b> | 🌐 ' + pageInfo.host + '</div>';
        html += '</div>';
        
        menu.innerHTML = html;
        document.body.appendChild(menu);
        
        menu.querySelectorAll('.__ump_q__').forEach(function(b) {
            b.onclick = function() {
                if (hls) { hls.currentLevel = parseInt(this.dataset.level); showToast('✓ Quality changed', '#9C27B0'); }
                menu.remove();
            };
        });
        
        menu.querySelectorAll('.__ump_speed__').forEach(function(b) {
            b.onclick = function() {
                video.playbackRate = parseFloat(this.dataset.s);
                showToast('⚡ Speed: ' + video.playbackRate + 'x', '#4CAF50');
                menu.remove();
            };
        });
        
        menu.querySelectorAll('.__ump_m__').forEach(function(b) {
            b.onclick = function() {
                var a = this.dataset.a, url = streamInfo.url;
                if (a === 'pip') {
                    if (document.pictureInPictureElement) document.exitPictureInPicture();
                    else if (video.requestPictureInPicture) video.requestPictureInPicture().catch(function(){});
                } else if (a === 'mute') {
                    video.muted = !video.muted; showToast(video.muted ? '🔇 Muted' : '🔊 Unmuted', '#607D8B');
                } else if (a === 'loop') {
                    video.loop = !video.loop; showToast(video.loop ? '🔁 Loop ON' : '🔁 Loop OFF', '#4CAF50');
                } else if (a === 'screenshot') {
                    try {
                        var canvas = document.createElement('canvas');
                        canvas.width = video.videoWidth; canvas.height = video.videoHeight;
                        canvas.getContext('2d').drawImage(video, 0, 0);
                        canvas.toBlob(function(blob) {
                            var a = document.createElement('a');
                            a.href = URL.createObjectURL(blob);
                            a.download = pageInfo.title + '_' + Math.floor(video.currentTime) + 's.png';
                            a.click();
                            showToast('📸 Saved', '#4CAF50');
                        });
                    } catch(e) { showToast('❌ CORS error', '#f44336'); }
                } else if (a === 'share-url') shareUrl(url);
                else if (a === 'copy-url') { copy(url); showToast('✓ Copied', '#4CAF50'); }
                else if (a === 'dl-cmd') {
                    var cmd = 'yt-dlp --referer "' + pageInfo.referer + '" -f best -o "' + pageInfo.title + '.%(ext)s" "' + url + '"';
                    copy(cmd); showToast('✓ yt-dlp copied', '#9C27B0');
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
        t.style.cssText = 'position:fixed;top:60px;left:50%;transform:translateX(-50%);background:' + (color || '#333') + ';color:#fff;padding:8px 15px;border-radius:15px;z-index:2147483649;font:bold 12px Arial;box-shadow:0 3px 12px rgba(0,0,0,0.5);pointer-events:none;';
        document.body.appendChild(t);
        setTimeout(function() { t.remove(); }, 2000);
    }
    
    function shareUrl(url) {
        if (navigator.share) {
            navigator.share({ title: pageInfo.title, url: url }).catch(function(){});
        } else {
            copy(url); showToast('✓ Copied', '#FF6B6B');
        }
    }
    
    // ========== GUARD ==========
    function activateGuard() {
        if (window.__ump_guard_active__) return;
        window.__ump_guard_active__ = true;
        window.__ump_originals__ = { open: window.open };
        window.open = function() { return null; };
        window.__ump_click_blocker__ = function(e) {
            var link = e.target.closest('a');
            if (link && link.href && !link.href.startsWith('#') && !link.href.startsWith('javascript:')) {
                try {
                    if (new URL(link.href).hostname !== pageInfo.host) {
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
        if (window.__ump_originals__) window.open = window.__ump_originals__.open;
        if (window.__ump_click_blocker__) document.removeEventListener('click', window.__ump_click_blocker__, true);
        if (window.__ump_iframe_observer__) window.__ump_iframe_observer__.disconnect();
        window.__ump_guard_active__ = false;
    }
    
    console.log('🎬 UMP V4 loaded');
})();