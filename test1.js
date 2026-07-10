// ==UserScript==
// @name         Universal Video Downloader V3.7 | Full Fix + Glass UI Pro
// @namespace    nguyenquocngu93
// @version      3.7.1
// @description  Tải video mọi trang web | Full fix lỗi + Glass UI cao cấp + TorrServer
// @author       nguyenquocngu93 | Enhanced by Glass UI Pro
// @match        *://*/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function() {
'use strict';

/* ========== KIỂM TRA ĐÃ CHẠY CHƯA ========== */
var old = document.getElementById('__uvd__');
if (old) old.remove();
var oldStyle = document.getElementById('__uvd_styles__');
if (oldStyle) oldStyle.remove();

/* ========== BIẾN CƠ BẢN ========== */
var isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
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

/* ========== DỮ LIỆU LƯU TRỮ ========== */
var data = storage.get();
data.theme = data.theme || 'glass-dark';
data.favorites = data.favorites || [];
data.siteProfiles = data.siteProfiles || {};
data.history = data.history || [];
data.torrserverUrl = data.torrserverUrl || 'http://127.0.0.1:8090';

/* ========== PROFILE TRANG WEB MẶC ĐỊNH ========== */
var defaultProfiles = {
    'ok.ru': { referer: 'https://ok.ru/', origin: 'https://ok.ru', userAgent: '' },
    'fembed.com': { referer: 'https://fembed.com/', origin: 'https://fembed.com', userAgent: '' },
    'videoplay.us': { referer: 'https://videoplay.us/', origin: 'https://videoplay.us', userAgent: '' },
    'streamtape.com': { referer: 'https://streamtape.com/', origin: 'https://streamtape.com', userAgent: '' },
    'mp4upload.com': { referer: 'https://mp4upload.com/', origin: 'https://mp4upload.com', userAgent: '' }
};

/* ========== THÔNG TIN TRANG HIỆN TẠI ========== */
var host = location.hostname.replace('www.', '');
var profile = data.siteProfiles[host] || defaultProfiles[host] || {
    referer: location.origin + '/',
    origin: location.origin,
    userAgent: navigator.userAgent
};
var pageInfo = {
    title: (document.title || 'video').replace(/[^\w\s\u00C0-\u1EF9.\-]/g, '').substring(0, 60).trim() || 'video',
    url: location.href,
    host: host,
    referer: profile.referer,
    origin: profile.origin || location.origin,
    userAgent: profile.userAgent || navigator.userAgent
};

/* ========== DANH SÁCH URL QUÉT ĐƯỢC ========== */
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
var allPatterns = videoPatterns.concat(photoPatterns);

/* ========== HÀM QUÉT URL ========== */
function getCategory(type) {
    var videoTypes = ['M3U8', 'MPD', 'MP4', 'WEBM', 'MKV', 'FLV', 'TS'];
    var photoTypes = ['JPG', 'PNG', 'GIF', 'WEBP', 'SVG', 'BMP'];
    if (videoTypes.indexOf(type) >= 0) return 'video';
    if (photoTypes.indexOf(type) >= 0) return 'photo';
    return 'script';
}

function cleanUrl(u) {
    return u.replace(/\\u002F/g, '/').replace(/\\\//g, '/').replace(/&amp;/g, '&')
            .replace(/\\"/g, '').replace(/&quot;/g, '').replace(/\\'/g, "'").trim();
}

function findUrls(text, source) {
    if (!text || typeof text !== 'string') return;
    allPatterns.forEach(function(p) {
        var matches = text.match(p.re);
        if (!matches) return;
        matches.forEach(function(u) {
            u = cleanUrl(u);
            if (!u || u.length < 10) return;
            if (!urls.has(u) || (urls.get(u) && urls.get(u).priority > p.priority)) {
                urls.set(u, {
                    type: p.type,
                    source: source,
                    priority: p.priority,
                    timestamp: Date.now(),
                    category: getCategory(p.type)
                });
            }
        });
    });
}

function scan(doc, src) {
    try {
        doc.querySelectorAll('video, source, audio').forEach(function(v) {
            if (v.src) findUrls(v.src, src + ':element');
            if (v.currentSrc) findUrls(v.currentSrc, src + ':current');
        });
        doc.querySelectorAll('img').forEach(function(img) {
            if (img.dataset && img.dataset.src) findUrls(img.dataset.src, src + ':lazy');
            if (img.src && !img.src.startsWith('data:')) findUrls(img.src, src + ':img');
        });
        doc.querySelectorAll('script').forEach(function(s) {
            if (s.textContent) findUrls(s.textContent, src + ':script');
        });
        findUrls(doc.documentElement.outerHTML, src + ':html');
        doc.querySelectorAll('iframe').forEach(function(i, idx) {
            if (i.src) {
                urls.set(i.src, {
                    type: 'IFRAME', source: 'iframe#' + idx, priority: 99,
                    timestamp: Date.now(), category: 'script'
                });
                try { if (i.contentDocument) scan(i.contentDocument, 'iframe#' + idx); } catch(e) {}
            }
        });
    } catch(e) {}
}

/* ========== MONITOR XHR + FETCH ========== */
var originalXHROpen = XMLHttpRequest.prototype.open;
var originalFetch = window.fetch;
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

/* ========== QUÉT BAN ĐẦU ========== */
scan(document, 'main');
try {
    performance.getEntriesByType('resource').forEach(function(e) {
        findUrls(e.name, 'network:perf');
    });
} catch(e) {}
installMonitor();

/* ========== QUÉT LẠI TRANG ========== */
function rescanPage() {
    scan(document, 'rescan');
    try {
        performance.getEntriesByType('resource').forEach(function(e) {
            findUrls(e.name, 'network:rescan');
        });
    } catch(e) {}
    pageInfo.title = (document.title || 'video').replace(/[^\w\s\u00C0-\u1EF9.\-]/g, '').substring(0, 60).trim() || 'video';
    pageInfo.url = location.href;
    pageInfo.host = location.hostname.replace('www.', '');
    var profile2 = data.siteProfiles[pageInfo.host] || defaultProfiles[pageInfo.host] || {
        referer: location.origin + '/', origin: location.origin, userAgent: navigator.userAgent
    };
    pageInfo.referer = profile2.referer;
    pageInfo.origin = profile2.origin || location.origin;
    pageInfo.userAgent = profile2.userAgent || navigator.userAgent;
    buildUI();
    toast('Đã quét lại: ' + urls.size + ' streams', 'success');
}

/* ========== PARSE M3U8 CHẤT LƯỢNG ========== */
function parseM3U8Master(url, callback) {
    fetch(url, { headers: { 'Referer': pageInfo.referer, 'Origin': pageInfo.origin } })
    .then(function(r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); })
    .then(function(text) {
        if (!text.includes('#EXT-X-STREAM-INF')) { callback(null); return; }
        var lines = text.split('\n');
        var qualities = [];
        var baseUrl = url.substring(0, url.lastIndexOf('/') + 1);
        for (var i = 0; i < lines.length; i++) {
            if (lines[i].startsWith('#EXT-X-STREAM-INF')) {
                var info = lines[i];
                var nextLine = (lines[i + 1] || '').trim();
                if (!nextLine || nextLine.startsWith('#')) continue;
                var resolution = (info.match(/RESOLUTION=(\d+x\d+)/) || [])[1] || 'unknown';
                var bandwidth = parseInt((info.match(/BANDWIDTH=(\d+)/) || [])[1] || 0);
                var codecs = (info.match(/CODECS="([^"]+)"/) || [])[1] || '';
                var framerate = (info.match(/FRAME-RATE=([\d.]+)/) || [])[1] || '';
                var quality = resolution !== 'unknown' ? resolution.split('x')[1] : bandwidth;
                var qualityLabel = resolution === 'unknown' ? Math.round(bandwidth/1000) + 'kbps' : quality + 'p';
                var streamUrl = nextLine;
                if (!streamUrl.startsWith('http')) {
                    streamUrl = streamUrl.startsWith('/') ? (new URL(url).origin + streamUrl) : (baseUrl + streamUrl);
                }
                qualities.push({
                    label: qualityLabel, resolution: resolution, bandwidth: bandwidth,
                    codecs: codecs, framerate: framerate, url: streamUrl
                });
            }
        }
        qualities.sort(function(a, b) {
            var ha = parseInt(a.resolution.split('x')[1]) || a.bandwidth || 0;
            var hb = parseInt(b.resolution.split('x')[1]) || b.bandwidth || 0;
            return hb - ha;
        });
        callback(qualities);
    })
    .catch(function(e) { console.error('M3U8 parse error:', e); callback(null); });
}

/* ========== TẠO LỆNH TẢI ========== */
function makeCommands(url, type, title) {
    var t = title.replace(/"/g, '\\"');
    var ext = type.toLowerCase() === 'iframe' ? 'mp4' : type.toLowerCase();
    var origin = pageInfo.origin;
    var ua = pageInfo.userAgent;
    var ref = pageInfo.referer;
    return {
        'yt-dlp': { label: 'yt-dlp cơ bản', cmd: 'yt-dlp --referer "' + ref + '" -o "' + t + '.%(ext)s" "' + url + '"' },
        'yt-dlp-hq': { label: 'yt-dlp HQ', cmd: 'yt-dlp --referer "' + ref + '" -f "bv*+ba/best" --merge-output-format mp4 --embed-thumbnail --add-metadata -o "' + t + '.%(ext)s" "' + url + '"' },
        'yt-dlp-aria': { label: 'yt-dlp + aria2', cmd: 'yt-dlp --referer "' + ref + '" --downloader aria2c --downloader-args "aria2c:-x 16 -s 16 -k 1M" --concurrent-fragments 8 -o "' + t + '.%(ext)s" "' + url + '"' },
        'yt-dlp-sub': { label: 'yt-dlp + sub', cmd: 'yt-dlp --referer "' + ref + '" --write-sub --sub-langs "vi,en" --embed-subs -o "' + t + '.%(ext)s" "' + url + '"' },
        'ffmpeg': { label: 'FFmpeg M3U8 MP4', cmd: 'ffmpeg -headers "Referer: ' + ref + '\\r\\nOrigin: ' + origin + '\\r\\nUser-Agent: ' + ua + '" -i "' + url + '" -c copy -bsf:a aac_adtstoasc "' + t + '.mp4"' },
        'ffmpeg-audio': { label: 'FFmpeg audio', cmd: 'ffmpeg -headers "Referer: ' + ref + '" -i "' + url + '" -vn -c:a copy "' + t + '.aac"' },
        'ffmpeg-cut': { label: 'FFmpeg cut', cmd: 'ffmpeg -headers "Referer: ' + ref + '" -ss 00:00:00 -to 00:05:00 -i "' + url + '" -c copy "' + t + '_cut.mp4"' },
        'curl': { label: 'cURL', cmd: 'curl -H "Referer: ' + ref + '" -o "' + t + '.' + ext + '" "' + url + '"' },
        'aria2': { label: 'aria2c', cmd: 'aria2c --referer="' + ref + '" -x 16 -s 16 -o "' + t + '.' + ext + '" "' + url + '"' },
        'wget': { label: 'wget', cmd: 'wget --referer="' + ref + '" -O "' + t + '.' + ext + '" "' + url + '"' }
    };
}

/* ========== THEMES GLASS UI PRO ========== */
var themes = {
    'glass-dark': {
        name: 'Glass Dark',
        meshBg: 'radial-gradient(at 20% 20%, rgba(124, 108, 255, 0.18) 0%, transparent 50%), radial-gradient(at 80% 80%, rgba(0, 229, 255, 0.14) 0%, transparent 50%), radial-gradient(at 50% 50%, rgba(255, 45, 149, 0.1) 0%, transparent 60%)',
        bg: 'rgba(10, 10, 18, 0.82)', bg2: 'rgba(18, 18, 30, 0.78)', bg3: 'rgba(28, 28, 45, 0.62)',
        glass: 'rgba(255, 255, 255, 0.05)', glassBorder: 'rgba(255, 255, 255, 0.12)',
        text: '#ffffff', text2: '#c8c8dc', text3: '#7a7a95',
        primary: '#7C6CFF', primaryGlow: 'rgba(124, 108, 255, 0.55)',
        accent: '#00E5FF', accentGlow: 'rgba(0, 229, 255, 0.5)',
        danger: '#FF5252', success: '#4ADE80', warning: '#FFB84D'
    },
    'glass-light': {
        name: 'Glass Light',
        meshBg: 'radial-gradient(at 20% 20%, rgba(91, 79, 207, 0.12) 0%, transparent 50%), radial-gradient(at 80% 80%, rgba(0, 153, 204, 0.1) 0%, transparent 50%)',
        bg: 'rgba(255, 255, 255, 0.8)', bg2: 'rgba(245, 245, 255, 0.74)', bg3: 'rgba(235, 235, 245, 0.6)',
        glass: 'rgba(0, 0, 0, 0.04)', glassBorder: 'rgba(0, 0, 0, 0.1)',
        text: '#1a1a2e', text2: '#4a4a6a', text3: '#8a8aa0',
        primary: '#5B4FCF', primaryGlow: 'rgba(91, 79, 207, 0.35)',
        accent: '#0099CC', accentGlow: 'rgba(0, 153, 204, 0.35)',
        danger: '#E63946', success: '#2A9D4A', warning: '#E67E00'
    },
    'glass-purple': {
        name: 'Glass Purple',
        meshBg: 'radial-gradient(at 15% 30%, rgba(192, 132, 252, 0.2) 0%, transparent 50%), radial-gradient(at 85% 70%, rgba(34, 211, 238, 0.14) 0%, transparent 50%), radial-gradient(at 50% 10%, rgba(244, 114, 182, 0.12) 0%, transparent 50%)',
        bg: 'rgba(16, 5, 32, 0.84)', bg2: 'rgba(28, 10, 50, 0.8)', bg3: 'rgba(44, 15, 70, 0.64)',
        glass: 'rgba(187, 134, 252, 0.06)', glassBorder: 'rgba(187, 134, 252, 0.18)',
        text: '#ffffff', text2: '#d4bcfc', text3: '#8a6ab0',
        primary: '#C084FC', primaryGlow: 'rgba(192, 132, 252, 0.6)',
        accent: '#22D3EE', accentGlow: 'rgba(34, 211, 238, 0.55)',
        danger: '#F472B6', success: '#4ADE80', warning: '#FBBF24'
    },
    'glass-matrix': {
        name: 'Glass Matrix',
        meshBg: 'radial-gradient(at 30% 30%, rgba(0, 255, 65, 0.18) 0%, transparent 50%), radial-gradient(at 70% 70%, rgba(0, 255, 204, 0.12) 0%, transparent 50%)',
        bg: 'rgba(0, 6, 0, 0.88)', bg2: 'rgba(0, 14, 0, 0.82)', bg3: 'rgba(0, 24, 0, 0.65)',
        glass: 'rgba(0, 255, 0, 0.05)', glassBorder: 'rgba(0, 255, 0, 0.18)',
        text: '#00ff41', text2: '#00dd33', text3: '#007722',
        primary: '#00ff41', primaryGlow: 'rgba(0, 255, 65, 0.6)',
        accent: '#00ffcc', accentGlow: 'rgba(0, 255, 204, 0.55)',
        danger: '#ff0040', success: '#00ff88', warning: '#ffff00'
    },
    'glass-cyber': {
        name: 'Glass Cyber',
        meshBg: 'radial-gradient(at 20% 20%, rgba(255, 45, 149, 0.2) 0%, transparent 50%), radial-gradient(at 80% 80%, rgba(0, 240, 255, 0.18) 0%, transparent 50%), radial-gradient(at 50% 50%, rgba(255, 204, 0, 0.1) 0%, transparent 50%)',
        bg: 'rgba(12, 5, 22, 0.85)', bg2: 'rgba(22, 10, 38, 0.8)', bg3: 'rgba(36, 15, 56, 0.65)',
        glass: 'rgba(255, 0, 128, 0.06)', glassBorder: 'rgba(255, 0, 128, 0.2)',
        text: '#ffffff', text2: '#ff99cc', text3: '#aa5588',
        primary: '#FF2D95', primaryGlow: 'rgba(255, 45, 149, 0.65)',
        accent: '#00F0FF', accentGlow: 'rgba(0, 240, 255, 0.6)',
        success: '#00FF88', danger: '#FF3366', warning: '#FFCC00'
    }
};
function getTheme() { return themes[data.theme] || themes['glass-dark']; }

/* ========== HÀM TIỆN ÍCH ========== */
function copy(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).catch(function() { fallbackCopy(text); });
    } else { fallbackCopy(text); }
}
function fallbackCopy(text) {
    var t = document.createElement('textarea');
    t.value = text;
    t.style.cssText = 'position:fixed;left:-9999px;top:-9999px;opacity:0;';
    document.body.appendChild(t);
    t.select();
    try { document.execCommand('copy'); } catch(e) {}
    t.remove();
}
function toast(msg, type) {
    type = type || 'success';
    var t = getTheme();
    var colors = { success: t.success, error: t.danger, info: t.accent, warning: t.warning };
    var color = colors[type] || t.primary;
    var el = document.createElement('div');
    el.innerText = msg;
    el.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%) translateY(-20px);background:' + color + ';color:#fff;padding:10px 22px;border-radius:24px;z-index:2147483649;font:bold 12px -apple-system,Arial,sans-serif;box-shadow:0 6px 24px ' + color + '60, 0 0 36px ' + color + '30;opacity:0;transition:all 0.3s cubic-bezier(0.4,0,0.2,1);pointer-events:none;backdrop-filter:blur(10px);border:1px solid rgba(255,255,255,0.25);';
    document.body.appendChild(el);
    requestAnimationFrame(function() { el.style.opacity = '1'; el.style.transform = 'translateX(-50%) translateY(0)'; });
    setTimeout(function() {
        el.style.opacity = '0';
        el.style.transform = 'translateX(-50%) translateY(-20px)';
        setTimeout(function() { el.remove(); }, 300);
    }, 2000);
}
function shareUrl(url) {
    if (navigator.share) {
        navigator.share({ title: pageInfo.title, text: pageInfo.title, url: url })
        .catch(function(err) { if (err.name !== 'AbortError') { copy(url); toast('Đã copy URL', 'success'); } });
    } else { copy(url); toast('Đã copy URL', 'info'); }
}
function addToHistory(url, type) {
    data.history = data.history || [];
    data.history.unshift({ url: url, type: type || 'URL', title: pageInfo.title, host: pageInfo.host, timestamp: Date.now() });
    if (data.history.length > 100) data.history = data.history.slice(0, 100);
    storage.set(data);
}
function isFavorite(url) { return data.favorites.some(function(f) { return f.url === url; }); }
function toggleFavorite(url, type) {
    var idx = data.favorites.findIndex(function(f) { return f.url === url; });
    if (idx >= 0) {
        data.favorites.splice(idx, 1);
        toast('Đã xóa khỏi Favorites', 'info');
    } else {
        data.favorites.unshift({ url: url, type: type || 'URL', title: pageInfo.title, host: pageInfo.host, timestamp: Date.now() });
        toast('Đã thêm vào Favorites', 'success');
    }
    storage.set(data);
    return isFavorite(url);
}
function escapeHtml(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function debounce(fn, delay) {
    var timer;
    return function() {
        var context = this, args = arguments;
        clearTimeout(timer);
        timer = setTimeout(function() { fn.apply(context, args); }, delay);
    };
}

/* ========== EXPORT DỮ LIỆU ========== */
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
            return (a.category || '') + ',' + a.type + ',"' + a.url.replace(/"/g, '""') + '",' + a.source + ',"' + a.title.replace(/"/g, '""') + '"';
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
    } else return;
    var blob = new Blob([content], { type: mime });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function() { a.remove(); URL.revokeObjectURL(a.href); }, 100);
    toast('Đã export ' + format.toUpperCase(), 'success');
}

/* ========== CSS GLASS UI PRO FULL ========== */
function getGlobalCSS(t) {
return '' +
'@keyframes uvdPulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.5; transform: scale(1.15); } }' +
'@keyframes uvdFadeIn { from { opacity: 0; transform: translateY(12px) scale(0.98); } to { opacity: 1; transform: translateY(0) scale(1); } }' +
'@keyframes uvdSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }' +
'@keyframes uvdMeshFloat { 0%, 100% { transform: scale(1) translate(0, 0); } 50% { transform: scale(1.06) translate(-1%, -1%); } }' +
'@keyframes uvdShimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }' +
'@keyframes uvdRipple { from { transform: scale(0); opacity: 0.5; } to { transform: scale(4); opacity: 0; } }' +

'.__uvd_panel__ { position: fixed; inset: 0; background: linear-gradient(135deg, ' + t.bg + ' 0%, ' + t.bg2 + ' 100%); backdrop-filter: blur(32px) saturate(200%) contrast(110%); -webkit-backdrop-filter: blur(32px) saturate(200%) contrast(110%); z-index: 2147483647; font-size: 13px; color: ' + t.text + '; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; display: flex; flex-direction: column; overflow: hidden; transition: all 0.35s cubic-bezier(0.4, 0, 0.2, 1); box-shadow: 0 25px 80px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.12), inset 0 -1px 0 rgba(0,0,0,0.3); border: 1px solid ' + t.glassBorder + '; animation: uvdFadeIn 0.35s cubic-bezier(0.4, 0, 0.2, 1); }' +
'.__uvd_panel__.minimized { height: auto !important; bottom: auto !important; border-radius: 0 0 20px 20px; }' +
'.__uvd_panel__.minimized .__uvd_body__ { display: none; }' +
'.__uvd_panel__.minimized .__uvd_header__ { border-bottom: 1px solid ' + t.glassBorder + '; }' +

'.__uvd_mesh_bg__ { position: absolute; inset: -10%; z-index: -2; background: ' + t.meshBg + '; pointer-events: none; animation: uvdMeshFloat 12s ease-in-out infinite; filter: blur(2px); }' +
'.__uvd_noise_overlay__ { position: absolute; inset: 0; z-index: -1; opacity: 0.04; pointer-events: none; background-image: url("data:image/svg+xml,%3Csvg viewBox=\'0 0 200 200\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'n\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.85\' numOctaves=\'4\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23n)\'/%3E%3C/svg%3E"); background-size: 120px 120px; mix-blend-mode: overlay; }' +

'.__uvd_panel__ * { box-sizing: border-box; }' +
'.__uvd_panel__ ::-webkit-scrollbar { width: 6px; height: 6px; }' +
'.__uvd_panel__ ::-webkit-scrollbar-track { background: transparent; margin: 4px; }' +
'.__uvd_panel__ ::-webkit-scrollbar-thumb { background: linear-gradient(180deg, ' + t.primary + '80, ' + t.accent + '80); border-radius: 10px; border: 1px solid transparent; background-clip: padding-box; }' +
'.__uvd_panel__ ::-webkit-scrollbar-thumb:hover { background: linear-gradient(180deg, ' + t.primary + ', ' + t.accent + '); }' +

'.__uvd_accent_inline__ { display: inline-block; width: 4px; height: 16px; vertical-align: middle; margin-right: 8px; background: linear-gradient(135deg, ' + t.primary + ', ' + t.accent + '); border-radius: 3px; box-shadow: 0 0 12px ' + t.primaryGlow + ', 0 0 24px ' + t.accentGlow + '50; }' +
'.__uvd_accent_inline_small__ { display: inline-block; width: 3px; height: 12px; vertical-align: middle; margin-right: 6px; background: linear-gradient(135deg, ' + t.primary + ', ' + t.accent + '); border-radius: 2px; box-shadow: 0 0 8px ' + t.primaryGlow + '; opacity: 0.9; }' +
'.__uvd_btn_accent__ { display: inline-block; width: 3px; height: 14px; vertical-align: middle; margin-right: 6px; background: rgba(255,255,255,0.95); border-radius: 2px; box-shadow: 0 0 6px rgba(255,255,255,0.4); }' +

'.__uvd_header__ { background: linear-gradient(180deg, ' + t.bg2 + 'ee, ' + t.bg2 + 'aa); backdrop-filter: blur(24px) saturate(180%); -webkit-backdrop-filter: blur(24px) saturate(180%); padding: 16px 18px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid ' + t.glassBorder + '; flex-shrink: 0; position: relative; box-shadow: inset 0 1px 0 rgba(255,255,255,0.15), 0 8px 30px rgba(0,0,0,0.35); }' +
'.__uvd_header_left__ { display: flex; align-items: center; gap: 12px; min-width: 0; flex: 1; }' +
'.__uvd_header_text__ { min-width: 0; flex: 1; overflow: hidden; }' +
'.__uvd_title__ { font-size: 16px; font-weight: 800; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: flex; align-items: center; letter-spacing: 0.3px; }' +
'.__uvd_version__ { font-size: 10px; background: linear-gradient(135deg, ' + t.primary + ', ' + t.accent + '); color: #fff; padding: 3px 8px; border-radius: 6px; vertical-align: middle; box-shadow: 0 0 16px ' + t.primaryGlow + ', 0 0 32px ' + t.accentGlow + '40; margin-left: 8px; font-weight: 700; }' +
'.__uvd_subtitle__ { font-size: 11px; color: ' + t.text2 + '; margin-top: 4px; display: flex; align-items: center; gap: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-weight: 500; }' +
'.__uvd_live_dot__ { width: 6px; height: 6px; background: ' + t.success + '; border-radius: 50%; display: inline-block; animation: uvdPulse 1.8s infinite; flex-shrink: 0; box-shadow: 0 0 10px ' + t.success + ', 0 0 20px ' + t.success + '60; }' +
'.__uvd_header_right__ { display: flex; gap: 8px; flex-shrink: 0; }' +

'.__uvd_btn_icon__ { position: relative; overflow: hidden; background: linear-gradient(135deg, ' + t.glass + ', ' + t.bg3 + '80); border: 1px solid ' + t.glassBorder + '; color: ' + t.text + '; width: 38px; height: 38px; border-radius: 12px; font-size: 18px; cursor: pointer; display: flex; align-items: center; justify-content: center; backdrop-filter: blur(14px); transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1); box-shadow: inset 0 1px 0 rgba(255,255,255,0.15), 0 4px 12px rgba(0,0,0,0.25); -webkit-tap-highlight-color: transparent; }' +
'.__uvd_btn_icon__:hover { transform: translateY(-2px); border-color: ' + t.primary + '80; box-shadow: inset 0 1px 0 rgba(255,255,255,0.2), 0 8px 20px ' + t.primaryGlow + '40; }' +
'.__uvd_btn_icon__:active { transform: scale(0.92) translateY(0); background: ' + t.primary + '50; }' +
'.__uvd_btn_icon__.spinning { animation: uvdSpin 0.7s linear infinite; }' +

'.__uvd_body__ { display: flex; flex-direction: column; flex: 1; min-height: 0; position: relative; z-index: 1; }' +

'.__uvd_search_bar__ { padding: 12px 18px; display: flex; gap: 10px; align-items: center; background: linear-gradient(180deg, ' + t.glass + 'cc, ' + t.glass + '66); backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px); border-bottom: 1px solid ' + t.glassBorder + '; flex-shrink: 0; }' +
'.__uvd_search_input__ { flex: 1; min-width: 0; background: linear-gradient(135deg, ' + t.bg3 + 'aa, ' + t.bg2 + '66); border: 1.5px solid ' + t.glassBorder + '; color: ' + t.text + '; padding: 10px 14px; border-radius: 12px; font-size: 13px; outline: none; backdrop-filter: blur(10px); transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1); box-shadow: inset 0 2px 4px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.08); font-weight: 500; }' +
'.__uvd_search_input__:focus { border-color: ' + t.primary + '; background: ' + t.bg3 + 'dd; box-shadow: 0 0 0 3px ' + t.primaryGlow + '50, inset 0 2px 4px rgba(0,0,0,0.15); transform: translateY(-1px); }' +
'.__uvd_search_input__::placeholder { color: ' + t.text3 + '; font-weight: 400; }' +
'.__uvd_sort_select__ { background: linear-gradient(135deg, ' + t.bg3 + 'aa, ' + t.bg2 + '66); border: 1.5px solid ' + t.glassBorder + '; color: ' + t.text + '; padding: 10px 12px; border-radius: 12px; font-size: 12px; outline: none; cursor: pointer; backdrop-filter: blur(10px); transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1); font-weight: 600; box-shadow: inset 0 1px 0 rgba(255,255,255,0.1); }' +
'.__uvd_sort_select__:hover { border-color: ' + t.primary + '80; }' +
'.__uvd_sort_select__:focus { border-color: ' + t.primary + '; box-shadow: 0 0 0 3px ' + t.primaryGlow + '40; }' +

'.__uvd_tabs__ { display: flex; background: linear-gradient(180deg, ' + t.bg2 + 'cc, ' + t.bg2 + '88); backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px); padding: 8px; gap: 6px; border-bottom: 1px solid ' + t.glassBorder + '; overflow-x: auto; flex-shrink: 0; -webkit-overflow-scrolling: touch; scrollbar-width: none; }' +
'.__uvd_tabs__::-webkit-scrollbar { display: none; }' +
'.__uvd_tab__ { position: relative; overflow: hidden; flex: 0 0 auto; background: transparent; color: ' + t.text2 + '; border: 1.5px solid transparent; padding: 9px 14px; border-radius: 12px; font-size: 12px; font-weight: 700; cursor: pointer; white-space: nowrap; display: flex; align-items: center; gap: 6px; transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1); -webkit-tap-highlight-color: transparent; letter-spacing: 0.2px; }' +
'.__uvd_tab__::after { content: ""; position: absolute; inset: 0; background: linear-gradient(90deg, transparent, rgba(255,255,255,0.15), transparent); background-size: 200% 100%; opacity: 0; transition: opacity 0.5s; }' +
'.__uvd_tab__:hover { color: ' + t.text + '; background: ' + t.glass + '; border-color: ' + t.glassBorder + '; transform: translateY(-1px); }' +
'.__uvd_tab__:hover::after { opacity: 1; animation: uvdShimmer 1.2s linear; }' +
'.__uvd_tab__:active { transform: scale(0.97); }' +
'.__uvd_tab__.active { background: linear-gradient(135deg, ' + t.primary + '30, ' + t.accent + '20); color: ' + t.text + '; box-shadow: 0 0 16px ' + t.primaryGlow + '60, 0 4px 14px ' + t.accentGlow + '30, inset 0 1px 0 rgba(255,255,255,0.2); border-color: ' + t.primary + '80; transform: translateY(-1px); }' +
'.__uvd_badge__ { background: linear-gradient(135deg, ' + t.glass + ', ' + t.bg3 + '); border: 1px solid ' + t.glassBorder + '; padding: 2px 7px; border-radius: 6px; font-size: 10px; font-weight: 800; transition: all 0.25s; }' +
'.__uvd_tab__.active .__uvd_badge__ { background: linear-gradient(135deg, ' + t.primary + '70, ' + t.accent + '70); border-color: ' + t.primary + '; color: #fff; box-shadow: 0 0 10px ' + t.primaryGlow + '50; }' +

'.__uvd_info_bar__ { padding: 12px 18px; background: linear-gradient(180deg, ' + t.glass + 'aa, ' + t.glass + '44); -webkit-backdrop-filter: blur(16px); border-bottom: 1px solid ' + t.glassBorder + '; font-size: 12px; flex-shrink: 0; backdrop-filter: blur(16px); box-shadow: inset 0 1px 0 rgba(255,255,255,0.08); }' +
'.__uvd_info_row__ { display: flex; gap: 8px; align-items: center; margin-bottom: 4px; }' +
'.__uvd_info_row__:last-child { margin-bottom: 0; }' +
'.__uvd_info_label__ { opacity: 0.9; font-weight: 700; color: ' + t.text2 + '; display: flex; align-items: center; font-size: 11px; }' +
'.__uvd_clickable__ { cursor: pointer; text-decoration: underline dotted; text-underline-offset: 3px; transition: all 0.2s; }' +
'.__uvd_clickable__:hover { color: ' + t.primary + '; text-decoration-color: ' + t.primary + '; }' +
'.__uvd_clickable__:active { color: ' + t.accent + '; transform: scale(0.98); }' +
'.__uvd_info_value__ { color: ' + t.accent + '; flex: 1; min-width: 0; font-weight: 600; }' +
'.__uvd_mono__ { font-family: "SF Mono", Menlo, Consolas, monospace; font-size: 11px; word-break: break-all; }' +

'.__uvd_content__ { flex: 1; overflow-y: auto; padding: 16px 18px; -webkit-overflow-scrolling: touch; }' +

'.__uvd_card__ { position: relative; overflow: hidden; background: linear-gradient(135deg, ' + t.bg3 + 'cc, ' + t.bg2 + 'aa); backdrop-filter: blur(16px) saturate(150%); -webkit-backdrop-filter: blur(16px) saturate(150%); border: 1.5px solid ' + t.glassBorder + '; padding: 16px; margin-bottom: 12px; border-radius: 16px; animation: uvdFadeIn 0.4s cubic-bezier(0.4, 0, 0.2, 1); box-shadow: inset 0 1px 0 rgba(255,255,255,0.12), 0 8px 24px rgba(0,0,0,0.3), 0 0 0 1px rgba(255,255,255,0.02) inset; transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); }' +
'.__uvd_card__::before { content: ""; position: absolute; top: 0; left: 0; right: 0; height: 1px; background: linear-gradient(90deg, transparent, ' + t.primary + '60, transparent); opacity: 0; transition: opacity 0.4s; }' +
'.__uvd_card__:hover { transform: translateY(-3px); border-color: ' + t.primary + '60; box-shadow: inset 0 1px 0 rgba(255,255,255,0.18), 0 14px 36px rgba(0,0,0,0.4), 0 0 24px ' + t.primaryGlow + '25; }' +
'.__uvd_card__:hover::before { opacity: 1; }' +
'.__uvd_card_header__ { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; gap: 10px; }' +
'.__uvd_type_badge__ { padding: 5px 12px; border-radius: 8px; font-size: 11px; font-weight: 800; color: #fff; flex-shrink: 0; box-shadow: 0 3px 10px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.25); letter-spacing: 0.3px; }' +
'.__uvd_card_meta__ { display: flex; gap: 8px; align-items: center; min-width: 0; }' +
'.__uvd_source__ { color: ' + t.text3 + '; font-size: 10px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 500; }' +
'.__uvd_fav_btn__ { background: transparent; border: 0; font-size: 18px; cursor: pointer; padding: 3px 5px; -webkit-tap-highlight-color: transparent; transition: transform 0.2s; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3)); }' +
'.__uvd_fav_btn__:hover { transform: scale(1.2); }' +
'.__uvd_fav_btn__:active { transform: scale(0.9); }' +

'.__uvd_url_box__ { position: relative; background: linear-gradient(135deg, ' + t.bg + 'dd, ' + t.bg3 + 'aa); border: 1.5px solid ' + t.glassBorder + '; padding: 10px 12px; border-radius: 10px; font-family: "SF Mono", Menlo, Consolas, monospace; font-size: 11px; box-shadow: inset 0 2px 6px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.06); line-height: 1.5; margin-bottom: 12px; color: ' + t.text2 + '; word-break: break-all; max-height: 60px; overflow-y: auto; transition: border-color 0.25s; }' +
'.__uvd_url_box__:hover { border-color: ' + t.primary + '50; }' +

'.__uvd_actions__ { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; }' +
'.__uvd_act_btn__ { position: relative; overflow: hidden; border: 0; padding: 11px 8px; border-radius: 12px; font-size: 12px; font-weight: 700; cursor: pointer; color: #fff; display: flex; align-items: center; justify-content: center; gap: 5px; box-shadow: 0 4px 14px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.25), inset 0 -2px 0 rgba(0,0,0,0.2); transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1); -webkit-tap-highlight-color: transparent; letter-spacing: 0.2px; text-shadow: 0 1px 2px rgba(0,0,0,0.3); }' +
'.__uvd_act_btn__:hover { transform: translateY(-2px); box-shadow: 0 8px 22px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.3), inset 0 -2px 0 rgba(0,0,0,0.2); filter: brightness(1.08); }' +
'.__uvd_act_btn__:active { transform: scale(0.96) translateY(0); filter: brightness(0.95); }' +
'.__uvd_act_btn__.full { grid-column: 1 / -1; padding: 12px; }' +
'.__uvd_btn_share__ { background: linear-gradient(135deg, #FF5252, #FF1744); }' +
'.__uvd_btn_copy__ { background: linear-gradient(135deg, ' + t.primary + ', ' + t.accent + '); }' +
'.__uvd_btn_quality__ { background: linear-gradient(135deg, #AB47BC, #7B1FA2); }' +
'.__uvd_btn_preview__ { background: linear-gradient(135deg, #26C6DA, #00838F); }' +
'.__uvd_btn_cmd__ { background: linear-gradient(135deg, #EC407A, #C2185B); }' +
'.__uvd_btn_iframe__ { background: linear-gradient(135deg, #42A5F5, #1565C0); }' +
'.__uvd_btn_download__ { background: linear-gradient(135deg, ' + t.success + ', #1B9E54); }' +
'.__uvd_btn_open__ { background: linear-gradient(135deg, ' + t.warning + ', #CC8400); }' +

'.__uvd_footer__ { background: linear-gradient(0deg, ' + t.bg2 + 'ee, ' + t.bg2 + 'aa); backdrop-filter: blur(24px); -webkit-backdrop-filter: blur(24px); padding: 12px 14px; box-shadow: inset 0 1px 0 rgba(255,255,255,0.12), 0 -8px 24px rgba(0,0,0,0.3); border-top: 1px solid ' + t.glassBorder + '; display: flex; gap: 8px; flex-wrap: wrap; flex-shrink: 0; }' +
'.__uvd_footer_btn__ { position: relative; overflow: hidden; background: linear-gradient(135deg, ' + t.glass + 'cc, ' + t.bg3 + '88); border: 1.5px solid ' + t.glassBorder + '; flex: 1; min-width: 70px; cursor: pointer; backdrop-filter: blur(12px); transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1); -webkit-tap-highlight-color: transparent; color: ' + t.text + '; padding: 10px 12px; border-radius: 12px; font-size: 12px; font-weight: 700; box-shadow: inset 0 1px 0 rgba(255,255,255,0.12), 0 3px 10px rgba(0,0,0,0.2); letter-spacing: 0.2px; }' +
'.__uvd_footer_btn__:hover { transform: translateY(-2px); border-color: ' + t.primary + '80; background: linear-gradient(135deg, ' + t.primary + '25, ' + t.accent + '15); box-shadow: 0 6px 16px ' + t.primaryGlow + '35, inset 0 1px 0 rgba(255,255,255,0.18); }' +
'.__uvd_footer_btn__:active { transform: scale(0.96) translateY(0); background: ' + t.primary + '50; }' +

'.__uvd_empty__ { text-align: center; padding: 60px 24px; color: ' + t.text2 + '; }' +
'.__uvd_empty_icon__ { font-size: 48px; margin-bottom: 14px; opacity: 0.6; filter: drop-shadow(0 4px 10px rgba(0,0,0,0.3)); }' +
'.__uvd_empty_text__ { font-size: 14px; font-weight: 700; margin-bottom: 6px; color: ' + t.text + '; }' +
'.__uvd_empty_sub__ { font-size: 12px; color: ' + t.text3 + '; line-height: 1.5; }' +

'.__uvd_photo_thumb_wrap__ { position: relative; margin-bottom: 12px; border-radius: 12px; overflow: hidden; background: ' + t.bg + '; border: 1.5px solid ' + t.glassBorder + '; cursor: pointer; transition: all 0.3s; box-shadow: 0 4px 16px rgba(0,0,0,0.3); }' +
'.__uvd_photo_thumb_wrap__:hover { transform: scale(1.02); border-color: ' + t.primary + '60; box-shadow: 0 8px 24px ' + t.primaryGlow + '30; }' +
'.__uvd_photo_thumb_wrap__ img { width: 100%; max-height: 200px; object-fit: cover; display: block; }' +

'.__uvd_overlay__ { position: fixed; inset: 0; background: rgba(0,0,0,0.85); backdrop-filter: blur(24px) saturate(150%); -webkit-backdrop-filter: blur(24px) saturate(150%); z-index: 2147483648; padding: 16px; display: flex; flex-direction: column; overflow-y: auto; -webkit-overflow-scrolling: touch; animation: uvdFadeIn 0.3s cubic-bezier(0.4, 0, 0.2, 1); }' +
'.__uvd_overlay_box__ { background: linear-gradient(135deg, ' + t.bg + 'ee, ' + t.bg2 + 'dd); backdrop-filter: blur(32px) saturate(200%); -webkit-backdrop-filter: blur(32px) saturate(200%); border-radius: 22px; padding: 22px; width: 100%; max-width: 620px; margin: auto; border: 1.5px solid ' + t.glassBorder + '; box-shadow: 0 30px 80px rgba(0,0,0,0.8), inset 0 1px 0 rgba(255,255,255,0.15), 0 0 40px ' + t.primaryGlow + '20; animation: uvdFadeIn 0.4s cubic-bezier(0.4, 0, 0.2, 1); }' +
'.__uvd_overlay_title__ { color: ' + t.primary + '; font-size: 18px; font-weight: 800; margin-bottom: 18px; display: flex; align-items: center; gap: 10px; letter-spacing: 0.3px; text-shadow: 0 0 16px ' + t.primaryGlow + '50; }' +

'.__uvd_quality_card__ { background: ' + t.bg3 + 'cc; border: 1.5px solid ' + t.glassBorder + '; padding: 14px; margin-bottom: 10px; border-radius: 14px; box-shadow: inset 0 1px 0 rgba(255,255,255,0.08), 0 4px 14px rgba(0,0,0,0.25); transition: all 0.25s; }' +
'.__uvd_quality_card__:hover { border-color: ' + t.primary + '60; transform: translateY(-1px); }' +
'.__uvd_quality_header__ { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }' +
'.__uvd_quality_label__ { color: ' + t.primary + '; font-size: 15px; font-weight: 800; text-shadow: 0 0 10px ' + t.primaryGlow + '; }' +
'.__uvd_quality_info__ { color: ' + t.text3 + '; font-size: 10px; margin-bottom: 10px; line-height: 1.5; }' +

'.__uvd_cmd_card__ { background: ' + t.bg3 + 'cc; border: 1.5px solid ' + t.glassBorder + '; padding: 14px; margin-bottom: 10px; border-radius: 14px; box-shadow: inset 0 1px 0 rgba(255,255,255,0.08), 0 4px 14px rgba(0,0,0,0.25); }' +
'.__uvd_cmd_label__ { color: ' + t.warning + '; font-weight: 700; margin-bottom: 8px; font-size: 12px; display: flex; align-items: center; }' +
'.__uvd_cmd_code__ { background: ' + t.bg + 'dd; border: 1.5px solid ' + t.glassBorder + '; padding: 10px; border-radius: 10px; font-family: "SF Mono", Menlo, Consolas, monospace; font-size: 11px; color: ' + t.text2 + '; word-break: break-all; max-height: 80px; overflow-y: auto; margin-bottom: 10px; line-height: 1.5; box-shadow: inset 0 2px 6px rgba(0,0,0,0.25); }' +

'.__uvd_textarea__ { width: 100%; min-height: 130px; background: ' + t.bg + 'dd; border: 2px solid ' + t.primary + '60; color: ' + t.text + '; border-radius: 12px; padding: 12px; font: 12px "SF Mono", Menlo, Consolas, monospace; resize: vertical; line-height: 1.5; outline: none; transition: all 0.25s; box-shadow: inset 0 2px 6px rgba(0,0,0,0.25); }' +
'.__uvd_textarea__:focus { border-color: ' + t.primary + '; box-shadow: 0 0 0 3px ' + t.primaryGlow + '50, inset 0 2px 6px rgba(0,0,0,0.15); }' +

'.__uvd_btn_primary__ { background: linear-gradient(135deg, ' + t.primary + ', ' + t.accent + '); color: #fff; border: 0; padding: 12px 20px; border-radius: 12px; font-weight: 800; font-size: 13px; cursor: pointer; flex: 1; box-shadow: 0 6px 20px ' + t.primaryGlow + '60, 0 0 30px ' + t.accentGlow + '30, inset 0 1px 0 rgba(255,255,255,0.25); -webkit-tap-highlight-color: transparent; transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1); letter-spacing: 0.3px; }' +
'.__uvd_btn_primary__:hover { transform: translateY(-2px); box-shadow: 0 10px 28px ' + t.primaryGlow + '70, 0 0 40px ' + t.accentGlow + '40, inset 0 1px 0 rgba(255,255,255,0.3); filter: brightness(1.08); }' +
'.__uvd_btn_primary__:active { transform: scale(0.96); }' +
'.__uvd_btn_danger__ { background: linear-gradient(135deg, ' + t.danger + ', #CC0033); color: #fff; border: 0; padding: 12px 20px; border-radius: 12px; font-weight: 800; font-size: 13px; cursor: pointer; flex: 1; box-shadow: 0 6px 20px rgba(255,82,82,0.5), inset 0 1px 0 rgba(255,255,255,0.25); transition: all 0.25s; }' +
'.__uvd_btn_danger__:hover { transform: translateY(-2px); filter: brightness(1.1); box-shadow: 0 10px 28px rgba(255,82,82,0.6); }' +
'.__uvd_btn_danger__:active { transform: scale(0.96); }' +
'.__uvd_btn_ghost__ { background: linear-gradient(135deg, ' + t.glass + 'cc, ' + t.bg3 + '88); border: 1.5px solid ' + t.glassBorder + '; color: ' + t.text + '; padding: 12px 20px; border-radius: 12px; font-weight: 700; font-size: 13px; cursor: pointer; flex: 1; backdrop-filter: blur(12px); transition: all 0.25s; box-shadow: inset 0 1px 0 rgba(255,255,255,0.12); }' +
'.__uvd_btn_ghost__:hover { border-color: ' + t.primary + '80; background: ' + t.primary + '20; transform: translateY(-1px); }' +
'.__uvd_btn_ghost__:active { transform: scale(0.97); }' +
'.btn-row { display: flex; gap: 10px; margin-top: 16px; flex-wrap: wrap; }' +

'.__uvd_settings_section__ { background: ' + t.bg3 + 'cc; border: 1.5px solid ' + t.glassBorder + '; padding: 16px; margin-bottom: 14px; border-radius: 16px; box-shadow: inset 0 1px 0 rgba(255,255,255,0.08), 0 4px 16px rgba(0,0,0,0.25); }' +
'.__uvd_settings_title__ { color: ' + t.text + '; font-weight: 800; margin-bottom: 14px; font-size: 14px; display: flex; align-items: center; }' +
'.__uvd_theme_grid__ { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; }' +
'.__uvd_theme_btn__ { background: linear-gradient(135deg, ' + t.bg2 + 'aa, ' + t.bg3 + '88); border: 2px solid ' + t.glassBorder + '; color: ' + t.text + '; padding: 14px; border-radius: 12px; font-weight: 700; cursor: pointer; font-size: 12px; transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1); text-align: center; box-shadow: inset 0 1px 0 rgba(255,255,255,0.1); }' +
'.__uvd_theme_btn__:hover { transform: translateY(-2px); border-color: ' + t.primary + '60; }' +
'.__uvd_theme_btn__:active { transform: scale(0.96); }' +
'.__uvd_theme_btn__.active { border-color: ' + t.primary + '; background: ' + t.primary + '30; box-shadow: 0 0 18px ' + t.primaryGlow + '50, inset 0 1px 0 rgba(255,255,255,0.15); }' +
'.__uvd_profile_card__ { background: ' + t.bg + 'cc; border: 1.5px solid ' + t.glassBorder + '; padding: 12px; margin-bottom: 8px; border-radius: 10px; font-size: 11px; box-shadow: inset 0 1px 0 rgba(255,255,255,0.06); }' +
'.__uvd_profile_host__ { color: ' + t.primary + '; font-weight: 800; margin-bottom: 4px; font-size: 12px; }' +
'.__uvd_profile_ref__ { color: ' + t.text2 + '; font-family: "SF Mono", Menlo, Consolas, monospace; font-size: 10px; word-break: break-all; line-height: 1.4; }' +

'.__uvd_ts_input_row__ { display: flex; gap: 8px; margin-bottom: 12px; }' +
'.__uvd_ts_input__ { flex: 1; min-width: 0; background: ' + t.bg3 + 'cc; border: 1.5px solid ' + t.glassBorder + '; color: ' + t.text + '; padding: 10px 14px; border-radius: 12px; font-size: 12px; outline: none; transition: all 0.25s; }' +
'.__uvd_ts_input__:focus { border-color: ' + t.primary + '; box-shadow: 0 0 0 3px ' + t.primaryGlow + '40; }' +
'.__uvd_ts_file_card__ { background: ' + t.bg3 + 'cc; border: 1.5px solid ' + t.glassBorder + '; padding: 12px; margin-bottom: 8px; border-radius: 12px; box-shadow: inset 0 1px 0 rgba(255,255,255,0.06); }' +
'.__uvd_ts_file_name__ { color: ' + t.text + '; font-size: 11px; font-weight: 700; margin-bottom: 4px; word-break: break-all; }' +
'.__uvd_ts_file_meta__ { color: ' + t.text3 + '; font-size: 10px; margin-bottom: 8px; }' +
'.__uvd_ts_torrent_card__ { background: ' + t.bg3 + 'cc; border: 1.5px solid ' + t.glassBorder + '; border-left: 4px solid ' + t.primary + '; padding: 14px; margin-bottom: 10px; border-radius: 12px; box-shadow: inset 0 1px 0 rgba(255,255,255,0.06), 0 4px 12px rgba(0,0,0,0.25); }' +
'.__uvd_ts_torrent_name__ { color: ' + t.text + '; font-size: 12px; font-weight: 800; margin-bottom: 4px; }' +
'.__uvd_ts_torrent_meta__ { color: ' + t.text3 + '; font-size: 10px; }' +

'.__uvd_history_item__ { background: ' + t.bg3 + 'cc; border: 1.5px solid ' + t.glassBorder + '; padding: 12px 14px; margin-bottom: 8px; border-radius: 12px; box-shadow: inset 0 1px 0 rgba(255,255,255,0.06); transition: all 0.25s; }' +
'.__uvd_history_item__:hover { border-color: ' + t.primary + '50; transform: translateX(3px); }' +
'.__uvd_history_title__ { color: ' + t.text + '; font-size: 12px; font-weight: 700; margin-bottom: 3px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }' +
'.__uvd_history_meta__ { color: ' + t.text3 + '; font-size: 10px; margin-bottom: 3px; }' +
'.__uvd_history_url__ { color: ' + t.text2 + '; font-size: 10px; font-family: "SF Mono", Menlo, Consolas, monospace; word-break: break-all; max-height: 26px; overflow: hidden; line-height: 1.3; }' +

'.__uvd_fav_card__ { background: ' + t.bg3 + 'cc; border: 1.5px solid ' + t.glassBorder + '; padding: 16px; margin-bottom: 12px; border-radius: 14px; border-left: 4px solid #FFD700; box-shadow: inset 0 1px 0 rgba(255,255,255,0.06), 0 4px 14px rgba(0,0,0,0.25); }' +
'.__uvd_fav_header__ { display: flex; justify-content: space-between; margin-bottom: 6px; align-items: center; }' +
'.__uvd_fav_title__ { color: #FFD700; font-size: 11px; font-weight: 800; display: flex; align-items: center; }' +
'.__uvd_fav_date__ { color: ' + t.text3 + '; font-size: 10px; }' +

'.__uvd_photo_fullscreen__ { position: fixed; inset: 0; background: rgba(0,0,0,0.97); backdrop-filter: blur(20px); z-index: 2147483649; display: flex; align-items: center; justify-content: center; padding: 20px; animation: uvdFadeIn 0.3s ease; }' +
'.__uvd_photo_fullscreen__ img { max-width: 100%; max-height: 100%; object-fit: contain; border-radius: 12px; box-shadow: 0 20px 60px rgba(0,0,0,0.8); }' +
'.__uvd_photo_fullscreen_close__ { position: absolute; top: 24px; right: 24px; background: rgba(255,255,255,0.18); backdrop-filter: blur(14px); width: 44px; height: 44px; border-radius: 50%; font-size: 20px; cursor: pointer; border: 1.5px solid rgba(255,255,255,0.3); color: #fff; transition: all 0.25s; box-shadow: 0 6px 20px rgba(0,0,0,0.5); }' +
'.__uvd_photo_fullscreen_close__:hover { background: rgba(255,70,70,0.8); transform: scale(1.1); }' +

'.__uvd_preview_overlay__ { z-index: 2147483648; display: flex; flex-direction: column; position: fixed; inset: 0; background: #000; animation: uvdFadeIn 0.25s ease; }' +
'.__uvd_preview_header__ { position: absolute; top: 0; left: 0; right: 0; z-index: 10; background: linear-gradient(to bottom, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.5) 60%, transparent 100%); padding: 14px 16px; padding-top: max(14px, env(safe-area-inset-top)); transition: opacity 0.35s ease; display: flex; justify-content: space-between; align-items: center; }' +
'.__uvd_preview_header__.hidden { opacity: 0; pointer-events: none; }' +
'.__uvd_preview_title__ { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: #fff; font-size: 14px; font-weight: 700; flex: 1; margin-right: 12px; text-shadow: 0 2px 10px rgba(0,0,0,0.9); }' +
'.__uvd_preview_close__ { background: rgba(255,255,255,0.18); backdrop-filter: blur(14px); display: flex; align-items: center; justify-content: center; transition: all 0.25s; border: 1.5px solid rgba(255,255,255,0.3); color: #fff; width: 40px; height: 40px; border-radius: 50%; font-size: 18px; cursor: pointer; flex-shrink: 0; box-shadow: 0 4px 14px rgba(0,0,0,0.5); }' +
'.__uvd_preview_close__:hover { background: rgba(255,70,70,0.85); transform: scale(1.08); }' +
'.__uvd_preview_video_wrap__ { flex: 1; display: flex; align-items: center; justify-content: center; position: relative; background: #000; overflow: hidden; }' +
'.__uvd_preview_video__ { width: 100%; height: 100%; object-fit: contain; background: #000; }' +
'.__uvd_preview_status__ { position: absolute; bottom: 150px; left: 14px; z-index: 8; background: rgba(0,0,0,0.82); backdrop-filter: blur(14px); border: 1.5px solid rgba(255,255,255,0.28); padding: 8px 16px; border-radius: 16px; font-size: 12px; color: #fff; font-weight: 600; pointer-events: none; opacity: 0; transform: translateY(8px); transition: all 0.3s ease; max-width: 65%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; box-shadow: 0 6px 18px rgba(0,0,0,0.5); display: flex; align-items: center; gap: 8px; }' +
'.__uvd_preview_status__.visible { opacity: 1; transform: translateY(0); }' +
'.__uvd_preview_status__::before { content: ""; width: 7px; height: 7px; border-radius: 50%; background: ' + t.success + '; box-shadow: 0 0 10px ' + t.success + '; animation: uvdPulse 1.5s infinite; flex-shrink: 0; }' +
'.__uvd_preview_status__.error::before { background: ' + t.danger + '; box-shadow: 0 0 10px ' + t.danger + '; }' +
'.__uvd_preview_status__.buffering::before { background: ' + t.warning + '; box-shadow: 0 0 10px ' + t.warning + '; }' +
'.__uvd_preview_quality_bar__ { position: absolute; top: 65px; left: 12px; right: 12px; z-index: 9; -webkit-backdrop-filter: blur(18px); border: 1.5px solid rgba(255,255,255,0.28); border-radius: 16px; background: rgba(0,0,0,0.87); backdrop-filter: blur(18px); padding: 14px; display: none; box-shadow: 0 8px 28px rgba(0,0,0,0.6); max-height: 45vh; overflow-y: auto; animation: uvdFadeIn 0.3s ease; }' +
'.__uvd_preview_quality_bar__.visible { display: block; }' +
'.__uvd_preview_quality_label__ { color: #fff; font-size: 12px; font-weight: 700; margin-bottom: 12px; display: flex; align-items: center; gap: 8px; }' +
'.__uvd_preview_quality_label__::before { content: ""; width: 4px; height: 14px; background: linear-gradient(to bottom, ' + t.primary + ', ' + t.accent + '); border-radius: 3px; box-shadow: 0 0 10px ' + t.primaryGlow + '; }' +
'.__uvd_preview_quality_list__ { display: flex; gap: 8px; flex-wrap: wrap; }' +
'.__uvd_preview_controls__ { position: absolute; bottom: 0; left: 0; right: 0; z-index: 10; display: flex; gap: 10px; flex-wrap: wrap; justify-content: center; transition: opacity 0.35s ease; background: linear-gradient(to top, rgba(0,0,0,0.94) 0%, rgba(0,0,0,0.5) 60%, transparent 100%); padding: 16px; padding-bottom: max(16px, env(safe-area-inset-bottom)); }' +
'.__uvd_preview_controls__.hidden { opacity: 0; pointer-events: none; }' +
'.__uvd_preview_btn__ { background: rgba(255,255,255,0.16); backdrop-filter: blur(14px); border: 1.5px solid rgba(255,255,255,0.3); color: #fff; padding: 10px 18px; border-radius: 22px; font-size: 13px; font-weight: 700; cursor: pointer; transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1); letter-spacing: 0.3px; box-shadow: 0 4px 14px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.22); }' +
'.__uvd_preview_btn__:hover { background: rgba(255,255,255,0.3); transform: translateY(-2px); }' +
'.__uvd_preview_btn__:active { transform: scale(0.95); background: rgba(255,255,255,0.38); }' +
'.__uvd_preview_btn__.active { background: linear-gradient(135deg, ' + t.primary + ', ' + t.accent + '); border-color: ' + t.primary + '; box-shadow: 0 0 18px ' + t.primaryGlow + '70, inset 0 1px 0 rgba(255,255,255,0.25); }' +

'@media (orientation: landscape) { .__uvd_preview_video__ { width: 100vw; height: 100vh; } .__uvd_preview_controls__ { padding: 10px 14px; } .__uvd_preview_status__ { bottom: 120px; left: 12px; } .__uvd_preview_quality_bar__ { top: 60px; } }' +
'@media (orientation: portrait) { .__uvd_preview_video__ { width: 100%; max-height: 55vh; } .__uvd_preview_video_wrap__ { min-height: 55vh; } }' +

'@media (max-width: 480px) {' +
'.__uvd_header__ { padding: 14px; } .__uvd_title__ { font-size: 15px; }' +
'.__uvd_search_bar__ { padding: 10px 14px; gap: 8px; }' +
'.__uvd_content__ { padding: 12px 14px; }' +
'.__uvd_card__ { padding: 14px; border-radius: 14px; margin-bottom: 10px; }' +
'.__uvd_act_btn__ { padding: 10px 6px; font-size: 11px; border-radius: 10px; }' +
'.__uvd_footer__ { padding: 10px; gap: 6px; }' +
'.__uvd_footer_btn__ { padding: 9px 8px; font-size: 11px; border-radius: 10px; min-width: 60px; }' +
'.__uvd_overlay_box__ { padding: 18px; border-radius: 18px; }' +
'.__uvd_btn_primary__, .__uvd_btn_danger__, .__uvd_btn_ghost__ { padding: 11px 16px; font-size: 12px; }' +
'.__uvd_theme_grid__ { grid-template-columns: 1fr; }' +
'}';
}

/* ========== BIẾN TRẠNG THÁI UI ========== */
var currentTab = 'video';
var currentFilter = '';
var currentSort = 'priority';
var isMinimized = false;
var tsTorrentsCache = [];

/* ========== XÂY DỰNG TOÀN BỘ UI ========== */
function buildUI() {
    var t = getTheme();
    var oldPanel = document.getElementById('__uvd__');
    if (oldPanel) oldPanel.remove();
    var oldStyleEl = document.getElementById('__uvd_styles__');
    if (oldStyleEl) oldStyleEl.remove();

    var style = document.createElement('style');
    style.id = '__uvd_styles__';
    style.textContent = getGlobalCSS(t);
    document.head.appendChild(style);

    var panel = document.createElement('div');
    panel.id = '__uvd__';
    panel.className = '__uvd_panel__';

    var videoCount = [...urls.values()].filter(function(u) { return u.category === 'video'; }).length;
    var photoCount = [...urls.values()].filter(function(u) { return u.category === 'photo'; }).length;
    var scriptCount = [...urls.values()].filter(function(u) { return u.category === 'script'; }).length;

    panel.innerHTML =
    '<div class="__uvd_noise_overlay__"></div>' +
    '<div class="__uvd_mesh_bg__"></div>' +
    '<div class="__uvd_header__">' +
        '<div class="__uvd_header_left__">' +
            '<div class="__uvd_header_text__">' +
                '<div class="__uvd_title__"><span class="__uvd_accent_inline__"></span>Universal DL <span class="__uvd_version__">V3.7.1</span></div>' +
                '<div class="__uvd_subtitle__"><span class="__uvd_accent_inline_small__"></span><span class="__uvd_live_dot__"></span> ' + videoCount + ' video · ' + photoCount + ' ảnh · ' + scriptCount + ' script</div>' +
            '</div>' +
        '</div>' +
        '<div class="__uvd_header_right__">' +
            '<button class="__uvd_btn_icon__" id="__uvd_reload__" title="Quét lại">🔄</button>' +
            '<button class="__uvd_btn_icon__" id="__uvd_minimize__" title="Thu nhỏ">➖</button>' +
            '<button class="__uvd_btn_icon__" id="__uvd_close__" title="Đóng">✕</button>' +
        '</div>' +
    '</div>' +
    '<div class="__uvd_body__">' +
        '<div class="__uvd_search_bar__">' +
            '<input type="text" class="__uvd_search_input__" id="__uvd_search__" placeholder="Lọc URL, loại, nguồn..." />' +
            '<select class="__uvd_sort_select__" id="__uvd_sort__">' +
                '<option value="priority">Ưu tiên</option>' +
                '<option value="time">Mới nhất</option>' +
                '<option value="type">Loại file</option>' +
            '</select>' +
        '</div>' +
        '<div class="__uvd_tabs__">' +
            '<button class="__uvd_tab__ active" data-tab="video"><span class="__uvd_accent_inline_small__"></span>Video <span class="__uvd_badge__">' + videoCount + '</span></button>' +
            '<button class="__uvd_tab__" data-tab="photo"><span class="__uvd_accent_inline_small__"></span>Ảnh <span class="__uvd_badge__">' + photoCount + '</span></button>' +
            '<button class="__uvd_tab__" data-tab="script"><span class="__uvd_accent_inline_small__"></span>Script <span class="__uvd_badge__">' + scriptCount + '</span></button>' +
            '<button class="__uvd_tab__" data-tab="torrserver"><span class="__uvd_accent_inline_small__"></span>TorrServer</button>' +
            '<button class="__uvd_tab__" data-tab="favorites"><span class="__uvd_accent_inline_small__"></span>Yêu thích <span class="__uvd_badge__">' + data.favorites.length + '</span></button>' +
            '<button class="__uvd_tab__" data-tab="history"><span class="__uvd_accent_inline_small__"></span>Lịch sử <span class="__uvd_badge__">' + (data.history || []).length + '</span></button>' +
            '<button class="__uvd_tab__" data-tab="settings"><span class="__uvd_accent_inline_small__"></span>Cài đặt</button>' +
        '</div>' +
        '<div class="__uvd_info_bar__">' +
            '<div class="__uvd_info_row__">' +
                '<span class="__uvd_info_label__"><span class="__uvd_accent_inline_small__"></span>Tiêu đề:</span>' +
                '<span class="__uvd_info_value__ __uvd_clickable__" id="__uvd_edit_title__">' + escapeHtml(pageInfo.title) + '</span>' +
            '</div>' +
            '<div class="__uvd_info_row__">' +
                '<span class="__uvd_info_label__"><span class="__uvd_accent_inline_small__"></span>Referer:</span>' +
                '<span class="__uvd_info_value__ __uvd_clickable__ __uvd_mono__" id="__uvd_edit_referer__">' + escapeHtml(pageInfo.referer) + '</span>' +
            '</div>' +
        '</div>' +
        '<div class="__uvd_content__" id="__uvd_content__"></div>' +
        '<div class="__uvd_footer__">' +
            '<button class="__uvd_footer_btn__" id="__uvd_batch_copy__">📋 Tất cả URL</button>' +
            '<button class="__uvd_footer_btn__" id="__uvd_export_json__">JSON</button>' +
            '<button class="__uvd_footer_btn__" id="__uvd_export_txt__">TXT</button>' +
            '<button class="__uvd_footer_btn__" id="__uvd_export_m3u__">M3U</button>' +
        '</div>' +
    '</div>';

    document.body.appendChild(panel);
    bindGlobalEvents();
    renderTab(currentTab);
}

/* ========== GÁN SỰ KIỆN TOÀN CỤC ========== */
function bindGlobalEvents() {
    /* Tabs */
    document.querySelector('.__uvd_tabs__').addEventListener('click', function(e) {
        var tab = e.target.closest('.__uvd_tab__');
        if (!tab) return;
        currentTab = tab.dataset.tab;
        document.querySelectorAll('.__uvd_tab__').forEach(function(t) { t.classList.remove('active'); });
        tab.classList.add('active');
        renderTab(currentTab);
    });

    /* Tìm kiếm */
    var debouncedSearch = debounce(function(value) {
        currentFilter = value.toLowerCase();
        renderTab(currentTab);
    }, 250);
    document.getElementById('__uvd_search__').addEventListener('input', function(e) {
        debouncedSearch(e.target.value);
    });

    /* Sắp xếp */
    document.getElementById('__uvd_sort__').addEventListener('change', function(e) {
        currentSort = e.target.value;
        renderTab(currentTab);
    });

    /* Nút quét lại */
    document.getElementById('__uvd_reload__').addEventListener('click', function() {
        var btn = this;
        btn.classList.add('spinning');
        setTimeout(function() {
            rescanPage();
            btn.classList.remove('spinning');
        }, 500);
    });

    /* Nút đóng */
    document.getElementById('__uvd_close__').addEventListener('click', function() {
        stopMonitor();
        var p = document.getElementById('__uvd__');
        if (p) p.remove();
        var s = document.getElementById('__uvd_styles__');
        if (s) s.remove();
    });

    /* Nút thu nhỏ */
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

    /* Sửa tiêu đề */
    document.getElementById('__uvd_edit_title__').addEventListener('click', function() {
        var newTitle = prompt('Tên file tải về:', pageInfo.title);
        if (newTitle && newTitle.trim()) {
            pageInfo.title = newTitle.trim().replace(/[^\w\s\u00C0-\u1EF9.\-]/g, '').substring(0, 100) || 'video';
            this.innerText = pageInfo.title;
            toast('Đã cập nhật tên file', 'success');
        }
    });

    /* Sửa Referer */
    document.getElementById('__uvd_edit_referer__').addEventListener('click', function() {
        var newRef = prompt('Địa chỉ Referer:', pageInfo.referer);
        if (newRef && newRef.trim()) {
            pageInfo.referer = newRef.trim();
            this.innerText = pageInfo.referer;
            data.siteProfiles[pageInfo.host] = {
                referer: pageInfo.referer,
                origin: pageInfo.origin,
                userAgent: pageInfo.userAgent
            };
            storage.set(data);
            toast('Đã lưu Referer cho ' + pageInfo.host, 'success');
        }
    });

    /* Footer actions */
    document.getElementById('__uvd_batch_copy__').addEventListener('click', function() {
        var allUrls = [...urls.keys()].join('\n');
        copy(allUrls);
        toast('Đã copy ' + urls.size + ' URL', 'success');
    });
    document.getElementById('__uvd_export_txt__').addEventListener('click', function() { exportData('txt'); });
    document.getElementById('__uvd_export_json__').addEventListener('click', function() { exportData('json'); });
    document.getElementById('__uvd_export_m3u__').addEventListener('click', function() { exportData('m3u'); });
}

/* ========== RENDER TABS ========== */
function renderTab(tabId) {
    var content = document.getElementById('__uvd_content__');
    if (!content) return;
    content.innerHTML = '';
    switch(tabId) {
        case 'video': renderCategory(content, 'video'); break;
        case 'photo': renderCategory(content, 'photo'); break;
        case 'script': renderCategory(content, 'script'); break;
        case 'torrserver': renderTorrServer(content); break;
        case 'favorites': renderFavorites(content); break;
        case 'history': renderHistory(content); break;
        case 'settings': renderSettings(content); break;
    }
}

/* ========== LỌC + SẮP XẾP ITEMS ========== */
function getSortedFilteredItems(category) {
    var items = [...urls.entries()]
        .filter(function(e) { return e[1].category === category; })
        .map(function(e) {
            return {
                url: e[0], type: e[1].type, source: e[1].source,
                priority: e[1].priority, timestamp: e[1].timestamp
            };
        });
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

/* ========== RENDER DANH SÁCH STREAM/ẢNH ========== */
function renderCategory(container, category) {
    var t = getTheme();
    var items = getSortedFilteredItems(category);

    if (!items.length) {
        var icons = { video: '🎬', photo: '🖼️', script: '📄' };
        var names = { video: 'luồng video', photo: 'file ảnh', script: 'script/iframe' };
        container.innerHTML =
        '<div class="__uvd_empty__">' +
            '<div class="__uvd_empty_icon__">' + icons[category] + '</div>' +
            '<div class="__uvd_empty_text__">Chưa tìm thấy ' + names[category] + ' nào</div>' +
            '<div class="__uvd_empty_sub__">Công cụ đang giám sát tự động...<br>Hãy bấm phát video hoặc tải trang để quét lại</div>' +
        '</div>';
        return;
    }

    var typeColors = {
        'M3U8': '#4CAF50', 'MPD': '#8BC34A', 'MP4': '#FF9800', 'WEBM': '#FF9800',
        'MKV': '#FF5722', 'FLV': '#FF5722', 'TS': '#FFC107', 'IFRAME': '#2196F3',
        'JPG': '#E91E63', 'PNG': '#9C27B0', 'GIF': '#FF5722', 'WEBP': '#00BCD4',
        'SVG': '#4CAF50', 'BMP': '#795548'
    };

    var frag = document.createDocumentFragment();
    items.forEach(function(item, i) {
        var url = item.url;
        var type = item.type;
        var color = typeColors[type] || '#666';
        var fav = isFavorite(url);
        var card = document.createElement('div');
        card.className = '__uvd_card__';

        var header =
        '<div class="__uvd_card_header__">' +
            '<span class="__uvd_type_badge__" style="background:' + color + ';">' + type + ' #' + (i+1) + '</span>' +
            '<div class="__uvd_card_meta__">' +
                '<span class="__uvd_source__">' + escapeHtml(item.source) + '</span>' +
                '<button class="__uvd_fav_btn__" data-url="' + encodeURIComponent(url) + '" data-type="' + type + '" title="Yêu thích">' + (fav ? '⭐' : '☆') + '</button>' +
            '</div>' +
        '</div>';

        var photoHtml = '';
        if (category === 'photo') {
            photoHtml =
            '<div class="__uvd_photo_thumb_wrap__" data-fullscreen="' + encodeURIComponent(url) + '">' +
                '<img src="' + url + '" loading="lazy" onerror="this.style.display=\'none\'" alt="thumbnail" />' +
            '</div>';
        }

        var urlHtml = '<div class="__uvd_url_box__">' + escapeHtml(url) + '</div>';

        var actions = '';
        if (category === 'photo') {
            actions =
            '<div class="__uvd_actions__">' +
                '<button class="__uvd_act_btn__ __uvd_btn_open__" data-url="' + encodeURIComponent(url) + '" data-action="open_photo"><span class="__uvd_btn_accent__"></span>Mở</button>' +
                '<button class="__uvd_act_btn__ __uvd_btn_copy__" data-url="' + encodeURIComponent(url) + '" data-action="copy"><span class="__uvd_btn_accent__"></span>Copy</button>' +
                '<button class="__uvd_act_btn__ __uvd_btn_download__" data-url="' + encodeURIComponent(url) + '" data-action="download_photo" data-type="' + type + '"><span class="__uvd_btn_accent__"></span>Tải</button>' +
                '<button class="__uvd_act_btn__ __uvd_btn_share__" data-url="' + encodeURIComponent(url) + '" data-action="share"><span class="__uvd_btn_accent__"></span>Chia sẻ</button>' +
            '</div>';
        } else if (type === 'IFRAME') {
            actions =
            '<div class="__uvd_actions__">' +
                '<a href="' + url + '" target="_blank" rel="noopener" class="__uvd_act_btn__ __uvd_btn_iframe__ full" style="text-decoration:none;text-align:center;"><span class="__uvd_btn_accent__"></span>Mở tab mới</a>' +
                '<button class="__uvd_act_btn__ __uvd_btn_copy__" data-url="' + encodeURIComponent(url) + '" data-action="copy"><span class="__uvd_btn_accent__"></span>Copy URL</button>' +
                '<button class="__uvd_act_btn__ __uvd_btn_share__" data-url="' + encodeURIComponent(url) + '" data-action="share"><span class="__uvd_btn_accent__"></span>Chia sẻ</button>' +
            '</div>';
        } else {
            var extra = '';
            if (['M3U8', 'MP4', 'WEBM', 'MKV'].includes(type)) {
                extra += '<button class="__uvd_act_btn__ __uvd_btn_preview__" data-url="' + encodeURIComponent(url) + '" data-action="preview" data-type="' + type + '"><span class="__uvd_btn_accent__"></span>Xem thử</button>';
            }
            if (type === 'M3U8') {
                extra += '<button class="__uvd_act_btn__ __uvd_btn_quality__" data-url="' + encodeURIComponent(url) + '" data-action="quality"><span class="__uvd_btn_accent__"></span>Chất lượng</button>';
            }
            actions =
            '<div class="__uvd_actions__">' +
                '<button class="__uvd_act_btn__ __uvd_btn_share__" data-url="' + encodeURIComponent(url) + '" data-action="share"><span class="__uvd_btn_accent__"></span>Gửi YTDL</button>' +
                '<button class="__uvd_act_btn__ __uvd_btn_copy__" data-url="' + encodeURIComponent(url) + '" data-action="copy"><span class="__uvd_btn_accent__"></span>Copy</button>' +
                extra +
                '<button class="__uvd_act_btn__ __uvd_btn_cmd__ full" data-url="' + encodeURIComponent(url) + '" data-action="cmd" data-type="' + type + '"><span class="__uvd_btn_accent__"></span>Tất cả lệnh tải</button>' +
            '</div>';
        }

        card.innerHTML = header + photoHtml + urlHtml + actions;
        frag.appendChild(card);
    });
    container.appendChild(frag);

    /* Sự kiện click card */
    container.addEventListener('click', function(e) {
        /* Xem ảnh fullscreen */
        var photoWrap = e.target.closest('.__uvd_photo_thumb_wrap__');
        if (photoWrap && !e.target.closest('.__uvd_act_btn__') && !e.target.closest('.__uvd_fav_btn__')) {
            showPhotoFullscreen(decodeURIComponent(photoWrap.dataset.fullscreen));
            return;
        }
        /* Yêu thích */
        var favBtn = e.target.closest('.__uvd_fav_btn__');
        if (favBtn) {
            e.stopPropagation();
            var urlFav = decodeURIComponent(favBtn.dataset.url);
            var isFav = toggleFavorite(urlFav, favBtn.dataset.type);
            favBtn.innerText = isFav ? '⭐' : '☆';
            buildUI();
            return;
        }
        /* Nút hành động */
        var actBtn = e.target.closest('.__uvd_act_btn__');
        if (actBtn) {
            e.preventDefault();
            var actUrl = decodeURIComponent(actBtn.dataset.url);
            var action = actBtn.dataset.action;
            var actType = actBtn.dataset.type;
            addToHistory(actUrl, actType || 'URL');
            switch(action) {
                case 'share': shareUrl(actUrl); break;
                case 'copy': copy(actUrl); toast('Đã copy URL', 'success'); break;
                case 'preview': showPreview(actUrl, actType); break;
                case 'cmd': showCommandPicker(actUrl, actType); break;
                case 'quality': showQualityPicker(actUrl); break;
                case 'download_photo': downloadPhoto(actUrl, actType); break;
                case 'open_photo': window.open(actUrl, '_blank', 'noopener'); break;
            }
        }
    });
}

/* ========== XEM ẢNH FULLSCREEN ========== */
function showPhotoFullscreen(url) {
    var overlay = document.createElement('div');
    overlay.className = '__uvd_photo_fullscreen__';
    overlay.innerHTML =
        '<img src="' + url + '" alt="full" />' +
        '<button class="__uvd_photo_fullscreen_close__" title="Đóng">✕</button>';
    document.body.appendChild(overlay);
    overlay.querySelector('button').addEventListener('click', function() { overlay.remove(); });
    overlay.addEventListener('click', function(e) { if (e.target === overlay) overlay.remove(); });
}

/* ========== TẢI ẢNH ========== */
function downloadPhoto(url, type) {
    var a = document.createElement('a');
    a.href = url;
    a.download = pageInfo.title + '.' + (type || 'jpg').toLowerCase();
    a.target = '_blank';
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    setTimeout(function() { a.remove(); }, 100);
    toast('Đang tải ảnh xuống...', 'info');
}

/* ========== CHỌN CHẤT LƯỢNG M3U8 ========== */
function showQualityPicker(url) {
    var t = getTheme();
    var overlay = document.createElement('div');
    overlay.className = '__uvd_overlay__';
    overlay.innerHTML =
    '<div class="__uvd_overlay_box__">' +
        '<div class="__uvd_overlay_title__"><span class="__uvd_accent_inline__"></span>Đang phân tích M3U8...</div>' +
        '<div style="text-align:center;padding:40px;color:' + t.text2 + ';font-weight:600;">⏳ Vui lòng chờ...</div>' +
    '</div>';
    document.body.appendChild(overlay);
    overlay.addEventListener('click', function(e) { if (e.target === overlay) overlay.remove(); });

    parseM3U8Master(url, function(qualities) {
        if (!qualities) {
            overlay.querySelector('.__uvd_overlay_box__').innerHTML =
            '<div class="__uvd_overlay_title__"><span class="__uvd_accent_inline__"></span>Stream đơn</div>' +
            '<div style="color:' + t.text2 + ';margin-bottom:16px;line-height:1.5;">Đây là luồng trực tiếp, không có nhiều chất lượng để chọn.</div>' +
            '<div class="btn-row">' +
                '<button class="__uvd_btn_primary__" id="uvd_qp_play">▶️ Xem ngay</button>' +
                '<button class="__uvd_btn_ghost__" id="uvd_qp_close">Đóng</button>' +
            '</div>';
            document.getElementById('uvd_qp_play').onclick = function() { overlay.remove(); showPreview(url, 'M3U8'); };
            document.getElementById('uvd_qp_close').onclick = function() { overlay.remove(); };
            return;
        }

        var html = '<div class="__uvd_overlay_title__"><span class="__uvd_accent_inline__"></span>Chọn chất lượng (' + qualities.length + ')</div>';
        qualities.forEach(function(q) {
            var sizeMB = q.bandwidth ? (q.bandwidth / 1024 / 1024 * 60).toFixed(1) : '?';
            html +=
            '<div class="__uvd_quality_card__">' +
                '<div class="__uvd_quality_header__">' +
                    '<span class="__uvd_quality_label__"><span class="__uvd_accent_inline_small__"></span>' + q.label + '</span>' +
                    '<span style="color:' + t.text2 + ';font-size:11px;font-weight:600;">📶 ' + Math.round(q.bandwidth/1000) + ' kbps</span>' +
                '</div>' +
                '<div class="__uvd_quality_info__">📐 ' + q.resolution +
                    (q.codecs ? ' · 🎞️ ' + q.codecs : '') +
                    (q.framerate ? ' · ⏱️ ' + q.framerate + 'fps' : '') +
                    ' · 💾 ~' + sizeMB + 'MB/phút</div>' +
                '<div class="__uvd_url_box__">' + escapeHtml(q.url) + '</div>' +
                '<div class="__uvd_actions__">' +
                    '<button class="__uvd_act_btn__ __uvd_btn_preview__" data-url="' + encodeURIComponent(q.url) + '" data-action="preview"><span class="__uvd_btn_accent__"></span>Xem</button>' +
                    '<button class="__uvd_act_btn__ __uvd_btn_copy__" data-url="' + encodeURIComponent(q.url) + '" data-action="copy"><span class="__uvd_btn_accent__"></span>Copy</button>' +
                    '<button class="__uvd_act_btn__ __uvd_btn_share__" data-url="' + encodeURIComponent(q.url) + '" data-action="share"><span class="__uvd_btn_accent__"></span>Gửi YTDL</button>' +
                    '<button class="__uvd_act_btn__ __uvd_btn_cmd__" data-url="' + encodeURIComponent(q.url) + '" data-action="cmd"><span class="__uvd_btn_accent__"></span>Lệnh</button>' +
                '</div>' +
            '</div>';
        });
        html += '<div class="btn-row"><button class="__uvd_btn_danger__" id="uvd_qp_close">✕ Đóng</button></div>';
        overlay.querySelector('.__uvd_overlay_box__').innerHTML = html;

        overlay.addEventListener('click', function(e) {
            var btn = e.target.closest('.__uvd_act_btn__');
            if (btn) {
                var qUrl = decodeURIComponent(btn.dataset.url);
                var act = btn.dataset.action;
                if (act === 'preview') { overlay.remove(); showPreview(qUrl, 'M3U8'); }
                else if (act === 'copy') { copy(qUrl); toast('Đã copy URL', 'success'); }
                else if (act === 'share') { shareUrl(qUrl); }
                else if (act === 'cmd') { overlay.remove(); showCommandPicker(qUrl, 'M3U8'); }
            }
        });
        document.getElementById('uvd_qp_close').onclick = function() { overlay.remove(); };
    });
}

/* ========== PREVIEW PLAYER ========== */
function showPreview(url, type) {
    var t = getTheme();
    var overlay = document.createElement('div');
    overlay.className = '__uvd_preview_overlay__';
    overlay.innerHTML =
    '<div class="__uvd_preview_header__" id="pv_header">' +
        '<div class="__uvd_preview_title__" id="pv_title">' + escapeHtml(pageInfo.title) + '</div>' +
        '<button class="__uvd_preview_close__" id="pv_close" title="Đóng">✕</button>' +
    '</div>' +
    '<div class="__uvd_preview_video_wrap__" id="pv_wrap">' +
        '<video id="pv_video" class="__uvd_preview_video__" controls playsinline webkit-playsinline preload="auto"></video>' +
        '<div class="__uvd_preview_status__" id="pv_status"></div>' +
    '</div>' +
    '<div class="__uvd_preview_quality_bar__" id="pv_quality_bar">' +
        '<div class="__uvd_preview_quality_label__">Chất lượng:</div>' +
        '<div class="__uvd_preview_quality_list__" id="pv_quality_list"></div>' +
    '</div>' +
    '<div class="__uvd_preview_controls__" id="pv_controls">' +
        '<button class="__uvd_preview_btn__" id="pv_copy"><span class="__uvd_btn_accent__"></span>Copy</button>' +
        '<button class="__uvd_preview_btn__" id="pv_share"><span class="__uvd_btn_accent__"></span>Chia sẻ</button>' +
        '<button class="__uvd_preview_btn__" id="pv_cmd"><span class="__uvd_btn_accent__"></span>Lệnh tải</button>' +
        '<button class="__uvd_preview_btn__" id="pv_quality"><span class="__uvd_btn_accent__"></span>Chất lượng</button>' +
        '<button class="__uvd_preview_btn__" id="pv_fullscreen"><span class="__uvd_btn_accent__"></span>Toàn màn hình</button>' +
    '</div>';
    document.body.appendChild(overlay);

    var video = document.getElementById('pv_video');
    var statusEl = document.getElementById('pv_status');
    var headerEl = document.getElementById('pv_header');
    var controlsEl = document.getElementById('pv_controls');
    var qualityBar = document.getElementById('pv_quality_bar');
    var qualityList = document.getElementById('pv_quality_list');
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
            statusTimer = setTimeout(function() { statusEl.classList.remove('visible'); }, duration);
        }
    }
    function hideStatus() { clearTimeout(statusTimer); statusEl.classList.remove('visible'); }

    function showUI() {
        uiVisible = true;
        headerEl.classList.remove('hidden');
        controlsEl.classList.remove('hidden');
        clearTimeout(uiTimer);
        uiTimer = setTimeout(function() {
            if (!video.paused) {
                headerEl.classList.add('hidden');
                controlsEl.classList.add('hidden');
                qualityBar.classList.remove('visible');
                uiVisible = false;
            }
        }, 3500);
    }
    function toggleUI() {
        if (uiVisible) {
            headerEl.classList.add('hidden');
            controlsEl.classList.add('hidden');
            qualityBar.classList.remove('visible');
            uiVisible = false;
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
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    }

    /* Sự kiện player */
    document.getElementById('pv_close').addEventListener('click', function(e) { e.stopPropagation(); cleanup(); });
    video.addEventListener('click', function(e) { e.stopPropagation(); toggleUI(); });
    overlay.addEventListener('click', function() { toggleUI(); });
    document.getElementById('pv_copy').addEventListener('click', function(e) { e.stopPropagation(); copy(url); toast('Đã copy URL', 'success'); });
    document.getElementById('pv_share').addEventListener('click', function(e) { e.stopPropagation(); shareUrl(url); });
    document.getElementById('pv_cmd').addEventListener('click', function(e) {
        e.stopPropagation();
        overlay.style.display = 'none';
        try { video.pause(); } catch(e) {}
        showCommandPicker(url, type || 'M3U8', function() {
            overlay.style.display = 'flex';
            video.play().catch(function(){});
            showUI();
        });
    });
    document.getElementById('pv_quality').addEventListener('click', function(e) {
        e.stopPropagation();
        qualityBar.classList.toggle('visible');
        showUI();
    });
    document.getElementById('pv_fullscreen').addEventListener('click', function(e) {
        e.stopPropagation();
        enterFullscreen(document.getElementById('pv_wrap'));
    });

    video.addEventListener('playing', function() { showStatus('▶️ Đang phát', 1500); showUI(); });
    video.addEventListener('canplay', function() { hideStatus(); });
    video.addEventListener('waiting', function() { showStatus('⏳ Đang tải...', 0, 'buffering'); });
    video.addEventListener('pause', function() { showUI(); });
    video.addEventListener('error', function() { showStatus('❌ Lỗi phát video', 3000, 'error'); });
    video.addEventListener('ended', function() { showStatus('✅ Đã phát xong', 2000); showUI(); });

    /* Load HLS */
    function loadHls() {
        if (window.Hls) { initHls(); return; }
        showStatus('📦 Đang tải trình phát HLS...', 0, 'buffering');
        var s = document.createElement('script');
        s.src = 'https://cdn.jsdelivr.net/npm/hls.js@1.5.13/dist/hls.min.js';
        s.onload = initHls;
        s.onerror = function() {
            showStatus('❌ Không load được HLS', 3000, 'error');
            video.src = url;
        };
        document.head.appendChild(s);
    }
    function initHls() {
        if (!window.Hls) { video.src = url; return; }
        if (Hls.isSupported()) {
            currentHls = new Hls({
                maxLoadingDelay: 4, maxBufferLength: 30,
                enableWorker: true, lowLatencyMode: false,
                backBufferLength: 60
            });
            currentHls.attachMedia(video);
            currentHls.loadSource(url);
            currentHls.on(Hls.Events.MANIFEST_PARSED, function(ev, data) {
                showStatus('✅ HLS sẵn sàng · ' + data.levels.length + ' chất lượng', 1800);
                var qHtml = '<button class="__uvd_preview_btn__ active" data-level="-1">🔄 Tự động</button>';
                data.levels.forEach(function(lv, idx) {
                    var lb = lv.height ? lv.height + 'p' : Math.round(lv.bitrate/1000) + 'k';
                    qHtml += '<button class="__uvd_preview_btn__" data-level="' + idx + '">' + lb + '</button>';
                });
                qualityList.innerHTML = qHtml;
                qualityList.addEventListener('click', function(e) {
                    var b = e.target.closest('.__uvd_preview_btn__');
                    if (b && currentHls) {
                        qualityList.querySelectorAll('.__uvd_preview_btn__').forEach(function(x) { x.classList.remove('active'); });
                        b.classList.add('active');
                        currentHls.currentLevel = parseInt(b.dataset.level);
                        showStatus('🎞️ Chất lượng: ' + b.innerText, 1200);
                    }
                });
                video.play().catch(function(){});
            });
            currentHls.on(Hls.Events.ERROR, functionStatus('❌ Lỗi: ' + data.details, 3000, 'error');
                    switch(data.type) {
                        case Hls.ErrorTypes.NETWORK_ERROR: currentHls.startLoad(); break;
                        case Hls.ErrorTypes.MEDIA_ERROR: currentHls.recoverMediaError(); break;
                        default: try { currentHls.destroy(); } catch(e) {} currentHls = null; video.src = url; break;
                    }
                }
            });
        } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
            video.src = url;
            showStatus('✅ Native HLS (iOS)', 1500);
            video.play().catch(function(){});
        } else {
            video.src = url;
        }
    }

    /* Khởi tạo phát */
    var isM3U8 = (type === 'M3U8') || url.includes('.m3u8') || url.includes('m3u8');
    if (isM3U8) { loadHls(); }
    else {
        video.src = url;
        showStatus('⏳ Đang tải video...', 0, 'buffering');
        video.play().catch(function(){});
    }
    showUI();

    /* Phím ESC đóng */
    var escHandler = function(e) {
        if (e.key === 'Escape') {
            cleanup();
            document.removeEventListener('keydown', escHandler);
        }
    };
    document.addEventListener('keydown', escHandler);
}

/* ========== FULLSCREEN + ROTATION ========== */
function enterFullscreen(element) {
    function doLock() {
        if (screen.orientation && screen.orientation.lock) {
            screen.orientation.lock('landscape').catch(function(){});
        }
    }
    function onFsChange() {
        if (document.fullscreenElement || document.webkitFullscreenElement) doLock();
        else if (screen.orientation && screen.orientation.unlock) screen.orientation.unlock();
    }
    document.addEventListener('fullscreenchange', onFsChange);
    document.addEventListener('webkitfullscreenchange', onFsChange);

    var req = element.requestFullscreen || element.webkitRequestFullscreen ||
              element.mozRequestFullScreen || element.msRequestFullscreen;
    if (!req) {
        var v = element.querySelector('video');
        if (v && v.webkitEnterFullscreen) v.webkitEnterFullscreen();
        return;
    }
    var res = req.call(element);
    if (res && res.then) res.then(doLock).catch(function(){});
}

/* ========== COMMAND PICKER ========== */
function showCommandPicker(url, type, onClose) {
    var t = getTheme();
    var cmds = makeCommands(url, type, pageInfo.title);
    var overlay = document.createElement('div');
    overlay.className = '__uvd_overlay__';
    var html = '<div class="__uvd_overlay_box__"><div class="__uvd_overlay_title__"><span class="__uvd_accent_inline__"></span>Chọn lệnh tải về</div>';
    Object.keys(cmds).forEach(function(key) {
        var c = cmds[key];
        html +=
        '<div class="__uvd_cmd_card__">' +
            '<div class="__uvd_cmd_label__"><span class="__uvd_accent_inline_small__"></span>' + c.label + '</div>' +
            '<div class="__uvd_cmd_code__">' + escapeHtml(c.cmd) + '</div>' +
            '<button class="__uvd_btn_primary__ __uvd_cmd_pick__" data-cmd="' + encodeURIComponent(c.cmd) + '" data-label="' + encodeURIComponent(c.label) + '" style="width:100%;">✏️ Chọn & sửa lệnh</button>' +
        '</div>';
    });
    html += '<div class="btn-row"><button class="__uvd_btn_danger__" id="uvd_cp_close">✕ Đóng</button></div></div>';
    overlay.innerHTML = html;
    document.body.appendChild(overlay);

    function closeAll() { overlay.remove(); if (onClose) onClose(); }
    overlay.addEventListener('click', function(e) { if (e.target === overlay) closeAll(); });
    overlay.addEventListener('click', function(e) {
        var pick = e.target.closest('.__uvd_cmd_pick__');
        if (pick) {
            var cmd = decodeURIComponent(pick.dataset.cmd);
            var label = decodeURIComponent(pick.dataset.label);
            overlay.remove();
            showEditor(cmd, label, onClose);
        }
    });
    document.getElementById('uvd_cp_close').addEventListener('click', closeAll);
}

/* ========== EDITOR LỆNH ========== */
function showEditor(text, title, onClose) {
    var t = getTheme();
    var overlay = document.createElement('div');
    overlay.className = '__uvd_overlay__';
    overlay.innerHTML =
    '<div class="__uvd_overlay_box__">' +
        '<div class="__uvd_overlay_title__"><span class="__uvd_accent_inline__"></span>' + escapeHtml(title) + '</div>' +
        '<div style="color:' + t.text3 + ';font-size:11px;margin-bottom:10px;">💡 Bạn có thể chỉnh sửa lệnh trước khi copy</div>' +
        '<textarea class="__uvd_textarea__" id="uvd_edit">' + escapeHtml(text) + '</textarea>' +
        '<div class="btn-row">' +
            '<button class="__uvd_btn_primary__" id="uvd_ed_ok">📋 Copy lệnh</button>' +
            '<button class="__uvd_btn_primary__" id="uvd_ed_share" style="background:linear-gradient(135deg,#FF5252,#FF1744);">🔗 Chia sẻ</button>' +
            '<button class="__uvd_btn_ghost__" id="uvd_ed_no">✕ Hủy</button>' +
        '</div>' +
    '</div>';
    document.body.appendChild(overlay);
    var ta = document.getElementById('uvd_edit');
    setTimeout(function() { ta.focus(); ta.select(); }, 100);

    function closeAll() { overlay.remove(); if (onClose) onClose(); }
    overlay.addEventListener('click', function(e) { if (e.target === overlay) closeAll(); });
    document.getElementById('uvd_ed_ok').addEventListener('click', function() {
        copy(ta.value);
        overlay.remove();
        toast('✅ Đã copy lệnh!', 'success');
        if (onClose) onClose();
    });
    document.getElementById('uvd_ed_share').addEventListener('click', function() {
        shareUrl(ta.value);
        overlay.remove();
        if (onClose) onClose();
    });
    document.getElementById('uvd_ed_no').addEventListener('click', closeAll);
}

/* ========== TORRSERVER ========== */
function tsBase() { return (data.torrserverUrl || 'http://127.0.0.1:8090').replace(/\/+$/, ''); }
function tsAddMagnet(magnet, cb) {
    fetch(tsBase() + '/torrents/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ link: magnet, save_to_db: true })
    })
    .then(function(r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json().catch(function(){ return {}; }); })
    .then(function(j) { cb(null, j); })
    .catch(function(e) { cb(e); });
}
function tsListTorrents(cb) {
    fetch(tsBase() + '/torrents', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'list' })
    })
    .then(function(r) { return r.json(); })
    .then(function(l) { cb(null, l || []); })
    .catch(function() {
        fetch(tsBase() + '/torrents').then(function(r){return r.json();}).then(function(l){cb(null,l||[]);}).catch(cb);
    });
}
function tsGetStat(hash, cb) {
    fetch(tsBase() + '/torrents', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'get', hash: hash })
    })
    .then(function(r){return r.json();})
    .then(function(j){cb(null,j);})
    .catch(cb);
}
function tsRemove(hash, cb) {
    fetch(tsBase() + '/torrents', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'rem', hash: hash })
    })
    .then(function(){cb(null);})
    .catch(cb);
}
function tsStreamUrl(hash, idx, name) {
    var n = encodeURIComponent(name || 'stream.mp4');
    return tsBase() + '/stream/' + n + '?link=' + hash + '&index=' + idx + '&play';
}
var VIDEO_EXT_RE = /\.(mp4|mkv|avi|webm|mov|m4v|ts|flv|wmv)$/i;

function renderTorrServer(container) {
    var t = getTheme();
    container.innerHTML =
    '<div class="__uvd_ts_input_row__">' +
        '<input type="text" class="__uvd_ts_input__" id="uvd_ts_magnet" placeholder="🧲 Dán magnet link hoặc URL .torrent..." />' +
    '</div>' +
    '<div class="btn-row" style="margin-top:0;margin-bottom:14px;">' +
        '<button class="__uvd_btn_primary__" id="uvd_ts_add">➕ Thêm vào TorrServer</button>' +
        '<button class="__uvd_btn_ghost__" id="uvd_ts_refresh">🔄 Làm mới</button>' +
    '</div>' +
    '<div style="color:' + t.text3 + ';font-size:11px;margin-bottom:14px;line-height:1.5;">🌐 Server: <span class="__uvd_clickable__" id="uvd_ts_edit_host">' + escapeHtml(tsBase()) + '</span><br><small>⚠️ Cần TorrServer đang chạy và cho phép CORS</small></div>' +
    '<div id="uvd_ts_list"></div>';

    document.getElementById('uvd_ts_edit_host').addEventListener('click', function() {
        var v = prompt('Địa chỉ TorrServer:', tsBase());
        if (v) {
            data.torrserverUrl = v.trim();
            storage.set(data);
            renderTorrServer(container);
            toast('✅ Đã lưu địa chỉ', 'success');
        }
    });
    document.getElementById('uvd_ts_add').addEventListener('click', function() {
        var input = document.getElementById('uvd_ts_magnet');
        var magnet = input.value.trim();
        if (!magnet) { toast('⚠️ Nhập magnet link trước', 'warning'); return; }
        if (!magnet.startsWith('magnet:') && !magnet.startsWith('http')) {
            toast('❌ Link không hợp lệ', 'error'); return;
        }
        var btn = this;
        btn.disabled = true;
        btn.innerText = '⏳ Đang thêm...';
        tsAddMagnet(magnet, function(err) {
            btn.disabled = false;
            btn.innerText = '➕ Thêm vào TorrServer';
            if (err) { toast('❌ Lỗi: ' + err.message, 'error'); return; }
            toast('✅ Đã thêm torrent', 'success');
            input.value = '';
            setTimeout(loadTsList, 800);
        });
    });
    document.getElementById('uvd_ts_refresh').addEventListener('click', loadTsList);

    function loadTsList() {
        var listEl = document.getElementById('uvd_ts_list');
        if (!listEl) return;
        listEl.innerHTML = '<div style="color:' + t.text3 + ';font-size:12px;text-align:center;padding:24px;font-weight:600;">⏳ Đang tải danh sách...</div>';
        tsListTorrents(function(err, list) {
            if (!document.getElementById('uvd_ts_list')) return;
            listEl = document.getElementById('uvd_ts_list');
            if (err) {
                listEl.innerHTML =
                '<div class="__uvd_empty__">' +
                    '<div class="__uvd_empty_icon__">❌</div>' +
                    '<div class="__uvd_empty_text__">Không kết nối được TorrServer</div>' +
                    '<div class="__uvd_empty_sub__">Kiểm tra TorrServer đang chạy<br>và địa chỉ cấu hình đúng</div>' +
                '</div>';
                return;
            }
            tsTorrentsCache = list || [];
            if (!tsTorrentsCache.length) {
                listEl.innerHTML =
                '<div class="__uvd_empty__">' +
                    '<div class="__uvd_empty_icon__">📭</div>' +
                    '<div class="__uvd_empty_text__">Chưa có torrent nào</div>' +
                    '<div class="__uvd_empty_sub__">Dán magnet link ở trên để bắt đầu</div>' +
                '</div>';
                return;
            }
            var frag = document.createDocumentFragment();
            tsTorrentsCache.forEach(function(tor) {
                var stat = tor.stat_string || (tor.torrent_status !== undefined ? 'Trạng thái ' + tor.torrent_status : '');
                var card = document.createElement('div');
                card.className = '__uvd_ts_torrent_card__';
                card.innerHTML =
                '<div class="__uvd_ts_torrent_name__">🧲 ' + escapeHtml(tor.title || tor.name || 'Không tên') + '</div>' +
                '<div class="__uvd_ts_torrent_meta__">' + escapeHtml(tor.hash || '') + (stat ? ' · ' + escapeHtml(stat) : '') + '</div>' +
                '<div class="btn-row" style="margin-top:10px;">' +
                    '<button class="__uvd_btn_primary__ uvd_ts_files" data-hash="' + escapeHtml(tor.hash) + '">📂 Xem file</button>' +
                    '<button class="__uvd_btn_danger__ uvd_ts_remove" data-hash="' + escapeHtml(tor.hash) + '" style="flex:0 0 auto;padding:12px 16px;">🗑️ Xóa</button>' +
                '</div>' +
                '<div class="uvd_ts_files_wrap" data-hash="' + escapeHtml(tor.hash) + '" style="margin-top:10px;"></div>';
                frag.appendChild(card);
            });
            listEl.innerHTML = '';
            listEl.appendChild(frag);

            listEl.addEventListener('click', function(e) {
                var fb = e.target.closest('.uvd_ts_files');
                if (fb) {
                    var hash = fb.dataset.hash;
                    var wrap = listEl.querySelector('.uvd_ts_files_wrap[data-hash="' + hash + '"]');
                    showTsFiles(hash, wrap);
                    return;
                }
                var rb = e.target.closest('.uvd_ts_remove');
                if (rb && confirm('🗑️ Xóa torrent này khỏi TorrServer?')) {
                    tsRemove(rb.dataset.hash, function(err2) {
                        if (err2) { toast('❌ Lỗi xóa', 'error'); return; }
                        toast('✅ Đã xóa', 'info');
                        loadTsList();
                    });
                }
            });
        });
    }

    function showTsFiles(hash, wrap) {
        if (!wrap) return;
        wrap.innerHTML = '<div style="color:' + t.text3 + ';font-size:11px;padding:8px;">⏳ Đang tải danh sách file...</div>';
        tsGetStat(hash, function(err, stat) {
            if (err || !stat) { wrap.innerHTML = '<div style="color:' + t.danger + ';font-size:11px;padding:8px;">❌ Lỗi tải file</div>'; return; }
            var files = stat.file_stats || stat.files || [];
            if (!files.length) { wrap.innerHTML = '<div style="color:' + t.text3 + ';font-size:11px;padding:8px;">⏳ Torrent đang khởi tạo, thử lại sau</div>'; return; }
            var html = '';
            files.forEach(function(f, idx) {
                var name = f.path || f.name || ('file_' + idx);
                var sizeMB = f.length ? (f.length / 1024 / 1024).toFixed(1) + ' MB' : '?';
                var short = name.split('/').pop();
                var isVideo = VIDEO_EXT_RE.test(short);
                html +=
                '<div class="__uvd_ts_file_card__">' +
                    '<div class="__uvd_ts_file_name__">' + (isVideo ? '🎬 ' : '📄 ') + escapeHtml(short) + '</div>' +
                    '<div class="__uvd_ts_file_meta__">💾 ' + sizeMB + '</div>';
                if (isVideo) {
                    html +=
                    '<div class="__uvd_actions__">' +
                        '<button class="__uvd_act_btn__ __uvd_btn_preview__ uvd_ts_play" data-hash="' + hash + '" data-index="' + idx + '" data-name="' + encodeURIComponent(short) + '"><span class="__uvd_btn_accent__"></span>▶️ Phát</button>' +
                        '<button class="__uvd_act_btn__ __uvd_btn_copy__ uvd_ts_copy" data-hash="' + hash + '" data-index="' + idx + '" data-name="' + encodeURIComponent(short) + '"><span class="__uvd_btn_accent__"></span>📋 Copy link</button>' +
                    '</div>';
                }
                html += '</div>';
            });
            wrap.innerHTML = html;
            wrap.addEventListener('click', function(e) {
                var pb = e.target.closest('.uvd_ts_play');
                if (pb) {
                    var sUrl = tsStreamUrl(pb.dataset.hash, pb.dataset.index, decodeURIComponent(pb.dataset.name));
                    showPreview(sUrl, 'MP4');
                    return;
                }
                var cb = e.target.closest('.uvd_ts_copy');
                if (cb) {
                    var cUrl = tsStreamUrl(cb.dataset.hash, cb.dataset.index, decodeURIComponent(cb.dataset.name));
                    copy(cUrl);
                    toast('✅ Đã copy link stream', 'success');
                }
            });
        });
    }

    loadTsList();
}

/* ========== FAVORITES ========== */
function renderFavorites(container) {
    var t = getTheme();
    if (!data.favorites.length) {
        container.innerHTML =
        '<div class="__uvd_empty__">' +
            '<div class="__uvd_empty_icon__">⭐</div>' +
            '<div class="__uvd_empty_text__">Chưa có mục yêu thích</div>' +
            '<div class="__uvd_empty_sub__">Nhấn ⭐ trên các stream để lưu lại</div>' +
        '</div>';
        return;
    }
    var frag = document.createDocumentFragment();
    data.favorites.forEach(function(fav, i) {
        var card = document.createElement('div');
        card.className = '__uvd_fav_card__';
        card.innerHTML =
        '<div class="__uvd_fav_header__">' +
            '<span class="__uvd_fav_title__"><span class="__uvd_accent_inline_small__"></span>⭐ ' + fav.type + '</span>' +
            '<span class="__uvd_fav_date__">📅 ' + new Date(fav.timestamp).toLocaleDateString('vi-VN') + '</span>' +
        '</div>' +
        '<div style="color:' + t.text + ';font-size:12px;font-weight:600;margin-bottom:4px;">' + escapeHtml(fav.title) + '</div>' +
        '<div style="color:' + t.text3 + ';font-size:10px;margin-bottom:6px;">🌐 ' + fav.host + '</div>' +
        '<div class="__uvd_url_box__">' + escapeHtml(fav.url) + '</div>' +
        '<div class="__uvd_actions__">' +
            '<button class="__uvd_act_btn__ __uvd_btn_share__" data-url="' + encodeURIComponent(fav.url) + '" data-action="share"><span class="__uvd_btn_accent__"></span>Gửi YTDL</button>' +
            '<button class="__uvd_act_btn__ __uvd_btn_copy__" data-url="' + encodeURIComponent(fav.url) + '" data-action="copy"><span class="__uvd_btn_accent__"></span>Copy</button>' +
            '<button class="__uvd_act_btn__ __uvd_btn_cmd__ full" data-idx="' + i + '" data-action="del"><span class="__uvd_btn_accent__"></span>🗑️ Xóa</button>' +
        '</div>';
        frag.appendChild(card);
    });
    container.appendChild(frag);
    container.addEventListener('click', function(e) {
        var btn = e.target.closest('.__uvd_act_btn__');
        if (!btn) return;
        var action = btn.dataset.action;
        if (action === 'del') {
            data.favorites.splice(parseInt(btn.dataset.idx), 1);
            storage.set(data);
            renderFavorites(container);
            toast('✅ Đã xóa', 'info');
            buildUI();
        } else {
            var u = decodeURIComponent(btn.dataset.url);
            addToHistory(u, 'Favorites');
            if (action === 'share') shareUrl(u);
            else { copy(u); toast('✅ Đã copy', 'success'); }
        }
    });
}

/* ========== HISTORY ========== */
function renderHistory(container) {
    var t = getTheme();
    var history = data.history || [];
    if (!history.length) {
        container.innerHTML =
        '<div class="__uvd_empty__">' +
            '<div class="__uvd_empty_icon__">📜</div>' +
            '<div class="__uvd_empty_text__">Chưa có lịch sử</div>' +
            '<div class="__uvd_empty_sub__">Các URL bạn thao tác sẽ hiện ở đây</div>' +
        '</div>';
        return;
    }
    var clearBtn = document.createElement('button');
    clearBtn.className = '__uvd_btn_danger__';
    clearBtn.innerText = '🗑️ Xóa toàn bộ lịch sử';
    clearBtn.style.cssText = 'width:100%;margin-bottom:14px;';
    clearBtn.addEventListener('click', function() {
        if (confirm('XÓA TOÀN BỘ LỊCH SỬ?')) {
            data.history = [];
            storage.set(data);
            renderHistory(container);
            toast('✅ Đã xóa lịch sử', 'info');
            buildUI();
        }
    });
    container.appendChild(clearBtn);

    var frag = document.createDocumentFragment();
    history.forEach(function(h) {
        var item = document.createElement('div');
        item.className = '__uvd_history_item__';
        item.style.cursor = 'pointer';
        item.innerHTML =
        '<div class="__uvd_history_title__"><span class="__uvd_accent_inline_small__"></span>' + escapeHtml(h.title) + '</div>' +
        '<div class="__uvd_history_meta__">🎞️ ' + h.type + ' · 🌐 ' + h.host + ' · 🕒 ' + new Date(h.timestamp).toLocaleString('vi-VN') + '</div>' +
        '<div class="__uvd_history_url__">' + escapeHtml(h.url) + '</div>';
        item.addEventListener('click', function() {
            copy(h.url);
            toast('✅ Đã copy URL', 'success');
        });
        frag.appendChild(item);
    });
    container.appendChild(frag);
}

/* ========== SETTINGS ========== */
function renderSettings(container) {
    var t = getTheme();
    var html = '';

    /* Theme */
    html += '<div class="__uvd_settings_section__"><div class="__uvd_settings_title__"><span class="__uvd_accent_inline__"></span>🎨 Giao diện</div><div class="__uvd_theme_grid__">';
    Object.keys(themes).forEach(function(key) {
        var active = data.theme === key;
        html += '<button class="__uvd_theme_btn__' + (active ? ' active' : '') + '" data-theme="' + key + '">' + themes[key].name + '</button>';
    });
    html += '</div></div>';

    /* TorrServer */
    html += '<div class="__uvd_settings_section__"><div class="__uvd_settings_title__"><span class="__uvd_accent_inline__"></span>🧲 TorrServer</div>' +
    '<div style="color:' + t.text2 + ';font-size:11px;margin-bottom:10px;line-height:1.5;">🌐 Địa chỉ hiện tại: <span class="__uvd_clickable__" id="uvd_ts_set_edit">' + escapeHtml(tsBase()) + '</span><br><small>Nhấn vào để thay đổi</small></div></div>';

    /* Site Profiles */
    var profiles = Object.keys(data.siteProfiles);
    html += '<div class="__uvd_settings_section__"><div class="__uvd_settings_title__"><span class="__uvd_accent_inline__"></span>🌐 Site Profiles (' + profiles.length + ')</div>';
    if (!profiles.length) html += '<div style="color:' + t.text3 + ';font-size:11px;">Chưa có profile nào. Nhấn vào Referer ở trang chủ để lưu.</div>';
    else {
        profiles.forEach(function(p) {
            html +=
            '<div class="__uvd_profile_card__">' +
                '<div class="__uvd_profile_host__"><span class="__uvd_accent_inline_small__"></span>' + p + '</div>' +
                '<div class="__uvd_profile_ref__">' + escapeHtml(data.siteProfiles[p].referer) + '</div>' +
                '<button class="__uvd_btn_danger__ uvd_del_profile" data-host="' + p + '" style="padding:5px 12px;font-size:11px;margin-top:8px;border-radius:8px;">🗑️ Xóa</button>' +
            '</div>';
        });
    }
    html += '</div>';

    /* Backup */
    html += '<div class="__uvd_settings_section__"><div class="__uvd_settings_title__"><span class="__uvd_accent_inline__"></span>💾 Sao lưu & Phục hồi</div>' +
    '<div style="display:flex;gap:10px;flex-wrap:wrap;">' +
        '<button class="__uvd_btn_primary__" id="uvd_backup" style="flex:1;">📤 Xuất file</button>' +
        '<button class="__uvd_btn_primary__" id="uvd_restore" style="flex:1;background:linear-gradient(135deg,' + t.accent + ',' + t.primary + ');">📥 Nhập file</button>' +
        '<button class="__uvd_btn_danger__" id="uvd_reset" style="flex:1;">🔄 Đặt lại</button>' +
    '</div></div>';

    /* Thông tin */
    html += '<div class="__uvd_settings_section__"><div class="__uvd_settings_title__"><span class="__uvd_accent_inline__"></span>ℹ️ Thông tin</div>' +
    '<div style="color:' + t.text2 + ';font-size:12px;line-height:1.8;">' +
        '<div><span class="__uvd_accent_inline_small__"></span>Phiên bản: <b>3.7.1</b> | Full Fix + Glass UI Pro</div>' +
        '<div><span class="__uvd_accent_inline_small__"></span>Tác giả: nguyenquocngu93</div>' +
        '<div><span class="__uvd_accent_inline_small__"></span>⭐ Yêu thích: <b>' + data.favorites.length + '</b></div>' +
        '<div><span class="__uvd_accent_inline_small__"></span>📜 Lịch sử: <b>' + (data.history || []).length + '</b></div>' +
        '<div><span class="__uvd_accent_inline_small__"></span>🌐 Profiles: <b>' + Object.keys(data.siteProfiles).length + '</b></div>' +
        '<div><span class="__uvd_accent_inline_small__"></span>🎬 Tổng stream: <b>' + urls.size + '</b></div>' +
    '</div></div>';

    container.innerHTML = html;

    /* Sự kiện */
    var tsEdit = document.getElementById('uvd_ts_set_edit');
    if (tsEdit) tsEdit.addEventListener('click', function() {
        var v = prompt('Địa chỉ TorrServer:', tsBase());
        if (v) {
            data.torrserverUrl = v.trim();
            storage.set(data);
            renderSettings(container);
            toast('✅ Đã lưu', 'success');
        }
    });

    container.addEventListener('click', function(e) {
        var tb = e.target.closest('.__uvd_theme_btn__');
        if (tb) {
            data.theme = tb.dataset.theme;
            storage.set(data);
            buildUI();
            toast('🎨 Theme: ' + themes[data.theme].name, 'success');
            return;
        }
        var dp = e.target.closest('.uvd_del_profile');
        if (dp) {
            delete data.siteProfiles[dp.dataset.host];
            storage.set(data);
            renderSettings(container);
            toast('✅ Đã xóa profile', 'info');
        }
    });

    document.getElementById('uvd_backup').addEventListener('click', function() {
        var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'uvd_backup_' + Date.now() + '.json';
        a.click();
        setTimeout(function() { URL.revokeObjectURL(a.href); }, 100);
        toast('✅ Đã xuất backup', 'success');
    });

    document.getElementById('uvd_restore').addEventListener('click', function() {
        var input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.addEventListener('change', function(e) {
            var reader = new FileReader();
            reader.onload = function(ev) {
                try {
                    var nd = JSON.parse(ev.target.result);
                    data = Object.assign(data, nd);
                    storage.set(data);
                    toast('✅ Đã nhập dữ liệu', 'success');
                    buildUI();
                } catch(err) {
                    toast('❌ File không hợp lệ', 'error');
                }
            };
            reader.readAsText(e.target.files[0]);
        });
        input.click();
    });

    document.getElementById('uvd_reset').addEventListener('click', function() {
        if (confirm('🔄 XÓA TOÀN BỘ DỮ LIỆU?\nYêu thích, lịch sử, cài đặt sẽ mất hết!')) {
            localStorage.removeItem(STORAGE_KEY);
            data = {
                favorites: [], theme: 'glass-dark', siteProfiles: {},
                history: [], torrserverUrl: 'http://127.0.0.1:8090'
            };
            storage.set(data);
            toast('✅ Đã đặt lại mặc định', 'info');
            buildUI();
        }
    });
}

/* ========== TỰ ĐỘNG CẬP NHẬT UI ========== */
function startAutoRefresh() {
    var lastCount = urls.size;
    var interval = setInterval(function() {
        if (!document.getElementById('__uvd__')) {
            clearInterval(interval);
            stopMonitor();
            return;
        }
        if (urls.size !== lastCount) {
            lastCount = urls.size;
            var vc = [...urls.values()].filter(function(u){return u.category==='video';}).length;
            var pc = [...urls.values()].filter(function(u){return u.category==='photo';}).length;
            var sc = [...urls.values()].filter(function(u){return u.category==='script';}).length;
            document.querySelectorAll('.__uvd_tab__').forEach(function(tab) {
                var b = tab.querySelector('.__uvd_badge__');
                if (!b) return;
                if (tab.dataset.tab === 'video') b.innerText = vc;
                else if (tab.dataset.tab === 'photo') b.innerText = pc;
                else if (tab.dataset.tab === 'script') b.innerText = sc;
                else if (tab.dataset.tab === 'favorites') b.innerText = data.favorites.length;
                else if (tab.dataset.tab === 'history') b.innerText = (data.history||[]).length;
            });
            var sub = document.querySelector('.__uvd_subtitle__');
            if (sub) sub.innerHTML = '<span class="__uvd_accent_inline_small__"></span><span class="__uvd_live_dot__"></span> ' + vc + ' video · ' + pc + ' ảnh · ' + sc + ' script';
            renderTab(currentTab);
        }
    }, 2500);
}

/* ========== HIỆU ỨNG RIPPLE TOÀN CỤC ========== */
document.addEventListener('click', function(e) {
    var btn = e.target.closest('.__uvd_btn_icon__, .__uvd_act_btn__, .__uvd_footer_btn__, .__uvd_tab__, .__uvd_btn_primary__, .__uvd_btn_danger__, .__uvd_btn_ghost__, .__uvd_preview_btn__, .__uvd_theme_btn__');
    if (!btn) return;
    var ripple = document.createElement('span');
    var rect = btn.getBoundingClientRect();
    var size = Math.max(rect.width, rect.height);
    ripple.style.cssText = 'position:absolute;width:' + size + 'px;height:' + size + 'px;border-radius:50%;background:rgba(255,255,255,0.35);left:' + (e.clientX - rect.left - size/2) + 'px;top:' + (e.clientY - rect.top - size/2) + 'px;transform:scale(0);animation:uvdRipple 0.6s ease-out;pointer-events:none;z-index:999;';
    var st = window.getComputedStyle(btn);
    if (st.position === 'static') btn.style.position = 'relative';
    btn.style.overflow = 'hidden';
    btn.appendChild(ripple);
    setTimeout(function() { if (ripple.parentNode) ripple.remove(); }, 600);
});

/* ========== KHỞI CHẠY ========== */
buildUI();
startAutoRefresh();
console.log('%c✅ Universal Video Downloader V3.7.1 Loaded!', 'color:#7C6CFF;font-weight:bold;font-size:14px;');
console.log('%c🎬 Tìm thấy ' + urls.size + ' stream ban đầu', 'color:#00E5FF;font-weight:600;');
toast('✅ Universal DL V3.7.1 sẵn sàng!', 'success');

})();
