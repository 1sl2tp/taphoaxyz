import {openPrintDocument} from '../core/print.js';
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

export function pendingActiveSurface(state={}){return state.printData?'print':state.selectedOrder?'detail':state.selectedSource?'source':'list';}

function sourceSummaryMarkup(orders){
  const summary=summarizePendingBySource(orders);
  if(!summary.rows.length)return '<div class="pending-empty-small">Không có đơn tạm</div>';
  return `<div class="pending-source-grid pending-source-head"><span>NGUỒN</span><span>SL</span><span>CHI</span><span>THU</span><span>LÃI</span></div>
    ${summary.rows.map(row=>`<button class="pending-source-grid pending-source-row" type="button" data-source-open="${esc(row.source)}"><span>${esc(row.source)}</span><span>${row.qty}</span><span>${money(row.cost)}</span><span>${money(row.revenue)}</span><span>${money(row.profit)}</span></button>`).join('')}
    <div class="pending-source-grid pending-source-total"><span>TỔNG (${orders.length} đơn)</span><span>${summary.total.qty}</span><span>${money(summary.total.cost)}</span><span>${money(summary.total.revenue)}</span><span>${money(summary.total.profit)}</span></div>`;
}

function orderCard(order,index){
  const items=order.items||[];const qty=items.reduce((sum,item)=>sum+itemQty(item),0);const profit=Number(order.loiNhuan??(Number(order.tongTien||0)-Number(order.tongVon||0)))||0;
  const preview=items.slice(0,3).map(item=>`<span>${esc(itemName(item).length>12?`${itemName(item).slice(0,12)}…`:itemName(item))} ×${itemQty(item)}</span>`).join('');
  return `<button class="pending-order-card" type="button" data-order-open="${esc(order.id)}">
    <div class="pending-order-top"><span><small>#${index+1}</small><b>${esc(order.id)}</b><em>⏳ Chờ</em></span><strong>${money(order.tongTien)}</strong></div>
    <div class="pending-order-mid"><span><b>${esc(order.tenKH)}</b><small>${esc(fmtDate(order.ngay||order.ordered_at))} · ${items.length||Number(order.tongMa)||0} mã (${qty||Number(order.tongSL)||0} sp)</small></span><strong>+${money(profit)}</strong></div>
    <div class="pending-order-preview">${preview}${items.length>3?`<small>+${items.length-3} sp</small>`:''}</div>
  </button>`;
}

function sourceSurface(source,orders){
  const sourceOrders=orders.filter(order=>(order.items||[]).some(item=>itemSource(item)===source));
  const rows=sourceOrders.flatMap(order=>(order.items||[]).filter(item=>itemSource(item)===source).map(item=>({customer:order.tenKH,name:itemName(item),qty:itemQty(item),note:item.ghiChu||item.note||''})));
  const total=rows.reduce((sum,row)=>sum+row.qty,0);
  return `<section class="pending-source-panel pending-source-surface" data-ui-node="surface" data-ui-id="pending-source-surface" data-parent-id="pending-workspace" data-slot-mobile="1" data-slot-wide="2">
    <section class="pending-source-meta" data-ui-node="region" data-ui-id="pending-source-meta" data-parent-id="pending-source-surface">
      <header><strong>📦 Nguồn ${esc(source)}</strong><button type="button" data-source-close aria-label="Quay lại">✕</button></header>
      <div>${new Date().toLocaleDateString('vi-VN')} · ${sourceOrders.length} đơn · ${total} sản phẩm</div>
      <div class="pending-source-detail-head"><span>#</span><span>TÊN HÀNG</span><span>KHÁCH</span><span>SL</span></div>
    </section>
    <div class="pending-source-detail-lines" data-ui-node="region" data-ui-id="pending-source-lines" data-parent-id="pending-source-surface">${rows.map((row,index)=>`<div><span>${index+1}.</span><span><b>${esc(row.name)}</b>${row.note?`<small>${esc(row.note)}</small>`:''}</span><span>${esc(row.customer)}</span><strong>×${row.qty}</strong></div>`).join('')}</div>
    <footer class="pending-source-actions" data-ui-node="region" data-ui-id="pending-source-actions" data-parent-id="pending-source-surface"><strong>TỔNG: ${total} sp</strong><div><button type="button" data-source-action="print">In</button><button type="button" data-source-action="total">Tổng SP</button></div></footer>
  </section>`;
}

function orderDetailSurface(order){
  const items=order.items||[];const qty=items.reduce((sum,item)=>sum+itemQty(item),0);
  return `<section class="pending-detail-panel pending-detail-surface" data-ui-node="surface" data-ui-id="pending-detail-surface" data-parent-id="pending-workspace" data-slot-mobile="1" data-slot-wide="2">
    <section class="pending-detail-meta" data-ui-node="region" data-ui-id="pending-detail-meta" data-parent-id="pending-detail-surface">
      <header><strong>${esc(order.id)}</strong><span>⏳ Chờ duyệt</span><button type="button" data-order-close aria-label="Quay lại">✕</button></header>
      <div><b>KH: ${esc(order.tenKH)}</b> · ${esc(order.id)} · ${esc(fmtDate(order.ngay||order.ordered_at))}</div>
      <div class="pending-detail-head"><span>#</span><span>Tên</span><span>SL</span><span>Đ.Giá</span><span>T.Tiền</span></div>
    </section>
    <div class="pending-detail-lines" data-ui-node="region" data-ui-id="pending-detail-lines" data-parent-id="pending-detail-surface">${items.map((item,index)=>`<div><span>${index+1}.</span><span>${esc(itemName(item))}${item.ghiChu||item.note?`<small>${esc(item.ghiChu||item.note)}</small>`:''}</span><span>${itemQty(item)}</span><span>${money(itemPrice(item))}</span><strong>${money(itemPrice(item)*itemQty(item))}</strong></div>`).join('')}</div>
    <footer class="pending-detail-actions" data-ui-node="region" data-ui-id="pending-detail-actions" data-parent-id="pending-detail-surface"><div class="pending-detail-total"><b>Tổng ${qty} SP</b><strong>${money(order.tongTien)}</strong></div><div class="pending-detail-buttons"><button type="button" data-order-action="edit">Sửa</button><button type="button" data-order-action="deliver">Duyệt</button><button type="button" data-order-action="print">In</button><button type="button" data-order-action="delete">Xoá</button></div></footer>
  </section>`;
}

function pendingPrintBody(data){return `<main class="print-sheet"><div class="print-head">${esc(data?.title||'')}</div><div class="print-meta">${esc(data?.date||'')}</div>${(data?.rows||[]).map((row,index)=>`<div class="print-row"><span>${index+1}. ${esc(row.name||row.tenHang||'')}${row.customer?` <small>(${esc(row.customer)})</small>`:''}</span><strong>${row.qty??row.sl??0}</strong></div>`).join('')}</main>`;}

function printSurface(data){
  return `<section class="pending-print-panel pending-print-surface" data-ui-node="surface" data-ui-id="pending-print-surface" data-parent-id="pending-workspace" data-slot-mobile="1" data-slot-wide="3">
    <section class="pending-print-meta" data-ui-node="region" data-ui-id="pending-print-meta" data-parent-id="pending-print-surface"><header><button type="button" data-print-close aria-label="Quay lại">✕</button><strong>${esc(data.title||'')}</strong></header><div>${esc(data.date||'')}</div></section>
    <div class="pending-print-lines" data-ui-node="region" data-ui-id="pending-print-lines" data-parent-id="pending-print-surface">${(data.rows||[]).map((row,index)=>`<div><span>${index+1}. ${esc(row.name||row.tenHang||'')}${row.customer?` <small>(${esc(row.customer)})</small>`:''}</span><strong>${row.qty??row.sl??0}</strong></div>`).join('')}</div>
    <footer class="pending-print-actions" data-ui-node="region" data-ui-id="pending-print-actions" data-parent-id="pending-print-surface"><button type="button" data-print-now>In</button></footer>
  </section>`;
}

function printForOrder(order){return {title:`ĐƠN TẠM ${order.id}`,date:fmtDate(order.ngay||order.ordered_at),rows:(order.items||[]).map(item=>({name:itemName(item),qty:itemQty(item),customer:order.tenKH}))};}
function printForSource(source,orders,totalOnly=false){
  const rows=orders.flatMap(order=>(order.items||[]).filter(item=>itemSource(item)===source).map(item=>({name:itemName(item),qty:itemQty(item),customer:order.tenKH})));
  if(!totalOnly)return {title:`ĐƠN TẠM: ${source.toUpperCase()}`,date:new Date().toLocaleDateString('vi-VN'),rows};
  const map=new Map();for(const row of rows)map.set(row.name,(map.get(row.name)||0)+row.qty);
  return {title:`TỔNG SP: ${source.toUpperCase()}`,date:new Date().toLocaleDateString('vi-VN'),rows:[...map].map(([name,qty])=>({name,qty}))};
}

export function pendingMarkup(input={}){
  const state={orders:[],selectedSource:null,selectedOrder:null,printData:null,...input};
  const list=pendingOrders(state.orders);
  const hasSecondary=Boolean(state.selectedSource||state.selectedOrder),hasTertiary=Boolean(state.printData);
  return `<section class="pending-screen" data-screen-id="pending" data-active-surface="${pendingActiveSurface(state)}" data-has-secondary="${hasSecondary}" data-has-tertiary="${hasTertiary}">
    <div class="pending-workspace" data-ui-node="workspace" data-ui-id="pending-workspace" data-parent-id="pending-root">
      <section class="pending-list-surface" data-ui-node="surface" data-ui-id="pending-list-surface" data-parent-id="pending-workspace" data-slot-mobile="1" data-slot-wide="1">
        <section class="pending-summary" data-ui-node="region" data-ui-id="pending-summary-region" data-parent-id="pending-list-surface"><header><h2>📝 Tổng hợp đơn tạm</h2>${list.length?'<button type="button" data-delete-all>🗑️ Xoá tất cả</button>':''}</header>${sourceSummaryMarkup(list)}</section>
        <section class="pending-list" data-ui-node="region" data-ui-id="pending-order-list" data-parent-id="pending-list-surface">${list.map(orderCard).join('')||'<div class="pending-empty">Không có đơn tạm</div>'}</section>
      </section>
      ${state.selectedSource?sourceSurface(state.selectedSource,list):''}
      ${state.selectedOrder?orderDetailSurface(state.selectedOrder):''}
      ${state.printData?printSurface(state.printData):''}
    </div>
  </section>`;
}

export async function mount(context){
  const root=context.root;let busy=false;let state={orders:(context.getData?.()||context.data||{}).orders||[],selectedSource:null,selectedOrder:null,printData:null};
  const render=()=>{state={...state,orders:(context.getData?.()||context.data||{}).orders||state.orders};root.innerHTML=pendingMarkup(state);};
  const unsubscribeData=context.subscribeData?.(({changed})=>{if(changed.some(x=>x==='bootstrap'||x==='orders'||x==='products'||x==='customers'))render();});
  const findOrder=id=>state.orders.find(order=>String(order.id)===String(id));
  const refresh=async domains=>{await context.refresh?.(domains);state={...state,orders:(context.getData?.()||context.data||{}).orders||state.orders};};
  const onClick=async event=>{
    const source=event.target.closest('[data-source-open]');if(source){state={...state,selectedSource:source.dataset.sourceOpen,selectedOrder:null,printData:null};render();return;}
    const order=event.target.closest('[data-order-open]');if(order){state={...state,selectedOrder:findOrder(order.dataset.orderOpen),selectedSource:null,printData:null};render();return;}
    if(event.target.closest('[data-source-close]')){state={...state,selectedSource:null,printData:null};render();return;}
    if(event.target.closest('[data-order-close]')){state={...state,selectedOrder:null,printData:null};render();return;}
    if(event.target.closest('[data-print-close]')){state={...state,printData:null};render();return;}
    if(event.target.closest('[data-print-now]')){if(state.printData)openPrintDocument({title:state.printData.title,body:pendingPrintBody(state.printData)});return;}
    if(event.target.closest('[data-delete-all]')){
      const ids=pendingOrders(state.orders).map(order=>order.id);if(busy||!ids.length||!window.confirm(`Xoá tất cả ${ids.length} đơn tạm?`))return;busy=true;
      try{await context.business.batchOrders('delete_pending',ids);await refresh(['orders']);state={...state,selectedOrder:null,selectedSource:null,printData:null};render();}
      catch(error){context.system?.toast(error?.message||'Không thực hiện được');}finally{busy=false;}return;
    }
    const sourceAction=event.target.closest('[data-source-action]')?.dataset.sourceAction;if(sourceAction&&state.selectedSource){state={...state,printData:printForSource(state.selectedSource,pendingOrders(state.orders),sourceAction==='total')};render();return;}
    const action=event.target.closest('[data-order-action]')?.dataset.orderAction;if(!action||!state.selectedOrder)return;
    const current=state.selectedOrder;
    if(action==='print'){state={...state,printData:printForOrder(current)};render();return;}
    if(action==='edit'){
      try{const detail=await context.business.orderDetail(current.id);context.editOrder?.(detail?.order||current);context.navigate?.('sales');}
      catch(error){context.system?.toast(error?.message||'Không thực hiện được');}return;
    }
    if(action==='deliver'){
      if(busy)return;busy=true;try{await context.business.deliverOrder(current.id);await refresh(['orders','debt']);state={...state,selectedOrder:null,printData:null};render();}
      catch(error){context.system?.toast(error?.message||'Không thực hiện được');}finally{busy=false;}return;
    }
    if(action==='delete'){
      if(busy||!window.confirm(`Xoá đơn ${current.id}?`))return;busy=true;
      try{await context.business.deletePending(current.id);await refresh(['orders']);state={...state,selectedOrder:null,printData:null};render();}
      catch(error){context.system?.toast(error?.message||'Không thực hiện được');}finally{busy=false;}
    }
  };
  root.addEventListener('click',onClick);render();return()=>{unsubscribeData?.();root.removeEventListener('click',onClick);};
}
