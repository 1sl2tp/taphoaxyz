'use strict';
// Shared one-tap PNG download for Order / Cart / Debt on web and installed PWA.
// This is a file download, not navigator.share and not the iOS share preview.
// Browser/OS download destinations and any native permission prompt remain theirs.
(function(){
  function savePng(blob,fileName){
    if(!(blob instanceof Blob)||!blob.size||blob.type!=='image/png'){
      throw new Error('Ảnh PNG không hợp lệ, vui lòng thử lại.');
    }
    const name=String(fileName||'anh.png').replace(/[\\/:*?"<>|\x00-\x1f]/g,'_').slice(0,100);
    const safeName=/\.png$/i.test(name)?name:name+'.png';
    const url=URL.createObjectURL(blob);
    const anchor=document.createElement('a');
    anchor.href=url;
    anchor.download=safeName;
    anchor.rel='noopener';
    anchor.style.display='none';
    try{
      document.body.appendChild(anchor);
      anchor.click();
    }finally{
      anchor.remove();
      // Safari/iOS can consume the blob after the click task completes.
      setTimeout(()=>URL.revokeObjectURL(url),30000);
    }
    return true;
  }
  window.TAPHOA_IMAGE_SAVE=Object.freeze({savePng});
})();