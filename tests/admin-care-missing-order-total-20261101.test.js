import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const src=readFileSync(new URL('../src/admin-customer-care-report.js',import.meta.url),'utf8');
const start=src.indexOf('  // SPEC-ADMIN-CARE-PERIOD-COHORT-20261101:');
const end=src.indexOf('  function invalidatePeriodFigures(){',start);
assert.ok(start>=0&&end>start);
function summarize(input){
 const ctx=vm.createContext({input});
 vm.runInContext(src.slice(start,end)+'globalThis.out=periodCustomerSummary(input);',ctx);
 return JSON.parse(JSON.stringify(ctx.out));
}
const customers=[{period_delivered_count:3},{period_delivered_count:2},{period_delivered_count:0}];
test('missing system total must not falsely show zero orders when customers have sales',()=>{
 for(const value of [undefined,null,'']){
  assert.equal(summarize({customers,system:{delivered_orders:value}}).orders,5);
 }
 assert.equal(summarize({customers}).orders,5);
});
test('explicit system zero is preserved; actual system total takes priority',()=>{
 assert.equal(summarize({customers,system:{delivered_orders:0}}).orders,0);
 assert.equal(summarize({customers,system:{delivered_orders:7}}).orders,7);
 assert.equal(summarize({customers,system:{delivered_orders:'7'}}).orders,7);
});
test('list cohort counts are based only on unique buyers in the period',()=>{
 assert.deepEqual(summarize({customers,system:{delivered_orders:5}}),{
  roster:3,buying:2,notBuying:1,orders:5,rosterOrders:5
 });
});
