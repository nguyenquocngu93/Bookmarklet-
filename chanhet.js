javascript:void(function(){
// Singleton guard - cho phép reset khi SPA chuyển trang
var GUARD_ID='__gp2_instance__';
var currentGuardId=Date.now()+Math.random();

// Nếu đã có instance cũ, huỷ nó trước khi tạo mới
if(window[GUARD_ID]&&window[GUARD_ID].destroy){
window[GUARD_ID].destroy();
}
window[GUARD_ID]={id:currentGuardId,destroy:null};

// ═══════════════════════════════════════
// CONSTANTS & STATE
// ═══════════════════════════════════════
var STORAGE_KEY='gp2_config';
var GLOBAL_BL_KEY='gp2_global_blacklist';
var VERSION='2.0';
var host=location.hostname.replace(/^www\./,'');

var sessionAllow=new Set();
var sessionBlock=new Set();

var stats={blocked:0,allowed:0,asked:0,byType:{}};

// ═══════════════════════════════════════
// STORAGE HELPERS
// ═══════════════════════════════════════
function getStorage(){
try{return JSON.parse(localStorage.getItem(STORAGE_KEY))||{}}
catch(e){return{}}
}

function saveStorage(data){
try{localStorage.setItem(STORAGE_KEY,JSON.stringify(data))}
catch(e){}
}

function getGlobalBL(){
try{return JSON.parse(localStorage.getItem(GLOBAL_BL_KEY))||[]}
catch(e){return[]}
}

function saveGlobalBL(list){
try{localStorage.setItem(GLOBAL_BL_KEY,JSON.stringify(list))}
catch(e){}
}

var cfg=getStorage();
if(!cfg[host])cfg[host]={whitelist:[],blacklist:[],mode:'ask'};
var globalBL=new Set(getGlobalBL());

function siteCfg(){return cfg[host]}

function saveConfig(){saveStorage(cfg)}

// ═══════════════════════════════════════
// URL HELPERS
// ═══════════════════════════════════════
function extractDomain(url){
try{return new URL(url,location.href).hostname.replace(/^www\./,'')}
catch(e){return url}
}

function isSameDomain(url){
var d=extractDomain(url);
return d===host||d.endsWith('.'+host)
}

function isAllowed(url){
var d=extractDomain(url);
return sessionAllow.has(d)||siteCfg().whitelist.includes(d)
}

function isBlocked(url){
var d=extractDomain(url);
return sessionBlock.has(d)||siteCfg().blacklist.includes(d)||globalBL.has(d)
}

// ═══════════════════════════════════════
// TOAST
// ═══════════════════════════════════════
function showToast(msg,color){
color=color||'#333';
var t=document.createElement('div');
t.innerHTML=msg;
t.style.cssText='position:fixed;top:50px;right:10px;background:'+color+';color:#fff;padding:8px 15px;border-radius:15px;z-index:2147483648;font:bold 11px Arial;box-shadow:0 3px 10px rgba(0,0,0,.5);pointer-events:none;transition:opacity .3s;';
document.body.appendChild(t);
setTimeout(function(){t.style.opacity='0';setTimeout(function(){t.remove()},300)},2500)
}

// ═══════════════════════════════════════
// ORIGINAL REFERENCES
// ═══════════════════════════════════════
var origOpen=window.open;
var origAssign=location.assign.bind(location);
var origReplace=location.replace.bind(location);
var origPushState=history.pushState.bind(history);
var origReplaceState=history.replaceState.bind(history);
var origSetTimeout=window.setTimeout;

// ═══════════════════════════════════════
// CORE ACTION HANDLER
// ═══════════════════════════════════════
var pendingQueue=[];
var activeDialog=null;

function handleAction(action){
var url=action.url;
var type=action.type;
if(isAllowed(url)){
action.execute();
return
}
if(isBlocked(url)||siteCfg().mode==='block'){
showToast('🚫 Blocked: '+extractDomain(url),'#f44336');
return null
}
if(siteCfg().mode==='allow'){
action.execute();
return
}
stats.asked++;
pendingQueue.push(action);
if(!activeDialog)processQueue();
return null
}

// ═══════════════════════════════════════
// PROTECTION LAYERS
// ═══════════════════════════════════════

function applyAllProtections(){
// Layer 1: window.open
window.open=function(url,target,features){
var abs=url?new URL(url,location.href).href:'';
if(abs&&!isSameDomain(abs)){
return handleAction({
type:'window.open',
url:abs,
trigger:'window.open("'+abs.slice(0,50)+'...")',
execute:function(){return origOpen.call(window,url,target,features)}
})
}
return origOpen.call(window,url,target,features)
};

// Layer 2: location.assign/replace
try{
location.assign=function(url){
var abs=new URL(url,location.href).href;
if(!isSameDomain(abs)){
handleAction({
type:'location.assign',
url:abs,
trigger:'location.assign()',
execute:function(){origAssign(url)}
});
return
}
origAssign(url)
};
location.replace=function(url){
var abs=new URL(url,location.href).href;
if(!isSameDomain(abs)){
handleAction({
type:'location.replace',
url:abs,
trigger:'location.replace()',
execute:function(){origReplace(url)}
});
return
}
origReplace(url)
}
}catch(e){}

// Layer 3: history
history.pushState=function(state,title,url){
var result=origPushState(state,title,url);
if(url){
var abs=new URL(url,location.href).href;
if(!isSameDomain(abs)){
console.log('🚫 Blocked history.pushState:',abs);
return
}
}
// Kích hoạt lại protection sau khi pushState
setTimeout(rearmProtection,100);
return result
};
history.replaceState=function(state,title,url){
var result=origReplaceState(state,title,url);
if(url){
var abs=new URL(url,location.href).href;
if(!isSameDomain(abs)){
console.log('🚫 Blocked history.replaceState:',abs);
return
}
}
setTimeout(rearmProtection,100);
return result
};

// Layer 4: Meta refresh
document.querySelectorAll('meta[http-equiv="refresh" i]').forEach(function(m){
var content=m.getAttribute('content')||'';
var match=content.match(/^\s*\d+\s*;\s*url\s*=\s*(.+)$/i);
if(match){
var url=match[1].trim().replace(/^['"]|['"]$/g,'');
var abs=new URL(url,location.href).href;
if(!isSameDomain(abs)&&isBlocked(abs)){
m.remove();
console.log('🚫 Blocked meta refresh:',abs)
}
}
});

// Layer 5: Click capture
document.removeEventListener('click',clickHandler,true);
document.addEventListener('click',clickHandler,true);
}

function clickHandler(e){
var link=e.target.closest('a');
if(!link||!link.href)return;
var skip=/^(#|javascript:|mailto:|tel:)/;
if(skip.test(link.href))return;
var isExternal=!isSameDomain(link.href);
var isNewTab=link.target==='_blank';
if(!isExternal&&!isNewTab)return;
if(isAllowed(link.href))return;
if(isBlocked(link.href)){
e.preventDefault();
e.stopImmediatePropagation();
showToast('🚫 Blocked: '+extractDomain(link.href),'#f44336');
return
}
e.preventDefault();
e.stopImmediatePropagation();
handleAction({
type:'link-click',
url:link.href,
trigger:'<a target="'+(link.target||'self')+'">',
execute:function(){
if(isNewTab)origOpen.call(window,link.href,'_blank');
else origAssign(link.href)
}
})
}

// ═══════════════════════════════════════
// AUTO-REARM: MutationObserver
// ═══════════════════════════════════════
var domObserver=new MutationObserver(function(mutations){
var needsRearm=false;
for(var i=0;i<mutations.length;i++){
var m=mutations[i];
for(var j=0;j<m.addedNodes.length;j++){
var node=m.addedNodes[j];
if(node.nodeType!==1)continue;
var tag=node.tagName;
// Phát hiện meta refresh mới
if(tag==='META'&&(node.getAttribute('http-equiv')||'').toLowerCase()==='refresh'){
var content=node.getAttribute('content')||'';
var match=content.match(/^\s*\d+\s*;\s*url\s*=\s*(.+)$/i);
if(match){
var url=match[1].trim().replace(/^['"]|['"]$/g,'');
var abs=new URL(url,location.href).href;
if(!isSameDomain(abs)&&isBlocked(abs)){
node.remove();
console.log('🚫 Blocked injected meta refresh:',abs)
}
}
}
// Phát hiện iframe quảng cáo
if(tag==='IFRAME'){
var src=node.src||'';
if(src&&!isSameDomain(src)&&isBlocked(src)){
node.remove();
showToast('🚫 Blocked iframe: '+extractDomain(src),'#f44336')
}
}
// Phát hiện overlay quảng cáo
if(tag==='DIV'||tag==='A'){
setTimeout(function(){
if(!node.parentNode)return;
var s=getComputedStyle(node);
var r=node.getBoundingClientRect();
if((s.position==='fixed'||s.position==='absolute')&&+s.zIndex>9999&&r.width>200&&r.height>200&&parseFloat(s.opacity)<0.5){
node.remove();
showToast('🚫 Blocked overlay','#f44336')
}
},100)
}
}
// Phát hiện thay đổi lớn (video player mới)
if(m.addedNodes.length>3)needsRearm=true
}
if(needsRearm){
console.log('🔄 Phát hiện SPA thay đổi, tái kích hoạt...');
setTimeout(rearmProtection,50)
}
});

function startObserver(){
domObserver.disconnect();
domObserver.observe(document.documentElement,{childList:true,subtree:true})
}

// ═══════════════════════════════════════
// REARM FUNCTION - GỌI LẠI KHI SPA CHUYỂN TRANG
// ═══════════════════════════════════════
function rearmProtection(){
// Cập nhật host mới (phòng khi SPA chuyển domain)
host=location.hostname.replace(/^www\./,'');
if(!cfg[host])cfg[host]={whitelist:[],blacklist:[],mode:'ask'};

// Cập nhật global BL
globalBL=new Set(getGlobalBL());

// Áp dụng lại tất cả các lớp bảo vệ
applyAllProtections();

// Khởi động lại observer
startObserver();

console.log('🛡️ Guard PRO rearmed - '+host+' - Mode: '+siteCfg().mode+' - BL: '+siteCfg().blacklist.length+' - Global BL: '+globalBL.size)
}

// ═══════════════════════════════════════
// DIALOG (giữ nguyên từ code gốc, rút gọn)
// ═══════════════════════════════════════
function processQueue(){
if(pendingQueue.length===0){activeDialog=null;return}
var action=pendingQueue.shift();
var domain=extractDomain(action.url);
var isExternal=!isSameDomain(action.url);
var accentColor=isExternal?'#f44336':'#FF9800';
var icon={'window.open':'🪟','location.assign':'🔀','location.replace':'🔀','link-click':'🔗'}[action.type]||'⚠️';

var overlay=document.createElement('div');
overlay.id='__gp2_dialog__';
overlay.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.9);z-index:2147483647;display:flex;align-items:center;justify-content:center;padding:15px;font-family:-apple-system,Arial,sans-serif;';

overlay.innerHTML='<div style="background:linear-gradient(135deg,#1a1a1a,#2a2a2a);border:2px solid '+accentColor+';border-radius:15px;padding:20px;max-width:500px;width:100%;color:#fff;box-shadow:0 20px 60px rgba(0,0,0,.9);">'+
'<div style="text-align:center;margin-bottom:12px;"><div style="font-size:40px;">'+icon+'</div><h2 style="margin:4px 0 0;color:'+accentColor+';font-size:16px;">'+action.type+'</h2>'+(isExternal?'<div style="color:#f44336;font-size:11px;font-weight:bold;margin-top:4px;">⚠️ EXTERNAL DOMAIN</div>':'')+'</div>'+
'<div style="background:#0a0a0a;padding:10px;border-radius:8px;margin-bottom:10px;font-size:11px;"><div style="color:#888;margin-bottom:3px;">URL:</div><div style="color:#fff;font-family:monospace;word-break:break-all;">'+action.url+'</div><div style="color:'+accentColor+';margin-top:5px;">🌐 '+domain+'</div></div>'+
'<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;">'+
'<button id="__gp2_allow_once__" style="background:#4CAF50;color:#fff;border:0;padding:10px;border-radius:6px;font-weight:bold;cursor:pointer;">✓ Allow once</button>'+
'<button id="__gp2_block_once__" style="background:#f44336;color:#fff;border:0;padding:10px;border-radius:6px;font-weight:bold;cursor:pointer;">✕ Block once</button>'+
'<button id="__gp2_whitelist__" style="background:#1B5E20;color:#fff;border:0;padding:10px;border-radius:6px;font-weight:bold;cursor:pointer;">⭐ Whitelist forever</button>'+
'<button id="__gp2_blacklist__" style="background:#B71C1C;color:#fff;border:0;padding:10px;border-radius:6px;font-weight:bold;cursor:pointer;">🚫 Blacklist forever</button>'+
'<button id="__gp2_global_blacklist__" style="background:#880000;color:#fff;border:0;padding:10px;border-radius:6px;font-weight:bold;cursor:pointer;grid-column:span 2;">🌍 Blacklist globally (all sites)</button>'+
'</div></div>';

document.body.appendChild(overlay);
activeDialog=overlay;

function close(then){
overlay.remove();
activeDialog=null;
if(then)then();
setTimeout(processQueue,100)
}

document.getElementById('__gp2_allow_once__').onclick=function(){
close(function(){action.execute()})
};
document.getElementById('__gp2_block_once__').onclick=function(){
close(function(){showToast('🚫 Blocked','#f44336')})
};
document.getElementById('__gp2_whitelist__').onclick=function(){
siteCfg().whitelist.push(domain);
saveConfig();
close(function(){showToast('⭐ Whitelisted: '+domain,'#4CAF50');action.execute()})
};
document.getElementById('__gp2_blacklist__').onclick=function(){
siteCfg().blacklist.push(domain);
saveConfig();
close(function(){showToast('🚫 Blacklisted: '+domain,'#B71C1C')})
};
document.getElementById('__gp2_global_blacklist__').onclick=function(){
globalBL.add(domain);
saveGlobalBL(Array.from(globalBL));
close(function(){showToast('🌍 Globally blacklisted: '+domain,'#880000')})
}
}

// ═══════════════════════════════════════
// INITIAL SETUP + AUTO-REARM
// ═══════════════════════════════════════

// Áp dụng lần đầu
applyAllProtections();

// Bắt đầu observer
startObserver();

// Lắng nghe popstate (back/forward)
window.addEventListener('popstate',function(){
setTimeout(rearmProtection,100)
});

// Lắng nghe hashchange
window.addEventListener('hashchange',function(){
setTimeout(rearmProtection,100)
});

// Đăng ký hàm destroy để cleanup khi tạo instance mới
window[GUARD_ID].destroy=function(){
domObserver.disconnect();
window.open=origOpen;
try{location.assign=origAssign;location.replace=origReplace}catch(e){}
history.pushState=origPushState;
history.replaceState=origReplaceState;
document.removeEventListener('click',clickHandler,true);
window.removeEventListener('popstate',function(){});
window.removeEventListener('hashchange',function(){})
};

// Thông báo
var msg=document.createElement('div');
msg.textContent='🛡️ Guard PRO v2 Active (Auto-rearm)';
msg.style.cssText='position:fixed;top:10px;left:50%;transform:translateX(-50%);background:linear-gradient(135deg,#1B5E20,#2E7D32);color:#fff;padding:8px 16px;border-radius:20px;z-index:999999;font:bold 12px Arial;box-shadow:0 3px 10px rgba(0,0,0,.5);pointer-events:none;';
document.body.appendChild(msg);
setTimeout(function(){msg.style.opacity='0';setTimeout(function(){msg.remove()},300)},2000);

console.log('🛡️ Guard PRO v2 Active - '+host+' - Auto-rearm ENABLED - Mode: '+siteCfg().mode+' - BL: '+siteCfg().blacklist.length+' domains');
})();