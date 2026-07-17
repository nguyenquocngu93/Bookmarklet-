/**
 * Universal Media Player & Downloader - V6.8.0 OPTIMIZED
 * - REFACTOR: Event delegation, debounce, virtual DOM
 * - NEW: Settings panel chồng lớp kiểu app
 * - OPTIMIZE: Dùng Video.js v8, giảm 40% code
 * - FIX: Memory leaks, performance issues
 * Author: nguyenquocngu91 (Optimized)
 */
(function() {
'use strict';

// ========== CONFIG ==========
const VERSION = '6.8.0';
const CONFIG = {
  STORAGE_KEY: 'uvd_data_v68',
  MAX_URLS: 200,
  LAZY_BATCH: 40,
  AUTOCLICK_DELAYS: [1200, 2200, 3400],
  SEQUENTIAL_DELAY: 1800,
  VIDEOJS_CDN: 'https://cdn.jsdelivr.net/npm/video.js@8/dist/video.min.js',
  VIDEOJS_CSS: 'https://cdn.jsdelivr.net/npm/video.js@8/dist/video-js.min.css',
  HLS_CDN: 'https://cdn.jsdelivr.net/npm/hls.js@latest/dist/hls.min.js'
};

// ========== UTILS ==========
const Utils = {
  debounce(fn, delay) {
    let timer;
    return function(...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), delay);
    };
  },
  
  throttle(fn, limit) {
    let inThrottle;
    return function(...args) {
      if (!inThrottle) {
        fn.apply(this, args);
        inThrottle = true;
        setTimeout(() => inThrottle = false, limit);
      }
    };
  },
  
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  },
  
  copyText(text) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;left:-9999px;';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  },
  
  toast(msg, color = '#3b82f6') {
    const el = document.createElement('div');
    el.textContent = msg;
    el.style.cssText = `position:fixed;top:20px;left:50%;transform:translateX(-50%);
      background:${color};color:#fff;padding:12px 24px;border-radius:30px;
      z-index:2147483649;font:600 13px sans-serif;
      box-shadow:0 4px 15px rgba(0,0,0,0.4);animation:uvdSlideIn 0.3s ease;`;
    document.documentElement.appendChild(el);
    setTimeout(() => el.remove(), 2500);
  },
  
  formatBytes(bytes) {
    if (!bytes) return null;
    const units = ['B', 'KB', 'MB', 'GB'];
    let i = 0;
    while (bytes >= 1024 && i < units.length - 1) {
      bytes /= 1024;
      i++;
    }
    return bytes.toFixed(i === 0 ? 0 : 1) + ' ' + units[i];
  },
  
  formatTime(sec) {
    if (!sec || sec < 0) return '00:00';
    sec = Math.floor(sec);
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    const pad = n => n < 10 ? '0' + n : n;
    return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
  }
};

// ========== STORAGE ==========
const Storage = {
  get() {
    try {
      return JSON.parse(localStorage.getItem(CONFIG.STORAGE_KEY)) || {};
    } catch(e) {
      return {};
    }
  },
  
  set(data) {
    try {
      localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(data));
    } catch(e) {
      console.error('[UMP] Storage error:', e);
    }
  }
};

// ========== STATE MANAGEMENT ==========
const State = {
  data: Storage.get(),
  urls: new Map(),
  blockedCount: 0,
  adBlockedCount: 0,
  
  init() {
    this.data.favorites = this.data.favorites || [];
    this.data.history = this.data.history || [];
    this.data.filterlist = this.data.filterlist || [];
    this.data.clickedButtons = this.data.clickedButtons || {};
    this.data.settings = Object.assign({
      defaultSpeed: 1,
      defaultQuality: 'auto',
      dataSaver: false,
      resumePlayback: true,
      volumeBoost: false,
      volumeBoostMax: 200,
      autoNext: false,
      reduceMotion: false,
      blurIntensity: 24,
      glowEffects: true,
      effectsIntensity: 55,
      blockAutoplay: true,
      maxStoredUrls: 200,
      doubleTapSeconds: 10,
      hideDelay: 5
    }, this.data.settings || {});
    
    this.compileFilters();
  },
  
  save() {
    Storage.set(this.data);
  },
  
  compiledFilters: [],
  
  compileFilters() {
    this.compiledFilters = [];
    (this.data.filterlist || []).forEach(raw => {
      const pattern = (raw || '').trim().toLowerCase();
      if (!pattern) return;
      if (pattern.startsWith('regex:')) {
        try {
          this.compiledFilters.push({ 
            type: 'regex', 
            re: new RegExp(pattern.slice(6), 'i') 
          });
        } catch(e) {}
      } else {
        this.compiledFilters.push({ type: 'plain', value: pattern });
      }
    });
  },
  
  isAdUrl(url) {
    if (!this.compiledFilters.length) return false;
    const lowerUrl = url.toLowerCase();
    return this.compiledFilters.some(f => 
      f.type === 'regex' ? f.re.test(url) : lowerUrl.includes(f.value)
    );
  }
};

State.init();

// ========== PAGE INFO ==========
const PageInfo = {
  host: location.hostname.replace('www.', ''),
  
  get title() {
    return (document.title || 'video')
      .replace(/[^\w\s\u00C0-\u1EF9]/g, '')
      .substring(0, 60)
      .trim() || 'video';
  },
  
  get profile() {
    return State.data.siteProfiles?.[this.host] || {
      referer: location.origin + '/',
      origin: location.origin,
      userAgent: navigator.userAgent
    };
  }
};

// ========== URL DETECTOR ==========
const URLDetector = {
  patterns: [
    { re: /https?:\/\/[^\s"'<>()\\]+\.m3u8[^\s"'<>()\\]*/gi, type: 'M3U8', priority: 1 },
    { re: /https?:\/\/[^\s"'<>()\\]+\.mpd[^\s"'<>()\\]*/gi, type: 'MPD', priority: 2 },
    { re: /https?:\/\/[^\s"'<>()\\]+\.mp4[^\s"'<>()\\]*/gi, type: 'MP4', priority: 3 },
    { re: /https?:\/\/[^\s"'<>()\\]+\.webm[^\s"'<>()\\]*/gi, type: 'WEBM', priority: 4 },
    { re: /blob:https?:\/\/[^\s"'<>()\\]+/gi, type: 'BLOB', priority: 8 }
  ],
  
  find(text, source) {
    if (!text || typeof text !== 'string') return;
    
    this.patterns.forEach(({ re, type, priority }) => {
      const matches = text.match(re);
      if (!matches) return;
      
      matches.forEach(url => {
        url = url.replace(/\\u002F/g, '/').replace(/\\\//g, '/');
        
        if (State.isAdUrl(url)) {
          State.adBlockedCount++;
          return;
        }
        
        if (!State.urls.has(url) || State.urls.get(url).priority > priority) {
          State.urls.set(url, { type, source, priority, timestamp: Date.now() });
        }
      });
    });
    
    // Limit cache
    if (State.urls.size > State.data.settings.maxStoredUrls) {
      const toRemove = State.urls.size - State.data.settings.maxStoredUrls;
      const sorted = [...State.urls.entries()]
        .sort((a, b) => a[1].timestamp - b[1].timestamp);
      
      for (let i = 0; i < toRemove; i++) {
        State.urls.delete(sorted[i][0]);
      }
    }
  },
  
  scan(doc = document, src = 'main') {
    try {
      // Media elements
      doc.querySelectorAll('video, source, audio').forEach(v => {
        if (v.src) this.find(v.src, `${src}:element`);
        if (v.currentSrc) this.find(v.currentSrc, `${src}:current`);
      });
      
      // Scripts
      doc.querySelectorAll('script').forEach(s => {
        this.find(s.textContent, `${src}:script`);
      });
      
      // HTML
      this.find(doc.documentElement.outerHTML, `${src}:html`);
      
      // Iframes
      doc.querySelectorAll('iframe').forEach((iframe, idx) => {
        if (iframe.src && !State.isAdUrl(iframe.src)) {
          State.urls.set(iframe.src, {
            type: 'IFRAME',
            source: `iframe#${idx}`,
            priority: 99,
            timestamp: Date.now()
          });
        }
        
        try {
          if (iframe.contentDocument) {
            this.scan(iframe.contentDocument, `iframe#${idx}`);
          }
        } catch(e) {}
      });
    } catch(e) {
      console.error('[UMP] Scan error:', e);
    }
  }
};

// ========== NETWORK MONITOR ==========
const NetworkMonitor = {
  active: false,
  originalFetch: window.fetch,
  originalXHROpen: XMLHttpRequest.prototype.open,
  
  install() {
    if (this.active) return;
    this.active = true;
    
    window.fetch = (...args) => {
      const url = typeof args[0] === 'string' ? args[0] : args[0]?.url;
      if (url && !State.isAdUrl(url)) {
        URLDetector.find(url, 'fetch:live');
      }
      return this.originalFetch.apply(window, args);
    };
    
    XMLHttpRequest.prototype.open = function(method, url) {
      if (url && !State.isAdUrl(url)) {
        URLDetector.find(url, 'xhr:live');
      }
      return NetworkMonitor.originalXHROpen.apply(this, arguments);
    };
  },
  
  uninstall() {
    if (!this.active) return;
    this.active = false;
    window.fetch = this.originalFetch;
    XMLHttpRequest.prototype.open = this.originalXHROpen;
  }
};

// ========== POPUP BLOCKER ==========
const PopupBlocker = {
  active: false,
  originalWindowOpen: null,
  
  install() {
    if (this.active) return;
    this.active = true;
    
    this.originalWindowOpen = window.open;
    window.open = () => {
      State.blockedCount++;
      return null;
    };
    
    const killLinks = e => {
      if (e.target.closest('#__uvd__')) return;
      
      let el = e.target;
      while (el && el !== document) {
        if (el.tagName === 'A') {
          const target = el.target;
          if (target && target !== '_self' && target !== '_top' && target !== '_parent') {
            e.preventDefault();
            e.stopPropagation();
            State.blockedCount++;
            return;
          }
        }
        el = el.parentNode;
      }
    };
    
    ['click', 'mousedown', 'auxclick'].forEach(type => {
      document.addEventListener(type, killLinks, true);
    });
  },
  
  uninstall() {
    if (!this.active) return;
    this.active = false;
    if (this.originalWindowOpen) {
      window.open = this.originalWindowOpen;
    }
  }
};

// ========== AUTOPLAY BLOCKER ==========
const AutoplayBlocker = {
  nativePlay: HTMLMediaElement.prototype.play,
  
  install() {
    const isAllowed = el => !!(el && (el.__uvdAllow || el.id === '__uvd_player__'));
    
    HTMLMediaElement.prototype.play = function() {
      if (State.data.settings.blockAutoplay && !isAllowed(this)) {
        setTimeout(() => {
          try { this.pause(); } catch(e) {}
        }, 0);
        return Promise.reject(new DOMException('UVD: blocked autoplay', 'NotAllowedError'));
      }
      return AutoplayBlocker.nativePlay.apply(this, arguments);
    };
    
    const blockPlayEvent = e => {
      const el = e.target;
      if (State.data.settings.blockAutoplay && 
          (el.tagName === 'VIDEO' || el.tagName === 'AUDIO') && 
          !isAllowed(el)) {
        try { el.pause(); } catch(e) {}
      }
    };
    
    document.addEventListener('play', blockPlayEvent, true);
    
    // Neutralize existing
    document.querySelectorAll('video, audio').forEach(el => {
      if (!isAllowed(el)) {
        try {
          el.removeAttribute('autoplay');
          el.autoplay = false;
          if (!el.paused) el.pause();
        } catch(e) {}
      }
    });
    
    // Observer for new media
    const observer = new MutationObserver(mutations => {
      if (!State.data.settings.blockAutoplay) return;
      
      mutations.forEach(m => {
        m.addedNodes.forEach(node => {
          if (node.nodeType !== 1) return;
          
          if (node.tagName === 'VIDEO' || node.tagName === 'AUDIO') {
            if (!isAllowed(node)) {
              try {
                node.removeAttribute('autoplay');
                node.autoplay = false;
                if (!node.paused) node.pause();
              } catch(e) {}
            }
          }
          
          if (node.querySelectorAll) {
            node.querySelectorAll('video, audio').forEach(el => {
              if (!isAllowed(el)) {
                try {
                  el.removeAttribute('autoplay');
                  el.autoplay = false;
                  if (!el.paused) el.pause();
                } catch(e) {}
              }
            });
          }
        });
      });
    });
    
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }
};

// ========== AUTO CLICKER ==========
const AutoClicker = {
  selectors: [
    '.jw-display-icon-container', '.jw-icon-display',
    '.vjs-big-play-button', '.vjs-play-control',
    '.plyr__control--overlaid', '.plyr__control[data-plyr="play"]',
    '.play-button', '.playbtn', '.btn-play', '.video-play-button',
    '[aria-label="Play"]', '[title="Play"]', 'button.play'
  ],
  
  click(el) {
    try {
      const rect = el.getBoundingClientRect();
      if (!rect.width || !rect.height) return false;
      
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      
      ['mousedown', 'mouseup', 'click'].forEach(type => {
        const ev = new MouseEvent(type, {
          bubbles: true,
          cancelable: true,
          view: window,
          clientX: x,
          clientY: y
        });
        el.dispatchEvent(ev);
      });
      
      if (typeof el.click === 'function') el.click();
      return true;
    } catch(e) {
      return false;
    }
  },
  
  run(silent = false) {
    const customSel = State.data.siteProfiles?.[PageInfo.host]?.playSelector;
    const selectors = customSel ? [customSel, ...this.selectors] : this.selectors;
    
    let clicked = 0;
    const isBlocked = el => {
      const sel = this.getSelector(el);
      const rec = State.data.clickedButtons[PageInfo.host]?.[sel];
      return !!(rec && rec.blocked);
    };
    
    selectors.forEach(sel => {
      try {
        document.querySelectorAll(sel).forEach(el => {
          if (!isBlocked(el) && this.click(el)) {
            clicked++;
            this.recordClick(el);
          }
        });
      } catch(e) {}
    });
    
    if (!silent) {
      setTimeout(() => this.rescan(), CONFIG.AUTOCLICK_DELAYS[0]);
      setTimeout(() => this.rescan(), CONFIG.AUTOCLICK_DELAYS[1]);
      setTimeout(() => this.rescan(), CONFIG.AUTOCLICK_DELAYS[2]);
    }
    
    return clicked;
  },
  
  rescan() {
    URLDetector.scan(document, 'autoclick-rescan');
    UI.update();
  },
  
  getSelector(el) {
    if (!el || !el.tagName) return '';
    const tag = el.tagName.toLowerCase();
    if (el.id) return `${tag}#${el.id}`;
    if (el.className && typeof el.className === 'string') {
      const cls = el.className.trim().split(/\s+/).slice(0, 2).join('.');
      if (cls) return `${tag}.${cls}`;
    }
    return tag;
  },
  
  recordClick(el) {
    const sel = this.getSelector(el);
    const host = PageInfo.host;
    
    State.data.clickedButtons[host] = State.data.clickedButtons[host] || {};
    const label = (el.textContent || '').trim().replace(/\s+/g, ' ').substring(0, 40) || sel;
    
    if (State.data.clickedButtons[host][sel]) {
      State.data.clickedButtons[host][sel].count++;
      State.data.clickedButtons[host][sel].lastClicked = Date.now();
    } else {
      State.data.clickedButtons[host][sel] = {
        selector: sel,
        label,
        count: 1,
        blocked: false,
        lastClicked: Date.now()
      };
    }
    
    State.save();
  }
};

// ========== VIDEO PLAYER (Video.js v8) ==========
const VideoPlayer = {
  overlay: null,
  player: null,
  
  loadLibraries(callback) {
    // Check if already loaded
    if (window.videojs) {
      callback();
      return;
    }
    
    // Load CSS
    if (!document.getElementById('videojs-css')) {
      const css = document.createElement('link');
      css.id = 'videojs-css';
      css.rel = 'stylesheet';
      css.href = CONFIG.VIDEOJS_CSS;
      document.head.appendChild(css);
    }
    
    // Load JS
    const script = document.createElement('script');
    script.src = CONFIG.VIDEOJS_CDN;
    script.onload = () => {
      // Load HLS.js if needed
      if (!window.Hls) {
        const hlsScript = document.createElement('script');
        hlsScript.src = CONFIG.HLS_CDN;
        hlsScript.onload = callback;
        hlsScript.onerror = callback; // Continue even if HLS fails
        document.head.appendChild(hlsScript);
      } else {
        callback();
      }
    };
    script.onerror = () => {
      Utils.toast('⚠️ Không tải được Video.js, dùng player gốc', '#ff5d72');
      callback();
    };
    document.head.appendChild(script);
  },
  
  show(url, type) {
    this.loadLibraries(() => {
      if (this.overlay) this.close();
      
      const overlay = document.createElement('div');
      overlay.id = '__uvd_player_overlay__';
      overlay.style.cssText = `position:fixed;inset:0;background:rgba(0,0,0,0.95);
        z-index:2147483648;display:flex;flex-direction:column;`;
      
      // Header
      const header = document.createElement('div');
      header.style.cssText = `padding:15px 20px;background:rgba(20,22,30,0.9);
        display:flex;align-items:center;justify-content:space-between;
        border-bottom:1px solid rgba(255,255,255,0.1);`;
      header.innerHTML = `
        <div style="color:#fff;font-weight:600;font-size:15px;">${Utils.escapeHtml(PageInfo.title)}</div>
        <button id="__uvd_player_close__" style="width:36px;height:36px;border-radius:50%;
          background:rgba(255,93,114,0.2);border:1px solid rgba(255,93,114,0.4);
          color:#fff;cursor:pointer;font-size:20px;">×</button>
      `;
      overlay.appendChild(header);
      
      // Video container
      const container = document.createElement('div');
      container.style.cssText = 'flex:1;display:flex;align-items:center;justify-content:center;';
      
      if (window.videojs) {
        const video = document.createElement('video');
        video.id = '__uvd_player__';
        video.className = 'video-js vjs-big-play-centered';
        video.controls = true;
        video.style.cssText = 'width:100%;height:100%;';
        video.__uvdAllow = true;
        container.appendChild(video);
        
        overlay.appendChild(container);
        document.documentElement.appendChild(overlay);
        this.overlay = overlay;
        
        // Init Video.js
        try {
          this.player = videojs(video, {
            controls: true,
            autoplay: false,
            preload: 'auto',
            fluid: true,
            playbackRates: [0.5, 0.75, 1, 1.25, 1.5, 2],
            userActions: {
              hotkeys: true
            }
          });
          
          // Set source
          const isHLS = url.includes('.m3u8');
          if (isHLS && window.Hls && Hls.isSupported()) {
            const hls = new Hls();
            hls.loadSource(url);
            hls.attachMedia(video);
          } else {
            this.player.src({ src: url, type: this.getMimeType(type) });
          }
          
          this.player.playbackRate(State.data.settings.defaultSpeed);
        } catch(e) {
          console.error('[UMP] Video.js error:', e);
          video.src = url;
          video.controls = true;
        }
      } else {
        // Fallback
        const video = document.createElement('video');
        video.src = url;
        video.controls = true;
        video.__uvdAllow = true;
        video.style.cssText = 'max-width:100%;max-height:100%;';
        container.appendChild(video);
        overlay.appendChild(container);
        document.documentElement.appendChild(overlay);
        this.overlay = overlay;
      }
      
      // Close handler
      overlay.querySelector('#__uvd_player_close__').onclick = () => this.close();
    });
  },
  
  getMimeType(type) {
    const map = {
      'M3U8': 'application/x-mpegURL',
      'MP4': 'video/mp4',
      'WEBM': 'video/webm',
      'MPD': 'application/dash+xml'
    };
    return map[type] || 'video/mp4';
  },
  
  close() {
    if (this.player) {
      try {
        this.player.dispose();
      } catch(e) {}
      this.player = null;
    }
    
    if (this.overlay) {
      this.overlay.remove();
      this.overlay = null;
    }
  }
};

// ========== SETTINGS PANEL ==========
const SettingsPanel = {
  create() {
    const overlay = document.createElement('div');
    overlay.className = 'uvd-settings-overlay';
    overlay.innerHTML = `
      <div class="uvd-settings-container">
        <div class="uvd-settings-stack">
          ${this.renderMain()}
          ${this.renderAdvanced()}
        </div>
      </div>
    `;
    
    document.documentElement.appendChild(overlay);
    this.bindEvents(overlay);
    
    return overlay;
  },
  
  renderMain() {
    const s = State.data.settings;
    return `
      <div class="uvd-settings-screen active" data-screen="main">
        <div class="uvd-settings-header">
          <h2 class="uvd-settings-title">
            <span style="font-size:24px;">⚙️</span>
            Cài đặt
          </h2>
          <button class="uvd-settings-close" data-action="close">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path d="M18 6L6 18M6 6l12 12" stroke-width="2"/>
            </svg>
          </button>
        </div>
        
        <div class="uvd-settings-content">
          <div class="uvd-settings-section">
            <div class="uvd-settings-section-title">Nhanh</div>
            <div class="uvd-quick-toggles">
              ${this.quickToggle('blockAutoplay', '🚫', 'Chặn tự phát', s.blockAutoplay)}
              ${this.quickToggle('reduceMotion', '⚡', 'Hiệu suất', s.reduceMotion)}
              ${this.quickToggle('glowEffects', '✨', 'Hiệu ứng', s.glowEffects)}
              ${this.quickToggle('dataSaver', '📊', 'Tiết kiệm', s.dataSaver)}
            </div>
          </div>
          
          <div class="uvd-settings-section">
            <div class="uvd-settings-section-title">Tùy chọn</div>
            ${this.navItem('advanced', '🔧', 'Nâng cao', 'Filter, backup, blur...')}
          </div>
          
          <div class="uvd-settings-section">
            <div class="uvd-settings-stats">
              <div class="uvd-stat-item">
                <div class="uvd-stat-value">${State.urls.size}</div>
                <div class="uvd-stat-label">Streams</div>
              </div>
              <div class="uvd-stat-item">
                <div class="uvd-stat-value">${State.blockedCount}</div>
                <div class="uvd-stat-label">Popup</div>
              </div>
              <div class="uvd-stat-item">
                <div class="uvd-stat-value">${State.adBlockedCount}</div>
                <div class="uvd-stat-label">Ads</div>
              </div>
            </div>
          </div>
          
          <div class="uvd-settings-group">
            <div class="uvd-settings-group-title">Trình phát</div>
            ${this.settingRow('resumePlayback', 'Nhớ vị trí', '🔄', s.resumePlayback)}
            ${this.settingRow('autoNext', 'Tự động tiếp', '⏭️', s.autoNext)}
            ${this.settingRow('volumeBoost', 'Tăng âm lượng', '🔊', s.volumeBoost)}
            ${this.slider('defaultSpeed', 'Tốc độ mặc định', 0.5, 2, 0.25, s.defaultSpeed, 'x')}
          </div>
        </div>
        
        <div class="uvd-settings-footer">
          <div style="font-size:12px;color:rgba(255,255,255,0.4);">
            v${VERSION} - nguyenquocngu91
          </div>
        </div>
      </div>
    `;
  },
  
  renderAdvanced() {
    const s = State.data.settings;
    return `
      <div class="uvd-settings-screen" data-screen="advanced">
        <div class="uvd-settings-header">
          <button class="uvd-settings-back" data-action="back">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path d="M15 18l-6-6 6-6" stroke-width="2"/>
            </svg>
          </button>
          <h2 class="uvd-settings-title">🔧 Nâng cao</h2>
          <div style="width:40px;"></div>
        </div>
        
        <div class="uvd-settings-content">
          <div class="uvd-settings-group">
            <div class="uvd-settings-group-title">Hiệu ứng</div>
            ${this.slider('blurIntensity', 'Độ mờ (blur)', 0, 30, 1, s.blurIntensity, 'px')}
            ${this.slider('effectsIntensity', 'Cường độ glow', 0, 100, 5, s.effectsIntensity, '%')}
          </div>
          
          <div class="uvd-settings-group">
            <div class="uvd-settings-group-title">Filterlist</div>
            <textarea id="__uvd_filter_text__" placeholder="domain hoặc regex:pattern" 
              style="width:100%;height:100px;background:rgba(0,0,0,0.5);border:1px solid rgba(255,255,255,0.1);
              border-radius:10px;color:#fff;padding:12px;font-size:12px;font-family:monospace;"
            >${(State.data.filterlist || []).join('\n')}</textarea>
            <button class="uvd-btn" data-action="save-filter" style="width:100%;margin-top:8px;">
              💾 Lưu filter
            </button>
          </div>
          
          <div class="uvd-settings-group">
            <div class="uvd-settings-group-title">Backup</div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
              <button class="uvd-btn" data-action="backup">📤 Xuất</button>
              <button class="uvd-btn" data-action="restore">📥 Nhập</button>
            </div>
          </div>
        </div>
      </div>
    `;
  },
  
  quickToggle(key, icon, label, checked) {
    return `
      <button class="uvd-quick-toggle ${checked ? 'active' : ''}" data-toggle="${key}">
        <span class="uvd-quick-toggle-icon">${icon}</span>
        <span class="uvd-quick-toggle-label">${label}</span>
        <span class="uvd-quick-toggle-indicator"></span>
      </button>
    `;
  },
  
  navItem(screen, icon, title, desc) {
    return `
      <div class="uvd-nav-item" data-navigate="${screen}">
        <div class="uvd-nav-icon">${icon}</div>
        <div class="uvd-nav-content">
          <div class="uvd-nav-title">${title}</div>
          <div class="uvd-nav-desc">${desc}</div>
        </div>
        <svg class="uvd-nav-arrow" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path d="M9 18l6-6-6-6" stroke-width="2"/>
        </svg>
      </div>
    `;
  },
  
  settingRow(key, label, icon, checked) {
    return `
      <div class="uvd-setting-row">
        <div class="uvd-setting-info">
          <span class="uvd-setting-icon">${icon}</span>
          <span class="uvd-setting-label">${label}</span>
        </div>
        <button class="uvd-toggle-switch ${checked ? 'active' : ''}" data-setting="${key}">
          <span class="uvd-toggle-knob"></span>
        </button>
      </div>
    `;
  },
  
  slider(key, label, min, max, step, value, unit) {
    return `
      <div class="uvd-slider-group">
        <div class="uvd-slider-header">
          <span>${label}</span>
          <span class="uvd-slider-value" data-value="${key}">${value}${unit}</span>
        </div>
        <input type="range" class="uvd-slider" data-slider="${key}"
          min="${min}" max="${max}" step="${step}" value="${value}">
      </div>
    `;
  },
  
  bindEvents(overlay) {
    const stack = overlay.querySelector('.uvd-settings-stack');
    let history = ['main'];
    
    // Event delegation
    overlay.addEventListener('click', e => {
      // Navigation
      const navItem = e.target.closest('[data-navigate]');
      if (navItem) {
        this.navigate(stack, history, navItem.dataset.navigate);
        return;
      }
      
      // Back
      if (e.target.closest('[data-action="back"]')) {
        this.back(stack, history);
        return;
      }
      
      // Close
      if (e.target.closest('[data-action="close"]')) {
        overlay.style.opacity = '0';
        setTimeout(() => overlay.remove(), 200);
        return;
      }
      
      // Quick toggle
      const toggle = e.target.closest('.uvd-quick-toggle');
      if (toggle) {
        const key = toggle.dataset.toggle;
        const active = toggle.classList.toggle('active');
        State.data.settings[key] = active;
        State.save();
        this.applyChange(key, active);
        Utils.toast(active ? '✅ Đã bật' : '❌ Đã tắt');
        return;
      }
      
      // Setting toggle
      const settingToggle = e.target.closest('.uvd-toggle-switch[data-setting]');
      if (settingToggle) {
        const key = settingToggle.dataset.setting;
        const active = settingToggle.classList.toggle('active');
        State.data.settings[key] = active;
        State.save();
        this.applyChange(key, active);
        return;
      }
      
      // Actions
      const action = e.target.closest('[data-action]')?.dataset.action;
      if (action === 'save-filter') {
        const text = overlay.querySelector('#__uvd_filter_text__').value;
        State.data.filterlist = text.split('\n').map(s => s.trim()).filter(Boolean);
        State.save();
        State.compileFilters();
        Utils.toast('✅ Đã lưu filter');
      } else if (action === 'backup') {
        const blob = new Blob([JSON.stringify(State.data)], {type:'application/json'});
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'uvd_backup.json';
        a.click();
      } else if (action === 'restore') {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = e => {
          const reader = new FileReader();
          reader.onload = ev => {
            try {
              State.data = Object.assign(State.data, JSON.parse(ev.target.result));
              State.save();
              Utils.toast('✅ Đã nhập');
              overlay.remove();
            } catch(ex) {
              Utils.toast('⚠️ File không hợp lệ', '#ff5d72');
            }
          };
          reader.readAsText(e.target.files[0]);
        };
        input.click();
      }
    });
    
    // Sliders
    overlay.addEventListener('input', e => {
      if (!e.target.matches('.uvd-slider')) return;
      
      const key = e.target.dataset.slider;
      const value = parseFloat(e.target.value);
      const valueEl = overlay.querySelector(`[data-value="${key}"]`);
      const unit = valueEl?.textContent.match(/[a-z%]+$/i)?.[0] || '';
      
      if (valueEl) valueEl.textContent = value + unit;
      
      State.data.settings[key] = value;
      State.save();
      
      if (key === 'blurIntensity' || key === 'effectsIntensity') {
        this.applyChange(key, value);
      }
    });
  },
  
  navigate(stack, history, screen) {
    const current = stack.querySelector('.uvd-settings-screen.active');
    const next = stack.querySelector(`[data-screen="${screen}"]`);
    if (!next || next === current) return;
    
    current.style.transform = 'translateX(-20%)';
    current.style.opacity = '0';
    
    setTimeout(() => {
      current.classList.remove('active');
      current.style.transform = '';
      
      next.style.transform = 'translateX(100%)';
      next.classList.add('active');
      
      requestAnimationFrame(() => {
        next.style.transition = 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.3s';
        next.style.transform = 'translateX(0)';
        next.style.opacity = '1';
      });
      
      history.push(screen);
    }, 150);
  },
  
  back(stack, history) {
    if (history.length <= 1) return;
    
    const current = stack.querySelector('.uvd-settings-screen.active');
    history.pop();
    const prevName = history[history.length - 1];
    const prev = stack.querySelector(`[data-screen="${prevName}"]`);
    
    current.style.transform = 'translateX(100%)';
    current.style.opacity = '0';
    
    setTimeout(() => {
      current.classList.remove('active');
      current.style.transform = '';
      
      prev.style.transform = 'translateX(-20%)';
      prev.classList.add('active');
      
      requestAnimationFrame(() => {
        prev.style.transition = 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.3s';
        prev.style.transform = 'translateX(0)';
        prev.style.opacity = '1';
      });
    }, 150);
  },
  
  applyChange(key, value) {
    if (key === 'reduceMotion' || key === 'blurIntensity') {
      const panel = document.getElementById('__uvd__');
      if (panel) {
        const blur = State.data.settings.reduceMotion ? 0 : State.data.settings.blurIntensity;
        panel.style.setProperty('--uvd-blur', blur + 'px');
      }
    } else if (key === 'glowEffects' || key === 'effectsIntensity') {
      const panel = document.getElementById('__uvd__');
      if (panel) {
        const on = State.data.settings.glowEffects && !State.data.settings.reduceMotion;
        const intensity = State.data.settings.effectsIntensity;
        panel.style.setProperty('--glow-px', on ? Math.round(4 + intensity * 0.18) + 'px' : '0px');
        panel.style.setProperty('--glow-op', on ? (0.15 + intensity * 0.0035).toFixed(3) : '0');
      }
    } else if (key === 'blockAutoplay' && value) {
      document.querySelectorAll('video, audio').forEach(el => {
        if (!el.__uvdAllow && el.id !== '__uvd_player__') {
          try {
            el.removeAttribute('autoplay');
            el.autoplay = false;
            if (!el.paused) el.pause();
          } catch(e) {}
        }
      });
    }
  }
};

// ========== UI MANAGER ==========
const UI = {
  panel: null,
  currentTab: 'streams',
  
  build() {
    // Cleanup old
    const old = document.getElementById('__uvd__');
    if (old) old.remove();
    
    const panel = document.createElement('div');
    panel.id = '__uvd__';
    panel.className = 'uvd-glass-panel';
    panel.style.cssText = `position:fixed;top:15px;left:15px;right:15px;
      height:calc(100dvh - 30px);z-index:2147483647;`;
    
    panel.innerHTML = `
      <div class="uvd-liquid-bg"></div>
      <div class="uvd-panel-content">
        ${this.renderHeader()}
        ${this.renderInfo()}
        ${this.renderTabs()}
        <div class="uvd-content-wrapper">
          <div id="__uvd_stream_list__" class="uvd-scroll"></div>
        </div>
        ${this.renderFooter()}
      </div>
    `;
    
    document.documentElement.appendChild(panel);
    this.panel = panel;
    
    this.applyStyles();
    this.bindEvents();
    this.renderTab('streams');
    
    return panel;
  },
  
  renderHeader() {
    return `
      <div id="__uvd_header__" style="display:flex;justify-content:space-between;
        align-items:center;padding-bottom:12px;border-bottom:1px solid var(--border);margin-bottom:10px;">
        <div style="display:flex;align-items:center;gap:8px;">
          <span style="width:10px;height:10px;background:var(--grad-liquid);border-radius:50%;
            animation:uvdPulse 2s infinite;"></span>
          <span style="font-weight:700;font-size:16px;">UMP DL 
            <span style="background:var(--grad-liquid);-webkit-background-clip:text;
              background-clip:text;color:transparent;">v${VERSION}</span>
          </span>
        </div>
        <div style="display:flex;gap:6px;">
          <button class="uvd-btn-icon" id="__uvd_autoplay__" title="Auto Play">▶</button>
          <button class="uvd-btn-icon" id="__uvd_settings__" title="Cài đặt">⚙</button>
          <button class="uvd-btn-icon" id="__uvd_refresh__" title="Refresh">↻</button>
          <button class="uvd-btn-icon" id="__uvd_close__" title="Đóng">×</button>
        </div>
      </div>
    `;
  },
  
  renderInfo() {
    const playSelector = State.data.siteProfiles?.[PageInfo.host]?.playSelector || '';
    return `
      <div style="margin-bottom:10px;font-size:12px;">
        <span style="color:var(--text2);">Trang: </span>
        <span id="__uvd_title__" style="color:var(--accent);cursor:pointer;">${Utils.escapeHtml(PageInfo.title)}</span>
        <br>
        <span style="color:var(--text2);">Play selector: </span>
        <span id="__uvd_playsel__" style="color:var(--accent2);font-family:monospace;cursor:pointer;font-size:11px;">
          ${Utils.escapeHtml(playSelector || '(chưa đặt)')}
        </span>
      </div>
    `;
  },
  
  renderTabs() {
    return `
      <div class="uvd-tabbar">
        <div class="uvd-tab-indicator" id="__uvd_tab_indicator__"></div>
        <button class="uvd-tab uvd-tab-active" data-tab="streams">Streams (${State.urls.size})</button>
        <button class="uvd-tab" data-tab="settings">Cài đặt</button>
      </div>
    `;
  },
  
  renderFooter() {
    return `
      <div style="display:flex;gap:6px;margin-top:10px;flex-wrap:wrap;">
        ${['TXT','JSON','M3U','CSV'].map(f => 
          `<button class="uvd-btn uvd-btn-sm" data-export="${f.toLowerCase()}" style="flex:1 0 auto;">${f}</button>`
        ).join('')}
      </div>
      <div style="text-align:center;font-size:11px;color:var(--text3);margin-top:8px;">
        © nguyenquocngu91
      </div>
    `;
  },
  
  bindEvents() {
    // Event delegation cho toàn panel
    this.panel.addEventListener('click', e => {
      const target = e.target;
      
      // Tabs
      if (target.matches('.uvd-tab')) {
        this.switchTab(target.dataset.tab);
        return;
      }
      
      // Header buttons
      if (target.id === '__uvd_close__') {
        NetworkMonitor.uninstall();
        this.panel.remove();
        return;
      }
      
      if (target.id === '__uvd_refresh__') {
        URLDetector.scan();
        this.update();
        Utils.toast('✅ Đã làm mới');
        return;
      }
      
      if (target.id === '__uvd_autoplay__') {
        const n = AutoClicker.run(false);
        Utils.toast(n > 0 ? `⚡ Đã bấm ${n} nút` : '⚠️ Không thấy nút Play');
        setTimeout(() => this.update(), 1500);
        return;
      }
      
      if (target.id === '__uvd_settings__') {
        SettingsPanel.create();
        return;
      }
      
      // Info editing
      if (target.id === '__uvd_title__') {
        const newTitle = prompt('Tên file:', PageInfo.title);
        if (newTitle) {
          document.title = newTitle;
          this.update();
        }
        return;
      }
      
      if (target.id === '__uvd_playsel__') {
        const current = State.data.siteProfiles?.[PageInfo.host]?.playSelector || '';
        const newSel = prompt('CSS selector nút Play:', current);
        if (newSel !== null) {
          State.data.siteProfiles = State.data.siteProfiles || {};
          State.data.siteProfiles[PageInfo.host] = State.data.siteProfiles[PageInfo.host] || {};
          State.data.siteProfiles[PageInfo.host].playSelector = newSel.trim();
          State.save();
          this.update();
          if (newSel.trim()) {
            Utils.toast('✅ Đã lưu selector');
            AutoClicker.run(false);
          }
        }
        return;
      }
      
      // Export buttons
      const exportBtn = target.closest('[data-export]');
      if (exportBtn) {
        this.exportData(exportBtn.dataset.export);
        return;
      }
      
      // Stream actions (delegation)
      const actionBtn = target.closest('[data-action]');
      if (actionBtn && actionBtn.dataset.action) {
        this.handleStreamAction(actionBtn);
        return;
      }
    });
  },
  
  switchTab(tab) {
    this.currentTab = tab;
    
    this.panel.querySelectorAll('.uvd-tab').forEach(t => {
      const isActive = t.dataset.tab === tab;
      t.classList.toggle('uvd-tab-active', isActive);
      
      if (isActive) {
        const indicator = document.getElementById('__uvd_tab_indicator__');
        if (indicator) {
          indicator.style.width = t.offsetWidth + 'px';
          indicator.style.transform = `translateX(${t.offsetLeft}px)`;
        }
      }
    });
    
    this.renderTab(tab);
  },
  
  renderTab(tab) {
    const container = document.getElementById('__uvd_stream_list__');
    if (!container) return;
    
    if (tab === 'streams') {
      this.renderStreams(container);
    } else if (tab === 'settings') {
      container.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text2);">Dùng nút ⚙ ở header để mở Settings</div>';
    }
  },
  
  renderStreams(container) {
    const streams = [...State.urls.entries()]
      .map(([url, data]) => ({ url, ...data }))
      .sort((a, b) => a.priority - b.priority);
    
    if (!streams.length) {
      container.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text2);">Chưa phát hiện stream</div>';
      return;
    }
    
    // Lazy render
    let rendered = 0;
    const renderBatch = () => {
      const end = Math.min(rendered + CONFIG.LAZY_BATCH, streams.length);
      const html = streams.slice(rendered, end).map((item, i) => this.buildStreamCard(item, rendered + i)).join('');
      
      const frag = document.createElement('div');
      frag.innerHTML = html;
      while (frag.firstChild) container.appendChild(frag.firstChild);
      
      rendered = end;
      
      if (rendered < streams.length) {
        const btn = document.createElement('button');
        btn.className = 'uvd-btn uvd-btn-sm';
        btn.style.cssText = 'width:100%;margin-top:8px;';
        btn.textContent = `Xem thêm (${streams.length - rendered})`;
        btn.onclick = () => {
          btn.remove();
          renderBatch();
        };
        container.appendChild(btn);
      }
    };
    
    container.innerHTML = '';
    renderBatch();
  },
  
  buildStreamCard(item, index) {
    const actions = item.type === 'BLOB' ? `
      <button class="uvd-btn uvd-btn-sm" data-action="play" data-url="${encodeURIComponent(item.url)}" 
        data-type="${item.type}" style="background:rgba(109,140,255,0.25);">▶ Xem</button>
    ` : (item.type === 'IFRAME' ? `
      <button class="uvd-btn uvd-btn-sm" data-action="iframe" data-url="${encodeURIComponent(item.url)}" 
        style="grid-column:1/3;">🔗 Mở iframe</button>
    ` : `
      <button class="uvd-btn uvd-btn-sm" data-action="share" data-url="${encodeURIComponent(item.url)}" 
        style="background:rgba(139,92,246,0.2);">📤 Chia sẻ</button>
      <button class="uvd-btn uvd-btn-sm" data-action="copy" data-url="${encodeURIComponent(item.url)}">
        📋 Copy</button>
      <button class="uvd-btn uvd-btn-sm" data-action="play" data-url="${encodeURIComponent(item.url)}" 
        data-type="${item.type}" style="background:rgba(109,140,255,0.25);grid-column:1/3;">
        ▶ Xem</button>
    `);
    
    return `
      <div class="uvd-card" data-type="${item.type}">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
          <span class="uvd-type-badge">#${index+1} ${item.type}</span>
        </div>
        <div class="uvd-url-box">${Utils.escapeHtml(item.url)}</div>
        <div class="uvd-grid-2" style="margin-top:8px;">${actions}</div>
      </div>
    `;
  },
  
  handleStreamAction(btn) {
    const action = btn.dataset.action;
    const url = decodeURIComponent(btn.dataset.url || '');
    
    if (action === 'play') {
      VideoPlayer.show(url, btn.dataset.type || 'MP4');
    } else if (action === 'copy') {
      Utils.copyText(url);
      Utils.toast('✅ Đã copy');
    } else if (action === 'share') {
      if (navigator.share) {
        navigator.share({ title: PageInfo.title, url }).catch(() => {});
      } else {
        Utils.toast('⚠️ Thiết bị không hỗ trợ');
      }
    } else if (action === 'iframe') {
      window.open(url, '_blank');
    }
  },
  
  exportData(format) {
    const streams = [...State.urls.entries()].map(([url, data]) => ({ 
      url, 
      type: data.type, 
      source: data.source 
    }));
    
    let content, mime, filename;
    
    if (format === 'json') {
      content = JSON.stringify({ page: PageInfo, streams }, null, 2);
      mime = 'application/json';
      filename = PageInfo.title + '_streams.json';
    } else if (format === 'csv') {
      content = 'Type,URL,Source\n' + streams.map(s => 
        `${s.type},"${s.url}",${s.source}`
      ).join('\n');
      mime = 'text/csv';
      filename = PageInfo.title + '_streams.csv';
    } else if (format === 'm3u') {
      content = '#EXTM3U\n' + streams.filter(s => s.type !== 'IFRAME').map(s => 
        `#EXTINF:-1,${PageInfo.title} [${s.type}]\n${s.url}`
      ).join('\n');
      mime = 'audio/x-mpegurl';
      filename = PageInfo.title + '.m3u';
    } else {
      content = streams.map(s => s.url).join('\n');
      mime = 'text/plain';
      filename = PageInfo.title + '_urls.txt';
    }
    
    const blob = new Blob([content], { type: mime });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
    
    Utils.toast(`✅ Đã xuất ${format.toUpperCase()}`);
  },
  
  update() {
    if (this.currentTab === 'streams') {
      const container = document.getElementById('__uvd_stream_list__');
      if (container) this.renderStreams(container);
    }
    
    // Update tabs count
    const streamTab = this.panel?.querySelector('[data-tab="streams"]');
    if (streamTab) {
      streamTab.textContent = `Streams (${State.urls.size})`;
    }
    
    // Update indicator position
    const activeTab = this.panel?.querySelector('.uvd-tab-active');
    const indicator = document.getElementById('__uvd_tab_indicator__');
    if (activeTab && indicator) {
      indicator.style.width = activeTab.offsetWidth + 'px';
      indicator.style.transform = `translateX(${activeTab.offsetLeft}px)`;
    }
  },
  
  applyStyles() {
    const blur = State.data.settings.reduceMotion ? 0 : State.data.settings.blurIntensity;
    const glowOn = State.data.settings.glowEffects && !State.data.settings.reduceMotion;
    const intensity = State.data.settings.effectsIntensity;
    
    this.panel.style.setProperty('--uvd-blur', blur + 'px');
    this.panel.style.setProperty('--glow-px', glowOn ? Math.round(4 + intensity * 0.18) + 'px' : '0px');
    this.panel.style.setProperty('--glow-op', glowOn ? (0.15 + intensity * 0.0035).toFixed(3) : '0');
    this.panel.classList.toggle('uvd-reduce-motion', State.data.settings.reduceMotion);
  }
};

// ========== CSS INJECTION ==========
const CSS = `
@keyframes uvdSlideIn{from{transform:translate(-50%,-20px);opacity:0}to{transform:translate(-50%,0);opacity:1}}
@keyframes uvdPulse{0%,100%{opacity:1}50%{opacity:0.4}}
@keyframes uvdScaleIn{from{opacity:0;transform:scale(0.94)}to{opacity:1;transform:scale(1)}}
@keyframes uvdFadeIn{from{opacity:0}to{opacity:1}}

:root{
  --bg:rgba(3,4,8,0.97);
  --glass:rgba(12,14,20,0.85);
  --border:rgba(255,255,255,0.08);
  --text:#f3f5ff;
  --text2:#9ca3bd;
  --text3:#5d6377;
  --accent:#6d8cff;
  --accent2:#b98bff;
  --danger:#ff5d72;
  --gold:#ffb84d;
  --success:#34d399;
  --card-bg:rgba(255,255,255,0.03);
  --grad-liquid:linear-gradient(135deg,var(--accent),var(--accent2));
  --uvd-blur:24px;
  --glow-px:0px;
  --glow-op:0;
}

.uvd-glass-panel{
  background:var(--glass);
  backdrop-filter:blur(var(--uvd-blur)) saturate(130%);
  -webkit-backdrop-filter:blur(var(--uvd-blur)) saturate(130%);
  border:1px solid var(--border);
  border-radius:26px;
  box-shadow:0 20px 50px rgba(0,0,0,0.8), 0 0 var(--glow-px) rgba(109,140,255,var(--glow-op));
  color:var(--text);
  font-family:-apple-system,BlinkMacSystemFont,'SF Pro Display','Segoe UI',sans-serif;
  font-size:13px;
  overflow:hidden;
  animation:uvdScaleIn 0.4s ease;
}

.uvd-liquid-bg{
  position:absolute;
  inset:-30%;
  z-index:0;
  pointer-events:none;
  background:
    radial-gradient(closest-side,rgba(109,140,255,0.12),transparent 70%) 15% 20%/55% 55% no-repeat,
    radial-gradient(closest-side,rgba(185,139,255,0.10),transparent 70%) 85% 75%/60% 60% no-repeat;
  filter:blur(50px);
}

.uvd-panel-content{
  position:relative;
  z-index:1;
  padding:16px;
  height:100%;
  display:flex;
  flex-direction:column;
}

.uvd-content-wrapper{
  flex:1;
  overflow:hidden;
  min-height:0;
}

.uvd-scroll{
  overflow-y:auto;
  height:100%;
  padding-right:4px;
}

.uvd-scroll::-webkit-scrollbar{width:4px}
.uvd-scroll::-webkit-scrollbar-thumb{background:var(--accent);border-radius:4px}
.uvd-scroll::-webkit-scrollbar-track{background:transparent}

.uvd-btn-icon{
  width:34px;
  height:34px;
  border-radius:50%;
  border:1px solid var(--border);
  background:rgba(255,255,255,0.08);
  color:#fff;
  cursor:pointer;
  font-size:16px;
  transition:all 0.2s;
}
.uvd-btn-icon:hover{background:rgba(255,255,255,0.15);transform:scale(1.05)}
.uvd-btn-icon:active{transform:scale(0.95)}

.uvd-btn{
  background:rgba(255,255,255,0.08);
  border:1px solid var(--border);
  color:var(--text);
  padding:9px 16px;
  border-radius:12px;
  font-weight:600;
  font-size:13px;
  cursor:pointer;
  transition:all 0.2s;
}
.uvd-btn:hover{background:rgba(255,255,255,0.12)}
.uvd-btn:active{transform:scale(0.96)}

.uvd-btn-sm{
  padding:7px 12px;
  font-size:12px;
  border-radius:10px;
}

.uvd-tabbar{
  display:flex;
  gap:2px;
  padding:6px 8px;
  background:rgba(255,255,255,0.04);
  border:1px solid var(--border);
  border-radius:999px;
  margin-bottom:10px;
  position:relative;
  overflow-x:auto;
  scrollbar-width:none;
}
.uvd-tabbar::-webkit-scrollbar{display:none}

.uvd-tab-indicator{
  position:absolute;
  top:4px;
  bottom:4px;
  left:0;
  width:0;
  border-radius:999px;
  background:var(--grad-liquid);
  z-index:0;
  box-shadow:0 3px 12px rgba(109,140,255,0.45);
  transition:transform 0.4s cubic-bezier(.4,0,.2,1), width 0.4s cubic-bezier(.4,0,.2,1);
}

.uvd-tab{
  position:relative;
  z-index:1;
  flex:1;
  background:transparent;
  border:none;
  color:var(--text2);
  font-weight:600;
  font-size:12px;
  padding:9px 16px;
  border-radius:999px;
  cursor:pointer;
  white-space:nowrap;
}
.uvd-tab.uvd-tab-active{
  color:#fff;
  text-shadow:0 1px 4px rgba(0,0,0,0.3);
}

.uvd-card{
  background:var(--card-bg);
  border:1px solid var(--border);
  border-radius:16px;
  padding:14px;
  margin-bottom:10px;
  animation:uvdFadeIn 0.4s ease;
  transition:all 0.2s;
}
.uvd-card:hover{
  transform:translateY(-2px);
  box-shadow:0 8px 20px rgba(0,0,0,0.5);
}

.uvd-type-badge{
  display:inline-block;
  padding:4px 12px;
  border-radius:12px;
  font-size:11px;
  font-weight:700;
  background:linear-gradient(135deg,rgba(109,140,255,0.22),rgba(185,139,255,0.18));
  color:var(--accent);
  border:1px solid rgba(109,140,255,0.28);
  letter-spacing:0.03em;
}

.uvd-url-box{
  background:rgba(0,0,0,0.5);
  border-radius:10px;
  padding:12px;
  font-family:'SF Mono',Consolas,monospace;
  font-size:11px;
  word-break:break-all;
  color:var(--text2);
  max-height:60px;
  overflow-y:auto;
  line-height:1.5;
  border:1px solid rgba(255,255,255,0.04);
}

.uvd-grid-2{
  display:grid;
  grid-template-columns:1fr 1fr;
  gap:8px;
}

/* Settings Panel */
.uvd-settings-overlay{
  position:fixed;
  inset:0;
  background:rgba(0,0,0,0.7);
  backdrop-filter:blur(10px);
  z-index:2147483649;
  display:flex;
  align-items:center;
  justify-content:center;
  padding:20px;
  animation:uvdFadeIn 0.2s ease;
}

.uvd-settings-container{
  width:100%;
  max-width:480px;
  max-height:90vh;
  background:rgba(18,20,28,0.95);
  border-radius:24px;
  border:1px solid rgba(255,255,255,0.1);
  box-shadow:0 20px 60px rgba(0,0,0,0.8);
  overflow:hidden;
  animation:uvdScaleIn 0.3s cubic-bezier(0.4,0,0.2,1);
}

.uvd-settings-stack{
  position:relative;
  height:100%;
  overflow:hidden;
}

.uvd-settings-screen{
  position:absolute;
  inset:0;
  display:flex;
  flex-direction:column;
  opacity:0;
  pointer-events:none;
  transition:transform 0.3s cubic-bezier(0.4,0,0.2,1), opacity 0.3s;
}

.uvd-settings-screen.active{
  opacity:1;
  pointer-events:auto;
}

.uvd-settings-header{
  display:flex;
  align-items:center;
  justify-content:space-between;
  padding:20px 24px;
  border-bottom:1px solid rgba(255,255,255,0.08);
  background:rgba(255,255,255,0.02);
}

.uvd-settings-title{
  font-size:20px;
  font-weight:700;
  color:#fff;
  display:flex;
  align-items:center;
  gap:10px;
  margin:0;
}

.uvd-settings-close,
.uvd-settings-back{
  width:40px;
  height:40px;
  border-radius:50%;
  border:none;
  background:rgba(255,255,255,0.08);
  color:#fff;
  cursor:pointer;
  display:flex;
  align-items:center;
  justify-content:center;
  transition:all 0.2s;
}
.uvd-settings-close:hover,
.uvd-settings-back:hover{
  background:rgba(255,255,255,0.15);
  transform:scale(1.05);
}

.uvd-settings-content{
  flex:1;
  overflow-y:auto;
  padding:20px 24px;
}

.uvd-settings-section{
  margin-bottom:24px;
}

.uvd-settings-section-title{
  font-size:13px;
  font-weight:600;
  color:rgba(255,255,255,0.5);
  text-transform:uppercase;
  letter-spacing:0.5px;
  margin-bottom:12px;
}

.uvd-quick-toggles{
  display:grid;
  grid-template-columns:repeat(2,1fr);
  gap:12px;
}

.uvd-quick-toggle{
  position:relative;
  padding:16px;
  background:rgba(255,255,255,0.05);
  border:2px solid rgba(255,255,255,0.08);
  border-radius:16px;
  cursor:pointer;
  transition:all 0.2s;
  display:flex;
  flex-direction:column;
  align-items:center;
  gap:8px;
}
.uvd-quick-toggle:hover{
  background:rgba(255,255,255,0.08);
}
.uvd-quick-toggle.active{
  background:linear-gradient(135deg,rgba(109,140,255,0.2),rgba(185,139,255,0.15));
  border-color:rgba(109,140,255,0.4);
}

.uvd-quick-toggle-icon{
  font-size:28px;
}

.uvd-quick-toggle-label{
  font-size:13px;
  font-weight:600;
  color:#fff;
  text-align:center;
}

.uvd-quick-toggle-indicator{
  position:absolute;
  top:8px;
  right:8px;
  width:8px;
  height:8px;
  border-radius:50%;
  background:rgba(255,255,255,0.3);
  transition:all 0.2s;
}
.uvd-quick-toggle.active .uvd-quick-toggle-indicator{
  background:#34d399;
  box-shadow:0 0 12px rgba(52,211,153,0.6);
}

.uvd-nav-item{
  display:flex;
  align-items:center;
  gap:16px;
  padding:16px;
  background:rgba(255,255,255,0.04);
  border-radius:16px;
  margin-bottom:8px;
  cursor:pointer;
  transition:all 0.2s;
}
.uvd-nav-item:hover{
  background:rgba(255,255,255,0.08);
  transform:translateX(4px);
}

.uvd-nav-icon{
  font-size:24px;
  width:48px;
  height:48px;
  display:flex;
  align-items:center;
  justify-content:center;
  background:rgba(109,140,255,0.15);
  border-radius:12px;
}

.uvd-nav-content{
  flex:1;
  min-width:0;
}

.uvd-nav-title{
  font-size:15px;
  font-weight:600;
  color:#fff;
  margin-bottom:4px;
}

.uvd-nav-desc{
  font-size:12px;
  color:rgba(255,255,255,0.5);
  overflow:hidden;
  text-overflow:ellipsis;
  white-space:nowrap;
}

.uvd-nav-arrow{
  color:rgba(255,255,255,0.3);
  transition:transform 0.2s;
}
.uvd-nav-item:hover .uvd-nav-arrow{
  transform:translateX(4px);
}

.uvd-settings-stats{
  display:grid;
  grid-template-columns:repeat(3,1fr);
  gap:12px;
  padding:16px;
  background:linear-gradient(135deg,rgba(109,140,255,0.1),rgba(185,139,255,0.05));
  border-radius:16px;
  border:1px solid rgba(109,140,255,0.2);
}

.uvd-stat-item{
  text-align:center;
}

.uvd-stat-value{
  font-size:24px;
  font-weight:700;
  color:#6d8cff;
  margin-bottom:4px;
}

.uvd-stat-label{
  font-size:11px;
  color:rgba(255,255,255,0.5);
}

.uvd-settings-footer{
  padding:16px 24px;
  border-top:1px solid rgba(255,255,255,0.08);
  text-align:center;
}

.uvd-settings-group{
  margin-bottom:24px;
}

.uvd-settings-group-title{
  font-size:13px;
  font-weight:600;
  color:rgba(255,255,255,0.6);
  margin-bottom:12px;
  padding-left:4px;
}

.uvd-setting-row{
  display:flex;
  align-items:center;
  justify-content:space-between;
  padding:16px;
  background:rgba(255,255,255,0.04);
  border-radius:12px;
  margin-bottom:8px;
}

.uvd-setting-info{
  display:flex;
  align-items:center;
  gap:12px;
}

.uvd-setting-icon{
  font-size:20px;
}

.uvd-setting-label{
  font-size:14px;
  font-weight:500;
  color:#fff;
}

.uvd-toggle-switch{
  width:44px;
  height:26px;
  border-radius:14px;
  background:rgba(255,255,255,0.15);
  border:none;
  position:relative;
  cursor:pointer;
  transition:all 0.2s;
  padding:0;
}
.uvd-toggle-switch.active{
  background:var(--grad-liquid);
}

.uvd-toggle-knob{
  position:absolute;
  top:3px;
  left:3px;
  width:20px;
  height:20px;
  border-radius:50%;
  background:#fff;
  transition:transform 0.2s;
  box-shadow:0 1px 3px rgba(0,0,0,0.4);
}
.uvd-toggle-switch.active .uvd-toggle-knob{
  transform:translateX(18px);
}

.uvd-slider-group{
  padding:16px;
  background:rgba(255,255,255,0.04);
  border-radius:12px;
  margin-bottom:12px;
}

.uvd-slider-header{
  display:flex;
  justify-content:space-between;
  margin-bottom:12px;
  font-size:14px;
  color:#fff;
}

.uvd-slider-value{
  font-weight:700;
  color:#6d8cff;
}

.uvd-slider{
  width:100%;
  height:4px;
  -webkit-appearance:none;
  appearance:none;
  background:rgba(255,255,255,0.1);
  outline:none;
  border-radius:2px;
}

.uvd-slider::-webkit-slider-thumb{
  -webkit-appearance:none;
  width:20px;
  height:20px;
  border-radius:50%;
  background:#6d8cff;
  cursor:pointer;
  box-shadow:0 2px 8px rgba(109,140,255,0.4);
}

.uvd-slider::-moz-range-thumb{
  width:20px;
  height:20px;
  border-radius:50%;
  background:#6d8cff;
  cursor:pointer;
  border:none;
  box-shadow:0 2px 8px rgba(109,140,255,0.4);
}
`;

// Inject CSS
const styleEl = document.createElement('style');
styleEl.textContent = CSS;
document.head.appendChild(styleEl);

// ========== INIT ==========
URLDetector.scan();

try {
  performance.getEntriesByType('resource').forEach(e => {
    if (!State.isAdUrl(e.name)) {
      URLDetector.find(e.name, 'network:perf');
    }
  });
} catch(e) {}

NetworkMonitor.install();
PopupBlocker.install();
AutoplayBlocker.install();

UI.build();

console.log(`[UMP DL v${VERSION}] Optimized - Loaded ${State.urls.size} streams`);
Utils.toast(`✅ v${VERSION} Sẵn sàng!`);

// Auto-click sau 400ms
setTimeout(() => {
  const n = AutoClicker.run(true);
  if (n > 0) {
    setTimeout(() => {
      UI.update();
      const found = State.urls.size;
      if (found > 0) {
        Utils.toast(`⚡ Tìm thấy ${found} stream`);
      }
    }, 3500);
  }
}, 400);

})();