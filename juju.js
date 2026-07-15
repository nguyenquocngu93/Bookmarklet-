javascript:(function(){
'use strict';
var VERSION='6.7.8-v8';
(function(){var old=document.getElementById('__uvd__');if(old)old.remove();var oldMin=document.getElementById('__uvd_min_float__');if(oldMin)oldMin.remove();})();
var STORAGE_KEY='uvd_data_v54';
var storage={get:function(){try{return JSON.parse(localStorage.getItem(STORAGE_KEY))||{};}catch(e){return{};}},set:function(d){try{localStorage.setItem(STORAGE_KEY,JSON.stringify(d));}catch(e){}}};
var data=storage.get();
data.favorites=data.favorites||[];data.siteProfiles=data.siteProfiles||{};data.history=data.history||[];data.filterlist=data.filterlist||[];data.playbackPositions=data.playbackPositions||{};
data.settings=Object.assign({defaultSpeed:1,defaultQuality:'auto',dataSaver:false,autoFullscreen:false,resumePlayback:true,volumeBoost:false,volumeBoostMax:200,autoNext:false,reduceMotion:false,blurIntensity:24,transitionSpeed:0.3,transitionEasing:'ease',doubleTapSeconds:10,autoHideControls:true,showRemainingTime:true,hideDelay:5,maxStoredUrls:200,blockAutoplay:true,glowEffects:true,effectsIntensity:55,subdlApiKey:''},data.settings||{});
var defaultProfiles={'videoplay.us':{referer:'https://videoplay.us/',userAgent:''},'streamtape.com':{referer:'https://streamtape.com/',userAgent:''},'ok.ru':{referer:'https://ok.ru/',userAgent:''},'fembed.com':{referer:'https://fembed.com/',userAgent:''},'mp4upload.com':{referer:'https://mp4upload.com/',userAgent:''}};
var host=location.hostname.replace('www.','');
var profile=data.siteProfiles[host]||defaultProfiles[host]||{referer:location.origin+'/',origin:location.origin,userAgent:navigator.userAgent};
var pageInfo={title:(document.title||'video').replace(/[^\w\s\u00C0-\u1EF9]/g,'').substring(0,60).trim()||'video',url:location.href,host:host,referer:profile.referer,origin:location.origin,userAgent:profile.userAgent||navigator.userAgent};
function __uvdAppendRoot(el){(document.documentElement||document.body).appendChild(el);}
function escapeHtml(text){if(!text)return'';var div=document.createElement('div');div.textContent=text;return div.innerHTML;}
function applyEffectsPref(el){if(!el)return;var on=!!data.settings.glowEffects&&!data.settings.reduceMotion;el.classList.toggle('uvd-fx-on',on);var intensity=Math.max(0,Math.min(100,data.settings.effectsIntensity==null?55:data.settings.effectsIntensity));el.style.setProperty('--glow-px',on?Math.round(4+intensity*0.18)+'px':'0px');el.style.setProperty('--glow-op',on?(0.15+intensity*0.0035).toFixed(3):'0');}
function applyMotionPref(el){if(!el)return;el.classList.toggle('uvd-reduce-motion',!!data.settings.reduceMotion);var blur=data.settings.reduceMotion?0:data.settings.blurIntensity;var speed=data.settings.reduceMotion?0:data.settings.transitionSpeed;el.style.setProperty('--uvd-blur',blur+'px');el.style.setProperty('--uvd-transition',speed+'s '+data.settings.transitionEasing);}
var __uvdAdBlockedCount=0;var compiledFilters=[];
function compileAdFilters(){compiledFilters=[];(data.filterlist||[]).forEach(function(raw){var pattern=(raw||'').trim().toLowerCase();if(!pattern)return;if(pattern.indexOf('regex:')===0){try{compiledFilters.push({type:'regex',re:new RegExp(pattern.slice(6),'i')});}catch(e){}}else{compiledFilters.push({type:'plain',value:pattern});}});}
compileAdFilters();
function isAdUrl(url){if(!compiledFilters.length)return false;var lowerUrl=url.toLowerCase();for(var i=0;i<compiledFilters.length;i++){var f=compiledFilters[i];if(f.type==='regex'){if(f.re.test(url))return true;}else if(lowerUrl.indexOf(f.value)!==-1)return true;}return false;}
var urls=new Map();
var patterns=[{re:/https?:\/\/[^\s"'<>()\\]+\.m3u8[^\s"'<>()\\]*/gi,type:'M3U8',priority:1},{re:/https?:\/\/[^\s"'<>()\\]+\.mpd[^\s"'<>()\\]*/gi,type:'MPD',priority:2},{re:/https?:\/\/[^\s"'<>()\\]+\.mp4[^\s"'<>()\\]*/gi,type:'MP4',priority:3},{re:/https?:\/\/[^\s"'<>()\\]+\.webm[^\s"'<>()\\]*/gi,type:'WEBM',priority:4},{re:/https?:\/\/[^\s"'<>()\\]+\.mkv[^\s"'<>()\\]*/gi,type:'MKV',priority:5},{re:/https?:\/\/[^\s"'<>()\\]+\.flv[^\s"'<>()\\]*/gi,type:'FLV',priority:6},{re:/https?:\/\/[^\s"'<>()\\]+\.ts[^\s"'<>()\\]*/gi,type:'TS',priority:7},{re:/blob:https?:\/\/[^\s"'<>()\\]+/gi,type:'BLOB',priority:8}];
function findUrls(text,source){if(!text||typeof text!=='string')return;patterns.forEach(function(p){var matches=text.match(p.re);if(matches){matches.forEach(function(u){u=u.replace(/\\u002F/g,'/').replace(/\\\//g,'/').replace(/&amp;/g,'&').replace(/\\"/g,'');if(isAdUrl(u)){__uvdAdBlockedCount++;return;}if(!urls.has(u)||urls.get(u).priority>p.priority){urls.set(u,{type:p.type,source:source,priority:p.priority,timestamp:Date.now()});}});}});if(urls.size>data.settings.maxStoredUrls){var toRemove=urls.size-data.settings.maxStoredUrls;var keys=[...urls.keys()].sort(function(a,b){return urls.get(a).timestamp-urls.get(b).timestamp;});for(var i=0;i<toRemove;i++){urls.delete(keys[i]);}}}
function scan(doc,src){try{doc.querySelectorAll('video, source, audio').forEach(function(v){if(v.src)findUrls(v.src,src+':element');if(v.currentSrc)findUrls(v.currentSrc,src+':current');});doc.querySelectorAll('script').forEach(function(s){findUrls(s.textContent,src+':script');});findUrls(doc.documentElement.outerHTML,src+':html');doc.querySelectorAll('iframe').forEach(function(i,idx){if(i.src){var iframeUrl=i.src;if(!isAdUrl(iframeUrl)){urls.set(iframeUrl,{type:'IFRAME',source:'iframe#'+idx,priority:99,timestamp:Date.now()});}else{__uvdAdBlockedCount++;}}try{if(i.contentDocument)scan(i.contentDocument,'iframe#'+idx);}catch(e){}});}catch(e){}}
var __uvdPopupBlockActive=false;var __uvdOriginalWindowOpen=null;var __uvdBlockedCount=0;
window.__uvdSafeOpen=function(url){if(__uvdOriginalWindowOpen){return __uvdOriginalWindowOpen(url,'_blank');}return window.open(url,'_blank');};
function killBlankLinks(e){var t=e.target;if(t.closest&&(t.closest('#__uvd__')||t.closest('#__uvd_player_overlay__')))return;while(t&&t!==document){if(t&&t.tagName==='A'){var tg=t.target;if(tg&&tg!=='_self'&&tg!=='_top'&&tg!=='_parent'){e.preventDefault();e.stopPropagation();__uvdBlockedCount++;return;}}t=t.parentNode;}}
function installPopupBlock(){if(__uvdPopupBlockActive)return;__uvdPopupBlockActive=true;__uvdOriginalWindowOpen=window.open;window.open=function(){__uvdBlockedCount++;return null;};['click','mousedown','pointerdown','auxclick'].forEach(function(type){document.addEventListener(type,killBlankLinks,true);});}
function uninstallPopupBlock(){if(!__uvdPopupBlockActive)return;__uvdPopupBlockActive=false;if(__uvdOriginalWindowOpen)window.open=__uvdOriginalWindowOpen;['click','mousedown','pointerdown','auxclick'].forEach(function(type){document.removeEventListener(type,killBlankLinks,true);});}
var AUTO_PLAY_SELECTORS=['.fluid_initial_play','.fluid_control_play','.fluid_initial_play_button','.jw-display-icon-container','.jw-icon-display','.jw-icon-playback','.vjs-big-play-button','.vjs-play-control','.plyr__control--overlaid','.plyr__control[data-plyr="play"]','.fp-play','.fp-playbtn','.flowplayer .fp-ui','.mejs-overlay-play','.mejs-play > button','.mejs-overlay-button','.play-button','.playbtn','.btn-play','.video-play-button','.play-icon','.play-overlay','.overlay-play','.video-play','.player-play-button','.vjs-poster','.video-thumb-play','.play-btn-circle','[aria-label="Play"]','[aria-label="play"]','[aria-label="Play Video"]','[title="Play"]','[title="play"]','[title="Play Video"]','button.play','div.play','span.play'];
function simulateClick(el){try{var rect=el.getBoundingClientRect();if(!rect.width||!rect.height)return false;var x=rect.left+rect.width/2;var y=rect.top+rect.height/2;['pointerdown','mousedown','pointerup','mouseup','click'].forEach(function(type){var ev;try{ev=new MouseEvent(type,{bubbles:true,cancelable:true,view:window,clientX:x,clientY:y});}catch(e){ev=document.createEvent('MouseEvent');ev.initMouseEvent(type,true,true,window,0,0,0,x,y,false,false,false,false,0,null);}el.dispatchEvent(ev);});if(typeof el.click==='function')el.click();return true;}catch(e){return false;}}
function autoClickPlayButtons(root,depth,allowVideoPlayFallback){root=root||document;depth=depth||0;if(depth>3)return 0;var clicked=0;var customSel=(data.siteProfiles[pageInfo.host]&&data.siteProfiles[pageInfo.host].playSelector)||'';var selectors=customSel?[customSel].concat(AUTO_PLAY_SELECTORS):AUTO_PLAY_SELECTORS;selectors.forEach(function(sel){try{root.querySelectorAll(sel).forEach(function(el){if(simulateClick(el))clicked++;});}catch(e){}});if(allowVideoPlayFallback){try{root.querySelectorAll('video').forEach(function(v){if(v.paused){var wasMuted=v.muted;v.muted=true;v.__uvdAllow=true;var p=v.play();if(p&&p.then){p.then(function(){setTimeout(function(){try{v.pause();v.currentTime=0;v.muted=wasMuted;}catch(e){};v.__uvdAllow=false;},600);}).catch(function(){v.__uvdAllow=false;});}else{v.__uvdAllow=false;}}});}catch(e){}}try{root.querySelectorAll('iframe').forEach(function(f){try{if(f.contentDocument)clicked+=autoClickPlayButtons(f.contentDocument,depth+1,allowVideoPlayFallback);}catch(e){}});}catch(e){}return clicked;}
function pauseAllPlayingVideos(root,depth){root=root||document;depth=depth||0;var pausedCount=0;try{root.querySelectorAll('video').forEach(function(v){if(!v.paused){try{v.pause();pausedCount++;}catch(e){}}});}catch(e){}if(depth<2){try{root.querySelectorAll('iframe').forEach(function(f){try{if(f.contentDocument)pausedCount+=pauseAllPlayingVideos(f.contentDocument,depth+1);}catch(e){}});}catch(e){}}return pausedCount;}
var originalFetch=window.fetch;var originalXHROpen=XMLHttpRequest.prototype.open;var monitorActive=false;
function installMonitor(){if(monitorActive)return;monitorActive=true;window.fetch=function(){var url=arguments[0];if(typeof url==='string'){if(!isAdUrl(url))findUrls(url,'fetch:live');}else if(url&&url.url){if(!isAdUrl(url.url))findUrls(url.url,'fetch:live');}return originalFetch.apply(this,arguments);};XMLHttpRequest.prototype.open=function(method,url){if(url&&!isAdUrl(url))findUrls(url,'xhr:live');return originalXHROpen.apply(this,arguments);};}
function stopMonitor(){window.fetch=originalFetch;XMLHttpRequest.prototype.open=originalXHROpen;uninstallPopupBlock();monitorActive=false;}
var cleanupFunctions=[];
function addCleanup(fn){cleanupFunctions.push(fn);}
function runCleanup(){cleanupFunctions.forEach(function(fn){try{fn();}catch(e){}});cleanupFunctions=[];}
var __uvdNativeMediaPlay=HTMLMediaElement.prototype.play;
function __uvdIsAllowedMedia(el){return!!(el&&(el.__uvdAllow||el.id==='__uvd_player_video__'));}
HTMLMediaElement.prototype.play=function(){if(data.settings.blockAutoplay&&!__uvdIsAllowedMedia(this)){var self=this;setTimeout(function(){try{self.pause();}catch(e){}},0);return Promise.reject(new DOMException('UVD: đã chặn tự phát','NotAllowedError'));}return __uvdNativeMediaPlay.apply(this,arguments);};
addCleanup(function(){HTMLMediaElement.prototype.play=__uvdNativeMediaPlay;});
function __uvdNeutralizeMedia(el){if(!el||__uvdIsAllowedMedia(el))return;try{el.removeAttribute('autoplay');el.autoplay=false;if(!el.paused)el.pause();}catch(e){}}
function __uvdBlockPlayEvent(e){if(!data.settings.blockAutoplay)return;var el=e.target;if(el&&(el.tagName==='VIDEO'||el.tagName==='AUDIO')&&!__uvdIsAllowedMedia(el)){try{el.pause();}catch(err){}}}
document.addEventListener('play',__uvdBlockPlayEvent,true);
addCleanup(function(){document.removeEventListener('play',__uvdBlockPlayEvent,true);});
var __uvdAutoplayObserver=new MutationObserver(function(mutations){if(!data.settings.blockAutoplay)return;mutations.forEach(function(m){if(!m.addedNodes)return;m.addedNodes.forEach(function(node){if(!(node instanceof Element))return;if(node.tagName==='VIDEO'||node.tagName==='AUDIO')__uvdNeutralizeMedia(node);if(node.querySelectorAll){node.querySelectorAll('video,audio').forEach(__uvdNeutralizeMedia);}});});});
__uvdAutoplayObserver.observe(document.documentElement,{childList:true,subtree:true});
addCleanup(function(){__uvdAutoplayObserver.disconnect();});
try{document.querySelectorAll('video,audio').forEach(__uvdNeutralizeMedia);}catch(e){}
scan(document,'main');
try{performance.getEntriesByType('resource').forEach(function(e){if(!isAdUrl(e.name))findUrls(e.name,'network:perf');});}catch(e){}
installMonitor();installPopupBlock();
var panelObserver=new MutationObserver(function(){if(!document.getElementById('__uvd__')){stopMonitor();panelObserver.disconnect();runCleanup();}});
panelObserver.observe(document.body,{childList:true,subtree:true});
addCleanup(function(){panelObserver.disconnect();});
function runAutoClickAndRescan(silent){var beforeCount=urls.size;var clicked=0;installPopupBlock();clicked=autoClickPlayButtons(document,0,!silent);setTimeout(function(){scan(document,'autoclick-rescan');var afterCount=urls.size;var found=afterCount-beforeCount;if(found>0){toast('▶ Tự động Play: tìm thêm '+found+' luồng mới');if(document.getElementById('__uvd__'))buildUI();setTimeout(function(){var n=pauseAllPlayingVideos();if(n>0)toast('⏸ Đã tạm dừng video gốc, xem qua player script cho ổn định');},800);}else if(!silent){toast(clicked>0?'Đã bấm Play nhưng chưa thấy link mới, thử lại sau vài giây':'Không tìm thấy nút Play trên trang này');}},1200);}
window.__uvd_autoClickPlay=function(){runAutoClickAndRescan(false);};
setTimeout(function(){runAutoClickAndRescan(true);},400);
function parseM3U8Master(url,callback){var controller=new AbortController();var timeout=setTimeout(function(){controller.abort();},15000);fetch(url,{headers:{'Referer':pageInfo.referer},signal:controller.signal}).then(function(r){clearTimeout(timeout);return r.text();}).then(function(text){if(!text.includes('#EXT-X-STREAM-INF')){callback(null);return;}var qualities=[];var lines=text.split('\n');for(var i=0;i<lines.length;i++){if(lines[i].startsWith('#EXT-X-STREAM-INF')){var info=lines[i];var nextLine=(lines[i+1]||'').trim();if(nextLine&&!nextLine.startsWith('#')){var resolution=(info.match(/RESOLUTION=(\d+x\d+)/)||[])[1]||'unknown';var bandwidth=parseInt((info.match(/BANDWIDTH=(\d+)/)||[])[1]||0);var codecs=(info.match(/CODECS="([^"]+)"/)||[])[1]||'';var quality=resolution.split('x')[1]||bandwidth;var qualityLabel=resolution==='unknown'?Math.round(bandwidth/1000)+'kbps':quality+'p';var streamUrl=nextLine;if(!streamUrl.startsWith('http')){var baseUrl=url.substring(0,url.lastIndexOf('/')+1);streamUrl=baseUrl+streamUrl;}qualities.push({label:qualityLabel,resolution:resolution,bandwidth:bandwidth,codecs:codecs,url:streamUrl});}}}qualities.sort(function(a,b){return (parseInt(b.resolution.split('x')[1])||0)-(parseInt(a.resolution.split('x')[1])||0);});callback(qualities);}).catch(function(e){clearTimeout(timeout);console.error(e);callback(null);});}
function makeCommands(url,type,title){var t=title;var ext=type.toLowerCase()==='iframe'?'mp4':type.toLowerCase();var ref=pageInfo.referer;var origin=pageInfo.origin;var ua=pageInfo.userAgent;return{'yt-dlp':{label:'yt-dlp (cơ bản)',cmd:'yt-dlp --referer "'+ref+'" -o "'+t+'.%(ext)s" "'+url+'"'},'yt-dlp-bypass':{label:'yt-dlp (bypass)',cmd:'yt-dlp --force-ipv4 --no-check-certificate --user-agent "'+ua+'" --referer "'+ref+'" --add-header "Origin: '+origin+'" -f "bv*+ba/best" --merge-output-format mp4 -o "'+t+'.%(ext)s" "'+url+'"'},'yt-dlp-aria':{label:'yt-dlp + aria2',cmd:'yt-dlp --referer "'+ref+'" --downloader aria2c -o "'+t+'.%(ext)s" "'+url+'"'},'ffmpeg':{label:'FFmpeg',cmd:'ffmpeg -headers "Referer: '+ref+'\\r\\nOrigin: '+origin+'" -i "'+url+'" -c copy "'+t+'.mp4"'},'curl':{label:'cURL',cmd:'curl -H "Referer: '+ref+'" -o "'+t+'.'+ext+'" "'+url+'"'}};}
function copy(text){var ta=document.createElement('textarea');ta.value=text;document.body.appendChild(ta);ta.select();document.execCommand('copy');ta.remove();}
function toast(msg,color){var el=document.createElement('div');el.textContent=msg;el.style.cssText='position:fixed;top:20px;left:50%;transform:translateX(-50%);background:'+(color||'#3b82f6')+';color:#fff;padding:12px 24px;border-radius:30px;z-index:2147483649;font:600 13px Segoe UI;box-shadow:0 4px 15px rgba(0,0,0,0.4);animation:uvdSlideIn 0.3s ease;';__uvdAppendRoot(el);setTimeout(function(){el.remove();},2500);}
function shareUrl(url){if(navigator.share){navigator.share({title:pageInfo.title,url:url}).catch(function(){toast('Không thể chia sẻ');});}else{toast('Thiết bị không hỗ trợ chia sẻ');}}
function addToHistory(url,type){data.history=data.history||[];data.history.unshift({url:url,type:type,title:pageInfo.title,host:pageInfo.host,timestamp:Date.now()});if(data.history.length>50)data.history=data.history.slice(0,50);storage.set(data);}
function addToFilterlist(pattern){if(!pattern)return;pattern=pattern.trim().toLowerCase();if(data.filterlist.indexOf(pattern)===-1){data.filterlist.push(pattern);storage.set(data);compileAdFilters();toast('Đã thêm "'+pattern+'" vào filter');buildUI();}else{toast('Rule đã tồn tại');}}
function exportData(format){var arr=[...urls.entries()].map(function(e){return{url:e[0],type:e[1].type,source:e[1].source,title:pageInfo.title};});var content,mime,filename;if(format==='json'){content=JSON.stringify({page:pageInfo,streams:arr},null,2);mime='application/json';filename=pageInfo.title+'_streams.json';}else if(format==='csv'){content='Type,URL,Source,Title\n'+arr.map(a=>a.type+',"'+a.url+'",'+a.source+',"'+a.title+'"').join('\n');mime='text/csv';filename=pageInfo.title+'_streams.csv';}else if(format==='m3u'){content='#EXTM3U\n'+arr.filter(a=>a.type!=='IFRAME').map(a=>'#EXTINF:-1,'+a.title+' ['+a.type+']\n'+a.url).join('\n');mime='audio/x-mpegurl';filename=pageInfo.title+'.m3u';}else{content=arr.map(a=>a.url).join('\n');mime='text/plain';filename=pageInfo.title+'_urls.txt';}var blob=new Blob([content],{type:mime});var a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=filename;a.click();URL.revokeObjectURL(a.href);toast('Đã xuất '+format.toUpperCase());}
function addRipple(e){var btn=e.currentTarget;var ripple=document.createElement('span');ripple.className='uvd-ripple';var rect=btn.getBoundingClientRect();var size=Math.max(rect.width,rect.height);ripple.style.width=ripple.style.height=size+'px';ripple.style.left=(e.clientX-rect.left-size/2)+'px';ripple.style.top=(e.clientY-rect.top-size/2)+'px';btn.appendChild(ripple);ripple.addEventListener('animationend',function(){ripple.remove();});}
function lockOrientation(video){if(!video||!video.videoWidth||!video.videoHeight)return;var isPortrait=video.videoHeight>video.videoWidth;var target=isPortrait?'portrait':'landscape';try{if(screen.orientation&&screen.orientation.lock)screen.orientation.lock(target).catch(function(){});}catch(e){}}
function unlockOrientation(){try{if(screen.orientation&&screen.orientation.unlock)screen.orientation.unlock();}catch(e){}}
var playerState={overlay:null,mini:null,video:null,videojs:null,hls:null,qualities:[],currentQuality:0,speed:1,isMinimized:false,url:'',type:'',resolution:'',bandwidth:0,_displayedResolution:'',onFullscreenChange:null,audioCtx:null,gainNode:null,sourceNode:null,sleepTimerId:null,sleepEndAt:0,savePosTimer:null,wasReduceMotion:false,hideTimeout:null,controlsVisible:true,pinned:false,timeMode:0,animationFrame:null};
function savePlaybackPosition(url,video){if(!url||!video||!video.duration||isNaN(video.duration))return;var pct=video.currentTime/video.duration;if(pct<0.02||pct>0.95){delete data.playbackPositions[url];}else{data.playbackPositions[url]={time:video.currentTime,duration:video.duration,updatedAt:Date.now()};}var keys=Object.keys(data.playbackPositions);if(keys.length>50){keys.sort(function(a,b){return data.playbackPositions[a].updatedAt-data.playbackPositions[b].updatedAt;});delete data.playbackPositions[keys[0]];}storage.set(data);}
function getPlaybackPosition(url){return data.playbackPositions[url]||null;}
function clearSleepTimer(){if(playerState.sleepTimerId){clearTimeout(playerState.sleepTimerId);playerState.sleepTimerId=null;}playerState.sleepEndAt=0;var el=document.getElementById('__uvd_sleep_label__');if(el)el.textContent='';}
function setSleepTimer(minutes){clearSleepTimer();if(!minutes)return;playerState.sleepEndAt=Date.now()+minutes*60000;playerState.sleepTimerId=setTimeout(function(){if(playerState.video)playerState.video.pause();toast('⏰ Hẹn giờ ngủ: đã dừng phát');clearSleepTimer();},minutes*60000);toast('⏰ Sẽ dừng sau '+minutes+' phút');}
function showSleepMenu(){var overlay2=document.createElement('div');overlay2.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:2147483649;display:flex;align-items:center;justify-content:center;';var panel=document.createElement('div');panel.style.cssText='background:rgba(20,22,30,0.95);border-radius:16px;padding:20px;min-width:250px;max-width:90%;border:1px solid rgba(255,255,255,0.15);';panel.innerHTML='<div style="color:#fff;font-weight:600;margin-bottom:12px;">⏰ Hẹn giờ ngủ</div>';[0,15,30,45,60].forEach(function(m){var b=document.createElement('button');b.className='uvd-btn uvd-btn-sm';b.style.cssText='width:100%;margin-bottom:6px;text-align:center;';b.textContent=m===0?'Tắt hẹn giờ':m+' phút';b.onclick=function(){setSleepTimer(m);overlay2.remove();};panel.appendChild(b);});overlay2.appendChild(panel);overlay2.onclick=function(e){if(e.target===overlay2)overlay2.remove();};__uvdAppendRoot(overlay2);}
function srtToVtt(text){var body=text.replace(/\r/g,'').replace(/^\uFEFF/,'');if(/^WEBVTT/.test(body.trim()))return body;body=body.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g,'$1.$2');return 'WEBVTT\n\n'+body;}
function attachSubtitleTrack(video,vttUrl,label){if(!video)return;video.querySelectorAll('track[data-uvd-sub="1"]').forEach(function(t){t.remove();});var track=document.createElement('track');track.setAttribute('data-uvd-sub','1');track.kind='subtitles';track.label=label||'Phụ đề';track.srclang='vi';track.src=vttUrl;track.default=true;video.appendChild(track);setTimeout(function(){if(video.textTracks&&video.textTracks.length){for(var i=0;i<video.textTracks.length;i++){video.textTracks[i].mode=video.textTracks[i].label===(label||'Phụ đề')?'showing':'disabled';}}},100);toast('✅ Đã bật phụ đề: '+(label||''));}
function searchSubDL(query,cb){var apiKey=(data.settings.subdlApiKey||'').trim();if(!apiKey){toast('Chưa có SubDL API Key, xem hướng dẫn trong bảng Phụ đề');cb([]);return;}var settled=false;function finish(fn){if(settled)return;settled=true;clearTimeout(hardTimeoutId);fn();}var hardTimeoutId=setTimeout(function(){finish(function(){console.error('[UMP DL] SubDL: hết 15s vẫn không có phản hồi');toast('SubDL không phản hồi sau 15s — có thể do CORS hoặc trang chặn kết nối');cb([]);});},15000);var controller=(typeof AbortController!=='undefined')?new AbortController():null;if(controller){setTimeout(function(){controller.abort();},15000);}fetch('https://api.subdl.com/api/v2/subtitles/search?film_name='+encodeURIComponent(query)+'&languages=vi,en&unpack=1',{headers:{'Authorization':'Bearer '+apiKey},signal:controller?controller.signal:undefined}).then(function(r){if(!r.ok){throw new Error('HTTP '+r.status);}return r.json();}).then(function(json){finish(function(){if(json&&json.status===false){console.warn('[UMP DL] SubDL trả lỗi:',json.message||json);toast('SubDL: '+(json.message||'yêu cầu bị từ chối (kiểm tra API key)'));cb([]);return;}var subs=(json&&json.subtitles)||[];var flat=[];subs.forEach(function(s){if(s&&Array.isArray(s.unpack_files)&&s.unpack_files.length){s.unpack_files.forEach(function(f){flat.push(Object.assign({release_name:s.release_name||s.name,language:f.language},f));});}else if(s){flat.push(s);}});console.log('[UMP DL] SubDL: nhận được '+flat.length+' phụ đề');cb(flat);});}).catch(function(err){finish(function(){console.error('[UMP DL] Lỗi SubDL search:',err);toast('Lỗi kết nối SubDL: '+(err&&err.message?err.message:'CORS/mạng'));cb([]);});});}
function downloadSubDLFile(item,cb){var apiKey=(data.settings.subdlApiKey||'').trim();var directUrl=item.url||item.file_url||item.download_url||(item.files&&item.files[0]&&item.files[0].url);var nId=item.file_n_id||item.nId||item.n_id||item.id;var reqPromise;if(directUrl){reqPromise=fetch(directUrl.indexOf('http')===0?directUrl:'https://dl.subdl.com'+directUrl);}else if(nId){reqPromise=fetch('https://api.subdl.com/api/v2/subtitles/'+encodeURIComponent(nId)+'/download?format=file',{headers:{'Authorization':'Bearer '+apiKey}}).then(function(r){var ct=r.headers.get('content-type')||'';return ct.indexOf('application/json')!==-1?r.json():r.text();}).then(function(result){if(typeof result==='string')return result;var link=result&&(result.url||result.download_url||result.link);if(!link)throw new Error('no-link');return fetch(link).then(function(r2){return r2.text();});});}else{toast('Không có file để tải');if(cb)cb(false);return;}Promise.resolve(reqPromise).then(function(res){return (typeof res==='string')?res:res.text();}).then(function(text){if(!text)throw new Error('empty');var vtt=srtToVtt(text);var blobUrl=URL.createObjectURL(new Blob([vtt],{type:'text/vtt'}));attachSubtitleTrack(playerState.video,blobUrl,'SubDL');if(cb)cb(true);}).catch(function(){toast('Lỗi tải phụ đề từ SubDL');if(cb)cb(false);});}
function showSubtitlePanel(video){var overlay2=document.createElement('div');overlay2.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:2147483649;display:flex;align-items:center;justify-content:center;padding:16px;';var panel=document.createElement('div');applyEffectsPref(panel);panel.style.cssText='background:rgba(20,22,30,0.96);border-radius:16px;padding:20px;width:100%;max-width:380px;max-height:85vh;overflow-y:auto;border:1px solid rgba(255,255,255,0.15);';panel.innerHTML='<div style="color:#fff;font-weight:600;margin-bottom:4px;">💬 Phụ đề <span style="font-size:10px;color:var(--gold);font-weight:400;">(thử nghiệm)</span></div><div style="font-size:11px;color:var(--text3);margin-bottom:12px;">Tải file có sẵn hoặc tìm trên SubDL.</div><div style="font-size:12px;color:var(--text2);margin-bottom:6px;">Tải file .srt / .vtt từ máy</div><input type="file" id="__uvd_sub_file__" accept=".srt,.vtt" style="width:100%;color:var(--text2);font-size:12px;margin-bottom:14px;"><div style="font-size:12px;color:var(--text2);margin-bottom:6px;">Tìm trên SubDL</div><div style="display:flex;gap:6px;margin-bottom:8px;"><input type="text" id="__uvd_sub_query__" placeholder="Tên phim..." value="'+escapeHtml(pageInfo.title)+'" style="flex:1;padding:9px;background:rgba(0,0,0,0.4);color:#fff;border:1px solid var(--border);border-radius:10px;font-size:12px;"><button class="uvd-btn uvd-btn-sm" id="__uvd_sub_search__">Tìm</button></div><div id="__uvd_sub_results__" style="max-height:200px;overflow-y:auto;"></div><details style="margin-top:12px;"><summary style="font-size:11px;color:var(--text3);cursor:pointer;">API Key SubDL</summary><input type="text" id="__uvd_sub_apikey__" placeholder="Dán API key cá nhân (subdl.com)" value="'+escapeHtml(data.settings.subdlApiKey||'')+'" style="width:100%;margin-top:8px;padding:9px;background:rgba(0,0,0,0.4);color:#fff;border:1px solid var(--border);border-radius:10px;font-size:11px;"><div style="font-size:10px;color:var(--text3);margin-top:4px;">Đăng ký free tại subdl.com/panel/api để lấy API key cá nhân (không cần app "consumer" riêng, 2000 lượt tìm + 50 lượt tải/ngày).</div></details><div class="uvd-grid-2" style="margin-top:14px;"><button class="uvd-btn uvd-btn-sm" id="__uvd_sub_off__">Tắt phụ đề</button><button class="uvd-btn uvd-btn-sm" id="__uvd_sub_close__" style="background:var(--btn-danger-bg);">Đóng</button></div>';overlay2.appendChild(panel);overlay2.onclick=function(e){if(e.target===overlay2)overlay2.remove();};__uvdAppendRoot(overlay2);panel.querySelector('#__uvd_sub_file__').onchange=function(e){var file=e.target.files&&e.target.files[0];if(!file)return;var reader=new FileReader();reader.onload=function(){var vtt=srtToVtt(String(reader.result||''));var blobUrl=URL.createObjectURL(new Blob([vtt],{type:'text/vtt'}));attachSubtitleTrack(video,blobUrl,file.name.replace(/\.(srt|vtt)$/i,''));overlay2.remove();};reader.readAsText(file);};panel.querySelector('#__uvd_sub_apikey__').onchange=function(){data.settings.subdlApiKey=this.value.trim();storage.set(data);};panel.querySelector('#__uvd_sub_search__').onclick=function(){var q=panel.querySelector('#__uvd_sub_query__').value.trim();if(!q)return;var box=panel.querySelector('#__uvd_sub_results__');box.innerHTML='<div style="font-size:11px;color:var(--text3);padding:8px 0;">Đang tìm...</div>';searchSubDL(q,function(list){if(!list.length){box.innerHTML='<div style="font-size:11px;color:var(--text3);padding:8px 0;">Không tìm thấy kết quả.</div>';return;}box.innerHTML='';list.slice(0,10).forEach(function(item){var title=item.release_name||item.name||item.film_name||q;var lang=item.language||item.lang||'';var row=document.createElement('div');row.className='uvd-card';row.style.cssText='padding:8px 10px;margin-bottom:6px;cursor:pointer;';row.innerHTML='<div style="font-size:12px;color:#fff;">'+escapeHtml(title)+'</div><div style="font-size:10px;color:var(--text3);">'+escapeHtml(String(lang).toUpperCase())+'</div>';row.onclick=function(){toast('Đang tải phụ đề...');downloadSubDLFile(item,function(ok){if(ok)overlay2.remove();});};box.appendChild(row);});});};panel.querySelector('#__uvd_sub_off__').onclick=function(){if(video&&video.textTracks){for(var i=0;i<video.textTracks.length;i++)video.textTracks[i].mode='disabled';}toast('Đã tắt phụ đề');overlay2.remove();};panel.querySelector('#__uvd_sub_close__').onclick=function(){overlay2.remove();};}
function enableVolumeBoost(video,percent){try{if(!playerState.audioCtx){var Ctx=window.AudioContext||window.webkitAudioContext;playerState.audioCtx=new Ctx();playerState.sourceNode=playerState.audioCtx.createMediaElementSource(video);playerState.gainNode=playerState.audioCtx.createGain();playerState.sourceNode.connect(playerState.gainNode);playerState.gainNode.connect(playerState.audioCtx.destination);}if(playerState.audioCtx.state==='suspended')playerState.audioCtx.resume();playerState.gainNode.gain.value=(percent||100)/100;}catch(e){toast('Thiết bị không hỗ trợ tăng âm lượng');}}
function disableVolumeBoost(){try{if(playerState.gainNode)playerState.gainNode.gain.value=1;}catch(e){}}
function attachPlayerGestures(wrapper,video){var lastTap={time:0,side:null};var tapSeconds=data.settings.doubleTapSeconds||10;wrapper.addEventListener('touchend',function(e){var t=e.changedTouches&&e.changedTouches[0];if(!t)return;var rect=wrapper.getBoundingClientRect();var side=(t.clientX-rect.left)<rect.width/2?'left':'right';var now=Date.now();if(lastTap.side===side&&(now-lastTap.time)<300){if(side==='left'){video.currentTime=Math.max(0,video.currentTime-tapSeconds);showGestureHint('⏪ -'+tapSeconds+'s');}else{video.currentTime=Math.min(video.duration||1e9,video.currentTime+tapSeconds);showGestureHint('⏩ +'+tapSeconds+'s');}hideGestureHintSoon();lastTap.time=0;}else{lastTap={time:now,side:side};}});}
var __gestureHintTimer=null;
function showGestureHint(text){var el=document.getElementById('__uvd_gesture_hint__');if(!el){el=document.createElement('div');el.id='__uvd_gesture_hint__';el.style.cssText='position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);background:rgba(0,0,0,0.7);color:#fff;padding:10px 18px;border-radius:12px;font-size:14px;font-weight:600;z-index:5;pointer-events:none;';var wrapper=document.getElementById('__uvd_video_wrapper__');if(wrapper)wrapper.appendChild(el);}el.textContent=text;el.style.opacity='1';}
function hideGestureHintSoon(){clearTimeout(__gestureHintTimer);__gestureHintTimer=setTimeout(function(){var el=document.getElementById('__uvd_gesture_hint__');if(el)el.style.opacity='0';},500);}
// ========== VIDEO.JS V8 GLASS SKIN ==========
var uvdVideoJsCSS='\n.video-js { background: transparent !important; }\n.vjs-tech { border-radius: 12px !important; }\n.vjs-control-bar {\n  background: rgba(10,11,16,0.8) !important;\n  backdrop-filter: blur(20px) saturate(150%);\n  -webkit-backdrop-filter: blur(20px) saturate(150%);\n  border: 1px solid rgba(255,255,255,0.1);\n  border-radius: 18px;\n  margin: 8px;\n  padding: 5px 10px;\n  box-shadow: 0 20px 50px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.08) inset;\n  transition: opacity 0.3s ease;\n}\n.vjs-progress-holder {\n  background: rgba(255,255,255,0.08) !important;\n  backdrop-filter: blur(8px);\n  -webkit-backdrop-filter: blur(8px);\n  border-radius: 8px;\n  height: 6px;\n  overflow: hidden;\n}\n.vjs-play-progress {\n  background: linear-gradient(90deg, #6d8cff, #b98bff) !important;\n  box-shadow: 0 0 12px rgba(109,140,255,0.7);\n  border-radius: 8px;\n}\n.vjs-load-progress { background: rgba(255,255,255,0.2) !important; }\n.vjs-volume-panel, .vjs-current-time, .vjs-duration, .vjs-remaining-time { color: #fff !important; }\n.vjs-button > .vjs-icon-placeholder::before { color: #fff; }\n.vjs-big-play-button {\n  background: rgba(255,255,255,0.15) !important;\n  backdrop-filter: blur(10px);\n  border-radius: 50%;\n  border: 1px solid rgba(255,255,255,0.3);\n  font-size: 3em;\n  line-height: 1.5em;\n  width: 1.5em;\n  height: 1.5em;\n  box-shadow: 0 8px 24px rgba(0,0,0,0.6), 0 0 0 2px rgba(109,140,255,0.3);\n}\n.vjs-big-play-button:hover { background: rgba(255,255,255,0.25) !important; }\n.vjs-menu-content {\n  background: rgba(10,11,16,0.9) !important;\n  backdrop-filter: blur(10px);\n  border-radius: 12px;\n  border: 1px solid rgba(255,255,255,0.1);\n}\n.vjs-menu-item { color: #fff; }\n.vjs-menu-item:hover { background: rgba(109,140,255,0.2); }\n.vjs-loading-spinner {\n  border-color: rgba(109,140,255,0.5) rgba(109,140,255,0.2) rgba(109,140,255,0.2) !important;\n}\n.video-js:not(.uvd-no-anim) .vjs-progress-holder::before {\n  content: \'\';\n  position: absolute;\n  top: -50%; left: -20%; right: -20%; bottom: -50%;\n  background: radial-gradient(circle at 30% 50%, rgba(109,140,255,0.2), transparent 60%),\n              radial-gradient(circle at 70% 50%, rgba(185,139,255,0.15), transparent 60%);\n  filter: blur(15px);\n  animation: uvdLiquidDrift2 10s ease-in-out infinite alternate;\n  z-index: 0;\n  pointer-events: none;\n}\n@keyframes uvdLiquidDrift2 {\n  0% { transform: translate(-5%, -5%) scale(1); }\n  100% { transform: translate(5%, 5%) scale(1.1); }\n}\n.video-js::before {\n  content: \'\';\n  position: absolute;\n  inset: -30%;\n  background: radial-gradient(circle at 20% 20%, rgba(109,140,255,0.1), transparent 70%),\n              radial-gradient(circle at 80% 80%, rgba(185,139,255,0.08), transparent 70%);\n  filter: blur(50px);\n  animation: uvdLiquidDrift 16s ease-in-out infinite;\n  z-index: -1;\n  pointer-events: none;\n}\n@keyframes uvdLiquidDrift {\n  0% { transform: translate(-6%, -4%) scale(1); }\n  50% { transform: translate(4%, 6%) scale(1.12); }\n  100% { transform: translate(-6%, -4%) scale(1); }\n}\n.uvd-no-anim .video-js::before,\n.uvd-no-anim .vjs-progress-holder::before { display: none; }\n';
function showVideoPlayer(url,type){
if(playerState.overlay&&playerState.url===url)return;
if(playerState.overlay)closePlayer();
playerState.url=url;playerState.type=type;playerState._displayedResolution='';playerState.timeMode=0;playerState.pinned=false;
pauseAllPlayingVideos();
playerState.wasReduceMotion=data.settings.reduceMotion;
if(!data.settings.reduceMotion){data.settings.reduceMotion=true;applyMotionPref(document.getElementById('__uvd__'));}
var overlay=document.createElement('div');overlay.id='__uvd_player_overlay__';overlay.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,0.96);z-index:2147483648;display:flex;flex-direction:column;animation:uvdFadeIn 0.3s ease;';
__uvdAppendRoot(overlay);playerState.overlay=overlay;applyEffectsPref(overlay);applyMotionPref(overlay);
var header=document.createElement('div');header.id='__uvd_player_header__';header.style.cssText='padding:10px 16px;background:rgba(14,16,22,0.92);display:flex;flex-direction:column;flex-shrink:0;border-bottom:1px solid rgba(255,255,255,0.2);box-shadow:0 4px 20px rgba(0,0,0,0.5);transition: opacity 0.3s ease;';
var titleRow=document.createElement('div');titleRow.style.cssText='display:flex;align-items:center;justify-content:space-between;';
var titleInfo=document.createElement('div');titleInfo.className='uvd-title-info';titleInfo.style.cssText='min-width:0;flex:1;';titleInfo.innerHTML='<div style="font-weight:600;font-size:14px;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">▶ '+escapeHtml(pageInfo.title)+'</div><div style="font-size:11px;color:#aaa;margin-top:2px;">'+escapeHtml(type)+'</div>';
titleRow.appendChild(titleInfo);
var btnGroup=document.createElement('div');btnGroup.style.cssText='display:flex;gap:6px;flex-shrink:0;';
var minVideoBtn=document.createElement('button');minVideoBtn.className='uvd-btn uvd-btn-sm';minVideoBtn.style.cssText='background:rgba(255,255,255,0.15);color:#fff;font-size:12px;';minVideoBtn.textContent='⛶';minVideoBtn.onclick=minimizePlayer;btnGroup.appendChild(minVideoBtn);
var closeBtn=document.createElement('button');closeBtn.className='uvd-btn uvd-btn-sm';closeBtn.style.cssText='background:var(--btn-danger-bg);color:#fff;border:1px solid var(--btn-danger-border);';closeBtn.textContent='✕';closeBtn.onclick=function(){closePlayer();document.getElementById('__uvd_stream_list__').style.display='block';};btnGroup.appendChild(closeBtn);
titleRow.appendChild(btnGroup);header.appendChild(titleRow);
// toolbar nút ngoài (giữ nguyên các nút của bạn: chất lượng, tốc độ, toàn màn hình, pip, sleep, boost, mute, autonext, pin, screenshot, subtitle)
var toolbar=document.createElement('div');toolbar.id='__uvd_player_toolbar__';toolbar.style.cssText='display:flex;flex-wrap:wrap;gap:6px;margin-top:8px;transition: opacity 0.3s ease;';
// -- tốc độ --
var speedLabel=document.createElement('span');speedLabel.className='uvd-btn uvd-btn-sm';speedLabel.style.cssText='background:var(--btn-bg);color:#fff;font-size:12px;padding:7px 6px;';speedLabel.textContent='1x';speedLabel.id='__uvd_speed_label__';toolbar.appendChild(speedLabel);
var speedDec=document.createElement('button');speedDec.className='uvd-btn uvd-btn-sm';speedDec.style.cssText='background:var(--btn-bg);color:#fff;font-size:12px;padding:7px 8px;';speedDec.textContent='−';speedDec.onclick=function(){var v=playerState.video;if(!v)return;var rates=[0.25,0.5,0.75,1,1.25,1.5,1.75,2];var cur=v.playbackRate;var idx=rates.indexOf(cur);if(idx>0)v.playbackRate=rates[idx-1];else v.playbackRate=0.25;speedLabel.textContent=v.playbackRate+'x';};toolbar.appendChild(speedDec);
var speedInc=document.createElement('button');speedInc.className='uvd-btn uvd-btn-sm';speedInc.style.cssText='background:var(--btn-bg);color:#fff;font-size:12px;padding:7px 8px;';speedInc.textContent='+';speedInc.onclick=function(){var v=playerState.video;if(!v)return;var rates=[0.25,0.5,0.75,1,1.25,1.5,1.75,2];var cur=v.playbackRate;var idx=rates.indexOf(cur);if(idx<rates.length-1)v.playbackRate=rates[idx+1];else v.playbackRate=2;speedLabel.textContent=v.playbackRate+'x';};toolbar.appendChild(speedInc);
// -- các nút khác --
var btns=[{text:'Chất lượng',action:function(){if(playerState.qualities.length>0)showQualitySubMenu();else toast('Không có chất lượng để chọn');}},{text:'Toàn màn hình',action:function(){var vw=document.getElementById('__uvd_video_wrapper__');var fs=vw.requestFullscreen||vw.webkitRequestFullscreen;if(fs)fs.call(vw);}},{text:'PiP',action:function(){var v=playerState.video;if(!v)return;if(document.pictureInPictureElement)document.exitPictureInPicture().catch(function(){});else v.requestPictureInPicture().catch(function(){toast('Không hỗ trợ PiP lúc này');});},cond:document.pictureInPictureEnabled},{text:'⏰ Hẹn giờ',action:showSleepMenu},{text:'🔊 Boost',id:'__uvd_boost_btn__',style:data.settings.volumeBoost?'background:var(--btn-gold-bg);':'',action:function(){data.settings.volumeBoost=!data.settings.volumeBoost;storage.set(data);if(data.settings.volumeBoost){enableVolumeBoost(playerState.video,data.settings.volumeBoostMax);toast('Đã bật tăng âm lượng '+data.settings.volumeBoostMax+'%');}else{disableVolumeBoost();toast('Đã tắt tăng âm lượng');}var b=document.getElementById('__uvd_boost_btn__');if(b)b.style.background=data.settings.volumeBoost?'var(--btn-gold-bg)':'var(--btn-bg)';}},{text:'🔇 Mute',id:'__uvd_mute_btn__',muted:false,action:function(){var v=playerState.video;if(!v)return;this.muted=!this.muted;v.muted=this.muted;var b=document.getElementById('__uvd_mute_btn__');if(b)b.textContent=this.muted?'🔊 Bật tiếng':'🔇 Mute';}},{text:'⏭ Tự động',id:'__uvd_autonext_btn__',style:data.settings.autoNext?'background:var(--btn-accent-bg);':'',action:function(){data.settings.autoNext=!data.settings.autoNext;storage.set(data);var b=document.getElementById('__uvd_autonext_btn__');if(b)b.style.background=data.settings.autoNext?'var(--btn-accent-bg)':'var(--btn-bg)';}},{text:'📌 Ghim',id:'__uvd_pin_btn__',action:function(){playerState.pinned=!playerState.pinned;var b=document.getElementById('__uvd_pin_btn__');if(b)b.style.background=playerState.pinned?'var(--btn-accent-bg)':'var(--btn-bg)';if(playerState.pinned){clearTimeout(playerState.hideTimeout);header.style.opacity='1';toolbar.style.opacity='1';footer.style.opacity='1';playerState.controlsVisible=true;}else{resetHideTimer();}}},{text:'📷 Screenshot',action:function(){var v=playerState.video;if(!v||!v.videoWidth){toast('Chưa có video');return;}var canvas=document.createElement('canvas');canvas.width=v.videoWidth;canvas.height=v.videoHeight;var ctx=canvas.getContext('2d');ctx.drawImage(v,0,0,canvas.width,canvas.height);var link=document.createElement('a');link.download=pageInfo.title+'_screenshot.png';link.href=canvas.toDataURL('image/png');link.click();var flash=document.createElement('div');flash.style.cssText='position:absolute;inset:0;background:#fff;opacity:0.6;z-index:10;pointer-events:none;transition:opacity 0.2s;';var wrapper=document.getElementById('__uvd_video_wrapper__');if(wrapper)wrapper.appendChild(flash);setTimeout(function(){flash.style.opacity='0';},100);setTimeout(function(){if(flash.parentNode)flash.remove();},400);toast('Đã chụp ảnh màn hình');}},{text:'💬 Phụ đề',action:function(){showSubtitlePanel(playerState.video);}}];
btns.forEach(function(btn){if(btn.cond===false)return;var b=document.createElement('button');b.className='uvd-btn uvd-btn-sm';b.style.cssText=(btn.style||'')+'background:var(--btn-bg);color:#fff;font-size:12px;';b.textContent=btn.text;if(btn.id)b.id=btn.id;b.onclick=btn.action;toolbar.appendChild(b);});
if(type==='MP4'||type==='MKV'||type==='WEBM'){var downBtn=document.createElement('button');downBtn.className='uvd-btn uvd-btn-sm';downBtn.style.cssText='background:var(--btn-success-bg);color:#fff;font-size:12px;border:1px solid var(--btn-success-border);';downBtn.textContent='Tải xuống';downBtn.onclick=function(){var a=document.createElement('a');a.href=url;a.download=pageInfo.title+'.'+type.toLowerCase();document.body.appendChild(a);a.click();a.remove();toast('Đang tải xuống...');};toolbar.appendChild(downBtn);}
header.appendChild(toolbar);overlay.appendChild(header);
// video wrapper
var videoWrapper=document.createElement('div');videoWrapper.id='__uvd_video_wrapper__';videoWrapper.style.cssText='flex:1;display:flex;align-items:center;justify-content:center;background:#000;position:relative;overflow:hidden;';
var video=document.createElement('video');video.id='__uvd_player_video__';video.className='video-js vjs-default-skin vjs-big-play-centered';video.setAttribute('playsinline','');video.setAttribute('webkit-playsinline','');video.setAttribute('crossorigin','anonymous');videoWrapper.appendChild(video);overlay.appendChild(videoWrapper);playerState.video=video;
// footer
var footer=document.createElement('div');footer.id='__uvd_player_footer__';footer.style.cssText='padding:8px 16px;background:rgba(0,0,0,0.7);border-top:1px solid var(--btn-bg);font-size:12px;color:#aaa;display:flex;justify-content:space-between;flex-shrink:0;transition: opacity 0.3s ease;';
footer.innerHTML='<span id="__uvd_player_status__">Đang tải...</span><span id="__uvd_player_size__" style="color:#8ab4ff;">Đang ước tính dung lượng...</span><span id="__uvd_player_time__" style="cursor:pointer;">00:00</span>';overlay.appendChild(footer);
// khởi tạo Video.js v8
function initVjs(){
if(!window.videojs){var s=document.createElement('script');s.src='https://vjs.zencdn.net/8.10.0/video.min.js';s.onload=function(){initPlayer();};document.head.appendChild(s);}else{initPlayer();}
}
function initPlayer(){
if(!document.getElementById('uvd-vjs-glass')){var st=document.createElement('style');st.id='uvd-vjs-glass';st.textContent=uvdVideoJsCSS;document.head.appendChild(st);}
var player=videojs(video,{controls:true,autoplay:false,preload:'auto',fluid:false,fill:true,playbackRates:[0.5,0.75,1,1.25,1.5,2],userActions:{hotkeys:true}});
playerState.videojs=player;
player.on('loadedmetadata',function(){var v=player.tech().el();lockOrientation(v);updateTitleDisplay();if(data.settings.volumeBoost)enableVolumeBoost(v,data.settings.volumeBoostMax);if(data.settings.resumePlayback){var pos=getPlaybackPosition(url);if(pos&&pos.time>3)player.currentTime(pos.time);}resetHideTimer();});
player.on('timeupdate',function(){savePlaybackPosition(url,player.tech().el());updateTimeDisplay();updateTitleDisplay();});
player.on('ended',function(){if(data.settings.resumePlayback)delete data.playbackPositions[url];if(data.settings.autoNext){var nextUrl=getNextStreamUrl(url);if(nextUrl){toast('⏭ Đang phát stream tiếp theo...');setTimeout(function(){showVideoPlayer(nextUrl.url,nextUrl.type);},800);}}});
var isHls=url.includes('.m3u8')||url.includes('m3u8');
if(isHls){if(window.Hls&&Hls.isSupported()){var hls=new Hls();hls.loadSource(url);hls.attachMedia(video);playerState.hls=hls;hls.on(Hls.Events.MANIFEST_PARSED,function(){parseM3U8Master(url,function(qualities){if(qualities&&qualities.length)playerState.qualities=qualities;});});hls.on(Hls.Events.LEVEL_SWITCHED,function(event,data){var lvl=hls.levels[data.level];if(lvl){playerState.resolution=(lvl.width&&lvl.height)?(lvl.width+'x'+lvl.height):'';playerState.bandwidth=lvl.bitrate||0;}updateTitleDisplay();updateSizeEstimate();});}else if(video.canPlayType('application/vnd.apple.mpegurl')){player.src({src:url,type:'application/x-mpegURL'});}else{var s=document.createElement('script');s.src='https://cdn.jsdelivr.net/npm/hls.js@latest';s.onload=function(){showVideoPlayer(url,type);};document.head.appendChild(s);return;}}else{player.src({src:url});}
player.play().catch(function(){});
attachPlayerGestures(videoWrapper,video);
function resetHideTimer(){if(playerState.pinned||!data.settings.autoHideControls)return;player.removeClass('vjs-user-inactive');clearTimeout(playerState.hideTimeout);playerState.hideTimeout=setTimeout(function(){player.addClass('vjs-user-inactive');},data.settings.hideDelay*1000);}
player.on('useractive',resetHideTimer);
player.on('userinactive',function(){if(player.paused()||playerState.pinned)return;player.addClass('vjs-user-inactive');});
resetHideTimer();
}
initVjs();
}
// Các hàm minimize, restore, close giữ nguyên nhưng cập nhật hủy videojs
function minimizePlayer(){if(playerState.isMinimized)return;playerState.isMinimized=true;var overlay=playerState.overlay;var video=playerState.video;video.pause();clearTimeout(playerState.hideTimeout);var mini=document.createElement('div');mini.id='__uvd_player_mini__';mini.style.cssText='position:fixed;bottom:20px;right:20px;width:160px;height:90px;background:#000;border-radius:12px;z-index:2147483647;cursor:pointer;box-shadow:0 8px 30px rgba(0,0,0,0.8);border:2px solid rgba(255,255,255,0.2);overflow:hidden;transition: opacity 0.25s ease, transform 0.25s ease;';var canvas=document.createElement('canvas');canvas.width=160;canvas.height=90;var ctx=canvas.getContext('2d');ctx.fillStyle='#000';ctx.fillRect(0,0,160,90);if(video.videoWidth){try{ctx.drawImage(video,0,0,160,90);}catch(e){}}mini.appendChild(canvas);var label=document.createElement('div');label.textContent='▶ '+escapeHtml(pageInfo.title);label.style.cssText='position:absolute;bottom:4px;left:8px;color:#fff;font-size:11px;font-weight:600;text-shadow:0 2px 4px rgba(0,0,0,0.8);background:rgba(0,0,0,0.5);padding:2px 8px;border-radius:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:90%;';mini.appendChild(label);__uvdAppendRoot(mini);playerState.mini=mini;overlay.style.transition='opacity 0.25s ease';overlay.style.opacity='0';setTimeout(function(){overlay.style.display='none';},260);mini.onclick=restorePlayer;}
function restorePlayer(){if(!playerState.isMinimized)return;playerState.isMinimized=false;var overlay=playerState.overlay;var mini=playerState.mini;if(mini){mini.style.transition='opacity 0.2s ease';mini.style.opacity='0';setTimeout(function(){mini.remove();},220);playerState.mini=null;}overlay.style.display='flex';overlay.style.transition='opacity 0.25s ease';overlay.style.opacity='1';if(playerState.video){playerState.video.play().catch(function(){});}}
function closePlayer(){if(playerState.overlay){if(data.settings.resumePlayback&&playerState.url&&playerState.video)savePlaybackPosition(playerState.url,playerState.video);clearSleepTimer();clearTimeout(playerState.hideTimeout);if(playerState.videojs){playerState.videojs.dispose();playerState.videojs=null;}if(playerState.hls){playerState.hls.destroy();playerState.hls=null;}if(playerState.mini){playerState.mini.remove();playerState.mini=null;}if(playerState.video){playerState.video.pause();playerState.video.src='';}playerState.overlay.remove();playerState.overlay=null;playerState.video=null;playerState.isMinimized=false;playerState.qualities=[];playerState.resolution='';playerState.bandwidth=0;data.settings.reduceMotion=playerState.wasReduceMotion;applyMotionPref(document.getElementById('__uvd__'));storage.set(data);}}
// Hàm getNextStreamUrl, updateTitleDisplay, updateSizeEstimate, formatTime, ... (sẽ có trong phần 2)
   // ========== TIẾP TỤC PHẦN 2 – CÁC HÀM CÒN THIẾU + BUILD UI ==========

function getNextStreamUrl(currentUrl) {
  var list = [...urls.entries()]
    .filter(function(e) { return e[1].type !== 'IFRAME'; })
    .map(function(e) { return { url: e[0], type: e[1].type, priority: e[1].priority }; })
    .sort(function(a, b) { return a.priority - b.priority; });
  var idx = list.findIndex(function(i) { return i.url === currentUrl; });
  if (idx === -1 || idx + 1 >= list.length) return null;
  return list[idx + 1];
}

function formatTime(sec) {
  if (!sec || sec < 0) return '00:00';
  sec = Math.floor(sec);
  var h = Math.floor(sec / 3600);
  var m = Math.floor((sec % 3600) / 60);
  var s = sec % 60;
  if (h > 0) return h + ':' + (m<10?'0':'') + m + ':' + (s<10?'0':'') + s;
  return (m<10?'0':'') + m + ':' + (s<10?'0':'') + s;
}

function updateTimeDisplay() {
  var video = playerState.video;
  var timeEl = document.getElementById('__uvd_player_time__');
  if (!video || !timeEl) return;
  var t = video.currentTime || 0;
  var d = video.duration || 0;
  if (!d) { timeEl.textContent = '00:00'; return; }
  var remaining = d - t;
  var mode = playerState.timeMode;
  var text = '';
  if (data.settings.showRemainingTime && mode === 0) {
    text = '-' + formatTime(remaining);
  } else if (mode === 1) {
    text = formatTime(t);
  } else {
    text = formatTime(t) + ' / ' + formatTime(d);
  }
  var icon = mode === 0 ? ' ⏳' : (mode === 1 ? ' ▶' : ' 📋');
  timeEl.textContent = text + icon;
}

function updateTitleDisplay() {
  var infoDiv = document.querySelector('#__uvd_player_overlay__ .uvd-title-info');
  if (!infoDiv) return;
  var currentRes = '';
  var video = playerState.video;
  if (video && video.videoWidth && video.videoHeight) {
    currentRes = video.videoWidth + 'x' + video.videoHeight;
  } else if (playerState.resolution) {
    currentRes = playerState.resolution;
  }
  if (playerState._displayedResolution !== currentRes) {
    playerState._displayedResolution = currentRes;
    var sub = playerState.type + (currentRes ? ' · ' + currentRes : '');
    infoDiv.innerHTML = '<div style="font-weight:600;font-size:14px;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">▶ ' + escapeHtml(pageInfo.title) + '</div><div style="font-size:11px;color:#aaa;margin-top:2px;">' + escapeHtml(sub) + '</div>';
  }
}

function updateSizeEstimate() {
  var el = document.getElementById('__uvd_player_size__');
  if (!el) return;
  var url = playerState.url;
  var video = playerState.video;
  if (playerState.hls) {
    var lvl = playerState.hls.levels[playerState.hls.currentLevel];
    var bw = lvl ? lvl.bitrate : playerState.bandwidth;
    if (bw && video && video.duration) {
      var bytes = (bw / 8) * video.duration;
      var s = formatBytes(bytes);
      el.textContent = s ? '≈ ' + s : 'Không rõ dung lượng';
    } else {
      el.textContent = 'Đang ước tính dung lượng...';
    }
  } else {
    el.textContent = 'Đang kiểm tra dung lượng...';
    fetch(url, { method: 'HEAD', headers: { 'Referer': pageInfo.referer } })
      .then(function(r) {
        var len = r.headers.get('content-length');
        var s = len ? formatBytes(parseInt(len)) : null;
        el.textContent = s ? '≈ ' + s : 'Không rõ dung lượng';
      })
      .catch(function() { el.textContent = 'Không rõ dung lượng'; });
  }
}

function formatBytes(bytes) {
  if (!bytes || bytes <= 0) return null;
  var units = ['B', 'KB', 'MB', 'GB'];
  var i = 0;
  while (bytes >= 1024 && i < units.length - 1) { bytes /= 1024; i++; }
  return bytes.toFixed(i === 0 ? 0 : 1) + ' ' + units[i];
}

function createMenuPanel(title, options, callback) {
  var overlay2 = document.createElement('div');
  overlay2.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:2147483649;display:flex;align-items:center;justify-content:center;';
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
    };
    content.appendChild(btn);
  });
  panel.appendChild(content);
  var closeBtn = document.createElement('button');
  closeBtn.textContent = 'Đóng';
  closeBtn.className = 'uvd-btn uvd-btn-sm';
  closeBtn.style.cssText = 'width:100%;margin-top:10px;background:var(--danger);';
  closeBtn.onclick = function() { overlay2.remove(); };
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

function showCommandPicker(url, type) {
  var cmds = makeCommands(url, type, pageInfo.title);
  var opts = Object.keys(cmds).map(function(k) {
    return { label: cmds[k].label, value: cmds[k].cmd };
  });
  createMenuPanel('Chọn lệnh tải', opts, function(cmd) {
    showEditor(cmd);
  });
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
      playBtn.style.background = 'rgba(109,140,255,0.25)';
      playBtn.textContent = 'Xem';
      playBtn.onclick = function() { overlay.remove(); showVideoPlayer(q.url, 'M3U8'); };
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

function buildUI() {
  var arr = [...urls.entries()].map(function(e) {
    return { url: e[0], type: e[1].type, source: e[1].source, priority: e[1].priority };
  }).sort(function(a, b) { return a.priority - b.priority; });

  var panel = document.getElementById('__uvd__');
  if (panel) panel.remove();
  
  panel = document.createElement('div');
  panel.id = '__uvd__';
  panel.className = 'uvd-glass-panel';
  panel.style.cssText = 'position:fixed;top:15px;left:15px;right:15px;height:calc(100dvh - 30px);z-index:2147483647;animation:uvdScaleIn 0.4s ease;overscroll-behavior:contain;';
  
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
      '<span style="width:10px;height:10px;background:var(--grad-liquid);border-radius:50%;animation:uvdPulse 2s infinite;box-shadow:0 0 8px rgba(109,140,255,0.6);"></span>' +
      '<span style="font-weight:700;font-size:16px;letter-spacing:-0.01em;">UMP DL <span style="background:var(--grad-liquid);-webkit-background-clip:text;background-clip:text;color:transparent;">V' + VERSION + '</span></span>' +
    '</div>' +
    '<div style="display:flex;gap:6px;">' +
      '<button class="uvd-btn-icon" id="__uvd_autoplay__" title="Tự động bấm Play">▶</button>' +
      '<button class="uvd-btn-icon" id="__uvd_minimize_script__" title="Thu nhỏ Script">▼</button>' +
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
  
  var tabList = [
    { id: 'streams', text: 'Streams (' + arr.length + ')' },
    { id: 'player', text: 'Trình phát' },
    { id: 'settings', text: 'Cài đặt' }
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
  applyEffectsPref(panel);
  applyMotionPref(panel);
  
  document.querySelectorAll('.uvd-btn, .uvd-btn-icon, .uvd-tab').forEach(function(btn) {
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
    else if (tabId === 'player') renderPlayerSettings(streamList);
    else if (tabId === 'settings') renderSettings(streamList);
  }
  
  document.querySelectorAll('[data-tab]').forEach(function(t) {
    t.onclick = function() { renderTab(this.dataset.tab); };
  });
  
  renderTab('streams');
  
  window.addEventListener('resize', function() {
    moveIndicatorTo(document.querySelector('.uvd-tab.uvd-tab-active'));
  });
  
  document.getElementById('__uvd_close__').onclick = function() { 
    stopMonitor(); 
    panel.remove();
    runCleanup();
  };
  document.getElementById('__uvd_refresh__').onclick = function() { buildUI(); toast('Đã làm mới'); };
  document.getElementById('__uvd_autoplay__').onclick = function() {
    var n = autoClickPlayButtons(document, 0, false);
    toast(n > 0 ? 'Đã thử bấm Play (' + n + ' nút)' : 'Không tìm thấy nút Play, thử đặt selector riêng ở Cài đặt');
    setTimeout(function() { buildUI(); }, 1200);
  };
  document.getElementById('__uvd_minimize_script__').onclick = minimizeScriptPanel;
  
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

// ========== RENDER STREAMS ==========
var UVD_LAZY_BATCH = 40;
function buildStreamCardHTML(item, i) {
  return (
    '<div class="uvd-card" data-type="' + escapeHtml(item.type) + '" data-url="' + escapeHtml(item.url) + '">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">' +
        '<span class="uvd-type-badge">#' + (i+1) + ' ' + escapeHtml(item.type) + '</span>' +
        '<button class="uvd-block-btn" data-url="' + encodeURIComponent(item.url) + '" style="background:none;border:none;font-size:16px;cursor:pointer;color:#fff;opacity:0.5;" title="Chặn link này">⛔</button>' +
      '</div>' +
      '<div class="uvd-url-box">' + escapeHtml(item.url) + '</div>' +
      '<div class="uvd-grid-2" style="margin-top:8px;">' +
        '<button class="uvd-btn uvd-btn-sm" data-action="share" data-url="' + encodeURIComponent(item.url) + '" style="background:rgba(139,92,246,0.2);">Chia sẻ</button>' +
        '<button class="uvd-btn uvd-btn-sm" data-action="copy" data-url="' + encodeURIComponent(item.url) + '">Sao chép</button>' +
        (item.type === 'IFRAME' ? 
          '<button class="uvd-btn uvd-btn-sm" data-action="iframe" data-url="' + encodeURIComponent(item.url) + '" style="text-align:center;grid-column:1/3;">Mở iframe</button>' :
          (item.type === 'M3U8' ?
            '<button class="uvd-btn uvd-btn-sm" data-action="quality" data-url="' + encodeURIComponent(item.url) + '">Chất lượng</button>' +
            '<button class="uvd-btn uvd-btn-sm" data-action="play" data-url="' + encodeURIComponent(item.url) + '" data-type="' + escapeHtml(item.type) + '" style="background:rgba(109,140,255,0.25);">Xem</button>' +
            '<button class="uvd-btn uvd-btn-sm" data-action="cmd" data-url="' + encodeURIComponent(item.url) + '" data-type="' + escapeHtml(item.type) + '" style="grid-column:1/3;">Lệnh tải</button>' :
            '<button class="uvd-btn uvd-btn-sm" data-action="play" data-url="' + encodeURIComponent(item.url) + '" data-type="' + escapeHtml(item.type) + '" style="background:rgba(109,140,255,0.25);">Xem</button>' +
            '<button class="uvd-btn uvd-btn-sm" data-action="cmd" data-url="' + encodeURIComponent(item.url) + '" data-type="' + escapeHtml(item.type) + '">Lệnh tải</button>'
          )
        ) +
      '</div>' +
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
      try { var u = new URL(urlToBlock); pattern = u.hostname; } catch(ex) {}
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
      else if (action === 'play') showVideoPlayer(u2, t || 'MP4');
      else if (action === 'cmd') showCommandPicker(u2, t);
      else if (action === 'iframe') window.__uvdSafeOpen(u2);
      return;
    }
    if (e.target === moreBtn) return;
  };
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
  document.getElementById('__uvd_set_speed__').onchange = function() { s.defaultSpeed = parseFloat(this.value); storage.set(data); };
  document.getElementById('__uvd_set_quality__').onchange = function() { s.defaultQuality = this.value; storage.set(data); };
  document.getElementById('__uvd_boost_range__').oninput = function() {
    s.volumeBoostMax = parseInt(this.value);
    document.getElementById('__uvd_boost_val__').textContent = s.volumeBoostMax + '%';
    storage.set(data);
  };
  document.getElementById('__uvd_doubletap_seconds__').onchange = function() {
    var val = parseInt(this.value) || 10;
    if (val < 1) val = 1; if (val > 60) val = 60;
    s.doubleTapSeconds = val; storage.set(data); toast('Đã đặt tua ' + val + ' giây');
  };
  document.getElementById('__uvd_hide_delay__').onchange = function() {
    var val = parseInt(this.value) || 5;
    if (val < 1) val = 1; if (val > 30) val = 30;
    s.hideDelay = val; storage.set(data); toast('Đã đặt ẩn sau ' + val + ' giây');
  };
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
        '<div class="uvd-profile-tags"><span class="uvd-tag">UMP DL v' + VERSION + ' PRO</span><span class="uvd-tag">Vanilla JS</span><span class="uvd-tag">HLS · M3U8</span><span class="uvd-tag">Adblock</span><span class="uvd-tag">Resume · Tua đúp · PiP</span></div>' +
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
      '<div style="font-size:12px;color:var(--text2);margin-bottom:8px;">Nhập mỗi dòng một từ khóa hoặc domain. Hỗ trợ regex nếu bắt đầu bằng <code>regex:</code>.</div>' +
      '<textarea id="__uvd_filter_text__" style="width:100%;height:80px;background:rgba(0,0,0,0.5);border:1px solid var(--border);border-radius:10px;color:var(--text);padding:12px;font-size:12px;">' + escapeHtml((data.filterlist||[]).join('\n')) + '</textarea>' +
      '<div class="uvd-grid-2" style="margin-top:8px;"><button class="uvd-btn uvd-btn-sm" id="__uvd_save_filter__">💾 Lưu</button><button class="uvd-btn uvd-btn-sm" id="__uvd_import_filter__">📂 Import file</button></div>' +
      '<div style="margin-top:6px;font-size:11px;color:var(--text3);">Đã chặn <span id="__uvd_blocked_ads__">' + __uvdAdBlockedCount + '</span> URL quảng cáo.</div>' +
    '</div>' +
    '<div class="uvd-card">' +
      '<div style="font-weight:600;margin-bottom:8px;">Sao lưu & Khôi phục</div>' +
      '<button class="uvd-btn uvd-btn-sm" id="__uvd_backup__" style="width:100%;margin-bottom:6px;">Xuất dữ liệu</button>' +
      '<button class="uvd-btn uvd-btn-sm" id="__uvd_restore__" style="width:100%;margin-bottom:6px;">Nhập dữ liệu</button>' +
      '<button class="uvd-btn uvd-btn-sm" id="__uvd_reset__" style="width:100%;background:var(--danger);">Đặt lại tất cả</button>' +
    '</div>' +
    '<div class="uvd-section-title"><span class="uvd-section-num">1</span> Cài đặt Bookmarklet</div>' +
    '<div class="uvd-card uvd-timeline-card">' +
      '<div class="uvd-step"><span class="uvd-step-num">1</span><span class="uvd-step-text">Mở một trang web, bấm vào biểu tượng <strong>⭐ Bookmark</strong> trên thanh địa chỉ.</span></div>' +
      '<div class="uvd-step"><span class="uvd-step-num">2</span><span class="uvd-step-text">Chọn <strong>"Chỉnh sửa"</strong> (Edit).</span></div>' +
      '<div class="uvd-step"><span class="uvd-step-num">3</span><span class="uvd-step-text"><strong>Đặt tên</strong> dễ nhớ, ví dụ: <code class="uvd-inline-code">UMP DL</code></span></div>' +
      '<div class="uvd-step"><span class="uvd-step-num">4</span><span class="uvd-step-text"><strong>Xóa toàn bộ địa chỉ</strong> trong ô URL, dán đoạn code sau vào:</span></div>' +
      '<div class="uvd-code-block"><textarea readonly rows="3">' + escapeHtml(bookmarkletCode) + '</textarea><button class="uvd-code-copy" data-copy-target="bookmarklet" title="Sao chép">📋</button></div>' +
      '<div class="uvd-step"><span class="uvd-step-num">5</span><span class="uvd-step-text">Bấm <strong>Lưu</strong> (Save).</span></div>' +
      '<div class="uvd-callout"><span class="uvd-callout-icon">💡</span><span>Từ lần sau, bạn chỉ cần gõ tên bookmark vào thanh địa chỉ rồi chọn nó để kích hoạt.</span></div>' +
    '</div>' +
    '<div class="uvd-profile-footer">© ' + new Date().getFullYear() + ' nguyenquocngu91 · UMP DL v' + VERSION + ' · Made for Chrome Android</div>';

  container.querySelectorAll('.uvd-btn').forEach(function(b) { b.addEventListener('click', addRipple); });
  container.querySelectorAll('.uvd-code-copy').forEach(function(b) {
    b.onclick = function() { if (this.dataset.copyTarget === 'bookmarklet') { copy(bookmarkletCode); toast('Đã sao chép code bookmarklet!'); } };
  });
  document.getElementById('__uvd_toggle_reducemotion__').onclick = function() {
    var isOn = this.classList.toggle('uvd-toggle-on');
    data.settings.reduceMotion = isOn; storage.set(data);
    applyMotionPref(document.getElementById('__uvd__'));
    toast(isOn ? 'Đã bật chế độ hiệu suất' : 'Đã tắt chế độ hiệu suất');
  };
  document.getElementById('__uvd_blur_range__').oninput = function() {
    var val = parseInt(this.value);
    data.settings.blurIntensity = val;
    document.getElementById('__uvd_blur_val__').textContent = val + 'px';
    storage.set(data); applyMotionPref(document.getElementById('__uvd__'));
  };
  document.getElementById('__uvd_transition_range__').oninput = function() {
    var val = parseFloat(this.value);
    data.settings.transitionSpeed = val;
    document.getElementById('__uvd_transition_val__').textContent = val + 's';
    storage.set(data); applyMotionPref(document.getElementById('__uvd__'));
  };
  document.getElementById('__uvd_toggle_glow__').onclick = function() {
    var isOn = this.classList.toggle('uvd-toggle-on');
    data.settings.glowEffects = isOn; storage.set(data);
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
    data.settings.blockAutoplay = isOn; storage.set(data);
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
      data = { favorites: [], siteProfiles: {}, history: [], filterlist: [], playbackPositions: {}, settings: Object.assign({}, data.settings) };
      compileAdFilters(); buildUI();
    }
  };
  document.getElementById('__uvd_save_filter__').onclick = function() {
    var raw = document.getElementById('__uvd_filter_text__').value;
    data.filterlist = raw.split('\n').map(function(s) { return s.trim(); }).filter(Boolean);
    storage.set(data); compileAdFilters();
    toast('Đã lưu filterlist (' + data.filterlist.length + ' mục) · áp dụng ngay');
    buildUI();
  };
  document.getElementById('__uvd_import_filter__').onclick = function() {
    var inp = document.createElement('input'); inp.type='file'; inp.accept='.txt,.json';
    inp.onchange = function(e) {
      var reader = new FileReader();
      reader.onload = function(ev) {
        var text = ev.target.result;
        try { var j = JSON.parse(text); if (Array.isArray(j.filterlist)) text = j.filterlist.join('\n'); } catch(ex) {}
        document.getElementById('__uvd_filter_text__').value = text;
      };
      reader.readAsText(e.target.files[0]);
    };
    inp.click();
  };
}

// ========== MINIMIZE / RESTORE SCRIPT PANEL ==========
function setMinimizeBtnState(minimized) {
  var btn = document.getElementById('__uvd_minimize_script__');
  if (!btn) return;
  btn.textContent = minimized ? '▲' : '▼';
  btn.title = minimized ? 'Mở rộng Script' : 'Thu nhỏ Script';
  btn.onclick = minimized ? restoreScriptPanel : minimizeScriptPanel;
}
function minimizeScriptPanel() {
  var panel = document.getElementById('__uvd__');
  var header = document.getElementById('__uvd_header__');
  if (!panel || !header || panel.classList.contains('uvd-panel-minimized')) return;
  var startHeight = panel.getBoundingClientRect().height;
  var targetHeight = (header.getBoundingClientRect().bottom - panel.getBoundingClientRect().top) + 16;
  panel.style.height = startHeight + 'px';
  panel.style.transition = 'height .38s cubic-bezier(.4,0,.2,1)';
  void panel.offsetHeight;
  panel.classList.add('uvd-panel-minimized');
  panel.style.height = targetHeight + 'px';
  setMinimizeBtnState(true);
}
function restoreScriptPanel() {
  var panel = document.getElementById('__uvd__');
  if (!panel || !panel.classList.contains('uvd-panel-minimized')) return;
  var targetHeight = window.innerHeight - 30;
  panel.style.transition = 'height .38s cubic-bezier(.4,0,.2,1)';
  panel.classList.remove('uvd-panel-minimized');
  panel.style.height = targetHeight + 'px';
  panel.addEventListener('transitionend', function onEnd(e) {
    if (e.propertyName !== 'height') return;
    panel.removeEventListener('transitionend', onEnd);
    panel.style.height = 'calc(100dvh - 30px)';
    panel.style.transition = '';
  });
  setMinimizeBtnState(false);
}

// ========== START ==========
buildUI();
console.log('V' + VERSION + ' UMP DL PRO - Video.js v8 Glass');
toast('V' + VERSION + ' PRO sẵn sàng!');
})(); 


