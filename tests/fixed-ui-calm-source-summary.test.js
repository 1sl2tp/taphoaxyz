import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(path,'utf8');

test('delivered and pending source summaries use one calm neutral visual system',async()=>{
  const [html,markup,css]=await Promise.all([
    read('index.html'),
    read('src/fixed-ui-markup-2.js'),
    read('src/fixed-ui-pending-summary-colors.css')
  ]);

  assert.match(html,/fixed-ui-markup-2\.js\?v=calm-summary-20260922/);
  assert.match(html,/fixed-ui-pending-summary-colors\.css\?v=clean-summary-grid-20260922/);

  const panelMatches=markup.match(/order-summary-panel/g) || [];
  assert.equal(panelMatches.length,2);
  const iconMatches=markup.match(/summary-panel-icon/g) || [];
  assert.equal(iconMatches.length,2);

  assert.match(css,/\.order-summary-panel\{/);
  assert.match(css,/\.order-summary-panel\{[\s\S]*background:#ffffff !important;/);
  assert.match(css,/thead th:nth-child\(3\)::before/);
  assert.match(css,/thead th:nth-child\(4\)::before/);
  assert.match(css,/thead th:nth-child\(5\)::before/);
  assert.match(css,/tbody tr:not\(\.summary-total-row\) > td[\s\S]*background:transparent !important;[\s\S]*border-bottom:1px solid #f1f3f5 !important;/);
  assert.match(css,/tbody tr\.summary-total-row > td[\s\S]*color:#111827 !important;[\s\S]*background:transparent !important;[\s\S]*border-top:1\.5px solid #d9dde2 !important;/);
  assert.doesNotMatch(css,/tbody tr:nth-child\(even\):not\(\.summary-total-row\)/);
  assert.doesNotMatch(css,/box-shadow:inset 2px 0/);

  assert.doesNotMatch(css,/#ef4444/);
  assert.doesNotMatch(css,/#2563eb/);
  assert.doesNotMatch(css,/#16a34a/);
});
