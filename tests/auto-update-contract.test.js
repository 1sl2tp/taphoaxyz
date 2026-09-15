import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8').catch(()=> '');

async function loadUpdateModule(){
  try{return await import('../src/core/app-update.js');}catch{return {};}
}

async function loadSalesModule(){
  return import('../src/screens/sales.js');
}

test('update controller defers a discovered build until reload is safe',async()=>{
  const mod=await loadUpdateModule();
  assert.equal(typeof mod.createAppUpdateController,'function','createAppUpdateController must exist');
  let safe=false;
  const reloads=[];
  const controller=mod.createAppUpdateController({
    currentBuild:'old-build',
    fetchVersion:async()=>({build_id:'new-build'}),
    isSafeToReload:()=>safe,
    reload:build=>reloads.push(build),
    schedule:()=>0,
    cancelSchedule:()=>{},
    now:()=>1000,
    storage:{getItem:()=>null,setItem:()=>{}},
  });
  await controller.check({reason:'test'});
  assert.deepEqual(reloads,[],'unsafe state must not reload');
  assert.equal(controller.snapshot().pendingBuild,'new-build');
  safe=true;
  assert.equal(controller.maybeReload(),true);
  assert.deepEqual(reloads,['new-build']);
});

test('sales draft state blocks automatic reload only when unsaved order work exists',async()=>{
  const mod=await loadSalesModule();
  assert.equal(typeof mod.salesHasUnsavedWork,'function','salesHasUnsavedWork must exist');
  assert.equal(mod.salesHasUnsavedWork({cart:{},notes:{},editOrder:null}),false);
  assert.equal(mod.salesHasUnsavedWork({cart:{p1:2},notes:{},editOrder:null}),true);
  assert.equal(mod.salesHasUnsavedWork({cart:{},notes:{p1:'ghi chú'},editOrder:null}),true);
  assert.equal(mod.salesHasUnsavedWork({cart:{},notes:{},editOrder:{id:'o1'}}),true);
});

test('main push publishes a same-origin version marker without recursive marker commits',async()=>{
  const workflow=await read('.github/workflows/publish-version-marker.yml');
  assert.match(workflow,/branches:\s*\[main\]/);
  assert.match(workflow,/paths-ignore:/);
  assert.match(workflow,/version\.json/);
  assert.match(workflow,/contents:\s*write/);
  assert.match(workflow,/GITHUB_SHA/);
  assert.match(workflow,/auto-when-safe/);
  const version=JSON.parse(await read('version.json'));
  assert.equal(version.update_policy,'auto-when-safe');
  assert.equal(version.published_from,'github-main');
  assert.ok(String(version.build_id||'').length>=7);
});

test('runtime wires update checks, service worker and screen safety into the app shell',async()=>{
  const app=await read('src/app.js');
  const index=await read('index.html');
  const worker=await read('sw.js');
  assert.match(app,/createAppUpdateController/);
  assert.match(app,/setUpdateUnsafe/);
  assert.match(app,/version\.json/);
  assert.match(index,/app-build-id/);
  assert.match(worker,/cache:\s*['"]no-store['"]/);
  assert.match(worker,/SKIP_WAITING/);
});
