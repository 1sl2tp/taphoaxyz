import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
const html=readFileSync(new URL('../admin-gia.html',import.meta.url),'utf8');
test('responsive goods table leaves more space after pinned name and lets editors jump to price',()=>{
  assert.match(html,/SPEC-ADMIN-GOODS-PRICE-JUMP-20261101/);
  assert.match(html,/id="jumpPriceBtn"/);
  assert.match(html,/Math\.min\(savedWidth,186\)/);
  assert.match(html,/function syncPriceJump\(\)/);
  assert.match(html,/price\.getBoundingClientRect\(\)\.left-wrap\.getBoundingClientRect\(\)\.left/);
  assert.match(html,/\$\('jumpPriceBtn'\)\.addEventListener\('click'/);
});
test('market map and candidate searches preserve latest user request',()=>{
  assert.match(html,/marketRefreshQueued=true;marketRefreshReset=marketRefreshReset\|\|reset/);
  assert.match(html,/loadMarketMappings\(queuedReset\)/);
  assert.match(html,/const generation=\+\+marketCandidateGeneration/g);
  assert.match(html,/generation!==marketCandidateGeneration\|\|marketSelectedCode!==selectedCode/);
});
test('analytics latest period choice remains queued during an in-flight request',()=>{
  assert.match(html,/if\(analyticsLoading\)\{if\(force\)analyticsReloadQueued=true;return;\}/);
  assert.match(html,/analyticsReloadQueued=false;\s*loadQuoteAnalytics\(true\)/);
});
test('admin inline JS remains valid',()=>{
  const module=html.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1];
  assert.ok(module);
  const checked=spawnSync(process.execPath,['--check','--input-type=module'],{input:module,encoding:'utf8'});
  assert.equal(checked.status,0,checked.stderr);
});
