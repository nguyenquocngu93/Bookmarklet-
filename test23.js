// ==UserScript==
// @name         DevLib CDN Player - Dark Glass v8
// @namespace    http://tampermonkey.net/
// @version      8.0
// @description  Refined UI: no emoji, pure CSS, smooth transitions
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
    // DARK GLASS CSS – TINH TẾ, KHÔNG EMOJI
    // ══════════════════════════════════════════
    const CSS = `
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');

        :root {
            --glass-bg: rgba(12, 12, 22, 0.82);
            --glass-border: rgba(255, 255, 255, 0.08);
            --text: rgba(255, 255, 255, 0.92);
            --text-secondary: rgba(255, 255, 255, 0.5);
            --accent: #a78bfa;
            --danger: #f87171;
            --transition-fast: 0.2s cubic-bezier(0.4, 0, 0.2, 1);
            --transition-smooth: 0.35s cubic-bezier(0.4, 0, 0.2, 1);
        }

        #dlp-fab {
            position: fixed;
            top: 20px;
            right: 20px;
            width: 52px;
            height: 52px;
            background: rgba(255, 255, 255, 0.06);
            backdrop-filter: blur(25px);
            -webkit-backdrop-filter: blur(25px);
            border: 1px solid rgba(255, 255, 255, 0.12);
            border-radius: 50%;
            cursor: pointer;
            z-index: 2147483647;
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: 0 8px 32px rgba(0,0,0,0.5);
            transition: transform 0.3s ease, background var(--transition-fast), box-shadow var(--transition-fast);
            animation: float 3s ease-in-out infinite;
            color: white;
            font-size: 24px;
            font-weight: 500;
            font-family: 'Inter', sans-serif;
        }
        #dlp-fab::before {
            content: "▶";
            font-size: 22px;
        }
        #dlp-fab:hover {
            transform: scale(1.08) translateY(-4px);
            background: rgba(255, 255, 255, 0.12);
            box-shadow: 0 12px 40px rgba(0,0,0,0.6);
        }
        #dlp-fab:active {
            transform: scale(0.94);
            transition: transform 0.1s;
        }

        @keyframes float {
            0%, 100% { transform: translateY(0); }
            50% { transform: translateY(-6px); }
        }

        #dlp-badge {
            position: absolute;
            top: -3px;
            right: -3px;
            background: #f43f5e;
            color: white;
            font-size: 10px;
            min-width: 22px;
            height: 22px;
            border-radius: 11px;
            display: none;
            align-items: center;
            justify-content: center;
            font-weight: 700;
            border: 2px solid rgba(0,0,0,0.5);
            font-family: 'Inter', sans-serif;
        }

        #dlp-overlay {
            position: fixed;
            inset: 0;
            background: rgba(0,0,0,0.85);
            backdrop-filter: blur(20px);
            -webkit-backdrop-filter: blur(20px);
            z-index: 2147483646;
            display: none;
            opacity: 0;
            transition: opacity var(--transition-smooth);
        }
        #dlp-overlay.on {
            display: block;
            opacity: 1;
        }

        #dlp-bd {
            position: fixed;
            inset: 0;
            background: rgba(0,0,0,0.5);
            backdrop-filter: blur(8px);
            -webkit-backdrop-filter: blur(8px);
            z-index: 2147483639;
            display: none;
            opacity: 0;
            transition: opacity var(--transition-smooth);
        }
        #dlp-bd.on {
            display: block;
            opacity: 1;
        }

        #dlp-panel {
            position: fixed;
            top: 16px;
            right: 16px;
            width: calc(100vw - 32px);
            max-width: 400px;
            max-height: 60vh;
            background: var(--glass-bg);
            backdrop-filter: blur(45px) saturate(160%);
            -webkit-backdrop-filter: blur(45px) saturate(160%);
            border-radius: 18px;
            z-index: 2147483647;
            display: none;
            flex-direction: column;
            box-shadow: 0 20px 50px rgba(0,0,0,0.6), 0 0 0 1px var(--glass-border);
            overflow: hidden;
            font-family: 'Inter', sans-serif;
            transform: translateY(-10px);
            opacity: 0;
            transition: opacity var(--transition-smooth), transform var(--transition-smooth);
        }
        #dlp-panel.on {
            display: flex;
            opacity: 1;
            transform: translateY(0);
        }

        #dlp-ph {
            background: rgba(255,255,255,0.03);
            padding: 14px 16px;
            display: flex;
            align-items: center;
            gap: 8px;
            border-bottom: 1px solid rgba(255,255,255,0.06);
        }
        #dlp-ph-title {
            color: var(--text);
            font-size: 15px;
            font-weight: 600;
            flex: 1;
            letter-spacing: -0.2px;
        }

        .dlp-btn {
            border: 1px solid rgba(255,255,255,0.1);
            border-radius: 20px;
            cursor: pointer;
            font-size: 12px;
            font-weight: 500;
            padding: 7px 16px;
            color: white;
            background: rgba(255,255,255,0.05);
            transition: all var(--transition-fast);
            font-family: 'Inter', sans-serif;
            letter-spacing: -0.2px;
            backdrop-filter: blur(10px);
        }
        .dlp-btn:hover {
            background: rgba(255,255,255,0.12);
            transform: translateY(-1px);
            box-shadow: 0 6px 16px rgba(0,0,0,0.3);
        }
        .dlp-btn:active {
            transform: scale(0.96);
        }
        .dlp-btn.accent {
            background: #8b5cf6;
            border-color: #8b5cf6;
            font-weight: 600;
        }
        .dlp-btn.accent:hover {
            background: #7c3aed;
        }

        #dlp-tabs {
            display: flex;
            background: rgba(0,0,0,0.25);
            border-bottom: 1px solid rgba(255,255,255,0.06);
            overflow-x: auto;
        }
        .dlp-tab {
            flex: 1;
            padding: 11px 10px;
            border: none;
            background: none;
            color: rgba(255,255,255,0.45);
            font-size: 11px;
            font-weight: 500;
            cursor: pointer;
            border-bottom: 2px solid transparent;
            white-space: nowrap;
            transition: color var(--transition-fast), border-color var(--transition-fast);
            letter-spacing: -0.2px;
        }
        .dlp-tab.on {
            color: var(--accent);
            border-bottom-color: var(--accent);
        }
        .dlp-tab:active {
            background: rgba(255,255,255,0.03);
        }

        #dlp-pb {
            overflow-y: auto;
            flex: 1;
            background: rgba(0,0,0,0.15);
        }

        .dlp-li {
            padding: 13px 15px;
            border-bottom: 1px solid rgba(255,255,255,0.04);
            cursor: pointer;
            transition: background var(--transition-fast);
        }
        .dlp-li:hover {
            background: rgba(255,255,255,0.04);
        }
        .dlp-li:active {
            background: rgba(255,255,255,0.08);
        }
        .dlp-li-top {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-bottom: 5px;
        }
        .dlp-li-badge {
            font-size: 9px;
            font-weight: 700;
            padding: 3px 7px;
            border-radius: 5px;
            color: white;
            text-transform: uppercase;
            letter-spacing: 0.3px;
        }
        .dlp-badge-m3u8 { background: #7c3aed; }
        .dlp-badge-mp4 { background: #059669; }
        .dlp-badge-mkv { background: #f9ab00; color: #000; }
        .dlp-badge-iframe { background: #2563eb; }
        .dlp-badge-other { background: #6b7280; }

        .dlp-li-name {
            color: var(--text);
            font-size: 13px;
            font-weight: 500;
            flex: 1;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
        .dlp-li-src {
            color: var(--text-secondary);
            font-size: 10px;
            margin-bottom: 4px;
        }
        .dlp-li-url {
            color: var(--accent);
            font-size: 10px;
            font-family: monospace;
            word-break: break-all;
            background: rgba(0,0,0,0.3);
            padding: 7px 10px;
            border-radius: 7px;
            line-height: 1.5;
        }

        /* image grid */
        .dlp-img-grid {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 6px;
            padding: 10px;
        }
        .dlp-img-item {
            aspect-ratio: 1;
            border-radius: 10px;
            overflow: hidden;
            cursor: pointer;
            background: rgba(0,0,0,0.4);
            border: 1px solid rgba(255,255,255,0.06);
            transition: transform var(--transition-fast), box-shadow var(--transition-fast);
        }
        .dlp-img-item:hover {
            transform: scale(1.04);
            box-shadow: 0 10px 25px rgba(0,0,0,0.5);
            z-index: 1;
        }
        .dlp-img-item:active {
            transform: scale(0.97);
        }
        .dlp-img-thumb {
            width: 100%;
            height: 100%;
            object-fit: cover;
        }
        .dlp-img-badge {
            position: absolute;
            bottom: 4px;
            right: 4px;
            font-size: 8px;
            padding: 2px 5px;
            border-radius: 4px;
            background: rgba(0,0,0,0.7);
            color: white;
        }

        #dlp-img-prev {
            position: fixed;
            inset: 0;
            z-index: 2147483648;
            background: rgba(0,0,0,0.95);
            display: none;
            align-items: center;
            justify-content: center;
            opacity: 0;
            transition: opacity var(--transition-smooth);
        }
        #dlp-img-prev.on {
            display: flex;
            opacity: 1;
        }
        #dlp-img-prev img {
            max-width: 95vw;
            max-height: 90vh;
            object-fit: contain;
            border-radius: 4px;
            transform: scale(0.95);
            transition: transform var(--transition-smooth);
        }
        #dlp-img-prev.on img {
            transform: scale(1);
        }
        #dlp-img-close {
            position: absolute;
            top: 14px;
            right: 14px;
            width: 38px;
            height: 38px;
            border-radius: 50%;
            background: rgba(255,255,255,0.1);
            border: 1px solid rgba(255,255,255,0.2);
            color: white;
            font-size: 18px;
            cursor: pointer;
            transition: background var(--transition-fast);
        }
        #dlp-img-close:hover {
            background: rgba(255,255,255,0.2);
        }

        /* ── PLAYER FULLSCREEN OVERLAY ── */
        #dlp-prev {
            position: fixed;
            inset: 0;
            background: #000;
            z-index: 2147483647;
            display: none;
            flex-direction: column;
            font-family: 'Inter', sans-serif;
            opacity: 0;
            transition: opacity var(--transition-smooth);
        }
        #dlp-prev.on {
            display: flex;
            opacity: 1;
        }

        #dlp-prev-bar {
            display: flex;
            align-items: center;
            padding: 10px 14px;
            gap: 8px;
            background: rgba(0,0,0,0.6);
            backdrop-filter: blur(20px);
            -webkit-backdrop-filter: blur(20px);
            flex-shrink: 0;
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            z-index: 10;
        }
        #dlp-prev-info {
            flex: 1;
            min-width: 0;
        }
        #dlp-prev-title {
            color: #fff;
            font-size: 14px;
            font-weight: 600;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
        #dlp-prev-site {
            color: rgba(255,255,255,0.5);
            font-size: 11px;
            margin-top: 2px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
        .dlp-icon-btn {
            width: 34px;
            height: 34px;
            border-radius: 50%;
            border: 1px solid rgba(255,255,255,0.15);
            background: rgba(255,255,255,0.08);
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-size: 15px;
            transition: all var(--transition-fast);
            flex-shrink: 0;
        }
        .dlp-icon-btn:hover {
            background: rgba(255,255,255,0.2);
            transform: scale(1.08);
        }
        .dlp-icon-btn:active {
            transform: scale(0.94);
        }

        #dlp-vid-wrap {
            flex: 1;
            display: flex;
            align-items: center;
            justify-content: center;
            background: #000;
            position: relative;
        }
        #dlp-vid {
            width: 100%;
            height: 100%;
            object-fit: contain;
            /* ensure controls visible */
            z-index: 1;
        }

        /* ── BOTTOM ACTION BAR (NHƯ LÚC ĐẦU) ── */
        .dlp-action-row {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
            padding: 12px 14px;
            background: rgba(0,0,0,0.55);
            backdrop-filter: blur(25px);
            -webkit-backdrop-filter: blur(25px);
            border-top: 1px solid rgba(255,255,255,0.06);
            justify-content: center;
            transition: background var(--transition-fast);
        }
        .dlp-action-btn {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 4px;
            padding: 10px 18px;
            border-radius: 24px;
            border: 1px solid rgba(255,255,255,0.12);
            background: rgba(255,255,255,0.06);
            color: white;
            font-weight: 600;
            font-size: 12px;
            cursor: pointer;
            letter-spacing: -0.2px;
            transition: all var(--transition-fast);
            backdrop-filter: blur(10px);
            white-space: nowrap;
        }
        .dlp-action-btn:hover {
            background: rgba(255,255,255,0.15);
            border-color: rgba(255,255,255,0.25);
            transform: translateY(-2px);
            box-shadow: 0 8px 20px rgba(0,0,0,0.4);
        }
        .dlp-action-btn:active {
            transform: scale(0.94);
            background: rgba(255,255,255,0.2);
            transition: transform 0.1s;
        }
        .dlp-action-btn.copy { background: rgba(59,130,246,0.2); border-color: rgba(59,130,246,0.5); }
        .dlp-action-btn.full { background: rgba(239,68,68,0.2); border-color: rgba(239,68,68,0.5); }
        .dlp-action-btn.share { background: rgba(16,185,129,0.2); border-color: rgba(16,185,129,0.5); }
        .dlp-action-btn.dl { background: rgba(139,92,246,0.2); border-color: rgba(139,92,246,0.5); }
        .dlp-action-btn.pip { background: rgba(236,72,153,0.2); border-color: rgba(236,72,153,0.5); }
        .dlp-action-btn.save { background: rgba(245,158,11,0.2); border-color: rgba(245,158,11,0.5); }
        .dlp-action-btn.list { background: rgba(20,184,166,0.2); border-color: rgba(20,184,166,0.5); }
        .dlp-action-btn.sub { background: rgba(99,102,241,0.2); border-color: rgba(99,102,241,0.5); }
        .dlp-action-btn.rot { background: rgba(6,182,212,0.2); border-color: rgba(6,182,212,0.5); }
        .dlp-action-btn.zoom { background: rgba(168,85,247,0.2); border-color: rgba(168,85,247,0.5); }

        #dlp-drop {
            position: fixed;
            background: rgba(12,12,22,0.95);
            backdrop-filter: blur(45px);
            -webkit-backdrop-filter: blur(45px);
            border-radius: 14px;
            border: 1px solid rgba(255,255,255,0.08);
            z-index: 2147483647;
            display: none;
            box-shadow: 0 20px 50px rgba(0,0,0,0.7);
            overflow: hidden;
            min-width: 220px;
            max-height: 55vh;
            overflow-y: auto;
            opacity: 0;
            transform: translateY(10px);
            transition: opacity var(--transition-fast), transform var(--transition-fast);
        }
        #dlp-drop.on {
            display: block;
            opacity: 1;
            transform: translateY(0);
        }
        .dlp-di {
            padding: 12px 16px;
            color: rgba(255,255,255,0.8);
            font-size: 12px;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 8px;
            border-bottom: 1px solid rgba(255,255,255,0.04);
            transition: background var(--transition-fast);
        }
        .dlp-di:hover {
            background: rgba(255,255,255,0.06);
        }
        .dlp-di.danger {
            color: var(--danger);
        }

        #dlp-cmd {
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%) scale(0.95);
            background: rgba(12,12,22,0.95);
            backdrop-filter: blur(45px);
            -webkit-backdrop-filter: blur(45px);
            border-radius: 16px;
            z-index: 2147483647;
            width: 92%;
            max-width: 460px;
            padding: 20px;
            display: none;
            box-shadow: 0 30px 60px rgba(0,0,0,0.7);
            font-family: 'Inter', sans-serif;
            border: 1px solid rgba(255,255,255,0.08);
            max-height: 80vh;
            overflow-y: auto;
            opacity: 0;
            transition: opacity var(--transition-smooth), transform var(--transition-smooth);
        }
        #dlp-cmd.on {
            display: block;
            opacity: 1;
            transform: translate(-50%, -50%) scale(1);
        }
        .dlp-cmd-block {
            background: rgba(0,0,0,0.3);
            border-radius: 10px;
            padding: 12px;
            margin-bottom: 10px;
            border: 1px solid rgba(255,255,255,0.06);
        }
        .dlp-cmd-label {
            color: rgba(255,255,255,0.5);
            font-size: 10px;
            font-weight: 700;
            text-transform: uppercase;
            margin-bottom: 6px;
        }
        .dlp-cmd-row {
            display: flex;
            gap: 6px;
        }
        .dlp-cmd-ta {
            flex: 1;
            background: transparent;
            color: #6ee7b7;
            border: none;
            font-family: monospace;
            font-size: 11px;
            resize: none;
            outline: none;
            min-height: 34px;
        }
        .dlp-cmd-cp {
            background: rgba(99,102,241,0.5);
            border: none;
            color: white;
            border-radius: 8px;
            padding: 0 12px;
            cursor: pointer;
            font-size: 14px;
            flex-shrink: 0;
            transition: background var(--transition-fast);
        }
        .dlp-cmd-cp:hover {
            background: rgba(99,102,241,0.7);
        }

        #dlp-toast {
            position: fixed;
            top: 24px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(20,20,30,0.9);
            backdrop-filter: blur(20px);
            -webkit-backdrop-filter: blur(20px);
            color: white;
            padding: 10px 24px;
            border-radius: 24px;
            font-size: 13px;
            font-weight: 500;
            z-index: 2147483647;
            display: none;
            box-shadow: 0 8px 25px rgba(0,0,0,0.5);
            border: 1px solid rgba(255,255,255,0.08);
            letter-spacing: -0.2px;
        }

        #dlp-sub-panel {
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%) scale(0.95);
            background: rgba(12,12,22,0.95);
            backdrop-filter: blur(45px);
            border-radius: 14px;
            z-index: 2147483647;
            padding: 18px;
            display: none;
            box-shadow: 0 20px 50px rgba(0,0,0,0.6);
            font-family: 'Inter', sans-serif;
            border: 1px solid rgba(255,255,255,0.08);
            width: 88%;
            max-width: 360px;
            opacity: 0;
            transition: opacity var(--transition-smooth), transform var(--transition-smooth);
        }
        #dlp-sub-panel.on {
            display: block;
            opacity: 1;
            transform: translate(-50%, -50%) scale(1);
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
            <button id="dlp-fab"><span id="dlp-badge"></span></button>
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
                    <button class="dlp-icon-btn" id="dlp-btn-cls" aria-label="Close">✕</button>
                </div>
                <div id="dlp-vid-wrap">
                    <video id="dlp-vid" controls playsinline webkit-playsinline></video>
                </div>
                <div class="dlp-action-row" id="dlp-p-acts">
                    <button class="dlp-action-btn copy" id="dlp-pc-cp">Copy</button>
                    <button class="dlp-action-btn full" id="dlp-pc-fs">Fullscreen</button>
                    <button class="dlp-action-btn share" id="dlp-pc-share">Share</button>
                    <button class="dlp-action-btn dl" id="dlp-pc-dl">Download</button>
                    <button class="dlp-action-btn pip" id="dlp-pc-pip">PiP</button>
                    <button class="dlp-action-btn save" id="dlp-pc-bm">Save</button>
                    <button class="dlp-action-btn list" id="dlp-pc-pl">+ Playlist</button>
                    <button class="dlp-action-btn sub" id="dlp-pc-sub">Subtitle</button>
                    <button class="dlp-action-btn rot" id="dlp-pc-rot">Rotate</button>
                    <button class="dlp-action-btn zoom" id="dlp-pc-zm">1x</button>
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
            t.style.background = color || 'rgba(20,20,30,0.9)';
            t.style.display = 'block';
            clearTimeout(t._t);
            t._t = setTimeout(() => t.style.display = 'none', 2200);
        }

        function cp(text) {
            navigator.clipboard.writeText(text).then(() => toast('Copied', '#059669'))
            .catch(() => {
                const ta = document.createElement('textarea');
                ta.value = text;
                ta.style.cssText = 'position:fixed;left:-9999px';
                document.body.appendChild(ta);
                ta.select();
                document.execCommand('copy');
                document.body.removeChild(ta);
                toast('Copied', '#059669');
            });
        }

        function fname(url) {
            try { const p = new URL(url).pathname.split('/').filter(Boolean).pop() || ''; return decodeURIComponent(p.split('?')[0]) || 'Media'; }
            catch(e) { return 'Media'; }
        }

        updateBadge = function() {
            const b = $('dlp-badge');
            if (!b) return;
            const total = mediaUrls.size + imageUrls.size;
            b.style.display = total ? 'flex' : 'none';
            b.textContent = total > 99 ? '99+' : total;
        };

        function closeAllDropdowns() {
            ['dlp-drop','dlp-sub-panel','dlp-cmd'].forEach(id => $(id).classList.remove('on'));
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
                        if (screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(()=>{});
                    }, 300);
                }).catch(() => toast('Fullscreen blocked', '#ef4444'));
            }
        }

        document.addEventListener('fullscreenchange', () => {
            if (!document.fullscreenElement && screen.orientation && screen.orientation.unlock) screen.orientation.unlock();
        });

        // ══════════════════════════════════════
        // RENDER PANEL
        // ══════════════════════════════════════
        function renderPanel() {
            const renderers = { streams: renderStreams, images: renderImages, playlist: renderPlaylist, history: renderHistory, bookmarks: renderBookmarks };
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
                pb.innerHTML = `<div style="color:var(--text-secondary);text-align:center;padding:50px 20px;font-size:13px;">No streams found</div>`;
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
                pb.innerHTML = `<div style="color:var(--text-secondary);text-align:center;padding:50px 20px;">No images</div>`;
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
                pb.innerHTML = `<div style="color:var(--text-secondary);text-align:center;padding:40px;">Empty playlist</div>`;
                return;
            }
            playlist.forEach((item, idx) => {
                const div = document.createElement('div');
                div.className = 'dlp-li';
                div.innerHTML = `
                    <div class="dlp-li-top">
                        <span style="color:#14b8a6;font-weight:700;">${idx+1}.</span>
                        <span class="dlp-li-name">${item.name}</span>
                        <button class="dlp-btn" style="font-size:10px;padding:3px 8px;">Del</button>
                    </div>
                    <div class="dlp-li-url">${item.url}</div>
                `;
                div.querySelector('button').onclick = (e) => { e.stopPropagation(); playlist.splice(idx,1); saveData(STORAGE_KEYS.PLAYLIST, playlist); renderPlaylist(); };
                div.onclick = () => openPrev({url: item.url, type: item.type});
                pb.appendChild(div);
            });
        }

        function renderHistory() {
            const pb = $('dlp-pb');
            pb.innerHTML = '';
            if (!history.length) {
                pb.innerHTML = `<div style="color:var(--text-secondary);text-align:center;padding:40px;">No history</div>`;
                return;
            }
            [...history].reverse().slice(0, 50).forEach(item => {
                const div = document.createElement('div');
                div.className = 'dlp-li';
                div.innerHTML = `
                    <div class="dlp-li-top">
                        <span style="color:#60a5fa;font-size:12px;flex:1;">${item.name}</span>
                        <span style="color:var(--text-secondary);font-size:10px;">${new Date(item.ts).toLocaleString()}</span>
                    </div>
                    <div class="dlp-li-url">${item.url}</div>
                `;
                div.onclick = () => openPrev({url: item.url, type: item.type});
                pb.appendChild(div);
            });
        }

        function renderBookmarks() {
            const pb = $('dlp-pb');
            pb.innerHTML = '';
            if (!bookmarks.length) {
                pb.innerHTML = `<div style="color:var(--text-secondary);text-align:center;padding:40px;">No bookmarks</div>`;
                return;
            }
            bookmarks.forEach((item, idx) => {
                const div = document.createElement('div');
                div.className = 'dlp-li';
                div.innerHTML = `
                    <div class="dlp-li-top">
                        <span style="color:#fbbf24;">★</span>
                        <span style="color:white;font-size:12px;flex:1;">${item.name}</span>
                        <button class="dlp-btn" style="font-size:10px;padding:3px 8px;">Del</button>
                    </div>
                    <div class="dlp-li-url">${item.url}</div>
                `;
                div.querySelector('button').onclick = (e) => { e.stopPropagation(); bookmarks.splice(idx,1); saveData(STORAGE_KEYS.BOOKMARKS, bookmarks); renderBookmarks(); };
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
            vid.load();
            vid.play().catch(() => {});

            history.push({url: item.url, name: fname(item.url), type: item.type, site: currentPageTitle, ts: Date.now()});
            if (history.length > 100) history = history.slice(-100);
            saveData(STORAGE_KEYS.HISTORY, history);

            $('dlp-overlay').classList.add('on');
            $('dlp-prev').classList.add('on');
            closeAllDropdowns();

            // Bind nút
            $('dlp-pc-cp').onclick = () => cp(cur.url);
            $('dlp-pc-fs').onclick = () => triggerFullscreen();
            $('dlp-pc-share').onclick = () => {
                if (navigator.share) navigator.share({title: fname(cur.url), url: cur.url}).catch(()=>{});
                else window.open(`https://wa.me/?text=${encodeURIComponent(cur.url)}`, '_blank');
            };
            $('dlp-pc-dl').onclick = () => openCmd(cur.url);
            $('dlp-pc-pip').onclick = () => {
                if (document.pictureInPictureElement) document.exitPictureInPicture();
                else vid.requestPictureInPicture().catch(() => toast('PiP not supported'));
            };
            $('dlp-pc-bm').onclick = () => {
                bookmarks.push({url: cur.url, name: fname(cur.url), type: cur.type, ts: Date.now()});
                saveData(STORAGE_KEYS.BOOKMARKS, bookmarks);
                toast('Bookmarked');
            };
            $('dlp-pc-pl').onclick = () => {
                playlist.push({url: cur.url, name: fname(cur.url), type: cur.type});
                saveData(STORAGE_KEYS.PLAYLIST, playlist);
                toast('Added to playlist');
            };
            $('dlp-pc-sub').onclick = () => showSubtitleLoader();
            $('dlp-pc-rot').onclick = () => {
                rot = (rot + 90) % 360;
                vid.style.transform = `rotate(${rot}deg) scale(${zoom})`;
            };
            $('dlp-pc-zm').onclick = function() {
                const lv = [1, 1.25, 1.5, 2, 0.75];
                zoom = lv[(lv.indexOf(zoom) + 1) % lv.length];
                this.textContent = zoom + 'x';
                vid.style.transform = `rotate(${rot}deg) scale(${zoom})`;
            };
        }

        function showSubtitleLoader() {
            const panel = $('dlp-sub-panel');
            panel.innerHTML = `
                <h4 style="color:white;margin:0 0 10px;font-size:14px;font-weight:600;">Load Subtitle</h4>
                <input id="dlp-sub-url" placeholder="Subtitle URL (.vtt/.srt)" style="width:100%;background:rgba(0,0,0,0.4);border:1px solid rgba(255,255,255,0.15);border-radius:8px;padding:10px;color:white;font-size:12px;outline:none;margin-bottom:10px;">
                <div style="display:flex;gap:8px;">
                    <button id="dlp-sub-load" class="dlp-btn accent" style="flex:1;">Load</button>
                    <button id="dlp-sub-close" class="dlp-btn" style="flex:1;">Cancel</button>
                </div>
            `;
            panel.classList.add('on');
            $('dlp-sub-load').onclick = () => {
                const url = $('dlp-sub-url').value.trim();
                if (url) {
                    const vid = $('dlp-vid');
                    vid.querySelectorAll('track').forEach(t => t.remove());
                    const track = document.createElement('track');
                    track.kind = 'subtitles';
                    track.label = 'Sub';
                    track.srclang = 'en';
                    track.src = url;
                    track.default = true;
                    vid.appendChild(track);
                    if (vid.textTracks[0]) vid.textTracks[0].mode = 'showing';
                    toast('Subtitle loaded');
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
                        {l:'Best quality',c:`yt-dlp --referer "${REF}" "${url}"`},
                        {l:'Full bypass',c:`yt-dlp --referer "${REF}" --user-agent "${UA}" -f "bestvideo+bestaudio" "${url}"`},
                        {l:'MP3 only',c:`yt-dlp -x --audio-format mp3 --referer "${REF}" "${url}"`}
                    ],
                    ffmpeg: [
                        {l:'Copy stream',c:`ffmpeg -referer "${REF}" -i "${url}" -c copy output.mp4`},
                        {l:'Re-encode H264+AAC',c:`ffmpeg -referer "${REF}" -i "${url}" -c:v libx264 -c:a aac output.mp4`}
                    ],
                    termux: [
                        {l:'Install',c:`pkg install python ffmpeg -y && pip install yt-dlp`},
                        {l:'Download',c:`yt-dlp --referer "${REF}" "${url}"`},
                        {l:'FFmpeg HLS',c:`ffmpeg -referer "${REF}" -i "${url}" -c copy ~/storage/downloads/out.mp4`}
                    ]
                }[t] || [];

                $('dlp-cmd').innerHTML = `
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
                        <h4 style="color:white;margin:0;font-size:16px;font-weight:600;">Download</h4>
                        <span style="color:rgba(255,255,255,0.4);font-size:10px;">${fname(url)}</span>
                    </div>
                    <div style="display:flex;gap:5px;margin-bottom:14px">
                        ${['ytdlp','ffmpeg','termux'].map(tab => `
                            <button style="flex:1;background:${tab===t?'#e53935':'rgba(255,255,255,0.06)'};color:white;border:1px solid rgba(255,255,255,0.12);padding:9px;border-radius:8px;cursor:pointer;font-size:11px;font-weight:600;" data-tab="${tab}">${tab.toUpperCase()}</button>
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
                    <button style="width:100%;background:#c62828;color:white;padding:11px;border-radius:10px;cursor:pointer;font-weight:600;margin-top:4px;border:none;" id="dlp-cmd-cls">Close</button>
                `;
                $('dlp-cmd').querySelectorAll('.dlp-cmd-ta').forEach(ta => ta.style.height = ta.scrollHeight + 'px');
                $('dlp-cmd').querySelectorAll('[data-tab]').forEach(b => b.onclick = () => build(b.dataset.tab));
                $('dlp-cmd').querySelectorAll('.dlp-cmd-cp').forEach(b => b.onclick = () => cp(b.parentElement.querySelector('.dlp-cmd-ta').value));
                $('dlp-cmd-cls').onclick = () => $('dlp-cmd').classList.remove('on');
            };
            build(ctab);
            $('dlp-cmd').classList.add('on');
        }

        function closePlayer() {
            const v = $('dlp-vid');
            v.pause();
            v.src = '';
            $('dlp-prev').classList.remove('on');
            $('dlp-overlay').classList.remove('on');
            closeAllDropdowns();
            if (screen.orientation && screen.orientation.unlock) screen.orientation.unlock();
        }

        // ══════════════════════════════════════
        // GLOBAL EVENTS
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
        $('dlp-btn-scan').onclick = () => { scan(document, 'deep'); scanPerf(); renderPanel(); toast(`${mediaUrls.size} media + ${imageUrls.size} images`); };
        $('dlp-btn-clr').onclick = () => { mediaUrls.clear(); imageUrls.clear(); updateBadge(); renderPanel(); toast('Cleared'); };
        $('dlp-btn-cls').onclick = () => closePlayer();
        $('dlp-bd').onclick = () => {
            if ($('dlp-panel').classList.contains('on')) {
                $('dlp-panel').classList.remove('on');
                $('dlp-bd').classList.remove('on');
            }
            closeAllDropdowns();
        };

        document.addEventListener('click', (e) => {
            const d = $('dlp-drop');
            if (d.classList.contains('on') && !d.contains(e.target)) d.classList.remove('on');
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