import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source=fs.readFileSync('src/fixed-ui-public-order-image.js','utf8');
const index=fs.readFileSync('index.html','utf8');

test('public order deep link defaults to a fixed image viewer',()=>{
  assert.match(source,/isPublicOrderDeepLink/);
  assert.match(source,/renderPublicOrderImageView/);
  assert.match(source,/publicOrderImageViewer/);
  assert.match(source,/TAPHOA_SHARE_CAPTURE/);
  assert.match(source,/webkitTextSizeAdjust\s*=\s*['"]100%['"]/);
  assert.match(source,/Xem dạng bảng/);
  assert.match(source,/Xem ảnh/);
  assert.match(index,/fixed-ui-public-order-image\.js/);
});

test('public order image mode is scoped to kh + don deep links',()=>{
  assert.match(source,/params\.get\(['"]kh['"]\)/);
  assert.match(source,/params\.get\(['"]don['"]\)/);
  assert.match(source,/requestedOrder\s*===\s*deepLinkedOrder/);
});

test('public order image viewer keeps table fallback and Zalo safe bottom space',()=>{
  assert.match(source,/fallbackToTable/);
  assert.match(source,/Zalo/i);
  assert.match(source,/safe-area-inset-bottom/);
  assert.match(source,/PUBLIC_ORDER_PAGE_SIZE/);
});
