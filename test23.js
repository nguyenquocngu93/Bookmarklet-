// ==UserScript==
// @name         DevLib CDN Player - Dark Glass v7
// @namespace    http://tampermonkey.net/
// @version      7.0
// @description  Dark glass UI + fullscreen overlay + app navigation
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
        return u.replace(/\\u002F/gi,'/').replace(/\\\//g,'/').replace(/&amp;/g,'&').replace(/\\"/g,'').replace(/["')\]>\s]+$/,'').trim();
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
        mediaPatterns.forEach(p => { const m = text.match(p.re); if (m) m.forEach(u => addMediaUrl(u, p.type, source, p.priority)); });
        imagePatterns.forEach(p => { const m = text.match(p.re); if (m) m.forEach(u => addImageUrl(u, p.type, source)); });
        IFRAME_PLAYER_RE.forEach(re => { const m = text.match(re); if (m) m.forEach(u => addMediaUrl(cleanUrl(u), 'IFRAME', source, 99)); });
    }

    function scan(doc, src) {
        try {
            if (!doc) return;
            doc.querySelectorAll('video,source,audio').forEach(v => {
                if (v.src && !isAdOrTracker(v.src)) findUrls(v.src, src+':el');
                if (v.currentSrc && !isAdOrTracker(v.currentSrc)) findUrls(v.currentSrc, src+':cur');
            });
            doc.querySelectorAll('img').forEach(img => { if (img.src && !isAdOrTracker(img.src)) addImageUrl(img.src, 'IMG', src+':img'); });
            doc.querySelectorAll('iframe').forEach(f => { if (f.src && !isAdOrTracker(f.src)) addMediaUrl(f.src, 'IFRAME', src+':if', 99); });
            doc.querySelectorAll('script:not([src])').forEach(s => { findUrls(s.textContent, src+':js'); });
            findUrls(doc.documentElement.outerHTML, src+':html');
        } catch(e) {}
    }

    const _fetch = window.fetch;
    const _xhrOpen = XMLHttpRequest.prototype.open;
    window.fetch = function(...a) {
        try {
            const u = typeof a[0]==='string' ? a[0] : (a[0] && a[0].url) || '';
            if (u && !isAdOrTracker(u)) { if (IMAGE_EXTENSIONS.test(u)) addImageUrl(u, 'FETCH', 'fetch'); else findUrls(u, 'fetch'); }
        } catch(e) {}
        return _fetch.apply(this, a);
    };
    XMLHttpRequest.prototype.open = function(m, u) {
        try {
            if (u && !isAdOrTracker(u)) { const su = String(u); if (IMAGE_EXTENSIONS.test(su)) addImageUrl(su, 'XHR', 'xhr'); else findUrls(su, 'xhr'); }
        } catch(e) {}
        return _xhrOpen.apply(this, arguments);
    };
    function scanPerf() {
        try {
            performance.getEntriesByType('resource').forEach(e => {
                if (e.name && !isAdOrTracker(e.name)) { if (IMAGE_EXTENSIONS.test(e.name)) addImageUrl(e.name, 'PERF', 'perf'); else findUrls(e.name, 'perf'); }
            });
        } catch(e) {}
    }

    let updateBadge = () => {};

    // ══════════════════════════════════════════
    // DARK GLASS CSS + OVERLAY
    // ══════════════════════════════════════════
    const CSS = `
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');

        #dlp-fab {
            position: fixed; top: 20px; right: 20px; width: 52px; height: 52px;
            background: rgba(255,255,255,0.08); backdrop-filter: blur(25px); -webkit-backdrop-filter: blur(25px);
            border: 1px solid rgba(255,255,255,0.15); border-radius: 50%; cursor: pointer; z-index: 2147483647;
            display: flex; align-items: center; justify-content: center;
            box-shadow: 0 8px 32px rgba(0,0,0,0.5); transition: all 0.3s;
            animation: float 3s ease-in-out infinite;
        }
        #dlp-fab:hover { transform: scale(1.1) translateY(-4px); background: rgba(255,255,255,0.15); }
        #dlp-fab:active { transform: scale(0.95); }
        @keyframes float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-6px)} }
        #dlp-fab-icon { font-size: 24px; }
        #dlp-badge {
            position: absolute; top: -3px; right: -3px; background: #f43f5e; color: white;
            font-size: 10px; min-width: 22px; height: 22px; border-radius: 11px;
            display: none; align-items: center; justify-content: center;
            font-weight: 700; border: 2px solid rgba(0,0,0,0.5); font-family: 'Inter', sans-serif;
        }

        /* FULLSCREEN OVERLAY khi play video */
        #dlp-overlay {
            position: fixed; inset: 0; background: rgba(0,0,0,0.85);
            backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
            z-index: 2147483646; display: none;
        }
        #dlp-overlay.on { display: block; }

        /* Panel vẫn có backdrop riêng */
        #dlp-bd {
            position: fixed; inset: 0; background: rgba(0,0,0,0.5);
            backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
            z-index: 2147483639; display: none;
        }
        #dlp-bd.on { display: block; }

        #dlp-panel {
            position: fixed; top: 16px; right: 16px; width: calc(100vw - 32px); max-width: 400px; max-height: 60vh;
            background: rgba(15,15,25,0.8); backdrop-filter: blur(40px) saturate(150%); -webkit-backdrop-filter: blur(40px) saturate(150%);
            border-radius: 18px; z-index: 2147483647; display: none; flex-direction: column;
            box-shadow: 0 20px 50px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.08);
            overflow: hidden; font-family: 'Inter', sans-serif;
        }
        #dlp-panel.on { display: flex; }

        #dlp-ph {
            background: rgba(255,255,255,0.03); padding: 14px 16px; display: flex; align-items: center; gap: 8px;
            border-bottom: 1px solid rgba(255,255,255,0.06); flex-shrink: 0;
        }
        #dlp-ph-title { color: #fff; font-size: 14px; font-weight: 700; flex: 1; }

        .dlp-btn {
            border: 1px solid rgba(255,255,255,0.12); border-radius: 20px; cursor: pointer;
            font-size: 11px; font-weight: 600; padding: 7px 14px; color: white;
            background: rgba(255,255,255,0.06); transition: all 0.2s; font-family: 'Inter', sans-serif;
        }
        .dlp-btn:hover { background: rgba(255,255,255,0.14); }
        .dlp-btn.accent { background: #8b5cf6; border-color: #8b5cf6; }
        .dlp-btn.accent:hover { background: #7c3aed; }

        #dlp-tabs { display: flex; background: rgba(0,0,0,0.3); border-bottom: 1px solid rgba(255,255,255,0.06); flex-shrink: 0; overflow-x: auto; }
        .dlp-tab {
            flex: 1; padding: 11px 10px; border: none; background: none; color: rgba(255,255,255,0.4);
            font-size: 11px; font-weight: 600; cursor: pointer; border-bottom: 2px solid transparent;
            white-space: nowrap; transition: all 0.2s; font-family: 'Inter', sans-serif;
        }
        .dlp-tab.on { color: #a78bfa; border-bottom-color: #a78bfa; }

        #dlp-pb { overflow-y: auto; flex: 1; background: rgba(0,0,0,0.2); }

        .dlp-li {
            padding: 13px 15px; border-bottom: 1px solid rgba(255,255,255,0.04);
            cursor: pointer; transition: background 0.2s;
        }
        .dlp-li:hover { background: rgba(255,255,255,0.04); }
        .dlp-li-top { display: flex; align-items: center; gap: 8px; margin-bottom: 5px; }
        .dlp-li-badge { font-size: 9px; font-weight: 700; padding: 3px 7px; border-radius: 5px; color: white; text-transform: uppercase; }
        .dlp-badge-m3u8 { background: #7c3aed; }
        .dlp-badge-mp4 { background: #059669; }
        .dlp-badge-mkv { background: #f9ab00; color: #000; }
        .dlp-badge-iframe { background: #2563eb; }
        .dlp-badge-other { background: #6b7280; }
        .dlp-li-name { color: #fff; font-size: 13px; font-weight: 600; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .dlp-li-src { color: rgba(255,255,255,0.35); font-size: 10px; margin-bottom: 4px; }
        .dlp-li-url {
            color: #a78bfa; font-size: 10px; font-family: monospace; word-break: break-all;
            background: rgba(0,0,0,0.3); padding: 7px 10px; border-radius: 7px; line-height: 1.5;
        }

        .dlp-img-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; padding: 10px; }
        .dlp-img-item { aspect-ratio: 1; border-radius: 10px; overflow: hidden; cursor: pointer; background: rgba(0,0,0,0.4); border: 1px solid rgba(255,255,255,0.06); transition: transform 0.2s; position: relative; }
        .dlp-img-item:hover { transform: scale(1.05); z-index: 1; }
        .dlp-img-thumb { width: 100%; height: 100%; object-fit: cover; }
        .dlp-img-badge { position: absolute; bottom: 4px; right: 4px; font-size: 8px; padding: 2px 5px; border-radius: 4px; background: rgba(0,0,0,0.7); color: white; }

        #dlp-img-prev { position: fixed; inset: 0; z-index: 2147483648; background: rgba(0,0,0,0.95); display: none; align-items: center; justify-content: center; }
        #dlp-img-prev.on { display: flex; }
        #dlp-img-prev img { max-width: 95vw; max-height: 90vh; object-fit: contain; }
        #dlp-img-close { position: absolute; top: 14px; right: 14px; width: 38px; height: 38px; border-radius: 50%; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); color: white; font-size: 18px; cursor: pointer; }

        /* ── PLAYER FULLSCREEN STYLE ── */
        #dlp-prev {
            position: fixed; inset: 0; background: #000;
            z-index: 2147483647; display: none; flex-direction: column;
            font-family: 'Inter', sans-serif;
        }
        #dlp-prev.on { display: flex; }

        #dlp-prev-bar {
            display: flex; align-items: center; padding: 10px 14px; gap: 8px;
            background: rgba(0,0,0,0.6); backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
            flex-shrink: 0; position: absolute; top: 0; left: 0; right: 0; z-index: 10;
        }
        #dlp-prev-info { flex: 1; min-width: 0; }
        #dlp-prev-title { color: #fff; font-size: 13px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        #dlp-prev-site { color: rgba(255,255,255,0.5); font-size: 10px; margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .dlp-icon-btn {
            width: 34px; height: 34px; border-radius: 50%; border: 1px solid rgba(255,255,255,0.15);
            background: rgba(255,255,255,0.08); cursor: pointer; display: flex; align-items: center;
            justify-content: center; color: white; font-size: 15px; transition: all 0.2s; flex-shrink: 0;
        }
        .dlp-icon-btn:hover { background: rgba(255,255,255,0.2); }

        #dlp-vid-wrap { flex: 1; display: flex; align-items: center; justify-content: center; background: #000; }
        #dlp-vid { width: 100%; height: 100%; object-fit: contain; }

        /* ── BOTTOM NAVIGATION BAR (APP STYLE) ── */
        #dlp-nav {
            display: flex; align-items: center; justify-content: space-around;
            padding: 8px 4px 12px; background: rgba(0,0,0,0.7);
            backdrop-filter: blur(30px); -webkit-backdrop-filter: blur(30px);
            border-top: 1px solid rgba(255,255,255,0.08);
            flex-shrink: 0; position: absolute; bottom: 0; left: 0; right: 0; z-index: 10;
            gap: 2px;
        }
        .dlp-nav-item {
            display: flex; flex-direction: column; align-items: center; gap: 3px;
            border: none; background: none; color: rgba(255,255,255,0.45);
            cursor: pointer; padding: 6px 10px; border-radius: 10px;
            transition: all 0.2s; font-family: 'Inter', sans-serif; min-width: 56px;
            font-size: 9px; font-weight: 500; letter-spacing: 0.2px;
        }
        .dlp-nav-item:hover { color: rgba(255,255,255,0.8); background: rgba(255,255,255,0.06); }
        .dlp-nav-item:active { transform: scale(0.95); }
        .dlp-nav-item .nav-icon { font-size: 20px; transition: transform 0.2s; }
        .dlp-nav-item:hover .nav-icon { transform: translateY(-2px); }
        .dlp-nav-item.active { color: #a78bfa; }
        .dlp-nav-item.primary { color: #fff; background: rgba(139,92,246,0.3); }
        .dlp-nav-item.primary:hover { background: rgba(139,92,246,0.5); }

        #dlp-drop {
            position: fixed; background: rgba(15,15,25,0.95); backdrop-filter: blur(40px); -webkit-backdrop-filter: blur(40px);
            border-radius: 14px; border: 1px solid rgba(255,255,255,0.1); z-index: 2147483647;
            display: none; box-shadow: 0 15px 40px rgba(0,0,0,0.6); overflow: hidden; min-width: 220px; max-height: 55vh; overflow-y: auto;
        }
        #dlp-drop.on { display: block; }
        .dlp-di {
            padding: 12px 15px; color: rgba(255,255,255,0.82); font-size: 12px; cursor: pointer;
            display: flex; align-items: center; gap: 9px; border-bottom: 1px solid rgba(255,255,255,0.04);
            transition: background 0.2s; font-family: 'Inter', sans-serif;
        }
        .dlp-di:hover { background: rgba(255,255,255,0.08); }
        .dlp-di.danger { color: #ef4444; }

        #dlp-cmd {
            position: fixed; top: 50%; left: 50%; transform: translate(-50%,-50%);
            background: rgba(15,15,25,0.95); backdrop-filter: blur(40px); -webkit-backdrop-filter: blur(40px);
            border-radius: 16px; z-index: 2147483647; width: 92%; max-width: 460px; padding: 18px;
            display: none; box-shadow: 0 25px 60px rgba(0,0,0,0.7); font-family: 'Inter', sans-serif;
            border: 1px solid rgba(255,255,255,0.1); max-height: 78vh; overflow-y: auto;
        }
        #dlp-cmd.on { display: block; }
        .dlp-cmd-block { background: rgba(0,0,0,0.3); border-radius: 10px; padding: 11px; margin-bottom: 8px; border: 1px solid rgba(255,255,255,0.06); }
        .dlp-cmd-label { color: rgba(255,255,255,0.5); font-size: 10px; font-weight: 700; text-transform: uppercase; margin-bottom: 6px; }
        .dlp-cmd-row { display: flex; gap: 6px; }
        .dlp-cmd-ta { flex: 1; background: transparent; color: #34d399; border: none; font-family: monospace; font-size: 11px; resize: none; outline: none; min-height: 34px; }
        .dlp-cmd-cp { background: rgba(37,99,235,0.5); border: none; color: white; border-radius: 7px; padding: 0 11px; cursor: pointer; font-size: 14px; flex-shrink: 0; }

        #dlp-toast {
            position: fixed; top: 20px; left: 50%; transform: translateX(-50%);
            background: rgba(25,25,40,0.9); backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
            color: white; padding: 10px 22px; border-radius: 22px; font-size: 12px; font-weight: 600;
            z-index: 2147483647; display: none; box-shadow: 0 8px 25px rgba(0,0,0,0.5);
            border: 1px solid rgba(255,255,255,0.1); font-family: 'Inter', sans-serif;
        }

        #dlp-sub-panel {
            position: fixed; top: 50%; left: 50%; transform: translate(-50%,-50%);
            background: rgba(15,15,25,0.95); backdrop-filter: blur(40px); border-radius: 14px;
            z-index: 2147483647; padding: 16px; display: none; box-shadow: 0 20px 50px rgba(0,0,0,0.6);
            font-family: 'Inter', sans-serif; border: 1px solid rgba(255,255,255,0.1); width: 88%; max-width: 360px;
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
            <button id="dlp-fab"><span id="dlp-fab-icon">🎬</span><span id="dlp-badge"></span></button>
            <div id="dlp-overlay"></div>
            <div id="dlp-bd"></div>

            <div id="dlp-panel">
                <div id="dlp-ph">
                    <span id="dlp-ph-title">Media Hub</span>
                    <div id="dlp-ph-acts">
                        <button class="dlp-btn accent" id="dlp-btn-scan">Scan</button>
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
                    <button class="dlp-icon-btn" id="dlp-btn-cls">✕</button>
                </div>
                <div id="dlp-vid-wrap">
                    <video id="dlp-vid" controls playsinline webkit-playsinline></video>
                </div>
                <div id="dlp-nav">
                    <button class="dlp-nav-item" id="dlp-nav-fs"><span class="nav-icon">⛶</span>Full</button>
                    <button class="dlp-nav-item" id="dlp-nav-share"><span class="nav-icon">📤</span>Share</button>
                    <button class="dlp-nav-item primary" id="dlp-nav-pip"><span class="nav-icon">🖼</span>PiP</button>
                    <button class="dlp-nav-item" id="dlp-nav-rot"><span class="nav-icon">⟳</span>Rotate</button>
                    <button class="dlp-nav-item" id="dlp-nav-menu"><span class="nav-icon">⋮</span>More</button>
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
            const t = $('dlp-toast'); t.textContent = m; t.style.background = color || 'rgba(25,25,40,0.9)';
            t.style.display = 'block'; clearTimeout(t._t); t._t = setTimeout(() => t.style.display = 'none', 2000);
        }

        function cp(text) {
            navigator.clipboard.writeText(text).then(() => toast('Copied!', '#059669')).catch(() => {
                const ta = document.createElement('textarea'); ta.value = text; ta.style.cssText = 'position:fixed;left:-9999px';
                document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
                toast('Copied!', '#059669');
            });
        }

        function fname(url) {
            try { const p = new URL(url).pathname.split('/').filter(Boolean).pop() || ''; return decodeURIComponent(p.split('?')[0]) || 'Media'; }
            catch(e) { return 'Media'; }
        }

        updateBadge = function() {
            const b = $('dlp-badge'); if (!b) return;
            const total = mediaUrls.size + imageUrls.size; b.style.display = total ? 'flex' : 'none';
            b.textContent = total > 99 ? '99+' : total;
        };

        function closeAllDropdowns() { $('dlp-drop').classList.remove('on'); $('dlp-sub-panel').classList.remove('on'); $('dlp-cmd').classList.remove('on'); }

        function triggerFullscreen() {
            const vid = $('dlp-vid'); if (!vid) return;
            const req = vid.requestFullscreen || vid.webkitRequestFullscreen || vid.mozRequestFullScreen;
            if (req) {
                req.call(vid).then(() => {
                    setTimeout(() => { if (screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(()=>{}); }, 300);
                }).catch(() => toast('Fullscreen blocked', '#ef4444'));
            }
        }

        document.addEventListener('fullscreenchange', () => {
            if (!document.fullscreenElement && screen.orientation && screen.orientation.unlock) screen.orientation.unlock();
        });
        document.addEventListener('webkitfullscreenchange', () => {
            if (!document.webkitFullscreenElement && screen.orientation && screen.orientation.unlock) screen.orientation.unlock();
        });

        function renderPanel() {
            const renderers = { streams: renderStreams, images: renderImages, playlist: renderPlaylist, history: renderHistory, bookmarks: renderBookmarks };
            (renderers[currentPanelTab] || renderStreams)();
        }

        document.querySelectorAll('.dlp-tab').forEach(tab => {
            tab.onclick = () => {
                document.querySelectorAll('.dlp-tab').forEach(t => t.classList.remove('on'));
                tab.classList.add('on'); currentPanelTab = tab.dataset.tab; renderPanel();
            };
        });

        function renderStreams() {
            const pb = $('dlp-pb'); pb.innerHTML = '';
            const items = [...mediaUrls.values()].sort((a,b) => a.priority - b.priority);
            if (!items.length) { pb.innerHTML = `<div style="color:rgba(255,255,255,0.35);text-align:center;padding:40px;font-size:12px;">No streams</div>`; return; }
            items.forEach(item => {
                const bc = 'dlp-badge-' + (['M3U8','MP4','IFRAME','MKV'].includes(item.type) ? item.type.toLowerCase() : 'other');
                const div = document.createElement('div'); div.className = 'dlp-li';
                div.innerHTML = `<div class="dlp-li-top"><span class="dlp-li-badge ${bc}">${item.type}</span><span class="dlp-li-name">${fname(item.url)}</span></div><div class="dlp-li-src">${item.source}</div><div class="dlp-li-url">${item.url}</div>`;
                div.onclick = () => { const it = mediaUrls.get(item.url); if (it && it.type === 'IFRAME') window.open(it.url, '_blank'); else if (it) openPrev(it); };
                pb.appendChild(div);
            });
        }

        function renderImages() {
            const pb = $('dlp-pb'); pb.innerHTML = '';
            const items = [...imageUrls.values()];
            if (!items.length) { pb.innerHTML = `<div style="color:rgba(255,255,255,0.35);text-align:center;padding:40px;">No images</div>`; return; }
            const grid = document.createElement('div'); grid.className = 'dlp-img-grid';
            items.slice(0, 60).forEach(item => {
                const card = document.createElement('div'); card.className = 'dlp-img-item';
                card.innerHTML = `<img class="dlp-img-thumb" src="${item.url}" loading="lazy" onerror="this.parentElement.style.display='none'" alt="${item.type}"><span class="dlp-img-badge">${item.type}</span>`;
                card.onclick = () => { $('dlp-img-full').src = item.url; $('dlp-img-prev').classList.add('on'); };
                grid.appendChild(card);
            });
            pb.appendChild(grid);
        }

        $('dlp-img-close').onclick = () => $('dlp-img-prev').classList.remove('on');
        $('dlp-img-prev').onclick = (e) => { if (e.target === $('dlp-img-prev')) $('dlp-img-prev').classList.remove('on'); };

        function renderPlaylist() {
            const pb = $('dlp-pb'); pb.innerHTML = '';
            if (!playlist.length) { pb.innerHTML = `<div style="color:rgba(255,255,255,0.35);text-align:center;padding:40px;">Empty</div>`; return; }
            playlist.forEach((item, idx) => {
                const div = document.createElement('div'); div.className = 'dlp-li';
                div.innerHTML = `<div class="dlp-li-top"><span style="color:#14b8a6;font-weight:700;">${idx+1}.</span><span class="dlp-li-name">${item.name}</span><button class="dlp-btn" style="font-size:10px;padding:3px 8px;">Del</button></div><div class="dlp-li-url">${item.url}</div>`;
                div.querySelector('button').onclick = (e) => { e.stopPropagation(); playlist.splice(idx,1); saveData(STORAGE_KEYS.PLAYLIST, playlist); renderPlaylist(); };
                div.onclick = () => openPrev({url: item.url, type: item.type});
                pb.appendChild(div);
            });
        }

        function renderHistory() {
            const pb = $('dlp-pb'); pb.innerHTML = '';
            if (!history.length) { pb.innerHTML = `<div style="color:rgba(255,255,255,0.35);text-align:center;padding:40px;">No history</div>`; return; }
            [...history].reverse().slice(0, 50).forEach(item => {
                const div = document.createElement('div'); div.className = 'dlp-li';
                div.innerHTML = `<div class="dlp-li-top"><span style="color:#60a5fa;font-size:12px;flex:1;">${item.name}</span><span style="color:rgba(255,255,255,0.3);font-size:10px;">${new Date(item.ts).toLocaleString()}</span></div><div class="dlp-li-url">${item.url}</div>`;
                div.onclick = () => openPrev({url: item.url, type: item.type});
                pb.appendChild(div);
            });
        }

        function renderBookmarks() {
            const pb = $('dlp-pb'); pb.innerHTML = '';
            if (!bookmarks.length) { pb.innerHTML = `<div style="color:rgba(255,255,255,0.35);text-align:center;padding:40px;">No bookmarks</div>`; return; }
            bookmarks.forEach((item, idx) => {
                const div = document.createElement('div'); div.className = 'dlp-li';
                div.innerHTML = `<div class="dlp-li-top"><span style="color:#fbbf24;">★</span><span style="color:white;font-size:12px;flex:1;">${item.name}</span><button class="dlp-btn" style="font-size:10px;padding:3px 8px;">Del</button></div><div class="dlp-li-url">${item.url}</div>`;
                div.querySelector('button').onclick = (e) => { e.stopPropagation(); bookmarks.splice(idx,1); saveData(STORAGE_KEYS.BOOKMARKS, bookmarks); renderBookmarks(); };
                div.onclick = () => openPrev({url: item.url, type: item.type});
                pb.appendChild(div);
            });
        }

        // ══════════════════════════════════════
        // OPEN PREVIEW + OVERLAY
        // ══════════════════════════════════════
        function openPrev(item) {
            cur = item; rot = 0; zoom = 1;
            const vid = $('dlp-vid'); vid.style.transform = 'none';
            currentPageTitle = getPageTitle();
            $('dlp-prev-title').textContent = fname(item.url);
            $('dlp-prev-site').textContent = currentPageTitle;
            vid.src = item.url;
            vid.load();
            vid.play().catch(() => {});

            history.push({url: item.url, name: fname(item.url), type: item.type, site: currentPageTitle, ts: Date.now()});
            if (history.length > 100) history = history.slice(-100);
            saveData(STORAGE_KEYS.HISTORY, history);

            // Tối toàn bộ web
            $('dlp-overlay').classList.add('on');
            $('dlp-prev').classList.add('on');
            closeAllDropdowns();
        }

        // ══════════════════════════════════════
        // NAVIGATION BAR EVENTS
        // ══════════════════════════════════════
        $('dlp-nav-fs').onclick = () => triggerFullscreen();
        $('dlp-nav-share').onclick = () => {
            if (navigator.share) { navigator.share({title: fname(cur.url), url: cur.url}).catch(()=>{}); }
            else { window.open(`https://wa.me/?text=${encodeURIComponent(cur.url)}`, '_blank'); }
        };
        $('dlp-nav-pip').onclick = () => {
            const vid = $('dlp-vid');
            if (document.pictureInPictureElement) document.exitPictureInPicture();
            else vid.requestPictureInPicture().catch(() => toast('PiP not supported'));
        };
        $('dlp-nav-rot').onclick = () => {
            rot = (rot + 90) % 360;
            $('dlp-vid').style.transform = `rotate(${rot}deg) scale(${zoom})`;
        };
        $('dlp-nav-menu').onclick = (e) => { e.stopPropagation(); showMenu(e); };

        // ══════════════════════════════════════
        // MENU
        // ══════════════════════════════════════
        function showMenu(e) {
            const d = $('dlp-drop');
            if (d.classList.contains('on')) { d.classList.remove('on'); return; }
            d.innerHTML = `
                <div class="dlp-di" id="dlp-m-cp">📋 Copy URL</div>
                <div class="dlp-di" id="dlp-m-dl">💻 Download</div>
                <div class="dlp-di" id="dlp-m-bm">⭐ Save Bookmark</div>
                <div class="dlp-di" id="dlp-m-pl">🎵 Add to Playlist</div>
                <div class="dlp-di" id="dlp-m-sub">📝 Load Subtitle</div>
                <div class="dlp-di" id="dlp-m-zm">🔍 Zoom (${zoom}x)</div>
                <div class="dlp-di" id="dlp-m-qs">🎞 Quality (HLS)</div>
                <div class="dlp-di" id="dlp-m-new">🌐 Open in Tab</div>
                <div class="dlp-di danger" id="dlp-m-close">✕ Close Player</div>
            `;
            const btn = $('dlp-nav-menu'); const r = btn.getBoundingClientRect();
            d.style.bottom = (window.innerHeight - r.top + 8) + 'px'; d.style.top = 'auto';
            d.style.right = '8px'; d.style.left = 'auto'; d.style.maxWidth = '240px';
            d.classList.add('on');

            const closeAndExec = (fn) => { d.classList.remove('on'); if (fn) fn(); };
            $('dlp-m-cp').onclick = () => closeAndExec(() => cp(cur.url));
            $('dlp-m-dl').onclick = () => closeAndExec(() => openCmd(cur.url));
            $('dlp-m-bm').onclick = () => closeAndExec(() => { bookmarks.push({url:cur.url,name:fname(cur.url),type:cur.type,ts:Date.now()}); saveData(STORAGE_KEYS.BOOKMARKS,bookmarks); toast('Saved!'); });
            $('dlp-m-pl').onclick = () => closeAndExec(() => { playlist.push({url:cur.url,name:fname(cur.url),type:cur.type}); saveData(STORAGE_KEYS.PLAYLIST,playlist); toast('Added!'); });
            $('dlp-m-sub').onclick = () => closeAndExec(() => showSubtitleLoader());
            $('dlp-m-zm').onclick = () => closeAndExec(() => { const lv=[1,1.25,1.5,2,0.75]; zoom=lv[(lv.indexOf(zoom)+1)%lv.length]; $('dlp-vid').style.transform=`rotate(${rot}deg) scale(${zoom})`; });
            $('dlp-m-qs').onclick = () => {
                if (!cur||cur.type!=='M3U8'){d.classList.remove('on');toast('HLS only');return;}
                fetch(cur.url).then(r=>r.text()).then(text=>{
                    const lines=text.split('\n'),qs=[];
                    for(let i=0;i<lines.length;i++){if(lines[i].includes('RESOLUTION=')){const res=lines[i].match(/RESOLUTION=(\d+x\d+)/)?.[1]||'';const next=(lines[i+1]||'').trim();if(next&&!next.startsWith('#'))qs.push({label:res.split('x')[1]+'p',url:next.startsWith('http')?next:cur.url.substring(0,cur.url.lastIndexOf('/')+1)+next});}}
                    d.innerHTML=`<div style="padding:10px 15px;color:rgba(255,255,255,0.4);font-size:11px;font-weight:700;">Quality</div>`+qs.map(q=>`<div class="dlp-di" data-url="${q.url}">${q.label}</div>`).join('');
                    d.querySelectorAll('.dlp-di').forEach(qi=>qi.onclick=()=>{$('dlp-vid').src=qi.dataset.url;d.classList.remove('on');});
                });
            };
            $('dlp-m-new').onclick = () => closeAndExec(() => window.open(cur.url,'_blank'));
            $('dlp-m-close').onclick = () => closeAndExec(closePlayer);
        }

        function showSubtitleLoader() {
            const panel = $('dlp-sub-panel');
            panel.innerHTML = `<h4 style="color:white;margin:0 0 10px;">Load Subtitle</h4><input id="dlp-sub-url" placeholder="Subtitle URL (.vtt/.srt)" style="width:100%;background:rgba(0,0,0,0.4);border:1px solid rgba(255,255,255,0.15);border-radius:8px;padding:10px;color:white;font-size:12px;outline:none;margin-bottom:10px;"><div style="display:flex;gap:8px;"><button id="dlp-sub-load" class="dlp-btn accent" style="flex:1;">Load</button><button id="dlp-sub-close" class="dlp-btn" style="flex:1;">Cancel</button></div>`;
            panel.classList.add('on');
            $('dlp-sub-load').onclick = () => { const url=$('dlp-sub-url').value.trim(); if(url){const vid=$('dlp-vid');vid.querySelectorAll('track').forEach(t=>t.remove());const track=document.createElement('track');track.kind='subtitles';track.label='Sub';track.srclang='en';track.src=url;track.default=true;vid.appendChild(track);if(vid.textTracks[0])vid.textTracks[0].mode='showing';toast('Subtitle loaded!');} panel.classList.remove('on'); };
            $('dlp-sub-close').onclick = () => panel.classList.remove('on');
        }

        function openCmd(url) {
            const build = (t) => {
                ctab = t;
                const data = {
                    ytdlp: [{l:'Best quality',c:`yt-dlp --referer "${REF}" "${url}"`},{l:'Full bypass',c:`yt-dlp --referer "${REF}" --user-agent "${UA}" -f "bestvideo+bestaudio" "${url}"`},{l:'MP3 only',c:`yt-dlp -x --audio-format mp3 --referer "${REF}" "${url}"`}],
                    ffmpeg: [{l:'Copy stream',c:`ffmpeg -referer "${REF}" -i "${url}" -c copy output.mp4`},{l:'Re-encode H264+AAC',c:`ffmpeg -referer "${REF}" -i "${url}" -c:v libx264 -c:a aac output.mp4`}],
                    termux: [{l:'Install',c:`pkg install python ffmpeg -y && pip install yt-dlp`},{l:'Download',c:`yt-dlp --referer "${REF}" "${url}"`},{l:'FFmpeg HLS',c:`ffmpeg -referer "${REF}" -i "${url}" -c copy ~/storage/downloads/out.mp4`}],
                }[t]||[];
                $('dlp-cmd').innerHTML = `
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px"><h4 style="color:white;margin:0;font-size:15px;">Download</h4><span style="color:rgba(255,255,255,0.35);font-size:10px;">${fname(url)}</span></div>
                    <div style="display:flex;gap:5px;margin-bottom:14px">${['ytdlp','ffmpeg','termux'].map(tab=>`<button style="flex:1;background:${tab===t?'#e53935':'rgba(255,255,255,0.06)'};color:white;border:1px solid rgba(255,255,255,0.12);padding:9px;border-radius:8px;cursor:pointer;font-size:11px;font-weight:700;" data-tab="${tab}">${tab.toUpperCase()}</button>`).join('')}</div>
                    ${data.map(d=>`<div class="dlp-cmd-block"><div class="dlp-cmd-label">${d.l}</div><div class="dlp-cmd-row"><textarea class="dlp-cmd-ta" rows="2" readonly>${d.c}</textarea><button class="dlp-cmd-cp">📋</button></div></div>`).join('')}
                    <button style="width:100%;background:#c62828;color:white;padding:11px;border-radius:10px;cursor:pointer;font-weight:700;margin-top:4px;border:none;" id="dlp-cmd-cls">Close</button>`;
                $('dlp-cmd').querySelectorAll('.dlp-cmd-ta').forEach(ta=>ta.style.height=ta.scrollHeight+'px');
                $('dlp-cmd').querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>build(b.dataset.tab));
                $('dlp-cmd').querySelectorAll('.dlp-cmd-cp').forEach(b=>b.onclick=()=>cp(b.parentElement.querySelector('.dlp-cmd-ta').value));
                $('dlp-cmd-cls').onclick = () => $('dlp-cmd').classList.remove('on');
            };
            build(ctab); $('dlp-cmd').classList.add('on');
        }

        function closePlayer() {
            const v = $('dlp-vid'); v.pause(); v.src = '';
            $('dlp-prev').classList.remove('on'); $('dlp-overlay').classList.remove('on');
            closeAllDropdowns();
            if (screen.orientation && screen.orientation.unlock) screen.orientation.unlock();
        }

        // ══════════════════════════════════════
        // GLOBAL EVENTS
        // ══════════════════════════════════════
        $('dlp-fab').onclick = () => {
            if ($('dlp-panel').classList.contains('on')) { $('dlp-panel').classList.remove('on'); $('dlp-bd').classList.remove('on'); }
            else { scan(document,'main'); scanPerf(); renderPanel(); $('dlp-panel').classList.add('on'); $('dlp-bd').classList.add('on'); }
        };
        $('dlp-btn-scan').onclick = () => { scan(document,'deep'); scanPerf(); renderPanel(); toast(`${mediaUrls.size} media + ${imageUrls.size} images`); };
        $('dlp-btn-clr').onclick = () => { mediaUrls.clear(); imageUrls.clear(); updateBadge(); renderPanel(); toast('Cleared'); };
        $('dlp-btn-cls').onclick = () => closePlayer();
        $('dlp-bd').onclick = () => { $('dlp-panel').classList.remove('on'); $('dlp-bd').classList.remove('on'); closeAllDropdowns(); };

        document.addEventListener('click', (e) => {
            const d = $('dlp-drop');
            if (d.classList.contains('on') && !d.contains(e.target) && e.target.id !== 'dlp-nav-menu') d.classList.remove('on');
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

    setInterval(scanPerf, 4000);
    setTimeout(() => { scan(document, 'auto'); updateBadge(); }, 2500);
    if (document.body) initUI();
    else document.addEventListener('DOMContentLoaded', initUI);
})();