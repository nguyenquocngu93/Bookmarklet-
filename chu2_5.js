/**
 * Universal Video Downloader V2 - Glass Ultra
 * - Giao diện Glassmorphism tối giản, không icon thừa
 * - Video nổi trên nền web, không background đen cứng
 * - Fullscreen xoay ngang tự động
 * - Hiệu ứng chuyển động mượt, không gợn
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
            'yt-dlp-hq': { label: 'yt-dlp (chất lượng cao)', cmd: 'yt-dlp --referer "' + ref + '" -f "bv*+ba/best" --merge-output-format mp4 --embed-thumbnail --add-metadata -o "' + t + '.%(ext)s" "' + url + '"' },
            'ffmpeg': { label: 'FFmpeg', cmd: 'ffmpeg -headers "Referer: ' + ref + '\\r\\nOrigin: ' + origin + '\\r\\nUser-Agent: ' + ua + '" -i "' + url + '" -c copy -bsf:a aac_adtstoasc "' + t + '.mp4"' },
            'curl': { label: 'cURL', cmd: 'curl -H "Referer: ' + ref + '" -o "' + t + '.' + ext + '" "' + url + '"' },
            'aria2': { label: 'aria2c', cmd: 'aria2c --referer="' + ref + '" -x 16 -s 16 -o "' + t + '.' + ext + '" "' + url + '"' }
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
        el.style.cssText = 'position:fixed;bottom:40px;left:50%;transform:translateX(-50%);background:rgba(12,14,20,0.75);color:#fff;padding:14px 32px;border-radius:40px;z-index:2147483649;font:400 14px -apple-system,BlinkMacSystemFont,sans-serif;backdrop-filter:blur(16px);border:1px solid rgba(255,255,255,0.08);box-shadow:0 8px 40px rgba(0,0,0,0.3);animation:toastIn 0.4s ease;';
        document.body.appendChild(el);
        setTimeout(function() { el.remove(); }, 2200);
    }

    function shareUrl(url) {
        if (navigator.share) {
            navigator.share({ title: pageInfo.title, url: url }).catch(function() {});
        } else {
            copy(url);
            toast('Đã copy URL');
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
            toast('Đã xóa khỏi yêu thích');
        } else {
            data.favorites.unshift({ url: url, type: type, title: pageInfo.title, host: pageInfo.host, timestamp: Date.now() });
            toast('Đã thêm vào yêu thích');
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
        toast('Đã xuất ' + format.toUpperCase());
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
        playerEl.style.cssText = 'width:100%;height:100%;display:block;border-radius:20px;overflow:hidden;';
        var skin = document.createElement('video-skin');
        skin.style.cssText = 'width:100%;height:100%;display:block;';
        if (video.parentNode) video.parentNode.removeChild(video);
        skin.appendChild(video);
        playerEl.appendChild(skin);
        wrapper.appendChild(playerEl);
        return playerEl;
    }

    // ========== PREVIEW PLAYER - NỔI TRÊN NỀN WEB ==========
    function showPreview(url) {
        var panel = document.getElementById('__uvd__');
        if (panel) panel.style.opacity = '0.15';
        if (panel) panel.style.pointerEvents = 'none';

        // Overlay trong suốt - chỉ để bắt sự kiện đóng
        var overlay = document.createElement('div');
        overlay.id = '__uvd_player_overlay__';
        overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483648;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.15);backdrop-filter:blur(2px);animation:fadeIn 0.3s ease;';

        // Container video - nổi hoàn toàn, không nền đen
        var container = document.createElement('div');
        container.style.cssText = 'width:92%;max-width:920px;background:rgba(255,255,255,0.04);border-radius:28px;border:1px solid rgba(255,255,255,0.08);box-shadow:0 30px 80px rgba(0,0,0,0.15),0 0 0 1px rgba(255,255,255,0.03) inset;backdrop-filter:blur(40px);-webkit-backdrop-filter:blur(40px);overflow:hidden;display:flex;flex-direction:column;transition:all 0.3s ease;';

        // Header tối giản - chỉ text
        var header = document.createElement('div');
        header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:16px 24px;border-bottom:1px solid rgba(255,255,255,0.04);flex-shrink:0;';
        header.innerHTML =
            '<span style="color:rgba(255,255,255,0.9);font-weight:400;font-size:14px;letter-spacing:0.3px;">' + pageInfo.title + '</span>' +
            '<button id="closePlayerFloat" style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.06);color:rgba(255,255,255,0.5);padding:6px 16px;border-radius:40px;cursor:pointer;font-size:13px;font-weight:300;transition:0.2s;">đóng</button>';
        container.appendChild(header);

        // Video wrapper
        var videoWrapper = document.createElement('div');
        videoWrapper.style.cssText = 'padding:16px;background:transparent;display:flex;align-items:center;justify-content:center;';
        var videoContainer = document.createElement('div');
        videoContainer.style.cssText = 'width:100%;border-radius:20px;overflow:hidden;position:relative;background:rgba(0,0,0,0.2);';
        var video = document.createElement('video');
        video.id = 'uvdPlayerVideo';
        video.className = 'video-js vjs-default-skin';
        video.style.cssText = 'width:100%;height:100%;display:block;object-fit:contain;';
        video.setAttribute('playsinline', '');
        video.setAttribute('webkit-playsinline', '');
        video.setAttribute('crossorigin', 'anonymous');
        video.src = url;

        videoContainer.appendChild(video);
        videoWrapper.appendChild(videoContainer);
        container.appendChild(videoWrapper);

        // Footer tối giản
        var footer = document.createElement('div');
        footer.style.cssText = 'padding:12px 24px;border-top:1px solid rgba(255,255,255,0.04);display:flex;gap:16px;flex-wrap:wrap;flex-shrink:0;justify-content:center;';
        footer.innerHTML =
            '<button id="qualityFloatBtn" style="background:transparent;border:1px solid rgba(255,255,255,0.06);color:rgba(255,255,255,0.6);padding:6px 18px;border-radius:40px;font-size:12px;font-weight:300;cursor:pointer;transition:0.2s;">chất lượng</button>' +
            '<button id="fullscreenFloatBtn" style="background:transparent;border:1px solid rgba(255,255,255,0.06);color:rgba(255,255,255,0.6);padding:6px 18px;border-radius:40px;font-size:12px;font-weight:300;cursor:pointer;transition:0.2s;">toàn màn hình</button>' +
            '<span style="color:rgba(255,255,255,0.2);font-size:11px;font-weight:300;align-self:center;">vjs 10</span>';
        container.appendChild(footer);

        overlay.appendChild(container);
        document.body.appendChild(overlay);

        // Load Video.js v10
        loadVideoJSV10(function() {
            try {
                mountVideoJSV10(videoContainer, video);
            } catch(e) {
                video.controls = true;
                videoContainer.appendChild(video);
            }
        });

        // ===== SỰ KIỆN =====
        var closeBtn = document.getElementById('closePlayerFloat');
        closeBtn.onclick = function() {
            closePlayer();
        };

        document.addEventListener('keydown', function escHandler(e) {
            if (e.key === 'Escape') {
                closePlayer();
                document.removeEventListener('keydown', escHandler);
            }
        });

        // Chất lượng
        document.getElementById('qualityFloatBtn').onclick = function() {
            if (url.includes('.m3u8')) {
                showQualityFloatMenu(url, video);
            } else {
                toast('Chỉ hỗ trợ M3U8');
            }
        };

        // Fullscreen + XOAY NGANG
        document.getElementById('fullscreenFloatBtn').onclick = function() {
            var el = container;
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
        };

        // ===== ĐÓNG =====
        function closePlayer() {
            if (document.fullscreenElement) {
                document.exitFullscreen().catch(function(){});
            }
            overlay.remove();
            var p = document.getElementById('__uvd__');
            if (p) {
                p.style.opacity = '1';
                p.style.pointerEvents = '';
            }
            var player = videoContainer.querySelector('video-player');
            if (player) player.remove();
        }

        // ===== MENU CHẤT LƯỢNG =====
        function showQualityFloatMenu(url, video) {
            var menuOverlay = document.createElement('div');
            menuOverlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.2);backdrop-filter:blur(4px);z-index:2147483649;display:flex;align-items:center;justify-content:center;';
            var menuPanel = document.createElement('div');
            menuPanel.style.cssText = 'background:rgba(12,14,20,0.7);border-radius:24px;padding:24px;min-width:240px;max-width:90%;max-height:60vh;overflow-y:auto;border:1px solid rgba(255,255,255,0.06);backdrop-filter:blur(24px);';
            menuPanel.innerHTML = '<div style="color:rgba(255,255,255,0.4);text-align:center;padding:20px;">đang tải...</div>';
            menuOverlay.appendChild(menuPanel);
            document.body.appendChild(menuOverlay);

            parseM3U8Master(url, function(qualities) {
                if (!qualities || qualities.length === 0) {
                    menuPanel.innerHTML = '<div style="color:rgba(255,255,255,0.3);text-align:center;padding:20px;">không có chất lượng</div><button class="close-quality" style="background:transparent;border:1px solid rgba(255,255,255,0.06);color:rgba(255,255,255,0.5);padding:10px;border-radius:40px;width:100%;cursor:pointer;">đóng</button>';
                    menuPanel.querySelector('.close-quality').onclick = function() { menuOverlay.remove(); };
                    return;
                }
                var html = '<div style="color:rgba(255,255,255,0.5);font-weight:300;font-size:13px;margin-bottom:16px;letter-spacing:0.5px;">chất lượng</div>';
                qualities.forEach(function(q) {
                    html += '<div class="quality-item" data-url="' + encodeURIComponent(q.url) + '" style="padding:12px 16px;margin-bottom:6px;border-radius:40px;cursor:pointer;transition:0.15s;border:1px solid transparent;display:flex;justify-content:space-between;">';
                    html += '<span style="color:rgba(255,255,255,0.85);font-weight:300;">' + q.label + '</span>';
                    html += '<span style="color:rgba(255,255,255,0.3);font-size:12px;">' + Math.round(q.bandwidth/1000) + 'k</span>';
                    html += '</div>';
                });
                html += '<button class="close-quality" style="background:transparent;border:1px solid rgba(255,255,255,0.04);color:rgba(255,255,255,0.3);padding:10px;border-radius:40px;width:100%;cursor:pointer;font-weight:300;">đóng</button>';
                menuPanel.innerHTML = html;

                menuPanel.querySelectorAll('.quality-item').forEach(function(el) {
                    el.onmouseover = function() { this.style.borderColor = 'rgba(255,255,255,0.15)'; };
                    el.onmouseout = function() { this.style.borderColor = 'transparent'; };
                    el.onclick = function() {
                        var qUrl = decodeURIComponent(this.dataset.url);
                        video.src = qUrl;
                        video.load();
                        video.play().catch(function() {});
                        toast('đã chuyển chất lượng');
                        menuOverlay.remove();
                    };
                });
                menuPanel.querySelector('.close-quality').onclick = function() { menuOverlay.remove(); };
            });
        }
    }

    // ========== UI HELPER ==========
    function createOverlay() {
        var overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.2);backdrop-filter:blur(4px);z-index:2147483648;padding:20px;display:flex;flex-direction:column;overflow-y:auto;';
        document.body.appendChild(overlay);
        return overlay;
    }

    function showCommandPicker(url, type) {
        var cmds = makeCommands(url, type, pageInfo.title);
        var overlay = createOverlay();
        var html = '<div style="color:rgba(255,255,255,0.7);font-weight:300;font-size:16px;margin-bottom:16px;letter-spacing:0.5px;">lệnh tải</div>';
        Object.keys(cmds).forEach(function(k) {
            var c = cmds[k];
            html += '<div style="background:rgba(255,255,255,0.03);border-radius:16px;padding:16px;margin-bottom:10px;border:1px solid rgba(255,255,255,0.04);">';
            html += '<div style="color:rgba(255,255,255,0.5);font-weight:300;font-size:12px;margin-bottom:6px;">' + c.label + '</div>';
            html += '<div style="background:rgba(0,0,0,0.15);padding:10px;border-radius:12px;font-family:monospace;font-size:11px;color:rgba(255,255,255,0.4);word-break:break-all;margin-bottom:10px;">' + c.cmd + '</div>';
            html += '<button class="cmd-btn" data-cmd="' + encodeURIComponent(c.cmd) + '" style="background:transparent;border:1px solid rgba(255,255,255,0.06);color:rgba(255,255,255,0.5);padding:8px 16px;border-radius:40px;font-weight:300;cursor:pointer;width:100%;">chọn</button>';
            html += '</div>';
        });
        html += '<button id="closeCmd" style="background:transparent;border:1px solid rgba(255,255,255,0.04);color:rgba(255,255,255,0.2);padding:12px;border-radius:40px;font-weight:300;cursor:pointer;">đóng</button>';
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
            '<div style="color:rgba(255,255,255,0.5);font-weight:300;font-size:14px;margin-bottom:8px;">chỉnh sửa</div>' +
            '<textarea style="flex:1;background:rgba(0,0,0,0.15);color:rgba(255,255,255,0.7);border:1px solid rgba(255,255,255,0.04);border-radius:16px;padding:16px;font:13px monospace;resize:none;line-height:1.6;">' + text.replace(/</g, '&lt;') + '</textarea>' +
            '<div style="display:flex;gap:8px;margin-top:12px;">' +
                '<button id="edOk" style="flex:1;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.06);color:rgba(255,255,255,0.6);padding:12px;border-radius:40px;font-weight:300;cursor:pointer;">sao chép</button>' +
                '<button id="edShare" style="flex:1;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.06);color:rgba(255,255,255,0.6);padding:12px;border-radius:40px;font-weight:300;cursor:pointer;">chia sẻ</button>' +
                '<button id="edClose" style="flex:1;background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.04);color:rgba(255,255,255,0.2);padding:12px;border-radius:40px;font-weight:300;cursor:pointer;">hủy</button>' +
            '</div>';
        var ta = overlay.querySelector('textarea');
        ta.focus();
        document.getElementById('edOk').onclick = function() { copy(ta.value); overlay.remove(); toast('đã copy'); };
        document.getElementById('edShare').onclick = function() { shareUrl(ta.value); overlay.remove(); };
        document.getElementById('edClose').onclick = function() { overlay.remove(); };
    }

    function showQualityPicker(url) {
        var overlay = createOverlay();
        overlay.innerHTML = '<div style="text-align:center;color:rgba(255,255,255,0.3);padding:40px;">đang phân tích...</div>';
        parseM3U8Master(url, function(qualities) {
            if (!qualities) {
                overlay.innerHTML = '<div style="color:rgba(255,255,255,0.3);text-align:center;padding:20px;">không phải master playlist</div><button id="closeQ" style="background:transparent;border:1px solid rgba(255,255,255,0.04);color:rgba(255,255,255,0.2);padding:12px;border-radius:40px;width:100%;cursor:pointer;">đóng</button>';
                document.getElementById('closeQ').onclick = function() { overlay.remove(); };
                return;
            }
            var html = '<div style="color:rgba(255,255,255,0.5);font-weight:300;font-size:14px;margin-bottom:16px;">chất lượng (' + qualities.length + ')</div>';
            qualities.forEach(function(q) {
                html += '<div style="background:rgba(255,255,255,0.02);border-radius:16px;padding:14px;margin-bottom:8px;border:1px solid rgba(255,255,255,0.03);">';
                html += '<div style="display:flex;justify-content:space-between;"><span style="color:rgba(255,255,255,0.8);font-weight:300;">' + q.label + '</span><span style="color:rgba(255,255,255,0.3);font-size:12px;">' + Math.round(q.bandwidth/1000) + 'k</span></div>';
                html += '<div style="color:rgba(255,255,255,0.2);font-size:11px;margin:4px 0;">' + q.resolution + (q.codecs ? ' · ' + q.codecs : '') + '</div>';
                html += '<div style="display:flex;gap:6px;margin-top:8px;">';
                html += '<button class="qbtn" data-url="' + encodeURIComponent(q.url) + '" data-action="share" style="flex:1;background:transparent;border:1px solid rgba(255,255,255,0.04);color:rgba(255,255,255,0.4);padding:6px;border-radius:40px;font-size:11px;cursor:pointer;">chia sẻ</button>';
                html += '<button class="qbtn" data-url="' + encodeURIComponent(q.url) + '" data-action="play" style="flex:1;background:transparent;border:1px solid rgba(255,255,255,0.04);color:rgba(255,255,255,0.4);padding:6px;border-radius:40px;font-size:11px;cursor:pointer;">xem</button>';
                html += '<button class="qbtn" data-url="' + encodeURIComponent(q.url) + '" data-action="cmd" style="flex:1;background:transparent;border:1px solid rgba(255,255,255,0.04);color:rgba(255,255,255,0.4);padding:6px;border-radius:40px;font-size:11px;cursor:pointer;">lệnh</button>';
                html += '</div></div>';
            });
            html += '<button id="closeQ" style="background:transparent;border:1px solid rgba(255,255,255,0.03);color:rgba(255,255,255,0.15);padding:12px;border-radius:40px;width:100%;cursor:pointer;">đóng</button>';
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

    // ========== THEMES ==========
    var themes = {
        glass: {
            bg: 'rgba(12,14,20,0.55)',
            bg2: 'rgba(255,255,255,0.04)',
            bg3: 'rgba(255,255,255,0.06)',
            text: 'rgba(255,255,255,0.9)',
            text2: 'rgba(255,255,255,0.6)',
            text3: 'rgba(255,255,255,0.3)',
            primary: 'rgba(255,255,255,0.15)',
            accent: 'rgba(255,255,255,0.08)',
            danger: 'rgba(255,255,255,0.05)',
            glass: true
        },
        dark: {
            bg: 'rgba(20,20,26,0.85)',
            bg2: 'rgba(255,255,255,0.03)',
            bg3: 'rgba(255,255,255,0.05)',
            text: '#ffffff',
            text2: '#aaaaaa',
            text3: '#555555',
            primary: '#4CAF50',
            accent: '#2196F3',
            danger: '#f44336',
            glass: false
        }
    };

    function getTheme() { return themes[data.theme] || themes.glass; }

    // ========== BUILD UI ==========
    function buildUI() {
        var t = getTheme();
        var arr = [...urls.entries()].map(function(e) {
            return { url: e[0], type: e[1].type, source: e[1].source, priority: e[1].priority };
        }).sort(function(a, b) { return a.priority - b.priority; });

        var panel = document.getElementById('__uvd__');
        if (panel) panel.remove();

        panel = document.createElement('div');
        panel.id = '__uvd__';
        var glassStyle = 'backdrop-filter:blur(32px) saturate(120%);-webkit-backdrop-filter:blur(32px) saturate(120%);';
        panel.style.cssText = 'position:fixed;top:16px;left:16px;right:16px;bottom:16px;background:' + t.bg + ';color:' + t.text + ';padding:0;border-radius:32px;z-index:2147483647;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;font-size:13px;overflow:hidden;display:flex;flex-direction:column;box-shadow:0 30px 80px rgba(0,0,0,0.2);border:1px solid rgba(255,255,255,0.04);' + glassStyle;

        // Styles
        var style = document.createElement('style');
        style.textContent = `
            @keyframes uvdSlide{from{transform:translate(-50%,-20px);opacity:0}to{transform:translate(-50%,0);opacity:1}}
            @keyframes fadeIn{from{opacity:0}to{opacity:1}}
            @keyframes toastIn{from{opacity:0;transform:translateX(-50%) translateY(16px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}
            #__uvd__ * { box-sizing:border-box; }
            #__uvd__ ::-webkit-scrollbar{width:3px}
            #__uvd__ ::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.1);border-radius:10px}
            #__uvd__ ::-webkit-scrollbar-track{background:transparent}
            .uvd-btn-glass { background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.04); color:${t.text2}; transition:all 0.2s ease; cursor:pointer; }
            .uvd-btn-glass:hover { background:rgba(255,255,255,0.06); border-color:rgba(255,255,255,0.08); color:${t.text}; }
            .uvd-card { background:rgba(255,255,255,0.02); border-radius:16px; padding:14px; margin:8px 0; border:1px solid rgba(255,255,255,0.03); transition:all 0.2s ease; }
            .uvd-card:hover { background:rgba(255,255,255,0.04); border-color:rgba(255,255,255,0.06); }
            .uvd-tab { background:transparent; border:none; color:${t.text3}; padding:12px 16px; font-size:13px; font-weight:300; cursor:pointer; border-bottom:2px solid transparent; transition:all 0.3s ease; flex:1; text-align:center; letter-spacing:0.3px; }
            .uvd-tab-active { color:${t.text} !important; border-bottom-color:rgba(255,255,255,0.15) !important; }
            .uvd-tab:hover { color:${t.text2}; }
            .uvd-url { background:rgba(0,0,0,0.1); border-radius:12px; padding:10px; font-family:monospace; font-size:11px; color:${t.text3}; word-break:break-all; max-height:60px; overflow-y:auto; }
        `;
        panel.appendChild(style);

        // HEADER - TỐI GIẢN
        var header = document.createElement('div');
        header.style.cssText = 'padding:14px 20px;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid rgba(255,255,255,0.03);flex-shrink:0;';
        header.innerHTML =
            '<div style="font-size:15px;font-weight:300;letter-spacing:0.5px;color:' + t.text + ';">universal dl</div>' +
            '<div style="display:flex;gap:6px;font-size:12px;color:' + t.text3 + ';">' +
                '<span>' + arr.length + ' streams</span>' +
                '<span style="opacity:0.3;">·</span>' +
                '<span style="opacity:0.6;">' + pageInfo.host + '</span>' +
            '</div>';
        panel.appendChild(header);

        // TABS - TỐI GIẢN
        var tabContainer = document.createElement('div');
        tabContainer.style.cssText = 'display:flex;padding:0 16px;border-bottom:1px solid rgba(255,255,255,0.02);flex-shrink:0;';
        var tabs = [
            { id: 'streams', label: 'streams' },
            { id: 'favorites', label: 'yêu thích' },
            { id: 'history', label: 'lịch sử' },
            { id: 'settings', label: 'cài đặt' }
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
        content.style.cssText = 'flex:1;overflow-y:auto;padding:12px 16px;';
        panel.appendChild(content);

        // FOOTER - TỐI GIẢN
        var footer = document.createElement('div');
        footer.style.cssText = 'padding:10px 16px;border-top:1px solid rgba(255,255,255,0.02);display:flex;gap:6px;flex-wrap:wrap;flex-shrink:0;';
        ['txt','json','m3u','csv'].forEach(function(f) {
            var btn = document.createElement('button');
            btn.textContent = f;
            btn.style.cssText = 'background:transparent;border:none;color:' + t.text3 + ';padding:4px 10px;border-radius:20px;font-size:10px;font-weight:300;cursor:pointer;transition:0.2s;';
            btn.onmouseover = function() { this.style.color = t.text2; };
            btn.onmouseout = function() { this.style.color = t.text3; };
            btn.onclick = function() { exportData(f); };
            footer.appendChild(btn);
        });
        panel.appendChild(footer);

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

        // GLOBAL EVENTS
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape') {
                var p = document.getElementById('__uvd__');
                if (p) { p.style.display = 'none'; }
            }
        });
        var closeBtn = document.createElement('button');
        closeBtn.textContent = '✕';
        closeBtn.style.cssText = 'position:absolute;top:12px;right:12px;background:transparent;border:none;color:rgba(255,255,255,0.1);font-size:18px;cursor:pointer;z-index:10;';
        closeBtn.onclick = function() {
            stopMonitor();
            panel.remove();
        };
        header.appendChild(closeBtn);
    }

    // ===== RENDER FUNCTIONS =====
    function renderStreams(container, arr) {
        var t = getTheme();
        if (!arr.length) {
            container.innerHTML = '<div style="text-align:center;padding:40px 20px;color:' + t.text3 + ';font-weight:300;">chưa tìm thấy stream</div>';
            return;
        }
        arr.forEach(function(item, i) {
            var fav = isFavorite(item.url);
            var card = document.createElement('div');
            card.className = 'uvd-card';
            card.innerHTML =
                '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">' +
                    '<span style="font-size:11px;color:' + t.text3 + ';font-weight:300;">#' + (i + 1) + ' ' + item.type + '</span>' +
                    '<button class="__uvd_fav__" data-url="' + encodeURIComponent(item.url) + '" style="background:transparent;border:none;color:' + (fav ? t.text2 : t.text3) + ';font-size:16px;cursor:pointer;opacity:' + (fav ? '1' : '0.3') + ';">' + (fav ? '★' : '☆') + '</button>' +
                '</div>' +
                '<div class="uvd-url">' + item.url + '</div>' +
                '<div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:10px;">' +
                    '<button class="__uvd_act__ uvd-btn-glass" data-url="' + encodeURIComponent(item.url) + '" data-action="share" style="padding:4px 12px;border-radius:40px;font-size:11px;font-weight:300;">chia sẻ</button>' +
                    '<button class="__uvd_act__ uvd-btn-glass" data-url="' + encodeURIComponent(item.url) + '" data-action="copy" style="padding:4px 12px;border-radius:40px;font-size:11px;font-weight:300;">copy</button>' +
                    (item.type === 'IFRAME' ?
                        '<a href="' + item.url + '" target="_blank" class="uvd-btn-glass" style="padding:4px 12px;border-radius:40px;font-size:11px;font-weight:300;text-decoration:none;display:inline-block;">iframe</a>' :
                        (item.type === 'M3U8' ?
                            '<button class="__uvd_act__ uvd-btn-glass" data-url="' + encodeURIComponent(item.url) + '" data-action="quality" style="padding:4px 12px;border-radius:40px;font-size:11px;font-weight:300;">chất lượng</button>' +
                            '<button class="__uvd_act__ uvd-btn-glass" data-url="' + encodeURIComponent(item.url) + '" data-action="preview" style="padding:4px 12px;border-radius:40px;font-size:11px;font-weight:300;background:rgba(255,255,255,0.03);">xem</button>' :
                            '<button class="__uvd_act__ uvd-btn-glass" data-url="' + encodeURIComponent(item.url) + '" data-action="preview" style="padding:4px 12px;border-radius:40px;font-size:11px;font-weight:300;background:rgba(255,255,255,0.03);">xem</button>'
                        )
                    ) +
                    '<button class="__uvd_act__ uvd-btn-glass" data-url="' + encodeURIComponent(item.url) + '" data-action="cmd" data-type="' + item.type + '" style="padding:4px 12px;border-radius:40px;font-size:11px;font-weight:300;">lệnh</button>' +
                '</div>';
            container.appendChild(card);
        });

        container.querySelectorAll('.__uvd_fav__').forEach(function(b) {
            b.onclick = function() {
                var url = decodeURIComponent(this.dataset.url);
                var isFav = toggleFavorite(url, '');
                this.textContent = isFav ? '★' : '☆';
                this.style.opacity = isFav ? '1' : '0.3';
            };
        });
        container.querySelectorAll('.__uvd_act__').forEach(function(b) {
            b.onclick = function() {
                var url = decodeURIComponent(this.dataset.url);
                var action = this.dataset.action;
                var type = this.dataset.type || 'MP4';
                addToHistory(url, type);
                if (action === 'share') shareUrl(url);
                else if (action === 'copy') { copy(url); toast('đã copy'); }
                else if (action === 'quality') showQualityPicker(url);
                else if (action === 'preview') showPreview(url);
                else if (action === 'cmd') showCommandPicker(url, type);
            };
        });
    }

    function renderFavorites(container) {
        var t = getTheme();
        if (!data.favorites.length) {
            container.innerHTML = '<div style="text-align:center;padding:40px;color:' + t.text3 + ';font-weight:300;">chưa có yêu thích</div>';
            return;
        }
        data.favorites.forEach(function(fav, i) {
            var card = document.createElement('div');
            card.className = 'uvd-card';
            card.innerHTML =
                '<div style="display:flex;justify-content:space-between;margin-bottom:4px;">' +
                    '<span style="color:' + t.text3 + ';font-size:11px;font-weight:300;">' + fav.type + '</span>' +
                    '<span style="color:' + t.text3 + ';font-size:10px;">' + new Date(fav.timestamp).toLocaleDateString() + '</span>' +
                '</div>' +
                '<div style="font-weight:300;">' + fav.title + '</div>' +
                '<div style="color:' + t.text3 + ';font-size:11px;">' + fav.host + '</div>' +
                '<div class="uvd-url" style="max-height:40px;font-size:10px;">' + fav.url + '</div>' +
                '<div style="display:flex;gap:4px;margin-top:8px;">' +
                    '<button class="__uvd_fbtn__ uvd-btn-glass" data-url="' + encodeURIComponent(fav.url) + '" data-action="share" style="padding:4px 12px;border-radius:40px;font-size:11px;font-weight:300;">chia sẻ</button>' +
                    '<button class="__uvd_fbtn__ uvd-btn-glass" data-url="' + encodeURIComponent(fav.url) + '" data-action="copy" style="padding:4px 12px;border-radius:40px;font-size:11px;font-weight:300;">copy</button>' +
                    '<button class="__uvd_fbtn__ uvd-btn-glass" data-idx="' + i + '" data-action="del" style="padding:4px 12px;border-radius:40px;font-size:11px;font-weight:300;color:' + t.text3 + ';">xóa</button>' +
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
                    toast('đã xóa');
                } else {
                    var url = decodeURIComponent(this.dataset.url);
                    if (action === 'share') shareUrl(url);
                    else copy(url), toast('đã copy');
                }
            };
        });
    }

    function renderHistory(container) {
        var t = getTheme();
        var history = data.history || [];
        if (!history.length) {
            container.innerHTML = '<div style="text-align:center;padding:40px;color:' + t.text3 + ';font-weight:300;">chưa có lịch sử</div>';
            return;
        }
        var clearBtn = document.createElement('button');
        clearBtn.textContent = 'xóa tất cả';
        clearBtn.style.cssText = 'background:transparent;border:1px solid rgba(255,255,255,0.03);color:' + t.text3 + ';padding:6px 16px;border-radius:40px;font-size:11px;font-weight:300;cursor:pointer;margin-bottom:12px;';
        clearBtn.onclick = function() {
            if (confirm('Xóa toàn bộ lịch sử?')) {
                data.history = [];
                storage.set(data);
                renderHistory(container);
            }
        };
        container.appendChild(clearBtn);
        history.forEach(function(h) {
            var card = document.createElement('div');
            card.className = 'uvd-card';
            card.innerHTML =
                '<div style="display:flex;justify-content:space-between;font-size:11px;color:' + t.text3 + ';">' +
                    '<span>' + h.type + '</span>' +
                    '<span>' + new Date(h.timestamp).toLocaleString() + '</span>' +
                '</div>' +
                '<div style="font-weight:300;">' + h.title + '</div>' +
                '<div style="color:' + t.text3 + ';font-size:11px;">' + h.host + '</div>' +
                '<div class="uvd-url" style="max-height:40px;font-size:10px;">' + h.url + '</div>';
            container.appendChild(card);
        });
    }

    function renderSettings(container) {
        var t = getTheme();
        var html = '<div style="color:' + t.text + ';font-weight:300;font-size:15px;margin-bottom:16px;">cài đặt</div>';

        // Theme
        html += '<div class="uvd-card">';
        html += '<div style="color:' + t.text2 + ';font-weight:300;margin-bottom:10px;">giao diện</div>';
        html += '<div style="display:flex;gap:6px;flex-wrap:wrap;">';
        ['glass', 'dark'].forEach(function(th) {
            var active = data.theme === th;
            html += '<button class="__uvd_theme__ uvd-btn-glass" data-theme="' + th + '" style="padding:6px 16px;border-radius:40px;font-weight:300;background:' + (active ? 'rgba(255,255,255,0.04)' : 'transparent') + ';border-color:' + (active ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.03)') + ';color:' + (active ? t.text : t.text3) + ';">' + th + '</button>';
        });
        html += '</div></div>';

        // Info
        html += '<div class="uvd-card" style="font-size:12px;color:' + t.text3 + ';font-weight:300;">';
        html += '<div>version 2.0 · glass ultra</div>';
        html += '<div>favorites: ' + data.favorites.length + '</div>';
        html += '<div>history: ' + (data.history || []).length + '</div>';
        html += '<div style="margin-top:8px;opacity:0.3;">by nguyenquocngu93</div>';
        html += '</div>';

        container.innerHTML = html;

        container.querySelectorAll('.__uvd_theme__').forEach(function(b) {
            b.onclick = function() {
                data.theme = this.dataset.theme;
                storage.set(data);
                buildUI();
                toast('theme: ' + data.theme);
            };
        });
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

    console.log('✅ Universal DL V2 Glass Ultra loaded! Found', urls.size, 'streams.');
    toast('glass ultra ready');
})();