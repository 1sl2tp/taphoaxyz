import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const css = fs.readFileSync('src/fixed-ui-source-4.css', 'utf8');

test('Đơn tạm locks Chi red, Thu blue, Lãi green independently of theme utility classes', () => {
  assert.match(css, /#tab-don-tam\s+\.summary-compact-table\s+:is\(th,td\):nth-child\(3\)\s*\{\s*color:\s*#ef4444\s*!important;\s*\}/);
  assert.match(css, /#tab-don-tam\s+\.summary-compact-table\s+:is\(th,td\):nth-child\(4\)\s*\{\s*color:\s*#2563eb\s*!important;\s*\}/);
  assert.match(css, /#tab-don-tam\s+\.summary-compact-table\s+:is\(th,td\):nth-child\(5\)\s*\{\s*color:\s*#16a34a\s*!important;\s*\}/);
});
