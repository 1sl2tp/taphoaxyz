import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const src=readFileSync(new URL('../src/fixed-ui-cart-share-v3.js',import.meta.url),'utf8');
const from=src.indexOf('  // SPEC-ORDER-SHARE-ROUND-TOTAL-20261101:');
const helperEnd=src.indexOf('  function stableShareHash(value){',from);
const detailStart=src.indexOf('  function detailNativeShareText(source){');
const detailEnd=src.indexOf('  async function shareNativeOrderText(',detailStart);
assert.ok(from>=0&&helperEnd>from&&detailStart>0&&detailEnd>detailStart);
const ctx=vm.createContext({});
vm.runInContext(src.slice(from,helperEnd)+src.slice(detailStart,detailEnd)+'globalThis.shareText=detailNativeShareText;',ctx);
function row(values){
 return {querySelector:selector=>({textContent:values[selector]||''})};
}
function modal(items,footer=''){
 return {
  querySelector:selector=>({textContent:{
   '#detailModalOrderCode':'DG42','#detailModalKH':'Khách thử',
   '#detailModalTime':'01/11/2026','#detailModalTotal':footer
  }[selector]||''}),
  querySelectorAll:()=>items
 };
}
test('native detail share keeps decimal line prices and rounds the grand total once if footer missing',()=>{
 const text=ctx.shareText(modal([
  row({'.order-stt':'1','.order-name':'Sữa','.order-qty':'1',
       '.order-price':'1.807,5','.order-total':'1.807,5'}),
  row({'.order-stt':'2','.order-name':'Bánh','.order-qty':'1',
       '.order-price':'2,5','.order-total':'2,5'})
 ]));
 assert.match(text,/1\.807,5/);
 assert.match(text,/2,5/);
 assert.match(text,/Tổng tiền: 1\.810/);
 assert.doesNotMatch(text,/Tổng tiền: 1\.811/);
});
test('native detail share keeps an existing footer but normalizes decimals to rounded VND total',()=>{
 const text=ctx.shareText(modal([row({'.order-stt':'1','.order-total':'16.168,5'})],'16.168,5'));
 assert.match(text,/Tổng tiền: 16\.169/);
});
