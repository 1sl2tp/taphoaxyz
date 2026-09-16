(function(){
  'use strict';

  let started=false;
  let starting=false;
  let retryTimer=null;
  let domReady=document.readyState!=='loading';

  function retrySoon(){
    if(started||retryTimer)return;
    retryTimer=setTimeout(tryStart,500);
  }

  async function tryStart(){
    retryTimer=null;
    if(started||starting||!domReady)return;

    const boot=window.TAPHOA_FIXED_PRODUCTION_BOOT;
    if(typeof boot!=='function'||window.TAPHOA_FIXED_PRODUCTION_READY!==true){
      retrySoon();
      return;
    }

    starting=true;
    try{
      await import('./fixed-production-bridge.js');
      if(!window.TAPHOA_PRODUCTION)throw new Error('Production bridge chưa sẵn sàng');
      await boot();
      started=true;
    }catch(error){
      console.error('FIXED production startup',error);
      retrySoon();
    }finally{
      starting=false;
    }
  }

  if(!domReady){
    document.addEventListener('DOMContentLoaded',()=>{
      domReady=true;
      void tryStart();
    },{once:true});
  }

  window.addEventListener('taphoa-production-bridge-ready',()=>void tryStart());
  window.addEventListener('taphoa-fixed-production-ready',()=>void tryStart());
  queueMicrotask(()=>void tryStart());
})();
