import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=path=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const index=read('index.html');
const app=read('src/app.js');
const router=read('src/core/router.js');
const entry=read('src/styles/taphoa-tailwind.entry.css');
const sales=read('src/screens/sales.js');
const delivered=read('src/screens/delivered.js');
const pending=read('src/screens/pending.js');
const debt=read('src/screens/debt.js');

test('production shell uses the approved Gemini navigation grammar',()=>{
  assert.match(entry,/@import\s+["']\.\/gemini-production\.css["']/);
  assert.match(app,/icon\(item\.icon/);
  assert.doesNotMatch(router,/🛒|📋|📝|💰/);
  assert.match(index,/class="app-topbar"/);
});

test('sales screen uses Gemini customer header, compact search and cart sheet geometry',()=>{
  assert.match(sales,/sales-gemini-head/);
  assert.match(sales,/Tìm tên, mã sản phẩm\.\.\./);
  assert.match(sales,/sales-gemini-product-list/);
  assert.match(sales,/sales-gemini-cart-sheet/);
  assert.match(sales,/Tổng thanh toán/);
});

test('order screens use the approved dark rounded header and summary/list cards',()=>{
  assert.match(delivered,/order-gemini-head/);
  assert.match(delivered,/order-gemini-summary/);
  assert.match(delivered,/Danh sách chi tiết đơn đã giao/);
  assert.match(pending,/order-gemini-head/);
  assert.match(pending,/order-gemini-summary/);
  assert.match(pending,/Đơn đang lưu tạm/);
});

test('debt screen uses the approved dark total header and segmented filters',()=>{
  assert.match(debt,/debt-gemini-head/);
  assert.match(debt,/debt-gemini-filters/);
  assert.match(debt,/Tổng công nợ/);
});
