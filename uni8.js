// ==UserScript==
// @name         Universal Media Player - Advanced
// @namespace    http://tampermonkey.net/
// @version      4.0
// @description  Bắt network request media thật sự
// @author       You
// @match        *://*/*
// @grant        none
// @run-at       document-start
// ==/UserScript==

(function() {
    'use strict';

    // ==========================================
    // NETWORK INTERCEPTOR - Chạy sớm nhất có thể
    // ==========================================
    const capturedRequests = new Map();

    const MEDIA_EXTENSIONS = /\.(m3u8|mpd|mp4|webm|mkv|flv|avi|mov|wmv|m4v|ts|ogv)(\?|#|$)/i;
    const MEDIA_MIME = /video\/|audio\/|application\/(x-mpegurl|vnd\.apple\.mpegurl|dash\+xml)/i;
    const AD_PATTERNS = /doubleclick|googlesyndication|googleadservices|adservice|pagead|\.ads\.|\/ads\/|adnxs|rubiconproject|openx\.net|pubmatic/i;

    function isRealMediaUrl(url) {
        if (!url || typeof url !== 'string') return false;
        if (url.startsWith('data:')) return false;
        if (url.startsWith('blob:')) return true; // blob luôn là media thật
        if (AD_PATTERNS.test(url)) return false;
        return MEDIA_EXTENSIONS.test(url);
    }

    function getMediaInfo(url, mimeType = '') {
        let type = 'unknown';
        if (/\.m3u8/i.test(url) || /mpegurl/i.test(mimeType)) type = 'HLS';
        else if (/\.mpd/i.test(url) || /dash\+xml/i.test(mimeType)) type = 'DASH';
        else if (/\.mp4/i.test(url)) type = 'MP4';
        else if (/\.webm/i.test(url)) type = 'WebM';
        else if (/\.mkv/i.test(url)) type = 'MKV';
        else if (/\.ts(\?|$)/i.test(url)) type = 'TS';
        else if (/\.flv/i.test(url)) type = 'FLV';
        else if (url.startsWith('blob:')) type = 'BLOB';

        // Đoán chất lượng từ URL
        let quality = 'Auto';
        const q = url.match(/[_\-\/](\d{3,4})p/i) || url.match(/(\d{3,4})p/i);
        if (q) quality = q[1] + 'p';
        else if (/4k|2160/i.test(url)) quality = '4K';
        else if (/1080|fhd/i.test(url)) quality = '1080p';
        else if (/720|hd/i.test(url)) quality = '720p';
        else if (/480/i.test(url)) quality = '480p';
        else if (/360/i.test(url)) quality = '360p';

        return { type, quality };
    }

    function addRequest(url, mimeType = '', source = 'xhr') {
        if (!isRealMediaUrl(url)) return;
        if (capturedRequests.has(url)) return;

        const info = getMediaInfo(url, mimeType);

        // Bỏ qua TS segment (chỉ lấy manifest m3u8)
        if (info.type === 'TS') return;

        capturedRequests.set(url, {
            url,
            type: info.type,
            quality: info.quality,
            source,
            mimeType,
            timestamp: Date.now()
        });

        console.log('[UMP] Captured:', info.type, url);
    }

    // Hook XMLHttpRequest
    const _xhrOpen = XMLHttpRequest.prototype.open;
    const _xhrSetHeader = XMLHttpRequest.prototype.setRequestHeader;

    XMLHttpRequest.prototype.open = function(method, url) {
        this._umpUrl = url;
        // Hook onreadystatechange để lấy mime type
        const originalSend = this.send.bind(this);
        this._umpOriginalSend = originalSend;
        return _xhrOpen.apply(this, arguments);
    };

    const _xhrSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.send = function() {
        if (this._umpUrl) {
            const url = this._umpUrl;
            this.addEventListener('readystatechange', function() {
                if (this.readyState === 2) { // HEADERS_RECEIVED
                    const ct = this.getResponseHeader('Content-Type') || '';
                    if (MEDIA_MIME.test(ct) || isRealMediaUrl(url)) {
                        addRequest(url, ct, 'xhr');
                    }
                }
            });
        }
        return _xhrSend.apply(this, arguments);
    };

    // Hook Fetch API
    const _fetch = window.fetch;
    window.fetch = function(...args) {
        const req = args[0];
        const url = typeof req === 'string' ? req : req instanceof Request ? req.url : '';

        const promise = _fetch.apply(this, args);

        promise.then(response => {
            try {
                const ct = response.headers.get('Content-Type') || '';
                if (MEDIA_MIME.test(ct) || isRealMediaUrl(url)) {
                    addRequest(url, ct, 'fetch');
                }
            } catch(e) {}
        }).catch(() => {});

        return promise;
    };

    // Hook MediaSource để bắt blob
    if (window.MediaSource) {
        const _addSourceBuffer = MediaSource.prototype.addSourceBuffer;
        MediaSource.prototype.addSourceBuffer = function(mimeType) {
            // Tìm video element đang dùng mediasource này
            document.querySelectorAll('video').forEach(v => {
                if (v.src && v.src.startsWith('blob:') && !capturedRequests.has(v.src)) {
                    addRequest(v.src, mimeType, 'mediasource');
                }
            });
            return _addSourceBuffer.apply(this, arguments);
        };
    }

    // ==========================================
    // UI - Load sau khi DOM ready
    // ==========================================
    function initUI() {
        if (document.getElementById('ump-root')) return;

        const styles = `
            #ump-root * { box-sizing: border-box; font-family: -apple-system, sans-serif; }
            #ump-fab {
                position: fixed;
                bottom: 20px;
                right: 20px;
                width: 56px;
                height: 56px;
                background: #e53935;
                color: white;
                border: none;
                border-radius: 50%;
                font-size: 24px;
                cursor: pointer;
                box-shadow: 0 4px 16px rgba(229,57,53,0.5);
                z-index: 2147483647;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: transform 0.2s;
            }
            #ump-fab:hover { transform: scale(1.1); }
            #ump-fab:active { transform: scale(0.9); }
            #ump-fab-badge {
                position: absolute;
                top: -4px;
                right: -4px;
                background: #43a047;
                color: white;
                font-size: 10px;
                width: 18px;
                height: 18px;
                border-radius: 50%;
                display: none;
                align-items: center;
                justify-content: center;
                font-weight: bold;
            }
            #ump-backdrop {
                position: fixed;
                inset: 0;
                background: rgba(0,0,0,0.75);
                z-index: 2147483640;
                display: none;
            }
            #ump-backdrop.show { display: block; }

            /* Media List Panel */
            #ump-list-panel {
                position: fixed;
                bottom: 90px;
                right: 20px;
                width: 380px;
                max-width: calc(100vw - 40px);
                max-height: 60vh;
                background: #1e1e1e;
                border-radius: 12px;
                z-index: 2147483647;
                display: none;
                flex-direction: column;
                box-shadow: 0 8px 32px rgba(0,0,0,0.6);
                overflow: hidden;
            }
            #ump-list-panel.show { display: flex; }
            #ump-list-head {
                background: #2d2d2d;
                padding: 12px 16px;
                display: flex;
                justify-content: space-between;
                align-items: center;
                border-bottom: 1px solid #3d3d3d;
            }
            #ump-list-head span {
                color: #fff;
                font-size: 14px;
                font-weight: 600;
            }
            #ump-rescan {
                background: #e53935;
                color: white;
                border: none;
                padding: 5px 10px;
                border-radius: 4px;
                font-size: 11px;
                cursor: pointer;
            }
            #ump-list-body {
                overflow-y: auto;
                flex: 1;
                padding: 8px;
            }
            .ump-item {
                background: #2d2d2d;
                border-radius: 8px;
                padding: 10px 12px;
                margin: 6px 0;
                cursor: pointer;
                border: 2px solid transparent;
                transition: all 0.15s;
            }
            .ump-item:hover {
                border-color: #e53935;
                background: #333;
            }
            .ump-item-name {
                color: #fff;
                font-size: 13px;
                font-weight: 500;
                margin-bottom: 4px;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            }
            .ump-item-meta {
                display: flex;
                gap: 6px;
                flex-wrap: wrap;
            }
            .ump-badge {
                font-size: 10px;
                padding: 2px 6px;
                border-radius: 3px;
                color: white;
                font-weight: 600;
            }
            .badge-hls { background: #7b1fa2; }
            .badge-dash { background: #1565c0; }
            .badge-mp4 { background: #2e7d32; }
            .badge-blob { background: #e65100; }
            .badge-other { background: #555; }
            .badge-quality { background: #37474f; }
            .badge-source { background: #4a4a4a; color: #aaa; }
            .ump-empty {
                color: #666;
                text-align: center;
                padding: 30px 20px;
                font-size: 13px;
            }

            /* Player */
            #ump-player {
                position: fixed;
                inset: 0;
                background: #000;
                z-index: 2147483647;
                display: none;
                flex-direction: column;
            }
            #ump-player.show { display: flex; }
            #ump-player-bar {
                background: #1a1a1a;
                padding: 8px 10px;
                display: flex;
                align-items: center;
                gap: 6px;
                flex-wrap: wrap;
                flex-shrink: 0;
            }
            #ump-player-title {
                color: #ccc;
                font-size: 11px;
                flex: 1;
                min-width: 100px;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            }
            #ump-video-wrap {
                flex: 1;
                position: relative;
                overflow: hidden;
            }
            #ump-video {
                width: 100%;
                height: 100%;
                object-fit: contain;
                background: #000;
            }
            .ump-pbtn {
                background: #333;
                color: white;
                border: none;
                padding: 6px 10px;
                border-radius: 4px;
                cursor: pointer;
                font-size: 11px;
                white-space: nowrap;
                flex-shrink: 0;
            }
            .ump-pbtn:hover { background: #444; }
            .ump-pbtn.red { background: #c62828; }
            .ump-pbtn.red:hover { background: #e53935; }
            .ump-pbtn.green { background: #2e7d32; }
            .ump-pbtn.green:hover { background: #43a047; }

            /* Quality Menu */
            #ump-quality-menu {
                position: absolute;
                top: 50px;
                right: 10px;
                background: #1a1a1a;
                border: 1px solid #444;
                border-radius: 6px;
                padding: 6px;
                display: none;
                z-index: 10;
                min-width: 160px;
                max-height: 250px;
                overflow-y: auto;
            }
            #ump-quality-menu.show { display: block; }
            .ump-q-opt {
                color: #ddd;
                padding: 7px 12px;
                border-radius: 4px;
                cursor: pointer;
                font-size: 12px;
                display: flex;
                justify-content: space-between;
                gap: 8px;
            }
            .ump-q-opt:hover { background: #333; }
            .ump-q-opt.active { background: #c62828; color: white; }

            /* Command Modal */
            #ump-cmd-modal {
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                background: #1e1e1e;
                border-radius: 10px;
                z-index: 2147483647;
                width: 90%;
                max-width: 500px;
                padding: 16px;
                display: none;
                box-shadow: 0 8px 32px rgba(0,0,0,0.8);
            }
            #ump-cmd-modal.show { display: block; }
            #ump-cmd-modal h4 { color: #fff; margin: 0 0 10px; font-size: 14px; }
            #ump-cmd-tabs {
                display: flex;
                gap: 6px;
                margin-bottom: 10px;
                flex-wrap: wrap;
            }
            .ump-tab {
                background: #333;
                color: #aaa;
                border: none;
                padding: 5px 12px;
                border-radius: 4px;
                cursor: pointer;
                font-size: 12px;
            }
            .ump-tab.active { background: #e53935; color: white; }
            #ump-cmd-text {
                width: 100%;
                background: #111;
                color: #0f0;
                border: 1px solid #333;
                border-radius: 4px;
                padding: 10px;
                font-family: monospace;
                font-size: 11px;
                resize: vertical;
                min-height: 100px;
            }
            #ump-cmd-actions {
                display: flex;
                gap: 8px;
                margin-top: 10px;
            }

            /* Toast */
            #ump-toast {
                position: fixed;
                bottom: 90px;
                left: 50%;
                transform: translateX(-50%);
                background: #323232;
                color: white;
                padding: 10px 20px;
                border-radius: 20px;
                font-size: 13px;
                z-index: 2147483647;
                display: none;
                white-space: nowrap;
                box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            }
        `;

        const root = document.createElement('div');
        root.id = 'ump-root';
        root.innerHTML = `<style>${styles}</style>`;
        document.body.appendChild(root);

        // FAB Button
        const fab = document.createElement('button');
        fab.id = 'ump-fab';
        fab.innerHTML = `🎬<span id="ump-fab-badge"></span>`;
        fab.title = 'Universal Media Player';
        document.body.appendChild(fab);

        // Backdrop
        const backdrop = document.createElement('div');
        backdrop.id = 'ump-backdrop';
        document.body.appendChild(backdrop);

        // List Panel
        const listPanel = document.createElement('div');
        listPanel.id = 'ump-list-panel';
        listPanel.innerHTML = `
            <div id="ump-list-head">
                <span>📡 Media đã bắt được</span>
                <button id="ump-rescan">🔄 Quét lại DOM</button>
            </div>
            <div id="ump-list-body">
                <div class="ump-empty">Chưa có media nào.<br>Hãy phát video trên trang rồi quay lại.</div>
            </div>
        `;
        document.body.appendChild(listPanel);

        // Player
        const player = document.createElement('div');
        player.id = 'ump-player';
        player.innerHTML = `
            <div id="ump-player-bar">
                <button class="ump-pbtn green" id="ump-btn-list">📋</button>
                <span id="ump-player-title">-</span>
                <button class="ump-pbtn" id="ump-btn-quality">⚙️ Chất lượng</button>
                <button class="ump-pbtn green" id="ump-btn-copy">📋 Copy</button>
                <button class="ump-pbtn green" id="ump-btn-dl">⬇️</button>
                <button class="ump-pbtn green" id="ump-btn-share">🔗</button>
                <button class="ump-pbtn green" id="ump-btn-cmd">💻 Lệnh</button>
                <button class="ump-pbtn red" id="ump-btn-close">✕</button>
            </div>
            <div id="ump-video-wrap">
                <video id="ump-video" controls playsinline preload="auto"></video>
                <div id="ump-quality-menu"></div>
            </div>
        `;
        document.body.appendChild(player);

        // Command Modal
        const cmdModal = document.createElement('div');
        cmdModal.id = 'ump-cmd-modal';
        cmdModal.innerHTML = `
            <h4>💻 Lệnh tải</h4>
            <div id="ump-cmd-tabs">
                <button class="ump-tab active" data-tab="ytdlp">yt-dlp</button>
                <button class="ump-tab" data-tab="ffmpeg">FFmpeg</button>
                <button class="ump-tab" data-tab="wget">wget/curl</button>
                <button class="ump-tab" data-tab="aria2">aria2</button>
                <button class="ump-tab" data-tab="termux">Termux</button>
            </div>
            <textarea id="ump-cmd-text" readonly></textarea>
            <div id="ump-cmd-actions">
                <button class="ump-pbtn green" id="ump-cmd-copy" style="flex:1">📋 Copy lệnh</button>
                <button class="ump-pbtn red" id="ump-cmd-close" style="flex:1">✕ Đóng</button>
            </div>
        `;
        document.body.appendChild(cmdModal);

        // Toast
        const toast = document.createElement('div');
        toast.id = 'ump-toast';
        document.body.appendChild(toast);

        initLogic();
    }

    function initLogic() {
        let currentMedia = null;
        let hlsInstance = null;
        let currentTab = 'ytdlp';

        const fab = document.getElementById('ump-fab');
        const badge = document.getElementById('ump-fab-badge');
        const backdrop = document.getElementById('ump-backdrop');
        const listPanel = document.getElementById('ump-list-panel');
        const listBody = document.getElementById('ump-list-body');
        const player = document.getElementById('ump-player');
        const video = document.getElementById('ump-video');
        const playerTitle = document.getElementById('ump-player-title');
        const qualityMenu = document.getElementById('ump-quality-menu');
        const cmdModal = document.getElementById('ump-cmd-modal');
        const cmdText = document.getElementById('ump-cmd-text');

        // ---- Helpers ----
        function toast(msg, color = '#323232') {
            const t = document.getElementById('ump-toast');
            t.textContent = msg;
            t.style.background = color;
            t.style.display = 'block';
            clearTimeout(t._t);
            t._t = setTimeout(() => t.style.display = 'none', 2500);
        }

        function copyText(text) {
            if (navigator.clipboard) {
                navigator.clipboard.writeText(text).catch(() => fallbackCopy(text));
            } else {
                fallbackCopy(text);
            }
        }

        function fallbackCopy(text) {
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.style.cssText = 'position:fixed;left:-9999px;top:-9999px';
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
        }

        function getFilename(url) {
            try {
                const u = new URL(url);
                let name = u.pathname.split('/').filter(Boolean).pop() || '';
                name = decodeURIComponent(name.split('?')[0]);
                if (name && name.includes('.')) return name;
            } catch(e) {}
            return 'video_' + Date.now() + '.mp4';
        }

        function updateBadge() {
            const count = capturedRequests.size;
            if (count > 0) {
                badge.style.display = 'flex';
                badge.textContent = count > 99 ? '99+' : count;
            } else {
                badge.style.display = 'none';
            }
        }

        // Update badge theo thời gian thực
        setInterval(updateBadge, 1000);

        // ---- Scan DOM ----
        function scanDOM() {
            // Quét video elements
            document.querySelectorAll('video').forEach(v => {
                [v.src, v.currentSrc].forEach(src => {
                    if (src && isRealMediaUrl(src)) addRequest(src, '', 'dom-video');
                });
                v.querySelectorAll('source').forEach(s => {
                    if (s.src && isRealMediaUrl(s.src)) addRequest(s.src, s.type || '', 'dom-source');
                });
            });

            // Quét script nội dung tìm m3u8/mpd
            document.querySelectorAll('script:not([src])').forEach(s => {
                const text = s.textContent;
                const matches = text.match(/https?:\/\/[^"'\s\\]+\.(m3u8|mpd)[^"'\s\\]*/gi);
                if (matches) {
                    matches.forEach(url => {
                        url = url.replace(/\\$/, '').trim();
                        if (isRealMediaUrl(url)) addRequest(url, '', 'script');
                    });
                }
            });

            // Quét data attributes
            document.querySelectorAll('[data-src],[data-video-src],[data-hls],[data-stream]').forEach(el => {
                ['data-src','data-video-src','data-hls','data-stream'].forEach(attr => {
                    const val = el.getAttribute(attr);
                    if (val && isRealMediaUrl(val)) addRequest(val, '', 'data-attr');
                });
            });

            updateBadge();
        }

        // ---- Render List ----
        function renderList() {
            scanDOM(); // Quét DOM mỗi lần mở

            const items = [...capturedRequests.values()]
                .sort((a, b) => {
                    // Ưu tiên HLS > DASH > MP4 > khác
                    const order = { HLS: 4, DASH: 3, BLOB: 2, MP4: 1, WebM: 1 };
                    return (order[b.type] || 0) - (order[a.type] || 0);
                });

            if (items.length === 0) {
                listBody.innerHTML = `<div class="ump-empty">
                    Chưa bắt được media nào.<br><br>
                    👉 Hãy <b>phát video trên trang</b> rồi click Scan lại.<br>
                    Script đang tự động bắt network request.
                </div>`;
                return;
            }

            listBody.innerHTML = '';
            items.forEach(item => {
                const div = document.createElement('div');
                div.className = 'ump-item';

                const badgeClass = {
                    HLS: 'badge-hls',
                    DASH: 'badge-dash',
                    MP4: 'badge-mp4',
                    BLOB: 'badge-blob'
                }[item.type] || 'badge-other';

                const name = getFilename(item.url);

                div.innerHTML = `
                    <div class="ump-item-name" title="${item.url}">${name}</div>
                    <div class="ump-item-meta">
                        <span class="ump-badge ${badgeClass}">${item.type}</span>
                        <span class="ump-badge badge-quality">${item.quality}</span>
                        <span class="ump-badge badge-source">${item.source}</span>
                    </div>
                `;
                div.onclick = () => {
                    playMedia(item);
                    closeList();
                };
                listBody.appendChild(div);
            });
        }

        // ---- Play Media ----
        function playMedia(item) {
            currentMedia = item;

            // Destroy old hls
            if (hlsInstance) {
                hlsInstance.destroy();
                hlsInstance = null;
            }

            if (item.type === 'HLS') {
                loadHLS(item.url);
            } else if (item.type === 'DASH') {
                loadDASH(item.url);
            } else {
                video.src = item.url;
                video.load();
            }

            playerTitle.textContent = getFilename(item.url) + ` [${item.type} · ${item.quality}]`;
            renderQualityMenu();

            closeList();
            player.classList.add('show');
            backdrop.classList.add('show');
        }

        function loadHLS(url) {
            if (video.canPlayType('application/vnd.apple.mpegurl')) {
                // Native HLS (Safari, iOS)
                video.src = url;
            } else if (window.Hls && Hls.isSupported()) {
                const hls = new Hls({ enableWorker: true });
                hls.loadSource(url);
                hls.attachMedia(video);
                hls.on(Hls.Events.MANIFEST_PARSED, () => video.play().catch(()=>{}));
                hls.on(Hls.Events.ERROR, (e, d) => {
                    if (d.fatal) toast('❌ HLS Error: ' + d.type, '#c62828');
                });
                hlsInstance = hls;
            } else {
                // Load hls.js rồi thử lại
                loadScript('https://cdn.jsdelivr.net/npm/hls.js@latest/dist/hls.min.js', () => loadHLS(url));
            }
        }

        function loadDASH(url) {
            if (window.dashjs) {
                const player = dashjs.MediaPlayer().create();
                player.initialize(video, url, true);
            } else {
                loadScript('https://cdn.dashjs.org/latest/dash.all.min.js', () => loadDASH(url));
            }
        }

        function loadScript(src, cb) {
            const s = document.createElement('script');
            s.src = src;
            s.onload = cb;
            s.onerror = () => {
                video.src = currentMedia.url;
                toast('⚠️ Không load được thư viện, thử native player');
            };
            document.head.appendChild(s);
        }

        // ---- Quality Menu ----
        function renderQualityMenu() {
            const items = [...capturedRequests.values()];
            qualityMenu.innerHTML = '';

            if (items.length <= 1) return;

            items.forEach(item => {
                const div = document.createElement('div');
                div.className = 'ump-q-opt' + (currentMedia && item.url === currentMedia.url ? ' active' : '');
                div.innerHTML = `
                    <span>${item.type}</span>
                    <span>${item.quality}</span>
                `;
                div.onclick = () => {
                    playMedia(item);
                    qualityMenu.classList.remove('show');
                };
                qualityMenu.appendChild(div);
            });
        }

        // ---- Commands ----
        const commands = {
            ytdlp: (url) =>
                `yt-dlp "${url}"\n\n` +
                `# Chất lượng tốt nhất\nyt-dlp -f "bestvideo+bestaudio" "${url}"\n\n` +
                `# Chỉ audio\nyt-dlp -x --audio-format mp3 "${url}"`,

            ffmpeg: (url) =>
                `# Stream copy (nhanh, không re-encode)\nffmpeg -i "${url}" -c copy output.mp4\n\n` +
                `# Re-encode\nffmpeg -i "${url}" -c:v libx264 -c:a aac output.mp4`,

            wget: (url) =>
                `wget "${url}" -O video.mp4\n\n` +
                `# Nếu cần header\nwget --header="Referer: ${location.href}" "${url}" -O video.mp4`,

            aria2: (url) =>
                `aria2c -x 16 -s 16 -k 1M "${url}" -o video.mp4\n\n` +
                `# Với referer\naria2c -x 16 --referer="${location.href}" "${url}"`,

            termux: (url) =>
                `# Cài tools\npkg install python ffmpeg wget aria2 -y\npip install yt-dlp\n\n` +
                `# Tải\nyt-dlp "${url}"\n\n` +
                `# Hoặc ffmpeg (cho m3u8)\nffmpeg -i "${url}" -c copy ~/storage/downloads/video.mp4`
        };

        function updateCmdText() {
            if (!currentMedia) return;
            cmdText.value = commands[currentTab] ? commands[currentTab](currentMedia.url) : '';
        }

        // ---- FAB Events ----
        fab.onclick = () => {
            if (listPanel.classList.contains('show')) {
                closeList();
            } else {
                renderList();
                listPanel.classList.add('show');
                backdrop.classList.add('show');
            }
        };

        document.getElementById('ump-rescan').onclick = (e) => {
            e.stopPropagation();
            scanDOM();
            renderList();
            toast('🔄 Đã quét lại DOM');
        };

        backdrop.onclick = () => {
            closeList();
            cmdModal.classList.remove('show');
            if (!player.classList.contains('show')) {
                backdrop.classList.remove('show');
            }
        };

        // Player buttons
        document.getElementById('ump-btn-list').onclick = () => {
            renderList();
            listPanel.classList.add('show');
        };

        document.getElementById('ump-btn-quality').onclick = () => {
            qualityMenu.classList.toggle('show');
        };

        document.getElementById('ump-btn-copy').onclick = () => {
            if (!currentMedia) return;
            copyText(currentMedia.url);
            toast('✅ Đã copy link!', '#2e7d32');
        };

        document.getElementById('ump-btn-dl').onclick = () => {
            if (!currentMedia) return;
            if (currentMedia.type === 'HLS' || currentMedia.type === 'DASH') {
                toast('⚠️ Stream này cần dùng FFmpeg/yt-dlp để tải');
                showCmd();
                return;
            }
            const a = document.createElement('a');
            a.href = currentMedia.url;
            a.download = getFilename(currentMedia.url);
            a.click();
            toast('⬇️ Đang tải...');
        };

        document.getElementById('ump-btn-share').onclick = () => {
            if (!currentMedia) return;
            if (navigator.share) {
                navigator.share({ url: currentMedia.url }).catch(() => {});
            } else {
                copyText(currentMedia.url);
                toast('📋 Đã copy link để chia sẻ');
            }
        };

        document.getElementById('ump-btn-cmd').onclick = () => showCmd();

        document.getElementById('ump-btn-close').onclick = () => {
            video.pause();
            video.src = '';
            if (hlsInstance) { hlsInstance.destroy(); hlsInstance = null; }
            player.classList.remove('show');
            backdrop.classList.remove('show');
        };

        // Command modal
        function showCmd() {
            updateCmdText();
            cmdModal.classList.add('show');
            backdrop.classList.add('show');
        }

        document.querySelectorAll('.ump-tab').forEach(btn => {
            btn.onclick = () => {
                document.querySelectorAll('.ump-tab').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                currentTab = btn.dataset.tab;
                updateCmdText();
            };
        });

        document.getElementById('ump-cmd-copy').onclick = () => {
            copyText(cmdText.value);
            toast('✅ Đã copy lệnh!', '#2e7d32');
        };

        document.getElementById('ump-cmd-close').onclick = () => {
            cmdModal.classList.remove('show');
        };

        function closeList() {
            listPanel.classList.remove('show');
            if (!player.classList.contains('show')) {
                backdrop.classList.remove('show');
            }
        }
    }

    // Init UI sau khi DOM ready
    if (document.body) {
        initUI();
    } else {
        document.addEventListener('DOMContentLoaded', initUI);
    }

})();