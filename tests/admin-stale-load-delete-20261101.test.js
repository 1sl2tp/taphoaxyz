import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
const admin=readFileSync(new URL('../admin-gia.html',import.meta.url),'utf8');
test('a new edit while a catalog RPC is in flight forces a refreshed read',()=>{
 assert.match(admin,/requestedEditRevision=productEditRevision/);
 assert.match(admin,/if\(productEditRevision!==requestedEditRevision\)\{/);
 assert.match(admin,/if\(!await flushProductEditsBeforeReload\(\)\)\{blocked=true;return;\}/);
 assert.match(admin,/productEditRevision\+\+/);
});
test('deleted product is reloaded to repair row indices and pagination',()=>{
 const block=admin.split('async function deleteProduct(row){')[1]?.split('async function loadSupplierFeedback')[0];
 assert.ok(block);
 assert.match(block,/if\(items\.length===1&&offset>0\)offset=Math\.max\(0,offset-PAGE_SIZE\)/);
 assert.match(block,/await loadPage\(false\)/);
 assert.doesNotMatch(block,/row\.remove\(\)/);
});
test('out-of-order market search errors do not erase fresh results',()=>{
 assert.match(admin,/if\(marketRefreshQueued\|\|requestedQuery!==\$\('marketOwnSearch'\)\.value\.trim\(\)\|\|requestedSource!==\$\('marketOwnSource'\)\.value\)\{/);
 assert.match(admin,/if\(generation!==marketCandidateGeneration\|\|marketSelectedCode!==selectedCode\)return;\s*console\.error\('market search'/);
 assert.match(admin,/\+\+marketCandidateGeneration;\s*marketCandidates=\[\];marketCandidateOffset=0;marketCandidateHasMore=false/);
});
test('admin script parses',()=>{
 const script=admin.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1];
 assert.ok(script);
 const check=spawnSync(process.execPath,['--check','--input-type=module'],{input:script,encoding:'utf8'});
 assert.equal(check.status,0,check.stderr);
});
