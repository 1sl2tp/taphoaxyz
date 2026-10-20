import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const [worker,html,handler]=await Promise.all([
 readFile('sw.js','utf8'),
 readFile('index.html','utf8'),
 readFile('src/fixed-production-overrides.js','utf8')
]);

function simulatedWorker(){
 const events=new Map();
 const store=new Map();
 let canFetch=true;
 const requests=[];
 const cache={
  async match(request){return store.get(typeof request==='string'?request:request.url)||null;},
  async put(request,response){store.set(request.url,response);}
 };
 class FakeRequest{
  constructor(original,options={}){
   this.url=typeof original==='string'?original:original.url;
   this.method=original.method||'GET';
   this.destination=original.destination||'';
   this.mode=original.mode||'cors';
   this.cache=options.cache||original.cache||'default';
  }
 }
 const makeResponse=(body)=>({ok:true,body,clone(){return makeResponse(body)}});
 const context={
  URL,Request:FakeRequest,Promise,
  caches:{open:async()=>cache,keys:async()=>['taphoa-runtime-v38','taphoa-runtime-v39'],delete:async()=>true},
  fetch:async request=>{
   requests.push(request);
   if(!canFetch)throw Error('offline');
   return makeResponse('network-new');
  },
  self:{
   location:{origin:'https://app.taphoa.xyz'},
   skipWaiting:async()=>{},
   clients:{claim:async()=>{}},
   addEventListener:(type,listener)=>events.set(type,listener)
  }
 };
 vm.runInNewContext(worker,context);
 async function request(type,url){
  const req=new FakeRequest({url,method:'GET',destination:type,mode:type==='document'?'navigate':'cors'});
  let result;
  const event={request:req,respondWith(p){result=p},waitUntil(){}};
  events.get('fetch')(event);
  assert.ok(result,'service worker must respond to '+type);
  return result;
 }
 return {request,requests,store,setOnline:value=>{canFetch=value}};
}
const origin='https://app.taphoa.xyz/';
test('online installed PWA always uses latest checkout JS, never a stale handler',async()=>{
 const runtime=simulatedWorker();
 const url=origin+'src/fixed-production-overrides.js?v=old-query-still-cached';
 runtime.store.set(url,{ok:true,body:'cached-old'});
 const result=await runtime.request('script',url);
 assert.equal(result.body,'network-new','the previously cached JS must not run after release');
 assert.equal(runtime.requests.length,1);
 assert.equal(runtime.requests[0].cache,'no-cache');
});
test('PWA navigation gets latest HTML and new versioned checkout script',async()=>{
 const runtime=simulatedWorker();
 runtime.store.set(origin,{ok:true,body:'cached-old-index'});
 assert.equal((await runtime.request('document',origin)).body,'network-new');
 assert.equal(runtime.requests[0].cache,'no-cache');
 assert.match(html,/fixed-production-overrides\.js[^"]*order-edit-persist=20261021/);
});
test('offline mobile PWA still falls back to last-good source',async()=>{
 const runtime=simulatedWorker();
 const url=origin+'src/fixed-production-overrides.js?v=offline';
 runtime.store.set(url,{ok:true,body:'offline-working-handler'});
 runtime.setOnline(false);
 assert.equal((await runtime.request('script',url)).body,'offline-working-handler');
 runtime.store.set(origin,{ok:true,body:'offline-last-good-shell'});
 assert.equal((await runtime.request('document',origin)).body,'offline-last-good-shell');
});
test('existing-order update remains in edit; new/promotion still exit',()=>{
 assert.match(handler,/const isUpdatingExistingOrder=Boolean\(editingOrderId\)&&!isPromotingDraft/);
 assert.match(handler,/if\(isUpdatingExistingOrder\)\{[\s\S]*?editingOrderInSaleMode=true;[\s\S]*?renderCartFooterActions\(\)/);
 assert.match(handler,/else\{\s*\/\/ New orders and draft-to-delivered promotions really end checkout\.\s*resetSaleSession\(\);\s*closeCartMobile\(\);/);
});
