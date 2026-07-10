// ==UserScript==
// @name         Universal Video Downloader V3.8 — Full Features & Premium UI
// @namespace    http://tampermonkey.net/
// @version      3.8
// @description  Bảo toàn 100% tính năng gốc, giao diện Glassmorphism siêu mượt, tối ưu cảm ứng, hỗ trợ TorrServer
// @author       nguyenquocngu93 & Gemini
// @match        *://*/*
// @grant        none
// ==/UserScript==

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
    
    var allPatterns = videoPatterns.concat(photoPatterns);
    
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
            findUrls(doc.documentElement.outerHTML, src + ':html');
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
        toast('Đã quét lại: ' + urls.size + ' định dạng', 'success');
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
            'yt-dlp-hq': { label: 'yt-dlp HQ (Gộp Audio/Video)', cmd: 'yt-dlp --referer "' + ref + '" -f "bv*+ba/best" --merge-output-format mp4 --embed-thumbnail --add-metadata -o "' + t + '.%(ext)s" "' + url + '"' },
            'yt-dlp-aria': { label: 'yt-dlp +aria2 (Tải đa luồng siêu tốc)', cmd: 'yt-dlp --referer "' + ref + '" --downloader aria2c --downloader-args "aria2c:-x 16 -s 16 -k 1M" --concurrent-fragments 8 -o "' + t + '.%(ext)s" "' + url + '"' },
            'ffmpeg': { label: 'FFmpeg (Chuyển đổi M3U8 trực tiếp)', cmd: 'ffmpeg -headers "Referer: ' + ref + '\\r\\nOrigin: ' + origin + '\\r\\nUser-Agent: ' + ua + '" -i "' + url + '" -c copy -bsf:a aac_adtstoasc "' + t + '.mp4"' },
            'aria2': { label: 'Aria2c câu lệnh thẳng', cmd: 'aria2c --referer="' + ref + '" -x 16 -s 16 -o "' + t + '.' + ext + '" "' + url + '"' }
        };
    }
    
    var themes = {
        'glass-dark': {
            name: 'Glass Dark',
            meshBg: 'radial-gradient(at 10% 10%, rgba(124, 108, 255, 0.2) 0%, transparent 55%), radial-gradient(at 90% 90%, rgba(0, 229, 255, 0.15) 0%, transparent 55%)',
            bg: 'rgba(13, 13, 23, 0.78)',
            bg2: 'rgba(22, 22, 38, 0.65)',
            bg3: 'rgba(32, 32, 54, 0.5)',
            glass: 'rgba(255, 255, 255, 0.03)',
            glassBorder: 'rgba(255, 255, 255, 0.08)',
            text: '#ffffff', text2: '#cbd5e1', text3: '#64748b',
            primary: '#6366f1', primaryGlow: 'rgba(99, 102, 241, 0.4)',
            accent: '#06b6d4', accentGlow: 'rgba(6, 182, 212, 0.4)',
            danger: '#ef4444', success: '#22c55e', warning: '#f59e0b'
        },
        'glass-purple': {
            name: 'Glass Purple',
            meshBg: 'radial-gradient(at 15% 20%, rgba(168, 85, 247, 0.25) 0%, transparent 60%), radial-gradient(at 85% 80%, rgba(236, 72, 153, 0.18) 0%, transparent 60%)',
            bg: 'rgba(18, 10, 36, 0.8)',
            bg2: 'rgba(30, 16, 58, 0.65)',
            bg3: 'rgba(48, 24, 90, 0.5)',
            glass: 'rgba(255, 255, 255, 0.04)',
            glassBorder: 'rgba(255, 255, 255, 0.09)',
            text: '#ffffff', text2: '#e9d5ff', text3: '#a855f7',
            primary: '#a855f7', primaryGlow: 'rgba(168, 85, 247, 0.5)',
            accent: '#f472b6', accentGlow: 'rgba(244, 114, 182, 0.5)',
            danger: '#f43f5e', success: '#10b981', warning: '#fbbf24'
        },
        'glass-cyber': {
            name: 'Glass Cyber',
            meshBg: 'radial-gradient(at 20% 20%, rgba(255, 0, 128, 0.2) 0%, transparent 50%), radial-gradient(at 80% 80%, rgba(0, 240, 255, 0.18) 0%, transparent 50%)',
            bg: 'rgba(10, 6, 18, 0.85)',
            bg2: 'rgba(20, 10, 34, 0.72)',
            bg3: 'rgba(36, 14, 62, 0.55)',
            glass: 'rgba(255, 0, 128, 0.05)',
            glassBorder: 'rgba(255, 0, 128, 0.18)',
            text: '#ffffff', text2: '#ffb3d9', text3: '#94a3b8',
            primary: '#ff007f', primaryGlow: 'rgba(255, 0, 127, 0.5)',
            accent: '#00f0ff', accentGlow: 'rgba(0, 240, 255, 0.5)',
            danger: '#ff3366', success: '#00ffcc', warning: '#ffcc00'
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
        el.style.cssText = 'position:fixed;top:24px;left:50%;transform:translateX(-50%);background:' + color + ';color:#fff;padding:10px 22px;border-radius:24px;z-index:2147483649;font:bold 12px -apple-system,BlinkMacSystemFont,sans-serif;box-shadow:0 8px 32px ' + color + '40;opacity:0;transition:all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);pointer-events:none;';
        document.body.appendChild(el);
        requestAnimationFrame(function() { el.style.opacity = '1'; el.style.top = '30px'; });
        setTimeout(function() {
            el.style.opacity = '0'; el.style.top = '20px';
            setTimeout(function() { el.remove(); }, 300);
        }, 2000);
    }
    
    function shareUrl(url) {
        if (navigator.share) {
            navigator.share({ title: pageInfo.title, text: pageInfo.title, url: url })
            .catch(function(err) {
                if (err.name !== 'AbortError') { copy(url); toast('Đã copy URL'); }
            });
        } else { copy(url); toast('Đã copy link tải!', 'info'); }
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
        if (idx >= 0) { data.favorites.splice(idx, 1); toast('Đã xóa khỏi danh sách Yêu thích', 'info'); }
        else {
            data.favorites.unshift({ url: url, type: type, title: pageInfo.title, host: pageInfo.host, timestamp: Date.now() });
            toast('Đã lưu vào mục Yêu thích', 'success');
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
        toast('Đã xuất file ' + format.toUpperCase(), 'success');
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
        
        panel.innerHTML = 
            '<div class="__uvd_mesh_bg__"></div>' +
            '<div class="__uvd_noise_overlay__"></div>' +
            '<div class="__uvd_header__">' +
                '<div class="__uvd_header_left__">' +
                    '<div class="__uvd_header_text__">' +
                        '<div class="__uvd_title__"><span class="__uvd_accent_inline__"></span>Universal Downloader <span class="__uvd_version__">V3.8</span></div>' +
                        '<div class="__uvd_subtitle__">' +
                            '<span class="__uvd_live_dot__"></span> Phát hiện: ' + videoCount + ' phim · ' + photoCount + ' ảnh · ' + scriptCount + ' mã nguồn' +
                        '</div>' +
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
                    '<input type="text" class="__uvd_search_input__" id="__uvd_search__" placeholder="Tìm nhanh URL, định dạng..." />' +
                    '<select class="__uvd_sort_select__" id="__uvd_sort__">' +
                        '<option value="priority">Ưu tiên</option>' +
                        '<option value="time">Mới nhất</option>' +
                        '<option value="type">Định dạng</option>' +
                    '</select>' +
                '</div>' +
                
                '<div class="__uvd_tabs__">' +
                    '<button class="__uvd_tab__ active" data-tab="video">Videos <span class="__uvd_badge__">' + videoCount + '</span></button>' +
                    '<button class="__uvd_tab__" data-tab="photo">Photos <span class="__uvd_badge__">' + photoCount + '</span></button>' +
                    '<button class="__uvd_tab__" data-tab="script">Scripts <span class="__uvd_badge__">' + scriptCount + '</span></button>' +
                    '<button class="__uvd_tab__" data-tab="torrserver">TorrServer</button>' +
                    '<button class="__uvd_tab__" data-tab="favorites">Yêu thích <span class="__uvd_badge__">' + data.favorites.length + '</span></button>' +
                    '<button class="__uvd_tab__" data-tab="history">Lịch sử</button>' +
                    '<button class="__uvd_tab__" data-tab="settings">Cài đặt</button>' +
                '</div>' +
                
                '<div class="__uvd_info_bar__">' +
                    '<div class="__uvd_info_row__">' +
                        '<span class="__uvd_info_label__">Tiêu đề:</span>' +
                        '<span class="__uvd_info_value__ __uvd_clickable__" id="__uvd_edit_title__">' + escapeHtml(pageInfo.title) + ' ✏️</span>' +
                    '</div>' +
                    '<div class="__uvd_info_row__">' +
                        '<span class="__uvd_info_label__">Referer:</span>' +
                        '<span class="__uvd_info_value__ __uvd_clickable__ __uvd_mono__" id="__uvd_edit_referer__">' + escapeHtml(pageInfo.referer) + '</span>' +
                    '</div>' +
                '</div>' +
                
                '<div class="__uvd_content__" id="__uvd_content__"></div>' +
                
                '<div class="__uvd_footer__">' +
                    '<button class="__uvd_footer_btn__" id="__uvd_batch_copy__">Sao chép hết</button>' +
                    '<button class="__uvd_footer_btn__" id="__uvd_export_txt__">Xuất TXT</button>' +
                    '<button class="__uvd_footer_btn__" id="__uvd_export_json__">Xuất JSON</button>' +
                    '<button class="__uvd_footer_btn__" id="__uvd_export_m3u__">Xuất M3U</button>' +
                '</div>' +
            '</div>';
        
        document.body.appendChild(panel);
        bindGlobalEvents();
        renderTab(currentTab);
    }
    
    function getGlobalCSS(t) {
        return `
        @keyframes uvdPulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.3; transform: scale(0.9); } }
        @keyframes uvdFadeIn { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes uvdSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        
        .__uvd_panel__ {
            position: fixed; top: 12px; right: 12px; bottom: 12px; width: 440px;
            background: ${t.bg};
            backdrop-filter: blur(32px) saturate(200%);
            -webkit-backdrop-filter: blur(32px) saturate(200%);
            z-index: 2147483647;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            font-size: 13px; color: ${t.text};
            display: flex; flex-direction: column; overflow: hidden;
            border-radius: 24px;
            border: 1px solid ${t.glassBorder};
            box-shadow: 0 24px 64px rgba(0,0,0,0.5), inset 0 1px 1px rgba(255,255,255,0.1);
            transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
        }
        @media (max-width: 480px) {
            .__uvd_panel__ { top: 0; right: 0; bottom: 0; left: 0; width: 100%; border-radius: 0; border: none; }
        }
        .__uvd_panel__.minimized { height: 72px !important; bottom: auto !important; width: 320px; }
        .__uvd_panel__.minimized .__uvd_body__ { display: none; }
        .__uvd_panel__.minimized .__uvd_header__ { border-bottom: none; height: 100%; }
        
        .__uvd_mesh_bg__ { position: absolute; inset: 0; z-index: -2; background: ${t.meshBg}; pointer-events: none; }
        .__uvd_noise_overlay__ {
            position: absolute; inset: 0; z-index: -1; opacity: 0.02; pointer-events: none;
            background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
        }
        
        .__uvd_panel__ * { box-sizing: border-box; }
        .__uvd_panel__ ::-webkit-scrollbar { width: 5px; height: 5px; }
        .__uvd_panel__ ::-webkit-scrollbar-track { background: transparent; }
        .__uvd_panel__ ::-webkit-scrollbar-thumb { background: ${t.glassBorder}; border-radius: 10px; }
        .__uvd_panel__ ::-webkit-scrollbar-thumb:hover { background: ${t.primary}; }
        
        .__uvd_accent_inline__ {
            display: inline-block; width: 4px; height: 16px; vertical-align: middle; margin-right: 8px;
            background: linear-gradient(to bottom, ${t.primary}, ${t.accent}); border-radius: 2px;
        }
        
        .__uvd_header__ {
            background: ${t.bg2}; padding: 16px 20px; display: flex; justify-content: space-between; align-items: center;
            border-bottom: 1px solid ${t.glassBorder}; flex-shrink: 0;
        }
        .__uvd_header_left__ { display: flex; align-items: center; gap: 12px; min-width: 0; flex: 1; }
        .__uvd_title__ { font-size: 15px; font-weight: 700; display: flex; align-items: center; white-space: nowrap; }
        .__uvd_version__ { font-size: 9px; background: linear-gradient(135deg, ${t.primary}, ${t.accent}); padding: 2px 6px; border-radius: 6px; margin-left: 6px; font-weight: bold; }
        .__uvd_subtitle__ { font-size: 11px; color: ${t.text2}; margin-top: 4px; display: flex; align-items: center; gap: 6px; }
        .__uvd_live_dot__ { width: 6px; height: 6px; background: ${t.success}; border-radius: 50%; display: inline-block; animation: uvdPulse 2s infinite; box-shadow: 0 0 8px ${t.success}; }
        
        .__uvd_header_right__ { display: flex; gap: 8px; }
        .__uvd_btn_icon__ {
            background: ${t.glass}; border: 1px solid ${t.glassBorder}; color: ${t.text}; width: 36px; height: 36px;
            border-radius: 12px; font-size: 14px; cursor: pointer; display: flex; align-items: center; justify-content: center;
            transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .__uvd_btn_icon__:hover { background: ${t.bg3}; border-color: ${t.primary}; transform: translateY(-1px); }
        .__uvd_btn_icon__:active { transform: scale(0.92); }
        .__uvd_btn_icon__.spinning { animation: uvdSpin 0.8s linear infinite; }
        
        .__uvd_body__ { display: flex; flex-direction: column; flex: 1; min-height: 0; }
        
        .__uvd_search_bar__ { padding: 12px 20px; display: flex; gap: 10px; background: ${t.glass}; border-bottom: 1px solid ${t.glassBorder}; }
        .__uvd_search_input__ {
            flex: 1; background: ${t.bg3}; border: 1px solid ${t.glassBorder}; color: ${t.text};
            padding: 10px 14px; border-radius: 14px; font-size: 12px; outline: none; transition: all 0.2s;
        }
        .__uvd_search_input__:focus { border-color: ${t.primary}; box-shadow: 0 0 0 3px ${t.primaryGlow}; }
        .__uvd_sort_select__ {
            background: ${t.bg3}; border: 1px solid ${t.glassBorder}; color: ${t.text};
            padding: 0 12px; border-radius: 14px; font-size: 12px; outline: none; cursor: pointer;
        }
        
        .__uvd_tabs__ { display: flex; padding: 8px 12px; gap: 6px; overflow-x: auto; border-bottom: 1px solid ${t.glassBorder}; background: ${t.bg2}; }
        .__uvd_tabs__::-webkit-scrollbar { display: none; }
        .__uvd_tab__ {
            background: transparent; border: none; color: ${t.text2}; padding: 8px 14px; border-radius: 12px;
            font-size: 12px; font-weight: 600; cursor: pointer; white-space: nowrap; display: flex; align-items: center; gap: 6px;
            transition: all 0.2s; min-height: 38px;
        }
        .__uvd_tab__:hover { background: ${t.glass}; color: ${t.text}; }
        .__uvd_tab__.active {
            background: ${t.primary}; color: #fff; box-shadow: 0 4px 12px ${t.primaryGlow};
        }
        .__uvd_badge__ { background: rgba(0,0,0,0.2); padding: 2px 6px; border-radius: 8px; font-size: 10px; font-weight: bold; }
        
        .__uvd_info_bar__ { padding: 10px 20px; background: ${t.glass}; border-bottom: 1px solid ${t.glassBorder}; font-size: 11px; }
        .__uvd_info_row__ { display: flex; gap: 8px; margin-bottom: 4px; align-items: center; }
        .__uvd_info_row__:last-child { margin-bottom: 0; }
        .__uvd_info_label__ { color: ${t.text3}; font-weight: bold; width: 55px; flex-shrink: 0; }
        .__uvd_info_value__ { color: ${t.accent}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1; }
        .__uvd_clickable__ { cursor: pointer; }
        .__uvd_clickable__:hover { text-decoration: underline; }
        .__uvd_mono__ { font-family: monospace; }
        
        .__uvd_content__ { flex: 1; overflow-y: auto; padding: 16px 20px; }
        
        .__uvd_card__ {
            background: ${t.bg2}; border: 1px solid ${t.glassBorder}; padding: 16px; margin-bottom: 12px;
            border-radius: 18px; box-shadow: 0 4px 16px rgba(0,0,0,0.15); animation: uvdFadeIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        .__uvd_card_header__ { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
        .__uvd_type_badge__ { padding: 4px 10px; border-radius: 8px; font-size: 10px; font-weight: bold; color: #fff; }
        .__uvd_card_meta__ { display: flex; align-items: center; gap: 8px; min-width: 0; }
        .__uvd_source__ { color: ${t.text3}; font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 140px; }
        .__uvd_fav_btn__ { background: transparent; border: none; font-size: 16px; cursor: pointer; padding: 2px; transition: transform 0.2s; }
        .__uvd_fav_btn__:hover { transform: scale(1.2); }
        
        .__uvd_url_box__ {
            background: ${t.bg3}; border: 1px solid ${t.glassBorder}; padding: 10px; border-radius: 10px;
            font-family: monospace; font-size: 11px; color: ${t.text2}; word-break: break-all;
            max-height: 60px; overflow-y: auto; margin-bottom: 12px; line-height: 1.4;
        }
        
        .__uvd_actions__ { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; }
        .__uvd_actions__.single { grid-template-columns: 1fr; }
        .__uvd_act_btn__ {
            border: none; padding: 12px 8px; border-radius: 12px; font-size: 12px; font-weight: 600;
            cursor: pointer; color: #fff; display: flex; align-items: center; justify-content: center; gap: 6px;
            transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1); min-height: 44px; /* Chuẩn Sensor Target size */
        }
        .__uvd_act_btn__:active { transform: scale(0.95); opacity: 0.85; }
        .__uvd_act_btn__.full { grid-column: 1 / -1; }
        
        .__uvd_btn_share__ { background: linear-gradient(135deg, #ec4899, #be185d); }
        .__uvd_btn_copy__ { background: linear-gradient(135deg, ${t.primary}, ${t.accent}); }
        .__uvd_btn_preview__ { background: linear-gradient(135deg, #0ea5e9, #0369a1); }
        .__uvd_btn_quality__ { background: linear-gradient(135deg, #8b5cf6, #6d28d9); }
        .__uvd_btn_cmd__ { background: linear-gradient(135deg, #f59e0b, #d97706); }
        .__uvd_btn_download__ { background: linear-gradient(135deg, ${t.success}, #15803d); }
        
        .__uvd_footer__ { padding: 12px 16px; display: flex; gap: 6px; background: ${t.bg2}; border-top: 1px solid ${t.glassBorder}; flex-shrink: 0; }
        .__uvd_footer_btn__ {
            flex: 1; background: ${t.glass}; border: 1px solid ${t.glassBorder}; color: ${t.text};
            padding: 10px; border-radius: 12px; font-size: 12px; font-weight: 600; cursor: pointer; transition: all 0.2s;
            min-height: 40px; text-align: center; white-space: nowrap;
        }
        .__uvd_footer_btn__:hover { background: ${t.bg3}; border-color: ${t.primary}; }
        
        .__uvd_empty__ { text-align: center; padding: 40px 20px; color: ${t.text3}; }
        .__uvd_empty_icon__ { font-size: 36px; margin-bottom: 8px; }
        
        .__uvd_photo_thumb_wrap__ { border-radius: 12px; overflow: hidden; margin-bottom: 12px; border: 1px solid ${t.glassBorder}; background: #000; cursor: pointer; }
        .__uvd_photo_thumb_wrap__ img { width: 100%; max-height: 160px; object-fit: cover; display: block; transition: transform 0.3s; }
        .__uvd_photo_thumb_wrap__:hover img { transform: scale(1.04); }
        
        /* Giao diện cài đặt & form */
        .__uvd_form_group__ { margin-bottom: 14px; }
        .__uvd_form_label__ { display: block; font-weight: bold; margin-bottom: 6px; font-size: 12px; color: ${t.text2}; }
        .__uvd_input_text__ {
            width: 100%; background: ${t.bg3}; border: 1px solid ${t.glassBorder}; color: ${t.text};
            padding: 10px 14px; border-radius: 12px; outline: none; font-size: 13px;
        }
        .__uvd_input_text__:focus { border-color: ${t.accent}; }
        .__uvd_theme_grid__ { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; margin-top: 8px; }
        .__uvd_theme_card__ {
            padding: 12px; border-radius: 12px; border: 2px solid ${t.glassBorder}; background: ${t.bg3};
            text-align: center; cursor: pointer; font-weight: 600; transition: all 0.2s; font-size: 12px;
        }
        .__uvd_theme_card__.active { border-color: ${t.primary}; background: ${t.primary}15; color: ${t.primary}; }
        
        /* Overlay phân giải / Command picker */
        .__uvd_overlay__ {
            position: fixed; inset: 0; background: rgba(5, 5, 10, 0.85); backdrop-filter: blur(16px);
            z-index: 2147483648; display: flex; align-items: center; justify-content: center; padding: 16px;
        }
        .__uvd_overlay_box__ {
            background: ${t.bg}; border: 1px solid ${t.glassBorder}; border-radius: 24px; padding: 20px;
            width: 100%; max-width: 460px; max-height: 85vh; overflow-y: auto; box-shadow: 0 20px 50px rgba(0,0,0,0.6);
        }
        .__uvd_overlay_title__ { font-size: 16px; font-weight: 700; margin-bottom: 16px; display: flex; align-items: center; color: ${t.primary}; }
        
        /* Preview Player */
        .__uvd_preview_overlay__ { position: fixed; inset: 0; background: #000; z-index: 2147483648; display: flex; flex-direction: column; }
        .__uvd_preview_header__ {
            position: absolute; top: 0; left: 0; right: 0; z-index: 10; padding: 16px;
            background: linear-gradient(to bottom, rgba(0,0,0,0.8), transparent);
            display: flex; justify-content: space-between; align-items: center; transition: opacity 0.3s;
        }
        .__uvd_preview_title__ { color: #fff; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1; margin-right: 12px; }
        .__uvd_preview_close__ { background: rgba(255,255,255,0.2); border: none; color: #fff; width: 36px; height: 36px; border-radius: 50%; font-size: 16px; cursor: pointer; display: flex; align-items: center; justify-content: center; }
        .__uvd_preview_video_wrap__ { flex: 1; display: flex; align-items: center; justify-content: center; position: relative; }
        .__uvd_preview_video__ { width: 100%; height: 100%; max-height: 100vh; object-fit: contain; }
        `;
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
                this.innerText = '🗖';
            } else {
                panel.classList.remove('minimized');
                this.innerText = '─';
            }
        });
        
        document.getElementById('__uvd_edit_title__').addEventListener('click', function() {
            var newTitle = prompt('Nhập tên file lưu trữ:', pageInfo.title);
            if (newTitle) {
                pageInfo.title = newTitle.trim();
                this.innerText = pageInfo.title + ' ✏️';
                toast('Đã cập nhật tiêu đề', 'success');
            }
        });
        
        document.getElementById('__uvd_batch_copy__').addEventListener('click', function() {
            var currentItems = document.querySelectorAll('.__uvd_url_box__');
            var listUrls = [];
            currentItems.forEach(function(div) { listUrls.push(div.innerText); });
            if (listUrls.length === 0) { toast('Không có URL nào hiển thị', 'warning'); return; }
            copy(listUrls.join('\n'));
            toast('Đã copy ' + listUrls.length + ' liên kết đang hiển thị', 'success');
        });
        
        document.getElementById('__uvd_export_txt__').addEventListener('click', function() { exportData('txt'); });
        document.getElementById('__uvd_export_json__').addEventListener('click', function() { exportData('json'); });
        document.getElementById('__uvd_export_m3u__').addEventListener('click', function() { exportData('m3u'); });
    }
    
    function renderTab(tabId) {
        var content = document.getElementById('__uvd_content__');
        if (!content) return;
        content.innerHTML = '';
        
        if (['video', 'photo', 'script'].indexOf(tabId) >= 0) {
            renderCategory(content, tabId);
        } else if (tabId === 'torrserver') {
            renderTorrServer(content);
        } else if (tabId === 'favorites') {
            renderFavorites(content);
        } else if (tabId === 'history') {
            renderHistory(content);
        } else if (tabId === 'settings') {
            renderSettings(content);
        }
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
        var items = getSortedFilteredItems(category);
        if (!items.length) {
            container.innerHTML = '<div class="__uvd_empty__"><div class="__uvd_empty_icon__">🔍</div><div>Không tìm thấy mục nào trùng khớp</div></div>';
            return;
        }
        
        var typeColors = { 'M3U8': '#10b981', 'MP4': '#f59e0b', 'IFRAME': '#3b82f6', 'JPG': '#ec4899', 'PNG': '#a855f7' };
        
        items.forEach(function(item, idx) {
            var card = document.createElement('div');
            card.className = '__uvd_card__';
            var color = typeColors[item.type] || '#64748b';
            var fav = isFavorite(item.url);
            
            var html = `
                <div class="__uvd_card_header__">
                    <span class="__uvd_type_badge__" style="background:${color}">${item.type} #${idx + 1}</span>
                    <div class="__uvd_card_meta__">
                        <span class="__uvd_source__">${escapeHtml(item.source)}</span>
                        <button class="__uvd_fav_btn__" data-url="${encodeURIComponent(item.url)}" data-type="${item.type}">${fav ? '⭐' : '☆'}</button>
                    </div>
                </div>
            `;
            
            if (category === 'photo') {
                html += `<div class="__uvd_photo_thumb_wrap__"><img src="${item.url}" loading="lazy" /></div>`;
            }
            
            html += `<div class="__uvd_url_box__">${escapeHtml(item.url)}</div>`;
            html += `<div class="__uvd_actions__">`;
            html += `<button class="__uvd_act_btn__ __uvd_btn_copy__" data-action="copy" data-url="${encodeURIComponent(item.url)}">Sao chép</button>`;
            
            if (category === 'video' && (item.type === 'M3U8' || item.type === 'MP4')) {
                html += `<button class="__uvd_act_btn__ __uvd_btn_preview__" data-action="preview" data-url="${encodeURIComponent(item.url)}" data-type="${item.type}">Xem thử</button>`;
                if (item.type === 'M3U8') {
                    html += `<button class="__uvd_act_btn__ __uvd_btn_quality__" data-action="quality" data-url="${encodeURIComponent(item.url)}">Phân dải</button>`;
                }
            }
            
            html += `<button class="__uvd_act_btn__ __uvd_btn_share__" data-action="share" data-url="${encodeURIComponent(item.url)}">Chia sẻ</button>`;
            if (category === 'video') {
                html += `<button class="__uvd_act_btn__ __uvd_btn_cmd__ full" data-action="cmd" data-url="${encodeURIComponent(item.url)}" data-type="${item.type}">Dòng lệnh CLI</button>`;
            }
            html += `</div>`;
            
            card.innerHTML = html;
            container.appendChild(card);
        });
        
        setupCardEvents(container);
    }
    
    function setupCardEvents(container) {
        container.addEventListener('click', function(e) {
            var btn = e.target.closest('button');
            if (!btn) return;
            
            var url = decodeURIComponent(btn.dataset.url);
            var action = btn.dataset.action;
            var type = btn.dataset.type;
            
            if (btn.classList.contains('__uvd_fav_btn__')) {
                var isFav = toggleFavorite(url, btn.dataset.type);
                btn.innerText = isFav ? '⭐' : '☆';
                return;
            }
            
            if (!action) return;
            addToHistory(url, type || 'Media');
            
            if (action === 'copy') { copy(url); toast('Đã sao chép liên kết!', 'success'); }
            else if (action === 'share') { shareUrl(url); }
            else if (action === 'preview') { showPreview(url, type); }
            else if (action === 'quality') { showQualityPicker(url); }
            else if (action === 'cmd') { showCommandPicker(url, type); }
        });
    }
    
    function showQualityPicker(url) {
        var overlay = document.createElement('div');
        overlay.className = '__uvd_overlay__';
        overlay.innerHTML = `<div class="__uvd_overlay_box__"><div class="__uvd_overlay_title__">Đang phân tích cấu trúc luồng...</div></div>`;
        document.body.appendChild(overlay);
        
        parseM3U8Master(url, function(qualities) {
            var box = overlay.querySelector('.__uvd_overlay_box__');
            if (!qualities) {
                box.innerHTML = `
                    <div class="__uvd_overlay_title__">Luồng đơn tốc độ</div>
                    <p style="margin-bottom:16px;color:#94a3b8;">Không tìm thấy tệp danh sách phân giải Master Playlist.</p>
                    <button class="__uvd_act_btn__ __uvd_btn_preview__ full" id="__uvd_close_overlay__">Quay lại</button>
                `;
                box.querySelector('#__uvd_close_overlay__').onclick = function() { overlay.remove(); };
                return;
            }
            
            var html = `<div class="__uvd_overlay_title__"><span class="__uvd_accent_inline__"></span>Độ phân giải khả dụng</div>`;
            qualities.forEach(function(q) {
                html += `
                    <div style="background:rgba(255,255,255,0.05); padding:12px; border-radius:14px; margin-bottom:10px; border:1px solid rgba(255,255,255,0.1);">
                        <div style="display:flex; justify-content:space-between; font-weight:bold; margin-bottom:6px;">
                            <span style="color:#6366f1;">🎬 ${q.label}</span>
                            <span style="font-size:11px; opacity:0.6;">${q.resolution}</span>
                        </div>
                        <div style="display:flex; gap:6px; margin-top:8px;">
                            <button class="__uvd_act_btn__ __uvd_btn_preview__" style="flex:1; min-height:36px; padding:4px;" data-action="play" data-url="${encodeURIComponent(q.url)}">Xem bản này</button>
                            <button class="__uvd_act_btn__ __uvd_btn_copy__" style="flex:1; min-height:36px; padding:4px;" data-action="copy" data-url="${encodeURIComponent(q.url)}">Copy Link</button>
                        </div>
                    </div>
                `;
            });
            html += `<button class="__uvd_act_btn__ __uvd_btn_share__ full" style="margin-top:10px;" id="__uvd_close_overlay__">Đóng</button>`;
            box.innerHTML = html;
            
            box.addEventListener('click', function(e) {
                var btn = e.target.closest('button');
                if (!btn || btn.id === '__uvd_close_overlay__') { if(btn) overlay.remove(); return; }
                var qUrl = decodeURIComponent(btn.dataset.url);
                if (btn.dataset.action === 'play') { overlay.remove(); showPreview(qUrl, 'M3U8'); }
                else if (btn.dataset.action === 'copy') { copy(qUrl); toast('Đã copy luồng phát chỉ định', 'success'); }
            });
        });
    }

    function showPreview(url, type) {
        var overlay = document.createElement('div');
        overlay.className = '__uvd_preview_overlay__';
        overlay.innerHTML = `
            <div class="__uvd_preview_header__">
                <div class="__uvd_preview_title__">${escapeHtml(pageInfo.title)}</div>
                <button class="__uvd_preview_close__">✕</button>
            </div>
            <div class="__uvd_preview_video_wrap__">
                <video id="__uvd_player__" class="__uvd_preview_video__" controls playsinline autoplay></video>
            </div>
        `;
        document.body.appendChild(overlay);
        
        var video = document.getElementById('__uvd_player__');
        overlay.querySelector('.__uvd_preview_close__').onclick = function() {
            video.pause();
            overlay.remove();
        };

        if (type === 'M3U8') {
            if (typeof Hls !== 'undefined' && Hls.isSupported()) {
                var hls = new Hls(); hls.loadSource(url); hls.attachMedia(video);
            } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
                video.src = url;
            } else {
                // Nhúng thư viện HLS nếu trang gốc chưa có để đảm bảo tính năng xem thử m3u8 hoạt động độc lập
                var script = document.createElement('script');
                script.src = 'https://cdn.jsdelivr.net/npm/hls.js@latest';
                script.onload = function() {
                    var hls = new Hls(); hls.loadSource(url); hls.attachMedia(video);
                };
                document.head.appendChild(script);
            }
        } else {
            video.src = url;
        }
    }

    function showCommandPicker(url, type) {
        var cmds = makeCommands(url, type, pageInfo.title);
        var overlay = document.createElement('div');
        overlay.className = '__uvd_overlay__';
        var html = `<div class="__uvd_overlay_box__"><div class="__uvd_overlay_title__">Trình xuất câu lệnh CLI</div>`;
        
        Object.keys(cmds).forEach(function(key) {
            var c = cmds[key];
            html += `
                <div style="margin-bottom:12px; background:rgba(0,0,0,0.2); padding:12px; border-radius:12px; border:1px solid rgba(255,255,255,0.05);">
                    <div style="font-weight:bold; color:#f59e0b; margin-bottom:4px;">${c.label}</div>
                    <div style="font-family:monospace; font-size:10px; background:rgba(0,0,0,0.4); padding:8px; border-radius:8px; word-break:break-all; max-height:60px; overflow-y:auto; margin-bottom:8px;">${escapeHtml(c.cmd)}</div>
                    <button class="__uvd_act_btn__ __uvd_btn_copy__ full" style="min-height:32px; padding:4px;" data-cmd="${encodeURIComponent(c.cmd)}">Sao chép dòng lệnh</button>
                </div>
            `;
        });
        
        html += `<button class="__uvd_act_btn__ __uvd_btn_share__ full" id="__uvd_close_cmd__">Quay lại</button></div>`;
        overlay.innerHTML = html;
        document.body.appendChild(overlay);
        
        overlay.addEventListener('click', function(e) {
            var btn = e.target.closest('button');
            if (!btn) return;
            if (btn.id === '__uvd_close_cmd__') { overlay.remove(); return; }
            if (btn.dataset.cmd) {
                copy(decodeURIComponent(btn.dataset.cmd));
                toast('Đã copy câu lệnh CLI thành công!', 'success');
            }
        });
    }
    
    function renderTorrServer(container) {
        container.innerHTML = `
            <div class="__uvd_form_group__">
                <label class="__uvd_form_label__">Địa chỉ TorrServer kết nối:</label>
                <div style="display:flex; gap:8px;">
                    <input type="text" class="__uvd_input_text__" id="__ts_url_input__" value="${data.torrserverUrl}" />
                    <button class="__uvd_act_btn__ __uvd_btn_copy__" id="__ts_save_btn__" style="white-space:nowrap;">Lưu cấu hình</button>
                </div>
            </div>
            <div class="__uvd_form_group__">
                <label class="__uvd_form_label__">Thêm nhanh liên kết Magnet/Torrent:</label>
                <textarea class="__uvd_input_text__" id="__ts_magnet_input__" style="height:60px; font-size:11px;" placeholder="magnet:?xt=urn:btih:..."></textarea>
                <button class="__uvd_act_btn__ __uvd_btn_download__ full" style="margin-top:8px;" id="__ts_add_btn__">Gửi lên TorrServer</button>
            </div>
            <div style="border-top:1px solid ${getTheme().glassBorder}; margin-top:16px; padding-top:12px;">
                <div style="font-weight:bold; margin-bottom:10px; display:flex; justify-content:space-between;">
                    <span>Danh sách Torrent hoạt động</span>
                    <button style="background:transparent; border:none; color:${getTheme().accent}; cursor:pointer;" id="__ts_refresh_list__">Làm mới 🗘</button>
                </div>
                <div id="__ts_list_container__"><p style="opacity:0.5; text-align:center;">Đang đồng bộ dữ liệu...</p></div>
            </div>
        `;
        
        var inputUrl = container.querySelector('#__ts_url_input__');
        container.querySelector('#__ts_save_btn__').onclick = function() {
            data.torrserverUrl = inputUrl.value.trim();
            storage.set(data);
            toast('Đã cập nhật hệ thống TorrServer', 'success');
            loadTorrServerList(container.querySelector('#__ts_list_container__'));
        };
        
        container.querySelector('#__ts_add_btn__').onclick = function() {
            var link = container.querySelector('#__ts_magnet_input__').value.trim();
            if (!link) { toast('Vui lòng điền nội dung liên kết', 'warning'); return; }
            
            fetch(data.torrserverUrl.replace(/\/+$/, '') + '/torrents/add', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ link: link, save_to_db: true })
            }).then(function() {
                toast('Thêm Torrent thành công!', 'success');
                container.querySelector('#__ts_magnet_input__').value = '';
                loadTorrServerList(container.querySelector('#__ts_list_container__'));
            }).catch(function() { toast('Không kết nối được TorrServer', 'error'); });
        };
        
        container.querySelector('#__ts_refresh_list__').onclick = function() {
            loadTorrServerList(container.querySelector('#__ts_list_container__'));
        };
        
        loadTorrServerList(container.querySelector('#__ts_list_container__'));
    }
    
    function loadTorrServerList(target) {
        fetch(data.torrserverUrl.replace(/\/+$/, '') + '/torrents', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'list' })
        })
        .then(function(r) { return r.json(); })
        .then(function(list) {
            if (!list || list.length === 0) { target.innerHTML = '<p style="opacity:0.5; text-align:center;">Trống không</p>'; return; }
            var html = '';
            list.forEach(function(item) {
                html += `
                    <div style="background:rgba(255,255,255,0.03); padding:10px; border-radius:12px; border:1px solid rgba(255,255,255,0.05); margin-bottom:8px;">
                        <div style="font-weight:600; font-size:12px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(item.name || 'Đang phân tích torrent...')}</div>
                        <div style="font-size:10px; color:#64748b; margin-top:4px;">Dung lượng: ${(item.size / 1024 / 1024 / 1024).toFixed(2)} GB</div>
                        <div style="display:flex; gap:6px; margin-top:8px;">
                            <button class="__uvd_act_btn__ __uvd_btn_copy__" style="flex:1; min-height:28px; padding:2px; font-size:11px;" onclick="navigator.clipboard.writeText('${data.torrserverUrl}/play/torrent/${item.hash}/1'); alert('Đã copy link stream luồng 1 sang clipboard!');">Copy Link Play</button>
                        </div>
                    </div>
                `;
            });
            target.innerHTML = html;
        })
        .catch(function() { target.innerHTML = '<p style="color:#ef4444; text-align:center;">Lỗi kết nối TorrServer</p>'; });
    }
    
    function renderFavorites(container) {
        if (!data.favorites || data.favorites.length === 0) {
            container.innerHTML = '<div class="__uvd_empty__">Danh sách yêu thích trống</div>';
            return;
        }
        data.favorites.forEach(function(item) {
            var card = document.createElement('div');
            card.className = '__uvd_card__';
            card.innerHTML = `
                <div style="display:flex; justify-content:space-between; font-weight:bold; font-size:12px;">
                    <span style="color:#f59e0b;">⭐ ${item.type || 'Media'}</span>
                    <span style="opacity:0.5; font-size:10px;">${item.host}</span>
                </div>
                <div class="__uvd_url_box__" style="margin-top:6px;">${escapeHtml(item.url)}</div>
                <button class="__uvd_act_btn__ __uvd_btn_copy__ full" style="min-height:32px;" onclick="navigator.clipboard.writeText('${item.url}'); alert('Đã copy!');">Sao chép lại</button>
            `;
            container.appendChild(card);
        });
    }
    
    function renderHistory(container) {
        if (!data.history || data.history.length === 0) {
            container.innerHTML = '<div class="__uvd_empty__">Chưa ghi nhận lịch sử thao tác</div>';
            return;
        }
        data.history.slice(0, 30).forEach(function(item) {
            var div = document.createElement('div');
            div.style.cssText = 'padding:10px; border-bottom:1px solid rgba(255,255,255,0.05); font-size:12px;';
            div.innerHTML = `
                <div style="display:flex; justify-content:space-between; opacity:0.8;">
                    <strong>[${item.type}]</strong>
                    <span style="font-size:10px; opacity:0.5;">${new Date(item.timestamp).toLocaleTimeString()}</span>
                </div>
                <div style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis; color:#06b6d4; margin-top:2px;">${escapeHtml(item.url)}</div>
            `;
            container.appendChild(div);
        });
    }
    
    function renderSettings(container) {
        container.innerHTML = `
            <div class="__uvd_form_group__">
                <label class="__uvd_form_label__">Chủ đề giao diện (Theme):</label>
                <div class="__uvd_theme_grid__">
                    <div class="__uvd_theme_card__ ${data.theme === 'glass-dark' ? 'active' : ''}" data-theme="glass-dark">Glass Dark</div>
                    <div class="__uvd_theme_card__ ${data.theme === 'glass-purple' ? 'active' : ''}" data-theme="glass-purple">Glass Purple</div>
                    <div class="__uvd_theme_card__ ${data.theme === 'glass-cyber' ? 'active' : ''}" data-theme="glass-cyber">Glass Cyber</div>
                </div>
            </div>
            <div style="margin-top:20px; border-top:1px solid rgba(255,255,255,0.1); padding-top:14px;">
                <button class="__uvd_act_btn__ __uvd_btn_share__ full" id="__clear_all_data__" style="background:#ef4444;">Xóa toàn bộ cấu hình lưu trữ</button>
            </div>
        `;
        
        container.querySelector('.__uvd_theme_grid__').onclick = function(e) {
            var target = e.target.closest('.__uvd_theme_card__');
            if (!target) return;
            data.theme = target.dataset.theme;
            storage.set(data);
            buildUI();
        };
        
        container.querySelector('#__clear_all_data__').onclick = function() {
            if (confirm('Làm sạch toàn bộ cài đặt? Trạng thái Yêu thích và Lịch sử cũng sẽ bị xóa.')) {
                localStorage.removeItem(STORAGE_KEY);
                location.reload();
            }
        };
    }
    
    setTimeout(buildUI, 800);
})();
