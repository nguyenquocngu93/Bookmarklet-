/**
 * Universal Video Downloader V2 - Glass UI Premium Fixed
 * Features: Enhanced Glassmorphism, Fixed Minimize, Auto-hide controls, Landscape fullscreen
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
            'yt-dlp-aria': { label: 'yt-dlp + aria2 (nhanh nhất)', cmd: 'yt-dlp --referer "' + ref + '" --downloader aria2c --downloader-args "aria2c:-x 16 -s 16 -k 1M" --concurrent-fragments 8 -o "' + t + '.%(ext)s" "' + url + '"' },
            'yt-dlp-sub': { label: 'yt-dlp + phụ đề', cmd: 'yt-dlp --referer "' + ref + '" --write-sub --sub-langs "vi,en" --embed-subs -o "' + t + '.%(ext)s" "' + url + '"' },
            'ffmpeg': { label: 'FFmpeg (M3U8 → MP4)', cmd: 'ffmpeg -headers "Referer: ' + ref + '\\r\\nOrigin: ' + origin + '\\r\\nUser-Agent: ' + ua + '" -i "' + url + '" -c copy -bsf:a aac_adtstoasc "' + t + '.mp4"' },
            'ffmpeg-audio': { label: 'FFmpeg (chỉ audio)', cmd: 'ffmpeg -headers "Referer: ' + ref + '" -i "' + url + '" -vn -c:a copy "' + t + '.aac"' },
            'ffmpeg-cut': { label: 'FFmpeg (cắt đoạn)', cmd: 'ffmpeg -headers "Referer: ' + ref + '" -ss 00:00:00 -to 00:05:00 -i "' + url + '" -c copy "' + t + '_cut.mp4"' },
            'curl': { label: 'cURL', cmd: 'curl -H "Referer: ' + ref + '" -o "' + t + '.' + ext + '" "' + url + '"' },
            'aria2': { label: 'aria2c', cmd: 'aria2c --referer="' + ref + '" -x 16 -s 16 -o "' + t + '.' + ext + '" "' + url + '"' },
            'wget': { label: 'wget', cmd: 'wget --referer="' + ref + '" -O "' + t + '.' + ext + '" "' + url + '"' }
        };
    }
    
    var themes = {
        dark: {
            bg: 'rgba(10, 10, 15, 0.65)',
            bg2: 'rgba(20, 20, 30, 0.55)',
            bg3: 'rgba(30, 30, 45, 0.45)',
            text: '#ffffff',
            text2: '#94a3b8',
            text3: '#64748b',
            primary: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            primarySolid: '#667eea',
            accent: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
            accentSolid: '#f5576c',
            danger: 'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
            dangerSolid: '#fa709a',
            border: 'rgba(255, 255, 255, 0.12)',
            shadow: '0 8px 32px 0 rgba(0, 0, 0, 0.5)',
            blur: 'blur(30px)',
            cardBg: 'rgba(255, 255, 255, 0.08)',
            cardBorder: 'rgba(255, 255, 255, 0.1)',
            highlight: 'rgba(255, 255, 255, 0.05)'
        },
        light: {
            bg: 'rgba(255, 255, 255, 0.65)',
            bg2: 'rgba(248, 250, 252, 0.55)',
            bg3: 'rgba(241, 245, 249, 0.45)',
            text: '#0f172a',
            text2: '#475569',
            text3: '#94a3b8',
            primary: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            primarySolid: '#667eea',
            accent: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
            accentSolid: '#f5576c',
            danger: 'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
            dangerSolid: '#fa709a',
            border: 'rgba(0, 0, 0, 0.1)',
            shadow: '0 8px 32px 0 rgba(0, 0, 0, 0.15)',
            blur: 'blur(30px)',
            cardBg: 'rgba(255, 255, 255, 0.7)',
            cardBorder: 'rgba(0, 0, 0, 0.08)',
            highlight: 'rgba(0, 0, 0, 0.03)'
        }
    };
    
    function getTheme() { return themes[data.theme] || themes.dark; }
    
    function copy(text) {
        var t = document.createElement('textarea');
        t.value = text;
        document.body.appendChild(t);
        t.select();
        document.execCommand('copy');
        t.remove();
    }
    
    function toast(msg) {
        var t = getTheme();
        var el = document.createElement('div');
        el.innerText = msg;
        el.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);background:' + t.bg + ';backdrop-filter:' + t.blur + ';-webkit-backdrop-filter:' + t.blur + ';color:' + t.text + ';padding:12px 24px;border-radius:14px;z-index:2147483649;font:500 13px -apple-system,Arial;border:1px solid ' + t.border + ';box-shadow:' + t.shadow + ';transition:all 0.3s cubic-bezier(0.4, 0, 0.2, 1);animation:uvdSlideDown 0.4s cubic-bezier(0.4, 0, 0.2, 1);';
        document.body.appendChild(el);
        setTimeout(function() { 
            el.style.opacity = '0'; 
            el.style.transform = 'translate(-50%, -20px)'; 
            setTimeout(function(){el.remove();}, 300); 
        }, 2500);
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
        el.style.cssText = 'display:inline-flex;align-items:center;justify-content:center;';
        
        switch(name) {
            case 'close':
                el.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="' + color + '" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
                break;
            case 'refresh':
                el.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="' + color + '" stroke-width="2.5" stroke-linecap="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>';
                break;
            case 'minimize':
                el.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="' + color + '" stroke-width="2.5" stroke-linecap="round"><line x1="4" y1="12" x2="20" y2="12"/></svg>';
                break;
            case 'expand':
                el.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="' + color + '" stroke-width="2.5" stroke-linecap="round"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>';
                break;
            case 'star-full':
                el.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="#fbbf24" stroke="#fbbf24" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>';
                break;
            case 'star-empty':
                el.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="' + color + '" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>';
                break;
            case 'play':
                el.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="' + color + '" stroke="' + color + '" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>';
                break;
            case 'pip':
                el.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="' + color + '" stroke-width="2"><rect x="2" y="4" width="20" height="16" rx="2"/><rect x="12" y="12" width="8" height="6" fill="' + color + '" opacity="0.3"/></svg>';
                break;
            case 'fullscreen':
                el.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="' + color + '" stroke-width="2"><path d="M8 3H5a2 2 0 00-2 2v3m18 0V5a2 2 0 00-2-2h-3m0 18h3a2 2 0 002-2v-3M3 16v3a2 2 0 002 2h3"/></svg>';
                break;
            case 'camera':
                el.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="' + color + '" stroke-width="2"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg>';
                break;
            case 'settings':
                el.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="' + color + '" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/></svg>';
                break;
            case 'download':
                el.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="' + color + '" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>';
                break;
            case 'copy':
                el.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="' + color + '" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>';
                break;
            case 'share':
                el.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="' + color + '" stroke-width="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>';
                break;
            case 'quality':
                el.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="' + color + '" stroke-width="2"><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/></svg>';
                break;
            case 'trash':
                el.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="' + color + '" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>';
                break;
            case 'live':
                el.innerHTML = '<span style="width:8px;height:8px;background:#ef4444;border-radius:50%;box-shadow:0 0 8px #ef4444;animation:uvdPulse 2s infinite;"></span>';
                break;
        }
        return el;
    }
    
    function buildUI() {
        var t = getTheme();
        var arr = [...urls.entries()].map(function(e) {
            return { url: e[0], type: e[1].type, source: e[1].source, priority: e[1].priority };
        }).sort(function(a, b) { return a.priority - b.priority; });
        
        var panel = document.createElement('div');
        panel.id = '__uvd__';
        panel.style.cssText = 'position:fixed;top:10px;left:10px;right:10px;bottom:10px;background:' + t.bg + ';backdrop-filter:' + t.blur + ';-webkit-backdrop-filter:' + t.blur + ';color:' + t.text + ';padding:0;border-radius:20px;z-index:2147483647;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;font-size:13px;overflow:hidden;display:flex;flex-direction:column;box-shadow:' + t.shadow + ';border:1px solid ' + t.border + ';animation:uvdFadeIn 0.4s cubic-bezier(0.4, 0, 0.2, 1);';
        
        var style = document.createElement('style');
        style.textContent = '@keyframes uvdFadeIn{from{opacity:0;transform:scale(0.95)}to{opacity:1;transform:scale(1)}}@keyframes uvdSlideDown{from{opacity:0;transform:translate(-50%,-20px)}to{opacity:1;transform:translate(-50%,0)}}@keyframes uvdPulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:0.5;transform:scale(1.1)}}@keyframes uvdShimmer{0%{background-position:-200% 0}100%{background-position:200% 0}}#__uvd__ ::-webkit-scrollbar{width:6px}#__uvd__ ::-webkit-scrollbar-thumb{background:' + t.primarySolid + ';border-radius:3px;transition:all 0.3s}#__uvd__ ::-webkit-scrollbar-thumb:hover{background:' + t.accentSolid + '}#__uvd__ ::-webkit-scrollbar-track{background:transparent}';
        panel.appendChild(style);
        
        // Header - Always visible
        var header = document.createElement('div');
        header.style.cssText = 'background:' + t.bg2 + ';padding:16px 20px;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid ' + t.border + ';backdrop-filter:' + t.blur + ';-webkit-backdrop-filter:' + t.blur + ';position:relative;z-index:10;';
        
        var titleDiv = document.createElement('div');
        titleDiv.innerHTML = '<b style="font-size:18px;background:' + t.primary + ';-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;font-weight:700;">Universal DL V2</b><div style="font-size:11px;color:' + t.text2 + ';margin-top:4px;display:flex;align-items:center;gap:6px;"></div>';
        var liveSpan = titleDiv.querySelector('div');
        liveSpan.appendChild(cssIcon('live'));
        liveSpan.appendChild(document.createTextNode(' LIVE · ' + arr.length + ' streams · ' + pageInfo.host));
        
        var btnGroup = document.createElement('div');
        btnGroup.style.cssText = 'display:flex;gap:10px;';
        
        function createHeaderBtn(icon, title, gradient, onClick) {
            var btn = document.createElement('button');
            btn.title = title;
            btn.style.cssText = 'background:' + gradient + ';border:0;width:40px;height:40px;border-radius:12px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all 0.3s cubic-bezier(0.4, 0, 0.2, 1);color:#fff;box-shadow:0 4px 12px rgba(0,0,0,0.2);';
            btn.appendChild(icon);
            btn.onmouseover = function(){this.style.transform='translateY(-2px) scale(1.05)';this.style.boxShadow='0 6px 16px rgba(0,0,0,0.3)';};
            btn.onmouseout = function(){this.style.transform='translateY(0) scale(1)';this.style.boxShadow='0 4px 12px rgba(0,0,0,0.2)';};
            btn.onclick = onClick;
            return btn;
        }
        
        var btnRef = createHeaderBtn(cssIcon('refresh', '#fff'), 'Refresh', t.primary, function() { buildUI(); toast('Refreshed'); });
        var btnMin = createHeaderBtn(cssIcon('minimize', '#fff'), 'Minimize', t.primary, function() {
            var isMin = content.style.display === 'none';
            content.style.display = isMin ? 'block' : 'none';
            footer.style.display = isMin ? 'flex' : 'none';
            tabs.style.display = isMin ? 'flex' : 'none';
            info.style.display = isMin ? 'block' : 'none';
            this.innerHTML = '';
            this.appendChild(cssIcon(isMin ? 'minimize' : 'expand', '#fff'));
        });
        var btnClose = createHeaderBtn(cssIcon('close', '#fff'), 'Close', t.danger, function() { 
            stopMonitor(); 
            panel.remove(); 
        });
        
        btnGroup.appendChild(btnRef);
        btnGroup.appendChild(btnMin);
        btnGroup.appendChild(btnClose);
        header.appendChild(titleDiv);
        header.appendChild(btnGroup);
        panel.appendChild(header);
        
        // Tabs - Hidden when minimized
        var tabs = document.createElement('div');
        tabs.style.cssText = 'display:flex;background:' + t.bg2 + ';border-bottom:1px solid ' + t.border + ';';
        var tabList = [
            { id: 'streams', label: 'Streams (' + arr.length + ')' },
            { id: 'favorites', label: 'Favorites (' + data.favorites.length + ')' },
            { id: 'history', label: 'History (' + (data.history || []).length + ')' },
            { id: 'settings', label: 'Settings' }
        ];
        tabList.forEach(function(tab) {
            var b = document.createElement('button');
            b.className = '__uvd_tab__';
            b.dataset.tab = tab.id;
            b.innerText = tab.label;
            b.style.cssText = 'flex:1;background:transparent;color:' + t.text2 + ';border:0;padding:12px 5px;font-size:12px;font-weight:600;cursor:pointer;border-bottom:3px solid transparent;transition:all 0.3s cubic-bezier(0.4, 0, 0.2, 1);position:relative;';
            b.onmouseover = function(){this.style.color=t.text;this.style.background=t.highlight;};
            b.onmouseout = function(){if(this.dataset.tab !== currentTab){this.style.color=t.text2;this.style.background='transparent';}};
            tabs.appendChild(b);
        });
        panel.appendChild(tabs);
        
        // Info bar - Hidden when minimized
        var info = document.createElement('div');
        info.style.cssText = 'background:' + t.bg2 + ';padding:12px 20px;border-bottom:1px solid ' + t.border + ';font-size:11px;backdrop-filter:' + t.blur + ';-webkit-backdrop-filter:' + t.blur + ';';
        info.innerHTML = '<div style="color:' + t.text2 + ';display:flex;align-items:center;gap:8px;margin-bottom:6px;"><span style="opacity:0.6;">' + cssIcon('copy', t.text2).outerHTML + '</span><span id="__uvd_title__" style="color:' + t.text + ';font-weight:600;cursor:pointer;transition:color 0.3s;">' + pageInfo.title + '</span><span style="color:' + t.text3 + ';font-size:10px;">(bấm sửa)</span></div><div style="color:' + t.text2 + ';display:flex;align-items:center;gap:8px;"><span style="opacity:0.6;">' + cssIcon('share', t.text2).outerHTML + '</span><span id="__uvd_referer__" style="color:' + t.text2 + ';font-family:monospace;font-size:10px;cursor:pointer;text-decoration:underline;">' + pageInfo.referer + '</span></div>';
        panel.appendChild(info);
        
        // Content area - Hidden when minimized
        var content = document.createElement('div');
        content.id = '__uvd_content__';
        content.style.cssText = 'flex:1;overflow-y:auto;padding:15px;';
        panel.appendChild(content);
        
        // Footer - Hidden when minimized
        var footer = document.createElement('div');
        footer.style.cssText = 'background:' + t.bg2 + ';padding:12px;border-top:1px solid ' + t.border + ';display:flex;gap:8px;backdrop-filter:' + t.blur + ';-webkit-backdrop-filter:' + t.blur + ';';
        ['TXT', 'JSON', 'M3U', 'CSV'].forEach(function(fmt) {
            var btn = document.createElement('button');
            btn.id = '__uvd_export_' + fmt.toLowerCase() + '__';
            btn.style.cssText = 'background:' + t.cardBg + ';color:' + t.text + ';border:1px solid ' + t.cardBorder + ';padding:10px;border-radius:10px;font-size:11px;font-weight:600;flex:1;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px;transition:all 0.3s cubic-bezier(0.4, 0, 0.2, 1);backdrop-filter:blur(10px);';
            btn.appendChild(cssIcon('download', t.text));
            btn.appendChild(document.createTextNode(fmt));
            btn.onmouseover = function(){this.style.background=t.primary;this.style.color='#fff';this.style.borderColor='transparent';this.style.transform='translateY(-2px)';};
            btn.onmouseout = function(){this.style.background=t.cardBg;this.style.color=t.text;this.style.borderColor=t.cardBorder;this.style.transform='translateY(0)';};
            footer.appendChild(btn);
        });
        panel.appendChild(footer);
        
        document.body.appendChild(panel);
        
        var currentTab = 'streams';
        function renderTab(tabId) {
            currentTab = tabId;
            document.querySelectorAll('.__uvd_tab__').forEach(function(tb) {
                if (tb.dataset.tab === tabId) {
                    tb.style.borderBottomColor = t.primarySolid;
                    tb.style.color = t.text;
                    tb.style.background = t.highlight;
                } else {
                    tb.style.borderBottomColor = 'transparent';
                    tb.style.color = t.text2;
                    tb.style.background = 'transparent';
                }
            });
            content.innerHTML = '';
            if (tabId === 'streams') renderStreams(content, arr);
            else if (tabId === 'favorites') renderFavorites(content);
            else if (tabId === 'history') renderHistory(content);
            else if (tabId === 'settings') renderSettings(content);
        }
        
        document.querySelectorAll('.__uvd_tab__').forEach(function(tb) {
            tb.onclick = function() { renderTab(this.dataset.tab); };
        });
        
        renderTab('streams');
        
        document.getElementById('__uvd_title__').onclick = function() {
            var newTitle = prompt('Tên file:', pageInfo.title);
            if (newTitle) { pageInfo.title = newTitle.replace(/[^\w\s\u00C0-\u1EF9.-]/g, '').substring(0, 100); this.innerText = pageInfo.title; }
        };
        document.getElementById('__uvd_referer__').onclick = function() {
            var newRef = prompt('Referer:', pageInfo.referer);
            if (newRef) { pageInfo.referer = newRef; this.innerText = newRef; data.siteProfiles[pageInfo.host] = { referer: newRef, userAgent: pageInfo.userAgent }; storage.set(data); toast('Đã lưu Referer'); }
        };
        
        document.getElementById('__uvd_export_txt__').onclick = function() { exportData('txt'); };
        document.getElementById('__uvd_export_json__').onclick = function() { exportData('json'); };
        document.getElementById('__uvd_export_m3u__').onclick = function() { exportData('m3u'); };
        document.getElementById('__uvd_export_csv__').onclick = function() { exportData('csv'); };
    }
    
    function renderStreams(container, arr) {
        var t = getTheme();
        if (!arr.length) {
            container.innerHTML = '<div style="text-align:center;padding:40px 20px;color:' + t.text2 + ';animation:uvdFadeIn 0.4s;">Chưa tìm thấy stream nào<br><small style="color:' + t.text3 + ';">Đang monitor... Bấm Play video hoặc load thêm</small></div>';
            return;
        }
        
        var typeColors = { 'M3U8': '#10b981', 'MPD': '#8b5cf6', 'MP4': '#f59e0b', 'WEBM': '#f59e0b', 'MKV': '#ef4444', 'FLV': '#ef4444', 'TS': '#eab308', 'IFRAME': '#3b82f6' };
        
        arr.forEach(function(item, i) {
            var url = item.url;
            var type = item.type;
            var color = typeColors[type] || '#666';
            var fav = isFavorite(url);
            
            var card = document.createElement('div');
            card.style.cssText = 'background:' + t.cardBg + ';backdrop-filter:blur(10px);padding:16px;margin-bottom:12px;border-radius:14px;border:1px solid ' + t.cardBorder + ';transition:all 0.3s cubic-bezier(0.4, 0, 0.2, 1);animation:uvdFadeIn 0.4s cubic-bezier(0.4, 0, 0.2, 1);animation-delay:' + (i * 0.05) + 's;animation-fill-mode:both;';
            card.onmouseover = function(){this.style.transform='translateY(-3px)';this.style.boxShadow='0 8px 24px rgba(0,0,0,0.3)';this.style.borderColor=t.primarySolid;};
            card.onmouseout = function(){this.style.transform='translateY(0)';this.style.boxShadow='none';this.style.borderColor=t.cardBorder;};
            
            var headerRow = document.createElement('div');
            headerRow.style.cssText = 'display:flex;justify-content:space-between;margin-bottom:10px;align-items:center;';
            
            var badge = document.createElement('span');
            badge.style.cssText = 'background:' + color + ';color:#fff;padding:5px 12px;border-radius:8px;font-size:11px;font-weight:700;box-shadow:0 2px 8px ' + color + '40;';
            badge.innerText = '#' + (i + 1) + ' ' + type;
            
            var actions = document.createElement('div');
            actions.style.cssText = 'display:flex;gap:8px;align-items:center;';
            
            var sourceLabel = document.createElement('span');
            sourceLabel.style.cssText = 'color:' + t.text3 + ';font-size:10px;';
            sourceLabel.innerText = item.source;
            
            var favBtn = document.createElement('button');
            favBtn.style.cssText = 'background:transparent;border:0;cursor:pointer;padding:4px;transition:transform 0.2s;';
            favBtn.appendChild(cssIcon(fav ? 'star-full' : 'star-empty', fav ? '#fbbf24' : t.text3));
            favBtn.onmouseover = function(){this.style.transform='scale(1.2)';};
            favBtn.onmouseout = function(){this.style.transform='scale(1)';};
            favBtn.onclick = function() {
                var isFav = toggleFavorite(url, type);
                this.innerHTML = '';
                this.appendChild(cssIcon(isFav ? 'star-full' : 'star-empty', isFav ? '#fbbf24' : t.text3));
            };
            
            actions.appendChild(sourceLabel);
            actions.appendChild(favBtn);
            headerRow.appendChild(badge);
            headerRow.appendChild(actions);
            card.appendChild(headerRow);
            
            var urlBox = document.createElement('div');
            urlBox.style.cssText = 'word-break:break-all;font-size:11px;font-family:"SF Mono",Monaco,monospace;background:' + t.bg + ';padding:10px;margin-bottom:12px;border-radius:8px;max-height:60px;overflow-y:auto;color:' + t.text2 + ';line-height:1.5;border:1px solid ' + t.border + ';';
            urlBox.innerText = url;
            card.appendChild(urlBox);
            
            var btnGrid = document.createElement('div');
            btnGrid.style.cssText = 'display:grid;grid-template-columns:repeat(2,1fr);gap:8px;';
            
            function createBtn(text, icon, gradient, onClick, full) {
                var btn = document.createElement('button');
                btn.style.cssText = 'background:' + gradient + ';color:#fff;border:0;padding:12px;border-radius:10px;font-size:12px;font-weight:600;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px;transition:all 0.3s cubic-bezier(0.4, 0, 0.2, 1);box-shadow:0 4px 12px rgba(0,0,0,0.2);';
                if (full) btn.style.gridColumn = '1/3';
                btn.appendChild(icon);
                btn.appendChild(document.createTextNode(text));
                btn.onmouseover = function(){this.style.transform='translateY(-2px)';this.style.boxShadow='0 6px 16px rgba(0,0,0,0.3)';};
                btn.onmouseout = function(){this.style.transform='translateY(0)';this.style.boxShadow='0 4px 12px rgba(0,0,0,0.2)';};
                btn.onclick = onClick;
                return btn;
            }
            
            btnGrid.appendChild(createBtn('YTDLnis', cssIcon('share', '#fff'), t.danger, function() { addToHistory(url, type); shareUrl(url); }));
            btnGrid.appendChild(createBtn('Copy', cssIcon('copy', '#fff'), t.primary, function() { addToHistory(url, type); copy(url); toast('Đã copy'); }));
            
            if (type === 'IFRAME') {
                var a = document.createElement('a');
                a.href = url;
                a.target = '_blank';
                a.style.cssText = 'background:' + t.accent + ';color:#fff;padding:12px;border-radius:10px;font-size:12px;font-weight:600;text-decoration:none;text-align:center;grid-column:1/3;display:flex;align-items:center;justify-content:center;gap:6px;transition:all 0.3s;box-shadow:0 4px 12px rgba(0,0,0,0.2);';
                a.innerText = 'Vào iframe';
                a.onmouseover = function(){this.style.transform='translateY(-2px)';};
                a.onmouseout = function(){this.style.transform='translateY(0)';};
                btnGrid.appendChild(a);
            } else {
                if (type === 'M3U8') {
                    btnGrid.appendChild(createBtn('Quality', cssIcon('quality', '#fff'), t.primary, function() { showQualityPicker(url); }));
                    btnGrid.appendChild(createBtn('Preview', cssIcon('play', '#fff'), t.accent, function() { showPreview(url); }));
                }
                btnGrid.appendChild(createBtn('Tất cả lệnh tải', cssIcon('settings', '#fff'), t.danger, function() { showCommandPicker(url, type); }, true));
            }
            
            card.appendChild(btnGrid);
            container.appendChild(card);
        });
    }
    
    function showQualityPicker(url) {
        var t = getTheme();
        var overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);z-index:2147483648;padding:20px;display:flex;align-items:center;justify-content:center;animation:uvdFadeIn 0.3s;';
        
        var modal = document.createElement('div');
        modal.style.cssText = 'background:' + t.bg + ';backdrop-filter:' + t.blur + ';width:100%;max-width:500px;max-height:80vh;border-radius:20px;overflow:hidden;border:1px solid ' + t.border + ';box-shadow:' + t.shadow + ';';
        
        var header = document.createElement('div');
        header.style.cssText = 'background:' + t.bg2 + ';padding:16px 20px;border-bottom:1px solid ' + t.border + ';display:flex;justify-content:space-between;align-items:center;';
        header.innerHTML = '<h3 style="margin:0;color:' + t.text + ';font-size:16px;font-weight:700;">🎚 Chọn chất lượng</h3>';
        var closeBtn = document.createElement('button');
        closeBtn.style.cssText = 'background:' + t.danger + ';border:0;width:32px;height:32px;border-radius:8px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:transform 0.2s;box-shadow:0 2px 8px rgba(0,0,0,0.2);';
        closeBtn.appendChild(cssIcon('close', '#fff'));
        closeBtn.onmouseover = function(){this.style.transform='scale(1.1)';};
        closeBtn.onmouseout = function(){this.style.transform='scale(1)';};
        closeBtn.onclick = function() { overlay.remove(); };
        header.appendChild(closeBtn);
        modal.appendChild(header);
        
        var body = document.createElement('div');
        body.style.cssText = 'padding:20px;max-height:60vh;overflow-y:auto;';
        body.innerHTML = '<div style="text-align:center;color:' + t.text2 + ';padding:20px;">⏳ Đang phân tích...</div>';
        modal.appendChild(body);
        overlay.appendChild(modal);
        document.body.appendChild(overlay);
        
        parseM3U8Master(url, function(qualities) {
            body.innerHTML = '';
            if (!qualities) {
                body.innerHTML = '<div style="text-align:center;color:' + t.dangerSolid + ';padding:20px;">❌ Không phải Master Playlist</div>';
                return;
            }
            
            qualities.forEach(function(q, i) {
                var card = document.createElement('div');
                card.style.cssText = 'background:' + t.cardBg + ';padding:14px;margin-bottom:10px;border-radius:12px;border:1px solid ' + t.cardBorder + ';transition:all 0.3s;animation:uvdFadeIn 0.3s;animation-delay:' + (i * 0.05) + 's;animation-fill-mode:both;';
                card.onmouseover = function(){this.style.transform='translateX(4px)';this.style.borderColor=t.primarySolid;};
                card.onmouseout = function(){this.style.transform='translateX(0)';this.style.borderColor=t.cardBorder;};
                
                var info = document.createElement('div');
                info.style.cssText = 'display:flex;justify-content:space-between;margin-bottom:8px;';
                info.innerHTML = '<b style="color:' + t.text + ';font-size:15px;">' + q.label + '</b><span style="color:' + t.text2 + ';font-size:11px;">' + Math.round(q.bandwidth/1000) + ' kbps</span>';
                
                var meta = document.createElement('div');
                meta.style.cssText = 'color:' + t.text3 + ';font-size:10px;margin-bottom:10px;';
                meta.innerText = q.resolution + (q.codecs ? ' · ' + q.codecs : '');
                
                var btnRow = document.createElement('div');
                btnRow.style.cssText = 'display:grid;grid-template-columns:repeat(3,1fr);gap:6px;';
                
                function createQBtn(text, icon, gradient, onClick) {
                    var btn = document.createElement('button');
                    btn.style.cssText = 'background:' + gradient + ';color:#fff;border:0;padding:8px;border-radius:8px;font-size:11px;font-weight:600;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:4px;transition:all 0.3s;box-shadow:0 2px 8px rgba(0,0,0,0.15);';
                    btn.appendChild(icon);
                    btn.appendChild(document.createTextNode(text));
                    btn.onmouseover = function(){this.style.transform='translateY(-2px)';};
                    btn.onmouseout = function(){this.style.transform='translateY(0)';};
                    btn.onclick = onClick;
                    return btn;
                }
                
                btnRow.appendChild(createQBtn('Play', cssIcon('play', '#fff'), 'linear-gradient(135deg, #10b981 0%, #059669 100%)', function() { overlay.remove(); showPreview(q.url); }));
                btnRow.appendChild(createQBtn('YTDLnis', cssIcon('share', '#fff'), t.danger, function() { overlay.remove(); shareUrl(q.url); }));
                btnRow.appendChild(createQBtn('Lệnh', cssIcon('settings', '#fff'), t.primary, function() { overlay.remove(); showCommandPicker(q.url, 'M3U8'); }));
                
                card.appendChild(info);
                card.appendChild(meta);
                card.appendChild(btnRow);
                body.appendChild(card);
            });
        });
    }
    
    function showPreview(url) {
        var t = getTheme();
        var existing = document.getElementById('__uvd_player__');
        if (existing) { var v = existing.querySelector('video'); if (v) { v.pause(); v.src = ''; } existing.remove(); }
        
        var overlay = document.createElement('div');
        overlay.id = '__uvd_player__';
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.95);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);z-index:2147483648;display:flex;flex-direction:column;animation:uvdFadeIn 0.3s;';
        
        var header = document.createElement('div');
        header.style.cssText = 'background:' + t.bg2 + ';padding:12px 20px;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid ' + t.border + ';backdrop-filter:' + t.blur + ';';
        
        var title = document.createElement('div');
        title.innerHTML = '<b style="background:' + t.primary + ';-webkit-background-clip:text;-webkit-text-fill-color:transparent;font-size:16px;">▶ Video Player</b><div style="font-size:11px;color:' + t.text2 + ';margin-top:2px;">' + pageInfo.title + '</div>';
        
        var btns = document.createElement('div');
        btns.style.cssText = 'display:flex;gap:8px;';
        
        function createPlayerBtn(icon, text, gradient, onClick) {
            var btn = document.createElement('button');
            btn.style.cssText = 'background:' + gradient + ';border:0;color:#fff;padding:8px 14px;border-radius:8px;font-size:11px;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:6px;transition:all 0.3s;box-shadow:0 2px 8px rgba(0,0,0,0.2);';
            btn.appendChild(icon);
            btn.appendChild(document.createTextNode(text));
            btn.onmouseover = function(){this.style.transform='translateY(-2px)';this.style.boxShadow='0 4px 12px rgba(0,0,0,0.3)';};
            btn.onmouseout = function(){this.style.transform='translateY(0)';this.style.boxShadow='0 2px 8px rgba(0,0,0,0.2)';};
            btn.onclick = onClick;
            return btn;
        }
        
        btns.appendChild(createPlayerBtn(cssIcon('pip', '#fff'), 'PiP', t.primary, function() {
            var video = document.getElementById('__uvd_video__');
            if (!video) return;
            if (document.pictureInPictureElement) document.exitPictureInPicture();
            else if (video.requestPictureInPicture) video.requestPictureInPicture().catch(function(err) { toast('PiP error'); });
            else toast('PiP not supported');
        }));
        
        btns.appendChild(createPlayerBtn(cssIcon('fullscreen', '#fff'), 'Full', t.primary, function() {
            var video = document.getElementById('__uvd_video__');
            if (!video) return;
            if (document.fullscreenElement) {
                document.exitFullscreen();
            } else {
                if (video.requestFullscreen) {
                    video.requestFullscreen().then(function() {
                        // Force landscape on mobile
                        if (screen.orientation && screen.orientation.lock) {
                            screen.orientation.lock('landscape').catch(function() {
                                // Ignore if lock fails
                            });
                        }
                    }).catch(function(err) {
                        toast('Fullscreen error');
                    });
                } else if (video.webkitRequestFullscreen) {
                    video.webkitRequestFullscreen();
                }
            }
        }));
        
        btns.appendChild(createPlayerBtn(cssIcon('camera', '#fff'), 'Snap', 'linear-gradient(135deg, #10b981 0%, #059669 100%)', function() {
            var video = document.getElementById('__uvd_video__');
            if (!video) return;
            var canvas = document.createElement('canvas');
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            canvas.getContext('2d').drawImage(video, 0, 0);
            var link = document.createElement('a');
            link.download = 'snapshot_' + Date.now() + '.png';
            link.href = canvas.toDataURL('image/png');
            link.click();
            toast('Screenshot saved');
        }));
        
        btns.appendChild(createPlayerBtn(cssIcon('close', '#fff'), 'Close', t.danger, function() {
            var video = document.getElementById('__uvd_video__');
            if (video) { video.pause(); video.src = ''; }
            if (document.pictureInPictureElement) document.exitPictureInPicture().catch(function(){});
            if (document.fullscreenElement) document.exitFullscreen();
            overlay.remove();
        }));
        
        header.appendChild(title);
        header.appendChild(btns);
        overlay.appendChild(header);
        
        var container = document.createElement('div');
        container.style.cssText = 'flex:1;display:flex;align-items:center;justify-content:center;padding:20px;overflow:hidden;';
        
        var wrapper = document.createElement('div');
        wrapper.style.cssText = 'width:100%;max-width:1200px;position:relative;background:#000;border-radius:12px;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,0.5);';
        
        var video = document.createElement('video');
        video.id = '__uvd_video__';
        video.controls = true;
        video.autoplay = true;
        video.style.cssText = 'width:100%;max-height:calc(100vh - 140px);display:block;';
        wrapper.appendChild(video);
        container.appendChild(wrapper);
        overlay.appendChild(container);
        
        var loading = document.createElement('div');
        loading.id = '__uvd_loading__';
        loading.innerHTML = 'Loading...';
        loading.style.cssText = 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);color:#fff;background:rgba(0,0,0,0.8);padding:16px 32px;border-radius:12px;font-size:14px;z-index:10;backdrop-filter:blur(10px);border:1px solid rgba(255,255,255,0.1);';
        wrapper.appendChild(loading);
        
        document.body.appendChild(overlay);
        
        if (url.includes('.m3u8')) {
            if (window.Hls) initHls();
            else {
                var s = document.createElement('script');
                s.src = 'https://cdn.jsdelivr.net/npm/hls.js@latest';
                s.onload = initHls;
                s.onerror = function() { loading.innerHTML = 'Failed to load HLS.js'; video.src = url; };
                document.head.appendChild(s);
            }
        } else {
            video.src = url;
            video.onloadeddata = function() { loading.style.display = 'none'; };
            video.onerror = function() { loading.innerHTML = 'Error loading video'; };
        }
        
        function initHls() {
            if (Hls.isSupported()) {
                var hls = new Hls({ enableWorker: true, lowLatencyMode: true });
                hls.loadSource(url);
                hls.attachMedia(video);
                hls.on(Hls.Events.MANIFEST_PARSED, function(event, data) {
                    loading.style.display = 'none';
                    video.play().catch(function(){});
                    if (data.levels && data.levels.length > 1) addQualitySelector(video, hls, data.levels);
                });
                hls.on(Hls.Events.ERROR, function(event, d) { if (d.fatal) loading.innerHTML = 'Error: ' + d.type; });
                video.__hls__ = hls;
            } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
                video.src = url;
                video.onloadeddata = function() { loading.style.display = 'none'; };
            } else {
                loading.innerHTML = 'HLS not supported';
            }
        }
        
        function addQualitySelector(video, hls, levels) {
            var div = document.createElement('div');
            div.id = '__uvd_quality_selector__';
            div.style.cssText = 'position:absolute;top:12px;right:12px;background:rgba(0,0,0,0.85);padding:8px;border-radius:8px;z-index:100;backdrop-filter:blur(10px);border:1px solid rgba(255,255,255,0.1);transition:opacity 0.3s;';
            var select = document.createElement('select');
            select.style.cssText = 'background:rgba(255,255,255,0.1);color:#fff;border:1px solid rgba(255,255,255,0.2);padding:6px 10px;border-radius:6px;font-size:11px;cursor:pointer;outline:none;';
            var autoOpt = document.createElement('option');
            autoOpt.value = -1;
            autoOpt.textContent = 'Auto';
            select.appendChild(autoOpt);
            levels.forEach(function(level, idx) {
                var opt = document.createElement('option');
                opt.value = idx;
                opt.textContent = (level.height ? level.height + 'p' : Math.round(level.bitrate/1000) + 'kbps');
                select.appendChild(opt);
            });
            select.onchange = function() { 
                hls.currentLevel = parseInt(this.value); 
                toast('Quality: ' + this.options[this.selectedIndex].textContent);
                // Auto-hide after 3 seconds
                setTimeout(function() {
                    div.style.opacity = '0';
                    setTimeout(function() { div.style.display = 'none'; }, 300);
                }, 3000);
            };
            // Hide on click outside
            setTimeout(function() {
                document.addEventListener('click', function hideQuality(e) {
                    if (!div.contains(e.target)) {
                        div.style.opacity = '0';
                        setTimeout(function() { div.style.display = 'none'; }, 300);
                        document.removeEventListener('click', hideQuality);
                    }
                });
            }, 100);
            div.appendChild(select);
            wrapper.appendChild(div);
            
            // Auto-hide after 5 seconds
            setTimeout(function() {
                div.style.opacity = '0';
                setTimeout(function() { div.style.display = 'none'; }, 300);
            }, 5000);
        }
    }
    
    function showCommandPicker(url, type) {
        var t = getTheme();
        var cmds = makeCommands(url, type, pageInfo.title);
        var overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);z-index:2147483648;padding:20px;overflow-y:auto;display:flex;justify-content:center;animation:uvdFadeIn 0.3s;';
        
        var modal = document.createElement('div');
        modal.style.cssText = 'background:' + t.bg + ';backdrop-filter:' + t.blur + ';width:100%;max-width:600px;border-radius:20px;padding:20px;border:1px solid ' + t.border + ';box-shadow:' + t.shadow + ';';
        
        var header = document.createElement('h3');
        header.innerText = '️ Chọn lệnh tải';
        header.style.cssText = 'color:' + t.text + ';margin:0 0 16px 0;font-size:18px;font-weight:700;';
        modal.appendChild(header);
        
        Object.keys(cmds).forEach(function(key, i) {
            var c = cmds[key];
            var card = document.createElement('div');
            card.style.cssText = 'background:' + t.cardBg + ';padding:14px;margin-bottom:10px;border-radius:12px;border:1px solid ' + t.cardBorder + ';transition:all 0.3s;animation:uvdFadeIn 0.3s;animation-delay:' + (i * 0.05) + 's;animation-fill-mode:both;';
            card.onmouseover = function(){this.style.transform='translateX(4px)';this.style.borderColor=t.primarySolid;};
            card.onmouseout = function(){this.style.transform='translateX(0)';this.style.borderColor=t.cardBorder;};
            
            var label = document.createElement('div');
            label.style.cssText = 'color:' + t.text + ';font-weight:700;margin-bottom:8px;font-size:13px;';
            label.innerText = c.label;
            
            var code = document.createElement('div');
            code.style.cssText = 'background:' + t.bg + ';padding:10px;border-radius:8px;font-family:monospace;font-size:10px;color:' + t.text2 + ';word-break:break-all;margin-bottom:10px;max-height:80px;overflow-y:auto;border:1px solid ' + t.border + ';';
            code.innerText = c.cmd;
            
            var btn = document.createElement('button');
            btn.style.cssText = 'background:' + t.primary + ';color:#fff;border:0;padding:10px 16px;border-radius:8px;font-weight:600;width:100%;cursor:pointer;transition:all 0.3s;box-shadow:0 2px 8px rgba(0,0,0,0.15);';
            btn.innerText = 'Chọn & sửa';
            btn.onmouseover = function(){this.style.transform='translateY(-2px)';this.style.boxShadow='0 4px 12px rgba(0,0,0,0.25)';};
            btn.onmouseout = function(){this.style.transform='translateY(0)';this.style.boxShadow='0 2px 8px rgba(0,0,0,0.15)';};
            btn.onclick = function() { overlay.remove(); showEditor(c.cmd, c.label); };
            
            card.appendChild(label);
            card.appendChild(code);
            card.appendChild(btn);
            modal.appendChild(card);
        });
        
        var closeBtn = document.createElement('button');
        closeBtn.style.cssText = 'background:' + t.danger + ';color:#fff;border:0;padding:12px;border-radius:10px;font-weight:700;width:100%;cursor:pointer;margin-top:10px;transition:all 0.3s;box-shadow:0 2px 8px rgba(0,0,0,0.15);';
        closeBtn.innerText = 'Đóng';
        closeBtn.onmouseover = function(){this.style.transform='translateY(-2px)';};
        closeBtn.onmouseout = function(){this.style.transform='translateY(0)';};
        closeBtn.onclick = function() { overlay.remove(); };
        modal.appendChild(closeBtn);
        
        overlay.appendChild(modal);
        document.body.appendChild(overlay);
    }
    
    function showEditor(text, title) {
        var t = getTheme();
        var overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);z-index:2147483648;padding:20px;display:flex;align-items:center;justify-content:center;animation:uvdFadeIn 0.3s;';
        
        var modal = document.createElement('div');
        modal.style.cssText = 'background:' + t.bg + ';backdrop-filter:' + t.blur + ';width:100%;max-width:600px;border-radius:20px;padding:20px;border:1px solid ' + t.border + ';box-shadow:' + t.shadow + ';';
        
        var header = document.createElement('div');
        header.style.cssText = 'margin-bottom:16px;';
        header.innerHTML = '<div style="color:' + t.text + ';font-weight:700;font-size:16px;margin-bottom:4px;">️ ' + title + '</div><div style="color:' + t.text3 + ';font-size:11px;">Sửa lệnh trước khi copy</div>';
        modal.appendChild(header);
        
        var textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.cssText = 'width:100%;background:' + t.bg + ';color:' + t.text + ';border:2px solid ' + t.border + ';border-radius:12px;padding:12px;font:12px monospace;resize:none;line-height:1.5;min-height:120px;outline:none;transition:border-color 0.3s;';
        textarea.onfocus = function(){this.style.borderColor=t.primarySolid;};
        textarea.onblur = function(){this.style.borderColor=t.border;};
        modal.appendChild(textarea);
        
        var btnRow = document.createElement('div');
        btnRow.style.cssText = 'display:flex;gap:8px;margin-top:16px;';
        
        function createEditBtn(text, gradient, onClick) {
            var btn = document.createElement('button');
            btn.style.cssText = 'background:' + gradient + ';color:#fff;border:0;padding:12px;border-radius:10px;font-weight:700;flex:1;cursor:pointer;transition:all 0.3s;box-shadow:0 2px 8px rgba(0,0,0,0.15);';
            btn.innerText = text;
            btn.onmouseover = function(){this.style.transform='translateY(-2px)';this.style.boxShadow='0 4px 12px rgba(0,0,0,0.25)';};
            btn.onmouseout = function(){this.style.transform='translateY(0)';this.style.boxShadow='0 2px 8px rgba(0,0,0,0.15)';};
            btn.onclick = onClick;
            return btn;
        }
        
        btnRow.appendChild(createEditBtn('Copy', t.primary, function() { copy(textarea.value); overlay.remove(); toast('Đã copy!'); }));
        btnRow.appendChild(createEditBtn('Share', t.danger, function() { var val = textarea.value; overlay.remove(); shareUrl(val); }));
        btnRow.appendChild(createEditBtn('Hủy', 'rgba(255,255,255,0.1)', function() { overlay.remove(); }));
        
        modal.appendChild(btnRow);
        overlay.appendChild(modal);
        document.body.appendChild(overlay);
        textarea.focus();
    }
    
    function renderFavorites(container) {
        var t = getTheme();
        if (!data.favorites.length) { container.innerHTML = '<div style="text-align:center;padding:40px 20px;color:' + t.text2 + ';animation:uvdFadeIn 0.4s;">Chưa có favorites<br><small style="color:' + t.text3 + ';">Bấm ☆ trên stream để thêm</small></div>'; return; }
        
        data.favorites.forEach(function(fav, i) {
            var card = document.createElement('div');
            card.style.cssText = 'background:' + t.cardBg + ';padding:14px;margin-bottom:10px;border-radius:12px;border-left:4px solid #fbbf24;border:1px solid ' + t.cardBorder + ';transition:all 0.3s;animation:uvdFadeIn 0.3s;animation-delay:' + (i * 0.05) + 's;animation-fill-mode:both;';
            card.onmouseover = function(){this.style.transform='translateX(4px)';};
            card.onmouseout = function(){this.style.transform='translateX(0)';};
            
            card.innerHTML = '<div style="display:flex;justify-content:space-between;margin-bottom:6px;"><b style="color:#fbbf24;font-size:12px;">⭐ ' + fav.type + '</b><span style="color:' + t.text3 + ';font-size:10px;">' + new Date(fav.timestamp).toLocaleDateString() + '</span></div><div style="color:' + t.text + ';font-size:12px;margin-bottom:4px;">' + fav.title + '</div><div style="color:' + t.text3 + ';font-size:10px;margin-bottom:6px;">' + fav.host + '</div><div style="word-break:break-all;font-size:10px;font-family:monospace;background:' + t.bg + ';padding:8px;border-radius:6px;margin-bottom:10px;max-height:50px;overflow-y:auto;color:' + t.text2 + ';border:1px solid ' + t.border + ';">' + fav.url + '</div>';
            
            var btnRow = document.createElement('div');
            btnRow.style.cssText = 'display:flex;gap:6px;';
            
            function createFavBtn(text, gradient, onClick) {
                var btn = document.createElement('button');
                btn.style.cssText = 'background:' + gradient + ';color:#fff;border:0;padding:8px;border-radius:8px;font-size:11px;font-weight:600;flex:1;cursor:pointer;transition:all 0.3s;box-shadow:0 2px 8px rgba(0,0,0,0.15);';
                btn.innerText = text;
                btn.onmouseover = function(){this.style.transform='translateY(-2px)';};
                btn.onmouseout = function(){this.style.transform='translateY(0)';};
                btn.onclick = onClick;
                return btn;
            }
            
            btnRow.appendChild(createFavBtn('YTDLnis', t.danger, function() { shareUrl(fav.url); }));
            btnRow.appendChild(createFavBtn('Copy', t.primary, function() { copy(fav.url); toast('Copied'); }));
            
            var delBtn = document.createElement('button');
            delBtn.style.cssText = 'background:rgba(255,255,255,0.1);border:0;padding:8px 12px;border-radius:8px;cursor:pointer;transition:all 0.3s;';
            delBtn.appendChild(cssIcon('trash', t.text));
            delBtn.onmouseover = function(){this.style.background=t.danger;this.style.transform='scale(1.1)';};
            delBtn.onmouseout = function(){this.style.background='rgba(255,255,255,0.1)';this.style.transform='scale(1)';};
            delBtn.onclick = function() { data.favorites.splice(i, 1); storage.set(data); renderFavorites(container); toast('Đã xóa'); };
            btnRow.appendChild(delBtn);
            
            card.appendChild(btnRow);
            container.appendChild(card);
        });
    }
    
    function renderHistory(container) {
        var t = getTheme();
        var history = data.history || [];
        if (!history.length) { container.innerHTML = '<div style="text-align:center;padding:40px 20px;color:' + t.text2 + ';animation:uvdFadeIn 0.4s;">Chưa có history</div>'; return; }
        
        var clearBtn = document.createElement('button');
        clearBtn.innerText = '🗑️ Xóa tất cả history';
        clearBtn.style.cssText = 'background:' + t.danger + ';color:#fff;border:0;padding:12px;border-radius:10px;font-weight:700;width:100%;margin-bottom:12px;cursor:pointer;transition:all 0.3s;box-shadow:0 2px 8px rgba(0,0,0,0.15);';
        clearBtn.onmouseover = function(){this.style.transform='translateY(-2px)';};
        clearBtn.onmouseout = function(){this.style.transform='translateY(0)';};
        clearBtn.onclick = function() { if (confirm('Xóa toàn bộ history?')) { data.history = []; storage.set(data); renderHistory(container); } };
        container.appendChild(clearBtn);
        
        history.forEach(function(h, i) {
            var card = document.createElement('div');
            card.style.cssText = 'background:' + t.cardBg + ';padding:12px;margin-bottom:8px;border-radius:10px;border:1px solid ' + t.cardBorder + ';transition:all 0.3s;animation:uvdFadeIn 0.3s;animation-delay:' + (i * 0.03) + 's;animation-fill-mode:both;';
            card.onmouseover = function(){this.style.transform='translateX(4px)';};
            card.onmouseout = function(){this.style.transform='translateX(0)';};
            card.innerHTML = '<div style="display:flex;justify-content:space-between;margin-bottom:4px;"><b style="color:' + t.text + ';font-size:11px;">' + h.type + '</b><span style="color:' + t.text3 + ';font-size:10px;">' + new Date(h.timestamp).toLocaleString() + '</span></div><div style="color:' + t.text + ';font-size:11px;margin-bottom:2px;">' + h.title + '</div><div style="color:' + t.text3 + ';font-size:10px;margin-bottom:4px;">' + h.host + '</div><div style="word-break:break-all;font-size:10px;font-family:monospace;color:' + t.text2 + ';max-height:40px;overflow-y:auto;">' + h.url + '</div>';
            container.appendChild(card);
        });
    }
    
    function renderSettings(container) {
        var t = getTheme();
        var html = '<div style="color:' + t.text + ';font-weight:700;margin-bottom:16px;font-size:18px;">⚙️ Settings</div>';
        
        html += '<div style="background:' + t.cardBg + ';padding:16px;margin-bottom:12px;border-radius:12px;border:1px solid ' + t.cardBorder + ';">';
        html += '<div style="color:' + t.text + ';font-weight:700;margin-bottom:12px;">🎨 Theme</div>';
        html += '<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:8px;">';
        ['dark', 'light'].forEach(function(th) {
            var active = data.theme === th;
            html += '<button class="__uvd_theme__" data-theme="' + th + '" style="background:' + (active ? t.primary : t.cardBg) + ';color:' + (active ? '#fff' : t.text) + ';border:1px solid ' + (active ? 'transparent' : t.cardBorder) + ';padding:12px;border-radius:10px;font-weight:700;text-transform:capitalize;cursor:pointer;transition:all 0.3s;box-shadow:' + (active ? '0 4px 12px rgba(0,0,0,0.2)' : 'none') + ';">' + th + '</button>';
        });
        html += '</div></div>';
        
        html += '<div style="background:' + t.cardBg + ';padding:16px;margin-bottom:12px;border-radius:12px;border:1px solid ' + t.cardBorder + ';">';
        html += '<div style="color:' + t.text + ';font-weight:700;margin-bottom:12px;">🌐 Site Profiles</div>';
        var profiles = Object.keys(data.siteProfiles);
        if (!profiles.length) {
            html += '<div style="color:' + t.text3 + ';font-size:11px;">Chưa có profile nào. Bấm vào Referer để lưu.</div>';
        } else {
            profiles.forEach(function(p) {
                html += '<div style="background:' + t.bg + ';padding:10px;margin-bottom:8px;border-radius:8px;font-size:11px;border:1px solid ' + t.border + ';">';
                html += '<div style="color:' + t.text + ';font-weight:700;margin-bottom:4px;">' + p + '</div>';
                html += '<div style="color:' + t.text2 + ';font-family:monospace;font-size:10px;word-break:break-all;margin-bottom:6px;">' + data.siteProfiles[p].referer + '</div>';
                html += '<button class="__uvd_delprofile__" data-host="' + p + '" style="background:' + t.danger + ';color:#fff;border:0;padding:6px 10px;border-radius:6px;font-size:10px;cursor:pointer;transition:all 0.3s;">Xóa</button>';
                html += '</div>';
            });
        }
        html += '</div>';
        
        html += '<div style="background:' + t.cardBg + ';padding:16px;margin-bottom:12px;border-radius:12px;border:1px solid ' + t.cardBorder + ';">';
        html += '<div style="color:' + t.text + ';font-weight:700;margin-bottom:12px;">💾 Backup</div>';
        html += '<button id="__uvd_backup__" style="background:' + t.primary + ';color:#fff;border:0;padding:12px;border-radius:10px;font-weight:700;width:100%;margin-bottom:8px;cursor:pointer;transition:all 0.3s;box-shadow:0 2px 8px rgba(0,0,0,0.15);">📤 Export data</button>';
        html += '<button id="__uvd_restore__" style="background:' + t.accent + ';color:#fff;border:0;padding:12px;border-radius:10px;font-weight:700;width:100%;margin-bottom:8px;cursor:pointer;transition:all 0.3s;box-shadow:0 2px 8px rgba(0,0,0,0.15);">📥 Import data</button>';
        html += '<button id="__uvd_reset__" style="background:' + t.danger + ';color:#fff;border:0;padding:12px;border-radius:10px;font-weight:700;width:100%;cursor:pointer;transition:all 0.3s;box-shadow:0 2px 8px rgba(0,0,0,0.15);">🔥 Reset toàn bộ</button>';
        html += '</div>';
        
        html += '<div style="background:' + t.cardBg + ';padding:16px;border-radius:12px;border:1px solid ' + t.cardBorder + ';font-size:11px;color:' + t.text2 + ';">';
        html += '<div style="margin-bottom:4px;"> Version: 2.0 Glass UI</div>';
        html += '<div style="margin-bottom:4px;">👤 By: nguyenquocngu93</div>';
        html += '<div style="margin-bottom:4px;">⭐ Favorites: ' + data.favorites.length + '</div>';
        html += '<div style="margin-bottom:4px;">📜 History: ' + (data.history || []).length + '</div>';
        html += '<div>🌐 Site profiles: ' + Object.keys(data.siteProfiles).length + '</div>';
        html += '</div>';
        
        container.innerHTML = html;
        
        document.querySelectorAll('.__uvd_theme__').forEach(function(b) {
            b.onmouseover = function(){if(this.dataset.theme !== data.theme) this.style.transform='translateY(-2px)';};
            b.onmouseout = function(){this.style.transform='translateY(0)';};
            b.onclick = function() { data.theme = this.dataset.theme; storage.set(data); buildUI(); toast('Theme: ' + data.theme); };
        });
        
        document.querySelectorAll('.__uvd_delprofile__').forEach(function(b) {
            b.onmouseover = function(){this.style.transform='scale(1.05)';};
            b.onmouseout = function(){this.style.transform='scale(1)';};
            b.onclick = function() { delete data.siteProfiles[this.dataset.host]; storage.set(data); renderSettings(container); toast('Đã xóa profile'); };
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
        if (urls.size !== lastCount) { lastCount = urls.size; }
    }, 2000);
    
    console.log('[UVD] Loaded! Found', urls.size, 'streams');
    toast('Glass UI Premium Ready!');
})();