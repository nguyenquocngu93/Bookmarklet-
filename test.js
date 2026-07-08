// ==UserScript==
// @name         Universal Media Player v15 - Final Ultra
// @namespace    http://tampermonkey.net/
// @version      15.0
// @description  Cỗ máy quét media toàn năng: Trình phát Pro, Iframe Hunter, Lệnh tải đa năng
// @author       You
// @match        *://*/*
// @grant        none
// @run-at       document-start
// ==/UserScript==

(function () {
    'use strict';

    // ── BIẾN HỆ THỐNG ──
    const urls = new Map();
    const patterns = [
        { re: /https?:\/\/[^\s"'<>()\\\]]+\.m3u8[^\s"'<>()\\\]]*/gi, type: 'M3U8', priority: 1 },
        { re: /https?:\/\/[^\s"'<>()\\\]]+\.mpd[^\s"'<>()\\\]]*/gi,  type: 'MPD',  priority: 2 },
        { re: /https?:\/\/[^\s"'<>()\\\]]+\.mp4[^\s"'<>()\\\]]*/gi,  type: 'MP4',  priority: 3 },
        { re: /https?:\/\/[^\s"'<>()\\\]]+\.webm[^\s"'<>()\\\]]*/gi, type: 'WEBM', priority: 4 },
        { re: /https?:\/\/[^\s"'<>()\\\]]+\.mkv[^\s"'<>()\\\]]*/gi,  type: 'MKV',  priority: 5 },
    ];
    // Pattern nhận diện Iframe Player (njav, missav...)
    const IFRAME_RE = /https?:\/\/[^\s"'<>()\\\]]+\/(v|embed|e|vv|jm|t|watch)\/[^\s"'<>()\\\]]*/gi;
    const AD_PATTERNS = /doubleclick|googlesyndication|googleadservices|adservice|pagead|adnxs|vli\.|popup|banner/i;
    const REF = location.href;
    const UA  = 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36';

    // ── HÀM TIỆN ÍCH ──
    function cleanUrl(u) {
        return u.replace(/\\u002F/gi,'/').replace(/\\\//g,'/').replace(/&amp;/g,'&').replace(/\\"/g,'').replace(/["')\]>\s]+$/,'').trim();
    }

    function addUrl(u, type, source, priority) {
        u = cleanUrl(u);
        if (!u.startsWith('http') || AD_PATTERNS.test(u)) return;
        if (!urls.has(u) || urls.get(u).priority > priority) {
            urls.set(u, { url: u, type, source, priority, ts: Date.now() });
            updateBadge();
        }
    }

    function updateBadge() {
        const b = document.getElementById('u-badge');
        if (b) { b.style.display = urls.size ? 'flex' : 'none'; b.textContent = urls.size; }
    }

    // ── CƠ CHẾ QUÉT (SCANNER) ──
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

    // Hook Network (Bắt link ngầm)
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

    // ── GIAO DIỆN (CSS) ──
    const CSS = `
        #u-fab { position:fixed; bottom:20px; right:20px; width:60px; height:60px; background:#e53935; color:white; border:none; border-radius:50%; font-size:26px; cursor:pointer; box-shadow:0 5px 20px rgba(0,0,0,.5); z-index:2147483647; display:flex; align-items:center; justify-content:center; }
        #u-badge { position:absolute; top:-2px; right:-2px; background:#43a047; color:white; font-size:11px; min-width:22px; height:22px; border-radius:11px; display:none; align-items:center; justify-content:center; font-weight:bold; border:2px solid #fff; }
        #u-bd { position:fixed; inset:0; background:rgba(0,0,0,.8); z-index:2147483640; display:none; backdrop-filter:blur(3px); }
        #u-bd.on { display:block; }

        /* LIST PANEL */
        #u-panel { position:fixed; bottom:90px; right:15px; width:380px; max-width:calc(100vw - 30px); max-height:75vh; background:#111; border-radius:18px; z-index:2147483647; display:none; flex-direction:column; box-shadow:0 15px 50px #000; overflow:hidden; font-family:sans-serif; border:1px solid #222; }
        #u-panel.on { display:flex; }
        #u-ph { background:#1e1e1e; padding:15px; display:flex; align-items:center; gap:10px; border-bottom:1px solid #2a2a2a; }
        #u-ph-title { color:#fff; font-size:15px; font-weight:bold; flex:1; }
        #u-pb { overflow-y:auto; flex:1; background:#0a0a0a; padding-bottom:10px; }
        
        .li { padding:15px; border-bottom:1px solid #181818; cursor:pointer; transition:.1s; }
        .li:active { background:#1a1a1a; }
        .li-top { display:flex; align-items:center; gap:8px; margin-bottom:8px; }
        .li-badge { font-size:10px; font-weight:900; padding:3px 8px; border-radius:5px; color:white; text-transform:uppercase; }
        .lb-M3U8{background:#7b1fa2;} .lb-MP4{background:#2e7d32;} .lb-IFRAME{background:#1565c0; animation:glow 1.5s infinite;} .lb-other{background:#444;}
        @keyframes glow { 0%{box-shadow:0 0 0px #1565c0} 50%{box-shadow:0 0 10px #1565c0} 100%{box-shadow:0 0 0px #1565c0} }
        .li-name { color:#fff; font-size:13px; font-weight:600; flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .li-url { color:#4fc3f7; font-size:10px; font-family:monospace; word-break:break-all; background:#000; padding:10px; border-radius:8px; line-height:1.5; border:1px solid #222; }
        .li-src { color:#555; font-size:10px; font-weight:bold; }

        /* PREVIEW PLAYER PRO */
        #u-prev { position:fixed; bottom:0; left:0; right:0; background:#111; z-index:2147483647; display:none; flex-direction:column; border-radius:20px 20px 0 0; box-shadow:0 -10px 50px #000; font-family:sans-serif; }
        #u-prev.on { display:flex; }
        #u-prev-bar { display:flex; align-items:center; padding:12px 15px; gap:10px; border-bottom:1px solid #222; }
        #u-prev-title { flex:1; color:#fff; font-size:13px; font-weight:bold; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        #u-vid-wrap { position:relative; background:#000; width:100%; height:250px; overflow:hidden; display:flex; align-items:center; justify-content:center; }
        #u-vid { width:100%; height:100%; object-fit:contain; transition:transform .3s cubic-bezier(0.4, 0, 0.2, 1); }
        
        .p-acts { display:flex; gap:10px; padding:15px; overflow-x:auto; background:#161616; }
        .pact { border:none; border-radius:10px; padding:12px 18px; color:white; font-weight:bold; font-size:12px; white-space:nowrap; cursor:pointer; display:flex; align-items:center; gap:6px; }
        .pact:active { transform:scale(.95); }
        .pact.bl{background:#1565c0} .pact.gr{background:#2e7d32} .pact.pu{background:#6a1b9a} .pact.re{background:#c62828} .pact.te{background:#00796b} .pact.gy{background:#333}
        
        /* CMD MODAL PRO */
        #u-cmd { position:fixed; top:50%; left:50%; transform:translate(-50%, -50%); background:#111; border-radius:20px; z-index:2147483647; width:94%; max-width:550px; padding:20px; display:none; box-shadow:0 20px 60px #000; font-family:sans-serif; border:1px solid #333; }
        #u-cmd.on { display:block; }
        .cmd-block { background:#0a0a0a; border-radius:12px; padding:12px; margin-bottom:15px; border:1px solid #222; }
        .cmd-label { color:#888; font-size:10px; font-weight:bold; text-transform:uppercase; margin-bottom:8px; display:flex; justify-content:space-between; }
        .cmd-row { display:flex; gap:10px; }
        .cmd-ta { flex:1; background:transparent; color:#4caf50; border:none; font-family:monospace; font-size:11px; resize:none; line-height:1.6; outline:none; }
        .cmd-cp { background:#1565c0; border:none; color:white; border-radius:8px; padding:0 15px; cursor:pointer; font-size:18px; display:flex; align-items:center; }
        
        /* DROPDOWN & QUALITY */
        #u-drop, #u-qs { position:fixed; background:#1c1c1c; border-radius:15px; border:1px solid #333; z-index:2147483647; display:none; box-shadow:0 10px 40px #000; overflow:hidden; min-width:240px; }
        #u-drop.on, #u-qs.on { display:block; }
        .di { padding:14px 20px; color:#eee; font-size:14px; cursor:pointer; display:flex; align-items:center; gap:12px; border-bottom:1px solid #252525; }
        .di:hover { background:#2a2a2a; }
        .di-icon { font-size:18px; width:24px; text-align:center; }
        
        #u-toast { position:fixed; bottom:40px; left:50%; transform:translateX(-50%); background:#e53935; color:white; padding:12px 25px; border-radius:30px; font-size:14px; font-weight:bold; z-index:2147483647; display:none; box-shadow:0 10px 20px rgba(0,0,0,.4); }
    `;

    // ── KHỞI TẠO UI ──
    function initUI() {
        const s = document.createElement('style'); s.textContent = CSS; document.head.appendChild(s);
        document.body.insertAdjacentHTML('beforeend', `
            <button id="u-fab">🎬<span id="u-badge"></span></button>
            <div id="u-bd"></div>
            <div id="u-panel">
                <div id="u-ph">
                    <span id="u-ph-title">🎬 Streams</span>
                    <button id="btn-deep" style="background:#1565c0;color:white;border:none;padding:8px 15px;border-radius:10px;font-size:12px;font-weight:bold;cursor:pointer">🔍 QUÉT MẠNH</button>
                    <button id="btn-clr" style="background:none;border:none;color:#555;font-size:22px;cursor:pointer">🗑</button>
                </div>
                <div id="u-pb"></div>
            </div>
            <div id="u-prev">
                <div id="u-prev-bar">
                    <span id="u-prev-title">Đang tải...</span>
                    <button id="btn-opt" style="background:#222;border:none;color:#fff;width:38px;height:38px;border-radius:50%;cursor:pointer;font-size:20px">⋮</button>
                    <button id="btn-cls" style="background:#222;border:none;color:#f44336;width:38px;height:38px;border-radius:50%;cursor:pointer;font-size:20px">✕</button>
                </div>
                <div id="u-vid-wrap">
                    <video id="u-vid" controls playsinline></video>
                </div>
                <div class="p-acts" id="u-p-acts"></div>
            </div>
            <div id="u-drop"></div>
            <div id="u-qs"></div>
            <div id="u-cmd"></div>
            <div id="u-toast"></div>
        `);
        initLogic();
    }

    // ── XỬ LÝ LOGIC ──
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
            if (!urls.size) { pb.innerHTML = '<div class="ump-empty" style="color:#555;text-align:center;padding:50px">Chưa tìm thấy media.<br>Bấm "QUÉT MẠNH" hoặc "Play" video.</div>'; return; }
            
            [...urls.values()].sort((a,b)=>a.priority-b.priority).forEach(item => {
                const bc = 'lb-' + (['M3U8','MP4','IFRAME'].includes(item.type) ? item.type : 'other');
                const name = item.url.split('/').pop().split('?')[0] || 'Media File';
                pb.insertAdjacentHTML('beforeend', `
                    <div class="li" data-url="${item.url}">
                        <div class="li-top">
                            <span class="li-badge ${bc}">${item.type}</span>
                            <span class="li-name">${name}</span>
                        </div>
                        <div class="li-src">Nguồn: ${item.source}</div>
                        <div class="li-url">${item.url}</div>
                    </div>
                `);
            });
            pb.querySelectorAll('.li').forEach(el => {
                el.onclick = () => {
                    const item = urls.get(el.dataset.url);
                    if (item.type === 'IFRAME') { window.open(item.url, '_blank'); toast('🚀 Vào Iframe thành công!'); }
                    else openPrev(item);
                };
            });
        }

        function openPrev(item) {
            cur = item; rot = 0; zoom = 1;
            $('u-vid').style.transform = 'none';
            $('u-prev-title').textContent = item.url.split('/').pop();
            $('u-vid').src = item.url;
            $('u-p-acts').innerHTML = `
                <button class="pact bl" id="pc-cp">📋 Copy</button>
                <button class="pact gr" id="pc-vlc">📺 VLC</button>
                <button class="pact pu" id="pc-ytdl">💻 Lệnh Tải</button>
                <button class="pact te" id="pc-rot">⟳ Xoay</button>
                <button class="pact gy" id="pc-zm">🔍 Zoom (${zoom}x)</button>
            `;
            $('pc-cp').onclick = () => cp(cur.url);
            $('pc-vlc').onclick = () => window.location.href = 'vlc://' + cur.url;
            $('pc-ytdl').onclick = () => openCmd(cur.url);
            $('pc-rot').onclick = () => { rot = (rot + 90) % 360; $('u-vid').style.transform = `rotate(${rot}deg) scale(${zoom})`; };
            $('pc-zm').onclick = (e) => {
                const lv = [1, 1.25, 1.5, 2, 0.75];
                zoom = lv[(lv.indexOf(zoom) + 1) % lv.length];
                e.target.textContent = `🔍 Zoom (${zoom}x)`;
                $('u-vid').style.transform = `rotate(${rot}deg) scale(${zoom})`;
            };
            $('u-prev').classList.add('on'); $('u-bd').classList.add('on'); $('u-panel').classList.remove('on');
        }

        function openCmd(url) {
            const build = (t) => {
                ctab = t;
                let data = [];
                if (t==='ytdlp') data = [
                    { l:'Tải chất lượng cao nhất', c:`yt-dlp --referer "${REF}" "${url}"` },
                    { l:'Tải với đầy đủ Header (Bypass)', c:`yt-dlp --referer "${REF}" --user-agent "${UA}" --add-header "Origin:${location.origin}" -f "bestvideo+bestaudio" "${url}"` },
                    { l:'Chỉ lấy Audio MP3', c:`yt-dlp -x --audio-format mp3 --referer "${REF}" "${url}"` }
                ];
                if (t==='ffmpeg') data = [
                    { l:'Copy Stream (Nhanh nhất)', c:`ffmpeg -referer "${REF}" -user_agent "${UA}" -i "${url}" -c copy video_out.mp4` }
                ];
                if (t==='termux') data = [
                    { l:'Cài đặt (Chạy 1 lần)', c:`pkg install python ffmpeg -y && pip install yt-dlp` },
                    { l:'Lệnh tải chính', c:`yt-dlp --referer "${REF}" "${url}"` }
                ];

                $('u-cmd').innerHTML = `
                    <div style="display:flex;justify-content:space-between;margin-bottom:15px"><h4 style="color:#fff;margin:0">💻 Lệnh tải</h4><span style="color:#555;font-size:10px;font-family:monospace">${itemAlias(url)}</span></div>
                    <div class="cmd-tabs" style="display:flex;gap:5px;margin-bottom:15px">${['ytdlp','ffmpeg','termux'].map(tab=>`<button class="ctab ${tab===t?'on':''}" style="background:${tab===t?'#e53935':'#222'};color:white;border:none;padding:8px 12px;border-radius:8px;cursor:pointer" data-tab="${tab}">${tab.toUpperCase()}</button>`).join('')}</div>
                    <div id="cmd-list">${data.map(d=>`
                        <div class="cmd-block">
                            <div class="cmd-label"><span>${d.l}</span></div>
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

        function itemAlias(u) { return u.substring(0,30)+'...'; }

        // Event Control
        $('u-fab').onclick = () => {
            if ($('u-panel').classList.contains('on')) { $('u-panel').classList.remove('on'); $('u-bd').classList.remove('on'); }
            else { scan(document,'main'); scanPerf(); render(); $('u-panel').classList.add('on'); $('u-bd').classList.add('on'); }
        };
        $('btn-deep').onclick = () => { scan(document,'deep'); scanPerf(); render(); toast('🔍 Deep Scan hoàn tất!'); };
        $('btn-clr').onclick = () => { urls.clear(); updateBadge(); render(); };
        $('btn-cls').onclick = () => { $('u-vid').pause(); $('u-prev').classList.remove('on'); $('u-bd').classList.remove('on'); };
        
        $('btn-opt').onclick = (e) => {
            e.stopPropagation();
            const d = $('u-drop');
            d.innerHTML = `
                <div class="di" id="m-qs"><span class="di-icon">🎞</span> Chất lượng HLS</div>
                <div class="di" id="m-new"><span class="di-icon">🌐</span> Mở Tab mới</div>
                <div class="di" id="m-share"><span class="di-icon">🔗</span> Chia sẻ</div>
                <div class="di red" id="m-cls" style="color:#f44336"><span class="di-icon">✕</span> Đóng</div>
            `;
            const r = $('btn-opt').getBoundingClientRect();
            d.style.top = (r.bottom + 10) + 'px'; d.style.right = '15px'; d.style.display = 'block';
            
            $('m-qs').onclick = () => {
                d.style.display='none';
                toast('⌛ Đang parse M3U8...');
                fetch(cur.url).then(res=>res.text()).then(text=>{
                    if(!text.includes('#EXT-X-STREAM-INF')){ toast('File này không hỗ trợ đa chất lượng'); return; }
                    const qsh = $('u-qs');
                    const lines = text.split('\n');
                    let listHtml = `<div style="padding:15px;font-weight:bold;color:#888;font-size:11px;border-bottom:1px solid #222">CHỌN CHẤT LƯỢNG</div>`;
                    for(let i=0;i<lines.length;i++){
                        if(lines[i].includes('RESOLUTION=')){
                            const res = lines[i].match(/RESOLUTION=(\d+x\d+)/)[1];
                            const url = lines[i+1].startsWith('http') ? lines[i+1] : cur.url.substring(0, cur.url.lastIndexOf('/')+1) + lines[i+1];
                            listHtml += `<div class="di q-item" data-url="${url}"><span>${res.split('x')[1]}p</span></div>`;
                        }
                    }
                    qsh.innerHTML = listHtml; qsh.style.bottom='0'; qsh.style.left='0'; qsh.style.right='0'; qsh.style.display='block';
                    qsh.querySelectorAll('.q-item').forEach(qi=>{
                        qi.onclick=()=>{ $('u-vid').src=qi.dataset.url; qsh.style.display='none'; toast('▶ Đang phát '+qi.textContent); };
                    });
                });
            };
            $('m-new').onclick = () => window.open(cur.url,'_blank');
            $('m-share').onclick = () => navigator.share({url:cur.url});
            $('m-cls').onclick = () => d.style.display='none';
        };

        $('u-bd').onclick = () => {
            $('u-panel').classList.remove('on'); $('u-prev').classList.remove('on'); $('u-cmd').classList.remove('on');
            $('u-bd').classList.remove('on'); $('u-drop').style.display='none'; $('u-qs').style.display='none'; $('u-vid').pause();
        };
    }

    // Tự động quét
    setInterval(scanPerf, 3000);
    setTimeout(() => { scan(document,'auto'); updateBadge(); }, 2000);
    if (document.body) initUI(); else document.addEventListener('DOMContentLoaded', initUI);
})();