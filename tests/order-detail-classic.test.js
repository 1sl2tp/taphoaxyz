import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8');

test('Delivered and Pending expose classic invoice tables and share-image actions',()=>{
  const delivered=read('src/screens/delivered.js');
  const pending=read('src/screens/pending.js');
  for(const source of [delivered,pending]){
    assert.match(source,/Đ\.Giá|Đ\.GIÁ/);
    assert.match(source,/T\.Tiền|T\.TIỀN/);
    assert.match(source,/data-receipt-share/);
    assert.match(source,/data-receipt-capture/);
    assert.match(source,/shareReceiptImage/);
  }
});

test('classic stylesheet gives receipt/detail surfaces the old white-card rhythm',()=>{
  const css=read('src/styles/classic.css');
  assert.match(css,/\.classic-receipt/);
  assert.match(css,/\.classic-detail-table/);
  assert.match(css,/\.classic-share-button/);
});
