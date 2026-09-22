import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html=fs.readFileSync(new URL('../kh/index.html',import.meta.url),'utf8');
const edge=fs.readFileSync(new URL('../supabase/functions/taphoa-stock-check/index.ts',import.meta.url),'utf8');
const low=html.toLowerCase();
const edgeLow=edge.toLowerCase();

test('customer mini app contains products, stock quantities, orders and debt in one shell',()=>{
  for(const needle of [
    'data-tab="hang"','data-tab="don"','data-tab="no"',
    "p.get('nguon')","p.get('muc')","p.get('don')",
    'tất cả','đã mua','gợi ý',
    'v21-quote','taphoa-public-debt','taphoa-stock-check',
    'mini=1','data-order','>gửi nv</button>',
    "action:'update'",
    'xem giá · đã mua · gợi ý · nhập số lượng khi cần',
    'xem đơn đã giao và chi tiết từng đơn',
    'xem số còn nợ/còn dư và lịch sử giao dịch',
    'xóa / nhập lại',
    'grid-template-rows:auto auto',
    '.product-meta{grid-column:1;grid-row:2',
    '.product-stock{grid-column:2;grid-row:2',
    'data-stock-footer hidden',
    "stock+'?kh='+encodeuricomponent(kh)",
    "json.stringify({kh,action:'update',items})",
  ])assert.ok(low.includes(needle),needle);

  for(const forbidden of [
    'data-tab="kiemhang"',
    'xem trước nhân viên',
    'data-stock-copy',
    '<div class="brand">taphoa</div>',
    'const stocktoken=',
    'kiểm hàng: chọn số lượng và cập nhật ngay tại đây',
    'signin','login','localstorage','document.cookie'
  ])assert.equal(low.includes(forbidden),false,forbidden);

  assert.ok(edgeLow.includes('url.searchparams.get("kh")'));
  assert.ok(edgeLow.includes('body?.kh'));
  assert.ok(edge.includes('&tab=hang'));
  assert.equal(edge.includes('&tab=hang&t='),false);
  assert.equal(edge.includes('&tab=kiemhang&t='),false);

  assert.ok(low.includes("const legacystocktab=requestedtab==='kiemhang';"));
  assert.ok(low.includes("const legacystocktoken=p.has('t');"));
  assert.ok(low.includes('if(legacystocktab||legacystocktoken)updateurl();'));
});
