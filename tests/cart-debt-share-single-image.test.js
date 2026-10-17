import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const cart=fs.readFileSync('src/fixed-ui-cart-share-v3.js','utf8');
const debt=fs.readFileSync('src/fixed-ui-runtime-12.js','utf8');
const debtMenu=fs.readFileSync('src/fixed-ui-debt-share-actions.js','utf8');
const legacy=fs.readFileSync('src/fixed-ui-stock-check-share.js','utf8');
const markup=fs.readFileSync('src/fixed-ui-markup-4.js','utf8');
const shell=fs.readFileSync('index.html','utf8');

test('cart share button opens only send/save/copy and never native title+text',()=>{
  assert.match(cart,/data-cart-share-version','6-single-image-menu/);
  assert.match(cart,/cartShareBtn\.onclick=\(\)=>/);
  assert.match(cart,/cartOrderShareActionMenu/);
  assert.deepEqual([...cart.matchAll(/role="menuitem" data-cart-share-action="(send|save|copy)"/g)].map(x=>x[1]),['send','save','copy']);
  assert.match(cart,/prepareCartShareCache\(\)/);
  assert.match(cart,/new ClipboardItem\(\{'image\/png':png\}\)/);
  assert.match(cart,/prod\.manualShareOrder\(orderId,crypto\.randomUUID\(\)\)/);
  assert.match(cart,/Không.*sửa.*chưa lưu/);
  assert.doesNotMatch(cart,/cartShareBtn\.onclick=shareCartOrderImageV3/);
  assert.match(shell,/cart-single-png=20261017/);
});

test('debt share is one PNG across web and PWA; image copy remains click-initiated',()=>{
  assert.match(debt,/async function createCustomerDebtPngBlob\(\)/);
  assert.match(debt,/async function shareCustomerDebtImage\(action = 'send'\)/);
  assert.match(debt,/new ClipboardItem\(\{'image\/png': pendingBlob\}\)/);
  assert.match(debt,/navigator\.share\(\{files:\[file\]\}\)/);
  assert.doesNotMatch(debt,/navigator\.share\(debtNativeSharePayload\(file\)\)/);
  assert.match(debtMenu,/data-debt-share-action="/);
  assert.match(debtMenu,/Gửi công nợ/);
  assert.match(debtMenu,/Sao chép/);
  assert.match(markup,/id=\\?"debtShareButton/);
  assert.match(shell,/fixed-ui-debt-share-actions\.js/);
});

test('legacy stock-check sharing cannot hijack ordinary cart/order icon',()=>{
  assert.doesNotMatch(legacy,/setTimeout\(bind,0\)/);
  assert.doesNotMatch(legacy,/event\.stopImmediatePropagation\(\)/);
  assert.doesNotMatch(legacy,/detail\.onclick=openSheet/);
  assert.doesNotMatch(legacy,/cart\.onclick=openSheet/);
  assert.match(legacy,/window\.openTaphoaShareSheet=openSheet/);
});
