import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../src/screens/sales.js',import.meta.url),'utf8');

test('sales search keeps the same input and never force-focuses or rebuilds markup',()=>{
  const branch=source.match(/if\(event\.target\.matches\('\[data-sales-search\]'\)\)\{([\s\S]*?)\n    \}/)?.[1]||'';
  assert.match(branch,/applySalesSearchVisibility\(root,state\)/);
  assert.doesNotMatch(branch,/\.focus\(/);
  assert.doesNotMatch(branch,/setSelectionRange\(/);
  assert.doesNotMatch(branch,/innerHTML/);
  assert.doesNotMatch(branch,/render\(\)/);
});
