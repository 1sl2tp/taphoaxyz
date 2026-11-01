import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const page=readFileSync(new URL('../admin-gia.html',import.meta.url),'utf8');
const start=page.indexOf('    // SPEC-ADMIN-MARKET-MUTATION-OWNER-20261101:');
const end=page.indexOf('    async function loadMarketStatus(){',start);
assert.ok(start>=0&&end>start);
const src=page.slice(start,end);
test('all supermarket write paths fence responses by login and selected product',()=>{
 for(const name of ['renameMarketProduct','assignMarketCandidate','clearMarketCandidate','setMarketImage','copyMarketVariant','copyMarketPack']){
  const from=src.indexOf('async function '+name+'(');
  const next=src.indexOf('async function ',from+16);
  const section=src.slice(from,next>0?next:src.length);
  assert.match(section,/const sessionGeneration=catalogSessionGeneration,adminUid=identity\?\.uid,productCode=item\.product_code/);
  assert.match(section,/if\(!marketMutationCurrent\(sessionGeneration,adminUid,productCode\)\)return;/);
  assert.match(section,/await rpc\(/);
 }
});
function fixture(){
 let release,begin;
 const promise=new Promise(resolve=>release=resolve);
 const started=new Promise(resolve=>begin=resolve);
 const state={status:{textContent:''},events:[],button:{dataset:{marketCandidate:'choice'},disabled:false,textContent:'Gán'}};
 const ctx=vm.createContext({state,Promise,console,Array,String,begin,promise});
 vm.runInContext(`
   let catalogSessionGeneration=0,identity={uid:'admin1',role:'admin'},marketSelectedCode='A';
   const item={product_code:'A',product_name:'A'};
   const selectedMarketItem=()=>marketSelectedCode==='A'?item:{product_code:'B',product_name:'B'};
   const $=id=>id==='marketUpdateStatus'?state.status:{
     querySelectorAll:()=>[state.button],querySelector:()=>null
   };
   const rpc=async()=>{state.events.push('rpc');begin();return await promise;};
   const loadMarketMappings=async()=>{state.events.push('refresh');};
   const selectMarketProduct=async()=>{state.events.push('select');};
   const renderMarketCandidates=()=>{state.events.push('render');};
   const marketQty=String;
   ${src}
   globalThis.api={assignMarketCandidate,clearMarketCandidate,changeProduct:()=>{marketSelectedCode='B';},
     logout:()=>{catalogSessionGeneration++;identity=null;}};
 `,ctx);
 return {state,api:ctx.api,start:started,complete:release};
}
test('late supermarket assignment does not select or repaint another product',async()=>{
 const f=fixture();
 const request=f.api.assignMarketCandidate('choice');
 await f.start;
 f.api.changeProduct();f.complete({});
 await request;
 assert.deepEqual(f.state.events,['rpc']);
 assert.equal(f.state.status.textContent,'');
});
test('late supermarket assignment does not repaint a logged-out session',async()=>{
 const f=fixture();
 const request=f.api.assignMarketCandidate('choice');
 await f.start;
 f.api.logout();f.complete({});
 await request;
 assert.deepEqual(f.state.events,['rpc']);
});
