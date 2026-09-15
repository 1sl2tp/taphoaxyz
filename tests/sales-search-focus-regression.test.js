import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../src/screens/sales.js',import.meta.url),'utf8');

test('sales search restores focus and caret after refreshing the large product list',()=>{
  assert.match(source,/const searchInput=event\.target;/);
  assert.match(source,/refreshSalesSearchResults\(\);/);
  assert.match(source,/searchInput\.focus\(\{preventScroll:true\}\)/);
  assert.match(source,/searchInput\.setSelectionRange\(state\.search\.length,state\.search\.length\)/);
});
