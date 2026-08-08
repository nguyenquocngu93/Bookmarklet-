# Mascot design sources

This folder holds the editable mascot SVG artwork used by Mèo cào media.

Current source assets:

- `header-scout-cat.svg` — full-body cat standing above Main Header.
- `farewell-letter-cat.svg` — farewell cat carrying a thank-you letter.
- `tutorial-map-cat.svg` — tutorial cat carrying a small route map.

The bookmarklet cannot reliably fetch external GitHub assets on arbitrary sites
because those sites may block external image/script requests. The runtime copies
are therefore inlined in `bookmark.js` and `render-header-proxy/bookmarklet.js`.

When changing an SVG, copy its optimized inline contents into its corresponding
runtime variable, then mirror `bookmark.js` to `render-header-proxy/bookmarklet.js`
and run the normal syntax checks.
