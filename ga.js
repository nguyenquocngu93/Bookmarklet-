// ==UserScript==
// @name         DevLib CDN Player - Glass UI v2
// @namespace    http://tampermonkey.net/
// @version      2.0
// @description  Glass morphism player with landscape fullscreen + full download commands
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
    const STORAGE_KEY = 'dlp_blacklist';

    function loadSet(key) {
        try { return new Set(JSON.parse(localStorage.getItem(key) || '[]')); }
        catch(e) { return new Set(); }
    }
    function saveSet(key, set) {
        localStorage.setItem(key, JSON.stringify([...set]));
    }

    let blacklist = loadSet(STORAGE_KEY);
    const REF = location.href;
    const UA = 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36';

    // ══════════════════════════════════════════
    // URL DETECTION (Media)
    // ══════════════════════════════════════════
    const urls = new Map();
    const patterns = [
        { re: /https?:\/\/[^\s"'<>()\\\]]+\.m3u8[^\s"'<>()\\\]]*/gi, type: 'M3U8', priority: 1 },
        { re: /https?:\/\/[^\s"'<>()\\\]]+\.mpd[^\s"'<>()\\\]]*/gi,  type: 'MPD',  priority: 2 },
        { re: /https?:\/\/[^\s"'<>()\\\]]+\.mp4[^\s"'<>()\\\]]*/gi,  type: 'MP4',  priority: 3 },
        { re: /https?:\/\/[^\s"'<>()\\\]]+\.webm[^\s"'<>()\\\]]*/gi, type: 'WEBM', priority: 4 },
        { re: /https?:\/\/[^\s"'<>()\\\]]+\.mkv[^\s"'<>()\\\]]*/gi,  type: 'MKV',  priority: 5 },
    ];

    const IFRAME_PLAYER_RE = [
        /https?:\/\/[^\s"'<>]+\/(v|embed|e|vv|jm|t|watch|player)\/[a-zA-Z0-9_\-]{6,}/gi,
        /https?:\/\/(?:videplay|streamvid|surrit|doodstream|mixdrop|fembed|filemoon)[^\s"'<>]*/gi,
    ];

    function cleanUrl(u) {
        return u.replace(/\\u002F/gi,'/').replace(/\\\//g,'/')
                .replace(/&amp;/g,'&').replace(/\\"/g,'')
                .replace(/["')\]>\s]+$/,'').trim();
    }

    function addUrl(u, type, source, priority) {
        u = cleanUrl(u);
        if (!u.startsWith('http')) return;
        if ([...blacklist].some(b => u.includes(b))) return;
        if (!urls.has(u) || urls.get(u).priority > priority) {
            urls.set(u, { url: u, type, source, priority, ts: Date.now() });
            updateBadge();
        }
    }

    function findUrls(text, source) {
        if (!text || typeof text !== 'string') return;
        patterns.forEach(p => {
            const m = text.match(p.re);
            if (m) m.forEach(u => addUrl(u, p.type, source, p.priority));
        });
        IFRAME_PLAYER_RE.forEach(re => {
            const m = text.match(re);
            if (m) m.forEach(u => addUrl(cleanUrl(u), 'IFRAME', source, 99));
        });
    }

    function scan(doc, src) {
        try {
            if (!doc) return;
            doc.querySelectorAll('video,source,audio').forEach(v => {
                if (v.src) findUrls(v.src, src+':el');
                if (v.currentSrc) findUrls(v.currentSrc, src+':cur');
            });
            doc.querySelectorAll('iframe').forEach(f => {
                if (f.src) addUrl(f.src, 'IFRAME', src+':if', 99);
            });
            doc.querySelectorAll('script:not([src])').forEach(s => {
                findUrls(s.textContent, src+':js');
            });
            findUrls(doc.documentElement.outerHTML, src+':html');
        } catch(e) {}
    }

    // Hook Network
    const _fetch = window.fetch;
    const _xhrOpen = XMLHttpRequest.prototype.open;

    window.fetch = function(...a) {
        try {
            const u = typeof a[0]==='string' ? a[0] : (a[0] && a[0].url) || '';
            if (u) findUrls(u, 'fetch');
        } catch(e) {}
        return _fetch.apply(this, a);
    };

    XMLHttpRequest.prototype.open = function(m, u) {
        try {
            if (u) findUrls(String(u), 'xhr');
        } catch(e) {}
        return _xhrOpen.apply(this, arguments);
    };

    function scanPerf() {
        try {
            performance.getEntriesByType('resource').forEach(e => {
                if (e.name) findUrls(e.name, 'perf');
            });
        } catch(e) {}
    }

    let updateBadge = () => {};

    // ══════════════════════════════════════════
    // GLASS UI CSS - TRONG SUỐT SÁNG
    // ══════════════════════════════════════════
    const CSS = `
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

        /* ── GLASS FAB BUTTON ── */
        #dlp-fab {
            position: fixed;
            top: 20px;
            right: 20px;
            width: 60px;
            height: 60px;
            background: rgba(255, 255, 255, 0.1);
            backdrop-filter: blur(20px);
            -webkit-backdrop-filter: blur(20px);
            border: 1px solid rgba(255, 255, 255, 0.2);
            border-radius: 50%;
            color: white;
            cursor: pointer;
            z-index: 2147483647;
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: 
                0 8px 32px rgba(0, 0, 0, 0.3),
                inset 0 1px 0 rgba(255, 255, 255, 0.2);
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            animation: float 3s ease-in-out infinite;
        }
        #dlp-fab:hover {
            transform: scale(1.1) translateY(-5px);
            background: rgba(255, 255, 255, 0.2);
            box-shadow: 
                0 15px 45px rgba(0, 0, 0, 0.4),
                0 0 30px rgba(100, 200, 255, 0.3),
                inset 0 1px 0 rgba(255, 255, 255, 0.3);
        }
        #dlp-fab:active {
            transform: scale(0.95);
        }

        @keyframes float {
            0%, 100% { transform: translateY(0px); }
            50% { transform: translateY(-10px); }
        }

        #dlp-fab-icon {
            font-size: 28px;
            filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3));
        }

        #dlp-badge {
            position: absolute;
            top: -5px;
            right: -5px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            font-size: 11px;
            min-width: 24px;
            height: 24px;
            border-radius: 12px;
            display: none;
            align-items: center;
            justify-content: center;
            font-weight: 700;
            border: 2px solid rgba(255, 255, 255, 0.3);
            box-shadow: 0 4px 15px rgba(102, 126, 234, 0.5);
            animation: pulse 2s ease-in-out infinite;
        }

        @keyframes pulse {
            0%, 100% { box-shadow: 0 4px 15px rgba(102, 126, 234, 0.5); }
            50% { box-shadow: 0 4px 25px rgba(102, 126, 234, 0.8); }
        }

        /* ── GLASS BACKDROP ── */
        #dlp-bd {
            position: fixed;
            inset: 0;
            background: rgba(0, 0, 0, 0.5);
            backdrop-filter: blur(10px);
            -webkit-backdrop-filter: blur(10px);
            z-index: 2147483639;
            display: none;
        }
        #dlp-bd.on { display: block; }

        /* ── GLASS PANEL ── */
        #dlp-panel {
            position: fixed;
            top: 20px;
            right: 20px;
            width: calc(100vw - 40px);
            max-width: 420px;
            max-height: 60vh;
            background: rgba(20, 20, 30, 0.6);
            backdrop-filter: blur(40px) saturate(180%);
            -webkit-backdrop-filter: blur(40px) saturate(180%);
            border-radius: 24px;
            z-index: 2147483647;
            display: none;
            flex-direction: column;
            box-shadow: 
                0 25px 60px rgba(0, 0, 0, 0.5),
                0 0 0 1px rgba(255, 255, 255, 0.1),
                inset 0 0 0 1px rgba(255, 255, 255, 0.05);
            overflow: hidden;
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
            animation: slideIn 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }
        #dlp-panel.on { display: flex; }

        @keyframes slideIn {
            from {
                opacity: 0;
                transform: translateY(-20px) scale(0.95);
            }
            to {
                opacity: 1;
                transform: translateY(0) scale(1);
            }
        }

        #dlp-ph {
            background: rgba(255, 255, 255, 0.05);
            padding: 16px 18px;
            display: flex;
            align-items: center;
            gap: 10px;
            border-bottom: 1px solid rgba(255, 255, 255, 0.08);
            flex-shrink: 0;
            min-height: 56px;
        }
        #dlp-ph-title {
            color: rgba(255, 255, 255, 0.95);
            font-size: 15px;
            font-weight: 700;
            flex: 1;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            text-shadow: 0 2px 8px rgba(0,0,0,0.3);
        }
        #dlp-ph-acts {
            display: flex;
            gap: 8px;
            align-items: center;
            flex-shrink: 0;
        }

        .dlp-btn {
            border: 1px solid rgba(255, 255, 255, 0.15);
            border-radius: 12px;
            cursor: pointer;
            font-size: 12px;
            font-weight: 600;
            padding: 8px 14px;
            color: white;
            white-space: nowrap;
            background: rgba(255, 255, 255, 0.08);
            backdrop-filter: blur(10px);
            -webkit-backdrop-filter: blur(10px);
            transition: all 0.2s;
            box-shadow: 0 2px 8px rgba(0,0,0,0.2);
        }
        .dlp-btn:hover {
            background: rgba(255, 255, 255, 0.15);
            transform: translateY(-1px);
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        }
        .dlp-btn.primary {
            background: linear-gradient(135deg, rgba(102, 126, 234, 0.6), rgba(118, 75, 162, 0.6));
            border-color: rgba(255, 255, 255, 0.3);
            box-shadow: 0 4px 15px rgba(102, 126, 234, 0.3);
        }
        .dlp-btn.primary:hover {
            background: linear-gradient(135deg, rgba(102, 126, 234, 0.8), rgba(118, 75, 162, 0.8));
            box-shadow: 0 6px 20px rgba(102, 126, 234, 0.4);
        }

        /* ── TABS ── */
        #dlp-tabs {
            display: flex;
            background: rgba(0, 0, 0, 0.2);
            border-bottom: 1px solid rgba(255, 255, 255, 0.08);
            flex-shrink: 0;
            overflow-x: auto;
        }
        .dlp-tab {
            flex: 1;
            min-width: 0;
            padding: 10px 8px;
            border: none;
            background: none;
            color: rgba(255, 255, 255, 0.5);
            font-size: 11px;
            font-weight: 600;
            cursor: pointer;
            border-bottom: 2px solid transparent;
            white-space: nowrap;
            transition: all 0.2s;
        }
        .dlp-tab.on {
            color: #a78bfa;
            border-bottom-color: #a78bfa;
            background: rgba(167, 139, 250, 0.1);
        }

        #dlp-pb {
            overflow-y: auto;
            flex: 1;
            background: rgba(0, 0, 0, 0.15);
        }

        /* ── GLASS LIST ITEMS ── */
        .dlp-li {
            padding: 14px 16px;
            border-bottom: 1px solid rgba(255, 255, 255, 0.05);
            cursor: pointer;
            position: relative;
            transition: all 0.2s;
        }
        .dlp-li:hover {
            background: rgba(255, 255, 255, 0.05);
        }
        .dlp-li:active {
            background: rgba(255, 255, 255, 0.08);
        }
        .dlp-li-top {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-bottom: 6px;
        }
        .dlp-li-badge {
            font-size: 10px;
            font-weight: 700;
            padding: 4px 10px;
            border-radius: 8px;
            color: white;
            text-transform: uppercase;
            flex-shrink: 0;
            background: rgba(255, 255, 255, 0.1);
            backdrop-filter: blur(10px);
            -webkit-backdrop-filter: blur(10px);
        }
        .dlp-badge-m3u8 { background: linear-gradient(135deg, #7c3aed, #a78bfa); }
        .dlp-badge-mp4 { background: linear-gradient(135deg, #059669, #34d399); }
        .dlp-badge-iframe { background: linear-gradient(135deg, #2563eb, #60a5fa); }
        .dlp-badge-other { background: linear-gradient(135deg, #6b7280, #9ca3af); }

        .dlp-li-name {
            color: rgba(255, 255, 255, 0.95);
            font-size: 13px;
            font-weight: 600;
            flex: 1;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
        .dlp-li-src {
            color: rgba(255, 255, 255, 0.4);
            font-size: 10px;
            margin-bottom: 5px;
        }
        .dlp-li-url {
            color: #a78bfa;
            font-size: 10px;
            font-family: monospace;
            word-break: break-all;
            background: rgba(0, 0, 0, 0.3);
            padding: 8px 12px;
            border-radius: 10px;
            line-height: 1.5;
            border: 1px solid rgba(255, 255, 255, 0.08);
        }

        /* ── PREVIEW PLAYER (TOP) ── */
        #dlp-prev {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            background: rgba(15, 15, 25, 0.7);
            backdrop-filter: blur(40px) saturate(180%);
            -webkit-backdrop-filter: blur(40px) saturate(180%);
            z-index: 2147483647;
            display: none;
            flex-direction: column;
            border-radius: 0 0 24px 24px;
            box-shadow: 
                0 25px 60px rgba(0, 0, 0, 0.6),
                0 0 0 1px rgba(255, 255, 255, 0.1);
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
            animation: slideDown 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }
        #dlp-prev.on { display: flex; }

        @keyframes slideDown {
            from {
                opacity: 0;
                transform: translateY(-20px);
            }
            to {
                opacity: 1;
                transform: translateY(0);
            }
        }

        #dlp-prev-bar {
            display: flex;
            align-items: center;
            padding: 14px 18px;
            gap: 10px;
            border-bottom: 1px solid rgba(255, 255, 255, 0.08);
            flex-shrink: 0;
        }
        #dlp-prev-title {
            flex: 1;
            color: rgba(255, 255, 255, 0.95);
            font-size: 14px;
            font-weight: 700;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            text-shadow: 0 2px 8px rgba(0,0,0,0.3);
        }

        #dlp-vid-wrap {
            background: rgba(0, 0, 0, 0.5);
            width: 100%;
            height: 240px;
            overflow: hidden;
            display: flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
        }
        #dlp-vid {
            width: 100%;
            height: 100%;
            object-fit: contain;
            transition: transform 0.3s;
        }

        .dlp-p-acts {
            display: flex;
            gap: 8px;
            padding: 14px 18px;
            overflow-x: auto;
            background: rgba(0, 0, 0, 0.2);
            flex-shrink: 0;
        }
        .dlp-pact {
            border: 1px solid rgba(255, 255, 255, 0.15);
            border-radius: 12px;
            padding: 10px 16px;
            color: white;
            font-weight: 600;
            font-size: 11px;
            white-space: nowrap;
            cursor: pointer;
            flex-shrink: 0;
            background: rgba(255, 255, 255, 0.08);
            backdrop-filter: blur(10px);
            -webkit-backdrop-filter: blur(10px);
            transition: all 0.2s;
            box-shadow: 0 2px 8px rgba(0,0,0,0.2);
        }
        .dlp-pact:hover {
            background: rgba(255, 255, 255, 0.15);
            transform: translateY(-1px);
        }
        .dlp-pact.copy { background: linear-gradient(135deg, rgba(37, 99, 235, 0.6), rgba(96, 165, 250, 0.6)); }
        .dlp-pact.fs { background: linear-gradient(135deg, rgba(220, 38, 38, 0.6), rgba(239, 68, 68, 0.6)); }
        .dlp-pact.vlc { background: linear-gradient(135deg, rgba(5, 150, 105, 0.6), rgba(52, 211, 153, 0.6)); }
        .dlp-pact.dl { background: linear-gradient(135deg, rgba(124, 58, 237, 0.6), rgba(167, 139, 250, 0.6)); }
        .dlp-pact.rot { background: linear-gradient(135deg, rgba(0, 121, 107, 0.6), rgba(77, 182, 172, 0.6)); }
        .dlp-pact.zm { background: rgba(68, 68, 68, 0.6); }

        /* ── GLASS ICON BUTTONS ── */
        .dlp-icon-btn {
            width: 40px;
            height: 40px;
            border-radius: 50%;
            border: 1px solid rgba(255, 255, 255, 0.15);
            background: rgba(255, 255, 255, 0.08);
            backdrop-filter: blur(10px);
            -webkit-backdrop-filter: blur(10px);
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-size: 18px;
            transition: all 0.2s;
            box-shadow: 0 2px 8px rgba(0,0,0,0.2);
        }
        .dlp-icon-btn:hover {
            background: rgba(255, 255, 255, 0.15);
            transform: scale(1.1);
        }

        /* ── FS HINT ── */
        #dlp-fs-hint {
            position: fixed;
            top: 15px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(0, 0, 0, 0.7);
            backdrop-filter: blur(20px);
            -webkit-backdrop-filter: blur(20px);
            color: #fff;
            font-size: 11px;
            padding: 6px 16px;
            border-radius: 20px;
            z-index: 2147483647;
            display: none;
            font-family: 'Inter', sans-serif;
            border: 1px solid rgba(255,255,255,0.15);
        }

        /* ── DROPDOWN MENU ── */
        #dlp-drop {
            position: fixed;
            background: rgba(20, 20, 30, 0.8);
            backdrop-filter: blur(40px) saturate(180%);
            -webkit-backdrop-filter: blur(40px) saturate(180%);
            border-radius: 16px;
            border: 1px solid rgba(255, 255, 255, 0.1);
            z-index: 2147483647;
            display: none;
            box-shadow: 0 15px 40px rgba(0, 0, 0, 0.5);
            overflow: hidden;
            min-width: 220px;
        }
        #dlp-drop.on { display: block; }
        .dlp-di {
            padding: 14px 20px;
            color: rgba(255, 255, 255, 0.85);
            font-size: 13px;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 12px;
            border-bottom: 1px solid rgba(255, 255, 255, 0.05);
            transition: all 0.2s;
        }
        .dlp-di:hover {
            background: rgba(255, 255, 255, 0.1);
        }
        .dlp-di:last-child {
            border-bottom: none;
        }

        /* ── CMD MODAL ── */
        #dlp-cmd {
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(20, 20, 30, 0.8);
            backdrop-filter: blur(40px) saturate(180%);
            -webkit-backdrop-filter: blur(40px) saturate(180%);
            border-radius: 20px;
            z-index: 2147483647;
            width: 94%;
            max-width: 500px;
            padding: 20px;
            display: none;
            box-shadow: 0 25px 60px rgba(0, 0, 0, 0.6);
            font-family: 'Inter', sans-serif;
            border: 1px solid rgba(255, 255, 255, 0.1);
            max-height: 80vh;
            overflow-y: auto;
        }
        #dlp-cmd.on { display: block; }
        .dlp-cmd-block {
            background: rgba(0, 0, 0, 0.3);
            border-radius: 12px;
            padding: 12px;
            margin-bottom: 10px;
            border: 1px solid rgba(255, 255, 255, 0.08);
        }
        .dlp-cmd-label {
            color: rgba(255, 255, 255, 0.6);
            font-size: 10px;
            font-weight: 700;
            text-transform: uppercase;
            margin-bottom: 6px;
        }
        .dlp-cmd-row {
            display: flex;
            gap: 6px;
            align-items: stretch;
        }
        .dlp-cmd-ta {
            flex: 1;
            background: transparent;
            color: #34d399;
            border: none;
            font-family: monospace;
            font-size: 11px;
            resize: none;
            outline: none;
            min-height: 40px;
            line-height: 1.5;
        }
        .dlp-cmd-cp {
            background: rgba(37, 99, 235, 0.6);
            border: 1px solid rgba(255, 255, 255, 0.2);
            color: white;
            border-radius: 10px;
            padding: 0 14px;
            cursor: pointer;
            font-size: 16px;
            display: flex;
            align-items: center;
            flex-shrink: 0;
            backdrop-filter: blur(10px);
        }

        /* ── TOAST ── */
        #dlp-toast {
            position: fixed;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(30, 30, 40, 0.8);
            backdrop-filter: blur(20px);
            -webkit-backdrop-filter: blur(20px);
            color: white;
            padding: 12px 24px;
            border-radius: 25px;
            font-size: 13px;
            font-weight: 600;
            z-index: 2147483647;
            display: none;
            box-shadow: 0 8px 25px rgba(0,0,0,0.4);
            border: 1px solid rgba(255, 255, 255, 0.1);
            white-space: nowrap;
        }

        /* Scrollbar */
        #dlp-pb::-webkit-scrollbar {
            width: 4px;
        }
        #dlp-pb::-webkit-scrollbar-track {
            background: transparent;
        }
        #dlp-pb::-webkit-scrollbar-thumb {
            background: rgba(255, 255, 255, 0.15);
            border-radius: 2px;
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
            <div id="dlp-fs-hint">📱 Đã bật fullscreen ngang</div>

            <div id="dlp-panel">
                <div id="dlp-ph">
                    <span id="dlp-ph-title">🎬 Media Player</span>
                    <div id="dlp-ph-acts">
                        <button class="dlp-btn primary" id="dlp-btn-scan">🔍 Quét</button>
                        <button class="dlp-btn" id="dlp-btn-clr">🗑</button>
                    </div>
                </div>
                <div id="dlp-tabs">
                    <button class="dlp-tab on" data-tab="streams">📺 Streams</button>
                    <button class="dlp-tab" data-tab="blacklist">🚫 Block</button>
                </div>
                <div id="dlp-pb"></div>
            </div>

            <div id="dlp-prev">
                <div id="dlp-prev-bar">
                    <span id="dlp-prev-title">-</span>
                    <button class="dlp-icon-btn" id="dlp-btn-opt">⋮</button>
                    <button class="dlp-icon-btn" id="dlp-btn-cls" style="color: #ef4444;">✕</button>
                </div>
                <div id="dlp-vid-wrap">
                    <video id="dlp-vid" controls playsinline webkit-playsinline></video>
                </div>
                <div class="dlp-p-acts" id="dlp-p-acts"></div>
            </div>

            <div id="dlp-drop"></div>
            <div id="dlp-cmd"></div>
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

        // ── Toast ──
        function toast(m, color) {
            const t = $('dlp-toast');
            t.textContent = m;
            t.style.background = color || 'rgba(30, 30, 40, 0.8)';
            t.style.display = 'block';
            clearTimeout(t._t);
            t._t = setTimeout(() => t.style.display = 'none', 2500);
        }

        // ── Copy ──
        function cp(text) {
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.style.cssText = 'position:fixed;left:-9999px';
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
            toast('✅ Đã copy!', 'rgba(5, 150, 105, 0.8)');
        }

        function fname(url) {
            try {
                const p = new URL(url).pathname.split('/').filter(Boolean).pop() || '';
                const n = decodeURIComponent(p.split('?')[0]);
                if (n && /\.\w{2,6}$/.test(n)) return n;
            } catch(e) {}
            return 'Media';
        }

        // ── Badge ──
        updateBadge = function() {
            const b = $('dlp-badge');
            if (!b) return;
            b.style.display = urls.size ? 'flex' : 'none';
            b.textContent = urls.size > 99 ? '99+' : urls.size;
        };

        // ══════════════════════════════════════
        // FULLSCREEN LANDSCAPE (xoay ngang)
        // ══════════════════════════════════════
        function enterFullscreenLandscape() {
            const vid = $('dlp-vid');
            if (!vid) return;

            const tryLock = () => {
                if (screen.orientation && screen.orientation.lock) {
                    screen.orientation.lock('landscape').catch(() => {});
                }
            };

            const onFsChange = () => {
                const fsEl = document.fullscreenElement ||
                             document.webkitFullscreenElement ||
                             document.mozFullScreenElement;
                if (fsEl) {
                    tryLock();
                    const hint = $('dlp-fs-hint');
                    if (hint) {
                        hint.style.display = 'block';
                        setTimeout(() => hint.style.display = 'none', 2000);
                    }
                } else {
                    if (screen.orientation && screen.orientation.unlock) {
                        screen.orientation.unlock();
                    }
                }
            };

            document.addEventListener('fullscreenchange', onFsChange);
            document.addEventListener('webkitfullscreenchange', onFsChange);
            document.addEventListener('mozfullscreenchange', onFsChange);

            return function triggerFs() {
                const req = vid.requestFullscreen ||
                            vid.webkitRequestFullscreen ||
                            vid.mozRequestFullScreen;
                if (req) {
                    req.call(vid).then(() => tryLock()).catch(() => {
                        toast('❌ Trình duyệt chặn fullscreen ngang', 'rgba(220, 38, 38, 0.8)');
                    });
                }
            };
        }

        const triggerFullscreen = enterFullscreenLandscape();

        // ══════════════════════════════════════
        // RENDER PANEL
        // ══════════════════════════════════════
        function renderPanel() {
            if (currentPanelTab === 'streams') renderStreams();
            else if (currentPanelTab === 'blacklist') renderBlacklist();
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
            const items = [...urls.values()].sort((a,b) => a.priority - b.priority);

            if (!items.length) {
                pb.innerHTML = `
                    <div style="color:rgba(255,255,255,0.5);text-align:center;padding:40px 20px;font-size:13px">
                        Chưa tìm thấy media stream.<br><br>
                        ▶️ Phát video rồi nhấn 🔍 Quét
                    </div>`;
                return;
            }

            items.forEach(item => {
                const bc = 'dlp-badge-' + (['M3U8','MP4','IFRAME'].includes(item.type) ? item.type.toLowerCase() : 'other');
                const n = fname(item.url);
                const div = document.createElement('div');
                div.className = 'dlp-li';
                div.innerHTML = `
                    <div class="dlp-li-top">
                        <span class="dlp-li-badge ${bc}">${item.type}</span>
                        <span class="dlp-li-name">${n}</span>
                    </div>
                    <div class="dlp-li-src">${item.source}</div>
                    <div class="dlp-li-url">${item.url}</div>
                `;
                div.onclick = () => {
                    const it = urls.get(item.url);
                    if (it && it.type === 'IFRAME') {
                        window.open(it.url, '_blank');
                        toast('🚀 Đã mở iframe');
                    } else if (it) {
                        openPrev(it);
                    }
                };
                pb.appendChild(div);
            });
        }

        // ══════════════════════════════════════
        // TAB: BLACKLIST
        // ══════════════════════════════════════
        function renderBlacklist() {
            const pb = $('dlp-pb');
            pb.innerHTML = '';

            if (!blacklist.size) {
                pb.innerHTML = `
                    <div style="color:rgba(255,255,255,0.5);text-align:center;padding:30px;font-size:13px">
                        Chưa có blacklist.<br>
                        Block domain từ menu ⋮ khi preview.
                    </div>`;
                return;
            }

            [...blacklist].forEach(domain => {
                const div = document.createElement('div');
                div.className = 'dlp-li';
                div.innerHTML = `
                    <div class="dlp-li-top">
                        <span style="color:#ef4444;font-size:12px;font-family:monospace;flex:1;">🚫 ${domain}</span>
                        <button class="dlp-btn" style="font-size:11px;padding:4px 10px;" data-domain="${domain}">Xóa</button>
                    </div>
                `;
                div.querySelector('button').onclick = () => {
                    blacklist.delete(domain);
                    saveSet(STORAGE_KEY, blacklist);
                    toast('✅ Đã xóa: ' + domain);
                    renderBlacklist();
                };
                pb.appendChild(div);
            });
        }

        // ══════════════════════════════════════
        // OPEN PREVIEW (TOP)
        // ══════════════════════════════════════
        function openPrev(item) {
            cur = item; rot = 0; zoom = 1;
            $('dlp-vid').style.transform = 'none';
            $('dlp-prev-title').textContent = fname(item.url);
            $('dlp-vid').src = item.url;

            $('dlp-p-acts').innerHTML = `
                <button class="dlp-pact copy" id="dlp-pc-cp">📋 Copy</button>
                <button class="dlp-pact fs" id="dlp-pc-fs">⛶ Fullscreen</button>
                <button class="dlp-pact vlc" id="dlp-pc-vlc">📺 VLC</button>
                <button class="dlp-pact dl" id="dlp-pc-dl">💻 Tải</button>
                <button class="dlp-pact rot" id="dlp-pc-rot">⟳ Xoay</button>
                <button class="dlp-pact zm" id="dlp-pc-zm">🔍 ${zoom}x</button>
            `;

            $('dlp-pc-cp').onclick = () => cp(cur.url);
            $('dlp-pc-fs').onclick = () => triggerFullscreen();
            $('dlp-pc-vlc').onclick = () => window.location.href = 'vlc://' + cur.url;
            $('dlp-pc-dl').onclick = () => openCmd(cur.url);
            $('dlp-pc-rot').onclick = () => {
                rot = (rot + 90) % 360;
                $('dlp-vid').style.transform = `rotate(${rot}deg) scale(${zoom})`;
            };
            $('dlp-pc-zm').onclick = function() {
                const lv = [1, 1.25, 1.5, 2, 0.75];
                zoom = lv[(lv.indexOf(zoom) + 1) % lv.length];
                this.textContent = '🔍 ' + zoom + 'x';
                $('dlp-vid').style.transform = `rotate(${rot}deg) scale(${zoom})`;
            };

            $('dlp-prev').classList.add('on');
            $('dlp-bd').classList.add('on');
            $('dlp-panel').classList.remove('on');
        }

        // ══════════════════════════════════════
        // CMD MODAL (ĐẦY ĐỦ LỆNH TẢI)
        // ══════════════════════════════════════
        function openCmd(url) {
            const build = (t) => {
                ctab = t;
                const data = {
                    ytdlp: [
                        { l:'Tải chất lượng cao',
                          c:`yt-dlp --referer "${REF}" "${url}"` },
                        { l:'Bypass Header đầy đủ',
                          c:`yt-dlp --referer "${REF}" --user-agent "${UA}" --add-header "Origin:${location.origin}" -f "bestvideo+bestaudio" "${url}"` },
                        { l:'Chỉ Audio MP3',
                          c:`yt-dlp -x --audio-format mp3 --referer "${REF}" "${url}"` },
                    ],
                    ffmpeg: [
                        { l:'Copy stream (Nhanh)',
                          c:`ffmpeg -referer "${REF}" -user_agent "${UA}" -i "${url}" -c copy output.mp4` },
                        { l:'Re-encode H264',
                          c:`ffmpeg -referer "${REF}" -i "${url}" -c:v libx264 -c:a aac output.mp4` },
                    ],
                    termux: [
                        { l:'Cài tools',
                          c:`pkg install python ffmpeg -y && pip install yt-dlp` },
                        { l:'Tải video',
                          c:`yt-dlp --referer "${REF}" "${url}"` },
                        { l:'FFmpeg HLS',
                          c:`ffmpeg -referer "${REF}" -i "${url}" -c copy ~/storage/downloads/out.mp4` },
                    ],
                }[t] || [];

                $('dlp-cmd').innerHTML = `
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:15px">
                        <h4 style="color:rgba(255,255,255,0.9);margin:0;font-size:16px;">💻 Lệnh tải</h4>
                        <span style="color:rgba(255,255,255,0.4);font-size:10px;font-family:monospace;max-width:180px;overflow:hidden;text-overflow:ellipsis">
                            ${fname(url)}
                        </span>
                    </div>
                    <div style="display:flex;gap:5px;margin-bottom:15px">
                        ${['ytdlp','ffmpeg','termux'].map(tab => `
                            <button style="flex:1;background:${tab===t?'linear-gradient(135deg, rgba(220,38,38,0.8), rgba(239,68,68,0.8))':'rgba(255,255,255,0.08)'};
                                    color:white;border:1px solid rgba(255,255,255,0.15);padding:8px;border-radius:10px;
                                    cursor:pointer;font-size:11px;font-weight:bold;backdrop-filter:blur(10px);"
                                    data-tab="${tab}">${tab.toUpperCase()}</button>
                        `).join('')}
                    </div>
                    <div id="dlp-cmd-list">
                        ${data.map(d => `
                            <div class="dlp-cmd-block">
                                <div class="dlp-cmd-label">${d.l}</div>
                                <div class="dlp-cmd-row">
                                    <textarea class="dlp-cmd-ta" rows="2" readonly>${d.c}</textarea>
                                    <button class="dlp-cmd-cp">📋</button>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                    <button style="width:100%;background:rgba(220,38,38,0.6);border:1px solid rgba(255,255,255,0.15);
                            color:white;padding:12px;border-radius:12px;cursor:pointer;font-weight:bold;
                            margin-top:4px;backdrop-filter:blur(10px);" id="dlp-cmd-cls">ĐÓNG</button>
                `;

                $('dlp-cmd').querySelectorAll('.dlp-cmd-ta').forEach(ta => {
                    ta.style.height = 'auto';
                    ta.style.height = ta.scrollHeight + 'px';
                });
                $('dlp-cmd').querySelectorAll('[data-tab]').forEach(b =>
                    b.onclick = () => build(b.dataset.tab)
                );
                $('dlp-cmd').querySelectorAll('.dlp-cmd-cp').forEach(b =>
                    b.onclick = () => cp(b.parentElement.querySelector('.dlp-cmd-ta').value)
                );
                $('dlp-cmd-cls').onclick = () => {
                    $('dlp-cmd').classList.remove('on');
                    if (!$('dlp-prev').classList.contains('on') && !$('dlp-panel').classList.contains('on'))
                        $('dlp-bd').classList.remove('on');
                };
            };
            build(ctab);
            $('dlp-cmd').classList.add('on');
            $('dlp-bd').classList.add('on');
        }

        // ══════════════════════════════════════
        // DROPDOWN ⋮
        // ══════════════════════════════════════
        $('dlp-btn-opt').onclick = (e) => {
            e.stopPropagation();
            const d = $('dlp-drop');
            d.innerHTML = `
                <div class="dlp-di" id="dlp-m-qs">🎞 Chọn chất lượng</div>
                <div class="dlp-di" id="dlp-m-fs">⛶ Fullscreen Ngang</div>
                <div class="dlp-di" id="dlp-m-new">🌐 Mở tab mới</div>
                <div class="dlp-di" id="dlp-m-share">🔗 Chia sẻ</div>
                <div class="dlp-di" id="dlp-m-block" style="color:#ef4444;">🚫 Block domain</div>
            `;
            const r = $('dlp-btn-opt').getBoundingClientRect();
            d.style.top = (r.bottom + 10) + 'px';
            d.style.right = '20px';
            d.classList.add('on');

            $('dlp-m-fs').onclick = () => { d.classList.remove('on'); triggerFullscreen(); };
            $('dlp-m-new').onclick = () => { window.open(cur.url,'_blank'); d.classList.remove('on'); };
            $('dlp-m-share').onclick = () => { navigator.share({url:cur.url}); d.classList.remove('on'); };
            $('dlp-m-block').onclick = () => {
                try {
                    const domain = new URL(cur.url).hostname;
                    blacklist.add(domain);
                    saveSet(STORAGE_KEY, blacklist);
                    toast('🚫 Đã block: ' + domain);
                } catch(e) {
                    toast('❌ Lỗi block');
                }
                d.classList.remove('on');
            };
            $('dlp-m-qs').onclick = () => {
                d.classList.remove('on');
                if (!cur || cur.type !== 'M3U8') { toast('Chỉ hỗ trợ HLS'); return; }
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
                    if (!qs.length) { toast('Không parse được quality'); return; }

                    d.innerHTML = `<div style="padding:10px 16px;color:rgba(255,255,255,0.5);font-size:11px;font-weight:700;">CHẤT LƯỢNG</div>` +
                        qs.map(q => `<div class="dlp-di" data-url="${q.url}">📺 ${q.label}</div>`).join('');
                    d.classList.add('on');
                    d.querySelectorAll('.dlp-di').forEach(qi => qi.onclick = () => {
                        $('dlp-vid').src = qi.dataset.url;
                        d.classList.remove('on');
                        toast('▶ ' + qi.textContent.trim());
                    });
                });
            };
        };

        // ══════════════════════════════════════
        // FAB & EVENTS
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
            toast('✅ Quét xong! ' + urls.size + ' media');
        };

        $('dlp-btn-clr').onclick = () => {
            urls.clear();
            updateBadge();
            renderPanel();
            toast('🗑 Đã xóa');
        };

        $('dlp-btn-cls').onclick = () => {
            $('dlp-vid').pause();
            $('dlp-vid').src = '';
            $('dlp-prev').classList.remove('on');
            $('dlp-bd').classList.remove('on');
            if (screen.orientation && screen.orientation.unlock) {
                screen.orientation.unlock();
            }
        };

        $('dlp-bd').onclick = (e) => {
            if ($('dlp-cmd').classList.contains('on')) {
                $('dlp-cmd').classList.remove('on');
            }
            if ($('dlp-drop').classList.contains('on')) {
                $('dlp-drop').classList.remove('on');
            }
            $('dlp-panel').classList.remove('on');
            $('dlp-prev').classList.remove('on');
            $('dlp-bd').classList.remove('on');
            $('dlp-vid').pause();
        };

        document.addEventListener('click', (e) => {
            const d = $('dlp-drop');
            if (d.classList.contains('on') && !d.contains(e.target) && e.target.id !== 'dlp-btn-opt') {
                d.classList.remove('on');
            }
        });
    }

    // ══════════════════════════════════════════
    // AUTO START
    // ══════════════════════════════════════════
    setInterval(scanPerf, 3000);

    setTimeout(() => {
        scan(document, 'auto');
        updateBadge();
    }, 2000);

    if (document.body) initUI();
    else document.addEventListener('DOMContentLoaded', initUI);
})();