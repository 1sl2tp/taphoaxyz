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

  // SPEC-PWA-UPDATE-20261116: SOURCE-MAIN is a source placeholder, not an
  // immutable release identity. If a host serves repository files directly,
  // both version.json and the running HTML say "source-main" forever.
  // Compare the current entry's local asset URLs to the uncached entry when
  // both markers are placeholders. This adds one small HTML read only in
  // that abnormal deployment mode, not on ordinary hashed production builds.
  function localAssetSignature(head){
    if(!head?.querySelectorAll)return '';
    return Array.from(head.querySelectorAll('script[src],link[rel="stylesheet"][href]'))
      .map(node=>{
        const attribute=String(node.tagName||'').toLowerCase()==='script'?'src':'href';
        const raw=node.getAttribute?.(attribute);
        if(!raw)return '';
        try{
          const url=new URL(raw,location.href);
          return url.origin===location.origin?url.pathname+url.search:'';
        }catch(_){return ''}
      }).filter(Boolean).join('\n');
  }
  function sourceFingerprint(value){
    let hash=2166136261;
    for(let i=0;i<value.length;i++)hash=Math.imul(hash^value.charCodeAt(i),16777619);
    return 'source-'+(hash>>>0).toString(36);
  }
  async function compareSourceShell(){
    if(typeof DOMParser!=='function'||!document.head)return null;
    const current=localAssetSignature(document.head);
    if(!current)return null;
    const url=new URL('./index.html',location.href);
    url.searchParams.set('_ts',String(Date.now()));
    const response=await fetch(url.toString(),{cache:'no-store',credentials:'same-origin'});
    if(!response.ok)throw new Error('Source shell check '+response.status);
    const html=await response.text();
    const remote=new DOMParser().parseFromString(html,'text/html');
    const latest=localAssetSignature(remote?.head);
    if(!latest)return null;
    return {changed:latest!==current,build:sourceFingerprint(latest)};
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
        // A slow SW registration/update must not block the actual build check.
        // Keep worker maintenance independent from the no-store version read.
        if(registration){
          void registration.update().then(()=>{
            activateWaitingWorker(registration);
            watchInstallingWorker(registration);
          }).catch(()=>{});
          activateWaitingWorker(registration);
        }

        const server=await fetchServerVersion();
        const serverBuild=String(server?.build_id||'').trim();
        const runningBuild=currentBuildId();
        if(!serverBuild||!runningBuild)return null;

        if(serverBuild==='source-main'&&runningBuild==='source-main'){
          // A non-built shell has identical placeholders across every commit.
          // Don't silently report it as the newest version.
          const source=await compareSourceShell();
          if(!source)return {updated:false,error:'source-build-unverified'};
          if(source.changed){
            showUpdateAction(source.build);
            freshNavigate(source.build);
            return {updated:true,from:runningBuild,to:source.build,source:true};
          }
          hideUpdateAction();
          return {updated:false,build:source.build,source:true};
        }
        if(serverBuild==='source-main'){
          // The backend served a source placeholder while the app is on a
          // stamped build. Never treat this as a genuine newer release.
          return {updated:false,error:'server-build-unverified'};
        }

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
    // Start checking the build immediately. Safari can hold service worker
    // registration while the PWA resumes; the notice must not wait for it.
    const initialVersionCheck=checkForUpdate({force:true});
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
    await initialVersionCheck;
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
