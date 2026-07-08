// ==UserScript==
// @name         Universal Media Player v7
// @namespace    http://tampermonkey.net/
// @version      7.0
// @description  Bắt m3u8 thật từ blob/MediaSource
// @author       You
// @match        *://*/*
// @grant        none
// @run-at       document-start
// ==/UserScript==

(function () {
    'use strict';

    const captured = new Map();
    const AD = /doubleclick|googlesyndication|googleadservices|adservice|pagead|adnxs/i;
    const M3U8_MPD = /\.(m3u8|mpd)(\?.*)?$/i;
    const MEDIA_EXT = /\.(mp4|webm|mkv|flv|mov|m4v|ogv)(\?.*)?$/i;

    function isM3U8orMPD(url) {
        if (!url || typeof url !== 'string') return false;
        if (AD.test(url)) return false;
        return M3U8_MPD.test(url.split('?')[0]) || M3U8_MPD.test(url);
    }

    function isMediaUrl(url) {
        if (!url || typeof url !== 'string') return false;
        if (AD.test(url)) return false;
        return isM3U8orMPD(url) || MEDIA_EXT.test(url.split('?')[0]);
    }

    function getType(url, mime = '') {
        if (/\.m3u8/i.test(url) || /mpegurl/i.test(mime)) return 'HLS';
        if (/\.mpd/i.test(url) || /dash\+xml/i.test(mime)) return 'DASH';
        if (/\.mp4/i.test(url)) return 'MP4';
        if (/\.webm/i.test(url)) return 'WebM';
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

    function addMedia(url, source, mime = '') {
        if (!isMediaUrl(url)) return false;
        if (/\.ts(\?|#|$)/i.test(url)) return false; // bỏ .ts segment
        if (captured.has(url)) return false;
        const item = {
            url, source,
            type: getType(url, mime),
            quality: getQuality(url),
            time: Date.now()
        };
        captured.set(url, item);
        console.log('[UMP] ✅', item.type, source, url.substring(0, 120));
        updateBadge();
        return true;
    }

    // ==============================================
    // PHƯƠNG PHÁP CHÍNH: Hook XHR/Fetch
    // Bắt đúng lúc player request m3u8
    // ==============================================

    function hookXHR(win, label) {
        try {
            const proto = win.XMLHttpRequest.prototype;
            const _open = proto.open;
            const _send = proto.send;

            proto.open = function (method, url) {
                try { this._ump_url = (typeof url === 'string') ? url : String(url); } catch(e) {}
                return _open.apply(this, arguments);
            };

            proto.send = function () {
                const url = this._ump_url;
                if (url) {
                    // Bắt ngay nếu URL có đuôi m3u8/mpd
                    if (isM3U8orMPD(url)) {
                        addMedia(url, label + ':xhr');
                    }

                    // Bắt qua response header
                    this.addEventListener('readystatechange', function () {
                        if (this.readyState === 2) {
                            try {
                                const ct = this.getResponseHeader('Content-Type') || '';
                                if (/mpegurl|dash\+xml|video\//i.test(ct)) {
                                    addMedia(url, label + ':xhr:mime', ct);
                                }
                            } catch (e) {}
                        }
                    });

                    // Bắt qua response content (m3u8 text)
                    this.addEventListener('load', function () {
                        try {
                            if (this.responseType === '' || this.responseType === 'text') {
                                const text = this.responseText || '';
                                if (text.includes('#EXTM3U') || text.includes('#EXT-X-')) {
                                    // Đây là file m3u8!
                                    addMedia(url, label + ':xhr:m3u8content');
                                    // Parse các URL trong m3u8
                                    parseM3U8Content(text, url, label);
                                }
                            }
                        } catch (e) {}
                    });
                }
                return _send.apply(this, arguments);
            };
        } catch (e) {}
    }

    function hookFetch(win, label) {
        try {
            const _fetch = win.fetch;
            if (!_fetch) return;

            win.fetch = function (...args) {
                let url = '';
                try {
                    url = typeof args[0] === 'string' ? args[0]
                        : args[0] instanceof Request ? args[0].url
                        : String(args[0]);
                } catch (e) {}

                // Bắt ngay nếu URL có đuôi m3u8/mpd
                if (isM3U8orMPD(url)) {
                    addMedia(url, label + ':fetch');
                }

                const p = _fetch.apply(this, args);

                p.then(response => {
                    try {
                        const ct = response.headers.get('Content-Type') || '';
                        if (/mpegurl|dash\+xml|video\//i.test(ct)) {
                            addMedia(url, label + ':fetch:mime', ct);
                        }
                        // Clone response để đọc text
                        if (/mpegurl/i.test(ct)) {
                            response.clone().text().then(text => {
                                if (text.includes('#EXTM3U')) {
                                    addMedia(url, label + ':fetch:m3u8');
                                    parseM3U8Content(text, url, label);
                                }
                            }).catch(() => {});
                        }
                    } catch (e) {}
                }).catch(() => {});

                return p;
            };
        } catch (e) {}
    }

    // Parse m3u8 để lấy sub-playlist (chứa các quality)
    function parseM3U8Content(text, baseUrl, label) {
        try {
            const lines = text.split('\n');
            lines.forEach(line => {
                line = line.trim();
                if (!line || line.startsWith('#')) return;
                if (line.startsWith('http')) {
                    if (isM3U8orMPD(line)) {
                        addMedia(line, label + ':m3u8-child');
                    }
                } else {
                    // Relative URL
                    try {
                        const abs = new URL(line, baseUrl).href;
                        if (isM3U8orMPD(abs)) {
                            addMedia(abs, label + ':m3u8-child-rel');
                        }
                    } catch (e) {}
                }
            });
        } catch (e) {}
    }

    // ==============================================
    // Hook MediaSource - lấy mime type để xác định
    // và dò video element đang dùng blob nào
    // ==============================================
    function hookMediaSource(win, label) {
        try {
            if (!win.MediaSource) return;
            const _addSB = win.MediaSource.prototype.addSourceBuffer;

            win.MediaSource.prototype.addSourceBuffer = function (mime) {
                // Khi MediaSource được dùng, tìm video element có blob src
                // và liên kết với XHR/Fetch requests gần nhất
                setTimeout(() => {
                    try {
                        win.document && win.document.querySelectorAll('video').forEach(v => {
                            if (v.src && v.src.startsWith('blob:')) {
                                // Lưu blob nhưng đánh dấu là cần giải quyết
                                if (!captured.has(v.src)) {
                                    captured.set(v.src, {
                                        url: v.src,
                                        source: label + ':blob',
                                        type: 'BLOB',
                                        quality: 'Auto',
                                        time: Date.now(),
                                        isBlob: true
                                    });
                                    updateBadge();
                                }
                            }
                        });
                    } catch (e) {}
                }, 50);

                return _addSB.apply(this, arguments);
            };
        } catch (e) {}
    }

    // ==============================================
    // Hook tất cả window + iframe
    // ==============================================
    function hookWindow(win, label) {
        try {
            hookXHR(win, label);
            hookFetch(win, label);
            hookMediaSource(win, label);
        } catch (e) {}
    }

    // Hook trang chính - PHẢI CHẠY SỚM NHẤT
    hookWindow(window, 'main');

    // Hook iframe
    function hookIframe(iframe) {
        try {
            const iwin = iframe.contentWindow;
            if (!iwin) return;
            const src = iframe.src || iframe.getAttribute('src') || 'embedded';
            const label = 'iframe:' + src.substring(0, 40);
            hookWindow(iwin, label);
        } catch (e) {}
    }

    // Observe để hook iframe mới + iframe load
    const mo = new MutationObserver(muts => {
        muts.forEach(m => {
            m.addedNodes.forEach(node => {
                if (!node) return;
                try {
                    if (node.tagName === 'IFRAME') {
                        hookIframe(node);
                        node.addEventListener('load', () => {
                            hookIframe(node);
                            scanDocForVideos(node.contentDocument, 'iframe-load');
                        });
                    }
                    if (node.querySelectorAll) {
                        node.querySelectorAll('iframe').forEach(f => {
                            hookIframe(f);
                            f.addEventListener('load', () => {
                                hookIframe(f);
                                scanDocForVideos(f.contentDocument, 'iframe-child-load');
                            });
                        });
                    }
                } catch (e) {}
            });
        });
    });

    // ==============================================
    // Quét DOM - tìm video.currentSrc (không phải blob)
    // ==============================================
    function scanDocForVideos(doc, label) {
        if (!doc) return;
        try {
            doc.querySelectorAll('video').forEach(v => {
                // currentSrc quan trọng hơn src
                [v.currentSrc, v.src].forEach(s => {
                    if (s && !s.startsWith('blob:') && isMediaUrl(s)) {
                        addMedia(s, label + ':video-src');
                    }
                });
                v.querySelectorAll('source').forEach(src => {
                    if (src.src && !src.src.startsWith('blob:')) {
                        addMedia(src.src, label + ':source-tag', src.type);
                    }
                });
            });

            // Script content - chỉ tìm m3u8/mpd (không tìm mp4 tràn lan)
            doc.querySelectorAll('script:not([src])').forEach(s => {
                const text = s.textContent || '';
                // Chỉ extract nếu có dấu hiệu rõ ràng
                const matches = [
                    ...text.matchAll(/["'`](https?:\/\/[^"'`\s\\]{10,}\.m3u8[^"'`\s\\]*)/gi),
                    ...text.matchAll(/["'`](https?:\/\/[^"'`\s\\]{10,}\.mpd[^"'`\s\\]*)/gi),
                ];
                matches.forEach(m => {
                    const url = m[1].trim();
                    if (isM3U8orMPD(url)) addMedia(url, label + ':script');
                });
            });
        } catch (e) {}
    }

    function scanAll() {
        scanDocForVideos(document, 'main');
        document.querySelectorAll('iframe').forEach((f, i) => {
            try {
                hookIframe(f);
                scanDocForVideos(
                    f.contentDocument || f.contentWindow.document,
                    'iframe-' + i
                );
            } catch (e) {}
        });
    }

    // Auto scan
    let autoInterval = null;
    function startAutoScan() {
        if (autoInterval) return;
        autoInterval = setInterval(scanAll, 2000);
    }

    let updateBadge = () => {};

    // ==============================================
    // UI
    // ==============================================
    function initUI() {
        if (document.getElementById('ump-root')) return;

        const css = `
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
                font-family: sans-serif;
            }
            #ump-fab:active { transform: scale(.88); }
            #ump-fab-badge {
                position: absolute; top: -3px; right: -3px;
                background: #43a047; color: white;
                font-size: 10px; min-width: 18px; height: 18px;
                border-radius: 9px; padding: 0 4px;
                display: none; align-items: center; justify-content: center;
                font-weight: 700;
            }
            #ump-backdrop {
                position: fixed; inset: 0; background: rgba(0,0,0,.75);
                z-index: 2147483640; display: none;
            }
            #ump-backdrop.show { display: block; }
            #ump-panel {
                position: fixed; bottom: 86px; right: 12px;
                width: 370px; max-width: calc(100vw - 24px);
                max-height: 65vh;
                background: #1c1c1e; border-radius: 14px;
                z-index: 2147483647;
                display: none; flex-direction: column;
                box-shadow: 0 12px 40px rgba(0,0,0,.8);
                overflow: hidden;
                font-family: -apple-system, sans-serif;
            }
            #ump-panel.show { display: flex; }
            #ump-ph {
                background: #2c2c2e; padding: 11px 14px;
                display: flex; justify-content: space-between; align-items: center;
                border-bottom: 1px solid #3a3a3c; flex-shrink: 0; gap: 6px;
            }
            #ump-ph-title { color: #fff; font-size: 14px; font-weight: 600; flex: 1; }
            #ump-pb-body { overflow-y: auto; flex: 1; padding: 8px; }
            .ump-sbtn {
                border: none; border-radius: 6px; cursor: pointer;
                font-size: 11px; padding: 6px 10px; color: white; font-weight: 600;
            }
            .sb-blue { background: #0a84ff; }
            .sb-gray { background: #48484a; }
            .ump-item {
                background: #2c2c2e; border-radius: 10px;
                padding: 10px 12px; margin: 5px 0;
                cursor: pointer; border: 2px solid transparent;
                transition: border-color .12s;
            }
            .ump-item:hover, .ump-item:active { border-color: #e53935; }
            .ump-itype {
                font-size: 10px; font-weight: 700; color: #e53935;
                margin-bottom: 4px; letter-spacing: .5px;
            }
            .ump-iurl {
                color: #0a84ff; font-size: 11px; font-family: monospace;
                word-break: break-all; margin-bottom: 6px; line-height: 1.5;
            }
            .ump-ibadges { display: flex; gap: 4px; flex-wrap: wrap; }
            .ump-b {
                font-size: 10px; padding: 2px 7px; border-radius: 4px;
                color: white; font-weight: 600;
            }
            .bh { background: #6a1b9a; }
            .bd { background: #1565c0; }
            .bm { background: #2e7d32; }
            .bb { background: #bf360c; }
            .bv { background: #37474f; }
            .bq { background: #1a237e; }
            .bs { background: #3a3a3c; color: #888; }
            .ump-empty {
                color: #666; text-align: center;
                padding: 28px 16px; font-size: 13px; line-height: 2;
            }
            .ump-empty b { color: #aaa; }
            /* Player */
            #ump-player {
                position: fixed; inset: 0; background: #000;
                z-index: 2147483647; display: none; flex-direction: column;
                font-family: -apple-system, sans-serif;
            }
            #ump-player.show { display: flex; }
            #ump-pbar {
                background: #1c1c1e; padding: 8px;
                display: flex; align-items: center; gap: 5px;
                flex-wrap: wrap; flex-shrink: 0;
            }
            #ump-ptitle {
                color: #aaa; font-size: 11px; flex: 1; min-width: 60px;
                overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
            }
            #ump-vwrap { flex: 1; position: relative; overflow: hidden; }
            #ump-vid { width: 100%; height: 100%; object-fit: contain; }
            .pb {
                background: #2c2c2e; color: white; border: none;
                padding: 7px 9px; border-radius: 6px; font-size: 11px;
                cursor: pointer; white-space: nowrap; flex-shrink: 0;
            }
            .pb:active { opacity: .6; }
            .pb.g { background: #1b5e20; }
            .pb.r { background: #b71c1c; }
            .pb.b { background: #0d47a1; }
            #ump-qmenu {
                position: absolute; top: 6px; right: 6px;
                background: #1c1c1e; border: 1px solid #3a3a3c;
                border-radius: 8px; padding: 6px; display: none;
                z-index: 10; min-width: 200px; max-height: 280px; overflow-y: auto;
            }
            #ump-qmenu.show { display: block; }
            .ump-qo {
                color: #ddd; padding: 8px 10px; border-radius: 5px;
                cursor: pointer; font-size: 12px;
                display: flex; justify-content: space-between; gap: 8px;
            }
            .ump-qo:hover { background: #2c2c2e; }
            .ump-qo.cur { background: #b71c1c; color: white; }
            /* CMD */
            #ump-cmd {
                position: fixed; top: 50%; left: 50%;
                transform: translate(-50%, -50%);
                background: #1c1c1e; border-radius: 12px;
                z-index: 2147483647;
                width: 94%; max-width: 490px;
                padding: 15px; display: none;
                box-shadow: 0 12px 40px rgba(0,0,0,.9);
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
                resize: vertical; min-height: 110px; box-sizing: border-box;
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
            }
        `;

        const style = document.createElement('style');
        style.textContent = css;
        document.head.appendChild(style);

        // FAB
        const fab = document.createElement('button');
        fab.id = 'ump-fab';
        fab.innerHTML = `🎬<span id="ump-fab-badge"></span>`;
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
                <span id="ump-ph-title">📡 Media (0)</span>
                <button class="ump-sbtn sb-blue" id="btn-scan">🔍 Quét</button>
                <button class="ump-sbtn sb-gray" id="btn-clear">🗑</button>
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

        // CMD
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

        const toastEl = document.createElement('div');
        toastEl.id = 'ump-toast';
        document.body.appendChild(toastEl);

        // Logic
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
            navigator.clipboard
                ? navigator.clipboard.writeText(text).catch(() => cp2(text))
                : cp2(text);
        }
        function cp2(t) {
            const ta = document.createElement('textarea');
            ta.value = t;
            ta.style.cssText = 'position:fixed;left:-9999px;top:-9999px';
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
        }

        function fname(url) {
            try {
                if (url.startsWith('blob:')) return 'stream_' + Date.now() + '.mp4';
                const p = new URL(url).pathname.split('/').filter(Boolean).pop() || '';
                const n = decodeURIComponent(p.split('?')[0]);
                if (n && /\.\w{2,5}$/.test(n)) return n;
            } catch (e) {}
            return 'video_' + Date.now() + '.mp4';
        }

        updateBadge = function () {
            const b = $('ump-fab-badge');
            if (!b) return;
            // Chỉ đếm non-blob hoặc tất cả
            const real = [...captured.values()].filter(x => !x.isBlob);
            const n = real.length;
            b.style.display = n > 0 ? 'flex' : 'none';
            b.textContent = n > 99 ? '99+' : n;
        };

        function doScan() {
            scanAll();
            renderList();
            toast(`🔍 Đang theo dõi... ${captured.size} media`);
        }

        function renderList() {
            const body = $('ump-pb-body');

            // Lọc: ưu tiên non-blob, lọc blob nếu đã có m3u8
            const hasRealM3U8 = [...captured.values()].some(x => x.type === 'HLS' && !x.isBlob);
            const items = [...captured.values()]
                .filter(x => {
                    if (x.isBlob && hasRealM3U8) return false; // ẩn blob nếu đã có m3u8
                    return true;
                })
                .sort((a, b) => {
                    const o = { HLS: 5, DASH: 4, MP4: 3, WebM: 2, BLOB: 1 };
                    return (o[b.type] || 0) - (o[a.type] || 0);
                });

            $('ump-ph-title').textContent = `📡 Media (${items.length})`;

            if (!items.length) {
                body.innerHTML = `<div class="ump-empty">
                    Script đang theo dõi network...<br>
                    <b>Hãy phát video trên trang</b><br>
                    rồi nhấn 🔍 Quét<br><br>
                    <small style="color:#555">Nếu vẫn trống: thử bấm play/pause video</small>
                </div>`;
                return;
            }

            body.innerHTML = '';
            items.forEach(item => {
                const d = document.createElement('div');
                d.className = 'ump-item';
                const bc = { HLS: 'bh', DASH: 'bd', MP4: 'bm', BLOB: 'bb' }[item.type] || 'bv';
                // Hiện URL đầy đủ nhưng giới hạn dài
                const displayUrl = item.url.length > 80
                    ? item.url.substring(0, 40) + '...' + item.url.substring(item.url.length - 20)
                    : item.url;

                d.innerHTML = `
                    <div class="ump-itype">▶ ${item.type} · ${item.quality} · ${item.source}</div>
                    <div class="ump-iurl">${displayUrl}</div>
                    <div class="ump-ibadges">
                        <span class="ump-b ${bc}">${item.type}</span>
                        <span class="ump-b bq">${item.quality}</span>
                        ${item.isBlob ? '<span class="ump-b bb">BLOB - không tải được</span>' : ''}
                    </div>
                `;
                if (!item.isBlob) {
                    d.onclick = () => { play(item); closePanel(); };
                } else {
                    d.style.opacity = '0.5';
                    d.title = 'Blob URL không tải được trực tiếp';
                }
                body.appendChild(d);
            });
        }

        function play(item) {
            cur = item;
            if (hlsInst) { hlsInst.destroy(); hlsInst = null; }

            const vid = $('ump-vid');
            vid.pause();
            vid.removeAttribute('src');
            vid.load();

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
                        () => window.dashjs.MediaPlayer().create().initialize(vid, item.url, true));
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
            const hls = new window.Hls({
                enableWorker: true,
                lowLatencyMode: true,
                xhrSetup: (xhr) => {
                    xhr.setRequestHeader('Referer', location.href);
                }
            });
            hls.loadSource(url);
            hls.attachMedia(vid);
            hls.on(window.Hls.Events.MANIFEST_PARSED, () => vid.play().catch(() => {}));
            hls.on(window.Hls.Events.ERROR, (e, d) => {
                if (d.fatal) toast('❌ HLS lỗi: ' + d.details);
            });
            hlsInst = hls;
        }

        function loadScript(src, cb) {
            const s = document.createElement('script');
            s.src = src;
            s.onload = cb;
            s.onerror = () => { if (cur) { $('ump-vid').src = cur.url; } };
            document.head.appendChild(s);
        }

        function renderQMenu() {
            const m = $('ump-qmenu');
            m.innerHTML = '';
            const items = [...captured.values()].filter(x => !x.isBlob);
            if (items.length < 2) return;
            items.forEach(item => {
                const d = document.createElement('div');
                d.className = 'ump-qo' + (cur && item.url === cur.url ? ' cur' : '');
                d.innerHTML = `<span>${item.type} · ${item.quality}</span><span style="color:#555;font-size:10px">${item.source.substring(0,20)}</span>`;
                d.onclick = () => { play(item); m.classList.remove('show'); };
                m.appendChild(d);
            });
        }

        const cmds = {
            ytdlp: u =>
                `# Tải stream (tự nhận referer)\nyt-dlp --referer "${location.href}" "${u}"\n\n` +
                `# Chất lượng tốt nhất\nyt-dlp -f "bestvideo+bestaudio" --referer "${location.href}" "${u}"\n\n` +
                `# Tải nhanh với aria2\nyt-dlp --external-downloader aria2c --referer "${location.href}" "${u}"`,

            ffmpeg: u =>
                `# Copy stream (không re-encode, nhanh nhất)\nffmpeg -referer "${location.href}" -i "${u}" -c copy output.mp4\n\n` +
                `# Nếu lỗi thêm user-agent\nffmpeg -user_agent "Mozilla/5.0" -referer "${location.href}" -i "${u}" -c copy output.mp4`,

            wget: u =>
                `wget --referer="${location.href}" \\\n  --user-agent="Mozilla/5.0" \\\n  "${u}" -O video.mp4`,

            aria2: u =>
                `aria2c -x 16 -s 16 -k 1M \\\n  --referer="${location.href}" \\\n  "${u}" -o video.mp4`,

            termux: u =>
                `# Cài tools\npkg install python ffmpeg -y && pip install yt-dlp\n\n` +
                `# Cách 1: yt-dlp (khuyên dùng)\nyt-dlp --referer "${location.href}" "${u}"\n\n` +
                `# Cách 2: ffmpeg (HLS stream)\nffmpeg -referer "${location.href}" \\\n  -i "${u}" -c copy \\\n  ~/storage/downloads/video.mp4`
        };

        function updateCmd() {
            if (!cur || cur.isBlob) return;
            $('ump-cta').value = (cmds[ctab] || (() => ''))(cur.url);
        }

        function showCmd() {
            updateCmd();
            $('ump-cmd').classList.add('show');
            $('ump-backdrop').classList.add('show');
        }

        function closePanel() {
            $('ump-panel').classList.remove('show');
            if (!$('ump-player').classList.contains('show')) {
                $('ump-backdrop').classList.remove('show');
            }
        }

        $('ump-fab').onclick = () => {
            const p = $('ump-panel');
            if (p.classList.contains('show')) { closePanel(); }
            else { doScan(); p.classList.add('show'); $('ump-backdrop').classList.add('show'); }
        };

        $('ump-backdrop').onclick = () => {
            closePanel();
            $('ump-cmd').classList.remove('show');
            if (!$('ump-player').classList.contains('show')) {
                $('ump-backdrop').classList.remove('show');
            }
        };

        $('btn-scan').onclick = e => { e.stopPropagation(); doScan(); };
        $('btn-clear').onclick = e => {
            e.stopPropagation();
            captured.clear(); updateBadge(); renderList();
            toast('🗑 Đã xóa');
        };

        $('pb-list').onclick = () => {
            renderList();
            $('ump-panel').classList.add('show');
        };
        $('pb-q').onclick = () => $('ump-qmenu').classList.toggle('show');
        $('pb-copy').onclick = () => {
            if (!cur) return;
            cp(cur.url);
            toast('✅ Đã copy link m3u8!');
        };
        $('pb-dl').onclick = () => {
            if (!cur) return;
            if (['HLS', 'DASH', 'BLOB'].includes(cur.type)) {
                toast('💡 Stream → dùng FFmpeg/yt-dlp');
                showCmd(); return;
            }
            const a = document.createElement('a');
            a.href = cur.url; a.download = fname(cur.url); a.click();
        };
        $('pb-share').onclick = () => {
            if (!cur) return;
            if (navigator.share) { navigator.share({ url: cur.url }).catch(() => {}); }
            else { cp(cur.url); toast('📋 Đã copy'); }
        };
        $('pb-cmd').onclick = showCmd;
        $('pb-close').onclick = () => {
            const vid = $('ump-vid');
            vid.pause(); vid.src = '';
            if (hlsInst) { hlsInst.destroy(); hlsInst = null; }
            $('ump-player').classList.remove('show');
            $('ump-backdrop').classList.remove('show');
        };

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
    }

    // ==============================================
    // START
    // ==============================================
    function start() {
        // Hook iframe hiện có
        document.querySelectorAll('iframe').forEach(f => {
            hookIframe(f);
            f.addEventListener('load', () => {
                hookIframe(f);
                scanDocForVideos(f.contentDocument, 'iframe');
            });
        });

        mo.observe(document.documentElement, { childList: true, subtree: true });
        startAutoScan();

        setTimeout(scanAll, 500);
        setTimeout(scanAll, 2000);
        setTimeout(scanAll, 5000);
    }

    if (document.body) {
        initUI(); start();
    } else {
        document.addEventListener('DOMContentLoaded', () => { initUI(); start(); });
    }

})();