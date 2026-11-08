'use strict';

(function(){
  const SW_URL='./sw.js';
  const VERSION_URL='./version.json';
  const BUILD_QUERY='__taphoa_build';
  const MIN_RECHECK_MS=60000;
  let registration=null;
  let updateInFlight=null;
  let lastCheckAt=0;
  let controllerReloading=false;
  let userHasInteracted=false;
  let availableBuild='';
  // Reading a quote/order or viewing media is an active user task even with
  // an empty cart or no unfinished form input.
  for(const eventType of ['pointerdown','keydown','input','touchstart']){
    document.addEventListener(eventType,()=>{userHasInteracted=true;},
      {capture:true,passive:true});
  }
  function editingInput(){
    const active=document.activeElement;
    if(!active)return false;
    const tag=String(active.tagName||'').toLowerCase();
    return tag==='input'||tag==='textarea'||tag==='select'||Boolean(active.isContentEditable);
  }
  function safeToReload(){
    if(document.hidden||userHasInteracted||editingInput()||hasLiveCart())return false;
    if(window.TAPHOA_PRODUCTION?.getIdentity?.())return false;
    return true;
  }

  function currentBuildId(){
    return String(document.querySelector('meta[name="app-build-id"]')?.content||'').trim();
  }

  function hasLiveCart(){
    const candidates=[
      document.getElementById('cartTotalQtyDisplay'),
      document.getElementById('cartQtyBadge'),
      document.getElementById('cartItemCount')
    ];
    return candidates.some(el=>{
      const value=Number(String(el?.textContent||'').replace(/[^0-9]/g,''));
      return Number.isFinite(value)&&value>0;
    });
  }

  function cleanBuildQuery(){
    try{
      const url=new URL(location.href);
      if(!url.searchParams.has(BUILD_QUERY))return;
      url.searchParams.delete(BUILD_QUERY);
      history.replaceState(history.state,'',url.pathname+(url.search?url.search:'')+url.hash);
    }catch(_){}
  }

  // A visible update action is mandatory when authenticated/active sessions
  // cannot be safely reloaded automatically. No forced reload of live work.
  function showUpdateAction(targetBuild){
    availableBuild=targetBuild;
    if(!targetBuild || controllerReloading)return;
    // Some native/WebView runtimes and VM contracts have no body yet.
    // Remember the pending update without breaking the version check.
    if(!document.body || typeof document.createElement !== 'function')return;
    let action=document.getElementById('taphoa-update-notice');
    if(!action){
      action=document.createElement('button');
      action.id='taphoa-update-notice';
      action.type='button';
      action.setAttribute('aria-label','Có phiên bản mới, cập nhật ứng dụng');
      action.addEventListener('click',()=>{
        if(editingInput()||hasLiveCart()){
          action.textContent='Lưu giỏ hàng trước khi cập nhật';
          return;
        }
        freshNavigate(availableBuild,{explicit:true});
      });
      document.body.appendChild(action);
    }
    action.textContent='Có bản mới · Cập nhật';
    action.hidden=false;
  }

  function hideUpdateAction(){
    availableBuild='';
    document.getElementById('taphoa-update-notice')?.remove();
  }

  function freshNavigate(targetBuild,{explicit=false}={}){
    if(!targetBuild||controllerReloading)return false;
    if(!explicit){
      if(!safeToReload()){
        sessionStorage.setItem('taphoa-pwa-update-pending',targetBuild);
        showUpdateAction(targetBuild);
        return false;
      }
    } else if(editingInput()||hasLiveCart()){
      sessionStorage.setItem('taphoa-pwa-update-pending',targetBuild);
      showUpdateAction(targetBuild);
      return false;
    }

    const loopKey='taphoa-pwa-reload-'+targetBuild;
    const attempts=Number(sessionStorage.getItem(loopKey)||0);
    if(attempts>=3)return false;
    sessionStorage.setItem(loopKey,String(attempts+1));
    sessionStorage.setItem('taphoa-pwa-update-pending',targetBuild);
    controllerReloading=true;

    const url=new URL(location.href);
    url.searchParams.set(BUILD_QUERY,targetBuild);
    url.searchParams.set('_ts',String(Date.now()));
    location.replace(url.toString());
    return true;
  }

  async function fetchServerVersion(){
    const url=new URL(VERSION_URL,location.href);
    url.searchParams.set('_ts',String(Date.now()));
    const response=await fetch(url.toString(),{
      cache:'no-store',
      credentials:'same-origin',
      headers:{'Cache-Control':'no-cache'}
    });
    if(!response.ok)throw new Error('Version check '+response.status);
    return response.json();
  }

  function activateWaitingWorker(reg){
    try{ reg?.waiting?.postMessage?.({type:'SKIP_WAITING'}); }catch(_){}
  }

  function watchInstallingWorker(reg){
    const worker=reg?.installing;
    if(!worker)return;
    worker.addEventListener('statechange',()=>{
      if(worker.state==='installed')activateWaitingWorker(reg);
    });
  }

  async function checkForUpdate({force=false}={}){
    if(updateInFlight)return updateInFlight;
    const now=Date.now();
    if(!force && now-lastCheckAt<MIN_RECHECK_MS)return null;
    lastCheckAt=now;

    updateInFlight=(async()=>{
      try{
        if(registration){
          try{ await registration.update(); }catch(_){}
          activateWaitingWorker(registration);
          watchInstallingWorker(registration);
        }

        const server=await fetchServerVersion();
        const serverBuild=String(server?.build_id||'').trim();
        const runningBuild=currentBuildId();
        if(!serverBuild||!runningBuild)return null;

        if(serverBuild===runningBuild){
          hideUpdateAction();
          sessionStorage.removeItem('taphoa-pwa-update-pending');
          sessionStorage.removeItem('taphoa-pwa-reload-'+serverBuild);
          cleanBuildQuery();
          return {updated:false,build:serverBuild};
        }

        // Safe idle anonymous pages may update; active/authenticated pages
        // must see a clear opt-in instead of keeping an invisible stale build.
        showUpdateAction(serverBuild);
        freshNavigate(serverBuild);
        return {updated:true,from:runningBuild,to:serverBuild};
      }catch(error){
        return {updated:false,error:String(error?.message||error||'')};
      }finally{
        updateInFlight=null;
      }
    })();

    return updateInFlight;
  }

  async function registerAndCheck(){
    try{
      registration=await navigator.serviceWorker.register(SW_URL,{
        scope:'./',
        updateViaCache:'none'
      });

      registration.addEventListener('updatefound',()=>watchInstallingWorker(registration));
      activateWaitingWorker(registration);
    }catch(_){
      // Version checks still work when the embedded browser blocks SW.
    }
    await checkForUpdate({force:true});
  }

  if('serviceWorker' in navigator)navigator.serviceWorker.addEventListener('controllerchange',()=>{
    if(controllerReloading)return;
    const pending=String(sessionStorage.getItem('taphoa-pwa-update-pending')||'').trim();
    if(pending){
      freshNavigate(pending);
      return;
    }
    // A new worker took control during app startup. One reload is enough to
    // make the fresh controller serve the newest app shell.
    if(safeToReload()){
      controllerReloading=true;
      location.reload();
    }
  });

  if('serviceWorker' in navigator)void registerAndCheck();
  else void checkForUpdate({force:true});

  window.addEventListener('pageshow',()=>{
    void checkForUpdate();
  });

  document.addEventListener('visibilitychange',()=>{
    if(document.visibilityState==='visible')void checkForUpdate();
  });
  window.addEventListener('focus',()=>{void checkForUpdate();});
  window.addEventListener('online',()=>{void checkForUpdate({force:true});});
  // Bounded checks while the page stays open; never force reload active work.
  if(typeof setInterval === 'function'){
    setInterval(()=>{
      if(!document.hidden)void checkForUpdate();
    },5*60*1000);
  }

  window.TAPHOA_PWA_UPDATE=Object.freeze({
    check:()=>checkForUpdate({force:true}),
    getBuildId:currentBuildId,
    safeToReload
  });
})();
