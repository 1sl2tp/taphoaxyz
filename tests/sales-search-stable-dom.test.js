import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../src/screens/sales.js',import.meta.url),'utf8');

test('Sales search keeps product DOM stable and only toggles existing rows',()=>{
  assert.match(source,/function applySalesSearchVisibility\(root,state\)/);
  assert.match(source,/querySelectorAll\('\[data-product-row\]'\)/);
  assert.match(source,/row\.hidden=/);
  const branch=source.match(/if\(event\.target\.matches\('\[data-sales-search\]'\)\)\{([\s\S]*?)\n    \}/)?.[1]||'';
  assert.match(branch,/state=\{\.\.\.state,search:event\.target\.value\}/);
  assert.match(branch,/applySalesSearchVisibility\(root,state\)/);
  assert.doesNotMatch(branch,/innerHTML/);
  assert.doesNotMatch(branch,/render\(\)/);
  assert.doesNotMatch(branch,/setTimeout/);
});
