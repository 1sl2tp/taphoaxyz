import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html=fs.readFileSync(new URL('../no/index.html',import.meta.url),'utf8');
const low=html.toLowerCase();

test('public debt page is login-free and shows customer debt history',()=>{
  for(const needle of [
    '<title>công nợ taphoa</title>',
    'taphoa · công nợ',
    'lịch sử giao dịch',
    'đơn hàng',
    'thu tiền',
    'taphoa-public-debt',
    "new urlsearchparams(location.search)",
    "params.get('kh')",
    'xem chi tiết đơn',
    'còn nợ',
    'còn dư',
  ])assert.ok(low.includes(needle),needle);
  for(const forbidden of ['signin','login','localstorage','document.cookie'])assert.equal(low.includes(forbidden),false,forbidden);
});

test('public debt order detail stays inside the debt page',()=>{
  assert.ok(low.includes('&order='));
  assert.ok(low.includes('id="sheet"'));
  assert.ok(low.includes('id="sheet-body"'));
  assert.ok(low.includes('tổng thanh toán'));
  assert.ok(low.includes('mã đơn: --'));
});

assert.equal(low.includes("params.get('k')"),false);
assert.equal(low.includes('legacykey'),false);
assert.equal(low.includes('publicparam'),false);


test('public debt page never renders reversal labels',()=>{
  assert.equal(low.includes('hoàn đơn'),false);
  assert.equal(low.includes("entry_type==='reversal'"),false);
});


test('public debt order detail mirrors the legacy order-detail viewer',()=>{
  for(const needle of [
    'mã đơn: --',
    'tên sp',
    'đ.giá',
    'sl',
    't.tiền',
    'số lượng',
    'tổng thanh toán',
    'sheet-line-count',
    'sheet-total-qty',
    'sheet-total',
    'order-detail-grid',
    'order-stt',
    'order-price',
    'order-qty',
    'order-total',
  ])assert.ok(low.includes(needle),needle);
  assert.equal(low.includes('còn nợ')&&low.includes('sau đơn'),false,'order detail must not add debt balance inside legacy-style viewer');
});
