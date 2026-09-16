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
  return {maKH:String(customerId||''),status:String(status||'pending'),ghiChu:String(note||''),editOrderId:String(editOrderId||''),items};
}

function customerOptions(customers=[]){
  return [`<option value="Khách lẻ"></option>`,...customers.map(c=>`<option value="${esc(c.ten)}"></option>`)].join('');
}

function groupButtons(products=[],active='Tất cả'){
  const groups=['Tất cả',...new Set(products.map(p=>p.nhom).filter(Boolean))];
  return groups.map(g=>`<button type="button" class="sales-group" data-group="${esc(g)}" aria-pressed="${g===active}">${esc(g)}</button>`).join('');
}

function productRows(state){
  const rows=filterProducts(state.products,'',state.group);
  const visibleIds=new Set(filterProducts(state.products,state.search,state.group).map(p=>String(p.id)));
  if(!rows.length)return `<div class="sales-empty" data-sales-empty>Không tìm thấy sản phẩm</div>`;
  const canManage=state.permissions?.canManageOrders===true;
  const canViewCost=state.permissions?.canViewCost===true;
  const rowMarkup=rows.map(p=>{
    const qty=Number(state.cart[p.id]||0),price=Number(state.prices[p.id]??p.gia)||0;
    const cost=canViewCost&&p.von!==undefined&&p.von!==null?`<span class="sales-price-item sales-price-cost"><small>Vốn</small><span class="sales-cost">${money(p.von)}</span></span>`:'';
    const sale=canManage?`<label class="sales-price-item sales-price-sale"><small>Bán</small><input class="sales-price-input" data-price-id="${esc(p.id)}" inputmode="numeric" value="${esc(price)}" aria-label="Giá bán ${esc(p.ten)}"></label>`:`<span class="sales-price-item sales-price-sale"><small>Giá</small><span class="sales-price-readonly">${money(price)}</span></span>`;
    const unit=p.donVi?`<span class="sales-unit">${esc(p.donVi)}</span>`:'';
    return `<article class="sales-product-row ui-row" data-product-row="${esc(p.id)}" ${visibleIds.has(String(p.id))?'':'hidden'}>
      <div class="sales-product-info">
        <div class="sales-product-name">${esc(p.ten)}</div>
        <div class="sales-product-meta"><div class="sales-price-stack">${cost}${sale}</div>${unit}</div>
      </div>
      ${canManage?`<div class="sales-qty" data-qty-id="${esc(p.id)}">
        <button type="button" data-qty-action="dec" aria-label="Giảm số lượng ${esc(p.ten)}" ${qty<=0?'disabled':''}>−</button>
        <input class="sales-qty-value" data-qty-input="${esc(p.id)}" inputmode="numeric" value="${qty}" aria-label="Số lượng ${esc(p.ten)}">
        <button type="button" data-qty-action="add" aria-label="Tăng số lượng ${esc(p.ten)}">+</button>
      </div>`:''}
    </article>`;
  }).join('');
  return `${rowMarkup}<div class="sales-empty" data-sales-empty ${visibleIds.size?'hidden':''}>Không tìm thấy sản phẩm</div>`;
}

function applySalesSearchVisibility(root,state){
  const visibleIds=new Set(filterProducts(state.products,state.search,state.group).map(p=>String(p.id)));
  let visibleCount=0;
  for(const row of root.querySelectorAll('[data-product-row]')){
    const visible=visibleIds.has(String(row.dataset.productRow));
    row.hidden=!visible;
    if(visible)visibleCount+=1;
  }
  const empty=root.querySelector('[data-sales-empty]');
  if(empty)empty.hidden=visibleCount>0;
  const clearButton=root.querySelector('[data-search-clear]');
  if(clearButton)clearButton.hidden=!state.search;
}

function cartBody(state){
  const selected=state.products.filter(p=>Number(state.cart[p.id]||0)>0);
  const totals=cartTotals(state.products,state.cart,state.prices);
  if(!selected.length)return `<div class="sales-cart-empty">Chưa có sản phẩm</div>`;
  return `<div class="sales-cart-table-head ui-table-head"><span>Tên</span><span>Đ.Giá</span><span>SL</span><span>T.Tiền</span></div>
  <div class="sales-cart-lines ui-table">${selected.map(p=>{
    const qty=Number(state.cart[p.id]||0),price=Number(state.prices[p.id]??p.gia)||0;
    return `<div class="sales-cart-line ui-row" data-cart-line="${esc(p.id)}">
      <div class="sales-cart-name"><b>${esc(p.ten)}</b><input data-note-id="${esc(p.id)}" value="${esc(state.notes[p.id]||'')}" placeholder="Ghi chú"></div>
      <input class="sales-cart-price" data-price-id="${esc(p.id)}" inputmode="numeric" value="${esc(price)}" aria-label="Đơn giá ${esc(p.ten)}">
      <div class="sales-cart-qty"><button type="button" data-cart-dec="${esc(p.id)}" aria-label="Giảm ${esc(p.ten)}">−</button><input data-qty-input="${esc(p.id)}" inputmode="numeric" value="${qty}" aria-label="Số lượng ${esc(p.ten)}"><button type="button" data-cart-add="${esc(p.id)}" aria-label="Tăng ${esc(p.ten)}">+</button></div>
      <strong>${money(price*qty)}</strong>
    </div>`;
  }).join('')}</div>
  <div class="sales-cart-total sales-cart-summary ui-summary"><span><small>Tổng SL</small><b>${totals.totalQty}</b></span><span><small>Tổng tiền</small><b>${money(totals.total)}</b></span></div>`;
}

function cartActions(state){
  if(state.editOrder)return `<div class="sales-cart-actions ui-action-group"><button class="ui-action ui-action-secondary" type="button" data-sales-action="cancel-edit">Huỷ</button><button class="ui-action ui-action-primary" type="button" data-sales-action="update">Cập nhật</button></div>`;
  return `<div class="sales-cart-actions ui-action-group"><button class="ui-action ui-action-danger" type="button" data-sales-action="clear">Xoá</button><button class="ui-action ui-action-secondary" type="button" data-sales-action="pending">Đặt</button><button class="ui-action ui-action-primary" type="button" data-sales-action="done">Bán</button></div>`;
}

function cartPanel(state,{mobile=false}={}){
  const totals=cartTotals(state.products,state.cart,state.prices);
  return `<section class="sales-cart-panel ui-popup-l1 ${mobile?'sales-cart-mobile':''}">
    <header class="sales-cart-head ui-popup-header"><div class="sales-cart-header-copy"><strong>Giỏ hàng</strong><span>${totals.totalQty?`${totals.totalQty} SP`:'Chưa có hàng'}</span></div>${mobile?'<button class="ui-icon-button" type="button" data-cart-close aria-label="Đóng giỏ hàng"></button>':''}</header>
    <div class="sales-cart-body">${cartBody(state)}</div>
    ${totals.totalQty?cartActions(state):''}
  </section>`;
}

export function salesMarkup(input={}){
  const state={products:[],customers:[],cart:{},prices:{},notes:{},lineNos:{},selectedCustomer:'le',group:'Tất cả',search:'',editOrder:null,cartOpen:false,permissions:{},...input};
  const canManage=state.permissions?.canManageOrders===true;
  const totals=cartTotals(state.products,state.cart,state.prices);
  const selectedCustomerName=state.selectedCustomer==='le'?'Khách lẻ':(state.customers.find(c=>c.id===state.selectedCustomer)?.ten||'');
  return `<section class="sales-screen ui-main" data-screen-id="sales">
    <header class="sales-pinned-head sales-main-context ui-context ui-toolbar">
      ${canManage?`<div class="sales-customer-row sales-customer-bar">
        <div class="sales-customer-field"><input class="sales-customer-input" list="salesCustomerList" value="${esc(selectedCustomerName)}" placeholder="Chọn khách..." aria-label="Chọn khách"><datalist id="salesCustomerList">${customerOptions(state.customers)}</datalist></div>
        <button class="sales-cart-quick ui-action ui-action-secondary ${totals.totalQty?'is-active':''}" type="button" data-cart-open><span>Giỏ</span><strong>${totals.totalQty?`${totals.totalQty} SP · ${money(totals.total)}`:'Trống'}</strong></button>
      </div>`:''}
      <div class="sales-search-row sales-search-tools"><input data-sales-search value="${esc(state.search)}" placeholder="Tìm sản phẩm..."><button class="ui-icon-button" type="button" data-search-clear aria-label="Xóa tìm kiếm" ${state.search?'':'hidden'}></button></div>
      <div class="sales-groups sales-group-rail">${groupButtons(state.products,state.group)}</div>
    </header>
    <div class="sales-workspace">
      <section class="sales-products sales-products-region ui-zone-data"><div class="sales-product-list ui-table">${productRows(state)}</div></section>
      ${canManage?`<aside class="sales-cart-desktop" aria-hidden="true">${cartPanel(state)}</aside>`:''}
    </div>
    ${canManage?`<div class="sales-cart-overlay" data-cart-overlay aria-hidden="${state.cartOpen?'false':'true'}"><button class="sales-cart-backdrop" type="button" data-cart-close aria-label="Đóng"></button>${cartPanel(state,{mobile:true})}</div>`:''}
  </section>`;
}

function deriveInitial(context){
  const data=context.getData?.()||context.data||{};
  const permissions=data.permissions||{};
  const canManage=permissions.canManageOrders===true;
  const editOrder=canManage?(context.consumeEditOrder?.()||context.editOrder||null):null;
  const state={products:data.products||[],customers:data.customers||[],permissions,cart:{},prices:{},notes:{},lineNos:{},selectedCustomer:'le',group:'Tất cả',search:'',editOrder,cartOpen:Boolean(editOrder)};
  if(editOrder){
    state.selectedCustomer=editOrder.maKH||'le';
    for(const item of editOrder.items||[]){
      const id=item.maSP||item.product_id;if(!id)continue;
      state.cart[id]=Number(item.sl||item.qty)||0;state.prices[id]=Number(item.gia||item.unit_price)||0;state.notes[id]=item.ghiChu||item.note||'';state.lineNos[id]=Number(item.lineNo||item.line_no)||0;
    }
  }
  return state;
}

export async function mount(context){
  const root=context.root;let state=deriveInitial(context);let busy=false;
  const canManage=()=>state.permissions?.canManageOrders===true;
  const render=()=>{root.innerHTML=salesMarkup(state);};
  const unsubscribeData=context.subscribeData?.(({state:next,changed})=>{
    if(!changed.some(x=>x==='bootstrap'||x==='products'||x==='customers'))return;
    state={...state,products:next.products||[],customers:next.customers||[],permissions:next.permissions||state.permissions};
    render();
  });
  const customerIdByName=name=>name==='Khách lẻ'?'le':(state.customers.find(c=>c.ten===name)?.id||state.selectedCustomer);
  const setQty=(id,value)=>{if(!canManage())return;state={...state,cart:{...state.cart,[id]:Math.max(0,Math.min(999,Number(value)||0))}};render();};
  const submit=async status=>{
    if(!canManage()||busy)return;const totals=cartTotals(state.products,state.cart,state.prices);if(!totals.totalQty){context.system?.toast('Chưa có sản phẩm!');return;}
    busy=true;
    try{
      const editStatus=state.editOrder?.trangThai||state.editOrder?.status||status;
      await context.business.saveOrder(buildOrderDraft({customerId:state.selectedCustomer,status:state.editOrder?editStatus:status,cart:state.cart,prices:state.prices,lineNos:state.lineNos,notes:state.notes,products:state.products,editOrderId:state.editOrder?.id||''}));
      await context.refresh?.(['orders','debt']);
      state={...state,cart:{},prices:{},notes:{},lineNos:{},editOrder:null,cartOpen:false};render();
    }catch(e){context.system?.toast(e?.message||'Không thực hiện được');}finally{busy=false;}
  };
  const onClick=event=>{
    const group=event.target.closest('[data-group]');if(group){state={...state,group:group.dataset.group};render();return;}
    if(event.target.closest('[data-search-clear]')){state={...state,search:''};render();return;}
    if(!canManage())return;
    if(event.target.closest('[data-cart-open]')){state={...state,cartOpen:true};render();return;}
    if(event.target.closest('[data-cart-close]')){state={...state,cartOpen:false};render();return;}
    const qtyBox=event.target.closest('[data-qty-id]');const qtyAction=event.target.closest('[data-qty-action]');
    if(qtyBox&&qtyAction){const id=qtyBox.dataset.qtyId,current=Number(state.cart[id]||0);setQty(id,current+(qtyAction.dataset.qtyAction==='add'?1:-1));return;}
    const add=event.target.closest('[data-cart-add]');if(add){const id=add.dataset.cartAdd;setQty(id,Number(state.cart[id]||0)+1);return;}
    const dec=event.target.closest('[data-cart-dec]');if(dec){const id=dec.dataset.cartDec;setQty(id,Number(state.cart[id]||0)-1);return;}
    const action=event.target.closest('[data-sales-action]')?.dataset.salesAction;
    if(action==='clear'){state={...state,cart:{},prices:{},notes:{},lineNos:{},cartOpen:false};render();}
    else if(action==='pending')submit('pending');
    else if(action==='done')submit('done');
    else if(action==='update')submit(state.editOrder?.trangThai||'pending');
    else if(action==='cancel-edit'){state={...state,cart:{},prices:{},notes:{},lineNos:{},editOrder:null,cartOpen:false};render();}
  };
  const onInput=event=>{
    if(event.target.matches('[data-sales-search]')){
      state={...state,search:event.target.value};
      applySalesSearchVisibility(root,state);
      return;
    }
    if(!canManage())return;
    if(event.target.matches('.sales-customer-input')){state={...state,selectedCustomer:customerIdByName(event.target.value)};return;}
    const priceId=event.target.dataset.priceId;if(priceId){state={...state,prices:{...state.prices,[priceId]:Number(String(event.target.value).replace(/\D/g,''))||0}};return;}
    const qtyId=event.target.dataset.qtyInput;if(qtyId){state={...state,cart:{...state.cart,[qtyId]:Math.max(0,Math.min(999,Number(String(event.target.value).replace(/\D/g,''))||0))}};return;}
    const noteId=event.target.dataset.noteId;if(noteId){state={...state,notes:{...state.notes,[noteId]:event.target.value}};}
  };
  const onChange=event=>{
    if(!canManage())return;
    if(event.target.matches('.sales-customer-input')){state={...state,selectedCustomer:customerIdByName(event.target.value)};render();}
    if(event.target.dataset.qtyInput||event.target.dataset.priceId)render();
  };
  root.addEventListener('click',onClick);root.addEventListener('input',onInput);root.addEventListener('change',onChange);render();
  return ()=>{unsubscribeData?.();root.removeEventListener('click',onClick);root.removeEventListener('input',onInput);root.removeEventListener('change',onChange);};
}
