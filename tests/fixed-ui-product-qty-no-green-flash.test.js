import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const runtime4 = fs.readFileSync(path.join(here, '..', 'src', 'fixed-ui-runtime-4.js'), 'utf8');
const runtime5 = fs.readFileSync(path.join(here, '..', 'src', 'fixed-ui-runtime-5.js'), 'utf8');
const css2 = fs.readFileSync(path.join(here, '..', 'src', 'fixed-ui-source-2.css'), 'utf8');

test('product card keeps green hover only on true hover pointers so touch quantity taps do not flash the border', () => {
  const renderStart = runtime4.indexOf('function renderProductList()');
  const renderEnd = runtime4.indexOf('function selectQtyInputValue', renderStart);
  assert.notEqual(renderStart, -1, 'renderProductList must exist');
  assert.notEqual(renderEnd, -1, 'renderProductList block must be bounded');

  const productRender = runtime4.slice(renderStart, renderEnd);
  assert.match(productRender, /class=\"product-card\b/,
    'product cards need a stable class for pointer-aware hover styling');
  assert.doesNotMatch(productRender, /hover:border-primary\/30/,
    'touch devices must not receive Tailwind hover border state from quantity taps');

  assert.match(css2, /@media\s*\(hover:\s*hover\)\s*and\s*\(pointer:\s*fine\)/,
    'green hover border must be limited to devices that really support hover');
  assert.match(css2, /\.product-card:hover\s*\{[^}]*border-color:/s,
    'desktop pointer hover must still show the green product-card border');

  const updateStart = runtime5.indexOf('function updateCart(');
  const updateEnd = runtime5.indexOf('function clearCart()', updateStart);
  assert.notEqual(updateStart, -1, 'updateCart must exist');
  assert.notEqual(updateEnd, -1, 'updateCart block must be bounded');

  const updateCart = runtime5.slice(updateStart, updateEnd);
  assert.doesNotMatch(updateCart, /renderProductList\s*\(/,
    'quantity +/- must not rebuild hovered product cards');
  assert.match(updateCart, /syncQtyEditors\s*\(/,
    'quantity +/- must update visible quantity inputs in place');
});
