/**
 * Universal Media Player & Downloader - V6.7.19 PRO
 * - REDESIGN LỚN player: bỏ hẳn hướng "lấp khoảng trống" (header nổi ở 6.7.16,
 *   ambient blur ở 6.7.18) — thay bằng "card" bo góc 2 góc trên, nền theo màu
 *   theme của script (không còn đen trơn), CAO THEO NỘI DUNG (header + video
 *   co theo tỉ lệ thật) thay vì ép flex:1 chiếm hết màn hình — tự loại bỏ
 *   khoảng trống thừa từ gốc, không cần bù bằng hiệu ứng nữa.
 * - Toolbar 11 nút rời rạc → gọn còn: tiêu đề + nút ⋮ (chỉ Chất lượng + Phụ đề)
 *   + nút đóng. Cắt: tốc độ phát, toàn màn hình, PiP, hẹn giờ, mute riêng
 *   (trùng với control gốc của Video.js v10 vốn đã có sẵn 🔊/⚙/⧉/⤢), ghim
 *   controls, screenshot. Boost & Tự động phát tiếp KHÔNG mất chức năng — vẫn
 *   bật/tắt được ở Cài đặt (⚙) như trước, chỉ bỏ nút tắt/mở nhanh trong player.
 *   LƯU Ý: Hẹn giờ tắt & Screenshot giờ KHÔNG còn cách truy cập nào (không có
 *   trong Cài đặt) — nếu vẫn cần, báo lại để thêm vào menu ⋮.
 * - Xoá hẳn footer — dung lượng file dời lên dòng 2 của header (cùng loại +
 *   độ phân giải). Bỏ luôn kiểu hiển thị giờ bấm-đổi-chế-độ (trùng thanh tiến
 *   độ gốc của Video.js).
 * - Xoá hẳn "thu nhỏ video" (mini-thumbnail nổi góc màn hình) — dùng PiP gốc
 *   của Video.js thay thế.
 * - Xoá hẳn "thu nhỏ Script" (nút ▼, toggle trong Cài đặt, toàn bộ CSS/hàm
 *   liên quan) — tiết kiệm tài nguyên như yêu cầu, không còn cách thu nhỏ
 *   panel chính nữa, chỉ đóng bằng ×.
 * - (6.7.17) <video-player> dùng aspect-ratio thật thay vì ép height:100%
 *   (vẫn giữ, đây là phần cốt lõi giúp card co khít đúng).
 * - (6.7.15) Fix nghiêm trọng z-index vượt giới hạn 32-bit; rescan nền dừng
 *   khi đang xem; panel tự ẩn khi player mở.
 * Author: nguyenquocngu91
 */
(function() {
'use strict';

// ========== VERSION ==========
var VERSION = '6.7.19';

// ========== CLEANUP ==========
var old = document.getElementById('__uvd__');
if (old) old.remove();
var oldMinBtn = document.getElementById('__uvd_min_float__');
if (oldMinBtn) oldMinBtn.remove();

// ========== STORAGE ==========
var STORAGE_KEY = 'uvd_data_v54';
var storage = {
  get: function() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; }
    catch(e) { return {}; }
  },
  set: function(data) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); }
    catch(e) {}
  }
};

var data = storage.get();
data.favorites = data.favorites || [];
data.siteProfiles = data.siteProfiles || {};
data.history = data.history || [];
data.filterlist = data.filterlist || [];
data.playbackPositions = data.playbackPositions || {};
data.clickedButtons = data.clickedButtons || {}; // { [host]: { [selector]: {selector,label,count,blocked,lastClicked} } }
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
  blurIntensity: 14,
  transitionSpeed: 0.3,
  transitionEasing: 'ease',
  doubleTapSeconds: 10,
  autoHideControls: true,
  showRemainingTime: true,
  hideDelay: 5,           // giây
  maxStoredUrls: 200,
  blockAutoplay: true,    // chặn mạnh web tự phát video sau khi chạy script
  glowEffects: true,      // hiệu ứng phát sáng nút/panel
  effectsIntensity: 30,   // 0-100, cường độ hiệu ứng (đã hạ mặc định để đỡ giật)
  subdlApiKey: ''         // API key cá nhân subdl.com (thử nghiệm)
}, data.settings || {});

// ========== PROFILES ==========
var defaultProfiles = {
  'videoplay.us': { referer: 'https://videoplay.us/', userAgent: '' },
  'streamtape.com': { referer: 'https://streamtape.com/', userAgent: '' },
  'ok.ru': { referer: 'https://ok.ru/', userAgent: '' },
  'fembed.com': { referer: 'https://fembed.com/', userAgent: '' },
  'mp4upload.com': { referer: 'https://mp4upload.com/', userAgent: '' }
};

var host = location.hostname.replace('www.', '');
var profile = data.siteProfiles[host] || defaultProfiles[host] || {
  referer: location.origin + '/',
  origin: location.origin,
  userAgent: navigator.userAgent
};

var pageInfo = {
  title: (document.title || 'video').replace(/[^\w\s\u00C0-\u1EF9]/g, '').substring(0, 60).trim() || 'video',
  url: location.href,
  host: host,
  referer: profile.referer,
  origin: location.origin,
  userAgent: profile.userAgent || navigator.userAgent
};

// ========== APPEND ROOT ==========
// Gắn các panel/overlay position:fixed vào <html> thay vì <body>.
// Lý do: nếu trang đích có ancestor nào của <body> dùng transform/filter/
// will-change (rất hay gặp ở site dùng smooth-scroll kiểu Lenis/GSAP),
// theo spec CSS thì position:fixed sẽ bám theo ancestor đó thay vì viewport
// => panel bị "trôi/cuộn theo" trang, icon/header tràn lệch ra ngoài.
// <html> gần như không bao giờ bị site gán transform nên tránh được lỗi này.
function __uvdAppendRoot(el) {
  // uvd-scope: định danh chung để CSS biến màu (--text, --border, --accent...)
  // định nghĩa trên class này thay vì :root — vì :root chính là thẻ <html>,
  // DÙNG CHUNG với trang web đích. Nếu site đích cũng khai --text/--border/--bg
  // trên :root hoặc html (rất phổ biến, đây là tên biến CSS generic hay dùng),
  // giá trị của site sẽ đè lên giá trị của script → toàn bộ panel bị nhuộm
  // theo màu trang web. Đây là nguyên nhân thật của lỗi "giao diện bị ép đổi
  // theo màu web".
  el.classList.add('uvd-scope');
  (document.documentElement || document.body).appendChild(el);
}

// ========== ESCAPE HTML ==========
function escapeHtml(text) {
  if (!text) return '';
  var div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ========== HIỆU ỨNG (GLOW) ==========
// Cường độ + bật/tắt hiệu ứng phát sáng, chỉnh được trong Cài đặt.
function applyEffectsPref(el) {
  if (!el) return;
  var on = !!data.settings.glowEffects && !data.settings.reduceMotion;
  el.classList.toggle('uvd-fx-on', on);
  var intensity = Math.max(0, Math.min(100, data.settings.effectsIntensity == null ? 55 : data.settings.effectsIntensity));
  el.style.setProperty('--glow-px', on ? Math.round(4 + intensity * 0.18) + 'px' : '0px');
  el.style.setProperty('--glow-op', on ? (0.15 + intensity * 0.0035).toFixed(3) : '0');
}
function applyMotionPref(el) {
  if (!el) return;
  el.classList.toggle('uvd-reduce-motion', !!data.settings.reduceMotion);
  var blur = data.settings.reduceMotion ? 0 : data.settings.blurIntensity;
  var speed = data.settings.reduceMotion ? 0 : data.settings.transitionSpeed;
  el.style.setProperty('--uvd-blur', blur + 'px');
  el.style.setProperty('--uvd-transition', speed + 's ' + data.settings.transitionEasing);
}

// ========== AD FILTER ==========
var __uvdAdBlockedCount = 0;
var compiledFilters = [];

function compileAdFilters() {
  compiledFilters = [];
  (data.filterlist || []).forEach(function(raw) {
    var pattern = (raw || '').trim().toLowerCase();
    if (!pattern) return;
    if (pattern.indexOf('regex:') === 0) {
      try { compiledFilters.push({ type: 'regex', re: new RegExp(pattern.slice(6), 'i') }); }
      catch(e) {}
    } else {
      compiledFilters.push({ type: 'plain', value: pattern });
    }
  });
}
compileAdFilters();

function isAdUrl(url) {
  if (!compiledFilters.length) return false;
  var lowerUrl = url.toLowerCase();
  for (var i = 0; i < compiledFilters.length; i++) {
    var f = compiledFilters[i];
    if (f.type === 'regex') { if (f.re.test(url)) return true; }
    else if (lowerUrl.indexOf(f.value) !== -1) return true;
  }
  return false;
}

// ========== URL DETECTION ==========
var urls = new Map();
var patterns = [
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
  patterns.forEach(function(p) {
    var matches = text.match(p.re);
    if (matches) {
      matches.forEach(function(u) {
        u = u.replace(/\\u002F/g, '/').replace(/\\\//g, '/').replace(/&amp;/g, '&').replace(/\\"/g, '');
        if (isAdUrl(u)) {
          __uvdAdBlockedCount++;
          return;
        }
        if (!urls.has(u) || urls.get(u).priority > p.priority) {
          urls.set(u, { type: p.type, source: source, priority: p.priority, timestamp: Date.now() });
        }
      });
    }
  });
  // Giới hạn số URL
  if (urls.size > data.settings.maxStoredUrls) {
    var toRemove = urls.size - data.settings.maxStoredUrls;
    var keys = [...urls.keys()].sort(function(a, b) { return urls.get(a).timestamp - urls.get(b).timestamp; });
    for (var i = 0; i < toRemove; i++) {
      urls.delete(keys[i]);
    }
  }
}

function scan(doc, src) {
  try {
    doc.querySelectorAll('video, source, audio').forEach(function(v) {
      if (v.src) findUrls(v.src, src + ':element');
      if (v.currentSrc) findUrls(v.currentSrc, src + ':current');
    });
    doc.querySelectorAll('script').forEach(function(s) {
      findUrls(s.textContent, src + ':script');
    });
    findUrls(doc.documentElement.outerHTML, src + ':html');
    doc.querySelectorAll('iframe').forEach(function(i, idx) {
      if (i.src) {
        var iframeUrl = i.src;
        if (!isAdUrl(iframeUrl)) {
          urls.set(iframeUrl, { type: 'IFRAME', source: 'iframe#' + idx, priority: 99, timestamp: Date.now() });
        } else {
          __uvdAdBlockedCount++;
        }
      }
      try { if (i.contentDocument) scan(i.contentDocument, 'iframe#' + idx); }
      catch(e) {}
    });
  } catch(e) {}
}

// ========== POPUP / NEW-TAB BLOCKER ==========
var __uvdPopupBlockActive = false;
var __uvdOriginalWindowOpen = null;
var __uvdBlockedCount = 0;

window.__uvdSafeOpen = function(url) {
  if (__uvdOriginalWindowOpen) {
    return __uvdOriginalWindowOpen(url, '_blank');
  }
  return window.open(url, '_blank');
};

function killBlankLinks(e) {
  var t = e.target;
  if (t.closest && (t.closest('#__uvd__') || t.closest('#__uvd_player_overlay__'))) return;
  while (t && t !== document) {
    if (t && t.tagName === 'A') {
      var tg = t.target;
      if (tg && tg !== '_self' && tg !== '_top' && tg !== '_parent') {
        e.preventDefault();
        e.stopPropagation();
        __uvdBlockedCount++;
        return;
      }
    }
    t = t.parentNode;
  }
}

function installPopupBlock() {
  if (__uvdPopupBlockActive) return;
  __uvdPopupBlockActive = true;
  __uvdOriginalWindowOpen = window.open;
  window.open = function() { __uvdBlockedCount++; return null; };
  ['click', 'mousedown', 'pointerdown', 'auxclick'].forEach(function(type) {
    document.addEventListener(type, killBlankLinks, true);
  });
}

function uninstallPopupBlock() {
  if (!__uvdPopupBlockActive) return;
  __uvdPopupBlockActive = false;
  if (__uvdOriginalWindowOpen) window.open = __uvdOriginalWindowOpen;
  ['click', 'mousedown', 'pointerdown', 'auxclick'].forEach(function(type) {
    document.removeEventListener(type, killBlankLinks, true);
  });
}

// ========== AUTO-CLICK PLAY ==========
var AUTO_PLAY_SELECTORS = [
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
    var rect = el.getBoundingClientRect();
    if (!rect.width || !rect.height) return false;
    var x = rect.left + rect.width / 2;
    var y = rect.top + rect.height / 2;
    ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'].forEach(function(type) {
      var ev;
      try {
        ev = new MouseEvent(type, { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y });
      } catch(e) {
        ev = document.createEvent('MouseEvent');
        ev.initMouseEvent(type, true, true, window, 0, 0, 0, x, y, false, false, false, false, 0, null);
      }
      el.dispatchEvent(ev);
    });
    if (typeof el.click === 'function') el.click();
    return true;
  } catch(e) { return false; }
}

// ========== NÚT ĐÃ CLICK (theo dõi + chặn từng nút cụ thể) ==========
// Sinh 1 selector "ổn định" để nhận diện lại đúng phần tử này ở lần sau (ưu
// tiên id vì các site thường đặt id cố định cho từng server/host, ví dụ
// button#video-host-vinovo). Không dùng để query lại nhiều phần tử — chỉ để
// định danh phần tử ĐÃ BẤM cho tab "Nút đã click".
function __uvdElementSelector(el) {
  if (!el || !el.tagName) return '';
  var tag = el.tagName.toLowerCase();
  if (el.id) return tag + '#' + el.id;
  if (typeof el.className === 'string' && el.className.trim()) {
    var cls = el.className.trim().split(/\s+/).slice(0, 3).join('.');
    if (cls) return tag + '.' + cls;
  }
  var attrs = ['data-host', 'data-server', 'data-name', 'name', 'title', 'aria-label'];
  for (var i = 0; i < attrs.length; i++) {
    var v = el.getAttribute && el.getAttribute(attrs[i]);
    if (v) return tag + '[' + attrs[i] + '="' + v.trim().substring(0, 40) + '"]';
  }
  var parent = el.parentElement;
  var idx = parent ? Array.prototype.indexOf.call(parent.children, el) : 0;
  return tag + ':nth-child(' + (idx + 1) + ')';
}

function __uvdClickedRecord(sel) {
  var host = pageInfo.host;
  return (data.clickedButtons[host] && data.clickedButtons[host][sel]) || null;
}

function isButtonBlocked(el) {
  var rec = __uvdClickedRecord(__uvdElementSelector(el));
  return !!(rec && rec.blocked);
}

function recordClickedButton(el, sel, isFallback) {
  var host = pageInfo.host;
  data.clickedButtons[host] = data.clickedButtons[host] || {};
  var label = (el.textContent || '').trim().replace(/\s+/g, ' ').substring(0, 60) || sel;
  var rec = data.clickedButtons[host][sel];
  if (rec) {
    rec.count = (rec.count || 0) + 1;
    rec.lastClicked = Date.now();
    if (label) rec.label = label;
    if (isFallback) rec.fallback = true;
  } else {
    data.clickedButtons[host][sel] = { selector: sel, label: label, count: 1, blocked: false, lastClicked: Date.now(), fallback: !!isFallback };
  }
  storage.set(data);
}

// ========== FALLBACK: DÒ NÚT SERVER KHI KHÔNG KHỚP SELECTOR NÀO ==========
// Khi cả AUTO_PLAY_SELECTORS lẫn Play selector riêng đều không tìm thấy phần
// tử nào, đoán theo TEXT của nút: chữ "server"/"stream"/"host", tên viết tắt
// các host phổ biến, hoặc nhãn ngắn viết hoa kiểu VI/MD/DS/ST (hay gặp ở tab
// chọn server). Popup/redirect đã bị chặn toàn cục từ lúc INIT nên bấm nhầm
// cũng không văng tab mới — mỗi nút bấm fallback đều được ghi vào tab "Nút đã
// click" (đánh dấu 🔍 đoán) để bạn rà lại và chặn bớt nút sai.
var FALLBACK_SERVER_KEYWORDS = [
  'server', 'stream', 'host', 'nguồn', 'máy chủ', 'may chu',
  'vinovo', 'mixdrop', 'doodstream', 'streamtape', 'vidplay', 'fembed',
  'streamsb', 'voe', 'filemoon', 'upstream', 'okru', 'dood', 'gogo',
  'mp4upload', 'vidcloud', 'abyss', 'playerx', 'hydrax', 'streamwish'
];

// Loại trừ TOÀN BỘ phần tử thuộc chính panel của script (bao gồm cả overlay
// player, toast...) khỏi mọi vùng quét auto-click. Đây là nguyên nhân thật của
// lỗi "click lung tung tải luôn file txt" — nút xuất "TXT"/"M3U"/"CSV"/"JSON"
// của chính script khớp đúng quy tắc "nhãn viết tắt in hoa ngắn" của tầng dò
// dự phòng, nên vô tình tự bấm vào chính mình.
function __uvdIsOwnUI(el) {
  return !!(el && el.closest && el.closest('.uvd-scope'));
}

function looksLikeServerButton(el) {
  var text = (el.textContent || '').trim();
  if (!text || text.length > 24) return false;
  var lower = text.toLowerCase();
  // nhãn viết tắt ngắn kiểu "VI" "MD" "DS" "ST" hay gặp ở tab chọn server
  if (/^[A-Za-z0-9]{1,5}$/.test(text) && text === text.toUpperCase() && text !== text.toLowerCase()) return true;
  return FALLBACK_SERVER_KEYWORDS.some(function(k) { return lower.indexOf(k) !== -1; });
}

function collectFallbackButtons(root) {
  root = root || document;
  var list = [];
  var seen = [];
  try {
    root.querySelectorAll('button, a, [role="button"], [class*="server" i], [class*="stream" i], [class*="host" i], [id*="server" i], [id*="stream" i], [id*="host" i]').forEach(function(el) {
      if (seen.indexOf(el) !== -1) return;
      seen.push(el);
      if (__uvdIsOwnUI(el)) return;
      if (isButtonBlocked(el)) return;
      if (looksLikeServerButton(el)) list.push(el);
    });
  } catch(e) {}
  return list;
}

function autoClickPlayButtons(root, depth, allowVideoPlayFallback, allowTextGuess) {
  root = root || document;
  depth = depth || 0;
  if (depth > 3) return 0;
  var clicked = 0;
  var customSel = (data.siteProfiles[pageInfo.host] && data.siteProfiles[pageInfo.host].playSelector) || '';
  var selectors = customSel ? [customSel].concat(AUTO_PLAY_SELECTORS) : AUTO_PLAY_SELECTORS;
  selectors.forEach(function(sel) {
    try {
      root.querySelectorAll(sel).forEach(function(el) {
        if (__uvdIsOwnUI(el)) return;
        if (isButtonBlocked(el)) return; // người dùng đã chặn nút này ở tab "Nút đã click"
        if (simulateClick(el)) {
          clicked++;
          recordClickedButton(el, __uvdElementSelector(el));
        }
      });
    } catch(e) {}
  });
  if (clicked === 0 && allowTextGuess) {
    // Không nút nào khớp selector chuẩn/tuỳ chỉnh — đoán theo text nút.
    // CHỈ chạy khi người dùng CHỦ ĐỘNG bấm nút quét (▶/⏭), KHÔNG BAO GIỜ chạy
    // trong lần quét ngầm tự động lúc mới mở script — vì tầng đoán rộng này dễ
    // bấm trúng nút bất kỳ trên trang (kể cả khi người dùng chỉ đang lướt web
    // bình thường, chưa hề muốn auto-play).
    try {
      collectFallbackButtons(root).forEach(function(el) {
        if (simulateClick(el)) {
          clicked++;
          recordClickedButton(el, __uvdElementSelector(el), true);
        }
      });
    } catch(e) {}
  }
  if (allowVideoPlayFallback) {
    try {
      root.querySelectorAll('video').forEach(function(v) {
        if (v.paused) {
          var wasMuted = v.muted;
          v.muted = true;
          v.__uvdAllow = true; // cho phép tạm thời để dò link ẩn, không phải web tự phát
          var p = v.play();
          if (p && p.then) {
            p.then(function() {
              setTimeout(function() {
                try { v.pause(); v.currentTime = 0; v.muted = wasMuted; } catch(e) {}
                v.__uvdAllow = false;
              }, 600);
            }).catch(function() { v.__uvdAllow = false; });
          } else {
            v.__uvdAllow = false;
          }
        }
      });
    } catch(e) {}
  }
  try {
    root.querySelectorAll('iframe').forEach(function(f) {
      try { if (f.contentDocument) clicked += autoClickPlayButtons(f.contentDocument, depth + 1, allowVideoPlayFallback, allowTextGuess); }
      catch(e) {}
    });
  } catch(e) {}
  return clicked;
}

// ========== AUTO-CLICK LẦN LƯỢT TỪNG SERVER ==========
// Khác với autoClickPlayButtons (bấm HẾT các nút khớp cùng lúc — dễ dính
// nút sai như "thêm vào playlist"), hàm này bấm TỪNG nút MỘT, chờ xem có ra
// link mới không rồi mới bấm nút kế tiếp. Dừng ngay khi tìm được link.
function collectServerButtons(root) {
  root = root || document;
  var customSel = (data.siteProfiles[pageInfo.host] && data.siteProfiles[pageInfo.host].playSelector) || '';
  var selectors = customSel ? [customSel] : AUTO_PLAY_SELECTORS;
  var seen = [];
  var list = [];
  selectors.forEach(function(sel) {
    try {
      root.querySelectorAll(sel).forEach(function(el) {
        if (seen.indexOf(el) !== -1) return;
        seen.push(el);
        if (__uvdIsOwnUI(el)) return;
        if (!isButtonBlocked(el)) list.push(el);
      });
    } catch(e) {}
  });
  var usedFallback = false;
  if (!list.length) {
    list = collectFallbackButtons(root); // không khớp selector chuẩn nào — đoán theo text nút
    usedFallback = true;
  }
  list.__uvdFallback = usedFallback;
  return list;
}

var __uvdSeqRunning = false;
function autoClickSequential() {
  if (__uvdSeqRunning) { toast('Đang thử lần lượt server, chờ chút...'); return; }
  var candidates = collectServerButtons(document);
  if (!candidates.length) {
    toast('Không tìm thấy nút server nào (đặt "Play selector" ở trên trước, hoặc mọi nút đều đang bị chặn ở tab "Nút đã click")');
    return;
  }
  __uvdSeqRunning = true;
  var idx = 0;
  var totalBefore = urls.size;
  var isFallback = !!candidates.__uvdFallback;
  toast((isFallback ? '🔍 Không khớp nút chuẩn, đoán theo text — ' : '🔎 ') + 'Đang thử lần lượt ' + candidates.length + ' server...');

  function finish(success, sel) {
    __uvdSeqRunning = false;
    if (success) {
      toast('✅ Tìm ra link qua: ' + sel);
    } else {
      toast('❌ Đã thử hết ' + candidates.length + ' server, chưa thấy link mới. Site có thể chặn click giả lập (isTrusted) — thử bấm tay.');
    }
    if (document.getElementById('__uvd__')) buildUI();
  }

  function tryNext() {
    if (idx >= candidates.length) { finish(false); return; }
    var el = candidates[idx++];
    var sel = __uvdElementSelector(el);
    var beforeThis = urls.size;
    if (!simulateClick(el)) { tryNext(); return; }
    recordClickedButton(el, sel, isFallback);
    setTimeout(function() {
      scan(document, 'seq-autoclick');
      pauseAllPlayingVideos(); // nếu server này thật sự play video gốc, dừng lại ngay để tránh vướng
      if (urls.size > beforeThis) {
        finish(true, sel);
      } else {
        tryNext();
      }
    }, 1800);
  }
  tryNext();
}
window.__uvd_autoClickSequential = function() { autoClickSequential(); };

// ========== SETTINGS OVERLAY (chồng lớp kiểu app, thay vì 1 tab chật chội) ==========
function closeSettingsOverlay() {
  var ov = document.getElementById('__uvd_settings_overlay__');
  if (!ov) return;
  ov.classList.remove('uvd-open');
  setTimeout(function() { ov.remove(); }, 300);
}

function openSettingsOverlay() {
  if (document.getElementById('__uvd_settings_overlay__')) return;
  var ov = document.createElement('div');
  ov.id = '__uvd_settings_overlay__';
  ov.className = 'uvd-settings-overlay';
  ov.innerHTML =
    '<div class="uvd-settings-sheet">' +
      '<div class="uvd-settings-header">' +
        '<button class="uvd-back-btn" id="__uvd_settings_back__" title="Đóng">←</button>' +
        '<span class="uvd-settings-title">⚙ Cài đặt</span>' +
      '</div>' +
      '<div class="uvd-settings-body" id="__uvd_settings_body__"></div>' +
    '</div>';
  __uvdAppendRoot(ov);
  applyEffectsPref(ov);
  applyMotionPref(ov);
  renderSettings(document.getElementById('__uvd_settings_body__'));
  document.getElementById('__uvd_settings_back__').onclick = closeSettingsOverlay;
  ov.addEventListener('click', function(e) { if (e.target === ov) closeSettingsOverlay(); });
  requestAnimationFrame(function() { ov.classList.add('uvd-open'); });
}

function pauseAllPlayingVideos(root, depth) {
  root = root || document;
  depth = depth || 0;
  var pausedCount = 0;
  try {
    root.querySelectorAll('video').forEach(function(v) {
      if (!v.paused) {
        try { v.pause(); pausedCount++; } catch(e) {}
      }
    });
  } catch(e) {}
  if (depth < 2) {
    try {
      root.querySelectorAll('iframe').forEach(function(f) {
        try { if (f.contentDocument) pausedCount += pauseAllPlayingVideos(f.contentDocument, depth + 1); }
        catch(e) {}
      });
    } catch(e) {}
  }
  return pausedCount;
}

// ========== LIVE MONITORING ==========
var originalFetch = window.fetch;
var originalXHROpen = XMLHttpRequest.prototype.open;
var monitorActive = false;

function installMonitor() {
  if (monitorActive) return;
  monitorActive = true;
  window.fetch = function() {
    var url = arguments[0];
    if (typeof url === 'string') {
      if (!isAdUrl(url)) findUrls(url, 'fetch:live');
    } else if (url && url.url) {
      if (!isAdUrl(url.url)) findUrls(url.url, 'fetch:live');
    }
    return originalFetch.apply(this, arguments);
  };
  XMLHttpRequest.prototype.open = function(method, url) {
    if (url && !isAdUrl(url)) findUrls(url, 'xhr:live');
    return originalXHROpen.apply(this, arguments);
  };
}

function stopMonitor() {
  window.fetch = originalFetch;
  XMLHttpRequest.prototype.open = originalXHROpen;
  uninstallPopupBlock();
  monitorActive = false;
}

// ========== CLEANUP FUNCTION ==========
var cleanupFunctions = [];
function addCleanup(fn) {
  cleanupFunctions.push(fn);
}
function runCleanup() {
  cleanupFunctions.forEach(function(fn) { try { fn(); } catch(e) {} });
  cleanupFunctions = [];
}

// ========== CHẶN MẠNH VIDEO/AUDIO TỰ PHÁT CỦA TRANG GỐC ==========
// Sau khi script chạy, trang web không được tự ý play() video/audio nữa
// (trừ video của chính player UVD, hoặc lượt auto-click Play do người dùng yêu cầu).
var __uvdNativeMediaPlay = HTMLMediaElement.prototype.play;
function __uvdIsAllowedMedia(el) {
  return !!(el && (el.__uvdAllow || el.id === '__uvd_player_video__'));
}
HTMLMediaElement.prototype.play = function() {
  if (data.settings.blockAutoplay && !__uvdIsAllowedMedia(this)) {
    var self = this;
    setTimeout(function() { try { self.pause(); } catch(e) {} }, 0);
    return Promise.reject(new DOMException('UVD: đã chặn tự phát', 'NotAllowedError'));
  }
  return __uvdNativeMediaPlay.apply(this, arguments);
};
addCleanup(function() { HTMLMediaElement.prototype.play = __uvdNativeMediaPlay; });

function __uvdNeutralizeMedia(el) {
  if (!el || __uvdIsAllowedMedia(el)) return;
  try {
    el.removeAttribute('autoplay');
    el.autoplay = false;
    if (!el.paused) el.pause();
  } catch(e) {}
}
function __uvdBlockPlayEvent(e) {
  if (!data.settings.blockAutoplay) return;
  var el = e.target;
  if (el && (el.tagName === 'VIDEO' || el.tagName === 'AUDIO') && !__uvdIsAllowedMedia(el)) {
    try { el.pause(); } catch(err) {}
  }
}
document.addEventListener('play', __uvdBlockPlayEvent, true);
addCleanup(function() { document.removeEventListener('play', __uvdBlockPlayEvent, true); });

// Trên site quảng cáo đổi DOM liên tục, observer từng xử lý NGAY mỗi mutation
// record (có thể hàng trăm lần/giây) là nguồn giật/lag chính. Giờ chỉ gom node
// vào 1 hàng đợi, xử lý gộp tối đa 1 lần mỗi khung hình (rAF).
var __uvdPendingMediaNodes = [];
var __uvdMediaFlushScheduled = false;
function __uvdFlushMediaQueue() {
  __uvdMediaFlushScheduled = false;
  if (!data.settings.blockAutoplay) { __uvdPendingMediaNodes.length = 0; return; }
  var nodes = __uvdPendingMediaNodes;
  __uvdPendingMediaNodes = [];
  for (var i = 0; i < nodes.length; i++) {
    var node = nodes[i];
    if (node.tagName === 'VIDEO' || node.tagName === 'AUDIO') __uvdNeutralizeMedia(node);
    if (node.querySelectorAll) {
      node.querySelectorAll('video,audio').forEach(__uvdNeutralizeMedia);
    }
  }
}
var __uvdAutoplayObserver = new MutationObserver(function(mutations) {
  if (!data.settings.blockAutoplay) return;
  for (var i = 0; i < mutations.length; i++) {
    var added = mutations[i].addedNodes;
    if (!added || !added.length) continue;
    for (var j = 0; j < added.length; j++) {
      if (added[j] instanceof Element) __uvdPendingMediaNodes.push(added[j]);
    }
  }
  if (__uvdPendingMediaNodes.length && !__uvdMediaFlushScheduled) {
    __uvdMediaFlushScheduled = true;
    (window.requestAnimationFrame || setTimeout)(__uvdFlushMediaQueue, 16);
  }
});
__uvdAutoplayObserver.observe(document.documentElement, { childList: true, subtree: true });
addCleanup(function() { __uvdAutoplayObserver.disconnect(); });

// Dọn ngay các video/audio đang tự phát sẵn tại thời điểm chèn script
try { document.querySelectorAll('video,audio').forEach(__uvdNeutralizeMedia); } catch(e) {}

// Tạm dừng animation nền "liquid" (blur 50px, chạy vô hạn) khi người dùng
// chuyển sang tab trình duyệt khác, đỡ tốn CPU/GPU khi panel không hiển thị.
function __uvdVisibilityHandler() {
  document.documentElement.classList.toggle('uvd-tab-hidden', document.hidden);
}
document.addEventListener('visibilitychange', __uvdVisibilityHandler);
addCleanup(function() {
  document.removeEventListener('visibilitychange', __uvdVisibilityHandler);
  document.documentElement.classList.remove('uvd-tab-hidden');
});

// ========== INIT ==========
scan(document, 'main');
try { performance.getEntriesByType('resource').forEach(function(e) { if (!isAdUrl(e.name)) findUrls(e.name, 'network:perf'); }); } catch(e) {}
installMonitor();
installPopupBlock();

// MutationObserver thay cho setInterval — panel được gắn trực tiếp vào <html>
// (xem __uvdAppendRoot), nên chỉ cần theo dõi childList của <html>, KHÔNG cần
// subtree:true trên toàn <body>. subtree:true trên body cực tốn CPU ở site
// nhiều quảng cáo tự đổi DOM liên tục (đây là nguồn lag chính trước đây).
var panelObserver = new MutationObserver(function() {
  if (!document.getElementById('__uvd__')) {
    stopMonitor();
    panelObserver.disconnect();
    runCleanup();
  }
});
panelObserver.observe(document.documentElement, { childList: true, subtree: false });
addCleanup(function() { panelObserver.disconnect(); });

function runAutoClickAndRescan(silent) {
  var beforeCount = urls.size;
  var lastCount = beforeCount; // mốc so sánh của LẦN QUÉT TRƯỚC, không phải mốc gốc
  var clicked = 0;
  installPopupBlock();
  clicked = autoClickPlayButtons(document, 0, !silent, !silent);
  // Nhiều site (đặc biệt site JS nặng/nhiều lớp iframe) chỉ gắn link video vào
  // DOM/network sau vài giây, không phải ngay sau click — quét lại nhiều lần
  // trong ~4s thay vì chỉ 1 lần ở mốc 1.2s như trước.
  var delays = [1200, 2200, 3400];
  var reportedAt = -1;
  delays.forEach(function(delay, idx) {
    setTimeout(function() {
      if (playerState.overlay) return; // đang xem video trong player — không quét/vẽ lại panel nền, tránh xen ngang + tránh panel bị vẽ lại đè lên player
      scan(document, 'autoclick-rescan');
      var afterCount = urls.size;
      var newSinceLast = afterCount - lastCount; // chỉ tính phần MỚI kể từ lần quét trước
      lastCount = afterCount;
      if (newSinceLast <= 0) {
        if (idx === delays.length - 1 && !silent && reportedAt === -1) {
          toast(clicked > 0 ? 'Đã bấm Play nhưng chưa thấy link mới — site này có thể chặn click giả lập, thử bấm tay' : 'Không tìm thấy nút Play trên trang này');
        }
        return; // không có gì mới ở mốc này — KHÔNG gọi buildUI() để tránh vẽ lại/nháy panel vô ích
      }
      var totalFound = afterCount - beforeCount;
      if (reportedAt === -1) {
        reportedAt = idx;
        toast('▶ Tự động Play: tìm thêm ' + totalFound + ' luồng mới');
        if (document.getElementById('__uvd__')) buildUI();
        setTimeout(function() {
          var n = pauseAllPlayingVideos();
          if (n > 0) toast('⏸ Đã tạm dừng video gốc, xem qua player script cho ổn định');
        }, 800);
      } else if (document.getElementById('__uvd__')) {
        buildUI(); // có thêm luồng MỚI THẬT ở lần quét sau, cập nhật UI im lặng
      }
    }, delay);
  });
}

window.__uvd_autoClickPlay = function() { runAutoClickAndRescan(false); };
setTimeout(function() { runAutoClickAndRescan(true); }, 400);

// ========== M3U8 MASTER PARSER ==========
function parseM3U8Master(url, callback) {
  var controller = new AbortController();
  var timeout = setTimeout(function() { controller.abort(); }, 15000);
  fetch(url, { headers: { 'Referer': pageInfo.referer }, signal: controller.signal })
  .then(function(r) { clearTimeout(timeout); return r.text(); })
  .then(function(text) {
    if (!text.includes('#EXT-X-STREAM-INF')) { callback(null); return; }
    var qualities = [];
    var lines = text.split('\n');
    for (var i = 0; i < lines.length; i++) {
      if (lines[i].startsWith('#EXT-X-STREAM-INF')) {
        var info = lines[i];
        var nextLine = (lines[i + 1] || '').trim();
        if (nextLine && !nextLine.startsWith('#')) {
          var resolution = (info.match(/RESOLUTION=(\d+x\d+)/) || [])[1] || 'unknown';
          var bandwidth = parseInt((info.match(/BANDWIDTH=(\d+)/) || [])[1] || 0);
          var codecs = (info.match(/CODECS="([^"]+)"/) || [])[1] || '';
          var quality = resolution.split('x')[1] || bandwidth;
          var qualityLabel = resolution === 'unknown' ? Math.round(bandwidth/1000) + 'kbps' : quality + 'p';
          var streamUrl = nextLine;
          if (!streamUrl.startsWith('http')) {
            var baseUrl = url.substring(0, url.lastIndexOf('/') + 1);
            streamUrl = baseUrl + streamUrl;
          }
          qualities.push({ label: qualityLabel, resolution: resolution, bandwidth: bandwidth, codecs: codecs, url: streamUrl });
        }
      }
    }
    qualities.sort(function(a, b) { return (parseInt(b.resolution.split('x')[1]) || 0) - (parseInt(a.resolution.split('x')[1]) || 0); });
    callback(qualities);
  }).catch(function(e) { clearTimeout(timeout); console.error(e); callback(null); });
}

// ========== COMMANDS ==========
function makeCommands(url, type, title) {
  var t = title;
  var ext = type.toLowerCase() === 'iframe' ? 'mp4' : type.toLowerCase();
  var ref = pageInfo.referer;
  var origin = pageInfo.origin;
  var ua = pageInfo.userAgent;
  return {
    'yt-dlp': { label: 'yt-dlp (cơ bản)', cmd: 'yt-dlp --referer "' + ref + '" -o "' + t + '.%(ext)s" "' + url + '"' },
    'yt-dlp-bypass': { label: 'yt-dlp (bypass)', cmd: 'yt-dlp --force-ipv4 --no-check-certificate --user-agent "' + ua + '" --referer "' + ref + '" --add-header "Origin: ' + origin + '" -f "bv*+ba/best" --merge-output-format mp4 -o "' + t + '.%(ext)s" "' + url + '"' },
    'yt-dlp-aria': { label: 'yt-dlp + aria2', cmd: 'yt-dlp --referer "' + ref + '" --downloader aria2c -o "' + t + '.%(ext)s" "' + url + '"' },
    'ffmpeg': { label: 'FFmpeg', cmd: 'ffmpeg -headers "Referer: ' + ref + '\\r\\nOrigin: ' + origin + '" -i "' + url + '" -c copy "' + t + '.mp4"' },
    'curl': { label: 'cURL', cmd: 'curl -H "Referer: ' + ref + '" -o "' + t + '.' + ext + '" "' + url + '"' }
  };
}

// ========== UTILS ==========
function copy(text) {
  var ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove();
}

function toast(msg, color) {
  var el = document.createElement('div');
  el.textContent = msg;
  el.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);background:' + (color || '#ff4fa0') + ';color:#fff;padding:12px 24px;border-radius:30px;z-index:2147483647;font:600 13px Segoe UI;box-shadow:0 4px 15px rgba(0,0,0,0.4);animation:uvdSlideIn 0.3s ease;';
  __uvdAppendRoot(el);
  setTimeout(function() { el.remove(); }, 2500);
}

function shareUrl(url) {
  if (navigator.share) {
    navigator.share({ title: pageInfo.title, url: url }).catch(function() { toast('Không thể chia sẻ'); });
  } else {
    toast('Thiết bị không hỗ trợ chia sẻ');
  }
}

function addToHistory(url, type) {
  data.history = data.history || [];
  data.history.unshift({ url, type, title: pageInfo.title, host: pageInfo.host, timestamp: Date.now() });
  if (data.history.length > 50) data.history = data.history.slice(0, 50);
  storage.set(data);
}

function addToFilterlist(pattern) {
  if (!pattern) return;
  pattern = pattern.trim().toLowerCase();
  if (data.filterlist.indexOf(pattern) === -1) {
    data.filterlist.push(pattern);
    storage.set(data);
    compileAdFilters();
    toast('Đã thêm "' + pattern + '" vào filter');
    buildUI();
  } else {
    toast('Rule đã tồn tại');
  }
}

function exportData(format) {
  var arr = [...urls.entries()].map(function(e) { return { url: e[0], type: e[1].type, source: e[1].source, title: pageInfo.title }; });
  var content, mime, filename;
  if (format === 'json') {
    content = JSON.stringify({ page: pageInfo, streams: arr }, null, 2);
    mime = 'application/json'; filename = pageInfo.title + '_streams.json';
  } else if (format === 'csv') {
    content = 'Type,URL,Source,Title\n' + arr.map(a => a.type + ',"' + a.url + '",' + a.source + ',"' + a.title + '"').join('\n');
    mime = 'text/csv'; filename = pageInfo.title + '_streams.csv';
  } else if (format === 'm3u') {
    content = '#EXTM3U\n' + arr.filter(a => a.type !== 'IFRAME').map(a => '#EXTINF:-1,' + a.title + ' [' + a.type + ']\n' + a.url).join('\n');
    mime = 'audio/x-mpegurl'; filename = pageInfo.title + '.m3u';
  } else {
    content = arr.map(a => a.url).join('\n');
    mime = 'text/plain'; filename = pageInfo.title + '_urls.txt';
  }
  var blob = new Blob([content], { type: mime });
  var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename; a.click();
  URL.revokeObjectURL(a.href);
  toast('Đã xuất ' + format.toUpperCase());
}

// ========== RIPPLE EFFECT ==========
function addRipple(e) {
  var btn = e.currentTarget;
  var ripple = document.createElement('span');
  ripple.className = 'uvd-ripple';
  var rect = btn.getBoundingClientRect();
  var size = Math.max(rect.width, rect.height);
  ripple.style.width = ripple.style.height = size + 'px';
  ripple.style.left = (e.clientX - rect.left - size/2) + 'px';
  ripple.style.top = (e.clientY - rect.top - size/2) + 'px';
  btn.appendChild(ripple);
  ripple.addEventListener('animationend', function() { ripple.remove(); });
}

// ========== ORIENTATION LOCK ==========
function lockOrientation(video) {
  if (!video || !video.videoWidth || !video.videoHeight) return;
  var isPortrait = video.videoHeight > video.videoWidth;
  var target = isPortrait ? 'portrait' : 'landscape';
  try {
    if (screen.orientation && screen.orientation.lock) screen.orientation.lock(target).catch(function(){});
  } catch(e) {}
}

function unlockOrientation() {
  try {
    if (screen.orientation && screen.orientation.unlock) screen.orientation.unlock();
  } catch(e) {}
}

// ========== PLAYER STATE ==========
var playerState = {
  overlay: null,
  video: null,
  hls: null,
  qualities: [],
  currentQuality: 0,
  speed: 1,
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
  timeMode: 0,
  animationFrame: null
};

// ========== RESUME PLAYBACK POSITION ==========
function savePlaybackPosition(url, video) {
  if (!url || !video || !video.duration || isNaN(video.duration)) return;
  var pct = video.currentTime / video.duration;
  if (pct < 0.02 || pct > 0.95) { delete data.playbackPositions[url]; }
  else {
    data.playbackPositions[url] = { time: video.currentTime, duration: video.duration, updatedAt: Date.now() };
  }
  var keys = Object.keys(data.playbackPositions);
  if (keys.length > 50) {
    keys.sort(function(a, b) { return data.playbackPositions[a].updatedAt - data.playbackPositions[b].updatedAt; });
    delete data.playbackPositions[keys[0]];
  }
  storage.set(data);
}

function getPlaybackPosition(url) {
  return data.playbackPositions[url] || null;
}

// ========== SLEEP TIMER ==========
function clearSleepTimer() {
  if (playerState.sleepTimerId) { clearTimeout(playerState.sleepTimerId); playerState.sleepTimerId = null; }
  playerState.sleepEndAt = 0;
  var el = document.getElementById('__uvd_sleep_label__');
  if (el) el.textContent = '';
}

function setSleepTimer(minutes) {
  clearSleepTimer();
  if (!minutes) return;
  playerState.sleepEndAt = Date.now() + minutes * 60000;
  playerState.sleepTimerId = setTimeout(function() {
    if (playerState.video) playerState.video.pause();
    toast('⏰ Hẹn giờ ngủ: đã dừng phát');
    clearSleepTimer();
  }, minutes * 60000);
  toast('⏰ Sẽ dừng sau ' + minutes + ' phút');
}

function showSleepMenu() {
  var overlay2 = document.createElement('div');
  overlay2.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:2147483647;display:flex;align-items:center;justify-content:center;';
  var panel = document.createElement('div');
  panel.style.cssText = 'background:rgba(20,22,30,0.95);border-radius:16px;padding:20px;min-width:250px;max-width:90%;border:1px solid rgba(255,255,255,0.15);';
  panel.innerHTML = '<div style="color:#fff;font-weight:600;margin-bottom:12px;">⏰ Hẹn giờ ngủ</div>';
  [0, 15, 30, 45, 60].forEach(function(m) {
    var b = document.createElement('button');
    b.className = 'uvd-btn uvd-btn-sm';
    b.style.cssText = 'width:100%;margin-bottom:6px;text-align:center;';
    b.textContent = m === 0 ? 'Tắt hẹn giờ' : m + ' phút';
    b.onclick = function() { setSleepTimer(m); overlay2.remove(); };
    panel.appendChild(b);
  });
  overlay2.appendChild(panel);
  overlay2.onclick = function(e) { if (e.target === overlay2) overlay2.remove(); };
  __uvdAppendRoot(overlay2);
}

// ========== PHỤ ĐỀ (THỬ NGHIỆM) ==========
// Tải file .srt/.vtt cục bộ hoặc tìm/tải từ SubDL (subdl.com). Tính năng đang thử nghiệm.
function srtToVtt(text) {
  var body = text.replace(/\r/g, '').replace(/^\uFEFF/, '');
  if (/^WEBVTT/.test(body.trim())) return body;
  body = body.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');
  return 'WEBVTT\n\n' + body;
}

function attachSubtitleTrack(video, vttUrl, label) {
  if (!video) return;
  video.querySelectorAll('track[data-uvd-sub="1"]').forEach(function(t) { t.remove(); });
  var track = document.createElement('track');
  track.setAttribute('data-uvd-sub', '1');
  track.kind = 'subtitles';
  track.label = label || 'Phụ đề';
  track.srclang = 'vi';
  track.src = vttUrl;
  track.default = true;
  video.appendChild(track);
  setTimeout(function() {
    if (video.textTracks && video.textTracks.length) {
      for (var i = 0; i < video.textTracks.length; i++) {
        video.textTracks[i].mode = video.textTracks[i].label === (label || 'Phụ đề') ? 'showing' : 'disabled';
      }
    }
  }, 100);
  toast('✅ Đã bật phụ đề: ' + (label || ''));
}

function searchSubDL(query, cb) {
  var apiKey = (data.settings.subdlApiKey || '').trim();
  if (!apiKey) { toast('Chưa có SubDL API Key, xem hướng dẫn trong bảng Phụ đề'); cb([]); return; }
  console.log('[UMP DL] SubDL: bắt đầu tìm "' + query + '"');
  // QUAN TRỌNG: không chỉ dựa vào AbortController để tự huỷ — nếu trang có
  // Service Worker chặn ngầm hoặc mạng "im lặng" chặn kết nối, request có thể
  // treo mãi mà signal của AbortController cũng không tới nơi. Dùng cờ
  // 'settled' độc lập để ĐẢM BẢO cb() luôn được gọi trong vòng 15s, dù fetch
  // có thật sự huỷ được hay không (nếu nó về trễ sau đó thì bị bỏ qua).
  var settled = false;
  function finish(fn) { if (settled) return; settled = true; clearTimeout(hardTimeoutId); fn(); }
  var hardTimeoutId = setTimeout(function() {
    finish(function() {
      console.error('[UMP DL] SubDL: hết 15s vẫn không có phản hồi (có thể do CORS bị chặn, hoặc trang có Service Worker chặn ngầm fetch)');
      toast('SubDL không phản hồi sau 15s — có thể do CORS hoặc trang chặn kết nối');
      cb([]);
    });
  }, 15000);
  var controller = (typeof AbortController !== 'undefined') ? new AbortController() : null;
  if (controller) { setTimeout(function() { controller.abort(); }, 15000); }

  fetch('https://api.subdl.com/api/v2/subtitles/search?film_name=' + encodeURIComponent(query) + '&languages=vi,en&unpack=1', {
    headers: { 'Authorization': 'Bearer ' + apiKey },
    signal: controller ? controller.signal : undefined
  })
  .then(function(r) {
    if (!r.ok) { throw new Error('HTTP ' + r.status); }
    return r.json();
  })
  .then(function(json) {
    finish(function() {
      if (json && json.status === false) {
        console.warn('[UMP DL] SubDL trả lỗi:', json.message || json);
        toast('SubDL: ' + (json.message || 'yêu cầu bị từ chối (kiểm tra API key)'));
        cb([]); return;
      }
      // QUAN TRỌNG: 'results' chỉ là danh sách phim/show khớp tên (imdb_id, tmdb_id...),
      // KHÔNG phải phụ đề — dùng nhầm field này là lý do search xong không tải được gì.
      // Phụ đề thật nằm ở 'subtitles'; mỗi mục có thể là file lẻ hoặc gói season kèm
      // 'unpack_files' (do có &unpack=1) chứa từng file .srt riêng — cần bung ra.
      var subs = (json && json.subtitles) || [];
      var flat = [];
      subs.forEach(function(s) {
        if (s && Array.isArray(s.unpack_files) && s.unpack_files.length) {
          s.unpack_files.forEach(function(f) {
            flat.push(Object.assign({
              release_name: s.release_name || s.name,
              language: f.language
            }, f));
          });
        } else if (s) {
          flat.push(s);
        }
      });
      console.log('[UMP DL] SubDL: nhận được ' + flat.length + ' phụ đề');
      cb(flat);
    });
  })
  .catch(function(err) {
    finish(function() {
      console.error('[UMP DL] Lỗi SubDL search:', err);
      toast('Lỗi kết nối SubDL: ' + (err && err.message ? err.message : 'CORS/mạng'));
      cb([]);
    });
  });
}

function downloadSubDLFile(item, cb) {
  var apiKey = (data.settings.subdlApiKey || '').trim();
  // Nếu search có unpack=1 sẵn link file trực tiếp (field 'url') thì dùng luôn,
  // đỡ phải gọi thêm download endpoint. file_url/download_url giữ lại làm fallback
  // phòng trường hợp API trả về field khác trong tương lai.
  var directUrl = item.url || item.file_url || item.download_url || (item.files && item.files[0] && item.files[0].url);
  var nId = item.file_n_id || item.nId || item.n_id || item.id;
  var reqPromise;
  if (directUrl) {
    reqPromise = fetch(directUrl.indexOf('http') === 0 ? directUrl : 'https://dl.subdl.com' + directUrl);
  } else if (nId) {
    reqPromise = fetch('https://api.subdl.com/api/v2/subtitles/' + encodeURIComponent(nId) + '/download?format=file', {
      headers: { 'Authorization': 'Bearer ' + apiKey }
    }).then(function(r) {
      var ct = r.headers.get('content-type') || '';
      return ct.indexOf('application/json') !== -1 ? r.json() : r.text();
    }).then(function(result) {
      if (typeof result === 'string') return result;
      var link = result && (result.url || result.download_url || result.link);
      if (!link) throw new Error('no-link');
      return fetch(link).then(function(r2) { return r2.text(); });
    });
  } else {
    toast('Không có file để tải'); if (cb) cb(false); return;
  }
  Promise.resolve(reqPromise)
  .then(function(res) { return (typeof res === 'string') ? res : res.text(); })
  .then(function(text) {
    if (!text) throw new Error('empty');
    var vtt = srtToVtt(text);
    var blobUrl = URL.createObjectURL(new Blob([vtt], { type: 'text/vtt' }));
    attachSubtitleTrack(playerState.video, blobUrl, 'SubDL');
    if (cb) cb(true);
  })
  .catch(function() { toast('Lỗi tải phụ đề từ SubDL'); if (cb) cb(false); });
}

function showSubtitlePanel(video) {
  var overlay2 = document.createElement('div');
  overlay2.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:2147483647;display:flex;align-items:center;justify-content:center;padding:16px;';
  var panel = document.createElement('div');
  applyEffectsPref(panel);
  panel.style.cssText = 'background:rgba(20,22,30,0.96);border-radius:16px;padding:20px;width:100%;max-width:380px;max-height:85vh;overflow-y:auto;border:1px solid rgba(255,255,255,0.15);';
  panel.innerHTML =
    '<div style="color:#fff;font-weight:600;margin-bottom:4px;">💬 Phụ đề <span style="font-size:10px;color:var(--gold);font-weight:400;">(thử nghiệm)</span></div>' +
    '<div style="font-size:11px;color:var(--text3);margin-bottom:12px;">Tải file có sẵn hoặc tìm trên SubDL.</div>' +
    '<div style="font-size:12px;color:var(--text2);margin-bottom:6px;">Tải file .srt / .vtt từ máy</div>' +
    '<input type="file" id="__uvd_sub_file__" accept=".srt,.vtt" style="width:100%;color:var(--text2);font-size:12px;margin-bottom:14px;">' +
    '<div style="font-size:12px;color:var(--text2);margin-bottom:6px;">Tìm trên SubDL</div>' +
    '<div style="display:flex;gap:6px;margin-bottom:8px;">' +
      '<input type="text" id="__uvd_sub_query__" placeholder="Tên phim..." value="' + escapeHtml(pageInfo.title) + '" style="flex:1;padding:9px;background:rgba(0,0,0,0.4);color:#fff;border:1px solid var(--border);border-radius:10px;font-size:12px;">' +
      '<button class="uvd-btn uvd-btn-sm" id="__uvd_sub_search__">Tìm</button>' +
    '</div>' +
    '<div id="__uvd_sub_results__" style="max-height:200px;overflow-y:auto;"></div>' +
    '<details style="margin-top:12px;">' +
      '<summary style="font-size:11px;color:var(--text3);cursor:pointer;">API Key SubDL</summary>' +
      '<input type="text" id="__uvd_sub_apikey__" placeholder="Dán API key cá nhân (subdl.com)" value="' + escapeHtml(data.settings.subdlApiKey || '') + '" style="width:100%;margin-top:8px;padding:9px;background:rgba(0,0,0,0.4);color:#fff;border:1px solid var(--border);border-radius:10px;font-size:11px;">' +
      '<div style="font-size:10px;color:var(--text3);margin-top:4px;">Đăng ký free tại subdl.com/panel/api để lấy API key cá nhân (không cần app \"consumer\" riêng, 2000 lượt tìm + 50 lượt tải/ngày).</div>' +
    '</details>' +
    '<div class="uvd-grid-2" style="margin-top:14px;">' +
      '<button class="uvd-btn uvd-btn-sm" id="__uvd_sub_off__">Tắt phụ đề</button>' +
      '<button class="uvd-btn uvd-btn-sm" id="__uvd_sub_close__" style="background:var(--btn-danger-bg);">Đóng</button>' +
    '</div>';
  overlay2.appendChild(panel);
  overlay2.onclick = function(e) { if (e.target === overlay2) overlay2.remove(); };
  __uvdAppendRoot(overlay2);

  panel.querySelector('#__uvd_sub_file__').onchange = function(e) {
    var file = e.target.files && e.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function() {
      var vtt = srtToVtt(String(reader.result || ''));
      var blobUrl = URL.createObjectURL(new Blob([vtt], { type: 'text/vtt' }));
      attachSubtitleTrack(video, blobUrl, file.name.replace(/\.(srt|vtt)$/i, ''));
      overlay2.remove();
    };
    reader.readAsText(file);
  };

  panel.querySelector('#__uvd_sub_apikey__').onchange = function() {
    data.settings.subdlApiKey = this.value.trim();
    storage.set(data);
  };

  panel.querySelector('#__uvd_sub_search__').onclick = function() {
    var q = panel.querySelector('#__uvd_sub_query__').value.trim();
    if (!q) return;
    var box = panel.querySelector('#__uvd_sub_results__');
    box.innerHTML = '<div style="font-size:11px;color:var(--text3);padding:8px 0;">Đang tìm...</div>';
    searchSubDL(q, function(list) {
      if (!list.length) { box.innerHTML = '<div style="font-size:11px;color:var(--text3);padding:8px 0;">Không tìm thấy kết quả.</div>'; return; }
      box.innerHTML = '';
      list.slice(0, 10).forEach(function(item) {
        var title = item.release_name || item.name || item.film_name || q;
        var lang = item.language || item.lang || '';
        var row = document.createElement('div');
        row.className = 'uvd-card';
        row.style.cssText = 'padding:8px 10px;margin-bottom:6px;cursor:pointer;';
        row.innerHTML = '<div style="font-size:12px;color:#fff;">' + escapeHtml(title) + '</div>' +
          '<div style="font-size:10px;color:var(--text3);">' + escapeHtml(String(lang).toUpperCase()) + '</div>';
        row.onclick = function() {
          toast('Đang tải phụ đề...');
          downloadSubDLFile(item, function(ok) { if (ok) overlay2.remove(); });
        };
        box.appendChild(row);
      });
    });
  };

  panel.querySelector('#__uvd_sub_off__').onclick = function() {
    if (video && video.textTracks) {
      for (var i = 0; i < video.textTracks.length; i++) video.textTracks[i].mode = 'disabled';
    }
    toast('Đã tắt phụ đề');
    overlay2.remove();
  };

  panel.querySelector('#__uvd_sub_close__').onclick = function() { overlay2.remove(); };
}

// ========== VOLUME BOOST ==========
function enableVolumeBoost(video, percent) {
  try {
    if (!playerState.audioCtx) {
      var Ctx = window.AudioContext || window.webkitAudioContext;
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
  try { if (playerState.gainNode) playerState.gainNode.gain.value = 1; } catch(e) {}
}

// ========== GESTURE: TUA ĐÚP ==========
function attachPlayerGestures(wrapper, video) {
  var lastTap = { time: 0, side: null };
  var tapSeconds = data.settings.doubleTapSeconds || 10;

  wrapper.addEventListener('touchend', function(e) {
    var t = e.changedTouches && e.changedTouches[0];
    if (!t) return;
    var rect = wrapper.getBoundingClientRect();
    var side = (t.clientX - rect.left) < rect.width / 2 ? 'left' : 'right';
    var now = Date.now();
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

var __gestureHintTimer = null;
function showGestureHint(text) {
  var el = document.getElementById('__uvd_gesture_hint__');
  if (!el) {
    el = document.createElement('div');
    el.id = '__uvd_gesture_hint__';
    el.style.cssText = 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);background:rgba(0,0,0,0.7);color:#fff;padding:10px 18px;border-radius:12px;font-size:14px;font-weight:600;z-index:5;pointer-events:none;';
    var wrapper = document.getElementById('__uvd_video_wrapper__');
    if (wrapper) wrapper.appendChild(el);
  }
  el.textContent = text;
  el.style.opacity = '1';
}
function hideGestureHintSoon() {
  clearTimeout(__gestureHintTimer);
  __gestureHintTimer = setTimeout(function() {
    var el = document.getElementById('__uvd_gesture_hint__');
    if (el) el.style.opacity = '0';
  }, 500);
}

// ========== OVERLAY PLAYER ==========
// ========== VIDEO.JS V10 SKIN (có fallback an toàn) ==========
// v10 (videojs.org) đang beta, dùng Web Components qua <script type="module">.
// Nếu site đích chặn CDN/module (CSP) hoặc thư viện lỗi, TỰ ĐỘNG rơi về
// <video controls> gốc — không bao giờ để trình phát vỡ hoàn toàn.
// hls.js vẫn gắn thẳng vào thẻ <video> như cũ (video chỉ bị "chuyển nhà"
// vào trong <video-skin>, không ảnh hưởng currentTime/trạng thái phát).
function __uvdMountVjs10(wrapper, video) {
  var FALLBACK_MS = 4000;
  var done = false;
  function fallbackToNative() {
    if (done) return;
    done = true;
    if (!video.parentNode) wrapper.appendChild(video);
    video.setAttribute('controls', '');
  }
  function wrapWithSkin() {
    if (done) return;
    done = true;
    try {
      var player = document.createElement('video-player');
      // THỬ NGHIỆM: không ép height:100% (khiến component to hết cỡ khung
      // chứa rồi tự letterbox NỘI BỘ, controls overlay nếu có sẽ bám mép khối
      // to đó chứ không bám sát mép video thật) — thay bằng aspect-ratio (mặc
      // định 16:9, JS sẽ cập nhật lại đúng tỉ lệ thật khi biết videoWidth/
      // videoHeight) + max-height để co theo khung hình thật, giống chế độ
      // "fluid" mà tài liệu Video.js mô tả.
      player.style.cssText = 'width:100%;max-height:100%;display:block;aspect-ratio:16/9;margin:auto;position:relative;z-index:1;';
      player.id = '__uvd_player_el__';
      var skin = document.createElement('video-skin');
      skin.style.cssText = 'width:100%;height:100%;display:block;';
      if (video.parentNode) video.parentNode.removeChild(video);
      skin.appendChild(video);
      player.appendChild(skin);
      wrapper.appendChild(player);
    } catch (e) {
      console.error('[UMP DL] Video.js v10 mount lỗi, dùng controls gốc:', e);
      done = false;
      fallbackToNative();
    }
  }
  if (customElements.get('video-player')) { wrapWithSkin(); return; }
  if (!window.__uvdVjs10Loading) {
    window.__uvdVjs10Loading = true;
    var s = document.createElement('script');
    s.type = 'module';
    s.src = 'https://cdn.jsdelivr.net/npm/@videojs/html/cdn/video.js';
    s.onerror = function() { console.error('[UMP DL] Không tải được Video.js v10 (có thể do CSP chặn trang), dùng controls gốc'); };
    document.head.appendChild(s);
  }
  var checkStart = Date.now();
  var iv = setInterval(function() {
    if (customElements.get('video-player')) {
      clearInterval(iv);
      wrapWithSkin();
    } else if (Date.now() - checkStart > FALLBACK_MS) {
      clearInterval(iv);
      console.warn('[UMP DL] Video.js v10 chưa sẵn sàng sau ' + FALLBACK_MS + 'ms, dùng controls gốc');
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
  pauseAllPlayingVideos();

  playerState.wasReduceMotion = data.settings.reduceMotion;
  if (!data.settings.reduceMotion) {
    data.settings.reduceMotion = true;
    applyMotionPref(document.getElementById('__uvd__'));
  }
  var __uvdMainPanel = document.getElementById('__uvd__');
  if (__uvdMainPanel) __uvdMainPanel.style.visibility = 'hidden';

  // ----- Overlay kiểu sheet (giống settings) -----
  var overlay = document.createElement('div');
  overlay.id = '__uvd_player_overlay__';
  overlay.className = 'uvd-settings-overlay';          // dùng chung class để có style nền + transition
  __uvdAppendRoot(overlay);
  __uvdIsolateLayer(overlay);
  applyEffectsPref(overlay);
  applyMotionPref(overlay);

  // Sheet
  var sheet = document.createElement('div');
  sheet.className = 'uvd-settings-sheet';
  overlay.appendChild(sheet);

  // Header
  var sheetHeader = document.createElement('div');
  sheetHeader.className = 'uvd-settings-header';
  sheetHeader.id = '__uvd_player_header__';
  sheetHeader.style.cssText = 'flex-shrink:0; transition: opacity 0.3s ease;';
  var backBtn = document.createElement('button');
  backBtn.className = 'uvd-back-btn';
  backBtn.id = '__uvd_player_close__';
  backBtn.textContent = '←';
  backBtn.title = 'Đóng player';
  var titleSpan = document.createElement('span');
  titleSpan.className = 'uvd-settings-title';
  titleSpan.textContent = '▶ ' + pageInfo.title;
  sheetHeader.appendChild(backBtn);
  sheetHeader.appendChild(titleSpan);
  sheet.appendChild(sheetHeader);

  // Body – chiếm phần còn lại, không padding, không scroll
  var sheetBody = document.createElement('div');
  sheetBody.className = 'uvd-settings-body';
  sheetBody.style.cssText = 'padding:0; overflow:hidden; display:flex; align-items:center; justify-content:center; flex:1;';
  sheet.appendChild(sheetBody);

  // Video wrapper
  var videoWrapper = document.createElement('div');
  videoWrapper.id = '__uvd_video_wrapper__';
  videoWrapper.style.cssText = 'display:flex; align-items:center; justify-content:center; background:#000; position:relative; overflow:hidden; width:100%; height:100%;';
  var video = document.createElement('video');
  video.id = '__uvd_player_video__';
  video.style.cssText = 'max-width:100%; max-height:100%; width:100%; height:100%; display:block; object-fit:contain;';
  video.setAttribute('playsinline', '');
  video.setAttribute('webkit-playsinline', '');
  video.setAttribute('crossorigin', 'anonymous');
  videoWrapper.appendChild(video);
  sheetBody.appendChild(videoWrapper);

  playerState.overlay = overlay;
  playerState.video = video;
  __uvdMountVjs10(videoWrapper, video);

  // ----- Cập nhật tỉ lệ video -----
  function __uvdUpdatePlayerAspect() {
    if (!video.videoWidth || !video.videoHeight) return;
    var playerEl = document.getElementById('__uvd_player_el__');
    if (playerEl) playerEl.style.aspectRatio = video.videoWidth + '/' + video.videoHeight;
  }
  video.addEventListener('loadedmetadata', __uvdUpdatePlayerAspect);
  video.addEventListener('resize', __uvdUpdatePlayerAspect);
  __uvdUpdatePlayerAspect();

  // ----- Auto‑hide header -----
  function resetHideTimer() {
    clearTimeout(playerState.hideTimeout);
    sheetHeader.style.opacity = '1';
    playerState.controlsVisible = true;
    if (!data.settings.autoHideControls) return;
    var delay = (data.settings.hideDelay || 5) * 1000;
    playerState.hideTimeout = setTimeout(function() {
      if (video.paused) return;
      sheetHeader.style.opacity = '0';
      playerState.controlsVisible = false;
    }, delay);
  }
  videoWrapper.addEventListener('click', resetHideTimer);
  videoWrapper.addEventListener('touchstart', resetHideTimer);
  video.addEventListener('play', resetHideTimer);
  video.addEventListener('playing', resetHideTimer);
  video.addEventListener('pause', function() {
    clearTimeout(playerState.hideTimeout);
    sheetHeader.style.opacity = '1';
    playerState.controlsVisible = true;
  });
  video.addEventListener('ended', function() {
    clearTimeout(playerState.hideTimeout);
    sheetHeader.style.opacity = '1';
    playerState.controlsVisible = true;
  });
  sheetHeader.addEventListener('click', resetHideTimer);
  addCleanup(function() { clearTimeout(playerState.hideTimeout); });

  // ----- Đóng bằng nút back -----
  backBtn.onclick = function() {
    closePlayer();
    if (document.getElementById('__uvd_stream_list__')) {
      document.getElementById('__uvd_stream_list__').style.display = 'block';
    }
  };

  // ----- Đóng khi click ra ngoài sheet (nền) -----
  overlay.addEventListener('click', function(e) {
    if (e.target === overlay) {
      closePlayer();
      if (document.getElementById('__uvd_stream_list__')) {
        document.getElementById('__uvd_stream_list__').style.display = 'block';
      }
    }
  });

  // Mở overlay (trượt lên)
  requestAnimationFrame(function() {
    overlay.classList.add('uvd-open');
  });

  // ===== Các hàm hỗ trợ =====
  function formatTime(sec) {
    if (!sec || sec < 0) return '00:00';
    sec = Math.floor(sec);
    var h = Math.floor(sec / 3600);
    var m = Math.floor((sec % 3600) / 60);
    var s = sec % 60;
    if (h > 0) return h + ':' + (m<10?'0':'') + m + ':' + (s<10?'0':'') + s;
    return (m<10?'0':'') + m + ':' + (s<10?'0':'') + s;
  }

  function createMenuPanel(title, options, callback) {
    var overlay2 = document.createElement('div');
    overlay2.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:2147483647;display:flex;align-items:center;justify-content:center;';
    var panel = document.createElement('div');
    panel.style.cssText = 'background:rgba(20,22,30,0.95);border-radius:16px;padding:20px;min-width:250px;max-width:90%;border:1px solid rgba(255,255,255,0.15);';
    panel.innerHTML = '<div style="color:#fff;font-weight:600;margin-bottom:12px;">' + escapeHtml(title) + '</div>';
    var content = document.createElement('div');
    content.style.cssText = 'max-height:60vh;overflow-y:auto;';
    options.forEach(function(opt) {
      var btn = document.createElement('button');
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
    var closeBtn = document.createElement('button');
    closeBtn.textContent = 'Đóng';
    closeBtn.className = 'uvd-btn uvd-btn-sm';
    closeBtn.style.cssText = 'width:100%;margin-top:10px;background:var(--danger);';
    closeBtn.onclick = function() { overlay2.remove(); resetHideTimer(); };
    panel.appendChild(closeBtn);
    overlay2.appendChild(panel);
    __uvdAppendRoot(overlay2);
  }

  function showQualitySubMenu() {
    var qualities = playerState.qualities;
    if (!qualities.length) { toast('Không có chất lượng'); return; }
    var opts = qualities.map(function(q, idx) {
      return { label: q.label + (q.resolution !== 'unknown' ? ' (' + q.resolution + ')' : ''), value: idx };
    });
    createMenuPanel('Chọn chất lượng', opts, function(idx) {
      var q = qualities[idx];
      if (q && playerState.hls) {
        var levels = playerState.hls.levels;
        for (var i = 0; i < levels.length; i++) {
          if (levels[i].height === parseInt(q.resolution.split('x')[1]) || levels[i].bitrate === q.bandwidth) {
            playerState.hls.currentLevel = i;
            break;
          }
        }
        toast('Chuyển sang ' + q.label);
      }
    });
  }

  // Nút ⋮ (menu) sẽ được thêm vào header bên cạnh tiêu đề
  // Chúng ta sẽ thêm menu button vào bên phải header (cạnh nút đóng)
  var menuBtn = document.createElement('button');
  menuBtn.className = 'uvd-icon-btn uvd-icon-btn-wide';
  menuBtn.textContent = '⋮';
  menuBtn.title = 'Tuỳ chọn';
  menuBtn.style.cssText = 'margin-left:auto; margin-right:4px;';
  sheetHeader.appendChild(menuBtn);

  menuBtn.onclick = function(e) {
    e.stopPropagation();
    var existing = document.getElementById('__uvd_player_menu__');
    if (existing) { existing.remove(); return; }
    var menu = document.createElement('div');
    menu.id = '__uvd_player_menu__';
    menu.className = 'uvd-player-menu';
    var qBtn = document.createElement('button');
    qBtn.innerHTML = '🎚 Chất lượng';
    qBtn.onclick = function() { menu.remove(); if (playerState.qualities.length > 0) showQualitySubMenu(); else toast('Không có chất lượng để chọn'); };
    var sBtn = document.createElement('button');
    sBtn.innerHTML = '💬 Phụ đề';
    sBtn.onclick = function() { menu.remove(); showSubtitlePanel(playerState.video); };
    menu.appendChild(qBtn);
    menu.appendChild(sBtn);
    sheetHeader.appendChild(menu);
    setTimeout(function() {
      document.addEventListener('click', function onDoc(ev) {
        if (!menu.contains(ev.target) && ev.target !== menuBtn) { menu.remove(); document.removeEventListener('click', onDoc); }
      });
    }, 0);
  };

  // ----- Cập nhật tiêu đề hiển thị thông tin -----
  function updateTitleDisplay() {
    var currentRes = '';
    if (video && video.videoWidth && video.videoHeight) {
      currentRes = video.videoWidth + 'x' + video.videoHeight;
    } else if (playerState.resolution) {
      currentRes = playerState.resolution;
    }
    var sub = playerState.type + (currentRes ? ' · ' + currentRes : '');
    titleSpan.textContent = '▶ ' + pageInfo.title + (sub ? '  (' + sub + ')' : '');
  }

  function formatBytes(bytes) {
    if (!bytes || bytes <= 0) return null;
    var units = ['B', 'KB', 'MB', 'GB'];
    var i = 0;
    while (bytes >= 1024 && i < units.length - 1) { bytes /= 1024; i++; }
    return bytes.toFixed(i === 0 ? 0 : 1) + ' ' + units[i];
  }

  function updateSizeEstimate() {
    // không cần hiển thị dung lượng riêng, có thể bỏ qua
  }

  // ----- Khởi tạo phát video -----
  function onMetadataLoaded() {
    lockOrientation(video);
    if (video.videoWidth && video.videoHeight && !playerState.resolution) {
      playerState.resolution = video.videoWidth + 'x' + video.videoHeight;
    }
    updateTitleDisplay();
    if (isHls && playerState.qualities.length === 0) {
      parseM3U8Master(url, function(qualities) {
        if (qualities && qualities.length > 0) {
          playerState.qualities = qualities;
        }
      });
    }
    if (data.settings.defaultSpeed && data.settings.defaultSpeed !== 1) {
      video.playbackRate = data.settings.defaultSpeed;
    }
    if (data.settings.autoFullscreen && !document.fullscreenElement) {
      var vw = document.getElementById('__uvd_video_wrapper__');
      var fsReq = vw && (vw.requestFullscreen || vw.webkitRequestFullscreen);
      if (fsReq) fsReq.call(vw).catch(function(){});
    }
    if (data.settings.volumeBoost) enableVolumeBoost(video, data.settings.volumeBoostMax);
    if (data.settings.resumePlayback) {
      var pos = getPlaybackPosition(url);
      if (pos && pos.time > 3) {
        video.currentTime = pos.time;
        toast('▶ Tiếp tục từ ' + formatTime(pos.time));
      }
    }
    resetHideTimer();
  }

  video.addEventListener('loadedmetadata', onMetadataLoaded);
  var __lastPosSave = 0;
  video.addEventListener('timeupdate', function() {
    if (data.settings.resumePlayback && Date.now() - __lastPosSave > 5000) {
      __lastPosSave = Date.now();
      savePlaybackPosition(url, video);
    }
    updateTitleDisplay();
  });
  video.addEventListener('ended', function() {
    if (data.settings.resumePlayback) { delete data.playbackPositions[url]; storage.set(data); }
    if (data.settings.autoNext) {
      var nextUrl = getNextStreamUrl(url);
      if (nextUrl) { toast('⏭ Đang phát stream tiếp theo...'); setTimeout(function() { showVideoPlayer(nextUrl.url, nextUrl.type); }, 800); }
    }
  });

  function getNextStreamUrl(currentUrl) {
    var list = [...urls.entries()]
      .filter(function(e) { return e[1].type !== 'IFRAME'; })
      .map(function(e) { return { url: e[0], type: e[1].type, priority: e[1].priority }; })
      .sort(function(a, b) { return a.priority - b.priority; });
    var idx = list.findIndex(function(i) { return i.url === currentUrl; });
    if (idx === -1 || idx + 1 >= list.length) return null;
    return list[idx + 1];
  }

  var isHls = url.includes('.m3u8') || url.includes('m3u8');
  var activeHls = null;

  if (isHls) {
    if (window.Hls && Hls.isSupported()) {
      activeHls = new Hls();
      activeHls.loadSource(url);
      activeHls.attachMedia(video);
      activeHls.on(Hls.Events.MANIFEST_PARSED, function() {
        setTimeout(function() { lockOrientation(video); }, 100);
        parseM3U8Master(url, function(qualities) {
          if (qualities && qualities.length > 0) {
            playerState.qualities = qualities;
          }
        });
        applyDefaultQualityPreference();
        resetHideTimer();
      });
      activeHls.on(Hls.Events.LEVEL_SWITCHED, function(event, data) {
        var lvl = activeHls.levels[data.level];
        if (lvl) {
          playerState.resolution = (lvl.width && lvl.height) ? (lvl.width + 'x' + lvl.height) : '';
          playerState.bandwidth = lvl.bitrate || 0;
        }
        updateTitleDisplay();
      });
      playerState.hls = activeHls;
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = url;
    } else {
      var s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/hls.js@latest';
      s.onload = function() { showVideoPlayer(url, type); };
      document.head.appendChild(s);
      return;
    }
  } else {
    video.src = url;
  }

  function applyDefaultQualityPreference() {
    if (!activeHls || !activeHls.levels || !activeHls.levels.length) return;
    var pref = data.settings.dataSaver ? 'lowest' : data.settings.defaultQuality;
    if (pref === 'auto' || !pref) return;
    var levels = activeHls.levels;
    var bestIdx = 0;
    for (var i = 1; i < levels.length; i++) {
      if (pref === 'highest' && levels[i].bitrate > levels[bestIdx].bitrate) bestIdx = i;
      if (pref === 'lowest' && levels[i].bitrate < levels[bestIdx].bitrate) bestIdx = i;
    }
    activeHls.currentLevel = bestIdx;
  }

  attachPlayerGestures(videoWrapper, video);

  function onFullscreenChange() {
    var isFullscreen = !!(document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement);
    if (isFullscreen) lockOrientation(video);
    else unlockOrientation();
  }
  playerState.onFullscreenChange = onFullscreenChange;
  document.addEventListener('fullscreenchange', onFullscreenChange);
  document.addEventListener('webkitfullscreenchange', onFullscreenChange);
  document.addEventListener('mozfullscreenchange', onFullscreenChange);
  document.addEventListener('MSFullscreenChange', onFullscreenChange);
  addCleanup(function() {
    document.removeEventListener('fullscreenchange', onFullscreenChange);
    document.removeEventListener('webkitfullscreenchange', onFullscreenChange);
    document.removeEventListener('mozfullscreenchange', onFullscreenChange);
    document.removeEventListener('MSFullscreenChange', onFullscreenChange);
  });
}

// ===== CÁC HÀM MINIMIZE / RESTORE / CLOSE =====
function closePlayer() {
  if (playerState.overlay) {
    if (data.settings.resumePlayback && playerState.url && playerState.video) {
      savePlaybackPosition(playerState.url, playerState.video);
    }
    clearSleepTimer();
    clearTimeout(playerState.hideTimeout);
    if (playerState.audioCtx) {
      try { playerState.audioCtx.close(); } catch(e) {}
      playerState.audioCtx = null;
      playerState.gainNode = null;
      playerState.sourceNode = null;
    }
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
    unlockOrientation();
    playerState.overlay.remove();
    playerState.overlay = null;
    playerState.video = null;
    playerState.qualities = [];
    playerState.resolution = '';
    playerState.bandwidth = 0;

    data.settings.reduceMotion = playerState.wasReduceMotion;
    var __uvdMainPanel = document.getElementById('__uvd__');
    applyMotionPref(__uvdMainPanel);
    if (__uvdMainPanel) __uvdMainPanel.style.visibility = ''; // hiện lại panel chính sau khi đóng player
    storage.set(data);
  }
}

// ========== CSS (giữ nguyên UI) ==========
if (document.getElementById('__uvd_css__')) document.getElementById('__uvd_css__').remove();
var style = document.createElement('style');
style.id = '__uvd_css__';
style.textContent = `
:root {
  --uvd-blur: 24px;
  --uvd-transition: 0.3s ease;
}
@keyframes uvdSlideIn{from{transform:translate(-50%,-20px);opacity:0}to{transform:translate(-50%,0);opacity:1}}
@keyframes uvdPulse{0%,100%{opacity:1;box-shadow:0 0 5px var(--accent)}50%{opacity:0.4;box-shadow:0 0 20px var(--accent)}}
@keyframes uvdScaleIn{from{opacity:0;transform:scale(0.94)}to{opacity:1;transform:scale(1)}}
@keyframes uvdRipple{to{transform:scale(4);opacity:0}}
@keyframes uvdCardEnter{from{opacity:0;transform:translateY(15px)}to{opacity:1;transform:translateY(0)}}
@keyframes uvdLiquidDrift{0%{transform:translate(-6%,-4%) scale(1)}50%{transform:translate(4%,6%) scale(1.12)}100%{transform:translate(-6%,-4%) scale(1)}}
@keyframes uvdFadeIn{from{opacity:0}to{opacity:1}}
.uvd-scope,.uvd-scope *{box-sizing:border-box}
.uvd-glass-panel{background:var(--glass);backdrop-filter:blur(var(--uvd-blur)) saturate(130%);-webkit-backdrop-filter:blur(var(--uvd-blur)) saturate(130%);border:1px solid var(--border);border-radius:var(--radius-lg);box-shadow:0 20px 50px rgba(0,0,0,0.8),0 0 0 1px rgba(255,255,255,0.03) inset,0 1px 0 rgba(255,255,255,0.08) inset;color:var(--text);font-family:-apple-system,BlinkMacSystemFont,'SF Pro Display','Segoe UI',Roboto,sans-serif;font-size:var(--fs-base);padding:16px;width:100%;position:relative;overflow:hidden;max-width:1000px;margin:auto;transition: backdrop-filter var(--uvd-transition), background var(--uvd-transition);}
.uvd-glass-panel::before{content:'';position:absolute;top:0;left:8%;right:8%;height:1px;z-index:2;background:linear-gradient(90deg,transparent,rgba(255,79,160,0.6),rgba(255,143,214,0.6),transparent);opacity:0.7}
.uvd-settings-overlay{position:fixed;inset:0;z-index:2147483647;display:flex;align-items:flex-end;justify-content:center;background:rgba(0,0,0,0);transition:background .28s ease;}
.uvd-icon-btn{background:var(--btn-bg);border:none;color:#fff;width:36px;height:36px;border-radius:var(--radius-sm);cursor:pointer;display:inline-flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0;position:relative;overflow:hidden;transition:all var(--uvd-transition);}
.uvd-icon-btn:active{transform:scale(0.9);}
.uvd-player-card{width:100%;max-width:1000px;margin:auto;display:flex;flex-direction:column;border-radius:22px 22px 0 0;overflow:hidden;background:var(--glass);box-shadow:0 -10px 40px rgba(0,0,0,0.6);max-height:94dvh;}
.uvd-player-menu{position:absolute;top:48px;right:12px;z-index:20;background:var(--glass);backdrop-filter:blur(var(--uvd-blur)) saturate(130%);-webkit-backdrop-filter:blur(var(--uvd-blur)) saturate(130%);border:1px solid var(--border);border-radius:var(--radius-md);overflow:hidden;min-width:170px;box-shadow:0 10px 30px rgba(0,0,0,0.6);animation:uvdFadeIn 0.15s ease;}
.uvd-player-menu button{display:flex;align-items:center;gap:10px;width:100%;padding:12px 14px;background:transparent;border:none;color:var(--text);font-size:13px;font-weight:600;text-align:left;cursor:pointer;}
.uvd-player-menu button:active{background:var(--btn-accent-bg);}
.uvd-player-menu button+button{border-top:1px solid var(--border);}
.uvd-icon-btn-wide{width:auto;padding:0 10px;font-size:13px;font-weight:600;gap:4px;}
.uvd-liquid-bg{position:absolute;inset:-20%;z-index:0;pointer-events:none;background:radial-gradient(closest-side,rgba(255,79,160,0.14),transparent 70%) 20% 25%/60% 60% no-repeat;filter:blur(28px);animation:uvdLiquidDrift 16s ease-in-out infinite}
.uvd-reduce-motion .uvd-liquid-bg{display:none}
.uvd-settings-overlay.uvd-open{background:rgba(0,0,0,0.55);}
.uvd-settings-sheet{width:100%;max-width:1000px;max-height:92dvh;display:flex;flex-direction:column;transform:translateY(100%);transition:transform .32s cubic-bezier(.4,0,.2,1);border-radius:32px 32px 0 0;overflow:hidden;background:var(--glass);backdrop-filter:blur(var(--uvd-blur)) saturate(130%);-webkit-backdrop-filter:blur(var(--uvd-blur)) saturate(130%);border:1px solid var(--border);box-shadow:0 -20px 50px rgba(0,0,0,0.8);}
.uvd-settings-overlay.uvd-open .uvd-settings-sheet{transform:translateY(0);}
.uvd-settings-header{display:flex;align-items:center;gap:10px;padding:14px 16px;border-bottom:1px solid var(--border);flex-shrink:0;}
.uvd-settings-header .uvd-back-btn{background:var(--glass-hi);border:1px solid var(--border);color:var(--text);width:34px;height:34px;border-radius:var(--radius-sm);cursor:pointer;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;}
.uvd-settings-title{font-weight:700;font-size:16px;color:var(--accent);text-shadow:0 0 12px rgba(255,79,160,0.5);}
.uvd-settings-body{overflow-y:auto;padding:14px 16px;flex:1;}
@media (prefers-reduced-motion:reduce){.uvd-liquid-bg{animation:none}}
.uvd-tab-hidden .uvd-liquid-bg{animation-play-state:paused}
.uvd-panel-content{position:relative;z-index:1;display:flex;flex-direction:column;height:100%;min-height:0}
.uvd-reduce-motion *{animation:none!important;transition:none!important}
/* Chế độ hiệu suất: nền đặc, chữ sáng rõ */
.uvd-reduce-motion .uvd-glass-panel {
  backdrop-filter: blur(0px)!important;
  -webkit-backdrop-filter: blur(0px)!important;
  background: rgba(10,11,16, 0.98) !important;
  border-color: rgba(255,255,255,0.12);
}
.uvd-reduce-motion .uvd-glass-panel .uvd-panel-content {
  color: var(--text);
}
.uvd-reduce-motion .uvd-glass-panel .uvd-tab {
  color: var(--text2);
}
.uvd-reduce-motion .uvd-glass-panel .uvd-tab.uvd-tab-active {
  color: #fff;
}
.uvd-reduce-motion .uvd-glass-panel .uvd-card {
  background: rgba(255,255,255,0.06);
}
.uvd-reduce-motion .uvd-glass-panel .uvd-btn {
  background: rgba(255,255,255,0.08);
}

.uvd-tabbar{display:flex;gap:2px;padding:6px 8px;background:rgba(255,255,255,0.04);border:1px solid var(--border);border-radius:999px;margin-bottom:10px;flex-shrink:0;overflow-x:auto;overflow-y:hidden;-webkit-overflow-scrolling:touch;scrollbar-width:none;position:relative;}
.uvd-tabbar::-webkit-scrollbar{display:none}
.uvd-tab-indicator{position:absolute;top:4px;bottom:4px;left:0;width:0;border-radius:999px;background:var(--grad-liquid);z-index:0;box-shadow:0 3px 12px rgba(255,79,160,0.45);transition:transform 0.4s cubic-bezier(.4,0,.2,1),width 0.4s cubic-bezier(.4,0,.2,1)}
.uvd-tab{position:relative;z-index:1;flex:1 1 0%;min-width:max-content;background:transparent;border:none;color:var(--text2);font-weight:600;font-size:var(--fs-sm);padding:9px 16px;border-radius:999px;cursor:pointer;white-space:nowrap;text-align:center;}
.uvd-tab.uvd-tab-active{color:#fff;text-shadow:0 1px 4px rgba(0,0,0,0.3)}

.uvd-scope{color:var(--text);font-family:-apple-system,BlinkMacSystemFont,'SF Pro Display','Segoe UI',Roboto,sans-serif;--bg:rgba(6,3,8,0.97);--glass:rgba(20,10,22,0.86);--glass-hi:rgba(255,143,214,0.05);--border:rgba(255,143,214,0.12);--text:#f3f5ff;--text2:#9ca3bd;--text3:#5d6377;--accent:#ff4fa0;--accent2:#ff8fd6;--danger:#ff5d72;--gold:#ffb84d;--success:#34d399;--card-bg:rgba(255,255,255,0.03);--fs-xs:11px;--fs-sm:12px;--fs-base:13px;--fs-md:14px;--fs-lg:16px;--radius-sm:14px;--radius-md:20px;--radius-lg:32px;--grad-liquid:linear-gradient(135deg,var(--accent),var(--accent2));--glow-px:0px;--glow-op:0;--btn-bg:rgba(255,255,255,0.1);--btn-danger-bg:rgba(255,93,114,0.22);--btn-danger-border:rgba(255,93,114,0.4);--btn-success-bg:rgba(52,211,153,0.2);--btn-success-border:rgba(52,211,153,0.4);--btn-accent-bg:rgba(255,79,160,0.28);--btn-purple-bg:rgba(214,74,199,0.26);--btn-gold-bg:rgba(255,184,77,0.26)}
.uvd-fx-on .uvd-btn{transition:box-shadow .25s ease,transform .15s ease}
.uvd-fx-on .uvd-btn:active{transform:scale(0.95)}
.uvd-fx-on.uvd-glass-panel,.uvd-fx-on #__uvd_player_header__{box-shadow:0 0 var(--glow-px) rgba(255,79,160,var(--glow-op)),0 8px 30px rgba(0,0,0,0.5)}
.uvd-fx-on #__uvd_player_close__{box-shadow:0 0 calc(var(--glow-px) * 0.6) rgba(255,93,114,var(--glow-op))}
.uvd-overlay{position:fixed;inset:0;background:rgba(2,3,6,0.92);backdrop-filter:blur(10px) saturate(120%);z-index:2147483647;display:flex;align-items:center;justify-content:center;padding:16px;overflow-y:auto}
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
.uvd-card:hover{transform:translateY(-5px) scale(1.01);box-shadow:0 18px 40px rgba(0,0,0,0.8),0 0 0 1px rgba(255,79,160,0.4) inset;}
.uvd-type-badge{display:inline-block;padding:4px 12px;border-radius:var(--radius-sm);font-size:var(--fs-xs);font-weight:700;background:linear-gradient(135deg,rgba(255,79,160,0.22),rgba(255,143,214,0.18));color:var(--accent);border:1px solid rgba(255,79,160,0.28);letter-spacing:0.03em}
.uvd-url-box{background:rgba(0,0,0,0.5);border-radius:var(--radius-sm);padding:12px;font-family:'SFMono-Regular',Consolas,monospace;font-size:var(--fs-sm);word-break:break-all;color:var(--text2);max-height:100px;overflow-y:auto;line-height:1.5;border:1px solid rgba(255,255,255,0.04)}
.uvd-grid-2{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.uvd-grid-3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px}
.uvd-ripple{position:absolute;border-radius:50%;background:rgba(255,255,255,0.5);transform:scale(0);animation:uvdRipple 0.6s ease-out}
.uvd-profile-card{display:flex;align-items:center;gap:14px;background:linear-gradient(135deg,rgba(255,79,160,0.14),rgba(255,143,214,0.08));border:1px solid rgba(255,79,160,0.25);border-radius:var(--radius-lg);padding:16px;margin-bottom:10px;animation:uvdCardEnter 0.4s ease both}
.uvd-profile-avatar{flex-shrink:0;width:56px;height:56px;border-radius:50%;background:var(--grad-liquid);color:#fff;font-weight:700;font-size:18px;display:flex;align-items:center;justify-content:center;box-shadow:0 6px 18px rgba(255,79,160,0.4),0 0 0 3px rgba(255,255,255,0.08)}
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
.uvd-section-num{width:20px;height:20px;border-radius:50%;background:var(--grad-liquid);color:#fff;font-size:11px;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;box-shadow:0 2px 8px rgba(255,79,160,0.4)}
.uvd-timeline-card{border-left:2px solid rgba(255,79,160,0.3)}
.uvd-inline-code{display:inline-block;background:rgba(0,0,0,0.35);padding:3px 9px;border-radius:6px;color:var(--accent2);font-family:'SFMono-Regular',Consolas,monospace;font-size:11px;border:1px solid rgba(255,255,255,0.06);margin:2px 0}
.uvd-profile-footer{text-align:center;font-size:11px;color:var(--text3);margin-top:14px;padding-top:12px;border-top:1px solid var(--border)}
.uvd-step{display:flex;gap:10px;align-items:flex-start;margin-bottom:12px}
.uvd-step:last-child{margin-bottom:0}
.uvd-step-num{flex-shrink:0;width:24px;height:24px;border-radius:50%;background:var(--grad-liquid);color:#fff;font-size:12px;font-weight:700;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(255,79,160,0.4)}
.uvd-step-text{font-size:13px;color:var(--text2);line-height:1.65;padding-top:2px}
.uvd-step-text strong{color:var(--text)}
.uvd-callout{display:flex;gap:10px;align-items:flex-start;background:rgba(255,79,160,0.1);border:1px solid rgba(255,79,160,0.25);border-left:3px solid var(--accent);border-radius:10px;padding:10px 12px;margin-top:10px;font-size:12px;color:var(--text2);line-height:1.6}
.uvd-callout-icon{flex-shrink:0;font-size:15px}
.uvd-callout.uvd-callout-warn{background:rgba(255,184,77,0.1);border-color:rgba(255,184,77,0.3);border-left-color:var(--gold)}
.uvd-code-block{position:relative;background:rgba(0,0,0,0.5);border:1px solid var(--border);border-radius:10px;margin:8px 0;}
.uvd-code-block textarea{width:100%;background:transparent;border:none;color:var(--accent2);padding:10px 40px 10px 12px;font-size:10px;font-family:'SFMono-Regular',Consolas,monospace;resize:none;}
.uvd-code-copy{position:absolute;top:6px;right:6px;width:26px;height:26px;border-radius:8px;background:rgba(255,255,255,0.08);border:1px solid var(--border);color:var(--text2);font-size:12px;cursor:pointer;display:flex;align-items:center;justify-content:center;}
.uvd-code-copy:active{background:rgba(255,255,255,0.18);}

/* Đã xóa thanh tìm kiếm .uvd-search-box */
`;
document.head.appendChild(style);

// ========== FIX HEADER MINIMIZE ==========
// ĐÃ GỠ hoàn toàn hack bù vị trí theo visualViewport — đó chính là nguyên nhân
// panel bị "trôi/cuộn theo" mỗi khi Chrome co giãn thanh địa chỉ lúc cuộn trang.
// position:fixed tự bám viewport, không cần JS can thiệp thêm.
// Giữ hàm rỗng để không phá các chỗ gọi __uvdSyncViewport() còn lại trong code.
function __uvdSyncViewport() {}

// ========== FIX GLITCH KÍNH KHI CHROME ẨN/HIỆN THANH ĐỊA CHỈ ==========
// NGUYÊN NHÂN THẬT: bản trước ép "nudge" transform (translateZ) MỖI LẦN
// scroll/resize bắn ra — chính việc liên tục bật/tắt transform trên phần tử
// position:fixed đó mới là thứ khiến header nhìn như "giật/trôi theo" nội
// dung trang (mỗi lần nudge là 2 khung hình panel bị dịch layer). Cách sửa
// đúng: ép panel có RIÊNG một GPU compositing layer NGAY TỪ KHI TẠO (isolation
// + contain + will-change tĩnh, không đổi theo sự kiện), để trình duyệt không
// bao giờ phải gộp layer backdrop-filter chung với layer nội dung trang nữa —
// do đó không cần ép vẽ lại theo scroll/resize như trước (đã bỏ hẳn).
function __uvdIsolateLayer(el) {
  if (!el) return;
  el.style.willChange = 'transform';
  el.style.transform = 'translateZ(0)';
  el.style.isolation = 'isolate';
  el.style.contain = 'layout paint style';
}


// ========== BUILD UI ==========
function buildUI() {
  var arr = [...urls.entries()].map(function(e) {
    return { url: e[0], type: e[1].type, source: e[1].source, priority: e[1].priority };
  }).sort(function(a, b) { return a.priority - b.priority; });

  var panel = document.getElementById('__uvd__');
  if (panel) panel.remove();
  
  panel = document.createElement('div');
  panel.id = '__uvd__';
  panel.className = 'uvd-glass-panel';
  panel.style.cssText = 'position:fixed;top:15px;left:15px;right:15px;height:calc(100dvh - 30px);z-index:2147483647;animation:uvdScaleIn 0.4s ease;overscroll-behavior:contain;' + (playerState.overlay ? 'visibility:hidden;' : '');
  
  var liquidBg = document.createElement('div');
  liquidBg.className = 'uvd-liquid-bg';
  panel.appendChild(liquidBg);
  
  var content = document.createElement('div');
  content.className = 'uvd-panel-content';
  panel.appendChild(content);
  
  var header = document.createElement('div');
  header.id = '__uvd_header__';
  header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding-bottom:12px;border-bottom:1px solid var(--border);margin-bottom:10px;flex-shrink:0;';
  header.innerHTML = 
    '<div style="display:flex;align-items:center;gap:8px;">' +
      '<span style="width:10px;height:10px;background:var(--grad-liquid);border-radius:50%;animation:uvdPulse 2s infinite;box-shadow:0 0 8px rgba(255,79,160,0.6);"></span>' +
      '<span style="font-weight:700;font-size:16px;letter-spacing:-0.01em;">UMP DL <span style="background:var(--grad-liquid);-webkit-background-clip:text;background-clip:text;color:transparent;">V' + VERSION + '</span></span>' +
    '</div>' +
    '<div style="display:flex;gap:6px;">' +
      '<button class="uvd-btn-icon" id="__uvd_autoplay__" title="Tự động bấm Play (bấm hết cùng lúc)">▶</button>' +
      '<button class="uvd-btn-icon" id="__uvd_seq_autoplay__" title="Thử lần lượt từng server tới khi ra link">⏭</button>' +
      '<button class="uvd-btn-icon" id="__uvd_settings_btn__" title="Cài đặt">⚙</button>' +
      '<button class="uvd-btn-icon" id="__uvd_refresh__" title="Làm mới">↻</button>' +
      '<button class="uvd-btn-icon" id="__uvd_close__" title="Đóng">×</button>' +
    '</div>';
  content.appendChild(header);
  
  var tabbar = document.createElement('div');
  tabbar.className = 'uvd-tabbar';
  var indicator = document.createElement('div');
  indicator.className = 'uvd-tab-indicator';
  indicator.id = '__uvd_tab_indicator__';
  tabbar.appendChild(indicator);
  
  var clickedCountForHost = Object.keys(data.clickedButtons[pageInfo.host] || {}).length;
  var tabList = [
    { id: 'streams', text: 'Streams (' + arr.length + ')' },
    { id: 'clicked', text: 'Nút đã click' + (clickedCountForHost ? ' (' + clickedCountForHost + ')' : '') },
    { id: 'player', text: 'Trình phát' }
  ];
  
  tabList.forEach(function(t) {
    var b = document.createElement('button');
    b.className = 'uvd-tab';
    b.dataset.tab = t.id;
    b.textContent = t.text;
    tabbar.appendChild(b);
  });
  content.appendChild(tabbar);
  
  function moveIndicatorTo(btn) {
    if (!btn) return;
    var width = btn.offsetWidth;
    indicator.style.width = width + 'px';
    indicator.style.transform = 'translateX(' + btn.offsetLeft + 'px)';
    if (btn.scrollIntoView) btn.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
  }
  
  var info = document.createElement('div');
  info.style.cssText = 'margin-bottom:10px;font-size:12px;flex-shrink:0;';
  var savedPlaySel = (data.siteProfiles[pageInfo.host] && data.siteProfiles[pageInfo.host].playSelector) || '';
  info.innerHTML = 
    '<span style="color:var(--text2);">Tên: </span>' +
    '<span id="__uvd_title__" style="color:var(--accent);text-decoration:underline;cursor:pointer;">' + escapeHtml(pageInfo.title) + '</span> ' +
    '<span style="color:var(--text3);">(sửa)</span><br>' +
    '<span style="color:var(--text2);">Referer: </span>' +
    '<span id="__uvd_referer__" style="color:var(--accent2);font-family:monospace;text-decoration:underline;cursor:pointer;font-size:11px;">' + escapeHtml(pageInfo.referer) + '</span><br>' +
    '<span style="color:var(--text2);">Play selector: </span>' +
    '<span id="__uvd_playsel__" style="color:var(--accent2);font-family:monospace;text-decoration:underline;cursor:pointer;font-size:11px;">' + escapeHtml(savedPlaySel || '(chưa đặt · bấm để thêm)') + '</span>';
  content.appendChild(info);
  
  var contentWrapper = document.createElement('div');
  contentWrapper.className = 'uvd-scroll';
  contentWrapper.style.cssText = 'flex:1;overflow:hidden;position:relative;min-height:0;';
  
  // Đã xóa thanh tìm kiếm (uvd-search-box)
  
  var streamList = document.createElement('div');
  streamList.id = '__uvd_stream_list__';
  streamList.className = 'uvd-scroll';
  streamList.style.cssText = 'overflow-y:auto;height:100%;padding-right:4px;';
  contentWrapper.appendChild(streamList);
  
  content.appendChild(contentWrapper);
  
  var footer = document.createElement('div');
  footer.style.cssText = 'display:flex;gap:6px;margin-top:10px;flex-wrap:wrap;flex-shrink:0;';
  ['TXT','JSON','M3U','CSV'].forEach(function(f) {
    var btn = document.createElement('button');
    btn.className = 'uvd-btn uvd-btn-sm';
    btn.textContent = f;
    btn.style.flex = '1 0 auto';
    btn.onclick = function() { exportData(f.toLowerCase()); };
    footer.appendChild(btn);
  });
  content.appendChild(footer);
  
  var author = document.createElement('div');
  author.style.cssText = 'text-align:center;font-size:11px;color:var(--text3);margin-top:8px;flex-shrink:0;';
  author.textContent = '© nguyenquocngu91';
  content.appendChild(author);
  
  __uvdAppendRoot(panel);
  __uvdIsolateLayer(panel);
  applyEffectsPref(panel);
  applyMotionPref(panel);
  
  // Trước đây query toàn bộ document mỗi lần buildUI() được gọi (rất tốn nếu
  // trang có nhiều phần tử trùng class, và buildUI() bị gọi lại nhiều lần khi
  // rescan) — giờ chỉ query trong phạm vi panel vừa tạo.
  panel.querySelectorAll('.uvd-btn, .uvd-btn-icon, .uvd-tab').forEach(function(btn) {
    btn.addEventListener('click', addRipple);
  });
  
  var currentTab = 'streams';
  function renderTab(tabId) {
    currentTab = tabId;
    document.querySelectorAll('[data-tab]').forEach(function(t) {
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
    else if (tabId === 'player') renderPlayerSettings(streamList);
  }
  
  document.querySelectorAll('[data-tab]').forEach(function(t) {
    t.onclick = function() { renderTab(this.dataset.tab); };
  });
  
  renderTab('streams');
  
  window.addEventListener('resize', function() {
    moveIndicatorTo(document.querySelector('.uvd-tab.uvd-tab-active'));
  });
  
  document.getElementById('__uvd_close__').onclick = function() {
    if (playerState.overlay) closePlayer(); // đóng player trước nếu đang mở — giải phóng hls.js, audio context, video.src
    stopMonitor();
    panel.remove();
    runCleanup();
    urls.clear(); // giải phóng danh sách link đã quét được (có thể vài chục/trăm mục)
    if (typeof style !== 'undefined' && style.parentNode) style.remove(); // gỡ luôn CSS đã tiêm vào <head>
  };
  document.getElementById('__uvd_refresh__').onclick = function() { buildUI(); toast('Đã làm mới'); };
  document.getElementById('__uvd_autoplay__').onclick = function() {
    var n = autoClickPlayButtons(document, 0, false, true);
    toast(n > 0 ? 'Đã thử bấm Play (' + n + ' nút)' : 'Không tìm thấy nút Play, thử đặt selector riêng ở Cài đặt');
    setTimeout(function() { buildUI(); }, 1200);
  };
  document.getElementById('__uvd_seq_autoplay__').onclick = function() { autoClickSequential(false); };
  document.getElementById('__uvd_settings_btn__').onclick = openSettingsOverlay;
  
  document.getElementById('__uvd_title__').onclick = function() {
    var newTitle = prompt('Tên file:', pageInfo.title);
    if (newTitle) { 
      newTitle = newTitle.replace(/[^\w\s\u00C0-\u1EF9.-]/g, '').substring(0,100);
      pageInfo.title = newTitle; 
      this.textContent = escapeHtml(pageInfo.title);
    }
  };
  
  document.getElementById('__uvd_referer__').onclick = function() {
    var newRef = prompt('Referer:', pageInfo.referer);
    if (newRef) {
      pageInfo.referer = newRef;
      this.textContent = escapeHtml(newRef);
      data.siteProfiles[pageInfo.host] = Object.assign({}, data.siteProfiles[pageInfo.host], { referer: newRef, userAgent: pageInfo.userAgent });
      storage.set(data);
      toast('Đã lưu referer cho ' + pageInfo.host);
    }
  };
  
  document.getElementById('__uvd_playsel__').onclick = function() {
    var current = (data.siteProfiles[pageInfo.host] && data.siteProfiles[pageInfo.host].playSelector) || '';
    var newSel = prompt('CSS selector của nút Play trên site này (ví dụ: .video-play-button):', current);
    if (newSel !== null) {
      newSel = newSel.trim();
      data.siteProfiles[pageInfo.host] = Object.assign({}, data.siteProfiles[pageInfo.host], { playSelector: newSel });
      storage.set(data);
      this.textContent = escapeHtml(newSel || '(chưa đặt · bấm để thêm)');
      if (newSel) {
        toast('Đã lưu selector cho ' + pageInfo.host);
        autoClickPlayButtons(document, 0, false);
        setTimeout(function() { buildUI(); }, 1000);
      } else {
        toast('Đã xóa selector riêng');
      }
    }
  };
  
  window.__uvd_showPlayer = function(url, type) {
    showVideoPlayer(url, type);
  };
}

// ========== RENDER FUNCTIONS ==========
var UVD_LAZY_BATCH = 40;

function buildStreamCardHTML(item, i) {
  var actionsHtml;
  if (item.type === 'BLOB') {
    // blob: URL chỉ tồn tại trong phiên trang hiện tại — Chia sẻ/Sao chép/Lệnh
    // tải (wget/ffmpeg...) đều KHÔNG hoạt động với nó. Thay bằng nút tải trực
    // tiếp ngay trong trang (fetch blob rồi lưu file thật qua thẻ <a download>).
    actionsHtml =
      '<button class="uvd-btn uvd-btn-sm" data-action="play" data-url="' + encodeURIComponent(item.url) + '" data-type="' + escapeHtml(item.type) + '" style="background:rgba(255,79,160,0.25);">Xem</button>' +
      '<button class="uvd-btn uvd-btn-sm" data-action="blobdl" data-url="' + encodeURIComponent(item.url) + '" style="background:rgba(52,211,153,0.22);">⬇ Tải Blob</button>' +
      '<div style="grid-column:1/3;font-size:11px;color:var(--text3);line-height:1.4;">Blob chỉ tải được nếu là file gốc (không áp dụng cho stream HLS/DASH qua MediaSource).</div>';
  } else {
    actionsHtml =
      '<button class="uvd-btn uvd-btn-sm" data-action="share" data-url="' + encodeURIComponent(item.url) + '" style="background:rgba(214,74,199,0.22);">Chia sẻ</button>' +
      '<button class="uvd-btn uvd-btn-sm" data-action="copy" data-url="' + encodeURIComponent(item.url) + '">Sao chép</button>' +
      (item.type === 'IFRAME' ?
        '<button class="uvd-btn uvd-btn-sm" data-action="iframe" data-url="' + encodeURIComponent(item.url) + '" style="text-align:center;grid-column:1/3;">Mở iframe</button>' :
        (item.type === 'M3U8' ?
          '<button class="uvd-btn uvd-btn-sm" data-action="quality" data-url="' + encodeURIComponent(item.url) + '">Chất lượng</button>' +
          '<button class="uvd-btn uvd-btn-sm" data-action="play" data-url="' + encodeURIComponent(item.url) + '" data-type="' + escapeHtml(item.type) + '" style="background:rgba(255,79,160,0.25);">Xem</button>' +
          '<button class="uvd-btn uvd-btn-sm" data-action="cmd" data-url="' + encodeURIComponent(item.url) + '" data-type="' + escapeHtml(item.type) + '" style="grid-column:1/3;">Lệnh tải</button>' :
          '<button class="uvd-btn uvd-btn-sm" data-action="play" data-url="' + encodeURIComponent(item.url) + '" data-type="' + escapeHtml(item.type) + '" style="background:rgba(255,79,160,0.25);">Xem</button>' +
          '<button class="uvd-btn uvd-btn-sm" data-action="cmd" data-url="' + encodeURIComponent(item.url) + '" data-type="' + escapeHtml(item.type) + '">Lệnh tải</button>'
        )
      );
  }
  return (
    '<div class="uvd-card" data-type="' + escapeHtml(item.type) + '" data-url="' + escapeHtml(item.url) + '">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">' +
        '<span class="uvd-type-badge">#' + (i+1) + ' ' + escapeHtml(item.type) + '</span>' +
        '<button class="uvd-block-btn" data-url="' + encodeURIComponent(item.url) + '" style="background:none;border:none;font-size:16px;cursor:pointer;color:#fff;opacity:0.5;" title="Chặn link này">⛔</button>' +
      '</div>' +
      '<div class="uvd-url-box">' + escapeHtml(item.url) + '</div>' +
      '<div class="uvd-grid-2" style="margin-top:8px;">' + actionsHtml + '</div>' +
    '</div>'
  );
}

function renderStreams(container, arr) {
  if (!arr.length) {
    container.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text2);">Không phát hiện stream nào.</div>';
    return;
  }

  var listWrap = document.createElement('div');
  container.appendChild(listWrap);
  var rendered = 0;
  var moreBtn = null;

  function renderNextBatch() {
    var end = Math.min(rendered + UVD_LAZY_BATCH, arr.length);
    var html = '';
    for (var i = rendered; i < end; i++) html += buildStreamCardHTML(arr[i], i);
    var frag = document.createElement('div');
    frag.innerHTML = html;
    while (frag.firstChild) listWrap.appendChild(frag.firstChild);
    rendered = end;

    if (moreBtn) { moreBtn.remove(); moreBtn = null; }
    if (rendered < arr.length) {
      moreBtn = document.createElement('button');
      moreBtn.className = 'uvd-btn uvd-btn-sm uvd-more-btn';
      moreBtn.style.cssText = 'width:100%;margin-top:8px;';
      moreBtn.textContent = 'Xem thêm (' + (arr.length - rendered) + ')';
      moreBtn.onclick = function() { renderNextBatch(); };
      container.appendChild(moreBtn);
    }
  }
  renderNextBatch();

  container.onclick = function(e) {
    var blockBtn = e.target.closest('.uvd-block-btn');
    if (blockBtn) {
      addRipple({ currentTarget: blockBtn, clientX: e.clientX, clientY: e.clientY });
      var urlToBlock = decodeURIComponent(blockBtn.dataset.url);
      var pattern = urlToBlock;
      try {
        var u = new URL(urlToBlock);
        pattern = u.hostname;
      } catch(ex) {}
      if (confirm('Chặn tất cả stream chứa "' + pattern + '" ?')) {
        addToFilterlist(pattern);
        toast('Đã chặn "' + pattern + '"');
      }
      return;
    }
    var actionBtn = e.target.closest('.uvd-btn[data-action]');
    if (actionBtn) {
      addRipple({ currentTarget: actionBtn, clientX: e.clientX, clientY: e.clientY });
      var u2 = decodeURIComponent(actionBtn.dataset.url);
      var action = actionBtn.dataset.action;
      var t = actionBtn.dataset.type;
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

// ========== TẢI BLOB (get blob link) ==========
// blob: URL chỉ hợp lệ trong đúng document đã tạo ra nó. Vì bookmarklet chạy
// ngay trong ngữ cảnh trang (không phải extension/webview riêng) nên có thể
// fetch() được blob: đó để lấy dữ liệu thật rồi lưu ra file .mp4/.webm...
// LƯU Ý: nếu blob: được tạo từ MediaSource (rất phổ biến với player HLS/DASH
// dùng hls.js, dash.js, Shaka...) thì fetch() sẽ KHÔNG lấy được trọn file gốc
// vì MediaSource là stream ảo, không phải dữ liệu tĩnh — trường hợp đó nên
// dùng link M3U8/MPD gốc (nếu script phát hiện được) thay vì blob.
function downloadBlobUrl(url) {
  toast('Đang lấy dữ liệu blob...');
  fetch(url)
    .then(function(res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.blob();
    })
    .then(function(blob) {
      if (!blob || blob.size === 0) {
        toast('Blob rỗng — có thể đây là stream MediaSource, không tải được trực tiếp.');
        return;
      }
      var mime = blob.type || '';
      var ext = '.bin';
      if (mime.indexOf('mp4') !== -1) ext = '.mp4';
      else if (mime.indexOf('webm') !== -1) ext = '.webm';
      else if (mime.indexOf('ogg') !== -1) ext = '.ogv';
      else if (mime.indexOf('quicktime') !== -1) ext = '.mov';
      else if (mime.indexOf('mpegurl') !== -1) ext = '.m3u8';
      else if (mime.indexOf('audio/') !== -1) ext = '.mp3';
      var base = (pageInfo.title || 'uvd_blob').replace(/[\\/:*?"<>|]+/g, '_').trim().slice(0, 80) || 'uvd_blob';
      var filename = base + ext;
      var objUrl = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = objUrl;
      a.download = filename;
      a.click();
      setTimeout(function() { URL.revokeObjectURL(objUrl); }, 15000);
      toast('Đã tải: ' + filename + ' (' + (blob.size / 1048576).toFixed(1) + 'MB)');
    })
    .catch(function(err) {
      toast('Không tải được blob: ' + (err && err.message ? err.message : 'lỗi không rõ') + '. Đây thường là stream MediaSource (HLS/DASH) — không thể tải trực tiếp kiểu này.');
    });
}

function showCommandPicker(url, type) {
  var cmds = makeCommands(url, type, pageInfo.title);
  var opts = Object.keys(cmds).map(function(k) {
    var c = cmds[k];
    return { label: c.label, value: c.cmd };
  });
  var overlay = document.createElement('div');
  overlay.className = 'uvd-overlay';
  var panel = document.createElement('div');
  panel.className = 'uvd-glass-panel';
  panel.style.cssText = 'max-width:600px;margin:auto;';
  var titleDiv = document.createElement('div');
  titleDiv.style.cssText = 'font-weight:700;margin-bottom:12px;';
  titleDiv.textContent = 'Chọn lệnh tải';
  panel.appendChild(titleDiv);
  var content = document.createElement('div');
  content.style.cssText = 'overflow-y:auto;max-height:60vh;';
  opts.forEach(function(opt) {
    var card = document.createElement('div');
    card.className = 'uvd-card';
    card.innerHTML = '<div style="font-weight:600;color:var(--accent);">' + escapeHtml(opt.label) + '</div><div class="uvd-url-box">' + escapeHtml(opt.value) + '</div>';
    var btn = document.createElement('button');
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
  var closeBtn = document.createElement('button');
  closeBtn.className = 'uvd-btn uvd-btn-sm';
  closeBtn.style.cssText = 'width:100%;margin-top:10px;background:var(--danger);';
  closeBtn.textContent = 'Đóng';
  closeBtn.onclick = function() { overlay.remove(); };
  panel.appendChild(closeBtn);
  overlay.appendChild(panel);
  __uvdAppendRoot(overlay);
}

function showEditor(text) {
  var overlay = document.createElement('div');
  overlay.className = 'uvd-overlay';
  var panel = document.createElement('div');
  panel.className = 'uvd-glass-panel';
  panel.style.cssText = 'max-width:600px;margin:auto;';
  panel.innerHTML = 
    '<div style="font-weight:700;margin-bottom:8px;">Chỉnh sửa lệnh</div>' +
    '<textarea style="width:100%;height:120px;background:rgba(0,0,0,0.5);border:1px solid var(--border);border-radius:10px;color:var(--text);padding:12px;font-family:monospace;">' + escapeHtml(text) + '</textarea>' +
    '<div class="uvd-grid-2" style="margin-top:12px;">' +
      '<button class="uvd-btn uvd-btn-sm" id="__uvd_ed_copy__">Sao chép</button>' +
      '<button class="uvd-btn uvd-btn-sm" id="__uvd_ed_share__" style="background:var(--btn-purple-bg);">Chia sẻ</button>' +
    '</div>' +
    '<button class="uvd-btn uvd-btn-sm close-editor" style="width:100%;margin-top:8px;background:var(--danger);">Đóng</button>';
  overlay.appendChild(panel);
  __uvdAppendRoot(overlay);
  
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

function showQualityPicker(url) {
  var overlay = document.createElement('div');
  overlay.className = 'uvd-overlay';
  var panel = document.createElement('div');
  panel.className = 'uvd-glass-panel';
  panel.style.cssText = 'max-width:600px;margin:auto;text-align:center;';
  panel.textContent = 'Đang phân tích M3U8...';
  overlay.appendChild(panel);
  __uvdAppendRoot(overlay);
  
  parseM3U8Master(url, function(qualities) {
    if (!qualities) {
      panel.innerHTML = '<div style="color:var(--danger);">Không phải Master Playlist</div><button class="uvd-btn uvd-btn-sm close-overlay-btn" style="margin-top:12px;background:var(--danger);width:100%;">Đóng</button>';
      panel.querySelector('.close-overlay-btn').onclick = function() { overlay.remove(); };
      return;
    }
    panel.innerHTML = '';
    var title = document.createElement('div');
    title.style.cssText = 'font-weight:700;margin-bottom:12px;';
    title.textContent = 'Chọn chất lượng (' + qualities.length + ')';
    panel.appendChild(title);
    var content = document.createElement('div');
    content.style.cssText = 'overflow-y:auto;max-height:60vh;';
    qualities.forEach(function(q) {
      var card = document.createElement('div');
      card.className = 'uvd-card';
      card.innerHTML = '<b>' + escapeHtml(q.label) + '</b> <span style="color:var(--text3);">' + Math.round(q.bandwidth/1000) + 'kbps</span>';
      var grid = document.createElement('div');
      grid.className = 'uvd-grid-3';
      grid.style.marginTop = '8px';
      var shareBtn = document.createElement('button');
      shareBtn.className = 'uvd-btn uvd-btn-sm';
      shareBtn.textContent = 'Chia sẻ';
      shareBtn.onclick = function() { shareUrl(q.url); overlay.remove(); };
      grid.appendChild(shareBtn);
      var playBtn = document.createElement('button');
      playBtn.className = 'uvd-btn uvd-btn-sm';
      playBtn.style.background = 'rgba(255,79,160,0.25)';
      playBtn.textContent = 'Xem';
      playBtn.onclick = function() { overlay.remove(); window.__uvd_showPlayer(q.url, 'M3U8'); };
      grid.appendChild(playBtn);
      var cmdBtn = document.createElement('button');
      cmdBtn.className = 'uvd-btn uvd-btn-sm';
      cmdBtn.textContent = 'Lệnh';
      cmdBtn.onclick = function() { overlay.remove(); showCommandPicker(q.url, 'M3U8'); };
      grid.appendChild(cmdBtn);
      card.appendChild(grid);
      content.appendChild(card);
    });
    panel.appendChild(content);
    var closeBtn = document.createElement('button');
    closeBtn.className = 'uvd-btn uvd-btn-sm';
    closeBtn.style.cssText = 'width:100%;margin-top:10px;background:var(--danger);';
    closeBtn.textContent = 'Đóng';
    closeBtn.onclick = function() { overlay.remove(); };
    panel.appendChild(closeBtn);
  });
}

function buildToggleRow(id, label, checked) {
  return '<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border);">' +
    '<span style="font-size:13px;color:var(--text2);">' + escapeHtml(label) + '</span>' +
    '<button id="' + id + '" class="uvd-toggle-switch' + (checked ? ' uvd-toggle-on' : '') + '"><span class="uvd-toggle-knob"></span></button>' +
  '</div>';
}

function renderPlayerSettings(container) {
  var s = data.settings;
  container.innerHTML =
    '<div class="uvd-card">' +
      '<div style="font-weight:600;margin-bottom:10px;">🎬 Mặc định khi mở trình phát</div>' +
      '<div style="font-size:12px;color:var(--text2);margin-bottom:6px;">Tốc độ phát mặc định</div>' +
      '<select id="__uvd_set_speed__" style="width:100%;padding:10px;background:rgba(0,0,0,0.4);color:#fff;border:1px solid var(--border);border-radius:10px;margin-bottom:12px;">' +
        [0.5,0.75,1,1.25,1.5,2].map(function(v){ return '<option value="'+v+'"'+(s.defaultSpeed===v?' selected':'')+'>'+v+'x</option>'; }).join('') +
      '</select>' +
      '<div style="font-size:12px;color:var(--text2);margin-bottom:6px;">Chất lượng mặc định (HLS)</div>' +
      '<select id="__uvd_set_quality__" style="width:100%;padding:10px;background:rgba(0,0,0,0.4);color:#fff;border:1px solid var(--border);border-radius:10px;">' +
        '<option value="auto"' + (s.defaultQuality==='auto'?' selected':'') + '>Tự động (Auto)</option>' +
        '<option value="highest"' + (s.defaultQuality==='highest'?' selected':'') + '>Cao nhất</option>' +
        '<option value="lowest"' + (s.defaultQuality==='lowest'?' selected':'') + '>Thấp nhất (tiết kiệm data)</option>' +
      '</select>' +
    '</div>' +

    '<div class="uvd-card">' +
      '<div style="font-weight:600;margin-bottom:10px;">⚙️ Tuỳ chọn</div>' +
      buildToggleRow('__uvd_toggle_resume__', 'Nhớ vị trí xem dở (Resume)', s.resumePlayback) +
      buildToggleRow('__uvd_toggle_autofs__', 'Tự động toàn màn hình khi mở', s.autoFullscreen) +
      buildToggleRow('__uvd_toggle_autonext__', 'Tự động phát stream tiếp theo', s.autoNext) +
      buildToggleRow('__uvd_toggle_datasaver__', 'Chế độ tiết kiệm data (ép chất lượng thấp)', s.dataSaver) +
      buildToggleRow('__uvd_toggle_autohide__', 'Tự động ẩn thanh điều khiển', s.autoHideControls) +
      buildToggleRow('__uvd_toggle_showremaining__', 'Hiển thị thời gian còn lại', s.showRemainingTime) +
    '</div>' +

    '<div class="uvd-card">' +
      '<div style="font-weight:600;margin-bottom:10px;">🔊 Tăng âm lượng</div>' +
      buildToggleRow('__uvd_toggle_boost__', 'Bật tăng âm lượng mặc định', s.volumeBoost) +
      '<div style="font-size:12px;color:var(--text2);margin:8px 0 4px;">Mức tăng tối đa: <span id="__uvd_boost_val__">' + s.volumeBoostMax + '%</span></div>' +
      '<input type="range" id="__uvd_boost_range__" min="100" max="300" step="10" value="' + s.volumeBoostMax + '" style="width:100%;">' +
    '</div>' +

    '<div class="uvd-card">' +
      '<div style="font-weight:600;margin-bottom:10px;">🔄 Tua nhanh</div>' +
      '<div style="font-size:12px;color:var(--text2);margin-bottom:6px;">Số giây tua khi chạm đúp trái/phải</div>' +
      '<input type="number" id="__uvd_doubletap_seconds__" min="1" max="60" step="1" value="' + s.doubleTapSeconds + '" style="width:100%;padding:10px;background:rgba(0,0,0,0.4);color:#fff;border:1px solid var(--border);border-radius:10px;">' +
    '</div>' +

    '<div class="uvd-card">' +
      '<div style="font-weight:600;margin-bottom:10px;">⏱️ Tự động ẩn sau</div>' +
      '<div style="font-size:12px;color:var(--text2);margin-bottom:6px;">Số giây trước khi ẩn thanh điều khiển</div>' +
      '<input type="number" id="__uvd_hide_delay__" min="1" max="30" step="1" value="' + s.hideDelay + '" style="width:100%;padding:10px;background:rgba(0,0,0,0.4);color:#fff;border:1px solid var(--border);border-radius:10px;">' +
    '</div>' +

    '<div style="text-align:center;font-size:11px;color:var(--text3);margin-top:4px;">Vị trí xem dở đã lưu: ' + Object.keys(data.playbackPositions||{}).length + ' video</div>';

  container.querySelectorAll('.uvd-toggle-switch').forEach(function(btn) {
    btn.onclick = function() {
      var isOn = btn.classList.toggle('uvd-toggle-on');
      switch (btn.id) {
        case '__uvd_toggle_resume__': s.resumePlayback = isOn; break;
        case '__uvd_toggle_autofs__': s.autoFullscreen = isOn; break;
        case '__uvd_toggle_autonext__': s.autoNext = isOn; break;
        case '__uvd_toggle_datasaver__': s.dataSaver = isOn; break;
        case '__uvd_toggle_boost__': s.volumeBoost = isOn; break;
        case '__uvd_toggle_autohide__': s.autoHideControls = isOn; break;
        case '__uvd_toggle_showremaining__': s.showRemainingTime = isOn; break;
      }
      storage.set(data);
    };
  });

  document.getElementById('__uvd_set_speed__').onchange = function() {
    s.defaultSpeed = parseFloat(this.value);
    storage.set(data);
  };
  document.getElementById('__uvd_set_quality__').onchange = function() {
    s.defaultQuality = this.value;
    storage.set(data);
  };
  document.getElementById('__uvd_boost_range__').oninput = function() {
    s.volumeBoostMax = parseInt(this.value);
    document.getElementById('__uvd_boost_val__').textContent = s.volumeBoostMax + '%';
    storage.set(data);
  };
  document.getElementById('__uvd_doubletap_seconds__').onchange = function() {
    var val = parseInt(this.value) || 10;
    if (val < 1) val = 1;
    if (val > 60) val = 60;
    s.doubleTapSeconds = val;
    storage.set(data);
    toast('Đã đặt tua ' + val + ' giây');
  };
  document.getElementById('__uvd_hide_delay__').onchange = function() {
    var val = parseInt(this.value) || 5;
    if (val < 1) val = 1;
    if (val > 30) val = 30;
    s.hideDelay = val;
    storage.set(data);
    toast('Đã đặt ẩn sau ' + val + ' giây');
  };
}

function renderClickedButtons(container) {
  var host = pageInfo.host;
  var map = data.clickedButtons[host] || {};
  var entries = Object.keys(map).map(function(k) { return map[k]; })
    .sort(function(a, b) { return (b.lastClicked || 0) - (a.lastClicked || 0); });

  var html =
    '<div class="uvd-card">' +
      '<div style="font-weight:600;margin-bottom:6px;">🖱️ Danh sách nút đã click (tổng ' + entries.length + ')</div>' +
      '<div style="font-size:12px;color:var(--text2);margin-bottom:10px;">Bật/tắt để chặn hoặc cho phép click lại. Nút bị chặn sẽ tự bỏ qua ở lần Auto Play kế tiếp trên site <span style="color:var(--accent2);font-family:monospace;">' + escapeHtml(host) + '</span>.</div>';

  if (!entries.length) {
    html += '<div style="text-align:center;color:var(--text3);font-size:12px;padding:16px 0;">Chưa có nút nào được auto-click ghi lại trên site này. Bấm ▶ ở góc trên để thử.</div>';
  } else {
    entries.forEach(function(rec, i) {
      var id = '__uvd_clkbtn_' + i + '__';
      html +=
        '<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--border);">' +
          '<div style="min-width:0;flex:1;">' +
            '<div style="font-family:monospace;font-size:12.5px;color:var(--text);word-break:break-all;">' + escapeHtml(rec.selector) + (rec.fallback ? ' <span style="font-family:-apple-system,sans-serif;font-size:10px;color:#facc15;background:rgba(250,204,21,0.15);padding:1px 6px;border-radius:6px;">🔍 đoán</span>' : '') + '</div>' +
            '<div style="font-size:11px;color:var(--text3);margin-top:2px;">' + (rec.count || 1) + ' lần · ' + escapeHtml((rec.label || '').substring(0,40)) + '</div>' +
          '</div>' +
          '<button data-sel="' + escapeHtml(rec.selector) + '" id="' + id + '" class="uvd-toggle-switch' + (rec.blocked ? ' uvd-toggle-on' : '') + '"><span class="uvd-toggle-knob"></span></button>' +
        '</div>';
    });
    html += '<button id="__uvd_clkbtn_clear__" class="uvd-btn uvd-btn-sm" style="width:100%;margin-top:12px;background:var(--danger);">Xoá toàn bộ danh sách (site này)</button>';
  }
  html += '</div>';
  container.innerHTML = html;

  container.querySelectorAll('.uvd-toggle-switch[data-sel]').forEach(function(btn) {
    btn.onclick = function() {
      var sel = btn.getAttribute('data-sel');
      var isOn = btn.classList.toggle('uvd-toggle-on');
      if (data.clickedButtons[host] && data.clickedButtons[host][sel]) {
        data.clickedButtons[host][sel].blocked = isOn;
        storage.set(data);
        toast(isOn ? '🚫 Đã chặn nút này' : '✅ Đã cho phép click lại');
      }
    };
  });

  var clearBtn = document.getElementById('__uvd_clkbtn_clear__');
  if (clearBtn) {
    clearBtn.onclick = function() {
      delete data.clickedButtons[host];
      storage.set(data);
      renderClickedButtons(container);
      toast('Đã xoá danh sách nút đã click cho site này');
    };
  }
}

function renderSettings(container) {
  var totalStreams = urls.size;
  var bookmarkletCode = "javascript:(function(){var s=document.createElement('script');s.src='https://cdn.jsdelivr.net/gh/nguyenquocngu93/bookmarklet-@main/umpdl.js?force='+Date.now();document.head.appendChild(s);})();";

  container.innerHTML =
    '<div class="uvd-profile-card">' +
      '<div class="uvd-profile-avatar">NQ</div>' +
      '<div class="uvd-profile-info">' +
        '<div class="uvd-profile-name">nguyenquocngu91</div>' +
        '<div class="uvd-profile-role">Bookmarklet Developer · Universal Media Tools</div>' +
        '<div class="uvd-profile-tags">' +
          '<span class="uvd-tag">UMP DL v' + VERSION + ' PRO</span>' +
          '<span class="uvd-tag">Vanilla JS</span>' +
          '<span class="uvd-tag">HLS · M3U8</span>' +
          '<span class="uvd-tag">Adblock</span>' +
          '<span class="uvd-tag">Resume · Tua đúp · PiP</span>' +
        '</div>' +
      '</div>' +
    '</div>' +

    '<div class="uvd-profile-stats" style="grid-template-columns:repeat(4,1fr);">' +
      '<div class="uvd-stat"><div class="uvd-stat-num">' + totalStreams + '</div><div class="uvd-stat-label">Streams</div></div>' +
      '<div class="uvd-stat"><div class="uvd-stat-num">' + data.favorites.length + '</div><div class="uvd-stat-label">Yêu thích</div></div>' +
      '<div class="uvd-stat"><div class="uvd-stat-num">' + (data.history||[]).length + '</div><div class="uvd-stat-label">Lịch sử</div></div>' +
      '<div class="uvd-stat"><div class="uvd-stat-num" style="color:#ff5d72;">' + __uvdBlockedCount + '</div><div class="uvd-stat-label">Đã chặn popup</div></div>' +
    '</div>' +

    '<div class="uvd-card">' +
      '<div style="font-weight:600;margin-bottom:8px;">⚡ Hiệu năng</div>' +
      buildToggleRow('__uvd_toggle_reducemotion__', 'Bật chế độ hiệu suất (giảm hiệu ứng)', data.settings.reduceMotion) +
      '<div style="font-size:12px;color:var(--text2);margin:10px 0 4px;">Cường độ làm mờ (blur): <span id="__uvd_blur_val__">' + data.settings.blurIntensity + 'px</span></div>' +
      '<input type="range" id="__uvd_blur_range__" min="0" max="30" step="1" value="' + data.settings.blurIntensity + '" style="width:100%;">' +
      '<div style="font-size:12px;color:var(--text2);margin:10px 0 4px;">Tốc độ chuyển tiếp: <span id="__uvd_transition_val__">' + data.settings.transitionSpeed + 's</span></div>' +
      '<input type="range" id="__uvd_transition_range__" min="0" max="0.8" step="0.05" value="' + data.settings.transitionSpeed + '" style="width:100%;">' +
      '<div style="font-size:11px;color:var(--text3);margin-top:6px;">Giảm blur và tốc độ transition để máy chạy mượt hơn.</div>' +
    '</div>' +

    '<div class="uvd-card">' +
      '<div style="font-weight:600;margin-bottom:8px;">✨ Hiệu ứng giao diện</div>' +
      buildToggleRow('__uvd_toggle_glow__', 'Hiệu ứng phát sáng (glow) cho nút & panel', data.settings.glowEffects) +
      '<div style="font-size:12px;color:var(--text2);margin:10px 0 4px;">Cường độ hiệu ứng: <span id="__uvd_fx_val__">' + data.settings.effectsIntensity + '%</span></div>' +
      '<input type="range" id="__uvd_fx_range__" min="0" max="100" step="5" value="' + data.settings.effectsIntensity + '" style="width:100%;">' +
      '<div style="font-size:11px;color:var(--text3);margin-top:6px;">Tắt hoàn toàn nếu đã bật chế độ hiệu suất ở trên.</div>' +
    '</div>' +

    '<div class="uvd-card">' +
      '<div style="font-weight:600;margin-bottom:8px;">⛔ Chặn tự phát</div>' +
      buildToggleRow('__uvd_toggle_blockautoplay__', 'Chặn mạnh web tự mở/phát video sau khi chạy script', data.settings.blockAutoplay) +
      '<div style="font-size:11px;color:var(--text3);margin-top:6px;">Video/audio do chính trang web tự bật (quảng cáo, autoplay ẩn...) sẽ luôn bị tạm dừng ngay. Video mở qua UMP DL Player không bị ảnh hưởng.</div>' +
    '</div>' +

    '<div class="uvd-card">' +
      '<div style="font-weight:600;margin-bottom:8px;">🛡️ Lọc quảng cáo (Filterlist)</div>' +
      '<div style="font-size:12px;color:var(--text2);margin-bottom:8px;">' +
        'Nhập mỗi dòng một từ khóa hoặc domain (vd: <code>doubleclick.net</code>). Hỗ trợ regex nếu bắt đầu bằng <code>regex:</code>. Các URL chứa pattern sẽ bị bỏ qua.' +
      '</div>' +
      '<textarea id="__uvd_filter_text__" style="width:100%;height:80px;background:rgba(0,0,0,0.5);border:1px solid var(--border);border-radius:10px;color:var(--text);padding:12px;font-size:12px;">' + escapeHtml((data.filterlist||[]).join('\n')) + '</textarea>' +
      '<div class="uvd-grid-2" style="margin-top:8px;">' +
        '<button class="uvd-btn uvd-btn-sm" id="__uvd_save_filter__">💾 Lưu</button>' +
        '<button class="uvd-btn uvd-btn-sm" id="__uvd_import_filter__">📂 Import file</button>' +
      '</div>' +
      '<div style="margin-top:6px;font-size:11px;color:var(--text3);">Đã chặn <span id="__uvd_blocked_ads__">' + __uvdAdBlockedCount + '</span> URL quảng cáo trong phiên này.</div>' +
    '</div>' +

    '<div class="uvd-card">' +
      '<div style="font-weight:600;margin-bottom:8px;">Sao lưu & Khôi phục</div>' +
      '<button class="uvd-btn uvd-btn-sm" id="__uvd_backup__" style="width:100%;margin-bottom:6px;">Xuất dữ liệu</button>' +
      '<button class="uvd-btn uvd-btn-sm" id="__uvd_restore__" style="width:100%;margin-bottom:6px;">Nhập dữ liệu</button>' +
      '<button class="uvd-btn uvd-btn-sm" id="__uvd_reset__" style="width:100%;background:var(--danger);">Đặt lại tất cả</button>' +
    '</div>' +

    '<div class="uvd-section-title"><span class="uvd-section-num">1</span> Cài đặt Bookmarklet</div>' +
    '<div class="uvd-card uvd-timeline-card">' +
      '<div class="uvd-step"><span class="uvd-step-num">1</span><span class="uvd-step-text">Mở một trang web bất kỳ, bấm vào biểu tượng <strong>⭐ Bookmark</strong> trên thanh địa chỉ.</span></div>' +
      '<div class="uvd-step"><span class="uvd-step-num">2</span><span class="uvd-step-text">Chọn <strong>"Chỉnh sửa"</strong> (Edit).</span></div>' +
      '<div class="uvd-step"><span class="uvd-step-num">3</span><span class="uvd-step-text"><strong>Đặt tên</strong> dễ nhớ, ví dụ: <code class="uvd-inline-code">UMP DL</code></span></div>' +
      '<div class="uvd-step"><span class="uvd-step-num">4</span><span class="uvd-step-text"><strong>Xóa toàn bộ địa chỉ</strong> trong ô URL, dán đoạn code sau vào:</span></div>' +
      '<div class="uvd-code-block"><textarea readonly rows="3">' + escapeHtml(bookmarkletCode) + '</textarea><button class="uvd-code-copy" data-copy-target="bookmarklet" title="Sao chép">📋</button></div>' +
      '<div class="uvd-step"><span class="uvd-step-num">5</span><span class="uvd-step-text">Bấm <strong>Lưu</strong> (Save).</span></div>' +
      '<div class="uvd-callout"><span class="uvd-callout-icon">💡</span><span>Từ lần sau, bạn chỉ cần gõ tên bookmark (<strong style="color:var(--accent);">UMP DL</strong>) vào thanh địa chỉ rồi chọn nó để kích hoạt. Script luôn tự động cập nhật phiên bản mới nhất.</span></div>' +
    '</div>' +

    '<div class="uvd-section-title"><span class="uvd-section-num">2</span> Sử dụng</div>' +
    '<div class="uvd-card uvd-timeline-card">' +
      '<div class="uvd-step"><span class="uvd-step-num">•</span><span class="uvd-step-text">Mở trang web có video</span></div>' +
      '<div class="uvd-step"><span class="uvd-step-num">•</span><span class="uvd-step-text">Gõ tên bookmark (vd: <code class="uvd-inline-code">UMP DL</code>) vào thanh địa chỉ và chọn nó</span></div>' +
      '<div class="uvd-step"><span class="uvd-step-num">•</span><span class="uvd-step-text">Chọn stream và bấm <strong style="color:var(--accent);">Xem</strong> để mở player overlay</span></div>' +
      '<div class="uvd-step"><span class="uvd-step-num">•</span><span class="uvd-step-text">Trong player: thanh công cụ gồm <strong style="color:var(--accent);">Chất lượng</strong>, <strong style="color:var(--accent);">Tốc độ (+/-)</strong>, <strong style="color:var(--accent);">Toàn màn hình</strong>, <strong style="color:var(--accent);">PiP</strong>, <strong style="color:var(--accent);">Hẹn giờ</strong>, <strong style="color:var(--accent);">Boost</strong>, <strong style="color:var(--accent);">Mute</strong>, <strong style="color:var(--accent);">📷 Screenshot</strong>, <strong style="color:var(--accent);">📌 Ghim</strong></span></div>' +
      '<div class="uvd-step"><span class="uvd-step-num">•</span><span class="uvd-step-text">Chạm đúp 2 lần vào nửa trái/phải video để tua lùi/tiến (số giây tùy chỉnh trong tab Trình phát)</span></div>' +
      '<div class="uvd-step"><span class="uvd-step-num">•</span><span class="uvd-step-text">Click vào thời gian để chuyển đổi giữa <strong>còn lại</strong> / <strong>đã qua</strong> / <strong>tổng</strong>.</span></div>' +
      '<div class="uvd-callout"><span class="uvd-callout-icon">▶</span><span>Nút <strong style="color:var(--accent);">▶</strong> trên header: tự động bấm giúp các nút Play ẩn để link stream lộ ra. Nếu không ăn, đặt CSS selector riêng ở dòng "Play selector".</span></div>' +
    '</div>' +

    '<div class="uvd-section-title"><span class="uvd-section-num">3</span> Tải video với yt-dlp và Termux</div>' +
    '<div class="uvd-card uvd-timeline-card">' +
      '<div class="uvd-step"><span class="uvd-step-num">1</span><span class="uvd-step-text"><strong>Cài đặt yt-dlp trên Termux:</strong></span></div>' +
      '<code class="uvd-inline-code" style="display:block;margin:4px 0;">pkg update && pkg upgrade -y</code>' +
      '<code class="uvd-inline-code" style="display:block;margin:4px 0;">pkg install python ffmpeg -y</code>' +
      '<code class="uvd-inline-code" style="display:block;margin:4px 0 10px;">pip install yt-dlp</code>' +
      '<div class="uvd-step"><span class="uvd-step-num">2</span><span class="uvd-step-text">Mở tab <strong style="color:var(--accent);">Streams</strong>, chọn stream cần tải</span></div>' +
      '<div class="uvd-step"><span class="uvd-step-num">3</span><span class="uvd-step-text">Bấm <strong style="color:var(--accent);">Lệnh tải</strong> → chọn lệnh phù hợp, sao chép</span></div>' +
      '<div class="uvd-step"><span class="uvd-step-num">4</span><span class="uvd-step-text">Mở Termux, dán lệnh vào và bấm Enter để tải</span></div>' +
      '<div class="uvd-callout uvd-callout-warn"><span class="uvd-callout-icon">⚠️</span><span><strong style="color:var(--text);">Lưu ý:</strong> Nhớ cấp quyền lưu file cho Termux (Android 11+): <code class="uvd-inline-code">termux-setup-storage</code></span></div>' +
    '</div>' +

    '<div class="uvd-profile-footer">© ' + new Date().getFullYear() + ' nguyenquocngu91 · UMP DL v' + VERSION + ' · Made for Chrome Android</div>';

  container.querySelectorAll('.uvd-btn').forEach(function(b) { b.addEventListener('click', addRipple); });

  container.querySelectorAll('.uvd-code-copy').forEach(function(b) {
    b.onclick = function() {
      if (this.dataset.copyTarget === 'bookmarklet') { copy(bookmarkletCode); toast('Đã sao chép code bookmarklet!'); }
    };
  });

  document.getElementById('__uvd_toggle_reducemotion__').onclick = function() {
    var isOn = this.classList.toggle('uvd-toggle-on');
    data.settings.reduceMotion = isOn;
    storage.set(data);
    applyMotionPref(document.getElementById('__uvd__'));
    toast(isOn ? 'Đã bật chế độ hiệu suất' : 'Đã tắt chế độ hiệu suất');
  };

  document.getElementById('__uvd_blur_range__').oninput = function() {
    var val = parseInt(this.value);
    data.settings.blurIntensity = val;
    document.getElementById('__uvd_blur_val__').textContent = val + 'px';
    storage.set(data);
    applyMotionPref(document.getElementById('__uvd__'));
  };

  document.getElementById('__uvd_transition_range__').oninput = function() {
    var val = parseFloat(this.value);
    data.settings.transitionSpeed = val;
    document.getElementById('__uvd_transition_val__').textContent = val + 's';
    storage.set(data);
    applyMotionPref(document.getElementById('__uvd__'));
  };

  document.getElementById('__uvd_toggle_glow__').onclick = function() {
    var isOn = this.classList.toggle('uvd-toggle-on');
    data.settings.glowEffects = isOn;
    storage.set(data);
    applyEffectsPref(document.getElementById('__uvd__'));
    if (playerState.overlay) applyEffectsPref(playerState.overlay);
    toast(isOn ? 'Đã bật hiệu ứng phát sáng' : 'Đã tắt hiệu ứng phát sáng');
  };

  document.getElementById('__uvd_fx_range__').oninput = function() {
    var val = parseInt(this.value);
    data.settings.effectsIntensity = val;
    document.getElementById('__uvd_fx_val__').textContent = val + '%';
    storage.set(data);
    applyEffectsPref(document.getElementById('__uvd__'));
    if (playerState.overlay) applyEffectsPref(playerState.overlay);
  };

  document.getElementById('__uvd_toggle_blockautoplay__').onclick = function() {
    var isOn = this.classList.toggle('uvd-toggle-on');
    data.settings.blockAutoplay = isOn;
    storage.set(data);
    if (isOn) { try { document.querySelectorAll('video,audio').forEach(__uvdNeutralizeMedia); } catch(e) {} }
    toast(isOn ? 'Đã bật chặn tự phát (mạnh)' : 'Đã tắt chặn tự phát');
  };

  document.getElementById('__uvd_backup__').onclick = function() {
    var blob = new Blob([JSON.stringify(data)],{type:'application/json'});
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'uvd_backup.json'; a.click();
  };
  
  document.getElementById('__uvd_restore__').onclick = function() {
    var inp = document.createElement('input'); inp.type='file'; inp.accept='.json';
    inp.onchange = function(e) {
      var reader = new FileReader();
      reader.onload = function(ev) {
        try { data = Object.assign(data, JSON.parse(ev.target.result)); storage.set(data); toast('Đã nhập!'); buildUI(); }
        catch(ex) { toast('File không hợp lệ','var(--danger)'); }
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

  document.getElementById('__uvd_save_filter__').onclick = function() {
    var raw = document.getElementById('__uvd_filter_text__').value;
    data.filterlist = raw.split('\n').map(function(s) { return s.trim(); }).filter(Boolean);
    storage.set(data);
    compileAdFilters();
    toast('Đã lưu filterlist (' + data.filterlist.length + ' mục) · áp dụng ngay');
    buildUI();
  };

  document.getElementById('__uvd_import_filter__').onclick = function() {
    var inp = document.createElement('input'); inp.type='file'; inp.accept='.txt,.json';
    inp.onchange = function(e) {
      var reader = new FileReader();
      reader.onload = function(ev) {
        var text = ev.target.result;
        try {
          var j = JSON.parse(text);
          if (Array.isArray(j.filterlist)) text = j.filterlist.join('\n');
        } catch(ex) {}
        document.getElementById('__uvd_filter_text__').value = text;
      };
      reader.readAsText(e.target.files[0]);
    };
    inp.click();
  };
}

// ========== START ==========
buildUI();

console.log('V' + VERSION + ' UMP DL PRO - Tối ưu hiệu năng, bảo mật, thêm tìm kiếm, ghim, speed +/-');
toast('V' + VERSION + ' PRO sẵn sàng!');

})();

