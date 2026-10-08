import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const css=fs.readFileSync('src/fixed-ui-cart-spacing.css','utf8');
const html=fs.readFileSync('index.html','utf8');
const render=fs.readFileSync('src/fixed-ui-runtime-6.js','utf8');

test('mobile cart is two rows: product name, then unit price / quantity / total',()=>{
  const areas='grid-template-areas:"line line line" "unit quantity subtotal"';
  assert.equal(css.split(areas).length-1,3,
    'both normal phone and narrow phone must use exactly these two grid rows');
  assert.doesNotMatch(css,/grid-template-areas:[^;]*"quantity quantity"/);
  assert.match(css,/#cartItemList \.cart-price\{[^}]*grid-area:unit/);
  assert.match(css,/#cartItemList \.cart-qty\{[^}]*grid-area:quantity/);
  assert.match(css,/#cartItemList \.cart-total\{[^}]*grid-area:subtotal/);
});

test('empty cart note stays clickable but does not occupy a separate row',()=>{
  assert.match(css,/#cartItemList \.cart-left > \.min-w-0\{[^}]*display:flex/);
  assert.match(css,/#cartItemList \[data-cart-line-note-editor\]\{[^}]*margin:0 !important/);
  assert.match(css,/#cartItemList \[data-cart-note-id\]\[data-note-current=""\]::after\{/);
  assert.match(css,/#cartItemList \.cart-name\{[^}]*white-space:nowrap !important/);
  assert.match(render,/onclick="openCartLineNoteEditor\(this\)"/);
  assert.match(render,/class="cart-name/);
});

test('mobile cart latest two-row CSS is cache-busted',()=>{
  assert.match(html,/fixed-ui-cart-spacing\.css\?ui=cart-compact-9475-20261008/);
});

test('latest photo 9475: cart 2-row blocks use compact input and labels at 320-428px',()=>{
  assert.match(css, /Mobile compact two-row cart: screenshot IMG_9475/);
  assert.match(css, /#cartItemList \.cart-compact-grid\{[^}]*grid-template-rows:max-content max-content !important;[^}]*row-gap:3px !important;[^}]*padding-top:6px !important;/);
  assert.match(css, /#cartItemList \.cart-compact-grid \.cart-field-caption\{[^}]*min-height:13px !important;/);
  assert.match(css, /#cartItemList \.cart-qty-control\{[^}]*width:124px !important;[^}]*height:40px !important;/);
  assert.match(css, /@media \(max-width:360px\)\{[\s\S]*grid-template-columns:minmax\(0,1fr\) 124px minmax\(0,1fr\)/);
});
