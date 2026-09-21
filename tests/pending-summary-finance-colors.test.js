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

test('order source summaries keep finance meaning without repeated strong colors', () => {
  assert.match(css, /\.order-summary-panel\s+\.summary-compact-table\s+thead th:nth-child\(3\)::before/);
  assert.match(css, /\.order-summary-panel\s+\.summary-compact-table\s+thead th:nth-child\(4\)::before/);
  assert.match(css, /\.order-summary-panel\s+\.summary-compact-table\s+thead th:nth-child\(5\)::before/);
  assert.match(css, /tbody tr:not\(\.summary-total-row\) > td\{[\s\S]*color:#374151 !important;/);
  assert.match(css, /tbody tr\.summary-total-row > td\{[\s\S]*color:#111827 !important;/);
  assert.doesNotMatch(css, /#tab-don-tam\s+\.summary-compact-table\s+:is\(th,td\):nth-child\(3\)/);
  assert.match(index, /fixed-ui-pending-summary-colors\.css\?v=calm-summary-20260922/);
});
