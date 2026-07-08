// ==UserScript==
// @name         Universal Media Player
// @namespace    http://tampermonkey.net/
// @version      2.1
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
            this.qualities = [];
            this.adBlockPatterns = [
                /doubleclick\.net/i,
                /googlesyndication/i,
                /googleadservices/i,
                /ad\..*\.com/i,
                /ads\..*\.com/i,
                /adservice/i,
                /pagead/i,
                /advertising/i
            ];
            this.init();
        }

        init() {
            this.createUI();
            this.setupScanButton();
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

            document.querySelectorAll('video').forEach(video => {
                if (!this.isInIframe(video) && !this.isAd(video.src)) {
                    const src = video.src || video.currentSrc;
                    if (src) {
                        this.addMediaItem(src, 'video', video);
                    }
                    video.querySelectorAll('source').forEach(source => {
                        if (!this.isAd(source.src)) {
                            this.addMediaItem(source.src, 'video-source', video);
                        }
                    });
                }
            });

            document.querySelectorAll('source').forEach(source => {
                if (!this.isInIframe(source) && !this.isAd(source.src)) {
                    this.addMediaItem(source.src, 'source');
                }
            });

            document.querySelectorAll('a').forEach(link => {
                const href = link.href;
                if (this.isMediaLink(href) && !this.isAd(href)) {
                    this.addMediaItem(href, 'link');
                }
            });

            document.querySelectorAll('meta[property*="video"], meta[name*="video"], meta[property*="og:video"]').forEach(meta => {
                const content = meta.content;
                if (content && !this.isAd(content)) {
                    this.addMediaItem(content, 'meta');
                }
            });

            document.querySelectorAll('[src^="blob:"]').forEach(el => {
                if (el.tagName === 'VIDEO' && !this.isInIframe(el)) {
                    this.addMediaItem(el.src, 'blob', el);
                }
            });

            setTimeout(() => {
                if (this.mediaItems.length > 0) {
                    this.showToast(`✅ Tìm thấy ${this.mediaItems.length} media`);
                    this.showMediaList();
                } else {
                    this.showToast('❌ Không tìm thấy media nào!');
                }
            }, 500);
        }

        addMediaItem(url, type, element = null) {
            if (!url || url === 'about:blank' || url.length < 10) return;
            
            const existing = this.mediaItems.find(item => item.url === url);
            if (!existing) {
                this.mediaItems.push({
                    url: url,
                    type: type,
                    element: element,
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
                    itemDiv.innerHTML = `
                        <div class="ump-media-item-title">${index + 1}. ${item.filename}</div>
                        <div class="ump-media-item-info">
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
            return /\.(mp4|webm|ogg|m3u8|mpd|mov|avi|mkv|flv|wmv|m4v)(\?|#|$)/i.test(url);
        }

        guessQuality(url) {
            const qualityMatch = url.match(/(\d{3,4})p/i);
            if (qualityMatch) return qualityMatch[1] + 'p';
            
            if (/4k|2160p/i.test(url)) return '4K';
            if (/1440p|2k/i.test(url)) return '2K';
            if (/1080p|fhd|fullhd/i.test(url)) return '1080p';
            if (/720p|hd/i.test(url)) return '720p';
            if (/480p|sd/i.test(url)) return '480p';
            if (/360p|low/i.test(url)) return '360p';
            if (/high/i.test(url)) return 'HD';
            if (/medium/i.test(url)) return 'SD';
            return 'Auto';
        }

        playMedia(mediaItem) {
            this.currentVideo = mediaItem;
            const video = this.overlay.querySelector('.ump-video');
            video.src = mediaItem.url;
            
            this.overlay.style.display = 'block';
            this.backdrop.classList.add('show');
            
            this.loadQualityOptions();
            
            this.overlay.querySelector('.ump-title').textContent = 
                `▶️ ${mediaItem.filename} (${mediaItem.quality})`;
        }

        loadQualityOptions() {
            const qualityMenu = document.getElementById('ump-quality-menu');
            qualityMenu.innerHTML = '';
            
            const qualities = {};
            this.mediaItems.forEach(item => {
                const key = item.quality;
                if (!qualities[key]) {
                    qualities[key] = [];
                }
                qualities[key].push(item);
            });

            const qualityOrder = { '4K': 5, '2K': 4, '1080p': 3, '720p': 2, '480p': 1, '360p': 0 };
            const sortedQualities = Object.keys(qualities).sort((a, b) => {
                return (qualityOrder[b] || -1) - (qualityOrder[a] || -1);
            });

            sortedQualities.forEach(quality => {
                const items = qualities[quality];
                items.forEach((item, idx) => {
                    const option = document.createElement('div');
                    option.className = 'ump-quality-option';
                    const label = items.length > 1 ? `${quality} #${idx + 1}` : quality;
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
            const commands = `# Tải video với yt-dlp
yt-dlp "${this.currentVideo.url}" -o "${this.currentVideo.filename}"

# Với chất lượng tốt nhất
yt-dlp -f best "${this.currentVideo.url}"

# Chỉ tải audio
yt-dlp -x --audio-format mp3 "${this.currentVideo.url}"

# Với aria2c (tải nhanh hơn)
yt-dlp --external-downloader aria2c "${this.currentVideo.url}"`;
            
            document.getElementById('ump-command').value = commands;
            this.modal.classList.add('show');
            this.backdrop.classList.add('show');
        }

        showTermuxCommand() {
            const filename = this.currentVideo.filename;
            const commands = `# Cài đặt wget (nếu chưa có)
pkg install wget -y

# Tải video
wget "${this.currentVideo.url}" -O "${filename}"

# Hoặc dùng curl
pkg install curl -y
curl -L "${this.currentVideo.url}" -o "${filename}"

# Hoặc dùng aria2 (nhanh hơn)
pkg install aria2 -y
aria2c -x 16 "${this.currentVideo.url}" -o "${filename}"

# Tải với yt-dlp (nếu đã cài)
pkg install python ffmpeg -y
pip install yt-dlp
yt-dlp "${this.currentVideo.url}"`;
            
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
                    filename += '.mp4';
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