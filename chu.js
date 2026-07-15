/**
 * Universal Video Downloader V2 - Glass Edition
 * Features: Live monitoring, Multi-quality, Favorites, Themes, Preview,
 *           Export, Site profiles, Share to YTDLnis
 * UI: Glassmorphism + Video.js v8 Player
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
    data.theme = data.theme || 'glass';
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
    
    // ========== THEMES (Glassmorphism) ==========
    var themes = {
        glass: {
            bg: 'rgba(20, 20, 30, 0.65)',
            bg2: 'rgba(255, 255, 255, 0.08)',
            bg3: 'rgba(255, 255, 255, 0.12)',
            text: '#ffffff',
            text2: 'rgba(255,255,255,0.8)',
            text3: 'rgba(255,255,255,0.5)',
            primary: '#00d4ff',
            accent: '#ff6b9d',
            danger: '#ff4757',
            glass: true
        },
        dark: {
            bg: 'rgba(26, 26, 26, 0.9)',
            bg2: 'rgba(255,255,255,0.05)',
            bg3: 'rgba(255,255,255,0.08)',
            text: '#ffffff',
            text2: '#cccccc',
            text3: '#888888',
            primary: '#4CAF50',
            accent: '#2196F3',
            danger: '#f44336',
            glass: false
        },
        light: {
            bg: 'rgba(255,255,255,0.85)',
            bg2: 'rgba(0,0,0,0.05)',
            bg3: 'rgba(0,0,0,0.08)',
            text: '#212121',
            text2: '#555555',
            text3: '#999999',
            primary: '#2E7D32',
            accent: '#1565C0',
            danger: '#c62828',
            glass: false
        },
        purple: {
            bg: 'rgba(26, 0, 51, 0.85)',
            bg2: 'rgba(255,255,255,0.05)',
            bg3: 'rgba(255,255,255,0.08)',
            text: '#ffffff',
            text2: '#dddddd',
            text3: '#999999',
            primary: '#BB86FC',
            accent: '#03DAC5',
            danger: '#CF6679',
            glass: false
        },
        matrix: {
            bg: 'rgba(0, 10, 0, 0.9)',
            bg2: 'rgba(0,255,0,0.05)',
            bg3: 'rgba(0,255,0,0.08)',
            text: '#00ff00',
            text2: '#00cc00',
            text3: '#008800',
            primary: '#00ff00',
            accent: '#00ffcc',
            danger: '#ff0000',
            glass: false
        }
    };
    
    function getTheme() { return themes[data.theme] || themes.glass; }
    
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
        t.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);background:' + color + ';color:#fff;padding:12px 24px;border-radius:25px;z-index:2147483649;font:bold 13px Arial;box-shadow:0 4px 15px rgba(0,0,0,0.5);animation:uvdSlide 0.3s;backdrop-filter:blur(10px);';
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
    
    // ========== VIDEOJS LOADER ==========
    var videoJsLoaded = false;
    var videoJsReady = false;
    var videoJsQueue = [];
    
    function loadVideoJS(callback) {
        if (videoJsReady) { callback(); return; }
        if (videoJsLoaded) { videoJsQueue.push(callback); return; }
        videoJsLoaded = true;
        videoJsQueue.push(callback);
        
        // Load Video.js CSS
        var css = document.createElement('link');
        css.rel = 'stylesheet';
        css.href = 'https://vjs.zencdn.net/8.10.0/video-js.min.css';
        document.head.appendChild(css);
        
        // Load Video.js JS
        var script = document.createElement('script');
        script.src = 'https://vjs.zencdn.net/8.10.0/video.min.js';
        script.onload = function() {
            // Load VHS plugin (for HLS)
            var vhsScript = document.createElement('script');
            vhsScript.src = 'https://cdn.jsdelivr.net/npm/@videojs/http-streaming@3.3.0/dist/videojs-http-streaming.min.js';
            vhsScript.onload = function() {
                videoJsReady = true;
                while (videoJsQueue.length) {
                    videoJsQueue.shift()();
                }
            };
            vhsScript.onerror = function() {
                // Fallback: try native HLS if available
                videoJsReady = true;
                while (videoJsQueue.length) {
                    videoJsQueue.shift()();
                }
                console.warn('VHS plugin failed, using native HLS if supported');
            };
            document.head.appendChild(vhsScript);
        };
        script.onerror = function() {
            console.error('Failed to load Video.js');
            videoJsReady = true; // try anyway
            while (videoJsQueue.length) {
                videoJsQueue.shift()();
            }
        };
        document.head.appendChild(script);
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
        var glassStyle = t.glass ? 'backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);' : '';
        panel.style.cssText = 'position:fixed;top:10px;left:10px;right:10px;bottom:10px;background:' + t.bg + ';color:' + t.text + ';padding:0;border-radius:24px;z-index:2147483647;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;font-size:13px;overflow:hidden;display:flex;flex-direction:column;box-shadow:0 25px 60px rgba(0,0,0,0.6);border:1px solid rgba(255,255,255,0.15);' + glassStyle;
        
        // Add glass-specific styles
        var style = document.createElement('style');
        style.textContent = `
            @keyframes uvdSlide{from{transform:translate(-50%,-20px);opacity:0}to{transform:translate(-50%,0);opacity:1}}
            @keyframes uvdPulse{0%,100%{opacity:1}50%{opacity:0.5}}
            #__uvd__ ::-webkit-scrollbar{width:6px}
            #__uvd__ ::-webkit-scrollbar-thumb{background:${t.primary};border-radius:10px}
            #__uvd__ ::-webkit-scrollbar-track{background:rgba(255,255,255,0.05)}
            .uvd-glass-btn { background:rgba(255,255,255,0.1); backdrop-filter:blur(10px); -webkit-backdrop-filter:blur(10px); border:1px solid rgba(255,255,255,0.15); transition:all 0.25s ease; }
            .uvd-glass-btn:hover { background:rgba(255,255,255,0.2); transform:scale(1.02); }
            .uvd-glass-card { background:rgba(255,255,255,0.06); backdrop-filter:blur(8px); -webkit-backdrop-filter:blur(8px); border:1px solid rgba(255,255,255,0.08); }
            .uvd-tab-active { border-bottom:3px solid ${t.primary} !important; color:${t.text} !important; }
        `;
        panel.appendChild(style);
        
        // Header
        var header = document.createElement('div');
        header.style.cssText = 'background:linear-gradient(135deg,' + t.primary + '40,' + t.accent + '40);padding:14px 18px;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid rgba(255,255,255,0.08);';
        header.innerHTML = 
            '<div>' +
                '<b style="font-size:17px;color:#fff;text-shadow:0 2px 10px rgba(0,0,0,0.3);">⬇️ Universal DL V2</b>' +
                '<div style="font-size:11px;color:rgba(255,255,255,0.8);margin-top:2px;">' +
                    '<span style="animation:uvdPulse 2s infinite;">🔴 LIVE</span> · ' + arr.length + ' streams · ' + pageInfo.host +
                '</div>' +
            '</div>' +
            '<div style="display:flex;gap:6px;">' +
                '<button id="__uvd_refresh__" title="Refresh" class="uvd-glass-btn" style="color:#fff;border:0;padding:8px 12px;border-radius:12px;font-size:14px;cursor:pointer;">🔄</button>' +
                '<button id="__uvd_close__" title="Close" class="uvd-glass-btn" style="color:#fff;border:0;padding:8px 12px;border-radius:12px;font-weight:bold;font-size:14px;cursor:pointer;">✕</button>' +
            '</div>';
        panel.appendChild(header);
        
        // Tabs
        var tabs = document.createElement('div');
        tabs.style.cssText = 'display:flex;background:rgba(0,0,0,0.15);border-bottom:1px solid rgba(255,255,255,0.06);';
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
            b.style.cssText = 'flex:1;background:transparent;color:' + t.text2 + ';border:0;padding:12px 5px;font-size:12px;font-weight:600;cursor:pointer;border-bottom:3px solid transparent;transition:all 0.2s;';
            tabs.appendChild(b);
        });
        panel.appendChild(tabs);
        
        // Info bar
        var info = document.createElement('div');
        info.style.cssText = 'background:rgba(0,0,0,0.15);padding:10px 18px;border-bottom:1px solid rgba(255,255,255,0.05);font-size:12px;';
        info.innerHTML = 
            '<div style="color:' + t.text2 + ';">📝 <span id="__uvd_title__" style="color:' + t.primary + ';font-weight:600;cursor:pointer;text-decoration:underline;">' + pageInfo.title + '</span> <span style="color:' + t.text3 + ';font-size:10px;">(bấm sửa)</span></div>' +
            '<div style="color:' + t.text2 + ';margin-top:4px;">🔗 <span id="__uvd_referer__" style="color:' + t.accent + ';font-family:monospace;font-size:10px;cursor:pointer;text-decoration:underline;">' + pageInfo.referer + '</span></div>';
        panel.appendChild(info);
        
        // Content area
        var content = document.createElement('div');
        content.id = '__uvd_content__';
        content.style.cssText = 'flex:1;overflow-y:auto;padding:12px 16px;';
        panel.appendChild(content);
        
        // Footer with export buttons
        var footer = document.createElement('div');
        footer.style.cssText = 'background:rgba(0,0,0,0.15);padding:10px;border-top:1px solid rgba(255,255,255,0.06);display:flex;gap:6px;flex-wrap:wrap;';
        footer.innerHTML = 
            '<button id="__uvd_export_txt__" class="uvd-glass-btn" style="color:' + t.text + ';border:0;padding:8px;border-radius:10px;font-size:11px;flex:1;cursor:pointer;">💾 TXT</button>' +
            '<button id="__uvd_export_json__" class="uvd-glass-btn" style="color:' + t.text + ';border:0;padding:8px;border-radius:10px;font-size:11px;flex:1;cursor:pointer;">💾 JSON</button>' +
            '<button id="__uvd_export_m3u__" class="uvd-glass-btn" style="color:' + t.text + ';border:0;padding:8px;border-radius:10px;font-size:11px;flex:1;cursor:pointer;">💾 M3U</button>' +
            '<button id="__uvd_export_csv__" class="uvd-glass-btn" style="color:' + t.text + ';border:0;padding:8px;border-radius:10px;font-size:11px;flex:1;cursor:pointer;">💾 CSV</button>';
        panel.appendChild(footer);
        
        document.body.appendChild(panel);
        
        // Render content by tab
        var currentTab = 'streams';
        function renderTab(tabId) {
            currentTab = tabId;
            document.querySelectorAll('.__uvd_tab__').forEach(function(t) {
                if (t.dataset.tab === tabId) {
                    t.classList.add('uvd-tab-active');
                } else {
                    t.classList.remove('uvd-tab-active');
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
            container.innerHTML = '<div style="text-align:center;padding:50px 20px;color:' + t.text2 + ';">🔍 Chưa tìm thấy stream nào<br><small style="color:' + t.text3 + ';">Đang monitor... Bấm Play video hoặc load thêm nội dung</small></div>';
            return;
        }
        
        var typeColors = {
            'M3U8': '#00d4ff', 'MPD': '#8BC34A', 'MP4': '#FF9800',
            'WEBM': '#FF9800', 'MKV': '#FF5722', 'FLV': '#FF5722',
            'TS': '#FFC107', 'IFRAME': '#2196F3'
        };
        
        arr.forEach(function(item, i) {
            var url = item.url;
            var type = item.type;
            var color = typeColors[type] || '#666';
            var fav = isFavorite(url);
            
            var card = document.createElement('div');
            card.className = 'uvd-glass-card';
            card.style.cssText = 'background:rgba(255,255,255,0.05);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);padding:14px;margin:10px 0;border-radius:16px;border-left:4px solid ' + color + ';border:1px solid rgba(255,255,255,0.06);';
            
            card.innerHTML = 
                '<div style="display:flex;justify-content:space-between;margin-bottom:10px;align-items:center;">' +
                    '<span style="background:' + color + '30;color:' + color + ';padding:4px 14px;border-radius:20px;font-size:11px;font-weight:700;border:1px solid ' + color + '40;">#' + (i + 1) + ' ' + type + '</span>' +
                    '<div style="display:flex;gap:6px;align-items:center;">' +
                        '<span style="color:' + t.text3 + ';font-size:10px;">' + item.source + '</span>' +
                        '<button class="__uvd_fav__" data-url="' + encodeURIComponent(url) + '" data-type="' + type + '" style="background:transparent;border:0;font-size:18px;cursor:pointer;padding:2px 6px;transition:0.2s;">' + (fav ? '⭐' : '☆') + '</button>' +
                    '</div>' +
                '</div>' +
                '<div style="word-break:break-all;font-size:11px;font-family:monospace;background:rgba(0,0,0,0.2);padding:10px;margin-bottom:10px;border-radius:12px;max-height:70px;overflow-y:auto;color:' + t.text2 + ';line-height:1.5;border:1px solid rgba(255,255,255,0.05);">' + url + '</div>';
            
            var buttons = '<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:6px;">';
            buttons += '<button class="__uvd_act__ uvd-glass-btn" data-url="' + encodeURIComponent(url) + '" data-action="share" style="color:#fff;border:0;padding:10px;border-radius:12px;font-size:12px;font-weight:600;cursor:pointer;background:rgba(255,107,107,0.7);backdrop-filter:blur(10px);">📱 YTDLnis</button>';
            buttons += '<button class="__uvd_act__ uvd-glass-btn" data-url="' + encodeURIComponent(url) + '" data-action="copy" style="color:#fff;border:0;padding:10px;border-radius:12px;font-size:12px;font-weight:600;cursor:pointer;background:' + t.primary + '80;backdrop-filter:blur(10px);">📋 Copy</button>';
            
            if (type === 'IFRAME') {
                buttons += '<a href="' + url + '" target="_blank" class="uvd-glass-btn" style="color:#fff;padding:10px;border-radius:12px;font-size:12px;font-weight:600;text-decoration:none;text-align:center;grid-column:1/3;background:' + t.accent + '80;backdrop-filter:blur(10px);border:1px solid rgba(255,255,255,0.1);">➡️ Vào iframe</a>';
            } else {
                if (type === 'M3U8') {
                    buttons += '<button class="__uvd_act__ uvd-glass-btn" data-url="' + encodeURIComponent(url) + '" data-action="quality" data-type="' + type + '" style="color:#fff;border:0;padding:10px;border-radius:12px;font-size:12px;font-weight:600;cursor:pointer;background:rgba(156,39,176,0.7);backdrop-filter:blur(10px);">🎞️ Quality</button>';
                    buttons += '<button class="__uvd_act__ uvd-glass-btn" data-url="' + encodeURIComponent(url) + '" data-action="preview" style="color:#fff;border:0;padding:10px;border-radius:12px;font-size:12px;font-weight:600;cursor:pointer;background:rgba(0,188,212,0.7);backdrop-filter:blur(10px);">▶️ Preview</button>';
                }
                buttons += '<button class="__uvd_act__ uvd-glass-btn" data-url="' + encodeURIComponent(url) + '" data-action="cmd" data-type="' + type + '" style="color:#fff;border:0;padding:10px;border-radius:12px;font-size:12px;font-weight:600;cursor:pointer;grid-column:1/3;background:rgba(233,30,99,0.7);backdrop-filter:blur(10px);">⚙️ Tất cả lệnh tải</button>';
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
    
    // ========== QUALITY PICKER ==========
    function showQualityPicker(url) {
        var t = getTheme();
        var overlay = createOverlay();
        overlay.innerHTML = '<div style="color:' + t.primary + ';font:bold 16px Arial;margin-bottom:15px;">🎞️ Đang phân tích M3U8...</div><div style="text-align:center;color:' + t.text2 + ';padding:20px;">⏳ Loading...</div>';
        
        parseM3U8Master(url, function(qualities) {
            if (!qualities) {
                overlay.innerHTML = 
                    '<div style="color:' + t.danger + ';font:bold 16px Arial;margin-bottom:15px;">❌ Không phải Master Playlist</div>' +
                    '<div style="color:' + t.text2 + ';margin-bottom:15px;">Đây là stream đơn, không có nhiều chất lượng để chọn.</div>' +
                    '<button id="__uvd_qp_close__" class="uvd-glass-btn" style="background:' + t.danger + ';color:#fff;border:0;padding:12px;border-radius:12px;font-weight:bold;width:100%;cursor:pointer;">Đóng</button>';
                document.getElementById('__uvd_qp_close__').onclick = function() { overlay.remove(); };
                return;
            }
            
            var html = '<div style="color:' + t.primary + ';font:bold 16px Arial;margin-bottom:15px;">🎞️ Chọn chất lượng (' + qualities.length + ')</div>';
            qualities.forEach(function(q, i) {
                html += '<div class="uvd-glass-card" style="background:rgba(255,255,255,0.05);padding:14px;margin-bottom:10px;border-radius:16px;border:1px solid rgba(255,255,255,0.06);">';
                html += '<div style="display:flex;justify-content:space-between;margin-bottom:8px;">';
                html += '<b style="color:' + t.primary + ';font-size:15px;">' + q.label + '</b>';
                html += '<span style="color:' + t.text2 + ';font-size:11px;">' + Math.round(q.bandwidth/1000) + ' kbps</span>';
                html += '</div>';
                html += '<div style="color:' + t.text3 + ';font-size:11px;margin-bottom:10px;">📐 ' + q.resolution + (q.codecs ? ' · ' + q.codecs : '') + '</div>';
                html += '<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:6px;">';
                html += '<button class="__uvd_qbtn__ uvd-glass-btn" data-url="' + encodeURIComponent(q.url) + '" data-action="share" style="color:#fff;border:0;padding:10px;border-radius:12px;font-size:11px;font-weight:600;cursor:pointer;background:rgba(255,107,107,0.7);">📱 YTDLnis</button>';
                html += '<button class="__uvd_qbtn__ uvd-glass-btn" data-url="' + encodeURIComponent(q.url) + '" data-action="cmd" style="color:#fff;border:0;padding:10px;border-radius:12px;font-size:11px;font-weight:600;cursor:pointer;background:rgba(233,30,99,0.7);">⚙️ Lệnh</button>';
                html += '</div></div>';
            });
            html += '<button id="__uvd_qp_close__" class="uvd-glass-btn" style="background:' + t.danger + ';color:#fff;border:0;padding:12px;border-radius:12px;font-weight:bold;width:100%;margin-top:10px;cursor:pointer;">✕ Đóng</button>';
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
    
    // ========== PREVIEW PLAYER (Video.js v8) ==========
    function showPreview(url) {
        var t = getTheme();
        var overlay = createOverlay();
        overlay.style.padding = '0';
        overlay.style.background = 'rgba(0,0,0,0.85)';
        overlay.style.backdropFilter = 'blur(20px)';
        overlay.innerHTML = 
            '<div style="background:rgba(0,0,0,0.4);padding:15px 20px;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid rgba(255,255,255,0.08);">' +
                '<b style="color:' + t.primary + ';font-size:16px;">▶️ Preview Stream</b>' +
                '<button id="__uvd_pv_close__" class="uvd-glass-btn" style="background:' + t.danger + ';color:#fff;border:0;padding:8px 16px;border-radius:12px;font-weight:bold;cursor:pointer;">✕</button>' +
            '</div>' +
            '<div style="flex:1;display:flex;flex-direction:column;padding:16px;justify-content:center;">' +
                '<div id="__uvd_pv_container__" style="width:100%;max-height:70vh;border-radius:16px;overflow:hidden;background:#000;">' +
                    '<video id="__uvd_pv__" class="video-js vjs-default-skin" controls preload="auto" style="width:100%;height:100%;"></video>' +
                '</div>' +
                '<div id="__uvd_pv_status__" style="color:' + t.text2 + ';margin-top:12px;font-size:13px;text-align:center;">⏳ Đang load...</div>' +
            '</div>';
        
        var status = document.getElementById('__uvd_pv_status__');
        var container = document.getElementById('__uvd_pv_container__');
        
        loadVideoJS(function() {
            var player = videojs('__uvd_pv__', {
                controls: true,
                autoplay: true,
                fluid: true,
                html5: {
                    hls: {
                        enableLowInitialPlaylist: true,
                        smoothQualityChange: true,
                        overrideNative: true
                    }
                },
                playbackRates: [0.5, 1, 1.5, 2],
                controlBar: {
                    volumePanel: { inline: false },
                    pictureInPictureToggle: true
                }
            });
            
            // Determine source type
            var sourceType = 'video/mp4';
            if (url.includes('.m3u8')) sourceType = 'application/x-mpegURL';
            else if (url.includes('.mpd')) sourceType = 'application/dash+xml';
            
            player.src({
                src: url,
                type: sourceType
            });
            
            player.ready(function() {
                status.innerText = '▶️ Đang phát';
            });
            
            player.on('error', function(e) {
                status.innerText = '❌ Lỗi phát: ' + (player.error().message || 'không xác định');
            });
            
            player.on('loadedmetadata', function() {
                status.innerText = '✅ Đã tải - ' + (player.duration() ? 'Thời lượng: ' + Math.round(player.duration()) + 's' : '');
            });
            
            // Store player for cleanup
            overlay._player = player;
        });
        
        document.getElementById('__uvd_pv_close__').onclick = function() {
            if (overlay._player) {
                overlay._player.dispose();
            }
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
            html += '<div class="uvd-glass-card" style="background:rgba(255,255,255,0.05);padding:14px;margin-bottom:12px;border-radius:16px;border:1px solid rgba(255,255,255,0.06);">';
            html += '<div style="color:#FF9800;font-weight:700;margin-bottom:8px;font-size:13px;">' + c.label + '</div>';
            html += '<div style="background:rgba(0,0,0,0.3);padding:10px;border-radius:12px;font-family:monospace;font-size:11px;color:' + t.text2 + ';word-break:break-all;margin-bottom:10px;max-height:80px;overflow-y:auto;border:1px solid rgba(255,255,255,0.05);">' + c.cmd + '</div>';
            html += '<button class="__uvd_cbtn__ uvd-glass-btn" data-cmd="' + encodeURIComponent(c.cmd) + '" data-label="' + c.label + '" style="color:#fff;border:0;padding:10px;border-radius:12px;font-weight:600;width:100%;cursor:pointer;background:' + t.primary + '80;backdrop-filter:blur(10px);">📋 Chọn & sửa</button>';
            html += '</div>';
        });
        
        html += '<button id="__uvd_cp_close__" class="uvd-glass-btn" style="background:' + t.danger + ';color:#fff;border:0;padding:12px;border-radius:12px;font-weight:bold;width:100%;cursor:pointer;">✕ Đóng</button>';
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
            '<textarea id="__uvd_edit__" style="flex:1;background:rgba(0,0,0,0.3);color:' + t.text + ';border:2px solid ' + t.primary + ';border-radius:12px;padding:14px;font:13px monospace;resize:none;line-height:1.6;backdrop-filter:blur(10px);">' + text.replace(/</g, '&lt;') + '</textarea>' +
            '<div style="display:flex;gap:8px;margin-top:12px;">' +
                '<button id="__uvd_ed_ok__" class="uvd-glass-btn" style="background:' + t.primary + ';color:#fff;border:0;padding:14px;border-radius:12px;font:bold 15px Arial;flex:1;cursor:pointer;">✓ Copy</button>' +
                '<button id="__uvd_ed_share__" class="uvd-glass-btn" style="background:#FF6B6B;color:#fff;border:0;padding:14px;border-radius:12px;font:bold 15px Arial;flex:1;cursor:pointer;">📱 Share</button>' +
                '<button id="__uvd_ed_no__" class="uvd-glass-btn" style="background:' + t.danger + ';color:#fff;border:0;padding:14px;border-radius:12px;font:bold 15px Arial;flex:1;cursor:pointer;">✕ Hủy</button>' +
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
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);z-index:2147483648;padding:20px;display:flex;flex-direction:column;gap:12px;overflow-y:auto;';
        document.body.appendChild(overlay);
        return overlay;
    }
    
    // ========== RENDER: FAVORITES ==========
    function renderFavorites(container) {
        var t = getTheme();
        if (!data.favorites.length) {
            container.innerHTML = '<div style="text-align:center;padding:50px 20px;color:' + t.text2 + ';">⭐ Chưa có favorites<br><small style="color:' + t.text3 + ';">Bấm ☆ trên stream để thêm</small></div>';
            return;
        }
        
        data.favorites.forEach(function(fav, i) {
            var card = document.createElement('div');
            card.className = 'uvd-glass-card';
            card.style.cssText = 'background:rgba(255,255,255,0.05);padding:14px;margin:10px 0;border-radius:16px;border-left:4px solid gold;border:1px solid rgba(255,255,255,0.06);';
            card.innerHTML = 
                '<div style="display:flex;justify-content:space-between;margin-bottom:6px;">' +
                    '<b style="color:gold;font-size:13px;">⭐ ' + fav.type + '</b>' +
                    '<span style="color:' + t.text3 + ';font-size:10px;">' + new Date(fav.timestamp).toLocaleDateString() + '</span>' +
                '</div>' +
                '<div style="color:' + t.text + ';font-size:13px;margin-bottom:4px;">' + fav.title + '</div>' +
                '<div style="color:' + t.text3 + ';font-size:11px;margin-bottom:6px;">🌐 ' + fav.host + '</div>' +
                '<div style="word-break:break-all;font-size:10px;font-family:monospace;background:rgba(0,0,0,0.2);padding:8px;border-radius:12px;margin-bottom:8px;max-height:50px;overflow-y:auto;color:' + t.text2 + ';border:1px solid rgba(255,255,255,0.05);">' + fav.url + '</div>' +
                '<div style="display:flex;gap:6px;">' +
                    '<button class="__uvd_fbtn__ uvd-glass-btn" data-url="' + encodeURIComponent(fav.url) + '" data-action="share" style="color:#fff;border:0;padding:8px;border-radius:12px;font-size:11px;font-weight:600;flex:1;cursor:pointer;background:rgba(255,107,107,0.7);">📱 YTDLnis</button>' +
                    '<button class="__uvd_fbtn__ uvd-glass-btn" data-url="' + encodeURIComponent(fav.url) + '" data-action="copy" style="color:#fff;border:0;padding:8px;border-radius:12px;font-size:11px;font-weight:600;flex:1;cursor:pointer;background:' + t.primary + '80;">📋 Copy</button>' +
                    '<button class="__uvd_fbtn__ uvd-glass-btn" data-idx="' + i + '" data-action="del" style="color:#fff;border:0;padding:8px 12px;border-radius:12px;font-size:11px;font-weight:600;cursor:pointer;background:' + t.danger + '80;">🗑️</button>' +
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
            container.innerHTML = '<div style="text-align:center;padding:50px 20px;color:' + t.text2 + ';">📜 Chưa có history</div>';
            return;
        }
        
        var clearBtn = document.createElement('button');
        clearBtn.innerText = '🗑️ Xóa tất cả history';
        clearBtn.className = 'uvd-glass-btn';
        clearBtn.style.cssText = 'background:' + t.danger + '80;color:#fff;border:0;padding:12px;border-radius:12px;font-weight:bold;width:100%;margin-bottom:12px;cursor:pointer;';
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
            card.className = 'uvd-glass-card';
            card.style.cssText = 'background:rgba(255,255,255,0.05);padding:12px;margin:8px 0;border-radius:12px;border:1px solid rgba(255,255,255,0.06);';
            card.innerHTML = 
                '<div style="display:flex;justify-content:space-between;margin-bottom:4px;">' +
                    '<b style="color:' + t.accent + ';font-size:11px;">' + h.type + '</b>' +
                    '<span style="color:' + t.text3 + ';font-size:10px;">' + new Date(h.timestamp).toLocaleString() + '</span>' +
                '</div>' +
                '<div style="color:' + t.text + ';font-size:12px;">' + h.title + '</div>' +
                '<div style="color:' + t.text3 + ';font-size:10px;">🌐 ' + h.host + '</div>' +
                '<div style="word-break:break-all;font-size:10px;font-family:monospace;color:' + t.text2 + ';margin-top:4px;max-height:40px;overflow-y:auto;background:rgba(0,0,0,0.15);padding:6px;border-radius:8px;">' + h.url + '</div>';
            container.appendChild(card);
        });
    }
    
    // ========== RENDER: SETTINGS ==========
    function renderSettings(container) {
        var t = getTheme();
        var html = '<div style="color:' + t.primary + ';font-weight:bold;margin-bottom:18px;font-size:16px;">⚙️ Settings</div>';
        
        // Theme
        html += '<div class="uvd-glass-card" style="background:rgba(255,255,255,0.05);padding:16px;margin-bottom:12px;border-radius:16px;border:1px solid rgba(255,255,255,0.06);">';
        html += '<div style="color:' + t.text + ';font-weight:bold;margin-bottom:12px;">🎨 Theme</div>';
        html += '<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:8px;">';
        ['glass', 'dark', 'light', 'purple', 'matrix'].forEach(function(th) {
            var active = data.theme === th;
            html += '<button class="__uvd_theme__ uvd-glass-btn" data-theme="' + th + '" style="background:' + (active ? t.primary : 'rgba(255,255,255,0.05)') + ';color:' + (active ? '#fff' : t.text) + ';border:1px solid ' + (active ? t.primary : 'rgba(255,255,255,0.1)') + ';padding:10px;border-radius:12px;font-weight:600;text-transform:capitalize;cursor:pointer;">' + th + '</button>';
        });
        html += '</div></div>';
        
        // Site profiles
        html += '<div class="uvd-glass-card" style="background:rgba(255,255,255,0.05);padding:16px;margin-bottom:12px;border-radius:16px;border:1px solid rgba(255,255,255,0.06);">';
        html += '<div style="color:' + t.text + ';font-weight:bold;margin-bottom:12px;">🌐 Site Profiles</div>';
        var profiles = Object.keys(data.siteProfiles);
        if (!profiles.length) {
            html += '<div style="color:' + t.text3 + ';font-size:12px;">Chưa có profile nào. Bấm vào Referer để lưu.</div>';
        } else {
            profiles.forEach(function(p) {
                html += '<div style="background:rgba(0,0,0,0.15);padding:10px;margin-bottom:8px;border-radius:12px;font-size:11px;">';
                html += '<div style="color:' + t.primary + ';font-weight:bold;">' + p + '</div>';
                html += '<div style="color:' + t.text2 + ';font-family:monospace;font-size:10px;word-break:break-all;">' + data.siteProfiles[p].referer + '</div>';
                html += '<button class="__uvd_delprofile__ uvd-glass-btn" data-host="' + p + '" style="background:' + t.danger + '80;color:#fff;border:0;padding:6px 12px;border-radius:10px;font-size:10px;margin-top:6px;cursor:pointer;">🗑️ Xóa</button>';
                html += '</div>';
            });
        }
        html += '</div>';
        
        // Backup/Restore
        html += '<div class="uvd-glass-card" style="background:rgba(255,255,255,0.05);padding:16px;margin-bottom:12px;border-radius:16px;border:1px solid rgba(255,255,255,0.06);">';
        html += '<div style="color:' + t.text + ';font-weight:bold;margin-bottom:12px;">💾 Backup</div>';
        html += '<button id="__uvd_backup__" class="uvd-glass-btn" style="background:' + t.primary + '80;color:#fff;border:0;padding:12px;border-radius:12px;font-weight:bold;width:100%;margin-bottom:8px;cursor:pointer;">📤 Export data</button>';
        html += '<button id="__uvd_restore__" class="uvd-glass-btn" style="background:' + t.accent + '80;color:#fff;border:0;padding:12px;border-radius:12px;font-weight:bold;width:100%;margin-bottom:8px;cursor:pointer;">📥 Import data</button>';
        html += '<button id="__uvd_reset__" class="uvd-glass-btn" style="background:' + t.danger + '80;color:#fff;border:0;padding:12px;border-radius:12px;font-weight:bold;width:100%;cursor:pointer;">🔥 Reset toàn bộ</button>';
        html += '</div>';
        
        // Info
        html += '<div class="uvd-glass-card" style="background:rgba(255,255,255,0.05);padding:16px;border-radius:16px;border:1px solid rgba(255,255,255,0.06);font-size:12px;color:' + t.text2 + ';">';
        html += '<div>📦 Version: 2.0 (Glass + Video.js)</div>';
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
                data = { favorites: [], theme: 'glass', siteProfiles: {}, history: [] };
                toast('🔥 Đã reset');
                buildUI();
            }
        };
    }
    
    // ========== START ==========
    buildUI();
    
    var lastCount = urls.size;
    var autoRefresh = setInterval(function() {
        if (!document.getElementById('__uvd__')) {
            clearInterval(autoRefresh);
            stopMonitor();
            return;
        }
        if (urls.size !== lastCount) {
            lastCount = urls.size;
        }
    }, 2000);
    
    console.log('✅ Universal DL V2 (Glass) loaded! Found', urls.size, 'streams initially');
    toast('✨ Glass Edition ready! Video.js player integrated');
})();

