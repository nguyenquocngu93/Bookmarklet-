// ==UserScript==
// @name         Universal Media Player v9
// @namespace    http://tampermonkey.net/
// @version      9.0
// @description  Bắt media như Universal DL
// @author       You
// @match        *://*/*
// @grant        none
// @run-at       document-start
// ==/UserScript==

(function () {
    'use strict';

    // =============================================
    // URL DETECTION - Giống hệt script gốc
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
            .replace(/["')\]>]+$/, '') // bỏ ký tự thừa cuối
            .trim();
    }

    function findUrls(text, source) {
        if (!text || typeof text !== 'string') return;
        if (text.length > 5000000) {
            // Chia nhỏ text lớn
            for (let i = 0; i < text.length; i += 500000) {
                findUrls(text.substring(i, i + 500000), source);
            }
            return;
        }
        patterns.forEach(p => {
            const matches = text.match(p.re);
            if (!matches) return;
            matches.forEach(u => {
                u = cleanUrl(u);
                if (!u.startsWith('http')) return;
                if (AD.test(u)) return;
                if (!urls.has(u) || urls.get(u).priority > p.priority) {
                    urls.set(u, {
                        url: u,
                        type: p.type,
                        source: source,
                        priority: p.priority,
                        timestamp: Date.now(),
                        qualities: []
                    });
                    updateBadge();
                }
            });
        });
    }

    // =============================================
    // SCAN - Quét toàn bộ document
    // =============================================
    function scan(doc, src) {
        try {
            // Video/audio elements
            doc.querySelectorAll('video, source, audio').forEach(v => {
                if (v.src) findUrls(v.src, src + ':element');
                if (v.currentSrc) findUrls(v.currentSrc, src + ':currentSrc');
            });

            // Script tags
            doc.querySelectorAll('script').forEach(s => {
                findUrls(s.textContent, src + ':script');
            });

            // TOÀN BỘ HTML - quan trọng nhất!
            findUrls(doc.documentElement.outerHTML, src + ':html');

            // iframe lồng nhau
            doc.querySelectorAll('iframe').forEach((f, idx) => {
                try {
                    if (f.contentDocument) {
                        scan(f.contentDocument, src + ':iframe#' + idx);
                    }
                } catch (e) {}
            });
        } catch (e) {}
    }

    // =============================================
    // LIVE MONITORING - Hook XHR + Fetch
    // =============================================
    const _fetch = window.fetch;
    const _xhrOpen = XMLHttpRequest.prototype.open;

    function installMonitor() {
        window.fetch = function (...args) {
            try {
                const url = typeof args[0] === 'string' ? args[0]
                    : args[0] && args[0].url ? args[0].url : '';
                if (url) findUrls(url, 'fetch:live');
            } catch (e) {}
            return _fetch.apply(this, args);
        };

        XMLHttpRequest.prototype.open = function (method, url) {
            try {
                if (url) findUrls(String(url), 'xhr:live');
            } catch (e) {}
            return _xhrOpen.apply(this, arguments);
        };
    }

    // =============================================
    // PERFORMANCE API - Lấy URLs đã load
    // =============================================
    function scanPerf() {
        try {
            performance.getEntriesByType('resource').forEach(e => {
                if (e.name) findUrls(e.name, 'network:perf');
            });
        } catch (e) {}

        // Iframe performance
        document.querySelectorAll('iframe').forEach(f => {
            try {
                const win = f.contentWindow;
                if (!win || !win.performance) return;
                win.performance.getEntriesByType('resource').forEach(e => {
                    if (e.name) findUrls(e.name, 'iframe:perf');
                });
            } catch (e) {}
        });
    }

    // =============================================
    // M3U8 MASTER PARSER - Lấy multi-quality
    // =============================================
    function parseM3U8(url, callback) {
        fetch(url, {
            headers: {
                'Referer': location.href,
                'Origin': location.origin
            }
        })
        .then(r => r.text())
        .then(text => {
            if (!text.includes('#EXTM3U')) { callback(null); return; }
            if (!text.includes('#EXT-X-STREAM-INF')) { callback(null); return; }

            const qualities = [];
            const lines = text.split('\n');

            for (let i = 0; i < lines.length; i++) {
                const line = lines[i].trim();
                if (!line.startsWith('#EXT-X-STREAM-INF')) continue;

                const nextLine = (lines[i + 1] || '').trim();
                if (!nextLine || nextLine.startsWith('#')) continue;

                const resolution = (line.match(/RESOLUTION=(\d+x\d+)/) || [])[1] || '';
                const bandwidth  = parseInt((line.match(/BANDWIDTH=(\d+)/) || [])[1] || 0);
                const height     = resolution ? parseInt(resolution.split('x')[1]) : 0;
                const label      = height ? height + 'p' : Math.round(bandwidth / 1000) + 'kbps';

                let streamUrl = nextLine;
                if (!streamUrl.startsWith('http')) {
                    const base = url.substring(0, url.lastIndexOf('/') + 1);
                    streamUrl = base + streamUrl;
                }

                qualities.push({ label, resolution, bandwidth, url: streamUrl });
            }

            qualities.sort((a, b) => {
                const ha = parseInt((a.resolution.split('x')[1]) || 0);
                const hb = parseInt((b.resolution.split('x')[1]) || 0);
                return hb - ha;
            });

            callback(qualities.length ? qualities : null);
        })
        .catch(() => callback(null));
    }

    // =============================================
    // CHẠY NGAY TỪ document-start
    // =============================================
    installMonitor();

    // Performance API ngay khi có thể
    try {
        performance.getEntriesByType('resource').forEach(e => {
            findUrls(e.name, 'network:perf');
        });
    } catch (e) {}

    // PerformanceObserver - bắt realtime
    try {
        new PerformanceObserver(list => {
            list.getEntries().forEach(e => {
                if (e.name) findUrls(e.name, 'perf:live');
            });
        }).observe({ entryTypes: ['resource'] });
    } catch (e) {}

    let updateBadge = () => {};

    // =============================================
    // UI
    // =============================================
    const CSS = `
        #udl-fab {
            position: fixed; bottom: 20px; right: 20px;
            width: 56px; height: 56px;
            background: #e53935; color: white;
            border: none; border-radius: 50%;
            font-size: 22px; cursor: pointer;
            box-shadow: 0 4px 20px rgba(229,57,53,.6);
            z-index: 2147483647;
            display: flex; align-items: center; justify-content: center;
        }
        #udl-fab:active { transform: scale(.88); }
        #udl-badge {
            position: absolute; top: -3px; right: -3px;
            background: #43a047; color: white;
            font-size: 10px; min-width: 18px; height: 18px;
            border-radius: 9px; padding: 0 4px;
            display: none; align-items: center; justify-content: center;
            font-weight: 700;
        }
        #udl-backdrop {
            position: fixed; inset: 0;
            background: rgba(0,0,0,.75);
            z-index: 2147483640; display: none;
        }
        #udl-backdrop.show { display: block; }
        #udl-panel {
            position: fixed; bottom: 86px; right: 12px;
            width: 390px; max-width: calc(100vw - 24px);
            max-height: 68vh;
            background: #111; border-radius: 14px;
            z-index: 2147483647;
            display: none; flex-direction: column;
            box-shadow: 0 12px 40px rgba(0,0,0,.9);
            overflow: hidden;
            font-family: -apple-system, sans-serif;
        }
        #udl-panel.show { display: flex; }
        #udl-head {
            background: #1c1c1c; padding: 12px 14px;
            display: flex; justify-content: space-between; align-items: center;
            border-bottom: 1px solid #2a2a2a; flex-shrink: 0; gap: 6px;
        }
        #udl-head-title { color: #fff; font-size: 14px; font-weight: 700; flex: 1; }
        #udl-body { overflow-y: auto; flex: 1; padding: 8px; }
        .hbtn {
            border: none; border-radius: 6px; cursor: pointer;
            font-size: 11px; padding: 6px 10px; color: white; font-weight: 600;
        }
        .hbtn.blue  { background: #1565c0; }
        .hbtn.green { background: #2e7d32; }
        .hbtn.gray  { background: #333; }

        /* Stream Card */
        .sc {
            background: #1c1c1c; border-radius: 10px;
            padding: 12px; margin: 6px 0;
            border: 1px solid #2a2a2a;
            font-family: -apple-system, sans-serif;
        }
        .sc-head {
            display: flex; justify-content: space-between;
            align-items: center; margin-bottom: 8px;
        }
        .sc-type {
            font-size: 11px; font-weight: 700; padding: 3px 8px;
            border-radius: 4px; color: white;
        }
        .sc-type.m3u8 { background: #7b1fa2; }
        .sc-type.mpd  { background: #1565c0; }
        .sc-type.mp4  { background: #2e7d32; }
        .sc-type.webm { background: #37474f; }
        .sc-type.other{ background: #424242; }
        .sc-src { font-size: 10px; color: #555; }
        .sc-url {
            background: #111; border-radius: 6px;
            padding: 8px; margin-bottom: 8px;
            font-family: monospace; font-size: 10px;
            color: #4fc3f7; word-break: break-all;
            max-height: 56px; overflow: hidden;
            line-height: 1.4;
        }
        .sc-btns {
            display: grid; grid-template-columns: 1fr 1fr;
            gap: 6px; margin-bottom: 6px;
        }
        .sc-btn {
            border: none; border-radius: 6px; cursor: pointer;
            font-size: 12px; padding: 8px 6px; color: white;
            font-weight: 600; text-align: center;
        }
        .sc-btn.red    { background: #c62828; }
        .sc-btn.green  { background: #2e7d32; }
        .sc-btn.purple { background: #6a1b9a; }
        .sc-btn.teal   { background: #00695c; }
        .sc-btn.pink   { background: #880e4f; }
        .sc-btn.full   { grid-column: 1 / -1; background: #1a237e; }
        /* Quality dropdown */
        .sc-qualities {
            display: none; background: #111;
            border-radius: 6px; padding: 6px; margin-top: 4px;
        }
        .sc-qualities.show { display: block; }
        .sc-q-item {
            color: #ddd; padding: 6px 10px; border-radius: 4px;
            cursor: pointer; font-size: 12px;
            display: flex; justify-content: space-between;
        }
        .sc-q-item:hover { background: #1c1c1c; }
        .sc-q-item.best { color: #4caf50; font-weight: 700; }
        .ump-empty {
            color: #555; text-align: center;
            padding: 30px 16px; font-size: 13px; line-height: 2;
        }
        .ump-empty b { color: #888; }

        /* Player */
        #udl-player {
            position: fixed; inset: 0; background: #000;
            z-index: 2147483647; display: none; flex-direction: column;
        }
        #udl-player.show { display: flex; }
        #udl-pbar {
            background: #111; padding: 8px;
            display: flex; align-items: center; gap: 5px;
            flex-wrap: wrap; flex-shrink: 0;
        }
        #udl-ptitle {
            color: #aaa; font-size: 11px; flex: 1; min-width: 60px;
            overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        #udl-vwrap { flex: 1; position: relative; overflow: hidden; }
        #udl-vid { width: 100%; height: 100%; object-fit: contain; }
        .pb {
            background: #222; color: white; border: none;
            padding: 7px 9px; border-radius: 6px; font-size: 11px;
            cursor: pointer; white-space: nowrap; flex-shrink: 0;
        }
        .pb:active { opacity: .6; }
        .pb.g { background: #1b5e20; }
        .pb.r { background: #b71c1c; }
        .pb.b { background: #0d47a1; }

        /* CMD */
        #udl-cmd {
            position: fixed; top: 50%; left: 50%;
            transform: translate(-50%, -50%);
            background: #111; border-radius: 12px;
            z-index: 2147483647; width: 94%; max-width: 500px;
            padding: 15px; display: none;
            box-shadow: 0 12px 40px rgba(0,0,0,.95);
            font-family: -apple-system, sans-serif;
        }
        #udl-cmd.show { display: block; }
        #udl-cmd h4 { color: #fff; font-size: 13px; margin: 0 0 10px; }
        .udl-ctabs { display: flex; gap: 5px; flex-wrap: wrap; margin-bottom: 10px; }
        .ct {
            background: #222; color: #888; border: none;
            padding: 5px 10px; border-radius: 5px; font-size: 11px; cursor: pointer;
        }
        .ct.on { background: #e53935; color: white; }
        .udl-cta {
            width: 100%; background: #0a0a0a; color: #4caf50;
            border: 1px solid #222; border-radius: 6px;
            padding: 10px; font-family: monospace; font-size: 11px;
            resize: vertical; min-height: 120px; box-sizing: border-box;
        }
        .udl-cacts { display: flex; gap: 8px; margin-top: 10px; }

        #udl-toast {
            position: fixed; bottom: 86px; left: 50%;
            transform: translateX(-50%);
            background: #222; color: white;
            padding: 9px 18px; border-radius: 18px;
            font-size: 13px; z-index: 2147483647;
            display: none; white-space: nowrap;
            box-shadow: 0 4px 16px rgba(0,0,0,.6);
            pointer-events: none;
        }
    `;

    function initUI() {
        if (document.getElementById('udl-fab')) return;

        const style = document.createElement('style');
        style.textContent = CSS;
        document.head.appendChild(style);

        // FAB
        const fab = document.createElement('button');
        fab.id = 'udl-fab';
        fab.innerHTML = `🎬<span id="udl-badge"></span>`;
        document.body.appendChild(fab);

        // Backdrop
        const bd = document.createElement('div');
        bd.id = 'udl-backdrop';
        document.body.appendChild(bd);

        // Panel
        const panel = document.createElement('div');
        panel.id = 'udl-panel';
        panel.innerHTML = `
            <div id="udl-head">
                <span id="udl-head-title">🎬 Streams (0)</span>
                <button class="hbtn blue" id="btn-scan">🔍 Quét</button>
                <button class="hbtn gray" id="btn-clear">🗑</button>
            </div>
            <div id="udl-body"></div>
        `;
        document.body.appendChild(panel);

        // Player
        const ply = document.createElement('div');
        ply.id = 'udl-player';
        ply.innerHTML = `
            <div id="udl-pbar">
                <button class="pb" id="pb-list">📋</button>
                <span id="udl-ptitle">-</span>
                <button class="pb g" id="pb-copy">📋 Link</button>
                <button class="pb g" id="pb-dl">⬇️</button>
                <button class="pb g" id="pb-share">🔗</button>
                <button class="pb g" id="pb-cmd">💻</button>
                <button class="pb r" id="pb-close">✕</button>
            </div>
            <div id="udl-vwrap">
                <video id="udl-vid" controls playsinline preload="auto"></video>
            </div>
        `;
        document.body.appendChild(ply);

        // CMD Modal
        const cmd = document.createElement('div');
        cmd.id = 'udl-cmd';
        cmd.innerHTML = `
            <h4>💻 Lệnh tải</h4>
            <div class="udl-ctabs">
                <button class="ct on" data-t="ytdlp">yt-dlp</button>
                <button class="ct" data-t="ffmpeg">FFmpeg</button>
                <button class="ct" data-t="wget">wget</button>
                <button class="ct" data-t="aria2">aria2</button>
                <button class="ct" data-t="termux">Termux</button>
            </div>
            <textarea class="udl-cta" id="udl-cta" readonly></textarea>
            <div class="udl-cacts">
                <button class="pb g" id="cmd-cp" style="flex:1">📋 Copy</button>
                <button class="pb r" id="cmd-cl" style="flex:1">✕ Đóng</button>
            </div>
        `;
        document.body.appendChild(cmd);

        // Toast
        const toast = document.createElement('div');
        toast.id = 'udl-toast';
        document.body.appendChild(toast);

        initLogic();
    }

    function initLogic() {
        let curUrl = null;
        let curItem = null;
        let hlsInst = null;
        let ctab = 'ytdlp';
        const $ = id => document.getElementById(id);

        function toast(msg) {
            const t = $('udl-toast');
            t.textContent = msg;
            t.style.display = 'block';
            clearTimeout(t._t);
            t._t = setTimeout(() => t.style.display = 'none', 2500);
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

        updateBadge = function () {
            const b = $('udl-badge');
            if (!b) return;
            const n = urls.size;
            b.style.display = n > 0 ? 'flex' : 'none';
            b.textContent = n > 99 ? '99+' : n;
        };

        function doScan() {
            // Quét tất cả
            scan(document, 'main');
            scanPerf();
            updateBadge();
            renderList();
            toast(`🔍 Tìm thấy ${urls.size} stream`);
        }

        function renderList() {
            const body = $('udl-body');
            $('udl-head-title').textContent = `🎬 Streams (${urls.size})`;

            if (!urls.size) {
                body.innerHTML = `<div class="ump-empty">
                    Chưa có stream.<br>
                    <b>▶️ Phát video trên trang</b><br>
                    rồi nhấn 🔍 Quét
                </div>`;
                return;
            }

            body.innerHTML = '';
            const sorted = [...urls.values()].sort((a, b) => a.priority - b.priority);
            let idx = 0;

            sorted.forEach(item => {
                idx++;
                const card = document.createElement('div');
                card.className = 'sc';

                const tc = item.type.toLowerCase();
                const badgeClass = ['m3u8','mpd','mp4','webm'].includes(tc) ? tc : 'other';
                const isHLS  = item.type === 'M3U8';
                const isDASH = item.type === 'MPD';

                card.innerHTML = `
                    <div class="sc-head">
                        <span class="sc-type ${badgeClass}">#${idx} ${item.type}</span>
                        <span class="sc-src">${item.source}</span>
                    </div>
                    <div class="sc-url" id="url-${idx}">${item.url}</div>
                    <div class="sc-btns">
                        <button class="sc-btn red"    data-act="play"   data-i="${idx}">▶️ Phát</button>
                        <button class="sc-btn green"  data-act="copy"   data-i="${idx}">📋 Copy</button>
                        ${isHLS || isDASH ? `<button class="sc-btn purple" data-act="quality" data-i="${idx}">🎞 Quality</button>` : ''}
                        <button class="sc-btn teal"   data-act="cmd"    data-i="${idx}">💻 Lệnh tải</button>
                        ${isHLS || isDASH ? '' : `<button class="sc-btn pink" data-act="dl" data-i="${idx}">⬇️ Download</button>`}
                    </div>
                    ${isHLS ? `<div class="sc-qualities" id="ql-${idx}"><div style="color:#555;font-size:11px;padding:4px">Đang tải quality...</div></div>` : ''}
                `;

                // Lưu item vào card
                card._item = item;
                card._idx  = idx;

                // Load qualities cho HLS ngay
                if (isHLS) {
                    parseM3U8(item.url, qualities => {
                        item.qualities = qualities || [];
                        const qlDiv = document.getElementById('ql-' + idx);
                        if (!qlDiv) return;
                        if (!qualities || !qualities.length) {
                            qlDiv.innerHTML = '<div style="color:#555;font-size:11px;padding:4px">Không có multi-quality</div>';
                            return;
                        }
                        qlDiv.innerHTML = qualities.map((q, qi) => `
                            <div class="sc-q-item ${qi === 0 ? 'best' : ''}"
                                 data-qurl="${q.url}" data-qlabel="${q.label}">
                                <span>${q.label}</span>
                                <span style="color:#555">${q.resolution || ''}</span>
                            </div>
                        `).join('');
                        qlDiv.querySelectorAll('.sc-q-item').forEach(qItem => {
                            qItem.onclick = (e) => {
                                e.stopPropagation();
                                const qUrl = qItem.dataset.qurl;
                                const qLabel = qItem.dataset.qlabel;
                                playUrl(qUrl, item.type, qLabel);
                                closePanel();
                            };
                        });
                    });
                }

                body.appendChild(card);
            });

            // Event delegation
            body.onclick = (e) => {
                const btn = e.target.closest('[data-act]');
                if (!btn) return;
                const act = btn.dataset.act;
                const i   = btn.dataset.i;
                const card = btn.closest('.sc');
                if (!card) return;
                const item = card._item;

                switch (act) {
                    case 'play':
                        playUrl(item.url, item.type, 'Auto');
                        closePanel();
                        break;
                    case 'copy':
                        cp(item.url);
                        toast('✅ Đã copy!');
                        break;
                    case 'quality':
                        const qlDiv = document.getElementById('ql-' + i);
                        if (qlDiv) qlDiv.classList.toggle('show');
                        break;
                    case 'cmd':
                        curUrl  = item.url;
                        curItem = item;
                        showCmd();
                        break;
                    case 'dl':
                        const a = document.createElement('a');
                        a.href = item.url; a.download = fname(item.url); a.click();
                        toast('⬇️ Đang tải...');
                        break;
                }
            };
        }

        // =============================================
        // PLAY
        // =============================================
        function playUrl(url, type, quality) {
            curUrl = url;
            if (hlsInst) { hlsInst.destroy(); hlsInst = null; }

            const vid = $('udl-vid');
            vid.pause(); vid.removeAttribute('src'); vid.load();

            if (type === 'M3U8') {
                if (vid.canPlayType('application/vnd.apple.mpegurl')) {
                    vid.src = url; vid.play().catch(() => {});
                } else if (window.Hls && window.Hls.isSupported()) {
                    startHls(url, vid);
                } else {
                    loadScript('https://cdn.jsdelivr.net/npm/hls.js@latest/dist/hls.min.js',
                        () => startHls(url, vid));
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

            $('udl-ptitle').textContent = `${type} · ${quality} · ${fname(url)}`;
            $('udl-player').classList.add('show');
            $('udl-backdrop').classList.add('show');
        }

        function startHls(url, vid) {
            const hls = new window.Hls({ enableWorker: true, lowLatencyMode: true });
            hls.loadSource(url);
            hls.attachMedia(vid);
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

        // =============================================
        // COMMANDS
        // =============================================
        const cmds = {
            ytdlp:  u => `yt-dlp --referer "${location.href}" "${u}"\n\nyt-dlp -f "bestvideo+bestaudio" --referer "${location.href}" "${u}"`,
            ffmpeg: u => `ffmpeg -referer "${location.href}" -i "${u}" -c copy output.mp4\n\n# Re-encode:\nffmpeg -referer "${location.href}" -i "${u}" -c:v libx264 -c:a aac output.mp4`,
            wget:   u => `wget --referer="${location.href}" \\\n  --user-agent="Mozilla/5.0" \\\n  "${u}" -O video.mp4`,
            aria2:  u => `aria2c -x 16 -s 16 -k 1M \\\n  --referer="${location.href}" \\\n  "${u}" -o video.mp4`,
            termux: u => `# Cài tools\npkg install python ffmpeg -y\npip install yt-dlp\n\n# Tải\nyt-dlp --referer "${location.href}" "${u}"\n\n# ffmpeg (HLS):\nffmpeg -referer "${location.href}" \\\n  -i "${u}" -c copy \\\n  ~/storage/downloads/video.mp4`
        };

        function updateCmd() {
            if (!curUrl) return;
            $('udl-cta').value = (cmds[ctab] || (() => ''))(curUrl);
        }

        function showCmd() {
            updateCmd();
            $('udl-cmd').classList.add('show');
            $('udl-backdrop').classList.add('show');
        }

        function closePanel() {
            $('udl-panel').classList.remove('show');
            if (!$('udl-player').classList.contains('show'))
                $('udl-backdrop').classList.remove('show');
        }

        // =============================================
        // EVENTS
        // =============================================
        $('udl-fab').onclick = () => {
            const p = $('udl-panel');
            if (p.classList.contains('show')) { closePanel(); return; }
            doScan();
            p.classList.add('show');
            $('udl-backdrop').classList.add('show');
        };

        $('udl-backdrop').onclick = () => {
            closePanel();
            $('udl-cmd').classList.remove('show');
            if (!$('udl-player').classList.contains('show'))
                $('udl-backdrop').classList.remove('show');
        };

        $('btn-scan').onclick = e => { e.stopPropagation(); doScan(); };
        $('btn-clear').onclick = e => {
            e.stopPropagation();
            urls.clear(); updateBadge(); renderList();
            toast('🗑 Đã xóa');
        };

        $('pb-list').onclick = () => { renderList(); $('udl-panel').classList.add('show'); };
        $('pb-copy').onclick = () => { if (!curUrl) return; cp(curUrl); toast('✅ Đã copy!'); };
        $('pb-dl').onclick = () => {
            if (!curUrl) return;
            toast('💡 Stream → dùng FFmpeg/yt-dlp');
            showCmd();
        };
        $('pb-share').onclick = () => {
            if (!curUrl) return;
            navigator.share ? navigator.share({ url: curUrl }) : (cp(curUrl), toast('📋 Đã copy'));
        };
        $('pb-cmd').onclick = showCmd;
        $('pb-close').onclick = () => {
            const vid = $('udl-vid');
            vid.pause(); vid.src = '';
            if (hlsInst) { hlsInst.destroy(); hlsInst = null; }
            $('udl-player').classList.remove('show');
            $('udl-backdrop').classList.remove('show');
        };

        document.querySelectorAll('.ct').forEach(btn => {
            btn.onclick = () => {
                document.querySelectorAll('.ct').forEach(b => b.classList.remove('on'));
                btn.classList.add('on'); ctab = btn.dataset.t; updateCmd();
            };
        });

        $('cmd-cp').onclick = () => { cp($('udl-cta').value); toast('✅ Đã copy lệnh!'); };
        $('cmd-cl').onclick = () => $('udl-cmd').classList.remove('show');
    }

    // =============================================
    // AUTO SCAN + INIT
    // =============================================
    function start() {
        // Watch iframe mới
        new MutationObserver(muts => {
            muts.forEach(m => {
                m.addedNodes.forEach(node => {
                    if (!node || !node.querySelectorAll) return;
                    const iframes = node.tagName === 'IFRAME'
                        ? [node]
                        : [...node.querySelectorAll('iframe')];
                    iframes.forEach(f => {
                        f.addEventListener('load', () => {
                            try {
                                scan(f.contentDocument, 'new-iframe');
                            } catch (e) {}
                        });
                    });
                });
            });
        }).observe(document.documentElement, { childList: true, subtree: true });

        // Auto scan
        setInterval(() => {
            scanPerf();
            updateBadge();
        }, 1500);

        // Scan sau khi DOM ready
        setTimeout(() => { scan(document, 'main'); updateBadge(); }, 1000);
        setTimeout(() => { scan(document, 'main'); scanPerf(); updateBadge(); }, 3000);
    }

    if (document.body) {
        initUI(); start();
    } else {
        document.addEventListener('DOMContentLoaded', () => { initUI(); start(); });
    }

})();