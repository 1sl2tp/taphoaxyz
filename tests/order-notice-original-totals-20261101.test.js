import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const bridge=readFileSync(new URL('../src/fixed-production-bridge.js',import.meta.url),'utf8');
const start=bridge.indexOf('// SPEC-ORDER-NOTICE-ORIGINAL-NUMBERS-20261101:');
const end=bridge.indexOf('async function attachOrderNoticePortrait(',start);
assert.ok(start>=0&&end>start);
const ctx=vm.createContext({Number,String,Math});
vm.runInContext(bridge.slice(start,end)+'globalThis.calc=orderNoticeTotals;',ctx);
const calc=ctx.calc;
const items=[
 {qty:1.5,unit_price:1000.5},
 {sl:2.25,gia:200.5}
];
test('portrait totals are summed from numeric line quantities, not formatted text',()=>{
 const r=calc({},items);
 assert.equal(r.totalQty,3.75);
 assert.equal(r.totalPrice,1951.875);
 assert.equal(Math.round(r.totalPrice),1952);
});
test('missing and null top-level totals fall back to line totals, not false zero',()=>{
 for(const value of [undefined,null,'']){
  const r=calc({tongSL:value,tongTien:value},items);
  assert.equal(r.totalQty,3.75);
  assert.equal(r.totalPrice,1951.875);
 }
});
test('valid authoritative totals take precedence; explicitly zero means zero',()=>{
 assert.equal(calc({tongSL:9,tongTien:15000},items).totalQty,9);
 assert.equal(calc({tongSL:9,tongTien:15000},items).totalPrice,15000);
 assert.equal(calc({tongSL:0,tongTien:0},items).totalPrice,0);
});
test('portrait still preserves precise line amounts but rounds displayed grand total only',()=>{
 assert.match(bridge,/totalText:format\(qty\*price\)/);
 assert.match(bridge,/totalQty:totals\.totalQty/);
 assert.match(bridge,/totalPriceText:format\(Math\.sign\(totals\.totalPrice\)\*Math\.round\(Math\.abs\(totals\.totalPrice\)\)\)/);
 assert.doesNotMatch(bridge,/Number\(String\(x\.qtyText\)\.replace\(/);
});
