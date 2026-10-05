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

test('cart STT is anchored to the product-name line even when a note exists', () => {
  assert.match(css, /#cartItemList \.cart-left\s*\{[^}]*align-items\s*:\s*start\s*!important;/);
  assert.match(css, /#cartItemList \.cart-stt\s*\{[^}]*align-self\s*:\s*start\s*!important;[^}]*line-height\s*:\s*1\.25\s*!important;/);
});
