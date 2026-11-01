import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const page=readFileSync(new URL('../admin-gia.html',import.meta.url),'utf8');
const source=readFileSync(new URL('../src/admin-customer-care-report.js',import.meta.url),'utf8');
const start=source.indexOf('  // SPEC-ADMIN-CARE-PERIOD-COHORT-20261101:');
const end=source.indexOf('  function render(){',start);
assert.ok(start>=0&&end>start);
function summary(data){
 const ctx=vm.createContext({data});
 vm.runInContext(source.slice(start,end).split('  function invalidatePeriodFigures(){')[0]+
   '\nglobalThis.result=periodCustomerSummary(data);',ctx);
 return JSON.parse(JSON.stringify(ctx.result));
}
test('buyers and orders actually change between October and November, unlike lifetime totals',()=>{
 const october={
  customers:[...Array.from({length:36},(_,i)=>({period_delivered_count:i===0?156:1})),...Array.from({length:21},()=>({period_delivered_count:0}))],
  system:{delivered_orders:191},bought_customers:38
 };
 const november={
  customers:[...Array.from({length:7},(_,i)=>({period_delivered_count:i===0?4:1})),...Array.from({length:50},()=>({period_delivered_count:0}))],
  system:{delivered_orders:10},bought_customers:38
 };
 assert.deepEqual(summary(october),{roster:57,buying:36,notBuying:21,orders:191,rosterOrders:191});
 assert.deepEqual(summary(november),{roster:57,buying:7,notBuying:50,orders:10,rosterOrders:10});
});
test('all system delivered orders remain visible even when an order lacks a roster customer',()=>{
 assert.deepEqual(summary({customers:[{period_delivered_count:2},{period_delivered_count:0}],system:{delivered_orders:3}}),
  {roster:2,buying:1,notBuying:1,orders:3,rosterOrders:2});
});
test('customer filters default to buyers in selected period, with lifetime/current filters explicit',()=>{
 assert.match(page,/<option value="period" selected>Khách mua trong kỳ<\/option>/);
 assert.match(page,/<option value="no_period">Chưa mua trong kỳ<\/option>/);
 assert.match(page,/Nhóm hiện tại/);
 assert.match(page,/Còn nợ · hiện tại/);
 assert.match(source,/if\(filter==='period'\)return Number\(r\.period_delivered_count\)>0/);
 assert.match(source,/if\(filter==='no_period'\)return Number\(r\.period_delivered_count\)===0/);
 assert.match(source,/Number\(b\.period_delivered_count\|\|0\)-Number\(a\.period_delivered_count\|\|0\)/);
});
test('KPI numbers are based on true period data; lifetime metrics carry distinct labels',()=>{
 for(const key of ['careOrders','careEverBought'])assert.match(page,new RegExp('id="'+key+'"'));
 assert.match(source,/\$\('careBought'\)\.textContent=number\(periodSummary\.buying\)/);
 assert.match(source,/\$\('careNever'\)\.textContent=number\(periodSummary\.notBuying\)/);
 assert.match(source,/\$\('careOrders'\)\.textContent=number\(periodSummary\.orders\)/);
 assert.match(source,/\$\('careEverBought'\)\.textContent=number\(data\?\.bought_customers\)/);
 assert.match(source,/if\(\(data\?\.period_start\?\?null\)!==\(period\.p_start_date\?\?null\)/);
 assert.match(source,/function invalidatePeriodFigures\(\)/);
});
