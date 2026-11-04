import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const js=fs.readFileSync(new URL('../src/fixed-ui-debt-cycles.js',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../src/fixed-ui-debt-cycles.css',import.meta.url),'utf8');
const index=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const bridge=fs.readFileSync(new URL('../src/fixed-production-bridge.js',import.meta.url),'utf8');
const api=fs.readFileSync(new URL('../src/core/business.js',import.meta.url),'utf8');
const render=fs.readFileSync(new URL('../src/fixed-ui-runtime-11.js',import.meta.url),'utf8');
const sql=fs.readFileSync(new URL('../supabase/migrations/20261023073000_debt_cycles_readonly_full_history.sql',import.meta.url),'utf8');
const deliverySql=fs.readFileSync(new URL('../supabase/migrations/20261023075500_debt_cycle_true_delivery_time.sql',import.meta.url),'utf8');

test('readonly cycle boundary and policy semantics protect financial ledger',()=>{
  assert.match(sql,/balance_after>0 and r\.balance_after-r\.amount_vnd<=0 then 1 else 0 end as started/);
  assert.match(sql,/balance_after<=0 and r\.balance_after-r\.amount_vnd>0 then 1 else 0 end as closed/);
  assert.match(sql,/sum\(t\.started\) over \(/);
  assert.match(sql,/where n\.cycle_no>0/);
  assert.match(sql,/rows between unbounded preceding and current row/);
  assert.match(sql,/l\.entry_type='sale'/);
  assert.match(sql,/entry_type='reversal'/);
  assert.match(sql,/threeDayStop/);
  assert.match(sql,/daysOverSeven/);
  assert.match(deliverySql,/left join public\.taphoa_orders o on o\.id=l\.order_id/);
  assert.match(deliverySql,/max\(coalesce\(n\.delivered_at_for_purchase,n\.created_at\)\)/);
  assert.match(sql,/ctx->>'taphoa_role',''\) <> 'admin'/);
  assert.match(sql,/revoke all on function public\.taphoa_debt_cycles\(\) from public,anon/);
  assert.match(sql,/grant execute on function public\.taphoa_debt_cycles\(\) to authenticated/);
  assert.doesNotMatch(sql,/\b(update|delete|insert)\s+(into\s+|from\s+)?(?:public\.)?taphoa_debt_ledger\b/i);
  assert.doesNotMatch(sql,/\bcreate\s+table\b/i);
  assert.match(api,/debtCycles:\(\)=>gateway\.rpc\('taphoa_debt_cycles',\{\}\)/);
  assert.match(bridge,/async function debtCycles\(\)/);
  assert.match(bridge,/readSheet,debtLedger,debtCycles,orderCycles,ledgerToRows/);
  assert.match(api,/orderCycles:\(\)=>gateway\.rpc\('taphoa_order_cycles_view',\{\}\)/);
});

test('cycle UI hooks the original debt list and modal without touching finance actions',()=>{
  assert.match(index,/fixed-ui-debt-cycles\.css/);
  assert.match(index,/fixed-ui-debt-cycles\.js/);
  assert(index.indexOf('fixed-production-overrides.js')<index.indexOf('fixed-ui-debt-cycles.js'));
  assert.match(render,/data-debt-customer-id="\$\{escapeProductEditorValue\(c\.maKh\)\}"/);
  assert.match(css,/#tab-cong-no \.debt-cycle-card-meta/);
  assert.match(css,/#customerDebtContentToShare \.debt-cycle-history/);
  assert.match(js,/const result=oldRender\.apply\(this,args\)/);
  assert.match(js,/const result=await oldOpen\.call\(this,customerId,\.\.\.args\)/);
  assert.doesNotMatch(js,/submitQuickDebt|submitPopupDebt|debtTransaction\(/);
});

test('on opening Công nợ, renders cycle number, buy count, days idle, and complete historical list',async()=>{
  class Node{
    constructor(tag){
      this.tag=tag;this.children=[];this.className='';this.dataset={};
      this.textContent='';this.attrs={};this.classList={contains:()=>false};
    }
    append(...nodes){this.children.push(...nodes);}
    appendChild(n){this.children.push(n);return n;}
    insertBefore(n){this.children.push(n);return n;}
    replaceChildren(...nodes){this.children=nodes;}
    setAttribute(k,v){this.attrs[k]=v;}
    querySelector(sel){
      if(sel==='#debtCyclePanel')return this.children.find(x=>x.id==='debtCyclePanel')||null;
      if(sel==='.debt-cycle-card-meta')return this.children.find(x=>x.className==='debt-cycle-card-meta')||null;
      return null;
    }
  }
  const body1=new Node('div'),body2=new Node('div');
  const makeCard=(id,body)=>({
    dataset:{debtCustomerId:id},
    querySelector:s=>s==='.debt-customer-body'?body:null
  });
  const cards=[makeCard('a',body1),makeCard('b',body2)];
  const list=new Node('list');
  list.querySelectorAll=()=>cards;
  const modal=new Node('div');
  const history=new Node('div');
  const wrapper={classList:{contains:()=>false}};
  const elements={debtCustomerListContainer:list,customerDebtContentToShare:modal,
    cDebtModalHistoryList:history,customerDebtModalWrapper:wrapper};
  const records=[
    {customerId:'a',monthly:[{month:'2026-10',purchaseDays:1,orderCount:3,carryOver:12}],cycles:[
      {number:1,startDay:'2026-10-01',endDay:'2026-10-09',closedAt:'2026-10-09',
        durationDays:9,purchaseCount:4,daysWithoutPurchase:2},
      {number:2,startDay:'2026-10-12',closedAt:null,durationDays:12,purchaseCount:5,
        daysWithoutPurchase:4}
    ]},
    {customerId:'b',monthly:[{month:'2026-10',purchaseDays:2,orderCount:2,carryOver:0}],cycles:[{number:1,startDay:'2026-10-22',closedAt:null,durationDays:2,
      purchaseCount:2,daysWithoutPurchase:1}]}
  ];
  let reads=0;
  const window={
    renderCongNo(){},
    openCustomerDebtModal(customerId){context.activeDebtCustomerId=customerId;},
    TAPHOA_PRODUCTION:{async debtCycles(){reads++;return records;}}
  };
  const context={window,document:{
    getElementById:id=>elements[id]||null,
    createElement:tag=>new Node(tag)
  },console,Date,Map,Set,Intl,Number,Math,hasPermission:()=>true,
  appData:{thuchi:[['header'],['id','a','','','','','summary']]},
  activeDebtCustomerId:null};
  vm.createContext(context);vm.runInContext(js,context);
  window.renderCongNo();
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(reads,1,'one full-history RPC for the entire debt tab');
  const visibleText=node=>String(node.textContent||'')+(node.children||[]).map(visibleText).join('');
  assert.match(visibleText(body1.children[0]),/Trễ 5 ngày · CK2 \(5 đơn\)/);
  assert.match(visibleText(body1.children[0]),/T10\/2026 · 1 ngày mua\/3 đơn/);
  assert.doesNotMatch(visibleText(body1.children[0]),/Cách lần mua gần nhất/);
  assert.match(body1.children[0].title,/Cách lần mua gần nhất 4 ngày/,
    'full monitoring explanation remains available outside the compact list');
  assert.match(visibleText(body2.children[0]),/Cách mua 1 ngày · CK1 \(2 đơn\)/);
  assert.equal(body1.children[0].children[0].className,'debt-cycle-card-status');
  assert.equal(body1.children[0].children[1].className,'debt-cycle-card-context');
  window.renderCongNo();
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(reads,1,'cached RPC is not repeated by every render');
  await window.openCustomerDebtModal('a');
  const panel=modal.children.find(n=>n.id==='debtCyclePanel');
  assert(panel);
  assert.match(panel.children[0].textContent,/1 ngày mua\/3 đơn/);
  const advice=panel.children.find(n=>n.tag==='details'&&n.className==='debt-cycle-advice');
  assert(advice,'full policy guidance must remain expandable in customer detail');
  assert.match(advice.children[0].textContent,/Trễ 5 ngày/);
  assert.doesNotMatch(advice.children[0].textContent,/Có thể trao đổi trực tiếp/);
  assert.match(advice.children[1].textContent,/Có thể trao đổi trực tiếp, tránh nhắc liên tục/);
  const details=panel.children.find(n=>n.tag==='details'&&n.children[0]?.textContent?.includes('chu kỳ'));
  assert(details);
  assert.equal(panel.children.filter(n=>n.tag==='details'&&n.className==='debt-cycle-history').length,1,
    'one expandable link contains both monthly and debt-cycle history');
  assert.equal(details.children.filter(n=>n.tag==='ol').length,2);
  assert.equal(details.children.at(-1).children.length,2);
  assert.match(details.children.at(-1).children[0].children[0].textContent,/Chu kỳ 1 · Đã tất toán/);
  assert.match(details.children.at(-1).children[1].children[0].textContent,/Chu kỳ 2 · Chưa tất toán/);
  assert.equal(window.TAPHOA_DEBT_CYCLES.current('a').number,2);
});


test('compact readonly debt UI limits card status to two lines and retains history, policy, and cash actions',()=>{
  const source=fs.readFileSync(new URL('../src/fixed-ui-runtime-12.js',import.meta.url),'utf8');
  assert.match(css,/\.debt-cycle-card-meta\{[\s\S]*?-webkit-line-clamp:2/);
  assert.match(css,/#customerDebtContentToShare \.debt-cycle-advice > summary\{/);
  assert.match(js,/panel\.title=monthCountText\(month\)/);
  assert.match(js,/makeText\('p','debt-cycle-detail-explanation',alertText\(current\)\)/);
  assert.match(js,/makeText\('summary','debt-cycle-detail-warning'/);
  assert.match(js,/current\.policyDueDay\?' · Hạn '/);
  assert.match(js,/Tất cả '\+cycles\.length\+' chu kỳ/);
  assert.match(js,/Xem lịch sử kỳ mua và chu kỳ/);
  assert.match(source,/function openCustomerDebtModal\(/);
  assert.match(source,/h\.soTien\.toLocaleString\('vi-VN'\)/);
  assert.match(source,/h\.currentDebt\.toLocaleString\('vi-VN'\)/);
  assert.match(index,/fixed-ui-debt-cycles\.css\?v=compact-20261101/);
  assert.match(index,/fixed-ui-debt-cycles\.js\?v=compact-20261101/);
});

test('compact debt warning keeps due, overdue, and pending evidence visually distinct',()=>{
  const a=js.indexOf('  function briefCycleStatus(cycle){');
  const b=js.indexOf('  function alertText(cycle){',a);
  assert(a>=0&&b>a);
  const brief=vm.runInNewContext(js.slice(a,b)+'\nbriefCycleStatus',
    {numeric:v=>Math.max(0,Number(v)||0)});
  const base={durationDays:12,daysWithoutPurchase:24,
    policyDueDay:'2026-09-26',policyIsDue:true,policyDaysOverdue:36};
  assert.equal(brief(base),'Trễ 36 ngày');
  assert.equal(brief({...base,policyPendingEvidence:true}),'Chờ đối soát bill');
  assert.equal(brief({...base,policyIsDue:false,daysWithoutPurchase:1}),'Cách mua 1 ngày');
  assert.equal(brief({...base,policyDaysOverdue:0}),'Đến hạn đối chiếu');
});


test('readonly user debt view skips admin-only cycle RPC without an error banner',async()=>{
  const warnings=[];
  let reads=0,mainRenders=0,mainOpens=0,removed=0;
  let identity={uid:'u1',role:'user'};
  const stalePanel={remove:()=>{removed++}};
  const holder={querySelector:selector=>selector==='#debtCyclePanel'?stalePanel:null};
  const list={querySelectorAll:()=>[],querySelector:()=>null};
  const elements={debtCustomerListContainer:list,customerDebtContentToShare:holder,
    cDebtModalHistoryList:{}};
  const window={
    renderCongNo(){mainRenders++;},
    openCustomerDebtModal(){mainOpens++;},
    TAPHOA_PRODUCTION:{
      getIdentity:()=>identity,getAccessMode:()=> 'account',
      async debtCycles(){reads++;return [];}
    }
  };
  const ctx={window,document:{getElementById:id=>elements[id]||null},hasPermission:()=>true,
    console:{warn:(...args)=>warnings.push(args)},Date,Map,Set,Intl,Number,Math};
  vm.createContext(ctx);vm.runInContext(js,ctx);
  window.renderCongNo();
  await new Promise(resolve=>setImmediate(resolve));
  await window.openCustomerDebtModal('u1');
  assert.equal(mainRenders,1,'canonical debt list remains accessible');
  assert.equal(mainOpens,1,'canonical readonly debt modal still opens');
  assert.equal(reads,0,'never invoke admin-only debt cycles for user');
  assert.equal(warnings.length,0,'no misleading failed-RPC banner');
  assert.ok(removed>=1,'old admin cycle detail must not remain in user modal');
  assert.equal(window.TAPHOA_DEBT_CYCLES.current('u1'),null);
  assert.equal(window.TAPHOA_DEBT_CYCLES.list('u1').length,0);
});

test('admin cycle fetch completing after switching to user is ignored and not exposed through UI API',async()=>{
  let resolveRequest,reads=0,mainRenders=0;
  let identity={uid:'admin-a',role:'admin'};
  const warnings=[];
  const window={
    renderCongNo(){mainRenders++;},
    TAPHOA_PRODUCTION:{
      getIdentity:()=>identity,getAccessMode:()=> 'account',
      debtCycles:()=>{reads++;return new Promise(resolve=>{resolveRequest=resolve})}
    }
  };
  const ctx={window,document:{getElementById:()=>null},hasPermission:()=>true,
    console:{warn:(...args)=>warnings.push(args)},Date,Map,Set,Intl,Number,Math};
  vm.createContext(ctx);vm.runInContext(js,ctx);
  window.renderCongNo();
  assert.equal(reads,1);
  identity={uid:'user-b',role:'user'};
  window.renderCongNo();
  resolveRequest([{customerId:'c1',cycles:[{number:1,closedAt:null,daysWithoutPurchase:2}]}]);
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(mainRenders,2);
  assert.equal(warnings.length,0);
  assert.equal(reads,1);
  assert.equal(window.TAPHOA_DEBT_CYCLES.current('c1'),null);
  assert.equal(window.TAPHOA_DEBT_CYCLES.list('c1').length,0);
});


test('debt overview uses compact spacing without shrinking payment controls',()=>{
 const popup=fs.readFileSync(new URL('../src/fixed-ui-debt-popup.css',import.meta.url),'utf8');
 const markup=fs.readFileSync(new URL('../src/fixed-ui-markup-2.js',import.meta.url),'utf8');
 assert.match(popup,/SPEC-DEBT-WORKSPACE-DENSITY-20261101/);
 assert.match(popup,/#tab-cong-no > header\{[\s\S]*?padding-top:10px;[\s\S]*?padding-bottom:12px;/);
 assert.match(popup,/#tab-cong-no #totalDebtDisplay,[\s\S]*?#tab-cong-no #totalSurplusDisplay\{[\s\S]*?padding:5px 8px;[\s\S]*?font-size:clamp\(12px,3vw,14px\);/);
 assert.match(popup,/#tab-cong-no > main\{[\s\S]*?padding:12px 14px 80px;/);
 assert.match(popup,/#tab-cong-no > main > \[data-permission="canMutateDebt"\]\.hidden \+ div\{[\s\S]*?margin-top:0 !important;/,
  'readonly user must not retain the hidden quick form spacing');
 assert.match(popup,/#tab-cong-no \.debt-customer-card\{[\s\S]*?min-height:72px;[\s\S]*?padding:11px 12px;/);
 assert.match(popup,/#tab-cong-no #quickDebtCustomerButton,[\s\S]*?#tab-cong-no button\[onclick\^="submitQuickDebt\("\]\{[\s\S]*?min-height:44px;/);
 assert.match(markup,/data-permission=\\?"canMutateDebt\\?"/);
 assert.match(markup,/id=\\?"quickDebtAmount\\?"/);
 assert.match(index,/fixed-ui-debt-popup\.css\?v=[^"\\]*density=20261101/);
});

test('customer debt modal keeps the existing ledger scroll owner and readable fixed payment actions',()=>{
 const popup=fs.readFileSync(new URL('../src/fixed-ui-debt-popup.css',import.meta.url),'utf8');
 const markup=fs.readFileSync(new URL('../src/fixed-ui-markup-4.js',import.meta.url),'utf8');
 assert.match(popup,/#customerDebtBottomSheet > \.cart-handle \+ div\{[\s\S]*?padding:8px 14px;/);
 assert.match(popup,/#customerDebtBottomSheet #cDebtModalHistoryList\{[\s\S]*?padding:9px 14px;[\s\S]*?min-height:0;/);
 assert.match(popup,/#customerDebtBottomSheet #cDebtModalHistoryList > div:not\(#debtHistoryPageFooter\)\{[\s\S]*?min-height:44px;/);
 assert.match(popup,/#customerDebtBottomSheet > \[data-permission="canMutateDebt"\]\{[\s\S]*?padding:12px 16px;/);
 assert.match(popup,/#customerDebtBottomSheet #popupDebtAmount,[\s\S]*?button\[onclick\^="submitPopupDebt\("\]\{[\s\S]*?min-height:44px;/);
 assert.match(markup,/id=\\?"cDebtModalHistoryList\\?"/);
 assert.match(markup,/id=\\?"popupDebtAmount\\?"/);
 assert.match(markup,/submitPopupDebt\(\\?'thu\\?'\)/);
 assert.match(markup,/submitPopupDebt\(\\?'no\\?'\)/);
 assert.match(popup,/#cDebtModalHistoryList \.debt-history-more-button/);
});


test('debt-card status hierarchy keeps overdue red while monthly metadata stays muted',()=>{
 const view=fs.readFileSync(new URL('../src/fixed-ui-debt-cycles.css',import.meta.url),'utf8');
 assert.match(view,/\.debt-cycle-card-meta\[data-warning="true"\]\{color:#475569/);
 assert.match(view,/\.debt-cycle-card-meta\[data-warning="true"\] \.debt-cycle-card-status\{color:#b42318\}/);
 assert.match(view,/\.debt-cycle-card-context\{color:#64748b/);
 assert.match(view,/-webkit-line-clamp:2/);
 assert.match(js,/panel\.replaceChildren\(/);
});

test('last-transaction caption hides clock time in card without modifying the ledger',()=>{
 const a=render.indexOf('                const lastDate = String(c.lastTime');
 const b=render.indexOf('\n\n                listHtml +=',a);
 assert(a>=0&&b>a,'short caption belongs to source renderer');
 const caption=vm.runInNewContext('(c,currentDebtFilter)=>{'+render.slice(a,b)+';return subText;}',{String,Number});
 assert.equal(caption({lastTime:'09/10/2026 20:45:01',debt:41,daysAgo:24},'no'),
   'GD cuối 09/10/2026 · Giao cách 24 ngày');
 assert.equal(caption({lastTime:'09/10/2026 20:45:01',debt:0,daysAgo:24},'het'),
   'GD cuối 09/10/2026');
 const popup=fs.readFileSync(new URL('../src/fixed-ui-debt-popup.css',import.meta.url),'utf8');
 assert.match(popup,/#tab-cong-no \.debt-customer-detail\{[\s\S]*?color:#64748b/);
 assert.match(popup,/#tab-cong-no > main > div:nth-child\(2\)\{/);
});


test('debt card amount occupies rows 1–2 while full cycle summary spans through right edge on row 3',()=>{
 const layout=fs.readFileSync(new URL('../src/fixed-ui-debt-popup.css',import.meta.url),'utf8');
 assert.match(layout,/SPEC-DEBT-CARD-THIRD-ROW-20261101/);
 assert.match(layout,/#tab-cong-no \.debt-customer-card\{\s*\/\*[\s\S]*?grid-template-rows:auto auto;/);
 assert.match(layout,/#tab-cong-no \.debt-customer-body\{\s*display:contents;/,
   'name, activity, and optional cycle summary must participate in the parent grid');
 assert.match(layout,/#tab-cong-no \.debt-customer-avatar\{[\s\S]*?grid-column:1;[\s\S]*?grid-row:1 \/ 3;/);
 assert.match(layout,/#tab-cong-no \.debt-customer-name\{[\s\S]*?grid-column:2;[\s\S]*?grid-row:1;/);
 assert.match(layout,/#tab-cong-no \.debt-customer-detail\{[\s\S]*?grid-column:2;[\s\S]*?grid-row:2;/);
 assert.match(layout,/#tab-cong-no \.debt-customer-money\{[\s\S]*?grid-column:3;[\s\S]*?grid-row:1 \/ 3;[\s\S]*?align-self:center;/);
 assert.match(layout,/#tab-cong-no \.debt-cycle-card-meta\{[\s\S]*?grid-column:2 \/ 4;[\s\S]*?grid-row:3;/);
 assert.match(layout,/#tab-cong-no \.debt-customer-card\{[\s\S]*?min-height:64px;/);
 assert.match(css,/\.debt-cycle-card-meta\{[\s\S]*?-webkit-line-clamp:2/,
   'long policy descriptions may wrap but stay bounded to two lines');
 assert.match(render,/class="debt-customer-body pointer-events-none min-w-0"/);
 assert.match(render,/class="debt-customer-money pointer-events-none/);
 assert.match(js,/body\.appendChild\(panel\)/,
   'cycle metadata is the last body child, exposed to grid through display:contents');
});

test('wide third row is optional: user debt cards without full-history cycle RPC keep only two grid rows',()=>{
 const layout=fs.readFileSync(new URL('../src/fixed-ui-debt-popup.css',import.meta.url),'utf8');
 assert.match(layout,/grid-template-rows:auto auto;/);
 assert.doesNotMatch(layout,/grid-template-rows:auto auto auto;/);
 assert.match(layout,/#tab-cong-no \.debt-customer-avatar\{[\s\S]*?grid-row:1 \/ 3;/);
 assert.match(layout,/#tab-cong-no \.debt-customer-money\{[\s\S]*?grid-row:1 \/ 3;/);
 assert.match(index,/fixed-ui-debt-popup\.css\?v=[^"\\]*density=20261101/);
});
