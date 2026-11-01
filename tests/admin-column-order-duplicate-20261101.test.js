import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const page=readFileSync(new URL('../admin-gia.html',import.meta.url),'utf8');
const from=page.indexOf('    function loadColumnPrefs(){');
const to=page.indexOf('    function saveColumnPrefs(){',from);
assert.ok(from>=0&&to>from);
test('restoring column preferences removes repeated IDs while preserving first chosen position',()=>{
  const values={order:['price','name','price','cost','name','bad'],hidden:['name','cost','price'],widths:{name:170}};
  const ctx=vm.createContext({values});
  vm.runInContext(`
    const COLUMN_STORAGE_KEY='columns';
    const COLUMN_DEFS=[
      {id:'name',width:200,min:150},
      {id:'cost',width:82,min:58},
      {id:'price',width:112,min:92}
    ];
    const defaultColumnPrefs=()=>({order:COLUMN_DEFS.map(c=>c.id),hidden:[],widths:{}});
    const localStorage={getItem:()=>JSON.stringify(values)};
    ${page.slice(from,to)}
    globalThis.prefs=loadColumnPrefs();
  `,ctx);
  assert.deepEqual(Array.from(ctx.prefs.order),['price','name','cost']);
  assert.equal(ctx.prefs.hidden.length,2,'at least one column remains visible');
  assert.equal(ctx.prefs.widths.name,170);
});
test('deselecting a supermarket product releases any stale page-load lock',()=>{
 assert.match(page,/marketCandidates=\[\];marketCandidateOffset=0;marketCandidateHasMore=false;marketCandidateLoadingMore=false/);
 assert.match(page,/SPEC-ADMIN-COLUMN-DUPLICATE-20261101/);
});
