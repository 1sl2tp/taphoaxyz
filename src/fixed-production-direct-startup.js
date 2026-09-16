(function(){
  'use strict';

  const boot=window.onload;
  window.onload=null;

  let starting=false;
  let started=false;
  let retryTimer=null;

  function retrySoon(){
    if(started||retryTimer)return;
    retryTimer=setTimeout(()=>{
      retryTimer=null;
      void start();
    },500);
  }

  async function start(){
    if(started||starting)return;
    if(typeof boot!=='function'){
      console.error('FIXED production bootstrap missing');
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

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',()=>void start(),{once:true});
  }else{
    queueMicrotask(()=>void start());
  }
})();
