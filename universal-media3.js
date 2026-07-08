/**
 * Universal Media Player V3
 * - Minimalist controls (Play + Seek only)
 * - Advanced features in ⋮ menu
 * - Rotation-aware controls
 * - Ad iframe blocker
 */
(function() {
    'use strict';
    
    var old = document.getElementById('__ump__');
    if (old) old.remove();
    
    // ========== AD IFRAME BLACKLIST ==========
    // Domains that host ads / trackers / redirect iframes
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
        'nend.net', 'smaato.com', 'startapp.com',
        'a-mo.net', 'amoad.com', 'ads-twitter.com',
        'ampproject.org/ads', 'g.doubleclick', 
        'stats.g.doubleclick', 'partner.googleadservices.com',
        'partnerad.l.google.com', 'pagead2.googlesyndication.com',
        'imasdk.googleapis.com',
        'ad.doubleclick.net', 'securepubads.g.doubleclick.net',
        '/ads/', '/adserv', '/adframe', '/adload',
        'notrack', // Ironic - trang này có "notrack" trong URL
        'onclickalgo.com', 'onclkds.com', 'onclickmega.com',
        'clickfrog', 'popcashlist', 'popup', 'popunder',
        'histats.com', 'quantcast.com', 'scorecardresearch.com'
    ];
    
    // ========== BLOCK AD IFRAMES ==========
    function blockAdIframes(doc) {
        var count = 0;
        try {
            doc.querySelectorAll('iframe').forEach(function(iframe) {
                var src = iframe.src || '';
                var isAd = AD_DOMAINS.some(function(domain) {
                    return src.toLowerCase().indexOf(domain) !== -1;
                });
                
                if (isAd) {
                    console.log('🚫 Blocked ad iframe:', src);
                    iframe.remove();
                    count++;
                }
            });
        } catch(e) {}
        return count;
    }
    
    // Block ngay lập tức
    var initialBlocked = blockAdIframes(document);
    
    // Watch for new ad iframes
    var iframeObserver = new MutationObserver(function(mutations) {
        mutations.forEach(function(m) {
            m.addedNodes.forEach(function(node) {
                if (node.nodeType === 1) {
                    if (node.tagName === 'IFRAME') {
                        var src = node.src || '';
                        var isAd = AD_DOMAINS.some(function(d) { return src.toLowerCase().indexOf(d) !== -1; });
                        if (isAd) {
                            console.log('🚫 Blocked new ad iframe:', src);
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
    window.__ump_iframe_observer__ = iframeObserver;
    
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
                if (i.src) {
                    // Chỉ add iframe không phải ad
                    var isAd = AD_DOMAINS.some(function(d) { return i.src.toLowerCase().indexOf(d) !== -1; });
                    if (!isAd) {
                        urls.set(i.src, { type: 'IFRAME', source: 'iframe#' + idx, priority: 99 });
                    }
                }
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
    
    if (initialBlocked > 0) {
        showToast('🚫 Blocked ' + initialBlocked + ' ad iframes', '#f44336');
    }
    
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
        
        var html = '<div style="background:#fff;border-radius:12px;padding:15px;max-width:450px;width:100%;color:#333;max-height:85vh;overflow-y:auto;box-shadow:0 10px 40px rgba(0,0,0,0.3);">';
        html += '<h2 style="color:#4CAF50;margin:0 0 12px;font-size:16px;text-align:center;">🎬 Chọn Stream (' + playable.length + ')</h2>';
        
        playable.forEach(function(item, i) {
            var typeColor = item.type === 'M3U8' ? '#4CAF50' : (item.type === 'MP4' ? '#FF9800' : '#2196F3');
            html += '<div style="background:#f5f5f5;padding:10px;margin-bottom:6px;border-radius:6px;border-left:3px solid ' + typeColor + ';">';
            html += '<div style="display:flex;justify-content:space-between;margin-bottom:5px;">';
            html += '<span style="background:' + typeColor + ';color:#fff;padding:2px 8px;border-radius:3px;font-size:10px;font-weight:bold;">#' + (i+1) + ' ' + item.type + '</span>';
            html += '</div>';
            html += '<div style="font-family:monospace;font-size:9px;color:#666;word-break:break-all;margin-bottom:6px;">' + item.url.substring(0, 80) + '</div>';
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
        var sa = document.getElementById('__ump_show_all__');
        if (sa) sa.onclick = function() { overlay.remove(); showFinderPanel(all); };
    }
    
    // ========== FINDER PANEL ==========
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
                html += '<div style="background:#fff;padding:10px;margin-bottom:6px;border-radius:6px;border-left:3px solid ' + typeColor + ';box-shadow:0 1px 3px rgba(0,0,0,0.1);">';
                html += '<div style="margin-bottom:5px;">';
                html += '<span style="background:' + typeColor + ';color:#fff;padding:2px 8px;border-radius:3px;font-size:10px;font-weight:bold;">#' + (i+1) + ' ' + item.type + '</span>';
                html += '</div>';
                html += '<div style="font-family:monospace;font-size:9px;color:#666;word-break:break-all;margin-bottom:6px;">' + item.url + '</div>';
                html += '<div style="display:flex;gap:4px;">';
                if (item.type === 'IFRAME') {
                    html += '<a href="' + item.url + '" style="background:#2196F3;color:#fff;padding:6px 10px;border-radius:4px;font-size:10px;text-decoration:none;flex:1;text-align:center;font-weight:bold;">➡️ Vào</a>';
                } else {
                    html += '<button class="__ump_play_alt__" data-idx="' + i + '" style="background:#4CAF50;color:#fff;border:0;padding:6px 10px;border-radius:4px;font-size:10px;font-weight:bold;flex:1;">▶️ Play</button>';
                }
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
        overlay.querySelectorAll('.__ump_share__').forEach(function(b) {
            b.onclick = function() { shareUrl(decodeURIComponent(this.dataset.url)); };
        });
        document.getElementById('__ump_close__').onclick = function() { overlay.remove(); };
    }
    
    // ========== PLAYER V3 - MINIMALIST ==========
    function openPlayer(streamInfo) {
        activateGuard();
        
        var overlay = document.createElement('div');
        overlay.id = '__ump__';
        overlay.style.cssText = 'position:fixed;inset:0;background:#000;z-index:2147483647;overflow:hidden;font-family:Arial;';
        
        // ========== VIDEO ==========
        var video = document.createElement('video');
        video.id = '__ump_video__';
        video.controls = false;
        video.style.cssText = 'width:100%;height:100%;position:absolute;top:0;left:0;object-fit:contain;background:#000;';
        video.crossOrigin = 'anonymous';
        video.playsInline = true;
        video.autoplay = true;
        overlay.appendChild(video);
        
        // ========== CONTROLS CONTAINER (xoay theo video) ==========
        var controlsContainer = document.createElement('div');
        controlsContainer.id = '__ump_controls_container__';
        controlsContainer.style.cssText = 'position:absolute;inset:0;pointer-events:none;';
        overlay.appendChild(controlsContainer);
        
        // ========== LOADING ==========
        var loading = document.createElement('div');
        loading.innerHTML = '<div style="color:#fff;text-align:center;"><div style="font-size:36px;">⏳</div><div style="font-size:12px;margin-top:5px;">Loading...</div></div>';
        loading.style.cssText = 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);z-index:50;pointer-events:none;';
        controlsContainer.appendChild(loading);
        
        // ========== TOP BAR (minimalist) ==========
        var topBar = document.createElement('div');
        topBar.id = '__ump_topbar__';
        topBar.style.cssText = 'position:absolute;top:0;left:0;right:0;background:linear-gradient(180deg,rgba(0,0,0,0.7),transparent);padding:12px 15px;display:flex;justify-content:space-between;align-items:center;transition:opacity 0.3s;pointer-events:auto;';
        topBar.innerHTML = 
            '<div style="color:#fff;font-size:13px;flex:1;overflow:hidden;padding-right:10px;">' +
                '<div style="font-weight:bold;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + pageInfo.title + '</div>' +
            '</div>' +
            '<button id="__ump_menu_btn__" style="background:rgba(255,255,255,0.15);color:#fff;border:0;padding:10px 14px;border-radius:50%;font-size:18px;margin-right:6px;">⋮</button>' +
            '<button id="__ump_close_player__" style="background:rgba(244,67,54,0.9);color:#fff;border:0;padding:10px 14px;border-radius:50%;font-size:16px;font-weight:bold;">✕</button>';
        controlsContainer.appendChild(topBar);
        
        // ========== CENTER PLAY BUTTON (giữa video) ==========
        var centerPlay = document.createElement('div');
        centerPlay.id = '__ump_center_play__';
        centerPlay.style.cssText = 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);pointer-events:auto;transition:opacity 0.3s,transform 0.2s;';
        centerPlay.innerHTML = '<button id="__ump_center_btn__" style="background:rgba(0,0,0,0.6);color:#fff;border:2px solid #fff;width:70px;height:70px;border-radius:50%;font-size:28px;cursor:pointer;display:flex;align-items:center;justify-content:center;">▶</button>';
        controlsContainer.appendChild(centerPlay);
        
        // ========== SEEK BUTTONS (2 bên) ==========
        var seekLeft = document.createElement('button');
        seekLeft.id = '__ump_seek_left__';
        seekLeft.innerHTML = '⏪<br><small style="font-size:9px;">10s</small>';
        seekLeft.style.cssText = 'position:absolute;top:50%;left:15%;transform:translateY(-50%);background:rgba(0,0,0,0.5);color:#fff;border:0;width:55px;height:55px;border-radius:50%;font-size:18px;pointer-events:auto;transition:opacity 0.3s;line-height:1;';
        controlsContainer.appendChild(seekLeft);
        
        var seekRight = document.createElement('button');
        seekRight.id = '__ump_seek_right__';
        seekRight.innerHTML = '⏩<br><small style="font-size:9px;">10s</small>';
        seekRight.style.cssText = 'position:absolute;top:50%;right:15%;transform:translateY(-50%);background:rgba(0,0,0,0.5);color:#fff;border:0;width:55px;height:55px;border-radius:50%;font-size:18px;pointer-events:auto;transition:opacity 0.3s;line-height:1;';
        controlsContainer.appendChild(seekRight);
        
        // ========== BOTTOM BAR (progress + time) ==========
        var bottomBar = document.createElement('div');
        bottomBar.id = '__ump_bottombar__';
        bottomBar.style.cssText = 'position:absolute;bottom:0;left:0;right:0;background:linear-gradient(0deg,rgba(0,0,0,0.8),transparent);padding:20px 15px 15px;transition:opacity 0.3s;pointer-events:auto;';
        bottomBar.innerHTML = 
            '<div style="display:flex;align-items:center;gap:10px;">' +
                '<span id="__ump_time_cur__" style="color:#fff;font-size:12px;font-family:monospace;min-width:40px;">0:00</span>' +
                '<div style="flex:1;position:relative;height:20px;display:flex;align-items:center;cursor:pointer;" id="__ump_seek_wrapper__">' +
                    '<div style="width:100%;height:4px;background:rgba(255,255,255,0.3);border-radius:2px;position:relative;">' +
                        '<div id="__ump_seek_fill__" style="height:100%;background:#4CAF50;border-radius:2px;width:0%;transition:width 0.1s;"></div>' +
                        '<div id="__ump_seek_thumb__" style="position:absolute;width:14px;height:14px;background:#4CAF50;border-radius:50%;top:50%;transform:translate(-50%,-50%);left:0%;box-shadow:0 0 4px rgba(0,0,0,0.5);"></div>' +
                    '</div>' +
                    '<input type="range" id="__ump_seek__" min="0" max="100" value="0" step="0.1" style="position:absolute;inset:0;opacity:0;cursor:pointer;">' +
                '</div>' +
                '<span id="__ump_time_dur__" style="color:#fff;font-size:12px;font-family:monospace;min-width:40px;">0:00</span>' +
            '</div>';
        controlsContainer.appendChild(bottomBar);
        
        document.body.appendChild(overlay);
        
        // ========== FORCE FULLSCREEN + LANDSCAPE ==========
        setTimeout(function() {
            if (overlay.requestFullscreen) {
                overlay.requestFullscreen({ navigationUI: 'hide' }).catch(function(){});
            }
            if (screen.orientation && screen.orientation.lock) {
                screen.orientation.lock('landscape').catch(function(){});
            }
        }, 300);
        
        // ========== LOAD VIDEO ==========
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
            window.__ump_hls__ = hlsInstance;
        }
        
        // ========== VIDEO EVENTS ==========
        video.addEventListener('loadedmetadata', function() {
            loading.remove();
            document.getElementById('__ump_time_dur__').textContent = formatTime(video.duration);
            document.getElementById('__ump_seek__').max = video.duration;
        });
        
        video.addEventListener('play', function() {
            document.getElementById('__ump_center_btn__').innerHTML = '⏸';
            hideCenterAfter();
        });
        
        video.addEventListener('pause', function() {
            document.getElementById('__ump_center_btn__').innerHTML = '▶';
            centerPlay.style.opacity = '1';
        });
        
        video.addEventListener('timeupdate', function() {
            document.getElementById('__ump_time_cur__').textContent = formatTime(video.currentTime);
            var seekInput = document.getElementById('__ump_seek__');
            seekInput.value = video.currentTime;
            var pct = (video.currentTime / video.duration) * 100;
            document.getElementById('__ump_seek_fill__').style.width = pct + '%';
            document.getElementById('__ump_seek_thumb__').style.left = pct + '%';
        });
        
        video.addEventListener('error', function() {
            loading.innerHTML = '<div style="color:#f44336;text-align:center;background:rgba(0,0,0,0.8);padding:20px;border-radius:10px;pointer-events:auto;"><div style="font-size:30px;">❌</div><div>Video lỗi</div></div>';
            controlsContainer.appendChild(loading);
        });
        
        // ========== HANDLERS ==========
        function togglePlay() {
            if (video.paused) video.play(); else video.pause();
        }
        
        document.getElementById('__ump_center_btn__').onclick = togglePlay;
        
        document.getElementById('__ump_seek_left__').onclick = function() {
            video.currentTime = Math.max(0, video.currentTime - 10);
            flashSeekIndicator('left', '-10s');
        };
        
        document.getElementById('__ump_seek_right__').onclick = function() {
            video.currentTime = Math.min(video.duration, video.currentTime + 10);
            flashSeekIndicator('right', '+10s');
        };
        
        function flashSeekIndicator(side, text) {
            var indicator = document.createElement('div');
            indicator.style.cssText = 'position:absolute;top:50%;' + side + ':30%;transform:translateY(-50%);background:rgba(0,0,0,0.8);color:#fff;padding:15px 20px;border-radius:50%;font-weight:bold;font-size:14px;z-index:200;pointer-events:none;animation:umpFlash 0.5s;';
            indicator.innerText = text;
            controlsContainer.appendChild(indicator);
            setTimeout(function() { indicator.remove(); }, 500);
        }
        
        document.getElementById('__ump_seek__').oninput = function() {
            video.currentTime = parseFloat(this.value);
        };
        
        // Click vào video (không phải controls) → toggle play
        video.addEventListener('click', function(e) {
            e.stopPropagation();
        });
        
        overlay.addEventListener('click', function(e) {
            // Click vào chỗ trống → toggle play
            if (e.target === overlay || e.target === controlsContainer || e.target === video) {
                if (video.readyState >= 2) togglePlay();
            }
            showControls();
        });
        
        // Double tap để seek (như YouTube)
        var lastTap = 0;
        overlay.addEventListener('touchend', function(e) {
            var now = Date.now();
            if (now - lastTap < 300 && e.touches.length === 0) {
                var touch = e.changedTouches[0];
                var width = window.innerWidth;
                if (touch.clientX < width / 3) {
                    // Tap trái → -10s
                    video.currentTime = Math.max(0, video.currentTime - 10);
                    flashSeekIndicator('left', '-10s');
                    e.preventDefault();
                } else if (touch.clientX > width * 2 / 3) {
                    // Tap phải → +10s
                    video.currentTime = Math.min(video.duration, video.currentTime + 10);
                    flashSeekIndicator('right', '+10s');
                    e.preventDefault();
                }
            }
            lastTap = now;
        });
        
        // ========== AUTO HIDE ==========
        var hideTimer, centerHideTimer;
        function showControls() {
            topBar.style.opacity = '1';
            bottomBar.style.opacity = '1';
            seekLeft.style.opacity = '0.8';
            seekRight.style.opacity = '0.8';
            if (!video.paused) centerPlay.style.opacity = '1';
            
            clearTimeout(hideTimer);
            hideTimer = setTimeout(function() {
                if (!video.paused) {
                    topBar.style.opacity = '0';
                    bottomBar.style.opacity = '0';
                    seekLeft.style.opacity = '0';
                    seekRight.style.opacity = '0';
                    centerPlay.style.opacity = '0';
                }
            }, 3000);
        }
        
        function hideCenterAfter() {
            clearTimeout(centerHideTimer);
            centerHideTimer = setTimeout(function() {
                if (!video.paused) centerPlay.style.opacity = '0';
            }, 1000);
        }
        
        showControls();
        
        // ========== TOP BAR HANDLERS ==========
        document.getElementById('__ump_close_player__').onclick = function() {
            video.pause();
            video.src = '';
            if (hlsInstance) hlsInstance.destroy();
            if (document.fullscreenElement) document.exitFullscreen().catch(function(){});
            if (screen.orientation && screen.orientation.unlock) screen.orientation.unlock();
            deactivateGuard();
            overlay.remove();
        };
        
        document.getElementById('__ump_menu_btn__').onclick = function() { 
            showMenu(streamInfo, video, hlsInstance); 
        };
        
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
        
        // ========== CSS ANIMATIONS ==========
        var style = document.createElement('style');
        style.id = '__ump_style__';
        style.textContent = 
            '@keyframes umpFlash { 0% { opacity: 0; transform: translateY(-50%) scale(0.5); } 50% { opacity: 1; transform: translateY(-50%) scale(1); } 100% { opacity: 0; transform: translateY(-50%) scale(1.2); } }' +
            '#__ump__ button:active { transform: scale(0.95); }' +
            '#__ump__ *::-webkit-scrollbar { width: 4px; }' +
            '#__ump__ *::-webkit-scrollbar-thumb { background: #4CAF50; border-radius: 2px; }';
        document.head.appendChild(style);
    }
    
    // ========== MENU (3 chấm) ==========
    function showMenu(streamInfo, video, hls) {
        var menu = document.createElement('div');
        menu.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:2147483648;display:flex;align-items:center;justify-content:center;padding:15px;';
        
        var html = '<div style="background:#fff;border-radius:12px;padding:15px;max-width:380px;width:100%;color:#333;max-height:90vh;overflow-y:auto;box-shadow:0 10px 40px rgba(0,0,0,0.5);">';
        html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">';
        html += '<h3 style="color:#4CAF50;margin:0;font-size:15px;">⚙️ Menu</h3>';
        html += '<button id="__ump_m_close__" style="background:#f44336;color:#fff;border:0;width:30px;height:30px;border-radius:50%;font-weight:bold;">✕</button>';
        html += '</div>';
        
        // Quality selector (nếu có nhiều levels)
        if (hls && hls.levels && hls.levels.length > 1) {
            var current = hls.currentLevel === -1 ? 'Auto' : hls.levels[hls.currentLevel].height + 'p';
            html += '<div style="background:#f5f5f5;padding:10px;border-radius:6px;margin-bottom:10px;">';
            html += '<div style="color:#666;font-size:11px;margin-bottom:6px;">🎞️ Chất lượng (hiện: <b style="color:#9C27B0;">' + current + '</b>)</div>';
            html += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(80px,1fr));gap:4px;">';
            html += '<button class="__ump_q__" data-level="-1" style="background:' + (hls.currentLevel === -1 ? '#9C27B0' : '#eee') + ';color:' + (hls.currentLevel === -1 ? '#fff' : '#333') + ';border:0;padding:8px;border-radius:4px;font-size:11px;font-weight:bold;">Auto</button>';
            var sorted = hls.levels.map(function(l, i) { return { level: l, idx: i }; }).sort(function(a, b) { return b.level.height - a.level.height; });
            sorted.forEach(function(item) {
                var active = hls.currentLevel === item.idx;
                html += '<button class="__ump_q__" data-level="' + item.idx + '" style="background:' + (active ? '#9C27B0' : '#eee') + ';color:' + (active ? '#fff' : '#333') + ';border:0;padding:8px;border-radius:4px;font-size:11px;font-weight:bold;">' + item.level.height + 'p</button>';
            });
            html += '</div>';
            html += '</div>';
        }
        
        // Speed
        html += '<div style="background:#f5f5f5;padding:10px;border-radius:6px;margin-bottom:10px;">';
        html += '<div style="color:#666;font-size:11px;margin-bottom:6px;">⚡ Tốc độ (hiện: <b style="color:#4CAF50;">' + video.playbackRate + 'x</b>)</div>';
        html += '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:4px;">';
        [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 4].forEach(function(s) {
            var active = video.playbackRate === s;
            html += '<button class="__ump_speed__" data-s="' + s + '" style="background:' + (active ? '#4CAF50' : '#eee') + ';color:' + (active ? '#fff' : '#333') + ';border:0;padding:8px;border-radius:4px;font-size:11px;font-weight:bold;">' + s + 'x</button>';
        });
        html += '</div>';
        html += '</div>';
        
        // Video actions
        html += '<div style="background:#f5f5f5;padding:10px;border-radius:6px;margin-bottom:10px;">';
        html += '<div style="color:#666;font-size:11px;margin-bottom:6px;">🎥 Video</div>';
        html += '<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:5px;">';
        html += '<button class="__ump_m__" data-a="mute" style="background:' + (video.muted ? '#f44336' : '#607D8B') + ';color:#fff;border:0;padding:10px;border-radius:5px;font-weight:bold;font-size:12px;">' + (video.muted ? '🔇 Unmute' : '🔊 Mute') + '</button>';
        html += '<button class="__ump_m__" data-a="volume" style="background:#607D8B;color:#fff;border:0;padding:10px;border-radius:5px;font-weight:bold;font-size:12px;">🔊 Volume+</button>';
        html += '<button class="__ump_m__" data-a="pip" style="background:#607D8B;color:#fff;border:0;padding:10px;border-radius:5px;font-weight:bold;font-size:12px;">📺 PiP</button>';
        html += '<button class="__ump_m__" data-a="rotate" style="background:#607D8B;color:#fff;border:0;padding:10px;border-radius:5px;font-weight:bold;font-size:12px;">🔄 Rotate</button>';
        html += '<button class="__ump_m__" data-a="loop" style="background:' + (video.loop ? '#4CAF50' : '#607D8B') + ';color:#fff;border:0;padding:10px;border-radius:5px;font-weight:bold;font-size:12px;">🔁 Loop ' + (video.loop ? 'ON' : 'OFF') + '</button>';
        html += '<button class="__ump_m__" data-a="screenshot" style="background:#607D8B;color:#fff;border:0;padding:10px;border-radius:5px;font-weight:bold;font-size:12px;">📸 Screenshot</button>';
        html += '</div>';
        html += '</div>';
        
        // Share & Download
        html += '<div style="background:#f5f5f5;padding:10px;border-radius:6px;margin-bottom:10px;">';
        html += '<div style="color:#666;font-size:11px;margin-bottom:6px;">📤 Share & Download</div>';
        html += '<div style="display:flex;flex-direction:column;gap:5px;">';
        html += '<button class="__ump_m__" data-a="share-url" style="background:#FF6B6B;color:#fff;border:0;padding:10px;border-radius:5px;font-weight:bold;text-align:left;font-size:12px;">📱 Share URL (YTDLnis...)</button>';
        html += '<button class="__ump_m__" data-a="copy-url" style="background:#607D8B;color:#fff;border:0;padding:10px;border-radius:5px;font-weight:bold;text-align:left;font-size:12px;">📋 Copy URL</button>';
        html += '<button class="__ump_m__" data-a="dl-cmd" style="background:#9C27B0;color:#fff;border:0;padding:10px;border-radius:5px;font-weight:bold;text-align:left;font-size:12px;">💻 Copy yt-dlp command</button>';
        html += '<button class="__ump_m__" data-a="dl-ffmpeg" style="background:#795548;color:#fff;border:0;padding:10px;border-radius:5px;font-weight:bold;text-align:left;font-size:12px;">🎬 Copy FFmpeg command</button>';
        html += '<button class="__ump_m__" data-a="open-new" style="background:#2196F3;color:#fff;border:0;padding:10px;border-radius:5px;font-weight:bold;text-align:left;font-size:12px;">🔗 Mở tab mới</button>';
        html += '</div>';
        html += '</div>';
        
        // Info
        html += '<div style="background:#f5f5f5;padding:10px;border-radius:6px;font-size:11px;color:#666;">';
        html += '📊 Type: <b>' + streamInfo.type + '</b><br>';
        html += '🌐 Host: <b>' + pageInfo.host + '</b><br>';
        html += '📝 <button id="__ump_rename__" style="background:none;border:0;color:#2196F3;text-decoration:underline;padding:0;font-size:11px;cursor:pointer;">Rename: ' + pageInfo.title + '</button>';
        html += '</div>';
        
        html += '</div>';
        
        menu.innerHTML = html;
        document.body.appendChild(menu);
        
        // Quality handlers
        menu.querySelectorAll('.__ump_q__').forEach(function(b) {
            b.onclick = function() {
                if (hls) {
                    hls.currentLevel = parseInt(this.dataset.level);
                    showToast('✓ Quality changed', '#9C27B0');
                }
                menu.remove();
            };
        });
        
        // Speed handlers
        menu.querySelectorAll('.__ump_speed__').forEach(function(b) {
            b.onclick = function() {
                video.playbackRate = parseFloat(this.dataset.s);
                showToast('⚡ Speed: ' + video.playbackRate + 'x', '#4CAF50');
                menu.remove();
            };
        });
        
        // Menu actions
        menu.querySelectorAll('.__ump_m__').forEach(function(b) {
            b.onclick = function() {
                var a = this.dataset.a, url = streamInfo.url;
                
                if (a === 'mute') { video.muted = !video.muted; showToast(video.muted ? '🔇 Muted' : '🔊 Unmuted', '#607D8B'); }
                else if (a === 'volume') {
                    var v = prompt('Volume 0-400%:', Math.round(video.volume * 100));
                    if (v !== null) {
                        var vol = parseFloat(v) / 100;
                        video.volume = Math.min(1, Math.max(0, vol));
                        if (vol > 1) boostVolume(vol);
                        showToast('🔊 Volume: ' + Math.round(vol * 100) + '%', '#607D8B');
                    }
                }
                else if (a === 'pip') {
                    if (document.pictureInPictureElement) document.exitPictureInPicture();
                    else if (video.requestPictureInPicture) video.requestPictureInPicture().catch(function(e) { showToast('❌ PiP: ' + e.message, '#f44336'); });
                }
                else if (a === 'rotate') {
                    rotateVideo(video);
                }
                else if (a === 'loop') {
                    video.loop = !video.loop;
                    showToast(video.loop ? '🔁 Loop ON' : '🔁 Loop OFF', '#4CAF50');
                }
                else if (a === 'screenshot') takeScreenshot(video);
                else if (a === 'share-url') shareUrl(url);
                else if (a === 'copy-url') { copy(url); showToast('✓ Copied URL', '#4CAF50'); }
                else if (a === 'dl-cmd') {
                    var cmd = 'yt-dlp --referer "' + pageInfo.referer + '" -f "best" --hls-use-mpegts --merge-output-format mp4 -o "' + pageInfo.title + '.%(ext)s" "' + url + '"';
                    copy(cmd); showToast('✓ yt-dlp copied', '#9C27B0');
                }
                else if (a === 'dl-ffmpeg') {
                    var cmd = 'ffmpeg -headers "Referer: ' + pageInfo.referer + '" -i "' + url + '" -c copy "' + pageInfo.title + '.mp4"';
                    copy(cmd); showToast('✓ FFmpeg copied', '#795548');
                }
                else if (a === 'open-new') window.open(url, '_blank');
                
                menu.remove();
            };
        });
        
        document.getElementById('__ump_rename__').onclick = function() {
            var n = prompt('Tên file mới:', pageInfo.title);
            if (n) pageInfo.title = n.replace(/[^\w\s\u00C0-\u1EF9.-]/g, '').substring(0, 100);
            menu.remove();
        };
        
        document.getElementById('__ump_m_close__').onclick = function() { menu.remove(); };
    }
    
    // ========== ROTATE VIDEO + CONTROLS ==========
    function rotateVideo(video) {
        var overlay = document.getElementById('__ump__');
        var container = document.getElementById('__ump_controls_container__');
        
        overlay.__rotation = ((overlay.__rotation || 0) + 90) % 360;
        var rot = overlay.__rotation;
        
        if (rot === 0) {
            // Reset
            video.style.transform = '';
            video.style.width = '100%';
            video.style.height = '100%';
            video.style.top = '0';
            video.style.left = '0';
            video.style.marginTop = '0';
            video.style.marginLeft = '0';
            container.style.transform = '';
        } else if (rot === 90 || rot === 270) {
            // Landscape rotated
            var vw = window.innerWidth;
            var vh = window.innerHeight;
            video.style.transform = 'rotate(' + rot + 'deg)';
            video.style.width = vh + 'px';
            video.style.height = vw + 'px';
            video.style.top = '50%';
            video.style.left = '50%';
            video.style.marginTop = (-vw / 2) + 'px';
            video.style.marginLeft = (-vh / 2) + 'px';
            // Controls xoay theo
            container.style.transform = 'rotate(' + rot + 'deg)';
            container.style.transformOrigin = 'center center';
            container.style.width = vh + 'px';
            container.style.height = vw + 'px';
            container.style.top = '50%';
            container.style.left = '50%';
            container.style.marginTop = (-vw / 2) + 'px';
            container.style.marginLeft = (-vh / 2) + 'px';
        } else {
            // 180
            video.style.transform = 'rotate(180deg)';
            video.style.width = '100%';
            video.style.height = '100%';
            container.style.transform = 'rotate(180deg)';
            container.style.width = '100%';
            container.style.height = '100%';
        }
        
        showToast('🔄 Rotated ' + rot + '°', '#607D8B');
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
        t.style.cssText = 'position:fixed;top:60px;left:50%;transform:translateX(-50%);background:' + (color || '#333') + ';color:#fff;padding:8px 15px;border-radius:15px;z-index:2147483649;font:bold 12px Arial;box-shadow:0 3px 12px rgba(0,0,0,0.5);';
        document.body.appendChild(t);
        setTimeout(function() { t.remove(); }, 2000);
    }
    
    function shareUrl(url) {
        if (navigator.share) {
            navigator.share({ title: pageInfo.title, url: url }).catch(function(err) {
                if (err.name !== 'AbortError') { copy(url); showToast('✓ Copied', '#FF6B6B'); }
            });
        } else {
            copy(url); showToast('✓ Copied - Mở YTDLnis', '#FF6B6B');
        }
    }
    
    function takeScreenshot(video) {
        try {
            var canvas = document.createElement('canvas');
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            canvas.getContext('2d').drawImage(video, 0, 0);
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
        } catch(e) {}
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
                    if (new URL(link.href).hostname !== pageInfo.host) {
                        e.preventDefault();
                        e.stopPropagation();
                        console.log('🚫 Blocked link:', link.href);
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
        if (window.__ump_iframe_observer__) {
            window.__ump_iframe_observer__.disconnect();
        }
        window.__ump_guard_active__ = false;
    }
    
    console.log('🎬 UMP V3 loaded');
})();