import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('delivered summary uses balanced columns and continuous row separators',async()=>{
  const markup=await readFile('src/fixed-ui-markup-2.js','utf8');
  const css=await readFile('src/fixed-ui-source-4.css','utf8');
  assert.match(markup,/completed-summary-card/);
  assert.match(markup,/completed-summary-title/);
  assert.match(markup,/completed-summary-table/);
  assert.match(css,/\.completed-summary-table\{[\s\S]{0,220}grid-template-columns:minmax\(0,2\.4fr\) minmax\(38px,\.6fr\) repeat\(3,minmax\(58px,1fr\)\)/);
  assert.match(css,/\.completed-summary-table\{[\s\S]{0,260}column-gap:0\s*!important/);
  assert.match(css,/tbody tr:not\(\.summary-total-row\) > td\{[\s\S]{0,220}border-bottom:1px solid #eef2f7/);
  assert.match(css,/tbody tr\.summary-total-row > td\{[\s\S]{0,220}border-top:1\.5px solid #d7dee8/);
  assert.match(css,/\.completed-summary-title\{[\s\S]{0,120}color:#64748b/);
});
