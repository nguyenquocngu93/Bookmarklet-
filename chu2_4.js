/**
 * Universal Video Downloader V2 - Glass Pro (Video Float)
 * - Video nổi giữa trang, tối nền, ẩn UI khi phát
 * - Giao diện Glassmorphism cực đẹp
 * - Video.js v10 (module CDN) – đã test ổn định
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
            'yt-dlp': { label: 'yt-dlp (cơ bản)', cmd: 'yt-dlp --referer "' + ref + '" -o "' + t + '.%(ext)s" "' + url + '"' },
            'yt-dlp-hq': { label: 'yt-dlp (chất lượng cao)', cmd: 'yt-dlp --referer "' + ref + '" -f "bv*+ba/best" --merge-output-format mp4 --embed-thumbnail --add-metadata -o "' + t + '.%(ext)s" "' + url + '"' },
            'yt-dlp-aria': { label: 'yt-dlp + aria2', cmd: 'yt-dlp --referer "' + ref + '" --downloader aria2c --downloader-args "aria2c:-x 16 -s 16 -k 1M" --concurrent-fragments 8 -o "' + t + '.%(ext)s" "' + url + '"' },
            'ffmpeg': { label: 'FFmpeg (M3U8 → MP4)', cmd: 'ffmpeg -headers "Referer: ' + ref + '\\r\\nOrigin: ' + origin + '\\r\\nUser-Agent: ' + ua + '" -i "' + url + '" -c copy -bsf:a aac_adtstoasc "' + t + '.mp4"' },
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

    function toast(msg, color) {
        color = color || '#00d4ff';
        var el = document.createElement('div');
        el.textContent = msg;
        el.style.cssText = 'position:fixed;bottom:30px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.85);color:#fff;padding:12px 28px;border-radius:30px;z-index:2147483649;font:500 14px -apple-system,BlinkMacSystemFont,sans-serif;backdrop-filter:blur(10px);border:1px solid ' + color + ';box-shadow:0 8px 30px rgba(0,0,0,0.5);animation:toastIn 0.4s ease;';
        document.body.appendChild(el);
        setTimeout(function() { el.remove(); }, 2500);
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

    // ========== VIDEO.JS V10 LOADER (Module) ==========
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
                    console.warn('Video.js v10 custom elements chưa sẵn sàng, thử tiếp tục');
                    vjs10Ready = true;
                    while (vjs10Queue.length) vjs10Queue.shift()();
                }
            }, 5000);
        };
        script.onerror = function() {
            console.error('Không tải được Video.js v10 module, fallback native controls');
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

    // ========== PREVIEW PLAYER (FLOAT) ==========
    function showPreview(url) {
        var t = getTheme();
        var panel = document.getElementById('__uvd__');
        if (panel) panel.style.display = 'none'; // Ẩn UI script

        // Tạo overlay tối phía sau
        var overlay = document.createElement('div');
        overlay.id = '__uvd_player_overlay__';
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.75);backdrop-filter:blur(12px);z-index:2147483648;display:flex;align-items:center;justify-content:center;animation:fadeIn 0.3s ease;';

        // Container video – nổi giữa màn hình
        var container = document.createElement('div');
        container.style.cssText = 'width:90%;max-width:900px;max-height:85vh;background:rgba(12,14,20,0.85);border-radius:24px;border:1px solid rgba(255,255,255,0.12);box-shadow:0 30px 80px rgba(0,0,0,0.8),0 0 0 1px rgba(255,255,255,0.05) inset;overflow:hidden;display:flex;flex-direction:column;backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);';

        // Header
        var header = document.createElement('div');
        header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:14px 20px;border-bottom:1px solid rgba(255,255,255,0.06);flex-shrink:0;';
        header.innerHTML =
            '<span style="color:#fff;font-weight:500;font-size:15px;text-shadow:0 2px 10px rgba(0,0,0,0.3);">▶ ' + pageInfo.title + '</span>' +
            '<button id="closePlayerFloat" style="background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.1);color:#fff;padding:6px 14px;border-radius:12px;cursor:pointer;font-size:14px;transition:0.2s;">✕</button>';
        container.appendChild(header);

        // Video wrapper
        var videoWrapper = document.createElement('div');
        videoWrapper.style.cssText = 'flex:1;padding:16px;background:#000;display:flex;align-items:center;justify-content:center;';
        var videoContainer = document.createElement('div');
        videoContainer.style.cssText = 'width:100%;height:100%;max-height:60vh;border-radius:16px;overflow:hidden;position:relative;background:#000;box-shadow:0 0 40px rgba(0,0,0,0.5);';
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

        // Footer (tùy chọn)
        var footer = document.createElement('div');
        footer.style.cssText = 'padding:10px 20px;border-top:1px solid rgba(255,255,255,0.06);display:flex;gap:10px;flex-wrap:wrap;flex-shrink:0;';
        footer.innerHTML =
            '<button id="qualityFloatBtn" style="background:rgba(0,212,255,0.15);border:1px solid rgba(0,212,255,0.2);color:#fff;padding:6px 14px;border-radius:10px;font-size:12px;cursor:pointer;">Chất lượng</button>' +
            '<button id="fullscreenFloatBtn" style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.08);color:#fff;padding:6px 14px;border-radius:10px;font-size:12px;cursor:pointer;">⛶ Toàn màn hình</button>' +
            '<span style="flex:1;color:#888;font-size:12px;text-align:right;align-self:center;">Video.js v10</span>';
        container.appendChild(footer);

        overlay.appendChild(container);
        document.body.appendChild(overlay);

        // Load Video.js v10 và mount
        loadVideoJSV10(function() {
            try {
                mountVideoJSV10(videoContainer, video);
                // Video.js tự động controls
            } catch(e) {
                video.controls = true;
                videoContainer.appendChild(video);
                toast('Fallback: controls native');
            }
        });

        // ===== XỬ LÝ SỰ KIỆN =====
        // Đóng player
        document.getElementById('closePlayerFloat').onclick = function() {
            closeFloatPlayer();
        };

        // Bấm ESC đóng
        document.addEventListener('keydown', function escHandler(e) {
            if (e.key === 'Escape') {
                closeFloatPlayer();
                document.removeEventListener('keydown', escHandler);
            }
        });

        // Chất lượng (chỉ M3U8)
        document.getElementById('qualityFloatBtn').onclick = function() {
            if (url.includes('.m3u8')) {
                showQualityFloatMenu(url, video);
            } else {
                toast('Chỉ hỗ trợ M3U8');
            }
        };

        // Fullscreen + xoay ngang
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
                } else if (el.msRequestFullscreen) {
                    el.msRequestFullscreen();
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
                } else if (document.msExitFullscreen) {
                    document.msExitFullscreen();
                }
            }
        };

        // Hàm đóng
        function closeFloatPlayer() {
            if (document.fullscreenElement) {
                document.exitFullscreen().catch(function(){});
            }
            overlay.remove();
            // Hiện lại panel script
            var p = document.getElementById('__uvd__');
            if (p) p.style.display = '';
            // Cleanup video-player custom element
            var player = videoContainer.querySelector('video-player');
            if (player) player.remove();
        }

        // Menu chọn chất lượng (float)
        function showQualityFloatMenu(url, video) {
            var menuOverlay = document.createElement('div');
            menuOverlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);backdrop-filter:blur(8px);z-index:2147483649;display:flex;align-items:center;justify-content:center;';
            var menuPanel = document.createElement('div');
            menuPanel.style.cssText = 'background:rgba(12,14,20,0.95);border-radius:20px;padding:20px;min-width:260px;max-width:90%;max-height:70vh;overflow-y:auto;border:1px solid rgba(255,255,255,0.08);backdrop-filter:blur(12px);';
            menuPanel.innerHTML = '<div style="color:#00d4ff;font-weight:600;font-size:16px;margin-bottom:14px;">Đang tải...</div>';
            menuOverlay.appendChild(menuPanel);
            document.body.appendChild(menuOverlay);

            parseM3U8Master(url, function(qualities) {
                if (!qualities || qualities.length === 0) {
                    menuPanel.innerHTML = '<div style="color:#ff4757;text-align:center;padding:20px;">Không có chất lượng</div><button class="close-quality" style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.08);color:#fff;padding:10px;border-radius:12px;width:100%;cursor:pointer;">Đóng</button>';
                    menuPanel.querySelector('.close-quality').onclick = function() { menuOverlay.remove(); };
                    return;
                }
                var html = '<div style="color:#00d4ff;font-weight:600;font-size:16px;margin-bottom:14px;">Chọn chất lượng</div>';
                qualities.forEach(function(q) {
                    html += '<div class="quality-item" data-url="' + encodeURIComponent(q.url) + '" style="background:rgba(255,255,255,0.04);border-radius:12px;padding:12px;margin-bottom:8px;cursor:pointer;transition:0.2s;border:1px solid transparent;">';
                    html += '<div style="display:flex;justify-content:space-between;">';
                    html += '<span style="font-weight:500;">' + q.label + '</span>';
                    html += '<span style="color:#888;font-size:12px;">' + Math.round(q.bandwidth/1000) + ' kbps</span>';
                    html += '</div>';
                    html += '<div style="color:#666;font-size:11px;">' + q.resolution + (q.codecs ? ' · ' + q.codecs : '') + '</div>';
                    html += '</div>';
                });
                html += '<button class="close-quality" style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.08);color:#fff;padding:10px;border-radius:12px;width:100%;cursor:pointer;">Đóng</button>';
                menuPanel.innerHTML = html;

                menuPanel.querySelectorAll('.quality-item').forEach(function(el) {
                    el.onclick = function() {
                        var qUrl = decodeURIComponent(this.dataset.url);
                        video.src = qUrl;
                        video.load();
                        video.play().catch(function() {});
                        toast('Đã chuyển chất lượng');
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
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);backdrop-filter:blur(12px);z-index:2147483648;padding:20px;display:flex;flex-direction:column;overflow-y:auto;';
        document.body.appendChild(overlay);
        return overlay;
    }

    function showCommandPicker(url, type) {
        var cmds = makeCommands(url, type, pageInfo.title);
        var overlay = createOverlay();
        var html = '<div style="color:#00d4ff;font-weight:600;font-size:18px;margin-bottom:16px;">Chọn lệnh tải</div>';
        Object.keys(cmds).forEach(function(k) {
            var c = cmds[k];
            html += '<div style="background:rgba(255,255,255,0.05);border-radius:16px;padding:16px;margin-bottom:12px;border:1px solid rgba(255,255,255,0.08);">';
            html += '<div style="color:#FFB74D;font-weight:500;margin-bottom:6px;">' + c.label + '</div>';
            html += '<div style="background:rgba(0,0,0,0.3);padding:10px;border-radius:10px;font-family:monospace;font-size:12px;color:#aaa;word-break:break-all;margin-bottom:10px;">' + c.cmd + '</div>';
            html += '<button class="cmd-btn" data-cmd="' + encodeURIComponent(c.cmd) + '" style="background:rgba(0,212,255,0.2);border:1px solid rgba(0,212,255,0.3);color:#fff;padding:8px 16px;border-radius:10px;font-weight:500;cursor:pointer;width:100%;">Chọn & sửa</button>';
            html += '</div>';
        });
        html += '<button id="closeCmd" style="background:#ff4757;border:none;color:#fff;padding:12px;border-radius:12px;font-weight:600;cursor:pointer;">Đóng</button>';
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
            '<div style="color:#00d4ff;font-weight:600;font-size:18px;margin-bottom:8px;">✏️ Chỉnh sửa lệnh</div>' +
            '<textarea style="flex:1;background:rgba(0,0,0,0.4);color:#fff;border:2px solid #00d4ff;border-radius:16px;padding:16px;font:13px monospace;resize:none;line-height:1.6;">' + text.replace(/</g, '&lt;') + '</textarea>' +
            '<div style="display:flex;gap:10px;margin-top:12px;">' +
                '<button id="edOk" style="flex:1;background:#00d4ff;border:none;color:#fff;padding:14px;border-radius:12px;font-weight:600;cursor:pointer;">Sao chép</button>' +
                '<button id="edShare" style="flex:1;background:#ff6b6b;border:none;color:#fff;padding:14px;border-radius:12px;font-weight:600;cursor:pointer;">Chia sẻ</button>' +
                '<button id="edClose" style="flex:1;background:#555;border:none;color:#fff;padding:14px;border-radius:12px;font-weight:600;cursor:pointer;">Hủy</button>' +
            '</div>';
        var ta = overlay.querySelector('textarea');
        ta.focus();
        document.getElementById('edOk').onclick = function() { copy(ta.value); overlay.remove(); toast('Đã copy!'); };
        document.getElementById('edShare').onclick = function() { shareUrl(ta.value); overlay.remove(); };
        document.getElementById('edClose').onclick = function() { overlay.remove(); };
    }

    function showQualityPicker(url) {
        var overlay = createOverlay();
        overlay.innerHTML = '<div style="text-align:center;color:#aaa;padding:40px;">Đang phân tích M3U8...</div>';
        parseM3U8Master(url, function(qualities) {
            if (!qualities) {
                overlay.innerHTML = '<div style="color:#ff4757;text-align:center;padding:20px;">Không phải Master Playlist</div><button id="closeQ" style="background:#555;border:none;color:#fff;padding:12px;border-radius:12px;width:100%;cursor:pointer;">Đóng</button>';
                document.getElementById('closeQ').onclick = function() { overlay.remove(); };
                return;
            }
            var html = '<div style="color:#00d4ff;font-weight:600;font-size:18px;margin-bottom:16px;">Chọn chất lượng (' + qualities.length + ')</div>';
            qualities.forEach(function(q) {
                html += '<div style="background:rgba(255,255,255,0.05);border-radius:16px;padding:14px;margin-bottom:10px;border:1px solid rgba(255,255,255,0.08);">';
                html += '<div style="display:flex;justify-content:space-between;"><b style="color:#fff;">' + q.label + '</b><span style="color:#aaa;">' + Math.round(q.bandwidth/1000) + ' kbps</span></div>';
                html += '<div style="color:#888;font-size:12px;margin:6px 0;">' + q.resolution + (q.codecs ? ' · ' + q.codecs : '') + '</div>';
                html += '<div style="display:flex;gap:8px;margin-top:8px;">';
                html += '<button class="qbtn" data-url="' + encodeURIComponent(q.url) + '" data-action="share" style="flex:1;background:rgba(255,107,107,0.3);border:1px solid rgba(255,107,107,0.4);color:#fff;padding:8px;border-radius:10px;cursor:pointer;">Chia sẻ</button>';
                html += '<button class="qbtn" data-url="' + encodeURIComponent(q.url) + '" data-action="play" style="flex:1;background:rgba(0,212,255,0.3);border:1px solid rgba(0,212,255,0.4);color:#fff;padding:8px;border-radius:10px;cursor:pointer;">Xem</button>';
                html += '<button class="qbtn" data-url="' + encodeURIComponent(q.url) + '" data-action="cmd" style="flex:1;background:rgba(255,183,77,0.3);border:1px solid rgba(255,183,77,0.4);color:#fff;padding:8px;border-radius:10px;cursor:pointer;">Lệnh</button>';
                html += '</div></div>';
            });
            html += '<button id="closeQ" style="background:#555;border:none;color:#fff;padding:12px;border-radius:12px;width:100%;cursor:pointer;">Đóng</button>';
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

    // ========== THEMES (Glassmorphism) ==========
    var themes = {
        glass: {
            bg: 'rgba(12, 14, 20, 0.65)',
            bg2: 'rgba(255, 255, 255, 0.06)',
            bg3: 'rgba(255, 255, 255, 0.10)',
            text: '#ffffff',
            text2: 'rgba(255,255,255,0.75)',
            text3: 'rgba(255,255,255,0.4)',
            primary: '#00d4ff',
            accent: '#ff6b9d',
            danger: '#ff4757',
            glass: true
        },
        dark: {
            bg: 'rgba(26, 26, 26, 0.9)',
            bg2: 'rgba(255,255,255,0.05)',
            bg3: 'rgba(255,255,255,0.08)',
            text: '#ffffff',
            text2: '#cccccc',
            text3: '#888888',
            primary: '#4CAF50',
            accent: '#2196F3',
            danger: '#f44336',
            glass: false
        },
        light: {
            bg: 'rgba(255,255,255,0.85)',
            bg2: 'rgba(0,0,0,0.05)',
            bg3: 'rgba(0,0,0,0.08)',
            text: '#212121',
            text2: '#555555',
            text3: '#999999',
            primary: '#2E7D32',
            accent: '#1565C0',
            danger: '#c62828',
            glass: false
        },
        purple: {
            bg: 'rgba(26, 0, 51, 0.85)',
            bg2: 'rgba(255,255,255,0.05)',
            bg3: 'rgba(255,255,255,0.08)',
            text: '#ffffff',
            text2: '#dddddd',
            text3: '#999999',
            primary: '#BB86FC',
            accent: '#03DAC5',
            danger: '#CF6679',
            glass: false
        },
        matrix: {
            bg: 'rgba(0, 10, 0, 0.9)',
            bg2: 'rgba(0,255,0,0.05)',
            bg3: 'rgba(0,255,0,0.08)',
            text: '#00ff00',
            text2: '#00cc00',
            text3: '#008800',
            primary: '#00ff00',
            accent: '#00ffcc',
            danger: '#ff0000',
            glass: false
        }
    };

    function getTheme() { return themes[data.theme] || themes.glass; }

    // ========== BUILD UI (Glassmorphism) ==========
    function buildUI() {
        var t = getTheme();
        var arr = [...urls.entries()].map(function(e) {
            return { url: e[0], type: e[1].type, source: e[1].source, priority: e[1].priority };
        }).sort(function(a, b) { return a.priority - b.priority; });

        var panel = document.getElementById('__uvd__');
        if (panel) panel.remove();

        panel = document.createElement('div');
        panel.id = '__uvd__';
        var glassStyle = t.glass ? 'backdrop-filter:blur(24px) saturate(140%);-webkit-backdrop-filter:blur(24px) saturate(140%);' : '';
        panel.style.cssText = 'position:fixed;top:12px;left:12px;right:12px;bottom:12px;background:' + t.bg + ';color:' + t.text + ';padding:0;border-radius:28px;z-index:2147483647;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;font-size:13px;overflow:hidden;display:flex;flex-direction:column;box-shadow:0 25px 60px rgba(0,0,0,0.6);border:1px solid rgba(255,255,255,0.10);' + glassStyle;

        // ===== STYLES =====
        var style = document.createElement('style');
        style.textContent = `
            @keyframes uvdSlide{from{transform:translate(-50%,-20px);opacity:0}to{transform:translate(-50%,0);opacity:1}}
            @keyframes uvdPulse{0%,100%{opacity:1}50%{opacity:0.5}}
            @keyframes fadeIn{from{opacity:0}to{opacity:1}}
            #__uvd__ ::-webkit-scrollbar{width:4px}
            #__uvd__ ::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.2);border-radius:10px}
            #__uvd__ ::-webkit-scrollbar-track{background:transparent}
            .uvd-glass-btn { background:rgba(255,255,255,0.06); backdrop-filter:blur(10px); -webkit-backdrop-filter:blur(10px); border:1px solid rgba(255,255,255,0.08); transition:all 0.25s ease; }
            .uvd-glass-btn:hover { background:rgba(255,255,255,0.14); transform:scale(1.02); border-color:rgba(255,255,255,0.2); }
            .uvd-glass-btn:active { transform:scale(0.96); }
            .uvd-glass-card { background:rgba(255,255,255,0.04); backdrop-filter:blur(8px); -webkit-backdrop-filter:blur(8px); border:1px solid rgba(255,255,255,0.06); border-radius:16px; transition:transform 0.25s ease, box-shadow 0.25s ease; }
            .uvd-glass-card:hover { transform:translateY(-2px); box-shadow:0 8px 30px rgba(0,0,0,0.3); }
            .uvd-tab { background:transparent; border:none; color:${t.text2}; padding:12px 16px; font-size:13px; font-weight:500; cursor:pointer; border-bottom:3px solid transparent; transition:color 0.3s, border-color 0.3s; flex:1; text-align:center; }
            .uvd-tab-active { color:${t.text} !important; border-bottom-color:${t.primary} !important; }
            .uvd-tab:hover { color:${t.text}; }
            .uvd-url-box { background:rgba(0,0,0,0.25); border-radius:12px; padding:10px; font-family:monospace; font-size:11px; color:${t.text2}; word-break:break-all; max-height:70px; overflow-y:auto; border:1px solid rgba(255,255,255,0.04); }
        `;
        panel.appendChild(style);

        // ===== HEADER =====
        var header = document.createElement('div');
        header.style.cssText = 'background:linear-gradient(135deg,' + t.primary + '30,' + t.accent + '20);padding:14px 20px;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid rgba(255,255,255,0.06);flex-shrink:0;';
        header.innerHTML =
            '<div>' +
                '<b style="font-size:17px;color:#fff;text-shadow:0 2px 10px rgba(0,0,0,0.3);">⬇️ Universal DL V2</b>' +
                '<div style="font-size:11px;color:rgba(255,255,255,0.7);margin-top:2px;">' +
                    '<span style="animation:uvdPulse 2s infinite;">🔴 LIVE</span> · ' + arr.length + ' streams · ' + pageInfo.host +
                '</div>' +
            '</div>' +
            '<div style="display:flex;gap:6px;">' +
                '<button id="__uvd_refresh__" title="Refresh" class="uvd-glass-btn" style="color:#fff;border:0;padding:8px 12px;border-radius:12px;font-size:14px;cursor:pointer;">🔄</button>' +
                '<button id="__uvd_close__" title="Close" class="uvd-glass-btn" style="color:#fff;border:0;padding:8px 12px;border-radius:12px;font-weight:bold;font-size:14px;cursor:pointer;">✕</button>' +
            '</div>';
        panel.appendChild(header);

        // ===== TABS =====
        var tabContainer = document.createElement('div');
        tabContainer.style.cssText = 'display:flex;background:rgba(0,0,0,0.15);border-bottom:1px solid rgba(255,255,255,0.06);flex-shrink:0;';
        var tabList = [
            { id: 'streams', label: '📡 Streams (' + arr.length + ')' },
            { id: 'favorites', label: '⭐ Yêu thích (' + data.favorites.length + ')' },
            { id: 'history', label: '📜 Lịch sử (' + (data.history || []).length + ')' },
            { id: 'settings', label: '⚙️ Cài đặt' }
        ];
        tabList.forEach(function(tab) {
            var b = document.createElement('button');
            b.className = '__uvd_tab__ uvd-tab';
            b.dataset.tab = tab.id;
            b.textContent = tab.label;
            tabContainer.appendChild(b);
        });
        panel.appendChild(tabContainer);

        // ===== INFO BAR =====
        var info = document.createElement('div');
        info.style.cssText = 'background:rgba(0,0,0,0.12);padding:10px 18px;border-bottom:1px solid rgba(255,255,255,0.04);font-size:12px;flex-shrink:0;';
        info.innerHTML =
            '<div style="color:' + t.text2 + ';">📝 <span id="__uvd_title__" style="color:' + t.primary + ';font-weight:600;cursor:pointer;text-decoration:underline;">' + pageInfo.title + '</span> <span style="color:' + t.text3 + ';font-size:10px;">(sửa)</span></div>' +
            '<div style="color:' + t.text2 + ';margin-top:4px;">🔗 <span id="__uvd_referer__" style="color:' + t.accent + ';font-family:monospace;font-size:10px;cursor:pointer;text-decoration:underline;">' + pageInfo.referer + '</span></div>';
        panel.appendChild(info);

        // ===== CONTENT =====
        var content = document.createElement('div');
        content.id = '__uvd_content__';
        content.style.cssText = 'flex:1;overflow-y:auto;padding:12px 16px;';
        panel.appendChild(content);

        // ===== FOOTER =====
        var footer = document.createElement('div');
        footer.style.cssText = 'background:rgba(0,0,0,0.10);padding:10px 16px;border-top:1px solid rgba(255,255,255,0.05);display:flex;gap:6px;flex-wrap:wrap;flex-shrink:0;';
        footer.innerHTML =
            '<button id="__uvd_export_txt__" class="uvd-glass-btn" style="color:' + t.text + ';border:0;padding:6px 12px;border-radius:10px;font-size:11px;flex:1;cursor:pointer;">💾 TXT</button>' +
            '<button id="__uvd_export_json__" class="uvd-glass-btn" style="color:' + t.text + ';border:0;padding:6px 12px;border-radius:10px;font-size:11px;flex:1;cursor:pointer;">💾 JSON</button>' +
            '<button id="__uvd_export_m3u__" class="uvd-glass-btn" style="color:' + t.text + ';border:0;padding:6px 12px;border-radius:10px;font-size:11px;flex:1;cursor:pointer;">💾 M3U</button>' +
            '<button id="__uvd_export_csv__" class="uvd-glass-btn" style="color:' + t.text + ';border:0;padding:6px 12px;border-radius:10px;font-size:11px;flex:1;cursor:pointer;">💾 CSV</button>';
        panel.appendChild(footer);

        document.body.appendChild(panel);

        // ===== TAB LOGIC =====
        var currentTab = 'streams';
        function renderTab(tabId) {
            currentTab = tabId;
            document.querySelectorAll('.__uvd_tab__').forEach(function(t) {
                if (t.dataset.tab === tabId) {
                    t.classList.add('uvd-tab-active');
                } else {
                    t.classList.remove('uvd-tab-active');
                }
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

        // ===== GLOBAL EVENTS =====
        document.getElementById('__uvd_close__').onclick = function() {
            stopMonitor();
            panel.remove();
        };
        document.getElementById('__uvd_refresh__').onclick = function() {
            buildUI();
            toast('🔄 Đã làm mới');
        };
        document.getElementById('__uvd_title__').onclick = function() {
            var newTitle = prompt('Tên file:', pageInfo.title);
            if (newTitle) {
                pageInfo.title = newTitle.replace(/[^\w\s\u00C0-\u1EF9.-]/g, '').substring(0, 100);
                this.textContent = pageInfo.title;
            }
        };
        document.getElementById('__uvd_referer__').onclick = function() {
            var newRef = prompt('Referer:', pageInfo.referer);
            if (newRef) {
                pageInfo.referer = newRef;
                this.textContent = newRef;
                data.siteProfiles[pageInfo.host] = { referer: newRef, userAgent: pageInfo.userAgent };
                storage.set(data);
                toast('✓ Đã lưu Referer cho ' + pageInfo.host);
            }
        };

        // Export buttons
        document.getElementById('__uvd_export_txt__').onclick = function() { exportData('txt'); };
        document.getElementById('__uvd_export_json__').onclick = function() { exportData('json'); };
        document.getElementById('__uvd_export_m3u__').onclick = function() { exportData('m3u'); };
        document.getElementById('__uvd_export_csv__').onclick = function() { exportData('csv'); };
    }

    // ===== RENDER FUNCTIONS =====
    function renderStreams(container, arr) {
        var t = getTheme();
        if (!arr.length) {
            container.innerHTML = '<div style="text-align:center;padding:50px 20px;color:' + t.text2 + ';">🔍 Chưa tìm thấy stream nào<br><small style="color:' + t.text3 + ';">Đang monitor... Bấm Play video hoặc load thêm nội dung</small></div>';
            return;
        }
        var typeColors = {
            'M3U8': '#00d4ff', 'MPD': '#8BC34A', 'MP4': '#FF9800',
            'WEBM': '#FF9800', 'MKV': '#FF5722', 'FLV': '#FF5722',
            'TS': '#FFC107', 'IFRAME': '#7b61ff'
        };
        arr.forEach(function(item, i) {
            var color = typeColors[item.type] || '#888';
            var fav = isFavorite(item.url);
            var card = document.createElement('div');
            card.className = 'uvd-glass-card';
            card.style.cssText = 'padding:14px;margin:10px 0;border-left:4px solid ' + color + ';';
            card.innerHTML =
                '<div style="display:flex;justify-content:space-between;margin-bottom:10px;align-items:center;">' +
                    '<span style="background:' + color + '20;color:' + color + ';padding:2px 14px;border-radius:20px;font-size:11px;font-weight:600;border:1px solid ' + color + '30;">#' + (i + 1) + ' ' + item.type + '</span>' +
                    '<div style="display:flex;gap:6px;align-items:center;">' +
                        '<span style="color:' + t.text3 + ';font-size:10px;">' + item.source + '</span>' +
                        '<button class="__uvd_fav__" data-url="' + encodeURIComponent(item.url) + '" data-type="' + item.type + '" style="background:transparent;border:0;font-size:18px;cursor:pointer;padding:2px 6px;transition:0.2s;color:' + (fav ? '#FFD700' : '#666') + ';">' + (fav ? '★' : '☆') + '</button>' +
                    '</div>' +
                '</div>' +
                '<div class="uvd-url-box">' + item.url + '</div>' +
                '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:10px;">' +
                    '<button class="__uvd_act__ uvd-glass-btn" data-url="' + encodeURIComponent(item.url) + '" data-action="share" style="color:#fff;border:0;padding:8px 14px;border-radius:10px;font-size:12px;font-weight:500;cursor:pointer;background:rgba(255,107,107,0.6);">Chia sẻ</button>' +
                    '<button class="__uvd_act__ uvd-glass-btn" data-url="' + encodeURIComponent(item.url) + '" data-action="copy" style="color:#fff;border:0;padding:8px 14px;border-radius:10px;font-size:12px;font-weight:500;cursor:pointer;background:' + t.primary + '60;">Sao chép</button>' +
                    (item.type === 'IFRAME' ?
                        '<a href="' + item.url + '" target="_blank" class="uvd-glass-btn" style="color:#fff;padding:8px 14px;border-radius:10px;font-size:12px;font-weight:500;text-decoration:none;background:' + t.accent + '60;">Mở iframe</a>' :
                        (item.type === 'M3U8' ?
                            '<button class="__uvd_act__ uvd-glass-btn" data-url="' + encodeURIComponent(item.url) + '" data-action="quality" style="color:#fff;border:0;padding:8px 14px;border-radius:10px;font-size:12px;font-weight:500;cursor:pointer;background:rgba(156,39,176,0.6);">Chất lượng</button>' +
                            '<button class="__uvd_act__ uvd-glass-btn" data-url="' + encodeURIComponent(item.url) + '" data-action="preview" style="color:#fff;border:0;padding:8px 14px;border-radius:10px;font-size:12px;font-weight:500;cursor:pointer;background:rgba(0,188,212,0.6);">Xem</button>' :
                            '<button class="__uvd_act__ uvd-glass-btn" data-url="' + encodeURIComponent(item.url) + '" data-action="preview" style="color:#fff;border:0;padding:8px 14px;border-radius:10px;font-size:12px;font-weight:500;cursor:pointer;background:rgba(0,188,212,0.6);">Xem</button>'
                        )
                    ) +
                    '<button class="__uvd_act__ uvd-glass-btn" data-url="' + encodeURIComponent(item.url) + '" data-action="cmd" data-type="' + item.type + '" style="color:#fff;border:0;padding:8px 14px;border-radius:10px;font-size:12px;font-weight:500;cursor:pointer;background:rgba(233,30,99,0.6);">Lệnh tải</button>' +
                '</div>';
            container.appendChild(card);
        });

        // Bind events
        container.querySelectorAll('.__uvd_fav__').forEach(function(b) {
            b.onclick = function() {
                var url = decodeURIComponent(this.dataset.url);
                var isFav = toggleFavorite(url, this.dataset.type);
                this.textContent = isFav ? '★' : '☆';
                this.style.color = isFav ? '#FFD700' : '#666';
            };
        });
        container.querySelectorAll('.__uvd_act__').forEach(function(b) {
            b.onclick = function() {
                var url = decodeURIComponent(this.dataset.url);
                var action = this.dataset.action;
                var type = this.dataset.type || 'MP4';
                addToHistory(url, type);
                if (action === 'share') shareUrl(url);
                else if (action === 'copy') { copy(url); toast('Đã copy URL'); }
                else if (action === 'quality') showQualityPicker(url);
                else if (action === 'preview') showPreview(url);
                else if (action === 'cmd') showCommandPicker(url, type);
            };
        });
    }

    function renderFavorites(container) {
        var t = getTheme();
        if (!data.favorites.length) {
            container.innerHTML = '<div style="text-align:center;padding:50px 20px;color:' + t.text2 + ';">⭐ Chưa có yêu thích<br><small style="color:' + t.text3 + ';">Bấm ☆ trên stream để thêm</small></div>';
            return;
        }
        data.favorites.forEach(function(fav, i) {
            var card = document.createElement('div');
            card.className = 'uvd-glass-card';
            card.style.cssText = 'padding:14px;margin:10px 0;border-left:4px solid gold;';
            card.innerHTML =
                '<div style="display:flex;justify-content:space-between;margin-bottom:6px;">' +
                    '<b style="color:gold;font-size:13px;">⭐ ' + fav.type + '</b>' +
                    '<span style="color:' + t.text3 + ';font-size:10px;">' + new Date(fav.timestamp).toLocaleDateString() + '</span>' +
                '</div>' +
                '<div style="color:' + t.text + ';font-size:13px;margin-bottom:4px;">' + fav.title + '</div>' +
                '<div style="color:' + t.text3 + ';font-size:11px;margin-bottom:6px;">🌐 ' + fav.host + '</div>' +
                '<div class="uvd-url-box" style="max-height:50px;">' + fav.url + '</div>' +
                '<div style="display:flex;gap:6px;margin-top:8px;">' +
                    '<button class="__uvd_fbtn__ uvd-glass-btn" data-url="' + encodeURIComponent(fav.url) + '" data-action="share" style="color:#fff;border:0;padding:6px 12px;border-radius:10px;font-size:11px;font-weight:500;flex:1;cursor:pointer;background:rgba(255,107,107,0.6);">Chia sẻ</button>' +
                    '<button class="__uvd_fbtn__ uvd-glass-btn" data-url="' + encodeURIComponent(fav.url) + '" data-action="copy" style="color:#fff;border:0;padding:6px 12px;border-radius:10px;font-size:11px;font-weight:500;flex:1;cursor:pointer;background:' + t.primary + '60;">Sao chép</button>' +
                    '<button class="__uvd_fbtn__ uvd-glass-btn" data-idx="' + i + '" data-action="del" style="color:#fff;border:0;padding:6px 12px;border-radius:10px;font-size:11px;font-weight:500;cursor:pointer;background:' + t.danger + '60;">🗑️</button>' +
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
                    toast('🗑️ Đã xóa');
                } else {
                    var url = decodeURIComponent(this.dataset.url);
                    if (action === 'share') shareUrl(url);
                    else copy(url), toast('✓ Copied');
                }
            };
        });
    }

    function renderHistory(container) {
        var t = getTheme();
        var history = data.history || [];
        if (!history.length) {
            container.innerHTML = '<div style="text-align:center;padding:50px 20px;color:' + t.text2 + ';">📜 Chưa có lịch sử</div>';
            return;
        }
        var clearBtn = document.createElement('button');
        clearBtn.textContent = '🗑️ Xóa tất cả';
        clearBtn.className = 'uvd-glass-btn';
        clearBtn.style.cssText = 'background:' + t.danger + '60;color:#fff;border:0;padding:10px;border-radius:12px;font-weight:bold;width:100%;margin-bottom:12px;cursor:pointer;';
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
            card.className = 'uvd-glass-card';
            card.style.cssText = 'padding:12px;margin:8px 0;';
            card.innerHTML =
                '<div style="display:flex;justify-content:space-between;margin-bottom:4px;">' +
                    '<b style="color:' + t.accent + ';font-size:11px;">' + h.type + '</b>' +
                    '<span style="color:' + t.text3 + ';font-size:10px;">' + new Date(h.timestamp).toLocaleString() + '</span>' +
                '</div>' +
                '<div style="color:' + t.text + ';font-size:12px;">' + h.title + '</div>' +
                '<div style="color:' + t.text3 + ';font-size:10px;">🌐 ' + h.host + '</div>' +
                '<div class="uvd-url-box" style="max-height:40px;font-size:10px;">' + h.url + '</div>';
            container.appendChild(card);
        });
    }

    function renderSettings(container) {
        var t = getTheme();
        var html = '<div style="color:' + t.primary + ';font-weight:bold;margin-bottom:18px;font-size:16px;">⚙️ Cài đặt</div>';

        // Theme
        html += '<div class="uvd-glass-card" style="padding:16px;margin-bottom:12px;">';
        html += '<div style="color:' + t.text + ';font-weight:bold;margin-bottom:12px;">🎨 Giao diện</div>';
        html += '<div style="display:flex;flex-wrap:wrap;gap:8px;">';
        ['glass', 'dark', 'light', 'purple', 'matrix'].forEach(function(th) {
            var active = data.theme === th;
            html += '<button class="__uvd_theme__ uvd-glass-btn" data-theme="' + th + '" style="background:' + (active ? t.primary : 'rgba(255,255,255,0.05)') + ';color:' + (active ? '#000' : t.text) + ';border:1px solid ' + (active ? t.primary : 'rgba(255,255,255,0.08)') + ';padding:8px 16px;border-radius:20px;font-weight:600;cursor:pointer;">' + th + '</button>';
        });
        html += '</div></div>';

        // Site profiles
        html += '<div class="uvd-glass-card" style="padding:16px;margin-bottom:12px;">';
        html += '<div style="color:' + t.text + ';font-weight:bold;margin-bottom:12px;">🌐 Site Profiles</div>';
        var profiles = Object.keys(data.siteProfiles);
        if (!profiles.length) {
            html += '<div style="color:' + t.text3 + ';font-size:12px;">Chưa có profile. Bấm vào Referer ở trên để thêm.</div>';
        } else {
            profiles.forEach(function(p) {
                html += '<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.05);">';
                html += '<span style="font-weight:500;">' + p + '</span>';
                html += '<span style="color:' + t.text3 + ';font-size:11px;">' + data.siteProfiles[p].referer + '</span>';
                html += '<button class="__uvd_delprofile__ uvd-glass-btn" data-host="' + p + '" style="background:' + t.danger + '60;color:#fff;border:0;padding:4px 10px;border-radius:8px;cursor:pointer;">✕</button>';
                html += '</div>';
            });
        }
        html += '</div>';

        // Backup
        html += '<div class="uvd-glass-card" style="padding:16px;margin-bottom:12px;">';
        html += '<div style="color:' + t.text + ';font-weight:bold;margin-bottom:12px;">💾 Sao lưu</div>';
        html += '<div style="display:flex;gap:8px;flex-wrap:wrap;">';
        html += '<button id="__uvd_backup__" class="uvd-glass-btn" style="background:' + t.primary + '60;color:#fff;border:0;padding:10px 16px;border-radius:12px;font-weight:bold;cursor:pointer;">📤 Xuất dữ liệu</button>';
        html += '<button id="__uvd_restore__" class="uvd-glass-btn" style="background:' + t.accent + '60;color:#fff;border:0;padding:10px 16px;border-radius:12px;font-weight:bold;cursor:pointer;">📥 Nhập dữ liệu</button>';
        html += '<button id="__uvd_reset__" class="uvd-glass-btn" style="background:' + t.danger + '60;color:#fff;border:0;padding:10px 16px;border-radius:12px;font-weight:bold;cursor:pointer;">🔥 Đặt lại</button>';
        html += '</div></div>';

        // Info
        html += '<div class="uvd-glass-card" style="padding:16px;font-size:12px;color:' + t.text2 + ';">';
        html += '<div>📦 Version: 2.0 (Glass + Video.js v10)</div>';
        html += '<div>👤 By: nguyenquocngu93</div>';
        html += '<div>💾 Yêu thích: ' + data.favorites.length + '</div>';
        html += '<div>📜 Lịch sử: ' + (data.history || []).length + '</div>';
        html += '<div>🌐 Site profiles: ' + Object.keys(data.siteProfiles).length + '</div>';
        html += '</div>';

        container.innerHTML = html;

        // Bind events
        container.querySelectorAll('.__uvd_theme__').forEach(function(b) {
            b.onclick = function() {
                data.theme = this.dataset.theme;
                storage.set(data);
                buildUI();
                toast('🎨 Theme: ' + data.theme);
            };
        });
        container.querySelectorAll('.__uvd_delprofile__').forEach(function(b) {
            b.onclick = function() {
                delete data.siteProfiles[this.dataset.host];
                storage.set(data);
                renderSettings(container);
                toast('🗑️ Đã xóa profile');
            };
        });
        document.getElementById('__uvd_backup__').onclick = function() {
            var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            var a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = 'uvd_backup.json';
            a.click();
            toast('📤 Đã xuất backup');
        };
        document.getElementById('__uvd_restore__').onclick = function() {
            var input = document.createElement('input');
            input.type = 'file';
            input.accept = '.json';
            input.onchange = function(e) {
                var reader = new FileReader();
                reader.onload = function(ev) {
                    try {
                        var imported = JSON.parse(ev.target.result);
                        data = Object.assign(data, imported);
                        storage.set(data);
                        toast('✓ Đã nhập dữ liệu');
                        buildUI();
                    } catch(err) {
                        toast('❌ File không hợp lệ', getTheme().danger);
                    }
                };
                reader.readAsText(e.target.files[0]);
            };
            input.click();
        };
        document.getElementById('__uvd_reset__').onclick = function() {
            if (confirm('Xóa TOÀN BỘ dữ liệu?')) {
                localStorage.removeItem(STORAGE_KEY);
                data = { favorites: [], theme: 'glass', siteProfiles: {}, history: [] };
                storage.set(data);
                toast('🔥 Đã reset');
                buildUI();
            }
        };
    }

    // ========== START ==========
    buildUI();

    var lastCount = urls.size;
    var autoRefresh = setInterval(function() {
        if (!document.getElementById('__uvd__')) {
            clearInterval(autoRefresh);
            stopMonitor();
            return;
        }
        if (urls.size !== lastCount) {
            lastCount = urls.size;
            // Cập nhật badge nếu cần
        }
    }, 2000);

    console.log('✅ Universal DL V2 Glass Pro loaded! Found', urls.size, 'streams.');
    toast('✨ Glass Pro + Video float ready!');
})();