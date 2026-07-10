/**
 * Universal Video Downloader V2 - Glass UI Edition
 * Features: Glassmorphism, CSS-only Icons, Advanced Preview, Live Monitoring
 * Author: nguyenquocngu93 (Modified)
 */
(function() {
    'use strict';
    
    // ========== INIT & STORAGE ==========
    var old = document.getElementById('__uvd__');
    if (old) old.remove();
    
    var STORAGE_KEY = 'uvd_data_v2_glass';
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
    data.theme = 'glass'; // Force glass theme
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
                        var qualityLabel = resolution === 'unknown' ? Math.round(bandwidth/1000) + 'kbps' : resolution.split('x')[1] + 'p';
                        
                        var streamUrl = nextLine;
                        if (!streamUrl.startsWith('http')) {
                            var baseUrl = url.substring(0, url.lastIndexOf('/') + 1);
                            streamUrl = baseUrl + streamUrl;
                        }
                        
                        qualities.push({ label: qualityLabel, resolution: resolution, bandwidth: bandwidth, url: streamUrl });
                    }
                }
            }
            qualities.sort(function(a, b) { return (parseInt(b.resolution.split('x')[1]) || 0) - (parseInt(a.resolution.split('x')[1]) || 0); });
            callback(qualities);
        })
        .catch(function(e) { console.error(e); callback(null); });
    }
    
    // ========== COMMANDS ==========
    function makeCommands(url, type, title) {
        var t = title;
        var ext = type.toLowerCase() === 'iframe' ? 'mp4' : type.toLowerCase();
        var ref = pageInfo.referer;
        var ua = pageInfo.userAgent;
        
        return {
            'yt-dlp': { label: 'yt-dlp (Basic)', cmd: 'yt-dlp --referer "' + ref + '" -o "' + t + '.%(ext)s" "' + url + '"' },
            'yt-dlp-hq': { label: 'yt-dlp (HQ)', cmd: 'yt-dlp --referer "' + ref + '" -f "bv*+ba/best" --merge-output-format mp4 --embed-thumbnail -o "' + t + '.%(ext)s" "' + url + '"' },
            'ffmpeg': { label: 'FFmpeg (Convert)', cmd: 'ffmpeg -headers "Referer: ' + ref + '\\r\\nUser-Agent: ' + ua + '" -i "' + url + '" -c copy -bsf:a aac_adtstoasc "' + t + '.mp4"' },
            'curl': { label: 'cURL', cmd: 'curl -H "Referer: ' + ref + '" -o "' + t + '.' + ext + '" "' + url + '"' },
            'aria2': { label: 'aria2c', cmd: 'aria2c --referer="' + ref + '" -x 16 -s 16 -o "' + t + '.' + ext + '" "' + url + '"' }
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
    
    function toast(msg) {
        var t = document.createElement('div');
        t.innerText = msg;
        // Glass Toast
        t.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);background:rgba(30,30,30,0.85);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);color:#fff;padding:12px 24px;border-radius:12px;z-index:2147483649;font:500 13px Arial,sans-serif;border:1px solid rgba(255,255,255,0.1);box-shadow:0 8px 32px rgba(0,0,0,0.3);transition:all 0.3s ease;';
        document.body.appendChild(t);
        setTimeout(function() { t.style.opacity = '0'; t.style.transform = 'translate(-50%, -20px)'; setTimeout(function(){t.remove();}, 300); }, 2500);
    }
    
    function shareUrl(url) {
        if (navigator.share) {
            navigator.share({ title: pageInfo.title, text: pageInfo.title, url: url }).catch(function() { copy(url); toast('URL copied'); });
        } else {
            copy(url);
            toast('URL copied to clipboard');
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
            toast('Removed from Favorites');
        } else {
            data.favorites.unshift({ url: url, type: type, title: pageInfo.title, host: pageInfo.host, timestamp: Date.now() });
            toast('Added to Favorites');
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
        } else if (format === 'txt') {
            content = arr.map(function(a) { return a.url; }).join('\n');
            mime = 'text/plain'; filename = pageInfo.title + '_urls.txt';
        } else {
            content = '#EXTM3U\n' + arr.filter(function(a) { return a.type !== 'IFRAME'; }).map(function(a) { return '#EXTINF:-1,' + a.title + '\n' + a.url; }).join('\n');
            mime = 'audio/x-mpegurl'; filename = pageInfo.title + '.m3u';
        }
        var blob = new Blob([content], { type: mime });
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = filename;
        a.click();
        URL.revokeObjectURL(a.href);
        toast('Exported ' + format.toUpperCase());
    }

    // ========== CSS ICONS GENERATOR ==========
    // Creates pure CSS shapes instead of emojis
    function cssIcon(name) {
        var style = '';
        switch(name) {
            case 'close': // X shape
                style = 'width:12px;height:12px;position:relative;';
                break;
            case 'refresh': // Circle arrow
                style = 'width:12px;height:12px;border:2px solid #fff;border-top-color:transparent;border-radius:50%;';
                break;
            case 'star-full': // Star
                style = 'width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;border-bottom:12px solid gold;position:relative;';
                break;
            case 'star-empty': // Outline star
                style = 'width:10px;height:10px;border:1px solid rgba(255,255,255,0.5);transform:rotate(45deg);';
                break;
            case 'play': // Triangle
                style = 'width:0;height:0;border-top:6px solid transparent;border-bottom:6px solid transparent;border-left:10px solid #fff;margin-left:2px;';
                break;
            case 'pause': // Two bars
                style = 'width:10px;height:12px;border-left:3px solid #fff;border-right:3px solid #fff;';
                break;
            case 'download': // Arrow down
                style = 'width:10px;height:10px;border-right:2px solid #fff;border-bottom:2px solid #fff;transform:rotate(45deg);margin-top:-4px;';
                break;
            case 'settings': // Gear/Cog (simplified as circle with dots)
                style = 'width:10px;height:10px;border:2px dashed #fff;border-radius:50%;';
                break;
            case 'camera': // Screenshot (Rectangle with circle)
                style = 'width:14px;height:10px;border:2px solid #fff;border-radius:2px;position:relative;';
                break;
            case 'speed': // Gauge/Tachometer
                style = 'width:12px;height:6px;border-top:2px solid #fff;border-left:2px solid #fff;border-right:2px solid #fff;border-radius:6px 6px 0 0;position:relative;';
                break;
        }
        return style;
    }

    // Helper to create icon elements
    function createIconEl(name) {
        var el = document.createElement('div');
        el.style.cssText = cssIcon(name);
        if(name === 'star-full') {
            el.innerHTML = '<div style="width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;border-bottom:12px solid gold;position:absolute;top:0;left:-6px;"></div>';
        }
        return el;
    }

    // ========== BUILD UI (GLASS THEME) ==========
    function buildUI() {
        var arr = [...urls.entries()].map(function(e) {
            return { url: e[0], type: e[1].type, source: e[1].source, priority: e[1].priority };
        }).sort(function(a, b) { return a.priority - b.priority; });
        
        var panel = document.createElement('div');
        panel.id = '__uvd__';
        // GLASS BLUR DARK UI
        panel.style.cssText = 'position:fixed;top:20px;left:20px;right:20px;bottom:20px;background:rgba(20, 20, 25, 0.75);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);color:#e0e0e0;padding:0;border-radius:16px;z-index:2147483647;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;font-size:13px;overflow:hidden;display:flex;flex-direction:column;box-shadow:0 25px 50px -12px rgba(0, 0, 0, 0.5);border:1px solid rgba(255, 255, 255, 0.08);';
        
        // Scrollbar styling
        var style = document.createElement('style');
        style.textContent = '#__uvd__ ::-webkit-scrollbar{width:6px}#__uvd__ ::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.2);border-radius:3px}#__uvd__ ::-webkit-scrollbar-track{background:transparent}';
        panel.appendChild(style);
        
        // Header
        var header = document.createElement('div');
        header.style.cssText = 'background:rgba(255,255,255,0.03);padding:15px 20px;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid rgba(255,255,255,0.05);';
        
        var titleDiv = document.createElement('div');
        titleDiv.innerHTML = '<b style="font-size:15px;color:#fff;letter-spacing:0.5px;">Universal DL V2</b><div style="font-size:11px;color:rgba(255,255,255,0.5);margin-top:2px;"><span style="display:inline-block;width:6px;height:6px;background:#ef4444;border-radius:50%;margin-right:5px;box-shadow:0 0 8px #ef4444;"></span>LIVE · ' + arr.length + ' streams</div>';
        
        var btnGroup = document.createElement('div');
        btnGroup.style.display = 'flex';
        btnGroup.style.gap = '8px';
        
        // Refresh Button (CSS Icon)
        var btnRef = document.createElement('button');
        btnRef.style.cssText = 'background:rgba(255,255,255,0.05);color:#fff;border:0;width:32px;height:32px;border-radius:8px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all 0.2s;';
        btnRef.appendChild(createIconEl('refresh'));
        btnRef.onmouseover = function(){this.style.background='rgba(255,255,255,0.1)';};
        btnRef.onmouseout = function(){this.style.background='rgba(255,255,255,0.05)';};
        btnRef.onclick = function() { buildUI(); toast('Refreshed'); };
        
        // Close Button (CSS Icon)
        var btnClose = document.createElement('button');
        btnClose.style.cssText = 'background:rgba(239,68,68,0.2);color:#ef4444;border:0;width:32px;height:32px;border-radius:8px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all 0.2s;';
        btnClose.appendChild(createIconEl('close'));
        btnClose.onmouseover = function(){this.style.background='rgba(239,68,68,0.4)';};
        btnClose.onmouseout = function(){this.style.background='rgba(239,68,68,0.2)';};
        btnClose.onclick = function() { stopMonitor(); panel.remove(); };
        
        btnGroup.appendChild(btnRef);
        btnGroup.appendChild(btnClose);
        header.appendChild(titleDiv);
        header.appendChild(btnGroup);
        panel.appendChild(header);
        
        // Tabs
        var tabs = document.createElement('div');
        tabs.style.cssText = 'display:flex;background:rgba(0,0,0,0.2);';
        var tabList = [
            { id: 'streams', label: 'Streams' },
            { id: 'favorites', label: 'Favorites' },
            { id: 'history', label: 'History' },
            { id: 'settings', label: 'Settings' }
        ];
        tabList.forEach(function(tab) {
            var b = document.createElement('button');
            b.className = '__uvd_tab__';
            b.dataset.tab = tab.id;
            b.innerText = tab.label;
            b.style.cssText = 'flex:1;background:transparent;color:rgba(255,255,255,0.5);border:0;padding:12px 5px;font-size:12px;font-weight:500;cursor:pointer;border-bottom:2px solid transparent;transition:all 0.2s;';
            b.onmouseover = function(){this.style.color='#fff';};
            b.onmouseout = function(){if(this.dataset.tab !== currentTab) this.style.color='rgba(255,255,255,0.5)';};
            tabs.appendChild(b);
        });
        panel.appendChild(tabs);
        
        // Content area
        var content = document.createElement('div');
        content.id = '__uvd_content__';
        content.style.cssText = 'flex:1;overflow-y:auto;padding:15px;';
        panel.appendChild(content);
        
        // Footer
        var footer = document.createElement('div');
        footer.style.cssText = 'background:rgba(0,0,0,0.2);padding:10px;border-top:1px solid rgba(255,255,255,0.05);display:flex;gap:8px;';
        ['TXT', 'JSON', 'M3U'].forEach(function(fmt) {
            var btn = document.createElement('button');
            btn.innerText = fmt;
            btn.style.cssText = 'flex:1;background:rgba(255,255,255,0.05);color:rgba(255,255,255,0.7);border:1px solid rgba(255,255,255,0.05);padding:8px;border-radius:6px;font-size:11px;cursor:pointer;transition:all 0.2s;';
            btn.onmouseover = function(){this.style.background='rgba(255,255,255,0.1)';this.style.color='#fff';};
            btn.onmouseout = function(){this.style.background='rgba(255,255,255,0.05)';this.style.color='rgba(255,255,255,0.7)';};
            btn.onclick = function() { exportData(fmt.toLowerCase()); };
            footer.appendChild(btn);
        });
        panel.appendChild(footer);
        
        document.body.appendChild(panel);
        
        var currentTab = 'streams';
        function renderTab(tabId) {
            currentTab = tabId;
            document.querySelectorAll('.__uvd_tab__').forEach(function(t) {
                if (t.dataset.tab === tabId) {
                    t.style.borderBottomColor = '#3b82f6';
                    t.style.color = '#fff';
                } else {
                    t.style.borderBottomColor = 'transparent';
                    t.style.color = 'rgba(255,255,255,0.5)';
                }
            });
            content.innerHTML = '';
            if (tabId === 'streams') renderStreams(content, arr);
            else if (tabId === 'favorites') renderFavorites(content);
            else if (tabId === 'history') renderHistory(content);
            else if (tabId === 'settings') renderSettings(content);
        }
        
        document.querySelectorAll('.__uvd_tab__').forEach(function(t) {
            t.onclick = function() { renderTab(this.dataset.tab); };
        });
        
        renderTab('streams');
    }
    
    // ========== RENDER: STREAMS ==========
    function renderStreams(container, arr) {
        if (!arr.length) {
            container.innerHTML = '<div style="text-align:center;padding:40px 20px;color:rgba(255,255,255,0.4);">No streams found yet.<br>Play the video or reload the page.</div>';
            return;
        }
        
        var typeColors = { 'M3U8': '#10b981', 'MPD': '#8b5cf6', 'MP4': '#f59e0b', 'WEBM': '#f59e0b', 'MKV': '#ef4444', 'IFRAME': '#3b82f6' };
        
        arr.forEach(function(item, i) {
            var url = item.url;
            var type = item.type;
            var color = typeColors[type] || '#6b7280';
            var fav = isFavorite(url);
            
            var card = document.createElement('div');
            card.style.cssText = 'background:rgba(255,255,255,0.03);padding:15px;margin-bottom:10px;border-radius:12px;border:1px solid rgba(255,255,255,0.05);transition:transform 0.2s;';
            card.onmouseover = function(){this.style.transform='translateY(-2px)';this.style.background='rgba(255,255,255,0.05)';};
            card.onmouseout = function(){this.style.transform='none';this.style.background='rgba(255,255,255,0.03)';};
            
            // Header Row
            var head = document.createElement('div');
            head.style.cssText = 'display:flex;justify-content:space-between;margin-bottom:10px;align-items:center;';
            
            var badge = document.createElement('span');
            badge.style.cssText = 'background:' + color + ';color:#000;padding:4px 10px;border-radius:20px;font-size:10px;font-weight:bold;text-transform:uppercase;';
            badge.innerText = type;
            
            var actions = document.createElement('div');
            actions.style.display = 'flex';
            actions.style.gap = '8px';
            
            // Fav Button (CSS Star)
            var btnFav = document.createElement('button');
            btnFav.style.cssText = 'background:transparent;border:0;cursor:pointer;padding:4px;opacity:' + (fav ? '1' : '0.3') + ';transition:opacity 0.2s;';
            btnFav.appendChild(createIconEl(fav ? 'star-full' : 'star-empty'));
            btnFav.onclick = function() {
                var isFav = toggleFavorite(url, type);
                this.innerHTML = '';
                this.appendChild(createIconEl(isFav ? 'star-full' : 'star-empty'));
                this.style.opacity = isFav ? '1' : '0.3';
            };
            
            actions.appendChild(btnFav);
            head.appendChild(badge);
            head.appendChild(actions);
            card.appendChild(head);
            
            // URL Text
            var urlBox = document.createElement('div');
            urlBox.style.cssText = 'word-break:break-all;font-size:11px;font-family:"SF Mono",Monaco,monospace;background:rgba(0,0,0,0.3);padding:10px;margin-bottom:12px;border-radius:8px;max-height:60px;overflow-y:auto;color:rgba(255,255,255,0.6);line-height:1.4;border:1px solid rgba(255,255,255,0.05);';
            urlBox.innerText = url;
            card.appendChild(urlBox);
            
            // Buttons Grid
            var grid = document.createElement('div');
            grid.style.cssText = 'display:grid;grid-template-columns:repeat(2,1fr);gap:8px;';
            
            var btnStyle = 'background:rgba(255,255,255,0.08);color:#fff;border:0;padding:10px;border-radius:8px;font-size:11px;font-weight:500;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px;transition:all 0.2s;';
            
            // Share Button
            var btnShare = document.createElement('button');
            btnShare.innerHTML = '<div style="width:8px;height:8px;background:#ef4444;border-radius:50%;"></div> YTDLnis';
            btnShare.style.cssText = btnStyle;
            btnShare.onmouseover = function(){this.style.background='rgba(239,68,68,0.2)';};
            btnShare.onmouseout = function(){this.style.background='rgba(255,255,255,0.08)';};
            btnShare.onclick = function() { addToHistory(url, type); shareUrl(url); };
            
            // Copy Button
            var btnCopy = document.createElement('button');
            btnCopy.innerHTML = '<div style="width:8px;height:8px;border:1px solid #fff;border-radius:1px;"></div> Copy URL';
            btnCopy.style.cssText = btnStyle;
            btnCopy.onmouseover = function(){this.style.background='rgba(255,255,255,0.15)';};
            btnCopy.onmouseout = function(){this.style.background='rgba(255,255,255,0.08)';};
            btnCopy.onclick = function() { addToHistory(url, type); copy(url); toast('URL Copied'); };
            
            grid.appendChild(btnShare);
            grid.appendChild(btnCopy);
            
            if (type !== 'IFRAME') {
                if (type === 'M3U8') {
                    var btnQual = document.createElement('button');
                    btnQual.innerText = 'Quality';
                    btnQual.style.cssText = btnStyle;
                    btnQual.onclick = function() { showQualityPicker(url); };
                    grid.appendChild(btnQual);
                    
                    var btnPrev = document.createElement('button');
                    btnPrev.innerHTML = '<div style="width:0;height:0;border-top:4px solid transparent;border-bottom:4px solid transparent;border-left:6px solid #fff;"></div> Preview';
                    btnPrev.style.cssText = btnStyle;
                    btnPrev.onclick = function() { showPreview(url); };
                    grid.appendChild(btnPrev);
                }
                
                var btnCmd = document.createElement('button');
                btnCmd.innerHTML = '<div style="width:8px;height:8px;border:2px dashed #fff;border-radius:50%;"></div> Commands';
                btnCmd.style.cssText = btnStyle + 'grid-column:1/3;';
                btnCmd.onclick = function() { showCommandPicker(url, type); };
                grid.appendChild(btnCmd);
            } else {
                var btnIframe = document.createElement('a');
                btnIframe.href = url;
                btnIframe.target = '_blank';
                btnIframe.innerText = 'Open Iframe';
                btnIframe.style.cssText = btnStyle + 'grid-column:1/3;text-decoration:none;';
                grid.appendChild(btnIframe);
            }
            
            card.appendChild(grid);
            container.appendChild(card);
        });
    }
    
    // ========== ADVANCED PREVIEW PLAYER ==========
    function showPreview(url) {
        var overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.9);backdrop-filter:blur(10px);z-index:2147483648;display:flex;flex-direction:column;align-items:center;justify-content:center;';
        
        var playerContainer = document.createElement('div');
        playerContainer.style.cssText = 'width:90%;max-width:800px;background:rgba(30,30,30,0.8);border-radius:16px;overflow:hidden;box-shadow:0 20px 50px rgba(0,0,0,0.5);border:1px solid rgba(255,255,255,0.1);';
        
        // Video Area
        var videoWrap = document.createElement('div');
        videoWrap.style.position = 'relative';
        videoWrap.style.background = '#000';
        
        var video = document.createElement('video');
        video.id = '__uvd_pv__';
        video.controls = false; // Custom controls
        video.style.cssText = 'width:100%;max-height:60vh;display:block;';
        
        // Custom Controls Bar
        var controls = document.createElement('div');
        controls.style.cssText = 'background:rgba(0,0,0,0.6);padding:10px 15px;display:flex;align-items:center;gap:15px;backdrop-filter:blur(5px);';
        
        // Play/Pause Button (CSS)
        var btnPlay = document.createElement('div');
        btnPlay.style.cssText = 'width:24px;height:24px;cursor:pointer;position:relative;';
        btnPlay.innerHTML = '<div style="width:0;height:0;border-top:8px solid transparent;border-bottom:8px solid transparent;border-left:12px solid #fff;" id="__uvd_play_icon__"></div>';
        btnPlay.onclick = function() {
            if(video.paused) { video.play(); this.innerHTML='<div style="width:12px;height:16px;border-left:4px solid #fff;border-right:4px solid #fff;"></div>'; }
            else { video.pause(); this.innerHTML='<div style="width:0;height:0;border-top:8px solid transparent;border-bottom:8px solid transparent;border-left:12px solid #fff;"></div>'; }
        };
        
        // Seek Bar
        var seekBar = document.createElement('input');
        seekBar.type = 'range';
        seekBar.min = 0;
        seekBar.max = 100;
        seekBar.value = 0;
        seekBar.style.cssText = 'flex:1;height:4px;-webkit-appearance:none;background:rgba(255,255,255,0.2);border-radius:2px;outline:none;';
        seekBar.oninput = function() {
            if(video.duration) video.currentTime = (this.value / 100) * video.duration;
        };
        
        // Time Display
        var timeDisplay = document.createElement('span');
        timeDisplay.style.cssText = 'font-size:11px;font-family:monospace;color:rgba(255,255,255,0.7);min-width:80px;text-align:right;';
        timeDisplay.innerText = '00:00 / 00:00';
        
        // Speed Control
        var btnSpeed = document.createElement('button');
        btnSpeed.innerText = '1x';
        btnSpeed.style.cssText = 'background:rgba(255,255,255,0.1);border:0;color:#fff;padding:4px 8px;border-radius:4px;font-size:11px;cursor:pointer;';
        btnSpeed.onclick = function() {
            var speeds = [0.5, 1, 1.5, 2];
            var cur = speeds.indexOf(video.playbackRate);
            var next = speeds[(cur + 1) % speeds.length];
            video.playbackRate = next;
            this.innerText = next + 'x';
        };
        
        // Screenshot Button (CSS Camera)
        var btnSnap = document.createElement('button');
        btnSnap.style.cssText = 'background:transparent;border:0;cursor:pointer;padding:5px;';
        btnSnap.innerHTML = '<div style="width:16px;height:12px;border:2px solid #fff;border-radius:2px;position:relative;"><div style="width:6px;height:6px;background:#fff;border-radius:50%;position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);"></div></div>';
        btnSnap.title = "Screenshot";
        btnSnap.onclick = function() {
            var canvas = document.createElement('canvas');
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            canvas.getContext('2d').drawImage(video, 0, 0);
            var link = document.createElement('a');
            link.download = 'snapshot_' + Date.now() + '.png';
            link.href = canvas.toDataURL();
            link.click();
            toast('Screenshot saved');
        };
        
        // Close Button
        var btnClose = document.createElement('button');
        btnClose.innerText = '✕';
        btnClose.style.cssText = 'background:rgba(239,68,68,0.2);color:#ef4444;border:0;width:24px;height:24px;border-radius:50%;cursor:pointer;font-weight:bold;';
        btnClose.onclick = function() {
            video.pause();
            video.src = '';
            overlay.remove();
        };
        
        controls.appendChild(btnPlay);
        controls.appendChild(seekBar);
        controls.appendChild(timeDisplay);
        controls.appendChild(btnSpeed);
        controls.appendChild(btnSnap);
        controls.appendChild(btnClose);
        
        videoWrap.appendChild(video);
        playerContainer.appendChild(videoWrap);
        playerContainer.appendChild(controls);
        overlay.appendChild(playerContainer);
        document.body.appendChild(overlay);
        
        // Video Events
        video.addEventListener('timeupdate', function() {
            if(video.duration) {
                seekBar.value = (video.currentTime / video.duration) * 100;
                var cur = new Date(video.currentTime * 1000).toISOString().substr(14, 5);
                var dur = new Date(video.duration * 1000).toISOString().substr(14, 5);
                timeDisplay.innerText = cur + ' / ' + dur;
            }
        });
        
        // Load Logic
        var statusMsg = document.createElement('div');
        statusMsg.style.cssText = 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);color:#fff;background:rgba(0,0,0,0.7);padding:10px 20px;border-radius:8px;font-size:12px;pointer-events:none;';
        statusMsg.innerText = 'Loading...';
        videoWrap.appendChild(statusMsg);
        
        if (url.includes('.m3u8')) {
            if (window.Hls) initHls();
            else {
                var s = document.createElement('script');
                s.src = 'https://cdn.jsdelivr.net/npm/hls.js@latest';
                s.onload = initHls;
                document.head.appendChild(s);
            }
        } else {
            video.src = url;
            statusMsg.style.display = 'none';
        }
        
        function initHls() {
            if (Hls.isSupported()) {
                var hls = new Hls();
                hls.loadSource(url);
                hls.attachMedia(video);
                hls.on(Hls.Events.MANIFEST_PARSED, function() {
                    statusMsg.style.display = 'none';
                    video.play();
                    btnPlay.innerHTML = '<div style="width:12px;height:16px;border-left:4px solid #fff;border-right:4px solid #fff;"></div>';
                });
                hls.on(Hls.Events.ERROR, function() { statusMsg.innerText = 'Error loading stream'; });
            } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
                video.src = url;
                statusMsg.style.display = 'none';
            }
        }
    }
    
    // ========== COMMAND PICKER ==========
    function showCommandPicker(url, type) {
        var cmds = makeCommands(url, type, pageInfo.title);
        var overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.8);backdrop-filter:blur(5px);z-index:2147483648;padding:20px;overflow-y:auto;display:flex;justify-content:center;';
        
        var modal = document.createElement('div');
        modal.style.cssText = 'background:rgba(30,30,35,0.95);width:100%;max-width:600px;border-radius:16px;padding:20px;border:1px solid rgba(255,255,255,0.1);';
        
        var title = document.createElement('h3');
        title.innerText = 'Download Commands';
        title.style.cssText = 'color:#fff;margin:0 0 15px 0;font-size:16px;';
        modal.appendChild(title);
        
        Object.keys(cmds).forEach(function(key) {
            var c = cmds[key];
            var row = document.createElement('div');
            row.style.cssText = 'background:rgba(0,0,0,0.3);padding:12px;margin-bottom:10px;border-radius:8px;border:1px solid rgba(255,255,255,0.05);';
            
            var label = document.createElement('div');
            label.style.cssText = 'color:#3b82f6;font-weight:bold;margin-bottom:6px;font-size:13px;';
            label.innerText = c.label;
            
            var code = document.createElement('div');
            code.style.cssText = 'background:rgba(0,0,0,0.5);padding:8px;border-radius:4px;font-family:monospace;font-size:11px;color:rgba(255,255,255,0.7);word-break:break-all;margin-bottom:8px;';
            code.innerText = c.cmd;
            
            var btn = document.createElement('button');
            btn.innerText = 'Copy Command';
            btn.style.cssText = 'background:rgba(255,255,255,0.1);color:#fff;border:0;padding:6px 12px;border-radius:4px;font-size:11px;cursor:pointer;';
            btn.onclick = function() { copy(c.cmd); toast('Command copied'); };
            
            row.appendChild(label);
            row.appendChild(code);
            row.appendChild(btn);
            modal.appendChild(row);
        });
        
        var closeBtn = document.createElement('button');
        closeBtn.innerText = 'Close';
        closeBtn.style.cssText = 'width:100%;background:rgba(239,68,68,0.2);color:#ef4444;border:0;padding:10px;border-radius:8px;font-weight:bold;cursor:pointer;margin-top:10px;';
        closeBtn.onclick = function() { overlay.remove(); };
        modal.appendChild(closeBtn);
        
        overlay.appendChild(modal);
        document.body.appendChild(overlay);
    }
    
    function showQualityPicker(url) {
        var overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.8);backdrop-filter:blur(5px);z-index:2147483648;display:flex;align-items:center;justify-content:center;';
        overlay.innerHTML = '<div style="color:#fff;font-size:14px;">Analyzing M3U8...</div>';
        document.body.appendChild(overlay);
        
        parseM3U8Master(url, function(qualities) {
            overlay.innerHTML = '';
            if (!qualities) {
                overlay.innerHTML = '<div style="background:rgba(30,30,30,0.95);padding:20px;border-radius:12px;text-align:center;color:#ef4444;">Not a master playlist<br><button id="__uvd_qp_c__" style="margin-top:10px;padding:5px 10px;background:#333;color:#fff;border:0;border-radius:4px;">Close</button></div>';
                document.getElementById('__uvd_qp_c__').onclick = function(){overlay.remove();};
                return;
            }
            
            var modal = document.createElement('div');
            modal.style.cssText = 'background:rgba(30,30,35,0.95);width:90%;max-width:500px;border-radius:16px;padding:20px;border:1px solid rgba(255,255,255,0.1);max-height:80vh;overflow-y:auto;';
            
            var title = document.createElement('h3');
            title.innerText = 'Select Quality';
            title.style.cssText = 'color:#fff;margin:0 0 15px 0;';
            modal.appendChild(title);
            
            qualities.forEach(function(q) {
                var row = document.createElement('div');
                row.style.cssText = 'display:flex;justify-content:space-between;align-items:center;background:rgba(255,255,255,0.05);padding:10px;margin-bottom:8px;border-radius:8px;';
                row.innerHTML = '<div><b style="color:#fff;">' + q.label + '</b><div style="font-size:10px;color:rgba(255,255,255,0.5);">' + q.resolution + '</div></div>';
                
                var btn = document.createElement('button');
                btn.innerText = 'Get Link';
                btn.style.cssText = 'background:#3b82f6;color:#fff;border:0;padding:6px 12px;border-radius:4px;font-size:11px;cursor:pointer;';
                btn.onclick = function() { copy(q.url); toast('Quality link copied'); overlay.remove(); };
                row.appendChild(btn);
                modal.appendChild(row);
            });
            
            var closeBtn = document.createElement('button');
            closeBtn.innerText = 'Close';
            closeBtn.style.cssText = 'width:100%;background:rgba(255,255,255,0.1);color:#fff;border:0;padding:10px;border-radius:8px;margin-top:10px;cursor:pointer;';
            closeBtn.onclick = function() { overlay.remove(); };
            modal.appendChild(closeBtn);
            
            overlay.appendChild(modal);
        });
    }
    
    // ========== OTHER RENDERS (Simplified) ==========
    function renderFavorites(container) {
        if (!data.favorites.length) { container.innerHTML = '<div style="text-align:center;color:rgba(255,255,255,0.4);padding:20px;">No favorites yet.</div>'; return; }
        data.favorites.forEach(function(fav, i) {
            var card = document.createElement('div');
            card.style.cssText = 'background:rgba(255,255,255,0.03);padding:12px;margin-bottom:8px;border-radius:8px;border-left:3px solid gold;';
            card.innerHTML = '<div style="color:#fff;font-size:12px;margin-bottom:4px;">' + fav.title + '</div><div style="font-size:10px;color:rgba(255,255,255,0.5);word-break:break-all;">' + fav.url + '</div><button style="margin-top:5px;background:rgba(239,68,68,0.2);color:#ef4444;border:0;padding:4px 8px;border-radius:4px;font-size:10px;cursor:pointer;">Remove</button>';
            card.querySelector('button').onclick = function() {
                data.favorites.splice(i, 1); storage.set(data); renderFavorites(container);
            };
            container.appendChild(card);
        });
    }
    
    function renderHistory(container) {
        var history = data.history || [];
        if (!history.length) { container.innerHTML = '<div style="text-align:center;color:rgba(255,255,255,0.4);padding:20px;">No history.</div>'; return; }
        history.slice(0, 20).forEach(function(h) {
            var card = document.createElement('div');
            card.style.cssText = 'background:rgba(255,255,255,0.03);padding:10px;margin-bottom:6px;border-radius:6px;font-size:11px;';
            card.innerHTML = '<span style="color:#3b82f6;">[' + h.type + ']</span> <span style="color:rgba(255,255,255,0.7);">' + h.title + '</span>';
            container.appendChild(card);
        });
    }
    
    function renderSettings(container) {
        container.innerHTML = '<div style="color:#fff;padding:10px;"><h3>Settings</h3><p style="color:rgba(255,255,255,0.6);font-size:12px;">Glass UI Active. Data stored in LocalStorage.</p><button id="__uvd_reset__" style="background:rgba(239,68,68,0.2);color:#ef4444;border:0;padding:10px;width:100%;border-radius:8px;cursor:pointer;">Reset All Data</button></div>';
        document.getElementById('__uvd_reset__').onclick = function() {
            if(confirm('Clear all data?')) { localStorage.removeItem(STORAGE_KEY); location.reload(); }
        };
    }
    
    // ========== START ==========
    buildUI();
    toast('Glass UI Loaded');
})();