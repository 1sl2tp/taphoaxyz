import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
const source=readFileSync(new URL('../admin-gia.html',import.meta.url),'utf8');
test('price editor flushes dirty rows before catalog reload',()=>{
 assert.match(source,/SPEC-ADMIN-SAFE-EDIT-NAV-20261101/);
 assert.match(source,/async function flushProductEditsBeforeReload\(\)/);
 assert.match(source,/if\(row\.dataset\.dirty==='1'\)pending\.push\(queueSave\(row\)\)/);
 assert.match(source,/if\(!await flushProductEditsBeforeReload\(\)\)\{blocked=true;return;\}/);
 assert.match(source,/if\(blocked\)\{\s*pageRefreshQueued=false;pageRefreshReset=false/);
});
test('save takes product identity and values from the triggering row before queuing',()=>{
 assert.match(source,/const item=items\.find\(x=>x\.product_code===code\)/);
 assert.match(source,/payload=rowPayload\(row\)/);
 assert.match(source,/const generation=Number\(row\.dataset\.saveGeneration\|\|0\)\+1/);
 assert.match(source,/if\(row\.dataset\.saveGeneration===String\(generation\)\)/);
 assert.match(source,/task\.finally\(\(\)=>\{if\(saveQueues\.get\(code\)===task\)saveQueues\.delete\(code\);\}\)/);
});
test('deleting a product awaits any pending edits before destructive RPC',()=>{
 assert.match(source,/async function deleteProduct\(row\)[\s\S]*?if\(!await flushProductEditsBeforeReload\(\)\)[\s\S]*?taphoa_delete_product_from_web/);
});
test('the inline admin module parses',()=>{
 const script=source.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1];
 assert.ok(script);
 const parsed=spawnSync(process.execPath,['--check','--input-type=module'],{input:script,encoding:'utf8'});
 assert.equal(parsed.status,0,parsed.stderr);
});
