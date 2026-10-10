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
  assert.match(owner,/#cartBottomSheet \.cart-compact-grid,[\s\S]*?#orderDetailContentToShare \.order-detail-compact-grid\{[^}]*grid-template-columns:22px minmax\(0,1fr\) 54px 96px 69px !important;/);
  assert.match(owner,/#cartItemList \.cart-compact-grid \.cart-qty-control\{[^}]*grid-template-columns:30px 28px 30px !important;/);
});

test('editable shopping cart uses buttons only at the same quantity track as readonly',()=>{
  assert.match(runtime,/data-cart-readonly="\$\{isDeliveredReadOnlyPreview \? '1' : '0'\}"/);
  assert.match(runtime,/isDeliveredReadOnlyPreview\s*\? `<div class="cart-qty-readonly/);
  assert.match(runtime,/: `<div class="cart-qty-control/);
  assert.match(owner,/#cartItemList \.cart-compact-grid \.cart-qty-readonly\{[^}]*width:96px !important;/);
  assert.match(owner,/#cartItemList \.cart-compact-grid \.cart-qty-control,[\s\S]*?#cartItemList \.cart-compact-grid \.cart-qty-readonly\{[^}]*width:96px !important;/);
  assert.match(owner,/#cartItemList \.cart-compact-grid \.cart-name,[\s\S]*?text-overflow:ellipsis !important;/);
});

test('mobile five-column header/body and images have fresh versions',()=>{
  assert.ok(html.includes('fixed-ui-cart-spacing.css?ui=cart-intrinsic-5-cols-20261008'));
  assert.match(html,/fixed-ui-markup-3\.js\?v=[^"]*order-five-col=20261008/);
  assert.match(html,/fixed-ui-markup-5\.js\?v=[^"]*order-five-col=20261008/);
  assert.match(html,/fixed-ui-cart-share-v3\.js\?v=portrait-one-order-20261008[^"]*/);
  assert.match(html,/fixed-ui-public-order-image\.js\?v=portrait-one-order-20261008[^"]*/);
});

test('readonly and editing use separate compact rulers but common five-column order',()=>{
  assert.match(runtime,/cartSheet\.dataset\.cartMode = isDeliveredReadOnlyPreview \? 'preview' : 'edit'/);
  const final=css.slice(css.indexOf('/* FIXED STYLE: cart-visual-numeric-gaps-and-name-note-popup-20261008')); assert.ok(final.includes('var(--cart-qty-readonly-track,32px) var(--cart-total-track,69px)'));
  assert.match(owner,/#cartBottomSheet\[data-cart-mode="preview"\] #cartItemList \.cart-compact-grid \.cart-qty-readonly\{[^}]*width:var\(--cart-qty-readonly-track,32px\) !important;/);
  assert.ok(html.includes('fixed-ui-runtime-6.js?v=semantic-columns-20261008c'));
});
