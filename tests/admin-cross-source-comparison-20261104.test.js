import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const html=readFileSync(new URL('../admin-gia.html',import.meta.url),'utf8');

test('price comparison normalizes whitespace in product names',()=>{
  const line=html.split('\n').find(line=>line.includes("toLocaleLowerCase('vi').replace("));
  assert.ok(line,'name normalization exists');
  assert.ok(line.includes('replace(/'+String.fromCharCode(92)+'s+/g'), 'whitespace regular expression is not double-escaped');
});

test('all-source search renders comparison for matching milk and regular goods',()=>{
  assert.match(html,/function renderCrossSource\(\)/);
  assert.match(html,/renderCrossSource\(\);/);
  assert.match(html,/crossSourcePanel/);
  assert.match(html,/group\['hang-thuong'\]\?\.length===1&&group\.sua\?\.length===1/);
});
