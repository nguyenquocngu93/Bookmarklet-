/**
 * Universal Video Downloader V2 - Glass UI Fixed Build
 * Fixes: Theme switch bug, Minimize bug, Landscape fullscreen,
 *        MP4 preview, Ultra-dark UI, Quality selector re-open
 */
(function() {
    'use strict';
    
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
    data.theme = data.theme || 'dark';
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
        .catch(function(e) { console.error(e); callback(null); });
    }
    
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
            'yt-dlp-sub': { label: 'yt-dlp + phụ đề', cmd: 'yt-dlp --referer "' + ref + '" --write-sub --sub-langs "vi,en" --embed-subs -o "' + t + '.%(ext)s" "' + url + '"' },
            'ffmpeg': { label: 'FFmpeg (M3U8 → MP4)', cmd: 'ffmpeg -headers "Referer: ' + ref + '\\r\\nOrigin: ' + origin + '\\r\\nUser-Agent: ' + ua + '" -i "' + url + '" -c copy -bsf:a aac_adtstoasc "' + t + '.mp4"' },
            'ffmpeg-audio': { label: 'FFmpeg (chỉ audio)', cmd: 'ffmpeg -headers "Referer: ' + ref + '" -i "' + url + '" -vn -c:a copy "' + t + '.aac"' },
            'ffmpeg-cut': { label: 'FFmpeg (cắt đoạn)', cmd: 'ffmpeg -headers "Referer: ' + ref + '" -ss 00:00:00 -to 00:05:00 -i "' + url + '" -c copy "' + t + '_cut.mp4"' },
            'curl': { label: 'cURL', cmd: 'curl -H "Referer: ' + ref + '" -o "' + t + '.' + ext + '" "' + url + '"' },
            'aria2': { label: 'aria2c', cmd: 'aria2c --referer="' + ref + '" -x 16 -s 16 -o "' + t + '.' + ext + '" "' + url + '"' },
            'wget': { label: 'wget', cmd: 'wget --referer="' + ref + '" -O "' + t + '.' + ext + '" "' + url + '"' }
        };
    }
    
    // ULTRA DARK THEMES - all solid dark colors, no bright gradients
    var themes = {
        dark: {
            bg: 'rgba(8, 8, 12, 0.92)',
            bg2: 'rgba(14, 14, 20, 0.88)',
            bg3: 'rgba(22, 22, 30, 0.82)',
            text: '#d4d4d8',
            text2: '#71717a',
            text3: '#52525b',
            primary: '#3f3f46',      // Dark zinc
            primaryHover: '#52525b',
            primaryText: '#e4e4e7',
            accent: '#27272a',       // Darker zinc
            accentHover: '#3f3f46',
            danger: '#7f1d1d',       // Dark red
            dangerHover: '#991b1b',
            success: '#14532d',      // Dark green
            successHover: '#166534',
            info: '#1e3a8a',         // Dark blue
            infoHover: '#1e40af',
            border: 'rgba(255, 255, 255, 0.06)',
            borderHover: 'rgba(255, 255, 255, 0.12)',
            shadow: '0 10px 40px rgba(0, 0, 0, 0.7)',
            blur: 'blur(24px)',
            cardBg: 'rgba(24, 24, 32, 0.6)',
            cardBorder: 'rgba(255, 255, 255, 0.05)',
            highlight: 'rgba(255, 255, 255, 0.03)',
            titleColor: '#a1a1aa'
        },
        light: {
            bg: 'rgba(244, 244, 245, 0.92)',
            bg2: 'rgba(228, 228, 231, 0.88)',
            bg3: 'rgba(212, 212, 216, 0.82)',
            text: '#18181b',
            text2: '#52525b',
            text3: '#a1a1aa',
            primary: '#d4d4d8',
            primaryHover: '#a1a1aa',
            primaryText: '#18181b',
            accent: '#e4e4e7',
            accentHover: '#d4d4d8',
            danger: '#fecaca',
            dangerHover: '#fca5a5',
            success: '#bbf7d0',
            successHover: '#86efac',
            info: '#bfdbfe',
            infoHover: '#93c5fd',
            border: 'rgba(0, 0, 0, 0.08)',
            borderHover: 'rgba(0, 0, 0, 0.15)',
            shadow: '0 10px 40px rgba(0, 0, 0, 0.15)',
            blur: 'blur(24px)',
            cardBg: 'rgba(255, 255, 255, 0.6)',
            cardBorder: 'rgba(0, 0, 0, 0.06)',
            highlight: 'rgba(0, 0, 0, 0.04)',
            titleColor: '#27272a'
        }
    };
    
    function getTheme() { return themes[data.theme] || themes.dark; }
    
    function copy(text) {
        var t = document.createElement('textarea');
        t.value = text;
        document.body.appendChild(t);
        t.select();
        try { document.execCommand('copy'); } catch(e) {}
        t.remove();
    }
    
    function toast(msg) {
        var t = getTheme();
        var el = document.createElement('div');
        el.innerText = msg;
        el.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);background:' + t.bg + ';backdrop-filter:' + t.blur + ';-webkit-backdrop-filter:' + t.blur + ';color:' + t.text + ';padding:10px 20px;border-radius:10px;z-index:2147483649;font:500 12px -apple-system,Arial;border:1px solid ' + t.border + ';box-shadow:' + t.shadow + ';transition:all 0.3s;';
        document.body.appendChild(el);
        setTimeout(function() { 
            el.style.opacity = '0'; 
            el.style.transform = 'translate(-50%, -20px)'; 
            setTimeout(function(){el.remove();}, 300); 
        }, 2200);
    }
    
    function shareUrl(url) {
        if (navigator.share) {
            navigator.share({ title: pageInfo.title, text: pageInfo.title, url: url }).catch(function() { copy(url); toast('Đã copy URL'); });
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
    
    function isFavorite(url) { return data.favorites.some(function(f) { return f.url === url; }); }
    
    function toggleFavorite(url, type) {
        var idx = data.favorites.findIndex(function(f) { return f.url === url; });
        if (idx >= 0) {
            data.favorites.splice(idx, 1);
            toast('Đã xóa khỏi Favorites');
        } else {
            data.favorites.unshift({ url: url, type: type, title: pageInfo.title, host: pageInfo.host, timestamp: Date.now() });
            toast('Đã thêm vào Favorites');
        }
        storage.set(data);
        return isFavorite(url);
    }
    
    function exportData(format) {
        var arr = [...urls.entries()].map(function(e) { return { url: e[0], type: e[1].type, source: e[1].source, title: pageInfo.title }; });
        var content, mime, filename;
        if (format === 'json') {
            content = JSON.stringify({ page: pageInfo, exportDate: new Date().toISOString(), streams: arr }, null, 2);
            mime = 'application/json'; filename = pageInfo.title + '_streams.json';
        } else if (format === 'csv') {
            content = 'Type,URL,Source,Title\n' + arr.map(function(a) { return a.type + ',"' + a.url + '",' + a.source + ',"' + a.title + '"'; }).join('\n');
            mime = 'text/csv'; filename = pageInfo.title + '_streams.csv';
        } else if (format === 'm3u') {
            content = '#EXTM3U\n' + arr.filter(function(a) { return a.type !== 'IFRAME'; }).map(function(a) { return '#EXTINF:-1,' + a.title + ' [' + a.type + ']\n' + a.url; }).join('\n');
            mime = 'audio/x-mpegurl'; filename = pageInfo.title + '.m3u';
        } else {
            content = arr.map(function(a) { return a.url; }).join('\n');
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
    
    function cssIcon(name, color) {
        color = color || 'currentColor';
        var el = document.createElement('span');
        el.style.cssText = 'display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;';
        var svg = '';
        switch(name) {
            case 'close':
                svg = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="' + color + '" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
                break;
            case 'refresh':
                svg = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="' + color + '" stroke-width="2" stroke-linecap="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>';
                break;
            case 'minimize':
                svg = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="' + color + '" stroke-width="2" stroke-linecap="round"><polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/><line x1="14" y1="10" x2="21" y2="3"/><line x1="3" y1="21" x2="10" y2="14"/></svg>';
                break;
            case 'expand':
                svg = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="' + color + '" stroke-width="2" stroke-linecap="round"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>';
                break;
            case 'star-full':
                svg = '<svg width="14" height="14" viewBox="0 0 24 24" fill="' + color + '" stroke="' + color + '" stroke-width="1"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>';
                break;
            case 'star-empty':
                svg = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="' + color + '" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>';
                break;
            case 'play':
                svg = '<svg width="14" height="14" viewBox="0 0 24 24" fill="' + color + '"><polygon points="5 3 19 12 5 21 5 3"/></svg>';
                break;
            case 'pip':
                svg = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="' + color + '" stroke-width="2"><rect x="2" y="4" width="20" height="16" rx="2"/><rect x="12" y="12" width="8" height="6"/></svg>';
                break;
            case 'fullscreen':
                svg = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="' + color + '" stroke-width="2"><path d="M8 3H5a2 2 0 00-2 2v3m18 0V5a2 2 0 00-2-2h-3m0 18h3a2 2 0 002-2v-3M3 16v3a2 2 0 002 2h3"/></svg>';
                break;
            case 'camera':
                svg = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="' + color + '" stroke-width="2"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg>';
                break;
            case 'settings':
                svg = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="' + color + '" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>';
                break;
            case 'download':
                svg = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="' + color + '" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>';
                break;
            case 'copy':
                svg = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="' + color + '" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>';
                break;
            case 'share':
                svg = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="' + color + '" stroke-width="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>';
                break;
            case 'quality':
                svg = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="' + color + '" stroke-width="2"><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/></svg>';
                break;
            case 'trash':
                svg = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="' + color + '" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>';
                break;
            case 'live':
                svg = '<span style="display:inline-block;width:8px;height:8px;background:#dc2626;border-radius:50%;box-shadow:0 0 6px #dc2626;animation:uvdPulse 2s infinite;"></span>';
                break;
            case 'link':
                svg = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="' + color + '" stroke-width="2"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>';
                break;
        }
        el.innerHTML = svg;
        return el;
    }
    
    function buildUI() {
        var t = getTheme();
        var arr = [...urls.entries()].map(function(e) {
            return { url: e[0], type: e[1].type, source: e[1].source, priority: e[1].priority };
        }).sort(function(a, b) { return a.priority - b.priority; });
        
        var panel = document.createElement('div');
        panel.id = '__uvd__';
        panel.style.cssText = 'position:fixed;top:10px;left:10px;right:10px;bottom:10px;background:' + t.bg + ';backdrop-filter:' + t.blur + ';-webkit-backdrop-filter:' + t.blur + ';color:' + t.text + ';padding:0;border-radius:16px;z-index:2147483647;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;font-size:13px;overflow:hidden;display:flex;flex-direction:column;box-shadow:' + t.shadow + ';border:1px solid ' + t.border + ';';
        
        var style = document.createElement('style');
        style.textContent = '@keyframes uvdFadeIn{from{opacity:0;transform:scale(0.98)}to{opacity:1;transform:scale(1)}}@keyframes uvdPulse{0%,100%{opacity:1}50%{opacity:0.4}}#__uvd__ ::-webkit-scrollbar{width:6px}#__uvd__ ::-webkit-scrollbar-thumb{background:' + t.primary + ';border-radius:3px}#__uvd__ ::-webkit-scrollbar-thumb:hover{background:' + t.primaryHover + '}#__uvd__ ::-webkit-scrollbar-track{background:transparent}';
        panel.appendChild(style);
        
        // HEADER - always visible
        var header = document.createElement('div');
        header.id = '__uvd_header__';
        header.style.cssText = 'background:' + t.bg2 + ';padding:14px 18px;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid ' + t.border + ';flex-shrink:0;';
        
        var titleDiv = document.createElement('div');
        titleDiv.innerHTML = '<div style="font-size:15px;color:' + t.titleColor + ';font-weight:700;letter-spacing:0.3px;">Universal DL</div><div style="font-size:10px;color:' + t.text3 + ';margin-top:3px;display:flex;align-items:center;gap:5px;"></div>';
        var liveSpan = titleDiv.querySelector('div > div');
        liveSpan.appendChild(cssIcon('live'));
        liveSpan.appendChild(document.createTextNode(' ' + arr.length + ' streams · ' + pageInfo.host));
        
        var btnGroup = document.createElement('div');
        btnGroup.style.cssText = 'display:flex;gap:8px;';
        
        function mkHeaderBtn(iconName, title, onClick) {
            var btn = document.createElement('button');
            btn.title = title;
            btn.dataset.icon = iconName;
            btn.style.cssText = 'background:' + t.primary + ';border:1px solid ' + t.border + ';width:36px;height:36px;border-radius:10px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all 0.2s;color:' + t.primaryText + ';';
            btn.appendChild(cssIcon(iconName, t.primaryText));
            btn.onmouseover = function(){this.style.background=t.primaryHover;this.style.borderColor=t.borderHover;};
            btn.onmouseout = function(){this.style.background=t.primary;this.style.borderColor=t.border;};
            btn.onclick = onClick;
            return btn;
        }
        
        var btnRef = mkHeaderBtn('refresh', 'Refresh', function() {
            buildUI();
            toast('Refreshed');
        });
        
        var btnMin = mkHeaderBtn('minimize', 'Minimize', function() {
            // Use getElementById to avoid closure issues when theme switches
            var p = document.getElementById('__uvd__');
            if (!p) return;
            var ct = document.getElementById('__uvd_content__');
            var ft = document.getElementById('__uvd_footer__');
            var tb = document.getElementById('__uvd_tabs__');
            var inf = document.getElementById('__uvd_info__');
            if (!ct) return;
            
            var isMin = ct.style.display === 'none';
            ct.style.display = isMin ? 'block' : 'none';
            if (ft) ft.style.display = isMin ? 'flex' : 'none';
            if (tb) tb.style.display = isMin ? 'flex' : 'none';
            if (inf) inf.style.display = isMin ? 'block' : 'none';
            
            // Resize panel when minimized
            if (isMin) {
                p.style.top = '10px';
                p.style.left = '10px';
                p.style.right = '10px';
                p.style.bottom = '10px';
            } else {
                // Compact size when minimized - stays at top
                p.style.bottom = 'auto';
                p.style.right = 'auto';
                p.style.width = '340px';
                p.style.top = '10px';
                p.style.left = 'auto';
                p.style.right = '10px';
            }
            
            // Swap icon
            this.innerHTML = '';
            this.appendChild(cssIcon(isMin ? 'minimize' : 'expand', t.primaryText));
            this.title = isMin ? 'Minimize' : 'Expand';
        });
        
        var btnClose = document.createElement('button');
        btnClose.title = 'Close';
        btnClose.style.cssText = 'background:' + t.danger + ';border:1px solid ' + t.border + ';width:36px;height:36px;border-radius:10px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all 0.2s;color:#fecaca;';
        btnClose.appendChild(cssIcon('close', '#fecaca'));
        btnClose.onmouseover = function(){this.style.background=t.dangerHover;};
        btnClose.onmouseout = function(){this.style.background=t.danger;};
        btnClose.onclick = function() {
            stopMonitor();
            var p = document.getElementById('__uvd__');
            if (p) p.remove();
        };
        
        btnGroup.appendChild(btnRef);
        btnGroup.appendChild(btnMin);
        btnGroup.appendChild(btnClose);
        header.appendChild(titleDiv);
        header.appendChild(btnGroup);
        panel.appendChild(header);
        
        // TABS
        var tabs = document.createElement('div');
        tabs.id = '__uvd_tabs__';
        tabs.style.cssText = 'display:flex;background:' + t.bg2 + ';border-bottom:1px solid ' + t.border + ';flex-shrink:0;';
        var tabList = [
            { id: 'streams', label: 'Streams (' + arr.length + ')' },
            { id: 'favorites', label: 'Fav (' + data.favorites.length + ')' },
            { id: 'history', label: 'History (' + (data.history || []).length + ')' },
            { id: 'settings', label: 'Settings' }
        ];
        tabList.forEach(function(tab) {
            var b = document.createElement('button');
            b.className = '__uvd_tab__';
            b.dataset.tab = tab.id;
            b.innerText = tab.label;
            b.style.cssText = 'flex:1;background:transparent;color:' + t.text2 + ';border:0;padding:10px 4px;font-size:11px;font-weight:600;cursor:pointer;border-bottom:2px solid transparent;transition:all 0.2s;';
            b.onmouseover = function(){this.style.color=t.text;};
            b.onmouseout = function(){
                var cur = document.getElementById('__uvd__').dataset.currentTab;
                if(this.dataset.tab !== cur) this.style.color=t.text2;
            };
            b.onclick = function() {
                var p = document.getElementById('__uvd__');
                p.dataset.currentTab = this.dataset.tab;
                document.querySelectorAll('.__uvd_tab__').forEach(function(tb) {
                    var ct = getTheme();
                    if (tb.dataset.tab === p.dataset.currentTab) {
                        tb.style.borderBottomColor = ct.text;
                        tb.style.color = ct.text;
                    } else {
                        tb.style.borderBottomColor = 'transparent';
                        tb.style.color = ct.text2;
                    }
                });
                var ct = document.getElementById('__uvd_content__');
                ct.innerHTML = '';
                if (this.dataset.tab === 'streams') renderStreams(ct, arr);
                else if (this.dataset.tab === 'favorites') renderFavorites(ct);
                else if (this.dataset.tab === 'history') renderHistory(ct);
                else if (this.dataset.tab === 'settings') renderSettings(ct);
            };
            tabs.appendChild(b);
        });
        panel.appendChild(tabs);
        
        // INFO
        var info = document.createElement('div');
        info.id = '__uvd_info__';
        info.style.cssText = 'background:' + t.bg2 + ';padding:10px 18px;border-bottom:1px solid ' + t.border + ';font-size:11px;flex-shrink:0;';
        info.innerHTML = '<div style="color:' + t.text2 + ';display:flex;align-items:center;gap:6px;margin-bottom:4px;">' + cssIcon('copy', t.text3).outerHTML + '<span id="__uvd_title__" style="color:' + t.text + ';font-weight:600;cursor:pointer;">' + pageInfo.title + '</span></div><div style="color:' + t.text2 + ';display:flex;align-items:center;gap:6px;">' + cssIcon('link', t.text3).outerHTML + '<span id="__uvd_referer__" style="color:' + t.text3 + ';font-family:monospace;font-size:9px;cursor:pointer;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:260px;display:inline-block;">' + pageInfo.referer + '</span></div>';
        panel.appendChild(info);
        
        // CONTENT
        var content = document.createElement('div');
        content.id = '__uvd_content__';
        content.style.cssText = 'flex:1;overflow-y:auto;padding:14px;';
        panel.appendChild(content);
        
        // FOOTER
        var footer = document.createElement('div');
        footer.id = '__uvd_footer__';
        footer.style.cssText = 'background:' + t.bg2 + ';padding:10px;border-top:1px solid ' + t.border + ';display:flex;gap:6px;flex-shrink:0;';
        ['TXT', 'JSON', 'M3U', 'CSV'].forEach(function(fmt) {
            var btn = document.createElement('button');
            btn.dataset.fmt = fmt.toLowerCase();
            btn.style.cssText = 'background:' + t.primary + ';color:' + t.primaryText + ';border:1px solid ' + t.border + ';padding:8px;border-radius:8px;font-size:10px;font-weight:600;flex:1;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:4px;transition:all 0.2s;';
            btn.appendChild(cssIcon('download', t.primaryText));
            btn.appendChild(document.createTextNode(fmt));
            btn.onmouseover = function(){this.style.background=t.primaryHover;};
            btn.onmouseout = function(){this.style.background=t.primary;};
            btn.onclick = function() { exportData(this.dataset.fmt); };
            footer.appendChild(btn);
        });
        panel.appendChild(footer);
        
        document.body.appendChild(panel);
        panel.dataset.currentTab = 'streams';
        
        // Bind info clicks
        document.getElementById('__uvd_title__').onclick = function() {
            var newTitle = prompt('Tên file:', pageInfo.title);
            if (newTitle) { pageInfo.title = newTitle.replace(/[^\w\s\u00C0-\u1EF9.-]/g, '').substring(0, 100); this.innerText = pageInfo.title; }
        };
        document.getElementById('__uvd_referer__').onclick = function() {
            var newRef = prompt('Referer:', pageInfo.referer);
            if (newRef) { pageInfo.referer = newRef; this.innerText = newRef; data.siteProfiles[pageInfo.host] = { referer: newRef, userAgent: pageInfo.userAgent }; storage.set(data); toast('Đã lưu Referer'); }
        };
        
        // Initial render
        renderStreams(content, arr);
        // Highlight first tab
        document.querySelector('.__uvd_tab__').style.borderBottomColor = t.text;
        document.querySelector('.__uvd_tab__').style.color = t.text;
    }
    
    function renderStreams(container, arr) {
        var t = getTheme();
        if (!arr.length) {
            container.innerHTML = '<div style="text-align:center;padding:40px 20px;color:' + t.text3 + ';">Chưa tìm thấy stream<br><small style="color:' + t.text3 + ';">Bấm Play video để bắt đầu monitor</small></div>';
            return;
        }
        
        var typeColors = { 'M3U8': '#065f46', 'MPD': '#581c87', 'MP4': '#78350f', 'WEBM': '#78350f', 'MKV': '#7f1d1d', 'FLV': '#7f1d1d', 'TS': '#713f12', 'IFRAME': '#1e3a8a' };
        
        arr.forEach(function(item, i) {
            var url = item.url;
            var type = item.type;
            var color = typeColors[type] || '#27272a';
            var fav = isFavorite(url);
            
            var card = document.createElement('div');
            card.style.cssText = 'background:' + t.cardBg + ';padding:14px;margin-bottom:10px;border-radius:12px;border:1px solid ' + t.cardBorder + ';transition:all 0.2s;';
            card.onmouseover = function(){this.style.borderColor=t.borderHover;};
            card.onmouseout = function(){this.style.borderColor=t.cardBorder;};
            
            var headerRow = document.createElement('div');
            headerRow.style.cssText = 'display:flex;justify-content:space-between;margin-bottom:8px;align-items:center;';
            
            var badge = document.createElement('span');
            badge.style.cssText = 'background:' + color + ';color:#e4e4e7;padding:4px 10px;border-radius:6px;font-size:10px;font-weight:700;letter-spacing:0.5px;';
            badge.innerText = '#' + (i + 1) + ' ' + type;
            
            var actions = document.createElement('div');
            actions.style.cssText = 'display:flex;gap:6px;align-items:center;';
            
            var sourceLabel = document.createElement('span');
            sourceLabel.style.cssText = 'color:' + t.text3 + ';font-size:9px;font-family:monospace;';
            sourceLabel.innerText = item.source;
            
            var favBtn = document.createElement('button');
            favBtn.dataset.url = encodeURIComponent(url);
            favBtn.dataset.type = type;
            favBtn.className = '__uvd_fav_btn__';
            favBtn.style.cssText = 'background:transparent;border:0;cursor:pointer;padding:4px;transition:transform 0.2s;';
            favBtn.appendChild(cssIcon(fav ? 'star-full' : 'star-empty', fav ? '#facc15' : t.text3));
            favBtn.onmouseover = function(){this.style.transform='scale(1.2)';};
            favBtn.onmouseout = function(){this.style.transform='scale(1)';};
            favBtn.onclick = function() {
                var u = decodeURIComponent(this.dataset.url);
                var tp = this.dataset.type;
                var isFav = toggleFavorite(u, tp);
                this.innerHTML = '';
                this.appendChild(cssIcon(isFav ? 'star-full' : 'star-empty', isFav ? '#facc15' : getTheme().text3));
            };
            
            actions.appendChild(sourceLabel);
            actions.appendChild(favBtn);
            headerRow.appendChild(badge);
            headerRow.appendChild(actions);
            card.appendChild(headerRow);
            
            var urlBox = document.createElement('div');
            urlBox.style.cssText = 'word-break:break-all;font-size:10px;font-family:"SF Mono",Monaco,monospace;background:' + t.bg + ';padding:8px;margin-bottom:10px;border-radius:6px;max-height:50px;overflow-y:auto;color:' + t.text2 + ';line-height:1.4;border:1px solid ' + t.border + ';';
            urlBox.innerText = url;
            card.appendChild(urlBox);
            
            var btnGrid = document.createElement('div');
            btnGrid.style.cssText = 'display:grid;grid-template-columns:repeat(2,1fr);gap:6px;';
            
            function createBtn(text, icon, bgColor, hoverColor, textColor, onClick, full) {
                var btn = document.createElement('button');
                btn.style.cssText = 'background:' + bgColor + ';color:' + textColor + ';border:1px solid ' + t.border + ';padding:10px;border-radius:8px;font-size:11px;font-weight:600;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:5px;transition:all 0.2s;';
                if (full) btn.style.gridColumn = '1/3';
                btn.appendChild(cssIcon(icon, textColor));
                btn.appendChild(document.createTextNode(text));
                btn.onmouseover = function(){this.style.background=hoverColor;};
                btn.onmouseout = function(){this.style.background=bgColor;};
                btn.onclick = onClick;
                return btn;
            }
            
            btnGrid.appendChild(createBtn('Share', 'share', t.primary, t.primaryHover, t.primaryText, function() { addToHistory(url, type); shareUrl(url); }));
            btnGrid.appendChild(createBtn('Copy', 'copy', t.primary, t.primaryHover, t.primaryText, function() { addToHistory(url, type); copy(url); toast('Đã copy'); }));
            
            if (type === 'IFRAME') {
                var a = document.createElement('a');
                a.href = url;
                a.target = '_blank';
                a.style.cssText = 'background:' + t.info + ';color:#dbeafe;padding:10px;border-radius:8px;font-size:11px;font-weight:600;text-decoration:none;text-align:center;grid-column:1/3;display:flex;align-items:center;justify-content:center;gap:5px;transition:all 0.2s;border:1px solid ' + t.border + ';';
                a.appendChild(cssIcon('link', '#dbeafe'));
                a.appendChild(document.createTextNode('Mở iframe'));
                a.onmouseover = function(){this.style.background=t.infoHover;};
                a.onmouseout = function(){this.style.background=t.info;};
                btnGrid.appendChild(a);
            } else {
                if (type === 'M3U8') {
                    btnGrid.appendChild(createBtn('Quality', 'quality', t.accent, t.accentHover, t.primaryText, function() { showQualityPicker(url); }));
                }
                // PREVIEW for M3U8, MP4, WEBM, MKV (not just M3U8)
                if (type === 'M3U8' || type === 'MP4' || type === 'WEBM' || type === 'MKV') {
                    btnGrid.appendChild(createBtn('Preview', 'play', t.success, t.successHover, '#bbf7d0', function() { showPreview(url, type); }));
                }
                btnGrid.appendChild(createBtn('Commands', 'settings', t.primary, t.primaryHover, t.primaryText, function() { showCommandPicker(url, type); }, true));
            }
            
            card.appendChild(btnGrid);
            container.appendChild(card);
        });
    }
    
    function showQualityPicker(url) {
        var t = getTheme();
        var overlay = document.createElement('div');
        overlay.id = '__uvd_quality_overlay__';
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);z-index:2147483648;padding:20px;display:flex;align-items:center;justify-content:center;';
        
        var modal = document.createElement('div');
        modal.style.cssText = 'background:' + t.bg + ';backdrop-filter:' + t.blur + ';width:100%;max-width:480px;max-height:80vh;border-radius:16px;overflow:hidden;border:1px solid ' + t.border + ';box-shadow:' + t.shadow + ';';
        
        var header = document.createElement('div');
        header.style.cssText = 'background:' + t.bg2 + ';padding:14px 18px;border-bottom:1px solid ' + t.border + ';display:flex;justify-content:space-between;align-items:center;';
        var hTitle = document.createElement('div');
        hTitle.style.cssText = 'color:' + t.text + ';font-size:14px;font-weight:700;';
        hTitle.innerText = 'Quality selection';
        var closeBtn = document.createElement('button');
        closeBtn.style.cssText = 'background:' + t.danger + ';border:1px solid ' + t.border + ';width:32px;height:32px;border-radius:8px;cursor:pointer;display:flex;align-items:center;justify-content:center;color:#fecaca;';
        closeBtn.appendChild(cssIcon('close', '#fecaca'));
        closeBtn.onclick = function() { overlay.remove(); };
        header.appendChild(hTitle);
        header.appendChild(closeBtn);
        modal.appendChild(header);
        
        var body = document.createElement('div');
        body.style.cssText = 'padding:16px;max-height:60vh;overflow-y:auto;';
        body.innerHTML = '<div style="text-align:center;color:' + t.text3 + ';padding:20px;">Loading...</div>';
        modal.appendChild(body);
        overlay.appendChild(modal);
        document.body.appendChild(overlay);
        
        parseM3U8Master(url, function(qualities) {
            body.innerHTML = '';
            if (!qualities) {
                body.innerHTML = '<div style="text-align:center;color:' + t.text2 + ';padding:20px;">Not a Master Playlist</div>';
                return;
            }
            
            qualities.forEach(function(q) {
                var card = document.createElement('div');
                card.style.cssText = 'background:' + t.cardBg + ';padding:12px;margin-bottom:8px;border-radius:10px;border:1px solid ' + t.cardBorder + ';transition:all 0.2s;';
                card.onmouseover = function(){this.style.borderColor=t.borderHover;};
                card.onmouseout = function(){this.style.borderColor=t.cardBorder;};
                
                var info = document.createElement('div');
                info.style.cssText = 'display:flex;justify-content:space-between;margin-bottom:4px;';
                info.innerHTML = '<b style="color:' + t.text + ';font-size:13px;">' + q.label + '</b><span style="color:' + t.text3 + ';font-size:10px;">' + Math.round(q.bandwidth/1000) + ' kbps</span>';
                
                var meta = document.createElement('div');
                meta.style.cssText = 'color:' + t.text3 + ';font-size:9px;margin-bottom:10px;font-family:monospace;';
                meta.innerText = q.resolution + (q.codecs ? ' · ' + q.codecs : '');
                
                var btnRow = document.createElement('div');
                btnRow.style.cssText = 'display:grid;grid-template-columns:repeat(3,1fr);gap:5px;';
                
                function mkQBtn(text, icon, bg, hover, txt, onClick) {
                    var btn = document.createElement('button');
                    btn.style.cssText = 'background:' + bg + ';color:' + txt + ';border:1px solid ' + t.border + ';padding:8px;border-radius:6px;font-size:10px;font-weight:600;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:3px;transition:all 0.2s;';
                    btn.appendChild(cssIcon(icon, txt));
                    btn.appendChild(document.createTextNode(text));
                    btn.onmouseover = function(){this.style.background=hover;};
                    btn.onmouseout = function(){this.style.background=bg;};
                    btn.onclick = onClick;
                    return btn;
                }
                
                btnRow.appendChild(mkQBtn('Play', 'play', t.success, t.successHover, '#bbf7d0', function() { overlay.remove(); showPreview(q.url, 'M3U8'); }));
                btnRow.appendChild(mkQBtn('Share', 'share', t.primary, t.primaryHover, t.primaryText, function() { overlay.remove(); shareUrl(q.url); }));
                btnRow.appendChild(mkQBtn('Cmd', 'settings', t.primary, t.primaryHover, t.primaryText, function() { overlay.remove(); showCommandPicker(q.url, 'M3U8'); }));
                
                card.appendChild(info);
                card.appendChild(meta);
                card.appendChild(btnRow);
                body.appendChild(card);
            });
        });
    }
    
    function showPreview(url, type) {
        var t = getTheme();
        var existing = document.getElementById('__uvd_player__');
        if (existing) { var v = existing.querySelector('video'); if (v) { v.pause(); v.src = ''; } existing.remove(); }
        
        var overlay = document.createElement('div');
        overlay.id = '__uvd_player__';
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.97);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);z-index:2147483648;display:flex;flex-direction:column;';
        
        var header = document.createElement('div');
        header.style.cssText = 'background:' + t.bg2 + ';padding:10px 16px;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid ' + t.border + ';flex-shrink:0;';
        
        var title = document.createElement('div');
        title.innerHTML = '<div style="color:' + t.titleColor + ';font-size:13px;font-weight:700;">Video Player</div><div style="font-size:10px;color:' + t.text3 + ';margin-top:2px;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + pageInfo.title + '</div>';
        
        var btns = document.createElement('div');
        btns.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;';
        
        function mkPBtn(icon, text, bg, hover, txt, onClick) {
            var btn = document.createElement('button');
            btn.style.cssText = 'background:' + bg + ';border:1px solid ' + t.border + ';color:' + txt + ';padding:7px 11px;border-radius:7px;font-size:10px;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:5px;transition:all 0.2s;';
            btn.appendChild(cssIcon(icon, txt));
            btn.appendChild(document.createTextNode(text));
            btn.onmouseover = function(){this.style.background=hover;};
            btn.onmouseout = function(){this.style.background=bg;};
            btn.onclick = onClick;
            return btn;
        }
        
        btns.appendChild(mkPBtn('pip', 'PiP', t.primary, t.primaryHover, t.primaryText, function() {
            var video = document.getElementById('__uvd_video__');
            if (!video) return;
            if (document.pictureInPictureElement) {
                document.exitPictureInPicture().catch(function(){});
            } else if (video.requestPictureInPicture) {
                video.requestPictureInPicture().catch(function(err) { toast('PiP: ' + err.message); });
            } else {
                toast('PiP not supported');
            }
        }));
        
        btns.appendChild(mkPBtn('fullscreen', 'Full', t.primary, t.primaryHover, t.primaryText, function() {
            var video = document.getElementById('__uvd_video__');
            var wrapper = document.getElementById('__uvd_video_wrapper__');
            if (!video) return;
            
            if (document.fullscreenElement || document.webkitFullscreenElement) {
                if (document.exitFullscreen) document.exitFullscreen();
                else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
            } else {
                // Try iOS native fullscreen first (rotates automatically)
                if (video.webkitEnterFullscreen) {
                    video.webkitEnterFullscreen();
                } else if (wrapper.requestFullscreen) {
                    wrapper.requestFullscreen().then(function() {
                        // Lock to landscape
                        try {
                            if (screen.orientation && screen.orientation.lock) {
                                screen.orientation.lock('landscape').catch(function(){});
                            }
                        } catch(e) {}
                    }).catch(function(err) {
                        toast('Fullscreen: ' + err.message);
                    });
                } else if (wrapper.webkitRequestFullscreen) {
                    wrapper.webkitRequestFullscreen();
                }
            }
        }));
        
        btns.appendChild(mkPBtn('camera', 'Snap', t.success, t.successHover, '#bbf7d0', function() {
            var video = document.getElementById('__uvd_video__');
            if (!video) return;
            try {
                var canvas = document.createElement('canvas');
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;
                canvas.getContext('2d').drawImage(video, 0, 0);
                var link = document.createElement('a');
                link.download = 'snapshot_' + Date.now() + '.png';
                link.href = canvas.toDataURL('image/png');
                link.click();
                toast('Screenshot saved');
            } catch(e) {
                toast('Snap error: ' + e.message);
            }
        }));
        
        btns.appendChild(mkPBtn('close', 'Close', t.danger, t.dangerHover, '#fecaca', function() {
            var video = document.getElementById('__uvd_video__');
            if (video) { video.pause(); video.src = ''; }
            if (document.pictureInPictureElement) document.exitPictureInPicture().catch(function(){});
            if (document.fullscreenElement) document.exitFullscreen().catch(function(){});
            overlay.remove();
        }));
        
        header.appendChild(title);
        header.appendChild(btns);
        overlay.appendChild(header);
        
        var container = document.createElement('div');
        container.style.cssText = 'flex:1;display:flex;align-items:center;justify-content:center;padding:16px;overflow:hidden;';
        
        var wrapper = document.createElement('div');
        wrapper.id = '__uvd_video_wrapper__';
        wrapper.style.cssText = 'width:100%;max-width:1200px;position:relative;background:#000;border-radius:10px;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,0.7);';
        
        var video = document.createElement('video');
        video.id = '__uvd_video__';
        video.controls = true;
        video.autoplay = true;
        video.playsInline = true;
        video.setAttribute('webkit-playsinline', 'true');
        video.setAttribute('x5-video-player-type', 'h5');
        video.style.cssText = 'width:100%;max-height:calc(100vh - 120px);display:block;background:#000;';
        wrapper.appendChild(video);
        container.appendChild(wrapper);
        overlay.appendChild(container);
        
        var loading = document.createElement('div');
        loading.id = '__uvd_loading__';
        loading.innerHTML = '<div style="width:30px;height:30px;border:3px solid rgba(255,255,255,0.1);border-top-color:#fff;border-radius:50%;animation:uvdSpin 1s linear infinite;"></div>';
        loading.style.cssText = 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);color:#fff;padding:16px;z-index:10;display:flex;align-items:center;justify-content:center;';
        wrapper.appendChild(loading);
        
        // Add spin animation
        var spinStyle = document.createElement('style');
        spinStyle.textContent = '@keyframes uvdSpin{to{transform:rotate(360deg)}}';
        overlay.appendChild(spinStyle);
        
        document.body.appendChild(overlay);
        
        // Load video based on type
        var isM3U8 = url.includes('.m3u8') || type === 'M3U8';
        
        if (isM3U8) {
            if (window.Hls) {
                initHls();
            } else {
                var s = document.createElement('script');
                s.src = 'https://cdn.jsdelivr.net/npm/hls.js@latest';
                s.onload = initHls;
                s.onerror = function() { loading.innerHTML = 'HLS.js load failed'; video.src = url; };
                document.head.appendChild(s);
            }
        } else {
            // MP4/WEBM/MKV direct play
            video.src = url;
            video.onloadeddata = function() { loading.style.display = 'none'; };
            video.onerror = function() { 
                loading.innerHTML = '<div style="color:#fecaca;">Cannot play this format</div>';
            };
        }
        
        function initHls() {
            if (Hls.isSupported()) {
                var hls = new Hls({ enableWorker: true, lowLatencyMode: true });
                hls.loadSource(url);
                hls.attachMedia(video);
                hls.on(Hls.Events.MANIFEST_PARSED, function(event, data) {
                    loading.style.display = 'none';
                    video.play().catch(function(){});
                    if (data.levels && data.levels.length > 1) addQualitySelector(video, hls, data.levels, wrapper);
                });
                hls.on(Hls.Events.ERROR, function(event, d) {
                    if (d.fatal) {
                        loading.innerHTML = '<div style="color:#fecaca;">Error: ' + d.type + '</div>';
                    }
                });
                video.__hls__ = hls;
            } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
                video.src = url;
                video.onloadeddata = function() { loading.style.display = 'none'; };
            } else {
                loading.innerHTML = '<div style="color:#fecaca;">HLS not supported</div>';
            }
        }
        
        function addQualitySelector(video, hls, levels, wrapper) {
            // Toggle button (always visible)
            var toggleBtn = document.createElement('button');
            toggleBtn.id = '__uvd_q_toggle__';
            toggleBtn.style.cssText = 'position:absolute;top:10px;right:10px;background:rgba(0,0,0,0.7);border:1px solid rgba(255,255,255,0.15);color:#fff;padding:6px 10px;border-radius:6px;font-size:10px;font-weight:600;cursor:pointer;z-index:101;display:flex;align-items:center;gap:4px;backdrop-filter:blur(10px);transition:all 0.2s;';
            toggleBtn.appendChild(cssIcon('settings', '#fff'));
            toggleBtn.appendChild(document.createTextNode('Quality'));
            toggleBtn.onmouseover = function(){this.style.background='rgba(0,0,0,0.9)';};
            toggleBtn.onmouseout = function(){this.style.background='rgba(0,0,0,0.7)';};
            
            var div = document.createElement('div');
            div.id = '__uvd_quality_selector__';
            div.style.cssText = 'position:absolute;top:42px;right:10px;background:rgba(0,0,0,0.92);padding:10px;border-radius:8px;z-index:100;backdrop-filter:blur(12px);border:1px solid rgba(255,255,255,0.1);transition:opacity 0.3s;opacity:0;pointer-events:none;';
            
            var select = document.createElement('select');
            select.style.cssText = 'background:rgba(255,255,255,0.1);color:#fff;border:1px solid rgba(255,255,255,0.2);padding:6px 10px;border-radius:6px;font-size:11px;cursor:pointer;outline:none;min-width:120px;';
            
            var autoOpt = document.createElement('option');
            autoOpt.value = -1;
            autoOpt.textContent = 'Auto';
            autoOpt.style.background = '#1a1a1a';
            select.appendChild(autoOpt);
            
            levels.forEach(function(level, idx) {
                var opt = document.createElement('option');
                opt.value = idx;
                opt.textContent = (level.height ? level.height + 'p' : Math.round(level.bitrate/1000) + 'kbps');
                opt.style.background = '#1a1a1a';
                select.appendChild(opt);
            });
            
            select.onchange = function() {
                hls.currentLevel = parseInt(this.value);
                toast('Quality: ' + this.options[this.selectedIndex].textContent);
            };
            
            // Toggle show/hide
            toggleBtn.onclick = function(e) {
                e.stopPropagation();
                if (div.style.opacity === '1') {
                    div.style.opacity = '0';
                    div.style.pointerEvents = 'none';
                } else {
                    div.style.opacity = '1';
                    div.style.pointerEvents = 'auto';
                    // Auto-hide after 5s of inactivity
                    clearTimeout(window.__uvd_q_hide_timer);
                    window.__uvd_q_hide_timer = setTimeout(function() {
                        div.style.opacity = '0';
                        div.style.pointerEvents = 'none';
                    }, 5000);
                }
            };
            
            // Click outside to hide
            document.addEventListener('click', function(e) {
                if (!div.contains(e.target) && e.target !== toggleBtn && !toggleBtn.contains(e.target)) {
                    div.style.opacity = '0';
                    div.style.pointerEvents = 'none';
                }
            });
            
            div.appendChild(select);
            wrapper.appendChild(toggleBtn);
            wrapper.appendChild(div);
        }
    }
    
    function showCommandPicker(url, type) {
        var t = getTheme();
        var cmds = makeCommands(url, type, pageInfo.title);
        var overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);z-index:2147483648;padding:20px;overflow-y:auto;display:flex;justify-content:center;';
        
        var modal = document.createElement('div');
        modal.style.cssText = 'background:' + t.bg + ';backdrop-filter:' + t.blur + ';width:100%;max-width:560px;border-radius:16px;padding:18px;border:1px solid ' + t.border + ';box-shadow:' + t.shadow + ';';
        
        var header = document.createElement('div');
        header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;';
        var hTitle = document.createElement('div');
        hTitle.style.cssText = 'color:' + t.text + ';font-size:15px;font-weight:700;';
        hTitle.innerText = 'Download Commands';
        var closeBtn = document.createElement('button');
        closeBtn.style.cssText = 'background:' + t.danger + ';border:1px solid ' + t.border + ';width:32px;height:32px;border-radius:8px;cursor:pointer;display:flex;align-items:center;justify-content:center;color:#fecaca;';
        closeBtn.appendChild(cssIcon('close', '#fecaca'));
        closeBtn.onclick = function() { overlay.remove(); };
        header.appendChild(hTitle);
        header.appendChild(closeBtn);
        modal.appendChild(header);
        
        Object.keys(cmds).forEach(function(key) {
            var c = cmds[key];
            var card = document.createElement('div');
            card.style.cssText = 'background:' + t.cardBg + ';padding:12px;margin-bottom:8px;border-radius:10px;border:1px solid ' + t.cardBorder + ';transition:all 0.2s;';
            card.onmouseover = function(){this.style.borderColor=t.borderHover;};
            card.onmouseout = function(){this.style.borderColor=t.cardBorder;};
            
            var label = document.createElement('div');
            label.style.cssText = 'color:' + t.text + ';font-weight:700;margin-bottom:6px;font-size:12px;';
            label.innerText = c.label;
            
            var code = document.createElement('div');
            code.style.cssText = 'background:' + t.bg + ';padding:8px;border-radius:6px;font-family:monospace;font-size:10px;color:' + t.text2 + ';word-break:break-all;margin-bottom:8px;max-height:70px;overflow-y:auto;border:1px solid ' + t.border + ';';
            code.innerText = c.cmd;
            
            var btn = document.createElement('button');
            btn.style.cssText = 'background:' + t.primary + ';color:' + t.primaryText + ';border:1px solid ' + t.border + ';padding:8px 14px;border-radius:7px;font-weight:600;width:100%;cursor:pointer;transition:all 0.2s;font-size:11px;';
            btn.innerText = 'Copy & Edit';
            btn.onmouseover = function(){this.style.background=t.primaryHover;};
            btn.onmouseout = function(){this.style.background=t.primary;};
            btn.onclick = function() { overlay.remove(); showEditor(c.cmd, c.label); };
            
            card.appendChild(label);
            card.appendChild(code);
            card.appendChild(btn);
            modal.appendChild(card);
        });
        
        overlay.appendChild(modal);
        document.body.appendChild(overlay);
    }
    
    function showEditor(text, title) {
        var t = getTheme();
        var overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);z-index:2147483648;padding:20px;display:flex;align-items:center;justify-content:center;';
        
        var modal = document.createElement('div');
        modal.style.cssText = 'background:' + t.bg + ';backdrop-filter:' + t.blur + ';width:100%;max-width:560px;border-radius:16px;padding:18px;border:1px solid ' + t.border + ';box-shadow:' + t.shadow + ';';
        
        var header = document.createElement('div');
        header.style.cssText = 'margin-bottom:12px;';
        header.innerHTML = '<div style="color:' + t.text + ';font-weight:700;font-size:14px;margin-bottom:3px;">' + title + '</div><div style="color:' + t.text3 + ';font-size:10px;">Sửa lệnh trước khi copy</div>';
        modal.appendChild(header);
        
        var textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.cssText = 'width:100%;box-sizing:border-box;background:' + t.bg + ';color:' + t.text + ';border:1px solid ' + t.border + ';border-radius:8px;padding:10px;font:11px monospace;resize:none;line-height:1.5;min-height:110px;outline:none;';
        textarea.onfocus = function(){this.style.borderColor=t.borderHover;};
        textarea.onblur = function(){this.style.borderColor=t.border;};
        modal.appendChild(textarea);
        
        var btnRow = document.createElement('div');
        btnRow.style.cssText = 'display:flex;gap:6px;margin-top:12px;';
        
        function mkBtn(text, bg, hover, txt, onClick) {
            var btn = document.createElement('button');
            btn.style.cssText = 'background:' + bg + ';color:' + txt + ';border:1px solid ' + t.border + ';padding:11px;border-radius:8px;font-weight:600;flex:1;cursor:pointer;transition:all 0.2s;font-size:12px;';
            btn.innerText = text;
            btn.onmouseover = function(){this.style.background=hover;};
            btn.onmouseout = function(){this.style.background=bg;};
            btn.onclick = onClick;
            return btn;
        }
        
        btnRow.appendChild(mkBtn('Copy', t.primary, t.primaryHover, t.primaryText, function() { copy(textarea.value); overlay.remove(); toast('Đã copy!'); }));
        btnRow.appendChild(mkBtn('Share', t.info, t.infoHover, '#dbeafe', function() { var val = textarea.value; overlay.remove(); shareUrl(val); }));
        btnRow.appendChild(mkBtn('Cancel', t.primary, t.primaryHover, t.primaryText, function() { overlay.remove(); }));
        
        modal.appendChild(btnRow);
        overlay.appendChild(modal);
        document.body.appendChild(overlay);
        textarea.focus();
    }
    
    function renderFavorites(container) {
        var t = getTheme();
        if (!data.favorites.length) { container.innerHTML = '<div style="text-align:center;padding:40px 20px;color:' + t.text3 + ';">Chưa có favorites</div>'; return; }
        
        data.favorites.forEach(function(fav, i) {
            var card = document.createElement('div');
            card.style.cssText = 'background:' + t.cardBg + ';padding:12px;margin-bottom:8px;border-radius:10px;border-left:3px solid #facc15;border:1px solid ' + t.cardBorder + ';transition:all 0.2s;';
            card.onmouseover = function(){this.style.borderColor=t.borderHover;};
            card.onmouseout = function(){this.style.borderColor=t.cardBorder;};
            
            card.innerHTML = '<div style="display:flex;justify-content:space-between;margin-bottom:5px;"><b style="color:#facc15;font-size:11px;">★ ' + fav.type + '</b><span style="color:' + t.text3 + ';font-size:9px;">' + new Date(fav.timestamp).toLocaleDateString() + '</span></div><div style="color:' + t.text + ';font-size:11px;margin-bottom:3px;">' + fav.title + '</div><div style="color:' + t.text3 + ';font-size:9px;margin-bottom:5px;">' + fav.host + '</div><div style="word-break:break-all;font-size:9px;font-family:monospace;background:' + t.bg + ';padding:6px;border-radius:5px;margin-bottom:8px;max-height:40px;overflow-y:auto;color:' + t.text2 + ';border:1px solid ' + t.border + ';">' + fav.url + '</div>';
            
            var btnRow = document.createElement('div');
            btnRow.style.cssText = 'display:flex;gap:5px;';
            
            function mkFBtn(text, bg, hover, txt, onClick) {
                var btn = document.createElement('button');
                btn.style.cssText = 'background:' + bg + ';color:' + txt + ';border:1px solid ' + t.border + ';padding:7px;border-radius:6px;font-size:10px;font-weight:600;flex:1;cursor:pointer;transition:all 0.2s;';
                btn.innerText = text;
                btn.onmouseover = function(){this.style.background=hover;};
                btn.onmouseout = function(){this.style.background=bg;};
                btn.onclick = onClick;
                return btn;
            }
            
            btnRow.appendChild(mkFBtn('Share', t.primary, t.primaryHover, t.primaryText, function() { shareUrl(fav.url); }));
            btnRow.appendChild(mkFBtn('Copy', t.primary, t.primaryHover, t.primaryText, function() { copy(fav.url); toast('Copied'); }));
            
            var delBtn = document.createElement('button');
            delBtn.style.cssText = 'background:' + t.danger + ';border:1px solid ' + t.border + ';padding:7px 10px;border-radius:6px;cursor:pointer;transition:all 0.2s;color:#fecaca;';
            delBtn.appendChild(cssIcon('trash', '#fecaca'));
            delBtn.onmouseover = function(){this.style.background=t.dangerHover;};
            delBtn.onmouseout = function(){this.style.background=t.danger;};
            delBtn.onclick = function() { data.favorites.splice(i, 1); storage.set(data); renderFavorites(container); toast('Đã xóa'); };
            btnRow.appendChild(delBtn);
            
            card.appendChild(btnRow);
            container.appendChild(card);
        });
    }
    
    function renderHistory(container) {
        var t = getTheme();
        var history = data.history || [];
        if (!history.length) { container.innerHTML = '<div style="text-align:center;padding:40px 20px;color:' + t.text3 + ';">Chưa có history</div>'; return; }
        
        var clearBtn = document.createElement('button');
        clearBtn.innerText = 'Xóa tất cả history';
        clearBtn.style.cssText = 'background:' + t.danger + ';color:#fecaca;border:1px solid ' + t.border + ';padding:10px;border-radius:8px;font-weight:700;width:100%;margin-bottom:10px;cursor:pointer;transition:all 0.2s;font-size:11px;';
        clearBtn.onmouseover = function(){this.style.background=t.dangerHover;};
        clearBtn.onmouseout = function(){this.style.background=t.danger;};
        clearBtn.onclick = function() { if (confirm('Xóa toàn bộ history?')) { data.history = []; storage.set(data); renderHistory(container); } };
        container.appendChild(clearBtn);
        
        history.forEach(function(h) {
            var card = document.createElement('div');
            card.style.cssText = 'background:' + t.cardBg + ';padding:10px;margin-bottom:6px;border-radius:8px;border:1px solid ' + t.cardBorder + ';transition:all 0.2s;';
            card.onmouseover = function(){this.style.borderColor=t.borderHover;};
            card.onmouseout = function(){this.style.borderColor=t.cardBorder;};
            card.innerHTML = '<div style="display:flex;justify-content:space-between;margin-bottom:3px;"><b style="color:' + t.text + ';font-size:10px;">' + h.type + '</b><span style="color:' + t.text3 + ';font-size:9px;">' + new Date(h.timestamp).toLocaleString() + '</span></div><div style="color:' + t.text2 + ';font-size:10px;margin-bottom:2px;">' + h.title + '</div><div style="color:' + t.text3 + ';font-size:9px;margin-bottom:3px;">' + h.host + '</div><div style="word-break:break-all;font-size:9px;font-family:monospace;color:' + t.text2 + ';max-height:35px;overflow-y:auto;">' + h.url + '</div>';
            container.appendChild(card);
        });
    }
    
    function renderSettings(container) {
        var t = getTheme();
        var html = '<div style="color:' + t.text + ';font-weight:700;margin-bottom:14px;font-size:14px;">Settings</div>';
        
        html += '<div style="background:' + t.cardBg + ';padding:14px;margin-bottom:10px;border-radius:10px;border:1px solid ' + t.cardBorder + ';">';
        html += '<div style="color:' + t.text + ';font-weight:700;margin-bottom:10px;font-size:12px;">Theme</div>';
        html += '<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:6px;">';
        ['dark', 'light'].forEach(function(th) {
            var active = data.theme === th;
            html += '<button class="__uvd_theme__" data-theme="' + th + '" style="background:' + (active ? t.primaryHover : t.primary) + ';color:' + t.primaryText + ';border:1px solid ' + (active ? t.borderHover : t.border) + ';padding:10px;border-radius:8px;font-weight:700;text-transform:capitalize;cursor:pointer;transition:all 0.2s;font-size:11px;">' + th + '</button>';
        });
        html += '</div></div>';
        
        html += '<div style="background:' + t.cardBg + ';padding:14px;margin-bottom:10px;border-radius:10px;border:1px solid ' + t.cardBorder + ';">';
        html += '<div style="color:' + t.text + ';font-weight:700;margin-bottom:10px;font-size:12px;">Site Profiles</div>';
        var profiles = Object.keys(data.siteProfiles);
        if (!profiles.length) {
            html += '<div style="color:' + t.text3 + ';font-size:10px;">Chưa có profile. Bấm vào Referer để lưu.</div>';
        } else {
            profiles.forEach(function(p) {
                html += '<div style="background:' + t.bg + ';padding:8px;margin-bottom:6px;border-radius:6px;font-size:10px;border:1px solid ' + t.border + ';">';
                html += '<div style="color:' + t.text + ';font-weight:700;margin-bottom:3px;">' + p + '</div>';
                html += '<div style="color:' + t.text3 + ';font-family:monospace;font-size:9px;word-break:break-all;margin-bottom:5px;">' + data.siteProfiles[p].referer + '</div>';
                html += '<button class="__uvd_delprofile__" data-host="' + p + '" style="background:' + t.danger + ';color:#fecaca;border:1px solid ' + t.border + ';padding:4px 8px;border-radius:5px;font-size:9px;cursor:pointer;">Xóa</button>';
                html += '</div>';
            });
        }
        html += '</div>';
        
        html += '<div style="background:' + t.cardBg + ';padding:14px;margin-bottom:10px;border-radius:10px;border:1px solid ' + t.cardBorder + ';">';
        html += '<div style="color:' + t.text + ';font-weight:700;margin-bottom:10px;font-size:12px;">Backup</div>';
        html += '<button id="__uvd_backup__" style="background:' + t.primary + ';color:' + t.primaryText + ';border:1px solid ' + t.border + ';padding:9px;border-radius:7px;font-weight:700;width:100%;margin-bottom:5px;cursor:pointer;font-size:11px;">Export data</button>';
        html += '<button id="__uvd_restore__" style="background:' + t.primary + ';color:' + t.primaryText + ';border:1px solid ' + t.border + ';padding:9px;border-radius:7px;font-weight:700;width:100%;margin-bottom:5px;cursor:pointer;font-size:11px;">Import data</button>';
        html += '<button id="__uvd_reset__" style="background:' + t.danger + ';color:#fecaca;border:1px solid ' + t.border + ';padding:9px;border-radius:7px;font-weight:700;width:100%;cursor:pointer;font-size:11px;">Reset toàn bộ</button>';
        html += '</div>';
        
        html += '<div style="background:' + t.cardBg + ';padding:12px;border-radius:10px;border:1px solid ' + t.cardBorder + ';font-size:10px;color:' + t.text2 + ';">';
        html += '<div style="margin-bottom:3px;">Version: 2.0 Glass UI</div>';
        html += '<div style="margin-bottom:3px;">By: nguyenquocngu93</div>';
        html += '<div style="margin-bottom:3px;">Favorites: ' + data.favorites.length + '</div>';
        html += '<div style="margin-bottom:3px;">History: ' + (data.history || []).length + '</div>';
        html += '<div>Site profiles: ' + Object.keys(data.siteProfiles).length + '</div>';
        html += '</div>';
        
        container.innerHTML = html;
        
        document.querySelectorAll('.__uvd_theme__').forEach(function(b) {
            b.onclick = function() {
                data.theme = this.dataset.theme;
                storage.set(data);
                buildUI();
                toast('Theme: ' + data.theme);
            };
        });
        
        document.querySelectorAll('.__uvd_delprofile__').forEach(function(b) {
            b.onclick = function() {
                delete data.siteProfiles[this.dataset.host];
                storage.set(data);
                var ct = document.getElementById('__uvd_content__');
                if (ct) renderSettings(ct);
                toast('Đã xóa profile');
            };
        });
        
        document.getElementById('__uvd_backup__').onclick = function() {
            var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            var a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = 'uvd_backup_' + Date.now() + '.json';
            a.click();
            toast('Đã export backup');
        };
        
        document.getElementById('__uvd_restore__').onclick = function() {
            var input = document.createElement('input');
            input.type = 'file';
            input.accept = '.json';
            input.onchange = function(e) {
                var reader = new FileReader();
                reader.onload = function(ev) {
                    try {
                        var newData = JSON.parse(ev.target.result);
                        data = Object.assign(data, newData);
                        storage.set(data);
                        toast('Đã import');
                        buildUI();
                    } catch(err) { toast('File không hợp lệ'); }
                };
                reader.readAsText(e.target.files[0]);
            };
            input.click();
        };
        
        document.getElementById('__uvd_reset__').onclick = function() {
            if (confirm('Xóa TOÀN BỘ favorites, history, settings?')) {
                localStorage.removeItem(STORAGE_KEY);
                data = { favorites: [], theme: 'dark', siteProfiles: {}, history: [] };
                toast('Đã reset');
                buildUI();
            }
        };
    }
    
    buildUI();
    
    var lastCount = urls.size;
    var autoRefresh = setInterval(function() {
        if (!document.getElementById('__uvd__')) { clearInterval(autoRefresh); stopMonitor(); return; }
        if (urls.size !== lastCount) {
            lastCount = urls.size;
            // Update live count without rebuild
            var liveDiv = document.querySelector('#__uvd_header__ > div:first-child > div:last-child');
            if (liveDiv) {
                liveDiv.innerHTML = '';
                liveDiv.appendChild(cssIcon('live'));
                liveDiv.appendChild(document.createTextNode(' ' + lastCount + ' streams · ' + pageInfo.host));
            }
        }
    }, 2000);
    
    console.log('[UVD] Loaded! Found', urls.size, 'streams');
    toast('Ready!');
})();