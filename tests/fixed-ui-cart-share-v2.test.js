import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('cart share v3 supports a live sale draft before it becomes a saved order',async()=>{
  const html=await readFile('index.html','utf8');
  const js=await readFile('src/fixed-ui-cart-share-v3.js','utf8');
  const runtime=await readFile('src/fixed-ui-runtime-5.js','utf8');
  assert.ok(html.indexOf('fixed-ui-runtime-13.js') < html.indexOf('fixed-ui-cart-share-v3.js'));
  assert.doesNotMatch(html,/fixed-ui-cart-share-v2\.js/);
  assert.match(runtime,/isCreatingSaleDraft\s*=\s*activeTabId\s*===\s*['"]tab-ban-hang['"][\s\S]{0,120}lineCount\s*>\s*0[\s\S]{0,120}!hasLoadedOrder/);
  assert.match(runtime,/classList\.toggle\(['"]hidden['"],\s*!\(hasLoadedOrder \|\| isCreatingSaleDraft\)\)/);
  assert.match(js,/window\.shareCartOrderImage=shareCartOrderImageV3/);
  assert.match(js,/isCreatingSaleDraft:!orderId/);
  assert.match(js,/Đơn đang tạo/);
  assert.match(js,/don_dang_tao/);
  assert.match(js,/Object\.entries\(currentCart\)/);
  assert.match(js,/totalPrice\.toLocaleString\('vi-VN'\)/);
});
