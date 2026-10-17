'use strict';
// One PNG per action, with explicit iOS/PWA handling.
// WebKit sometimes navigates to blob: instead of downloading; never invoke a
// fake "direct save" on iPhone/iPad where Safari has no Photos-write API.
(function(){
  function isIosWebkit(){
    const nav=typeof navigator==='undefined'?{}:navigator;
    const ua=String(nav.userAgent||'');
    return /iPad|iPhone|iPod/i.test(ua)
      || (nav.platform==='MacIntel'&&Number(nav.maxTouchPoints)>1);
  }
  function savePng(blob,fileName){
    if(!(blob instanceof Blob)||!blob.size||blob.type!=='image/png'){
      throw new Error('Ảnh PNG không hợp lệ, vui lòng thử lại.');
    }
    const name=String(fileName||'anh.png').replace(/[\\/:*?"<>|\x00-\x1f]/g,'_').slice(0,100);
    const safeName=/\.png$/i.test(name)?name:name+'.png';

    if(isIosWebkit()){
      // iOS Safari and installed PWA may open blob: URLs as another website,
      // displaying "Mở trong…" / "Thêm…". Keep the image inside the PWA.
      // Saving to Photos is user-mediated: long press and "Lưu vào Ảnh".
      const viewer=window.TAPHOA_IOS_SHARE_FALLBACK;
      if(!viewer?.open)throw new Error('Chưa tải màn xem ảnh. Vui lòng tải lại ứng dụng.');
      const ok=viewer.open([new File([blob],safeName,{type:'image/png'})],{
        title:'Lưu ảnh',mode:'save'
      });
      if(!ok)throw new Error('Không thể hiển thị ảnh để lưu.');
      return 'preview';
    }

    // Desktop browsers: normal direct download; do not invoke share/preview.
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
      setTimeout(()=>URL.revokeObjectURL(url),30000);
    }
    return true;
  }
  window.TAPHOA_IMAGE_SAVE=Object.freeze({savePng,isIosWebkit});
})();