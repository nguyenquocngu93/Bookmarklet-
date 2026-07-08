// ==UserScript==
// @name         Glass Media Player - Full Featured
// @namespace    http://tampermonkey.net/
// @version      2.0
// @description  Media Detector + Player + Smart Download Commands - Glass UI
// @author       You
// @match        *://*/*
// @grant        none
// @run-at       document-start
// ==/UserScript==

(function () {
    'use strict';

    // ════════════════════════════════
    // STORAGE
    // ════════════════════════════════
    const STORAGE_KEY = 'gmp_history';
    function loadHistory() {
        try { return new Set(JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')); }
        catch(e) { return new Set(); }
    }
    function saveHistory(set) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify([...set]));
    }

    let history = loadHistory();
    const REF = location.href;
    const UA = navigator.userAgent || 'Mozilla/5.0';

    // ════════════════════════════════
    // MEDIA DETECTION
    // ════════════════════════════════
    const urls = new Map();
    const patterns = [
        { re: /https?:\/\/[^\s"'<>()\\\]]+\.m3u8[^\s"'<>()\\\]]*/gi,  type: 'M3U8',  color: '#a855f7', icon: '📡', prio: 1 },
        { re: /https?:\/\/[^\s"'<>()\\\]]+\.mpd[^\s"'<>()\\\]]*/gi,   type: 'MPD',   color: '#ec4899', icon: '📡', prio: 2 },
        { re: /https?:\/\/[^\s"'<>()\\\]]+\.mp4[^\s"'<>()\\\]]*/gi,   type: 'MP4',   color: '#22c55e', icon: '🎬', prio: 3 },
        { re: /https?:\/\/[^\s"'<>()\\\]]+\.webm[^\s"'<>()\\\]]*/gi,  type: 'WEBM',  color: '#06b6d4', icon: '🎬', prio: 4 },
        { re: /https?:\/\/[^\s"'<>()\\\]]+\.mkv[^\s"'<>()\\\]]*/gi,   type: 'MKV',   color: '#8b5cf6', icon: '🎬', prio: 5 },
        { re: /https?:\/\/[^\s"'<>()\\\]]+\.flv[^\s"'<>()\\\]]*/gi,   type: 'FLV',   color: '#f97316', icon: '🎬', prio: 6 },
        { re: /https?:\/\/[^\s"'<>()\\\]]+\.mov[^\s"'<>()\\\]]*/gi,   type: 'MOV',   color: '#eab308', icon: '🎬', prio: 7 },
        { re: /https?:\/\/[^\s"'<>()\\\]]+\.ts[^\s"'<>()\\\]]*/gi,    type: 'TS',    color: '#64748b', icon: '📡', prio: 8 },
        { re: /https?:\/\/[^\s"'<>()\\\]]+\.m4s[^\s"'<>()\\\]]*/gi,   type: 'M4S',   color: '#94a3b8', icon: '📡', prio: 9 },
    ];

    const MAGNET_RE = /magnet:\?xt=urn:btih:[a-fA-F0-9]{32,40}[^\s"'<>)\]]*/gi;
    const TORRENT_RE = /https?:\/\/[^\s"'<>()\\\]]+\.torrent[^\s"'<>()\\\]]*/gi;
    const magnets = new Map();

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
            if (history.size > 100) history = new Set([...history].slice(-100));
            saveHistory(history);
            updateBadge();
        }
    }

    function addMagnet(m, source) {
        const hm = m.match(/btih:([a-fA-F0-9]{32,40})/i);
        if (!hm) return;
        const hash = hm[1].toLowerCase();
        if (!magnets.has(hash)) {
            magnets.set(hash, { magnet: m, hash, source, ts: Date.now() });
            updateBadge();
        }
    }

    function findUrls(text, source) {
        if (!text || typeof text !== 'string') return;
        patterns.forEach(p => {
            const m = text.match(p.re);
            if (m) m.forEach(u => addUrl(u, p.type, source, p.prio));
        });
        const mag = text.match(MAGNET_RE);
        if (mag) mag.forEach(m => addMagnet(m, source));
        const tor = text.match(TORRENT_RE);
        if (tor) tor.forEach(u => addUrl(u, 'TORRENT', source, 10));
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
            });
            doc.querySelectorAll('a[href]').forEach(a => {
                const h = a.href || '';
                if (h.startsWith('magnet:')) addMagnet(h, src+':link');
                else if (/\.torrent$/i.test(h)) addUrl(h, 'TORRENT', src+':link', 10);
            });
            doc.querySelectorAll('script:not([src])').forEach(s => findUrls(s.textContent, src+':js'));
            findUrls(doc.documentElement.outerHTML, src+':html');
        } catch(e) {}
    }

    const _fetch = window.fetch;
    window.fetch = function(...a) {
        try { const u = typeof a[0]==='string' ? a[0] : (a[0]&&a[0].url)||''; if (u) findUrls(u, 'fetch'); } catch(e) {}
        return _fetch.apply(this, a);
    };
    const _xhr = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function(m, u) {
        try { if (u) findUrls(String(u), 'xhr'); } catch(e) {}
        return _xhr.apply(this, arguments);
    };

    let updateBadge = () => {};

    // ════════════════════════════════
    // SMART DOWNLOAD ANALYZER
    // ════════════════════════════════
    function analyzeMedia(url) {
        const info = { url, type: 'unknown', format: 'unknown', tools: [], commands: [], tips: [] };

        if (/\.m3u8/i.test(url))          { info.type = 'HLS Stream';     info.format = 'm3u8'; }
        else if (/\.mpd/i.test(url))      { info.type = 'DASH Stream';    info.format = 'mpd'; }
        else if (/\.mp4/i.test(url))      { info.type = 'MP4 Video';      info.format = 'mp4'; }
        else if (/\.webm/i.test(url))     { info.type = 'WebM Video';     info.format = 'webm'; }
        else if (/\.mkv/i.test(url))      { info.type = 'MKV Video';      info.format = 'mkv'; }
        else if (/\.flv/i.test(url))      { info.type = 'FLV Video';      info.format = 'flv'; }
        else if (/\.ts/i.test(url))       { info.type = 'TS Stream';      info.format = 'ts'; }
        else if (/\.m4s/i.test(url))      { info.type = 'DASH Segment';   info.format = 'm4s'; }
        else if (/\.torrent$/i.test(url)) { info.type = 'Torrent File';   info.format = 'torrent'; }
        else if (/iframe|embed/i.test(url)) { info.type = 'Iframe Player'; info.format = 'html'; }

        if (info.format === 'm3u8' || info.format === 'mpd') {
            info.tools = ['yt-dlp', 'ffmpeg', 'VLC', 'Termux'];
            info.commands = [
                { tool: 'yt-dlp', cmd: `yt-dlp --referer "${REF}" "${url}"`, desc: 'Tải chất lượng cao nhất' },
                { tool: 'yt-dlp', cmd: `yt-dlp --referer "${REF}" --user-agent "${UA}" -f "best" "${url}"`, desc: 'Bypass với header' },
                { tool: 'ffmpeg', cmd: `ffmpeg -referer "${REF}" -user_agent "${UA}" -i "${url}" -c copy output.${info.format === 'mpd' ? 'mp4' : 'ts'}`, desc: 'Copy stream nhanh' },
                { tool: 'termux', cmd: `pkg install python ffmpeg -y && pip install yt-dlp && yt-dlp --referer "${REF}" "${url}"`, desc: 'Cài & tải trên Android' },
            ];
            info.tips = ['HLS/DASH cần yt-dlp hoặc ffmpeg', 'Dùng -f để chọn quality', 'VLC stream trực tiếp không cần tải'];
        } else if (['mp4','webm','mkv','flv','ts','m4s'].includes(info.format)) {
            info.tools = ['aria2', 'wget', 'curl', 'IDM'];
            info.commands = [
                { tool: 'aria2', cmd: `aria2c --referer="${REF}" --user-agent="${UA}" -x 16 "${url}"`, desc: 'Tải đa luồng 16 connections' },
                { tool: 'wget',  cmd: `wget --referer="${REF}" --user-agent="${UA}" "${url}"`, desc: 'Tải đơn giản' },
                { tool: 'curl',  cmd: `curl -L --referer "${REF}" -A "${UA}" -o video.${info.format} "${url}"`, desc: 'Tải với curl' },
                { tool: 'termux',cmd: `pkg install aria2 -y && aria2c --referer="${REF}" -x 16 "${url}"`, desc: 'Tải trên Android' },
            ];
            info.tips = ['File trực tiếp, tải bằng tool bất kỳ', 'aria2c nhanh hơn nhờ đa luồng', 'Luôn thêm Referer tránh 403'];
        } else if (info.format === 'torrent') {
            info.tools = ['qBittorrent', 'Transmission', 'aria2'];
            info.commands = [
                { tool: 'qBittorrent', cmd: `curl -X POST http://localhost:8080/api/v2/torrents/add -F "urls=${url}"`, desc: 'Thêm vào qBittorrent' },
                { tool: 'transmission',cmd: `transmission-remote -a "${url}"`, desc: 'Thêm vào Transmission' },
                { tool: 'aria2', cmd: `aria2c --bt-metadata-only=true --bt-save-metadata=true "${url}"`, desc: 'Tải metadata torrent' },
                { tool: 'termux', cmd: `pkg install transmission -y && transmission-remote -a "${url}"`, desc: 'Tải trên Android' },
            ];
            info.tips = ['Torrent cần client để tải', 'qBittorrent có Web UI ở port 8080', 'Có thể stream qua TorrServer'];
        } else if (info.format === 'html') {
            info.tools = ['yt-dlp', 'Browser'];
            info.commands = [
                { tool: 'yt-dlp', cmd: `yt-dlp --referer "${REF}" "${url}"`, desc: 'Extract video từ iframe' },
                { tool: 'termux', cmd: `yt-dlp --referer "${REF}" "${url}"`, desc: 'Chạy trên Termux' },
            ];
            info.tips = ['Iframe player - yt-dlp tự extract URL thật', 'Mở tab mới để tìm video gốc'];
        } else {
            info.tools = ['yt-dlp', 'curl'];
            info.commands = [
                { tool: 'yt-dlp', cmd: `yt-dlp --referer "${REF}" "${url}"`, desc: 'Thử tải với yt-dlp' },
                { tool: 'curl',   cmd: `curl -L --referer "${REF}" -A "${UA}" -O "${url}"`, desc: 'Tải với curl' },
            ];
            info.tips = ['Không rõ định dạng, thử yt-dlp trước'];
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
                    const bw = lines[i].match(/BANDWIDTH=(\d+)/)?.[1] || '0';
                    const next = (lines[i+1] || '').trim();
                    if (next && !next.startsWith('#')) {
                        const fullUrl = next.startsWith('http') ? next : url.substring(0, url.lastIndexOf('/')+1) + next;
                        qualities.push({ label: res.split('x')[1] + 'p', resolution: res, bandwidth: parseInt(bw), url: fullUrl });
                    }
                }
            }
            qualities.sort((a, b) => b.bandwidth - a.bandwidth);
            return qualities;
        } catch(e) { return null; }
    }

    // ════════════════════════════════
    // GLASS UI CSS
    // ════════════════════════════════
    const CSS = `
        :root {
            --glass-bg: rgba(12, 12, 18, 0.78);
            --glass-bg2: rgba(22, 22, 32, 0.82);
            --glass-bg3: rgba(35, 35, 50, 0.72);
            --glass-border: rgba(255,255,255,0.07);
            --glass-highlight: rgba(255,255,255,0.04);
            --glass-shadow: 0 8px 32px rgba(0,0,0,0.45);
            --glass-blur: blur(22px) saturate(180%);
            --text-primary: #f1f5f9;
            --text-secondary: #94a3b8;
            --text-muted: #64748b;
            --accent: #6366f1;
            --accent2: #8b5cf6;
            --danger: #ef4444;
            --success: #22c55e;
            --warning: #f59e0b;
            --radius: 18px;
            --radius-sm: 12px;
            --radius-xs: 9px;
        }

        #gmp-fab {
            position:fixed; bottom:24px; right:24px;
            width:52px; height:52px;
            background: var(--glass-bg);
            backdrop-filter: var(--glass-blur);
            -webkit-backdrop-filter: var(--glass-blur);
            border: 1px solid var(--glass-border);
            color:white; border-radius:50%;
            font-size:22px; cursor:pointer;
            box-shadow: var(--glass-shadow);
            z-index:2147483646;
            display:flex; align-items:center; justify-content:center;
            transition: all 0.3s cubic-bezier(0.4,0,0.2,1);
            user-select:none;
        }
        #gmp-fab:hover {
            transform: scale(1.08);
            background: rgba(99,102,241,0.25);
            border-color: rgba(99,102,241,0.4);
            box-shadow: 0 12px 40px rgba(99,102,241,0.3);
        }
        #gmp-fab:active { transform: scale(0.94); }

        #gmp-badge {
            position:absolute; top:-6px; right:-6px;
            background: var(--danger);
            color:white; font-size:10px; font-weight:700;
            min-width:22px; height:22px; border-radius:11px;
            display:none; align-items:center; justify-content:center;
            border: 2px solid rgba(0,0,0,0.5);
            box-shadow: 0 2px 8px rgba(239,68,68,0.4);
        }

        #gmp-overlay {
            position:fixed; inset:0;
            background: rgba(0,0,0,0.5);
            backdrop-filter: blur(4px);
            -webkit-backdrop-filter: blur(4px);
            z-index:2147483644; display:none;
            transition: opacity 0.3s;
        }
        #gmp-overlay.on { display:block; }

        #gmp-panel {
            position:fixed; bottom:90px; right:16px;
            width:calc(100vw - 32px); max-width:420px;
            max-height:72vh;
            background: var(--glass-bg);
            backdrop-filter: var(--glass-blur);
            -webkit-backdrop-filter: var(--glass-blur);
            border: 1px solid var(--glass-border);
            border-radius: var(--radius);
            z-index:2147483645; display:none; flex-direction:column;
            box-shadow: var(--glass-shadow), 0 0 0 1px rgba(255,255,255,0.03) inset;
            overflow:hidden;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
        }
        #gmp-panel.on { display:flex; animation: fadeIn 0.25s ease; }

        #gmp-header {
            display:flex; align-items:center; gap:10px;
            padding:14px 16px;
            background: var(--glass-bg2);
            border-bottom: 1px solid var(--glass-border);
            flex-shrink:0;
        }
        #gmp-title {
            color: var(--text-primary);
            font-size:14px; font-weight:700; flex:1;
            letter-spacing: -0.3px;
        }
        .gmp-btn {
            border: 1px solid var(--glass-border);
            border-radius: var(--radius-xs);
            cursor:pointer; font-size:11px; font-weight:600;
            padding:7px 13px; color:white;
            background: var(--glass-bg3);
            backdrop-filter: blur(8px);
            -webkit-backdrop-filter: blur(8px);
            transition: all 0.2s;
            white-space:nowrap;
        }
        .gmp-btn:hover { background: rgba(255,255,255,0.1); border-color: rgba(255,255,255,0.15); }
        .gmp-btn.accent { background: rgba(99,102,241,0.3); border-color: rgba(99,102,241,0.4); }
        .gmp-btn.accent:hover { background: rgba(99,102,241,0.45); }
        .gmp-btn.danger { background: rgba(239,68,68,0.2); border-color: rgba(239,68,68,0.3); color: #fca5a5; }

        #gmp-tabs {
            display:flex; background: var(--glass-bg2);
            border-bottom: 1px solid var(--glass-border);
            flex-shrink:0; overflow-x:auto;
            -webkit-overflow-scrolling: touch;
        }
        #gmp-tabs::-webkit-scrollbar { display:none; }
        .gmp-tab {
            flex:1; min-width:0; padding:11px 8px; border:none;
            background:none; color: var(--text-muted);
            font-size:11px; font-weight:600; cursor:pointer;
            border-bottom:2px solid transparent;
            transition: all 0.2s; white-space:nowrap;
            letter-spacing: -0.2px;
        }
        .gmp-tab.on {
            color: var(--accent);
            border-bottom-color: var(--accent);
            background: rgba(99,102,241,0.08);
        }

        #gmp-list {
            overflow-y:auto; flex:1;
            -webkit-overflow-scrolling: touch;
        }
        #gmp-list::-webkit-scrollbar { width:3px; }
        #gmp-list::-webkit-scrollbar-track { background:transparent; }
        #gmp-list::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius:3px; }

        .gmp-empty {
            display:flex; flex-direction:column; align-items:center;
            justify-content:center; padding:40px 20px; text-align:center;
            color: var(--text-muted); font-size:13px; gap:10px;
        }
        .gmp-empty-icon { font-size:40px; opacity:0.5; }
        .gmp-empty-title { color: var(--text-secondary); font-weight:600; font-size:14px; }
        .gmp-empty-sub { font-size:11px; line-height:1.5; }

        .gmp-card {
            padding:12px 14px;
            border-bottom: 1px solid var(--glass-border);
            cursor:pointer;
            transition: all 0.2s;
        }
        .gmp-card:hover { background: var(--glass-highlight); }
        .gmp-card:active { background: rgba(255,255,255,0.03); }
        .gmp-card-header {
            display:flex; align-items:center; gap:8px; margin-bottom:6px;
        }
        .gmp-badge {
            font-size:9px; font-weight:700; padding:3px 8px;
            border-radius:20px; color:white; letter-spacing:0.3px;
            flex-shrink:0;
        }
        .gmp-name {
            color: var(--text-primary);
            font-size:12px; font-weight:600;
            flex:1; overflow:hidden; text-overflow:ellipsis;
            white-space:nowrap; letter-spacing:-0.2px;
        }
        .gmp-src { color: var(--text-muted); font-size:9px; margin-bottom:6px; }
        .gmp-url {
            color: #7dd3fc; font-size:10px; font-family: 'SF Mono','Fira Code',monospace;
            word-break:break-all; background: rgba(0,0,0,0.3);
            padding:8px 10px; border-radius: var(--radius-xs);
            line-height:1.4; border: 1px solid var(--glass-border);
            font-weight:500;
        }
        .gmp-actions {
            display:flex; gap:6px; margin-top:8px; flex-wrap:wrap;
        }
        .gmp-act {
            border: 1px solid var(--glass-border);
            border-radius: var(--radius-xs);
            padding:7px 14px; font-size:10px; font-weight:600;
            cursor:pointer; color:white;
            background: var(--glass-bg3);
            backdrop-filter: blur(4px);
            -webkit-backdrop-filter: blur(4px);
            transition: all 0.2s;
            flex:1; text-align:center; min-width:60px;
        }
        .gmp-act:hover { background: rgba(255,255,255,0.1); }
        .gmp-act.play { background: rgba(34,197,94,0.2); border-color: rgba(34,197,94,0.3); color: #86efac; }
        .gmp-act.copy { background: rgba(99,102,241,0.15); border-color: rgba(99,102,241,0.25); color: #a5b4fc; }
        .gmp-act.open { background: rgba(245,158,11,0.15); border-color: rgba(245,158,11,0.25); color: #fcd34d; }
        .gmp-act.dl { background: rgba(139,92,246,0.2); border-color: rgba(139,92,246,0.3); color: #c4b5fd; }

        .gmp-magnet {
            padding:12px 14px;
            border-bottom: 1px solid var(--glass-border);
            transition: all 0.2s;
        }
        .gmp-magnet:hover { background: var(--glass-highlight); }
        .gmp-mag-hash {
            color: var(--warning); font-size:11px; font-family: 'SF Mono','Fira Code',monospace;
            font-weight:600; margin-bottom:4px; word-break:break-all;
        }
        .gmp-mag-link {
            color: #7dd3fc; font-size:10px; font-family: 'SF Mono','Fira Code',monospace;
            word-break:break-all; background: rgba(0,0,0,0.3);
            padding:6px 10px; border-radius: var(--radius-xs);
            margin-bottom:4px; border: 1px solid var(--glass-border);
        }
        .gmp-mag-src { color: var(--text-muted); font-size:9px; }

        /* Player */
        #gmp-player {
            position:fixed; bottom:0; left:0; right:0;
            background: var(--glass-bg);
            backdrop-filter: var(--glass-blur);
            -webkit-backdrop-filter: var(--glass-blur);
            z-index:2147483645;
            display:none; flex-direction:column;
            border-radius:20px 20px 0 0;
            border: 1px solid var(--glass-border);
            border-bottom: none;
            box-shadow: 0 -10px 50px rgba(0,0,0,0.5);
            max-height:85vh;
        }
        #gmp-player.on { display:flex; animation: slideUp 0.3s cubic-bezier(0.4,0,0.2,1); }
        #gmp-player-bar {
            display:flex; align-items:center; padding:10px 14px;
            gap:8px; border-bottom: 1px solid var(--glass-border);
            flex-shrink:0; background: var(--glass-bg2);
        }
        #gmp-player-title {
            flex:1; color: var(--text-primary); font-size:12px;
            font-weight:600; overflow:hidden; text-overflow:ellipsis;
            white-space:nowrap; letter-spacing:-0.3px;
        }
        .gmp-pbtn {
            width:34px; height:34px; border-radius:50%;
            border: 1px solid var(--glass-border);
            background: var(--glass-bg3);
            backdrop-filter: blur(4px);
            -webkit-backdrop-filter: blur(4px);
            color:white; cursor:pointer; font-size:16px;
            display:flex; align-items:center; justify-content:center;
            transition: all 0.2s;
        }
        .gmp-pbtn:hover { background: rgba(255,255,255,0.1); }
        .gmp-pbtn.close { color: #fca5a5; }
        #gmp-vid-wrap {
            background:#000; width:100%;
            max-height:50vh; overflow:hidden;
            display:flex; align-items:center; justify-content:center;
            flex-shrink:0; position:relative;
        }
        #gmp-vid {
            width:100%; max-height:50vh;
            object-fit:contain;
            transition: transform 0.3s;
        }
        #gmp-pact-bar {
            display:flex; gap:6px; padding:10px 14px;
            overflow-x:auto; background: var(--glass-bg2);
            flex-shrink:0; -webkit-overflow-scrolling: touch;
        }
        #gmp-pact-bar::-webkit-scrollbar { display:none; }
        .gmp-pact {
            border: 1px solid var(--glass-border);
            border-radius: var(--radius-xs);
            padding:8px 14px; color:white; font-weight:600;
            font-size:10px; white-space:nowrap; cursor:pointer;
            background: var(--glass-bg3);
            backdrop-filter: blur(4px);
            -webkit-backdrop-filter: blur(4px);
            transition: all 0.2s;
        }
        .gmp-pact:hover { background: rgba(255,255,255,0.1); }
        .gmp-pact.copy { background: rgba(99,102,241,0.2); border-color: rgba(99,102,241,0.3); color: #a5b4fc; }
        .gmp-pact.fs { background: rgba(239,68,68,0.15); border-color: rgba(239,68,68,0.25); color: #fca5a5; }
        .gmp-pact.vlc { background: rgba(34,197,94,0.15); border-color: rgba(34,197,94,0.25); color: #86efac; }
        .gmp-pact.rot { background: rgba(6,182,212,0.15); border-color: rgba(6,182,212,0.25); color: #67e8f9; }
        .gmp-pact.zoom { background: rgba(148,163,184,0.15); border-color: rgba(148,163,184,0.25); color: #cbd5e1; }

        /* Download Panel */
        #gmp-dl-panel {
            position:fixed; top:50%; left:50%; transform:translate(-50%,-50%);
            background: var(--glass-bg);
            backdrop-filter: var(--glass-blur);
            -webkit-backdrop-filter: var(--glass-blur);
            border: 1px solid var(--glass-border);
            border-radius: var(--radius);
            z-index:2147483647;
            width:94%; max-width:480px; max-height:80vh;
            display:none; flex-direction:column;
            box-shadow: var(--glass-shadow);
            overflow:hidden;
        }
        #gmp-dl-panel.on { display:flex; animation: fadeIn 0.25s ease; }
        #gmp-dl-header {
            display:flex; align-items:center; padding:14px 16px;
            background: var(--glass-bg2);
            border-bottom: 1px solid var(--glass-border);
            flex-shrink:0; gap:10px;
        }
        #gmp-dl-title {
            flex:1; color: var(--text-primary);
            font-size:13px; font-weight:700;
        }
        #gmp-dl-body {
            overflow-y:auto; flex:1; padding:14px;
        }
        .dl-info {
            background: var(--glass-bg2); border-radius: var(--radius-sm);
            padding:12px; margin-bottom:12px;
            border: 1px solid var(--glass-border);
        }
        .dl-info-row {
            display:flex; gap:8px; align-items:center; margin-bottom:6px;
        }
        .dl-badge {
            font-size:9px; font-weight:700; padding:3px 10px;
            border-radius:20px; color:white;
            background: rgba(99,102,241,0.3);
        }
        .dl-format { color: var(--text-muted); font-size:10px; }
        .dl-url-text {
            color: #7dd3fc; font-size:10px; font-family: 'SF Mono','Fira Code',monospace;
            word-break:break-all; background: rgba(0,0,0,0.3);
            padding:8px 10px; border-radius: var(--radius-xs);
            line-height:1.4; border: 1px solid var(--glass-border);
            margin-bottom:10px;
        }
        .dl-tools-row {
            display:flex; gap:6px; flex-wrap:wrap; margin-bottom:12px;
        }
        .dl-tool-tag {
            font-size:10px; padding:4px 12px; border-radius:20px;
            background: rgba(99,102,241,0.15);
            border: 1px solid rgba(99,102,241,0.25);
            color: #a5b4fc;
        }
        .dl-cmd-block {
            background: var(--glass-bg2);
            border: 1px solid var(--glass-border);
            border-radius: var(--radius-sm);
            padding:12px; margin-bottom:10px;
        }
        .dl-cmd-header {
            display:flex; justify-content:space-between;
            align-items:center; margin-bottom:8px;
        }
        .dl-cmd-tool {
            color: var(--text-primary); font-size:11px; font-weight:700;
        }
        .dl-cmd-desc {
            color: var(--text-muted); font-size:9px;
        }
        .dl-cmd-row {
            display:flex; gap:8px; align-items:stretch;
        }
        .dl-cmd-text {
            flex:1; background: rgba(0,0,0,0.3);
            border: 1px solid var(--glass-border);
            border-radius: var(--radius-xs);
            padding:10px; color: #86efac;
            font-family: 'SF Mono','Fira Code',monospace;
            font-size:11px; line-height:1.5;
            word-break:break-all; resize:none; outline:none;
            min-height:36px;
        }
        .dl-cmd-copy {
            background: rgba(99,102,241,0.3);
            border: 1px solid rgba(99,102,241,0.4);
            color: white; border-radius: var(--radius-xs);
            padding:0 14px; cursor:pointer; font-size:15px;
            transition: all 0.2s; flex-shrink:0;
        }
        .dl-cmd-copy:hover { background: rgba(99,102,241,0.5); }
        .dl-tips {
            background: rgba(99,102,241,0.08);
            border-left: 2px solid rgba(99,102,241,0.4);
            padding:10px 14px; border-radius: 0 var(--radius-xs) var(--radius-xs) 0;
            margin-top:10px;
        }
        .dl-tip {
            color: #a5b4fc; font-size:10px; line-height:1.6;
            margin-bottom:4px;
        }
        .dl-tip:last-child { margin-bottom:0; }

        .ql-item {
            padding:12px 16px; border-bottom: 1px solid var(--glass-border);
            cursor:pointer; display:flex; justify-content:space-between;
            align-items:center; transition: all 0.2s;
        }
        .ql-item:hover { background: var(--glass-highlight); }
        .ql-label { color: #7dd3fc; font-weight:600; font-size:12px; }
        .ql-bw { color: var(--text-muted); font-size:10px; }

        #gmp-toast {
            position:fixed; bottom:100px; left:50%; transform:translateX(-50%);
            background: var(--glass-bg);
            backdrop-filter: var(--glass-blur);
            -webkit-backdrop-filter: var(--glass-blur);
            border: 1px solid var(--glass-border);
            color:white; padding:10px 22px; border-radius:25px;
            font-size:12px; font-weight:600; z-index:2147483648;
            display:none; box-shadow: var(--glass-shadow);
            white-space:nowrap; letter-spacing:-0.2px;
        }

        @keyframes fadeIn {
            from { opacity:0; transform: scale(0.95); }
            to { opacity:1; transform: scale(1); }
        }
        @keyframes slideUp {
            from { transform: translateY(100%); opacity:0; }
            to { transform: translateY(0); opacity:1; }
        }
    `;

    // ════════════════════════════════
    // INIT
    // ════════════════════════════════
    function initUI() {
        const style = document.createElement('style');
        style.textContent = CSS;
        document.head.appendChild(style);

        document.body.insertAdjacentHTML('beforeend', `
            <button id="gmp-fab">🎬<span id="gmp-badge">0</span></button>
            <div id="gmp-overlay"></div>

            <div id="gmp-panel">
                <div id="gmp-header">
                    <span id="gmp-title">🎬 Glass Player</span>
                    <button class="gmp-btn accent" id="gmp-scan-btn">🔍 Quét</button>
                    <button class="gmp-btn danger" id="gmp-clear-btn">🗑</button>
                </div>
                <div id="gmp-tabs">
                    <button class="gmp-tab on" data-tab="streams">📺 Streams</button>
                    <button class="gmp-tab" data-tab="magnets">🧲 Magnet</button>
                </div>
                <div id="gmp-list"></div>
            </div>

            <div id="gmp-player">
                <div id="gmp-player-bar">
                    <span id="gmp-player-title">-</span>
                    <button class="gmp-pbtn" id="gmp-popout-btn" title="Mở tab mới">↗</button>
                    <button class="gmp-pbtn close" id="gmp-close-btn" title="Đóng">✕</button>
                </div>
                <div id="gmp-vid-wrap">
                    <video id="gmp-vid" controls playsinline webkit-playsinline></video>
                </div>
                <div id="gmp-pact-bar"></div>
            </div>

            <div id="gmp-dl-panel">
                <div id="gmp-dl-header">
                    <span id="gmp-dl-title">💡 Smart Download</span>
                    <button class="gmp-pbtn close" id="gmp-dl-close" title="Đóng">✕</button>
                </div>
                <div id="gmp-dl-body"></div>
            </div>

            <div id="gmp-toast"></div>
        `);

        const $ = id => document.getElementById(id);
        let cur = null, rot = 0, zoom = 1;
        let currentTab = 'streams';

        function toast(msg, bg) {
            const t = $('gmp-toast');
            t.textContent = msg;
            t.style.background = bg || '';
            t.style.display = 'block';
            clearTimeout(t._t);
            t._t = setTimeout(() => t.style.display='none', 2200);
        }

        function cp(text) {
            const ta = document.createElement('textarea');
            ta.value = text; ta.style.cssText = 'position:fixed;left:-9999px';
            document.body.appendChild(ta); ta.select();
            document.execCommand('copy'); document.body.removeChild(ta);
            toast('✅ Đã copy!');
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
            const b = $('gmp-badge');
            const total = urls.size + magnets.size;
            if (b) { b.style.display = total ? 'flex' : 'none'; b.textContent = total > 99 ? '99+' : total; }
        };

        // Tabs
        document.querySelectorAll('.gmp-tab').forEach(tab => {
            tab.onclick = () => {
                document.querySelectorAll('.gmp-tab').forEach(t => t.classList.remove('on'));
                tab.classList.add('on');
                currentTab = tab.dataset.tab;
                renderList();
            };
        });

        function renderList() {
            currentTab === 'streams' ? renderStreams() : renderMagnets();
        }

        function renderStreams() {
            const list = $('gmp-list');
            const items = [...urls.values()].filter(i => i.type !== 'TORRENT').sort((a,b) => a.priority - b.priority);
            if (!items.length) {
                list.innerHTML = `<div class="gmp-empty"><div class="gmp-empty-icon">📺</div><div class="gmp-empty-title">Chưa có media</div><div class="gmp-empty-sub">Phát video trên trang rồi nhấn 🔍 Quét</div></div>`;
                return;
            }
            list.innerHTML = '';
            items.forEach(item => {
                const pat = patterns.find(p => p.type === item.type);
                const color = pat?.color || '#64748b';
                const div = document.createElement('div');
                div.className = 'gmp-card';
                div.innerHTML = `
                    <div class="gmp-card-header">
                        <span class="gmp-badge" style="background:${color}">${pat?.icon||'🎬'} ${item.type}</span>
                        <span class="gmp-name">${fname(item.url)}</span>
                    </div>
                    <div class="gmp-src">📍 ${item.source}</div>
                    <div class="gmp-url">${item.url}</div>
                    <div class="gmp-actions">
                        <button class="gmp-act play" data-url="${item.url}" data-type="${item.type}">▶️ Play</button>
                        <button class="gmp-act dl" data-url="${item.url}">💡 Tải</button>
                        <button class="gmp-act copy" data-url="${item.url}">📋 Copy</button>
                        ${item.type === 'IFRAME' ? `<button class="gmp-act open" data-url="${item.url}">↗ Mở</button>` : ''}
                    </div>`;
                div.querySelector('.gmp-act.play').onclick = (e) => {
                    e.stopPropagation();
                    const t = e.target.dataset.type;
                    if (t === 'IFRAME') { window.open(e.target.dataset.url, '_blank'); toast('🚀 Mở iframe'); }
                    else openPlayer(e.target.dataset.url);
                };
                div.querySelector('.gmp-act.dl').onclick = (e) => {
                    e.stopPropagation(); openDownloadPanel(e.target.dataset.url);
                };
                div.querySelector('.gmp-act.copy').onclick = (e) => {
                    e.stopPropagation(); cp(e.target.dataset.url);
                };
                const openBtn = div.querySelector('.gmp-act.open');
                if (openBtn) openBtn.onclick = (e) => { e.stopPropagation(); window.open(e.target.dataset.url, '_blank'); };
                list.appendChild(div);
            });
        }

        function renderMagnets() {
            const list = $('gmp-list');
            if (!magnets.size) {
                list.innerHTML = `<div class="gmp-empty"><div class="gmp-empty-icon">🧲</div><div class="gmp-empty-title">Chưa có magnet</div><div class="gmp-empty-sub">Script tự động quét magnet link trên trang</div></div>`;
                return;
            }
            list.innerHTML = '';
            [...magnets.values()].forEach(mag => {
                const div = document.createElement('div');
                div.className = 'gmp-magnet';
                div.innerHTML = `
                    <div class="gmp-mag-hash">🧲 ${mag.hash}</div>
                    <div class="gmp-mag-link">${mag.magnet}</div>
                    <div class="gmp-mag-src">📍 ${mag.source}</div>
                    <div class="gmp-actions" style="margin-top:8px">
                        <button class="gmp-act copy" data-url="${mag.magnet}">📋 Copy Magnet</button>
                        <button class="gmp-act copy" data-url="${mag.hash}">📋 Copy Hash</button>
                    </div>`;
                div.querySelectorAll('.gmp-act.copy').forEach(b => b.onclick = (e) => { e.stopPropagation(); cp(e.target.dataset.url); });
                list.appendChild(div);
            });
        }

        function openPlayer(url) {
            cur = { url }; rot = 0; zoom = 1;
            const vid = $('gmp-vid');
            vid.style.transform = 'none';
            $('gmp-player-title').textContent = fname(url);
            vid.src = '';
            setTimeout(() => { vid.src = url; vid.load(); }, 80);
            vid.onerror = () => toast('❌ Không phát được');

            $('gmp-pact-bar').innerHTML = `
                <button class="gmp-pact copy" id="gp-copy">📋 Copy</button>
                <button class="gmp-pact dl" id="gp-dl">💡 Tải</button>
                <button class="gmp-pact fs" id="gp-fs">⛶ FullScreen</button>
                <button class="gmp-pact vlc" id="gp-vlc">📺 VLC</button>
                <button class="gmp-pact rot" id="gp-rot">⟳ Xoay</button>
                <button class="gmp-pact zoom" id="gp-zoom">🔍 1x</button>`;

            $('gp-copy').onclick = () => cp(url);
            $('gp-dl').onclick = () => openDownloadPanel(url);
            $('gp-fs').onclick = () => {
                const req = vid.requestFullscreen || vid.webkitRequestFullscreen;
                if (req) req.call(vid).catch(() => toast('❌ Fullscreen bị chặn'));
            };
            $('gp-vlc').onclick = () => { window.location.href = 'vlc://' + url; };
            $('gp-rot').onclick = () => { rot = (rot + 90) % 360; vid.style.transform = `rotate(${rot}deg) scale(${zoom})`; };
            $('gp-zoom').onclick = (e) => {
                const lv = [1, 1.25, 1.5, 2, 0.75];
                zoom = lv[(lv.indexOf(zoom) + 1) % lv.length];
                e.target.textContent = `🔍 ${zoom}x`;
                vid.style.transform = `rotate(${rot}deg) scale(${zoom})`;
            };

            $('gmp-player').classList.add('on');
            $('gmp-overlay').classList.add('on');
            $('gmp-panel').classList.remove('on');
        }

        // ════════════════════════════════
        // DOWNLOAD PANEL
        // ════════════════════════════════
        function openDownloadPanel(url) {
            const info = analyzeMedia(url);
            const body = $('gmp-dl-body');

            body.innerHTML = `
                <div class="dl-info">
                    <div class="dl-info-row">
                        <span class="dl-badge">${info.type}</span>
                        <span class="dl-format">.${info.format}</span>
                    </div>
                    <div class="dl-url-text">${url}</div>
                    <div style="color:var(--text-muted);font-size:10px;font-weight:600;margin-bottom:6px">🛠 Công cụ:</div>
                    <div class="dl-tools-row">${info.tools.map(t => `<span class="dl-tool-tag">${t}</span>`).join('')}</div>
                </div>

                <div style="color:var(--text-secondary);font-size:11px;font-weight:700;margin-bottom:8px">📋 Lệnh tải:</div>
                <div id="dl-cmds">
                    ${info.commands.map((cmd, i) => `
                        <div class="dl-cmd-block">
                            <div class="dl-cmd-header">
                                <div>
                                    <span class="dl-cmd-tool">${cmd.tool}</span>
                                    <span class="dl-cmd-desc"> - ${cmd.desc}</span>
                                </div>
                            </div>
                            <div class="dl-cmd-row">
                                <textarea class="dl-cmd-text" readonly rows="2">${cmd.cmd}</textarea>
                                <button class="dl-cmd-copy" data-idx="${i}">📋</button>
                            </div>
                        </div>
                    `).join('')}
                </div>

                <div class="dl-tips">
                    ${info.tips.map(t => `<div class="dl-tip">💡 ${t}</div>`).join('')}
                </div>

                ${info.format === 'm3u8' ? `
                    <button class="gmp-btn accent" id="dl-parse-m3u8" style="width:100%;margin-top:10px;padding:10px;font-size:11px">
                        🎞 Phân tích chất lượng M3U8
                    </button>
                    <div id="dl-quality-list" style="margin-top:8px"></div>
                ` : ''}
            `;

            // Copy buttons
            body.querySelectorAll('.dl-cmd-copy').forEach(b => {
                b.onclick = () => cp(info.commands[parseInt(b.dataset.idx)].cmd);
            });

            // Parse M3U8 quality
            const parseBtn = body.querySelector('#dl-parse-m3u8');
            if (parseBtn) {
                parseBtn.onclick = async () => {
                    toast('⏳ Đang phân tích...');
                    const qualities = await parseM3U8Quality(url);
                    const ql = body.querySelector('#dl-quality-list');
                    if (!qualities || !qualities.length) {
                        ql.innerHTML = '<div style="color:#fca5a5;font-size:11px;padding:10px">❌ Không phân tích được</div>';
                        return;
                    }
                    ql.innerHTML = `
                        <div style="color:var(--text-muted);font-size:10px;font-weight:600;margin:8px 0">🎞 Chất lượng:</div>
                        ${qualities.map(q => `
                            <div class="ql-item" data-url="${q.url}">
                                <span class="ql-label">📺 ${q.label}</span>
                                <span class="ql-bw">${(q.bandwidth/1000000).toFixed(1)} Mbps</span>
                            </div>
                        `).join('')}
                    `;
                    ql.querySelectorAll('.ql-item').forEach(item => {
                        item.onclick = () => {
                            const newUrl = item.dataset.url;
                            toast('✅ Đã chọn ' + item.querySelector('.ql-label').textContent);
                            openDownloadPanel(newUrl);
                        };
                    });
                };
            }

            $('gmp-dl-panel').classList.add('on');
            $('gmp-overlay').classList.add('on');
        }

        // Close download panel
        $('gmp-dl-close').onclick = () => {
            $('gmp-dl-panel').classList.remove('on');
            if (!$('gmp-player').classList.contains('on') && !$('gmp-panel').classList.contains('on')) {
                $('gmp-overlay').classList.remove('on');
            }
        };

        // Player popout
        $('gmp-popout-btn').onclick = () => { if (cur) window.open(cur.url, '_blank'); };
        $('gmp-close-btn').onclick = () => {
            $('gmp-vid').pause(); $('gmp-vid').src = '';
            $('gmp-player').classList.remove('on');
            $('gmp-overlay').classList.remove('on');
        };

        // FAB
        $('gmp-fab').onclick = () => {
            if ($('gmp-panel').classList.contains('on')) {
                $('gmp-panel').classList.remove('on');
                $('gmp-overlay').classList.remove('on');
            } else {
                scan(document, 'main');
                renderList();
                $('gmp-panel').classList.add('on');
                $('gmp-overlay').classList.add('on');
            }
        };

        $('gmp-scan-btn').onclick = () => { scan(document, 'deep'); renderList(); toast(`✅ ${urls.size} streams + ${magnets.size} magnets`); };
        $('gmp-clear-btn').onclick = () => { urls.clear(); magnets.clear(); updateBadge(); renderList(); toast('🗑 Đã xóa'); };

        // Overlay close
        $('gmp-overlay').onclick = (e) => {
            if (e.target !== $('gmp-overlay')) return;
            $('gmp-panel').classList.remove('on');
            $('gmp-player').classList.remove('on');
            $('gmp-dl-panel').classList.remove('on');
            $('gmp-overlay').classList.remove('on');
            $('gmp-vid').pause();
        };

        // ESC key
        document.addEventListener('keydown', (e) => {
            if (e.key !== 'Escape') return;
            if ($('gmp-dl-panel').classList.contains('on')) {
                $('gmp-dl-close').click();
            } else if ($('gmp-player').classList.contains('on')) {
                $('gmp-close-btn').click();
            } else if ($('gmp-panel').classList.contains('on')) {
                $('gmp-panel').classList.remove('on');
                $('gmp-overlay').classList.remove('on');
            }
        });
    }

    // ════════════════════════════════
    // AUTO START
    // ════════════════════════════════
    setTimeout(() => { scan(document, 'auto'); updateBadge(); }, 2000);
    setInterval(() => {
        try {
            performance.getEntriesByType('resource').forEach(e => {
                if (/\.(m3u8|mpd|mp4|webm|mkv|flv|ts|m4s|torrent)(\?|$)/i.test(e.name)) findUrls(e.name, 'perf');
            });
            updateBadge();
        } catch(e) {}
    }, 4000);

    if (document.body) initUI();
    else document.addEventListener('DOMContentLoaded', initUI);

})();