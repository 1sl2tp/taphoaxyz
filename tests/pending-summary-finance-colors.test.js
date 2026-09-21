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

test('order source summaries use neutral true-table finance columns', () => {
  assert.match(css, /#tab-don-tam[\s\S]*tbody td\{[\s\S]*color:#374151 !important;/);
  assert.match(css, /thead th::before\{[\s\S]*content:none !important;/);
  assert.match(css, /\.summary-compact-table\{[\s\S]*display:table !important;/);
  assert.match(css, /tbody tr\.summary-total-row > td\{[\s\S]*color:#111827 !important;/);
  assert.doesNotMatch(css, /#tab-don-tam\s+\.summary-compact-table\s+:is\(th,td\):nth-child\(3\)/);
  assert.match(index, /fixed-ui-pending-summary-colors\.css\?v=order-empty-state-20260922/);
});
