/**
 * Universal Video Downloader
 * Version: 1.0
 * Author: You
 */
(function() {
    'use strict';
    
    // Xóa panel cũ nếu có
    var old = document.getElementById('__uvd__');
    if (old) old.remove();
    
    var urls = new Map();
    var pageInfo = {
        title: (document.title || 'video').replace(/[^\w\s\u00C0-\u1EF9]/g, '').substring(0, 60).trim() || 'video',
        url: location.href,
        referer: location.origin + '/',
        origin: location.origin,
        userAgent: navigator.userAgent
    };
    
    // ========== TÌM URL ==========
    var patterns = [
        { re: /https?:\/\/[^\s"'<>()\\]+\.m3u8[^\s"'<>()\\]*/gi, type: 'M3U8', priority: 1 },
        { re: /https?:\/\/[^\s"'<>()\\]+\.mpd[^\s"'<>()\\]*/gi, type: 'MPD', priority: 2 },
        { re: /https?:\/\/[^\s"'<>()\\]+\.mp4[^\s"'<>()\\]*/gi, type: 'MP4', priority: 3 },
        { re: /https?:\/\/[^\s"'<>()\\]+\.webm[^\s"'<>()\\]*/gi, type: 'WEBM', priority: 4 },
        { re: /https?:\/\/[^\s"'<>()\\]+\.mkv[^\s"'<>()\\]*/gi, type: 'MKV', priority: 5 },
        { re: /https?:\/\/[^\s"'<>()\\]+\.flv[^\s"'<>()\\]*/gi, type: 'FLV', priority: 6 },
        { re: /https?:\/\/[^\s"'<>()\\]+\.ts[^\s"'<>()\\]*/gi, type: 'TS', priority: 7 }
    ];
    
    function findUrls(text, source) {
        if (!text || typeof text !== 'string') return;
        patterns.forEach(function(p) {
            var matches = text.match(p.re);
            if (matches) {
                matches.forEach(function(u) {
                    u = u.replace(/\\u002F/g, '/').replace(/\\\//g, '/').replace(/&amp;/g, '&').replace(/\\"/g, '');
                    // Loại URL trùng, ưu tiên type nhỏ hơn
                    if (!urls.has(u) || urls.get(u).priority > p.priority) {
                        urls.set(u, { type: p.type, source: source, priority: p.priority });
                    }
                });
            }
        });
    }
    
    // ========== QUÉT ==========
    function scan(doc, src) {
        try {
            // Video/audio elements
            doc.querySelectorAll('video, source, audio').forEach(function(v) {
                if (v.src) findUrls(v.src, src + ':element');
                if (v.currentSrc) findUrls(v.currentSrc, src + ':current');
            });
            
            // Scripts
            doc.querySelectorAll('script').forEach(function(s) {
                findUrls(s.textContent, src + ':script');
            });
            
            // Full HTML
            findUrls(doc.documentElement.outerHTML, src + ':html');
            
            // Iframes
            doc.querySelectorAll('iframe').forEach(function(i, idx) {
                if (i.src) urls.set(i.src, { type: 'IFRAME', source: 'iframe#' + idx, priority: 99 });
                try {
                    if (i.contentDocument) scan(i.contentDocument, 'iframe#' + idx);
                } catch(e) {
                    // Cross-origin
                }
            });
        } catch(e) {
            console.error('Scan error:', e);
        }
    }
    
    scan(document, 'main');
    
    // Network entries
    try {
        performance.getEntriesByType('resource').forEach(function(e) {
            findUrls(e.name, 'network');
        });
    } catch(e) {}
    
    var arr = [...urls.entries()].map(function(e) {
        return { url: e[0], type: e[1].type, source: e[1].source, priority: e[1].priority };
    }).sort(function(a, b) { return a.priority - b.priority; });
    
    if (!arr.length) {
        alert('❌ Không tìm thấy video nào!\n\n💡 Thử:\n• Bấm Play video trước rồi chạy lại\n• Đợi vài giây cho video load\n• Vào thẳng iframe player');
        return;
    }
    
    // ========== HELPER: TẠO LỆNH ==========
    function makeCommands(url, type, title) {
        var t = title;
        var ext = type.toLowerCase() === 'iframe' ? 'mp4' : type.toLowerCase();
        var ref = pageInfo.referer;
        var origin = pageInfo.origin;
        
        return {
            'yt-dlp': 'yt-dlp --referer "' + ref + '" -o "' + t + '.%(ext)s" "' + url + '"',
            'yt-dlp-hq': 'yt-dlp --referer "' + ref + '" -f "bv*+ba/best" --merge-output-format mp4 -o "' + t + '.%(ext)s" "' + url + '"',
            'yt-dlp-aria': 'yt-dlp --referer "' + ref + '" --downloader aria2c --downloader-args "aria2c:-x 16 -s 16" -o "' + t + '.%(ext)s" "' + url + '"',
            'ffmpeg': 'ffmpeg -headers "Referer: ' + ref + '\\r\\nOrigin: ' + origin + '" -i "' + url + '" -c copy -bsf:a aac_adtstoasc "' + t + '.mp4"',
            'ffmpeg-audio': 'ffmpeg -headers "Referer: ' + ref + '" -i "' + url + '" -vn -c:a copy "' + t + '.aac"',
            'curl': 'curl -H "Referer: ' + ref + '" -o "' + t + '.' + ext + '" "' + url + '"',
            'aria2': 'aria2c --referer="' + ref + '" -x 16 -s 16 -o "' + t + '.' + ext + '" "' + url + '"',
            'wget': 'wget --referer="' + ref + '" -O "' + t + '.' + ext + '" "' + url + '"'
        };
    }
    
    // ========== UI PANEL ==========
    var panel = document.createElement('div');
    panel.id = '__uvd__';
    panel.style.cssText = 'position:fixed;top:5px;left:5px;right:5px;bottom:5px;background:#1a1a1a;color:#fff;padding:0;border-radius:12px;z-index:2147483647;font-family:-apple-system,Arial,sans-serif;font-size:13px;overflow:hidden;display:flex;flex-direction:column;box-shadow:0 0 40px rgba(0,0,0,0.95);border:2px solid #4CAF50;';
    
    // Header
    var header = document.createElement('div');
    header.style.cssText = 'background:linear-gradient(135deg,#4CAF50,#2E7D32);padding:12px 15px;display:flex;justify-content:space-between;align-items:center;box-shadow:0 2px 10px rgba(0,0,0,0.3);';
    header.innerHTML = '<div><b style="font-size:16px;">⬇️ Universal Downloader</b><div style="font-size:11px;opacity:0.9;margin-top:2px;">Tìm thấy ' + arr.length + ' stream</div></div><button id="__uvd_close__" style="background:rgba(0,0,0,0.3);color:#fff;border:0;padding:8px 14px;border-radius:6px;font-weight:bold;font-size:16px;cursor:pointer;">✕</button>';
    panel.appendChild(header);
    
    // Info bar
    var info = document.createElement('div');
    info.style.cssText = 'background:#252525;padding:10px 15px;border-bottom:1px solid #333;font-size:11px;';
    info.innerHTML = '<div style="color:#888;">📝 Tên file: <span id="__uvd_title__" style="color:#4CAF50;font-weight:bold;cursor:pointer;text-decoration:underline;">' + pageInfo.title + '</span> <span style="color:#666;">(bấm để sửa)</span></div><div style="color:#888;margin-top:4px;">🔗 Referer: <span style="color:#2196F3;font-family:monospace;font-size:10px;">' + pageInfo.referer + '</span></div>';
    panel.appendChild(info);
    
    // List
    var list = document.createElement('div');
    list.style.cssText = 'flex:1;overflow-y:auto;padding:10px 12px;';
    
    var typeColors = {
        'M3U8': '#4CAF50',
        'MPD': '#8BC34A',
        'MP4': '#FF9800',
        'WEBM': '#FF9800',
        'MKV': '#FF5722',
        'FLV': '#FF5722',
        'TS': '#FFC107',
        'IFRAME': '#2196F3'
    };
    
    arr.forEach(function(item, i) {
        var url = item.url;
        var type = item.type;
        var color = typeColors[type] || '#666';
        
        var card = document.createElement('div');
        card.style.cssText = 'background:#2a2a2a;padding:12px;margin:8px 0;border-radius:8px;border-left:4px solid ' + color + ';';
        
        var badge = '<div style="display:flex;justify-content:space-between;margin-bottom:8px;align-items:center;"><span style="background:' + color + ';color:#fff;padding:4px 12px;border-radius:4px;font-size:11px;font-weight:bold;">#' + (i + 1) + ' ' + type + '</span><span style="color:#666;font-size:10px;">' + item.source + '</span></div>';
        
        var urlBox = '<div style="word-break:break-all;font-size:11px;font-family:monospace;background:#111;padding:8px;margin-bottom:8px;border-radius:4px;max-height:70px;overflow-y:auto;color:#ddd;line-height:1.5;">' + url + '</div>';
        
        var buttons = '<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:5px;">';
        buttons += '<button class="__uvd_btn__" data-url="' + encodeURIComponent(url) + '" data-cmd="url" style="background:#4CAF50;color:#fff;border:0;padding:8px;border-radius:4px;font-size:11px;font-weight:bold;cursor:pointer;">📋 Copy URL</button>';
        
        if (type === 'IFRAME') {
            buttons += '<a href="' + url + '" style="background:#2196F3;color:#fff;padding:8px;border-radius:4px;font-size:11px;font-weight:bold;text-decoration:none;text-align:center;">➡️ Vào iframe</a>';
        } else {
            buttons += '<button class="__uvd_btn__" data-url="' + encodeURIComponent(url) + '" data-cmd="yt-dlp" data-type="' + type + '" style="background:#E91E63;color:#fff;border:0;padding:8px;border-radius:4px;font-size:11px;font-weight:bold;cursor:pointer;">🐍 yt-dlp</button>';
            buttons += '<button class="__uvd_btn__" data-url="' + encodeURIComponent(url) + '" data-cmd="ffmpeg" data-type="' + type + '" style="background:#9C27B0;color:#fff;border:0;padding:8px;border-radius:4px;font-size:11px;font-weight:bold;cursor:pointer;">🎬 FFmpeg</button>';
            buttons += '<button class="__uvd_btn__" data-url="' + encodeURIComponent(url) + '" data-cmd="more" data-type="' + type + '" style="background:#607D8B;color:#fff;border:0;padding:8px;border-radius:4px;font-size:11px;font-weight:bold;cursor:pointer;">⚙️ More...</button>';
        }
        buttons += '</div>';
        
        card.innerHTML = badge + urlBox + buttons;
        list.appendChild(card);
    });
    
    panel.appendChild(list);
    document.body.appendChild(panel);
    
    // ========== HANDLERS ==========
    function copy(text) {
        var t = document.createElement('textarea');
        t.value = text;
        document.body.appendChild(t);
        t.select();
        document.execCommand('copy');
        t.remove();
    }
    
    function showEditor(text, title) {
        var overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.95);z-index:2147483648;padding:15px;display:flex;flex-direction:column;gap:10px;';
        overlay.innerHTML = 
            '<div style="color:#4CAF50;font:bold 15px Arial;">✏️ ' + title + '</div>' +
            '<div style="color:#888;font-size:11px;">Sửa lệnh trước khi copy (đổi tên file, thêm option...)</div>' +
            '<textarea id="__uvd_edit__" style="flex:1;background:#111;color:#fff;border:2px solid #4CAF50;border-radius:6px;padding:12px;font:12px monospace;resize:none;line-height:1.5;">' + text.replace(/</g, '&lt;') + '</textarea>' +
            '<div style="display:flex;gap:8px;">' +
                '<button id="__uvd_ok__" style="background:#4CAF50;color:#fff;border:0;padding:14px;border-radius:6px;font:bold 15px Arial;flex:1;">✓ Copy</button>' +
                '<button id="__uvd_cancel__" style="background:#f44336;color:#fff;border:0;padding:14px;border-radius:6px;font:bold 15px Arial;flex:1;">✕ Hủy</button>' +
            '</div>';
        document.body.appendChild(overlay);
        
        var textarea = document.getElementById('__uvd_edit__');
        textarea.focus();
        
        document.getElementById('__uvd_ok__').onclick = function() {
            copy(textarea.value);
            overlay.remove();
        };
        document.getElementById('__uvd_cancel__').onclick = function() {
            overlay.remove();
        };
    }
    
    function showMoreOptions(url, type) {
        var cmds = makeCommands(url, type, pageInfo.title);
        var overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.95);z-index:2147483648;padding:15px;overflow-y:auto;';
        var html = '<div style="color:#4CAF50;font:bold 15px Arial;margin-bottom:15px;">⚙️ Chọn lệnh tải</div>';
        
        var labels = {
            'yt-dlp': '🐍 yt-dlp (cơ bản)',
            'yt-dlp-hq': '🐍 yt-dlp (chất lượng cao)',
            'yt-dlp-aria': '🐍 yt-dlp + aria2 (nhanh nhất)',
            'ffmpeg': '🎬 FFmpeg (M3U8 → MP4)',
            'ffmpeg-audio': '🎵 FFmpeg (chỉ audio)',
            'curl': '🌐 cURL',
            'aria2': '⚡ aria2c',
            'wget': '📥 wget'
        };
        
        Object.keys(cmds).forEach(function(key) {
            html += '<div style="background:#2a2a2a;padding:12px;margin-bottom:10px;border-radius:8px;">';
            html += '<div style="color:#FF9800;font-weight:bold;margin-bottom:6px;">' + labels[key] + '</div>';
            html += '<div style="background:#111;padding:8px;border-radius:4px;font-family:monospace;font-size:10px;color:#ddd;word-break:break-all;margin-bottom:8px;max-height:80px;overflow-y:auto;">' + cmds[key] + '</div>';
            html += '<button class="__uvd_cmdbtn__" data-cmd="' + encodeURIComponent(cmds[key]) + '" data-label="' + labels[key] + '" style="background:#4CAF50;color:#fff;border:0;padding:8px 16px;border-radius:4px;font-weight:bold;width:100%;">📋 Chọn lệnh này</button>';
            html += '</div>';
        });
        
        html += '<button id="__uvd_more_close__" style="background:#f44336;color:#fff;border:0;padding:12px;border-radius:6px;font:bold 14px Arial;width:100%;margin-top:10px;">✕ Đóng</button>';
        overlay.innerHTML = html;
        document.body.appendChild(overlay);
        
        document.querySelectorAll('.__uvd_cmdbtn__').forEach(function(b) {
            b.onclick = function() {
                var cmd = decodeURIComponent(this.dataset.cmd);
                var label = this.dataset.label;
                overlay.remove();
                showEditor(cmd, label);
            };
        });
        
        document.getElementById('__uvd_more_close__').onclick = function() {
            overlay.remove();
        };
    }
    
    // Bind events
    document.getElementById('__uvd_close__').onclick = function() {
        panel.remove();
    };
    
    document.getElementById('__uvd_title__').onclick = function() {
        var newTitle = prompt('Nhập tên file mới:', pageInfo.title);
        if (newTitle) {
            pageInfo.title = newTitle.replace(/[^\w\s\u00C0-\u1EF9.-]/g, '').substring(0, 100);
            this.innerText = pageInfo.title;
        }
    };
    
    document.querySelectorAll('.__uvd_btn__').forEach(function(btn) {
        btn.onclick = function() {
            var url = decodeURIComponent(this.dataset.url);
            var cmdType = this.dataset.cmd;
            var vType = this.dataset.type;
            
            if (cmdType === 'url') {
                showEditor(url, '📋 URL Stream');
            } else if (cmdType === 'more') {
                showMoreOptions(url, vType);
            } else {
                var cmds = makeCommands(url, vType, pageInfo.title);
                var label = cmdType === 'yt-dlp' ? '🐍 yt-dlp' : '🎬 FFmpeg';
                showEditor(cmds[cmdType], label);
            }
        };
    });
    
    console.log('✅ Universal Downloader loaded! Found', arr.length, 'streams');
})();
