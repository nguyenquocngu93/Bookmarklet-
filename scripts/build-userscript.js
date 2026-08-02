const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const core = fs.readFileSync(path.join(root, 'umpdl6736-2_vjs10.js'), 'utf8');
const header = `// ==UserScript==
// @name         Universal Media Player & Downloader
// @namespace    umpdl
// @version      6.7.26
// @description  UMP DL chạy trực tiếp trên trang mẹ và tự bắt media trong iframe.
// @match        *://*/*
// @run-at       document-start
// @grant        none
// ==/UserScript==
// Generated from umpdl6736-2_vjs10.js. Do not edit this output directly.
window.__uvdUserscriptMode = true;
window.__uvdUserscriptFrameMode = window.top !== window.self;
`;
const output = header + core;
for (const file of [
  path.join(root, 'userscript', 'umpdl.user.js'),
  path.join(root, 'render-header-proxy', 'userscript', 'umpdl.user.js')
]) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, output);
}
console.log('Built full UMP userscript:', output.length, 'bytes');
