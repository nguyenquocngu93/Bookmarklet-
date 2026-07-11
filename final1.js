// ==UserScript==
// @name         Universal Video Downloader V5.1 - Dark Liquid Edition
// @namespace    http://tampermonkey.net/
// @version      5.1
// @description  Phát hiện & tải video từ mọi trang web, mở video bằng trình phát gốc Chrome
// @author       nguyenquocngu91
// @match        *://*/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // ========== INIT ==========
    var old = document.getElementById('__uvd__');
    if (old) old.remove();
    var minBtn = document.getElementById('__uvd_min_float__');
    if (minBtn) minBtn.remove();

    var STORAGE_KEY = 'uvd_data_v50';
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
                qualities.sort(function(a, b) {
                    return (parseInt(b.resolution.split('x')[1]) || 0) - (parseInt(a.resolution.split('x')[1]) || 0);
                });
                callback(qualities);
            }).catch(function(e) { console.error(e); callback(null); });
    }

    // ========== COMMANDS ==========
    function makeCommands(url, type, title) {
        var t = title || pageInfo.title;
        var ext = type.toLowerCase() == 'iframe' ? 'mp4' : type.toLowerCase();
        var ref = pageInfo.referer;
        var origin = pageInfo.origin;
        var ua = pageInfo.userAgent;
        return {
            'yt-dlp': {
                label: 'yt-dlp (cơ bản)',
                cmd: 'yt-dlp --referer "' + ref + '" -o "' + t + '.%(ext)s" "' + url + '"'
            },
            'yt-dlp-bypass': {
                label: 'yt-dlp (bypass)',
                cmd: 'yt-dlp --force-ipv4 --no-check-certificate --user-agent "' + ua + '" --referer "' + ref + '" --add-header "Origin: ' + origin + '" -f "bv*+ba/best" --merge-output-format mp4 -o "' + t + '.%(ext)s" "' + url + '"'
            },
            'yt-dlp-aria': {
                label: 'yt-dlp + aria2',
                cmd: 'yt-dlp --referer "' + ref + '" --downloader aria2c -o "' + t + '.%(ext)s" "' + url + '"'
            },
            'ffmpeg': {
                label: 'FFmpeg',
                cmd: 'ffmpeg -headers "Referer: ' + ref + '\r\nOrigin: ' + origin + '" -i "' + url + '" -c copy "' + t + '.mp4"'
            },
            'curl': {
                label: 'cURL',
                cmd: 'curl -H "Referer: ' + ref + '" -o "' + t + '.' + ext + '" "' + url + '"'
            }
        };
    }

    // ========== UTILS ==========
    function copy(text) {
        var ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
    }

    function toast(msg, color) {
        var el = document.createElement('div');
        el.textContent = msg;
        el.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);background:' + (color || '#3b82f6') + ';color:#fff;padding:12px 24px;border-radius:30px;z-index:2147483649;font:600 13px Segoe UI;box-shadow:0 4px 15px rgba(0,0,0,0.4);animation:uvdSlideIn 0.3s ease;';
        document.body.appendChild(el);
        setTimeout(function() { el.remove(); }, 2500);
    }

    function shareUrl(url) {
        if (navigator.share) navigator.share({ title: pageInfo.title, url: url }).catch(function() { copy(url); toast('Đã sao chép'); });
        else { copy(url); toast('Đã sao chép - Mở YTDLnis'); }
    }

    function addToHistory(url, type) {
        data.history = data.history || [];
        data.history.unshift({ url, type, title: pageInfo.title, host: pageInfo.host, timestamp: Date.now() });
        if (data.history.length > 50) data.history = data.history.slice(0, 50);
        storage.set(data);
    }

    function isFavorite(url) {
        return data.favorites.some(function(f) { return f.url === url; });
    }

    function toggleFavorite(url, type) {
        var idx = data.favorites.findIndex(function(f) { return f.url === url; });
        if (idx >= 0) { data.favorites.splice(idx, 1); toast('Đã xóa khỏi yêu thích'); }
        else { data.favorites.unshift({ url, type, title: pageInfo.title, host: pageInfo.host, timestamp: Date.now() }); toast('Đã thêm vào yêu thích'); }
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
        toast('Đã xuất ' + format.toUpperCase());
    }

    // ========== RIPPLE EFFECT ==========
    function addRipple(e) {
        var btn = e.currentTarget;
        var ripple = document.createElement('span');
        ripple.className = 'uvd-ripple';
        var rect = btn.getBoundingClientRect();
        var size = Math.max(rect.width, rect.height);
        ripple.style.width = ripple.style.height = size + 'px';
        ripple.style.left = (e.clientX - rect.left - size/2) + 'px';
        ripple.style.top = (e.clientY - rect.top - size/2) + 'px';
        btn.appendChild(ripple);
        ripple.addEventListener('animationend', function() { ripple.remove(); });
    }

    // ========== BUILD UI ==========
    if (document.getElementById('__uvd_css__')) document.getElementById('__uvd_css__').remove();
    var style = document.createElement('style');
    style.id = '__uvd_css__';
    style.textContent = `
        @keyframes uvdSlideIn{from{transform:translate(-50%,-20px);opacity:0}to{transform:translate(-50%,0);opacity:1}}
        @keyframes uvdPulse{0%,100%{opacity:1;box-shadow:0 0 5px var(--accent)}50%{opacity:0.4;box-shadow:0 0 20px var(--accent)}}
        @keyframes uvdFadeIn{from{opacity:0}to{opacity:1}}
        @keyframes uvdScaleIn{from{opacity:0;transform:scale(0.94)}to{opacity:1;transform:scale(1)}}
        @keyframes uvdSlideUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}
        @keyframes uvdRipple{to{transform:scale(4);opacity:0}}
        @keyframes uvdCardEnter{from{opacity:0;transform:translateY(15px)}to{opacity:1;transform:translateY(0)}}
        @keyframes uvdFloatBtnIn{from{transform:scale(0);opacity:0}to{transform:scale(1);opacity:1}}
        @keyframes uvdLiquidDrift{0%{transform:translate(-6%,-4%) scale(1)}50%{transform:translate(4%,6%) scale(1.12)}100%{transform:translate(-6%,-4%) scale(1)}}
        @keyframes uvdShimmer{0%{background-position:-200% 0}100%{background-position:200% 0}}
        @keyframes uvdBadgePop{from{opacity:0;transform:translateY(-4px) scale(0.9)}to{opacity:1;transform:translateY(0) scale(1)}}
        :root{
            --bg:rgba(3,4,8,0.97);
            --glass:rgba(12,14,20,0.85);
            --glass-hi:rgba(255,255,255,0.06);
            --border:rgba(255,255,255,0.08);
            --text:#f3f5ff;
            --text2:#9ca3bd;
            --text3:#5d6377;
            --accent:#6d8cff;
            --accent2:#b98bff;
            --danger:#ff5d72;
            --gold:#ffb84d;
            --card-bg:rgba(255,255,255,0.03);
            --fs-xs:11px;
            --fs-sm:12px;
            --fs-base:13px;
            --fs-md:14px;
            --fs-lg:16px;
            --radius-sm:12px;
            --radius-md:16px;
            --radius-lg:26px;
            --grad-liquid:linear-gradient(135deg,var(--accent),var(--accent2));
        }
        *{box-sizing:border-box}
        .uvd-overlay{position:fixed;inset:0;background:rgba(2,3,6,0.92);backdrop-filter:blur(18px) saturate(120%);z-index:2147483648;display:flex;align-items:center;justify-content:center;padding:16px;overflow-y:auto}
        .uvd-glass-panel{background:var(--glass);backdrop-filter:blur(28px) saturate(130%);-webkit-backdrop-filter:blur(28px) saturate(130%);border:1px solid var(--border);border-radius:var(--radius-lg);box-shadow:0 20px 50px rgba(0,0,0,0.8),0 0 0 1px rgba(255,255,255,0.03) inset,0 1px 0 rgba(255,255,255,0.08) inset;color:var(--text);font-family:-apple-system,BlinkMacSystemFont,'SF Pro Display','Segoe UI',Roboto,sans-serif;font-size:var(--fs-base);padding:16px;width:100%;position:relative;overflow:hidden}
        .uvd-glass-panel::before{content:'';position:absolute;top:0;left:8%;right:8%;height:1px;z-index:2;background:linear-gradient(90deg,transparent,rgba(109,140,255,0.6),rgba(185,139,255,0.6),transparent);opacity:0.7}
        .uvd-liquid-bg{position:absolute;inset:-30%;z-index:0;pointer-events:none;background:radial-gradient(closest-side,rgba(109,140,255,0.12),transparent 70%) 15% 20%/55% 55% no-repeat,radial-gradient(closest-side,rgba(185,139,255,0.10),transparent 70%) 85% 75%/60% 60% no-repeat;filter:blur(50px);animation:uvdLiquidDrift 16s ease-in-out infinite}
        @media (prefers-reduced-motion:reduce){.uvd-liquid-bg{animation:none}}
        .uvd-panel-content{position:relative;z-index:1;display:flex;flex-direction:column;height:100%;min-height:0}
        .uvd-scroll::-webkit-scrollbar{width:4px}
        .uvd-scroll::-webkit-scrollbar-thumb{background:var(--accent);border-radius:4px}
        .uvd-scroll::-webkit-scrollbar-track{background:transparent}
        .uvd-btn{background:var(--glass-hi);border:1px solid var(--border);color:var(--text);padding:9px 16px;border-radius:var(--radius-md);font-weight:600;font-size:var(--fs-base);cursor:pointer;transition:all 0.2s;backdrop-filter:blur(10px);text-align:center;position:relative;overflow:hidden;display:inline-block;box-shadow:0 3px 10px rgba(0,0,0,0.4),0 1px 0 rgba(255,255,255,0.08) inset;line-height:1.3}
        .uvd-btn:hover{background:rgba(255,255,255,0.10);border-color:rgba(255,255,255,0.20);transform:translateY(-1px);box-shadow:0 5px 14px rgba(0,0,0,0.5),0 1px 0 rgba(255,255,255,0.12) inset}
        .uvd-btn:active{transform:scale(0.96)}
        .uvd-btn-sm{padding:7px 12px;font-size:var(--fs-sm);border-radius:var(--radius-sm)}
        .uvd-btn-primary{background:var(--grad-liquid);border-color:transparent;color:#fff;box-shadow:0 5px 16px rgba(109,140,255,0.4),0 1px 0 rgba(255,255,255,0.25) inset}
        .uvd-btn-primary:hover{filter:brightness(1.08);box-shadow:0 7px 20px rgba(109,140,255,0.5)}
        .uvd-btn-icon{background:var(--glass-hi);border:1px solid var(--border);color:var(--text);width:34px;height:34px;border-radius:var(--radius-sm);cursor:pointer;display:inline-flex;align-items:center;justify-content:center;transition:all 0.2s;backdrop-filter:blur(10px);position:relative;overflow:hidden;box-shadow:0 3px 8px rgba(0,0,0,0.35),0 1px 0 rgba(255,255,255,0.08) inset}
        .uvd-btn-icon:hover{background:rgba(255,255,255,0.10);border-color:rgba(255,255,255,0.20)}
        .uvd-btn-icon:active{transform:scale(0.92)}
        .uvd-card{background:var(--card-bg);border:1px solid var(--border);border-radius:var(--radius-md);padding:14px;margin-bottom:10px;font-size:var(--fs-base);backdrop-filter:blur(6px);box-shadow:0 1px 0 rgba(255,255,255,0.04) inset;transition:transform 0.3s cubic-bezier(.4,0,.2,1),box-shadow 0.3s ease,background 0.3s ease,border-color 0.3s ease;animation:uvdCardEnter 0.4s ease both}
        .uvd-card:nth-child(odd){animation-delay:0.05s}
        .uvd-card:nth-child(even){animation-delay:0.1s}
        .uvd-card:hover{transform:translateY(-3px);box-shadow:0 14px 30px rgba(0,0,0,0.7),0 0 0 1px rgba(109,140,255,0.30) inset,0 0 24px rgba(109,140,255,0.08);background:rgba(255,255,255,0.05);border-color:rgba(109,140,255,0.25)}
        .uvd-type-badge{display:inline-block;padding:4px 12px;border-radius:var(--radius-sm);font-size:var(--fs-xs);font-weight:700;background:linear-gradient(135deg,rgba(109,140,255,0.22),rgba(185,139,255,0.18));color:var(--accent);border:1px solid rgba(109,140,255,0.28);letter-spacing:0.03em;box-shadow:0 1px 0 rgba(255,255,255,0.06) inset}
        .uvd-url-box{background:rgba(0,0,0,0.5);border-radius:var(--radius-sm);padding:12px;font-family:'SFMono-Regular',Consolas,monospace;font-size:var(--fs-sm);word-break:break-all;color:var(--text2);max-height:100px;overflow-y:auto;line-height:1.5;border:1px solid rgba(255,255,255,0.04)}
        .uvd-grid-2{display:grid;grid-template-columns:1fr 1fr;gap:8px}
        .uvd-grid-3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px}
        .uvd-tabbar{position:relative;display:flex;gap:2px;padding:4px;background:rgba(255,255,255,0.04);border:1px solid var(--border);border-radius:999px;margin-bottom:10px}
        .uvd-tab-indicator{position:absolute;top:4px;bottom:4px;left:4px;width:0;border-radius:999px;background:var(--grad-liquid);z-index:0;box-shadow:0 3px 12px rgba(109,140,255,0.45);transition:transform 0.4s cubic-bezier(.4,0,.2,1),width 0.4s cubic-bezier(.4,0,.2,1)}
        .uvd-tab{position:relative;z-index:1;flex:1;min-width:0;background:transparent;border:none;color:var(--text2);font-weight:600;font-size:var(--fs-sm);padding:9px 6px;border-radius:999px;cursor:pointer;transition:color 0.25s;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .uvd-tab.uvd-tab-active{color:#fff;text-shadow:0 1px 4px rgba(0,0,0,0.3)}
        #__uvd_min_float__{position:fixed;bottom:20px;right:20px;width:54px;height:54px;border-radius:50%;background:var(--grad-liquid);color:#fff;border:1px solid rgba(255,255,255,0.25);box-shadow:0 8px 22px rgba(0,0,0,0.6),0 0 20px rgba(109,140,255,0.35);z-index:2147483647;cursor:pointer;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:var(--fs-lg);transition:transform 0.3s;animation:uvdFloatBtnIn 0.3s ease;backdrop-filter:blur(10px)}
        #__uvd_min_float__:hover{transform:scale(1.1)}
        .uvd-ripple{position:absolute;border-radius:50%;background:rgba(255,255,255,0.5);transform:scale(0);animation:uvdRipple 0.6s ease-out}
        .uvd-settings-cv{background:var(--card-bg);border-radius:var(--radius-md);padding:20px;border:1px solid var(--border);margin-bottom:12px}
        .uvd-settings-cv h3{color:var(--accent);font-size:var(--fs-md);margin:0 0 8px 0;display:flex;align-items:center;gap:8px}
        .uvd-settings-cv p{color:var(--text2);font-size:var(--fs-sm);line-height:1.6;margin:4px 0}
        .uvd-settings-cv .badge-cv{display:inline-block;background:var(--grad-liquid);color:#fff;padding:2px 12px;border-radius:20px;font-size:10px;font-weight:700;margin-right:4px}
        .uvd-settings-cv .key-cv{display:inline-block;background:rgba(0,0,0,0.4);padding:1px 10px;border-radius:6px;font-family:monospace;font-size:var(--fs-xs);color:var(--accent2);border:1px solid var(--border)}
        .uvd-footer-cv{text-align:center;padding:16px 0 4px 0;border-top:1px solid var(--border);margin-top:8px;color:var(--text3);font-size:var(--fs-xs)}
        .uvd-footer-cv strong{color:var(--accent2)}
        .uvd-profile-avatar{width:72px;height:72px;border-radius:50%;background:var(--grad-liquid);display:flex;align-items:center;justify-content:center;font-size:28px;font-weight:700;color:#fff;flex-shrink:0;box-shadow:0 4px 14px rgba(109,140,255,0.3)}
        .uvd-profile-info{display:flex;flex-direction:column;gap:4px}
        .uvd-profile-info .label{color:var(--text3);font-size:var(--fs-xs)}
        .uvd-profile-info .value{color:var(--text);font-weight:500}
        .uvd-minimizing{transition:all 0.4s cubic-bezier(.4,0,.2,1);transform:scale(0.8)!important;opacity:0!important;pointer-events:none}
    `;
    document.head.appendChild(style);

    function buildUI() {
        var arr = [...urls.entries()].map(function(e) {
            return { url: e[0], type: e[1].type, source: e[1].source, priority: e[1].priority };
        }).sort(function(a, b) { return a.priority - b.priority; });

        var panel = document.getElementById('__uvd__');
        if (panel) panel.remove();
        panel = document.createElement('div');
        panel.id = '__uvd__';
        panel.className = 'uvd-glass-panel';
        panel.style.cssText = 'position:fixed;inset:0;z-index:2147483647;animation:uvdScaleIn 0.4s ease;';

        var liquidBg = document.createElement('div');
        liquidBg.className = 'uvd-liquid-bg';
        panel.appendChild(liquidBg);

        var content = document.createElement('div');
        content.className = 'uvd-panel-content';
        panel.appendChild(content);

        // Header
        var header = document.createElement('div');
        header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding-bottom:12px;border-bottom:1px solid var(--border);margin-bottom:10px;';
        header.innerHTML =
            '<div style="display:flex;align-items:center;gap:8px;">' +
            '<span style="font-weight:700;font-size:16px;letter-spacing:-0.01em;">Universal DL <span style="background:var(--grad-liquid);-webkit-background-clip:text;background-clip:text;color:transparent;">V5.1</span></span>' +
            '</div>' +
            '<div style="display:flex;gap:6px;">' +
            '<button class="uvd-btn-icon uvd-ripple-btn" id="_uvd_minimize_" title="Thu nhỏ">−</button>' +
            '<button class="uvd-btn-icon uvd-ripple-btn" id="_uvd_refresh_" title="Làm mới">↻</button>' +
            '<button class="uvd-btn-icon uvd-ripple-btn" id="_uvd_close_" title="Đóng">✕</button>' +
            '</div>';
        content.appendChild(header);

        // Tabs
        var tabbar = document.createElement('div');
        tabbar.className = 'uvd-tabbar';
        var indicator = document.createElement('div');
        indicator.className = 'uvd-tab-indicator';
        indicator.id = '_uvd_tab_indicator_';
        tabbar.appendChild(indicator);

        var tabList = [
            { id: 'streams', text: 'Streams (' + arr.length + ')' },
            { id: 'favorites', text: 'Yêu thích (' + data.favorites.length + ')' },
            { id: 'history', text: 'Lịch sử (' + (data.history || []).length + ')' },
            { id: 'settings', text: 'Cài đặt' }
        ];

        tabList.forEach(function(t) {
            var b = document.createElement('button');
            b.className = 'uvd-tab';
            b.dataset.tab = t.id;
            b.textContent = t.text;
            tabbar.appendChild(b);
        });
        content.appendChild(tabbar);

        function moveIndicatorTo(btn) {
            if (!btn) return;
            indicator.style.width = btn.offsetWidth + 'px';
            indicator.style.transform = 'translateX(' + btn.offsetLeft + 'px)';
        }

        // Info
        var info = document.createElement('div');
        info.style.cssText = 'margin-bottom:10px;font-size:12px;';
        info.innerHTML =
            '<span style="color:var(--text2);">Tên: </span>' +
            '<span id="__uvd_title__" style="color:var(--accent);text-decoration:underline;cursor:pointer;">' + pageInfo.title + '</span> ' +
            '<span style="color:var(--text3);">(sửa)</span><br>' +
            '<span style="color:var(--text2);">Referer: </span>' +
            '<span id="__uvd_referer__" style="color:var(--accent2);font-family:monospace;text-decoration:underline;cursor:pointer;font-size:11px;">' + pageInfo.referer + '</span>';
        content.appendChild(info);

        // Content area
        var contentWrapper = document.createElement('div');
        contentWrapper.className = 'uvd-scroll';
        contentWrapper.style.cssText = 'flex:1;overflow:hidden;position:relative;min-height:0;';

        var streamList = document.createElement('div');
        streamList.id = '__uvd_stream_list__';
        streamList.className = 'uvd-scroll';
        streamList.style.cssText = 'overflow-y:auto;height:100%;padding-right:4px;';
        contentWrapper.appendChild(streamList);

        content.appendChild(contentWrapper);

        // Footer
        var footer = document.createElement('div');
        footer.style.cssText = 'display:flex;gap:6px;margin-top:10px;flex-wrap:wrap;';
        ['TXT', 'JSON', 'M3U', 'CSV'].forEach(function(f) {
            var btn = document.createElement('button');
            btn.className = 'uvd-btn uvd-btn-sm uvd-ripple-btn';
            btn.textContent = f;
            btn.style.flex = '1 0 auto';
            btn.onclick = function() { exportData(f.toLowerCase()); };
            footer.appendChild(btn);
        });
        content.appendChild(footer);

        document.body.appendChild(panel);

        // Ripple
        document.querySelectorAll('.uvd-ripple-btn, .uvd-btn, .uvd-btn-icon, .uvd-tab').forEach(function(btn) {
            btn.addEventListener('click', addRipple);
        });

        var currentTab = 'streams';

        function renderTab(tabId) {
            currentTab = tabId;
            document.querySelectorAll('[data-tab]').forEach(function(t) {
                if (t.dataset.tab === tabId) {
                    t.classList.add('uvd-tab-active');
                    moveIndicatorTo(t);
                } else {
                    t.classList.remove('uvd-tab-active');
                }
            });

            streamList.style.display = 'block';
            streamList.innerHTML = '';

            if (tabId === 'streams') renderStreams(streamList, arr);
            else if (tabId === 'favorites') renderFavorites(streamList);
            else if (tabId === 'history') renderHistory(streamList);
            else if (tabId === 'settings') renderSettings(streamList);
        }

        document.querySelectorAll('[data-tab]').forEach(function(t) {
            t.onclick = function() { renderTab(this.dataset.tab); };
        });

        renderTab('streams');

        window.addEventListener('resize', function() {
            moveIndicatorTo(document.querySelector('.uvd-tab.uvd-tab-active'));
        });

        document.getElementById('_uvd_close_').onclick = function() {
            stopMonitor();
            panel.remove();
        };

        document.getElementById('_uvd_refresh_').onclick = function() {
            buildUI();
            toast('Đã làm mới');
        };

        document.getElementById('__uvd_title__').onclick = function() {
            var newTitle = prompt('Tên file:', pageInfo.title);
            if (newTitle) {
                pageInfo.title = newTitle.replace(/[^\w\s\u00C0-\u1EF9-]/g, '').substring(0, 100);
                this.textContent = pageInfo.title;
            }
        };

        document.getElementById('__uvd_referer__').onclick = function() {
            var newRef = prompt('Referer:', pageInfo.referer);
            if (newRef) {
                pageInfo.referer = newRef;
                this.textContent = newRef;
                data.siteProfiles[pageInfo.host] = { referer: newRef, userAgent: pageInfo.userAgent };
                storage.set(data);
                toast('Đã lưu referer cho ' + pageInfo.host);
            }
        };

        // Minimize with animation
        document.getElementById('_uvd_minimize_').onclick = function() {
            panel.classList.add('uvd-minimizing');
            setTimeout(function() {
                panel.style.display = 'none';
                panel.classList.remove('uvd-minimizing');
                var floatBtn = document.getElementById('__uvd_min_float__');
                if (!floatBtn) {
                    floatBtn = document.createElement('button');
                    floatBtn.id = '__uvd_min_float__';
                    floatBtn.textContent = '▶';
                    floatBtn.title = 'Khôi phục Universal DL';
                    floatBtn.onclick = function() {
                        panel.style.display = 'flex';
                        floatBtn.remove();
                    };
                    document.body.appendChild(floatBtn);
                }
            }, 400);
        };
    }

    // ========== RENDER STREAMS ==========
    function renderStreams(container, arr) {
        if (!arr.length) {
            container.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text2);">Không phát hiện stream nào.</div>';
            return;
        }

        arr.forEach(function(item, i) {
            var card = document.createElement('div');
            card.className = 'uvd-card';
            var fav = isFavorite(item.url);

            card.innerHTML =
                '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">' +
                '<span class="uvd-type-badge">#' + (i+1) + ' ' + item.type + '</span>' +
                '<button class="uvd-fav-btn uvd-ripple-btn" data-url="' + encodeURIComponent(item.url) + '" data-type="' + item.type + '" style="background:none;border:none;font-size:18px;cursor:pointer;color:' + (fav ? 'var(--gold)' : 'var(--text3)') + ';">' + (fav ? '★' : '☆') + '</button>' +
                '</div>' +
                '<div class="uvd-url-box">' + item.url + '</div>' +
                '<div class="uvd-grid-2" style="margin-top:8px;">' +
                '<button class="uvd-btn uvd-btn-sm uvd-ripple-btn" data-action="share" data-url="' + encodeURIComponent(item.url) + '" style="background:rgba(139,92,246,0.2);">Chia sẻ</button>' +
                '<button class="uvd-btn uvd-btn-sm uvd-ripple-btn" data-action="copy" data-url="' + encodeURIComponent(item.url) + '">Sao chép</button>' +
                (item.type === 'IFRAME' ?
                    '<a href="' + item.url + '" class="uvd-btn uvd-btn-sm uvd-ripple-btn" style="text-align:center;grid-column:1/3;text-decoration:none;">Mở iframe</a>' :
                    (item.type === 'M3U8' ?
                        '<button class="uvd-btn uvd-btn-sm uvd-ripple-btn" data-action="quality" data-url="' + encodeURIComponent(item.url) + '">Chất lượng</button>' +
                        '<button class="uvd-btn uvd-btn-sm uvd-ripple-btn" data-action="preview" data-url="' + encodeURIComponent(item.url) + '" data-type="' + item.type + '">Xem trước</button>' +
                        '<button class="uvd-btn uvd-btn-sm uvd-ripple-btn" data-action="cmd" data-url="' + encodeURIComponent(item.url) + '" data-type="' + item.type + '" style="grid-column:1/3;">Lệnh tải</button>' :
                        '<button class="uvd-btn uvd-btn-sm uvd-ripple-btn" data-action="preview" data-url="' + encodeURIComponent(item.url) + '" data-type="' + item.type + '">Xem trước</button>' +
                        '<button class="uvd-btn uvd-btn-sm uvd-ripple-btn" data-action="cmd" data-url="' + encodeURIComponent(item.url) + '" data-type="' + item.type + '">Lệnh tải</button>'
                    )
                ) +
                '</div>';
            container.appendChild(card);
        });

        container.querySelectorAll('.uvd-btn, .uvd-fav-btn').forEach(function(b) {
            b.addEventListener('click', addRipple);
        });

        container.querySelectorAll('[data-action="share"]').forEach(function(b) {
            b.onclick = function() { shareUrl(decodeURIComponent(this.dataset.url)); };
        });

        container.querySelectorAll('[data-action="copy"]').forEach(function(b) {
            b.onclick = function() { copy(decodeURIComponent(this.dataset.url)); toast('Đã sao chép!'); };
        });

        container.querySelectorAll('[data-action="preview"]').forEach(function(b) {
            b.onclick = function() {
                var url = decodeURIComponent(this.dataset.url);
                window.open(url, '_blank');
            };
        });

        container.querySelectorAll('[data-action="cmd"]').forEach(function(b) {
            b.onclick = function() {
                var url = decodeURIComponent(this.dataset.url);
                var type = this.dataset.type;
                showCommandPicker(url, type);
            };
        });

        container.querySelectorAll('[data-action="quality"]').forEach(function(b) {
            b.onclick = function() {
                var url = decodeURIComponent(this.dataset.url);
                showQualityPicker(url);
            };
        });

        container.querySelectorAll('.uvd-fav-btn').forEach(function(b) {
            b.onclick = function() {
                var url = decodeURIComponent(this.dataset.url);
                var type = this.dataset.type;
                var nowFav = toggleFavorite(url, type);
                this.textContent = nowFav ? '★' : '☆';
                this.style.color = nowFav ? 'var(--gold)' : 'var(--text3)';
                var favTab = document.querySelector('[data-tab="favorites"]');
                if (favTab) {
                    var count = data.favorites.length;
                    favTab.textContent = 'Yêu thích (' + count + ')';
                }
            };
        });
    }

    // ========== RENDER FAVORITES ==========
    function renderFavorites(container) {
        if (!data.favorites.length) {
            container.innerHTML = '<div style="text-align:center;padding:30px;color:var(--text2);">Chưa có yêu thích.</div>';
            return;
        }
        data.favorites.forEach(function(f, i) {
            var card = document.createElement('div');
            card.className = 'uvd-card';
            card.innerHTML =
                '<div style="display:flex;justify-content:space-between;"><b style="color:var(--gold);">' + f.type + '</b><span style="font-size:11px;color:var(--text3);">' + new Date(f.timestamp).toLocaleDateString() + '</span></div>' +
                '<div style="margin:4px 0;">' + f.title + '</div>' +
                '<div class="uvd-url-box">' + f.url + '</div>' +
                '<div class="uvd-grid-3">' +
                '<button class="uvd-btn uvd-btn-sm fav-act" data-url="' + encodeURIComponent(f.url) + '" data-action="share" style="background:rgba(139,92,246,0.2);">Chia sẻ</button>' +
                '<button class="uvd-btn uvd-btn-sm fav-act" data-url="' + encodeURIComponent(f.url) + '" data-action="copy">Sao chép</button>' +
                '<button class="uvd-btn uvd-btn-sm fav-del" data-idx="' + i + '" style="background:var(--danger);">Xóa</button>' +
                '</div>';
            container.appendChild(card);
        });

        container.querySelectorAll('.uvd-btn').forEach(function(b) {
            b.addEventListener('click', addRipple);
        });

        container.querySelectorAll('.fav-act').forEach(function(b) {
            b.onclick = function() {
                var u = decodeURIComponent(this.dataset.url);
                if (this.dataset.action === 'share') shareUrl(u);
                else { copy(u); toast('Đã sao chép!'); }
            };
        });

        container.querySelectorAll('.fav-del').forEach(function(b) {
            b.onclick = function() {
                data.favorites.splice(parseInt(this.dataset.idx), 1);
                storage.set(data);
                renderFavorites(container);
                toast('Đã xóa');
                var favTab = document.querySelector('[data-tab="favorites"]');
                if (favTab) {
                    favTab.textContent = 'Yêu thích (' + data.favorites.length + ')';
                }
            };
        });
    }

    // ========== RENDER HISTORY ==========
    function renderHistory(container) {
        var hist = data.history || [];
        if (!hist.length) {
            container.innerHTML = '<div style="text-align:center;padding:30px;color:var(--text2);">Chưa có lịch sử.</div>';
            return;
        }
        container.innerHTML = '<button class="uvd-btn uvd-btn-sm" id="_uvd_clear_hist_" style="width:100%;margin-bottom:10px;background:var(--danger);">Xóa toàn bộ lịch sử</button>';
        document.getElementById('_uvd_clear_hist_').addEventListener('click', addRipple);
        document.getElementById('_uvd_clear_hist_').onclick = function() {
            if (confirm('Xóa toàn bộ lịch sử?')) {
                data.history = [];
                storage.set(data);
                renderHistory(container);
                var histTab = document.querySelector('[data-tab="history"]');
                if (histTab) {
                    histTab.textContent = 'Lịch sử (0)';
                }
            }
        };

        hist.forEach(function(h) {
            var card = document.createElement('div');
            card.className = 'uvd-card';
            card.innerHTML =
                '<div style="display:flex;justify-content:space-between;"><b style="color:var(--accent);">' + h.type + '</b><span style="font-size:11px;color:var(--text3);">' + new Date(h.timestamp).toLocaleString() + '</span></div>' +
                '<div>' + h.title + '</div>' +
                '<div class="uvd-url-box">' + h.url + '</div>';
            container.appendChild(card);
        });
    }

    // ========== RENDER SETTINGS (CV Style + Hướng dẫn cài đặt + Thông tin cá nhân) ==========
    function renderSettings(container) {
        container.innerHTML = `
            <!-- Hướng dẫn cài đặt -->
            <div class="uvd-settings-cv">
                <h3>Cài đặt Universal DL</h3>
                <p><span class="badge-cv">1</span> Cài <span class="key-cv">Tampermonkey</span> (hoặc <span class="key-cv">Violentmonkey</span>) trên trình duyệt.</p>
                <p><span class="badge-cv">2</span> Tạo script mới và dán toàn bộ code này vào.</p>
                <p><span class="badge-cv">3</span> Lưu script và tải lại trang.</p>
                <p style="margin-top:6px;color:var(--text3);font-style:italic;">💡 Nếu dùng trên Android, hãy dùng <span class="key-cv">Kiwi Browser</span> hoặc <span class="key-cv">Firefox</span> có hỗ trợ extension.</p>
            </div>

            <!-- Hướng dẫn sử dụng nhanh -->
            <div class="uvd-settings-cv">
                <h3>Sử dụng nhanh</h3>
                <p><span class="badge-cv">▶</span> Mở panel: <span class="key-cv">Ctrl+U</span> (hoặc bấm nút nổi).</p>
                <p><span class="badge-cv">▶</span> Phát hiện tự động các luồng video (M3U8, MP4, WEBM...).</p>
                <p><span class="badge-cv">▶</span> Bấm <span class="key-cv">Xem trước</span> để mở video trong trình phát gốc Chrome.</p>
                <p><span class="badge-cv">▶</span> Bấm <span class="key-cv">Lệnh tải</span> để copy lệnh tải về (yt-dlp, ffmpeg, curl).</p>
                <p><span class="badge-cv">▶</span> Bấm <span class="key-cv">Chất lượng</span> để chọn chất lượng (với M3U8 master).</p>
            </div>

            <!-- Thông tin cá nhân (avatar + các trường) -->
            <div class="uvd-settings-cv" style="display:flex;gap:16px;align-items:center;border-color:rgba(109,140,255,0.25);background:rgba(109,140,255,0.04);">
                <div class="uvd-profile-avatar">NQN</div>
                <div class="uvd-profile-info">
                    <div><span class="label">Tên</span><br><span class="value">Nguyễn Quốc Ngự</span></div>
                    <div><span class="label">Email</span><br><span class="value">nguyenquocngu91@gmail.com</span></div>
                    <div><span class="label">Website</span><br><span class="value">github.com/nguyenquocngu</span></div>
                    <div><span class="label">Giới thiệu</span><br><span class="value" style="font-weight:400;color:var(--text2);">Tác giả của Universal Video Downloader, đam mê code và phát triển công cụ hữu ích cho cộng đồng.</span></div>
                </div>
            </div>

            <!-- Sao lưu & khôi phục -->
            <div class="uvd-settings-cv">
                <h3>Sao lưu & Khôi phục</h3>
                <div class="uvd-grid-2">
                    <button class="uvd-btn uvd-btn-sm" id="_uvd_backup_">Xuất dữ liệu</button>
                    <button class="uvd-btn uvd-btn-sm" id="_uvd_restore_">Nhập dữ liệu</button>
                </div>
                <button class="uvd-btn uvd-btn-sm" id="_uvd_reset_" style="width:100%;margin-top:6px;background:var(--danger);">Đặt lại tất cả</button>
            </div>

            <!-- Thông tin phiên bản -->
            <div class="uvd-footer-cv">
                Phiên bản 5.1 · <strong>nguyenquocngu91</strong> · Yêu thích: ${data.favorites.length} · Lịch sử: ${(data.history||[]).length}
            </div>
        `;

        container.querySelectorAll('.uvd-btn').forEach(function(b) {
            b.addEventListener('click', addRipple);
        });

        document.getElementById('_uvd_backup_').onclick = function() {
            var blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
            var a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = 'uvd_backup.json';
            a.click();
            toast('Đã xuất backup');
        };

        document.getElementById('_uvd_restore_').onclick = function() {
            var inp = document.createElement('input');
            inp.type = 'file';
            inp.accept = '.json';
            inp.onchange = function(e) {
                var reader = new FileReader();
                reader.onload = function(ev) {
                    try {
                        var imported = JSON.parse(ev.target.result);
                        data = Object.assign(data, imported);
                        storage.set(data);
                        toast('Đã nhập thành công!');
                        buildUI();
                    } catch(ex) {
                        toast('File không hợp lệ', 'var(--danger)');
                    }
                };
                reader.readAsText(inp.files[0]);
            };
            inp.click();
        };

        document.getElementById('_uvd_reset_').onclick = function() {
            if (confirm('Xóa toàn bộ dữ liệu (yêu thích, lịch sử, profile)?')) {
                data = { favorites: [], siteProfiles: {}, history: [] };
                storage.set(data);
                toast('Đã reset!');
                buildUI();
            }
        };
    }

    // ========== COMMAND PICKER ==========
    function showCommandPicker(url, type) {
        var overlay = document.createElement('div');
        overlay.className = 'uvd-overlay';

        var cmds = makeCommands(url, type, pageInfo.title);
        var html = '<div class="uvd-glass-panel" style="max-width:600px;margin:auto;">';
        html += '<div style="font-weight:700;margin-bottom:10px;">Chọn lệnh tải</div>';

        Object.keys(cmds).forEach(function(key) {
            var c = cmds[key];
            html += '<div class="uvd-card" style="margin-bottom:6px;padding:10px;">';
            html += '<div style="display:flex;justify-content:space-between;align-items:center;">';
            html += '<span style="font-weight:600;">' + c.label + '</span>';
            html += '<button class="uvd-btn uvd-btn-sm cmd-select" data-cmd="' + encodeURIComponent(c.cmd) + '">Lấy lệnh</button>';
            html += '</div>';
            html += '<div style="font-size:10px;color:var(--text3);font-family:monospace;word-break:break-all;margin-top:4px;">' + c.cmd.substring(0, 120) + (c.cmd.length > 120 ? '...' : '') + '</div>';
            html += '</div>';
        });

        html += '<button class="uvd-btn uvd-btn-sm close-overlay-btn" style="width:100%;margin-top:6px;background:var(--danger);">Đóng</button>';
        html += '</div>';
        overlay.innerHTML = html;
        document.body.appendChild(overlay);

        overlay.querySelectorAll('.uvd-btn').forEach(function(b) {
            b.addEventListener('click', addRipple);
        });

        overlay.querySelector('.close-overlay-btn').onclick = function() {
            overlay.remove();
        };

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
            '<div class="uvd-glass-panel" style="max-width:600px;margin:auto;">' +
            '<div style="font-weight:700;margin-bottom:8px;">Chỉnh sửa lệnh</div>' +
            '<textarea style="width:100%;height:120px;background:rgba(0,0,0,0.5);border:1px solid var(--border);border-radius:10px;color:var(--text);padding:12px;font-family:monospace;font-size:12px;resize:vertical;">' + text + '</textarea>' +
            '<div class="uvd-grid-2" style="margin-top:12px;">' +
            '<button class="uvd-btn uvd-btn-sm" id="_uvd_ed_copy_">Sao chép</button>' +
            '<button class="uvd-btn uvd-btn-sm" id="_uvd_ed_share_" style="background:rgba(139,92,246,0.3);">Chia sẻ</button>' +
            '</div>' +
            '<button class="uvd-btn uvd-btn-sm close-editor" style="width:100%;margin-top:8px;background:var(--danger);">Đóng</button>' +
            '</div>';
        document.body.appendChild(overlay);

        overlay.querySelectorAll('.uvd-btn').forEach(function(b) {
            b.addEventListener('click', addRipple);
        });

        document.getElementById('_uvd_ed_copy_').onclick = function() {
            copy(overlay.querySelector('textarea').value);
            overlay.remove();
            toast('Đã sao chép!');
        };

        document.getElementById('_uvd_ed_share_').onclick = function() {
            shareUrl(overlay.querySelector('textarea').value);
            overlay.remove();
        };

        overlay.querySelector('.close-editor').onclick = function() {
            overlay.remove();
        };
    }

    // ========== QUALITY PICKER ==========
    function showQualityPicker(url) {
        var overlay = document.createElement('div');
        overlay.className = 'uvd-overlay';
        overlay.innerHTML = '<div class="uvd-glass-panel" style="max-width:600px;margin:auto;">Đang phân tích M3U8...</div>';
        document.body.appendChild(overlay);

        parseM3U8Master(url, function(qualities) {
            if (!qualities || !qualities.length) {
                overlay.innerHTML =
                    '<div class="uvd-glass-panel" style="max-width:600px;margin:auto;text-align:center;">' +
                    '<div style="color:var(--danger);">Không phải Master Playlist hoặc không có chất lượng nào.</div>' +
                    '<button class="uvd-btn uvd-btn-sm close-overlay-btn" style="margin-top:12px;background:var(--danger);width:100%;">Đóng</button>' +
                    '</div>';
                overlay.querySelector('.close-overlay-btn').onclick = function() { overlay.remove(); };
                return;
            }

            var html = '<div class="uvd-glass-panel" style="max-width:600px;margin:auto;">';
            html += '<div style="font-weight:700;margin-bottom:12px;">Chọn chất lượng (' + qualities.length + ')</div>';
            html += '<div style="overflow-y:auto;max-height:60vh;">';

            qualities.forEach(function(q) {
                html += '<div class="uvd-card">' +
                    '<b>' + q.label + '</b> <span style="color:var(--text3);">' + Math.round(q.bandwidth/1000) + 'kbps</span>' +
                    '<div class="uvd-grid-3" style="margin-top:8px;">' +
                    '<button class="uvd-btn uvd-btn-sm q-act" data-url="' + encodeURIComponent(q.url) + '" data-action="share" style="background:rgba(139,92,246,0.2);">Chia sẻ</button>' +
                    '<button class="uvd-btn uvd-btn-sm q-act" data-url="' + encodeURIComponent(q.url) + '" data-action="preview">Xem</button>' +
                    '<button class="uvd-btn uvd-btn-sm q-act" data-url="' + encodeURIComponent(q.url) + '" data-action="cmd">Lệnh</button>' +
                    '</div>' +
                    '</div>';
            });

            html += '</div><button class="uvd-btn uvd-btn-sm close-overlay-btn" style="width:100%;margin-top:10px;background:var(--danger);">Đóng</button></div>';
            overlay.innerHTML = html;

            overlay.querySelectorAll('.uvd-btn').forEach(function(b) {
                b.addEventListener('click', addRipple);
            });

            overlay.querySelector('.close-overlay-btn').onclick = function() {
                overlay.remove();
            };

            overlay.querySelectorAll('.q-act').forEach(function(b) {
                b.onclick = function() {
                    var u = decodeURIComponent(this.dataset.url);
                    var action = this.dataset.action;
                    overlay.remove();
                    if (action === 'share') shareUrl(u);
                    else if (action === 'preview') window.open(u, '_blank');
                    else showCommandPicker(u, 'M3U8');
                };
            });
        });
    }

    // ========== START ==========
    buildUI();

    // ========== KEYBOARD SHORTCUT ==========
    document.addEventListener('keydown', function(e) {
        if (e.key === 'u' && e.ctrlKey) {
            e.preventDefault();
            var panel = document.getElementById('__uvd__');
            if (panel) {
                if (panel.style.display === 'none') {
                    panel.style.display = 'flex';
                    var floatBtn = document.getElementById('__uvd_min_float__');
                    if (floatBtn) floatBtn.remove();
                } else {
                    panel.remove();
                }
            } else {
                buildUI();
            }
        }
    });

    console.log('%c Universal Video Downloader V5.1 by nguyenquocngu91 ', 'background:#0a0c14;color:#6d8cff;font-size:14px;font-weight:bold;padding:8px 16px;border-radius:8px;border:1px solid #6d8cff;');
})();