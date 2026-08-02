// ==UserScript==
// @name         UMP DL Iframe Bridge
// @namespace    umpdl
// @version      0.1.0
// @description  Bắt link media trong iframe cross-origin và gửi về UMP DL ở trang mẹ.
// @match        *://streamtape.com/*
// @match        *://*.streamtape.com/*
// @match        *://mixdrop.*/*
// @match        *://*.mixdrop.*/*
// @match        *://miixdrop.*/*
// @match        *://*.miixdrop.*/*
// @match        *://vinovo.*/*
// @match        *://*.vinovo.*/*
// @match        *://player.upn.one/*
// @match        *://*.javxxx.me/*
// @match        *://*.upload18.org/*
// @match        *://*/*
// @run-at       document-start
// @grant        none
// ==/UserScript==
(function () {
  'use strict';
  // Chạy capture trong iframe; document chính vẫn do bookmarklet UMP điều khiển.
  if (window.top === window.self) return;

  var seen = new Set();
  var mediaRe = /(?:\.m3u8(?:[?#]|$)|\/m3u8\/|\.mp4(?:[?#]|$)|tapecontent\.net|mxcontent\.net|vincdn\.net)/i;
  var telemetryRe = /(?:jwpltx\.com.*ping\.gif|analytics|beacon|\.gif(?:[?#]|$))/i;

  function send(url, type, source) {
    if (!url || typeof url !== 'string' || /^blob:/i.test(url) || telemetryRe.test(url)) return;
    if (!/^https?:\/\//i.test(url)) return;
    var mediaHint = /(?:m3u8|hls|manifest|playlist|master|stream|media|video|segment)/i.test(url);
    if (!mediaRe.test(url) && !(source === 'performance' && mediaHint)) return;
    try { url = new URL(url, location.href).href; } catch (e) { return; }
    if (seen.has(url)) return;
    seen.add(url);
    try {
      window.top.postMessage({
        type: 'umpdl-iframe-media-found',
        url: url,
        mediaType: /(?:m3u8|\/m3u8\/|hls)/i.test(url) ? 'M3U8' : 'MP4',
        source: source || 'userscript-iframe',
        pageUrl: location.href
      }, '*');
    } catch (e) {}
  }

  function scanMedia() {
    try {
      document.querySelectorAll('video,source,audio').forEach(function (el) {
        send(el.currentSrc || el.src || el.getAttribute('src') || el.getAttribute('data-src'), 'MEDIA', 'media-element');
      });
      performance.getEntriesByType('resource').forEach(function (entry) {
        if (entry && entry.name) send(entry.name, 'RESOURCE', 'performance');
      });
      var html = document.documentElement && document.documentElement.innerHTML || '';
      var matches = html.match(/(?:https?:)?\/\/[^\s"'<>\\]+(?:\.m3u8[^\s"'<>\\]*|\/m3u8\/[^\s"'<>\\]*|\.mp4[^\s"'<>\\]*)/gi) || [];
      matches.forEach(function (url) { send(url.replace(/^\\\//, ''), 'HTML', 'iframe-html'); });
    } catch (e) {}
  }

  function onMediaEvent(event) {
    if (!event.target || !/^(VIDEO|AUDIO|SOURCE)$/.test(event.target.tagName)) return;
    scanMedia();
    setTimeout(scanMedia, 300);
    setTimeout(scanMedia, 1200);
  }
  document.addEventListener('play', onMediaEvent, true);
  document.addEventListener('loadedmetadata', onMediaEvent, true);
  document.addEventListener('canplay', onMediaEvent, true);
  var observer = new MutationObserver(scanMedia);
  var observeRoot = document.documentElement || document;
  observer.observe(observeRoot, { childList: true, subtree: true });
  var timer = setInterval(scanMedia, 1500);
  scanMedia();

  window.addEventListener('message', function (event) {
    if (!event.data || event.data.type !== 'umpdl-iframe-bridge-request') return;
    seen.forEach(function (url) {
      try { window.top.postMessage({ type: 'umpdl-iframe-media-found', url: url, mediaType: /(?:m3u8|\/m3u8\/|hls)/i.test(url) ? 'M3U8' : 'MP4', source: 'userscript-replay', pageUrl: location.href }, '*'); } catch (e) {}
    });
    scanMedia();
  });
  window.top.postMessage({ type: 'umpdl-iframe-bridge-ready', pageUrl: location.href }, '*');
  window.addEventListener('pagehide', function () {
    clearInterval(timer);
    observer.disconnect();
  });
})();
