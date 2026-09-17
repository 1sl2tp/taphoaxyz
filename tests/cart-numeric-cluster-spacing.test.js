import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const css = fs.readdirSync('src')
  .filter(name => /^fixed-ui-.*\.css$/.test(name))
  .sort()
  .map(name => fs.readFileSync(path.join('src', name), 'utf8'))
  .join('\n');

const index = fs.readFileSync('index.html', 'utf8');

test('cart numeric cluster keeps equal visible gaps around quantity control', () => {
  assert.match(css, /FIXED STYLE: compact-cart-numeric-cluster/);
  assert.match(css, /\.cart-compact-grid\s*\{[^}]*grid-template-columns:\s*minmax\(0,1fr\)\s+var\(--num-price-cap\)\s+72px\s+var\(--num-money-cap\)\s*!important;[^}]*column-gap:\s*12px\s*!important;[^}]*justify-content:\s*stretch\s*!important;/);
  assert.match(css, /\.cart-price\s*\{[^}]*text-align:\s*right\s*!important;/);
  assert.match(css, /\.cart-total\s*\{[^}]*text-align:\s*left\s*!important;/);
  assert.match(index, /fixed-ui-cart-spacing\.css/);
});
