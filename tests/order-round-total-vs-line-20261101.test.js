import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const path=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const share=path('src/fixed-ui-cart-share-v3.js');
const runtime5=path('src/fixed-ui-runtime-5.js');
const runtime6=path('src/fixed-ui-runtime-6.js');
const runtime13=path('src/fixed-ui-runtime-13.js');

const start=share.indexOf('  // SPEC-ORDER-SHARE-ROUND-TOTAL-20261101:');
const end=share.indexOf('  function stableShareHash(value){',start);
assert.ok(start>=0&&end>start);
const context=vm.createContext({});
vm.runInContext(share.slice(start,end)+'globalThis.money={parseVisibleMoney,displayRoundedTotal};',context);
const {parseVisibleMoney,displayRoundedTotal}=context.money;

test('shared order totals round once; vi-VN separators remain unambiguous',()=>{
 assert.equal(displayRoundedTotal(49622.5),'49.623');
 assert.equal(displayRoundedTotal(1807304.5),'1.807.305');
 assert.equal(displayRoundedTotal(-1200.5),'-1.201');
 assert.equal(displayRoundedTotal(0),'0');
});
test('formatted decimal prices can be parsed into accurate original line amounts',()=>{
 assert.equal(parseVisibleMoney('1.807.304,5'),1807304.5);
 assert.equal(parseVisibleMoney('16.168,5'),16168.5);
 assert.equal(parseVisibleMoney('0,75'),0.75);
 assert.equal(parseVisibleMoney('1.000'),1000);
 assert.equal(displayRoundedTotal('1.807.304,5'),'1.807.305');
});
test('basket and order detail totals are rounded in primary UIs, individual amounts are not',()=>{
 assert.match(runtime5,/const strTotal = Math\.round\(totalPrice\)\.toLocaleString\('vi-VN'\)/);
 assert.match(runtime6,/let strTotal = Math\.round\(totalPrice\)\.toLocaleString\('vi-VN'\)/);
 assert.match(runtime13,/detailModalTotal'\)\.innerText = Math\.round\(total\)\.toLocaleString\('vi-VN'\)/);
 assert.match(runtime13,/totalEl\.textContent = Math\.round\(totalPrice\)\.toLocaleString\('vi-VN'\)/);
 assert.match(runtime13,/donGia\.toLocaleString\('vi-VN'\)/);
 assert.match(runtime13,/tTien\.toLocaleString\('vi-VN'\)/);
});
test('shared image and copy text keep exact unit prices / line amounts but round only footer total',()=>{
 assert.match(share,/priceText:price\.toLocaleString\('vi-VN'\)/);
 assert.match(share,/totalText:amount\.toLocaleString\('vi-VN'\)/);
 assert.match(share,/totalPriceText:displayRoundedTotal\(totalPrice\)/);
 assert.match(share,/vi\(price\)\} \| \$\{vi\(line\)\}/);
 assert.match(share,/'Tổng tiền: '\+displayRoundedTotal\(total\)/);
 assert.match(share,/'Tổng tiền: '\+displayRoundedTotal\(sum\)/);
});
