/**
 * ZapClick Smart v2 - Preview trước khi save rule
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
        catch(e) {}
    }
    
    function getSiteRules() {
        return getRules()[host] || [];
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
    
    // ========== GENERATE SELECTORS (multiple options) ==========
    function generateSelectors(el) {
        var options = [];
        
        // Option 1: ID (most specific)
        if (el.id && el.id.length < 60 && !/^\d/.test(el.id)) {
            try {
                var sel = '#' + CSS.escape(el.id);
                var count = document.querySelectorAll(sel).length;
                options.push({ selector: sel, count: count, type: 'ID', priority: 1 });
            } catch(e) {}
        }
        
        // Option 2: Full class combination
        if (el.className && typeof el.className === 'string') {
            var classes = el.className.trim().split(/\s+/)
                .filter(function(c) { return c.length > 1 && c.length < 60 && !/^\d/.test(c); });
            
            if (classes.length > 0) {
                // Full classes
                try {
                    var sel = el.tagName.toLowerCase() + '.' + classes.map(function(c) { return CSS.escape(c); }).join('.');
                    var count = document.querySelectorAll(sel).length;
                    options.push({ selector: sel, count: count, type: 'Tag + All classes', priority: 2 });
                } catch(e) {}
                
                // First 2 classes
                if (classes.length >= 2) {
                    try {
                        var sel = el.tagName.toLowerCase() + '.' + classes.slice(0, 2).map(function(c) { return CSS.escape(c); }).join('.');
                        var count = document.querySelectorAll(sel).length;
                        options.push({ selector: sel, count: count, type: 'Tag + 2 classes', priority: 3 });
                    } catch(e) {}
                }
                
                // Just first class
                try {
                    var sel = el.tagName.toLowerCase() + '.' + CSS.escape(classes[0]);
                    var count = document.querySelectorAll(sel).length;
                    options.push({ selector: sel, count: count, type: 'Tag + first class', priority: 4 });
                } catch(e) {}
            }
        }
        
        // Option 3: Data attributes
        var dataAttrs = ['data-testid', 'data-id', 'data-ad', 'data-banner', 'data-popup', 'data-widget', 'data-role'];
        for (var i = 0; i < dataAttrs.length; i++) {
            var val = el.getAttribute(dataAttrs[i]);
            if (val && val.length < 60) {
                try {
                    var sel = el.tagName.toLowerCase() + '[' + dataAttrs[i] + '="' + CSS.escape(val) + '"]';
                    var count = document.querySelectorAll(sel).length;
                    options.push({ selector: sel, count: count, type: 'Data attribute', priority: 2 });
                } catch(e) {}
            }
        }
        
        // Option 4: Parent > Element (nth-child)
        if (el.parentElement) {
            var parent = el.parentElement;
            var parentSel = '';
            
            if (parent.id) {
                parentSel = '#' + CSS.escape(parent.id);
            } else if (parent.className && typeof parent.className === 'string') {
                var pClasses = parent.className.trim().split(/\s+/).filter(function(c) { return c.length > 1 && !/^\d/.test(c); });
                if (pClasses.length > 0) {
                    parentSel = parent.tagName.toLowerCase() + '.' + CSS.escape(pClasses[0]);
                }
            }
            
            if (parentSel) {
                // Parent > Element with class
                if (el.className && typeof el.className === 'string') {
                    var eClasses = el.className.trim().split(/\s+/).filter(function(c) { return c.length > 1 && !/^\d/.test(c); });
                    if (eClasses.length > 0) {
                        try {
                            var sel = parentSel + ' > ' + el.tagName.toLowerCase() + '.' + CSS.escape(eClasses[0]);
                            var count = document.querySelectorAll(sel).length;
                            options.push({ selector: sel, count: count, type: 'Parent > Element', priority: 3 });
                        } catch(e) {}
                    }
                }
                
                // Parent > nth-child
                var index = Array.prototype.indexOf.call(parent.children, el) + 1;
                try {
                    var sel = parentSel + ' > ' + el.tagName.toLowerCase() + ':nth-child(' + index + ')';
                    var count = document.querySelectorAll(sel).length;
                    options.push({ selector: sel, count: count, type: 'nth-child (specific)', priority: 5 });
                } catch(e) {}
            }
        }
        
        // Option 5: Tag with attributes (href, src)
        if (el.tagName === 'A' && el.href) {
            try {
                var hostname = new URL(el.href).hostname;
                if (hostname && hostname !== location.hostname) {
                    var sel = 'a[href*="' + hostname + '"]';
                    var count = document.querySelectorAll(sel).length;
                    options.push({ selector: sel, count: count, type: 'External link', priority: 3 });
                }
            } catch(e) {}
        }
        
        if (el.tagName === 'IFRAME' && el.src) {
            try {
                var hostname = new URL(el.src).hostname;
                if (hostname) {
                    var sel = 'iframe[src*="' + hostname + '"]';
                    var count = document.querySelectorAll(sel).length;
                    options.push({ selector: sel, count: count, type: 'Iframe by src', priority: 2 });
                }
            } catch(e) {}
        }
        
        // Remove duplicates and sort
        var seen = {};
        options = options.filter(function(o) {
            if (seen[o.selector]) return false;
            seen[o.selector] = true;
            return true;
        });
        
        options.sort(function(a, b) {
            // Prefer specific (fewer matches) but not too broad
            if (a.count <= 3 && b.count > 3) return -1;
            if (b.count <= 3 && a.count > 3) return 1;
            return a.priority - b.priority;
        });
        
        return options;
    }
    
    // ========== APPLY RULES ==========
    function applyRules() {
        var rules = getSiteRules();
        if (!rules.length) return 0;
        
        var css = rules.join(', ') + ' { display: none !important; visibility: hidden !important; opacity: 0 !important; }';
        
        var old = document.getElementById('__zapclick_css__');
        if (old) old.remove();
        
        var style = document.createElement('style');
        style.id = '__zapclick_css__';
        style.textContent = css;
        document.head.appendChild(style);
        
        var count = 0;
        rules.forEach(function(sel) {
            try {
                count += document.querySelectorAll(sel).length;
            } catch(e) {}
        });
        return count;
    }
    
    // ========== APPLY EXISTING ==========
    var initialCount = applyRules();
    
    // ========== UI ==========
    var oldUI = document.getElementById('__zapclick_ui__');
    if (oldUI) { oldUI.remove(); return; }
    
    var container = document.createElement('div');
    container.id = '__zapclick_ui__';
    
    var topBar = document.createElement('div');
    topBar.style.cssText = 'position:fixed;top:0;left:0;right:0;background:linear-gradient(135deg,#9C27B0,#7B1FA2);color:#fff;padding:10px 15px;text-align:center;z-index:2147483647;font:bold 13px Arial;box-shadow:0 2px 10px rgba(0,0,0,0.5);';
    topBar.innerHTML = 
        '<div style="display:flex;justify-content:space-between;align-items:center;">' +
            '<div style="text-align:left;flex:1;">' +
                '🎯 <b>ZapClick v2</b><br>' +
                '<small style="opacity:0.9;font-weight:normal;">' + host + ' · ' + getSiteRules().length + ' rules</small>' +
            '</div>' +
            '<button id="__zc_undo__" style="background:rgba(0,0,0,0.3);color:#fff;border:0;padding:8px 12px;border-radius:5px;font-weight:bold;margin-right:5px;">↶ Undo</button>' +
            '<button id="__zc_manage__" style="background:rgba(0,0,0,0.3);color:#fff;border:0;padding:8px 12px;border-radius:5px;font-weight:bold;margin-right:5px;">⚙️</button>' +
            '<button id="__zc_exit__" style="background:rgba(0,0,0,0.3);color:#fff;border:0;padding:8px 12px;border-radius:5px;font-weight:bold;">✕</button>' +
        '</div>' +
        '<div style="margin-top:6px;font-size:11px;opacity:0.9;">👇 Click element - Preview & Confirm trước khi ẩn</div>';
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
        
        showPreview(e.target);
        return false;
    }
    
    document.addEventListener('mouseover', onMouseOver, true);
    document.addEventListener('click', onClick, true);
    document.addEventListener('touchend', function(e) {
        if (container.contains(e.target)) return;
        onClick(e);
    }, true);
    
    // ========== PREVIEW DIALOG ==========
    function showPreview(clickedEl) {
        var options = generateSelectors(clickedEl);
        
        if (options.length === 0) {
            alert('❌ Không thể tạo selector cho element này');
            return;
        }
        
        // Create overlay
        var overlay = document.createElement('div');
        overlay.id = '__zc_preview__';
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:2147483650;padding:15px;overflow-y:auto;display:flex;flex-direction:column;gap:8px;';
        
        var html = '<div style="color:#9C27B0;font:bold 15px Arial;margin-bottom:5px;">🎯 Chọn selector chính xác</div>';
        html += '<div style="color:#aaa;font-size:11px;margin-bottom:10px;">Chọn cái nào match ĐÚNG banner (không quá nhiều)</div>';
        
        // Element info
        var elInfo = clickedEl.tagName.toLowerCase();
        if (clickedEl.id) elInfo += '#' + clickedEl.id;
        if (clickedEl.className) elInfo += '.' + String(clickedEl.className).split(' ').slice(0, 2).join('.');
        
        html += '<div style="background:#252525;padding:10px;border-radius:6px;color:#fff;font-family:monospace;font-size:11px;word-break:break-all;">';
        html += '<div style="color:#aaa;font-size:10px;">Clicked element:</div>';
        html += elInfo.substring(0, 150);
        html += '</div>';
        
        // Options
        options.forEach(function(opt, i) {
            var color = '#f44336'; // Red - too broad
            var warn = '⚠️';
            if (opt.count === 1) { color = '#4CAF50'; warn = '✓'; } // Perfect
            else if (opt.count <= 5) { color = '#8BC34A'; warn = '✓'; } // Good
            else if (opt.count <= 20) { color = '#FF9800'; warn = '⚠️'; } // Warning
            
            html += '<div style="background:#2a2a2a;padding:10px;border-radius:6px;border-left:4px solid ' + color + ';">';
            html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">';
            html += '<span style="color:' + color + ';font-weight:bold;font-size:12px;">' + warn + ' Match ' + opt.count + ' element</span>';
            html += '<span style="color:#aaa;font-size:10px;">' + opt.type + '</span>';
            html += '</div>';
            html += '<div style="font-family:monospace;font-size:11px;color:#fff;word-break:break-all;background:#111;padding:6px;border-radius:4px;margin-bottom:8px;">' + opt.selector + '</div>';
            html += '<div style="display:flex;gap:5px;">';
            html += '<button class="__zc_preview_btn__" data-sel="' + encodeURIComponent(opt.selector) + '" data-action="highlight" style="background:#2196F3;color:#fff;border:0;padding:8px;border-radius:4px;font-size:11px;font-weight:bold;flex:1;">👁 Preview</button>';
            html += '<button class="__zc_preview_btn__" data-sel="' + encodeURIComponent(opt.selector) + '" data-action="save" style="background:' + color + ';color:#fff;border:0;padding:8px;border-radius:4px;font-size:11px;font-weight:bold;flex:2;">🎯 Chọn & Ẩn</button>';
            html += '</div>';
            html += '</div>';
        });
        
        html += '<div style="border-top:1px solid #444;margin-top:10px;padding-top:10px;">';
        html += '<button id="__zc_preview_cancel__" style="background:#666;color:#fff;border:0;padding:12px;border-radius:6px;font-weight:bold;width:100%;">✕ Hủy</button>';
        html += '</div>';
        
        overlay.innerHTML = html;
        document.body.appendChild(overlay);
        
        // Highlight preview
        var previewHighlighted = [];
        function clearPreview() {
            previewHighlighted.forEach(function(el) {
                el.style.outline = '';
                el.style.outlineOffset = '';
            });
            previewHighlighted = [];
        }
        
        overlay.querySelectorAll('.__zc_preview_btn__').forEach(function(b) {
            b.onclick = function() {
                var sel = decodeURIComponent(this.dataset.sel);
                var action = this.dataset.action;
                
                if (action === 'highlight') {
                    clearPreview();
                    try {
                        document.querySelectorAll(sel).forEach(function(el) {
                            el.style.outline = '4px dashed #FF5722';
                            el.style.outlineOffset = '-4px';
                            previewHighlighted.push(el);
                        });
                        
                        // Đóng overlay tạm để nhìn thấy highlight
                        overlay.style.display = 'none';
                        
                        setTimeout(function() {
                            overlay.style.display = 'flex';
                            clearPreview();
                        }, 2000);
                    } catch(e) {
                        alert('❌ Selector lỗi: ' + e.message);
                    }
                } else if (action === 'save') {
                    clearPreview();
                    
                    // Confirm nếu match nhiều
                    var count = document.querySelectorAll(sel).length;
                    if (count > 10) {
                        if (!confirm('⚠️ Selector này match ' + count + ' element!\n\nCó thể xóa nhiều thứ quan trọng.\n\nBạn CHẮC CHẮN muốn ẩn ' + count + ' elements?')) {
                            return;
                        }
                    }
                    
                    saveSiteRule(sel);
                    var totalCount = applyRules();
                    
                    // Update counter
                    var counter = topBar.querySelector('small');
                    counter.textContent = host + ' · ' + getSiteRules().length + ' rules · ẩn ' + totalCount + ' elements';
                    
                    overlay.remove();
                    
                    // Toast
                    var toast = document.createElement('div');
                    toast.innerHTML = '✓ Đã lưu rule<br><small style="opacity:0.9;">Match ' + count + ' elements</small>';
                    toast.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:#4CAF50;color:#fff;padding:12px 20px;border-radius:20px;z-index:2147483648;font:bold 12px Arial;text-align:center;';
                    document.body.appendChild(toast);
                    setTimeout(function() { toast.remove(); }, 2500);
                }
            };
        });
        
        document.getElementById('__zc_preview_cancel__').onclick = function() {
            clearPreview();
            overlay.remove();
        };
    }
    
    // ========== UNDO ==========
    document.getElementById('__zc_undo__').onclick = function() {
        var rules = getSiteRules();
        if (rules.length === 0) {
            alert('❌ Không có rule để undo');
            return;
        }
        
        var lastRule = rules[rules.length - 1];
        if (confirm('Undo rule cuối:\n\n' + lastRule + '\n\nOK?')) {
            removeSiteRule(lastRule);
            
            // Remove CSS and reload page part
            var style = document.getElementById('__zapclick_css__');
            if (style) style.remove();
            
            var count = applyRules();
            
            var counter = topBar.querySelector('small');
            counter.textContent = host + ' · ' + getSiteRules().length + ' rules';
            
            alert('✓ Undone. Reload trang để thấy element quay lại.');
        }
    };
    
    // ========== EXIT ==========
    function exit() {
        if (highlighted) {
            highlighted.style.outline = '';
            highlighted.style.outlineOffset = '';
        }
        document.removeEventListener('mouseover', onMouseOver, true);
        document.removeEventListener('click', onClick, true);
        container.remove();
    }
    
    document.getElementById('__zc_exit__').onclick = exit;
    
    // ========== MANAGE ==========
    document.getElementById('__zc_manage__').onclick = function() {
        var rules = getSiteRules();
        var overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.95);z-index:2147483650;padding:15px;overflow-y:auto;display:flex;flex-direction:column;gap:10px;';
        
        var html = '<div style="color:#9C27B0;font:bold 16px Arial;">⚙️ Rules for ' + host + '</div>';
        
        if (rules.length === 0) {
            html += '<div style="color:#aaa;text-align:center;padding:20px;">Chưa có rule</div>';
        } else {
            rules.forEach(function(sel, i) {
                var count = 0;
                try { count = document.querySelectorAll(sel).length; } catch(e) {}
                html += '<div style="background:#2a2a2a;padding:10px;border-radius:6px;">';
                html += '<div style="font-family:monospace;font-size:11px;color:#fff;word-break:break-all;margin-bottom:4px;">' + sel + '</div>';
                html += '<div style="color:#aaa;font-size:10px;margin-bottom:6px;">Match: ' + count + ' elements</div>';
                html += '<button class="__zc_del__" data-sel="' + encodeURIComponent(sel) + '" style="background:#f44336;color:#fff;border:0;padding:6px 12px;border-radius:4px;font-size:11px;">🗑️ Xóa rule</button>';
                html += '</div>';
            });
        }
        
        html += '<div style="border-top:1px solid #444;margin-top:10px;padding-top:10px;display:flex;flex-direction:column;gap:5px;">';
        html += '<button id="__zc_clear_site__" style="background:#f44336;color:#fff;border:0;padding:12px;border-radius:6px;font-weight:bold;">🗑️ Xóa hết rules của ' + host + '</button>';
        html += '<button id="__zc_export__" style="background:#FF9800;color:#fff;border:0;padding:12px;border-radius:6px;font-weight:bold;">📤 Export tất cả</button>';
        html += '<button id="__zc_close_manage__" style="background:#666;color:#fff;border:0;padding:12px;border-radius:6px;font-weight:bold;">← Back</button>';
        html += '</div>';
        
        overlay.innerHTML = html;
        document.body.appendChild(overlay);
        
        overlay.querySelectorAll('.__zc_del__').forEach(function(b) {
            b.onclick = function() {
                var sel = decodeURIComponent(this.dataset.sel);
                removeSiteRule(sel);
                overlay.remove();
                var style = document.getElementById('__zapclick_css__');
                if (style) style.remove();
                applyRules();
                document.getElementById('__zc_manage__').click();
            };
        });
        
        document.getElementById('__zc_clear_site__').onclick = function() {
            if (confirm('Xóa hết rules của ' + host + '?')) {
                var allRules = getRules();
                delete allRules[host];
                saveRules(allRules);
                overlay.remove();
                var style = document.getElementById('__zapclick_css__');
                if (style) style.remove();
                var counter = topBar.querySelector('small');
                counter.textContent = host + ' · 0 rules';
                alert('✓ Đã xóa. Reload trang để reset.');
            }
        };
        
        document.getElementById('__zc_export__').onclick = function() {
            var data = getRules();
            var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            var a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = 'zapclick_' + Date.now() + '.json';
            a.click();
        };
        
        document.getElementById('__zc_close_manage__').onclick = function() { overlay.remove(); };
    };
    
    console.log('🎯 ZapClick v2. Rules for', host + ':', getSiteRules().length);
})();