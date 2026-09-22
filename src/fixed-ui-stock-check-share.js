'use strict';

(function(){
  const originalDetailShare=typeof window.shareOrderImage==='function'?window.shareOrderImage:null;
  const originalCartShare=typeof window.shareCartOrderImage==='function'?window.shareCartOrderImage:null;
  let linkCache=new Map();

  function currentCustomer(){
    let id='',name='';
    try{
      if(typeof selectedCustomer!=='undefined'&&selectedCustomer){
        id=String(selectedCustomer.id||'').trim();
        name=String(selectedCustomer.name||'').trim();
      }
    }catch(_){}
    if((!id||id==='le')&&typeof editingOrderId!=='undefined'&&editingOrderId){
      try{
        const sheet=String(typeof editingOrderSheet!=='undefined'?editingOrderSheet:'');
        const rows=Array.isArray(appData?.[sheet])?appData[sheet].slice(1):[];
        const row=rows.find(r=>String(r?.[0]||'').trim()===String(editingOrderId).trim());
        if(row){
          id=String(row?.[1]||'').trim();
          const customers=Array.isArray(appData?.khachhang)?appData.khachhang.slice(1):[];
          const customer=customers.find(r=>String(r?.[0]||'').trim()===id);
          name=String(customer?.[1]||name||'').trim();
        }
      }catch(_){}
    }
    return {id:id==='le'?'':id,name:name||'Khách hàng'};
  }

  function ensureModal(){
    let wrap=document.getElementById('stockCheckShareSheet');
    if(wrap)return wrap;
    wrap=document.createElement('div');
    wrap.id='stockCheckShareSheet';
    wrap.className='fixed inset-0 z-[260] hidden items-end justify-center bg-gray-900/50 backdrop-blur-sm';
    wrap.innerHTML=`
      <section class="w-full max-w-[520px] rounded-t-[24px] bg-white shadow-2xl overflow-hidden" role="dialog" aria-modal="true" aria-label="Chia sẻ">
        <button type="button" data-close class="w-full h-7 flex items-center justify-center"><span class="w-12 h-1.5 rounded-full bg-gray-200"></span></button>
        <div class="px-5 pb-3 border-b border-gray-100 flex items-start justify-between gap-3">
          <div class="min-w-0">
            <div class="text-[17px] font-extrabold text-gray-900">Chia sẻ</div>
            <div id="stockCheckShareCustomer" class="mt-1 text-[12px] text-gray-500 truncate"></div>
          </div>
          <button type="button" data-close class="w-8 h-8 rounded-full bg-gray-50 text-gray-500 flex items-center justify-center"><i class="ph-bold ph-x"></i></button>
        </div>
        <div class="p-3 space-y-2">
          <button type="button" id="stockCheckShareImage" class="w-full min-h-[58px] px-4 rounded-2xl border border-gray-200 bg-white flex items-center gap-3 text-left">
            <span class="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0"><i class="ph-bold ph-image text-lg"></i></span>
            <span class="min-w-0"><strong class="block text-[14px] text-gray-900">Chia sẻ ảnh</strong><small class="block text-[11px] text-gray-500 mt-0.5">Ảnh đơn hàng như hiện tại</small></span>
          </button>
          <button type="button" id="stockCheckShareEmployee" class="w-full min-h-[64px] px-4 rounded-2xl border border-gray-200 bg-white flex items-center gap-3 text-left">
            <span class="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0"><i class="ph-bold ph-clipboard-text text-lg"></i></span>
            <span class="min-w-0"><strong class="block text-[14px] text-gray-900">Nhân viên kiểm hàng</strong><small class="block text-[11px] text-gray-500 mt-0.5">Chỉ sản phẩm + số lượng · không có giá/tiền</small></span>
          </button>
          <button type="button" id="stockCheckShareOwner" class="w-full min-h-[64px] px-4 rounded-2xl border border-gray-200 bg-white flex items-center gap-3 text-left">
            <span class="w-10 h-10 rounded-xl bg-violet-50 text-violet-600 flex items-center justify-center shrink-0"><i class="ph-bold ph-user-check text-lg"></i></span>
            <span class="min-w-0"><strong class="block text-[14px] text-gray-900">Chủ cửa hàng rà soát</strong><small class="block text-[11px] text-gray-500 mt-0.5">Xem số nhân viên nhập · sửa lại · cập nhật</small></span>
          </button>
        </div>
        <div class="px-5 pb-[max(18px,env(safe-area-inset-bottom))] pt-1 text-[10px] leading-relaxed text-gray-400">
          Nhân viên và chủ dùng hai link khác nhau nhưng cùng một phiếu kiểm hàng.
        </div>
      </section>`;
    document.body.appendChild(wrap);
    wrap.addEventListener('click',event=>{
      if(event.target===wrap||event.target.closest('[data-close]'))closeSheet();
    });
    return wrap;
  }

  function closeSheet(){
    const wrap=document.getElementById('stockCheckShareSheet');
    if(!wrap)return;
    wrap.classList.add('hidden');
    wrap.classList.remove('flex');
  }

  function activeIsCart(){
    const wrap=document.getElementById('cartModalWrapper');
    return !!wrap&&!wrap.classList.contains('hidden')&&!wrap.classList.contains('pointer-events-none')&&!wrap.classList.contains('opacity-0');
  }

  async function getLinks(customerId){
    if(linkCache.has(customerId))return linkCache.get(customerId);
    const api=window.TAPHOA_PRODUCTION;
    if(!api?.stockCheckLinks)throw new Error('Chưa tải chức năng kiểm hàng.');
    const value=await api.stockCheckLinks(customerId);
    if(!value?.employee_url||!value?.owner_url)throw new Error('Không tạo được link kiểm hàng.');
    linkCache.set(customerId,value);
    return value;
  }

  async function shareLink(role){
    const customer=currentCustomer();
    if(!customer.id){
      if(typeof showAlertPopup==='function')showAlertPopup('Chưa chọn khách','Chọn khách hàng trước khi tạo link kiểm hàng.');
      return;
    }
    const button=document.getElementById(role==='employee'?'stockCheckShareEmployee':'stockCheckShareOwner');
    const old=button?.innerHTML;
    if(button){button.disabled=true;button.style.opacity='.65';}
    try{
      const links=await getLinks(customer.id);
      const url=role==='employee'?links.employee_url:links.owner_url;
      closeSheet();
      if(navigator.share){
        try{await navigator.share({url});return;}catch(error){
          if(/abort|cancel/i.test(String(error?.name||'')+' '+String(error?.message||'')))return;
        }
      }
      await navigator.clipboard.writeText(url);
      if(typeof showToast==='function')showToast('Đã sao chép link kiểm hàng.','success');
    }catch(error){
      if(typeof showAlertPopup==='function')showAlertPopup('Không tạo được link',error?.message||String(error));
    }finally{
      if(button){button.disabled=false;button.style.opacity='';if(old)button.innerHTML=old;}
    }
  }

  function openSheet(){
    const customer=currentCustomer();
    const wrap=ensureModal();
    const label=wrap.querySelector('#stockCheckShareCustomer');
    if(label)label.textContent=customer.id?customer.name:'Chưa chọn khách hàng';
    const employee=wrap.querySelector('#stockCheckShareEmployee');
    const owner=wrap.querySelector('#stockCheckShareOwner');
    for(const el of [employee,owner]){
      if(!el)continue;
      el.disabled=!customer.id;
      el.style.opacity=customer.id?'':'0.45';
    }
    const image=wrap.querySelector('#stockCheckShareImage');
    if(image)image.onclick=async()=>{
      closeSheet();
      if(activeIsCart()&&originalCartShare)return originalCartShare();
      if(originalDetailShare)return originalDetailShare();
    };
    if(employee)employee.onclick=()=>shareLink('employee');
    if(owner)owner.onclick=()=>shareLink('owner');
    wrap.classList.remove('hidden');
    wrap.classList.add('flex');
  }

  function bind(){
    const detail=document.getElementById('orderDetailShareButton');
    if(detail){detail.onclick=openSheet;detail.setAttribute('data-share-sheet','stock-check');}
    const cart=document.getElementById('cartShareOrderBtn');
    if(cart){cart.onclick=openSheet;cart.setAttribute('data-share-sheet','stock-check');}
  }

  window.openTaphoaShareSheet=openSheet;
  window.closeTaphoaShareSheet=closeSheet;
  setTimeout(bind,0);
  document.addEventListener('click',event=>{
    const target=event.target instanceof Element?event.target.closest('#orderDetailShareButton,#cartShareOrderBtn'):null;
    if(!target)return;
    event.preventDefault();
    event.stopImmediatePropagation();
    openSheet();
  },true);
})();