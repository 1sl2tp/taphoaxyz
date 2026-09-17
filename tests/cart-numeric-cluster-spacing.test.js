const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const css = fs.readFileSync('src/fixed-ui-source-4.css','utf8');

test('cart numeric cluster uses fixed equal gaps instead of space-between', () => {
  assert.match(css, /FIXED STYLE: compact-cart-numeric-cluster/);
  assert.match(css, /\.cart-compact-grid\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,1fr\)\s+var\(--num-price-cap\)\s+72px\s+var\(--num-money-cap\)\s*!important;[\s\S]*column-gap:\s*12px\s*!important;[\s\S]*justify-content:\s*stretch\s*!important;/);
});
