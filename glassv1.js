(function() {
  'use strict';

  const VERSION = '7.1.0';
  const STORAGE_KEY = 'uvd_data_v71';

  // --- Storage helpers ---
  function getStorage() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; }
    catch(e) { return {}; }
  }
  function setStorage(data) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); }
    catch(e) {}
  }

  let data = getStorage();
  data.playbackPositions = data.playbackPositions || {};
  data.favorites = data.favorites || [];
  data.settings = Object.assign({
    resumePlayback: true,
    blockAutoplay: true,
    doubleTapSeconds: 10,
    defaultSpeed: 1,
    autoFullscreen: false,
    glowEffects: true,
    effectsIntensity: 60,
  }, data.settings || {});

  // --- Page info ---
  const host = location.hostname.replace('www.', '');
  const pageInfo = {
    title: (document.title || 'video').replace(/[^\w\s\u00C0-\u1EF9]/g, '').substring(0, 60).trim() || 'video',
    url: location.href,
    host: host,
    referer: location.origin + '/',
  };

  // --- URL scanning ---
  let urls = new Map();
  const patterns = [
    { re: /https?:\/\/[^\s"'<>()\\]+\.m3u8[^\s"'<>()\\]*/gi, type: 'M3U8', icon: '📺' },
    { re: /https?:\/\/[^\s"'<>()\\]+\.mpd[^\s"'<>()\\]*/gi, type: 'MPD', icon: '📡' },
    { re: /https?:\/\/[^\s"'<>()\\]+\.mp4[^\s"'<>()\\]*/gi, type: 'MP4', icon: '🎬' },
    { re: /https?:\/\/[^\s"'<>()\\]+\.webm[^\s"'<>()\\]*/gi, type: 'WEBM', icon: '🎥' },
    { re: /https?:\/\/[^\s"'<>()\\]+\.mkv[^\s"'<>()\\]*/gi, type: 'MKV', icon: '📹' },
    { re: /blob:https?:\/\/[^\s"'<>()\\]+/gi, type: 'BLOB', icon: '📀' },
    { re: /https?:\/\/[^\s"'<>()\\]+\.ts[^\s"'<>()\\]*/gi, type: 'TS', icon: '🔷' },
  ];

  function findUrls(text, source) {
    if (!text || typeof text !== 'string') return;
    patterns.forEach(p => {
      const matches = text.match(p.re);
      if (matches) {
        matches.forEach(u => {
          u = u.replace(/\\u002F/g, '/').replace(/\\\//g, '/').replace(/&amp;/g, '&').replace(/\\"/g, '');
          if (!urls.has(u)) {
            urls.set(u, { type: p.type, icon: p.icon, source: source, timestamp: Date.now() });
          }
        });
      }
    });
  }

  function scan(doc, src) {
    try {
      doc.querySelectorAll('video, source, audio').forEach(v => {
        if (v.src) findUrls(v.src, src + ':element');
        if (v.currentSrc) findUrls(v.currentSrc, src + ':current');
      });
      doc.querySelectorAll('script').forEach(s => findUrls(s.textContent, src + ':script'));
      findUrls(doc.documentElement.outerHTML, src + ':html');
      doc.querySelectorAll('iframe').forEach(i => {
        if (i.src) findUrls(i.src, 'iframe');
        try { if (i.contentDocument) scan(i.contentDocument, 'iframe'); }
        catch(e) {}
      });
    } catch(e) {}
  }

  // --- Block autoplay ---
  const nativePlay = HTMLMediaElement.prototype.play;
  function isAllowedMedia(el) {
    return !!(el && (el.__uvdAllow || el.id === 'uvd-player-video'));
  }
  HTMLMediaElement.prototype.play = function() {
    if (data.settings.blockAutoplay && !isAllowedMedia(this)) {
      setTimeout(() => { try { this.pause(); } catch(e) {} }, 0);
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
    } catch(e) {}
  }
  document.addEventListener('play', e => {
    if (!data.settings.blockAutoplay) return;
    const el = e.target;
    if (el && (el.tagName === 'VIDEO' || el.tagName === 'AUDIO') && !isAllowedMedia(el)) {
      try { el.pause(); } catch(err) {}
    }
  }, true);
  const observer = new MutationObserver(mutations => {
    if (!data.settings.blockAutoplay) return;
    mutations.forEach(m => {
      m.addedNodes.forEach(node => {
        if (!(node instanceof Element)) return;
        if (node.tagName === 'VIDEO' || node.tagName === 'AUDIO') neutralizeMedia(node);
        if (node.querySelectorAll) {
          node.querySelectorAll('video,audio').forEach(neutralizeMedia);
        }
      });
    });
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  document.querySelectorAll('video,audio').forEach(neutralizeMedia);

  // --- Initial scan ---
  scan(document, 'main');
  try {
    performance.getEntriesByType('resource').forEach(e => findUrls(e.name, 'network'));
  } catch(e) {}

  // --- Helper functions ---
  function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function formatTime(sec) {
    if (!sec || sec < 0) return '00:00';
    sec = Math.floor(sec);
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    if (h > 0) return h + ':' + String(m).padStart(2,'0') + ':' + String(s).padStart(2,'0');
    return String(m).padStart(2,'0') + ':' + String(s).padStart(2,'0');
  }

  function getPlaybackPosition(url) {
    return data.playbackPositions[url] || null;
  }
  function savePlaybackPosition(url, video) {
    if (!url || !video || !video.duration || isNaN(video.duration)) return;
    const pct = video.currentTime / video.duration;
    if (pct < 0.02 || pct > 0.95) {
      delete data.playbackPositions[url];
    } else {
      data.playbackPositions[url] = { time: video.currentTime, duration: video.duration, updatedAt: Date.now() };
    }
    setStorage(data);
  }

  function toast(msg, type = 'info') {
    const colors = {
      info: 'linear-gradient(135deg, #a78bfa, #7c3aed)',
      success: 'linear-gradient(135deg, #34d399, #059669)',
      warning: 'linear-gradient(135deg, #fbbf24, #d97706)',
      error: 'linear-gradient(135deg, #f87171, #dc2626)',
    };
    const el = document.createElement('div');
    el.textContent = msg;
    Object.assign(el.style, {
      position: 'fixed',
      bottom: '30px',
      left: '50%',
      transform: 'translateX(-50%)',
      background: 'rgba(255,255,255,0.15)',
      backdropFilter: 'blur(20px) saturate(180%)',
      WebkitBackdropFilter: 'blur(20px) saturate(180%)',
      color: '#1a1a2e',
      padding: '14px 28px',
      borderRadius: '16px',
      zIndex: 2147483649,
      font: '600 14px -apple-system, system-ui, sans-serif',
      boxShadow: '0 8px 32px rgba(124, 58, 237, 0.3), inset 0 1px 0 rgba(255,255,255,0.4)',
      border: '1px solid rgba(255,255,255,0.3)',
      animation: 'uvdToastIn 0.4s ease',
      maxWidth: '90%',
      textAlign: 'center',
      backgroundImage: colors[type] || colors.info,
      color: '#fff',
    });
    document.documentElement.appendChild(el);
    setTimeout(() => {
      el.style.opacity = '0';
      el.style.transform = 'translateX(-50%) translateY(20px)';
      el.style.transition = 'all 0.4s ease';
      setTimeout(() => el.remove(), 500);
    }, 2800);
  }

  // --- CSS with beautiful glassmorphism ---
  const styleId = 'uvd-glass-style';
  if (document.getElementById(styleId)) document.getElementById(styleId).remove();
  const style = document.createElement('style');
  style.id = styleId;
  style.textContent = `
    @keyframes uvdToastIn {
      0% { opacity:0; transform: translateX(-50%) translateY(30px) scale(0.9); }
      100% { opacity:1; transform: translateX(-50%) translateY(0) scale(1); }
    }
    @keyframes uvdFadeIn {
      0% { opacity:0; transform: scale(0.95) translateY(10px); }
      100% { opacity:1; transform: scale(1) translateY(0); }
    }
    @keyframes uvdCardIn {
      0% { opacity:0; transform: translateY(15px) scale(0.98); }
      100% { opacity:1; transform: translateY(0) scale(1); }
    }
    @keyframes uvdPulse {
      0%, 100% { opacity:1; transform: scale(1); }
      50% { opacity:0.6; transform: scale(1.05); }
    }
    @keyframes uvdGlow {
      0%, 100% { box-shadow: 0 0 20px rgba(124, 58, 237, 0.3), 0 0 60px rgba(124, 58, 237, 0.1); }
      50% { box-shadow: 0 0 30px rgba(124, 58, 237, 0.5), 0 0 80px rgba(124, 58, 237, 0.2); }
    }
    @keyframes uvdLiquidDrift {
      0% { transform: translate(-5%, -5%) scale(1); }
      50% { transform: translate(5%, 5%) scale(1.1); }
      100% { transform: translate(-5%, -5%) scale(1); }
    }

    #uvd-panel {
      position: fixed;
      top: 20px;
      left: 20px;
      right: 20px;
      max-width: 560px;
      margin: 0 auto;
      background: rgba(255, 255, 255, 0.12);
      backdrop-filter: blur(32px) saturate(180%);
      -webkit-backdrop-filter: blur(32px) saturate(180%);
      border: 1px solid rgba(255, 255, 255, 0.25);
      border-radius: 28px;
      box-shadow: 0 25px 60px rgba(124, 58, 237, 0.25), 
                  inset 0 1px 0 rgba(255,255,255,0.3),
                  0 0 40px rgba(124, 58, 237, 0.08);
      z-index: 2147483647;
      padding: 20px;
      max-height: 85vh;
      display: flex;
      flex-direction: column;
      animation: uvdFadeIn 0.5s ease;
      font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', Roboto, sans-serif;
      color: #1a1a2e;
      transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
      overflow: hidden;
    }
    #uvd-panel::before {
      content: '';
      position: absolute;
      inset: -50%;
      z-index: -1;
      background: radial-gradient(ellipse at 20% 30%, rgba(167, 139, 250, 0.15), transparent 60%),
                  radial-gradient(ellipse at 80% 70%, rgba(124, 58, 237, 0.1), transparent 50%);
      animation: uvdLiquidDrift 20s ease-in-out infinite;
      pointer-events: none;
    }
    #uvd-panel.uvd-minimized {
      max-height: 64px;
      padding: 14px 20px;
      overflow: hidden;
    }
    #uvd-panel.uvd-minimized .uvd-content {
      display: none;
    }
    #uvd-panel .uvd-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-shrink: 0;
      margin-bottom: 14px;
      position: relative;
    }
    #uvd-panel .uvd-header .uvd-brand {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    #uvd-panel .uvd-header .uvd-brand .uvd-logo {
      width: 36px;
      height: 36px;
      border-radius: 12px;
      background: linear-gradient(135deg, #a78bfa, #7c3aed);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 18px;
      color: #fff;
      box-shadow: 0 4px 12px rgba(124, 58, 237, 0.4);
    }
    #uvd-panel .uvd-header .uvd-brand h2 {
      font-size: 20px;
      font-weight: 700;
      background: linear-gradient(135deg, #7c3aed, #a78bfa, #6d28d9);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      margin: 0;
      letter-spacing: -0.5px;
    }
    #uvd-panel .uvd-header .uvd-brand .uvd-version {
      font-size: 10px;
      background: rgba(124, 58, 237, 0.15);
      padding: 2px 8px;
      border-radius: 20px;
      color: #7c3aed;
      -webkit-text-fill-color: #7c3aed;
      font-weight: 600;
      border: 1px solid rgba(124, 58, 237, 0.2);
    }
    #uvd-panel .uvd-header .uvd-actions {
      display: flex;
      gap: 6px;
    }
    #uvd-panel .uvd-header button {
      background: rgba(255, 255, 255, 0.15);
      border: 1px solid rgba(255, 255, 255, 0.2);
      border-radius: 40px;
      color: #4a4a6a;
      padding: 6px 14px;
      font-size: 13px;
      cursor: pointer;
      transition: all 0.25s ease;
      backdrop-filter: blur(4px);
      font-weight: 600;
    }
    #uvd-panel .uvd-header button:hover {
      background: rgba(255, 255, 255, 0.3);
      transform: scale(1.05);
      box-shadow: 0 4px 12px rgba(124, 58, 237, 0.2);
    }
    #uvd-panel .uvd-header button.uvd-close {
      background: rgba(239, 68, 68, 0.15);
      color: #ef4444;
      border-color: rgba(239, 68, 68, 0.2);
    }
    #uvd-panel .uvd-header button.uvd-close:hover {
      background: rgba(239, 68, 68, 0.25);
    }
    #uvd-panel .uvd-tabs {
      display: flex;
      gap: 4px;
      background: rgba(255, 255, 255, 0.08);
      padding: 4px;
      border-radius: 16px;
      margin-bottom: 14px;
      flex-shrink: 0;
      border: 1px solid rgba(255, 255, 255, 0.1);
    }
    #uvd-panel .uvd-tabs .uvd-tab {
      flex: 1;
      padding: 8px 12px;
      border: none;
      border-radius: 12px;
      background: transparent;
      color: #6a6a8e;
      font-weight: 600;
      font-size: 13px;
      cursor: pointer;
      transition: all 0.3s ease;
      text-align: center;
    }
    #uvd-panel .uvd-tabs .uvd-tab:hover {
      color: #4a4a6a;
      background: rgba(255, 255, 255, 0.1);
    }
    #uvd-panel .uvd-tabs .uvd-tab.uvd-tab-active {
      background: rgba(124, 58, 237, 0.15);
      color: #7c3aed;
      box-shadow: 0 2px 8px rgba(124, 58, 237, 0.15);
      border: 1px solid rgba(124, 58, 237, 0.2);
    }
    #uvd-panel .uvd-content {
      flex: 1;
      overflow: hidden;
      position: relative;
      min-height: 0;
    }
    #uvd-panel .uvd-tab-content {
      display: none;
      height: 100%;
      overflow-y: auto;
      padding-right: 4px;
      animation: uvdFadeIn 0.3s ease;
    }
    #uvd-panel .uvd-tab-content.uvd-active {
      display: block;
    }
    #uvd-panel .uvd-tab-content::-webkit-scrollbar {
      width: 4px;
    }
    #uvd-panel .uvd-tab-content::-webkit-scrollbar-thumb {
      background: rgba(124, 58, 237, 0.3);
      border-radius: 4px;
    }
    #uvd-panel .uvd-tab-content::-webkit-scrollbar-track {
      background: transparent;
    }

    /* Cards */
    .uvd-card {
      display: flex;
      align-items: center;
      gap: 14px;
      background: rgba(255, 255, 255, 0.08);
      backdrop-filter: blur(8px);
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 16px;
      padding: 12px 16px;
      margin-bottom: 10px;
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      cursor: default;
      animation: uvdCardIn 0.4s ease both;
      position: relative;
      overflow: hidden;
    }
    .uvd-card::before {
      content: '';
      position: absolute;
      inset: 0;
      background: linear-gradient(135deg, rgba(124, 58, 237, 0.05), transparent 50%);
      opacity: 0;
      transition: opacity 0.3s ease;
      pointer-events: none;
    }
    .uvd-card:hover::before {
      opacity: 1;
    }
    .uvd-card:hover {
      transform: translateY(-2px) scale(1.01);
      background: rgba(255, 255, 255, 0.15);
      border-color: rgba(124, 58, 237, 0.3);
      box-shadow: 0 8px 25px rgba(124, 58, 237, 0.15);
    }
    .uvd-card .uvd-icon {
      flex-shrink: 0;
      width: 48px;
      height: 48px;
      border-radius: 14px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 20px;
      background: linear-gradient(135deg, rgba(167, 139, 250, 0.2), rgba(124, 58, 237, 0.1));
      border: 1px solid rgba(167, 139, 250, 0.2);
    }
    .uvd-card .uvd-info {
      flex: 1;
      min-width: 0;
    }
    .uvd-card .uvd-info .uvd-title {
      font-weight: 600;
      font-size: 14px;
      color: #1a1a2e;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .uvd-card .uvd-info .uvd-meta {
      font-size: 12px;
      color: #6a6a8e;
      margin-top: 3px;
      display: flex;
      gap: 8px;
      align-items: center;
    }
    .uvd-card .uvd-info .uvd-meta .uvd-badge {
      background: rgba(124, 58, 237, 0.12);
      padding: 1px 10px;
      border-radius: 20px;
      font-size: 10px;
      font-weight: 600;
      color: #7c3aed;
      border: 1px solid rgba(124, 58, 237, 0.15);
    }
    .uvd-card .uvd-actions-card {
      display: flex;
      gap: 6px;
      flex-shrink: 0;
    }
    .uvd-card .uvd-play-btn {
      width: 40px;
      height: 40px;
      border-radius: 40px;
      background: linear-gradient(135deg, #a78bfa, #7c3aed);
      border: none;
      color: #fff;
      font-size: 16px;
      cursor: pointer;
      transition: all 0.25s ease;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 4px 15px rgba(124, 58, 237, 0.3);
    }
    .uvd-card .uvd-play-btn:hover {
      transform: scale(1.08);
      box-shadow: 0 6px 25px rgba(124, 58, 237, 0.5);
    }
    .uvd-card .uvd-play-btn:active {
      transform: scale(0.92);
    }
    .uvd-card .uvd-fav-btn {
      width: 36px;
      height: 36px;
      border-radius: 40px;
      background: rgba(255, 255, 255, 0.1);
      border: 1px solid rgba(255, 255, 255, 0.15);
      color: #6a6a8e;
      font-size: 14px;
      cursor: pointer;
      transition: all 0.25s ease;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .uvd-card .uvd-fav-btn:hover {
      background: rgba(239, 68, 68, 0.15);
      color: #ef4444;
      border-color: rgba(239, 68, 68, 0.3);
    }
    .uvd-card .uvd-fav-btn.uvd-faved {
      color: #ef4444;
      background: rgba(239, 68, 68, 0.1);
      border-color: rgba(239, 68, 68, 0.2);
    }

    .uvd-empty {
      text-align: center;
      padding: 50px 20px;
      color: #6a6a8e;
    }
    .uvd-empty .uvd-empty-icon {
      font-size: 48px;
      margin-bottom: 12px;
      display: block;
    }
    .uvd-empty .uvd-empty-text {
      font-size: 15px;
      font-weight: 500;
    }
    .uvd-empty .uvd-empty-sub {
      font-size: 13px;
      margin-top: 6px;
      opacity: 0.7;
    }

    /* Settings */
    .uvd-setting-group {
      background: rgba(255, 255, 255, 0.06);
      border-radius: 16px;
      padding: 16px;
      margin-bottom: 12px;
      border: 1px solid rgba(255, 255, 255, 0.08);
    }
    .uvd-setting-group .uvd-setting-label {
      font-weight: 600;
      font-size: 14px;
      color: #1a1a2e;
      margin-bottom: 10px;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .uvd-setting-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 8px 0;
      border-bottom: 1px solid rgba(0,0,0,0.04);
    }
    .uvd-setting-row:last-child {
      border-bottom: none;
    }
    .uvd-setting-row span {
      font-size: 13px;
      color: #4a4a6a;
    }
    .uvd-toggle {
      width: 48px;
      height: 28px;
      border-radius: 14px;
      background: rgba(0,0,0,0.08);
      border: 2px solid rgba(0,0,0,0.06);
      position: relative;
      cursor: pointer;
      transition: all 0.3s ease;
      flex-shrink: 0;
    }
    .uvd-toggle.uvd-toggle-on {
      background: linear-gradient(135deg, #a78bfa, #7c3aed);
      border-color: #7c3aed;
    }
    .uvd-toggle .uvd-toggle-knob {
      position: absolute;
      top: 2px;
      left: 2px;
      width: 20px;
      height: 20px;
      border-radius: 50%;
      background: #fff;
      transition: all 0.3s ease;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    .uvd-toggle.uvd-toggle-on .uvd-toggle-knob {
      transform: translateX(20px);
    }
    .uvd-setting-select {
      background: rgba(255, 255, 255, 0.1);
      border: 1px solid rgba(0,0,0,0.06);
      border-radius: 10px;
      padding: 8px 14px;
      font-size: 13px;
      color: #1a1a2e;
      font-weight: 500;
      cursor: pointer;
      outline: none;
    }
    .uvd-setting-select:focus {
      border-color: #7c3aed;
      box-shadow: 0 0 0 3px rgba(124, 58, 237, 0.1);
    }

    /* Player Overlay */
    #uvd-player-overlay {
      position: fixed;
      inset: 0;
      background: rgba(10, 10, 20, 0.92);
      backdrop-filter: blur(20px) saturate(150%);
      z-index: 2147483648;
      display: flex;
      flex-direction: column;
      animation: uvdFadeIn 0.4s ease;
    }
    #uvd-player-overlay .uvd-player-header {
      padding: 16px 24px;
      background: rgba(255, 255, 255, 0.04);
      backdrop-filter: blur(12px);
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-shrink: 0;
      border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    }
    #uvd-player-overlay .uvd-player-header .uvd-player-title {
      font-weight: 600;
      font-size: 16px;
      color: #fff;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 60%;
    }
    #uvd-player-overlay .uvd-player-header .uvd-player-actions {
      display: flex;
      gap: 8px;
    }
    #uvd-player-overlay .uvd-player-header button {
      background: rgba(255, 255, 255, 0.06);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 40px;
      color: #c4c4d4;
      padding: 8px 16px;
      font-size: 13px;
      cursor: pointer;
      transition: all 0.25s ease;
      font-weight: 500;
    }
    #uvd-player-overlay .uvd-player-header button:hover {
      background: rgba(255, 255, 255, 0.12);
      color: #fff;
    }
    #uvd-player-overlay .uvd-player-header .uvd-close-player {
      background: rgba(239, 68, 68, 0.12);
      color: #f87171;
      border-color: rgba(239, 68, 68, 0.15);
    }
    #uvd-player-overlay .uvd-player-header .uvd-close-player:hover {
      background: rgba(239, 68, 68, 0.2);
    }
    #uvd-player-overlay .uvd-video-wrapper {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #000;
      position: relative;
    }
    #uvd-player-overlay .uvd-video-wrapper video {
      width: 100%;
      height: 100%;
      display: block;
      object-fit: contain;
    }
    #uvd-player-overlay .uvd-player-footer {
      padding: 12px 24px;
      background: rgba(0,0,0,0.3);
      backdrop-filter: blur(8px);
      flex-shrink: 0;
      border-top: 1px solid rgba(255, 255, 255, 0.04);
      display: flex;
      justify-content: space-between;
      align-items: center;
      color: #8a8aaa;
      font-size: 12px;
    }
    .uvd-player-footer .uvd-speed-control {
      display: flex;
      gap: 4px;
      align-items: center;
    }
    .uvd-player-footer .uvd-speed-control button {
      background: rgba(255,255,255,0.06);
      border: 1px solid rgba(255,255,255,0.06);
      border-radius: 6px;
      color: #aaa;
      padding: 4px 10px;
      font-size: 12px;
      cursor: pointer;
      transition: 0.2s;
    }
    .uvd-player-footer .uvd-speed-control button:hover {
      background: rgba(255,255,255,0.12);
      color: #fff;
    }
    .uvd-player-footer .uvd-speed-control .uvd-speed-current {
      color: #a78bfa;
      font-weight: 600;
      min-width: 32px;
      text-align: center;
    }

    /* Video.js custom theme */
    .uvd-video-wrapper .video-js {
      width: 100% !important;
      height: 100% !important;
      font-family: -apple-system, system-ui, sans-serif;
    }
    .uvd-video-wrapper .video-js .vjs-big-play-button {
      border-radius: 50%;
      background: rgba(124, 58, 237, 0.3);
      border: 2px solid rgba(167, 139, 250, 0.3);
      transition: all 0.3s ease;
    }
    .uvd-video-wrapper .video-js .vjs-big-play-button:hover {
      background: rgba(124, 58, 237, 0.5);
      border-color: rgba(167, 139, 250, 0.6);
      transform: scale(1.05);
    }
    .uvd-video-wrapper .video-js .vjs-control-bar {
      background: rgba(0,0,0,0.5);
      backdrop-filter: blur(8px);
      border-radius: 0 0 12px 12px;
    }
    .uvd-video-wrapper .video-js .vjs-progress-holder .vjs-play-progress {
      background: linear-gradient(135deg, #a78bfa, #7c3aed);
    }
    .uvd-video-wrapper .video-js .vjs-progress-holder .vjs-load-progress {
      background: rgba(255,255,255,0.1);
    }
    .uvd-video-wrapper .video-js .vjs-volume-level {
      background: linear-gradient(135deg, #a78bfa, #7c3aed);
    }
    .uvd-video-wrapper .video-js .vjs-playback-rate .vjs-playback-rate-value {
      color: #a78bfa;
      font-weight: 600;
    }

    /* Responsive */
    @media (max-width: 520px) {
      #uvd-panel {
        top: 12px;
        left: 12px;
        right: 12px;
        padding: 14px;
        border-radius: 20px;
        max-height: 80vh;
      }
      #uvd-panel .uvd-header .uvd-brand h2 {
        font-size: 16px;
      }
      #uvd-panel .uvd-header .uvd-brand .uvd-logo {
        width: 30px;
        height: 30px;
        font-size: 14px;
      }
      #uvd-panel .uvd-tabs .uvd-tab {
        font-size: 11px;
        padding: 6px 8px;
      }
      .uvd-card {
        padding: 10px 12px;
        gap: 10px;
      }
      .uvd-card .uvd-icon {
        width: 40px;
        height: 40px;
        font-size: 16px;
      }
      .uvd-card .uvd-play-btn {
        width: 34px;
        height: 34px;
        font-size: 13px;
      }
      #uvd-player-overlay .uvd-player-header {
        padding: 12px 16px;
      }
      #uvd-player-overlay .uvd-player-header .uvd-player-title {
        font-size: 14px;
        max-width: 50%;
      }
      #uvd-player-overlay .uvd-player-header button {
        font-size: 11px;
        padding: 6px 12px;
      }
    }
  `;
  document.head.appendChild(style);

  // --- State ---
  let currentTab = 'streams';
  let panelMinimized = false;
  let playerInstance = null;
  let playerOverlay = null;

  // --- Build UI ---
  function buildUI() {
    const existing = document.getElementById('uvd-panel');
    if (existing) existing.remove();

    const panel = document.createElement('div');
    panel.id = 'uvd-panel';
    panel.innerHTML = `
      <div class="uvd-header">
        <div class="uvd-brand">
          <div class="uvd-logo">🎬</div>
          <h2>UMP DL</h2>
          <span class="uvd-version">v${VERSION}</span>
        </div>
        <div class="uvd-actions">
          <button id="uvd-toggle-min" title="Thu nhỏ">−</button>
          <button id="uvd-refresh" title="Làm mới">↻</button>
          <button class="uvd-close" id="uvd-close-panel">✕</button>
        </div>
      </div>
      <div class="uvd-tabs" id="uvd-tabs">
        <button class="uvd-tab uvd-tab-active" data-tab="streams">📡 Streams</button>
        <button class="uvd-tab" data-tab="favorites">❤️ Yêu thích</button>
        <button class="uvd-tab" data-tab="settings">⚙️ Cài đặt</button>
      </div>
      <div class="uvd-content">
        <div class="uvd-tab-content uvd-active" id="tab-streams"></div>
        <div class="uvd-tab-content" id="tab-favorites"></div>
        <div class="uvd-tab-content" id="tab-settings"></div>
      </div>
    `;
    document.documentElement.appendChild(panel);

    // Tab switching
    document.querySelectorAll('#uvd-tabs .uvd-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('#uvd-tabs .uvd-tab').forEach(t => t.classList.remove('uvd-tab-active'));
        tab.classList.add('uvd-tab-active');
        const tabId = tab.dataset.tab;
        currentTab = tabId;
        document.querySelectorAll('.uvd-tab-content').forEach(c => c.classList.remove('uvd-active'));
        document.getElementById(`tab-${tabId}`).classList.add('uvd-active');
        renderTab(tabId);
      });
    });

    // Minimize
    document.getElementById('uvd-toggle-min').addEventListener('click', () => {
      panelMinimized = !panelMinimized;
      panel.classList.toggle('uvd-minimized', panelMinimized);
      document.getElementById('uvd-toggle-min').textContent = panelMinimized ? '+' : '−';
    });

    // Refresh
    document.getElementById('uvd-refresh').addEventListener('click', () => {
      scan(document, 'manual');
      renderTab(currentTab);
      toast('🔄 Đã quét lại trang', 'info');
    });

    // Close
    document.getElementById('uvd-close-panel').addEventListener('click', () => {
      panel.remove();
    });

    // Render initial tab
    renderTab('streams');
  }

  // --- Render tabs ---
  function renderTab(tabId) {
    if (tabId === 'streams') renderStreams();
    else if (tabId === 'favorites') renderFavorites();
    else if (tabId === 'settings') renderSettings();
  }

  function renderStreams() {
    const container = document.getElementById('tab-streams');
    if (!container) return;
    const items = Array.from(urls.entries()).map(([url, info]) => ({
      url,
      type: info.type,
      icon: info.icon || '🎬',
      source: info.source,
    }));

    if (items.length === 0) {
      container.innerHTML = `
        <div class="uvd-empty">
          <span class="uvd-empty-icon">🔍</span>
          <div class="uvd-empty-text">Không tìm thấy luồng video</div>
          <div class="uvd-empty-sub">Hãy thử bấm Play trên trang để kích hoạt</div>
        </div>
      `;
      return;
    }

    container.innerHTML = '';
    items.forEach((item, index) => {
      const isFaved = data.favorites.some(f => f.url === item.url);
      const card = document.createElement('div');
      card.className = 'uvd-card';
      card.style.animationDelay = (index * 0.04) + 's';

      card.innerHTML = `
        <div class="uvd-icon">${item.icon}</div>
        <div class="uvd-info">
          <div class="uvd-title">${escapeHtml(pageInfo.title)}</div>
          <div class="uvd-meta">
            <span class="uvd-badge">${item.type}</span>
            <span>${item.source || ''}</span>
          </div>
        </div>
        <div class="uvd-actions-card">
          <button class="uvd-fav-btn ${isFaved ? 'uvd-faved' : ''}" data-url="${encodeURIComponent(item.url)}" title="Yêu thích">
            ${isFaved ? '❤️' : '♡'}
          </button>
          <button class="uvd-play-btn" data-url="${encodeURIComponent(item.url)}" data-type="${item.type}">▶</button>
        </div>
      `;
      container.appendChild(card);
    });

    // Event listeners
    container.querySelectorAll('.uvd-play-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const url = decodeURIComponent(btn.dataset.url);
        const type = btn.dataset.type;
        openPlayer(url, type);
      });
    });

    container.querySelectorAll('.uvd-fav-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const url = decodeURIComponent(btn.dataset.url);
        toggleFavorite(url);
        renderTab('streams');
        renderTab('favorites');
      });
    });
  }

  function renderFavorites() {
    const container = document.getElementById('tab-favorites');
    if (!container) return;
    const favs = data.favorites || [];

    if (favs.length === 0) {
      container.innerHTML = `
        <div class="uvd-empty">
          <span class="uvd-empty-icon">💔</span>
          <div class="uvd-empty-text">Chưa có video yêu thích</div>
          <div class="uvd-empty-sub">Nhấn ♡ trên card để thêm</div>
        </div>
      `;
      return;
    }

    container.innerHTML = '';
    favs.forEach((item, index) => {
      const card = document.createElement('div');
      card.className = 'uvd-card';
      card.style.animationDelay = (index * 0.04) + 's';

      card.innerHTML = `
        <div class="uvd-icon">${item.icon || '🎬'}</div>
        <div class="uvd-info">
          <div class="uvd-title">${escapeHtml(item.title || 'Video')}</div>
          <div class="uvd-meta">
            <span class="uvd-badge">${item.type || 'Unknown'}</span>
            <span>❤️ Yêu thích</span>
          </div>
        </div>
        <div class="uvd-actions-card">
          <button class="uvd-fav-btn uvd-faved" data-url="${encodeURIComponent(item.url)}" title="Bỏ yêu thích">❤️</button>
          <button class="uvd-play-btn" data-url="${encodeURIComponent(item.url)}" data-type="${item.type}">▶</button>
        </div>
      `;
      container.appendChild(card);
    });

    container.querySelectorAll('.uvd-play-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const url = decodeURIComponent(btn.dataset.url);
        const type = btn.dataset.type;
        openPlayer(url, type);
      });
    });

    container.querySelectorAll('.uvd-fav-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const url = decodeURIComponent(btn.dataset.url);
        toggleFavorite(url);
        renderTab('favorites');
        renderTab('streams');
      });
    });
  }

  function renderSettings() {
    const container = document.getElementById('tab-settings');
    if (!container) return;
    const s = data.settings;

    container.innerHTML = `
      <div class="uvd-setting-group">
        <div class="uvd-setting-label">🎬 Phát lại</div>
        <div class="uvd-setting-row">
          <span>Nhớ vị trí xem dở</span>
          <div class="uvd-toggle ${s.resumePlayback ? 'uvd-toggle-on' : ''}" data-key="resumePlayback">
            <div class="uvd-toggle-knob"></div>
          </div>
        </div>
        <div class="uvd-setting-row">
          <span>Tự động toàn màn hình</span>
          <div class="uvd-toggle ${s.autoFullscreen ? 'uvd-toggle-on' : ''}" data-key="autoFullscreen">
            <div class="uvd-toggle-knob"></div>
          </div>
        </div>
        <div class="uvd-setting-row">
          <span>Chặn tự phát (mạnh)</span>
          <div class="uvd-toggle ${s.blockAutoplay ? 'uvd-toggle-on' : ''}" data-key="blockAutoplay">
            <div class="uvd-toggle-knob"></div>
          </div>
        </div>
      </div>

      <div class="uvd-setting-group">
        <div class="uvd-setting-label">⚡ Tốc độ & Chất lượng</div>
        <div class="uvd-setting-row">
          <span>Tốc độ mặc định</span>
          <select class="uvd-setting-select" id="uvd-speed-select">
            ${[0.5, 0.75, 1, 1.25, 1.5, 2].map(v => 
              `<option value="${v}" ${s.defaultSpeed === v ? 'selected' : ''}>${v}x</option>`
            ).join('')}
          </select>
        </div>
        <div class="uvd-setting-row">
          <span>Số giây tua đúp</span>
          <input type="number" id="uvd-doubletap" value="${s.doubleTapSeconds}" min="1" max="60" 
                 style="width:70px;padding:6px 10px;border-radius:8px;border:1px solid rgba(0,0,0,0.06);background:rgba(255,255,255,0.1);font-size:13px;">
        </div>
      </div>

      <div class="uvd-setting-group">
        <div class="uvd-setting-label">✨ Hiệu ứng</div>
        <div class="uvd-setting-row">
          <span>Hiệu ứng phát sáng</span>
          <div class="uvd-toggle ${s.glowEffects ? 'uvd-toggle-on' : ''}" data-key="glowEffects">
            <div class="uvd-toggle-knob"></div>
          </div>
        </div>
        <div class="uvd-setting-row">
          <span>Cường độ hiệu ứng</span>
          <input type="range" id="uvd-intensity" value="${s.effectsIntensity}" min="0" max="100" 
                 style="width:120px;accent-color:#7c3aed;">
          <span style="font-size:12px;color:#6a6a8e;min-width:36px;">${s.effectsIntensity}%</span>
        </div>
      </div>

      <div class="uvd-setting-group" style="border-color:rgba(239,68,68,0.15);">
        <div class="uvd-setting-label" style="color:#ef4444;">⚠️ Dữ liệu</div>
        <div class="uvd-setting-row">
          <span>Xóa tất cả dữ liệu</span>
          <button id="uvd-reset-data" style="padding:6px 16px;border-radius:10px;border:1px solid rgba(239,68,68,0.2);background:rgba(239,68,68,0.08);color:#ef4444;cursor:pointer;font-weight:600;font-size:13px;">Xóa</button>
        </div>
        <div class="uvd-setting-row" style="border-bottom:none;padding-bottom:0;">
          <span style="font-size:12px;color:#8a8aaa;">Đã lưu ${Object.keys(data.playbackPositions).length} vị trí · ${data.favorites.length} yêu thích</span>
        </div>
      </div>
    `;

    // Toggle handlers
    container.querySelectorAll('.uvd-toggle').forEach(toggle => {
      toggle.addEventListener('click', () => {
        const key = toggle.dataset.key;
        const isOn = toggle.classList.toggle('uvd-toggle-on');
        data.settings[key] = isOn;
        setStorage(data);
        toast(`${key}: ${isOn ? 'Bật' : 'Tắt'}`, 'info');
      });
    });

    // Speed select
    container.querySelector('#uvd-speed-select').addEventListener('change', (e) => {
      data.settings.defaultSpeed = parseFloat(e.target.value);
      setStorage(data);
      toast('Đã đặt tốc độ mặc định: ' + data.settings.defaultSpeed + 'x', 'info');
    });

    // Double tap
    container.querySelector('#uvd-doubletap').addEventListener('change', (e) => {
      let val = parseInt(e.target.value) || 10;
      if (val < 1) val = 1;
      if (val > 60) val = 60;
      data.settings.doubleTapSeconds = val;
      setStorage(data);
      toast('Đã đặt tua ' + val + ' giây', 'info');
    });

    // Intensity
    container.querySelector('#uvd-intensity').addEventListener('input', (e) => {
      const val = parseInt(e.target.value);
      data.settings.effectsIntensity = val;
      setStorage(data);
      const label = e.target.parentElement.querySelector('span:last-child');
      if (label) label.textContent = val + '%';
      // Apply glow effect to panel
      const panel = document.getElementById('uvd-panel');
      if (panel) {
        const intensity = val / 100;
        panel.style.boxShadow = `0 25px 60px rgba(124, 58, 237, ${0.1 + intensity * 0.25}), 
                                inset 0 1px 0 rgba(255,255,255,${0.1 + intensity * 0.2}),
                                0 0 ${20 + intensity * 40}px rgba(124, 58, 237, ${0.05 + intensity * 0.1})`;
      }
    });

    // Reset data
    container.querySelector('#uvd-reset-data').addEventListener('click', () => {
      if (confirm('Xóa tất cả dữ liệu đã lưu (vị trí xem, yêu thích)?')) {
        data.playbackPositions = {};
        data.favorites = [];
        setStorage(data);
        toast('Đã xóa dữ liệu', 'warning');
        renderTab('favorites');
        renderTab('settings');
      }
    });
  }

  // --- Favorites ---
  function toggleFavorite(url) {
    const index = data.favorites.findIndex(f => f.url === url);
    if (index >= 0) {
      data.favorites.splice(index, 1);
      toast('Đã bỏ yêu thích', 'warning');
    } else {
      const info = urls.get(url);
      data.favorites.push({
        url: url,
        type: info ? info.type : 'Unknown',
        icon: info ? info.icon : '🎬',
        title: pageInfo.title,
        timestamp: Date.now()
      });
      toast('❤️ Đã thêm vào yêu thích', 'success');
    }
    setStorage(data);
  }

  // --- Player using Video.js ---
  function openPlayer(url, type) {
    if (playerOverlay) closePlayer();

    // Pause page videos
    document.querySelectorAll('video').forEach(v => { if (!v.paused) v.pause(); });

    const overlay = document.createElement('div');
    overlay.id = 'uvd-player-overlay';
    overlay.innerHTML = `
      <div class="uvd-player-header">
        <span class="uvd-player-title">🎬 ${escapeHtml(pageInfo.title)}</span>
        <div class="uvd-player-actions">
          <button id="uvd-pip-btn">📺 PiP</button>
          <button id="uvd-fs-btn">⛶ Full</button>
          <button class="uvd-close-player" id="uvd-close-player">✕ Đóng</button>
        </div>
      </div>
      <div class="uvd-video-wrapper" id="uvd-video-wrapper">
        <video id="uvd-player-video" class="video-js vjs-default-skin" controls preload="auto" playsinline></video>
      </div>
      <div class="uvd-player-footer">
        <span id="uvd-player-time">00:00 / 00:00</span>
        <div class="uvd-speed-control">
          <button id="uvd-speed-dec">−</button>
          <span class="uvd-speed-current" id="uvd-speed-current">1.0x</span>
          <button id="uvd-speed-inc">+</button>
        </div>
      </div>
    `;
    document.documentElement.appendChild(overlay);
    playerOverlay = overlay;

    // Load Video.js
    if (typeof videojs === 'undefined') {
      const script = document.createElement('script');
      script.src = 'https://vjs.zencdn.net/8.16.1/video.min.js';
      script.onload = () => {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = 'https://vjs.zencdn.net/8.16.1/video-js.css';
        document.head.appendChild(link);
        initPlayer(url, type);
      };
      document.head.appendChild(script);
    } else {
      initPlayer(url, type);
    }

    document.getElementById('uvd-close-player').addEventListener('click', closePlayer);
    document.getElementById('uvd-pip-btn').addEventListener('click', () => {
      const vid = document.getElementById('uvd-player-video');
      if (!vid) return;
      if (document.pictureInPictureElement) {
        document.exitPictureInPicture().catch(() => {});
      } else {
        vid.requestPictureInPicture().catch(() => toast('Không hỗ trợ PiP', 'error'));
      }
    });
    document.getElementById('uvd-fs-btn').addEventListener('click', () => {
      const wrapper = document.getElementById('uvd-video-wrapper');
      if (!wrapper) return;
      if (!document.fullscreenElement) {
        wrapper.requestFullscreen().catch(() => {});
      } else {
        document.exitFullscreen().catch(() => {});
      }
    });
  }

  function initPlayer(url, type) {
    const videoEl = document.getElementById('uvd-player-video');
    if (!videoEl) return;
    videoEl.__uvdAllow = true;

    let startTime = 0;
    const pos = getPlaybackPosition(url);
    if (pos && pos.time > 3) startTime = pos.time;

    const player = videojs(videoEl, {
      autoplay: false,
      controls: true,
      fluid: true,
      playbackRates: [0.5, 0.75, 1, 1.25, 1.5, 2],
      controlBar: {
        children: [
          'playToggle',
          'progressControl',
          'volumePanel',
          'currentTimeDisplay',
          'timeDivider',
          'durationDisplay',
          'playbackRateMenuButton',
          'fullscreenToggle',
        ]
      }
    });
    playerInstance = player;

    // Handle different types
    if (type === 'M3U8' || url.includes('.m3u8')) {
      player.src({ src: url, type: 'application/x-mpegURL' });
    } else if (type === 'MPD' || url.includes('.mpd')) {
      player.src({ src: url, type: 'application/dash+xml' });
    } else {
      player.src({ src: url, type: 'video/mp4' });
    }

    player.ready(() => {
      if (startTime > 0) {
        player.currentTime(startTime);
        toast('▶ Tiếp tục từ ' + formatTime(startTime), 'info');
      }
      if (data.settings.defaultSpeed && data.settings.defaultSpeed !== 1) {
        player.playbackRate(data.settings.defaultSpeed);
      }
      if (data.settings.autoFullscreen && !document.fullscreenElement) {
        const wrapper = document.getElementById('uvd-video-wrapper');
        if (wrapper && wrapper.requestFullscreen) wrapper.requestFullscreen().catch(() => {});
      }
      updateSpeedDisplay(player.playbackRate());
    });

    // Speed controls
    document.getElementById('uvd-speed-dec').addEventListener('click', () => {
      const rates = [0.5, 0.75, 1, 1.25, 1.5, 2];
      let cur = player.playbackRate();
      let idx = rates.indexOf(cur);
      if (idx > 0) { player.playbackRate(rates[idx - 1]); }
      else { player.playbackRate(0.5); }
      updateSpeedDisplay(player.playbackRate());
    });
    document.getElementById('uvd-speed-inc').addEventListener('click', () => {
      const rates = [0.5, 0.75, 1, 1.25, 1.5, 2];
      let cur = player.playbackRate();
      let idx = rates.indexOf(cur);
      if (idx < rates.length - 1) { player.playbackRate(rates[idx + 1]); }
      else { player.playbackRate(2); }
      updateSpeedDisplay(player.playbackRate());
    });

    // Time display
    function updateTime() {
      const el = document.getElementById('uvd-player-time');
      if (el && player) {
        const cur = player.currentTime() || 0;
        const dur = player.duration() || 0;
        el.textContent = formatTime(cur) + ' / ' + formatTime(dur);
      }
    }
    player.on('timeupdate', updateTime);
    player.on('loadedmetadata', updateTime);

    // Save position
    let lastSave = 0;
    player.on('timeupdate', () => {
      if (data.settings.resumePlayback && Date.now() - lastSave > 5000) {
        lastSave = Date.now();
        savePlaybackPosition(url, player.el().querySelector('video'));
      }
    });

    player.on('dispose', () => {
      savePlaybackPosition(url, player.el().querySelector('video'));
    });

    player.on('ended', () => {
      if (data.settings.resumePlayback) {
        delete data.playbackPositions[url];
        setStorage(data);
      }
    });
  }

  function updateSpeedDisplay(rate) {
    const el = document.getElementById('uvd-speed-current');
    if (el) el.textContent = rate.toFixed(2) + 'x';
  }

  function closePlayer() {
    if (playerInstance) {
      playerInstance.dispose();
      playerInstance = null;
    }
    if (playerOverlay) {
      playerOverlay.remove();
      playerOverlay = null;
    }
  }

  // --- Auto-click play to find hidden links ---
  function autoClickPlay() {
    const selectors = [
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
    let clicked = 0;
    selectors.forEach(sel => {
      try {
        document.querySelectorAll(sel).forEach(el => {
          try { el.click(); clicked++; } catch(e) {}
        });
      } catch(e) {}
    });
    document.querySelectorAll('video').forEach(v => {
      if (v.paused) {
        const wasMuted = v.muted;
        v.muted = true;
        v.__uvdAllow = true;
        v.play().then(() => {
          setTimeout(() => {
            try { v.pause(); v.currentTime = 0; v.muted = wasMuted; } catch(e) {}
            v.__uvdAllow = false;
          }, 500);
        }).catch(() => { v.__uvdAllow = false; });
      }
    });
    return clicked;
  }

  // --- Init ---
  setTimeout(() => {
    setTimeout(() => {
      scan(document, 'delayed');
      buildUI();
    }, 600);
    const clicked = autoClickPlay();
    if (clicked > 0) {
      setTimeout(() => {
        scan(document, 'autoclick');
        if (document.getElementById('uvd-panel')) {
          renderTab(currentTab);
        }
        toast(`🎯 Đã thử bấm Play (${clicked} nút)`, 'success');
      }, 1500);
    }
  }, 100);

  // Expose refresh
  window.__uvdRefresh = function() {
    scan(document, 'manual');
    if (document.getElementById('uvd-panel')) {
      renderTab(currentTab);
    } else {
      buildUI();
    }
    toast('🔄 Đã quét lại', 'info');
  };

  console.log(`🎬 UMP DL v${VERSION} - Glass UI Edition`);
})();

