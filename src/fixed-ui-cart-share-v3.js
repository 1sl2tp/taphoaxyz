'use strict';

(function(){
  const originalShareOrderImage = typeof window.shareOrderImage === 'function' ? window.shareOrderImage : null;
  let cartShareCache=null;
  let cartSharePreparePromise=null;
  let cartSharePrepareSignature='';
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
        // Generating the existing saved-order PNG can outlast Safari's
        // click activation. Show the image preview, never substitute text.
        if(isIosShareContext() && iosPwaFallback?.open){
          iosPwaFallback.open(files,{title:title||'Ảnh đơn hàng'});
          return;
        }
        if(typeof showToast==='function')showToast('Ảnh đơn hàng đã sẵn sàng. Bấm Chia sẻ lại để gửi ảnh.','info');
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

  // Every TAPHOA customer ID is the canonical V21 account UUID. Do not
  // match customers by display name or send to a guessed conversation.
  const CHAT_URL='https://chat.taphoa.xyz/';
  const CHAT_ORIGIN='https://chat.taphoa.xyz';
  const UUID_PATTERN=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  let liveChatShare=null;

  function cartChatCustomerId(){
    const id=String(typeof selectedCustomer!=='undefined'?selectedCustomer?.id||'':'').trim();
    return UUID_PATTERN.test(id)?id.toLowerCase():'';
  }

  function detailChatCustomerId(){
    // A detail popup may show a different order from the cart's selected KH.
    // Resolve from its actual order row, never fall back to selectedCustomer.
    const code=String(document.getElementById('detailModalOrderCode')?.textContent||'')
      .replace(/^Mã đơn\s*:\s*/i,'').trim();
    if(!code||typeof appData==='undefined')return'';
    const sheets=[typeof editingOrderSheet!=='undefined'?editingOrderSheet:'',
      window.activeViewingSheet,'dongiao','dontam'].filter(Boolean);
    const ids=new Set();
    for(const sheet of new Set(sheets)){
      for(const row of Array.isArray(appData[sheet])?appData[sheet].slice(1):[]){
        if(String(row?.[0]||'').trim()!==code)continue;
        const id=String(row?.[1]||'').trim();
        if(UUID_PATTERN.test(id))ids.add(id.toLowerCase());
      }
    }
    return ids.size===1?[...ids][0]:'';
  }

  function beginChatOrderShare(customerId){
    const contactId=String(customerId||'').toLowerCase();
    if(!UUID_PATTERN.test(contactId)||!globalThis.crypto?.getRandomValues)return null;
    const random=new Uint8Array(16);
    crypto.getRandomValues(random);
    const token=Array.from(random,b=>b.toString(16).padStart(2,'0')).join('');
    const url=CHAT_URL+'?taphoa_share='+token+'&contact='+encodeURIComponent(contactId);

    // Opening MUST happen in the original click before any await/canvas capture.
    // This is an explicit image-share gesture; there is NO automatic send.
    let target;
    try{target=window.open(url,'taphoa-order-chat');}catch{return null;}
    if(!target)return null;
    if(liveChatShare?.cancel)liveChatShare.cancel();
    let ready=false;
    let delivered=false;
    let artifact=null;
    let stopped=false;
    const onMessage=event=>{
      if(stopped||event.origin!==CHAT_ORIGIN||event.source!==target)return;
      const data=event.data||{};
      if(data.token!==token)return;
      if(data.type==='TAPHOA_ORDER_IMAGE_READY'){
        if(String(data.contactId||'').toLowerCase()!==contactId)return;
        ready=true;
        maybeTransfer();
      }else if(data.type==='TAPHOA_ORDER_IMAGE_ATTACHED'){
        stopped=true;
        window.removeEventListener('message',onMessage);
        if(liveChatShare?.token===token)liveChatShare=null;
      }
    };
    function maybeTransfer(){
      if(!ready||!artifact||delivered||stopped)return;
      delivered=true;
      const file=new File([artifact.blob],artifact.fileName||'donhang.png',{type:'image/png'});
      try{target.postMessage({type:'TAPHOA_ORDER_IMAGE_FILE',token,contactId,file},CHAT_ORIGIN);}
      catch{
        delivered=false;
        if(typeof showToast==='function')showToast('Không thể chuyển ảnh sang Chat.','info');
      }
    }
    function cancel(){
      stopped=true;
      window.removeEventListener('message',onMessage);
    }
    const session={token,cancel,setArtifact(result){
      if(!(result?.blob instanceof Blob)||!result.blob.size){
        cancel();
        return false;
      }
      artifact=result;
      maybeTransfer();
      return true;
    }};
    window.addEventListener('message',onMessage);
    liveChatShare=session;
    try{target.focus?.();}catch{}
    return session;
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

  // Single tap: use the OS share sheet for the visible order text, or the
  // browser's Copy facility on platforms without native text sharing.
  // No popup, no html2canvas, no new site, and works as installed PWA.
  function cartNativeShareText(entries){
    const meta=getOrderMeta();
    const vi=n=>(Number(n)||0).toLocaleString('vi-VN');
    const out=[
      meta.isCreatingSaleDraft?'ĐƠN ĐANG TẠO':'ĐƠN HÀNG'+(meta.orderId?' '+meta.orderId:''),
      'Khách: '+meta.customer,
      'Thời gian: '+meta.time,
      'STT | Tên | SL | Đơn giá | Thành tiền'
    ];
    let total=0,quantity=0;
    entries.forEach(([id,item],i)=>{
      const qty=Number(item?.qty)||0;
      const price=Number(item?.price)||0;
      const line=qty*price;
      quantity+=qty;total+=line;
      out.push(`${i+1}. ${String(item?.name||id)} | ${vi(qty)} | ${vi(price)} | ${vi(line)}`);
      if(String(item?.note||'').trim())out.push('   Ghi chú: '+String(item.note).trim());
    });
    out.push('Tổng SL: '+vi(quantity),'Tổng tiền: '+vi(total));
    return out.join('\n');
  }

  function detailNativeShareText(source){
    const get=(selector)=>String(source?.querySelector(selector)?.textContent||'').trim();
    const orderId=get('#detailModalOrderCode');
    const out=[
      'ĐƠN HÀNG'+(orderId?' · '+orderId:''),
      get('#detailModalKH'),
      get('#detailModalTime'),
      'STT | Tên | SL | Đơn giá | Thành tiền'
    ].filter(Boolean);
    const rows=[...source.querySelectorAll('#detailModalItems .order-detail-compact-grid')];
    for(const [i,row] of rows.entries()){
      const col=selector=>String(row.querySelector(selector)?.textContent||'').trim();
      out.push(`${col('.order-stt')||i+1}. ${col('.order-name')} | ${col('.order-qty')} | ${col('.order-price')} | ${col('.order-total')}`);
      if(col('.order-line-note'))out.push('   Ghi chú: '+col('.order-line-note'));
    }
    const sum=get('#detailModalTotal');
    if(sum)out.push('Tổng tiền: '+sum);
    return out.join('\n');
  }

  async function shareNativeOrderText(title,text){
    if(nativeShareInFlight)return;
    nativeShareInFlight=true;
    try{
      if(typeof navigator.share==='function'){
        try{
          await navigator.share({title,text});
          return;
        }catch(error){
          if(isShareCancel(error))return;
          // Share API unsupported/denied: fall back to system clipboard.
        }
      }
      let copied=false;
      try{
        if(navigator.clipboard?.writeText){
          await navigator.clipboard.writeText(text);
          copied=true;
        }else{
          const textarea=document.createElement('textarea');
          textarea.value=text;
          textarea.readOnly=true;
          textarea.style.position='fixed';
          textarea.style.opacity='0';
          document.body.appendChild(textarea);
          textarea.select();
          try{copied=document.execCommand('copy');}finally{textarea.remove();}
        }
      }catch{}
      if(copied){
        if(typeof showToast==='function')showToast('Đã sao chép đơn hàng. Có thể dán vào ứng dụng bạn chọn.','success');
      }else if(typeof showAlertPopup==='function'){
        showAlertPopup('Không thể chia sẻ','Trình duyệt không cho mở bảng Chia sẻ/Sao chép. Hãy thử lại.');
      }
    }finally{nativeShareInFlight=false;}
  }

  async function shareDetailOrderImageV3(){
    const source=document.getElementById('orderDetailContentToShare');
    if(!source){
      if(typeof showAlertPopup==='function')showAlertPopup('Chưa mở chi tiết đơn','Hãy mở một đơn đã lưu trước khi chia sẻ ảnh.');
      return;
    }
    // Same real saved-order portrait used by public-order image viewer.
    // Source is the persisted order's detail rows, not an editable cart snapshot.
    // Never create an unrelated cart demo or replace its PNG with plain text.
    const artifact=await prepareDetailShareCache();
    if(!artifact?.blob){
      if(typeof showAlertPopup==='function')showAlertPopup('Không tạo được ảnh đơn','Vui lòng mở lại đơn đã lưu rồi thử chia sẻ ảnh.');
      return;
    }
    await shareOrDownloadPng(artifact.blob,artifact.fileName,artifact.title,artifact.text);
  }

  async function shareCartOrderImageV3(){
    const entries=currentCartEntries();
    if(!entries.length){
      if(typeof showAlertPopup==='function')showAlertPopup('Giỏ hàng trống','Không có sản phẩm để chia sẻ.');
      return;
    }
    const meta=getOrderMeta();
    const title=meta.isCreatingSaleDraft?'Đơn đang tạo':'Đơn hàng';
    await shareNativeOrderText(title,cartNativeShareText(entries));
  }

  // UI-113: Expensive PNG rendering is ON-DEMAND only. Never render the
  // receipt, fetch the capture library or consume a background task on
  // load, every quantity change, or opening an order. Keeps taps responsive.
  // When share is requested, existing cache/promise logic still deduplicates.
  window.shareCartOrderImage=shareCartOrderImageV3;

  window.shareOrderImage=function(...args){
    if(isCartOpen() && currentCartEntries().length) return shareCartOrderImageV3();
    return shareDetailOrderImageV3.apply(this,args);
  };

  const cartShareBtn=document.getElementById('cartShareOrderBtn');
  if(cartShareBtn){
    cartShareBtn.onclick=shareCartOrderImageV3;
    cartShareBtn.setAttribute('data-cart-share-version','5-system-share');
  }

  const detailShareBtn=document.getElementById('orderDetailShareButton');
  if(detailShareBtn){
    detailShareBtn.removeAttribute('onclick');
    detailShareBtn.onclick=shareDetailOrderImageV3;
    detailShareBtn.setAttribute('data-order-share-version','6-saved-order-image');
  }

  document.documentElement.setAttribute('data-ios-share-context',isIosShareContext()?'1':'0');
  document.documentElement.setAttribute('data-pwa-standalone',isStandalonePwa()?'1':'0');

})();
