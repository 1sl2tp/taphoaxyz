import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const css=fs.readFileSync('src/fixed-ui-cart-spacing.css','utf8');
const html=fs.readFileSync('index.html','utf8');
const runtime=fs.readFileSync('src/fixed-ui-runtime-6.js','utf8');
const owner=css.slice(css.indexOf('/* FIXED STYLE: order-cart-share-five-columns-20261008'));

test('cart has same FIVE visible columns as invoice detail, not a two-row product layout',()=>{
  assert.ok(owner.startsWith('/* FIXED STYLE: order-cart-share-five-columns-20261008'));
  assert.match(owner,/#cartBottomSheet \.cart-compact-grid\{[^}]*grid-template-columns:24px minmax\(0,1fr\) 82px 124px 94px !important;/);
  assert.match(owner,/#cartBottomSheet \.cart-compact-grid \.cart-left\{[^}]*display:contents !important;/);
  assert.match(owner,/#cartBottomSheet \.cart-column-header\{[^}]*display:grid !important;/);
  assert.match(owner,/#cartItemList \.cart-compact-grid \.cart-field-caption\{[^}]*display:none !important;/);
  assert.match(owner,/#cartBottomSheet \.cart-compact-grid,[\s\S]*?#orderDetailContentToShare \.order-detail-compact-grid\{[^}]*grid-template-columns:22px minmax\(0,1fr\) 54px 104px 61px !important;/);
  assert.match(owner,/#cartItemList \.cart-compact-grid \.cart-qty-control\{[^}]*grid-template-columns:32px 32px 32px !important;/);
});

test('editable shopping cart uses buttons only at the same quantity track as readonly',()=>{
  assert.match(runtime,/data-cart-readonly="\$\{isDeliveredReadOnlyPreview \? '1' : '0'\}"/);
  assert.match(runtime,/isDeliveredReadOnlyPreview\s*\? `<div class="cart-qty-readonly/);
  assert.match(runtime,/: `<div class="cart-qty-control/);
  assert.match(owner,/#cartItemList \.cart-compact-grid \.cart-qty-readonly\{[^}]*width:104px !important;/);
  assert.match(owner,/#cartItemList \.cart-compact-grid \.cart-qty-control,[\s\S]*?#cartItemList \.cart-compact-grid \.cart-qty-readonly\{[^}]*width:104px !important;/);
  assert.match(owner,/#cartItemList \.cart-compact-grid \.cart-name,[\s\S]*?text-overflow:ellipsis !important;/);
});

test('mobile five-column header/body and images have fresh versions',()=>{
  assert.match(html,/fixed-ui-cart-spacing\.css\?ui=order-five-col-20261008/);
  assert.match(html,/fixed-ui-markup-3\.js\?v=[^"]*order-five-col=20261008/);
  assert.match(html,/fixed-ui-markup-5\.js\?v=[^"]*order-five-col=20261008/);
  assert.match(html,/fixed-ui-cart-share-v3\.js\?v=[^"]*order-five-col=20261008/);
  assert.match(html,/fixed-ui-public-order-image\.js\?v=[^"]*order-five-col=20261008/);
});
