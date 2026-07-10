/**
 * Universal Video Downloader V3 - Glass Edition
 * Features: Glass UI, CSS Icons, Custom Media Player, Multi-quality, 
 *           Live monitoring, Favorites, History, Export, YTDLnis share.
 * Author: nguyenquocngu93
 */
(function() {
    'use strict';

    // ========== INIT ==========
    var old = document.getElementById('__uvd__');
    if (old) old.remove();

    var STORAGE_KEY = 'uvd_data_v3';
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
    data.theme = data.theme || 'glass-dark';
    data.siteProfiles = data.siteProfiles || {};
    data.history = data.history || [];

    // ========== SITE PROFILES ==========
    var defaultProfiles = {
        'videoplay.us': { referer: 'https://videoplay.us/', userAgent: '' },
        'streamtape.com': { referer: 'https://streamtape.com/', userAgent: '' },
        'ok.ru': { referer: 'https://ok.ru/', userAgent: '' },
        'fembed.com': { referer: 'https://fembed.com/', userAgent: '' },
        'mp4upload.com': { referer: 'https://mp4upload.com/', userAgent: '' }
    };

    var host = location.hostname.replace('www.', '');
    var profile = data.siteProfiles[host] || defaultProfiles[host] || {
        referer: location.origin + '/',
        origin: location.origin,
        userAgent: navigator.userAgent
    };

    var pageInfo = {
        title: (document.title || 'video').replace(/[^\w\s\u00C0-\u1EF9]/g, '').substring(0, 60).trim() || 'video',
        url: location.href,
        host: host,
        referer: profile.referer,
        origin: location.origin,
        userAgent: profile.userAgent || navigator.userAgent
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
            if (!text.includes('#EXT-X-STREAM-INF')) {
                callback(null);
                return;
            }
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
                        var quality = resolution.split('x')[1] || bandwidth;
                        var qualityLabel = resolution === 'unknown' ? Math.round(bandwidth/1000) + 'kbps' : quality + 'p';
                        var streamUrl = nextLine;
                        if (!streamUrl.startsWith('http')) {
                            var baseUrl = url.substring(0, url.lastIndexOf('/') + 1);
                            streamUrl = baseUrl + streamUrl;
                        }
                        qualities.push({
                            label: qualityLabel,
                            resolution: resolution,
                            bandwidth: bandwidth,
                            codecs: codecs,
                            url: streamUrl
                        });
                    }
                }
            }
            qualities.sort(function(a, b) {
                var ha = parseInt(a.resolution.split('x')[1]) || 0;
                var hb = parseInt(b.resolution.split('x')[1]) || 0;
                return hb - ha;
            });
            callback(qualities);
        })
        .catch(function(e) {
            console.error('M3U8 parse error:', e);
            callback(null);
        });
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
            'yt-dlp-hq': { label: 'yt-dlp (HQ)', cmd: 'yt-dlp --referer "' + ref + '" -f "bv*+ba/best" --merge-output-format mp4 --embed-thumbnail --add-metadata -o "' + t + '.%(ext)s" "' + url + '"' },
            'yt-dlp-aria': { label: 'yt-dlp + aria2 (siêu tốc)', cmd: 'yt-dlp --referer "' + ref + '" --downloader aria2c --downloader-args "aria2c:-x 16 -s 16 -k 1M" --concurrent-fragments 8 -o "' + t + '.%(ext)s" "' + url + '"' },
            'ffmpeg': { label: 'FFmpeg (M3U8 → MP4)', cmd: 'ffmpeg -headers "Referer: ' + ref + '\\r\\nOrigin: ' + origin + '" -i "' + url + '" -c copy -bsf:a aac_adtstoasc "' + t + '.mp4"' },
            'curl': { label: 'cURL', cmd: 'curl -H "Referer: ' + ref + '" -o "' + t + '.' + ext + '" "' + url + '"' }
        };
    }

    // ========== UTILITIES ==========
    function copy(text) {
        var t = document.createElement('textarea');
        t.value = text;
        document.body.appendChild(t);
        t.select();
        document.execCommand('copy');
        t.remove();
    }

    function toast(msg, color) {
        color = color || 'var(--uvd-accent)';
        var el = document.createElement('div');
        el.innerText = msg;
        el.className = 'uvd-toast';
        el.style.background = color;
        document.body.appendChild(el);
        setTimeout(function() { el.remove(); }, 2500);
    }

    function shareUrl(url) {
        if (navigator.share) {
            navigator.share({ title: pageInfo.title, text: pageInfo.title, url: url })
            .catch(function(err) {
                if (err.name !== 'AbortError') { copy(url); toast('Đã copy URL'); }
            });
        } else {
            copy(url);
            toast('Đã copy – Mở YTDLnis để tải', '#ff6b6b');
        }
    }

    function addToHistory(url, type) {
        data.history = data.history || [];
        data.history.unshift({ url, type, title: pageInfo.title, host: pageInfo.host, timestamp: Date.now() });
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
            toast('Đã xóa khỏi Favorites');
        } else {
            data.favorites.unshift({ url, type, title: pageInfo.title, host: pageInfo.host, timestamp: Date.now() });
            toast('Đã thêm vào Favorites');
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
            content = JSON.stringify({ page: pageInfo, exportDate: new Date().toISOString(), streams: arr }, null, 2);
            mime = 'application/json'; filename = pageInfo.title + '_streams.json';
        } else if (format === 'csv') {
            content = 'Type,URL,Source,Title\n' + arr.map(a => a.type + ',"' + a.url + '",' + a.source + ',"' + a.title + '"').join('\n');
            mime = 'text/csv'; filename = pageInfo.title + '_streams.csv';
        } else if (format === 'm3u') {
            content = '#EXTM3U\n' + arr.filter(a => a.type !== 'IFRAME').map(a => '#EXTINF:-1,' + a.title + ' [' + a.type + ']\n' + a.url).join('\n');
            mime = 'audio/x-mpegurl'; filename = pageInfo.title + '.m3u';
        } else {
            content = arr.map(a => a.url).join('\n');
            mime = 'text/plain'; filename = pageInfo.title + '_urls.txt';
        }
        var blob = new Blob([content], { type: mime });
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = filename;
        a.click();
        URL.revokeObjectURL(a.href);
        toast('Đã export ' + format.toUpperCase());
    }

    // ========== PREVIEW WITH CUSTOM PLAYER ==========
    function showPreview(url) {
        var overlay = document.createElement('div');
        overlay.className = 'uvd-overlay';
        overlay.innerHTML = 
            '<div class="uvd-glass-panel uvd-preview-container" style="display:flex;flex-direction:column;height:100%;padding:0;">' +
                '<div class="uvd-preview-header">' +
                    '<span class="uvd-icon-play"></span>' +
                    '<span style="margin-left:8px;font-weight:600;">Preview Stream</span>' +
                    '<button class="uvd-btn-icon uvd-close-btn" style="margin-left:auto;"></button>' +
                '</div>' +
                '<div class="uvd-video-wrapper">' +
                    '<video id="__uvd_pv__" class="uvd-video"></video>' +
                    '<div class="uvd-controls" id="__uvd_ctrls__" style="display:none;">' +
                        '<button class="uvd-ctrl-btn" id="__uvd_play__">' +
                            '<svg width="16" height="16" viewBox="0 0 16 16"><polygon points="4,2 13,8 4,14" fill="white"/></svg>' +
                        '</button>' +
                        '<div class="uvd-timeline" id="__uvd_timeline__">' +
                            '<div class="uvd-progress" id="__uvd_progress__"></div>' +
                        '</div>' +
                        '<span class="uvd-time" id="__uvd_time__">00:00 / 00:00</span>' +
                        '<div class="uvd-volume">' +
                            '<svg width="14" height="14" viewBox="0 0 24 24" fill="white"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/></svg>' +
                            '<input type="range" class="uvd-volume-slider" id="__uvd_vol__" min="0" max="1" step="0.05" value="1">' +
                        '</div>' +
                        '<button class="uvd-ctrl-btn" id="__uvd_fs__">' +
                            '<svg width="14" height="14" viewBox="0 0 16 16"><path d="M1 1h5v2H3v3H1V1zm10 0h5v5h-2V3h-3V1zM1 11h2v3h3v2H1v-5zm12 3h-3v2h5v-5h-2v3z" fill="white"/></svg>' +
                        '</button>' +
                    '</div>' +
                '</div>' +
            '</div>';

        document.body.appendChild(overlay);
        var video = document.getElementById('__uvd_pv__');
        var controls = document.getElementById('__uvd_ctrls__');
        var playBtn = document.getElementById('__uvd_play__');
        var timeline = document.getElementById('__uvd_timeline__');
        var progress = document.getElementById('__uvd_progress__');
        var timeDisplay = document.getElementById('__uvd_time__');
        var volumeSlider = document.getElementById('__uvd_vol__');
        var fsBtn = document.getElementById('__uvd_fs__');

        function loadMedia() {
            if (url.includes('.m3u8')) {
                if (window.Hls) {
                    if (Hls.isSupported()) {
                        var hls = new Hls();
                        hls.loadSource(url);
                        hls.attachMedia(video);
                        hls.on(Hls.Events.MANIFEST_PARSED, () => {
                            controls.style.display = 'flex';
                        });
                    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
                        video.src = url;
                    }
                } else {
                    var s = document.createElement('script');
                    s.src = 'https://cdn.jsdelivr.net/npm/hls.js@latest';
                    s.onload = loadMedia;
                    document.head.appendChild(s);
                    return;
                }
            } else {
                video.src = url;
            }
            controls.style.display = 'flex';
        }

        function formatTime(s) {
            var m = Math.floor(s / 60);
            var sec = Math.floor(s % 60);
            return (m < 10 ? '0' : '') + m + ':' + (sec < 10 ? '0' : '') + sec;
        }

        video.addEventListener('loadedmetadata', function() {
            timeDisplay.textContent = '00:00 / ' + formatTime(video.duration);
        });
        video.addEventListener('timeupdate', function() {
            var pct = (video.currentTime / video.duration) * 100 || 0;
            progress.style.width = pct + '%';
            timeDisplay.textContent = formatTime(video.currentTime) + ' / ' + formatTime(video.duration);
        });
        timeline.addEventListener('click', function(e) {
            var rect = timeline.getBoundingClientRect();
            var pos = (e.clientX - rect.left) / rect.width;
            video.currentTime = pos * video.duration;
        });
        playBtn.addEventListener('click', function() {
            if (video.paused) {
                video.play();
                playBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 16 16"><rect x="3" y="2" width="4" height="12" fill="white"/><rect x="9" y="2" width="4" height="12" fill="white"/></svg>';
            } else {
                video.pause();
                playBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 16 16"><polygon points="4,2 13,8 4,14" fill="white"/></svg>';
            }
        });
        volumeSlider.addEventListener('input', function() {
            video.volume = this.value;
        });
        fsBtn.addEventListener('click', function() {
            if (video.requestFullscreen) video.requestFullscreen();
            else if (video.webkitRequestFullscreen) video.webkitRequestFullscreen();
        });

        overlay.querySelector('.uvd-close-btn').onclick = function() {
            video.pause();
            video.src = '';
            overlay.remove();
        };
        loadMedia();
    }

    // ========== BUILD MAIN UI (GLASS) ==========
    function buildUI() {
        var arr = [...urls.entries()].map(function(e) {
            return { url: e[0], type: e[1].type, source: e[1].source, priority: e[1].priority };
        }).sort(function(a, b) { return a.priority - b.priority; });

        var panel = document.getElementById('__uvd__');
        if (panel) panel.remove();

        // Inject global CSS
        if (!document.getElementById('__uvd_css__')) {
            var style = document.createElement('style');
            style.id = '__uvd_css__';
            style.textContent = `
                :root {
                    --uvd-bg: rgba(10, 15, 25, 0.75);
                    --uvd-glass: rgba(255, 255, 255, 0.06);
                    --uvd-border: rgba(255, 255, 255, 0.12);
                    --uvd-text: #eef5ff;
                    --uvd-text2: #b0c4de;
                    --uvd-text3: #7a8fa6;
                    --uvd-accent: #3b82f6;
                    --uvd-accent2: #8b5cf6;
                    --uvd-danger: #ef4444;
                    --uvd-gold: #f59e0b;
                    --uvd-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
                }
                @keyframes uvdSlide{from{transform:translate(-50%,-20px);opacity:0}to{transform:translate(-50%,0);opacity:1}}
                @keyframes uvdPulse{0%,100%{opacity:1}50%{opacity:0.4}}
                .uvd-toast {
                    position:fixed;top:20px;left:50%;transform:translateX(-50%);
                    background:var(--uvd-accent);color:#fff;padding:12px 24px;
                    border-radius:30px;z-index:2147483649;font:600 13px 'Segoe UI',sans-serif;
                    backdrop-filter:blur(10px);box-shadow:0 4px 15px rgba(0,0,0,0.5);
                    animation:uvdSlide 0.3s;
                }
                .uvd-overlay {
                    position:fixed;inset:0;background:rgba(0,0,0,0.8);
                    backdrop-filter:blur(12px);z-index:2147483648;
                    display:flex;flex-direction:column;padding:12px;
                }
                .uvd-glass-panel {
                    background:var(--uvd-glass);backdrop-filter:blur(24px);
                    border:1px solid var(--uvd-border);border-radius:20px;
                    box-shadow:var(--uvd-shadow);color:var(--uvd-text);
                    overflow:hidden;font-family:'Segoe UI',system-ui,-apple-system,sans-serif;
                }
                .uvd-scroll::-webkit-scrollbar{width:5px}
                .uvd-scroll::-webkit-scrollbar-thumb{background:var(--uvd-accent);border-radius:3px}
                .uvd-scroll::-webkit-scrollbar-track{background:transparent}
                .uvd-btn {
                    background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.15);
                    color:var(--uvd-text);padding:8px 14px;border-radius:30px;
                    font-weight:600;font-size:13px;cursor:pointer;transition:all 0.2s;
                    backdrop-filter:blur(4px);
                }
                .uvd-btn:hover{background:rgba(255,255,255,0.2)}
                .uvd-btn-icon {
                    background:transparent;border:none;color:var(--uvd-text);
                    width:36px;height:36px;border-radius:50%;display:flex;align-items:center;
                    justify-content:center;cursor:pointer;font-size:18px;
                    transition:background 0.2s;
                }
                .uvd-btn-icon:hover{background:rgba(255,255,255,0.1)}
                .uvd-preview-container { display:flex;flex-direction:column;height:100% }
                .uvd-preview-header {
                    display:flex;align-items:center;padding:14px 20px;
                    background:rgba(255,255,255,0.03);border-bottom:1px solid var(--uvd-border);
                    font-weight:600;
                }
                .uvd-icon-play::before{content:'';display:inline-block;width:10px;height:10px;
                    background:var(--uvd-accent);border-radius:50%;box-shadow:0 0 10px var(--uvd-accent);}
                .uvd-close-btn::before{content:'✕';font-size:20px;font-weight:300;}
                .uvd-video-wrapper {
                    flex:1;display:flex;flex-direction:column;justify-content:center;
                    background:#000;position:relative;
                }
                .uvd-video { width:100%;max-height:70vh;background:#000;outline:none; }
                .uvd-controls {
                    display:flex;align-items:center;gap:10px;padding:10px 16px;
                    background:rgba(20,20,30,0.85);backdrop-filter:blur(20px);
                    border-top:1px solid rgba(255,255,255,0.1);
                }
                .uvd-ctrl-btn {
                    background:transparent;border:none;color:#fff;cursor:pointer;
                    padding:6px;display:flex;align-items:center;
                }
                .uvd-timeline {
                    flex:1;height:5px;background:rgba(255,255,255,0.2);
                    border-radius:5px;position:relative;cursor:pointer;
                }
                .uvd-progress {
                    height:100%;width:0;background:var(--uvd-accent);
                    border-radius:5px;box-shadow:0 0 8px var(--uvd-accent);
                }
                .uvd-time { color:var(--uvd-text2);font-size:12px;min-width:90px;text-align:right; }
                .uvd-volume { display:flex;align-items:center;gap:6px; }
                .uvd-volume-slider { width:60px;accent-color:var(--uvd-accent); }
                .uvd-tab-active {
                    border-bottom:2px solid var(--uvd-accent) !important;
                    color:var(--uvd-text) !important;
                }
                .uvd-card {
                    background:rgba(255,255,255,0.05);backdrop-filter:blur(8px);
                    border:1px solid rgba(255,255,255,0.08);border-radius:14px;
                    padding:14px;margin-bottom:10px;
                }
                .uvd-type-badge {
                    display:inline-block;padding:4px 12px;border-radius:20px;
                    font-size:11px;font-weight:700;letter-spacing:0.5px;
                    background:rgba(59,130,246,0.15);color:var(--uvd-accent);
                    border:1px solid rgba(59,130,246,0.3);
                }
                .uvd-url-box {
                    background:rgba(0,0,0,0.4);border-radius:8px;padding:8px;
                    font-family:'Fira Code',monospace;font-size:11px;word-break:break-all;
                    color:var(--uvd-text2);max-height:65px;overflow-y:auto;
                    border:1px solid rgba(255,255,255,0.05);
                }
                .uvd-grid-2 { display:grid;grid-template-columns:1fr 1fr;gap:8px; }
                .uvd-grid-3 { display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px; }
            `;
            document.head.appendChild(style);
        }

        panel = document.createElement('div');
        panel.id = '__uvd__';
        panel.className = 'uvd-glass-panel uvd-scroll';
        panel.style.cssText = 'position:fixed;top:15px;left:15px;right:15px;bottom:15px;z-index:2147483647;display:flex;flex-direction:column;';

        // Header
        var header = document.createElement('div');
        header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:16px 20px;background:rgba(255,255,255,0.04);border-bottom:1px solid var(--uvd-border);';
        header.innerHTML = 
            '<div>' +
                '<div style="display:flex;align-items:center;gap:10px;">' +
                    '<span class="uvd-live-dot" style="width:10px;height:10px;background:var(--uvd-accent);border-radius:50%;box-shadow:0 0 12px var(--uvd-accent);animation:uvdPulse 2s infinite;"></span>' +
                    '<span style="font-weight:700;font-size:16px;">Universal DL <span style="background:linear-gradient(135deg,var(--uvd-accent),var(--uvd-accent2));-webkit-background-clip:text;color:transparent;">V3</span></span>' +
                '</div>' +
                '<div style="font-size:11px;color:var(--uvd-text3);margin-top:2px;margin-left:20px;">' + arr.length + ' streams · ' + pageInfo.host + '</div>' +
            '</div>' +
            '<div style="display:flex;gap:8px;">' +
                '<button class="uvd-btn-icon" id="__uvd_refresh__" title="Refresh">' +
                    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 4v6h6M23 20v-6h-6"/><path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"/></svg>' +
                '</button>' +
                '<button class="uvd-btn-icon" id="__uvd_close__" title="Close">' +
                    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>' +
                '</button>' +
            '</div>';
        panel.appendChild(header);

        // Tabs
        var tabs = document.createElement('div');
        tabs.style.cssText = 'display:flex;background:rgba(0,0,0,0.2);padding:0 10px;';
        var tabNames = [
            { id: 'streams', text: 'Streams (' + arr.length + ')' },
            { id: 'favorites', text: 'Favorites (' + data.favorites.length + ')' },
            { id: 'history', text: 'History (' + (data.history||[]).length + ')' },
            { id: 'settings', text: 'Settings' }
        ];
        tabNames.forEach(function(t) {
            var b = document.createElement('button');
            b.className = 'uvd-btn';
            b.dataset.tab = t.id;
            b.textContent = t.text;
            b.style.cssText = 'flex:1;background:transparent;border:none;padding:12px 5px;font-size:12px;border-radius:0;border-bottom:2px solid transparent;transition:0.2s;';
            tabs.appendChild(b);
        });
        panel.appendChild(tabs);

        // Info bar
        var info = document.createElement('div');
        info.style.cssText = 'padding:10px 16px;background:rgba(0,0,0,0.15);font-size:12px;';
        info.innerHTML = 
            '<span style="color:var(--uvd-text2);">Tiêu đề: </span>' +
            '<span id="__uvd_title__" style="color:var(--uvd-accent);text-decoration:underline;cursor:pointer;">' + pageInfo.title + '</span>' +
            ' <span style="color:var(--uvd-text3);">(sửa)</span>' +
            '<br><span style="color:var(--uvd-text2);">Referer: </span>' +
            '<span id="__uvd_referer__" style="color:var(--uvd-accent2);font-family:monospace;text-decoration:underline;cursor:pointer;">' + pageInfo.referer + '</span>';
        panel.appendChild(info);

        // Content
        var content = document.createElement('div');
        content.id = '__uvd_content__';
        content.className = 'uvd-scroll';
        content.style.cssText = 'flex:1;overflow-y:auto;padding:12px 16px;';
        panel.appendChild(content);

        // Footer
        var footer = document.createElement('div');
        footer.style.cssText = 'display:flex;gap:6px;padding:10px;background:rgba(0,0,0,0.2);border-top:1px solid var(--uvd-border);flex-wrap:wrap;';
        ['TXT','JSON','M3U','CSV'].forEach(function(f) {
            var btn = document.createElement('button');
            btn.className = 'uvd-btn';
            btn.textContent = f;
            btn.id = '__uvd_export_' + f.toLowerCase() + '__';
            btn.style.cssText = 'flex:1;min-width:60px;';
            footer.appendChild(btn);
        });
        panel.appendChild(footer);
        document.body.appendChild(panel);

        // Render logic
        var currentTab = 'streams';
        function renderTab(tabId) {
            currentTab = tabId;
            document.querySelectorAll('[data-tab]').forEach(function(t) {
                if (t.dataset.tab === tabId) t.classList.add('uvd-tab-active');
                else t.classList.remove('uvd-tab-active');
            });
            content.innerHTML = '';
            if (tabId === 'streams') renderStreams(content, arr);
            else if (tabId === 'favorites') renderFavorites(content);
            else if (tabId === 'history') renderHistory(content);
            else if (tabId === 'settings') renderSettings(content);
        }

        document.querySelectorAll('[data-tab]').forEach(function(t) {
            t.onclick = function() { renderTab(this.dataset.tab); };
        });
        renderTab('streams');

        // Header events
        document.getElementById('__uvd_close__').onclick = function() { stopMonitor(); panel.remove(); };
        document.getElementById('__uvd_refresh__').onclick = function() { buildUI(); toast('Refreshed'); };
        document.getElementById('__uvd_title__').onclick = function() {
            var newTitle = prompt('Tên file:', pageInfo.title);
            if (newTitle) {
                pageInfo.title = newTitle.replace(/[^\w\s\u00C0-\u1EF9.-]/g, '').substring(0,100);
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
                toast('Đã lưu Referer cho ' + pageInfo.host);
            }
        };
        ['txt','json','m3u','csv'].forEach(function(f) {
            document.getElementById('__uvd_export_' + f + '__').onclick = function() { exportData(f); };
        });
    }

    // ========== RENDER STREAMS ==========
    function renderStreams(container, arr) {
        if (!arr.length) {
            container.innerHTML = '<div style="text-align:center;padding:40px;color:var(--uvd-text2);">Chưa phát hiện stream nào.<br><small>Đang monitor... Phát video hoặc tải thêm nội dung.</small></div>';
            return;
        }
        arr.forEach(function(item, i) {
            var url = item.url;
            var type = item.type;
            var card = document.createElement('div');
            card.className = 'uvd-card';
            card.innerHTML = 
                '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">' +
                    '<span class="uvd-type-badge">#' + (i+1) + ' ' + type + '</span>' +
                    '<div style="display:flex;align-items:center;gap:8px;">' +
                        '<span style="font-size:10px;color:var(--uvd-text3);">' + item.source + '</span>' +
                        '<button class="uvd-fav-btn" data-url="' + encodeURIComponent(url) + '" data-type="' + type + '" style="background:transparent;border:none;font-size:18px;cursor:pointer;color:' + (isFavorite(url) ? 'var(--uvd-gold)' : 'var(--uvd-text3)') + ';">' + (isFavorite(url) ? '★' : '☆') + '</button>' +
                    '</div>' +
                '</div>' +
                '<div class="uvd-url-box">' + url + '</div>' +
                '<div class="uvd-grid-2" style="margin-top:10px;">' +
                    '<button class="uvd-btn" data-action="share" data-url="' + encodeURIComponent(url) + '" style="background:var(--uvd-accent2);">Share</button>' +
                    '<button class="uvd-btn" data-action="copy" data-url="' + encodeURIComponent(url) + '">Copy</button>' +
                    (type === 'IFRAME' ? 
                        '<a href="' + url + '" class="uvd-btn" style="text-align:center;grid-column:1/3;text-decoration:none;">➔ Vào iframe</a>' :
                        (type === 'M3U8' ? 
                            '<button class="uvd-btn" data-action="quality" data-url="' + encodeURIComponent(url) + '">Chất lượng</button>' +
                            '<button class="uvd-btn" data-action="preview" data-url="' + encodeURIComponent(url) + '">Preview</button>' +
                            '<button class="uvd-btn" data-action="cmd" data-url="' + encodeURIComponent(url) + '" data-type="' + type + '" style="grid-column:1/3;">Tất cả lệnh</button>' :
                            '<button class="uvd-btn" data-action="preview" data-url="' + encodeURIComponent(url) + '">Preview</button>' +
                            '<button class="uvd-btn" data-action="cmd" data-url="' + encodeURIComponent(url) + '" data-type="' + type + '">Lệnh</button>'
                        )
                    ) +
                '</div>';
            container.appendChild(card);
        });

        // Bind events for streams tab
        container.querySelectorAll('.uvd-fav-btn').forEach(function(b) {
            b.onclick = function() {
                var u = decodeURIComponent(this.dataset.url);
                var isFav = toggleFavorite(u, this.dataset.type);
                this.textContent = isFav ? '★' : '☆';
                this.style.color = isFav ? 'var(--uvd-gold)' : 'var(--uvd-text3)';
            };
        });
        container.querySelectorAll('.uvd-btn[data-action]').forEach(function(b) {
            b.onclick = function() {
                var u = decodeURIComponent(this.dataset.url);
                var action = this.dataset.action;
                var t = this.dataset.type;
                addToHistory(u, t || 'IFRAME');
                if (action === 'share') shareUrl(u);
                else if (action === 'copy') { showEditor(u, 'Copy'); }
                else if (action === 'quality') showQualityPicker(u);
                else if (action === 'preview') showPreview(u);
                else if (action === 'cmd') showCommandPicker(u, t);
            };
        });
    }

    function showCommandPicker(url, type) {
        var cmds = makeCommands(url, type, pageInfo.title);
        var overlay = document.createElement('div');
        overlay.className = 'uvd-overlay';
        var html = '<div class="uvd-glass-panel" style="padding:20px;max-width:600px;margin:auto;width:100%;">';
        html += '<div style="font-weight:700;font-size:16px;margin-bottom:16px;">Chọn lệnh tải</div>';
        Object.keys(cmds).forEach(function(k) {
            var c = cmds[k];
            html += '<div class="uvd-card" style="margin-bottom:10px;">' +
                '<div style="font-weight:600;color:var(--uvd-accent);">' + c.label + '</div>' +
                '<div class="uvd-url-box" style="margin:6px 0;">' + c.cmd + '</div>' +
                '<button class="uvd-btn cmd-select" data-cmd="' + encodeURIComponent(c.cmd) + '" style="width:100%;">Chọn & sửa</button>' +
            '</div>';
        });
        html += '<button class="uvd-btn close-overlay" style="width:100%;background:var(--uvd-danger);">Đóng</button></div>';
        overlay.innerHTML = html;
        document.body.appendChild(overlay);

        overlay.querySelector('.close-overlay').onclick = function() { overlay.remove(); };
        overlay.querySelectorAll('.cmd-select').forEach(function(b) {
            b.onclick = function() {
                var cmd = decodeURIComponent(this.dataset.cmd);
                overlay.remove();
                showEditor(cmd, 'Lệnh');
            };
        });
    }

    function showEditor(text, title) {
        var overlay = document.createElement('div');
        overlay.className = 'uvd-overlay';
        overlay.innerHTML = 
            '<div class="uvd-glass-panel" style="padding:20px;max-width:600px;margin:auto;width:100%;">' +
                '<div style="font-weight:700;margin-bottom:8px;">' + title + '</div>' +
                '<textarea id="__uvd_edit__" style="width:100%;height:120px;background:rgba(0,0,0,0.5);border:1px solid var(--uvd-border);border-radius:10px;color:var(--uvd-text);padding:12px;font-family:monospace;resize:vertical;">' + text.replace(/</g,'&lt;') + '</textarea>' +
                '<div class="uvd-grid-2" style="margin-top:12px;">' +
                    '<button class="uvd-btn" id="__uvd_ed_copy__">Copy</button>' +
                    '<button class="uvd-btn" id="__uvd_ed_share__" style="background:var(--uvd-accent2);">Share</button>' +
                '</div>' +
                '<button class="uvd-btn close-overlay" style="width:100%;margin-top:8px;background:var(--uvd-danger);">Hủy</button>' +
            '</div>';
        document.body.appendChild(overlay);
        var ta = document.getElementById('__uvd_edit__');
        ta.focus();
        document.getElementById('__uvd_ed_copy__').onclick = function() { copy(ta.value); overlay.remove(); toast('Đã copy!'); };
        document.getElementById('__uvd_ed_share__').onclick = function() { var v = ta.value; overlay.remove(); shareUrl(v); };
        overlay.querySelector('.close-overlay').onclick = function() { overlay.remove(); };
    }

    function showQualityPicker(url) {
        var overlay = document.createElement('div');
        overlay.className = 'uvd-overlay';
        overlay.innerHTML = '<div class="uvd-glass-panel" style="padding:20px;max-width:600px;margin:auto;width:100%;"><div style="text-align:center;padding:20px;">Đang phân tích M3U8...</div></div>';
        document.body.appendChild(overlay);

        parseM3U8Master(url, function(qualities) {
            if (!qualities) {
                overlay.querySelector('.uvd-glass-panel').innerHTML = 
                    '<div style="font-weight:700;color:var(--uvd-danger);margin-bottom:10px;">Không phải Master Playlist</div>' +
                    '<p style="color:var(--uvd-text2);">Stream đơn, không có nhiều chất lượng.</p>' +
                    '<button class="uvd-btn close-overlay" style="background:var(--uvd-danger);width:100%;">Đóng</button>';
                overlay.querySelector('.close-overlay').onclick = function() { overlay.remove(); };
                return;
            }
            var html = '<div style="font-weight:700;margin-bottom:12px;">Chọn chất lượng (' + qualities.length + ')</div>';
            qualities.forEach(function(q) {
                html += '<div class="uvd-card" style="margin-bottom:8px;">' +
                    '<div style="display:flex;justify-content:space-between;"><b>' + q.label + '</b><span style="color:var(--uvd-text3);">' + Math.round(q.bandwidth/1000) + 'kbps</span></div>' +
                    '<div style="font-size:11px;color:var(--uvd-text3);">' + q.resolution + (q.codecs ? ' · ' + q.codecs : '') + '</div>' +
                    '<div class="uvd-grid-2" style="margin-top:8px;">' +
                        '<button class="uvd-btn q-act" data-url="' + encodeURIComponent(q.url) + '" data-action="share" style="background:var(--uvd-accent2);">Share</button>' +
                        '<button class="uvd-btn q-act" data-url="' + encodeURIComponent(q.url) + '" data-action="cmd">Lệnh</button>' +
                    '</div>' +
                '</div>';
            });
            html += '<button class="uvd-btn close-overlay" style="width:100%;background:var(--uvd-danger);">Đóng</button>';
            overlay.querySelector('.uvd-glass-panel').innerHTML = html;
            overlay.querySelector('.close-overlay').onclick = function() { overlay.remove(); };
            overlay.querySelectorAll('.q-act').forEach(function(b) {
                b.onclick = function() {
                    var u = decodeURIComponent(this.dataset.url);
                    var act = this.dataset.action;
                    overlay.remove();
                    if (act === 'share') shareUrl(u);
                    else showCommandPicker(u, 'M3U8');
                };
            });
        });
    }

    // ========== FAVORITES, HISTORY, SETTINGS ==========
    function renderFavorites(container) {
        if (!data.favorites.length) {
            container.innerHTML = '<div style="text-align:center;padding:30px;color:var(--uvd-text2);">Chưa có favorites. Nhấn ☆ để thêm.</div>';
            return;
        }
        data.favorites.forEach(function(f, i) {
            var card = document.createElement('div');
            card.className = 'uvd-card';
            card.innerHTML = 
                '<div style="display:flex;justify-content:space-between;"><b style="color:var(--uvd-gold);">★ ' + f.type + '</b><span style="color:var(--uvd-text3);font-size:11px;">' + new Date(f.timestamp).toLocaleDateString() + '</span></div>' +
                '<div style="margin:4px 0;">' + f.title + '</div>' +
                '<div class="uvd-url-box" style="margin-bottom:8px;">' + f.url + '</div>' +
                '<div class="uvd-grid-3">' +
                    '<button class="uvd-btn fav-act" data-url="' + encodeURIComponent(f.url) + '" data-action="share" style="background:var(--uvd-accent2);">Share</button>' +
                    '<button class="uvd-btn fav-act" data-url="' + encodeURIComponent(f.url) + '" data-action="copy">Copy</button>' +
                    '<button class="uvd-btn fav-del" data-idx="' + i + '" style="background:var(--uvd-danger);">Xóa</button>' +
                '</div>';
            container.appendChild(card);
        });
        container.querySelectorAll('.fav-act').forEach(function(b) {
            b.onclick = function() {
                var u = decodeURIComponent(this.dataset.url);
                if (this.dataset.action === 'share') shareUrl(u);
                else { copy(u); toast('Copied'); }
            };
        });
        container.querySelectorAll('.fav-del').forEach(function(b) {
            b.onclick = function() {
                data.favorites.splice(parseInt(this.dataset.idx), 1);
                storage.set(data);
                renderFavorites(container);
                toast('Đã xóa');
            };
        });
    }

    function renderHistory(container) {
        var h = data.history || [];
        if (!h.length) {
            container.innerHTML = '<div style="text-align:center;padding:30px;color:var(--uvd-text2);">Chưa có lịch sử.</div>';
            return;
        }
        container.innerHTML = '<button class="uvd-btn" id="__uvd_clear_hist__" style="width:100%;margin-bottom:10px;background:var(--uvd-danger);">Xóa tất cả lịch sử</button>';
        document.getElementById('__uvd_clear_hist__').onclick = function() {
            if (confirm('Xóa toàn bộ lịch sử?')) { data.history = []; storage.set(data); renderHistory(container); }
        };
        h.forEach(function(item) {
            var card = document.createElement('div');
            card.className = 'uvd-card';
            card.innerHTML = 
                '<div style="display:flex;justify-content:space-between;"><b style="color:var(--uvd-accent);">' + item.type + '</b><span style="color:var(--uvd-text3);font-size:11px;">' + new Date(item.timestamp).toLocaleString() + '</span></div>' +
                '<div>' + item.title + '</div><div class="uvd-url-box">' + item.url + '</div>';
            container.appendChild(card);
        });
    }

    function renderSettings(container) {
        var html = '<div style="font-weight:700;margin-bottom:14px;">⚙ Settings</div>';
        html += '<div class="uvd-card"><div style="font-weight:600;margin-bottom:8px;">Theme</div><div class="uvd-grid-2">';
        ['glass-dark','glass-light','glass-purple'].forEach(function(t) {
            html += '<button class="uvd-btn theme-btn" data-theme="' + t + '" style="' + (data.theme === t ? 'background:var(--uvd-accent);' : '') + '">' + t.replace('glass-','') + '</button>';
        });
        html += '</div></div>';
        html += '<div class="uvd-card"><div style="font-weight:600;margin-bottom:8px;">Site Profiles</div>';
        var profiles = Object.keys(data.siteProfiles);
        if (!profiles.length) html += '<div style="color:var(--uvd-text3);">Chưa có profile.</div>';
        else profiles.forEach(function(p) {
            html += '<div style="margin-bottom:6px;"><b>' + p + '</b><br><span style="font-size:11px;">' + data.siteProfiles[p].referer + '</span> <button class="uvd-btn del-prof" data-host="' + p + '" style="font-size:10px;padding:2px 8px;background:var(--uvd-danger);">Xóa</button></div>';
        });
        html += '</div>';
        html += '<div class="uvd-card"><button class="uvd-btn" id="__uvd_backup__" style="width:100%;margin-bottom:6px;">Export data</button><button class="uvd-btn" id="__uvd_restore__" style="width:100%;margin-bottom:6px;">Import data</button><button class="uvd-btn" id="__uvd_reset__" style="width:100%;background:var(--uvd-danger);">Reset toàn bộ</button></div>';
        container.innerHTML = html;

        container.querySelectorAll('.theme-btn').forEach(function(b) {
            b.onclick = function() {
                data.theme = this.dataset.theme;
                storage.set(data);
                buildUI();
                toast('Theme: ' + data.theme);
            };
        });
        container.querySelectorAll('.del-prof').forEach(function(b) {
            b.onclick = function() {
                delete data.siteProfiles[this.dataset.host];
                storage.set(data);
                renderSettings(container);
                toast('Đã xóa profile');
            };
        });
        document.getElementById('__uvd_backup__').onclick = function() {
            var blob = new Blob([JSON.stringify(data)],{type:'application/json'});
            var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'uvd_backup.json'; a.click();
        };
        document.getElementById('__uvd_restore__').onclick = function() {
            var inp = document.createElement('input'); inp.type='file'; inp.accept='.json';
            inp.onchange = function(e) {
                var reader = new FileReader();
                reader.onload = function(ev) {
                    try { data = Object.assign(data, JSON.parse(ev.target.result)); storage.set(data); toast('Đã import'); buildUI(); }
                    catch(ex) { toast('File không hợp lệ','var(--uvd-danger)'); }
                };
                reader.readAsText(e.target.files[0]);
            };
            inp.click();
        };
        document.getElementById('__uvd_reset__').onclick = function() {
            if (confirm('Xóa toàn bộ dữ liệu?')) { localStorage.removeItem(STORAGE_KEY); data = {favorites:[],theme:'glass-dark',siteProfiles:{},history:[]}; buildUI(); }
        };
    }

    buildUI();
    var lastCount = urls.size;
    var autoRefresh = setInterval(function() {
        if (!document.getElementById('__uvd__')) { clearInterval(autoRefresh); stopMonitor(); return; }
        if (urls.size !== lastCount) {
            lastCount = urls.size;
            // Có thể cập nhật badge nhẹ nhàng
        }
    }, 2000);
    console.log('Universal DL V3 Glass Edition loaded. Found', urls.size, 'streams.');
    toast('V3 Glass Ready');
})();