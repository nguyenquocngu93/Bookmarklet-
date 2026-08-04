/*
 * Mèo cào media – KKPhim / PhimAPI companion
 * Loaded on demand by bookmark.js. No API key, no proxy key, no scraping.
 */
(function() {
  'use strict';
  if (window.__uvdKkphim) return;

  var API = 'https://phimapi.com';
  var state = { overlay: null, page: 1, items: [], query: '', detail: null };
  function ensureStyle() {
    if (document.getElementById('__uvd_kkphim_css__')) return;
    var style = document.createElement('style');
    style.id = '__uvd_kkphim_css__';
    style.textContent = '.uvd-kk-overlay{position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;padding:14px;background:rgba(28,14,40,.62);backdrop-filter:blur(9px);-webkit-backdrop-filter:blur(9px);font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif}.uvd-kk-sheet{position:relative;width:min(100%,520px);max-height:90dvh;display:flex;flex-direction:column;overflow:hidden;padding:20px;border-radius:30px;background:linear-gradient(155deg,#fff9fd,#fff0f8 55%,#f3edff);border:1px solid rgba(255,255,255,.92);box-shadow:0 28px 70px rgba(108,46,92,.4),0 0 0 6px rgba(255,255,255,.22) inset}.uvd-kk-close{position:absolute;right:14px;top:14px;width:34px;height:34px;border:1px solid rgba(255,159,180,.25);border-radius:50%;background:#fff;color:#d85c7a;font-size:20px;cursor:pointer}.uvd-kk-head{display:flex;align-items:center;gap:10px;padding-right:42px}.uvd-kk-mascot{width:50px;height:50px;display:flex;align-items:center;justify-content:center;border-radius:18px;background:linear-gradient(135deg,#ffe3ec,#e8d8ff);font-size:26px}.uvd-kk-kicker{font-size:9px;font-weight:900;letter-spacing:.1em;text-transform:uppercase;color:#a56dac}.uvd-kk-title{font-size:20px;font-weight:900;color:#c95073}.uvd-kk-search{display:flex;gap:7px;margin:14px 0 10px}.uvd-kk-search input{min-width:0;flex:1;padding:10px 12px;border:1px solid rgba(194,150,255,.32);border-radius:14px;background:rgba(255,255,255,.75);color:#765b88;font-size:12px}.uvd-kk-search button{padding:10px 14px;border:0;border-radius:14px;background:linear-gradient(135deg,#ff9fb4,#b385f2);color:#fff;font-weight:850;cursor:pointer}.uvd-kk-content{min-height:0;flex:1;overflow-y:auto;padding:2px}.uvd-kk-loading{min-height:180px;display:flex;align-items:center;justify-content:center;text-align:center;color:#8a6ab0;font-size:13px;font-weight:700}.uvd-kk-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px}.uvd-kk-card{min-width:0;padding:0;overflow:hidden;border:1px solid rgba(255,159,180,.25);border-radius:16px;background:rgba(255,255,255,.74);text-align:left;cursor:pointer}.uvd-kk-poster{display:block;height:116px;background:linear-gradient(135deg,#ffe3ec,#e8d8ff);font-size:28px;text-align:center;line-height:116px}.uvd-kk-poster img{width:100%;height:100%;object-fit:cover;display:block}.uvd-kk-card-name{display:block;overflow:hidden;padding:7px 8px 0;color:#704f80;font-size:11px;font-weight:850;white-space:nowrap;text-overflow:ellipsis}.uvd-kk-card-meta{display:block;overflow:hidden;padding:3px 8px 8px;color:#a0789d;font-size:9px;white-space:nowrap;text-overflow:ellipsis}.uvd-kk-pager{display:flex;align-items:center;justify-content:center;gap:10px;padding-top:10px;color:#8a6ab0;font-size:10px;font-weight:850}.uvd-kk-pager button{width:30px;height:28px;border:1px solid rgba(194,150,255,.28);border-radius:9px;background:#fff;color:#8a6ab0;font-weight:900;cursor:pointer}.uvd-kk-pager button:disabled{opacity:.35}.uvd-kk-back{margin:2px 0 10px;padding:7px 10px;border:0;border-radius:10px;background:rgba(194,150,255,.12);color:#8a6ab0;font-size:11px;font-weight:800;cursor:pointer}.uvd-kk-detail{display:grid;grid-template-columns:92px minmax(0,1fr);gap:11px;padding:10px;border-radius:18px;background:rgba(255,255,255,.65);border:1px solid rgba(255,159,180,.2)}.uvd-kk-detail-poster{height:124px;overflow:hidden;border-radius:12px;background:#f4e8ff}.uvd-kk-detail-poster img{width:100%;height:100%;object-fit:cover}.uvd-kk-detail-title{color:#c95073;font-size:15px;font-weight:900}.uvd-kk-detail-meta{margin-top:4px;color:#8a6ab0;font-size:10px;font-weight:800}.uvd-kk-detail-desc{display:-webkit-box;overflow:hidden;margin-top:6px;color:#795d7e;font-size:10.5px;line-height:1.45;-webkit-line-clamp:4;-webkit-box-orient:vertical}.uvd-kk-episodes-title{margin:13px 2px 7px;color:#8a6ab0;font-size:12px;font-weight:900}.uvd-kk-episodes{display:flex;flex-wrap:wrap;gap:6px}.uvd-kk-episode{padding:8px 10px;border:1px solid rgba(194,150,255,.26);border-radius:11px;background:#fff;color:#745887;font-size:10px;font-weight:850;cursor:pointer}.uvd-kk-episode small{display:block;margin-top:2px;color:#b68bea;font-size:8px;font-weight:700}@media(max-width:390px){.uvd-kk-sheet{padding:16px;border-radius:25px}.uvd-kk-grid{gap:7px}.uvd-kk-poster{height:100px;line-height:100px}.uvd-kk-detail{grid-template-columns:78px minmax(0,1fr)}.uvd-kk-detail-poster{height:108px}}';
    document.head.appendChild(style);
  }

  function bridge() { return window.__uvdKkphimBridge || {}; }
  function esc(text) {
    var d = document.createElement('div');
    d.textContent = String(text || '');
    return d.innerHTML;
  }
  function json(url) {
    return fetch(url, { cache: 'no-store' }).then(function(r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    });
  }
  function mount() {
    ensureStyle();
    var old = document.getElementById('__uvd_kkphim__');
    if (old) old.remove();
    if (bridge().hideUi) bridge().hideUi();
    var overlay = document.createElement('div');
    overlay.id = '__uvd_kkphim__';
    overlay.className = 'uvd-kk-overlay uvd-scope';
    overlay.innerHTML = '<div class="uvd-kk-sheet"><button class="uvd-kk-close" title="Đóng">✕</button><div class="uvd-kk-head"><div class="uvd-kk-mascot">🍿</div><div><div class="uvd-kk-kicker">phimapi.com × mèo cào</div><div class="uvd-kk-title">Góc phim Việt nè ♡</div></div></div><div class="uvd-kk-search"><input id="__uvd_kk_query__" placeholder="Tìm tên phim..."><button id="__uvd_kk_search__">Tìm</button></div><div id="__uvd_kk_content__" class="uvd-kk-content"></div><div id="__uvd_kk_pager__" class="uvd-kk-pager"></div></div>';
    (document.body || document.documentElement).appendChild(overlay);
    state.overlay = overlay;
    overlay.querySelector('.uvd-kk-close').onclick = close;
    overlay.addEventListener('click', function(e) { if (e.target === overlay) close(); });
    var input = overlay.querySelector('#__uvd_kk_query__');
    overlay.querySelector('#__uvd_kk_search__').onclick = function() { loadSearch(input.value); };
    input.addEventListener('keydown', function(e) { if (e.key === 'Enter') loadSearch(input.value); });
    loadRecent(1);
  }
  function close() {
    if (state.overlay && state.overlay.parentNode) state.overlay.remove();
    state.overlay = null;
    if (bridge().restoreUi) bridge().restoreUi();
  }
  function content() { return state.overlay && state.overlay.querySelector('#__uvd_kk_content__'); }
  function pager() { return state.overlay && state.overlay.querySelector('#__uvd_kk_pager__'); }
  function loading(text) {
    var el = content(); if (!el) return;
    el.innerHTML = '<div class="uvd-kk-loading">✨ ' + esc(text || 'Đang tìm phim...') + '</div>';
    var p = pager(); if (p) p.innerHTML = '';
  }
  function loadRecent(page) {
    state.page = page || 1; state.query = ''; state.detail = null;
    loading('Đang lấy phim mới cập nhật...');
    json(API + '/danh-sach/phim-moi-cap-nhat?page=' + state.page)
      .then(function(data) { state.items = data.items || []; renderList(state.items, data.pagination || {}); })
      .catch(function(err) { showError('Không lấy được danh sách KKPhim: ' + err.message); });
  }
  function loadSearch(keyword) {
    keyword = String(keyword || '').trim();
    if (!keyword) { loadRecent(1); return; }
    state.query = keyword; state.detail = null;
    loading('Đang tìm “' + keyword + '”...');
    // Search is available on PhimAPI v1. If its response changes, fall back
    // to a client-side search over the current recent list instead of failing.
    json(API + '/v1/api/tim-kiem?keyword=' + encodeURIComponent(keyword))
      .then(function(data) {
        var found = (data.data && data.data.items) || data.items || [];
        if (!found.length) found = state.items.filter(function(item) { return (item.name || '').toLowerCase().indexOf(keyword.toLowerCase()) !== -1; });
        renderList(found, {});
      })
      .catch(function() {
        var found = state.items.filter(function(item) { return ((item.name || '') + ' ' + (item.origin_name || '')).toLowerCase().indexOf(keyword.toLowerCase()) !== -1; });
        renderList(found, {});
      });
  }
  function renderList(items, meta) {
    var el = content(); if (!el) return;
    if (!items.length) { el.innerHTML = '<div class="uvd-kk-loading">🥺 Chưa thấy phim này. Thử tên ngắn hơn nha.</div>'; return; }
    el.innerHTML = '<div class="uvd-kk-grid">' + items.slice(0, 18).map(function(item) {
      var image = item.thumb_url || item.poster_url || '';
      return '<button class="uvd-kk-card" data-slug="' + esc(item.slug) + '"><span class="uvd-kk-poster">' + (image ? '<img src="' + esc(image) + '" alt="">' : '🎬') + '</span><span class="uvd-kk-card-name">' + esc(item.name) + '</span><span class="uvd-kk-card-meta">' + esc(item.year || '') + (item.origin_name ? ' · ' + esc(item.origin_name) : '') + '</span></button>';
    }).join('') + '</div>';
    el.querySelectorAll('[data-slug]').forEach(function(btn) { btn.onclick = function() { loadMovie(btn.dataset.slug); }; });
    var p = pager();
    if (p) {
      var current = Number(meta.currentPage || state.page || 1), total = Number(meta.totalPages || 0);
      p.innerHTML = !state.query && total > 1 ? '<button id="__uvd_kk_prev__"' + (current <= 1 ? ' disabled' : '') + '>←</button><span>Trang ' + current + ' / ' + total + '</span><button id="__uvd_kk_next__"' + (current >= total ? ' disabled' : '') + '>→</button>' : '';
      var prev = p.querySelector('#__uvd_kk_prev__'), next = p.querySelector('#__uvd_kk_next__');
      if (prev) prev.onclick = function() { loadRecent(current - 1); };
      if (next) next.onclick = function() { loadRecent(current + 1); };
    }
  }
  function loadMovie(slug) {
    loading('Đang mở thông tin phim...');
    json(API + '/phim/' + encodeURIComponent(slug))
      .then(function(data) { state.detail = data; renderMovie(data); })
      .catch(function(err) { showError('Không mở được phim: ' + err.message); });
  }
  function renderMovie(data) {
    var el = content(); if (!el) return;
    var movie = data.movie || {};
    var servers = data.episodes || [];
    var image = movie.thumb_url || movie.poster_url || '';
    var eps = [];
    servers.forEach(function(server) {
      (server.server_data || []).forEach(function(ep) { eps.push({ server: server.server_name || 'Server', episode: ep }); });
    });
    el.innerHTML = '<button class="uvd-kk-back">← Danh sách phim</button><div class="uvd-kk-detail"><div class="uvd-kk-detail-poster">' + (image ? '<img src="' + esc(image) + '" alt="">' : '🎬') + '</div><div><div class="uvd-kk-detail-title">' + esc(movie.name || 'Phim không tên') + '</div><div class="uvd-kk-detail-meta">' + esc([movie.year, movie.quality, movie.lang, movie.episode_current].filter(Boolean).join(' · ')) + '</div><div class="uvd-kk-detail-desc">' + esc(String(movie.content || '').replace(/<[^>]+>/g, '').slice(0, 260)) + '</div></div></div><div class="uvd-kk-episodes-title">Chọn tập để mở bằng Mèo cào</div><div class="uvd-kk-episodes">' + eps.map(function(item, index) {
      var ep = item.episode || {};
      return '<button class="uvd-kk-episode" data-ep="' + index + '"><span>' + esc(ep.name || ('Tập ' + (index + 1))) + '</span><small>' + esc(item.server) + '</small></button>';
    }).join('') + '</div>';
    el.querySelector('.uvd-kk-back').onclick = function() { loadRecent(state.page); };
    el.querySelectorAll('[data-ep]').forEach(function(btn) {
      btn.onclick = function() {
        var item = eps[Number(btn.dataset.ep)];
        if (!item) return;
        var ep = item.episode || {};
        if (!ep.link_m3u8) { showError('Tập này chưa có link M3U8 công khai.'); return; }
        if (bridge().openEpisode) bridge().openEpisode(movie, ep);
        close();
      };
    });
    var p = pager(); if (p) p.innerHTML = '';
  }
  function showError(message) { var el = content(); if (el) el.innerHTML = '<div class="uvd-kk-loading">🥺 ' + esc(message) + '</div>'; }
  window.__uvdKkphim = { open: mount, close: close };
})();
