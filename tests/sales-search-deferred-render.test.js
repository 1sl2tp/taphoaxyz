import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../src/screens/sales.js',import.meta.url),'utf8');

test('Sales search never rebuilds product markup while typing',()=>{
  assert.match(source,/function applySalesSearchVisibility\(root,state\)/);
  assert.match(source,/querySelectorAll\('\[data-product-row\]'\)/);
  const searchBranch=source.match(/if\(event\.target\.matches\('\[data-sales-search\]'\)\)\{([\s\S]*?)\n    \}/)?.[1]||'';
  assert.match(searchBranch,/applySalesSearchVisibility\(root,state\)/);
  assert.doesNotMatch(searchBranch,/innerHTML/);
  assert.doesNotMatch(searchBranch,/render\(\)/);
  assert.doesNotMatch(searchBranch,/setTimeout/);
});
