const money=n=>Number(n||0).toLocaleString('vi-VN');
const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const fmtDate=value=>{const d=new Date(value);return Number.isNaN(d.getTime())?'':d.toLocaleString('vi-VN',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});};
const fmtDay=value=>{const d=new Date(value);if(Number.isNaN(d.getTime()))return'';const p=n=>String(n).padStart(2,'0');return `${p(d.getDate())}/${p(d.getMonth()+1)}/${d.getFullYear()}`;};
const balance=row=>Number(row.soDu??row.balance??row.total??0)||0;
const lastAt=row=>row.lastTransaction||row.last||row.ngay||'';
const customerName=row=>row.ten||row.tenKH||row.name||row.maKH||'';
const itemName=item=>item.tenSP||item.ten||item.product_name||'';
const itemQty=item=>Number(item.sl??item.qty)||0;
const itemPrice=item=>Number(item.gia??item.unit_price)||0;

export function debtGroups(summary=[],sortBy='total',sortDir='desc'){
  const dir=sortDir==='asc'?1:-1;const rows=[...summary].sort((a,b)=>{
    if(sortBy==='count')return dir*((Number(a.transactionCount??a.count)||0)-(Number(b.transactionCount??b.count)||0));
    if(sortBy==='days')return dir*(daysSince(lastAt(a))-daysSince(lastAt(b)));
    return dir*(Math.abs(balance(a))-Math.abs(balance(b)));
  });
  return {owe:rows.filter(row=>balance(row)>0),credit:rows.filter(row=>balance(row)<0),clear:rows.filter(row=>balance(row)===0)};
}

export function debtTotals(summary=[]){
  let owed=0,credit=0,owedCount=0,creditCount=0;
  for(const row of summary){const value=balance(row);if(value>0){owed+=value;owedCount++;}else if(value<0){credit+=Math.abs(value);creditCount++;}}
  return {owed,credit,owedCount,creditCount};
}

function daysSince(value){const d=new Date(value);if(Number.isNaN(d.getTime()))return 0;const today=new Date();today.setHours(0,0,0,0);d.setHours(0,0,0,0);return Math.max(0,Math.floor((today-d)/86400000));}

export function ledgerRows(transactions=[]){
  return transactions.map(tx=>{
    const movement=Number(tx.bienDong??tx.movement)||0;
    return {...tx,kind:movement>=0?'debt':'collection',orderId:String(tx.maDon||tx.order_id||''),balanceAfter:Number(tx.balanceAfter??tx.balance_after)||0};
  });
}

function avatarInitials(name){const parts=String(name||'').trim().split(/\s+/).filter(Boolean);if(!parts.length)return'KH';return parts.slice(-2).map(part=>part[0]?.toUpperCase()||'').join('');}

function customerOptions(customers=[],selected=''){
  return customers.filter(c=>c.active!==false).map(c=>`<button type="button" class="debt-customer-option" data-customer-pick="${esc(c.id)}" aria-selected="${String(c.id)===String(selected)}"><span>${esc(avatarInitials(c.ten||c.name))}</span><b>${esc(c.ten||c.name)}</b></button>`).join('');
}

function customerRow(row){
  const amount=balance(row),owed=amount>0,credit=amount<0,last=fmtDate(lastAt(row)),days=daysSince(lastAt(row)),name=customerName(row);
  return `<button type="button" class="debt-customer-row" data-customer-open="${esc(row.maKH||row.id)}">
    <span class="debt-avatar">${esc(avatarInitials(name))}</span>
    <span class="debt-customer-copy"><b>${esc(name)}</b>${last?`<small>GD cuối: ${esc(last)}${owed&&days>0?` · Nợ ${days} ngày`:''}</small>`:''}</span>
    <strong class="${owed?'is-owed':credit?'is-credit':''}">${credit?'+':''}${money(Math.abs(amount))}</strong>
  </button>`;
}

function groupMarkup(label,rows,tone,sortControls=false,state={}){
  if(!rows.length)return'';
  return `<div class="debt-group-head ${tone}"><span>${label} (${rows.length})</span>${sortControls?`<div class="debt-sort"><span>Sắp xếp</span><button type="button" data-sort-menu>${state.sortBy==='count'?'Số lần GD':state.sortBy==='days'?'Số ngày nợ':'Số nợ'}</button><button type="button" data-sort-dir>${state.sortDir==='desc'?'↓':'↑'}</button>${state.sortOpen?`<div class="debt-sort-menu"><button type="button" data-sort="total">Số nợ</button><button type="button" data-sort="count">Số lần giao dịch</button><button type="button" data-sort="days">Số ngày nợ</button></div>`:''}</div>`:''}</div>${rows.map(customerRow).join('')}`;
}

function summaryMarkup(summary){
  const totals=debtTotals(summary);return `<div class="debt-total-row"><div><small>⚠️ TỔNG NỢ</small><strong>${money(totals.owed)}</strong><span>${totals.owedCount} khách còn nợ</span></div>${totals.credit>0?`<div><small>💚 TỔNG DƯ TIỀN</small><strong>${money(totals.credit)}</strong><span>${totals.creditCount} khách dư</span></div>`:''}</div>`;
}

function quickFormMarkup(customers,state){
  if(!state.canManage)return'';const chosen=customers.find(c=>String(c.id)===String(state.selectedCustomerId));
  return `<div class="debt-quick"><b>⚡ LẬP PHIẾU NHANH</b><div class="debt-customer-picker"><input data-customer-query value="${esc(state.customerQuery||chosen?.ten||chosen?.name||'')}" placeholder="Tìm khách hàng..."><span>▾</span>${state.customerOpen?`<div class="debt-customer-options">${customerOptions(customers,state.selectedCustomerId)||'<div>Không có khách</div>'}</div>`:''}</div><div class="debt-quick-actions"><input data-quick-amount inputmode="numeric" value="${esc(state.amount||'')}" placeholder="Số tiền..."><button type="button" data-quick-action="collect">💵 Thu</button><button type="button" data-quick-action="debt">📌 Nợ</button></div></div>`;
}

function transactionMarkup(tx){
  const row=ledgerRows([tx])[0],isDebt=row.kind==='debt',linked=Boolean(row.orderId);return `<button type="button" class="debt-transaction-row" ${linked?`data-ledger-order="${esc(row.orderId)}"`:''} ${linked?'':'disabled'}>
    <span><b>${isDebt?'📌 Ghi nợ':'💵 Thu tiền'}${linked?' ›':''}</b><small>${esc(tx.ghiChu||tx.note||row.orderId||'')}</small></span>
    <span>${esc(fmtDate(tx.ngay||tx.occurred_at))}</span>
    <span><strong>${isDebt?'+':'-'}${money(Math.abs(Number(tx.soTien??tx.amount)||0))}</strong><small>${row.balanceAfter>0?'Nợ':'Dư'} <b>${money(Math.abs(row.balanceAfter))}</b></small></span>
  </button>`;
}

function debtDetailMarkup(detail,state){
  const customer=detail.customer||{},name=customer.ten||customer.name||customerName((state.summary||[]).find(x=>String(x.maKH)===String(state.selectedCustomerId))||{}),amount=Number(detail.soDu)||0,transactions=detail.transactions||[];
  const ledger=transactions.length?transactions.map(transactionMarkup).join(''):'<div class="debt-ledger-empty">Chưa có giao dịch</div>';
  return `<div class="debt-overlay debt-detail-overlay" data-debt-detail><button class="debt-backdrop" type="button" data-debt-close aria-label="Đóng"></button><section class="debt-detail-panel">
    <header><button type="button" data-debt-close>✕</button><button type="button" data-debt-share>🖼️ Chia sẻ ảnh</button></header>
    <div class="debt-receipt" data-debt-share-target><div class="debt-shop"><div class="debt-shop-avatar">${esc(avatarInitials(state.shopName||'Cửa Hàng'))}</div><strong>${esc(state.shopName||'Cửa Hàng')}</strong></div><div class="debt-receipt-summary"><span><b>KH: ${esc(name)}</b><small>${fmtDay(new Date())}</small></span><span><strong>${money(Math.abs(amount))}</strong><small>${amount>0?'⚠️ Còn nợ':amount<0?'💚 Dư tiền':'✅ Đã xong'}</small></span></div>
    <div class="debt-ledger-head"><span>Giao dịch</span><span>Ngày</span><span>Số tiền</span></div><div class="debt-ledger">${ledger}</div></div>
    ${state.canManage?`<footer><input data-detail-amount inputmode="numeric" value="${esc(state.detailAmount??(amount>0?Math.round(amount):''))}" placeholder="Số tiền..."><div><button type="button" data-detail-action="collect">💵 Thu tiền</button><button type="button" data-detail-action="debt">📌 Ghi nợ</button></div></footer>`:''}
  </section></div>`;
}

function orderDetailMarkup(order){
  const items=order.items||[];const qty=items.reduce((sum,item)=>sum+itemQty(item),0);return `<div class="debt-overlay debt-order-overlay" data-debt-order><button class="debt-backdrop" type="button" data-order-close aria-label="Đóng"></button><section class="debt-order-panel"><header><strong>${esc(order.id)}</strong><span>✅ Đã giao</span><button type="button" data-order-share>🖼️</button><button type="button" data-order-close>✕</button></header><div class="debt-order-meta"><b>KH: ${esc(order.tenKH)}</b> · ${esc(order.id)} · ${esc(fmtDate(order.ngay))}</div><div class="debt-order-head"><span>#</span><span>Tên</span><span>SL</span><span>Đ.Giá</span><span>T.Tiền</span></div><div class="debt-order-lines" data-order-share-target>${items.map((item,index)=>`<div><span>${item.lineNo||index+1}.</span><span>${esc(itemName(item))}${item.ghiChu?`<small>${esc(item.ghiChu)}</small>`:''}</span><span>${itemQty(item)}</span><span>${money(itemPrice(item))}</span><strong>${money(itemPrice(item)*itemQty(item))}</strong></div>`).join('')}</div><div class="debt-order-total"><b>Tổng ${qty} SP</b><strong>${money(order.tongTien)}</strong></div></section></div>`;
}

export function debtMarkup(input={}){
  const state={summary:input.summary||[],customers:input.customers||[],canManage:input.canManage!==false,sortBy:input.sortBy||'total',sortDir:input.sortDir||'desc',sortOpen:Boolean(input.sortOpen),selectedCustomerId:input.selectedCustomerId||'',customerOpen:Boolean(input.customerOpen),customerQuery:input.customerQuery||'',amount:input.amount||'',detailAmount:input.detailAmount,detail:input.detail||null,selectedOrder:input.selectedOrder||null,shopName:input.shopName||'Cửa Hàng'};
  const groups=debtGroups(state.summary,state.sortBy,state.sortDir);
  return `<section class="debt-screen" data-screen-id="debt"><section class="debt-hero">${summaryMarkup(state.summary)}${quickFormMarkup(state.customers,state)}</section><section class="debt-list">${groupMarkup('⚠️ CÒN NỢ',groups.owe,'owed',true,state)}${groupMarkup('💚 DƯ TIỀN',groups.credit,'credit',false,state)}${groupMarkup('✅ ĐÃ THANH TOÁN',groups.clear,'clear',false,state)}${state.summary.length?'':'<div class="debt-empty">Chưa có công nợ</div>'}</section>${state.detail?debtDetailMarkup(state.detail,state):''}${state.selectedOrder?orderDetailMarkup(state.selectedOrder):''}</section>`;
}

async function ensureHtml2Canvas(){
  if(window.html2canvas)return window.html2canvas;
  await new Promise((resolve,reject)=>{const existing=document.querySelector('script[data-html2canvas]');if(existing){existing.addEventListener('load',resolve,{once:true});existing.addEventListener('error',reject,{once:true});return;}const script=document.createElement('script');script.src='https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';script.dataset.html2canvas='1';script.onload=resolve;script.onerror=reject;document.head.append(script);});
  return window.html2canvas;
}

async function shareNode(node,title,filename){
  try{const html2canvas=await ensureHtml2Canvas();if(!html2canvas||!node)return;const canvas=await html2canvas(node,{scale:2,useCORS:true,backgroundColor:'#fff'});const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.9));if(!blob)return;const file=new File([blob],filename,{type:'image/jpeg'});if(navigator.share&&navigator.canShare?.({files:[file]})){try{await navigator.share({files:[file],title});return;}catch(error){if(error?.name==='AbortError')return;}}const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(_){/* sharing remains best-effort */}
}

export async function mount(context){
  const root=context.root,data=()=>context.getData?.()||context.data||{};const permissions=data().permissions||{};let busy=false;let state={summary:data().debtSummary||[],customers:data().customers||[],canManage:permissions.canManageDebt!==false,sortBy:'total',sortDir:'desc',sortOpen:false,selectedCustomerId:'',customerOpen:false,customerQuery:'',amount:'',detailAmount:'',detail:null,selectedOrder:null,shopName:data().user?.ten||context.identity?.displayName||'Cửa Hàng'};
  const render=()=>{const d=data();state={...state,summary:d.debtSummary||state.summary,customers:d.customers||state.customers,canManage:(d.permissions||permissions).canManageDebt!==false,shopName:d.user?.ten||state.shopName};root.innerHTML=debtMarkup(state);};
  const unsubscribeData=context.subscribeData?.(({changed})=>{if(changed.some(x=>x==='bootstrap'||x==='debt'||x==='customers'||x==='orders'))render();});
  const refresh=async domains=>{await context.refresh?.(domains);render();};
  const openCustomer=async id=>{try{const detail=await context.business.debtLedger(id);state={...state,selectedCustomerId:id,detail,detailAmount:Number(detail?.soDu)>0?String(Math.round(Number(detail.soDu))):'',customerOpen:false};render();}catch(error){context.system?.toast(error?.message||'Không thực hiện được');}};
  const transact=async(where,type)=>{if(busy)return;const raw=where==='detail'?state.detailAmount:state.amount,amount=Number(String(raw||'').replace(/[^0-9.]/g,''))||0,id=where==='detail'?state.selectedCustomerId:state.selectedCustomerId;if(!id||amount<=0){context.system?.toast('Chọn KH và nhập số tiền!');return;}busy=true;try{await context.business.debtTransaction(id,type,amount,type==='thu_tien'?'Thu tiền':'Ghi nợ');await context.refresh?.(['debt']);if(where==='detail'){const detail=await context.business.debtLedger(id);state={...state,detail,detailAmount:'',amount:''};}else state={...state,amount:''};render();}catch(error){context.system?.toast(error?.message||'Không thực hiện được');}finally{busy=false;}};
  const onClick=async event=>{
    if(event.target.closest('[data-sort-menu]')){state={...state,sortOpen:!state.sortOpen};render();return;}
    const sort=event.target.closest('[data-sort]');if(sort){state={...state,sortBy:sort.dataset.sort,sortOpen:false};render();return;}
    if(event.target.closest('[data-sort-dir]')){state={...state,sortDir:state.sortDir==='desc'?'asc':'desc'};render();return;}
    const customer=event.target.closest('[data-customer-open]');if(customer){await openCustomer(customer.dataset.customerOpen);return;}
    const pick=event.target.closest('[data-customer-pick]');if(pick){const id=pick.dataset.customerPick,row=state.summary.find(item=>String(item.maKH)===String(id)),chosen=state.customers.find(item=>String(item.id)===String(id));state={...state,selectedCustomerId:id,customerQuery:chosen?.ten||chosen?.name||'',customerOpen:false,amount:balance(row)>0?String(Math.round(balance(row))):''};render();return;}
    if(event.target.closest('[data-debt-close]')){state={...state,detail:null,selectedOrder:null};render();return;}
    if(event.target.closest('[data-order-close]')){state={...state,selectedOrder:null};render();return;}
    const ledgerOrder=event.target.closest('[data-ledger-order]');if(ledgerOrder){try{const detail=await context.business.orderDetail(ledgerOrder.dataset.ledgerOrder);state={...state,selectedOrder:detail?.order||null};render();}catch(error){context.system?.toast(error?.message||'Không thực hiện được');}return;}
    const quick=event.target.closest('[data-quick-action]')?.dataset.quickAction;if(quick){await transact('quick',quick==='collect'?'thu_tien':'ghi_no');return;}
    const detailAction=event.target.closest('[data-detail-action]')?.dataset.detailAction;if(detailAction){await transact('detail',detailAction==='collect'?'thu_tien':'ghi_no');return;}
    if(event.target.closest('[data-debt-share]')){await shareNode(root.querySelector('[data-debt-share-target]'),`Công nợ ${state.detail?.customer?.ten||''}`,`no-${state.detail?.customer?.ten||'khach'}.jpg`);return;}
    if(event.target.closest('[data-order-share]')){await shareNode(root.querySelector('[data-order-share-target]'),`Đơn hàng ${state.selectedOrder?.id||''}`,`don-${state.selectedOrder?.id||'hang'}.jpg`);return;}
  };
  const onInput=event=>{
    if(event.target.matches('[data-customer-query]')){state={...state,customerQuery:event.target.value,customerOpen:true};render();const input=root.querySelector('[data-customer-query]');input?.focus();input?.setSelectionRange(state.customerQuery.length,state.customerQuery.length);return;}
    if(event.target.matches('[data-quick-amount]'))state={...state,amount:event.target.value};
    if(event.target.matches('[data-detail-amount]'))state={...state,detailAmount:event.target.value};
  };
  const onFocus=event=>{if(event.target.matches('[data-customer-query]')&&!state.customerOpen){state={...state,customerOpen:true,customerQuery:''};render();root.querySelector('[data-customer-query]')?.focus();}};
  root.addEventListener('click',onClick);root.addEventListener('input',onInput);root.addEventListener('focusin',onFocus);render();return()=>{unsubscribeData?.();root.removeEventListener('click',onClick);root.removeEventListener('input',onInput);root.removeEventListener('focusin',onFocus);};
}
