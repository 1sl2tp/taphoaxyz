import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const root=new URL('../',import.meta.url);
const read=p=>fs.readFileSync(new URL(p,root),'utf8');
const sql=read('supabase/migrations/20261104211500_taphoa_order_cycles_readonly_admin_user.sql');
const amountsSQL=read('supabase/migrations/20261104215000_taphoa_order_cycles_progress_amount_readonly.sql');
const paymentSQL=read('supabase/migrations/20261104224500_taphoa_payment_period_policy_projection.sql');
const js=read('src/fixed-ui-debt-cycles.js');
const html=read('index.html');
const bridge=read('src/fixed-production-bridge.js');
const business=read('src/core/business.js');
const example=[
 {customerId:'a',isOpen:true,activePeriodNo:1,balanceThousands:500,
  todayDay:'2026-11-05',orderCount:3,
  orderCycles:[
   {number:1,orderId:'o1',purchaseDay:'2026-11-03',dueDay:'2026-11-09',isDue:false,amountThousands:100,estimatedRemainingThousands:0,progressDays:3,elapsedDays:3},
   {number:2,orderId:'o2',purchaseDay:'2026-11-03',dueDay:'2026-11-09',isDue:false,amountThousands:200,estimatedRemainingThousands:200,progressDays:3,elapsedDays:3},
   {number:3,orderId:'o3',purchaseDay:'2026-11-05',dueDay:'2026-11-11',isDue:false,amountThousands:300,estimatedRemainingThousands:300,progressDays:1,elapsedDays:1}],
  earliestDueDay:'2026-11-09',dueCount:0,
  lastPurchaseDay:'2026-11-05',idleDays:0,
  idleReviewDay:'2026-11-08',idleNeedsReview:false,
  paymentPolicy:{cycleNo:1,startDay:'2026-11-03',lastPurchaseDay:'2026-11-05',
    purchaseCount:3,durationDays:3,idleDays:0,sevenDueDay:'2026-11-09',
    stopDueDay:'2026-11-08',dueDay:'2026-11-08',dueReason:'stopped_buying',
    isDue:false,daysOverdue:0}},
 {customerId:'b',isOpen:false,activePeriodNo:0,balanceThousands:0,
  todayDay:'2026-11-05',orderCount:0,orderCycles:[],
  earliestDueDay:null,dueCount:0,lastPurchaseDay:null,idleDays:0,
  idleReviewDay:null,idleNeedsReview:false,paymentPolicy:null}
];
class Node {
 constructor(tag){
  this.tag=tag;this.children=[];this.dataset={};this.className='';
  this.textContent='';this.title='';this.classList={contains:()=>false};
 }
 append(...parts){this.children.push(...parts)}
 appendChild(n){this.children.push(n);return n}
 insertBefore(n){this.children.push(n);return n}
 prepend(n){this.children.unshift(n)}
 remove(){}
 replaceChildren(...parts){this.children=parts}
 setAttribute(key,value){this[key]=value}
 querySelector(selector){
  if(selector==='#debtCyclePanel')return this.children.find(c=>c.id==='debtCyclePanel')||null;
  if(selector==='.debt-cycle-card-meta')return this.children.find(c=>c.className==='debt-cycle-card-meta')||null;
  return null;
 }
 querySelectorAll(){return []}
}
const text=n=>String(n?.textContent||'')+(n?.children||[]).map(text).join('');
function fixture(role='admin'){
  const bodies={a:new Node('div'),b:new Node('div')};
  const cards=Object.entries(bodies).map(([id,body])=>({
   dataset:{debtCustomerId:id},querySelector:s=>s==='.debt-customer-body'?body:null
  }));
  const list=new Node('div');
  list.querySelectorAll=()=>cards;
  const modal=new Node('div'),history=new Node('div');
  const wrapper={classList:{contains:()=>false}};
  const elements={
   debtCustomerListContainer:list,
   customerDebtContentToShare:modal,cDebtModalHistoryList:history,
   customerDebtModalWrapper:wrapper
  };
  let identity={uid:role==='admin'?'admin-a':'a',role},adminReads=0,userReads=0;
  const all=example;
  const bridge={
   getIdentity:()=>identity,getAccessMode:()=> 'account',
   debtCycles:async()=>{adminReads++;return [];},
   orderCycles:async()=>{userReads++;return role==='admin'?all:[all[0]];}
  };
  const window={TAPHOA_PRODUCTION:bridge,
    renderCongNo(){},openCustomerDebtModal(id){context.activeDebtCustomerId=id;}};
  const context={window,document:{
   getElementById:id=>elements[id]||null,
   createElement:tag=>new Node(tag)
  },hasPermission:()=>true,console,Map,Set,Date,Intl,Math,Number,
   appData:{thuchi:[]},activeDebtCustomerId:null};
  vm.createContext(context);vm.runInContext(js,context);
  return {window,context,bodies,modal,bridge,
   reads:()=>({adminReads,userReads}),
   setIdentity:i=>{identity=i}};
}
test('Admin shows one payment deadline, independent of history order count',async()=>{
 const f=fixture('admin');f.window.renderCongNo();
 await new Promise(resolve=>setImmediate(resolve));
 assert.deepEqual(f.reads(),{adminReads:1,userReads:1});
 assert.equal(f.window.TAPHOA_DEBT_CYCLES.orders('a').length,3,'orders are history, not payment cycles');
 const summary=text(f.bodies.a.children[0]);
 assert.match(summary,/Hạn tất toán 08\/11\/2026/,'3-day stop beats D7');
 assert.match(summary,/Đợt nợ 1 · 3 đơn · ngừng nhập 3 ngày/);
 assert.doesNotMatch(summary,/D7 sớm nhất|chu kỳ đơn|Đến hạn \d+ đơn/);
 assert.match(text(f.bodies.b.children[0]),/Đã tất toán/);
 await f.window.openCustomerDebtModal('a');
 const panel=f.modal.children.find(n=>n.id==='debtCyclePanel');
 const body=text(panel);
 assert.match(body,/Chu kỳ nợ 1 · 3 đơn nhập/);
 assert.match(body,/Hạn tất toán toàn bộ: 08\/11\/2026 · ngừng nhập hàng 3 ngày/);
 assert.match(body,/D7 tối đa 09\/11\/2026/);
 assert.match(body,/Mua gần nhất 05\/11\/2026/);
 assert.match(body,/Mốc ngừng nhập 08\/11\/2026/);
 assert.doesNotMatch(body,/CK\d+|Còn ước tính|Đã bù tạm tính|D7 sớm nhất/);
 const progress=panel.children.find(n=>n.tag==='progress');
 assert.equal(progress.max,7);assert.equal(progress.value,3);
 const history=panel.children.find(n=>n.tag==='details'&&text(n).includes('Xem 3 đơn nhập'));
 assert(history);
 const items=history.children.find(n=>n.tag==='ol').children;
 assert.equal(items.length,3);
 assert.match(text(items[0]),/Đơn 05\/11\/2026/,'newest purchase first');
 assert.match(text(items[1]),/Đơn 03\/11\/2026/);
 assert.match(text(items[2]),/Đơn 03\/11\/2026/);
 assert.equal(items.flatMap(n=>n.children).filter(n=>n.tag==='progress').length,0,
  'never present three independent payment-cycle progress bars');
});
test('debt period already overdue is not reset by a new purchase',()=>{
 const start=js.indexOf('function displayOrderCycles(');
 const end=js.indexOf('  const summaryFormat=',start);
 assert(start>=0&&end>start);
 const fn=vm.runInNewContext(js.slice(start,end)+
   '\ndisplayOrderCycles;',{
   dayLabel:key=>key?.split('-').reverse().join('/')||'—',
   numeric:value=>Math.max(0,Number(value)||0)
 });
 const late=fn({isOpen:true,orderCount:7,paymentPolicy:{
   cycleNo:1,dueDay:'2026-10-07',sevenDueDay:'2026-10-10',
   lastPurchaseDay:'2026-10-29',isDue:true,daysOverdue:28,
   dueReason:'stopped_buying'
 }});
 assert.match(late.status,/Quá hạn 28 ngày/);
 assert.match(late.context,/Đợt nợ 1 · 7 đơn · ngừng nhập 3 ngày/);
 assert.equal(late.warning,true);
 assert.doesNotMatch(late.status,/29\/10|D7 sớm nhất/);
 const missing=fn({isOpen:true,orderCount:7,paymentPolicy:null});
 assert.match(missing.context,/Chưa xác định hạn/,'missing backend policy fails closed');
});
test('signed-in User loads only own data, never Admin history or another customer',async()=>{
 const f=fixture('user');f.window.renderCongNo();
 await new Promise(resolve=>setImmediate(resolve));
 assert.deepEqual(f.reads(),{adminReads:0,userReads:1});
 assert.equal(f.window.TAPHOA_DEBT_CYCLES.orders('a').length,3);
 assert.equal(f.window.TAPHOA_DEBT_CYCLES.orders('b').length,0);
 assert.equal(f.window.TAPHOA_DEBT_CYCLES.list('a').length,0);
 await f.window.openCustomerDebtModal('a');
 assert.match(text(f.modal.children.find(c=>c.id==='debtCyclePanel')),/Chu kỳ nợ 1 · 3 đơn nhập/);
 f.setIdentity({uid:'b',role:'user'});
 assert.equal(f.window.TAPHOA_DEBT_CYCLES.orders('a').length,0,
  'an account transition invalidates previously loaded customer cycles');
});
test('SQL read-only contract scopes User to account and resets at full settlement',()=>{
 assert.match(sql,/v_role='admin' OR a\.id=v_actor/);
 assert.match(amountsSQL,/estimated_remaining_thousands/);
 assert.match(paymentSQL,/'paymentPolicy',pol\.value/);
 assert.match(paymentSQL,/v21_private\.taphoa_cycle_policy_snapshot\(a\.id\)/);
 assert.match(paymentSQL,/WHERE act\.customer_account_id IS NOT NULL/);
 assert.doesNotMatch(paymentSQL,/cron\.schedule|taphoa_chat_notify_customer|send_due_notices/);
 assert.match(amountsSQL,/ORDER BY n\.order_cycle_no DESC/);
 assert.match(amountsSQL,/greatest\(0::numeric,least\(n\.amount_thousands/);
 assert.match(amountsSQL,/least\(7,greatest\(1,v_today-purchase_day\+1\)\)/);
 assert.doesNotMatch(amountsSQL,/cron\.schedule|send_due_notices/);
 assert.match(sql,/public\.taphoa_access_context\(\)/);
 assert.match(sql,/balance_after>0/);
 assert.match(sql,/r\.balance_after-r\.amount_vnd<=0/);
 assert.match(sql,/WHERE latest_rank=1 AND balance_after>0/);
 assert.match(sql,/row_number\(\) OVER \(\s*PARTITION BY oe\.customer_account_id/);
 assert.match(sql,/oe\.purchase_day\+6/);
 assert.match(sql,/g\.last_purchase_day\+3/);
 assert.match(sql,/n\.entry_type='sale'/);
 assert.match(sql,/rev\.entry_type='reversal'/);
 assert.match(sql,/GRANT EXECUTE ON FUNCTION public\.taphoa_order_cycles_view\(\) TO authenticated/);
 assert.match(sql,/REVOKE ALL ON FUNCTION public\.taphoa_order_cycles_view\(\) FROM PUBLIC,anon/);
 assert.doesNotMatch(sql,/\b(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+public\.(?:taphoa_debt_ledger|v21_messages|taphoa_orders)/i);
 assert.doesNotMatch(sql,/cron\.schedule|taphoa_chat_notify_customer|send_due_notices|send_pre_due_notices/i);
 assert.match(bridge,/async function orderCycles\(\)/);
 assert.match(bridge,/readSheet,debtLedger,debtCycles,orderCycles,ledgerToRows/);
 assert.match(business,/orderCycles:\(\)=>gateway\.rpc\('taphoa_order_cycles_view',\{\}\)/);
 assert.match(html,/fixed-ui-debt-cycles\.js\?v=[^"]*order-cycles=20261104/);
 assert.match(html,/fixed-production-bridge\.js\?v=[^"]*order-cycles=20261104/);
});
