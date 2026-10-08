import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const css=fs.readFileSync('src/fixed-ui-cart-spacing.css','utf8');
const html=fs.readFileSync('index.html','utf8');
const runtime=fs.readFileSync('src/fixed-ui-runtime-6.js','utf8');
const owner=css.slice(css.indexOf('/* FIXED STYLE: cart-five-columns-no-implicit-areas-20261008'));

test('IMG_9481: old named mobile grid areas cannot place cart fields into implicit tracks',()=>{
  assert.ok(owner.startsWith('/* FIXED STYLE: cart-five-columns-no-implicit-areas-20261008'));
  assert.match(css, /grid-area:line;/);
  assert.match(css, /grid-area:unit;/);
  assert.match(css, /grid-area:quantity;/);
  assert.match(css, /grid-area:subtotal;/);
  assert.match(owner, /#cartBottomSheet \.cart-compact-grid\{[^}]*grid-template-areas:none !important;[^}]*grid-auto-flow:row !important;/);
  assert.match(owner, /#cartBottomSheet \.cart-compact-grid \.cart-left,\s*#cartBottomSheet \.cart-compact-grid \.cart-price,\s*#cartBottomSheet \.cart-compact-grid \.cart-qty,\s*#cartBottomSheet \.cart-compact-grid \.cart-total\{[^}]*grid-area:auto !important;[^}]*grid-row:auto !important;[^}]*grid-column:auto !important;/);
});

test('IMG_9481: STT, name, price, quantity and total are the five flattened visual grid cells',()=>{
  assert.match(owner,/#cartBottomSheet \.cart-compact-grid \.cart-left\{[^}]*display:contents !important;/);
  assert.match(owner,/#cartBottomSheet \.cart-compact-grid \.cart-left > \.min-w-0\{[^}]*min-width:0 !important;/);
  assert.match(owner,/#cartItemList \.cart-compact-grid \.cart-name\{[^}]*display:block !important;/);
  assert.match(runtime,/class="cart-left"[\s\S]*?class="cart-stt/);
  assert.match(runtime,/class="cart-price font-semibold/);
  assert.match(runtime,/class="cart-qty"/);
  assert.match(runtime,/class="cart-total font-extrabold/);
  assert.match(html,/fixed-ui-cart-spacing\.css\?ui=order-five-col-corrected-20261008/);
});

test('mobile STT and product name use the same vertical center ruler',()=>{
  const axis=owner.slice(owner.indexOf('/* STT and product name share the same vertically-centered item row. */'));
  assert.ok(axis.startsWith('/* STT and product name share the same vertically-centered item row. */'));
  assert.match(axis, /#cartItemList \.cart-compact-grid \.cart-stt\{[^}]*align-self:center !important;[^}]*align-items:center !important;[^}]*height:34px !important;/);
  assert.match(axis, /#cartItemList \.cart-compact-grid \.cart-left > \.min-w-0\{[^}]*align-self:center !important;[^}]*align-items:center !important;[^}]*height:34px !important;/);
  assert.match(html,/fixed-ui-cart-spacing\.css\?ui=order-five-col-corrected-20261008&stt-axis=20261008/);
});
