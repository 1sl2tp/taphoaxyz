import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const cartCss=fs.readFileSync('src/fixed-ui-cart-spacing.css','utf8');
const sharedCss=fs.readFileSync('src/fixed-ui-source-4.css','utf8');
const sourceCss=fs.readFileSync('src/fixed-ui-source-3.css','utf8');
const runtime=fs.readFileSync('src/fixed-ui-runtime-6.js','utf8');
const sourceRows=fs.readFileSync('src/fixed-ui-runtime-9.js','utf8');
const page=fs.readFileSync('index.html','utf8');
const cart=cartCss.slice(cartCss.indexOf('/* FIXED STYLE: cart-five-intrinsic-columns-20261008'));
const shared=sharedCss.slice(sharedCss.indexOf('/* FIXED STYLE: two-sided-intrinsic-tables-20261008'));

test('cart: left identifier+flexible name, right three maximum-width numeric columns',()=>{
  assert.match(cart,/grid-template-columns:\s*var\(--cart-stt-track,24px\)\s*minmax\(0,1fr\)\s*var\(--cart-unit-track,54px\)\s*var\(--cart-qty-track,96px\)\s*var\(--cart-total-track,69px\) !important;/);
  assert.match(cart,/column-gap:6px !important;/);
  assert.match(cart,/justify-content:stretch !important;/);
  assert.match(cart,/#cartBottomSheet \.cart-column-header \.cart-total\{text-align:right !important;/);
  assert.match(cart,/#cartBottomSheet #cartItemList \.cart-compact-grid \.cart-total\{[^}]*justify-content:flex-end !important;[^}]*text-align:right !important;/);
  assert.match(cart,/#cartBottomSheet #cartItemList \.cart-compact-grid \.cart-total \.cart-money-value\{[^}]*text-align:right !important;/);
  assert.doesNotMatch(runtime,/setProperty\('--cart-name-track'/);
  assert.match(runtime,/setProperty\('--cart-total-track'/);
  assert.match(runtime,/isDeliveredReadOnlyPreview \? 'SL' : 'Số lượng'/);
});

test('summary source table: Nguồn grows, SL/Chi/Thu/Lãi stay right; user has just Nguồn/SL/Thu',()=>{
  assert.match(sourceCss,/\.summary-compact-table\{[^}]*grid-template-columns:minmax\(0,1fr\) max-content max-content max-content max-content !important;/);
  assert.match(sourceCss,/\.summary-compact-table th:nth-child\(n\+2\),[\s\S]*?\.summary-compact-table td:nth-child\(n\+2\)\{[^}]*justify-self:end !important;[^}]*text-align:right !important;/);
  assert.match(shared,/body\[data-auth-role="user"\] \.summary-compact-table\{[^}]*grid-template-columns:minmax\(0,1fr\) max-content max-content !important;/);
  assert.match(sourceCss,/body\[data-auth-role="user"\] \.summary-compact-table th:nth-child\(3\)/);
  assert.match(sourceCss,/body\[data-auth-role="user"\] \.summary-compact-table th:nth-child\(5\)/);
});

test('source-detail Chi tiết and Gộp: shared header, data, footer and capture pin final SL to right',()=>{
  assert.match(shared,/\.source-detail-capture \.source-detail-grid\{[^}]*box-sizing:border-box;[^}]*width:100%;[^}]*grid-template-columns:24px minmax\(0,1fr\) max-content;/);
  assert.match(shared,/\.source-detail-capture \.source-detail-grid-detail\{[^}]*grid-template-columns:24px minmax\(0,1fr\) minmax\(0,\.75fr\) max-content;/);
  assert.match(shared,/\.source-detail-capture \.source-detail-grid \.source-detail-qty,[\s\S]*?\.source-detail-capture \.source-detail-grid \.source-detail-total-qty\{[^}]*justify-self:end;[^}]*justify-content:flex-end;[^}]*text-align:right !important;/);
  assert.match(shared,/@media\(min-width:768px\)\{[\s\S]*?grid-template-columns:28px minmax\(0,1fr\) max-content;/);
  assert.match(sourceRows,/source-detail-grid source-detail-grid-detail source-detail-table-head/);
  assert.match(sourceRows,/source-detail-grid source-detail-table-head/);
  assert.match(sourceRows,/source-detail-grid source-detail-grid-detail source-detail-total/);
  assert.match(sourceRows,/source-detail-grid source-detail-total/);
});

test('both view/edit cart and all same-type source tables use cache-refreshed static assets',()=>{
  assert.match(page,/fixed-ui-cart-spacing\.css\?ui=[^"]*right-groups=20261008/);
  assert.match(page,/fixed-ui-source-4\.css\?v=[^"]*right-groups=20261008/);
  assert.match(page,/fixed-ui-runtime-6\.js\?v=semantic-columns-20261008c[^"]*/);
  assert.match(cart, /#cartBottomSheet\[data-cart-mode="preview"\] \.cart-compact-grid/);
  assert.match(cart,/cart-qty-control/);
  assert.match(cart,/cart-qty-readonly/);
});
