/**
 * Universal Video Downloader V3.8 — Glass UI + Auto Magnet Detection
 * Fixes: Glass UI enhancement, Auto-detect magnet links from any page
 * New: Magnet auto-detection, One-click add to TorrServer, Enhanced Glass UI
 * Author: nguyenquocngu93
 */
(function() {
'use strict';

var isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

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
data.torrserverUrl = data.torrserverUrl || 'http://127.0.0.1:8090';

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
    origin: profile.origin || location.origin,
    userAgent: profile.userAgent || navigator.userAgent
};

var urls = new Map();

var videoPatterns = [
    { re: /https?:\/\/[^\s"'<>()\\]+\.m3u8[^\s"'<>()\\]*/gi, type: 'M3U8', priority: 1 },
    { re: /https?:\/\/[^\s"'<>()\\]+\.mpd[^\s"'<>()\\]*/gi, type: 'MPD', priority: 2 },
    { re: /https?:\/\/[^\s"'<>()\\]+\.mp4[^\s"'<>()\\]*/gi, type: 'MP4', priority: 3 },
    { re: /https?:\/\/[^\s"'<>()\\]+\.webm[^\s"'<>()\\]*/gi, type: 'WEBM', priority: 4 },
    { re: /https?:\/\/[^\s"'<>()\\]+\.mkv[^\s"'<>()\\]*/gi, type: 'MKV', priority: 5 },
    { re: /https?:\/\/[^\s"'<>()\\]+\.flv[^\s"'<>()\\]*/gi, type: 'FLV', priority: 6 },
    { re: /https?:\/\/[^\s"'<>()\\]+\.ts[^\s"'<>()\\]*/gi, type: 'TS', priority: 7 }
];

var photoPatterns = [
    { re: /https?:\/\/[^\s"'<>()\\]+\.(?:jpg|jpeg)[^\s"'<>()\\]*/gi, type: 'JPG', priority: 10 },
    { re: /https?:\/\/[^\s"'<>()\\]+\.png[^\s"'<>()\\]*/gi, type: 'PNG', priority: 11 },
    { re: /https?:\/\/[^\s"'<>()\\]+\.gif[^\s"'<>()\\]*/gi, type: 'GIF', priority: 12 },
    { re: /https?:\/\/[^\s"'<>()\\]+\.webp[^\s"'<>()\\]*/gi, type: 'WEBP', priority: 13 },
    { re: /https?:\/\/[^\s"'<>()\\]+\.svg[^\s"'<>()\\]*/gi, type: 'SVG', priority: 14 },
    { re: /https?:\/\/[^\s"'<>()\\]+\.bmp[^\s"'<>()\\]*/gi, type: 'BMP', priority: 15 }
];

// NEW: Magnet pattern
var magnetPattern = {
    re: /magnet:\?xt=urn:btih:[a-zA-Z0-9]{32,40}[^\s"'<>()\\]*/gi,
    type: 'MAGNET',
    priority: 0
};

var allPatterns = [magnetPattern].concat(videoPatterns).concat(photoPatterns);

function findUrls(text, source) {
    if (!text || typeof text !== 'string') return;
    allPatterns.forEach(function(p) {
        var matches = text.match(p.re);
        if (matches) {
            matches.forEach(function(u) {
                u = u.replace(/\\u002F/g, '/').replace(/\\\//g, '/').replace(/&amp;/g, '&').replace(/\\"/g, '').replace(/&quot;/g, '');
                if (!urls.has(u) || urls.get(u).priority > p.priority) {
                    urls.set(u, { type: p.type, source: source, priority: p.priority, timestamp: Date.now(), category: getCategory(p.type) });
                }
            });
        }
    });
}

function getCategory(type) {
    var videoTypes = ['M3U8', 'MPD', 'MP4', 'WEBM', 'MKV', 'FLV', 'TS'];
    var photoTypes = ['JPG', 'PNG', 'GIF', 'WEBP', 'SVG', 'BMP'];
    if (type === 'MAGNET') return 'magnet';
    if (videoTypes.indexOf(type) >= 0) return 'video';
    if (photoTypes.indexOf(type) >= 0) return 'photo';
    return 'script';
}

function scan(doc, src) {
    try {
        doc.querySelectorAll('video, source, audio').forEach(function(v) {
            if (v.src) findUrls(v.src, src + ':element');
            if (v.currentSrc) findUrls(v.currentSrc, src + ':current');
        });
        doc.querySelectorAll('img').forEach(function(img) {
            if (img.src && !img.src.startsWith('data:')) findUrls(img.src, src + ':img');
            if (img.dataset && img.dataset.src) findUrls(img.dataset.src, src + ':lazy');
        });
        doc.querySelectorAll('script').forEach(function(s) {
            findUrls(s.textContent, src + ':script');
        });
        // NEW: Scan for magnet links in <a> tags
        doc.querySelectorAll('a[href^="magnet:"]').forEach(function(a) {
            findUrls(a.href, src + ':magnet-link');
        });
        findUrls(doc.documentElement.outerHTML, src + ':html');
        // NEW: Scan body text for magnets
        findUrls(doc.body.innerText, src + ':text');
        doc.querySelectorAll('iframe').forEach(function(i, idx) {
            if (i.src) urls.set(i.src, { type: 'IFRAME', source: 'iframe#' + idx, priority: 99, timestamp: Date.now(), category: 'script' });
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

function rescanPage() {
    scan(document, 'rescan');
    try {
        performance.getEntriesByType('resource').forEach(function(e) {
            findUrls(e.name, 'network:rescan');
        });
    } catch(e) {}
    pageInfo.title = (document.title || 'video').replace(/[^\w\s\u00C0-\u1EF9]/g, '').substring(0, 60).trim() || 'video';
    pageInfo.url = location.href;
    pageInfo.host = location.hostname.replace('www.', '');
    var profile2 = data.siteProfiles[pageInfo.host] || defaultProfiles[pageInfo.host] || {
        referer: location.origin + '/',
        origin: location.origin,
        userAgent: navigator.userAgent
    };
    pageInfo.referer = profile2.referer;
    pageInfo.origin = profile2.origin || location.origin;
    pageInfo.userAgent = profile2.userAgent || navigator.userAgent;
    buildUI();
    toast('Đã quét lại: ' + urls.size + ' streams', 'success');
}

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
                        var framerate = (info.match(/FRAME-RATE=([\d.]+)/) || [])[1] || '';
                        var quality = resolution.split('x')[1] || bandwidth;
                        var qualityLabel = resolution === 'unknown' ? Math.round(bandwidth/1000) + 'kbps' : quality + 'p';
                        var streamUrl = nextLine;
                        if (!streamUrl.startsWith('http')) {
                            var baseUrl = url.substring(0, url.lastIndexOf('/') + 1);
                            streamUrl = baseUrl + streamUrl;
                        }
                        qualities.push({
                            label: qualityLabel, resolution: resolution, bandwidth: bandwidth,
                            codecs: codecs, framerate: framerate, url: streamUrl
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
        .catch(function(e) { console.error('M3U8 parse error:', e); callback(null); });
}

function makeCommands(url, type, title) {
    var t = title;
    var ext = type.toLowerCase() === 'iframe' ? 'mp4' : type.toLowerCase();
    var ref = pageInfo.referer;
    var origin = pageInfo.origin;
    var ua = pageInfo.userAgent;
    return {
        'yt-dlp': { label: 'yt-dlp cơ bản', cmd: 'yt-dlp --referer "' + ref + '" -o "' + t + '.%(ext)s" "' + url + '"' },
        'yt-dlp-hq': { label: 'yt-dlp HQ', cmd: 'yt-dlp --referer "' + ref + '" -f "bv*+ba/best" --merge-output-format mp4 --embed-thumbnail --add-metadata -o "' + t + '.%(ext)s" "' + url + '"' },
        'yt-dlp-aria': { label: 'yt-dlp + aria2', cmd: 'yt-dlp --referer "' + ref + '" --downloader aria2c --downloader-args "aria2c:-x 16 -s 16 -k 1M" --concurrent-fragments 8 -o "' + t + '.%(ext)s" "' + url + '"' },
        'yt-dlp-sub': { label: 'yt-dlp + sub', cmd: 'yt-dlp --referer "' + ref + '" --write-sub --sub-langs "vi,en" --embed-subs -o "' + t + '.%(ext)s" "' + url + '"' },
        'ffmpeg': { label: 'FFmpeg M3U8→MP4', cmd: 'ffmpeg -headers "Referer: ' + ref + '\\r\\nOrigin: ' + origin + '\\r\\nUser-Agent: ' + ua + '" -i "' + url + '" -c copy -bsf:a aac_adtstoasc "' + t + '.mp4"' },
        'ffmpeg-audio': { label: 'FFmpeg audio', cmd: 'ffmpeg -headers "Referer: ' + ref + '" -i "' + url + '" -vn -c:a copy "' + t + '.aac"' },
        'ffmpeg-cut': { label: 'FFmpeg cut', cmd: 'ffmpeg -headers "Referer: ' + ref + '" -ss 00:00:00 -to 00:05:00 -i "' + url + '" -c copy "' + t + '_cut.mp4"' },
        'curl': { label: 'cURL', cmd: 'curl -H "Referer: ' + ref + '" -o "' + t + '.' + ext + '" "' + url + '"' },
        'aria2': { label: 'aria2c', cmd: 'aria2c --referer="' + ref + '" -x 16 -s 16 -o "' + t + '.' + ext + '" "' + url + '"' },
        'wget': { label: 'wget', cmd: 'wget --referer="' + ref + '" -O "' + t + '.' + ext + '" "' + url + '"' }
    };
}

var themes = {
    'glass-dark': {
        name: 'Glass Dark',
        meshBg: 'radial-gradient(at 20% 20%, rgba(124, 108, 255, 0.15) 0%, transparent 50%), radial-gradient(at 80% 80%, rgba(0, 229, 255, 0.12) 0%, transparent 50%), radial-gradient(at 50% 50%, rgba(255, 45, 149, 0.08) 0%, transparent 60%)',
        bg: 'rgba(10, 10, 18, 0.82)',
        bg2: 'rgba(18, 18, 30, 0.78)',
        bg3: 'rgba(28, 28, 45, 0.62)',
        glass: 'rgba(255, 255, 255, 0.05)',
        glassBorder: 'rgba(255, 255, 255, 0.1)',
        text: '#ffffff',
        text2: '#c0c0d0',
        text3: '#787890',
        primary: '#7C6CFF',
        primaryGlow: 'rgba(124, 108, 255, 0.5)',
        accent: '#00E5FF',
        accentGlow: 'rgba(0, 229, 255, 0.5)',
        danger: '#FF5252',
        success: '#4ADE80',
        warning: '#FFB84D'
    },
    'glass-light': {
        name: 'Glass Light',
        meshBg: 'radial-gradient(at 20% 20%, rgba(91, 79, 207, 0.1) 0%, transparent 50%), radial-gradient(at 80% 80%, rgba(0, 153, 204, 0.08) 0%, transparent 50%)',
        bg: 'rgba(255, 255, 255, 0.78)',
        bg2: 'rgba(245, 245, 255, 0.72)',
        bg3: 'rgba(235, 235, 245, 0.58)',
        glass: 'rgba(0, 0, 0, 0.03)',
        glassBorder: 'rgba(0, 0, 0, 0.08)',
        text: '#1a1a2e',
        text2: '#4a4a6a',
        text3: '#8a8aa0',
        primary: '#5B4FCF',
        primaryGlow: 'rgba(91, 79, 207, 0.3)',
        accent: '#0099CC',
        accentGlow: 'rgba(0, 153, 204, 0.3)',
        danger: '#E63946',
        success: '#2A9D4A',
        warning: '#E67E00'
    },
    'glass-purple': {
        name: 'Glass Purple',
        meshBg: 'radial-gradient(at 15% 30%, rgba(192, 132, 252, 0.18) 0%, transparent 50%), radial-gradient(at 85% 70%, rgba(34, 211, 238, 0.12) 0%, transparent 50%), radial-gradient(at 50% 10%, rgba(244, 114, 182, 0.1) 0%, transparent 50%)',
        bg: 'rgba(16, 5, 32, 0.82)',
        bg2: 'rgba(28, 10, 50, 0.78)',
        bg3: 'rgba(44, 15, 70, 0.62)',
        glass: 'rgba(187, 134, 252, 0.05)',
        glassBorder: 'rgba(187, 134, 252, 0.15)',
        text: '#ffffff',
        text2: '#d0b8f8',
        text3: '#8868a8',
        primary: '#C084FC',
        primaryGlow: 'rgba(192, 132, 252, 0.5)',
        accent: '#22D3EE',
        accentGlow: 'rgba(34, 211, 238, 0.5)',
        danger: '#F472B6',
        success: '#4ADE80',
        warning: '#FBBF24'
    },
    'glass-matrix': {
        name: 'Glass Matrix',
        meshBg: 'radial-gradient(at 30% 30%, rgba(0, 255, 65, 0.15) 0%, transparent 50%), radial-gradient(at 70% 70%, rgba(0, 255, 204, 0.1) 0%, transparent 50%)',
        bg: 'rgba(0, 6, 0, 0.85)',
        bg2: 'rgba(0, 14, 0, 0.8)',
        bg3: 'rgba(0, 24, 0, 0.62)',
        glass: 'rgba(0, 255, 0, 0.04)',
        glassBorder: 'rgba(0, 255, 0, 0.15)',
        text: '#00ff41',
        text2: '#00cc33',
        text3: '#007722',
        primary: '#00ff41',
        primaryGlow: 'rgba(0, 255, 65, 0.5)',
        accent: '#00ffcc',
        accentGlow: 'rgba(0, 255, 204, 0.5)',
        danger: '#ff0040',
        success: '#00ff88',
        warning: '#ffff00'
    },
    'glass-cyber': {
        name: 'Glass Cyber',
        meshBg: 'radial-gradient(at 20% 20%, rgba(255, 45, 149, 0.18) 0%, transparent 50%), radial-gradient(at 80% 80%, rgba(0, 240, 255, 0.15) 0%, transparent 50%), radial-gradient(at 50% 50%, rgba(255, 204, 0, 0.08) 0%, transparent 50%)',
        bg: 'rgba(12, 5, 22, 0.82)',
        bg2: 'rgba(22, 10, 38, 0.78)',
        bg3: 'rgba(36, 15, 56, 0.62)',
        glass: 'rgba(255, 0, 128, 0.05)',
        glassBorder: 'rgba(255, 0, 128, 0.15)',
        text: '#ffffff',
        text2: '#ff99cc',
        text3: '#994488',
        primary: '#FF2D95',
        primaryGlow: 'rgba(255, 45, 149, 0.5)',
        accent: '#00F0FF',
        accentGlow: 'rgba(0, 240, 255, 0.5)',
        danger: '#FF3366',
        success: '#00FF88',
        warning: '#FFCC00'
    }
};

function getTheme() { return themes[data.theme] || themes['glass-dark']; }

function copy(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).catch(function() { fallbackCopy(text); });
    } else { fallbackCopy(text); }
}
function fallbackCopy(text) {
    var t = document.createElement('textarea');
    t.value = text; t.style.cssText = 'position:fixed;left:-9999px;';
    document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove();
}

function toast(msg, type) {
    type = type || 'success';
    var t = getTheme();
    var colors = { success: t.success, error: t.danger, info: t.accent, warning: t.warning };
    var color = colors[type] || t.primary;
    var el = document.createElement('div');
    el.innerText = msg;
    el.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);background:' + color + ';color:#fff;padding:8px 18px;border-radius:20px;z-index:2147483649;font:bold 11px -apple-system,Arial,sans-serif;box-shadow:0 4px 20px ' + color + '60, 0 0 30px ' + color + '30;opacity:0;transition:opacity 0.2s;pointer-events:none;';
    document.body.appendChild(el);
    requestAnimationFrame(function() { el.style.opacity = '1'; });
    setTimeout(function() {
        el.style.opacity = '0';
        setTimeout(function() { el.remove(); }, 200);
    }, 1800);
}

function shareUrl(url) {
    if (navigator.share) {
        navigator.share({ title: pageInfo.title, text: pageInfo.title, url: url })
            .catch(function(err) {
                if (err.name !== 'AbortError') { copy(url); toast('Đã copy URL'); }
            });
    } else { copy(url); toast('Đã copy - Mở YTDLnis', 'info'); }
}

function addToHistory(url, type) {
    data.history = data.history || [];
    data.history.unshift({ url: url, type: type, title: pageInfo.title, host: pageInfo.host, timestamp: Date.now() });
    if (data.history.length > 100) data.history = data.history.slice(0, 100);
    storage.set(data);
}

function isFavorite(url) { return data.favorites.some(function(f) { return f.url === url; }); }

function toggleFavorite(url, type) {
    var idx = data.favorites.findIndex(function(f) { return f.url === url; });
    if (idx >= 0) { data.favorites.splice(idx, 1); toast('Đã xóa khỏi Favorites', 'info'); }
    else {
        data.favorites.unshift({ url: url, type: type, title: pageInfo.title, host: pageInfo.host, timestamp: Date.now() });
        toast('Đã thêm vào Favorites', 'success');
    }
    storage.set(data);
    return isFavorite(url);
}

function escapeHtml(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function debounce(fn, delay) {
    var timer;
    return function() {
        var context = this, args = arguments;
        clearTimeout(timer);
        timer = setTimeout(function() { fn.apply(context, args); }, delay);
    };
}

function exportData(format, items) {
    var arr = items || [...urls.entries()].map(function(e) {
        return { url: e[0], type: e[1].type, source: e[1].source, title: pageInfo.title, category: e[1].category };
    });
    var content, mime, filename;
    if (format === 'json') {
        content = JSON.stringify({ page: pageInfo, exportDate: new Date().toISOString(), streams: arr }, null, 2);
        mime = 'application/json'; filename = pageInfo.title + '_streams.json';
    } else if (format === 'csv') {
        content = 'Category,Type,URL,Source,Title\n' + arr.map(function(a) {
            return (a.category || '') + ',' + a.type + ',"' + a.url + '",' + a.source + ',"' + a.title + '"';
        }).join('\n');
        mime = 'text/csv'; filename = pageInfo.title + '_streams.csv';
    } else if (format === 'm3u') {
        content = '#EXTM3U\n' + arr.filter(function(a) { return a.category === 'video'; }).map(function(a) {
            return '#EXTINF:-1,' + a.title + ' [' + a.type + ']\n' + a.url;
        }).join('\n');
        mime = 'audio/x-mpegurl'; filename = pageInfo.title + '.m3u';
    } else if (format === 'txt') {
        content = arr.map(function(a) { return a.url; }).join('\n');
        mime = 'text/plain'; filename = pageInfo.title + '_urls.txt';
    }
    var blob = new Blob([content], { type: mime });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = filename; a.click();
    URL.revokeObjectURL(a.href);
    toast('Đã export ' + format.toUpperCase(), 'success');
}

var currentTab = 'video';
var currentFilter = '';
var currentSort = 'priority';
var isMinimized = false;

function buildUI() {
    var t = getTheme();
    var panel = document.getElementById('__uvd__');
    if (panel) panel.remove();
    var existingStyle = document.getElementById('__uvd_styles__');
    if (existingStyle) existingStyle.remove();

    var style = document.createElement('style');
    style.id = '__uvd_styles__';
    style.textContent = getGlobalCSS(t);
    document.head.appendChild(style);

    panel = document.createElement('div');
    panel.id = '__uvd__';
    panel.className = '__uvd_panel__';

    var videoCount = [...urls.values()].filter(function(u) { return u.category === 'video'; }).length;
    var photoCount = [...urls.values()].filter(function(u) { return u.category === 'photo'; }).length;
    var scriptCount = [...urls.values()].filter(function(u) { return u.category === 'script'; }).length;
    var magnetCount = [...urls.values()].filter(function(u) { return u.category === 'magnet'; }).length;

    panel.innerHTML = 
        '<div class="__uvd_mesh_bg__"></div>' +
        '<div class="__uvd_noise_overlay__"></div>' +
        '<div class="__uvd_header__">' +
            '<div class="__uvd_header_left__">' +
                '<div class="__uvd_header_text__">' +
                    '<div class="__uvd_title__"><span class="__uvd_accent_inline__">⚡</span>Universal DL <span class="__uvd_version__">V3.8</span></div>' +
                    '<div class="__uvd_subtitle__"><span class="__uvd_accent_inline_small__">🎬</span><span class="__uvd_live_dot__"></span> ' +
                        videoCount + ' video · ' + photoCount + ' photo · ' + magnetCount + ' magnet' +
                    '</div>' +
                '</div>' +
            '</div>' +
            '<div class="__uvd_header_right__">' +
                '<button class="__uvd_btn_icon__" id="__uvd_reload__" title="Quét lại">🔄</button>' +
                '<button class="__uvd_btn_icon__" id="__uvd_minimize__" title="Thu nhỏ">➖</button>' +
                '<button class="__uvd_btn_icon__" id="__uvd_close__" title="Đóng">✖</button>' +
            '</div>' +
        '</div>' +
        
        '<div class="__uvd_body__">' +
            '<div class="__uvd_search_bar__">' +
                '<input type="text" class="__uvd_search_input__" id="__uvd_search__" placeholder="Lọc URL, type..." />' +
                '<select class="__uvd_sort_select__" id="__uvd_sort__">' +
                    '<option value="priority">Priority</option>' +
                    '<option value="time">Mới nhất</option>' +
                    '<option value="type">Type</option>' +
                '</select>' +
            '</div>' +
            '<div class="__uvd_tabs__">' +
                '<button class="__uvd_tab__ active" data-tab="video"><span class="__uvd_accent_inline_small__">🎬</span>Video <span class="__uvd_badge__">' + videoCount + '</span></button>' +
                '<button class="__uvd_tab__" data-tab="photo"><span class="__uvd_accent_inline_small__">🖼</span>Photo <span class="__uvd_badge__">' + photoCount + '</span></button>' +
                '<button class="__uvd_tab__" data-tab="magnet"><span class="__uvd_accent_inline_small__">🧲</span>Magnet <span class="__uvd_badge__">' + magnetCount + '</span></button>' +
                '<button class="__uvd_tab__" data-tab="script"><span class="__uvd_accent_inline_small__">📜</span>Script <span class="__uvd_badge__">' + scriptCount + '</span></button>' +
                '<button class="__uvd_tab__" data-tab="torrserver"><span class="__uvd_accent_inline_small__">🌊</span>TorrServer</button>' +
                '<button class="__uvd_tab__" data-tab="favorites"><span class="__uvd_accent_inline_small__">⭐</span>Favs <span class="__uvd_badge__">' + data.favorites.length + '</span></button>' +
                '<button class="__uvd_tab__" data-tab="history"><span class="__uvd_accent_inline_small__">📚</span>History <span class="__uvd_badge__">' + (data.history || []).length + '</span></button>' +
                '<button class="__uvd_tab__" data-tab="settings"><span class="__uvd_accent_inline_small__">⚙</span>Settings</button>' +
            '</div>' +
            '<div class="__uvd_info_bar__">' +
                '<div class="__uvd_info_row__">' +
                    '<span class="__uvd_info_label__"><span class="__uvd_accent_inline_small__">📝</span>Title:</span>' +
                    '<span class="__uvd_info_value__ __uvd_clickable__" id="__uvd_edit_title__">' + escapeHtml(pageInfo.title) + '</span>' +
                '</div>' +
                '<div class="__uvd_info_row__">' +
                    '<span class="__uvd_info_label__"><span class="__uvd_accent_inline_small__">🔗</span>Referer:</span>' +
                    '<span class="__uvd_info_value__ __uvd_clickable__ __uvd_mono__" id="__uvd_edit_referer__">' + escapeHtml(pageInfo.referer) + '</span>' +
                '</div>' +
            '</div>' +
            '<div class="__uvd_content__" id="__uvd_content__"></div>' +
            '<div class="__uvd_footer__">' +
                '<button class="__uvd_footer_btn__" id="__uvd_batch_copy__">Copy All</button>' +
                '<button class="__uvd_footer_btn__" id="__uvd_export_txt__">TXT</button>' +
                '<button class="__uvd_footer_btn__" id="__uvd_export_json__">JSON</button>' +
                '<button class="__uvd_footer_btn__" id="__uvd_export_m3u__">M3U</button>' +
            '</div>' +
        '</div>';

    document.body.appendChild(panel);

    bindGlobalEvents();
    renderTab(currentTab);
}

function getGlobalCSS(t) {
    return '' +
        '@keyframes uvdPulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }' +
        '@keyframes uvdFadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }' +
        '@keyframes uvdSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }' +
        
        '.__uvd_panel__ {' +
            'position: fixed; top: 0; left: 0; right: 0; bottom: 0;' +
            'background: ' + t.bg + ';' +
            'backdrop-filter: blur(28px) saturate(180%);' +
            '-webkit-backdrop-filter: blur(28px) saturate(180%);' +
            'z-index: 2147483647;' +
            'font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;' +
            'font-size: 13px; color: ' + t.text + ';' +
            'display: flex; flex-direction: column;' +
            'overflow: hidden;' +
            'box-shadow: 0 0 50px rgba(0,0,0,0.6), inset 0 1px 0 ' + t.glassBorder + ';' +
            'transition: height 0.25s ease;' +
        '}' +
        '.__uvd_panel__.minimized { height: auto !important; bottom: auto !important; }' +
        '.__uvd_panel__.minimized .__uvd_body__ { display: none; }' +
        '.__uvd_panel__.minimized .__uvd_header__ { border-bottom: none; }' +
        
        '.__uvd_mesh_bg__ {' +
            'position: absolute; inset: 0; z-index: -2;' +
            'background: ' + t.meshBg + ';' +
            'pointer-events: none;' +
        '}' +
        '.__uvd_noise_overlay__ {' +
            'position: absolute; inset: 0; z-index: -1;' +
            'opacity: 0.03; pointer-events: none;' +
            'background-image: url("data:image/svg+xml,%3Csvg viewBox=\'0 0 200 200\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'n\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.9\' numOctaves=\'4\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23n)\'/%3E%3C/svg%3E");' +
            'background-size: 100px 100px;' +
        '}' +
        
        '.__uvd_panel__ * { box-sizing: border-box; }' +
        '.__uvd_panel__ ::-webkit-scrollbar { width: 4px; }' +
        '.__uvd_panel__ ::-webkit-scrollbar-track { background: transparent; }' +
        '.__uvd_panel__ ::-webkit-scrollbar-thumb { background: ' + t.primary + '50; border-radius: 2px; }' +
        
        '.__uvd_accent_inline__ {' +
            'display: inline-block; width: 3px; height: 14px; vertical-align: middle; margin-right: 6px;' +
            'background: linear-gradient(to bottom, ' + t.primary + ', ' + t.accent + ');' +
            'border-radius: 2px; box-shadow: 0 0 8px ' + t.primaryGlow + ';' +
        '}' +
        '.__uvd_accent_inline_small__ {' +
            'display: inline-block; width: 2px; height: 10px; vertical-align: middle; margin-right: 5px;' +
            'background: linear-gradient(to bottom, ' + t.primary + ', ' + t.accent + ');' +
            'border-radius: 2px; box-shadow: 0 0 6px ' + t.primaryGlow + ';' +
            'opacity: 0.8;' +
        '}' +
        '.__uvd_btn_accent__ {' +
            'display: inline-block; width: 2px; height: 12px; vertical-align: middle; margin-right: 5px;' +
            'background: rgba(255,255,255,0.9);' +
            'border-radius: 2px;' +
        '}' +
        
        '.__uvd_header__ {' +
            'background: ' + t.bg2 + ';' +
            'backdrop-filter: blur(20px) saturate(150%);' +
            '-webkit-backdrop-filter: blur(20px) saturate(150%);' +
            'padding: 14px 16px;' +
            'display: flex; justify-content: space-between; align-items: center;' +
            'border-bottom: 1px solid ' + t.glassBorder + ';' +
            'flex-shrink: 0;' +
            'position: relative;' +
            'box-shadow: inset 0 1px 0 ' + t.glassBorder + ', 0 4px 20px rgba(0,0,0,0.3);' +
        '}' +
        '.__uvd_header_left__ { display: flex; align-items: center; gap: 10px; min-width: 0; flex: 1; }' +
        '.__uvd_header_text__ { min-width: 0; flex: 1; overflow: hidden; }' +
        '.__uvd_title__ { font-size: 15px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: flex; align-items: center; }' +
        '.__uvd_version__ { font-size: 9px; background: linear-gradient(135deg, ' + t.primary + ', ' + t.accent + '); color: #fff; padding: 2px 6px; border-radius: 4px; vertical-align: middle; box-shadow: 0 0 12px ' + t.primaryGlow + '; margin-left: 6px; }' +
        '.__uvd_subtitle__ { font-size: 10px; color: ' + t.text2 + '; margin-top: 3px; display: flex; align-items: center; gap: 3px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }' +
        '.__uvd_live_dot__ { width: 5px; height: 5px; background: ' + t.success + '; border-radius: 50%; display: inline-block; animation: uvdPulse 1.5s infinite; flex-shrink: 0; box-shadow: 0 0 8px ' + t.success + '; }' +
        '.__uvd_header_right__ { display: flex; gap: 6px; flex-shrink: 0; }' +
        
        '.__uvd_btn_icon__ {' +
            'background: ' + t.glass + '; border: 1px solid ' + t.glassBorder + ';' +
            'color: ' + t.text + '; width: 34px; height: 34px; border-radius: 10px;' +
            'font-size: 16px; cursor: pointer;' +
            'display: flex; align-items: center; justify-content: center;' +
            'backdrop-filter: blur(10px);' +
            'transition: all 0.2s ease;' +
            '-webkit-tap-highlight-color: transparent;' +
            'box-shadow: inset 0 1px 0 rgba(255,255,255,0.1);' +
        '}' +
        '.__uvd_btn_icon__:active { background: ' + t.primary + '40; transform: scale(0.92); }' +
        '.__uvd_btn_icon__.spinning { animation: uvdSpin 0.8s linear infinite; }' +
        
        '.__uvd_body__ { display: flex; flex-direction: column; flex: 1; min-height: 0; position: relative; z-index: 1; }' +
        
        '.__uvd_search_bar__ {' +
            'padding: 10px 16px; display: flex; gap: 8px; align-items: center;' +
            'background: ' + t.glass + '; backdrop-filter: blur(16px);' +
            '-webkit-backdrop-filter: blur(16px);' +
            'border-bottom: 1px solid ' + t.glassBorder + '; flex-shrink: 0;' +
        '}' +
        '.__uvd_search_input__ {' +
            'flex: 1; min-width: 0; background: ' + t.bg3 + ';' +
            'border: 1px solid ' + t.glassBorder + '; color: ' + t.text + ';' +
            'padding: 8px 12px; border-radius: 10px; font-size: 12px; outline: none;' +
            'backdrop-filter: blur(8px);' +
            'transition: all 0.2s ease;' +
            'box-shadow: inset 0 1px 0 rgba(255,255,255,0.05);' +
        '}' +
        '.__uvd_search_input__:focus { border-color: ' + t.primary + '; box-shadow: 0 0 0 2px ' + t.primaryGlow + ', inset 0 1px 0 rgba(255,255,255,0.05); }' +
        '.__uvd_search_input__::placeholder { color: ' + t.text3 + '; }' +
        '.__uvd_sort_select__ {' +
            'background: ' + t.bg3 + '; border: 1px solid ' + t.glassBorder + ';' +
            'color: ' + t.text + '; padding: 8px 10px; border-radius: 10px; font-size: 11px; outline: none;' +
            'backdrop-filter: blur(8px);' +
        '}' +
        
        '.__uvd_tabs__ {' +
            'display: flex; background: ' + t.bg2 + '; backdrop-filter: blur(16px);' +
            '-webkit-backdrop-filter: blur(16px);' +
            'padding: 6px; gap: 4px;' +
            'border-bottom: 1px solid ' + t.glassBorder + '; overflow-x: auto; flex-shrink: 0;' +
            '-webkit-overflow-scrolling: touch;' +
        '}' +
        '.__uvd_tabs__::-webkit-scrollbar { display: none; }' +
        '.__uvd_tab__ {' +
            'flex: 0 0 auto; background: transparent; color: ' + t.text2 + ';' +
            'border: 1px solid transparent; padding: 7px 12px; border-radius: 10px;' +
            'font-size: 11px; font-weight: 600; cursor: pointer; white-space: nowrap;' +
            'display: flex; align-items: center; gap: 4px;' +
            'transition: all 0.2s ease;' +
            '-webkit-tap-highlight-color: transparent;' +
        '}' +
        '.__uvd_tab__:active { background: ' + t.glass + '; }' +
        '.__uvd_tab__.active {' +
            'background: linear-gradient(135deg, ' + t.primary + '25, ' + t.accent + '15);' +
            'color: ' + t.text + ';' +
            'border-color: ' + t.primary + '60;' +
            'box-shadow: 0 0 12px ' + t.primaryGlow + ', inset 0 1px 0 rgba(255,255,255,0.1);' +
        '}' +
        '.__uvd_badge__ {' +
            'background: ' + t.glass + '; border: 1px solid ' + t.glassBorder + ';' +
            'padding: 1px 5px; border-radius: 5px; font-size: 9px; font-weight: 700;' +
        '}' +
        '.__uvd_tab__.active .__uvd_badge__ { background: ' + t.primary + '50; border-color: ' + t.primary + '; }' +
        
        '.__uvd_info_bar__ {' +
            'padding: 10px 16px; background: ' + t.glass + ';' +
            'backdrop-filter: blur(14px);' +
            '-webkit-backdrop-filter: blur(14px);' +
            'border-bottom: 1px solid ' + t.glassBorder + '; font-size: 11px; flex-shrink: 0;' +
        '}' +
        '.__uvd_info_row__ { display: flex; gap: 6px; align-items: center; margin-bottom: 3px; }' +
        '.__uvd_info_row__:last-child { margin-bottom: 0; }' +
        '.__uvd_info_label__ { opacity: 0.8; font-weight: 600; color: ' + t.text2 + '; display: flex; align-items: center; }' +
        '.__uvd_info_value__ { color: ' + t.accent + '; flex: 1; min-width: 0; }' +
        '.__uvd_clickable__ { cursor: pointer; text-decoration: underline dotted; text-underline-offset: 2px; }' +
        '.__uvd_clickable__:active { color: ' + t.primary + '; }' +
        '.__uvd_mono__ { font-family: monospace; font-size: 10px; word-break: break-all; }' +
        
        '.__uvd_content__ { flex: 1; overflow-y: auto; padding: 12px 16px; -webkit-overflow-scrolling: touch; }' +
        
        '.__uvd_card__ {' +
            'background: ' + t.bg3 + ';' +
            'backdrop-filter: blur(12px) saturate(140%);' +
            '-webkit-backdrop-filter: blur(12px) saturate(140%);' +
            'border: 1px solid ' + t.glassBorder + ';' +
            'padding: 14px; margin-bottom: 10px; border-radius: 14px;' +
            'position: relative;' +
            'animation: uvdFadeIn 0.3s ease;' +
            'box-shadow: inset 0 1px 0 rgba(255,255,255,0.05), 0 4px 20px rgba(0,0,0,0.2);' +
        '}' +
        '.__uvd_card_header__ { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; gap: 8px; }' +
        '.__uvd_type_badge__ { padding: 4px 10px; border-radius: 6px; font-size: 10px; font-weight: 700; color: #fff; flex-shrink: 0; box-shadow: 0 2px 8px rgba(0,0,0,0.3); }' +
        '.__uvd_card_meta__ { display: flex; gap: 6px; align-items: center; min-width: 0; }' +
        '.__uvd_source__ { color: ' + t.text3 + '; font-size: 9px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }' +
        '.__uvd_fav_btn__ { background: transparent; border: 0; font-size: 16px; cursor: pointer; padding: 2px 4px; -webkit-tap-highlight-color: transparent; }' +
        '.__uvd_url_box__ {' +
            'background: ' + t.bg + '; border: 1px solid ' + t.glassBorder + ';' +
            'padding: 8px 10px; border-radius: 8px; font-family: monospace; font-size: 10px;' +
            'color: ' + t.text2 + '; word-break: break-all; max-height: 50px; overflow-y: auto;' +
            'line-height: 1.4; margin-bottom: 10px;' +
            'box-shadow: inset 0 1px 0 rgba(255,255,255,0.03);' +
        '}' +
        '.__uvd_actions__ { display: grid; grid-template-columns: repeat(2, 1fr); gap: 6px; }' +
        '.__uvd_act_btn__ {' +
            'border: 0; padding: 10px 6px; border-radius: 10px; font-size: 11px; font-weight: 600;' +
            'cursor: pointer; color: #fff; display: flex; align-items: center; justify-content: center; gap: 4px;' +
            'transition: all 0.2s ease;' +
            '-webkit-tap-highlight-color: transparent;' +
            'box-shadow: 0 2px 8px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.15);' +
        '}' +
        '.__uvd_act_btn__:active { transform: scale(0.96); opacity: 0.9; }' +
        '.__uvd_act_btn__.full { grid-column: 1 / -1; }' +
        '.__uvd_btn_share__ { background: linear-gradient(135deg, #FF5252, #FF1744); }' +
        '.__uvd_btn_copy__ { background: linear-gradient(135deg, ' + t.primary + ', ' + t.accent + '); }' +
        '.__uvd_btn_quality__ { background: linear-gradient(135deg, #AB47BC, #7B1FA2); }' +
        '.__uvd_btn_preview__ { background: linear-gradient(135deg, #26C6DA, #00838F); }' +
        '.__uvd_btn_cmd__ { background: linear-gradient(135deg, #EC407A, #C2185B); }' +
        '.__uvd_btn_iframe__ { background: linear-gradient(135deg, #42A5F5, #1565C0); }' +
        '.__uvd_btn_download__ { background: linear-gradient(135deg, ' + t.success + ', #1B9E54); }' +
        '.__uvd_btn_open__ { background: linear-gradient(135deg, ' + t.warning + ', #CC8400); }' +
        '.__uvd_btn_magnet__ { background: linear-gradient(135deg, #FF6B35, #F7931E); }' +
        
        '.__uvd_footer__ {' +
            'background: ' + t.bg2 + '; backdrop-filter: blur(20px);' +
            '-webkit-backdrop-filter: blur(20px);' +
            'padding: 10px 12px;' +
            'border-top: 1px solid ' + t.glassBorder + '; display: flex; gap: 6px; flex-wrap: wrap; flex-shrink: 0;' +
            'box-shadow: inset 0 1px 0 ' + t.glassBorder + ';' +
        '}' +
        '.__uvd_footer_btn__ {' +
            'background: ' + t.glass + '; border: 1px solid ' + t.glassBorder + ';' +
            'color: ' + t.text + '; padding: 8px 10px; border-radius: 10px; font-size: 11px; font-weight: 600;' +
            'flex: 1; min-width: 60px; cursor: pointer; backdrop-filter: blur(10px);' +
            'transition: all 0.2s ease;' +
            '-webkit-tap-highlight-color: transparent;' +
            'box-shadow: inset 0 1px 0 rgba(255,255,255,0.08);' +
        '}' +
        '.__uvd_footer_btn__:active { background: ' + t.primary + '40; border-color: ' + t.primary + '; }' +
        
        '.__uvd_empty__ { text-align: center; padding: 50px 20px; color: ' + t.text2 + '; }' +
        '.__uvd_empty_icon__ { font-size: 40px; margin-bottom: 10px; opacity: 0.5; }' +
        '.__uvd_empty_text__ { font-size: 13px; font-weight: 600; margin-bottom: 5px; }' +
        '.__uvd_empty_sub__ { font-size: 11px; color: ' + t.text3 + '; }' +
        
        '.__uvd_photo_thumb_wrap__ {' +
            'position: relative; margin-bottom: 10px; border-radius: 10px; overflow: hidden;' +
            'background: ' + t.bg + '; border: 1px solid ' + t.glassBorder + ';' +
            'cursor: pointer;' +
        '}' +
        '.__uvd_photo_thumb_wrap__ img { width: 100%; max-height: 180px; object-fit: cover; display: block; }' +
        
        '.__uvd_overlay__ {' +
            'position: fixed; inset: 0; background: rgba(0,0,0,0.9);' +
            'backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);' +
            'z-index: 2147483648; padding: 12px; display: flex; flex-direction: column;' +
            'overflow-y: auto; -webkit-overflow-scrolling: touch;' +
        '}' +
        '.__uvd_overlay_box__ {' +
            'background: ' + t.bg + '; backdrop-filter: blur(28px) saturate(180%);' +
            '-webkit-backdrop-filter: blur(28px) saturate(180%);' +
            'border: 1px solid ' + t.glassBorder + ';' +
            'border-radius: 18px; padding: 18px; width: 100%; max-width: 600px; margin: auto;' +
            'box-shadow: 0 20px 60px rgba(0,0,0,0.7), inset 0 1px 0 ' + t.glassBorder + ';' +
        '}' +
        '.__uvd_overlay_title__ { color: ' + t.primary + '; font-size: 16px; font-weight: 700; margin-bottom: 14px; display: flex; align-items: center; gap: 8px; }' +
        
        '.__uvd_quality_card__ { background: ' + t.bg3 + '; border: 1px solid ' + t.glassBorder + '; padding: 14px; margin-bottom: 10px; border-radius: 12px; box-shadow: inset 0 1px 0 rgba(255,255,255,0.05); }' +
        '.__uvd_quality_header__ { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }' +
        '.__uvd_quality_label__ { color: ' + t.primary + '; font-size: 15px; font-weight: 700; text-shadow: 0 0 10px ' + t.primaryGlow + '; }' +
        '.__uvd_quality_info__ { color: ' + t.text3 + '; font-size: 10px; margin-bottom: 10px; }' +
        
        '.__uvd_cmd_card__ { background: ' + t.bg3 + '; border: 1px solid ' + t.glassBorder + '; padding: 14px; margin-bottom: 10px; border-radius: 12px; box-shadow: inset 0 1px 0 rgba(255,255,255,0.05); }' +
        '.__uvd_cmd_label__ { color: ' + t.warning + '; font-weight: 600; margin-bottom: 8px; font-size: 12px; }' +
        '.__uvd_cmd_code__ {' +
            'background: ' + t.bg + '; border: 1px solid ' + t.glassBorder + '; padding: 10px; border-radius: 8px;' +
            'font-family: monospace; font-size: 10px; color: ' + t.text2 + '; word-break: break-all;' +
            'max-height: 80px; overflow-y: auto; margin-bottom: 10px; line-height: 1.4;' +
        '}' +
        
        '.__uvd_textarea__ {' +
            'width: 100%; min-height: 130px; background: ' + t.bg + ';' +
            'border: 2px solid ' + t.primary + '60; color: ' + t.text + '; border-radius: 10px;' +
            'padding: 12px; font: 12px monospace; resize: vertical; line-height: 1.4; outline: none;' +
        '}' +
        '.__uvd_textarea__:focus { border-color: ' + t.primary + '; box-shadow: 0 0 0 3px ' + t.primaryGlow + '; }' +
        
        '.__uvd_btn_primary__ { background: linear-gradient(135deg, ' + t.primary + ', ' + t.accent + '); color: #fff; border: 0; padding: 11px 18px; border-radius: 10px; font-weight: 700; font-size: 12px; cursor: pointer; flex: 1; box-shadow: 0 4px 15px ' + t.primaryGlow + ', inset 0 1px 0 rgba(255,255,255,0.2); -webkit-tap-highlight-color: transparent; transition: all 0.2s; }' +
        '.__uvd_btn_primary__:active { transform: scale(0.96); opacity: 0.9; }' +
        '.__uvd_btn_danger__ { background: linear-gradient(135deg, ' + t.danger + ', #CC0033); color: #fff; border: 0; padding: 11px 18px; border-radius: 10px; font-weight: 700; font-size: 12px; cursor: pointer; flex: 1; }' +
        '.__uvd_btn_ghost__ { background: ' + t.glass + '; border: 1px solid ' + t.glassBorder + '; color: ' + t.text + '; padding: 11px 18px; border-radius: 10px; font-weight: 600; font-size: 12px; cursor: pointer; flex: 1; backdrop-filter: blur(10px); }' +
        
        '.__uvd_settings_section__ { background: ' + t.bg3 + '; border: 1px solid ' + t.glassBorder + '; padding: 14px; margin-bottom: 12px; border-radius: 12px; box-shadow: inset 0 1px 0 rgba(255,255,255,0.05); }' +
        '.__uvd_settings_title__ { color: ' + t.text + '; font-weight: 700; margin-bottom: 12px; font-size: 14px; display: flex; align-items: center; }' +
        '.__uvd_theme_grid__ { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; }' +
        '.__uvd_theme_btn__ { background: ' + t.bg2 + '; border: 2px solid ' + t.glassBorder + '; color: ' + t.text + '; padding: 12px; border-radius: 10px; font-weight: 600; cursor: pointer; font-size: 11px; transition: all 0.2s; }' +
        '.__uvd_theme_btn__:active { transform: scale(0.96); }' +
        '.__uvd_theme_btn__.active { border-color: ' + t.primary + '; background: ' + t.primary + '30; box-shadow: 0 0 15px ' + t.primaryGlow + '; }' +
        
        '.__uvd_profile_card__ { background: ' + t.bg + '; border: 1px solid ' + t.glassBorder + '; padding: 10px; margin-bottom: 6px; border-radius: 8px; font-size: 11px; }' +
        '.__uvd_profile_host__ { color: ' + t.primary + '; font-weight: 700; margin-bottom: 4px; }' +
        '.__uvd_profile_ref__ { color: ' + t.text2 + '; font-family: monospace; font-size: 10px; word-break: break-all; }' +
        
        '.__uvd_ts_input_row__ { display: flex; gap: 8px; margin-bottom: 10px; }' +
        '.__uvd_ts_input__ {' +
            'flex: 1; min-width: 0; background: ' + t.bg3 + ';' +
            'border: 1px solid ' + t.glassBorder + '; color: ' + t.text + ';' +
            'padding: 10px 12px; border-radius: 10px; font-size: 12px; outline: none;' +
        '}' +
        '.__uvd_ts_file_card__ { background: ' + t.bg3 + '; border: 1px solid ' + t.glassBorder + '; padding: 12px; margin-bottom: 8px; border-radius: 12px; box-shadow: inset 0 1px 0 rgba(255,255,255,0.05); }' +
        '.__uvd_ts_file_name__ { color: ' + t.text + '; font-size: 11px; font-weight: 600; margin-bottom: 4px; word-break: break-all; }' +
        '.__uvd_ts_file_meta__ { color: ' + t.text3 + '; font-size: 10px; margin-bottom: 8px; }' +
        '.__uvd_ts_torrent_card__ { background: ' + t.bg3 + '; border: 1px solid ' + t.glassBorder + '; border-left: 3px solid ' + t.primary + '; padding: 12px; margin-bottom: 8px; border-radius: 10px; }' +
        '.__uvd_ts_torrent_name__ { color: ' + t.text + '; font-size: 12px; font-weight: 700; margin-bottom: 4px; }' +
        '.__uvd_ts_torrent_meta__ { color: ' + t.text3 + '; font-size: 10px; }' +
        
        '.__uvd_preview_overlay__ {' +
            'position: fixed; inset: 0; background: #000;' +
            'z-index: 2147483648; display: flex; flex-direction: column;' +
        '}' +
        '.__uvd_preview_header__ {' +
            'position: absolute; top: 0; left: 0; right: 0; z-index: 10;' +
            'background: linear-gradient(to bottom, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.5) 60%, transparent 100%);' +
            'padding: 12px 14px; padding-top: max(12px, env(safe-area-inset-top));' +
            'display: flex; justify-content: space-between; align-items: center;' +
            'transition: opacity 0.3s ease;' +
        '}' +
        '.__uvd_preview_header__.hidden { opacity: 0; pointer-events: none; }' +
        '.__uvd_preview_title__ {' +
            'color: #fff; font-size: 13px; font-weight: 600;' +
            'white-space: nowrap; overflow: hidden; text-overflow: ellipsis;' +
            'flex: 1; margin-right: 10px;' +
            'text-shadow: 0 2px 8px rgba(0,0,0,0.8);' +
        '}' +
        '.__uvd_preview_close__ {' +
            'background: rgba(255,255,255,0.15); backdrop-filter: blur(12px);' +
            'border: 1px solid rgba(255,255,255,0.25); color: #fff;' +
            'width: 36px; height: 36px; border-radius: 50%;' +
            'font-size: 16px; cursor: pointer; flex-shrink: 0;' +
            'display: flex; align-items: center; justify-content: center;' +
            'transition: all 0.2s; -webkit-tap-highlight-color: transparent;' +
        '}' +
        '.__uvd_preview_close__:active { background: rgba(255,70,70,0.7); transform: scale(0.9); }' +
        
        '.__uvd_preview_video_wrap__ {' +
            'flex: 1; display: flex; align-items: center; justify-content: center;' +
            'position: relative; background: #000; overflow: hidden;' +
        '}' +
        '.__uvd_preview_video__ {' +
            'width: 100%; height: 100%; object-fit: contain;' +
            'background: #000;' +
        '}' +
        
        '.__uvd_preview_status__ {' +
            'position: absolute; bottom: 140px; left: 12px; z-index: 8;' +
            'background: rgba(0,0,0,0.75); backdrop-filter: blur(12px);' +
            '-webkit-backdrop-filter: blur(12px);' +
            'border: 1px solid rgba(255,255,255,0.2);' +
            'padding: 6px 14px; border-radius: 14px;' +
            'font-size: 11px; color: #fff; font-weight: 500;' +
            'pointer-events: none;' +
            'opacity: 0; transform: translateY(5px);' +
            'transition: all 0.25s ease;' +
            'max-width: 60%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;' +
            'box-shadow: 0 4px 12px rgba(0,0,0,0.4);' +
            'display: flex; align-items: center; gap: 6px;' +
        '}' +
        '.__uvd_preview_status__.visible { opacity: 1; transform: translateY(0); }' +
        '.__uvd_preview_status__::before {' +
            'content: ""; width: 6px; height: 6px; border-radius: 50%;' +
            'background: ' + t.success + '; box-shadow: 0 0 6px ' + t.success + ';' +
            'animation: uvdPulse 1.5s infinite; flex-shrink: 0;' +
        '}' +
        '.__uvd_preview_status__.error::before { background: ' + t.danger + '; box-shadow: 0 0 6px ' + t.danger + '; }' +
        '.__uvd_preview_status__.buffering::before { background: ' + t.warning + '; box-shadow: 0 0 6px ' + t.warning + '; }' +
        
        '.__uvd_preview_quality_bar__ {' +
            'position: absolute; top: 60px; left: 10px; right: 10px; z-index: 9;' +
            'background: rgba(0,0,0,0.82); backdrop-filter: blur(16px);' +
            '-webkit-backdrop-filter: blur(16px);' +
            'border: 1px solid rgba(255,255,255,0.2); border-radius: 14px;' +
            'padding: 12px; display: none;' +
            'box-shadow: 0 4px 20px rgba(0,0,0,0.5);' +
            'max-height: 40vh; overflow-y: auto;' +
        '}' +
        '.__uvd_preview_quality_bar__.visible { display: block; }' +
        '.__uvd_preview_quality_label__ { color: #fff; font-size: 11px; font-weight: 600; margin-bottom: 10px; display: flex; align-items: center; gap: 6px; }' +
        '.__uvd_preview_quality_label__::before { content: ""; width: 3px; height: 12px; background: linear-gradient(to bottom, ' + t.primary + ', ' + t.accent + '); border-radius: 2px; }' +
        '.__uvd_preview_quality_list__ { display: flex; gap: 6px; flex-wrap: wrap; }' +
        
        '.__uvd_preview_controls__ {' +
            'position: absolute; bottom: 0; left: 0; right: 0; z-index: 10;' +
            'background: linear-gradient(to top, rgba(0,0,0,0.88) 0%, rgba(0,0,0,0.5) 60%, transparent 100%);' +
            'padding: 14px; padding-bottom: max(14px, env(safe-area-inset-bottom));' +
            'display: flex; gap: 8px; flex-wrap: wrap; justify-content: center;' +
            'transition: opacity 0.3s ease;' +
        '}' +
        '.__uvd_preview_controls__.hidden { opacity: 0; pointer-events: none; }' +
        
        '.__uvd_preview_btn__ {' +
            'background: rgba(255,255,255,0.12); backdrop-filter: blur(12px);' +
            '-webkit-backdrop-filter: blur(12px);' +
            'border: 1px solid rgba(255,255,255,0.22); color: #fff;' +
            'padding: 9px 16px; border-radius: 20px;' +
            'font-size: 12px; font-weight: 600; cursor: pointer;' +
            'transition: all 0.2s; -webkit-tap-highlight-color: transparent;' +
            'letter-spacing: 0.3px;' +
            'box-shadow: inset 0 1px 0 rgba(255,255,255,0.1);' +
        '}' +
        '.__uvd_preview_btn__:active { background: rgba(255,255,255,0.25); transform: scale(0.95); }' +
        '.__uvd_preview_btn__.active { background: ' + t.primary + '; border-color: ' + t.primary + '; box-shadow: 0 0 12px ' + t.primaryGlow + ', inset 0 1px 0 rgba(255,255,255,0.2); }' +
        
        '@media (orientation: landscape) {' +
            '.__uvd_preview_video__ { width: 100vw; height: 100vh; }' +
            '.__uvd_preview_controls__ { padding: 8px 12px; }' +
            '.__uvd_preview_status__ { bottom: 110px; left: 10px; }' +
            '.__uvd_preview_quality_bar__ { top: 55px; }' +
        '}' +
        '@media (orientation: portrait) {' +
            '.__uvd_preview_video__ { width: 100%; max-height: 55vh; }' +
            '.__uvd_preview_video_wrap__ { min-height: 55vh; }' +
        '}' +
        
        '.__uvd_history_item__ { background: ' + t.bg3 + '; border: 1px solid ' + t.glassBorder + '; padding: 10px 12px; margin-bottom: 6px; border-radius: 10px; box-shadow: inset 0 1px 0 rgba(255,255,255,0.05); }' +
        '.__uvd_history_title__ { color: ' + t.text + '; font-size: 11px; font-weight: 600; margin-bottom: 3px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }' +
        '.__uvd_history_meta__ { color: ' + t.text3 + '; font-size: 9px; }' +
        '.__uvd_history_url__ { color: ' + t.text2 + '; font-size: 9px; font-family: monospace; word-break: break-all; max-height: 25px; overflow: hidden; }' +
        
        '.__uvd_fav_card__ { background: ' + t.bg3 + '; border: 1px solid ' + t.glassBorder + '; padding: 14px; margin-bottom: 10px; border-radius: 12px; border-left: 3px solid gold; box-shadow: inset 0 1px 0 rgba(255,255,255,0.05); }' +
        '.__uvd_fav_header__ { display: flex; justify-content: space-between; margin-bottom: 6px; }' +
        '.__uvd_fav_title__ { color: gold; font-size: 11px; font-weight: 700; }' +
        '.__uvd_fav_date__ { color: ' + t.text3 + '; font-size: 10px; }' +
        
        '.__uvd_photo_fullscreen__ {' +
            'position: fixed; inset: 0; background: rgba(0,0,0,0.95); backdrop-filter: blur(20px);' +
            'z-index: 2147483649; display: flex; align-items: center; justify-content: center; padding: 20px;' +
        '}' +
        '.__uvd_photo_fullscreen__ img { max-width: 100%; max-height: 100%; object-fit: contain; border-radius: 8px; }' +
        '.__uvd_photo_fullscreen_close__ {' +
            'position: absolute; top: 20px; right: 20px;' +
            'background: rgba(255,255,255,0.15); backdrop-filter: blur(12px);' +
            'border: 1px solid rgba(255,255,255,0.25); color: #fff;' +
            'width: 38px; height: 38px; border-radius: 50%; font-size: 18px; cursor: pointer;' +
        '}' +
        
        '.btn-row { display: flex; gap: 8px; margin-top: 12px; }';
}

function bindGlobalEvents() {
    var tabsContainer = document.querySelector('.__uvd_tabs__');
    tabsContainer.addEventListener('click', function(e) {
        var tab = e.target.closest('.__uvd_tab__');
        if (!tab) return;
        currentTab = tab.dataset.tab;
        document.querySelectorAll('.__uvd_tab__').forEach(function(t) { t.classList.remove('active'); });
        tab.classList.add('active');
        renderTab(currentTab);
    });

    var searchInput = document.getElementById('__uvd_search__');
    var debouncedSearch = debounce(function(value) {
        currentFilter = value.toLowerCase();
        renderTab(currentTab);
    }, 250);
    searchInput.addEventListener('input', function(e) { debouncedSearch(e.target.value); });

    document.getElementById('__uvd_sort__').addEventListener('change', function(e) {
        currentSort = e.target.value;
        renderTab(currentTab);
    });

    document.getElementById('__uvd_reload__').addEventListener('click', function() {
        var btn = this;
        btn.classList.add('spinning');
        setTimeout(function() {
            rescanPage();
            btn.classList.remove('spinning');
        }, 400);
    });

    document.getElementById('__uvd_close__').addEventListener('click', function() {
        stopMonitor();
        var panel = document.getElementById('__uvd__');
        if (panel) panel.remove();
        var style = document.getElementById('__uvd_styles__');
        if (style) style.remove();
    });

    document.getElementById('__uvd_minimize__').addEventListener('click', function() {
        var panel = document.getElementById('__uvd__');
        if (!panel) return;
        isMinimized = !isMinimized;
        if (isMinimized) {
            panel.classList.add('minimized');
            this.innerText = '➕';
            this.title = 'Mở rộng';
        } else {
            panel.classList.remove('minimized');
            this.innerText = '➖';
            this.title = 'Thu nhỏ';
        }
    });

    document.getElementById('__uvd_edit_title__').addEventListener('click', function() {
        var newTitle = prompt('Tên file:', pageInfo.title);
        if (newTitle) {
            pageInfo.title = newTitle.replace(/[^\w\s\u00C0-\u1EF9.-]/g, '').substring(0, 100);
            this.innerText = pageInfo.title;
            toast('Đã cập nhật tên', 'success');
        }
    });

    document.getElementById('__uvd_edit_referer__').addEventListener('click', function() {
        var newRef = prompt('Referer:', pageInfo.referer);
        if (newRef) {
            pageInfo.referer = newRef;
            this.innerText = newRef;
            data.siteProfiles[pageInfo.host] = { referer: newRef, userAgent: pageInfo.userAgent };
            storage.set(data);
            toast('Đã lưu Referer cho ' + pageInfo.host, 'success');
        }
    });

    document.getElementById('__uvd_batch_copy__').addEventListener('click', function() {
        var allUrls = [...urls.keys()].join('\n');
        copy(allUrls);
        toast('Đã copy ' + urls.size + ' URLs', 'success');
    });
    document.getElementById('__uvd_export_txt__').addEventListener('click', function() { exportData('txt'); });
    document.getElementById('__uvd_export_json__').addEventListener('click', function() { exportData('json'); });
    document.getElementById('__uvd_export_m3u__').addEventListener('click', function() { exportData('m3u'); });
}

function renderTab(tabId) {
    var content = document.getElementById('__uvd_content__');
    if (!content) return;
    content.innerHTML = '';
    if (tabId === 'video') renderCategory(content, 'video');
    else if (tabId === 'photo') renderCategory(content, 'photo');
    else if (tabId === 'magnet') renderCategory(content, 'magnet');
    else if (tabId === 'script') renderCategory(content, 'script');
    else if (tabId === 'torrserver') renderTorrServer(content);
    else if (tabId === 'favorites') renderFavorites(content);
    else if (tabId === 'history') renderHistory(content);
    else if (tabId === 'settings') renderSettings(content);
}

function getSortedFilteredItems(category) {
    var items = [...urls.entries()].filter(function(e) { return e[1].category === category; })
        .map(function(e) { return { url: e[0], type: e[1].type, source: e[1].source, priority: e[1].priority, timestamp: e[1].timestamp }; });
    if (currentFilter) {
        items = items.filter(function(item) {
            return item.url.toLowerCase().includes(currentFilter) ||
                   item.type.toLowerCase().includes(currentFilter) ||
                   item.source.toLowerCase().includes(currentFilter);
        });
    }
    if (currentSort === 'priority') items.sort(function(a, b) { return a.priority - b.priority; });
    else if (currentSort === 'time') items.sort(function(a, b) { return b.timestamp - a.timestamp; });
    else if (currentSort === 'type') items.sort(function(a, b) { return a.type.localeCompare(b.type); });
    return items;
}

function renderCategory(container, category) {
    var t = getTheme();
    var items = getSortedFilteredItems(category);
    if (!items.length) {
        var icons = { video: '🎬', photo: '🖼', magnet: '🧲', script: '📜' };
        var names = { video: 'video stream', photo: 'photo', magnet: 'magnet link', script: 'script/iframe' };
        container.innerHTML = 
            '<div class="__uvd_empty__"><div class="__uvd_empty_icon__">' + icons[category] + '</div>' +
            '<div class="__uvd_empty_text__">Chưa tìm thấy ' + names[category] + ' nào</div>' +
            '<div class="__uvd_empty_sub__">Đang monitor... Bấm Play video hoặc load thêm nội dung</div></div>';
        return;
    }
    var typeColors = {
        'M3U8': '#4CAF50', 'MPD': '#8BC34A', 'MP4': '#FF9800', 'WEBM': '#FF9800',
        'MKV': '#FF5722', 'FLV': '#FF5722', 'TS': '#FFC107', 'IFRAME': '#2196F3',
        'JPG': '#E91E63', 'PNG': '#9C27B0', 'GIF': '#FF5722', 'WEBP': '#00BCD4',
        'SVG': '#4CAF50', 'BMP': '#795548', 'MAGNET': '#FF6B35'
    };
    var fragment = document.createDocumentFragment();
    items.forEach(function(item, i) {
        var url = item.url; var type = item.type;
        var color = typeColors[type] || '#666';
        var fav = isFavorite(url);
        var card = document.createElement('div');
        card.className = '__uvd_card__';

        var headerHtml = 
            '<div class="__uvd_card_header__">' +
                '<span class="__uvd_type_badge__" style="background:' + color + ';">' + type + ' #' + (i + 1) + '</span>' +
                '<div class="__uvd_card_meta__">' +
                    '<span class="__uvd_source__">' + escapeHtml(item.source) + '</span>' +
                    '<button class="__uvd_fav_btn__" data-url="' + encodeURIComponent(url) + '" data-type="' + type + '">' + (fav ? '⭐' : '☆') + '</button>' +
                '</div>' +
            '</div>';

        var photoHtml = '';
        if (category === 'photo') {
            photoHtml = 
                '<div class="__uvd_photo_thumb_wrap__" data-fullscreen="' + encodeURIComponent(url) + '">' +
                    '<img src="' + url + '" loading="lazy" onerror="this.style.display=\'none\'" />' +
                '</div>';
        }

        var urlHtml = '<div class="__uvd_url_box__">' + escapeHtml(url) + '</div>';
        var actionsHtml = '';
        
        if (category === 'magnet') {
            // NEW: Magnet actions with Add to TorrServer
            actionsHtml = 
                '<div class="__uvd_actions__">' +
                    '<button class="__uvd_act_btn__ __uvd_btn_magnet__ full" data-url="' + encodeURIComponent(url) + '" data-action="add_torrent"><span class="__uvd_btn_accent__">🧲</span>Add to TorrServer</button>' +
                    '<button class="__uvd_act_btn__ __uvd_btn_copy__" data-url="' + encodeURIComponent(url) + '" data-action="copy"><span class="__uvd_btn_accent__">📋</span>Copy</button>' +
                    '<button class="__uvd_act_btn__ __uvd_btn_share__" data-url="' + encodeURIComponent(url) + '" data-action="share"><span class="__uvd_btn_accent__">📤</span>Share</button>' +
                '</div>';
        } else if (category === 'photo') {
            actionsHtml = 
                '<div class="__uvd_actions__">' +
                    '<button class="__uvd_act_btn__ __uvd_btn_open__" data-url="' + encodeURIComponent(url) + '" data-action="open_photo"><span class="__uvd_btn_accent__">🖼</span>Mở ảnh</button>' +
                    '<button class="__uvd_act_btn__ __uvd_btn_copy__" data-url="' + encodeURIComponent(url) + '" data-action="copy"><span class="__uvd_btn_accent__">📋</span>Copy</button>' +
                    '<button class="__uvd_act_btn__ __uvd_btn_download__" data-url="' + encodeURIComponent(url) + '" data-action="download_photo" data-type="' + type + '"><span class="__uvd_btn_accent__">💾</span>Tải xuống</button>' +
                    '<button class="__uvd_act_btn__ __uvd_btn_share__" data-url="' + encodeURIComponent(url) + '" data-action="share"><span class="__uvd_btn_accent__">📤</span>Share</button>' +
                '</div>';
        } else if (type === 'IFRAME') {
            actionsHtml = 
                '<div class="__uvd_actions__">' +
                    '<a href="' + url + '" target="_blank" class="__uvd_act_btn__ __uvd_btn_iframe__ full" style="text-decoration:none;text-align:center;"><span class="__uvd_btn_accent__">🔗</span>Mở iframe tab mới</a>' +
                    '<button class="__uvd_act_btn__ __uvd_btn_copy__" data-url="' + encodeURIComponent(url) + '" data-action="copy"><span class="__uvd_btn_accent__">📋</span>Copy</button>' +
                    '<button class="__uvd_act_btn__ __uvd_btn_share__" data-url="' + encodeURIComponent(url) + '" data-action="share"><span class="__uvd_btn_accent__">📤</span>Share</button>' +
                '</div>';
        } else {
            var extraBtns = '';
            if (type === 'M3U8' || type === 'MP4' || type === 'WEBM') {
                extraBtns += '<button class="__uvd_act_btn__ __uvd_btn_preview__" data-url="' + encodeURIComponent(url) + '" data-action="preview" data-type="' + type + '"><span class="__uvd_btn_accent__">▶</span>Preview</button>';
            }
            if (type === 'M3U8') {
                extraBtns += '<button class="__uvd_act_btn__ __uvd_btn_quality__" data-url="' + encodeURIComponent(url) + '" data-action="quality"><span class="__uvd_btn_accent__">🎞</span>Quality</button>';
            }
            actionsHtml = 
                '<div class="__uvd_actions__">' +
                    '<button class="__uvd_act_btn__ __uvd_btn_share__" data-url="' + encodeURIComponent(url) + '" data-action="share"><span class="__uvd_btn_accent__">📤</span>YTDLnis</button>' +
                    '<button class="__uvd_act_btn__ __uvd_btn_copy__" data-url="' + encodeURIComponent(url) + '" data-action="copy"><span class="__uvd_btn_accent__">📋</span>Copy</button>' +
                    extraBtns +
                    '<button class="__uvd_act_btn__ __uvd_btn_cmd__ full" data-url="' + encodeURIComponent(url) + '" data-action="cmd" data-type="' + type + '"><span class="__uvd_btn_accent__">💻</span>Tất cả lệnh tải</button>' +
                '</div>';
        }
        card.innerHTML = headerHtml + photoHtml + urlHtml + actionsHtml;
        fragment.appendChild(card);
    });
    container.appendChild(fragment);

    container.addEventListener('click', function(e) {
        var photoWrap = e.target.closest('.__uvd_photo_thumb_wrap__');
        if (photoWrap && !e.target.closest('.__uvd_act_btn__') && !e.target.closest('.__uvd_fav_btn__')) {
            var photoUrl = decodeURIComponent(photoWrap.dataset.fullscreen);
            showPhotoFullscreen(photoUrl);
            return;
        }

        var favBtn = e.target.closest('.__uvd_fav_btn__');
        if (favBtn) {
            e.stopPropagation();
            var url = decodeURIComponent(favBtn.dataset.url);
            var isFav = toggleFavorite(url, favBtn.dataset.type);
            favBtn.innerText = isFav ? '⭐' : '☆';
            return;
        }

        var actBtn = e.target.closest('.__uvd_act_btn__');
        if (actBtn) {
            e.preventDefault();
            var url = decodeURIComponent(actBtn.dataset.url);
            var action = actBtn.dataset.action;
            var type = actBtn.dataset.type;
            addToHistory(url, type || 'URL');
            
            // NEW: Handle add_torrent action
            if (action === 'add_torrent') {
                tsAddMagnet(url, function(err) {
                    if (err) {
                        toast('Lỗi kết nối TorrServer: ' + err.message, 'error');
                        return;
                    }
                    toast('Đã thêm magnet vào TorrServer!', 'success');
                    setTimeout(function() {
                        currentTab = 'torrserver';
                        document.querySelectorAll('.__uvd_tab__').forEach(function(t) { t.classList.remove('active'); });
                        document.querySelector('.__uvd_tab__[data-tab="torrserver"]').classList.add('active');
                        renderTab('torrserver');
                    }, 800);
                });
            }
            else if (action === 'share') shareUrl(url);
            else if (action === 'copy') { copy(url); toast('Đã copy URL', 'success'); }
            else if (action === 'quality') showQualityPicker(url);
            else if (action === 'preview') showPreview(url, type);
            else if (action === 'cmd') showCommandPicker(url, type);
            else if (action === 'open_photo') window.open(url, '_blank');
            else if (action === 'download_photo') downloadPhoto(url, type);
        }
    });
}

function showPhotoFullscreen(url) {
    var overlay = document.createElement('div');
    overlay.className = '__uvd_photo_fullscreen__';
    overlay.innerHTML = 
        '<img src="' + url + '" />' +
        '<button class="__uvd_photo_fullscreen_close__">✖</button>';
    document.body.appendChild(overlay);
    overlay.querySelector('button').addEventListener('click', function() { overlay.remove(); });
    overlay.addEventListener('click', function(e) { if (e.target === overlay) overlay.remove(); });
}

function downloadPhoto(url, type) {
    var a = document.createElement('a');
    a.href = url; a.download = pageInfo.title + '.' + (type || 'jpg').toLowerCase();
    a.target = '_blank'; a.rel = 'noopener'; a.click();
    toast('Đang tải ảnh...', 'info');
}

function showQualityPicker(url) {
    var t = getTheme();
    var overlay = document.createElement('div');
    overlay.className = '__uvd_overlay__';
    overlay.innerHTML = 
        '<div class="__uvd_overlay_box__">' +
            '<div class="__uvd_overlay_title__"><span class="__uvd_accent_inline__">🎞</span>Đang phân tích M3U8...</div>' +
            '<div style="text-align:center;padding:30px;color:' + t.text2 + ';">Loading...</div>' +
        '</div>';
    document.body.appendChild(overlay);
    overlay.addEventListener('click', function(e) { if (e.target === overlay) overlay.remove(); });

    parseM3U8Master(url, function(qualities) {
        if (!qualities) {
            overlay.querySelector('.__uvd_overlay_box__').innerHTML = 
                '<div class="__uvd_overlay_title__"><span class="__uvd_accent_inline__">ℹ</span>Không phải Master Playlist</div>' +
                '<div style="color:' + t.text2 + ';margin-bottom:15px;">Đây là stream đơn, không có nhiều chất lượng.</div>' +
                '<div class="btn-row">' +
                    '<button class="__uvd_btn_primary__" id="__uvd_qp_play__">Xem trực tiếp</button>' +
                    '<button class="__uvd_btn_ghost__" id="__uvd_qp_close__">Đóng</button>' +
                '</div>';
            overlay.querySelector('#__uvd_qp_play__').onclick = function() { overlay.remove(); showPreview(url, 'M3U8'); };
            overlay.querySelector('#__uvd_qp_close__').onclick = function() { overlay.remove(); };
            return;
        }
        var html = '<div class="__uvd_overlay_title__"><span class="__uvd_accent_inline__">🎞</span>Chọn chất lượng (' + qualities.length + ')</div>';
        qualities.forEach(function(q) {
            var sizeMB = q.bandwidth ? (q.bandwidth / 1024 / 1024 * 60).toFixed(1) : '?';
            html += 
                '<div class="__uvd_quality_card__">' +
                    '<div class="__uvd_quality_header__">' +
                        '<span class="__uvd_quality_label__"><span class="__uvd_accent_inline_small__">🎬</span>' + q.label + '</span>' +
                        '<span style="color:' + t.text2 + ';font-size:10px;">' + Math.round(q.bandwidth/1000) + ' kbps</span>' +
                    '</div>' +
                    '<div class="__uvd_quality_info__">📐 '+ q.resolution +
                        (q.codecs ? ' · 🎵 ' + q.codecs : '') +
                        (q.framerate ? ' · 🎞 ' + q.framerate + 'fps' : '') +
                        ' · 💾 ~' + sizeMB + 'MB/phút</div>' +
                    '<div class="__uvd_url_box__">' + escapeHtml(q.url) + '</div>' +
                    '<div class="__uvd_actions__">' +
                        '<button class="__uvd_act_btn__ __uvd_btn_preview__" data-url="' + encodeURIComponent(q.url) + '" data-action="preview"><span class="__uvd_btn_accent__">▶</span>Preview</button>' +
                        '<button class="__uvd_act_btn__ __uvd_btn_copy__" data-url="' + encodeURIComponent(q.url) + '" data-action="copy"><span class="__uvd_btn_accent__">📋</span>Copy</button>' +
                        '<button class="__uvd_act_btn__ __uvd_btn_share__" data-url="' + encodeURIComponent(q.url) + '" data-action="share"><span class="__uvd_btn_accent__">📤</span>YTDLnis</button>' +
                        '<button class="__uvd_act_btn__ __uvd_btn_cmd__" data-url="' + encodeURIComponent(q.url) + '" data-action="cmd"><span class="__uvd_btn_accent__">💻</span>Lệnh</button>' +
                    '</div>' +
                '</div>';
        });
        html += '<div class="btn-row"><button class="__uvd_btn_danger__" id="__uvd_qp_close__">Đóng</button></div>';
        overlay.querySelector('.__uvd_overlay_box__').innerHTML = html;
        overlay.addEventListener('click', function(e) {
            var btn = e.target.closest('.__uvd_act_btn__');
            if (btn) {
                var qUrl = decodeURIComponent(btn.dataset.url);
                var action = btn.dataset.action;
                if (action === 'preview') { overlay.remove(); showPreview(qUrl, 'M3U8'); }
                else if (action === 'copy') { copy(qUrl); toast('Đã copy', 'success'); }
                else if (action === 'share') shareUrl(qUrl);
                else if (action === 'cmd') { overlay.remove(); showCommandPicker(qUrl, 'M3U8'); }
            }
        });
        overlay.querySelector('#__uvd_qp_close__').onclick = function() { overlay.remove(); };
    });
}

function showPreview(url, type) {
    var t = getTheme();
    
    var overlay = document.createElement('div');
    overlay.className = '__uvd_preview_overlay__';
    overlay.innerHTML = 
        '<div class="__uvd_preview_header__" id="__pv_header__">' +
            '<div class="__uvd_preview_title__" id="__pv_title__">' + escapeHtml(pageInfo.title) + '</div>' +
            '<button class="__uvd_preview_close__" id="__pv_close__">✖</button>' +
        '</div>' +
        '<div class="__uvd_preview_video_wrap__" id="__pv_wrap__">' +
            '<video id="__pv_video__" class="__uvd_preview_video__" controls playsinline webkit-playsinline preload="auto"></video>' +
            '<div class="__uvd_preview_status__" id="__pv_status__"></div>' +
        '</div>' +
        '<div class="__uvd_preview_quality_bar__" id="__pv_quality_bar__">' +
            '<div class="__uvd_preview_quality_label__">Chất lượng:</div>' +
            '<div class="__uvd_preview_quality_list__" id="__pv_quality_list__"></div>' +
        '</div>' +
        '<div class="__uvd_preview_controls__" id="__pv_controls__">' +
            '<button class="__uvd_preview_btn__" id="__pv_copy__"><span class="__uvd_btn_accent__">📋</span>Copy</button>' +
            '<button class="__uvd_preview_btn__" id="__pv_share__"><span class="__uvd_btn_accent__">📤</span>Share</button>' +
            '<button class="__uvd_preview_btn__" id="__pv_cmd__"><span class="__uvd_btn_accent__">💻</span>Lệnh tải</button>' +
            '<button class="__uvd_preview_btn__" id="__pv_quality__"><span class="__uvd_btn_accent__">🎞</span>Quality</button>' +
            '<button class="__uvd_preview_btn__" id="__pv_fullscreen__"><span class="__uvd_btn_accent__">⛶</span>Full</button>' +
        '</div>';
    document.body.appendChild(overlay);
    
    var video = document.getElementById('__pv_video__');
    var wrap = document.getElementById('__pv_wrap__');
    var statusEl = document.getElementById('__pv_status__');
    var headerEl = document.getElementById('__pv_header__');
    var controlsEl = document.getElementById('__pv_controls__');
    var qualityBar = document.getElementById('__pv_quality_bar__');
    var qualityList = document.getElementById('__pv_quality_list__');
    var currentHls = null;
    var statusTimer = null;
    var uiTimer = null;
    var uiVisible = true;
    
    function showStatus(msg, duration, statusType) {
        duration = duration || 2000;
        statusEl.innerText = msg;
        statusEl.className = '__uvd_preview_status__ visible';
        if (statusType) statusEl.classList.add(statusType);
        clearTimeout(statusTimer);
        if (duration > 0) {
            statusTimer = setTimeout(function() {
                statusEl.classList.remove('visible');
            }, duration);
        }
    }
    
    function hideStatus() {
        clearTimeout(statusTimer);
        statusEl.classList.remove('visible');
    }
    
    function showUI() {
        uiVisible = true;
        headerEl.classList.remove('hidden');
        controlsEl.classList.remove('hidden');
        clearTimeout(uiTimer);
        uiTimer = setTimeout(function() {
            if (!video.paused) {
                uiVisible = false;
                headerEl.classList.add('hidden');
                controlsEl.classList.add('hidden');
                qualityBar.classList.remove('visible');
            }
        }, 3500);
    }
    
    function toggleUI() {
        if (uiVisible) {
            uiVisible = false;
            headerEl.classList.add('hidden');
            controlsEl.classList.add('hidden');
            qualityBar.classList.remove('visible');
            clearTimeout(uiTimer);
        } else {
            showUI();
        }
    }
    
    function cleanup() {
        try { video.pause(); video.removeAttribute('src'); video.load(); } catch(e) {}
        if (currentHls) {
            try { currentHls.stopLoad(); currentHls.destroy(); } catch(e) {}
            currentHls = null;
        }
        clearTimeout(statusTimer);
        clearTimeout(uiTimer);
        if (document.fullscreenElement) {
            try { document.exitFullscreen(); } catch(e) {}
        }
        var videoParent = video.parentNode;
        if (videoParent) videoParent.removeChild(video);
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    }
    
    document.getElementById('__pv_close__').addEventListener('click', function(e) { e.stopPropagation(); cleanup(); });
    video.addEventListener('click', function(e) { e.stopPropagation(); toggleUI(); });
    
    document.getElementById('__pv_copy__').addEventListener('click', function(e) { e.stopPropagation(); copy(url); toast('Đã copy URL', 'success'); });
    document.getElementById('__pv_share__').addEventListener('click', function(e) { e.stopPropagation(); shareUrl(url); });
    
    document.getElementById('__pv_cmd__').addEventListener('click', function(e) {
        e.stopPropagation();
        overlay.style.display = 'none';
        video.pause();
        showCommandPicker(url, type || 'M3U8', function() {
            overlay.style.display = 'flex';
            video.play().catch(function(){});
            showUI();
        });
    });
    
    document.getElementById('__pv_quality__').addEventListener('click', function(e) { e.stopPropagation(); qualityBar.classList.toggle('visible'); });
    
    document.getElementById('__pv_fullscreen__').addEventListener('click', function(e) {
        e.stopPropagation();
        enterFullscreen(wrap);
    });
    
    video.addEventListener('playing', function() { showStatus('Đang phát', 1500, ''); showUI(); });
    video.addEventListener('waiting', function() { showStatus('Buffering...', 0, 'buffering'); });
    video.addEventListener('canplay', function() { hideStatus(); });
    video.addEventListener('pause', function() { showUI(); });
    video.addEventListener('error', function() { showStatus('Lỗi phát video', 3000, 'error'); });
    video.addEventListener('ended', function() { showStatus('Đã phát xong', 2000, ''); showUI(); });
    
    function loadHls() {
        if (window.Hls) { initHls(); }
        else {
            showStatus('Đang load HLS.js...', 0, 'buffering');
            var hlsScript = document.createElement('script');
            hlsScript.src = 'https://cdn.jsdelivr.net/npm/hls.js@latest';
            hlsScript.onload = initHls;
            hlsScript.onerror = function() { showStatus('Lỗi load HLS.js', 3000, 'error'); video.src = url; };
            document.head.appendChild(hlsScript);
        }
    }
    
    function initHls() {
        if (Hls.isSupported()) {
            currentHls = new Hls({ maxLoadingDelay: 4, maxBufferLength: 30, enableWorker: true, lowLatencyMode: false });
            currentHls.loadSource(url);
            currentHls.attachMedia(video);
            currentHls.on(Hls.Events.MANIFEST_PARSED, function(event, data) {
                showStatus('HLS · ' + data.levels.length + ' levels', 1500, '');
                var qHtml = '<button class="__uvd_preview_btn__ active" data-level="-1">Auto</button>';
                data.levels.forEach(function(level, idx) {
                    var label = level.height ? level.height + 'p' : Math.round(level.bitrate/1000) + 'k';
                    qHtml += '<button class="__uvd_preview_btn__" data-level="' + idx + '">' + label + '</button>';
                });
                qualityList.innerHTML = qHtml;
                qualityList.addEventListener('click', function(e) {
                    var btn = e.target.closest('.__uvd_preview_btn__');
                    if (btn && currentHls) {
                        qualityList.querySelectorAll('.__uvd_preview_btn__').forEach(function(b) { b.classList.remove('active'); });
                        btn.classList.add('active');
                        currentHls.currentLevel = parseInt(btn.dataset.level);
                        showStatus(btn.innerText, 1200, '');
                    }
                });
                video.play().catch(function(){});
            });
            currentHls.on(Hls.Events.ERROR, function(event, data) {
                if (data.fatal) {
                    showStatus('Lỗi: ' + data.details, 3000, 'error');
                    switch(data.type) {
                        case Hls.ErrorTypes.NETWORK_ERROR: currentHls.startLoad(); break;
                        case Hls.ErrorTypes.MEDIA_ERROR: currentHls.recoverMediaError(); break;
                        default: currentHls.destroy(); currentHls = null; break;
                    }
                }
            });
        } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
            video.src = url;
            showStatus('Native HLS', 1500, '');
            video.play().catch(function(){});
        }
    }
    
    var isM3U8 = (type === 'M3U8') || url.includes('.m3u8') || url.includes('m3u8');
    if (isM3U8) { loadHls(); }
    else {
        video.src = url;
        showStatus('Loading...', 0, 'buffering');
        video.play().catch(function(){});
    }
    
    showUI();
    
    var escHandler = function(e) {
        if (e.key === 'Escape') { cleanup(); document.removeEventListener('keydown', escHandler); }
    };
    document.addEventListener('keydown', escHandler);
}

function enterFullscreen(element) {
    function doLock() {
        if (screen.orientation && screen.orientation.lock) {
            screen.orientation.lock('landscape').catch(function(err) {
                console.warn('Orientation lock failed:', err);
            });
        }
    }
    
    function onFullscreenChange() {
        if (document.fullscreenElement || document.webkitFullscreenElement) {
            doLock();
        } else if (screen.orientation && screen.orientation.unlock) {
            screen.orientation.unlock();
        }
    }
    
    document.addEventListener('fullscreenchange', onFullscreenChange);
    document.addEventListener('webkitfullscreenchange', onFullscreenChange);
    
    var request = element.requestFullscreen || element.webkitRequestFullscreen ||
                  element.webkitRequestFullScreen || element.mozRequestFullScreen ||
                  element.msRequestFullscreen;
    
    if (!request) {
        var video = element.querySelector ? element.querySelector('video') : null;
        if (video && video.webkitEnterFullscreen) { video.webkitEnterFullscreen(); }
        return;
    }
    
    var result = request.call(element);
    if (result && result.then) {
        result.then(doLock).catch(function(err) {
            console.warn('Fullscreen request failed:', err);
        });
    }
}

function showCommandPicker(url, type, onClose) {
    var t = getTheme();
    var cmds = makeCommands(url, type, pageInfo.title);
    var overlay = document.createElement('div');
    overlay.className = '__uvd_overlay__';
    var html = '<div class="__uvd_overlay_box__"><div class="__uvd_overlay_title__"><span class="__uvd_accent_inline__">💻</span>Chọn lệnh tải</div>';
    Object.keys(cmds).forEach(function(key) {
        var c = cmds[key];
        html += 
            '<div class="__uvd_cmd_card__">' +
                '<div class="__uvd_cmd_label__"><span class="__uvd_accent_inline_small__">⚡</span>' + c.label + '</div>' +
                '<div class="__uvd_cmd_code__">' + escapeHtml(c.cmd) + '</div>' +
                '<button class="__uvd_btn_primary__ __uvd_cmd_pick__" data-cmd="' + encodeURIComponent(c.cmd) + '" data-label="' + encodeURIComponent(c.label) + '" style="width:100%;">Chọn & sửa</button>' +
            '</div>';
    });
    html += '<div class="btn-row"><button class="__uvd_btn_danger__" id="__uvd_cp_close__">Đóng</button></div></div>';
    overlay.innerHTML = html;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', function(e) {
        if (e.target === overlay) {
            overlay.remove();
            if (onClose) onClose();
        }
        var pickBtn = e.target.closest('.__uvd_cmd_pick__');
        if (pickBtn) {
            var cmd = decodeURIComponent(pickBtn.dataset.cmd);
            var label = decodeURIComponent(pickBtn.dataset.label);
            overlay.remove();
            showEditor(cmd, label, onClose);
        }
    });
    document.getElementById('__uvd_cp_close__').addEventListener('click', function() {
        overlay.remove();
        if (onClose) onClose();
    });
}

function showEditor(text, title, onClose) {
    var t = getTheme();
    var overlay = document.createElement('div');
    overlay.className = '__uvd_overlay__';
    overlay.innerHTML = 
        '<div class="__uvd_overlay_box__">' +
            '<div class="__uvd_overlay_title__"><span class="__uvd_accent_inline__">✏</span>' + escapeHtml(title) + '</div>' +
            '<div style="color:' + t.text3 + ';font-size:10px;margin-bottom:8px;">Sửa lệnh trước khi copy</div>' +
            '<textarea class="__uvd_textarea__" id="__uvd_edit__">' + escapeHtml(text) + '</textarea>' +
            '<div class="btn-row">' +
                '<button class="__uvd_btn_primary__" id="__uvd_ed_ok__">Copy</button>' +
                '<button class="__uvd_btn_primary__" id="__uvd_ed_share__" style="background:linear-gradient(135deg,#FF5252,#FF1744);">Share</button>' +
                '<button class="__uvd_btn_ghost__" id="__uvd_ed_no__">Hủy</button>' +
            '</div>' +
        '</div>';
    document.body.appendChild(overlay);
    overlay.addEventListener('click', function(e) {
        if (e.target === overlay) {
            overlay.remove();
            if (onClose) onClose();
        }
    });
    var textarea = document.getElementById('__uvd_edit__');
    setTimeout(function() { textarea.focus(); textarea.select(); }, 100);
    document.getElementById('__uvd_ed_ok__').addEventListener('click', function() { copy(textarea.value); overlay.remove(); toast('Đã copy!', 'success'); if (onClose) onClose(); });
    document.getElementById('__uvd_ed_share__').addEventListener('click', function() { var val = textarea.value; overlay.remove(); shareUrl(val); if (onClose) onClose(); });
    document.getElementById('__uvd_ed_no__').addEventListener('click', function() { overlay.remove(); if (onClose) onClose(); });
}

// ========== TORRSERVER INTEGRATION ==========
var tsTorrentsCache = [];

function tsBase() {
    return (data.torrserverUrl || 'http://127.0.0.1:8090').replace(/\/+$/, '');
}

function tsAddMagnet(magnet, callback) {
    var body = { link: magnet, save_to_db: true };
    fetch(tsBase() + '/torrents/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    })
    .then(function(r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json().catch(function() { return {}; });
    })
    .then(function(json) { callback(null, json); })
    .catch(function(err) { callback(err); });
}

function tsListTorrents(callback) {
    fetch(tsBase() + '/torrents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'list' })
    })
    .then(function(r) { return r.json(); })
    .then(function(list) { callback(null, list || []); })
    .catch(function(err) {
        fetch(tsBase() + '/torrents')
            .then(function(r) { return r.json(); })
            .then(function(list) { callback(null, list || []); })
            .catch(function(err2) { callback(err2); });
    });
}

function tsGetTorrentStat(hash, callback) {
    fetch(tsBase() + '/torrents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'get', hash: hash })
    })
    .then(function(r) { return r.json(); })
    .then(function(json) { callback(null, json); })
    .catch(function(err) { callback(err); });
}

function tsRemoveTorrent(hash, callback) {
    fetch(tsBase() + '/torrents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'rem', hash: hash })
    })
    .then(function() { callback(null); })
    .catch(function(err) { callback(err); });
}

function tsStreamUrl(hash, fileIndex, fileName) {
    var name = encodeURIComponent(fileName || 'stream.mp4');
    return tsBase() + '/stream/' + name + '?link=' + hash + '&index=' + fileIndex + '&play';
}

var VIDEO_EXT_RE = /\.(mp4|mkv|avi|webm|mov|m4v|ts|flv|wmv)$/i;

function renderTorrServer(container) {
    var t = getTheme();
    var html = '';
    
    // NEW: Auto-fill first magnet
    var magnets = [...urls.keys()].filter(function(u) { return u.startsWith('magnet:'); });
    var firstMagnet = magnets.length ? magnets[0] : '';
    
    html += '<div class="__uvd_ts_input_row__">' +
        '<input type="text" class="__uvd_ts_input__" id="__uvd_ts_magnet__" placeholder="Dán magnet link hoặc .torrent URL..." value="' + escapeHtml(firstMagnet) + '" />' +
        '</div>' +
        '<div class="btn-row" style="margin-top:0;margin-bottom:14px;">' +
            '<button class="__uvd_btn_primary__" id="__uvd_ts_add__">🧲 Thêm vào TorrServer</button>' +
            '<button class="__uvd_btn_ghost__" id="__uvd_ts_refresh__">🔄 Làm mới</button>' +
        '</div>' +
        '<div style="color:' + t.text3 + ';font-size:10px;margin-bottom:12px;">🌊 Server: <span class="__uvd_clickable__" id="__uvd_ts_edit_host__">' + escapeHtml(tsBase()) + '</span>' +
        (magnets.length ? '<br/>🧲 Tìm thấy ' + magnets.length + ' magnet links trên trang này!' : '') + '</div>' +
        '<div id="__uvd_ts_list__"></div>';
    container.innerHTML = html;

    document.getElementById('__uvd_ts_edit_host__').addEventListener('click', function() {
        var v = prompt('Địa chỉ TorrServer (vd: http://127.0.0.1:8090):', tsBase());
        if (v) { data.torrserverUrl = v.trim(); storage.set(data); renderTorrServer(container); toast('Đã lưu địa chỉ TorrServer', 'success'); }
    });

    document.getElementById('__uvd_ts_add__').addEventListener('click', function() {
        var input = document.getElementById('__uvd_ts_magnet__');
        var magnet = input.value.trim();
        if (!magnet) { toast('Nhập magnet link trước', 'error'); return; }
        if (!magnet.startsWith('magnet:') && !magnet.startsWith('http')) {
            toast('Link không hợp lệ', 'error'); return;
        }
        var btn = this;
        btn.innerText = '⏳ Đang thêm...';
        btn.disabled = true;
        tsAddMagnet(magnet, function(err) {
            btn.innerText = '🧲 Thêm vào TorrServer';
            btn.disabled = false;
            if (err) {
                toast('Lỗi kết nối TorrServer: ' + err.message, 'error');
                return;
            }
            input.value = '';
            toast('Đã thêm torrent!', 'success');
            setTimeout(function() { loadTorrServerList(); }, 800);
        });
    });

    document.getElementById('__uvd_ts_refresh__').addEventListener('click', function() { loadTorrServerList(); });

    loadTorrServerList();

    function loadTorrServerList() {
        var listEl = document.getElementById('__uvd_ts_list__');
        if (!listEl) return;
        listEl.innerHTML = '<div style="color:' + t.text3 + ';font-size:11px;text-align:center;padding:16px;">⏳ Đang tải danh sách...</div>';
        tsListTorrents(function(err, list) {
            listEl = document.getElementById('__uvd_ts_list__');
            if (!listEl) return;
            if (err) {
                listEl.innerHTML = '<div class="__uvd_empty__"><div class="__uvd_empty_icon__">❌</div>' +
                    '<div class="__uvd_empty_text__">Không kết nối được TorrServer</div>' +
                    '<div class="__uvd_empty_sub__">Kiểm tra TorrServer đang chạy và địa chỉ đúng (CORS phải cho phép trang này)</div></div>';
                return;
            }
            tsTorrentsCache = list || [];
            if (!tsTorrentsCache.length) {
                listEl.innerHTML = '<div class="__uvd_empty__"><div class="__uvd_empty_icon__">📭</div>' +
                    '<div class="__uvd_empty_text__">Chưa có torrent nào</div>' +
                    '<div class="__uvd_empty_sub__">Dán magnet link ở trên để thêm</div></div>';
                return;
            }
            var frag = document.createDocumentFragment();
            tsTorrentsCache.forEach(function(tor) {
                var card = document.createElement('div');
                card.className = '__uvd_ts_torrent_card__';
                var stat = tor.stat_string || (tor.torrent_status !== undefined ? 'status ' + tor.torrent_status : '');
                card.innerHTML = 
                    '<div class="__uvd_ts_torrent_name__">🌊 ' + escapeHtml(tor.title || tor.name || 'Untitled') + '</div>' +
                    '<div class="__uvd_ts_torrent_meta__">🔑 ' + escapeHtml(tor.hash || '') + (stat ? ' · ⚡ ' + escapeHtml(stat) : '') + '</div>' +
                    '<div class="btn-row" style="margin-top:8px;">' +
                        '<button class="__uvd_btn_primary__ __uvd_ts_files__" data-hash="' + escapeHtml(tor.hash) + '" style="flex:1;">📂 Xem file</button>' +
                        '<button class="__uvd_btn_danger__ __uvd_ts_remove__" data-hash="' + escapeHtml(tor.hash) + '" style="flex:0 0 auto;padding:11px 14px;">🗑 Xóa</button>' +
                    '</div>' +
                    '<div class="__uvd_ts_files_wrap__" data-hash="' + escapeHtml(tor.hash) + '" style="margin-top:8px;"></div>';
                frag.appendChild(card);
            });
            listEl.innerHTML = '';
            listEl.appendChild(frag);
            listEl.addEventListener('click', function(e) {
                var filesBtn = e.target.closest('.__uvd_ts_files__');
                if (filesBtn) {
                    var hash = filesBtn.dataset.hash;
                    var wrap = listEl.querySelector('.__uvd_ts_files_wrap__[data-hash="' + hash + '"]');
                    showTorrentFiles(hash, wrap);
                    return;
                }
                var removeBtn = e.target.closest('.__uvd_ts_remove__');
                if (removeBtn) {
                    var hash2 = removeBtn.dataset.hash;
                    if (confirm('Xóa torrent này khỏi TorrServer?')) {
                        tsRemoveTorrent(hash2, function(err2) {
                            if (err2) { toast('Lỗi khi xóa', 'error'); return; }
                            toast('Đã xóa torrent', 'info');
                            loadTorrServerList();
                        });
                    }
                }
            });
        });
    }

    function showTorrentFiles(hash, wrap) {
        if (!wrap) return;
        wrap.innerHTML = '<div style="color:' + t.text3 + ';font-size:10px;">⏳ Đang tải file...</div>';
        tsGetTorrentStat(hash, function(err, stat) {
            if (err || !stat) { wrap.innerHTML = '<div style="color:' + t.danger + ';font-size:10px;">❌ Lỗi tải danh sách file</div>'; return; }
            var files = stat.file_stats || stat.files || [];
            if (!files.length) { wrap.innerHTML = '<div style="color:' + t.text3 + ';font-size:10px;">⏳ Chưa có thông tin file (torrent có thể đang khởi tạo, thử lại sau vài giây)</div>'; return; }
            var html = '';
            files.forEach(function(f, idx) {
                var name = f.path || f.name || ('file' + idx);
                var shortName = name.split('/').pop();
                var isVideo = VIDEO_EXT_RE.test(shortName);
                var sizeMB = f.length ? (f.length / 1024 / 1024).toFixed(0) + ' MB' : '';
                html += '<div class="__uvd_ts_file_card__">' +
                    '<div class="__uvd_ts_file_name__">' + (isVideo ? '🎬 ': '📄 ') + escapeHtml(shortName) + '</div>' +
                    '<div class="__uvd_ts_file_meta__">💾 ' + sizeMB + '</div>';
                if (isVideo) {
                    html += '<div class="__uvd_actions__">' +
                        '<button class="__uvd_act_btn__ __uvd_btn_preview__ __uvd_ts_play__" data-hash="' + hash + '" data-index="' + idx + '" data-name="' + encodeURIComponent(shortName) + '"><span class="__uvd_btn_accent__">▶</span>Play</button>' +
                        '<button class="__uvd_act_btn__ __uvd_btn_copy__ __uvd_ts_copy__" data-hash="' + hash + '" data-index="' + idx + '" data-name="' + encodeURIComponent(shortName) + '"><span class="__uvd_btn_accent__">📋</span>Copy link</button>' +
                        '</div>';
                }
                html += '</div>';
            });
            wrap.innerHTML = html;
            wrap.addEventListener('click', function(e) {
                var playBtn = e.target.closest('.__uvd_ts_play__');
                if (playBtn) {
                    var streamUrl = tsStreamUrl(playBtn.dataset.hash, playBtn.dataset.index, decodeURIComponent(playBtn.dataset.name));
                    showPreview(streamUrl, 'MP4');
                    return;
                }
                var copyBtn = e.target.closest('.__uvd_ts_copy__');
                if (copyBtn) {
                    var url = tsStreamUrl(copyBtn.dataset.hash, copyBtn.dataset.index, decodeURIComponent(copyBtn.dataset.name));
                    copy(url);
                    toast('Đã copy stream link', 'success');
                }
            });
        });
    }
}

function renderFavorites(container) {
    var t = getTheme();
    if (!data.favorites.length) {
        container.innerHTML = '<div class="__uvd_empty__"><div class="__uvd_empty_icon__">⭐</div><div class="__uvd_empty_text__">Chưa có favorites</div><div class="__uvd_empty_sub__">Bấm ⭐ trên stream để thêm</div></div>';
        return;
    }
    var fragment = document.createDocumentFragment();
    data.favorites.forEach(function(fav, i) {
        var card = document.createElement('div');
        card.className = '__uvd_fav_card__';
        card.innerHTML = 
            '<div class="__uvd_fav_header__">' +
                '<span class="__uvd_fav_title__"><span class="__uvd_accent_inline_small__">⭐</span> '+ fav.type + '</span>' +
                '<span class="__uvd_fav_date__">' + new Date(fav.timestamp).toLocaleDateString() + '</span>' +
            '</div>' +
            '<div style="color:' + t.text + ';font-size:11px;margin-bottom:3px;">' + escapeHtml(fav.title) + '</div>' +
            '<div style="color:' + t.text3 + ';font-size:10px;margin-bottom:5px;">🌐 ' + fav.host + '</div>' +
            '<div class="__uvd_url_box__">' + escapeHtml(fav.url) + '</div>' +
            '<div class="__uvd_actions__">' +
                '<button class="__uvd_act_btn__ __uvd_btn_share__" data-url="' + encodeURIComponent(fav.url) + '" data-action="share"><span class="__uvd_btn_accent__">📤</span>YTDLnis</button>' +
                '<button class="__uvd_act_btn__ __uvd_btn_copy__" data-url="' + encodeURIComponent(fav.url) + '" data-action="copy"><span class="__uvd_btn_accent__">📋</span>Copy</button>' +
                '<button class="__uvd_act_btn__ __uvd_btn_cmd__" data-idx="' + i + '" data-action="del"><span class="__uvd_btn_accent__">🗑</span>Xóa</button>' +
            '</div>';
        fragment.appendChild(card);
    });
    container.appendChild(fragment);
    container.addEventListener('click', function(e) {
        var btn = e.target.closest('.__uvd_act_btn__');
        if (btn) {
            var action = btn.dataset.action;
            if (action === 'del') { data.favorites.splice(parseInt(btn.dataset.idx), 1); storage.set(data); renderFavorites(container); toast('Đã xóa', 'info'); }
            else {
                var url = decodeURIComponent(btn.dataset.url);
                if (action === 'share') shareUrl(url);
                else { copy(url); toast('Đã copy', 'success'); }
            }
        }
    });
}

function renderHistory(container) {
    var t = getTheme();
    var history = data.history || [];
    if (!history.length) {
        container.innerHTML = '<div class="__uvd_empty__"><div class="__uvd_empty_icon__">📚</div><div class="__uvd_empty_text__">Chưa có history</div></div>';
        return;
    }
    var clearBtn = document.createElement('button');
    clearBtn.className = '__uvd_btn_danger__';
    clearBtn.innerText = '🗑 Xóa tất cả history';
    clearBtn.style.cssText = 'width:100%;margin-bottom:12px;';
    clearBtn.addEventListener('click', function() {
        if (confirm('Xóa toàn bộ history?')) { data.history = []; storage.set(data); renderHistory(container); toast('Đã xóa history', 'info'); }
    });
    container.appendChild(clearBtn);
    var fragment = document.createDocumentFragment();
    history.forEach(function(h) {
        var item = document.createElement('div');
        item.className = '__uvd_history_item__';
        item.innerHTML = 
            '<div class="__uvd_history_title__"><span class="__uvd_accent_inline_small__">📖</span>' + escapeHtml(h.title) + '</div>' +
            '<div class="__uvd_history_meta__">🏷 ' + h.type + ' · 🌐 ' + h.host + ' · 📅 ' + new Date(h.timestamp).toLocaleString() + '</div>' +
            '<div class="__uvd_history_url__">' + escapeHtml(h.url) + '</div>';
        fragment.appendChild(item);
    });
    container.appendChild(fragment);
}

function renderSettings(container) {
    var t = getTheme();
    var html = '';
    html += '<div class="__uvd_settings_section__"><div class="__uvd_settings_title__"><span class="__uvd_accent_inline__">🎨</span>Theme</div><div class="__uvd_theme_grid__">';
    Object.keys(themes).forEach(function(key) {
        var active = data.theme === key;
        html += '<button class="__uvd_theme_btn__' + (active ? ' active' : '') + '" data-theme="' + key + '">' + themes[key].name + '</button>';
    });
    html += '</div></div>';
    html += '<div class="__uvd_settings_section__"><div class="__uvd_settings_title__"><span class="__uvd_accent_inline__">🌊</span>TorrServer</div>' +
        '<div style="color:' + t.text2 + ';font-size:10px;margin-bottom:8px;">📍 Địa chỉ hiện tại: <span class="__uvd_clickable__" id="__uvd_ts_settings_edit__">' + escapeHtml(tsBase()) + '</span></div></div>';
    html += '<div class="__uvd_settings_section__"><div class="__uvd_settings_title__"><span class="__uvd_accent_inline__">🔐</span>Site Profiles (' + Object.keys(data.siteProfiles).length + ')</div>';
    var profiles = Object.keys(data.siteProfiles);
    if (!profiles.length) { html += '<div style="color:' + t.text3 + ';font-size:10px;">Chưa có profile. Bấm vào Referer để lưu.</div>'; }
    else {
        profiles.forEach(function(p) {
            html += '<div class="__uvd_profile_card__"><div class="__uvd_profile_host__"><span class="__uvd_accent_inline_small__">🌐</span>' + p + '</div>' +
                '<div class="__uvd_profile_ref__">🔗 ' + escapeHtml(data.siteProfiles[p].referer) + '</div>' +
                '<button class="__uvd_btn_danger__ __uvd_delprofile__" data-host="' + p + '" style="padding:4px 10px;font-size:10px;margin-top:6px;">🗑 Xóa</button></div>';
        });
    }
    html += '</div>';
    html += '<div class="__uvd_settings_section__"><div class="__uvd_settings_title__"><span class="__uvd_accent_inline__">💾</span>Backup & Restore</div>' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap;">' +
            '<button class="__uvd_btn_primary__" id="__uvd_backup__" style="flex:1;">📤 Export</button>' +
            '<button class="__uvd_btn_primary__" id="__uvd_restore__" style="flex:1;background:linear-gradient(135deg,' + t.accent + ',' + t.primary + ');">📥 Import</button>' +
            '<button class="__uvd_btn_danger__" id="__uvd_reset__" style="flex:1;">🔄 Reset</button></div></div>';
    html += '<div class="__uvd_settings_section__"><div class="__uvd_settings_title__"><span class="__uvd_accent_inline__">ℹ</span>Thông tin</div>' +
        '<div style="color:' + t.text2 + ';font-size:10px;line-height:1.7;">' +
            '<div><span class="__uvd_accent_inline_small__">⚡</span>Version: 3.8 — Glass UI + Auto Magnet</div>' +
            '<div><span class="__uvd_accent_inline_small__">👤</span>Author: nguyenquocngu93</div>' +
            '<div><span class="__uvd_accent_inline_small__">⭐</span>Favorites: ' + data.favorites.length + '</div>' +
            '<div><span class="__uvd_accent_inline_small__">📚</span>History: ' + (data.history || []).length + '</div>' +
            '<div><span class="__uvd_accent_inline_small__">🔐</span>Site profiles: ' + Object.keys(data.siteProfiles).length + '</div>' +
            '<div><span class="__uvd_accent_inline_small__">🎬</span>Total streams: ' + urls.size + '</div></div></div>';
    container.innerHTML = html;

    var tsEditBtn = document.getElementById('__uvd_ts_settings_edit__');
    if (tsEditBtn) {
        tsEditBtn.addEventListener('click', function() {
            var v = prompt('Địa chỉ TorrServer (vd: http://127.0.0.1:8090):', tsBase());
            if (v) { data.torrserverUrl = v.trim(); storage.set(data); renderSettings(container); toast('Đã lưu địa chỉ TorrServer', 'success'); }
        });
    }

    container.addEventListener('click', function(e) {
        var themeBtn = e.target.closest('.__uvd_theme_btn__');
        if (themeBtn) { data.theme = themeBtn.dataset.theme; storage.set(data); buildUI(); toast('Theme: ' + themes[data.theme].name, 'success'); return; }
        var delBtn = e.target.closest('.__uvd_delprofile__');
        if (delBtn) { delete data.siteProfiles[delBtn.dataset.host]; storage.set(data); renderSettings(container); toast('Đã xóa profile', 'info'); }
    });

    document.getElementById('__uvd_backup__').addEventListener('click', function() {
        var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob); a.download = 'uvd_backup_' + Date.now() + '.json'; a.click();
        toast('Đã export backup', 'success');
    });
    document.getElementById('__uvd_restore__').addEventListener('click', function() {
        var input = document.createElement('input');
        input.type = 'file'; input.accept = '.json';
        input.addEventListener('change', function(e) {
            var reader = new FileReader();
            reader.onload = function(ev) {
                try { var newData = JSON.parse(ev.target.result); data = Object.assign(data, newData); storage.set(data); toast('Đã import', 'success'); buildUI(); }
                catch(err) { toast('File không hợp lệ', 'error'); }
            };
            reader.readAsText(e.target.files[0]);
        });
        input.click();
    });
    document.getElementById('__uvd_reset__').addEventListener('click', function() {
        if (confirm('XÓA TOÀN BỘ favorites, history, settings?')) {
            localStorage.removeItem(STORAGE_KEY);
            data = { favorites: [], theme: 'glass-dark', siteProfiles: {}, history: [], torrserverUrl: 'http://127.0.0.1:8090' };
            toast('Đã reset', 'info'); buildUI();
        }
    });
}

function startAutoRefresh() {
    var lastCount = urls.size;
    var interval = setInterval(function() {
        if (!document.getElementById('__uvd__')) { clearInterval(interval); stopMonitor(); return; }
        if (urls.size !== lastCount) {
            lastCount = urls.size;
            var videoCount = [...urls.values()].filter(function(u) { return u.category === 'video'; }).length;
            var photoCount = [...urls.values()].filter(function(u) { return u.category === 'photo'; }).length;
            var scriptCount = [...urls.values()].filter(function(u) { return u.category === 'script'; }).length;
            var magnetCount = [...urls.values()].filter(function(u) { return u.category === 'magnet'; }).length;
            var tabs = document.querySelectorAll('.__uvd_tab__');
            tabs.forEach(function(tab) {
                var badge = tab.querySelector('.__uvd_badge__');
                if (!badge) return;
                if (tab.dataset.tab === 'video') badge.innerText = videoCount;
                else if (tab.dataset.tab === 'photo') badge.innerText = photoCount;
                else if (tab.dataset.tab === 'magnet') badge.innerText = magnetCount;
                else if (tab.dataset.tab === 'script') badge.innerText = scriptCount;
                else if (tab.dataset.tab === 'favorites') badge.innerText = data.favorites.length;
                else if (tab.dataset.tab === 'history') badge.innerText = (data.history || []).length;
            });
            renderTab(currentTab);
        }
    }, 2500);
}

buildUI();
startAutoRefresh();
console.log('🚀 Universal DL V3.8 loaded! Found', urls.size, 'streams initially');
toast('V3.8 Ready! (Glass UI + Auto Magnet 🧲)', 'success');
})();
