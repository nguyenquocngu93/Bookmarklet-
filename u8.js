// ==UserScript==
// @name         Universal Media Player v11
// @namespace    http://tampermonkey.net/
// @version      11.0
// @description  Quét media + trình phát riêng
// @author       You
// @match        *://*/*
// @grant        none
// @run-at       document-start
// ==/UserScript==

(function () {
    'use strict';

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
        return u.replace(/\\u002F/gi,'/').replace(/\\\//g,'/').replace(/&amp;/g,'&').replace(/\\"/g,'').replace(/["')\]>]+$/,'').trim();
    }

    function findUrls(text, source) {
        if (!text || typeof text !== 'string') return;
        if (text.length > 5000000) {
            for (let i = 0; i < text.length; i += 500000) findUrls(text.substring(i, i+500000), source);
            return;
        }
        patterns.forEach(p => {
            const re = new RegExp(p.re.source, p.re.flags);
            let m;
            while ((m = re.exec(text)) !== null) {
                let u = cleanUrl(m[0]);
                if (!u.startsWith('http') || AD.test(u)) continue;
                if (!urls.has(u) || urls.get(u).priority > p.priority) {
                    urls.set(u, { url: u, type: p.type, source, priority: p.priority, timestamp: Date.now() });
                    updateBadge();
                }
            }
        });
    }

    function scan(doc, src) {
        try {
            doc.querySelectorAll('video,source,audio').forEach(v => {
                if (v.src) findUrls(v.src, src+':el');
                if (v.currentSrc) findUrls(v.currentSrc, src+':cur');
            });
            doc.querySelectorAll('script').forEach(s => findUrls(s.textContent, src+':script'));
            findUrls(doc.documentElement.outerHTML, src+':html');
            doc.querySelectorAll('iframe').forEach((f,i) => {
                try { if (f.contentDocument) scan(f.contentDocument, src+':iframe'+i); } catch(e) {}
            });
        } catch(e) {}
    }

    function scanPerf() {
        try {
            performance.getEntriesByType('resource').forEach(e => { if (e.name) findUrls(e.name,'perf'); });
        } catch(e) {}
        document.querySelectorAll('iframe').forEach(f => {
            try {
                const w = f.contentWindow;
                if (w && w.performance) w.performance.getEntriesByType('resource').forEach(e => { if (e.name) findUrls(e.name,'iframe:perf'); });
            } catch(e) {}
        });
    }

    const _fetch = window.fetch;
    const _xhrOpen = XMLHttpRequest.prototype.open;
    window.fetch = function(...a) {
        try { const u = typeof a[0]==='string'?a[0]:(a[0]&&a[0].url)||''; if (u) findUrls(u,'fetch'); } catch(e) {}
        return _fetch.apply(this, a);
    };
    XMLHttpRequest.prototype.open = function(m,u) {
        try { if (u) findUrls(String(u),'xhr'); } catch(e) {}
        return _xhrOpen.apply(this, arguments);
    };

    try {
        new PerformanceObserver(list => {
            list.getEntries().forEach(e => { if (e.name) findUrls(e.name,'perf:live'); });
        }).observe({ entryTypes: ['resource'] });
    } catch(e) {}

    function parseM3U8(url, cb) {
        fetch(url, { headers: { Referer: location.href } })
            .then(r => r.text())
            .then(text => {
                if (!text.includes('#EXT-X-STREAM-INF')) { cb(null); return; }
                const qs = [], lines = text.split('\n');
                for (let i = 0; i < lines.length; i++) {
                    const l = lines[i].trim();
                    if (!l.startsWith('#EXT-X-STREAM-INF')) continue;
                    const next = (lines[i+1]||'').trim();
                    if (!next || next.startsWith('#')) continue;
                    const res = (l.match(/RESOLUTION=(\d+x\d+)/)||[])[1]||'';
                    const bw  = parseInt((l.match(/BANDWIDTH=(\d+)/)||[])[1]||0);
                    const h   = res ? parseInt(res.split('x')[1]) : 0;
                    const label = h ? h+'p' : Math.round(bw/1000)+'kbps';
                    let su = next.startsWith('http') ? next : url.substring(0, url.lastIndexOf('/')+1)+next;
                    qs.push({ label, res, bw, url: su });
                }
                qs.sort((a,b) => parseInt(b.res.split('x')[1]||0) - parseInt(a.res.split('x')[1]||0));
                cb(qs.length ? qs : null);
            }).catch(() => cb(null));
    }

    let updateBadge = () => {};

    // ── CSS ──────────────────────────────────────────
    const CSS = `
        #ump-fab {
            position:fixed; bottom:20px; right:20px;
            width:54px; height:54px;
            background:#e53935; color:white;
            border:none; border-radius:50%;
            font-size:22px; cursor:pointer;
            box-shadow:0 4px 20px rgba(229,57,53,.5);
            z-index:2147483647;
            display:flex; align-items:center; justify-content:center;
        }
        #ump-fab:active { transform:scale(.88); }
        #ump-badge {
            position:absolute; top:-3px; right:-3px;
            background:#43a047; color:white;
            font-size:10px; min-width:18px; height:18px;
            border-radius:9px; padding:0 4px;
            display:none; align-items:center; justify-content:center;
            font-weight:700;
        }
        #ump-bd {
            position:fixed; inset:0; background:rgba(0,0,0,.7);
            z-index:2147483640; display:none;
        }
        #ump-bd.on { display:block; }

        /* LIST */
        #ump-panel {
            position:fixed; bottom:84px; right:12px;
            width:360px; max-width:calc(100vw - 24px); max-height:66vh;
            background:#161616; border-radius:14px;
            z-index:2147483647;
            display:none; flex-direction:column;
            box-shadow:0 12px 40px rgba(0,0,0,.9);
            overflow:hidden; font-family:-apple-system,sans-serif;
        }
        #ump-panel.on { display:flex; }
        #ump-phead {
            background:#1e1e1e; padding:11px 13px;
            display:flex; align-items:center; gap:8px;
            border-bottom:1px solid #2a2a2a; flex-shrink:0;
        }
        #ump-phead-title { color:#fff; font-size:14px; font-weight:700; flex:1; }
        #ump-pbody { overflow-y:auto; flex:1; padding:8px; }
        .hb { border:none; border-radius:6px; cursor:pointer; font-size:11px; padding:6px 10px; color:white; font-weight:600; }
        .hb.bl { background:#1565c0; }
        .hb.gy { background:#333; }

        .li {
            display:flex; align-items:center; gap:8px;
            background:#1e1e1e; border-radius:10px;
            padding:10px 12px; margin:5px 0;
            border:2px solid transparent; transition:border-color .12s;
            font-family:-apple-system,sans-serif;
        }
        .li:hover { border-color:#e53935; }
        .li-badge { font-size:10px; font-weight:700; padding:3px 7px; border-radius:5px; color:white; flex-shrink:0; cursor:pointer; }
        .lb-m3u8 { background:#6a1b9a; }
        .lb-mpd  { background:#1565c0; }
        .lb-mp4  { background:#2e7d32; }
        .lb-webm { background:#37474f; }
        .lb-other{ background:#424242; }
        .li-info { flex:1; overflow:hidden; cursor:pointer; }
        .li-name { color:#eee; font-size:12px; font-weight:500; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .li-url  { color:#555; font-size:10px; font-family:monospace; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .li-more { background:none; border:none; color:#555; font-size:22px; cursor:pointer; padding:2px 6px; flex-shrink:0; line-height:1; }
        .li-more:hover { color:#ccc; }
        .ump-empty { color:#555; text-align:center; padding:28px 16px; font-size:13px; line-height:2; }
        .ump-empty b { color:#888; }

        /* CONTEXT MENU */
        #ump-ctx {
            position:fixed;
            background:#1e1e1e; border-radius:12px;
            border:1px solid #2a2a2a;
            z-index:2147483647; min-width:210px;
            box-shadow:0 8px 28px rgba(0,0,0,.9);
            overflow:hidden; display:none;
            font-family:-apple-system,sans-serif;
        }
        #ump-ctx.on { display:block; }
        .ctx-item {
            display:flex; align-items:center; gap:10px;
            padding:12px 15px; cursor:pointer; color:#ddd; font-size:13px;
        }
        .ctx-item:hover { background:#2a2a2a; }
        .ctx-item:active { background:#333; }
        .ctx-sep { height:1px; background:#2a2a2a; margin:2px 0; }
        .ctx-item.red { color:#ef5350; }

        /* PLAYER */
        #ump-player {
            position:fixed; inset:0; background:#000;
            z-index:2147483647; display:none; flex-direction:column;
            font-family:-apple-system,sans-serif; touch-action:none;
        }
        #ump-player.on { display:flex; }

        #ump-topbar {
            background:linear-gradient(to bottom, rgba(0,0,0,.85) 0%, transparent 100%);
            padding:12px 12px 28px;
            display:flex; align-items:center; gap:8px;
            position:absolute; top:0; left:0; right:0;
            z-index:10; transition:opacity .25s;
        }
        #ump-topbar.hide { opacity:0; pointer-events:none; }
        #ump-back-btn { background:none; border:none; color:white; font-size:24px; cursor:pointer; padding:4px 8px; }
        #ump-p-title { flex:1; color:white; font-size:13px; font-weight:500; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        /* NÚT BA CHẤM - z-index cao hơn topbar */
        #ump-p-menu {
            background:rgba(255,255,255,.15); border:none; color:white;
            font-size:20px; cursor:pointer; padding:6px 10px;
            border-radius:8px; z-index:20; position:relative;
            -webkit-tap-highlight-color:transparent;
        }
        #ump-p-menu:active { background:rgba(255,255,255,.3); }

        #ump-vwrap {
            flex:1; position:relative; background:#000;
            display:flex; align-items:center; justify-content:center;
            overflow:hidden;
        }
        #ump-vid {
            width:100%; height:100%; object-fit:contain;
            transform-origin:center center;
            transition:transform .1s;
        }

        #ump-botbar {
            background:linear-gradient(to top, rgba(0,0,0,.9) 0%, transparent 100%);
            padding:28px 12px 14px;
            position:absolute; bottom:0; left:0; right:0;
            z-index:10; transition:opacity .25s;
        }
        #ump-botbar.hide { opacity:0; pointer-events:none; }

        #ump-progress-wrap {
            display:flex; align-items:center; gap:8px; margin-bottom:10px;
        }
        #ump-time-cur { color:#fff; font-size:11px; min-width:36px; }
        #ump-prog-bar {
            flex:1; height:4px; background:rgba(255,255,255,.25);
            border-radius:2px; position:relative; cursor:pointer;
            padding:8px 0; margin:-8px 0;
        }
        #ump-prog-fill { height:4px; background:#e53935; border-radius:2px; width:0%; pointer-events:none; }
        #ump-prog-thumb {
            width:14px; height:14px; border-radius:50%; background:#fff;
            position:absolute; top:50%; transform:translate(-50%,-50%);
            left:0%; pointer-events:none; box-shadow:0 1px 4px rgba(0,0,0,.5);
        }
        #ump-time-dur { color:#aaa; font-size:11px; min-width:36px; text-align:right; }

        #ump-controls {
            display:flex; align-items:center; justify-content:space-between;
        }
        #ump-ctrl-left, #ump-ctrl-right { display:flex; align-items:center; gap:4px; }
        .ctrl-btn {
            background:none; border:none; color:white;
            font-size:20px; cursor:pointer; padding:6px;
            border-radius:50%; -webkit-tap-highlight-color:transparent;
        }
        .ctrl-btn:active { background:rgba(255,255,255,.15); }
        .ctrl-btn.lg { font-size:30px; }
        #ump-vol-wrap { display:flex; align-items:center; gap:4px; }
        #ump-vol-sl {
            width:65px; -webkit-appearance:none;
            height:3px; border-radius:2px; outline:none;
            background:rgba(255,255,255,.3);
        }
        #ump-vol-sl::-webkit-slider-thumb {
            -webkit-appearance:none; width:13px; height:13px;
            border-radius:50%; background:white; cursor:pointer;
        }
        #ump-speed-btn {
            background:rgba(255,255,255,.15); border:none; color:white;
            font-size:11px; font-weight:700; padding:4px 8px;
            border-radius:5px; cursor:pointer;
            -webkit-tap-highlight-color:transparent;
        }
        /* Rotate & Zoom btns */
        #ump-rotate-btn, #ump-zoom-btn {
            background:rgba(255,255,255,.15); border:none; color:white;
            font-size:16px; padding:5px 8px; border-radius:6px; cursor:pointer;
            -webkit-tap-highlight-color:transparent;
        }
        #ump-rotate-btn:active, #ump-zoom-btn:active { background:rgba(255,255,255,.3); }

        #ump-spinner {
            position:absolute; top:50%; left:50%;
            transform:translate(-50%,-50%);
            width:42px; height:42px;
            border:3px solid rgba(255,255,255,.2);
            border-top-color:#fff; border-radius:50%;
            animation:spin .8s linear infinite;
            display:none; z-index:3; pointer-events:none;
        }
        @keyframes spin { to { transform:translate(-50%,-50%) rotate(360deg); } }

        /* CMD MODAL */
        #ump-cmd {
            position:fixed; top:50%; left:50%;
            transform:translate(-50%,-50%);
            background:#161616; border-radius:14px;
            z-index:2147483647; width:94%; max-width:500px;
            padding:16px; display:none;
            box-shadow:0 12px 40px rgba(0,0,0,.95);
            font-family:-apple-system,sans-serif;
            max-height:85vh; overflow-y:auto;
        }
        #ump-cmd.on { display:block; }
        #ump-cmd-head {
            display:flex; justify-content:space-between; align-items:center;
            margin-bottom:12px;
        }
        #ump-cmd-head h4 { color:#fff; font-size:14px; margin:0; }
        #ump-cmd-head span { color:#555; font-size:10px; font-family:monospace; }
        .cmd-tabs { display:flex; gap:5px; flex-wrap:wrap; margin-bottom:12px; }
        .ctab { background:#222; color:#777; border:none; padding:6px 11px; border-radius:6px; font-size:11px; cursor:pointer; }
        .ctab.on { background:#e53935; color:white; }

        /* Từng lệnh trong ô riêng */
        .cmd-block { margin-bottom:10px; }
        .cmd-block-label { color:#555; font-size:10px; margin-bottom:4px; font-weight:600; text-transform:uppercase; letter-spacing:.5px; }
        .cmd-row { display:flex; gap:6px; align-items:flex-start; }
        .cmd-ta {
            flex:1; background:#0d0d0d; color:#4caf50;
            border:1px solid #222; border-radius:8px;
            padding:10px; font-family:monospace; font-size:11px;
            resize:none; box-sizing:border-box;
            line-height:1.6; min-height:38px;
            overflow:hidden;
        }
        .cmd-cp-single {
            background:#1565c0; border:none; color:white;
            border-radius:8px; padding:8px 10px; cursor:pointer;
            font-size:13px; flex-shrink:0; align-self:stretch;
            display:flex; align-items:center;
        }
        .cmd-cp-single:active { background:#1976d2; }
        .cmd-acts { display:flex; gap:8px; margin-top:12px; }
        .cmd-btn { border:none; border-radius:8px; cursor:pointer; font-size:12px; padding:10px; color:white; font-weight:600; }
        .cmd-btn.r { background:#c62828; }
        .cmd-btn.g { background:#2e7d32; }

        /* QUALITY SHEET */
        #ump-qsheet {
            position:fixed; bottom:0; left:0; right:0;
            background:#161616; border-radius:14px 14px 0 0;
            z-index:2147483647; padding:0 0 24px;
            display:none; max-height:55vh; overflow-y:auto;
            font-family:-apple-system,sans-serif;
        }
        #ump-qsheet.on { display:block; }
        #ump-qsheet-title { color:#888; font-size:12px; font-weight:600; padding:14px 16px 8px; text-transform:uppercase; letter-spacing:.5px; }
        .q-item { display:flex; align-items:center; justify-content:space-between; padding:13px 16px; cursor:pointer; color:#ddd; font-size:14px; }
        .q-item:hover { background:#1e1e1e; }
        .q-item.cur { color:#e53935; font-weight:700; }
        .q-check { color:#e53935; font-size:18px; }

        #ump-toast {
            position:fixed; bottom:84px; left:50%; transform:translateX(-50%);
            background:#222; color:white; padding:9px 18px; border-radius:18px;
            font-size:13px; z-index:2147483647;
            display:none; white-space:nowrap;
            box-shadow:0 4px 16px rgba(0,0,0,.6);
            pointer-events:none;
        }
    `;

    function initUI() {
        if (document.getElementById('ump-fab')) return;
        const style = document.createElement('style');
        style.textContent = CSS;
        document.head.appendChild(style);

        function mk(tag, props, parent) {
            const e = document.createElement(tag);
            if (props) Object.assign(e, props);
            if (parent) parent.appendChild(e);
            return e;
        }

        mk('button', { id:'ump-fab', innerHTML:`🎬<span id="ump-badge"></span>` }, document.body);
        mk('div', { id:'ump-bd' }, document.body);

        mk('div', { id:'ump-panel', innerHTML:`
            <div id="ump-phead">
                <span id="ump-phead-title">🎬 Streams (0)</span>
                <button class="hb bl" id="btn-scan">🔍 Quét</button>
                <button class="hb gy" id="btn-clear">🗑</button>
            </div>
            <div id="ump-pbody"></div>
        `}, document.body);

        mk('div', { id:'ump-ctx' }, document.body);

        mk('div', { id:'ump-player', innerHTML:`
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
                    <div id="ump-prog-bar"><div id="ump-prog-fill"></div><div id="ump-prog-thumb"></div></div>
                    <span id="ump-time-dur">0:00</span>
                </div>
                <div id="ump-controls">
                    <div id="ump-ctrl-left">
                        <div id="ump-vol-wrap">
                            <button class="ctrl-btn" id="ump-mute-btn">🔊</button>
                            <input type="range" id="ump-vol-sl" min="0" max="1" step="0.05" value="1">
                        </div>
                        <button id="ump-speed-btn">1x</button>
                    </div>
                    <div style="display:flex;gap:4px;align-items:center">
                        <button class="ctrl-btn" id="ump-rew">⏪</button>
                        <button class="ctrl-btn lg" id="ump-play-btn">▶️</button>
                        <button class="ctrl-btn" id="ump-fwd">⏩</button>
                    </div>
                    <div id="ump-ctrl-right">
                        <button id="ump-rotate-btn" title="Xoay">⟳</button>
                        <button id="ump-zoom-btn" title="Phóng to">⤢</button>
                    </div>
                </div>
            </div>
        `}, document.body);

        mk('div', { id:'ump-cmd' }, document.body);
        mk('div', { id:'ump-qsheet', innerHTML:`
            <div id="ump-qsheet-title">Chọn chất lượng</div>
            <div id="ump-qlist"></div>
        `}, document.body);
        mk('div', { id:'ump-toast' }, document.body);

        initLogic();
    }

    function initLogic() {
        const $ = id => document.getElementById(id);

        let curUrl = null, curItem = null, hlsInst = null;
        let ctab = 'ytdlp';
        let speedIdx = 2;
        const speeds = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3];
        let barTimer = null;
        let rotDeg = 0;
        let zoomLevel = 1;
        let seeking = false;

        // ── Toast ──
        function toast(msg, dur=2200) {
            const t = $('ump-toast');
            t.textContent = msg;
            t.style.display = 'block';
            clearTimeout(t._t);
            t._t = setTimeout(() => t.style.display='none', dur);
        }

        // ── Clipboard ──
        function cp(text) {
            if (navigator.clipboard) {
                navigator.clipboard.writeText(text).catch(() => cp2(text));
            } else cp2(text);
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
                const p = new URL(url).pathname.split('/').filter(Boolean).pop()||'';
                const n = decodeURIComponent(p.split('?')[0]);
                if (n && /\.\w{2,6}$/.test(n)) return n;
            } catch(e) {}
            return 'video_'+Date.now()+'.mp4';
        }

        function fmtTime(s) {
            if (isNaN(s)) return '0:00';
            const m = Math.floor(s/60), sec = Math.floor(s%60);
            return m+':'+(sec<10?'0':'')+sec;
        }

        updateBadge = function() {
            const b = $('ump-badge');
            if (!b) return;
            const n = urls.size;
            b.style.display = n>0 ? 'flex' : 'none';
            b.textContent = n>99 ? '99+' : n;
        };

        // ── Scan ──
        function doScan() {
            scan(document,'main'); scanPerf(); updateBadge();
            renderList(); toast(`🔍 Tìm thấy ${urls.size} stream`);
        }

        // ── Render list ──
        function renderList() {
            const body = $('ump-pbody');
            $('ump-phead-title').textContent = `🎬 Streams (${urls.size})`;
            if (!urls.size) {
                body.innerHTML = `<div class="ump-empty">Chưa có stream.<br><b>▶️ Phát video rồi nhấn 🔍 Quét</b></div>`;
                return;
            }
            body.innerHTML = '';
            const sorted = [...urls.values()].sort((a,b) => a.priority-b.priority);
            sorted.forEach(item => {
                const d = document.createElement('div');
                d.className = 'li';
                const tc = item.type.toLowerCase();
                const bc = ['m3u8','mpd','mp4','webm'].includes(tc) ? 'lb-'+tc : 'lb-other';
                d.innerHTML = `
                    <span class="li-badge ${bc}">${item.type}</span>
                    <div class="li-info">
                        <div class="li-name">${fname(item.url)}</div>
                        <div class="li-url">${item.url}</div>
                    </div>
                    <button class="li-more">⋮</button>
                `;
                // click info → play
                d.querySelector('.li-info').onclick = () => { playItem(item,'Auto'); closePanel(); };
                d.querySelector('.li-badge').onclick = () => { playItem(item,'Auto'); closePanel(); };
                // three dots
                d.querySelector('.li-more').onclick = (e) => {
                    e.stopPropagation();
                    showCtx(e.currentTarget, item);
                };
                body.appendChild(d);
            });
        }

        // ── Context Menu ──
        function showCtx(anchor, item) {
            curItem = item;
            const ctx = $('ump-ctx');
            const isStream = ['M3U8','MPD'].includes(item.type);
            ctx.innerHTML = `
                <div class="ctx-item" data-a="play">▶️ &nbsp;Phát</div>
                ${isStream ? `<div class="ctx-item" data-a="quality">🎞 &nbsp;Chọn chất lượng</div>` : ''}
                <div class="ctx-sep"></div>
                <div class="ctx-item" data-a="copy">📋 &nbsp;Copy link</div>
                <div class="ctx-item" data-a="share">🔗 &nbsp;Chia sẻ</div>
                ${!isStream ? `<div class="ctx-item" data-a="dl">⬇️ &nbsp;Download</div>` : ''}
                <div class="ctx-sep"></div>
                <div class="ctx-item" data-a="cmd">💻 &nbsp;Lệnh tải</div>
                <div class="ctx-item red" data-a="remove">🗑 &nbsp;Xóa</div>
            `;

            // position
            const rect = anchor.getBoundingClientRect();
            const ctxW = 215;
            let left = rect.right - ctxW;
            if (left < 8) left = 8;
            let top = rect.bottom + 6;
            if (top + 300 > window.innerHeight) top = rect.top - 310;
            ctx.style.left = left + 'px';
            ctx.style.top  = top + 'px';
            ctx.style.right = 'auto';

            ctx.classList.add('on');
            $('ump-bd').classList.add('on');

            ctx.querySelectorAll('[data-a]').forEach(btn => {
                btn.onclick = e => {
                    e.stopPropagation();
                    const a = btn.dataset.a;
                    closeCtx();
                    if (a==='play')   { playItem(curItem,'Auto'); closePanel(); }
                    if (a==='quality'){ loadQuality(curItem, true); }
                    if (a==='copy')   { cp(curItem.url); toast('✅ Đã copy link!'); }
                    if (a==='share')  { doShare(curItem.url); }
                    if (a==='dl')     { doDl(curItem.url); }
                    if (a==='cmd')    { openCmd(curItem.url); }
                    if (a==='remove') { urls.delete(curItem.url); updateBadge(); renderList(); }
                };
            });
        }

        function closeCtx() {
            $('ump-ctx').classList.remove('on');
            refreshBd();
        }

        // ── Play ──
        function playItem(item, qualityLabel) {
            curItem = item; curUrl = item.url;
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
                curItem._qualities = qs || [];
                if (!qs || !qs.length) {
                    if (showSheet) toast('Không có multi-quality');
                    else startPlay(item.url, item.type, 'Auto');
                    return;
                }
                if (showSheet) { showQualitySheet(qs, item); }
                else {
                    const chosen = (preferLabel && preferLabel!=='Auto')
                        ? (qs.find(q=>q.label===preferLabel)||qs[0]) : qs[0];
                    startPlay(chosen.url, item.type, chosen.label);
                }
            });
        }

        function showQualitySheet(qs, item) {
            const list = $('ump-qlist');
            list.innerHTML = [
                { label:'Auto (Master)', url: item.url },
                ...(qs||[])
            ].map(q => `
                <div class="q-item ${curUrl===q.url?'cur':''}" data-url="${q.url}" data-label="${q.label||'Auto'}">
                    <span>${q.label||'Auto (Master)'}</span>
                    ${curUrl===q.url ? '<span class="q-check">✓</span>' : ''}
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
        function closeQSheet() { $('ump-qsheet').classList.remove('on'); refreshBd(); }

        function startPlay(url, type, qualLabel) {
            curUrl = url;
            if (hlsInst) { hlsInst.destroy(); hlsInst = null; }
            const vid = $('ump-vid');
            vid.pause(); vid.removeAttribute('src'); vid.load();
            showSpinner(true);
            // reset transform
            rotDeg = 0; zoomLevel = 1; applyTransform();

            if (type==='M3U8') {
                if (vid.canPlayType('application/vnd.apple.mpegurl')) {
                    vid.src = url; vid.play().catch(()=>{});
                } else if (window.Hls && window.Hls.isSupported()) {
                    doHls(url, vid);
                } else {
                    loadScript('https://cdn.jsdelivr.net/npm/hls.js@latest/dist/hls.min.js', ()=>doHls(url,vid));
                    return;
                }
            } else if (type==='MPD') {
                if (window.dashjs) {
                    window.dashjs.MediaPlayer().create().initialize(vid, url, true);
                } else {
                    loadScript('https://cdn.dashjs.org/latest/dash.all.min.js',
                        ()=>window.dashjs.MediaPlayer().create().initialize(vid,url,true));
                    return;
                }
            } else {
                vid.src = url; vid.play().catch(()=>{});
            }

            $('ump-p-title').textContent = fname(url) + (qualLabel&&qualLabel!=='Auto' ? ' · '+qualLabel : '');
            $('ump-player').classList.add('on');
            $('ump-bd').classList.add('on');
            showBars(true);
        }

        function doHls(url, vid) {
            const hls = new window.Hls({ enableWorker:true, lowLatencyMode:true });
            hls.loadSource(url); hls.attachMedia(vid);
            hls.on(window.Hls.Events.MANIFEST_PARSED, ()=>vid.play().catch(()=>{}));
            hls.on(window.Hls.Events.ERROR, (e,d)=>{ if(d.fatal) toast('❌ '+d.details); });
            hlsInst = hls;
        }

        function loadScript(src, cb) {
            const s = document.createElement('script');
            s.src = src; s.onload = cb; document.head.appendChild(s);
        }

        // ── Video Transform (rotate + zoom) ──
        function applyTransform() {
            $('ump-vid').style.transform = `rotate(${rotDeg}deg) scale(${zoomLevel})`;
        }
        $('ump-rotate-btn').onclick = () => {
            rotDeg = (rotDeg + 90) % 360;
            applyTransform();
        };
        const zoomLevels = [1, 1.25, 1.5, 2, 0.75];
        let zoomIdx = 0;
        $('ump-zoom-btn').onclick = () => {
            zoomIdx = (zoomIdx+1) % zoomLevels.length;
            zoomLevel = zoomLevels[zoomIdx];
            $('ump-zoom-btn').textContent = zoomLevel===1 ? '⤢' : zoomLevel+'x';
            applyTransform();
        };

        // ── Player Controls ──
        function showSpinner(s) { $('ump-spinner').style.display = s?'block':'none'; }

        function showBars(force) {
            $('ump-topbar').classList.remove('hide');
            $('ump-botbar').classList.remove('hide');
            clearTimeout(barTimer);
            if (!force && !$('ump-vid').paused) {
                barTimer = setTimeout(()=>{
                    $('ump-topbar').classList.add('hide');
                    $('ump-botbar').classList.add('hide');
                }, 3500);
            }
        }

        // tap vwrap → toggle bars / play-pause
        let lastTap = 0;
        $('ump-vwrap').addEventListener('click', e => {
            // double tap → seek
            const now = Date.now();
            if (now - lastTap < 300) {
                const rect = $('ump-vwrap').getBoundingClientRect();
                if (e.clientX < rect.width/2) {
                    $('ump-vid').currentTime = Math.max(0, $('ump-vid').currentTime-10);
                    toast('⏪ -10s');
                } else {
                    $('ump-vid').currentTime = Math.min($('ump-vid').duration||Infinity, $('ump-vid').currentTime+10);
                    toast('⏩ +10s');
                }
                lastTap = 0; return;
            }
            lastTap = now;

            if ($('ump-topbar').classList.contains('hide')) {
                showBars(false);
            } else {
                const vid = $('ump-vid');
                vid.paused ? vid.play().catch(()=>{}) : vid.pause();
            }
        });

        const vid = $('ump-vid');
        vid.addEventListener('play',  ()=>{ $('ump-play-btn').textContent='⏸'; showSpinner(false); showBars(false); });
        vid.addEventListener('pause', ()=>{ $('ump-play-btn').textContent='▶️'; showBars(true); });
        vid.addEventListener('waiting', ()=>showSpinner(true));
        vid.addEventListener('canplay', ()=>showSpinner(false));
        vid.addEventListener('timeupdate', updateProgress);
        vid.addEventListener('loadedmetadata', updateProgress);
        vid.addEventListener('ended', ()=>{ $('ump-play-btn').textContent='▶️'; showBars(true); });

        function updateProgress() {
            const v = $('ump-vid');
            if (!v.duration||isNaN(v.duration)) return;
            const pct = (v.currentTime/v.duration)*100;
            $('ump-prog-fill').style.width = pct+'%';
            $('ump-prog-thumb').style.left = pct+'%';
            $('ump-time-cur').textContent = fmtTime(v.currentTime);
            $('ump-time-dur').textContent = fmtTime(v.duration);
        }

        // Progress seek
        const progBar = $('ump-prog-bar');
        function seekTo(clientX) {
            const v = $('ump-vid');
            if (!v.duration) return;
            const rect = progBar.getBoundingClientRect();
            const pct = Math.max(0, Math.min(1, (clientX-rect.left)/rect.width));
            v.currentTime = pct * v.duration;
            updateProgress();
        }
        progBar.addEventListener('click', e => seekTo(e.clientX));
        progBar.addEventListener('touchstart', e=>{ seeking=true; seekTo(e.touches[0].clientX); }, {passive:true});
        progBar.addEventListener('touchmove',  e=>{ if(seeking) seekTo(e.touches[0].clientX); }, {passive:true});
        progBar.addEventListener('touchend',   ()=>{ seeking=false; });

        // Buttons
        $('ump-play-btn').onclick = ()=>{ const v=$('ump-vid'); v.paused?v.play().catch(()=>{}):v.pause(); };
        $('ump-rew').onclick = ()=>{ $('ump-vid').currentTime=Math.max(0,$('ump-vid').currentTime-10); toast('⏪ -10s'); };
        $('ump-fwd').onclick = ()=>{ $('ump-vid').currentTime=Math.min($('ump-vid').duration||Infinity,$('ump-vid').currentTime+10); toast('⏩ +10s'); };
        $('ump-mute-btn').onclick = ()=>{ const v=$('ump-vid'); v.muted=!v.muted; $('ump-mute-btn').textContent=v.muted?'🔇':'🔊'; };
        $('ump-vol-sl').addEventListener('input', function(){
            const v=$('ump-vid'); v.volume=parseFloat(this.value); v.muted=v.volume===0;
            $('ump-mute-btn').textContent=v.volume===0?'🔇':'🔊';
        });
        $('ump-speed-btn').onclick = ()=>{
            speedIdx=(speedIdx+1)%speeds.length;
            $('ump-vid').playbackRate=speeds[speedIdx];
            $('ump-speed-btn').textContent=speeds[speedIdx]+'x';
        };

        // ── Fullscreen: dùng native browser ──
        // Không có nút fullscreen riêng trong player,
        // user bấm fullscreen trên native controls của <video>
        // Thêm controls vào video để có nút fullscreen native
        $('ump-vid').controls = false; // controls tùy chỉnh của mình

        // Thêm nút fullscreen native
        const fsBtn = document.createElement('button');
        fsBtn.className = 'ctrl-btn';
        fsBtn.textContent = '⛶';
        fsBtn.title = 'Toàn màn hình';
        fsBtn.onclick = () => {
            const v = $('ump-vid');
            // Dùng fullscreen của browser trên chính video element
            if (v.requestFullscreen) v.requestFullscreen();
            else if (v.webkitRequestFullscreen) v.webkitRequestFullscreen();
            else if (v.webkitEnterFullscreen) v.webkitEnterFullscreen(); // iOS
        };
        $('ump-ctrl-right').appendChild(fsBtn);

        // ── Back ──
        $('ump-back-btn').onclick = ()=>{
            const v=$('ump-vid'); v.pause(); v.src='';
            if (hlsInst) { hlsInst.destroy(); hlsInst=null; }
            $('ump-player').classList.remove('on');
            refreshBd();
        };

        // ── Player menu ⋮ (FIX: không dùng backdrop overlay) ──
        $('ump-p-menu').onclick = e => {
            e.stopPropagation();
            if (!curItem) return;
            // Đóng bars auto-hide tạm thời
            clearTimeout(barTimer);
            showCtxPlayer(e.currentTarget, curItem);
        };

        function showCtxPlayer(anchor, item) {
            const ctx = $('ump-ctx');
            const isStream = ['M3U8','MPD'].includes(item.type);
            ctx.innerHTML = `
                <div class="ctx-item" data-a="quality-p">${isStream?'🎞 Chất lượng':'📋 Thông tin'}</div>
                <div class="ctx-sep"></div>
                <div class="ctx-item" data-a="copy-p">📋 Copy link</div>
                <div class="ctx-item" data-a="share-p">🔗 Chia sẻ</div>
                <div class="ctx-item" data-a="cmd-p">💻 Lệnh tải</div>
                <div class="ctx-sep"></div>
                <div class="ctx-item" data-a="list-p">📋 Danh sách</div>
            `;
            const rect = anchor.getBoundingClientRect();
            const ctxW = 215;
            let left = rect.right - ctxW;
            if (left < 8) left = 8;
            ctx.style.left = left+'px';
            ctx.style.top  = (rect.bottom+6)+'px';
            ctx.style.right = 'auto';
            ctx.classList.add('on');
            // KHÔNG add backdrop vì player đang hiện

            ctx.querySelectorAll('[data-a]').forEach(btn => {
                btn.onclick = e2 => {
                    e2.stopPropagation();
                    ctx.classList.remove('on');
                    const a = btn.dataset.a;
                    if (a==='quality-p') { loadQuality(item,true); }
                    if (a==='copy-p')    { cp(curUrl); toast('✅ Đã copy link!'); showBars(false); }
                    if (a==='share-p')   { doShare(curUrl); }
                    if (a==='cmd-p')     { openCmd(curUrl); }
                    if (a==='list-p')    {
                        $('ump-player').classList.remove('on');
                        renderList();
                        $('ump-panel').classList.add('on');
                        $('ump-bd').classList.add('on');
                    }
                };
            });

            // Đóng khi click ngoài (trên player)
            const closeHandler = e2 => {
                if (!ctx.contains(e2.target)) {
                    ctx.classList.remove('on');
                    $('ump-player').removeEventListener('click', closeHandler);
                    showBars(false);
                }
            };
            setTimeout(()=> $('ump-player').addEventListener('click', closeHandler), 50);
        }

        // ── Commands ──
        const REF = location.href;
        const UA = 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36';

        // Mỗi lệnh là array of { label, cmd }
        const cmdBlocks = {
            ytdlp: url => [
                { label:'Tải tốt nhất', cmd:`yt-dlp --referer "${REF}" "${url}"` },
                { label:'Tải với header đầy đủ', cmd:`yt-dlp --referer "${REF}" --add-header "User-Agent:${UA}" --add-header "Origin:${location.origin}" -f "bestvideo+bestaudio" "${url}"` },
                { label:'Xem danh sách chất lượng', cmd:`yt-dlp -F --referer "${REF}" "${url}"` },
                { label:'Chỉ tải audio MP3', cmd:`yt-dlp -x --audio-format mp3 --referer "${REF}" "${url}"` },
            ],
            ffmpeg: url => [
                { label:'Stream copy (nhanh, không re-encode)', cmd:`ffmpeg -referer "${REF}" -user_agent "${UA}" -i "${url}" -c copy output.mp4` },
                { label:'Re-encode H264', cmd:`ffmpeg -referer "${REF}" -i "${url}" -c:v libx264 -c:a aac output.mp4` },
            ],
            wget: url => [
                { label:'Tải với referer', cmd:`wget --referer="${REF}" --user-agent="${UA}" "${url}" -O video.mp4` },
            ],
            aria2: url => [
                { label:'Tải nhanh 16 luồng', cmd:`aria2c -x 16 -s 16 -k 1M --referer="${REF}" --user-agent="${UA}" "${url}" -o video.mp4` },
            ],
            termux: url => [
                { label:'Cài tools', cmd:`pkg install python ffmpeg -y && pip install yt-dlp` },
                { label:'yt-dlp (khuyên dùng)', cmd:`yt-dlp --referer "${REF}" "${url}"` },
                { label:'FFmpeg (HLS/stream)', cmd:`ffmpeg -referer "${REF}" -i "${url}" -c copy ~/storage/downloads/video.mp4` },
            ],
        };

        function buildCmdUI(url) {
            const blocks = (cmdBlocks[ctab]||((u)=>[]))(url);
            const cmd = $('ump-cmd');
            cmd.innerHTML = `
                <div id="ump-cmd-head">
                    <h4>💻 Lệnh tải</h4>
                    <span>${fname(url)}</span>
                </div>
                <div class="cmd-tabs">
                    ${['ytdlp','ffmpeg','wget','aria2','termux'].map(t=>
                        `<button class="ctab${t===ctab?' on':''}" data-t="${t}">${t==='ytdlp'?'yt-dlp':t.charAt(0).toUpperCase()+t.slice(1)}</button>`
                    ).join('')}
                </div>
                <div id="cmd-blocks-wrap">
                    ${blocks.map((b,i)=>`
                        <div class="cmd-block">
                            <div class="cmd-block-label">${b.label}</div>
                            <div class="cmd-row">
                                <textarea class="cmd-ta" rows="2" readonly>${b.cmd}</textarea>
                                <button class="cmd-cp-single" data-ci="${i}">📋</button>
                            </div>
                        </div>
                    `).join('')}
                </div>
                <div class="cmd-acts">
                    <button class="cmd-btn g" id="cmd-cp-all">📋 Copy tất cả</button>
                    <button class="cmd-btn r" id="cmd-cl">✕ Đóng</button>
                </div>
            `;

            // Auto resize textareas
            cmd.querySelectorAll('.cmd-ta').forEach(ta => {
                ta.style.height = 'auto';
                ta.style.height = ta.scrollHeight + 'px';
            });

            // Tab switch
            cmd.querySelectorAll('.ctab').forEach(btn => {
                btn.onclick = () => { ctab = btn.dataset.t; buildCmdUI(url); };
            });

            // Copy single
            cmd.querySelectorAll('.cmd-cp-single').forEach(btn => {
                btn.onclick = () => {
                    const idx = parseInt(btn.dataset.ci);
                    cp(blocks[idx].cmd);
                    toast('✅ Đã copy!');
                };
            });

            // Copy all
            $('cmd-cp-all').onclick = () => {
                cp(blocks.map(b => `# ${b.label}\n${b.cmd}`).join('\n\n'));
                toast('✅ Đã copy tất cả!');
            };

            $('cmd-cl').onclick = () => {
                cmd.classList.remove('on');
                refreshBd();
            };
        }

        function openCmd(url) {
            curUrl = url;
            buildCmdUI(url);
            $('ump-cmd').classList.add('on');
            $('ump-bd').classList.add('on');
        }

        // ── Share / Download ──
        function doShare(url) {
            if (navigator.share) {
                navigator.share({ url }).catch(()=>{ cp(url); toast('📋 Đã copy link'); });
            } else { cp(url); toast('📋 Đã copy link'); }
        }
        function doDl(url) {
            const a = document.createElement('a');
            a.href=url; a.download=fname(url); a.click();
            toast('⬇️ Đang tải...');
        }

        // ── Panel ──
        function closePanel() {
            $('ump-panel').classList.remove('on');
            refreshBd();
        }

        function refreshBd() {
            const open = $('ump-player').classList.contains('on')
                || $('ump-panel').classList.contains('on')
                || $('ump-cmd').classList.contains('on')
                || $('ump-qsheet').classList.contains('on');
            $('ump-bd').classList.toggle('on', open);
        }

        // ── FAB ──
        $('ump-fab').onclick = () => {
            const p = $('ump-panel');
            if (p.classList.contains('on')) { closePanel(); return; }
            doScan();
            p.classList.add('on');
            $('ump-bd').classList.add('on');
        };

        $('ump-bd').onclick = e => {
            if ($('ump-ctx').classList.contains('on') && !$('ump-ctx').contains(e.target)) {
                closeCtx(); return;
            }
            if ($('ump-qsheet').classList.contains('on')) { closeQSheet(); return; }
            if ($('ump-cmd').classList.contains('on')) { $('ump-cmd').classList.remove('on'); }
            closePanel();
        };

        $('btn-scan').onclick  = e => { e.stopPropagation(); doScan(); };
        $('btn-clear').onclick = e => {
            e.stopPropagation();
            urls.clear(); updateBadge(); renderList(); toast('🗑 Đã xóa');
        };
    }

    // ── START ──
    function start() {
        new MutationObserver(muts => {
            muts.forEach(m => {
                m.addedNodes.forEach(node => {
                    if (!node||!node.querySelectorAll) return;
                    const frames = node.tagName==='IFRAME'?[node]:[...node.querySelectorAll('iframe')];
                    frames.forEach(f => {
                        f.addEventListener('load', ()=>{ try { scan(f.contentDocument,'iframe:load'); } catch(e){} });
                    });
                });
            });
        }).observe(document.documentElement, { childList:true, subtree:true });

        setInterval(()=>{ scanPerf(); updateBadge(); }, 2000);
        setTimeout(()=>{ scan(document,'init'); updateBadge(); }, 800);
        setTimeout(()=>{ scan(document,'init2'); scanPerf(); updateBadge(); }, 3000);
    }

    if (document.body) { initUI(); start(); }
    else document.addEventListener('DOMContentLoaded', ()=>{ initUI(); start(); });
})();