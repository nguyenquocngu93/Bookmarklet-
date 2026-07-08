// ==UserScript==
// @name         Universal Media Player v17 - AdBlock + Smart Filter
// @namespace    http://tampermonkey.net/
// @version      17.0
// @description  Lọc quảng cáo thông minh + Lưu blacklist vĩnh viễn
// @author       You
// @match        *://*/*
// @grant        none
// @run-at       document-start
// ==/UserScript==

(function () {
    'use strict';

    // ══════════════════════════════════════════
    // STORAGE - Lưu vĩnh viễn bằng localStorage
    // ══════════════════════════════════════════
    const STORAGE_KEY = 'ump_blacklist';
    const WHITELIST_KEY = 'ump_whitelist';

    function loadBlacklist() {
        try { return new Set(JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')); }
        catch(e) { return new Set(); }
    }
    function saveBlacklist() {
        localStorage.setItem(STORAGE_KEY, JSON.stringify([...blacklist]));
    }
    function loadWhitelist() {
        try { return new Set(JSON.parse(localStorage.getItem(WHITELIST_KEY) || '[]')); }
        catch(e) { return new Set(); }
    }
    function saveWhitelist() {
        localStorage.setItem(WHITELIST_KEY, JSON.stringify([...whitelist]));
    }

    let blacklist = loadBlacklist();
    let whitelist = loadWhitelist();

    // ══════════════════════════════════════════
    // BỘ LỌC THÔNG MINH
    // ══════════════════════════════════════════

    // Patterns quảng cáo cứng (luôn chặn)
    const AD_HARD = [
        /doubleclick\.net/i, /googlesyndication/i, /googleadservices/i,
        /adnxs\.com/i, /rubiconproject/i, /openx\.net/i,
        /snaptrckr/i, /mayzaent/i, /myavlive\.com\/widgets/i,
        /smartpop/i, /popunder/i, /popcash/i, /propellerads/i,
        /exoclick/i, /juicyads/i, /trafficjunky/i, /tsyndicate/i,
        /adsterra/i, /hilltopads/i, /clickadu/i, /megapu\.sh/i,
        /realsrv/i, /jetpackdigital/i, /adspyglass/i
    ];

    // Patterns loại file không phải media (lọc JS, CSS, font...)
    const NON_MEDIA = [
        /\.js(\?|$)/i, /\.css(\?|$)/i, /\.woff/i, /\.ttf/i,
        /\.png(\?|$)/i, /\.jpg(\?|$)/i, /\.gif(\?|$)/i,
        /\.svg(\?|$)/i, /\.ico(\?|$)/i, /\.webp(\?|$)/i,
        /jwplayer\.core/i, /jwpsrv/i, /jwplayer\.js/i,
        /provider\.hlsjs/i, /related\.js/i, /analytics/i,
        /tracking/i, /pixel/i, /beacon/i, /telemetry/i,
        /fingerprint/i, /metrics/i, /stats\./i
    ];

    // Patterns URL quảng cáo dạng path
    const AD_PATHS = [
        /\/ads?\//i, /\/adv\//i, /\/banner/i, /\/sponsor/i,
        /\/promo/i, /\/campaign/i, /\/creative/i, /impressionId/i,
        /externalId/i, /campaignId/i, /\/smartpop\//i,
        /under_player/i, /gridRows/i, /thumbsMargin/i
    ];

    // Domain whitelist cứng (không bao giờ chặn)
    const SAFE_DOMAINS = [
        /surrit\.com/i, /streamvid/i, /jwpcdn\.com\/player\/v/i,
        /hls\.js/i, /cdn\.jsdelivr/i, /cdnjs/i, /googleapis\.com\/ajax/i
    ];

    function isHardAd(url) {
        if (!url) return false;
        // Kiểm tra whitelist người dùng trước
        if ([...whitelist].some(w => url.includes(w))) return false;
        // Kiểm tra domain an toàn
        if (SAFE_DOMAINS.some(r => r.test(url))) return false;
        // Kiểm tra blacklist người dùng
        if ([...blacklist].some(b => url.includes(b))) return true;
        // Kiểm tra patterns cứng
        if (AD_HARD.some(r => r.test(url))) return true;
        if (AD_PATHS.some(r => r.test(url))) return true;
        return false;
    }

    function isNonMedia(url) {
        if (!url) return false;
        return NON_MEDIA.some(r => r.test(url));
    }

    function isRealMedia(url) {
        if (!url || typeof url !== 'string') return false;
        if (url.startsWith('data:')) return false;
        if (isHardAd(url)) return false;
        if (isNonMedia(url)) return false;
        return /\.(m3u8|mpd|mp4|webm|mkv|flv|mov|m4v)(\?|$)/i.test(url);
    }

    // ══════════════════════════════════════════
    // URL DETECTION
    // ══════════════════════════════════════════
    const urls = new Map();
    const patterns = [
        { re: /https?:\/\/[^\s"'<>()\\\]]+\.m3u8[^\s"'<>()\\\]]*/gi, type: 'M3U8', priority: 1 },
        { re: /https?:\/\/[^\s"'<>()\\\]]+\.mpd[^\s"'<>()\\\]]*/gi,  type: 'MPD',  priority: 2 },
        { re: /https?:\/\/[^\s"'<>()\\\]]+\.mp4[^\s"'<>()\\\]]*/gi,  type: 'MP4',  priority: 3 },
        { re: /https?:\/\/[^\s"'<>()\\\]]+\.webm[^\s"'<>()\\\]]*/gi, type: 'WEBM', priority: 4 },
        { re: /https?:\/\/[^\s"'<>()\\\]]+\.mkv[^\s"'<>()\\\]]*/gi,  type: 'MKV',  priority: 5 },
    ];

    // Iframe player patterns (loại bỏ JS, tracker)
    const IFRAME_PLAYER_RE = [
        /https?:\/\/[^\s"'<>]+\/(v|embed|e|vv|jm|t|watch|player)\/[a-zA-Z0-9_\-]{6,}/gi,
        /https?:\/\/(?:videplay|streamvid|surrit|doodstream|mixdrop|fembed|filemoon)[^\s"'<>]*/gi,
    ];

    const REF = location.href;
    const UA  = 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36';

    function cleanUrl(u) {
        return u.replace(/\\u002F/gi,'/').replace(/\\\//g,'/').replace(/&amp;/g,'&').replace(/\\"/g,'').replace(/["')\]>\s]+$/,'').trim();
    }

    function addUrl(u, type, source, priority) {
        u = cleanUrl(u);
        if (!u.startsWith('http')) return;
        if (isHardAd(u)) { console.log('[UMP-BLOCK]', u); return; }
        if (isNonMedia(u) && type !== 'IFRAME') return;
        if (!urls.has(u) || urls.get(u).priority > priority) {
            urls.set(u, { url: u, type, source, priority, ts: Date.now() });
            updateBadge();
        }
    }

    function findUrls(text, source) {
        if (!text || typeof text !== 'string') return;

        // Media patterns
        patterns.forEach(p => {
            const m = text.match(p.re);
            if (m) m.forEach(u => addUrl(u, p.type, source, p.priority));
        });

        // Iframe player patterns (thông minh hơn)
        IFRAME_PLAYER_RE.forEach(re => {
            const m = text.match(re);
            if (m) m.forEach(u => {
                u = cleanUrl(u);
                if (!isHardAd(u) && !isNonMedia(u)) addUrl(u, 'IFRAME', source, 99);
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
            // Chỉ lấy iframe có src hợp lệ (không phải tracker/ads)
            doc.querySelectorAll('iframe').forEach((f,i) => {
                if (f.src && !isHardAd(f.src) && !isNonMedia(f.src)) {
                    addUrl(f.src, 'IFRAME', src+':if', 99);
                }
                try { if (f.contentDocument) scan(f.contentDocument, src+':if'+i); } catch(e) {}
            });
            doc.querySelectorAll('script').forEach(s => findUrls(s.textContent, src+':js'));
            findUrls(doc.documentElement.outerHTML, src+':html');
        } catch(e) {}
    }

    // Hook Network
    const _fetch = window.fetch;
    const _xhrOpen = XMLHttpRequest.prototype.open;
    window.fetch = function(...a) {
        try {
            const u = typeof a[0]==='string'?a[0]:(a[0]&&a[0].url)||'';
            if (u) findUrls(u, 'fetch');
        } catch(e) {}
        return _fetch.apply(this, a);
    };
    XMLHttpRequest.prototype.open = function(m,u) {
        try { if(u) findUrls(String(u),'xhr'); } catch(e) {}
        return _xhrOpen.apply(this, arguments);
    };

    function scanPerf() {
        try { performance.getEntriesByType('resource').forEach(e => {
            if (!isHardAd(e.name) && !isNonMedia(e.name)) findUrls(e.name, 'perf');
        }); } catch(e) {}
    }

    let updateBadge = () => {};

    // ══════════════════════════════════════════
    // CSS
    // ══════════════════════════════════════════
    const CSS = `
        #u-fab { position:fixed; bottom:20px; right:20px; width:56px; height:56px; background:#e53935; color:white; border:none; border-radius:50%; font-size:24px; cursor:pointer; box-shadow:0 4px 20px rgba(0,0,0,.5); z-index:2147483647; display:flex; align-items:center; justify-content:center; }
        #u-badge { position:absolute; top:-2px; right:-2px; background:#43a047; color:white; font-size:10px; min-width:20px; height:20px; border-radius:10px; display:none; align-items:center; justify-content:center; font-weight:bold; border:2px solid #000; }
        #u-bd { position:fixed; inset:0; background:rgba(0,0,0,.78); z-index:2147483640; display:none; }
        #u-bd.on { display:block; }

        /* PANEL */
        #u-panel { position:fixed; bottom:86px; right:12px; width:calc(100vw - 24px); max-width:400px; max-height:72vh; background:#111; border-radius:16px; z-index:2147483647; display:none; flex-direction:column; box-shadow:0 12px 40px #000; overflow:hidden; font-family:sans-serif; border:1px solid #222; }
        #u-panel.on { display:flex; }
        #u-ph { background:#1e1e1e; padding:12px 14px; display:flex; align-items:center; gap:8px; border-bottom:1px solid #2a2a2a; flex-shrink:0; min-height:52px; }
        #u-ph-title { color:#fff; font-size:14px; font-weight:bold; flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        #u-ph-acts { display:flex; gap:6px; align-items:center; flex-shrink:0; }
        .hbtn { border:none; border-radius:8px; cursor:pointer; font-size:11px; font-weight:bold; padding:8px 12px; color:white; white-space:nowrap; }
        .hbtn.blue { background:#1565c0; }
        .hbtn.gray { background:#333; color:#aaa; }
        .hbtn.red  { background:#c62828; }
        
        /* TABS */
        #u-tabs { display:flex; background:#161616; border-bottom:1px solid #222; flex-shrink:0; }
        .utab { flex:1; padding:9px; border:none; background:none; color:#666; font-size:11px; font-weight:bold; cursor:pointer; border-bottom:2px solid transparent; }
        .utab.on { color:#e53935; border-bottom-color:#e53935; }
        
        #u-pb { overflow-y:auto; flex:1; background:#0a0a0a; }

        /* LIST ITEMS */
        .li { padding:12px 14px; border-bottom:1px solid #181818; cursor:pointer; position:relative; }
        .li:active { background:#1a1a1a; }
        .li-top { display:flex; align-items:center; gap:8px; margin-bottom:5px; }
        .li-badge { font-size:10px; font-weight:900; padding:3px 8px; border-radius:5px; color:white; text-transform:uppercase; flex-shrink:0; }
        .lb-M3U8{background:#7b1fa2;} .lb-MP4{background:#2e7d32;} .lb-IFRAME{background:#1565c0;} .lb-other{background:#444;}
        .li-name { color:#fff; font-size:13px; font-weight:600; flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .li-src { color:#555; font-size:10px; margin-bottom:4px; }
        .li-url { color:#4fc3f7; font-size:10px; font-family:monospace; word-break:break-all; background:#000; padding:8px; border-radius:6px; line-height:1.4; border:1px solid #222; }
        .li-block-btn { position:absolute; top:12px; right:12px; background:#c62828; border:none; color:white; font-size:10px; padding:3px 8px; border-radius:5px; cursor:pointer; }

        /* BLACKLIST ITEMS */
        .bl-item { padding:10px 14px; border-bottom:1px solid #181818; display:flex; align-items:center; gap:8px; }
        .bl-domain { color:#ef5350; font-size:12px; font-family:monospace; flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .bl-del { background:none; border:1px solid #333; color:#555; font-size:12px; padding:4px 10px; border-radius:5px; cursor:pointer; }
        .bl-del:hover { border-color:#ef5350; color:#ef5350; }

        /* PREVIEW PLAYER */
        #u-prev { position:fixed; bottom:0; left:0; right:0; background:#111; z-index:2147483647; display:none; flex-direction:column; border-radius:20px 20px 0 0; box-shadow:0 -10px 50px #000; font-family:sans-serif; }
        #u-prev.on { display:flex; }
        #u-prev-bar { display:flex; align-items:center; padding:12px 15px; gap:8px; border-bottom:1px solid #222; flex-shrink:0; }
        #u-prev-title { flex:1; color:#fff; font-size:13px; font-weight:bold; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        #u-vid-wrap { background:#000; width:100%; height:240px; overflow:hidden; display:flex; align-items:center; justify-content:center; flex-shrink:0; }
        #u-vid { width:100%; height:100%; object-fit:contain; transition:transform .3s; }
        .p-acts { display:flex; gap:8px; padding:12px 15px; overflow-x:auto; background:#161616; flex-shrink:0; }
        .pact { border:none; border-radius:8px; padding:10px 14px; color:white; font-weight:bold; font-size:11px; white-space:nowrap; cursor:pointer; flex-shrink:0; }
        .pact:active { opacity:.7; }
        .pact.bl{background:#1565c0} .pact.gr{background:#2e7d32} .pact.pu{background:#6a1b9a} .pact.te{background:#00796b} .pact.gy{background:#444}

        /* CMD MODAL */
        #u-cmd { position:fixed; top:50%; left:50%; transform:translate(-50%, -50%); background:#111; border-radius:16px; z-index:2147483647; width:94%; max-width:500px; padding:18px; display:none; box-shadow:0 15px 50px #000; font-family:sans-serif; border:1px solid #333; max-height:80vh; overflow-y:auto; }
        #u-cmd.on { display:block; }
        .cmd-block { background:#0a0a0a; border-radius:10px; padding:12px; margin-bottom:12px; border:1px solid #222; }
        .cmd-label { color:#888; font-size:10px; font-weight:bold; text-transform:uppercase; margin-bottom:6px; }
        .cmd-row { display:flex; gap:8px; align-items:stretch; }
        .cmd-ta { flex:1; background:transparent; color:#4caf50; border:none; font-family:monospace; font-size:11px; resize:none; line-height:1.5; outline:none; min-height:40px; }
        .cmd-cp { background:#1565c0; border:none; color:white; border-radius:8px; padding:0 14px; cursor:pointer; font-size:16px; display:flex; align-items:center; flex-shrink:0; }

        /* DROPDOWN */
        #u-drop { position:fixed; background:#1c1c1c; border-radius:12px; border:1px solid #333; z-index:2147483647; display:none; box-shadow:0 10px 40px #000; overflow:hidden; min-width:220px; }
        #u-drop.on { display:block; }
        .di { padding:13px 18px; color:#eee; font-size:13px; cursor:pointer; display:flex; align-items:center; gap:10px; border-bottom:1px solid #252525; }
        .di:hover { background:#2a2a2a; }

        /* ADD BLACKLIST MODAL */
        #u-add-bl { position:fixed; bottom:0; left:0; right:0; background:#1a1a1a; border-radius:20px 20px 0 0; z-index:2147483647; padding:20px; display:none; font-family:sans-serif; border-top:1px solid #333; }
        #u-add-bl.on { display:block; }
        #u-add-bl h4 { color:#fff; margin:0 0 12px; }
        #u-bl-input { width:100%; background:#0a0a0a; border:1px solid #333; border-radius:8px; padding:12px; color:#fff; font-size:14px; box-sizing:border-box; outline:none; font-family:monospace; }
        #u-bl-input:focus { border-color:#e53935; }
        #u-bl-acts { display:flex; gap:8px; margin-top:12px; }

        #u-toast { position:fixed; bottom:30px; left:50%; transform:translateX(-50%); background:#323232; color:white; padding:10px 22px; border-radius:25px; font-size:13px; font-weight:bold; z-index:2147483647; display:none; box-shadow:0 5px 15px rgba(0,0,0,.5); white-space:nowrap; }
    `;

    // ══════════════════════════════════════════
    // INIT UI
    // ══════════════════════════════════════════
    function initUI() {
        const s = document.createElement('style'); s.textContent = CSS; document.head.appendChild(s);
        document.body.insertAdjacentHTML('beforeend', `
            <button id="u-fab">🎬<span id="u-badge"></span></button>
            <div id="u-bd"></div>

            <div id="u-panel">
                <div id="u-ph">
                    <span id="u-ph-title">🎬 Streams</span>
                    <div id="u-ph-acts">
                        <button class="hbtn blue" id="btn-scan">🔍 QUÉT</button>
                        <button class="hbtn gray" id="btn-clr">🗑</button>
                    </div>
                </div>
                <div id="u-tabs">
                    <button class="utab on" data-tab="streams">📺 Streams</button>
                    <button class="utab" data-tab="blacklist">🚫 Chặn Ads</button>
                </div>
                <div id="u-pb"></div>
            </div>

            <div id="u-prev">
                <div id="u-prev-bar">
                    <span id="u-prev-title">-</span>
                    <button id="btn-opt" style="background:#222;border:none;color:#fff;width:36px;height:36px;border-radius:50%;cursor:pointer;font-size:18px">⋮</button>
                    <button id="btn-cls" style="background:#222;border:none;color:#f44336;width:36px;height:36px;border-radius:50%;cursor:pointer;font-size:18px">✕</button>
                </div>
                <div id="u-vid-wrap"><video id="u-vid" controls playsinline></video></div>
                <div class="p-acts" id="u-p-acts"></div>
            </div>

            <div id="u-drop"></div>
            <div id="u-cmd"></div>

            <div id="u-add-bl">
                <h4>🚫 Thêm vào Blacklist</h4>
                <p style="color:#888;font-size:12px;margin:0 0 10px">Nhập domain hoặc từ khóa cần chặn</p>
                <input id="u-bl-input" type="text" placeholder="vd: snaptrckr.fun hoặc smartpop">
                <div id="u-bl-acts">
                    <button class="hbtn blue" id="btn-bl-add" style="flex:1">✓ Thêm & Lưu</button>
                    <button class="hbtn gray" id="btn-bl-cancel" style="flex:1">✕ Hủy</button>
                </div>
            </div>

            <div id="u-toast"></div>
        `);
        initLogic();
    }

    function initLogic() {
        const $ = id => document.getElementById(id);
        let cur = null, rot = 0, zoom = 1, ctab = 'ytdlp', currentPanelTab = 'streams';
        let pendingBlockUrl = '';

        // ── Helpers ──
        function toast(m, color) {
            const t = $('u-toast'); t.textContent = m;
            t.style.background = color || '#323232';
            t.style.display = 'block';
            clearTimeout(t._t); t._t = setTimeout(() => t.style.display='none', 2500);
        }

        function cp(text) {
            const ta = document.createElement('textarea'); ta.value = text;
            ta.style.cssText = 'position:fixed;left:-9999px'; document.body.appendChild(ta);
            ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
            toast('✅ Đã copy!', '#2e7d32');
        }

        function fname(url) {
            try {
                const p = new URL(url).pathname.split('/').filter(Boolean).pop()||'';
                const n = decodeURIComponent(p.split('?')[0]);
                if (n && /\.\w{2,6}$/.test(n)) return n;
            } catch(e) {}
            return 'Media';
        }

        updateBadge = function() {
            const b = $('u-badge');
            const realCount = [...urls.values()].filter(x => x.type !== 'IFRAME' || !isHardAd(x.url)).length;
            if (b) { b.style.display = realCount ? 'flex' : 'none'; b.textContent = realCount; }
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

        // ── Render Panel ──
        function renderPanel() {
            if (currentPanelTab === 'streams') renderStreams();
            else renderBlacklist();
        }

        // ── Render Streams ──
        function renderStreams() {
            const pb = $('u-pb'); pb.innerHTML = '';
            const items = [...urls.values()].sort((a,b) => a.priority - b.priority);

            if (!items.length) {
                pb.innerHTML = '<div style="color:#555;text-align:center;padding:40px 20px;font-size:13px">Chưa tìm thấy media.<br><br>▶️ Phát video rồi nhấn QUÉT</div>';
                return;
            }

            items.forEach(item => {
                const bc = 'lb-' + (['M3U8','MP4','IFRAME'].includes(item.type) ? item.type : 'other');
                const n = fname(item.url);
                const div = document.createElement('div');
                div.className = 'li';
                div.dataset.url = item.url;
                div.innerHTML = `
                    <div class="li-top">
                        <span class="li-badge ${bc}">${item.type}</span>
                        <span class="li-name">${n}</span>
                        <button class="li-block-btn" title="Chặn domain này">🚫</button>
                    </div>
                    <div class="li-src">${item.source}</div>
                    <div class="li-url">${item.url}</div>
                `;
                // Click chính để phát/mở
                div.onclick = (e) => {
                    if (e.target.classList.contains('li-block-btn')) return;
                    const it = urls.get(div.dataset.url);
                    if (it.type === 'IFRAME') {
                        window.open(it.url, '_blank');
                        toast('🚀 Đã mở iframe');
                    } else openPrev(it);
                };
                // Nút chặn
                div.querySelector('.li-block-btn').onclick = (e) => {
                    e.stopPropagation();
                    showAddBlacklist(item.url);
                };
                pb.appendChild(div);
            });
        }

        // ── Render Blacklist ──
        function renderBlacklist() {
            const pb = $('u-pb'); pb.innerHTML = '';

            // Nút thêm thủ công
            pb.insertAdjacentHTML('beforeend', `
                <div style="padding:12px 14px;border-bottom:1px solid #222">
                    <button class="hbtn blue" id="btn-add-manual" style="width:100%">+ Thêm domain/từ khóa chặn</button>
                </div>
                <div style="padding:8px 14px;color:#666;font-size:11px;border-bottom:1px solid #1a1a1a">
                    📦 BLACKLIST MẶC ĐỊNH (Built-in): snaptrckr, mayzaent, myavlive/widgets, smartpop, adsterra, exoclick...
                </div>
            `);
            $('btn-add-manual').onclick = () => showAddBlacklist('');

            if (!blacklist.size) {
                pb.insertAdjacentHTML('beforeend', '<div style="color:#555;text-align:center;padding:30px;font-size:13px">Chưa có domain nào trong blacklist tùy chỉnh.<br>Bấm nút 🚫 trên mỗi link để thêm.</div>');
                return;
            }

            pb.insertAdjacentHTML('beforeend', '<div style="padding:8px 14px;color:#ef5350;font-size:11px;font-weight:bold;border-bottom:1px solid #1a1a1a">🚫 BLACKLIST TÙY CHỈNH (' + blacklist.size + ')</div>');
            [...blacklist].forEach(domain => {
                const div = document.createElement('div');
                div.className = 'bl-item';
                div.innerHTML = `
                    <span class="bl-domain">🚫 ${domain}</span>
                    <button class="bl-del" data-domain="${domain}">Xóa</button>
                `;
                div.querySelector('.bl-del').onclick = () => {
                    blacklist.delete(domain); saveBlacklist();
                    toast('✅ Đã xóa: ' + domain);
                    renderBlacklist();
                };
                pb.appendChild(div);
            });
        }

        // ── Show Add Blacklist ──
        function showAddBlacklist(url) {
            pendingBlockUrl = url;
            try {
                const domain = new URL(url).hostname;
                $('u-bl-input').value = domain;
            } catch(e) {
                $('u-bl-input').value = '';
            }
            $('u-add-bl').classList.add('on');
            $('u-bd').classList.add('on');
            setTimeout(() => $('u-bl-input').focus(), 100);
        }

        $('btn-bl-add').onclick = () => {
            const val = $('u-bl-input').value.trim();
            if (!val) { toast('❌ Nhập domain hoặc từ khóa!', '#c62828'); return; }
            blacklist.add(val);
            saveBlacklist();
            // Xóa các URL đã bị chặn khỏi danh sách
            urls.forEach((item, key) => { if (key.includes(val)) urls.delete(key); });
            updateBadge();
            $('u-add-bl').classList.remove('on');
            toast('✅ Đã thêm vào blacklist: ' + val, '#2e7d32');
            renderPanel();
        };

        $('btn-bl-cancel').onclick = () => {
            $('u-add-bl').classList.remove('on');
            if (!$('u-panel').classList.contains('on')) $('u-bd').classList.remove('on');
        };

        // ── Open Preview ──
        function openPrev(item) {
            cur = item; rot = 0; zoom = 1;
            $('u-vid').style.transform = 'none';
            $('u-prev-title').textContent = fname(item.url);
            $('u-vid').src = item.url;
            $('u-vid').onerror = () => toast('❌ Không phát được, thử VLC hoặc tab mới', '#c62828');
            $('u-p-acts').innerHTML = `
                <button class="pact bl" id="pc-cp">📋 Copy</button>
                <button class="pact gr" id="pc-vlc">📺 VLC</button>
                <button class="pact pu" id="pc-ytdl">💻 Tải</button>
                <button class="pact te" id="pc-rot">⟳ Xoay</button>
                <button class="pact gy" id="pc-zm">🔍 ${zoom}x</button>
            `;
            $('pc-cp').onclick  = () => cp(cur.url);
            $('pc-vlc').onclick = () => window.location.href = 'vlc://' + cur.url;
            $('pc-ytdl').onclick= () => openCmd(cur.url);
            $('pc-rot').onclick = () => { rot=(rot+90)%360; $('u-vid').style.transform=`rotate(${rot}deg) scale(${zoom})`; };
            $('pc-zm').onclick  = (e) => {
                const lv=[1,1.25,1.5,2,0.75];
                zoom=lv[(lv.indexOf(zoom)+1)%lv.length];
                e.target.textContent=`🔍 ${zoom}x`;
                $('u-vid').style.transform=`rotate(${rot}deg) scale(${zoom})`;
            };
            $('u-prev').classList.add('on');
            $('u-bd').classList.add('on');
            $('u-panel').classList.remove('on');
        }

        // ── CMD Modal ──
        function openCmd(url) {
            const build = (t) => {
                ctab = t;
                const data = {
                    ytdlp: [
                        { l:'Tải chất lượng cao', c:`yt-dlp --referer "${REF}" "${url}"` },
                        { l:'Bypass với Header đầy đủ', c:`yt-dlp --referer "${REF}" --user-agent "${UA}" --add-header "Origin:${location.origin}" -f "bestvideo+bestaudio" "${url}"` },
                        { l:'Chỉ Audio MP3', c:`yt-dlp -x --audio-format mp3 --referer "${REF}" "${url}"` },
                    ],
                    ffmpeg: [
                        { l:'Copy stream (Nhanh)', c:`ffmpeg -referer "${REF}" -user_agent "${UA}" -i "${url}" -c copy output.mp4` },
                        { l:'Re-encode H264', c:`ffmpeg -referer "${REF}" -i "${url}" -c:v libx264 -c:a aac output.mp4` },
                    ],
                    termux: [
                        { l:'Cài tools', c:`pkg install python ffmpeg -y && pip install yt-dlp` },
                        { l:'Tải video', c:`yt-dlp --referer "${REF}" "${url}"` },
                        { l:'FFmpeg HLS', c:`ffmpeg -referer "${REF}" -i "${url}" -c copy ~/storage/downloads/out.mp4` },
                    ],
                }[t] || [];

                $('u-cmd').innerHTML = `
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:15px">
                        <h4 style="color:#fff;margin:0">💻 Lệnh tải</h4>
                        <span style="color:#555;font-size:10px;font-family:monospace;max-width:150px;overflow:hidden;text-overflow:ellipsis">${fname(url)}</span>
                    </div>
                    <div style="display:flex;gap:5px;margin-bottom:15px">
                        ${['ytdlp','ffmpeg','termux'].map(tab=>`
                            <button style="flex:1;background:${tab===t?'#e53935':'#222'};color:white;border:none;padding:8px;border-radius:8px;cursor:pointer;font-size:11px;font-weight:bold" data-tab="${tab}">${tab.toUpperCase()}</button>
                        `).join('')}
                    </div>
                    <div id="cmd-list">
                        ${data.map(d=>`
                            <div class="cmd-block">
                                <div class="cmd-label">${d.l}</div>
                                <div class="cmd-row">
                                    <textarea class="cmd-ta" rows="2" readonly>${d.c}</textarea>
                                    <button class="cmd-cp">📋</button>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                    <button style="width:100%;background:#c62828;border:none;color:white;padding:12px;border-radius:8px;cursor:pointer;font-weight:bold;margin-top:4px" id="cmd-cls">ĐÓNG</button>
                `;
                // Auto resize textareas
                $('u-cmd').querySelectorAll('.cmd-ta').forEach(ta => {
                    ta.style.height = 'auto';
                    ta.style.height = ta.scrollHeight + 'px';
                });
                $('u-cmd').querySelectorAll('[data-tab]').forEach(b => b.onclick = () => build(b.dataset.tab));
                $('u-cmd').querySelectorAll('.cmd-cp').forEach(b => b.onclick = () => cp(b.parentElement.querySelector('.cmd-ta').value));
                $('cmd-cls').onclick = () => {
                    $('u-cmd').classList.remove('on');
                    if (!$('u-prev').classList.contains('on') && !$('u-panel').classList.contains('on'))
                        $('u-bd').classList.remove('on');
                };
            };
            build(ctab);
            $('u-cmd').classList.add('on');
            $('u-bd').classList.add('on');
        }

        // ── Dropdown ⋮ ──
        $('btn-opt').onclick = (e) => {
            e.stopPropagation();
            const d = $('u-drop');
            d.innerHTML = `
                <div class="di" id="m-qs">🎞 Chọn chất lượng</div>
                <div class="di" id="m-new">🌐 Mở tab mới</div>
                <div class="di" id="m-share">🔗 Chia sẻ</div>
                <div class="di" id="m-block" style="color:#ef5350">🚫 Chặn domain này</div>
                <div class="di" id="m-ddrop">✕ Đóng menu</div>
            `;
            const r = $('btn-opt').getBoundingClientRect();
            d.style.top=(r.bottom+10)+'px'; d.style.right='15px'; d.style.display='block';

            $('m-qs').onclick = () => {
                d.style.display='none';
                if (!cur || cur.type!=='M3U8') { toast('Chỉ hỗ trợ HLS stream'); return; }
                toast('⏳ Đang parse M3U8...');
                fetch(cur.url).then(r=>r.text()).then(text=>{
                    if (!text.includes('#EXT-X-STREAM-INF')) { toast('Không có multi-quality'); return; }
                    const lines=text.split('\n'), qs=[];
                    for (let i=0;i<lines.length;i++) {
                        if (lines[i].includes('RESOLUTION=')) {
                            const res=lines[i].match(/RESOLUTION=(\d+x\d+)/)?.[1]||'';
                            const bw=lines[i].match(/BANDWIDTH=(\d+)/)?.[1]||'0';
                            const next=(lines[i+1]||'').trim();
                            if (next&&!next.startsWith('#')) {
                                const su=next.startsWith('http')?next:cur.url.substring(0,cur.url.lastIndexOf('/')+1)+next;
                                qs.push({label:res.split('x')[1]+'p', url:su, bw:parseInt(bw)});
                            }
                        }
                    }
                    qs.sort((a,b)=>b.bw-a.bw);
                    if (!qs.length) { toast('Không parse được quality'); return; }
                    const dd=$('u-drop');
                    dd.innerHTML=`<div style="padding:10px 16px;color:#888;font-size:11px;font-weight:bold;border-bottom:1px solid #333">CHẤT LƯỢNG</div>`+
                        qs.map(q=>`<div class="di q-item" data-url="${q.url}">📺 ${q.label}</div>`).join('');
                    dd.style.display='block';
                    dd.querySelectorAll('.q-item').forEach(qi=>qi.onclick=()=>{
                        $('u-vid').src=qi.dataset.url;
                        dd.style.display='none';
                        toast('▶ Đang phát '+qi.textContent.trim());
                    });
                }).catch(()=>toast('❌ Lỗi parse M3U8'));
            };
            $('m-new').onclick = () => { window.open(cur.url,'_blank'); d.style.display='none'; };
            $('m-share').onclick = () => { navigator.share({url:cur.url}); d.style.display='none'; };
            $('m-block').onclick = () => { d.style.display='none'; showAddBlacklist(cur.url); };
            $('m-ddrop').onclick = () => d.style.display='none';
        };

        // ── FAB & Events ──
        $('u-fab').onclick = () => {
            if ($('u-panel').classList.contains('on')) {
                $('u-panel').classList.remove('on'); $('u-bd').classList.remove('on');
            } else {
                scan(document,'main'); scanPerf(); renderPanel();
                $('u-panel').classList.add('on'); $('u-bd').classList.add('on');
            }
        };
        $('btn-scan').onclick = () => { scan(document,'deep'); scanPerf(); renderPanel(); toast('✅ Quét xong! '+urls.size+' links'); };
        $('btn-clr').onclick = () => { urls.clear(); updateBadge(); renderPanel(); toast('🗑 Đã xóa'); };
        $('btn-cls').onclick = () => {
            $('u-vid').pause(); $('u-vid').src='';
            $('u-prev').classList.remove('on'); $('u-bd').classList.remove('on');
        };

        $('u-bd').onclick = (e) => {
            if ($('u-add-bl').classList.contains('on')) { $('u-add-bl').classList.remove('on'); }
            if ($('u-drop').style.display==='block') { $('u-drop').style.display='none'; return; }
            if ($('u-cmd').classList.contains('on')) { $('u-cmd').classList.remove('on'); }
            $('u-panel').classList.remove('on');
            $('u-prev').classList.remove('on');
            $('u-bd').classList.remove('on');
            $('u-vid').pause();
        };

        // Click ngoài dropdown
        document.addEventListener('click', (e) => {
            const d = $('u-drop');
            if (d.style.display==='block' && !d.contains(e.target) && e.target.id!=='btn-opt')
                d.style.display='none';
        });
    }

    // ══════════════════════════════════════════
    // AUTO START
    // ══════════════════════════════════════════
    setInterval(scanPerf, 3000);
    setTimeout(() => { scan(document,'auto'); updateBadge(); }, 2000);
    if (document.body) initUI();
    else document.addEventListener('DOMContentLoaded', initUI);

})();