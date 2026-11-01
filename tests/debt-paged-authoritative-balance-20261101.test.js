import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

// SPEC-DEBT-PAGED-BALANCE-20261101
// Given 50 newest ledger transactions out of 189, WHEN the user opens
// or scrolls a debt statement, THEN totals and debtor-group membership
// must use the backend cumulative balance_after, NOT the partial sum.
// MUST-STAY: summary BAL rows, ledger pagination, cycle history, ledger
// figures, bank/Chat collection logic, user permissions and finance data.
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const runtime=read('src/fixed-ui-runtime-11.js');
const normalize=read('src/fixed-ui-behavior.js');
const bridge=read('src/fixed-production-bridge.js');
const pager=read('src/fixed-ui-debt-pagination.js');

const start=runtime.indexOf('            let customerDebts = {}; let customerHistory = {};');
const end=runtime.indexOf('            let totalDebt = 0;',start);
assert.ok(start>=0&&end>start,'debt owner found');
const compute=runtime.slice(start,end)+'\n globalThis.result = {customerDebts,customerHistory};';

function run(rows){
  const khRows=[['A','Khách A'],['B','Khách B'],['C','Khách C']];
  const env={
    khRows,
    appData:{thuchi:[['id','customer','type','movement','time','balanceAfter'],...rows]},
    latestDeliveredDateKeyByCustomer:()=>({}),
    customerAvatarMarkup:()=>'',debtDaysFromDeliveryDateKey:()=>null
  };
  vm.runInNewContext(compute,env,{timeout:1000});
  return JSON.parse(JSON.stringify(env.result));
}
const row=(id,customer,movement,balanceAfter)=>[
  id,customer,'Thu / Giao',movement,'01/11/2026 12:00:00',balanceAfter
];

test('ledger page total does not replace official customer balance',()=>{
  // The last/most recent row represents 50 of 189 records.
  // Loaded amounts sum to -40 although true account debt is +507.
  const recent=Array.from({length:50},(_,i)=>
    row(140+i,'A',i===0?-40:0,i===49?507:507-i));
  const result=run([...recent,row('BAL0001','B',-3271,'')]);
  assert.equal(result.customerDebts.A.debt,507);
  assert.equal(result.customerDebts.B.debt,-3271);
  assert.equal(result.customerDebts.C.debt,0);
  assert.equal(result.customerHistory.A.length,50);
});

test('scrolling older pages never makes the most recent balance change',()=>{
  const newest=[row(188,'A',-3305,3346),row(189,'A',+805,4151)];
  const older=Array.from({length:50},(_,i)=>row(138+i,'A',i%2?-8:9,100+i));
  const result=run([...older,...newest]);
  assert.equal(result.customerDebts.A.debt,4151);
  assert.equal(result.customerHistory.A.length,52);
});

test('zero, negative and missing snapshot balances retain correct semantics',()=>{
  const zero=run([row(1,'A',+100,100),row(2,'A',-100,0)]);
  assert.equal(zero.customerDebts.A.debt,0);
  const credit=run([row(1,'A',+20,20),row(2,'A',-35,-15)]);
  assert.equal(credit.customerDebts.A.debt,-15);
  const missing=run([row('BAL01','A',120,'')]);
  assert.equal(missing.customerDebts.A.debt,120,'summary fallback is still allowed');
  const invalid=run([row(1,'A',8,'not-a-number')]);
  assert.equal(invalid.customerDebts.A.debt,8,'invalid balance cannot become NaN or zero');
});

test('server supplies cumulative balances and behavior sorts rows by timestamp and stable ledger ID',()=>{
  assert.match(bridge,/const balanceAfter=first\(tx,\['balanceAfter','balance_after'\]/);
  assert.ok(bridge.includes("balanceAfter===''?'':"));
  assert.match(normalize,/function __normalizeDebtLedgerRows\(\)/);
  assert.match(normalize,/rows\.sort\(\(a,b\)=>/);
  assert.match(normalize,/Number\(a\?\.\[0\]\)\|\|0/);
  assert.match(pager,/state\.transactions\.push\(\.\.\.fresh\)/);
  assert.match(pager,/renderPage\(state\)/);
  assert.match(runtime,/serverLedgerBalances\.set\(String\(maKh\), Number\(balanceAfter\)\)/);
});
