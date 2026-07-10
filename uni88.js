/**
 * Universal Video Downloader V3 — Glass UI Edition
 * Features: Glass UI, Live monitoring, Multi-quality, Favorites, Themes,
 *           Preview (HLS.js + quality switch), Export, Site profiles,
 *           Share to YTDLnis, Categorized tabs (Video/Photo/Script),
 *           Search/Filter, Batch operations, Keyboard shortcuts
 * Author: nguyenquocngu93
 */
(function() {
    'use strict';
    
    // ========== INIT ==========
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
    data.settings = data.settings || { autoRefresh: true, showSource: true };
    
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
        origin: profile.origin || location.origin,
        userAgent: profile.userAgent || navigator.userAgent
    };
    
    // ========== URL DETECTION ==========
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
                if (img.src) findUrls(img.src, src + ':img');
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
                        var framerate = (info.match(/FRAME-RATE=([\d.]+)/) || [])[1] || '';
                        
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
                            framerate: framerate,
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
    
    // ========== THEMES (Glass UI) ==========
    var themes = {
        'glass-dark': {
            name: 'Glass Dark',
            bg: 'rgba(15, 15, 20, 0.75)',
            bg2: 'rgba(25, 25, 35, 0.6)',
            bg3: 'rgba(35, 35, 50, 0.5)',
            glass: 'rgba(255, 255, 255, 0.05)',
            glassBorder: 'rgba(255, 255, 255, 0.1)',
            text: '#ffffff',
            text2: '#b0b0c0',
            text3: '#707088',
            primary: '#6C63FF',
            primaryGlow: 'rgba(108, 99, 255, 0.3)',
            accent: '#00D9FF',
            accentGlow: 'rgba(0, 217, 255, 0.3)',
            danger: '#FF4757',
            success: '#2ED573',
            warning: '#FFA502'
        },
        'glass-light': {
            name: 'Glass Light',
            bg: 'rgba(255, 255, 255, 0.7)',
            bg2: 'rgba(245, 245, 255, 0.6)',
            bg3: 'rgba(235, 235, 245, 0.5)',
            glass: 'rgba(0, 0, 0, 0.03)',
            glassBorder: 'rgba(0, 0, 0, 0.08)',
            text: '#1a1a2e',
            text2: '#4a4a6a',
            text3: '#8a8aa0',
            primary: '#5B4FCF',
            primaryGlow: 'rgba(91, 79, 207, 0.2)',
            accent: '#0099CC',
            accentGlow: 'rgba(0, 153, 204, 0.2)',
            danger: '#E63946',
            success: '#2A9D4A',
            warning: '#E67E00'
        },
        'glass-purple': {
            name: 'Glass Purple',
            bg: 'rgba(20, 5, 40, 0.8)',
            bg2: 'rgba(35, 10, 60, 0.65)',
            bg3: 'rgba(50, 15, 80, 0.5)',
            glass: 'rgba(187, 134, 252, 0.05)',
            glassBorder: 'rgba(187, 134, 252, 0.15)',
            text: '#ffffff',
            text2: '#d0b0ff',
            text3: '#8060a0',
            primary: '#BB86FC',
            primaryGlow: 'rgba(187, 134, 252, 0.3)',
            accent: '#03DAC5',
            accentGlow: 'rgba(3, 218, 197, 0.3)',
            danger: '#CF6679',
            success: '#66BB6A',
            warning: '#FFB74D'
        },
        'glass-matrix': {
            name: 'Glass Matrix',
            bg: 'rgba(0, 5, 0, 0.85)',
            bg2: 'rgba(0, 15, 0, 0.7)',
            bg3: 'rgba(0, 25, 0, 0.5)',
            glass: 'rgba(0, 255, 0, 0.03)',
            glassBorder: 'rgba(0, 255, 0, 0.15)',
            text: '#00ff00',
            text2: '#00cc00',
            text3: '#006600',
            primary: '#00ff00',
            primaryGlow: 'rgba(0, 255, 0, 0.3)',
            accent: '#00ffcc',
            accentGlow: 'rgba(0, 255, 204, 0.3)',
            danger: '#ff0000',
            success: '#00ff66',
            warning: '#ffff00'
        },
        'glass-cyber': {
            name: 'Glass Cyber',
            bg: 'rgba(10, 10, 30, 0.8)',
            bg2: 'rgba(15, 15, 45, 0.65)',
            bg3: 'rgba(25, 25, 60, 0.5)',
            glass: 'rgba(255, 0, 128, 0.04)',
            glassBorder: 'rgba(255, 0, 128, 0.15)',
            text: '#ffffff',
            text2: '#ff80bf',
            text3: '#804080',
            primary: '#FF0080',
            primaryGlow: 'rgba(255, 0, 128, 0.3)',
            accent: '#00FFFF',
            accentGlow: 'rgba(0, 255, 255, 0.3)',
            danger: '#FF3366',
            success: '#00FF88',
            warning: '#FFCC00'
        }
    };
    
    function getTheme() { return themes[data.theme] || themes['glass-dark']; }
    
    // ========== UTILITIES ==========
    function copy(text) {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).catch(function() {
                fallbackCopy(text);
            });
        } else {
            fallbackCopy(text);
        }
    }
    
    function fallbackCopy(text) {
        var t = document.createElement('textarea');
        t.value = text;
        t.style.cssText = 'position:fixed;left:-9999px;';
        document.body.appendChild(t);
        t.select();
        document.execCommand('copy');
        t.remove();
    }
    
    function toast(msg, type) {
        type = type || 'success';
        var t = getTheme();
        var colors = { success: t.success, error: t.danger, info: t.accent, warning: t.warning };
        var color = colors[type] || t.primary;
        
        var el = document.createElement('div');
        el.className = '__uvd_toast__';
        el.innerText = msg;
        el.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%) translateY(-20px);background:' + color + ';color:#fff;padding:12px 24px;border-radius:12px;z-index:2147483649;font:bold 13px -apple-system,Arial,sans-serif;box-shadow:0 8px 32px rgba(0,0,0,0.4),0 0 20px ' + color + '40;backdrop-filter:blur(10px);opacity:0;transition:all 0.3s ease;pointer-events:none;';
        document.body.appendChild(el);
        
        requestAnimationFrame(function() {
            el.style.opacity = '1';
            el.style.transform = 'translateX(-50%) translateY(0)';
        });
        
        setTimeout(function() {
            el.style.opacity = '0';
            el.style.transform = 'translateX(-50%) translateY(-20px)';
            setTimeout(function() { el.remove(); }, 300);
        }, 2500);
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
            toast('✓ Đã copy - Mở YTDLnis để tải', 'info');
        }
    }
    
    function addToHistory(url, type) {
        data.history = data.history || [];
        data.history.unshift({
            url: url, type: type, title: pageInfo.title,
            host: pageInfo.host, timestamp: Date.now()
        });
        if (data.history.length > 100) data.history = data.history.slice(0, 100);
        storage.set(data);
    }
    
    function isFavorite(url) {
        return data.favorites.some(function(f) { return f.url === url; });
    }
    
    function toggleFavorite(url, type) {
        var idx = data.favorites.findIndex(function(f) { return f.url === url; });
        if (idx >= 0) {
            data.favorites.splice(idx, 1);
            toast('✓ Đã xóa khỏi Favorites', 'info');
        } else {
            data.favorites.unshift({
                url: url, type: type, title: pageInfo.title,
                host: pageInfo.host, timestamp: Date.now()
            });
            toast('⭐ Đã thêm vào Favorites', 'success');
        }
        storage.set(data);
        return isFavorite(url);
    }
    
    function escapeHtml(str) {
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
    
    // ========== EXPORT ==========
    function exportData(format, items) {
        var arr = items || [...urls.entries()].map(function(e) {
            return { url: e[0], type: e[1].type, source: e[1].source, title: pageInfo.title, category: e[1].category };
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
            content = 'Category,Type,URL,Source,Title\n' + arr.map(function(a) {
                return (a.category || '') + ',' + a.type + ',"' + a.url + '",' + a.source + ',"' + a.title + '"';
            }).join('\n');
            mime = 'text/csv';
            filename = pageInfo.title + '_streams.csv';
        } else if (format === 'm3u') {
            content = '#EXTM3U\n' + arr.filter(function(a) {
                return a.category === 'video';
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
        toast('💾 Đã export ' + format.toUpperCase(), 'success');
    }
    
    // ========== BUILD UI ==========
    var currentTab = 'video';
    var currentFilter = '';
    var currentSort = 'priority';
    
    function buildUI() {
        var t = getTheme();
        var panel = document.getElementById('__uvd__');
        if (panel) panel.remove();
        
        // Inject global styles
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
            // Header
            '<div class="__uvd_header__">' +
                '<div class="__uvd_header_left__">' +
                    '<div class="__uvd_logo__">⬇️</div>' +
                    '<div>' +
                        '<div class="__uvd_title__">Universal DL <span class="__uvd_version__">V3</span></div>' +
                        '<div class="__uvd_subtitle__">' +
                            '<span class="__uvd_live_dot__"></span> LIVE · ' +
                            '<span class="__uvd_count_video__">' + videoCount + '</span> video · ' +
                            '<span class="__uvd_count_photo__">' + photoCount + '</span> photo · ' +
                            '<span class="__uvd_count_script__">' + scriptCount + '</span> script' +
                        '</div>' +
                    '</div>' +
                '</div>' +
                '<div class="__uvd_header_right__">' +
                    '<button class="__uvd_btn_icon__" id="__uvd_minimize__" title="Thu nhỏ">─</button>' +
                    '<button class="__uvd_btn_icon__" id="__uvd_close__" title="Đóng">✕</button>' +
                '</div>' +
            '</div>' +
            
            // Search bar
            '<div class="__uvd_search_bar__">' +
                '<span class="__uvd_search_icon__">🔍</span>' +
                '<input type="text" class="__uvd_search_input__" id="__uvd_search__" placeholder="Lọc theo URL, type, source..." />' +
                '<select class="__uvd_sort_select__" id="__uvd_sort__">' +
                    '<option value="priority">Sắp xếp: Priority</option>' +
                    '<option value="time">Sắp xếp: Mới nhất</option>' +
                    '<option value="type">Sắp xếp: Type</option>' +
                    '<option value="name">Sắp xếp: Tên file</option>' +
                '</select>' +
            '</div>' +
            
            // Tabs
            '<div class="__uvd_tabs__">' +
                '<button class="__uvd_tab__" data-tab="video">🎬 Video <span class="__uvd_badge__">' + videoCount + '</span></button>' +
                '<button class="__uvd_tab__" data-tab="photo">🖼️ Photo <span class="__uvd_badge__">' + photoCount + '</span></button>' +
                '<button class="__uvd_tab__" data-tab="script">📜 Script <span class="__uvd_badge__">' + scriptCount + '</span></button>' +
                '<button class="__uvd_tab__" data-tab="favorites">⭐ Favs <span class="__uvd_badge__">' + data.favorites.length + '</span></button>' +
                '<button class="__uvd_tab__" data-tab="history">📜 History <span class="__uvd_badge__">' + (data.history || []).length + '</span></button>' +
                '<button class="__uvd_tab__" data-tab="settings">⚙️</button>' +
            '</div>' +
            
            // Info bar
            '<div class="__uvd_info_bar__">' +
                '<div class="__uvd_info_row__">' +
                    '<span class="__uvd_info_label__">📝</span>' +
                    '<span class="__uvd_info_value__ __uvd_clickable__" id="__uvd_edit_title__">' + escapeHtml(pageInfo.title) + '</span>' +
                '</div>' +
                '<div class="__uvd_info_row__">' +
                    '<span class="__uvd_info_label__">🔗</span>' +
                    '<span class="__uvd_info_value__ __uvd_clickable__ __uvd_mono__" id="__uvd_edit_referer__">' + escapeHtml(pageInfo.referer) + '</span>' +
                '</div>' +
            '</div>' +
            
            // Content
            '<div class="__uvd_content__" id="__uvd_content__"></div>' +
            
            // Footer
            '<div class="__uvd_footer__">' +
                '<button class="__uvd_footer_btn__" id="__uvd_batch_copy__">📋 Copy All</button>' +
                '<button class="__uvd_footer_btn__" id="__uvd_export_txt__">💾 TXT</button>' +
                '<button class="__uvd_footer_btn__" id="__uvd_export_json__">💾 JSON</button>' +
                '<button class="__uvd_footer_btn__" id="__uvd_export_m3u__">💾 M3U</button>' +
                '<button class="__uvd_footer_btn__" id="__uvd_export_csv__">💾 CSV</button>' +
            '</div>';
        
        document.body.appendChild(panel);
        
        // Bind events
        bindGlobalEvents();
        renderTab(currentTab);
    }
    
    function getGlobalCSS(t) {
        return '' +
        '@keyframes uvdFadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }' +
        '@keyframes uvdPulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }' +
        '@keyframes uvdGlow { 0%, 100% { box-shadow: 0 0 5px ' + t.primaryGlow + '; } 50% { box-shadow: 0 0 20px ' + t.primaryGlow + ', 0 0 40px ' + t.primaryGlow + '; } }' +
        '@keyframes uvdShimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }' +
        
        '.__uvd_panel__ {' +
            'position: fixed; top: 10px; left: 10px; right: 10px; bottom: 10px;' +
            'background: ' + t.bg + ';' +
            'backdrop-filter: blur(20px) saturate(180%);' +
            '-webkit-backdrop-filter: blur(20px) saturate(180%);' +
            'border: 1px solid ' + t.glassBorder + ';' +
            'border-radius: 20px;' +
            'z-index: 2147483647;' +
            'font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;' +
            'font-size: 13px;' +
            'color: ' + t.text + ';' +
            'display: flex; flex-direction: column;' +
            'overflow: hidden;' +
            'box-shadow: 0 20px 60px rgba(0,0,0,0.5), inset 0 1px 0 ' + t.glassBorder + ';' +
            'animation: uvdFadeIn 0.3s ease;' +
        '}' +
        
        '.__uvd_panel__ ::-webkit-scrollbar { width: 6px; }' +
        '.__uvd_panel__ ::-webkit-scrollbar-track { background: transparent; }' +
        '.__uvd_panel__ ::-webkit-scrollbar-thumb { background: ' + t.primary + '40; border-radius: 3px; }' +
        '.__uvd_panel__ ::-webkit-scrollbar-thumb:hover { background: ' + t.primary + '80; }' +
        
        '.__uvd_header__ {' +
            'background: ' + t.bg2 + ';' +
            'backdrop-filter: blur(10px);' +
            'padding: 14px 18px;' +
            'display: flex; justify-content: space-between; align-items: center;' +
            'border-bottom: 1px solid ' + t.glassBorder + ';' +
        '}' +
        '.__uvd_header_left__ { display: flex; align-items: center; gap: 12px; }' +
        '.__uvd_logo__ { font-size: 28px; filter: drop-shadow(0 0 8px ' + t.primaryGlow + '); }' +
        '.__uvd_title__ { font-size: 17px; font-weight: 700; letter-spacing: -0.3px; }' +
        '.__uvd_version__ { font-size: 10px; background: ' + t.primary + '; color: #fff; padding: 2px 6px; border-radius: 4px; vertical-align: middle; }' +
        '.__uvd_subtitle__ { font-size: 11px; color: ' + t.text2 + '; margin-top: 2px; display: flex; align-items: center; gap: 4px; }' +
        '.__uvd_live_dot__ { width: 6px; height: 6px; background: ' + t.success + '; border-radius: 50%; display: inline-block; animation: uvdPulse 1.5s infinite; box-shadow: 0 0 6px ' + t.success + '; }' +
        '.__uvd_header_right__ { display: flex; gap: 6px; }' +
        
        '.__uvd_btn_icon__ {' +
            'background: ' + t.glass + ';' +
            'border: 1px solid ' + t.glassBorder + ';' +
            'color: ' + t.text + ';' +
            'width: 32px; height: 32px;' +
            'border-radius: 8px;' +
            'font-size: 14px;' +
            'cursor: pointer;' +
            'transition: all 0.2s ease;' +
            'display: flex; align-items: center; justify-content: center;' +
        '}' +
        '.__uvd_btn_icon__:hover { background: ' + t.primary + '30; border-color: ' + t.primary + '; transform: scale(1.05); }' +
        
        '.__uvd_search_bar__ {' +
            'padding: 10px 18px;' +
            'display: flex; gap: 8px; align-items: center;' +
            'background: ' + t.glass + ';' +
            'border-bottom: 1px solid ' + t.glassBorder + ';' +
        '}' +
        '.__uvd_search_icon__ { font-size: 14px; opacity: 0.6; }' +
        '.__uvd_search_input__ {' +
            'flex: 1;' +
            'background: ' + t.bg3 + ';' +
            'border: 1px solid ' + t.glassBorder + ';' +
            'color: ' + t.text + ';' +
            'padding: 8px 12px;' +
            'border-radius: 8px;' +
            'font-size: 12px;' +
            'outline: none;' +
            'transition: all 0.2s ease;' +
        '}' +
        '.__uvd_search_input__:focus { border-color: ' + t.primary + '; box-shadow: 0 0 0 3px ' + t.primaryGlow + '; }' +
        '.__uvd_search_input__::placeholder { color: ' + t.text3 + '; }' +
        
        '.__uvd_sort_select__ {' +
            'background: ' + t.bg3 + ';' +
            'border: 1px solid ' + t.glassBorder + ';' +
            'color: ' + t.text + ';' +
            'padding: 8px 10px;' +
            'border-radius: 8px;' +
            'font-size: 11px;' +
            'outline: none;' +
            'cursor: pointer;' +
        '}' +
        '.__uvd_sort_select__ option { background: ' + t.bg + '; color: ' + t.text + '; }' +
        
        '.__uvd_tabs__ {' +
            'display: flex;' +
            'background: ' + t.bg2 + ';' +
            'padding: 6px;' +
            'gap: 4px;' +
            'border-bottom: 1px solid ' + t.glassBorder + ';' +
            'overflow-x: auto;' +
        '}' +
        '.__uvd_tab__ {' +
            'flex: 1; min-width: 70px;' +
            'background: transparent;' +
            'color: ' + t.text2 + ';' +
            'border: 1px solid transparent;' +
            'padding: 8px 6px;' +
            'border-radius: 10px;' +
            'font-size: 11px;' +
            'font-weight: 600;' +
            'cursor: pointer;' +
            'transition: all 0.2s ease;' +
            'white-space: nowrap;' +
            'display: flex; align-items: center; justify-content: center; gap: 4px;' +
        '}' +
        '.__uvd_tab__:hover { background: ' + t.glass + '; color: ' + t.text + '; }' +
        '.__uvd_tab__.active {' +
            'background: ' + t.primary + '25;' +
            'color: ' + t.primary + ';' +
            'border-color: ' + t.primary + '50;' +
            'box-shadow: 0 0 12px ' + t.primaryGlow + ';' +
        '}' +
        '.__uvd_badge__ {' +
            'background: ' + t.glass + ';' +
            'border: 1px solid ' + t.glassBorder + ';' +
            'padding: 1px 6px;' +
            'border-radius: 6px;' +
            'font-size: 10px;' +
            'font-weight: 700;' +
        '}' +
        '.__uvd_tab__.active .__uvd_badge__ { background: ' + t.primary + '40; border-color: ' + t.primary + '; }' +
        
        '.__uvd_info_bar__ {' +
            'padding: 10px 18px;' +
            'background: ' + t.glass + ';' +
            'border-bottom: 1px solid ' + t.glassBorder + ';' +
            'font-size: 11px;' +
        '}' +
        '.__uvd_info_row__ { display: flex; gap: 8px; align-items: center; margin-bottom: 3px; }' +
        '.__uvd_info_row__:last-child { margin-bottom: 0; }' +
        '.__uvd_info_label__ { opacity: 0.6; }' +
        '.__uvd_info_value__ { color: ' + t.accent + '; flex: 1; }' +
        '.__uvd_clickable__ { cursor: pointer; text-decoration: underline; text-decoration-style: dotted; text-underline-offset: 2px; }' +
        '.__uvd_clickable__:hover { color: ' + t.primary + '; }' +
        '.__uvd_mono__ { font-family: "SF Mono", Monaco, Consolas, monospace; font-size: 10px; word-break: break-all; }' +
        
        '.__uvd_content__ {' +
            'flex: 1;' +
            'overflow-y: auto;' +
            'padding: 12px 18px;' +
        '}' +
        
        '.__uvd_card__ {' +
            'background: ' + t.bg3 + ';' +
            'backdrop-filter: blur(5px);' +
            'border: 1px solid ' + t.glassBorder + ';' +
            'padding: 14px;' +
            'margin-bottom: 10px;' +
            'border-radius: 12px;' +
            'transition: all 0.2s ease;' +
            'animation: uvdFadeIn 0.3s ease;' +
        '}' +
        '.__uvd_card__:hover { border-color: ' + t.primary + '50; box-shadow: 0 4px 20px rgba(0,0,0,0.2); transform: translateY(-1px); }' +
        
        '.__uvd_card_header__ { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }' +
        '.__uvd_type_badge__ {' +
            'padding: 4px 10px;' +
            'border-radius: 6px;' +
            'font-size: 10px;' +
            'font-weight: 700;' +
            'text-transform: uppercase;' +
            'letter-spacing: 0.5px;' +
            'color: #fff;' +
        '}' +
        '.__uvd_card_meta__ { display: flex; gap: 8px; align-items: center; }' +
        '.__uvd_source__ { color: ' + t.text3 + '; font-size: 10px; }' +
        
        '.__uvd_fav_btn__ {' +
            'background: transparent; border: 0; font-size: 18px; cursor: pointer; padding: 2px 6px;' +
            'transition: transform 0.2s ease;' +
        '}' +
        '.__uvd_fav_btn__:hover { transform: scale(1.2); }' +
        
        '.__uvd_url_box__ {' +
            'background: ' + t.bg + ';' +
            'border: 1px solid ' + t.glassBorder + ';' +
            'padding: 8px 10px;' +
            'border-radius: 8px;' +
            'font-family: "SF Mono", Monaco, Consolas, monospace;' +
            'font-size: 10px;' +
            'color: ' + t.text2 + ';' +
            'word-break: break-all;' +
            'max-height: 60px;' +
            'overflow-y: auto;' +
            'line-height: 1.5;' +
            'margin-bottom: 10px;' +
        '}' +
        
        '.__uvd_actions__ { display: grid; grid-template-columns: repeat(2, 1fr); gap: 6px; }' +
        '.__uvd_act_btn__ {' +
            'border: 0;' +
            'padding: 10px 8px;' +
            'border-radius: 8px;' +
            'font-size: 11px;' +
            'font-weight: 600;' +
            'cursor: pointer;' +
            'transition: all 0.2s ease;' +
            'color: #fff;' +
            'display: flex; align-items: center; justify-content: center; gap: 4px;' +
        '}' +
        '.__uvd_act_btn__:hover { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(0,0,0,0.3); filter: brightness(1.1); }' +
        '.__uvd_act_btn__:active { transform: translateY(0); }' +
        '.__uvd_act_btn__.full { grid-column: 1 / -1; }' +
        
        '.__uvd_btn_share__ { background: linear-gradient(135deg, #FF6B6B, #FF4757); }' +
        '.__uvd_btn_copy__ { background: linear-gradient(135deg, ' + t.primary + ', ' + t.accent + '); }' +
        '.__uvd_btn_quality__ { background: linear-gradient(135deg, #9C27B0, #7B1FA2); }' +
        '.__uvd_btn_preview__ { background: linear-gradient(135deg, #00BCD4, #0097A7); }' +
        '.__uvd_btn_cmd__ { background: linear-gradient(135deg, #E91E63, #C2185B); }' +
        '.__uvd_btn_iframe__ { background: linear-gradient(135deg, #2196F3, #1565C0); }' +
        '.__uvd_btn_download__ { background: linear-gradient(135deg, ' + t.success + ', #1B9E54); }' +
        '.__uvd_btn_open__ { background: linear-gradient(135deg, ' + t.warning + ', #CC8400); }' +
        
        '.__uvd_footer__ {' +
            'background: ' + t.bg2 + ';' +
            'backdrop-filter: blur(10px);' +
            'padding: 10px 14px;' +
            'border-top: 1px solid ' + t.glassBorder + ';' +
            'display: flex; gap: 6px; flex-wrap: wrap;' +
        '}' +
        '.__uvd_footer_btn__ {' +
            'background: ' + t.glass + ';' +
            'border: 1px solid ' + t.glassBorder + ';' +
            'color: ' + t.text + ';' +
            'padding: 8px 10px;' +
            'border-radius: 8px;' +
            'font-size: 11px;' +
            'font-weight: 600;' +
            'flex: 1; min-width: 60px;' +
            'cursor: pointer;' +
            'transition: all 0.2s ease;' +
        '}' +
        '.__uvd_footer_btn__:hover { background: ' + t.primary + '30; border-color: ' + t.primary + '; }' +
        
        '.__uvd_empty__ {' +
            'text-align: center; padding: 50px 20px; color: ' + t.text2 + ';' +
        '}' +
        '.__uvd_empty_icon__ { font-size: 48px; margin-bottom: 12px; opacity: 0.5; }' +
        '.__uvd_empty_text__ { font-size: 14px; font-weight: 600; margin-bottom: 6px; }' +
        '.__uvd_empty_sub__ { font-size: 11px; color: ' + t.text3 + '; }' +
        
        '.__uvd_overlay__ {' +
            'position: fixed; inset: 0;' +
            'background: rgba(0,0,0,0.85);' +
            'backdrop-filter: blur(10px);' +
            'z-index: 2147483648;' +
            'padding: 20px;' +
            'display: flex; flex-direction: column;' +
            'overflow-y: auto;' +
            'animation: uvdFadeIn 0.2s ease;' +
        '}' +
        '.__uvd_overlay_box__ {' +
            'background: ' + t.bg + ';' +
            'backdrop-filter: blur(20px);' +
            'border: 1px solid ' + t.glassBorder + ';' +
            'border-radius: 16px;' +
            'padding: 20px;' +
            'max-width: 600px;' +
            'margin: auto;' +
            'width: 100%;' +
            'box-shadow: 0 20px 60px rgba(0,0,0,0.5);' +
        '}' +
        '.__uvd_overlay_title__ { color: ' + t.primary + '; font-size: 18px; font-weight: 700; margin-bottom: 15px; display: flex; align-items: center; gap: 8px; }' +
        
        '.__uvd_quality_card__ {' +
            'background: ' + t.bg3 + ';' +
            'border: 1px solid ' + t.glassBorder + ';' +
            'padding: 14px;' +
            'margin-bottom: 10px;' +
            'border-radius: 10px;' +
            'transition: all 0.2s ease;' +
        '}' +
        '.__uvd_quality_card__:hover { border-color: ' + t.primary + '; }' +
        '.__uvd_quality_header__ { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }' +
        '.__uvd_quality_label__ { color: ' + t.primary + '; font-size: 16px; font-weight: 700; }' +
        '.__uvd_quality_info__ { color: ' + t.text3 + '; font-size: 11px; margin-bottom: 10px; }' +
        
        '.__uvd_cmd_card__ {' +
            'background: ' + t.bg3 + ';' +
            'border: 1px solid ' + t.glassBorder + ';' +
            'padding: 14px;' +
            'margin-bottom: 10px;' +
            'border-radius: 10px;' +
        '}' +
        '.__uvd_cmd_label__ { color: ' + t.warning + '; font-weight: 600; margin-bottom: 8px; font-size: 13px; }' +
        '.__uvd_cmd_code__ {' +
            'background: ' + t.bg + ';' +
            'border: 1px solid ' + t.glassBorder + ';' +
            'padding: 10px;' +
            'border-radius: 6px;' +
            'font-family: "SF Mono", Monaco, Consolas, monospace;' +
            'font-size: 10px;' +
            'color: ' + t.text2 + ';' +
            'word-break: break-all;' +
            'max-height: 80px;' +
            'overflow-y: auto;' +
            'margin-bottom: 10px;' +
            'line-height: 1.5;' +
        '}' +
        
        '.__uvd_textarea__ {' +
            'width: 100%; min-height: 150px;' +
            'background: ' + t.bg + ';' +
            'border: 2px solid ' + t.primary + '60;' +
            'color: ' + t.text + ';' +
            'border-radius: 10px;' +
            'padding: 12px;' +
            'font: 12px "SF Mono", Monaco, Consolas, monospace;' +
            'resize: vertical;' +
            'line-height: 1.5;' +
            'outline: none;' +
        '}' +
        '.__uvd_textarea__:focus { border-color: ' + t.primary + '; box-shadow: 0 0 0 3px ' + t.primaryGlow + '; }' +
        
        '.__uvd_btn_primary__ {' +
            'background: linear-gradient(135deg, ' + t.primary + ', ' + t.accent + ');' +
            'color: #fff; border: 0; padding: 12px 20px; border-radius: 10px;' +
            'font-weight: 700; font-size: 13px; cursor: pointer;' +
            'transition: all 0.2s ease; flex: 1;' +
        '}' +
        '.__uvd_btn_primary__:hover { transform: translateY(-1px); box-shadow: 0 4px 15px ' + t.primaryGlow + '; }' +
        '.__uvd_btn_danger__ {' +
            'background: linear-gradient(135deg, ' + t.danger + ', #CC0033);' +
            'color: #fff; border: 0; padding: 12px 20px; border-radius: 10px;' +
            'font-weight: 700; font-size: 13px; cursor: pointer; flex: 1;' +
        '}' +
        '.__uvd_btn_ghost__ {' +
            'background: ' + t.glass + '; border: 1px solid ' + t.glassBorder + ';' +
            'color: ' + t.text + '; padding: 12px 20px; border-radius: 10px;' +
            'font-weight: 600; font-size: 13px; cursor: pointer; flex: 1;' +
        '}' +
        
        '.__uvd_settings_section__ {' +
            'background: ' + t.bg3 + ';' +
            'border: 1px solid ' + t.glassBorder + ';' +
            'padding: 16px; margin-bottom: 12px; border-radius: 12px;' +
        '}' +
        '.__uvd_settings_title__ { color: ' + t.text + '; font-weight: 700; margin-bottom: 12px; font-size: 14px; }' +
        '.__uvd_theme_grid__ { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; }' +
        '.__uvd_theme_btn__ {' +
            'background: ' + t.bg2 + '; border: 2px solid ' + t.glassBorder + ';' +
            'color: ' + t.text + '; padding: 12px; border-radius: 10px;' +
            'font-weight: 600; cursor: pointer; transition: all 0.2s ease;' +
            'text-transform: capitalize; font-size: 12px;' +
        '}' +
        '.__uvd_theme_btn__:hover { border-color: ' + t.primary + '; }' +
        '.__uvd_theme_btn__.active { border-color: ' + t.primary + '; background: ' + t.primary + '25; box-shadow: 0 0 12px ' + t.primaryGlow + '; }' +
        
        '.__uvd_profile_card__ {' +
            'background: ' + t.bg + '; border: 1px solid ' + t.glassBorder + ';' +
            'padding: 10px; margin-bottom: 6px; border-radius: 8px; font-size: 11px;' +
        '}' +
        '.__uvd_profile_host__ { color: ' + t.primary + '; font-weight: 700; margin-bottom: 4px; }' +
        '.__uvd_profile_ref__ { color: ' + t.text2 + '; font-family: monospace; font-size: 10px; word-break: break-all; }' +
        
        '.__uvd_photo_preview__ {' +
            'width: 100%; max-height: 200px; object-fit: contain;' +
            'background: ' + t.bg + '; border-radius: 8px; margin-bottom: 10px;' +
            'border: 1px solid ' + t.glassBorder + ';' +
        '}' +
        
        '.__uvd_player_container__ {' +
            'background: #000; border-radius: 12px; overflow: hidden;' +
            'position: relative; margin-bottom: 15px;' +
        '}' +
        '.__uvd_player__ { width: 100%; max-height: 60vh; display: block; background: #000; }' +
        '.__uvd_player_status__ {' +
            'position: absolute; bottom: 10px; left: 50%; transform: translateX(-50%);' +
            'background: rgba(0,0,0,0.7); backdrop-filter: blur(10px);' +
            'padding: 6px 14px; border-radius: 20px; font-size: 11px; color: #fff;' +
        '}' +
        '.__uvd_player_controls__ {' +
            'display: flex; gap: 6px; flex-wrap: wrap; margin-top: 10px;' +
        '}' +
        '.__uvd_player_btn__ {' +
            'background: ' + t.bg3 + '; border: 1px solid ' + t.glassBorder + ';' +
            'color: ' + t.text + '; padding: 8px 12px; border-radius: 8px;' +
            'font-size: 11px; font-weight: 600; cursor: pointer;' +
            'transition: all 0.2s ease;' +
        '}' +
        '.__uvd_player_btn__:hover { background: ' + t.primary + '30; border-color: ' + t.primary + '; }' +
        '.__uvd_player_btn__.active { background: ' + t.primary + '; border-color: ' + t.primary + '; color: #fff; }' +
        
        '.__uvd_history_item__ {' +
            'background: ' + t.bg3 + '; border: 1px solid ' + t.glassBorder + ';' +
            'padding: 10px 12px; margin-bottom: 6px; border-radius: 8px;' +
            'display: flex; justify-content: space-between; align-items: center;' +
        '}' +
        '.__uvd_history_info__ { flex: 1; min-width: 0; }' +
        '.__uvd_history_title__ { color: ' + t.text + '; font-size: 12px; font-weight: 600; margin-bottom: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }' +
        '.__uvd_history_meta__ { color: ' + t.text3 + '; font-size: 10px; }' +
        '.__uvd_history_url__ { color: ' + t.text2 + '; font-size: 10px; font-family: monospace; word-break: break-all; max-height: 30px; overflow: hidden; }' +
        
        '.__uvd_fav_card__ {' +
            'background: ' + t.bg3 + '; border: 1px solid ' + t.glassBorder + ';' +
            'padding: 14px; margin-bottom: 10px; border-radius: 12px;' +
            'border-left: 4px solid gold;' +
        '}' +
        '.__uvd_fav_header__ { display: flex; justify-content: space-between; margin-bottom: 6px; }' +
        '.__uvd_fav_title__ { color: gold; font-size: 12px; font-weight: 700; }' +
        '.__uvd_fav_date__ { color: ' + t.text3 + '; font-size: 10px; }' +
        
        '.btn-row { display: flex; gap: 8px; margin-top: 12px; }';
    }
    
    function bindGlobalEvents() {
        // Tabs
        document.querySelectorAll('.__uvd_tab__').forEach(function(tab) {
            tab.onclick = function() {
                currentTab = this.dataset.tab;
                document.querySelectorAll('.__uvd_tab__').forEach(function(t) { t.classList.remove('active'); });
                this.classList.add('active');
                renderTab(currentTab);
            };
        });
        // Set initial active tab
        var initialTab = document.querySelector('.__uvd_tab__[data-tab="' + currentTab + '"]');
        if (initialTab) initialTab.classList.add('active');
        
        // Search
        document.getElementById('__uvd_search__').oninput = function() {
            currentFilter = this.value.toLowerCase();
            renderTab(currentTab);
        };
        
        // Sort
        document.getElementById('__uvd_sort__').onchange = function() {
            currentSort = this.value;
            renderTab(currentTab);
        };
        
        // Header buttons
        document.getElementById('__uvd_close__').onclick = function() {
            stopMonitor();
            var panel = document.getElementById('__uvd__');
            if (panel) panel.remove();
            var style = document.getElementById('__uvd_styles__');
            if (style) style.remove();
        };
        
        document.getElementById('__uvd_minimize__').onclick = function() {
            var panel = document.getElementById('__uvd__');
            if (panel) {
                if (panel.dataset.minimized === 'true') {
                    panel.style.height = '';
                    panel.style.bottom = '10px';
                    panel.dataset.minimized = 'false';
                    this.innerText = '─';
                } else {
                    panel.style.height = '50px';
                    panel.style.bottom = '';
                    panel.style.top = '10px';
                    panel.dataset.minimized = 'true';
                    this.innerText = '▢';
                }
            }
        };
        
        // Info bar
        document.getElementById('__uvd_edit_title__').onclick = function() {
            var newTitle = prompt('Tên file:', pageInfo.title);
            if (newTitle) {
                pageInfo.title = newTitle.replace(/[^\w\s\u00C0-\u1EF9.-]/g, '').substring(0, 100);
                this.innerText = pageInfo.title;
                toast('✓ Đã cập nhật tên', 'success');
            }
        };
        
        document.getElementById('__uvd_edit_referer__').onclick = function() {
            var newRef = prompt('Referer:', pageInfo.referer);
            if (newRef) {
                pageInfo.referer = newRef;
                this.innerText = newRef;
                data.siteProfiles[pageInfo.host] = { referer: newRef, userAgent: pageInfo.userAgent };
                storage.set(data);
                toast('✓ Đã lưu Referer cho ' + pageInfo.host, 'success');
            }
        };
        
        // Footer
        document.getElementById('__uvd_batch_copy__').onclick = function() {
            var allUrls = [...urls.keys()].join('\n');
            copy(allUrls);
            toast('✓ Đã copy ' + urls.size + ' URLs', 'success');
        };
        document.getElementById('__uvd_export_txt__').onclick = function() { exportData('txt'); };
        document.getElementById('__uvd_export_json__').onclick = function() { exportData('json'); };
        document.getElementById('__uvd_export_m3u__').onclick = function() { exportData('m3u'); };
        document.getElementById('__uvd_export_csv__').onclick = function() { exportData('csv'); };
        
        // Keyboard shortcuts
        document.onkeydown = function(e) {
            if (e.key === 'Escape') {
                var overlays = document.querySelectorAll('.__uvd_overlay__');
                if (overlays.length > 0) {
                    overlays[overlays.length - 1].remove();
                } else {
                    document.getElementById('__uvd_close__').click();
                }
            }
        };
    }
    
    // ========== RENDER TABS ==========
    function renderTab(tabId) {
        var content = document.getElementById('__uvd_content__');
        if (!content) return;
        content.innerHTML = '';
        
        if (tabId === 'video') renderCategory(content, 'video');
        else if (tabId === 'photo') renderCategory(content, 'photo');
        else if (tabId === 'script') renderCategory(content, 'script');
        else if (tabId === 'favorites') renderFavorites(content);
        else if (tabId === 'history') renderHistory(content);
        else if (tabId === 'settings') renderSettings(content);
    }
    
    function getSortedFilteredItems(category) {
        var items = [...urls.entries()].filter(function(e) {
            return e[1].category === category;
        }).map(function(e) {
            return { url: e[0], type: e[1].type, source: e[1].source, priority: e[1].priority, timestamp: e[1].timestamp };
        });
        
        // Filter
        if (currentFilter) {
            items = items.filter(function(item) {
                return item.url.toLowerCase().includes(currentFilter) ||
                       item.type.toLowerCase().includes(currentFilter) ||
                       item.source.toLowerCase().includes(currentFilter);
            });
        }
        
        // Sort
        if (currentSort === 'priority') {
            items.sort(function(a, b) { return a.priority - b.priority; });
        } else if (currentSort === 'time') {
            items.sort(function(a, b) { return b.timestamp - a.timestamp; });
        } else if (currentSort === 'type') {
            items.sort(function(a, b) { return a.type.localeCompare(b.type); });
        } else if (currentSort === 'name') {
            items.sort(function(a, b) {
                var na = a.url.split('/').pop().split('?')[0];
                var nb = b.url.split('/').pop().split('?')[0];
                return na.localeCompare(nb);
            });
        }
        
        return items;
    }
    
    function renderCategory(container, category) {
        var t = getTheme();
        var items = getSortedFilteredItems(category);
        
        if (!items.length) {
            var icons = { video: '🎬', photo: '🖼️', script: '📜' };
            var names = { video: 'video stream', photo: 'photo', script: 'script/iframe' };
            container.innerHTML = 
                '<div class="__uvd_empty__">' +
                    '<div class="__uvd_empty_icon__">' + icons[category] + '</div>' +
                    '<div class="__uvd_empty_text__">Chưa tìm thấy ' + names[category] + ' nào</div>' +
                    '<div class="__uvd_empty_sub__">Đang monitor... Bấm Play video hoặc load thêm nội dung</div>' +
                '</div>';
            return;
        }
        
        var typeColors = {
            'M3U8': '#4CAF50', 'MPD': '#8BC34A', 'MP4': '#FF9800',
            'WEBM': '#FF9800', 'MKV': '#FF5722', 'FLV': '#FF5722',
            'TS': '#FFC107', 'IFRAME': '#2196F3',
            'JPG': '#E91E63', 'PNG': '#9C27B0', 'GIF': '#FF5722',
            'WEBP': '#00BCD4', 'SVG': '#4CAF50', 'BMP': '#795548'
        };
        
        items.forEach(function(item, i) {
            var url = item.url;
            var type = item.type;
            var color = typeColors[type] || '#666';
            var fav = isFavorite(url);
            
            var card = document.createElement('div');
            card.className = '__uvd_card__';
            
            var headerHtml = 
                '<div class="__uvd_card_header__">' +
                    '<span class="__uvd_type_badge__" style="background:' + color + ';">#' + (i + 1) + ' ' + type + '</span>' +
                    '<div class="__uvd_card_meta__">' +
                        '<span class="__uvd_source__">' + escapeHtml(item.source) + '</span>' +
                        '<button class="__uvd_fav_btn__" data-url="' + encodeURIComponent(url) + '" data-type="' + type + '">' + (fav ? '⭐' : '☆') + '</button>' +
                    '</div>' +
                '</div>';
            
            var urlHtml = '<div class="__uvd_url_box__">' + escapeHtml(url) + '</div>';
            
            var actionsHtml = '';
            if (category === 'photo') {
                actionsHtml = 
                    '<div class="__uvd_actions__">' +
                        '<button class="__uvd_act_btn__ __uvd_btn_open__" data-url="' + encodeURIComponent(url) + '" data-action="open_photo">🖼️ Mở ảnh</button>' +
                        '<button class="__uvd_act_btn__ __uvd_btn_copy__" data-url="' + encodeURIComponent(url) + '" data-action="copy">📋 Copy</button>' +
                        '<button class="__uvd_act_btn__ __uvd_btn_download__" data-url="' + encodeURIComponent(url) + '" data-action="download_photo" data-type="' + type + '">💾 Tải xuống</button>' +
                        '<button class="__uvd_act_btn__ __uvd_btn_share__" data-url="' + encodeURIComponent(url) + '" data-action="share">📱 Share</button>' +
                    '</div>';
            } else if (type === 'IFRAME') {
                actionsHtml = 
                    '<div class="__uvd_actions__">' +
                        '<a href="' + url + '" target="_blank" class="__uvd_act_btn__ __uvd_btn_iframe__ full" style="text-decoration:none;text-align:center;">➡️ Mở iframe trong tab mới</a>' +
                        '<button class="__uvd_act_btn__ __uvd_btn_copy__" data-url="' + encodeURIComponent(url) + '" data-action="copy">📋 Copy</button>' +
                        '<button class="__uvd_act_btn__ __uvd_btn_share__" data-url="' + encodeURIComponent(url) + '" data-action="share">📱 Share</button>' +
                    '</div>';
            } else {
                var extraBtns = '';
                if (type === 'M3U8') {
                    extraBtns += '<button class="__uvd_act_btn__ __uvd_btn_quality__" data-url="' + encodeURIComponent(url) + '" data-action="quality">🎞️ Quality</button>';
                    extraBtns += '<button class="__uvd_act_btn__ __uvd_btn_preview__" data-url="' + encodeURIComponent(url) + '" data-action="preview">▶️ Preview</button>';
                }
                actionsHtml = 
                    '<div class="__uvd_actions__">' +
                        '<button class="__uvd_act_btn__ __uvd_btn_share__" data-url="' + encodeURIComponent(url) + '" data-action="share">📱 YTDLnis</button>' +
                        '<button class="__uvd_act_btn__ __uvd_btn_copy__" data-url="' + encodeURIComponent(url) + '" data-action="copy">📋 Copy</button>' +
                        extraBtns +
                        '<button class="__uvd_act_btn__ __uvd_btn_cmd__ full" data-url="' + encodeURIComponent(url) + '" data-action="cmd" data-type="' + type + '">⚙️ Tất cả lệnh tải</button>' +
                    '</div>';
            }
            
            card.innerHTML = headerHtml + urlHtml + actionsHtml;
            container.appendChild(card);
        });
        
        // Bind card events
        container.querySelectorAll('.__uvd_fav_btn__').forEach(function(b) {
            b.onclick = function(e) {
                e.stopPropagation();
                var url = decodeURIComponent(this.dataset.url);
                var isFav = toggleFavorite(url, this.dataset.type);
                this.innerText = isFav ? '⭐' : '☆';
            };
        });
        
        container.querySelectorAll('.__uvd_act_btn__').forEach(function(b) {
            b.onclick = function(e) {
                e.preventDefault();
                var url = decodeURIComponent(this.dataset.url);
                var action = this.dataset.action;
                var type = this.dataset.type;
                
                addToHistory(url, type || 'URL');
                
                if (action === 'share') shareUrl(url);
                else if (action === 'copy') { copy(url); toast('✓ Đã copy URL', 'success'); }
                else if (action === 'quality') showQualityPicker(url);
                else if (action === 'preview') showPreview(url);
                else if (action === 'cmd') showCommandPicker(url, type);
                else if (action === 'open_photo') window.open(url, '_blank');
                else if (action === 'download_photo') downloadPhoto(url, type);
            };
        });
    }
    
    function downloadPhoto(url, type) {
        var a = document.createElement('a');
        a.href = url;
        a.download = pageInfo.title + '.' + (type || 'jpg').toLowerCase();
        a.target = '_blank';
        a.rel = 'noopener';
        a.click();
        toast('💾 Đang tải ảnh...', 'info');
    }
    
    // ========== QUALITY PICKER ==========
    function showQualityPicker(url) {
        var t = getTheme();
        var overlay = document.createElement('div');
        overlay.className = '__uvd_overlay__';
        overlay.innerHTML = 
            '<div class="__uvd_overlay_box__">' +
                '<div class="__uvd_overlay_title__">🎞️ Đang phân tích M3U8...</div>' +
                '<div style="text-align:center;padding:30px;color:' + t.text2 + ';">⏳ Loading...</div>' +
            '</div>';
        document.body.appendChild(overlay);
        
        overlay.onclick = function(e) {
            if (e.target === overlay) overlay.remove();
        };
        
        parseM3U8Master(url, function(qualities) {
            if (!qualities) {
                overlay.querySelector('.__uvd_overlay_box__').innerHTML = 
                    '<div class="__uvd_overlay_title__">❌ Không phải Master Playlist</div>' +
                    '<div style="color:' + t.text2 + ';margin-bottom:15px;">Đây là stream đơn, không có nhiều chất lượng.</div>' +
                    '<div class="btn-row">' +
                        '<button class="__uvd_btn_primary__" id="__uvd_qp_play__">▶️ Xem trực tiếp</button>' +
                        '<button class="__uvd_btn_ghost__" id="__uvd_qp_close__">✕ Đóng</button>' +
                    '</div>';
                
                overlay.querySelector('#__uvd_qp_play__').onclick = function() { overlay.remove(); showPreview(url); };
                overlay.querySelector('#__uvd_qp_close__').onclick = function() { overlay.remove(); };
                return;
            }
            
            var html = '<div class="__uvd_overlay_title__">🎞️ Chọn chất lượng (' + qualities.length + ')</div>';
            
            qualities.forEach(function(q, i) {
                var sizeMB = q.bandwidth ? (q.bandwidth / 1024 / 1024 * 60).toFixed(1) : '?';
                html += 
                    '<div class="__uvd_quality_card__">' +
                        '<div class="__uvd_quality_header__">' +
                            '<span class="__uvd_quality_label__">' + q.label + '</span>' +
                            '<span style="color:' + t.text2 + ';font-size:11px;">' + Math.round(q.bandwidth/1000) + ' kbps</span>' +
                        '</div>' +
                        '<div class="__uvd_quality_info__">' +
                            '📐 ' + q.resolution +
                            (q.codecs ? ' · 🎬 ' + q.codecs : '') +
                            (q.framerate ? ' · 🎞️ ' + q.framerate + 'fps' : '') +
                            ' · ~' + sizeMB + 'MB/phút' +
                        '</div>' +
                        '<div class="__uvd_url_box__">' + escapeHtml(q.url) + '</div>' +
                        '<div class="__uvd_actions__">' +
                            '<button class="__uvd_act_btn__ __uvd_btn_preview__" data-url="' + encodeURIComponent(q.url) + '" data-action="preview">▶️ Preview</button>' +
                            '<button class="__uvd_act_btn__ __uvd_btn_copy__" data-url="' + encodeURIComponent(q.url) + '" data-action="copy">📋 Copy</button>' +
                            '<button class="__uvd_act_btn__ __uvd_btn_share__" data-url="' + encodeURIComponent(q.url) + '" data-action="share">📱 YTDLnis</button>' +
                            '<button class="__uvd_act_btn__ __uvd_btn_cmd__" data-url="' + encodeURIComponent(q.url) + '" data-action="cmd">⚙️ Lệnh</button>' +
                        '</div>' +
                    '</div>';
            });
            
            html += '<div class="btn-row"><button class="__uvd_btn_danger__" id="__uvd_qp_close__">✕ Đóng</button></div>';
            
            overlay.querySelector('.__uvd_overlay_box__').innerHTML = html;
            
            overlay.querySelectorAll('.__uvd_act_btn__').forEach(function(b) {
                b.onclick = function() {
                    var qUrl = decodeURIComponent(this.dataset.url);
                    var action = this.dataset.action;
                    if (action === 'preview') { overlay.remove(); showPreview(qUrl); }
                    else if (action === 'copy') { copy(qUrl); toast('✓ Đã copy', 'success'); }
                    else if (action === 'share') shareUrl(qUrl);
                    else if (action === 'cmd') { overlay.remove(); showCommandPicker(qUrl, 'M3U8'); }
                };
            });
            
            overlay.querySelector('#__uvd_qp_close__').onclick = function() { overlay.remove(); };
        });
    }
    
    // ========== PREVIEW PLAYER (Enhanced) ==========
    function showPreview(url) {
        var t = getTheme();
        var overlay = document.createElement('div');
        overlay.className = '__uvd_overlay__';
        overlay.innerHTML = 
            '<div class="__uvd_overlay_box__" style="max-width:800px;">' +
                '<div class="__uvd_overlay_title__">' +
                    '<span>▶️ Preview Stream</span>' +
                    '<button class="__uvd_btn_icon__" id="__uvd_pv_close__" style="margin-left:auto;">✕</button>' +
                '</div>' +
                '<div class="__uvd_player_container__">' +
                    '<video id="__uvd_pv__" class="__uvd_player__" controls autoplay playsinline></video>' +
                    '<div class="__uvd_player_status__" id="__uvd_pv_status__">⏳ Đang load...</div>' +
                '</div>' +
                '<div class="__uvd_player_controls__" id="__uvd_pv_controls__">' +
                    '<button class="__uvd_player_btn__" id="__uvd_pv_copy__">📋 Copy URL</button>' +
                    '<button class="__uvd_player_btn__" id="__uvd_pv_share__">📱 Share</button>' +
                    '<button class="__uvd_player_btn__" id="__uvd_pv_cmd__">⚙️ Lệnh tải</button>' +
                    '<button class="__uvd_player_btn__" id="__uvd_pv_fullscreen__">⛶ Fullscreen</button>' +
                '</div>' +
                '<div id="__uvd_pv_quality_list__" style="margin-top:10px;"></div>' +
            '</div>';
        document.body.appendChild(overlay);
        
        overlay.onclick = function(e) {
            if (e.target === overlay) {
                var video = document.getElementById('__uvd_pv__');
                if (video) { video.pause(); video.src = ''; }
                overlay.remove();
            }
        };
        
        var video = document.getElementById('__uvd_pv__');
        var status = document.getElementById('__uvd_pv_status__');
        var qualityList = document.getElementById('__uvd_pv_quality_list__');
        var currentHls = null;
        
        // Bind control buttons
        document.getElementById('__uvd_pv_close__').onclick = function() {
            video.pause(); video.src = ''; overlay.remove();
        };
        document.getElementById('__uvd_pv_copy__').onclick = function() { copy(url); toast('✓ Đã copy', 'success'); };
        document.getElementById('__uvd_pv_share__').onclick = function() { shareUrl(url); };
        document.getElementById('__uvd_pv_cmd__').onclick = function() { overlay.remove(); showCommandPicker(url, 'M3U8'); };
        document.getElementById('__uvd_pv_fullscreen__').onclick = function() {
            if (video.requestFullscreen) video.requestFullscreen();
            else if (video.webkitRequestFullscreen) video.webkitRequestFullscreen();
        };
        
        function loadHls() {
            if (window.Hls) {
                initHls();
            } else {
                var hlsScript = document.createElement('script');
                hlsScript.src = 'https://cdn.jsdelivr.net/npm/hls.js@latest';
                hlsScript.onload = initHls;
                hlsScript.onerror = function() {
                    status.innerText = '❌ Không load được HLS.js';
                    video.src = url;
                };
                document.head.appendChild(hlsScript);
            }
        }
        
        function initHls() {
            if (Hls.isSupported()) {
                currentHls = new Hls({
                    maxLoadingDelay: 4,
                    maxBufferLength: 30,
                    enableWorker: true
                });
                currentHls.loadSource(url);
                currentHls.attachMedia(video);
                
                currentHls.on(Hls.Events.MANIFEST_PARSED, function(event, data) {
                    status.innerText = '✅ HLS loaded · ' + data.levels.length + ' levels';
                    
                    // Build quality selector
                    if (data.levels.length > 1) {
                        var qHtml = '<div style="color:' + t.text2 + ';font-size:11px;margin-bottom:6px;font-weight:600;">🎞️ Chất lượng:</div>';
                        qHtml += '<div style="display:flex;gap:6px;flex-wrap:wrap;">';
                        
                        // Auto option
                        qHtml += '<button class="__uvd_player_btn__ active" data-level="-1">Auto</button>';
                        
                        data.levels.forEach(function(level, idx) {
                            var label = level.height ? level.height + 'p' : Math.round(level.bitrate/1000) + 'k';
                            qHtml += '<button class="__uvd_player_btn__" data-level="' + idx + '">' + label + '</button>';
                        });
                        qHtml += '</div>';
                        qualityList.innerHTML = qHtml;
                        
                        qualityList.querySelectorAll('.__uvd_player_btn__').forEach(function(btn) {
                            btn.onclick = function() {
                                qualityList.querySelectorAll('.__uvd_player_btn__').forEach(function(b) { b.classList.remove('active'); });
                                this.classList.add('active');
                                currentHls.currentLevel = parseInt(this.dataset.level);
                                toast('🎞️ Quality: ' + this.innerText, 'info');
                            };
                        });
                    }
                });
                
                currentHls.on(Hls.Events.ERROR, function(event, data) {
                    console.error('HLS error:', data);
                    if (data.fatal) {
                        status.innerText = '❌ Lỗi: ' + data.details;
                        switch(data.type) {
                            case Hls.ErrorTypes.NETWORK_ERROR:
                                currentHls.startLoad();
                                break;
                            case Hls.ErrorTypes.MEDIA_ERROR:
                                currentHls.recoverMediaError();
                                break;
                            default:
                                currentHls.destroy();
                                break;
                        }
                    }
                });
                
                video.addEventListener('playing', function() {
                    status.innerText = '▶️ Đang phát';
                });
                video.addEventListener('waiting', function() {
                    status.innerText = '⏳ Buffering...';
                });
                video.addEventListener('error', function() {
                    status.innerText = '❌ Lỗi phát video';
                });
                
            } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
                // Native HLS (Safari)
                video.src = url;
                status.innerText = '▶️ Native HLS (Safari)';
            }
        }
        
        if (url.includes('.m3u8') || url.includes('m3u8')) {
            loadHls();
        } else {
            video.src = url;
            status.innerText = '▶️ Playing';
            video.addEventListener('playing', function() { status.innerText = '▶️ Đang phát'; });
            video.addEventListener('error', function() { status.innerText = '❌ Không thể phát video này'; });
        }
        
        // ESC to close
        var escHandler = function(e) {
            if (e.key === 'Escape') {
                video.pause(); video.src = '';
                if (currentHls) currentHls.destroy();
                overlay.remove();
                document.removeEventListener('keydown', escHandler);
            }
        };
        document.addEventListener('keydown', escHandler);
    }
    
    // ========== COMMAND PICKER ==========
    function showCommandPicker(url, type) {
        var t = getTheme();
        var cmds = makeCommands(url, type, pageInfo.title);
        var overlay = document.createElement('div');
        overlay.className = '__uvd_overlay__';
        
        var html = '<div class="__uvd_overlay-box__"><div class="__uvd_overlay_title__">⚙️ Chọn lệnh tải</div>';
        
        Object.keys(cmds).forEach(function(key) {
            var c = cmds[key];
            html += 
                '<div class="__uvd_cmd_card__">' +
                    '<div class="__uvd_cmd_label__">' + c.label + '</div>' +
                    '<div class="__uvd_cmd_code__">' + escapeHtml(c.cmd) + '</div>' +
                    '<button class="__uvd_btn_primary__ __uvd_cmd_pick__" data-cmd="' + encodeURIComponent(c.cmd) + '" data-label="' + encodeURIComponent(c.label) + '" style="width:100%;">📋 Chọn & sửa</button>' +
                '</div>';
        });
        
        html += '<div class="btn-row"><button class="__uvd_btn_danger__" id="__uvd_cp_close__">✕ Đóng</button></div></div>';
        
        overlay.innerHTML = html;
        document.body.appendChild(overlay);
        
        overlay.onclick = function(e) {
            if (e.target === overlay) overlay.remove();
        };
        
        overlay.querySelectorAll('.__uvd_cmd_pick__').forEach(function(b) {
            b.onclick = function() {
                var cmd = decodeURIComponent(this.dataset.cmd);
                var label = decodeURIComponent(this.dataset.label);
                overlay.remove();
                showEditor(cmd, label);
            };
        });
        
        document.getElementById('__uvd_cp_close__').onclick = function() { overlay.remove(); };
    }
    
    // ========== EDITOR ==========
    function showEditor(text, title) {
        var t = getTheme();
        var overlay = document.createElement('div');
        overlay.className = '__uvd_overlay__';
        overlay.innerHTML = 
            '<div class="__uvd_overlay-box__">' +
                '<div class="__uvd_overlay_title__">✏️ ' + escapeHtml(title) + '</div>' +
                '<div style="color:' + t.text3 + ';font-size:11px;margin-bottom:10px;">Sửa lệnh trước khi copy</div>' +
                '<textarea class="__uvd_textarea__" id="__uvd_edit__">' + escapeHtml(text) + '</textarea>' +
                '<div class="btn-row">' +
                    '<button class="__uvd_btn_primary__" id="__uvd_ed_ok__">✓ Copy</button>' +
                    '<button class="__uvd_btn_primary__" id="__uvd_ed_share__" style="background:linear-gradient(135deg,#FF6B6B,#FF4757);">📱 Share</button>' +
                    '<button class="__uvd_btn_ghost__" id="__uvd_ed_no__">✕ Hủy</button>' +
                '</div>' +
            '</div>';
        document.body.appendChild(overlay);
        
        overlay.onclick = function(e) {
            if (e.target === overlay) overlay.remove();
        };
        
        var textarea = document.getElementById('__uvd_edit__');
        textarea.focus();
        textarea.select();
        
        document.getElementById('__uvd_ed_ok__').onclick = function() {
            copy(textarea.value);
            overlay.remove();
            toast('✓ Đã copy!', 'success');
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
            container.innerHTML = 
                '<div class="__uvd_empty__">' +
                    '<div class="__uvd_empty_icon__">⭐</div>' +
                    '<div class="__uvd_empty_text__">Chưa có favorites</div>' +
                    '<div class="__uvd_empty_sub__">Bấm ☆ trên stream để thêm</div>' +
                '</div>';
            return;
        }
        
        data.favorites.forEach(function(fav, i) {
            var card = document.createElement('div');
            card.className = '__uvd_fav_card__';
            card.innerHTML = 
                '<div class="__uvd_fav_header__">' +
                    '<span class="__uvd_fav_title__">⭐ ' + fav.type + '</span>' +
                    '<span class="__uvd_fav_date__">' + new Date(fav.timestamp).toLocaleDateString() + '</span>' +
                '</div>' +
                '<div style="color:' + t.text + ';font-size:12px;margin-bottom:4px;">' + escapeHtml(fav.title) + '</div>' +
                '<div style="color:' + t.text3 + ';font-size:10px;margin-bottom:6px;">🌐 ' + fav.host + '</div>' +
                '<div class="__uvd_url_box__">' + escapeHtml(fav.url) + '</div>' +
                '<div class="__uvd_actions__">' +
                    '<button class="__uvd_act_btn__ __uvd_btn_share__" data-url="' + encodeURIComponent(fav.url) + '" data-action="share">📱 YTDLnis</button>' +
                    '<button class="__uvd_act_btn__ __uvd_btn_copy__" data-url="' + encodeURIComponent(fav.url) + '" data-action="copy">📋 Copy</button>' +
                    '<button class="__uvd_act_btn__ __uvd_btn_cmd__" data-idx="' + i + '" data-action="del">🗑️ Xóa</button>' +
                '</div>';
            container.appendChild(card);
        });
        
        container.querySelectorAll('.__uvd_act_btn__').forEach(function(b) {
            b.onclick = function() {
                var action = this.dataset.action;
                if (action === 'del') {
                    data.favorites.splice(parseInt(this.dataset.idx), 1);
                    storage.set(data);
                    renderFavorites(container);
                    toast('🗑️ Đã xóa', 'info');
                } else {
                    var url = decodeURIComponent(this.dataset.url);
                    if (action === 'share') shareUrl(url);
                    else { copy(url); toast('✓ Copied', 'success'); }
                }
            };
        });
    }
    
    // ========== RENDER: HISTORY ==========
    function renderHistory(container) {
        var t = getTheme();
        var history = data.history || [];
        if (!history.length) {
            container.innerHTML = 
                '<div class="__uvd_empty__">' +
                    '<div class="__uvd_empty_icon__">📜</div>' +
                    '<div class="__uvd_empty_text__">Chưa có history</div>' +
                '</div>';
            return;
        }
        
        var clearBtn = document.createElement('button');
        clearBtn.className = '__uvd_btn_danger__';
        clearBtn.innerText = '🗑️ Xóa tất cả history';
        clearBtn.style.cssText = 'width:100%;margin-bottom:12px;';
        clearBtn.onclick = function() {
            if (confirm('Xóa toàn bộ history?')) {
                data.history = [];
                storage.set(data);
                renderHistory(container);
                toast('🗑️ Đã xóa history', 'info');
            }
        };
        container.appendChild(clearBtn);
        
        history.forEach(function(h) {
            var item = document.createElement('div');
            item.className = '__uvd_history_item__';
            item.innerHTML = 
                '<div class="__uvd_history_info__">' +
                    '<div class="__uvd_history_title__">' + escapeHtml(h.title) + '</div>' +
                    '<div class="__uvd_history_meta__">' + h.type + ' · ' + h.host + ' · ' + new Date(h.timestamp).toLocaleString() + '</div>' +
                    '<div class="__uvd_history_url__">' + escapeHtml(h.url) + '</div>' +
                '</div>';
            container.appendChild(item);
        });
    }
    
    // ========== RENDER: SETTINGS ==========
    function renderSettings(container) {
        var t = getTheme();
        var html = '';
        
        // Theme
        html += '<div class="__uvd_settings_section__">';
        html += '<div class="__uvd_settings_title__">🎨 Theme</div>';
        html += '<div class="__uvd_theme_grid__">';
        Object.keys(themes).forEach(function(key) {
            var active = data.theme === key;
            html += '<button class="__uvd_theme_btn__' + (active ? ' active' : '') + '" data-theme="' + key + '">' + themes[key].name + '</button>';
        });
        html += '</div></div>';
        
        // Site profiles
        html += '<div class="__uvd_settings_section__">';
        html += '<div class="__uvd_settings_title__">🌐 Site Profiles (' + Object.keys(data.siteProfiles).length + ')</div>';
        var profiles = Object.keys(data.siteProfiles);
        if (!profiles.length) {
            html += '<div style="color:' + t.text3 + ';font-size:11px;">Chưa có profile. Bấm vào Referer để lưu.</div>';
        } else {
            profiles.forEach(function(p) {
                html += 
                    '<div class="__uvd_profile_card__">' +
                        '<div class="__uvd_profile_host__">' + p + '</div>' +
                        '<div class="__uvd_profile_ref__">' + escapeHtml(data.siteProfiles[p].referer) + '</div>' +
                        '<button class="__uvd_btn_danger__ __uvd_delprofile__" data-host="' + p + '" style="padding:4px 10px;font-size:10px;margin-top:6px;">🗑️ Xóa</button>' +
                    '</div>';
            });
        }
        html += '</div>';
        
        // Backup
        html += '<div class="__uvd_settings_section__">';
        html += '<div class="__uvd_settings_title__">💾 Backup & Restore</div>';
        html += '<div style="display:flex;gap:8px;flex-wrap:wrap;">';
        html += '<button class="__uvd_btn_primary__" id="__uvd_backup__" style="flex:1;">📤 Export</button>';
        html += '<button class="__uvd_btn_primary__" id="__uvd_restore__" style="flex:1;background:linear-gradient(135deg,' + t.accent + ',' + t.primary + ');">📥 Import</button>';
        html += '<button class="__uvd_btn_danger__" id="__uvd_reset__" style="flex:1;">🔥 Reset</button>';
        html += '</div></div>';
        
        // Info
        html += '<div class="__uvd_settings_section__">';
        html += '<div class="__uvd_settings_title__">ℹ️ Thông tin</div>';
        html += '<div style="color:' + t.text2 + ';font-size:11px;line-height:1.8;">';
        html += '<div>📦 Version: 3.0 — Glass UI Edition</div>';
        html += '<div>👤 Author: nguyenquocngu93</div>';
        html += '<div>💾 Favorites: ' + data.favorites.length + '</div>';
        html += '<div>📜 History: ' + (data.history || []).length + '</div>';
        html += '<div>🌐 Site profiles: ' + Object.keys(data.siteProfiles).length + '</div>';
        html += '<div>🎯 Total streams: ' + urls.size + '</div>';
        html += '</div></div>';
        
        container.innerHTML = html;
        
        // Bind theme
        container.querySelectorAll('.__uvd_theme_btn__').forEach(function(b) {
            b.onclick = function() {
                data.theme = this.dataset.theme;
                storage.set(data);
                buildUI();
                toast('🎨 Theme: ' + themes[data.theme].name, 'success');
            };
        });
        
        // Delete profile
        container.querySelectorAll('.__uvd_delprofile__').forEach(function(b) {
            b.onclick = function() {
                delete data.siteProfiles[this.dataset.host];
                storage.set(data);
                renderSettings(container);
                toast('🗑️ Đã xóa profile', 'info');
            };
        });
        
        // Backup
        document.getElementById('__uvd_backup__').onclick = function() {
            var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            var a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = 'uvd_backup_' + Date.now() + '.json';
            a.click();
            toast('📤 Đã export backup', 'success');
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
                        toast('✓ Đã import', 'success');
                        buildUI();
                    } catch(err) {
                        toast('❌ File không hợp lệ', 'error');
                    }
                };
                reader.readAsText(e.target.files[0]);
            };
            input.click();
        };
        
        // Reset
        document.getElementById('__uvd_reset__').onclick = function() {
            if (confirm('XÓA TOÀN BỘ favorites, history, settings?')) {
                localStorage.removeItem(STORAGE_KEY);
                data = { favorites: [], theme: 'glass-dark', siteProfiles: {}, history: [], settings: {} };
                toast('🔥 Đã reset', 'info');
                buildUI();
            }
        };
    }
    
    // ========== AUTO REFRESH ==========
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
                // Update counts in header
                var videoCount = [...urls.values()].filter(function(u) { return u.category === 'video'; }).length;
                var photoCount = [...urls.values()].filter(function(u) { return u.category === 'photo'; }).length;
                var scriptCount = [...urls.values()].filter(function(u) { return u.category === 'script'; }).length;
                
                var vc = document.querySelector('.__uvd_count_video__');
                var pc = document.querySelector('.__uvd_count_photo__');
                var sc = document.querySelector('.__uvd_count_script__');
                if (vc) vc.innerText = videoCount;
                if (pc) pc.innerText = photoCount;
                if (sc) sc.innerText = scriptCount;
                
                // Update tab badges
                var tabs = document.querySelectorAll('.__uvd_tab__');
                tabs.forEach(function(tab) {
                    var badge = tab.querySelector('.__uvd_badge__');
                    if (!badge) return;
                    if (tab.dataset.tab === 'video') badge.innerText = videoCount;
                    else if (tab.dataset.tab === 'photo') badge.innerText = photoCount;
                    else if (tab.dataset.tab === 'script') badge.innerText = scriptCount;
                    else if (tab.dataset.tab === 'favorites') badge.innerText = data.favorites.length;
                    else if (tab.dataset.tab === 'history') badge.innerText = (data.history || []).length;
                });
                
                // Re-render current tab if user is viewing it
                renderTab(currentTab);
            }
        }, 2000);
    }
    
    // ========== START ==========
    buildUI();
    startAutoRefresh();
    
    console.log('✅ Universal DL V3 loaded! Found', urls.size, 'streams initially');
    toast('✅ V3 Glass UI Ready!', 'success');
})();