import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('order detail gives price quantity and total explicit aligned tracks',async()=>{
  const css=await readFile('src/fixed-ui-source-1.css','utf8');
  assert.match(css,/\.order-detail-compact-grid\s*\{[\s\S]{0,280}grid-template-columns:30px minmax\(0,1fr\) 52px 28px 58px\s*!important/);
  assert.match(css,/\.order-detail-compact-grid \.order-price,\s*\.order-detail-compact-grid \.order-total\s*\{[\s\S]{0,160}text-align:right/);
  assert.match(css,/\.order-detail-compact-grid \.order-qty\s*\{[\s\S]{0,160}text-align:center/);
});

test('zalo mobile order detail reserves bottom toolbar clearance without changing web or pwa',async()=>{
  const css=await readFile('src/fixed-ui-source-1.css','utf8');
  const markup=await readFile('src/fixed-ui-markup-5.js','utf8');
  const flow=await readFile('src/fixed-ui-mobile-edit-flow.js','utf8');

  assert.match(markup,/order-detail-summary/);
  assert.match(flow,/function isZaloInAppBrowser\(\)/);
  assert.match(flow,/navigator\.userAgent/);
  assert.match(flow,/\/Zalo\/i/);
  assert.match(flow,/classList\.toggle\(['"]is-zalo-inapp['"],\s*isZaloInAppBrowser\(\)\)/);
  assert.match(css,/@media\s*\(max-width:767px\)\s*\{[\s\S]{0,320}#orderDetailBottomSheet\.is-zalo-inapp \.order-detail-summary\s*\{[\s\S]{0,180}padding-bottom:calc\(56px \+ env\(safe-area-inset-bottom\)\)\s*!important/);
});
