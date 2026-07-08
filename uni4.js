1) - (order[a] || -1);
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
            // Modern approach
            if (navigator.clipboard && window.isSecureContext) {
                navigator.clipboard.writeText(text).then(() => {
                    // Success
                }).catch(() => {
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
            
            // Clear existing timeout
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
                
                // Remove query params from filename
                filename = filename.split('?')[0];
                
                // If no extension, add .mp4
                if (!filename.match(/\.\w+$/)) {
                    filename += '.mp4';
                }
                
                // If filename is too short, generate one
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

    // Initialize
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            new UniversalMediaPlayer();
        });
    } else {
        new UniversalMediaPlayer();
    }
})();