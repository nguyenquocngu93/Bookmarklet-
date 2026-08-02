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
git push origin arena/019f7b7f-bookmarklet
```

Render được cấu hình tự deploy sau commit.

Loader dùng để chạy bookmarklet:

```javascript
javascript:(function(){var u=document.createElement('script');u.src='https://render-header-proxy.onrender.com/bookmarklet.js?v='+Date.now();document.head.appendChild(u);})();
```

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

## Quyết định giao diện hiện tại

- Ưu tiên Light Teal.
- Dark Glass tạm thời không tập trung phát triển.
- Iframe không dùng thumbnail video giả.
- Menu iframe ưu tiên thao tác thủ công.
- Popup quảng cáo tiếp tục bị chặn, nhưng không tự xóa iframe để tránh mất player hợp lệ.

## Vấn đề userscript đã tạm gác

Đã thử nhiều hướng:

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
```

Branch làm việc cố định:

```text
arena/019f7b7f-bookmarklet
```
