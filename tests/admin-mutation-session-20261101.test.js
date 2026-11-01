import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const page=readFileSync(new URL('../admin-gia.html',import.meta.url),'utf8');
const start=page.indexOf('    // SPEC-ADMIN-MUTATION-SESSION-20261101:');
const end=page.indexOf('\n\n    // SPEC-ADMIN-SAFE-EDIT-NAV-',start);
assert.ok(start>=0&&end>start);
const updateSource=page.slice(start,end);
test('tab market update response after logout does not paint stale status',async()=>{
 let done,started;
 const request=new Promise(resolve=>{done=resolve});
 const began=new Promise(resolve=>{started=resolve});
 const fields={marketRunUpdateBtn:{disabled:false},marketUpdateStatus:{textContent:''}};
 const state={fields,statusCalls:0};
 const ctx=vm.createContext({state,Promise,console});
 vm.runInContext(`
  let catalogSessionGeneration=0,identity={uid:'admin',role:'admin'};
  const $=id=>state.fields[id];
  const rpc=async()=>{started();await request;return true};
  const loadMarketStatus=async()=>{state.statusCalls++;};
  ${updateSource}
  globalThis.api={runMarketUpdate,logout:()=>{catalogSessionGeneration++;identity=null;state.fields.marketRunUpdateBtn.disabled=false}};
 `,Object.assign(ctx,{started,request}));
 const current=ctx.api.runMarketUpdate();
 await began;
 ctx.api.logout();
 done();
 await current;
 assert.equal(state.statusCalls,0);
 assert.equal(fields.marketUpdateStatus.textContent,'Đang khởi động cập nhật…');
 assert.equal(fields.marketRunUpdateBtn.disabled,false);
});
test('mutation handlers reject prior login completions and close dialogs on reset',()=>{
 assert.match(page,/SPEC-ADMIN-MUTATION-SESSION-20261101/);
 assert.match(page,/if\(!adminOperationCurrent\(generation,adminUid\)\)return;\s*\$\('productDialog'\)\.close/);
 assert.match(page,/if\(!adminOperationCurrent\(generation,adminUid\)\)return;\s*if\(action==='delete'\)selectedSource=''/);
 assert.match(page,/for\(const id of \['sourceDialog','productDialog','columnDialog'\]\)/);
 assert.match(page,/\$\('sourceSubmitBtn'\)\.disabled=false/);
 assert.match(page,/\$\('productSubmitBtn'\)\.disabled=false/);
});
