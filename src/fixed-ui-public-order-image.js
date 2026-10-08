'use strict';

(function(){
  const PUBLIC_ORDER_PAGE_SIZE=16;
  const PUBLIC_ORDER_IMAGE_WIDTH=720;
  const artifactCache=new Map();
  const inFlight=new Map();
  let activeSignature='';
  let currentMode='image';
  let activeOrderRequest=null;

  function preferReadableTable(){
    const panel=document.getElementById('orderDetailBottomSheet');
    const panelWidth=panel?.getBoundingClientRect().width || window.innerWidth;
    return panelWidth<600;
  }

  function isZaloInAppBrowser(){
    return /Zalo/i.test(String(navigator.userAgent||''));
  }

  function isPublicOrderDeepLink(orderId){
    const params=new URLSearchParams(window.location.search);
    const publicCustomer=String(params.get('kh')||'').trim();
    const deepLinkedOrder=String(params.get('don')||'').trim();
    const requestedOrder=String(orderId||'').trim();
    return !!publicCustomer && !!deepLinkedOrder && requestedOrder===deepLinkedOrder;
  }

  function escapeHtml(value){
    return String(value??'')
      .replace(/&/g,'&amp;')
      .replace(/</g,'&lt;')
      .replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;')
      .replace(/'/g,'&#39;');
  }

  function stableHash(value){
    const input=String(value||'');
    let hash=2166136261;
    for(let i=0;i<input.length;i++){
      hash^=input.charCodeAt(i);
      hash=Math.imul(hash,16777619);
    }
    return (hash>>>0).toString(36);
  }

  function currentAppData(){
    return typeof appData!=='undefined' && appData ? appData : {};
  }

  function collectOrder(orderId,sheetName){
    const dataStore=currentAppData();
    const sheet=Array.isArray(dataStore?.[sheetName])?dataStore[sheetName]:[];
    const rows=sheet.slice(1).filter(row=>String(row?.[0]??'').trim()===String(orderId||'').trim());
    if(!rows.length)return null;

    const products=new Map(
      (Array.isArray(dataStore?.sanpham)?dataStore.sanpham.slice(1):[])
        .map(row=>[String(row?.[0]??''),String(row?.[1]??row?.[0]??'')])
    );
    const customers=new Map(
      (Array.isArray(dataStore?.khachhang)?dataStore.khachhang.slice(1):[])
        .map(row=>[String(row?.[0]??''),String(row?.[1]??row?.[0]??'')])
    );

    let total=0;
    let totalQty=0;
    const items=rows.map((row,index)=>{
      const productId=String(row?.[2]??'');
      const qty=Number(row?.[3])||0;
      const price=Number(row?.[4])||0;
      const lineTotal=Number(row?.[5])||qty*price;
      total+=lineTotal;
      totalQty+=qty;
      return {
        index:index+1,
        productId,
        name:products.get(productId)||productId,
        qty,
        price,
        lineTotal,
        note:String(row?.[9]??'').trim()
      };
    });

    const customerId=String(rows[0]?.[1]??'');
    const time=String(rows[0]?.[6]??'');
    const data={
      orderId:String(orderId||''),
      sheetName:String(sheetName||''),
      customerId,
      customer:customers.get(customerId)||customerId||'Khách hàng',
      time,
      items,
      total,
      totalQty
    };
    data.signature=stableHash(JSON.stringify(data));
    return data;
  }

  function ensureViewer(){
    const source=document.getElementById('orderDetailContentToShare');
    const bottomSheet=document.getElementById('orderDetailBottomSheet');
    if(!source||!bottomSheet)return null;

    let viewer=document.getElementById('publicOrderImageViewer');
    if(!viewer){
      viewer=document.createElement('div');
      viewer.id='publicOrderImageViewer';
      viewer.className='hidden flex-1 min-h-0 overflow-y-auto bg-gray-100 px-3 pt-3 no-scrollbar';
      viewer.style.webkitTextSizeAdjust='100%';
      viewer.style.textSizeAdjust='100%';
      viewer.style.overscrollBehavior='contain';
      bottomSheet.insertBefore(viewer,source);
    }
    viewer.style.paddingBottom=isZaloInAppBrowser()
      ? 'calc(72px + env(safe-area-inset-bottom))'
      : '16px';
    return {viewer,source};
  }

  function ensureToggleButton(){
    const share=document.getElementById('orderDetailShareButton');
    const owner=share?.parentElement;
    if(!owner)return null;
    let button=document.getElementById('publicOrderViewToggleButton');
    if(!button){
      button=document.createElement('button');
      button.id='publicOrderViewToggleButton';
      button.type='button';
      button.className='hidden h-8 px-2.5 rounded-full bg-gray-100 text-gray-600 text-[11px] font-bold items-center justify-center gap-1 allow-fast-click';
      button.onclick=()=>{
        if(currentMode==='image'){
          setViewMode('table');
          return;
        }
        const request=activeOrderRequest;
        if(request)void renderPublicOrderImageView(request.orderId,request.sheetName,{forceImage:true});
      };
      owner.insertBefore(button,share);
    }
    return button;
  }

  function syncToggleButton(){
    const button=ensureToggleButton();
    if(!button)return;
    button.classList.remove('hidden');
    button.classList.add('inline-flex');
    if(currentMode==='image'){
      button.innerHTML='<i class="ph-bold ph-table"></i><span>Bảng</span>';
      button.setAttribute('aria-label','Xem dạng bảng');
      button.title='Xem dạng bảng';
    }else{
      button.innerHTML='<i class="ph-bold ph-image"></i><span>Ảnh</span>';
      button.setAttribute('aria-label','Xem ảnh');
      button.title='Xem ảnh';
    }
  }

  function setViewMode(mode){
    const ui=ensureViewer();
    if(!ui)return;
    currentMode=mode==='table'?'table':'image';
    if(currentMode==='image'){
      ui.source.classList.add('hidden');
      ui.viewer.classList.remove('hidden');
    }else{
      ui.viewer.classList.add('hidden');
      ui.source.classList.remove('hidden');
    }
    syncToggleButton();
  }

  function disablePublicOrderImageView(){
    activeSignature='';
    activeOrderRequest=null;
    currentMode='table';
    const viewer=document.getElementById('publicOrderImageViewer');
    const source=document.getElementById('orderDetailContentToShare');
    const button=document.getElementById('publicOrderViewToggleButton');
    viewer?.classList.add('hidden');
    source?.classList.remove('hidden');
    if(button){
      button.classList.add('hidden');
      button.classList.remove('inline-flex');
    }
  }

  function fallbackToTable(message){
    setViewMode('table');
    if(message && typeof window.showToast==='function')window.showToast(message,'info');
  }

  function loadingMarkup(){
    return '<div class="min-h-[240px] flex flex-col items-center justify-center gap-3 text-gray-400">'
      +'<div class="w-8 h-8 rounded-full border-2 border-gray-200 border-t-primary animate-spin"></div>'
      +'<div class="text-[12px] font-semibold">Đang tạo bản xem đơn hàng…</div>'
      +'</div>';
  }

  function buildPageDom(data,pageItems,pageIndex,pageCount){
    const host=document.createElement('div');
    host.setAttribute('aria-hidden','true');
    host.style.position='fixed';
    host.style.left='-100000px';
    host.style.top='0';
    host.style.width=PUBLIC_ORDER_IMAGE_WIDTH+'px';
    host.style.background='#ffffff';
    host.style.pointerEvents='none';
    host.style.zIndex='-1';
    host.style.webkitTextSizeAdjust='100%';
    host.style.textSizeAdjust='100%';

    const page=document.createElement('div');
    page.style.width=PUBLIC_ORDER_IMAGE_WIDTH+'px';
    page.style.boxSizing='border-box';
    page.style.background='#ffffff';
    page.style.color='#1f2937';
    page.style.fontFamily='Arial, "Helvetica Neue", sans-serif';
    page.style.webkitTextSizeAdjust='100%';
    page.style.textSizeAdjust='100%';

    // UI-108: choose the printed amount caption by the largest amount on the
    // whole order, so every shared page uses the SAME heading and numeric axis.
    const probe=document.createElement('canvas').getContext('2d');
    const width=(value,font)=>{if(!probe)return String(value).length*8;
      probe.font=font;return probe.measureText(String(value)).width;};
    const widestAmount=Math.max(0,...data.items.map(item=>
      width(item.lineTotal.toLocaleString('vi-VN'),'800 13px Arial')));
    const totalCaption=['Thành tiền','T.tiền','Tiền','TT'].find(label=>
      width(label.toLocaleUpperCase('vi-VN'),'800 11px Arial')<=widestAmount)||'TT';

    const rowsHtml=pageItems.map(item=>`
      <div style="display:grid;grid-template-columns:34px minmax(0,1fr) 92px 50px 108px;column-gap:10px;align-items:center;min-height:46px;padding:8px 0;border-bottom:1px solid #edf2f7;font-size:13px;box-sizing:border-box;">
        <div style="text-align:center;color:#94a3b8;font-weight:700;">${item.index}</div>
        <div style="min-width:0;line-height:1.35;overflow-wrap:anywhere;">
          <div style="color:#111827;font-weight:700;">${escapeHtml(item.name)}</div>
          ${item.note?'<div style="margin-top:3px;color:#94a3b8;font-size:11px;font-weight:500;">'+escapeHtml(item.note)+'</div>':''}
        </div>
        <div style="text-align:right;color:#374151;font-weight:600;font-variant-numeric:tabular-nums;">${item.price.toLocaleString('vi-VN')}</div>
        <div style="text-align:center;color:#374151;font-weight:700;font-variant-numeric:tabular-nums;">${item.qty}</div>
        <div style="text-align:right;color:#111827;font-weight:800;font-variant-numeric:tabular-nums;">${item.lineTotal.toLocaleString('vi-VN')}</div>
      </div>`).join('');

    const footer=pageIndex===pageCount-1 ? `
      <div style="display:flex;justify-content:space-between;align-items:flex-end;gap:24px;padding:20px 28px 26px;border-top:1px solid #e5e7eb;background:#fff;">
        <div>
          <div style="font-size:12px;color:#94a3b8;font-weight:600;">Số lượng</div>
          <div style="margin-top:5px;font-size:17px;color:#111827;font-weight:800;">${data.items.length} mã · ${data.totalQty} sản phẩm</div>
        </div>
        <div style="text-align:right;">
          <div style="font-size:12px;color:#94a3b8;font-weight:600;">Tổng thanh toán</div>
          <div style="margin-top:4px;font-size:27px;color:#16a34a;font-weight:800;font-variant-numeric:tabular-nums;">${data.total.toLocaleString('vi-VN')}</div>
        </div>
      </div>` : `
      <div style="padding:14px 28px 18px;text-align:right;color:#94a3b8;font-size:11px;font-weight:700;">Còn tiếp…</div>`;

    page.innerHTML=`
      <div style="padding:22px 28px 18px;background:#f8fafc;border-bottom:1px solid #e5e7eb;">
        <div style="display:flex;justify-content:space-between;gap:20px;align-items:flex-start;">
          <div>
            <div style="font-size:12px;color:#94a3b8;font-weight:700;">Mã đơn: ${escapeHtml(data.orderId)}</div>
            <div style="margin-top:7px;font-size:20px;color:#111827;font-weight:800;">${escapeHtml(data.customer)}</div>
            <div style="margin-top:6px;font-size:12px;color:#64748b;">Thời gian: ${escapeHtml(data.time||'--')}</div>
          </div>
          <div style="font-size:11px;color:#94a3b8;font-weight:700;white-space:nowrap;">Trang ${pageIndex+1}/${pageCount}</div>
        </div>
      </div>
      <div style="padding:0 28px;">
        <div style="display:grid;grid-template-columns:34px minmax(0,1fr) 92px 50px 108px;column-gap:10px;align-items:center;height:42px;border-bottom:1px solid #e5e7eb;color:#94a3b8;font-size:11px;font-weight:800;text-transform:uppercase;">
          <div style="text-align:center;">STT</div>
          <div>Tên</div>
          <div style="text-align:right;">Đơn giá</div>
          <div style="text-align:center;">SL</div>
          <div style="text-align:right;" title="Thành tiền">${totalCaption}</div>
        </div>
        <div>${rowsHtml}</div>
      </div>
      ${footer}`;

    host.appendChild(page);
    document.body.appendChild(host);
    return {host,page};
  }

  function trimCache(){
    while(artifactCache.size>6){
      const firstKey=artifactCache.keys().next().value;
      const artifact=artifactCache.get(firstKey);
      artifactCache.delete(firstKey);
      for(const url of artifact?.urls||[])URL.revokeObjectURL(url);
    }
  }

  async function createArtifact(data){
    const capture=window.TAPHOA_SHARE_CAPTURE;
    if(!capture)throw new Error('image_capture_unavailable');
    const pageCount=Math.max(1,Math.ceil(data.items.length/PUBLIC_ORDER_PAGE_SIZE));
    const urls=[];
    try{
      for(let pageIndex=0;pageIndex<pageCount;pageIndex++){
        const pageItems=data.items.slice(
          pageIndex*PUBLIC_ORDER_PAGE_SIZE,
          (pageIndex+1)*PUBLIC_ORDER_PAGE_SIZE
        );
        const built=buildPageDom(data,pageItems,pageIndex,pageCount);
        try{
          await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
          const height=Math.ceil(built.page.scrollHeight)+2;
          const canvas=await capture.captureElement(built.page,{
            width:PUBLIC_ORDER_IMAGE_WIDTH,
            height,
            scale:1.25,
            renderTimeout:12000,
            libraryTimeout:5500
          });
          const blob=await capture.canvasToPngBlob(canvas,'Không tạo được ảnh đơn hàng.');
          urls.push(URL.createObjectURL(blob));
        }finally{
          built.host.remove();
        }
      }
      return {signature:data.signature,urls};
    }catch(error){
      for(const url of urls)URL.revokeObjectURL(url);
      throw error;
    }
  }

  function showArtifact(artifact){
    const ui=ensureViewer();
    if(!ui)return;
    ui.viewer.innerHTML=artifact.urls.map((url,index)=>`
      <div class="mx-auto mb-3 max-w-[720px] overflow-hidden rounded-xl bg-white shadow-sm border border-gray-200">
        <img src="${url}" alt="Đơn hàng trang ${index+1}" draggable="false" style="display:block;width:100%;height:auto;max-width:720px;-webkit-user-select:none;user-select:none;" />
      </div>`).join('');
    setViewMode('image');
  }

  async function renderPublicOrderImageView(orderId,sheetName,options={}){
    if(!isPublicOrderDeepLink(orderId)){
      disablePublicOrderImageView();
      return;
    }

    const data=collectOrder(orderId,sheetName);
    if(!data){
      fallbackToTable('Không tạo được bản xem ảnh của đơn.');
      return;
    }

    activeSignature=data.signature;
    activeOrderRequest={orderId,sheetName};
    const ui=ensureViewer();
    if(!ui)return;
    // A 720px image rendered into a 360–420px panel reduces all text to
    // around half size. Show the live readable HTML table on narrow panels;
    // generate the unchanged share-quality image only if the user requests it.
    if(!options.forceImage && preferReadableTable()){
      setViewMode('table');
      return;
    }
    ui.viewer.innerHTML=loadingMarkup();
    setViewMode('image');

    const cached=artifactCache.get(data.signature);
    if(cached){
      showArtifact(cached);
      return;
    }

    let promise=inFlight.get(data.signature);
    if(!promise){
      promise=createArtifact(data)
        .then(artifact=>{
          artifactCache.set(data.signature,artifact);
          trimCache();
          return artifact;
        })
        .finally(()=>inFlight.delete(data.signature));
      inFlight.set(data.signature,promise);
    }

    try{
      const artifact=await promise;
      if(activeSignature!==data.signature)return;
      showArtifact(artifact);
    }catch(error){
      console.warn('public order image viewer',error);
      if(activeSignature===data.signature){
        fallbackToTable('Không tạo được ảnh, đã chuyển sang dạng bảng.');
      }
    }
  }

  // UI-104: share one numeric ruler across the REAL detail header and rows.
  // Measure actual font metrics in the existing DOM only; no data requests.
  function syncOrderDetailNumericRuler(){
    const source=document.getElementById('orderDetailContentToShare');
    const header=source?.querySelector('.order-column-header');
    const rows=Array.from(source?.querySelectorAll('#detailModalItems .order-detail-compact-grid')||[]);
    if(!source||!header||!rows.length)return;
    const panel=document.getElementById('orderDetailBottomSheet');
    const panelWidth=panel?.getBoundingClientRect().width||window.innerWidth;
    source.classList.toggle('order-readable-compact',panelWidth<600);
    const canvas=document.createElement('canvas');
    const context=canvas.getContext('2d');
    const textWidth=(node)=>{
      if(!node)return 0;
      const style=getComputedStyle(node);
      let content=(node.textContent||'').trim();
      // The caption uses uppercase + tracking-wider. Measuring its untransformed
      // source text underestimates its rendered width and can collide with SL.
      if(style.textTransform==='uppercase')content=content.toLocaleUpperCase('vi-VN');
      else if(style.textTransform==='lowercase')content=content.toLocaleLowerCase('vi-VN');
      if(!context)return content.length*8;
      context.font=[style.fontStyle,style.fontWeight,style.fontSize,style.fontFamily].filter(Boolean).join(' ');
      const tracking=Number.parseFloat(style.letterSpacing);
      const extra=Number.isFinite(tracking)?Math.max(0,content.length-1)*tracking:0;
      return context.measureText(content).width+extra;
    };
    const trackWidth=(selector,min)=>{
      const nodes=[header.querySelector(selector),...rows.map(row=>row.querySelector(selector))];
      return Math.max(min,Math.ceil(Math.max(0,...nodes.map(textWidth))+9));
    };
    source.style.setProperty('--order-stt-track',trackWidth('.order-stt',24)+'px');
    source.style.setProperty('--order-price-track',trackWidth('.order-price',56)+'px');
    source.style.setProperty('--order-qty-track',trackWidth('.order-qty',27)+'px');
    // UI-108: reserve width for the widest REAL amount; choose a caption
    // within that width instead of allowing "THÀNH TIỀN" to push SL aside.
    const totalHeader=header.querySelector('.order-total');
    const moneyCells=rows.map(row=>row.querySelector('.order-total')).filter(Boolean);
    const widestMoney=Math.max(0,...moneyCells.map(textWidth));
    const totalLabels=['Thành tiền','T.tiền','Tiền','TT'];
    const selected=totalLabels.find(label=>{
      if(!totalHeader)return false;
      const saved=totalHeader.textContent;
      totalHeader.textContent=label;
      const width=textWidth(totalHeader);
      totalHeader.textContent=saved;
      return width<=widestMoney;
    })||'TT';
    if(totalHeader){
      totalHeader.textContent=selected;
      totalHeader.title='Thành tiền';
      totalHeader.setAttribute('aria-label','Thành tiền');
    }
    source.style.setProperty('--order-total-track',
      Math.ceil(Math.max(widestMoney,textWidth(totalHeader))+9)+'px');
  }

  const originalShowOrderDetailMobile=typeof window.showOrderDetailMobile==='function'
    ? window.showOrderDetailMobile
    : null;

  window.showOrderDetailMobile=function(orderId,sheetName){
    const result=originalShowOrderDetailMobile?.apply(this,arguments);
    syncOrderDetailNumericRuler();
    if(isPublicOrderDeepLink(orderId)){
      setTimeout(()=>void renderPublicOrderImageView(orderId,sheetName),0);
    }else{
      disablePublicOrderImageView();
    }
    return result;
  };

  window.renderPublicOrderImageView=renderPublicOrderImageView;
  window.setPublicOrderViewMode=setViewMode;
  window.isPublicOrderDeepLink=isPublicOrderDeepLink;

  window.addEventListener('pagehide',()=>{
    for(const artifact of artifactCache.values()){
      for(const url of artifact?.urls||[])URL.revokeObjectURL(url);
    }
    artifactCache.clear();
  },{once:true});
})();
