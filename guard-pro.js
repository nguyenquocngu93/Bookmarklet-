/**
 * Redirect Guard PRO
 * Chặn EVERY popup + redirect với nhiều kỹ thuật bypass
 * Cần chạy CÀNG SỚM CÀNG TỐT (ngay khi vào trang)
 */
(function() {
    'use strict';
    
    if (window.__guard_pro_active__) {
        alert('✅ Guard PRO đã active. Reload để restart.');
        return;
    }
    window.__guard_pro_active__ = true;
    
    var STORAGE_KEY = 'guard_pro_config';
    var host = location.hostname.replace(/^www\./, '');
    
    // ========== CONFIG ==========
    function getConfig() {
        try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; }
        catch(e) { return {}; }
    }
    
    function saveConfig(cfg) {
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg)); }
        catch(e) {}
    }
    
    var config = getConfig();
    config[host] = config[host] || {
        whitelist: [],
        blacklist: [],
        mode: 'ask' // 'ask', 'block', 'allow'
    };
    
    var sessionWhitelist = new Set();
    var sessionBlacklist = new Set();
    
    // Stats
    var stats = { blocked: 0, allowed: 0, asked: 0, byType: {} };
    
    // ========== HELPERS ==========
    function extractDomain(url) {
        try {
            var u = new URL(url, location.href);
            return u.hostname.replace(/^www\./, '');
        } catch(e) {
            return url;
        }
    }
    
    function isSameDomain(url) {
        var d = extractDomain(url);
        return d === host || d.endsWith('.' + host);
    }
    
    function isWhitelisted(url) {
        var d = extractDomain(url);
        return sessionWhitelist.has(d) || config[host].whitelist.indexOf(d) !== -1;
    }
    
    function isBlacklisted(url) {
        var d = extractDomain(url);
        return sessionBlacklist.has(d) || config[host].blacklist.indexOf(d) !== -1;
    }
    
    function recordStat(type, action) {
        if (!stats.byType[type]) stats.byType[type] = { blocked: 0, allowed: 0 };
        stats.byType[type][action]++;
        stats[action]++;
        updateBadge();
    }
    
    // ========== INTERCEPT LAYER 1: window.open ==========
    var originalOpen = window.open;
    
    // Redefine với writable = false để không bị override
    try {
        Object.defineProperty(window, 'open', {
            value: function(url, target, features) {
                var absoluteUrl = url ? new URL(url, location.href).href : '';
                return handleAction({
                    type: 'window.open',
                    url: absoluteUrl,
                    trigger: 'window.open()',
                    features: features || target || '',
                    execute: function() { return originalOpen.call(window, url, target, features); }
                });
            },
            writable: false,
            configurable: false
        });
    } catch(e) {
        window.open = function(url, target, features) {
            var absoluteUrl = url ? new URL(url, location.href).href : '';
            return handleAction({
                type: 'window.open',
                url: absoluteUrl,
                trigger: 'window.open()',
                features: features || target || '',
                execute: function() { return originalOpen.call(window, url, target, features); }
            });
        };
    }
    
    // ========== INTERCEPT LAYER 2: location methods ==========
    var originalAssign = location.assign.bind(location);
    var originalReplace = location.replace.bind(location);
    var originalReload = location.reload.bind(location);
    
    try {
        location.assign = function(url) {
            var absoluteUrl = new URL(url, location.href).href;
            handleAction({
                type: 'location.assign',
                url: absoluteUrl,
                trigger: 'location.assign()',
                execute: function() { originalAssign(url); }
            });
        };
        
        location.replace = function(url) {
            var absoluteUrl = new URL(url, location.href).href;
            handleAction({
                type: 'location.replace',
                url: absoluteUrl,
                trigger: 'location.replace()',
                execute: function() { originalReplace(url); }
            });
        };
    } catch(e) {
        console.warn('Cannot override location methods:', e);
    }
    
    // ========== INTERCEPT LAYER 3: location.href setter ==========
    // Trick: watch location changes via history events
    var originalPushState = history.pushState.bind(history);
    var originalReplaceState = history.replaceState.bind(history);
    
    history.pushState = function(state, title, url) {
        if (url) {
            var absoluteUrl = new URL(url, location.href).href;
            if (!isSameDomain(absoluteUrl)) {
                handleAction({
                    type: 'history.pushState',
                    url: absoluteUrl,
                    trigger: 'history.pushState()',
                    execute: function() { originalPushState(state, title, url); }
                });
                return;
            }
        }
        return originalPushState(state, title, url);
    };
    
    history.replaceState = function(state, title, url) {
        if (url) {
            var absoluteUrl = new URL(url, location.href).href;
            if (!isSameDomain(absoluteUrl)) {
                handleAction({
                    type: 'history.replaceState',
                    url: absoluteUrl,
                    trigger: 'history.replaceState()',
                    execute: function() { originalReplaceState(state, title, url); }
                });
                return;
            }
        }
        return originalReplaceState(state, title, url);
    };
    
    // ========== INTERCEPT LAYER 4: Meta refresh ==========
    // Remove existing meta refresh
    document.querySelectorAll('meta[http-equiv="refresh" i]').forEach(function(m) {
        m.remove();
    });
    
    // Watch for new meta refresh
    var metaObserver = new MutationObserver(function(mutations) {
        mutations.forEach(function(m) {
            m.addedNodes.forEach(function(node) {
                if (node.nodeType === 1 && node.tagName === 'META' && 
                    (node.getAttribute('http-equiv') || '').toLowerCase() === 'refresh') {
                    var content = node.getAttribute('content') || '';
                    var match = content.match(/^\s*(\d+)\s*;\s*url\s*=\s*(.+)$/i);
                    if (match) {
                        var url = match[2].trim().replace(/^['"]|['"]$/g, '');
                        var absoluteUrl = new URL(url, location.href).href;
                        node.remove();
                        handleAction({
                            type: 'meta-refresh',
                            url: absoluteUrl,
                            trigger: 'meta refresh (' + match[1] + 's)',
                            execute: function() { location.href = url; }
                        });
                    }
                }
            });
        });
    });
    metaObserver.observe(document.documentElement, { childList: true, subtree: true });
    
    // ========== INTERCEPT LAYER 5: Base tag hijack ==========
    // Remove existing base tag with suspicious target
    document.querySelectorAll('base').forEach(function(b) {
        if (b.target === '_blank' || (b.href && !isSameDomain(b.href))) {
            console.log('🚫 Removed suspicious base tag:', b.href, b.target);
            b.remove();
        }
    });
    
    // Prevent adding new base tags
    var baseObserver = new MutationObserver(function(mutations) {
        mutations.forEach(function(m) {
            m.addedNodes.forEach(function(node) {
                if (node.nodeType === 1 && node.tagName === 'BASE') {
                    console.log('🚫 Blocked base tag injection');
                    node.remove();
                    recordStat('base-tag', 'blocked');
                }
            });
        });
    });
    baseObserver.observe(document.head || document.documentElement, { childList: true, subtree: true });
    
    // ========== INTERCEPT LAYER 6: Element.click() ==========
    // Chặn programmatic click trên links external
    var originalClick = HTMLElement.prototype.click;
    HTMLElement.prototype.click = function() {
        if (this.tagName === 'A' && this.href) {
            var absoluteUrl = this.href;
            if (!absoluteUrl.startsWith('#') && !absoluteUrl.startsWith('javascript:') && 
                !absoluteUrl.startsWith('mailto:') && !absoluteUrl.startsWith('tel:')) {
                var isExternal = !isSameDomain(absoluteUrl);
                var opensNewTab = this.target === '_blank';
                
                if (isExternal || opensNewTab) {
                    var self = this;
                    handleAction({
                        type: 'element.click',
                        url: absoluteUrl,
                        trigger: 'programmatic link click',
                        features: this.target || '',
                        execute: function() { originalClick.call(self); }
                    });
                    return;
                }
            }
        }
        return originalClick.call(this);
    };
    
    // ========== INTERCEPT LAYER 7: Form submit ==========
    var originalFormSubmit = HTMLFormElement.prototype.submit;
    HTMLFormElement.prototype.submit = function() {
        var form = this;
        var url = form.action || location.href;
        var absoluteUrl = new URL(url, location.href).href;
        
        if (!isSameDomain(absoluteUrl)) {
            handleAction({
                type: 'form.submit',
                url: absoluteUrl,
                trigger: 'form.submit() → external',
                execute: function() { originalFormSubmit.call(form); }
            });
            return;
        }
        return originalFormSubmit.call(form);
    };
    
    // ========== INTERCEPT LAYER 8: Click event (CAPTURE) ==========
    // Chạy TRƯỚC tất cả các listener khác của trang
    var clickHandler = function(e) {
        // Không chặn nếu chính là UI của guard
        if (e.target.closest('#__gp_dialog__') || e.target.closest('#__gp_badge__')) return;
        
        // 1. Link clicks
        var link = e.target.closest('a');
        if (link && link.href) {
            var href = link.href;
            if (href.startsWith('#') || href.startsWith('javascript:') || href.startsWith('mailto:') || href.startsWith('tel:')) return;
            
            var isExternal = !isSameDomain(href);
            var opensNewTab = link.target === '_blank';
            
            if (isExternal || opensNewTab) {
                if (isWhitelisted(href)) {
                    recordStat('link', 'allowed');
                    return;
                }
                if (isBlacklisted(href) || config[host].mode === 'block') {
                    e.preventDefault();
                    e.stopPropagation();
                    e.stopImmediatePropagation();
                    recordStat('link', 'blocked');
                    showToast('🚫 Blocked link: ' + extractDomain(href), '#f44336');
                    return false;
                }
                
                // Ask user
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                handleAction({
                    type: 'link-click',
                    url: href,
                    trigger: 'link click (target=' + (link.target || 'self') + ')',
                    execute: function() {
                        if (opensNewTab) originalOpen.call(window, href, '_blank');
                        else originalAssign(href);
                    }
                });
                return false;
            }
        }
        
        // 2. Suspicious clicks (không có link, có thể là JS handler)
        // Detect overlay/invisible elements phủ lên
        var target = e.target;
        var style = window.getComputedStyle(target);
        
        // Check overlay ẩn có onclick
        if (target.onclick || target.getAttribute('onclick')) {
            var attr = target.getAttribute('onclick') || '';
            if (/window\.open|location\.|\.click\(\)/.test(attr)) {
                console.log('🚫 Blocked onclick handler:', attr.substring(0, 100));
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                recordStat('onclick-handler', 'blocked');
                showToast('🚫 Blocked onclick redirect', '#f44336');
                return false;
            }
        }
    };
    
    // Attach ở capture phase với PRIORITY cao nhất
    document.addEventListener('click', clickHandler, true);
    document.addEventListener('mousedown', clickHandler, true);
    document.addEventListener('touchstart', clickHandler, true);
    document.addEventListener('touchend', clickHandler, true);
    document.addEventListener('auxclick', clickHandler, true); // Middle click
    
    // ========== INTERCEPT LAYER 9: Dynamic script injection ==========
    // Watch for suspicious scripts được inject sau
    var scriptObserver = new MutationObserver(function(mutations) {
        mutations.forEach(function(m) {
            m.addedNodes.forEach(function(node) {
                if (node.nodeType !== 1) return;
                
                // Iframes chèn (thường là ads)
                if (node.tagName === 'IFRAME') {
                    var src = node.src || '';
                    if (src && !isSameDomain(src) && !isWhitelisted(src)) {
                        console.log('🚫 Removed suspicious iframe:', src);
                        node.remove();
                        recordStat('iframe-inject', 'blocked');
                    }
                }
                
                // Fixed position elements lớn (overlay clickjack)
                if (node.tagName === 'DIV' || node.tagName === 'A') {
                    setTimeout(function() {
                        if (!node.parentNode) return;
                        var s = window.getComputedStyle(node);
                        var r = node.getBoundingClientRect();
                        if ((s.position === 'fixed' || s.position === 'absolute') && 
                            parseInt(s.zIndex) > 9999 &&
                            r.width > 200 && r.height > 200 &&
                            parseFloat(s.opacity) < 0.5) {
                            console.log('🚫 Removed clickjack overlay:', node.tagName);
                            node.remove();
                            recordStat('clickjack', 'blocked');
                        }
                    }, 100);
                }
            });
        });
    });
    scriptObserver.observe(document.documentElement, { childList: true, subtree: true });
    
    // ========== INTERCEPT LAYER 10: onbeforeunload ==========
    // Nhiều site dùng để mở popup khi user rời
    try {
        Object.defineProperty(window, 'onbeforeunload', {
            set: function(v) {
                console.log('🚫 Blocked onbeforeunload attempt');
                recordStat('onbeforeunload', 'blocked');
            },
            get: function() { return null; }
        });
    } catch(e) {}
    
    window.addEventListener('beforeunload', function(e) {
        e.stopImmediatePropagation();
        return null;
    }, true);
    
    // ========== INTERCEPT LAYER 11: setTimeout redirect ==========
    var originalSetTimeout = window.setTimeout;
    window.setTimeout = function(fn, delay) {
        if (typeof fn === 'function') {
            var wrappedFn = function() {
                try {
                    // Check if function contains suspicious code
                    var fnStr = fn.toString();
                    if (/window\.open|location\.href|location\.assign|location\.replace/.test(fnStr) && 
                        /https?:\/\//.test(fnStr) && 
                        !fnStr.includes(location.hostname)) {
                        console.log('⚠️ Suspicious setTimeout function:', fnStr.substring(0, 100));
                        // Không block hoàn toàn vì có thể là legitimate
                    }
                    return fn.apply(this, arguments);
                } catch(e) { throw e; }
            };
            return originalSetTimeout(wrappedFn, delay);
        }
        return originalSetTimeout.apply(this, arguments);
    };
    
    // ========== INTERCEPT LAYER 12: iframe top navigation ==========
    // Nếu là iframe, chặn parent redirect
    if (window !== window.top) {
        try {
            Object.defineProperty(window.top, 'location', {
                get: function() { return window.top.location; },
                set: function(v) {
                    console.log('🚫 Blocked top.location set:', v);
                    recordStat('top-nav', 'blocked');
                }
            });
        } catch(e) {}
    }
    
    // ========== INTERCEPT LAYER 13: Event listener wrapper ==========
    // Chặn listeners popup phổ biến
    var originalAddEventListener = EventTarget.prototype.addEventListener;
    EventTarget.prototype.addEventListener = function(type, listener, options) {
        if (type === 'click' || type === 'mousedown' || type === 'touchstart') {
            // Wrap listener để check suspicious behavior
            var wrapped = function(e) {
                try {
                    var result = listener.call(this, e);
                    return result;
                } catch(err) {
                    console.log('Error in listener:', err);
                    return undefined;
                }
            };
            // Không wrap listeners của guard chính mình
            if (listener === clickHandler || (listener && listener.name === 'clickHandler')) {
                return originalAddEventListener.call(this, type, listener, options);
            }
            return originalAddEventListener.call(this, type, wrapped, options);
        }
        return originalAddEventListener.call(this, type, listener, options);
    };
    
    // ========== ACTION HANDLER ==========
    var pendingActions = [];
    var currentDialog = null;
    
    function handleAction(action) {
        // Check auto rules
        if (isWhitelisted(action.url)) {
            recordStat(action.type, 'allowed');
            console.log('✓ Auto allow:', action.url);
            return action.execute();
        }
        
        if (isBlacklisted(action.url) || config[host].mode === 'block') {
            recordStat(action.type, 'blocked');
            console.log('🚫 Auto block:', action.url);
            showToast('🚫 Blocked: ' + extractDomain(action.url), '#f44336');
            return null;
        }
        
        if (config[host].mode === 'allow') {
            recordStat(action.type, 'allowed');
            return action.execute();
        }
        
        // Ask
        stats.asked++;
        updateBadge();
        pendingActions.push(action);
        if (!currentDialog) processNextAction();
        return null;
    }
    
    function processNextAction() {
        if (pendingActions.length === 0) {
            currentDialog = null;
            return;
        }
        
        var action = pendingActions.shift();
        var domain = extractDomain(action.url);
        var isExternal = !isSameDomain(action.url);
        
        var overlay = document.createElement('div');
        overlay.id = '__gp_dialog__';
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.9);z-index:2147483647;display:flex;align-items:center;justify-content:center;padding:15px;font-family:-apple-system,Arial,sans-serif;';
        
        var typeIcons = {
            'window.open': '🪟',
            'location.assign': '🔀',
            'location.replace': '🔀',
            'history.pushState': '📌',
            'meta-refresh': '⏱️',
            'link-click': '🔗',
            'element.click': '🖱️',
            'form.submit': '📤'
        };
        var icon = typeIcons[action.type] || '⚠️';
        
        var html = '<div style="background:linear-gradient(135deg,#1a1a1a,#2a2a2a);border:2px solid ' + (isExternal ? '#f44336' : '#FF9800') + ';border-radius:15px;padding:20px;max-width:500px;width:100%;color:#fff;box-shadow:0 20px 60px rgba(0,0,0,0.9);">';
        
        html += '<div style="text-align:center;margin-bottom:12px;">';
        html += '<div style="font-size:40px;margin-bottom:5px;">' + icon + '</div>';
        html += '<h2 style="margin:0;color:' + (isExternal ? '#f44336' : '#FF9800') + ';font-size:16px;">' + action.type + '?</h2>';
        if (isExternal) {
            html += '<div style="color:#f44336;font-size:11px;margin-top:5px;font-weight:bold;">⚠️ EXTERNAL DOMAIN</div>';
        }
        html += '</div>';
        
        html += '<div style="background:#0a0a0a;padding:10px;border-radius:8px;margin-bottom:12px;font-size:11px;">';
        html += '<div style="color:#888;margin-bottom:3px;">TO:</div>';
        html += '<div style="color:#fff;font-family:monospace;word-break:break-all;font-weight:bold;">' + action.url + '</div>';
        html += '<div style="color:' + (isExternal ? '#f44336' : '#4CAF50') + ';margin-top:5px;">🌐 ' + domain + '</div>';
        html += '</div>';
        
        if (action.trigger) {
            html += '<div style="background:#0a0a0a;padding:6px;border-radius:4px;margin-bottom:10px;font-size:10px;color:#666;">🔍 ' + action.trigger + '</div>';
        }
        
        if (pendingActions.length > 0) {
            html += '<div style="background:#c62828;color:#fff;padding:5px;border-radius:5px;text-align:center;font-size:11px;margin-bottom:10px;">⏳ Còn ' + pendingActions.length + ' pending</div>';
        }
        
        html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;">';
        html += '<button id="__gp_allow__" style="background:#4CAF50;color:#fff;border:0;padding:12px;border-radius:6px;font-weight:bold;">✓ Allow 1 lần</button>';
        html += '<button id="__gp_block__" style="background:#f44336;color:#fff;border:0;padding:12px;border-radius:6px;font-weight:bold;">✕ Block 1 lần</button>';
        html += '</div>';
        html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:6px;">';
        html += '<button id="__gp_allow_s__" style="background:#2196F3;color:#fff;border:0;padding:10px;border-radius:6px;font-weight:bold;font-size:11px;">✓✓ Allow session</button>';
        html += '<button id="__gp_block_s__" style="background:#c62828;color:#fff;border:0;padding:10px;border-radius:6px;font-weight:bold;font-size:11px;">✕✕ Block session</button>';
        html += '</div>';
        html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:6px;">';
        html += '<button id="__gp_allow_p__" style="background:#1B5E20;color:#fff;border:0;padding:10px;border-radius:6px;font-weight:bold;font-size:11px;">⭐ Allow mãi</button>';
        html += '<button id="__gp_block_p__" style="background:#B71C1C;color:#fff;border:0;padding:10px;border-radius:6px;font-weight:bold;font-size:11px;">🚫 Block mãi</button>';
        html += '</div>';
        html += '<div style="margin-top:10px;text-align:center;font-size:10px;">';
        html += '<a id="__gp_copy__" style="color:#666;cursor:pointer;text-decoration:underline;">📋 Copy URL</a>';
        html += '</div>';
        
        html += '</div>';
        overlay.innerHTML = html;
        document.body.appendChild(overlay);
        currentDialog = overlay;
        
        function close() {
            overlay.remove();
            currentDialog = null;
            setTimeout(processNextAction, 100);
        }
        
        document.getElementById('__gp_allow__').onclick = function() {
            recordStat(action.type, 'allowed');
            close();
            action.execute();
        };
        document.getElementById('__gp_block__').onclick = function() {
            recordStat(action.type, 'blocked');
            showToast('🚫 Blocked', '#f44336');
            close();
        };
        document.getElementById('__gp_allow_s__').onclick = function() {
            sessionWhitelist.add(domain);
            recordStat(action.type, 'allowed');
            showToast('✓✓ Session allow: ' + domain, '#2196F3');
            close();
            action.execute();
        };
        document.getElementById('__gp_block_s__').onclick = function() {
            sessionBlacklist.add(domain);
            recordStat(action.type, 'blocked');
            showToast('✕✕ Session block: ' + domain, '#c62828');
            close();
        };
        document.getElementById('__gp_allow_p__').onclick = function() {
            if (config[host].whitelist.indexOf(domain) === -1) {
                config[host].whitelist.push(domain);
                saveConfig(config);
            }
            recordStat(action.type, 'allowed');
            showToast('⭐ Whitelisted: ' + domain, '#4CAF50');
            close();
            action.execute();
        };
        document.getElementById('__gp_block_p__').onclick = function() {
            if (config[host].blacklist.indexOf(domain) === -1) {
                config[host].blacklist.push(domain);
                saveConfig(config);
            }
            recordStat(action.type, 'blocked');
            showToast('🚫 Blacklisted: ' + domain, '#B71C1C');
            close();
        };
        document.getElementById('__gp_copy__').onclick = function() {
            var t = document.createElement('textarea');
            t.value = action.url;
            document.body.appendChild(t);
            t.select();
            document.execCommand('copy');
            t.remove();
            this.innerText = '✓ Copied';
        };
    }
    
    // ========== BADGE ==========
    var badge = document.createElement('div');
    badge.id = '__gp_badge__';
    badge.style.cssText = 'position:fixed;top:10px;right:10px;background:linear-gradient(135deg,#4CAF50,#2E7D32);color:#fff;padding:8px 12px;border-radius:20px;z-index:2147483646;font:bold 11px Arial;box-shadow:0 3px 10px rgba(0,0,0,0.5);cursor:pointer;user-select:none;';
    badge.title = 'Guard PRO - Bấm để settings';
    
    function updateBadge() {
        var color = stats.blocked > 0 ? 'linear-gradient(135deg,#f44336,#c62828)' : 'linear-gradient(135deg,#4CAF50,#2E7D32)';
        badge.style.background = color;
        badge.innerHTML = '🛡️ PRO · ' + stats.blocked + '🚫';
    }
    updateBadge();
    
    badge.onclick = showSettings;
    document.body.appendChild(badge);
    
    function showToast(msg, color) {
        var t = document.createElement('div');
        t.innerHTML = msg;
        t.style.cssText = 'position:fixed;top:50px;right:10px;background:' + (color || '#333') + ';color:#fff;padding:8px 15px;border-radius:15px;z-index:2147483648;font:bold 11px Arial;box-shadow:0 3px 10px rgba(0,0,0,0.5);';
        document.body.appendChild(t);
        setTimeout(function() { t.remove(); }, 2000);
    }
    
    // ========== SETTINGS ==========
    function showSettings() {
        var overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.95);z-index:2147483649;padding:15px;overflow-y:auto;display:flex;flex-direction:column;gap:10px;';
        
        var html = '<div style="color:#4CAF50;font:bold 16px Arial;">🛡️ Guard PRO Settings</div>';
        
        // Stats detailed
        html += '<div style="background:#252525;padding:12px;border-radius:8px;">';
        html += '<div style="color:#fff;font-weight:bold;margin-bottom:8px;">📊 Stats</div>';
        html += '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:5px;text-align:center;margin-bottom:10px;">';
        html += '<div style="background:#f44336;padding:8px;border-radius:5px;"><b style="font-size:18px;">' + stats.blocked + '</b><br><small>🚫</small></div>';
        html += '<div style="background:#4CAF50;padding:8px;border-radius:5px;"><b style="font-size:18px;">' + stats.allowed + '</b><br><small>✓</small></div>';
        html += '<div style="background:#FF9800;padding:8px;border-radius:5px;"><b style="font-size:18px;">' + stats.asked + '</b><br><small>❓</small></div>';
        html += '</div>';
        
        // By type
        if (Object.keys(stats.byType).length > 0) {
            html += '<div style="color:#aaa;font-size:11px;">By type:</div>';
            Object.keys(stats.byType).forEach(function(t) {
                var s = stats.byType[t];
                html += '<div style="font-size:11px;color:#ccc;margin:3px 0;">🔍 ' + t + ': <span style="color:#f44336;">' + s.blocked + '🚫</span> · <span style="color:#4CAF50;">' + s.allowed + '✓</span></div>';
            });
        }
        html += '</div>';
        
        // Mode
        html += '<div style="background:#252525;padding:12px;border-radius:8px;">';
        html += '<div style="color:#fff;font-weight:bold;margin-bottom:8px;">⚙️ Mode: ' + host + '</div>';
        html += '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:5px;">';
        ['ask', 'block', 'allow'].forEach(function(m) {
            var active = config[host].mode === m;
            var colors = { 'ask': '#FF9800', 'block': '#f44336', 'allow': '#4CAF50' };
            var labels = { 'ask': '❓ Ask', 'block': '🚫 Block All', 'allow': '✓ Allow All' };
            html += '<button class="__gp_mode__" data-mode="' + m + '" style="background:' + (active ? colors[m] : '#333') + ';color:#fff;border:0;padding:10px;border-radius:5px;font-weight:bold;font-size:12px;">' + labels[m] + '</button>';
        });
        html += '</div></div>';
        
        // Whitelist
        html += '<div style="background:#252525;padding:12px;border-radius:8px;">';
        html += '<div style="color:#4CAF50;font-weight:bold;margin-bottom:8px;">⭐ Whitelist (' + config[host].whitelist.length + ')</div>';
        if (config[host].whitelist.length === 0) {
            html += '<div style="color:#666;font-size:11px;">Empty</div>';
        } else {
            config[host].whitelist.forEach(function(d) {
                html += '<div style="background:#1B5E20;padding:6px 10px;margin:3px 0;border-radius:4px;font-size:11px;display:flex;justify-content:space-between;"><span style="font-family:monospace;">' + d + '</span><button class="__gp_del_wl__" data-d="' + d + '" style="background:#c62828;color:#fff;border:0;padding:2px 8px;border-radius:3px;">✕</button></div>';
            });
        }
        html += '</div>';
        
        // Blacklist
        html += '<div style="background:#252525;padding:12px;border-radius:8px;">';
        html += '<div style="color:#f44336;font-weight:bold;margin-bottom:8px;">🚫 Blacklist (' + config[host].blacklist.length + ')</div>';
        if (config[host].blacklist.length === 0) {
            html += '<div style="color:#666;font-size:11px;">Empty</div>';
        } else {
            config[host].blacklist.forEach(function(d) {
                html += '<div style="background:#B71C1C;padding:6px 10px;margin:3px 0;border-radius:4px;font-size:11px;display:flex;justify-content:space-between;"><span style="font-family:monospace;">' + d + '</span><button class="__gp_del_bl__" data-d="' + d + '" style="background:#333;color:#fff;border:0;padding:2px 8px;border-radius:3px;">✕</button></div>';
            });
        }
        html += '</div>';
        
        // Actions
        html += '<div style="background:#252525;padding:12px;border-radius:8px;display:flex;flex-direction:column;gap:5px;">';
        html += '<button id="__gp_reset__" style="background:#f44336;color:#fff;border:0;padding:12px;border-radius:6px;font-weight:bold;">🗑️ Reset ' + host + '</button>';
        html += '<button id="__gp_close__" style="background:#666;color:#fff;border:0;padding:12px;border-radius:6px;font-weight:bold;">✕ Close</button>';
        html += '</div>';
        
        overlay.innerHTML = html;
        document.body.appendChild(overlay);
        
        overlay.querySelectorAll('.__gp_mode__').forEach(function(b) {
            b.onclick = function() {
                config[host].mode = this.dataset.mode;
                saveConfig(config);
                overlay.remove();
                showSettings();
                showToast('Mode: ' + this.dataset.mode, '#2196F3');
            };
        });
        
        overlay.querySelectorAll('.__gp_del_wl__').forEach(function(b) {
            b.onclick = function() {
                var d = this.dataset.d;
                config[host].whitelist = config[host].whitelist.filter(function(x) { return x !== d; });
                saveConfig(config);
                overlay.remove(); showSettings();
            };
        });
        
        overlay.querySelectorAll('.__gp_del_bl__').forEach(function(b) {
            b.onclick = function() {
                var d = this.dataset.d;
                config[host].blacklist = config[host].blacklist.filter(function(x) { return x !== d; });
                saveConfig(config);
                overlay.remove(); showSettings();
            };
        });
        
        document.getElementById('__gp_reset__').onclick = function() {
            if (confirm('Reset config cho ' + host + '?')) {
                delete config[host];
                saveConfig(config);
                overlay.remove();
                alert('✓ Reset. Reload trang.');
            }
        };
        
        document.getElementById('__gp_close__').onclick = function() { overlay.remove(); };
    }
    
    // ========== INIT NOTIFICATION ==========
    setTimeout(function() {
        var t = document.createElement('div');
        t.innerHTML = '🛡️ <b>Guard PRO ACTIVE</b><br><small style="opacity:0.9;">13 layers protection · ' + host + '</small>';
        t.style.cssText = 'position:fixed;top:60px;left:50%;transform:translateX(-50%);background:linear-gradient(135deg,#4CAF50,#2E7D32);color:#fff;padding:12px 20px;border-radius:10px;z-index:2147483648;font:bold 12px Arial;text-align:center;box-shadow:0 5px 20px rgba(0,0,0,0.6);';
        document.body.appendChild(t);
        setTimeout(function() { t.remove(); }, 2500);
    }, 100);
    
    console.log('🛡️ Guard PRO active for', host, '- 13 layers');
})();