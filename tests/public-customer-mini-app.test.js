import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html=fs.readFileSync(new URL('../kh/index.html',import.meta.url),'utf8');
const low=html.toLowerCase();

test('customer mini app keeps products stock check orders and debt in one shell',()=>{
  for(const needle of [
    'data-tab="hang"','data-tab="kiemhang"','data-tab="don"','data-tab="no"',
    "p.get('nguon')","p.get('muc')","p.get('don')",
    'tất cả','đã mua','gợi ý',
    'v21-quote','taphoa-public-debt','taphoa-stock-check',
    'mini=1','data-order','sao chép link nhân viên','xem trước nhân viên',
    "action:'update'",
  ])assert.ok(low.includes(needle),needle);
  for(const forbidden of ['signin','login','localstorage','document.cookie'])assert.equal(low.includes(forbidden),false,forbidden);
});
