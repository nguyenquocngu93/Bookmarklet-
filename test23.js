/**
 * Universal Video Downloader V3 - Dark Glass Edition
 * Features: Glassmorphism UI, Full transitions, Button animations, Minimize, Live monitoring,
 *           Multi-quality, Favorites, Export, Site profiles, Share to YTDLnis
 * Author: nguyenquocngu93
 */
(function() {
    'use strict';
    
    // ========== INIT ==========
    var old = document.getElementById('__uvd__');
    if (old) old.remove();
    var oldMini = document.getElementById('__uvd_mini__');
    if (oldMini) oldMini.remove();
    
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
    data.theme = data.theme || 'glass';
    data.siteProfiles = data.siteProfiles || {};
    data.history = data.history || [];
    
    // Global state
    var isMinimized = false;
    var currentTab = 'streams';
    
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
    
    // ========== M3U8 PARSER ==========
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
                            streamUrl = url.substring(0, url.lastIndexOf('/') + 1) + streamUrl;
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
            'ffmpeg': {
                label: '🎬 FFmpeg (M3U8 → MP4)',
                cmd: 'ffmpeg -headers "Referer: ' + ref + '\\r\\nOrigin: ' + origin + '\\r\\nUser-Agent: ' + ua + '" -i "' + url + '" -c copy -bsf:a aac_adtstoasc "' + t + '.mp4"'
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
        t.value = text; document.body.appendChild(t);
        t.select(); document.execCommand('copy'); t.remove();
    }
    
    function toast(msg, color) {
        color = color || 'var(--primary)';
        var t = document.createElement('div');
        t.innerText = msg;
        t.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.8);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);color:#fff;padding:14px 28px;border-radius:30px;z-index:2147483650;font:bold 14px -apple-system,Arial;box-shadow:0 8px 32px rgba(0,0,0,0.5),0 0 0 1px rgba(255,255,255,0.2);animation:uvdSlideIn 0.4s cubic-bezier(0.175,0.885,0.32,1.275);';
        document.body.appendChild(t);
        setTimeout(function() {
            t.style.animation = 'uvdSlideOut 0.3s ease-in forwards';
            setTimeout(function() { t.remove(); }, 300);
        }, 2000);
    }
    
    function shareUrl(url) {
        if (navigator.share) {
            navigator.share({ title: pageInfo.title, text: pageInfo.title, url: url })
            .catch(function(err) { if (err.name !== 'AbortError') { copy(url); toast('✓ Đã copy URL'); } });
        } else { copy(url); toast('✓ Đã copy - Mở YTDLnis để tải', '#FF6B6B'); }
    }
    
    function addToHistory(url, type) {
        data.history = data.history || [];
        data.history.unshift({ url: url, type: type, title: pageInfo.title, host: pageInfo.host, timestamp: Date.now() });
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
            data.favorites.unshift({ url: url, type: type, title: pageInfo.title, host: pageInfo.host, timestamp: Date.now() });
            toast('⭐ Đã thêm vào Favorites');
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
            content = 'Type,URL,Source,Title\n' + arr.map(function(a) { return a.type + ',"' + a.url + '",' + a.source + ',"' + a.title + '"'; }).join('\n');
            mime = 'text/csv'; filename = pageInfo.title + '_streams.csv';
        } else if (format === 'm3u') {
            content = '#EXTM3U\n' + arr.filter(function(a) { return a.type !== 'IFRAME'; }).map(function(a) { return '#EXTINF:-1,' + a.title + ' [' + a.type + ']\n' + a.url; }).join('\n');
            mime = 'audio/x-mpegurl'; filename = pageInfo.title + '.m3u';
        } else if (format === 'txt') {
            content = arr.map(function(a) { return a.url; }).join('\n');
            mime = 'text/plain'; filename = pageInfo.title + '_urls.txt';
        }
        var blob = new Blob([content], { type: mime });
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob); a.download = filename; a.click();
        URL.revokeObjectURL(a.href);
        toast('💾 Đã export ' + format.toUpperCase());
    }
    
    // ========== BUILD UI (Dark Glass) ==========
    function injectStyles() {
        if (document.getElementById('__uvd_styles__')) return;
        var style = document.createElement('style');
        style.id = '__uvd_styles__';
        style.textContent = `
            @keyframes uvdSlideIn {
                from { transform: translate(-50%, -30px); opacity: 0; }
                to { transform: translate(-50%, 0); opacity: 1; }
            }
            @keyframes uvdSlideOut {
                from { transform: translate(-50%, 0); opacity: 1; }
                to { transform: translate(-50%, -30px); opacity: 0; }
            }
            @keyframes uvdFadeIn {
                from { opacity: 0; transform: scale(0.95); }
                to { opacity: 1; transform: scale(1); }
            }
            @keyframes uvdPulse {
                0%, 100% { opacity: 1; }
                50% { opacity: 0.5; }
            }
            @keyframes uvdRipple {
                to { transform: scale(4); opacity: 0; }
            }
            @keyframes uvdBounceIn {
                0% { transform: scale(0.3); opacity: 0; }
                50% { transform: scale(1.05); }
                70% { transform: scale(0.95); }
                100% { transform: scale(1); opacity: 1; }
            }
            @keyframes uvdSlideUp {
                from { transform: translateY(10px); opacity: 0; }
                to { transform: translateY(0); opacity: 1; }
            }
            .__uvd_card__ {
                animation: uvdSlideUp 0.3s ease forwards;
            }
            .__uvd_glass_btn__ {
                position: relative;
                overflow: hidden;
                transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1.2);
            }
            .__uvd_glass_btn__:hover {
                transform: translateY(-2px);
                box-shadow: 0 8px 25px rgba(0,0,0,0.3), 0 0 0 1px rgba(255,255,255,0.2);
            }
            .__uvd_glass_btn__:active {
                transform: scale(0.95);
                transition: transform 0.1s;
            }
            .__uvd_glass_btn__ .ripple {
                position: absolute;
                border-radius: 50%;
                background: rgba(255,255,255,0.4);
                transform: scale(0);
                animation: uvdRipple 0.6s linear;
                pointer-events: none;
            }
            .__uvd_tab_btn__ {
                transition: all 0.3s ease;
                position: relative;
            }
            .__uvd_tab_btn__:hover {
                background: rgba(255,255,255,0.08);
                color: #fff;
            }
            .__uvd_tab_btn__::after {
                content: '';
                position: absolute;
                bottom: 0;
                left: 50%;
                width: 0;
                height: 3px;
                background: var(--primary);
                transition: all 0.3s ease;
                transform: translateX(-50%);
                border-radius: 3px 3px 0 0;
            }
            .__uvd_tab_btn__.active::after {
                width: 60%;
            }
            .__uvd_overlay__ {
                animation: uvdFadeIn 0.3s ease;
                backdrop-filter: blur(15px);
                -webkit-backdrop-filter: blur(15px);
            }
            .__uvd_stream_card__ {
                transition: all 0.3s ease;
                backdrop-filter: blur(10px);
                -webkit-backdrop-filter: blur(10px);
            }
            .__uvd_stream_card__:hover {
                transform: translateX(4px);
                box-shadow: 0 4px 20px rgba(0,0,0,0.3), 0 0 0 1px rgba(255,255,255,0.15);
            }
            .__uvd_mini_btn__ {
                animation: uvdBounceIn 0.5s ease;
                transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1.2);
            }
            .__uvd_mini_btn__:hover {
                transform: scale(1.15) rotate(5deg);
                box-shadow: 0 12px 40px rgba(0,0,0,0.5), 0 0 0 2px var(--primary);
            }
            .__uvd_mini_btn__:active {
                transform: scale(0.9);
            }
        `;
        document.head.appendChild(style);
    }
    
    function addRippleEffect(btn) {
        btn.addEventListener('click', function(e) {
            var ripple = document.createElement('span');
            ripple.className = 'ripple';
            var rect = btn.getBoundingClientRect();
            var size = Math.max(rect.width, rect.height);
            ripple.style.width = ripple.style.height = size + 'px';
            ripple.style.left = (e.clientX - rect.left - size/2) + 'px';
            ripple.style.top = (e.clientY - rect.top - size/2) + 'px';
            btn.appendChild(ripple);
            setTimeout(function() { ripple.remove(); }, 600);
        });
    }
    
    function buildUI() {
        injectStyles();
        var arr = [...urls.entries()].map(function(e) {
            return { url: e[0], type: e[1].type, source: e[1].source, priority: e[1].priority };
        }).sort(function(a, b) { return a.priority - b.priority; });
        
        var panel = document.getElementById('__uvd__');
        if (panel) panel.remove();
        
        // CSS Variables cho Glass theme
        var glassCSS = `
            --bg: rgba(22, 22, 35, 0.75);
            --bg2: rgba(30, 30, 45, 0.7);
            --bg3: rgba(40, 40, 55, 0.65);
            --text: #ffffff;
            --text2: #c0c0d0;
            --text3: #8888a0;
            --primary: #5C6BC0;
            --accent: #26C6DA;
            --danger: #EF5350;
            --glass-border: rgba(255,255,255,0.12);
            --glass-shadow: 0 8px 32px rgba(0,0,0,0.5);
        `;
        
        panel = document.createElement('div');
        panel.id = '__uvd__';
        panel.style.cssText = 
            'position:fixed;top:10px;left:10px;right:10px;bottom:10px;' +
            'background:rgba(22,22,35,0.78);' +
            'backdrop-filter:blur(25px) saturate(180%);' +
            '-webkit-backdrop-filter:blur(25px) saturate(180%);' +
            'color:#fff;padding:0;border-radius:16px;' +
            'z-index:2147483647;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif;font-size:13px;' +
            'overflow:hidden;display:flex;flex-direction:column;' +
            'box-shadow:0 12px 48px rgba(0,0,0,0.7),0 0 0 1px rgba(255,255,255,0.15);' +
            'border:1px solid rgba(255,255,255,0.1);' +
            'animation:uvdFadeIn 0.4s ease;';
        
        // Header với glass effect
        var header = document.createElement('div');
        header.style.cssText = 
            'background:rgba(255,255,255,0.06);' +
            'backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);' +
            'padding:14px 18px;display:flex;justify-content:space-between;align-items:center;' +
            'border-bottom:1px solid rgba(255,255,255,0.1);';
        header.innerHTML = 
            '<div>' +
                '<b style="font-size:17px;background:linear-gradient(135deg,#fff,#c0c0ff);-webkit-background-clip:text;-webkit-text-fill-color:transparent;text-shadow:0 0 20px rgba(100,100,255,0.5);">⬇️ Universal DL V3</b>' +
                '<div style="font-size:11px;color:rgba(255,255,255,0.7);margin-top:4px;display:flex;gap:10px;align-items:center;">' +
                    '<span style="animation:uvdPulse 2s infinite;color:#4CAF50;text-shadow:0 0 10px rgba(76,175,80,0.5);">🔴 LIVE</span>' +
                    '<span style="opacity:0.7;">·</span>' +
                    '<span>' + arr.length + ' streams</span>' +
                    '<span style="opacity:0.7;">·</span>' +
                    '<span style="opacity:0.8;">' + pageInfo.host + '</span>' +
                '</div>' +
            '</div>' +
            '<div style="display:flex;gap:8px;">' +
                '<button id="__uvd_minimize__" title="Minimize" class="__uvd_glass_btn__" style="background:rgba(255,255,255,0.08);color:#fff;border:1px solid rgba(255,255,255,0.15);padding:9px 13px;border-radius:10px;font-size:16px;cursor:pointer;">🗕</button>' +
                '<button id="__uvd_refresh__" title="Refresh" class="__uvd_glass_btn__" style="background:rgba(255,255,255,0.08);color:#fff;border:1px solid rgba(255,255,255,0.15);padding:9px 13px;border-radius:10px;font-size:15px;cursor:pointer;">🔄</button>' +
                '<button id="__uvd_close__" title="Close" class="__uvd_glass_btn__" style="background:rgba(239,83,80,0.2);color:#EF5350;border:1px solid rgba(239,83,80,0.3);padding:9px 14px;border-radius:10px;font-weight:bold;font-size:16px;cursor:pointer;">✕</button>' +
            '</div>';
        
        // Add ripple to header buttons
        [].forEach.call(header.querySelectorAll('button'), function(b) { addRippleEffect(b); });
        panel.appendChild(header);
        
        // Tabs
        var tabs = document.createElement('div');
        tabs.style.cssText = 
            'display:flex;background:rgba(255,255,255,0.03);' +
            'backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);' +
            'border-bottom:1px solid rgba(255,255,255,0.08);';
        var tabList = [
            { id: 'streams', label: '🎬 Streams (' + arr.length + ')' },
            { id: 'favorites', label: '⭐ Favorites (' + data.favorites.length + ')' },
            { id: 'history', label: '📜 History (' + (data.history || []).length + ')' },
            { id: 'settings', label: '⚙️ Settings' }
        ];
        tabList.forEach(function(tab) {
            var b = document.createElement('button');
            b.className = '__uvd_tab_btn__';
            b.dataset.tab = tab.id;
            b.innerText = tab.label;
            b.style.cssText = 
                'flex:1;background:transparent;color:rgba(255,255,255,0.7);border:0;padding:12px 5px;font-size:12px;font-weight:600;cursor:pointer;letter-spacing:0.3px;';
            if (tab.id === currentTab) b.classList.add('active');
            b.onclick = function() { currentTab = this.dataset.tab; buildUI(); };
            tabs.appendChild(b);
        });
        panel.appendChild(tabs);
        
        // Info bar
        var info = document.createElement('div');
        info.style.cssText = 
            'background:rgba(255,255,255,0.04);padding:10px 18px;' +
            'border-bottom:1px solid rgba(255,255,255,0.08);font-size:11px;';
        info.innerHTML = 
            '<div style="display:flex;align-items:center;gap:8px;">' +
                '<span style="opacity:0.7;">📝</span>' +
                '<span id="__uvd_title__" title="Click to edit" style="color:#fff;font-weight:600;cursor:pointer;text-decoration:underline;text-decoration-color:rgba(255,255,255,0.3);text-underline-offset:4px;transition:all 0.2s;" onmouseover="this.style.textDecorationColor=\'#fff\'" onmouseout="this.style.textDecorationColor=\'rgba(255,255,255,0.3)\'">' + pageInfo.title + '</span>' +
            '</div>' +
            '<div style="display:flex;align-items:center;gap:8px;margin-top:6px;">' +
                '<span style="opacity:0.7;">🔗</span>' +
                '<span id="__uvd_referer__" title="Click to edit Referer" style="color:rgba(200,200,255,0.9);font-family:monospace;font-size:10px;cursor:pointer;text-decoration:underline;text-decoration-color:rgba(200,200,255,0.3);text-underline-offset:4px;transition:all 0.2s;word-break:break-all;">' + pageInfo.referer + '</span>' +
            '</div>';
        panel.appendChild(info);
        
        // Content area
        var content = document.createElement('div');
        content.id = '__uvd_content__';
        content.style.cssText = 'flex:1;overflow-y:auto;padding:12px 16px;';
        panel.appendChild(content);
        
        // Footer
        var footer = document.createElement('div');
        footer.style.cssText = 
            'background:rgba(255,255,255,0.04);' +
            'backdrop-filter:blur(15px);-webkit-backdrop-filter:blur(15px);' +
            'padding:10px;border-top:1px solid rgba(255,255,255,0.08);' +
            'display:flex;gap:6px;flex-wrap:wrap;';
        var expBtns = ['txt','json','m3u','csv'];
        expBtns.forEach(function(fmt) {
            var btn = document.createElement('button');
            btn.className = '__uvd_glass_btn__';
            btn.innerText = '💾 ' + fmt.toUpperCase();
            btn.style.cssText = 
                'background:rgba(255,255,255,0.06);color:rgba(255,255,255,0.8);' +
                'border:1px solid rgba(255,255,255,0.1);padding:10px;border-radius:8px;' +
                'font-size:11px;flex:1;cursor:pointer;font-weight:600;';
            btn.onclick = function() { exportData(fmt); };
            addRippleEffect(btn);
            footer.appendChild(btn);
        });
        panel.appendChild(footer);
        
        document.body.appendChild(panel);
        
        // Render tab content
        if (currentTab === 'streams') renderStreams(content, arr);
        else if (currentTab === 'favorites') renderFavorites(content);
        else if (currentTab === 'history') renderHistory(content);
        else if (currentTab === 'settings') renderSettings(content);
        
        // Event bindings
        document.getElementById('__uvd_close__').onclick = function() {
            stopMonitor();
            panel.style.animation = 'uvdSlideOut 0.3s ease forwards';
            setTimeout(function() { panel.remove(); }, 300);
        };
        document.getElementById('__uvd_minimize__').onclick = minimizePanel;
        document.getElementById('__uvd_refresh__').onclick = function() {
            panel.style.opacity = '0';
            panel.style.transform = 'scale(0.95)';
            panel.style.transition = 'all 0.2s ease';
            setTimeout(function() {
                buildUI();
                toast('🔄 Refreshed');
            }, 200);
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
    }
    
    // ========== MINIMIZE ==========
    function minimizePanel() {
        var panel = document.getElementById('__uvd__');
        if (!panel) return;
        
        isMinimized = true;
        panel.style.animation = 'uvdSlideOut 0.3s ease forwards';
        panel.style.transformOrigin = 'top right';
        setTimeout(function() { panel.style.display = 'none'; }, 300);
        
        showMiniButton();
        toast('🗕 Minimized - Click icon to restore');
    }
    
    function restorePanel() {
        var panel = document.getElementById('__uvd__');
        if (panel) {
            panel.style.display = 'flex';
            panel.style.animation = 'uvdFadeIn 0.4s ease forwards';
            isMinimized = false;
        } else {
            buildUI();
        }
        removeMiniButton();
    }
    
    function showMiniButton() {
        removeMiniButton();
        var mini = document.createElement('div');
        mini.id = '__uvd_mini__';
        mini.className = '__uvd_mini_btn__';
        mini.title = 'Restore Universal DL V3';
        mini.style.cssText = 
            'position:fixed;bottom:25px;right:25px;width:55px;height:55px;' +
            'background:rgba(92,107,192,0.8);' +
            'backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);' +
            'border-radius:50%;z-index:2147483648;' +
            'display:flex;align-items:center;justify-content:center;' +
            'cursor:pointer;font-size:24px;' +
            'box-shadow:0 8px 32px rgba(0,0,0,0.5),0 0 0 1px rgba(255,255,255,0.2);' +
            'color:#fff;';
        mini.innerHTML = '⬇️';
        mini.onclick = restorePanel;
        document.body.appendChild(mini);
    }
    
    function removeMiniButton() {
        var mini = document.getElementById('__uvd_mini__');
        if (mini) mini.remove();
    }
    
    // ========== RENDER: STREAMS ==========
    function renderStreams(container, arr) {
        if (!arr.length) {
            container.innerHTML = 
                '<div style="text-align:center;padding:50px 20px;color:rgba(255,255,255,0.5);animation:uvdFadeIn 0.5s ease;">' +
                    '<div style="font-size:40px;margin-bottom:15px;opacity:0.4;">🔍</div>' +
                    '<div style="font-size:15px;font-weight:500;">Chưa tìm thấy stream nào</div>' +
                    '<div style="font-size:12px;margin-top:8px;opacity:0.6;">Đang monitor... Bấm Play video hoặc load thêm nội dung</div>' +
                '</div>';
            return;
        }
        
        var typeColors = {
            'M3U8': 'linear-gradient(135deg,#43A047,#66BB6A)',
            'MPD': 'linear-gradient(135deg,#7CB342,#9CCC65)',
            'MP4': 'linear-gradient(135deg,#F57C00,#FF9800)',
            'WEBM': 'linear-gradient(135deg,#F57C00,#FFA726)',
            'MKV': 'linear-gradient(135deg,#E64A19,#FF5722)',
            'FLV': 'linear-gradient(135deg,#D84315,#FF7043)',
            'TS': 'linear-gradient(135deg,#FBC02D,#FFC107)',
            'IFRAME': 'linear-gradient(135deg,#1E88E5,#42A5F5)'
        };
        
        arr.forEach(function(item, i) {
            var url = item.url;
            var type = item.type;
            var colorGradient = typeColors[type] || 'linear-gradient(135deg,#666,#888)';
            var fav = isFavorite(url);
            
            var card = document.createElement('div');
            card.className = '__uvd_stream_card__ __uvd_card__';
            card.style.cssText = 
                'background:rgba(255,255,255,0.04);' +
                'padding:16px;margin:10px 0;border-radius:12px;' +
                'border:1px solid rgba(255,255,255,0.08);' +
                'border-left:4px solid;' +
                'border-image:' + colorGradient + ' 1;' +
                'animation-delay:' + (i * 0.05) + 's;' +
                'backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);';
            
            card.innerHTML = 
                '<div style="display:flex;justify-content:space-between;margin-bottom:10px;align-items:center;">' +
                    '<span style="background:' + colorGradient + ';color:#fff;padding:5px 14px;border-radius:20px;font-size:11px;font-weight:700;letter-spacing:0.5px;box-shadow:0 4px 12px rgba(0,0,0,0.3);">#' + (i + 1) + ' ' + type + '</span>' +
                    '<div style="display:flex;gap:8px;align-items:center;">' +
                        '<span style="color:rgba(255,255,255,0.4);font-size:10px;">' + item.source + '</span>' +
                        '<button class="__uvd_fav__ __uvd_glass_btn__" data-url="' + encodeURIComponent(url) + '" data-type="' + type + '" style="background:transparent;border:0;font-size:18px;cursor:pointer;padding:2px 8px;transition:all 0.3s;text-shadow:0 0 10px rgba(255,215,0,0.5);">' + (fav ? '⭐' : '☆') + '</button>' +
                    '</div>' +
                '</div>' +
                '<div style="word-break:break-all;font-size:11px;font-family:monospace;background:rgba(0,0,0,0.3);padding:10px;margin-bottom:10px;border-radius:8px;max-height:65px;overflow-y:auto;color:rgba(255,255,255,0.6);line-height:1.6;border:1px solid rgba(255,255,255,0.05);">' + url + '</div>';
            
            var buttons = '<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:7px;">';
            buttons += '<button class="__uvd_act__ __uvd_glass_btn__" data-url="' + encodeURIComponent(url) + '" data-action="share" style="background:rgba(239,83,80,0.3);color:#FF8A80;border:1px solid rgba(239,83,80,0.3);padding:10px;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;">📱 YTDLnis</button>';
            buttons += '<button class="__uvd_act__ __uvd_glass_btn__" data-url="' + encodeURIComponent(url) + '" data-action="copy" style="background:rgba(92,107,192,0.3);color:#9FA8DA;border:1px solid rgba(92,107,192,0.3);padding:10px;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;">📋 Copy</button>';
            
            if (type === 'IFRAME') {
                buttons += '<a href="' + url + '" class="__uvd_glass_btn__" style="background:rgba(38,198,218,0.3);color:#80DEEA;padding:10px;border-radius:8px;font-size:12px;font-weight:700;text-decoration:none;text-align:center;grid-column:1/3;border:1px solid rgba(38,198,218,0.3);display:block;">➡️ Vào iframe</a>';
            } else {
                if (type === 'M3U8') {
                    buttons += '<button class="__uvd_act__ __uvd_glass_btn__" data-url="' + encodeURIComponent(url) + '" data-action="quality" data-type="' + type + '" style="background:rgba(156,39,176,0.3);color:#CE93D8;border:1px solid rgba(156,39,176,0.3);padding:10px;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;">🎞️ Quality</button>';
                    buttons += '<button class="__uvd_act__ __uvd_glass_btn__" data-url="' + encodeURIComponent(url) + '" data-action="preview" style="background:rgba(0,188,212,0.3);color:#80DEEA;border:1px solid rgba(0,188,212,0.3);padding:10px;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;">▶️ Preview</button>';
                }
                buttons += '<button class="__uvd_act__ __uvd_glass_btn__" data-url="' + encodeURIComponent(url) + '" data-action="cmd" data-type="' + type + '" style="background:rgba(233,30,99,0.3);color:#F48FB1;border:1px solid rgba(233,30,99,0.3);padding:10px;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;grid-column:1/3;">⚙️ Tất cả lệnh tải</button>';
            }
            buttons += '</div>';
            
            card.innerHTML += buttons;
            container.appendChild(card);
            
            // Add ripple to all buttons in card
            [].forEach.call(card.querySelectorAll('button'), function(b) { addRippleEffect(b); });
        });
        
        bindStreamEvents();
    }
    
    function bindStreamEvents() {
        document.querySelectorAll('.__uvd_fav__').forEach(function(b) {
            b.onclick = function() {
                var url = decodeURIComponent(this.dataset.url);
                var isFav = toggleFavorite(url, this.dataset.type);
                this.innerText = isFav ? '⭐' : '☆';
                this.style.transform = 'scale(1.3)';
                setTimeout(() => this.style.transform = 'scale(1)', 200);
            };
        });
        
        document.querySelectorAll('.__uvd_act__').forEach(function(b) {
            b.onclick = function() {
                var url = decodeURIComponent(this.dataset.url);
                var action = this.dataset.action;
                var type = this.dataset.type;
                
                addToHistory(url, type || 'IFRAME');
                
                if (action === 'share') shareUrl(url);
                else if (action === 'copy') { showEditor(url, '📋 URL'); }
                else if (action === 'quality') showQualityPicker(url);
                else if (action === 'preview') showPreview(url);
                else if (action === 'cmd') showCommandPicker(url, type);
            };
        });
    }
    
    // ========== QUALITY PICKER ==========
    function showQualityPicker(url) {
        var overlay = createOverlay();
        overlay.innerHTML = 
            '<div style="color:#fff;font:bold 17px Arial;margin-bottom:15px;text-align:center;">🎞️ Đang phân tích M3U8...</div>' +
            '<div style="text-align:center;color:rgba(255,255,255,0.5);padding:30px;">' +
                '<div style="font-size:40px;animation:uvdPulse 1.5s infinite;">⏳</div>' +
            '</div>';
        
        parseM3U8Master(url, function(qualities) {
            if (!qualities) {
                overlay.innerHTML = 
                    '<div class="__uvd_overlay__" style="color:#EF5350;font:bold 17px Arial;margin-bottom:15px;">❌ Không phải Master Playlist</div>' +
                    '<div style="color:rgba(255,255,255,0.7);margin-bottom:20px;">Đây là stream đơn, không có nhiều chất lượng.</div>' +
                    '<button id="__uvd_qp_close__" class="__uvd_glass_btn__" style="background:rgba(239,83,80,0.3);color:#EF5350;border:1px solid rgba(239,83,80,0.3);padding:14px;border-radius:10px;font-weight:700;width:100%;">Đóng</button>';
                document.getElementById('__uvd_qp_close__').onclick = function() { overlay.remove(); };
                addRippleEffect(document.getElementById('__uvd_qp_close__'));
                return;
            }
            
            var html = '<div style="color:#fff;font:bold 17px Arial;margin-bottom:15px;">🎞️ Chọn chất lượng (' + qualities.length + ')</div>';
            qualities.forEach(function(q, i) {
                html += '<div style="background:rgba(255,255,255,0.06);padding:14px;margin-bottom:10px;border-radius:12px;border:1px solid rgba(255,255,255,0.08);animation:uvdSlideUp 0.3s ease forwards;animation-delay:' + (i*0.05) + 's;">';
                html += '<div style="display:flex;justify-content:space-between;margin-bottom:8px;">';
                html += '<b style="color:#fff;font-size:15px;">' + q.label + '</b>';
                html += '<span style="color:rgba(255,255,255,0.5);font-size:11px;">' + Math.round(q.bandwidth/1000) + ' kbps</span>';
                html += '</div>';
                html += '<div style="color:rgba(255,255,255,0.4);font-size:10px;margin-bottom:10px;">📐 ' + q.resolution + (q.codecs ? ' · ' + q.codecs : '') + '</div>';
                html += '<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:8px;">';
                html += '<button class="__uvd_qbtn__ __uvd_glass_btn__" data-url="' + encodeURIComponent(q.url) + '" data-action="share" style="background:rgba(239,83,80,0.3);color:#FF8A80;border:1px solid rgba(239,83,80,0.3);padding:10px;border-radius:8px;font-size:12px;font-weight:700;">📱 YTDLnis</button>';
                html += '<button class="__uvd_qbtn__ __uvd_glass_btn__" data-url="' + encodeURIComponent(q.url) + '" data-action="cmd" style="background:rgba(233,30,99,0.3);color:#F48FB1;border:1px solid rgba(233,30,99,0.3);padding:10px;border-radius:8px;font-size:12px;font-weight:700;">⚙️ Lệnh</button>';
                html += '</div></div>';
            });
            html += '<button id="__uvd_qp_close__" class="__uvd_glass_btn__" style="background:rgba(239,83,80,0.3);color:#EF5350;border:1px solid rgba(239,83,80,0.3);padding:14px;border-radius:10px;font-weight:700;width:100%;margin-top:10px;">✕ Đóng</button>';
            overlay.innerHTML = html;
            
            document.querySelectorAll('.__uvd_qbtn__').forEach(function(b) {
                addRippleEffect(b);
                b.onclick = function() {
                    var qUrl = decodeURIComponent(this.dataset.url);
                    var action = this.dataset.action;
                    overlay.remove();
                    if (action === 'share') shareUrl(qUrl);
                    else showCommandPicker(qUrl, 'M3U8');
                };
            });
            document.getElementById('__uvd_qp_close__').onclick = function() { overlay.remove(); };
            addRippleEffect(document.getElementById('__uvd_qp_close__'));
        });
    }
    
    // ========== PREVIEW PLAYER ==========
    function showPreview(url) {
        var overlay = createOverlay();
        overlay.style.padding = '0';
        overlay.innerHTML = 
            '<div style="background:rgba(255,255,255,0.06);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);padding:16px;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid rgba(255,255,255,0.1);">' +
                '<b style="color:#fff;font-size:16px;">▶️ Preview Stream</b>' +
                '<button id="__uvd_pv_close__" class="__uvd_glass_btn__" style="background:rgba(239,83,80,0.3);color:#EF5350;border:1px solid rgba(239,83,80,0.3);padding:10px 18px;border-radius:8px;font-weight:700;">✕</button>' +
            '</div>' +
            '<div style="flex:1;display:flex;flex-direction:column;padding:20px;">' +
                '<video id="__uvd_pv__" controls autoplay style="width:100%;max-height:65vh;background:#000;border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,0.5);"></video>' +
                '<div id="__uvd_pv_status__" style="color:rgba(255,255,255,0.5);margin-top:12px;font-size:13px;text-align:center;">⏳ Đang load...</div>' +
            '</div>';
        
        var video = document.getElementById('__uvd_pv__');
        var status = document.getElementById('__uvd_pv_status__');
        
        if (url.includes('.m3u8')) {
            if (window.Hls) { initHls(); }
            else {
                var hlsScript = document.createElement('script');
                hlsScript.src = 'https://cdn.jsdelivr.net/npm/hls.js@latest';
                hlsScript.onload = initHls;
                hlsScript.onerror = function() {
                    status.innerText = '❌ Không load được HLS.js - Thử copy URL và mở bằng VLC';
                    video.src = url;
                };
                document.head.appendChild(hlsScript);
            }
        } else {
            video.src = url;
            status.innerText = '▶️ Playing MP4';
        }
        
        function initHls() {
            if (Hls.isSupported()) {
                var hls = new Hls();
                hls.loadSource(url);
                hls.attachMedia(video);
                hls.on(Hls.Events.MANIFEST_PARSED, function() {
                    status.innerText = '✅ HLS loaded - ' + (hls.levels.length) + ' quality levels';
                });
                hls.on(Hls.Events.ERROR, function(e, d) {
                    status.innerText = '❌ Error: ' + d.details;
                });
            } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
                video.src = url;
                status.innerText = '▶️ Native HLS';
            }
        }
        
        document.getElementById('__uvd_pv_close__').onclick = function() {
            video.pause(); video.src = '';
            overlay.style.animation = 'uvdSlideOut 0.3s ease forwards';
            setTimeout(function() { overlay.remove(); }, 300);
        };
        addRippleEffect(document.getElementById('__uvd_pv_close__'));
    }
    
    // ========== COMMAND PICKER ==========
    function showCommandPicker(url, type) {
        var cmds = makeCommands(url, type, pageInfo.title);
        var overlay = createOverlay();
        var html = '<div style="color:#fff;font:bold 17px Arial;margin-bottom:15px;">⚙️ Chọn lệnh tải</div>';
        
        Object.keys(cmds).forEach(function(key, i) {
            var c = cmds[key];
            html += '<div style="background:rgba(255,255,255,0.06);padding:14px;margin-bottom:10px;border-radius:12px;border:1px solid rgba(255,255,255,0.08);animation:uvdSlideUp 0.3s ease forwards;animation-delay:' + (i*0.05) + 's;">';
            html += '<div style="color:#FFB74D;font-weight:700;margin-bottom:8px;font-size:14px;">' + c.label + '</div>';
            html += '<div style="background:rgba(0,0,0,0.4);padding:10px;border-radius:8px;font-family:monospace;font-size:10px;color:rgba(255,255,255,0.6);word-break:break-all;margin-bottom:10px;max-height:70px;overflow-y:auto;line-height:1.5;">' + c.cmd + '</div>';
            html += '<button class="__uvd_cbtn__ __uvd_glass_btn__" data-cmd="' + encodeURIComponent(c.cmd) + '" data-label="' + c.label + '" style="background:rgba(92,107,192,0.3);color:#9FA8DA;border:1px solid rgba(92,107,192,0.3);padding:10px 18px;border-radius:8px;font-weight:700;width:100%;">📋 Chọn & sửa</button>';
            html += '</div>';
        });
        
        html += '<button id="__uvd_cp_close__" class="__uvd_glass_btn__" style="background:rgba(239,83,80,0.3);color:#EF5350;border:1px solid rgba(239,83,80,0.3);padding:14px;border-radius:10px;font-weight:700;width:100%;">✕ Đóng</button>';
        overlay.innerHTML = html;
        
        document.querySelectorAll('.__uvd_cbtn__').forEach(function(b) {
            addRippleEffect(b);
            b.onclick = function() {
                var cmd = decodeURIComponent(this.dataset.cmd);
                var label = this.dataset.label;
                overlay.remove();
                showEditor(cmd, label);
            };
        });
        document.getElementById('__uvd_cp_close__').onclick = function() { overlay.remove(); };
        addRippleEffect(document.getElementById('__uvd_cp_close__'));
    }
    
    // ========== EDITOR ==========
    function showEditor(text, title) {
        var overlay = createOverlay();
        overlay.innerHTML = 
            '<div style="color:#fff;font:bold 16px Arial;margin-bottom:5px;">✏️ ' + title + '</div>' +
            '<div style="color:rgba(255,255,255,0.4);font-size:11px;margin-bottom:12px;">Sửa lệnh trước khi copy</div>' +
            '<textarea id="__uvd_edit__" style="flex:1;background:rgba(0,0,0,0.5);color:#fff;border:1px solid rgba(255,255,255,0.2);border-radius:10px;padding:14px;font:13px monospace;resize:none;line-height:1.6;outline:none;transition:border 0.3s;" onfocus="this.style.borderColor=\'rgba(92,107,192,0.6)\'" onblur="this.style.borderColor=\'rgba(255,255,255,0.2)\'">' + text.replace(/</g, '&lt;') + '</textarea>' +
            '<div style="display:flex;gap:10px;margin-top:12px;">' +
                '<button id="__uvd_ed_ok__" class="__uvd_glass_btn__" style="background:rgba(92,107,192,0.4);color:#fff;border:1px solid rgba(92,107,192,0.4);padding:14px;border-radius:10px;font:bold 15px Arial;flex:1;">✓ Copy</button>' +
                '<button id="__uvd_ed_share__" class="__uvd_glass_btn__" style="background:rgba(239,83,80,0.4);color:#FF8A80;border:1px solid rgba(239,83,80,0.4);padding:14px;border-radius:10px;font:bold 15px Arial;flex:1;">📱 Share</button>' +
                '<button id="__uvd_ed_no__" class="__uvd_glass_btn__" style="background:rgba(255,255,255,0.06);color:#fff;border:1px solid rgba(255,255,255,0.1);padding:14px;border-radius:10px;font:bold 15px Arial;flex:1;">✕ Hủy</button>' +
            '</div>';
        
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
        
        ['__uvd_ed_ok__', '__uvd_ed_share__', '__uvd_ed_no__'].forEach(function(id) {
            addRippleEffect(document.getElementById(id));
        });
    }
    
    // ========== OVERLAY HELPER ==========
    function createOverlay() {
        var overlay = document.createElement('div');
        overlay.className = '__uvd_overlay__';
        overlay.style.cssText = 
            'position:fixed;inset:0;background:rgba(0,0,0,0.7);' +
            'backdrop-filter:blur(15px);-webkit-backdrop-filter:blur(15px);' +
            'z-index:2147483648;padding:18px;display:flex;flex-direction:column;gap:10px;overflow-y:auto;';
        document.body.appendChild(overlay);
        return overlay;
    }
    
    // ========== RENDER: FAVORITES ==========
    function renderFavorites(container) {
        if (!data.favorites.length) {
            container.innerHTML = 
                '<div style="text-align:center;padding:50px 20px;color:rgba(255,255,255,0.4);animation:uvdFadeIn 0.5s ease;">' +
                    '<div style="font-size:40px;margin-bottom:15px;">⭐</div>' +
                    '<div style="font-size:15px;">Chưa có favorites</div>' +
                    '<div style="font-size:12px;margin-top:8px;opacity:0.6;">Bấm ☆ trên stream để thêm</div>' +
                '</div>';
            return;
        }
        
        data.favorites.forEach(function(fav, i) {
            var card = document.createElement('div');
            card.className = '__uvd_card__';
            card.style.cssText = 
                'background:rgba(255,255,255,0.04);padding:14px;margin:10px 0;border-radius:12px;' +
                'border:1px solid rgba(255,215,0,0.2);border-left:4px solid gold;' +
                'animation-delay:' + (i*0.05) + 's;' +
                'backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);';
            card.innerHTML = 
                '<div style="display:flex;justify-content:space-between;margin-bottom:8px;">' +
                    '<b style="color:gold;font-size:13px;">⭐ ' + fav.type + '</b>' +
                    '<span style="color:rgba(255,255,255,0.4);font-size:10px;">' + new Date(fav.timestamp).toLocaleDateString() + '</span>' +
                '</div>' +
                '<div style="color:#fff;font-size:12px;margin-bottom:5px;font-weight:500;">' + fav.title + '</div>' +
                '<div style="color:rgba(255,255,255,0.4);font-size:10px;margin-bottom:8px;">🌐 ' + fav.host + '</div>' +
                '<div style="word-break:break-all;font-size:10px;font-family:monospace;background:rgba(0,0,0,0.4);padding:8px;border-radius:6px;margin-bottom:8px;max-height:45px;overflow-y:auto;color:rgba(255,255,255,0.5);">' + fav.url + '</div>' +
                '<div style="display:flex;gap:6px;">' +
                    '<button class="__uvd_fbtn__ __uvd_glass_btn__" data-url="' + encodeURIComponent(fav.url) + '" data-action="share" style="background:rgba(239,83,80,0.3);color:#FF8A80;border:1px solid rgba(239,83,80,0.3);padding:8px;border-radius:6px;font-size:11px;font-weight:700;flex:1;">📱 YTDLnis</button>' +
                    '<button class="__uvd_fbtn__ __uvd_glass_btn__" data-url="' + encodeURIComponent(fav.url) + '" data-action="copy" style="background:rgba(92,107,192,0.3);color:#9FA8DA;border:1px solid rgba(92,107,192,0.3);padding:8px;border-radius:6px;font-size:11px;font-weight:700;flex:1;">📋 Copy</button>' +
                    '<button class="__uvd_fbtn__ __uvd_glass_btn__" data-idx="' + i + '" data-action="del" style="background:rgba(239,83,80,0.3);color:#EF5350;border:1px solid rgba(239,83,80,0.3);padding:8px 12px;border-radius:6px;font-size:11px;font-weight:700;">🗑️</button>' +
                '</div>';
            container.appendChild(card);
            
            [].forEach.call(card.querySelectorAll('button'), function(b) { addRippleEffect(b); });
        });
        
        document.querySelectorAll('.__uvd_fbtn__').forEach(function(b) {
            b.onclick = function() {
                var action = this.dataset.action;
                if (action === 'del') {
                    data.favorites.splice(parseInt(this.dataset.idx), 1);
                    storage.set(data);
                    buildUI();
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
        var history = data.history || [];
        if (!history.length) {
            container.innerHTML = 
                '<div style="text-align:center;padding:50px 20px;color:rgba(255,255,255,0.4);animation:uvdFadeIn 0.5s ease;">' +
                    '<div style="font-size:40px;margin-bottom:15px;">📜</div>' +
                    '<div style="font-size:15px;">Chưa có history</div>' +
                '</div>';
            return;
        }
        
        var clearBtn = document.createElement('button');
        clearBtn.className = '__uvd_glass_btn__';
        clearBtn.innerText = '🗑️ Xóa tất cả history';
        clearBtn.style.cssText = 
            'background:rgba(239,83,80,0.3);color:#EF5350;border:1px solid rgba(239,83,80,0.3);padding:12px;border-radius:10px;font-weight:700;width:100%;margin-bottom:12px;';
        clearBtn.onclick = function() {
            if (confirm('Xóa toàn bộ history?')) {
                data.history = [];
                storage.set(data);
                buildUI();
            }
        };
        addRippleEffect(clearBtn);
        container.appendChild(clearBtn);
        
        history.forEach(function(h, i) {
            var card = document.createElement('div');
            card.className = '__uvd_card__';
            card.style.cssText = 
                'background:rgba(255,255,255,0.04);padding:12px;margin:8px 0;border-radius:10px;' +
                'border:1px solid rgba(255,255,255,0.06);animation-delay:' + (i*0.03) + 's;';
            card.innerHTML = 
                '<div style="display:flex;justify-content:space-between;margin-bottom:5px;">' +
                    '<b style="color:rgba(38,198,218,0.9);font-size:12px;">' + h.type + '</b>' +
                    '<span style="color:rgba(255,255,255,0.4);font-size:10px;">' + new Date(h.timestamp).toLocaleString() + '</span>' +
                '</div>' +
                '<div style="color:#fff;font-size:12px;">' + h.title + '</div>' +
                '<div style="color:rgba(255,255,255,0.4);font-size:10px;">🌐 ' + h.host + '</div>' +
                '<div style="word-break:break-all;font-size:10px;font-family:monospace;color:rgba(255,255,255,0.5);margin-top:5px;max-height:35px;overflow-y:auto;">' + h.url + '</div>';
            container.appendChild(card);
        });
    }
    
    // ========== RENDER: SETTINGS ==========
    function renderSettings(container) {
        var html = '<div style="color:#fff;font-weight:700;margin-bottom:18px;font-size:16px;">⚙️ Settings</div>';
        
        // Theme
        html += '<div style="background:rgba(255,255,255,0.05);padding:14px;margin-bottom:12px;border-radius:12px;border:1px solid rgba(255,255,255,0.08);">';
        html += '<div style="color:#fff;font-weight:600;margin-bottom:12px;">🎨 Theme</div>';
        html += '<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:8px;">';
        ['glass', 'dark', 'purple', 'matrix'].forEach(function(th) {
            var active = data.theme === th;
            html += '<button class="__uvd_theme__ __uvd_glass_btn__" data-theme="' + th + '" style="background:' + (active ? 'rgba(92,107,192,0.5)' : 'rgba(255,255,255,0.06)') + ';color:#fff;border:1px solid ' + (active ? 'rgba(92,107,192,0.5)' : 'rgba(255,255,255,0.1)') + ';padding:12px;border-radius:8px;font-weight:600;text-transform:capitalize;">' + th + '</button>';
        });
        html += '</div></div>';
        
        // Site profiles
        html += '<div style="background:rgba(255,255,255,0.05);padding:14px;margin-bottom:12px;border-radius:12px;border:1px solid rgba(255,255,255,0.08);">';
        html += '<div style="color:#fff;font-weight:600;margin-bottom:12px;">🌐 Site Profiles</div>';
        var profiles = Object.keys(data.siteProfiles);
        if (!profiles.length) {
            html += '<div style="color:rgba(255,255,255,0.4);font-size:12px;">Chưa có profile nào. Bấm vào Referer để lưu.</div>';
        } else {
            profiles.forEach(function(p) {
                html += '<div style="background:rgba(0,0,0,0.3);padding:10px;margin-bottom:8px;border-radius:8px;font-size:11px;">';
                html += '<div style="color:#fff;font-weight:600;">' + p + '</div>';
                html += '<div style="color:rgba(255,255,255,0.5);font-family:monospace;font-size:10px;word-break:break-all;">' + data.siteProfiles[p].referer + '</div>';
                html += '<button class="__uvd_delprofile__ __uvd_glass_btn__" data-host="' + p + '" style="background:rgba(239,83,80,0.3);color:#EF5350;border:1px solid rgba(239,83,80,0.3);padding:5px 10px;border-radius:5px;font-size:10px;margin-top:6px;">🗑️ Xóa</button>';
                html += '</div>';
            });
        }
        html += '</div>';
        
        // Backup
        html += '<div style="background:rgba(255,255,255,0.05);padding:14px;margin-bottom:12px;border-radius:12px;border:1px solid rgba(255,255,255,0.08);">';
        html += '<div style="color:#fff;font-weight:600;margin-bottom:12px;">💾 Backup</div>';
        html += '<button id="__uvd_backup__" class="__uvd_glass_btn__" style="background:rgba(92,107,192,0.3);color:#9FA8DA;border:1px solid rgba(92,107,192,0.3);padding:12px;border-radius:8px;font-weight:600;width:100%;margin-bottom:8px;">📤 Export data</button>';
        html += '<button id="__uvd_restore__" class="__uvd_glass_btn__" style="background:rgba(38,198,218,0.3);color:#80DEEA;border:1px solid rgba(38,198,218,0.3);padding:12px;border-radius:8px;font-weight:600;width:100%;margin-bottom:8px;">📥 Import data</button>';
        html += '<button id="__uvd_reset__" class="__uvd_glass_btn__" style="background:rgba(239,83,80,0.3);color:#EF5350;border:1px solid rgba(239,83,80,0.3);padding:12px;border-radius:8px;font-weight:600;width:100%;">🔥 Reset toàn bộ</button>';
        html += '</div>';
        
        // Info
        html += '<div style="background:rgba(255,255,255,0.05);padding:14px;border-radius:12px;font-size:11px;color:rgba(255,255,255,0.5);border:1px solid rgba(255,255,255,0.08);">';
        html += '<div>📦 Version: 3.0 Glass</div>';
        html += '<div>👤 By: nguyenquocngu93</div>';
        html += '<div>💾 Favorites: ' + data.favorites.length + '</div>';
        html += '<div>📜 History: ' + (data.history || []).length + '</div>';
        html += '</div>';
        
        container.innerHTML = html;
        
        // Bind events
        document.querySelectorAll('.__uvd_theme__').forEach(function(b) {
            addRippleEffect(b);
            b.onclick = function() {
                data.theme = this.dataset.theme;
                storage.set(data);
                buildUI();
                toast('🎨 Theme: ' + data.theme);
            };
        });
        
        document.querySelectorAll('.__uvd_delprofile__').forEach(function(b) {
            addRippleEffect(b);
            b.onclick = function() {
                delete data.siteProfiles[this.dataset.host];
                storage.set(data);
                buildUI();
                toast('🗑️ Đã xóa profile');
            };
        });
        
        ['__uvd_backup__', '__uvd_restore__', '__uvd_reset__'].forEach(function(id) {
            var el = document.getElementById(id);
            if (el) addRippleEffect(el);
        });
        
        document.getElementById('__uvd_backup__').onclick = function() {
            var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            var a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = 'uvd_backup_' + Date.now() + '.json';
            a.click();
            toast('📤 Đã export backup');
        };
        
        document.getElementById('__uvd_restore__').onclick = function() {
            var input = document.createElement('input');
            input.type = 'file'; input.accept = '.json';
            input.onchange = function(e) {
                var reader = new FileReader();
                reader.onload = function(ev) {
                    try {
                        var newData = JSON.parse(ev.target.result);
                        data = Object.assign(data, newData);
                        storage.set(data);
                        toast('✓ Đã import');
                        buildUI();
                    } catch(err) { toast('❌ File không hợp lệ', '#EF5350'); }
                };
                reader.readAsText(e.target.files[0]);
            };
            input.click();
        };
        
        document.getElementById('__uvd_reset__').onclick = function() {
            if (confirm('Xóa TOÀN BỘ favorites, history, settings?')) {
                localStorage.removeItem(STORAGE_KEY);
                data = { favorites: [], theme: 'glass', siteProfiles: {}, history: [] };
                toast('🔥 Đã reset');
                buildUI();
            }
        };
    }
    
    // ========== START ==========
    buildUI();
    
    // Auto refresh counter
    var lastCount = urls.size;
    var autoRefresh = setInterval(function() {
        if (!document.getElementById('__uvd__') && !document.getElementById('__uvd_mini__')) {
            clearInterval(autoRefresh);
            stopMonitor();
            return;
        }
        if (urls.size !== lastCount && !isMinimized) {
            lastCount = urls.size;
            // Silent update - chỉ rebuild nếu không bị minimize
            var panel = document.getElementById('__uvd__');
            if (panel && panel.style.display !== 'none') {
                buildUI();
            }
        }
    }, 3000);
    
    console.log('✅ Universal DL V3 Glass loaded! Found', urls.size, 'streams');
    toast('✨ V3 Glass Ready! Live monitoring active');
})();