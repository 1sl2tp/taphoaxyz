import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
const html=readFileSync(new URL('../admin-gia.html',import.meta.url),'utf8');
test('phone admin keeps main navigation compact and logout actionable',()=>{
  assert.match(html,/SPEC-ADMIN-FOUR-TABS-DENSITY-20261101/);
  assert.match(html,/id="mobileLogoutBtn"/);
  assert.match(html,/\$\('mobileLogoutBtn'\)\.addEventListener\('click',logOutAdmin\)/);
  assert.match(html,/\.admin-tabs\{display:grid;grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/);
});
test('market shows candidate search only after a product is selected',()=>{
  assert.match(html,/id="marketCandidateFilter" aria-label=/);
  assert.match(html,/class="market-filter-box hidden" id="marketCandidateFilter"/);
  assert.match(html,/\$\('marketCandidateFilter'\)\.classList\.toggle\('hidden',!item\)/);
  assert.match(html,/#marketShopSource\{grid-column:2;grid-row:1\}/);
  assert.match(html,/id="marketBackToListBtn"/);
  assert.match(html,/scrollIntoView\(\{behavior:'smooth',block:'start'\}\)/);
});
test('admin embedded module parses after compact responsive changes',()=>{
  const module=html.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1];
  assert.ok(module);
  const checked=spawnSync(process.execPath,['--check','--input-type=module'],{input:module,encoding:'utf8'});
  assert.equal(checked.status,0,checked.stderr);
});
