import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const css = fs.readFileSync('src/fixed-ui-cart-spacing.css', 'utf8');

test('cart keeps fixed numeric tracks and right-aligns T.TIỀN inside its 84px right-aligned numeric track', () => {
  assert.match(css, /grid-template-columns:\s*minmax\(0,1fr\)\s+64px\s+124px\s+84px\s*!important;/);
  assert.match(css, /column-gap:\s*8px\s*!important;/);
  assert.match(css, /\.cart-total\s*\{[\s\S]*?text-align:\s*right\s*!important;[\s\S]*?\}/);
});
