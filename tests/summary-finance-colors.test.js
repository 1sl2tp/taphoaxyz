import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const css = fs.readFileSync('src/fixed-ui-source-4.css', 'utf8');

test('summary Chi Thu Lai columns use red blue green for headers and values', () => {
  assert.match(css, /FIXED STYLE: summary-finance-colors/);
  assert.match(css, /\.summary-compact-table\s+:is\(th,td\):nth-child\(3\)\s*\{\s*color:\s*#ef4444\s*!important;/s);
  assert.match(css, /\.summary-compact-table\s+:is\(th,td\):nth-child\(4\)\s*\{\s*color:\s*#2563eb\s*!important;/s);
  assert.match(css, /\.summary-compact-table\s+:is\(th,td\):nth-child\(5\)\s*\{\s*color:\s*#16a34a\s*!important;/s);
});
