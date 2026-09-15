import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../src/screens/sales.js',import.meta.url),'utf8');

test('sales search stays responsive without force-focusing after each key',()=>{
  const branch=source.match(/if\(event\.target\.matches\('\[data-sales-search\]'\)\)\{([\s\S]*?)\n    \}/)?.[1]||'';
  assert.match(branch,/scheduleSalesSearchRefresh\(\)/);
  assert.doesNotMatch(branch,/\.focus\(/);
  assert.doesNotMatch(branch,/setSelectionRange\(/);
  assert.doesNotMatch(branch,/productList\.innerHTML/);
});
