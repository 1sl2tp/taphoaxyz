import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const runtime = fs.readFileSync(path.join(here, '..', 'src', 'fixed-ui-runtime-4.js'), 'utf8');

test('product quantity controls do not trigger a green product-card hover border', () => {
  const start = runtime.indexOf('function renderProductList()');
  const end = runtime.indexOf('function selectQtyInputValue', start);
  assert.notEqual(start, -1, 'renderProductList must exist');
  assert.notEqual(end, -1, 'renderProductList block must be bounded');

  const productRender = runtime.slice(start, end);
  assert.doesNotMatch(productRender, /hover:border-primary\/30/);
  assert.match(productRender, /data-qty-editor="product"/);
});
