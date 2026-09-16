(function(){
  'use strict';

  const RELOAD_GUARD='taphoa.fixed.sw-cutover-reloaded.v2';

  async function boot(){
    if(!('serviceWorker' in navigator))return;
    if(location.protocol!=='https:'&&location.hostname!=='localhost')return;

    try{
      let reloading=false;
      navigator.serviceWorker.addEventListener('controllerchange',()=>{
        if(reloading)return;
        if(sessionStorage.getItem(RELOAD_GUARD)==='1')return;
        reloading=true;
        sessionStorage.setItem(RELOAD_GUARD,'1');
        location.reload();
      });

      const registration=await navigator.serviceWorker.register('./sw.js',{
        scope:'./',
        updateViaCache:'none'
      });

      const activateWaiting=()=>{
        if(registration.waiting)registration.waiting.postMessage({type:'SKIP_WAITING'});
      };

      activateWaiting();
      registration.addEventListener('updatefound',()=>{
        const worker=registration.installing;
        worker?.addEventListener('statechange',()=>{
          if(worker.state==='installed'&&navigator.serviceWorker.controller){
            worker.postMessage({type:'SKIP_WAITING'});
          }
        });
      });

      await registration.update().catch(()=>{});
      activateWaiting();
    }catch(error){
      console.warn('FIXED service-worker cutover',error);
    }
  }

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',()=>void boot(),{once:true});
  }else{
    void boot();
  }
})();
