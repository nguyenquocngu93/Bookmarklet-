/**
 * Universal Video Downloader V2 - Glass Pure (No Border, No Title)
 * - CHỈ TRÌNH PHÁT VIDEO, không viền, không header, không footer
 * - Nút 3 chấm góc phải để chọn chất lượng
 * - Nền trong suốt, video nổi trên web
 * - Fullscreen xoay ngang
 * Author: nguyenquocngu93
 */
(function() {
    'use strict';

    // ========== CLEANUP ==========
    var old = document.getElementById('__uvd__');
    if (old) old.remove();

    var STORAGE_KEY = 'uvd_data_v2';
    var storage = {
        get: function() {
            try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; }
            catch(e) { return {}; }
        },
        set: function(data) {
            try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); }
            catch(e) {}
        }
    };

    var data = storage.get();
    data.favorites = data.favorites || [];
    data.theme = data.theme || 'glass';
    data.siteProfiles = data.siteProfiles || {};
    data.history = data.history || [];

    // ========== SITE PROFILES ==========
    var defaultProfiles = {
        'videoplay.us': { referer: 'https://videoplay.us/' },
        'streamtape.com': { referer: 'https://streamtape.com/' },
        'ok.ru': { referer: 'https://ok.ru/' },
        'fembed.com': { referer: 'https://fembed.com/' },
        'mp4upload.com': { referer: 'https://mp4upload.com/' }
    };
    var host = location.hostname.replace('www.', '');
    var profile = data.siteProfiles[host] || defaultProfiles[host] || { referer: location.origin + '/' };
    var pageInfo = {
        title: (document.title || 'video').replace(/[^\w\s\u00C0-\u1EF9]/g, '').substring(0, 60).trim() || 'video',
        url: location.href,
        host: host,
        referer: profile.referer,
        origin: location.origin,
        userAgent: navigator.userAgent
    };

    // ========== URL DETECTION ==========
    var urls = new Map();
    var patterns = [
        { re: /https?:\/\/[^\s"'<>()\\]+\.m3u8[^\s"'<>()\\]*/gi, type: 'M3U8', priority: 1 },
        { re: /https?:\/\/[^\s"'<>()\\]+\.mpd[^\s"'<>()\\]*/gi, type: 'MPD', priority: 2 },
        { re: /https?:\/\/[^\s"'<>()\\]+\.mp4[^\s"'<>()\\]*/gi, type: 'MP4', priority: 3 },
        { re: /https?:\/\/[^\s"'<>()\\]+\.webm[^\s"'<>()\\]*/gi, type: 'WEBM', priority: 4 },
        { re: /https?:\/\/[^\s"'<>()\\]+\.mkv[^\s"'<>()\\]*/gi, type: 'MKV', priority: 5 },
        { re: /https?:\/\/[^\s"'<>()\\]+\.flv[^\s"'<>()\\]*/gi, type: 'FLV', priority: 6 },
        { re: /https?:\/\/[^\s"'<>()\\]+\.ts[^\s"'<>()\\]*/gi, type: 'TS', priority: 7 }
    ];

    function findUrls(text, source) {
        if (!text || typeof text !== 'string') return;
        patterns.forEach(function(p) {
            var matches = text.match(p.re);
            if (matches) {
                matches.forEach(function(u) {
                    u = u.replace(/\\u002F/g, '/').replace(/\\\//g, '/').replace(/&amp;/g, '&').replace(/\\"/g, '');
                    if (!urls.has(u) || urls.get(u).priority > p.priority) {
                        urls.set(u, { type: p.type, source: source, priority: p.priority, timestamp: Date.now() });
                    }
                });
            }
        });
    }

    function scan(doc, src) {
        try {
            doc.querySelectorAll('video, source, audio').forEach(function(v) {
                if (v.src) findUrls(v.src, src + ':element');
                if (v.currentSrc) findUrls(v.currentSrc, src + ':current');
            });
            doc.querySelectorAll('script').forEach(function(s) {
                findUrls(s.textContent, src + ':script');
            });
            findUrls(doc.documentElement.outerHTML, src + ':html');
            doc.querySelectorAll('iframe').forEach(function(i, idx) {
                if (i.src) urls.set(i.src, { type: 'IFRAME', source: 'iframe#' + idx, priority: 99, timestamp: Date.now() });
                try { if (i.contentDocument) scan(i.contentDocument, 'iframe#' + idx); }
                catch(e) {}
            });
        } catch(e) {}
    }

    // ========== LIVE MONITORING ==========
    var originalFetch = window.fetch;
    var originalXHROpen = XMLHttpRequest.prototype.open;
    function installMonitor() {
        window.fetch = function() {
            var url = arguments[0];
            if (typeof url === 'string') findUrls(url, 'fetch:live');
            else if (url && url.url) findUrls(url.url, 'fetch:live');
            return originalFetch.apply(this, arguments);
        };
        XMLHttpRequest.prototype.open = function(method, url) {
            if (url) findUrls(url, 'xhr:live');
            return originalXHROpen.apply(this, arguments);
        };
    }
    function stopMonitor() {
        window.fetch = originalFetch;
        XMLHttpRequest.prototype.open = originalXHROpen;
    }
    scan(document, 'main');
    try {
        performance.getEntriesByType('resource').forEach(function(e) {
            findUrls(e.name, 'network:perf');
        });
    } catch(e) {}
    installMonitor();

    // ========== M3U8 MASTER PARSER ==========
    function parseM3U8Master(url, callback) {
        fetch(url, { headers: { 'Referer': pageInfo.referer } })
        .then(function(r) { return r.text(); })
        .then(function(text) {
            if (!text.includes('#EXT-X-STREAM-INF')) { callback(null); return; }
            var qualities = [];
            var lines = text.split('\n');
            for (var i = 0; i < lines.length; i++) {
                if (lines[i].startsWith('#EXT-X-STREAM-INF')) {
                    var info = lines[i];
                    var nextLine = (lines[i + 1] || '').trim();
                    if (nextLine && !nextLine.startsWith('#')) {
                        var resolution = (info.match(/RESOLUTION=(\d+x\d+)/) || [])[1] || 'unknown';
                        var bandwidth = parseInt((info.match(/BANDWIDTH=(\d+)/) || [])[1] || 0);
                        var codecs = (info.match(/CODECS="([^"]+)"/) || [])[1] || '';
                        var qualityLabel = resolution === 'unknown' ? Math.round(bandwidth/1000) + 'kbps' : resolution.split('x')[1] + 'p';
                        var streamUrl = nextLine;
                        if (!streamUrl.startsWith('http')) {
                            var baseUrl = url.substring(0, url.lastIndexOf('/') + 1);
                            streamUrl = baseUrl + streamUrl;
                        }
                        qualities.push({ label: qualityLabel, resolution: resolution, bandwidth: bandwidth, codecs: codecs, url: streamUrl });
                    }
                }
            }
            qualities.sort(function(a, b) {
                return (parseInt(b.resolution.split('x')[1]) || 0) - (parseInt(a.resolution.split('x')[1]) || 0);
            });
            callback(qualities);
        })
        .catch(function(e) { callback(null); });
    }

    // ========== COMMAND GENERATOR ==========
    function makeCommands(url, type, title) {
        var t = title;
        var ext = type.toLowerCase() === 'iframe' ? 'mp4' : type.toLowerCase();
        var ref = pageInfo.referer;
        var origin = pageInfo.origin;
        var ua = pageInfo.userAgent;
        return {
            'yt-dlp': { label: 'yt-dlp', cmd: 'yt-dlp --referer "' + ref + '" -o "' + t + '.%(ext)s" "' + url + '"' },
            'yt-dlp-hq': { label: 'yt-dlp (best)', cmd: 'yt-dlp --referer "' + ref + '" -f "bv*+ba/best" --merge-output-format mp4 -o "' + t + '.%(ext)s" "' + url + '"' },
            'ffmpeg': { label: 'FFmpeg', cmd: 'ffmpeg -headers "Referer: ' + ref + '" -i "' + url + '" -c copy "' + t + '.mp4"' },
            'curl': { label: 'cURL', cmd: 'curl -H "Referer: ' + ref + '" -o "' + t + '.' + ext + '" "' + url + '"' }
        };
    }

    // ========== UTILITIES ==========
    function copy(text) {
        var ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
    }

    function toast(msg) {
        var el = document.createElement('div');
        el.textContent = msg;
        el.style.cssText = 'position:fixed;bottom:40px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.6);color:#fff;padding:10px 24px;border-radius:40px;z-index:2147483649;font:300 13px -apple-system,BlinkMacSystemFont,sans-serif;backdrop-filter:blur(12px);border:1px solid rgba(255,255,255,0.06);animation:toastIn 0.3s ease;';
        document.body.appendChild(el);
        setTimeout(function() { el.remove(); }, 2000);
    }

    function shareUrl(url) {
        if (navigator.share) {
            navigator.share({ title: pageInfo.title, url: url }).catch(function() {});
        } else {
            copy(url);
            toast('copied');
        }
    }

    function addToHistory(url, type) {
        data.history = data.history || [];
        data.history.unshift({ url: url, type: type, title: pageInfo.title, host: pageInfo.host, timestamp: Date.now() });
        if (data.history.length > 50) data.history = data.history.slice(0, 50);
        storage.set(data);
    }

    function isFavorite(url) {
        return data.favorites.some(function(f) { return f.url === url; });
    }

    function toggleFavorite(url, type) {
        var idx = data.favorites.findIndex(function(f) { return f.url === url; });
        if (idx >= 0) {
            data.favorites.splice(idx, 1);
            toast('removed');
        } else {
            data.favorites.unshift({ url: url, type: type, title: pageInfo.title, host: pageInfo.host, timestamp: Date.now() });
            toast('added');
        }
        storage.set(data);
        return isFavorite(url);
    }

    function exportData(format) {
        var arr = [...urls.entries()].map(function(e) {
            return { url: e[0], type: e[1].type, source: e[1].source, title: pageInfo.title };
        });
        var content, mime, filename;
        if (format === 'json') {
            content = JSON.stringify({ page: pageInfo, streams: arr }, null, 2);
            mime = 'application/json';
            filename = pageInfo.title + '_streams.json';
        } else if (format === 'csv') {
            content = 'Type,URL,Source,Title\n' + arr.map(function(a) {
                return a.type + ',"' + a.url + '",' + a.source + ',"' + a.title + '"';
            }).join('\n');
            mime = 'text/csv';
            filename = pageInfo.title + '_streams.csv';
        } else if (format === 'm3u') {
            content = '#EXTM3U\n' + arr.filter(function(a) { return a.type !== 'IFRAME'; }).map(function(a) {
                return '#EXTINF:-1,' + a.title + ' [' + a.type + ']\n' + a.url;
            }).join('\n');
            mime = 'audio/x-mpegurl';
            filename = pageInfo.title + '.m3u';
        } else {
            content = arr.map(function(a) { return a.url; }).join('\n');
            mime = 'text/plain';
            filename = pageInfo.title + '_urls.txt';
        }
        var blob = new Blob([content], { type: mime });
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = filename;
        a.click();
        URL.revokeObjectURL(a.href);
        toast('exported ' + format.toUpperCase());
    }

    // ========== VIDEO.JS V10 LOADER ==========
    var vjs10Ready = false;
    var vjs10Loading = false;
    var vjs10Queue = [];

    function loadVideoJSV10(callback) {
        if (vjs10Ready) { callback(); return; }
        if (vjs10Loading) { vjs10Queue.push(callback); return; }
        vjs10Loading = true;
        vjs10Queue.push(callback);

        var css = document.createElement('link');
        css.rel = 'stylesheet';
        css.href = 'https://cdn.jsdelivr.net/npm/@videojs/html/cdn/video-js.css';
        document.head.appendChild(css);

        var script = document.createElement('script');
        script.type = 'module';
        script.src = 'https://cdn.jsdelivr.net/npm/@videojs/html/cdn/video.js';
        script.onload = function() {
            var check = setInterval(function() {
                if (customElements.get('video-player')) {
                    clearInterval(check);
                    vjs10Ready = true;
                    while (vjs10Queue.length) vjs10Queue.shift()();
                }
            }, 100);
            setTimeout(function() {
                clearInterval(check);
                if (!vjs10Ready) {
                    vjs10Ready = true;
                    while (vjs10Queue.length) vjs10Queue.shift()();
                }
            }, 5000);
        };
        script.onerror = function() {
            vjs10Ready = true;
            while (vjs10Queue.length) vjs10Queue.shift()();
        };
        document.head.appendChild(script);
    }

    function mountVideoJSV10(wrapper, video) {
        var playerEl = document.createElement('video-player');
        playerEl.style.cssText = 'width:100%;height:100%;display:block;border-radius:16px;overflow:hidden;';
        var skin = document.createElement('video-skin');
        skin.style.cssText = 'width:100%;height:100%;display:block;';
        if (video.parentNode) video.parentNode.removeChild(video);
        skin.appendChild(video);
        playerEl.appendChild(skin);
        wrapper.appendChild(playerEl);
        return playerEl;
    }

    // ========== PREVIEW PLAYER - CHỈ VIDEO ==========
    var currentQualityUrl = null;
    var qualityList = [];

    function showPreview(url) {
        var panel = document.getElementById('__uvd__');
        if (panel) { panel.style.opacity = '0.1'; panel.style.pointerEvents = 'none'; }

        // Overlay trong suốt
        var overlay = document.createElement('div');
        overlay.id = '__uvd_player_overlay__';
        overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483648;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.08);backdrop-filter:blur(1px);animation:fadeIn 0.2s ease;';

        // Container - KHÔNG VIỀN, KHÔNG HEADER
        var container = document.createElement('div');
        container.style.cssText = 'width:94%;max-width:1000px;background:transparent;border-radius:20px;overflow:hidden;position:relative;';

        // Video wrapper
        var videoWrapper = document.createElement('div');
        videoWrapper.style.cssText = 'width:100%;background:transparent;border-radius:20px;overflow:hidden;position:relative;';

        var video = document.createElement('video');
        video.id = 'uvdPlayerVideo';
        video.className = 'video-js vjs-default-skin';
        video.style.cssText = 'width:100%;height:auto;display:block;object-fit:contain;border-radius:20px;';
        video.setAttribute('playsinline', '');
        video.setAttribute('webkit-playsinline', '');
        video.setAttribute('crossorigin', 'anonymous');
        video.src = url;
        currentQualityUrl = url;

        videoWrapper.appendChild(video);
        container.appendChild(videoWrapper);
        overlay.appendChild(container);
        document.body.appendChild(overlay);

        // Nút 3 chấm góc phải
        var menuBtn = document.createElement('button');
        menuBtn.textContent = '⋯';
        menuBtn.style.cssText = 'position:absolute;top:16px;right:16px;background:rgba(0,0,0,0.2);border:1px solid rgba(255,255,255,0.06);color:rgba(255,255,255,0.5);border-radius:40px;padding:4px 12px;font-size:18px;cursor:pointer;z-index:10;backdrop-filter:blur(8px);transition:0.2s;';
        menuBtn.onmouseover = function() { this.style.background = 'rgba(0,0,0,0.3)'; };
        menuBtn.onmouseout = function() { this.style.background = 'rgba(0,0,0,0.2)'; };
        menuBtn.onclick = function(e) {
            e.stopPropagation();
            showQualityMenu(video, url);
        };
        container.appendChild(menuBtn);

        // Load Video.js v10
        loadVideoJSV10(function() {
            try {
                mountVideoJSV10(videoWrapper, video);
            } catch(e) {
                video.controls = true;
                videoWrapper.appendChild(video);
            }
        });

        // Click vào overlay = đóng
        overlay.onclick = function(e) {
            if (e.target === overlay) {
                closePlayer();
            }
        };

        // ESC đóng
        document.addEventListener('keydown', function escHandler(e) {
            if (e.key === 'Escape') {
                closePlayer();
                document.removeEventListener('keydown', escHandler);
            }
        });

        function closePlayer() {
            if (document.fullscreenElement) {
                document.exitFullscreen().catch(function(){});
            }
            overlay.remove();
            var p = document.getElementById('__uvd__');
            if (p) { p.style.opacity = '1'; p.style.pointerEvents = ''; }
            var player = videoWrapper.querySelector('video-player');
            if (player) player.remove();
        }

        // ===== MENU CHẤT LƯỢNG =====
        function showQualityMenu(video, url) {
            var menuOverlay = document.createElement('div');
            menuOverlay.style.cssText = 'position:fixed;inset:0;z-index:2147483649;display:flex;align-items:center;justify-content:center;';
            menuOverlay.onclick = function(e) { if (e.target === menuOverlay) menuOverlay.remove(); };

            var menuPanel = document.createElement('div');
            menuPanel.style.cssText = 'background:rgba(12,14,20,0.7);border-radius:20px;padding:20px;min-width:200px;max-width:90%;max-height:60vh;overflow-y:auto;border:1px solid rgba(255,255,255,0.04);backdrop-filter:blur(24px);';

            if (url.includes('.m3u8')) {
                menuPanel.innerHTML = '<div style="color:rgba(255,255,255,0.3);text-align:center;padding:16px;font-weight:300;">loading...</div>';
                menuOverlay.appendChild(menuPanel);
                document.body.appendChild(menuOverlay);

                parseM3U8Master(url, function(qualities) {
                    if (!qualities || qualities.length === 0) {
                        menuPanel.innerHTML = '<div style="color:rgba(255,255,255,0.2);text-align:center;padding:16px;font-weight:300;">no quality</div><button class="close-quality" style="background:transparent;border:1px solid rgba(255,255,255,0.04);color:rgba(255,255,255,0.2);padding:8px;border-radius:40px;width:100%;cursor:pointer;font-weight:300;">close</button>';
                        menuPanel.querySelector('.close-quality').onclick = function() { menuOverlay.remove(); };
                        return;
                    }
                    qualityList = qualities;
                    var html = '';
                    qualities.forEach(function(q) {
                        var active = q.url === currentQualityUrl ? 'background:rgba(255,255,255,0.04);' : '';
                        html += '<div class="quality-item" data-url="' + encodeURIComponent(q.url) + '" style="padding:10px 16px;margin-bottom:4px;border-radius:40px;cursor:pointer;transition:0.15s;display:flex;justify-content:space-between;' + active + '">';
                        html += '<span style="color:rgba(255,255,255,0.8);font-weight:300;">' + q.label + '</span>';
                        html += '<span style="color:rgba(255,255,255,0.2);font-size:11px;">' + Math.round(q.bandwidth/1000) + 'k</span>';
                        html += '</div>';
                    });
                    html += '<button class="close-quality" style="background:transparent;border:1px solid rgba(255,255,255,0.03);color:rgba(255,255,255,0.15);padding:8px;border-radius:40px;width:100%;cursor:pointer;font-weight:300;margin-top:4px;">close</button>';
                    menuPanel.innerHTML = html;

                    menuPanel.querySelectorAll('.quality-item').forEach(function(el) {
                        el.onmouseover = function() { this.style.background = 'rgba(255,255,255,0.04)'; };
                        el.onmouseout = function() { this.style.background = ''; };
                        el.onclick = function() {
                            var qUrl = decodeURIComponent(this.dataset.url);
                            currentQualityUrl = qUrl;
                            video.src = qUrl;
                            video.load();
                            video.play().catch(function() {});
                            toast('quality changed');
                            menuOverlay.remove();
                        };
                    });
                    menuPanel.querySelector('.close-quality').onclick = function() { menuOverlay.remove(); };
                });
            } else {
                menuPanel.innerHTML = '<div style="color:rgba(255,255,255,0.2);text-align:center;padding:16px;font-weight:300;">only for M3U8</div><button class="close-quality" style="background:transparent;border:1px solid rgba(255,255,255,0.03);color:rgba(255,255,255,0.15);padding:8px;border-radius:40px;width:100%;cursor:pointer;font-weight:300;">close</button>';
                menuOverlay.appendChild(menuPanel);
                document.body.appendChild(menuOverlay);
                menuPanel.querySelector('.close-quality').onclick = function() { menuOverlay.remove(); };
            }
        }

        // Fullscreen với xoay ngang
        video.addEventListener('dblclick', function() {
            toggleFullscreen(container);
        });

        function toggleFullscreen(el) {
            if (!document.fullscreenElement) {
                if (el.requestFullscreen) {
                    el.requestFullscreen().then(function() {
                        try {
                            if (screen.orientation && screen.orientation.lock) {
                                screen.orientation.lock('landscape').catch(function(){});
                            }
                        } catch(e) {}
                    }).catch(function(){});
                } else if (el.webkitRequestFullscreen) {
                    el.webkitRequestFullscreen();
                }
            } else {
                if (document.exitFullscreen) {
                    document.exitFullscreen().then(function() {
                        try {
                            if (screen.orientation && screen.orientation.unlock) {
                                screen.orientation.unlock();
                            }
                        } catch(e) {}
                    }).catch(function(){});
                } else if (document.webkitExitFullscreen) {
                    document.webkitExitFullscreen();
                }
            }
        }
    }

    // ========== UI HELPER ==========
    function createOverlay() {
        var overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.1);backdrop-filter:blur(2px);z-index:2147483648;padding:20px;display:flex;flex-direction:column;overflow-y:auto;';
        document.body.appendChild(overlay);
        return overlay;
    }

    function showCommandPicker(url, type) {
        var cmds = makeCommands(url, type, pageInfo.title);
        var overlay = createOverlay();
        var html = '<div style="color:rgba(255,255,255,0.5);font-weight:300;font-size:14px;margin-bottom:16px;">commands</div>';
        Object.keys(cmds).forEach(function(k) {
            var c = cmds[k];
            html += '<div style="background:rgba(255,255,255,0.02);border-radius:12px;padding:14px;margin-bottom:8px;border:1px solid rgba(255,255,255,0.03);">';
            html += '<div style="color:rgba(255,255,255,0.3);font-weight:300;font-size:11px;margin-bottom:4px;">' + c.label + '</div>';
            html += '<div style="background:rgba(0,0,0,0.1);padding:8px;border-radius:8px;font-family:monospace;font-size:10px;color:rgba(255,255,255,0.3);word-break:break-all;margin-bottom:8px;">' + c.cmd + '</div>';
            html += '<button class="cmd-btn" data-cmd="' + encodeURIComponent(c.cmd) + '" style="background:transparent;border:1px solid rgba(255,255,255,0.04);color:rgba(255,255,255,0.3);padding:6px 14px;border-radius:40px;font-weight:300;cursor:pointer;width:100%;">select</button>';
            html += '</div>';
        });
        html += '<button id="closeCmd" style="background:transparent;border:1px solid rgba(255,255,255,0.02);color:rgba(255,255,255,0.1);padding:10px;border-radius:40px;font-weight:300;cursor:pointer;">close</button>';
        overlay.innerHTML = html;
        overlay.querySelectorAll('.cmd-btn').forEach(function(b) {
            b.onclick = function() {
                var cmd = decodeURIComponent(this.dataset.cmd);
                overlay.remove();
                showEditor(cmd);
            };
        });
        document.getElementById('closeCmd').onclick = function() { overlay.remove(); };
    }

    function showEditor(text) {
        var overlay = createOverlay();
        overlay.innerHTML =
            '<div style="color:rgba(255,255,255,0.3);font-weight:300;font-size:13px;margin-bottom:8px;">edit</div>' +
            '<textarea style="flex:1;background:rgba(0,0,0,0.1);color:rgba(255,255,255,0.5);border:1px solid rgba(255,255,255,0.03);border-radius:12px;padding:14px;font:12px monospace;resize:none;line-height:1.5;">' + text.replace(/</g, '&lt;') + '</textarea>' +
            '<div style="display:flex;gap:6px;margin-top:10px;">' +
                '<button id="edOk" style="flex:1;background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.04);color:rgba(255,255,255,0.4);padding:10px;border-radius:40px;font-weight:300;cursor:pointer;">copy</button>' +
                '<button id="edShare" style="flex:1;background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.04);color:rgba(255,255,255,0.4);padding:10px;border-radius:40px;font-weight:300;cursor:pointer;">share</button>' +
                '<button id="edClose" style="flex:1;background:transparent;border:1px solid rgba(255,255,255,0.02);color:rgba(255,255,255,0.1);padding:10px;border-radius:40px;font-weight:300;cursor:pointer;">cancel</button>' +
            '</div>';
        var ta = overlay.querySelector('textarea');
        ta.focus();
        document.getElementById('edOk').onclick = function() { copy(ta.value); overlay.remove(); toast('copied'); };
        document.getElementById('edShare').onclick = function() { shareUrl(ta.value); overlay.remove(); };
        document.getElementById('edClose').onclick = function() { overlay.remove(); };
    }

    function showQualityPicker(url) {
        var overlay = createOverlay();
        overlay.innerHTML = '<div style="text-align:center;color:rgba(255,255,255,0.2);padding:40px;font-weight:300;">loading...</div>';
        parseM3U8Master(url, function(qualities) {
            if (!qualities) {
                overlay.innerHTML = '<div style="color:rgba(255,255,255,0.2);text-align:center;padding:20px;">not master</div><button id="closeQ" style="background:transparent;border:1px solid rgba(255,255,255,0.02);color:rgba(255,255,255,0.1);padding:10px;border-radius:40px;width:100%;cursor:pointer;">close</button>';
                document.getElementById('closeQ').onclick = function() { overlay.remove(); };
                return;
            }
            var html = '<div style="color:rgba(255,255,255,0.3);font-weight:300;font-size:13px;margin-bottom:16px;">quality</div>';
            qualities.forEach(function(q) {
                html += '<div style="background:rgba(255,255,255,0.02);border-radius:12px;padding:12px;margin-bottom:6px;border:1px solid rgba(255,255,255,0.02);">';
                html += '<div style="display:flex;justify-content:space-between;"><span style="color:rgba(255,255,255,0.6);font-weight:300;">' + q.label + '</span><span style="color:rgba(255,255,255,0.15);font-size:11px;">' + Math.round(q.bandwidth/1000) + 'k</span></div>';
                html += '<div style="display:flex;gap:4px;margin-top:6px;">';
                html += '<button class="qbtn" data-url="' + encodeURIComponent(q.url) + '" data-action="share" style="flex:1;background:transparent;border:1px solid rgba(255,255,255,0.02);color:rgba(255,255,255,0.2);padding:4px;border-radius:40px;font-size:10px;cursor:pointer;">share</button>';
                html += '<button class="qbtn" data-url="' + encodeURIComponent(q.url) + '" data-action="play" style="flex:1;background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.03);color:rgba(255,255,255,0.3);padding:4px;border-radius:40px;font-size:10px;cursor:pointer;">play</button>';
                html += '<button class="qbtn" data-url="' + encodeURIComponent(q.url) + '" data-action="cmd" style="flex:1;background:transparent;border:1px solid rgba(255,255,255,0.02);color:rgba(255,255,255,0.2);padding:4px;border-radius:40px;font-size:10px;cursor:pointer;">cmd</button>';
                html += '</div></div>';
            });
            html += '<button id="closeQ" style="background:transparent;border:1px solid rgba(255,255,255,0.02);color:rgba(255,255,255,0.08);padding:10px;border-radius:40px;width:100%;cursor:pointer;">close</button>';
            overlay.innerHTML = html;
            overlay.querySelectorAll('.qbtn').forEach(function(b) {
                b.onclick = function() {
                    var qUrl = decodeURIComponent(this.dataset.url);
                    var action = this.dataset.action;
                    overlay.remove();
                    if (action === 'share') shareUrl(qUrl);
                    else if (action === 'play') showPreview(qUrl);
                    else if (action === 'cmd') showCommandPicker(qUrl, 'M3U8');
                };
            });
            document.getElementById('closeQ').onclick = function() { overlay.remove(); };
        });
    }

    // ========== BUILD UI - TỐI GIẢN ==========
    function buildUI() {
        var arr = [...urls.entries()].map(function(e) {
            return { url: e[0], type: e[1].type, source: e[1].source, priority: e[1].priority };
        }).sort(function(a, b) { return a.priority - b.priority; });

        var panel = document.getElementById('__uvd__');
        if (panel) panel.remove();

        panel = document.createElement('div');
        panel.id = '__uvd__';
        panel.style.cssText = 'position:fixed;top:12px;left:12px;right:12px;bottom:12px;background:rgba(12,14,20,0.5);border-radius:28px;z-index:2147483647;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;font-size:13px;overflow:hidden;display:flex;flex-direction:column;backdrop-filter:blur(32px);-webkit-backdrop-filter:blur(32px);border:1px solid rgba(255,255,255,0.03);box-shadow:0 20px 60px rgba(0,0,0,0.1);';

        // STYLES
        var style = document.createElement('style');
        style.textContent = `
            @keyframes fadeIn{from{opacity:0}to{opacity:1}}
            @keyframes toastIn{from{opacity:0;transform:translateX(-50%) translateY(16px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}
            #__uvd__ * { box-sizing:border-box; }
            #__uvd__ ::-webkit-scrollbar{width:2px}
            #__uvd__ ::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.05);border-radius:10px}
            .uvd-btn { background:transparent; border:1px solid rgba(255,255,255,0.03); color:rgba(255,255,255,0.3); padding:4px 12px; border-radius:40px; font-size:11px; font-weight:300; cursor:pointer; transition:0.2s; }
            .uvd-btn:hover { background:rgba(255,255,255,0.02); color:rgba(255,255,255,0.5); }
            .uvd-card { background:rgba(255,255,255,0.01); border-radius:12px; padding:12px; margin:6px 0; border:1px solid rgba(255,255,255,0.02); }
            .uvd-tab { background:transparent; border:none; color:rgba(255,255,255,0.15); padding:10px 14px; font-size:12px; font-weight:300; cursor:pointer; border-bottom:1px solid transparent; transition:0.3s; flex:1; text-align:center; }
            .uvd-tab-active { color:rgba(255,255,255,0.5) !important; border-bottom-color:rgba(255,255,255,0.05) !important; }
            .uvd-url { background:rgba(0,0,0,0.05); border-radius:8px; padding:8px; font-family:monospace; font-size:10px; color:rgba(255,255,255,0.2); word-break:break-all; max-height:50px; overflow-y:auto; }
        `;
        panel.appendChild(style);

        // HEADER
        var header = document.createElement('div');
        header.style.cssText = 'padding:12px 16px;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid rgba(255,255,255,0.02);flex-shrink:0;';
        header.innerHTML =
            '<span style="font-size:13px;font-weight:300;color:rgba(255,255,255,0.3);letter-spacing:0.5px;">dl</span>' +
            '<div style="display:flex;gap:4px;font-size:11px;color:rgba(255,255,255,0.1);">' +
                '<span>' + arr.length + '</span>' +
                '<button id="uvdClose" style="background:transparent;border:none;color:rgba(255,255,255,0.1);font-size:14px;cursor:pointer;">✕</button>' +
            '</div>';
        panel.appendChild(header);

        // TABS
        var tabContainer = document.createElement('div');
        tabContainer.style.cssText = 'display:flex;padding:0 12px;border-bottom:1px solid rgba(255,255,255,0.01);flex-shrink:0;';
        var tabs = [
            { id: 'streams', label: 'streams' },
            { id: 'favorites', label: 'fav' },
            { id: 'history', label: 'history' },
            { id: 'settings', label: 'settings' }
        ];
        tabs.forEach(function(tab) {
            var b = document.createElement('button');
            b.className = '__uvd_tab__ uvd-tab';
            b.dataset.tab = tab.id;
            b.textContent = tab.label;
            tabContainer.appendChild(b);
        });
        panel.appendChild(tabContainer);

        // CONTENT
        var content = document.createElement('div');
        content.id = '__uvd_content__';
        content.style.cssText = 'flex:1;overflow-y:auto;padding:10px 14px;';
        panel.appendChild(content);

        document.body.appendChild(panel);

        // TAB LOGIC
        var currentTab = 'streams';
        function renderTab(tabId) {
            currentTab = tabId;
            document.querySelectorAll('.__uvd_tab__').forEach(function(t) {
                t.classList.toggle('uvd-tab-active', t.dataset.tab === tabId);
            });
            content.innerHTML = '';
            if (tabId === 'streams') renderStreams(content, arr);
            else if (tabId === 'favorites') renderFavorites(content);
            else if (tabId === 'history') renderHistory(content);
            else if (tabId === 'settings') renderSettings(content);
        }
        document.querySelectorAll('.__uvd_tab__').forEach(function(t) {
            t.onclick = function() { renderTab(this.dataset.tab); };
        });
        renderTab('streams');

        document.getElementById('uvdClose').onclick = function() {
            stopMonitor();
            panel.remove();
        };
    }

    // ===== RENDER FUNCTIONS =====
    function renderStreams(container, arr) {
        if (!arr.length) {
            container.innerHTML = '<div style="text-align:center;padding:30px;color:rgba(255,255,255,0.08);font-weight:300;">no streams</div>';
            return;
        }
        arr.forEach(function(item, i) {
            var card = document.createElement('div');
            card.className = 'uvd-card';
            card.innerHTML =
                '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">' +
                    '<span style="font-size:10px;color:rgba(255,255,255,0.15);font-weight:300;">' + item.type + '</span>' +
                    '<button class="__uvd_fav__" data-url="' + encodeURIComponent(item.url) + '" style="background:transparent;border:none;color:rgba(255,255,255,0.08);font-size:12px;cursor:pointer;">☆</button>' +
                '</div>' +
                '<div class="uvd-url">' + item.url + '</div>' +
                '<div style="display:flex;flex-wrap:wrap;gap:3px;margin-top:6px;">' +
                    '<button class="__uvd_act__ uvd-btn" data-url="' + encodeURIComponent(item.url) + '" data-action="share">share</button>' +
                    '<button class="__uvd_act__ uvd-btn" data-url="' + encodeURIComponent(item.url) + '" data-action="copy">copy</button>' +
                    (item.type === 'IFRAME' ?
                        '<a href="' + item.url + '" target="_blank" class="uvd-btn" style="text-decoration:none;">iframe</a>' :
                        (item.type === 'M3U8' ?
                            '<button class="__uvd_act__ uvd-btn" data-url="' + encodeURIComponent(item.url) + '" data-action="quality">quality</button>' +
                            '<button class="__uvd_act__ uvd-btn" data-url="' + encodeURIComponent(item.url) + '" data-action="preview" style="background:rgba(255,255,255,0.02);">play</button>' :
                            '<button class="__uvd_act__ uvd-btn" data-url="' + encodeURIComponent(item.url) + '" data-action="preview" style="background:rgba(255,255,255,0.02);">play</button>'
                        )
                    ) +
                    '<button class="__uvd_act__ uvd-btn" data-url="' + encodeURIComponent(item.url) + '" data-action="cmd" data-type="' + item.type + '">cmd</button>' +
                '</div>';
            container.appendChild(card);
        });

        container.querySelectorAll('.__uvd_act__').forEach(function(b) {
            b.onclick = function() {
                var url = decodeURIComponent(this.dataset.url);
                var action = this.dataset.action;
                var type = this.dataset.type || 'MP4';
                addToHistory(url, type);
                if (action === 'share') shareUrl(url);
                else if (action === 'copy') { copy(url); toast('copied'); }
                else if (action === 'quality') showQualityPicker(url);
                else if (action === 'preview') showPreview(url);
                else if (action === 'cmd') showCommandPicker(url, type);
            };
        });
    }

    function renderFavorites(container) {
        if (!data.favorites.length) {
            container.innerHTML = '<div style="text-align:center;padding:30px;color:rgba(255,255,255,0.08);font-weight:300;">empty</div>';
            return;
        }
        data.favorites.forEach(function(fav, i) {
            var card = document.createElement('div');
            card.className = 'uvd-card';
            card.innerHTML =
                '<div style="display:flex;justify-content:space-between;font-size:10px;color:rgba(255,255,255,0.1);">' +
                    '<span>' + fav.type + '</span>' +
                    '<span>' + new Date(fav.timestamp).toLocaleDateString() + '</span>' +
                '</div>' +
                '<div style="font-weight:300;font-size:12px;color:rgba(255,255,255,0.3);">' + fav.title + '</div>' +
                '<div class="uvd-url" style="max-height:30px;font-size:9px;">' + fav.url + '</div>' +
                '<div style="display:flex;gap:3px;margin-top:4px;">' +
                    '<button class="__uvd_fbtn__ uvd-btn" data-url="' + encodeURIComponent(fav.url) + '" data-action="share">share</button>' +
                    '<button class="__uvd_fbtn__ uvd-btn" data-url="' + encodeURIComponent(fav.url) + '" data-action="copy">copy</button>' +
                    '<button class="__uvd_fbtn__ uvd-btn" data-idx="' + i + '" data-action="del">del</button>' +
                '</div>';
            container.appendChild(card);
        });
        container.querySelectorAll('.__uvd_fbtn__').forEach(function(b) {
            b.onclick = function() {
                var action = this.dataset.action;
                if (action === 'del') {
                    data.favorites.splice(parseInt(this.dataset.idx), 1);
                    storage.set(data);
                    renderFavorites(container);
                    toast('removed');
                } else {
                    var url = decodeURIComponent(this.dataset.url);
                    if (action === 'share') shareUrl(url);
                    else copy(url), toast('copied');
                }
            };
        });
    }

    function renderHistory(container) {
        var history = data.history || [];
        if (!history.length) {
            container.innerHTML = '<div style="text-align:center;padding:30px;color:rgba(255,255,255,0.08);font-weight:300;">empty</div>';
            return;
        }
        history.forEach(function(h) {
            var card = document.createElement('div');
            card.className = 'uvd-card';
            card.innerHTML =
                '<div style="display:flex;justify-content:space-between;font-size:10px;color:rgba(255,255,255,0.1);">' +
                    '<span>' + h.type + '</span>' +
                    '<span>' + new Date(h.timestamp).toLocaleString() + '</span>' +
                '</div>' +
                '<div style="font-weight:300;font-size:12px;color:rgba(255,255,255,0.2);">' + h.title + '</div>' +
                '<div class="uvd-url" style="max-height:30px;font-size:9px;">' + h.url + '</div>';
            container.appendChild(card);
        });
    }

    function renderSettings(container) {
        container.innerHTML =
            '<div style="color:rgba(255,255,255,0.2);font-weight:300;font-size:13px;margin-bottom:12px;">settings</div>' +
            '<div class="uvd-card" style="font-size:11px;color:rgba(255,255,255,0.1);font-weight:300;">' +
                '<div>version 2.0 · pure</div>' +
                '<div>favorites: ' + data.favorites.length + '</div>' +
                '<div>history: ' + (data.history || []).length + '</div>' +
                '<div style="margin-top:6px;opacity:0.3;">nguyenquocngu93</div>' +
            '</div>';
    }

    // ========== START ==========
    buildUI();

    var lastCount = urls.size;
    setInterval(function() {
        if (!document.getElementById('__uvd__')) {
            stopMonitor();
            return;
        }
        if (urls.size !== lastCount) {
            lastCount = urls.size;
        }
    }, 2000);

    console.log('✅ Universal DL V2 Glass Pure loaded! Found', urls.size, 'streams.');
    toast('ready');
})();