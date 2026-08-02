// ==UserScript==
// @name         Universal Media Player & Downloader
// @namespace    umpdl
// @version      6.7.26
// @description  Tự chạy UMP DL trong trang mẹ và iframe để bắt media.
// @match        *://*/*
// @run-at       document-start
// @grant        unsafeWindow
// @grant        GM_xmlhttpRequest
// @connect      render-header-proxy.onrender.com
// ==/UserScript==
// UMP core is shared with bookmarklet.js and injected into the page world so
// fetch/XHR/MediaSource interception can see the site's real requests.
(function () {
  'use strict';
  var page = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
  if (page.__uvdUserscriptCoreInjected) return;
  var inFrame = page.top !== page.self;
  var source = 'https://render-header-proxy.onrender.com/bookmarklet.js?userscript=1&v=' + Date.now();
  function inject(text) {
    if (page.__uvdUserscriptCoreInjected) return;
    page.__uvdUserscriptCoreInjected = true;
    page.__uvdUserscriptMode = true;
    page.__uvdUserscriptFrameMode = inFrame;
    var tag = page.document.createElement('script');
    tag.type = 'text/javascript';
    tag.text = text || '';
    (page.document.head || page.document.documentElement).appendChild(tag);
    tag.remove();
  }
  function injectRemote() {
    if (page.__uvdUserscriptCoreInjected) return;
    var tag = page.document.createElement('script');
    tag.src = source;
    tag.async = false;
    tag.onload = function () { tag.remove(); };
    tag.onerror = function () {
      try {
        if (typeof GM_xmlhttpRequest === 'function') {
          GM_xmlhttpRequest({ method: 'GET', url: source, onload: function (r) { inject(r.responseText); } });
        }
      } catch (e) {}
      tag.remove();
    };
    (page.document.head || page.document.documentElement).appendChild(tag);
  }
  function hasTarget() {
    try { return !!page.document.querySelector('video,audio,source,iframe'); } catch (e) { return false; }
  }
  if (inFrame || hasTarget()) {
    injectRemote();
  } else {
    var rootNode = page.document.documentElement || page.document;
    var observer = new MutationObserver(function () {
      if (hasTarget()) { observer.disconnect(); injectRemote(); }
    });
    observer.observe(rootNode, { childList: true, subtree: true });
    setTimeout(function () { try { observer.disconnect(); } catch (e) {} }, 120000);
  }
})();
