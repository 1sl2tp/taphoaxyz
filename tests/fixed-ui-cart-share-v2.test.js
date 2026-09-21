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


test('share image capture is on-demand bounded and lighter on Safari-sized pages',async()=>{
  const [html,helper,cartShare,sourceShare]=await Promise.all([
    readFile('index.html','utf8'),
    readFile('src/fixed-ui-share-capture.js','utf8'),
    readFile('src/fixed-ui-cart-share-v3.js','utf8'),
    readFile('src/fixed-ui-runtime-10.js','utf8')
  ]);

  assert.doesNotMatch(html,/cdnjs\.cloudflare\.com\/ajax\/libs\/html2canvas\/1\.4\.1\/html2canvas\.min\.js/);
  assert.ok(html.indexOf('fixed-ui-share-capture.js?v=iphone-share-20260921') < html.indexOf('fixed-ui-runtime-10.js?v=ios-pwa-share-20260921'));
  assert.ok(html.indexOf('fixed-ui-share-capture.js?v=iphone-share-20260921') < html.indexOf('fixed-ui-cart-share-v3.js?v=ios-pwa-share-20260921'));

  assert.match(helper,/cdnjs\.cloudflare\.com\/ajax\/libs\/html2canvas\/1\.4\.1\/html2canvas\.min\.js/);
  assert.match(helper,/cdn\.jsdelivr\.net\/npm\/html2canvas@1\.4\.1\/dist\/html2canvas\.min\.js/);
  assert.match(helper,/withTimeout/);
  assert.match(helper,/renderTimeout/);
  assert.match(helper,/scale=Math\.max\(1,Math\.min\(1\.5/);

  assert.match(cartShare,/window\.TAPHOA_SHARE_CAPTURE/);
  assert.match(cartShare,/scale:1\.4/);
  assert.doesNotMatch(cartShare,/scale:2/);

  assert.match(sourceShare,/buildSourceSharePageElements\(source, width, modeLabel, 1800\)/);
  assert.match(sourceShare,/capture\.captureElement/);
  assert.match(sourceShare,/scale:1\.4/);
  assert.match(sourceShare,/Đang tạo ảnh \$\{i \+ 1\}\/\$\{pageElements\.length\}/);
  assert.doesNotMatch(sourceShare,/scale:2/);

  // iOS Web Share requires navigator.share() to run from the original tap.
  // Images are therefore prepared ahead of time and the cached File(s) are shared synchronously on tap.
  assert.match(cartShare,/prepareCartShareCache/);
  assert.match(cartShare,/prepareDetailShareCache/);
  assert.match(cartShare,/openOrderMobileBeforeSharePrep/);
  assert.match(cartShare,/data-cart-share-version','4-ios-prepared/);
  assert.match(sourceShare,/const sourceShareCache = new Map\(\)/);
  assert.match(sourceShare,/prepareSourceDetailShare/);
  assert.match(sourceShare,/captureLongSourceSharePages\(source, baseName, modeLabel, showProgress = true\)/);
  assert.match(sourceShare,/navigator\.share\(\{[\s\S]{0,180}files: ready\.files/);

  const [markup5,runtime13]=await Promise.all([
    readFile('src/fixed-ui-markup-5.js','utf8'),
    readFile('src/fixed-ui-runtime-13.js','utf8')
  ]);
  assert.match(markup5,/id=\\\"orderDetailShareButton\\\"/);
  assert.match(cartShare,/detailShareBtn\.removeAttribute\('onclick'\)/);
  assert.match(cartShare,/detailShareBtn\.onclick=shareDetailOrderImageV3/);
  assert.match(runtime13,/function isNativeShareCancellation/);
  assert.match(runtime13,/if \(!isNativeShareCancellation\(e\)\) showAlertPopup\("Lỗi tạo ảnh", e\.message\)/);
});
