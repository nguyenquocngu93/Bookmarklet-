(function() {
  'use strict';

  const VERSION = '7.0.0';
  const STORAGE_KEY = 'uvd_data_v70';

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
  data.settings = Object.assign({
    resumePlayback: true,
    blockAutoplay: true,
    doubleTapSeconds: 10,
    defaultSpeed: 1,
    autoFullscreen: false,
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
    { re: /https?:\/\/[^\s"'<>()\\]+\.m3u8[^\s"'<>()\\]*/gi, type: 'M3U8' },
    { re: /https?:\/\/[^\s"'<>()\\]+\.mpd[^\s"'<>()\\]*/gi, type: 'MPD' },
    { re: /https?:\/\/[^\s"'<>()\\]+\.mp4[^\s"'<>()\\]*/gi, type: 'MP4' },
    { re: /https?:\/\/[^\s"'<>()\\]+\.webm[^\s"'<>()\\]*/gi, type: 'WEBM' },
    { re: /https?:\/\/[^\s"'<>()\\]+\.mkv[^\s"'<>()\\]*/gi, type: 'MKV' },
    { re: /blob:https?:\/\/[^\s"'<>()\\]+/gi, type: 'BLOB' },
  ];

  function findUrls(text, source) {
    if (!text || typeof text !== 'string') return;
    patterns.forEach(p => {
      const matches = text.match(p.re);
      if (matches) {
        matches.forEach(u => {
          u = u.replace(/\\u002F/g, '/').replace(/\\\//g, '/').replace(/&amp;/g, '&').replace(/\\"/g, '');
          if (!urls.has(u)) {
            urls.set(u, { type: p.type, source: source, timestamp: Date.now() });
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
  // Cleanup on unload
  window.addEventListener('beforeunload', () => {
    HTMLMediaElement.prototype.play = nativePlay;
  });

  // --- Neutralize existing videos ---
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

  function toast(msg) {
    const el = document.createElement('div');
    el.textContent = msg;
    Object.assign(el.style, {
      position: 'fixed',
      bottom: '30px',
      left: '50%',
      transform: 'translateX(-50%)',
      background: 'rgba(20,22,30,0.85)',
      backdropFilter: 'blur(12px)',
      color: '#fff',
      padding: '12px 24px',
      borderRadius: '30px',
      zIndex: 2147483649,
      font: '600 13px -apple-system, system-ui, sans-serif',
      boxShadow: '0 8px 30px rgba(0,0,0,0.5)',
      border: '1px solid rgba(255,255,255,0.1)',
      animation: 'uvdToastIn 0.3s ease',
    });
    document.documentElement.appendChild(el);
    setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity 0.3s'; setTimeout(() => el.remove(), 400); }, 2500);
  }

  // --- Inject CSS for new UI ---
  const styleId = 'uvd-new-style';
  if (document.getElementById(styleId)) document.getElementById(styleId).remove();
  const style = document.createElement('style');
  style.id = styleId;
  style.textContent = `
    @keyframes uvdToastIn {
      from { opacity:0; transform: translateX(-50%) translateY(20px); }
      to { opacity:1; transform: translateX(-50%) translateY(0); }
    }
    @keyframes uvdFadeIn {
      from { opacity:0; transform: scale(0.96); }
      to { opacity:1; transform: scale(1); }
    }
    @keyframes uvdCardIn {
      from { opacity:0; transform: translateY(12px); }
      to { opacity:1; transform: translateY(0); }
    }
    #uvd-panel {
      position: fixed;
      bottom: 20px;
      left: 20px;
      right: 20px;
      max-width: 500px;
      margin: 0 auto;
      background: rgba(16, 18, 28, 0.72);
      backdrop-filter: blur(24px) saturate(150%);
      -webkit-backdrop-filter: blur(24px) saturate(150%);
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 28px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.06);
      z-index: 2147483647;
      padding: 16px;
      max-height: 80vh;
      display: flex;
      flex-direction: column;
      animation: uvdFadeIn 0.35s ease;
      font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', Roboto, sans-serif;
      color: #f0f2ff;
      transition: all 0.3s ease;
    }
    #uvd-panel.uvd-minimized {
      max-height: 60px;
      overflow: hidden;
      padding: 12px 16px;
    }
    #uvd-panel.uvd-minimized .uvd-list {
      display: none;
    }
    #uvd-panel .uvd-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-shrink: 0;
      margin-bottom: 12px;
    }
    #uvd-panel .uvd-header h2 {
      font-size: 18px;
      font-weight: 700;
      letter-spacing: -0.3px;
      background: linear-gradient(135deg, #7b9cff, #b48aff);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      margin: 0;
    }
    #uvd-panel .uvd-header .uvd-actions {
      display: flex;
      gap: 6px;
    }
    #uvd-panel .uvd-header button {
      background: rgba(255,255,255,0.06);
      border: none;
      border-radius: 40px;
      color: #b0b8d1;
      padding: 6px 12px;
      font-size: 13px;
      cursor: pointer;
      transition: 0.2s;
      backdrop-filter: blur(4px);
    }
    #uvd-panel .uvd-header button:hover {
      background: rgba(255,255,255,0.12);
      color: #fff;
    }
    #uvd-panel .uvd-header button.uvd-close {
      background: rgba(255, 93, 114, 0.15);
      color: #ff5d72;
      padding: 6px 10px;
    }
    #uvd-panel .uvd-header button.uvd-close:hover {
      background: rgba(255, 93, 114, 0.25);
    }
    #uvd-panel .uvd-list {
      overflow-y: auto;
      flex: 1;
      margin: 0 -4px;
      padding: 0 4px;
    }
    #uvd-panel .uvd-list::-webkit-scrollbar {
      width: 4px;
    }
    #uvd-panel .uvd-list::-webkit-scrollbar-thumb {
      background: rgba(255,255,255,0.2);
      border-radius: 4px;
    }
    .uvd-card {
      display: flex;
      align-items: center;
      gap: 14px;
      background: rgba(255,255,255,0.04);
      border: 1px solid rgba(255,255,255,0.05);
      border-radius: 16px;
      padding: 12px 14px;
      margin-bottom: 8px;
      transition: all 0.2s ease;
      cursor: default;
      animation: uvdCardIn 0.3s ease both;
    }
    .uvd-card:hover {
      background: rgba(255,255,255,0.08);
      border-color: rgba(123, 156, 255, 0.2);
      transform: translateY(-1px);
    }
    .uvd-card .uvd-icon {
      flex-shrink: 0;
      width: 44px;
      height: 44px;
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      font-size: 12px;
      background: rgba(123,156,255,0.15);
      color: #7b9cff;
      border: 1px solid rgba(123,156,255,0.1);
    }
    .uvd-card .uvd-info {
      flex: 1;
      min-width: 0;
    }
    .uvd-card .uvd-info .uvd-title {
      font-weight: 600;
      font-size: 14px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .uvd-card .uvd-info .uvd-meta {
      font-size: 12px;
      color: #6a7294;
      margin-top: 2px;
    }
    .uvd-card .uvd-play {
      flex-shrink: 0;
      width: 38px;
      height: 38px;
      border-radius: 40px;
      background: linear-gradient(135deg, #7b9cff, #b48aff);
      border: none;
      color: #fff;
      font-size: 16px;
      cursor: pointer;
      transition: 0.2s;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 4px 12px rgba(123,156,255,0.3);
    }
    .uvd-card .uvd-play:hover {
      transform: scale(1.06);
      box-shadow: 0 6px 20px rgba(123,156,255,0.5);
    }
    .uvd-card .uvd-play:active {
      transform: scale(0.94);
    }
    .uvd-empty {
      text-align: center;
      color: #6a7294;
      padding: 40px 0;
      font-size: 14px;
    }
    #uvd-player-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.92);
      backdrop-filter: blur(12px);
      z-index: 2147483648;
      display: flex;
      flex-direction: column;
      animation: uvdFadeIn 0.3s ease;
    }
    #uvd-player-overlay .uvd-player-header {
      padding: 14px 20px;
      background: rgba(0,0,0,0.5);
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-shrink: 0;
      border-bottom: 1px solid rgba(255,255,255,0.05);
    }
    #uvd-player-overlay .uvd-player-header .uvd-title {
      font-weight: 600;
      font-size: 16px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 70%;
    }
    #uvd-player-overlay .uvd-player-header button {
      background: rgba(255,255,255,0.06);
      border: none;
      border-radius: 40px;
      color: #b0b8d1;
      padding: 8px 14px;
      font-size: 14px;
      cursor: pointer;
      transition: 0.2s;
    }
    #uvd-player-overlay .uvd-player-header button:hover {
      background: rgba(255,255,255,0.12);
      color: #fff;
    }
    #uvd-player-overlay .uvd-player-header .uvd-close-player {
      background: rgba(255,93,114,0.15);
      color: #ff5d72;
    }
    #uvd-player-overlay .uvd-player-header .uvd-close-player:hover {
      background: rgba(255,93,114,0.25);
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
    /* Video.js overrides for dark theme */
    .uvd-video-wrapper .video-js {
      width: 100% !important;
      height: 100% !important;
    }
    .uvd-video-wrapper .video-js .vjs-big-play-button {
      border-radius: 50%;
      background: rgba(123,156,255,0.3);
      border-color: rgba(123,156,255,0.5);
    }
    .uvd-video-wrapper .video-js .vjs-control-bar {
      background: rgba(0,0,0,0.6);
      backdrop-filter: blur(8px);
    }
    .uvd-video-wrapper .video-js .vjs-progress-holder .vjs-play-progress {
      background: linear-gradient(135deg, #7b9cff, #b48aff);
    }
    /* Responsive */
    @media (max-width: 480px) {
      #uvd-panel {
        left: 12px;
        right: 12px;
        padding: 12px;
        border-radius: 20px;
        bottom: 12px;
      }
      .uvd-card {
        padding: 10px 12px;
      }
      .uvd-card .uvd-icon {
        width: 36px;
        height: 36px;
        font-size: 10px;
      }
      .uvd-card .uvd-play {
        width: 34px;
        height: 34px;
        font-size: 14px;
      }
    }
  `;
  document.head.appendChild(style);

  // --- Build UI ---
  function buildUI() {
    const panel = document.createElement('div');
    panel.id = 'uvd-panel';
    const header = document.createElement('div');
    header.className = 'uvd-header';
    header.innerHTML = `
      <h2>🎬 UMP DL</h2>
      <div class="uvd-actions">
        <button id="uvd-toggle-min">−</button>
        <button class="uvd-close" id="uvd-close-panel">✕</button>
      </div>
    `;
    panel.appendChild(header);

    const list = document.createElement('div');
    list.className = 'uvd-list';
    list.id = 'uvd-list';
    panel.appendChild(list);

    document.documentElement.appendChild(panel);

    // Minimize toggle
    let minimized = false;
    document.getElementById('uvd-toggle-min').addEventListener('click', () => {
      minimized = !minimized;
      panel.classList.toggle('uvd-minimized', minimized);
      document.getElementById('uvd-toggle-min').textContent = minimized ? '+' : '−';
    });

    // Close panel
    document.getElementById('uvd-close-panel').addEventListener('click', () => {
      panel.remove();
      // Cleanup observers, etc.
    });

    // Render list
    renderList();

    // Update list when new URLs are found (could use MutationObserver on urls, but we'll rebuild on demand)
    // We'll also provide a refresh button or auto-refresh via setInterval? Not needed.
  }

  function renderList() {
    const list = document.getElementById('uvd-list');
    if (!list) return;
    const items = Array.from(urls.entries()).map(([url, info]) => ({
      url,
      type: info.type,
      source: info.source,
    }));

    if (items.length === 0) {
      list.innerHTML = `<div class="uvd-empty">Không tìm thấy luồng video nào.<br>Hãy thử bấm Play trên trang để kích hoạt.</div>`;
      return;
    }

    list.innerHTML = '';
    items.forEach((item, index) => {
      const card = document.createElement('div');
      card.className = 'uvd-card';
      card.style.animationDelay = (index * 0.05) + 's';

      const icon = document.createElement('div');
      icon.className = 'uvd-icon';
      icon.textContent = item.type.substring(0, 4);
      card.appendChild(icon);

      const info = document.createElement('div');
      info.className = 'uvd-info';
      const title = document.createElement('div');
      title.className = 'uvd-title';
      title.textContent = pageInfo.title || 'Video';
      const meta = document.createElement('div');
      meta.className = 'uvd-meta';
      meta.textContent = item.type + (item.source ? ' · ' + item.source : '');
      info.appendChild(title);
      info.appendChild(meta);
      card.appendChild(info);

      const playBtn = document.createElement('button');
      playBtn.className = 'uvd-play';
      playBtn.textContent = '▶';
      playBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        openPlayer(item.url, item.type);
      });
      card.appendChild(playBtn);

      list.appendChild(card);
    });
  }

  // --- Player using Video.js ---
  let currentPlayer = null;
  let playerOverlay = null;
  let playerInstance = null;

  function openPlayer(url, type) {
    // Close existing player
    if (playerOverlay) {
      closePlayer();
    }

    // Pause any playing videos on the page
    document.querySelectorAll('video').forEach(v => { if (!v.paused) v.pause(); });

    const overlay = document.createElement('div');
    overlay.id = 'uvd-player-overlay';
    overlay.innerHTML = `
      <div class="uvd-player-header">
        <span class="uvd-title">${escapeHtml(pageInfo.title)}</span>
        <div>
          <button id="uvd-pip-btn" style="margin-right:8px;">PiP</button>
          <button class="uvd-close-player" id="uvd-close-player">✕ Đóng</button>
        </div>
      </div>
      <div class="uvd-video-wrapper" id="uvd-video-wrapper">
        <video id="uvd-player-video" class="video-js vjs-default-skin" controls preload="auto" playsinline></video>
      </div>
    `;
    document.documentElement.appendChild(overlay);
    playerOverlay = overlay;

    // Load Video.js from CDN if not already loaded
    if (typeof videojs === 'undefined') {
      const script = document.createElement('script');
      script.src = 'https://vjs.zencdn.net/8.16.1/video.min.js';
      script.onload = () => {
        // Also need CSS
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

    // Close button
    document.getElementById('uvd-close-player').addEventListener('click', closePlayer);
    // PiP button
    document.getElementById('uvd-pip-btn').addEventListener('click', () => {
      const vid = document.getElementById('uvd-player-video');
      if (!vid) return;
      if (document.pictureInPictureElement) {
        document.exitPictureInPicture().catch(() => {});
      } else {
        vid.requestPictureInPicture().catch(() => toast('Không hỗ trợ PiP'));
      }
    });
  }

  function initPlayer(url, type) {
    const videoEl = document.getElementById('uvd-player-video');
    if (!videoEl) return;

    // Mark as allowed for autoplay blocking
    videoEl.__uvdAllow = true;

    // Resume position
    let startTime = 0;
    const pos = getPlaybackPosition(url);
    if (pos && pos.time > 3) {
      startTime = pos.time;
    }

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

    // Handle HLS with videojs-http-streaming (built-in via @videojs/http-streaming)
    // If not available, we can use hls.js as fallback, but videojs should support HLS natively.
    if (type === 'M3U8' || url.includes('.m3u8')) {
      // Video.js with VHS can handle it
      player.src({
        src: url,
        type: 'application/x-mpegURL',
      });
    } else {
      player.src({
        src: url,
        type: type === 'MPD' ? 'application/dash+xml' : 'video/mp4',
      });
    }

    player.ready(() => {
      if (startTime > 0) {
        player.currentTime(startTime);
        toast('▶ Tiếp tục từ ' + formatTime(startTime));
      }
      // Apply default speed
      if (data.settings.defaultSpeed && data.settings.defaultSpeed !== 1) {
        player.playbackRate(data.settings.defaultSpeed);
      }
      if (data.settings.autoFullscreen && !document.fullscreenElement) {
        const wrapper = document.getElementById('uvd-video-wrapper');
        if (wrapper && wrapper.requestFullscreen) wrapper.requestFullscreen().catch(() => {});
      }
    });

    // Save position on timeupdate
    let lastSave = 0;
    player.on('timeupdate', () => {
      if (data.settings.resumePlayback && Date.now() - lastSave > 5000) {
        lastSave = Date.now();
        savePlaybackPosition(url, player.el().querySelector('video'));
      }
    });

    // Cleanup on dispose
    player.on('dispose', () => {
      // Save final position
      savePlaybackPosition(url, player.el().querySelector('video'));
    });

    // Handle ended
    player.on('ended', () => {
      if (data.settings.resumePlayback) {
        delete data.playbackPositions[url];
        setStorage(data);
      }
    });
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

  // --- Auto-trigger play on page to find hidden links ---
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
    // Also try to play all videos muted to trigger loading
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

  // --- Init after DOM ready ---
  setTimeout(() => {
    // Auto scan after a moment to catch dynamic content
    setTimeout(() => {
      scan(document, 'delayed');
      buildUI();
    }, 800);
    // Try auto-click play
    const clicked = autoClickPlay();
    if (clicked > 0) {
      setTimeout(() => {
        scan(document, 'autoclick');
        // Rebuild UI if list changed (if panel exists)
        if (document.getElementById('uvd-panel')) {
          renderList();
        }
      }, 1500);
    }
  }, 100);

  // --- Expose refresh for manual use ---
  window.__uvdRefresh = function() {
    scan(document, 'manual');
    if (document.getElementById('uvd-panel')) {
      renderList();
    } else {
      buildUI();
    }
    toast('Đã quét lại trang');
  };

  // Handle resize of panel
  window.addEventListener('resize', () => {
    // nothing needed
  });

  console.log(`UMP DL v${VERSION} - Pure online player`);
})();

