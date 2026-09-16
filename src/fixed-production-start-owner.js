(function(){
  'use strict';

  const boot=window.onload;
  window.onload=null;

  if(typeof boot==='function'){
    window.TAPHOA_FIXED_PRODUCTION_BOOT=boot;
    window.TAPHOA_FIXED_PRODUCTION_READY=true;
    window.dispatchEvent(new CustomEvent('taphoa-fixed-production-ready'));
  }else{
    console.error('FIXED production bootstrap owner missing');
  }
})();
