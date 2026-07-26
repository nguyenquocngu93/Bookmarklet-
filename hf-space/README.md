# UMP DL Header + HLS proxy for Hugging Face Spaces

Copy `app.py`, `requirements.txt` and `Dockerfile` to the root of the Space.

Environment variables:

```text
PROXY_KEY=optional-private-key
ALLOWED_HOSTS=
PUBLIC_BASE_URL=https://saunhung-saunhung.hf.space
```

Health check:

```text
https://saunhung-saunhung.hf.space/health
```

The `/hls` route rewrites relative playlists, variant playlists, EXT-X-KEY and segments. It carries query tokens from the master playlist to relative child URLs.
