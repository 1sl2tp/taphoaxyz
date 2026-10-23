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

test('readonly cycle boundary and policy semantics protect financial ledger',()=>{
  assert.match(sql,/balance_after>0 and r\.balance_after-r\.amount_vnd<=0 then 1 else 0 end as started/);
  assert.match(sql,/balance_after<=0 and r\.balance_after-r\.amount_vnd>0 then 1 else 0 end as closed/);
  assert.match(sql,/sum\(t\.started\) over \(/);
  assert.match(sql,/where n\.cycle_no>0/);
  assert.match(sql,/rows between unbounded preceding and current row/);
  assert.match(sql,/r\.entry_type='sale'/);
  assert.match(sql,/entry_type='reversal'/);
  assert.match(sql,/threeDayStop/);
  assert.match(sql,/daysOverSeven/);
  assert.match(sql,/ctx->>'taphoa_role',''\) <> 'admin'/);
  assert.match(sql,/revoke all on function public\.taphoa_debt_cycles\(\) from public,anon/);
  assert.match(sql,/grant execute on function public\.taphoa_debt_cycles\(\) to authenticated/);
  assert.doesNotMatch(sql,/\b(update|delete|insert)\s+(into\s+|from\s+)?(?:public\.)?taphoa_debt_ledger\b/i);
  assert.doesNotMatch(sql,/\bcreate\s+table\b/i);
  assert.match(api,/debtCycles:\(\)=>gateway\.rpc\('taphoa_debt_cycles',\{\}\)/);
  assert.match(bridge,/async function debtCycles\(\)/);
  assert.match(bridge,/readSheet,debtLedger,debtCycles,ledgerToRows/);
});

test('cycle UI hooks the original debt list and modal without touching finance actions',()=>{
  assert.match(index,/fixed-ui-debt-cycles\.css/);
  assert.match(index,/fixed-ui-debt-cycles\.js/);
  assert(index.indexOf('fixed-production-overrides.js')<index.indexOf('fixed-ui-debt-cycles.js'));
  assert.match(render,/data-debt-customer-id="\$\{c\.maKh\}"/);
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
    {customerId:'a',cycles:[
      {number:1,startDay:'2026-10-01',endDay:'2026-10-09',closedAt:'2026-10-09',
        durationDays:9,purchaseCount:4,daysWithoutPurchase:2},
      {number:2,startDay:'2026-10-12',closedAt:null,durationDays:12,purchaseCount:5,
        daysWithoutPurchase:4}
    ]},
    {customerId:'b',cycles:[{number:1,startDay:'2026-10-22',closedAt:null,durationDays:2,
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
  assert.match(body1.children[0].textContent,/Chu kỳ 2 · Ngày 12 · 5 lượt mua/);
  assert.match(body1.children[0].textContent,/Quá hạn 5 ngày/);
  assert.match(body1.children[0].textContent,/Đã ngừng mua 4 ngày/);
  assert.match(body2.children[0].textContent,/Chu kỳ 1 · Ngày 2 · 2 lượt mua/);
  window.renderCongNo();
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(reads,1,'cached RPC is not repeated by every render');
  await window.openCustomerDebtModal('a');
  const panel=modal.children.find(n=>n.id==='debtCyclePanel');
  assert(panel);
  const details=panel.children.find(n=>n.tag==='details');
  assert(details);
  assert.equal(details.children.at(-1).children.length,2);
  assert.match(details.children.at(-1).children[0].children[0].textContent,/Chu kỳ 1 · Đã tất toán/);
  assert.match(details.children.at(-1).children[1].children[0].textContent,/Chu kỳ 2 · Chưa tất toán/);
  assert.equal(window.TAPHOA_DEBT_CYCLES.current('a').number,2);
});
