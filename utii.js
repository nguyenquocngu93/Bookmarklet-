// ==UserScript==
// @name         Universal Media Player v18 - AdBlock + JS Filter + Landscape
// @namespace    http://tampermonkey.net/
// @version      18.0
// @description  Fullscreen xoay ngang + Tab JS riêng để chặn + Load đầy đủ scripts
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
    const STORAGE_KEY   = 'ump_blacklist';
    const WHITELIST_KEY = 'ump_whitelist';
    const JS_BLACK_KEY  = 'ump_js_blacklist';

    function loadSet(key) {
        try { return new Set(JSON.parse(localStorage.getItem(key) || '[]')); }
        catch(e) { return new Set(); }
    }
    function saveSet(key, set) {
        localStorage.setItem(key, JSON.stringify([...set]));
    }

    let blacklist   = loadSet(STORAGE_KEY);
    let whitelist   = loadSet(WHITELIST_KEY);
    let jsBlacklist = loadSet(JS_BLACK_KEY); // Domain/pattern JS bị chặn

    // ══════════════════════════════════════════
    // BỘ LỌC
    // ══════════════════════════════════════════
    const AD_HARD = [
        /doubleclick\.net/i, /googlesyndication/i, /googleadservices/i,
        /adnxs\.com/i, /rubiconproject/i, /openx\.net/i,
        /snaptrckr/i, /mayzaent/i, /myavlive\.com\/widgets/i,
        /smartpop/i, /popunder/i, /popcash/i, /propellerads/i,
        /exoclick/i, /juicyads/i, /trafficjunky/i, /tsyndicate/i,
        /adsterra/i, /hilltopads/i, /clickadu/i, /megapu\.sh/i,
        /realsrv/i, /jetpackdigital/i, /adspyglass/i
    ];

    const NON_MEDIA = [
        /\.css(\?|$)/i, /\.woff/i, /\.ttf/i,
        /\.png(\?|$)/i, /\.jpg(\?|$)/i, /\.gif(\?|$)/i,
        /\.svg(\?|$)/i, /\.ico(\?|$)/i, /\.webp(\?|$)/i,
        /jwplayer\.core/i, /jwpsrv/i, /jwplayer\.js/i,
        /provider\.hlsjs/i, /related\.js/i, /analytics/i,
        /tracking/i, /pixel/i, /beacon/i, /telemetry/i,
        /fingerprint/i, /metrics/i, /stats\./i
    ];

    const AD_PATHS = [
        /\/ads?\//i, /\/adv\//i, /\/banner/i, /\/sponsor/i,
        /\/promo/i, /\/campaign/i, /\/creative/i, /impressionId/i,
        /externalId/i, /campaignId/i, /\/smartpop\//i,
        /under_player/i, /gridRows/i, /thumbsMargin/i
    ];

    const SAFE_DOMAINS = [
        /surrit\.com/i, /streamvid/i, /jwpcdn\.com\/player\/v/i,
        /hls\.js/i, /cdn\.jsdelivr/i, /cdnjs/i, /googleapis\.com\/ajax/i
    ];

    function isHardAd(url) {
        if (!url) return false;
        if ([...whitelist].some(w => url.includes(w))) return false;
        if (SAFE_DOMAINS.some(r => r.test(url))) return false;
        if ([...blacklist].some(b => url.includes(b))) return true;
        if (AD_HARD.some(r => r.test(url))) return true;
        if (AD_PATHS.some(r => r.test(url))) return true;
        return false;
    }

    function isNonMedia(url) {
        if (!url) return false;
        return NON_MEDIA.some(r => r.test(url));
    }

    // ══════════════════════════════════════════
    // JS SCRIPTS COLLECTOR
    // Bắt tất cả script được load trên trang
    // ══════════════════════════════════════════
    const jsScripts = new Map(); // url → { url, blocked, source, ts }

    function addJsScript(src, source) {
        if (!src || typeof src !== 'string') return;
        if (!src.startsWith('http') && !src.startsWith('//')) return;
        const url = src.startsWith('//') ? 'https:' + src : src;
        if (jsScripts.has(url)) return;

        const blocked = isJsBlocked(url);
        jsScripts.set(url, {
            url,
            source,
            blocked,
            ts: Date.now(),
            domain: (() => { try { return new URL(url).hostname; } catch(e) { return url; } })()
        });

        // Nếu đã trong blacklist → chặn thực sự
        if (blocked) blockJsExecution(url);

        updateBadge();
    }

    function isJsBlocked(url) {
        return [...jsBlacklist].some(b => url.includes(b));
    }

    // Hook createElement để bắt script động
    const _createElement = document.createElement.bind(document);
    document.createElement = function(tag) {
        const el = _createElement(tag);
        if (tag.toLowerCase() === 'script') {
            // Theo dõi khi src được set
            const origSrcDesc = Object.getOwnPropertyDescriptor(HTMLScriptElement.prototype, 'src');
            let _src = '';
            Object.defineProperty(el, 'src', {
                get() { return origSrcDesc ? origSrcDesc.get.call(this) : _src; },
                set(val) {
                    _src = val;
                    addJsScript(val, 'createElement');
                    if (isJsBlocked(val)) {
                        // Không set src thực → script không load
                        el.setAttribute('data-ump-blocked', val);
                        el.type = 'text/ump-blocked';
                        return;
                    }
                    if (origSrcDesc) origSrcDesc.set.call(this, val);
                    else HTMLScriptElement.prototype.src = val;
                },
                configurable: true
            });
        }
        return el;
    };

    // Hook insertAdjacentHTML & innerHTML để bắt script trong HTML
    function scanForScripts(html, source) {
        if (!html || typeof html !== 'string') return;
        const matches = html.match(/src=["']([^"']+\.js[^"']*)/gi) || [];
        matches.forEach(m => {
            const url = m.replace(/src=["']/i, '').replace(/["']/g, '');
            addJsScript(url, source);
        });
    }

    // Chặn thực thi JS đã bị blacklist bằng cách xóa các script tag có src đó
    function blockJsExecution(url) {
        try {
            document.querySelectorAll(`script[src*="${url.split('/').pop()}"]`).forEach(s => {
                s.type = 'text/ump-blocked';
                s.remove();
            });
        } catch(e) {}
    }

    // ══════════════════════════════════════════
    // URL DETECTION (Media)
    // ══════════════════════════════════════════
    const urls = new Map();
    const patterns = [
        { re: /https?:\/\/[^\s"'<>()\\\]]+\.m3u8[^\s"'<>()\\\]]*/gi, type: 'M3U8', priority: 1 },
        { re: /https?:\/\/[^\s"'<>()\\\]]+\.mpd[^\s"'<>()\\\]]*/gi,  type: 'MPD',  priority: 2 },
        { re: /https?:\/\/[^\s"'<>()\\\]]+\.mp4[^\s"'<>()\\\]]*/gi,  type: 'MP4',  priority: 3 },
        { re: /https?:\/\/[^\s"'<>()\\\]]+\.webm[^\s"'<>()\\\]]*/gi, type: 'WEBM', priority: 4 },
        { re: /https?:\/\/[^\s"'<>()\\\]]+\.mkv[^\s"'<>()\\\]]*/gi,  type: 'MKV',  priority: 5 },
    ];

    const IFRAME_PLAYER_RE = [
        /https?:\/\/[^\s"'<>]+\/(v|embed|e|vv|jm|t|watch|player)\/[a-zA-Z0-9_\-]{6,}/gi,
        /https?:\/\/(?:videplay|streamvid|surrit|doodstream|mixdrop|fembed|filemoon)[^\s"'<>]*/gi,
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
        if (isHardAd(u)) { console.log('[UMP-BLOCK]', u); return; }
        if (isNonMedia(u) && type !== 'IFRAME') return;
        if (!urls.has(u) || urls.get(u).priority > priority) {
            urls.set(u, { url: u, type, source, priority, ts: Date.now() });
            updateBadge();
        }
    }

    function findUrls(text, source) {
        if (!text || typeof text !== 'string') return;
        // Bắt JS scripts trong text
        scanForScripts(text, source);
        // Media patterns
        patterns.forEach(p => {
            const m = text.match(p.re);
            if (m) m.forEach(u => addUrl(u, p.type, source, p.priority));
        });
        // Iframe patterns
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
            // Media elements
            doc.querySelectorAll('video,source,audio').forEach(v => {
                if (v.src) findUrls(v.src, src+':el');
                if (v.currentSrc) findUrls(v.currentSrc, src+':cur');
            });
            // Iframes
            doc.querySelectorAll('iframe').forEach((f,i) => {
                if (f.src && !isHardAd(f.src) && !isNonMedia(f.src))
                    addUrl(f.src, 'IFRAME', src+':if', 99);
                try { if (f.contentDocument) scan(f.contentDocument, src+':if'+i); } catch(e) {}
            });
            // Scripts → thu thập JS
            doc.querySelectorAll('script[src]').forEach(s => {
                addJsScript(s.src, src + ':script-tag');
            });
            doc.querySelectorAll('script:not([src])').forEach(s => {
                findUrls(s.textContent, src+':js');
            });
            // HTML tổng
            findUrls(doc.documentElement.outerHTML, src+':html');
        } catch(e) {}
    }

    // Hook Network
    const _fetch   = window.fetch;
    const _xhrOpen = XMLHttpRequest.prototype.open;

    window.fetch = function(...a) {
        try {
            const u = typeof a[0]==='string' ? a[0] : (a[0] && a[0].url) || '';
            if (u) {
                if (u.endsWith('.js') || u.includes('.js?')) addJsScript(u, 'fetch');
                else findUrls(u, 'fetch');
            }
        } catch(e) {}
        return _fetch.apply(this, a);
    };

    XMLHttpRequest.prototype.open = function(m, u) {
        try {
            if (u) {
                const su = String(u);
                if (su.endsWith('.js') || su.includes('.js?')) addJsScript(su, 'xhr');
                else findUrls(su, 'xhr');
            }
        } catch(e) {}
        return _xhrOpen.apply(this, arguments);
    };

    function scanPerf() {
        try {
            performance.getEntriesByType('resource').forEach(e => {
                const name = e.name;
                if (!name) return;
                // Phân loại: JS hay media
                if (/\.js(\?|$)/i.test(name)) {
                    addJsScript(name, 'perf');
                } else if (!isHardAd(name) && !isNonMedia(name)) {
                    findUrls(name, 'perf');
                }
            });
        } catch(e) {}
    }

    let updateBadge = () => {};

    // ══════════════════════════════════════════
    // CSS
    // ══════════════════════════════════════════
    const CSS = `
        /* ── FAB ── */
        #u-fab {
            position:fixed; bottom:20px; right:20px;
            width:56px; height:56px;
            background:#e53935; color:white; border:none;
            border-radius:50%; font-size:24px; cursor:pointer;
            box-shadow:0 4px 20px rgba(0,0,0,.5);
            z-index:2147483647;
            display:flex; align-items:center; justify-content:center;
        }
        #u-badge {
            position:absolute; top:-2px; right:-2px;
            background:#43a047; color:white;
            font-size:10px; min-width:20px; height:20px;
            border-radius:10px; display:none;
            align-items:center; justify-content:center;
            font-weight:bold; border:2px solid #000;
        }

        /* ── BACKDROP ── */
        #u-bd {
            position:fixed; inset:0;
            background:rgba(0,0,0,.78);
            z-index:2147483640; display:none;
        }
        #u-bd.on { display:block; }

        /* ── PANEL ── */
        #u-panel {
            position:fixed; bottom:86px; right:12px;
            width:calc(100vw - 24px); max-width:400px;
            max-height:72vh; background:#111;
            border-radius:16px; z-index:2147483647;
            display:none; flex-direction:column;
            box-shadow:0 12px 40px #000;
            overflow:hidden; font-family:sans-serif;
            border:1px solid #222;
        }
        #u-panel.on { display:flex; }

        #u-ph {
            background:#1e1e1e; padding:12px 14px;
            display:flex; align-items:center; gap:8px;
            border-bottom:1px solid #2a2a2a;
            flex-shrink:0; min-height:52px;
        }
        #u-ph-title { color:#fff; font-size:14px; font-weight:bold; flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        #u-ph-acts  { display:flex; gap:6px; align-items:center; flex-shrink:0; }

        .hbtn { border:none; border-radius:8px; cursor:pointer; font-size:11px; font-weight:bold; padding:8px 12px; color:white; white-space:nowrap; }
        .hbtn.blue { background:#1565c0; }
        .hbtn.gray { background:#333; color:#aaa; }
        .hbtn.red  { background:#c62828; }
        .hbtn.grn  { background:#2e7d32; }

        /* ── TABS (4 tabs) ── */
        #u-tabs { display:flex; background:#161616; border-bottom:1px solid #222; flex-shrink:0; overflow-x:auto; }
        .utab {
            flex:1; min-width:0; padding:9px 4px;
            border:none; background:none; color:#666;
            font-size:10px; font-weight:bold; cursor:pointer;
            border-bottom:2px solid transparent; white-space:nowrap;
        }
        .utab.on { color:#e53935; border-bottom-color:#e53935; }

        #u-pb { overflow-y:auto; flex:1; background:#0a0a0a; }

        /* ── LIST ITEMS (Media) ── */
        .li { padding:12px 14px; border-bottom:1px solid #181818; cursor:pointer; position:relative; }
        .li:active { background:#1a1a1a; }
        .li-top { display:flex; align-items:center; gap:8px; margin-bottom:5px; }
        .li-badge { font-size:10px; font-weight:900; padding:3px 8px; border-radius:5px; color:white; text-transform:uppercase; flex-shrink:0; }
        .lb-M3U8{background:#7b1fa2;} .lb-MP4{background:#2e7d32;} .lb-IFRAME{background:#1565c0;} .lb-other{background:#444;}
        .li-name { color:#fff; font-size:13px; font-weight:600; flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .li-src  { color:#555; font-size:10px; margin-bottom:4px; }
        .li-url  { color:#4fc3f7; font-size:10px; font-family:monospace; word-break:break-all; background:#000; padding:8px; border-radius:6px; line-height:1.4; border:1px solid #222; }
        .li-block-btn { position:absolute; top:12px; right:12px; background:#c62828; border:none; color:white; font-size:10px; padding:3px 8px; border-radius:5px; cursor:pointer; }

        /* ── JS SCRIPT ITEMS ── */
        .js-item {
            padding:10px 14px; border-bottom:1px solid #181818;
            display:flex; align-items:flex-start; gap:8px;
            position:relative;
        }
        .js-item.blocked { background:#1a0000; }
        .js-info { flex:1; min-width:0; }
        .js-domain { font-size:12px; font-weight:bold; color:#fff; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .js-domain.blocked-txt { color:#ef5350; text-decoration:line-through; }
        .js-url   { color:#555; font-size:10px; word-break:break-all; margin-top:2px; line-height:1.4; }
        .js-src   { color:#333; font-size:9px; margin-top:2px; }
        .js-toggle {
            flex-shrink:0; border:none; border-radius:6px;
            padding:5px 10px; font-size:11px; font-weight:bold;
            cursor:pointer; margin-top:2px;
        }
        .js-toggle.block  { background:#c62828; color:#fff; }
        .js-toggle.unblock{ background:#2e7d32; color:#fff; }

        /* ── BLACKLIST ITEMS ── */
        .bl-item { padding:10px 14px; border-bottom:1px solid #181818; display:flex; align-items:center; gap:8px; }
        .bl-domain { color:#ef5350; font-size:12px; font-family:monospace; flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .bl-del { background:none; border:1px solid #333; color:#555; font-size:12px; padding:4px 10px; border-radius:5px; cursor:pointer; }
        .bl-del:hover { border-color:#ef5350; color:#ef5350; }

        /* ── PREVIEW PLAYER ── */
        #u-prev {
            position:fixed; bottom:0; left:0; right:0;
            background:#111; z-index:2147483647;
            display:none; flex-direction:column;
            border-radius:20px 20px 0 0;
            box-shadow:0 -10px 50px #000; font-family:sans-serif;
        }
        #u-prev.on { display:flex; }

        #u-prev-bar {
            display:flex; align-items:center;
            padding:12px 15px; gap:8px;
            border-bottom:1px solid #222; flex-shrink:0;
        }
        #u-prev-title { flex:1; color:#fff; font-size:13px; font-weight:bold; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }

        #u-vid-wrap {
            background:#000; width:100%; height:240px;
            overflow:hidden; display:flex;
            align-items:center; justify-content:center; flex-shrink:0;
        }
        #u-vid { width:100%; height:100%; object-fit:contain; transition:transform .3s; }

        .p-acts { display:flex; gap:8px; padding:12px 15px; overflow-x:auto; background:#161616; flex-shrink:0; }
        .pact { border:none; border-radius:8px; padding:10px 14px; color:white; font-weight:bold; font-size:11px; white-space:nowrap; cursor:pointer; flex-shrink:0; }
        .pact:active { opacity:.7; }
        .pact.bl{background:#1565c0} .pact.gr{background:#2e7d32}
        .pact.pu{background:#6a1b9a} .pact.te{background:#00796b}
        .pact.gy{background:#444}   .pact.rd{background:#c62828}

        /* Fullscreen landscape indicator */
        #u-fs-hint {
            position:fixed; top:10px; left:50%;
            transform:translateX(-50%);
            background:rgba(0,0,0,.7); color:#fff;
            font-size:11px; padding:5px 14px; border-radius:20px;
            z-index:2147483647; display:none;
            font-family:sans-serif;
        }

        /* ── CMD MODAL ── */
        #u-cmd {
            position:fixed; top:50%; left:50%;
            transform:translate(-50%, -50%);
            background:#111; border-radius:16px;
            z-index:2147483647; width:94%; max-width:500px;
            padding:18px; display:none;
            box-shadow:0 15px 50px #000; font-family:sans-serif;
            border:1px solid #333; max-height:80vh; overflow-y:auto;
        }
        #u-cmd.on { display:block; }
        .cmd-block { background:#0a0a0a; border-radius:10px; padding:12px; margin-bottom:12px; border:1px solid #222; }
        .cmd-label { color:#888; font-size:10px; font-weight:bold; text-transform:uppercase; margin-bottom:6px; }
        .cmd-row   { display:flex; gap:8px; align-items:stretch; }
        .cmd-ta    { flex:1; background:transparent; color:#4caf50; border:none; font-family:monospace; font-size:11px; resize:none; line-height:1.5; outline:none; min-height:40px; }
        .cmd-cp    { background:#1565c0; border:none; color:white; border-radius:8px; padding:0 14px; cursor:pointer; font-size:16px; display:flex; align-items:center; flex-shrink:0; }

        /* ── DROPDOWN ── */
        #u-drop {
            position:fixed; background:#1c1c1c;
            border-radius:12px; border:1px solid #333;
            z-index:2147483647; display:none;
            box-shadow:0 10px 40px #000; overflow:hidden; min-width:220px;
        }
        #u-drop.on { display:block; }
        .di { padding:13px 18px; color:#eee; font-size:13px; cursor:pointer; display:flex; align-items:center; gap:10px; border-bottom:1px solid #252525; }
        .di:hover { background:#2a2a2a; }

        /* ── ADD BLACKLIST ── */
        #u-add-bl {
            position:fixed; bottom:0; left:0; right:0;
            background:#1a1a1a; border-radius:20px 20px 0 0;
            z-index:2147483647; padding:20px; display:none;
            font-family:sans-serif; border-top:1px solid #333;
        }
        #u-add-bl.on { display:block; }
        #u-add-bl h4 { color:#fff; margin:0 0 12px; }
        #u-bl-input {
            width:100%; background:#0a0a0a; border:1px solid #333;
            border-radius:8px; padding:12px; color:#fff;
            font-size:14px; box-sizing:border-box; outline:none; font-family:monospace;
        }
        #u-bl-input:focus { border-color:#e53935; }
        #u-bl-acts { display:flex; gap:8px; margin-top:12px; }

        /* ── TOAST ── */
        #u-toast {
            position:fixed; bottom:30px; left:50%;
            transform:translateX(-50%);
            background:#323232; color:white;
            padding:10px 22px; border-radius:25px;
            font-size:13px; font-weight:bold;
            z-index:2147483647; display:none;
            box-shadow:0 5px 15px rgba(0,0,0,.5); white-space:nowrap;
        }

        /* ── JS FILTER BADGE ── */
        .js-count-badge {
            background:#e53935; color:#fff;
            font-size:9px; padding:1px 5px;
            border-radius:8px; margin-left:4px;
            font-weight:bold;
        }
    `;

    // ══════════════════════════════════════════
    // INIT UI
    // ══════════════════════════════════════════
    function initUI() {
        const s = document.createElement('style');
        s.textContent = CSS;
        document.head.appendChild(s);

        document.body.insertAdjacentHTML('beforeend', `
            <button id="u-fab">🎬<span id="u-badge"></span></button>
            <div id="u-bd"></div>
            <div id="u-fs-hint">📱 Đã bật fullscreen ngang</div>

            <div id="u-panel">
                <div id="u-ph">
                    <span id="u-ph-title">🎬 Media Player</span>
                    <div id="u-ph-acts">
                        <button class="hbtn blue" id="btn-scan">🔍 QUÉT</button>
                        <button class="hbtn gray" id="btn-clr">🗑</button>
                    </div>
                </div>
                <div id="u-tabs">
                    <button class="utab on" data-tab="streams">📺 Streams</button>
                    <button class="utab"    data-tab="jsscripts">🔧 Scripts</button>
                    <button class="utab"    data-tab="blacklist">🚫 Chặn</button>
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

            <div id="u-add-bl">
                <h4>🚫 Thêm vào Blacklist</h4>
                <p style="color:#888;font-size:12px;margin:0 0 10px">Nhập domain hoặc từ khóa cần chặn</p>
                <input id="u-bl-input" type="text" placeholder="vd: snaptrckr.fun hoặc /ads/">
                <div id="u-bl-acts">
                    <button class="hbtn blue" id="btn-bl-add"    style="flex:1">✓ Thêm & Lưu</button>
                    <button class="hbtn gray" id="btn-bl-cancel" style="flex:1">✕ Hủy</button>
                </div>
            </div>

            <div id="u-toast"></div>
        `);

        initLogic();
    }

    // ══════════════════════════════════════════
    // LOGIC
    // ══════════════════════════════════════════
    function initLogic() {
        const $ = id => document.getElementById(id);
        let cur = null, rot = 0, zoom = 1;
        let ctab = 'ytdlp', currentPanelTab = 'streams';

        // ── Toast ──
        function toast(m, color) {
            const t = $('u-toast');
            t.textContent = m;
            t.style.background = color || '#323232';
            t.style.display = 'block';
            clearTimeout(t._t);
            t._t = setTimeout(() => t.style.display = 'none', 2500);
        }

        // ── Copy ──
        function cp(text) {
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.style.cssText = 'position:fixed;left:-9999px';
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
            toast('✅ Đã copy!', '#2e7d32');
        }

        // ── Filename ──
        function fname(url) {
            try {
                const p = new URL(url).pathname.split('/').filter(Boolean).pop() || '';
                const n = decodeURIComponent(p.split('?')[0]);
                if (n && /\.\w{2,6}$/.test(n)) return n;
            } catch(e) {}
            return 'Media';
        }

        // ── Badge update ──
        updateBadge = function() {
            const b = $('u-badge');
            if (!b) return;
            const mediaCount = urls.size;
            const blockedJs  = [...jsScripts.values()].filter(j => j.blocked).length;
            const total      = mediaCount + (blockedJs > 0 ? blockedJs : 0);
            b.style.display  = total ? 'flex' : 'none';
            b.textContent    = total > 99 ? '99+' : total;
        };

        // ══════════════════════════════════════
        // FULLSCREEN LANDSCAPE FIX
        // ══════════════════════════════════════
        function enterFullscreenLandscape() {
            const vid = $('u-vid');
            if (!vid) return;

            const tryLock = () => {
                // Thử lock orientation
                if (screen.orientation && screen.orientation.lock) {
                    screen.orientation.lock('landscape').catch(() => {});
                }
            };

            // Bắt sự kiện fullscreen change
            const onFsChange = () => {
                const fsEl = document.fullscreenElement ||
                             document.webkitFullscreenElement ||
                             document.mozFullScreenElement;
                if (fsEl) {
                    tryLock();
                    // Hiện hint
                    const hint = $('u-fs-hint');
                    if (hint) {
                        hint.style.display = 'block';
                        setTimeout(() => hint.style.display = 'none', 2000);
                    }
                } else {
                    // Thoát fullscreen → unlock
                    if (screen.orientation && screen.orientation.unlock) {
                        screen.orientation.unlock();
                    }
                }
            };

            document.addEventListener('fullscreenchange',       onFsChange);
            document.addEventListener('webkitfullscreenchange', onFsChange);
            document.addEventListener('mozfullscreenchange',    onFsChange);

            // Override nút fullscreen của video tag
            vid.addEventListener('webkitbeginfullscreen', tryLock);
            vid.addEventListener('enterpictureinpicture', () => {});

            // Manual fullscreen button (trong preview)
            return function triggerFs() {
                const req = vid.requestFullscreen ||
                            vid.webkitRequestFullscreen ||
                            vid.mozRequestFullScreen;
                if (req) {
                    req.call(vid).then(() => tryLock()).catch(() => {
                        toast('❌ Trình duyệt chặn fullscreen ngang', '#c62828');
                    });
                }
            };
        }

        const triggerFullscreen = enterFullscreenLandscape();

        // ══════════════════════════════════════
        // RENDER PANEL
        // ══════════════════════════════════════
        function renderPanel() {
            // Cập nhật tab counter
            document.querySelectorAll('.utab').forEach(tab => {
                const existing = tab.querySelector('.js-count-badge');
                if (existing) existing.remove();
                if (tab.dataset.tab === 'jsscripts') {
                    const blocked = [...jsScripts.values()].filter(j => j.blocked).length;
                    if (blocked > 0) {
                        tab.insertAdjacentHTML('beforeend',
                            `<span class="js-count-badge">${blocked}</span>`
                        );
                    }
                }
            });

            if      (currentPanelTab === 'streams')   renderStreams();
            else if (currentPanelTab === 'jsscripts') renderJsScripts();
            else if (currentPanelTab === 'blacklist') renderBlacklist();
        }

        // ── Tab Switch ──
        document.querySelectorAll('.utab').forEach(tab => {
            tab.onclick = () => {
                document.querySelectorAll('.utab').forEach(t => t.classList.remove('on'));
                tab.classList.add('on');
                currentPanelTab = tab.dataset.tab;
                renderPanel();
            };
        });

        // ══════════════════════════════════════
        // TAB: STREAMS
        // ══════════════════════════════════════
        function renderStreams() {
            const pb = $('u-pb');
            pb.innerHTML = '';
            const items = [...urls.values()].sort((a,b) => a.priority - b.priority);

            if (!items.length) {
                pb.innerHTML = `
                    <div style="color:#555;text-align:center;padding:40px 20px;font-size:13px">
                        Chưa tìm thấy media stream.<br><br>
                        ▶️ Phát video rồi nhấn 🔍 QUÉT
                    </div>`;
                return;
            }

            items.forEach(item => {
                const bc  = 'lb-' + (['M3U8','MP4','IFRAME'].includes(item.type) ? item.type : 'other');
                const n   = fname(item.url);
                const div = document.createElement('div');
                div.className   = 'li';
                div.dataset.url = item.url;
                div.innerHTML   = `
                    <div class="li-top">
                        <span class="li-badge ${bc}">${item.type}</span>
                        <span class="li-name">${n}</span>
                        <button class="li-block-btn" title="Chặn domain này">🚫</button>
                    </div>
                    <div class="li-src">${item.source}</div>
                    <div class="li-url">${item.url}</div>
                `;
                div.onclick = (e) => {
                    if (e.target.classList.contains('li-block-btn')) return;
                    const it = urls.get(div.dataset.url);
                    if (it.type === 'IFRAME') {
                        window.open(it.url, '_blank');
                        toast('🚀 Đã mở iframe');
                    } else {
                        openPrev(it);
                    }
                };
                div.querySelector('.li-block-btn').onclick = (e) => {
                    e.stopPropagation();
                    showAddBlacklist(item.url);
                };
                pb.appendChild(div);
            });
        }

        // ══════════════════════════════════════
        // TAB: JS SCRIPTS (MỚI)
        // ══════════════════════════════════════
        function renderJsScripts() {
            const pb = $('u-pb');
            pb.innerHTML = '';

            // Header info
            const total   = jsScripts.size;
            const blocked = [...jsScripts.values()].filter(j => j.blocked).length;

            pb.insertAdjacentHTML('beforeend', `
                <div style="padding:10px 14px;background:#161616;border-bottom:1px solid #222;display:flex;justify-content:space-between;align-items:center;flex-shrink:0">
                    <span style="color:#888;font-size:11px">
                        📦 ${total} scripts • 
                        <span style="color:#ef5350">${blocked} bị chặn</span>
                    </span>
                    <div style="display:flex;gap:6px">
                        <button class="hbtn blue" id="btn-js-scan" style="font-size:10px;padding:6px 10px">🔍 Quét JS</button>
                        <button class="hbtn red"  id="btn-js-blk-all" style="font-size:10px;padding:6px 10px">🚫 Chặn Tất Cả Ads</button>
                    </div>
                </div>
            `);

            $('btn-js-scan').onclick = () => {
                scan(document, 'manual-js');
                scanPerf();
                renderJsScripts();
                toast('✅ Đã quét ' + jsScripts.size + ' scripts');
            };

            $('btn-js-blk-all').onclick = () => {
                // Tự động chặn các script có pattern ad
                let count = 0;
                jsScripts.forEach((item) => {
                    if (AD_HARD.some(r => r.test(item.url)) || AD_PATHS.some(r => r.test(item.url))) {
                        const domain = item.domain;
                        jsBlacklist.add(domain);
                        item.blocked = true;
                        count++;
                    }
                });
                saveSet(JS_BLACK_KEY, jsBlacklist);
                renderJsScripts();
                toast(`✅ Đã chặn ${count} ad scripts`, '#2e7d32');
            };

            if (!total) {
                pb.insertAdjacentHTML('beforeend', `
                    <div style="color:#555;text-align:center;padding:40px 20px;font-size:13px">
                        Chưa tìm thấy scripts.<br><br>
                        Bấm 🔍 Quét JS để thu thập
                    </div>`);
                return;
            }

            // Group by domain
            const byDomain = new Map();
            jsScripts.forEach((item) => {
                if (!byDomain.has(item.domain)) byDomain.set(item.domain, []);
                byDomain.get(item.domain).push(item);
            });

            // Sort: blocked first, then by count
            const sortedDomains = [...byDomain.entries()].sort((a, b) => {
                const aBlocked = a[1].some(i => i.blocked) ? 1 : 0;
                const bBlocked = b[1].some(i => i.blocked) ? 1 : 0;
                return bBlocked - aBlocked || b[1].length - a[1].length;
            });

            sortedDomains.forEach(([domain, items]) => {
                const isDomainBlocked = isJsBlocked(items[0].url);
                const isAdDomain      = AD_HARD.some(r => r.test(domain)) || AD_PATHS.some(r => r.test(domain));

                // Domain header row
                const header = document.createElement('div');
                header.style.cssText = `
                    padding:8px 14px; background:#161616;
                    border-bottom:1px solid #1a1a1a;
                    display:flex; align-items:center; gap:8px;
                    cursor:pointer;
                `;
                header.innerHTML = `
                    <span style="
                        color:${isDomainBlocked ? '#ef5350' : (isAdDomain ? '#ff9800' : '#888')};
                        font-size:12px; font-weight:bold; flex:1;
                        overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
                        ${isDomainBlocked ? 'text-decoration:line-through;' : ''}
                    ">
                        ${isAdDomain ? '⚠️' : '📄'} ${domain}
                        <span style="color:#555;font-weight:normal"> (${items.length})</span>
                    </span>
                    <button class="js-toggle ${isDomainBlocked ? 'unblock' : 'block'}"
                            data-domain="${domain}">
                        ${isDomainBlocked ? '✅ Bỏ chặn' : '🚫 Chặn'}
                    </button>
                `;

                // Toggle block domain
                const toggleBtn = header.querySelector('.js-toggle');
                toggleBtn.onclick = (e) => {
                    e.stopPropagation();
                    if (isDomainBlocked || [...jsBlacklist].includes(domain)) {
                        jsBlacklist.delete(domain);
                        items.forEach(i => i.blocked = false);
                        toast('✅ Đã bỏ chặn: ' + domain, '#2e7d32');
                    } else {
                        jsBlacklist.add(domain);
                        items.forEach(i => i.blocked = true);
                        blockJsExecution(items[0].url);
                        toast('🚫 Đã chặn: ' + domain, '#c62828');
                    }
                    saveSet(JS_BLACK_KEY, jsBlacklist);
                    renderJsScripts();
                };

                // Toggle expand
                const listWrap = document.createElement('div');
                listWrap.style.display = 'none';

                header.onclick = (e) => {
                    if (e.target === toggleBtn) return;
                    listWrap.style.display =
                        listWrap.style.display === 'none' ? 'block' : 'none';
                };

                // Individual script items
                items.forEach(item => {
                    const row = document.createElement('div');
                    row.className = 'js-item' + (item.blocked ? ' blocked' : '');
                    const isItemBlocked = item.blocked || isJsBlocked(item.url);
                    row.innerHTML = `
                        <div class="js-info">
                            <div class="js-url" style="color:${isItemBlocked ? '#555' : '#4fc3f7'};
                                ${isItemBlocked ? 'text-decoration:line-through;' : ''}">
                                ${item.url}
                            </div>
                            <div class="js-src">📌 ${item.source}</div>
                        </div>
                        <div style="display:flex;flex-direction:column;gap:4px;flex-shrink:0">
                            <button class="js-toggle ${isItemBlocked ? 'unblock' : 'block'}" 
                                    style="font-size:10px;padding:4px 8px">
                                ${isItemBlocked ? '✅' : '🚫'}
                            </button>
                            <button style="background:#333;border:none;color:#aaa;font-size:10px;padding:4px 8px;border-radius:6px;cursor:pointer" 
                                    class="js-cp-btn">📋</button>
                        </div>
                    `;
                    row.querySelector('.js-toggle').onclick = () => {
                        // Chặn/bỏ chặn từng URL cụ thể
                        const keyword = item.url.split('/').pop().split('?')[0] || item.domain;
                        if (isItemBlocked) {
                            jsBlacklist.delete(keyword);
                            jsBlacklist.delete(item.domain);
                            item.blocked = false;
                            toast('✅ Bỏ chặn: ' + keyword);
                        } else {
                            jsBlacklist.add(keyword);
                            item.blocked = true;
                            blockJsExecution(item.url);
                            toast('🚫 Đã chặn: ' + keyword, '#c62828');
                        }
                        saveSet(JS_BLACK_KEY, jsBlacklist);
                        renderJsScripts();
                    };
                    row.querySelector('.js-cp-btn').onclick = () => cp(item.url);
                    listWrap.appendChild(row);
                });

                pb.appendChild(header);
                pb.appendChild(listWrap);
            });
        }

        // ══════════════════════════════════════
        // TAB: BLACKLIST
        // ══════════════════════════════════════
        function renderBlacklist() {
            const pb = $('u-pb');
            pb.innerHTML = '';

            pb.insertAdjacentHTML('beforeend', `
                <div style="padding:12px 14px;border-bottom:1px solid #222">
                    <button class="hbtn blue" id="btn-add-manual" style="width:100%">
                        + Thêm domain/từ khóa chặn media
                    </button>
                </div>
                <div style="padding:8px 14px;color:#666;font-size:11px;border-bottom:1px solid #1a1a1a">
                    📦 Built-in: snaptrckr, mayzaent, adsterra, exoclick, doubleclick...
                </div>
            `);
            $('btn-add-manual').onclick = () => showAddBlacklist('');

            if (blacklist.size) {
                pb.insertAdjacentHTML('beforeend',
                    `<div style="padding:8px 14px;color:#ef5350;font-size:11px;font-weight:bold;border-bottom:1px solid #1a1a1a">
                        🚫 BLACKLIST MEDIA (${blacklist.size})
                    </div>`
                );
                [...blacklist].forEach(domain => {
                    const div = document.createElement('div');
                    div.className = 'bl-item';
                    div.innerHTML = `
                        <span class="bl-domain">🚫 ${domain}</span>
                        <button class="bl-del" data-domain="${domain}">Xóa</button>
                    `;
                    div.querySelector('.bl-del').onclick = () => {
                        blacklist.delete(domain);
                        saveSet(STORAGE_KEY, blacklist);
                        toast('✅ Đã xóa: ' + domain);
                        renderBlacklist();
                    };
                    pb.appendChild(div);
                });
            }

            if (jsBlacklist.size) {
                pb.insertAdjacentHTML('beforeend',
                    `<div style="padding:8px 14px;color:#ff9800;font-size:11px;font-weight:bold;border-bottom:1px solid #1a1a1a">
                        🔧 BLACKLIST JS (${jsBlacklist.size})
                    </div>`
                );
                [...jsBlacklist].forEach(keyword => {
                    const div = document.createElement('div');
                    div.className = 'bl-item';
                    div.innerHTML = `
                        <span class="bl-domain" style="color:#ff9800">🔧 ${keyword}</span>
                        <button class="bl-del" data-keyword="${keyword}">Xóa</button>
                    `;
                    div.querySelector('.bl-del').onclick = () => {
                        jsBlacklist.delete(keyword);
                        saveSet(JS_BLACK_KEY, jsBlacklist);
                        toast('✅ Đã xóa JS block: ' + keyword);
                        renderBlacklist();
                    };
                    pb.appendChild(div);
                });
            }

            if (!blacklist.size && !jsBlacklist.size) {
                pb.insertAdjacentHTML('beforeend',
                    `<div style="color:#555;text-align:center;padding:30px;font-size:13px">
                        Chưa có blacklist tùy chỉnh.<br>
                        Bấm 🚫 trên mỗi link để thêm.
                    </div>`
                );
            }
        }

        // ══════════════════════════════════════
        // SHOW ADD BLACKLIST
        // ══════════════════════════════════════
        function showAddBlacklist(url) {
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
            saveSet(STORAGE_KEY, blacklist);
            // Xóa khỏi danh sách tìm thấy
            urls.forEach((item, key) => { if (key.includes(val)) urls.delete(key); });
            updateBadge();
            $('u-add-bl').classList.remove('on');
            toast('✅ Đã thêm blacklist: ' + val, '#2e7d32');
            renderPanel();
        };

        $('btn-bl-cancel').onclick = () => {
            $('u-add-bl').classList.remove('on');
            if (!$('u-panel').classList.contains('on')) $('u-bd').classList.remove('on');
        };

        // ══════════════════════════════════════
        // OPEN PREVIEW
        // ══════════════════════════════════════
        function openPrev(item) {
            cur = item; rot = 0; zoom = 1;
            $('u-vid').style.transform = 'none';
            $('u-prev-title').textContent = fname(item.url);
            $('u-vid').src = item.url;
            $('u-vid').onerror = () =>
                toast('❌ Không phát được, thử VLC hoặc tab mới', '#c62828');

            $('u-p-acts').innerHTML = `
                <button class="pact bl" id="pc-cp">📋 Copy</button>
                <button class="pact rd" id="pc-fs">⛶ Fullscreen</button>
                <button class="pact gr" id="pc-vlc">📺 VLC</button>
                <button class="pact pu" id="pc-ytdl">💻 Tải</button>
                <button class="pact te" id="pc-rot">⟳ Xoay</button>
                <button class="pact gy" id="pc-zm">🔍 ${zoom}x</button>
            `;

            $('pc-cp').onclick   = () => cp(cur.url);
            $('pc-fs').onclick   = () => triggerFullscreen(); // ← Fullscreen + landscape
            $('pc-vlc').onclick  = () => window.location.href = 'vlc://' + cur.url;
            $('pc-ytdl').onclick = () => openCmd(cur.url);
            $('pc-rot').onclick  = () => {
                rot = (rot + 90) % 360;
                $('u-vid').style.transform = `rotate(${rot}deg) scale(${zoom})`;
            };
            $('pc-zm').onclick   = (e) => {
                const lv = [1, 1.25, 1.5, 2, 0.75];
                zoom = lv[(lv.indexOf(zoom) + 1) % lv.length];
                e.target.textContent = `🔍 ${zoom}x`;
                $('u-vid').style.transform = `rotate(${rot}deg) scale(${zoom})`;
            };

            $('u-prev').classList.add('on');
            $('u-bd').classList.add('on');
            $('u-panel').classList.remove('on');
        }

        // ══════════════════════════════════════
        // CMD MODAL
        // ══════════════════════════════════════
        function openCmd(url) {
            const build = (t) => {
                ctab = t;
                const data = {
                    ytdlp: [
                        { l:'Tải chất lượng cao',
                          c:`yt-dlp --referer "${REF}" "${url}"` },
                        { l:'Bypass Header đầy đủ',
                          c:`yt-dlp --referer "${REF}" --user-agent "${UA}" --add-header "Origin:${location.origin}" -f "bestvideo+bestaudio" "${url}"` },
                        { l:'Chỉ Audio MP3',
                          c:`yt-dlp -x --audio-format mp3 --referer "${REF}" "${url}"` },
                    ],
                    ffmpeg: [
                        { l:'Copy stream (Nhanh)',
                          c:`ffmpeg -referer "${REF}" -user_agent "${UA}" -i "${url}" -c copy output.mp4` },
                        { l:'Re-encode H264',
                          c:`ffmpeg -referer "${REF}" -i "${url}" -c:v libx264 -c:a aac output.mp4` },
                    ],
                    termux: [
                        { l:'Cài tools',
                          c:`pkg install python ffmpeg -y && pip install yt-dlp` },
                        { l:'Tải video',
                          c:`yt-dlp --referer "${REF}" "${url}"` },
                        { l:'FFmpeg HLS',
                          c:`ffmpeg -referer "${REF}" -i "${url}" -c copy ~/storage/downloads/out.mp4` },
                    ],
                }[t] || [];

                $('u-cmd').innerHTML = `
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:15px">
                        <h4 style="color:#fff;margin:0">💻 Lệnh tải</h4>
                        <span style="color:#555;font-size:10px;font-family:monospace;max-width:150px;overflow:hidden;text-overflow:ellipsis">
                            ${fname(url)}
                        </span>
                    </div>
                    <div style="display:flex;gap:5px;margin-bottom:15px">
                        ${['ytdlp','ffmpeg','termux'].map(tab => `
                            <button style="flex:1;background:${tab===t?'#e53935':'#222'};
                                    color:white;border:none;padding:8px;border-radius:8px;
                                    cursor:pointer;font-size:11px;font-weight:bold"
                                    data-tab="${tab}">${tab.toUpperCase()}</button>
                        `).join('')}
                    </div>
                    <div id="cmd-list">
                        ${data.map(d => `
                            <div class="cmd-block">
                                <div class="cmd-label">${d.l}</div>
                                <div class="cmd-row">
                                    <textarea class="cmd-ta" rows="2" readonly>${d.c}</textarea>
                                    <button class="cmd-cp">📋</button>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                    <button style="width:100%;background:#c62828;border:none;color:white;
                            padding:12px;border-radius:8px;cursor:pointer;font-weight:bold;
                            margin-top:4px" id="cmd-cls">ĐÓNG</button>
                `;

                $('u-cmd').querySelectorAll('.cmd-ta').forEach(ta => {
                    ta.style.height = 'auto';
                    ta.style.height = ta.scrollHeight + 'px';
                });
                $('u-cmd').querySelectorAll('[data-tab]').forEach(b =>
                    b.onclick = () => build(b.dataset.tab)
                );
                $('u-cmd').querySelectorAll('.cmd-cp').forEach(b =>
                    b.onclick = () => cp(b.parentElement.querySelector('.cmd-ta').value)
                );
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

        // ══════════════════════════════════════
        // DROPDOWN ⋮
        // ══════════════════════════════════════
        $('btn-opt').onclick = (e) => {
            e.stopPropagation();
            const d = $('u-drop');
            d.innerHTML = `
                <div class="di" id="m-qs">🎞 Chọn chất lượng</div>
                <div class="di" id="m-fs">⛶ Fullscreen Ngang</div>
                <div class="di" id="m-new">🌐 Mở tab mới</div>
                <div class="di" id="m-share">🔗 Chia sẻ</div>
                <div class="di" id="m-block" style="color:#ef5350">🚫 Chặn domain này</div>
                <div class="di" id="m-ddrop">✕ Đóng menu</div>
            `;
            const r = $('btn-opt').getBoundingClientRect();
            d.style.top   = (r.bottom + 10) + 'px';
            d.style.right = '15px';
            d.style.display = 'block';

            $('m-fs').onclick = () => {
                d.style.display = 'none';
                triggerFullscreen();
            };

            $('m-qs').onclick = () => {
                d.style.display = 'none';
                if (!cur || cur.type !== 'M3U8') { toast('Chỉ hỗ trợ HLS stream'); return; }
                toast('⏳ Đang parse M3U8...');
                fetch(cur.url).then(r => r.text()).then(text => {
                    if (!text.includes('#EXT-X-STREAM-INF')) {
                        toast('Không có multi-quality'); return;
                    }
                    const lines = text.split('\n'), qs = [];
                    for (let i = 0; i < lines.length; i++) {
                        if (lines[i].includes('RESOLUTION=')) {
                            const res  = lines[i].match(/RESOLUTION=(\d+x\d+)/)?.[1] || '';
                            const bw   = lines[i].match(/BANDWIDTH=(\d+)/)?.[1] || '0';
                            const next = (lines[i+1] || '').trim();
                            if (next && !next.startsWith('#')) {
                                const su = next.startsWith('http') ? next :
                                    cur.url.substring(0, cur.url.lastIndexOf('/')+1) + next;
                                qs.push({ label: res.split('x')[1]+'p', url: su, bw: parseInt(bw) });
                            }
                        }
                    }
                    qs.sort((a,b) => b.bw - a.bw);
                    if (!qs.length) { toast('Không parse được quality'); return; }

                    const dd = $('u-drop');
                    dd.innerHTML =
                        `<div style="padding:10px 16px;color:#888;font-size:11px;font-weight:bold;border-bottom:1px solid #333">
                            CHẤT LƯỢNG
                        </div>` +
                        qs.map(q =>
                            `<div class="di q-item" data-url="${q.url}">📺 ${q.label}</div>`
                        ).join('');
                    dd.style.display = 'block';
                    dd.querySelectorAll('.q-item').forEach(qi => qi.onclick = () => {
                        $('u-vid').src = qi.dataset.url;
                        dd.style.display = 'none';
                        toast('▶ Đang phát ' + qi.textContent.trim());
                    });
                }).catch(() => toast('❌ Lỗi parse M3U8'));
            };

            $('m-new').onclick   = () => { window.open(cur.url,'_blank'); d.style.display='none'; };
            $('m-share').onclick = () => { navigator.share({url:cur.url}); d.style.display='none'; };
            $('m-block').onclick = () => { d.style.display='none'; showAddBlacklist(cur.url); };
            $('m-ddrop').onclick = () => d.style.display='none';
        };

        // ══════════════════════════════════════
        // FAB & EVENTS
        // ══════════════════════════════════════
        $('u-fab').onclick = () => {
            if ($('u-panel').classList.contains('on')) {
                $('u-panel').classList.remove('on');
                $('u-bd').classList.remove('on');
            } else {
                scan(document, 'main');
                scanPerf();
                renderPanel();
                $('u-panel').classList.add('on');
                $('u-bd').classList.add('on');
            }
        };

        $('btn-scan').onclick = () => {
            scan(document, 'deep');
            scanPerf();
            renderPanel();
            toast('✅ Quét xong! ' + urls.size + ' media, ' + jsScripts.size + ' scripts');
        };

        $('btn-clr').onclick = () => {
            urls.clear();
            updateBadge();
            renderPanel();
            toast('🗑 Đã xóa media list');
        };

        $('btn-cls').onclick = () => {
            $('u-vid').pause();
            $('u-vid').src = '';
            $('u-prev').classList.remove('on');
            $('u-bd').classList.remove('on');
            // Unlock orientation khi đóng player
            if (screen.orientation && screen.orientation.unlock) {
                screen.orientation.unlock();
            }
        };

        $('u-bd').onclick = (e) => {
            if ($('u-add-bl').classList.contains('on')) {
                $('u-add-bl').classList.remove('on'); return;
            }
            if ($('u-drop').style.display === 'block') {
                $('u-drop').style.display = 'none'; return;
            }
            if ($('u-cmd').classList.contains('on')) {
                $('u-cmd').classList.remove('on'); return;
            }
            $('u-panel').classList.remove('on');
            $('u-prev').classList.remove('on');
            $('u-bd').classList.remove('on');
            $('u-vid').pause();
            if (screen.orientation && screen.orientation.unlock) {
                screen.orientation.unlock();
            }
        };

        document.addEventListener('click', (e) => {
            const d = $('u-drop');
            if (d.style.display === 'block' &&
                !d.contains(e.target) &&
                e.target.id !== 'btn-opt')
                d.style.display = 'none';
        });
    }

    // ══════════════════════════════════════════
    // AUTO START
    // ══════════════════════════════════════════
    setInterval(scanPerf, 3000);

    setTimeout(() => {
        scan(document, 'auto');
        updateBadge();
    }, 2000);

    if (document.body) initUI();
    else document.addEventListener('DOMContentLoaded', initUI);

})();