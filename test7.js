/**
Universal Video Downloader V3.8 — Performance & Preview Enhanced
Changes:
- Removed Photo/Fav/History tabs for maximum performance
- Added Smart Filter to exclude poster/thumb URLs from video list
- Enhanced Preview Player: PiP, Speed Control, Better Mobile UI
- Streamlined Settings tab
Author: nguyenquocngu93 (Modified)
*/
(function() {
'use strict';

var isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
var old = document.getElementById('__uvd__');
if (old) old.remove();

// --- STORAGE & CONFIG ---
var STORAGE_KEY = 'uvd_data_v38';
var storage = {
    get: function() { try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; } catch(e) { return {}; } },
    set: function(data) { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch(e) {} }
};
var data = storage.get();
data.theme = data.theme || 'glass-dark';
data.siteProfiles = data.siteProfiles || {};
data.torrserverUrl = data.torrserverUrl || 'http://127.0.0.1:8090';

var defaultProfiles = {
    'videoplay.us': { referer: 'https://videoplay.us/', userAgent: '' },
    'streamtape.com': { referer: 'https://streamtape.com/', userAgent: '' },
    'ok.ru': { referer: 'https://ok.ru/', userAgent: '' },
    'fembed.com': { referer: 'https://fembed.com/', userAgent: '' },
    'mp4upload.com': { referer: 'https://mp4upload.com/', userAgent: '' },
    'javplayer.cc': { referer: 'https://javplayer.cc/', userAgent: '' }
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

// --- CORE SCANNING ENGINE (OPTIMIZED) ---
var urls = new Map();

// Chỉ giữ lại Video Patterns
var videoPatterns = [
    { re: /https?:\/\/[^\s"'<>()\]+\.m3u8[^\s"'<>()\]*/gi, type: 'M3U8', priority: 1 },
    { re: /https?:\/\/[^\s"'<>()\]+\.mpd[^\s"'<>()\]*/gi, type: 'MPD', priority: 2 },
    { re: /https?:\/\/[^\s"'<>()\]+\.mp4[^\s"'<>()\]*/gi, type: 'MP4', priority: 3 },
    { re: /https?:\/\/[^\s"'<>()\]+\.webm[^\s"'<>()\]*/gi, type: 'WEBM', priority: 4 },
    { re: /https?:\/\/[^\s"'<>()\]+\.mkv[^\s"'<>()\]*/gi, type: 'MKV', priority: 5 },
    { re: /https?:\/\/[^\s"'<>()\]+\.flv[^\s"'<>()\]*/gi, type: 'FLV', priority: 6 },
    { re: /https?:\/\/[^\s"'<>()\]+\.ts[^\s"'<>()\]*/gi, type: 'TS', priority: 7 }
];

// BỘ LỌC THÔNG MINH: Chặn link video bị dính param ảnh/poster
var BLACKLIST_PARAMS = ['poster=', 'thumbnail=', 'thumb=', 'cover.', 'preview.', 'sample.'];

function isValidVideoUrl(url) {
    var lower = url.toLowerCase();
    for (var i = 0; i < BLACKLIST_PARAMS.length; i++) {
        if (lower.indexOf(BLACKLIST_PARAMS[i]) !== -1) return false;
    }
    return true;
}

function findUrls(text, source) {
    if (!text || typeof text !== 'string') return;
    videoPatterns.forEach(function(p) {
        var matches = text.match(p.re);
        if (matches) {
            matches.forEach(function(u) {
                u = u.replace(/\u002F/g, '/').replace(/\\/g, '').replace(/&amp;/g, '&').replace(/"/g, '').replace(/'/g, '');
                // Áp dụng bộ lọc tại đây
                if (!isValidVideoUrl(u)) return;

                if (!urls.has(u) || urls.get(u).priority > p.priority) {
                    urls.set(u, { type: p.type, source: source, priority: p.priority, timestamp: Date.now(), category: 'video' });
                }
            });
        }
    });
    
    // Quét riêng iframe nhưng không gán category photo
    var iframeRe = /https?:\/\/[^\s"'<>()\]+/gi; 
    // Logic quét iframe được xử lý trong hàm scan() bên dưới
}

function scan(doc, src) {
    try {
        doc.querySelectorAll('video, source, audio').forEach(function(v) {
            if (v.src) findUrls(v.src, src + ':element');
            if (v.currentSrc) findUrls(v.currentSrc, src + ':current');
        });
        doc.querySelectorAll('script').forEach(function(s) { findUrls(s.textContent, src + ':script'); });
        findUrls(doc.documentElement.outerHTML, src + ':html');
        
        doc.querySelectorAll('iframe').forEach(function(i, idx) {
            if (i.src && isValidVideoUrl(i.src)) {
                urls.set(i.src, { type: 'IFRAME', source: 'iframe#' + idx, priority: 99, timestamp: Date.now(), category: 'script' });
            }
            try { if (i.contentDocument) scan(i.contentDocument, 'iframe#' + idx); } catch(e) {}
        });
    } catch(e) {}
}

// Monitor Network
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

// --- UTILS ---
function rescanPage() {
    scan(document, 'rescan');
    try { performance.getEntriesByType('resource').forEach(function(e) { findUrls(e.name, 'network:rescan'); }); } catch(e) {}
    pageInfo.title = (document.title || 'video').replace(/[^\w\s\u00C0-\u1EF9]/g, '').substring(0, 60).trim() || 'video';
    buildUI();
    toast('Đã quét lại: ' + [...urls.values()].filter(u => u.category === 'video').length + ' streams', 'success');
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
                    var qualityLabel = resolution === 'unknown' ? Math.round(bandwidth/1000) + 'kbps' : (resolution.split('x')[1] + 'p');
                    var streamUrl = nextLine.startsWith('http') ? nextLine : url.substring(0, url.lastIndexOf('/') + 1) + nextLine;
                    qualities.push({ label: qualityLabel, resolution: resolution, bandwidth: bandwidth, url: streamUrl });
                }
            }
        }
        qualities.sort(function(a, b) { return (parseInt(b.resolution.split('x')[1])||0) - (parseInt(a.resolution.split('x')[1])||0); });
        callback(qualities);
    })
    .catch(function(e) { callback(null); });
}

function makeCommands(url, type, title) {
    var ref = pageInfo.referer;
    var ext = type.toLowerCase() === 'iframe' ? 'mp4' : type.toLowerCase();
    return {
        'yt-dlp': { label: 'yt-dlp cơ bản', cmd: 'yt-dlp --referer "' + ref + '" -o "' + title + '.%(ext)s" "' + url + '"' },
        'yt-dlp-hq': { label: 'yt-dlp HQ', cmd: 'yt-dlp --referer "' + ref + '" -f "bv*+ba/best" --merge-output-format mp4 -o "' + title + '.%(ext)s" "' + url + '"' },
        'ffmpeg': { label: 'FFmpeg M3U8→MP4', cmd: 'ffmpeg -headers "Referer: ' + ref + '\r\n" -i "' + url + '" -c copy "' + title + '.mp4"' },
        'aria2': { label: 'aria2c', cmd: 'aria2c --referer="' + ref + '" -x 16 -s 16 -o "' + title + '.' + ext + '" "' + url + '"' }
    };
}

// --- THEMES ---
var themes = {
    'glass-dark': { name: 'Glass Dark', meshBg: 'radial-gradient(at 20% 20%, rgba(124, 108, 255, 0.15) 0%, transparent 50%), radial-gradient(at 80% 80%, rgba(0, 229, 255, 0.12) 0%, transparent 50%)', bg: 'rgba(10, 10, 18, 0.82)', bg2: 'rgba(18, 18, 30, 0.78)', bg3: 'rgba(28, 28, 45, 0.62)', glass: 'rgba(255, 255, 255, 0.05)', glassBorder: 'rgba(255, 255, 255, 0.1)', text: '#ffffff', text2: '#c0c0d0', text3: '#787890', primary: '#7C6CFF', primaryGlow: 'rgba(124, 108, 255, 0.5)', accent: '#00E5FF', accentGlow: 'rgba(0, 229, 255, 0.5)', danger: '#FF5252', success: '#4ADE80', warning: '#FFB84D' },
    'glass-light': { name: 'Glass Light', meshBg: 'radial-gradient(at 20% 20%, rgba(91, 79, 207, 0.1) 0%, transparent 50%)', bg: 'rgba(255, 255, 255, 0.78)', bg2: 'rgba(245, 245, 255, 0.72)', bg3: 'rgba(235, 235, 245, 0.58)', glass: 'rgba(0, 0, 0, 0.03)', glassBorder: 'rgba(0, 0, 0, 0.08)', text: '#1a1a2e', text2: '#4a4a6a', text3: '#8a8aa0', primary: '#5B4FCF', primaryGlow: 'rgba(91, 79, 207, 0.3)', accent: '#0099CC', accentGlow: 'rgba(0, 153, 204, 0.3)', danger: '#E63946', success: '#2A9D4A', warning: '#E67E00' },
    'glass-cyber': { name: 'Glass Cyber', meshBg: 'radial-gradient(at 20% 20%, rgba(255, 45, 149, 0.18) 0%, transparent 50%)', bg: 'rgba(12, 5, 22, 0.82)', bg2: 'rgba(22, 10, 38, 0.78)', bg3: 'rgba(36, 15, 56, 0.62)', glass: 'rgba(255, 0, 128, 0.05)', glassBorder: 'rgba(255, 0, 128, 0.15)', text: '#ffffff', text2: '#ff99cc', text3: '#994488', primary: '#FF2D95', primaryGlow: 'rgba(255, 45, 149, 0.5)', accent: '#00F0FF', accentGlow: 'rgba(0, 240, 255, 0.5)', danger: '#FF3366', success: '#00FF88', warning: '#FFCC00' }
};
function getTheme() { return themes[data.theme] || themes['glass-dark']; }

// --- UI HELPERS ---
function copy(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).catch(function() { fallbackCopy(text); });
    else fallbackCopy(text);
}
function fallbackCopy(text) {
    var t = document.createElement('textarea'); t.value = text; t.style.cssText = 'position:fixed;left:-9999px;';
    document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove();
}
function toast(msg, type) {
    type = type || 'success';
    var t = getTheme();
    var colors = { success: t.success, error: t.danger, info: t.accent, warning: t.warning };
    var color = colors[type] || t.primary;
    var el = document.createElement('div');
    el.innerText = msg;
    el.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);background:' + color + ';color:#fff;padding:8px 18px;border-radius:20px;z-index:2147483649;font:bold 11px -apple-system,Arial,sans-serif;box-shadow:0 4px 20px ' + color + '60;opacity:0;transition:opacity 0.2s;pointer-events:none;';
    document.body.appendChild(el);
    requestAnimationFrame(function() { el.style.opacity = '1'; });
    setTimeout(function() { el.style.opacity = '0'; setTimeout(function() { el.remove(); }, 200); }, 1800);
}
function shareUrl(url) {
    if (navigator.share) navigator.share({ title: pageInfo.title, url: url }).catch(function(err) { if (err.name !== 'AbortError') { copy(url); toast('Đã copy URL'); } });
    else { copy(url); toast('Đã copy - Mở YTDLnis', 'info'); }
}
function escapeHtml(str) { return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function debounce(fn, delay) { var timer; return function() { var context = this, args = arguments; clearTimeout(timer); timer = setTimeout(function() { fn.apply(context, args); }, delay); }; }
function exportData(format) {
    var arr = [...urls.entries()].map(function(e) { return { url: e[0], type: e[1].type, source: e[1].source, title: pageInfo.title, category: e[1].category }; });
    var content, mime, filename;
    if (format === 'json') { content = JSON.stringify({ page: pageInfo, streams: arr }, null, 2); mime = 'application/json'; filename = pageInfo.title + '_streams.json'; }
    else if (format === 'txt') { content = arr.filter(a => a.category === 'video').map(a => a.url).join('\n'); mime = 'text/plain'; filename = pageInfo.title + '_urls.txt'; }
    else if (format === 'm3u') { content = '#EXTM3U\n' + arr.filter(a => a.category === 'video').map(a => '#EXTINF:-1,' + a.title + '\n' + a.url).join('\n'); mime = 'audio/x-mpegurl'; filename = pageInfo.title + '.m3u'; }
    var blob = new Blob([content], { type: mime }); var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename; a.click(); URL.revokeObjectURL(a.href);
    toast('Đã export ' + format.toUpperCase(), 'success');
}

// --- MAIN UI BUILDER ---
var currentTab = 'video';
var currentFilter = '';
var currentSort = 'priority';
var isMinimized = false;
var lastPreviewSpeed = 1.0; // Remember speed in session

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
    var scriptCount = [...urls.values()].filter(function(u) { return u.category === 'script'; }).length;

    panel.innerHTML =
        '<div class="__uvd_mesh_bg__"></div>' +
        '<div class="__uvd_noise_overlay__"></div>' +
        '<div class="__uvd_header__">' +
            '<div class="__uvd_header_left__">' +
                '<div class="__uvd_header_text__">' +
                    '<div class="__uvd_title__"><span class="__uvd_accent_inline__"></span>Universal DL <span class="__uvd_version__">V3.8</span></div>' +
                    '<div class="__uvd_subtitle__"><span class="__uvd_accent_inline_small__"></span><span class="__uvd_live_dot__"></span> ' + videoCount + ' video · ' + scriptCount + ' script</div>' +
                '</div>' +
            '</div>' +
            '<div class="__uvd_header_right__">' +
                '<button class="__uvd_btn_icon__" id="__uvd_reload__" title="Quét lại">↻</button>' +
                '<button class="__uvd_btn_icon__" id="__uvd_minimize__" title="Thu nhỏ">─</button>' +
                '<button class="__uvd_btn_icon__" id="__uvd_close__" title="Đóng">✕</button>' +
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
                '<button class="__uvd_tab__ active" data-tab="video"><span class="__uvd_accent_inline_small__"></span>Video <span class="__uvd_badge__">' + videoCount + '</span></button>' +
                '<button class="__uvd_tab__" data-tab="script"><span class="__uvd_accent_inline_small__"></span>Script <span class="__uvd_badge__">' + scriptCount + '</span></button>' +
                '<button class="__uvd_tab__" data-tab="torrserver"><span class="__uvd_accent_inline_small__"></span>TorrServer</button>' +
                '<button class="__uvd_tab__" data-tab="settings"><span class="__uvd_accent_inline_small__"></span>Settings</button>' +
            '</div>' +
            '<div class="__uvd_info_bar__">' +
                '<div class="__uvd_info_row__"><span class="__uvd_info_label__">Title:</span><span class="__uvd_info_value__ __uvd_clickable__" id="__uvd_edit_title__">' + escapeHtml(pageInfo.title) + '</span></div>' +
                '<div class="__uvd_info_row__"><span class="__uvd_info_label__">Referer:</span><span class="__uvd_info_value__ __uvd_clickable__ __uvd_mono__" id="__uvd_edit_referer__">' + escapeHtml(pageInfo.referer) + '</span></div>' +
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

// --- CSS STYLES (COMPACTED) ---
function getGlobalCSS(t) {
    return '' +
    '@keyframes uvdPulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }' +
    '@keyframes uvdFadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }' +
    '@keyframes uvdSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }' +
    '.__uvd_panel__ { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: ' + t.bg + '; backdrop-filter: blur(28px) saturate(180%); -webkit-backdrop-filter: blur(28px) saturate(180%); z-index: 2147483647; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; font-size: 13px; color: ' + t.text + '; display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 0 50px rgba(0,0,0,0.6), inset 0 1px 0 ' + t.glassBorder + '; transition: height 0.25s ease; }' +
    '.__uvd_panel__.minimized { height: auto !important; bottom: auto !important; }' +
    '.__uvd_panel__.minimized .__uvd_body__ { display: none; }' +
    '.__uvd_mesh_bg__ { position: absolute; inset: 0; z-index: -2; background: ' + t.meshBg + '; pointer-events: none; }' +
    '.__uvd_noise_overlay__ { position: absolute; inset: 0; z-index: -1; opacity: 0.03; pointer-events: none; background-image: url("data:image/svg+xml,%3Csvg viewBox=\'0 0 200 200\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'n\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.9\' numOctaves=\'4\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23n)\'/%3E%3C/svg%3E"); background-size: 100px 100px; }' +
    '.__uvd_panel__ * { box-sizing: border-box; }' +
    '.__uvd_panel__ ::-webkit-scrollbar { width: 4px; }' +
    '.__uvd_panel__ ::-webkit-scrollbar-thumb { background: ' + t.primary + '50; border-radius: 2px; }' +
    '.__uvd_accent_inline__ { display: inline-block; width: 3px; height: 14px; vertical-align: middle; margin-right: 6px; background: linear-gradient(to bottom, ' + t.primary + ', ' + t.accent + '); border-radius: 2px; box-shadow: 0 0 8px ' + t.primaryGlow + '; }' +
    '.__uvd_accent_inline_small__ { display: inline-block; width: 2px; height: 10px; vertical-align: middle; margin-right: 5px; background: linear-gradient(to bottom, ' + t.primary + ', ' + t.accent + '); border-radius: 2px; box-shadow: 0 0 6px ' + t.primaryGlow + '; opacity: 0.8; }' +
    '.__uvd_btn_accent__ { display: inline-block; width: 2px; height: 12px; vertical-align: middle; margin-right: 5px; background: rgba(255,255,255,0.9); border-radius: 2px; }' +
    '.__uvd_header__ { background: ' + t.bg2 + '; backdrop-filter: blur(20px); padding: 14px 16px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid ' + t.glassBorder + '; flex-shrink: 0; position: relative; }' +
    '.__uvd_header_left__ { display: flex; align-items: center; gap: 10px; min-width: 0; flex: 1; }' +
    '.__uvd_title__ { font-size: 15px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: flex; align-items: center; }' +
    '.__uvd_version__ { font-size: 9px; background: linear-gradient(135deg, ' + t.primary + ', ' + t.accent + '); color: #fff; padding: 2px 6px; border-radius: 4px; margin-left: 6px; }' +
    '.__uvd_subtitle__ { font-size: 10px; color: ' + t.text2 + '; margin-top: 3px; display: flex; align-items: center; gap: 3px; }' +
    '.__uvd_live_dot__ { width: 5px; height: 5px; background: ' + t.success + '; border-radius: 50%; display: inline-block; animation: uvdPulse 1.5s infinite; box-shadow: 0 0 8px ' + t.success + '; }' +
    '.__uvd_header_right__ { display: flex; gap: 6px; flex-shrink: 0; }' +
    '.__uvd_btn_icon__ { background: ' + t.glass + '; border: 1px solid ' + t.glassBorder + '; color: ' + t.text + '; width: 34px; height: 34px; border-radius: 10px; font-size: 16px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.2s ease; }' +
    '.__uvd_btn_icon__:active { background: ' + t.primary + '40; transform: scale(0.92); }' +
    '.__uvd_btn-icon__.spinning { animation: uvdSpin 0.8s linear infinite; }' +
    '.__uvd_body__ { display: flex; flex-direction: column; flex: 1; min-height: 0; position: relative; z-index: 1; }' +
    '.__uvd_search_bar__ { padding: 10px 16px; display: flex; gap: 8px; align-items: center; background: ' + t.glass + '; border-bottom: 1px solid ' + t.glassBorder + '; flex-shrink: 0; }' +
    '.__uvd_search_input__ { flex: 1; min-width: 0; background: ' + t.bg3 + '; border: 1px solid ' + t.glassBorder + '; color: ' + t.text + '; padding: 8px 12px; border-radius: 10px; font-size: 12px; outline: none; }' +
    '.__uvd_search_input__:focus { border-color: ' + t.primary + '; box-shadow: 0 0 0 2px ' + t.primaryGlow + '; }' +
    '.__uvd_sort_select__ { background: ' + t.bg3 + '; border: 1px solid ' + t.glassBorder + '; color: ' + t.text + '; padding: 8px 10px; border-radius: 10px; font-size: 11px; outline: none; }' +
    '.__uvd_tabs__ { display: flex; background: ' + t.bg2 + '; padding: 6px; gap: 4px; border-bottom: 1px solid ' + t.glassBorder + '; overflow-x: auto; flex-shrink: 0; -webkit-overflow-scrolling: touch; }' +
    '.__uvd_tabs__::-webkit-scrollbar { display: none; }' +
    '.__uvd_tab__ { flex: 0 0 auto; background: transparent; color: ' + t.text2 + '; border: 1px solid transparent; padding: 7px 12px; border-radius: 10px; font-size: 11px; font-weight: 600; cursor: pointer; white-space: nowrap; display: flex; align-items: center; gap: 4px; transition: all 0.2s ease; }' +
    '.__uvd_tab__.active { background: linear-gradient(135deg, ' + t.primary + '25, ' + t.accent + '15); color: ' + t.text + '; border-color: ' + t.primary + '60; box-shadow: 0 0 12px ' + t.primaryGlow + '; }' +
    '.__uvd_badge__ { background: ' + t.glass + '; border: 1px solid ' + t.glassBorder + '; padding: 1px 5px; border-radius: 5px; font-size: 9px; font-weight: 700; }' +
    '.__uvd_tab__.active .__uvd_badge__ { background: ' + t.primary + '50; border-color: ' + t.primary + '; }' +
    '.__uvd_info_bar__ { padding: 10px 16px; background: ' + t.glass + '; border-bottom: 1px solid ' + t.glassBorder + '; font-size: 11px; flex-shrink: 0; }' +
    '.__uvd_info_row__ { display: flex; gap: 6px; align-items: center; margin-bottom: 3px; }' +
    '.__uvd_info_label__ { opacity: 0.8; font-weight: 600; color: ' + t.text2 + '; }' +
    '.__uvd_info_value__ { color: ' + t.accent + '; flex: 1; min-width: 0; }' +
    '.__uvd_clickable__ { cursor: pointer; text-decoration: underline dotted; text-underline-offset: 2px; }' +
    '.__uvd_mono__ { font-family: monospace; font-size: 10px; word-break: break-all; }' +
    '.__uvd_content__ { flex: 1; overflow-y: auto; padding: 12px 16px; -webkit-overflow-scrolling: touch; }' +
    '.__uvd_card__ { background: ' + t.bg3 + '; border: 1px solid ' + t.glassBorder + '; padding: 14px; margin-bottom: 10px; border-radius: 14px; position: relative; animation: uvdFadeIn 0.3s ease; }' +
    '.__uvd_card_header__ { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; gap: 8px; }' +
    '.__uvd_type_badge__ { padding: 4px 10px; border-radius: 6px; font-size: 10px; font-weight: 700; color: #fff; flex-shrink: 0; }' +
    '.__uvd_source__ { color: ' + t.text3 + '; font-size: 9px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }' +
    '.__uvd_url_box__ { background: ' + t.bg + '; border: 1px solid ' + t.glassBorder + '; padding: 8px 10px; border-radius: 8px; font-family: monospace; font-size: 10px; color: ' + t.text2 + '; word-break: break-all; max-height: 50px; overflow-y: auto; line-height: 1.4; margin-bottom: 10px; }' +
    '.__uvd_actions__ { display: grid; grid-template-columns: repeat(2, 1fr); gap: 6px; }' +
    '.__uvd_act_btn__ { border: 0; padding: 10px 6px; border-radius: 10px; font-size: 11px; font-weight: 600; cursor: pointer; color: #fff; display: flex; align-items: center; justify-content: center; gap: 4px; transition: all 0.2s ease; }' +
    '.__uvd_act_btn__:active { transform: scale(0.96); opacity: 0.9; }' +
    '.__uvd_act_btn__.full { grid-column: 1 / -1; }' +
    '.__uvd_btn_share__ { background: linear-gradient(135deg, #FF5252, #FF1744); }' +
    '.__uvd_btn_copy__ { background: linear-gradient(135deg, ' + t.primary + ', ' + t.accent + '); }' +
    '.__uvd_btn_quality__ { background: linear-gradient(135deg, #AB47BC, #7B1FA2); }' +
    '.__uvd_btn_preview__ { background: linear-gradient(135deg, #26C6DA, #00838F); }' +
    '.__uvd_btn_cmd__ { background: linear-gradient(135deg, #EC407A, #C2185B); }' +
    '.__uvd_btn_iframe__ { background: linear-gradient(135deg, #42A5F5, #1565C0); }' +
    '.__uvd_footer__ { background: ' + t.bg2 + '; padding: 10px 12px; border-top: 1px solid ' + t.glassBorder + '; display: flex; gap: 6px; flex-wrap: wrap; flex-shrink: 0; }' +
    '.__uvd_footer_btn__ { background: ' + t.glass + '; border: 1px solid ' + t.glassBorder + '; color: ' + t.text + '; padding: 8px 10px; border-radius: 10px; font-size: 11px; font-weight: 600; flex: 1; min-width: 60px; cursor: pointer; }' +
    '.__uvd_empty__ { text-align: center; padding: 50px 20px; color: ' + t.text2 + '; }' +
    '.__uvd_empty_icon__ { font-size: 40px; margin-bottom: 10px; opacity: 0.5; }' +
    '.__uvd_overlay__ { position: fixed; inset: 0; background: rgba(0,0,0,0.9); backdrop-filter: blur(20px); z-index: 2147483648; padding: 12px; display: flex; flex-direction: column; overflow-y: auto; }' +
    '.__uvd_overlay_box__ { background: ' + t.bg + '; border: 1px solid ' + t.glassBorder + '; border-radius: 18px; padding: 18px; width: 100%; max-width: 600px; margin: auto; }' +
    '.__uvd_overlay_title__ { color: ' + t.primary + '; font-size: 16px; font-weight: 700; margin-bottom: 14px; display: flex; align-items: center; gap: 8px; }' +
    '.__uvd_quality_card__ { background: ' + t.bg3 + '; border: 1px solid ' + t.glassBorder + '; padding: 14px; margin-bottom: 10px; border-radius: 12px; }' +
    '.__uvd_quality_label__ { color: ' + t.primary + '; font-size: 15px; font-weight: 700; }' +
    '.__uvd_cmd_card__ { background: ' + t.bg3 + '; border: 1px solid ' + t.glassBorder + '; padding: 14px; margin-bottom: 10px; border-radius: 12px; }' +
    '.__uvd_cmd_code__ { background: ' + t.bg + '; border: 1px solid ' + t.glassBorder + '; padding: 10px; border-radius: 8px; font-family: monospace; font-size: 10px; color: ' + t.text2 + '; word-break: break-all; max-height: 80px; overflow-y: auto; margin-bottom: 10px; }' +
    '.__uvd_textarea__ { width: 100%; min-height: 130px; background: ' + t.bg + '; border: 2px solid ' + t.primary + '60; color: ' + t.text + '; border-radius: 10px; padding: 12px; font: 12px monospace; resize: vertical; outline: none; }' +
    '.__uvd_btn_primary__ { background: linear-gradient(135deg, ' + t.primary + ', ' + t.accent + '); color: #fff; border: 0; padding: 11px 18px; border-radius: 10px; font-weight: 700; font-size: 12px; cursor: pointer; flex: 1; }' +
    '.__uvd_btn_danger__ { background: linear-gradient(135deg, ' + t.danger + ', #CC0033); color: #fff; border: 0; padding: 11px 18px; border-radius: 10px; font-weight: 700; font-size: 12px; cursor: pointer; flex: 1; }' +
    '.__uvd_btn_ghost__ { background: ' + t.glass + '; border: 1px solid ' + t.glassBorder + '; color: ' + t.text + '; padding: 11px 18px; border-radius: 10px; font-weight: 600; font-size: 12px; cursor: pointer; flex: 1; }' +
    '.__uvd_settings_section__ { background: ' + t.bg3 + '; border: 1px solid ' + t.glassBorder + '; padding: 14px; margin-bottom: 12px; border-radius: 12px; }' +
    '.__uvd_settings_title__ { color: ' + t.text + '; font-weight: 700; margin-bottom: 12px; font-size: 14px; display: flex; align-items: center; }' +
    '.__uvd_theme_grid__ { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; }' +
    '.__uvd_theme_btn__ { background: ' + t.bg2 + '; border: 2px solid ' + t.glassBorder + '; color: ' + t.text + '; padding: 12px; border-radius: 10px; font-weight: 600; cursor: pointer; font-size: 11px; }' +
    '.__uvd_theme-btn__.active { border-color: ' + t.primary + '; background: ' + t.primary + '30; }' +
    '.__uvd_profile_card__ { background: ' + t.bg + '; border: 1px solid ' + t.glassBorder + '; padding: 10px; margin-bottom: 6px; border-radius: 8px; font-size: 11px; }' +
    '.__uvd_ts_input_row__ { display: flex; gap: 8px; margin-bottom: 10px; }' +
    '.__uvd_ts_input__ { flex: 1; min-width: 0; background: ' + t.bg3 + '; border: 1px solid ' + t.glassBorder + '; color: ' + t.text + '; padding: 10px 12px; border-radius: 10px; font-size: 12px; outline: none; }' +
    '.__uvd_ts_torrent_card__ { background: ' + t.bg3 + '; border: 1px solid ' + t.glassBorder + '; border-left: 3px solid ' + t.primary + '; padding: 12px; margin-bottom: 8px; border-radius: 10px; }' +
    /* PREVIEW PLAYER ENHANCED */
    '.__uvd_preview_overlay__ { position: fixed; inset: 0; background: #000; z-index: 2147483648; display: flex; flex-direction: column; }' +
    '.__uvd_preview_header__ { position: absolute; top: 0; left: 0; right: 0; z-index: 10; background: linear-gradient(to bottom, rgba(0,0,0,0.85) 0%, transparent 100%); padding: 12px 14px; padding-top: max(12px, env(safe-area-inset-top)); display: flex; justify-content: space-between; align-items: center; transition: opacity 0.3s ease; }' +
    '.__uvd_preview_header__.hidden { opacity: 0; pointer-events: none; }' +
    '.__uvd_preview_title__ { color: #fff; font-size: 13px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1; margin-right: 10px; text-shadow: 0 2px 8px rgba(0,0,0,0.8); }' +
    '.__uvd_preview_close__ { background: rgba(255,255,255,0.15); border: 1px solid rgba(255,255,255,0.25); color: #fff; width: 36px; height: 36px; border-radius: 50%; font-size: 16px; cursor: pointer; flex-shrink: 0; display: flex; align-items: center; justify-content: center; }' +
    '.__uvd_preview_video_wrap__ { flex: 1; display: flex; align-items: center; justify-content: center; position: relative; background: #000; overflow: hidden; }' +
    '.__uvd_preview_video__ { width: 100%; height: 100%; object-fit: contain; background: #000; }' +
    '.__uvd_preview_status__ { position: absolute; bottom: 140px; left: 12px; z-index: 8; background: rgba(0,0,0,0.75); border: 1px solid rgba(255,255,255,0.2); padding: 6px 14px; border-radius: 14px; font-size: 11px; color: #fff; pointer-events: none; opacity: 0; transform: translateY(5px); transition: all 0.25s ease; display: flex; align-items: center; gap: 6px; }' +
    '.__uvd_preview_status__.visible { opacity: 1; transform: translateY(0); }' +
    '.__uvd_preview_controls__ { position: absolute; bottom: 0; left: 0; right: 0; z-index: 10; background: linear-gradient(to top, rgba(0,0,0,0.88) 0%, transparent 100%); padding: 14px; padding-bottom: max(14px, env(safe-area-inset-bottom)); display: flex; gap: 8px; flex-wrap: wrap; justify-content: center; align-items: center; transition: opacity 0.3s ease; }' +
    '.__uvd_preview_controls__.hidden { opacity: 0; pointer-events: none; }' +
    '.__uvd_preview_btn__ { background: rgba(255,255,255,0.12); border: 1px solid rgba(255,255,255,0.22); color: #fff; padding: 9px 16px; border-radius: 20px; font-size: 12px; font-weight: 600; cursor: pointer; transition: all 0.2s; letter-spacing: 0.3px; }' +
    '.__uvd_preview_btn__:active { background: rgba(255,255,255,0.25); transform: scale(0.95); }' +
    '.__uvd_preview_speed_wrap__ { display: flex; align-items: center; gap: 4px; background: rgba(255,255,255,0.1); padding: 4px 10px; border-radius: 20px; border: 1px solid rgba(255,255,255,0.15); }' +
    '.__uvd_preview_speed_select__ { background: transparent; border: none; color: #fff; font-size: 11px; font-weight: 600; outline: none; cursor: pointer; }' +
    '.__uvd_preview_quality_bar__ { position: absolute; top: 60px; left: 10px; right: 10px; z-index: 9; background: rgba(0,0,0,0.82); border: 1px solid rgba(255,255,255,0.2); border-radius: 14px; padding: 12px; display: none; max-height: 40vh; overflow-y: auto; }' +
    '.__uvd_preview_quality_bar__.visible { display: block; }' +
    '.__uvd_preview_quality_list__ { display: flex; gap: 6px; flex-wrap: wrap; }' +
    '.btn-row { display: flex; gap: 8px; margin-top: 12px; }' +
    '@media (orientation: landscape) { .__uvd_preview_video__ { width: 100vw; height: 100vh; } .__uvd_preview_controls__ { padding: 8px 12px; } .__uvd_preview_status__ { bottom: 110px; } }' +
    '@media (orientation: portrait) { .__uvd_preview_video__ { width: 100%; max-height: 55vh; } .__uvd_preview_video_wrap__ { min-height: 55vh; } }';
}

// --- EVENT BINDINGS ---
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
    var debouncedSearch = debounce(function(value) { currentFilter = value.toLowerCase(); renderTab(currentTab); }, 250);
    searchInput.addEventListener('input', function(e) { debouncedSearch(e.target.value); });

    document.getElementById('__uvd_sort__').addEventListener('change', function(e) { currentSort = e.target.value; renderTab(currentTab); });
    document.getElementById('__uvd_reload__').addEventListener('click', function() { var btn = this; btn.classList.add('spinning'); setTimeout(function() { rescanPage(); btn.classList.remove('spinning'); }, 400); });
    document.getElementById('__uvd_close__').addEventListener('click', function() { stopMonitor(); var panel = document.getElementById('__uvd__'); if (panel) panel.remove(); var style = document.getElementById('__uvd_styles__'); if (style) style.remove(); });
    document.getElementById('__uvd_minimize__').addEventListener('click', function() { var panel = document.getElementById('__uvd__'); if (!panel) return; isMinimized = !isMinimized; if (isMinimized) { panel.classList.add('minimized'); this.innerText = '□'; } else { panel.classList.remove('minimized'); this.innerText = '─'; } });
    document.getElementById('__uvd_edit_title__').addEventListener('click', function() { var newTitle = prompt('Tên file:', pageInfo.title); if (newTitle) { pageInfo.title = newTitle.replace(/[^\w\s\u00C0-\u1EF9.-]/g, '').substring(0, 100); this.innerText = pageInfo.title; toast('Đã cập nhật tên', 'success'); } });
    document.getElementById('__uvd_edit_referer__').addEventListener('click', function() { var newRef = prompt('Referer:', pageInfo.referer); if (newRef) { pageInfo.referer = newRef; this.innerText = newRef; data.siteProfiles[pageInfo.host] = { referer: newRef, userAgent: pageInfo.userAgent }; storage.set(data); toast('Đã lưu Referer', 'success'); } });
    document.getElementById('__uvd_batch_copy__').addEventListener('click', function() { var allUrls = [...urls.keys()].join('\n'); copy(allUrls); toast('Đã copy ' + urls.size + ' URLs', 'success'); });
    document.getElementById('__uvd_export_txt__').addEventListener('click', function() { exportData('txt'); });
    document.getElementById('__uvd_export_json__').addEventListener('click', function() { exportData('json'); });
    document.getElementById('__uvd_export_m3u__').addEventListener('click', function() { exportData('m3u'); });
}

// --- RENDER LOGIC ---
function renderTab(tabId) {
    var content = document.getElementById('__uvd_content__');
    if (!content) return;
    content.innerHTML = '';
    if (tabId === 'video' || tabId === 'script') renderCategory(content, tabId);
    else if (tabId === 'torrserver') renderTorrServer(content);
    else if (tabId === 'settings') renderSettings(content);
}

function getSortedFilteredItems(category) {
    var items = [...urls.entries()].filter(function(e) { return e[1].category === category; })
        .map(function(e) { return { url: e[0], type: e[1].type, source: e[1].source, priority: e[1].priority, timestamp: e[1].timestamp }; });
    if (currentFilter) items = items.filter(function(item) { return item.url.toLowerCase().includes(currentFilter) || item.type.toLowerCase().includes(currentFilter); });
    if (currentSort === 'priority') items.sort(function(a, b) { return a.priority - b.priority; });
    else if (currentSort === 'time') items.sort(function(a, b) { return b.timestamp - a.timestamp; });
    else if (currentSort === 'type') items.sort(function(a, b) { return a.type.localeCompare(b.type); });
    return items;
}

function renderCategory(container, category) {
    var t = getTheme();
    var items = getSortedFilteredItems(category);
    if (!items.length) {
        container.innerHTML = '<div class="__uvd_empty__"><div class="__uvd_empty_icon__">' + (category === 'video' ? '🎬' : '📜') + '</div><div class="__uvd_empty_text__">Chưa tìm thấy ' + category + '</div><div class="__uvd_empty_sub__">Đang monitor... Bấm Play hoặc load thêm</div></div>';
        return;
    }
    var typeColors = { 'M3U8': '#4CAF50', 'MPD': '#8BC34A', 'MP4': '#FF9800', 'WEBM': '#FF9800', 'MKV': '#FF5722', 'FLV': '#FF5722', 'TS': '#FFC107', 'IFRAME': '#2196F3' };
    var fragment = document.createDocumentFragment();

    items.forEach(function(item, i) {
        var card = document.createElement('div');
        card.className = '__uvd_card__';
        var color = typeColors[item.type] || '#666';
        var extraBtns = '';
        if (item.type === 'M3U8' || item.type === 'MP4' || item.type === 'WEBM') extraBtns += '<button class="__uvd_act_btn__ __uvd_btn_preview__" data-url="' + encodeURIComponent(item.url) + '" data-action="preview" data-type="' + item.type + '"><span class="__uvd_btn_accent__"></span>Preview</button>';
        if (item.type === 'M3U8') extraBtns += '<button class="__uvd_act_btn__ __uvd_btn_quality__" data-url="' + encodeURIComponent(item.url) + '" data-action="quality"><span class="__uvd_btn_accent__"></span>Quality</button>';

        var actionsHtml = (item.type === 'IFRAME') ?
            '<div class="__uvd_actions__"><a href="' + item.url + '" target="_blank" class="__uvd_act_btn__ __uvd_btn_iframe__ full" style="text-decoration:none;text-align:center;"><span class="__uvd_btn_accent__"></span>Mở iframe tab mới</a><button class="__uvd_act_btn__ __uvd_btn_copy__" data-url="' + encodeURIComponent(item.url) + '" data-action="copy"><span class="__uvd_btn_accent__"></span>Copy</button></div>' :
            '<div class="__uvd_actions__"><button class="__uvd_act_btn__ __uvd_btn_share__" data-url="' + encodeURIComponent(item.url) + '" data-action="share"><span class="__uvd_btn_accent__"></span>YTDLnis</button><button class="__uvd_act_btn__ __uvd_btn_copy__" data-url="' + encodeURIComponent(item.url) + '" data-action="copy"><span class="__uvd_btn_accent__"></span>Copy</button>' + extraBtns + '<button class="__uvd_act_btn__ __uvd_btn_cmd__ full" data-url="' + encodeURIComponent(item.url) + '" data-action="cmd" data-type="' + item.type + '"><span class="__uvd_btn_accent__"></span>Tất cả lệnh tải</button></div>';

        card.innerHTML = '<div class="__uvd_card_header__"><span class="__uvd_type_badge__" style="background:' + color + ';">' + item.type + ' #' + (i+1) + '</span><span class="__uvd_source__">' + escapeHtml(item.source) + '</span></div><div class="__uvd_url_box__">' + escapeHtml(item.url) + '</div>' + actionsHtml;
        fragment.appendChild(card);
    });

    container.appendChild(fragment);
    container.addEventListener('click', function(e) {
        var actBtn = e.target.closest('.__uvd_act_btn__');
        if (actBtn) {
            e.preventDefault();
            var url = decodeURIComponent(actBtn.dataset.url);
            var action = actBtn.dataset.action;
            var type = actBtn.dataset.type;
            if (action === 'share') shareUrl(url);
            else if (action === 'copy') { copy(url); toast('Đã copy URL', 'success'); }
            else if (action === 'quality') showQualityPicker(url);
            else if (action === 'preview') showPreview(url, type);
            else if (action === 'cmd') showCommandPicker(url, type);
        }
    });
}

// --- PREVIEW PLAYER (ENHANCED WITH PIP & SPEED) ---
function showPreview(url, type) {
    var t = getTheme();
    var overlay = document.createElement('div');
    overlay.className = '__uvd_preview_overlay__';
    overlay.innerHTML =
        '<div class="__uvd_preview_header__" id="__pv_header__"><div class="__uvd_preview_title__">' + escapeHtml(pageInfo.title) + '</div><button class="__uvd_preview_close__" id="__pv_close__">✕</button></div>' +
        '<div class="__uvd_preview_video_wrap__" id="__pv_wrap__"><video id="__pv_video__" class="__uvd_preview_video__" controls playsinline webkit-playsinline preload="auto"></video><div class="__uvd_preview_status__" id="__pv_status__"></div></div>' +
        '<div class="__uvd_preview_quality_bar__" id="__pv_quality_bar__"><div style="color:#fff;font-size:11px;font-weight:600;margin-bottom:10px;">Chất lượng:</div><div class="__uvd_preview_quality_list__" id="__pv_quality_list__"></div></div>' +
        '<div class="__uvd_preview_controls__" id="__pv_controls__">' +
            '<button class="__uvd_preview_btn__" id="__pv_copy__"><span class="__uvd_btn_accent__"></span>Copy</button>' +
            '<button class="__uvd_preview_btn__" id="__pv_share__"><span class="__uvd_btn_accent__"></span>Share</button>' +
            '<button class="__uvd_preview_btn__" id="__pv_pip__"><span class="__uvd_btn_accent__"></span>PiP</button>' +
            '<div class="__uvd_preview_speed_wrap__"><span style="font-size:10px;color:#fff;">Speed</span><select id="__pv_speed__" class="__uvd_preview_speed_select__"><option value="0.5">0.5x</option><option value="1" selected>1.0x</option><option value="1.5">1.5x</option><option value="2">2.0x</option></select></div>' +
            '<button class="__uvd_preview_btn__" id="__pv_quality__"><span class="__uvd_btn_accent__"></span>Quality</button>' +
            '<button class="__uvd_preview_btn__" id="__pv_fullscreen__"><span class="__uvd_btn_accent__"></span>Full</button>' +
        '</div>';

    document.body.appendChild(overlay);
    var video = document.getElementById('__pv_video__');
    var wrap = document.getElementById('__pv_wrap__');
    var statusEl = document.getElementById('__pv_status__');
    var headerEl = document.getElementById('__pv_header__');
    var controlsEl = document.getElementById('__pv_controls__');
    var qualityBar = document.getElementById('__pv_quality_bar__');
    var qualityList = document.getElementById('__pv_quality_list__');
    var speedSelect = document.getElementById('__pv_speed__');
    var currentHls = null;
    var statusTimer = null;
    var uiTimer = null;
    var uiVisible = true;

    // Restore last speed
    speedSelect.value = String(lastPreviewSpeed);
    video.playbackRate = lastPreviewSpeed;

    function showStatus(msg, duration, statusType) {
        statusEl.innerText = msg;
        statusEl.className = '__uvd_preview_status__ visible' + (statusType ? ' ' + statusType : '');
        clearTimeout(statusTimer);
        if (duration > 0) statusTimer = setTimeout(function() { statusEl.classList.remove('visible'); }, duration);
    }
    function showUI() {
        uiVisible = true;
        headerEl.classList.remove('hidden');
        controlsEl.classList.remove('hidden');
        clearTimeout(uiTimer);
        uiTimer = setTimeout(function() { if (!video.paused) { uiVisible = false; headerEl.classList.add('hidden'); controlsEl.classList.add('hidden'); qualityBar.classList.remove('visible'); } }, 3500);
    }
    function toggleUI() { if (uiVisible) { uiVisible = false; headerEl.classList.add('hidden'); controlsEl.classList.add('hidden'); qualityBar.classList.remove('visible'); clearTimeout(uiTimer); } else showUI(); }
    function cleanup() {
        try { video.pause(); video.removeAttribute('src'); video.load(); } catch(e) {}
        if (currentHls) { try { currentHls.stopLoad(); currentHls.destroy(); } catch(e) {} currentHls = null; }
        clearTimeout(statusTimer); clearTimeout(uiTimer);
        if (document.fullscreenElement) try { document.exitFullscreen(); } catch(e) {}
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    }

    // Event Listeners
    document.getElementById('__pv_close__').addEventListener('click', function(e) { e.stopPropagation(); cleanup(); });
    video.addEventListener('click', function(e) { e.stopPropagation(); toggleUI(); });
    document.getElementById('__pv_copy__').addEventListener('click', function(e) { e.stopPropagation(); copy(url); toast('Đã copy URL', 'success'); });
    document.getElementById('__pv_share__').addEventListener('click', function(e) { e.stopPropagation(); shareUrl(url); });
    
    // NEW: PiP Button
    document.getElementById('__pv_pip__').addEventListener('click', function(e) {
        e.stopPropagation();
        if (document.pictureInPictureElement) document.exitPictureInPicture().catch(function(err){ console.warn(err); });
        else if (video.requestPictureInPicture) video.requestPictureInPicture().catch(function(err){ toast('Không hỗ trợ PiP', 'error'); });
    });

    // NEW: Speed Control
    speedSelect.addEventListener('change', function(e) {
        e.stopPropagation();
        var val = parseFloat(this.value);
        video.playbackRate = val;
        lastPreviewSpeed = val; // Save to session
        showStatus('Tốc độ: ' + val + 'x', 1000);
    });

    document.getElementById('__pv_quality__').addEventListener('click', function(e) { e.stopPropagation(); qualityBar.classList.toggle('visible'); });
    document.getElementById('__pv_fullscreen__').addEventListener('click', function(e) { e.stopPropagation(); enterFullscreen(wrap); });

    video.addEventListener('playing', function() { showStatus('Đang phát', 1500); showUI(); });
    video.addEventListener('waiting', function() { showStatus('Buffering...', 0, 'buffering'); });
    video.addEventListener('canplay', function() { statusEl.classList.remove('visible'); });
    video.addEventListener('pause', function() { showUI(); });
    video.addEventListener('error', function() { showStatus('Lỗi phát video', 3000, 'error'); });

    // HLS Handling
    var isM3U8 = (type === 'M3U8') || url.includes('.m3u8');
    if (isM3U8) {
        if (window.Hls && Hls.isSupported()) { initHls(); }
        else {
            showStatus('Đang load HLS.js...', 0, 'buffering');
            var s = document.createElement('script'); s.src = 'https://cdn.jsdelivr.net/npm/hls.js@latest';
            s.onload = initHls; s.onerror = function() { showStatus('Lỗi load HLS.js', 3000, 'error'); video.src = url; };
            document.head.appendChild(s);
        }
    } else { video.src = url; showStatus('Loading...', 0, 'buffering'); video.play().catch(function(){}); }

    function initHls() {
        currentHls = new Hls({ maxLoadingDelay: 4, maxBufferLength: 30, enableWorker: true });
        currentHls.loadSource(url); currentHls.attachMedia(video);
        currentHls.on(Hls.Events.MANIFEST_PARSED, function(event, data) {
            showStatus('HLS · ' + data.levels.length + ' levels', 1500);
            var qHtml = '<button class="__uvd_preview_btn__ active" data-level="-1">Auto</button>';
            data.levels.forEach(function(level, idx) {
                var label = level.height ? level.height + 'p' : Math.round(level.bitrate/1000) + 'k';
                qHtml += '<button class="__uvd_preview_btn__" data-level="' + idx + '">' + label + '</button>';
            });
            qualityList.innerHTML = qHtml;
            qualityList.addEventListener('click', function(ev) {
                var btn = ev.target.closest('.__uvd_preview_btn__');
                if (btn && currentHls) {
                    qualityList.querySelectorAll('.__uvd_preview_btn__').forEach(function(b) { b.classList.remove('active'); });
                    btn.classList.add('active');
                    currentHls.currentLevel = parseInt(btn.dataset.level);
                    showStatus(btn.innerText, 1200);
                }
            });
            video.play().catch(function(){});
        });
        currentHls.on(Hls.Events.ERROR, function(event, data) {
            if (data.fatal) {
                showStatus('Lỗi: ' + data.details, 3000, 'error');
                if (data.type === Hls.ErrorTypes.NETWORK_ERROR) currentHls.startLoad();
                else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) currentHls.recoverMediaError();
                else { currentHls.destroy(); currentHls = null; }
            }
        });
    }

    showUI();
    var escHandler = function(e) { if (e.key === 'Escape') { cleanup(); document.removeEventListener('keydown', escHandler); } };
    document.addEventListener('keydown', escHandler);
}

function enterFullscreen(element) {
    var request = element.requestFullscreen || element.webkitRequestFullscreen || element.mozRequestFullScreen || element.msRequestFullscreen;
    if (request) {
        var result = request.call(element);
        if (result && result.then) result.then(function() { if (screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(function(){}); }).catch(function(){});
        else if (screen.orientation && screen.orientation.lock) setTimeout(function() { screen.orientation.lock('landscape').catch(function(){}); }, 100);
    } else { var v = element.querySelector('video'); if (v && v.webkitEnterFullscreen) v.webkitEnterFullscreen(); }
}

// --- QUALITY PICKER & COMMAND PICKER ---
function showQualityPicker(url) {
    var t = getTheme();
    var overlay = document.createElement('div'); overlay.className = '__uvd_overlay__';
    overlay.innerHTML = '<div class="__uvd_overlay_box__"><div class="__uvd_overlay_title__"><span class="__uvd_accent_inline__"></span>Đang phân tích M3U8...</div><div style="text-align:center;padding:30px;color:' + t.text2 + ';">Loading...</div></div>';
    document.body.appendChild(overlay);
    overlay.addEventListener('click', function(e) { if (e.target === overlay) overlay.remove(); });

    parseM3U8Master(url, function(qualities) {
        if (!qualities) {
            overlay.querySelector('.__uvd_overlay_box__').innerHTML = '<div class="__uvd_overlay_title__">Không phải Master Playlist</div><div class="btn-row"><button class="__uvd_btn_primary__" onclick="this.closest(\'.__uvd_overlay__\').remove();showPreview(\'' + url + '\',\'M3U8\')">Xem trực tiếp</button><button class="__uvd_btn_ghost__" onclick="this.closest(\'.__uvd_overlay__\').remove()">Đóng</button></div>';
            return;
        }
        var html = '<div class="__uvd_overlay_title__">Chọn chất lượng (' + qualities.length + ')</div>';
        qualities.forEach(function(q) {
            html += '<div class="__uvd_quality_card__"><div style="display:flex;justify-content:space-between;margin-bottom:8px;"><span class="__uvd_quality_label__">' + q.label + '</span><span style="color:' + t.text2 + ';font-size:10px;">' + Math.round(q.bandwidth/1000) + ' kbps</span></div><div class="__uvd_url_box__">' + escapeHtml(q.url) + '</div><div class="__uvd_actions__"><button class="__uvd_act_btn__ __uvd_btn_preview__" onclick="this.closest(\'.__uvd_overlay__\').remove();showPreview(\'' + encodeURIComponent(q.url) + '\',\'M3U8\')"><span class="__uvd_btn_accent__"></span>Preview</button><button class="__uvd_act_btn__ __uvd_btn_copy__" onclick="copy(\'' + q.url + '\');toast(\'Đã copy\')"><span class="__uvd_btn_accent__"></span>Copy</button></div></div>';
        });
        html += '<div class="btn-row"><button class="__uvd_btn_danger__" onclick="this.closest(\'.__uvd_overlay__\').remove()">Đóng</button></div>';
        overlay.querySelector('.__uvd_overlay_box__').innerHTML = html;
    });
}

function showCommandPicker(url, type) {
    var t = getTheme();
    var cmds = makeCommands(url, type, pageInfo.title);
    var overlay = document.createElement('div'); overlay.className = '__uvd_overlay__';
    var html = '<div class="__uvd_overlay_box__"><div class="__uvd_overlay_title__"><span class="__uvd_accent_inline__"></span>Chọn lệnh tải</div>';
    Object.keys(cmds).forEach(function(key) {
        var c = cmds[key];
        html += '<div class="__uvd_cmd_card__"><div style="color:' + t.warning + ';font-weight:600;margin-bottom:8px;font-size:12px;">' + c.label + '</div><div class="__uvd_cmd_code__">' + escapeHtml(c.cmd) + '</div><button class="__uvd_btn_primary__" style="width:100%" onclick="copy(\'' + escapeHtml(c.cmd).replace(/'/g, "\\'") + '\');toast(\'Đã copy lệnh!\')">Copy lệnh</button></div>';
    });
    html += '<div class="btn-row"><button class="__uvd_btn_danger__" onclick="this.closest(\'.__uvd_overlay__\').remove()">Đóng</button></div></div>';
    overlay.innerHTML = html;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', function(e) { if (e.target === overlay) overlay.remove(); });
}

// --- TORRSERVER TAB ---
function renderTorrServer(container) {
    var t = getTheme();
    var tsBase = (data.torrserverUrl || 'http://127.0.0.1:8090').replace(/\/+$/, '');
    container.innerHTML = '<div class="__uvd_ts_input_row__"><input type="text" class="__uvd_ts_input__" id="__uvd_ts_magnet__" placeholder="Dán magnet link hoặc .torrent URL..." /></div><div class="btn-row" style="margin-top:0;margin-bottom:14px;"><button class="__uvd_btn_primary__" id="__uvd_ts_add__">Thêm vào TorrServer</button><button class="__uvd_btn_ghost__" id="__uvd_ts_refresh__">Làm mới</button></div><div style="color:' + t.text3 + ';font-size:10px;margin-bottom:12px;">Server: <span class="__uvd_clickable__" id="__uvd_ts_edit_host__">' + escapeHtml(tsBase) + '</span></div><div id="__uvd_ts_list__"></div>';

    document.getElementById('__uvd_ts_edit_host__').addEventListener('click', function() { var v = prompt('Địa chỉ TorrServer:', tsBase); if (v) { data.torrserverUrl = v.trim(); storage.set(data); renderTorrServer(container); toast('Đã lưu', 'success'); } });
    document.getElementById('__uvd_ts_refresh__').addEventListener('click', function() { loadList(); });
    document.getElementById('__uvd_ts_add__').addEventListener('click', function() {
        var magnet = document.getElementById('__uvd_ts_magnet__').value.trim();
        if (!magnet) { toast('Nhập magnet link', 'error'); return; }
        var btn = this; btn.innerText = 'Đang thêm...'; btn.disabled = true;
        fetch(tsBase + '/torrents/add', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ link: magnet, save_to_db: true }) })
        .then(function(r) { return r.json(); }).then(function() { btn.innerText = 'Thêm vào TorrServer'; btn.disabled = false; document.getElementById('__uvd_ts_magnet__').value = ''; toast('Đã thêm', 'success'); setTimeout(loadList, 800); })
        .catch(function(err) { btn.innerText = 'Thêm vào TorrServer'; btn.disabled = false; toast('Lỗi: ' + err.message, 'error'); });
    });

    function loadList() {
        var listEl = document.getElementById('__uvd_ts_list__');
        listEl.innerHTML = '<div style="text-align:center;padding:16px;color:' + t.text3 + '">Đang tải...</div>';
        fetch(tsBase + '/torrents', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'list' }) })
        .then(function(r) { return r.json(); }).then(function(list) {
            if (!list || !list.length) { listEl.innerHTML = '<div class="__uvd_empty__"><div class="__uvd_empty_icon__">🧲</div><div class="__uvd_empty_text__">Chưa có torrent nào</div></div>'; return; }
            var html = '';
            list.forEach(function(tor) {
                html += '<div class="__uvd_ts_torrent_card__"><div style="font-weight:700;margin-bottom:4px;">' + escapeHtml(tor.title || tor.name) + '</div><div style="font-size:10px;color:' + t.text3 + ';margin-bottom:8px;">' + escapeHtml(tor.hash) + '</div><div class="btn-row" style="margin-top:0;"><button class="__uvd_btn_danger__" onclick="if(confirm(\'Xóa?\')){fetch(\'' + tsBase + '/torrents\',{method:\'POST\',headers:{\'Content-Type\':\'application/json\'},body:JSON.stringify({action:\'rem\',hash:\'' + tor.hash + '\'})}).then(()=>{toast(\'Đã xóa\');document.getElementById(\'__uvd_ts_refresh__\').click()})}">Xóa</button></div></div>';
            });
            listEl.innerHTML = html;
        }).catch(function() { listEl.innerHTML = '<div class="__uvd_empty__"><div class="__uvd_empty_icon__">⚠️</div><div class="__uvd_empty_text__">Không kết nối được TorrServer</div></div>'; });
    }
    loadList();
}

// --- SETTINGS TAB ---
function renderSettings(container) {
    var t = getTheme();
    var html = '<div class="__uvd_settings_section__"><div class="__uvd_settings_title__"><span class="__uvd_accent_inline__"></span>Theme</div><div class="__uvd_theme_grid__">';
    Object.keys(themes).forEach(function(key) { html += '<button class="__uvd_theme_btn__' + (data.theme === key ? ' active' : '') + '" data-theme="' + key + '">' + themes[key].name + '</button>'; });
    html += '</div></div>';
    html += '<div class="__uvd_settings_section__"><div class="__uvd_settings_title__"><span class="__uvd_accent_inline__"></span>Site Profiles (' + Object.keys(data.siteProfiles).length + ')</div>';
    var profiles = Object.keys(data.siteProfiles);
    if (!profiles.length) html += '<div style="color:' + t.text3 + ';font-size:10px;">Chưa có profile.</div>';
    else profiles.forEach(function(p) { html += '<div class="__uvd_profile_card__"><div style="color:' + t.primary + ';font-weight:700;">' + p + '</div><div style="font-size:10px;color:' + t.text2 + ';word-break:break-all;">' + escapeHtml(data.siteProfiles[p].referer) + '</div><button class="__uvd_btn_danger__" style="padding:4px 10px;font-size:10px;margin-top:6px;" onclick="delete data.siteProfiles[\'' + p + '\'];localStorage.setItem(\'' + STORAGE_KEY + '\',JSON.stringify(data));renderTab(\'settings\');toast(\'Đã xóa\')">Xóa</button></div>'; });
    html += '</div>';
    html += '<div class="__uvd_settings_section__"><div class="__uvd_settings_title__"><span class="__uvd_accent_inline__"></span>Backup & Restore</div><div style="display:flex;gap:8px;"><button class="__uvd_btn_primary__" id="__uvd_backup__">Export</button><button class="__uvd_btn-primary__" id="__uvd_restore__" style="background:linear-gradient(135deg,' + t.accent + ',' + t.primary + ')">Import</button><button class="__uvd_btn_danger__" id="__uvd_reset__">Reset</button></div></div>';
    html += '<div class="__uvd_settings_section__"><div class="__uvd_settings_title__"><span class="__uvd_accent_inline__"></span>Thông tin</div><div style="color:' + t.text2 + ';font-size:10px;line-height:1.7;"><div>Version: 3.8 Optimized</div><div>Total streams: ' + urls.size + '</div></div></div>';
    container.innerHTML = html;

    container.addEventListener('click', function(e) {
        var themeBtn = e.target.closest('.__uvd_theme_btn__');
        if (themeBtn) { data.theme = themeBtn.dataset.theme; storage.set(data); buildUI(); toast('Theme: ' + themes[data.theme].name, 'success'); }
    });
    document.getElementById('__uvd_backup__').addEventListener('click', function() { var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }); var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'uvd_backup_' + Date.now() + '.json'; a.click(); toast('Đã export', 'success'); });
    document.getElementById('__uvd_restore__').addEventListener('click', function() { var input = document.createElement('input'); input.type = 'file'; input.accept = '.json'; input.onchange = function(e) { var reader = new FileReader(); reader.onload = function(ev) { try { data = Object.assign(data, JSON.parse(ev.target.result)); storage.set(data); toast('Đã import', 'success'); buildUI(); } catch(err) { toast('File lỗi', 'error'); } }; reader.readAsText(e.target.files[0]); }; input.click(); });
    document.getElementById('__uvd_reset__').addEventListener('click', function() { if (confirm('XÓA TOÀN BỘ settings?')) { localStorage.removeItem(STORAGE_KEY); location.reload(); } });
}

// --- AUTO REFRESH BADGES ---
function startAutoRefresh() {
    var lastCount = urls.size;
    setInterval(function() {
        if (!document.getElementById('__uvd__')) return;
        if (urls.size !== lastCount) {
            lastCount = urls.size;
            var videoCount = [...urls.values()].filter(u => u.category === 'video').length;
            var scriptCount = [...urls.values()].filter(u => u.category === 'script').length;
            document.querySelectorAll('.__uvd_tab__').forEach(function(tab) {
                var badge = tab.querySelector('.__uvd_badge__');
                if (!badge) return;
                if (tab.dataset.tab === 'video') badge.innerText = videoCount;
                else if (tab.dataset.tab === 'script') badge.innerText = scriptCount;
            });
            if (document.querySelector('.__uvd_tab__.active').dataset.tab === currentTab) renderTab(currentTab);
        }
    }, 2500);
}

// --- INIT ---
buildUI();
startAutoRefresh();
console.log('✅ Universal DL V3.8 loaded! Found', urls.size, 'streams');
toast('V3.8 Ready! (Optimized + PiP + Speed)', 'success');

})();