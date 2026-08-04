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
ALLOW_INSECURE_TLS=false
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-service-role-key
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

## Anonymous community learning (votes + ad rules)

Run the complete `sync.sql` once in **Supabase SQL Editor**. It creates a separate aggregate table, `umpdl_learning`, and these Render routes:

- `POST /learning/vote` — accepts only an up/down vote for a normalized hostname or a public TMDB ID.
- `GET /learning/rules` — returns only aggregated ad-host rules after the configured vote threshold.

This **separate community table** never stores watch history, page title, page URL, media URL path/query, cookies, profile ID, or executable JavaScript. The bookmarklet sends only hostnames/IDs; downloaded ad improvements are host rules, not remotely executed functions. The existing optional personal Sync (including its History/Sync feature) is unchanged. Set `LEARNING_MIN_BLOCK_VOTES=3` (or your preferred threshold) and keep `SUPABASE_URL` / `SUPABASE_SERVICE_KEY` only in Render.

## Security notes

- Keep `PROXY_KEY` private; query-string keys are visible in browser history and URLs.
- Use a host allowlist.
- Do not accept arbitrary cookies from untrusted users.
- This does not bypass DRM, expired signatures, geo restrictions or access controls.
- Render free services may sleep and are not ideal for long-running media relays.

## Bookmarklet endpoint

The deployed service also serves the current bookmarklet without browser/proxy caching:

```text
https://YOUR-APP.onrender.com/bookmarklet.js
```

After changing the source bookmarklet, copy the new `bookmark.js` (from the repository root) to `render-header-proxy/bookmarklet.js` before deploying. The two files must stay identical.

> Note: the `/userscript.js` and `/tampermonkey.user.js` endpoints are legacy.
> The userscript direction is officially dropped (2026-08-02) — bookmarklet only.
