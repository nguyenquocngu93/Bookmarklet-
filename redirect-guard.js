/**
 * Redirect Guard - Chặn tất cả popup + redirect, hỏi user trước khi thực hiện
 * Whitelist domain đã approved cho session hiện tại
 */
(function() {
    'use strict';
    
    if (window.__redirect_guard_active__) {
        alert('✅ Redirect Guard đã bật rồi!\n\nĐể tắt: Reload trang');
        return;
    }
    window.__redirect_guard_active__ = true;
    
    var STORAGE_KEY = 'redirect_guard_config';
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
        whitelist: [],      // Auto allow forever
        blacklist: [],      // Auto block forever
        autoMode: 'ask'     // 'ask', 'block', 'allow'
    };
    
    // Session-only whitelist (không lưu vào storage)
    var sessionWhitelist = new Set();
    var sessionBlacklist = new Set();
    
    // Stats
    var stats = {
        blocked: 0,
        allowed: 0,
        asked: 0
    };
    
    // ========== HELPER ==========
    function extractDomain(url) {
        try {
            return new URL(url, location.href).hostname.replace(/^www\./, '');
        } catch(e) {
            return url;
        }
    }
    
    function isSameDomain(url) {
        var d = extractDomain(url);
        return d === host || d.endsWith('.' + host);
    }
    
    function isWhitelisted(url) {
        var domain = extractDomain(url);
        if (sessionWhitelist.has(domain)) return true;
        if (config[host].whitelist.indexOf(domain) !== -1) return true;
        return false;
    }
    
    function isBlacklisted(url) {
        var domain = extractDomain(url);
        if (sessionBlacklist.has(domain)) return true;
        if (config[host].blacklist.indexOf(domain) !== -1) return true;
        return false;
    }
    
    // ========== CONFIRM DIALOG ==========
    var pendingActions = [];
    var currentDialog = null;
    
    function showConfirm(action) {
        pendingActions.push(action);
        if (currentDialog) return; // Đợi dialog hiện tại
        processNextAction();
    }
    
    function processNextAction() {
        if (pendingActions.length === 0) {
            currentDialog = null;
            return;
        }
        
        var action = pendingActions.shift();
        stats.asked++;
        updateBadge();
        
        var domain = extractDomain(action.url);
        var isExternal = !isSameDomain(action.url);
        
        var overlay = document.createElement('div');
        overlay.id = '__rg_dialog__';
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:2147483647;display:flex;align-items:center;justify-content:center;padding:15px;font-family:-apple-system,Arial,sans-serif;';
        
        var actionIcon = { 'redirect': '🔀', 'popup': '🪟', 'submit': '📤', 'form': '📝' };
        var actionLabel = { 'redirect': 'Chuyển hướng', 'popup': 'Mở tab/cửa sổ mới', 'submit': 'Submit form', 'form': 'Form action' };
        
        var html = '<div style="background:linear-gradient(135deg,#1a1a1a,#2a2a2a);border:2px solid ' + (isExternal ? '#f44336' : '#FF9800') + ';border-radius:15px;padding:20px;max-width:500px;width:100%;color:#fff;box-shadow:0 20px 60px rgba(0,0,0,0.8);">';
        
        // Header
        html += '<div style="text-align:center;margin-bottom:15px;">';
        html += '<div style="font-size:40px;margin-bottom:8px;">' + (actionIcon[action.type] || '⚠️') + '</div>';
        html += '<h2 style="margin:0;color:' + (isExternal ? '#f44336' : '#FF9800') + ';font-size:18px;">' + actionLabel[action.type] + '?</h2>';
        if (isExternal) {
            html += '<div style="color:#f44336;font-size:11px;margin-top:5px;font-weight:bold;">⚠️ TRANG NGOÀI - HÃY CẨN THẬN</div>';
        } else {
            html += '<div style="color:#4CAF50;font-size:11px;margin-top:5px;">✓ Cùng domain</div>';
        }
        html += '</div>';
        
        // URL info
        html += '<div style="background:#0a0a0a;padding:12px;border-radius:8px;margin-bottom:15px;">';
        html += '<div style="color:#888;font-size:10px;margin-bottom:4px;">FROM:</div>';
        html += '<div style="color:#aaa;font-size:11px;font-family:monospace;word-break:break-all;margin-bottom:8px;">' + location.href.substring(0, 100) + '</div>';
        html += '<div style="color:#888;font-size:10px;margin-bottom:4px;">TO:</div>';
        html += '<div style="color:#fff;font-size:12px;font-family:monospace;word-break:break-all;font-weight:bold;">' + action.url + '</div>';
        html += '<div style="color:' + (isExternal ? '#f44336' : '#4CAF50') + ';font-size:11px;margin-top:6px;">🌐 Domain: <b>' + domain + '</b></div>';
        html += '</div>';
        
        // Trigger info
        if (action.trigger) {
            html += '<div style="background:#0a0a0a;padding:8px;border-radius:6px;margin-bottom:15px;font-size:11px;color:#666;">';
            html += '🔍 Trigger: ' + action.trigger;
            if (action.features) html += ' · Features: ' + action.features;
            html += '</div>';
        }
        
        // Queue indicator
        if (pendingActions.length > 0) {
            html += '<div style="background:#c62828;color:#fff;padding:6px;border-radius:6px;text-align:center;font-size:11px;margin-bottom:10px;font-weight:bold;">';
            html += '⏳ Còn ' + pendingActions.length + ' actions chờ xử lý';
            html += '</div>';
        }
        
        // Action buttons
        html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">';
        html += '<button id="__rg_allow_once__" style="background:#4CAF50;color:#fff;border:0;padding:12px;border-radius:8px;font-weight:bold;font-size:13px;cursor:pointer;">✓ Cho phép<br><small style="font-weight:normal;opacity:0.8;">1 lần này</small></button>';
        html += '<button id="__rg_block_once__" style="background:#f44336;color:#fff;border:0;padding:12px;border-radius:8px;font-weight:bold;font-size:13px;cursor:pointer;">✕ Chặn<br><small style="font-weight:normal;opacity:0.8;">1 lần này</small></button>';
        html += '</div>';
        
        html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px;">';
        html += '<button id="__rg_allow_session__" style="background:#2196F3;color:#fff;border:0;padding:10px;border-radius:8px;font-weight:bold;font-size:12px;cursor:pointer;">✓✓ Allow session<br><small style="font-weight:normal;opacity:0.8;">' + domain + '</small></button>';
        html += '<button id="__rg_block_session__" style="background:#c62828;color:#fff;border:0;padding:10px;border-radius:8px;font-weight:bold;font-size:12px;cursor:pointer;">✕✕ Block session<br><small style="font-weight:normal;opacity:0.8;">' + domain + '</small></button>';
        html += '</div>';
        
        html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px;">';
        html += '<button id="__rg_allow_always__" style="background:#1B5E20;color:#fff;border:0;padding:10px;border-radius:8px;font-weight:bold;font-size:12px;cursor:pointer;">⭐ Allow mãi<br><small style="font-weight:normal;opacity:0.8;">whitelist forever</small></button>';
        html += '<button id="__rg_block_always__" style="background:#B71C1C;color:#fff;border:0;padding:10px;border-radius:8px;font-weight:bold;font-size:12px;cursor:pointer;">🚫 Block mãi<br><small style="font-weight:normal;opacity:0.8;">blacklist forever</small></button>';
        html += '</div>';
        
        html += '<div style="margin-top:12px;text-align:center;">';
        html += '<a id="__rg_copy_url__" style="color:#666;font-size:11px;cursor:pointer;text-decoration:underline;">📋 Copy URL</a>';
        html += '</div>';
        
        html += '</div>';
        overlay.innerHTML = html;
        document.body.appendChild(overlay);
        currentDialog = overlay;
        
        // ========== HANDLERS ==========
        function close() {
            overlay.remove();
            currentDialog = null;
            setTimeout(processNextAction, 100);
        }
        
        document.getElementById('__rg_allow_once__').onclick = function() {
            stats.allowed++;
            updateBadge();
            close();
            action.execute();
        };
        
        document.getElementById('__rg_block_once__').onclick = function() {
            stats.blocked++;
            updateBadge();
            showToast('🚫 Blocked: ' + domain, '#f44336');
            close();
        };
        
        document.getElementById('__rg_allow_session__').onclick = function() {
            sessionWhitelist.add(domain);
            stats.allowed++;
            updateBadge();
            showToast('✓✓ Allow session: ' + domain, '#2196F3');
            close();
            action.execute();
        };
        
        document.getElementById('__rg_block_session__').onclick = function() {
            sessionBlacklist.add(domain);
            stats.blocked++;
            updateBadge();
            showToast('✕✕ Block session: ' + domain, '#c62828');
            close();
        };
        
        document.getElementById('__rg_allow_always__').onclick = function() {
            if (config[host].whitelist.indexOf(domain) === -1) {
                config[host].whitelist.push(domain);
                saveConfig(config);
            }
            stats.allowed++;
            updateBadge();
            showToast('⭐ Whitelisted forever: ' + domain, '#4CAF50');
            close();
            action.execute();
        };
        
        document.getElementById('__rg_block_always__').onclick = function() {
            if (config[host].blacklist.indexOf(domain) === -1) {
                config[host].blacklist.push(domain);
                saveConfig(config);
            }
            stats.blocked++;
            updateBadge();
            showToast('🚫 Blacklisted forever: ' + domain, '#B71C1C');
            close();
        };
        
        document.getElementById('__rg_copy_url__').onclick = function() {
            var t = document.createElement('textarea');
            t.value = action.url;
            document.body.appendChild(t);
            t.select();
            document.execCommand('copy');
            t.remove();
            this.innerText = '✓ Copied';
            setTimeout(function() {
                document.getElementById('__rg_copy_url__') && (document.getElementById('__rg_copy_url__').innerText = '📋 Copy URL');
            }, 1500);
        };
    }
    
    function showToast(msg, color) {
        var t = document.createElement('div');
        t.innerHTML = msg;
        t.style.cssText = 'position:fixed;top:70px;left:50%;transform:translateX(-50%);background:' + (color || '#333') + ';color:#fff;padding:10px 18px;border-radius:20px;z-index:2147483648;font:bold 12px Arial;box-shadow:0 4px 15px rgba(0,0,0,0.5);';
        document.body.appendChild(t);
        setTimeout(function() { t.remove(); }, 2000);
    }
    
    // ========== HANDLE ACTION ==========
    function handleAction(action) {
        // Check whitelist/blacklist
        if (isWhitelisted(action.url)) {
            stats.allowed++;
            updateBadge();
            console.log('✓ Auto allow (whitelisted):', action.url);
            action.execute();
            return true;
        }
        
        if (isBlacklisted(action.url)) {
            stats.blocked++;
            updateBadge();
            console.log('🚫 Auto block (blacklisted):', action.url);
            showToast('🚫 Blocked: ' + extractDomain(action.url), '#f44336');
            return true;
        }
        
        // Check mode
        if (config[host].autoMode === 'block') {
            stats.blocked++;
            updateBadge();
            console.log('🚫 Auto block (mode):', action.url);
            return true;
        }
        
        if (config[host].autoMode === 'allow') {
            stats.allowed++;
            updateBadge();
            console.log('✓ Auto allow (mode):', action.url);
            action.execute();
            return true;
        }
        
        // Ask user
        showConfirm(action);
        return true;
    }
    
    // ========== INTERCEPTORS ==========
    
    // 1. window.open
    var originalOpen = window.open;
    window.open = function(url, target, features) {
        if (!url) return null;
        var absoluteUrl = new URL(url, location.href).href;
        
        var opened = null;
        handleAction({
            type: 'popup',
            url: absoluteUrl,
            trigger: 'window.open()',
            features: features || target || '',
            execute: function() {
                opened = originalOpen.call(window, url, target, features);
            }
        });
        return opened || { closed: false, close: function(){}, focus: function(){}, blur: function(){}, postMessage: function(){} };
    };
    
    // 2. location.href, location.replace, location.assign
    var originalAssign = location.assign;
    var originalReplace = location.replace;
    
    try {
        location.assign = function(url) {
            var absoluteUrl = new URL(url, location.href).href;
            handleAction({
                type: 'redirect',
                url: absoluteUrl,
                trigger: 'location.assign()',
                execute: function() { originalAssign.call(location, url); }
            });
        };
        
        location.replace = function(url) {
            var absoluteUrl = new URL(url, location.href).href;
            handleAction({
                type: 'redirect',
                url: absoluteUrl,
                trigger: 'location.replace()',
                execute: function() { originalReplace.call(location, url); }
            });
        };
    } catch(e) {}
    
    // Override location setter (khó hơn, một số browser không cho)
    try {
        var currentUrl = location.href;
        var locationProxy = new Proxy(location, {
            set: function(target, prop, value) {
                if (prop === 'href') {
                    var absoluteUrl = new URL(value, location.href).href;
                    handleAction({
                        type: 'redirect',
                        url: absoluteUrl,
                        trigger: 'location.href = ...',
                        execute: function() { target[prop] = value; }
                    });
                    return true;
                }
                target[prop] = value;
                return true;
            }
        });
        // Note: Không thể replace window.location trực tiếp, chỉ có thể track
    } catch(e) {}
    
    // 3. Meta refresh
    document.querySelectorAll('meta[http-equiv="refresh"]').forEach(function(meta) {
        var content = meta.getAttribute('content');
        var match = content.match(/^\s*(\d+)\s*;\s*url\s*=\s*(.+)$/i);
        if (match) {
            var delay = parseInt(match[1]);
            var url = match[2].trim();
            meta.remove(); // Prevent auto redirect
            
            setTimeout(function() {
                var absoluteUrl = new URL(url, location.href).href;
                handleAction({
                    type: 'redirect',
                    url: absoluteUrl,
                    trigger: 'meta refresh (' + delay + 's)',
                    execute: function() { location.href = url; }
                });
            }, delay * 1000);
        }
    });
    
    // 4. Form submit
    var originalSubmit = HTMLFormElement.prototype.submit;
    HTMLFormElement.prototype.submit = function() {
        var form = this;
        var url = form.action || location.href;
        var absoluteUrl = new URL(url, location.href).href;
        
        handleAction({
            type: 'submit',
            url: absoluteUrl,
            trigger: 'form.submit() - ' + (form.method || 'GET'),
            execute: function() { originalSubmit.call(form); }
        });
    };
    
    // Intercept form submit event
    document.addEventListener('submit', function(e) {
        var form = e.target;
        if (form.tagName !== 'FORM') return;
        
        var url = form.action || location.href;
        var absoluteUrl = new URL(url, location.href).href;
        
        // Không chặn nếu same domain form
        if (isSameDomain(absoluteUrl)) return;
        
        e.preventDefault();
        e.stopPropagation();
        
        handleAction({
            type: 'form',
            url: absoluteUrl,
            trigger: 'form submit event',
            execute: function() {
                form.submit(); // Sẽ vào originalSubmit
            }
        });
    }, true);
    
    // 5. Click on links (with target=_blank or external)
    document.addEventListener('click', function(e) {
        var link = e.target.closest('a');
        if (!link) return;
        
        var href = link.href;
        if (!href || href.startsWith('javascript:') || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) return;
        
        // Chỉ intercept nếu external hoặc target=_blank
        var isExternal = !isSameDomain(href);
        var opensNewTab = link.target === '_blank';
        
        if (!isExternal && !opensNewTab) return;
        
        // Check auto-allowed
        if (isWhitelisted(href)) return;
        
        e.preventDefault();
        e.stopPropagation();
        
        handleAction({
            type: opensNewTab ? 'popup' : 'redirect',
            url: href,
            trigger: 'link click',
            features: link.target || '',
            execute: function() {
                if (opensNewTab) {
                    originalOpen.call(window, href, '_blank');
                } else {
                    originalAssign.call(location, href);
                }
            }
        });
    }, true);
    
    // 6. History API
    var originalPushState = history.pushState;
    history.pushState = function() {
        console.log('📌 pushState:', arguments[2]);
        return originalPushState.apply(history, arguments);
    };
    
    // ========== BADGE UI ==========
    var badge = document.createElement('div');
    badge.id = '__rg_badge__';
    badge.style.cssText = 'position:fixed;top:10px;right:10px;background:linear-gradient(135deg,#4CAF50,#2E7D32);color:#fff;padding:8px 12px;border-radius:20px;z-index:2147483646;font:bold 11px Arial;box-shadow:0 3px 10px rgba(0,0,0,0.5);cursor:pointer;user-select:none;transition:all 0.3s;';
    badge.title = 'Redirect Guard - Bấm để mở settings';
    
    function updateBadge() {
        badge.innerHTML = '🛡️ ' + stats.blocked + '🚫 · ' + stats.allowed + '✓ · ' + stats.asked + '❓';
    }
    updateBadge();
    
    badge.onclick = function() { showSettings(); };
    document.body.appendChild(badge);
    
    // ========== SETTINGS ==========
    function showSettings() {
        var overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.9);z-index:2147483649;padding:15px;overflow-y:auto;display:flex;flex-direction:column;gap:10px;';
        
        var html = '<div style="color:#4CAF50;font:bold 16px Arial;">🛡️ Redirect Guard Settings</div>';
        
        // Stats
        html += '<div style="background:#252525;padding:12px;border-radius:8px;">';
        html += '<div style="color:#fff;font-weight:bold;margin-bottom:8px;">📊 Session Stats</div>';
        html += '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:5px;text-align:center;">';
        html += '<div style="background:#f44336;padding:10px;border-radius:5px;"><b style="font-size:20px;">' + stats.blocked + '</b><br><small>🚫 Blocked</small></div>';
        html += '<div style="background:#4CAF50;padding:10px;border-radius:5px;"><b style="font-size:20px;">' + stats.allowed + '</b><br><small>✓ Allowed</small></div>';
        html += '<div style="background:#FF9800;padding:10px;border-radius:5px;"><b style="font-size:20px;">' + stats.asked + '</b><br><small>❓ Asked</small></div>';
        html += '</div></div>';
        
        // Mode
        html += '<div style="background:#252525;padding:12px;border-radius:8px;">';
        html += '<div style="color:#fff;font-weight:bold;margin-bottom:8px;">⚙️ Mode cho ' + host + '</div>';
        html += '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:5px;">';
        ['ask', 'block', 'allow'].forEach(function(m) {
            var active = config[host].autoMode === m;
            var labels = { 'ask': '❓ Ask', 'block': '🚫 Block All', 'allow': '✓ Allow All' };
            var colors = { 'ask': '#FF9800', 'block': '#f44336', 'allow': '#4CAF50' };
            html += '<button class="__rg_mode__" data-mode="' + m + '" style="background:' + (active ? colors[m] : '#333') + ';color:#fff;border:0;padding:12px;border-radius:5px;font-weight:bold;font-size:12px;">' + labels[m] + '</button>';
        });
        html += '</div></div>';
        
        // Session lists
        html += '<div style="background:#252525;padding:12px;border-radius:8px;">';
        html += '<div style="color:#fff;font-weight:bold;margin-bottom:8px;">📋 Session (' + sessionWhitelist.size + '✓ / ' + sessionBlacklist.size + '🚫)</div>';
        if (sessionWhitelist.size > 0) {
            html += '<div style="color:#4CAF50;font-size:11px;margin-bottom:4px;">✓ Allowed session:</div>';
            Array.from(sessionWhitelist).forEach(function(d) {
                html += '<div style="background:#1B5E20;padding:5px 8px;margin:3px 0;border-radius:4px;font-size:11px;display:flex;justify-content:space-between;"><span style="font-family:monospace;">' + d + '</span><button class="__rg_del_swl__" data-domain="' + d + '" style="background:#c62828;color:#fff;border:0;padding:2px 6px;border-radius:3px;font-size:10px;">✕</button></div>';
            });
        }
        if (sessionBlacklist.size > 0) {
            html += '<div style="color:#f44336;font-size:11px;margin:8px 0 4px;">🚫 Blocked session:</div>';
            Array.from(sessionBlacklist).forEach(function(d) {
                html += '<div style="background:#B71C1C;padding:5px 8px;margin:3px 0;border-radius:4px;font-size:11px;display:flex;justify-content:space-between;"><span style="font-family:monospace;">' + d + '</span><button class="__rg_del_sbl__" data-domain="' + d + '" style="background:#333;color:#fff;border:0;padding:2px 6px;border-radius:3px;font-size:10px;">✕</button></div>';
            });
        }
        html += '</div>';
        
        // Permanent whitelist
        html += '<div style="background:#252525;padding:12px;border-radius:8px;">';
        html += '<div style="color:#4CAF50;font-weight:bold;margin-bottom:8px;">⭐ Whitelist mãi (' + config[host].whitelist.length + ')</div>';
        if (config[host].whitelist.length === 0) {
            html += '<div style="color:#666;font-size:11px;">Chưa có domain nào</div>';
        } else {
            config[host].whitelist.forEach(function(d) {
                html += '<div style="background:#1B5E20;padding:6px 10px;margin:3px 0;border-radius:4px;font-size:11px;display:flex;justify-content:space-between;align-items:center;"><span style="font-family:monospace;">' + d + '</span><button class="__rg_del_wl__" data-domain="' + d + '" style="background:#c62828;color:#fff;border:0;padding:4px 10px;border-radius:3px;font-size:11px;">🗑️</button></div>';
            });
        }
        html += '</div>';
        
        // Permanent blacklist
        html += '<div style="background:#252525;padding:12px;border-radius:8px;">';
        html += '<div style="color:#f44336;font-weight:bold;margin-bottom:8px;">🚫 Blacklist mãi (' + config[host].blacklist.length + ')</div>';
        if (config[host].blacklist.length === 0) {
            html += '<div style="color:#666;font-size:11px;">Chưa có domain nào</div>';
        } else {
            config[host].blacklist.forEach(function(d) {
                html += '<div style="background:#B71C1C;padding:6px 10px;margin:3px 0;border-radius:4px;font-size:11px;display:flex;justify-content:space-between;align-items:center;"><span style="font-family:monospace;">' + d + '</span><button class="__rg_del_bl__" data-domain="' + d + '" style="background:#333;color:#fff;border:0;padding:4px 10px;border-radius:3px;font-size:11px;">🗑️</button></div>';
            });
        }
        html += '</div>';
        
        // Actions
        html += '<div style="background:#252525;padding:12px;border-radius:8px;display:flex;flex-direction:column;gap:5px;">';
        html += '<button id="__rg_clear_site__" style="background:#c62828;color:#fff;border:0;padding:12px;border-radius:6px;font-weight:bold;">🗑️ Clear config cho ' + host + '</button>';
        html += '<button id="__rg_export__" style="background:#FF9800;color:#fff;border:0;padding:12px;border-radius:6px;font-weight:bold;">📤 Export config</button>';
        html += '<button id="__rg_close__" style="background:#666;color:#fff;border:0;padding:12px;border-radius:6px;font-weight:bold;">✕ Close</button>';
        html += '</div>';
        
        overlay.innerHTML = html;
        document.body.appendChild(overlay);
        
        // Handlers
        overlay.querySelectorAll('.__rg_mode__').forEach(function(b) {
            b.onclick = function() {
                config[host].autoMode = this.dataset.mode;
                saveConfig(config);
                overlay.remove();
                showSettings();
                showToast('Mode: ' + this.dataset.mode, '#2196F3');
            };
        });
        
        overlay.querySelectorAll('.__rg_del_swl__').forEach(function(b) {
            b.onclick = function() {
                sessionWhitelist.delete(this.dataset.domain);
                overlay.remove(); showSettings();
            };
        });
        
        overlay.querySelectorAll('.__rg_del_sbl__').forEach(function(b) {
            b.onclick = function() {
                sessionBlacklist.delete(this.dataset.domain);
                overlay.remove(); showSettings();
            };
        });
        
        overlay.querySelectorAll('.__rg_del_wl__').forEach(function(b) {
            b.onclick = function() {
                var d = this.dataset.domain;
                config[host].whitelist = config[host].whitelist.filter(function(x) { return x !== d; });
                saveConfig(config);
                overlay.remove(); showSettings();
            };
        });
        
        overlay.querySelectorAll('.__rg_del_bl__').forEach(function(b) {
            b.onclick = function() {
                var d = this.dataset.domain;
                config[host].blacklist = config[host].blacklist.filter(function(x) { return x !== d; });
                saveConfig(config);
                overlay.remove(); showSettings();
            };
        });
        
        document.getElementById('__rg_clear_site__').onclick = function() {
            if (confirm('Clear config cho ' + host + '?')) {
                delete config[host];
                saveConfig(config);
                alert('✓ Cleared');
                overlay.remove();
            }
        };
        
        document.getElementById('__rg_export__').onclick = function() {
            var blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
            var a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = 'redirect_guard_' + Date.now() + '.json';
            a.click();
        };
        
        document.getElementById('__rg_close__').onclick = function() { overlay.remove(); };
    }
    
    // ========== INIT NOTIFICATION ==========
    var initToast = document.createElement('div');
    initToast.innerHTML = '🛡️ <b>Redirect Guard ACTIVE</b><br><small style="opacity:0.9;">Auto: ' + config[host].autoMode + ' · Bấm badge để settings</small>';
    initToast.style.cssText = 'position:fixed;top:70px;left:50%;transform:translateX(-50%);background:linear-gradient(135deg,#4CAF50,#2E7D32);color:#fff;padding:15px 25px;border-radius:12px;z-index:2147483648;font:bold 13px Arial;text-align:center;box-shadow:0 5px 20px rgba(0,0,0,0.6);';
    document.body.appendChild(initToast);
    setTimeout(function() { initToast.remove(); }, 3000);
    
    console.log('🛡️ Redirect Guard active for', host);
})();