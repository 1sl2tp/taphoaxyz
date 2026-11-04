import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../admin-gia.html',import.meta.url),'utf8');
test('comparison is read-only and skips ambiguous duplicates',()=>{
 assert.match(html,/group\['hang-thuong'\]\?\.length===1&&group\.sua\?\.length===1/);
 assert.match(html,/const rows=selectedSource \? \[\.\.\.items,\.\.\.comparisonItems\] : items/);
 assert.match(html,/const diff=\(a,b\)=>/);
 assert.match(html,/renderCrossSource\(\)/);
});
