import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const css = fs.readFileSync(new URL('../src/fixed-ui-source-4.css', import.meta.url), 'utf8');

test('leading STT and # labels/numbers are centered inside their own columns', () => {
  assert.match(css, /\.source-detail-stt\s*,[\s\S]*?\.source-detail-table-head\s*>\s*:first-child\s*\{[\s\S]*?text-align\s*:\s*center\s*!important;/);
  assert.match(css, /\.order-detail-compact-grid\s+\.order-stt\s*\{[\s\S]*?text-align\s*:\s*center\s*!important;/);
  assert.match(css, /\.cart-left\s+\.cart-stt\s*\{[\s\S]*?text-align\s*:\s*center\s*!important;/);
});
