// ==UserScript==
// @name         Universal Media Player v19 - Popup Blocker
// @namespace    http://tampermonkey.net/
// @version      19.0
// @description  Chặn popup/tab mới + AdBlock JS + Media Player
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
    const POPUP_KEY     = 'ump_popup_blacklist';

    function loadSet(key) {
        try { return new Set(JSON.parse(localStorage.getItem(key) || '[]')); }
        catch(e) { return new Set(); }
    }
    function saveSet(key, set) {
        localStorage.setItem(key, JSON.stringify([...set]));
    }

    let blacklist      = loadSet(STORAGE_KEY);
    let whitelist      = loadSet(WHITELIST_KEY);
    let jsBlacklist    = loadSet(JS_BLACK_KEY);
    let popupBlacklist = loadSet(POPUP_KEY);

    // ══════════════════════════════════════════
    // POPUP BLOCKER - Hook ngay từ đầu (document-start)
    // ══════════════════════════════════════════
    let popupBlockCount = 0;
    const blockedPopups = []; // log các popup bị chặn

    // Domains luôn bị chặn popup
    const POPUP_HARD_BLOCK = [
        'wheelroot.com', 'snaptrckr', 'mayzaent', 'myavlive',
        'adsterra', 'exoclick', 'popcash', 'propellerads',
        'trafficjunky', 'juicyads', 'hilltopads', 'clickadu',
        'popunder', 'smartpop', 'realsrv', 'tsyndicate',
        'doubleclick', 'googlesyndication'
    ];

    function isPopupBlocked(url) {
        if (!url || url === 'about:blank') return false;
        // Kiểm tra hard block
        if (POPUP_HARD_BLOCK.some(b => url.includes(b))) return true;
        // Kiểm tra user blacklist
        if ([...popupBlacklist].some(b => url.includes(b))) return true;
        // Kiểm tra media blacklist
        if ([...blacklist].some(b => url.includes(b))) return true;
        return false;
    }

    // ── Hook window.open ──
    const _winOpen = window.open.bind(window);
    window.open = function(url, target, features) {
        const u = String(url || '');

        if (isPopupBlocked(u)) {
            popupBlockCount++;
            blockedPopups.unshift({ url: u, time: new Date().toLocaleTimeString(), method: 'window.open' });
            if (blockedPopups.length > 50) blockedPopups.pop();
            console.log('[UMP-POPUP-BLOCKED]', u);
            showPopupToast(u);
            return null; // Trả về null = không mở
        }

        // Chặn popup không có URL (popunder trick)
        if (!u || u === 'about:blank') {
            // Cho phép mở nhưng theo dõi
            const win = _winOpen.call(window, url, target, features);
            return win;
        }

        return _winOpen.call(window, url, target, features);
    };

    // ── Hook location.href & location.assign (redirect trick) ──
    // Một số ad dùng location.href = 'wheelroot.com/...'
    const _locAssign   = location.assign.bind(location);
    const _locReplace  = location.replace.bind(location);

    location.assign = function(url) {
        if (isPopupBlocked(url)) {
            popupBlockCount++;
            blockedPopups.unshift({ url, time: new Date().toLocaleTimeString(), method: 'location.assign' });
            showPopupToast(url);
            return;
        }
        return _locAssign(url);
    };

    location.replace = function(url) {
        if (isPopupBlocked(url)) {
            popupBlockCount++;
            blockedPopups.unshift({ url, time: new Date().toLocaleTimeString(), method: 'location.replace' });
            showPopupToast(url);
            return;
        }
        return _locReplace(url);
    };

    // ── Chặn click → tab mới (target="_blank" trick) ──
    // Wheelroot thường dùng invisible overlay div + click
    document.addEventListener('click', function(e) {
        // Kiểm tra nếu có anchor cha
        let el = e.target;
        for (let i = 0; i < 5; i++) {
            if (!el) break;
            if (el.tagName === 'A' || el.tagName === 'a') {
                const href = el.href || '';
                if (isPopupBlocked(href)) {
                    e.preventDefault();
                    e.stopPropagation();
                    e.stopImmediatePropagation();
                    popupBlockCount++;
                    blockedPopups.unshift({ url: href, time: new Date().toLocaleTimeString(), method: 'click-a' });
                    showPopupToast(href);
                    return false;
                }
            }
            el = el.parentElement;
        }
    }, true); // capture = true → chặn trước mọi handler khác

    // ── Chặn invisible overlay (div che phủ toàn màn hình) ──
    // Kỹ thuật phổ biến: div z-index cao, trong suốt, onclick = window.open
    function removeOverlays() {
        const els = document.querySelectorAll('*');
        els.forEach(el => {
            try {
                const style = window.getComputedStyle(el);
                const rect  = el.getBoundingClientRect();

                // Phát hiện overlay: full width/height + position fixed/absolute + cao z-index
                const isOverlay = (
                    (style.position === 'fixed' || style.position === 'absolute') &&
                    rect.width  > window.innerWidth  * 0.8 &&
                    rect.height > window.innerHeight * 0.5 &&
                    (style.opacity === '0' || parseFloat(style.opacity) < 0.1 || style.zIndex > 9000) &&
                    el.id !== 'u-bd' && // Không xóa backdrop của chính mình
                    !el.closest('#u-panel, #u-prev, #u-cmd, #u-fab')
                );

                if (isOverlay) {
                    const onclick = el.onclick || el.getAttribute('onclick') || '';
                    if (onclick && (onclick.toString().includes('open') || onclick.toString().includes('href'))) {
                        el.onclick = null;
                        el.setAttribute('onclick', '');
                        el.style.pointerEvents = 'none';
                        console.log('[UMP] Removed overlay:', el);
                    }
                }
            } catch(err) {}
        });
    }

    // ── Hook addEventListener để chặn click handler của wheelroot ──
    const _addEvt = EventTarget.prototype.addEventListener;
    EventTarget.prototype.addEventListener = function(type, handler, options) {
        if (type === 'click' || type === 'mousedown' || type === 'touchstart') {
            const wrappedHandler = function(e) {
                // Kiểm tra nếu handler này sẽ gọi window.open → đã bị hook rồi
                return handler.apply(this, arguments);
            };
            return _addEvt.call(this, type, wrappedHandler, options);
        }
        return _addEvt.call(this, type, handler, options);
    };

    // Toast thông báo popup bị chặn
    let _toastTimeout;
    function showPopupToast(url) {
        let t = document.getElementById('u-popup-toast');
        if (!t) {
            t = document.createElement('div');
            t.id = 'u-popup-toast';
            t.style.cssText = `
                position:fixed; top:20px; left:50%;
                transform:translateX(-50%);
                background:#c62828; color:white;
                padding:10px 18px; border-radius:20px;
                font-size:12px; font-weight:bold;
                z-index:2147483647; display:none;
                box-shadow:0 5px 20px rgba(0,0,0,.6);
                font-family:sans-serif; max-width:90vw;
                text-align:center; line-height:1.4;
            `;
            document.body && document.body.appendChild(t);
        }
        try {
            const domain = new URL(url).hostname;
            t.textContent = `🚫 Đã chặn popup: ${domain}`;
        } catch(e) {
            t.textContent = `🚫 Đã chặn popup`;
        }
        t.style.display = 'block';
        clearTimeout(_toastTimeout);
        _toastTimeout = setTimeout(() => t.style.display = 'none', 3000);
    }

    // ══════════════════════════════════════════
    // AD PATTERNS
    // ══════════════════════════════════════════
    const AD_HARD = [
        /doubleclick\.net/i, /googlesyndication/i, /googleadservices/i,
        /adnxs\.com/i, /rubiconproject/i, /openx\.net/i,
        /snaptrckr/i, /mayzaent/i, /myavlive\.com\/widgets/i,
        /wheelroot\.com/i, // ← THÊM wheelroot
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
        /under_player/i, /gridRows/i, /thumbsMargin/i,
        /\/api\/v1\//i  // wheelroot dùng /api/v1/
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
    // ══════════════════════════════════════════
    const jsScripts = new Map();

    function addJsScript(src, source) {
        if (!src || typeof src !== 'string') return;
        if (!src.startsWith('http') && !src.startsWith('//')) return;
        const url = src.startsWith('//') ? 'https:' + src : src;
        if (jsScripts.has(url)) return;
        const blocked = isJsBlocked(url);
        jsScripts.set(url, {
            url, source, blocked, ts: Date.now(),
            domain: (() => { try { return new URL(url).hostname; } catch(e) { return url; } })()
        });
        if (blocked) blockJsExecution(url);
        updateBadge();
    }

    function isJsBlocked(url) {
        return [...jsBlacklist].some(b => url.includes(b));
    }

    // Hook createElement
    const _createElement = document.createElement.bind(document);
    document.createElement = function(tag) {
        const el = _createElement(tag);
        if (tag && tag.toLowerCase() === 'script') {
            const origDesc = Object.getOwnPropertyDescriptor(HTMLScriptElement.prototype, 'src');
            Object.defineProperty(el, 'src', {
                get() { return origDesc ? origDesc.get.call(this) : ''; },
                set(val) {
                    addJsScript(val, 'createElement');
                    if (isJsBlocked(val)) {
                        el.type = 'text/ump-blocked';
                        return;
                    }
                    if (origDesc) origDesc.set.call(this, val);
                },
                configurable: true
            });
        }
        return el;
    };

    function scanForScripts(html, source) {
        if (!html || typeof html !== 'string') return;
        const matches = html.match(/src=["']([^"']+\.js[^"']*)/gi) || [];
        matches.forEach(m => {
            const url = m.replace(/src=["']/i, '').replace(/["']/g, '');
            addJsScript(url, source);
        });
    }

    function blockJsExecution(url) {
        try {
            const filename = url.split('/').pop().split('?')[0];
            document.querySelectorAll(`script[src*="${filename}"]`).forEach(s => {
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
        if (isHardAd(u)) return;
        if (isNonMedia(u) && type !== 'IFRAME') return;
        if (!urls.has(u) || urls.get(u).priority > priority) {
            urls.set(u, { url: u, type, source, priority, ts: Date.now() });
            updateBadge();
        }
    }

    function findUrls(text, source) {
        if (!text || typeof text !== 'string') return;
        scanForScripts(text, source);
        patterns.forEach(p => {
            const m = text.match(p.re);
            if (m) m.forEach(u => addUrl(u, p.type, source, p.priority));
        });
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
            doc.querySelectorAll('iframe').forEach((f,i) => {
                if (f.src && !isHardAd(f.src) && !isNonMedia(f.src))
                    addUrl(f.src, 'IFRAME', src+':if', 99);
                try { if (f.contentDocument) scan(f.contentDocument, src+':if'+i); } catch(e) {}
            });
            doc.querySelectorAll('script[src]').forEach(s => addJsScript(s.src, src+':tag'));
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
            if (u) {
                if (/\.js(\?|$)/i.test(u)) addJsScript(u, 'fetch');
                else findUrls(u, 'fetch');
            }
        } catch(e) {}
        return _fetch.apply(this, a);
    };

    XMLHttpRequest.prototype.open = function(m, u) {
        try {
            if (u) {
                const su = String(u);
                if (/\.js(\?|$)/i.test(su)) addJsScript(su, 'xhr');
                else findUrls(su, 'xhr');
            }
        } catch(e) {}
        return _xhrOpen.apply(this, arguments);
    };

    function scanPerf() {
        try {
            performance.getEntriesByType('resource').forEach(e => {
                if (/\.js(\?|$)/i.test(e.name)) addJsScript(e.name, 'perf');
                else if (!isHardAd(e.name) && !isNonMedia(e.name)) findUrls(e.name, 'perf');
            });
        } catch(e) {}
    }

    let updateBadge = () => {};

    // ══════════════════════════════════════════
    // CSS
    // ══════════════════════════════════════════
    const CSS = `
        #u-fab {
            position:fixed; bottom:20px; right:20px;
            width:56px; height:56px; background:#e53935;
            color:white; border:none; border-radius:50%;
            font-size:22px; cursor:pointer;
            box-shadow:0 4px 20px rgba(0,0,0,.5);
            z-index:2147483647; display:flex;
            align-items:center; justify-content:center;
        }
        #u-badge {
            position:absolute; top:-4px; right:-4px;
            background:#43a047; color:white; font-size:9px;
            min-width:18px; height:18px; border-radius:9px;
            display:none; align-items:center; justify-content:center;
            font-weight:bold; border:2px solid #111;
        }
        /* Popup block badge */
        #u-popup-badge {
            position:absolute; top:-4px; left:-4px;
            background:#e53935; color:white; font-size:9px;
            min-width:18px; height:18px; border-radius:9px;
            display:none; align-items:center; justify-content:center;
            font-weight:bold; border:2px solid #111;
        }

        #u-bd { position:fixed; inset:0; background:rgba(0,0,0,.78); z-index:2147483640; display:none; }
        #u-bd.on { display:block; }

        #u-panel {
            position:fixed; bottom:86px; right:12px;
            width:calc(100vw - 24px); max-width:400px;
            max-height:75vh; background:#111; border-radius:16px;
            z-index:2147483647; display:none; flex-direction:column;
            box-shadow:0 12px 40px #000; overflow:hidden;
            font-family:sans-serif; border:1px solid #222;
        }
        #u-panel.on { display:flex; }

        #u-ph {
            background:#1e1e1e; padding:10px 12px;
            display:flex; align-items:center; gap:6px;
            border-bottom:1px solid #2a2a2a; flex-shrink:0;
        }
        #u-ph-title { color:#fff; font-size:13px; font-weight:bold; flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        #u-ph-acts  { display:flex; gap:5px; align-items:center; flex-shrink:0; }

        .hbtn { border:none; border-radius:7px; cursor:pointer; font-size:10px; font-weight:bold; padding:7px 10px; color:white; white-space:nowrap; }
        .hbtn.blue { background:#1565c0; }
        .hbtn.gray { background:#333; color:#aaa; }
        .hbtn.red  { background:#c62828; }
        .hbtn.grn  { background:#2e7d32; }
        .hbtn.org  { background:#e65100; }

        /* TABS */
        #u-tabs { display:flex; background:#161616; border-bottom:1px solid #222; flex-shrink:0; overflow-x:auto; }
        .utab {
            flex:1; min-width:0; padding:8px 2px;
            border:none; background:none; color:#555;
            font-size:10px; font-weight:bold; cursor:pointer;
            border-bottom:2px solid transparent; white-space:nowrap;
        }
        .utab.on { color:#e53935; border-bottom-color:#e53935; }

        #u-pb { overflow-y:auto; flex:1; background:#0a0a0a; }

        /* POPUP LOG */
        .popup-item {
            padding:10px 14px; border-bottom:1px solid #181818;
            display:flex; align-items:flex-start; gap:8px;
        }
        .popup-url { color:#ef9a9a; font-size:11px; word-break:break-all; flex:1; line-height:1.4; }
        .popup-time { color:#333; font-size:10px; white-space:nowrap; flex-shrink:0; }
        .popup-method { background:#c62828; color:#fff; font-size:9px; padding:2px 6px; border-radius:4px; white-space:nowrap; margin-top:2px; }

        /* MEDIA ITEMS */
        .li { padding:10px 12px; border-bottom:1px solid #181818; cursor:pointer; position:relative; }
        .li:active { background:#1a1a1a; }
        .li-top { display:flex; align-items:center; gap:6px; margin-bottom:4px; }
        .li-badge { font-size:9px; font-weight:900; padding:2px 7px; border-radius:4px; color:white; text-transform:uppercase; flex-shrink:0; }
        .lb-M3U8{background:#7b1fa2;} .lb-MP4{background:#2e7d32;} .lb-IFRAME{background:#1565c0;} .lb-other{background:#444;}
        .li-name { color:#fff; font-size:12px; font-weight:600; flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .li-src  { color:#444; font-size:9px; margin-bottom:3px; }
        .li-url  { color:#4fc3f7; font-size:10px; font-family:monospace; word-break:break-all; background:#000; padding:6px; border-radius:5px; line-height:1.4; border:1px solid #1a1a1a; }
        .li-block-btn { position:absolute; top:10px; right:10px; background:#c62828; border:none; color:white; font-size:9px; padding:3px 7px; border-radius:4px; cursor:pointer; }

        /* JS ITEMS */
        .js-item { padding:8px 14px; border-bottom:1px solid #181818; display:flex; align-items:flex-start; gap:8px; }
        .js-item.blocked { background:#1a0000; }
        .js-info { flex:1; min-width:0; }
        .js-url  { color:#4fc3f7; font-size:10px; word-break:break-all; line-height:1.4; }
        .js-url.blocked-txt { color:#555; text-decoration:line-through; }
        .js-src  { color:#333; font-size:9px; margin-top:2px; }
        .js-toggle { flex-shrink:0; border:none; border-radius:5px; padding:4px 8px; font-size:10px; font-weight:bold; cursor:pointer; margin-top:2px; }
        .js-toggle.block   { background:#c62828; color:#fff; }
        .js-toggle.unblock { background:#2e7d32; color:#fff; }

        /* BLACKLIST */
        .bl-item { padding:9px 14px; border-bottom:1px solid #181818; display:flex; align-items:center; gap:8px; }
        .bl-domain { font-size:12px; font-family:monospace; flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .bl-del { background:none; border:1px solid #333; color:#555; font-size:11px; padding:3px 8px; border-radius:4px; cursor:pointer; }

        /* PREVIEW */
        #u-prev {
            position:fixed; bottom:0; left:0; right:0;
            background:#111; z-index:2147483647;
            display:none; flex-direction:column;
            border-radius:20px 20px 0 0;
            box-shadow:0 -10px 50px #000; font-family:sans-serif;
        }
        #u-prev.on { display:flex; }
        #u-prev-bar { display:flex; align-items:center; padding:10px 12px; gap:8px; border-bottom:1px solid #222; flex-shrink:0; }
        #u-prev-title { flex:1; color:#fff; font-size:12px; font-weight:bold; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        #u-vid-wrap { background:#000; width:100%; height:220px; overflow:hidden; display:flex; align-items:center; justify-content:center; flex-shrink:0; }
        #u-vid { width:100%; height:100%; object-fit:contain; transition:transform .3s; }
        .p-acts { display:flex; gap:6px; padding:10px 12px; overflow-x:auto; background:#161616; flex-shrink:0; }
        .pact { border:none; border-radius:7px; padding:9px 12px; color:white; font-weight:bold; font-size:10px; white-space:nowrap; cursor:pointer; flex-shrink:0; }
        .pact.bl{background:#1565c0} .pact.gr{background:#2e7d32} .pact.pu{background:#6a1b9a} .pact.te{background:#00796b} .pact.gy{background:#444} .pact.rd{background:#c62828}

        /* CMD */
        #u-cmd { position:fixed; top:50%; left:50%; transform:translate(-50%,-50%); background:#111; border-radius:14px; z-index:2147483647; width:94%; max-width:500px; padding:16px; display:none; box-shadow:0 15px 50px #000; font-family:sans-serif; border:1px solid #333; max-height:80vh; overflow-y:auto; }
        #u-cmd.on { display:block; }
        .cmd-block { background:#0a0a0a; border-radius:8px; padding:10px; margin-bottom:10px; border:1px solid #1e1e1e; }
        .cmd-label { color:#666; font-size:10px; font-weight:bold; text-transform:uppercase; margin-bottom:5px; }
        .cmd-row   { display:flex; gap:6px; align-items:stretch; }
        .cmd-ta    { flex:1; background:transparent; color:#4caf50; border:none; font-family:monospace; font-size:11px; resize:none; line-height:1.5; outline:none; min-height:40px; }
        .cmd-cp    { background:#1565c0; border:none; color:white; border-radius:7px; padding:0 12px; cursor:pointer; font-size:15px; display:flex; align-items:center; flex-shrink:0; }

        /* DROPDOWN */
        #u-drop { position:fixed; background:#1c1c1c; border-radius:12px; border:1px solid #333; z-index:2147483647; display:none; box-shadow:0 10px 40px #000; overflow:hidden; min-width:200px; }
        .di { padding:12px 16px; color:#eee; font-size:12px; cursor:pointer; display:flex; align-items:center; gap:8px; border-bottom:1px solid #252525; }
        .di:hover { background:#2a2a2a; }

        /* ADD BLACKLIST */
        #u-add-bl { position:fixed; bottom:0; left:0; right:0; background:#1a1a1a; border-radius:20px 20px 0 0; z-index:2147483647; padding:18px; display:none; font-family:sans-serif; border-top:1px solid #333; }
        #u-add-bl.on { display:block; }
        #u-add-bl h4 { color:#fff; margin:0 0 10px; font-size:14px; }
        #u-bl-input { width:100%; background:#0a0a0a; border:1px solid #333; border-radius:7px; padding:10px; color:#fff; font-size:13px; box-sizing:border-box; outline:none; font-family:monospace; }
        #u-bl-input:focus { border-color:#e53935; }
        #u-bl-type { display:flex; gap:6px; margin-bottom:10px; }
        .bl-type-btn { flex:1; padding:7px; border:1px solid #333; background:transparent; color:#666; border-radius:6px; cursor:pointer; font-size:11px; font-weight:bold; }
        .bl-type-btn.on { border-color:#e53935; color:#e53935; background:#1a0000; }
        #u-bl-acts { display:flex; gap:8px; margin-top:10px; }

        /* TOAST */
        #u-toast { position:fixed; bottom:90px; left:50%; transform:translateX(-50%); background:#323232; color:white; padding:9px 18px; border-radius:20px; font-size:12px; font-weight:bold; z-index:2147483647; display:none; box-shadow:0 5px 15px rgba(0,0,0,.5); white-space:nowrap; font-family:sans-serif; }

        /* BADGE */
        .tab-badge { background:#e53935; color:#fff; font-size:9px; padding:1px 5px; border-radius:8px; margin-left:3px; font-weight:bold; }
    `;

    // ══════════════════════════════════════════
    // INIT UI
    // ══════════════════════════════════════════
    function initUI() {
        const style = document.createElement('style');
        style.textContent = CSS;
        document.head.appendChild(style);

        document.body.insertAdjacentHTML('beforeend', `
            <button id="u-fab">🎬
                <span id="u-badge"></span>
                <span id="u-popup-badge">0</span>
            </button>
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
                    <button class="utab on" data-tab="streams">📺 Streams</button>
                    <button class="utab"    data-tab="popups">🚫 Popup</button>
                    <button class="utab"    data-tab="jsscripts">🔧 Scripts</button>
                    <button class="utab"    data-tab="blacklist">⚙️ Cài</button>
                </div>
                <div id="u-pb"></div>
            </div>

            <div id="u-prev">
                <div id="u-prev-bar">
                    <span id="u-prev-title">-</span>
                    <button id="btn-opt" style="background:#222;border:none;color:#fff;width:34px;height:34px;border-radius:50%;cursor:pointer;font-size:17px">⋮</button>
                    <button id="btn-cls" style="background:#222;border:none;color:#f44336;width:34px;height:34px;border-radius:50%;cursor:pointer;font-size:17px">✕</button>
                </div>
                <div id="u-vid-wrap">
                    <video id="u-vid" controls playsinline webkit-playsinline></video>
                </div>
                <div class="p-acts" id="u-p-acts"></div>
            </div>

            <div id="u-drop"></div>
            <div id="u-cmd"></div>

            <div id="u-add-bl">
                <h4 id="u-add-bl-title">🚫 Thêm vào Blacklist</h4>
                <p style="color:#666;font-size:11px;margin:0 0 8px">Chọn loại chặn:</p>
                <div id="u-bl-type">
                    <button class="bl-type-btn on" data-type="popup">🚫 Popup</button>
                    <button class="bl-type-btn"    data-type="js">🔧 JS Script</button>
                    <button class="bl-type-btn"    data-type="media">📺 Media</button>
                </div>
                <input id="u-bl-input" type="text" placeholder="vd: wheelroot.com">
                <div id="u-bl-acts">
                    <button class="hbtn blue" id="btn-bl-add"    style="flex:1">✓ Thêm</button>
                    <button class="hbtn gray" id="btn-bl-cancel" style="flex:1">✕ Hủy</button>
                </div>
            </div>

            <div id="u-toast"></div>
        `);

        initLogic();
    }

    function initLogic() {
        const $ = id => document.getElementById(id);
        let cur = null, rot = 0, zoom = 1;
        let ctab = 'ytdlp', currentPanelTab = 'streams';
        let addBlType = 'popup';

        // ── Toast ──
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
            const b  = $('u-badge');
            const pb = $('u-popup-badge');
            if (b) {
                b.style.display = urls.size ? 'flex' : 'none';
                b.textContent   = urls.size;
            }
            if (pb) {
                pb.style.display = popupBlockCount ? 'flex' : 'none';
                pb.textContent   = popupBlockCount > 99 ? '99+' : popupBlockCount;
            }
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
            if      (currentPanelTab === 'streams')   renderStreams();
            else if (currentPanelTab === 'popups')    renderPopups();
            else if (currentPanelTab === 'jsscripts') renderJsScripts();
            else if (currentPanelTab === 'blacklist') renderBlacklist();
        }

        // ══════════════════════════════
        // TAB: STREAMS
        // ══════════════════════════════
        function renderStreams() {
            const pb = $('u-pb'); pb.innerHTML = '';
            const items = [...urls.values()].sort((a,b) => a.priority - b.priority);
            if (!items.length) {
                pb.innerHTML = `<div style="color:#444;text-align:center;padding:40px 20px;font-size:13px">
                    Chưa có media stream.<br><br>▶️ Phát video rồi nhấn 🔍 QUÉT</div>`;
                return;
            }
            items.forEach(item => {
                const bc  = 'lb-' + (['M3U8','MP4','IFRAME'].includes(item.type) ? item.type : 'other');
                const div = document.createElement('div');
                div.className = 'li'; div.dataset.url = item.url;
                div.innerHTML = `
                    <div class="li-top">
                        <span class="li-badge ${bc}">${item.type}</span>
                        <span class="li-name">${fname(item.url)}</span>
                        <button class="li-block-btn">🚫</button>
                    </div>
                    <div class="li-src">${item.source}</div>
                    <div class="li-url">${item.url}</div>`;
                div.onclick = (e) => {
                    if (e.target.classList.contains('li-block-btn')) return;
                    const it = urls.get(div.dataset.url);
                    if (it.type === 'IFRAME') { window.open(it.url,'_blank'); toast('🚀 Mở iframe'); }
                    else openPrev(it);
                };
                div.querySelector('.li-block-btn').onclick = (e) => {
                    e.stopPropagation();
                    showAddBlacklist(item.url, 'media');
                };
                pb.appendChild(div);
            });
        }

        // ══════════════════════════════
        // TAB: POPUP LOG (MỚI)
        // ══════════════════════════════
        function renderPopups() {
            const pb = $('u-pb'); pb.innerHTML = '';

            // Stats header
            pb.insertAdjacentHTML('beforeend', `
                <div style="padding:10px 14px;background:#1a0000;border-bottom:1px solid #2a0000;display:flex;justify-content:space-between;align-items:center">
                    <div>
                        <div style="color:#ef5350;font-size:13px;font-weight:bold">🚫 ${popupBlockCount} popup đã chặn</div>
                        <div style="color:#555;font-size:10px;margin-top:2px">${popupBlacklist.size} domain trong blacklist</div>
                    </div>
                    <div style="display:flex;gap:6px">
                        <button class="hbtn org" id="btn-add-popup" style="font-size:10px;padding:6px 10px">+ Thêm</button>
                        <button class="hbtn gray" id="btn-clr-popup" style="font-size:10px;padding:6px 10px">🗑 Xóa log</button>
                    </div>
                </div>

                <!-- Popup Blacklist Domains -->
                <div style="padding:8px 14px;background:#161616;border-bottom:1px solid #222">
                    <div style="color:#888;font-size:10px;font-weight:bold;margin-bottom:6px">DOMAIN ĐANG CHẶN POPUP</div>
                    <div id="popup-domains" style="display:flex;flex-wrap:wrap;gap:5px"></div>
                </div>

                <!-- Log header -->
                <div style="padding:8px 14px;color:#555;font-size:10px;font-weight:bold;border-bottom:1px solid #1a1a1a">
                    📋 LOG POPUP BỊ CHẶN
                </div>
            `);

            // Render domains
            const domainEl = pb.querySelector('#popup-domains');
            const allDomains = new Set([
                ...POPUP_HARD_BLOCK,
                ...[...popupBlacklist]
            ]);
            allDomains.forEach(domain => {
                const isHard = POPUP_HARD_BLOCK.includes(domain);
                const tag = document.createElement('span');
                tag.style.cssText = `
                    background:${isHard ? '#2a0000' : '#1a1a2a'};
                    color:${isHard ? '#ef5350' : '#7986cb'};
                    border:1px solid ${isHard ? '#4a0000' : '#2a2a4a'};
                    font-size:10px; padding:3px 8px; border-radius:12px;
                    font-family:monospace; cursor:${isHard ? 'default' : 'pointer'};
                    display:inline-flex; align-items:center; gap:4px;
                `;
                tag.innerHTML = isHard
                    ? `🔒 ${domain}`
                    : `🚫 ${domain} <span style="color:#555">✕</span>`;
                if (!isHard) {
                    tag.onclick = () => {
                        popupBlacklist.delete(domain);
                        saveSet(POPUP_KEY, popupBlacklist);
                        renderPopups();
                        toast('✅ Đã xóa: ' + domain);
                    };
                }
                domainEl.appendChild(tag);
            });

            $('btn-add-popup').onclick = () => showAddBlacklist('', 'popup');
            $('btn-clr-popup').onclick = () => {
                blockedPopups.length = 0;
                popupBlockCount = 0;
                updateBadge();
                renderPopups();
            };

            // Render log
            if (!blockedPopups.length) {
                pb.insertAdjacentHTML('beforeend',
                    `<div style="color:#333;text-align:center;padding:30px;font-size:12px">
                        Chưa có popup nào bị chặn trong phiên này
                    </div>`);
                return;
            }
            blockedPopups.forEach(p => {
                const div = document.createElement('div');
                div.className = 'popup-item';
                div.innerHTML = `
                    <div style="flex:1;min-width:0">
                        <div class="popup-url">${p.url}</div>
                        <div style="margin-top:4px">
                            <span class="popup-method">${p.method}</span>
                        </div>
                    </div>
                    <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px;flex-shrink:0">
                        <span class="popup-time">${p.time}</span>
                        <button style="background:#333;border:none;color:#aaa;font-size:9px;padding:3px 6px;border-radius:4px;cursor:pointer" 
                                data-url="${p.url}">+Block</button>
                    </div>`;
                div.querySelector('[data-url]').onclick = () => {
                    showAddBlacklist(p.url, 'popup');
                };
                pb.appendChild(div);
            });
        }

        // ══════════════════════════════
        // TAB: JS SCRIPTS
        // ══════════════════════════════
        function renderJsScripts() {
            const pb = $('u-pb'); pb.innerHTML = '';
            const total   = jsScripts.size;
            const blocked = [...jsScripts.values()].filter(j => j.blocked).length;

            pb.insertAdjacentHTML('beforeend', `
                <div style="padding:10px 14px;background:#161616;border-bottom:1px solid #222;display:flex;justify-content:space-between;align-items:center">
                    <span style="color:#888;font-size:11px">
                        📦 ${total} scripts •
                        <span style="color:#ef5350">${blocked} bị chặn</span>
                    </span>
                    <div style="display:flex;gap:5px">
                        <button class="hbtn blue" id="btn-js-scan" style="font-size:10px;padding:5px 8px">🔍 Quét</button>
                        <button class="hbtn red"  id="btn-js-blk-all" style="font-size:10px;padding:5px 8px">🚫 Chặn Ads</button>
                    </div>
                </div>`);

            $('btn-js-scan').onclick = () => { scan(document,'manual'); scanPerf(); renderJsScripts(); toast('✅ '+jsScripts.size+' scripts'); };
            $('btn-js-blk-all').onclick = () => {
                let count = 0;
                jsScripts.forEach(item => {
                    if (AD_HARD.some(r => r.test(item.url)) || AD_PATHS.some(r => r.test(item.url))) {
                        jsBlacklist.add(item.domain); item.blocked = true; count++;
                    }
                });
                saveSet(JS_BLACK_KEY, jsBlacklist);
                renderJsScripts();
                toast(`✅ Chặn ${count} ad scripts`, '#2e7d32');
            };

            if (!total) {
                pb.insertAdjacentHTML('beforeend',
                    `<div style="color:#444;text-align:center;padding:40px;font-size:12px">Bấm 🔍 Quét để thu thập scripts</div>`);
                return;
            }

            const byDomain = new Map();
            jsScripts.forEach(item => {
                if (!byDomain.has(item.domain)) byDomain.set(item.domain, []);
                byDomain.get(item.domain).push(item);
            });

            [...byDomain.entries()]
                .sort((a,b) => {
                    const ab = a[1].some(i=>i.blocked)?1:0;
                    const bb = b[1].some(i=>i.blocked)?1:0;
                    return bb-ab || b[1].length-a[1].length;
                })
                .forEach(([domain, items]) => {
                    const isDomainBlocked = [...jsBlacklist].includes(domain);
                    const isAd = AD_HARD.some(r=>r.test(domain))||AD_PATHS.some(r=>r.test(domain));

                    const header = document.createElement('div');
                    header.style.cssText = 'padding:8px 14px;background:#161616;border-bottom:1px solid #1a1a1a;display:flex;align-items:center;gap:8px;cursor:pointer;';
                    header.innerHTML = `
                        <span style="color:${isDomainBlocked?'#ef5350':isAd?'#ff9800':'#888'};font-size:11px;font-weight:bold;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;${isDomainBlocked?'text-decoration:line-through;':''}">
                            ${isAd?'⚠️':'📄'} ${domain} <span style="color:#333;font-weight:normal">(${items.length})</span>
                        </span>
                        <button class="js-toggle ${isDomainBlocked?'unblock':'block'}" data-d="${domain}">
                            ${isDomainBlocked?'✅ Bỏ':'🚫'}
                        </button>`;

                    const listWrap = document.createElement('div');
                    listWrap.style.display = 'none';
                    header.onclick = (e) => {
                        if (e.target.dataset.d) return;
                        listWrap.style.display = listWrap.style.display==='none'?'block':'none';
                    };
                    header.querySelector('[data-d]').onclick = (e) => {
                        e.stopPropagation();
                        if (isDomainBlocked || [...jsBlacklist].includes(domain)) {
                            jsBlacklist.delete(domain); items.forEach(i=>i.blocked=false);
                            toast('✅ Bỏ chặn: '+domain, '#2e7d32');
                        } else {
                            jsBlacklist.add(domain); items.forEach(i=>i.blocked=true);
                            toast('🚫 Chặn: '+domain, '#c62828');
                        }
                        saveSet(JS_BLACK_KEY, jsBlacklist); renderJsScripts();
                    };

                    items.forEach(item => {
                        const row = document.createElement('div');
                        const isB = item.blocked || isJsBlocked(item.url);
                        row.className = 'js-item'+(isB?' blocked':'');
                        row.innerHTML = `
                            <div class="js-info">
                                <div class="js-url ${isB?'blocked-txt':''}">${item.url}</div>
                                <div class="js-src">📌 ${item.source}</div>
                            </div>
                            <div style="display:flex;flex-direction:column;gap:3px;flex-shrink:0">
                                <button class="js-toggle ${isB?'unblock':'block'}">${isB?'✅':'🚫'}</button>
                                <button style="background:#222;border:none;color:#666;font-size:9px;padding:3px 6px;border-radius:4px;cursor:pointer" class="js-cp">📋</button>
                            </div>`;
                        row.querySelector('.js-toggle').onclick = () => {
                            const key = item.url.split('/').pop().split('?')[0] || item.domain;
                            if (isB) { jsBlacklist.delete(key); jsBlacklist.delete(item.domain); item.blocked=false; toast('✅ Bỏ: '+key); }
                            else { jsBlacklist.add(key); item.blocked=true; blockJsExecution(item.url); toast('🚫 Chặn: '+key,'#c62828'); }
                            saveSet(JS_BLACK_KEY, jsBlacklist); renderJsScripts();
                        };
                        row.querySelector('.js-cp').onclick = () => cp(item.url);
                        listWrap.appendChild(row);
                    });

                    pb.appendChild(header);
                    pb.appendChild(listWrap);
                });
        }

        // ══════════════════════════════
        // TAB: BLACKLIST / CÀI ĐẶT
        // ══════════════════════════════
        function renderBlacklist() {
            const pb = $('u-pb'); pb.innerHTML = '';

            // Popup section
            pb.insertAdjacentHTML('beforeend', `
                <div style="padding:8px 14px;background:#1a0000;border-bottom:1px solid #2a0000;display:flex;justify-content:space-between;align-items:center">
                    <span style="color:#ef5350;font-size:11px;font-weight:bold">🚫 POPUP BLACKLIST (${popupBlacklist.size} tùy chỉnh)</span>
                    <button class="hbtn red" id="btn-add-pop2" style="font-size:10px;padding:5px 8px">+ Thêm</button>
                </div>`);
            $('btn-add-pop2').onclick = () => showAddBlacklist('', 'popup');

            [...popupBlacklist].forEach(d => {
                const div = document.createElement('div');
                div.className = 'bl-item';
                div.innerHTML = `<span class="bl-domain" style="color:#ef5350">🚫 ${d}</span><button class="bl-del">Xóa</button>`;
                div.querySelector('.bl-del').onclick = () => {
                    popupBlacklist.delete(d); saveSet(POPUP_KEY, popupBlacklist);
                    toast('✅ Đã xóa popup block: '+d); renderBlacklist();
                };
                pb.appendChild(div);
            });

            // Media section
            pb.insertAdjacentHTML('beforeend', `
                <div style="padding:8px 14px;background:#161616;border-bottom:1px solid #222;display:flex;justify-content:space-between;align-items:center;margin-top:4px">
                    <span style="color:#4fc3f7;font-size:11px;font-weight:bold">📺 MEDIA BLACKLIST (${blacklist.size})</span>
                    <button class="hbtn blue" id="btn-add-med" style="font-size:10px;padding:5px 8px">+ Thêm</button>
                </div>`);
            $('btn-add-med').onclick = () => showAddBlacklist('', 'media');

            [...blacklist].forEach(d => {
                const div = document.createElement('div');
                div.className = 'bl-item';
                div.innerHTML = `<span class="bl-domain" style="color:#4fc3f7">📺 ${d}</span><button class="bl-del">Xóa</button>`;
                div.querySelector('.bl-del').onclick = () => {
                    blacklist.delete(d); saveSet(STORAGE_KEY, blacklist);
                    toast('✅ Đã xóa: '+d); renderBlacklist();
                };
                pb.appendChild(div);
            });

            // JS section
            pb.insertAdjacentHTML('beforeend', `
                <div style="padding:8px 14px;background:#161616;border-bottom:1px solid #222;display:flex;justify-content:space-between;align-items:center;margin-top:4px">
                    <span style="color:#ff9800;font-size:11px;font-weight:bold">🔧 JS BLACKLIST (${jsBlacklist.size})</span>
                    <button class="hbtn org" id="btn-add-js" style="font-size:10px;padding:5px 8px">+ Thêm</button>
                </div>`);
            $('btn-add-js').onclick = () => showAddBlacklist('', 'js');

            [...jsBlacklist].forEach(d => {
                const div = document.createElement('div');
                div.className = 'bl-item';
                div.innerHTML = `<span class="bl-domain" style="color:#ff9800">🔧 ${d}</span><button class="bl-del">Xóa</button>`;
                div.querySelector('.bl-del').onclick = () => {
                    jsBlacklist.delete(d); saveSet(JS_BLACK_KEY, jsBlacklist);
                    toast('✅ Đã xóa JS block: '+d); renderBlacklist();
                };
                pb.appendChild(div);
            });
        }

        // ══════════════════════════════
        // SHOW ADD BLACKLIST
        // ══════════════════════════════
        function showAddBlacklist(url, type) {
            addBlType = type || 'popup';
            // Set type button
            document.querySelectorAll('.bl-type-btn').forEach(b => {
                b.classList.toggle('on', b.dataset.type === addBlType);
            });
            try {
                $('u-bl-input').value = new URL(url).hostname;
            } catch(e) {
                $('u-bl-input').value = url || '';
            }
            $('u-add-bl').classList.add('on');
            $('u-bd').classList.add('on');
            setTimeout(() => $('u-bl-input').focus(), 100);
        }

        // Type buttons
        document.querySelectorAll('.bl-type-btn').forEach(b => {
            b.onclick = () => {
                addBlType = b.dataset.type;
                document.querySelectorAll('.bl-type-btn').forEach(x =>
                    x.classList.toggle('on', x.dataset.type === addBlType)
                );
            };
        });

        $('btn-bl-add').onclick = () => {
            const val = $('u-bl-input').value.trim();
            if (!val) { toast('❌ Nhập domain!', '#c62828'); return; }

            if (addBlType === 'popup') {
                popupBlacklist.add(val);
                saveSet(POPUP_KEY, popupBlacklist);
                toast('✅ Popup block: ' + val, '#c62828');
            } else if (addBlType === 'js') {
                jsBlacklist.add(val);
                saveSet(JS_BLACK_KEY, jsBlacklist);
                toast('✅ JS block: ' + val, '#e65100');
            } else {
                blacklist.add(val);
                saveSet(STORAGE_KEY, blacklist);
                urls.forEach((item, key) => { if (key.includes(val)) urls.delete(key); });
                toast('✅ Media block: ' + val, '#1565c0');
            }

            updateBadge();
            $('u-add-bl').classList.remove('on');
            renderPanel();
        };

        $('btn-bl-cancel').onclick = () => {
            $('u-add-bl').classList.remove('on');
            if (!$('u-panel').classList.contains('on')) $('u-bd').classList.remove('on');
        };

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
            vid.addEventListener('webkitbeginfullscreen', tryLock);

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
            $('u-vid').src = item.url;
            $('u-vid').onerror = () => toast('❌ Không phát được','#c62828');

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
            $('pc-rot').onclick  = () => { rot=(rot+90)%360; $('u-vid').style.transform=`rotate(${rot}deg) scale(${zoom})`; };
            $('pc-zm').onclick   = (e) => {
                const lv=[1,1.25,1.5,2,0.75];
                zoom=lv[(lv.indexOf(zoom)+1)%lv.length];
                e.target.textContent=`🔍 ${zoom}x`;
                $('u-vid').style.transform=`rotate(${rot}deg) scale(${zoom})`;
            };
            $('u-prev').classList.add('on');
            $('u-bd').classList.add('on');
            $('u-panel').classList.remove('on');
        }

        // ══════════════════════════════
        // CMD MODAL
        // ══════════════════════════════
        function openCmd(url) {
            const build = (t) => {
                ctab = t;
                const data = {
                    ytdlp:[
                        {l:'Tải cao nhất',c:`yt-dlp --referer "${REF}" "${url}"`},
                        {l:'Bypass đầy đủ',c:`yt-dlp --referer "${REF}" --user-agent "${UA}" -f "bestvideo+bestaudio" "${url}"`},
                        {l:'Chỉ Audio',c:`yt-dlp -x --audio-format mp3 --referer "${REF}" "${url}"`},
                    ],
                    ffmpeg:[
                        {l:'Copy stream',c:`ffmpeg -referer "${REF}" -user_agent "${UA}" -i "${url}" -c copy output.mp4`},
                        {l:'Re-encode H264',c:`ffmpeg -referer "${REF}" -i "${url}" -c:v libx264 -c:a aac output.mp4`},
                    ],
                    termux:[
                        {l:'Cài tools',c:`pkg install python ffmpeg -y && pip install yt-dlp`},
                        {l:'Tải video',c:`yt-dlp --referer "${REF}" "${url}"`},
                        {l:'FFmpeg HLS',c:`ffmpeg -referer "${REF}" -i "${url}" -c copy ~/storage/downloads/out.mp4`},
                    ],
                }[t]||[];

                $('u-cmd').innerHTML = `
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
                        <h4 style="color:#fff;margin:0;font-size:13px">💻 Lệnh tải</h4>
                        <span style="color:#444;font-size:10px;max-width:140px;overflow:hidden;text-overflow:ellipsis">${fname(url)}</span>
                    </div>
                    <div style="display:flex;gap:4px;margin-bottom:12px">
                        ${['ytdlp','ffmpeg','termux'].map(tab=>`
                            <button style="flex:1;background:${tab===t?'#e53935':'#222'};color:white;border:none;padding:7px;border-radius:7px;cursor:pointer;font-size:10px;font-weight:bold" data-tab="${tab}">${tab.toUpperCase()}</button>
                        `).join('')}
                    </div>
                    ${data.map(d=>`
                        <div class="cmd-block">
                            <div class="cmd-label">${d.l}</div>
                            <div class="cmd-row">
                                <textarea class="cmd-ta" rows="2" readonly>${d.c}</textarea>
                                <button class="cmd-cp">📋</button>
                            </div>
                        </div>`).join('')}
                    <button style="width:100%;background:#c62828;border:none;color:white;padding:10px;border-radius:7px;cursor:pointer;font-weight:bold" id="cmd-cls">ĐÓNG</button>`;

                $('u-cmd').querySelectorAll('.cmd-ta').forEach(ta => { ta.style.height='auto'; ta.style.height=ta.scrollHeight+'px'; });
                $('u-cmd').querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>build(b.dataset.tab));
                $('u-cmd').querySelectorAll('.cmd-cp').forEach(b=>b.onclick=()=>cp(b.parentElement.querySelector('.cmd-ta').value));
                $('cmd-cls').onclick=()=>{
                    $('u-cmd').classList.remove('on');
                    if(!$('u-prev').classList.contains('on')&&!$('u-panel').classList.contains('on')) $('u-bd').classList.remove('on');
                };
            };
            build(ctab);
            $('u-cmd').classList.add('on');
            $('u-bd').classList.add('on');
        }

        // ══════════════════════════════
        // DROPDOWN ⋮
        // ══════════════════════════════
        $('btn-opt').onclick = (e) => {
            e.stopPropagation();
            const d = $('u-drop');
            d.innerHTML = `
                <div class="di" id="m-qs">🎞 Chọn chất lượng</div>
                <div class="di" id="m-fs">⛶ Fullscreen Ngang</div>
                <div class="di" id="m-new">🌐 Mở tab mới</div>
                <div class="di" id="m-block" style="color:#ef5350">🚫 Chặn popup domain</div>
                <div class="di" id="m-ddrop" style="color:#555">✕ Đóng</div>`;
            const r = $('btn-opt').getBoundingClientRect();
            d.style.top=r.bottom+8+'px'; d.style.right='12px'; d.style.display='block';

            $('m-fs').onclick=()=>{ d.style.display='none'; triggerFullscreen(); };
            $('m-new').onclick=()=>{ window.open(cur.url,'_blank'); d.style.display='none'; };
            $('m-block').onclick=()=>{ d.style.display='none'; showAddBlacklist(cur.url,'popup'); };
            $('m-ddrop').onclick=()=>d.style.display='none';
            $('m-qs').onclick=()=>{
                d.style.display='none';
                if(!cur||cur.type!=='M3U8'){toast('Chỉ hỗ trợ HLS');return;}
                toast('⏳ Parse M3U8...');
                fetch(cur.url).then(r=>r.text()).then(text=>{
                    if(!text.includes('#EXT-X-STREAM-INF')){toast('Không có multi-quality');return;}
                    const lines=text.split('\n'),qs=[];
                    for(let i=0;i<lines.length;i++){
                        if(lines[i].includes('RESOLUTION=')){
                            const res=lines[i].match(/RESOLUTION=(\d+x\d+)/)?.[1]||'';
                            const bw=lines[i].match(/BANDWIDTH=(\d+)/)?.[1]||'0';
                            const next=(lines[i+1]||'').trim();
                            if(next&&!next.startsWith('#')){
                                const su=next.startsWith('http')?next:cur.url.substring(0,cur.url.lastIndexOf('/')+1)+next;
                                qs.push({label:res.split('x')[1]+'p',url:su,bw:parseInt(bw)});
                            }
                        }
                    }
                    qs.sort((a,b)=>b.bw-a.bw);
                    if(!qs.length){toast('Không parse được');return;}
                    const dd=$('u-drop');
                    dd.innerHTML='<div style="padding:8px 14px;color:#555;font-size:10px;font-weight:bold;border-bottom:1px solid #333">CHẤT LƯỢNG</div>'+
                        qs.map(q=>`<div class="di q-item" data-url="${q.url}">📺 ${q.label}</div>`).join('');
                    dd.style.display='block';
                    dd.querySelectorAll('.q-item').forEach(qi=>qi.onclick=()=>{
                        $('u-vid').src=qi.dataset.url; dd.style.display='none';
                        toast('▶ '+qi.textContent.trim());
                    });
                }).catch(()=>toast('❌ Lỗi parse'));
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

        $('btn-scan').onclick=()=>{ scan(document,'deep'); scanPerf(); renderPanel(); toast('✅ '+urls.size+' media, '+jsScripts.size+' scripts'); };
        $('btn-clr').onclick=()=>{ urls.clear(); updateBadge(); renderPanel(); toast('🗑 Đã xóa'); };
        $('btn-cls').onclick=()=>{
            $('u-vid').pause(); $('u-vid').src='';
            $('u-prev').classList.remove('on'); $('u-bd').classList.remove('on');
            if(screen.orientation&&screen.orientation.unlock) screen.orientation.unlock();
        };

        $('u-bd').onclick=(e)=>{
            if($('u-add-bl').classList.contains('on')){ $('u-add-bl').classList.remove('on'); return; }
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

        // Auto scan overlay mỗi 2s
        setInterval(removeOverlays, 2000);
    }

    // ══════════════════════════════════════════
    // AUTO START
    // ══════════════════════════════════════════
    setInterval(scanPerf, 3000);
    setTimeout(()=>{ scan(document,'auto'); updateBadge(); }, 2000);

    if (document.body) initUI();
    else document.addEventListener('DOMContentLoaded', initUI);

})();