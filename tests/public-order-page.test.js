import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html=fs.readFileSync(new URL('../d/index.html',import.meta.url),'utf8');
const low=html.toLowerCase();

test('direct public order page is login-free and uses customer slug plus display order code',()=>{
  for(const needle of [
    '<title>đơn hàng taphoa</title>',
    "params.get('kh')",
    "params.get('don')",
    'taphoa-public-debt',
    '&don=',
    'mã đơn: --',
    'tên sp',
    'đ.giá',
    'sl',
    't.tiền',
    'số lượng',
    'tổng thanh toán',
    'thứ hai',
    'chủ nhật',
  ])assert.ok(low.includes(needle),needle);
  for(const forbidden of ['signin','login','localstorage','document.cookie'])assert.equal(low.includes(forbidden),false,forbidden);
});

test('direct order page keeps header and rows on one exact grid ruler',()=>{
  for(const needle of [
    '--stt:3.4ch',
    '--price:5.4ch',
    '--qty:3.4ch',
    '--money:6.4ch',
    'grid-template-columns:var(--stt) minmax(0,1fr) var(--price) var(--qty) var(--money)',
  ])assert.ok(low.includes(needle),needle);
});
