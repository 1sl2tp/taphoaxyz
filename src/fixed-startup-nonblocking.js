(function(){
  'use strict';

  let started=false;
  let domReady=document.readyState!=='loading';

  function tryStart(){
    if(started||!domReady)return;
    const boot=window.TAPHOA_FIXED_PRODUCTION_BOOT;
    if(typeof boot!=='function'||!window.TAPHOA_PRODUCTION||window.TAPHOA_FIXED_PRODUCTION_READY!==true)return;
    started=true;
    Promise.resolve(boot()).catch(error=>{
      console.error('FIXED production startup',error);
    });
  }

  if(!domReady){
    document.addEventListener('DOMContentLoaded',()=>{
      domReady=true;
      tryStart();
    },{once:true});
  }

  window.addEventListener('taphoa-production-bridge-ready',tryStart);
  window.addEventListener('taphoa-fixed-production-ready',tryStart);
  queueMicrotask(tryStart);
})();
