'use strict';

(function(){
  const originalShareOrderImage = typeof window.shareOrderImage === 'function' ? window.shareOrderImage : null;

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

  async function shareOrDownloadPng(blob,fileName,title,text){
    const file=new File([blob],fileName,{type:'image/png'});
    const canNativeShare=!!(navigator.share && navigator.canShare && navigator.canShare({files:[file]}));
    hideShareLoading();
    if(canNativeShare){
      await navigator.share({files:[file],title,text});
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
    let totalQty=0;
    let totalPrice=0;
    const rows=entries.map(([id,item],idx)=>{
      const qty=Number(item?.qty)||0;
      const price=Number(item?.price)||0;
      const lineTotal=qty*price;
      totalQty+=qty;
      totalPrice+=lineTotal;
      return `
        <div style="display:grid;grid-template-columns:28px minmax(0,1fr) 72px 42px 86px;column-gap:10px;align-items:center;min-height:38px;padding:7px 0;border-bottom:1px solid #f1f5f9;font-size:12px;">
          <div style="text-align:center;color:#9ca3af;font-weight:700;">${idx+1}</div>
          <div style="min-width:0;color:#111827;font-weight:700;line-height:1.35;overflow-wrap:anywhere;">${escapeHtml(item?.name || id)}</div>
          <div style="text-align:right;color:#374151;font-weight:600;font-variant-numeric:tabular-nums;">${price.toLocaleString('vi-VN')}</div>
          <div style="text-align:right;color:#374151;font-weight:700;font-variant-numeric:tabular-nums;">${qty}</div>
          <div style="text-align:right;color:#111827;font-weight:800;font-variant-numeric:tabular-nums;">${lineTotal.toLocaleString('vi-VN')}</div>
        </div>`;
    }).join('');

    const meta=getOrderMeta();
    const host=document.createElement('div');
    host.setAttribute('aria-hidden','true');
    host.style.position='fixed';
    host.style.left='-100000px';
    host.style.top='0';
    host.style.width='720px';
    host.style.background='#fff';
    host.style.pointerEvents='none';
    host.style.zIndex='-1';

    const capture=document.createElement('div');
    capture.style.width='720px';
    capture.style.background='#fff';
    capture.style.color='#1f2937';
    capture.style.fontFamily='\"Be Vietnam Pro\",sans-serif';
    capture.style.boxSizing='border-box';
    const metaTitle=meta.isCreatingSaleDraft
      ? 'Đơn đang tạo'
      : 'Mã đơn: ' + escapeHtml(meta.orderId || '--');
    capture.innerHTML=`
      <div style="padding:22px 28px 18px;background:#f8fafc;border-bottom:1px solid #e5e7eb;">
        <div style="font-size:12px;color:#9ca3af;font-weight:700;">${metaTitle}</div>
        <div style="margin-top:8px;font-size:18px;color:#111827;font-weight:800;">${escapeHtml(meta.customer)}</div>
        <div style="margin-top:6px;font-size:12px;color:#6b7280;">Thời gian: ${escapeHtml(meta.time)}</div>
      </div>
      <div style="padding:0 28px;">
        <div style="display:grid;grid-template-columns:28px minmax(0,1fr) 72px 42px 86px;column-gap:10px;align-items:center;height:40px;border-bottom:1px solid #e5e7eb;color:#9ca3af;font-size:10px;font-weight:800;text-transform:uppercase;">
          <div style="text-align:center;">#</div>
          <div>TÊN SP</div>
          <div style="text-align:right;">Đ.GIÁ</div>
          <div style="text-align:right;">SL</div>
          <div style="text-align:right;">T.TIỀN</div>
        </div>
        <div>${rows}</div>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:flex-end;gap:24px;padding:20px 28px 24px;border-top:1px solid #e5e7eb;background:#fff;">
        <div>
          <div style="font-size:11px;color:#9ca3af;font-weight:600;">Số lượng</div>
          <div style="margin-top:5px;font-size:16px;color:#111827;font-weight:800;">${entries.length} mã · ${totalQty} sản phẩm</div>
        </div>
        <div style="text-align:right;">
          <div style="font-size:11px;color:#9ca3af;font-weight:600;">Tổng thanh toán</div>
          <div style="margin-top:3px;font-size:24px;color:#16a34a;font-weight:800;font-variant-numeric:tabular-nums;">${totalPrice.toLocaleString('vi-VN')}</div>
        </div>
      </div>`;

    host.appendChild(capture);
    document.body.appendChild(host);
    return {host,capture,totalQty,totalPrice,meta};
  }

  function prepareDetailClone(source){
    const sourceWidth=Math.ceil(source.getBoundingClientRect().width);
    const width=Math.min(760,Math.max(360,sourceWidth));
    const clone=source.cloneNode(true);
    clone.removeAttribute('id');
    clone.style.width=width+'px';
    clone.style.height='auto';
    clone.style.maxHeight='none';
    clone.style.minHeight='0';
    clone.style.overflow='visible';
    clone.style.flex='none';

    const cloneItems=clone.querySelector('#detailModalItems');
    if(cloneItems){
      cloneItems.removeAttribute('id');
      cloneItems.style.height='auto';
      cloneItems.style.maxHeight='none';
      cloneItems.style.minHeight='0';
      cloneItems.style.overflow='visible';
      cloneItems.style.flex='none';
    }

    clone.querySelectorAll('.order-detail-compact-grid').forEach(row=>{
      row.style.minHeight='34px';
      row.style.height='auto';
      row.style.overflow='visible';
      row.style.alignItems='center';
    });

    clone.querySelectorAll('.order-name').forEach(name=>{
      name.style.overflow='visible';
      name.style.textOverflow='clip';
      name.style.whiteSpace='normal';
      name.style.lineHeight='1.35';
      name.style.paddingTop='2px';
      name.style.paddingBottom='2px';
    });

    const host=document.createElement('div');
    host.setAttribute('aria-hidden','true');
    host.style.position='fixed';
    host.style.left='-100000px';
    host.style.top='0';
    host.style.width=width+'px';
    host.style.height='auto';
    host.style.overflow='visible';
    host.style.background='#ffffff';
    host.style.pointerEvents='none';
    host.style.zIndex='-1';
    host.appendChild(clone);
    document.body.appendChild(host);
    return {host,clone,width};
  }

  async function canvasToPngBlob(target,width,height,errorMessage){
    const canvas=await html2canvas(target,{
      scale:2,
      useCORS:true,
      backgroundColor:'#ffffff',
      width,
      height,
      windowWidth:width,
      windowHeight:height,
      scrollX:0,
      scrollY:0
    });
    return new Promise((resolve,reject)=>{
      canvas.toBlob(result=>result?resolve(result):reject(new Error(errorMessage)),'image/png');
    });
  }

  async function shareDetailOrderImageV3(){
    const source=document.getElementById('orderDetailContentToShare');
    if(!source){
      if(originalShareOrderImage) return originalShareOrderImage();
      return;
    }

    let built=null;
    try{
      if(typeof showLoading==='function') showLoading('Đang tạo ảnh...');
      if(!window.html2canvas) throw new Error('Chưa tải thư viện tạo ảnh.');

      built=prepareDetailClone(source);
      await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));

      const height=Math.ceil(built.clone.scrollHeight)+4;
      const blob=await canvasToPngBlob(built.clone,built.width,height,'Không tạo được ảnh đơn hàng.');
      const rawOrderId=(typeof editingOrderId!=='undefined' && editingOrderId)
        || document.getElementById('detailModalTitle')?.textContent?.trim()
        || '';
      const safeId=String(rawOrderId).replace(/[^a-zA-Z0-9_-]+/g,'_');
      const fileName=(safeId?'donhang_'+safeId:'donhang')+'.png';
      await shareOrDownloadPng(blob,fileName,'Đơn hàng','Chi tiết đơn hàng');
    }catch(error){
      if(isShareCancel(error)) return;
      if(typeof showAlertPopup==='function') showAlertPopup('Lỗi tạo ảnh',error?.message||String(error));
    }finally{
      built?.host?.remove();
      hideShareLoading();
    }
  }

  async function shareCartOrderImageV3(){
    const entries=currentCartEntries();
    if(!entries.length){
      if(typeof showAlertPopup==='function') showAlertPopup('Giỏ hàng trống','Không có sản phẩm để chia sẻ.');
      return;
    }

    let built=null;
    try{
      if(typeof showLoading==='function') showLoading('Đang tạo ảnh...');
      if(!window.html2canvas) throw new Error('Chưa tải thư viện tạo ảnh.');

      built=buildCapture(entries);
      await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));

      const width=Math.ceil(built.capture.scrollWidth);
      const height=Math.ceil(built.capture.scrollHeight)+2;
      const blob=await canvasToPngBlob(built.capture,width,height,'Không tạo được ảnh giỏ hàng.');

      const safeId=String(built.meta.orderId||'').replace(/[^a-zA-Z0-9_-]+/g,'_');
      const fileName=(safeId ? 'donhang_'+safeId : 'don_dang_tao')+'.png';
      const shareTitle=built.meta.isCreatingSaleDraft ? 'Đơn đang tạo' : 'Đơn hàng';
      const shareText=built.meta.isCreatingSaleDraft ? 'Chi tiết đơn đang tạo' : 'Chi tiết đơn hàng';
      await shareOrDownloadPng(blob,fileName,shareTitle,shareText);
    }catch(error){
      if(isShareCancel(error)) return;
      if(typeof showAlertPopup==='function') showAlertPopup('Lỗi tạo ảnh',error?.message||String(error));
    }finally{
      built?.host?.remove();
      hideShareLoading();
    }
  }

  window.shareCartOrderImage=shareCartOrderImageV3;

  window.shareOrderImage=function(...args){
    if(isCartOpen() && currentCartEntries().length) return shareCartOrderImageV3();
    return shareDetailOrderImageV3.apply(this,args);
  };

  const cartShareBtn=document.getElementById('cartShareOrderBtn');
  if(cartShareBtn){
    cartShareBtn.onclick=shareCartOrderImageV3;
    cartShareBtn.setAttribute('data-cart-share-version','3');
  }
})();
