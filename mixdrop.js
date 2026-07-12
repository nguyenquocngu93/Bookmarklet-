// ==UserScript==
// @name         Block Popups for Mixdrop & Video Hosts
// @namespace    http://tampermonkey.net/
// @version      1.1
// @description  Chặn popup, popunder, fake play button và overlay quảng cáo trên Mixdrop và các trang host video tương tự.
// @author       Qwen
// @match        *://*mixdrop*/*
// @match        *://*miiiixdrop*/*
// @match        *://*dood*.*/*
// @match        *://*streamtape*/*
// @match        *://*filemoon*/*
// @match        *://*upstream*/*
// @grant        none
// @run-at       document-start
// ==/UserScript==

(function() {
    'use strict';

    // --- 1. CHẶN WINDOW.OPEN (Vô hiệu hóa popup trực tiếp) ---
    window.open = function() {
        console.log('[Anti-Popup] Đã chặn window.open()');
        return null;
    };

    // --- 2. CHẶN POPUNDER (Chặn click vào link ẩn) ---
    document.addEventListener('click', function(e) {
        let target = e.target;
        while (target && target !== document.body) {
            if (target.tagName === 'A') {
                const href = target.getAttribute('href');
                const targetAttr = target.getAttribute('target');
                
                // Chặn các link popunder (thường có target="_blank" hoặc href rỗng)
                if (targetAttr === '_blank' || href === 'javascript:void(0)') {
                    e.preventDefault();
                    e.stopPropagation();
                    console.log('[Anti-Popup] Đã chặn click popunder:', href);
                    return false;
                }
            }
            target = target.parentNode;
        }
    }, true); // true để bắt sự kiện ở phase Capture, chặn trước khi script của trang web kịp xử lý

    // --- 3. XÓA CÁC OVERLAY VÀ NÚT BẤM GIẢ MẠO ---
    function removeFakeOverlays() {
        // Xóa các sự kiện onclick gọi window.open
        document.querySelectorAll('[onclick*="window.open"]').forEach(el => {
            el.removeAttribute('onclick');
        });

        // Xóa các nút Play giả mạo (thường là <a target="_blank"><img...></a>)
        document.querySelectorAll('a[target="_blank"]').forEach(el => {
            const rect = el.getBoundingClientRect();
            // Nếu link có kích thước lớn, không có text, và chứa ảnh (nút play giả)
            if (rect.width > 100 && rect.height > 50 && el.innerText.trim() === '' && el.querySelector('img')) {
                console.log('[Anti-Popup] Tách nút Play giả mạo khỏi thẻ <a>');
                // Giữ lại ảnh nhưng xóa thẻ <a> bọc ngoài để nó không thể click mở tab mới
                el.replaceWith(...el.childNodes);
            }
        });

        // Tìm và xóa các div trong suốt (transparent) che phủ toàn màn hình (bẫy popunder)
        document.querySelectorAll('div').forEach(el => {
            const style = window.getComputedStyle(el);
            if (style.position === 'fixed' && parseInt(style.zIndex) > 9999 && 
                el.offsetWidth >= window.innerWidth && el.offsetHeight >= window.innerHeight && 
                (style.backgroundColor === 'transparent' || style.backgroundColor === 'rgba(0, 0, 0, 0)')) {
                el.remove();
            }
        });
    }

    // --- 4. THEO DÕI DOM VÀ XÓA TỰ ĐỘNG ---
    const observer = new MutationObserver(() => {
        removeFakeOverlays();
    });

    if (document.body) {
        observer.observe(document.body, { childList: true, subtree: true });
    } else {
        document.addEventListener('DOMContentLoaded', () => {
            observer.observe(document.body, { childList: true, subtree: true });
            removeFakeOverlays();
        });
    }

    // Chạy định kỳ để dọn dẹp các phần tử được inject bằng AJAX hoặc setTimeout
    setInterval(removeFakeOverlays, 1000);

})();