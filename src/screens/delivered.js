import {openPrintDocument} from '../core/print.js';
const money=n=>Number(n||0).toLocaleString('vi-VN');
const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const norm=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').replace(/Đ/g,'D').toLowerCase();
const dateKey=value=>{const d=value instanceof Date?new Date(value):new Date(value);if(Number.isNaN(d.getTime()))return'';const p=n=>String(n).padStart(2,'0');return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`;};
const fmtDate=value=>{const d=new Date(value);return Number.isNaN(d.getTime())?'':d.toLocaleString('vi-VN',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});};

export function quickRange(type,base=new Date()){
  const d=new Date(base);d.setHours(12,0,0,0);let from=new Date(d),to=new Date(d);
  if(type==='yesterday'){from.setDate(from.getDate()-1);to=new Date(from);}
  else if(type==='week'){const day=d.getDay(),delta=day===0?-6:1-day;from.setDate(d.getDate()+delta);to=new Date(from);to.setDate(from.getDate()+6);}
  else if(type==='month'){from=new Date(d.getFullYear(),d.getMonth(),1,12);to=new Date(d.getFullYear(),d.getMonth()+1,0,12);}
  else if(type==='year'){from=new Date(d.getFullYear(),0,1,12);to=new Date(d.getFullYear(),11,31,12);}
  return {from:dateKey(from),to:dateKey(to)};
}

export function filterDeliveredOrders(orders=[],filter={}){
  const search=norm(filter.search).trim();const mode=filter.mode||'today';const from=filter.from||dateKey(new Date()),to=filter.to||from;
  return orders.filter(o=>{
    if(o.trangThai!=='done'&&o.status!=='done')return false;
    const dk=dateKey(o.ngay||o.ordered_at);if(mode==='today'&&dk!==dateKey(new Date(from+'T12:00:00')))return false;
    if(mode==='range'&&(dk<from||dk>to))return false;
    if(search){const hay=norm([o.tenKH,o.id,...(o.items||[]).map(it=>it.tenSP||it.ten||it.product_name)].join(' '));if(!hay.includes(search))return false;}
    return true;
  }).sort((a,b)=>new Date(b.ngay||b.ordered_at)-new Date(a.ngay||a.ordered_at));
}

export function summarizeDeliveredBySource(orders=[]){
  const map=new Map();let total={qty:0,cost:0,revenue:0,profit:0};
  for(const order of orders){
    for(const item of order.items||[]){
      const source=item.nhom||item.product_group||'Khác',qty=Number(item.sl??item.qty)||0,price=Number(item.gia??item.unit_price)||0,costUnit=Number(item.von??item.unit_cost)||0;
      const row=map.get(source)||{source,qty:0,cost:0,revenue:0,profit:0};
      row.qty+=qty;row.cost+=costUnit*qty;row.revenue+=price*qty;row.profit+=(price-costUnit)*qty;map.set(source,row);
      total.qty+=qty;total.cost+=costUnit*qty;total.revenue+=price*qty;total.profit+=(price-costUnit)*qty;
    }
  }
  return {rows:[...map.values()].sort((a,b)=>b.revenue-a.revenue||a.source.localeCompare(b.source,'vi')),total};
}

function summaryMarkup(orders,canViewCost){
  const s=summarizeDeliveredBySource(orders);
  if(!s.rows.length)return'';
  if(!canViewCost){
    return `<div class="delivered-summary-grid is-customer delivered-summary-head"><span>NGUỒN</span><span>SL</span><span>THU</span></div>
      ${s.rows.map(r=>`<div class="delivered-summary-grid is-customer"><span>${esc(r.source)}</span><span>${r.qty}</span><span>${money(r.revenue)}</span></div>`).join('')}
      <div class="delivered-summary-grid is-customer delivered-summary-total"><span>TỔNG</span><span>${s.total.qty}</span><span>${money(s.total.revenue)}</span></div>`;
  }
  return `<div class="delivered-summary-grid delivered-summary-head"><span>NGUỒN</span><span>SL</span><span>CHI</span><span>THU</span><span>LÃI</span></div>
    ${s.rows.map(r=>`<div class="delivered-summary-grid"><span>${esc(r.source)}</span><span>${r.qty}</span><span>${money(r.cost)}</span><span>${money(r.revenue)}</span><span>${money(r.profit)}</span></div>`).join('')}
    <div class="delivered-summary-grid delivered-summary-total"><span>TỔNG</span><span>${s.total.qty}</span><span>${money(s.total.cost)}</span><span>${money(s.total.revenue)}</span><span>${money(s.total.profit)}</span></div>`;
}

function orderCard(o,index,canViewCost){
  const items=o.items||[];const qty=items.reduce((a,x)=>a+(Number(x.sl??x.qty)||0),0);const profit=Number(o.loiNhuan??(Number(o.tongTien||0)-Number(o.tongVon||0)))||0;
  return `<button class="delivered-order-card" type="button" data-order-open="${esc(o.id)}">
    <div class="delivered-order-top"><span class="delivered-order-id"><small>#${index+1}</small><b>${esc(o.id)}</b><em>✅ Đã giao</em></span><strong>${money(o.tongTien)}</strong></div>
    <div class="delivered-order-mid"><span><b>${esc(o.tenKH)}</b> · ${esc(fmtDate(o.ngay))} · ${items.length||Number(o.tongMa)||0} mã (${qty||Number(o.tongSL)||0} sp)</span>${canViewCost?`<strong>+${money(profit)}</strong>`:''}</div>
    <div class="delivered-order-preview">${esc(items.map(it=>`${it.tenSP||it.ten||''} ×${it.sl??it.qty??0}`).join(', ')||'—')}</div>
  </button>`;
}

function detailMarkup(o,{canViewCost=false,canManageOrders=false}={}){
  const items=o.items||[];const qty=items.reduce((a,x)=>a+(Number(x.sl??x.qty)||0),0);const profit=Number(o.loiNhuan??(Number(o.tongTien||0)-Number(o.tongVon||0)))||0;
  return `<div class="delivered-overlay" data-order-detail>
    <button class="delivered-backdrop" type="button" data-detail-close aria-label="Đóng"></button>
    <section class="delivered-detail-panel">
      <header><strong>${esc(o.id)}</strong><span>✅ Đã giao</span><button type="button" data-detail-close>✕</button></header>
      <div class="delivered-detail-meta"><b>KH: ${esc(o.tenKH)}</b> · ${esc(o.id)} · ${esc(fmtDate(o.ngay))}</div>
      <div class="delivered-detail-head"><span>#</span><span>Tên</span><span>SL</span><span>Đ.Giá</span><span>T.Tiền</span></div>
      <div class="delivered-detail-lines">${items.map((it,i)=>`<div class="delivered-detail-line"><span>${i+1}.</span><span>${esc(it.tenSP||it.ten||'')}${it.ghiChu?`<small>${esc(it.ghiChu)}</small>`:''}</span><span>${it.sl??it.qty??0}</span><span>${money(it.gia??it.unit_price)}</span><strong>${money((Number(it.gia??it.unit_price)||0)*(Number(it.sl??it.qty)||0))}</strong></div>`).join('')}</div>
      <div class="delivered-detail-total"><b>Tổng ${qty} SP</b><span><strong>${money(o.tongTien)}</strong>${canViewCost?`<small>Lợi nhuận: +${money(profit)}</small>`:''}</span></div>
      <footer>${canManageOrders?'<button type="button" data-detail-action="edit">Sửa</button>':''}<button type="button" data-detail-action="print">In</button>${canManageOrders?'<button type="button" data-detail-action="delete">Xoá</button>':''}</footer>
    </section>
  </div>`;
}

function deliveredPrintBody(o){const items=o.items||[];return `<main class="print-sheet"><div class="print-head">${esc(o.id)}</div><div class="print-meta"><b>KH: ${esc(o.tenKH)}</b> · ${esc(fmtDate(o.ngay))}</div>${items.map((it,i)=>`<div class="print-row"><span>${i+1}. ${esc(it.tenSP||it.ten||'')}</span><span>${it.sl??it.qty??0} × ${money(it.gia??it.unit_price)}</span></div>`).join('')}<div class="print-total"><span>Tổng</span><strong>${money(o.tongTien)}</strong></div></main>`;}

function printMarkup(o){
  const items=o.items||[];return `<div class="delivered-overlay delivered-print-overlay"><button class="delivered-backdrop" type="button" data-print-close aria-label="Đóng"></button><section class="delivered-print-panel">
    <header><button type="button" data-print-close>✕</button><strong>${esc(o.id)}</strong><button type="button" data-print-now>In</button></header>
    <div class="delivered-print-meta"><b>KH: ${esc(o.tenKH)}</b><span>${esc(fmtDate(o.ngay))}</span></div>
    <div class="delivered-print-lines">${items.map((it,i)=>`<div><span>${i+1}. ${esc(it.tenSP||it.ten||'')}</span><span>${it.sl??it.qty??0} × ${money(it.gia??it.unit_price)}</span></div>`).join('')}</div>
    <div class="delivered-print-total"><b>Tổng</b><strong>${money(o.tongTien)}</strong></div>
  </section></div>`;
}

function calendarMarkup(state){
  if(!state.calendarOpen)return'';const base=new Date((state.calendarMonth||state.from)+'T12:00:00');const y=base.getFullYear(),m=base.getMonth();const first=new Date(y,m,1).getDay(),days=new Date(y,m+1,0).getDate();let cells='';
  for(let i=0;i<first;i++)cells+='<span></span>';
  for(let d=1;d<=days;d++){const key=dateKey(new Date(y,m,d,12));const selected=key===state.from||key===state.to;cells+=`<button type="button" data-calendar-day="${key}" aria-pressed="${selected}">${d}</button>`;}
  return `<div class="delivered-calendar"><div class="delivered-calendar-nav"><button type="button" data-month="-1">‹</button><b>${y} / ${String(m+1).padStart(2,'0')}</b><button type="button" data-month="1">›</button></div><div class="delivered-week"><span>CN</span><span>T2</span><span>T3</span><span>T4</span><span>T5</span><span>T6</span><span>T7</span></div><div class="delivered-days">${cells}</div><div class="delivered-quick"><button type="button" data-quick="yesterday">Hôm qua</button><button type="button" data-quick="week">Tuần này</button><button type="button" data-quick="month">Tháng này</button><button type="button" data-quick="year">Năm nay</button></div><div class="delivered-calendar-close"><span>${state.picking==='to'?'Chọn ngày kết thúc':'Chọn ngày bắt đầu'}</span><button type="button" data-calendar-close>Đóng</button></div></div>`;
}

export function deliveredMarkup(input={}){
  const today=dateKey(new Date());const state={orders:[],search:'',mode:'today',from:today,to:today,calendarOpen:false,calendarMonth:today,picking:'from',selected:null,printOrder:null,permissions:{},...input};
  const done=filterDeliveredOrders(state.orders,state);
  const canViewCost=state.permissions?.canViewCost===true;
  const canManageOrders=state.permissions?.canManageOrders===true;
  const label=state.mode==='range'?(state.from===state.to?state.from.slice(8,10)+'/'+state.from.slice(5,7):`${state.from.slice(8,10)}/${state.from.slice(5,7)} → ${state.to.slice(8,10)}/${state.to.slice(5,7)}`):'Chọn ngày';
  return `<section class="delivered-screen" data-screen-id="delivered">
    <section class="delivered-filter"><div class="delivered-search"><input data-delivered-search value="${esc(state.search)}" placeholder="Tìm tên khách hoặc sản phẩm..."><button type="button" data-delivered-clear ${state.search?'':'hidden'}>✕</button></div><div class="delivered-time"><button type="button" data-today aria-pressed="${state.mode==='today'}">Hôm nay</button><button type="button" data-calendar-toggle aria-pressed="${state.mode==='range'}">${esc(label)}</button></div>${calendarMarkup(state)}</section>
    <section class="delivered-summary"><h2>Tổng hợp đã giao <small>(${done.length} đơn)</small></h2>${summaryMarkup(done,canViewCost)}</section>
    <section class="delivered-list">${done.map((order,index)=>orderCard(order,index,canViewCost)).join('')||'<div class="delivered-empty">Không có đơn trong khoảng này</div>'}</section>
    ${state.selected?detailMarkup(state.selected,{canViewCost,canManageOrders}):''}${state.printOrder?printMarkup(state.printOrder):''}
  </section>`;
}

export async function mount(context){
  const root=context.root;const today=dateKey(new Date());const data=()=>context.getData?.()||context.data||{};let busy=false;let state={orders:data().orders||[],permissions:data().permissions||{},search:'',mode:'today',from:today,to:today,calendarOpen:false,calendarMonth:today,picking:'from',selected:null,printOrder:null};
  const canManage=()=>state.permissions?.canManageOrders===true;
  const render=()=>{const current=data();state={...state,orders:current.orders||state.orders,permissions:current.permissions||state.permissions};root.innerHTML=deliveredMarkup(state);};
  const unsubscribeData=context.subscribeData?.(({changed})=>{if(changed.some(x=>x==='bootstrap'||x==='orders'||x==='products'||x==='customers'))render();});
  const findOrder=id=>state.orders.find(o=>String(o.id)===String(id));
  const onClick=async event=>{
    if(event.target.closest('[data-delivered-clear]')){state={...state,search:''};render();return;}
    if(event.target.closest('[data-today]')){const r=quickRange('today');state={...state,mode:'today',from:r.from,to:r.to,calendarOpen:false};render();return;}
    if(event.target.closest('[data-calendar-toggle]')){state={...state,calendarOpen:!state.calendarOpen,picking:'from',calendarMonth:state.from};render();return;}
    if(event.target.closest('[data-calendar-close]')){state={...state,calendarOpen:false};render();return;}
    const quick=event.target.closest('[data-quick]');if(quick){const r=quickRange(quick.dataset.quick);state={...state,mode:'range',from:r.from,to:r.to,calendarOpen:false,picking:'from'};render();return;}
    const month=event.target.closest('[data-month]');if(month){const d=new Date(state.calendarMonth+'T12:00:00');d.setMonth(d.getMonth()+Number(month.dataset.month));state={...state,calendarMonth:dateKey(d)};render();return;}
    const day=event.target.closest('[data-calendar-day]');if(day){const key=day.dataset.calendarDay;if(state.picking==='from'){state={...state,mode:'range',from:key,to:key,picking:'to'};}else{state={...state,mode:'range',from:key<state.from?key:state.from,to:key<state.from?state.from:key,picking:'from',calendarOpen:false};}render();return;}
    const open=event.target.closest('[data-order-open]');if(open){state={...state,selected:findOrder(open.dataset.orderOpen)};render();return;}
    if(event.target.closest('[data-detail-close]')){state={...state,selected:null};render();return;}
    if(event.target.closest('[data-print-close]')){state={...state,printOrder:null};render();return;}
    if(event.target.closest('[data-print-now]')){if(state.printOrder)openPrintDocument({title:state.printOrder.id,body:deliveredPrintBody(state.printOrder)});return;}
    const action=event.target.closest('[data-detail-action]')?.dataset.detailAction;if(!action||!state.selected)return;
    if(action==='print'){state={...state,printOrder:state.selected,selected:null};render();return;}
    if(!canManage())return;
    if(action==='edit'){
      try{const detail=await context.business.orderDetail(state.selected.id);context.editOrder?.(detail?.order||state.selected);context.navigate?.('sales');}
      catch(e){context.system?.toast(e?.message||'Không thực hiện được');}return;
    }
    if(action==='delete'){
      if(busy||!window.confirm(`Xoá đơn ${state.selected.id}?`))return;busy=true;
      try{await context.business.reverseOrder(state.selected.id,'Hoàn đơn');await context.refresh?.(['orders','debt']);state={...state,selected:null};render();}
      catch(e){context.system?.toast(e?.message||'Không thực hiện được');}finally{busy=false;}
    }
  };
  const onInput=event=>{if(event.target.matches('[data-delivered-search]')){state={...state,search:event.target.value};render();const input=root.querySelector('[data-delivered-search]');input?.focus();input?.setSelectionRange(state.search.length,state.search.length);}};
  root.addEventListener('click',onClick);root.addEventListener('input',onInput);render();return()=>{unsubscribeData?.();root.removeEventListener('click',onClick);root.removeEventListener('input',onInput);};
}
