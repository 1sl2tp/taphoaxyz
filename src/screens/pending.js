import {openPrintDocument} from '../core/print.js';
import {shareReceiptImage} from '../core/share-receipt.js';
const money=n=>Number(n||0).toLocaleString('vi-VN');
const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const fmtDate=value=>{const d=new Date(value);return Number.isNaN(d.getTime())?'':d.toLocaleString('vi-VN',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});};
const itemName=item=>item.tenSP||item.ten||item.product_name||'';
const itemQty=item=>Number(item.sl??item.qty)||0;
const itemPrice=item=>Number(item.gia??item.unit_price)||0;
const itemCost=item=>Number(item.von??item.unit_cost)||0;
const itemSource=item=>item.nhom||item.product_group||'Khác';

export function pendingOrders(orders=[]){
  return orders.filter(order=>(order.trangThai||order.status)==='pending')
    .sort((a,b)=>new Date(b.ngay||b.ordered_at)-new Date(a.ngay||a.ordered_at));
}

export function summarizePendingBySource(orders=[]){
  const map=new Map();const total={qty:0,cost:0,revenue:0,profit:0};
  for(const order of orders){
    for(const item of order.items||[]){
      const source=itemSource(item),qty=itemQty(item),revenue=itemPrice(item)*qty,cost=itemCost(item)*qty;
      const row=map.get(source)||{source,qty:0,cost:0,revenue:0,profit:0,orders:new Set()};
      row.qty+=qty;row.cost+=cost;row.revenue+=revenue;row.profit+=revenue-cost;row.orders.add(order.id);map.set(source,row);
      total.qty+=qty;total.cost+=cost;total.revenue+=revenue;total.profit+=revenue-cost;
    }
  }
  return {rows:[...map.values()].sort((a,b)=>b.revenue-a.revenue||a.source.localeCompare(b.source,'vi')).map(row=>({...row,orderCount:row.orders.size,orders:undefined})),total};
}

function sourceSummaryMarkup(orders,canViewCost){
  const summary=summarizePendingBySource(orders);
  if(!summary.rows.length)return '<div class="pending-empty-small">Không có đơn tạm</div>';
  if(!canViewCost){
    return `<div class="pending-source-grid is-customer pending-source-head"><span>NGUỒN</span><span>SL</span><span>THU</span></div>
      ${summary.rows.map(row=>`<button class="pending-source-grid is-customer pending-source-row" type="button" data-source-open="${esc(row.source)}"><span>${esc(row.source)}</span><span>${row.qty}</span><span>${money(row.revenue)}</span></button>`).join('')}
      <div class="pending-source-grid is-customer pending-source-total"><span>TỔNG (${orders.length} đơn)</span><span>${summary.total.qty}</span><span>${money(summary.total.revenue)}</span></div>`;
  }
  return `<div class="pending-source-grid pending-source-head"><span>NGUỒN</span><span>SL</span><span>CHI</span><span>THU</span><span>LÃI</span></div>
    ${summary.rows.map(row=>`<button class="pending-source-grid pending-source-row" type="button" data-source-open="${esc(row.source)}"><span>${esc(row.source)}</span><span>${row.qty}</span><span>${money(row.cost)}</span><span>${money(row.revenue)}</span><span>${money(row.profit)}</span></button>`).join('')}
    <div class="pending-source-grid pending-source-total"><span>TỔNG (${orders.length} đơn)</span><span>${summary.total.qty}</span><span>${money(summary.total.cost)}</span><span>${money(summary.total.revenue)}</span><span>${money(summary.total.profit)}</span></div>`;
}

function orderCard(order,index,canViewCost){
  const items=order.items||[];const qty=items.reduce((sum,item)=>sum+itemQty(item),0);const profit=Number(order.loiNhuan??(Number(order.tongTien||0)-Number(order.tongVon||0)))||0;
  const preview=items.slice(0,3).map(item=>`<span>${esc(itemName(item).length>12?`${itemName(item).slice(0,12)}…`:itemName(item))} ×${itemQty(item)}</span>`).join('');
  return `<button class="pending-order-card" type="button" data-order-open="${esc(order.id)}">
    <div class="pending-order-top"><span><small>#${index+1}</small><b>${esc(order.id)}</b><em>⏳ Chờ</em></span><strong>${money(order.tongTien)}</strong></div>
    <div class="pending-order-mid"><span><b>${esc(order.tenKH)}</b><small>${esc(fmtDate(order.ngay||order.ordered_at))} · ${items.length||Number(order.tongMa)||0} mã (${qty||Number(order.tongSL)||0} sp)</small></span>${canViewCost?`<strong>+${money(profit)}</strong>`:''}</div>
    <div class="pending-order-preview">${preview}${items.length>3?`<small>+${items.length-3} sp</small>`:''}</div>
  </button>`;
}

function sourceDetailMarkup(source,orders){
  const sourceOrders=orders.filter(order=>(order.items||[]).some(item=>itemSource(item)===source));
  const rows=sourceOrders.flatMap(order=>(order.items||[]).filter(item=>itemSource(item)===source).map(item=>({customer:order.tenKH,name:itemName(item),qty:itemQty(item),note:item.ghiChu||item.note||''})));
  const total=rows.reduce((sum,row)=>sum+row.qty,0);
  return `<div class="pending-overlay" data-source-detail>
    <button class="pending-backdrop" type="button" data-source-close aria-label="Đóng"></button>
    <section class="pending-source-panel">
      <header><strong>📦 Nguồn ${esc(source)}</strong><div><button type="button" data-source-action="print">In</button><button type="button" data-source-action="total">Tổng SP</button><button type="button" data-source-close>✕</button></div></header>
      <div class="pending-source-meta">${new Date().toLocaleDateString('vi-VN')} · ${sourceOrders.length} đơn · ${total} sản phẩm</div>
      <div class="pending-source-detail-head"><span>#</span><span>TÊN HÀNG</span><span>KHÁCH</span><span>SL</span></div>
      <div class="pending-source-detail-lines">${rows.map((row,index)=>`<div><span>${index+1}.</span><span><b>${esc(row.name)}</b>${row.note?`<small>${esc(row.note)}</small>`:''}</span><span>${esc(row.customer)}</span><strong>×${row.qty}</strong></div>`).join('')}</div>
      <div class="pending-source-detail-total">TỔNG: ${total} sp</div>
    </section>
  </div>`;
}

function orderDetailMarkup(order,{canManageOrders=false}={}){
  const items=order.items||[];const qty=items.reduce((sum,item)=>sum+itemQty(item),0);
  return `<div class="pending-overlay" data-order-detail>
    <button class="pending-backdrop" type="button" data-order-close aria-label="Đóng"></button>
    <section class="pending-detail-panel">
      <header><strong>${esc(order.id)}</strong><span>⏳ Chờ duyệt</span><button type="button" data-order-close>✕</button></header>
      <div class="classic-receipt" data-receipt-capture>
        <div class="pending-detail-meta"><b>KH: ${esc(order.tenKH)}</b> · ${esc(order.id)} · ${esc(fmtDate(order.ngay||order.ordered_at))}</div>
        <div class="pending-detail-head classic-detail-table"><span>#</span><span>TÊN</span><span>SL</span><span>Đ.GIÁ</span><span>T.TIỀN</span></div>
        <div class="pending-detail-lines classic-detail-table">${items.map((item,index)=>`<div><span>${index+1}.</span><span>${esc(itemName(item))}${item.ghiChu||item.note?`<small>${esc(item.ghiChu||item.note)}</small>`:''}</span><span>${itemQty(item)}</span><span>${money(itemPrice(item))}</span><strong>${money(itemPrice(item)*itemQty(item))}</strong></div>`).join('')}</div>
        <div class="pending-detail-total"><b>Tổng ${qty} SP</b><strong>${money(order.tongTien)}</strong></div>
      </div>
      <footer>${canManageOrders?'<button type="button" data-order-action="edit">Sửa</button><button type="button" data-order-action="deliver">Duyệt</button>':''}<button class="classic-share-button" type="button" data-receipt-share>🖼️ Chia sẻ ảnh</button><button type="button" data-order-action="print">In</button>${canManageOrders?'<button type="button" data-order-action="delete">Xoá</button>':''}</footer>
    </section>
  </div>`;
}

function pendingPrintBody(data){return `<main class="print-sheet"><div class="print-head">${esc(data?.title||'')}</div><div class="print-meta">${esc(data?.date||'')}</div>${(data?.rows||[]).map((row,index)=>`<div class="print-row"><span>${index+1}. ${esc(row.name||row.tenHang||'')}${row.customer?` <small>(${esc(row.customer)})</small>`:''}</span><strong>${row.qty??row.sl??0}</strong></div>`).join('')}</main>`;}

function printMarkup(data){
  if(!data)return'';return `<div class="pending-overlay pending-print-overlay"><button class="pending-backdrop" type="button" data-print-close aria-label="Đóng"></button><section class="pending-print-panel">
    <header><button type="button" data-print-close>✕</button><strong>${esc(data.title||'')}</strong><button type="button" data-print-now>In</button></header>
    <div class="pending-print-date">${esc(data.date||'')}</div>
    <div class="pending-print-lines">${(data.rows||[]).map((row,index)=>`<div><span>${index+1}. ${esc(row.name||row.tenHang||'')}${row.customer?` <small>(${esc(row.customer)})</small>`:''}</span><strong>${row.qty??row.sl??0}</strong></div>`).join('')}</div>
  </section></div>`;
}

function printForOrder(order){return {title:`ĐƠN TẠM ${order.id}`,date:fmtDate(order.ngay||order.ordered_at),rows:(order.items||[]).map(item=>({name:itemName(item),qty:itemQty(item),customer:order.tenKH}))};}
function printForSource(source,orders,totalOnly=false){
  const rows=orders.flatMap(order=>(order.items||[]).filter(item=>itemSource(item)===source).map(item=>({name:itemName(item),qty:itemQty(item),customer:order.tenKH})));
  if(!totalOnly)return {title:`ĐƠN TẠM: ${source.toUpperCase()}`,date:new Date().toLocaleDateString('vi-VN'),rows};
  const map=new Map();for(const row of rows)map.set(row.name,(map.get(row.name)||0)+row.qty);
  return {title:`TỔNG SP: ${source.toUpperCase()}`,date:new Date().toLocaleDateString('vi-VN'),rows:[...map].map(([name,qty])=>({name,qty}))};
}

export function pendingMarkup({orders=[],selectedSource=null,selectedOrder=null,printData=null,permissions={}}={}){
  const list=pendingOrders(orders);const canManageOrders=permissions.canManageOrders===true;const canViewCost=permissions.canViewCost===true;
  return `<section class="pending-screen" data-screen-id="pending">
    <section class="pending-summary">
      <header><h2>📝 Tổng hợp đơn tạm</h2>${canManageOrders&&list.length?'<button type="button" data-delete-all>🗑️ Xoá tất cả</button>':''}</header>
      ${sourceSummaryMarkup(list,canViewCost)}
    </section>
    <section class="pending-list">${list.map((order,index)=>orderCard(order,index,canViewCost)).join('')||'<div class="pending-empty">Không có đơn tạm</div>'}</section>
    ${selectedSource?sourceDetailMarkup(selectedSource,list):''}${selectedOrder?orderDetailMarkup(selectedOrder,{canManageOrders}):''}${printMarkup(printData)}
  </section>`;
}

export async function mount(context){
  const root=context.root;const data=()=>context.getData?.()||context.data||{};let busy=false;let state={orders:data().orders||[],permissions:data().permissions||{},selectedSource:null,selectedOrder:null,printData:null};
  const canManage=()=>state.permissions?.canManageOrders===true;
  const render=()=>{const current=data();state={...state,orders:current.orders||state.orders,permissions:current.permissions||state.permissions};root.innerHTML=pendingMarkup(state);};
  const unsubscribeData=context.subscribeData?.(({changed})=>{if(changed.some(x=>x==='bootstrap'||x==='orders'||x==='products'||x==='customers'))render();});
  const findOrder=id=>state.orders.find(order=>String(order.id)===String(id));
  const refresh=async domains=>{await context.refresh?.(domains);const current=data();state={...state,orders:current.orders||state.orders,permissions:current.permissions||state.permissions};};
  const onClick=async event=>{
    const source=event.target.closest('[data-source-open]');if(source){state={...state,selectedSource:source.dataset.sourceOpen};render();return;}
    const order=event.target.closest('[data-order-open]');if(order){state={...state,selectedOrder:findOrder(order.dataset.orderOpen)};render();return;}
    if(event.target.closest('[data-source-close]')){state={...state,selectedSource:null};render();return;}
    if(event.target.closest('[data-order-close]')){state={...state,selectedOrder:null};render();return;}
    if(event.target.closest('[data-print-close]')){state={...state,printData:null};render();return;}
    if(event.target.closest('[data-print-now]')){if(state.printData)openPrintDocument({title:state.printData.title,body:pendingPrintBody(state.printData)});return;}
    if(event.target.closest('[data-receipt-share]')&&state.selectedOrder){
      try{const receipt=root.querySelector('[data-receipt-capture]');await shareReceiptImage(receipt,{fileName:`don-${state.selectedOrder.id}.jpg`,title:`Đơn hàng ${state.selectedOrder.id}`,text:`taphoa.xyz - ${state.selectedOrder.tenKH||''}`});}
      catch(error){context.system?.toast(error?.message||'Không chia sẻ được ảnh');}return;
    }
    if(event.target.closest('[data-delete-all]')){
      if(!canManage())return;const ids=pendingOrders(state.orders).map(order=>order.id);if(busy||!ids.length||!window.confirm(`Xoá tất cả ${ids.length} đơn tạm?`))return;busy=true;
      try{await context.business.batchOrders('delete_pending',ids);await refresh(['orders']);state={...state,selectedOrder:null,selectedSource:null};render();}
      catch(error){context.system?.toast(error?.message||'Không thực hiện được');}finally{busy=false;}return;
    }
    const sourceAction=event.target.closest('[data-source-action]')?.dataset.sourceAction;if(sourceAction&&state.selectedSource){state={...state,printData:printForSource(state.selectedSource,pendingOrders(state.orders),sourceAction==='total'),selectedSource:null};render();return;}
    const action=event.target.closest('[data-order-action]')?.dataset.orderAction;if(!action||!state.selectedOrder)return;
    const current=state.selectedOrder;
    if(action==='print'){state={...state,printData:printForOrder(current),selectedOrder:null};render();return;}
    if(!canManage())return;
    if(action==='edit'){
      try{const detail=await context.business.orderDetail(current.id);context.editOrder?.(detail?.order||current);context.navigate?.('sales');}
      catch(error){context.system?.toast(error?.message||'Không thực hiện được');}return;
    }
    if(action==='deliver'){
      if(busy)return;busy=true;try{await context.business.deliverOrder(current.id);await refresh(['orders','debt']);state={...state,selectedOrder:null};render();}
      catch(error){context.system?.toast(error?.message||'Không thực hiện được');}finally{busy=false;}return;
    }
    if(action==='delete'){
      if(busy||!window.confirm(`Xoá đơn ${current.id}?`))return;busy=true;
      try{await context.business.deletePending(current.id);await refresh(['orders']);state={...state,selectedOrder:null};render();}
      catch(error){context.system?.toast(error?.message||'Không thực hiện được');}finally{busy=false;}
    }
  };
  root.addEventListener('click',onClick);render();return()=>{unsubscribeData?.();root.removeEventListener('click',onClick);};
}
