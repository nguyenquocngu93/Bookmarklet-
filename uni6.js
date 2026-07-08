// ==UserScript==
// @name         Universal Media Player - Advanced
// @namespace    http://tampermonkey.net/
// @version      3.0
// @description  Quét tất cả media bao gồm HLS, DASH, m3u8, mpd
// @author       You
// @match        *://*/*
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';

    const styles = `
        .ump-overlay {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.95);
            z-index: 2147483647;
            display: none;
        }
        .ump-container {
            width: 100%;
            height: 100%;
            display: flex;
            flex-direction: column;
        }
        .ump-header {
            background: #1a1a1a;
            padding: 10px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            flex-wrap: wrap;
            gap: 10px;
        }
        .ump-title {
            color: #fff;
            font-size: 14px;
            flex: 1;
            min-width: 200px;
        }
        .ump-controls {
            display: flex;
            gap: 8px;
            flex-wrap: wrap;
        }
        .ump-btn {
            background: #ff6b6b;
            color: white;
            border: none;
            padding: 8px 12px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 12px;
            white-space: nowrap;
            transition: background 0.2s;
        }
        .ump-btn:hover {
            background: #ff5252;
        }
        .ump-btn:active {
            background: #ff3838;
        }
        .ump-btn-secondary {
            background: #4CAF50;
        }
        .ump-btn-secondary:hover {
            background: #45a049;
        }
        .ump-btn-secondary:active {
            background: #3d8b40;
        }
        .ump-video-wrapper {
            flex: 1;
            position: relative;
            background: #000;
        }
        .ump-video {
            width: 100%;
            height: 100%;
            object-fit: contain;
        }
        .ump-quality-menu {
            position: absolute;
            top: 60px;
            right: 10px;
            background: rgba(0,0,0,0.95);
            border-radius: 4px;
            padding: 10px;
            display: none;
            max-height: 300px;
            overflow-y: auto;
            border: 1px solid #444;
        }
        .ump-quality-menu.show {
            display: block;
        }
        .ump-quality-option {
            color: white;
            padding: 8px 15px;
            cursor: pointer;
            border-radius: 3px;
            margin: 3px 0;
            font-size: 13px;
        }
        .ump-quality-option:hover {
            background: rgba(255,255,255,0.2);
        }
        .ump-quality-option.active {
            background: #ff6b6b;
        }
        .ump-scan-btn {
            position: fixed;
            bottom: 20px;
            right: 20px;
            background: #ff6b6b;
            color: white;
            border: none;
            padding: 15px 20px;
            border-radius: 50px;
            cursor: pointer;
            font-weight: bold;
            box-shadow: 0 4px 12px rgba(255,107,107,0.4);
            z-index: 2147483646;
            font-size: 14px;
            transition: transform 0.2s;
        }
        .ump-scan-btn:hover {
            transform: scale(1.05);
        }
        .ump-scan-btn:active {
            transform: scale(0.95);
        }
        .ump-media-list {
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: #1a1a1a;
            border-radius: 8px;
            z-index: 2147483647;
            max-width: 90%;
            width: 600px;
            max-height: 80%;
            display: none;
            flex-direction: column;
            box-shadow: 0 8px 32px rgba(0,0,0,0.8);
        }
        .ump-media-list.show {
            display: flex;
        }
        .ump-list-header {
            background: #2a2a2a;
            padding: 15px 20px;
            border-radius: 8px 8px 0 0;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        .ump-list-title {
            color: #fff;
            font-size: 16px;
            font-weight: bold;
        }
        .ump-list-content {
            padding: 10px;
            overflow-y: auto;
            flex: 1;
        }
        .ump-media-item {
            background: #2a2a2a;
            padding: 12px;
            margin: 8px 0;
            border-radius: 6px;
            cursor: pointer;
            transition: all 0.2s;
            border: 2px solid transparent;
        }
        .ump-media-item:hover {
            background: #333;
            border-color: #ff6b6b;
            transform: translateX(5px);
        }
        .ump-media-item-title {
            color: #fff;
            font-size: 14px;
            font-weight: 500;
            margin-bottom: 5px;
            word-break: break-all;
        }
        .ump-media-item-info {
            color: #888;
            font-size: 12px;
            display: flex;
            gap: 10px;
            flex-wrap: wrap;
        }
        .ump-media-badge {
            background: #ff6b6b;
            color: white;
            padding: 2px 8px;
            border-radius: 3px;
            font-size: 11px;
        }
        .ump-media-badge.hls {
            background: #9c27b0;
        }
        .ump-media-badge.dash {
            background: #2196f3;
        }
        .ump-modal {
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: #1a1a1a;
            padding: 20px;
            border-radius: 8px;
            z-index: 2147483647;
            max-width: 90%;
            width: 500px;
            max-height: 80%;
            overflow-y: auto;
            display: none;
            box-shadow: 0 8px 32px rgba(0,0,0,0.8);
        }
        .ump-modal.show {
            display: block;
        }
        .ump-modal-content {
            color: white;
        }
        .ump-input {
            width: 100%;
            padding: 10px;
            margin: 10px 0;
            background: #2a2a2a;
            border: 1px solid #444;
            color: white;
            border-radius: 4px;
            font-family: monospace;
            font-size: 12px;
            box-sizing: border-box;
        }
        .ump-toast {
            position: fixed;
            bottom: 80px;
            right: 20px;
            background: #4CAF50;
            color: white;
            padding: 12px 20px;
            border-radius: 4px;
            z-index: 2147483647;
            display: none;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            animation: slideIn 0.3s ease;
        }
        @keyframes slideIn {
            from {
                transform: translateX(400px);
                opacity: 0;
            }
            to {
                transform: translateX(0);
                opacity: 1;
            }
        }
        .ump-backdrop {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.7);
            z-index: 2147483646;
            display: none;
        }
        .ump-backdrop.show {
            display: block;
        }
        @media (max-width: 768px) {
            .ump-header {
                padding: 8px;
            }
            .ump-btn {
                padding: 6px 10px;
                font-size: 11px;
            }
            .ump-title {
                font-size: 12px;
                min-width: 150px;
            }
            .ump-media-list {
                width: 95%;
            }
            .ump-modal {
                width: 95%;
            }
        }
    `;

    const styleSheet = document.createElement('style');
    styleSheet.textContent = styles;
    document.head.appendChild(styleSheet);

    class UniversalMediaPlayer {
        constructor() {
            this.mediaItems = [];
            this.currentVideo = null;
            this.networkRequests = [];
            this.adBlockPatterns = [
                /doubleclick\.net/i,
                /googlesyndication/i,
                /googleadservices/i,
                /ad[sv]?\..*\.com/i,
                /adservice/i,
                /pagead/i,
                /advertising/i,
                /analytics/i,
                /tracker/i,
                /telemetry/i
            ];
            this.init();
            this.interceptNetwork();
        }

        init() {
            this.createUI();
            this.setupScanButton();
        }

        interceptNetwork() {
            // Intercept XMLHttpRequest
            const originalOpen = XMLHttpRequest.prototype.open;
            const self = this;
            XMLHttpRequest.prototype.open = function(method, url) {
                if (self.isMediaLink(url) && !self.isAd(url)) {
                    self.networkRequests.push({
                        url: url,
                        type: self.getMediaType(url),
                        timestamp: Date.now()
                    });
                }
                return originalOpen.apply(this, arguments);
            };

            // Intercept Fetch
            const originalFetch = window.fetch;
            window.fetch = function(...args) {
                const url = typeof args[0] === 'string' ? args[0] : args[0].url;
                if (self.isMediaLink(url) && !self.isAd(url)) {
                    self.networkRequests.push({
                        url: url,
                        type: self.getMediaType(url),
                        timestamp: Date.now()
                    });
                }
                return originalFetch.apply(this, args);
            };
        }

        getMediaType(url) {
            if (/\.m3u8/i.test(url)) return 'HLS';
            if (/\.mpd/i.test(url)) return 'DASH';
            if (/\.mp4/i.test(url)) return 'MP4';
            if (/\.webm/i.test(url)) return 'WebM';
            if (/\.mkv/i.test(url)) return 'MKV';
            if (/\.ts$/i.test(url)) return 'TS';
            return 'Video';
        }

        createUI() {
            this.backdrop = document.createElement('div');
            this.backdrop.className = 'ump-backdrop';
            this.backdrop.onclick = () => this.closeAll();
            document.body.appendChild(this.backdrop);

            this.mediaList = document.createElement('div');
            this.mediaList.className = 'ump-media-list';
            this.mediaList.innerHTML = `
                <div class="ump-list-header">
                    <div class="ump-list-title">📹 Danh sách Media</div>
                    <button class="ump-btn" id="ump-close-list">✕</button>
                </div>
                <div class="ump-list-content" id="ump-list-items"></div>
            `;
            document.body.appendChild(this.mediaList);

            this.overlay = document.createElement('div');
            this.overlay.className = 'ump-overlay';
            this.overlay.innerHTML = `
                <div class="ump-container">
                    <div class="ump-header">
                        <div class="ump-title">Universal Media Player</div>
                        <div class="ump-controls">
                            <button class="ump-btn ump-btn-secondary" id="ump-back-list">📋 Danh sách</button>
                            <button class="ump-btn ump-btn-secondary" id="ump-quality">🎬 Chất lượng</button>
                            <button class="ump-btn ump-btn-secondary" id="ump-copy-link">📋 Copy Link</button>
                            <button class="ump-btn ump-btn-secondary" id="ump-download">⬇️ Download</button>
                            <button class="ump-btn ump-btn-secondary" id="ump-share">🔗 Chia sẻ</button>
                            <button class="ump-btn ump-btn-secondary" id="ump-ytdl">YT-DLP</button>
                            <button class="ump-btn ump-btn-secondary" id="ump-termux">Termux</button>
                            <button class="ump-btn" id="ump-close">✕ Đóng</button>
                        </div>
                    </div>
                    <div class="ump-video-wrapper">
                        <video class="ump-video" controls autoplay playsinline></video>
                        <div class="ump-quality-menu" id="ump-quality-menu"></div>
                    </div>
                </div>
            `;
            document.body.appendChild(this.overlay);

            this.toast = document.createElement('div');
            this.toast.className = 'ump-toast';
            document.body.appendChild(this.toast);

            this.modal = document.createElement('div');
            this.modal.className = 'ump-modal';
            this.modal.innerHTML = `
                <div class="ump-modal-content">
                    <h3 style="margin-top:0;">📝 Lệnh</h3>
                    <textarea class="ump-input" id="ump-command" readonly rows="6"></textarea>
                    <div style="display: flex; gap: 10px; margin-top: 10px;">
                        <button class="ump-btn ump-btn-secondary" id="ump-copy-command" style="flex: 1;">📋 Copy</button>
                        <button class="ump-btn" id="ump-close-modal" style="flex: 1;">✕ Đóng</button>
                    </div>
                </div>
            `;
            document.body.appendChild(this.modal);

            this.setupEventListeners();
        }

        setupScanButton() {
            const scanBtn = document.createElement('button');
            scanBtn.className = 'ump-scan-btn';
            scanBtn.innerHTML = '🎬 Scan Media';
            scanBtn.onclick = () => this.scanMedia();
            document.body.appendChild(scanBtn);
        }

        setupEventListeners() {
            document.getElementById('ump-close').onclick = () => this.closePlayer();
            document.getElementById('ump-close-list').onclick = () => this.closeMediaList();
            document.getElementById('ump-back-list').onclick = () => this.showMediaList();
            document.getElementById('ump-quality').onclick = () => this.toggleQualityMenu();
            document.getElementById('ump-copy-link').onclick = () => this.copyLink();
            document.getElementById('ump-download').onclick = () => this.downloadVideo();
            document.getElementById('ump-share').onclick = () => this.shareVideo();
            document.getElementById('ump-ytdl').onclick = () => this.showYtdlCommand();
            document.getElementById('ump-termux').onclick = () => this.showTermuxCommand();
            document.getElementById('ump-close-modal').onclick = () => this.closeModal();
            document.getElementById('ump-copy-command').onclick = () => this.copyCommand();
        }

        scanMedia() {
            this.mediaItems = [];
            this.showToast('🔍 Đang quét media...');

            // 1. Quét video elements
            document.querySelectorAll('video').forEach(video => {
                if (!this.isInIframe(video)) {
                    const src = video.src || video.currentSrc;
                    if (src && !this.isAd(src)) {
                        this.addMediaItem(src, 'video', video);
                    }
                    
                    // Quét source trong video
                    video.querySelectorAll('source').forEach(source => {
                        if (source.src && !this.isAd(source.src)) {
                            this.addMediaItem(source.src, 'video-source', video);
                        }
                    });
                }
            });

            // 2. Quét tất cả source elements
            document.querySelectorAll('source').forEach(source => {
                if (!this.isInIframe(source) && source.src && !this.isAd(source.src)) {
                    this.addMediaItem(source.src, 'source');
                }
            });

            // 3. Quét links
            document.querySelectorAll('a[href]').forEach(link => {
                const href = link.href;
                if (this.isMediaLink(href) && !this.isAd(href)) {
                    this.addMediaItem(href, 'link');
                }
            });

            // 4. Quét meta tags
            document.querySelectorAll('meta[property*="video"], meta[name*="video"], meta[property*="og:video"]').forEach(meta => {
                const content = meta.content;
                if (content && !this.isAd(content)) {
                    this.addMediaItem(content, 'meta');
                }
            });

            // 5. Quét blob URLs
            document.querySelectorAll('[src^="blob:"]').forEach(el => {
                if ((el.tagName === 'VIDEO' || el.tagName === 'SOURCE') && !this.isInIframe(el)) {
                    this.addMediaItem(el.src, 'blob', el);
                }
            });

            // 6. Quét network requests (HLS, DASH)
            this.networkRequests.forEach(req => {
                this.addMediaItem(req.url, 'network-' + req.type.toLowerCase());
            });

            // 7. Quét trong scripts và text content
            this.scanScripts();

            // 8. Quét data attributes
            document.querySelectorAll('[data-src], [data-video], [data-url]').forEach(el => {
                ['data-src', 'data-video', 'data-url'].forEach(attr => {
                    const url = el.getAttribute(attr);
                    if (url && this.isMediaLink(url) && !this.isAd(url)) {
                        this.addMediaItem(url, 'data-' + attr);
                    }
                });
            });

            setTimeout(() => {
                // Lọc và sắp xếp
                this.filterAndSortMedia();
                
                if (this.mediaItems.length > 0) {
                    this.showToast(`✅ Tìm thấy ${this.mediaItems.length} media`);
                    this.showMediaList();
                } else {
                    this.showToast('❌ Không tìm thấy media nào!');
                }
            }, 800);
        }

        scanScripts() {
            // Quét trong script tags
            document.querySelectorAll('script:not([src])').forEach(script => {
                const content = script.textContent;
                
                // Tìm m3u8
                const m3u8Matches = content.match(/https?:\/\/[^\s"']+\.m3u8[^\s"']*/gi);
                if (m3u8Matches) {
                    m3u8Matches.forEach(url => {
                        if (!this.isAd(url)) {
                            this.addMediaItem(url, 'script-hls');
                        }
                    });
                }
                
                // Tìm mpd
                const mpdMatches = content.match(/https?:\/\/[^\s"']+\.mpd[^\s"']*/gi);
                if (mpdMatches) {
                    mpdMatches.forEach(url => {
                        if (!this.isAd(url)) {
                            this.addMediaItem(url, 'script-dash');
                        }
                    });
                }
                
                // Tìm mp4, webm
                const videoMatches = content.match(/https?:\/\/[^\s"']+\.(mp4|webm|mkv|avi|mov)[^\s"']*/gi);
                if (videoMatches) {
                    videoMatches.forEach(url => {
                        if (!this.isAd(url)) {
                            this.addMediaItem(url, 'script-video');
                        }
                    });
                }
            });
        }

        filterAndSortMedia() {
            // Loại bỏ duplicates
            const seen = new Set();
            this.mediaItems = this.mediaItems.filter(item => {
                if (seen.has(item.url)) return false;
                seen.add(item.url);
                return true;
            });

            // Ưu tiên HLS/DASH, sau đó theo độ dài URL (URL ngắn thường là file thật)
            this.mediaItems.sort((a, b) => {
                // HLS/DASH lên đầu
                const aIsStreaming = a.mediaType === 'HLS' || a.mediaType === 'DASH';
                const bIsStreaming = b.mediaType === 'HLS' || b.mediaType === 'DASH';
                
                if (aIsStreaming && !bIsStreaming) return -1;
                if (!aIsStreaming && bIsStreaming) return 1;
                
                // URL từ network request ưu tiên hơn
                const aIsNetwork = a.type.startsWith('network');
                const bIsNetwork = b.type.startsWith('network');
                
                if (aIsNetwork && !bIsNetwork) return -1;
                if (!aIsNetwork && bIsNetwork) return 1;
                
                // URL dài hơn thường là file thật (có path đầy đủ)
                return b.url.length - a.url.length;
            });
        }

        addMediaItem(url, type, element = null) {
            if (!url || url === 'about:blank' || url.length < 10) return;
            
            // Loại bỏ URL thumbnail/poster
            if (/thumb|poster|preview|snapshot|image/i.test(url) && !/\.m3u8|\.mpd/i.test(url)) {
                return;
            }
            
            const existing = this.mediaItems.find(item => item.url === url);
            if (!existing) {
                const mediaType = this.getMediaType(url);
                this.mediaItems.push({
                    url: url,
                    type: type,
                    element: element,
                    mediaType: mediaType,
                    quality: this.guessQuality(url),
                    filename: this.getFileName(url)
                });
            }
        }

        showMediaList() {
            const listContent = document.getElementById('ump-list-items');
            listContent.innerHTML = '';

            if (this.mediaItems.length === 0) {
                listContent.innerHTML = '<div style="color: #888; text-align: center; padding: 40px;">Không có media nào</div>';
            } else {
                this.mediaItems.forEach((item, index) => {
                    const itemDiv = document.createElement('div');
                    itemDiv.className = 'ump-media-item';
                    
                    const badgeClass = item.mediaType === 'HLS' ? 'hls' : 
                                      item.mediaType === 'DASH' ? 'dash' : '';
                    
                    itemDiv.innerHTML = `
                        <div class="ump-media-item-title">${index + 1}. ${item.filename}</div>
                        <div class="ump-media-item-info">
                            <span class="ump-media-badge ${badgeClass}">${item.mediaType}</span>
                            <span class="ump-media-badge">${item.quality}</span>
                            <span class="ump-media-badge">${item.type}</span>
                        </div>
                    `;
                    itemDiv.onclick = () => {
                        this.playMedia(item);
                        this.closeMediaList();
                    };
                    listContent.appendChild(itemDiv);
                });
            }

            this.backdrop.classList.add('show');
            this.mediaList.classList.add('show');
        }

        closeMediaList() {
            this.backdrop.classList.remove('show');
            this.mediaList.classList.remove('show');
        }

        isInIframe(element) {
            try {
                return element.ownerDocument !== document;
            } catch (e) {
                return true;
            }
        }

        isAd(url) {
            if (!url) return false;
            return this.adBlockPatterns.some(pattern => pattern.test(url));
        }

        isMediaLink(url) {
            if (!url || typeof url !== 'string') return false;
            return /\.(mp4|webm|ogg|m3u8|mpd|mov|avi|mkv|flv|wmv|m4v|ts)(\?|#|$)/i.test(url) ||
                   /manifest|playlist|stream|video/i.test(url);
        }

        guessQuality(url) {
            const qualityMatch = url.match(/(\d{3,4})p/i);
            if (qualityMatch) return qualityMatch[1] + 'p';
            
            if (/4k|2160p|uhd/i.test(url)) return '4K';
            if (/1440p|2k|qhd/i.test(url)) return '2K';
            if (/1080p|fhd|fullhd/i.test(url)) return '1080p';
            if (/720p|hd/i.test(url)) return '720p';
            if (/480p|sd/i.test(url)) return '480p';
            if (/360p|low/i.test(url)) return '360p';
            if (/240p/i.test(url)) return '240p';
            if (/high/i.test(url)) return 'High';
            if (/medium/i.test(url)) return 'Medium';
            if (/low/i.test(url)) return 'Low';
            return 'Auto';
        }

        playMedia(mediaItem) {
            this.currentVideo = mediaItem;
            const video = this.overlay.querySelector('.ump-video');
            
            // Support HLS with hls.js
            if (mediaItem.mediaType === 'HLS' && !video.canPlayType('application/vnd.apple.mpegurl')) {
                this.loadHlsJs(mediaItem.url, video);
            } else {
                video.src = mediaItem.url;
            }
            
            this.overlay.style.display = 'block';
            this.backdrop.classList.add('show');
            
            this.loadQualityOptions();
            
            this.overlay.querySelector('.ump-title').textContent = 
                `▶️ ${mediaItem.filename} (${mediaItem.mediaType} - ${mediaItem.quality})`;
        }

        loadHlsJs(url, video) {
            // Check if hls.js is already loaded
            if (window.Hls) {
                this.initHls(url, video);
            } else {
                // Load hls.js from CDN
                const script = document.createElement('script');
                script.src = 'https://cdn.jsdelivr.net/npm/hls.js@latest';
                script.onload = () => {
                    this.initHls(url, video);
                };
                script.onerror = () => {
                    // Fallback to native playback
                    video.src = url;
                    this.showToast('⚠️ HLS.js failed, using native player');
                };
                document.head.appendChild(script);
            }
        }

        initHls(url, video) {
            if (Hls.isSupported()) {
                const hls = new Hls({
                    enableWorker: true,
                    lowLatencyMode: true,
                    backBufferLength: 90
                });
                hls.loadSource(url);
                hls.attachMedia(video);
                hls.on(Hls.Events.MANIFEST_PARSED, () => {
                    video.play();
                });
                hls.on(Hls.Events.ERROR, (event, data) => {
                    if (data.fatal) {
                        this.showToast('❌ HLS Error: ' + data.type);
                    }
                });
                this.currentHls = hls;
            } else {
                video.src = url;
            }
        }

        loadQualityOptions() {
            const qualityMenu = document.getElementById('ump-quality-menu');
            qualityMenu.innerHTML = '';
            
            const qualities = {};
            this.mediaItems.forEach(item => {
                const key = `${item.mediaType}-${item.quality}`;
                if (!qualities[key]) {
                    qualities[key] = [];
                }
                qualities[key].push(item);
            });

            const qualityOrder = { '4K': 6, '2K': 5, '1080p': 4, '720p': 3, '480p': 2, '360p': 1, '240p': 0 };
            const sortedQualities = Object.keys(qualities).sort((a, b) => {
                const aQ = a.split('-')[1];
                const bQ = b.split('-')[1];
                return (qualityOrder[bQ] || -1) - (qualityOrder[aQ] || -1);
            });

            sortedQualities.forEach(key => {
                const items = qualities[key];
                items.forEach((item, idx) => {
                    const option = document.createElement('div');
                    option.className = 'ump-quality-option';
                    const label = items.length > 1 ? 
                        `${item.mediaType} ${item.quality} #${idx + 1}` : 
                        `${item.mediaType} ${item.quality}`;
                    option.textContent = label;
                    if (item.url === this.currentVideo.url) {
                        option.classList.add('active');
                    }
                    option.onclick = () => {
                        this.playMedia(item);
                        qualityMenu.classList.remove('show');
                    };
                    qualityMenu.appendChild(option);
                });
            });

            if (sortedQualities.length === 0) {
                qualityMenu.innerHTML = '<div class="ump-quality-option" style="cursor: default;">Không có tùy chọn khác</div>';
            }
        }

        toggleQualityMenu() {
            document.getElementById('ump-quality-menu').classList.toggle('show');
        }

        copyLink() {
            this.copyToClipboard(this.currentVideo.url);
            this.showToast('✅ Đã copy link!');
        }

        downloadVideo() {
            if (this.currentVideo.mediaType === 'HLS' || this.currentVideo.mediaType === 'DASH') {
                this.showToast('ℹ️ Dùng YT-DLP hoặc Termux để tải');
                this.showYtdlCommand();
            } else {
                try {
                    const a = document.createElement('a');
                    a.href = this.currentVideo.url;
                    a.download = this.currentVideo.filename;
                    a.target = '_blank';
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    this.showToast('⬇️ Đang tải xuống...');
                } catch (e) {
                    this.showToast('❌ Không thể tải. Hãy copy link!');
                    this.copyLink();
                }
            }
        }

        shareVideo() {
            if (navigator.share) {
                navigator.share({
                    title: 'Video',
                    text: this.currentVideo.filename,
                    url: this.currentVideo.url
                }).then(() => {
                    this.showToast('✅ Đã chia sẻ!');
                }).catch(() => {
                    this.copyLink();
                });
            } else {
                this.copyLink();
            }
        }

        showYtdlCommand() {
            const isHLS = this.currentVideo.mediaType === 'HLS';
            const isDASH = this.currentVideo.mediaType === 'DASH';
            
            let commands = `# Tải video với yt-dlp\nyt-dlp "${this.currentVideo.url}" -o "${this.currentVideo.filename}"\n\n`;
            
            if (isHLS) {
                commands += `# Tải HLS stream (tốt nhất)\nyt-dlp -f best "${this.currentVideo.url}"\n\n`;
                commands += `# Tải với ffmpeg\nffmpeg -i "${this.currentVideo.url}" -c copy "${this.currentVideo.filename}"\n\n`;
            }
            
            if (isDASH) {
                commands += `# Tải DASH stream\nyt-dlp -f bestvideo+bestaudio "${this.currentVideo.url}"\n\n`;
            }
            
            commands += `# Với aria2c (nhanh hơn)\nyt-dlp --external-downloader aria2c --external-downloader-args "-x 16 -k 1M" "${this.currentVideo.url}"`;
            
            document.getElementById('ump-command').value = commands;
            this.modal.classList.add('show');
            this.backdrop.classList.add('show');
        }

        showTermuxCommand() {
            const filename = this.currentVideo.filename;
            const isHLS = this.currentVideo.mediaType === 'HLS';
            
            let commands = `# Cài đặt các tool cần thiết\npkg install wget curl aria2 ffmpeg python -y\npip install yt-dlp\n\n`;
            
            if (isHLS) {
                commands += `# Tải HLS với ffmpeg (khuyên dùng)\nffmpeg -i "${this.currentVideo.url}" -c copy "${filename}"\n\n`;
                commands += `# Hoặc dùng yt-dlp\nyt-dlp "${this.currentVideo.url}" -o "${filename}"\n\n`;
            } else {
                commands += `# Tải với wget\nwget "${this.currentVideo.url}" -O "${filename}"\n\n`;
                commands += `# Hoặc curl\ncurl -L "${this.currentVideo.url}" -o "${filename}"\n\n`;
                commands += `# Hoặc aria2 (nhanh nhất)\naria2c -x 16 -s 16 "${this.currentVideo.url}" -o "${filename}"\n\n`;
            }
            
            commands += `# Với yt-dlp (universal)\nyt-dlp "${this.currentVideo.url}"`;
            
            document.getElementById('ump-command').value = commands;
            this.modal.classList.add('show');
            this.backdrop.classList.add('show');
        }

        copyCommand() {
            const commandInput = document.getElementById('ump-command');
            this.copyToClipboard(commandInput.value);
            this.showToast('✅ Đã copy lệnh!');
        }

        closePlayer() {
            const video = this.overlay.querySelector('.ump-video');
            video.pause();
            video.src = '';
            
            if (this.currentHls) {
                this.currentHls.destroy();
                this.currentHls = null;
            }
            
            this.overlay.style.display = 'none';
            this.backdrop.classList.remove('show');
        }

        closeModal() {
            this.modal.classList.remove('show');
            if (!this.overlay.style.display || this.overlay.style.display === 'none') {
                this.backdrop.classList.remove('show');
            }
        }

        closeAll() {
            this.closePlayer();
            this.closeMediaList();
            this.closeModal();
            this.backdrop.classList.remove('show');
        }

        copyToClipboard(text) {
            if (navigator.clipboard && window.isSecureContext) {
                navigator.clipboard.writeText(text).catch(() => {
                    this.fallbackCopy(text);
                });
            } else {
                this.fallbackCopy(text);
            }
        }

        fallbackCopy(text) {
            const textarea = document.createElement('textarea');
            textarea.value = text;
            textarea.style.position = 'fixed';
            textarea.style.left = '-999999px';
            textarea.style.top = '-999999px';
            document.body.appendChild(textarea);
            textarea.focus();
            textarea.select();
            try {
                document.execCommand('copy');
            } catch (err) {
                console.error('Copy failed:', err);
            }
            document.body.removeChild(textarea);
        }

        showToast(message) {
            this.toast.textContent = message;
            this.toast.style.display = 'block';
            
            if (this.toastTimeout) {
                clearTimeout(this.toastTimeout);
            }
            
            this.toastTimeout = setTimeout(() => {
                this.toast.style.display = 'none';
            }, 3000);
        }

        getFileName(url) {
            try {
                const urlObj = new URL(url);
                let pathname = urlObj.pathname;
                let filename = pathname.split('/').pop();
                
                filename = filename.split('?')[0];
                
                if (!filename.match(/\.\w+$/)) {
                    const ext = this.currentVideo && this.currentVideo.mediaType === 'HLS' ? '.m3u8' :
                                this.currentVideo && this.currentVideo.mediaType === 'DASH' ? '.mpd' : '.mp4';
                    filename += ext;
                }
                
                if (filename.length < 5) {
                    const timestamp = new Date().getTime();
                    filename = `video_${timestamp}.mp4`;
                }
                
                return decodeURIComponent(filename);
            } catch (e) {
                return 'video_' + Date.now() + '.mp4';
            }
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            new UniversalMediaPlayer();
        });
    } else {
        new UniversalMediaPlayer();
    }
})();