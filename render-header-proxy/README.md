# UMP DL Header Proxy for Render

Personal MP4/HLS relay that adds a User-Agent, Referer and optional Origin before forwarding a source to the browser.

## Deploy on Render

1. Push this folder to its own GitHub repository, or connect the parent repository and set **Root Directory** to `render-header-proxy`.
2. Create a **Web Service**.
3. Build command: `npm install`.
4. Start command: `node server.js`.
5. Add environment variables:

```text
PROXY_KEY=choose-a-long-private-key
ALLOWED_HOSTS=video.example.com,cdn.example.com
DEFAULT_USER_AGENT=Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36
```

`ALLOWED_HOSTS` is optional, but strongly recommended. Do not leave a public unrestricted proxy online.

## Test

```text
https://YOUR-APP.onrender.com/health
```

MP4 or direct media:

```text
https://YOUR-APP.onrender.com/proxy?key=YOUR_KEY&url=https%3A%2F%2Fcdn.example.com%2Fvideo.mp4&referer=https%3A%2F%2Fexample.com%2F
```

HLS playlist:

```text
https://YOUR-APP.onrender.com/hls?key=YOUR_KEY&url=https%3A%2F%2Fcdn.example.com%2Findex.m3u8&referer=https%3A%2F%2Fexample.com%2F
```

The `/hls` route rewrites relative playlist, segment and `EXT-X-KEY` URLs back through `/proxy`, so the headers are applied to segments too.

## Security notes

- Keep `PROXY_KEY` private; query-string keys are visible in browser history and URLs.
- Use a host allowlist.
- Do not accept arbitrary cookies from untrusted users.
- This does not bypass DRM, expired signatures, geo restrictions or access controls.
- Render free services may sleep and are not ideal for long-running media relays.
