/**
 * Universal Video Downloader V2 - Glass Edition
 * Features: Liquid glass UI, Video.js player, Multi-quality, Favorites, Themes, Preview,
 *           Export, Site profiles, Share to YTDLnis
 * Author: nguyenquocngu93 (upgraded)
 */
(function() {
    'use strict';
    
    // ========== INIT ==========
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
    data.theme = data.theme || 'glass';   // force glass theme
    data.siteProfiles = data.siteProfiles || {};
    data.history = data.history || [];
    
    // ========== GLASS THEME (hardcoded) ==========
    var theme = {
        bg: 'rgba(15, 20, 30, 0.75)',
        bg2: 'rgba(255, 255, 255, 0.06)',
        bg3: 'rgba(255, 255, 255, 0.10)',
        text: '#f0f0f0',
        text2: '#c0c0c0',
        text3: '#888888',
        primary: '#66ccff',
        accent: '#b39ddb',
        danger: '#ef5350',
        border: 'rgba(255,255,255,0.15)'
    };
    
    function getTheme() { return theme; }
    
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
        console.log('✅ Live monitor installed');
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
            'yt-dlp': {
                label: '🐍 yt-dlp (cơ bản)',
                cmd: 'yt-dlp --referer "' + ref + '" -o "' + t + '.%(ext)s" "' + url + '"'
            },
            'yt-dlp-hq': {
                label: '🐍 yt-dlp (chất lượng cao)',
                cmd: 'yt-dlp --referer "' + ref + '" -f "bv*+ba/best" --merge-output-format mp4 --embed-thumbnail --add-metadata -o "' + t + '.%(ext)s" "' + url + '"'
            },
            'yt-dlp-aria': {
                label: '🚀 yt-dlp + aria2 (nhanh nhất)',
                cmd: 'yt-dlp --referer "' + ref + '" --downloader aria2c --downloader-args "aria2c:-x 16 -s 16 -k 1M" --concurrent-fragments 8 -o "' + t + '.%(ext)s" "' + url + '"'
            },
            'yt-dlp-sub': {
                label: '📝 yt-dlp + phụ đề',
                cmd: 'yt-dlp --referer "' + ref + '" --write-sub --sub-langs "vi,en" --embed-subs -o "' + t + '.%(ext)s" "' + url + '"'
            },
            'ffmpeg': {
                label: '🎬 FFmpeg (M3U8 → MP4)',
                cmd: 'ffmpeg -headers "Referer: ' + ref + '\\r\\nOrigin: ' + origin + '\\r\\nUser-Agent: ' + ua + '" -i "' + url + '" -c copy -bsf:a aac_adtstoasc "' + t + '.mp4"'
            },
            'ffmpeg-audio': {
                label: '🎵 FFmpeg (chỉ audio)',
                cmd: 'ffmpeg -headers "Referer: ' + ref + '" -i "' + url + '" -vn -c:a copy "' + t + '.aac"'
            },
            'ffmpeg-cut': {
                label: '✂️ FFmpeg (cắt đoạn)',
                cmd: 'ffmpeg -headers "Referer: ' + ref + '" -ss 00:00:00 -to 00:05:00 -i "' + url + '" -c copy "' + t + '_cut.mp4"'
            },
            'curl': {
                label: '🌐 cURL',
                cmd: 'curl -H "Referer: ' + ref + '" -o "' + t + '.' + ext + '" "' + url + '"'
            },
            'aria2': {
                label: '⚡ aria2c',
                cmd: 'aria2c --referer="' + ref + '" -x 16 -s 16 -o "' + t + '.' + ext + '" "' + url + '"'
            },
            'wget': {
                label: '📥 wget',
                cmd: 'wget --referer="' + ref + '" -O "' + t + '.' + ext + '" "' + url + '"'
            }
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
        color = color || getTheme().primary;
        var t = document.createElement('div');
        t.innerText = msg;
        t.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.8);backdrop-filter:blur(10px);color:#fff;padding:12px 24px;border-radius:30px;z-index:2147483649;font:bold 14px Arial;box-shadow:0 8px 32px rgba(0,0,0,0.4);border:1px solid rgba(255,255,255,0.1);animation:uvdSlide 0.3s;';
        document.body.appendChild(t);
        setTimeout(function() { t.remove(); }, 2500);
    }
    
    function shareUrl(url) {
        if (navigator.share) {
            navigator.share({
                title: pageInfo.title,
                text: pageInfo.title,
                url: url
            }).catch(function(err) {
                if (err.name !== 'AbortError') {
                    copy(url);
                    toast('✓ Đã copy URL');
                }
            });
        } else {
            copy(url);
            toast('✓ Đã copy - Mở YTDLnis để tải');
        }
    }
    
    function addToHistory(url, type) {
        data.history = data.history || [];
        data.history.unshift({
            url: url, type: type, title: pageInfo.title,
            host: pageInfo.host, timestamp: Date.now()
        });
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
            toast('✓ Đã xóa khỏi Favorites');
        } else {
            data.favorites.unshift({
                url: url, type: type, title: pageInfo.title,
                host: pageInfo.host, timestamp: Date.now()
            });
            toast('⭐ Đã thêm vào Favorites');
        }
        storage.set(data);
        return isFavorite(url);
    }
    
    // ========== EXPORT ==========
    function exportData(format) {
        var arr = [...urls.entries()].map(function(e) {
            return { url: e[0], type: e[1].type, source: e[1].source, title: pageInfo.title };
        });
        var content, mime, filename;
        if (format === 'json') {
            content = JSON.stringify({
                page: pageInfo,
                exportDate: new Date().toISOString(),
                streams: arr
            }, null, 2);
            mime = 'application/json';
            filename = pageInfo.title + '_streams.json';
        } else if (format === 'csv') {
            content = 'Type,URL,Source,Title\n' + arr.map(function(a) {
                return a.type + ',"' + a.url + '",' + a.source + ',"' + a.title + '"';
            }).join('\n');
            mime = 'text/csv';
            filename = pageInfo.title + '_streams.csv';
        } else if (format === 'm3u') {
            content = '#EXTM3U\n' + arr.filter(function(a) {
                return a.type !== 'IFRAME';
            }).map(function(a) {
                return '#EXTINF:-1,' + a.title + ' [' + a.type + ']\n' + a.url;
            }).join('\n');
            mime = 'audio/x-mpegurl';
            filename = pageInfo.title + '.m3u';
        } else if (format === 'txt') {
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
        toast('💾 Đã export ' + format.toUpperCase());
    }
    
    // ========== LOAD VIDEO.JS ==========
    var videojsLoaded = false;
    function loadVideoJS(callback) {
        if (videojsLoaded) { callback(); return; }
        // CSS
        var css = document.createElement('link');
        css.rel = 'stylesheet';
        css.href = 'https://vjs.zencdn.net/8.16.1/video-js.css';
        document.head.appendChild(css);
        // JS
        var script = document.createElement('script');
        script.src = 'https://vjs.zencdn.net/8.16.1/video.min.js';
        script.onload = function() {
            // Load VHS plugin for HLS
            var vhs = document.createElement('script');
            vhs.src = 'https://unpkg.com/@videojs/http-streaming@3.6.0/dist/videojs-http-streaming.min.js';
            vhs.onload = function() {
                videojsLoaded = true;
                callback();
            };
            document.head.appendChild(vhs);
        };
        document.head.appendChild(script);
    }
    
    // ========== OVERLAY HELPER (Glass) ==========
    function createOverlay() {
        var overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(10,15,25,0.85);backdrop-filter:blur(24px);-webkit-backdrop-filter:blur(24px);z-index:2147483648;padding:20px;display:flex;flex-direction:column;animation:uvdFade 0.25s ease-out;';
        document.body.appendChild(overlay);
        return overlay;
    }
    
    // ========== BUILD UI ==========
    function buildUI() {
        var t = getTheme();
        var arr = [...urls.entries()].map(function(e) {
            return { url: e[0], type: e[1].type, source: e[1].source, priority: e[1].priority };
        }).sort(function(a, b) { return a.priority - b.priority; });
        
        var panel = document.getElementById('__uvd__');
        if (panel) panel.remove();
        
        panel = document.createElement('div');
        panel.id = '__uvd__';
        panel.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);width:min(95vw, 480px);height:min(90vh, 700px);background:' + t.bg + ';backdrop-filter:blur(32px);-webkit-backdrop-filter:blur(32px);border-radius:28px;color:' + t.text + ';font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;font-size:13px;display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,0.7);border:1px solid ' + t.border + ';z-index:2147483647;overflow:hidden;';
        
        // Add keyframes for animations
        var style = document.createElement('style');
        style.textContent = `
            @keyframes uvdSlide { from { transform: translateX(-50%); opacity:0; } to { transform: translateX(0); opacity:1; } }
            @keyframes uvdFade { from { opacity:0; } to { opacity:1; } }
            @keyframes uvdPulse { 0%,100%{opacity:1}50%{opacity:0.4} }
            #__uvd__ ::-webkit-scrollbar { width:4px; }
            #__uvd__ ::-webkit-scrollbar-track { background:transparent; }
            #__uvd__ ::-webkit-scrollbar-thumb { background:rgba(255,255,255,0.3); border-radius:4px; }
            .uvd-btn { background:rgba(255,255,255,0.08); color:${t.text}; border:1px solid ${t.border}; padding:8px 12px; border-radius:16px; font-size:12px; font-weight:500; cursor:pointer; transition:all 0.2s; backdrop-filter:blur(4px); }
            .uvd-btn:hover { background:rgba(255,255,255,0.15); }
            .uvd-btn-primary { background:${t.primary}; color:#0a0f1a; border-color:${t.primary}; }
            .uvd-btn-primary:hover { background:rgba(102,204,255,0.8); }
            .uvd-btn-danger { background:${t.danger}; color:#fff; border-color:${t.danger}; }
            .uvd-btn-danger:hover { background:rgba(239,83,80,0.8); }
            .uvd-card { background:rgba(255,255,255,0.05); border:1px solid ${t.border}; border-radius:16px; padding:12px 14px; margin:6px 0; backdrop-filter:blur(4px); }
            .uvd-tab { background:transparent; border:none; color:${t.text2}; padding:12px 6px; font-size:12px; font-weight:600; cursor:pointer; border-bottom:2px solid transparent; transition:all 0.2s; flex:1; text-align:center; }
            .uvd-tab.active { color:${t.text}; border-bottom-color:${t.primary}; }
        `;
        panel.appendChild(style);
        
        // Header
        var header = document.createElement('div');
        header.style.cssText = 'padding:16px 20px 10px;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid ' + t.border + ';';
        header.innerHTML = `
            <div>
                <div style="font-weight:700;font-size:18px;letter-spacing:-0.5px;color:${t.text};">⬇ Universal DL</div>
                <div style="font-size:11px;color:${t.text3};margin-top:2px;">
                    <span style="animation:uvdPulse 2s infinite;color:${t.primary};">●</span> LIVE · ${arr.length} streams · ${pageInfo.host}
                </div>
            </div>
            <div style="display:flex;gap:6px;">
                <button id="__uvd_refresh__" class="uvd-btn" style="padding:6px 10px;font-size:14px;border-radius:50%;width:36px;height:36px;display:flex;align-items:center;justify-content:center;">↻</button>
                <button id="__uvd_close__" class="uvd-btn" style="padding:6px 10px;font-size:14px;border-radius:50%;width:36px;height:36px;display:flex;align-items:center;justify-content:center;">✕</button>
            </div>
        `;
        panel.appendChild(header);
        
        // Tabs
        var tabs = document.createElement('div');
        tabs.style.cssText = 'display:flex;padding:0 16px;border-bottom:1px solid ' + t.border + ';';
        var tabList = [
            { id: 'streams', label: 'Streams' },
            { id: 'favorites', label: 'Favorites' },
            { id: 'history', label: 'History' },
            { id: 'settings', label: 'Settings' }
        ];
        tabList.forEach(function(tab) {
            var b = document.createElement('button');
            b.className = 'uvd-tab';
            b.dataset.tab = tab.id;
            b.innerText = tab.label;
            tabs.appendChild(b);
        });
        panel.appendChild(tabs);
        
        // Info bar
        var info = document.createElement('div');
        info.style.cssText = 'padding:10px 18px;border-bottom:1px solid ' + t.border + ';font-size:11px;color:' + t.text2 + ';display:flex;flex-wrap:wrap;gap:8px 14px;';
        info.innerHTML = `
            <span><span style="color:${t.primary};font-weight:600;">📄</span> <span id="__uvd_title__" style="cursor:pointer;text-decoration:underline;text-decoration-style:dotted;">${pageInfo.title}</span></span>
            <span><span style="color:${t.accent};">🔗</span> <span id="__uvd_referer__" style="cursor:pointer;text-decoration:underline;text-decoration-style:dotted;font-family:monospace;font-size:10px;">${pageInfo.referer}</span></span>
        `;
        panel.appendChild(info);
        
        // Content area
        var content = document.createElement('div');
        content.id = '__uvd_content__';
        content.style.cssText = 'flex:1;overflow-y:auto;padding:12px 16px;';
        panel.appendChild(content);
        
        // Footer
        var footer = document.createElement('div');
        footer.style.cssText = 'padding:10px 16px;border-top:1px solid ' + t.border + ';display:flex;gap:6px;flex-wrap:wrap;';
        footer.innerHTML = `
            <button class="uvd-btn" data-export="txt" style="flex:1;text-align:center;font-size:11px;">💾 TXT</button>
            <button class="uvd-btn" data-export="json" style="flex:1;text-align:center;font-size:11px;">💾 JSON</button>
            <button class="uvd-btn" data-export="m3u" style="flex:1;text-align:center;font-size:11px;">💾 M3U</button>
            <button class="uvd-btn" data-export="csv" style="flex:1;text-align:center;font-size:11px;">💾 CSV</button>
        `;
        panel.appendChild(footer);
        
        document.body.appendChild(panel);
        
        // Tab logic
        var currentTab = 'streams';
        function renderTab(tabId) {
            currentTab = tabId;
            document.querySelectorAll('.uvd-tab').forEach(function(t) {
                t.classList.toggle('active', t.dataset.tab === tabId);
            });
            content.innerHTML = '';
            if (tabId === 'streams') renderStreams(content, arr);
            else if (tabId === 'favorites') renderFavorites(content);
            else if (tabId === 'history') renderHistory(content);
            else if (tabId === 'settings') renderSettings(content);
        }
        document.querySelectorAll('.uvd-tab').forEach(function(t) {
            t.onclick = function() { renderTab(this.dataset.tab); };
        });
        
        // Bind events
        document.getElementById('__uvd_close__').onclick = function() {
            stopMonitor();
            panel.remove();
        };
        document.getElementById('__uvd_refresh__').onclick = function() {
            buildUI();
            toast('🔄 Refreshed');
        };
        document.getElementById('__uvd_title__').onclick = function() {
            var newTitle = prompt('Tên file:', pageInfo.title);
            if (newTitle) {
                pageInfo.title = newTitle.replace(/[^\w\s\u00C0-\u1EF9.-]/g, '').substring(0, 100);
                this.innerText = pageInfo.title;
            }
        };
        document.getElementById('__uvd_referer__').onclick = function() {
            var newRef = prompt('Referer:', pageInfo.referer);
            if (newRef) {
                pageInfo.referer = newRef;
                this.innerText = newRef;
                data.siteProfiles[pageInfo.host] = { referer: newRef, userAgent: pageInfo.userAgent };
                storage.set(data);
                toast('✓ Đã lưu Referer cho ' + pageInfo.host);
            }
        };
        document.querySelectorAll('[data-export]').forEach(function(b) {
            b.onclick = function() { exportData(this.dataset.export); };
        });
        
        renderTab('streams');
    }
    
    // ========== RENDER: STREAMS ==========
    function renderStreams(container, arr) {
        var t = getTheme();
        if (!arr.length) {
            container.innerHTML = '<div style="text-align:center;padding:40px 20px;color:' + t.text2 + ';">🔍 Chưa tìm thấy stream<br><small style="color:' + t.text3 + ';">Đang monitor... Bấm Play hoặc load thêm nội dung</small></div>';
            return;
        }
        var typeColors = {
            'M3U8': '#66ccff', 'MPD': '#b39ddb', 'MP4': '#ffb74d',
            'WEBM': '#ffb74d', 'MKV': '#ef5350', 'FLV': '#ef5350',
            'TS': '#ffd54f', 'IFRAME': '#81c784'
        };
        arr.forEach(function(item, i) {
            var url = item.url;
            var type = item.type;
            var color = typeColors[type] || '#888';
            var fav = isFavorite(url);
            
            var card = document.createElement('div');
            card.className = 'uvd-card';
            card.innerHTML = `
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
                    <span style="background:${color}22;color:${color};padding:2px 12px;border-radius:20px;font-size:10px;font-weight:600;border:1px solid ${color}44;">#${i+1} ${type}</span>
                    <div style="display:flex;gap:4px;align-items:center;">
                        <span style="color:${t.text3};font-size:9px;">${item.source}</span>
                        <button class="__uvd_fav__" data-url="${encodeURIComponent(url)}" data-type="${type}" style="background:transparent;border:none;font-size:16px;cursor:pointer;color:${fav ? '#fdd835' : t.text3};">${fav ? '⭐' : '☆'}</button>
                    </div>
                </div>
                <div style="word-break:break-all;font-size:10px;font-family:monospace;background:rgba(0,0,0,0.2);padding:6px 8px;border-radius:8px;margin-bottom:8px;max-height:50px;overflow-y:auto;color:${t.text2};line-height:1.4;border:1px solid ${t.border};">
                    ${url}
                </div>
                <div style="display:flex;flex-wrap:wrap;gap:4px;">
                    <button class="__uvd_act__" data-url="${encodeURIComponent(url)}" data-action="share" class="uvd-btn" style="flex:1;padding:6px 8px;font-size:11px;background:rgba(255,255,255,0.06);border:1px solid ${t.border};border-radius:12px;color:${t.text};cursor:pointer;">📱 YTDLnis</button>
                    <button class="__uvd_act__" data-url="${encodeURIComponent(url)}" data-action="copy" class="uvd-btn" style="flex:1;padding:6px 8px;font-size:11px;background:rgba(255,255,255,0.06);border:1px solid ${t.border};border-radius:12px;color:${t.text};cursor:pointer;">📋 Copy</button>
                    ${type === 'IFRAME' ? `<a href="${url}" target="_blank" class="uvd-btn" style="flex:1;padding:6px 8px;font-size:11px;text-align:center;text-decoration:none;background:rgba(255,255,255,0.06);border:1px solid ${t.border};border-radius:12px;color:${t.text};">➡️ Xem</a>` : ''}
                    ${type === 'M3U8' ? `<button class="__uvd_act__" data-url="${encodeURIComponent(url)}" data-action="quality" class="uvd-btn" style="flex:1;padding:6px 8px;font-size:11px;background:rgba(255,255,255,0.06);border:1px solid ${t.border};border-radius:12px;color:${t.text};cursor:pointer;">🎞️ Quality</button>` : ''}
                    ${type === 'M3U8' ? `<button class="__uvd_act__" data-url="${encodeURIComponent(url)}" data-action="preview" class="uvd-btn" style="flex:1;padding:6px 8px;font-size:11px;background:rgba(255,255,255,0.06);border:1px solid ${t.border};border-radius:12px;color:${t.text};cursor:pointer;">▶️ Preview</button>` : ''}
                    <button class="__uvd_act__" data-url="${encodeURIComponent(url)}" data-action="cmd" data-type="${type}" class="uvd-btn" style="flex:1;padding:6px 8px;font-size:11px;background:rgba(255,255,255,0.06);border:1px solid ${t.border};border-radius:12px;color:${t.text};cursor:pointer;">⚙️ Lệnh</button>
                </div>
            `;
            container.appendChild(card);
        });
        bindStreamEvents();
    }
    
    function bindStreamEvents() {
        document.querySelectorAll('.__uvd_fav__').forEach(function(b) {
            b.onclick = function() {
                var url = decodeURIComponent(this.dataset.url);
                var isFav = toggleFavorite(url, this.dataset.type);
                this.innerText = isFav ? '⭐' : '☆';
                this.style.color = isFav ? '#fdd835' : getTheme().text3;
            };
        });
        document.querySelectorAll('.__uvd_act__').forEach(function(b) {
            b.onclick = function() {
                var url = decodeURIComponent(this.dataset.url);
                var action = this.dataset.action;
                var type = this.dataset.type;
                addToHistory(url, type || 'IFRAME');
                if (action === 'share') shareUrl(url);
                else if (action === 'copy') showEditor(url, '📋 URL');
                else if (action === 'quality') showQualityPicker(url);
                else if (action === 'preview') showPreview(url);
                else if (action === 'cmd') showCommandPicker(url, type);
            };
        });
    }
    
    // ========== QUALITY PICKER ==========
    function showQualityPicker(url) {
        var t = getTheme();
        var overlay = createOverlay();
        overlay.innerHTML = `
            <div style="color:${t.primary};font-weight:600;font-size:16px;margin-bottom:12px;">🎞️ Đang phân tích...</div>
            <div style="flex:1;display:flex;align-items:center;justify-content:center;color:${t.text2};">⏳ Loading</div>
        `;
        parseM3U8Master(url, function(qualities) {
            if (!qualities) {
                overlay.innerHTML = `
                    <div style="color:${t.danger};font-weight:600;font-size:16px;margin-bottom:12px;">❌ Không phải Master Playlist</div>
                    <div style="color:${t.text2};margin-bottom:16px;">Stream đơn, không có nhiều chất lượng.</div>
                    <button id="__uvd_qp_close__" class="uvd-btn uvd-btn-danger" style="width:100%;">Đóng</button>
                `;
                document.getElementById('__uvd_qp_close__').onclick = function() { overlay.remove(); };
                return;
            }
            var html = `<div style="color:${t.primary};font-weight:600;font-size:16px;margin-bottom:12px;">🎞️ Chọn chất lượng (${qualities.length})</div>`;
            qualities.forEach(function(q) {
                html += `
                    <div class="uvd-card" style="margin:6px 0;">
                        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
                            <b style="color:${t.text};">${q.label}</b>
                            <span style="color:${t.text3};font-size:11px;">${Math.round(q.bandwidth/1000)} kbps</span>
                        </div>
                        <div style="color:${t.text3};font-size:10px;margin-bottom:6px;">📐 ${q.resolution} ${q.codecs ? '· '+q.codecs : ''}</div>
                        <div style="display:flex;gap:4px;">
                            <button class="__uvd_qbtn__" data-url="${encodeURIComponent(q.url)}" data-action="share" class="uvd-btn" style="flex:1;padding:6px;font-size:11px;background:rgba(255,255,255,0.06);border:1px solid ${t.border};border-radius:12px;color:${t.text};cursor:pointer;">📱 YTDLnis</button>
                            <button class="__uvd_qbtn__" data-url="${encodeURIComponent(q.url)}" data-action="cmd" class="uvd-btn" style="flex:1;padding:6px;font-size:11px;background:rgba(255,255,255,0.06);border:1px solid ${t.border};border-radius:12px;color:${t.text};cursor:pointer;">⚙️ Lệnh</button>
                        </div>
                    </div>
                `;
            });
            html += `<button id="__uvd_qp_close__" class="uvd-btn uvd-btn-danger" style="width:100%;margin-top:10px;">✕ Đóng</button>`;
            overlay.innerHTML = html;
            document.querySelectorAll('.__uvd_qbtn__').forEach(function(b) {
                b.onclick = function() {
                    var qUrl = decodeURIComponent(this.dataset.url);
                    var action = this.dataset.action;
                    overlay.remove();
                    if (action === 'share') shareUrl(qUrl);
                    else showCommandPicker(qUrl, 'M3U8');
                };
            });
            document.getElementById('__uvd_qp_close__').onclick = function() { overlay.remove(); };
        });
    }
    
    // ========== PREVIEW WITH VIDEO.JS ==========
    function showPreview(url) {
        var t = getTheme();
        var overlay = createOverlay();
        overlay.style.padding = '0';
        overlay.innerHTML = `
            <div style="background:rgba(0,0,0,0.3);padding:16px 20px;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid ${t.border};">
                <span style="font-weight:600;color:${t.text};">▶️ Preview</span>
                <button id="__uvd_pv_close__" class="uvd-btn uvd-btn-danger" style="padding:6px 14px;">✕ Đóng</button>
            </div>
            <div style="flex:1;display:flex;flex-direction:column;padding:16px;gap:10px;">
                <div id="__uvd_pv_container__" style="flex:1;background:#000;border-radius:16px;overflow:hidden;position:relative;min-height:200px;">
                    <video id="__uvd_pv_player__" class="video-js vjs-big-play-centered" style="width:100%;height:100%;"></video>
                </div>
                <div id="__uvd_pv_status__" style="color:${t.text3};font-size:12px;text-align:center;">⏳ Đang load Video.js...</div>
            </div>
        `;
        
        var closeBtn = document.getElementById('__uvd_pv_close__');
        closeBtn.onclick = function() {
            var player = videojs.getPlayer('__uvd_pv_player__');
            if (player) player.dispose();
            overlay.remove();
        };
        
        loadVideoJS(function() {
            var status = document.getElementById('__uvd_pv_status__');
            status.innerText = '⏳ Khởi tạo player...';
            var player = videojs('__uvd_pv_player__', {
                controls: true,
                autoplay: true,
                fluid: true,
                html5: {
                    hls: {
                        enableLowInitialPlaylist: true,
                        smoothQualityChange: true,
                        overrideNative: true
                    }
                }
            }, function() {
                status.innerText = '▶️ Đang phát...';
                player.src({ src: url, type: 'application/x-mpegURL' });
                player.play();
            });
            // handle error
            player.on('error', function() {
                status.innerText = '❌ Không thể phát. Thử copy URL và mở bằng VLC.';
            });
        });
    }
    
    // ========== COMMAND PICKER ==========
    function showCommandPicker(url, type) {
        var t = getTheme();
        var cmds = makeCommands(url, type, pageInfo.title);
        var overlay = createOverlay();
        var html = `<div style="color:${t.primary};font-weight:600;font-size:16px;margin-bottom:12px;">⚙️ Chọn lệnh tải</div>`;
        Object.keys(cmds).forEach(function(key) {
            var c = cmds[key];
            html += `
                <div class="uvd-card" style="margin:6px 0;">
                    <div style="font-weight:600;color:${t.text};margin-bottom:4px;">${c.label}</div>
                    <div style="background:rgba(0,0,0,0.3);padding:6px 8px;border-radius:8px;font-family:monospace;font-size:10px;color:${t.text2};word-break:break-all;margin-bottom:6px;max-height:60px;overflow-y:auto;">${c.cmd}</div>
                    <button class="__uvd_cbtn__" data-cmd="${encodeURIComponent(c.cmd)}" class="uvd-btn" style="width:100%;padding:8px;background:rgba(255,255,255,0.06);border:1px solid ${t.border};border-radius:12px;color:${t.text};cursor:pointer;">📋 Chọn & sửa</button>
                </div>
            `;
        });
        html += `<button id="__uvd_cp_close__" class="uvd-btn uvd-btn-danger" style="width:100%;margin-top:8px;">✕ Đóng</button>`;
        overlay.innerHTML = html;
        document.querySelectorAll('.__uvd_cbtn__').forEach(function(b) {
            b.onclick = function() {
                var cmd = decodeURIComponent(this.dataset.cmd);
                overlay.remove();
                showEditor(cmd, 'Lệnh tải');
            };
        });
        document.getElementById('__uvd_cp_close__').onclick = function() { overlay.remove(); };
    }
    
    // ========== EDITOR ==========
    function showEditor(text, title) {
        var t = getTheme();
        var overlay = createOverlay();
        overlay.innerHTML = `
            <div style="color:${t.primary};font-weight:600;font-size:16px;margin-bottom:4px;">✏️ ${title}</div>
            <div style="color:${t.text3};font-size:11px;margin-bottom:12px;">Sửa lệnh trước khi copy</div>
            <textarea id="__uvd_edit__" style="flex:1;background:rgba(0,0,0,0.3);color:${t.text};border:1px solid ${t.border};border-radius:12px;padding:12px;font:12px monospace;resize:none;line-height:1.5;width:100%;">${text.replace(/</g,'&lt;')}</textarea>
            <div style="display:flex;gap:6px;margin-top:10px;">
                <button id="__uvd_ed_ok__" class="uvd-btn uvd-btn-primary" style="flex:1;">✓ Copy</button>
                <button id="__uvd_ed_share__" class="uvd-btn" style="flex:1;background:rgba(255,255,255,0.06);border:1px solid ${t.border};color:${t.text};">📱 Share</button>
                <button id="__uvd_ed_no__" class="uvd-btn uvd-btn-danger" style="flex:1;">✕ Hủy</button>
            </div>
        `;
        var textarea = document.getElementById('__uvd_edit__');
        textarea.focus();
        document.getElementById('__uvd_ed_ok__').onclick = function() {
            copy(textarea.value);
            overlay.remove();
            toast('✓ Đã copy!');
        };
        document.getElementById('__uvd_ed_share__').onclick = function() {
            var val = textarea.value;
            overlay.remove();
            shareUrl(val);
        };
        document.getElementById('__uvd_ed_no__').onclick = function() { overlay.remove(); };
    }
    
    // ========== RENDER: FAVORITES ==========
    function renderFavorites(container) {
        var t = getTheme();
        if (!data.favorites.length) {
            container.innerHTML = '<div style="text-align:center;padding:40px 20px;color:' + t.text2 + ';">⭐ Chưa có favorites<br><small style="color:' + t.text3 + ';">Bấm ☆ trên stream để thêm</small></div>';
            return;
        }
        data.favorites.forEach(function(fav, i) {
            var card = document.createElement('div');
            card.className = 'uvd-card';
            card.innerHTML = `
                <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
                    <b style="color:#fdd835;font-size:12px;">⭐ ${fav.type}</b>
                    <span style="color:${t.text3};font-size:10px;">${new Date(fav.timestamp).toLocaleDateString()}</span>
                </div>
                <div style="color:${t.text};font-size:12px;margin-bottom:2px;">${fav.title}</div>
                <div style="color:${t.text3};font-size:10px;margin-bottom:4px;">🌐 ${fav.host}</div>
                <div style="word-break:break-all;font-size:10px;font-family:monospace;background:rgba(0,0,0,0.2);padding:4px 6px;border-radius:6px;margin-bottom:6px;max-height:40px;overflow-y:auto;color:${t.text2};">${fav.url}</div>
                <div style="display:flex;gap:4px;">
                    <button class="__uvd_fbtn__" data-url="${encodeURIComponent(fav.url)}" data-action="share" class="uvd-btn" style="flex:1;padding:6px;font-size:11px;background:rgba(255,255,255,0.06);border:1px solid ${t.border};border-radius:12px;color:${t.text};cursor:pointer;">📱 YTDLnis</button>
                    <button class="__uvd_fbtn__" data-url="${encodeURIComponent(fav.url)}" data-action="copy" class="uvd-btn" style="flex:1;padding:6px;font-size:11px;background:rgba(255,255,255,0.06);border:1px solid ${t.border};border-radius:12px;color:${t.text};cursor:pointer;">📋 Copy</button>
                    <button class="__uvd_fbtn__" data-idx="${i}" data-action="del" class="uvd-btn uvd-btn-danger" style="padding:6px 12px;font-size:11px;">🗑️</button>
                </div>
            `;
            container.appendChild(card);
        });
        document.querySelectorAll('.__uvd_fbtn__').forEach(function(b) {
            b.onclick = function() {
                var action = this.dataset.action;
                if (action === 'del') {
                    data.favorites.splice(parseInt(this.dataset.idx), 1);
                    storage.set(data);
                    renderFavorites(container);
                    toast('🗑️ Đã xóa');
                } else {
                    var url = decodeURIComponent(this.dataset.url);
                    if (action === 'share') shareUrl(url);
                    else { copy(url); toast('✓ Copied'); }
                }
            };
        });
    }
    
    // ========== RENDER: HISTORY ==========
    function renderHistory(container) {
        var t = getTheme();
        var history = data.history || [];
        if (!history.length) {
            container.innerHTML = '<div style="text-align:center;padding:40px 20px;color:' + t.text2 + ';">📜 Chưa có history</div>';
            return;
        }
        var clearBtn = document.createElement('button');
        clearBtn.innerText = '🗑️ Xóa tất cả history';
        clearBtn.className = 'uvd-btn uvd-btn-danger';
        clearBtn.style.cssText = 'width:100%;margin-bottom:10px;padding:8px;font-size:12px;';
        clearBtn.onclick = function() {
            if (confirm('Xóa toàn bộ history?')) {
                data.history = [];
                storage.set(data);
                renderHistory(container);
            }
        };
        container.appendChild(clearBtn);
        history.forEach(function(h) {
            var card = document.createElement('div');
            card.className = 'uvd-card';
            card.innerHTML = `
                <div style="display:flex;justify-content:space-between;margin-bottom:2px;">
                    <b style="color:${t.accent};font-size:11px;">${h.type}</b>
                    <span style="color:${t.text3};font-size:10px;">${new Date(h.timestamp).toLocaleString()}</span>
                </div>
                <div style="color:${t.text};font-size:11px;">${h.title}</div>
                <div style="color:${t.text3};font-size:10px;">🌐 ${h.host}</div>
                <div style="word-break:break-all;font-size:10px;font-family:monospace;color:${t.text2};margin-top:2px;max-height:36px;overflow-y:auto;">${h.url}</div>
            `;
            container.appendChild(card);
        });
    }
    
    // ========== RENDER: SETTINGS ==========
    function renderSettings(container) {
        var t = getTheme();
        var html = `<div style="color:${t.primary};font-weight:600;font-size:15px;margin-bottom:14px;">⚙️ Settings</div>`;
        
        // Theme info (glass only)
        html += `<div class="uvd-card" style="margin-bottom:8px;"><div style="color:${t.text};font-weight:500;">🎨 Giao diện</div><div style="color:${t.text3};font-size:12px;">Liquid Glass · hiệu ứng kính mờ</div></div>`;
        
        // Site profiles
        html += `<div class="uvd-card" style="margin-bottom:8px;"><div style="color:${t.text};font-weight:500;margin-bottom:6px;">🌐 Site Profiles</div>`;
        var profiles = Object.keys(data.siteProfiles);
        if (!profiles.length) {
            html += `<div style="color:${t.text3};font-size:11px;">Chưa có profile. Bấm Referer để lưu.</div>`;
        } else {
            profiles.forEach(function(p) {
                html += `
                    <div style="background:rgba(0,0,0,0.2);padding:6px 10px;border-radius:8px;margin-bottom:4px;font-size:11px;">
                        <div style="color:${t.primary};font-weight:500;">${p}</div>
                        <div style="color:${t.text2};font-family:monospace;font-size:10px;word-break:break-all;">${data.siteProfiles[p].referer}</div>
                        <button class="__uvd_delprofile__" data-host="${p}" class="uvd-btn uvd-btn-danger" style="padding:2px 10px;font-size:10px;margin-top:4px;">🗑️ Xóa</button>
                    </div>
                `;
            });
        }
        html += `</div>`;
        
        // Backup
        html += `<div class="uvd-card" style="margin-bottom:8px;"><div style="color:${t.text};font-weight:500;margin-bottom:6px;">💾 Backup</div>
            <button id="__uvd_backup__" class="uvd-btn" style="width:100%;padding:8px;font-size:12px;margin-bottom:4px;">📤 Export data</button>
            <button id="__uvd_restore__" class="uvd-btn" style="width:100%;padding:8px;font-size:12px;margin-bottom:4px;">📥 Import data</button>
            <button id="__uvd_reset__" class="uvd-btn uvd-btn-danger" style="width:100%;padding:8px;font-size:12px;">🔥 Reset toàn bộ</button>
        </div>`;
        
        // Info
        html += `<div class="uvd-card" style="font-size:11px;color:${t.text3};">
            <div>📦 Version: Glass 2.0</div>
            <div>👤 nguyenquocngu93</div>
            <div>⭐ Favorites: ${data.favorites.length}</div>
            <div>📜 History: ${(data.history||[]).length}</div>
            <div>🌐 Profiles: ${Object.keys(data.siteProfiles).length}</div>
        </div>`;
        
        container.innerHTML = html;
        
        document.getElementById('__uvd_backup__').onclick = function() {
            var blob = new Blob([JSON.stringify(data, null, 2)], {type:'application/json'});
            var a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = 'uvd_backup_'+Date.now()+'.json';
            a.click();
            toast('📤 Đã export backup');
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
                        toast('✓ Đã import');
                        buildUI();
                    } catch(err) {
                        toast('❌ File không hợp lệ', getTheme().danger);
                    }
                };
                reader.readAsText(e.target.files[0]);
            };
            input.click();
        };
        document.getElementById('__uvd_reset__').onclick = function() {
            if (confirm('Xóa TOÀN BỘ dữ liệu?')) {
                localStorage.removeItem(STORAGE_KEY);
                data = { favorites: [], theme: 'glass', siteProfiles: {}, history: [] };
                toast('🔥 Đã reset');
                buildUI();
            }
        };
        document.querySelectorAll('.__uvd_delprofile__').forEach(function(b) {
            b.onclick = function() {
                delete data.siteProfiles[this.dataset.host];
                storage.set(data);
                renderSettings(container);
                toast('🗑️ Đã xóa profile');
            };
        });
    }
    
    // ========== START ==========
    buildUI();
    
    // Auto refresh count
    var lastCount = urls.size;
    var autoRefresh = setInterval(function() {
        if (!document.getElementById('__uvd__')) {
            clearInterval(autoRefresh);
            stopMonitor();
            return;
        }
        if (urls.size !== lastCount) {
            lastCount = urls.size;
            // Update header count
            var header = document.querySelector('#__uvd__ > div:first-of-type .uvd-pulse + span');
            if (header) {
                var parts = header.innerText.split(' · ');
                if (parts.length >= 2) {
                    parts[0] = urls.size + ' streams';
                    header.innerText = parts.join(' · ');
                }
            }
        }
    }, 2000);
    
    console.log('✅ Universal DL Glass loaded! Found', urls.size, 'streams initially');
    toast('✨ Glass mode ready');
})();