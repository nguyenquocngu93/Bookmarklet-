// ==UserScript==
// @name         Universal Media Player v12
// @namespace    http://tampermonkey.net/
// @version      12.0
// @description  Quét media + preview player đơn giản
// @author       You
// @match        *://*/*
// @grant        none
// @run-at       document-start
// ==/UserScript==

(function () {
    'use strict';

    // ── URL DETECTION ──
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
        return u.replace(/\\u002F/gi,'/').replace(/\\\//g,'/').replace(/&amp;/g,'&').replace(/\\"/g,'').replace(/["')\]>\s]+$/,'').trim();
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
                    urls.set(u, { url: u, type: p.type, source, priority: p.priority, ts: Date.now() });
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
                try { if (f.contentDocument) scan(f.contentDocument, src+':if'+i); } catch(e) {}
            });
        } catch(e) {}
    }

    function scanPerf(win, label) {
        try {
            (win||window).performance.getEntriesByType('resource').forEach(e => {
                if (e.name) findUrls(e.name, label||'perf');
            });
        } catch(e) {}
    }

    // Hook XHR + Fetch sớm nhất
    const _fetch = window.fetch;
    const _xhrOpen = XMLHttpRequest.prototype.open;
    window.fetch = function(...a) {
        try { const u=typeof a[0]==='string'?a[0]:(a[0]&&a[0].url)||''; if(u) findUrls(u,'fetch'); } catch(e) {}
        return _fetch.apply(this, a);
    };
    XMLHttpRequest.prototype.open = function(m,u) {
        try { if(u) findUrls(String(u),'xhr'); } catch(e) {}
        return _xhrOpen.apply(this, arguments);
    };

    // PerformanceObserver realtime
    try {
        new PerformanceObserver(list => {
            list.getEntries().forEach(e => { if(e.name) findUrls(e.name,'perf:rt'); });
        }).observe({ entryTypes:['resource'] });
    } catch(e) {}

    // Hook iframe windows
    function hookIframe(iframe) {
        try {
            const win = iframe.contentWindow;
            if (!win) return;
            // Hook fetch
            const of = win.fetch;
            if (of && win.fetch !== window.fetch) {
                win.fetch = function(...a) {
                    try { const u=typeof a[0]==='string'?a[0]:(a[0]&&a[0].url)||''; if(u) findUrls(u,'if:fetch'); } catch(e) {}
                    return of.apply(this, a);
                };
            }
            // Hook XHR
            const ox = win.XMLHttpRequest && win.XMLHttpRequest.prototype.open;
            if (ox && ox !== XMLHttpRequest.prototype.open) {
                win.XMLHttpRequest.prototype.open = function(m,u) {
                    try { if(u) findUrls(String(u),'if:xhr'); } catch(e) {}
                    return ox.apply(this, arguments);
                };
            }
            // Perf
            scanPerf(win, 'if:perf');
            // Perf observer
            try {
                new win.PerformanceObserver(list => {
                    list.getEntries().forEach(e=>{ if(e.name) findUrls(e.name,'if:perf:rt'); });
                }).observe({ entryTypes:['resource'] });
            } catch(e) {}
        } catch(e) {}
    }

    // M3U8 parser
    function parseM3U8(url, headers, cb) {
        fetch(url, { headers: { Referer: location.href, ...headers } })
            .then(r => r.text())
            .then(text => {
                if (!text.includes('#EXT-X-STREAM-INF')) { cb(null); return; }
                const qs=[], lines=text.split('\n');
                for (let i=0; i<lines.length; i++) {
                    const l=lines[i].trim();
                    if (!l.startsWith('#EXT-X-STREAM-INF')) continue;
                    const next=(lines[i+1]||'').trim();
                    if (!next||next.startsWith('#')) continue;
                    const res=(l.match(/RESOLUTION=(\d+x\d+)/)||[])[1]||'';
                    const bw=parseInt((l.match(/BANDWIDTH=(\d+)/)||[])[1]||0);
                    const h=res?parseInt(res.split('x')[1]):0;
                    const label=h?h+'p':Math.round(bw/1000)+'kbps';
                    let su=next.startsWith('http')?next:url.substring(0,url.lastIndexOf('/')+1)+next;
                    qs.push({ label, res, bw, url:su });
                }
                qs.sort((a,b)=>parseInt(b.res.split('x')[1]||0)-parseInt(a.res.split('x')[1]||0));
                cb(qs.length?qs:null);
            }).catch(()=>cb(null));
    }

    let updateBadge = () => {};

    // ── CSS ──
    const CSS = `
        #ump-fab {
            position:fixed; bottom:20px; right:20px;
            width:54px; height:54px; background:#e53935; color:white;
            border:none; border-radius:50%; font-size:22px; cursor:pointer;
            box-shadow:0 4px 20px rgba(229,57,53,.5); z-index:2147483647;
            display:flex; align-items:center; justify-content:center;
        }
        #ump-fab:active { transform:scale(.88); }
        #ump-badge {
            position:absolute; top:-3px; right:-3px;
            background:#43a047; color:white; font-size:10px;
            min-width:18px; height:18px; border-radius:9px; padding:0 4px;
            display:none; align-items:center; justify-content:center; font-weight:700;
        }
        /* Backdrop */
        #ump-bd {
            position:fixed; inset:0; background:rgba(0,0,0,.72);
            z-index:2147483640; display:none;
        }
        #ump-bd.on { display:block; }

        /* ── LIST PANEL ── */
        #ump-panel {
            position:fixed; bottom:84px; right:12px;
            width:380px; max-width:calc(100vw - 24px); max-height:68vh;
            background:#141414; border-radius:14px; z-index:2147483647;
            display:none; flex-direction:column;
            box-shadow:0 12px 40px rgba(0,0,0,.9); overflow:hidden;
            font-family:-apple-system,sans-serif;
        }
        #ump-panel.on { display:flex; }
        #ump-ph {
            background:#1c1c1c; padding:11px 13px;
            display:flex; align-items:center; gap:8px;
            border-bottom:1px solid #272727; flex-shrink:0;
        }
        #ump-ph-title { color:#fff; font-size:14px; font-weight:700; flex:1; }
        #ump-pb { overflow-y:auto; flex:1; }
        .hb { border:none; border-radius:7px; cursor:pointer; font-size:11px; padding:7px 11px; color:white; font-weight:600; }
        .hb.bl { background:#1565c0; } .hb.gy { background:#333; }

        /* List item */
        .li {
            display:flex; flex-direction:column; gap:4px;
            padding:11px 13px; border-bottom:1px solid #1e1e1e;
            cursor:pointer; transition:background .1s;
        }
        .li:hover { background:#1c1c1c; }
        .li:active { background:#222; }
        .li-top { display:flex; align-items:center; gap:8px; }
        .li-badge {
            font-size:10px; font-weight:700; padding:3px 8px;
            border-radius:5px; color:white; flex-shrink:0;
        }
        .lb-m3u8{background:#6a1b9a;} .lb-mpd{background:#1565c0;}
        .lb-mp4{background:#2e7d32;} .lb-webm{background:#37474f;} .lb-other{background:#424242;}
        .li-name { color:#eee; font-size:13px; font-weight:500; flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        /* Full URL */
        .li-url {
            color:#4fc3f7; font-size:10px; font-family:monospace;
            word-break:break-all; line-height:1.5;
            padding:6px 8px; background:#0d0d0d; border-radius:5px;
            max-height:52px; overflow:hidden;
        }
        .li-src { color:#444; font-size:10px; }

        .ump-empty { color:#555; text-align:center; padding:28px 16px; font-size:13px; line-height:2; }
        .ump-empty b { color:#888; }

        /* ── PREVIEW PLAYER ── */
        #ump-preview {
            position:fixed; bottom:0; left:0; right:0;
            background:#111; z-index:2147483647;
            display:none; flex-direction:column;
            border-radius:16px 16px 0 0;
            box-shadow:0 -8px 30px rgba(0,0,0,.8);
            font-family:-apple-system,sans-serif;
            max-height:85vh;
        }
        #ump-preview.on { display:flex; }

        /* Drag handle */
        #ump-drag-handle {
            width:40px; height:4px; background:#333; border-radius:2px;
            margin:10px auto 0; flex-shrink:0; cursor:pointer;
        }

        /* Topbar */
        #ump-prev-bar {
            display:flex; align-items:center; gap:8px;
            padding:10px 13px 8px; flex-shrink:0;
        }
        #ump-prev-title {
            flex:1; color:#ddd; font-size:12px;
            overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
        }
        /* Nút ba chấm - standalone, không phụ thuộc overlay */
        #ump-menu-btn {
            background:#2a2a2a; border:none; color:#ddd;
            width:34px; height:34px; border-radius:50%;
            font-size:18px; cursor:pointer; display:flex;
            align-items:center; justify-content:center;
            position:relative; z-index:100;
            -webkit-tap-highlight-color:transparent;
            flex-shrink:0;
        }
        #ump-menu-btn:active { background:#333; }
        #ump-close-prev {
            background:#2a2a2a; border:none; color:#aaa;
            width:34px; height:34px; border-radius:50%;
            font-size:16px; cursor:pointer; display:flex;
            align-items:center; justify-content:center;
            flex-shrink:0;
            -webkit-tap-highlight-color:transparent;
        }
        #ump-close-prev:active { background:#333; }

        /* Video */
        #ump-prev-video-wrap {
            position:relative; background:#000;
            flex-shrink:0; height:220px;
        }
        #ump-prev-vid {
            width:100%; height:100%; object-fit:contain;
            display:block;
        }
        #ump-prev-spin {
            position:absolute; top:50%; left:50%;
            transform:translate(-50%,-50%);
            width:36px; height:36px;
            border:3px solid rgba(255,255,255,.2);
            border-top-color:#fff; border-radius:50%;
            animation:spin .8s linear infinite;
            display:none; pointer-events:none;
        }
        @keyframes spin { to { transform:translate(-50%,-50%) rotate(360deg); } }

        /* Info + action bar bên dưới video */
        #ump-prev-info {
            padding:10px 13px 6px; flex-shrink:0;
        }
        #ump-prev-url {
            color:#4fc3f7; font-size:10px; font-family:monospace;
            word-break:break-all; background:#0d0d0d;
            padding:6px 8px; border-radius:6px; line-height:1.5;
            max-height:42px; overflow:hidden;
        }

        /* Action buttons */
        #ump-prev-actions {
            display:flex; gap:8px; padding:10px 13px 14px;
            flex-shrink:0; overflow-x:auto;
        }
        .pact {
            border:none; border-radius:8px; cursor:pointer;
            font-size:12px; padding:9px 14px; color:white;
            font-weight:600; white-space:nowrap; flex-shrink:0;
            -webkit-tap-highlight-color:transparent;
        }
        .pact:active { opacity:.7; }
        .pact.blue   { background:#1565c0; }
        .pact.green  { background:#2e7d32; }
        .pact.purple { background:#6a1b9a; }
        .pact.gray   { background:#333; }
        .pact.teal   { background:#00695c; }

        /* ── DROPDOWN MENU (nút ba chấm) ── */
        #ump-drop {
            position:fixed; /* fixed để không bị clip */
            background:#1e1e1e; border-radius:12px;
            border:1px solid #2a2a2a;
            z-index:2147483647; min-width:220px;
            box-shadow:0 8px 28px rgba(0,0,0,.9);
            overflow:hidden; display:none;
            font-family:-apple-system,sans-serif;
        }
        #ump-drop.on { display:block; }
        .drop-item {
            display:flex; align-items:center; gap:10px;
            padding:13px 16px; cursor:pointer; color:#ddd; font-size:13px;
        }
        .drop-item:hover { background:#2a2a2a; }
        .drop-item:active { background:#333; }
        .drop-sep { height:1px; background:#272727; }
        .drop-item.red { color:#ef5350; }

        /* ── QUALITY SHEET ── */
        #ump-qsheet {
            position:fixed; bottom:0; left:0; right:0;
            background:#161616; border-radius:14px 14px 0 0;
            z-index:2147483647; padding:0 0 24px;
            display:none; max-height:55vh; overflow-y:auto;
            font-family:-apple-system,sans-serif;
        }
        #ump-qsheet.on { display:block; }
        #ump-qsheet-title {
            color:#777; font-size:12px; font-weight:600;
            padding:14px 16px 8px; text-transform:uppercase; letter-spacing:.5px;
        }
        .q-item {
            display:flex; align-items:center; justify-content:space-between;
            padding:13px 16px; cursor:pointer; color:#ddd; font-size:14px;
        }
        .q-item:hover { background:#1e1e1e; }
        .q-item.cur { color:#e53935; font-weight:700; }

        /* ── CMD MODAL ── */
        #ump-cmd {
            position:fixed; top:50%; left:50%;
            transform:translate(-50%,-50%);
            background:#141414; border-radius:14px;
            z-index:2147483647; width:94%; max-width:500px;
            padding:16px; display:none;
            box-shadow:0 12px 40px rgba(0,0,0,.95);
            font-family:-apple-system,sans-serif;
            max-height:85vh; overflow-y:auto;
        }
        #ump-cmd.on { display:block; }
        .cmd-head {
            display:flex; justify-content:space-between; align-items:flex-start;
            margin-bottom:12px;
        }
        .cmd-head h4 { color:#fff; font-size:14px; margin:0; }
        .cmd-head-url { color:#555; font-size:10px; font-family:monospace; margin-top:3px; word-break:break-all; }
        .cmd-tabs { display:flex; gap:5px; flex-wrap:wrap; margin-bottom:12px; }
        .ctab { background:#222; color:#777; border:none; padding:6px 11px; border-radius:6px; font-size:11px; cursor:pointer; }
        .ctab.on { background:#e53935; color:white; }
        .cmd-block { margin-bottom:10px; }
        .cmd-block-label { color:#555; font-size:10px; margin-bottom:4px; font-weight:600; text-transform:uppercase; letter-spacing:.5px; }
        .cmd-row { display:flex; gap:6px; align-items:flex-start; }
        .cmd-ta {
            flex:1; background:#0d0d0d; color:#4caf50;
            border:1px solid #1e1e1e; border-radius:8px;
            padding:10px; font-family:monospace; font-size:11px;
            box-sizing:border-box; line-height:1.6;
            resize:none; overflow:hidden;
        }
        .cmd-cp-btn {
            background:#1565c0; border:none; color:white;
            border-radius:8px; padding:8px 10px; cursor:pointer;
            font-size:14px; flex-shrink:0; align-self:stretch;
            display:flex; align-items:center;
        }
        .cmd-cp-btn:active { background:#1976d2; }
        .cmd-acts { display:flex; gap:8px; margin-top:12px; }
        .cmd-btn { border:none; border-radius:8px; cursor:pointer; font-size:12px; padding:10px; color:white; font-weight:600; }
        .cmd-btn.r { background:#c62828; } .cmd-btn.g { background:#2e7d32; }

        #ump-toast {
            position:fixed; bottom:20px; left:50%; transform:translateX(-50%);
            background:#222; color:white; padding:9px 18px; border-radius:18px;
            font-size:13px; z-index:2147483647;
            display:none; white-space:nowrap;
            box-shadow:0 4px 16px rgba(0,0,0,.6); pointer-events:none;
        }
    `;

    function initUI() {
        if (document.getElementById('ump-fab')) return;
        const style = document.createElement('style');
        style.textContent = CSS;
        document.head.appendChild(style);

        function mk(tag, html, parent) {
            const e = document.createElement(tag);
            if (html) e.innerHTML = html;
            if (parent) parent.appendChild(e);
            return e;
        }

        // FAB
        const fab = mk('button', `🎬<span id="ump-badge"></span>`, document.body);
        fab.id = 'ump-fab';

        // Backdrop
        const bd = mk('div', '', document.body);
        bd.id = 'ump-bd';

        // LIST PANEL
        mk('div', `
            <div id="ump-ph">
                <span id="ump-ph-title">🎬 Streams (0)</span>
                <button class="hb bl" id="btn-scan">🔍 Quét</button>
                <button class="hb gy" id="btn-clear">🗑</button>
            </div>
            <div id="ump-pb"></div>
        `, document.body).id = 'ump-panel';

        // PREVIEW PLAYER
        mk('div', `
            <div id="ump-drag-handle"></div>
            <div id="ump-prev-bar">
                <span id="ump-prev-title">-</span>
                <button id="ump-menu-btn">⋮</button>
                <button id="ump-close-prev">✕</button>
            </div>
            <div id="ump-prev-video-wrap">
                <video id="ump-prev-vid" controls playsinline preload="auto"></video>
                <div id="ump-prev-spin"></div>
            </div>
            <div id="ump-prev-info">
                <div id="ump-prev-url"></div>
            </div>
            <div id="ump-prev-actions"></div>
        `, document.body).id = 'ump-preview';

        // DROPDOWN
        mk('div', '', document.body).id = 'ump-drop';

        // QUALITY SHEET
        mk('div', `
            <div id="ump-qsheet-title">Chọn chất lượng</div>
            <div id="ump-qlist"></div>
        `, document.body).id = 'ump-qsheet';

        // CMD MODAL
        mk('div', '', document.body).id = 'ump-cmd';

        // TOAST
        mk('div', '', document.body).id = 'ump-toast';

        initLogic();
    }

    function initLogic() {
        const $ = id => document.getElementById(id);

        let curItem = null;
        let curUrl  = null;
        let curQualities = [];
        let hlsInst = null;
        let ctab = 'ytdlp';
        let dropOpen = false;

        // ── Toast ──
        function toast(msg, dur=2200) {
            const t = $('ump-toast');
            t.textContent = msg;
            t.style.display = 'block';
            clearTimeout(t._t);
            t._t = setTimeout(() => t.style.display='none', dur);
        }

        // ── Copy ──
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

        updateBadge = function() {
            const b = $('ump-badge');
            if (!b) return;
            const n = urls.size;
            b.style.display = n>0 ? 'flex' : 'none';
            b.textContent = n>99 ? '99+' : n;
        };

        // ── Scan ──
        function doScan() {
            scan(document, 'main');
            scanPerf(window, 'perf');
            document.querySelectorAll('iframe').forEach((f,i) => {
                try { scan(f.contentDocument, 'if'+i); } catch(e) {}
                scanPerf(f.contentWindow, 'if'+i+':perf');
            });
            updateBadge();
            renderList();
            toast(`🔍 ${urls.size} stream`);
        }

        // ── Render list ──
        function renderList() {
            const body = $('ump-pb');
            $('ump-ph-title').textContent = `🎬 Streams (${urls.size})`;

            if (!urls.size) {
                body.innerHTML = `<div class="ump-empty">Chưa có stream.<br><b>▶️ Phát video rồi nhấn 🔍 Quét</b><br><small style="color:#444">Với site chặn: thử tắt adblock,<br>hoặc bấm play video trước khi quét</small></div>`;
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
                    <div class="li-top">
                        <span class="li-badge ${bc}">${item.type}</span>
                        <span class="li-name">${fname(item.url)}</span>
                        <span class="li-src">${item.source}</span>
                    </div>
                    <div class="li-url">${item.url}</div>
                `;
                d.onclick = () => { openPreview(item); closePanel(); };
                body.appendChild(d);
            });
        }

        // ── Open Preview ──
        function openPreview(item) {
            curItem = item;
            curUrl  = item.url;
            curQualities = [];

            $('ump-prev-title').textContent = fname(item.url);
            $('ump-prev-url').textContent   = item.url;

            // Build action buttons
            buildActions(item);

            // Play
            loadAndPlay(item.url, item.type);

            $('ump-preview').classList.add('on');
            $('ump-bd').classList.add('on');

            // Load qualities in background
            if (item.type === 'M3U8') {
                parseM3U8(item.url, {}, qs => {
                    curQualities = qs || [];
                });
            }
        }

        function buildActions(item) {
            const isStream = ['M3U8','MPD'].includes(item.type);
            const acts = $('ump-prev-actions');
            acts.innerHTML = `
                <button class="pact blue"   id="pact-copy">📋 Copy link</button>
                <button class="pact green"  id="pact-share">🔗 Chia sẻ</button>
                ${!isStream ? `<button class="pact teal" id="pact-dl">⬇️ Download</button>` : ''}
                <button class="pact purple" id="pact-cmd">💻 Lệnh tải</button>
            `;
            $('pact-copy').onclick  = () => { cp(curUrl); toast('✅ Đã copy!'); };
            $('pact-share').onclick = () => doShare(curUrl);
            if (!isStream) $('pact-dl').onclick = () => doDl(curUrl);
            $('pact-cmd').onclick   = () => openCmd(curUrl);
        }

        function loadAndPlay(url, type) {
            if (hlsInst) { hlsInst.destroy(); hlsInst = null; }
            const vid = $('ump-prev-vid');
            vid.pause(); vid.removeAttribute('src'); vid.load();
            showSpin(true);

            if (type === 'M3U8') {
                if (vid.canPlayType('application/vnd.apple.mpegurl')) {
                    vid.src = url; vid.play().catch(()=>{});
                } else if (window.Hls && window.Hls.isSupported()) {
                    doHls(url, vid);
                } else {
                    loadScript('https://cdn.jsdelivr.net/npm/hls.js@latest/dist/hls.min.js', ()=>doHls(url,vid));
                    return;
                }
            } else if (type === 'MPD') {
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
            s.src=src; s.onload=cb; document.head.appendChild(s);
        }

        function showSpin(s) { $('ump-prev-spin').style.display=s?'block':'none'; }
        const vid = $('ump-prev-vid');
        vid.addEventListener('waiting',      ()=>showSpin(true));
        vid.addEventListener('canplay',      ()=>showSpin(false));
        vid.addEventListener('playing',      ()=>showSpin(false));
        vid.addEventListener('error',        ()=>{ showSpin(false); toast('❌ Không phát được video này'); });

        // ── DROPDOWN MENU (nút ba chấm) ──
        // Dùng toggle đơn giản, không cần backdrop
        $('ump-menu-btn').addEventListener('click', function(e) {
            e.stopPropagation();
            toggleDrop(this);
        });

        function toggleDrop(anchor) {
            const drop = $('ump-drop');
            if (drop.classList.contains('on')) {
                closeDrop(); return;
            }

            const isStream = curItem && ['M3U8','MPD'].includes(curItem.type);
            drop.innerHTML = `
                ${isStream ? `<div class="drop-item" id="di-quality">🎞 Chọn chất lượng</div><div class="drop-sep"></div>` : ''}
                <div class="drop-item" id="di-copy">📋 Copy link</div>
                <div class="drop-item" id="di-share">🔗 Chia sẻ</div>
                ${curItem && !isStream ? `<div class="drop-item" id="di-dl">⬇️ Download</div>` : ''}
                <div class="drop-sep"></div>
                <div class="drop-item" id="di-cmd">💻 Lệnh tải</div>
                <div class="drop-item" id="di-scan">🔍 Quét lại</div>
                <div class="drop-sep"></div>
                <div class="drop-item red" id="di-close">✕ Đóng trình phát</div>
            `;

            // Tính vị trí
            const rect = anchor.getBoundingClientRect();
            const dw = 225;
            let left = rect.right - dw;
            if (left < 8) left = 8;
            let top = rect.bottom + 6;
            if (top + 320 > window.innerHeight) top = rect.top - 326;
            drop.style.cssText = `left:${left}px;top:${top}px;right:auto;`;
            drop.classList.add('on');
            dropOpen = true;

            // Events
            if ($('di-quality')) $('di-quality').onclick = ()=>{ closeDrop(); showQualitySheet(); };
            if ($('di-copy'))    $('di-copy').onclick    = ()=>{ closeDrop(); cp(curUrl); toast('✅ Đã copy!'); };
            if ($('di-share'))   $('di-share').onclick   = ()=>{ closeDrop(); doShare(curUrl); };
            if ($('di-dl'))      $('di-dl').onclick      = ()=>{ closeDrop(); doDl(curUrl); };
            if ($('di-cmd'))     $('di-cmd').onclick     = ()=>{ closeDrop(); openCmd(curUrl); };
            if ($('di-scan'))    $('di-scan').onclick    = ()=>{ closeDrop(); doScan(); };
            if ($('di-close'))   $('di-close').onclick   = ()=>{ closeDrop(); closePreview(); };
        }

        function closeDrop() {
            $('ump-drop').classList.remove('on');
            dropOpen = false;
        }

        // Click ngoài dropdown thì đóng
        document.addEventListener('click', e => {
            if (dropOpen && !$('ump-drop').contains(e.target) && e.target.id !== 'ump-menu-btn') {
                closeDrop();
            }
        });

        // ── Quality Sheet ──
        function showQualitySheet() {
            if (!curItem) return;
            if (curItem.type !== 'M3U8') { toast('Không phải HLS stream'); return; }

            const build = (qs) => {
                const list = $('ump-qlist');
                list.innerHTML = [
                    { label:'Auto (Master)', url: curItem.url },
                    ...(qs||[])
                ].map(q => `
                    <div class="q-item ${curUrl===q.url?'cur':''}" data-url="${q.url}" data-type="${curItem.type}">
                        <span>${q.label||'Auto (Master)'}</span>
                        ${curUrl===q.url?'<span style="color:#e53935">✓</span>':''}
                    </div>
                `).join('');
                list.querySelectorAll('.q-item').forEach(qi => {
                    qi.onclick = () => {
                        const u = qi.dataset.url;
                        const t = qi.dataset.type;
                        curUrl = u;
                        closeQSheet();
                        $('ump-prev-url').textContent = u;
                        loadAndPlay(u, t);
                        toast('▶️ Đang tải '+((qi.querySelector('span')||{}).textContent||''));
                    };
                });
                $('ump-qsheet').classList.add('on');
                $('ump-bd').classList.add('on');
            };

            if (curQualities.length) { build(curQualities); }
            else {
                toast('⏳ Đang tải danh sách...');
                parseM3U8(curItem.url, {}, qs => {
                    curQualities = qs||[];
                    build(qs);
                });
            }
        }

        function closeQSheet() {
            $('ump-qsheet').classList.remove('on');
            if ($('ump-preview').classList.contains('on')) {
                $('ump-bd').classList.add('on');
            } else {
                $('ump-bd').classList.remove('on');
            }
        }

        // ── Commands ──
        const REF = location.href;
        const UA  = 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36';

        function cmdBlocks(url) {
            const tabs = {
                ytdlp: [
                    { label:'Tải tốt nhất', cmd:`yt-dlp --referer "${REF}" "${url}"` },
                    { label:'Với header đầy đủ', cmd:`yt-dlp --referer "${REF}" --add-header "User-Agent:${UA}" --add-header "Origin:${location.origin}" -f "bestvideo+bestaudio" "${url}"` },
                    { label:'Xem danh sách chất lượng', cmd:`yt-dlp -F --referer "${REF}" "${url}"` },
                    { label:'Chỉ audio MP3', cmd:`yt-dlp -x --audio-format mp3 --referer "${REF}" "${url}"` },
                ],
                ffmpeg: [
                    { label:'Stream copy (nhanh)', cmd:`ffmpeg -referer "${REF}" -user_agent "${UA}" -i "${url}" -c copy output.mp4` },
                    { label:'Re-encode H264+AAC', cmd:`ffmpeg -referer "${REF}" -i "${url}" -c:v libx264 -c:a aac output.mp4` },
                ],
                wget: [
                    { label:'Tải với referer', cmd:`wget --referer="${REF}" --user-agent="${UA}" "${url}" -O video.mp4` },
                ],
                aria2: [
                    { label:'16 luồng, có referer', cmd:`aria2c -x 16 -s 16 -k 1M --referer="${REF}" --user-agent="${UA}" "${url}" -o video.mp4` },
                ],
                termux: [
                    { label:'Cài tools', cmd:`pkg install python ffmpeg -y && pip install yt-dlp` },
                    { label:'yt-dlp (khuyên dùng)', cmd:`yt-dlp --referer "${REF}" "${url}"` },
                    { label:'FFmpeg (HLS/stream)', cmd:`ffmpeg -referer "${REF}" -i "${url}" -c copy ~/storage/downloads/video.mp4` },
                ],
            };
            return tabs[ctab] || [];
        }

        function buildCmdUI(url) {
            const blocks = cmdBlocks(url);
            const cmd = $('ump-cmd');
            cmd.innerHTML = `
                <div class="cmd-head">
                    <div>
                        <h4>💻 Lệnh tải</h4>
                        <div class="cmd-head-url">${url.substring(0,60)}${url.length>60?'...':''}</div>
                    </div>
                </div>
                <div class="cmd-tabs">
                    ${['ytdlp','ffmpeg','wget','aria2','termux'].map(t=>
                        `<button class="ctab${t===ctab?' on':''}" data-t="${t}">${t==='ytdlp'?'yt-dlp':t.charAt(0).toUpperCase()+t.slice(1)}</button>`
                    ).join('')}
                </div>
                <div id="cmd-bwrap">
                    ${blocks.map((b,i)=>`
                        <div class="cmd-block">
                            <div class="cmd-block-label">${b.label}</div>
                            <div class="cmd-row">
                                <textarea class="cmd-ta" rows="2" readonly data-ci="${i}">${b.cmd}</textarea>
                                <button class="cmd-cp-btn" data-ci="${i}">📋</button>
                            </div>
                        </div>
                    `).join('')}
                </div>
                <div class="cmd-acts">
                    <button class="cmd-btn g" id="cmd-cp-all">📋 Copy tất cả</button>
                    <button class="cmd-btn r" id="cmd-cl">✕ Đóng</button>
                </div>
            `;

            // Auto-resize textareas
            cmd.querySelectorAll('.cmd-ta').forEach(ta => {
                ta.style.height = 'auto';
                ta.style.height = (ta.scrollHeight) + 'px';
            });

            // Tab
            cmd.querySelectorAll('.ctab').forEach(btn => {
                btn.onclick = () => { ctab = btn.dataset.t; buildCmdUI(url); };
            });

            // Copy single
            cmd.querySelectorAll('.cmd-cp-btn').forEach(btn => {
                btn.onclick = () => {
                    const i = parseInt(btn.dataset.ci);
                    const blocks2 = cmdBlocks(url);
                    cp(blocks2[i].cmd); toast('✅ Đã copy!');
                };
            });

            // Copy all
            $('cmd-cp-all').onclick = () => {
                const blocks2 = cmdBlocks(url);
                cp(blocks2.map(b=>`# ${b.label}\n${b.cmd}`).join('\n\n'));
                toast('✅ Đã copy tất cả!');
            };

            $('cmd-cl').onclick = () => {
                cmd.classList.remove('on');
                if ($('ump-preview').classList.contains('on')) {
                    $('ump-bd').classList.add('on');
                } else {
                    $('ump-bd').classList.remove('on');
                }
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

        // ── Close Preview ──
        function closePreview() {
            const vid = $('ump-prev-vid');
            vid.pause(); vid.src = '';
            if (hlsInst) { hlsInst.destroy(); hlsInst = null; }
            $('ump-preview').classList.remove('on');
            $('ump-bd').classList.remove('on');
            closeDrop();
        }

        $('ump-close-prev').onclick = closePreview;
        $('ump-drag-handle').onclick = closePreview;

        // ── Close Panel ──
        function closePanel() {
            $('ump-panel').classList.remove('on');
            if (!$('ump-preview').classList.contains('on'))
                $('ump-bd').classList.remove('on');
        }

        // ── Backdrop click ──
        $('ump-bd').onclick = e => {
            if ($('ump-qsheet').classList.contains('on')) { closeQSheet(); return; }
            if ($('ump-cmd').classList.contains('on')) {
                $('ump-cmd').classList.remove('on');
                if ($('ump-preview').classList.contains('on')) $('ump-bd').classList.add('on');
                else $('ump-bd').classList.remove('on');
                return;
            }
            if ($('ump-panel').classList.contains('on')) { closePanel(); return; }
            closePreview();
        };

        // ── FAB ──
        $('ump-fab').onclick = () => {
            const p = $('ump-panel');
            if (p.classList.contains('on')) { closePanel(); return; }
            doScan();
            p.classList.add('on');
            $('ump-bd').classList.add('on');
        };

        $('btn-scan').onclick  = e => { e.stopPropagation(); doScan(); };
        $('btn-clear').onclick = e => {
            e.stopPropagation();
            urls.clear(); updateBadge(); renderList(); toast('🗑 Đã xóa');
        };
    }

    // ── START ──
    function start() {
        // Hook iframe hiện có
        document.querySelectorAll('iframe').forEach(f => {
            hookIframe(f);
            f.addEventListener('load', () => { hookIframe(f); });
        });

        // Observe iframe mới
        new MutationObserver(muts => {
            muts.forEach(m => {
                m.addedNodes.forEach(node => {
                    if (!node||!node.querySelectorAll) return;
                    const frames = node.tagName==='IFRAME'?[node]:[...node.querySelectorAll('iframe')];
                    frames.forEach(f => {
                        hookIframe(f);
                        f.addEventListener('load', ()=>{
                            hookIframe(f);
                            try { scan(f.contentDocument,'if:load'); } catch(e){}
                        });
                    });
                });
            });
        }).observe(document.documentElement, { childList:true, subtree:true });

        // Auto scan
        setInterval(()=>{ scanPerf(window,'perf:auto'); updateBadge(); }, 2000);
        setTimeout(()=>{ scan(document,'init'); updateBadge(); }, 800);
        setTimeout(()=>{ scan(document,'init2'); scanPerf(window,'perf:init'); updateBadge(); }, 3000);
    }

    if (document.body) { initUI(); start(); }
    else document.addEventListener('DOMContentLoaded', ()=>{ initUI(); start(); });

})();