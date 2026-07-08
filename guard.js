// ==UserScript==
// @name         Redirect Guard PRO
// @namespace    redirect-guard-pro
// @version      2.0
// @description  Chặn popup + redirect với 13 layers protection. TỰ CHẠY mọi trang.
// @author       You
// @match        *://*/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

/**
 * ĐỂ TỰ CHẠY KHÔNG CẦN BOOKMARKLET:
 * 
 * CÁCH 1 (Khuyên dùng): Tampermonkey Extension
 *   1. Cài Tampermonkey: https://www.tampermonkey.net/
 *   2. New Script → Paste toàn bộ file này → Save
 *   3. Script tự chạy ở MỌI trang, ngay document-start (sớm nhất có thể)
 * 
 * CÁCH 2: Bookmarklet (chạy thủ công)
 *   Tạo bookmark với URL = javascript:(function(){...code...})();
 * 
 * CÁCH 3: Chrome Extension tự làm
 *   manifest.json với content_scripts run_at: "document_start"
 */

(function () {
    'use strict';

    // Singleton guard
    if (window.__gp2__) {
        if (typeof window.__gp2__ === 'object') {
            window.__gp2__.showSettings();
        }
        return;
    }

    // ═══════════════════════════════════════
    //  CONSTANTS & STATE
    // ═══════════════════════════════════════
    const STORAGE_KEY = 'gp2_config';
    const GLOBAL_BL_KEY = 'gp2_global_blacklist';
    const VERSION = '2.0';
    const host = location.hostname.replace(/^www\./, '');

    // Session-only (không persist)
    const sessionAllow = new Set();
    const sessionBlock = new Set();

    const stats = {
        blocked: 0, allowed: 0, asked: 0,
        byType: {}
    };

    // ═══════════════════════════════════════
    //  CONFIG / STORAGE
    // ═══════════════════════════════════════
    const Storage = {
        get() {
            try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; }
            catch { return {}; }
        },
        save(data) {
            try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); }
            catch { }
        },
        getGlobalBL() {
            try { return JSON.parse(localStorage.getItem(GLOBAL_BL_KEY)) || []; }
            catch { return []; }
        },
        saveGlobalBL(list) {
            try { localStorage.setItem(GLOBAL_BL_KEY, JSON.stringify(list)); }
            catch { }
        },
        export() {
            return JSON.stringify({
                version: VERSION,
                config: this.get(),
                globalBlacklist: this.getGlobalBL(),
                exportedAt: new Date().toISOString()
            }, null, 2);
        },
        import(jsonStr) {
            const data = JSON.parse(jsonStr);
            if (data.config) this.save(data.config);
            if (data.globalBlacklist) this.saveGlobalBL(data.globalBlacklist);
            return data;
        }
    };

    // Load config
    let cfg = Storage.get();
    const DEFAULT_SITE_CFG = () => ({ whitelist: [], blacklist: [], mode: 'ask' });
    if (!cfg[host]) cfg[host] = DEFAULT_SITE_CFG();

    // Global blacklist (áp dụng cho MỌI site)
    let globalBL = new Set(Storage.getGlobalBL());

    // Shortcuts
    const siteCfg = () => cfg[host];

    function saveConfig() {
        Storage.save(cfg);
    }

    function addToBlacklist(domain, { global = false, session = false } = {}) {
        if (session) {
            sessionBlock.add(domain);
            return;
        }
        if (global) {
            globalBL.add(domain);
            Storage.saveGlobalBL([...globalBL]);
        } else {
            if (!siteCfg().blacklist.includes(domain)) {
                siteCfg().blacklist.push(domain);
                saveConfig();
            }
        }
    }

    function addToWhitelist(domain, { session = false } = {}) {
        if (session) {
            sessionAllow.add(domain);
            return;
        }
        if (!siteCfg().whitelist.includes(domain)) {
            siteCfg().whitelist.push(domain);
            saveConfig();
        }
    }

    function removeFromBlacklist(domain, { global = false } = {}) {
        if (global) {
            globalBL.delete(domain);
            Storage.saveGlobalBL([...globalBL]);
        } else {
            cfg[host].blacklist = siteCfg().blacklist.filter(d => d !== domain);
            saveConfig();
        }
    }

    function removeFromWhitelist(domain) {
        cfg[host].whitelist = siteCfg().whitelist.filter(d => d !== domain);
        saveConfig();
    }

    // ═══════════════════════════════════════
    //  URL HELPERS
    // ═══════════════════════════════════════
    function extractDomain(url) {
        try { return new URL(url, location.href).hostname.replace(/^www\./, ''); }
        catch { return url; }
    }

    function isSameDomain(url) {
        const d = extractDomain(url);
        return d === host || d.endsWith('.' + host);
    }

    function isAllowed(url) {
        const d = extractDomain(url);
        return sessionAllow.has(d) || siteCfg().whitelist.includes(d);
    }

    function isBlocked(url) {
        const d = extractDomain(url);
        return sessionBlock.has(d)
            || siteCfg().blacklist.includes(d)
            || globalBL.has(d);
    }

    // ═══════════════════════════════════════
    //  STATS
    // ═══════════════════════════════════════
    function recordStat(type, action) {
        if (!stats.byType[type]) stats.byType[type] = { blocked: 0, allowed: 0 };
        stats.byType[type][action]++;
        stats[action]++;
        updateBadge();
    }

    // ═══════════════════════════════════════
    //  ORIGINAL REFERENCES (trước khi override)
    // ═══════════════════════════════════════
    const orig = {
        open: window.open,
        assign: location.assign.bind(location),
        replace: location.replace.bind(location),
        pushState: history.pushState.bind(history),
        replaceState: history.replaceState.bind(history),
        click: HTMLElement.prototype.click,
        formSubmit: HTMLFormElement.prototype.submit,
        setTimeout: window.setTimeout,
        addEventListener: EventTarget.prototype.addEventListener,
    };

    // ═══════════════════════════════════════
    //  CORE ACTION HANDLER
    // ═══════════════════════════════════════
    const pendingQueue = [];
    let activeDialog = null;

    /**
     * @param {{ type: string, url: string, trigger: string, execute: Function }} action
     * @returns {any}
     */
    function handleAction(action) {
        const { url, type } = action;

        if (isAllowed(url)) {
            recordStat(type, 'allowed');
            return action.execute();
        }

        if (isBlocked(url) || siteCfg().mode === 'block') {
            recordStat(type, 'blocked');
            showToast('🚫 Blocked: ' + extractDomain(url), '#f44336');
            return null;
        }

        if (siteCfg().mode === 'allow') {
            recordStat(type, 'allowed');
            return action.execute();
        }

        // Ask mode
        stats.asked++;
        updateBadge();
        pendingQueue.push(action);
        if (!activeDialog) processQueue();
        return null;
    }

    // ═══════════════════════════════════════
    //  LAYER 1: window.open
    // ═══════════════════════════════════════
    const openProxy = function (url, target, features) {
        const abs = url ? new URL(url, location.href).href : '';
        return handleAction({
            type: 'window.open',
            url: abs,
            trigger: `window.open("${abs.slice(0, 50)}...")`,
            execute: () => orig.open.call(window, url, target, features)
        });
    };

    try {
        Object.defineProperty(window, 'open', {
            value: openProxy, writable: false, configurable: false
        });
    } catch {
        window.open = openProxy;
    }

    // ═══════════════════════════════════════
    //  LAYER 2: location.assign / replace
    // ═══════════════════════════════════════
    const makeLocationProxy = (name, origFn) => function (url) {
        const abs = new URL(url, location.href).href;
        if (!isSameDomain(abs)) {
            handleAction({
                type: 'location.' + name,
                url: abs,
                trigger: `location.${name}()`,
                execute: () => origFn(url)
            });
            return;
        }
        origFn(url);
    };

    try {
        location.assign = makeLocationProxy('assign', orig.assign);
        location.replace = makeLocationProxy('replace', orig.replace);
    } catch { }

    // ═══════════════════════════════════════
    //  LAYER 3: history.pushState / replaceState
    // ═══════════════════════════════════════
    const makeHistoryProxy = (name, origFn) => function (state, title, url) {
        if (url) {
            const abs = new URL(url, location.href).href;
            if (!isSameDomain(abs)) {
                handleAction({
                    type: 'history.' + name,
                    url: abs,
                    trigger: `history.${name}()`,
                    execute: () => origFn(state, title, url)
                });
                return;
            }
        }
        origFn(state, title, url);
    };

    history.pushState = makeHistoryProxy('pushState', orig.pushState);
    history.replaceState = makeHistoryProxy('replaceState', orig.replaceState);

    // ═══════════════════════════════════════
    //  LAYER 4: Meta refresh
    // ═══════════════════════════════════════
    document.querySelectorAll('meta[http-equiv="refresh" i]').forEach(m => m.remove());

    const META_REFRESH_RE = /^\s*(\d+)\s*;\s*url\s*=\s*(.+)$/i;

    // ═══════════════════════════════════════
    //  LAYER 5: Base tag
    // ═══════════════════════════════════════
    document.querySelectorAll('base').forEach(b => {
        if (b.target === '_blank' || (b.href && !isSameDomain(b.href))) b.remove();
    });

    // ═══════════════════════════════════════
    //  LAYER 6: element.click()
    // ═══════════════════════════════════════
    HTMLElement.prototype.click = function () {
        if (this.tagName === 'A' && this.href) {
            const href = this.href;
            const skip = href.startsWith('#') || /^(javascript|mailto|tel):/.test(href);
            if (!skip && (!isSameDomain(href) || this.target === '_blank')) {
                const self = this;
                handleAction({
                    type: 'element.click',
                    url: href,
                    trigger: 'programmatic .click()',
                    execute: () => orig.click.call(self)
                });
                return;
            }
        }
        orig.click.call(this);
    };

    // ═══════════════════════════════════════
    //  LAYER 7: form.submit()
    // ═══════════════════════════════════════
    HTMLFormElement.prototype.submit = function () {
        const abs = new URL(this.action || location.href, location.href).href;
        if (!isSameDomain(abs)) {
            const form = this;
            handleAction({
                type: 'form.submit',
                url: abs,
                trigger: 'form.submit() → external',
                execute: () => orig.formSubmit.call(form)
            });
            return;
        }
        orig.formSubmit.call(this);
    };

    // ═══════════════════════════════════════
    //  LAYER 8: Click capture (highest priority)
    // ═══════════════════════════════════════
    const SKIP_SCHEMES = /^(#|javascript:|mailto:|tel:)/;
    const SUSPICIOUS_ONCLICK = /window\.open|location\.|\.click\(\)/;

    function clickHandler(e) {
        if (e.target.closest?.('#__gp2_dialog__, #__gp2_badge__, #__gp2_settings__')) return;

        // --- Link clicks ---
        const link = e.target.closest('a');
        if (link?.href && !SKIP_SCHEMES.test(link.href)) {
            const isExternal = !isSameDomain(link.href);
            const isNewTab = link.target === '_blank';

            if (isExternal || isNewTab) {
                e.preventDefault();
                e.stopImmediatePropagation();

                if (isAllowed(link.href)) {
                    recordStat('link', 'allowed');
                    if (isNewTab) orig.open.call(window, link.href, '_blank');
                    else orig.assign(link.href);
                    return;
                }
                if (isBlocked(link.href) || siteCfg().mode === 'block') {
                    recordStat('link', 'blocked');
                    showToast('🚫 Blocked: ' + extractDomain(link.href), '#f44336');
                    return;
                }
                handleAction({
                    type: 'link-click',
                    url: link.href,
                    trigger: `<a target="${link.target || 'self'}">`,
                    execute: () => {
                        if (isNewTab) orig.open.call(window, link.href, '_blank');
                        else orig.assign(link.href);
                    }
                });
                return;
            }
        }

        // --- Suspicious onclick ---
        const onclickAttr = e.target.getAttribute?.('onclick') || '';
        if (onclickAttr && SUSPICIOUS_ONCLICK.test(onclickAttr)) {
            e.preventDefault();
            e.stopImmediatePropagation();
            recordStat('onclick-attr', 'blocked');
            showToast('🚫 Blocked onclick redirect', '#f44336');
        }
    }

    ['click', 'mousedown', 'auxclick', 'touchstart', 'touchend'].forEach(ev =>
        document.addEventListener(ev, clickHandler, true)
    );

    // ═══════════════════════════════════════
    //  LAYER 9 + 10: MutationObserver (meta/iframe/overlay/base)
    // ═══════════════════════════════════════
    const domObserver = new MutationObserver(mutations => {
        for (const m of mutations) {
            for (const node of m.addedNodes) {
                if (node.nodeType !== 1) continue;
                const tag = node.tagName;

                // Meta refresh
                if (tag === 'META' && (node.getAttribute('http-equiv') || '').toLowerCase() === 'refresh') {
                    const match = (node.getAttribute('content') || '').match(META_REFRESH_RE);
                    if (match) {
                        const url = match[2].trim().replace(/^['"]|['"]$/g, '');
                        const abs = new URL(url, location.href).href;
                        node.remove();
                        handleAction({
                            type: 'meta-refresh',
                            url: abs,
                            trigger: `meta refresh (${match[1]}s)`,
                            execute: () => { location.href = url; }
                        });
                    }
                    continue;
                }

                // Base tag
                if (tag === 'BASE') {
                    node.remove();
                    recordStat('base-inject', 'blocked');
                    continue;
                }

                // Iframe
                if (tag === 'IFRAME') {
                    const src = node.src || '';
                    if (src && !isSameDomain(src) && !isAllowed(src)) {
                        node.remove();
                        recordStat('iframe-inject', 'blocked');
                        showToast('🚫 Blocked iframe: ' + extractDomain(src), '#f44336');
                    }
                    continue;
                }

                // Clickjack overlay
                if (tag === 'DIV' || tag === 'A') {
                    orig.setTimeout(() => {
                        if (!node.parentNode) return;
                        const s = getComputedStyle(node);
                        const r = node.getBoundingClientRect();
                        if ((s.position === 'fixed' || s.position === 'absolute')
                            && +s.zIndex > 9999
                            && r.width > 200 && r.height > 200
                            && parseFloat(s.opacity) < 0.5) {
                            node.remove();
                            recordStat('clickjack', 'blocked');
                            showToast('🚫 Blocked overlay', '#f44336');
                        }
                    }, 100);
                }
            }
        }
    });

    domObserver.observe(document.documentElement, { childList: true, subtree: true });

    // ═══════════════════════════════════════
    //  LAYER 11: onbeforeunload
    // ═══════════════════════════════════════
    try {
        Object.defineProperty(window, 'onbeforeunload', {
            set() { recordStat('onbeforeunload', 'blocked'); },
            get() { return null; }
        });
    } catch { }

    window.addEventListener('beforeunload', e => {
        e.stopImmediatePropagation();
        return null;
    }, true);

    // ═══════════════════════════════════════
    //  LAYER 12: iframe top navigation
    // ═══════════════════════════════════════
    if (window !== window.top) {
        try {
            Object.defineProperty(window.top, 'location', {
                get: () => window.top.location,
                set(v) { recordStat('top-nav', 'blocked'); }
            });
        } catch { }
    }

    // ═══════════════════════════════════════
    //  LAYER 13: setTimeout redirect detection
    // ═══════════════════════════════════════
    const REDIRECT_IN_FN = /window\.open|location\.(href|assign|replace)\s*=/;

    window.setTimeout = function (fn, delay, ...args) {
        if (typeof fn === 'function') {
            const fnStr = fn.toString();
            if (REDIRECT_IN_FN.test(fnStr) && !fnStr.includes(location.hostname)) {
                console.warn('⚠️ Guard: suspicious setTimeout', fnStr.slice(0, 100));
                // Log only, không hard-block để tránh false positive
            }
        }
        return orig.setTimeout.call(window, fn, delay, ...args);
    };

    // ═══════════════════════════════════════
    //  DIALOG UI
    // ═══════════════════════════════════════
    const TYPE_ICONS = {
        'window.open': '🪟', 'location.assign': '🔀', 'location.replace': '🔀',
        'history.pushState': '📌', 'history.replaceState': '📌',
        'meta-refresh': '⏱️', 'link-click': '🔗', 'element.click': '🖱️',
        'form.submit': '📤'
    };

    function processQueue() {
        if (pendingQueue.length === 0) { activeDialog = null; return; }

        const action = pendingQueue.shift();
        const domain = extractDomain(action.url);
        const isExternal = !isSameDomain(action.url);
        const accentColor = isExternal ? '#f44336' : '#FF9800';
        const icon = TYPE_ICONS[action.type] || '⚠️';

        const overlay = document.createElement('div');
        overlay.id = '__gp2_dialog__';
        overlay.style.cssText = `
            position:fixed;inset:0;background:rgba(0,0,0,.9);
            z-index:2147483647;display:flex;align-items:center;
            justify-content:center;padding:15px;
            font-family:-apple-system,Arial,sans-serif;
        `;

        overlay.innerHTML = `
        <div style="background:linear-gradient(135deg,#1a1a1a,#2a2a2a);border:2px solid ${accentColor};
                    border-radius:15px;padding:20px;max-width:500px;width:100%;color:#fff;
                    box-shadow:0 20px 60px rgba(0,0,0,.9);">

            <div style="text-align:center;margin-bottom:12px;">
                <div style="font-size:40px;">${icon}</div>
                <h2 style="margin:4px 0 0;color:${accentColor};font-size:16px;">${action.type}</h2>
                ${isExternal ? `<div style="color:#f44336;font-size:11px;font-weight:bold;margin-top:4px;">⚠️ EXTERNAL DOMAIN</div>` : ''}
            </div>

            <div style="background:#0a0a0a;padding:10px;border-radius:8px;margin-bottom:10px;font-size:11px;">
                <div style="color:#888;margin-bottom:3px;">URL:</div>
                <div style="color:#fff;font-family:monospace;word-break:break-all;">${action.url}</div>
                <div style="color:${accentColor};margin-top:5px;">🌐 ${domain}</div>
            </div>

            <div style="background:#111;padding:6px 10px;border-radius:4px;margin-bottom:10px;
                        font-size:10px;color:#666;">🔍 ${action.trigger}</div>

            ${pendingQueue.length > 0
                ? `<div style="background:#c62828;color:#fff;padding:5px;border-radius:5px;
                              text-align:center;font-size:11px;margin-bottom:10px;">
                       ⏳ +${pendingQueue.length} pending
                   </div>` : ''}

            <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;">
                <button id="__gp2_a1__"  style="${btnCSS('#4CAF50')}">✓ Allow once</button>
                <button id="__gp2_b1__"  style="${btnCSS('#f44336')}">✕ Block once</button>
                <button id="__gp2_as__"  style="${btnCSS('#2196F3', 10)}">✓✓ Allow (session)</button>
                <button id="__gp2_bs__"  style="${btnCSS('#c62828', 10)}">✕✕ Block (session)</button>
                <button id="__gp2_ap__"  style="${btnCSS('#1B5E20', 10)}">⭐ Whitelist forever</button>
                <button id="__gp2_bp__"  style="${btnCSS('#B71C1C', 10)}">🚫 Blacklist forever</button>
                <button id="__gp2_bpg__" style="${btnCSS('#880000', 10)};grid-column:span 2;">
                    🌍 Blacklist globally (all sites)
                </button>
            </div>

            <div style="margin-top:10px;text-align:center;">
                <a id="__gp2_copy__" style="color:#666;cursor:pointer;font-size:10px;text-decoration:underline;">
                    📋 Copy URL
                </a>
            </div>
        </div>`;

        document.body.appendChild(overlay);
        activeDialog = overlay;

        function close(then) {
            overlay.remove();
            activeDialog = null;
            if (then) then();
            orig.setTimeout(processQueue, 100);
        }

        const $ = id => document.getElementById(id);

        $('__gp2_a1__').onclick = () => close(() => {
            recordStat(action.type, 'allowed');
            action.execute();
        });

        $('__gp2_b1__').onclick = () => close(() => {
            recordStat(action.type, 'blocked');
            showToast('🚫 Blocked', '#f44336');
        });

        $('__gp2_as__').onclick = () => close(() => {
            addToWhitelist(domain, { session: true });
            recordStat(action.type, 'allowed');
            showToast('✓✓ Session allow: ' + domain, '#2196F3');
            action.execute();
        });

        $('__gp2_bs__').onclick = () => close(() => {
            addToBlacklist(domain, { session: true });
            recordStat(action.type, 'blocked');
            showToast('✕✕ Session block: ' + domain, '#c62828');
        });

        $('__gp2_ap__').onclick = () => close(() => {
            addToWhitelist(domain);
            recordStat(action.type, 'allowed');
            showToast('⭐ Whitelisted: ' + domain, '#4CAF50');
            action.execute();
        });

        $('__gp2_bp__').onclick = () => close(() => {
            addToBlacklist(domain);
            recordStat(action.type, 'blocked');
            showToast('🚫 Blacklisted: ' + domain, '#B71C1C');
        });

        $('__gp2_bpg__').onclick = () => close(() => {
            addToBlacklist(domain, { global: true });
            recordStat(action.type, 'blocked');
            showToast('🌍 Globally blacklisted: ' + domain, '#880000');
        });

        $('__gp2_copy__').onclick = function () {
            navigator.clipboard?.writeText(action.url).catch(() => {
                // Fallback
                const t = Object.assign(document.createElement('textarea'),
                    { value: action.url, style: 'position:fixed;opacity:0' });
                document.body.appendChild(t);
                t.select();
                document.execCommand('copy');
                t.remove();
            });
            this.textContent = '✓ Copied!';
        };
    }

    function btnCSS(bg, fontSize = 12) {
        return `background:${bg};color:#fff;border:0;padding:10px 6px;border-radius:6px;` +
            `font-weight:bold;font-size:${fontSize}px;cursor:pointer;width:100%;`;
    }

    // ═══════════════════════════════════════
    //  BADGE
    // ═══════════════════════════════════════
    const badge = Object.assign(document.createElement('div'), { id: '__gp2_badge__' });
    badge.style.cssText = `
        position:fixed;top:10px;right:10px;color:#fff;padding:6px 12px;
        border-radius:20px;z-index:2147483646;font:bold 11px Arial;
        box-shadow:0 3px 10px rgba(0,0,0,.5);cursor:pointer;user-select:none;
        transition:background .3s;
    `;
    badge.title = 'Guard PRO v2 - Click để settings';
    badge.onclick = showSettings;

    function updateBadge() {
        const hasBlocked = stats.blocked > 0;
        badge.style.background = hasBlocked
            ? 'linear-gradient(135deg,#f44336,#c62828)'
            : 'linear-gradient(135deg,#4CAF50,#2E7D32)';
        badge.innerHTML = `🛡️ PRO · ${stats.blocked}🚫 ${stats.allowed}✓`;
    }

    updateBadge();

    // Đợi body sẵn
    const appendBadge = () => document.body?.appendChild(badge);
    if (document.body) appendBadge();
    else document.addEventListener('DOMContentLoaded', appendBadge);

    // ═══════════════════════════════════════
    //  TOAST
    // ═══════════════════════════════════════
    function showToast(msg, color = '#333') {
        const t = Object.assign(document.createElement('div'), { innerHTML: msg });
        t.style.cssText = `
            position:fixed;top:50px;right:10px;background:${color};color:#fff;
            padding:8px 15px;border-radius:15px;z-index:2147483648;
            font:bold 11px Arial;box-shadow:0 3px 10px rgba(0,0,0,.5);
            animation:fadeIn .2s ease;pointer-events:none;
        `;
        document.body.appendChild(t);
        orig.setTimeout(() => t.remove(), 2500);
    }

    // ═══════════════════════════════════════
    //  SETTINGS PANEL
    // ═══════════════════════════════════════
    function showSettings() {
        document.getElementById('__gp2_settings__')?.remove();

        const panel = document.createElement('div');
        panel.id = '__gp2_settings__';
        panel.style.cssText = `
            position:fixed;inset:0;background:rgba(0,0,0,.97);z-index:2147483649;
            padding:15px;overflow-y:auto;font-family:-apple-system,Arial,sans-serif;color:#fff;
        `;

        const blList = siteCfg().blacklist;
        const wlList = siteCfg().whitelist;
        const gblList = [...globalBL];

        const renderList = (items, btnClass, color, emptyMsg) => {
            if (!items.length) return `<div style="color:#555;font-size:11px;">${emptyMsg}</div>`;
            return items.map(d => `
                <div style="background:${color};padding:6px 10px;margin:3px 0;border-radius:4px;
                            font-size:11px;display:flex;justify-content:space-between;align-items:center;">
                    <span style="font-family:monospace;">${d}</span>
                    <button class="${btnClass}" data-d="${d}"
                        style="background:rgba(0,0,0,.4);color:#fff;border:0;padding:2px 8px;
                               border-radius:3px;cursor:pointer;">✕</button>
                </div>`).join('');
        };

        panel.innerHTML = `
        <div style="max-width:560px;margin:0 auto;display:flex;flex-direction:column;gap:12px;">

            <div style="display:flex;justify-content:space-between;align-items:center;">
                <span style="color:#4CAF50;font:bold 16px Arial;">🛡️ Guard PRO v${VERSION}</span>
                <button id="__gp2_cls__" style="background:#555;color:#fff;border:0;
                    padding:6px 14px;border-radius:6px;cursor:pointer;">✕ Close</button>
            </div>

            <!-- Stats -->
            <div style="background:#1e1e1e;padding:12px;border-radius:8px;">
                <div style="font-weight:bold;margin-bottom:8px;">📊 Stats - ${host}</div>
                <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;text-align:center;">
                    <div style="background:#c62828;padding:8px;border-radius:6px;">
                        <div style="font-size:22px;font-weight:bold;">${stats.blocked}</div>
                        <div style="font-size:10px;">🚫 Blocked</div>
                    </div>
                    <div style="background:#2e7d32;padding:8px;border-radius:6px;">
                        <div style="font-size:22px;font-weight:bold;">${stats.allowed}</div>
                        <div style="font-size:10px;">✓ Allowed</div>
                    </div>
                    <div style="background:#e65100;padding:8px;border-radius:6px;">
                        <div style="font-size:22px;font-weight:bold;">${stats.asked}</div>
                        <div style="font-size:10px;">❓ Asked</div>
                    </div>
                </div>
                ${Object.keys(stats.byType).length ? `
                    <div style="margin-top:8px;font-size:10px;color:#aaa;">
                        ${Object.entries(stats.byType).map(([t, s]) =>
                            `<div>${t}: <span style="color:#f44336">${s.blocked}🚫</span>
                             <span style="color:#4CAF50">${s.allowed}✓</span></div>`
                        ).join('')}
                    </div>` : ''}
            </div>

            <!-- Mode -->
            <div style="background:#1e1e1e;padding:12px;border-radius:8px;">
                <div style="font-weight:bold;margin-bottom:8px;">⚙️ Mode: <code>${host}</code></div>
                <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;">
                    ${[['ask','#FF9800','❓ Ask'],['block','#f44336','🚫 Block All'],['allow','#4CAF50','✓ Allow All']]
                        .map(([m, c, l]) => `
                        <button class="__gp2_mode__" data-mode="${m}"
                            style="background:${siteCfg().mode===m ? c : '#333'};color:#fff;
                                   border:${siteCfg().mode===m ? '2px solid #fff' : '2px solid transparent'};
                                   padding:10px;border-radius:6px;font-weight:bold;cursor:pointer;">
                            ${l}
                        </button>`).join('')}
                </div>
            </div>

            <!-- Whitelist -->
            <div style="background:#1e1e1e;padding:12px;border-radius:8px;">
                <div style="color:#4CAF50;font-weight:bold;margin-bottom:8px;">
                    ⭐ Site Whitelist (${wlList.length})
                </div>
                ${renderList(wlList, '__gp2_del_wl__', '#1B5E20', 'Empty')}
            </div>

            <!-- Blacklist -->
            <div style="background:#1e1e1e;padding:12px;border-radius:8px;">
                <div style="color:#f44336;font-weight:bold;margin-bottom:8px;">
                    🚫 Site Blacklist (${blList.length})
                </div>
                ${renderList(blList, '__gp2_del_bl__', '#B71C1C', 'Empty')}
                
                <!-- Manual add -->
                <div style="display:flex;gap:6px;margin-top:8px;">
                    <input id="__gp2_bl_input__" placeholder="domain.com"
                        style="flex:1;background:#111;border:1px solid #444;color:#fff;
                               padding:6px 10px;border-radius:6px;font-size:12px;"/>
                    <button id="__gp2_bl_add__"
                        style="background:#f44336;color:#fff;border:0;padding:6px 12px;
                               border-radius:6px;cursor:pointer;font-weight:bold;">+ Add</button>
                </div>
            </div>

            <!-- Global Blacklist -->
            <div style="background:#1e1e1e;padding:12px;border-radius:8px;">
                <div style="color:#ff5252;font-weight:bold;margin-bottom:8px;">
                    🌍 Global Blacklist (all sites) (${gblList.length})
                </div>
                ${renderList(gblList, '__gp2_del_gbl__', '#880000', 'Empty')}
            </div>

            <!-- Import / Export -->
            <div style="background:#1e1e1e;padding:12px;border-radius:8px;display:flex;flex-direction:column;gap:8px;">
                <div style="font-weight:bold;">💾 Backup / Restore</div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;">
                    <button id="__gp2_export__"
                        style="background:#1565C0;color:#fff;border:0;padding:10px;
                               border-radius:6px;cursor:pointer;font-weight:bold;">
                        📤 Export JSON
                    </button>
                    <button id="__gp2_import__"
                        style="background:#4527A0;color:#fff;border:0;padding:10px;
                               border-radius:6px;cursor:pointer;font-weight:bold;">
                        📥 Import JSON
                    </button>
                </div>
            </div>

            <!-- Danger zone -->
            <div style="background:#1e1e1e;padding:12px;border-radius:8px;display:flex;flex-direction:column;gap:6px;">
                <button id="__gp2_reset__"
                    style="background:#d32f2f;color:#fff;border:0;padding:12px;
                           border-radius:6px;font-weight:bold;cursor:pointer;">
                    🗑️ Reset config cho ${host}
                </button>
                <button id="__gp2_reset_all__"
                    style="background:#b71c1c;color:#fff;border:0;padding:10px;
                           border-radius:6px;font-weight:bold;cursor:pointer;font-size:11px;">
                    💣 Reset TẤT CẢ (kể cả global BL)
                </button>
            </div>
        </div>`;

        document.body.appendChild(panel);

        // --- Events ---
        panel.querySelector('#__gp2_cls__').onclick = () => panel.remove();

        // Mode buttons
        panel.querySelectorAll('.__gp2_mode__').forEach(b => {
            b.onclick = function () {
                cfg[host].mode = this.dataset.mode;
                saveConfig();
                panel.remove();
                showSettings();
                showToast('Mode: ' + this.dataset.mode, '#2196F3');
            };
        });

        // Delete whitelist item
        panel.querySelectorAll('.__gp2_del_wl__').forEach(b => {
            b.onclick = function () {
                removeFromWhitelist(this.dataset.d);
                panel.remove(); showSettings();
            };
        });

        // Delete blacklist item
        panel.querySelectorAll('.__gp2_del_bl__').forEach(b => {
            b.onclick = function () {
                removeFromBlacklist(this.dataset.d);
                panel.remove(); showSettings();
            };
        });

        // Delete global BL item
        panel.querySelectorAll('.__gp2_del_gbl__').forEach(b => {
            b.onclick = function () {
                removeFromBlacklist(this.dataset.d, { global: true });
                panel.remove(); showSettings();
            };
        });

        // Manual add to blacklist
        panel.querySelector('#__gp2_bl_add__').onclick = function () {
            const input = panel.querySelector('#__gp2_bl_input__');
            const d = input.value.trim().replace(/^www\./, '').replace(/https?:\/\//i, '');
            if (d) {
                addToBlacklist(d);
                showToast('🚫 Blacklisted: ' + d, '#B71C1C');
                panel.remove(); showSettings();
            }
        };

        // Export
        panel.querySelector('#__gp2_export__').onclick = function () {
            const json = Storage.export();
            const blob = new Blob([json], { type: 'application/json' });
            const a = Object.assign(document.createElement('a'), {
                href: URL.createObjectURL(blob),
                download: `guard-pro-backup-${Date.now()}.json`
            });
            a.click();
            showToast('📤 Exported!', '#1565C0');
        };

        // Import
        panel.querySelector('#__gp2_import__').onclick = function () {
            const input = Object.assign(document.createElement('input'), { type: 'file', accept: '.json' });
            input.onchange = function () {
                const reader = new FileReader();
                reader.onload = e => {
                    try {
                        Storage.import(e.target.result);
                        cfg = Storage.get();
                        if (!cfg[host]) cfg[host] = DEFAULT_SITE_CFG();
                        globalBL = new Set(Storage.getGlobalBL());
                        panel.remove(); showSettings();
                        showToast('📥 Imported!', '#4527A0');
                    } catch {
                        showToast('❌ Invalid JSON', '#f44336');
                    }
                };
                reader.readAsText(this.files[0]);
            };
            input.click();
        };

        // Reset site
        panel.querySelector('#__gp2_reset__').onclick = function () {
            if (confirm('Reset config cho ' + host + '?')) {
                delete cfg[host];
                saveConfig();
                cfg[host] = DEFAULT_SITE_CFG();
                panel.remove(); showSettings();
                showToast('✓ Reset ' + host, '#4CAF50');
            }
        };

        // Reset all
        panel.querySelector('#__gp2_reset_all__').onclick = function () {
            if (confirm('⚠️ XÓA TOÀN BỘ config + global blacklist?')) {
                Storage.save({});
                Storage.saveGlobalBL([]);
                cfg = {};
                cfg[host] = DEFAULT_SITE_CFG();
                globalBL = new Set();
                panel.remove(); showSettings();
                showToast('💣 Reset all!', '#b71c1c');
            }
        };
    }

    // ═══════════════════════════════════════
    //  INIT NOTIFICATION
    // ═══════════════════════════════════════
    function showInitNotif() {
        const t = document.createElement('div');
        t.innerHTML = `
            🛡️ <b>Guard PRO v${VERSION} ACTIVE</b><br>
            <small>13 layers · ${host} · BL: ${siteCfg().blacklist.length + globalBL.size}</small>
        `;
        t.style.cssText = `
            position:fixed;top:60px;left:50%;transform:translateX(-50%);
            background:linear-gradient(135deg,#1B5E20,#2E7D32);
            color:#fff;padding:10px 20px;border-radius:10px;
            z-index:2147483648;font:bold 12px Arial;text-align:center;
            box-shadow:0 5px 20px rgba(0,0,0,.6);pointer-events:none;
        `;
        document.body?.appendChild(t);
        orig.setTimeout(() => t.remove(), 2500);
    }

    if (document.body) showInitNotif();
    else document.addEventListener('DOMContentLoaded', () => {
        showInitNotif();
        if (!document.body.contains(badge)) document.body.appendChild(badge);
    });

    // Expose API
    window.__gp2__ = { showSettings, stats, cfg, Storage };

    console.log(`🛡️ Guard PRO v${VERSION} active · ${host} · BL: ${siteCfg().blacklist.length}`);
})();