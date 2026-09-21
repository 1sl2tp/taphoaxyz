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
  assert.match(html,/fixed-ui-pending-summary-colors\.css\?v=real-table-summary-20260922/);

  const panelMatches=markup.match(/order-summary-panel/g) || [];
  assert.equal(panelMatches.length,2);
  const iconMatches=markup.match(/summary-panel-icon/g) || [];
  assert.equal(iconMatches.length,2);

  assert.match(css,/\.order-summary-panel\{/);
  assert.match(css,/\.order-summary-panel\{[\s\S]*background:#fff !important;/);
  assert.match(css,/\.summary-compact-table\{[\s\S]*display:table !important;[\s\S]*border-collapse:collapse !important;/);
  assert.match(css,/\.summary-compact-table thead\{[\s\S]*display:table-header-group !important;/);
  assert.match(css,/\.summary-compact-table tbody\{[\s\S]*display:table-row-group !important;/);
  assert.match(css,/\.summary-compact-table tr\{[\s\S]*display:table-row !important;/);
  assert.match(css,/\.summary-compact-table th,[\s\S]*\.summary-compact-table td\{[\s\S]*display:table-cell !important;/);
  assert.match(css,/thead th::before\{[\s\S]*content:none !important;/);
  assert.match(css,/tbody tr:not\(\.summary-total-row\) > td[\s\S]*background:#fff !important;[\s\S]*border-bottom:1px solid #edf0f2 !important;/);
  assert.match(css,/tbody tr\.summary-total-row > td[\s\S]*background:#f8fafc !important;[\s\S]*border-top:1\.5px solid #cfd5dc !important;/);

  assert.doesNotMatch(css,/#ef4444/);
  assert.doesNotMatch(css,/#2563eb/);
  assert.doesNotMatch(css,/#16a34a/);
});
