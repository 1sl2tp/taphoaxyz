import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('cart share v2 is loaded after runtime13 and overrides stale cart share handlers',async()=>{
  const html=await readFile('index.html','utf8');
  const js=await readFile('src/fixed-ui-cart-share-v2.js','utf8');
  assert.ok(html.indexOf('fixed-ui-runtime-13.js') < html.indexOf('fixed-ui-cart-share-v2.js'));
  assert.match(js,/window\.shareCartOrderImage=shareCartOrderImageV2/);
  assert.match(js,/window\.shareOrderImage=function/);
  assert.match(js,/cartShareBtn\.onclick=shareCartOrderImageV2/);
  assert.match(js,/Object\.entries\(currentCart\)/);
  assert.match(js,/Tổng thanh toán/);
  assert.match(js,/totalPrice\.toLocaleString\('vi-VN'\)/);
});
