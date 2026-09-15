import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../src/screens/sales.js',import.meta.url),'utf8');

test('Sales search never rebuilds the heavy product list inside the input event',()=>{
  assert.match(source,/const SEARCH_RENDER_DELAY_MS=\d+;/);
  assert.match(source,/const scheduleSalesSearchRefresh=\(\)=>\{/);
  assert.match(source,/setTimeout\(\(\)=>\{[^}]*refreshSalesSearchResults\(\)/s);
  assert.match(source,/if\(event\.target\.matches\('\[data-sales-search\]'\)\)\{[\s\S]*scheduleSalesSearchRefresh\(\);[\s\S]*return;/);
  const searchBranch=source.match(/if\(event\.target\.matches\('\[data-sales-search\]'\)\)\{([\s\S]*?)\n    \}/)?.[1]||'';
  assert.doesNotMatch(searchBranch,/refreshSalesSearchResults\(\)/);
});
