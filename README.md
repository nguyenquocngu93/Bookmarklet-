# UMP DL Bookmarklet – Nhật ký dự án

## Trạng thái hiện tại

**Hướng userscript/iframe đã tạm gác lại.** Tiếp tục phát triển bản bookmarklet chạy ổn định trong trang mẹ.

File nguồn bookmarklet hiện tại:

```text
bookmark.js
```

File Render đang phục vụ:

```text
render-header-proxy/bookmarklet.js
```

Hai file hiện đã được đồng bộ.

> **Cập nhật 2026-08-02:** Đã thử build userscript lại một lần nữa nhưng vẫn
> không ổn (giới hạn sniff network của JavaScript trong iframe cross-origin,
> không thể đạt mức như Via Browser ở tầng native WebView). **Chốt hướng chính
> thức: chỉ phát triển bookmarklet.** Các file userscript chỉ còn là tài liệu
> tham khảo, không sửa nữa.

## Nhật ký patch

> Nhật ký các thay đổi theo từng phiên làm việc, ghi rõ nội dung để người sau
> đọc lại hiểu được tiến trình mà không cần đoán từ commit. **Không tạo pull
> request** — thay đổi được đẩy trực tiếp lên branch `arena/*` tương ứng.

### Patch #1 — AI lọc iframe rác (hybrid: heuristic + Gemini/OpenAI) — 2026-08-02

- **Branch:** `arena/019f7b7f-bookmarklet` (commit `a710faf` "patch update").
- **Mục tiêu:** Trang phim nhúng nhiều iframe (quảng cáo, popup, tracker) cạnh
  iframe player thật. M3U8/MP4 lọc theo đuôi dễ, nhưng iframe không biết trước
  chứa gì do **cross-origin**. Cần phân loại iframe "chuẩn" vs iframe rác.
- **Giải pháp hybrid:**
  - **Tầng heuristic (offline, bật sẵn):** hàm `__uvdClassifyIframe` chấm điểm
    từng iframe → nhãn `PLAYER / UNKNOWN / JUNK`, dựa trên: host player đã biết,
    marker rác, kích thước/tỉ lệ/ẩn hiện, và **bằng chứng mạng** (`__uvdMediaEvidence`
    — mọi media URL thấy ở trang mẹ được nhóm theo host; host iframe trùng host
    media → gần chắc chắn là player thật).
  - **Tầng LLM (hybrid, tuỳ chọn):** endpoint mới `POST /classify` trên
    `render-header-proxy/server.js`. Server đọc key từ env, **không nhét key vào
    source**: `GEMINI_API_KEY` (ưu tiên) + `GEMINI_MODEL` (mặc định
    `gemini-2.0-flash`), hoặc `OPENAI_API_KEY` + `AI_BASE_URL` + `AI_MODEL`
    (mặc định `gpt-4o-mini`). Không có key → trả `configured:false` → bookmarklet
    tự dùng heuristic offline.
- **File thay đổi:**
  - `bookmark.js` và `render-header-proxy/bookmarklet.js` (đồng bộ):
    - Thêm settings `aiIframeFilter` (mặc định `true`), `llmProxyUrl`.
    - Thêm `__uvdMediaEvidence` + `__uvdFeedMediaEvidence` (bằng chứng mạng).
    - Thêm `__uvdClassifyIframe` + marker rác `__uvdAiJunkMarkers` + host player
      `__uvdKnownPlayerHosts`.
    - Thêm `__uvdAskAiClassifyIframes` (gọi `/classify` khi có proxy).
    - Kích hoạt `__uvdMaybeOfferIframeWorkflow` (trước đây định nghĩa nhưng
      chưa từng được gọi) — lên lịch sau 10s khi boot.
    - Badge AI trên thẻ iframe (`PLAYER ✓ / JUNK ✗ / UNKNOWN ?`), thẻ JUNK bị
      làm mờ; **không tự xóa** iframe nào.
    - Cài đặt mới: toggle "Bật AI/heuristic lọc iframe rác" + ô nhập "LLM proxy".
  - `render-header-proxy/server.js`: thêm `POST /classify` (Gemini ưu tiên,
    fallback OpenAI), cập nhật CORS cho phép `POST`.
  - `README.md`: thêm mục này + mô tả tính năng.
- **Kết quả kiểm tra:** `node --check` OK cả 2 file bookmarklet + server;
  `bookmark.js` = `render-header-proxy/bookmarklet.js`; `git diff --check` sạch.
- **Cách bật AI thật:** đặt `GEMINI_API_KEY` (và tuỳ chọn `GEMINI_MODEL`) làm
  env trên Render, rồi dán URL proxy vào Cài đặt UMP → ô "LLM proxy".

### Patch #2 — Popup iframe cute + làm tối web nổi bật — 2026-08-02

- **Branch:** `arena/019f7b7f-bookmarklet` + `arena/019fc298-bookmarklet`.
- **Mục tiêu:** Khi trang chỉ có iframe (chưa thấy link video trực tiếp), thay
  popup cũ bằng một popup **cute, dễ thương, làm tối/blur toàn bộ web xung quanh**
  để thông báo nổi bật, có **ảnh minh hoạ** và hướng dẫn người dùng.
- **Nội dung thay đổi (chỉ trong `bookmark.js` / `render-header-proxy/bookmarklet.js`):**
  - Hàm `__uvdOpenIframeWorkflowPrompt` được thiết kế lại:
    - Overlay làm tối + blur nền (`rgba(12,8,20,.74)` + `backdrop-filter:blur(8px)`).
    - Panel gradient hồng nhạt, bo góc 26px, đổ bóng nổi, có nút ✕ đóng.
    - **Ảnh minh hoạ** kawaii mèo cầm kính lúp tìm kiếm (SVG inline, không cần
      file ngoài, không tốn request).
    - Thông báo rõ: **"Không có link video — chỉ có iframe 🥺"**, hướng dẫn
      "bấm vào iframe bên dưới, đợi nó phát, rồi chạy UMP DL lại một lần nữa để
      lấy link video thật."
    - Giữ danh sách iframe (kèm badge PLAYER/JUNK/UNKNOWN + nút "Mở + Copy"),
      thẻ JUNK mờ đi. Không tự xóa iframe.
  - Có thêm biến `__uvdIframeCuteArt` (SVG kawaii).
- **Kết quả:** `node --check` OK; `bookmark.js` = `render-header-proxy/bookmarklet.js`; `git diff --check` sạch.

### Patch #3 — Header cute + popup tự hiện lại khi quay lại trang — 2026-08-02

- **Branch:** `arena/019f7b7f-bookmarklet` + `arena/019fc298-bookmarklet`.
- **Mục tiêu:**
  1. Thiết kế lại **header** của panel UMP DL theo phong cách **cute/kawaii** giống
     popup (mascot mèo, gradient pastel hồng, nút hồng).
  2. Sửa lỗi popup "chỉ có iframe" **dễ bị mất** khi người dùng mở iframe ở tab
     mới rồi quay lại trang cũ → giờ **tự hiện lại** khi quay về tab.
- **Nội dung thay đổi (chỉ trong `bookmark.js` / `render-header-proxy/bookmarklet.js`):**
  - **Header cute:** thêm mascot SVG kawaii (`__uvdHeaderMascot` — mèo tròn hồng),
    tiêu đề "UMP DL ♡", phụ đề "v{x} ✦ cute player · universal media 🎀", nút action
    đổi sang gradient hồng pastel. CSS mới khối `.uvd-brand-mark`, `.uvd-brand-name`,
    `.uvd-header-actions .uvd-btn-icon`.
  - **Popup tự hiện lại:** trong `installIframeWorkflowVideoWatcher` thêm listener
    `visibilitychange` → khi quay lại tab mà vẫn chỉ có iframe (chưa có video) thì
    gọi lại `__uvdMaybeOfferIframeWorkflow(true)` sau ~0.9s; thêm interval dự phòng
    45s. `__uvdMaybeOfferIframeWorkflow(force)` bỏ qua cờ "đã hỏi" khi `force`.
  - **Không làm phiền:** thêm `__uvdIframeWorkflowDismissedAt` — khi người dùng bấm
    "Để sau" / ✕ / bấm ra ngoài thì không hiện lại trong 60s. Nút "Mở + Copy"
    (mở iframe tab mới) KHÔNG tính là dismissed → quay lại sẽ hiện lại popup.
- **Kết quả:** `node --check` OK; `bookmark.js` = `render-header-proxy/bookmarklet.js`; `git diff --check` sạch.

### Patch #4 — Tự học iframe UNKNOWN + popup link video real (bunny 🐰) — 2026-08-02

- **Branch:** `arena/019f7b7f-bookmarklet` + `arena/019fc298-bookmarklet`.
- **Mục tiêu:**
  1. **Tự học** cho iframe class `UNKNOWN`: ghi nhớ verdict theo host qua nhiều phiên,
     thay vì luôn đoán mò.
  2. **Popup link video real:** khi đã lọc bỏ link rác và tìm thấy link video thật
     (M3U8/MP4/MPD/WEBM/BLOB/TS), hiện popup cute liệt kê các link để người dùng
     bấm "Xem" trực tiếp. Đổi mascot con vật mới (thỏ 🐰) cho mới mẻ.
- **Nội dung thay đổi (chỉ trong `bookmark.js` / `render-header-proxy/bookmarklet.js`):**
  - **Tự học:** thêm `data.learnedHosts` + `__uvdLearnIframe(host, verdict)` +
    `__uvdLearnedVerdict(host)` (cần ≥2 tín hiệu cùng loại mới khóa). Trong
    `__uvdClassifyIframe` check verdict đã học (`learned-player`/`learned-junk`)
    và ghi đè heuristic. Khi người dùng bấm "Mở + Copy" iframe → tự học `PLAYER`.
  - **Popup media:** thêm `__uvdMediaCuteArt` (thỏ kawaii cầm nút play), hàm
    `__uvdOpenMediaLinksPopup(streams)` liệt kê top-8 link với nút "▶ Xem"
    (gọi `window.__uvd_showPlayer`), cờ `__uvdMediaPopupShown`/`DismissedAt`.
    `__uvdMaybeOfferMediaPopup(force)` hiện popup khi có link thật.
  - **Kích hoạt:** gọi `__uvdMaybeOfferMediaPopup(false)` sau boot ~3.5s; khi quay
    lại tab (`visibilitychange`) nếu không còn iframe-only thì hiện media popup.
  - Popup media không mở chồng khi player đang mở; tôn trọng cooldown 60s khi bị
    đóng thủ công.
- **Kết quả:** `node --check` OK; `bookmark.js` = `render-header-proxy/bookmarklet.js`; `git diff --check` sạch.

### Patch #5 — Vote người dùng + tự học video + sync + fix popup bị đè — 2026-08-02

- **Branch:** `arena/019f7b7f-bookmarklet` + `arena/019fc298-bookmarklet`.
- **Mục tiêu:**
  1. **Hệ thống vote** cho iframe và video để cùng loại bỏ rác (nút cute ♥ / 💩).
  2. **Tự học video** theo host (tương tự iframe) để nhớ link tốt/rác.
  3. **Popup video ưu tiên** link có metadata & preview (chất lượng) lên đầu.
  4. **Fix popup bị UI đè** — popup giờ luôn nằm trên cùng.
  5. **Self-learning (iframe + video) được đồng bộ qua Supabase** (không chỉ localStorage).
- **Nội dung thay đổi (chỉ trong `bookmark.js` / `render-header-proxy/bookmarklet.js`):**
  - **Vote:** thêm `data.userVotes` + `__uvdVote`, `__uvdCastVote(url, 'up'|'down')`.
    Nút vote cute (♥ đáng yêu / 💩 rác) xuất hiện trong cả popup iframe và popup
    video. Vote đẩy vào `__uvdLearnIframe` + `learnedVideos`.
  - **Tự học video:** `data.learnedVideos` theo host; `__uvdVideoScore` chấm link
    (vote + metadata + master HLS). Popup video sort theo score → link có chất
    lượng/preview lên trước, kèm badge "✨ chất lượng" và dòng resolution.
  - **Fix bị đè:** cả 2 popup được append vào cuối `<body>` + `z-index:2147483647`
    → luôn nổi trên panel UMP.
  - **Sync:** `__uvdSyncPayload`/`__uvdSyncLoad` giờ gồm `userVotes`, `learnedHosts`,
    `learnedVideos` → tự học lan truyền qua bookmarklet riêng (Supabase).
- **Kết quả:** `node --check` OK; `bookmark.js` = `render-header-proxy/bookmarklet.js`; `git diff --check` sạch.

### Patch #6 — Fix popup bị UI che + bắt đầu UI cute (tab Streams) — 2026-08-02

- **Branch:** `arena/019f7b7f-bookmarklet` + `arena/019fc298-bookmarklet`.
- **Mục tiêu:**
  1. **Fix popup video/iframe bị che hoàn toàn** bởi UI: khi hiện popup thì **ẩn luôn
     UI panel** + hiện **nút gọi lại popup** (🐰/🎬). Áp dụng cho cả popup media và
     popup iframe.
  2. **Bắt đầu làm lại UI theo hướng cute**, bắt đầu từ **tab Streams**.
- **Nội dung thay đổi (chỉ trong `bookmark.js` / `render-header-proxy/bookmarklet.js`):**
  - **Fix popup:** thêm `__uvdHideUiForPopup()`, `__uvdRestoreUiAfterPopup()`,
    `__uvdPopupDismiss()`, `__uvdShowPopupReopenBtn(kind)` + `__uvdRemovePopupReopenBtn()`.
    Khi mở popup media/iframe → ẩn panel `#__uvd__` + hiện nút floating gọi lại.
    Khi đóng popup (✕ / Để sau / bấm ngoài) → khôi phục UI. Khi bấm "▶ Xem" →
    đóng popup, khôi phục UI, mở player.
  - **Tab Streams cute:** viết lại `buildStreamCardHTML` — card nền pastel hồng,
    badge emoji theo loại (🎬📼🖼️🌀📦), nhãn dễ thương ("chưa phải video trực tiếp",
    "mở nó ở tab mới rồi chạy lại UMP nha 🥺"), **nút vote ♥/💩 ngay trên card**
    (`__uvdVoteChips`, xử lý trong `renderStreams` onclick). Thêm CSS khối
    `.uvd-card.uvd-cute`, `.uvd-votechip`.
- **Kết quả:** `node --check` OK; `bookmark.js` = `render-header-proxy/bookmarklet.js`; `git diff --check` sạch.
- **Ghi chú:** đây là bước đầu của đợt "làm lại toàn bộ UI cute". Các tab khác
  (History, Settings...) sẽ được chuyển dần.

### Patch #7 — Layout cute: header pill, context pill, body pill, bỏ filter bar — 2026-08-02

- **Branch:** `arena/019f7b7f-bookmarklet` + `arena/019fc298-bookmarklet`.
- **Mục tiêu:** chỉnh dần UI sang tông cute, từng cục một (không đổi 1 lần quá tải):
  1. **Header** tách thành **1 cục bo tròn** (pill hồng pastel, bo 26px, bỏ border-bottom).
  2. **Phần thân 3 tab** (tabbar) thành pill bo tròn, tab active hồng.
  3. **Current session** thành **1 cục bo tròn có minh hoạ** (emoji mèo 🐱 trong
     khung tròn + nền tím pastel).
  4. **Xoá row lọc theo ngày/định dạng** (filter bar) vì đã có tính năng vote.
  5. **Body 3 tab** bọc thành **1 cục bo tròn** như popup (nền hồng nhạt, bo 26px).
  6. Đổi **icon m3u8** sang **📺 (TV)** — hạn chế icon có phần đen (trước là 🎬).
- **Nội dung thay đổi (chỉ trong `bookmark.js` / `render-header-proxy/bookmarklet.js`):**
  - `buildUI`: gỡ khối tạo `filterBar`; thêm `.uvd-context-emoji` 🐱 vào context bar;
    thêm class `uvd-body-cute` cho contentWrapper; `streamList` padding 12px.
  - `__uvdTypeEmoji`: M3U8/MPD → `📺`.
  - CSS khối "CUTE LAYOUT": header pill, context cute, body cute, tabbar/tab cute.
- **Kết quả:** `node --check` OK; `bookmark.js` = `render-header-proxy/bookmarklet.js`; `git diff --check` sạch.

### Patch #8 — Bỏ nền tổng, redesign tabbar, fix góc vuông khi cuộn, card popup cute — 2026-08-02

- **Branch:** `arena/019f7b7f-bookmarklet` + `arena/019fc298-bookmarklet`.
- **Mục tiêu:** hoàn thiện phần CSS của đợt "làm lại UI cute":
  1. **Xoá background tổng cũ** của app-shell (vì header/context/body đã là các cục
     pill riêng) → nền panel trong suốt, chỉ còn các cục bo tròn nổi.
  2. **Redesign cụm nút tab & chuyển tab**: tabbar nền hồng gradient, tab active
     hồng đậm có bóng, hover/ấn scale nhẹ.
  3. **Fix bug góc bị vuông khi cuộn**: dùng `overflow:hidden` + `mask-image`
     radial để bo góc body pill khi cuộn xuống.
  4. **Card video redesign theo hướng popup cute**: nền pastel, preview bo tròn,
     nút ▶ tròn hồng, badge/url-box/button đều hồng, scrollbar hồng.
- **Nội dung thay đổi (chỉ trong `bookmark.js` / `render-header-proxy/bookmarklet.js`):**
  - CSS khối "CUTE REDESIGN PATCH 8" ở cuối style:
    - `.uvd-app-shell` → `background:transparent`, bỏ border/shadow/padding, bỏ `::after`/liquid-bg.
    - `.uvd-body-cute` → `overflow:hidden` + `mask-image` fix góc vuông.
    - `.uvd-tabbar` / `.uvd-tab` / `.uvd-tab-active` / `.uvd-tab-indicator` mới.
    - `.uvd-card.uvd-cute`, `.uvd-thumb-play`, `.uvd-url-box`, `.uvd-btn` theo tông hồng.
    - Scrollbar hồng.
- **Kết quả:** `node --check` OK; `bookmark.js` = `render-header-proxy/bookmarklet.js`; `git diff --check` sạch.

### Patch #9 — Sửa trực tiếp CSS gốc (xoá hẳn nền tổng, dính header/tab/body, fix góc vuông) — 2026-08-02

- **Branch:** `arena/019f7b7f-bookmarklet` + `arena/019fc298-bookmarklet`.
- **Mục tiêu:** bỏ kiểu "ghi đè" gây lỗi, **sửa trực tiếp các rule CSS gốc**:
  1. **Xoá hẳn background tổng** app-shell trong CSS gốc (không chỉ ghi đè trong suốt).
  2. **Header + tab row + body dính nhau** (giảm khoảng cách, bỏ khoảng trống lớn).
  3. **Fix góc vuông khi cuộn** lên/xuống (body pill bo góc thật, không lòi vuông).
- **Nội dung thay đổi (chỉ trong `bookmark.js` / `render-header-proxy/bookmarklet.js`):**
  - Sửa trực tiếp rule gốc `.uvd-app-shell` (transparent, bỏ padding/border/radius tổng),
    `.uvd-app-shell::after` (ẩn), `.uvd-app-shell #__uvd_header__` (pill hồng, margin dưới 8px),
    `.uvd-tabbar` (pill hồng, margin dưới 8px), `.uvd-context-bar` (pill tím, margin dưới 8px),
    `.uvd-tab-indicator` + `.uvd-tab-active` (hồng), `.uvd-body-cute` (bo góc + overflow hidden + mask),
    `.uvd-app-shell #__uvd_stream_list__` (bo góc + scroll).
  - Xoá block override "CUTE REDESIGN PATCH 8" (layout cũ gây chồng lấn), chỉ giữ card cute + scrollbar.
- **Kết quả:** `node --check` OK; `bookmark.js` = `render-header-proxy/bookmarklet.js`; `git diff --check` sạch.


### Patch #10 — Bong bóng comic 3 tab (mũi tên chĩa tab active + con vật từng tab) — 2026-08-02

- **Branch:** `arena/019f7b7f-bookmarklet` + `arena/019fc298-bookmarklet`.
- **Mục tiêu:** chuyển body 3 tab từ card cũ sang **bong bóng trò chuyện comic**:
  1. Mũi tên (tail) **dính liền viền body, chĩa lên tên tab đang chọn**.
  2. Mỗi tab có **con vật minh họa riêng** ở đầu (Streams = mèo, Nút = gấu, Lịch sử = thỏ).
  3. Nội dung tab nằm gọn trong bong bóng, phần dưới cuộn được.
- **Nội dung thay đổi (chỉ trong `bookmark.js` / `render-header-proxy/bookmarklet.js`):**
  - Thêm 3 mascot SVG: `__uvdTabMascotCat/Bear/Rabbit` + `__uvdTabMeta`.
  - `buildUI`: bọc body bằng `.uvd-bubble-wrap` > `.uvd-bubble-tail` + `.uvd-bubble`
    (chứa `.uvd-bubble-title` + streamList). `contentWrapper` đổi class thành `.uvd-bubble`.
  - `moveTailTo(btn)` di chuyển mũi tên chĩa vào tab active.
  - `renderTab`: cập nhật tiêu đề bong bóng (con vật + tên + số lượng) theo tab, gọi `moveTailTo`.
  - CSS: `.uvd-bubble-wrap`, `.uvd-bubble-tail` (cùng viền hồng với body), `.uvd-bubble`,
    `.uvd-bubble-title/tmascot/tname/tsub`.
  - Bỏ icon trên tên tab (chỉ giữ chữ).
- **Kết quả:** `node --check` OK; `bookmark.js` = `render-header-proxy/bookmarklet.js`; `git diff --check` sạch.

### Patch #10 — Bỏ mũi tên tab, play nhỏ + ẩn ⋮, popup link chất lượng, intro thỏ bắp rang khi bấm Play — 2026-08-03

- **Branch:** `arena/019f7b7f-bookmarklet` + `arena/019fc298-bookmarklet`.
- **Mục tiêu:** làm theo đúng ý ní:
  1. **Bỏ mũi tên chĩa xuống** dưới tab (`uvd-tab-indicator::after` triangle) và bớt khoảng
     đệm đáy tabbar.
  2. **Nút play giữa thumbnail nhỏ lại** (52px → 34px, chữ 20 → 14).
  3. **Ẩn nút ⋮ (3 chấm)** trên thumbnail cùng các tính năng trong đó (tạm thời bỏ qua).
  4. **Link chất lượng cao**: card rộng hơn link thường (dùng card stream thật + thumbnail)
     và **luôn đứng đầu** (sort ưu tiên metadata / đa chất lượng / resolution lên trước).
  5. **Khi bấm Play**: hiện popup **con thỏ to ôm bắp rang + chữ "Giờ mở video nè ♡"**
     khoảng 2.4 giây rồi mới mở video player. Áp dụng cho cả nút play thumbnail,
     popup link (cả card chất lượng lẫn link thường) và "cảnh khác".
- **Kết quả:** `node --check` OK; `bookmark.js` = `render-header-proxy/bookmarklet.js`; `git diff --check` sạch.

### Patch #11 — Sửa play lệch, intro thỏ bắp rang lâu hơn + nút "Mở ngay", popup video đơn giản không thumbnail, xoá thỏ trong player — 2026-08-03

- **Mục tiêu (làm theo ý ní):**
  1. **Nút play bị lệch một bên**: reset padding của `.uvd-btn` (đang đẩy ▶ lệch) và dùng
     flex căn giữa cho nút play thumbnail + nền nút, không còn lệch.
  2. **Intro thỏ ôm bắp rang**: hiện lâu hơn (3.2s), **ẩn panel UMP** khi đang hiện nên
     không bị UI đè; thêm dòng "Đợi vài giây hoặc bấm Mở ngay" và nút **▶ Mở ngay**.
  3. **Popup video đơn giản lại như lúc đầu**: bỏ thumbnail. Link chất lượng cao gắn nhãn
     "✨ chất lượng cao" + ghi "Link này chất lượng cao nè" và nút "▶ Xem ngay"; link
     thường chỉ là dòng text + nút "▶ Xem".
  4. **Xoá con thỏ 🐰** trang trí phía dưới trình phát video.
- **Kết quả:** `node --check` OK; `bookmark.js` = `render-header-proxy/bookmarklet.js`; `git diff --check` sạch.

### Patch #12 — Tách 3 nút iframe khỏi link, thêm dòng "Đang chuẩn bị link", ẩn script bằng cuộn lên — 2026-08-03

- **Mục tiêu (làm theo ý ní):**
  1. **Link iframe ở Streams**: 3 nút (↗ mở / copy UMP / sao chép) bị dính vào link —
     thêm khoảng cách `margin-top:10px` + `padding-top` + đường phân cách nhỏ giữa
     link và hàng nút.
  2. **Intro thỏ ôm bắp rang**: thêm lại dòng "Đang chuẩn bị link cho mấy cưng..."
     (vẫn giữ dòng "Đợi vài giây hoặc bấm Mở ngay" + nút ▶ Mở ngay).
  3. **Ẩn script**: bỏ nút nổi đáy phải (trùng vị trí nút gọi lại pop-up) — thay bằng
     **cơ chế cuộn**: khi ẩn kiểu floating, **cuộn lên** là hiện lại panel. Toast đổi
     thành "Đã thu gọn UMP DL — cuộn lên để hiện lại".
- **Kết quả:** `node --check` OK; `bookmark.js` = `render-header-proxy/bookmarklet.js`; `git diff --check` sạch.

### Patch #13 — Cơ chế đợi (giới hạn auto popup) + ẩn script = thu body lên còn header (cuộn chậm đẹp) — 2026-08-03

- **Mục tiêu (làm theo ý ní):**
  1. **Cơ chế đợi (hạn chế mở auto):**
     - Popup iframe chỉ hiện khi có iframe **PLAYER** hoặc ít nhất **UNKNOWN** (không hiện khi
       toàn rác JUNK).
     - Popup video chỉ **auto-mở** khi có ít nhất 1 link video thật (không phải demo/preview)
       và get được **preview/metadata** (đa chất lượng / master / resolution). Mở tay (nút gọi
       lại popup) vẫn hiện bình thường.
  2. **Cơ chế cuộn (đúng ý ní):** ẩn script = **thu hết body cuộn lên**, chỉ còn lại header
     (kiểu ngăn kéo); bấm lại là **cuộn xuống** mở ra. Hiệu ứng **chậm đẹp** (`.65s
     cubic-bezier(.22,1,.36,1)`). Bỏ luôn window-scroll listener cũ (sai ý) và không còn nút
     nổi đáy phải trùng nút gọi lại pop-up.
- **Kết quả:** `node --check` OK; `bookmark.js` = `render-header-proxy/bookmarklet.js`; `git diff --check` sạch.

### Patch #14 — Blob không tính là video (ưu tiên popup iframe), trả lại ẩn floating kéo được, nút reload gọi lại popup — 2026-08-03

- **Mục tiêu (làm theo ý ní):**
  1. **Blob không tính là video**: bỏ `BLOB` khỏi danh sách "link video thật" (dùng để mở
     popup video). Nếu chỉ có **blob + iframe** thì coi như chưa có video thật → **ưu tiên
     hiện popup iframe**.
  2. **Trả lại cơ chế ẩn script floating di chuyển được**: khi ẩn kiểu floating lại hiện
     **nút nổi kéo đi được** để mở lại panel (không dùng nút gọi lại popup).
  3. **Bỏ nút gọi lại popup video nổi** (🐰) — hành vi "gọi lại popup" được **gắn vào nút
     reload (↻)** trên header: bấm reload → quét lại → **popup xuất hiện**.
- **Kết quả:** `node --check` OK; `bookmark.js` = `render-header-proxy/bookmarklet.js`; `git diff --check` sạch.

### Patch #15 — Cách tab với body, nút iframe trên header (tự hiện), redesign Cài đặt cute — 2026-08-03

- **Mục tiêu (làm theo ý ní):**
  1. **Tab cách body ra xíu**: thêm `margin-bottom:10px` cho tabbar.
  2. **Nút iframe trên header (🎬)**: tự hiện khi trang chỉ có iframe/demo (chưa có video
     thật); bấm vào thì **gọi popup iframe**. Khi đã có video thật thì ẩn (bấm sẽ nhắc nhẹ).
  3. **Redesign Cài đặt theo hướng cute**: giữ nguyên **kiểu trượt lên** (slide-in) của sheet,
     thêm **con mèo to** làm hero ở đầu + dòng chữ dễ thương; header, các card và phần
     **hướng dẫn** (details) được làm pastel/bo tròn cute.
- **Kết quả:** `node --check` OK; `bookmark.js` = `render-header-proxy/bookmarklet.js`; `git diff --check` sạch.

### Patch #16 — Bỏ mèo session, settings hồng tím + footer gấu, hướng dẫn cute, nút play như badge, X/Để sau popup khác nhau — 2026-08-03

- **Mục tiêu (làm theo ý ní):**
  1. **Bỏ con mèo 🐱** ở thanh session (thấy hơi lạc quẻ).
  2. **Card Cài đặt theo tông hồng tím**; cuối trang thêm **con gấu xinh xắn + lời nhắn nhủ**.
  3. **Viết lại phần hướng dẫn** (Cài đặt Bookmarklet / Sử dụng / Tải yt-dlp) bằng **ngôn ngữ
     dễ thương** nhưng vẫn đầy đủ nội dung.
  4. **Nút play**: CSS giống **badge ở góc thumbnail** (nền mờ + blur + viền hồng) nhưng **tròn**.
  5. **Popup**: bấm **X** → đóng hẳn, mất luôn; bấm **"Để sau"** → ẩn popup thành **nút nổi kéo
     được** (giống nút ẩn script) để gọi lại.
- **Kết quả:** `node --check` OK; `bookmark.js` = `render-header-proxy/bookmarklet.js`; `git diff --check` sạch.

## Cách phát triển bookmarklet


Chỉnh sửa:

```text
bookmark.js
```

Sau khi sửa, đồng bộ sang Render:

```bash
cp bookmark.js render-header-proxy/bookmarklet.js
node --check bookmark.js
node --check render-header-proxy/bookmarklet.js
git diff --check
```

Sau đó commit và push branch cố định:

```bash
git add bookmark.js render-header-proxy/bookmarklet.js
git commit -m "Describe the change"
git push origin arena/019fc268-bookmarklet
```

Render được cấu hình tự deploy sau commit.

Loader dùng để chạy bookmarklet:

```javascript
javascript:(function(){var u=document.createElement('script');u.src='https://render-header-proxy.onrender.com/bookmarklet.js?v='+Date.now();document.head.appendChild(u);})();
```

## Bản đồ file (trạng thái 2026-08-02)

| File | Vai trò | Còn dùng? |
|---|---|---|
| `bookmark.js` | **Nguồn bookmarklet chính** — chỉ sửa file này | ✅ |
| `render-header-proxy/bookmarklet.js` | Bản deploy lên Render, phải giống hệt `bookmark.js` | ✅ |
| `render-header-proxy/server.js` | Proxy header/HLS + sync Supabase + phục vụ file JS | ✅ |
| `hf-space/app.py` | Bản proxy FastAPI cho Hugging Face Space | ✅ |
| `userscript/*` + `scripts/build-userscript.js` | Userscript sinh từ core cũ | ⚠️ legacy, chỉ tham khảo |
| `umpdl6736-2_vjs10.js` | Core cũ hơn `bookmark.js`, chỉ dùng làm input build userscript | ⚠️ legacy |
| `loader.html` | Loader cũ trỏ `cdn.jsdelivr.net/.../umpdl.js` — file `umpdl.js` **không tồn tại** trong repo | ⚠️ legacy, không dùng |
| `.github/workflows/purge-jsdelivr.yml` | Purge cache jsDelivr khi push `main` | ✅ (nếu dùng jsDelivr) |

## Đã hoàn thành

- Bắt M3U8 master/variant và giữ master không bị variant ghi đè.
- Chọn nhiều chất lượng HLS trong player.
- Player Video.js/native fallback.
- Reuse video gốc cho một số MediaSource/blob.
- Popup blocker và overlay blocker.
- Hard blocker cho các embed player nhiều quảng cáo.
- Javhub banner/popup cleanup.
- Streamtape/JWPlayer: bỏ qua `jwpltx.com/ping.gif`, lấy media từ tham số `mu`, nhận diện URL `/m3u8/` không có đuôi `.m3u8`.
- MixDrop, MiixDrop, Vinovo và Upload18: capture video/resource sau Play.
- Iframe card riêng, không tạo thumbnail giả.
- Iframe link có thể mở bình thường hoặc nhấn giữ để dùng menu native của Chrome.
- Hỗ trợ nhập/capture nhiều loại media trong Streams.
- History, Settings, site profile, learned Play selector, filterlist.
- Light Teal UI, menu/header/player và tối ưu scroll Settings.
- Supabase/Render sync profile.
- HF/Render header proxy.
- Hide mode: icon floating tròn kéo được hoặc thu gọn còn header (commit `7e5297c`).

## AI lọc iframe rác (hybrid) — thêm 2026-08-02

Trang phim thường nhúng nhiều iframe (quảng cáo, popup, tracker) bên cạnh iframe
player thật. M3U8/MP4 lọc bằng đuôi file thì dễ, nhưng iframe thì không biết
trước nó chứa gì vì **cross-origin**. Đã bổ sung bộ phân loại hybrid:

**Tầng 1 — heuristic (offline, bật sẵn):** mỗi iframe được chấm điểm và gắn nhãn
`PLAYER / UNKNOWN / JUNK` dựa trên nhiều tín hiệu yếu gộp lại:
- Host/path đã biết (streamtape, mixdrop, doodstream, fembed, /e/embed/player...)
- Danh sách marker rác (doubleclick, popunder, popads, casino, adsterra...)
- Hình học/ẩn hiện của phần tử (kích thước ≥240×120, tỉ lệ 16:9, hiện thị)
- **Bằng chứng mạng (quan trọng nhất):** mọi media URL thấy ở trang mẹ (HTML,
  script, fetch, XHR, resource timing) được nhóm theo host. Nếu host của iframe
  trùng host đang phục vụ media trên trang đó → gần chắc chắn là player thật.

**Tầng 2 — LLM (hybrid, tuỳ chọn):** nếu dán URL proxy vào Cài đặt → AI lọc
iframe, UMP gửi danh sách ngắn lên `POST /classify` trên proxy để AI chốt
verdict cuối. Server đọc key từ env (không nhét vào source):
- `GEMINI_API_KEY` (ưu tiên) + `GEMINI_MODEL` (mặc định `gemini-2.0-flash`)
- hoặc `OPENAI_API_KEY` + `AI_BASE_URL` + `AI_MODEL` (mặc định `gpt-4o-mini`)
Không có key nào/không cấu hình → tự quay về heuristic offline.

**Tác dụng:** thẻ iframe hiển thị badge `PLAYER ✓ / JUNK ✗ / UNKNOWN ?`, thẻ rác
bị làm mờ, gợi ý mở iframe xếp player thật lên đầu và loại iframe rác — nhưng
**không tự xóa** iframe nào để tránh mất player hợp lệ.

## Quyết định giao diện hiện tại

- Ưu tiên Light Teal.
- Dark Glass tạm thời không tập trung phát triển.
- Iframe không dùng thumbnail video giả.
- Menu iframe ưu tiên thao tác thủ công.
- Popup quảng cáo tiếp tục bị chặn, nhưng không tự xóa iframe để tránh mất player hợp lệ.

## Vấn đề userscript — chính thức ngừng (2026-08-02)

Đã thử build lại từ core `umpdl6736-2_vjs10.js` (script `build-userscript.js`)
nhưng kết quả vẫn không đạt: bookmarklet/userscript JavaScript bị giới hạn
bởi iframe cross-origin và thời điểm inject, không sniff được network như Via
Browser ở tầng native. **Không sửa/nâng cấp hướng này nữa** — chỉ giữ file để
tham khảo.

Trước đây đã thử nhiều hướng:

- Iframe bridge bằng `postMessage`.
- Render standalone player.
- Manifest bridge/Blob playlist.
- Userscript capture-only.
- Full UMP userscript.
- Page-context injection.
- Bản Tampermonkey riêng.

Các bản này chưa đạt được mức sniff network như Via Browser. Via có khả năng nhìn request ở tầng native WebView/network, còn bookmarklet/userscript JavaScript vẫn bị giới hạn bởi iframe cross-origin và thời điểm inject.

Các file userscript vẫn được giữ để tham khảo:

```text
userscript/umpdl.user.js
userscript/umpdl-tampermonkey.user.js
render-header-proxy/userscript/umpdl.user.js
render-header-proxy/userscript/umpdl-tampermonkey.user.js
scripts/build-userscript.js
```

Hiện tại không lấy userscript làm hướng chính.

## Các nguyên nhân quan trọng đã phát hiện

### Iframe cross-origin

Trang mẹ chỉ nhìn thấy URL iframe, không đọc được DOM/video/fetch/XHR bên trong iframe. Muốn bắt như Via cần browser extension/native WebView network interception hoặc userscript thực sự chạy trong frame.

### Blob/MediaSource

`blob:` được tạo bởi MediaSource không phải URL video độc lập. Không thể tùy tiện đưa Blob URL của video gốc sang player mới/tab mới.

### JWPlayer telemetry

URL `ping.gif` có thể chứa `.mp4` trong query, gây nhận nhầm thành MP4. UMP đã lọc telemetry và ưu tiên tham số `mu` chứa media thật.

### Signed media URL

M3U8/MP4 có thể phụ thuộc Referer, Cookie, token, IP hoặc session. Link lấy được có thể hết hạn hoặc không phát được khi thiếu header.

## Quy tắc bảo trì

- Không sửa pipeline capture nếu chưa có log/error cụ thể.
- Sau khi thay đổi phải chạy `node --check` và `git diff --check`.
- Giữ `bookmark.js` và `render-header-proxy/bookmarklet.js` giống nhau.
- Không đưa `PROXY_KEY`, Supabase service key, API key, cookie hoặc token thật vào source/config/chat.
- Không thêm trực tiếp các link `/dload/` vào hidden media source nếu đó là nút tải công khai của site.
- Với iframe, giữ card/link để người dùng tự quyết định mở/chặn.

## Commit tham khảo

Một số mốc quan trọng:

```text
e560bb9 Preserve masters discovered from playlist bodies
a059c0d Keep shared profile bookmarklet URLs short
8daf516 Connect bookmarklet settings to Supabase sync profiles
b1ab0fa Reuse original MediaSource video for blob playback
8c3c3d8 Use lite protection without blocking page media
c4aca92 Make UMP hide button collapse and expand in place
2 phiên bản gần nhất: Streamtape/JWPlayer và UPN native controls
7e5297c Add header and movable floating hide modes
```

Branch làm việc cố định (phiên hiện tại):

```text
arena/019fc268-bookmarklet
```

## Lịch sử branch (2026-08-02)

Mỗi phiên chat trên Arena được gắn một branch `arena/*` riêng. Các branch cũ
không có commit riêng ngoài điểm xuất phát, nên **không cần merge**:

```text
arena/019f7b7f-bookmarklet  →  dừng ở 7e5297c (phiên trước)
arena/019fc268-bookmarklet  →  tạo từ 7e5297c, là phiên hiện tại
main                        →  425b066 (nhánh chính, có thể cũ hơn)
```
### Patch #17 — Quét sạch màu xanh trong Cài đặt, gấu cuối trang to hơn đứng giữa — 2026-08-03

- **Mục tiêu:** loại bỏ màu xanh teal còn sót trong Cài đặt, chuyển hết sang tông hồng/tím
  (card, callout, code block, step number, toggle, profile, stat, tag, url box...).
- Con gấu cuối trang: **to hơn**, **không nằm trong khung**, **đứng giữa trang**, dòng nhắn
  nhủ nằm **ở dưới**.
- **Kết quả:** `node --check` OK; `bookmark.js` = `render-header-proxy/bookmarklet.js`; `git diff --check` sạch.

### Patch #18 — Card Streams cute hơn (giữ bố cục) — 2026-08-03

- **Mục tiêu:** giữ nguyên bố cục card stream, làm cute hơn về **màu + bóng**: gradient
  trắng→hồng→tím, bo góc to hơn, bóng đổ hồng mềm, highlight trắng trên đỉnh, hover nhẹ nhàng
  nhấc lên. Preview thumbnail chuyển sang nền hồng/tím mềm.
- **Kết quả:** `node --check` OK; `bookmark.js` = `render-header-proxy/bookmarklet.js`; `git diff --check` sạch.

### Patch #19 — Bỏ sao lưu thủ công, toast dưới đáy không chồng nhau, blur header, cục đầu chĩa tab, cuộn xuống ẩn header — 2026-08-03

- **Mục tiêu (làm theo ý ní):**
  1. **Bỏ phần "Sao lưu & Khôi phục" thủ công** trong Cài đặt (đã dùng đồng bộ cấp cao).
  2. **Toast**: chuyển xuống **dưới đáy**, xếp chồng theo cột **không đè nhau** (tối đa 3),
     không nằm ở header nữa.
  3. **Thêm blur (frosted glass)** cho header.
  4. **Body tab**: mỗi link là 1 cục/card; **cục đầu tiên có mũi chĩa lên current tab**
     (giống mũi chĩa menu player).
  5. **Thử nghiệm cuộn xuống ẩn header** để rộng chỗ, cuộn lên hiện lại, **mượt**.
- **Kết quả:** `node --check` OK; `bookmark.js` = `render-header-proxy/bookmarklet.js`; `git diff --check` sạch.

### Patch #20 — Đổi tên dự án "Mèo cào media" + bump ver, popup quality có thumb + mũi chĩa, tab chảy xuống — 2026-08-03

- **Mục tiêu (làm theo ý ní):**
  1. **Đổi tên dự án** thành **Mèo cào media**, **bump version** (6.7.26 → 6.7.27); đổi cả
     tên bookmarklet trong phần hướng dẫn đặt tên.
  2. **Popup**: áp dụng **css chĩa** cho cục đầu tiên; **link chất lượng cao hiện 1 thumbnail**
     (nếu cưng muốn xem trước), chỉ **1 thumb** thôi.
  3. **Tab**: phần tô đậm của tab **chảy xuống dính liền vào body dưới** (mũi nhọn), bấm tab
     nào thì tab đó chảy (indicator trượt + mũi nhọn theo tab).
- **Kết quả:** `node --check` OK; `bookmark.js` = `render-header-proxy/bookmarklet.js`; `git diff --check` sạch.

### Patch #21 — Hiệu ứng nước chảy mềm hơn, mũi chĩa popup xoay đúng hướng, link rác khuyên đừng mở — 2026-08-03

- **Mục tiêu (làm theo ý ní):**
  1. **Hiệu ứng "nước chảy"** của tab làm **mềm hơn** (dạng giọt bo tròn thay vì tam giác sắc).
  2. **First class trong popup**: xoay **mũi chĩa đúng hướng** (không còn ngược).
  3. **Link đã có nhãn rác (JUNK)**: **không kêu "↗ mở"** nữa, thay bằng lời **khuyên đừng mở**
     ("🚫 Không nên mở — đây là rác") kèm vote/chặn.
- **Kết quả:** `node --check` OK; `bookmark.js` = `render-header-proxy/bookmarklet.js`; `git diff --check` sạch.

### Patch #22 — Bỏ hiệu ứng nước chảy + first class/thumbnail popup, popup link đơn giản, popup không bị che, nút iframe header đồng bộ — 2026-08-03

- **Mục tiêu (làm theo ý ní):**
  1. **Bỏ hiệu ứng "nước chảy"** của tab (xóa mũi nhọn chảy xuống body).
  2. **Bỏ first class + thumbnail trong popup** → quay lại **link đơn giản** (mỗi link 1 dòng
     text + nút Xem, link chất lượng cao có nhãn "✨ chất lượng cao").
  3. **Fix popup bị che**: thêm cờ `__uvdPopupActive` để panel UMP luôn ẩn khi popup đang mở
     (kể cả khi UI rebuild) → popup luôn nổi trên cùng.
  4. **Nút iframe trên header**: đổi 🎬 (emoji màu) sang glyph "▣" đơn sắc cho đồng bộ với các
     nút khác (▶ ◉ ↻ ⚙ ▾ ×).
- **Kết quả:** `node --check` OK; `bookmark.js` = `render-header-proxy/bookmarklet.js`; `git diff --check` sạch.
### Patch #23 — Câu hướng dẫn theo từng loại link, khuyên đừng bấm link rác — 2026-08-03

- **Mục tiêu:** thêm câu hướng dẫn ngắn cho từng loại link:
  - **M3U8**: "Playlist HLS nè 📺 — bấm Xem để chọn chất lượng nha."
  - **MP4/WEBM**: "Link video thật nè 📼 — bấm Xem để phát ngay nha."
  - **BLOB**: "Blob MediaSource nè 🌀 — bấm Xem để phát trực tiếp."
  - **IFRAME**: phân theo verdict — PLAYER khuyến khích mở; UNKNOWN bảo mở thử; **JUNK
    (rác) khuyên "Đừng bấm nha" + ẩn nút "↗ mở"** thay bằng dòng "🚫 Không nên mở — đây là rác".
  - Popup link cũng có dòng hướng dẫn theo loại.
- **Kết quả:** `node --check` OK; `bookmark.js` = `render-header-proxy/bookmarklet.js` = `bookmarkkk.js`; `git diff --check` sạch.

### Patch #24 — Khôi phục tab cũ + popup mèo đào mở đúng popup đích — 2026-08-03

- **Mục tiêu:** trả giao diện tab/body về bố cục cũ ổn định, đồng thời làm lại luồng popup đào link theo thao tác chủ động.
- **Nội dung thay đổi** (`bookmark.js` và bản Render đồng bộ):
  - Gỡ cục nhô và CSS nối tab/body; **Streams / Nút đã click / Lịch sử** trở lại đúng bố cục tab cũ.
  - Popup SVG được làm **cao và to hơn**, minh hoạ một **con mèo béo cầm xẻng đào đất** theo tông pastel cute; popup giữ nguyên trên màn hình (không tự bay/tự mất) và có nút ✕ để người dùng tự ẩn nếu cần.
  - Popup đào chờ khoảng **20 giây** để tìm iframe. Khi có M3U8/MP4/MPD/WEBM/TS hoặc tìm được iframe hợp lệ, nó hiện **"Vào link ♡"** và chờ người dùng bấm.
  - Bấm **Vào link**: mèo đào chạy chân và vung xẻng một nhịp ngắn, rồi popup mèo **bay vọt lên trên màn hình rồi biến mất**. Kế tiếp popup video (ưu tiên nếu có link trực tiếp) hoặc popup iframe **trượt từ dưới lên**.
  - Mascot ở popup video, popup iframe, popup mở video và header video player đều có chuyển động nhún/lắc nhỏ để giữ phong cách cute. UI script vẫn ẩn trong toàn bộ luồng và chỉ hiện lại khi người dùng đóng/ẩn popup.
  - Popup phát hiện link cũ không thể mở chồng khi popup đào đang hoạt động.
- **Kết quả:** `node --check` OK; `bookmark.js` = `render-header-proxy/bookmarklet.js`; `git diff --check` sạch.

### Patch #25 — Thú cầm bảng tiêu đề trong Cài đặt — 2026-08-03

- **Mục tiêu:** làm phần hướng dẫn trong Cài đặt cute và dễ định hướng hơn bằng các con thú cầm bảng tiêu đề.
- **Nội dung thay đổi** (`bookmark.js` và bản Render đồng bộ):
  - Mèo cầm bảng **"Cài đặt Bookmarklet"**.
  - Thỏ cầm bảng **"Hướng dẫn sử dụng"**.
  - Gấu cầm bảng **"Tải video với Termux"**.
  - Mỗi bảng là card pastel riêng, có hai bàn chân ôm bảng và hiệu ứng nhún/lắc nhẹ; màu bảng theo từng con thú.
- **Kết quả:** `node --check` OK; `bookmark.js` = `render-header-proxy/bookmarklet.js`; `git diff --check` sạch.

### Patch #26 — Hoàn tác cầu tab + đồng bộ Lịch sử an toàn — 2026-08-03

- **Mục tiêu:** bỏ cầu hồng dưới tab vì chưa đúng ý, đồng thời sửa Lịch sử không đồng bộ đầy đủ giữa thiết bị.
- **Nội dung thay đổi** (`bookmark.js` và bản Render đồng bộ):
  - Hoàn tác hoàn toàn dải nối tab/body; tab và body trở về bố cục ổn định trước đó.
  - Video bấm **Xem** trong popup video và iframe bấm **Mở + Copy** giờ đều được ghi ngay vào Lịch sử.
  - Khi đồng bộ, Lịch sử từ máy hiện tại và cloud được **gộp theo URL + thời gian** (tối đa 50 mục), không còn ghi đè nguyên mảng khiến mất video từ thiết bị khác.
  - Nút **Đồng bộ ngay** giờ upload tức thời sau khi gộp lịch sử và báo kết quả rõ ràng.
- **Kết quả:** `node --check` OK; `bookmark.js` = `render-header-proxy/bookmarklet.js`; `git diff --check` sạch.

### Patch #27 — Popup Xem gọn hơn + profile Cài đặt cute — 2026-08-03

- **Mục tiêu:** làm popup link đỡ rối icon và thay profile kỹ thuật khô khan trong Cài đặt bằng một profile cá tính, dễ thương hơn.
- **Nội dung thay đổi** (`bookmark.js` và bản Render đồng bộ):
  - Các nút trong popup link video đổi từ `▶ Xem` thành **`Xem`** để không lặp icon play.
  - Avatar `NQ` được thay bằng mèo mascot pastel có trái tim nhỏ, nhún/lắc nhẹ.
  - Phần giới thiệu đổi thành mô tả: thích mày mò, mê UI cute, chăm chút từng trải nghiệm; thêm các trait pill dễ thương thay cho tag kỹ thuật.
- **Kết quả:** `node --check` OK; `bookmark.js` = `render-header-proxy/bookmarklet.js`; `git diff --check` sạch.

### Patch #28 — Fix trùng mascot Setting+Player + thêm panda/raccoon/hamster + animation + fix nút Mở ngay — 2026-08-03

- **Mục tiêu (làm theo ý ní):** popup giữ nguyên vì đã đẹp độc đáo, chỉ fix phần Setting + Player bị trùng + icon xấu.
  1. **Nút "Mở ngay"**: bỏ icon ▶ xanh xấu (emoji), đổi thành `Mở ngay ♡` + letter-spacing .2px.
  2. **Thêm 3 mascot mới phong phú:** gấu trúc 🐼 (`__uvdTabMascotPanda` - tai wiggle), gấu mèo 🦝 (`__uvdTabMascotRaccoon` - đuôi wag), hamster 🐹 (`__uvdTabMascotHamster` - má pop).
  3. **Tabs:** Streams = panda `gấu trúc tìm link 🎋`, Nút đã click = raccoon `gấu mèo mò nút 🦝`, Lịch sử = hamster `hamster giữ hạt 🐹` — không còn trùng cat/bear/rabbit.
  4. **Settings:** Cài đặt Bookmarklet = panda, Hướng dẫn sử dụng = hamster, Tải với Termux = raccoon — footer bear giữ riêng, header cat giữ riêng brand.
  5. **Player:** header đổi từ mèo sang hamster `Hamster mở video nè ♡` + animation cheek pop.
  6. **Animation mới:** `uvdPandaEarWiggle`, `uvdHamsterPop`, `uvdRaccoonTailWag`, `uvdPawTap`, `uvdBoardFloat`; CSS cho `.uvd-settings-sign-panda/raccoon/hamster`, `.uvd-panda-ear`, `.uvd-raccoon-tail`, `.uvd-hamster-cheek`, `.uvd-bubble-tmascot`.
- **Kết quả:** `node --check` OK; `bookmark.js` = `render-header-proxy/bookmarklet.js`; `git diff --check` sạch.

### Patch #29 — Trả Settings header + profile về hướng cute cũ, giữ hệ thú mới — 2026-08-03

- **Mục tiêu:** lấy code UI/player mới làm nền, nhưng đưa header Settings và cục profile về cảm giác pastel cute trước đó.
- **Nội dung thay đổi** (`bookmark.js` và bản Render đồng bộ):
  - Header Settings trở lại mascot mèo thương hiệu.
  - Profile giữ mô tả cá tính/trait pill, avatar mèo quay lại nằm trong ô pastel bo góc, có nền sáng mềm và trái tim nhỏ.
  - Không gỡ hệ thú mới: panda/raccoon/hamster vẫn giữ ở tab, bảng hướng dẫn và player theo bản mới.
- **Kết quả:** `node --check` OK; `bookmark.js` = `render-header-proxy/bookmarklet.js`; `git diff --check` sạch.

### Patch #30 — Tách mascot Header Settings và avatar Profile — 2026-08-03

- **Mục tiêu:** tránh trùng con vật trong phần Cài đặt, đồng thời bỏ khung quanh mascot avatar trong profile.
- **Nội dung thay đổi** (`bookmark.js` và bản Render đồng bộ):
  - Header Settings dùng gấu trúc mascot.
  - Profile dùng mèo mascot riêng; avatar mèo không còn ô/khung pastel, chỉ có shadow mềm và trái tim nhỏ.
  - Giữ nguyên panda/raccoon/hamster ở các vị trí mới khác.
- **Kết quả:** `node --check` OK; `bookmark.js` = `render-header-proxy/bookmarklet.js`; `git diff --check` sạch.

### Patch #31 — Gom layout chính, đưa Footer vào body tab — 2026-08-04

- **Mục tiêu:** xử lý footer lạc lõng và cảm giác header/session/tab/body bị rời thành nhiều cục.
- **Nội dung thay đổi** (`bookmark.js` và bản Render đồng bộ):
  - Footer không còn là card riêng phía dưới panel; được đưa vào đáy của bubble body tab, cùng hệ với nội dung Streams/Nút/Lịch sử.
  - Footer đổi sang đường phân cách mảnh, nền trong suốt và chữ nhỏ, không còn shadow/card riêng.
  - Chuẩn hoá khoảng cách giữa header, session, tabbar và body thành 8px; giảm shadow của các lớp phụ để chỉ còn body là khối nội dung chính.
  - Giữ nguyên bố cục tab, không dùng lại cục nhô/cầu nối.
- **Kết quả:** `node --check` OK; `bookmark.js` = `render-header-proxy/bookmarklet.js`; `git diff --check` sạch.

### Patch #32 — Chỉnh footer, màu popup link, thú hướng dẫn và hint Vào link — 2026-08-04

- **Mục tiêu:** hoàn thiện các chi tiết UI nhỏ còn lệch tông và làm luồng đào link rõ hơn.
- **Nội dung thay đổi** (`bookmark.js` và bản Render đồng bộ):
  - Divider footer được inset và cách body 8px, không còn dính sát nội dung.
  - Câu hướng dẫn đỏ dưới URL ở popup video chuyển hoàn toàn sang tím (`#8a6ab0`).
  - Slide hướng dẫn dùng 3 thú không trùng: thỏ / hamster / gấu mèo; mỗi mascot có nhãn tên nhỏ để nhận diện rõ trên mobile.
  - Popup đào có thêm một dòng hint dưới nút **Vào link**, tự đổi lời nhắc cho link video hoặc iframe.
- **Kết quả:** `node --check` OK; `bookmark.js` = `render-header-proxy/bookmarklet.js`; `git diff --check` sạch.

### Patch #33 — Sửa đúng tutorial “Bấm vào đây” + nút Vào UI — 2026-08-04

- **Mục tiêu:** sửa đúng popup tutorial mở từ dòng “Chưa biết đây là gì? Bấm vào đây” và thêm lối thoát rõ ràng từ popup đào.
- **Nội dung thay đổi** (`bookmark.js` và bản Render đồng bộ):
  - Tutorial popup dùng thỏ / hamster / gấu mèo không trùng header panda, mỗi con có nhãn tên để nhận diện rõ.
  - Popup đào có nút phụ **Vào UI ♡**; bấm là đóng popup đào và mở UI chính ngay.
  - Các chỉnh footer inset, note tím trong popup video và hint route dưới Vào link vẫn được giữ.
- **Kết quả:** `node --check` OK; `bookmark.js` = `render-header-proxy/bookmarklet.js`; `git diff --check` sạch.

### Patch #34 — Redesign 6 thú tutorial “Bấm vào đây” — 2026-08-04

- **Mục tiêu:** làm rõ đúng 6 mascot trong popup tutorial mở từ “Chưa biết đây là gì? Bấm vào đây”.
- **Nội dung thay đổi** (`bookmark.js` và bản Render đồng bộ):
  - 6 slide dùng đúng 6 thú không trùng: mèo / panda / gấu mèo / hamster / thỏ / gấu.
  - Cả 6 đều đeo kính học giả.
  - Mỗi slide có sân khấu pastel riêng và capsule nhãn tên như “Panda học giả”, “Gấu mèo thám tử” để nhận diện rõ trên mobile.
- **Kết quả:** `node --check` OK; `bookmark.js` = `render-header-proxy/bookmarklet.js`; `git diff --check` sạch.
