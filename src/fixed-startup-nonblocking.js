(function(){
  'use strict';

  let started=false;

  function startWhenDomReady(){
    if(started)return;
    const boot=window.onload;
    if(typeof boot!=='function')return;
    started=true;
    window.onload=null;
    Promise.resolve(boot.call(window,new Event('load'))).catch(error=>{
      console.error('FIXED nonblocking startup',error);
    });
  }

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',startWhenDomReady,{once:true});
  }else{
    startWhenDomReady();
  }
})();
