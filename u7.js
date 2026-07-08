// ==UserScript==
// @name         Universal Media Player v10
// @namespace    http://tampermonkey.net/
// @version      10.0
// @description  Quét media + trình phát riêng
// @author       You
// @match        *://*/*
// @grant        none
// @run-at       document-start
// ==/UserScript==

(function () {
    'use strict';

    // =============================================
    // URL DETECTION
    // =============================================
    const urls = new Map();
    const patterns = [
        { re: /https?:\/\/[^\s"'<>()\\\]]+\.m3u8[^\s"'<>()\\\]]*/gi, type: 'M3U8', priority: 1 },
        { re: /https?:\/\/[^\s"'<>()\\\]]+\.mpd[^\s"'<>()\\\]]*/gi,  type: 'MPD',  priority: 2 },
        { re: /https?:\/\/[^\s"'<>()\\\]]+\.mp4[^\s"'<>()\\\]]*/gi,  type: 'MP4',  priority: 3 },
        { re: /https?:\/\/[^\s"'<>()\\\]]+\.webm[^\s"'<>()\\\]]*/gi, type: 'WEBM', priority: 4 },
        { re: /https?:\/\/[^\s"'<>()\\\]]+\.mkv[^\s"'<>()\\\]]*/gi,  type: 'MKV',  priority: 5 },
        { re: /https?:\/\/[^\s"'<>()\\\]]+\.flv[^\s"'<>()\\\]]*/gi,  type: 'FLV',  priority: 6 },
    ];

    const AD = /doubleclick|googlesyndication|googleadservices|adservice|pagead|adnxs/i;

    function cleanUrl(u) {
        return u
            .replace(/\\u002F/gi, '/')
            .replace(/\\\//g, '/')
            .replace(/&amp;/g, '&')
            .replace(/\\"/g, '')
            .replace(/["')\]>]+$/, '')
            .trim();
    }

    function findUrls(text, source) {
        if (!text || typeof text !== 'string') return;
        if (text.length > 5000000) {
            for (let i = 0; i < text.length; i += 500000)
                findUrls(text.substring(i, i + 500000), source);
            return;
        }
        patterns.forEach(p => {
            const re = new RegExp(p.re.source, p.re.flags);
            let m;
            while ((m = re.exec(text)) !== null) {
                let u = cleanUrl(m[0]);
                if (!u.startsWith('http')) continue;
                if (AD.test(u)) continue;
                if (!urls.has(u) || urls.get(u).priority > p.priority) {
                    urls.set(u, {
                        url: u, type: p.type,
                        source, priority: p.priority,
                        timestamp: Date.now()
                    });
                    updateBadge();
                }
            }
        });
    }

    function scan(doc, src) {
        try {
            doc.querySelectorAll('video, source, audio').forEach(v => {
                if (v.src) findUrls(v.src, src + ':el');
                if (v.currentSrc) findUrls(v.currentSrc, src + ':cur');
            });
            doc.querySelectorAll('script').forEach(s => {
                findUrls(s.textContent, src + ':script');
            });
            findUrls(doc.documentElement.outerHTML, src + ':html');
            doc.querySelectorAll('iframe').forEach((f, i) => {
                try {
                    if (f.contentDocument) scan(f.contentDocument, src + ':iframe' + i);
                } catch (e) {}
            });
        } catch (e) {}
    }

    function scanPerf() {
        try {
            performance.getEntriesByType('resource').forEach(e => {
                if (e.name) findUrls(e.name, 'perf');
            });
        } catch (e) {}
        document.querySelectorAll('iframe').forEach(f => {
            try {
                const w = f.contentWindow;
                if (w && w.performance)
                    w.performance.getEntriesByType('resource').forEach(e => {
                        if (e.name) findUrls(e.name, 'iframe:perf');
                    });
            } catch (e) {}
        });
    }

    // Hook XHR + Fetch
    const _fetch = window.fetch;
    const _xhrOpen = XMLHttpRequest.prototype.open;
    window.fetch = function (...a) {
        try {
            const u = typeof a[0] === 'string' ? a[0] : (a[0] && a[0].url) || '';
            if (u) findUrls(u, 'fetch');
        } catch (e) {}
        return _fetch.apply(this, a);
    };
    XMLHttpRequest.prototype.open = function (m, u) {
        try { if (u) findUrls(String(u), 'xhr'); } catch (e) {}
        return _xhrOpen.apply(this, arguments);
    };

    // PerformanceObserver realtime
    try {
        new PerformanceObserver(list => {
            list.getEntries().forEach(e => {
                if (e.name) findUrls(e.name, 'perf:live');
            });
        }).observe({ entryTypes: ['resource'] });
    } catch (e) {}

    // M3U8 parser
    function parseM3U8(url, cb) {
        fetch(url, { headers: { Referer: location.href } })
            .then(r => r.text())
            .then(text => {
                if (!text.includes('#EXT-X-STREAM-INF')) { cb(null); return; }
                const qs = [], lines = text.split('\n');
                for (let i = 0; i < lines.length; i++) {
                    const l = lines[i].trim();
                    if (!l.startsWith('#EXT-X-STREAM-INF')) continue;
                    const next = (lines[i + 1] || '').trim();
                    if (!next || next.startsWith('#')) continue;
                    const res = (l.match(/RESOLUTION=(\d+x\d+)/) || [])[1] || '';
                    const bw  = parseInt((l.match(/BANDWIDTH=(\d+)/) || [])[1] || 0);
                    const h   = res ? parseInt(res.split('x')[1]) : 0;
                    const label = h ? h + 'p' : Math.round(bw / 1000) + 'kbps';
                    let su = next.startsWith('http') ? next : url.substring(0, url.lastIndexOf('/') + 1) + next;
                    qs.push({ label, res, bw, url: su });
                }
                qs.sort((a, b) => parseInt(b.res.split('x')[1] || 0) - parseInt(a.res.split('x')[1] || 0));
                cb(qs.length ? qs : null);
            }).catch(() => cb(null));
    }

    let updateBadge = () => {};

    // =============================================
    // CSS
    // =============================================
    const CSS = `
        #ump-fab {
            position: fixed; bottom: 20px; right: 20px;
            width: 54px; height: 54px;
            background: #e53935; color: white;
            border: none; border-radius: 50%;
            font-size: 22px; cursor: pointer;
            box-shadow: 0 4px 20px rgba(229,57,53,.5);
            z-index: 2147483647;
            display: flex; align-items: center; justify-content: center;
            transition: transform .15s;
            font-family: sans-serif;
        }
        #ump-fab:active { transform: scale(.88); }
        #ump-badge {
            position: absolute; top: -3px; right: -3px;
            background: #43a047; color: white;
            font-size: 10px; min-width: 18px; height: 18px;
            border-radius: 9px; padding: 0 4px;
            display: none; align-items: center; justify-content: center;
            font-weight: 700;
        }
        #ump-bd {
            position: fixed; inset: 0; background: rgba(0,0,0,.7);
            z-index: 2147483640; display: none;
        }
        #ump-bd.on { display: block; }

        /* ---- LIST PANEL ---- */
        #ump-panel {
            position: fixed; bottom: 84px; right: 12px;
            width: 360px; max-width: calc(100vw - 24px);
            max-height: 66vh;
            background: #161616; border-radius: 14px;
            z-index: 2147483647;
            display: none; flex-direction: column;
            box-shadow: 0 12px 40px rgba(0,0,0,.9);
            overflow: hidden; font-family: -apple-system, sans-serif;
        }
        #ump-panel.on { display: flex; }
        #ump-phead {
            background: #1e1e1e; padding: 11px 13px;
            display: flex; align-items: center; gap: 8px;
            border-bottom: 1px solid #2a2a2a; flex-shrink: 0;
        }
        #ump-phead-title { color: #fff; font-size: 14px; font-weight: 700; flex: 1; }
        #ump-pbody { overflow-y: auto; flex: 1; padding: 8px; }
        .hb {
            border: none; border-radius: 6px; cursor: pointer;
            font-size: 11px; padding: 6px 10px; color: white; font-weight: 600;
        }
        .hb.bl { background: #1565c0; }
        .hb.gy { background: #333; }

        /* ---- LIST ITEM ---- */
        .li {
            display: flex; align-items: center; gap: 8px;
            background: #1e1e1e; border-radius: 10px;
            padding: 10px 12px; margin: 5px 0;
            cursor: pointer; border: 2px solid transparent;
            transition: border-color .12s;
            font-family: -apple-system, sans-serif;
        }
        .li:hover { border-color: #e53935; }
        .li:active { background: #252525; }
        .li-badge {
            font-size: 10px; font-weight: 700; padding: 3px 7px;
            border-radius: 5px; color: white; flex-shrink: 0;
        }
        .lb-m3u8 { background: #6a1b9a; }
        .lb-mpd  { background: #1565c0; }
        .lb-mp4  { background: #2e7d32; }
        .lb-webm { background: #37474f; }
        .lb-other{ background: #424242; }
        .li-info { flex: 1; overflow: hidden; }
        .li-name {
            color: #eee; font-size: 12px; font-weight: 500;
            overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        .li-url {
            color: #555; font-size: 10px; font-family: monospace;
            overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        .li-more {
            background: none; border: none; color: #555;
            font-size: 18px; cursor: pointer; padding: 2px 4px;
            flex-shrink: 0; line-height: 1;
        }
        .li-more:hover { color: #aaa; }
        .ump-empty {
            color: #555; text-align: center;
            padding: 28px 16px; font-size: 13px; line-height: 2;
        }
        .ump-empty b { color: #888; }

        /* ---- CONTEXT MENU ---- */
        #ump-ctx {
            position: fixed;
            background: #1e1e1e; border-radius: 10px;
            border: 1px solid #2a2a2a;
            z-index: 2147483647; min-width: 200px;
            box-shadow: 0 8px 24px rgba(0,0,0,.8);
            overflow: hidden; display: none;
            font-family: -apple-system, sans-serif;
        }
        #ump-ctx.on { display: block; }
        .ctx-item {
            display: flex; align-items: center; gap: 10px;
            padding: 11px 14px; cursor: pointer; color: #ddd; font-size: 13px;
        }
        .ctx-item:hover { background: #2a2a2a; }
        .ctx-item .ci { font-size: 16px; flex-shrink: 0; }
        .ctx-sep { height: 1px; background: #2a2a2a; }
        .ctx-item.red { color: #ef5350; }

        /* ---- PLAYER ---- */
        #ump-player {
            position: fixed; inset: 0; background: #000;
            z-index: 2147483647; display: none; flex-direction: column;
            font-family: -apple-system, sans-serif;
        }
        #ump-player.on { display: flex; }

        /* Topbar */
        #ump-topbar {
            background: linear-gradient(to bottom, rgba(0,0,0,.85), transparent);
            padding: 10px 12px 20px;
            display: flex; align-items: center; gap: 8px;
            position: absolute; top: 0; left: 0; right: 0;
            z-index: 5; transition: opacity .3s;
        }
        #ump-topbar.hide { opacity: 0; pointer-events: none; }
        #ump-back-btn {
            background: none; border: none; color: white;
            font-size: 22px; cursor: pointer; padding: 4px;
        }
        #ump-p-title {
            flex: 1; color: white; font-size: 13px; font-weight: 500;
            overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        #ump-p-menu {
            background: none; border: none; color: white;
            font-size: 22px; cursor: pointer; padding: 4px;
        }

        /* Video area */
        #ump-vwrap {
            flex: 1; position: relative; background: #000;
            display: flex; align-items: center; justify-content: center;
        }
        #ump-vid {
            width: 100%; height: 100%; object-fit: contain;
            display: block;
        }

        /* Bottom bar */
        #ump-botbar {
            background: linear-gradient(to top, rgba(0,0,0,.9), transparent);
            padding: 20px 12px 12px;
            position: absolute; bottom: 0; left: 0; right: 0;
            z-index: 5; transition: opacity .3s;
        }
        #ump-botbar.hide { opacity: 0; pointer-events: none; }

        /* Progress */
        #ump-progress-wrap {
            display: flex; align-items: center; gap: 8px; margin-bottom: 10px;
        }
        #ump-time-cur { color: #fff; font-size: 11px; min-width: 36px; }
        #ump-prog-bar {
            flex: 1; height: 4px; background: rgba(255,255,255,.3);
            border-radius: 2px; position: relative; cursor: pointer;
        }
        #ump-prog-fill {
            height: 100%; background: #e53935; border-radius: 2px;
            width: 0%; pointer-events: none;
        }
        #ump-prog-thumb {
            width: 14px; height: 14px; border-radius: 50%;
            background: #fff; position: absolute;
            top: 50%; transform: translate(-50%, -50%);
            left: 0%; pointer-events: none;
            box-shadow: 0 1px 4px rgba(0,0,0,.5);
        }
        #ump-time-dur { color: #aaa; font-size: 11px; min-width: 36px; text-align: right; }

        /* Controls */
        #ump-controls {
            display: flex; align-items: center; justify-content: space-between;
        }
        #ump-controls-left { display: flex; align-items: center; gap: 4px; }
        #ump-controls-right { display: flex; align-items: center; gap: 4px; }
        .ctrl-btn {
            background: none; border: none; color: white;
            font-size: 20px; cursor: pointer; padding: 6px;
            border-radius: 50%; transition: background .15s;
        }
        .ctrl-btn:hover { background: rgba(255,255,255,.1); }
        .ctrl-btn:active { background: rgba(255,255,255,.2); }
        .ctrl-btn.lg { font-size: 28px; }

        /* Volume slider */
        #ump-vol-wrap { display: flex; align-items: center; gap: 6px; }
        #ump-vol-slider {
            width: 70px; -webkit-appearance: none;
            height: 3px; border-radius: 2px; outline: none;
            background: linear-gradient(to right, #e53935 0%, rgba(255,255,255,.3) 0%);
        }
        #ump-vol-slider::-webkit-slider-thumb {
            -webkit-appearance: none; width: 12px; height: 12px;
            border-radius: 50%; background: white; cursor: pointer;
        }

        /* Speed badge */
        #ump-speed-btn {
            background: rgba(255,255,255,.15); border: none; color: white;
            font-size: 11px; font-weight: 700; padding: 4px 7px;
            border-radius: 4px; cursor: pointer;
        }

        /* Loading spinner */
        #ump-spinner {
            position: absolute; top: 50%; left: 50%;
            transform: translate(-50%, -50%);
            width: 40px; height: 40px;
            border: 3px solid rgba(255,255,255,.2);
            border-top-color: #fff; border-radius: 50%;
            animation: spin .8s linear infinite;
            display: none; z-index: 3;
        }
        @keyframes spin { to { transform: translate(-50%,-50%) rotate(360deg); } }

        /* ---- CMD MODAL ---- */
        #ump-cmd {
            position: fixed; top: 50%; left: 50%;
            transform: translate(-50%, -50%);
            background: #161616; border-radius: 14px;
            z-index: 2147483647; width: 94%; max-width: 500px;
            padding: 16px; display: none;
            box-shadow: 0 12px 40px rgba(0,0,0,.95);
            font-family: -apple-system, sans-serif;
        }
        #ump-cmd.on { display: block; }
        #ump-cmd h4 {
            color: #fff; font-size: 13px; margin: 0 0 12px;
            display: flex; justify-content: space-between; align-items: center;
        }
        #ump-cmd h4 span { color: #555; font-size: 11px; font-weight: 400; }
        .cmd-tabs { display: flex; gap: 5px; flex-wrap: wrap; margin-bottom: 10px; }
        .ctab {
            background: #222; color: #777; border: none;
            padding: 5px 10px; border-radius: 5px; font-size: 11px; cursor: pointer;
        }
        .ctab.on { background: #e53935; color: white; }
        .cmd-ta {
            width: 100%; background: #0d0d0d; color: #4caf50;
            border: 1px solid #222; border-radius: 8px;
            padding: 10px; font-family: monospace; font-size: 11px;
            resize: vertical; min-height: 120px; box-sizing: border-box;
            line-height: 1.6;
        }
        .cmd-acts { display: flex; gap: 8px; margin-top: 10px; }
        .cmd-btn {
            border: none; border-radius: 8px; cursor: pointer;
            font-size: 12px; padding: 9px; color: white; font-weight: 600;
        }
        .cmd-btn.g { background: #2e7d32; }
        .cmd-btn.r { background: #c62828; }

        /* ---- QUALITY SHEET ---- */
        #ump-qsheet {
            position: fixed; bottom: 0; left: 0; right: 0;
            background: #161616; border-radius: 14px 14px 0 0;
            z-index: 2147483647; padding: 0 0 20px;
            display: none; max-height: 50vh; overflow-y: auto;
            font-family: -apple-system, sans-serif;
        }
        #ump-qsheet.on { display: block; }
        #ump-qsheet-title {
            color: #888; font-size: 12px; font-weight: 600;
            padding: 14px 16px 8px; text-transform: uppercase; letter-spacing: .5px;
        }
        .q-item {
            display: flex; align-items: center; justify-content: space-between;
            padding: 12px 16px; cursor: pointer; color: #ddd; font-size: 14px;
        }
        .q-item:hover { background: #1e1e1e; }
        .q-item.cur { color: #e53935; font-weight: 700; }
        .q-check { font-size: 18px; color: #e53935; }

        #ump-toast {
            position: fixed; bottom: 84px; left: 50%;
            transform: translateX(-50%);
            background: #222; color: white;
            padding: 9px 18px; border-radius: 18px;
            font-size: 13px; z-index: 2147483647;
            display: none; white-space: nowrap;
            box-shadow: 0 4px 16px rgba(0,0,0,.6);
            pointer-events: none;
        }
    `;

    // =============================================
    // INIT UI
    // =============================================
    function initUI() {
        if (document.getElementById('ump-fab')) return;

        const style = document.createElement('style');
        style.textContent = CSS;
        document.head.appendChild(style);

        // FAB
        el('button', { id: 'ump-fab', innerHTML: `🎬<span id="ump-badge"></span>` }, document.body);

        // Backdrop
        el('div', { id: 'ump-bd' }, document.body);

        // Panel
        const panel = el('div', { id: 'ump-panel', innerHTML: `
            <div id="ump-phead">
                <span id="ump-phead-title">🎬 Streams (0)</span>
                <button class="hb bl" id="btn-scan">🔍 Quét</button>
                <button class="hb gy" id="btn-clear">🗑</button>
            </div>
            <div id="ump-pbody"></div>
        ` }, document.body);

        // Context menu
        el('div', { id: 'ump-ctx' }, document.body);

        // Player
        el('div', { id: 'ump-player', innerHTML: `
            <div id="ump-topbar">
                <button id="ump-back-btn">←</button>
                <span id="ump-p-title">-</span>
                <button id="ump-p-menu">⋮</button>
            </div>
            <div id="ump-vwrap">
                <video id="ump-vid" playsinline preload="auto"></video>
                <div id="ump-spinner"></div>
            </div>
            <div id="ump-botbar">
                <div id="ump-progress-wrap">
                    <span id="ump-time-cur">0:00</span>
                    <div id="ump-prog-bar">
                        <div id="ump-prog-fill"></div>
                        <div id="ump-prog-thumb"></div>
                    </div>
                    <span id="ump-time-dur">0:00</span>
                </div>
                <div id="ump-controls">
                    <div id="ump-controls-left">
                        <div id="ump-vol-wrap">
                            <button class="ctrl-btn" id="ump-mute-btn">🔊</button>
                            <input type="range" id="ump-vol-slider" min="0" max="1" step="0.05" value="1">
                        </div>
                        <button class="ctrl-btn" id="ump-speed-btn">1x</button>
                    </div>
                    <div style="display:flex;gap:4px;align-items:center">
                        <button class="ctrl-btn" id="ump-rew">⏪</button>
                        <button class="ctrl-btn lg" id="ump-play-btn">▶️</button>
                        <button class="ctrl-btn" id="ump-fwd">⏩</button>
                    </div>
                    <div id="ump-controls-right">
                        <button class="ctrl-btn" id="ump-pip-btn">⧉</button>
                        <button class="ctrl-btn" id="ump-fs-btn">⛶</button>
                    </div>
                </div>
            </div>
        ` }, document.body);

        // CMD modal
        el('div', { id: 'ump-cmd', innerHTML: `
            <h4>💻 Lệnh tải <span id="cmd-url-short"></span></h4>
            <div class="cmd-tabs">
                <button class="ctab on" data-t="ytdlp">yt-dlp</button>
                <button class="ctab" data-t="ffmpeg">FFmpeg</button>
                <button class="ctab" data-t="wget">wget</button>
                <button class="ctab" data-t="aria2">aria2</button>
                <button class="ctab" data-t="termux">Termux</button>
            </div>
            <textarea class="cmd-ta" id="cmd-ta" readonly></textarea>
            <div class="cmd-acts">
                <button class="cmd-btn g" id="cmd-cp" style="flex:1">📋 Copy lệnh</button>
                <button class="cmd-btn r" id="cmd-cl" style="flex:1">✕ Đóng</button>
            </div>
        ` }, document.body);

        // Quality sheet
        el('div', { id: 'ump-qsheet', innerHTML: `
            <div id="ump-qsheet-title">Chọn chất lượng</div>
            <div id="ump-qlist"></div>
        ` }, document.body);

        // Toast
        el('div', { id: 'ump-toast' }, document.body);

        initLogic();
    }

    function el(tag, props, parent) {
        const e = document.createElement(tag);
        Object.assign(e, props);
        if (parent) parent.appendChild(e);
        return e;
    }

    // =============================================
    // LOGIC
    // =============================================
    function initLogic() {
        const $ = id => document.getElementById(id);

        let curUrl   = null;
        let curItem  = null;
        let curQualities = [];
        let hlsInst  = null;
        let ctab     = 'ytdlp';
        let speedIdx = 0;
        const speeds = [0.5, 0.75, 1, 1.25, 1.5, 2];
        let ctxTarget = null;
        let barTimer  = null;
        let seeking   = false;

        // ---- Helpers ----
        function toast(msg, dur = 2000) {
            const t = $('ump-toast');
            t.textContent = msg;
            t.style.display = 'block';
            clearTimeout(t._t);
            t._t = setTimeout(() => t.style.display = 'none', dur);
        }

        function cp(text) {
            navigator.clipboard
                ? navigator.clipboard.writeText(text).catch(() => cp2(text))
                : cp2(text);
        }
        function cp2(t) {
            const ta = document.createElement('textarea');
            ta.value = t;
            ta.style.cssText = 'position:fixed;left:-9999px;top:-9999px';
            document.body.appendChild(ta); ta.select();
            document.execCommand('copy'); document.body.removeChild(ta);
        }

        function fname(url) {
            try {
                const p = new URL(url).pathname.split('/').filter(Boolean).pop() || '';
                const n = decodeURIComponent(p.split('?')[0]);
                if (n && /\.\w{2,6}$/.test(n)) return n;
            } catch (e) {}
            return 'video_' + Date.now() + '.mp4';
        }

        function fmtTime(s) {
            if (isNaN(s)) return '0:00';
            const m = Math.floor(s / 60);
            const sec = Math.floor(s % 60);
            return m + ':' + (sec < 10 ? '0' : '') + sec;
        }

        updateBadge = function () {
            const b = $('ump-badge');
            if (!b) return;
            const n = urls.size;
            b.style.display = n > 0 ? 'flex' : 'none';
            b.textContent = n > 99 ? '99+' : n;
        };

        // ---- Scan ----
        function doScan() {
            scan(document, 'main');
            scanPerf();
            updateBadge();
            renderList();
            toast(`🔍 Tìm thấy ${urls.size} stream`);
        }

        // ---- Render list ----
        function renderList() {
            const body = $('ump-pbody');
            $('ump-phead-title').textContent = `🎬 Streams (${urls.size})`;

            if (!urls.size) {
                body.innerHTML = `<div class="ump-empty">
                    Chưa có stream.<br>
                    <b>▶️ Phát video rồi nhấn 🔍 Quét</b>
                </div>`;
                return;
            }

            body.innerHTML = '';
            const sorted = [...urls.values()].sort((a, b) => a.priority - b.priority);

            sorted.forEach((item, idx) => {
                const d = document.createElement('div');
                d.className = 'li';
                const tc = item.type.toLowerCase();
                const bc = ['m3u8','mpd','mp4','webm'].includes(tc) ? 'lb-' + tc : 'lb-other';
                const n = fname(item.url);

                d.innerHTML = `
                    <span class="li-badge ${bc}">${item.type}</span>
                    <div class="li-info">
                        <div class="li-name">${n}</div>
                        <div class="li-url">${item.url}</div>
                    </div>
                    <button class="li-more" data-idx="${idx}">⋮</button>
                `;

                // Click item → play
                d.addEventListener('click', (e) => {
                    if (e.target.classList.contains('li-more')) return;
                    playItem(item, 'Auto');
                    closePanel();
                });

                // Three dots menu
                d.querySelector('.li-more').addEventListener('click', (e) => {
                    e.stopPropagation();
                    showCtx(e.target, item);
                });

                body.appendChild(d);
            });
        }

        // ---- Context Menu (⋮) ----
        function showCtx(anchor, item) {
            ctxTarget = item;
            const ctx = $('ump-ctx');

            const isStream = ['M3U8','MPD'].includes(item.type);
            ctx.innerHTML = `
                <div class="ctx-item" data-a="play"><span class="ci">▶️</span> Phát</div>
                ${isStream ? `<div class="ctx-item" data-a="quality"><span class="ci">🎞</span> Chọn chất lượng</div>` : ''}
                <div class="ctx-sep"></div>
                <div class="ctx-item" data-a="copy"><span class="ci">📋</span> Copy link</div>
                <div class="ctx-item" data-a="share"><span class="ci">🔗</span> Chia sẻ</div>
                ${!isStream ? `<div class="ctx-item" data-a="dl"><span class="ci">⬇️</span> Download</div>` : ''}
                <div class="ctx-sep"></div>
                <div class="ctx-item" data-a="cmd"><span class="ci">💻</span> Lệnh tải</div>
                <div class="ctx-item red" data-a="remove"><span class="ci">🗑</span> Xóa khỏi danh sách</div>
            `;

            // Position
            const rect = anchor.getBoundingClientRect();
            ctx.style.top  = Math.min(rect.bottom + 4, window.innerHeight - 300) + 'px';
            ctx.style.right = (window.innerWidth - rect.right - 4) + 'px';
            ctx.style.left = 'auto';

            ctx.classList.add('on');
            $('ump-bd').classList.add('on');

            ctx.querySelectorAll('[data-a]').forEach(btn => {
                btn.onclick = (e) => {
                    e.stopPropagation();
                    const a = btn.dataset.a;
                    closeCtx();
                    if (a === 'play')   { playItem(ctxTarget, 'Auto'); closePanel(); }
                    if (a === 'quality'){ loadQuality(ctxTarget, true); }
                    if (a === 'copy')   { cp(ctxTarget.url); toast('✅ Đã copy link!'); }
                    if (a === 'share')  { doShare(ctxTarget.url); }
                    if (a === 'dl')     { doDl(ctxTarget.url); }
                    if (a === 'cmd')    { openCmd(ctxTarget.url); }
                    if (a === 'remove') {
                        urls.delete(ctxTarget.url);
                        updateBadge(); renderList();
                    }
                };
            });
        }

        function closeCtx() {
            $('ump-ctx').classList.remove('on');
            if (!$('ump-panel').classList.contains('on') &&
                !$('ump-player').classList.contains('on')) {
                $('ump-bd').classList.remove('on');
            }
        }

        // ---- PLAY ----
        function playItem(item, qualityLabel) {
            curItem = item;
            curUrl  = item.url;

            if (['M3U8','MPD'].includes(item.type)) {
                loadQuality(item, false, qualityLabel);
            } else {
                startPlay(item.url, item.type, qualityLabel);
            }
        }

        function loadQuality(item, showSheet, preferLabel) {
            if (item.type !== 'M3U8') {
                if (showSheet) toast('Không phải HLS stream');
                else startPlay(item.url, item.type, 'Auto');
                return;
            }

            parseM3U8(item.url, qs => {
                curQualities = qs || [];
                if (!qs || !qs.length) {
                    if (showSheet) toast('Không có multi-quality');
                    else startPlay(item.url, item.type, 'Auto');
                    return;
                }

                if (showSheet) {
                    showQualitySheet(qs, item);
                } else {
                    // Auto chọn quality cao nhất hoặc theo prefer
                    const chosen = preferLabel !== 'Auto'
                        ? (qs.find(q => q.label === preferLabel) || qs[0])
                        : qs[0];
                    startPlay(chosen.url, item.type, chosen.label);
                }
            });
        }

        function showQualitySheet(qs, item) {
            const list = $('ump-qlist');
            list.innerHTML = `
                <div class="q-item ${curUrl === item.url ? 'cur' : ''}"
                     data-url="${item.url}" data-label="Auto">
                    <span>Auto (Master)</span>
                    ${curUrl === item.url ? '<span class="q-check">✓</span>' : ''}
                </div>
            ` + qs.map(q => `
                <div class="q-item ${curUrl === q.url ? 'cur' : ''}"
                     data-url="${q.url}" data-label="${q.label}">
                    <span>${q.label}</span>
                    ${curUrl === q.url ? '<span class="q-check">✓</span>' : ''}
                </div>
            `).join('');

            list.querySelectorAll('.q-item').forEach(qi => {
                qi.onclick = () => {
                    closeQSheet();
                    startPlay(qi.dataset.url, item.type, qi.dataset.label);
                };
            });

            $('ump-qsheet').classList.add('on');
            $('ump-bd').classList.add('on');
        }

        function closeQSheet() {
            $('ump-qsheet').classList.remove('on');
        }

        function startPlay(url, type, qualityLabel) {
            curUrl = url;
            if (hlsInst) { hlsInst.destroy(); hlsInst = null; }

            const vid = $('ump-vid');
            vid.pause(); vid.removeAttribute('src'); vid.load();
            showSpinner(true);

            if (type === 'M3U8') {
                if (vid.canPlayType('application/vnd.apple.mpegurl')) {
                    vid.src = url; vid.play().catch(() => {});
                } else if (window.Hls && window.Hls.isSupported()) {
                    doHls(url, vid);
                } else {
                    loadScript('https://cdn.jsdelivr.net/npm/hls.js@latest/dist/hls.min.js',
                        () => doHls(url, vid));
                    return;
                }
            } else if (type === 'MPD') {
                if (window.dashjs) {
                    window.dashjs.MediaPlayer().create().initialize(vid, url, true);
                } else {
                    loadScript('https://cdn.dashjs.org/latest/dash.all.min.js',
                        () => window.dashjs.MediaPlayer().create().initialize(vid, url, true));
                    return;
                }
            } else {
                vid.src = url; vid.play().catch(() => {});
            }

            $('ump-p-title').textContent = fname(url) + (qualityLabel !== 'Auto' ? ' · ' + qualityLabel : '');
            $('ump-player').classList.add('on');
            $('ump-bd').classList.add('on');
            showBars(true);
        }

        function doHls(url, vid) {
            const hls = new window.Hls({ enableWorker: true, lowLatencyMode: true });
            hls.loadSource(url); hls.attachMedia(vid);
            hls.on(window.Hls.Events.MANIFEST_PARSED, () => vid.play().catch(() => {}));
            hls.on(window.Hls.Events.ERROR, (e, d) => {
                if (d.fatal) toast('❌ ' + d.details);
            });
            hlsInst = hls;
        }

        function loadScript(src, cb) {
            const s = document.createElement('script');
            s.src = src; s.onload = cb;
            document.head.appendChild(s);
        }

        // ---- Player Controls ----
        const vid = () => $('ump-vid');

        // Show/hide bars
        function showBars(force) {
            $('ump-topbar').classList.remove('hide');
            $('ump-botbar').classList.remove('hide');
            clearTimeout(barTimer);
            if (!force && !vid().paused) {
                barTimer = setTimeout(() => {
                    $('ump-topbar').classList.add('hide');
                    $('ump-botbar').classList.add('hide');
                }, 3000);
            }
        }

        function showSpinner(s) {
            $('ump-spinner').style.display = s ? 'block' : 'none';
        }

        // Video area tap
        $('ump-vwrap').addEventListener('click', () => {
            const tb = $('ump-topbar');
            if (tb.classList.contains('hide')) { showBars(false); }
            else {
                if (vid().paused) vid().play().catch(() => {});
                else vid().pause();
            }
        });

        $('ump-vwrap').addEventListener('touchstart', () => showBars(false), { passive: true });

        // Video events
        const v = () => $('ump-vid');
        const pBtn = () => $('ump-play-btn');

        document.getElementById('ump-vid').addEventListener('play', () => {
            pBtn().textContent = '⏸';
            showSpinner(false);
            showBars(false);
        });
        document.getElementById('ump-vid').addEventListener('pause', () => {
            pBtn().textContent = '▶️';
            showBars(true);
        });
        document.getElementById('ump-vid').addEventListener('waiting', () => showSpinner(true));
        document.getElementById('ump-vid').addEventListener('canplay', () => showSpinner(false));
        document.getElementById('ump-vid').addEventListener('timeupdate', updateProgress);
        document.getElementById('ump-vid').addEventListener('loadedmetadata', updateProgress);

        function updateProgress() {
            const vd = v();
            if (!vd.duration || isNaN(vd.duration)) return;
            const pct = (vd.currentTime / vd.duration) * 100;
            $('ump-prog-fill').style.width = pct + '%';
            $('ump-prog-thumb').style.left = pct + '%';
            $('ump-time-cur').textContent = fmtTime(vd.currentTime);
            $('ump-time-dur').textContent = fmtTime(vd.duration);
            // Volume slider gradient
            const vs = $('ump-vol-slider');
            vs.style.background = `linear-gradient(to right, #e53935 ${vd.volume*100}%, rgba(255,255,255,.3) ${vd.volume*100}%)`;
        }

        // Progress bar seek
        const progBar = $('ump-prog-bar');
        function seekTo(e) {
            const vd = v();
            if (!vd.duration) return;
            const rect = progBar.getBoundingClientRect();
            const clientX = e.touches ? e.touches[0].clientX : e.clientX;
            const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
            vd.currentTime = pct * vd.duration;
            updateProgress();
        }
        progBar.addEventListener('click', seekTo);
        progBar.addEventListener('touchstart', (e) => { seeking = true; seekTo(e); }, { passive: true });
        progBar.addEventListener('touchmove', (e) => { if (seeking) seekTo(e); }, { passive: true });
        progBar.addEventListener('touchend', () => { seeking = false; });

        // Buttons
        $('ump-play-btn').onclick = () => {
            v().paused ? v().play().catch(() => {}) : v().pause();
        };
        $('ump-rew').onclick = () => { v().currentTime = Math.max(0, v().currentTime - 10); showBars(false); };
        $('ump-fwd').onclick = () => { v().currentTime = Math.min(v().duration || Infinity, v().currentTime + 10); showBars(false); };

        $('ump-mute-btn').onclick = () => {
            v().muted = !v().muted;
            $('ump-mute-btn').textContent = v().muted ? '🔇' : '🔊';
        };
        $('ump-vol-slider').addEventListener('input', function () {
            v().volume = parseFloat(this.value);
            v().muted = v().volume === 0;
            $('ump-mute-btn').textContent = v().volume === 0 ? '🔇' : '🔊';
            updateProgress();
        });

        $('ump-speed-btn').onclick = () => {
            speedIdx = (speedIdx + 1) % speeds.length;
            v().playbackRate = speeds[speedIdx];
            $('ump-speed-btn').textContent = speeds[speedIdx] + 'x';
        };

        $('ump-pip-btn').onclick = () => {
            if (document.pictureInPictureElement) {
                document.exitPictureInPicture().catch(() => {});
            } else {
                v().requestPictureInPicture().catch(() => toast('PiP không hỗ trợ'));
            }
        };

        $('ump-fs-btn').onclick = () => {
            const vw = $('ump-vwrap');
            if (document.fullscreenElement) {
                document.exitFullscreen().catch(() => {});
            } else {
                vw.requestFullscreen().catch(() => v().requestFullscreen().catch(() => {}));
            }
        };

        // Back button
        $('ump-back-btn').onclick = () => {
            v().pause(); v().src = '';
            if (hlsInst) { hlsInst.destroy(); hlsInst = null; }
            $('ump-player').classList.remove('on');
            $('ump-bd').classList.remove('on');
        };

        // Player menu (⋮)
        $('ump-p-menu').onclick = () => {
            if (!curItem) return;
            showCtx($('ump-p-menu'), curItem);
        };

        // ---- Commands ----
        const REF = location.href;
        const UA  = 'Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36';

        const cmds = {
            ytdlp: u => [
                `# Tải tốt nhất`,
                `yt-dlp --referer "${REF}" "${u}"`,
                ``,
                `# Với header đầy đủ`,
                `yt-dlp \\`,
                `  --referer "${REF}" \\`,
                `  --add-header "User-Agent:${UA}" \\`,
                `  --add-header "Origin:${location.origin}" \\`,
                `  -f "bestvideo+bestaudio" \\`,
                `  "${u}"`,
                ``,
                `# Chọn quality`,
                `yt-dlp -F "${u}"   # xem danh sách`,
                `yt-dlp -f 137+140 "${u}"  # video+audio`,
            ].join('\n'),

            ffmpeg: u => [
                `# Stream copy (nhanh)`,
                `ffmpeg \\`,
                `  -referer "${REF}" \\`,
                `  -user_agent "${UA}" \\`,
                `  -i "${u}" -c copy output.mp4`,
                ``,
                `# Re-encode`,
                `ffmpeg \\`,
                `  -referer "${REF}" \\`,
                `  -i "${u}" \\`,
                `  -c:v libx264 -c:a aac output.mp4`,
            ].join('\n'),

            wget: u => [
                `wget \\`,
                `  --referer="${REF}" \\`,
                `  --user-agent="${UA}" \\`,
                `  "${u}" -O video.mp4`,
            ].join('\n'),

            aria2: u => [
                `aria2c \\`,
                `  -x 16 -s 16 -k 1M \\`,
                `  --referer="${REF}" \\`,
                `  --user-agent="${UA}" \\`,
                `  "${u}" -o video.mp4`,
            ].join('\n'),

            termux: u => [
                `# Cài tools`,
                `pkg install python ffmpeg -y`,
                `pip install yt-dlp`,
                ``,
                `# yt-dlp (khuyên dùng)`,
                `yt-dlp \\`,
                `  --referer "${REF}" \\`,
                `  "${u}"`,
                ``,
                `# ffmpeg (cho HLS/stream)`,
                `ffmpeg \\`,
                `  -referer "${REF}" \\`,
                `  -i "${u}" -c copy \\`,
                `  ~/storage/downloads/video.mp4`,
            ].join('\n'),
        };

        function openCmd(url) {
            curUrl = url;
            $('cmd-url-short').textContent = fname(url);
            updateCmd();
            $('ump-cmd').classList.add('on');
            $('ump-bd').classList.add('on');
        }

        function updateCmd() {
            if (!curUrl) return;
            $('cmd-ta').value = (cmds[ctab] || (() => ''))(curUrl);
        }

        document.querySelectorAll('.ctab').forEach(btn => {
            btn.onclick = () => {
                document.querySelectorAll('.ctab').forEach(b => b.classList.remove('on'));
                btn.classList.add('on'); ctab = btn.dataset.t; updateCmd();
            };
        });

        $('cmd-cp').onclick = () => { cp($('cmd-ta').value); toast('✅ Đã copy lệnh!'); };
        $('cmd-cl').onclick = () => {
            $('ump-cmd').classList.remove('on');
            if (!$('ump-player').classList.contains('on') &&
                !$('ump-panel').classList.contains('on'))
                $('ump-bd').classList.remove('on');
        };

        // ---- Share / Download ----
        function doShare(url) {
            if (navigator.share) {
                navigator.share({ url }).catch(() => { cp(url); toast('📋 Đã copy link'); });
            } else { cp(url); toast('📋 Đã copy link'); }
        }

        function doDl(url) {
            const a = document.createElement('a');
            a.href = url; a.download = fname(url); a.click();
            toast('⬇️ Đang tải...');
        }

        // ---- Panel / Backdrop ----
        function closePanel() {
            $('ump-panel').classList.remove('on');
            if (!$('ump-player').classList.contains('on'))
                $('ump-bd').classList.remove('on');
        }

        $('ump-fab').onclick = () => {
            const p = $('ump-panel');
            if (p.classList.contains('on')) { closePanel(); return; }
            doScan();
            p.classList.add('on');
            $('ump-bd').classList.add('on');
        };

        $('ump-bd').onclick = (e) => {
            if ($('ump-ctx').classList.contains('on')) { closeCtx(); return; }
            if ($('ump-qsheet').classList.contains('on')) { closeQSheet(); }
            if ($('ump-cmd').classList.contains('on')) { $('ump-cmd').classList.remove('on'); }
            closePanel();
            if (!$('ump-player').classList.contains('on'))
                $('ump-bd').classList.remove('on');
        };

        $('btn-scan').onclick = e => { e.stopPropagation(); doScan(); };
        $('btn-clear').onclick = e => {
            e.stopPropagation();
            urls.clear(); updateBadge(); renderList();
            toast('🗑 Đã xóa');
        };
    }

    // =============================================
    // START
    // =============================================
    function start() {
        try {
            new PerformanceObserver(list => {
                list.getEntries().forEach(e => {
                    if (e.name) findUrls(e.name, 'perf:live');
                });
            }).observe({ entryTypes: ['resource'] });
        } catch (e) {}

        new MutationObserver(muts => {
            muts.forEach(m => {
                m.addedNodes.forEach(node => {
                    if (!node || !node.querySelectorAll) return;
                    const frames = node.tagName === 'IFRAME' ? [node]
                        : [...node.querySelectorAll('iframe')];
                    frames.forEach(f => {
                        f.addEventListener('load', () => {
                            try { scan(f.contentDocument, 'iframe:load'); } catch (e) {}
                        });
                    });
                });
            });
        }).observe(document.documentElement, { childList: true, subtree: true });

        setInterval(() => { scanPerf(); updateBadge(); }, 2000);
        setTimeout(() => { scan(document, 'init'); updateBadge(); }, 800);
        setTimeout(() => { scan(document, 'init2'); scanPerf(); updateBadge(); }, 3000);
    }

    if (document.body) { initUI(); start(); }
    else document.addEventListener('DOMContentLoaded', () => { initUI(); start(); });

})();