
/**
 * Universal Media Player v3.1 - Video.js + Fallback HTML5
 * Tự động thử Video.js, nếu lỗi sẽ dùng video tag đơn giản
 */
(function() {
    'use strict';

    var old = document.getElementById('__ump__');
    if (old) old.remove();

    // ========== PAGE INFO ==========
    var pageInfo = {
        title: (document.title || 'video').replace(/[^\w\s\u00C0-\u1EF9]/g, '').substring(0, 60).trim() || 'video',
        url: location.href,
        host: location.hostname.replace(/^www\./, ''),
        referer: location.origin + '/'
    };

    // ========== FIND VIDEOS ==========
    var urls = new Map();
    var patterns = [
        { re: /https?:\/\/[^\s"'<>()\\]+\.m3u8[^\s"'<>()\\]*/gi, type: 'M3U8', priority: 1 },
        { re: /https?:\/\/[^\s"'<>()\\]+\.mpd[^\s"'<>()\\]*/gi, type: 'MPD', priority: 2 },
        { re: /https?:\/\/[^\s"'<>()\\]+\.mp4[^\s"'<>()\\]*/gi, type: 'MP4', priority: 3 },
        { re: /https?:\/\/[^\s"'<>()\\]+\.webm[^\s"'<>()\\]*/gi, type: 'WEBM', priority: 4 },
        { re: /https?:\/\/[^\s"'<>()\\]+\.mkv[^\s"'<>()\\]*/gi, type: 'MKV', priority: 5 }
    ];

    function findUrls(text, source) {
        if (!text || typeof text !== 'string') return;
        patterns.forEach(function(p) {
            var matches = text.match(p.re);
            if (matches) {
                matches.forEach(function(u) {
                    u = u.replace(/\\u002F/g, '/').replace(/\\\//g, '/').replace(/&amp;/g, '&').replace(/\\"/g, '');
                    if (!urls.has(u) || urls.get(u).priority > p.priority) {
                        urls.set(u, { type: p.type, source: source, priority: p.priority });
                    }
                });
            }
        });
    }

    function scan(doc, src) {
        try {
            doc.querySelectorAll('video, source, audio').forEach(function(v) {
                if (v.src) findUrls(v.src, src);
                if (v.currentSrc) findUrls(v.currentSrc, src);
            });
            doc.querySelectorAll('script').forEach(function(s) { findUrls(s.textContent, src); });
            findUrls(doc.documentElement.outerHTML, src);
            doc.querySelectorAll('iframe').forEach(function(i, idx) {
                if (i.src) urls.set(i.src, { type: 'IFRAME', source: 'iframe#' + idx, priority: 99 });
                try { if (i.contentDocument) scan(i.contentDocument, 'iframe#' + idx); } catch(e) {}
            });
        } catch(e) {}
    }

    scan(document, 'main');
    try {
        performance.getEntriesByType('resource').forEach(function(e) { findUrls(e.name, 'network'); });
    } catch(e) {}

    var arr = [...urls.entries()].map(function(e) {
        return { url: e[0], type: e[1].type, source: e[1].source, priority: e[1].priority };
    }).sort(function(a, b) { return a.priority - b.priority; });

    var playable = arr.filter(function(x) { return x.type !== 'IFRAME'; });

    if (playable.length === 0) {
        showFinderPanel(arr);
        return;
    }

    if (playable.length === 1) {
        openPlayer(playable[0]);
    } else {
        showQuickSelector(playable, arr);
    }

    // ========== QUICK SELECTOR ==========
    function showQuickSelector(playable, all) {
        var overlay = document.createElement('div');
        overlay.id = '__ump__';
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:2147483647;display:flex;align-items:center;justify-content:center;padding:15px;font-family:Arial;';
        var html = '<div style="background:#fff;border-radius:12px;padding:15px;max-width:450px;width:100%;color:#333;max-height:85vh;overflow-y:auto;box-shadow:0 10px 40px rgba(0,0,0,0.3);">';
        html += '<div style="text-align:center;margin-bottom:12px;"><h2 style="color:#4CAF50;margin:0;font-size:16px;">🎬 Chọn Stream (' + playable.length + ')</h2></div>';
        playable.forEach(function(item, i) {
            var typeColor = item.type === 'M3U8' ? '#4CAF50' : (item.type === 'MP4' ? '#FF9800' : '#2196F3');
            html += '<div style="background:#f5f5f5;padding:10px;margin-bottom:6px;border-radius:6px;border-left:3px solid ' + typeColor + ';">';
            html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:5px;">';
            html += '<span style="background:' + typeColor + ';color:#fff;padding:2px 8px;border-radius:3px;font-size:10px;font-weight:bold;">#' + (i+1) + ' ' + item.type + '</span>';
            html += '<span style="color:#999;font-size:9px;">' + item.source + '</span>';
            html += '</div>';
            html += '<div style="font-family:monospace;font-size:9px;color:#666;word-break:break-all;margin-bottom:6px;max-height:30px;overflow-y:auto;">' + item.url.substring(0, 80) + '</div>';
            html += '<button class="__ump_play__" data-idx="' + i + '" style="background:#4CAF50;color:#fff;border:0;padding:8px;border-radius:4px;font-weight:bold;width:100%;cursor:pointer;font-size:12px;">▶️ Play</button>';
            html += '</div>';
        });
        if (all.length > playable.length) {
            html += '<button id="__ump_show_all__" style="background:#999;color:#fff;border:0;padding:8px;border-radius:5px;font-weight:bold;width:100%;margin-top:8px;font-size:12px;">📋 Xem tất cả (' + all.length + ')</button>';
        }
        html += '<button id="__ump_close__" style="background:#f44336;color:#fff;border:0;padding:8px;border-radius:5px;font-weight:bold;width:100%;margin-top:8px;font-size:12px;">✕ Hủy</button>';
        html += '</div>';
        overlay.innerHTML = html;
        document.body.appendChild(overlay);
        overlay.querySelectorAll('.__ump_play__').forEach(function(b) {
            b.onclick = function() {
                var idx = parseInt(this.dataset.idx);
                overlay.remove();
                openPlayer(playable[idx]);
            };
        });
        document.getElementById('__ump_close__').onclick = function() { overlay.remove(); };
        var showAll = document.getElementById('__ump_show_all__');
        if (showAll) showAll.onclick = function() { overlay.remove(); showFinderPanel(all); };
    }

    // ========== FINDER PANEL ==========
    function showFinderPanel(arr) {
        var overlay = document.createElement('div');
        overlay.id = '__ump__';
        overlay.style.cssText = 'position:fixed;inset:0;background:#f5f5f5;z-index:2147483647;overflow-y:auto;padding:15px;color:#333;font-family:Arial;';
        var html = '<div style="text-align:center;margin-bottom:15px;"><h2 style="color:#4CAF50;margin:5px 0;">🎬 Media Finder (' + arr.length + ')</h2></div>';
        if (arr.length === 0) {
            html += '<div style="text-align:center;padding:40px;color:#666;background:#fff;border-radius:8px;">❌ Không tìm thấy media<br><small>Bấm Play video trước rồi chạy lại</small></div>';
        } else {
            arr.forEach(function(item, i) {
                var typeColor = item.type === 'IFRAME' ? '#2196F3' : '#4CAF50';
                html += '<div style="background:#fff;padding:10px;margin-bottom:6px;border-radius:6px;border-left:3px solid ' + typeColor + ';box-shadow:0 1px 3px rgba(0,0,0,0.1);">';
                html += '<div style="display:flex;justify-content:space-between;margin-bottom:5px;">';
                html += '<span style="background:' + typeColor + ';color:#fff;padding:2px 8px;border-radius:3px;font-size:10px;font-weight:bold;">#' + (i+1) + ' ' + item.type + '</span>';
                html += '</div>';
                html += '<div style="font-family:monospace;font-size:9px;color:#666;word-break:break-all;margin-bottom:6px;max-height:40px;overflow-y:auto;">' + item.url + '</div>';
                html += '<div style="display:flex;gap:4px;flex-wrap:wrap;">';
                if (item.type === 'IFRAME') {
                    html += '<a href="' + item.url + '" style="background:#2196F3;color:#fff;padding:6px 10px;border-radius:4px;font-size:10px;text-decoration:none;flex:1;text-align:center;font-weight:bold;">➡️ Vào</a>';
                } else {
                    html += '<button class="__ump_play_alt__" data-idx="' + i + '" style="background:#4CAF50;color:#fff;border:0;padding:6px 10px;border-radius:4px;font-size:10px;font-weight:bold;flex:1;">▶️ Play</button>';
                }
                html += '<button class="__ump_copy__" data-url="' + encodeURIComponent(item.url) + '" style="background:#607D8B;color:#fff;border:0;padding:6px 10px;border-radius:4px;font-size:10px;font-weight:bold;flex:1;">📋 Copy</button>';
                html += '</div></div>';
            });
        }
        html += '<button id="__ump_close__" style="background:#f44336;color:#fff;border:0;padding:12px;border-radius:5px;font-weight:bold;width:100%;margin-top:15px;">✕ Đóng</button>';
        overlay.innerHTML = html;
        document.body.appendChild(overlay);
        overlay.querySelectorAll('.__ump_play_alt__').forEach(function(b) {
            b.onclick = function() {
                var idx = parseInt(this.dataset.idx);
                overlay.remove();
                openPlayer(arr[idx]);
            };
        });
        overlay.querySelectorAll('.__ump_copy__').forEach(function(b) {
            b.onclick = function() {
                copy(decodeURIComponent(this.dataset.url));
                this.innerText = '✓';
            };
        });
        document.getElementById('__ump_close__').onclick = function() { overlay.remove(); };
    }

    // ========== PLAYER CHÍNH (thử Video.js, fallback HTML5) ==========
    function openPlayer(streamInfo) {
        // Tạo container
        var container = document.createElement('div');
        container.id = '__ump__';
        container.style.cssText = 'position:fixed;inset:0;background:#000;z-index:2147483647;display:flex;align-items:center;justify-content:center;';
        var videoEl = document.createElement('video');
        videoEl.id = '__ump_video__';
        videoEl.style.cssText = 'width:100%;height:100%;background:#000;';
        videoEl.setAttribute('controls', 'true');
        videoEl.setAttribute('autoplay', 'true');
        videoEl.setAttribute('playsinline', 'true');
        container.appendChild(videoEl);
        document.body.appendChild(container);

        // Thử tải Video.js, nếu fail thì dùng HTML5 trực tiếp
        tryLoadVideoJs(streamInfo, videoEl, container);
    }

    async function tryLoadVideoJs(streamInfo, videoEl, container) {
        var loaded = false;
        // Danh sách CDN dự phòng
        var cdnList = [
            { css: 'https://vjs.zencdn.net/8.6.1/video-js.css', js: 'https://vjs.zencdn.net/8.6.1/video.min.js' },
            { css: 'https://cdnjs.cloudflare.com/ajax/libs/video.js/8.6.1/video-js.min.css', js: 'https://cdnjs.cloudflare.com/ajax/libs/video.js/8.6.1/video.min.js' },
            { css: 'https://cdn.jsdelivr.net/npm/video.js@8.6.1/dist/video-js.min.css', js: 'https://cdn.jsdelivr.net/npm/video.js@8.6.1/dist/video.min.js' }
        ];

        // Hàm tải CSS và JS với timeout
        function loadWithTimeout(src, timeout) {
            return new Promise(function(resolve, reject) {
                var timer = setTimeout(function() { reject(new Error('Timeout')); }, timeout || 10000);
                var el = src.endsWith('.css') ? document.createElement('link') : document.createElement('script');
                el.rel = 'stylesheet';
                el.href = src;
                el.onload = function() { clearTimeout(timer); resolve(); };
                el.onerror = function() { clearTimeout(timer); reject(new Error('Load error')); };
                document.head.appendChild(el);
            });
        }

        // Thử từng CDN
        for (var i = 0; i < cdnList.length; i++) {
            try {
                await loadWithTimeout(cdnList[i].css, 8000);
                await loadWithTimeout(cdnList[i].js, 8000);
                // Tải plugin HLS (chỉ cần 1 lần)
                await loadWithTimeout('https://cdn.streamroot.io/videojs-hlsjs-plugin/1/stable/videojs-hlsjs-plugin.js', 8000);
                loaded = true;
                break;
            } catch (e) {
                console.warn('CDN thử #' + (i+1) + ' thất bại:', e);
            }
        }

        if (!loaded) {
            // Fallback: dùng HTML5 video
            console.warn('Không tải được Video.js, dùng HTML5 fallback');
            showToast('⚠️ Dùng chế độ video cơ bản (không hỗ trợ HLS/DASH)', '#FF9800');
            videoEl.src = streamInfo.url;
            // Nếu là HLS, thử chuyển hướng dùng hls.js (có thể thử tải thêm)
            if (streamInfo.type === 'M3U8') {
                // Thử tải hls.js nhẹ
                try {
                    await loadWithTimeout('https://cdn.jsdelivr.net/npm/hls.js@latest', 5000);
                    if (window.Hls && Hls.isSupported()) {
                        var hls = new Hls();
                        hls.loadSource(streamInfo.url);
                        hls.attachMedia(videoEl);
                        showToast('✅ Đang phát HLS với hls.js', '#4CAF50');
                    } else {
                        videoEl.src = streamInfo.url; // thử trực tiếp
                    }
                } catch(e) {
                    videoEl.src = streamInfo.url;
                }
            } else if (streamInfo.type === 'MPD') {
                // Thử dash.js
                try {
                    await loadWithTimeout('https://cdn.jsdelivr.net/npm/dashjs@latest', 5000);
                    if (window.dashjs) {
                        var player = dashjs.MediaPlayer().create();
                        player.initialize(videoEl, streamInfo.url, true);
                        showToast('✅ Đang phát DASH với dash.js', '#4CAF50');
                    }
                } catch(e) {
                    // Không làm gì thêm
                }
            } else {
                videoEl.src = streamInfo.url;
            }
            // Thêm nút đóng
            addCloseButton(container);
            return;
        }

        // Video.js đã tải thành công
        var player = videojs(videoEl, {
            autoplay: true,
            controls: true,
            fluid: true,
            responsive: true,
            html5: { hlsjsConfig: {} }
        });

        var type = 'video/mp4';
        if (streamInfo.type === 'M3U8') type = 'application/x-mpegURL';
        else if (streamInfo.type === 'MPD') {
            // Video.js không native DASH, nhưng ta có thể dùng dashjs plugin hoặc bỏ qua
            // Ở đây ta thử dùng dashjs fallback
            try {
                await loadWithTimeout('https://cdn.jsdelivr.net/npm/dashjs@latest', 5000);
                if (window.dashjs) {
                    // Hủy player videojs để dùng dashjs
                    player.dispose();
                    var dashPlayer = dashjs.MediaPlayer().create();
                    dashPlayer.initialize(videoEl, streamInfo.url, true);
                    showToast('✅ Phát DASH với dash.js', '#4CAF50');
                    addCloseButton(container);
                    return;
                }
            } catch(e) {
                // fallback
                player.src({ src: streamInfo.url, type: 'video/mp4' });
            }
        } else {
            player.src({ src: streamInfo.url, type: type });
        }

        // Xử lý lỗi player
        player.on('error', function() {
            console.error('Video.js error:', player.error());
            showToast('❌ Lỗi phát, thử fallback', '#f44336');
            // Thử HTML5 trực tiếp
            player.dispose();
            videoEl.src = streamInfo.url;
            videoEl.controls = true;
        });

        // Thêm nút đóng
        addCloseButton(container, function() { 
            if (player && player.dispose) player.dispose();
        });
    }

    // ========== NÚT ĐÓNG ==========
    function addCloseButton(container, onClose) {
        var closeBtn = document.createElement('button');
        closeBtn.innerText = '✕';
        closeBtn.style.cssText = 'position:absolute;top:10px;right:10px;z-index:10;background:rgba(0,0,0,0.6);color:#fff;border:2px solid #fff;border-radius:50%;width:36px;height:36px;font-size:18px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:0.3s;';
        closeBtn.onmouseover = function() { this.style.background = '#f44336'; };
        closeBtn.onmouseout = function() { this.style.background = 'rgba(0,0,0,0.6)'; };
        closeBtn.onclick = function() {
            if (onClose) onClose();
            container.remove();
        };
        container.appendChild(closeBtn);
    }

    // ========== UTILITY ==========
    function copy(text) {
        var t = document.createElement('textarea');
        t.value = text;
        document.body.appendChild(t);
        t.select();
        document.execCommand('copy');
        t.remove();
    }

    function showToast(msg, color) {
        var t = document.createElement('div');
        t.textContent = msg;
        t.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:' + (color || '#333') + ';color:#fff;padding:8px 15px;border-radius:15px;z-index:2147483649;font:bold 11px Arial;box-shadow:0 3px 12px rgba(0,0,0,0.5);';
        document.body.appendChild(t);
        setTimeout(function() { t.remove(); }, 4000);
    }

    console.log('🎬 UMP v3.1 - Video.js + Fallback HTML5');
})();
