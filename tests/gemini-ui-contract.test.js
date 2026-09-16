import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=path=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const exists=path=>fs.existsSync(new URL(`../${path}`,import.meta.url));
const index=read('index.html');
const app=read('src/app.js');
const router=read('src/core/router.js');
const entry=read('src/styles/taphoa-tailwind.entry.css');

test('production shell uses the approved Gemini navigation grammar',()=>{
  assert.match(entry,/@import\s+["']\.\/gemini-production\.css["']/);
  assert.match(app,/icon\(item\.icon/);
  assert.doesNotMatch(router,/🛒|📋|📝|💰/);
  assert.match(index,/class="app-topbar"/);
});

test('Gemini production adapter owns only presentation decoration',()=>{
  assert.equal(exists('src/core/gemini-production-ui.js'),true,'missing Gemini production UI adapter');
  const adapter=read('src/core/gemini-production-ui.js');
  assert.match(index,/gemini-production-ui\.js/);
  assert.match(adapter,/Tìm tên, mã sản phẩm\.\.\./);
  for(const marker of ['sales-gemini-head','sales-gemini-product-list','sales-gemini-cart-sheet','order-gemini-head','order-gemini-summary','debt-gemini-head','debt-gemini-filters']){
    assert.ok(adapter.includes(marker),`missing Gemini marker ${marker}`);
  }
  for(const copy of ['Tổng thanh toán','Danh sách chi tiết đơn đã giao','Đơn đang lưu tạm','Tổng công nợ']){
    assert.ok(adapter.includes(copy),`missing Gemini copy ${copy}`);
  }
  assert.doesNotMatch(adapter,/saveOrder|deliverOrder|reverseOrder|deletePending|debtTransaction|\.rpc\(/);
});

test('Gemini stylesheet carries the approved green dark-sheet visual contract',()=>{
  assert.equal(exists('src/styles/gemini-production.css'),true,'missing Gemini production stylesheet');
  const css=read('src/styles/gemini-production.css');
  assert.match(css,/#16a34a/i);
  assert.match(css,/#1e293b/i);
  assert.match(css,/\.app-nav button\[aria-current="page"\]/);
  assert.match(css,/\.sales-gemini-cart-sheet/);
  assert.match(css,/\.order-gemini-head/);
  assert.match(css,/\.debt-gemini-filters/);
  assert.match(css,/@media\s*\(min-width:768px\)/);
  assert.match(css,/@media\s*\(max-width:479px\)/);
});
