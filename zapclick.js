/**
 * ZapClick - Click to Zap element + Auto save selector per site
 * Reload trang tự động xóa lại
 */
(function() {
    'use strict';
    
    var STORAGE_KEY = 'zapclick_rules';
    var host = location.hostname.replace(/^www\./, '');
    
    // ========== STORAGE ==========
    function getRules() {
        try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; }
        catch(e) { return {}; }
    }
    
    function saveRules(rules) {
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(rules)); }
        catch(e) { console.error('Storage error:', e); }
    }
    
    function getSiteRules() {
        var rules = getRules();
        return rules[host] || [];
    }
    
    function saveSiteRule(selector) {
        var rules = getRules();
        if (!rules[host]) rules[host] = [];
        if (rules[host].indexOf(selector) === -1) {
            rules[host].push(selector);
            saveRules(rules);
        }
    }
    
    function removeSiteRule(selector) {
        var rules = getRules();
        if (rules[host]) {
            var idx = rules[host].indexOf(selector);
            if (idx > -1) {
                rules[host].splice(idx, 1);
                saveRules(rules);
            }
        }
    }
    
    // ========== APPLY RULES ==========
    function applyRules() {
        var rules = getSiteRules();
        if (!rules.length) return 0;
        
        var css = rules.join(', ') + ' { display: none !important; visibility: hidden !important; opacity: 0 !important; pointer-events: none !important; height: 0 !important; }';
        
        var oldStyle = document.getElementById('__zapclick_css__');
        if (oldStyle) oldStyle.remove();
        
        var style = document.createElement('style');
        style.id = '__zapclick_css__';
        style.textContent = css;
        document.head.appendChild(style);
        
        // Cũng remove để chắc chắn
        var removed = 0;
        rules.forEach(function(sel) {
            try {
                document.querySelectorAll(sel).forEach(function(el) {
                    el.remove();
                    removed++;
                });
            } catch(e) {}
        });
        
        return removed;
    }
    
    // ========== GET SELECTOR ==========
    function getSelector(el) {
        // ID first (most specific)
        if (el.id && el.id.length < 50 && !/^\d/.test(el.id)) {
            return '#' + CSS.escape(el.id);
        }
        
        // Class combination
        if (el.className && typeof el.className === 'string') {
            var classes = el.className.trim().split(/\s+/)
                .filter(function(c) { 
                    // Skip dynamic/utility classes
                    return c.length > 2 && 
                           c.length < 40 &&
                           !/^\d/.test(c) &&
                           !/^(is-|has-|active|selected|hover|focus)/.test(c);
                })
                .slice(0, 3);
            
            if (classes.length > 0) {
                var selector = el.tagName.toLowerCase() + '.' + classes.map(function(c) {
                    return CSS.escape(c);
                }).join('.');
                
                // Verify selector is not too broad
                try {
                    var matches = document.querySelectorAll(selector);
                    if (matches.length > 0 && matches.length < 20) {
                        return selector;
                    }
                } catch(e) {}
            }
        }
        
        // Data attributes
        var dataAttrs = ['data-testid', 'data-id', 'data-ad', 'data-banner', 'data-popup'];
        for (var i = 0; i < dataAttrs.length; i++) {
            var val = el.getAttribute(dataAttrs[i]);
            if (val) {
                return el.tagName.toLowerCase() + '[' + dataAttrs[i] + '="' + val + '"]';
            }
        }
        
        // Fallback: path from parent
        var path = [];
        var current = el;
        for (var i = 0; i < 3 && current && current.tagName; i++) {
            var part = current.tagName.toLowerCase();
            if (current.id) {
                part += '#' + CSS.escape(current.id);
                path.unshift(part);
                break;
            }
            if (current.className && typeof current.className === 'string') {
                var cls = current.className.trim().split(/\s+/)[0];
                if (cls && !/^\d/.test(cls)) {
                    part += '.' + CSS.escape(cls);
                }
            }
            path.unshift(part);
            current = current.parentElement;
        }
        return path.join(' > ');
    }
    
    // ========== APPLY EXISTING RULES FIRST ==========
    var initialRemoved = applyRules();
    
    // ========== UI ==========
    var oldUI = document.getElementById('__zapclick_ui__');
    if (oldUI) {
        oldUI.remove();
        return;
    }
    
    var container = document.createElement('div');
    container.id = '__zapclick_ui__';
    
    // Top bar
    var topBar = document.createElement('div');
    topBar.style.cssText = 'position:fixed;top:0;left:0;right:0;background:linear-gradient(135deg,#9C27B0,#7B1FA2);color:#fff;padding:10px 15px;text-align:center;z-index:2147483647;font:bold 13px Arial;box-shadow:0 2px 10px rgba(0,0,0,0.5);';
    topBar.innerHTML = 
        '<div style="display:flex;justify-content:space-between;align-items:center;">' +
            '<div style="text-align:left;flex:1;">' +
                '🎯 <b>ZapClick Smart</b><br>' +
                '<small style="opacity:0.9;font-weight:normal;">' + host + ' · ' + getSiteRules().length + ' rules · ẩn ' + initialRemoved + ' elements</small>' +
            '</div>' +
            '<button id="__zc_manage__" style="background:rgba(0,0,0,0.3);color:#fff;border:0;padding:8px 12px;border-radius:5px;font-weight:bold;margin-right:5px;">⚙️</button>' +
            '<button id="__zc_exit__" style="background:rgba(0,0,0,0.3);color:#fff;border:0;padding:8px 12px;border-radius:5px;font-weight:bold;">✕</button>' +
        '</div>' +
        '<div style="margin-top:8px;font-size:11px;opacity:0.9;">👇 Click element để XÓA và LƯU rule (reload vẫn còn)</div>';
    
    container.appendChild(topBar);
    document.body.appendChild(container);
    
    // ========== HIGHLIGHT ==========
    var highlighted = null;
    
    function onMouseOver(e) {
        if (container.contains(e.target)) return;
        if (highlighted) {
            highlighted.style.outline = '';
            highlighted.style.outlineOffset = '';
        }
        highlighted = e.target;
        highlighted.style.outline = '3px solid #9C27B0';
        highlighted.style.outlineOffset = '-3px';
    }
    
    function onClick(e) {
        if (container.contains(e.target)) return;
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        
        var el = e.target;
        var selector = getSelector(el);
        
        // Save rule
        saveSiteRule(selector);
        
        // Apply rules (removes matching elements)
        var removed = applyRules();
        
        // Update counter
        var counter = topBar.querySelector('small');
        counter.textContent = host + ' · ' + getSiteRules().length + ' rules · ẩn ' + removed + ' elements';
        
        // Toast
        var toast = document.createElement('div');
        toast.innerHTML = 
            '<div style="color:#4CAF50;font-weight:bold;margin-bottom:4px;">✓ Đã xóa & lưu rule</div>' +
            '<div style="font-family:monospace;font-size:11px;color:#fff;word-break:break-all;">' + selector + '</div>' +
            '<div style="color:#aaa;font-size:11px;margin-top:4px;">Match: ' + removed + ' elements · Reload vẫn ẩn ✓</div>';
        toast.style.cssText = 'position:fixed;bottom:80px;left:15px;right:15px;background:#212121;padding:12px 15px;border-radius:8px;z-index:2147483648;font:12px Arial;border-left:4px solid #4CAF50;box-shadow:0 4px 15px rgba(0,0,0,0.6);';
        document.body.appendChild(toast);
        setTimeout(function() { toast.remove(); }, 3000);
        
        return false;
    }
    
    function onKeyDown(e) {
        if (e.key === 'Escape') exit();
    }
    
    document.addEventListener('mouseover', onMouseOver, true);
    document.addEventListener('click', onClick, true);
    document.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('touchend', function(e) {
        if (container.contains(e.target)) return;
        // Simulate click on touch
        onClick(e);
    }, true);
    
    // ========== EXIT ==========
    function exit() {
        if (highlighted) {
            highlighted.style.outline = '';
            highlighted.style.outlineOffset = '';
        }
        document.removeEventListener('mouseover', onMouseOver, true);
        document.removeEventListener('click', onClick, true);
        document.removeEventListener('keydown', onKeyDown, true);
        container.remove();
    }
    
    document.getElementById('__zc_exit__').onclick = exit;
    
    // ========== MANAGE UI ==========
    document.getElementById('__zc_manage__').onclick = function() {
        var rules = getSiteRules();
        var allRules = getRules();
        var totalSites = Object.keys(allRules).length;
        var totalRules = 0;
        Object.keys(allRules).forEach(function(k) { totalRules += allRules[k].length; });
        
        var overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.95);z-index:2147483649;padding:15px;overflow-y:auto;display:flex;flex-direction:column;gap:10px;';
        
        var html = '<div style="color:#9C27B0;font:bold 16px Arial;">⚙️ Manage Rules</div>';
        html += '<div style="background:#252525;padding:12px;border-radius:8px;color:#aaa;font-size:12px;">';
        html += '📊 Total: <b style="color:#4CAF50;">' + totalSites + ' sites</b>, <b style="color:#4CAF50;">' + totalRules + ' rules</b><br>';
        html += '🌐 Current: <b style="color:#9C27B0;">' + host + '</b> - <b>' + rules.length + '</b> rules';
        html += '</div>';
        
        // Rules for current site
        html += '<div style="color:#fff;font-weight:bold;margin-top:10px;">📌 Rules cho ' + host + ':</div>';
        
        if (rules.length === 0) {
            html += '<div style="color:#aaa;text-align:center;padding:20px;font-style:italic;">Chưa có rule nào</div>';
        } else {
            rules.forEach(function(sel, i) {
                html += '<div style="background:#2a2a2a;padding:10px;border-radius:6px;border-left:3px solid #9C27B0;">';
                html += '<div style="font-family:monospace;font-size:11px;color:#fff;word-break:break-all;margin-bottom:6px;">' + sel + '</div>';
                html += '<button class="__zc_del__" data-sel="' + encodeURIComponent(sel) + '" style="background:#f44336;color:#fff;border:0;padding:5px 12px;border-radius:4px;font-size:11px;font-weight:bold;">🗑️ Xóa rule</button>';
                html += '</div>';
            });
        }
        
        html += '<div style="border-top:1px solid #444;margin-top:10px;padding-top:10px;">';
        html += '<button id="__zc_add_custom__" style="background:#2196F3;color:#fff;border:0;padding:12px;border-radius:6px;font-weight:bold;width:100%;margin-bottom:5px;">✏️ Add custom selector</button>';
        html += '<button id="__zc_export__" style="background:#FF9800;color:#fff;border:0;padding:12px;border-radius:6px;font-weight:bold;width:100%;margin-bottom:5px;">📤 Export tất cả rules</button>';
        html += '<button id="__zc_import__" style="background:#4CAF50;color:#fff;border:0;padding:12px;border-radius:6px;font-weight:bold;width:100%;margin-bottom:5px;">📥 Import rules</button>';
        html += '<button id="__zc_clear_site__" style="background:#f44336;color:#fff;border:0;padding:12px;border-radius:6px;font-weight:bold;width:100%;margin-bottom:5px;">🗑️ Xóa hết rules của ' + host + '</button>';
        html += '<button id="__zc_clear_all__" style="background:#c62828;color:#fff;border:0;padding:12px;border-radius:6px;font-weight:bold;width:100%;margin-bottom:5px;">🔥 Xóa TẤT CẢ rules</button>';
        html += '<button id="__zc_close_manage__" style="background:#666;color:#fff;border:0;padding:12px;border-radius:6px;font-weight:bold;width:100%;">← Quay lại</button>';
        html += '</div>';
        
        overlay.innerHTML = html;
        document.body.appendChild(overlay);
        
        // Handlers
        overlay.querySelectorAll('.__zc_del__').forEach(function(b) {
            b.onclick = function() {
                var sel = decodeURIComponent(this.dataset.sel);
                removeSiteRule(sel);
                overlay.remove();
                applyRules();
                document.getElementById('__zc_manage__').click(); // Reopen
            };
        });
        
        document.getElementById('__zc_add_custom__').onclick = function() {
            var sel = prompt('Nhập CSS selector cần ẩn:\nVD: .banner-ad, #popup-modal, div[class*="ads"]');
            if (sel) {
                try {
                    document.querySelectorAll(sel); // Test validity
                    saveSiteRule(sel);
                    overlay.remove();
                    applyRules();
                    document.getElementById('__zc_manage__').click();
                } catch(e) {
                    alert('❌ Selector không hợp lệ: ' + e.message);
                }
            }
        };
        
        document.getElementById('__zc_export__').onclick = function() {
            var data = getRules();
            var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            var a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = 'zapclick_rules_' + Date.now() + '.json';
            a.click();
            setTimeout(function() { URL.revokeObjectURL(a.href); }, 1000);
        };
        
        document.getElementById('__zc_import__').onclick = function() {
            var input = document.createElement('input');
            input.type = 'file';
            input.accept = '.json';
            input.onchange = function(e) {
                var reader = new FileReader();
                reader.onload = function(ev) {
                    try {
                        var imported = JSON.parse(ev.target.result);
                        var existing = getRules();
                        // Merge
                        Object.keys(imported).forEach(function(site) {
                            if (!existing[site]) existing[site] = [];
                            imported[site].forEach(function(sel) {
                                if (existing[site].indexOf(sel) === -1) {
                                    existing[site].push(sel);
                                }
                            });
                        });
                        saveRules(existing);
                        alert('✓ Imported! Total sites: ' + Object.keys(existing).length);
                        overlay.remove();
                        applyRules();
                    } catch(e) {
                        alert('❌ File không hợp lệ: ' + e.message);
                    }
                };
                reader.readAsText(e.target.files[0]);
            };
            input.click();
        };
        
        document.getElementById('__zc_clear_site__').onclick = function() {
            if (confirm('Xóa tất cả ' + rules.length + ' rules của ' + host + '?')) {
                var allRules = getRules();
                delete allRules[host];
                saveRules(allRules);
                overlay.remove();
                var style = document.getElementById('__zapclick_css__');
                if (style) style.remove();
                alert('✓ Đã xóa. Reload để thấy hiệu quả.');
            }
        };
        
        document.getElementById('__zc_clear_all__').onclick = function() {
            if (confirm('XÓA TOÀN BỘ rules của TẤT CẢ ' + totalSites + ' sites?\nKhông khôi phục được!')) {
                localStorage.removeItem(STORAGE_KEY);
                overlay.remove();
                alert('🔥 Đã xóa tất cả');
            }
        };
        
        document.getElementById('__zc_close_manage__').onclick = function() {
            overlay.remove();
        };
    };
    
    console.log('🎯 ZapClick Smart loaded. Rules for', host + ':', getSiteRules().length);
})();