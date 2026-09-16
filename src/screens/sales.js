const money=n=>Number(n||0).toLocaleString('vi-VN');
const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const norm=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').replace(/Đ/g,'D').toLowerCase();

export function filterProducts(products=[],search='',group='Tất cả'){
  const words=norm(search).trim().split(/\s+/).filter(Boolean);
  return products.filter(p=>p?.ten&&(!group||group==='Tất cả'||p.nhom===group)&&words.every(w=>norm(p.ten).includes(w)));
}

export function cartTotals(products=[],cart={},prices={}){
  const map=new Map(products.map(p=>[p.id,p]));
  let totalQty=0,total=0,totalCost=0;
  for(const [id,rawQty] of Object.entries(cart||{})){
    const qty=Number(rawQty)||0;if(qty<=0)continue;
    const p=map.get(id);if(!p)continue;
    const price=Number(prices[id]??p.gia)||0,cost=Number(p.von)||0;
    totalQty+=qty;total+=price*qty;totalCost+=cost*qty;
  }
  return {totalQty,total,totalCost,profit:total-totalCost};
}

export function buildOrderDraft({customerId,status='pending',note='',cart={},prices={},lineNos={},notes={},products=[],editOrderId=''}={}){
  const map=new Map(products.map(p=>[p.id,p]));
  const items=[];let next=1;
  for(const [id,rawQty] of Object.entries(cart)){
    const qty=Number(rawQty)||0,p=map.get(id);if(!p||qty<=0)continue;
    const lineNo=Math.max(1,Number(lineNos[id])||next++);
    items.push({maSP:id,sl:qty,gia:Number(prices[id]??p.gia)||0,lineNo,ghiChu:String(notes[id]||'')});
  }
  items.sort((a,b)=>a.lineNo-b.lineNo);
  return {maKH:String(customerId||'le'),status:String(status||'pending'),ghiChu:String(note||''),editOrderId:String(editOrderId||''),items};
}

const initials=value=>{
  const raw=String(value||'').trim();
  const words=raw.split(/\s+/).filter(Boolean);
  if(!words.length)return'SP';
  if(words.length===1)return words[0].slice(0,2).toUpperCase();
  return `${words[0][0]||''}${words[1][0]||''}`.toUpperCase();
};

function groupButtons(products=[],active='Tất cả'){
  const groups=['Tất cả',...new Set(products.map(p=>p.nhom).filter(Boolean))];
  return groups.map(g=>`<button type="button" data-group="${esc(g)}" aria-pressed="${g===active}" class="allow-fast-click px-4 py-1.5 rounded-full text-[12px] font-semibold whitespace-nowrap shrink-0 transition ${g===active?'bg-primary text-white shadow-sm':'border border-gray-200 text-gray-600 hover:bg-gray-50'}">${esc(g)}</button>`).join('');
}

function productRows(state){
  const rows=filterProducts(state.products,'',state.group);
  const visibleIds=new Set(filterProducts(state.products,state.search,state.group).map(p=>String(p.id)));
  if(!rows.length)return `<div class="py-10 text-center text-gray-400 text-sm" data-sales-empty>Không tìm thấy sản phẩm.</div>`;
  const canManage=state.permissions?.canManageOrders===true;
  const html=rows.map(p=>{
    const qty=Number(state.cart[p.id]||0),price=Number(state.prices[p.id]??p.gia)||0;
    return `<article class="fixed-product-card bg-white rounded-[16px] p-3.5 shadow-sm border border-gray-100 flex justify-between items-center hover:border-primary/30 transition" data-product-row="${esc(p.id)}" ${visibleIds.has(String(p.id))?'':'hidden'}>
      <div class="flex items-center min-w-0 flex-1 pr-3 gap-3">
        <span class="fixed-product-thumb" aria-hidden="true">${esc(initials(p.ten))}</span>
        <div class="min-w-0 flex-1"><p class="font-bold text-[15px] text-gray-900 truncate">${esc(p.ten)}</p><p class="text-[13px] font-bold text-primary mt-1">${money(price)} đ</p></div>
      </div>
      ${canManage?`<div class="fixed-qty-shell shrink-0" data-qty-id="${esc(p.id)}"><button type="button" data-qty-action="dec" aria-label="Giảm ${esc(p.ten)}"><i class="ph-bold ph-minus text-[10px]"></i></button><input type="number" min="0" step="1" inputmode="numeric" value="${qty}" data-qty-input="${esc(p.id)}" aria-label="Số lượng ${esc(p.ten)}"><button type="button" data-qty-action="add" aria-label="Tăng ${esc(p.ten)}"><i class="ph-bold ph-plus text-[10px]"></i></button></div>`:''}
    </article>`;
  }).join('');
  return `${html}<div class="py-10 text-center text-gray-400 text-sm" data-sales-empty ${visibleIds.size?'hidden':''}>Không tìm thấy sản phẩm.</div>`;
}

function applySalesSearchVisibility(root,state){
  const visibleIds=new Set(filterProducts(state.products,state.search,state.group).map(p=>String(p.id)));
  let visibleCount=0;
  for(const row of root.querySelectorAll('[data-product-row]')){
    const visible=visibleIds.has(String(row.dataset.productRow));
    row.hidden=!visible;if(visible)visibleCount++;
  }
  const empty=root.querySelector('[data-sales-empty]');if(empty)empty.hidden=visibleCount>0;
}

function cartRows(state){
  const selected=state.products.filter(p=>Number(state.cart[p.id]||0)>0).sort((a,b)=>String(a.ten||'').localeCompare(String(b.ten||''),'vi',{sensitivity:'base'}));
  if(!selected.length)return `<div class="py-12 text-center text-gray-400 text-sm flex flex-col items-center"><i class="ph ph-shopping-cart text-4xl mb-2 opacity-40"></i>Giỏ hàng trống</div>`;
  return selected.map((p,index)=>{
    const qty=Number(state.cart[p.id]||0),price=Number(state.prices[p.id]??p.gia)||0;
    return `<div class="cart-compact-grid py-3 border-b border-gray-50 text-[12px]" data-cart-line="${esc(p.id)}"><div class="cart-left"><div class="cart-stt font-bold text-gray-400">${index+1}</div><div class="cart-name font-bold text-gray-900 leading-tight">${esc(p.ten)}</div></div><div class="cart-price font-semibold text-gray-700">${money(price)}</div><div class="cart-qty"><div class="cart-qty-control"><button type="button" data-cart-dec="${esc(p.id)}" aria-label="Giảm ${esc(p.ten)}"><i class="ph-bold ph-minus text-[8px]"></i></button><input type="number" min="0" step="1" inputmode="numeric" value="${qty}" data-qty-input="${esc(p.id)}" aria-label="Số lượng ${esc(p.ten)}"><button type="button" data-cart-add="${esc(p.id)}" aria-label="Tăng ${esc(p.ten)}"><i class="ph-bold ph-plus text-[8px]"></i></button></div></div><div class="cart-total font-extrabold text-gray-900">${money(price*qty)}</div></div>`;
  }).join('');
}

function cartActions(state){
  const totals=cartTotals(state.products,state.cart,state.prices);const disabled=totals.totalQty<=0;
  if(state.editOrder)return `<div class="flex gap-2" data-cart-actions><button class="px-4 py-3 rounded-xl border border-gray-200 text-gray-600 font-bold hover:bg-gray-50 transition" type="button" data-sales-action="cancel-edit">Huỷ</button><button class="flex-1 py-3 rounded-xl bg-primary text-white font-bold shadow-lg shadow-primary/30" type="button" data-sales-action="update" ${disabled?'disabled':''}><i class="ph-fill ph-check-circle"></i> Cập nhật</button></div>`;
  return `<div class="flex gap-2" data-cart-actions><button class="px-4 py-3 rounded-xl border border-gray-200 text-gray-600 font-bold hover:bg-gray-50 transition flex items-center justify-center gap-1 ${disabled?'opacity-40':''}" type="button" data-sales-action="clear" ${disabled?'disabled':''}><i class="ph ph-trash"></i> Xóa</button><button class="flex-1 py-3 rounded-xl border border-primary text-primary font-bold hover:bg-[#f0fdf4] transition flex items-center justify-center gap-1 ${disabled?'opacity-40':''}" type="button" data-sales-action="pending" ${disabled?'disabled':''}><i class="ph ph-floppy-disk"></i> Lưu tạm</button><button class="flex-1 py-3 rounded-xl bg-primary text-white font-bold hover:bg-green-700 transition shadow-lg shadow-primary/30 flex items-center justify-center gap-1 ${disabled?'opacity-40':''}" type="button" data-sales-action="done" ${disabled?'disabled':''}><i class="ph-fill ph-check-circle"></i> BÁN NGAY</button></div>`;
}

function cartPanel(state,{mobile=false}={}){
  const totals=cartTotals(state.products,state.cart,state.prices);
  const lineCount=Object.values(state.cart).filter(v=>Number(v)>0).length;
  return `<section class="fixed-cart-panel ${mobile?'fixed-cart-sheet':''}">
    ${mobile?'<div class="w-full flex justify-center pt-3 pb-1"><div class="w-12 h-1.5 bg-gray-200 rounded-full"></div></div>':''}
    <div class="flex justify-between items-center px-5 py-3 border-b border-gray-100 shrink-0"><div class="flex items-center gap-2 text-gray-900"><div class="bg-[#f0fdf4] p-1.5 rounded-lg text-primary"><i class="ph-fill ph-shopping-cart text-lg"></i></div><h2 class="text-[18px] font-bold">Giỏ hàng</h2>${state.editOrder?'<span class="bg-orange-100 text-orange-500 text-[10px] font-bold px-2 py-0.5 rounded ml-2">Đang sửa đơn</span>':''}</div>${mobile?'<button type="button" data-cart-close class="w-8 h-8 rounded-full bg-gray-50 flex items-center justify-center text-gray-500 hover:bg-gray-100" aria-label="Đóng"><i class="ph-bold ph-x text-sm"></i></button>':''}</div>
    <div class="cart-compact-grid px-4 py-2.5 border-b border-gray-50 text-[10px] font-bold text-gray-400 uppercase tracking-wider shrink-0 bg-gray-50/50"><div class="cart-left"><div class="cart-stt">#</div><div class="cart-name">TÊN SP</div></div><div class="cart-price">Đ.GIÁ</div><div class="cart-qty">SL</div><div class="cart-total">T.TIỀN</div></div>
    <div class="fixed-cart-list px-4 py-2 no-scrollbar">${cartRows(state)}</div>
    <div class="fixed-cart-footer px-5 py-4"><div class="flex justify-between items-end mb-4"><div><p class="text-[12px] font-medium text-gray-400 mb-0.5">Số lượng</p><p class="text-[15px] font-bold text-gray-900"><span>${lineCount}</span> mã · <span>${totals.totalQty}</span> sản phẩm</p></div><div class="text-right"><p class="text-[12px] font-medium text-gray-400 mb-0.5">Tổng thanh toán</p><p class="text-[26px] font-extrabold text-primary leading-none">${money(totals.total)}</p></div></div>${cartActions(state)}</div>
  </section>`;
}

function customerModal(state){
  const options=[{id:'le',ten:'Khách lẻ'},...state.customers.filter(c=>c&&c.active!==false)];
  return `<div class="fixed-customer-modal" data-customer-modal data-open="${state.customerOpen?'true':'false'}"><button class="fixed-customer-backdrop" type="button" data-customer-close aria-label="Đóng"></button><section class="fixed-customer-box"><div class="flex justify-between items-center mb-4 border-b border-gray-100 pb-3"><h3 class="text-[16px] font-bold text-gray-900 flex items-center gap-2"><i class="ph-fill ph-users text-primary"></i>Chọn khách hàng</h3><button type="button" data-customer-close class="w-8 h-8 rounded-full bg-gray-50 flex items-center justify-center text-gray-500"><i class="ph-bold ph-x text-sm"></i></button></div><div class="fixed-customer-list no-scrollbar">${options.map(c=>`<button type="button" class="fixed-customer-option" data-customer-pick="${esc(c.id)}" aria-selected="${String(c.id)===String(state.selectedCustomer)}"><span class="w-8 h-8 rounded-full bg-[#f0fdf4] text-primary flex items-center justify-center font-bold text-[11px]">${esc(initials(c.ten||c.name||'KH'))}</span><span class="font-semibold truncate">${esc(c.ten||c.name||'Khách')}</span></button>`).join('')}</div></section></div>`;
}

function clockParts(now=new Date()){
  return {date:now.toLocaleDateString('vi-VN',{weekday:'short',day:'2-digit',month:'2-digit'}),time:now.toLocaleTimeString('vi-VN',{hour:'2-digit',minute:'2-digit'})};
}

export function salesMarkup(input={}){
  const state={products:[],customers:[],cart:{},prices:{},notes:{},lineNos:{},selectedCustomer:'le',group:'Tất cả',search:'',editOrder:null,cartOpen:false,customerOpen:false,permissions:{},...input};
  const canManage=state.permissions?.canManageOrders===true;
  const totals=cartTotals(state.products,state.cart,state.prices);
  const selected=state.customers.find(c=>String(c.id)===String(state.selectedCustomer));
  const selectedCustomerName=selected?.ten||selected?.name||(state.selectedCustomer==='le'?'Chọn khách hàng':'Chọn khách hàng');
  const clock=clockParts();
  return `<section class="fixed-sales-screen" data-screen-id="sales" data-ui-source="TAPHOA_GEMINI_100_SAMPLE_FIXED">
    <div class="fixed-sales-main">
      <header class="fixed-sales-header bg-[#1e293b] px-4 py-3 shrink-0">
        <button type="button" data-customer-open class="flex items-center gap-2 bg-white/10 hover:bg-white/20 transition rounded-full px-4 py-2 border border-white/10 h-[42px] text-left"><i class="ph-fill ph-user text-white/80 text-[15px]"></i><span class="fixed-customer-label text-white text-[13px] font-semibold max-w-[120px] truncate">${esc(selectedCustomerName)}</span><i class="ph ph-caret-down text-white/50 text-xs"></i></button>
        <div class="fixed-sales-clock"><div class="text-white/60 text-[10px]" data-current-date>${esc(clock.date)}</div><div class="text-white font-bold text-[13px]" data-current-time>${esc(clock.time)}</div></div>
        <button type="button" data-cart-open class="bg-primary text-white px-4 py-2 rounded-full flex items-center gap-2 shadow-md h-[42px]"><span class="bg-white text-primary text-[11px] font-extrabold min-w-[34px] h-7 px-2 rounded-full flex items-center justify-center">${totals.totalQty}</span><span class="font-extrabold text-[12px] tracking-wide whitespace-nowrap">${money(totals.total)}</span></button>
      </header>
      <div class="bg-white px-4 py-3 shrink-0 shadow-sm z-10 relative"><div class="relative"><i class="ph ph-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-lg"></i><input type="text" data-sales-search value="${esc(state.search)}" placeholder="Tìm tên, mã sản phẩm..." class="w-full bg-gray-50 border border-gray-100 rounded-xl pl-10 pr-4 py-2.5 text-[13px] text-gray-900 focus:border-primary transition"></div><div class="fixed-group-rail flex gap-2 mt-3 overflow-x-auto no-scrollbar">${groupButtons(state.products,state.group)}</div></div>
      <main class="flex-1 min-h-0 overflow-y-auto no-scrollbar bg-gray-100 px-4 py-3"><div class="fixed-product-list flex flex-col gap-2 pb-20">${productRows(state)}</div></main>
    </div>
    ${canManage?`<aside class="fixed-cart-desktop">${cartPanel(state)}</aside><div class="fixed-cart-mobile-wrap" data-cart-overlay data-open="${state.cartOpen?'true':'false'}"><button class="fixed-cart-backdrop" type="button" data-cart-close aria-label="Đóng"></button>${cartPanel(state,{mobile:true})}</div>${customerModal(state)}`:''}
  </section>`;
}

function deriveInitial(context){
  const data=context.getData?.()||context.data||{};const permissions=data.permissions||{};const canManage=permissions.canManageOrders===true;const editOrder=canManage?(context.consumeEditOrder?.()||context.editOrder||null):null;
  const state={products:data.products||[],customers:data.customers||[],permissions,cart:{},prices:{},notes:{},lineNos:{},selectedCustomer:'le',group:'Tất cả',search:'',editOrder,cartOpen:Boolean(editOrder),customerOpen:false};
  if(editOrder){state.selectedCustomer=editOrder.maKH||'le';for(const item of editOrder.items||[]){const id=item.maSP||item.product_id;if(!id)continue;state.cart[id]=Number(item.sl||item.qty)||0;state.prices[id]=Number(item.gia||item.unit_price)||0;state.notes[id]=item.ghiChu||item.note||'';state.lineNos[id]=Number(item.lineNo||item.line_no)||0;}}
  return state;
}

export async function mount(context){
  const root=context.root;let state=deriveInitial(context);let busy=false;let clockTimer=null;
  const canManage=()=>state.permissions?.canManageOrders===true;
  const updateClock=()=>{const c=clockParts(),d=root.querySelector('[data-current-date]'),t=root.querySelector('[data-current-time]');if(d)d.textContent=c.date;if(t)t.textContent=c.time;};
  const render=()=>{root.innerHTML=salesMarkup(state);updateClock();};
  const unsubscribeData=context.subscribeData?.(({state:next,changed})=>{if(!changed.some(x=>x==='bootstrap'||x==='products'||x==='customers'))return;state={...state,products:next.products||[],customers:next.customers||[],permissions:next.permissions||state.permissions};render();});
  const setQty=(id,value)=>{if(!canManage())return;state={...state,cart:{...state.cart,[id]:Math.max(0,Math.min(999,Number(value)||0))}};render();};
  const submit=async status=>{if(!canManage()||busy)return;const totals=cartTotals(state.products,state.cart,state.prices);if(!totals.totalQty){context.system?.toast('Chưa có sản phẩm!');return;}busy=true;try{const editStatus=state.editOrder?.trangThai||state.editOrder?.status||status;await context.business.saveOrder(buildOrderDraft({customerId:state.selectedCustomer,status:state.editOrder?editStatus:status,cart:state.cart,prices:state.prices,lineNos:state.lineNos,notes:state.notes,products:state.products,editOrderId:state.editOrder?.id||''}));await context.refresh?.(['orders','debt']);state={...state,cart:{},prices:{},notes:{},lineNos:{},editOrder:null,cartOpen:false};render();}catch(e){context.system?.toast(e?.message||'Không thực hiện được');}finally{busy=false;}};
  const onClick=event=>{
    const group=event.target.closest('[data-group]');if(group){state={...state,group:group.dataset.group};render();return;}
    if(!canManage())return;
    if(event.target.closest('[data-customer-open]')){state={...state,customerOpen:true};render();return;}
    if(event.target.closest('[data-customer-close]')){state={...state,customerOpen:false};render();return;}
    const customer=event.target.closest('[data-customer-pick]');if(customer){state={...state,selectedCustomer:customer.dataset.customerPick,customerOpen:false};render();return;}
    if(event.target.closest('[data-cart-open]')){state={...state,cartOpen:true};render();return;}
    if(event.target.closest('[data-cart-close]')){state={...state,cartOpen:false};render();return;}
    const qtyBox=event.target.closest('[data-qty-id]'),qtyAction=event.target.closest('[data-qty-action]');if(qtyBox&&qtyAction){const id=qtyBox.dataset.qtyId,current=Number(state.cart[id]||0);setQty(id,current+(qtyAction.dataset.qtyAction==='add'?1:-1));return;}
    const add=event.target.closest('[data-cart-add]');if(add){setQty(add.dataset.cartAdd,Number(state.cart[add.dataset.cartAdd]||0)+1);return;}
    const dec=event.target.closest('[data-cart-dec]');if(dec){setQty(dec.dataset.cartDec,Number(state.cart[dec.dataset.cartDec]||0)-1);return;}
    const action=event.target.closest('[data-sales-action]')?.dataset.salesAction;if(action==='clear'){state={...state,cart:{},prices:{},notes:{},lineNos:{},cartOpen:false};render();}else if(action==='pending')submit('pending');else if(action==='done')submit('done');else if(action==='update')submit(state.editOrder?.trangThai||'pending');else if(action==='cancel-edit'){state={...state,cart:{},prices:{},notes:{},lineNos:{},editOrder:null,cartOpen:false};render();}
  };
  const onInput=event=>{if(event.target.matches('[data-sales-search]')){state={...state,search:event.target.value};applySalesSearchVisibility(root,state);return;}if(!canManage())return;const qtyId=event.target.dataset.qtyInput;if(qtyId){state={...state,cart:{...state.cart,[qtyId]:Math.max(0,Math.min(999,Number(String(event.target.value).replace(/\D/g,''))||0))}};}};
  const onChange=event=>{if(event.target.dataset.qtyInput)render();};
  root.addEventListener('click',onClick);root.addEventListener('input',onInput);root.addEventListener('change',onChange);render();clockTimer=setInterval(updateClock,30000);
  return()=>{unsubscribeData?.();if(clockTimer)clearInterval(clockTimer);root.removeEventListener('click',onClick);root.removeEventListener('input',onInput);root.removeEventListener('change',onChange);};
}
