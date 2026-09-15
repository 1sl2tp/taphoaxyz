import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const sales=readFileSync(new URL('../src/screens/sales.js',import.meta.url),'utf8');

test('Sales search uses the same simple render-refocus pattern as Delivered',()=>{
  assert.doesNotMatch(sales,/SEARCH_RENDER_DELAY_MS/);
  assert.doesNotMatch(sales,/scheduleSalesSearchRefresh/);
  assert.doesNotMatch(sales,/refreshSalesSearchResults/);
  assert.match(sales,/if\(event\.target\.matches\('\[data-sales-search\]'\)\)\{state=\{\.\.\.state,search:event\.target\.value\};render\(\);const input=root\.querySelector\('\[data-sales-search\]'\);input\?\.focus\(\);input\?\.setSelectionRange\(state\.search\.length,state\.search\.length\);return;\}/);
});
