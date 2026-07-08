// ==UserScript==
// @name         Universal Media Player v5
// @namespace    http://tampermonkey.net/
// @version      5.0
// @description  Bắt media kể cả trong iframe
// @author       You
// @match        *://*/*
// @grant        none
// @run-at       document-start
// ==/UserScript==

(function() {
    'use strict';

    const capturedRequests = new Map();

    const MEDIA_EXT = /\.(m3u8|mpd|mp4|webm|mkv|flv|mov|wmv|m4v|ogv)(\?[^"'\s]*)?$/i;
    const AD_PATTERNS = /doubleclick|googlesyndication|googleadservices|adservice|pagead|adnxs|rubiconproject/i;

    function isRealMedia(url) {
        if (!url || typeof url !== 'string') return false;
        if (url.startsWith('data:')) return false;
        if (AD_PATTERNS.test(url)) return false;
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
        if (!isRealMedia(url)) return;
        // Bỏ qua .ts segment
        if (/\.ts(\?|$)/i.test(url) && !/\.m3u8/i.test(url)) return;
        if (capturedRequests.has(url)) return;
        capturedRequests.set(url, {
            url, source,
            type: getType(url, mime),
            quality: getQuality(url),
            time: Date.now()
        });
        console.log('[UMP] +', getType(url), url.substring(0, 80));
        updateBadge();
    }

    // =============================================
    // HOOK XHR + FETCH của trang chính
    // =============================================
    function hookXHR(win) {
        try {
            const _open = win.XMLHttpRequest.prototype.open;
            const _send = win.XMLHttpRequest.prototype.send;
            win.XMLHttpRequest.prototype.open = function(m, url) {
                this._umpUrl = url;
                return _open.apply(this, arguments);
            };
            win.XMLHttpRequest.prototype.send = function() {
                if (this._umpUrl) {
                    const url = this._umpUrl;
                    this.addEventListener('readystatechange', function() {
                        if (this.readyState === 2) {
                            const ct = this.getResponseHeader && this.getResponseHeader('Content-Type') || '';
                            if (isRealMedia(url) || /video|mpegurl|dash/i.test(ct)) {
                                addMedia(url, 'xhr', ct);
                            }
                        }
                    });
                }
                return _send.apply(this, arguments);
            };
        } catch(e) {}
    }

    function hookFetch(win) {
        try {
            const _fetch = win.fetch;
            win.fetch = function(...args) {
                const url = typeof args[0] === 'string' ? args[0] : (args[0] && args[0].url) || '';
                const p = _fetch.apply(this, args);
                p.then(r => {
                    try {
                        const ct = r.headers.get('Content-Type') || '';
                        if (isRealMedia(url) || /video|mpegurl|dash/i.test(ct)) {
                            addMedia(url, 'fetch', ct);
                        }
                    } catch(e) {}
                }).catch(() => {});
                return p;
            };
        } catch(e) {}
    }

    hookXHR(window);
    hookFetch(window);

    // =============================================
    // QUÉT IFRAME - Cách tiếp cận đa tầng
    // =============================================

    // 1. Quét video element trực tiếp trong iframe
    function scanIframeVideos(iframeEl) {
        try {
            const doc = iframeEl.contentDocument || iframeEl.contentWindow.document;
            if (!doc) return;

            // Quét video elements
            doc.querySelectorAll('video').forEach(v => {
                [v.src, v.currentSrc].forEach(s => {
                    if (s) addMedia(s, 'iframe-video');
                });
                v.querySelectorAll('source').forEach(s => {
                    if (s.src) addMedia(s.src, 'iframe-source', s.type);
                });
            });

            // Quét scripts trong iframe tìm m3u8/mpd
            doc.querySelectorAll('script:not([src])').forEach(s => {
                const text = s.textContent || '';
                const matches = text.match(/https?:\/\/[^\s"'\\]+\.(m3u8|mpd)(\?[^\s"'\\]*)?/gi);
                if (matches) matches.forEach(u => addMedia(u.trim(), 'iframe-script'));

                // Tìm trong JSON/JS variables
                const mp4matches = text.match(/https?:\/\/[^\s"'\\]+\.mp4(\?[^\s"'\\]*)?/gi);
                if (mp4matches) mp4matches.forEach(u => addMedia(u.trim(), 'iframe-script-mp4'));
            });

            // Quét data attributes
            doc.querySelectorAll('[data-src],[data-file],[data-video],[data-hls],[data-source]').forEach(el => {
                ['data-src','data-file','data-video','data-hls','data-source'].forEach(attr => {
                    const val = el.getAttribute(attr);
                    if (val) addMedia(val, 'iframe-data');
                });
            });

            // Hook XHR/Fetch của iframe window
            hookXHR(iframeEl.contentWindow);
            hookFetch(iframeEl.contentWindow);

        } catch(e) {
            // Cross-origin iframe - không thể đọc content
            // Dùng cách khác bên dưới
            console.log('[UMP] Cross-origin iframe, dùng message bridge');
        }
    }

    // 2. Inject script vào iframe cùng origin
    function injectIntoIframe(iframeEl) {
        try {
            const win = iframeEl.contentWindow;
            if (!win) return;

            // Hook mediasource trong iframe
            if (win.MediaSource) {
                const _add = win.MediaSource.prototype.addSourceBuffer;
                win.MediaSource.prototype.addSourceBuffer = function(mime) {
                    win.document && win.document.querySelectorAll('video').forEach(v => {
                        if (v.src && v.src.startsWith('blob:')) addMedia(v.src, 'iframe-mediasource', mime);
                    });
                    return _add.apply(this, arguments);
                };
            }

            // Theo dõi video events trong iframe
            win.document && win.document.addEventListener('play', (e) => {
                if (e.target && e.target.tagName === 'VIDEO') {
                    const v = e.target;
                    setTimeout(() => {
                        [v.src, v.currentSrc].forEach(s => {
                            if (s) addMedia(s, 'iframe-play-event');
                        });
                    }, 500);
                }
            }, true);

        } catch(e) {}
    }

    // 3. Observer để bắt iframe load
    function watchIframes() {
        const processIframe = (iframe) => {
            // Thử ngay
            scanIframeVideos(iframe);
            injectIntoIframe(iframe);

            // Thử lại sau khi iframe load xong
            iframe.addEventListener('load', () => {
                setTimeout(() => {
                    scanIframeVideos(iframe);
                    injectIntoIframe(iframe);
                }, 500);
                // Thử lại nhiều lần vì video có thể load sau
                setTimeout(() => scanIframeVideos(iframe), 1500);
                setTimeout(() => scanIframeVideos(iframe), 3000);
            });
        };

        // Quét các iframe hiện có
        document.querySelectorAll('iframe').forEach(processIframe);

        // Theo dõi iframe mới
        const observer = new MutationObserver(mutations => {
            mutations.forEach(m => {
                m.addedNodes.forEach(node => {
                    if (node.tagName === 'IFRAME') processIframe(node);
                    if (node.querySelectorAll) {
                        node.querySelectorAll('iframe').forEach(processIframe);
                    }
                });
            });
        });

        observer.observe(document.documentElement, {
            childList: true,
            subtree: true
        });
    }

    // 4. Quét DOM trang chính
    function scanMainDOM() {
        // Video elements
        document.querySelectorAll('video').forEach(v => {
            [v.src, v.currentSrc].forEach(s => {
                if (s) addMedia(s, 'dom-video');
            });
            v.querySelectorAll('source').forEach(s => {
                if (s.src) addMedia(s.src, 'dom-source', s.type);
            });
        });

        // Scripts
        document.querySelectorAll('script:not([src])').forEach(s => {
            const text = s.textContent || '';
            const m3u8 = text.match(/https?:\/\/[^\s"'\\]+\.m3u8(\?[^\s"'\\]*)?/gi);
            if (m3u8) m3u8.forEach(u => addMedia(u.trim(), 'script-m3u8'));
            const mpd = text.match(/https?:\/\/[^\s"'\\]+\.mpd(\?[^\s"'\\]*)?/gi);
            if (mpd) mpd.forEach(u => addMedia(u.trim(), 'script-mpd'));
        });

        // Data attrs
        document.querySelectorAll('[data-src],[data-file],[data-video],[data-hls]').forEach(el => {
            ['data-src','data-file','data-video','data-hls'].forEach(a => {
                const v = el.getAttribute(a);
                if (v) addMedia(v, 'data-attr');
            });
        });

        // MediaSource/blob đang chạy
        document.querySelectorAll('video[src^="blob:"]').forEach(v => {
            addMedia(v.src, 'blob-video');
        });
    }

    // 5. Hook MediaSource trang chính
    function hookMediaSource(win) {
        try {
            if (!win.MediaSource) return;
            const _add = win.MediaSource.prototype.addSourceBuffer;
            win.MediaSource.prototype.addSourceBuffer = function(mime) {
                win.document && win.document.querySelectorAll('video').forEach(v => {
                    if (v.src && v.src.startsWith('blob:')) addMedia(v.src, 'mediasource', mime);
                });
                return _add.apply(this, arguments);
            };
        } catch(e) {}
    }

    hookMediaSource(window);

    // =============================================
    // UI
    // =============================================
    let updateBadge = () => {};

    function initUI() {
        if (document.getElementById('ump-root')) return;

        const css = `
            #ump-root{all:initial}
            #ump-root *{box-sizing:border-box;font-family:-apple-system,sans-serif;margin:0;padding:0}
            #ump-fab{
                position:fixed;bottom:20px;right:20px;width:58px;height:58px;
                background:#e53935;color:white;border:none;border-radius:50%;
                font-size:26px;cursor:pointer;
                box-shadow:0 4px 16px rgba(229,57,53,.5);
                z-index:2147483647;
                display:flex;align-items:center;justify-content:center;
                transition:transform .2s;
            }
            #ump-fab:active{transform:scale(.9)}
            #ump-fab-badge{
                position:absolute;top:-4px;right:-4px;
                background:#43a047;color:white;
                font-size:10px;min-width:18px;height:18px;
                border-radius:9px;padding:0 4px;
                display:none;align-items:center;justify-content:center;
                font-weight:bold;
            }
            #ump-backdrop{
                position:fixed;inset:0;background:rgba(0,0,0,.7);
                z-index:2147483640;display:none;
            }
            #ump-backdrop.show{display:block}

            #ump-panel{
                position:fixed;bottom:88px;right:12px;
                width:360px;max-width:calc(100vw - 24px);
                max-height:65vh;
                background:#1c1c1e;border-radius:14px;
                z-index:2147483647;
                display:none;flex-direction:column;
                box-shadow:0 10px 40px rgba(0,0,0,.7);
                overflow:hidden;
            }
            #ump-panel.show{display:flex}
            #ump-panel-head{
                background:#2c2c2e;padding:12px 14px;
                display:flex;justify-content:space-between;align-items:center;
                border-bottom:1px solid #3a3a3c;flex-shrink:0;
            }
            #ump-panel-head span{color:#fff;font-size:14px;font-weight:600}
            #ump-panel-body{overflow-y:auto;flex:1;padding:8px}

            .ump-scan-btn{
                background:#0a84ff;color:white;border:none;
                padding:5px 10px;border-radius:6px;font-size:11px;cursor:pointer;
            }

            .ump-item{
                background:#2c2c2e;border-radius:10px;
                padding:10px 12px;margin:6px 0;cursor:pointer;
                border:2px solid transparent;transition:border-color .15s;
            }
            .ump-item:active{background:#3a3a3c}
            .ump-item:hover{border-color:#e53935}
            .ump-item-name{
                color:#fff;font-size:13px;font-weight:500;
                margin-bottom:5px;
                overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
            }
            .ump-item-url{
                color:#666;font-size:10px;
                overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
                margin-bottom:5px;
            }
            .ump-item-badges{display:flex;gap:5px;flex-wrap:wrap}
            .ump-badge{
                font-size:10px;padding:2px 7px;border-radius:4px;
                color:white;font-weight:600;
            }
            .b-hls{background:#7b1fa2}
            .b-dash{background:#1565c0}
            .b-mp4{background:#2e7d32}
            .b-blob{background:#e65100}
            .b-video{background:#37474f}
            .b-q{background:#1a237e}
            .b-src{background:#3e3e3e;color:#aaa}

            .ump-empty{
                color:#666;text-align:center;
                padding:30px 16px;font-size:13px;line-height:1.8;
            }
            .ump-empty b{color:#aaa}

            /* Player */
            #ump-player{
                position:fixed;inset:0;background:#000;
                z-index:2147483647;display:none;flex-direction:column;
            }
            #ump-player.show{display:flex}
            #ump-pbar{
                background:#1c1c1e;padding:8px;
                display:flex;align-items:center;gap:6px;flex-wrap:wrap;
                flex-shrink:0;
            }
            #ump-ptitle{
                color:#bbb;font-size:11px;flex:1;min-width:80px;
                overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
            }
            #ump-vwrap{flex:1;position:relative;background:#000;overflow:hidden}
            #ump-vid{width:100%;height:100%;object-fit:contain}
            .pb{
                background:#2c2c2e;color:white;border:none;
                padding:7px 10px;border-radius:6px;font-size:11px;
                cursor:pointer;white-space:nowrap;flex-shrink:0;
            }
            .pb:active{opacity:.7}
            .pb.g{background:#2e7d32}
            .pb.r{background:#c62828}
            .pb.b{background:#1565c0}

            /* Quality dropdown */
            #ump-qmenu{
                position:absolute;top:5px;right:5px;
                background:#1c1c1e;border:1px solid #3a3a3c;
                border-radius:8px;padding:6px;
                display:none;z-index:10;
                min-width:180px;max-height:300px;overflow-y:auto;
            }
            #ump-qmenu.show{display:block}
            .ump-qopt{
                color:#ddd;padding:8px 12px;border-radius:5px;
                cursor:pointer;font-size:12px;
                display:flex;justify-content:space-between;gap:8px;
            }
            .ump-qopt:hover{background:#2c2c2e}
            .ump-qopt.cur{background:#c62828;color:white}

            /* Command modal */
            #ump-cmd{
                position:fixed;top:50%;left:50%;
                transform:translate(-50%,-50%);
                background:#1c1c1e;border-radius:12px;
                z-index:2147483647;
                width:92%;max-width:480px;
                padding:16px;
                display:none;
                box-shadow:0 10px 40px rgba(0,0,0,.8);
            }
            #ump-cmd.show{display:block}
            #ump-cmd h4{color:#fff;font-size:14px;margin-bottom:10px}
            #ump-cmd-tabs{display:flex;gap:5px;flex-wrap:wrap;margin-bottom:10px}
            .ctab{
                background:#2c2c2e;color:#888;border:none;
                padding:5px 11px;border-radius:5px;font-size:11px;cursor:pointer;
            }
            .ctab.on{background:#e53935;color:white}
            #ump-cmd-ta{
                width:100%;background:#111;color:#4caf50;
                border:1px solid #333;border-radius:6px;
                padding:10px;font-family:monospace;font-size:11px;
                resize:vertical;min-height:110px;
            }
            #ump-cmd-acts{display:flex;gap:8px;margin-top:10px}

            #ump-toast{
                position:fixed;bottom:88px;left:50%;transform:translateX(-50%);
                background:#323232;color:white;
                padding:9px 18px;border-radius:18px;
                font-size:13px;z-index:2147483647;
                display:none;white-space:nowrap;
                box-shadow:0 4px 12px rgba(0,0,0,.4);
                pointer-events:none;
            }
        `;

        const root = document.createElement('div');
        root.id = 'ump-root';
        document.body.appendChild(root);

        const style = document.createElement('style');
        style.textContent = css;
        document.head.appendChild(style);

        // FAB
        const fab = document.createElement('button');
        fab.id = 'ump-fab';
        fab.title = 'Universal Media Player';
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
            <div id="ump-panel-head">
                <span>📡 Media bắt được</span>
                <div style="display:flex;gap:6px">
                    <button class="ump-scan-btn" id="ump-do-scan">🔍 Quét DOM + iframe</button>
                </div>
            </div>
            <div id="ump-panel-body"></div>
        `;
        document.body.appendChild(panel);

        // Player
        const player = document.createElement('div');
        player.id = 'ump-player';
        player.innerHTML = `
            <div id="ump-pbar">
                <button class="pb" id="pb-list">📋</button>
                <span id="ump-ptitle">-</span>
                <button class="pb b" id="pb-q">⚙️ Chất lượng</button>
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
        document.body.appendChild(player);

        // Command modal
        const cmd = document.createElement('div');
        cmd.id = 'ump-cmd';
        cmd.innerHTML = `
            <h4>💻 Lệnh tải video</h4>
            <div id="ump-cmd-tabs">
                <button class="ctab on" data-t="ytdlp">yt-dlp</button>
                <button class="ctab" data-t="ffmpeg">FFmpeg</button>
                <button class="ctab" data-t="wget">wget</button>
                <button class="ctab" data-t="aria2">aria2</button>
                <button class="ctab" data-t="termux">Termux</button>
            </div>
            <textarea id="ump-cmd-ta" readonly></textarea>
            <div id="ump-cmd-acts">
                <button class="pb g" id="cmd-copy" style="flex:1">📋 Copy lệnh</button>
                <button class="pb r" id="cmd-close" style="flex:1">✕ Đóng</button>
            </div>
        `;
        document.body.appendChild(cmd);

        // Toast
        const toast = document.createElement('div');
        toast.id = 'ump-toast';
        document.body.appendChild(toast);

        // =============================================
        // LOGIC
        // =============================================
        let currentMedia = null;
        let hlsInst = null;
        let currentTab = 'ytdlp';

        const $ = id => document.getElementById(id);

        function showToast(msg) {
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
        function cp2(text) {
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.style.cssText = 'position:fixed;left:-9999px';
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
        }

        function fname(url) {
            try {
                const p = new URL(url).pathname.split('/').filter(Boolean).pop() || '';
                const n = decodeURIComponent(p.split('?')[0]);
                if (n && /\.\w{2,5}$/.test(n)) return n;
            } catch(e) {}
            return 'video_' + Date.now() + '.mp4';
        }

        // Update badge
        updateBadge = function() {
            const badge = $('ump-fab-badge');
            if (!badge) return;
            const n = capturedRequests.size;
            if (n > 0) {
                badge.style.display = 'flex';
                badge.textContent = n > 99 ? '99+' : n;
            } else {
                badge.style.display = 'none';
            }
        };

        setInterval(updateBadge, 800);

        // Full scan
        function doScan() {
            scanMainDOM();
            document.querySelectorAll('iframe').forEach(f => {
                scanIframeVideos(f);
                injectIntoIframe(f);
            });
            updateBadge();
            renderList();
            showToast('🔍 Đã quét xong!');
        }

        // Render danh sách
        function renderList() {
            const body = $('ump-panel-body');
            const items = [...capturedRequests.values()].sort((a, b) => {
                const o = {HLS:4,DASH:3,BLOB:2,MP4:1,WebM:1};
                return (o[b.type]||0) - (o[a.type]||0);
            });

            if (!items.length) {
                body.innerHTML = `<div class="ump-empty">
                    Chưa bắt được media nào.<br><br>
                    <b>Thử các bước sau:</b><br>
                    1️⃣ Bấm ▶️ phát video trên trang<br>
                    2️⃣ Đợi video load vài giây<br>
                    3️⃣ Bấm 🔍 "Quét DOM + iframe"
                </div>`;
                return;
            }

            body.innerHTML = '';
            items.forEach(item => {
                const d = document.createElement('div');
                d.className = 'ump-item';
                const bc = {HLS:'b-hls',DASH:'b-dash',MP4:'b-mp4',BLOB:'b-blob'}[item.type]||'b-video';
                const n = fname(item.url);
                d.innerHTML = `
                    <div class="ump-item-name" title="${item.url}">${n}</div>
                    <div class="ump-item-url">${item.url.substring(0,60)}...</div>
                    <div class="ump-item-badges">
                        <span class="ump-badge ${bc}">${item.type}</span>
                        <span class="ump-badge b-q">${item.quality}</span>
                        <span class="ump-badge b-src">${item.source}</span>
                    </div>
                `;
                d.onclick = () => { play(item); closePanel(); };
                body.appendChild(d);
            });
        }

        // Play
        function play(item) {
            currentMedia = item;
            if (hlsInst) { hlsInst.destroy(); hlsInst = null; }

            const vid = $('ump-vid');

            if (item.type === 'HLS') {
                if (vid.canPlayType('application/vnd.apple.mpegurl')) {
                    vid.src = item.url;
                } else if (window.Hls && window.Hls.isSupported()) {
                    const h = new window.Hls({enableWorker:true,lowLatencyMode:true});
                    h.loadSource(item.url);
                    h.attachMedia(vid);
                    h.on(window.Hls.Events.MANIFEST_PARSED, () => vid.play().catch(()=>{}));
                    hlsInst = h;
                } else {
                    loadScript('https://cdn.jsdelivr.net/npm/hls.js@latest/dist/hls.min.js', () => play(item));
                    return;
                }
            } else if (item.type === 'DASH') {
                if (window.dashjs) {
                    window.dashjs.MediaPlayer().create().initialize(vid, item.url, true);
                } else {
                    loadScript('https://cdn.dashjs.org/latest/dash.all.min.js', () => play(item));
                    return;
                }
            } else {
                vid.src = item.url;
                vid.load();
            }

            $('ump-ptitle').textContent = `${fname(item.url)} · ${item.type} · ${item.quality}`;
            renderQMenu();
            $('ump-player').classList.add('show');
            $('ump-backdrop').classList.add('show');
        }

        function loadScript(src, cb) {
            const s = document.createElement('script');
            s.src = src; s.onload = cb;
            s.onerror = () => {
                $('ump-vid').src = currentMedia.url;
                showToast('⚠️ Fallback native player');
            };
            document.head.appendChild(s);
        }

        // Quality menu
        function renderQMenu() {
            const m = $('ump-qmenu');
            m.innerHTML = '';
            const items = [...capturedRequests.values()];
            if (items.length < 2) return;
            items.forEach(item => {
                const d = document.createElement('div');
                d.className = 'ump-qopt' + (currentMedia && item.url===currentMedia.url?' cur':'');
                d.innerHTML = `<span>${item.type}</span><span>${item.quality}</span>`;
                d.onclick = () => { play(item); m.classList.remove('show'); };
                m.appendChild(d);
            });
        }

        // Commands
        const cmds = {
            ytdlp: u => `yt-dlp "${u}"\n\nyt-dlp -f "bestvideo+bestaudio" "${u}"\n\nyt-dlp -x --audio-format mp3 "${u}"`,
            ffmpeg: u => `ffmpeg -i "${u}" -c copy output.mp4\n\nffmpeg -i "${u}" -c:v libx264 -c:a aac output.mp4`,
            wget: u => `wget "${u}" -O video.mp4\n\nwget --header="Referer: ${location.href}" "${u}" -O video.mp4`,
            aria2: u => `aria2c -x 16 -s 16 -k 1M "${u}" -o video.mp4`,
            termux: u => `pkg install python ffmpeg wget aria2 -y\npip install yt-dlp\n\n# HLS/stream:\nffmpeg -i "${u}" -c copy ~/storage/downloads/video.mp4\n\n# hoặc:\nyt-dlp "${u}"`
        };

        function updateCmd() {
            if (!currentMedia) return;
            const ta = $('ump-cmd-ta');
            ta.value = cmds[currentTab] ? cmds[currentTab](currentMedia.url) : '';
        }

        // Events
        fab.onclick = () => {
            if (panel.classList.contains('show')) { closePanel(); }
            else { renderList(); panel.classList.add('show'); bd.classList.add('show'); }
        };

        bd.onclick = () => {
            closePanel();
            cmd.classList.remove('show');
            if (!$('ump-player').classList.contains('show')) bd.classList.remove('show');
        };

        $('ump-do-scan').onclick = (e) => { e.stopPropagation(); doScan(); };

        $('pb-list').onclick = () => { renderList(); panel.classList.add('show'); };
        $('pb-q').onclick = () => $('ump-qmenu').classList.toggle('show');
        $('pb-copy').onclick = () => { if(!currentMedia)return; cp(currentMedia.url); showToast('✅ Đã copy!'); };
        $('pb-dl').onclick = () => {
            if (!currentMedia) return;
            if (['HLS','DASH'].includes(currentMedia.type)) {
                showToast('⚠️ Stream cần dùng FFmpeg/yt-dlp');
                showCmd(); return;
            }
            const a = document.createElement('a');
            a.href = currentMedia.url; a.download = fname(currentMedia.url); a.click();
            showToast('⬇️ Đang tải...');
        };
        $('pb-share').onclick = () => {
            if (!currentMedia) return;
            navigator.share ? navigator.share({url: currentMedia.url}) : (cp(currentMedia.url), showToast('📋 Đã copy link'));
        };
        $('pb-cmd').onclick = () => showCmd();
        $('pb-close').onclick = () => {
            const v = $('ump-vid');
            v.pause(); v.src = '';
            if (hlsInst) { hlsInst.destroy(); hlsInst = null; }
            $('ump-player').classList.remove('show');
            bd.classList.remove('show');
        };

        function showCmd() {
            updateCmd();
            cmd.classList.add('show');
            bd.classList.add('show');
        }

        document.querySelectorAll('.ctab').forEach(btn => {
            btn.onclick = () => {
                document.querySelectorAll('.ctab').forEach(b => b.classList.remove('on'));
                btn.classList.add('on');
                currentTab = btn.dataset.t;
                updateCmd();
            };
        });

        $('cmd-copy').onclick = () => { cp($('ump-cmd-ta').value); showToast('✅ Đã copy lệnh!'); };
        $('cmd-close').onclick = () => cmd.classList.remove('show');

        function closePanel() {
            panel.classList.remove('show');
            if (!$('ump-player').classList.contains('show')) bd.classList.remove('show');
        }
    }

    // =============================================
    // KHỞI ĐỘNG
    // =============================================
    function start() {
        watchIframes();
        scanMainDOM();
        // Auto scan sau 2s và 5s để bắt video lazy load
        setTimeout(scanMainDOM, 2000);
        setTimeout(scanMainDOM, 5000);
    }

    if (document.body) {
        initUI();
        start();
    } else {
        document.addEventListener('DOMContentLoaded', () => {
            initUI();
            start();
        });
    }

})();