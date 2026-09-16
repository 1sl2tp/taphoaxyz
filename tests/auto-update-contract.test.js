import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8').catch(()=> '');

async function loadUpdateModule(){
  try{return await import('../src/core/app-update.js');}catch{return {};}
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

test('sales cart DOM blocks automatic reload when quantity, note, or edit mode is present',async()=>{
  const mod=await loadUpdateModule();
  assert.equal(typeof mod.hasUnsavedSalesDom,'function','hasUnsavedSalesDom must exist');
  const root=({qty=[],notes=[],editing=false}={})=>({
    querySelectorAll(selector){
      if(selector==='[data-qty-input]')return qty.map(value=>({value}));
      if(selector==='[data-note-id]')return notes.map(value=>({value}));
      return [];
    },
    querySelector(selector){
      if(selector==='[data-sales-action="update"]')return editing?{}:null;
      return null;
    }
  });
  assert.equal(mod.hasUnsavedSalesDom(root()),false);
  assert.equal(mod.hasUnsavedSalesDom(root({qty:['2']})),true);
  assert.equal(mod.hasUnsavedSalesDom(root({notes:['ghi chú']})),true);
  assert.equal(mod.hasUnsavedSalesDom(root({editing:true})),true);
});

test('focused sales search blocks automatic reload while the user is typing',async()=>{
  const mod=await loadUpdateModule();
  assert.equal(typeof mod.focusedInputBlocksReload,'function','focusedInputBlocksReload must exist');
  const search={
    type:'search',value:'a',
    matches(selector){
      if(selector==='input')return true;
      if(selector==='[contenteditable="true"],textarea,select')return false;
      if(selector==='[data-sales-search]')return true;
      return false;
    }
  };
  const button={type:'button',value:'',matches:selector=>selector==='input'};
  assert.equal(mod.focusedInputBlocksReload(search),true,'active sales search must defer a pending app reload');
  assert.equal(mod.focusedInputBlocksReload(button),false,'non-editing input controls must not block reload');
});

test('stylesheet hot refresh applies a new build marker without reloading the page',async()=>{
  const mod=await loadUpdateModule();
  assert.equal(typeof mod.refreshStylesheetLinks,'function','refreshStylesheetLinks must exist');
  const links=[
    {href:'./src/styles/base.css',getAttribute(){return this.href;},setAttribute(_name,value){this.href=value;}},
    {href:'./src/styles/taphoa-tailwind.css?x=1',getAttribute(){return this.href;},setAttribute(_name,value){this.href=value;}},
  ];
  const root={querySelectorAll:selector=>selector==='link[rel="stylesheet"][href]'?links:[]};
  const changed=mod.refreshStylesheetLinks(root,'new-build',{baseHref:'https://beta.taphoa.xyz/'});
  assert.equal(changed,2);
  assert.match(links[0].href,/base\.css\?__build=new-build$/);
  assert.match(links[1].href,/taphoa-tailwind\.css\?x=1&__build=new-build$/);
});

test('deployment build owns version identity without recursive marker commits',async()=>{
  const workflow=await read('.github/workflows/publish-version-marker.yml');
  assert.match(workflow,/workflow_dispatch/);
  assert.match(workflow,/contents:\s*read/);
  assert.doesNotMatch(workflow,/contents:\s*write/);
  assert.doesNotMatch(workflow,/git push/);
  const build=await read('scripts/build-current.mjs');
  assert.match(build,/VERCEL_GIT_COMMIT_SHA/);
  assert.match(build,/app-build-id/);
  const version=JSON.parse(await read('version.json'));
  assert.equal(version.update_policy,'auto-when-safe');
  assert.ok(String(version.build_id||'').length>=7);
});

test('runtime wires update checks and service worker into the app shell',async()=>{
  const bootstrap=await read('src/core/app-update-bootstrap.js');
  const index=await read('index.html');
  const worker=await read('sw.js');
  assert.match(bootstrap,/createAppUpdateController/);
  assert.match(bootstrap,/version\.json/);
  assert.match(bootstrap,/serviceWorker\.register/);
  assert.match(bootstrap,/refreshStylesheetLinks/);
  assert.match(index,/app-build-id/);
  assert.match(index,/app-update-bootstrap\.js/);
  assert.match(worker,/cache:\s*['"]no-store['"]/);
  assert.match(worker,/SKIP_WAITING/);
});

test('production build includes the updater marker and service worker',async()=>{
  const build=await read('scripts/build-current.mjs');
  assert.match(build,/version\.json/);
  assert.match(build,/sw\.js/);
});
