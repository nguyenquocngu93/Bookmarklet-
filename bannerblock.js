javascript:(function(){
    'use strict';
    
    var removed = 0;
    var hidden = 0;
    
    // ========== 1. XÓA CÁC ELEMENT BANNER PHỔ BIẾN ==========
    var selectors = [
        // Ad related
        '[class*="banner"]:not(header):not(nav):not(main):not(article)',
        '[id*="banner"]:not(header):not(nav):not(main)',
        '[class*="advertisement"]',
        '[class*="advert"]:not([class*="advert-video"])',
        '[id*="advertisement"]',
        '[class*="google-ad"]',
        '[class*="google_ad"]',
        '[id*="google_ads"]',
        '[id*="google-ads"]',
        '[class^="ad-"]',
        '[class$="-ad"]',
        '[class*=" ad-"]',
        '[class*="-ad "]',
        '[id^="ad-"]',
        '[id$="-ad"]',
        '[id^="ads-"]',
        '[id$="-ads"]',
        '[class*="AdSlot"]',
        '[class*="ad-slot"]',
        '[class*="ad_slot"]',
        '[class*="ad-container"]',
        '[class*="ad_container"]',
        '[class*="ad-wrap"]',
        '[class*="ad_wrap"]',
        '[class*="adsbygoogle"]',
        'ins.adsbygoogle',
        'ins[class*="ad"]',
        'iframe[src*="ads"]',
        'iframe[src*="doubleclick"]',
        'iframe[src*="googlesyndication"]',
        'iframe[src*="googleads"]',
        'iframe[id*="google_ads"]',
        
        // Popups & modals
        '[class*="popup"]:not([class*="popupmenu"])',
        '[id*="popup"]',
        '[class*="modal"]:not([class*="modal-content"])',
        '[class*="overlay"]:not([class*="video-overlay"])',
        '[class*="lightbox"]',
        '[class*="dialog"][class*="ad"]',
        '[role="dialog"][class*="ad"]',
        
        // Newsletter & subscription
        '[class*="newsletter"]',
        '[class*="subscribe"][class*="popup"]',
        '[class*="subscription"][class*="popup"]',
        '[class*="email-signup"]',
        '[class*="signup-modal"]',
        '[class*="optin"]',
        '[id*="newsletter-modal"]',
        
        // Cookie notices
        '[class*="cookie-notice"]',
        '[class*="cookie-banner"]',
        '[class*="cookie-consent"]',
        '[class*="cookie-policy"]',
        '[class*="cookie-bar"]',
        '[id*="cookie-notice"]',
        '[id*="cookie-banner"]',
        '[id*="cookieChoiceInfo"]',
        '[id*="cookiebanner"]',
        '#onetrust-banner-sdk',
        '#onetrust-consent-sdk',
        
        // GDPR
        '[class*="gdpr"]',
        '[id*="gdpr"]',
        '[class*="consent-banner"]',
        
        // Floating & sticky
        '[class*="floating-ad"]',
        '[class*="float-ad"]',
        '[class*="sticky-ad"]',
        '[class*="fixed-ad"]',
        '[class*="floating-banner"]',
        
        // App download prompts
        '[class*="app-banner"]',
        '[class*="smart-banner"]',
        '[class*="download-app"]',
        '[class*="app-install"]',
        '[class*="branch-banner"]',
        
        // Notification permission
        '[class*="notification-prompt"]',
        '[class*="push-notification"]',
        '[class*="notification-permission"]',
        
        // Social share bars
        '[class*="share-bar"][class*="floating"]',
        '[class*="social-float"]',
        
        // Chat widgets
        '[class*="intercom-container"]',
        '[class*="drift-widget"]',
        '[class*="zendesk-widget"]',
        '[id*="crisp-chatbox"]',
        '[id*="tawk-chat"]',
        '[class*="chat-widget"][class*="fixed"]',
        
        // Video ads
        '.video-ads',
        '.videoAdUi',
        '.ytp-ad-overlay-container',
        '.ytp-ad-text-overlay',
        
        // Sticky footers
        '[class*="sticky-footer"][class*="ad"]',
        '[class*="fixed-bottom"][class*="ad"]',
        
        // Native ads
        '[class*="sponsored"]',
        '[class*="promoted"]',
        '[data-ad]',
        '[data-ads]',
        '[data-google-ad]',
        
        // Common ad networks
        '[class*="taboola"]',
        '[id*="taboola"]',
        '[class*="outbrain"]',
        '[id*="outbrain"]',
        '[class*="mgid"]',
        '[id*="mgid"]',
        '[class*="revcontent"]',
        '[class*="disqus"][class*="ad"]',
        
        // AMP ads
        'amp-ad',
        'amp-embed',
        'amp-sticky-ad',
        
        // Autoplay video ads
        'video[autoplay][class*="ad"]',
        
        // Backdrop
        '.modal-backdrop',
        '[class*="backdrop"]:not([class*="video-backdrop"])'
    ];
    
    selectors.forEach(function(sel) {
        try {
            document.querySelectorAll(sel).forEach(function(el) {
                if (!isVideoOrImportant(el)) {
                    el.remove();
                    removed++;
                }
            });
        } catch(e) {}
    });
    
    // ========== 2. TÌM ELEMENT CÓ NÚT X (CLOSE BUTTON) ==========
    var closeSelectors = [
        '[class*="close"]',
        '[id*="close"]',
        '[aria-label*="close" i]',
        '[aria-label*="dismiss" i]',
        '[aria-label*="đóng" i]',
        '[title*="close" i]',
        '[title*="đóng" i]',
        'button[class*="dismiss"]',
        '.close-button',
        '.close-btn',
        '.btn-close',
        '.dismiss-button',
        '.modal-close',
        '.popup-close',
        '.banner-close',
        'button:has(> svg[class*="close"])',
        '[data-dismiss]',
        '[data-close]',
        '[data-testid*="close"]'
    ];
    
    // Tìm parent container của nút X → có khả năng là banner/popup
    closeSelectors.forEach(function(sel) {
        try {
            document.querySelectorAll(sel).forEach(function(closeBtn) {
                // Kiểm tra text/icon của nút
                var text = (closeBtn.textContent || '').trim().toLowerCase();
                var isCloseIcon = /^(×|✕|✖|⨉|x|close|đóng)$/i.test(text) || text === '';
                
                if (isCloseIcon || closeBtn.querySelector('svg, [class*="icon"]')) {
                    // Tìm parent container (banner/popup)
                    var parent = findAdContainer(closeBtn);
                    if (parent && !isVideoOrImportant(parent)) {
                        parent.remove();
                        removed++;
                    }
                }
            });
        } catch(e) {}
    });
    
    // ========== 3. XÓA OVERLAY/FIXED POSITION LỚN ==========
    document.querySelectorAll('div, section, aside').forEach(function(el) {
        if (isVideoOrImportant(el)) return;
        if (el.querySelector('video, iframe[src*="player"]')) return;
        
        var style = getComputedStyle(el);
        var rect = el.getBoundingClientRect();
        var zIndex = parseInt(style.zIndex) || 0;
        
        // Fixed/absolute element có z-index cao và kích thước lớn
        var isFixed = style.position === 'fixed' || style.position === 'absolute';
        var isLarge = rect.width > 200 && rect.height > 100;
        var hasHighZ = zIndex > 999;
        var isVisible = style.display !== 'none' && style.visibility !== 'hidden' && parseFloat(style.opacity) > 0;
        
        if (isFixed && isLarge && hasHighZ && isVisible) {
            // Kiểm tra có phải content quan trọng không
            var text = (el.textContent || '').trim();
            var hasCloseBtn = el.querySelector('[class*="close"], [aria-label*="close" i]');
            var isPopupLike = hasCloseBtn || 
                              /subscribe|newsletter|sign.?up|register|advertisement|sponsor|premium|upgrade/i.test(text);
            
            if (isPopupLike || (isLarge && hasHighZ)) {
                el.remove();
                removed++;
            }
        }
    });
    
    // ========== 4. UNLOCK SCROLL ==========
    // Nhiều popup khóa scroll của trang
    document.documentElement.style.overflow = 'auto';
    document.body.style.overflow = 'auto';
    document.body.style.position = 'static';
    document.documentElement.classList.remove('modal-open', 'no-scroll', 'noscroll', 'overflow-hidden', 'popup-open');
    document.body.classList.remove('modal-open', 'no-scroll', 'noscroll', 'overflow-hidden', 'popup-open');
    
    // ========== 5. XÓA CSS BLOCKER ==========
    // Xóa class body chặn scroll
    ['modal-open', 'no-scroll', 'noscroll', 'overflow-hidden', 'popup-open', 'body-lock'].forEach(function(cls) {
        document.body.classList.remove(cls);
        document.documentElement.classList.remove(cls);
    });
    
    // ========== 6. INJECT CSS ẨN MẤY THỨ SÓT LẠI ==========
    var css = `
        [class*="banner"]:not(header):not(nav):not(main):not(article):not([class*="video"]),
        [class*="popup"]:not([class*="menu"]),
        [class*="modal"]:not([class*="content"]),
        [class*="overlay"]:not([class*="video"]),
        [class*="cookie-notice"],
        [class*="newsletter"],
        [class*="subscribe"][class*="popup"],
        [class*="floating-ad"],
        [class*="sticky-ad"],
        [class*="app-banner"],
        .modal-backdrop,
        ins.adsbygoogle,
        [id*="google_ads"],
        [id*="onetrust-banner"],
        amp-ad,
        amp-sticky-ad {
            display: none !important;
            visibility: hidden !important;
            opacity: 0 !important;
            pointer-events: none !important;
        }
        
        html, body {
            overflow: auto !important;
            position: static !important;
        }
        
        body.modal-open,
        body.no-scroll,
        body.noscroll,
        body.overflow-hidden {
            overflow: auto !important;
            position: static !important;
        }
    `;
    
    var style = document.createElement('style');
    style.id = '__anti_banner_css__';
    style.textContent = css;
    document.head.appendChild(style);
    
    // ========== HELPERS ==========
    function isVideoOrImportant(el) {
        if (!el) return true;
        if (el === document.body || el === document.documentElement) return true;
        if (el.tagName === 'VIDEO' || el.tagName === 'AUDIO') return true;
        if (el.tagName === 'IFRAME') {
            var src = el.src || '';
            if (/youtube|vimeo|player|embed|video/i.test(src)) return true;
        }
        if (el.querySelector('video, audio')) return true;
        
        var classId = (el.className + ' ' + el.id).toLowerCase();
        if (/player|video-container|video-wrapper|main-content|article-content|post-content/.test(classId)) return true;
        
        // Header/nav quan trọng
        if (el.tagName === 'HEADER' || el.tagName === 'NAV' || el.tagName === 'MAIN' || el.tagName === 'ARTICLE') return true;
        
        return false;
    }
    
    function findAdContainer(closeBtn) {
        var el = closeBtn.parentElement;
        var depth = 0;
        
        while (el && el !== document.body && depth < 6) {
            var style = getComputedStyle(el);
            var rect = el.getBoundingClientRect();
            var classId = (el.className + ' ' + el.id).toLowerCase();
            
            // Đây là container ads/popup/banner
            if (/popup|modal|banner|overlay|lightbox|notification|prompt|dialog|subscribe|newsletter|cookie|ad-|-ad/i.test(classId)) {
                return el;
            }
            
            // Fixed/absolute container lớn
            if ((style.position === 'fixed' || style.position === 'absolute') && 
                rect.width > 150 && rect.height > 100 &&
                (parseInt(style.zIndex) || 0) > 10) {
                return el;
            }
            
            el = el.parentElement;
            depth++;
        }
        
        return null;
    }
    
    // ========== SETUP OBSERVER (chặn ads mới xuất hiện) ==========
    if (window.__antibanner_observer__) {
        window.__antibanner_observer__.disconnect();
    }
    
    var observer = new MutationObserver(function(mutations) {
        var found = false;
        mutations.forEach(function(m) {
            m.addedNodes.forEach(function(node) {
                if (node.nodeType === 1) {
                    var classId = ((node.className || '') + ' ' + (node.id || '')).toLowerCase();
                    if (/popup|modal|overlay|banner|advertisement|newsletter|cookie|subscribe/i.test(classId)) {
                        if (!isVideoOrImportant(node)) {
                            node.remove();
                            found = true;
                        }
                    }
                }
            });
        });
        if (found) console.log('🛡️ Blocked new banner');
    });
    
    observer.observe(document.body, { childList: true, subtree: true });
    window.__antibanner_observer__ = observer;
    
    // Auto stop sau 5 phút
    setTimeout(function() {
        observer.disconnect();
        console.log('⏹️ Auto-block stopped after 5 min');
    }, 300000);
    
    // ========== NOTIFICATION ==========
    var toast = document.createElement('div');
    toast.innerHTML = 
        '<div style="font-size:24px;margin-bottom:8px;">🧹</div>' +
        '<b>Đã xóa ' + removed + ' banner/ads</b><br>' +
        '<small style="opacity:0.9;">Auto-block trong 5 phút</small>';
    toast.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);background:linear-gradient(135deg,#4CAF50,#2E7D32);color:#fff;padding:15px 25px;border-radius:12px;z-index:2147483647;font:bold 14px Arial;text-align:center;box-shadow:0 5px 20px rgba(0,0,0,0.6);min-width:200px;';
    document.body.appendChild(toast);
    setTimeout(function() { toast.remove(); }, 3000);
    
    console.log('🧹 Anti-Banner completed. Removed:', removed);
})();