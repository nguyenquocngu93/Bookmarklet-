// ==UserScript==
// @name         Universal Media Player v21.1 - TorrServer Fixed
// @namespace    http://tampermonkey.net/
// @version      21.1
// @description  Media Player + TorrServer + Magnet detection + Smart Download
// @author       You
// @match        *://*/*
// @grant        none
// @run-at       document-start
// ==/UserScript==

(function () {
    'use strict';

    // ══════════════════════════════════════════
    // STORAGE
    // ══════════════════════════════════════════
    const STORAGE_KEY   = 'ump_history';
    const PREFS_KEY     = 'ump_prefs';
    const TORR_KEY      = 'ump_torrserver_url';

    function loadSet(key) {
        try { return new Set(JSON.parse(localStorage.getItem(key) || '[]')); }
        catch(e) { return new Set(); }
    }
    function saveSet(key, set) {
        localStorage.setItem(key, JSON.stringify([...set]));
    }
    function loadStr(key, def) {
        try { return localStorage.getItem(key) || def; } catch(e) { return def; }
    }
    function saveStr(key, val) {
        localStorage.setItem(key, val);
    }

    let history = loadSet(STORAGE_KEY);
    let torrServerUrl = loadStr(TORR_KEY, 'http://127.0.0.1:8090');

    // ══════════════════════════════════════════
    // MEDIA DETECTION
    // ══════════════════════════════════════════
    const urls = new Map();
    const magnets = new Map();
    
    // Thêm detection cho TorrServer stream URLs
    const TORRSERVER_STREAM_RE = /https?:\/\/[^\s"'<>()]+\/stream\/[^\s"'<>()]+\.(mp4|mkv|avi|ts|webm)(\?link=[a-fA-F0-9]+(&index=\d+)?(&play)?)?/gi;

    const patterns = [
        { re: /https?:\/\/[^\s"'<>()\\\]]+\.m3u8[^\s"'<>()\\\]]*/gi, type: 'M3U8', priority: 1 },
        { re: /https?:\/\/[^\s"'<>()\\\]]+\.mpd[^\s"'<>()\\\]]*/gi,  type: 'MPD',  priority: 2 },
        { re: /https?:\/\/[^\s"'<>()\\\]]+\.mp4[^\s"'<>()\\\]]*/gi,  type: 'MP4',  priority: 3 },
        { re: /https?:\/\/[^\s"'<>()\\\]]+\.webm[^\s"'<>()\\\]]*/gi, type: 'WEBM', priority: 4 },
        { re: /https?:\/\/[^\s"'<>()\\\]]+\.mkv[^\s"'<>()\\\]]*/gi,  type: 'MKV',  priority: 5 },
        { re: /https?:\/\/[^\s"'<>()\\\]]+\.flv[^\s"'<>()\\\]]*/gi,  type: 'FLV',  priority: 6 },
        { re: /https?:\/\/[^\s"'<>()\\\]]+\.mov[^\s"'<>()\\\]]*/gi,  type: 'MOV',  priority: 7 },
        { re: /https?:\/\/[^\s"'<>()\\\]]+\.ts[^\s"'<>()\\\]]*/gi,   type: 'TS',   priority: 8 },
        { re: /https?:\/\/[^\s"'<>()\\\]]+\.m4s[^\s"'<>()\\\]]*/gi,  type: 'M4S',  priority: 9 },
        // Thêm pattern cho TorrServer stream
        { re: TORRSERVER_STREAM_RE, type: 'TORRSERVER', priority: 0.5 },
    ];

    // Magnet & Torrent patterns
    const MAGNET_RE = /magnet:\?xt=urn:btih:[a-fA-F0-9]{32,40}[^\s"'<>)\]]*/gi;
    const TORRENT_RE = /https?:\/\/[^\s"'<>()\\\]]+\.torrent[^\s"'<>()\\\]]*/gi;

    const IFRAME_PLAYER_RE = [
        /https?:\/\/[^\s"'<>]+\/(v|embed|e|vv|jm|t|watch|player)\/[a-zA-Z0-9_\-]{6,}/gi,
        /https?:\/\/(?:videplay|streamvid|surrit|doodstream|mixdrop|fembed|filemoon|voe)[^\s"'<>]*/gi,
    ];

    const REF = location.href;
    const UA  = 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36';

    function cleanUrl(u) {
        return u.replace(/\\u002F/gi,'/').replace(/\\\//g,'/')
                .replace(/&amp;/g,'&').replace(/\\"/g,'')
                .replace(/["')\]>\s]+$/,'').trim();
    }

    function addUrl(u, type, source, priority) {
        u = cleanUrl(u);
        if (!u.startsWith('http')) return;
        if (!urls.has(u) || urls.get(u).priority > priority) {
            urls.set(u, { url: u, type, source, priority, ts: Date.now() });
            history.add(u);
            if (history.size > 100) {
                const arr = [...history];
                history = new Set(arr.slice(-100));
            }
            saveSet(STORAGE_KEY, history);
            updateBadge();
        }
    }

    function addMagnet(magnet, source) {
        const hashMatch = magnet.match(/btih:([a-fA-F0-9]{32,40})/i);
        if (!hashMatch) return;
        const hash = hashMatch[1].toLowerCase();

        if (!magnets.has(hash)) {
            magnets.set(hash, { magnet, hash, source, ts: Date.now() });
            updateBadge();
        }
    }

    // Thêm function để parse TorrServer URL và extract info
    function parseTorrServerUrl(url) {
        try {
            const u = new URL(url);
            const pathParts = u.pathname.split('/').filter(Boolean);
            const filename = decodeURIComponent(pathParts[pathParts.length - 1] || 'Unknown');
            const link = u.searchParams.get('link') || '';
            const index = u.searchParams.get('index') || '0';
            
            return {
                filename,
                link,
                index,
                isTorrServerStream: true,
                baseUrl: `${u.protocol}//${u.host}`,
                port: u.port
            };
        } catch(e) {
            return null;
        }
    }

    function findUrls(text, source) {
        if (!text || typeof text !== 'string') return;

        // Media patterns
        patterns.forEach(p => {
            const m = text.match(p.re);
            if (m) m.forEach(u => addUrl(u, p.type, source, p.priority));
        });

        // Magnet links
        const magMatches = text.match(MAGNET_RE);
        if (magMatches) magMatches.forEach(m => addMagnet(m, source));

        // Torrent files
        const torMatches = text.match(TORRENT_RE);
        if (torMatches) torMatches.forEach(u => addUrl(u, 'TORRENT', source, 10));

        // Iframe patterns
        IFRAME_PLAYER_RE.forEach(re => {
            const m = text.match(re);
            if (m) m.forEach(u => {
                u = cleanUrl(u);
                addUrl(u, 'IFRAME', source, 99);
            });
        });
    }

    function scan(doc, src) {
        try {
            if (!doc) return;
            doc.querySelectorAll('video,source,audio').forEach(v => {
                if (v.src) findUrls(v.src, src+':el');
                if (v.currentSrc) findUrls(v.currentSrc, src+':cur');
            });
            doc.querySelectorAll('iframe').forEach((f,i) => {
                if (f.src) {
                    // Phát hiện TorrServer stream trong iframe
                    if (/\/stream\//.test(f.src)) {
                        addUrl(f.src, 'TORRSERVER', src+':if', 0.5);
                    } else {
                        addUrl(f.src, 'IFRAME', src+':if', 99);
                    }
                }
                try { if (f.contentDocument) scan(f.contentDocument, src+':if'+i); } catch(e) {}
            });
            doc.querySelectorAll('a[href]').forEach(a => {
                const href = a.href || '';
                if (href.startsWith('magnet:')) addMagnet(href, src+':link');
                else if (/\.torrent$/i.test(href)) addUrl(href, 'TORRENT', src+':link', 10);
                else if (/\/stream\//.test(href)) addUrl(href, 'TORRSERVER', src+':link', 0.5);
            });
            doc.querySelectorAll('script:not([src])').forEach(s => findUrls(s.textContent, src+':js'));
            findUrls(doc.documentElement.outerHTML, src+':html');
        } catch(e) {}
    }

    // Hook fetch & XHR
    const _fetch   = window.fetch;
    const _xhrOpen = XMLHttpRequest.prototype.open;

    window.fetch = function(...a) {
        try {
            const u = typeof a[0]==='string' ? a[0] : (a[0]&&a[0].url)||'';
            if (u) findUrls(u, 'fetch');
        } catch(e) {}
        return _fetch.apply(this, a);
    };

    XMLHttpRequest.prototype.open = function(m, u) {
        try { if (u) findUrls(String(u), 'xhr'); } catch(e) {}
        return _xhrOpen.apply(this, arguments);
    };

    function scanPerf() {
        try {
            performance.getEntriesByType('resource').forEach(e => {
                const name = e.name;
                if (/\.torrent$/i.test(name)) addUrl(name, 'TORRENT', 'perf', 10);
                else if (name.startsWith('magnet:')) addMagnet(name, 'perf');
                else if (/\/stream\//.test(name)) addUrl(name, 'TORRSERVER', 'perf', 0.5);
                else if (!isNonMedia(name)) findUrls(name, 'perf');
            });
        } catch(e) {}
    }

    function isNonMedia(url) {
        if (!url) return false;
        return /\.(js|css|woff|ttf|png|jpg|gif|svg|ico|webp)(\?|$)/i.test(url);
    }

    let updateBadge = () => {};

    // ══════════════════════════════════════════
    // TORRSERVER HELPERS - FIXED
    // ══════════════════════════════════════════
    
    /**
     * Tạo URL stream cho TorrServer
     * Hỗ trợ 3 loại input:
     * 1. Magnet link → /stream/magnet:?xt=urn:btih:...
     * 2. Torrent hash → /stream/{hash}
     * 3. TorrServer internal URL (có link=) → giữ nguyên
     */
    function getTorrStreamUrl(source) {
        const base = torrServerUrl.replace(/\/$/, '');
        
        // Nếu đã là TorrServer URL (có link= parameter) → giữ nguyên
        if (/link=[a-fA-F0-9]+/.test(source)) {
            return source;
        }
        
        // Nếu là magnet link
        if (source.startsWith('magnet:')) {
            // Extract hash từ magnet
            const hashMatch = source.match(/btih:([a-fA-F0-9]{32,40})/i);
            if (hashMatch) {
                const hash = hashMatch[1];
                return `${base}/stream/magnet:?xt=urn:btih:${hash}`;
            }
            return `${base}/stream/${encodeURIComponent(source)}`;
        }
        
        // Nếu là torrent file URL
        if (/\.torrent$/i.test(source)) {
            return `${base}/stream/${encodeURIComponent(source)}`;
        }
        
        // Mặc định: encode toàn bộ source
        return `${base}/stream/${encodeURIComponent(source)}`;
    }

    /**
     * Tạo URL play cho TorrServer (dùng để embed)
     */
    function getTorrPlayUrl(source) {
        const base = torrServerUrl.replace(/\/$/, '');
        return getTorrStreamUrl(source).replace('/stream/', '/play/');
    }

    /**
     * Build TorrServer URL theo định dạng của user:
     * http://IP:PORT/stream/filename.mp4?link=HASH&index=NUMBER&play
     */
    function buildTorrServerUrl(ip, port, filename, hash, index = 0) {
        const base = `http://${ip}:${port}`;
        const encodedFilename = encodeURIComponent(filename);
        return `${base}/stream/${encodedFilename}?link=${hash}&index=${index}&play`;
    }

    // ══════════════════════════════════════════
    // SMART DOWNLOAD SUGGESTIONS
    // ══════════════════════════════════════════
    function analyzeMedia(url) {
        const info = {
            url, type: 'unknown', format: 'unknown',
            tools: [], commands: [], tips: []
        };

        if (/\.m3u8/i.test(url))       { info.type = 'HLS Stream';    info.format = 'm3u8'; }
        else if (/\.mpd/i.test(url))   { info.type = 'DASH Stream';   info.format = 'mpd'; }
        else if (/\.mp4/i.test(url))   { info.type = 'MP4 Video';     info.format = 'mp4'; }
        else if (/\.webm/i.test(url))  { info.type = 'WebM Video';    info.format = 'webm'; }
        else if (/\.mkv/i.test(url))   { info.type = 'MKV Video';     info.format = 'mkv'; }
        else if (/\.flv/i.test(url))   { info.type = 'FLV Video';     info.format = 'flv'; }
        else if (/\.ts/i.test(url))    { info.type = 'TS Stream';     info.format = 'ts'; }
        else if (/\.m4s/i.test(url))   { info.type = 'DASH Segment';  info.format = 'm4s'; }
        else if (/\.torrent$/i.test(url)) { info.type = 'Torrent File'; info.format = 'torrent'; }
        else if (/\/stream\//.test(url)) { info.type = 'TorrServer Stream'; info.format = 'torrserver'; }
        else if (/iframe|embed/i.test(url)) { info.type = 'Iframe Player'; info.format = 'html'; }

        if (info.format === 'm3u8' || info.format === 'mpd') {
            info.tools = ['yt-dlp', 'ffmpeg', 'VLC', 'Termux'];
            info.commands = [
                { tool: 'yt-dlp',  cmd: `yt-dlp --referer "${REF}" "${url}"`, desc: 'Tải chất lượng cao nhất' },
                { tool: 'yt-dlp',  cmd: `yt-dlp --referer "${REF}" --user-agent "${UA}" -f "best" "${url}"`, desc: 'Bypass với header đầy đủ' },
                { tool: 'ffmpeg',  cmd: `ffmpeg -referer "${REF}" -user_agent "${UA}" -i "${url}" -c copy output.${info.format === 'mpd' ? 'mp4' : 'ts'}`, desc: 'Copy stream nhanh' },
                { tool: 'termux',  cmd: `pkg install python ffmpeg -y && pip install yt-dlp && yt-dlp --referer "${REF}" "${url}"`, desc: 'Cài và tải trên Android' },
            ];
            info.tips = [
                'HLS/DASH cần yt-dlp hoặc ffmpeg để tải',
                'Dùng flag -f để chọn quality cụ thể',
                'VLC có thể stream trực tiếp mà không cần tải'
            ];
        } else if (['mp4','webm','mkv','flv','ts','m4s'].includes(info.format)) {
            info.tools = ['aria2', 'wget', 'curl', 'IDM'];
            info.commands = [
                { tool: 'aria2', cmd: `aria2c --referer="${REF}" --user-agent="${UA}" -x 16 "${url}"`, desc: 'Tải đa luồng 16 connection' },
                { tool: 'wget',  cmd: `wget --referer="${REF}" --user-agent="${UA}" "${url}"`, desc: 'Tải đơn giản' },
                { tool: 'curl',  cmd: `curl -L --referer "${REF}" -A "${UA}" -o video.${info.format} "${url}"`, desc: 'Tải với curl' },
                { tool: 'termux',cmd: `pkg install aria2 -y && aria2c --referer="${REF}" -x 16 "${url}"`, desc: 'Tải trên Android' },
            ];
            info.tips = [
                'File trực tiếp, tải bằng bất kỳ tool nào',
                'aria2c nhanh hơn nhờ đa luồng (-x 16)',
                'Luôn thêm Referer để tránh bị chặn 403'
            ];
        } else if (info.format === 'torrent' || info.format === 'torrserver') {
            info.tools = ['TorrServer', 'qBittorrent', 'Transmission'];
            info.commands = [
                { tool: 'torrserver', cmd: getTorrStreamUrl(url), desc: 'Stream qua TorrServer' },
                { tool: 'termux', cmd: `pkg install transmission -y && transmission-remote -a "${url}"`, desc: 'Tải bằng Transmission' },
            ];
            info.tips = [
                'Dùng TorrServer để stream torrent trực tiếp',
                'Cần TorrServer đang chạy trên máy hoặc server riêng',
                'Có thể dùng VLC mở URL stream của TorrServer'
            ];
        } else if (info.format === 'html') {
            info.tools = ['Browser', 'yt-dlp'];
            info.commands = [
                { tool: 'yt-dlp',  cmd: `yt-dlp --referer "${REF}" "${url}"`, desc: 'Extract video từ iframe' },
                { tool: 'termux',  cmd: `yt-dlp --referer "${REF}" "${url}"`, desc: 'Chạy trên Termux' },
            ];
            info.tips = [
                'Đây là iframe player, yt-dlp sẽ tự extract URL thật',
                'Thử mở trong tab mới để tìm video gốc'
            ];
        } else {
            info.tools = ['yt-dlp', 'curl'];
            info.commands = [
                { tool: 'yt-dlp', cmd: `yt-dlp --referer "${REF}" "${url}"`, desc: 'Thử tải với yt-dlp' },
                { tool: 'curl',   cmd: `curl -L --referer "${REF}" -A "${UA}" -O "${url}"`, desc: 'Tải với curl' },
            ];
            info.tips = ['Định dạng không rõ, thử yt-dlp trước'];
        }

        return info;
    }

    async function parseM3U8Quality(url) {
        try {
            const res = await fetch(url);
            const text = await res.text();
            if (!text.includes('#EXT-X-STREAM-INF')) return null;

            const lines = text.split('\n');
            const qualities = [];

            for (let i = 0; i < lines.length; i++) {
                if (lines[i].includes('RESOLUTION=')) {
                    const res = lines[i].match(/RESOLUTION=(\d+x\d+)/)?.[1] || '';
                    const bw  = lines[i].match(/BANDWIDTH=(\d+)/)?.[1] || '0';
                    const next = (lines[i+1] || '').trim();
                    if (next && !next.startsWith('#')) {
                        const fullUrl = next.startsWith('http') ? next :
                            url.substring(0, url.lastIndexOf('/')+1) + next;
                        qualities.push({
                            label: res.split('x')[1] + 'p',
                            resolution: res,
                            bandwidth: parseInt(bw),
                            url: fullUrl
                        });
                    }
                }
            }

            qualities.sort((a, b) => b.bandwidth - a.bandwidth);
            return qualities;
        } catch(e) { return null; }
    }

    // ═════════════════════════════════════════
    // CSS
    // ══════════════════════════════════════════
    const CSS = `
        #u-fab {
            position:fixed; bottom:20px; right:20px;
            width:56px; height:56px;
            background:linear-gradient(135deg,#e53935,#c62828);
            color:white; border:none; border-radius:50%;
            font-size:24px; cursor:pointer;
            box-shadow:0 4px 20px rgba(229,57,53,.5);
            z-index:2147483647; display:flex;
            align-items:center; justify-content:center;
            transition:transform .2s;
        }
        #u-fab:active { transform:scale(0.95); }
        #u-badge {
            position:absolute; top:-4px; right:-4px;
            background:#43a047; color:white; font-size:10px;
            min-width:20px; height:20px; border-radius:10px;
            display:none; align-items:center; justify-content:center;
            font-weight:bold; border:2px solid #111;
        }

        #u-bd { position:fixed; inset:0; background:rgba(0,0,0,.8); z-index:2147483640; display:none; }
        #u-bd.on { display:block; }

        #u-panel {
            position:fixed; bottom:86px; right:12px;
            width:calc(100vw - 24px); max-width:420px;
            max-height:75vh; background:#111; border-radius:16px;
            z-index:2147483647; display:none; flex-direction:column;
            box-shadow:0 12px 40px rgba(0,0,0,.8); overflow:hidden;
            font-family:-apple-system,BlinkMacSystemFont,sans-serif; border:1px solid #222;
        }
        #u-panel.on { display:flex; }

        #u-ph {
            background:linear-gradient(135deg,#1e1e1e,#2a2a2a);
            padding:12px 14px; display:flex; align-items:center; gap:8px;
            border-bottom:1px solid #333; flex-shrink:0;
        }
        #u-ph-title { color:#fff; font-size:14px; font-weight:700; flex:1; }
        #u-ph-acts { display:flex; gap:6px; }

        .hbtn { border:none; border-radius:8px; cursor:pointer; font-size:11px; font-weight:600; padding:8px 12px; color:white; }
        .hbtn.blue { background:#1565c0; }
        .hbtn.gray { background:#424242; }
        .hbtn.grn { background:#2e7d32; }
        .hbtn.org { background:#e65100; }

        #u-tabs { display:flex; background:#161616; border-bottom:1px solid #222; flex-shrink:0; overflow-x:auto; }
        .utab {
            flex:1; min-width:0; padding:10px 4px; border:none; background:none;
            color:#666; font-size:11px; font-weight:600; cursor:pointer;
            border-bottom:2px solid transparent; transition:all .2s; white-space:nowrap;
        }
        .utab.on { color:#e53935; border-bottom-color:#e53935; background:#1a0000; }

        #u-pb { overflow-y:auto; flex:1; background:#0a0a0a; }

        /* Media Items */
        .li { padding:12px 14px; border-bottom:1px solid #181818; cursor:pointer; transition:background .2s; }
        .li:active { background:#1a1a1a; }
        .li-top { display:flex; align-items:center; gap:8px; margin-bottom:6px; }
        .li-badge { font-size:10px; font-weight:700; padding:3px 8px; border-radius:5px; color:white; }
        .lb-M3U8{background:#7b1fa2;} .lb-MP4{background:#2e7d32;} .lb-IFRAME{background:#1565c0;}
        .lb-WEBM{background:#00838f;} .lb-MKV{background:#4527a0;} .lb-FLV{background:#e65100;}
        .lb-TORRENT{background:#d84315;} .lb-TORRSERVER{background:#ff6f00;} .lb-other{background:#444;}
        .li-name { color:#fff; font-size:13px; font-weight:600; flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .li-src { color:#555; font-size:10px; margin-bottom:4px; }
        .li-url { color:#4fc3f7; font-size:10px; font-family:monospace; word-break:break-all; background:#000; padding:8px; border-radius:6px; line-height:1.4; border:1px solid #1a1a1a; }

        /* Magnet Items */
        .mag-item { padding:12px 14px; border-bottom:1px solid #181818; cursor:pointer; }
        .mag-item:active { background:#1a1a1a; }
        .mag-hash { color:#ff9800; font-size:12px; font-family:monospace; font-weight:600; margin-bottom:4px; word-break:break-all; }
        .mag-link { color:#4fc3f7; font-size:10px; font-family:monospace; word-break:break-all; background:#000; padding:6px; border-radius:5px; margin-bottom:4px; }
        .mag-src { color:#555; font-size:10px; }
        .mag-play-btn { background:#d84315; border:none; color:white; font-size:10px; padding:4px 10px; border-radius:5px; cursor:pointer; margin-top:6px; font-weight:600; }

        /* Download Suggestion */
        .dl-suggest { padding:14px; border-bottom:1px solid #181818; }
        .dl-header { display:flex; align-items:center; gap:8px; margin-bottom:10px; }
        .dl-type { background:#e53935; color:white; font-size:10px; font-weight:700; padding:4px 10px; border-radius:12px; }
        .dl-format { color:#888; font-size:11px; }
        .dl-tools { display:flex; gap:6px; flex-wrap:wrap; margin-bottom:10px; }
        .dl-tool { background:#1a1a1a; color:#4fc3f7; border:1px solid #333; font-size:10px; padding:4px 10px; border-radius:12px; }
        .dl-cmd { background:#0a0a0a; border:1px solid #222; border-radius:8px; padding:10px; margin-bottom:8px; }
        .dl-cmd-label { color:#888; font-size:10px; font-weight:600; margin-bottom:6px; display:flex; justify-content:space-between; align-items:center; }
        .dl-cmd-text { color:#4caf50; font-family:monospace; font-size:11px; word-break:break-all; line-height:1.5; }
        .dl-cmd-copy { background:#1565c0; border:none; color:white; padding:4px 10px; border-radius:6px; cursor:pointer; font-size:10px; font-weight:600; flex-shrink:0; margin-left:8px; }
        .dl-tips { background:#1a1a2a; border-left:3px solid #1565c0; padding:8px 12px; border-radius:6px; margin-top:10px; }
        .dl-tip { color:#90caf9; font-size:11px; line-height:1.5; margin-bottom:4px; }
        .dl-tip:last-child { margin-bottom:0; }

        /* TorrServer Tab */
        .torr-config { padding:14px; border-bottom:1px solid #181818; }
        .torr-label { color:#888; font-size:11px; font-weight:600; margin-bottom:8px; }
        .torr-input {
            width:100%; background:#0a0a0a; border:1px solid #333;
            border-radius:8px; padding:10px; color:#fff;
            font-size:13px; font-family:monospace; box-sizing:border-box; outline:none;
        }
        .torr-input:focus { border-color:#e53935; }
        .torr-status {
            display:flex; align-items:center; gap:6px;
            padding:8px 12px; border-radius:8px; margin-top:8px;
            font-size:11px; font-weight:600;
        }
        .torr-status.ok { background:#1b5e20; color:#a5d6a7; }
        .torr-status.err { background:#b71c1c; color:#ef9a9a; }
        .torr-status.wait { background:#333; color:#aaa; }
        .torr-dot { width:8px; height:8px; border-radius:50%; }
        .torr-status.ok .torr-dot { background:#4caf50; }
        .torr-status.err .torr-dot { background:#f44336; }
        .torr-status.wait .torr-dot { background:#888; }

        .torr-magnets-header {
            padding:10px 14px; background:#1a0a00;
            border-bottom:1px solid #2a1500;
            color:#ff9800; font-size:12px; font-weight:700;
            display:flex; justify-content:space-between; align-items:center;
        }

        /* Preview Player */
        #u-prev {
            position:fixed; bottom:0; left:0; right:0;
            background:#111; z-index:2147483647;
            display:none; flex-direction:column;
            border-radius:20px 20px 0 0;
            box-shadow:0 -10px 50px rgba(0,0,0,.8);
        }
        #u-prev.on { display:flex; }
        #u-prev-bar { display:flex; align-items:center; padding:12px 14px; gap:8px; border-bottom:1px solid #222; flex-shrink:0; }
        #u-prev-title { flex:1; color:#fff; font-size:13px; font-weight:700; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        #u-vid-wrap { background:#000; width:100%; height:240px; overflow:hidden; display:flex; align-items:center; justify-content:center; flex-shrink:0; }
        #u-vid { width:100%; height:100%; object-fit:contain; transition:transform .3s; }
        .p-acts { display:flex; gap:6px; padding:12px 14px; overflow-x:auto; background:#161616; flex-shrink:0; }
        .pact { border:none; border-radius:8px; padding:10px 14px; color:white; font-weight:600; font-size:11px; white-space:nowrap; cursor:pointer; }
        .pact:active { opacity:.7; }
        .pact.bl{background:#1565c0} .pact.gr{background:#2e7d32} .pact.pu{background:#6a1b9a}
        .pact.te{background:#00796b} .pact.gy{background:#444} .pact.rd{background:#c62828}
        .pact.or{background:#e65100}

        /* CMD Modal */
        #u-cmd {
            position:fixed; top:50%; left:50%; transform:translate(-50%,-50%);
            background:#111; border-radius:16px; z-index:2147483647;
            width:94%; max-width:500px; padding:18px; display:none;
            box-shadow:0 15px 50px rgba(0,0,0,.9); border:1px solid #333;
            max-height:80vh; overflow-y:auto;
        }
        #u-cmd.on { display:block; }
        .cmd-block { background:#0a0a0a; border-radius:10px; padding:12px; margin-bottom:12px; border:1px solid #222; }
        .cmd-label { color:#888; font-size:10px; font-weight:700; text-transform:uppercase; margin-bottom:6px; }
        .cmd-row { display:flex; gap:8px; align-items:stretch; }
        .cmd-ta { flex:1; background:transparent; color:#4caf50; border:none; font-family:monospace; font-size:11px; resize:none; line-height:1.5; outline:none; }
        .cmd-cp { background:#1565c0; border:none; color:white; border-radius:8px; padding:0 14px; cursor:pointer; font-size:16px; display:flex; align-items:center; }

        /* Dropdown */
        #u-drop { position:fixed; background:#1c1c1c; border-radius:12px; border:1px solid #333; z-index:2147483647; display:none; box-shadow:0 10px 40px rgba(0,0,0,.8); overflow:hidden; min-width:220px; }
        .di { padding:13px 18px; color:#eee; font-size:13px; cursor:pointer; border-bottom:1px solid #252525; }
        .di:hover { background:#2a2a2a; }

        /* Toast */
        #u-toast {
            position:fixed; bottom:90px; left:50%; transform:translateX(-50%);
            background:#323232; color:white; padding:10px 22px; border-radius:25px;
            font-size:13px; font-weight:600; z-index:2147483647; display:none;
            box-shadow:0 5px 15px rgba(0,0,0,.5); white-space:nowrap;
        }

        .qs-item { padding:12px 16px; color:#eee; font-size:13px; cursor:pointer; border-bottom:1px solid #252525; display:flex; justify-content:space-between; }
        .qs-item:hover { background:#2a2a2a; }
        .qs-label { color:#4fc3f7; font-weight:600; }
        .qs-bw { color:#666; font-size:11px; }
        
        /* TorrServer stream items */
        .ts-info { display:flex; gap:4px; flex-wrap:wrap; margin-top:6px; }
        .ts-tag { background:#1a1a1a; color:#ff9800; font-size:9px; padding:2px 8px; border-radius:10px; font-family:monospace; }
    `;

    // ══════════════════════════════════════════
    // INIT UI
    // ══════════════════════════════════════════
    function initUI() {
        const style = document.createElement('style');
        style.textContent = CSS;
        document.head.appendChild(style);

        document.body.insertAdjacentHTML('beforeend', `
            <button id="u-fab">🎬<span id="u-badge"></span></button>
            <div id="u-bd"></div>

            <div id="u-panel">
                <div id="u-ph">
                    <span id="u-ph-title">🎬 Media Player</span>
                    <div id="u-ph-acts">
                        <button class="hbtn blue" id="btn-scan">🔍 QUÉT</button>
                        <button class="hbtn gray" id="btn-clr">🗑</button>
                    </div>
                </div>
                <div id="u-tabs">
                    <button class="utab on"  data-tab="streams">📺 Streams</button>
                    <button class="utab"     data-tab="torrents">🧲 Torrent</button>
                    <button class="utab"     data-tab="torrserver">📡 TorrServer</button>
                    <button class="utab"     data-tab="download">💡 Tải</button>
                </div>
                <div id="u-pb"></div>
            </div>

            <div id="u-prev">
                <div id="u-prev-bar">
                    <span id="u-prev-title">-</span>
                    <button id="btn-opt" style="background:#222;border:none;color:#fff;width:36px;height:36px;border-radius:50%;cursor:pointer;font-size:18px">⋮</button>
                    <button id="btn-cls" style="background:#222;border:none;color:#f44336;width:36px;height:36px;border-radius:50%;cursor:pointer;font-size:18px">✕</button>
                </div>
                <div id="u-vid-wrap">
                    <video id="u-vid" controls playsinline webkit-playsinline></video>
                </div>
                <div class="p-acts" id="u-p-acts"></div>
            </div>

            <div id="u-drop"></div>
            <div id="u-cmd"></div>
            <div id="u-toast"></div>
        `);

        initLogic();
    }

    function initLogic() {
        const $ = id => document.getElementById(id);
        let cur = null, rot = 0, zoom = 1;
        let currentPanelTab = 'streams';
        let currentDownloadUrl = null;

        // ── Toast ─
        function toast(m, color) {
            const t = $('u-toast');
            t.textContent = m; t.style.background = color || '#323232';
            t.style.display = 'block';
            clearTimeout(t._t); t._t = setTimeout(() => t.style.display='none', 2500);
        }

        function cp(text) {
            const ta = document.createElement('textarea');
            ta.value = text; ta.style.cssText = 'position:fixed;left:-9999px';
            document.body.appendChild(ta); ta.select();
            document.execCommand('copy'); document.body.removeChild(ta);
            toast('✅ Đã copy!', '#2e7d32');
        }

        function fname(url) {
            try {
                const p = new URL(url).pathname.split('/').filter(Boolean).pop() || '';
                const n = decodeURIComponent(p.split('?')[0]);
                if (n && /\.\w{2,6}$/.test(n)) return n;
            } catch(e) {}
            return 'Media';
        }

        updateBadge = function() {
            const b = $('u-badge');
            const total = urls.size + magnets.size;
            if (b) { b.style.display = total ? 'flex' : 'none'; b.textContent = total > 99 ? '99+' : total; }
        };

        // ── Tab Switch ──
        document.querySelectorAll('.utab').forEach(tab => {
            tab.onclick = () => {
                document.querySelectorAll('.utab').forEach(t => t.classList.remove('on'));
                tab.classList.add('on');
                currentPanelTab = tab.dataset.tab;
                renderPanel();
            };
        });

        function renderPanel() {
            if      (currentPanelTab === 'streams')    renderStreams();
            else if (currentPanelTab === 'torrents')   renderTorrents();
            else if (currentPanelTab === 'torrserver') renderTorrServer();
            else if (currentPanelTab === 'download')   renderDownload();
        }

        // ══════════════════════════════
        // TAB: STREAMS (bao gồm TorrServer streams)
        // ══════════════════════════════
        function renderStreams() {
            const pb = $('u-pb'); pb.innerHTML = '';
            const items = [...urls.values()]
                .filter(i => i.type !== 'TORRENT')
                .sort((a,b) => a.priority - b.priority);

            if (!items.length) {
                pb.innerHTML = `<div style="color:#555;text-align:center;padding:40px 20px;font-size:13px">
                    Chưa tìm thấy media stream.<br><br>▶️ Phát video rồi nhấn 🔍 QUÉT</div>`;
                return;
            }

            items.forEach(item => {
                const bc = 'lb-' + (['M3U8','MP4','IFRAME','WEBM','MKV','FLV','TS','M4S','MOV','TORRSERVER'].includes(item.type) ? item.type : 'other');
                const div = document.createElement('div');
                div.className = 'li'; div.dataset.url = item.url;
                
                let extraInfo = '';
                if (item.type === 'TORRSERVER') {
                    const tsInfo = parseTorrServerUrl(item.url);
                    if (tsInfo) {
                        extraInfo = `
                            <div class="ts-info">
                                <span class="ts-tag">📡 ${tsInfo.baseUrl}</span>
                                <span class="ts-tag">🔗 ${tsInfo.link.substring(0, 16)}...</span>
                                ${tsInfo.index !== '0' ? `<span class="ts-tag">#${tsInfo.index}</span>` : ''}
                            </div>`;
                    }
                }
                
                div.innerHTML = `
                    <div class="li-top">
                        <span class="li-badge ${bc}">${item.type}</span>
                        <span class="li-name">${fname(item.url)}</span>
                    </div>
                    <div class="li-src">${item.source}</div>
                    <div class="li-url">${item.url}</div>
                    ${extraInfo}`;
                
                div.onclick = () => {
                    const it = urls.get(div.dataset.url);
                    if (it.type === 'IFRAME') { window.open(it.url,'_blank'); toast('🚀 Mở iframe'); }
                    else openPrev(it);
                };
                pb.appendChild(div);
            });
        }

        // ══════════════════════════════
        // TAB: TORRENTS / MAGNETS
        // ══════════════════════════════
        function renderTorrents() {
            const pb = $('u-pb'); pb.innerHTML = '';

            // Torrent file URLs
            const torrentFiles = [...urls.values()].filter(i => i.type === 'TORRENT');
            if (torrentFiles.length) {
                pb.insertAdjacentHTML('beforeend', `
                    <div style="padding:10px 14px;background:#1a0a00;border-bottom:1px solid #2a1500;color:#ff9800;font-size:12px;font-weight:700">
                        📁 TORRENT FILES (${torrentFiles.length})
                    </div>`);
                torrentFiles.forEach(item => {
                    const div = document.createElement('div');
                    div.className = 'li';
                    div.innerHTML = `
                        <div class="li-top">
                            <span class="li-badge lb-TORRENT">TORRENT</span>
                            <span class="li-name">${fname(item.url)}</span>
                        </div>
                        <div class="li-src">${item.source}</div>
                        <div class="li-url">${item.url}</div>
                        <button class="mag-play-btn" data-url="${item.url}" data-type="torrent">▶️ Stream qua TorrServer</button>`;
                    div.querySelector('.mag-play-btn').onclick = (e) => {
                        e.stopPropagation();
                        playViaTorrServer(item.url, 'torrent');
                    };
                    pb.appendChild(div);
                });
            }

            // Magnet links
            if (!magnets.size) {
                if (!torrentFiles.length) {
                    pb.innerHTML = `<div style="color:#555;text-align:center;padding:40px 20px;font-size:13px">
                        Chưa tìm thấy magnet/torrent.<br><br>
                        🧲 Script tự động phát hiện magnet link trên trang</div>`;
                }
                return;
            }

            pb.insertAdjacentHTML('beforeend', `
                <div class="torr-magnets-header">
                    <span>🧲 MAGNET LINKS (${magnets.size})</span>
                    <span style="font-size:10px;color:#888;font-weight:normal">Tự động phát hiện</span>
                </div>`);

            [...magnets.values()].forEach(mag => {
                const div = document.createElement('div');
                div.className = 'mag-item';
                
                // Tạo URL stream preview
                const streamUrl = getTorrStreamUrl(mag.magnet);
                
                div.innerHTML = `
                    <div class="mag-hash">🧲 ${mag.hash.substring(0, 16)}...${mag.hash.substring(mag.hash.length-8)}</div>
                    <div class="mag-link">${mag.magnet.substring(0, 80)}...</div>
                    <div class="mag-src">📌 ${mag.source}</div>
                    <div style="color:#888;font-size:10px;margin-top:4px;font-family:monospace">Stream URL: ${streamUrl.substring(0, 60)}...</div>
                    <button class="mag-play-btn" data-hash="${mag.hash}">▶️ Stream qua TorrServer</button>`;
                
                div.querySelector('.mag-play-btn').onclick = (e) => {
                    e.stopPropagation();
                    playViaTorrServer(mag.magnet, 'magnet');
                };
                pb.appendChild(div);
            });
        }

        // ══════════════════════════════
        // TAB: TORRSERVER
        // ══════════════════════════════
        function renderTorrServer() {
            const pb = $('u-pb'); pb.innerHTML = '';

            pb.innerHTML = `
                <div class="torr-config">
                    <div class="torr-label">📡 URL TorrServer</div>
                    <input class="torr-input" id="torr-url-input" type="text"
                           value="${torrServerUrl}"
                           placeholder="http://127.0.0.1:8090 hoặc http://62.60.153.226:12345">
                    <div style="display:flex;gap:8px;margin-top:10px">
                        <button class="hbtn blue" id="torr-save" style="flex:1">💾 Lưu</button>
                        <button class="hbtn grn" id="torr-test" style="flex:1">🔍 Test kết nối</button>
                    </div>
                    <div class="torr-status wait" id="torr-status">
                        <span class="torr-dot"></span>
                        <span id="torr-status-text">Chưa kiểm tra</span>
                    </div>
                </div>

                <div style="padding:14px;border-bottom:1px solid #181818">
                    <div class="torr-label">📖 Định dạng TorrServer</div>
                    <div style="color:#aaa;font-size:11px;line-height:1.6">
                        Script hỗ trợ 2 định dạng TorrServer:<br><br>
                        <span style="color:#4fc3f7;font-family:monospace">1. /stream/magnet:?xt=urn:btih:HASH</span><br>
                        <span style="color:#888">→ Dùng cho magnet link</span><br><br>
                        <span style="color:#4fc3f7;font-family:monospace">2. /stream/file.mp4?link=HASH&index=N&play</span><br>
                        <span style="color:#888">→ Dùng cho file cụ thể trong torrent</span><br><br>
                        <span style="color:#ff9800">💡 Khi phát hiện URL có link=, script tự động nhận diện và stream</span>
                    </div>
                </div>

                <div style="padding:14px">
                    <div class="torr-label">🔗 API TorrServer</div>
                    <div style="background:#0a0a0a;border:1px solid #222;border-radius:8px;padding:10px;font-family:monospace;font-size:11px;color:#4caf50;line-height:1.8">
                        GET /stream/{magnet} → Stream video<br>
                        GET /stream/file.mp4?link=HASH&index=N&play → Stream file cụ thể<br>
                        GET /play/{magnet} → Play trong player<br>
                        GET /echo → Test kết nối
                    </div>
                </div>
            `;

            $('torr-save').onclick = () => {
                const val = $('torr-url-input').value.trim();
                if (!val) { toast('❌ Nhập URL TorrServer!', '#c62828'); return; }
                torrServerUrl = val.replace(/\/$/, '');
                saveStr(TORR_KEY, torrServerUrl);
                toast('✅ Đã lưu: ' + torrServerUrl, '#2e7d32');
            };

            $('torr-test').onclick = async () => {
                const statusEl = $('torr-status');
                const textEl = $('torr-status-text');
                const url = $('torr-url-input').value.trim().replace(/\/$/, '');

                statusEl.className = 'torr-status wait';
                textEl.textContent = 'Đang kết nối...';

                try {
                    const res = await fetch(url + '/echo', {
                        method: 'GET',
                        mode: 'cors',
                        signal: AbortSignal.timeout(5000)
                    });
                    if (res.ok) {
                        statusEl.className = 'torr-status ok';
                        textEl.textContent = '✅ Kết nối thành công! TorrServer đang chạy.';
                        torrServerUrl = url;
                        saveStr(TORR_KEY, torrServerUrl);
                    } else {
                        // Thử stream test
                        const res2 = await fetch(url + '/', {
                            method: 'GET',
                            mode: 'cors',
                            signal: AbortSignal.timeout(3000)
                        });
                        if (res2.ok) {
                            statusEl.className = 'torr-status ok';
                            textEl.textContent = '✅ TorrServer root OK!';
                            torrServerUrl = url;
                            saveStr(TORR_KEY, torrServerUrl);
                        } else {
                            statusEl.className = 'torr-status err';
                            textEl.textContent = '❌ TorrServer trả về lỗi: ' + res.status;
                        }
                    }
                } catch(e) {
                    statusEl.className = 'torr-status err';
                    textEl.textContent = '❌ Không kết nối được. Kiểm tra IP/port!';
                }
            };
        }

        // ══════════════════════════════
        // PLAY VIA TORRSERVER - FIXED
        // ══════════════════════════════
        function playViaTorrServer(source, type) {
            if (!torrServerUrl) {
                toast('⚠️ Chưa cấu hình TorrServer! Chuyển sang tab 📡', '#c62828');
                document.querySelectorAll('.utab').forEach(t => t.classList.remove('on'));
                document.querySelector('[data-tab="torrserver"]').classList.add('on');
                currentPanelTab = 'torrserver';
                renderTorrServer();
                return;
            }

            const streamUrl = getTorrStreamUrl(source);
            const title = type === 'magnet'
                ? `🧲 Torrent Stream`
                : `📁 ${fname(source)}`;

            // Parse TorrServer URL để hiển thị thêm thông tin
            const tsInfo = parseTorrServerUrl(streamUrl);
            let debugInfo = '';
            if (tsInfo && tsInfo.link) {
                debugInfo = ` | Link: ${tsInfo.link.substring(0, 8)}... | Index: ${tsInfo.index}`;
            }

            toast(`📡 Đang stream qua TorrServer...${debugInfo}`, '#e65100');

            cur = { url: streamUrl, type: 'TORRSERVER', source: 'torrserver', priority: 0.5, ts: Date.now(), originalSource: source };
            rot = 0; zoom = 1;

            $('u-vid').style.transform = 'none';
            $('u-prev-title').textContent = title;
            
            // Set source và thêm error handling
            const vid = $('u-vid');
            vid.src = '';
            setTimeout(() => {
                vid.src = streamUrl;
                vid.load();
            }, 100);
            
            vid.onerror = () => {
                toast('❌ TorrServer không stream được! Kiểm tra:', '#c62828');
                console.error('TorrServer stream failed:', streamUrl);
                console.log('TorrServer URL:', torrServerUrl);
                console.log('Original source:', source);
            };
            
            vid.onloadeddata = () => {
                toast('✅ Stream thành công!', '#2e7d32');
            };

            $('u-p-acts').innerHTML = `
                <button class="pact bl" id="pc-cp">📋 Copy URL</button>
                <button class="pact or" id="pc-torr">📡 Mở TorrServer</button>
                <button class="pact rd" id="pc-fs">⛶ FullScreen</button>
                <button class="pact gr" id="pc-vlc">📺 VLC</button>
                <button class="pact te" id="pc-rot">⟳ Xoay</button>
                <button class="pact gy" id="pc-zm">🔍 1x</button>
                <button class="pact pu" id="pc-debug">🐛 Debug</button>`;

            $('pc-cp').onclick   = () => cp(streamUrl);
            $('pc-torr').onclick = () => { window.open(streamUrl, '_blank'); toast('📡 Mở TorrServer stream'); };
            $('pc-fs').onclick   = triggerFullscreen;
            $('pc-vlc').onclick  = () => window.location.href = 'vlc://' + streamUrl;
            $('pc-rot').onclick  = () => { rot=(rot+90)%360; vid.style.transform=`rotate(${rot}deg) scale(${zoom})`; };
            $('pc-zm').onclick   = (e) => {
                const lv=[1,1.25,1.5,2,0.75];
                zoom=lv[(lv.indexOf(zoom)+1)%lv.length];
                e.target.textContent=`🔍 ${zoom}x`;
                vid.style.transform=`rotate(${rot}deg) scale(${zoom})`;
            };
            $('pc-debug').onclick = () => {
                const debugInfo = `
=== TorrServer Debug ===
TorrServer URL: ${torrServerUrl}
Stream URL: ${streamUrl}
Original Source: ${source}
Type: ${type}
Parsed Info: ${JSON.stringify(parseTorrServerUrl(streamUrl), null, 2)}
=====================`.trim();
                cp(debugInfo);
                toast('🐛 Debug info đã copy! Kiểm tra console (F12)', '#1565c0');
                console.log(debugInfo);
            };

            $('u-prev').classList.add('on');
            $('u-bd').classList.add('on');
            $('u-panel').classList.remove('on');
        }

        // ══════════════════════════════
        // TAB: DOWNLOAD SUGGESTIONS
        // ══════════════════════════════
        function renderDownload() {
            const pb = $('u-pb'); pb.innerHTML = '';

            const items = [...urls.values()].filter(i => i.type !== 'TORRENT').sort((a,b) => a.priority - b.priority);

            if (!items.length) {
                pb.innerHTML = `<div style="color:#555;text-align:center;padding:40px 20px;font-size:13px">
                    Chưa có media để tải.<br><br>📺 Chuyển sang tab Streams</div>`;
                return;
            }

            const best = items[0];
            currentDownloadUrl = best.url;
            const info = analyzeMedia(best.url);

            pb.innerHTML = `
                <div class="dl-suggest">
                    <div class="dl-header">
                        <span class="dl-type">${info.type}</span>
                        <span class="dl-format">.${info.format}</span>
                    </div>

                    <div style="color:#4fc3f7;font-size:11px;font-family:monospace;word-break:break-all;background:#000;padding:8px;border-radius:6px;margin-bottom:10px;border:1px solid #1a1a1a">
                        ${best.url}
                    </div>

                    <div style="color:#888;font-size:11px;font-weight:600;margin-bottom:8px">🛠 Công cụ đề xuất:</div>
                    <div class="dl-tools">
                        ${info.tools.map(t => `<span class="dl-tool">${t}</span>`).join('')}
                    </div>

                    <div style="color:#888;font-size:11px;font-weight:600;margin-bottom:8px">📋 Lệnh tải:</div>
                    <div id="dl-commands">
                        ${info.commands.map((cmd, i) => `
                            <div class="dl-cmd">
                                <div class="dl-cmd-label">
                                    <span>${cmd.tool} - ${cmd.desc}</span>
                                    <button class="dl-cmd-copy" data-idx="${i}">📋 Copy</button>
                                </div>
                                <div class="dl-cmd-text">${cmd.cmd}</div>
                            </div>
                        `).join('')}
                    </div>

                    <div class="dl-tips">
                        ${info.tips.map(tip => `<div class="dl-tip">💡 ${tip}</div>`).join('')}
                    </div>

                    ${info.format === 'm3u8' ? `
                        <button class="hbtn blue" id="btn-parse-quality" style="width:100%;margin-top:12px;padding:12px;font-size:12px">
                            🎞 Phân tích chất lượng M3U8
                        </button>
                        <div id="quality-list" style="margin-top:10px"></div>
                    ` : ''}

                    <button class="hbtn grn" id="btn-open-prev" style="width:100%;margin-top:12px;padding:12px;font-size:12px">
                        ▶️ Xem trước video
                    </button>
                </div>
            `;

            // Copy buttons
            pb.querySelectorAll('.dl-cmd-copy').forEach(btn => {
                btn.onclick = () => {
                    const idx = parseInt(btn.dataset.idx);
                    cp(info.commands[idx].cmd);
                };
            });

            // Parse quality for M3U8
            const parseBtn = pb.querySelector('#btn-parse-quality');
            if (parseBtn) {
                parseBtn.onclick = async () => {
                    toast('⏳ Đang phân tích...');
                    const qualities = await parseM3U8Quality(best.url);
                    const qList = pb.querySelector('#quality-list');

                    if (!qualities || !qualities.length) {
                        qList.innerHTML = '<div style="color:#ef5350;font-size:12px;padding:10px">❌ Không thể phân tích quality</div>';
                        return;
                    }

                    qList.innerHTML = `
                        <div style="color:#888;font-size:11px;font-weight:600;margin-bottom:8px">🎞 Chất lượng có sẵn:</div>
                        ${qualities.map(q => `
                            <div class="qs-item" data-url="${q.url}" data-quality="${q.label}">
                                <span class="qs-label">📺 ${q.label}</span>
                                <span class="qs-bw">${(q.bandwidth/1000000).toFixed(1)} Mbps</span>
                            </div>
                        `).join('')}
                    `;

                    qList.querySelectorAll('.qs-item').forEach(item => {
                        item.onclick = () => {
                            const url = item.dataset.url;
                            const quality = item.dataset.quality;
                            currentDownloadUrl = url;
                            toast(`✅ Đã chọn ${quality}`);

                            const newInfo = analyzeMedia(url);
                            const cmdContainer = pb.querySelector('#dl-commands');
                            cmdContainer.innerHTML = newInfo.commands.map((cmd, i) => `
                                <div class="dl-cmd">
                                    <div class="dl-cmd-label">
                                        <span>${cmd.tool} - ${cmd.desc}</span>
                                        <button class="dl-cmd-copy" data-idx="${i}">📋 Copy</button>
                                    </div>
                                    <div class="dl-cmd-text">${cmd.cmd}</div>
                                </div>
                            `).join('');

                            cmdContainer.querySelectorAll('.dl-cmd-copy').forEach(btn => {
                                btn.onclick = () => {
                                    const idx = parseInt(btn.dataset.idx);
                                    cp(newInfo.commands[idx].cmd);
                                };
                            });
                        };
                    });
                };
            }

            pb.querySelector('#btn-open-prev').onclick = () => openPrev(best);
        }

        // ══════════════════════════════
        // FULLSCREEN LANDSCAPE
        // ══════════════════════════════
        function setupFullscreen() {
            const vid = $('u-vid');
            if (!vid) return () => {};

            const tryLock = () => {
                if (screen.orientation && screen.orientation.lock) {
                    screen.orientation.lock('landscape').catch(() => {});
                }
            };

            ['fullscreenchange','webkitfullscreenchange','mozfullscreenchange'].forEach(evt => {
                document.addEventListener(evt, () => {
                    const fs = document.fullscreenElement || document.webkitFullscreenElement;
                    if (fs) tryLock();
                    else if (screen.orientation && screen.orientation.unlock) screen.orientation.unlock();
                });
            });

            return function triggerFs() {
                const req = vid.requestFullscreen || vid.webkitRequestFullscreen || vid.mozRequestFullScreen;
                if (req) req.call(vid).then(tryLock).catch(() => toast('❌ Fullscreen bị chặn','#c62828'));
            };
        }
        const triggerFullscreen = setupFullscreen();

        // ══════════════════════════════
        // OPEN PREVIEW
        // ══════════════════════════════
        function openPrev(item) {
            cur = item; rot = 0; zoom = 1;
            $('u-vid').style.transform = 'none';
            $('u-prev-title').textContent = fname(item.url);
            
            const vid = $('u-vid');
            vid.src = '';
            setTimeout(() => {
                vid.src = item.url;
                vid.load();
            }, 100);
            
            vid.onerror = () => toast('❌ Không phát được','#c62828');

            $('u-p-acts').innerHTML = `
                <button class="pact bl" id="pc-cp">📋 Copy</button>
                <button class="pact rd" id="pc-fs">⛶ FullScreen</button>
                <button class="pact gr" id="pc-vlc">📺 VLC</button>
                <button class="pact pu" id="pc-ytdl">💻 Tải</button>
                <button class="pact te" id="pc-rot">⟳ Xoay</button>
                <button class="pact gy" id="pc-zm">🔍 1x</button>`;

            $('pc-cp').onclick   = () => cp(cur.url);
            $('pc-fs').onclick   = triggerFullscreen;
            $('pc-vlc').onclick  = () => window.location.href = 'vlc://'+cur.url;
            $('pc-ytdl').onclick = () => openCmd(cur.url);
            $('pc-rot').onclick  = () => { rot=(rot+90)%360; vid.style.transform=`rotate(${rot}deg) scale(${zoom})`; };
            $('pc-zm').onclick   = (e) => {
                const lv=[1,1.25,1.5,2,0.75];
                zoom=lv[(lv.indexOf(zoom)+1)%lv.length];
                e.target.textContent=`🔍 ${zoom}x`;
                vid.style.transform=`rotate(${rot}deg) scale(${zoom})`;
            };
            $('u-prev').classList.add('on');
            $('u-bd').classList.add('on');
            $('u-panel').classList.remove('on');
        }

        // ══════════════════════════════
        // CMD MODAL
        // ══════════════════════════════
        function openCmd(url) {
            const info = analyzeMedia(url);

            const toolMap = {
                'ytdlp':   ['yt-dlp'],
                'ffmpeg':  ['ffmpeg'],
                'termux':  ['termux', 'aria2', 'wget', 'curl', 'IDM', 'VLC', 'Browser', 'qBittorrent', 'Transmission', 'TorrServer']
            };

            const build = (toolKey) => {
                const matchNames = toolMap[toolKey] || [toolKey];
                const cmds = info.commands.filter(c =>
                    matchNames.some(name => c.tool.toLowerCase() === name.toLowerCase())
                );

                const displayCmds = cmds.length ? cmds : info.commands;

                $('u-cmd').innerHTML = `
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
                        <h4 style="color:#fff;margin:0;font-size:14px">💻 Lệnh ${toolKey.toUpperCase()}</h4>
                        <span style="color:#444;font-size:10px;max-width:140px;overflow:hidden;text-overflow:ellipsis">${fname(url)}</span>
                    </div>
                    <div style="display:flex;gap:4px;margin-bottom:14px">
                        ${['ytdlp','ffmpeg','termux'].map(t=>`
                            <button style="flex:1;background:${t===toolKey?'#e53935':'#222'};color:white;border:none;padding:8px;border-radius:8px;cursor:pointer;font-size:11px;font-weight:600" data-tab="${t}">${t.toUpperCase()}</button>
                        `).join('')}
                    </div>
                    ${displayCmds.map(cmd=>`
                        <div class="cmd-block">
                            <div class="cmd-label">${cmd.tool} - ${cmd.desc}</div>
                            <div class="cmd-row">
                                <textarea class="cmd-ta" rows="2" readonly>${cmd.cmd}</textarea>
                                <button class="cmd-cp">📋</button>
                            </div>
                        </div>`).join('')}
                    <button style="width:100%;background:#c62828;border:none;color:white;padding:12px;border-radius:8px;cursor:pointer;font-weight:600" id="cmd-cls">ĐÓNG</button>`;

                $('u-cmd').querySelectorAll('.cmd-ta').forEach(ta => { ta.style.height='auto'; ta.style.height=ta.scrollHeight+'px'; });
                $('u-cmd').querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>build(b.dataset.tab));
                $('u-cmd').querySelectorAll('.cmd-cp').forEach(b=>b.onclick=()=>cp(b.parentElement.querySelector('.cmd-ta').value));
                $('cmd-cls').onclick=()=>{
                    $('u-cmd').classList.remove('on');
                    if(!$('u-prev').classList.contains('on')&&!$('u-panel').classList.contains('on')) $('u-bd').classList.remove('on');
                };
            };
            build('ytdlp');
            $('u-cmd').classList.add('on');
            $('u-bd').classList.add('on');
        }

        // ═════════════════════════════
        // DROPDOWN ⋮
        // ══════════════════════════════
        $('btn-opt').onclick = (e) => {
            e.stopPropagation();
            const d = $('u-drop');
            d.innerHTML = `
                <div class="di" id="m-qs">🎞 Chọn chất lượng</div>
                <div class="di" id="m-fs">⛶ Fullscreen Ngang</div>
                <div class="di" id="m-new">🌐 Mở tab mới</div>
                <div class="di" id="m-cp">📋 Copy URL</div>
                <div class="di" id="m-ddrop" style="color:#555">✕ Đóng</div>`;
            const r = $('btn-opt').getBoundingClientRect();
            d.style.top=r.bottom+8+'px'; d.style.right='12px'; d.style.display='block';

            $('m-fs').onclick=()=>{ d.style.display='none'; triggerFullscreen(); };
            $('m-new').onclick=()=>{ window.open(cur.url,'_blank'); d.style.display='none'; };
            $('m-cp').onclick=()=>{ cp(cur.url); d.style.display='none'; };
            $('m-ddrop').onclick=()=>d.style.display='none';
            $('m-qs').onclick=async ()=>{
                d.style.display='none';
                if(!cur||cur.type!=='M3U8'){toast('Chỉ hỗ trợ HLS');return;}
                toast('⏳ Parse M3U8...');
                const qualities = await parseM3U8Quality(cur.url);
                if(!qualities||!qualities.length){toast('Không có multi-quality');return;}

                const dd=$('u-drop');
                dd.innerHTML='<div style="padding:10px 16px;color:#555;font-size:11px;font-weight:600;border-bottom:1px solid #333">CHẤT LƯỢNG</div>'+
                    qualities.map(q=>`<div class="qs-item" data-url="${q.url}"><span class="qs-label">📺 ${q.label}</span><span class="qs-bw">${(q.bandwidth/1000000).toFixed(1)} Mbps</span></div>`).join('');
                dd.style.display='block';
                dd.querySelectorAll('.qs-item').forEach(qi=>qi.onclick=()=>{
                    $('u-vid').src=qi.dataset.url; dd.style.display='none';
                    toast('▶ '+qi.querySelector('.qs-label').textContent);
                });
            };
        };

        // ── FAB & EVENTS ──
        $('u-fab').onclick=()=>{
            if($('u-panel').classList.contains('on')){
                $('u-panel').classList.remove('on'); $('u-bd').classList.remove('on');
            } else {
                scan(document,'main'); scanPerf(); renderPanel();
                $('u-panel').classList.add('on'); $('u-bd').classList.add('on');
            }
        };

        $('btn-scan').onclick=()=>{ scan(document,'deep'); scanPerf(); renderPanel(); toast('✅ '+urls.size+' media, '+magnets.size+' magnets'); };
        $('btn-clr').onclick=()=>{ urls.clear(); magnets.clear(); updateBadge(); renderPanel(); toast('🗑 Đã xóa'); };
        $('btn-cls').onclick=()=>{
            $('u-vid').pause(); $('u-vid').src='';
            $('u-prev').classList.remove('on'); $('u-bd').classList.remove('on');
            if(screen.orientation&&screen.orientation.unlock) screen.orientation.unlock();
        };

        $('u-bd').onclick=(e)=>{
            if($('u-drop').style.display==='block'){ $('u-drop').style.display='none'; return; }
            if($('u-cmd').classList.contains('on')){ $('u-cmd').classList.remove('on'); return; }
            $('u-panel').classList.remove('on');
            $('u-prev').classList.remove('on');
            $('u-bd').classList.remove('on');
            $('u-vid').pause();
        };

        document.addEventListener('click', (e) => {
            const d = $('u-drop');
            if(d.style.display==='block'&&!d.contains(e.target)&&e.target.id!=='btn-opt')
                d.style.display='none';
        });
    }

    // ══════════════════════════════════════════
    // AUTO START
    // ══════════════════════════════════════════
    setInterval(scanPerf, 3000);
    setTimeout(()=>{ scan(document,'auto'); updateBadge(); }, 2000);

    if (document.body) initUI();
    else document.addEventListener('DOMContentLoaded', initUI);

})();