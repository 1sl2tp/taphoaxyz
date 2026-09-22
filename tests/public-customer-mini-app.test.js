import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html=fs.readFileSync(new URL('../kh/index.html',import.meta.url),'utf8');
const edge=fs.readFileSync(new URL('../supabase/functions/taphoa-stock-check/index.ts',import.meta.url),'utf8');
const low=html.toLowerCase();

test('customer mini app keeps products orders and debt in one shell, with stock check as a products mode',()=>{
  for(const needle of [
    'data-tab="hang"','data-tab="don"','data-tab="no"',
    "p.get('nguon')","p.get('muc')","p.get('don')",
    'tất cả','đã mua','gợi ý',
    'v21-quote','taphoa-public-debt','taphoa-stock-check',
    'mini=1','data-order','gửi nhân viên kiểm hàng',
    'nhân viên chỉ nhập số lượng, không thấy giá',
    "action:'update'",
    'xem giá, hàng đã mua và gợi ý',
    'kiểm hàng: chọn số lượng và cập nhật ngay tại đây',
    'xem đơn đã giao và chi tiết từng đơn',
    'xem số còn nợ/còn dư và lịch sử giao dịch',
  ])assert.ok(low.includes(needle),needle);

  for(const forbidden of [
    'data-tab="kiemhang"',
    'xem trước nhân viên',
    'data-stock-copy',
    '<div class="brand">taphoa</div>',
    'signin','login','localstorage','document.cookie'
  ])assert.equal(low.includes(forbidden),false,forbidden);

  assert.ok(edge.includes('&tab=hang&t='));
  assert.equal(edge.includes('&tab=kiemhang&t='),false);
});
