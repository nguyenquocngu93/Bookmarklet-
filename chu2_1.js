/**
 * Universal Video Downloader V2 - Glass Pro (Video.js v10)
 * - Giao diện glass tối ưu, không icon thừa
 * - Hiệu ứng chuyển tab, thu nhỏ panel
 * - Video.js v10 (ES module) với controls tùy chỉnh
 * - Bỏ tab Favorites, thêm hướng dẫn
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
            'yt-dlp-aria': { label: 'yt-dlp + aria2 (nhanh)', cmd: 'yt-dlp --referer "' + ref + '" --downloader aria2c --downloader-args "aria2c:-x 16 -s 16 -k 1M" --concurrent-fragments 8 -o "' + t + '.%(ext)s" "' + url + '"' },
            'ffmpeg': { label: 'FFmpeg (M3U8 → MP4)', cmd: 'ffmpeg -headers "Referer: ' + ref + '\\r\\nOrigin: ' + origin + '\\r\\nUser-Agent: ' + ua + '" -i "' + url + '" -c copy -bsf:a aac_adtstoasc "' + t + '.mp4"' },
            'curl': { label: 'cURL', cmd: 'curl -H "Referer: ' + ref + '" -o "' + t + '.' + ext + '" "' + url + '"' },
            'aria2': { label: 'aria2c (tăng tốc)', cmd: 'aria2c --referer="' + ref + '" -x 16 -s 16 -o "' + t + '.' + ext + '" "' + url + '"' }
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
        el.style.cssText = 'position:fixed;bottom:30px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.8);color:#fff;padding:12px 28px;border-radius:30px;z-index:2147483649;font:500 14px -apple-system,BlinkMacSystemFont,sans-serif;backdrop-filter:blur(10px);border:1px solid ' + color + ';box-shadow:0 8px 30px rgba(0,0,0,0.5);animation:toastIn 0.3s ease;';
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

    // ========== VIDEO.JS V10 (ES Module) ==========
    var vjs10Ready = false;
    var vjs10Queue = [];
    function loadVideoJSV10(callback) {
        if (vjs10Ready) { callback(); return; }
        // Nếu đã có video-player custom element, coi như ready
        if (customElements.get('video-player')) {
            vjs10Ready = true;
            callback();
            return;
        }
        // Kiểm tra script đã được load chưa
        if (document.querySelector('script[src*="video.js"]')) {
            var check = setInterval(function() {
                if (customElements.get('video-player')) {
                    clearInterval(check);
                    vjs10Ready = true;
                    callback();
                }
            }, 100);
            setTimeout(function() { clearInterval(check); if (!vjs10Ready) { vjs10Ready = true; callback(); } }, 5000);
            return;
        }
        // Load CSS
        var css = document.createElement('link');
        css.rel = 'stylesheet';
        css.href = 'https://cdn.jsdelivr.net/npm/@videojs/html/cdn/video-js.css';
        document.head.appendChild(css);
        // Load module
        var script = document.createElement('script');
        script.type = 'module';
        script.src = 'https://cdn.jsdelivr.net/npm/@videojs/html/cdn/video.js';
        script.onload = function() {
            var check = setInterval(function() {
                if (customElements.get('video-player')) {
                    clearInterval(check);
                    vjs10Ready = true;
                    callback();
                }
            }, 100);
            setTimeout(function() { clearInterval(check); if (!vjs10Ready) { vjs10Ready = true; callback(); } }, 5000);
        };
        script.onerror = function() {
            vjs10Ready = true;
            callback();
        };
        document.head.appendChild(script);
    }

    function mountVideoJSV10(wrapper, video) {
        var player = document.createElement('video-player');
        player.style.cssText = 'width:100%;height:100%;display:block;';
        var skin = document.createElement('video-skin');
        skin.style.cssText = 'width:100%;height:100%;display:block;';
        if (video.parentNode) video.parentNode.removeChild(video);
        skin.appendChild(video);
        player.appendChild(skin);
        wrapper.appendChild(player);
        return player;
    }

    // ========== PREVIEW PLAYER ==========
    function showPreview(url, type) {
        var overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);backdrop-filter:blur(20px);z-index:2147483648;display:flex;flex-direction:column;padding:20px;';
        var header = document.createElement('div');
        header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.1);';
        header.innerHTML = '<span style="color:#fff;font-weight:500;font-size:16px;">▶ ' + pageInfo.title + '</span><button id="closePreview" style="background:none;border:none;color:#fff;font-size:20px;cursor:pointer;">✕</button>';
        overlay.appendChild(header);

        var wrapper = document.createElement('div');
        wrapper.style.cssText = 'flex:1;display:flex;align-items:center;justify-content:center;background:#000;border-radius:16px;margin-top:12px;overflow:hidden;';
        var video = document.createElement('video');
        video.src = url;
        video.setAttribute('playsinline', '');
        video.setAttribute('webkit-playsinline', '');
        video.style.cssText = 'max-width:100%;max-height:100%;width:100%;height:100%;object-fit:contain;';
        wrapper.appendChild(video);
        overlay.appendChild(wrapper);
        document.body.appendChild(overlay);

        // Load Video.js v10 và mount
        loadVideoJSV10(function() {
            try {
                mountVideoJSV10(wrapper, video);
            } catch(e) {
                video.controls = true;
                wrapper.appendChild(video);
                toast('Fallback: dùng controls native');
            }
        });

        document.getElementById('closePreview').onclick = function() {
            overlay.remove();
            // Cleanup custom element nếu có
            var player = wrapper.querySelector('video-player');
            if (player) player.remove();
        };
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
                    else if (action === 'play') showPreview(qUrl, 'M3U8');
                    else if (action === 'cmd') showCommandPicker(qUrl, 'M3U8');
                };
            });
            document.getElementById('closeQ').onclick = function() { overlay.remove(); };
        });
    }

    // ========== BUILD UI ==========
    function buildUI() {
        var arr = [...urls.entries()].map(function(e) {
            return { url: e[0], type: e[1].type, source: e[1].source, priority: e[1].priority };
        }).sort(function(a, b) { return a.priority - b.priority; });

        var panel = document.getElementById('__uvd__');
        if (panel) panel.remove();

        panel = document.createElement('div');
        panel.id = '__uvd__';
        panel.style.cssText = 'position:fixed;top:12px;left:12px;right:12px;bottom:12px;background:rgba(12,14,20,0.75);backdrop-filter:blur(24px) saturate(140%);-webkit-backdrop-filter:blur(24px) saturate(140%);border-radius:28px;border:1px solid rgba(255,255,255,0.08);box-shadow:0 25px 60px rgba(0,0,0,0.7);z-index:2147483647;display:flex;flex-direction:column;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;color:#fff;overflow:hidden;transition:height 0.4s cubic-bezier(0.4,0,0.2,1),opacity 0.3s ease;';

        // ===== HEADER =====
        var header = document.createElement('div');
        header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:14px 20px;border-bottom:1px solid rgba(255,255,255,0.06);flex-shrink:0;';
        header.innerHTML =
            '<div style="display:flex;align-items:center;gap:10px;">' +
                '<span style="font-weight:600;font-size:16px;letter-spacing:-0.3px;">Universal DL <span style="color:#00d4ff;">V2</span></span>' +
                '<span style="font-size:12px;color:#888;background:rgba(0,212,255,0.15);padding:2px 10px;border-radius:20px;">' + arr.length + ' streams</span>' +
            '</div>' +
            '<div style="display:flex;gap:6px;">' +
                '<button id="uvdMinimize" style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.08);color:#fff;padding:6px 12px;border-radius:12px;cursor:pointer;font-size:14px;transition:0.2s;">−</button>' +
                '<button id="uvdClose" style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.08);color:#fff;padding:6px 12px;border-radius:12px;cursor:pointer;font-size:14px;transition:0.2s;">✕</button>' +
            '</div>';
        panel.appendChild(header);

        // ===== TABS =====
        var tabContainer = document.createElement('div');
        tabContainer.style.cssText = 'display:flex;padding:0 20px;border-bottom:1px solid rgba(255,255,255,0.06);flex-shrink:0;';
        var tabs = [
            { id: 'streams', label: 'Streams' },
            { id: 'history', label: 'History' },
            { id: 'settings', label: 'Settings' }
        ];
        var tabButtons = [];
        var indicator = document.createElement('div');
        indicator.style.cssText = 'height:3px;background:linear-gradient(90deg,#00d4ff,#7b61ff);border-radius:3px;position:relative;top:0;transition:transform 0.35s cubic-bezier(0.4,0,0.2,1),width 0.35s cubic-bezier(0.4,0,0.2,1);';
        tabContainer.appendChild(indicator);
        tabs.forEach(function(tab, idx) {
            var btn = document.createElement('button');
            btn.dataset.tab = tab.id;
            btn.textContent = tab.label;
            btn.style.cssText = 'background:none;border:none;color:#888;padding:12px 16px;font-size:14px;font-weight:500;cursor:pointer;transition:color 0.2s;flex:1;text-align:center;';
            btn.onclick = function() {
                switchTab(tab.id);
            };
            tabContainer.appendChild(btn);
            tabButtons.push(btn);
        });
        panel.appendChild(tabContainer);

        // ===== CONTENT =====
        var content = document.createElement('div');
        content.id = 'uvdContent';
        content.style.cssText = 'flex:1;overflow-y:auto;padding:16px 20px;';
        panel.appendChild(content);

        // ===== FOOTER =====
        var footer = document.createElement('div');
        footer.style.cssText = 'display:flex;gap:6px;padding:10px 20px;border-top:1px solid rgba(255,255,255,0.06);flex-shrink:0;flex-wrap:wrap;';
        ['TXT','JSON','M3U','CSV'].forEach(function(f) {
            var btn = document.createElement('button');
            btn.textContent = f;
            btn.style.cssText = 'background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.08);color:#ccc;padding:6px 14px;border-radius:10px;font-size:12px;cursor:pointer;flex:1;transition:0.2s;';
            btn.onclick = function() { exportData(f.toLowerCase()); };
            footer.appendChild(btn);
        });
        panel.appendChild(footer);

        document.body.appendChild(panel);

        // ===== TAB LOGIC =====
        var currentTab = 'streams';
        function switchTab(tabId) {
            currentTab = tabId;
            // Update indicator
            var activeBtn = tabButtons.find(function(b) { return b.dataset.tab === tabId; });
            if (activeBtn) {
                var rect = activeBtn.getBoundingClientRect();
                var parentRect = tabContainer.getBoundingClientRect();
                var left = activeBtn.offsetLeft;
                var width = activeBtn.offsetWidth;
                indicator.style.transform = 'translateX(' + left + 'px)';
                indicator.style.width = width + 'px';
            }
            tabButtons.forEach(function(b) {
                b.style.color = (b.dataset.tab === tabId) ? '#fff' : '#888';
            });
            // Render content
            content.innerHTML = '';
            if (tabId === 'streams') renderStreams(content, arr);
            else if (tabId === 'history') renderHistory(content);
            else if (tabId === 'settings') renderSettings(content);
        }

        // Initial indicator position
        setTimeout(function() {
            var firstBtn = tabButtons[0];
            if (firstBtn) {
                indicator.style.width = firstBtn.offsetWidth + 'px';
                indicator.style.transform = 'translateX(' + firstBtn.offsetLeft + 'px)';
                firstBtn.style.color = '#fff';
            }
        }, 50);

        switchTab('streams');

        // ===== EVENTS =====
        document.getElementById('uvdClose').onclick = function() {
            stopMonitor();
            panel.remove();
        };
        document.getElementById('uvdMinimize').onclick = function() {
            panel.classList.toggle('uvd-minimized');
            var isMin = panel.classList.contains('uvd-minimized');
            this.textContent = isMin ? '+' : '−';
            if (isMin) {
                panel.style.height = '60px';
                content.style.opacity = '0';
                footer.style.opacity = '0';
                tabContainer.style.opacity = '0';
                // Thêm class để ẩn nội dung
            } else {
                panel.style.height = 'calc(100dvh - 24px)';
                content.style.opacity = '1';
                footer.style.opacity = '1';
                tabContainer.style.opacity = '1';
            }
        };

        // Thêm style cho animation
        var styleEl = document.createElement('style');
        styleEl.textContent = `
            #__uvd__ .uvd-minimized {
                height: 60px !important;
                overflow: hidden;
                backdrop-filter: blur(12px) !important;
            }
            #__uvd__ .uvd-minimized #uvdContent,
            #__uvd__ .uvd-minimized .uvd-tab-container,
            #__uvd__ .uvd-minimized footer {
                opacity: 0;
                pointer-events: none;
                transition: opacity 0.3s ease;
            }
            #__uvd__ #uvdContent {
                transition: opacity 0.3s ease;
            }
            @keyframes toastIn {
                from { opacity: 0; transform: translateX(-50%) translateY(20px); }
                to { opacity: 1; transform: translateX(-50%) translateY(0); }
            }
            .uvd-stream-card {
                background: rgba(255,255,255,0.04);
                border-radius: 16px;
                padding: 14px;
                margin-bottom: 12px;
                border: 1px solid rgba(255,255,255,0.06);
                transition: transform 0.2s, box-shadow 0.2s;
            }
            .uvd-stream-card:hover {
                transform: translateY(-2px);
                box-shadow: 0 8px 30px rgba(0,0,0,0.3);
            }
            .uvd-btn-glass {
                background: rgba(255,255,255,0.06);
                border: 1px solid rgba(255,255,255,0.08);
                color: #fff;
                padding: 6px 14px;
                border-radius: 10px;
                font-size: 12px;
                cursor: pointer;
                transition: background 0.2s;
            }
            .uvd-btn-glass:hover {
                background: rgba(255,255,255,0.12);
            }
        `;
        document.head.appendChild(styleEl);

        // Thêm hướng dẫn sử dụng trong Settings
    }

    // ===== RENDER FUNCTIONS =====
    function renderStreams(container, arr) {
        if (!arr.length) {
            container.innerHTML = '<div style="text-align:center;padding:40px;color:#888;">Chưa tìm thấy stream nào.<br>Bấm Play video hoặc tải lại trang.</div>';
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
            card.className = 'uvd-stream-card';
            card.innerHTML =
                '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">' +
                    '<span style="display:inline-block;background:' + color + '30;color:' + color + ';padding:2px 12px;border-radius:20px;font-size:12px;font-weight:500;border:1px solid ' + color + '40;">#' + (i+1) + ' ' + item.type + '</span>' +
                    '<div>' +
                        '<button class="fav-btn" data-url="' + encodeURIComponent(item.url) + '" style="background:none;border:none;color:' + (fav ? '#FFD700' : '#888') + ';font-size:18px;cursor:pointer;">' + (fav ? '★' : '☆') + '</button>' +
                    '</div>' +
                '</div>' +
                '<div style="background:rgba(0,0,0,0.3);padding:10px;border-radius:12px;font-family:monospace;font-size:11px;color:#aaa;word-break:break-all;max-height:60px;overflow-y:auto;margin-bottom:10px;">' + item.url + '</div>' +
                '<div style="display:flex;gap:6px;flex-wrap:wrap;">' +
                    '<button class="uvd-btn-glass action-btn" data-action="share" data-url="' + encodeURIComponent(item.url) + '">Chia sẻ</button>' +
                    '<button class="uvd-btn-glass action-btn" data-action="copy" data-url="' + encodeURIComponent(item.url) + '">Sao chép</button>' +
                    (item.type === 'IFRAME' ?
                        '<button class="uvd-btn-glass action-btn" data-action="iframe" data-url="' + encodeURIComponent(item.url) + '">Mở iframe</button>' :
                        (item.type === 'M3U8' ?
                            '<button class="uvd-btn-glass action-btn" data-action="quality" data-url="' + encodeURIComponent(item.url) + '">Chất lượng</button>' +
                            '<button class="uvd-btn-glass action-btn" data-action="preview" data-url="' + encodeURIComponent(item.url) + '" style="background:rgba(0,212,255,0.15);">Xem</button>' :
                            '<button class="uvd-btn-glass action-btn" data-action="preview" data-url="' + encodeURIComponent(item.url) + '" style="background:rgba(0,212,255,0.15);">Xem</button>'
                        )
                    ) +
                    '<button class="uvd-btn-glass action-btn" data-action="cmd" data-url="' + encodeURIComponent(item.url) + '" data-type="' + item.type + '">Lệnh tải</button>' +
                '</div>';
            container.appendChild(card);
        });

        // Bind events
        container.querySelectorAll('.fav-btn').forEach(function(b) {
            b.onclick = function() {
                var url = decodeURIComponent(this.dataset.url);
                var isFav = toggleFavorite(url, '');
                this.textContent = isFav ? '★' : '☆';
                this.style.color = isFav ? '#FFD700' : '#888';
            };
        });
        container.querySelectorAll('.action-btn').forEach(function(b) {
            b.onclick = function() {
                var url = decodeURIComponent(this.dataset.url);
                var action = this.dataset.action;
                var type = this.dataset.type || 'MP4';
                addToHistory(url, type);
                if (action === 'share') shareUrl(url);
                else if (action === 'copy') { copy(url); toast('Đã copy URL'); }
                else if (action === 'quality') showQualityPicker(url);
                else if (action === 'preview') showPreview(url, type);
                else if (action === 'cmd') showCommandPicker(url, type);
                else if (action === 'iframe') window.open(url, '_blank');
            };
        });
    }

    function renderHistory(container) {
        var history = data.history || [];
        if (!history.length) {
            container.innerHTML = '<div style="text-align:center;padding:40px;color:#888;">Chưa có lịch sử xem.</div>';
            return;
        }
        var clearBtn = document.createElement('button');
        clearBtn.textContent = 'Xóa tất cả';
        clearBtn.style.cssText = 'background:#ff4757;border:none;color:#fff;padding:8px 16px;border-radius:12px;cursor:pointer;margin-bottom:16px;';
        clearBtn.onclick = function() {
            if (confirm('Xóa toàn bộ lịch sử?')) {
                data.history = [];
                storage.set(data);
                renderHistory(container);
            }
        };
        container.appendChild(clearBtn);
        history.forEach(function(h) {
            var div = document.createElement('div');
            div.style.cssText = 'background:rgba(255,255,255,0.04);border-radius:12px;padding:12px;margin-bottom:8px;border:1px solid rgba(255,255,255,0.06);';
            div.innerHTML =
                '<div style="display:flex;justify-content:space-between;font-size:13px;color:#ccc;">' +
                    '<span>' + h.type + '</span>' +
                    '<span style="color:#888;font-size:11px;">' + new Date(h.timestamp).toLocaleString() + '</span>' +
                '</div>' +
                '<div style="font-weight:500;margin:4px 0;">' + h.title + '</div>' +
                '<div style="font-size:11px;color:#888;">' + h.host + '</div>' +
                '<div style="font-family:monospace;font-size:10px;color:#666;word-break:break-all;margin-top:4px;">' + h.url + '</div>';
            container.appendChild(div);
        });
    }

    function renderSettings(container) {
        var html = '<div style="font-size:18px;font-weight:600;margin-bottom:16px;color:#00d4ff;">⚙️ Cài đặt & Hướng dẫn</div>';

        // Theme
        html += '<div style="background:rgba(255,255,255,0.04);border-radius:16px;padding:16px;margin-bottom:16px;">';
        html += '<div style="font-weight:500;margin-bottom:10px;">Giao diện</div>';
        html += '<div style="display:flex;gap:8px;flex-wrap:wrap;">';
        ['glass','dark','light','purple','matrix'].forEach(function(th) {
            var active = data.theme === th;
            html += '<button class="theme-btn" data-theme="' + th + '" style="background:' + (active ? '#00d4ff' : 'rgba(255,255,255,0.06)') + ';border:1px solid ' + (active ? '#00d4ff' : 'rgba(255,255,255,0.08)') + ';color:' + (active ? '#000' : '#fff') + ';padding:6px 16px;border-radius:20px;cursor:pointer;font-weight:' + (active ? '600' : '400') + ';">' + th + '</button>';
        });
        html += '</div></div>';

        // Hướng dẫn sử dụng
        html += '<div style="background:rgba(255,255,255,0.04);border-radius:16px;padding:16px;margin-bottom:16px;">';
        html += '<div style="font-weight:500;margin-bottom:10px;">📖 Hướng dẫn nhanh</div>';
        html += '<ul style="color:#aaa;line-height:1.8;padding-left:20px;margin:0;">';
        html += '<li><b style="color:#fff;">Xem stream:</b> nhấn nút <span style="color:#00d4ff;">Xem</span> để mở trình phát Video.js v10.</li>';
        html += '<li><b style="color:#fff;">Chất lượng:</b> với M3U8, nhấn <span style="color:#00d4ff;">Chất lượng</span> để chọn độ phân giải.</li>';
        html += '<li><b style="color:#fff;">Tải về:</b> nhấn <span style="color:#00d4ff;">Lệnh tải</span> để sao chép lệnh yt-dlp/ffmpeg.</li>';
        html += '<li><b style="color:#fff;">Thu nhỏ:</b> nhấn nút <span style="color:#00d4ff;">−</span> trên header để thu gọn panel.</li>';
        html += '<li><b style="color:#fff;">Lịch sử:</b> xem các stream đã mở trong tab History.</li>';
        html += '<li><b style="color:#fff;">Xuất dữ liệu:</b> dùng các nút TXT, JSON, M3U, CSV ở footer.</li>';
        html += '</ul></div>';

        // Site profiles
        html += '<div style="background:rgba(255,255,255,0.04);border-radius:16px;padding:16px;margin-bottom:16px;">';
        html += '<div style="font-weight:500;margin-bottom:10px;">🌐 Site Profiles</div>';
        var profiles = Object.keys(data.siteProfiles);
        if (!profiles.length) {
            html += '<div style="color:#888;font-size:13px;">Chưa có profile. Bấm vào Referer ở trên để thêm.</div>';
        } else {
            profiles.forEach(function(p) {
                html += '<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.05);">';
                html += '<span style="font-weight:500;">' + p + '</span>';
                html += '<span style="color:#888;font-size:12px;">' + data.siteProfiles[p].referer + '</span>';
                html += '<button class="del-profile" data-host="' + p + '" style="background:none;border:none;color:#ff4757;cursor:pointer;">✕</button>';
                html += '</div>';
            });
        }
        html += '</div>';

        // Backup
        html += '<div style="background:rgba(255,255,255,0.04);border-radius:16px;padding:16px;margin-bottom:16px;">';
        html += '<div style="font-weight:500;margin-bottom:10px;">💾 Sao lưu</div>';
        html += '<div style="display:flex;gap:8px;flex-wrap:wrap;">';
        html += '<button id="backupBtn" style="background:rgba(0,212,255,0.15);border:1px solid rgba(0,212,255,0.2);color:#fff;padding:8px 16px;border-radius:12px;cursor:pointer;">Xuất dữ liệu</button>';
        html += '<button id="restoreBtn" style="background:rgba(255,183,77,0.15);border:1px solid rgba(255,183,77,0.2);color:#fff;padding:8px 16px;border-radius:12px;cursor:pointer;">Nhập dữ liệu</button>';
        html += '<button id="resetBtn" style="background:rgba(255,71,87,0.15);border:1px solid rgba(255,71,87,0.2);color:#fff;padding:8px 16px;border-radius:12px;cursor:pointer;">Đặt lại</button>';
        html += '</div></div>';

        container.innerHTML = html;

        // Bind events
        container.querySelectorAll('.theme-btn').forEach(function(b) {
            b.onclick = function() {
                data.theme = this.dataset.theme;
                storage.set(data);
                buildUI();
                toast('Đã đổi theme: ' + data.theme);
            };
        });
        container.querySelectorAll('.del-profile').forEach(function(b) {
            b.onclick = function() {
                delete data.siteProfiles[this.dataset.host];
                storage.set(data);
                renderSettings(container);
            };
        });
        document.getElementById('backupBtn').onclick = function() {
            var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            var a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = 'uvd_backup.json';
            a.click();
            toast('Đã xuất backup');
        };
        document.getElementById('restoreBtn').onclick = function() {
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
                        toast('Đã nhập dữ liệu');
                        buildUI();
                    } catch(err) {
                        toast('File không hợp lệ', '#ff4757');
                    }
                };
                reader.readAsText(e.target.files[0]);
            };
            input.click();
        };
        document.getElementById('resetBtn').onclick = function() {
            if (confirm('Xóa toàn bộ dữ liệu?')) {
                localStorage.removeItem(STORAGE_KEY);
                data = { favorites: [], theme: 'glass', siteProfiles: {}, history: [] };
                storage.set(data);
                toast('Đã reset');
                buildUI();
            }
        };
    }

    // ========== START ==========
    buildUI();

    // Auto refresh
    var lastCount = urls.size;
    setInterval(function() {
        if (!document.getElementById('__uvd__')) {
            stopMonitor();
            return;
        }
        if (urls.size !== lastCount) {
            lastCount = urls.size;
            // Có thể cập nhật số lượng stream trên header
            var badge = document.querySelector('#__uvd__ .uvd-badge');
            if (badge) badge.textContent = urls.size + ' streams';
        }
    }, 2000);

    console.log('✅ Universal DL V2 Glass Pro + Video.js v10 loaded. Found', urls.size, 'streams.');
    toast('✨ Sẵn sàng! Video.js v10 đã tích hợp.');
})();