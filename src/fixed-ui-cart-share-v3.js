'use strict';

(function(){
  const originalShareOrderImage = typeof window.shareOrderImage === 'function' ? window.shareOrderImage : null;
  let cartShareCache=null;
  let cartSharePreparePromise=null;
  let cartSharePrepareSignature='';
  let cartSharePrepareTimer=null;
  let cartShareGeneration=0;
  let detailShareCache=null;
  let detailSharePreparePromise=null;
  let detailSharePrepareSignature='';
  let detailShareGeneration=0;

  function stableShareHash(value){
    const text=String(value||'');
    let hash=2166136261;
    for(let i=0;i<text.length;i++){
      hash^=text.charCodeAt(i);
      hash=Math.imul(hash,16777619);
    }
    return (hash>>>0).toString(36);
  }

  function cartShareSignature(entries=currentCartEntries()){
    const meta=getOrderMeta();
    const compact=entries.map(([id,item])=>[
      String(id),
      String(item?.name||''),
      Number(item?.price)||0,
      Number(item?.qty)||0,
      String(item?.note||'').trim()
    ]);
    return stableShareHash(JSON.stringify({
      orderId:String(meta.orderId||''),
      customer:String(meta.customer||''),
      draft:!!meta.isCreatingSaleDraft,
      items:compact
    }));
  }

  function detailShareSignature(source){
    if(!source)return '';
    const orderId=typeof editingOrderId!=='undefined' ? String(editingOrderId||'') : '';
    return stableShareHash(orderId+'|'+String(source.innerText||source.textContent||''));
  }

  function currentCartEntries(){
    const currentCart = typeof cart !== 'undefined' && cart ? cart : {};
    return Object.entries(currentCart).sort(([,a],[,b]) =>
      (Number(b?.__lastTouched)||0) - (Number(a?.__lastTouched)||0)
    );
  }

  function isCartOpen(){
    const wrap=document.getElementById('cartModalWrapper');
    return !!wrap &&
      !wrap.classList.contains('pointer-events-none') &&
      !wrap.classList.contains('opacity-0');
  }

  function escapeHtml(value){
    return String(value ?? '')
      .replace(/&/g,'&amp;')
      .replace(/</g,'&lt;')
      .replace(/>/g,'&gt;')
      .replace(/\"/g,'&quot;')
      .replace(/'/g,'&#39;');
  }

  function isShareCancel(error){
    const name=String(error?.name||'');
    const message=String(error?.message||error||'');
    return /abort|cancel|canceled|cancelled/i.test(name+' '+message);
  }

  function hideShareLoading(){
    if(typeof hideLoading==='function') hideLoading();
  }

  let nativeShareInFlight=false;

  function isIosShareContext(){
    const ua=String(navigator.userAgent||'');
    return /iPad|iPhone|iPod/.test(ua)
      || (navigator.platform==='MacIntel' && Number(navigator.maxTouchPoints)>1);
  }

  function isStandalonePwa(){
    return navigator.standalone===true
      || !!window.matchMedia?.('(display-mode: standalone)')?.matches;
  }

  function nativeFileSharePayload(files,title,text){
    // WebKit/iOS is more reliable when file shares contain files only.
    // In particular, installed PWAs can reject/abort image + text payloads.
    if(isIosShareContext()) return {files};
    return {files,title,text};
  }

  async function shareOrDownloadPng(blob,fileName,title,text){
    const file=new File([blob],fileName,{type:'image/png'});
    const files=[file];
    const canNativeShare=!!(navigator.share && navigator.canShare && navigator.canShare({files}));
    hideShareLoading();

    const iosPwaFallback=window.TAPHOA_IOS_SHARE_FALLBACK;
    if(iosPwaFallback?.shouldUse?.()){
      iosPwaFallback.open(files,{title:title||'Ảnh chia sẻ'});
      return;
    }

    if(canNativeShare){
      if(nativeShareInFlight)return;
      const activation=navigator.userActivation;
      if(activation && activation.isActive===false){
        if(typeof showToast==='function')showToast('Bấm Chia sẻ lại để mở bảng chia sẻ.','info');
        return;
      }

      nativeShareInFlight=true;
      try{
        const payload=nativeFileSharePayload(files,title,text);
        await navigator.share(payload);
      }catch(error){
        if(isShareCancel(error) && isIosShareContext()){
          window.TAPHOA_IOS_SHARE_FALLBACK?.open?.(files,{title:title||'Ảnh chia sẻ'});
          return;
        }
        throw error;
      }finally{
        nativeShareInFlight=false;
      }
      return;
    }

    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');
    a.href=url;
    a.download=fileName;
    a.click();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  }

  function getOrderMeta(){
    const orderId = typeof editingOrderId !== 'undefined' ? editingOrderId : '';
    const sheet = typeof editingOrderSheet !== 'undefined' ? editingOrderSheet : '';
    let customer = 'Khách lẻ';
    if (typeof selectedCustomer !== 'undefined' && selectedCustomer?.name) customer=selectedCustomer.name;

    let time='';
    if(orderId && sheet && typeof appData !== 'undefined' && Array.isArray(appData?.[sheet])){
      const rows=appData[sheet].slice(1).filter(r=>String(r?.[0]??'').trim()===String(orderId).trim());
      time=rows[0]?.[6] || '';
    }
    if(!time){
      const date=document.getElementById('currentDateStr')?.textContent?.trim() || '';
      const clock=document.getElementById('currentTimeStr')?.textContent?.trim() || '';
      time=[date,clock].filter(Boolean).join(' ');
    }
    return {
      orderId:orderId || '',
      customer,
      time:time || '--',
      isCreatingSaleDraft:!orderId
    };
  }

  function buildCapture(entries){
    const portrait=window.TAPHOA_ORDER_PORTRAIT;
    if(!portrait)throw new Error('portrait_order_renderer_unavailable');
    let totalQty=0, totalPrice=0;
    const items=entries.map(([id,item],index)=>{
      const qty=Number(item?.qty)||0;
      const price=Number(item?.price)||0;
      const amount=qty*price;
      totalQty+=qty;totalPrice+=amount;
      return {
        index:index+1,
        name:String(item?.name||id),
        note:String(item?.note||'').trim(),
        qtyText:qty.toLocaleString('vi-VN'),
        priceText:price.toLocaleString('vi-VN'),
        totalText:amount.toLocaleString('vi-VN')
      };
    });
    const meta=getOrderMeta();
    const built=portrait.createPage({
      isDraft:meta.isCreatingSaleDraft,
      orderId:meta.orderId,customer:meta.customer,time:meta.time,
      items,lineCount:items.length,totalQty,
      totalPriceText:totalPrice.toLocaleString('vi-VN')
    });
    return {...built,totalQty,totalPrice,meta};
  }

  function prepareDetailClone(source){
    const portrait=window.TAPHOA_ORDER_PORTRAIT;
    if(!portrait)throw new Error('portrait_order_renderer_unavailable');
    const getText=(parent,selector)=>String(parent?.querySelector(selector)?.textContent||'').trim();
    const rows=Array.from(source.querySelectorAll('#detailModalItems .order-detail-compact-grid'));
    if(!rows.length)throw new Error('order_detail_has_no_visible_rows');
    const items=rows.map((row,index)=>({
      index:getText(row,'.order-stt')||index+1,
      name:getText(row,'.order-name'),
      note:getText(row,'.order-line-note'),
      priceText:getText(row,'.order-price'),
      qtyText:getText(row,'.order-qty'),
      totalText:getText(row,'.order-total')
    }));
    const orderCode=getText(source,'#detailModalOrderCode')
      .replace(/^Mã đơn\s*:\s*/i,'');
    const meta=getOrderMeta();
    const customer=getText(source,'#detailModalKH')||meta.customer;
    const time=getText(source,'#detailModalTime')
      .replace(/^Thời gian\s*:\s*/i,'')||meta.time;
    const number=(text)=>Number(String(text||'0').replace(/[^\d-]/g,''))||0;
    const totalQty=number(getText(source,'#detailTotalQtyDisplay'))
      ||items.reduce((sum,item)=>sum+number(item.qtyText),0);
    const totalPriceText=getText(source,'#detailModalTotal')
      ||(items.reduce((sum,item)=>sum+number(item.totalText),0)).toLocaleString('vi-VN');
    return portrait.createPage({
      isDraft:false,
      orderId:orderCode||meta.orderId,
      customer,time,items,lineCount:items.length,totalQty,totalPriceText
    });
  }

  async function canvasToPngBlob(target,width,height,errorMessage){
    const capture=window.TAPHOA_SHARE_CAPTURE;
    if(!capture) throw new Error('Chưa khởi tạo bộ tạo ảnh.');
    const canvas=await capture.captureElement(target,{
      width,
      height,
      scale:1.4,
      renderTimeout:10000,
      libraryTimeout:5000
    });
    return capture.canvasToPngBlob(canvas,errorMessage);
  }

  async function prepareCartShareCache(){
    const entries=currentCartEntries();
    if(!entries.length){
      cartShareCache=null;
      return null;
    }
    const signature=cartShareSignature(entries);
    if(cartShareCache?.signature===signature)return cartShareCache;
    if(cartSharePreparePromise && cartSharePrepareSignature===signature)return cartSharePreparePromise;

    const generation=++cartShareGeneration;
    cartSharePrepareSignature=signature;
    const promise=(async()=>{
      let built=null;
      try{
        built=buildCapture(entries);
        await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
        const width=Math.ceil(built.capture.scrollWidth);
        const height=Math.ceil(built.capture.scrollHeight)+2;
        const blob=await canvasToPngBlob(built.capture,width,height,'Không tạo được ảnh giỏ hàng.');
        const safeId=String(built.meta.orderId||'').replace(/[^a-zA-Z0-9_-]+/g,'_');
        const artifact={
          signature,
          blob,
          fileName:(safeId ? 'donhang_'+safeId : 'don_dang_tao')+'.png',
          title:built.meta.isCreatingSaleDraft ? 'Đơn đang tạo' : 'Đơn hàng',
          text:built.meta.isCreatingSaleDraft ? 'Chi tiết đơn đang tạo' : 'Chi tiết đơn hàng'
        };
        if(generation===cartShareGeneration && cartShareSignature()===signature){
          cartShareCache=artifact;
        }
        return artifact;
      }finally{
        built?.host?.remove();
      }
    })().catch(()=>null).finally(()=>{
      if(cartSharePreparePromise===promise){
        cartSharePreparePromise=null;
        cartSharePrepareSignature='';
      }
    });
    cartSharePreparePromise=promise;
    return promise;
  }

  function scheduleCartSharePreparation(delay=120){
    clearTimeout(cartSharePrepareTimer);
    cartSharePrepareTimer=setTimeout(()=>{
      if(currentCartEntries().length)void prepareCartShareCache();
    },Math.max(0,Number(delay)||0));
  }

  async function prepareDetailShareCache(){
    const source=document.getElementById('orderDetailContentToShare');
    if(!source){
      detailShareCache=null;
      return null;
    }
    const signature=detailShareSignature(source);
    if(detailShareCache?.signature===signature)return detailShareCache;
    if(detailSharePreparePromise && detailSharePrepareSignature===signature)return detailSharePreparePromise;

    const generation=++detailShareGeneration;
    detailSharePrepareSignature=signature;
    const promise=(async()=>{
      let built=null;
      try{
        built=prepareDetailClone(source);
        await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
        const height=Math.ceil(built.clone.scrollHeight)+4;
        const blob=await canvasToPngBlob(built.clone,built.width,height,'Không tạo được ảnh đơn hàng.');
        const rawOrderId=(typeof editingOrderId!=='undefined' && editingOrderId)
          || document.getElementById('detailModalTitle')?.textContent?.trim()
          || '';
        const safeId=String(rawOrderId).replace(/[^a-zA-Z0-9_-]+/g,'_');
        const artifact={
          signature,
          blob,
          fileName:(safeId?'donhang_'+safeId:'donhang')+'.png',
          title:'Đơn hàng',
          text:'Chi tiết đơn hàng'
        };
        if(generation===detailShareGeneration && detailShareSignature(source)===signature){
          detailShareCache=artifact;
        }
        return artifact;
      }finally{
        built?.host?.remove();
      }
    })().catch(()=>null).finally(()=>{
      if(detailSharePreparePromise===promise){
        detailSharePreparePromise=null;
        detailSharePrepareSignature='';
      }
    });
    detailSharePreparePromise=promise;
    return promise;
  }

  function showShareReadyHint(){
    if(typeof showToast==='function'){
      showToast('Ảnh đã sẵn sàng. Bấm Chia sẻ lại để gửi ngay.', 'success');
    }
  }

  async function shareDetailOrderImageV3(){
    const source=document.getElementById('orderDetailContentToShare');
    if(!source){
      if(originalShareOrderImage) return originalShareOrderImage();
      return;
    }

    const signature=detailShareSignature(source);
    const ready=detailShareCache?.signature===signature ? detailShareCache : null;
    if(ready){
      try{
        await shareOrDownloadPng(ready.blob,ready.fileName,ready.title,ready.text);
      }catch(error){
        if(isShareCancel(error))return;
        if(typeof showAlertPopup==='function')showAlertPopup('Lỗi chia sẻ',error?.message||String(error));
      }
      return;
    }

    const prepared=await prepareDetailShareCache();
    if(!prepared){
      if(typeof showAlertPopup==='function')showAlertPopup('Lỗi tạo ảnh','Không tạo được ảnh đơn hàng.');
      return;
    }
    showShareReadyHint();
  }

  async function shareCartOrderImageV3(){
    const entries=currentCartEntries();
    if(!entries.length){
      if(typeof showAlertPopup==='function') showAlertPopup('Giỏ hàng trống','Không có sản phẩm để chia sẻ.');
      return;
    }

    const signature=cartShareSignature(entries);
    const ready=cartShareCache?.signature===signature ? cartShareCache : null;
    if(ready){
      try{
        await shareOrDownloadPng(ready.blob,ready.fileName,ready.title,ready.text);
      }catch(error){
        if(isShareCancel(error))return;
        if(typeof showAlertPopup==='function')showAlertPopup('Lỗi chia sẻ',error?.message||String(error));
      }
      return;
    }

    const prepared=await prepareCartShareCache();
    if(!prepared){
      if(typeof showAlertPopup==='function')showAlertPopup('Lỗi tạo ảnh','Không tạo được ảnh giỏ hàng.');
      return;
    }
    showShareReadyHint();
  }

  window.shareCartOrderImage=shareCartOrderImageV3;

  window.shareOrderImage=function(...args){
    if(isCartOpen() && currentCartEntries().length) return shareCartOrderImageV3();
    return shareDetailOrderImageV3.apply(this,args);
  };

  const cartShareBtn=document.getElementById('cartShareOrderBtn');
  if(cartShareBtn){
    cartShareBtn.onclick=shareCartOrderImageV3;
    cartShareBtn.setAttribute('data-cart-share-version','4-ios-prepared');
  }

  const detailShareBtn=document.getElementById('orderDetailShareButton');
  if(detailShareBtn){
    detailShareBtn.removeAttribute('onclick');
    detailShareBtn.onclick=shareDetailOrderImageV3;
    detailShareBtn.setAttribute('data-order-share-version','4-ios-prepared');
  }

  if(typeof renderCartUI==='function'){
    const renderCartUIBeforeSharePrep=renderCartUI;
    renderCartUI=function(...args){
      const result=renderCartUIBeforeSharePrep.apply(this,args);
      scheduleCartSharePreparation();
      return result;
    };
  }

  if(typeof renderCartFooterActions==='function'){
    const renderCartFooterActionsBeforeSharePrep=renderCartFooterActions;
    renderCartFooterActions=function(...args){
      const result=renderCartFooterActionsBeforeSharePrep.apply(this,args);
      scheduleCartSharePreparation();
      return result;
    };
  }

  if(typeof openOrderMobile==='function'){
    const openOrderMobileBeforeSharePrep=openOrderMobile;
    openOrderMobile=function(...args){
      const result=openOrderMobileBeforeSharePrep.apply(this,args);
      detailShareCache=null;
      setTimeout(()=>void prepareDetailShareCache(),20);
      return result;
    };
  }

  document.documentElement.setAttribute('data-ios-share-context',isIosShareContext()?'1':'0');
  document.documentElement.setAttribute('data-pwa-standalone',isStandalonePwa()?'1':'0');

  const prewarm=()=>window.TAPHOA_SHARE_CAPTURE?.ensureHtml2Canvas?.().catch(()=>{});
  if(typeof requestIdleCallback==='function')requestIdleCallback(prewarm,{timeout:1200});
  else setTimeout(prewarm,350);
  scheduleCartSharePreparation(0);
})();
