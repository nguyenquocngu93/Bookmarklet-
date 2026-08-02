const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const core = fs.readFileSync(path.join(root, 'umpdl6736-2_vjs10.js'), 'utf8');
const packed = Buffer.from(core, 'utf8').toString('base64');
const header = `// ==UserScript==
// @name         Universal Media Player & Downloader
// @namespace    umpdl
// @version      6.7.26
// @description  Tự chạy UMP DL trong trang mẹ và iframe để bắt media.
// @match        *://*/*
// @run-at       document-start
// @grant        GM_addElement
// @grant        unsafeWindow
// ==/UserScript==
// Generated from umpdl6736-2_vjs10.js. Do not edit this output directly.
`;
const wrapper = `(function () {
  'use strict';
  var page = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
  if (page.__uvdUserscriptCoreInjected) return;
  var inFrame = page.top !== page.self;
  var packedCore = ${JSON.stringify(packed)};
  function decodeCore() {
    try { return decodeURIComponent(escape(atob(packedCore))); } catch (e) { return ''; }
  }
  function inject() {
    if (page.__uvdUserscriptCoreInjected) return;
    page.__uvdUserscriptCoreInjected = true;
    page.__uvdUserscriptMode = true;
    page.__uvdUserscriptFrameMode = inFrame;
    var code = decodeCore();
    try {
      if (typeof GM_addElement === 'function') {
        GM_addElement(page.document.documentElement, 'script', { text: code });
        return;
      }
    } catch (e) {}
    var tag = page.document.createElement('script');
    tag.text = code;
    (page.document.head || page.document.documentElement).appendChild(tag);
    tag.remove();
  }
  function hasTarget() {
    try { return !!page.document.querySelector('video,audio,source,iframe'); } catch (e) { return false; }
  }
  if (inFrame || hasTarget()) {
    inject();
  } else {
    var rootNode = page.document.documentElement || page.document;
    var observer = new MutationObserver(function () {
      if (hasTarget()) { observer.disconnect(); inject(); }
    });
    observer.observe(rootNode, { childList: true, subtree: true });
    setTimeout(function () { try { observer.disconnect(); } catch (e) {} }, 120000);
  }
})();
`;
const output = header + wrapper;
for (const file of [
  path.join(root, 'userscript', 'umpdl.user.js'),
  path.join(root, 'render-header-proxy', 'userscript', 'umpdl.user.js')
]) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, output);
}
console.log('Built inline page-context UMP userscript:', output.length, 'bytes');
