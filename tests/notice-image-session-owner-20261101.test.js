import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const src=readFileSync(new URL('../src/fixed-production-bridge.js',import.meta.url),'utf8');
const from=src.indexOf('const orderImageUploadsInFlight=new Set();');
const until=src.indexOf('// SPEC-DEBT-MANUAL-LINKED-20261101',from);
assert.ok(from>=0&&until>from);
const slice=src.slice(from,until);
function fixture(){
 let release;const gate=new Promise(resolve=>release=resolve);
 const state={owner:'A',tickets:0,images:0};
 const ctx=vm.createContext({state,gate,console,Map,Set,Number,Math,String,Promise,Date});
 vm.runInContext(`
   let publicAccess=null,employeeAccess=null;
   const captureProductionOwner=()=>({user:state.owner});
   const productionOwnerCurrent=x=>x.user===state.owner;
   const auth={getClient:async()=>{await gate;return{rpc:async()=>{state.tickets++;return{data:{ok:true}}}};}};
   const window={TAPHOA_ORDER_PORTRAIT:{createPage:()=>{state.images++}}};
   ${slice}
   globalThis.api={attachOrderNoticePortrait,change:()=>state.owner='B'};
 `,ctx);
 return {state,api:ctx.api,release};
}
test('order portrait does not request a media ticket after session changes during getClient',async()=>{
 const f=fixture();
 const job=f.api.attachOrderNoticePortrait({order_id:'old',customer_id:'old',status:'delivered'});
 f.api.change();f.release();
 assert.equal(await job,false);
 assert.equal(f.state.tickets,0);
 assert.equal(f.state.images,0);
});
test('finance notice has the same owner checks before media and attach RPC',()=>{
 const start=src.indexOf('async function attachDebtNoticeImage(result){');
 const end=src.indexOf('async function repairRecentFinanceImages(',start);
 assert.ok(start>0&&end>start);
 const code=src.slice(start,end);
 assert.match(code,/const noticeOwner=captureProductionOwner\(\)/);
 assert.match(code,/if\(!productionOwnerCurrent\(noticeOwner\)\)return false/);
 assert.match(code,/if\(!productionOwnerCurrent\(noticeOwner\)\)return false;\s*if\(uploaded\.error\)/);
});
test('old order notices check owner before both storage upload and image attachment',()=>{
 assert.match(slice,/SPEC-MEDIA-UPLOAD-SESSION-20261101/);
 assert.match(slice,/if\(!productionOwnerCurrent\(noticeOwner\)\)return false;\s*if\(blob\.size/);
 assert.match(slice,/if\(!productionOwnerCurrent\(noticeOwner\)\)return false;\s*if\(object\.error\)/);
});
