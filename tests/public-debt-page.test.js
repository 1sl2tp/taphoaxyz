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
    "new urlsearchparams(location.search).get('k')",
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
  assert.ok(low.includes('tổng đơn'));
  assert.ok(low.includes('sau đơn'));
});
