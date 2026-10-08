import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const css=fs.readFileSync('src/fixed-ui-cart-spacing.css','utf8');
const html=fs.readFileSync('index.html','utf8');
const render=fs.readFileSync('src/fixed-ui-runtime-6.js','utf8');
const behavior=fs.readFileSync('src/fixed-ui-behavior.js','utf8');
const owner=css.slice(css.indexOf('/* FIXED STYLE: cart-preview-parity-20261008'));

test('preview and editable cart share the same three monetary/quantity cell structure',()=>{
  assert.match(render,/data-cart-readonly="\$\{isDeliveredReadOnlyPreview \? '1' : '0'\}"/);
  assert.match(render,/<div class="cart-price font-semibold[^>]*><span class="cart-field-caption">Đơn giá<\/span>/);
  assert.match(render,/<div class="cart-qty">[\s\S]*?<span class="cart-field-caption">Số lượng<\/span>/);
  assert.match(render,/<div class="cart-total font-extrabold[^>]*><span class="cart-field-caption">Thành tiền<\/span>/);
  assert.match(render,/isDeliveredReadOnlyPreview\s*\? `<div class="cart-qty-readonly/);
  assert.match(render,/: `<div class="cart-qty-control/);
  assert.match(behavior,/if \(row\.dataset\.cartReadonly === '1'\) return;/);
});

test('mobile uses one identical grid for readonly invoice and editable shopping cart',()=>{
  assert.match(owner,/#cartItemList \.cart-compact-grid\{[^}]*grid-template-columns:minmax\(0,1fr\) 104px minmax\(0,1fr\)[^}]*grid-template-areas:"line line line" "unit quantity subtotal"/);
  assert.match(owner,/#cartItemList \.cart-price,[\s\S]*?#cartItemList \.cart-total\{[^}]*flex-direction:column !important;/);
  assert.match(owner,/#cartItemList \.cart-compact-grid \.cart-field-caption\{[^}]*display:block !important;/);
  assert.match(owner,/#cartItemList \.cart-qty-readonly\{[^}]*width:104px !important;[^}]*height:34px !important;/);
  assert.match(owner,/#cartItemList \.cart-qty-control\{[^}]*width:104px !important;[^}]*height:34px !important;/);
  assert.doesNotMatch(owner,/content:"Giá"|content:"SL"|content:"Tiền"/);
});

test('note editor remains on product-name line, no phantom note row',()=>{
  assert.match(css,/#cartItemList \.cart-left > \.min-w-0\{[^}]*display:flex/);
  assert.match(css,/#cartItemList \[data-cart-line-note-editor\]\{[^}]*margin:0 !important/);
  assert.match(render,/onclick="openCartLineNoteEditor\(this\)"/);
});

test('small phones retain shared layout and source files have fresh version URLs',()=>{
  assert.match(owner,/@media \(max-width:360px\)\{[\s\S]*grid-template-columns:minmax\(0,1fr\) 104px minmax\(0,1fr\)/);
  assert.match(html,/fixed-ui-cart-spacing\.css\?ui=cart-preview-parity-2-20261008/);
  assert.match(html,/fixed-ui-runtime-6\.js\?v=[^"]*cart-preview-parity=20261008/);
  assert.match(html,/fixed-ui-behavior\.js\?v=[^"]*readonly-preview=20261008/);
});

test('quantity control fits the invoice-preview quantity track even on 320px screens',()=>{
  const owner=css.slice(css.indexOf('/* FIXED STYLE: cart-preview-parity-20261008'));
  const control=owner.match(/#cartItemList \.cart-qty-control\{([^}]*)\}/)?.[1]||'';
  assert.match(control,/width:104px !important;/);
  assert.match(control,/grid-template-columns:32px 32px 32px !important;/);
  assert.match(control,/gap:1px !important;/);
  assert.match(control,/padding:0 2px !important;/);
  // Three 32px cells, two 1px gaps, 4px padding, 2px border = 104px.
  assert.equal(32*3+2+4+2,104);
});
