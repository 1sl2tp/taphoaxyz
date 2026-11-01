import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';

const html=readFileSync(new URL('../admin-gia.html',import.meta.url),'utf8');
test('goods admin shows frequent tools in one responsive row and secondary source tools on demand',()=>{
  assert.match(html,/SPEC-ADMIN-GOODS-COMPACT-20261101/);
  assert.match(html,/#goodsPane \.searchbar\{grid-template-columns:minmax\(0,1fr\) auto auto/);
  assert.match(html,/#goodsPane #searchInput\{grid-column:auto/);
  assert.match(html,/<details class="source-manage">[\s\S]*?id="deleteSourceBtn"[\s\S]*?<\/details>/);
  assert.match(html,/id="searchInput" type="search"/);
  assert.match(html,/id="statusText" class="msg" aria-live="polite"/);
});
test('goods admin offers an optional compact column preset without altering pricing logic',()=>{
  assert.match(html,/id="quickColumnsBtn"/);
  assert.match(html,/const QUICK_COLUMN_IDS=\['name','cost','price','legacy_profit','units_per_carton','retail_unit','retail_price'\]/);
  assert.match(html,/columnPrefs\.hidden=COLUMN_DEFS\.map\(col=>col\.id\)\.filter\(id=>!QUICK_COLUMN_IDS\.includes\(id\)\)/);
  assert.match(html,/table\.classList\.toggle\('name-sticky',columnPrefs\.order\.find/);
  assert.match(html,/pageRefreshQueued=true;pageRefreshReset=pageRefreshReset\|\|reset/);
});
test('goods admin embedded module parses after compact UI changes',()=>{
  const module=html.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1];
  assert.ok(module);
  const checked=spawnSync(process.execPath,['--check','--input-type=module'],{input:module,encoding:'utf8'});
  assert.equal(checked.status,0,checked.stderr);
});
