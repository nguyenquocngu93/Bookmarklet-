// ==UserScript==
// @name         DevLib CDN Player - Glass UI v3 Full Fixed
// @namespace    http://tampermonkey.net/
// @version      3.1
// @description  Fixed video playback + Glass player with images tab, preview, ad filter
// @author       You
// @match        *://*/*
// @grant        GM_getValue
// @grant        GM_setValue
// @run-at       document-start
// ==/UserScript==

(function () {
    'use strict';

    // ══════════════════════════════════════════
    // STORAGE
    // ══════════════════════════════════════════
    const STORAGE_KEYS = {
        HISTORY: 'dlp_history',
        BOOKMARKS: 'dlp_bookmarks',
        PLAYLIST: 'dlp_playlist',
        SETTINGS: 'dlp_settings'
    };

    function loadData(key) {
        try { return JSON.parse(localStorage.getItem(key) || (GM_getValue ? GM_getValue(key, '[]') : '[]')); }
        catch(e) { return []; }
    }
    function saveData(key, data) {
        const json = JSON.stringify(data);
        localStorage.setItem(key, json);
        if (GM_setValue) GM_setValue(key, json);
    }

    let history = loadData(STORAGE_KEYS.HISTORY);
    let bookmarks = loadData(STORAGE_KEYS.BOOKMARKS);
    let playlist = loadData(STORAGE_KEYS.PLAYLIST);
    let settings = loadData(STORAGE_KEYS.SETTINGS) || { theme: 'dark', autoplay: true, muted: false };

    const REF = location.href;
    const UA = navigator.userAgent;

    // ══════════════════════════════════════════
    // AD/POPUP FILTER
    // ══════════════════════════════════════════
    const AD_PATTERNS = [
        /doubleclick/i, /googlesyndication/i, /googlead/i, /adnxs/i,
        /snaptrckr/i, /mayzaent/i, /popunder/i, /popcash/i, /propeller/i,
        /exoclick/i, /juicyads/i, /trafficjunky/i, /adsterra/i, /hilltop/i,
        /clickadu/i, /realsrv/i, /adspyglass/i, /smartpop/i, /megapu\.sh/i,
        /tracking/i, /pixel\./i, /beacon/i, /telemetry/i, /fingerprint/i,
        /analytics\./i, /metrics/i, /stats\./i, /impression/i, /collect/i,
        /\/ads?\//i, /\/banner/i, /\/sponsor/i, /\/promo/i, /\/campaign/i,
        /\/popup/i, /\/popunder/i, /\/widget/i, /\/social/i, /\/share/i,
    ];

    const IMAGE_EXTENSIONS = /\.(jpg|jpeg|png|gif|webp|svg|bmp|ico|avif|heic|heif)(\?|$)/i;
    const FONT_EXTENSIONS = /\.(woff2?|ttf|eot|otf)(\?|$)/i;
    const CSS_EXTENSIONS = /\.(css|less|scss)(\?|$)/i;
    const JS_EXTENSIONS = /\.(js|mjs)(\?|$)/i;

    function isAdOrTracker(url) {
        if (!url) return false;
        return AD_PATTERNS.some(r => r.test(url));
    }

    // ══════════════════════════════════════════
    // URL DETECTION
    // ══════════════════════════════════════════
    const mediaUrls = new Map();
    const imageUrls = new Map();

    const mediaPatterns = [
        { re: /https?:\/\/[^\s"'<>()\\\]]+\.m3u8[^\s"'<>()\\\]]*/gi, type: 'M3U8', priority: 1 },
        { re: /https?:\/\/[^\s"'<>()\\\]]+\.mpd[^\s"'<>()\\\]]*/gi,  type: 'MPD',  priority: 2 },
        { re: /https?:\/\/[^\s"'<>()\\\]]+\.mp4[^\s"'<>()\\\]]*/gi,  type: 'MP4',  priority: 3 },
        { re: /https?:\/\/[^\s"'<>()\\\]]+\.webm[^\s"'<>()\\\]]*/gi, type: 'WEBM', priority: 4 },
        { re: /https?:\/\/[^\s"'<>()\\\]]+\.mkv[^\s"'<>()\\\]]*/gi,  type: 'MKV',  priority: 5 },
        { re: /https?:\/\/[^\s"'<>()\\\]]+\.(avi|mov|flv|wmv)(\?|$)[^\s"'<>()\\\]]*/gi, type: 'OTHER', priority: 6 },
    ];

    const imagePatterns = [
        { re: /https?:\/\/[^\s"'<>()\\\]]+\.(jpg|jpeg)(\?[^\s"'<>()\\\]]*)?/gi, type: 'JPEG' },
        { re: /https?:\/\/[^\s"'<>()\\\]]+\.png(\?[^\s"'<>()\\\]]*)?/gi, type: 'PNG' },
        { re: /https?:\/\/[^\s"'<>()\\\]]+\.gif(\?[^\s"'<>()\\\]]*)?/gi, type: 'GIF' },
        { re: /https?:\/\/[^\s"'<>()\\\]]+\.webp(\?[^\s"'<>()\\\]]*)?/gi, type: 'WEBP' },
        { re: /https?:\/\/[^\s"'<>()\\\]]+\.svg(\?[^\s"'<>()\\\]]*)?/gi, type: 'SVG' },
        { re: /https?:\/\/[^\s"'<>()\\\]]+\.(avif|heic|heif)(\?[^\s"'<>()\\\]]*)?/gi, type: 'NEW' },
    ];

    const IFRAME_PLAYER_RE = [
        /https?:\/\/[^\s"'<>]+\/(v|embed|e|vv|jm|t|watch|player)\/[a-zA-Z0-9_\-]{6,}/gi,
        /https?:\/\/(?:videplay|streamvid|surrit|doodstream|mixdrop|fembed|filemoon|ok\.ru|vk\.com)[^\s"'<>]*/gi,
    ];

    function cleanUrl(u) {
        return u.replace(/\\u002F/gi,'/').replace(/\\\//g,'/')
                .replace(/&amp;/g,'&').replace(/\\"/g,'')
                .replace(/["')\]>\s]+$/,'').trim();
    }

    function addMediaUrl(u, type, source, priority) {
        u = cleanUrl(u);
        if (!u.startsWith('http')) return;
        if (isAdOrTracker(u)) return;
        if (!mediaUrls.has(u) || mediaUrls.get(u).priority > priority) {
            mediaUrls.set(u, { url: u, type, source, priority, ts: Date.now() });
            updateBadge();
        }
    }

    function addImageUrl(u, type, source) {
        u = cleanUrl(u);
        if (!u.startsWith('http')) return;
        if (isAdOrTracker(u)) return;
        if (!imageUrls.has(u)) {
            imageUrls.set(u, { url: u, type, source, ts: Date.now() });
            updateBadge();
        }
    }

    function findUrls(text, source) {
        if (!text || typeof text !== 'string') return;
        mediaPatterns.forEach(p => {
            const m = text.match(p.re);
            if (m) m.forEach(u => addMediaUrl(u, p.type, source, p.priority));
        });
        imagePatterns.forEach(p => {
            const m = text.match(p.re);
            if (m) m.forEach(u => addImageUrl(u, p.type, source));
        });
        IFRAME_PLAYER_RE.forEach(re => {
            const m = text.match(re);
            if (m) m.forEach(u => addMediaUrl(cleanUrl(u), 'IFRAME', source, 99));
        });
    }

    function scan(doc, src) {
        try {
            if (!doc) return;
            doc.querySelectorAll('video,source,audio').forEach(v => {
                if (v.src && !isAdOrTracker(v.src)) findUrls(v.src, src+':el');
                if (v.currentSrc && !isAdOrTracker(v.currentSrc)) findUrls(v.currentSrc, src+':cur');
            });
            doc.querySelectorAll('img').forEach(img => {
                if (img.src && !isAdOrTracker(img.src)) addImageUrl(img.src, 'IMG', src+':img');
                if (img.srcset) {
                    img.srcset.split(',').forEach(s => {
                        const url = s.trim().split(' ')[0];
                        if (url && !isAdOrTracker(url)) addImageUrl(url, 'SRCSET', src+':srcset');
                    });
                }
            });
            doc.querySelectorAll('picture source').forEach(s => {
                if (s.srcset) {
                    s.srcset.split(',').forEach(u => {
                        const url = u.trim().split(' ')[0];
                        if (url && !isAdOrTracker(url)) addImageUrl(url, 'PICTURE', src+':pic');
                    });
                }
            });
            doc.querySelectorAll('iframe').forEach(f => {
                if (f.src && !isAdOrTracker(f.src)) addMediaUrl(f.src, 'IFRAME', src+':if', 99);
            });
            doc.querySelectorAll('script:not([src])').forEach(s => {
                findUrls(s.textContent, src+':js');
            });
            findUrls(doc.documentElement.outerHTML, src+':html');
            doc.querySelectorAll('[style]').forEach(el => {
                const style = el.getAttribute('style');
                const bgMatch = style.match(/url\(["']?([^"')]+)["']?\)/gi);
                if (bgMatch) {
                    bgMatch.forEach(m => {
                        const url = m.replace(/url\(["']?/i,'').replace(/["']?\)/,'');
                        if (url && IMAGE_EXTENSIONS.test(url) && !isAdOrTracker(url)) {
                            addImageUrl(url, 'CSS-BG', src+':css');
                        }
                    });
                }
            });
        } catch(e) {}
    }

    const _fetch = window.fetch;
    const _xhrOpen = XMLHttpRequest.prototype.open;
    const _createElement = document.createElement.bind(document);

    window.fetch = function(...a) {
        try {
            const u = typeof a[0]==='string' ? a[0] : (a[0] && a[0].url) || '';
            if (u && !isAdOrTracker(u)) {
                if (IMAGE_EXTENSIONS.test(u)) addImageUrl(u, 'FETCH-IMG', 'fetch');
                else if (!FONT_EXTENSIONS.test(u) && !CSS_EXTENSIONS.test(u) && !JS_EXTENSIONS.test(u)) {
                    findUrls(u, 'fetch');
                }
            }
        } catch(e) {}
        return _fetch.apply(this, a);
    };

    XMLHttpRequest.prototype.open = function(m, u) {
        try {
            if (u && !isAdOrTracker(u)) {
                const su = String(u);
                if (IMAGE_EXTENSIONS.test(su)) addImageUrl(su, 'XHR-IMG', 'xhr');
                else if (!FONT_EXTENSIONS.test(su) && !CSS_EXTENSIONS.test(su) && !JS_EXTENSIONS.test(su)) {
                    findUrls(su, 'xhr');
                }
            }
        } catch(e) {}
        return _xhrOpen.apply(this, arguments);
    };

    document.createElement = function(tag) {
        const el = _createElement(tag);
        if (tag.toLowerCase() === 'img') {
            const origSrcDesc = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
            if (origSrcDesc) {
                Object.defineProperty(el, 'src', {
                    get() { return origSrcDesc.get.call(this); },
                    set(val) {
                        if (val && !isAdOrTracker(val)) addImageUrl(val, 'DYNAMIC-IMG', 'createElement');
                        origSrcDesc.set.call(this, val);
                    },
                    configurable: true
                });
            }
        }
        return el;
    };

    function scanPerf() {
        try {
            performance.getEntriesByType('resource').forEach(e => {
                if (e.name && !isAdOrTracker(e.name)) {
                    if (IMAGE_EXTENSIONS.test(e.name)) {
                        addImageUrl(e.name, 'PERF-IMG', 'perf');
                    } else if (!FONT_EXTENSIONS.test(e.name) && !CSS_EXTENSIONS.test(e.name) && !JS_EXTENSIONS.test(e.name)) {
                        findUrls(e.name, 'perf');
                    }
                }
            });
        } catch(e) {}
    }

    let updateBadge = () => {};

    // ══════════════════════════════════════════
    // GLASS UI CSS
    // ══════════════════════════════════════════
    const CSS = `
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap');

        :root {
            --glass-bg: rgba(18, 18, 30, 0.75);
            --glass-border: rgba(255, 255, 255, 0.12);
            --glass-shadow: 0 20px 50px rgba(0, 0, 0, 0.5);
            --accent: #8b5cf6;
            --accent2: #06b6d4;
            --accent3: #f43f5e;
            --text: rgba(255, 255, 255, 0.92);
            --text-secondary: rgba(255, 255, 255, 0.55);
            --radius: 20px;
            --radius-sm: 12px;
        }

        * { box-sizing: border-box; }

        #dlp-fab {
            position: fixed;
            top: 24px;
            right: 24px;
            width: 62px;
            height: 62px;
            background: rgba(255, 255, 255, 0.08);
            backdrop-filter: blur(30px);
            -webkit-backdrop-filter: blur(30px);
            border: 1.5px solid rgba(255, 255, 255, 0.18);
            border-radius: 50%;
            cursor: pointer;
            z-index: 2147483647;
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: 
                0 10px 40px rgba(0, 0, 0, 0.35),
                0 0 0 1px rgba(255, 255, 255, 0.05) inset,
                0 0 30px rgba(139, 92, 246, 0.2);
            transition: all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
            animation: floatFab 4s ease-in-out infinite;
        }
        #dlp-fab:hover {
            transform: scale(1.08) translateY(-8px);
            background: rgba(255, 255, 255, 0.15);
            box-shadow: 
                0 20px 60px rgba(0, 0, 0, 0.45),
                0 0 40px rgba(139, 92, 246, 0.35),
                0 0 0 1px rgba(255, 255, 255, 0.08) inset;
        }
        #dlp-fab:active { transform: scale(0.94); transition: all 0.1s; }

        @keyframes floatFab {
            0%, 100% { transform: translateY(0px); }
            30% { transform: translateY(-12px); }
            60% { transform: translateY(-4px); }
        }

        #dlp-fab-icon {
            font-size: 30px;
            filter: drop-shadow(0 4px 8px rgba(0,0,0,0.4));
            transition: transform 0.3s;
        }
        #dlp-fab:hover #dlp-fab-icon { transform: rotate(15deg) scale(1.15); }

        #dlp-badge {
            position: absolute;
            top: -6px;
            right: -6px;
            background: linear-gradient(135deg, #f43f5e, #8b5cf6);
            color: white;
            font-size: 11px;
            min-width: 26px;
            height: 26px;
            border-radius: 13px;
            display: none;
            align-items: center;
            justify-content: center;
            font-weight: 800;
            border: 2.5px solid rgba(255, 255, 255, 0.25);
            box-shadow: 0 6px 20px rgba(244, 63, 94, 0.5);
            animation: pulseBadge 2.5s ease-in-out infinite;
            letter-spacing: -0.5px;
        }

        @keyframes pulseBadge {
            0%, 100% { box-shadow: 0 6px 20px rgba(244, 63, 94, 0.5); }
            50% { box-shadow: 0 6px 30px rgba(139, 92, 246, 0.7); }
        }

        #dlp-bd {
            position: fixed;
            inset: 0;
            background: rgba(0, 0, 0, 0.55);
            backdrop-filter: blur(15px);
            -webkit-backdrop-filter: blur(15px);
            z-index: 2147483639;
            display: none;
        }
        #dlp-bd.on { display: block; }

        #dlp-panel {
            position: fixed;
            top: 24px;
            right: 24px;
            width: calc(100vw - 48px);
            max-width: 440px;
            max-height: 65vh;
            background: var(--glass-bg);
            backdrop-filter: blur(50px) saturate(200%);
            -webkit-backdrop-filter: blur(50px) saturate(200%);
            border-radius: var(--radius);
            z-index: 2147483647;
            display: none;
            flex-direction: column;
            box-shadow: var(--glass-shadow), 0 0 0 1px var(--glass-border);
            overflow: hidden;
            font-family: 'Inter', -apple-system, sans-serif;
            animation: panelIn 0.35s cubic-bezier(0.22, 0.61, 0.36, 1);
        }
        #dlp-panel.on { display: flex; }

        @keyframes panelIn {
            from { opacity: 0; transform: translateY(-30px) scale(0.92); }
            to { opacity: 1; transform: translateY(0) scale(1); }
        }

        #dlp-ph {
            background: rgba(255, 255, 255, 0.04);
            padding: 18px 20px;
            display: flex;
            align-items: center;
            gap: 12px;
            border-bottom: 1px solid rgba(255, 255, 255, 0.06);
            flex-shrink: 0;
        }
        #dlp-ph-title {
            color: var(--text);
            font-size: 16px;
            font-weight: 700;
            flex: 1;
            letter-spacing: -0.3px;
        }
        #dlp-ph-acts { display: flex; gap: 8px; }

        .dlp-btn {
            border: 1px solid rgba(255, 255, 255, 0.12);
            border-radius: var(--radius-sm);
            cursor: pointer;
            font-size: 12px;
            font-weight: 600;
            padding: 9px 16px;
            color: white;
            white-space: nowrap;
            background: rgba(255, 255, 255, 0.06);
            backdrop-filter: blur(15px);
            -webkit-backdrop-filter: blur(15px);
            transition: all 0.25s;
            letter-spacing: -0.2px;
        }
        .dlp-btn:hover {
            background: rgba(255, 255, 255, 0.14);
            transform: translateY(-2px);
            box-shadow: 0 8px 25px rgba(0,0,0,0.3);
        }
        .dlp-btn.accent {
            background: linear-gradient(135deg, rgba(139, 92, 246, 0.55), rgba(6, 182, 212, 0.45));
            border-color: rgba(255, 255, 255, 0.25);
        }
        .dlp-btn.accent:hover {
            background: linear-gradient(135deg, rgba(139, 92, 246, 0.75), rgba(6, 182, 212, 0.65));
        }

        #dlp-tabs {
            display: flex;
            background: rgba(0, 0, 0, 0.25);
            border-bottom: 1px solid rgba(255, 255, 255, 0.06);
            flex-shrink: 0;
            overflow-x: auto;
            -webkit-overflow-scrolling: touch;
        }
        #dlp-tabs::-webkit-scrollbar { height: 0; }
        .dlp-tab {
            flex: 1;
            min-width: fit-content;
            padding: 12px 14px;
            border: none;
            background: none;
            color: rgba(255, 255, 255, 0.4);
            font-size: 11.5px;
            font-weight: 600;
            cursor: pointer;
            border-bottom: 2.5px solid transparent;
            white-space: nowrap;
            transition: all 0.25s;
            letter-spacing: -0.2px;
        }
        .dlp-tab:hover { color: rgba(255, 255, 255, 0.7); }
        .dlp-tab.on {
            color: #a78bfa;
            border-bottom-color: #a78bfa;
            background: rgba(167, 139, 250, 0.08);
        }

        #dlp-pb {
            overflow-y: auto;
            flex: 1;
            background: rgba(0, 0, 0, 0.12);
            -webkit-overflow-scrolling: touch;
        }
        #dlp-pb::-webkit-scrollbar { width: 3px; }
        #dlp-pb::-webkit-scrollbar-track { background: transparent; }
        #dlp-pb::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.12); border-radius: 3px; }

        .dlp-li {
            padding: 15px 18px;
            border-bottom: 1px solid rgba(255, 255, 255, 0.04);
            cursor: pointer;
            transition: all 0.2s;
        }
        .dlp-li:hover { background: rgba(255, 255, 255, 0.04); }
        .dlp-li:active { background: rgba(255, 255, 255, 0.07); }

        .dlp-li-top {
            display: flex;
            align-items: center;
            gap: 9px;
            margin-bottom: 7px;
        }
        .dlp-li-badge {
            font-size: 9.5px;
            font-weight: 700;
            padding: 4px 9px;
            border-radius: 7px;
            color: white;
            text-transform: uppercase;
            letter-spacing: 0.3px;
            flex-shrink: 0;
        }
        .dlp-badge-m3u8 { background: linear-gradient(135deg, #7c3aed, #a78bfa); }
        .dlp-badge-mp4 { background: linear-gradient(135deg, #059669, #34d399); }
        .dlp-badge-iframe { background: linear-gradient(135deg, #2563eb, #60a5fa); }
        .dlp-badge-other { background: linear-gradient(135deg, #6b7280, #9ca3af); }

        .dlp-li-name {
            color: var(--text);
            font-size: 13.5px;
            font-weight: 600;
            flex: 1;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            letter-spacing: -0.2px;
        }
        .dlp-li-src { color: var(--text-secondary); font-size: 10px; margin-bottom: 6px; }
        .dlp-li-url {
            color: #a78bfa;
            font-size: 10.5px;
            font-family: 'SF Mono', 'Cascadia Code', monospace;
            word-break: break-all;
            background: rgba(0, 0, 0, 0.35);
            padding: 9px 12px;
            border-radius: 10px;
            line-height: 1.55;
            border: 1px solid rgba(255, 255, 255, 0.06);
        }

        .dlp-img-grid {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 8px;
            padding: 12px;
        }
        .dlp-img-item {
            position: relative;
            aspect-ratio: 1;
            border-radius: 12px;
            overflow: hidden;
            cursor: pointer;
            background: rgba(0,0,0,0.4);
            border: 1px solid rgba(255,255,255,0.08);
            transition: all 0.25s;
        }
        .dlp-img-item:hover {
            transform: scale(1.04);
            border-color: rgba(255,255,255,0.2);
            box-shadow: 0 8px 25px rgba(0,0,0,0.5);
            z-index: 2;
        }
        .dlp-img-thumb {
            width: 100%;
            height: 100%;
            object-fit: cover;
            transition: transform 0.3s;
        }
        .dlp-img-item:hover .dlp-img-thumb { transform: scale(1.08); }
        .dlp-img-badge {
            position: absolute;
            bottom: 6px;
            right: 6px;
            font-size: 9px;
            font-weight: 700;
            padding: 3px 7px;
            border-radius: 6px;
            background: rgba(0,0,0,0.7);
            color: white;
            backdrop-filter: blur(8px);
        }

        #dlp-img-prev {
            position: fixed;
            inset: 0;
            z-index: 2147483648;
            background: rgba(0,0,0,0.92);
            display: none;
            align-items: center;
            justify-content: center;
            backdrop-filter: blur(20px);
        }
        #dlp-img-prev.on { display: flex; }
        #dlp-img-prev img {
            max-width: 95vw;
            max-height: 90vh;
            object-fit: contain;
            border-radius: 8px;
            box-shadow: 0 30px 80px rgba(0,0,0,0.7);
        }
        #dlp-img-close {
            position: absolute;
            top: 20px;
            right: 20px;
            width: 44px;
            height: 44px;
            border-radius: 50%;
            background: rgba(255,255,255,0.1);
            border: 1px solid rgba(255,255,255,0.2);
            color: white;
            font-size: 22px;
            cursor: pointer;
            backdrop-filter: blur(20px);
            transition: all 0.2s;
        }
        #dlp-img-close:hover {
            background: rgba(244,63,94,0.6);
            transform: scale(1.1);
        }

        /* ── PLAYER PREVIEW (TOP) ── */
        #dlp-prev {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            background: rgba(12, 12, 22, 0.78);
            backdrop-filter: blur(50px) saturate(200%);
            -webkit-backdrop-filter: blur(50px) saturate(200%);
            z-index: 2147483647;
            display: none;
            flex-direction: column;
            border-radius: 0 0 24px 24px;
            box-shadow: 0 30px 70px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255,255,255,0.08);
            font-family: 'Inter', sans-serif;
            animation: slideDown 0.35s cubic-bezier(0.22, 0.61, 0.36, 1);
        }
        #dlp-prev.on { display: flex; }

        @keyframes slideDown {
            from { opacity: 0; transform: translateY(-25px); }
            to { opacity: 1; transform: translateY(0); }
        }

        #dlp-prev-bar {
            display: flex;
            align-items: center;
            padding: 14px 18px;
            gap: 10px;
            border-bottom: 1px solid rgba(255,255,255,0.06);
        }
        #dlp-prev-title {
            flex: 1;
            color: var(--text);
            font-size: 14px;
            font-weight: 700;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            letter-spacing: -0.2px;
        }

        #dlp-vid-wrap {
            background: #000;
            width: 100%;
            height: 250px;
            display: flex;
            align-items: center;
            justify-content: center;
            position: relative;
        }
        #dlp-vid {
            width: 100%;
            height: 100%;
            object-fit: contain;
            transition: transform 0.3s;
        }
        
        /* Play overlay for first click */
        #dlp-play-overlay {
            position: absolute;
            inset: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            background: rgba(0,0,0,0.3);
            cursor: pointer;
            z-index: 10;
            transition: opacity 0.3s;
        }
        #dlp-play-overlay.playing { opacity: 0; pointer-events: none; }
        #dlp-play-icon {
            width: 70px;
            height: 70px;
            border-radius: 50%;
            background: rgba(255,255,255,0.15);
            backdrop-filter: blur(20px);
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 30px;
            color: white;
            border: 2px solid rgba(255,255,255,0.3);
            transition: all 0.3s;
        }
        #dlp-play-overlay:hover #dlp-play-icon {
            background: rgba(255,255,255,0.25);
            transform: scale(1.1);
        }

        /* Loading spinner */
        #dlp-loading {
            position: absolute;
            inset: 0;
            display: none;
            align-items: center;
            justify-content: center;
            background: rgba(0,0,0,0.6);
            z-index: 11;
        }
        #dlp-loading.show { display: flex; }
        #dlp-spinner {
            width: 40px;
            height: 40px;
            border: 3px solid rgba(255,255,255,0.2);
            border-top: 3px solid #8b5cf6;
            border-radius: 50%;
            animation: spin 0.8s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }

        /* Error message */
        #dlp-error {
            position: absolute;
            inset: 0;
            display: none;
            align-items: center;
            justify-content: center;
            background: rgba(0,0,0,0.8);
            color: #ef4444;
            font-size: 13px;
            z-index: 11;
            flex-direction: column;
            gap: 10px;
        }
        #dlp-error.show { display: flex; }

        .dlp-action-row {
            display: flex;
            gap: 6px;
            padding: 12px 14px;
            overflow-x: auto;
            background: rgba(0,0,0,0.25);
            -webkit-overflow-scrolling: touch;
            scroll-snap-type: x mandatory;
        }
        .dlp-action-row::-webkit-scrollbar { height: 0; }

        .dlp-action-btn {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 5px;
            border: 1px solid rgba(255,255,255,0.1);
            border-radius: 14px;
            padding: 10px 14px;
            color: white;
            font-weight: 600;
            font-size: 10px;
            cursor: pointer;
            flex-shrink: 0;
            background: rgba(255,255,255,0.05);
            backdrop-filter: blur(10px);
            -webkit-backdrop-filter: blur(10px);
            transition: all 0.2s;
            min-width: 64px;
            scroll-snap-align: start;
        }
        .dlp-action-btn:hover {
            background: rgba(255,255,255,0.14);
            transform: translateY(-3px);
            box-shadow: 0 10px 30px rgba(0,0,0,0.4);
        }
        .dlp-action-btn .dlp-action-icon { font-size: 20px; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.4)); }
        .dlp-action-btn .dlp-action-label { font-size: 10px; letter-spacing: -0.2px; opacity: 0.85; }

        .dlp-action-btn.copy { border-left: 3px solid #3b82f6; }
        .dlp-action-btn.fs { border-left: 3px solid #ef4444; }
        .dlp-action-btn.share { border-left: 3px solid #10b981; }
        .dlp-action-btn.dl { border-left: 3px solid #8b5cf6; }
        .dlp-action-btn.rot { border-left: 3px solid #06b6d4; }
        .dlp-action-btn.zm { border-left: 3px solid #f59e0b; }
        .dlp-action-btn.pip { border-left: 3px solid #ec4899; }
        .dlp-action-btn.bm { border-left: 3px solid #f43f5e; }
        .dlp-action-btn.pl { border-left: 3px solid #14b8a6; }
        .dlp-action-btn.sub { border-left: 3px solid #6366f1; }
        .dlp-action-btn.cast { border-left: 3px solid #0ea5e9; }
        .dlp-action-btn.speed { border-left: 3px solid #eab308; }

        .dlp-icon-btn {
            width: 38px;
            height: 38px;
            border-radius: 50%;
            border: 1px solid rgba(255,255,255,0.12);
            background: rgba(255,255,255,0.06);
            backdrop-filter: blur(10px);
            -webkit-backdrop-filter: blur(10px);
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-size: 17px;
            transition: all 0.2s;
        }
        .dlp-icon-btn:hover {
            background: rgba(255,255,255,0.15);
            transform: scale(1.12);
        }

        #dlp-drop {
            position: fixed;
            background: rgba(15, 15, 28, 0.85);
            backdrop-filter: blur(50px) saturate(200%);
            -webkit-backdrop-filter: blur(50px) saturate(200%);
            border-radius: 16px;
            border: 1px solid rgba(255,255,255,0.1);
            z-index: 2147483647;
            display: none;
            box-shadow: 0 20px 50px rgba(0,0,0,0.6);
            overflow: hidden;
            min-width: 220px;
        }
        #dlp-drop.on { display: block; }
        .dlp-di {
            padding: 13px 18px;
            color: rgba(255,255,255,0.82);
            font-size: 13px;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 10px;
            border-bottom: 1px solid rgba(255,255,255,0.04);
            transition: all 0.2s;
        }
        .dlp-di:hover { background: rgba(255,255,255,0.08); }

        #dlp-cmd {
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(15, 15, 28, 0.88);
            backdrop-filter: blur(50px) saturate(200%);
            -webkit-backdrop-filter: blur(50px) saturate(200%);
            border-radius: 22px;
            z-index: 2147483647;
            width: 94%;
            max-width: 500px;
            padding: 22px;
            display: none;
            box-shadow: 0 30px 70px rgba(0,0,0,0.7);
            font-family: 'Inter', sans-serif;
            border: 1px solid rgba(255,255,255,0.1);
            max-height: 80vh;
            overflow-y: auto;
        }
        #dlp-cmd.on { display: block; }
        .dlp-cmd-block {
            background: rgba(0,0,0,0.35);
            border-radius: 14px;
            padding: 13px;
            margin-bottom: 10px;
            border: 1px solid rgba(255,255,255,0.06);
        }
        .dlp-cmd-label {
            color: rgba(255,255,255,0.5);
            font-size: 10px;
            font-weight: 700;
            text-transform: uppercase;
            margin-bottom: 7px;
            letter-spacing: 1px;
        }
        .dlp-cmd-row { display: flex; gap: 6px; align-items: stretch; }
        .dlp-cmd-ta {
            flex: 1;
            background: transparent;
            color: #34d399;
            border: none;
            font-family: 'SF Mono', monospace;
            font-size: 11px;
            resize: none;
            outline: none;
            min-height: 40px;
            line-height: 1.5;
        }
        .dlp-cmd-cp {
            background: rgba(37,99,235,0.5);
            border: 1px solid rgba(255,255,255,0.2);
            color: white;
            border-radius: 10px;
            padding: 0 14px;
            cursor: pointer;
            font-size: 16px;
            flex-shrink: 0;
            backdrop-filter: blur(10px);
            transition: all 0.2s;
        }
        .dlp-cmd-cp:hover { background: rgba(37,99,235,0.7); }

        #dlp-toast {
            position: fixed;
            top: 24px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(25, 25, 38, 0.85);
            backdrop-filter: blur(30px);
            -webkit-backdrop-filter: blur(30px);
            color: white;
            padding: 12px 26px;
            border-radius: 28px;
            font-size: 13px;
            font-weight: 600;
            z-index: 2147483647;
            display: none;
            box-shadow: 0 10px 30px rgba(0,0,0,0.5);
            border: 1px solid rgba(255,255,255,0.1);
            white-space: nowrap;
            letter-spacing: -0.2px;
        }

        #dlp-playlist-panel {
            position: fixed;
            bottom: 0;
            left: 0;
            right: 0;
            max-height: 50vh;
            background: rgba(15, 15, 28, 0.88);
            backdrop-filter: blur(50px);
            z-index: 2147483647;
            border-radius: 24px 24px 0 0;
            display: none;
            flex-direction: column;
            box-shadow: 0 -20px 60px rgba(0,0,0,0.6);
            font-family: 'Inter', sans-serif;
        }
        #dlp-playlist-panel.on { display: flex; }

        #dlp-sub-panel {
            position: fixed;
            bottom: 50%;
            left: 50%;
            transform: translate(-50%, 50%);
            background: rgba(15, 15, 28, 0.9);
            backdrop-filter: blur(40px);
            z-index: 2147483647;
            border-radius: 18px;
            padding: 20px;
            display: none;
            box-shadow: 0 20px 50px rgba(0,0,0,0.6);
            font-family: 'Inter', sans-serif;
            border: 1px solid rgba(255,255,255,0.1);
            width: 90%;
            max-width: 400px;
        }
        #dlp-sub-panel.on { display: block; }

        #dlp-speed-indicator {
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(0,0,0,0.8);
            color: white;
            font-size: 28px;
            font-weight: 800;
            padding: 14px 24px;
            border-radius: 16px;
            z-index: 2147483647;
            display: none;
            backdrop-filter: blur(20px);
            font-family: 'Inter', sans-serif;
        }
    `;

    // ══════════════════════════════════════════
    // INIT UI
    // ══════════════════════════════════════════
    function initUI() {
        const s = document.createElement('style');
        s.textContent = CSS;
        document.head.appendChild(s);

        document.body.insertAdjacentHTML('beforeend', `
            <button id="dlp-fab">
                <span id="dlp-fab-icon">🎬</span>
                <span id="dlp-badge"></span>
            </button>
            <div id="dlp-bd"></div>

            <div id="dlp-panel">
                <div id="dlp-ph">
                    <span id="dlp-ph-title">🎬 Media Hub</span>
                    <div id="dlp-ph-acts">
                        <button class="dlp-btn accent" id="dlp-btn-scan">🔍 Scan</button>
                        <button class="dlp-btn" id="dlp-btn-clr">🗑</button>
                    </div>
                </div>
                <div id="dlp-tabs">
                    <button class="dlp-tab on" data-tab="streams">📺 Streams</button>
                    <button class="dlp-tab" data-tab="images">🖼 Images</button>
                    <button class="dlp-tab" data-tab="playlist">🎵 Playlist</button>
                    <button class="dlp-tab" data-tab="history">🕒 History</button>
                    <button class="dlp-tab" data-tab="bookmarks">⭐ Saved</button>
                </div>
                <div id="dlp-pb"></div>
            </div>

            <div id="dlp-prev">
                <div id="dlp-prev-bar">
                    <span id="dlp-prev-title">-</span>
                    <button class="dlp-icon-btn" id="dlp-btn-mute" title="Mute/Unmute">🔊</button>
                    <button class="dlp-icon-btn" id="dlp-btn-speed" title="Tốc độ">⚡</button>
                    <button class="dlp-icon-btn" id="dlp-btn-opt" title="Thêm">⋮</button>
                    <button class="dlp-icon-btn" id="dlp-btn-cls" style="color:#ef4444;" title="Đóng">✕</button>
                </div>
                <div id="dlp-vid-wrap">
                    <video id="dlp-vid" controls playsinline webkit-playsinline crossorigin="anonymous" 
                           preload="auto" x5-video-player-type="h5" x5-video-player-fullscreen="true"
                           x5-video-orientation="landscape|portrait"></video>
                    <div id="dlp-play-overlay">
                        <div id="dlp-play-icon">▶</div>
                    </div>
                    <div id="dlp-loading">
                        <div id="dlp-spinner"></div>
                    </div>
                    <div id="dlp-error">
                        <span>⚠️ Không thể phát video</span>
                        <button id="dlp-retry-btn" class="dlp-btn accent">Thử lại</button>
                    </div>
                </div>
                <div class="dlp-action-row" id="dlp-p-acts"></div>
            </div>

            <div id="dlp-img-prev">
                <button id="dlp-img-close">✕</button>
                <img id="dlp-img-full" src="" alt="Preview">
            </div>

            <div id="dlp-drop"></div>
            <div id="dlp-cmd"></div>
            <div id="dlp-playlist-panel"></div>
            <div id="dlp-sub-panel"></div>
            <div id="dlp-toast"></div>
            <div id="dlp-speed-indicator"></div>
        `);

        initLogic();
    }

    // ══════════════════════════════════════════
    // LOGIC
    // ══════════════════════════════════════════
    function initLogic() {
        const $ = id => document.getElementById(id);
        let cur = null, rot = 0, zoom = 1, speed = 1;
        let ctab = 'ytdlp', currentPanelTab = 'streams';
        let isMuted = settings.muted || false;

        function toast(m, color) {
            const t = $('dlp-toast');
            t.textContent = m;
            t.style.background = color || 'rgba(25, 25, 38, 0.85)';
            t.style.display = 'block';
            clearTimeout(t._t);
            t._t = setTimeout(() => t.style.display = 'none', 2200);
        }

        function cp(text) {
            navigator.clipboard.writeText(text).then(() => {
                toast('✅ Đã copy!', 'rgba(16, 185, 129, 0.85)');
            }).catch(() => {
                const ta = document.createElement('textarea');
                ta.value = text;
                ta.style.cssText = 'position:fixed;left:-9999px';
                document.body.appendChild(ta);
                ta.select();
                document.execCommand('copy');
                document.body.removeChild(ta);
                toast('✅ Đã copy!', 'rgba(16, 185, 129, 0.85)');
            });
        }

        function fname(url) {
            try {
                const p = new URL(url).pathname.split('/').filter(Boolean).pop() || '';
                const n = decodeURIComponent(p.split('?')[0]);
                return n || 'Media';
            } catch(e) { return 'Media'; }
        }

        updateBadge = function() {
            const b = $('dlp-badge');
            if (!b) return;
            const total = mediaUrls.size + imageUrls.size;
            b.style.display = total ? 'flex' : 'none';
            b.textContent = total > 99 ? '99+' : total;
        };

        // ══════════════════════════════════════
        // VIDEO PLAYBACK FIX
        // ══════════════════════════════════════
        function setupVideoPlayback() {
            const vid = $('dlp-vid');
            const overlay = $('dlp-play-overlay');
            const loading = $('dlp-loading');
            const errorDiv = $('dlp-error');
            const muteBtn = $('dlp-btn-mute');

            if (!vid) return;

            // Show loading when source changes
            vid.addEventListener('loadstart', () => {
                loading.classList.add('show');
                errorDiv.classList.remove('show');
            });

            // Hide loading when ready
            vid.addEventListener('canplay', () => {
                loading.classList.remove('show');
                // Auto play with mute bypass
                if (settings.autoplay) {
                    vid.muted = isMuted;
                    vid.play().then(() => {
                        overlay.classList.add('playing');
                        updateMuteIcon();
                    }).catch(() => {
                        // Browser blocked autoplay - show overlay for manual click
                        overlay.classList.remove('playing');
                    });
                }
            });

            vid.addEventListener('playing', () => {
                loading.classList.remove('show');
                overlay.classList.add('playing');
                errorDiv.classList.remove('show');
            });

            vid.addEventListener('waiting', () => {
                loading.classList.add('show');
            });

            vid.addEventListener('error', (e) => {
                loading.classList.remove('show');
                overlay.classList.add('playing');
                errorDiv.classList.add('show');
                console.error('[DLP] Video error:', vid.error);
            });

            vid.addEventListener('pause', () => {
                overlay.classList.remove('playing');
            });

            // Click overlay to play
            overlay.onclick = (e) => {
                e.stopPropagation();
                vid.muted = isMuted;
                vid.play().then(() => {
                    overlay.classList.add('playing');
                    updateMuteIcon();
                }).catch(err => {
                    console.error('[DLP] Play failed:', err);
                    toast('⚠️ Bấm nút play trên video', 'rgba(239, 68, 68, 0.85)');
                });
            };

            // Retry button
            $('dlp-retry-btn').onclick = () => {
                errorDiv.classList.remove('show');
                loading.classList.add('show');
                const currentSrc = vid.src;
                vid.src = '';
                setTimeout(() => {
                    vid.src = currentSrc;
                    vid.load();
                    vid.muted = isMuted;
                    vid.play().catch(() => {});
                }, 100);
            };

            // Mute button
            function updateMuteIcon() {
                if (vid.muted) {
                    muteBtn.textContent = '🔇';
                    muteBtn.style.color = '#ef4444';
                } else {
                    muteBtn.textContent = '🔊';
                    muteBtn.style.color = 'white';
                }
            }

            muteBtn.onclick = () => {
                vid.muted = !vid.muted;
                isMuted = vid.muted;
                settings.muted = isMuted;
                saveData(STORAGE_KEYS.SETTINGS, settings);
                updateMuteIcon();
                toast(isMuted ? '🔇 Muted' : '🔊 Unmuted');
            };
        }

        // ══════════════════════════════════════
        // FULLSCREEN LANDSCAPE
        // ══════════════════════════════════════
        function enterFullscreenLandscape() {
            const vid = $('dlp-vid');
            if (!vid) return () => {};

            const tryLock = () => {
                if (screen.orientation && screen.orientation.lock) {
                    screen.orientation.lock('landscape').catch(() => {});
                }
            };

            const onFsChange = () => {
                const fsEl = document.fullscreenElement || document.webkitFullscreenElement;
                if (!fsEl && screen.orientation && screen.orientation.unlock) {
                    screen.orientation.unlock();
                }
            };

            document.addEventListener('fullscreenchange', onFsChange);
            document.addEventListener('webkitfullscreenchange', onFsChange);

            return () => {
                const req = vid.requestFullscreen || vid.webkitRequestFullscreen;
                if (req) {
                    req.call(vid).then(tryLock).catch(() => {
                        toast('❌ Fullscreen bị chặn', 'rgba(239, 68, 68, 0.85)');
                    });
                }
            };
        }

        const triggerFullscreen = enterFullscreenLandscape();

        // ══════════════════════════════════════
        // SPEED CONTROL
        // ══════════════════════════════════════
        function setPlaybackSpeed(s) {
            const vid = $('dlp-vid');
            speed = s;
            vid.playbackRate = speed;
            const indicator = $('dlp-speed-indicator');
            indicator.textContent = speed + 'x';
            indicator.style.display = 'block';
            clearTimeout(indicator._t);
            indicator._t = setTimeout(() => indicator.style.display = 'none', 1200);
        }

        $('dlp-btn-speed').onclick = () => {
            const speeds = [0.5, 0.75, 1, 1.25, 1.5, 2];
            const idx = speeds.indexOf(speed);
            setPlaybackSpeed(speeds[(idx + 1) % speeds.length]);
        };

        // ══════════════════════════════════════
        // SUBTITLE LOADER
        // ══════════════════════════════════════
        function loadSubtitle(url) {
            const vid = $('dlp-vid');
            vid.querySelectorAll('track').forEach(t => t.remove());

            const track = document.createElement('track');
            track.kind = 'subtitles';
            track.label = 'Custom Sub';
            track.srclang = 'en';
            track.src = url;
            track.default = true;
            vid.appendChild(track);

            if (vid.textTracks[0]) vid.textTracks[0].mode = 'showing';
            toast('✅ Subtitle loaded!');
        }

        function showSubtitleLoader() {
            const panel = $('dlp-sub-panel');
            panel.innerHTML = `
                <h4 style="color:white;margin:0 0 12px;">📝 Load Subtitle</h4>
                <input id="dlp-sub-url" placeholder="Subtitle URL (.vtt/.srt)" 
                       style="width:100%;background:rgba(0,0,0,0.4);border:1px solid rgba(255,255,255,0.15);
                              border-radius:10px;padding:10px;color:white;font-size:12px;outline:none;margin-bottom:10px;">
                <div style="display:flex;gap:8px;">
                    <button id="dlp-sub-load" class="dlp-btn accent" style="flex:1;">Load</button>
                    <button id="dlp-sub-close" class="dlp-btn" style="flex:1;">Close</button>
                </div>
            `;
            panel.classList.add('on');
            $('dlp-sub-load').onclick = () => {
                const url = $('dlp-sub-url').value.trim();
                if (url) loadSubtitle(url);
                panel.classList.remove('on');
            };
            $('dlp-sub-close').onclick = () => panel.classList.remove('on');
        }

        // ══════════════════════════════════════
        // RENDER PANEL
        // ══════════════════════════════════════
        function renderPanel() {
            const renderers = {
                streams: renderStreams,
                images: renderImages,
                playlist: renderPlaylist,
                history: renderHistory,
                bookmarks: renderBookmarks
            };
            (renderers[currentPanelTab] || renderStreams)();
        }

        document.querySelectorAll('.dlp-tab').forEach(tab => {
            tab.onclick = () => {
                document.querySelectorAll('.dlp-tab').forEach(t => t.classList.remove('on'));
                tab.classList.add('on');
                currentPanelTab = tab.dataset.tab;
                renderPanel();
            };
        });

        // ══════════════════════════════════════
        // TAB: STREAMS
        // ══════════════════════════════════════
        function renderStreams() {
            const pb = $('dlp-pb');
            pb.innerHTML = '';
            const items = [...mediaUrls.values()].sort((a,b) => a.priority - b.priority);

            if (!items.length) {
                pb.innerHTML = `<div style="color:rgba(255,255,255,0.4);text-align:center;padding:50px 20px;font-size:13px;">
                    📡 No streams detected<br><span style="font-size:11px;opacity:0.6;">Play video → hit Scan</span></div>`;
                return;
            }

            items.forEach(item => {
                const bc = 'dlp-badge-' + (['M3U8','MP4','IFRAME'].includes(item.type) ? item.type.toLowerCase() : 'other');
                const div = document.createElement('div');
                div.className = 'dlp-li';
                div.innerHTML = `
                    <div class="dlp-li-top">
                        <span class="dlp-li-badge ${bc}">${item.type}</span>
                        <span class="dlp-li-name">${fname(item.url)}</span>
                    </div>
                    <div class="dlp-li-src">📍 ${item.source}</div>
                    <div class="dlp-li-url">${item.url}</div>
                `;
                div.onclick = () => {
                    const it = mediaUrls.get(item.url);
                    if (it && it.type === 'IFRAME') {
                        window.open(it.url, '_blank');
                    } else if (it) {
                        openPrev(it);
                    }
                };
                pb.appendChild(div);
            });
        }

        // ══════════════════════════════════════
        // TAB: IMAGES (GRID + PREVIEW)
        // ══════════════════════════════════════
        function renderImages() {
            const pb = $('dlp-pb');
            pb.innerHTML = '';
            const items = [...imageUrls.values()];

            if (!items.length) {
                pb.innerHTML = `<div style="color:rgba(255,255,255,0.4);text-align:center;padding:50px 20px;font-size:13px;">
                    🖼 No images found<br><span style="font-size:11px;opacity:0.6;">Browse page → hit Scan</span></div>`;
                return;
            }

            const grid = document.createElement('div');
            grid.className = 'dlp-img-grid';

            items.slice(0, 60).forEach(item => {
                const card = document.createElement('div');
                card.className = 'dlp-img-item';
                card.innerHTML = `
                    <img class="dlp-img-thumb" src="${item.url}" loading="lazy" 
                         onerror="this.style.display='none'; this.parentElement.style.display='none'" alt="${item.type}">
                    <span class="dlp-img-badge">${item.type}</span>
                `;
                card.onclick = () => {
                    $('dlp-img-full').src = item.url;
                    $('dlp-img-prev').classList.add('on');
                };
                grid.appendChild(card);
            });

            pb.appendChild(grid);

            if (items.length > 60) {
                pb.insertAdjacentHTML('beforeend', 
                    `<div style="color:rgba(255,255,255,0.3);text-align:center;padding:15px;font-size:11px;">
                        +${items.length - 60} more images</div>`);
            }
        }

        // Image preview close
        $('dlp-img-close').onclick = () => $('dlp-img-prev').classList.remove('on');
        $('dlp-img-prev').onclick = (e) => {
            if (e.target === $('dlp-img-prev')) $('dlp-img-prev').classList.remove('on');
        };

        // ══════════════════════════════════════
        // TAB: PLAYLIST
        // ══════════════════════════════════════
        function renderPlaylist() {
            const pb = $('dlp-pb');
            pb.innerHTML = '';

            if (!playlist.length) {
                pb.innerHTML = `<div style="color:rgba(255,255,255,0.4);text-align:center;padding:40px;font-size:13px;">
                    🎵 Empty playlist<br><span style="font-size:11px;">Add from preview → Playlist button</span></div>`;
                return;
            }

            playlist.forEach((item, idx) => {
                const div = document.createElement('div');
                div.className = 'dlp-li';
                div.innerHTML = `
                    <div class="dlp-li-top">
                        <span style="color:#14b8a6;font-weight:700;">${idx + 1}.</span>
                        <span class="dlp-li-name">${item.name}</span>
                        <button class="dlp-btn" style="font-size:10px;padding:3px 8px;" data-idx="${idx}">✕</button>
                    </div>
                    <div class="dlp-li-url">${item.url}</div>
                `;
                div.querySelector('button').onclick = (e) => {
                    e.stopPropagation();
                    playlist.splice(idx, 1);
                    saveData(STORAGE_KEYS.PLAYLIST, playlist);
                    renderPlaylist();
                };
                div.onclick = () => openPrev({url: item.url, type: item.type});
                pb.appendChild(div);
            });
        }

        // ══════════════════════════════════════
        // TAB: HISTORY
        // ══════════════════════════════════════
        function renderHistory() {
            const pb = $('dlp-pb');
            pb.innerHTML = '';

            if (!history.length) {
                pb.innerHTML = `<div style="color:rgba(255,255,255,0.4);text-align:center;padding:40px;font-size:13px;">🕒 No history</div>`;
                return;
            }

            [...history].reverse().slice(0, 50).forEach(item => {
                const div = document.createElement('div');
                div.className = 'dlp-li';
                div.innerHTML = `
                    <div class="dlp-li-top">
                        <span style="color:#60a5fa;font-size:12px;flex:1;">${item.name}</span>
                        <span style="color:rgba(255,255,255,0.3);font-size:10px;">${new Date(item.ts).toLocaleString()}</span>
                    </div>
                    <div class="dlp-li-url">${item.url}</div>
                `;
                div.onclick = () => openPrev({url: item.url, type: item.type});
                pb.appendChild(div);
            });
        }

        // ══════════════════════════════════════
        // TAB: BOOKMARKS
        // ══════════════════════════════════════
        function renderBookmarks() {
            const pb = $('dlp-pb');
            pb.innerHTML = '';

            if (!bookmarks.length) {
                pb.innerHTML = `<div style="color:rgba(255,255,255,0.4);text-align:center;padding:40px;font-size:13px;">⭐ No bookmarks</div>`;
                return;
            }

            bookmarks.forEach((item, idx) => {
                const div = document.createElement('div');
                div.className = 'dlp-li';
                div.innerHTML = `
                    <div class="dlp-li-top">
                        <span style="color:#fbbf24;">⭐</span>
                        <span style="color:white;font-size:12px;flex:1;">${item.name}</span>
                        <button class="dlp-btn" style="font-size:10px;padding:3px 8px;" data-idx="${idx}">✕</button>
                    </div>
                    <div class="dlp-li-url">${item.url}</div>
                `;
                div.querySelector('button').onclick = (e) => {
                    e.stopPropagation();
                    bookmarks.splice(idx, 1);
                    saveData(STORAGE_KEYS.BOOKMARKS, bookmarks);
                    renderBookmarks();
                };
                div.onclick = () => openPrev({url: item.url, type: item.type});
                pb.appendChild(div);
            });
        }

        // ══════════════════════════════════════
        // OPEN PREVIEW (TOP) - FIXED PLAYBACK
        // ══════════════════════════════════════
        function openPrev(item) {
            cur = item; rot = 0; zoom = 1; speed = 1;
            const vid = $('dlp-vid');
            const overlay = $('dlp-play-overlay');
            const loading = $('dlp-loading');
            const errorDiv = $('dlp-error');

            // Reset states
            vid.style.transform = 'none';
            vid.playbackRate = 1;
            overlay.classList.remove('playing');
            loading.classList.add('show');
            errorDiv.classList.remove('show');
            
            $('dlp-prev-title').textContent = fname(item.url);

            // Set source and load
            vid.src = item.url;
            vid.load();

            // Add to history
            history.push({
                url: item.url,
                name: fname(item.url),
                type: item.type,
                ts: Date.now()
            });
            if (history.length > 100) history = history.slice(-100);
            saveData(STORAGE_KEYS.HISTORY, history);

            // Setup playback after source is set
            setupVideoPlayback();

            // Build action buttons
            $('dlp-p-acts').innerHTML = `
                <button class="dlp-action-btn copy" id="dlp-pc-cp">
                    <span class="dlp-action-icon">📋</span><span class="dlp-action-label">Copy</span>
                </button>
                <button class="dlp-action-btn fs" id="dlp-pc-fs">
                    <span class="dlp-action-icon">⛶</span><span class="dlp-action-label">Full</span>
                </button>
                <button class="dlp-action-btn share" id="dlp-pc-share">
                    <span class="dlp-action-icon">📤</span><span class="dlp-action-label">Share</span>
                </button>
                <button class="dlp-action-btn dl" id="dlp-pc-dl">
                    <span class="dlp-action-icon">💻</span><span class="dlp-action-label">DL</span>
                </button>
                <button class="dlp-action-btn pip" id="dlp-pc-pip">
                    <span class="dlp-action-icon">🖼</span><span class="dlp-action-label">PiP</span>
                </button>
                <button class="dlp-action-btn bm" id="dlp-pc-bm">
                    <span class="dlp-action-icon">⭐</span><span class="dlp-action-label">Save</span>
                </button>
                <button class="dlp-action-btn pl" id="dlp-pc-pl">
                    <span class="dlp-action-icon">🎵</span><span class="dlp-action-label">List</span>
                </button>
                <button class="dlp-action-btn sub" id="dlp-pc-sub">
                    <span class="dlp-action-icon">📝</span><span class="dlp-action-label">Sub</span>
                </button>
                <button class="dlp-action-btn rot" id="dlp-pc-rot">
                    <span class="dlp-action-icon">⟳</span><span class="dlp-action-label">Rot</span>
                </button>
                <button class="dlp-action-btn zm" id="dlp-pc-zm">
                    <span class="dlp-action-icon">🔍</span><span class="dlp-action-label">${zoom}x</span>
                </button>
            `;

            // Bind action buttons
            $('dlp-pc-cp').onclick = () => cp(cur.url);
            $('dlp-pc-fs').onclick = () => triggerFullscreen();
            $('dlp-pc-share').onclick = () => {
                if (navigator.share) {
                    navigator.share({title: fname(cur.url), url: cur.url}).catch(()=>{});
                } else {
                    const shareUrl = `https://wa.me/?text=${encodeURIComponent(cur.url)}`;
                    window.open(shareUrl, '_blank');
                }
            };
            $('dlp-pc-dl').onclick = () => openCmd(cur.url);
            $('dlp-pc-pip').onclick = () => {
                if (document.pictureInPictureElement) {
                    document.exitPictureInPicture();
                } else {
                    vid.requestPictureInPicture().catch(() => toast('PiP not supported'));
                }
            };
            $('dlp-pc-bm').onclick = () => {
                bookmarks.push({url: cur.url, name: fname(cur.url), type: cur.type, ts: Date.now()});
                saveData(STORAGE_KEYS.BOOKMARKS, bookmarks);
                toast('⭐ Bookmarked!');
            };
            $('dlp-pc-pl').onclick = () => {
                playlist.push({url: cur.url, name: fname(cur.url), type: cur.type});
                saveData(STORAGE_KEYS.PLAYLIST, playlist);
                toast('🎵 Added!');
            };
            $('dlp-pc-sub').onclick = () => showSubtitleLoader();
            $('dlp-pc-rot').onclick = () => {
                rot = (rot + 90) % 360;
                vid.style.transform = `rotate(${rot}deg) scale(${zoom})`;
            };
            $('dlp-pc-zm').onclick = function() {
                const lv = [1, 1.25, 1.5, 2, 0.75];
                zoom = lv[(lv.indexOf(zoom) + 1) % lv.length];
                this.querySelector('.dlp-action-label').textContent = zoom + 'x';
                vid.style.transform = `rotate(${rot}deg) scale(${zoom})`;
            };

            $('dlp-prev').classList.add('on');
            $('dlp-bd').classList.add('on');
            $('dlp-panel').classList.remove('on');
        }

        // ══════════════════════════════════════
        // CMD MODAL
        // ══════════════════════════════════════
        function openCmd(url) {
            const build = (t) => {
                ctab = t;
                const data = {
                    ytdlp: [
                        { l:'Best quality', c:`yt-dlp --referer "${REF}" "${url}"` },
                        { l:'Full bypass', c:`yt-dlp --referer "${REF}" --user-agent "${UA}" --add-header "Origin:${location.origin}" -f "bestvideo+bestaudio" "${url}"` },
                        { l:'MP3 only', c:`yt-dlp -x --audio-format mp3 --referer "${REF}" "${url}"` },
                    ],
                    ffmpeg: [
                        { l:'Copy stream', c:`ffmpeg -referer "${REF}" -user_agent "${UA}" -i "${url}" -c copy output.mp4` },
                        { l:'Re-encode H264', c:`ffmpeg -referer "${REF}" -i "${url}" -c:v libx264 -c:a aac output.mp4` },
                    ],
                    termux: [
                        { l:'Install', c:`pkg install python ffmpeg -y && pip install yt-dlp` },
                        { l:'Download', c:`yt-dlp --referer "${REF}" "${url}"` },
                        { l:'FFmpeg HLS', c:`ffmpeg -referer "${REF}" -i "${url}" -c copy ~/storage/downloads/out.mp4` },
                    ],
                }[t] || [];

                $('dlp-cmd').innerHTML = `
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:15px">
                        <h4 style="color:white;margin:0;font-size:16px;">💻 Download</h4>
                        <span style="color:rgba(255,255,255,0.35);font-size:10px;font-family:monospace;max-width:160px;overflow:hidden;text-overflow:ellipsis;">${fname(url)}</span>
                    </div>
                    <div style="display:flex;gap:5px;margin-bottom:15px">
                        ${['ytdlp','ffmpeg','termux'].map(tab => `
                            <button style="flex:1;background:${tab===t?'linear-gradient(135deg,rgba(220,38,38,0.7),rgba(239,68,68,0.6))':'rgba(255,255,255,0.06)'};
                                    color:white;border:1px solid rgba(255,255,255,0.12);padding:9px;border-radius:10px;
                                    cursor:pointer;font-size:11px;font-weight:700;" data-tab="${tab}">${tab.toUpperCase()}</button>
                        `).join('')}
                    </div>
                    ${data.map(d => `
                        <div class="dlp-cmd-block">
                            <div class="dlp-cmd-label">${d.l}</div>
                            <div class="dlp-cmd-row">
                                <textarea class="dlp-cmd-ta" rows="2" readonly>${d.c}</textarea>
                                <button class="dlp-cmd-cp">📋</button>
                            </div>
                        </div>
                    `).join('')}
                    <button style="width:100%;background:rgba(220,38,38,0.5);border:1px solid rgba(255,255,255,0.12);
                            color:white;padding:12px;border-radius:12px;cursor:pointer;font-weight:700;
                            margin-top:4px;" id="dlp-cmd-cls">CLOSE</button>
                `;

                $('dlp-cmd').querySelectorAll('.dlp-cmd-ta').forEach(ta => {
                    ta.style.height = ta.scrollHeight + 'px';
                });
                $('dlp-cmd').querySelectorAll('[data-tab]').forEach(b =>
                    b.onclick = () => build(b.dataset.tab));
                $('dlp-cmd').querySelectorAll('.dlp-cmd-cp').forEach(b =>
                    b.onclick = () => cp(b.parentElement.querySelector('.dlp-cmd-ta').value));
                $('dlp-cmd-cls').onclick = () => $('dlp-cmd').classList.remove('on');
            };
            build(ctab);
            $('dlp-cmd').classList.add('on');
        }

        // ══════════════════════════════════════
        // DROPDOWN
        // ══════════════════════════════════════
        $('dlp-btn-opt').onclick = (e) => {
            e.stopPropagation();
            const d = $('dlp-drop');
            d.innerHTML = `
                <div class="dlp-di" id="dlp-m-qs">🎞 Quality</div>
                <div class="dlp-di" id="dlp-m-fs">⛶ Fullscreen</div>
                <div class="dlp-di" id="dlp-m-share">📤 Share</div>
                <div class="dlp-di" id="dlp-m-pip">🖼 PiP</div>
                <div class="dlp-di" id="dlp-m-speed">⚡ Speed</div>
                <div class="dlp-di" id="dlp-m-new">🌐 Open tab</div>
            `;
            const r = $('dlp-btn-opt').getBoundingClientRect();
            d.style.top = (r.bottom + 8) + 'px';
            d.style.right = '20px';
            d.classList.add('on');

            $('dlp-m-fs').onclick = () => { d.classList.remove('on'); triggerFullscreen(); };
            $('dlp-m-share').onclick = () => { d.classList.remove('on'); 
                if (navigator.share) navigator.share({url: cur.url}); };
            $('dlp-m-pip').onclick = () => { d.classList.remove('on');
                $('dlp-vid').requestPictureInPicture().catch(()=>{}); };
            $('dlp-m-speed').onclick = () => { d.classList.remove('on');
                const speeds = [0.5, 0.75, 1, 1.25, 1.5, 2];
                setPlaybackSpeed(speeds[(speeds.indexOf(speed) + 1) % speeds.length]); };
            $('dlp-m-new').onclick = () => { window.open(cur.url,'_blank'); d.classList.remove('on'); };
            $('dlp-m-qs').onclick = () => {
                d.classList.remove('on');
                if (!cur || cur.type !== 'M3U8') { toast('HLS only'); return; }
                fetch(cur.url).then(r => r.text()).then(text => {
                    const lines = text.split('\n'), qs = [];
                    for (let i = 0; i < lines.length; i++) {
                        if (lines[i].includes('RESOLUTION=')) {
                            const res = lines[i].match(/RESOLUTION=(\d+x\d+)/)?.[1] || '';
                            const bw = lines[i].match(/BANDWIDTH=(\d+)/)?.[1] || '0';
                            const next = (lines[i+1] || '').trim();
                            if (next && !next.startsWith('#')) {
                                qs.push({
                                    label: res.split('x')[1]+'p',
                                    url: next.startsWith('http') ? next : cur.url.substring(0, cur.url.lastIndexOf('/')+1) + next,
                                    bw: parseInt(bw)
                                });
                            }
                        }
                    }
                    qs.sort((a,b) => b.bw - a.bw);
                    d.innerHTML = `<div style="padding:10px 16px;color:rgba(255,255,255,0.4);font-size:11px;font-weight:700;">QUALITY</div>` +
                        qs.map(q => `<div class="dlp-di" data-url="${q.url}">📺 ${q.label}</div>`).join('');
                    d.classList.add('on');
                    d.querySelectorAll('.dlp-di').forEach(qi => qi.onclick = () => {
                        $('dlp-vid').src = qi.dataset.url;
                        $('dlp-vid').load();
                        $('dlp-vid').muted = isMuted;
                        $('dlp-vid').play().catch(()=>{});
                        d.classList.remove('on');
                    });
                });
            };
        };

        // ══════════════════════════════════════
        // FAB & GLOBAL EVENTS
        // ══════════════════════════════════════
        $('dlp-fab').onclick = () => {
            if ($('dlp-panel').classList.contains('on')) {
                $('dlp-panel').classList.remove('on');
                $('dlp-bd').classList.remove('on');
            } else {
                scan(document, 'main');
                scanPerf();
                renderPanel();
                $('dlp-panel').classList.add('on');
                $('dlp-bd').classList.add('on');
            }
        };

        $('dlp-btn-scan').onclick = () => {
            scan(document, 'deep');
            scanPerf();
            renderPanel();
            toast(`✅ ${mediaUrls.size} media + ${imageUrls.size} images`);
        };

        $('dlp-btn-clr').onclick = () => {
            mediaUrls.clear();
            imageUrls.clear();
            updateBadge();
            renderPanel();
            toast('🗑 Cleared');
        };

        $('dlp-btn-cls').onclick = () => {
            const vid = $('dlp-vid');
            vid.pause();
            vid.src = '';
            $('dlp-prev').classList.remove('on');
            $('dlp-bd').classList.remove('on');
            if (screen.orientation && screen.orientation.unlock) screen.orientation.unlock();
        };

        $('dlp-bd').onclick = () => {
            const vid = $('dlp-vid');
            vid.pause();
            ['dlp-cmd','dlp-panel','dlp-prev'].forEach(id => $(id).classList.remove('on'));
            $('dlp-drop').classList.remove('on');
            $('dlp-bd').classList.remove('on');
            if (screen.orientation && screen.orientation.unlock) screen.orientation.unlock();
        };

        document.addEventListener('click', (e) => {
            const d = $('dlp-drop');
            if (d.classList.contains('on') && !d.contains(e.target) && e.target.id !== 'dlp-btn-opt') {
                d.classList.remove('on');
            }
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (!$('dlp-prev').classList.contains('on')) return;
            const vid = $('dlp-vid');
            switch(e.key) {
                case 'f': triggerFullscreen(); break;
                case 'ArrowRight': vid.currentTime += 10; break;
                case 'ArrowLeft': vid.currentTime -= 10; break;
                case ' ': e.preventDefault(); vid.paused ? vid.play().catch(()=>{}) : vid.pause(); break;
                case 'm': vid.muted = !vid.muted; isMuted = vid.muted; break;
            }
        });

        // Initial video setup
        setupVideoPlayback();
    }

    // ══════════════════════════════════════════
    // AUTO START
    // ══════════════════════════════════════════
    setInterval(scanPerf, 4000);

    setTimeout(() => {
        scan(document, 'auto');
        updateBadge();
    }, 2500);

    if (document.body) initUI();
    else document.addEventListener('DOMContentLoaded', initUI);
})();