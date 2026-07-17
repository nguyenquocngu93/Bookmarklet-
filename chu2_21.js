// UMP DL v7.1 – Universal Media Player & Downloader (Optimized + HLS downloader)
// Author: nguyenquocngu91
// Features: detect streams, auto-click, player overlay with full controls, HLS downloader (TS)
(function() {
  'use strict';

  // ========================= CONFIG =========================
  const VERSION = '7.1';
  const STORAGE_KEY = 'uvd_data_v7';
  const HLS_CDN = 'https://cdn.jsdelivr.net/npm/hls.js@0.14.17/dist/hls.min.js';
  const VIDEOJS_CDN = 'https://cdn.jsdelivr.net/npm/@videojs/html/cdn/video.js';

  // ========================= STORAGE =========================
  const Storage = {
    get() {
      try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; }
      catch { return {}; }
    },
    set(data) {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); }
      catch {}
    }
  };

  let data = Storage.get();
  data.favorites = data.favorites || [];
  data.siteProfiles = data.siteProfiles || {};
  data.history = data.history || [];
  data.filterlist = data.filterlist || [];
  data.playbackPositions = data.playbackPositions || {};
  data.clickedButtons = data.clickedButtons || {};
  data.settings = Object.assign({
    defaultSpeed: 1,
    defaultQuality: 'auto',
    dataSaver: false,
    autoFullscreen: false,
    resumePlayback: true,
    volumeBoost: false,
    volumeBoostMax: 200,
    autoNext: false,
    reduceMotion: false,
    blurIntensity: 24,
    transitionSpeed: 0.3,
    transitionEasing: 'ease',
    doubleTapSeconds: 10,
    autoHideControls: true,
    showRemainingTime: true,
    hideDelay: 5,
    maxStoredUrls: 200,
    blockAutoplay: true,
    glowEffects: true,
    effectsIntensity: 55,
    subdlApiKey: ''
  }, data.settings || {});

  // ========================= PROFILES =========================
  const defaultProfiles = {
    'videoplay.us': { referer: 'https://videoplay.us/', userAgent: '' },
    'streamtape.com': { referer: 'https://streamtape.com/', userAgent: '' },
    'ok.ru': { referer: 'https://ok.ru/', userAgent: '' },
    'fembed.com': { referer: 'https://fembed.com/', userAgent: '' },
    'mp4upload.com': { referer: 'https://mp4upload.com/', userAgent: '' }
  };

  const host = location.hostname.replace('www.', '');
  const profile = data.siteProfiles[host] || defaultProfiles[host] || {
    referer: location.origin + '/',
    origin: location.origin,
    userAgent: navigator.userAgent
  };

  const pageInfo = {
    title: (document.title || 'video').replace(/[^\w\s\u00C0-\u1EF9]/g, '').substring(0, 60).trim() || 'video',
    url: location.href,
    host,
    referer: profile.referer,
    origin: location.origin,
    userAgent: profile.userAgent || navigator.userAgent
  };

  // ========================= UTILITIES =========================
  function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function toast(msg, color = '#3b82f6') {
    const el = document.createElement('div');
    el.textContent = msg;
    Object.assign(el.style, {
      position: 'fixed',
      top: '20px',
      left: '50%',
      transform: 'translateX(-50%)',
      background: color,
      color: '#fff',
      padding: '12px 24px',
      borderRadius: '30px',
      zIndex: '2147483649',
      font: '600 13px Segoe UI',
      boxShadow: '0 4px 15px rgba(0,0,0,0.4)',
      animation: 'uvdSlideIn 0.3s ease'
    });
    document.documentElement.appendChild(el);
    setTimeout(() => el.remove(), 2500);
  }

  function copy(text) {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }

  function shareUrl(url) {
    if (navigator.share) {
      navigator.share({ title: pageInfo.title, url }).catch(() => toast('Không thể chia sẻ'));
    } else {
      toast('Thiết bị không hỗ trợ chia sẻ');
    }
  }

  function formatTime(sec) {
    if (!sec || sec < 0) return '00:00';
    sec = Math.floor(sec);
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    if (h > 0) return h + ':' + (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
    return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
  }

  function formatBytes(bytes) {
    if (!bytes || bytes <= 0) return null;
    const units = ['B', 'KB', 'MB', 'GB'];
    let i = 0;
    while (bytes >= 1024 && i < units.length - 1) { bytes /= 1024; i++; }
    return bytes.toFixed(i === 0 ? 0 : 1) + ' ' + units[i];
  }

  // Simple Base64 encoding/decoding (for storing API key)
  function b64Encode(str) { return btoa(encodeURIComponent(str)); }
  function b64Decode(str) { try { return decodeURIComponent(atob(str)); } catch { return ''; } }

  // ========================= AD FILTER =========================
  let compiledFilters = [];
  function compileAdFilters() {
    compiledFilters = [];
    (data.filterlist || []).forEach(raw => {
      const pattern = (raw || '').trim().toLowerCase();
      if (!pattern) return;
      if (pattern.startsWith('regex:')) {
        try { compiledFilters.push({ type: 'regex', re: new RegExp(pattern.slice(6), 'i') }); }
        catch {}
      } else {
        compiledFilters.push({ type: 'plain', value: pattern });
      }
    });
  }
  compileAdFilters();

  function isAdUrl(url) {
    if (!compiledFilters.length) return false;
    const lower = url.toLowerCase();
    for (const f of compiledFilters) {
      if (f.type === 'regex') { if (f.re.test(url)) return true; }
      else if (lower.includes(f.value)) return true;
    }
    return false;
  }

  let adBlockedCount = 0;

  // ========================= URL DETECTION =========================
  const urlMap = new Map(); // key: url, value: { type, source, priority, timestamp }
  const patterns = [
    { re: /https?:\/\/[^\s"'<>()\\]+\.m3u8[^\s"'<>()\\]*/gi, type: 'M3U8', priority: 1 },
    { re: /https?:\/\/[^\s"'<>()\\]+\.mpd[^\s"'<>()\\]*/gi, type: 'MPD', priority: 2 },
    { re: /https?:\/\/[^\s"'<>()\\]+\.mp4[^\s"'<>()\\]*/gi, type: 'MP4', priority: 3 },
    { re: /https?:\/\/[^\s"'<>()\\]+\.webm[^\s"'<>()\\]*/gi, type: 'WEBM', priority: 4 },
    { re: /https?:\/\/[^\s"'<>()\\]+\.mkv[^\s"'<>()\\]*/gi, type: 'MKV', priority: 5 },
    { re: /https?:\/\/[^\s"'<>()\\]+\.flv[^\s"'<>()\\]*/gi, type: 'FLV', priority: 6 },
    { re: /https?:\/\/[^\s"'<>()\\]+\.ts[^\s"'<>()\\]*/gi, type: 'TS', priority: 7 },
    { re: /blob:https?:\/\/[^\s"'<>()\\]+/gi, type: 'BLOB', priority: 8 }
  ];

  function findUrls(text, source) {
    if (!text || typeof text !== 'string') return;
    patterns.forEach(p => {
      const matches = text.match(p.re);
      if (matches) {
        matches.forEach(u => {
          u = u.replace(/\\u002F/g, '/').replace(/\\\//g, '/').replace(/&amp;/g, '&').replace(/\\"/g, '');
          if (isAdUrl(u)) { adBlockedCount++; return; }
          if (!urlMap.has(u) || urlMap.get(u).priority > p.priority) {
            urlMap.set(u, { type: p.type, source, priority: p.priority, timestamp: Date.now() });
          }
        });
      }
    });
    // Limit
    if (urlMap.size > data.settings.maxStoredUrls) {
      const toRemove = urlMap.size - data.settings.maxStoredUrls;
      const keys = [...urlMap.keys()].sort((a, b) => urlMap.get(a).timestamp - urlMap.get(b).timestamp);
      for (let i = 0; i < toRemove; i++) urlMap.delete(keys[i]);
    }
  }

  // Optimized scan: only query specific elements, no outerHTML
  function scanDocument(doc, src) {
    try {
      doc.querySelectorAll('video, source, audio').forEach(v => {
        if (v.src) findUrls(v.src, src + ':element');
        if (v.currentSrc) findUrls(v.currentSrc, src + ':current');
      });
      doc.querySelectorAll('script').forEach(s => {
        findUrls(s.textContent, src + ':script');
      });
      doc.querySelectorAll('iframe').forEach((i, idx) => {
        if (i.src) {
          if (!isAdUrl(i.src)) {
            urlMap.set(i.src, { type: 'IFRAME', source: 'iframe#' + idx, priority: 99, timestamp: Date.now() });
          } else {
            adBlockedCount++;
          }
        }
        try { if (i.contentDocument) scanDocument(i.contentDocument, 'iframe#' + idx); }
        catch {}
      });
    } catch {}
  }

  // ========================= AUTO-CLICK =========================
  const AUTO_PLAY_SELECTORS = [
    '.fluid_initial_play', '.fluid_control_play', '.fluid_initial_play_button',
    '.jw-display-icon-container', '.jw-icon-display', '.jw-icon-playback',
    '.vjs-big-play-button', '.vjs-play-control',
    '.plyr__control--overlaid', '.plyr__control[data-plyr="play"]',
    '.fp-play', '.fp-playbtn', '.flowplayer .fp-ui',
    '.mejs-overlay-play', '.mejs-play > button', '.mejs-overlay-button',
    '.play-button', '.playbtn', '.btn-play', '.video-play-button', '.play-icon',
    '.play-overlay', '.overlay-play', '.video-play', '.player-play-button',
    '.vjs-poster', '.video-thumb-play', '.play-btn-circle',
    '[aria-label="Play"]', '[aria-label="play"]', '[aria-label="Play Video"]',
    '[title="Play"]', '[title="play"]', '[title="Play Video"]',
    'button.play', 'div.play', 'span.play'
  ];

  function simulateClick(el) {
    try {
      const rect = el.getBoundingClientRect();
      if (!rect.width || !rect.height) return false;
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'].forEach(type => {
        let ev;
        try {
          ev = new MouseEvent(type, { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y });
        } catch {
          ev = document.createEvent('MouseEvent');
          ev.initMouseEvent(type, true, true, window, 0, 0, 0, x, y, false, false, false, false, 0, null);
        }
        el.dispatchEvent(ev);
      });
      if (typeof el.click === 'function') el.click();
      return true;
    } catch { return false; }
  }

  // Improved selector generation: prioritize data-* attributes, then id, then class
  function getStableSelector(el) {
    if (!el || !el.tagName) return '';
    const tag = el.tagName.toLowerCase();
    const attrs = ['data-host', 'data-server', 'data-name', 'data-video', 'data-stream'];
    for (const attr of attrs) {
      const val = el.getAttribute(attr);
      if (val) return tag + '[' + attr + '="' + val.trim().substring(0, 40) + '"]';
    }
    if (el.id) return tag + '#' + el.id;
    if (typeof el.className === 'string' && el.className.trim()) {
      const cls = el.className.trim().split(/\s+/).slice(0, 3).join('.');
      if (cls) return tag + '.' + cls;
    }
    const parent = el.parentElement;
    const idx = parent ? Array.prototype.indexOf.call(parent.children, el) : 0;
    return tag + ':nth-child(' + (idx + 1) + ')';
  }

  function getClickedRecord(sel) {
    return (data.clickedButtons[pageInfo.host] && data.clickedButtons[pageInfo.host][sel]) || null;
  }

  function isButtonBlocked(el) {
    const rec = getClickedRecord(getStableSelector(el));
    return !!(rec && rec.blocked);
  }

  function recordClickedButton(el, sel) {
    const host = pageInfo.host;
    data.clickedButtons[host] = data.clickedButtons[host] || {};
    const label = (el.textContent || '').trim().replace(/\s+/g, ' ').substring(0, 60) || sel;
    const rec = data.clickedButtons[host][sel];
    if (rec) {
      rec.count = (rec.count || 0) + 1;
      rec.lastClicked = Date.now();
      if (label) rec.label = label;
    } else {
      data.clickedButtons[host][sel] = { selector: sel, label, count: 1, blocked: false, lastClicked: Date.now() };
    }
    Storage.set(data);
  }

  function autoClickPlay(root = document, depth = 0, allowVideoFallback = false) {
    if (depth > 3) return 0;
    let clicked = 0;
    const customSel = (data.siteProfiles[pageInfo.host] && data.siteProfiles[pageInfo.host].playSelector) || '';
    const selectors = customSel ? [customSel].concat(AUTO_PLAY_SELECTORS) : AUTO_PLAY_SELECTORS;
    const seen = [];
    selectors.forEach(sel => {
      try {
        root.querySelectorAll(sel).forEach(el => {
          if (seen.includes(el)) return;
          seen.push(el);
          if (isButtonBlocked(el)) return;
          if (simulateClick(el)) {
            clicked++;
            recordClickedButton(el, getStableSelector(el));
          }
        });
      } catch {}
    });
    if (allowVideoFallback) {
      try {
        root.querySelectorAll('video').forEach(v => {
          if (v.paused) {
            const wasMuted = v.muted;
            v.muted = true;
            v.__uvdAllow = true;
            const p = v.play();
            if (p && p.then) {
              p.then(() => {
                setTimeout(() => {
                  try { v.pause(); v.currentTime = 0; v.muted = wasMuted; } catch {}
                  v.__uvdAllow = false;
                }, 600);
              }).catch(() => { v.__uvdAllow = false; });
            } else {
              v.__uvdAllow = false;
            }
          }
        });
      } catch {}
    }
    try {
      root.querySelectorAll('iframe').forEach(f => {
        try { if (f.contentDocument) clicked += autoClickPlay(f.contentDocument, depth + 1, allowVideoFallback); }
        catch {}
      });
    } catch {}
    return clicked;
  }

  // Sequential auto-click
  let seqRunning = false;
  function autoClickSequential() {
    if (seqRunning) { toast('Đang thử lần lượt server, chờ chút...'); return; }
    const candidates = [];
    const seen = [];
    const customSel = (data.siteProfiles[pageInfo.host] && data.siteProfiles[pageInfo.host].playSelector) || '';
    const selectors = customSel ? [customSel] : AUTO_PLAY_SELECTORS;
    selectors.forEach(sel => {
      try {
        document.querySelectorAll(sel).forEach(el => {
          if (seen.includes(el)) return;
          seen.push(el);
          if (!isButtonBlocked(el)) candidates.push(el);
        });
      } catch {}
    });
    if (!candidates.length) {
      toast('Không tìm thấy nút server nào (hoặc đều bị chặn)');
      return;
    }
    seqRunning = true;
    let idx = 0;
    const before = urlMap.size;
    toast('🔎 Đang thử lần lượt ' + candidates.length + ' server...');

    function finish(success, sel) {
      seqRunning = false;
      if (success) toast('✅ Tìm ra link qua: ' + sel);
      else toast('❌ Đã thử hết, chưa thấy link mới.');
      if (document.getElementById('__uvd__')) buildUI();
    }

    function tryNext() {
      if (idx >= candidates.length) { finish(false); return; }
      const el = candidates[idx++];
      const sel = getStableSelector(el);
      const beforeThis = urlMap.size;
      if (!simulateClick(el)) { tryNext(); return; }
      recordClickedButton(el, sel);
      setTimeout(() => {
        scanDocument(document, 'seq-autoclick');
        pauseAllPlayingVideos();
        if (urlMap.size > beforeThis) {
          finish(true, sel);
        } else {
          tryNext();
        }
      }, 1800);
    }
    tryNext();
  }

  function pauseAllPlayingVideos(root = document, depth = 0) {
    let count = 0;
    try {
      root.querySelectorAll('video').forEach(v => {
        if (!v.paused) { try { v.pause(); count++; } catch {} }
      });
    } catch {}
    if (depth < 2) {
      try {
        root.querySelectorAll('iframe').forEach(f => {
          try { if (f.contentDocument) count += pauseAllPlayingVideos(f.contentDocument, depth + 1); }
          catch {}
        });
      } catch {}
    }
    return count;
  }

  // ========================= NETWORK MONITOR =========================
  let originalFetch = window.fetch;
  let originalXHROpen = XMLHttpRequest.prototype.open;
  let monitorActive = false;

  function installMonitor() {
    if (monitorActive) return;
    monitorActive = true;
    window.fetch = function(...args) {
      const url = args[0];
      if (typeof url === 'string') {
        if (!isAdUrl(url)) findUrls(url, 'fetch:live');
      } else if (url && url.url) {
        if (!isAdUrl(url.url)) findUrls(url.url, 'fetch:live');
      }
      return originalFetch.apply(this, args);
    };
    XMLHttpRequest.prototype.open = function(method, url) {
      if (url && !isAdUrl(url)) findUrls(url, 'xhr:live');
      return originalXHROpen.apply(this, arguments);
    };
  }

  function stopMonitor() {
    window.fetch = originalFetch;
    XMLHttpRequest.prototype.open = originalXHROpen;
    monitorActive = false;
  }

  // ========================= BLOCK AUTOPLAY =========================
  const nativePlay = HTMLMediaElement.prototype.play;
  function isAllowedMedia(el) {
    return !!(el && (el.__uvdAllow || el.id === '__uvd_player_video__'));
  }
  HTMLMediaElement.prototype.play = function() {
    if (data.settings.blockAutoplay && !isAllowedMedia(this)) {
      setTimeout(() => { try { this.pause(); } catch {} }, 0);
      return Promise.reject(new DOMException('UVD: blocked autoplay', 'NotAllowedError'));
    }
    return nativePlay.apply(this, arguments);
  };

  function neutralizeMedia(el) {
    if (!el || isAllowedMedia(el)) return;
    try {
      el.removeAttribute('autoplay');
      el.autoplay = false;
      if (!el.paused) el.pause();
    } catch {}
  }

  function blockPlayEvent(e) {
    if (!data.settings.blockAutoplay) return;
    const el = e.target;
    if (el && (el.tagName === 'VIDEO' || el.tagName === 'AUDIO') && !isAllowedMedia(el)) {
      try { el.pause(); } catch {}
    }
  }
  document.addEventListener('play', blockPlayEvent, true);

  // MutationObserver for new media elements – only observe body with subtree
  let pendingMediaNodes = [];
  let flushScheduled = false;
  function flushMediaQueue() {
    flushScheduled = false;
    if (!data.settings.blockAutoplay) { pendingMediaNodes = []; return; }
    const nodes = pendingMediaNodes;
    pendingMediaNodes = [];
    for (const node of nodes) {
      if (node.tagName === 'VIDEO' || node.tagName === 'AUDIO') neutralizeMedia(node);
      if (node.querySelectorAll) {
        node.querySelectorAll('video,audio').forEach(neutralizeMedia);
      }
    }
  }
  const autoplayObserver = new MutationObserver(mutations => {
    if (!data.settings.blockAutoplay) return;
    for (const m of mutations) {
      for (const added of m.addedNodes) {
        if (added instanceof Element) pendingMediaNodes.push(added);
      }
    }
    if (pendingMediaNodes.length && !flushScheduled) {
      flushScheduled = true;
      (requestAnimationFrame || setTimeout)(flushMediaQueue, 16);
    }
  });
  autoplayObserver.observe(document.body, { childList: true, subtree: true });

  // Initial cleanup
  document.querySelectorAll('video,audio').forEach(neutralizeMedia);

  // Pause animations when tab hidden
  document.addEventListener('visibilitychange', () => {
    document.documentElement.classList.toggle('uvd-tab-hidden', document.hidden);
  });

  // ========================= HLS DOWNLOADER (TS) =========================
  async function downloadHlsAsTs(manifestUrl) {
    toast('Đang phân tích manifest...');
    try {
      const resp = await fetch(manifestUrl);
      const text = await resp.text();
      const lines = text.split('\n');
      const segments = [];
      let baseUrl = manifestUrl.substring(0, manifestUrl.lastIndexOf('/') + 1);
      let currentDuration = 0;
      for (let line of lines) {
        line = line.trim();
        if (line && !line.startsWith('#')) {
          let url = line;
          if (!url.startsWith('http')) url = baseUrl + url;
          segments.push(url);
        } else if (line.startsWith('#EXTINF:')) {
          const dur = parseFloat(line.replace('#EXTINF:', '').split(',')[0]);
          if (!isNaN(dur)) currentDuration += dur;
        }
      }
      if (!segments.length) { toast('Không tìm thấy segment nào.'); return; }
      toast(`📥 Đang tải ${segments.length} segments (ước tính ${formatTime(currentDuration)})...`);
      const blobParts = [];
      let loaded = 0;
      for (const segUrl of segments) {
        const res = await fetch(segUrl);
        if (!res.ok) throw new Error(`HTTP ${res.status} khi tải segment`);
        const data = await res.arrayBuffer();
        blobParts.push(new Uint8Array(data));
        loaded++;
        if (loaded % 10 === 0 || loaded === segments.length) {
          toast(`Đã tải ${loaded}/${segments.length} segments`);
        }
      }
      const blob = new Blob(blobParts, { type: 'video/MP2T' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = pageInfo.title + '.ts';
      a.click();
      toast(`✅ Tải thành công ${segments.length} segments (${formatBytes(blob.size)}) dạng .ts`);
    } catch (err) {
      toast('Lỗi khi tải HLS: ' + (err.message || ''));
    }
  }

  // ========================= HLS MASTER PARSER =========================
  function parseM3U8Master(url, callback) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    fetch(url, { headers: { 'Referer': pageInfo.referer }, signal: controller.signal })
      .then(r => { clearTimeout(timeout); return r.text(); })
      .then(text => {
        if (!text.includes('#EXT-X-STREAM-INF')) { callback(null); return; }
        const qualities = [];
        const lines = text.split('\n');
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].startsWith('#EXT-X-STREAM-INF')) {
            const info = lines[i];
            const nextLine = (lines[i + 1] || '').trim();
            if (nextLine && !nextLine.startsWith('#')) {
              const resolution = (info.match(/RESOLUTION=(\d+x\d+)/) || [])[1] || 'unknown';
              const bandwidth = parseInt((info.match(/BANDWIDTH=(\d+)/) || [])[1] || 0);
              const codecs = (info.match(/CODECS="([^"]+)"/) || [])[1] || '';
              const quality = resolution.split('x')[1] || bandwidth;
              const qualityLabel = resolution === 'unknown' ? Math.round(bandwidth/1000) + 'kbps' : quality + 'p';
              let streamUrl = nextLine;
              if (!streamUrl.startsWith('http')) {
                const baseUrl = url.substring(0, url.lastIndexOf('/') + 1);
                streamUrl = baseUrl + streamUrl;
              }
              qualities.push({ label: qualityLabel, resolution, bandwidth, codecs, url: streamUrl });
            }
          }
        }
        qualities.sort((a, b) => (parseInt(b.resolution.split('x')[1]) || 0) - (parseInt(a.resolution.split('x')[1]) || 0));
        callback(qualities);
      })
      .catch(e => { clearTimeout(timeout); console.error(e); callback(null); });
  }

  // ========================= PLAYER STATE =========================
  const playerState = {
    overlay: null,
    mini: null,
    video: null,
    hls: null,
    qualities: [],
    currentQuality: 0,
    speed: 1,
    isMinimized: false,
    url: '',
    type: '',
    resolution: '',
    bandwidth: 0,
    _displayedResolution: '',
    onFullscreenChange: null,
    audioCtx: null,
    gainNode: null,
    sourceNode: null,
    sleepTimerId: null,
    sleepEndAt: 0,
    savePosTimer: null,
    wasReduceMotion: false,
    hideTimeout: null,
    controlsVisible: true,
    pinned: false,
    timeMode: 0,
    animationFrame: null,
    videoJsFallback: false
  };

  // ========================= PLAYBACK POSITION =========================
  function savePlaybackPosition(url, video) {
    if (!url || !video || !video.duration || isNaN(video.duration)) return;
    const pct = video.currentTime / video.duration;
    if (pct < 0.02 || pct > 0.95) { delete data.playbackPositions[url]; }
    else {
      data.playbackPositions[url] = { time: video.currentTime, duration: video.duration, updatedAt: Date.now() };
    }
    const keys = Object.keys(data.playbackPositions);
    if (keys.length > 50) {
      keys.sort((a, b) => data.playbackPositions[a].updatedAt - data.playbackPositions[b].updatedAt);
      delete data.playbackPositions[keys[0]];
    }
    Storage.set(data);
  }

  function getPlaybackPosition(url) {
    return data.playbackPositions[url] || null;
  }

  // ========================= SLEEP TIMER =========================
  function clearSleepTimer() {
    if (playerState.sleepTimerId) { clearTimeout(playerState.sleepTimerId); playerState.sleepTimerId = null; }
    playerState.sleepEndAt = 0;
    const el = document.getElementById('__uvd_sleep_label__');
    if (el) el.textContent = '';
  }

  function setSleepTimer(minutes) {
    clearSleepTimer();
    if (!minutes) return;
    playerState.sleepEndAt = Date.now() + minutes * 60000;
    playerState.sleepTimerId = setTimeout(() => {
      if (playerState.video) playerState.video.pause();
      toast('⏰ Hẹn giờ ngủ: đã dừng phát');
      clearSleepTimer();
    }, minutes * 60000);
    toast('⏰ Sẽ dừng sau ' + minutes + ' phút');
  }

  function showSleepMenu() {
    const overlay2 = document.createElement('div');
    Object.assign(overlay2.style, {
      position: 'fixed', inset: '0', background: 'rgba(0,0,0,0.7)',
      zIndex: '2147483649', display: 'flex', alignItems: 'center', justifyContent: 'center'
    });
    const panel = document.createElement('div');
    Object.assign(panel.style, {
      background: 'rgba(20,22,30,0.95)', borderRadius: '16px', padding: '20px',
      minWidth: '250px', maxWidth: '90%', border: '1px solid rgba(255,255,255,0.15)'
    });
    panel.innerHTML = '<div style="color:#fff;font-weight:600;margin-bottom:12px;">⏰ Hẹn giờ ngủ</div>';
    [0, 15, 30, 45, 60].forEach(m => {
      const b = document.createElement('button');
      b.className = 'uvd-btn uvd-btn-sm';
      b.style.cssText = 'width:100%;margin-bottom:6px;text-align:center;';
      b.textContent = m === 0 ? 'Tắt hẹn giờ' : m + ' phút';
      b.onclick = () => { setSleepTimer(m); overlay2.remove(); };
      panel.appendChild(b);
    });
    overlay2.appendChild(panel);
    overlay2.onclick = e => { if (e.target === overlay2) overlay2.remove(); };
    document.documentElement.appendChild(overlay2);
  }

  // ========================= SUBTITLES (SubDL) =========================
  function srtToVtt(text) {
    let body = text.replace(/\r/g, '').replace(/^\uFEFF/, '');
    if (/^WEBVTT/.test(body.trim())) return body;
    body = body.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');
    return 'WEBVTT\n\n' + body;
  }

  function attachSubtitleTrack(video, vttUrl, label) {
    if (!video) return;
    video.querySelectorAll('track[data-uvd-sub="1"]').forEach(t => t.remove());
    const track = document.createElement('track');
    track.setAttribute('data-uvd-sub', '1');
    track.kind = 'subtitles';
    track.label = label || 'Phụ đề';
    track.srclang = 'vi';
    track.src = vttUrl;
    track.default = true;
    video.appendChild(track);
    setTimeout(() => {
      if (video.textTracks && video.textTracks.length) {
        for (let i = 0; i < video.textTracks.length; i++) {
          video.textTracks[i].mode = video.textTracks[i].label === (label || 'Phụ đề') ? 'showing' : 'disabled';
        }
      }
    }, 100);
    toast('✅ Đã bật phụ đề: ' + (label || ''));
  }

  function searchSubDL(query, cb) {
    const apiKey = (data.settings.subdlApiKey || '').trim();
    if (!apiKey) { toast('Chưa có SubDL API Key'); cb([]); return; }
    console.log('[UMP DL] SubDL: tìm "' + query + '"');
    let settled = false;
    const finish = (fn) => { if (settled) return; settled = true; clearTimeout(hardTimeoutId); fn(); };
    const hardTimeoutId = setTimeout(() => {
      finish(() => { toast('SubDL timeout sau 15s'); cb([]); });
    }, 15000);
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 15000);

    fetch('https://api.subdl.com/api/v2/subtitles/search?film_name=' + encodeURIComponent(query) + '&languages=vi,en&unpack=1', {
      headers: { 'Authorization': 'Bearer ' + apiKey },
      signal: controller.signal
    })
    .then(r => {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    })
    .then(json => {
      finish(() => {
        if (json && json.status === false) {
          toast('SubDL: ' + (json.message || 'lỗi'));
          cb([]); return;
        }
        const subs = (json && json.subtitles) || [];
        const flat = [];
        subs.forEach(s => {
          if (s && Array.isArray(s.unpack_files) && s.unpack_files.length) {
            s.unpack_files.forEach(f => {
              flat.push(Object.assign({ release_name: s.release_name || s.name, language: f.language }, f));
            });
          } else if (s) {
            flat.push(s);
          }
        });
        cb(flat);
      });
    })
    .catch(err => {
      finish(() => { toast('Lỗi SubDL: ' + err.message); cb([]); });
    });
  }

  function downloadSubDLFile(item, cb) {
    const apiKey = (data.settings.subdlApiKey || '').trim();
    const directUrl = item.url || item.file_url || item.download_url || (item.files && item.files[0] && item.files[0].url);
    const nId = item.file_n_id || item.nId || item.n_id || item.id;
    let reqPromise;
    if (directUrl) {
      reqPromise = fetch(directUrl.indexOf('http') === 0 ? directUrl : 'https://dl.subdl.com' + directUrl);
    } else if (nId) {
      reqPromise = fetch('https://api.subdl.com/api/v2/subtitles/' + encodeURIComponent(nId) + '/download?format=file', {
        headers: { 'Authorization': 'Bearer ' + apiKey }
      }).then(r => {
        const ct = r.headers.get('content-type') || '';
        return ct.indexOf('application/json') !== -1 ? r.json() : r.text();
      }).then(result => {
        if (typeof result === 'string') return result;
        const link = result && (result.url || result.download_url || result.link);
        if (!link) throw new Error('no-link');
        return fetch(link).then(r2 => r2.text());
      });
    } else {
      toast('Không có file để tải'); if (cb) cb(false); return;
    }
    Promise.resolve(reqPromise)
      .then(res => (typeof res === 'string') ? res : res.text())
      .then(text => {
        if (!text) throw new Error('empty');
        const vtt = srtToVtt(text);
        const blobUrl = URL.createObjectURL(new Blob([vtt], { type: 'text/vtt' }));
        attachSubtitleTrack(playerState.video, blobUrl, 'SubDL');
        if (cb) cb(true);
      })
      .catch(() => { toast('Lỗi tải phụ đề'); if (cb) cb(false); });
  }

  function showSubtitlePanel(video) {
    const overlay2 = document.createElement('div');
    Object.assign(overlay2.style, {
      position: 'fixed', inset: '0', background: 'rgba(0,0,0,0.7)',
      zIndex: '2147483649', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px'
    });
    const panel = document.createElement('div');
    applyEffectsPref(panel);
    Object.assign(panel.style, {
      background: 'rgba(20,22,30,0.96)', borderRadius: '16px', padding: '20px',
      width: '100%', maxWidth: '380px', maxHeight: '85vh', overflowY: 'auto',
      border: '1px solid rgba(255,255,255,0.15)'
    });
    panel.innerHTML = `
      <div style="color:#fff;font-weight:600;margin-bottom:4px;">💬 Phụ đề <span style="font-size:10px;color:var(--gold);font-weight:400;">(thử nghiệm)</span></div>
      <div style="font-size:11px;color:var(--text3);margin-bottom:12px;">Tải file có sẵn hoặc tìm trên SubDL.</div>
      <div style="font-size:12px;color:var(--text2);margin-bottom:6px;">Tải file .srt / .vtt từ máy</div>
      <input type="file" id="__uvd_sub_file__" accept=".srt,.vtt" style="width:100%;color:var(--text2);font-size:12px;margin-bottom:14px;">
      <div style="font-size:12px;color:var(--text2);margin-bottom:6px;">Tìm trên SubDL</div>
      <div style="display:flex;gap:6px;margin-bottom:8px;">
        <input type="text" id="__uvd_sub_query__" placeholder="Tên phim..." value="${escapeHtml(pageInfo.title)}" style="flex:1;padding:9px;background:rgba(0,0,0,0.4);color:#fff;border:1px solid var(--border);border-radius:10px;font-size:12px;">
        <button class="uvd-btn uvd-btn-sm" id="__uvd_sub_search__">Tìm</button>
      </div>
      <div id="__uvd_sub_results__" style="max-height:200px;overflow-y:auto;"></div>
      <details style="margin-top:12px;">
        <summary style="font-size:11px;color:var(--text3);cursor:pointer;">API Key SubDL</summary>
        <input type="text" id="__uvd_sub_apikey__" placeholder="Dán API key cá nhân (subdl.com)" value="${escapeHtml(b64Decode(data.settings.subdlApiKey || ''))}" style="width:100%;margin-top:8px;padding:9px;background:rgba(0,0,0,0.4);color:#fff;border:1px solid var(--border);border-radius:10px;font-size:11px;">
        <div style="font-size:10px;color:var(--text3);margin-top:4px;">Đăng ký free tại subdl.com/panel/api để lấy key (2000 lượt tìm/ngày).</div>
      </details>
      <div class="uvd-grid-2" style="margin-top:14px;">
        <button class="uvd-btn uvd-btn-sm" id="__uvd_sub_off__">Tắt phụ đề</button>
        <button class="uvd-btn uvd-btn-sm" id="__uvd_sub_close__" style="background:var(--btn-danger-bg);">Đóng</button>
      </div>
    `;
    overlay2.appendChild(panel);
    overlay2.onclick = e => { if (e.target === overlay2) overlay2.remove(); };
    document.documentElement.appendChild(overlay2);

    panel.querySelector('#__uvd_sub_file__').onchange = function(e) {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = function() {
        const vtt = srtToVtt(String(reader.result || ''));
        const blobUrl = URL.createObjectURL(new Blob([vtt], { type: 'text/vtt' }));
        attachSubtitleTrack(video, blobUrl, file.name.replace(/\.(srt|vtt)$/i, ''));
        overlay2.remove();
      };
      reader.readAsText(file);
    };

    panel.querySelector('#__uvd_sub_apikey__').onchange = function() {
      data.settings.subdlApiKey = b64Encode(this.value.trim());
      Storage.set(data);
    };

    panel.querySelector('#__uvd_sub_search__').onclick = function() {
      const q = panel.querySelector('#__uvd_sub_query__').value.trim();
      if (!q) return;
      const box = panel.querySelector('#__uvd_sub_results__');
      box.innerHTML = '<div style="font-size:11px;color:var(--text3);padding:8px 0;">Đang tìm...</div>';
      searchSubDL(q, list => {
        if (!list.length) { box.innerHTML = '<div style="font-size:11px;color:var(--text3);padding:8px 0;">Không tìm thấy kết quả.</div>'; return; }
        box.innerHTML = '';
        list.slice(0, 10).forEach(item => {
          const title = item.release_name || item.name || item.film_name || q;
          const lang = item.language || item.lang || '';
          const row = document.createElement('div');
          row.className = 'uvd-card';
          row.style.cssText = 'padding:8px 10px;margin-bottom:6px;cursor:pointer;';
          row.innerHTML = `<div style="font-size:12px;color:#fff;">${escapeHtml(title)}</div><div style="font-size:10px;color:var(--text3);">${escapeHtml(String(lang).toUpperCase())}</div>`;
          row.onclick = function() {
            toast('Đang tải phụ đề...');
            downloadSubDLFile(item, ok => { if (ok) overlay2.remove(); });
          };
          box.appendChild(row);
        });
      });
    };

    panel.querySelector('#__uvd_sub_off__').onclick = function() {
      if (video && video.textTracks) {
        for (let i = 0; i < video.textTracks.length; i++) video.textTracks[i].mode = 'disabled';
      }
      toast('Đã tắt phụ đề');
      overlay2.remove();
    };

    panel.querySelector('#__uvd_sub_close__').onclick = function() { overlay2.remove(); };
  }

  // ========================= VOLUME BOOST =========================
  function enableVolumeBoost(video, percent) {
    try {
      if (!playerState.audioCtx) {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        playerState.audioCtx = new Ctx();
        playerState.sourceNode = playerState.audioCtx.createMediaElementSource(video);
        playerState.gainNode = playerState.audioCtx.createGain();
        playerState.sourceNode.connect(playerState.gainNode);
        playerState.gainNode.connect(playerState.audioCtx.destination);
      }
      if (playerState.audioCtx.state === 'suspended') playerState.audioCtx.resume();
      playerState.gainNode.gain.value = (percent || 100) / 100;
    } catch(e) { toast('Thiết bị không hỗ trợ tăng âm lượng'); }
  }

  function disableVolumeBoost() {
    try { if (playerState.gainNode) playerState.gainNode.gain.value = 1; } catch {}
  }

  // ========================= GESTURE: DOUBLE TAP =========================
  function attachPlayerGestures(wrapper, video) {
    let lastTap = { time: 0, side: null };
    const tapSeconds = data.settings.doubleTapSeconds || 10;

    wrapper.addEventListener('touchend', function(e) {
      const t = e.changedTouches && e.changedTouches[0];
      if (!t) return;
      const rect = wrapper.getBoundingClientRect();
      const side = (t.clientX - rect.left) < rect.width / 2 ? 'left' : 'right';
      const now = Date.now();
      if (lastTap.side === side && (now - lastTap.time) < 300) {
        if (side === 'left') { video.currentTime = Math.max(0, video.currentTime - tapSeconds); showGestureHint('⏪ -' + tapSeconds + 's'); }
        else { video.currentTime = Math.min(video.duration || 1e9, video.currentTime + tapSeconds); showGestureHint('⏩ +' + tapSeconds + 's'); }
        hideGestureHintSoon();
        lastTap.time = 0;
      } else {
        lastTap = { time: now, side: side };
      }
    });
  }

  let gestureHintTimer = null;
  function showGestureHint(text) {
    let el = document.getElementById('__uvd_gesture_hint__');
    if (!el) {
      el = document.createElement('div');
      el.id = '__uvd_gesture_hint__';
      Object.assign(el.style, {
        position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
        background: 'rgba(0,0,0,0.7)', color: '#fff', padding: '10px 18px',
        borderRadius: '12px', fontSize: '14px', fontWeight: '600', zIndex: '5', pointerEvents: 'none'
      });
      const wrapper = document.getElementById('__uvd_video_wrapper__');
      if (wrapper) wrapper.appendChild(el);
    }
    el.textContent = text;
    el.style.opacity = '1';
  }
  function hideGestureHintSoon() {
    clearTimeout(gestureHintTimer);
    gestureHintTimer = setTimeout(() => {
      const el = document.getElementById('__uvd_gesture_hint__');
      if (el) el.style.opacity = '0';
    }, 500);
  }

  // ========================= OVERLAY PLAYER =========================
  function __uvdMountVjs10(wrapper, video) {
    const FALLBACK_MS = 4000;
    let done = false;
    function fallbackToNative() {
      if (done) return;
      done = true;
      if (!video.parentNode) wrapper.appendChild(video);
      video.setAttribute('controls', '');
      playerState.videoJsFallback = true;
    }
    function wrapWithSkin() {
      if (done) return;
      done = true;
      try {
        const player = document.createElement('video-player');
        Object.assign(player.style, { width: '100%', height: '100%', display: 'block' });
        const skin = document.createElement('video-skin');
        Object.assign(skin.style, { width: '100%', height: '100%', display: 'block' });
        if (video.parentNode) video.parentNode.removeChild(video);
        skin.appendChild(video);
        player.appendChild(skin);
        wrapper.appendChild(player);
        playerState.videoJsFallback = false;
      } catch (e) {
        console.error('[UMP DL] Video.js v10 mount error:', e);
        done = false;
        fallbackToNative();
      }
    }
    if (customElements.get('video-player')) { wrapWithSkin(); return; }
    if (!window.__uvdVjs10Loading) {
      window.__uvdVjs10Loading = true;
      const s = document.createElement('script');
      s.type = 'module';
      s.src = VIDEOJS_CDN;
      s.onerror = () => { console.error('[UMP DL] Failed to load Video.js v10'); };
      document.head.appendChild(s);
    }
    const checkStart = Date.now();
    const iv = setInterval(() => {
      if (customElements.get('video-player')) {
        clearInterval(iv);
        wrapWithSkin();
      } else if (Date.now() - checkStart > FALLBACK_MS) {
        clearInterval(iv);
        console.warn('[UMP DL] Video.js v10 not ready, fallback to native');
        fallbackToNative();
      }
    }, 100);
  }

  function showVideoPlayer(url, type) {
    if (playerState.overlay && playerState.url === url) return;
    if (playerState.overlay) closePlayer();
    playerState.url = url;
    playerState.type = type;
    playerState._displayedResolution = '';
    playerState.timeMode = 0;
    playerState.pinned = false;
    pauseAllPlayingVideos();

    playerState.wasReduceMotion = data.settings.reduceMotion;
    if (!data.settings.reduceMotion) {
      data.settings.reduceMotion = true;
      applyMotionPref(document.getElementById('__uvd__'));
    }

    const overlay = document.createElement('div');
    overlay.id = '__uvd_player_overlay__';
    Object.assign(overlay.style, {
      position: 'fixed', inset: '0', background: 'rgba(0,0,0,0.96)',
      zIndex: '2147483648', display: 'flex', flexDirection: 'column',
      animation: 'uvdFadeIn 0.3s ease'
    });
    document.documentElement.appendChild(overlay);
    __uvdIsolateLayer(overlay);
    playerState.overlay = overlay;
    applyEffectsPref(overlay);
    applyMotionPref(overlay);

    // HEADER
    const header = document.createElement('div');
    header.id = '__uvd_player_header__';
    Object.assign(header.style, {
      padding: '10px 16px', background: 'rgba(14,16,22,0.92)',
      display: 'flex', flexDirection: 'column', flexShrink: '0',
      borderBottom: '1px solid rgba(255,255,255,0.2)',
      boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
      transition: 'opacity 0.3s ease'
    });
    const titleRow = document.createElement('div');
    Object.assign(titleRow.style, { display: 'flex', alignItems: 'center', justifyContent: 'space-between' });
    const titleInfo = document.createElement('div');
    titleInfo.className = 'uvd-title-info';
    Object.assign(titleInfo.style, { minWidth: '0', flex: '1' });
    titleInfo.innerHTML = `<div style="font-weight:600;font-size:14px;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">▶ ${escapeHtml(pageInfo.title)}</div><div style="font-size:11px;color:#aaa;margin-top:2px;">${escapeHtml(type)}</div>`;
    titleRow.appendChild(titleInfo);

    const btnGroup = document.createElement('div');
    Object.assign(btnGroup.style, { display: 'flex', gap: '6px', flexShrink: '0' });
    const minVideoBtn = document.createElement('button');
    minVideoBtn.className = 'uvd-btn uvd-btn-sm';
    Object.assign(minVideoBtn.style, { background: 'rgba(255,255,255,0.15)', color: '#fff', fontSize: '12px' });
    minVideoBtn.textContent = '⛶';
    minVideoBtn.onclick = minimizePlayer;
    btnGroup.appendChild(minVideoBtn);
    const closeBtn = document.createElement('button');
    closeBtn.id = '__uvd_player_close__';
    closeBtn.className = 'uvd-btn uvd-btn-sm';
    Object.assign(closeBtn.style, { background: 'var(--btn-danger-bg)', color: '#fff', border: '1px solid var(--btn-danger-border)' });
    closeBtn.textContent = '✕';
    btnGroup.appendChild(closeBtn);
    titleRow.appendChild(btnGroup);
    header.appendChild(titleRow);

    // TOOLBAR
    const toolbar = document.createElement('div');
    toolbar.id = '__uvd_player_toolbar__';
    Object.assign(toolbar.style, { display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '8px', transition: 'opacity 0.3s ease' });

    const qualityBtn = document.createElement('button');
    qualityBtn.className = 'uvd-btn uvd-btn-sm';
    Object.assign(qualityBtn.style, { background: 'var(--btn-bg)', color: '#fff', fontSize: '12px' });
    qualityBtn.textContent = 'Chất lượng';
    qualityBtn.onclick = function() {
      if (playerState.qualities.length > 0) showQualitySubMenu();
      else toast('Không có chất lượng để chọn');
    };
    toolbar.appendChild(qualityBtn);

    const speedLabel = document.createElement('span');
    speedLabel.className = 'uvd-btn uvd-btn-sm';
    Object.assign(speedLabel.style, { background: 'var(--btn-bg)', color: '#fff', fontSize: '12px', padding: '7px 6px' });
    speedLabel.textContent = '1x';
    speedLabel.id = '__uvd_speed_label__';
    toolbar.appendChild(speedLabel);

    const speedDecBtn = document.createElement('button');
    speedDecBtn.className = 'uvd-btn uvd-btn-sm';
    Object.assign(speedDecBtn.style, { background: 'var(--btn-bg)', color: '#fff', fontSize: '12px', padding: '7px 8px' });
    speedDecBtn.textContent = '−';
    speedDecBtn.onclick = function() {
      const video = playerState.video;
      if (!video) return;
      const rates = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
      const cur = video.playbackRate;
      const idx = rates.indexOf(cur);
      if (idx > 0) video.playbackRate = rates[idx - 1];
      else video.playbackRate = 0.25;
      speedLabel.textContent = video.playbackRate + 'x';
      toast('Tốc độ: ' + video.playbackRate + 'x');
      resetHideTimer();
    };
    toolbar.appendChild(speedDecBtn);

    const speedIncBtn = document.createElement('button');
    speedIncBtn.className = 'uvd-btn uvd-btn-sm';
    Object.assign(speedIncBtn.style, { background: 'var(--btn-bg)', color: '#fff', fontSize: '12px', padding: '7px 8px' });
    speedIncBtn.textContent = '+';
    speedIncBtn.onclick = function() {
      const video = playerState.video;
      if (!video) return;
      const rates = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
      const cur = video.playbackRate;
      const idx = rates.indexOf(cur);
      if (idx < rates.length - 1) video.playbackRate = rates[idx + 1];
      else video.playbackRate = 2;
      speedLabel.textContent = video.playbackRate + 'x';
      toast('Tốc độ: ' + video.playbackRate + 'x');
      resetHideTimer();
    };
    toolbar.appendChild(speedIncBtn);

    const fsBtn = document.createElement('button');
    fsBtn.className = 'uvd-btn uvd-btn-sm';
    Object.assign(fsBtn.style, { background: 'var(--btn-bg)', color: '#fff', fontSize: '12px' });
    fsBtn.textContent = 'Toàn màn hình';
    fsBtn.onclick = function() {
      const videoWrapper = document.getElementById('__uvd_video_wrapper__');
      const fs = videoWrapper.requestFullscreen || videoWrapper.webkitRequestFullscreen || videoWrapper.mozRequestFullScreen || videoWrapper.msRequestFullscreen;
      if (fs) fs.call(videoWrapper);
    };
    toolbar.appendChild(fsBtn);

    if (document.pictureInPictureEnabled) {
      const pipBtn = document.createElement('button');
      pipBtn.className = 'uvd-btn uvd-btn-sm';
      Object.assign(pipBtn.style, { background: 'var(--btn-bg)', color: '#fff', fontSize: '12px' });
      pipBtn.textContent = 'PiP';
      pipBtn.onclick = function() {
        const v = playerState.video;
        if (!v) return;
        if (document.pictureInPictureElement) document.exitPictureInPicture().catch(()=>{});
        else v.requestPictureInPicture().catch(() => toast('Không hỗ trợ PiP'));
      };
      toolbar.appendChild(pipBtn);
    }

    const sleepBtn = document.createElement('button');
    sleepBtn.className = 'uvd-btn uvd-btn-sm';
    Object.assign(sleepBtn.style, { background: 'var(--btn-bg)', color: '#fff', fontSize: '12px' });
    sleepBtn.textContent = '⏰ Hẹn giờ';
    sleepBtn.onclick = showSleepMenu;
    toolbar.appendChild(sleepBtn);

    const boostBtn = document.createElement('button');
    boostBtn.className = 'uvd-btn uvd-btn-sm';
    boostBtn.id = '__uvd_boost_btn__';
    Object.assign(boostBtn.style, { background: data.settings.volumeBoost ? 'var(--btn-gold-bg)' : 'var(--btn-bg)', color: '#fff', fontSize: '12px' });
    boostBtn.textContent = '🔊 Boost';
    boostBtn.onclick = function() {
      data.settings.volumeBoost = !data.settings.volumeBoost;
      Storage.set(data);
      if (data.settings.volumeBoost) { enableVolumeBoost(video, data.settings.volumeBoostMax); toast('Đã bật tăng âm lượng ' + data.settings.volumeBoostMax + '%'); }
      else { disableVolumeBoost(); toast('Đã tắt tăng âm lượng'); }
      boostBtn.style.background = data.settings.volumeBoost ? 'var(--btn-gold-bg)' : 'var(--btn-bg)';
    };
    toolbar.appendChild(boostBtn);

    const muteBtn = document.createElement('button');
    muteBtn.className = 'uvd-btn uvd-btn-sm';
    muteBtn.id = '__uvd_mute_btn__';
    Object.assign(muteBtn.style, { background: 'var(--btn-bg)', color: '#fff', fontSize: '12px' });
    muteBtn.textContent = '🔇 Mute';
    let isMuted = false;
    muteBtn.onclick = function() {
      if (!playerState.video) return;
      isMuted = !isMuted;
      playerState.video.muted = isMuted;
      muteBtn.textContent = isMuted ? '🔊 Bật tiếng' : '🔇 Mute';
      toast(isMuted ? 'Đã tắt tiếng' : 'Đã bật tiếng');
    };
    toolbar.appendChild(muteBtn);

    const autoNextBtn = document.createElement('button');
    autoNextBtn.className = 'uvd-btn uvd-btn-sm';
    autoNextBtn.id = '__uvd_autonext_btn__';
    Object.assign(autoNextBtn.style, { background: data.settings.autoNext ? 'var(--btn-accent-bg)' : 'var(--btn-bg)', color: '#fff', fontSize: '12px' });
    autoNextBtn.textContent = '⏭ Tự động phát tiếp';
    autoNextBtn.onclick = function() {
      data.settings.autoNext = !data.settings.autoNext;
      Storage.set(data);
      autoNextBtn.style.background = data.settings.autoNext ? 'var(--btn-accent-bg)' : 'var(--btn-bg)';
      toast(data.settings.autoNext ? 'Sẽ tự động phát stream tiếp theo' : 'Đã tắt tự động phát tiếp');
    };
    toolbar.appendChild(autoNextBtn);

    const pinBtn = document.createElement('button');
    pinBtn.className = 'uvd-btn uvd-btn-sm';
    pinBtn.id = '__uvd_pin_btn__';
    Object.assign(pinBtn.style, { background: 'var(--btn-bg)', color: '#fff', fontSize: '12px' });
    pinBtn.textContent = '📌';
    pinBtn.title = 'Ghim thanh điều khiển (không tự ẩn)';
    pinBtn.onclick = function() {
      playerState.pinned = !playerState.pinned;
      pinBtn.style.background = playerState.pinned ? 'var(--btn-accent-bg)' : 'var(--btn-bg)';
      toast(playerState.pinned ? 'Đã ghim controls' : 'Bỏ ghim controls');
      if (playerState.pinned) {
        header.style.opacity = '1';
        toolbar.style.opacity = '1';
        footer.style.opacity = '1';
        playerState.controlsVisible = true;
        clearTimeout(playerState.hideTimeout);
      } else {
        resetHideTimer();
      }
    };
    toolbar.appendChild(pinBtn);

    const screenshotBtn = document.createElement('button');
    screenshotBtn.className = 'uvd-btn uvd-btn-sm';
    Object.assign(screenshotBtn.style, { background: 'var(--btn-bg)', color: '#fff', fontSize: '12px' });
    screenshotBtn.textContent = '📷 Screenshot';
    screenshotBtn.onclick = function() {
      const v = playerState.video;
      if (!v || !v.videoWidth) { toast('Chưa có video'); return; }
      const canvas = document.createElement('canvas');
      canvas.width = v.videoWidth;
      canvas.height = v.videoHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
      const link = document.createElement('a');
      link.download = pageInfo.title + '_screenshot.png';
      link.href = canvas.toDataURL('image/png');
      link.click();
      const flash = document.createElement('div');
      Object.assign(flash.style, {
        position: 'absolute', inset: '0', background: '#fff', opacity: '0.6',
        zIndex: '10', pointerEvents: 'none', transition: 'opacity 0.2s'
      });
      const wrapper = document.getElementById('__uvd_video_wrapper__');
      if (wrapper) wrapper.appendChild(flash);
      setTimeout(() => { flash.style.opacity = '0'; }, 100);
      setTimeout(() => { if (flash.parentNode) flash.remove(); }, 400);
      toast('Đã chụp ảnh màn hình');
    };
    toolbar.appendChild(screenshotBtn);

    const subtitleBtn = document.createElement('button');
    subtitleBtn.className = 'uvd-btn uvd-btn-sm';
    Object.assign(subtitleBtn.style, { background: 'var(--btn-bg)', color: '#fff', fontSize: '12px' });
    subtitleBtn.textContent = '💬 Phụ đề';
    subtitleBtn.title = 'Phụ đề (thử nghiệm)';
    subtitleBtn.onclick = function() { showSubtitlePanel(playerState.video); };
    toolbar.appendChild(subtitleBtn);

    if (type === 'MP4' || type === 'MKV' || type === 'WEBM') {
      const downloadBtn = document.createElement('button');
      downloadBtn.className = 'uvd-btn uvd-btn-sm';
      Object.assign(downloadBtn.style, { background: 'var(--btn-success-bg)', color: '#fff', fontSize: '12px', border: '1px solid var(--btn-success-border)' });
      downloadBtn.textContent = 'Tải xuống';
      downloadBtn.onclick = function() {
        const a = document.createElement('a');
        a.href = url;
        a.download = pageInfo.title + '.' + type.toLowerCase();
        document.body.appendChild(a);
        a.click();
        a.remove();
        toast('Đang tải xuống...');
      };
      toolbar.appendChild(downloadBtn);
    }
    if (type === 'M3U8' || type === 'MPD') {
      const shareBtn = document.createElement('button');
      shareBtn.className = 'uvd-btn uvd-btn-sm';
      Object.assign(shareBtn.style, { background: 'var(--btn-purple-bg)', color: '#fff', fontSize: '12px' });
      shareBtn.textContent = 'Chia sẻ';
      shareBtn.onclick = function() { shareUrl(url); };
      toolbar.appendChild(shareBtn);
    }

    header.appendChild(toolbar);
    overlay.appendChild(header);

    // VIDEO WRAPPER
    const videoWrapper = document.createElement('div');
    videoWrapper.id = '__uvd_video_wrapper__';
    Object.assign(videoWrapper.style, {
      flex: '1', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: '#000', position: 'relative', overflow: 'hidden'
    });
    const video = document.createElement('video');
    video.id = '__uvd_player_video__';
    Object.assign(video.style, {
      maxWidth: '100%', maxHeight: '100%', width: '100%', height: '100%',
      display: 'block', objectFit: 'contain'
    });
    video.setAttribute('playsinline', '');
    video.setAttribute('webkit-playsinline', '');
    video.setAttribute('crossorigin', 'anonymous');
    videoWrapper.appendChild(video);
    overlay.appendChild(videoWrapper);
    playerState.video = video;
    __uvdMountVjs10(videoWrapper, video);

    // FOOTER
    const footer = document.createElement('div');
    footer.id = '__uvd_player_footer__';
    Object.assign(footer.style, {
      padding: '8px 16px', background: 'rgba(0,0,0,0.7)',
      borderTop: '1px solid var(--btn-bg)', fontSize: '12px', color: '#aaa',
      display: 'flex', justifyContent: 'space-between', flexShrink: '0',
      transition: 'opacity 0.3s ease'
    });
    footer.innerHTML = `<span id="__uvd_player_status__">Đang tải...</span><span id="__uvd_player_size__" style="color:#8ab4ff;">Đang ước tính dung lượng...</span><span id="__uvd_player_time__" style="cursor:pointer;">00:00</span>`;
    overlay.appendChild(footer);

    // ===== AUTO-HIDE CONTROLS =====
    function resetHideTimer() {
      if (playerState.pinned || !data.settings.autoHideControls) {
        header.style.opacity = '1';
        toolbar.style.opacity = '1';
        footer.style.opacity = '1';
        playerState.controlsVisible = true;
        clearTimeout(playerState.hideTimeout);
        return;
      }
      clearTimeout(playerState.hideTimeout);
      header.style.opacity = '1';
      toolbar.style.opacity = '1';
      footer.style.opacity = '1';
      playerState.controlsVisible = true;
      const delay = (data.settings.hideDelay || 5) * 1000;
      playerState.hideTimeout = setTimeout(() => {
        if (video.paused || playerState.pinned) return;
        header.style.opacity = '0';
        toolbar.style.opacity = '0';
        footer.style.opacity = '0.3';
        playerState.controlsVisible = false;
      }, delay);
    }

    videoWrapper.addEventListener('click', resetHideTimer);
    videoWrapper.addEventListener('touchstart', resetHideTimer);
    video.addEventListener('play', resetHideTimer);
    video.addEventListener('playing', resetHideTimer);
    video.addEventListener('pause', function() {
      clearTimeout(playerState.hideTimeout);
      header.style.opacity = '1';
      toolbar.style.opacity = '1';
      footer.style.opacity = '1';
      playerState.controlsVisible = true;
    });
    video.addEventListener('ended', function() {
      clearTimeout(playerState.hideTimeout);
      header.style.opacity = '1';
      toolbar.style.opacity = '1';
      footer.style.opacity = '1';
      playerState.controlsVisible = true;
    });
    toolbar.addEventListener('click', resetHideTimer);
    header.addEventListener('click', resetHideTimer);

    // ===== TIME DISPLAY =====
    const timeEl = document.getElementById('__uvd_player_time__');
    function updateTimeDisplay() {
      const t = video.currentTime || 0;
      const d = video.duration || 0;
      if (!d) { timeEl.textContent = '00:00'; return; }
      const remaining = d - t;
      const elapsed = t;
      const total = d;
      let text = '';
      const mode = playerState.timeMode;
      if (data.settings.showRemainingTime && mode === 0) {
        text = '-' + formatTime(remaining);
      } else if (mode === 1) {
        text = formatTime(elapsed);
      } else {
        text = formatTime(elapsed) + ' / ' + formatTime(total);
      }
      const icon = mode === 0 ? ' ⏳' : (mode === 1 ? ' ▶' : ' 📋');
      timeEl.textContent = text + icon;
    }

    timeEl.addEventListener('click', function() {
      playerState.timeMode = (playerState.timeMode + 1) % 3;
      updateTimeDisplay();
      const modes = ['còn lại', 'đã qua', 'tổng'];
      toast('Chế độ: ' + modes[playerState.timeMode]);
      resetHideTimer();
    });

    let rafId = null;
    function scheduleTimeUpdate() {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        updateTimeDisplay();
        rafId = null;
      });
    }
    video.addEventListener('timeupdate', scheduleTimeUpdate);
    video.addEventListener('loadedmetadata', function() {
      updateTimeDisplay();
      const label = document.getElementById('__uvd_speed_label__');
      if (label) label.textContent = video.playbackRate + 'x';
      resetHideTimer();
    });
    video.addEventListener('ratechange', function() {
      const label = document.getElementById('__uvd_speed_label__');
      if (label) label.textContent = video.playbackRate + 'x';
    });

    // ===== MENU HELPERS =====
    function createMenuPanel(title, options, callback) {
      const overlay2 = document.createElement('div');
      Object.assign(overlay2.style, {
        position: 'fixed', inset: '0', background: 'rgba(0,0,0,0.7)',
        zIndex: '2147483649', display: 'flex', alignItems: 'center', justifyContent: 'center'
      });
      const panel = document.createElement('div');
      Object.assign(panel.style, {
        background: 'rgba(20,22,30,0.95)', borderRadius: '16px', padding: '20px',
        minWidth: '250px', maxWidth: '90%', border: '1px solid rgba(255,255,255,0.15)'
      });
      panel.innerHTML = `<div style="color:#fff;font-weight:600;margin-bottom:12px;">${escapeHtml(title)}</div>`;
      const content = document.createElement('div');
      Object.assign(content.style, { maxHeight: '60vh', overflowY: 'auto' });
      options.forEach(opt => {
        const btn = document.createElement('button');
        btn.className = 'uvd-btn uvd-btn-sm';
        btn.style.cssText = 'width:100%;margin-bottom:6px;text-align:center;';
        btn.textContent = opt.label;
        btn.onclick = function() {
          callback(opt.value);
          overlay2.remove();
          resetHideTimer();
        };
        content.appendChild(btn);
      });
      panel.appendChild(content);
      const closeBtn = document.createElement('button');
      closeBtn.textContent = 'Đóng';
      closeBtn.className = 'uvd-btn uvd-btn-sm';
      closeBtn.style.cssText = 'width:100%;margin-top:10px;background:var(--danger);';
      closeBtn.onclick = function() { overlay2.remove(); resetHideTimer(); };
      panel.appendChild(closeBtn);
      overlay2.appendChild(panel);
      document.documentElement.appendChild(overlay2);
    }

    function showQualitySubMenu() {
      const qualities = playerState.qualities;
      if (!qualities.length) { toast('Không có chất lượng'); return; }
      const opts = qualities.map((q, idx) => ({
        label: q.label + (q.resolution !== 'unknown' ? ' (' + q.resolution + ')' : ''),
        value: idx
      }));
      // Thêm nút tải TS nếu là HLS
      if (playerState.type === 'M3U8') {
        opts.push({ label: '⬇ Tải TS (toàn bộ)', value: 'download_ts' });
      }
      createMenuPanel('Chọn chất lượng', opts, function(idx) {
        if (idx === 'download_ts') {
          // Tải TS từ manifest hiện tại
          downloadHlsAsTs(playerState.url);
          return;
        }
        const q = qualities[idx];
        if (q && playerState.hls) {
          const levels = playerState.hls.levels;
          for (let i = 0; i < levels.length; i++) {
            if (levels[i].height === parseInt(q.resolution.split('x')[1]) || levels[i].bitrate === q.bandwidth) {
              playerState.hls.currentLevel = i;
              break;
            }
          }
          toast('Chuyển sang ' + q.label);
        }
      });
    }

    // ===== PLAY VIDEO =====
    function updateTitleDisplay() {
      const infoDiv = document.querySelector('#__uvd_player_overlay__ .uvd-title-info');
      if (!infoDiv) return;
      let currentRes = '';
      if (video && video.videoWidth && video.videoHeight) {
        currentRes = video.videoWidth + 'x' + video.videoHeight;
      } else if (playerState.resolution) {
        currentRes = playerState.resolution;
      }
      if (playerState._displayedResolution !== currentRes) {
        playerState._displayedResolution = currentRes;
        const sub = playerState.type + (currentRes ? ' · ' + currentRes : '');
        infoDiv.innerHTML = `<div style="font-weight:600;font-size:14px;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">▶ ${escapeHtml(pageInfo.title)}</div><div style="font-size:11px;color:#aaa;margin-top:2px;">${escapeHtml(sub)}</div>`;
      }
    }

    function updateSizeEstimate() {
      const el = document.getElementById('__uvd_player_size__');
      if (!el) return;
      if (playerState.hls && playerState.hls.levels) {
        const lvl = playerState.hls.levels[playerState.hls.currentLevel];
        const bw = lvl ? lvl.bitrate : playerState.bandwidth;
        if (bw && video.duration) {
          const bytes = (bw / 8) * video.duration;
          const s = formatBytes(bytes);
          el.textContent = s ? '≈ ' + s : 'Không rõ dung lượng';
        } else {
          el.textContent = 'Đang ước tính dung lượng...';
        }
      } else {
        fetch(url, { method: 'HEAD', headers: { 'Referer': pageInfo.referer } })
          .then(r => {
            const len = r.headers.get('content-length');
            const s = len ? formatBytes(parseInt(len)) : null;
            el.textContent = s ? '≈ ' + s : 'Không rõ dung lượng';
          })
          .catch(() => { el.textContent = 'Không rõ dung lượng'; });
      }
    }

    const statusEl = document.getElementById('__uvd_player_status__');
    video.addEventListener('waiting', () => { if (statusEl) statusEl.textContent = '• Đang buffering...'; });
    video.addEventListener('playing', () => { if (statusEl) statusEl.textContent = '• Đang phát'; });
    video.addEventListener('ended', () => { if (statusEl) statusEl.textContent = '• Đã kết thúc'; });
    video.addEventListener('pause', () => { if (statusEl && !video.ended) statusEl.textContent = '• Tạm dừng'; });

    function onMetadataLoaded() {
      if (statusEl) statusEl.textContent = '• Đang phát';
      if (video.videoWidth && video.videoHeight && !playerState.resolution) {
        playerState.resolution = video.videoWidth + 'x' + video.videoHeight;
      }
      updateTitleDisplay();
      updateSizeEstimate();
      if (playerState.hls && playerState.qualities.length === 0) {
        parseM3U8Master(url, function(qualities) {
          if (qualities && qualities.length > 0) {
            playerState.qualities = qualities;
            updateSizeEstimate();
          }
        });
      }

      if (data.settings.defaultSpeed && data.settings.defaultSpeed !== 1) {
        video.playbackRate = data.settings.defaultSpeed;
      }

      if (data.settings.autoFullscreen && !document.fullscreenElement) {
        const vw = document.getElementById('__uvd_video_wrapper__');
        const fsReq = vw && (vw.requestFullscreen || vw.webkitRequestFullscreen);
        if (fsReq) fsReq.call(vw).catch(()=>{});
      }

      if (data.settings.volumeBoost) enableVolumeBoost(video, data.settings.volumeBoostMax);

      if (data.settings.resumePlayback) {
        const pos = getPlaybackPosition(url);
        if (pos && pos.time > 3) {
          video.currentTime = pos.time;
          toast('▶ Tiếp tục từ ' + formatTime(pos.time));
        }
      }
      resetHideTimer();
      const label = document.getElementById('__uvd_speed_label__');
      if (label) label.textContent = video.playbackRate + 'x';
    }

    video.addEventListener('loadedmetadata', onMetadataLoaded);
    video.addEventListener('durationchange', updateSizeEstimate);
    let lastPosSave = 0;
    video.addEventListener('timeupdate', function() {
      if (data.settings.resumePlayback && Date.now() - lastPosSave > 5000) {
        lastPosSave = Date.now();
        savePlaybackPosition(url, video);
      }
      updateTitleDisplay();
    });
    video.addEventListener('ended', function() {
      if (data.settings.resumePlayback) { delete data.playbackPositions[url]; Storage.set(data); }
      if (data.settings.autoNext) {
        const nextUrl = getNextStreamUrl(url);
        if (nextUrl) { toast('⏭ Đang phát stream tiếp theo...'); setTimeout(() => showVideoPlayer(nextUrl.url, nextUrl.type), 800); }
      }
    });

    function getNextStreamUrl(currentUrl) {
      const list = [...urlMap.entries()]
        .filter(e => e[1].type !== 'IFRAME')
        .map(e => ({ url: e[0], type: e[1].type, priority: e[1].priority }))
        .sort((a, b) => a.priority - b.priority);
      const idx = list.findIndex(i => i.url === currentUrl);
      if (idx === -1 || idx + 1 >= list.length) return null;
      return list[idx + 1];
    }

    const isHls = url.includes('.m3u8') || url.includes('m3u8');
    let activeHls = null;

    if (isHls) {
      if (window.Hls && Hls.isSupported()) {
        activeHls = new Hls();
        activeHls.loadSource(url);
        activeHls.attachMedia(video);
        activeHls.on(Hls.Events.MANIFEST_PARSED, function() {
          setTimeout(() => { /* lockOrientation(video); */ }, 100);
          parseM3U8Master(url, function(qualities) {
            if (qualities && qualities.length > 0) {
              playerState.qualities = qualities;
              updateSizeEstimate();
            }
          });
          applyDefaultQualityPreference();
          resetHideTimer();
        });
        activeHls.on(Hls.Events.LEVEL_SWITCHED, function(event, data) {
          const lvl = activeHls.levels[data.level];
          if (lvl) {
            playerState.resolution = (lvl.width && lvl.height) ? (lvl.width + 'x' + lvl.height) : '';
            playerState.bandwidth = lvl.bitrate || 0;
          }
          updateTitleDisplay();
          updateSizeEstimate();
        });
        playerState.hls = activeHls;
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = url;
      } else {
        const s = document.createElement('script');
        s.src = HLS_CDN;
        s.onload = function() { showVideoPlayer(url, type); };
        document.head.appendChild(s);
        return;
      }
    } else {
      video.src = url;
    }

    function applyDefaultQualityPreference() {
      if (!activeHls || !activeHls.levels || !activeHls.levels.length) return;
      const pref = data.settings.dataSaver ? 'lowest' : data.settings.defaultQuality;
      if (pref === 'auto' || !pref) return;
      const levels = activeHls.levels;
      let bestIdx = 0;
      for (let i = 1; i < levels.length; i++) {
        if (pref === 'highest' && levels[i].bitrate > levels[bestIdx].bitrate) bestIdx = i;
        if (pref === 'lowest' && levels[i].bitrate < levels[bestIdx].bitrate) bestIdx = i;
      }
      activeHls.currentLevel = bestIdx;
    }

    attachPlayerGestures(videoWrapper, video);

    document.getElementById('__uvd_player_close__').onclick = function() {
      closePlayer();
      document.getElementById('__uvd_stream_list__').style.display = 'block';
    };

    function onFullscreenChange() {
      const isFullscreen = !!(document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement);
      if (isFullscreen) {
        // lockOrientation(video);
      } else {
        // unlockOrientation();
      }
    }
    playerState.onFullscreenChange = onFullscreenChange;
    document.addEventListener('fullscreenchange', onFullscreenChange);
    document.addEventListener('webkitfullscreenchange', onFullscreenChange);
    document.addEventListener('mozfullscreenchange', onFullscreenChange);
    document.addEventListener('MSFullscreenChange', onFullscreenChange);
  }

  // ===== MINIMIZE / RESTORE / CLOSE PLAYER =====
  function minimizePlayer() {
    if (playerState.isMinimized) return;
    playerState.isMinimized = true;
    const overlay = playerState.overlay;
    const video = playerState.video;
    video.pause();
    clearTimeout(playerState.hideTimeout);

    const mini = document.createElement('div');
    mini.id = '__uvd_player_mini__';
    Object.assign(mini.style, {
      position: 'fixed', bottom: '20px', right: '20px',
      width: '160px', height: '90px', background: '#000',
      borderRadius: '12px', zIndex: '2147483647', cursor: 'pointer',
      boxShadow: '0 8px 30px rgba(0,0,0,0.8)',
      border: '2px solid rgba(255,255,255,0.2)',
      overflow: 'hidden', transition: 'opacity 0.25s ease, transform 0.25s ease'
    });

    const canvas = document.createElement('canvas');
    canvas.width = 160;
    canvas.height = 90;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, 160, 90);
    if (video.videoWidth) {
      try { ctx.drawImage(video, 0, 0, 160, 90); } catch {}
    }
    mini.appendChild(canvas);

    const label = document.createElement('div');
    label.textContent = '▶ ' + escapeHtml(pageInfo.title);
    Object.assign(label.style, {
      position: 'absolute', bottom: '4px', left: '8px', color: '#fff',
      fontSize: '11px', fontWeight: '600', textShadow: '0 2px 4px rgba(0,0,0,0.8)',
      background: 'rgba(0,0,0,0.5)', padding: '2px 8px', borderRadius: '4px',
      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '90%'
    });
    mini.appendChild(label);

    document.documentElement.appendChild(mini);
    playerState.mini = mini;

    overlay.style.transition = 'opacity 0.25s ease';
    overlay.style.opacity = '0';
    setTimeout(() => { overlay.style.display = 'none'; }, 260);
    mini.onclick = restorePlayer;
  }

  function restorePlayer() {
    if (!playerState.isMinimized) return;
    playerState.isMinimized = false;
    const overlay = playerState.overlay;
    const mini = playerState.mini;
    if (mini) {
      mini.style.transition = 'opacity 0.2s ease';
      mini.style.opacity = '0';
      setTimeout(() => { mini.remove(); }, 220);
      playerState.mini = null;
    }
    overlay.style.display = 'flex';
    overlay.style.transition = 'opacity 0.25s ease';
    overlay.style.opacity = '1';
    if (playerState.video) {
      playerState.video.play().catch(()=>{});
      if (playerState._resetHideTimer) playerState._resetHideTimer();
    }
  }

  function closePlayer() {
    if (playerState.overlay) {
      if (data.settings.resumePlayback && playerState.url && playerState.video) {
        savePlaybackPosition(playerState.url, playerState.video);
      }
      clearSleepTimer();
      clearTimeout(playerState.hideTimeout);
      if (playerState.audioCtx) {
        try { playerState.audioCtx.close(); } catch {}
        playerState.audioCtx = null;
        playerState.gainNode = null;
        playerState.sourceNode = null;
      }
      if (playerState.mini) { playerState.mini.remove(); playerState.mini = null; }
      if (playerState.video) {
        playerState.video.pause();
        playerState.video.src = '';
      }
      if (playerState.hls) { playerState.hls.destroy(); playerState.hls = null; }
      if (playerState.onFullscreenChange) {
        document.removeEventListener('fullscreenchange', playerState.onFullscreenChange);
        document.removeEventListener('webkitfullscreenchange', playerState.onFullscreenChange);
        document.removeEventListener('mozfullscreenchange', playerState.onFullscreenChange);
        document.removeEventListener('MSFullscreenChange', playerState.onFullscreenChange);
      }
      playerState.overlay.remove();
      playerState.overlay = null;
      playerState.video = null;
      playerState.isMinimized = false;
      playerState.qualities = [];
      playerState.resolution = '';
      playerState.bandwidth = 0;

      data.settings.reduceMotion = playerState.wasReduceMotion;
      applyMotionPref(document.getElementById('__uvd__'));
      Storage.set(data);
    }
  }

  // ========================= EFFECTS PREF =========================
  function applyEffectsPref(el) {
    if (!el) return;
    const on = !!data.settings.glowEffects && !data.settings.reduceMotion;
    el.classList.toggle('uvd-fx-on', on);
    const intensity = Math.max(0, Math.min(100, data.settings.effectsIntensity == null ? 55 : data.settings.effectsIntensity));
    el.style.setProperty('--glow-px', on ? Math.round(4 + intensity * 0.18) + 'px' : '0px');
    el.style.setProperty('--glow-op', on ? (0.15 + intensity * 0.0035).toFixed(3) : '0');
  }

  function applyMotionPref(el) {
    if (!el) return;
    el.classList.toggle('uvd-reduce-motion', !!data.settings.reduceMotion);
    const blur = data.settings.reduceMotion ? 0 : data.settings.blurIntensity;
    const speed = data.settings.reduceMotion ? 0 : data.settings.transitionSpeed;
    el.style.setProperty('--uvd-blur', blur + 'px');
    el.style.setProperty('--uvd-transition', speed + 's ' + data.settings.transitionEasing);
  }

  function __uvdIsolateLayer(el) {
    if (!el) return;
    el.style.willChange = 'transform';
    el.style.transform = 'translateZ(0)';
    el.style.isolation = 'isolate';
    el.style.contain = 'layout paint style';
  }

  // ========================= CSS =========================
  function injectCSS() {
    if (document.getElementById('__uvd_css__')) return;
    const style = document.createElement('style');
    style.id = '__uvd_css__';
    style.textContent = `
      :root {
        --uvd-blur: 24px;
        --uvd-transition: 0.3s ease;
        --bg: rgba(3,4,8,0.97);
        --glass: rgba(12,14,20,0.85);
        --glass-hi: rgba(255,255,255,0.06);
        --border: rgba(255,255,255,0.08);
        --text: #f3f5ff;
        --text2: #9ca3bd;
        --text3: #5d6377;
        --accent: #6d8cff;
        --accent2: #b98bff;
        --danger: #ff5d72;
        --gold: #ffb84d;
        --success: #34d399;
        --card-bg: rgba(255,255,255,0.03);
        --fs-xs: 11px;
        --fs-sm: 12px;
        --fs-base: 13px;
        --fs-md: 14px;
        --fs-lg: 16px;
        --radius-sm: 12px;
        --radius-md: 16px;
        --radius-lg: 26px;
        --grad-liquid: linear-gradient(135deg,var(--accent),var(--accent2));
        --glow-px: 0px;
        --glow-op: 0;
        --btn-bg: rgba(255,255,255,0.1);
        --btn-danger-bg: rgba(255,93,114,0.22);
        --btn-danger-border: rgba(255,93,114,0.4);
        --btn-success-bg: rgba(52,211,153,0.2);
        --btn-success-border: rgba(52,211,153,0.4);
        --btn-accent-bg: rgba(109,140,255,0.28);
        --btn-purple-bg: rgba(167,139,250,0.24);
        --btn-gold-bg: rgba(255,184,77,0.26);
      }
      @keyframes uvdSlideIn{from{transform:translate(-50%,-20px);opacity:0}to{transform:translate(-50%,0);opacity:1}}
      @keyframes uvdPulse{0%,100%{opacity:1;box-shadow:0 0 5px var(--accent)}50%{opacity:0.4;box-shadow:0 0 20px var(--accent)}}
      @keyframes uvdScaleIn{from{opacity:0;transform:scale(0.94)}to{opacity:1;transform:scale(1)}}
      @keyframes uvdRipple{to{transform:scale(4);opacity:0}}
      @keyframes uvdCardEnter{from{opacity:0;transform:translateY(15px)}to{opacity:1;transform:translateY(0)}}
      @keyframes uvdLiquidDrift{0%{transform:translate(-6%,-4%) scale(1)}50%{transform:translate(4%,6%) scale(1.12)}100%{transform:translate(-6%,-4%) scale(1)}}
      @keyframes uvdFadeIn{from{opacity:0}to{opacity:1}}
      *{box-sizing:border-box}
      .uvd-glass-panel{background:var(--glass);backdrop-filter:blur(var(--uvd-blur)) saturate(130%);-webkit-backdrop-filter:blur(var(--uvd-blur)) saturate(130%);border:1px solid var(--border);border-radius:var(--radius-lg);box-shadow:0 20px 50px rgba(0,0,0,0.8),0 0 0 1px rgba(255,255,255,0.03) inset,0 1px 0 rgba(255,255,255,0.08) inset;color:var(--text);font-family:-apple-system,BlinkMacSystemFont,'SF Pro Display','Segoe UI',Roboto,sans-serif;font-size:var(--fs-base);padding:16px;width:100%;position:relative;overflow:hidden;max-width:1000px;margin:auto;transition: backdrop-filter var(--uvd-transition), background var(--uvd-transition);}
      .uvd-glass-panel::before{content:'';position:absolute;top:0;left:8%;right:8%;height:1px;z-index:2;background:linear-gradient(90deg,transparent,rgba(109,140,255,0.6),rgba(185,139,255,0.6),transparent);opacity:0.7}
      .uvd-liquid-bg{position:absolute;inset:-30%;z-index:0;pointer-events:none;background:radial-gradient(closest-side,rgba(109,140,255,0.12),transparent 70%) 15% 20%/55% 55% no-repeat,radial-gradient(closest-side,rgba(185,139,255,0.10),transparent 70%) 85% 75%/60% 60% no-repeat;filter:blur(50px);animation:uvdLiquidDrift 16s ease-in-out infinite}
      @media (prefers-reduced-motion:reduce){.uvd-liquid-bg{animation:none}}
      .uvd-tab-hidden .uvd-liquid-bg{animation-play-state:paused}
      .uvd-panel-content{position:relative;z-index:1;display:flex;flex-direction:column;height:100%;min-height:0}
      .uvd-panel-minimized .uvd-panel-content > *:not(#__uvd_header__) {
        pointer-events: none;
        opacity: 0;
        transform: scale(0.96);
        transition: opacity 0.25s ease, transform 0.3s ease;
        max-height: 0;
        overflow: hidden;
        padding: 0;
        margin: 0;
      }
      .uvd-panel-minimized .uvd-panel-content #__uvd_header__ {
        margin-bottom: 0;
        border-bottom: none;
        padding-bottom: 4px;
      }
      .uvd-panel-minimized .uvd-glass-panel {
        background: var(--glass) !important;
        backdrop-filter: blur(var(--uvd-blur)) saturate(130%) !important;
        -webkit-backdrop-filter: blur(var(--uvd-blur)) saturate(130%) !important;
      }
      .uvd-reduce-motion .uvd-liquid-bg{animation:none}
      .uvd-reduce-motion *{animation:none!important;transition:none!important}
      .uvd-reduce-motion .uvd-glass-panel {
        backdrop-filter: blur(0px)!important;
        -webkit-backdrop-filter: blur(0px)!important;
        background: rgba(10,11,16, 0.98) !important;
        border-color: rgba(255,255,255,0.12);
      }
      .uvd-tabbar{display:flex;gap:2px;padding:6px 8px;background:rgba(255,255,255,0.04);border:1px solid var(--border);border-radius:999px;margin-bottom:10px;flex-shrink:0;overflow-x:auto;overflow-y:hidden;-webkit-overflow-scrolling:touch;scrollbar-width:none;position:relative;}
      .uvd-tabbar::-webkit-scrollbar{display:none}
      .uvd-tab-indicator{position:absolute;top:4px;bottom:4px;left:0;width:0;border-radius:999px;background:var(--grad-liquid);z-index:0;box-shadow:0 3px 12px rgba(109,140,255,0.45);transition:transform 0.4s cubic-bezier(.4,0,.2,1),width 0.4s cubic-bezier(.4,0,.2,1)}
      .uvd-tab{position:relative;z-index:1;flex:1;background:transparent;border:none;color:var(--text2);font-weight:600;font-size:var(--fs-sm);padding:9px 16px;border-radius:999px;cursor:pointer;white-space:nowrap;text-align:center;min-width:0;}
      .uvd-tab.uvd-tab-active{color:#fff;text-shadow:0 1px 4px rgba(0,0,0,0.3)}
      .uvd-fx-on .uvd-btn{transition:box-shadow .25s ease,transform .15s ease}
      .uvd-fx-on .uvd-btn:active{transform:scale(0.95)}
      .uvd-fx-on.uvd-glass-panel,.uvd-fx-on #__uvd_player_header__{box-shadow:0 0 var(--glow-px) rgba(109,140,255,var(--glow-op)),0 8px 30px rgba(0,0,0,0.5)}
      .uvd-fx-on #__uvd_player_close__{box-shadow:0 0 calc(var(--glow-px) * 0.6) rgba(255,93,114,var(--glow-op))}
      .uvd-overlay{position:fixed;inset:0;background:rgba(2,3,6,0.92);backdrop-filter:blur(10px) saturate(120%);z-index:2147483648;display:flex;align-items:center;justify-content:center;padding:16px;overflow-y:auto}
      .uvd-toggle-switch{width:44px;height:26px;border-radius:14px;background:rgba(255,255,255,0.15);border:none;position:relative;cursor:pointer;flex-shrink:0;transition:background .2s ease;padding:0;}
      .uvd-toggle-switch .uvd-toggle-knob{position:absolute;top:3px;left:3px;width:20px;height:20px;border-radius:50%;background:#fff;transition:transform .2s ease;box-shadow:0 1px 3px rgba(0,0,0,0.4);}
      .uvd-toggle-switch.uvd-toggle-on{background:var(--grad-liquid);}
      .uvd-toggle-switch.uvd-toggle-on .uvd-toggle-knob{transform:translateX(18px);}
      .uvd-scroll::-webkit-scrollbar{width:4px}
      .uvd-scroll::-webkit-scrollbar-thumb{background:var(--accent);border-radius:4px}
      .uvd-scroll::-webkit-scrollbar-track{background:transparent}
      .uvd-btn{background:var(--glass-hi);border:1px solid var(--border);color:var(--text);padding:9px 16px;border-radius:var(--radius-md);font-weight:600;font-size:var(--fs-base);cursor:pointer;text-align:center;position:relative;overflow:hidden;display:inline-block;box-shadow:0 3px 10px rgba(0,0,0,0.4),0 1px 0 rgba(255,255,255,0.08) inset;line-height:1.3;transition:all var(--uvd-transition);}
      .uvd-btn:active{transform:scale(0.96)}
      .uvd-btn-sm{padding:7px 12px;font-size:var(--fs-sm);border-radius:var(--radius-sm)}
      .uvd-btn-icon{background:var(--glass-hi);border:1px solid var(--border);color:var(--text);width:34px;height:34px;border-radius:var(--radius-sm);cursor:pointer;display:inline-flex;align-items:center;justify-content:center;position:relative;overflow:hidden;box-shadow:0 3px 8px rgba(0,0,0,0.35),0 1px 0 rgba(255,255,255,0.08) inset;transition:all var(--uvd-transition);}
      .uvd-btn-icon:active{transform:scale(0.92)}
      .uvd-card{background:var(--card-bg);border:1px solid var(--border);border-radius:var(--radius-md);padding:14px;margin-bottom:10px;font-size:var(--fs-base);box-shadow:0 1px 0 rgba(255,255,255,0.04) inset;animation:uvdCardEnter 0.4s ease both;color:var(--text);transition:all var(--uvd-transition);}
      .uvd-card:hover{transform:translateY(-5px) scale(1.01);box-shadow:0 18px 40px rgba(0,0,0,0.8),0 0 0 1px rgba(109,140,255,0.4) inset;}
      .uvd-type-badge{display:inline-block;padding:4px 12px;border-radius:var(--radius-sm);font-size:var(--fs-xs);font-weight:700;background:linear-gradient(135deg,rgba(109,140,255,0.22),rgba(185,139,255,0.18));color:var(--accent);border:1px solid rgba(109,140,255,0.28);letter-spacing:0.03em}
      .uvd-url-box{background:rgba(0,0,0,0.5);border-radius:var(--radius-sm);padding:12px;font-family:'SFMono-Regular',Consolas,monospace;font-size:var(--fs-sm);word-break:break-all;color:var(--text2);max-height:100px;overflow-y:auto;line-height:1.5;border:1px solid rgba(255,255,255,0.04)}
      .uvd-grid-2{display:grid;grid-template-columns:1fr 1fr;gap:8px}
      .uvd-grid-3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px}
      .uvd-ripple{position:absolute;border-radius:50%;background:rgba(255,255,255,0.5);transform:scale(0);animation:uvdRipple 0.6s ease-out}
      .uvd-profile-card{display:flex;align-items:center;gap:14px;background:linear-gradient(135deg,rgba(109,140,255,0.14),rgba(185,139,255,0.08));border:1px solid rgba(109,140,255,0.25);border-radius:var(--radius-lg);padding:16px;margin-bottom:10px;animation:uvdCardEnter 0.4s ease both}
      .uvd-profile-avatar{flex-shrink:0;width:56px;height:56px;border-radius:50%;background:var(--grad-liquid);color:#fff;font-weight:700;font-size:18px;display:flex;align-items:center;justify-content:center;box-shadow:0 6px 18px rgba(109,140,255,0.4),0 0 0 3px rgba(255,255,255,0.08)}
      .uvd-profile-info{min-width:0}
      .uvd-profile-name{font-weight:700;font-size:15px;color:var(--text)}
      .uvd-profile-role{font-size:11.5px;color:var(--text2);margin-top:2px}
      .uvd-profile-tags{display:flex;flex-wrap:wrap;gap:5px;margin-top:8px}
      .uvd-tag{font-size:10px;font-weight:600;padding:3px 9px;border-radius:999px;background:rgba(255,255,255,0.08);border:1px solid var(--border);color:var(--text2)}
      .uvd-profile-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:14px}
      .uvd-stat{background:var(--card-bg);border:1px solid var(--border);border-radius:var(--radius-md);padding:10px 6px;text-align:center}
      .uvd-stat-num{font-size:18px;font-weight:700;color:var(--accent)}
      .uvd-stat-label{font-size:10px;color:var(--text3);margin-top:2px}
      .uvd-section-title{display:flex;align-items:center;gap:8px;font-weight:700;font-size:13px;color:var(--text);margin:16px 0 8px}
      .uvd-section-num{width:20px;height:20px;border-radius:50%;background:var(--grad-liquid);color:#fff;font-size:11px;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;box-shadow:0 2px 8px rgba(109,140,255,0.4)}
      .uvd-timeline-card{border-left:2px solid rgba(109,140,255,0.3)}
      .uvd-inline-code{display:inline-block;background:rgba(0,0,0,0.35);padding:3px 9px;border-radius:6px;color:var(--accent2);font-family:'SFMono-Regular',Consolas,monospace;font-size:11px;border:1px solid rgba(255,255,255,0.06);margin:2px 0}
      .uvd-profile-footer{text-align:center;font-size:11px;color:var(--text3);margin-top:14px;padding-top:12px;border-top:1px solid var(--border)}
      .uvd-step{display:flex;gap:10px;align-items:flex-start;margin-bottom:12px}
      .uvd-step:last-child{margin-bottom:0}
      .uvd-step-num{flex-shrink:0;width:24px;height:24px;border-radius:50%;background:var(--grad-liquid);color:#fff;font-size:12px;font-weight:700;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(109,140,255,0.4)}
      .uvd-step-text{font-size:13px;color:var(--text2);line-height:1.65;padding-top:2px}
      .uvd-step-text strong{color:var(--text)}
      .uvd-callout{display:flex;gap:10px;align-items:flex-start;background:rgba(109,140,255,0.1);border:1px solid rgba(109,140,255,0.25);border-left:3px solid var(--accent);border-radius:10px;padding:10px 12px;margin-top:10px;font-size:12px;color:var(--text2);line-height:1.6}
      .uvd-callout-icon{flex-shrink:0;font-size:15px}
      .uvd-callout.uvd-callout-warn{background:rgba(255,184,77,0.1);border-color:rgba(255,184,77,0.3);border-left-color:var(--gold)}
      .uvd-code-block{position:relative;background:rgba(0,0,0,0.5);border:1px solid var(--border);border-radius:10px;margin:8px 0;}
      .uvd-code-block textarea{width:100%;background:transparent;border:none;color:var(--accent2);padding:10px 40px 10px 12px;font-size:10px;font-family:'SFMono-Regular',Consolas,monospace;resize:none;}
      .uvd-code-copy{position:absolute;top:6px;right:6px;width:26px;height:26px;border-radius:8px;background:rgba(255,255,255,0.08);border:1px solid var(--border);color:var(--text2);font-size:12px;cursor:pointer;display:flex;align-items:center;justify-content:center;}
      .uvd-code-copy:active{background:rgba(255,255,255,0.18);}
      .uvd-search-box{width:100%;padding:10px 14px;background:rgba(0,0,0,0.3);border:1px solid var(--border);border-radius:10px;color:#fff;font-size:13px;margin-bottom:10px;outline:none;}
      .uvd-search-box:focus{border-color:var(--accent);}
    `;
    document.head.appendChild(style);
  }
  injectCSS();

  // ========================= BUILD UI =========================
  function buildUI() {
    const arr = [...urlMap.entries()].map(e => ({
      url: e[0],
      type: e[1].type,
      source: e[1].source,
      priority: e[1].priority
    })).sort((a, b) => a.priority - b.priority);

    let panel = document.getElementById('__uvd__');
    if (panel) panel.remove();

    panel = document.createElement('div');
    panel.id = '__uvd__';
    panel.className = 'uvd-glass-panel';
    Object.assign(panel.style, {
      position: 'fixed', top: '15px', left: '15px', right: '15px',
      height: 'calc(100dvh - 30px)', zIndex: '2147483647',
      animation: 'uvdScaleIn 0.4s ease', overscrollBehavior: 'contain'
    });

    const liquidBg = document.createElement('div');
    liquidBg.className = 'uvd-liquid-bg';
    panel.appendChild(liquidBg);

    const content = document.createElement('div');
    content.className = 'uvd-panel-content';
    panel.appendChild(content);

    const header = document.createElement('div');
    header.id = '__uvd_header__';
    Object.assign(header.style, {
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      paddingBottom: '12px', borderBottom: '1px solid var(--border)',
      marginBottom: '10px', flexShrink: '0'
    });
    header.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;">
        <span style="width:10px;height:10px;background:var(--grad-liquid);border-radius:50%;animation:uvdPulse 2s infinite;box-shadow:0 0 8px rgba(109,140,255,0.6);"></span>
        <span style="font-weight:700;font-size:16px;letter-spacing:-0.01em;">UMP DL <span style="background:var(--grad-liquid);-webkit-background-clip:text;background-clip:text;color:transparent;">V${VERSION}</span></span>
      </div>
      <div style="display:flex;gap:6px;">
        <button class="uvd-btn-icon" id="__uvd_autoplay__" title="Tự động bấm Play (bấm hết cùng lúc)">▶</button>
        <button class="uvd-btn-icon" id="__uvd_seq_autoplay__" title="Thử lần lượt từng server tới khi ra link">⏭</button>
        <button class="uvd-btn-icon" id="__uvd_minimize_script__" title="Thu nhỏ Script">▼</button>
        <button class="uvd-btn-icon" id="__uvd_refresh__" title="Làm mới">↻</button>
        <button class="uvd-btn-icon" id="__uvd_close__" title="Đóng">×</button>
      </div>
    `;
    content.appendChild(header);

    const tabbar = document.createElement('div');
    tabbar.className = 'uvd-tabbar';
    const indicator = document.createElement('div');
    indicator.className = 'uvd-tab-indicator';
    indicator.id = '__uvd_tab_indicator__';
    tabbar.appendChild(indicator);

    const clickedCountForHost = Object.keys(data.clickedButtons[pageInfo.host] || {}).length;
    const tabList = [
      { id: 'streams', text: 'Streams (' + arr.length + ')' },
      { id: 'clicked', text: 'Nút đã click' + (clickedCountForHost ? ' (' + clickedCountForHost + ')' : '') },
      { id: 'settings', text: 'Cài đặt' }
    ];

    tabList.forEach(t => {
      const b = document.createElement('button');
      b.className = 'uvd-tab';
      b.dataset.tab = t.id;
      b.textContent = t.text;
      tabbar.appendChild(b);
    });
    content.appendChild(tabbar);

    function moveIndicatorTo(btn) {
      if (!btn) return;
      const width = btn.offsetWidth;
      indicator.style.width = width + 'px';
      indicator.style.transform = 'translateX(' + btn.offsetLeft + 'px)';
      if (btn.scrollIntoView) btn.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
    }

    const info = document.createElement('div');
    Object.assign(info.style, { marginBottom: '10px', fontSize: '12px', flexShrink: '0' });
    const savedPlaySel = (data.siteProfiles[pageInfo.host] && data.siteProfiles[pageInfo.host].playSelector) || '';
    info.innerHTML = `
      <span style="color:var(--text2);">Tên: </span>
      <span id="__uvd_title__" style="color:var(--accent);text-decoration:underline;cursor:pointer;">${escapeHtml(pageInfo.title)}</span> <span style="color:var(--text3);">(sửa)</span><br>
      <span style="color:var(--text2);">Referer: </span>
      <span id="__uvd_referer__" style="color:var(--accent2);font-family:monospace;text-decoration:underline;cursor:pointer;font-size:11px;">${escapeHtml(pageInfo.referer)}</span><br>
      <span style="color:var(--text2);">Play selector: </span>
      <span id="__uvd_playsel__" style="color:var(--accent2);font-family:monospace;text-decoration:underline;cursor:pointer;font-size:11px;">${escapeHtml(savedPlaySel || '(chưa đặt · bấm để thêm)')}</span>
    `;
    content.appendChild(info);

    const contentWrapper = document.createElement('div');
    contentWrapper.className = 'uvd-scroll';
    Object.assign(contentWrapper.style, { flex: '1', overflow: 'hidden', position: 'relative', minHeight: '0' });

    // Search box
    const searchBox = document.createElement('input');
    searchBox.type = 'text';
    searchBox.className = 'uvd-search-box';
    searchBox.placeholder = '🔍 Tìm stream...';
    searchBox.id = '__uvd_search__';
    contentWrapper.appendChild(searchBox);

    const streamList = document.createElement('div');
    streamList.id = '__uvd_stream_list__';
    streamList.className = 'uvd-scroll';
    Object.assign(streamList.style, { overflowY: 'auto', height: 'calc(100% - 44px)', paddingRight: '4px' });
    contentWrapper.appendChild(streamList);

    content.appendChild(contentWrapper);

    const footer = document.createElement('div');
    Object.assign(footer.style, { display: 'flex', gap: '6px', marginTop: '10px', flexWrap: 'wrap', flexShrink: '0' });
    ['TXT','JSON','M3U','CSV'].forEach(f => {
      const btn = document.createElement('button');
      btn.className = 'uvd-btn uvd-btn-sm';
      btn.textContent = f;
      btn.style.flex = '1 0 auto';
      btn.onclick = function() { exportData(f.toLowerCase()); };
      footer.appendChild(btn);
    });
    content.appendChild(footer);

    const author = document.createElement('div');
    Object.assign(author.style, { textAlign: 'center', fontSize: '11px', color: 'var(--text3)', marginTop: '8px', flexShrink: '0' });
    author.textContent = '© nguyenquocngu91';
    content.appendChild(author);

    document.documentElement.appendChild(panel);
    __uvdIsolateLayer(panel);
    applyEffectsPref(panel);
    applyMotionPref(panel);

    panel.querySelectorAll('.uvd-btn, .uvd-btn-icon, .uvd-tab').forEach(btn => {
      btn.addEventListener('click', addRipple);
    });

    let currentTab = 'streams';
    function renderTab(tabId) {
      currentTab = tabId;
      document.querySelectorAll('[data-tab]').forEach(t => {
        if (t.dataset.tab === tabId) {
          t.classList.add('uvd-tab-active');
          moveIndicatorTo(t);
        } else {
          t.classList.remove('uvd-tab-active');
        }
      });

      streamList.style.display = 'block';
      streamList.innerHTML = '';

      if (tabId === 'streams') renderStreams(streamList, arr);
      else if (tabId === 'clicked') renderClickedButtons(streamList);
      else if (tabId === 'settings') renderSettings(streamList);
    }

    document.querySelectorAll('[data-tab]').forEach(t => {
      t.onclick = function() { renderTab(this.dataset.tab); };
    });

    renderTab('streams');

    // Search filter
    searchBox.addEventListener('input', function() {
      const q = this.value.toLowerCase();
      const cards = streamList.querySelectorAll('.uvd-card');
      cards.forEach(card => {
        const text = card.textContent.toLowerCase();
        card.style.display = text.includes(q) ? '' : 'none';
      });
    });

    window.addEventListener('resize', function() {
      moveIndicatorTo(document.querySelector('.uvd-tab.uvd-tab-active'));
    });

    document.getElementById('__uvd_close__').onclick = function() {
      stopMonitor();
      panel.remove();
      runCleanup();
    };
    document.getElementById('__uvd_refresh__').onclick = function() { buildUI(); toast('Đã làm mới'); };
    document.getElementById('__uvd_autoplay__').onclick = function() {
      const n = autoClickPlay(document, 0, false);
      toast(n > 0 ? 'Đã thử bấm Play (' + n + ' nút)' : 'Không tìm thấy nút Play, thử đặt selector riêng ở Cài đặt');
      setTimeout(() => buildUI(), 1200);
    };
    document.getElementById('__uvd_seq_autoplay__').onclick = function() { autoClickSequential(); };
    document.getElementById('__uvd_minimize_script__').onclick = minimizeScriptPanel;

    document.getElementById('__uvd_title__').onclick = function() {
      const newTitle = prompt('Tên file:', pageInfo.title);
      if (newTitle) {
        pageInfo.title = newTitle.replace(/[^\w\s\u00C0-\u1EF9.-]/g, '').substring(0,100);
        this.textContent = escapeHtml(pageInfo.title);
      }
    };

    document.getElementById('__uvd_referer__').onclick = function() {
      const newRef = prompt('Referer:', pageInfo.referer);
      if (newRef) {
        pageInfo.referer = newRef;
        this.textContent = escapeHtml(newRef);
        data.siteProfiles[pageInfo.host] = Object.assign({}, data.siteProfiles[pageInfo.host], { referer: newRef, userAgent: pageInfo.userAgent });
        Storage.set(data);
        toast('Đã lưu referer cho ' + pageInfo.host);
      }
    };

    document.getElementById('__uvd_playsel__').onclick = function() {
      const current = (data.siteProfiles[pageInfo.host] && data.siteProfiles[pageInfo.host].playSelector) || '';
      const newSel = prompt('CSS selector của nút Play trên site này (ví dụ: .video-play-button):', current);
      if (newSel !== null) {
        const trimmed = newSel.trim();
        data.siteProfiles[pageInfo.host] = Object.assign({}, data.siteProfiles[pageInfo.host], { playSelector: trimmed });
        Storage.set(data);
        this.textContent = escapeHtml(trimmed || '(chưa đặt · bấm để thêm)');
        if (trimmed) {
          toast('Đã lưu selector cho ' + pageInfo.host);
          autoClickPlay(document, 0, false);
          setTimeout(() => buildUI(), 1000);
        } else {
          toast('Đã xóa selector riêng');
        }
      }
    };

    window.__uvd_showPlayer = function(url, type) {
      showVideoPlayer(url, type);
    };
  }

  // ========================= RENDER FUNCTIONS =========================
  const UVD_LAZY_BATCH = 40;

  function buildStreamCardHTML(item, i) {
    let actionsHtml;
    if (item.type === 'BLOB') {
      actionsHtml = `
        <button class="uvd-btn uvd-btn-sm" data-action="play" data-url="${encodeURIComponent(item.url)}" data-type="${escapeHtml(item.type)}" style="background:rgba(109,140,255,0.25);">Xem</button>
        <button class="uvd-btn uvd-btn-sm" data-action="blobdl" data-url="${encodeURIComponent(item.url)}" style="background:rgba(52,211,153,0.22);">⬇ Tải Blob</button>
        <div style="grid-column:1/3;font-size:11px;color:var(--text3);line-height:1.4;">Blob chỉ tải được nếu là file gốc (không áp dụng cho stream HLS/DASH qua MediaSource).</div>
      `;
    } else {
      actionsHtml = `
        <button class="uvd-btn uvd-btn-sm" data-action="share" data-url="${encodeURIComponent(item.url)}" style="background:rgba(139,92,246,0.2);">Chia sẻ</button>
        <button class="uvd-btn uvd-btn-sm" data-action="copy" data-url="${encodeURIComponent(item.url)}">Sao chép</button>
        ${item.type === 'IFRAME' ?
          `<button class="uvd-btn uvd-btn-sm" data-action="iframe" data-url="${encodeURIComponent(item.url)}" style="text-align:center;grid-column:1/3;">Mở iframe</button>` :
          (item.type === 'M3U8' ?
            `<button class="uvd-btn uvd-btn-sm" data-action="quality" data-url="${encodeURIComponent(item.url)}">Chất lượng</button>
             <button class="uvd-btn uvd-btn-sm" data-action="play" data-url="${encodeURIComponent(item.url)}" data-type="${escapeHtml(item.type)}" style="background:rgba(109,140,255,0.25);">Xem</button>
             <button class="uvd-btn uvd-btn-sm" data-action="cmd" data-url="${encodeURIComponent(item.url)}" data-type="${escapeHtml(item.type)}" style="grid-column:1/3;">Lệnh tải</button>` :
            `<button class="uvd-btn uvd-btn-sm" data-action="play" data-url="${encodeURIComponent(item.url)}" data-type="${escapeHtml(item.type)}" style="background:rgba(109,140,255,0.25);">Xem</button>
             <button class="uvd-btn uvd-btn-sm" data-action="cmd" data-url="${encodeURIComponent(item.url)}" data-type="${escapeHtml(item.type)}">Lệnh tải</button>`
          )
        }
      `;
    }
    return `
      <div class="uvd-card" data-type="${escapeHtml(item.type)}" data-url="${escapeHtml(item.url)}">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
          <span class="uvd-type-badge">#${i+1} ${escapeHtml(item.type)}</span>
          <button class="uvd-block-btn" data-url="${encodeURIComponent(item.url)}" style="background:none;border:none;font-size:16px;cursor:pointer;color:#fff;opacity:0.5;" title="Chặn link này">⛔</button>
        </div>
        <div class="uvd-url-box">${escapeHtml(item.url)}</div>
        <div class="uvd-grid-2" style="margin-top:8px;">${actionsHtml}</div>
      </div>
    `;
  }

  function renderStreams(container, arr) {
    if (!arr.length) {
      container.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text2);">Không phát hiện stream nào.</div>';
      return;
    }

    const listWrap = document.createElement('div');
    container.appendChild(listWrap);
    let rendered = 0;
    let moreBtn = null;

    function renderNextBatch() {
      const end = Math.min(rendered + UVD_LAZY_BATCH, arr.length);
      const html = arr.slice(rendered, end).map((item, i) => buildStreamCardHTML(item, rendered + i)).join('');
      const frag = document.createElement('div');
      frag.innerHTML = html;
      while (frag.firstChild) listWrap.appendChild(frag.firstChild);
      rendered = end;

      if (moreBtn) { moreBtn.remove(); moreBtn = null; }
      if (rendered < arr.length) {
        moreBtn = document.createElement('button');
        moreBtn.className = 'uvd-btn uvd-btn-sm uvd-more-btn';
        moreBtn.style.cssText = 'width:100%;margin-top:8px;';
        moreBtn.textContent = 'Xem thêm (' + (arr.length - rendered) + ')';
        moreBtn.onclick = renderNextBatch;
        container.appendChild(moreBtn);
      }
    }
    renderNextBatch();

    container.onclick = function(e) {
      const blockBtn = e.target.closest('.uvd-block-btn');
      if (blockBtn) {
        addRipple({ currentTarget: blockBtn, clientX: e.clientX, clientY: e.clientY });
        const urlToBlock = decodeURIComponent(blockBtn.dataset.url);
        let pattern = urlToBlock;
        try {
          const u = new URL(urlToBlock);
          pattern = u.hostname;
        } catch {}
        if (confirm('Chặn tất cả stream chứa "' + pattern + '" ?')) {
          addToFilterlist(pattern);
          toast('Đã chặn "' + pattern + '"');
        }
        return;
      }
      const actionBtn = e.target.closest('.uvd-btn[data-action]');
      if (actionBtn) {
        addRipple({ currentTarget: actionBtn, clientX: e.clientX, clientY: e.clientY });
        const u2 = decodeURIComponent(actionBtn.dataset.url);
        const action = actionBtn.dataset.action;
        const t = actionBtn.dataset.type;
        addToHistory(u2, t || 'IFRAME');
        if (action === 'share') shareUrl(u2);
        else if (action === 'copy') { copy(u2); toast('Đã sao chép!'); }
        else if (action === 'quality') showQualityPicker(u2);
        else if (action === 'play') window.__uvd_showPlayer(u2, t || 'MP4');
        else if (action === 'cmd') showCommandPicker(u2, t);
        else if (action === 'iframe') window.__uvdSafeOpen(u2);
        else if (action === 'blobdl') downloadBlobUrl(u2);
        return;
      }
      if (e.target === moreBtn) return;
    };
  }

  // ===== BLOB DOWNLOAD =====
  function downloadBlobUrl(url) {
    toast('Đang lấy dữ liệu blob...');
    fetch(url)
      .then(res => {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.blob();
      })
      .then(blob => {
        if (!blob || blob.size === 0) {
          toast('Blob rỗng — có thể đây là stream MediaSource, không tải được trực tiếp.');
          return;
        }
        const mime = blob.type || '';
        let ext = '.bin';
        if (mime.indexOf('mp4') !== -1) ext = '.mp4';
        else if (mime.indexOf('webm') !== -1) ext = '.webm';
        else if (mime.indexOf('ogg') !== -1) ext = '.ogv';
        else if (mime.indexOf('quicktime') !== -1) ext = '.mov';
        else if (mime.indexOf('mpegurl') !== -1) ext = '.m3u8';
        else if (mime.indexOf('audio/') !== -1) ext = '.mp3';
        const base = (pageInfo.title || 'uvd_blob').replace(/[\\/:*?"<>|]+/g, '_').trim().slice(0, 80) || 'uvd_blob';
        const filename = base + ext;
        const objUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = objUrl;
        a.download = filename;
        a.click();
        setTimeout(() => URL.revokeObjectURL(objUrl), 15000);
        toast('Đã tải: ' + filename + ' (' + (blob.size / 1048576).toFixed(1) + 'MB)');
      })
      .catch(err => {
        toast('Không tải được blob: ' + (err && err.message ? err.message : 'lỗi không rõ'));
      });
  }

  // ===== COMMAND PICKER =====
  function makeCommands(url, type, title) {
    const t = title;
    const ext = type.toLowerCase() === 'iframe' ? 'mp4' : type.toLowerCase();
    const ref = pageInfo.referer;
    const origin = pageInfo.origin;
    const ua = pageInfo.userAgent;
    return {
      'yt-dlp': { label: 'yt-dlp (cơ bản)', cmd: 'yt-dlp --referer "' + ref + '" -o "' + t + '.%(ext)s" "' + url + '"' },
      'yt-dlp-bypass': { label: 'yt-dlp (bypass)', cmd: 'yt-dlp --force-ipv4 --no-check-certificate --user-agent "' + ua + '" --referer "' + ref + '" --add-header "Origin: ' + origin + '" -f "bv*+ba/best" --merge-output-format mp4 -o "' + t + '.%(ext)s" "' + url + '"' },
      'yt-dlp-aria': { label: 'yt-dlp + aria2', cmd: 'yt-dlp --referer "' + ref + '" --downloader aria2c -o "' + t + '.%(ext)s" "' + url + '"' },
      'ffmpeg': { label: 'FFmpeg', cmd: 'ffmpeg -headers "Referer: ' + ref + '\\r\\nOrigin: ' + origin + '" -i "' + url + '" -c copy "' + t + '.mp4"' },
      'curl': { label: 'cURL', cmd: 'curl -H "Referer: ' + ref + '" -o "' + t + '.' + ext + '" "' + url + '"' }
    };
  }

  function showCommandPicker(url, type) {
    const cmds = makeCommands(url, type, pageInfo.title);
    const opts = Object.keys(cmds).map(k => ({ label: cmds[k].label, value: cmds[k].cmd }));
    const overlay = document.createElement('div');
    overlay.className = 'uvd-overlay';
    const panel = document.createElement('div');
    panel.className = 'uvd-glass-panel';
    panel.style.cssText = 'max-width:600px;margin:auto;';
    const titleDiv = document.createElement('div');
    titleDiv.style.cssText = 'font-weight:700;margin-bottom:12px;';
    titleDiv.textContent = 'Chọn lệnh tải';
    panel.appendChild(titleDiv);
    const content = document.createElement('div');
    content.style.cssText = 'overflow-y:auto;max-height:60vh;';
    opts.forEach(opt => {
      const card = document.createElement('div');
      card.className = 'uvd-card';
      card.innerHTML = `<div style="font-weight:600;color:var(--accent);">${escapeHtml(opt.label)}</div><div class="uvd-url-box">${escapeHtml(opt.value)}</div>`;
      const btn = document.createElement('button');
      btn.className = 'uvd-btn uvd-btn-sm';
      btn.style.cssText = 'width:100%;';
      btn.textContent = 'Chỉnh sửa & Copy';
      btn.onclick = function() {
        overlay.remove();
        showEditor(opt.value);
      };
      card.appendChild(btn);
      content.appendChild(card);
    });
    panel.appendChild(content);
    const closeBtn = document.createElement('button');
    closeBtn.className = 'uvd-btn uvd-btn-sm';
    closeBtn.style.cssText = 'width:100%;margin-top:10px;background:var(--danger);';
    closeBtn.textContent = 'Đóng';
    closeBtn.onclick = function() { overlay.remove(); };
    panel.appendChild(closeBtn);
    overlay.appendChild(panel);
    document.documentElement.appendChild(overlay);
  }

  function showEditor(text) {
    const overlay = document.createElement('div');
    overlay.className = 'uvd-overlay';
    const panel = document.createElement('div');
    panel.className = 'uvd-glass-panel';
    panel.style.cssText = 'max-width:600px;margin:auto;';
    panel.innerHTML = `
      <div style="font-weight:700;margin-bottom:8px;">Chỉnh sửa lệnh</div>
      <textarea style="width:100%;height:120px;background:rgba(0,0,0,0.5);border:1px solid var(--border);border-radius:10px;color:var(--text);padding:12px;font-family:monospace;">${escapeHtml(text)}</textarea>
      <div class="uvd-grid-2" style="margin-top:12px;">
        <button class="uvd-btn uvd-btn-sm" id="__uvd_ed_copy__">Sao chép</button>
        <button class="uvd-btn uvd-btn-sm" id="__uvd_ed_share__" style="background:var(--btn-purple-bg);">Chia sẻ</button>
      </div>
      <button class="uvd-btn uvd-btn-sm close-editor" style="width:100%;margin-top:8px;background:var(--danger);">Đóng</button>
    `;
    overlay.appendChild(panel);
    document.documentElement.appendChild(overlay);

    overlay.querySelector('#__uvd_ed_copy__').onclick = function() {
      copy(overlay.querySelector('textarea').value);
      overlay.remove();
      toast('Đã sao chép!');
    };
    overlay.querySelector('#__uvd_ed_share__').onclick = function() {
      shareUrl(overlay.querySelector('textarea').value);
      overlay.remove();
    };
    overlay.querySelector('.close-editor').onclick = function() { overlay.remove(); };
  }

  // ===== QUALITY PICKER =====
  function showQualityPicker(url) {
    const overlay = document.createElement('div');
    overlay.className = 'uvd-overlay';
    const panel = document.createElement('div');
    panel.className = 'uvd-glass-panel';
    panel.style.cssText = 'max-width:600px;margin:auto;text-align:center;';
    panel.textContent = 'Đang phân tích M3U8...';
    overlay.appendChild(panel);
    document.documentElement.appendChild(overlay);

    parseM3U8Master(url, function(qualities) {
      if (!qualities) {
        panel.innerHTML = `<div style="color:var(--danger);">Không phải Master Playlist</div><button class="uvd-btn uvd-btn-sm close-overlay-btn" style="margin-top:12px;background:var(--danger);width:100%;">Đóng</button>`;
        panel.querySelector('.close-overlay-btn').onclick = function() { overlay.remove(); };
        return;
      }
      panel.innerHTML = '';
      const title = document.createElement('div');
      title.style.cssText = 'font-weight:700;margin-bottom:12px;';
      title.textContent = 'Chọn chất lượng (' + qualities.length + ')';
      panel.appendChild(title);
      const content = document.createElement('div');
      content.style.cssText = 'overflow-y:auto;max-height:60vh;';
      qualities.forEach(q => {
        const card = document.createElement('div');
        card.className = 'uvd-card';
        card.innerHTML = `<b>${escapeHtml(q.label)}</b> <span style="color:var(--text3);">${Math.round(q.bandwidth/1000)}kbps</span>`;
        const grid = document.createElement('div');
        grid.className = 'uvd-grid-3';
        grid.style.marginTop = '8px';
        const shareBtn = document.createElement('button');
        shareBtn.className = 'uvd-btn uvd-btn-sm';
        shareBtn.textContent = 'Chia sẻ';
        shareBtn.onclick = function() { shareUrl(q.url); overlay.remove(); };
        grid.appendChild(shareBtn);
        const playBtn = document.createElement('button');
        playBtn.className = 'uvd-btn uvd-btn-sm';
        playBtn.style.background = 'rgba(109,140,255,0.25)';
        playBtn.textContent = 'Xem';
        playBtn.onclick = function() { overlay.remove(); window.__uvd_showPlayer(q.url, 'M3U8'); };
        grid.appendChild(playBtn);
        const cmdBtn = document.createElement('button');
        cmdBtn.className = 'uvd-btn uvd-btn-sm';
        cmdBtn.textContent = 'Lệnh';
        cmdBtn.onclick = function() { overlay.remove(); showCommandPicker(q.url, 'M3U8'); };
        grid.appendChild(cmdBtn);
        card.appendChild(grid);
        content.appendChild(card);
      });
      panel.appendChild(content);
      const closeBtn = document.createElement('button');
      closeBtn.className = 'uvd-btn uvd-btn-sm';
      closeBtn.style.cssText = 'width:100%;margin-top:10px;background:var(--danger);';
      closeBtn.textContent = 'Đóng';
      closeBtn.onclick = function() { overlay.remove(); };
      panel.appendChild(closeBtn);
    });
  }

  // ===== TOGGLE ROW =====
  function buildToggleRow(id, label, checked) {
    return `<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border);">
      <span style="font-size:13px;color:var(--text2);">${escapeHtml(label)}</span>
      <button id="${id}" class="uvd-toggle-switch${checked ? ' uvd-toggle-on' : ''}"><span class="uvd-toggle-knob"></span></button>
    </div>`;
  }

  // ===== RENDER CLICKED BUTTONS =====
  function renderClickedButtons(container) {
    const host = pageInfo.host;
    const map = data.clickedButtons[host] || {};
    const entries = Object.keys(map).map(k => map[k])
      .sort((a, b) => (b.lastClicked || 0) - (a.lastClicked || 0));

    let html = `
      <div class="uvd-card">
        <div style="font-weight:600;margin-bottom:6px;">🖱️ Danh sách nút đã click (tổng ${entries.length})</div>
        <div style="font-size:12px;color:var(--text2);margin-bottom:10px;">Bật/tắt để chặn hoặc cho phép click lại. Nút bị chặn sẽ tự bỏ qua ở lần Auto Play kế tiếp trên site <span style="color:var(--accent2);font-family:monospace;">${escapeHtml(host)}</span>.</div>
    `;

    if (!entries.length) {
      html += `<div style="text-align:center;color:var(--text3);font-size:12px;padding:16px 0;">Chưa có nút nào được auto-click ghi lại trên site này. Bấm ▶ ở góc trên để thử.</div>`;
    } else {
      entries.forEach((rec, i) => {
        const id = '__uvd_clkbtn_' + i + '__';
        html += `
          <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--border);">
            <div style="min-width:0;flex:1;">
              <div style="font-family:monospace;font-size:12.5px;color:var(--text);word-break:break-all;">${escapeHtml(rec.selector)}</div>
              <div style="font-size:11px;color:var(--text3);margin-top:2px;">${rec.count || 1} lần · ${escapeHtml((rec.label || '').substring(0,40))}</div>
            </div>
            <button data-sel="${escapeHtml(rec.selector)}" id="${id}" class="uvd-toggle-switch${rec.blocked ? ' uvd-toggle-on' : ''}"><span class="uvd-toggle-knob"></span></button>
          </div>
        `;
      });
      html += `<button id="__uvd_clkbtn_clear__" class="uvd-btn uvd-btn-sm" style="width:100%;margin-top:12px;background:var(--danger);">Xoá toàn bộ danh sách (site này)</button>`;
    }
    html += '</div>';
    container.innerHTML = html;

    container.querySelectorAll('.uvd-toggle-switch[data-sel]').forEach(btn => {
      btn.onclick = function() {
        const sel = btn.getAttribute('data-sel');
        const isOn = btn.classList.toggle('uvd-toggle-on');
        if (data.clickedButtons[host] && data.clickedButtons[host][sel]) {
          data.clickedButtons[host][sel].blocked = isOn;
          Storage.set(data);
          toast(isOn ? '🚫 Đã chặn nút này' : '✅ Đã cho phép click lại');
        }
      };
    });

    const clearBtn = document.getElementById('__uvd_clkbtn_clear__');
    if (clearBtn) {
      clearBtn.onclick = function() {
        delete data.clickedButtons[host];
        Storage.set(data);
        renderClickedButtons(container);
        toast('Đã xoá danh sách nút đã click cho site này');
      };
    }
  }

  // ===== RENDER SETTINGS =====
  function renderSettings(container) {
    const totalStreams = urlMap.size;
    const bookmarkletCode = "javascript:(function(){var s=document.createElement('script');s.src='https://cdn.jsdelivr.net/gh/nguyenquocngu93/bookmarklet-@main/umpdl.js?force='+Date.now();document.head.appendChild(s);})();";

    container.innerHTML = `
      <div class="uvd-profile-card">
        <div class="uvd-profile-avatar">NQ</div>
        <div class="uvd-profile-info">
          <div class="uvd-profile-name">nguyenquocngu91</div>
          <div class="uvd-profile-role">Bookmarklet Developer · Universal Media Tools</div>
          <div class="uvd-profile-tags">
            <span class="uvd-tag">UMP DL v${VERSION} PRO</span>
            <span class="uvd-tag">Vanilla JS</span>
            <span class="uvd-tag">HLS · M3U8</span>
            <span class="uvd-tag">Adblock</span>
            <span class="uvd-tag">Resume · Tua đúp · PiP</span>
          </div>
        </div>
      </div>

      <div class="uvd-profile-stats">
        <div class="uvd-stat"><div class="uvd-stat-num">${totalStreams}</div><div class="uvd-stat-label">Streams</div></div>
        <div class="uvd-stat"><div class="uvd-stat-num">${data.favorites.length}</div><div class="uvd-stat-label">Yêu thích</div></div>
        <div class="uvd-stat"><div class="uvd-stat-num">${(data.history||[]).length}</div><div class="uvd-stat-label">Lịch sử</div></div>
        <div class="uvd-stat"><div class="uvd-stat-num" style="color:#ff5d72;">${adBlockedCount}</div><div class="uvd-stat-label">Đã chặn popup</div></div>
      </div>

      <div class="uvd-card">
        <div style="font-weight:600;margin-bottom:8px;">⚡ Hiệu năng</div>
        ${buildToggleRow('__uvd_toggle_reducemotion__', 'Bật chế độ hiệu suất (giảm hiệu ứng)', data.settings.reduceMotion)}
        <div style="font-size:12px;color:var(--text2);margin:10px 0 4px;">Cường độ làm mờ (blur): <span id="__uvd_blur_val__">${data.settings.blurIntensity}px</span></div>
        <input type="range" id="__uvd_blur_range__" min="0" max="30" step="1" value="${data.settings.blurIntensity}" style="width:100%;">
        <div style="font-size:12px;color:var(--text2);margin:10px 0 4px;">Tốc độ chuyển tiếp: <span id="__uvd_transition_val__">${data.settings.transitionSpeed}s</span></div>
        <input type="range" id="__uvd_transition_range__" min="0" max="0.8" step="0.05" value="${data.settings.transitionSpeed}" style="width:100%;">
        <div style="font-size:11px;color:var(--text3);margin-top:6px;">Giảm blur và tốc độ transition để máy chạy mượt hơn.</div>
      </div>

      <div class="uvd-card">
        <div style="font-weight:600;margin-bottom:8px;">✨ Hiệu ứng giao diện</div>
        ${buildToggleRow('__uvd_toggle_glow__', 'Hiệu ứng phát sáng (glow) cho nút & panel', data.settings.glowEffects)}
        <div style="font-size:12px;color:var(--text2);margin:10px 0 4px;">Cường độ hiệu ứng: <span id="__uvd_fx_val__">${data.settings.effectsIntensity}%</span></div>
        <input type="range" id="__uvd_fx_range__" min="0" max="100" step="5" value="${data.settings.effectsIntensity}" style="width:100%;">
      </div>

      <div class="uvd-card">
        <div style="font-weight:600;margin-bottom:8px;">⛔ Chặn tự phát</div>
        ${buildToggleRow('__uvd_toggle_blockautoplay__', 'Chặn mạnh web tự mở/phát video sau khi chạy script', data.settings.blockAutoplay)}
        <div style="font-size:11px;color:var(--text3);margin-top:6px;">Video/audio do chính trang web tự bật (quảng cáo, autoplay ẩn...) sẽ luôn bị tạm dừng ngay. Video mở qua UMP DL Player không bị ảnh hưởng.</div>
      </div>

      <div class="uvd-card">
        <div style="font-weight:600;margin-bottom:8px;">🎬 Tuỳ chọn trình phát</div>
        ${buildToggleRow('__uvd_toggle_resume__', 'Nhớ vị trí xem dở (Resume)', data.settings.resumePlayback)}
        ${buildToggleRow('__uvd_toggle_autofs__', 'Tự động toàn màn hình khi mở', data.settings.autoFullscreen)}
        ${buildToggleRow('__uvd_toggle_autonext__', 'Tự động phát stream tiếp theo', data.settings.autoNext)}
        ${buildToggleRow('__uvd_toggle_datasaver__', 'Chế độ tiết kiệm data (ép chất lượng thấp)', data.settings.dataSaver)}
        ${buildToggleRow('__uvd_toggle_autohide__', 'Tự động ẩn thanh điều khiển', data.settings.autoHideControls)}
        ${buildToggleRow('__uvd_toggle_showremaining__', 'Hiển thị thời gian còn lại', data.settings.showRemainingTime)}
        <div style="font-size:12px;color:var(--text2);margin:8px 0 4px;">Tốc độ phát mặc định</div>
        <select id="__uvd_set_speed__" style="width:100%;padding:10px;background:rgba(0,0,0,0.4);color:#fff;border:1px solid var(--border);border-radius:10px;margin-bottom:12px;">
          ${[0.5,0.75,1,1.25,1.5,2].map(v => `<option value="${v}"${data.settings.defaultSpeed===v?' selected':''}>${v}x</option>`).join('')}
        </select>
        <div style="font-size:12px;color:var(--text2);margin-bottom:6px;">Chất lượng mặc định (HLS)</div>
        <select id="__uvd_set_quality__" style="width:100%;padding:10px;background:rgba(0,0,0,0.4);color:#fff;border:1px solid var(--border);border-radius:10px;margin-bottom:8px;">
          <option value="auto"${data.settings.defaultQuality==='auto'?' selected':''}>Tự động (Auto)</option>
          <option value="highest"${data.settings.defaultQuality==='highest'?' selected':''}>Cao nhất</option>
          <option value="lowest"${data.settings.defaultQuality==='lowest'?' selected':''}>Thấp nhất (tiết kiệm data)</option>
        </select>
        <div style="font-size:12px;color:var(--text2);margin:8px 0 4px;">Số giây tua khi chạm đúp trái/phải</div>
        <input type="number" id="__uvd_doubletap_seconds__" min="1" max="60" step="1" value="${data.settings.doubleTapSeconds}" style="width:100%;padding:10px;background:rgba(0,0,0,0.4);color:#fff;border:1px solid var(--border);border-radius:10px;margin-bottom:8px;">
        <div style="font-size:12px;color:var(--text2);margin:8px 0 4px;">Tự động ẩn controls sau (giây)</div>
        <input type="number" id="__uvd_hide_delay__" min="1" max="30" step="1" value="${data.settings.hideDelay}" style="width:100%;padding:10px;background:rgba(0,0,0,0.4);color:#fff;border:1px solid var(--border);border-radius:10px;">
      </div>

      <div class="uvd-card">
        <div style="font-weight:600;margin-bottom:8px;">🔊 Tăng âm lượng</div>
        ${buildToggleRow('__uvd_toggle_boost__', 'Bật tăng âm lượng mặc định', data.settings.volumeBoost)}
        <div style="font-size:12px;color:var(--text2);margin:8px 0 4px;">Mức tăng tối đa: <span id="__uvd_boost_val__">${data.settings.volumeBoostMax}%</span></div>
        <input type="range" id="__uvd_boost_range__" min="100" max="300" step="10" value="${data.settings.volumeBoostMax}" style="width:100%;">
      </div>

      <div class="uvd-card">
        <div style="font-weight:600;margin-bottom:8px;">🛡️ Lọc quảng cáo (Filterlist)</div>
        <div style="font-size:12px;color:var(--text2);margin-bottom:8px;">Nhập mỗi dòng một từ khóa hoặc domain. Hỗ trợ regex nếu bắt đầu bằng <code>regex:</code>.</div>
        <textarea id="__uvd_filter_text__" style="width:100%;height:80px;background:rgba(0,0,0,0.5);border:1px solid var(--border);border-radius:10px;color:var(--text);padding:12px;font-size:12px;">${escapeHtml((data.filterlist||[]).join('\n'))}</textarea>
        <div class="uvd-grid-2" style="margin-top:8px;">
          <button class="uvd-btn uvd-btn-sm" id="__uvd_save_filter__">💾 Lưu</button>
          <button class="uvd-btn uvd-btn-sm" id="__uvd_import_filter__">📂 Import file</button>
        </div>
        <div style="margin-top:6px;font-size:11px;color:var(--text3);">Đã chặn <span id="__uvd_blocked_ads__">${adBlockedCount}</span> URL quảng cáo trong phiên này.</div>
      </div>

      <div class="uvd-card">
        <div style="font-weight:600;margin-bottom:8px;">Sao lưu & Khôi phục</div>
        <button class="uvd-btn uvd-btn-sm" id="__uvd_backup__" style="width:100%;margin-bottom:6px;">Xuất dữ liệu</button>
        <button class="uvd-btn uvd-btn-sm" id="__uvd_restore__" style="width:100%;margin-bottom:6px;">Nhập dữ liệu</button>
        <button class="uvd-btn uvd-btn-sm" id="__uvd_reset__" style="width:100%;background:var(--danger);">Đặt lại tất cả</button>
      </div>

      <div class="uvd-section-title"><span class="uvd-section-num">1</span> Cài đặt Bookmarklet</div>
      <div class="uvd-card uvd-timeline-card">
        <div class="uvd-step"><span class="uvd-step-num">1</span><span class="uvd-step-text">Mở một trang web bất kỳ, bấm vào biểu tượng <strong>⭐ Bookmark</strong> trên thanh địa chỉ.</span></div>
        <div class="uvd-step"><span class="uvd-step-num">2</span><span class="uvd-step-text">Chọn <strong>"Chỉnh sửa"</strong> (Edit).</span></div>
        <div class="uvd-step"><span class="uvd-step-num">3</span><span class="uvd-step-text"><strong>Đặt tên</strong> dễ nhớ, ví dụ: <code class="uvd-inline-code">UMP DL</code></span></div>
        <div class="uvd-step"><span class="uvd-step-num">4</span><span class="uvd-step-text"><strong>Xóa toàn bộ địa chỉ</strong> trong ô URL, dán đoạn code sau vào:</span></div>
        <div class="uvd-code-block"><textarea readonly rows="3">${escapeHtml(bookmarkletCode)}</textarea><button class="uvd-code-copy" data-copy-target="bookmarklet" title="Sao chép">📋</button></div>
        <div class="uvd-step"><span class="uvd-step-num">5</span><span class="uvd-step-text">Bấm <strong>Lưu</strong> (Save).</span></div>
        <div class="uvd-callout"><span class="uvd-callout-icon">💡</span><span>Từ lần sau, bạn chỉ cần gõ tên bookmark (<strong style="color:var(--accent);">UMP DL</strong>) vào thanh địa chỉ rồi chọn nó để kích hoạt. Script luôn tự động cập nhật phiên bản mới nhất.</span></div>
      </div>

      <div class="uvd-section-title"><span class="uvd-section-num">2</span> Sử dụng</div>
      <div class="uvd-card uvd-timeline-card">
        <div class="uvd-step"><span class="uvd-step-num">•</span><span class="uvd-step-text">Mở trang web có video</span></div>
        <div class="uvd-step"><span class="uvd-step-num">•</span><span class="uvd-step-text">Gõ tên bookmark (vd: <code class="uvd-inline-code">UMP DL</code>) vào thanh địa chỉ và chọn nó</span></div>
        <div class="uvd-step"><span class="uvd-step-num">•</span><span class="uvd-step-text">Chọn stream và bấm <strong style="color:var(--accent);">Xem</strong> để mở player overlay</span></div>
        <div class="uvd-step"><span class="uvd-step-num">•</span><span class="uvd-step-text">Trong player: thanh công cụ gồm <strong style="color:var(--accent);">Chất lượng</strong>, <strong style="color:var(--accent);">Tốc độ (+/-)</strong>, <strong style="color:var(--accent);">Toàn màn hình</strong>, <strong style="color:var(--accent);">PiP</strong>, <strong style="color:var(--accent);">Hẹn giờ</strong>, <strong style="color:var(--accent);">Boost</strong>, <strong style="color:var(--accent);">Mute</strong>, <strong style="color:var(--accent);">📷 Screenshot</strong>, <strong style="color:var(--accent);">📌 Ghim</strong></span></div>
        <div class="uvd-step"><span class="uvd-step-num">•</span><span class="uvd-step-text">Chạm đúp 2 lần vào nửa trái/phải video để tua lùi/tiến (số giây tùy chỉnh trong Cài đặt)</span></div>
        <div class="uvd-step"><span class="uvd-step-num">•</span><span class="uvd-step-text">Click vào thời gian để chuyển đổi giữa <strong>còn lại</strong> / <strong>đã qua</strong> / <strong>tổng</strong>.</span></div>
        <div class="uvd-callout"><span class="uvd-callout-icon">▶</span><span>Nút <strong style="color:var(--accent);">▶</strong> trên header: tự động bấm giúp các nút Play ẩn để link stream lộ ra. Nếu không ăn, đặt CSS selector riêng ở dòng "Play selector".</span></div>
        <div class="uvd-callout"><span class="uvd-callout-icon">⬇</span><span>Với luồng HLS (.m3u8), khi bấm <strong style="color:var(--accent);">Chất lượng</strong>, có thêm tùy chọn <strong style="color:var(--gold);">Tải TS (toàn bộ)</strong> để tải và ghép các segment thành file .ts. Sau đó có thể dùng ffmpeg chuyển sang MP4.</span></div>
      </div>

      <div class="uvd-section-title"><span class="uvd-section-num">3</span> Tải video với yt-dlp và Termux</div>
      <div class="uvd-card uvd-timeline-card">
        <div class="uvd-step"><span class="uvd-step-num">1</span><span class="uvd-step-text"><strong>Cài đặt yt-dlp trên Termux:</strong></span></div>
        <code class="uvd-inline-code" style="display:block;margin:4px 0;">pkg update && pkg upgrade -y</code>
        <code class="uvd-inline-code" style="display:block;margin:4px 0;">pkg install python ffmpeg -y</code>
        <code class="uvd-inline-code" style="display:block;margin:4px 0 10px;">pip install yt-dlp</code>
        <div class="uvd-step"><span class="uvd-step-num">2</span><span class="uvd-step-text">Mở tab <strong style="color:var(--accent);">Streams</strong>, chọn stream cần tải</span></div>
        <div class="uvd-step"><span class="uvd-step-num">3</span><span class="uvd-step-text">Bấm <strong style="color:var(--accent);">Lệnh tải</strong> → chọn lệnh phù hợp, sao chép</span></div>
        <div class="uvd-step"><span class="uvd-step-num">4</span><span class="uvd-step-text">Mở Termux, dán lệnh vào và bấm Enter để tải</span></div>
        <div class="uvd-callout uvd-callout-warn"><span class="uvd-callout-icon">⚠️</span><span><strong style="color:var(--text);">Lưu ý:</strong> Nhớ cấp quyền lưu file cho Termux (Android 11+): <code class="uvd-inline-code">termux-setup-storage</code></span></div>
      </div>

      <div class="uvd-profile-footer">© ${new Date().getFullYear()} nguyenquocngu91 · UMP DL v${VERSION} · Made for Chrome Android</div>
    `;

    container.querySelectorAll('.uvd-btn').forEach(b => b.addEventListener('click', addRipple));

    container.querySelectorAll('.uvd-code-copy').forEach(b => {
      b.onclick = function() {
        if (this.dataset.copyTarget === 'bookmarklet') { copy(bookmarkletCode); toast('Đã sao chép code bookmarklet!'); }
      };
    });

    // Toggle handlers
    container.querySelectorAll('.uvd-toggle-switch').forEach(btn => {
      btn.onclick = function() {
        const isOn = btn.classList.toggle('uvd-toggle-on');
        switch (btn.id) {
          case '__uvd_toggle_reducemotion__':
            data.settings.reduceMotion = isOn;
            Storage.set(data);
            applyMotionPref(document.getElementById('__uvd__'));
            toast(isOn ? 'Đã bật chế độ hiệu suất' : 'Đã tắt chế độ hiệu suất');
            break;
          case '__uvd_toggle_glow__':
            data.settings.glowEffects = isOn;
            Storage.set(data);
            applyEffectsPref(document.getElementById('__uvd__'));
            if (playerState.overlay) applyEffectsPref(playerState.overlay);
            toast(isOn ? 'Đã bật hiệu ứng phát sáng' : 'Đã tắt hiệu ứng phát sáng');
            break;
          case '__uvd_toggle_blockautoplay__':
            data.settings.blockAutoplay = isOn;
            Storage.set(data);
            if (isOn) { document.querySelectorAll('video,audio').forEach(neutralizeMedia); }
            toast(isOn ? 'Đã bật chặn tự phát' : 'Đã tắt chặn tự phát');
            break;
          case '__uvd_toggle_resume__':
            data.settings.resumePlayback = isOn;
            Storage.set(data);
            break;
          case '__uvd_toggle_autofs__':
            data.settings.autoFullscreen = isOn;
            Storage.set(data);
            break;
          case '__uvd_toggle_autonext__':
            data.settings.autoNext = isOn;
            Storage.set(data);
            break;
          case '__uvd_toggle_datasaver__':
            data.settings.dataSaver = isOn;
            Storage.set(data);
            break;
          case '__uvd_toggle_boost__':
            data.settings.volumeBoost = isOn;
            Storage.set(data);
            break;
          case '__uvd_toggle_autohide__':
            data.settings.autoHideControls = isOn;
            Storage.set(data);
            break;
          case '__uvd_toggle_showremaining__':
            data.settings.showRemainingTime = isOn;
            Storage.set(data);
            break;
        }
      };
    });

    // Range sliders
    document.getElementById('__uvd_blur_range__').oninput = function() {
      const val = parseInt(this.value);
      data.settings.blurIntensity = val;
      document.getElementById('__uvd_blur_val__').textContent = val + 'px';
      Storage.set(data);
      applyMotionPref(document.getElementById('__uvd__'));
    };
    document.getElementById('__uvd_transition_range__').oninput = function() {
      const val = parseFloat(this.value);
      data.settings.transitionSpeed = val;
      document.getElementById('__uvd_transition_val__').textContent = val + 's';
      Storage.set(data);
      applyMotionPref(document.getElementById('__uvd__'));
    };
    document.getElementById('__uvd_fx_range__').oninput = function() {
      const val = parseInt(this.value);
      data.settings.effectsIntensity = val;
      document.getElementById('__uvd_fx_val__').textContent = val + '%';
      Storage.set(data);
      applyEffectsPref(document.getElementById('__uvd__'));
      if (playerState.overlay) applyEffectsPref(playerState.overlay);
    };
    document.getElementById('__uvd_boost_range__').oninput = function() {
      data.settings.volumeBoostMax = parseInt(this.value);
      document.getElementById('__uvd_boost_val__').textContent = data.settings.volumeBoostMax + '%';
      Storage.set(data);
    };

    // Selects
    document.getElementById('__uvd_set_speed__').onchange = function() {
      data.settings.defaultSpeed = parseFloat(this.value);
      Storage.set(data);
    };
    document.getElementById('__uvd_set_quality__').onchange = function() {
      data.settings.defaultQuality = this.value;
      Storage.set(data);
    };
    document.getElementById('__uvd_doubletap_seconds__').onchange = function() {
      let val = parseInt(this.value) || 10;
      if (val < 1) val = 1;
      if (val > 60) val = 60;
      data.settings.doubleTapSeconds = val;
      Storage.set(data);
      toast('Đã đặt tua ' + val + ' giây');
    };
    document.getElementById('__uvd_hide_delay__').onchange = function() {
      let val = parseInt(this.value) || 5;
      if (val < 1) val = 1;
      if (val > 30) val = 30;
      data.settings.hideDelay = val;
      Storage.set(data);
      toast('Đã đặt ẩn sau ' + val + ' giây');
    };

    // Filter
    document.getElementById('__uvd_save_filter__').onclick = function() {
      const raw = document.getElementById('__uvd_filter_text__').value;
      data.filterlist = raw.split('\n').map(s => s.trim()).filter(Boolean);
      Storage.set(data);
      compileAdFilters();
      toast('Đã lưu filterlist (' + data.filterlist.length + ' mục)');
      buildUI();
    };
    document.getElementById('__uvd_import_filter__').onclick = function() {
      const inp = document.createElement('input');
      inp.type = 'file';
      inp.accept = '.txt,.json';
      inp.onchange = function(e) {
        const reader = new FileReader();
        reader.onload = function(ev) {
          let text = ev.target.result;
          try {
            const j = JSON.parse(text);
            if (Array.isArray(j.filterlist)) text = j.filterlist.join('\n');
          } catch {}
          document.getElementById('__uvd_filter_text__').value = text;
        };
        reader.readAsText(e.target.files[0]);
      };
      inp.click();
    };

    // Backup/Restore/Reset
    document.getElementById('__uvd_backup__').onclick = function() {
      const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'uvd_backup.json';
      a.click();
    };
    document.getElementById('__uvd_restore__').onclick = function() {
      const inp = document.createElement('input');
      inp.type = 'file';
      inp.accept = '.json';
      inp.onchange = function(e) {
        const reader = new FileReader();
        reader.onload = function(ev) {
          try {
            data = Object.assign(data, JSON.parse(ev.target.result));
            Storage.set(data);
            toast('Đã nhập!');
            buildUI();
          } catch {
            toast('File không hợp lệ', 'var(--danger)');
          }
        };
        reader.readAsText(e.target.files[0]);
      };
      inp.click();
    };
    document.getElementById('__uvd_reset__').onclick = function() {
      if (confirm('Xóa toàn bộ dữ liệu?')) {
        localStorage.removeItem(STORAGE_KEY);
        data = { favorites: [], siteProfiles: {}, history: [], filterlist: [], playbackPositions: {}, clickedButtons: {}, settings: Object.assign({}, data.settings) };
        compileAdFilters();
        buildUI();
      }
    };
  }

  // ===== ADD TO HISTORY =====
  function addToHistory(url, type) {
    data.history = data.history || [];
    data.history.unshift({ url, type, title: pageInfo.title, host: pageInfo.host, timestamp: Date.now() });
    if (data.history.length > 50) data.history = data.history.slice(0, 50);
    Storage.set(data);
  }

  // ===== ADD TO FILTERLIST =====
  function addToFilterlist(pattern) {
    if (!pattern) return;
    pattern = pattern.trim().toLowerCase();
    if (data.filterlist.indexOf(pattern) === -1) {
      data.filterlist.push(pattern);
      Storage.set(data);
      compileAdFilters();
      toast('Đã thêm "' + pattern + '" vào filter');
      buildUI();
    } else {
      toast('Rule đã tồn tại');
    }
  }

  // ===== EXPORT =====
  function exportData(format) {
    const arr = [...urlMap.entries()].map(e => ({ url: e[0], type: e[1].type, source: e[1].source, title: pageInfo.title }));
    let content, mime, filename;
    if (format === 'json') {
      content = JSON.stringify({ page: pageInfo, streams: arr }, null, 2);
      mime = 'application/json';
      filename = pageInfo.title + '_streams.json';
    } else if (format === 'csv') {
      content = 'Type,URL,Source,Title\n' + arr.map(a => a.type + ',"' + a.url + '",' + a.source + ',"' + a.title + '"').join('\n');
      mime = 'text/csv';
      filename = pageInfo.title + '_streams.csv';
    } else if (format === 'm3u') {
      content = '#EXTM3U\n' + arr.filter(a => a.type !== 'IFRAME').map(a => '#EXTINF:-1,' + a.title + ' [' + a.type + ']\n' + a.url).join('\n');
      mime = 'audio/x-mpegurl';
      filename = pageInfo.title + '.m3u';
    } else {
      content = arr.map(a => a.url).join('\n');
      mime = 'text/plain';
      filename = pageInfo.title + '_urls.txt';
    }
    const blob = new Blob([content], { type: mime });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
    toast('Đã xuất ' + format.toUpperCase());
  }

  // ===== RIPPLE =====
  function addRipple(e) {
    const btn = e.currentTarget;
    const ripple = document.createElement('span');
    ripple.className = 'uvd-ripple';
    const rect = btn.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height);
    ripple.style.width = ripple.style.height = size + 'px';
    ripple.style.left = (e.clientX - rect.left - size/2) + 'px';
    ripple.style.top = (e.clientY - rect.top - size/2) + 'px';
    btn.appendChild(ripple);
    ripple.addEventListener('animationend', function() { ripple.remove(); });
  }

  // ===== POPUP BLOCKER =====
  let popupBlockActive = false;
  let originalWindowOpen = null;
  let blockedPopupCount = 0;

  function killBlankLinks(e) {
    const t = e.target;
    if (t.closest && (t.closest('#__uvd__') || t.closest('#__uvd_player_overlay__'))) return;
    let node = t;
    while (node && node !== document) {
      if (node && node.tagName === 'A') {
        const tg = node.target;
        if (tg && tg !== '_self' && tg !== '_top' && tg !== '_parent') {
          e.preventDefault();
          e.stopPropagation();
          blockedPopupCount++;
          return;
        }
      }
      node = node.parentNode;
    }
  }

  function installPopupBlock() {
    if (popupBlockActive) return;
    popupBlockActive = true;
    originalWindowOpen = window.open;
    window.open = function() { blockedPopupCount++; return null; };
    ['click', 'mousedown', 'pointerdown', 'auxclick'].forEach(type => {
      document.addEventListener(type, killBlankLinks, true);
    });
  }

  function uninstallPopupBlock() {
    if (!popupBlockActive) return;
    popupBlockActive = false;
    if (originalWindowOpen) window.open = originalWindowOpen;
    ['click', 'mousedown', 'pointerdown', 'auxclick'].forEach(type => {
      document.removeEventListener(type, killBlankLinks, true);
    });
  }

  window.__uvdSafeOpen = function(url) {
    if (originalWindowOpen) {
      return originalWindowOpen(url, '_blank');
    }
    return window.open(url, '_blank');
  };

  // ===== CLEANUP =====
  const cleanupFunctions = [];
  function addCleanup(fn) { cleanupFunctions.push(fn); }
  function runCleanup() {
    cleanupFunctions.forEach(fn => { try { fn(); } catch {} });
    cleanupFunctions.length = 0;
  }

  // Remove old elements
  let oldPanel = document.getElementById('__uvd__');
  if (oldPanel) oldPanel.remove();
  let oldMinBtn = document.getElementById('__uvd_min_float__');
  if (oldMinBtn) oldMinBtn.remove();

  // ===== PANEL MINIMIZE =====
  function minimizeScriptPanel() {
    const panel = document.getElementById('__uvd__');
    const header = document.getElementById('__uvd_header__');
    if (!panel || !header || panel.classList.contains('uvd-panel-minimized')) return;
    const startHeight = panel.getBoundingClientRect().height;
    const targetHeight = (header.getBoundingClientRect().bottom - panel.getBoundingClientRect().top) + 16;
    panel.style.height = startHeight + 'px';
    panel.style.transition = 'height .38s cubic-bezier(.4,0,.2,1)';
    void panel.offsetHeight;
    panel.classList.add('uvd-panel-minimized');
    panel.style.height = targetHeight + 'px';
    const btn = document.getElementById('__uvd_minimize_script__');
    if (btn) btn.textContent = '▲';
  }

  function restoreScriptPanel() {
    const panel = document.getElementById('__uvd__');
    if (!panel || !panel.classList.contains('uvd-panel-minimized')) return;
    const targetHeight = window.innerHeight - 30;
    panel.style.transition = 'height .38s cubic-bezier(.4,0,.2,1)';
    panel.classList.remove('uvd-panel-minimized');
    panel.style.height = targetHeight + 'px';
    panel.addEventListener('transitionend', function onEnd(e) {
      if (e.propertyName !== 'height') return;
      panel.removeEventListener('transitionend', onEnd);
      panel.style.height = 'calc(100dvh - 30px)';
      panel.style.transition = '';
    });
    const btn = document.getElementById('__uvd_minimize_script__');
    if (btn) btn.textContent = '▼';
  }

  // ===== INIT =====
  scanDocument(document, 'main');
  try {
    performance.getEntriesByType('resource').forEach(e => {
      if (!isAdUrl(e.name)) findUrls(e.name, 'network:perf');
    });
  } catch {}

  installMonitor();
  installPopupBlock();

  // Panel observer: only observe body for removal
  const panelObserver = new MutationObserver(() => {
    if (!document.getElementById('__uvd__')) {
      stopMonitor();
      uninstallPopupBlock();
      panelObserver.disconnect();
      runCleanup();
    }
  });
  panelObserver.observe(document.body, { childList: true, subtree: false });
  addCleanup(() => panelObserver.disconnect());

  // Auto-click after a short delay
  function runAutoClickAndRescan(silent) {
    const beforeCount = urlMap.size;
    const clicked = autoClickPlay(document, 0, !silent);
    const delays = [1200, 2200, 3400];
    let reportedAt = -1;
    delays.forEach((delay, idx) => {
      setTimeout(() => {
        scanDocument(document, 'autoclick-rescan');
        const afterCount = urlMap.size;
        const found = afterCount - beforeCount;
        if (found > 0 && reportedAt === -1) {
          reportedAt = idx;
          toast('▶ Tự động Play: tìm thêm ' + found + ' luồng mới');
          if (document.getElementById('__uvd__')) buildUI();
          setTimeout(() => {
            const n = pauseAllPlayingVideos();
            if (n > 0) toast('⏸ Đã tạm dừng video gốc');
          }, 800);
        } else if (found > 0 && document.getElementById('__uvd__')) {
          buildUI();
        } else if (idx === delays.length - 1 && !silent && reportedAt === -1) {
          toast(clicked > 0 ? 'Đã bấm Play nhưng chưa thấy link mới — thử bấm tay' : 'Không tìm thấy nút Play');
        }
      }, delay);
    });
  }

  window.__uvd_autoClickPlay = function() { runAutoClickAndRescan(false); };
  setTimeout(() => runAutoClickAndRescan(true), 400);

  // Build UI
  buildUI();

  console.log('UMP DL v' + VERSION + ' PRO – Optimized with HLS downloader');
  toast('V' + VERSION + ' PRO sẵn sàng!');
})();