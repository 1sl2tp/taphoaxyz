/* TAPHOA product image settings + supermarket image picker. */
(function(){
  'use strict';

  let activeProductCode='';
  let activeProductName='';
  let candidateTimer=null;
  let compareTimer=null;
  let ownQcTimer=null;

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
              <div class="flex items-start justify-between gap-2 mb-2">
                <div class="min-w-0 flex items-start gap-2.5">
                  <span class="hidden w-11 h-11 rounded-xl border border-gray-100 bg-gray-50 shrink-0 overflow-hidden items-center justify-center" id="productImageSelectedThumbWrap">
                    <img alt="" class="w-full h-full object-contain" decoding="async" id="productImageSelectedThumb">
                  </span>
                  <div class="min-w-0">
                    <div class="text-[11px] text-gray-400">Đang chọn cho</div>
                    <div class="text-[13px] font-bold text-gray-900 truncate" id="productImageSelectedName">Chọn một sản phẩm</div>
                    <div class="product-image-compare-table mt-1.5" id="productImageCompareTable">
                      <div class="hidden" id="productImageOwnPriceSummary"></div>
                      <div class="hidden" id="productImageSelectedMarketSummary"></div>
                    </div>
                  </div>
                </div>
                <button class="hidden h-8 px-3 rounded-lg border border-red-100 text-danger text-[11px] font-bold shrink-0" id="productImageClearButton" type="button">Bỏ ảnh</button>
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
    wrapper.querySelector('#productImageOwnPriceSummary')?.addEventListener('change',event=>{
      const input=event.target.closest('[data-own-qc-input]');
      if(input)scheduleOwnQcSave(input.value);
    });
    wrapper.querySelector('#productImageOwnPriceSummary')?.addEventListener('input',event=>{
      const input=event.target.closest('[data-own-qc-input]');
      if(input)scheduleOwnQcSave(input.value);
    });
    wrapper.querySelector('#productImageSelectedMarketSummary')?.addEventListener('click',event=>{
      const related=event.target.closest('[data-market-related-search]');
      if(related){event.preventDefault();searchRelatedMarket();}
    });
    wrapper.querySelector('#productImageSelectedMarketSummary')?.addEventListener('change',event=>{
      const select=event.target.closest('[data-market-kind-select]');
      if(select)saveMarketCompareKind(select.value);
      const input=event.target.closest('[data-market-qc-input]');
      if(input)scheduleMarketQcSave(input.value);
    });
    wrapper.querySelector('#productImageSelectedMarketSummary')?.addEventListener('input',event=>{
      const input=event.target.closest('[data-market-qc-input]');
      if(input)scheduleMarketQcSave(input.value);
    });
    return wrapper;
  }

  function stateProducts(){
    return Array.isArray(prod()?.getState?.()?.products)?prod().getState().products:[];
  }

  function marketPackagingValue(item){
    return String(item?.marketPackaging??item?.packaging??'').trim();
  }

  function marketProductNameValue(item){
    return String(item?.marketProductName??item?.name??'').trim();
  }

  function normalizedWords(value){
    return norm(value).replace(/[^a-z0-9]+/g,' ').trim().split(/\s+/).filter(Boolean);
  }

  function marketAllowsUnitBreakdown(item){
    const packagingWords=normalizedWords(marketPackagingValue(item));
    const packageHead=packagingWords[0]||'';
    const isLocOrVi=packageHead==='loc'||packageHead==='vi';
    const nameWords=normalizedWords(marketProductNameValue(item));
    const milkWords=new Set(['sua','milk','vinamilk','nutifood','milo','ensure','pediasure','yomost','probi']);
    const isMilk=nameWords.some(word=>milkWords.has(word));
    return isLocOrVi||isMilk;
  }

  function marketPackageLabel(item){
    const labels={
      thung:'Thùng',loc:'Lốc',vi:'Vỉ',hop:'Hộp',chai:'Chai',lon:'Lon',
      goi:'Gói',hu:'Hũ',tui:'Túi',bich:'Bịch',khay:'Khay',ly:'Ly'
    };
    const packagingWords=normalizedWords(marketPackagingValue(item));
    const unitWords=normalizedWords(item?.pack_unit||item?.marketPackUnit||'');
    const nameWords=normalizedWords(marketProductNameValue(item));
    const key=[...packagingWords,...unitWords,...nameWords].find(word=>labels[word]);
    return labels[key]||'Lẻ';
  }

  function marketPackageDescriptor(item){
    const packaging=marketPackagingValue(item);
    const name=marketProductNameValue(item);
    const direct=/(thùng|lốc|vỉ|hộp|chai|lon|gói|hũ|túi|bịch|khay|ly)\s+\d+(?:[.,]\d+)?\s*(?:kg|g|ml|l)?/ig;
    const sized=/(thùng|lốc|vỉ|hộp|chai|lon|gói|hũ|túi|bịch|khay|ly)(?:\s+[A-Za-zÀ-ỹ]+){0,2}\s+\d+(?:[.,]\d+)?\s*(?:kg|g|ml|l)/ig;
    let match,last='';
    while((match=sized.exec(name)))last=String(match[0]||'').trim();
    if(!last)while((match=direct.exec(name)))last=String(match[0]||'').trim();
    if(!last)return '';
    return packaging&&norm(packaging).includes(norm(last))?'':last;
  }

  function marketPackMeasure(value){
    const matches=String(value||'').match(/\d+(?:[.,]\d+)?\s*(?:kg|g|ml|l)\b/ig)||[];
    return String(matches[matches.length-1]||'').trim();
  }

  function productMarketDetailPackRows(product,compare){
    const rows=[];
    const seen=new Set();
    const add=(level,qty,detail='')=>{
      const cleanLevel=String(level||'').trim();
      const cleanQty=String(qty??'').trim();
      const cleanDetail=String(detail||'').trim();
      if(!cleanLevel)return;
      const key=[norm(cleanLevel),cleanQty,norm(cleanDetail)].join('|');
      if(seen.has(key))return;
      seen.add(key);
      rows.push({level:cleanLevel,qty:cleanQty||'—',detail:cleanDetail||'—'});
    };
    const q2=Number(product?.marketPackQty2)||0;
    const q3=Number(product?.marketPackQty3)||0;
    const label2=String(product?.marketPackLabel2||'').trim();
    const label3=String(product?.marketPackLabel3||'').trim();
    const qc=Number(compare?.qc)||Number(product?.marketUnitsPerCarton)||0;
    const packaging=marketPackagingValue(product);
    const descriptor=marketPackageDescriptor(product);
    const packageMeasure=marketPackMeasure(packaging);
    const descriptorMeasure=marketPackMeasure(descriptor);
    const leafLabel=label3||label2||marketPackageLabel(product);

    if(qc>1){
      add('Thùng','1',`${qc.toLocaleString('vi-VN',{maximumFractionDigits:2})} ${String(leafLabel||'đơn vị').toLowerCase()}`);
    }

    if(descriptor){
      const parsed=descriptor.match(/^(thùng|lốc|vỉ|hộp|chai|lon|gói|hũ|túi|bịch|khay|ly)\b\s*(.*)$/i);
      if(parsed&&norm(parsed[1])!=='thung'){
        add(marketPackageLabel({marketPackaging:parsed[1]}),'1',String(parsed[2]||descriptorMeasure||'').trim());
      }
    }

    if(q2>0&&label2){
      let detail='';
      if(q3>0&&label3){
        const perMiddle=qc>0&&q2>0&&Math.abs(q3-qc)<0.0001?qc/q2:q3;
        if(perMiddle>0)detail=`${perMiddle.toLocaleString('vi-VN',{maximumFractionDigits:2})} ${label3.toLowerCase()}`;
      }else if(packageMeasure){
        detail=packageMeasure;
      }
      add(label2,q2.toLocaleString('vi-VN',{maximumFractionDigits:2}),detail);
    }

    if(q3>0&&label3){
      add(label3,q3.toLocaleString('vi-VN',{maximumFractionDigits:2}),packageMeasure||descriptorMeasure);
    }else if(!q2&&descriptor){
      const parsed=descriptor.match(/^(thùng|lốc|vỉ|hộp|chai|lon|gói|hũ|túi|bịch|khay|ly)\b\s*(.*)$/i);
      if(parsed&&norm(parsed[1])!=='thung'){
        add(marketPackageLabel({marketPackaging:parsed[1]}),'1',String(parsed[2]||packageMeasure||'').trim());
      }
    }

    if(!rows.length&&packaging){
      add(marketPackageLabel(product),'1',packaging);
    }
    return rows;
  }

  function productMarketDetailPackTable(product,compare){
    const rows=productMarketDetailPackRows(product,compare);
    if(!rows.length)return '';
    return `<div class="product-market-pack-table">
      <div class="product-market-pack-head"><span>Đóng gói</span><span>Số lượng</span><span>Bên trong</span></div>
      ${rows.map(row=>`<div class="product-market-pack-row"><span>${esc(row.level)}</span><strong>${esc(row.qty)}</strong><span>${esc(row.detail)}</span></div>`).join('')}
    </div>`;
  }

  function ensureProductMarketDetailModal(){
    let wrapper=document.getElementById('productMarketDetailWrapper');
    if(wrapper)return wrapper;
    wrapper=document.createElement('div');
    wrapper.id='productMarketDetailWrapper';
    wrapper.className='absolute inset-0 z-[195] hidden items-center justify-center bg-gray-900/45 backdrop-blur-sm p-3';
    wrapper.innerHTML=`
      <section class="product-market-detail-modal bg-white w-full max-w-[560px] max-h-[86vh] rounded-[22px] shadow-2xl overflow-hidden flex flex-col" role="dialog" aria-modal="true" aria-labelledby="productMarketDetailTitle">
        <header class="px-4 py-3.5 border-b border-gray-100 flex items-center justify-between gap-3 shrink-0">
          <div>
            <h2 class="text-[16px] font-extrabold text-gray-900" id="productMarketDetailTitle">So sánh sản phẩm</h2>
            <p class="text-[10px] text-gray-400 mt-0.5">Chi tiết từ sản phẩm siêu thị đã chọn</p>
          </div>
          <button aria-label="Đóng chi tiết sản phẩm" class="allow-fast-click w-9 h-9 rounded-full bg-gray-50 flex items-center justify-center text-gray-500" data-market-detail-close type="button"><i class="ph-bold ph-x"></i></button>
        </header>
        <div class="product-market-detail-body flex-1 min-h-0 overflow-y-auto p-4" id="productMarketDetailBody"></div>
      </section>`;
    document.getElementById('appContainer')?.appendChild(wrapper);
    wrapper.querySelector('[data-market-detail-close]')?.addEventListener('click',closeProductMarketDetail);
    wrapper.addEventListener('click',event=>{if(event.target===wrapper)closeProductMarketDetail();});
    return wrapper;
  }

  function productMarketDetailOwnState(product){
    const saleVnd=ownPriceValue(product?.sale_price_vnd,true)||ownPriceValue(product?.gia??product?.price??product?.unit_price);
    const sourceQc=Number(product?.quyCach??product?.quyDoiThung??product?.units_per_carton)||0;
    const overrideQc=Number(product?.ownCompareUnitsPerCarton)||0;
    const qc=overrideQc>0?overrideQc:sourceQc;
    let retailVnd=ownPriceValue(product?.retail_price_vnd,true)||ownPriceValue(product?.giaLe??product?.retail_price);
    if(overrideQc>0&&saleVnd>0)retailVnd=saleVnd/overrideQc;
    else if(retailVnd<=0&&saleVnd>0&&qc>1)retailVnd=saleVnd/qc;
    return {kind:qc>1?'carton':'retail',qc,carton:saleVnd,retail:retailVnd};
  }

  function productMarketDetailStructure(product,compare){
    const packaging=marketPackagingValue(product);
    const q2=Number(product?.marketPackQty2)||0;
    const q3=Number(product?.marketPackQty3)||0;
    const label2=String(product?.marketPackLabel2||'').trim();
    const label3=String(product?.marketPackLabel3||'').trim();
    const total=Number(product?.marketUnitsPerCarton)||0;
    const parts=[];
    const descriptor=marketPackageDescriptor(product);
    if(descriptor)parts.push(descriptor);
    if(packaging&&!parts.some(part=>norm(part).includes(norm(packaging))))parts.push(packaging);
    if(q2>0&&label2){
      let child=`${q2.toLocaleString('vi-VN',{maximumFractionDigits:2})} ${label2.toLowerCase()}`;
      if(q3>0&&label3){
        const perMiddle=total>0&&Math.abs(q3-total)<0.0001&&q2>0?total/q2:0;
        if(perMiddle>0&&Math.abs(perMiddle-Math.round(perMiddle))<0.0001){
          child+=` × ${Math.round(perMiddle).toLocaleString('vi-VN')} ${label3.toLowerCase()} = ${total.toLocaleString('vi-VN',{maximumFractionDigits:2})}`;
        }else{
          child+=` × ${q3.toLocaleString('vi-VN',{maximumFractionDigits:2})} ${label3.toLowerCase()}`;
        }
      }
      if(!parts.some(part=>norm(part).includes(norm(child))))parts.push(child);
    }else if(q3>0&&label3){
      parts.push(`${q3.toLocaleString('vi-VN',{maximumFractionDigits:2})} ${label3.toLowerCase()}`);
    }
    return parts.join(' · ');
  }

  function productMarketDetailRow(label,state){
    const kind=state?.kind==='carton'?'Thùng':'Lẻ';
    const carton=Number(state?.carton)>0?formatComparePrice(state.carton):'—';
    const retail=Number(state?.retail)>0?formatComparePrice(state.retail):'—';
    const qc=Number(state?.qc)>0?Number(state.qc).toLocaleString('vi-VN',{maximumFractionDigits:2}):'—';
    return `<div class="product-market-detail-row">
      <div class="product-market-detail-side">${esc(label)}</div>
      <div>${kind}</div>
      <div class="product-market-detail-number">${carton}</div>
      <div class="product-market-detail-number">${qc}</div>
      <div class="product-market-detail-number">${retail}</div>
    </div>`;
  }

  function closeProductMarketDetail(){
    const wrapper=document.getElementById('productMarketDetailWrapper');
    wrapper?.classList.add('hidden');
    wrapper?.classList.remove('flex');
  }

  window.openProductMarketDetail=function(code){
    const product=stateProducts().find(row=>productCode(row)===String(code||''));
    if(!product||!productImage(product))return;
    const wrapper=ensureProductMarketDetailModal();
    const body=wrapper.querySelector('#productMarketDetailBody');
    if(!body)return;
    const own=productMarketDetailOwnState(product);
    const market=marketCompareState(product);
    const ownName=productName(product);
    const marketName=String(product?.marketProductName||'').trim()||'Chưa có tên siêu thị';
    const source=String(product?.marketSource||'').trim();
    const sourceUrl=String(product?.imageSourceUrl||product?.image_source_url||'').trim();
    const packTable=productMarketDetailPackTable(product,market);
    const safeLink=/^https?:\/\//i.test(sourceUrl)?sourceUrl:'';
    body.innerHTML=`
      <div class="product-market-detail-hero">
        <div class="product-market-detail-image"><img src="${esc(productImage(product))}" alt="${esc(ownName)}"></div>
        <div class="product-market-detail-copy">
          <div class="product-market-detail-identity">
            <span class="product-market-detail-label">Mình</span>
            <div class="product-market-detail-value"><strong>${esc(ownName)}</strong></div>
          </div>
          <div class="product-market-detail-identity">
            <span class="product-market-detail-label">Họ</span>
            <div class="product-market-detail-value">
              <strong>${esc(marketName)}</strong>
              ${source?`<span class="product-market-detail-source-chip">${esc(source)}</span>`:''}
            </div>
          </div>
          ${packTable}
          ${safeLink?`<a class="product-market-detail-inline-link" href="${esc(safeLink)}" target="_blank" rel="noopener noreferrer"><i class="ph-bold ph-arrow-square-out"></i><span>Mở sản phẩm</span></a>`:''}
        </div>
      </div>
      <div class="product-market-detail-table">
        <div class="product-market-detail-head"><span></span><span>Phân loại</span><span>Giá</span><span>QC</span><span>Lẻ</span></div>
        ${productMarketDetailRow('MÌNH',own)}
        ${productMarketDetailRow('HỌ',market)}
      </div>
    `;
    wrapper.classList.remove('hidden');
    wrapper.classList.add('flex');
  };

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
    const sourceQc=Number(product?.quyCach??product?.quyDoiThung??product?.units_per_carton)||0;
    const overrideQc=Number(product?.ownCompareUnitsPerCarton)||0;
    const qc=overrideQc>0?overrideQc:sourceQc;
    let retailVnd=ownPriceValue(product?.retail_price_vnd,true)||ownPriceValue(product?.giaLe??product?.retail_price);
    if(overrideQc>0&&saleVnd>0)retailVnd=saleVnd/overrideQc;
    else if(retailVnd<=0&&saleVnd>0&&qc>1)retailVnd=saleVnd/qc;
    if(saleVnd<=0&&!retailVnd)return '';
    const saleLabel=qc>1?'Thùng':'Bán';
    const qcValue=qc>0?String(qc).replace(/\.0+$/,''):'';
    return `<span class="product-image-compare-label">MÌNH</span>
      <span class="product-image-compare-source product-image-compare-source-own">—</span>
      <span class="product-image-compare-kind">${saleLabel}</span>
      <span class="product-image-compare-price product-image-compare-price-own">${saleVnd>0?formatComparePrice(saleVnd):'—'}</span>
      <label class="product-image-compare-qc product-image-compare-qc-edit"><span>QC</span><input aria-label="Quy cách của mình" data-own-qc-input inputmode="decimal" min="0" placeholder="?" step="any" type="number" value="${esc(qcValue)}"></label>
      <span class="product-image-compare-retail">${retailVnd>0?`<span>Lẻ</span> ${formatComparePrice(retailVnd)}`:'—'}</span>
      <span class="product-image-compare-link"></span>`;
  }

  function renderOwnPriceSummary(product){
    const summary=document.getElementById('productImageOwnPriceSummary');
    if(!summary)return;
    const html=ownProductPriceSummary(product);
    summary.innerHTML=html;
    summary.classList.toggle('hidden',!html);
  }

  function selectedMarketStructure(product){
    if(String(product?.marketCompareKind||'').trim()||Number(product?.marketCompareUnitsPerCarton)>0)return '';
    const q2=Number(product?.marketPackQty2)||0;
    const q3=Number(product?.marketPackQty3)||0;
    const label2=String(product?.marketPackLabel2||'').trim();
    const label3=String(product?.marketPackLabel3||'').trim();
    const total=Number(product?.marketUnitsPerCarton)||0;
    if(q2>1&&q3>1&&label2&&label3){
      const perMiddle=total>0&&q2>0?total/q2:0;
      if(perMiddle>0&&Math.abs(perMiddle-Math.round(perMiddle))<0.0001){
        return `${q2.toLocaleString('vi-VN')} ${label2.toLowerCase()} × ${Math.round(perMiddle).toLocaleString('vi-VN')} ${label3.toLowerCase()} = ${total.toLocaleString('vi-VN',{maximumFractionDigits:2})}`;
      }
      return `${q2.toLocaleString('vi-VN')} ${label2.toLowerCase()} · ${q3.toLocaleString('vi-VN')} ${label3.toLowerCase()}`;
    }
    return '';
  }

  function relatedMarketQuery(product){
    const saved=String(product?.marketProductName||'').trim();
    if(!saved)return productName(product);
    const stop=new Set([
      'sua','bia','dau','nuoc','mi','banh','keo','hat','nem','bot','ngot',
      'dac','nanh','gao','nguyen','chat','vi','thit','goi','thung','loc','vi',
      'chai','lon','hop','bich','tui','khay','combo','lit','ml','kg','g'
    ]);
    const tokens=norm(saved)
      .replace(/[^a-z0-9\s-]/g,' ')
      .replace(/-/g,' ')
      .split(/\s+/)
      .filter(Boolean)
      .filter(token=>!stop.has(token))
      .filter(token=>!/^\d+(?:[.,]\d+)?$/.test(token))
      .filter(token=>!/^\d+(?:[.,]\d+)?(?:ml|g|kg|l)$/.test(token));
    const related=tokens.slice(0,3).join(' ').trim();
    return related||saved;
  }

  function searchRelatedMarket(){
    const current=stateProducts().find(row=>productCode(row)===activeProductCode);
    if(!current)return;
    const query=relatedMarketQuery(current);
    const search=document.getElementById('productImageCandidateSearch');
    if(search){search.disabled=false;search.value=query;}
    loadCandidates(query);
  }

  function marketCompareState(product){
    const rawKind=String(product?.marketPackKind||'').toLowerCase();
    const overrideKind=String(product?.marketCompareKind||'').toLowerCase();
    const kind=overrideKind==='carton'||overrideKind==='retail'?overrideKind:(rawKind==='carton'?'carton':'retail');
    const selected=Number(product?.marketSelectedPriceVnd)||0;
    const sourcePrice=Number(product?.marketSourcePriceVnd)||0;
    const rawCarton=Number(product?.marketCartonPriceVnd)||0;
    const rawRetail=Number(product?.marketRetailPriceVnd)||0;
    const rawQc=Number(product?.marketUnitsPerCarton)||0;
    const overrideQc=Number(product?.marketCompareUnitsPerCarton)||0;
    const ownQc=Number(product?.ownCompareUnitsPerCarton)||Number(product?.quyCach??product?.quyDoiThung??product?.units_per_carton)||0;
    const qc=overrideQc>0?overrideQc:(rawQc>0?rawQc:ownQc);
    const allowsBreakdown=marketAllowsUnitBreakdown(product);
    const price=kind==='carton'
      ? (selected>0?selected:(rawCarton>0?rawCarton:sourcePrice))
      : (selected>0?selected:(sourcePrice>0?sourcePrice:rawRetail));
    const carton=kind==='carton'
      ? price
      : (price>0&&qc>0?price*qc:0);
    const retail=kind==='carton'
      ? (price>0&&qc>0?price/qc:0)
      : price;
    return {kind,qc,price,carton,retail,overrideKind,allowsBreakdown,sourcePrice};
  }

  function selectedMarketSummary(product){
    if(!productImage(product))return '';
    const source=String(product?.marketSource||'').trim();
    const sourceUrl=String(product?.imageSourceUrl||product?.image_source_url||'').trim();
    const compare=marketCompareState(product);
    const structure=selectedMarketStructure(product);
    const carton=formatComparePrice(compare.carton);
    const retail=formatComparePrice(compare.retail);
    const qcValue=compare.qc>0?String(compare.qc).replace(/\.0+$/,''):'';
    const priceText=carton||'—';
    const retailText=retail||'—';
    const safeLink=/^https?:\/\//i.test(sourceUrl)?sourceUrl:'';
    return `<span class="product-image-compare-label">HỌ</span>
      ${source?`<button aria-label="Tìm sản phẩm liên quan từ tên siêu thị đã lưu" class="product-image-compare-source" data-market-related-search title="Tìm sản phẩm liên quan" type="button">${esc(source)}</button>`:`<span class="product-image-compare-source">—</span>`}
      <label class="product-image-compare-kind product-image-compare-kind-edit">
        <select aria-label="Loại giá của siêu thị" data-market-kind-select>
          <option value="carton" ${compare.kind==='carton'?'selected':''}>Thùng</option>
          <option value="retail" ${compare.kind==='retail'?'selected':''}>Lẻ</option>
        </select>
      </label>
      <span class="product-image-compare-price">${priceText}</span>
      <label class="product-image-compare-qc product-image-compare-qc-edit"><span>QC</span><input aria-label="Quy cách của siêu thị" data-market-qc-input inputmode="decimal" min="0" placeholder="?" step="any" type="number" value="${esc(qcValue)}"></label>
      <span class="product-image-compare-retail"><span>Lẻ</span> ${retailText}</span>
      <span class="product-image-compare-link">${safeLink?`<a aria-label="Mở sản phẩm siêu thị gốc" href="${esc(safeLink)}" rel="noopener noreferrer" target="_blank" title="Mở link gốc"><i class="ph-bold ph-arrow-square-out"></i></a>`:''}</span>
      ${structure&&compare.kind==='carton'?`<div class="product-image-compare-structure">${esc(structure)}</div>`:''}`;
  }
  function renderSelectedThumb(product){
    const wrap=document.getElementById('productImageSelectedThumbWrap');
    const img=document.getElementById('productImageSelectedThumb');
    if(!wrap||!img)return;
    const src=productImage(product);
    if(src){
      img.src=src;
      img.alt=productName(product);
      wrap.classList.remove('hidden');
      wrap.classList.add('flex');
    }else{
      img.removeAttribute('src');
      img.alt='';
      wrap.classList.add('hidden');
      wrap.classList.remove('flex');
    }
  }

  function renderSelectedMarketSummary(product){
    const summary=document.getElementById('productImageSelectedMarketSummary');
    if(!summary)return;
    const html=selectedMarketSummary(product);
    summary.innerHTML=html;
    summary.classList.toggle('hidden',!html);
    renderSelectedThumb(product);
  }

  async function persistMarketCompare(kind,qc=null){
    if(!activeProductCode)return;
    try{
      await prod()?.setProductMediaCompare?.(activeProductCode,kind,qc);
      const fresh=stateProducts().find(row=>productCode(row)===activeProductCode);
      renderSelectedMarketSummary(fresh);
    }catch(error){
      console.error('set market compare',error);
      if(typeof showToast==='function')showToast(error?.message||'Không lưu được quy cách của siêu thị.','warning');
    }
  }

  function saveMarketCompareKind(kind){
    const current=stateProducts().find(row=>productCode(row)===activeProductCode);
    if(!current)return;
    const detected=Number(current?.marketCompareUnitsPerCarton)||Number(current?.marketUnitsPerCarton)||0;
    clearTimeout(compareTimer);
    persistMarketCompare(kind,detected>0?detected:null);
  }

  function scheduleMarketQcSave(value){
    const qc=Number(value)||0;
    clearTimeout(compareTimer);
    if(qc<=0)return;
    const current=stateProducts().find(row=>productCode(row)===activeProductCode);
    const kind=String(current?.marketCompareKind||'').toLowerCase()==='carton'?'carton':'retail';
    compareTimer=setTimeout(()=>persistMarketCompare(kind,qc),350);
  }

  async function persistOwnQc(qc){
    if(!activeProductCode||qc<=0)return;
    try{
      await prod()?.setProductMediaOwnQc?.(activeProductCode,qc);
      const fresh=stateProducts().find(row=>productCode(row)===activeProductCode);
      renderOwnPriceSummary(fresh);
    }catch(error){
      console.error('set own compare qc',error);
      if(typeof showToast==='function')showToast(error?.message||'Không lưu được quy cách của mình.','warning');
    }
  }

  function scheduleOwnQcSave(value){
    const qc=Number(value)||0;
    clearTimeout(ownQcTimer);
    if(qc<=0)return;
    ownQcTimer=setTimeout(()=>persistOwnQc(qc),350);
  }

  async function selectProduct(code){
    const p=stateProducts().find(row=>productCode(row)===String(code));
    if(!p)return;
    activeProductCode=productCode(p);
    activeProductName=productName(p);
    const selected=document.getElementById('productImageSelectedName');
    if(selected)selected.textContent=activeProductName;
    renderOwnPriceSummary(p);
    renderSelectedMarketSummary(p);
    const search=document.getElementById('productImageCandidateSearch');
    const relatedQuery=productImage(p)&&String(p?.marketProductName||'').trim()?relatedMarketQuery(p):activeProductName;
    if(search){search.disabled=false;search.value=relatedQuery;}
    const clear=document.getElementById('productImageClearButton');
    if(clear)clear.classList.toggle('hidden',!productImage(p));
    renderProducts(document.getElementById('productImageProductSearch')?.value||'');
    await loadCandidates(relatedQuery);
  }

  function formatCandidatePrice(value){
    const amount=Number(value)||0;
    return amount>0?amount.toLocaleString('vi-VN',{maximumFractionDigits:0}):'';
  }

  function roundComparePrice(value){
    const amount=Number(value)||0;
    return amount>0?Math.round(amount/500)*500:0;
  }

  function formatComparePrice(value){
    const amount=roundComparePrice(value);
    return amount>0?amount.toLocaleString('vi-VN',{maximumFractionDigits:0}):'';
  }

  function candidatePackStructure(row){
    const q2=Number(row?.pack_qty2)||0;
    const q3=Number(row?.pack_qty3)||0;
    const total=Number(row?.units_per_carton)||0;
    const label2=String(row?.pack_label2||'').trim();
    const label3=String(row?.pack_label3||'').trim();
    if(q2>0&&label2){
      let child=`${q2.toLocaleString('vi-VN',{maximumFractionDigits:2})} ${label2.toLowerCase()}`;
      if(q3>0&&label3){
        const perMiddle=total>0&&Math.abs(q3-total)<0.0001&&q2>0?total/q2:0;
        child+=perMiddle>0&&Math.abs(perMiddle-Math.round(perMiddle))<0.0001
          ?` × ${Math.round(perMiddle).toLocaleString('vi-VN')} ${label3.toLowerCase()} = ${total.toLocaleString('vi-VN',{maximumFractionDigits:2})}`
          :` × ${q3.toLocaleString('vi-VN',{maximumFractionDigits:2})} ${label3.toLowerCase()}`;
      }
      return child;
    }
    return q3>0&&label3?`${q3.toLocaleString('vi-VN',{maximumFractionDigits:2})} ${label3.toLowerCase()}`:'';
  }

  function candidateMeta(row){
    const parts=[marketPackageDescriptor(row),row?.packaging,candidatePackStructure(row)].filter(Boolean);
    return parts.filter((part,index)=>parts.findIndex(other=>norm(other)===norm(part))===index).join(' · ');
  }

  function candidatePriceHtml(row){
    const carton=formatCandidatePrice(row?.carton_price);
    const retail=formatCandidatePrice(row?.retail_price);
    const sourcePrice=formatCandidatePrice(row?.current_price);
    const qc=Number(row?.units_per_carton)||0;
    const rawKind=String(row?.pack_kind||'').toLowerCase();
    const allowsBreakdown=marketAllowsUnitBreakdown(row);
    if(rawKind!=='carton'&&!allowsBreakdown){
      const packagePrice=sourcePrice||retail;
      if(!packagePrice)return '<div class="mt-1 text-[10px] text-gray-400">Chưa có giá</div>';
      return `<div class="mt-1.5 flex flex-wrap items-center gap-1.5"><span class="inline-flex items-center gap-1 rounded-lg bg-gray-100 px-2 py-1 text-[10px] font-extrabold text-gray-700"><span class="font-semibold text-gray-400">${esc(marketPackageLabel(row))}</span><span>${packagePrice}</span></span></div>`;
    }
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
      const rows=await prod()?.productMediaCandidates?.(String(query||''),150);
      const candidates=Array.isArray(rows)?rows:[];
      if(!candidates.length){
        list.innerHTML='<div class="py-10 text-center text-gray-400 text-[12px]">Không thấy ảnh phù hợp. Bạn có thể đổi từ khóa tìm kiếm.</div>';
        return;
      }
      const countLabel=candidates.length>=150?'150+':String(candidates.length);
      list.innerHTML=`<div class="mb-2 flex items-center justify-between gap-2 text-[10px] text-gray-400"><span>${countLabel} kết quả</span><span>Khớp tên trước · giá thấp trước</span></div><div class="product-image-candidate-grid">${candidates.map(row=>{
        const id=String(row?.id||''),name=String(row?.name||''),image=String(row?.image_url||'');
        const meta=candidateMeta(row),host=sourceHost(row?.image_source_url),prices=candidatePriceHtml(row);
        return `<button type="button" data-candidate-id="${esc(id)}" class="product-image-candidate-card text-left rounded-xl border border-gray-100 bg-white p-2 hover:border-primary/40 transition">
          <div class="product-image-candidate-thumb rounded-lg bg-gray-50 border border-gray-100 overflow-hidden flex items-center justify-center">
            <img src="${esc(image)}" alt="" class="w-full h-full object-contain" loading="lazy" decoding="async">
          </div>
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
      renderSelectedMarketSummary(fresh);
      document.getElementById('productImageClearButton')?.classList.toggle('hidden',!productImage(fresh));
      if(typeof showToast==='function')showToast('Đã chọn ảnh sản phẩm.','success');
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
      renderSelectedMarketSummary(null);
      renderProducts(document.getElementById('productImageProductSearch')?.value||'');
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
    renderSelectedMarketSummary(null);
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
