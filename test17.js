/**
 * Universal Video Downloader V3.1 - Glass Fixed Edition
 * - Fixed scrolling & close issues
 * - Added Preview button in Quality Picker
 * - Removed theme switcher (permanent dark glass)
 * - Improved readability & contrast
 * Author: nguyenquocngu93
 */
(function() {
    'use strict';

    // ========== INIT ==========
    var old = document.getElementById('__uvd__');
    if (old) old.remove();

    var STORAGE_KEY = 'uvd_data_v31';
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
        return {
            'yt-dlp': { label: 'yt-dlp', cmd: 'yt-dlp --referer "' + ref + '" -o "' + t + '.%(ext)s" "' + url + '"' },
            'yt-dlp-aria': { label: 'yt-dlp + aria2', cmd: 'yt-dlp --referer "' + ref + '" --downloader aria2c -o "' + t + '.%(ext)s" "' + url + '"' },
            'ffmpeg': { label: 'FFmpeg', cmd: 'ffmpeg -headers "Referer: ' + ref + '" -i "' + url + '" -c copy "' + t + '.mp4"' },
            'curl': { label: 'cURL', cmd: 'curl -H "Referer: ' + ref + '" -o "' + t + '.' + ext + '" "' + url + '"' }
        };
    }

    // ========== UTILS ==========
    function copy(text) {
        var t = document.createElement('textarea'); t.value = text; document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove();
    }

    function toast(msg, color) {
        var el = document.createElement('div');
        el.textContent = msg;
        el.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);background:' + (color || '#3b82f6') + ';color:#fff;padding:12px 24px;border-radius:30px;z-index:2147483649;font:600 13px Segoe UI;box-shadow:0 4px 15px rgba(0,0,0,0.4);animation:uvdSlide 0.3s;';
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

    // ========== PREVIEW PLAYER (custom controls) ==========
    function showPreview(url) {
        var overlay = document.createElement('div');
        overlay.className = 'uvd-overlay';
        overlay.style.overflow = 'hidden';
        overlay.innerHTML =
            '<div class="uvd-glass-panel" style="display:flex;flex-direction:column;height:100%;">' +
                '<div class="uvd-preview-header">' +
                    '<span style="font-weight:600;">▶ Preview</span>' +
                    '<button class="uvd-btn-icon uvd-close-preview">✕</button>' +
                '</div>' +
                '<div class="uvd-video-container">' +
                    '<video id="__uvd_pv__" class="uvd-video" controls crossorigin="anonymous"></video>' +
                '</div>' +
            '</div>';
        document.body.appendChild(overlay);

        var video = document.getElementById('__uvd_pv__');
        function loadSrc() {
            if (url.includes('.m3u8')) {
                if (window.Hls && Hls.isSupported()) {
                    var hls = new Hls();
                    hls.loadSource(url);
                    hls.attachMedia(video);
                } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
                    video.src = url;
                } else {
                    var s = document.createElement('script');
                    s.src = 'https://cdn.jsdelivr.net/npm/hls.js@latest';
                    s.onload = loadSrc;
                    document.head.appendChild(s);
                    return;
                }
            } else {
                video.src = url;
            }
        }
        loadSrc();

        overlay.querySelector('.uvd-close-preview').onclick = function() {
            video.pause(); video.src = ''; overlay.remove();
        };
    }

    // ========== BUILD UI ==========
    function buildUI() {
        if (document.getElementById('__uvd_css__')) document.getElementById('__uvd_css__').remove();
        var style = document.createElement('style');
        style.id = '__uvd_css__';
        style.textContent = `
            @keyframes uvdSlide{from{transform:translate(-50%,-20px);opacity:0}to{transform:translate(-50%,0);opacity:1}}
            @keyframes uvdPulse{0%,100%{opacity:1}50%{opacity:0.4}}
            :root {
                --bg: rgba(8, 12, 20, 0.92);
                --glass: rgba(20, 28, 45, 0.85);
                --border: rgba(255,255,255,0.08);
                --text: #f0f4ff;
                --text2: #a0b0cc;
                --text3: #6a7a96;
                --accent: #3b82f6;
                --accent2: #8b5cf6;
                --danger: #ef4444;
                --gold: #f59e0b;
                --card: rgba(255,255,255,0.04);
            }
            .uvd-overlay {
                position:fixed; inset:0; background:rgba(0,0,0,0.8);
                backdrop-filter:blur(16px); z-index:2147483648;
                display:flex; flex-direction:column; padding:12px;
                overflow-y:auto;
            }
            .uvd-glass-panel {
                background:var(--glass); backdrop-filter:blur(28px);
                border:1px solid var(--border); border-radius:20px;
                box-shadow:0 12px 40px rgba(0,0,0,0.6);
                color:var(--text); font-family:'Segoe UI',system-ui,sans-serif;
                padding:16px;
            }
            .uvd-scroll::-webkit-scrollbar{width:4px}
            .uvd-scroll::-webkit-scrollbar-thumb{background:var(--accent);border-radius:4px}
            .uvd-scroll::-webkit-scrollbar-track{background:transparent}
            .uvd-btn {
                background:rgba(255,255,255,0.08); border:1px solid rgba(255,255,255,0.12);
                color:var(--text); padding:8px 12px; border-radius:30px;
                font-weight:600; font-size:13px; cursor:pointer; transition:0.2s;
                backdrop-filter:blur(8px); text-align:center;
            }
            .uvd-btn:hover { background:rgba(255,255,255,0.18); }
            .uvd-btn-icon {
                background:transparent; border:none; color:var(--text);
                width:34px; height:34px; border-radius:50%; display:flex; align-items:center;
                justify-content:center; cursor:pointer; font-size:18px;
            }
            .uvd-btn-icon:hover { background:rgba(255,255,255,0.1); }
            .uvd-preview-header { display:flex; justify-content:space-between; align-items:center; padding-bottom:12px; border-bottom:1px solid var(--border); margin-bottom:12px; }
            .uvd-video-container { flex:1; display:flex; align-items:center; justify-content:center; background:#000; border-radius:12px; overflow:hidden; }
            .uvd-video { width:100%; max-height:70vh; background:#000; outline:none; }
            .uvd-card {
                background:var(--card); border:1px solid var(--border);
                border-radius:14px; padding:14px; margin-bottom:10px;
            }
            .uvd-type-badge {
                display:inline-block; padding:4px 12px; border-radius:20px;
                font-size:11px; font-weight:700; background:rgba(59,130,246,0.15);
                color:var(--accent); border:1px solid rgba(59,130,246,0.3);
            }
            .uvd-url-box {
                background:rgba(0,0,0,0.4); border-radius:8px; padding:8px;
                font-family:monospace; font-size:11px; word-break:break-all;
                color:var(--text2); max-height:65px; overflow-y:auto;
                border:1px solid rgba(255,255,255,0.05);
            }
            .uvd-grid-2 { display:grid; grid-template-columns:1fr 1fr; gap:8px; }
            .uvd-grid-3 { display:grid; grid-template-columns:1fr 1fr 1fr; gap:6px; }
            .uvd-tab-active { border-bottom:2px solid var(--accent)!important; color:var(--text)!important; }
            .uvd-close-overlay { position:sticky; bottom:0; background:var(--glass); padding:10px; border-top:1px solid var(--border); margin-top:12px; }
        `;
        document.head.appendChild(style);

        var arr = [...urls.entries()].map(function(e) {
            return { url: e[0], type: e[1].type, source: e[1].source, priority: e[1].priority };
        }).sort(function(a, b) { return a.priority - b.priority; });

        var panel = document.getElementById('__uvd__');
        if (panel) panel.remove();

        panel = document.createElement('div');
        panel.id = '__uvd__';
        panel.className = 'uvd-glass-panel uvd-scroll';
        panel.style.cssText = 'position:fixed;top:15px;left:15px;right:15px;bottom:15px;z-index:2147483647;display:flex;flex-direction:column;';

        // Header
        var header = document.createElement('div');
        header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding-bottom:12px;border-bottom:1px solid var(--border);margin-bottom:10px;';
        header.innerHTML = 
            '<div style="display:flex;align-items:center;gap:8px;">' +
                '<span style="width:10px;height:10px;background:var(--accent);border-radius:50%;box-shadow:0 0 12px var(--accent);animation:uvdPulse 2s infinite;"></span>' +
                '<span style="font-weight:700;font-size:16px;">Universal DL <span style="color:var(--accent);">V3.1</span></span>' +
            '</div>' +
            '<div style="display:flex;gap:6px;">' +
                '<button class="uvd-btn-icon" id="__uvd_refresh__">' +
                    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 4v6h6M23 20v-6h-6"/><path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"/></svg>' +
                '</button>' +
                '<button class="uvd-btn-icon" id="__uvd_close__">' +
                    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>' +
                '</button>' +
            '</div>';
        panel.appendChild(header);

        // Tabs
        var tabs = document.createElement('div');
        tabs.style.cssText = 'display:flex;margin-bottom:10px;';
        var tabList = [
            { id: 'streams', text: 'Streams (' + arr.length + ')' },
            { id: 'favorites', text: 'Favorites (' + data.favorites.length + ')' },
            { id: 'history', text: 'History (' + (data.history||[]).length + ')' },
            { id: 'settings', text: 'Settings' }
        ];
        tabList.forEach(function(t) {
            var b = document.createElement('button');
            b.className = 'uvd-btn';
            b.dataset.tab = t.id;
            b.textContent = t.text;
            b.style.cssText = 'flex:1;background:transparent;border:none;padding:10px 4px;font-size:12px;border-radius:0;border-bottom:2px solid transparent;';
            tabs.appendChild(b);
        });
        panel.appendChild(tabs);

        // Info
        var info = document.createElement('div');
        info.style.cssText = 'margin-bottom:10px;font-size:12px;';
        info.innerHTML = 
            '<span style="color:var(--text2);">Title: </span>' +
            '<span id="__uvd_title__" style="color:var(--accent);text-decoration:underline;cursor:pointer;">' + pageInfo.title + '</span> ' +
            '<span style="color:var(--text3);">(edit)</span><br>' +
            '<span style="color:var(--text2);">Referer: </span>' +
            '<span id="__uvd_referer__" style="color:var(--accent2);font-family:monospace;text-decoration:underline;cursor:pointer;">' + pageInfo.referer + '</span>';
        panel.appendChild(info);

        // Content
        var content = document.createElement('div');
        content.id = '__uvd_content__';
        content.className = 'uvd-scroll';
        content.style.cssText = 'flex:1;overflow-y:auto;padding-right:4px;';
        panel.appendChild(content);

        // Footer
        var footer = document.createElement('div');
        footer.style.cssText = 'display:flex;gap:6px;margin-top:10px;';
        ['TXT','JSON','M3U','CSV'].forEach(function(f) {
            var btn = document.createElement('button');
            btn.className = 'uvd-btn';
            btn.textContent = f;
            btn.style.flex = '1';
            btn.onclick = function() { exportData(f.toLowerCase()); };
            footer.appendChild(btn);
        });
        panel.appendChild(footer);
        document.body.appendChild(panel);

        // Tab rendering
        var currentTab = 'streams';
        function renderTab(tabId) {
            currentTab = tabId;
            document.querySelectorAll('[data-tab]').forEach(function(t) {
                t.classList.toggle('uvd-tab-active', t.dataset.tab === tabId);
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

        // Events
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
    }

    function renderStreams(container, arr) {
        if (!arr.length) {
            container.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text2);">No streams detected.<br><small>Play video or load more content.</small></div>';
            return;
        }
        arr.forEach(function(item, i) {
            var card = document.createElement('div');
            card.className = 'uvd-card';
            var fav = isFavorite(item.url);
            card.innerHTML = 
                '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">' +
                    '<span class="uvd-type-badge">#' + (i+1) + ' ' + item.type + '</span>' +
                    '<div style="display:flex;align-items:center;gap:8px;">' +
                        '<span style="font-size:10px;color:var(--text3);">' + item.source + '</span>' +
                        '<button class="uvd-fav-btn" data-url="' + encodeURIComponent(item.url) + '" data-type="' + item.type + '" style="background:none;border:none;font-size:18px;cursor:pointer;color:' + (fav ? 'var(--gold)' : 'var(--text3)') + ';">' + (fav ? '★' : '☆') + '</button>' +
                    '</div>' +
                '</div>' +
                '<div class="uvd-url-box">' + item.url + '</div>' +
                '<div class="uvd-grid-2" style="margin-top:8px;">' +
                    '<button class="uvd-btn" data-action="share" data-url="' + encodeURIComponent(item.url) + '" style="background:var(--accent2);">Share</button>' +
                    '<button class="uvd-btn" data-action="copy" data-url="' + encodeURIComponent(item.url) + '">Copy</button>' +
                    (item.type === 'IFRAME' ? 
                        '<a href="' + item.url + '" class="uvd-btn" style="text-align:center;grid-column:1/3;">➔ Open iframe</a>' :
                        (item.type === 'M3U8' ?
                            '<button class="uvd-btn" data-action="quality" data-url="' + encodeURIComponent(item.url) + '">Quality</button>' +
                            '<button class="uvd-btn" data-action="preview" data-url="' + encodeURIComponent(item.url) + '">Preview</button>' +
                            '<button class="uvd-btn" data-action="cmd" data-url="' + encodeURIComponent(item.url) + '" data-type="' + item.type + '" style="grid-column:1/3;">All commands</button>' :
                            '<button class="uvd-btn" data-action="preview" data-url="' + encodeURIComponent(item.url) + '">Preview</button>' +
                            '<button class="uvd-btn" data-action="cmd" data-url="' + encodeURIComponent(item.url) + '" data-type="' + item.type + '">Commands</button>'
                        )
                    ) +
                '</div>';
            container.appendChild(card);
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
                else if (action === 'preview') showPreview(u);
                else if (action === 'cmd') showCommandPicker(u, t);
            };
        });
    }

    function showCommandPicker(url, type) {
        var cmds = makeCommands(url, type, pageInfo.title);
        var overlay = document.createElement('div');
        overlay.className = 'uvd-overlay';
        var html = '<div class="uvd-glass-panel" style="max-width:600px;width:100%;margin:auto;display:flex;flex-direction:column;max-height:80vh;">';
        html += '<div style="font-weight:700;margin-bottom:12px;">Select command</div>';
        html += '<div style="overflow-y:auto;flex:1;">';
        Object.keys(cmds).forEach(function(k) {
            var c = cmds[k];
            html += '<div class="uvd-card">' +
                '<div style="font-weight:600;color:var(--accent);">' + c.label + '</div>' +
                '<div class="uvd-url-box" style="margin:6px 0;">' + c.cmd + '</div>' +
                '<button class="uvd-btn cmd-select" data-cmd="' + encodeURIComponent(c.cmd) + '" style="width:100%;">Edit & Copy</button>' +
            '</div>';
        });
        html += '</div>';
        html += '<div class="uvd-close-overlay"><button class="uvd-btn close-overlay-btn" style="width:100%;background:var(--danger);">Close</button></div></div>';
        overlay.innerHTML = html;
        document.body.appendChild(overlay);

        overlay.querySelector('.close-overlay-btn').onclick = function() { overlay.remove(); };
        overlay.querySelectorAll('.cmd-select').forEach(function(b) {
            b.onclick = function() {
                var cmd = decodeURIComponent(this.dataset.cmd);
                overlay.remove();
                showEditor(cmd);
            };
        });
    }

    function showEditor(text) {
        var overlay = document.createElement('div');
        overlay.className = 'uvd-overlay';
        overlay.innerHTML = 
            '<div class="uvd-glass-panel" style="max-width:600px;width:100%;margin:auto;">' +
                '<div style="font-weight:700;margin-bottom:8px;">Edit Command</div>' +
                '<textarea id="__uvd_edit__" style="width:100%;height:120px;background:rgba(0,0,0,0.5);border:1px solid var(--border);border-radius:10px;color:var(--text);padding:12px;font-family:monospace;resize:vertical;">' + text.replace(/</g,'&lt;') + '</textarea>' +
                '<div class="uvd-grid-2" style="margin-top:12px;">' +
                    '<button class="uvd-btn" id="__uvd_ed_copy__">Copy</button>' +
                    '<button class="uvd-btn" id="__uvd_ed_share__" style="background:var(--accent2);">Share</button>' +
                '</div>' +
                '<button class="uvd-btn close-editor" style="width:100%;margin-top:8px;background:var(--danger);">Close</button>' +
            '</div>';
        document.body.appendChild(overlay);
        document.getElementById('__uvd_ed_copy__').onclick = function() {
            copy(document.getElementById('__uvd_edit__').value);
            overlay.remove();
            toast('Copied');
        };
        document.getElementById('__uvd_ed_share__').onclick = function() {
            var val = document.getElementById('__uvd_edit__').value;
            overlay.remove();
            shareUrl(val);
        };
        overlay.querySelector('.close-editor').onclick = function() { overlay.remove(); };
    }

    function showQualityPicker(url) {
        var overlay = document.createElement('div');
        overlay.className = 'uvd-overlay';
        overlay.innerHTML = '<div class="uvd-glass-panel" style="max-width:600px;width:100%;margin:auto;text-align:center;">Analyzing M3U8...</div>';
        document.body.appendChild(overlay);

        parseM3U8Master(url, function(qualities) {
            if (!qualities) {
                overlay.innerHTML = '<div class="uvd-glass-panel" style="max-width:600px;width:100%;margin:auto;text-align:center;">' +
                    '<div style="color:var(--danger);font-weight:700;">Not a Master Playlist</div>' +
                    '<p style="color:var(--text2);">Single stream, no qualities to choose.</p>' +
                    '<button class="uvd-btn close-overlay-btn" style="margin-top:12px;background:var(--danger);width:100%;">Close</button></div>';
                overlay.querySelector('.close-overlay-btn').onclick = function() { overlay.remove(); };
                return;
            }

            var html = '<div class="uvd-glass-panel" style="max-width:600px;width:100%;margin:auto;display:flex;flex-direction:column;max-height:80vh;">';
            html += '<div style="font-weight:700;margin-bottom:12px;">Select quality (' + qualities.length + ')</div>';
            html += '<div style="overflow-y:auto;flex:1;">';
            qualities.forEach(function(q) {
                html += '<div class="uvd-card">' +
                    '<div style="display:flex;justify-content:space-between;"><b>' + q.label + '</b><span style="color:var(--text3);">' + Math.round(q.bandwidth/1000) + 'kbps</span></div>' +
                    '<div style="font-size:11px;color:var(--text3);">' + q.resolution + (q.codecs ? ' · ' + q.codecs : '') + '</div>' +
                    '<div class="uvd-grid-3" style="margin-top:8px;">' +
                        '<button class="uvd-btn q-act" data-url="' + encodeURIComponent(q.url) + '" data-action="share" style="background:var(--accent2);">Share</button>' +
                        '<button class="uvd-btn q-act" data-url="' + encodeURIComponent(q.url) + '" data-action="preview">Preview</button>' +
                        '<button class="uvd-btn q-act" data-url="' + encodeURIComponent(q.url) + '" data-action="cmd">Cmd</button>' +
                    '</div>' +
                '</div>';
            });
            html += '</div>';
            html += '<div class="uvd-close-overlay"><button class="uvd-btn close-overlay-btn" style="width:100%;background:var(--danger);">Close</button></div></div>';
            overlay.innerHTML = html;

            overlay.querySelector('.close-overlay-btn').onclick = function() { overlay.remove(); };
            overlay.querySelectorAll('.q-act').forEach(function(b) {
                b.onclick = function() {
                    var u = decodeURIComponent(this.dataset.url);
                    var action = this.dataset.action;
                    overlay.remove();
                    if (action === 'share') shareUrl(u);
                    else if (action === 'preview') showPreview(u);
                    else if (action === 'cmd') showCommandPicker(u, 'M3U8');
                };
            });
        });
    }

    function renderFavorites(container) {
        if (!data.favorites.length) {
            container.innerHTML = '<div style="text-align:center;padding:30px;color:var(--text2);">No favorites yet.</div>';
            return;
        }
        data.favorites.forEach(function(f, i) {
            var card = document.createElement('div');
            card.className = 'uvd-card';
            card.innerHTML = 
                '<div style="display:flex;justify-content:space-between;"><b style="color:var(--gold);">★ ' + f.type + '</b><span style="font-size:11px;color:var(--text3);">' + new Date(f.timestamp).toLocaleDateString() + '</span></div>' +
                '<div style="margin:4px 0;">' + f.title + '</div>' +
                '<div class="uvd-url-box" style="margin-bottom:8px;">' + f.url + '</div>' +
                '<div class="uvd-grid-3">' +
                    '<button class="uvd-btn fav-act" data-url="' + encodeURIComponent(f.url) + '" data-action="share" style="background:var(--accent2);">Share</button>' +
                    '<button class="uvd-btn fav-act" data-url="' + encodeURIComponent(f.url) + '" data-action="copy">Copy</button>' +
                    '<button class="uvd-btn fav-del" data-idx="' + i + '" style="background:var(--danger);">Del</button>' +
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
        container.innerHTML = '<button class="uvd-btn" id="__uvd_clear_hist__" style="width:100%;margin-bottom:10px;background:var(--danger);">Clear all history</button>';
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
            '<div class="uvd-card">' +
                '<div style="font-weight:600;margin-bottom:8px;">Backup</div>' +
                '<button class="uvd-btn" id="__uvd_backup__" style="width:100%;margin-bottom:6px;">Export data</button>' +
                '<button class="uvd-btn" id="__uvd_restore__" style="width:100%;margin-bottom:6px;">Import data</button>' +
                '<button class="uvd-btn" id="__uvd_reset__" style="width:100%;background:var(--danger);">Reset all</button>' +
            '</div>' +
            '<div class="uvd-card" style="margin-top:10px;font-size:12px;color:var(--text2);">' +
                'Version 3.1 · nguyenquocngu93<br>' +
                'Favorites: ' + data.favorites.length + ' · History: ' + (data.history||[]).length +
            '</div>';

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
    var lastCount = urls.size;
    var autoRefresh = setInterval(function() {
        if (!document.getElementById('__uvd__')) { clearInterval(autoRefresh); stopMonitor(); return; }
        if (urls.size !== lastCount) { lastCount = urls.size; }
    }, 2000);
    console.log('Universal DL V3.1 ready – ' + urls.size + ' streams');
    toast('V3.1 Glass Ready');
})();