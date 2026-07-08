// ==UserScript==
// @name         Universal Media Player
// @namespace    http://tampermonkey.net/
// @version      2.0
// @description  Quét và phát media với trình phát tối ưu
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
            z-index: 999999;
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
        }
        .ump-btn:active {
            background: #ff5252;
        }
        .ump-btn-secondary {
            background: #4CAF50;
        }
        .ump-btn-secondary:active {
            background: #45a049;
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
            background: rgba(0,0,0,0.9);
            border-radius: 4px;
            padding: 10px;
            display: none;
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
            box-shadow: 0 4px 6px rgba(0,0,0,0.3);
            z-index: 999998;
            font-size: 14px;
        }
        .ump-modal {
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: #1a1a1a;
            padding: 20px;
            border-radius: 8px;
            z-index: 1000000;
            max-width: 90%;
            max-height: 80%;
            overflow-y: auto;
            display: none;
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
        }
        .ump-toast {
            position: fixed;
            bottom: 80px;
            right: 20px;
            background: #4CAF50;
            color: white;
            padding: 12px 20px;
            border-radius: 4px;
            z-index: 1000001;
            display: none;
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
        }
    `;

    // Inject styles
    const styleSheet = document.createElement('style');
    styleSheet.textContent = styles;
    document.head.appendChild(styleSheet);

    class UniversalMediaPlayer {
        constructor() {
            this.mediaItems = [];
            this.currentVideo = null;
            this.qualities = [];
            this.adBlockPatterns = [
                /doubleclick\.net/i,
                /googlesyndication/i,
                /googleadservices/i,
                /ad\..*\.com/i,
                /ads\..*\.com/i,
                /adservice/i,
                /analytics/i
            ];
            this.init();
        }

        init() {
            this.createUI();
            this.setupScanButton();
        }

        createUI() {
            // Overlay player
            this.overlay = document.createElement('div');
            this.overlay.className = 'ump-overlay';
            this.overlay.innerHTML = `
                <div class="ump-container">
                    <div class="ump-header">
                        <div class="ump-title">Universal Media Player</div>
                        <div class="ump-controls">
                            <button class="ump-btn ump-btn-secondary" id="ump-quality">Chất lượng</button>
                            <button class="ump-btn ump-btn-secondary" id="ump-copy-link">Copy Link</button>
                            <button class="ump-btn ump-btn-secondary" id="ump-download">Download</button>
                            <button class="ump-btn ump-btn-secondary" id="ump-share">Chia sẻ</button>
                            <button class="ump-btn ump-btn-secondary" id="ump-ytdl">YT-DLP</button>
                            <button class="ump-btn ump-btn-secondary" id="ump-termux">Termux</button>
                            <button class="ump-btn" id="ump-close">Đóng</button>
                        </div>
                    </div>
                    <div class="ump-video-wrapper">
                        <video class="ump-video" controls autoplay playsinline></video>
                        <div class="ump-quality-menu" id="ump-quality-menu"></div>
                    </div>
                </div>
            `;
            document.body.appendChild(this.overlay);

            // Toast notification
            this.toast = document.createElement('div');
            this.toast.className = 'ump-toast';
            document.body.appendChild(this.toast);

            // Modal
            this.modal = document.createElement('div');
            this.modal.className = 'ump-modal';
            this.modal.innerHTML = `
                <div class="ump-modal-content">
                    <h3 style="margin-top:0;">Lệnh</h3>
                    <textarea class="ump-input" id="ump-command" readonly rows="4"></textarea>
                    <button class="ump-btn ump-btn-secondary" id="ump-copy-command">Copy</button>
                    <button class="ump-btn" id="ump-close-modal">Đóng</button>
                </div>
            `;
            document.body.appendChild(this.modal);

            this.setupEventListeners();
        }

        setupScanButton() {
            const scanBtn = document.createElement('button');
            scanBtn.className = 'ump-scan-btn';
            scanBtn.textContent = '🎬 Scan Media';
            scanBtn.onclick = () => this.scanMedia();
            document.body.appendChild(scanBtn);
        }

        setupEventListeners() {
            document.getElementById('ump-close').onclick = () => this.closePlayer();
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
            this.showToast('Đang quét media...');

            // Scan video elements
            document.querySelectorAll('video').forEach(video => {
                if (!this.isInIframe(video) && !this.isAd(video.src)) {
                    this.addMediaItem(video.src || video.currentSrc, 'video', video);
                }
            });

            // Scan source elements
            document.querySelectorAll('source').forEach(source => {
                if (!this.isInIframe(source) && !this.isAd(source.src)) {
                    this.addMediaItem(source.src, 'source');
                }
            });

            // Scan links
            document.querySelectorAll('a').forEach(link => {
                const href = link.href;
                if (this.isMediaLink(href) && !this.isAd(href)) {
                    this.addMediaItem(href, 'link');
                }
            });

            // Scan meta tags
            document.querySelectorAll('meta[property*="video"], meta[name*="video"]').forEach(meta => {
                const content = meta.content;
                if (content && !this.isAd(content)) {
                    this.addMediaItem(content, 'meta');
                }
            });

            // Detect HLS/DASH
            this.scanNetworkRequests();

            if (this.mediaItems.length > 0) {
                this.showToast(`Tìm thấy ${this.mediaItems.length} media`);
                this.playMedia(this.mediaItems[0]);
            } else {
                this.showToast('Không tìm thấy media nào!');
            }
        }

        addMediaItem(url, type, element = null) {
            if (!url || url === 'about:blank') return;
            
            const existing = this.mediaItems.find(item => item.url === url);
            if (!existing) {
                this.mediaItems.push({
                    url: url,
                    type: type,
                    element: element,
                    quality: this.guessQuality(url)
                });
            }
        }

        isInIframe(element) {
            return element.ownerDocument !== document;
        }

        isAd(url) {
            if (!url) return false;
            return this.adBlockPatterns.some(pattern => pattern.test(url));
        }

        isMediaLink(url) {
            return /\.(mp4|webm|ogg|m3u8|mpd|mov|avi|mkv)(\?|$)/i.test(url);
        }

        guessQuality(url) {
            const qualityMatch = url.match(/(\d{3,4})p/i);
            if (qualityMatch) return qualityMatch[1] + 'p';
            
            if (/hd|high/i.test(url)) return 'HD';
            if (/sd|low/i.test(url)) return 'SD';
            return 'Auto';
        }

        scanNetworkRequests() {
            // Hook fetch and XMLHttpRequest to detect media URLs
            const originalFetch = window.fetch;
            window.fetch = (...args) => {
                const url = args[0];
                if (typeof url === 'string' && this.isMediaLink(url) && !this.isAd(url)) {
                    this.addMediaItem(url, 'network');
                }
                return originalFetch.apply(window, args);
            };
        }

        playMedia(mediaItem) {
            this.currentVideo = mediaItem;
            const video = this.overlay.querySelector('.ump-video');
            video.src = mediaItem.url;
            
            this.overlay.style.display = 'block';
            
            // Load quality options
            this.loadQualityOptions();
            
            // Update title
            this.overlay.querySelector('.ump-title').textContent = 
                `Playing: ${this.getFileName(mediaItem.url)} (${mediaItem.quality})`;
        }

        loadQualityOptions() {
            const qualityMenu = document.getElementById('ump-quality-menu');
            qualityMenu.innerHTML = '';
            
            // Group by quality
            const qualities = {};
            this.mediaItems.forEach(item => {
                if (!qualities[item.quality]) {
                    qualities[item.quality] = item;
                }
            });

            Object.keys(qualities).forEach(quality => {
                const option = document.createElement('div');
                option.className = 'ump-quality-option';
                option.textContent = quality;
                if (qualities[quality].url === this.currentVideo.url) {
                    option.classList.add('active');
                }
                option.onclick = () => {
                    this.playMedia(qualities[quality]);
                    qualityMenu.classList.remove('show');
                };
                qualityMenu.appendChild(option);
            });
        }

        toggleQualityMenu() {
            document.getElementById('ump-quality-menu').classList.toggle('show');
        }

        copyLink() {
            this.copyToClipboard(this.currentVideo.url);
            this.showToast('Đã copy link!');
        }

        downloadVideo() {
            const a = document.createElement('a');
            a.href = this.currentVideo.url;
            a.download = this.getFileName(this.currentVideo.url);
            a.click();
            this.showToast('Đang tải xuống...');
        }

        shareVideo() {
            if (navigator.share) {
                navigator.share({
                    title: 'Video',
                    url: this.currentVideo.url
                }).catch(() => {
                    this.copyLink();
                });
            } else {
                this.copyLink();
            }
        }

        showYtdlCommand() {
            const command = `yt-dlp "${this.currentVideo.url}" -o "%(title)s.%(ext)s"`;
            document.getElementById('ump-command').value = command;
            this.modal.classList.add('show');
        }

        showTermuxCommand() {
            const filename = this.getFileName(this.currentVideo.url);
            const command = `pkg install wget -y && wget "${this.currentVideo.url}" -O "${filename}"`;
            document.getElementById('ump-command').value = command;
            this.modal.classList.add('show');
        }

        copyCommand() {
            const commandInput = document.getElementById('ump-command');
            this.copyToClipboard(commandInput.value);
            this.showToast('Đã copy lệnh!');
        }

        closePlayer() {
            const video = this.overlay.querySelector('.ump-video');
            video.pause();
            video.src = '';
            this.overlay.style.display = 'none';
        }

        closeModal() {
            this.modal.classList.remove('show');
        }

        copyToClipboard(text) {
            const textarea = document.createElement('textarea');
            textarea.value = text;
            textarea.style.position = 'fixed';
            textarea.style.opacity = '0';
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
        }

        showToast(message) {
            this.toast.textContent = message;
            this.toast.style.display = 'block';
            setTimeout(() => {
                this.toast.style.display = 'none';
            }, 3000);
        }

        getFileName(url) {
            const urlObj = new URL(url);
            const pathname = urlObj.pathname;
            return pathname.split('/').pop() || 'video.mp4';
        }
    }

    // Initialize
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            new UniversalMediaPlayer();
        });
    } else {
        new UniversalMediaPlayer();
    }
})();