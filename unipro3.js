// ==UserScript==
// @name         Universal Media Player v23 - Full TorrServer Flow
// @namespace    http://tampermonkey.net/
// @version      23.0
// @description  Media Player + TorrServer Add Torrent + Browse + Stream
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
    const STORAGE_KEY = 'ump_history';
    const TORR_KEY = 'ump_torrserver_url';

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

    const patterns = [
        { re: /https?:\/\/[^\s"'<>()\\\]]+\.m3u8[^\s"'<>()\\\]]*/gi, type: 'M3U8', priority: 1 },
        { re: /https?:\/\/[^\s"'<>()\\\]]+\.mpd[^\s"'<>()\\\]]*/gi,  type: 'MPD',  priority: 2 },
        { re: /https?:\/\/[^\s"'<>()\\\]]+\.mp4[^\s"'<>()\\\]]*/gi,  type: 'MP4',  priority: 3 },
        { re: /https?:\/\/[^\s"'<>()\\\]]+\.webm[^\s"'<>()\\\]]*/gi, type: 'WEBM', priority: 4 },
        { re: /https?:\/\/[^\s"'<>()\\\]]+\.mkv[^\s"'<>()\\\]]*/gi,  type: 'MKV',  priority: 5 },
        { re: /https?:\/\/[^\s"'<>()\\\]]+\.flv[^\s"'<>()\\\]]*/gi,  type: 'FLV',  priority: 6 },
        { re: /https?:\/\/[^\s"'<>()\\\]]+\.ts[^\s"'<>()\\\]]*/gi,   type: 'TS',   priority: 8 },
    ];

    const MAGNET_RE = /magnet:\?xt=urn:btih:[a-fA-F0-9]{32,40}[^\s"'<>)\]]*/gi;
    const TORRENT_RE = /https?:\/\/[^\s"'<>()\\\]]+\.torrent[^\s"'<>()\\\]]*/gi;

    const IFRAME_PLAYER_RE = [
        /https?:\/\/[^\s"'<>]+\/(v|embed|e|vv|jm|t|watch|player)\/[a-zA-Z0-9_\-]{6,}/gi,
        /https?:\/\/(?:videplay|streamvid|surrit|doodstream|mixdrop|fembed|filemoon|voe)[^\s"'<>]*/gi,
    ];

    const REF = location.href;
    const UA = 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36';

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

    function findUrls(text, source) {
        if (!text || typeof text !== 'string') return;
        patterns.forEach(p => {
            const m = text.match(p.re);
            if (m) m.forEach(u => addUrl(u, p.type, source, p.priority));
        });
        const magMatches = text.match(MAGNET_RE);
        if (magMatches) magMatches.forEach(m => addMagnet(m, source));
        const torMatches = text.match(TORRENT_RE);
        if (torMatches) torMatches.forEach(u => addUrl(u, 'TORRENT', source, 10));
        IFRAME_PLAYER_RE.forEach(re => {
            const m = text.match(re);
            if (m) m.forEach(u => { u = cleanUrl(u); addUrl(u, 'IFRAME', source, 99); });
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
                if (f.src) addUrl(f.src, 'IFRAME', src+':if', 99);
                try { if (f.contentDocument) scan(f.contentDocument, src+':if'+i); } catch(e) {}
            });
            doc.querySelectorAll('a[href]').forEach(a => {
                const href = a.href || '';
                if (href.startsWith('magnet:')) addMagnet(href, src+':link');
                else if (/\.torrent$/i.test(href)) addUrl(href, 'TORRENT', src+':link', 10);
            });
            doc.querySelectorAll('script:not([src])').forEach(s => findUrls(s.textContent, src+':js'));
            findUrls(doc.documentElement.outerHTML, src+':html');
        } catch(e) {}
    }

    const _fetch = window.fetch;
    const _xhrOpen = XMLHttpRequest.prototype.open;
    window.fetch = function(...a) {
        try { const u = typeof a[0]==='string' ? a[0] : (a[0]&&a[0].url)||''; if (u) findUrls(u, 'fetch'); } catch(e) {}
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
                else if (!/\.(js|css|woff|ttf|png|jpg|gif|svg|ico|webp)(\?|$)/i.test(name)) findUrls(name, 'perf');
            });
        } catch(e) {}
    }

    let updateBadge = () => {};

    // ══════════════════════════════════════════
    // TORRSERVER API - FULL FLOW
    // ══════════════════════════════════════════

    /**
     * Thêm torrent vào TorrServer (magnet hoặc torrent file/url)
     * POST /torrent/add
     */
    async function torrAddTorrent(source) {
        const base = torrServerUrl.replace(/\/$/, '');
        let body;

        if (source.startsWith('magnet:')) {
            body = JSON.stringify({
                link: source,
                save: true,
                title: '',
                poster: ''
            });
        } else {
            body = JSON.stringify({
                link: source,
                save: true,
                title: '',
                poster: ''
            });
        }

        try {
            const res = await fetch(`${base}/torrent/add`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: body
            });
            if (!res.ok) throw new Error('HTTP ' + res.status);
            const data = await res.json();
            return { success: true, data };
        } catch(e) {
            // Nếu /torrent/add không có, thử stream trực tiếp
            console.error('TorrServer /torrent/add failed:', e);
            return { success: false, error: e.message };
        }
    }

    /**
     * Lấy danh sách torrent đang có trong TorrServer
     * GET /torrents
     */
    async function torrListTorrents() {
        const base = torrServerUrl.replace(/\/$/, '');
        try {
            const res = await fetch(`${base}/torrents`);
            if (!res.ok) throw new Error('HTTP ' + res.status);
            const data = await res.json();
            return { success: true, torrents: Array.isArray(data) ? data : [] };
        } catch(e) {
            return { success: false, error: e.message, torrents: [] };
        }
    }

    /**
     * Lấy thông tin chi tiết của 1 torrent (danh sách file)
     * GET /torrent?hash=HASH
     * hoặc GET /stream?stat&link=HASH&index=N
     */
    async function torrGetFiles(hash) {
        const base = torrServerUrl.replace(/\/$/, '');
        try {
            // Thử endpoint torrent info
            const res = await fetch(`${base}/torrent?hash=${hash}`);
            if (!res.ok) throw new Error('HTTP ' + res.status);
            const data = await res.json();
            
            if (data && data.file_stats) {
                return { success: true, files: data.file_stats.map((f, i) => ({
                    index: i,
                    name: f.name || f.path || `File ${i}`,
                    size: f.size || f.length || 0,
                    path: f.path || f.name || `File ${i}`
                })) };
            }
            
            // Thử parse từ stat
            if (data && data.stat) {
                const statData = data.stat;
                const files = [];
                if (Array.isArray(statData)) {
                    statData.forEach((f, i) => {
                        files.push({ index: i, name: f.name || f.path || `File ${i}`, size: f.size || 0, path: f.path || '' });
                    });
                }
                return { success: true, files };
            }
            
            return { success: false, error: 'No file info', files: [] };
        } catch(e) {
            // Thử endpoint khác: /stream?stat&link=HASH
            try {
                const res2 = await fetch(`${base}/stream?stat&link=${hash}`);
                if (res2.ok) {
                    const data2 = await res2.json();
                    if (data2 && Array.isArray(data2)) {
                        return {
                            success: true,
                            files: data2.map((f, i) => ({
                                index: i,
                                name: f.name || f.path || `File ${i}`,
                                size: f.size || 0,
                                path: f.path || ''
                            }))
                        };
                    }
                }
            } catch(e2) {}
            
            return { success: false, error: e.message, files: [] };
        }
    }

    /**
     * Tạo stream URL cho 1 file trong torrent
     * GET /stream?link=HASH&index=N&play
     */
    function torrGetStreamUrl(hash, index, filename) {
        const base = torrServerUrl.replace(/\/$/, '');
        // Format: /stream/filename?link=HASH&index=N&play
        const encodedName = encodeURIComponent(filename || 'stream');
        return `${base}/stream/${encodedName}?link=${hash}&index=${index}&play`;
    }

    /**
     * Test kết nối TorrServer
     */
    async function torrTestConnection(url) {
        try {
            const res = await fetch(url + '/echo', {
                method: 'GET',
                mode: 'cors',
                signal: AbortSignal.timeout(5000)
            });
            return res.ok;
        } catch(e) {
            try {
                const res2 = await fetch(url + '/torrents', {
                    method: 'GET',
                    mode: 'cors',
                    signal: AbortSignal.timeout(3000)
                });
                return res2.ok;
            } catch(e2) {
                return false;
            }
        }
    }

    // ══════════════════════════════════════════
    // SMART DOWNLOAD SUGGESTIONS
    // ══════════════════════════════════════════
    function analyzeMedia(url) {
        const info = { url, type: 'unknown', format: 'unknown', tools: [], commands: [], tips: [] };
        if (/\.m3u8/i.test(url))       { info.type = 'HLS Stream';    info.format = 'm3u8'; }
        else if (/\.mpd/i.test(url))   { info.type = 'DASH Stream';   info.format = 'mpd'; }
        else if (/\.mp4/i.test(url))   { info.type = 'MP4 Video';     info.format = 'mp4'; }
        else if (/\.webm/i.test(url))  { info.type = 'WebM Video';    info.format = 'webm'; }
        else if (/\.mkv/i.test(url))   { info.type = 'MKV Video';     info.format = 'mkv'; }
        else if (/\.ts/i.test(url))    { info.type = 'TS Stream';     info.format = 'ts'; }
        else if (/\.torrent$/i.test(url)) { info.type = 'Torrent File'; info.format = 'torrent'; }
        else if (/iframe|embed/i.test(url)) { info.type = 'Iframe Player'; info.format = 'html'; }

        if (info.format === 'm3u8' || info.format === 'mpd') {
            info.tools = ['yt-dlp', 'ffmpeg', 'VLC', 'Termux'];
            info.commands = [
                { tool: 'yt-dlp',  cmd: `yt-dlp --referer "${REF}" "${url}"`, desc: 'Tải chất lượng cao nhất' },
                { tool: 'yt-dlp',  cmd: `yt-dlp --referer "${REF}" --user-agent "${UA}" -f "best" "${url}"`, desc: 'Bypass với header' },
                { tool: 'ffmpeg',  cmd: `ffmpeg -referer "${REF}" -user_agent "${UA}" -i "${url}" -c copy output.ts`, desc: 'Copy stream nhanh' },
                { tool: 'termux',  cmd: `pkg install python ffmpeg -y && pip install yt-dlp && yt-dlp --referer "${REF}" "${url}"`, desc: 'Cài trên Android' },
            ];
        } else if (['mp4','webm','mkv','flv','ts'].includes(info.format)) {
            info.tools = ['aria2', 'wget', 'curl', 'IDM'];
            info.commands = [
                { tool: 'aria2', cmd: `aria2c --referer="${REF}" --user-agent="${UA}" -x 16 "${url}"`, desc: 'Tải đa luồng' },
                { tool: 'wget',  cmd: `wget --referer="${REF}" --user-agent="${UA}" "${url}"`, desc: 'Tải đơn giản' },
                { tool: 'curl',  cmd: `curl -L --referer "${REF}" -A "${UA}" -o video.${info.format} "${url}"`, desc: 'Tải với curl' },
            ];
        } else if (info.format === 'torrent') {
            info.tools = ['TorrServer', 'qBittorrent'];
            info.commands = [
                { tool: 'torrserver', cmd: `# Gửi lên TorrServer:\ncurl -X POST ${torrServerUrl}/torrent/add -H "Content-Type: application/json" -d '{"link":"${url}","save":true}'`, desc: 'Add vào TorrServer' },
            ];
        }
        return info;
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
        .hbtn.rd { background:#c62828; }

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
        .lb-TORRENT{background:#d84315;} .lb-other{background:#444;}
        .li-name { color:#fff; font-size:13px; font-weight:600; flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .li-src { color:#555; font-size:10px; margin-bottom:4px; }
        .li-url { color:#4fc3f7; font-size:10px; font-family:monospace; word-break:break-all; background:#000; padding:8px; border-radius:6px; line-height:1.4; border:1px solid #1a1a1a; }
        .li-acts { display:flex; gap:6px; margin-top:8px; flex-wrap:wrap; }
        .li-act { border:none; border-radius:6px; padding:6px 12px; font-size:10px; font-weight:600; cursor:pointer; color:white; }
        .li-act.gr { background:#2e7d32; }
        .li-act.or { background:#e65100; }
        .li-act.bl { background:#1565c0; }

        /* Magnet Items */
        .mag-item { padding:12px 14px; border-bottom:1px solid #181818; }
        .mag-hash { color:#ff9800; font-size:12px; font-family:monospace; font-weight:600; margin-bottom:4px; word-break:break-all; }
        .mag-link { color:#4fc3f7; font-size:10px; font-family:monospace; word-break:break-all; background:#000; padding:6px; border-radius:5px; margin-bottom:4px; }
        .mag-src { color:#555; font-size:10px; margin-bottom:8px; }
        .mag-acts { display:flex; gap:6px; flex-wrap:wrap; }
        .mag-act { border:none; border-radius:6px; padding:8px 14px; font-size:11px; font-weight:600; cursor:pointer; color:white; }
        .mag-act.gr { background:#2e7d32; }
        .mag-act.or { background:#e65100; }
        .mag-act.bl { background:#1565c0; }
        .mag-act.rd { background:#c62828; }

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

        /* Torrent List Item */
        .tli {
            padding:12px 14px; border-bottom:1px solid #181818; cursor:pointer;
            transition:background .2s;
        }
        .tli:active { background:#1a1a1a; }
        .tli-header { display:flex; align-items:center; gap:8px; margin-bottom:6px; }
        .tli-title { color:#fff; font-size:13px; font-weight:600; flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .tli-hash { color:#ff9800; font-size:10px; font-family:monospace; }
        .tli-info { color:#666; font-size:10px; }
        .tli-acts { display:flex; gap:6px; margin-top:8px; flex-wrap:wrap; }
        .tli-act { border:none; border-radius:5px; padding:5px 10px; font-size:10px; font-weight:600; cursor:pointer; color:white; }
        .tli-act.gr { background:#2e7d32; }
        .tli-act.or { background:#e65100; }
        .tli-act.rd { background:#c62828; }
        .tli-act.bl { background:#1565c0; }

        /* File List */
        .fli {
            padding:10px 14px; border-bottom:1px solid #181818; cursor:pointer;
            display:flex; align-items:center; gap:8px; transition:background .2s;
        }
        .fli:active { background:#1a1a1a; }
        .fli:hover { background:#1a1a1a; }
        .fli-name { color:#fff; font-size:12px; flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .fli-size { color:#888; font-size:10px; font-family:monospace; white-space:nowrap; }
        .fli-play { background:#2e7d32; border:none; color:white; padding:4px 12px; border-radius:5px; cursor:pointer; font-size:10px; font-weight:600; white-space:nowrap; }

        /* Section Header */
        .sec-hdr {
            padding:10px 14px; font-size:11px; font-weight:700;
            border-bottom:1px solid #222;
        }
        .sec-hdr.magnet { background:#1a0a00; color:#ff9800; }
        .sec-hdr.torrent { background:#0a1a00; color:#4caf50; }
        .sec-hdr.files { background:#000a1a; color:#4fc3f7; }

        /* Loading */
        .loading { text-align:center; padding:20px; color:#666; font-size:12px; }
        .loading span { animation:pulse 1s infinite; }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }

        /* Preview Player */
        #u-prev {
            position:fixed; bottom:0; left:0; right:0;
            background:#111; z-index:2147483647;
            display:none; flex-direction:column;
            border-radius:20px 20px 0 0;
            box-shadow:0 -10px 50px rgba(0,0,0,.8);
            max-height:80vh;
        }
        #u-prev.on { display:flex; }
        #u-prev-bar { display:flex; align-items:center; padding:12px 14px; gap:8px; border-bottom:1px solid #222; flex-shrink:0; }
        #u-prev-title { flex:1; color:#fff; font-size:13px; font-weight:700; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        #u-vid-wrap { background:#000; width:100%; max-height:50vh; overflow:hidden; display:flex; align-items:center; justify-content:center; flex-shrink:0; }
        #u-vid { width:100%; max-height:50vh; object-fit:contain; transition:transform .3s; }
        .p-acts { display:flex; gap:6px; padding:12px 14px; overflow-x:auto; background:#161616; flex-shrink:0; }
        .pact { border:none; border-radius:8px; padding:10px 14px; color:white; font-weight:600; font-size:11px; white-space:nowrap; cursor:pointer; }
        .pact:active { opacity:.7; }
        .pact.bl{background:#1565c0} .pact.gr{background:#2e7d32} .pact.pu{background:#6a1b9a}
        .pact.te{background:#00796b} .pact.gy{background:#444} .pact.rd{background:#c62828}
        .pact.or{background:#e65100}

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

        /* Toast */
        #u-toast {
            position:fixed; bottom:90px; left:50%; transform:translateX(-50%);
            background:#323232; color:white; padding:10px 22px; border-radius:25px;
            font-size:13px; font-weight:600; z-index:2147483648; display:none;
            box-shadow:0 5px 15px rgba(0,0,0,.5); white-space:nowrap;
            max-width:90vw; overflow:hidden; text-overflow:ellipsis;
        }

        /* Add Torrent Modal */
        #u-add-modal {
            position:fixed; top:50%; left:50%; transform:translate(-50%,-50%);
            background:#111; border-radius:16px; z-index:2147483649;
            width:94%; max-width:450px; padding:18px; display:none;
            box-shadow:0 15px 50px rgba(0,0,0,.9); border:1px solid #333;
            max-height:80vh; overflow-y:auto;
        }
        #u-add-modal.on { display:block; }
        .add-input {
            width:100%; background:#0a0a0a; border:1px solid #333;
            border-radius:8px; padding:12px; color:#fff;
            font-size:12px; font-family:monospace; box-sizing:border-box;
            outline:none; margin-bottom:10px;
        }
        .add-input:focus { border-color:#e53935; }
        .add-status { padding:10px; border-radius:8px; margin-top:10px; font-size:11px; font-weight:600; display:none; }
        .add-status.ok { background:#1b5e20; color:#a5d6a7; display:block; }
        .add-status.err { background:#b71c1c; color:#ef9a9a; display:block; }
        .add-status.wait { background:#333; color:#aaa; display:block; }

        /* Progress bar */
        .progress-bar {
            width:100%; height:4px; background:#333; border-radius:2px;
            margin-top:8px; overflow:hidden; display:none;
        }
        .progress-bar.on { display:block; }
        .progress-fill {
            height:100%; background:#4caf50; border-radius:2px;
            transition:width .3s; width:0%;
        }
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

            <div id="u-add-modal">
                <div style="color:#fff;font-size:14px;font-weight:700;margin-bottom:14px">📡 Thêm vào TorrServer</div>
                <div style="color:#888;font-size:11px;margin-bottom:8px">Dán magnet link hoặc URL torrent:</div>
                <input class="add-input" id="add-torrent-input" placeholder="magnet:?xt=urn:btih:... hoặc https://...torrent">
                <div style="display:flex;gap:8px">
                    <button class="hbtn org" id="add-torrent-btn" style="flex:1">➕ Thêm Torrent</button>
                    <button class="hbtn gray" id="add-close-btn">✕</button>
                </div>
                <div class="add-status wait" id="add-status">
                    <span id="add-status-text">Sẵn sàng</span>
                </div>
                <div class="progress-bar" id="add-progress">
                    <div class="progress-fill" id="add-progress-fill"></div>
                </div>
            </div>

            <div id="u-toast"></div>
        `);

        initLogic();
    }

    function initLogic() {
        const $ = id => document.getElementById(id);
        let cur = null, rot = 0, zoom = 1;
        let currentPanelTab = 'streams';
        let currentTorrHash = null;
        let currentTorrFiles = [];

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

        function fmtSize(bytes) {
            if (!bytes || bytes === 0) return '?';
            if (bytes < 1024) return bytes + ' B';
            if (bytes < 1048576) return (bytes/1024).toFixed(1) + ' KB';
            if (bytes < 1073741824) return (bytes/1048576).toFixed(1) + ' MB';
            return (bytes/1073741824).toFixed(2) + ' GB';
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
            if (currentPanelTab === 'streams') renderStreams();
            else if (currentPanelTab === 'torrents') renderTorrents();
            else if (currentPanelTab === 'torrserver') renderTorrServer();
            else if (currentPanelTab === 'download') renderDownload();
        }

        // ══════════════════════════════
        // TAB: STREAMS
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
                const bc = 'lb-' + (['M3U8','MP4','IFRAME','WEBM','MKV','FLV','TS'].includes(item.type) ? item.type : 'other');
                const div = document.createElement('div');
                div.className = 'li';
                div.innerHTML = `
                    <div class="li-top">
                        <span class="li-badge ${bc}">${item.type}</span>
                        <span class="li-name">${fname(item.url)}</span>
                    </div>
                    <div class="li-src">${item.source}</div>
                    <div class="li-url">${item.url}</div>
                    <div class="li-acts">
                        <button class="li-act gr" data-action="play">▶️ Play</button>
                        <button class="li-act bl" data-action="copy">📋 Copy</button>
                    </div>`;
                
                div.querySelector('[data-action="play"]').onclick = (e) => {
                    e.stopPropagation();
                    const it = [...urls.values()].find(v => v.url === item.url);
                    if (it && it.type === 'IFRAME') { window.open(it.url,'_blank'); toast('🚀 Mở iframe'); }
                    else openPrev(it || item);
                };
                div.querySelector('[data-action="copy"]').onclick = (e) => {
                    e.stopPropagation(); cp(item.url);
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
                    <div class="sec-hdr torrent">📁 TORRENT FILES (${torrentFiles.length})</div>`);
                torrentFiles.forEach(item => {
                    const div = document.createElement('div');
                    div.className = 'mag-item';
                    div.innerHTML = `
                        <div style="color:#4fc3f7;font-size:12px;font-family:monospace;word-break:break-all;background:#000;padding:8px;border-radius:5px;margin-bottom:4px">${item.url}</div>
                        <div class="mag-src">📌 ${item.source}</div>
                        <div class="mag-acts">
                            <button class="mag-act or" data-action="add-ts">📡 Thêm vào TorrServer</button>
                            <button class="mag-act bl" data-action="copy">📋 Copy</button>
                        </div>`;
                    div.querySelector('[data-action="add-ts"]').onclick = (e) => {
                        e.stopPropagation();
                        showAddTorrentModal(item.url);
                    };
                    div.querySelector('[data-action="copy"]').onclick = (e) => {
                        e.stopPropagation(); cp(item.url);
                    };
                    pb.appendChild(div);
                });
            }

            // Magnet links
            if (magnets.size) {
                pb.insertAdjacentHTML('beforeend', `
                    <div class="sec-hdr magnet">🧲 MAGNET LINKS (${magnets.size})</div>`);

                [...magnets.values()].forEach(mag => {
                    const div = document.createElement('div');
                    div.className = 'mag-item';
                    div.innerHTML = `
                        <div class="mag-hash">🧲 ${mag.hash.substring(0, 20)}...${mag.hash.substring(mag.hash.length-10)}</div>
                        <div class="mag-link">${mag.magnet.substring(0, 80)}...</div>
                        <div class="mag-src">📌 ${mag.source}</div>
                        <div class="mag-acts">
                            <button class="mag-act or" data-action="add-ts">📡 Thêm vào TorrServer</button>
                            <button class="mag-act gr" data-action="browse">📂 Duyệt file</button>
                            <button class="mag-act bl" data-action="copy">📋 Copy</button>
                        </div>`;
                    
                    div.querySelector('[data-action="add-ts"]').onclick = (e) => {
                        e.stopPropagation();
                        showAddTorrentModal(mag.magnet);
                    };
                    div.querySelector('[data-action="browse"]').onclick = (e) => {
                        e.stopPropagation();
                        browseTorrentFiles(mag.hash, mag.magnet);
                    };
                    div.querySelector('[data-action="copy"]').onclick = (e) => {
                        e.stopPropagation(); cp(mag.magnet);
                    };
                    pb.appendChild(div);
                });
            }

            if (!torrentFiles.length && !magnets.size) {
                pb.innerHTML = `<div style="color:#555;text-align:center;padding:40px 20px;font-size:13px">
                    Chưa tìm thấy magnet/torrent.<br><br>
                    🧲 Script tự động phát hiện magnet link trên trang</div>`;
            }
        }

        // ══════════════════════════════
        // SHOW ADD TORRENT MODAL
        // ══════════════════════════════
        function showAddTorrentModal(source) {
            const modal = $('u-add-modal');
            modal.classList.add('on');
            $('u-bd').classList.add('on');
            $('add-torrent-input').value = source || '';
            $('add-status').className = 'add-status wait';
            $('add-status-text').textContent = 'Sẵn sàng';
            $('add-progress').classList.remove('on');
            $('add-progress-fill').style.width = '0%';
        }

        $('add-close-btn').onclick = () => {
            $('u-add-modal').classList.remove('on');
            if (!$('u-prev').classList.contains('on') && !$('u-panel').classList.contains('on')) {
                $('u-bd').classList.remove('on');
            }
        };

        $('add-torrent-btn').onclick = async () => {
            const input = $('add-torrent-input').value.trim();
            if (!input) {
                toast('❌ Nhập magnet hoặc URL torrent!', '#c62828');
                return;
            }

            const statusEl = $('add-status');
            const statusText = $('add-status-text');
            const progressBar = $('add-progress');
            const progressFill = $('add-progress-fill');

            statusEl.className = 'add-status wait';
            statusText.textContent = '⏳ Đang thêm vào TorrServer...';
            progressBar.classList.add('on');
            progressFill.style.width = '30%';

            const result = await torrAddTorrent(input);

            if (result.success) {
                progressFill.style.width = '100%';
                statusEl.className = 'add-status ok';
                statusText.textContent = '✅ Đã thêm thành công! Chuyển sang tab TorrServer...';
                
                // Extract hash từ magnet hoặc response
                let hash = '';
                if (input.startsWith('magnet:')) {
                    const m = input.match(/btih:([a-fA-F0-9]{32,40})/i);
                    if (m) hash = m[1].toLowerCase();
                }
                if (result.data && result.data.hash) hash = result.data.hash;

                toast('✅ Đã thêm vào TorrServer!', '#2e7d32');
                
                setTimeout(() => {
                    $('u-add-modal').classList.remove('on');
                    // Chuyển sang tab TorrServer
                    document.querySelectorAll('.utab').forEach(t => t.classList.remove('on'));
                    document.querySelector('[data-tab="torrserver"]').classList.add('on');
                    currentPanelTab = 'torrserver';
                    renderTorrServer();
                }, 1500);
            } else {
                progressFill.style.width = '100%';
                statusEl.className = 'add-status err';
                statusText.textContent = '❌ Lỗi: ' + (result.error || 'Không thể kết nối TorrServer');
                
                // Thử stream trực tiếp nếu add failed
                if (input.startsWith('magnet:')) {
                    const hashMatch = input.match(/btih:([a-fA-F0-9]{32,40})/i);
                    if (hashMatch) {
                        const hash = hashMatch[1].toLowerCase();
                        const streamUrl = `${torrServerUrl.replace(/\/$/, '')}/stream/magnet:?xt=urn:btih:${hash}`;
                        statusText.textContent += '\n🔄 Thử stream trực tiếp...';
                        
                        setTimeout(() => {
                            playDirectStream(streamUrl, 'Torrent Stream');
                            $('u-add-modal').classList.remove('on');
                        }, 1000);
                    }
                }
            }
        };

        // ══════════════════════════════
        // BROWSE TORRENT FILES
        // ══════════════════════════════
        async function browseTorrentFiles(hash, magnet) {
            currentTorrHash = hash;
            const pb = $('u-pb');
            pb.innerHTML = `
                <div class="sec-hdr files">📂 Đang tải danh sách file...</div>
                <div class="loading"><span>⏳</span> Đang lấy thông tin từ TorrServer...</div>`;
            
            // Chuyển sang tab TorrServer
            document.querySelectorAll('.utab').forEach(t => t.classList.remove('on'));
            document.querySelector('[data-tab="torrserver"]').classList.add('on');
            currentPanelTab = 'torrserver';

            const result = await torrGetFiles(hash);

            if (result.success && result.files.length > 0) {
                currentTorrFiles = result.files;
                renderFileList(hash, result.files, magnet);
            } else {
                pb.innerHTML = `
                    <div style="padding:20px;text-align:center;color:#ef5350;font-size:12px">
                        ❌ Không lấy được danh sách file.<br>
                        <span style="color:#888;font-size:10px">TorrServer có thể chưa tải xong metadata.</span>
                    </div>
                    <div style="text-align:center;padding:10px">
                        <button class="hbtn org" onclick="document.querySelector('[data-tab=torrents]').click()">← Quay lại Torrents</button>
                    </div>`;
            }
        }

        function renderFileList(hash, files, magnet) {
            const pb = $('u-pb');
            pb.innerHTML = `
                <div class="sec-hdr files">
                    📂 ${files.length} files trong torrent
                    <span style="font-size:9px;color:#666;font-weight:normal;display:block;margin-top:2px">Hash: ${hash.substring(0,16)}...</span>
                </div>`;

            files.forEach((file, i) => {
                const div = document.createElement('div');
                div.className = 'fli';
                div.innerHTML = `
                    <span style="color:#888;font-size:10px;font-family:monospace;min-width:24px">#${i}</span>
                    <span class="fli-name">${file.name}</span>
                    <span class="fli-size">${fmtSize(file.size)}</span>
                    <button class="fli-play">▶️</button>`;
                
                div.querySelector('.fli-play').onclick = (e) => {
                    e.stopPropagation();
                    const streamUrl = torrGetStreamUrl(hash, i, file.name);
                    playTorrStream(streamUrl, file.name, hash, i);
                };
                
                div.onclick = () => {
                    const streamUrl = torrGetStreamUrl(hash, i, file.name);
                    playTorrStream(streamUrl, file.name, hash, i);
                };
                
                pb.appendChild(div);
            });

            // Back button
            const backDiv = document.createElement('div');
            backDiv.style.cssText = 'padding:12px 14px;text-align:center;border-top:1px solid #222;';
            backDiv.innerHTML = '<button class="hbtn gray" style="width:100%">← Quay lại TorrServer</button>';
            backDiv.querySelector('button').onclick = () => renderTorrServer();
            pb.appendChild(backDiv);
        }

        // ══════════════════════════════
        // PLAY TORR SERVER STREAM
        // ══════════════════════════════
        function playTorrStream(streamUrl, filename, hash, index) {
            toast(`📡 Stream: ${filename}`, '#e65100');
            
            cur = { url: streamUrl, type: 'TORRSERVER', source: 'torrserver', priority: 1, ts: Date.now() };
            rot = 0; zoom = 1;

            const vid = $('u-vid');
            vid.style.transform = 'none';
            $('u-prev-title').textContent = filename;
            
            vid.src = '';
            setTimeout(() => {
                vid.src = streamUrl;
                vid.load();
            }, 100);
            
            vid.onerror = () => toast('❌ Stream failed! Kiểm tra TorrServer', '#c62828');
            vid.onloadeddata = () => toast('✅ Stream OK!', '#2e7d32');

            $('u-p-acts').innerHTML = `
                <button class="pact bl" id="pc-cp">📋 Copy URL</button>
                <button class="pact rd" id="pc-fs">⛶ FullScreen</button>
                <button class="pact gr" id="pc-vlc">📺 VLC</button>
                <button class="pact te" id="pc-rot">⟳ Xoay</button>
                <button class="pact gy" id="pc-zm">🔍 1x</button>`;

            $('pc-cp').onclick = () => cp(streamUrl);
            $('pc-fs').onclick = triggerFullscreen;
            $('pc-vlc').onclick = () => window.location.href = 'vlc://' + streamUrl;
            $('pc-rot').onclick = () => { rot=(rot+90)%360; vid.style.transform=`rotate(${rot}deg) scale(${zoom})`; };
            $('pc-zm').onclick = (e) => {
                const lv=[1,1.25,1.5,2,0.75];
                zoom=lv[(lv.indexOf(zoom)+1)%lv.length];
                e.target.textContent=`🔍 ${zoom}x`;
                vid.style.transform=`rotate(${rot}deg) scale(${zoom})`;
            };

            $('u-prev').classList.add('on');
            $('u-bd').classList.add('on');
            $('u-panel').classList.remove('on');
        }

        function playDirectStream(streamUrl, title) {
            cur = { url: streamUrl, type: 'TORRSERVER', source: 'torrserver', priority: 1, ts: Date.now() };
            rot = 0; zoom = 1;

            const vid = $('u-vid');
            vid.style.transform = 'none';
            $('u-prev-title').textContent = title || 'Stream';
            
            vid.src = '';
            setTimeout(() => { vid.src = streamUrl; vid.load(); }, 100);
            vid.onerror = () => toast('❌ Stream failed!', '#c62828');
            vid.onloadeddata = () => toast('✅ Stream OK!', '#2e7d32');

            $('u-p-acts').innerHTML = `
                <button class="pact bl" id="pc-cp">📋 Copy</button>
                <button class="pact rd" id="pc-fs">⛶ FullScreen</button>
                <button class="pact gr" id="pc-vlc">📺 VLC</button>
                <button class="pact te" id="pc-rot">⟳ Xoay</button>
                <button class="pact gy" id="pc-zm">🔍 1x</button>`;

            $('pc-cp').onclick = () => cp(streamUrl);
            $('pc-fs').onclick = triggerFullscreen;
            $('pc-vlc').onclick = () => window.location.href = 'vlc://' + streamUrl;
            $('pc-rot').onclick = () => { rot=(rot+90)%360; vid.style.transform=`rotate(${rot}deg) scale(${zoom})`; };
            $('pc-zm').onclick = (e) => {
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
        // TAB: TORRSERVER
        // ══════════════════════════════
        async function renderTorrServer() {
            const pb = $('u-pb');
            
            // Nếu đang browse files thì không render lại
            if (currentTorrFiles.length > 0 && currentTorrHash) {
                renderFileList(currentTorrHash, currentTorrFiles, '');
                return;
            }

            pb.innerHTML = `
                <div class="torr-config">
                    <div class="torr-label">📡 URL TorrServer</div>
                    <input class="torr-input" id="torr-url-input" type="text"
                           value="${torrServerUrl}"
                           placeholder="http://127.0.0.1:8090">
                    <div style="display:flex;gap:8px;margin-top:10px">
                        <button class="hbtn blue" id="torr-save" style="flex:1">💾 Lưu</button>
                        <button class="hbtn grn" id="torr-test" style="flex:1">🔍 Test</button>
                    </div>
                    <div class="torr-status wait" id="torr-status">
                        <span class="torr-dot"></span>
                        <span id="torr-status-text">Chưa kiểm tra</span>
                    </div>
                </div>

                <div style="padding:14px;border-bottom:1px solid #181818">
                    <button class="hbtn org" id="torr-add-manual" style="width:100%;padding:12px;font-size:12px">
                        ➕ Thêm Torrent/Magnet
                    </button>
                </div>

                <div class="sec-hdr torrent">📋 Torrents trong TorrServer</div>
                <div id="torr-list">
                    <div class="loading"><span>⏳</span> Đang tải danh sách...</div>
                </div>

                <div style="padding:14px;border-top:1px solid #181818">
                    <div class="torr-label">📖 Hướng dẫn</div>
                    <div style="color:#aaa;font-size:11px;line-height:1.6">
                        1. <b>Phát hiện magnet</b> trên trang → tab 🧲 Torrent<br>
                        2. <b>Thêm vào TorrServer</b> → TorrServer tải torrent<br>
                        3. <b>Duyệt file</b> trong torrent → chọn file muốn stream<br>
                        4. <b>Play</b> trực tiếp trong player<br><br>
                        <span style="color:#ff9800">💡 Flow: Magnet → Add → Browse Files → Stream</span>
                    </div>
                </div>
            `;

            $('torr-save').onclick = () => {
                const val = $('torr-url-input').value.trim();
                if (!val) { toast('❌ Nhập URL!', '#c62828'); return; }
                torrServerUrl = val.replace(/\/$/, '');
                saveStr(TORR_KEY, torrServerUrl);
                toast('✅ Đã lưu!', '#2e7d32');
            };

            $('torr-test').onclick = async () => {
                const statusEl = $('torr-status');
                const textEl = $('torr-status-text');
                const url = $('torr-url-input').value.trim().replace(/\/$/, '');
                statusEl.className = 'torr-status wait';
                textEl.textContent = 'Đang kết nối...';
                
                const ok = await torrTestConnection(url);
                if (ok) {
                    statusEl.className = 'torr-status ok';
                    textEl.textContent = '✅ TorrServer đang chạy!';
                    torrServerUrl = url;
                    saveStr(TORR_KEY, torrServerUrl);
                } else {
                    statusEl.className = 'torr-status err';
                    textEl.textContent = '❌ Không kết nối được!';
                }
            };

            $('torr-add-manual').onclick = () => showAddTorrentModal('');

            // Load torrent list
            const listResult = await torrListTorrents();
            const listEl = pb.querySelector('#torr-list');
            
            if (listResult.success && listResult.torrents.length > 0) {
                listEl.innerHTML = '';
                listResult.torrents.forEach(t => {
                    const hash = t.hash || t.info_hash || '';
                    const title = t.title || t.name || 'Unknown';
                    const status = t.stat_string || t.status || '?';
                    
                    const div = document.createElement('div');
                    div.className = 'tli';
                    div.innerHTML = `
                        <div class="tli-header">
                            <span class="tli-title">${title}</span>
                        </div>
                        <div class="tli-hash">Hash: ${hash.substring(0, 16)}...</div>
                        <div class="tli-info">Status: ${status}</div>
                        <div class="tli-acts">
                            <button class="tli-act gr" data-action="browse">📂 Duyệt file</button>
                            <button class="tli-act or" data-action="stream">▶️ Stream</button>
                            <button class="tli-act bl" data-action="copy">📋 Copy hash</button>
                        </div>`;
                    
                    div.querySelector('[data-action="browse"]').onclick = (e) => {
                        e.stopPropagation();
                        browseTorrentFiles(hash, '');
                    };
                    div.querySelector('[data-action="stream"]').onclick = (e) => {
                        e.stopPropagation();
                        const streamUrl = `${torrServerUrl.replace(/\/$/, '')}/stream/magnet:?xt=urn:btih:${hash}`;
                        playDirectStream(streamUrl, title || 'Stream');
                    };
                    div.querySelector('[data-action="copy"]').onclick = (e) => {
                        e.stopPropagation(); cp(hash);
                    };
                    
                    listEl.appendChild(div);
                });
            } else {
                listEl.innerHTML = `
                    <div style="color:#666;text-align:center;padding:30px;font-size:12px">
                        Chưa có torrent nào.<br><br>
                        🧲 Thêm magnet từ tab Torrent
                    </div>`;
            }
        }

        // ══════════════════════════════
        // TAB: DOWNLOAD
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
            const info = analyzeMedia(best.url);

            pb.innerHTML = `
                <div class="dl-suggest">
                    <div class="dl-header">
                        <span class="dl-type">${info.type}</span>
                        <span class="dl-format">.${info.format}</span>
                    </div>
                    <div style="color:#4fc3f7;font-size:11px;font-family:monospace;word-break:break-all;background:#000;padding:8px;border-radius:6px;margin-bottom:10px;border:1px solid #1a1a1a">${best.url}</div>
                    <div style="color:#888;font-size:11px;font-weight:600;margin-bottom:8px">🛠 Công cụ:</div>
                    <div class="dl-tools">${info.tools.map(t => `<span class="dl-tool">${t}</span>`).join('')}</div>
                    <div style="color:#888;font-size:11px;font-weight:600;margin-bottom:8px">📋 Lệnh tải:</div>
                    ${info.commands.map(cmd => `
                        <div class="dl-cmd">
                            <div class="dl-cmd-label">
                                <span>${cmd.tool} - ${cmd.desc}</span>
                                <button class="dl-cmd-copy" data-cmd="${cmd.cmd.replace(/"/g, '&quot;')}">📋 Copy</button>
                            </div>
                            <div class="dl-cmd-text">${cmd.cmd}</div>
                        </div>
                    `).join('')}
                    <div class="dl-tips">${info.tips.map(tip => `<div class="dl-tip">💡 ${tip}</div>`).join('')}</div>
                    <button class="hbtn grn" id="btn-open-prev" style="width:100%;margin-top:12px;padding:12px;font-size:12px">▶️ Xem trước</button>
                </div>`;

            pb.querySelectorAll('.dl-cmd-copy').forEach(btn => {
                btn.onclick = () => cp(btn.dataset.cmd);
            });
            pb.querySelector('#btn-open-prev').onclick = () => openPrev(best);
        }

        // ══════════════════════════════
        // FULLSCREEN
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
            const vid = $('u-vid');
            vid.style.transform = 'none';
            $('u-prev-title').textContent = fname(item.url);
            vid.src = '';
            setTimeout(() => { vid.src = item.url; vid.load(); }, 100);
            vid.onerror = () => toast('❌ Không phát được','#c62828');

            $('u-p-acts').innerHTML = `
                <button class="pact bl" id="pc-cp">📋 Copy</button>
                <button class="pact rd" id="pc-fs">⛶ FullScreen</button>
                <button class="pact gr" id="pc-vlc">📺 VLC</button>
                <button class="pact pu" id="pc-ytdl">💻 Tải</button>
                <button class="pact te" id="pc-rot">⟳ Xoay</button>
                <button class="pact gy" id="pc-zm">🔍 1x</button>`;

            $('pc-cp').onclick = () => cp(cur.url);
            $('pc-fs').onclick = triggerFullscreen;
            $('pc-vlc').onclick = () => window.location.href = 'vlc://'+cur.url;
            $('pc-ytdl').onclick = () => openCmd(cur.url);
            $('pc-rot').onclick = () => { rot=(rot+90)%360; vid.style.transform=`rotate(${rot}deg) scale(${zoom})`; };
            $('pc-zm').onclick = (e) => {
                const lv=[1,1.25,1.5,2,0.75];
                zoom=lv[(lv.indexOf(zoom)+1)%lv.length];
                e.target.textContent=`🔍 ${zoom}x`;
                vid.style.transform=`rotate(${rot}deg) scale(${zoom})`;
            };
            $('u-prev').classList.add('on');
            $('u-bd').classList.add('on');
            $('u-panel').classList.remove('on');
        }

        function openCmd(url) {
            const info = analyzeMedia(url);
            $('u-cmd') = $('u-cmd') || (() => {
                const div = document.createElement('div');
                div.id = 'u-cmd';
                div.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:#111;border-radius:16px;z-index:2147483649;width:94%;max-width:500px;padding:18px;display:none;box-shadow:0 15px 50px rgba(0,0,0,.9);border:1px solid #333;max-height:80vh;overflow-y:auto;';
                document.body.appendChild(div);
                return div;
            })();
            
            const cmdEl = $('u-cmd');
            cmdEl.innerHTML = `
                <h4 style="color:#fff;margin:0 0 14px;font-size:14px">💻 Lệnh tải</h4>
                ${info.commands.map(cmd => `
                    <div style="background:#0a0a0a;border:1px solid #222;border-radius:10px;padding:12px;margin-bottom:10px">
                        <div style="color:#888;font-size:10px;font-weight:700;margin-bottom:6px">${cmd.tool} - ${cmd.desc}</div>
                        <div style="display:flex;gap:8px">
                            <textarea style="flex:1;background:transparent;color:#4caf50;border:none;font-family:monospace;font-size:11px;resize:none;outline:none" rows="2" readonly>${cmd.cmd}</textarea>
                            <button style="background:#1565c0;border:none;color:white;border-radius:8px;padding:0 14px;cursor:pointer;font-size:16px" data-cmd="${cmd.cmd.replace(/"/g, '&quot;')}">📋</button>
                        </div>
                    </div>
                `).join('')}
                <button style="width:100%;background:#c62828;border:none;color:white;padding:12px;border-radius:8px;cursor:pointer;font-weight:600" id="cmd-cls-btn">ĐÓNG</button>`;
            
            cmdEl.querySelectorAll('[data-cmd]').forEach(b => b.onclick = () => cp(b.dataset.cmd));
            cmdEl.querySelector('#cmd-cls-btn').onclick = () => {
                cmdEl.style.display = 'none';
                if (!$('u-prev').classList.contains('on') && !$('u-panel').classList.contains('on')) {
                    $('u-bd').classList.remove('on');
                }
            };
            cmdEl.style.display = 'block';
            $('u-bd').classList.add('on');
        }

        // ── FAB & EVENTS ──
        $('u-fab').onclick = () => {
            if ($('u-panel').classList.contains('on')) {
                $('u-panel').classList.remove('on');
                $('u-bd').classList.remove('on');
            } else {
                scan(document,'main'); scanPerf(); renderPanel();
                $('u-panel').classList.add('on');
                $('u-bd').classList.add('on');
            }
        };

        $('btn-scan').onclick = () => { scan(document,'deep'); scanPerf(); renderPanel(); toast('✅ '+urls.size+' media, '+magnets.size+' magnets'); };
        $('btn-clr').onclick = () => { urls.clear(); magnets.clear(); updateBadge(); renderPanel(); toast('🗑 Đã xóa'); };
        
        $('btn-cls').onclick = () => {
            $('u-vid').pause(); $('u-vid').src='';
            $('u-prev').classList.remove('on');
            $('u-bd').classList.remove('on');
            if (screen.orientation && screen.orientation.unlock) screen.orientation.unlock();
        };

        $('btn-opt').onclick = (e) => {
            e.stopPropagation();
            const actions = [
                { label: '⛶ Fullscreen Ngang', action: () => triggerFullscreen() },
                { label: '🌐 Mở tab mới', action: () => { if(cur) window.open(cur.url,'_blank'); } },
                { label: '📋 Copy URL', action: () => { if(cur) cp(cur.url); } },
            ];
            
            // Simple dropdown
            const existing = document.querySelector('.temp-dropdown');
            if (existing) existing.remove();
            
            const dd = document.createElement('div');
            dd.className = 'temp-dropdown';
            dd.style.cssText = 'position:fixed;background:#1c1c1c;border-radius:12px;border:1px solid #333;z-index:2147483648;box-shadow:0 10px 40px rgba(0,0,0,.8);overflow:hidden;min-width:200px;';
            const rect = $('btn-opt').getBoundingClientRect();
            dd.style.top = (rect.bottom + 8) + 'px';
            dd.style.right = '12px';
            
            actions.forEach(a => {
                const item = document.createElement('div');
                item.style.cssText = 'padding:13px 18px;color:#eee;font-size:13px;cursor:pointer;border-bottom:1px solid #252525;';
                item.textContent = a.label;
                item.onclick = () => { a.action(); dd.remove(); };
                dd.appendChild(item);
            });
            
            document.body.appendChild(dd);
            setTimeout(() => {
                document.addEventListener('click', function closeDd(ev) {
                    if (!dd.contains(ev.target) && ev.target !== $('btn-opt')) {
                        dd.remove();
                        document.removeEventListener('click', closeDd);
                    }
                });
            }, 100);
        };

        $('u-bd').onclick = (e) => {
            if (e.target !== $('u-bd')) return;
            const addModal = $('u-add-modal');
            const cmdEl = $('u-cmd');
            if (addModal && addModal.classList.contains('on')) { addModal.classList.remove('on'); return; }
            if (cmdEl && cmdEl.style.display === 'block') { cmdEl.style.display = 'none'; return; }
            $('u-panel').classList.remove('on');
            $('u-prev').classList.remove('on');
            $('u-bd').classList.remove('on');
            $('u-vid').pause();
        };
    }

    // ══════════════════════════════════════════
    // AUTO START
    // ══════════════════════════════════════════
    setInterval(scanPerf, 3000);
    setTimeout(() => { scan(document,'auto'); updateBadge(); }, 2000);

    if (document.body) initUI();
    else document.addEventListener('DOMContentLoaded', initUI);

})();