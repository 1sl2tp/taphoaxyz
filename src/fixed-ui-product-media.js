/* TAPHOA product image settings + supermarket image picker. */
(function(){
  'use strict';

  let activeProductCode='';
  let activeProductName='';
  let candidateTimer=null;

  const prod=()=>window.TAPHOA_PRODUCTION;
  const esc=value=>String(value??'')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  const norm=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').replace(/Đ/g,'D').toLowerCase().trim();
  const productCode=p=>String(p?.id||p?.maSP||p?.product_code||'').trim();
  const productName=p=>String(p?.ten||p?.product_name||p?.name||'').trim();
  const productImage=p=>String(p?.imageUrl||p?.image_url||p?.image||'').trim();

  function isEnabled(){
    return (localStorage.getItem('APP_PRODUCT_VIEW')||'default')==='image';
  }

  function syncToggle(){
    const toggle=document.getElementById('productImageToggle');
    const knob=document.getElementById('productImageToggleKnob');
    const enabled=isEnabled();
    if(toggle){
      toggle.classList.toggle('is-on',enabled);
      toggle.setAttribute('aria-pressed',enabled?'true':'false');
    }
    if(knob)knob.style.transform=enabled?'translateX(20px)':'translateX(0)';
  }

  window.toggleProductImages=function(){
    const next=isEnabled()?'default':'image';
    if(typeof window.setProductViewMode==='function')window.setProductViewMode(next);
    else localStorage.setItem('APP_PRODUCT_VIEW',next);
    syncToggle();
    if(typeof window.renderProductList==='function')window.renderProductList();
  };

  function installSettings(){
    if(document.getElementById('productImageSettingsRow')){syncToggle();return;}
    const list=document.querySelector('#tab-cai-dat .settings-list');
    if(!list)return;
    const row=document.createElement('div');
    row.id='productImageSettingsRow';
    row.className='settings-row px-4 py-3.5';
    row.innerHTML=`
      <div class="flex items-center justify-between gap-4">
        <div class="flex items-center gap-3 min-w-0">
          <span class="settings-icon"><i class="ph-bold ph-image"></i></span>
          <span class="min-w-0">
            <span class="block text-[13px] font-bold text-gray-900">Ảnh sản phẩm</span>
            <span class="block text-[10px] text-gray-400 mt-0.5">Hiển thị ảnh trong danh sách bán hàng</span>
          </span>
        </div>
        <button aria-label="Bật hoặc tắt ảnh sản phẩm" aria-pressed="false" class="settings-toggle shrink-0" data-testid="product-image-toggle" id="productImageToggle" onclick="toggleProductImages()" type="button">
          <span class="settings-toggle-knob" id="productImageToggleKnob"></span>
        </button>
      </div>
      <button class="allow-fast-click mt-3 w-full h-10 rounded-xl border border-gray-200 bg-gray-50 px-3 text-[12px] font-bold text-gray-700 flex items-center justify-between hover:border-primary/40 transition" data-testid="product-image-manager" onclick="openProductImageManager()" type="button">
        <span class="flex items-center gap-2"><i class="ph-bold ph-images"></i> Chọn ảnh từ siêu thị</span>
        <i class="ph ph-caret-right text-gray-400"></i>
      </button>
    `;
    const sharp=document.getElementById('sharpUiToggle')?.closest('.settings-row');
    if(sharp)list.insertBefore(row,sharp); else list.appendChild(row);
    syncToggle();
  }

  function ensureModal(){
    let wrapper=document.getElementById('productImageManagerWrapper');
    if(wrapper)return wrapper;
    wrapper=document.createElement('div');
    wrapper.id='productImageManagerWrapper';
    wrapper.className='absolute inset-0 z-[190] hidden items-center justify-center bg-gray-900/45 backdrop-blur-sm p-3';
    wrapper.innerHTML=`
      <section class="product-image-manager bg-white w-full max-w-[820px] h-[88vh] max-h-[760px] rounded-[24px] shadow-2xl overflow-hidden flex flex-col" role="dialog" aria-modal="true" aria-labelledby="productImageManagerTitle">
        <header class="px-4 py-3.5 border-b border-gray-100 flex items-center justify-between gap-3 shrink-0">
          <div class="min-w-0">
            <h2 class="text-[16px] font-extrabold text-gray-900" id="productImageManagerTitle">Ảnh sản phẩm</h2>
            <p class="text-[10px] text-gray-400 mt-0.5">Chọn link ảnh từ dữ liệu siêu thị · không thay đổi Sheet giá</p>
          </div>
          <button aria-label="Đóng chọn ảnh" class="allow-fast-click w-9 h-9 rounded-full bg-gray-50 flex items-center justify-center text-gray-500" data-testid="product-image-manager-close" type="button"><i class="ph-bold ph-x"></i></button>
        </header>
        <div class="product-image-manager-body flex-1 min-h-0 grid">
          <aside class="product-image-products min-h-0 flex flex-col border-r border-gray-100">
            <div class="p-3 border-b border-gray-100 shrink-0">
              <div class="relative">
                <i class="ph ph-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"></i>
                <input aria-label="Tìm sản phẩm của cửa hàng" class="w-full h-10 rounded-xl border border-gray-200 bg-gray-50 pl-9 pr-3 text-[12px] focus:outline-none focus:border-primary" data-testid="product-image-product-search" id="productImageProductSearch" placeholder="Tìm sản phẩm..." type="search">
              </div>
            </div>
            <div class="flex-1 overflow-y-auto p-2 space-y-1.5" id="productImageProductList"></div>
          </aside>
          <main class="product-image-candidates min-h-0 flex flex-col">
            <div class="p-3 border-b border-gray-100 shrink-0">
              <div class="flex items-center justify-between gap-2 mb-2">
                <div class="min-w-0">
                  <div class="text-[11px] text-gray-400">Đang chọn cho</div>
                  <div class="text-[13px] font-bold text-gray-900 truncate" id="productImageSelectedName">Chọn một sản phẩm</div>
                  <div class="hidden mt-1.5 space-y-1" id="productImageOwnPriceSummary"></div>
                </div>
                <button class="hidden h-8 px-3 rounded-lg border border-red-100 text-danger text-[11px] font-bold" id="productImageClearButton" type="button">Bỏ ảnh</button>
              </div>
              <div class="relative">
                <i class="ph ph-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"></i>
                <input aria-label="Tìm ảnh trong nguồn siêu thị" class="w-full h-10 rounded-xl border border-gray-200 bg-gray-50 pl-9 pr-3 text-[12px] focus:outline-none focus:border-primary disabled:opacity-50" disabled id="productImageCandidateSearch" placeholder="Tìm tên trong nguồn siêu thị..." type="search">
              </div>
            </div>
            <div class="flex-1 overflow-y-auto p-3" id="productImageCandidateList">
              <div class="h-full flex items-center justify-center text-center text-gray-400 text-[12px] px-6">Chọn sản phẩm bên trái để tìm ảnh phù hợp.</div>
            </div>
          </main>
        </div>
      </section>
    `;
    document.getElementById('appContainer')?.appendChild(wrapper);
    wrapper.querySelector('[data-testid="product-image-manager-close"]')?.addEventListener('click',closeProductImageManager);
    wrapper.addEventListener('click',event=>{if(event.target===wrapper)closeProductImageManager();});
    wrapper.querySelector('#productImageProductSearch')?.addEventListener('input',event=>renderProducts(event.target.value));
    wrapper.querySelector('#productImageProductList')?.addEventListener('click',event=>{
      const button=event.target.closest('[data-product-code]');
      if(button)selectProduct(button.dataset.productCode||'');
    });
    wrapper.querySelector('#productImageCandidateList')?.addEventListener('click',event=>{
      const button=event.target.closest('[data-candidate-id]');
      if(button)chooseCandidate(button.dataset.candidateId||'');
    });
    wrapper.querySelector('#productImageCandidateSearch')?.addEventListener('input',event=>{
      clearTimeout(candidateTimer);
      candidateTimer=setTimeout(()=>loadCandidates(event.target.value),220);
    });
    wrapper.querySelector('#productImageClearButton')?.addEventListener('click',clearSelectedImage);
    return wrapper;
  }

  function stateProducts(){
    return Array.isArray(prod()?.getState?.()?.products)?prod().getState().products:[];
  }

  function renderProducts(query=''){
    const list=document.getElementById('productImageProductList');
    if(!list)return;
    const q=norm(query);
    const rows=stateProducts().filter(p=>{
      if(!q)return true;
      return norm(productCode(p)).includes(q)||norm(productName(p)).includes(q);
    }).slice(0,250);
    if(!rows.length){
      list.innerHTML='<div class="py-8 text-center text-gray-400 text-[12px]">Không tìm thấy sản phẩm.</div>';
      return;
    }
    list.innerHTML=rows.map(p=>{
      const code=productCode(p),name=productName(p),image=productImage(p);
      const selected=code===activeProductCode;
      return `<button type="button" data-product-code="${esc(code)}" class="w-full min-h-[54px] rounded-xl border px-2.5 py-2 flex items-center gap-2 text-left transition ${selected?'border-primary bg-primaryLight':'border-gray-100 bg-white hover:bg-gray-50'}">
        <span class="w-10 h-10 rounded-lg border border-gray-100 bg-gray-50 shrink-0 flex items-center justify-center overflow-hidden">
          ${image?`<img src="${esc(image)}" alt="" class="w-full h-full object-contain" loading="lazy" decoding="async">`:'<i class="ph ph-image text-gray-300 text-lg"></i>'}
        </span>
        <span class="min-w-0 flex-1">
          <span class="block text-[12px] font-bold text-gray-900 truncate">${esc(name)}</span>
          <span class="block text-[10px] text-gray-400 truncate">${esc(code)}</span>
        </span>
        ${image?'<i class="ph-fill ph-check-circle text-primary shrink-0"></i>':''}
      </button>`;
    }).join('');
  }

  function ownPriceValue(value,isVnd=false){
    const amount=Number(value)||0;
    if(amount<=0)return 0;
    return isVnd?amount:amount*1000;
  }

  function ownProductPriceSummary(product){
    const saleVnd=ownPriceValue(product?.sale_price_vnd,true)||ownPriceValue(product?.gia??product?.price??product?.unit_price);
    const qc=Number(product?.quyCach??product?.quyDoiThung??product?.units_per_carton)||0;
    let retailVnd=ownPriceValue(product?.retail_price_vnd,true)||ownPriceValue(product?.giaLe??product?.retail_price);
    if(retailVnd<=0&&saleVnd>0&&qc>1)retailVnd=saleVnd/qc;
    const saleLabel=qc>1?'Thùng':'Bán';
    const parts=[];
    if(saleVnd>0)parts.push(`<span class="inline-flex items-center gap-1 rounded-lg bg-primaryLight px-2 py-1 text-[10px] font-extrabold text-primary"><span class="font-semibold opacity-70">${saleLabel}</span><span>${formatCandidatePrice(saleVnd)}</span></span>`);
    if(qc>1)parts.push(`<span class="inline-flex rounded-lg bg-gray-100 px-2 py-1 text-[10px] font-bold text-gray-600">QC ${qc.toLocaleString('vi-VN',{maximumFractionDigits:2})}</span>`);
    if(retailVnd>0)parts.push(`<span class="inline-flex items-center gap-1 rounded-lg bg-gray-100 px-2 py-1 text-[10px] font-extrabold text-gray-700"><span class="font-semibold text-gray-400">Lẻ</span><span>${formatCandidatePrice(retailVnd)}</span></span>`);
    return parts.length?`<div class="flex flex-wrap items-center gap-1.5"><span class="w-7 shrink-0 text-[9px] font-bold uppercase tracking-wide text-gray-400">Mình</span>${parts.join('')}</div>`:'';
  }

  function marketProductPriceSummary(product){
    const source=String(product?.marketSource||'').trim();
    const name=String(product?.marketName||'').trim();
    const kind=String(product?.marketPackKind||'').trim().toLowerCase();
    const qc=Number(product?.marketPackQuantity)||0;
    const carton=Number(product?.marketCartonPriceVnd)||0;
    const retail=Number(product?.marketRetailPriceVnd)||0;
    const parts=[];
    if(kind==='carton'&&carton>0)parts.push(`<span class="inline-flex items-center gap-1 rounded-lg bg-amber-50 px-2 py-1 text-[10px] font-extrabold text-amber-700"><span class="font-semibold opacity-70">Thùng</span><span>${formatCandidatePrice(carton)}</span></span>`);
    if(kind==='carton'&&qc>1)parts.push(`<span class="inline-flex rounded-lg bg-gray-100 px-2 py-1 text-[10px] font-bold text-gray-600">QC ${qc.toLocaleString('vi-VN',{maximumFractionDigits:2})}</span>`);
    if(retail>0)parts.push(`<span class="inline-flex items-center gap-1 rounded-lg bg-gray-100 px-2 py-1 text-[10px] font-extrabold text-gray-700"><span class="font-semibold text-gray-400">Lẻ</span><span>${formatCandidatePrice(retail)}</span></span>`);
    if(!parts.length)return '';
    return `<div class="flex flex-wrap items-center gap-1.5" title="${esc(name)}"><span class="w-7 shrink-0 text-[9px] font-bold uppercase tracking-wide text-gray-400">Họ</span>${source?`<span class="inline-flex rounded-lg bg-gray-900 px-2 py-1 text-[9px] font-bold text-white">${esc(source)}</span>`:''}${parts.join('')}</div>`;
  }

  function renderOwnPriceSummary(product){
    const summary=document.getElementById('productImageOwnPriceSummary');
    if(!summary)return;
    const html=ownProductPriceSummary(product)+marketProductPriceSummary(product);
    summary.innerHTML=html;
    summary.classList.toggle('hidden',!html);
  }

  async function selectProduct(code){
    const p=stateProducts().find(row=>productCode(row)===String(code));
    if(!p)return;
    activeProductCode=productCode(p);
    activeProductName=productName(p);
    const selected=document.getElementById('productImageSelectedName');
    if(selected)selected.textContent=activeProductName;
    renderOwnPriceSummary(p);
    const search=document.getElementById('productImageCandidateSearch');
    if(search){search.disabled=false;search.value=activeProductName;}
    const clear=document.getElementById('productImageClearButton');
    if(clear)clear.classList.toggle('hidden',!productImage(p));
    renderProducts(document.getElementById('productImageProductSearch')?.value||'');
    await loadCandidates(activeProductName);
  }

  function formatCandidatePrice(value){
    const amount=Number(value)||0;
    return amount>0?amount.toLocaleString('vi-VN',{maximumFractionDigits:0}):'';
  }

  function candidateMeta(row){
    return [row?.packaging].filter(Boolean).join(' · ');
  }

  function candidatePriceHtml(row){
    const carton=formatCandidatePrice(row?.carton_price);
    const retail=formatCandidatePrice(row?.retail_price);
    const qc=Number(row?.pack_quantity)||0;
    if(!carton&&!retail)return '<div class="mt-1 text-[10px] text-gray-400">Chưa có giá</div>';
    return `<div class="mt-1.5 flex flex-wrap items-center gap-1.5">
      ${carton?`<span class="inline-flex items-center gap-1 rounded-lg bg-primaryLight px-2 py-1 text-[10px] font-extrabold text-primary"><span class="font-semibold opacity-70">Thùng</span><span>${carton}</span>${qc>1?`<span class="font-semibold opacity-65">· QC ${qc.toLocaleString('vi-VN',{maximumFractionDigits:2})}</span>`:''}</span>`:''}
      ${retail?`<span class="inline-flex items-center gap-1 rounded-lg bg-gray-100 px-2 py-1 text-[10px] font-extrabold text-gray-700"><span class="font-semibold text-gray-400">Lẻ</span><span>${retail}</span></span>`:''}
    </div>`;
  }

  function sourceHost(value){
    try{return new URL(String(value||'')).hostname.replace(/^www\./,'');}catch{return '';}
  }

  async function loadCandidates(query){
    const list=document.getElementById('productImageCandidateList');
    if(!list||!activeProductCode)return;
    list.innerHTML='<div class="py-10 text-center text-gray-400 text-[12px]"><i class="ph-bold ph-spinner animate-spin mr-1"></i>Đang tìm ảnh...</div>';
    try{
      const rows=await prod()?.productMediaCandidates?.(String(query||''),18);
      const candidates=Array.isArray(rows)?rows:[];
      if(!candidates.length){
        list.innerHTML='<div class="py-10 text-center text-gray-400 text-[12px]">Không thấy ảnh phù hợp. Bạn có thể đổi từ khóa tìm kiếm.</div>';
        return;
      }
      const selectedProduct=stateProducts().find(row=>productCode(row)===activeProductCode);
      const selectedMarketUrl=String(selectedProduct?.marketLinkUrl||'').trim();
      list.innerHTML=`<div class="product-image-candidate-grid">${candidates.map(row=>{
        const id=String(row?.id||''),name=String(row?.name||''),image=String(row?.image_url||'');
        const candidateUrl=String(row?.image_source_url||'').trim();
        const chosen=selectedMarketUrl&&candidateUrl===selectedMarketUrl;
        const meta=candidateMeta(row),host=sourceHost(row?.image_source_url),prices=candidatePriceHtml(row);
        return `<button type="button" data-candidate-id="${esc(id)}" class="product-image-candidate-card relative text-left rounded-xl border ${chosen?'border-primary bg-primaryLight':'border-gray-100 bg-white'} p-2 hover:border-primary/40 transition">
          <div class="product-image-candidate-thumb rounded-lg bg-gray-50 border border-gray-100 overflow-hidden flex items-center justify-center">
            <img src="${esc(image)}" alt="" class="w-full h-full object-contain" loading="lazy" decoding="async">
          </div>
          ${chosen?'<span class="absolute top-3 right-3 w-5 h-5 rounded-full bg-primary text-white text-[11px] font-bold flex items-center justify-center shadow-sm">✓</span>':''}
          <div class="mt-2 text-[11px] font-bold text-gray-900 line-clamp-2 min-h-[30px]">${esc(name)}</div>
          ${prices}
          <div class="mt-1.5 flex items-center gap-1.5 min-w-0">
            ${row?.source?`<span class="inline-flex rounded-full bg-gray-100 px-1.5 py-0.5 text-[9px] font-bold text-gray-600 shrink-0">${esc(row.source)}</span>`:''}
            ${meta?`<span class="text-[9px] text-gray-500 truncate">${esc(meta)}</span>`:''}
          </div>
          ${host?`<div class="mt-0.5 text-[9px] text-gray-400 truncate">${esc(host)}</div>`:''}
        </button>`;
      }).join('')}</div>`;
    }catch(error){
      console.error('product image candidates',error);
      list.innerHTML='<div class="py-10 text-center text-danger text-[12px]">Không tải được nguồn ảnh.</div>';
      if(typeof showToast==='function')showToast(error?.message||'Không tải được nguồn ảnh.','warning');
    }
  }

  async function chooseCandidate(id){
    if(!activeProductCode||!id)return;
    try{
      if(typeof showLoading==='function')showLoading('Đang lưu ảnh...');
      await prod()?.setProductMedia?.(activeProductCode,id);
      if(window.SheetDB?.read)await SheetDB.read('sanpham');
      renderProducts(document.getElementById('productImageProductSearch')?.value||'');
      const fresh=stateProducts().find(row=>productCode(row)===activeProductCode);
      document.getElementById('productImageClearButton')?.classList.toggle('hidden',!productImage(fresh));
      renderOwnPriceSummary(fresh);
      await loadCandidates(document.getElementById('productImageCandidateSearch')?.value||activeProductName);
      if(typeof showToast==='function')showToast('Đã gắn ảnh và giá đối chiếu.','success');
    }catch(error){
      console.error('set product image',error);
      if(typeof showToast==='function')showToast(error?.message||'Không lưu được ảnh.','warning');
    }finally{
      if(typeof hideLoading==='function')hideLoading();
    }
  }

  async function clearSelectedImage(){
    if(!activeProductCode)return;
    try{
      if(typeof showLoading==='function')showLoading('Đang bỏ ảnh...');
      await prod()?.clearProductMedia?.(activeProductCode);
      if(window.SheetDB?.read)await SheetDB.read('sanpham');
      document.getElementById('productImageClearButton')?.classList.add('hidden');
      const fresh=stateProducts().find(row=>productCode(row)===activeProductCode);
      renderOwnPriceSummary(fresh);
      renderProducts(document.getElementById('productImageProductSearch')?.value||'');
      await loadCandidates(document.getElementById('productImageCandidateSearch')?.value||activeProductName);
      if(typeof showToast==='function')showToast('Đã bỏ ảnh sản phẩm.','success');
    }catch(error){
      console.error('clear product image',error);
      if(typeof showToast==='function')showToast(error?.message||'Không bỏ được ảnh.','warning');
    }finally{
      if(typeof hideLoading==='function')hideLoading();
    }
  }

  window.openProductImageManager=function(){
    const role=String(prod()?.getIdentity?.()?.role||'').toLowerCase();
    if(role!=='admin'&&role!=='owner'){
      if(typeof showToast==='function')showToast('Chỉ Admin được chọn ảnh sản phẩm.','warning');
      return;
    }
    activeProductCode='';
    activeProductName='';
    const wrapper=ensureModal();
    wrapper.classList.remove('hidden');
    wrapper.classList.add('flex');
    const search=document.getElementById('productImageProductSearch');
    if(search)search.value='';
    const candidateSearch=document.getElementById('productImageCandidateSearch');
    if(candidateSearch){candidateSearch.value='';candidateSearch.disabled=true;}
    const selected=document.getElementById('productImageSelectedName');
    if(selected)selected.textContent='Chọn một sản phẩm';
    renderOwnPriceSummary(null);
    document.getElementById('productImageClearButton')?.classList.add('hidden');
    const candidates=document.getElementById('productImageCandidateList');
    if(candidates)candidates.innerHTML='<div class="h-full flex items-center justify-center text-center text-gray-400 text-[12px] px-6">Chọn sản phẩm bên trái để tìm ảnh phù hợp.</div>';
    renderProducts('');
    setTimeout(()=>search?.focus({preventScroll:true}),0);
  };

  window.closeProductImageManager=function(){
    const wrapper=document.getElementById('productImageManagerWrapper');
    wrapper?.classList.add('hidden');
    wrapper?.classList.remove('flex');
  };

  installSettings();
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',installSettings,{once:true});
  window.addEventListener('taphoa-production-sync',()=>{syncToggle();if(!document.getElementById('productImageManagerWrapper')?.classList.contains('hidden'))renderProducts(document.getElementById('productImageProductSearch')?.value||'');});
})();
