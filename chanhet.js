(function(){
  Object.defineProperty(document,'visibilityState',{value:'visible',writable:false});
  Object.defineProperty(document,'hidden',{value:false,writable:false});
  
  ['visibilitychange','webkitvisibilitychange','blur','focus','pagehide','pageshow'].forEach(function(e){
    window.addEventListener(e,function(ev){ev.stopImmediatePropagation();ev.stopPropagation()},true);
    document.addEventListener(e,function(ev){ev.stopImmediatePropagation();ev.stopPropagation()},true)
  });

  setInterval(function(){
    var v=document.querySelector('video');
    if(v&&v.paused&&!v.ended)v.play().catch(function(){})
  },2000);

  var ai=null,ion=true;

  function sa(){
    if(ai)return;
    ai=setInterval(function(){
      var v=document.querySelector('video');
      var ad=document.querySelector('.ad-showing');
      var sk=document.querySelector('.ytp-ad-skip-button,.ytp-skip-ad-button');
      if(ad&&v){
        v.playbackRate=16;
        v.muted=true;
        st.textContent='📢 Đang skip...';
        st.style.color='#ffcc00';
      } else if(v&&v.playbackRate===16){
        v.playbackRate=1;
        v.muted=false;
        st.textContent='✅ Không có quảng cáo';
        st.style.color='#00e676';
      }
      if(sk)sk.click();
    },100);
  }

  function xa(){
    clearInterval(ai);
    ai=null;
    var v=document.querySelector('video');
    if(v){v.playbackRate=1;v.muted=false;}
    st.textContent='⏸ Đã tắt';
    st.style.color='#aaa';
  }

  var p=document.createElement('div');
  p.style.cssText='position:fixed;top:60px;right:10px;background:#1a1a1a;color:#fff;padding:12px;border-radius:12px;z-index:2147483647;font:12px Arial;box-shadow:0 4px 15px rgba(0,0,0,0.6);width:190px;border:1px solid #444';
  p.innerHTML='<div style="font:bold 13px Arial;color:#f00;margin-bottom:10px">▶ YT Enhancer</div>'
    +'<div style="margin-bottom:8px">🎵 Background Play: <b style="color:#0f0">ON</b></div>'
    +'<div style="margin-bottom:6px">⚡ Ad Skip x16: <button id="ytTb" style="background:#0c5;border:none;color:#fff;padding:2px 10px;border-radius:10px;cursor:pointer;font-size:11px">ON</button></div>'
    +'<div id="ytSt" style="color:#0e6;font-size:11px;margin:8px 0">✅ Không có quảng cáo</div>'
    +'<div style="border-top:1px solid #333;padding-top:8px;display:flex;gap:6px">'
    +'<button id="ytMn" style="flex:1;background:#333;border:none;color:#fff;padding:4px;border-radius:8px;cursor:pointer;font-size:11px">Thu nhỏ</button>'
    +'<button id="ytCl" style="flex:1;background:#c00;border:none;color:#fff;padding:4px;border-radius:8px;cursor:pointer;font-size:11px">Đóng</button>'
    +'</div>';
  document.body.appendChild(p);

  var st=document.getElementById('ytSt');
  sa();

  document.getElementById('ytTb').onclick=function(){
    if(ion){xa();this.textContent='OFF';this.style.background='#c00';ion=false;}
    else{sa();this.textContent='ON';this.style.background='#0c5';ion=true;}
  };

  document.getElementById('ytMn').onclick=function(){
    p.innerHTML='<span id="ytEx" style="cursor:pointer;font:bold 11px Arial;color:#fff">▶ YT 🟢</span>';
    p.style.cssText='position:fixed;top:60px;right:10px;background:#f00;padding:6px 12px;border-radius:20px;z-index:2147483647';
    document.getElementById('ytEx').onclick=function(){
      location.reload();
    };
  };

  document.getElementById('ytCl').onclick=function(){
    xa();p.remove();
  };
})();
