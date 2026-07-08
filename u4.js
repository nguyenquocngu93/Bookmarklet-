// ==UserScript==
// @name         Universal Media Player v6
// @namespace    http://tampermonkey.net/
// @version      6.0
// @description  Bắt media từ video đang phát kể cả blob/iframe
// @author       You
// @match        *://*/*
// @grant        none
// @run-at       document-start
// ==/UserScript==

(function () {
    'use strict';

    const captured = new Map();
    const AD = /doubleclick|googlesyndication|googleadservices|adservice|pagead|adnxs/i;
    const MEDIA_EXT = /\.(m3u8|mpd|mp4|webm|mkv|flv|mov|wmv|m4v|ogv)(\?.*)?$/i;

    function isMedia(url) {
        if (!url || typeof url !== 'string' || url.length < 5) return false;
        if (url.startsWith('data:')) return false;
        if (AD.test(url)) return false;
        if (url.startsWith('blob:')) return true;
        return MEDIA_EXT.test(url.split('?')[0]);
    }

    function getType(url, mime = '') {
        if (/\.m3u8/i.test(url) || /mpegurl/i.test(mime)) return 'HLS';
        if (/\.mpd/i.test(url) || /dash\+xml/i.test(mime)) return 'DASH';
        if (/\.mp4/i.test(url)) return 'MP4';
        if (/\.webm/i.test(url)) return 'WebM';
        if (/\.mkv/i.test(url)) return 'MKV';
        if (/\.flv/i.test(url)) return 'FLV';
        if (url.startsWith('blob:')) return 'BLOB';
        return 'Video';
    }

    function getQuality(url) {
        const m = url.match(/[_\-\/\.](\d{3,4})[pP]/);
        if (m) return m[1] + 'p';
        if (/4k|2160/i.test(url)) return '4K';
        if (/1080|fhd/i.test(url)) return '1080p';
        if (/720/i.test(url)) return '720p';
        if (/480/i.test(url)) return '480p';
        if (/360/i.test(url)) return '360p';
        return 'Auto';
    }

    function addMedia(url, source = '?', mime = '') {
        if (!isMedia(url)) return;
        if (/\.ts(\?|$)/i.test(url)) return; // bỏ ts segment
        if (captured.has(url)) return;
        const item = {
            url, source,
            type: getType(url, mime),
            quality: getQuality(url),
            time: Date.now()
        };
        captured.set(url, item);
        console.log('[UMP]', item.type, source, url.substring(0, 100));
        updateBadge();
    }

    // ============================================
    // CORE: Quét tất cả video element đang tồn tại
    // Đây là cách đáng tin cậy nhất!
    // ============================================
    function scanAllVideos() {
        let found = 0;

        // Quét trang chính
        found += scanDocVideos(document, 'main');

        // Quét tất cả iframe
        document.querySelectorAll('iframe').forEach((iframe, i) => {
            try {
                const idoc = iframe.contentDocument || iframe.contentWindow.document;
                found += scanDocVideos(idoc, `iframe[${i}]`);

                // Quét iframe lồng nhau
                idoc.querySelectorAll('iframe').forEach((innerFrame, j) => {
                    try {
                        const innerDoc = innerFrame.contentDocument || innerFrame.contentWindow.document;
                        found += scanDocVideos(innerDoc, `iframe[${i}][${j}]`);
                    } catch (e) {}
                });
            } catch (e) {
                console.log('[UMP] iframe cross-origin:', iframe.src);
            }
        });

        return found;
    }

    function scanDocVideos(doc, source) {
        if (!doc) return 0;
        let found = 0;

        doc.querySelectorAll('video').forEach(v => {
            // currentSrc là nguồn ĐANG PHÁT - quan trọng nhất
            [v.currentSrc, v.src].forEach(s => {
                if (s && s.length > 5) {
                    addMedia(s, source + '-currentSrc');
                    found++;
                }
            });

            // source tags
            v.querySelectorAll('source').forEach(s => {
                if (s.src) { addMedia(s.src, source + '-source', s.type); found++; }
            });
        });

        // audio elements
        doc.querySelectorAll('audio').forEach(a => {
            [a.currentSrc, a.src].forEach(s => {
                if (s) { addMedia(s, source + '-audio'); found++; }
            });
        });

        // Script nội dung - chỉ tìm m3u8/mpd
        doc.querySelectorAll('script:not([src])').forEach(s => {
            const text = s.textContent || '';
            [
                ...( text.match(/["'`](https?:\/\/[^"'`\s]+\.m3u8[^"'`\s]*)/gi) || []),
                ...( text.match(/["'`](https?:\/\/[^"'`\s]+\.mpd[^"'`\s]*)/gi) || []),
                ...( text.match(/["'`](https?:\/\/[^"'`\s]+\.mp4[^"'`\s]*)/gi) || []),
            ].forEach(match => {
                const url = match.replace(/^["'`]/, '').trim();
                if (isMedia(url)) { addMedia(url, source + '-script'); found++; }
            });
        });

        return found;
    }

    // ============================================
    // Hook network - bắt thêm từ XHR/Fetch
    // ============================================
    function hookNetwork(win, label) {
        try {
            // XHR
            const _open = win.XMLHttpRequest.prototype.open;
            const _send = win.XMLHttpRequest.prototype.send;
            win.XMLHttpRequest.prototype.open = function (m, url) {
                this._u = url;
                return _open.apply(this, arguments);
            };
            win.XMLHttpRequest.prototype.send = function () {
                if (this._u) {
                    const url = this._u;
                    this.addEventListener('readystatechange', function () {
                        if (this.readyState === 2) {
                            try {
                                const ct = this.getResponseHeader('Content-Type') || '';
                                if (isMedia(url) || /video|mpegurl|dash/i.test(ct)) {
                                    addMedia(url, label + '-xhr', ct);
                                }
                            } catch (e) {}
                        }
                    });
                }
                return _send.apply(this, arguments);
            };
        } catch (e) {}

        try {
            // Fetch
            const _fetch = win.fetch;
            win.fetch = function (...args) {
                const url = typeof args[0] === 'string' ? args[0] : (args[0] && args[0].url) || '';
                const p = _fetch.apply(this, args);
                p.then(r => {
                    try {
                        const ct = r.headers.get('Content-Type') || '';
                        if (isMedia(url) || /video|mpegurl|dash/i.test(ct)) {
                            addMedia(url, label + '-fetch', ct);
                        }
                    } catch (e) {}
                }).catch(() => {});
                return p;
            };
        } catch (e) {}

        try {
            // MediaSource - bắt blob
            if (win.MediaSource) {
                const _addSB = win.MediaSource.prototype.addSourceBuffer;
                win.MediaSource.prototype.addSourceBuffer = function (mime) {
                    if (/video/i.test(mime)) {
                        setTimeout(() => {
                            try {
                                win.document.querySelectorAll('video[src^="blob:"]').forEach(v => {
                                    addMedia(v.src, label + '-mediasource', mime);
                                });
                            } catch (e) {}
                        }, 100);
                    }
                    return _addSB.apply(this, arguments);
                };
            }
        } catch (e) {}
    }

    // Hook trang chính
    hookNetwork(window, 'main');

    // Hook iframe khi load
    function hookIframe(iframe) {
        try {
            const win = iframe.contentWindow;
            if (win) hookNetwork(win, 'iframe-' + (iframe.src || 'embedded').substring(0, 30));
        } catch (e) {}
    }

    // Observe iframe mới
    const iframeObserver = new MutationObserver(muts => {
        muts.forEach(m => {
            m.addedNodes.forEach(node => {
                if (!node.querySelectorAll) return;
                if (node.tagName === 'IFRAME') {
                    node.addEventListener('load', () => {
                        hookIframe(node);
                        scanDocVideos(
                            node.contentDocument || (node.contentWindow && node.contentWindow.document),
                            'new-iframe'
                        );
                    });
                }
                node.querySelectorAll('iframe').forEach(f => {
                    f.addEventListener('load', () => {
                        hookIframe(f);
                        scanDocVideos(
                            f.contentDocument || (f.contentWindow && f.contentWindow.document),
                            'new-iframe-child'
                        );
                    });
                });
            });
        });
    });

    // ============================================
    // AUTO SCAN - Quét liên tục khi video đang chạy
    // ============================================
    let autoScanInterval = null;

    function startAutoScan() {
        if (autoScanInterval) return;
        autoScanInterval = setInterval(() => {
            const found = scanAllVideos();
            if (found > 0) updateBadge();
        }, 2000); // quét mỗi 2 giây
    }

    let updateBadge = () => {};

    // ============================================
    // UI
    // ============================================
    function initUI() {
        if (document.getElementById('ump-root')) return;

        const css = `
            #ump-root { pointer-events: none; }
            #ump-fab, #ump-panel, #ump-player,
            #ump-cmd, #ump-toast, #ump-backdrop {
                pointer-events: auto;
            }
            #ump-fab {
                position: fixed; bottom: 20px; right: 20px;
                width: 56px; height: 56px;
                background: #e53935; color: white;
                border: none; border-radius: 50%;
                font-size: 24px; cursor: pointer;
                box-shadow: 0 4px 20px rgba(229,57,53,.6);
                z-index: 2147483647;
                display: flex; align-items: center; justify-content: center;
                transition: transform .15s;
            }
            #ump-fab:active { transform: scale(.88); }
            #ump-fab-badge {
                position: absolute; top: -3px; right: -3px;
                background: #43a047; color: white;
                font-size: 10px; min-width: 18px; height: 18px;
                border-radius: 9px; padding: 0 4px;
                display: none; align-items: center; justify-content: center;
                font-weight: 700; font-family: sans-serif;
            }
            #ump-backdrop {
                position: fixed; inset: 0; background: rgba(0,0,0,.72);
                z-index: 2147483640; display: none;
            }
            #ump-backdrop.show { display: block; }

            /* Panel */
            #ump-panel {
                position: fixed; bottom: 86px; right: 12px;
                width: 370px; max-width: calc(100vw - 24px);
                max-height: 62vh;
                background: #1c1c1e; border-radius: 14px;
                z-index: 2147483647;
                display: none; flex-direction: column;
                box-shadow: 0 12px 40px rgba(0,0,0,.75);
                overflow: hidden;
                font-family: -apple-system, sans-serif;
            }
            #ump-panel.show { display: flex; }
            #ump-ph {
                background: #2c2c2e; padding: 11px 14px;
                display: flex; justify-content: space-between; align-items: center;
                border-bottom: 1px solid #3a3a3c; flex-shrink: 0;
            }
            #ump-ph-title { color: #fff; font-size: 14px; font-weight: 600; }
            #ump-pb-body { overflow-y: auto; flex: 1; padding: 8px; }
            #ump-ph-acts { display: flex; gap: 6px; }

            .ump-sbtn {
                border: none; border-radius: 6px; cursor: pointer;
                font-size: 11px; padding: 5px 9px; color: white;
                font-weight: 500;
            }
            .sb-scan { background: #0a84ff; }
            .sb-clear { background: #636366; }

            .ump-item {
                background: #2c2c2e; border-radius: 10px;
                padding: 10px 12px; margin: 5px 0;
                cursor: pointer; border: 2px solid transparent;
                transition: border-color .12s;
                font-family: -apple-system, sans-serif;
            }
            .ump-item:active { background: #3a3a3c; }
            .ump-item:hover { border-color: #e53935; }
            .ump-iname {
                color: #fff; font-size: 13px; font-weight: 500;
                overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
                margin-bottom: 3px;
            }
            .ump-iurl {
                color: #555; font-size: 10px;
                overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
                margin-bottom: 5px; font-family: monospace;
            }
            .ump-ibadges { display: flex; gap: 4px; flex-wrap: wrap; }
            .ump-b {
                font-size: 10px; padding: 2px 6px; border-radius: 4px;
                color: white; font-weight: 600;
            }
            .bh { background: #7b1fa2; }
            .bd { background: #1565c0; }
            .bm { background: #2e7d32; }
            .bb { background: #e65100; }
            .bv { background: #37474f; }
            .bq { background: #1a237e; }
            .bs { background: #3a3a3c; color: #888; }

            .ump-empty {
                color: #666; text-align: center;
                padding: 28px 16px; font-size: 13px;
                line-height: 1.9; font-family: -apple-system, sans-serif;
            }
            .ump-empty b { color: #aaa; }
            .ump-empty code {
                background: #2c2c2e; color: #0a84ff;
                padding: 2px 6px; border-radius: 4px; font-size: 12px;
            }

            /* Player */
            #ump-player {
                position: fixed; inset: 0; background: #000;
                z-index: 2147483647; display: none; flex-direction: column;
                font-family: -apple-system, sans-serif;
            }
            #ump-player.show { display: flex; }
            #ump-pbar {
                background: #1c1c1e; padding: 8px 10px;
                display: flex; align-items: center; gap: 5px;
                flex-wrap: wrap; flex-shrink: 0;
            }
            #ump-ptitle {
                color: #aaa; font-size: 11px; flex: 1; min-width: 80px;
                overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
            }
            #ump-vwrap { flex: 1; position: relative; background: #000; overflow: hidden; }
            #ump-vid { width: 100%; height: 100%; object-fit: contain; }

            .pb {
                background: #2c2c2e; color: white; border: none;
                padding: 7px 9px; border-radius: 6px; font-size: 11px;
                cursor: pointer; white-space: nowrap; flex-shrink: 0;
                font-family: -apple-system, sans-serif;
            }
            .pb:active { opacity: .6; }
            .pb.g { background: #1b5e20; }
            .pb.r { background: #b71c1c; }
            .pb.b { background: #0d47a1; }

            #ump-qmenu {
                position: absolute; top: 6px; right: 6px;
                background: #1c1c1e; border: 1px solid #3a3a3c;
                border-radius: 8px; padding: 6px; display: none;
                z-index: 10; min-width: 190px; max-height: 260px; overflow-y: auto;
            }
            #ump-qmenu.show { display: block; }
            .ump-qo {
                color: #ddd; padding: 8px 10px; border-radius: 5px;
                cursor: pointer; font-size: 12px;
                display: flex; justify-content: space-between; gap: 8px;
                font-family: -apple-system, sans-serif;
            }
            .ump-qo:hover { background: #2c2c2e; }
            .ump-qo.cur { background: #b71c1c; color: white; }

            /* CMD modal */
            #ump-cmd {
                position: fixed; top: 50%; left: 50%;
                transform: translate(-50%, -50%);
                background: #1c1c1e; border-radius: 12px;
                z-index: 2147483647;
                width: 94%; max-width: 490px;
                padding: 15px; display: none;
                box-shadow: 0 12px 40px rgba(0,0,0,.85);
                font-family: -apple-system, sans-serif;
            }
            #ump-cmd.show { display: block; }
            #ump-cmd h4 { color: #fff; font-size: 13px; margin: 0 0 10px; }
            #ump-ctabs { display: flex; gap: 5px; flex-wrap: wrap; margin-bottom: 10px; }
            .ct {
                background: #2c2c2e; color: #888; border: none;
                padding: 5px 10px; border-radius: 5px; font-size: 11px; cursor: pointer;
            }
            .ct.on { background: #e53935; color: white; }
            #ump-cta {
                width: 100%; background: #111; color: #4caf50;
                border: 1px solid #2c2c2e; border-radius: 6px;
                padding: 10px; font-family: monospace; font-size: 11px;
                resize: vertical; min-height: 105px; box-sizing: border-box;
            }
            #ump-cacts { display: flex; gap: 8px; margin-top: 10px; }

            #ump-toast {
                position: fixed; bottom: 86px; left: 50%;
                transform: translateX(-50%);
                background: #1c1c1e; color: white;
                padding: 9px 18px; border-radius: 18px;
                font-size: 13px; z-index: 2147483647;
                display: none; white-space: nowrap;
                box-shadow: 0 4px 16px rgba(0,0,0,.5);
                pointer-events: none;
                font-family: -apple-system, sans-serif;
            }
        `;

        const style = document.createElement('style');
        style.textContent = css;
        document.head.appendChild(style);

        // FAB
        const fab = document.createElement('button');
        fab.id = 'ump-fab';
        fab.innerHTML = `🎬<span id="ump-fab-badge"></span>`;
        fab.title = 'Universal Media Player';
        document.body.appendChild(fab);

        // Backdrop
        const bd = document.createElement('div');
        bd.id = 'ump-backdrop';
        document.body.appendChild(bd);

        // Panel
        const panel = document.createElement('div');
        panel.id = 'ump-panel';
        panel.innerHTML = `
            <div id="ump-ph">
                <span id="ump-ph-title">📡 Media</span>
                <div id="ump-ph-acts">
                    <button class="ump-sbtn sb-scan" id="btn-scan">🔍 Quét ngay</button>
                    <button class="ump-sbtn sb-clear" id="btn-clear">🗑</button>
                </div>
            </div>
            <div id="ump-pb-body"></div>
        `;
        document.body.appendChild(panel);

        // Player
        const ply = document.createElement('div');
        ply.id = 'ump-player';
        ply.innerHTML = `
            <div id="ump-pbar">
                <button class="pb" id="pb-list">📋</button>
                <span id="ump-ptitle">-</span>
                <button class="pb b" id="pb-q">⚙️</button>
                <button class="pb g" id="pb-copy">📋 Link</button>
                <button class="pb g" id="pb-dl">⬇️</button>
                <button class="pb g" id="pb-share">🔗</button>
                <button class="pb g" id="pb-cmd">💻</button>
                <button class="pb r" id="pb-close">✕</button>
            </div>
            <div id="ump-vwrap">
                <video id="ump-vid" controls playsinline preload="auto"></video>
                <div id="ump-qmenu"></div>
            </div>
        `;
        document.body.appendChild(ply);

        // CMD Modal
        const cmd = document.createElement('div');
        cmd.id = 'ump-cmd';
        cmd.innerHTML = `
            <h4>💻 Lệnh tải</h4>
            <div id="ump-ctabs">
                <button class="ct on" data-t="ytdlp">yt-dlp</button>
                <button class="ct" data-t="ffmpeg">FFmpeg</button>
                <button class="ct" data-t="wget">wget</button>
                <button class="ct" data-t="aria2">aria2</button>
                <button class="ct" data-t="termux">Termux</button>
            </div>
            <textarea id="ump-cta" readonly></textarea>
            <div id="ump-cacts">
                <button class="pb g" id="cmd-cp" style="flex:1">📋 Copy</button>
                <button class="pb r" id="cmd-cl" style="flex:1">✕ Đóng</button>
            </div>
        `;
        document.body.appendChild(cmd);

        // Toast
        const toast = document.createElement('div');
        toast.id = 'ump-toast';
        document.body.appendChild(toast);

        initLogic();
    }

    function initLogic() {
        let cur = null;
        let hlsInst = null;
        let ctab = 'ytdlp';

        const $ = id => document.getElementById(id);

        function toast(msg) {
            const t = $('ump-toast');
            t.textContent = msg;
            t.style.display = 'block';
            clearTimeout(t._t);
            t._t = setTimeout(() => t.style.display = 'none', 2500);
        }

        function cp(text) {
            if (navigator.clipboard) {
                navigator.clipboard.writeText(text).catch(() => cp2(text));
            } else { cp2(text); }
        }
        function cp2(t) {
            const ta = document.createElement('textarea');
            ta.value = t; ta.style.cssText = 'position:fixed;left:-9999px';
            document.body.appendChild(ta); ta.select();
            document.execCommand('copy'); document.body.removeChild(ta);
        }

        function fname(url) {
            try {
                if (url.startsWith('blob:')) return 'video_blob_' + Date.now() + '.mp4';
                const p = new URL(url).pathname.split('/').filter(Boolean).pop() || '';
                const n = decodeURIComponent(p.split('?')[0]);
                if (n && /\.\w{2,5}$/.test(n)) return n;
            } catch (e) {}
            return 'video_' + Date.now() + '.mp4';
        }

        // Badge update
        updateBadge = function () {
            const b = $('ump-fab-badge');
            if (!b) return;
            const n = captured.size;
            b.style.display = n > 0 ? 'flex' : 'none';
            b.textContent = n > 99 ? '99+' : n;
        };

        // Scan + render
        function doScan() {
            const n = scanAllVideos();
            renderList();
            toast(`🔍 Quét xong! Tìm thấy ${captured.size} media`);
        }

        function renderList() {
            const body = $('ump-pb-body');
            const items = [...captured.values()].sort((a, b) => {
                const o = { HLS: 5, DASH: 4, BLOB: 3, MP4: 2, WebM: 1 };
                return (o[b.type] || 0) - (o[a.type] || 0);
            });

            $('ump-ph-title').textContent = `📡 Media (${items.length})`;

            if (!items.length) {
                body.innerHTML = `<div class="ump-empty">
                    Chưa bắt được media.<br><br>
                    <b>Làm theo bước sau:</b><br>
                    1️⃣ Bấm ▶️ phát video trên trang<br>
                    2️⃣ Chờ video load 2-3 giây<br>
                    3️⃣ Bấm <code>🔍 Quét ngay</code><br><br>
                    Script tự động quét mỗi 2 giây.
                </div>`;
                return;
            }

            body.innerHTML = '';
            items.forEach(item => {
                const d = document.createElement('div');
                d.className = 'ump-item';
                const bc = { HLS: 'bh', DASH: 'bd', MP4: 'bm', BLOB: 'bb' }[item.type] || 'bv';
                const n = fname(item.url);
                d.innerHTML = `
                    <div class="ump-iname">${n}</div>
                    <div class="ump-iurl">${item.url.substring(0, 70)}</div>
                    <div class="ump-ibadges">
                        <span class="ump-b ${bc}">${item.type}</span>
                        <span class="ump-b bq">${item.quality}</span>
                        <span class="ump-b bs">${item.source}</span>
                    </div>
                `;
                d.onclick = () => { play(item); closePanel(); };
                body.appendChild(d);
            });
        }

        // Play
        function play(item) {
            cur = item;
            if (hlsInst) { hlsInst.destroy(); hlsInst = null; }

            const vid = $('ump-vid');
            vid.pause(); vid.removeAttribute('src'); vid.load();

            if (item.type === 'HLS') {
                if (vid.canPlayType('application/vnd.apple.mpegurl')) {
                    vid.src = item.url;
                    vid.play().catch(() => {});
                } else if (window.Hls && window.Hls.isSupported()) {
                    startHls(item.url, vid);
                } else {
                    loadScript(
                        'https://cdn.jsdelivr.net/npm/hls.js@latest/dist/hls.min.js',
                        () => startHls(item.url, vid)
                    );
                    return;
                }
            } else if (item.type === 'DASH') {
                if (window.dashjs) {
                    window.dashjs.MediaPlayer().create().initialize(vid, item.url, true);
                } else {
                    loadScript('https://cdn.dashjs.org/latest/dash.all.min.js',
                        () => window.dashjs.MediaPlayer().create().initialize(vid, item.url, true)
                    );
                    return;
                }
            } else {
                vid.src = item.url;
                vid.play().catch(() => {});
            }

            $('ump-ptitle').textContent = `${fname(item.url)} · ${item.type} · ${item.quality}`;
            renderQMenu();
            $('ump-player').classList.add('show');
            $('ump-backdrop').classList.add('show');
        }

        function startHls(url, vid) {
            const hls = new window.Hls({ enableWorker: true, lowLatencyMode: true });
            hls.loadSource(url);
            hls.attachMedia(vid);
            hls.on(window.Hls.Events.MANIFEST_PARSED, () => vid.play().catch(() => {}));
            hls.on(window.Hls.Events.ERROR, (e, d) => {
                if (d.fatal) toast('❌ HLS Error: ' + d.type);
            });
            hlsInst = hls;
        }

        function loadScript(src, cb) {
            const s = document.createElement('script');
            s.src = src; s.onload = cb;
            s.onerror = () => { $('ump-vid').src = cur.url; toast('⚠️ Fallback native'); };
            document.head.appendChild(s);
        }

        function renderQMenu() {
            const m = $('ump-qmenu');
            m.innerHTML = '';
            const items = [...captured.values()];
            if (items.length < 2) return;
            items.forEach(item => {
                const d = document.createElement('div');
                d.className = 'ump-qo' + (cur && item.url === cur.url ? ' cur' : '');
                d.innerHTML = `<span>${item.type} · ${item.quality}</span><span class="ump-b bs">${item.source}</span>`;
                d.onclick = () => { play(item); m.classList.remove('show'); };
                m.appendChild(d);
            });
        }

        const cmds = {
            ytdlp: u =>
                `yt-dlp "${u}"\n\n` +
                `# Chất lượng tốt nhất\nyt-dlp -f "bestvideo+bestaudio" "${u}"\n\n` +
                `# Chỉ audio\nyt-dlp -x --audio-format mp3 "${u}"`,
            ffmpeg: u =>
                `# Copy stream (không re-encode)\nffmpeg -i "${u}" -c copy output.mp4\n\n` +
                `# Với referer\nffmpeg -referer "${location.href}" -i "${u}" -c copy output.mp4`,
            wget: u =>
                `wget "${u}" -O video.mp4\n\n` +
                `wget --referer="${location.href}" "${u}" -O video.mp4`,
            aria2: u =>
                `aria2c -x 16 -s 16 -k 1M "${u}" -o video.mp4\n\n` +
                `aria2c -x 16 --referer="${location.href}" "${u}"`,
            termux: u =>
                `pkg install python ffmpeg wget aria2 -y\npip install yt-dlp\n\n` +
                `# Stream (HLS/DASH)\nffmpeg -i "${u}" -c copy ~/storage/downloads/video.mp4\n\n` +
                `# Universal\nyt-dlp "${u}"`
        };

        function updateCmd() {
            if (!cur) return;
            $('ump-cta').value = (cmds[ctab] || (() => ''))(cur.url);
        }

        // Events
        $('ump-fab').onclick = () => {
            if (panel().classList.contains('show')) closePanel();
            else { renderList(); panel().classList.add('show'); bd().classList.add('show'); }
        };

        function panel() { return $('ump-panel'); }
        function bd() { return $('ump-backdrop'); }

        $('ump-backdrop').onclick = () => {
            closePanel();
            $('ump-cmd').classList.remove('show');
            if (!$('ump-player').classList.contains('show')) bd().classList.remove('show');
        };

        $('btn-scan').onclick = e => { e.stopPropagation(); doScan(); };
        $('btn-clear').onclick = e => {
            e.stopPropagation();
            captured.clear(); updateBadge(); renderList();
            toast('🗑 Đã xóa danh sách');
        };

        $('pb-list').onclick = () => { renderList(); panel().classList.add('show'); };
        $('pb-q').onclick = () => $('ump-qmenu').classList.toggle('show');
        $('pb-copy').onclick = () => { if (!cur) return; cp(cur.url); toast('✅ Đã copy link!'); };
        $('pb-dl').onclick = () => {
            if (!cur) return;
            if (['HLS', 'DASH', 'BLOB'].includes(cur.type)) {
                toast('⚠️ Dùng FFmpeg/yt-dlp để tải stream');
                showCmd(); return;
            }
            const a = document.createElement('a');
            a.href = cur.url; a.download = fname(cur.url); a.click();
            toast('⬇️ Đang tải...');
        };
        $('pb-share').onclick = () => {
            if (!cur) return;
            if (navigator.share) { navigator.share({ url: cur.url }).catch(() => {}); }
            else { cp(cur.url); toast('📋 Đã copy để chia sẻ'); }
        };
        $('pb-cmd').onclick = () => showCmd();
        $('pb-close').onclick = () => {
            const vid = $('ump-vid');
            vid.pause(); vid.src = '';
            if (hlsInst) { hlsInst.destroy(); hlsInst = null; }
            $('ump-player').classList.remove('show');
            bd().classList.remove('show');
        };

        function showCmd() { updateCmd(); $('ump-cmd').classList.add('show'); bd().classList.add('show'); }

        document.querySelectorAll('.ct').forEach(btn => {
            btn.onclick = () => {
                document.querySelectorAll('.ct').forEach(b => b.classList.remove('on'));
                btn.classList.add('on');
                ctab = btn.dataset.t;
                updateCmd();
            };
        });

        $('cmd-cp').onclick = () => { cp($('ump-cta').value); toast('✅ Đã copy lệnh!'); };
        $('cmd-cl').onclick = () => $('ump-cmd').classList.remove('show');

        function closePanel() {
            panel().classList.remove('show');
            if (!$('ump-player').classList.contains('show')) bd().classList.remove('show');
        }
    }

    // ============================================
    // KHỞI ĐỘNG
    // ============================================
    function start() {
        // Hook tất cả iframe hiện có
        document.querySelectorAll('iframe').forEach(hookIframe);

        // Observe iframe mới
        iframeObserver.observe(document.documentElement, {
            childList: true, subtree: true
        });

        // Auto scan
        startAutoScan();

        // Quét ngay lần đầu sau 1s
        setTimeout(scanAllVideos, 1000);
        setTimeout(scanAllVideos, 3000);
        setTimeout(scanAllVideos, 6000);
    }

    if (document.body) {
        initUI(); start();
    } else {
        document.addEventListener('DOMContentLoaded', () => { initUI(); start(); });
    }

})();