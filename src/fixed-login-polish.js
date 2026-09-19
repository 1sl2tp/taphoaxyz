/* FIXED SCRIPT: login-final-label */
(function(){
  function applyLoginPolish(){
    const button=document.querySelector('#loginScreen form button[type="submit"]');
    if(button) button.textContent='Tiếp tục';
  }

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',applyLoginPolish,{once:true});
  }else{
    applyLoginPolish();
  }

  window.applyLoginPolish=applyLoginPolish;
})();
