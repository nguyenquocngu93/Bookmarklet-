/**
 * Universal Video Downloader V5.0 – Liquid Glass Rebuild
 * - Dark frosted-glass UI: drifting light blobs behind panels, gradient
 *   segmented tab bar, glossy pill buttons — see the <style> block below
 * - Fullscreen no longer fights the phone: removed the orientation-lock /
 *   force-rotate hack that was trapping the player in portrait
 * Author: nguyenquocngu93
 */
(function() {
    'use strict';

    // ========== INIT ==========
    var old = document.getElementById('__uvd__');
    if (old) old.remove();
    var minBtn = document.getElementById('__uvd_min_float__');
    if (minBtn) minBtn.remove();

    var STORAGE_KEY = 'uvd_data_v41';
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
    data.siteProfiles = data.siteProfiles || {};
    data.history = data.history || [];

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
    try { performance.getEntriesByType('resource').forEach(function(e) { findUrls(e.name, 'network:perf'); }); } catch(e) {}
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
                        var quality = resolution.split('x')[1] || bandwidth;
                        var qualityLabel = resolution === 'unknown' ? Math.round(bandwidth/1000) + 'kbps' : quality + 'p';
                        var streamUrl = nextLine;
                        if (!streamUrl.startsWith('http')) {
                            var baseUrl = url.substring(0, url.lastIndexOf('/') + 1);
                            streamUrl = baseUrl + streamUrl;
                        }
                        qualities.push({ label: qualityLabel, resolution: resolution, bandwidth: bandwidth, codecs: codecs, url: streamUrl });
                    }
                }
            }
            qualities.sort(function(a, b) { return (parseInt(b.resolution.split('x')[1]) || 0) - (parseInt(a.resolution.split('x')[1]) || 0); });
            callback(qualities);
        }).catch(function(e) { console.error(e); callback(null); });
    }

    // ========== COMMANDS ==========
    function makeCommands(url, type, title) {
        var t = title;
        var ext = type.toLowerCase() === 'iframe' ? 'mp4' : type.toLowerCase();
        var ref = pageInfo.referer;
        var origin = pageInfo.origin;
        var ua = pageInfo.userAgent;
        return {
            'yt-dlp': { label: 'yt-dlp (cơ bản)', cmd: 'yt-dlp --referer "' + ref + '" -o "' + t + '.%(ext)s" "' + url + '"' },
            'yt-dlp-bypass': { label: 'yt-dlp (bypass)', cmd: 'yt-dlp --force-ipv4 --no-check-certificate --user-agent "' + ua + '" --referer "' + ref + '" --add-header "Origin: ' + origin + '" -f "bv*+ba/best" --merge-output-format mp4 -o "' + t + '.%(ext)s" "' + url + '"' },
            'yt-dlp-aria': { label: 'yt-dlp + aria2', cmd: 'yt-dlp --referer "' + ref + '" --downloader aria2c -o "' + t + '.%(ext)s" "' + url + '"' },
            'ffmpeg': { label: 'FFmpeg', cmd: 'ffmpeg -headers "Referer: ' + ref + '\\r\\nOrigin: ' + origin + '" -i "' + url + '" -c copy "' + t + '.mp4"' },
            'curl': { label: 'cURL', cmd: 'curl -H "Referer: ' + ref + '" -o "' + t + '.' + ext + '" "' + url + '"' }
        };
    }

    // ========== UTILS ==========
    function copy(text) {
        var ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove();
    }

    function toast(msg, color) {
        var el = document.createElement('div');
        el.textContent = msg;
        el.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);background:' + (color || '#3b82f6') + ';color:#fff;padding:12px 24px;border-radius:30px;z-index:2147483649;font:600 13px Segoe UI;box-shadow:0 4px 15px rgba(0,0,0,0.4);animation:uvdSlideIn 0.3s ease;';
        document.body.appendChild(el);
        setTimeout(function() { el.remove(); }, 2500);
    }

    function shareUrl(url) {
        if (navigator.share) navigator.share({ title: pageInfo.title, url: url }).catch(function() { copy(url); toast('Copied'); });
        else { copy(url); toast('Copied – Open YTDLnis'); }
    }

    function addToHistory(url, type) {
        data.history = data.history || [];
        data.history.unshift({ url, type, title: pageInfo.title, host: pageInfo.host, timestamp: Date.now() });
        if (data.history.length > 50) data.history = data.history.slice(0, 50);
        storage.set(data);
    }

    function isFavorite(url) { return data.favorites.some(function(f) { return f.url === url; }); }

    function toggleFavorite(url, type) {
        var idx = data.favorites.findIndex(function(f) { return f.url === url; });
        if (idx >= 0) { data.favorites.splice(idx, 1); toast('Removed favorite'); }
        else { data.favorites.unshift({ url, type, title: pageInfo.title, host: pageInfo.host, timestamp: Date.now() }); toast('Added to favorites'); }
        storage.set(data);
        return isFavorite(url);
    }

    function exportData(format) {
        var arr = [...urls.entries()].map(function(e) { return { url: e[0], type: e[1].type, source: e[1].source, title: pageInfo.title }; });
        var content, mime, filename;
        if (format === 'json') {
            content = JSON.stringify({ page: pageInfo, streams: arr }, null, 2);
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
        var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename; a.click();
        URL.revokeObjectURL(a.href);
        toast('Exported ' + format.toUpperCase());
    }

    // ========== RIPPLE EFFECT ==========
    function addRipple(e) {
        var btn = e.currentTarget;
        var ripple = document.createElement('span');
        ripple.className = 'uvd-ripple';
        var rect = btn.getBoundingClientRect();
        var size = Math.max(rect.width, rect.height);
        ripple.style.width = ripple.style.height = size + 'px';
        ripple.style.left = (e.clientX - rect.left - size/2) + 'px';
        ripple.style.top = (e.clientY - rect.top - size/2) + 'px';
        btn.appendChild(ripple);
        ripple.addEventListener('animationend', function() { ripple.remove(); });
    }

    // ========== INLINE PLAYER (Fixed Fullscreen) ==========
    function showInlinePlayer(url, container) {
        container.innerHTML = '';
        container.style.display = 'flex';
        container.style.flexDirection = 'column';
        container.style.height = '100%';

        var backBtn = document.createElement('button');
        backBtn.className = 'uvd-btn';
        backBtn.textContent = '← Back to streams';
        backBtn.style.marginBottom = '10px';
        backBtn.style.padding = '8px 14px';
        backBtn.style.fontSize = '13px';
        backBtn.style.alignSelf = 'flex-start';
        backBtn.onclick = function() {
            if (activeHls) activeHls.destroy();
            container.innerHTML = '';
            container.style.display = 'none';
            document.getElementById('__uvd_stream_list__').style.display = 'block';
            activeHls = null;
        };
        container.appendChild(backBtn);

        var playerDiv = document.createElement('div');
        playerDiv.className = 'uvd-video-wrapper';
        playerDiv.style.flex = '1';
        playerDiv.innerHTML = 
            '<video id="__uvd_pv__" class="uvd-video" crossorigin="anonymous" playsinline webkit-playsinline></video>' +
            '<div class="uvd-controls" id="__uvd_ctrls__">' +
                '<button class="uvd-ctrl-btn" id="__uvd_play__">' +
                    '<svg width="20" height="20" viewBox="0 0 24 24"><polygon points="5,3 19,12 5,21" fill="white"/></svg>' +
                '</button>' +
                '<div class="uvd-timeline" id="__uvd_timeline__">' +
                    '<div class="uvd-progress" id="__uvd_progress__"></div>' +
                    '<div class="uvd-buffer" id="__uvd_buffer__"></div>' +
                '</div>' +
                '<span class="uvd-time" id="__uvd_time__">00:00 / 00:00</span>' +
                '<div class="uvd-volume">' +
                    '<svg width="18" height="18" viewBox="0 0 24 24" fill="white"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/></svg>' +
                    '<input type="range" class="uvd-volume-slider" id="__uvd_vol__" min="0" max="1" step="0.05" value="1">' +
                '</div>' +
                '<select class="uvd-speed-select" id="__uvd_speed__">' +
                    '<option value="0.5">0.5x</option><option value="0.75">0.75x</option><option value="1" selected>1x</option><option value="1.25">1.25x</option><option value="1.5">1.5x</option><option value="2">2x</option>' +
                '</select>' +
                '<select class="uvd-quality-select" id="__uvd_quality__" style="display:none;"></select>' +
                '<button class="uvd-ctrl-btn" id="__uvd_pip__" title="Picture-in-Picture">' +
                    '<svg width="16" height="16" viewBox="0 0 24 24"><path d="M19 11h-8v6h8v-6zm4 8V4.98C23 3.88 22.1 3 21 3H3c-1.1 0-2 .88-2 1.98V19c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2zm-2 .02H3V4.97h18v14.05z" fill="white"/></svg>' +
                '</button>' +
                '<button class="uvd-ctrl-btn" id="__uvd_fs__" title="Fullscreen">' +
                    '<svg width="18" height="18" viewBox="0 0 24 24"><path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z" fill="white"/></svg>' +
                '</button>' +
            '</div>';
        container.appendChild(playerDiv);

        var video = document.getElementById('__uvd_pv__');
        var controls = document.getElementById('__uvd_ctrls__');
        var playBtn = document.getElementById('__uvd_play__');
        var timeline = document.getElementById('__uvd_timeline__');
        var progress = document.getElementById('__uvd_progress__');
        var buffer = document.getElementById('__uvd_buffer__');
        var timeDisplay = document.getElementById('__uvd_time__');
        var volumeSlider = document.getElementById('__uvd_vol__');
        var speedSelect = document.getElementById('__uvd_speed__');
        var qualitySelect = document.getElementById('__uvd_quality__');
        var fsBtn = document.getElementById('__uvd_fs__');
        var pipBtn = document.getElementById('__uvd_pip__');
        var activeHls = null;

        function loadMedia() {
            if (url.includes('.m3u8')) {
                if (window.Hls && Hls.isSupported()) {
                    activeHls = new Hls();
                    activeHls.loadSource(url);
                    activeHls.attachMedia(video);
                    activeHls.on(Hls.Events.MANIFEST_PARSED, function() {
                        controls.style.display = 'flex';
                        var levels = activeHls.levels;
                        if (levels.length > 1) {
                            qualitySelect.style.display = 'inline-block';
                            qualitySelect.innerHTML = levels.map(function(lvl, i) {
                                var label = lvl.height ? lvl.height + 'p' : (lvl.bitrate ? Math.round(lvl.bitrate/1000) + 'kbps' : 'Auto');
                                return '<option value="' + i + '">' + label + '</option>';
                            }).join('');
                            qualitySelect.value = activeHls.currentLevel;
                            qualitySelect.onchange = function() { activeHls.currentLevel = parseInt(this.value); };
                        }
                    });
                } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
                    video.src = url;
                    controls.style.display = 'flex';
                } else {
                    var s = document.createElement('script');
                    s.src = 'https://cdn.jsdelivr.net/npm/hls.js@latest?t=' + Date.now();
                    s.onload = loadMedia;
                    document.head.appendChild(s);
                    return;
                }
            } else {
                video.src = url;
                controls.style.display = 'flex';
            }
        }

        function formatTime(s) {
            if (isNaN(s)) return '00:00';
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
        video.addEventListener('progress', function() {
            if (video.buffered.length > 0) {
                var bufferedEnd = video.buffered.end(video.buffered.length - 1);
                var duration = video.duration;
                if (duration > 0) buffer.style.width = (bufferedEnd / duration) * 100 + '%';
            }
        });
        timeline.addEventListener('click', function(e) {
            var rect = timeline.getBoundingClientRect();
            var pos = (e.clientX - rect.left) / rect.width;
            video.currentTime = pos * video.duration;
        });
        playBtn.addEventListener('click', function() {
            if (video.paused) {
                video.play();
                playBtn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16" fill="white"/><rect x="14" y="4" width="4" height="16" fill="white"/></svg>';
            } else {
                video.pause();
                playBtn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24"><polygon points="5,3 19,12 5,21" fill="white"/></svg>';
            }
        });
        volumeSlider.addEventListener('input', function() { video.volume = this.value; });
        speedSelect.addEventListener('change', function() { video.playbackRate = parseFloat(this.value); });

        // Fullscreen. Deliberately does NOT touch screen.orientation.lock() or
        // force any CSS rotation — that combination is exactly what was
        // trapping the player in portrait with no way to rotate landscape.
        // Native Fullscreen API + object-fit:contain (see stylesheet) already
        // adapts correctly to whichever way the phone is physically turned.
        function getFullscreenElement() {
            return document.fullscreenElement || document.webkitFullscreenElement ||
                   document.mozFullScreenElement || document.msFullscreenElement;
        }

        function requestFullscreen() {
            if (getFullscreenElement()) { exitFullscreen(); return; }
            var el = playerDiv; // fullscreen the whole player (video + controls)
            var req = el.requestFullscreen || el.webkitRequestFullscreen ||
                      el.mozRequestFullScreen || el.msRequestFullscreen;
            if (!req) { toast('Fullscreen không được hỗ trợ', 'var(--danger)'); return; }
            req.call(el);
        }

        function exitFullscreen() {
            var exit = document.exitFullscreen || document.webkitExitFullscreen ||
                       document.mozCancelFullScreen || document.msExitFullscreen;
            if (exit) exit.call(document);
        }

        function handleFullscreenChange() {
            var isFullscreen = getFullscreenElement() === playerDiv;
            playerDiv.classList.toggle('uvd-fullscreen', isFullscreen);
        }

        fsBtn.addEventListener('click', requestFullscreen);
        document.addEventListener('fullscreenchange', handleFullscreenChange);
        document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
        document.addEventListener('mozfullscreenchange', handleFullscreenChange);
        document.addEventListener('MSFullscreenChange', handleFullscreenChange);

        pipBtn.addEventListener('click', async function() {
            try {
                if (document.pictureInPictureElement) await document.exitPictureInPicture();
                else if (video.requestPictureInPicture) await video.requestPictureInPicture();
            } catch(e) {}
        });

        loadMedia();

        backBtn.addEventListener('click', function() {
            video.pause();
            if (activeHls) activeHls.destroy();
            video.src = '';
            document.removeEventListener('fullscreenchange', handleFullscreenChange);
            document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
            document.removeEventListener('mozfullscreenchange', handleFullscreenChange);
            document.removeEventListener('MSFullscreenChange', handleFullscreenChange);
        });
    }

    // ========== BUILD UI ==========
    if (document.getElementById('__uvd_css__')) document.getElementById('__uvd_css__').remove();
    var style = document.createElement('style');
    style.id = '__uvd_css__';
    style.textContent = `
        @keyframes uvdSlideIn{from{transform:translate(-50%,-20px);opacity:0}to{transform:translate(-50%,0);opacity:1}}
        @keyframes uvdPulse{0%,100%{opacity:1;box-shadow:0 0 5px var(--accent)}50%{opacity:0.4;box-shadow:0 0 20px var(--accent)}}
        @keyframes uvdFadeIn{from{opacity:0}to{opacity:1}}
        @keyframes uvdScaleIn{from{opacity:0;transform:scale(0.94)}to{opacity:1;transform:scale(1)}}
        @keyframes uvdSlideUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}
        @keyframes uvdRipple{to{transform:scale(4);opacity:0}}
        @keyframes uvdCardEnter{from{opacity:0;transform:translateY(15px)}to{opacity:1;transform:translateY(0)}}
        @keyframes uvdFloatBtnIn{from{transform:scale(0);opacity:0}to{transform:scale(1);opacity:1}}
        @keyframes uvdLiquidDrift {
            0%   { transform: translate(-6%, -4%) scale(1); }
            50%  { transform: translate(4%, 6%) scale(1.12); }
            100% { transform: translate(-6%, -4%) scale(1); }
        }
        :root {
            /* Liquid glass, dark — deep void behind frosted, light-catching panels. */
            --bg: rgba(6,7,12,0.94);
            --glass: rgba(22,24,36,0.55);
            --glass-hi: rgba(255,255,255,0.10);
            --border: rgba(255,255,255,0.14);
            --text: #f3f5ff;
            --text2: #a7afc9;
            --text3: #6d7590;
            --accent: #6d8cff;
            --accent2: #b98bff;
            --danger: #ff5d72;
            --gold: #ffb84d;
            --card-bg: rgba(255,255,255,0.05);
            --fs-xs: 11px;
            --fs-sm: 12px;
            --fs-base: 13px;
            --fs-md: 14px;
            --fs-lg: 16px;
            --radius-sm: 12px;
            --radius-md: 16px;
            --radius-lg: 26px;
            --grad-liquid: linear-gradient(135deg, var(--accent), var(--accent2));
        }
        * { box-sizing: border-box; }
        .uvd-overlay {
            position:fixed; inset:0; background:rgba(4,5,9,0.7);
            backdrop-filter:blur(22px) saturate(140%); z-index:2147483648;
            display:flex; align-items:center; justify-content:center;
            padding:16px; overflow-y:auto;
        }
        .uvd-glass-panel {
            background:var(--glass); backdrop-filter:blur(38px) saturate(160%);
            -webkit-backdrop-filter:blur(38px) saturate(160%);
            border:1px solid var(--border); border-radius:var(--radius-lg);
            box-shadow:0 25px 60px rgba(0,0,0,0.65), 0 0 0 1px rgba(255,255,255,0.04) inset,
                       0 1px 0 rgba(255,255,255,0.18) inset;
            color:var(--text); font-family:-apple-system,BlinkMacSystemFont,'SF Pro Display','Segoe UI',Roboto,sans-serif;
            font-size:var(--fs-base);
            padding:16px; width:100%; position:relative; overflow:hidden;
        }
        /* Signature element: two soft light blobs drifting behind the glass —
           this is what makes the panel read as "liquid" rather than flat dark UI. */
        .uvd-liquid-bg {
            position:absolute; inset:-30%; z-index:0; pointer-events:none;
            background:
                radial-gradient(closest-side, rgba(109,140,255,0.35), transparent 70%) 15% 20% / 55% 55% no-repeat,
                radial-gradient(closest-side, rgba(185,139,255,0.30), transparent 70%) 85% 75% / 60% 60% no-repeat;
            filter: blur(50px);
            animation: uvdLiquidDrift 16s ease-in-out infinite;
        }
        @media (prefers-reduced-motion: reduce) { .uvd-liquid-bg { animation: none; } }
        .uvd-panel-content { position:relative; z-index:1; display:flex; flex-direction:column; height:100%; min-height:0; }
        .uvd-video-wrapper { background:#000; border-radius:var(--radius-md); overflow:hidden; display:flex; flex-direction:column; position:relative; }
        .uvd-video { width:100%; display:block; max-height:55vh; background:#000; }
        .uvd-controls {
            display:flex; align-items:center; gap:10px; padding:12px 16px;
            background:rgba(14,15,22,0.75); backdrop-filter:blur(24px) saturate(160%);
            border-top:1px solid rgba(255,255,255,0.1); flex-wrap:wrap;
        }
        /* Real fullscreen: the browser makes .uvd-video-wrapper fill the screen
           when requestFullscreen() runs on it — no manual width/height math needed. */
        .uvd-video-wrapper:fullscreen,
        .uvd-video-wrapper:-webkit-full-screen,
        .uvd-video-wrapper.uvd-fullscreen {
            width:100vw; height:100vh; border-radius:0;
            justify-content:center; background:#000;
        }
        .uvd-video-wrapper:fullscreen .uvd-video,
        .uvd-video-wrapper:-webkit-full-screen .uvd-video,
        .uvd-video-wrapper.uvd-fullscreen .uvd-video {
            max-height:100vh; height:100%; width:100%; object-fit:contain; flex:1;
        }
        .uvd-video-wrapper:fullscreen .uvd-controls,
        .uvd-video-wrapper:-webkit-full-screen .uvd-controls,
        .uvd-video-wrapper.uvd-fullscreen .uvd-controls {
            position:absolute; bottom:0; left:0; right:0; z-index:2147483649;
        }
        /* Forced-landscape hack removed on purpose: it was fighting native
           fullscreen and trapping the player rotated/portrait no matter what
           the phone did. object-fit:contain above already adapts cleanly to
           whichever way the device is physically held, so nothing needs to
           force or lock an orientation anymore. */
        .uvd-ctrl-btn {
            background:transparent; border:none; color:#fff; cursor:pointer;
            padding:8px; display:flex; align-items:center; transition:0.2s; position:relative; overflow:hidden;
            border-radius:50%;
        }
        .uvd-ctrl-btn:hover { background:rgba(255,255,255,0.16); }
        .uvd-ctrl-btn:active { transform:scale(0.9); }
        .uvd-ctrl-btn.uvd-ctrl-active { background:var(--grad-liquid); box-shadow:0 0 12px rgba(109,140,255,0.6); }
        .uvd-timeline {
            flex:1; height:6px; background:rgba(255,255,255,0.16);
            border-radius:8px; position:relative; cursor:pointer; min-width:80px;
        }
        .uvd-progress {
            height:100%; width:0; background:var(--grad-liquid);
            border-radius:8px; position:absolute; left:0; top:0;
            box-shadow:0 0 10px rgba(109,140,255,0.7); z-index:2;
        }
        .uvd-buffer {
            height:100%; width:0; background:rgba(255,255,255,0.28);
            border-radius:8px; position:absolute; left:0; top:0; z-index:1;
        }
        .uvd-time { color:var(--text2); font-size:var(--fs-sm); min-width:90px; text-align:right; font-variant-numeric:tabular-nums; }
        .uvd-volume { display:flex; align-items:center; gap:6px; }
        .uvd-volume-slider { width:60px; accent-color:var(--accent); }
        .uvd-speed-select, .uvd-quality-select {
            background:rgba(255,255,255,0.1); border:1px solid var(--border);
            color:#fff; padding:6px 10px; border-radius:var(--radius-sm); font-size:var(--fs-sm);
            outline:none; cursor:pointer; transition:0.2s;
        }
        .uvd-scroll::-webkit-scrollbar{width:4px}
        .uvd-scroll::-webkit-scrollbar-thumb{background:var(--accent);border-radius:4px}
        .uvd-scroll::-webkit-scrollbar-track{background:transparent}
        .uvd-btn {
            background:var(--glass-hi); border:1px solid var(--border);
            color:var(--text); padding:9px 16px; border-radius:var(--radius-md);
            font-weight:600; font-size:var(--fs-base); cursor:pointer; transition: all 0.2s;
            backdrop-filter:blur(10px); text-align:center; position:relative;
            overflow:hidden; display:inline-block;
            box-shadow:0 4px 12px rgba(0,0,0,0.25), 0 1px 0 rgba(255,255,255,0.15) inset;
            line-height:1.3;
        }
        .uvd-btn:hover {
            background:rgba(255,255,255,0.16); border-color:rgba(255,255,255,0.35);
            transform:translateY(-1px); box-shadow:0 6px 16px rgba(0,0,0,0.35), 0 1px 0 rgba(255,255,255,0.2) inset;
        }
        .uvd-btn:active { transform:scale(0.96); }
        .uvd-btn-sm {
            padding: 7px 12px;
            font-size: var(--fs-sm);
            border-radius: var(--radius-sm);
        }
        .uvd-btn-primary {
            background:var(--grad-liquid); border-color:transparent; color:#fff;
            box-shadow:0 6px 18px rgba(109,140,255,0.45), 0 1px 0 rgba(255,255,255,0.3) inset;
        }
        .uvd-btn-primary:hover { filter:brightness(1.08); box-shadow:0 8px 22px rgba(109,140,255,0.55); }
        /* Header icon buttons (minimize/refresh/close). */
        .uvd-btn-icon {
            background:var(--glass-hi); border:1px solid var(--border);
            color:var(--text); width:34px; height:34px; border-radius:var(--radius-sm);
            cursor:pointer; display:inline-flex; align-items:center; justify-content:center;
            transition: all 0.2s; backdrop-filter:blur(10px); position:relative; overflow:hidden;
            box-shadow:0 4px 10px rgba(0,0,0,0.25), 0 1px 0 rgba(255,255,255,0.15) inset;
        }
        .uvd-btn-icon:hover { background:rgba(255,255,255,0.16); border-color:rgba(255,255,255,0.35); }
        .uvd-btn-icon:active { transform:scale(0.92); }
        .uvd-btn-icon svg { display:block; }
        .uvd-card {
            background:var(--card-bg); border:1px solid var(--border);
            border-radius:var(--radius-md); padding:14px; margin-bottom:10px;
            font-size:var(--fs-base); backdrop-filter:blur(6px);
            box-shadow:0 1px 0 rgba(255,255,255,0.06) inset;
            transition: all 0.3s ease; animation:uvdCardEnter 0.4s ease both;
        }
        .uvd-card:nth-child(odd) { animation-delay:0.05s; }
        .uvd-card:nth-child(even) { animation-delay:0.1s; }
        .uvd-card:hover {
            transform:translateY(-3px);
            box-shadow:0 14px 30px rgba(0,0,0,0.5), 0 0 0 1px rgba(109,140,255,0.28) inset;
            background:rgba(255,255,255,0.075);
        }
        .uvd-type-badge {
            display:inline-block; padding:4px 12px; border-radius:var(--radius-sm);
            font-size:var(--fs-xs); font-weight:700; background:rgba(109,140,255,0.22);
            color:var(--accent); border:1px solid rgba(109,140,255,0.35);
            letter-spacing:0.02em;
        }
        .uvd-url-box {
            background:rgba(0,0,0,0.35); border-radius:var(--radius-sm); padding:12px;
            font-family:'SFMono-Regular',Consolas,monospace; font-size:var(--fs-sm); word-break:break-all;
            color:var(--text2); max-height:100px; overflow-y:auto; line-height:1.5;
            border:1px solid rgba(255,255,255,0.06);
        }
        .uvd-grid-2 { display:grid; grid-template-columns:1fr 1fr; gap:8px; }
        .uvd-grid-3 { display:grid; grid-template-columns:1fr 1fr 1fr; gap:6px; }
        /* Segmented liquid tab bar: a single gradient pill glides between tabs
           instead of a static underline — this is the panel's signature motion. */
        .uvd-tabbar {
            position:relative; display:flex; gap:2px; padding:4px;
            background:rgba(255,255,255,0.05); border:1px solid var(--border);
            border-radius:999px; margin-bottom:10px;
        }
        .uvd-tab-indicator {
            position:absolute; top:4px; bottom:4px; left:4px; width:0;
            border-radius:999px; background:var(--grad-liquid); z-index:0;
            box-shadow:0 4px 14px rgba(109,140,255,0.5);
            transition: transform 0.4s cubic-bezier(.4,0,.2,1), width 0.4s cubic-bezier(.4,0,.2,1);
        }
        .uvd-tab {
            position:relative; z-index:1; flex:1; min-width:0; background:transparent;
            border:none; color:var(--text2); font-weight:600; font-size:var(--fs-sm);
            padding:9px 6px; border-radius:999px; cursor:pointer; transition:color 0.25s;
            white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
        }
        .uvd-tab.uvd-tab-active { color:#fff; }
        #__uvd_min_float__ {
            position:fixed; bottom:20px; right:20px; width:54px; height:54px;
            border-radius:50%; background:var(--grad-liquid); color:#fff;
            border:1px solid rgba(255,255,255,0.3); box-shadow:0 10px 24px rgba(0,0,0,0.5), 0 0 20px rgba(109,140,255,0.4);
            z-index:2147483647; cursor:pointer; display:flex; align-items:center;
            justify-content:center; font-weight:700; font-size:var(--fs-lg);
            transition: transform 0.3s; animation:uvdFloatBtnIn 0.3s ease;
            backdrop-filter:blur(10px);
        }
        #__uvd_min_float__:hover { transform:scale(1.1); }
    `;
    document.head.appendChild(style);

    function buildUI() {
        var arr = [...urls.entries()].map(function(e) {
            return { url: e[0], type: e[1].type, source: e[1].source, priority: e[1].priority };
        }).sort(function(a, b) { return a.priority - b.priority; });

        var panel = document.getElementById('__uvd__');
        if (panel) panel.remove();

        panel = document.createElement('div');
        panel.id = '__uvd__';
        panel.className = 'uvd-glass-panel';
        panel.style.cssText = 'position:fixed;top:15px;left:15px;right:15px;bottom:15px;z-index:2147483647;animation:uvdScaleIn 0.4s ease;';

        // Drifting light blobs behind the glass — the panel's signature "liquid" cue.
        var liquidBg = document.createElement('div');
        liquidBg.className = 'uvd-liquid-bg';
        panel.appendChild(liquidBg);

        // Everything else sits in a relatively-positioned content layer above the blobs.
        var content = document.createElement('div');
        content.className = 'uvd-panel-content';
        panel.appendChild(content);

        // Header
        var header = document.createElement('div');
        header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding-bottom:12px;border-bottom:1px solid var(--border);margin-bottom:10px;';
        header.innerHTML = 
            '<div style="display:flex;align-items:center;gap:8px;">' +
                '<span style="width:10px;height:10px;background:var(--grad-liquid);border-radius:50%;animation:uvdPulse 2s infinite;"></span>' +
                '<span style="font-weight:700;font-size:16px;">Universal DL <span style="color:var(--accent);">V5</span></span>' +
            '</div>' +
            '<div style="display:flex;gap:6px;">' +
                '<button class="uvd-btn-icon uvd-ripple-btn" id="__uvd_minimize__" title="Minimize">' +
                    '<svg width="14" height="14" viewBox="0 0 24 24"><rect x="4" y="18" width="16" height="2.5" rx="1.25" fill="currentColor"/></svg>' +
                '</button>' +
                '<button class="uvd-btn-icon uvd-ripple-btn" id="__uvd_refresh__" title="Refresh">' +
                    '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 3v6h-6"/></svg>' +
                '</button>' +
                '<button class="uvd-btn-icon uvd-ripple-btn" id="__uvd_close__" title="Close">' +
                    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M5 5l14 14M19 5L5 19"/></svg>' +
                '</button>' +
            '</div>';
        content.appendChild(header);

        // Tabs — segmented liquid pill bar with a sliding gradient indicator.
        var tabbar = document.createElement('div');
        tabbar.className = 'uvd-tabbar';
        var indicator = document.createElement('div');
        indicator.className = 'uvd-tab-indicator';
        indicator.id = '__uvd_tab_indicator__';
        tabbar.appendChild(indicator);
        var tabList = [
            { id: 'streams', text: 'Streams (' + arr.length + ')' },
            { id: 'favorites', text: 'Favorites (' + data.favorites.length + ')' },
            { id: 'history', text: 'History (' + (data.history||[]).length + ')' },
            { id: 'settings', text: 'Settings' }
        ];
        tabList.forEach(function(t) {
            var b = document.createElement('button');
            b.className = 'uvd-tab';
            b.dataset.tab = t.id;
            b.textContent = t.text;
            tabbar.appendChild(b);
        });
        content.appendChild(tabbar);

        function moveIndicatorTo(btn) {
            if (!btn) return;
            indicator.style.width = btn.offsetWidth + 'px';
            indicator.style.transform = 'translateX(' + btn.offsetLeft + 'px)';
        }

        // Info
        var info = document.createElement('div');
        info.style.cssText = 'margin-bottom:10px;font-size:12px;';
        info.innerHTML = 
            '<span style="color:var(--text2);">Title: </span>' +
            '<span id="__uvd_title__" style="color:var(--accent);text-decoration:underline;cursor:pointer;">' + pageInfo.title + '</span> ' +
            '<span style="color:var(--text3);">(edit)</span><br>' +
            '<span style="color:var(--text2);">Referer: </span>' +
            '<span id="__uvd_referer__" style="color:var(--accent2);font-family:monospace;text-decoration:underline;cursor:pointer;">' + pageInfo.referer + '</span>';
        content.appendChild(info);

        // Content area
        var contentWrapper = document.createElement('div');
        contentWrapper.className = 'uvd-scroll';
        contentWrapper.style.cssText = 'flex:1;overflow:hidden;position:relative;min-height:0;';
        
        var streamList = document.createElement('div');
        streamList.id = '__uvd_stream_list__';
        streamList.className = 'uvd-scroll';
        streamList.style.cssText = 'overflow-y:auto;height:100%;padding-right:4px;';
        contentWrapper.appendChild(streamList);

        var playerContainer = document.createElement('div');
        playerContainer.id = '__uvd_player_container__';
        playerContainer.style.cssText = 'display:none;flex-direction:column;height:100%;';
        contentWrapper.appendChild(playerContainer);

        content.appendChild(contentWrapper);

        // Footer (smaller buttons)
        var footer = document.createElement('div');
        footer.style.cssText = 'display:flex;gap:6px;margin-top:10px;flex-wrap:wrap;';
        ['TXT','JSON','M3U','CSV'].forEach(function(f) {
            var btn = document.createElement('button');
            btn.className = 'uvd-btn uvd-btn-sm uvd-ripple-btn';
            btn.textContent = f;
            btn.style.flex = '1 0 auto';
            btn.onclick = function() { exportData(f.toLowerCase()); };
            footer.appendChild(btn);
        });
        content.appendChild(footer);
        document.body.appendChild(panel);

        // Ripple
        document.querySelectorAll('.uvd-ripple-btn, .uvd-btn, .uvd-btn-icon, .uvd-tab').forEach(function(btn) {
            btn.addEventListener('click', addRipple);
        });

        var currentTab = 'streams';
        function renderTab(tabId) {
            currentTab = tabId;
            document.querySelectorAll('[data-tab]').forEach(function(t) {
                if (t.dataset.tab === tabId) {
                    t.classList.add('uvd-tab-active');
                    moveIndicatorTo(t);
                } else {
                    t.classList.remove('uvd-tab-active');
                }
            });
            playerContainer.style.display = 'none';
            playerContainer.innerHTML = '';
            streamList.style.display = 'block';
            streamList.innerHTML = '';
            if (tabId === 'streams') renderStreams(streamList, arr);
            else if (tabId === 'favorites') renderFavorites(streamList);
            else if (tabId === 'history') renderHistory(streamList);
            else if (tabId === 'settings') renderSettings(streamList);
        }

        document.querySelectorAll('[data-tab]').forEach(function(t) {
            t.onclick = function() { renderTab(this.dataset.tab); };
        });
        renderTab('streams');
        window.addEventListener('resize', function() {
            moveIndicatorTo(document.querySelector('.uvd-tab.uvd-tab-active'));
        });

        document.getElementById('__uvd_close__').onclick = function() { stopMonitor(); panel.remove(); };
        document.getElementById('__uvd_refresh__').onclick = function() { buildUI(); toast('Refreshed'); };
        document.getElementById('__uvd_title__').onclick = function() {
            var newTitle = prompt('File name:', pageInfo.title);
            if (newTitle) { pageInfo.title = newTitle.replace(/[^\w\s\u00C0-\u1EF9.-]/g, '').substring(0,100); this.textContent = pageInfo.title; }
        };
        document.getElementById('__uvd_referer__').onclick = function() {
            var newRef = prompt('Referer:', pageInfo.referer);
            if (newRef) {
                pageInfo.referer = newRef;
                this.textContent = newRef;
                data.siteProfiles[pageInfo.host] = { referer: newRef, userAgent: pageInfo.userAgent };
                storage.set(data);
                toast('Saved referer for ' + pageInfo.host);
            }
        };
        document.getElementById('__uvd_minimize__').onclick = function() {
            panel.style.display = 'none';
            var floatBtn = document.getElementById('__uvd_min_float__');
            if (!floatBtn) {
                floatBtn = document.createElement('button');
                floatBtn.id = '__uvd_min_float__';
                floatBtn.textContent = 'U';
                floatBtn.title = 'Restore Universal DL';
                floatBtn.onclick = function() { panel.style.display = 'flex'; floatBtn.remove(); };
                document.body.appendChild(floatBtn);
            }
        };

        window.__uvd_showPreview = function(url) {
            streamList.style.display = 'none';
            playerContainer.style.display = 'flex';
            showInlinePlayer(url, playerContainer);
        };
    }

    function renderStreams(container, arr) {
        if (!arr.length) {
            container.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text2);">No streams detected.</div>';
            return;
        }
        arr.forEach(function(item, i) {
            var card = document.createElement('div');
            card.className = 'uvd-card';
            var fav = isFavorite(item.url);
            card.innerHTML = 
                '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">' +
                    '<span class="uvd-type-badge">#' + (i+1) + ' ' + item.type + '</span>' +
                    '<button class="uvd-fav-btn uvd-ripple-btn" data-url="' + encodeURIComponent(item.url) + '" data-type="' + item.type + '" style="background:none;border:none;font-size:18px;cursor:pointer;color:' + (fav ? 'var(--gold)' : 'var(--text3)') + ';">' + (fav ? '★' : '☆') + '</button>' +
                '</div>' +
                '<div class="uvd-url-box">' + item.url + '</div>' +
                '<div class="uvd-grid-2" style="margin-top:8px;">' +
                    '<button class="uvd-btn uvd-btn-sm uvd-ripple-btn" data-action="share" data-url="' + encodeURIComponent(item.url) + '" style="background:rgba(139,92,246,0.3);">Share</button>' +
                    '<button class="uvd-btn uvd-btn-sm uvd-ripple-btn" data-action="copy" data-url="' + encodeURIComponent(item.url) + '">Copy</button>' +
                    (item.type === 'IFRAME' ? 
                        '<a href="' + item.url + '" class="uvd-btn uvd-btn-sm uvd-ripple-btn" style="text-align:center;grid-column:1/3;text-decoration:none;">Open iframe</a>' :
                        (item.type === 'M3U8' ?
                            '<button class="uvd-btn uvd-btn-sm uvd-ripple-btn" data-action="quality" data-url="' + encodeURIComponent(item.url) + '">Quality</button>' +
                            '<button class="uvd-btn uvd-btn-sm uvd-ripple-btn" data-action="preview" data-url="' + encodeURIComponent(item.url) + '">Preview</button>' +
                            '<button class="uvd-btn uvd-btn-sm uvd-ripple-btn" data-action="cmd" data-url="' + encodeURIComponent(item.url) + '" data-type="' + item.type + '" style="grid-column:1/3;">All commands</button>' :
                            '<button class="uvd-btn uvd-btn-sm uvd-ripple-btn" data-action="preview" data-url="' + encodeURIComponent(item.url) + '">Preview</button>' +
                            '<button class="uvd-btn uvd-btn-sm uvd-ripple-btn" data-action="cmd" data-url="' + encodeURIComponent(item.url) + '" data-type="' + item.type + '">Commands</button>'
                        )
                    ) +
                '</div>';
            container.appendChild(card);
        });

        container.querySelectorAll('.uvd-btn, .uvd-fav-btn').forEach(function(b) {
            b.addEventListener('click', addRipple);
        });
        container.querySelectorAll('.uvd-fav-btn').forEach(function(b) {
            b.onclick = function() {
                var u = decodeURIComponent(this.dataset.url);
                var isFav = toggleFavorite(u, this.dataset.type);
                this.textContent = isFav ? '★' : '☆';
                this.style.color = isFav ? 'var(--gold)' : 'var(--text3)';
            };
        });
        container.querySelectorAll('.uvd-btn[data-action]').forEach(function(b) {
            b.onclick = function() {
                var u = decodeURIComponent(this.dataset.url);
                var action = this.dataset.action;
                var t = this.dataset.type;
                addToHistory(u, t || 'IFRAME');
                if (action === 'share') shareUrl(u);
                else if (action === 'copy') { copy(u); toast('Copied'); }
                else if (action === 'quality') showQualityPicker(u);
                else if (action === 'preview') window.__uvd_showPreview(u);
                else if (action === 'cmd') showCommandPicker(u, t);
            };
        });
    }

    function showCommandPicker(url, type) {
        var cmds = makeCommands(url, type, pageInfo.title);
        var overlay = document.createElement('div');
        overlay.className = 'uvd-overlay';
        var html = '<div class="uvd-glass-panel" style="max-width:600px;margin:auto;">';
        html += '<div style="font-weight:700;margin-bottom:12px;">Select command</div>';
        html += '<div style="overflow-y:auto;max-height:60vh;">';
        Object.keys(cmds).forEach(function(k) {
            var c = cmds[k];
            html += '<div class="uvd-card">' +
                '<div style="font-weight:600;color:var(--accent);">' + c.label + '</div>' +
                '<div class="uvd-url-box">' + c.cmd + '</div>' +
                '<button class="uvd-btn uvd-btn-sm cmd-select" data-cmd="' + encodeURIComponent(c.cmd) + '" style="width:100%;">Edit & Copy</button>' +
            '</div>';
        });
        html += '</div><button class="uvd-btn uvd-btn-sm close-overlay-btn" style="width:100%;margin-top:10px;background:var(--danger);">Close</button></div>';
        overlay.innerHTML = html;
        document.body.appendChild(overlay);

        overlay.querySelectorAll('.uvd-btn').forEach(function(b) { b.addEventListener('click', addRipple); });
        overlay.querySelector('.close-overlay-btn').onclick = function() { overlay.remove(); };
        overlay.querySelectorAll('.cmd-select').forEach(function(b) {
            b.onclick = function() {
                overlay.remove();
                showEditor(decodeURIComponent(this.dataset.cmd));
            };
        });
    }

    function showEditor(text) {
        var overlay = document.createElement('div');
        overlay.className = 'uvd-overlay';
        overlay.innerHTML = 
            '<div class="uvd-glass-panel" style="max-width:600px;margin:auto;">' +
                '<div style="font-weight:700;margin-bottom:8px;">Edit Command</div>' +
                '<textarea style="width:100%;height:120px;background:rgba(0,0,0,0.5);border:1px solid var(--border);border-radius:10px;color:var(--text);padding:12px;font-family:monospace;">' + text + '</textarea>' +
                '<div class="uvd-grid-2" style="margin-top:12px;">' +
                    '<button class="uvd-btn uvd-btn-sm" id="__uvd_ed_copy__">Copy</button>' +
                    '<button class="uvd-btn uvd-btn-sm" id="__uvd_ed_share__" style="background:rgba(139,92,246,0.3);">Share</button>' +
                '</div>' +
                '<button class="uvd-btn uvd-btn-sm close-editor" style="width:100%;margin-top:8px;background:var(--danger);">Close</button>' +
            '</div>';
        document.body.appendChild(overlay);
        overlay.querySelectorAll('.uvd-btn').forEach(function(b) { b.addEventListener('click', addRipple); });
        document.getElementById('__uvd_ed_copy__').onclick = function() {
            copy(overlay.querySelector('textarea').value);
            overlay.remove();
            toast('Copied');
        };
        document.getElementById('__uvd_ed_share__').onclick = function() {
            shareUrl(overlay.querySelector('textarea').value);
            overlay.remove();
        };
        overlay.querySelector('.close-editor').onclick = function() { overlay.remove(); };
    }

    function showQualityPicker(url) {
        var overlay = document.createElement('div');
        overlay.className = 'uvd-overlay';
        overlay.innerHTML = '<div class="uvd-glass-panel" style="max-width:600px;margin:auto;">Analyzing M3U8...</div>';
        document.body.appendChild(overlay);

        parseM3U8Master(url, function(qualities) {
            if (!qualities) {
                overlay.innerHTML = '<div class="uvd-glass-panel" style="max-width:600px;margin:auto;text-align:center;">' +
                    '<div style="color:var(--danger);">Not a Master Playlist</div>' +
                    '<button class="uvd-btn uvd-btn-sm close-overlay-btn" style="margin-top:12px;background:var(--danger);width:100%;">Close</button></div>';
                overlay.querySelector('.close-overlay-btn').onclick = function() { overlay.remove(); };
                return;
            }

            var html = '<div class="uvd-glass-panel" style="max-width:600px;margin:auto;">';
            html += '<div style="font-weight:700;margin-bottom:12px;">Select quality (' + qualities.length + ')</div>';
            html += '<div style="overflow-y:auto;max-height:60vh;">';
            qualities.forEach(function(q) {
                html += '<div class="uvd-card">' +
                    '<b>' + q.label + '</b> <span style="color:var(--text3);">' + Math.round(q.bandwidth/1000) + 'kbps</span>' +
                    '<div class="uvd-grid-3" style="margin-top:8px;">' +
                        '<button class="uvd-btn uvd-btn-sm q-act" data-url="' + encodeURIComponent(q.url) + '" data-action="share" style="background:rgba(139,92,246,0.3);">Share</button>' +
                        '<button class="uvd-btn uvd-btn-sm q-act" data-url="' + encodeURIComponent(q.url) + '" data-action="preview">Preview</button>' +
                        '<button class="uvd-btn uvd-btn-sm q-act" data-url="' + encodeURIComponent(q.url) + '" data-action="cmd">Cmd</button>' +
                    '</div>' +
                '</div>';
            });
            html += '</div><button class="uvd-btn uvd-btn-sm close-overlay-btn" style="width:100%;margin-top:10px;background:var(--danger);">Close</button></div>';
            overlay.innerHTML = html;

            overlay.querySelectorAll('.uvd-btn').forEach(function(b) { b.addEventListener('click', addRipple); });
            overlay.querySelector('.close-overlay-btn').onclick = function() { overlay.remove(); };
            overlay.querySelectorAll('.q-act').forEach(function(b) {
                b.onclick = function() {
                    var u = decodeURIComponent(this.dataset.url);
                    var action = this.dataset.action;
                    overlay.remove();
                    if (action === 'share') shareUrl(u);
                    else if (action === 'preview') window.__uvd_showPreview(u);
                    else showCommandPicker(u, 'M3U8');
                };
            });
        });
    }

    function renderFavorites(container) {
        if (!data.favorites.length) {
            container.innerHTML = '<div style="text-align:center;padding:30px;color:var(--text2);">No favorites.</div>';
            return;
        }
        data.favorites.forEach(function(f, i) {
            var card = document.createElement('div');
            card.className = 'uvd-card';
            card.innerHTML = 
                '<div style="display:flex;justify-content:space-between;"><b style="color:var(--gold);">★ ' + f.type + '</b><span style="font-size:11px;color:var(--text3);">' + new Date(f.timestamp).toLocaleDateString() + '</span></div>' +
                '<div style="margin:4px 0;">' + f.title + '</div>' +
                '<div class="uvd-url-box">' + f.url + '</div>' +
                '<div class="uvd-grid-3">' +
                    '<button class="uvd-btn uvd-btn-sm fav-act" data-url="' + encodeURIComponent(f.url) + '" data-action="share" style="background:rgba(139,92,246,0.3);">Share</button>' +
                    '<button class="uvd-btn uvd-btn-sm fav-act" data-url="' + encodeURIComponent(f.url) + '" data-action="copy">Copy</button>' +
                    '<button class="uvd-btn uvd-btn-sm fav-del" data-idx="' + i + '" style="background:var(--danger);">Del</button>' +
                '</div>';
            container.appendChild(card);
        });
        container.querySelectorAll('.uvd-btn').forEach(function(b) { b.addEventListener('click', addRipple); });
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
                toast('Deleted');
            };
        });
    }

    function renderHistory(container) {
        var hist = data.history || [];
        if (!hist.length) {
            container.innerHTML = '<div style="text-align:center;padding:30px;color:var(--text2);">No history.</div>';
            return;
        }
        container.innerHTML = '<button class="uvd-btn uvd-btn-sm" id="__uvd_clear_hist__" style="width:100%;margin-bottom:10px;background:var(--danger);">Clear all history</button>';
        document.getElementById('__uvd_clear_hist__').addEventListener('click', addRipple);
        document.getElementById('__uvd_clear_hist__').onclick = function() {
            if (confirm('Clear all history?')) { data.history = []; storage.set(data); renderHistory(container); }
        };
        hist.forEach(function(h) {
            var card = document.createElement('div');
            card.className = 'uvd-card';
            card.innerHTML = 
                '<div style="display:flex;justify-content:space-between;"><b style="color:var(--accent);">' + h.type + '</b><span style="font-size:11px;color:var(--text3);">' + new Date(h.timestamp).toLocaleString() + '</span></div>' +
                '<div>' + h.title + '</div><div class="uvd-url-box">' + h.url + '</div>';
            container.appendChild(card);
        });
    }

    function renderSettings(container) {
        container.innerHTML = 
            '<div class="uvd-card"><div style="font-weight:600;">Backup</div>' +
            '<button class="uvd-btn uvd-btn-sm" id="__uvd_backup__" style="width:100%;margin-bottom:6px;">Export data</button>' +
            '<button class="uvd-btn uvd-btn-sm" id="__uvd_restore__" style="width:100%;margin-bottom:6px;">Import data</button>' +
            '<button class="uvd-btn uvd-btn-sm" id="__uvd_reset__" style="width:100%;background:var(--danger);">Reset all</button></div>' +
            '<div class="uvd-card" style="margin-top:10px;color:var(--text2);">Version 5.0<br>Favorites: ' + data.favorites.length + ' · History: ' + (data.history||[]).length + '</div>';
        container.querySelectorAll('.uvd-btn').forEach(function(b) { b.addEventListener('click', addRipple); });
        document.getElementById('__uvd_backup__').onclick = function() {
            var blob = new Blob([JSON.stringify(data)],{type:'application/json'});
            var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'uvd_backup.json'; a.click();
        };
        document.getElementById('__uvd_restore__').onclick = function() {
            var inp = document.createElement('input'); inp.type='file'; inp.accept='.json';
            inp.onchange = function(e) {
                var reader = new FileReader();
                reader.onload = function(ev) {
                    try { data = Object.assign(data, JSON.parse(ev.target.result)); storage.set(data); toast('Imported'); buildUI(); }
                    catch(ex) { toast('Invalid file','var(--danger)'); }
                };
                reader.readAsText(e.target.files[0]);
            };
            inp.click();
        };
        document.getElementById('__uvd_reset__').onclick = function() {
            if (confirm('Delete all data?')) { localStorage.removeItem(STORAGE_KEY); data = {favorites:[],siteProfiles:{},history:[]}; buildUI(); }
        };
    }

    buildUI();
    var autoRefresh = setInterval(function() {
        if (!document.getElementById('__uvd__') && !document.getElementById('__uvd_min_float__')) {
            clearInterval(autoRefresh); stopMonitor();
        }
    }, 2000);
    console.log('V5.0 Liquid Glass ready');
    toast('V5.0 Ready');
})();
