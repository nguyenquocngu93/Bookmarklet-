// ==UserScript==
// @name         DevLib CDN Player - Material Design v6
// @namespace    http://tampermonkey.net/
// @version      6.0
// @description  Material Design bright UI + all features
// @author       You
// @match        *://*/*
// @grant        none
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
        PLAYLIST: 'dlp_playlist'
    };

    function loadData(key) {
        try { return JSON.parse(localStorage.getItem(key) || '[]'); }
        catch(e) { return []; }
    }
    function saveData(key, data) {
        localStorage.setItem(key, JSON.stringify(data));
    }

    let history = loadData(STORAGE_KEYS.HISTORY);
    let bookmarks = loadData(STORAGE_KEYS.BOOKMARKS);
    let playlist = loadData(STORAGE_KEYS.PLAYLIST);

    const REF = location.href;
    const UA = navigator.userAgent;

    function getPageTitle() {
        let title = document.title || '';
        title = title.replace(/\s*[-|–—]\s*/g, ' - ').trim();
        if (title.length > 80) title = title.substring(0, 77) + '...';
        if (!title) {
            try { title = new URL(REF).hostname; }
            catch(e) { title = 'Unknown Site'; }
        }
        return title;
    }

    // ══════════════════════════════════════════
    // FILTER
    // ══════════════════════════════════════════
    const AD_PATTERNS = [
        /doubleclick/i, /googlesyndication/i, /googlead/i, /adnxs/i,
        /snaptrckr/i, /mayzaent/i, /popunder/i, /popcash/i, /propeller/i,
        /exoclick/i, /juicyads/i, /trafficjunky/i, /adsterra/i, /hilltop/i,
        /clickadu/i, /realsrv/i, /adspyglass/i, /smartpop/i, /megapu\.sh/i,
        /tracking/i, /pixel\./i, /beacon/i, /telemetry/i, /fingerprint/i,
        /analytics\./i, /metrics/i, /stats\./i, /impression/i, /collect/i,
        /\/ads?\//i, /\/banner/i, /\/sponsor/i, /\/promo/i, /\/campaign/i,
    ];

    const IMAGE_EXTENSIONS = /\.(jpg|jpeg|png|gif|webp|svg|bmp|ico|avif)(\?|$)/i;

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
    ];

    const imagePatterns = [
        { re: /https?:\/\/[^\s"'<>()\\\]]+\.(jpg|jpeg)(\?[^\s"'<>()\\\]]*)?/gi, type: 'JPEG' },
        { re: /https?:\/\/[^\s"'<>()\\\]]+\.png(\?[^\s"'<>()\\\]]*)?/gi, type: 'PNG' },
        { re: /https?:\/\/[^\s"'<>()\\\]]+\.gif(\?[^\s"'<>()\\\]]*)?/gi, type: 'GIF' },
        { re: /https?:\/\/[^\s"'<>()\\\]]+\.webp(\?[^\s"'<>()\\\]]*)?/gi, type: 'WEBP' },
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
            });
            doc.querySelectorAll('iframe').forEach(f => {
                if (f.src && !isAdOrTracker(f.src)) addMediaUrl(f.src, 'IFRAME', src+':if', 99);
            });
            doc.querySelectorAll('script:not([src])').forEach(s => {
                findUrls(s.textContent, src+':js');
            });
            findUrls(doc.documentElement.outerHTML, src+':html');
        } catch(e) {}
    }

    const _fetch = window.fetch;
    const _xhrOpen = XMLHttpRequest.prototype.open;

    window.fetch = function(...a) {
        try {
            const u = typeof a[0]==='string' ? a[0] : (a[0] && a[0].url) || '';
            if (u && !isAdOrTracker(u)) {
                if (IMAGE_EXTENSIONS.test(u)) addImageUrl(u, 'FETCH', 'fetch');
                else findUrls(u, 'fetch');
            }
        } catch(e) {}
        return _fetch.apply(this, a);
    };

    XMLHttpRequest.prototype.open = function(m, u) {
        try {
            if (u && !isAdOrTracker(u)) {
                const su = String(u);
                if (IMAGE_EXTENSIONS.test(su)) addImageUrl(su, 'XHR', 'xhr');
                else findUrls(su, 'xhr');
            }
        } catch(e) {}
        return _xhrOpen.apply(this, arguments);
    };

    function scanPerf() {
        try {
            performance.getEntriesByType('resource').forEach(e => {
                if (e.name && !isAdOrTracker(e.name)) {
                    if (IMAGE_EXTENSIONS.test(e.name)) addImageUrl(e.name, 'PERF', 'perf');
                    else findUrls(e.name, 'perf');
                }
            });
        } catch(e) {}
    }

    let updateBadge = () => {};

    // ══════════════════════════════════════════
    // MATERIAL DESIGN CSS - SÁNG
    // ══════════════════════════════════════════
    const CSS = `
        @import url('https://fonts.googleapis.com/css2?family=Google+Sans:wght@400;500;700&family=Roboto:wght@300;400;500;700&display=swap');

        :root {
            --bg: #ffffff;
            --surface: #f8f9fa;
            --surface2: #f1f3f4;
            --border: #dadce0;
            --text: #202124;
            --text2: #5f6368;
            --text3: #80868b;
            --primary: #1a73e8;
            --primary-hover: #1557b0;
            --red: #ea4335;
            --green: #34a853;
            --amber: #f9ab00;
            --purple: #9334e6;
            --teal: #009688;
            --pink: #e91e63;
            --shadow: 0 1px 3px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.08);
            --shadow-lg: 0 4px 16px rgba(0,0,0,0.16);
            --radius: 12px;
            --radius-sm: 8px;
            --radius-full: 50px;
        }

        * { box-sizing: border-box; }

        #dlp-fab {
            position: fixed;
            top: 24px;
            right: 24px;
            width: 56px;
            height: 56px;
            background: var(--primary);
            border: none;
            border-radius: 50%;
            cursor: pointer;
            z-index: 2147483647;
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: 0 4px 16px rgba(26,115,232,0.4);
            transition: all 0.3s cubic-bezier(0.4,0,0.2,1);
            animation: float 3s ease-in-out infinite;
        }
        #dlp-fab:hover {
            transform: scale(1.08) translateY(-4px);
            box-shadow: 0 8px 24px rgba(26,115,232,0.5);
            background: #1669d0;
        }
        #dlp-fab:active { transform: scale(0.94); }

        @keyframes float {
            0%, 100% { transform: translateY(0); }
            50% { transform: translateY(-6px); }
        }

        #dlp-fab-icon { font-size: 26px; color: white; }
        #dlp-badge {
            position: absolute;
            top: -2px;
            right: -2px;
            background: var(--red);
            color: white;
            font-size: 11px;
            min-width: 24px;
            height: 24px;
            border-radius: 12px;
            display: none;
            align-items: center;
            justify-content: center;
            font-weight: 700;
            border: 3px solid white;
            font-family: 'Google Sans', sans-serif;
        }

        #dlp-bd {
            position: fixed;
            inset: 0;
            background: rgba(0,0,0,0.5);
            z-index: 2147483639;
            display: none;
        }
        #dlp-bd.on { display: block; }

        #dlp-panel {
            position: fixed;
            top: 20px;
            right: 20px;
            width: calc(100vw - 40px);
            max-width: 420px;
            max-height: 65vh;
            background: var(--bg);
            border-radius: var(--radius);
            z-index: 2147483647;
            display: none;
            flex-direction: column;
            box-shadow: var(--shadow-lg);
            overflow: hidden;
            font-family: 'Google Sans', 'Roboto', sans-serif;
            border: 1px solid var(--border);
        }
        #dlp-panel.on { display: flex; }

        #dlp-ph {
            background: var(--surface);
            padding: 16px 18px;
            display: flex;
            align-items: center;
            gap: 10px;
            border-bottom: 1px solid var(--border);
            flex-shrink: 0;
        }
        #dlp-ph-title { color: var(--text); font-size: 16px; font-weight: 700; flex: 1; }

        .dlp-btn {
            border: 1px solid var(--border);
            border-radius: var(--radius-full);
            cursor: pointer;
            font-size: 13px;
            font-weight: 500;
            padding: 8px 18px;
            color: var(--text);
            background: var(--bg);
            transition: all 0.2s;
            font-family: 'Google Sans', sans-serif;
        }
        .dlp-btn:hover { background: var(--surface2); }
        .dlp-btn.primary {
            background: var(--primary);
            color: white;
            border: none;
            font-weight: 500;
        }
        .dlp-btn.primary:hover { background: var(--primary-hover); }

        #dlp-tabs {
            display: flex;
            background: var(--bg);
            border-bottom: 1px solid var(--border);
            flex-shrink: 0;
            overflow-x: auto;
        }
        .dlp-tab {
            flex: 1;
            padding: 13px 12px;
            border: none;
            background: none;
            color: var(--text2);
            font-size: 12px;
            font-weight: 500;
            cursor: pointer;
            border-bottom: 3px solid transparent;
            white-space: nowrap;
            transition: all 0.2s;
            font-family: 'Google Sans', sans-serif;
        }
        .dlp-tab.on {
            color: var(--primary);
            border-bottom-color: var(--primary);
        }

        #dlp-pb { overflow-y: auto; flex: 1; background: var(--bg); }

        .dlp-li {
            padding: 14px 16px;
            border-bottom: 1px solid var(--border);
            cursor: pointer;
            transition: background 0.15s;
        }
        .dlp-li:hover { background: var(--surface); }
        .dlp-li-top { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
        .dlp-li-badge {
            font-size: 10px;
            font-weight: 700;
            padding: 3px 8px;
            border-radius: var(--radius-sm);
            color: white;
            text-transform: uppercase;
            letter-spacing: 0.3px;
        }
        .dlp-badge-m3u8 { background: var(--purple); }
        .dlp-badge-mp4 { background: var(--green); }
        .dlp-badge-mkv { background: var(--amber); color: #202124; }
        .dlp-badge-iframe { background: var(--primary); }
        .dlp-badge-other { background: var(--text3); }
        .dlp-li-name { color: var(--text); font-size: 14px; font-weight: 500; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .dlp-li-src { color: var(--text3); font-size: 11px; margin-bottom: 5px; }
        .dlp-li-url {
            color: var(--primary);
            font-size: 11px;
            font-family: 'Roboto Mono', monospace;
            word-break: break-all;
            background: var(--surface);
            padding: 8px 10px;
            border-radius: var(--radius-sm);
            line-height: 1.5;
            border: 1px solid var(--border);
        }

        .dlp-img-grid {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 8px;
            padding: 12px;
        }
        .dlp-img-item {
            aspect-ratio: 1;
            border-radius: var(--radius-sm);
            overflow: hidden;
            cursor: pointer;
            background: var(--surface2);
            border: 1px solid var(--border);
            transition: all 0.2s;
            position: relative;
        }
        .dlp-img-item:hover {
            transform: scale(1.04);
            box-shadow: var(--shadow-lg);
            z-index: 1;
        }
        .dlp-img-thumb { width: 100%; height: 100%; object-fit: cover; }
        .dlp-img-badge {
            position: absolute;
            bottom: 4px;
            right: 4px;
            font-size: 8px;
            padding: 2px 6px;
            border-radius: 4px;
            background: rgba(0,0,0,0.7);
            color: white;
            font-family: 'Google Sans', sans-serif;
            font-weight: 500;
        }

        #dlp-img-prev {
            position: fixed;
            inset: 0;
            z-index: 2147483648;
            background: rgba(0,0,0,0.9);
            display: none;
            align-items: center;
            justify-content: center;
        }
        #dlp-img-prev.on { display: flex; }
        #dlp-img-prev img { max-width: 95vw; max-height: 90vh; object-fit: contain; border-radius: 4px; }
        #dlp-img-close {
            position: absolute;
            top: 16px;
            right: 16px;
            width: 40px;
            height: 40px;
            border-radius: 50%;
            background: white;
            border: none;
            color: var(--text);
            font-size: 20px;
            cursor: pointer;
            font-family: 'Google Sans', sans-serif;
            box-shadow: var(--shadow);
        }

        /* ── PLAYER ── */
        #dlp-prev {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            background: var(--bg);
            z-index: 2147483647;
            display: none;
            flex-direction: column;
            border-radius: 0 0 20px 20px;
            box-shadow: var(--shadow-lg);
            font-family: 'Google Sans', 'Roboto', sans-serif;
            border-bottom: 1px solid var(--border);
        }
        #dlp-prev.on { display: flex; }

        #dlp-prev-bar {
            display: flex;
            align-items: center;
            padding: 12px 16px;
            gap: 8px;
            border-bottom: 1px solid var(--border);
            flex-shrink: 0;
            background: var(--surface);
        }
        #dlp-prev-info { flex: 1; min-width: 0; }
        #dlp-prev-title {
            color: var(--text);
            font-size: 14px;
            font-weight: 500;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
        #dlp-prev-site {
            color: var(--text2);
            font-size: 11px;
            margin-top: 2px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
        .dlp-icon-btn {
            width: 36px;
            height: 36px;
            border-radius: 50%;
            border: none;
            background: var(--bg);
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            color: var(--text2);
            font-size: 18px;
            transition: all 0.2s;
            flex-shrink: 0;
            font-family: 'Google Sans', sans-serif;
        }
        .dlp-icon-btn:hover { background: var(--surface2); color: var(--text); }

        #dlp-vid-wrap { 
            background: #000; 
            width: 100%; 
            height: 230px; 
            display: flex; 
            align-items: center; 
            justify-content: center; 
            flex-shrink: 0;
        }
        #dlp-vid { width: 100%; height: 100%; object-fit: contain; }

        /* ── ACTION BAR ── */
        .dlp-action-bar {
            display: flex;
            gap: 8px;
            padding: 12px 16px;
            background: var(--bg);
            align-items: center;
            flex-shrink: 0;
            overflow-x: auto;
            border-top: 1px solid var(--border);
        }
        .dlp-action-bar::-webkit-scrollbar { height: 3px; }
        .dlp-action-bar::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }
        
        .dlp-act {
            padding: 10px 20px;
            border: 1px solid var(--border);
            border-radius: var(--radius-full);
            cursor: pointer;
            font-size: 13px;
            font-weight: 500;
            color: var(--text);
            background: var(--bg);
            text-align: center;
            transition: all 0.2s;
            white-space: nowrap;
            flex-shrink: 0;
            font-family: 'Google Sans', sans-serif;
        }
        .dlp-act:hover { background: var(--surface); box-shadow: var(--shadow); }
        .dlp-act:active { background: var(--surface2); }
        .dlp-act.primary {
            background: var(--primary);
            color: white;
            border: none;
            font-weight: 500;
        }
        .dlp-act.primary:hover { background: var(--primary-hover); }
        .dlp-act.share {
            background: var(--green);
            color: white;
            border: none;
        }
        .dlp-act.share:hover { background: #2d9249; }

        #dlp-drop {
            position: fixed;
            background: var(--bg);
            border-radius: var(--radius);
            border: 1px solid var(--border);
            z-index: 2147483647;
            display: none;
            box-shadow: var(--shadow-lg);
            overflow: hidden;
            min-width: 240px;
            max-height: 60vh;
            overflow-y: auto;
            font-family: 'Google Sans', sans-serif;
        }
        #dlp-drop.on { display: block; }
        #dlp-drop::-webkit-scrollbar { width: 4px; }
        #dlp-drop::-webkit-scrollbar-thumb { background: var(--border); border-radius: 4px; }
        
        .dlp-di {
            padding: 14px 18px;
            color: var(--text);
            font-size: 13px;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 10px;
            border-bottom: 1px solid var(--border);
            transition: background 0.15s;
        }
        .dlp-di:hover { background: var(--surface); }
        .dlp-di.danger { color: var(--red); }

        #dlp-cmd {
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: var(--bg);
            border-radius: var(--radius);
            z-index: 2147483647;
            width: 94%;
            max-width: 500px;
            padding: 22px;
            display: none;
            box-shadow: var(--shadow-lg);
            font-family: 'Google Sans', sans-serif;
            border: 1px solid var(--border);
            max-height: 80vh;
            overflow-y: auto;
        }
        #dlp-cmd.on { display: block; }
        .dlp-cmd-block {
            background: var(--surface);
            border-radius: var(--radius-sm);
            padding: 14px;
            margin-bottom: 10px;
            border: 1px solid var(--border);
        }
        .dlp-cmd-label { color: var(--text2); font-size: 10px; font-weight: 700; text-transform: uppercase; margin-bottom: 8px; letter-spacing: 0.5px; }
        .dlp-cmd-row { display: flex; gap: 8px; }
        .dlp-cmd-ta {
            flex: 1;
            background: var(--bg);
            color: var(--text);
            border: 1px solid var(--border);
            border-radius: var(--radius-sm);
            padding: 8px 10px;
            font-family: 'Roboto Mono', monospace;
            font-size: 12px;
            resize: none;
            outline: none;
            min-height: 36px;
        }
        .dlp-cmd-cp {
            background: var(--primary);
            border: none;
            color: white;
            border-radius: var(--radius-sm);
            padding: 0 14px;
            cursor: pointer;
            font-size: 16px;
            flex-shrink: 0;
        }
        .dlp-cmd-cp:hover { background: var(--primary-hover); }

        #dlp-toast {
            position: fixed;
            top: 24px;
            left: 50%;
            transform: translateX(-50%);
            background: var(--text);
            color: white;
            padding: 12px 24px;
            border-radius: var(--radius-full);
            font-size: 13px;
            font-weight: 500;
            z-index: 2147483647;
            display: none;
            box-shadow: var(--shadow-lg);
            font-family: 'Google Sans', sans-serif;
        }

        #dlp-sub-panel {
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: var(--bg);
            border-radius: var(--radius);
            z-index: 2147483647;
            padding: 20px;
            display: none;
            box-shadow: var(--shadow-lg);
            font-family: 'Google Sans', sans-serif;
            border: 1px solid var(--border);
            width: 90%;
            max-width: 400px;
        }
        #dlp-sub-panel.on { display: block; }
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
                    <span id="dlp-ph-title">Media Hub</span>
                    <div id="dlp-ph-acts">
                        <button class="dlp-btn primary" id="dlp-btn-scan">Scan</button>
                        <button class="dlp-btn" id="dlp-btn-clr">Clear</button>
                    </div>
                </div>
                <div id="dlp-tabs">
                    <button class="dlp-tab on" data-tab="streams">Streams</button>
                    <button class="dlp-tab" data-tab="images">Images</button>
                    <button class="dlp-tab" data-tab="playlist">Playlist</button>
                    <button class="dlp-tab" data-tab="history">History</button>
                    <button class="dlp-tab" data-tab="bookmarks">Saved</button>
                </div>
                <div id="dlp-pb"></div>
            </div>

            <div id="dlp-prev">
                <div id="dlp-prev-bar">
                    <div id="dlp-prev-info">
                        <div id="dlp-prev-title">-</div>
                        <div id="dlp-prev-site"></div>
                    </div>
                    <button class="dlp-icon-btn" id="dlp-btn-cls" title="Close">✕</button>
                </div>
                <div id="dlp-vid-wrap">
                    <video id="dlp-vid" controls playsinline webkit-playsinline></video>
                </div>
                <div class="dlp-action-bar" id="dlp-p-acts">
                    <button class="dlp-act primary" id="dlp-pc-fs">Fullscreen</button>
                    <button class="dlp-act share" id="dlp-pc-share">Share</button>
                    <button class="dlp-act" id="dlp-pc-pip">PiP</button>
                    <button class="dlp-act" id="dlp-pc-menu">More ▾</button>
                </div>
            </div>

            <div id="dlp-img-prev">
                <button id="dlp-img-close">✕</button>
                <img id="dlp-img-full" src="" alt="Preview">
            </div>

            <div id="dlp-drop"></div>
            <div id="dlp-cmd"></div>
            <div id="dlp-sub-panel"></div>
            <div id="dlp-toast"></div>
        `);

        initLogic();
    }

    // ══════════════════════════════════════════
    // LOGIC
    // ══════════════════════════════════════════
    function initLogic() {
        const $ = id => document.getElementById(id);
        let cur = null, rot = 0, zoom = 1;
        let ctab = 'ytdlp', currentPanelTab = 'streams';
        let currentPageTitle = '';

        function toast(m, color) {
            const t = $('dlp-toast');
            t.textContent = m;
            t.style.background = color || '#202124';
            t.style.display = 'block';
            clearTimeout(t._t);
            t._t = setTimeout(() => t.style.display = 'none', 2000);
        }

        function cp(text) {
            navigator.clipboard.writeText(text).then(() => {
                toast('Copied!', '#34a853');
            }).catch(() => {
                const ta = document.createElement('textarea');
                ta.value = text;
                ta.style.cssText = 'position:fixed;left:-9999px';
                document.body.appendChild(ta);
                ta.select();
                document.execCommand('copy');
                document.body.removeChild(ta);
                toast('Copied!', '#34a853');
            });
        }

        function fname(url) {
            try {
                const p = new URL(url).pathname.split('/').filter(Boolean).pop() || '';
                return decodeURIComponent(p.split('?')[0]) || 'Media';
            } catch(e) { return 'Media'; }
        }

        updateBadge = function() {
            const b = $('dlp-badge');
            if (!b) return;
            const total = mediaUrls.size + imageUrls.size;
            b.style.display = total ? 'flex' : 'none';
            b.textContent = total > 99 ? '99+' : total;
        };

        function closeAllDropdowns() {
            $('dlp-drop').classList.remove('on');
            $('dlp-sub-panel').classList.remove('on');
            $('dlp-cmd').classList.remove('on');
        }

        // ══════════════════════════════════════
        // FULLSCREEN
        // ══════════════════════════════════════
        function triggerFullscreen() {
            const vid = $('dlp-vid');
            if (!vid) return;
            const req = vid.requestFullscreen || vid.webkitRequestFullscreen || vid.mozRequestFullScreen;
            if (req) {
                req.call(vid).then(() => {
                    setTimeout(() => {
                        if (screen.orientation && screen.orientation.lock) {
                            screen.orientation.lock('landscape').catch(() => {});
                        }
                    }, 300);
                }).catch(() => toast('Fullscreen blocked', '#ea4335'));
            }
        }

        document.addEventListener('fullscreenchange', () => {
            if (!document.fullscreenElement && screen.orientation && screen.orientation.unlock) {
                screen.orientation.unlock();
            }
        });

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

        function renderStreams() {
            const pb = $('dlp-pb');
            pb.innerHTML = '';
            const items = [...mediaUrls.values()].sort((a,b) => a.priority - b.priority);
            if (!items.length) {
                pb.innerHTML = `<div style="color:var(--text3);text-align:center;padding:40px;font-size:13px;">No streams found</div>`;
                return;
            }
            items.forEach(item => {
                const bc = 'dlp-badge-' + (['M3U8','MP4','IFRAME','MKV'].includes(item.type) ? item.type.toLowerCase() : 'other');
                const div = document.createElement('div');
                div.className = 'dlp-li';
                div.innerHTML = `
                    <div class="dlp-li-top">
                        <span class="dlp-li-badge ${bc}">${item.type}</span>
                        <span class="dlp-li-name">${fname(item.url)}</span>
                    </div>
                    <div class="dlp-li-src">${item.source}</div>
                    <div class="dlp-li-url">${item.url}</div>
                `;
                div.onclick = () => {
                    const it = mediaUrls.get(item.url);
                    if (it && it.type === 'IFRAME') window.open(it.url, '_blank');
                    else if (it) openPrev(it);
                };
                pb.appendChild(div);
            });
        }

        function renderImages() {
            const pb = $('dlp-pb');
            pb.innerHTML = '';
            const items = [...imageUrls.values()];
            if (!items.length) {
                pb.innerHTML = `<div style="color:var(--text3);text-align:center;padding:40px;">No images found</div>`;
                return;
            }
            const grid = document.createElement('div');
            grid.className = 'dlp-img-grid';
            items.slice(0, 60).forEach(item => {
                const card = document.createElement('div');
                card.className = 'dlp-img-item';
                card.innerHTML = `<img class="dlp-img-thumb" src="${item.url}" loading="lazy" onerror="this.parentElement.style.display='none'" alt="${item.type}"><span class="dlp-img-badge">${item.type}</span>`;
                card.onclick = () => {
                    $('dlp-img-full').src = item.url;
                    $('dlp-img-prev').classList.add('on');
                };
                grid.appendChild(card);
            });
            pb.appendChild(grid);
        }

        $('dlp-img-close').onclick = () => $('dlp-img-prev').classList.remove('on');
        $('dlp-img-prev').onclick = (e) => { if (e.target === $('dlp-img-prev')) $('dlp-img-prev').classList.remove('on'); };

        function renderPlaylist() {
            const pb = $('dlp-pb');
            pb.innerHTML = '';
            if (!playlist.length) {
                pb.innerHTML = `<div style="color:var(--text3);text-align:center;padding:40px;">Empty playlist</div>`;
                return;
            }
            playlist.forEach((item, idx) => {
                const div = document.createElement('div');
                div.className = 'dlp-li';
                div.innerHTML = `
                    <div class="dlp-li-top">
                        <span style="color:var(--teal);font-weight:700;">${idx + 1}.</span>
                        <span class="dlp-li-name">${item.name}</span>
                        <button class="dlp-btn" style="font-size:11px;padding:4px 10px;">Del</button>
                    </div>
                    <div class="dlp-li-url">${item.url}</div>`;
                div.querySelector('button').onclick = (e) => { e.stopPropagation(); playlist.splice(idx, 1); saveData(STORAGE_KEYS.PLAYLIST, playlist); renderPlaylist(); };
                div.onclick = () => openPrev({url: item.url, type: item.type});
                pb.appendChild(div);
            });
        }

        function renderHistory() {
            const pb = $('dlp-pb');
            pb.innerHTML = '';
            if (!history.length) {
                pb.innerHTML = `<div style="color:var(--text3);text-align:center;padding:40px;">No history</div>`;
                return;
            }
            [...history].reverse().slice(0, 50).forEach(item => {
                const div = document.createElement('div');
                div.className = 'dlp-li';
                div.innerHTML = `
                    <div class="dlp-li-top">
                        <span style="color:var(--primary);font-size:12px;flex:1;">${item.name}</span>
                        <span style="color:var(--text3);font-size:10px;">${new Date(item.ts).toLocaleString()}</span>
                    </div>
                    <div class="dlp-li-url">${item.url}</div>`;
                div.onclick = () => openPrev({url: item.url, type: item.type});
                pb.appendChild(div);
            });
        }

        function renderBookmarks() {
            const pb = $('dlp-pb');
            pb.innerHTML = '';
            if (!bookmarks.length) {
                pb.innerHTML = `<div style="color:var(--text3);text-align:center;padding:40px;">No bookmarks</div>`;
                return;
            }
            bookmarks.forEach((item, idx) => {
                const div = document.createElement('div');
                div.className = 'dlp-li';
                div.innerHTML = `
                    <div class="dlp-li-top">
                        <span style="color:var(--amber);">★</span>
                        <span style="color:var(--text);font-size:12px;flex:1;">${item.name}</span>
                        <button class="dlp-btn" style="font-size:11px;padding:4px 10px;">Del</button>
                    </div>
                    <div class="dlp-li-url">${item.url}</div>`;
                div.querySelector('button').onclick = (e) => { e.stopPropagation(); bookmarks.splice(idx, 1); saveData(STORAGE_KEYS.BOOKMARKS, bookmarks); renderBookmarks(); };
                div.onclick = () => openPrev({url: item.url, type: item.type});
                pb.appendChild(div);
            });
        }

        // ══════════════════════════════════════
        // OPEN PREVIEW
        // ══════════════════════════════════════
        function openPrev(item) {
            cur = item; rot = 0; zoom = 1;
            const vid = $('dlp-vid');
            vid.style.transform = 'none';
            currentPageTitle = getPageTitle();
            $('dlp-prev-title').textContent = fname(item.url);
            $('dlp-prev-site').textContent = currentPageTitle;
            vid.src = item.url;
            
            // Đảm bảo video phát
            vid.load();
            vid.play().catch(() => {});

            history.push({url: item.url, name: fname(item.url), type: item.type, site: currentPageTitle, ts: Date.now()});
            if (history.length > 100) history = history.slice(-100);
            saveData(STORAGE_KEYS.HISTORY, history);

            $('dlp-pc-fs').onclick = () => triggerFullscreen();
            $('dlp-pc-share').onclick = () => {
                if (navigator.share) {
                    navigator.share({title: fname(cur.url), url: cur.url}).catch(()=>{});
                } else {
                    window.open(`https://wa.me/?text=${encodeURIComponent(cur.url)}`, '_blank');
                }
                toast('Shared!');
            };
            $('dlp-pc-pip').onclick = () => {
                if (document.pictureInPictureElement) document.exitPictureInPicture();
                else vid.requestPictureInPicture().catch(() => toast('PiP not supported'));
            };
            $('dlp-pc-menu').onclick = (e) => { e.stopPropagation(); showMenu(e); };

            $('dlp-prev').classList.add('on');
            $('dlp-bd').classList.add('on');
            closeAllDropdowns();
        }

        // ══════════════════════════════════════
        // MENU
        // ══════════════════════════════════════
        function showMenu(e) {
            const d = $('dlp-drop');
            if (d.classList.contains('on')) { d.classList.remove('on'); return; }
            
            d.innerHTML = `
                <div class="dlp-di" id="dlp-m-cp">Copy URL</div>
                <div class="dlp-di" id="dlp-m-dl">Download CMD</div>
                <div class="dlp-di" id="dlp-m-bm">Save Bookmark</div>
                <div class="dlp-di" id="dlp-m-pl">Add to Playlist</div>
                <div class="dlp-di" id="dlp-m-sub">Load Subtitle</div>
                <div class="dlp-di" id="dlp-m-rot">Rotate Video</div>
                <div class="dlp-di" id="dlp-m-zm">Zoom (${zoom}x)</div>
                <div class="dlp-di" id="dlp-m-qs">Quality (HLS)</div>
                <div class="dlp-di" id="dlp-m-new">Open in Tab</div>
                <div class="dlp-di danger" id="dlp-m-close">Close Player</div>
            `;
            
            const btn = $('dlp-pc-menu');
            const r = btn.getBoundingClientRect();
            const spaceBelow = window.innerHeight - r.bottom;
            if (spaceBelow > 350) {
                d.style.top = (r.bottom + 5) + 'px'; d.style.bottom = 'auto';
            } else {
                d.style.bottom = (window.innerHeight - r.top + 5) + 'px'; d.style.top = 'auto';
            }
            d.style.right = '12px'; d.style.left = 'auto'; d.style.maxWidth = '260px';
            d.classList.add('on');

            const closeAndExec = (fn) => { d.classList.remove('on'); if (fn) fn(); };

            $('dlp-m-cp').onclick = () => closeAndExec(() => cp(cur.url));
            $('dlp-m-dl').onclick = () => closeAndExec(() => openCmd(cur.url));
            $('dlp-m-bm').onclick = () => closeAndExec(() => {
                bookmarks.push({url: cur.url, name: fname(cur.url), type: cur.type, ts: Date.now()});
                saveData(STORAGE_KEYS.BOOKMARKS, bookmarks); toast('Saved!');
            });
            $('dlp-m-pl').onclick = () => closeAndExec(() => {
                playlist.push({url: cur.url, name: fname(cur.url), type: cur.type});
                saveData(STORAGE_KEYS.PLAYLIST, playlist); toast('Added!');
            });
            $('dlp-m-sub').onclick = () => closeAndExec(() => showSubtitleLoader());
            $('dlp-m-rot').onclick = () => closeAndExec(() => {
                rot = (rot + 90) % 360;
                $('dlp-vid').style.transform = `rotate(${rot}deg) scale(${zoom})`;
            });
            $('dlp-m-zm').onclick = () => closeAndExec(() => {
                const lv = [1, 1.25, 1.5, 2, 0.75];
                zoom = lv[(lv.indexOf(zoom) + 1) % lv.length];
                $('dlp-vid').style.transform = `rotate(${rot}deg) scale(${zoom})`;
            });
            $('dlp-m-qs').onclick = () => {
                if (!cur || cur.type !== 'M3U8') { d.classList.remove('on'); toast('HLS only'); return; }
                fetch(cur.url).then(r => r.text()).then(text => {
                    const lines = text.split('\n'), qs = [];
                    for (let i = 0; i < lines.length; i++) {
                        if (lines[i].includes('RESOLUTION=')) {
                            const res = lines[i].match(/RESOLUTION=(\d+x\d+)/)?.[1] || '';
                            const next = (lines[i+1] || '').trim();
                            if (next && !next.startsWith('#')) qs.push({label: res.split('x')[1]+'p', url: next.startsWith('http') ? next : cur.url.substring(0, cur.url.lastIndexOf('/')+1) + next});
                        }
                    }
                    d.innerHTML = `<div style="padding:12px 16px;color:var(--text2);font-size:12px;font-weight:500;">Quality</div>` + qs.map(q => `<div class="dlp-di" data-url="${q.url}">${q.label}</div>`).join('');
                    d.querySelectorAll('.dlp-di').forEach(qi => qi.onclick = () => { $('dlp-vid').src = qi.dataset.url; d.classList.remove('on'); });
                });
            };
            $('dlp-m-new').onclick = () => closeAndExec(() => window.open(cur.url, '_blank'));
            $('dlp-m-close').onclick = () => closeAndExec(() => {
                const v = $('dlp-vid'); v.pause(); v.src = '';
                $('dlp-prev').classList.remove('on'); $('dlp-bd').classList.remove('on');
                if (screen.orientation && screen.orientation.unlock) screen.orientation.unlock();
            });
        }

        function showSubtitleLoader() {
            const panel = $('dlp-sub-panel');
            panel.innerHTML = `
                <h4 style="color:var(--text);margin:0 0 12px;font-size:15px;">Load Subtitle</h4>
                <input id="dlp-sub-url" placeholder="Subtitle URL (.vtt/.srt)" style="width:100%;background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:10px;color:var(--text);font-size:13px;outline:none;margin-bottom:10px;font-family:'Google Sans',sans-serif;">
                <div style="display:flex;gap:8px;">
                    <button id="dlp-sub-load" class="dlp-btn primary" style="flex:1;">Load</button>
                    <button id="dlp-sub-close" class="dlp-btn" style="flex:1;">Cancel</button>
                </div>`;
            panel.classList.add('on');
            $('dlp-sub-load').onclick = () => {
                const url = $('dlp-sub-url').value.trim();
                if (url) {
                    const vid = $('dlp-vid');
                    vid.querySelectorAll('track').forEach(t => t.remove());
                    const track = document.createElement('track'); track.kind = 'subtitles'; track.label = 'Sub'; track.srclang = 'en'; track.src = url; track.default = true;
                    vid.appendChild(track);
                    if (vid.textTracks[0]) vid.textTracks[0].mode = 'showing';
                    toast('Subtitle loaded!');
                }
                panel.classList.remove('on');
            };
            $('dlp-sub-close').onclick = () => panel.classList.remove('on');
        }

        function openCmd(url) {
            const build = (t) => {
                ctab = t;
                const data = {
                    ytdlp: [
                        { l:'Best quality', c:`yt-dlp --referer "${REF}" "${url}"` },
                        { l:'Full bypass', c:`yt-dlp --referer "${REF}" --user-agent "${UA}" -f "bestvideo+bestaudio" "${url}"` },
                        { l:'MP3 only', c:`yt-dlp -x --audio-format mp3 --referer "${REF}" "${url}"` },
                    ],
                    ffmpeg: [
                        { l:'Copy stream', c:`ffmpeg -referer "${REF}" -i "${url}" -c copy output.mp4` },
                        { l:'Re-encode H264+AAC', c:`ffmpeg -referer "${REF}" -i "${url}" -c:v libx264 -c:a aac output.mp4` },
                    ],
                    termux: [
                        { l:'Install', c:`pkg install python ffmpeg -y && pip install yt-dlp` },
                        { l:'Download', c:`yt-dlp --referer "${REF}" "${url}"` },
                        { l:'FFmpeg HLS', c:`ffmpeg -referer "${REF}" -i "${url}" -c copy ~/storage/downloads/out.mp4` },
                    ],
                }[t] || [];

                $('dlp-cmd').innerHTML = `
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:15px">
                        <h4 style="color:var(--text);margin:0;font-size:16px;">Download</h4>
                        <span style="color:var(--text3);font-size:11px;">${fname(url)}</span>
                    </div>
                    <div style="display:flex;gap:6px;margin-bottom:15px">
                        ${['ytdlp','ffmpeg','termux'].map(tab => `
                            <button style="flex:1;background:${tab===t?'var(--primary)':'var(--bg)'};color:${tab===t?'white':'var(--text)'};border:1px solid var(--border);padding:10px;border-radius:20px;cursor:pointer;font-size:12px;font-weight:500;font-family:'Google Sans',sans-serif;" data-tab="${tab}">${tab.toUpperCase()}</button>
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
                    <button style="width:100%;background:var(--bg);color:var(--text);padding:12px;border-radius:20px;cursor:pointer;font-weight:500;margin-top:4px;border:1px solid var(--border);font-family:'Google Sans',sans-serif;" id="dlp-cmd-cls">Close</button>`;
                $('dlp-cmd').querySelectorAll('.dlp-cmd-ta').forEach(ta => ta.style.height = ta.scrollHeight + 'px');
                $('dlp-cmd').querySelectorAll('[data-tab]').forEach(b => b.onclick = () => build(b.dataset.tab));
                $('dlp-cmd').querySelectorAll('.dlp-cmd-cp').forEach(b => b.onclick = () => cp(b.parentElement.querySelector('.dlp-cmd-ta').value));
                $('dlp-cmd-cls').onclick = () => $('dlp-cmd').classList.remove('on');
            };
            build(ctab);
            $('dlp-cmd').classList.add('on');
        }

        // ══════════════════════════════════════
        // GLOBAL EVENTS
        // ══════════════════════════════════════
        $('dlp-fab').onclick = () => {
            if ($('dlp-panel').classList.contains('on')) {
                $('dlp-panel').classList.remove('on'); $('dlp-bd').classList.remove('on');
            } else {
                scan(document, 'main'); scanPerf(); renderPanel();
                $('dlp-panel').classList.add('on'); $('dlp-bd').classList.add('on');
            }
        };
        $('dlp-btn-scan').onclick = () => { scan(document, 'deep'); scanPerf(); renderPanel(); toast(`${mediaUrls.size} media + ${imageUrls.size} images`); };
        $('dlp-btn-clr').onclick = () => { mediaUrls.clear(); imageUrls.clear(); updateBadge(); renderPanel(); toast('Cleared'); };
        $('dlp-btn-cls').onclick = () => {
            const v = $('dlp-vid'); v.pause(); v.src = '';
            $('dlp-prev').classList.remove('on'); $('dlp-bd').classList.remove('on');
            closeAllDropdowns();
            if (screen.orientation && screen.orientation.unlock) screen.orientation.unlock();
        };
        $('dlp-bd').onclick = (e) => {
            if ($('dlp-panel').classList.contains('on')) { $('dlp-panel').classList.remove('on'); $('dlp-bd').classList.remove('on'); }
            closeAllDropdowns();
        };
        document.addEventListener('click', (e) => {
            const d = $('dlp-drop');
            if (d.classList.contains('on') && !d.contains(e.target) && e.target.id !== 'dlp-pc-menu') d.classList.remove('on');
        });
        document.addEventListener('keydown', (e) => {
            if (!$('dlp-prev').classList.contains('on')) return;
            const v = $('dlp-vid');
            switch(e.key) {
                case 'f': triggerFullscreen(); break;
                case 'ArrowRight': v.currentTime += 10; break;
                case 'ArrowLeft': v.currentTime -= 10; break;
                case ' ': e.preventDefault(); v.paused ? v.play() : v.pause(); break;
                case 'Escape': closeAllDropdowns(); break;
            }
        });
    }

    // ══════════════════════════════════════════
    // START
    // ══════════════════════════════════════════
    setInterval(scanPerf, 4000);
    setTimeout(() => { scan(document, 'auto'); updateBadge(); }, 2500);
    if (document.body) initUI();
    else document.addEventListener('DOMContentLoaded', initUI);
})();