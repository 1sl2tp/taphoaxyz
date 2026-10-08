import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const runtime = fs.readFileSync(new URL('../src/fixed-ui-runtime-5.js', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../src/fixed-ui-cart-spacing.css', import.meta.url), 'utf8');

function functionBlock(name, nextName) {
  const start = runtime.indexOf(`function ${name}`);
  assert.ok(start >= 0, `${name} must exist`);
  const end = nextName ? runtime.indexOf(`function ${nextName}`, start) : runtime.length;
  return runtime.slice(start, end > start ? end : runtime.length);
}

test('typing quantity in a product card re-renders the cart rows, not only the totals', () => {
  const preview = functionBlock('previewQtyInput', 'commitQtyEditor');
  const commit = functionBlock('commitQtyEditor', 'updateCart');

  assert.match(preview, /if \(input\.dataset\.qtyEditor === 'cart'\)[\s\S]*?refreshCartTotalsOnly\(\);[\s\S]*?else \{[\s\S]*?renderCartUI\(\);/);
  assert.match(commit, /if \(input\.dataset\.qtyEditor === 'cart'\)[\s\S]*?refreshCartTotalsOnly\(\);[\s\S]*?else \{[\s\S]*?renderCartUI\(\);/);
});

test('cart STT and clickable product name share a single center axis', () => {
  const final=css.slice(css.indexOf('/* FIXED STYLE: cart-five-columns-no-implicit-areas-20261008'));
  assert.match(final, /#cartItemList \.cart-compact-grid \.cart-stt\{[^}]*align-self:center !important;/);
  assert.match(final, /#cartItemList \.cart-compact-grid \.cart-left > \.min-w-0\{[^}]*align-self:center !important;/);
  assert.match(css, /#cartBottomSheet #cartItemList \.cart-compact-grid \.cart-name-note-trigger\{[^}]*height:34px !important;/);
});
