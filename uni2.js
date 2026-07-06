/**
 * Universal Video Downloader V2
 * Features: Live monitoring, Multi-quality, Favorites, Themes, Preview,
 *           Export, Site profiles, Share to YTDLnis
 * Author: nguyenquocngu93
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
    data.theme = data.theme || 'dark';
    data.siteProfiles = data.siteProfiles || {};
    data.history = data.history || [];
    
    // ========== SITE PROFILES (Auto Referer) ==========
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
    
    // ========== LIVE MONITORING (Network Interceptor) ==========
    var liveUrls = new Set();
    var originalFetch = window.fetch;
    var originalXHROpen = XMLHttpRequest.prototype.open;
    
    function installMonitor() {
        // Intercept fetch
        window.fetch = function() {
            var url = arguments[0];
            if (typeof url === 'string') findUrls(url, 'fetch:live');
            else if (url && url.url) findUrls(url.url, 'fetch:live');
            return originalFetch.apply(this, arguments);
        };
        
        // Intercept XHR
        XMLHttpRequest.prototype.open = function(method, url) {
            if (url) findUrls(url, 'xhr:live');
            return originalXHROpen.apply(this, arguments);
        };
        
        console.log('✅ Live monitor installed');
    }
    
    // Restore original functions
    function stopMonitor() {
        window.fetch = originalFetch;
        XMLHttpRequest.prototype.open = originalXHROpen;
    }
    
    // Initial scan
    scan(document, 'main');
    try {
        performance.getEntriesByType('resource').forEach(function(e) {
            findUrls(e.name, 'network:perf');
        });
    } catch(e) {}
    
    installMonitor();
    
    // ========== M3U8 MASTER PARSER (Multi-quality) ==========
    function parseM3U8Master(url, callback) {
        fetch(url, { headers: { 'Referer': pageInfo.referer } })
        .then(function(r) { return r.text(); })
        .then(function(text) {
            if (!text.includes('#EXT-X-STREAM-INF')) {
                callback(null); // Not a master playlist
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
                        
                        // Resolve relative URL
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
            
            // Sort by resolution desc
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
    
    // ========== THEMES ==========
    var themes = {
        dark: {
            bg: '#1a1a1a', bg2: '#252525', bg3: '#2a2a2a',
            text: '#ffffff', text2: '#aaaaaa', text3: '#666666',
            primary: '#4CAF50', accent: '#2196F3', danger: '#f44336'
        },
        light: {
            bg: '#ffffff', bg2: '#f5f5f5', bg3: '#eeeeee',
            text: '#212121', text2: '#616161', text3: '#9e9e9e',
            primary: '#2E7D32', accent: '#1565C0', danger: '#c62828'
        },
        purple: {
            bg: '#1a0033', bg2: '#2a0055', bg3: '#3a0077',
            text: '#ffffff', text2: '#cccccc', text3: '#888888',
            primary: '#BB86FC', accent: '#03DAC5', danger: '#CF6679'
        },
        matrix: {
            bg: '#000000', bg2: '#0a1a0a', bg3: '#0f2f0f',
            text: '#00ff00', text2: '#00cc00', text3: '#008800',
            primary: '#00ff00', accent: '#00ffcc', danger: '#ff0000'
        }
    };
    
    function getTheme() { return themes[data.theme] || themes.dark; }
    
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
        t.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);background:' + color + ';color:#fff;padding:12px 24px;border-radius:25px;z-index:2147483649;font:bold 13px Arial;box-shadow:0 4px 15px rgba(0,0,0,0.5);animation:uvdSlide 0.3s;';
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
            toast('✓ Đã copy - Mở YTDLnis để tải', '#FF6B6B');
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
        panel.style.cssText = 'position:fixed;top:5px;left:5px;right:5px;bottom:5px;background:' + t.bg + ';color:' + t.text + ';padding:0;border-radius:12px;z-index:2147483647;font-family:-apple-system,Arial,sans-serif;font-size:13px;overflow:hidden;display:flex;flex-direction:column;box-shadow:0 0 40px rgba(0,0,0,0.9);border:2px solid ' + t.primary + ';';
        
        // Add CSS animation
        var style = document.createElement('style');
        style.textContent = '@keyframes uvdSlide{from{transform:translate(-50%,-20px);opacity:0}to{transform:translate(-50%,0);opacity:1}}@keyframes uvdPulse{0%,100%{opacity:1}50%{opacity:0.5}}#__uvd__ ::-webkit-scrollbar{width:6px}#__uvd__ ::-webkit-scrollbar-thumb{background:' + t.primary + ';border-radius:3px}#__uvd__ ::-webkit-scrollbar-track{background:' + t.bg2 + '}';
        panel.appendChild(style);
        
        // Header
        var header = document.createElement('div');
        header.style.cssText = 'background:linear-gradient(135deg,' + t.primary + ',' + t.accent + ');padding:12px 15px;display:flex;justify-content:space-between;align-items:center;';
        header.innerHTML = 
            '<div>' +
                '<b style="font-size:16px;color:#fff;">⬇️ Universal DL V2</b>' +
                '<div style="font-size:11px;color:rgba(255,255,255,0.9);margin-top:2px;">' +
                    '<span style="animation:uvdPulse 2s infinite;">🔴 LIVE</span> · ' + arr.length + ' streams · ' + pageInfo.host +
                '</div>' +
            '</div>' +
            '<div style="display:flex;gap:5px;">' +
                '<button id="__uvd_refresh__" title="Refresh" style="background:rgba(0,0,0,0.3);color:#fff;border:0;padding:8px 12px;border-radius:6px;font-size:14px;cursor:pointer;">🔄</button>' +
                '<button id="__uvd_close__" title="Close" style="background:rgba(0,0,0,0.3);color:#fff;border:0;padding:8px 12px;border-radius:6px;font-weight:bold;font-size:14px;cursor:pointer;">✕</button>' +
            '</div>';
        panel.appendChild(header);
        
        // Tabs
        var tabs = document.createElement('div');
        tabs.style.cssText = 'display:flex;background:' + t.bg2 + ';border-bottom:1px solid ' + t.bg3 + ';';
        var tabList = [
            { id: 'streams', label: '🎬 Streams (' + arr.length + ')' },
            { id: 'favorites', label: '⭐ Favorites (' + data.favorites.length + ')' },
            { id: 'history', label: '📜 History (' + (data.history || []).length + ')' },
            { id: 'settings', label: '⚙️ Settings' }
        ];
        tabList.forEach(function(tab) {
            var b = document.createElement('button');
            b.className = '__uvd_tab__';
            b.dataset.tab = tab.id;
            b.innerText = tab.label;
            b.style.cssText = 'flex:1;background:transparent;color:' + t.text2 + ';border:0;padding:10px 5px;font-size:11px;font-weight:bold;cursor:pointer;border-bottom:3px solid transparent;';
            tabs.appendChild(b);
        });
        panel.appendChild(tabs);
        
        // Info bar
        var info = document.createElement('div');
        info.style.cssText = 'background:' + t.bg2 + ';padding:8px 15px;border-bottom:1px solid ' + t.bg3 + ';font-size:11px;';
        info.innerHTML = 
            '<div style="color:' + t.text2 + ';">📝 <span id="__uvd_title__" style="color:' + t.primary + ';font-weight:bold;cursor:pointer;text-decoration:underline;">' + pageInfo.title + '</span> <span style="color:' + t.text3 + ';">(bấm sửa)</span></div>' +
            '<div style="color:' + t.text2 + ';margin-top:3px;">🔗 <span id="__uvd_referer__" style="color:' + t.accent + ';font-family:monospace;font-size:10px;cursor:pointer;text-decoration:underline;">' + pageInfo.referer + '</span></div>';
        panel.appendChild(info);
        
        // Content area
        var content = document.createElement('div');
        content.id = '__uvd_content__';
        content.style.cssText = 'flex:1;overflow-y:auto;padding:10px 12px;';
        panel.appendChild(content);
        
        // Footer with export buttons
        var footer = document.createElement('div');
        footer.style.cssText = 'background:' + t.bg2 + ';padding:8px;border-top:1px solid ' + t.bg3 + ';display:flex;gap:5px;flex-wrap:wrap;';
        footer.innerHTML = 
            '<button id="__uvd_export_txt__" style="background:' + t.bg3 + ';color:' + t.text + ';border:0;padding:8px;border-radius:4px;font-size:11px;flex:1;cursor:pointer;">💾 TXT</button>' +
            '<button id="__uvd_export_json__" style="background:' + t.bg3 + ';color:' + t.text + ';border:0;padding:8px;border-radius:4px;font-size:11px;flex:1;cursor:pointer;">💾 JSON</button>' +
            '<button id="__uvd_export_m3u__" style="background:' + t.bg3 + ';color:' + t.text + ';border:0;padding:8px;border-radius:4px;font-size:11px;flex:1;cursor:pointer;">💾 M3U</button>' +
            '<button id="__uvd_export_csv__" style="background:' + t.bg3 + ';color:' + t.text + ';border:0;padding:8px;border-radius:4px;font-size:11px;flex:1;cursor:pointer;">💾 CSV</button>';
        panel.appendChild(footer);
        
        document.body.appendChild(panel);
        
        // Render content by tab
        var currentTab = 'streams';
        function renderTab(tabId) {
            currentTab = tabId;
            document.querySelectorAll('.__uvd_tab__').forEach(function(t) {
                if (t.dataset.tab === tabId) {
                    t.style.borderBottomColor = getTheme().primary;
                    t.style.color = getTheme().text;
                } else {
                    t.style.borderBottomColor = 'transparent';
                    t.style.color = getTheme().text2;
                }
            });
            
            content.innerHTML = '';
            
            if (tabId === 'streams') renderStreams(content, arr);
            else if (tabId === 'favorites') renderFavorites(content);
            else if (tabId === 'history') renderHistory(content);
            else if (tabId === 'settings') renderSettings(content);
        }
        
        // Bind tab events
        document.querySelectorAll('.__uvd_tab__').forEach(function(t) {
            t.onclick = function() { renderTab(this.dataset.tab); };
        });
        
        renderTab('streams');
        
        // Bind global events
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
                // Save to site profile
                data.siteProfiles[pageInfo.host] = { referer: newRef, userAgent: pageInfo.userAgent };
                storage.set(data);
                toast('✓ Đã lưu Referer cho ' + pageInfo.host);
            }
        };
        
        // Export buttons
        document.getElementById('__uvd_export_txt__').onclick = function() { exportData('txt'); };
        document.getElementById('__uvd_export_json__').onclick = function() { exportData('json'); };
        document.getElementById('__uvd_export_m3u__').onclick = function() { exportData('m3u'); };
        document.getElementById('__uvd_export_csv__').onclick = function() { exportData('csv'); };
    }
    
    // ========== RENDER: STREAMS ==========
    function renderStreams(container, arr) {
        var t = getTheme();
        if (!arr.length) {
            container.innerHTML = '<div style="text-align:center;padding:40px 20px;color:' + t.text2 + ';">🔍 Chưa tìm thấy stream nào<br><small>Đang monitor... Bấm Play video hoặc load thêm nội dung</small></div>';
            return;
        }
        
        var typeColors = {
            'M3U8': '#4CAF50', 'MPD': '#8BC34A', 'MP4': '#FF9800',
            'WEBM': '#FF9800', 'MKV': '#FF5722', 'FLV': '#FF5722',
            'TS': '#FFC107', 'IFRAME': '#2196F3'
        };
        
        arr.forEach(function(item, i) {
            var url = item.url;
            var type = item.type;
            var color = typeColors[type] || '#666';
            var fav = isFavorite(url);
            
            var card = document.createElement('div');
            card.style.cssText = 'background:' + t.bg3 + ';padding:12px;margin:8px 0;border-radius:8px;border-left:4px solid ' + color + ';';
            
            card.innerHTML = 
                '<div style="display:flex;justify-content:space-between;margin-bottom:8px;align-items:center;">' +
                    '<span style="background:' + color + ';color:#fff;padding:4px 12px;border-radius:4px;font-size:11px;font-weight:bold;">#' + (i + 1) + ' ' + type + '</span>' +
                    '<div style="display:flex;gap:5px;align-items:center;">' +
                        '<span style="color:' + t.text3 + ';font-size:10px;">' + item.source + '</span>' +
                        '<button class="__uvd_fav__" data-url="' + encodeURIComponent(url) + '" data-type="' + type + '" style="background:transparent;border:0;font-size:16px;cursor:pointer;padding:2px 6px;">' + (fav ? '⭐' : '☆') + '</button>' +
                    '</div>' +
                '</div>' +
                '<div style="word-break:break-all;font-size:11px;font-family:monospace;background:' + t.bg + ';padding:8px;margin-bottom:8px;border-radius:4px;max-height:70px;overflow-y:auto;color:' + t.text2 + ';line-height:1.5;">' + url + '</div>';
            
            var buttons = '<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:5px;">';
            buttons += '<button class="__uvd_act__" data-url="' + encodeURIComponent(url) + '" data-action="share" style="background:#FF6B6B;color:#fff;border:0;padding:10px;border-radius:4px;font-size:12px;font-weight:bold;cursor:pointer;">📱 YTDLnis</button>';
            buttons += '<button class="__uvd_act__" data-url="' + encodeURIComponent(url) + '" data-action="copy" style="background:' + t.primary + ';color:#fff;border:0;padding:10px;border-radius:4px;font-size:12px;font-weight:bold;cursor:pointer;">📋 Copy</button>';
            
            if (type === 'IFRAME') {
                buttons += '<a href="' + url + '" style="background:' + t.accent + ';color:#fff;padding:10px;border-radius:4px;font-size:12px;font-weight:bold;text-decoration:none;text-align:center;grid-column:1/3;">➡️ Vào iframe</a>';
            } else {
                if (type === 'M3U8') {
                    buttons += '<button class="__uvd_act__" data-url="' + encodeURIComponent(url) + '" data-action="quality" data-type="' + type + '" style="background:#9C27B0;color:#fff;border:0;padding:10px;border-radius:4px;font-size:12px;font-weight:bold;cursor:pointer;">🎞️ Quality</button>';
                    buttons += '<button class="__uvd_act__" data-url="' + encodeURIComponent(url) + '" data-action="preview" style="background:#00BCD4;color:#fff;border:0;padding:10px;border-radius:4px;font-size:12px;font-weight:bold;cursor:pointer;">▶️ Preview</button>';
                }
                buttons += '<button class="__uvd_act__" data-url="' + encodeURIComponent(url) + '" data-action="cmd" data-type="' + type + '" style="background:#E91E63;color:#fff;border:0;padding:10px;border-radius:4px;font-size:12px;font-weight:bold;cursor:pointer;grid-column:1/3;">⚙️ Tất cả lệnh tải</button>';
            }
            buttons += '</div>';
            
            card.innerHTML += buttons;
            container.appendChild(card);
        });
        
        // Bind events
        bindStreamEvents();
    }
    
    function bindStreamEvents() {
        document.querySelectorAll('.__uvd_fav__').forEach(function(b) {
            b.onclick = function() {
                var url = decodeURIComponent(this.dataset.url);
                var isFav = toggleFavorite(url, this.dataset.type);
                this.innerText = isFav ? '⭐' : '☆';
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
    
    // ========== QUALITY PICKER (M3U8 Master) ==========
    function showQualityPicker(url) {
        var t = getTheme();
        var overlay = createOverlay();
        overlay.innerHTML = '<div style="color:' + t.primary + ';font:bold 16px Arial;margin-bottom:15px;">🎞️ Đang phân tích M3U8...</div><div style="text-align:center;color:' + t.text2 + ';padding:20px;">⏳ Loading...</div>';
        
        parseM3U8Master(url, function(qualities) {
            if (!qualities) {
                overlay.innerHTML = 
                    '<div style="color:' + t.danger + ';font:bold 16px Arial;margin-bottom:15px;">❌ Không phải Master Playlist</div>' +
                    '<div style="color:' + t.text2 + ';margin-bottom:15px;">Đây là stream đơn, không có nhiều chất lượng để chọn.</div>' +
                    '<button id="__uvd_qp_close__" style="background:' + t.danger + ';color:#fff;border:0;padding:12px;border-radius:6px;font-weight:bold;width:100%;">Đóng</button>';
                document.getElementById('__uvd_qp_close__').onclick = function() { overlay.remove(); };
                return;
            }
            
            var html = '<div style="color:' + t.primary + ';font:bold 16px Arial;margin-bottom:15px;">🎞️ Chọn chất lượng (' + qualities.length + ')</div>';
            qualities.forEach(function(q, i) {
                html += '<div style="background:' + t.bg3 + ';padding:12px;margin-bottom:8px;border-radius:8px;">';
                html += '<div style="display:flex;justify-content:space-between;margin-bottom:8px;">';
                html += '<b style="color:' + t.primary + ';font-size:14px;">' + q.label + '</b>';
                html += '<span style="color:' + t.text2 + ';font-size:11px;">' + Math.round(q.bandwidth/1000) + ' kbps</span>';
                html += '</div>';
                html += '<div style="color:' + t.text3 + ';font-size:10px;margin-bottom:8px;">📐 ' + q.resolution + (q.codecs ? ' · ' + q.codecs : '') + '</div>';
                html += '<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:5px;">';
                html += '<button class="__uvd_qbtn__" data-url="' + encodeURIComponent(q.url) + '" data-action="share" style="background:#FF6B6B;color:#fff;border:0;padding:8px;border-radius:4px;font-size:11px;font-weight:bold;">📱 YTDLnis</button>';
                html += '<button class="__uvd_qbtn__" data-url="' + encodeURIComponent(q.url) + '" data-action="cmd" style="background:#E91E63;color:#fff;border:0;padding:8px;border-radius:4px;font-size:11px;font-weight:bold;">⚙️ Lệnh</button>';
                html += '</div></div>';
            });
            html += '<button id="__uvd_qp_close__" style="background:' + t.danger + ';color:#fff;border:0;padding:12px;border-radius:6px;font-weight:bold;width:100%;margin-top:10px;">✕ Đóng</button>';
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
    
    // ========== PREVIEW PLAYER ==========
    function showPreview(url) {
        var t = getTheme();
        var overlay = createOverlay();
        overlay.style.padding = '0';
        overlay.innerHTML = 
            '<div style="background:' + t.bg + ';padding:15px;display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid ' + t.primary + ';">' +
                '<b style="color:' + t.primary + ';">▶️ Preview Stream</b>' +
                '<button id="__uvd_pv_close__" style="background:' + t.danger + ';color:#fff;border:0;padding:8px 14px;border-radius:5px;font-weight:bold;">✕</button>' +
            '</div>' +
            '<div style="flex:1;display:flex;flex-direction:column;padding:15px;">' +
                '<video id="__uvd_pv__" controls autoplay style="width:100%;max-height:60vh;background:#000;border-radius:8px;"></video>' +
                '<div id="__uvd_pv_status__" style="color:' + t.text2 + ';margin-top:10px;font-size:12px;text-align:center;">⏳ Đang load...</div>' +
            '</div>';
        
        var video = document.getElementById('__uvd_pv__');
        var status = document.getElementById('__uvd_pv_status__');
        
        // Load HLS.js from CDN for M3U8 support
        if (url.includes('.m3u8')) {
            if (window.Hls) {
                initHls();
            } else {
                var hlsScript = document.createElement('script');
                hlsScript.src = 'https://cdn.jsdelivr.net/npm/hls.js@latest';
                hlsScript.onload = initHls;
                hlsScript.onerror = function() {
                    status.innerText = '❌ Không load được HLS.js - Thử copy URL và mở bằng VLC';
                    // Try native HLS
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
            video.pause();
            video.src = '';
            overlay.remove();
        };
    }
    
    // ========== COMMAND PICKER ==========
    function showCommandPicker(url, type) {
        var t = getTheme();
        var cmds = makeCommands(url, type, pageInfo.title);
        var overlay = createOverlay();
        var html = '<div style="color:' + t.primary + ';font:bold 16px Arial;margin-bottom:15px;">⚙️ Chọn lệnh tải</div>';
        
        Object.keys(cmds).forEach(function(key) {
            var c = cmds[key];
            html += '<div style="background:' + t.bg3 + ';padding:12px;margin-bottom:10px;border-radius:8px;">';
            html += '<div style="color:#FF9800;font-weight:bold;margin-bottom:6px;font-size:13px;">' + c.label + '</div>';
            html += '<div style="background:' + t.bg + ';padding:8px;border-radius:4px;font-family:monospace;font-size:10px;color:' + t.text2 + ';word-break:break-all;margin-bottom:8px;max-height:80px;overflow-y:auto;">' + c.cmd + '</div>';
            html += '<button class="__uvd_cbtn__" data-cmd="' + encodeURIComponent(c.cmd) + '" data-label="' + c.label + '" style="background:' + t.primary + ';color:#fff;border:0;padding:8px 16px;border-radius:4px;font-weight:bold;width:100%;">📋 Chọn & sửa</button>';
            html += '</div>';
        });
        
        html += '<button id="__uvd_cp_close__" style="background:' + t.danger + ';color:#fff;border:0;padding:12px;border-radius:6px;font-weight:bold;width:100%;">✕ Đóng</button>';
        overlay.innerHTML = html;
        
        document.querySelectorAll('.__uvd_cbtn__').forEach(function(b) {
            b.onclick = function() {
                var cmd = decodeURIComponent(this.dataset.cmd);
                var label = this.dataset.label;
                overlay.remove();
                showEditor(cmd, label);
            };
        });
        document.getElementById('__uvd_cp_close__').onclick = function() { overlay.remove(); };
    }
    
    // ========== EDITOR ==========
    function showEditor(text, title) {
        var t = getTheme();
        var overlay = createOverlay();
        overlay.innerHTML = 
            '<div style="color:' + t.primary + ';font:bold 15px Arial;margin-bottom:5px;">✏️ ' + title + '</div>' +
            '<div style="color:' + t.text3 + ';font-size:11px;margin-bottom:10px;">Sửa lệnh trước khi copy</div>' +
            '<textarea id="__uvd_edit__" style="flex:1;background:' + t.bg + ';color:' + t.text + ';border:2px solid ' + t.primary + ';border-radius:6px;padding:12px;font:12px monospace;resize:none;line-height:1.5;">' + text.replace(/</g, '&lt;') + '</textarea>' +
            '<div style="display:flex;gap:8px;margin-top:10px;">' +
                '<button id="__uvd_ed_ok__" style="background:' + t.primary + ';color:#fff;border:0;padding:14px;border-radius:6px;font:bold 15px Arial;flex:1;">✓ Copy</button>' +
                '<button id="__uvd_ed_share__" style="background:#FF6B6B;color:#fff;border:0;padding:14px;border-radius:6px;font:bold 15px Arial;flex:1;">📱 Share</button>' +
                '<button id="__uvd_ed_no__" style="background:' + t.danger + ';color:#fff;border:0;padding:14px;border-radius:6px;font:bold 15px Arial;flex:1;">✕ Hủy</button>' +
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
    }
    
    // ========== OVERLAY HELPER ==========
    function createOverlay() {
        var t = getTheme();
        var overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.95);z-index:2147483648;padding:15px;display:flex;flex-direction:column;gap:10px;overflow-y:auto;';
        document.body.appendChild(overlay);
        return overlay;
    }
    
    // ========== RENDER: FAVORITES ==========
    function renderFavorites(container) {
        var t = getTheme();
        if (!data.favorites.length) {
            container.innerHTML = '<div style="text-align:center;padding:40px 20px;color:' + t.text2 + ';">⭐ Chưa có favorites<br><small>Bấm ☆ trên stream để thêm</small></div>';
            return;
        }
        
        data.favorites.forEach(function(fav, i) {
            var card = document.createElement('div');
            card.style.cssText = 'background:' + t.bg3 + ';padding:12px;margin:8px 0;border-radius:8px;border-left:4px solid gold;';
            card.innerHTML = 
                '<div style="display:flex;justify-content:space-between;margin-bottom:6px;">' +
                    '<b style="color:gold;font-size:12px;">⭐ ' + fav.type + '</b>' +
                    '<span style="color:' + t.text3 + ';font-size:10px;">' + new Date(fav.timestamp).toLocaleDateString() + '</span>' +
                '</div>' +
                '<div style="color:' + t.text + ';font-size:12px;margin-bottom:4px;">' + fav.title + '</div>' +
                '<div style="color:' + t.text3 + ';font-size:10px;margin-bottom:6px;">🌐 ' + fav.host + '</div>' +
                '<div style="word-break:break-all;font-size:10px;font-family:monospace;background:' + t.bg + ';padding:6px;border-radius:4px;margin-bottom:6px;max-height:50px;overflow-y:auto;color:' + t.text2 + ';">' + fav.url + '</div>' +
                '<div style="display:flex;gap:5px;">' +
                    '<button class="__uvd_fbtn__" data-url="' + encodeURIComponent(fav.url) + '" data-action="share" style="background:#FF6B6B;color:#fff;border:0;padding:6px;border-radius:3px;font-size:11px;font-weight:bold;flex:1;">📱 YTDLnis</button>' +
                    '<button class="__uvd_fbtn__" data-url="' + encodeURIComponent(fav.url) + '" data-action="copy" style="background:' + t.primary + ';color:#fff;border:0;padding:6px;border-radius:3px;font-size:11px;font-weight:bold;flex:1;">📋 Copy</button>' +
                    '<button class="__uvd_fbtn__" data-idx="' + i + '" data-action="del" style="background:' + t.danger + ';color:#fff;border:0;padding:6px 10px;border-radius:3px;font-size:11px;font-weight:bold;">🗑️</button>' +
                '</div>';
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
                    else copy(url), toast('✓ Copied');
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
        clearBtn.style.cssText = 'background:' + t.danger + ';color:#fff;border:0;padding:10px;border-radius:6px;font-weight:bold;width:100%;margin-bottom:10px;';
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
            card.style.cssText = 'background:' + t.bg3 + ';padding:10px;margin:6px 0;border-radius:6px;';
            card.innerHTML = 
                '<div style="display:flex;justify-content:space-between;margin-bottom:4px;">' +
                    '<b style="color:' + t.accent + ';font-size:11px;">' + h.type + '</b>' +
                    '<span style="color:' + t.text3 + ';font-size:10px;">' + new Date(h.timestamp).toLocaleString() + '</span>' +
                '</div>' +
                '<div style="color:' + t.text + ';font-size:11px;">' + h.title + '</div>' +
                '<div style="color:' + t.text3 + ';font-size:10px;">🌐 ' + h.host + '</div>' +
                '<div style="word-break:break-all;font-size:10px;font-family:monospace;color:' + t.text2 + ';margin-top:4px;max-height:40px;overflow-y:auto;">' + h.url + '</div>';
            container.appendChild(card);
        });
    }
    
    // ========== RENDER: SETTINGS ==========
    function renderSettings(container) {
        var t = getTheme();
        var html = '<div style="color:' + t.primary + ';font-weight:bold;margin-bottom:15px;font-size:15px;">⚙️ Settings</div>';
        
        // Theme
        html += '<div style="background:' + t.bg3 + ';padding:12px;margin-bottom:10px;border-radius:8px;">';
        html += '<div style="color:' + t.text + ';font-weight:bold;margin-bottom:10px;">🎨 Theme</div>';
        html += '<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:5px;">';
        ['dark', 'light', 'purple', 'matrix'].forEach(function(th) {
            var active = data.theme === th;
            html += '<button class="__uvd_theme__" data-theme="' + th + '" style="background:' + (active ? t.primary : t.bg2) + ';color:' + (active ? '#fff' : t.text) + ';border:0;padding:10px;border-radius:4px;font-weight:bold;text-transform:capitalize;">' + th + '</button>';
        });
        html += '</div></div>';
        
        // Site profiles
        html += '<div style="background:' + t.bg3 + ';padding:12px;margin-bottom:10px;border-radius:8px;">';
        html += '<div style="color:' + t.text + ';font-weight:bold;margin-bottom:10px;">🌐 Site Profiles</div>';
        var profiles = Object.keys(data.siteProfiles);
        if (!profiles.length) {
            html += '<div style="color:' + t.text3 + ';font-size:11px;">Chưa có profile nào. Bấm vào Referer để lưu.</div>';
        } else {
            profiles.forEach(function(p) {
                html += '<div style="background:' + t.bg + ';padding:8px;margin-bottom:5px;border-radius:4px;font-size:11px;">';
                html += '<div style="color:' + t.primary + ';font-weight:bold;">' + p + '</div>';
                html += '<div style="color:' + t.text2 + ';font-family:monospace;font-size:10px;word-break:break-all;">' + data.siteProfiles[p].referer + '</div>';
                html += '<button class="__uvd_delprofile__" data-host="' + p + '" style="background:' + t.danger + ';color:#fff;border:0;padding:4px 8px;border-radius:3px;font-size:10px;margin-top:5px;">🗑️ Xóa</button>';
                html += '</div>';
            });
        }
        html += '</div>';
        
        // Backup/Restore
        html += '<div style="background:' + t.bg3 + ';padding:12px;margin-bottom:10px;border-radius:8px;">';
        html += '<div style="color:' + t.text + ';font-weight:bold;margin-bottom:10px;">💾 Backup</div>';
        html += '<button id="__uvd_backup__" style="background:' + t.primary + ';color:#fff;border:0;padding:10px;border-radius:4px;font-weight:bold;width:100%;margin-bottom:5px;">📤 Export data</button>';
        html += '<button id="__uvd_restore__" style="background:' + t.accent + ';color:#fff;border:0;padding:10px;border-radius:4px;font-weight:bold;width:100%;margin-bottom:5px;">📥 Import data</button>';
        html += '<button id="__uvd_reset__" style="background:' + t.danger + ';color:#fff;border:0;padding:10px;border-radius:4px;font-weight:bold;width:100%;">🔥 Reset toàn bộ</button>';
        html += '</div>';
        
        // Info
        html += '<div style="background:' + t.bg3 + ';padding:12px;border-radius:8px;font-size:11px;color:' + t.text2 + ';">';
        html += '<div>📦 Version: 2.0</div>';
        html += '<div>👤 By: nguyenquocngu93</div>';
        html += '<div>💾 Favorites: ' + data.favorites.length + '</div>';
        html += '<div>📜 History: ' + (data.history || []).length + '</div>';
        html += '<div>🌐 Site profiles: ' + Object.keys(data.siteProfiles).length + '</div>';
        html += '</div>';
        
        container.innerHTML = html;
        
        // Bind theme
        document.querySelectorAll('.__uvd_theme__').forEach(function(b) {
            b.onclick = function() {
                data.theme = this.dataset.theme;
                storage.set(data);
                buildUI();
                toast('🎨 Theme: ' + data.theme);
            };
        });
        
        // Bind delete profile
        document.querySelectorAll('.__uvd_delprofile__').forEach(function(b) {
            b.onclick = function() {
                delete data.siteProfiles[this.dataset.host];
                storage.set(data);
                renderSettings(container);
                toast('🗑️ Đã xóa profile');
            };
        });
        
        // Backup
        document.getElementById('__uvd_backup__').onclick = function() {
            var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            var a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = 'uvd_backup_' + Date.now() + '.json';
            a.click();
            toast('📤 Đã export backup');
        };
        
        // Restore
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
        
        // Reset
        document.getElementById('__uvd_reset__').onclick = function() {
            if (confirm('Xóa TOÀN BỘ favorites, history, settings?')) {
                localStorage.removeItem(STORAGE_KEY);
                data = { favorites: [], theme: 'dark', siteProfiles: {}, history: [] };
                toast('🔥 Đã reset');
                buildUI();
            }
        };
    }
    
    // ========== START ==========
    buildUI();
    
    // Auto refresh when new URL detected
    var lastCount = urls.size;
    var autoRefresh = setInterval(function() {
        if (!document.getElementById('__uvd__')) {
            clearInterval(autoRefresh);
            stopMonitor();
            return;
        }
        if (urls.size !== lastCount) {
            lastCount = urls.size;
            // Chỉ update badge count, không rebuild toàn bộ UI để user không mất scroll
            var header = document.querySelector('#__uvd__ > div:first-of-type');
            // TODO: Update count in header
        }
    }, 2000);
    
    console.log('✅ Universal DL V2 loaded! Found', urls.size, 'streams initially');
    toast('✅ V2 Ready! Live monitoring active');
})();