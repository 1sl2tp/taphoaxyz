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

  function freshNavigate(targetBuild){
    if(!targetBuild||controllerReloading)return false;
    if(hasLiveCart()){
      sessionStorage.setItem('taphoa-pwa-update-pending',targetBuild);
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
          sessionStorage.removeItem('taphoa-pwa-update-pending');
          sessionStorage.removeItem('taphoa-pwa-reload-'+serverBuild);
          cleanBuildQuery();
          return {updated:false,build:serverBuild};
        }

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

      await checkForUpdate({force:true});
    }catch(_){}
  }

  if(!('serviceWorker' in navigator))return;

  navigator.serviceWorker.addEventListener('controllerchange',()=>{
    if(controllerReloading)return;
    const pending=String(sessionStorage.getItem('taphoa-pwa-update-pending')||'').trim();
    if(pending){
      freshNavigate(pending);
      return;
    }
    // A new worker took control during app startup. One reload is enough to
    // make the fresh controller serve the newest app shell.
    if(!hasLiveCart()){
      controllerReloading=true;
      location.reload();
    }
  });

  registerAndCheck();

  window.addEventListener('pageshow',()=>{
    void checkForUpdate();
  });

  document.addEventListener('visibilitychange',()=>{
    if(document.visibilityState==='visible')void checkForUpdate();
  });

  window.TAPHOA_PWA_UPDATE=Object.freeze({
    check:()=>checkForUpdate({force:true}),
    getBuildId:currentBuildId
  });
})();
