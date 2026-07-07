/**
 * UBlockLite - Import & Apply uBlock filter rules
 * Chỉ hỗ trợ cosmetic filters (##selector)
 */
(function() {
    'use strict';
    
    var STORAGE_KEY = 'ublocklite_filters';
    var STATS_KEY = 'ublocklite_stats';
    
    // ========== FILTER LISTS CÓ SẴN ==========
    var FILTER_LISTS = {
        'easylist': {
            name: 'EasyList (cosmetic only)',
            url: 'https://easylist.to/easylist/easylist.txt',
            desc: 'Chặn ads chính'
        },
        'easylist-cosmetic': {
            name: 'EasyList Cosmetic',
            url: 'https://easylist-downloads.adblockplus.org/easylist_cosmetic_specific.txt',
            desc: 'Cosmetic filters riêng theo site'
        },
        'annoyances': {
            name: 'AdGuard Annoyances',
            url: 'https://filters.adtidy.org/extension/ublock/filters/14.txt',
            desc: 'Chặn popup, notification, widget'
        },
        'cookies': {
            name: 'Cookie Notices',
            url: 'https://filters.adtidy.org/extension/ublock/filters/18.txt',
            desc: 'Ẩn cookie notices'
        },
        'mobile': {
            name: 'AdGuard Mobile',
            url: 'https://filters.adtidy.org/extension/ublock/filters/11.txt',
            desc: 'Filter riêng cho mobile'
        },
        'vietnamese': {
            name: 'ABPVN Vietnamese',
            url: 'https://cdn.jsdelivr.net/gh/abpvn/abpvn@master/filter/abpvn.txt',
            desc: 'Filter cho trang Việt Nam'
        },
        'social': {
            name: 'Fanboy Social',
            url: 'https://easylist.to/easylist/fanboy-social.txt',
            desc: 'Chặn nút social media'
        },
        'annoyances-adguard': {
            name: 'AdGuard Popups',
            url: 'https://filters.adtidy.org/extension/ublock/filters/19.txt',
            desc: 'Chặn popup'
        }
    };
    
    // ========== STORAGE ==========
    function getFilters() {
        try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; }
        catch(e) { return {}; }
    }
    
    function saveFilters(filters) {
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(filters)); }
        catch(e) { console.error('Storage full!'); }
    }
    
    function getStats() {
        try { return JSON.parse(localStorage.getItem(STATS_KEY)) || {}; }
        catch(e) { return {}; }
    }
    
    // ========== PARSE UBLOCK FILTER ==========
    function parseFilters(text, listName) {
        var lines = text.split('\n');
        var generic = [];      // Áp dụng mọi trang: ##.classname
        var specific = {};     // Riêng site: example.com##.classname
        var exceptions = {};   // Loại trừ: example.com#@#.classname
        
        lines.forEach(function(line) {
            line = line.trim();
            
            // Skip comments and empty
            if (!line || line[0] === '!' || line[0] === '[') return;
            
            // Cosmetic filter: ##selector
            var genericMatch = line.match(/^##(.+)$/);
            if (genericMatch) {
                var selector = genericMatch[1].trim();
                if (isValidSelector(selector)) {
                    generic.push(selector);
                }
                return;
            }
            
            // Site-specific: domain.com##selector
            var specificMatch = line.match(/^([^#]+)##(.+)$/);
            if (specificMatch) {
                var domains = specificMatch[1].split(',');
                var selector = specificMatch[2].trim();
                if (isValidSelector(selector)) {
                    domains.forEach(function(d) {
                        d = d.trim();
                        if (!specific[d]) specific[d] = [];
                        specific[d].push(selector);
                    });
                }
                return;
            }
            
            // Exception: domain.com#@#selector
            var exceptionMatch = line.match(/^([^#]+)#@#(.+)$/);
            if (exceptionMatch) {
                var domains = exceptionMatch[1].split(',');
                var selector = exceptionMatch[2].trim();
                domains.forEach(function(d) {
                    d = d.trim();
                    if (!exceptions[d]) exceptions[d] = [];
                    exceptions[d].push(selector);
                });
                return;
            }
            
            // Ignore network filters (||domain.com^, etc.)
        });
        
        return { generic: generic, specific: specific, exceptions: exceptions };
    }
    
    function isValidSelector(sel) {
        // Loại bỏ các selector procedural mà bookmarklet không support
        if (/:has\(|:has-text\(|:matches-css\(|:xpath\(|:style\(|:remove\(|:upward\(|:watch-attr\(/i.test(sel)) return false;
        if (/\+js\(|\+css\(/i.test(sel)) return false;
        if (sel.length > 500) return false;
        
        // Test if selector is valid
        try {
            document.querySelector(sel);
            return true;
        } catch(e) {
            return false;
        }
    }
    
    // ========== APPLY FILTERS ==========
    function applyFilters(parsed) {
        var host = location.hostname.replace(/^www\./, '');
        var applied = 0;
        var css = [];
        
        // Generic filters
        parsed.generic.forEach(function(sel) {
            try {
                var count = document.querySelectorAll(sel).length;
                if (count > 0) {
                    applied += count;
                    css.push(sel);
                }
            } catch(e) {}
        });
        
        // Site-specific
        Object.keys(parsed.specific).forEach(function(domain) {
            var domainClean = domain.replace(/^www\./, '').replace(/^~/, '');
            if (host.indexOf(domainClean) !== -1 || domainClean === '*') {
                parsed.specific[domain].forEach(function(sel) {
                    try {
                        var count = document.querySelectorAll(sel).length;
                        if (count > 0) {
                            applied += count;
                            css.push(sel);
                        }
                    } catch(e) {}
                });
            }
        });
        
        // Inject CSS
        if (css.length > 0) {
            var style = document.getElementById('__ublocklite_css__');
            if (style) style.remove();
            
            style = document.createElement('style');
            style.id = '__ublocklite_css__';
            style.textContent = css.join(',\n') + ' { display: none !important; visibility: hidden !important; }';
            document.head.appendChild(style);
        }
        
        return { applied: applied, cssRules: css.length };
    }
    
    // ========== FETCH FILTER LIST ==========
    function fetchList(url, callback) {
        // Use CORS proxy for filter lists
        var proxies = [
            url,
            'https://api.allorigins.win/raw?url=' + encodeURIComponent(url),
            'https://corsproxy.io/?' + encodeURIComponent(url)
        ];
        
        var idx = 0;
        function tryFetch() {
            if (idx >= proxies.length) {
                callback(null, 'Không thể fetch (CORS)');
                return;
            }
            
            fetch(proxies[idx])
                .then(function(r) {
                    if (!r.ok) throw new Error('HTTP ' + r.status);
                    return r.text();
                })
                .then(function(text) {
                    if (text.length < 100) throw new Error('Empty response');
                    callback(text, null);
                })
                .catch(function(e) {
                    console.warn('Fetch failed:', proxies[idx], e.message);
                    idx++;
                    tryFetch();
                });
        }
        tryFetch();
    }
    
    // ========== UI ==========
    var old = document.getElementById('__ublocklite__');
    if (old) old.remove();
    
    var panel = document.createElement('div');
    panel.id = '__ublocklite__';
    panel.style.cssText = 'position:fixed;top:5px;left:5px;right:5px;bottom:5px;background:#1a1a1a;color:#fff;padding:0;border-radius:12px;z-index:2147483647;font-family:Arial,sans-serif;font-size:13px;overflow:hidden;display:flex;flex-direction:column;box-shadow:0 0 40px rgba(0,0,0,0.9);border:2px solid #ff6b6b;';
    
    // Header
    var header = document.createElement('div');
    header.style.cssText = 'background:linear-gradient(135deg,#ff6b6b,#ee5a52);padding:12px 15px;display:flex;justify-content:space-between;align-items:center;';
    header.innerHTML = '<div><b style="font-size:16px;">🛡️ UBlockLite</b><div style="font-size:11px;opacity:0.9;">Import uBlock filter cho trang này</div></div><button id="__ub_close__" style="background:rgba(0,0,0,0.3);color:#fff;border:0;padding:8px 14px;border-radius:6px;font-weight:bold;font-size:14px;">✕</button>';
    panel.appendChild(header);
    
    // Content
    var content = document.createElement('div');
    content.style.cssText = 'flex:1;overflow-y:auto;padding:12px;';
    
    var stats = getStats();
    var lastRun = stats[location.hostname];
    
    var html = '';
    
    // Info
    html += '<div style="background:#252525;padding:10px;border-radius:8px;margin-bottom:10px;font-size:11px;">';
    html += '<div style="color:#aaa;">🌐 Trang: <b style="color:#ff6b6b;">' + location.hostname + '</b></div>';
    if (lastRun) {
        html += '<div style="color:#aaa;">⏱️ Lần chạy trước: ' + new Date(lastRun.time).toLocaleString() + '</div>';
        html += '<div style="color:#4CAF50;">✓ Đã ẩn: ' + lastRun.applied + ' elements (' + lastRun.rules + ' rules)</div>';
    }
    html += '</div>';
    
    // Quick actions
    html += '<div style="background:#2a2a2a;padding:12px;border-radius:8px;margin-bottom:10px;">';
    html += '<b style="color:#ff6b6b;">⚡ Quick Actions</b>';
    html += '<div style="margin-top:8px;display:grid;grid-template-columns:1fr 1fr;gap:5px;">';
    html += '<button id="__ub_run_saved__" style="background:#4CAF50;color:#fff;border:0;padding:10px;border-radius:5px;font-weight:bold;">▶️ Chạy filter đã lưu</button>';
    html += '<button id="__ub_clear__" style="background:#f44336;color:#fff;border:0;padding:10px;border-radius:5px;font-weight:bold;">🗑️ Xóa CSS đang áp</button>';
    html += '</div></div>';
    
    // Filter lists
    html += '<div style="background:#2a2a2a;padding:12px;border-radius:8px;margin-bottom:10px;">';
    html += '<b style="color:#ff6b6b;">📥 Import Filter List</b>';
    html += '<div style="color:#888;font-size:11px;margin:5px 0 10px;">Chọn 1 hoặc nhiều list để import (lần đầu chỉ nên chọn 1-2 vì có thể lâu)</div>';
    
    var savedFilters = getFilters();
    Object.keys(FILTER_LISTS).forEach(function(key) {
        var list = FILTER_LISTS[key];
        var isSaved = !!savedFilters[key];
        html += '<div style="background:' + (isSaved ? '#1B5E20' : '#1a1a1a') + ';padding:10px;margin:5px 0;border-radius:6px;border-left:3px solid ' + (isSaved ? '#4CAF50' : '#555') + ';">';
        html += '<div style="display:flex;justify-content:space-between;align-items:center;">';
        html += '<div style="flex:1;">';
        html += '<div style="color:#fff;font-weight:bold;font-size:12px;">' + list.name + (isSaved ? ' ✓' : '') + '</div>';
        html += '<div style="color:#aaa;font-size:10px;">' + list.desc + '</div>';
        if (isSaved) {
            html += '<div style="color:#4CAF50;font-size:10px;">📦 ' + (savedFilters[key].generic.length + Object.keys(savedFilters[key].specific).length) + ' rules · ' + new Date(savedFilters[key].date).toLocaleDateString() + '</div>';
        }
        html += '</div>';
        html += '<button class="__ub_import__" data-key="' + key + '" style="background:' + (isSaved ? '#FF9800' : '#2196F3') + ';color:#fff;border:0;padding:8px 12px;border-radius:5px;font-size:11px;font-weight:bold;white-space:nowrap;">' + (isSaved ? '🔄 Update' : '📥 Import') + '</button>';
        html += '</div>';
        html += '</div>';
    });
    
    html += '</div>';
    
    // Custom URL
    html += '<div style="background:#2a2a2a;padding:12px;border-radius:8px;margin-bottom:10px;">';
    html += '<b style="color:#ff6b6b;">🔗 Custom Filter URL</b>';
    html += '<input id="__ub_custom_url__" type="text" placeholder="https://example.com/filter.txt" style="width:100%;background:#111;color:#fff;border:1px solid #555;border-radius:5px;padding:8px;margin-top:8px;font-size:11px;font-family:monospace;box-sizing:border-box;">';
    html += '<button id="__ub_import_custom__" style="background:#9C27B0;color:#fff;border:0;padding:10px;border-radius:5px;font-weight:bold;width:100%;margin-top:5px;">📥 Import từ URL</button>';
    html += '</div>';
    
    // Custom selector
    html += '<div style="background:#2a2a2a;padding:12px;border-radius:8px;margin-bottom:10px;">';
    html += '<b style="color:#ff6b6b;">✏️ Custom CSS Selector</b>';
    html += '<div style="color:#888;font-size:11px;margin:5px 0;">Nhập CSS selector để ẩn (VD: .banner, #popup)</div>';
    html += '<input id="__ub_custom_sel__" type="text" placeholder=".ad-banner, #popup-modal" style="width:100%;background:#111;color:#fff;border:1px solid #555;border-radius:5px;padding:8px;font-size:11px;font-family:monospace;box-sizing:border-box;">';
    html += '<button id="__ub_hide_custom__" style="background:#607D8B;color:#fff;border:0;padding:10px;border-radius:5px;font-weight:bold;width:100%;margin-top:5px;">🙈 Ẩn ngay</button>';
    html += '</div>';
    
    // Stats
    var totalRules = 0;
    Object.keys(savedFilters).forEach(function(k) {
        totalRules += savedFilters[k].generic.length + Object.keys(savedFilters[k].specific).length;
    });
    
    html += '<div style="background:#1a1a1a;padding:10px;border-radius:8px;text-align:center;font-size:11px;color:#aaa;">';
    html += '📊 Đã lưu ' + Object.keys(savedFilters).length + ' filter lists · ' + totalRules + ' rules total';
    html += '</div>';
    
    content.innerHTML = html;
    panel.appendChild(content);
    document.body.appendChild(panel);
    
    // ========== EVENT HANDLERS ==========
    document.getElementById('__ub_close__').onclick = function() { panel.remove(); };
    
    // Import filter list
    document.querySelectorAll('.__ub_import__').forEach(function(btn) {
        btn.onclick = function() {
            var key = this.dataset.key;
            var list = FILTER_LISTS[key];
            var self = this;
            
            self.innerText = '⏳ Loading...';
            self.disabled = true;
            
            fetchList(list.url, function(text, err) {
                if (err) {
                    alert('❌ Lỗi: ' + err + '\n\nCó thể do CORS. Thử dùng proxy hoặc URL khác.');
                    self.innerText = '📥 Import';
                    self.disabled = false;
                    return;
                }
                
                self.innerText = '⚙️ Parsing...';
                setTimeout(function() {
                    var parsed = parseFilters(text, key);
                    parsed.date = Date.now();
                    parsed.listName = list.name;
                    
                    // Save
                    var filters = getFilters();
                    filters[key] = parsed;
                    saveFilters(filters);
                    
                    // Apply immediately
                    var result = applyFilters(parsed);
                    
                    // Save stats
                    var stats = getStats();
                    stats[location.hostname] = { time: Date.now(), applied: result.applied, rules: result.cssRules };
                    localStorage.setItem(STATS_KEY, JSON.stringify(stats));
                    
                    alert('✅ Đã import ' + list.name + '\n\n' +
                          '📦 Total rules: ' + parsed.generic.length + ' generic + ' + Object.keys(parsed.specific).length + ' domains\n' +
                          '🎯 Applied trên trang này: ' + result.cssRules + ' rules, ẩn ' + result.applied + ' elements');
                    
                    // Reload panel
                    panel.remove();
                }, 100);
            });
        };
    });
    
    // Run saved filters
    document.getElementById('__ub_run_saved__').onclick = function() {
        var filters = getFilters();
        if (Object.keys(filters).length === 0) {
            alert('❌ Chưa có filter nào được lưu!\nImport ít nhất 1 filter list trước.');
            return;
        }
        
        var totalApplied = 0;
        var totalRules = 0;
        
        Object.keys(filters).forEach(function(key) {
            var result = applyFilters(filters[key]);
            totalApplied += result.applied;
            totalRules += result.cssRules;
        });
        
        // Save stats
        var stats = getStats();
        stats[location.hostname] = { time: Date.now(), applied: totalApplied, rules: totalRules };
        localStorage.setItem(STATS_KEY, JSON.stringify(stats));
        
        var toast = document.createElement('div');
        toast.innerHTML = '🛡️ <b>Applied ' + totalRules + ' rules</b><br>Ẩn ' + totalApplied + ' elements';
        toast.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);background:#4CAF50;color:#fff;padding:15px 25px;border-radius:10px;z-index:2147483648;font:bold 13px Arial;text-align:center;box-shadow:0 5px 20px rgba(0,0,0,0.5);';
        document.body.appendChild(toast);
        setTimeout(function() { toast.remove(); }, 3000);
    };
    
    // Clear CSS
    document.getElementById('__ub_clear__').onclick = function() {
        var style = document.getElementById('__ublocklite_css__');
        if (style) {
            style.remove();
            alert('✓ Đã xóa CSS đang áp dụng');
        } else {
            alert('❌ Không có CSS nào đang áp');
        }
    };
    
    // Custom URL import
    document.getElementById('__ub_import_custom__').onclick = function() {
        var url = document.getElementById('__ub_custom_url__').value.trim();
        if (!url) { alert('❌ Nhập URL trước'); return; }
        
        this.innerText = '⏳ Loading...';
        var self = this;
        
        fetchList(url, function(text, err) {
            if (err) {
                alert('❌ ' + err);
                self.innerText = '📥 Import từ URL';
                return;
            }
            
            var parsed = parseFilters(text, 'custom');
            parsed.date = Date.now();
            parsed.listName = 'Custom (' + url + ')';
            
            var filters = getFilters();
            filters['custom_' + Date.now()] = parsed;
            saveFilters(filters);
            
            var result = applyFilters(parsed);
            alert('✅ Imported!\n\nRules: ' + parsed.generic.length + '\nApplied: ' + result.cssRules);
            panel.remove();
        });
    };
    
    // Custom selector
    document.getElementById('__ub_hide_custom__').onclick = function() {
        var sel = document.getElementById('__ub_custom_sel__').value.trim();
        if (!sel) { alert('❌ Nhập selector'); return; }
        
        try {
            var count = document.querySelectorAll(sel).length;
            var css = document.getElementById('__ublocklite_custom_css__');
            if (css) css.remove();
            
            css = document.createElement('style');
            css.id = '__ublocklite_custom_css__';
            css.textContent = sel + ' { display: none !important; }';
            document.head.appendChild(css);
            
            alert('✓ Đã ẩn ' + count + ' elements matching: ' + sel);
        } catch(e) {
            alert('❌ Selector không hợp lệ: ' + e.message);
        }
    };
    
    console.log('🛡️ UBlockLite loaded');
})();