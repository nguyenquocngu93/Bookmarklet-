const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const core = fs.readFileSync(path.join(root, 'umpdl6736-2_vjs10.js'), 'utf8');
function makeUserscript(name, description, version, updateUrl) {
  return `// ==UserScript==
// @name         ${name}
// @namespace    umpdl
// @version      ${version}
// @description  ${description}
// @match        *://*/*
// @run-at       document-start
// @grant        none
// @updateURL    ${updateUrl}
// @downloadURL  ${updateUrl}
// ==/UserScript==
// Generated from umpdl6736-2_vjs10.js. Do not edit this output directly.
window.__uvdUserscriptMode = true;
window.__uvdUserscriptFrameMode = window.top !== window.self;
${core}`;
}
const regularUrl = 'https://render-header-proxy.onrender.com/userscript.js';
const tamperUrl = 'https://render-header-proxy.onrender.com/tampermonkey.user.js';
const outputs = [
  [path.join(root, 'userscript', 'umpdl.user.js'), makeUserscript('Universal Media Player & Downloader', 'UMP DL chạy trực tiếp trên trang mẹ và iframe để bắt media.', '6.7.26', regularUrl)],
  [path.join(root, 'userscript', 'umpdl-tampermonkey.user.js'), makeUserscript('UMP DL - Tampermonkey', 'UMP DL chạy trong tất cả iframe phù hợp để bắt M3U8/MP4.', '6.7.26-tm.1', tamperUrl)],
  [path.join(root, 'render-header-proxy', 'userscript', 'umpdl.user.js'), makeUserscript('Universal Media Player & Downloader', 'UMP DL chạy trực tiếp trên trang mẹ và iframe để bắt media.', '6.7.26', regularUrl)],
  [path.join(root, 'render-header-proxy', 'userscript', 'umpdl-tampermonkey.user.js'), makeUserscript('UMP DL - Tampermonkey', 'UMP DL chạy trong tất cả iframe phù hợp để bắt M3U8/MP4.', '6.7.26-tm.1', tamperUrl)]
];
for (const [file, output] of outputs) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, output);
}
console.log('Built UMP userscripts:', outputs.map(([file, output]) => `${path.relative(root, file)} (${output.length} bytes)`).join(', '));
