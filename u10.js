// ==UserScript==
// @name         Universal Media Player v16 - JWPlayer Fix
// @namespace    http://tampermonkey.net/
// @version      16.0
// @description  Fix JWPlayer + UI chuẩn không lỗi
// @author       You
// @match        *://*/*
// @grant        none
// @run-at       document-start
// ==/UserScript==

(function () {
    'use strict';

    const urls = new Map();
    const patterns = [
        { re: /https?:\/\/[^\s"'<>()\\\]]+\.m3u8[^\s"'<>()\\\]]*/gi, type: 'M3U8', priority: 1 },
        { re: /https?:\/\/[^\s"'<>()\\\]]+\.mpd[^\s"'<>()\\\]]*/gi,  type: 'MPD',  priority: 2 },
        { re: /https?:\/\/[^\s"'<>()\\\]]+\.mp4[^\s"'<>()\\\]]*/gi,  type: 'MP4',  priority: 3 },
        { re: /https?:\/\/[^\s"'<>()\\\]]+\.webm[^\s"'<>()\\\]]*/gi, type: 'WEBM', priority: 4 },
    ];
    const IFRAME_RE = /https?:\/\/[^\s"'<>()\\\]]+\/(v|embed|e|vv|jm|t|watch)\/[^\s"'<>()\\\]]*/gi;
    const AD = /doubleclick|googlesyndication|googleadservices|adservice|pagead|adnxs/i;
    const REF = location.href;
    const UA  = 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36';

    function cleanUrl(u) {
        return u.replace(/\\u002F/gi,'/').replace(/\\\//g,'/').replace(/&amp;/g,'&').replace(/\\"/g,'').replace(/["')\]>\s]+$/,'').trim();
    }

    function addUrl(u, type, source, priority) {
        u = cleanUrl(u);
        if (!u.startsWith('http') || AD.test(u)) return;
        if (!urls.has(u) || urls.get(u).priority > priority) {
            urls.set(u, { url: u, type, source, priority, ts: Date.now() });
            updateBadge();
        }
    }

    function updateBadge() {
        const b = document.getElementById('u-badge');
        if (b) { b.style.display = urls.size ? 'flex' : 'none'; b.textContent = urls.size; }
    }

    function findUrls(text, source) {
        if (!text || typeof text !== 'string') return;
        patterns.forEach(p => {
            const m = text.match(p.re);
            if (m) m.forEach(u => addUrl(u, p.type, source, p.priority));
        });
        const im = text.match(IFRAME_RE);
        if (im) im.forEach(u => addUrl(u, 'IFRAME', source, 99));
    }

    function scan(doc, src) {
        try {
            if (!doc) return;
            doc.querySelectorAll('video,source,audio').forEach(v => {
                if (v.src) findUrls(v.src, src+':el');
                if (v.currentSrc) findUrls(v.currentSrc, src+':cur');
            });
            doc.querySelectorAll('iframe').forEach((f,i) => {
                if (f.src) addUrl(f.src, 'IFRAME', src+':if', 99);
                try { if (f.contentDocument) scan(f.contentDocument, src+':if'+i); } catch(e) {}
            });
            doc.querySelectorAll('script').forEach(s => findUrls(s.textContent, src+':js'));
            findUrls(doc.documentElement.outerHTML, src+':html');
        } catch(e) {}
    }

    const _fetch = window.fetch;
    const _xhrOpen = XMLHttpRequest.prototype.open;
    window.fetch = function(...a) {
        try { const u=typeof a[0]==='string'?a[0]:(a[0]&&a[0].url)||''; if(u) findUrls(u,'fetch'); } catch(e) {}
        return _fetch.apply(this, a);
    };
    XMLHttpRequest.prototype.open = function(m,u) {
        try { if(u) findUrls(String(u),'xhr'); } catch(e) {}
        return _xhrOpen.apply(this, arguments);
    };

    function scanPerf() {
        try { performance.getEntriesByType('resource').forEach(e => findUrls(e.name, 'perf')); } catch(e) {}
    }

    // JWPlayer Handler - Tự động mở iframe và quét
    function handleJWPlayer(url) {
        if (/videoplay\.us|jwplayer/i.test(url)) {
            const newTab = window.open(url, '_blank');
            setTimeout(() => {
                toast('⏳ Đang quét JWPlayer...');
                if (newTab && !newTab.closed) {
                    newTab.addEventListener('load', () => {
                        setTimeout(() => {
                            if (newTab && !newTab.closed) {
                                try {
                                    const doc = newTab.document;
                                    scan(doc, 'jwplayer');
                                    scanPerf.call(newTab);
                                    toast('✅ Đã quét JWPlayer!');
                                    render();
                                } catch(e) {
                                    toast('⚠️ Cross-origin, đợi 3s...');
                                    setTimeout(() => {
                                        try {
                                            scan(newTab.document, 'jwplayer:delayed');
                                            render();
                                        } catch(e2) {}
                                    }, 3000);
                                }
                            }
                        }, 2000);
                    });
                }
            }, 500);
            return true;
        }
        return false;
    }

    const CSS = `
        #u-fab { position:fixed; bottom:20px; right:20px; width:56px; height:56px; background:#e53935; color:white; border:none; border-radius:50%; font-size:24px; cursor:pointer; box-shadow:0 4px 20px rgba(0,0,0,.5); z-index:2147483647; display:flex; align-items:center; justify-content:center; }
        #u-badge { position:absolute; top:-2px; right:-2px; background:#43a047; color:white; font-size:10px; min-width:20px; height:20px; border-radius:10px; display:none; align-items:center; justify-content:center; font-weight:bold; border:2px solid #fff; }
        #u-bd { position:fixed; inset:0; background:rgba(0,0,0,.75); z-index:2147483640; display:none; }
        #u-bd.on { display:block; }

        /* PANEL - FIX LAYOUT */
        #u-panel { position:fixed; bottom:86px; right:12px; width:calc(100vw - 24px); max-width:400px; max-height:70vh; background:#111; border-radius:16px; z-index:2147483647; display:none; flex-direction:column; box-shadow:0 12px 40px #000; overflow:hidden; font-family:sans-serif; border:1px solid #222; }
        #u-panel.on { display:flex; }
        #u-ph { background:#1e1e1e; padding:12px; display:flex; align-items:center; gap:8px; border-bottom:1px solid #2a2a2a; flex-shrink:0; }
        #u-ph-title { color:#fff; font-size:14px; font-weight:bold; flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        #u-ph-btns { display:flex; gap:6px; flex-shrink:0; }
        #u-pb { overflow-y:auto; flex:1; background:#0a0a0a; }
        
        .btn-scan { background:#1565c0; color:white; border:none; padding:8px 12px; border-radius:8px; font-size:11px; font-weight:bold; cursor:pointer; white-space:nowrap; }
        .btn-clr { background:#333; color:white; border:none; padding:8px 12px; border-radius:8px; font-size:11px; cursor:pointer; }
        
        .li { padding:12px; border-bottom:1px solid #181818; cursor:pointer; transition:.1s; }
        .li:active { background:#1a1a1a; }
        .li-top { display:flex; align-items:center; gap:8px; margin-bottom:6px; }
        .li-badge { font-size:10px; font-weight:900; padding:3px 8px; border-radius:5px; color:white; text-transform:uppercase; flex-shrink:0; }
        .lb-M3U8{background:#7b1fa2;} .lb-MP4{background:#2e7d32;} .lb-IFRAME{background:#1565c0;} .lb-other{background:#444;}
        .li-name { color:#fff; font-size:13px; font-weight:600; flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .li-src { color:#666; font-size:10px; margin-bottom:4px; }
        .li-url { color:#4fc3f7; font-size:10px; font-family:monospace; word-break:break-all; background:#000; padding:8px; border-radius:6px; line-height:1.4; border:1px solid #222; }

        /* PREVIEW PLAYER */
        #u-prev { position:fixed; bottom:0; left:0; right:0; background:#111; z-index:2147483647; display:none; flex-direction:column; border-radius:20px 20px 0 0; box-shadow:0 -10px 50px #000; font-family:sans-serif; max-height:85vh; }
        #u-prev.on { display:flex; }
        #u-prev-bar { display:flex; align-items:center; padding:12px 15px; gap:10px; border-bottom:1px solid #222; flex-shrink:0; }
        #u-prev-title { flex:1; color:#fff; font-size:13px; font-weight:bold; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        #u-vid-wrap { position:relative; background:#000; width:100%; height:240px; overflow:hidden; display:flex; align-items:center; justify-content:center; flex-shrink:0; }
        #u-vid { width:100%; height:100%; object-fit:contain; transition:transform .3s; }
        
        .p-acts { display:flex; gap:8px; padding:12px 15px; overflow-x:auto; background:#161616; flex-shrink:0; }
        .pact { border:none; border-radius:8px; padding:10px 14px; color:white; font-weight:bold; font-size:11px; white-space:nowrap; cursor:pointer; display:flex; align-items:center; gap:5px; flex-shrink:0; }
        .pact:active { transform:scale(.95); }
        .pact.bl{background:#1565c0} .pact.gr{background:#2e7d32} .pact.pu{background:#6a1b9a} .pact.te{background:#00796b} .pact.gy{background:#444} .pact.re{background:#c62828}
        
        /* CMD MODAL */
        #u-cmd { position:fixed; top:50%; left:50%; transform:translate(-50%, -50%); background:#111; border-radius:16px; z-index:2147483647; width:94%; max-width:500px; padding:18px; display:none; box-shadow:0 15px 50px #000; font-family:sans-serif; border:1px solid #333; max-height:80vh; overflow-y:auto; }
        #u-cmd.on { display:block; }
        .cmd-block { background:#0a0a0a; border-radius:10px; padding:12px; margin-bottom:12px; border:1px solid #222; }
        .cmd-label { color:#888; font-size:10px; font-weight:bold; text-transform:uppercase; margin-bottom:6px; }
        .cmd-row { display:flex; gap:8px; align-items:stretch; }
        .cmd-ta { flex:1; background:transparent; color:#4caf50; border:none; font-family:monospace; font-size:11px; resize:none; line-height:1.5; outline:none; min-height:40px; }
        .cmd-cp { background:#1565c0; border:none; color:white; border-radius:8px; padding:0 14px; cursor:pointer; font-size:16px; display:flex; align-items:center; flex-shrink:0; }
        
        /* DROPDOWN */
        #u-drop { position:fixed; background:#1c1c1c; border-radius:12px; border:1px solid #333; z-index:2147483647; display:none; box-shadow:0 10px 40px #000; overflow:hidden; min-width:220px; }
        #u-drop.on { display:block; }
        .di { padding:12px 18px; color:#eee; font-size:13px; cursor:pointer; display:flex; align-items:center; gap:10px; border-bottom:1px solid #252525; }
        .di:hover { background:#2a2a2a; }
        
        #u-toast { position:fixed; bottom:30px; left:50%; transform:translateX(-50%); background:#e53935; color:white; padding:10px 20px; border-radius:25px; font-size:13px; font-weight:bold; z-index:2147483647; display:none; box-shadow:0 8px 20px rgba(0,0,0,.4); white-space:nowrap; }
    `;

    function initUI() {
        const s = document.createElement('style'); s.textContent = CSS; document.head.appendChild(s);
        document.body.insertAdjacentHTML('beforeend', `
            <button id="u-fab">🎬<span id="u-badge"></span></button>
            <div id="u-bd"></div>
            <div id="u-panel">
                <div id="u-ph">
                    <span id="u-ph-title">🎬 Streams</span>
                    <div id="u-ph-btns">
                        <button class="btn-scan" id="btn-deep"> QUÉT</button>
                        <button class="btn-clr" id="btn-clr"></button>
                    </div>
                </div>
                <div id="u-pb"></div>
            </div>
            <div id="u-prev">
                <div id="u-prev-bar">
                    <span id="u-prev-title">-</span>
                    <button id="btn-opt" style="background:#222;border:none;color:#fff;width:36px;height:36px;border-radius:50%;cursor:pointer;font-size:18px">⋮</button>
                    <button id="btn-cls" style="background:#222;border:none;color:#f44336;width:36px;height:36px;border-radius:50%;cursor:pointer;font-size:18px">✕</button>
                </div>
                <div id="u-vid-wrap">
                    <video id="u-vid" controls playsinline></video>
                </div>
                <div class="p-acts" id="u-p-acts"></div>
            </div>
            <div id="u-drop"></div>
            <div id="u-cmd"></div>
            <div id="u-toast"></div>
        `);
        initLogic();
    }

    function initLogic() {
        const $ = id => document.getElementById(id);
        let cur = null, rot = 0, zoom = 1, ctab = 'ytdlp';

        function toast(m) {
            const t = $('u-toast'); t.textContent = m; t.style.display = 'block';
            setTimeout(() => t.style.display='none', 2500);
        }

        function cp(text) {
            const ta = document.createElement('textarea'); ta.value = text;
            ta.style.cssText = 'position:fixed;left:-9999px'; document.body.appendChild(ta);
            ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
            toast('✅ Đã copy!');
        }

        function render() {
            const pb = $('u-pb'); pb.innerHTML = '';
            if (!urls.size) { pb.innerHTML = '<div style="color:#555;text-align:center;padding:40px">Chưa tìm thấy media.<br>Bấm "QUÉT" hoặc "Play" video.</div>'; return; }
            
            [...urls.values()].sort((a,b)=>a.priority-b.priority).forEach(item => {
                const bc = 'lb-' + (['M3U8','MP4','IFRAME'].includes(item.type) ? item.type : 'other');
                const name = item.url.split('/').pop().split('?')[0] || 'Media';
                pb.insertAdjacentHTML('beforeend', `
                    <div class="li" data-url="${item.url}">
                        <div class="li-top">
                            <span class="li-badge ${bc}">${item.type}</span>
                            <span class="li-name">${name}</span>
                        </div>
                        <div class="li-src">${item.source}</div>
                        <div class="li-url">${item.url}</div>
                    </div>
                `);
            });
            pb.querySelectorAll('.li').forEach(el => {
                el.onclick = () => {
                    const item = urls.get(el.dataset.url);
                    if (item.type === 'IFRAME') {
                        if (handleJWPlayer(item.url)) {
                            toast(' Đang mở JWPlayer...');
                        } else {
                            window.open(item.url, '_blank');
                            toast('🚀 Đã mở Iframe');
                        }
                    } else openPrev(item);
                };
            });
        }

        function openPrev(item) {
            cur = item; rot = 0; zoom = 1;
            $('u-vid').style.transform = 'none';
            $('u-prev-title').textContent = item.url.split('/').pop();
            $('u-vid').src = item.url;
            $('u-vid').onerror = () => {
                toast('❌ Không phát được, thử mở tab mới');
            };
            $('u-p-acts').innerHTML = `
                <button class="pact bl" id="pc-cp">📋 Copy</button>
                <button class="pact gr" id="pc-vlc">📺 VLC</button>
                <button class="pact pu" id="pc-ytdl">💻 Tải</button>
                <button class="pact te" id="pc-rot">⟳</button>
                <button class="pact gy" id="pc-zm">🔍${zoom}x</button>
            `;
            $('pc-cp').onclick = () => cp(cur.url);
            $('pc-vlc').onclick = () => window.location.href = 'vlc://' + cur.url;
            $('pc-ytdl').onclick = () => openCmd(cur.url);
            $('pc-rot').onclick = () => { rot = (rot + 90) % 360; $('u-vid').style.transform = `rotate(${rot}deg) scale(${zoom})`; };
            $('pc-zm').onclick = (e) => {
                const lv = [1, 1.25, 1.5, 2, 0.75];
                zoom = lv[(lv.indexOf(zoom) + 1) % lv.length];
                e.target.textContent = `🔍${zoom}x`;
                $('u-vid').style.transform = `rotate(${rot}deg) scale(${zoom})`;
            };
            $('u-prev').classList.add('on'); $('u-bd').classList.add('on'); $('u-panel').classList.remove('on');
        }

        function openCmd(url) {
            const build = (t) => {
                ctab = t;
                let data = [];
                if (t==='ytdlp') data = [
                    { l:'Tải chất lượng cao', c:`yt-dlp --referer "${REF}" "${url}"` },
                    { l:'Bypass với header đầy đủ', c:`yt-dlp --referer "${REF}" --user-agent "${UA}" --add-header "Origin:${location.origin}" -f "bestvideo+bestaudio" "${url}"` }
                ];
                if (t==='ffmpeg') data = [
                    { l:'Copy stream nhanh', c:`ffmpeg -referer "${REF}" -user_agent "${UA}" -i "${url}" -c copy output.mp4` }
                ];
                if (t==='termux') data = [
                    { l:'Cài tools', c:`pkg install python ffmpeg -y && pip install yt-dlp` },
                    { l:'Tải video', c:`yt-dlp --referer "${REF}" "${url}"` }
                ];

                $('u-cmd').innerHTML = `
                    <div style="display:flex;justify-content:space-between;margin-bottom:15px"><h4 style="color:#fff;margin:0">💻 Lệnh tải</h4><span style="color:#555;font-size:10px;font-family:monospace">${url.substring(0,30)}...</span></div>
                    <div style="display:flex;gap:5px;margin-bottom:15px">${['ytdlp','ffmpeg','termux'].map(tab=>`<button class="ctab" style="background:${tab===t?'#e53935':'#222'};color:white;border:none;padding:8px 12px;border-radius:8px;cursor:pointer;font-size:11px" data-tab="${tab}">${tab.toUpperCase()}</button>`).join('')}</div>
                    <div id="cmd-list">${data.map(d=>`
                        <div class="cmd-block">
                            <div class="cmd-label">${d.l}</div>
                            <div class="cmd-row">
                                <textarea class="cmd-ta" rows="2" readonly>${d.c}</textarea>
                                <button class="cmd-cp">📋</button>
                            </div>
                        </div>
                    `).join('')}</div>
                    <button class="pact re" style="width:100%;justify-content:center" id="cmd-cls">ĐÓNG</button>
                `;
                $('u-cmd').querySelectorAll('.ctab').forEach(b=>b.onclick=()=>build(b.dataset.tab));
                $('u-cmd').querySelectorAll('.cmd-cp').forEach(b=>b.onclick=()=>{ cp(b.parentElement.querySelector('textarea').value); });
                $('cmd-cls').onclick=()=>{$('u-cmd').classList.remove('on'); if(!$('u-prev').classList.contains('on')) $('u-bd').classList.remove('on');};
            };
            build(ctab);
            $('u-cmd').classList.add('on'); $('u-bd').classList.add('on');
        }

        $('u-fab').onclick = () => {
            if ($('u-panel').classList.contains('on')) { $('u-panel').classList.remove('on'); $('u-bd').classList.remove('on'); }
            else { scan(document,'main'); scanPerf(); render(); $('u-panel').classList.add('on'); $('u-bd').classList.add('on'); }
        };
        $('btn-deep').onclick = () => { scan(document,'deep'); scanPerf(); render(); toast('✅ Quét xong!'); };
        $('btn-clr').onclick = () => { urls.clear(); updateBadge(); render(); };
        $('btn-cls').onclick = () => { $('u-vid').pause(); $('u-prev').classList.remove('on'); $('u-bd').classList.remove('on'); };
        
        $('btn-opt').onclick = (e) => {
            e.stopPropagation();
            const d = $('u-drop');
            d.innerHTML = `
                <div class="di" id="m-new">🌐 Mở Tab mới</div>
                <div class="di" id="m-share">🔗 Chia sẻ</div>
                <div class="di" id="m-cls" style="color:#f44336">✕ Đóng</div>
            `;
            const r = $('btn-opt').getBoundingClientRect();
            d.style.top = (r.bottom + 10) + 'px'; d.style.right = '15px'; d.style.display = 'block';
            $('m-new').onclick = () => { window.open(cur.url,'_blank'); d.style.display='none'; };
            $('m-share').onclick = () => { navigator.share({url:cur.url}); d.style.display='none'; };
            $('m-cls').onclick = () => d.style.display='none';
        };

        $('u-bd').onclick = () => {
            $('u-panel').classList.remove('on'); $('u-prev').classList.remove('on'); $('u-cmd').classList.remove('on');
            $('u-bd').classList.remove('on'); $('u-drop').style.display='none'; $('u-vid').pause();
        };
    }

    setInterval(scanPerf, 3000);
    setTimeout(() => { scan(document,'auto'); updateBadge(); }, 2000);
    if (document.body) initUI(); else document.addEventListener('DOMContentLoaded', initUI);
})();