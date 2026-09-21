import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const runtime4 = fs.readFileSync(path.join(here, '..', 'src', 'fixed-ui-runtime-4.js'), 'utf8');
const runtime5 = fs.readFileSync(path.join(here, '..', 'src', 'fixed-ui-runtime-5.js'), 'utf8');
const behavior = fs.readFileSync(path.join(here, '..', 'src', 'fixed-ui-behavior.js'), 'utf8');
const css2 = fs.readFileSync(path.join(here, '..', 'src', 'fixed-ui-source-2.css'), 'utf8');

test('product card border stays neutral during quantity interaction on every pointer type', () => {
  const renderStart = runtime4.indexOf('function renderProductList()');
  const renderEnd = runtime4.indexOf('function selectQtyInputValue', renderStart);
  assert.notEqual(renderStart, -1, 'renderProductList must exist');
  assert.notEqual(renderEnd, -1, 'renderProductList block must be bounded');

  const productRender = runtime4.slice(renderStart, renderEnd);
  assert.match(productRender, /class=\"product-card\b/,
    'product cards need a stable class for interaction styling');
  assert.doesNotMatch(productRender, /hover:border-primary\/30/,
    'quantity interaction must not inherit a Tailwind green hover border');

  assert.doesNotMatch(css2, /\.product-card:hover\s*\{[^}]*var\(--app-primary/s,
    'product cards must never turn their border green merely because the pointer is inside');
  assert.match(css2, /\.product-card\s*,\s*\.product-card:hover\s*,\s*\.product-card:focus-within\s*\{[^}]*border-color:\s*#f3f4f6\s*!important/s,
    'hover and focus-within must keep the same neutral gray border while quantity is edited');

  const updateStart = runtime5.indexOf('function updateCart(');
  const updateEnd = runtime5.indexOf('function clearCart()', updateStart);
  assert.notEqual(updateStart, -1, 'updateCart must exist');
  assert.notEqual(updateEnd, -1, 'updateCart block must be bounded');

  const updateCart = runtime5.slice(updateStart, updateEnd);
  assert.doesNotMatch(updateCart, /renderProductList\s*\(/,
    'quantity +/- must not rebuild product cards');
  assert.match(updateCart, /syncQtyEditors\s*\(/,
    'quantity +/- must update visible quantity inputs in place');
});


test('behavior override also keeps product image DOM stable during quantity +/-', () => {
  const updateStart = behavior.indexOf('updateCart = function(');
  const updateEnd = behavior.indexOf('function parseCartPriceInputValue', updateStart);
  assert.notEqual(updateStart, -1, 'behavior updateCart override must exist');
  assert.notEqual(updateEnd, -1, 'behavior updateCart override must be bounded');

  const updateCart = behavior.slice(updateStart, updateEnd);
  assert.doesNotMatch(updateCart, /renderProductList\s*\(/,
    'behavior override must not rebuild product cards or recreate product images');
  assert.match(updateCart, /syncQtyEditors\s*\(maSp,\s*nextQty\)/,
    'behavior override must update the visible quantity editor in place');
  assert.match(updateCart, /renderCartUI\s*\(/,
    'cart rows may still refresh after a quantity change');
});
