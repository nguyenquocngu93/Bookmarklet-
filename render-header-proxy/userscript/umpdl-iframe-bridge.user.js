// ==UserScript==
// @name         UMP DL Iframe Capture
// @namespace    umpdl
// @version      0.2.0
// @description  Tự chạy lõi UMP DL trong iframe để bắt MP4/M3U8 và gửi về trang mẹ.
// @match        *://*/*
// @run-at       document-start
// @grant        none
// ==/UserScript==
(function () {
  'use strict';
  if (window.top === window.self || window.__uvdUserscriptFrameLoader) return;
  window.__uvdUserscriptFrameLoader = true;
  window.__uvdUserscriptFrameMode = true;
  var src = 'https://render-header-proxy.onrender.com/bookmarklet.js?frame=1&v=' + Date.now();
  var script = document.createElement('script');
  script.src = src;
  script.async = false;
  script.onerror = function () {
    // CSP có thể chặn script element; thử tải rồi thực thi trong page context.
    fetch(src, { cache: 'no-store' }).then(function (r) { return r.text(); }).then(function (text) {
      (0, eval)(text);
    }).catch(function (e) { console.error('[UMP DL] Không tải được iframe core', e); });
  };
  (document.head || document.documentElement).appendChild(script);
})();
