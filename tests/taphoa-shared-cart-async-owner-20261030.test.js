import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

// SPEC-SHARED-CART-OWNER-20261030
// Given an employee/public shared cart, an obsolete queued save or GET cannot
// mutate the next link's cart. Local edits remain authoritative until ack.
// No extra polling, RPC families, pricing, or order-related changes.
const source=readFileSync(new URL('../src/fixed-production-overrides.js',import.meta.url),'utf8');
const saveStart=source.indexOf('  function sharedCartItems(){');
const saveEnd=source.indexOf('  function installSharedCartQuantitySync(){',saveStart);
const pollStart=source.indexOf('  function applySharedCartSnapshot(');
const pollEnd=source.indexOf('  async function enterEmployeeLink(',pollStart);
assert.ok(saveStart>0&&saveEnd>saveStart&&pollStart>saveEnd&&pollEnd>pollStart);
const code=source.slice(saveStart,saveEnd)+'\n'+source.slice(pollStart,pollEnd);

function deferred(){
 let resolve,reject;
 const promise=new Promise((a,b)=>{resolve=a;reject=b;});
 return {promise,resolve,reject};
}
async function tick(){for(let i=0;i<35;i++)await Promise.resolve();}
function fixture(storage=new Map()){
 const timers=[],intervals=[],requests=[],reads=[],warns=[],renders=[];
 let identity={uid:'A'},mode='employee-link',token='A',slug='';
 const pendingWrites=new Map(),pendingReads=[];
 let clockNow=Date.now();
 const ctx={
  cart:{P1:{qty:1,price:0,name:'Prod 1'}},
  appData:{sanpham:[['id','name'],['P1','Prod 1'],['P2','Prod 2']]},
  backend:()=>({
   getIdentity:()=>identity,
   getAccessMode:()=>mode,
   getPublicAccess:()=>slug?{slug}:null,
   getEmployeeAccess:()=>token?{token}:null,
   saveSharedQuantities:items=>{
    requests.push({token,slug,items});
    const key=token||slug;
    const pending=pendingWrites.get(key);
    return pending?pending.promise:Promise.resolve({ok:true});
   },
   employeeSnapshot:()=>{
    const pending=deferred();pendingReads.push({token,slug,...pending});
    return pending.promise;
   }
  }),
  document:{hidden:false},navigator:{onLine:true},
  sessionStorage:{
   getItem:key=>storage.has(key)?storage.get(key):null,
   setItem:(key,value)=>storage.set(key,String(value)),
   removeItem:key=>storage.delete(key)
  },
  renderProductList:()=>renders.push('products'),
  renderCartUI:()=>renders.push('cart'),
  console:{warn:(...args)=>warns.push(args)},
  Date:{now:()=>clockNow},Number,String,Boolean,Array,Object,Map,Set,Promise,JSON,Math,
  setTimeout:fn=>{timers.push(fn);return timers.length;},
  clearTimeout:id=>{if(id)timers[id-1]=null;},
  setInterval:fn=>{intervals.push(fn);return intervals.length;},
  clearInterval:id=>{if(id)intervals[id-1]=null;}
 };
 const init=String.raw`
 let __cartTouchSeq=0;
 let sharedCartSaveTimer=0;
 let sharedCartSaveChain=Promise.resolve();
 let sharedCartPoll=0;
 let sharedCartSignature='';
 let sharedCartLocalWriteAt=0;
 let sharedCartLocalEditSeq=0;
 let sharedCartCommittedEditSeq=0;
 let sharedCartPollRequestSeq=0;
 let sharedCartPollInFlight=false;
 let sharedCartPollStartedAt=0;
 let sharedCartRetryTimer=0;
 let sharedCartRetryCount=0;
 let sharedCartRetryReady=false;
 const SHARED_CART_DRAFT_KEY='taphoa.shared-cart.pending.v1.';
 const SHARED_CART_DRAFT_MAX_AGE=30*60*1000;
 `;
 vm.createContext(ctx);
 vm.runInContext(init+'\n'+code+'\n'+
  'globalThis.api={scheduleSharedCartSave,retryPendingSharedCartSave,startSharedCartSync,resetSharedCartSyncOwner,applySharedCartSnapshot,sharedCartItems,restorePendingSharedCartDraft,sharedCartDraftKey,touchSeq:()=>__cartTouchSeq,signature:()=>sharedCartSignature,edits:()=>[sharedCartLocalEditSeq,sharedCartCommittedEditSeq],retryState:()=>[sharedCartRetryReady,sharedCartRetryCount],pollState:()=>[sharedCartPollInFlight,sharedCartPollStartedAt]};',
  ctx,{timeout:1000});
 return {
  ctx,requests,reads,pendingReads,pendingWrites,timers,intervals,renders,warns,storage,
  advance:ms=>{clockNow+=ms;},
  schedule:()=>ctx.api.scheduleSharedCartSave(),
  start:()=>ctx.api.startSharedCartSync(),
  flush:async()=>{for(const timer of timers.splice(0))if(timer)timer();await tick();},
  poll:async()=>{const fn=intervals.at(-1);if(fn)await fn();},
  firePoll:()=>intervals.at(-1)?.(),
  delayWrite:owner=>{const pending=deferred();pendingWrites.set(owner,pending);return pending;},
  switchTo(newToken,newMode='employee-link'){
   identity={uid:newToken};token=newMode==='employee-link'?newToken:'';
   slug=newMode==='public-link'?newToken:'';mode=newMode;
   ctx.cart={P2:{qty:7,price:0,name:'Prod 2'}};
  }
 };
}
function items(code,qty){return {items:[{product_code:code,employee_qty:qty}]};}

test('queued save from old employee link never posts to the next link',async()=>{
 const f=fixture();
 const held=f.delayWrite('A');
 f.schedule();await f.flush();
 assert.equal(f.requests.length,1);
 f.ctx.cart.P1.qty=2;
 f.schedule();await f.flush();
 assert.equal(f.requests.length,1,'second A save waits for first A');
 f.switchTo('B');
 f.schedule();await f.flush();
 held.resolve({ok:true});
 await tick();
 assert.equal(f.requests.length,2);
 assert.equal(f.requests[0].token,'A');
 assert.equal(f.requests[1].token,'B');
 assert.deepEqual(Array.from(f.requests[1].items,item=>({...item})),[{product_code:'P2',qty:7}]);
 assert.equal(f.ctx.api.signature(),JSON.stringify([['P2',7]]));
});

test('poll started before a local quantity edit cannot overwrite the input',async()=>{
 const f=fixture();f.start();
 const oldPoll=f.firePoll();await tick();
 assert.equal(f.pendingReads.length,1);
 f.ctx.cart.P1.qty=9;
 f.schedule();
 f.pendingReads[0].resolve(items('P1',1));
 await oldPoll;
 assert.equal(f.ctx.cart.P1.qty,9);
 await f.flush();
 assert.equal(f.requests.length,1);
 assert.equal(f.ctx.api.signature(),JSON.stringify([['P1',9]]));
});

test('poll does not overwrite a quantity while its write acknowledgement is pending',async()=>{
 const f=fixture();f.start();
 const held=f.delayWrite('A');
 f.ctx.cart.P1.qty=8;
 f.schedule();await f.flush();
 f.firePoll();await tick();
 assert.equal(f.pendingReads.length,0,'local edit is protected until server confirms it');
 held.resolve({ok:true});await tick();
 assert.equal(f.ctx.api.edits().join(','),'1,1');
});

test('hung snapshot poll is superseded only after timeout and obsolete response is ignored',async()=>{
 const f=fixture();f.start();
 const old=f.firePoll();await tick();
 f.firePoll();await tick();
 assert.equal(f.pendingReads.length,1,'no repeated GET while first read is pending');
 f.advance(14999);
 f.firePoll();await tick();
 assert.equal(f.pendingReads.length,1,'stalled poll must wait its full threshold');
 f.advance(1);
 const latest=f.firePoll();await tick();
 assert.equal(f.pendingReads.length,2,'one replacement GET after 15 seconds');
 f.pendingReads[0].resolve(items('P1',2));await old;
 assert.equal(f.ctx.cart.P1.qty,1,'late old GET must not overwrite current cart');
 assert.equal(f.ctx.api.pollState()[0],true,
  'settling stale GET must not unlock the current in-flight request');
 f.firePoll();await tick();
 assert.equal(f.pendingReads.length,2);
 f.pendingReads[1].resolve(items('P1',6));await latest;
 assert.equal(f.ctx.cart.P1.qty,6);
 assert.equal(f.ctx.api.pollState()[0],false);
 assert.equal(f.renders.length,2);
});

test('same-token new session rejects old poll even if token and UID are unchanged',async()=>{
 const f=fixture();f.start();
 const old=f.firePoll();await tick();
 f.switchTo('A');
 f.pendingReads[0].resolve(items('P1',100));
 await old;
 assert.deepEqual(Object.keys(f.ctx.cart),['P2']);
 assert.equal(f.renders.length,0);
});

test('failed write retains local values rather than importing an older server cart',async()=>{
 const f=fixture();f.start();
 const held=f.delayWrite('A');
 f.ctx.cart.P1.qty=4;f.schedule();await f.flush();
 held.reject(Error('save unavailable'));await tick();
 f.firePoll();await tick();
 assert.equal(f.pendingReads.length,0);
 assert.equal(f.ctx.cart.P1.qty,4);
 assert.equal(f.warns.length,1);
});

test('new employee link can save without waiting for a hung old-link request',async()=>{
 const f=fixture(),hung=f.delayWrite('A');
 f.schedule();await f.flush();
 assert.equal(f.requests.length,1);
 f.switchTo('B');
 f.ctx.api.resetSharedCartSyncOwner();
 f.schedule();await f.flush();
 assert.equal(f.requests.length,2,'B write is independent of the old pending request');
 assert.equal(f.requests[1].token,'B');
 assert.equal(f.ctx.api.signature(),JSON.stringify([['P2',7]]));
 hung.resolve({ok:true});
 await tick();
 assert.equal(f.ctx.api.signature(),JSON.stringify([['P2',7]]));
});

test('server ok:false does not mark a cart edit as synced or permit stale polling',async()=>{
 const f=fixture(),held=f.delayWrite('A');f.start();
 f.ctx.cart.P1.qty=12;
 f.schedule();await f.flush();
 held.resolve({ok:false,error:'permission denied'});
 await tick();
 assert.equal(f.ctx.api.edits().join(','),'1,0');
 f.firePoll();await tick();
 assert.equal(f.pendingReads.length,0);
 assert.equal(f.ctx.cart.P1.qty,12);
 assert.equal(f.warns.length,1);
});

test('invalid or absent shared-cart snapshots cannot erase the current quantities',()=>{
 const f=fixture();
 const original=f.ctx.cart.P1;
 f.ctx.api.applySharedCartSnapshot(null,{force:true});
 f.ctx.api.applySharedCartSnapshot({ok:false,items:[]},{force:true});
 f.ctx.api.applySharedCartSnapshot({message:'temporary error'},{force:true});
 assert.equal(f.ctx.cart.P1,original);
 assert.equal(f.ctx.cart.P1.qty,1);
 assert.equal(f.renders.length,0);
});

test('a quantity row appears once its product catalog arrives, even if server signature is identical',()=>{
 const f=fixture();
 const snapshot=items('P3',11);
 f.ctx.api.applySharedCartSnapshot(snapshot,{force:true});
 assert.equal(f.ctx.cart.P3,undefined,'cannot render unknown product before catalog read');
 f.ctx.appData.sanpham.push(['P3','Prod 3']);
 f.ctx.api.applySharedCartSnapshot(snapshot);
 assert.equal(f.ctx.cart.P3.qty,11);
 assert.equal(f.ctx.cart.P3.name,'Prod 3');
 assert.equal(f.renders.length,4);
});

test('nonfinite local quantity is never serialized into the shared stock-check save',async()=>{
 const f=fixture();
 f.ctx.cart.P1.qty=Infinity;
 f.schedule();await f.flush();
 assert.equal(f.requests.length,1);
 assert.deepEqual(Array.from(f.requests[0].items),[],
  'infinite quantity must be omitted, never serialized as null');
});
test('nonfinite server quantity cannot erase the last valid cart row',()=>{
 const f=fixture();
 f.ctx.api.applySharedCartSnapshot({items:[{product_code:'P1',employee_qty:Infinity}]},{force:true});
 assert.equal(f.ctx.cart.P1.qty,1);
 assert.equal(f.renders.length,0);
 assert.equal(f.ctx.api.signature(),'');
});


test('offline failed save is retried on reconnection without losing the local quantity',async()=>{
 const f=fixture();
 const broken=f.delayWrite('A');
 f.ctx.navigator.onLine=false;
 f.ctx.cart.P1.qty=7;
 f.schedule();await f.flush();
 broken.reject(Error('offline'));await tick();
 assert.equal(f.ctx.api.retryState()[0],true);
 assert.equal(f.ctx.api.retryState()[1],0,'no retry timer while offline');
 f.ctx.api.retryPendingSharedCartSave();
 await f.flush();
 assert.equal(f.requests.length,1);
 f.pendingWrites.delete('A');
 f.ctx.navigator.onLine=true;
 f.ctx.api.retryPendingSharedCartSave();
 await f.flush();
 assert.equal(f.requests.length,2);
 assert.equal(f.requests[1].items[0].qty,7);
 assert.equal(f.ctx.api.edits().join(','),'1,1');
 assert.equal(f.ctx.api.retryState()[0],false);
});

test('transient shared-cart write errors get at most two timed retries',async()=>{
 const f=fixture();
 const failed=f.delayWrite('A');
 f.ctx.cart.P1.qty=3;
 f.schedule();await f.flush();
 failed.reject(Error('network unreachable'));await tick();
 for(let i=0;i<4;i++)await f.flush();
 assert.equal(f.requests.length,3,'one initial attempt and two bounded retries');
 assert.equal(f.ctx.api.edits().join(','),'1,0');
 assert.equal(f.ctx.api.retryState()[1],2);
 assert.equal(f.ctx.api.retryState()[0],true);
 assert.equal(f.timers.filter(Boolean).length,0);
});

test('abandoned old-link failure cannot schedule retry or overwrite the new cart',async()=>{
 const f=fixture(),old=f.delayWrite('A');
 f.schedule();await f.flush();
 f.switchTo('B');
 f.ctx.api.resetSharedCartSyncOwner();
 f.schedule();await f.flush();
 assert.equal(f.ctx.api.edits().join(','),'1,1');
 old.reject(Error('old session lost connection'));await tick();
 assert.equal(f.ctx.api.retryState()[0],false);
 assert.equal(f.ctx.api.signature(),JSON.stringify([['P2',7]]));
 await f.flush();
 assert.equal(f.requests.length,2);
});

test('an unconfirmed backend response is treated as failed save until a valid retry',async()=>{
 const f=fixture(),reply=f.delayWrite('A');
 f.ctx.cart.P1.qty=13;
 f.schedule();await f.flush();
 reply.resolve({message:'temporarily unavailable'});await tick();
 assert.equal(f.ctx.api.edits().join(','),'1,0');
 assert.equal(f.ctx.api.retryState()[0],true);
 f.pendingWrites.delete('A');
 await f.flush();
 await f.flush();
 assert.equal(f.ctx.api.edits().join(','),'1,1');
 assert.equal(f.requests.length,2);
});

test('remote quantity updates retain product notes and newest-first insertion stamps',()=>{
 const f=fixture();
 f.ctx.cart.P1.note='Giao riêng chai thủy tinh';
 f.ctx.cart.P1.__lastTouched=23;
 f.ctx.cart.P2={name:'Prod 2',price:0,qty:3,note:'Để riêng',__lastTouched:12};
 f.ctx.api.applySharedCartSnapshot({items:[
  {product_code:'P1',employee_qty:4},
  {product_code:'P2',employee_qty:8}
 ]},{force:true});
 assert.equal(f.ctx.cart.P1.qty,4);
 assert.equal(f.ctx.cart.P1.note,'Giao riêng chai thủy tinh');
 assert.equal(f.ctx.cart.P1.__lastTouched,23);
 assert.equal(f.ctx.cart.P2.qty,8);
 assert.equal(f.ctx.cart.P2.note,'Để riêng');
 assert.equal(f.ctx.cart.P2.__lastTouched,12);
 assert.deepEqual(Object.entries(f.ctx.cart)
  .sort(([,a],[,b])=>b.__lastTouched-a.__lastTouched)
  .map(([code])=>code),['P1','P2']);
});

test('a newly synchronized product has no borrowed note or insertion stamp',()=>{
 const f=fixture();
 f.ctx.api.applySharedCartSnapshot(items('P2',6),{force:true});
 assert.equal(f.ctx.cart.P2.qty,6);
 assert.equal(f.ctx.cart.P2.note,'');
 assert.equal(f.ctx.cart.P2.__lastTouched,0);
 assert.equal(f.ctx.cart.P1,undefined);
});

test('same public quantity snapshot refreshes a revised product name and price',()=>{
 const f=fixture();
 f.switchTo('A','public-link');
 f.ctx.appData.sanpham[1][3]=100;
 f.ctx.api.applySharedCartSnapshot(items('P1',2),{force:true});
 assert.equal(f.ctx.cart.P1.price,100);
 f.ctx.cart.P1.note='Khách nhắn giao sáng';
 f.ctx.cart.P1.__lastTouched=41;
 const rendersBefore=f.renders.length;
 f.ctx.appData.sanpham[1][1]='Prod 1 mới';
 f.ctx.appData.sanpham[1][3]=125;
 f.ctx.api.applySharedCartSnapshot(items('P1',2));
 assert.equal(f.ctx.cart.P1.qty,2);
 assert.equal(f.ctx.cart.P1.name,'Prod 1 mới');
 assert.equal(f.ctx.cart.P1.price,125);
 assert.equal(f.ctx.cart.P1.note,'Khách nhắn giao sáng');
 assert.equal(f.ctx.cart.P1.__lastTouched,41);
 assert.equal(f.renders.length,rendersBefore+2);
});


// SPEC-SHARED-CART-RELOAD-20261030: tab-local backup contains only quantities,
// belongs to a verified link, and is cleared only on server acknowledgement.
test('unconfirmed shared cart quantity is restored after reload for the same employee link',async()=>{
 const storage=new Map(),before=fixture(storage);
 const stalled=before.delayWrite('A');
 before.ctx.cart.P1.qty=8;
 before.schedule();
 assert.equal(storage.size,1,'persist immediately, before debounce or network');
 const value=JSON.parse(Array.from(storage.values())[0]);
 assert.deepEqual(value.items,[{product_code:'P1',qty:8}]);
 assert.equal(value.token,undefined);
 assert.equal(value.pin,undefined);
 assert.equal(value.price,undefined);
 const reloaded=fixture(storage);
 assert.equal(reloaded.ctx.api.restorePendingSharedCartDraft(),true);
 assert.equal(reloaded.ctx.cart.P1.qty,8);
 assert.equal(reloaded.ctx.api.edits().join(','),'1,0');
 await reloaded.flush();
 assert.equal(reloaded.requests.length,1);
 assert.equal(reloaded.requests[0].items[0].qty,8);
 assert.equal(storage.size,0,'clear draft after confirmed same snapshot');
 // Resolve obsolete work: it must not recreate a saved draft or alter B.
 await before.flush();stalled.resolve({ok:true});await tick();
 assert.equal(storage.size,0);
});

test('reloaded different customer link never imports prior customer pending quantities',()=>{
 const storage=new Map(),a=fixture(storage);
 a.ctx.cart.P1.qty=5;a.schedule();
 const b=fixture(storage);
 b.switchTo('B');
 assert.equal(b.ctx.api.restorePendingSharedCartDraft(),false);
 assert.equal(b.ctx.cart.P2.qty,7);
 assert.equal(b.requests.length,0);
 assert.equal(storage.size,1,'original customer draft is left intact');
 const c=fixture(storage);
 assert.equal(c.ctx.api.restorePendingSharedCartDraft(),true);
 assert.equal(c.ctx.cart.P1.qty,5);
});

test('reloaded different link type for the same UID cannot take another link draft',()=>{
 const storage=new Map(),employee=fixture(storage);
 employee.ctx.cart.P1.qty=9;employee.schedule();
 const pub=fixture(storage);
 pub.switchTo('A','public-link');
 assert.equal(pub.ctx.api.restorePendingSharedCartDraft(),false);
 assert.equal(pub.ctx.cart.P2.qty,7);
});

test('expired shared cart draft is rejected and removed instead of overwriting live data',()=>{
 const storage=new Map(),first=fixture(storage);
 first.ctx.cart.P1.qty=99;first.schedule();
 const [key,raw]=Array.from(storage.entries())[0];
 const value=JSON.parse(raw);
 value.savedAt=Date.now()-31*60*1000;
 storage.set(key,JSON.stringify(value));
 const next=fixture(storage);
 assert.equal(next.ctx.api.restorePendingSharedCartDraft(),false);
 assert.equal(next.ctx.cart.P1.qty,1);
 assert.equal(storage.size,0);
});

test('missing catalog row never turns recovered full cart into destructive partial write',async()=>{
 const storage=new Map(),first=fixture(storage);
 first.ctx.cart.P3={qty:9,price:0};
 first.schedule();
 const next=fixture(storage);
 assert.equal(next.ctx.api.restorePendingSharedCartDraft(),false);
 await next.flush();
 assert.equal(next.requests.length,0);
 assert.equal(storage.size,1);
});

test('zero quantity / clear cart backup survives reload and syncs empty snapshot',async()=>{
 const storage=new Map(),first=fixture(storage);
 first.ctx.cart={};
 first.schedule();
 const next=fixture(storage);
 assert.equal(next.ctx.api.restorePendingSharedCartDraft(),true);
 assert.deepEqual(Object.keys(next.ctx.cart),[]);
 await next.flush();
 assert.equal(next.requests.length,1);
 assert.deepEqual(Array.from(next.requests[0].items),[]);
 assert.equal(storage.size,0);
});

test('older acknowledged quantity cannot erase a newer saved draft in same session',async()=>{
 const f=fixture();
 const held=f.delayWrite('A');
 f.ctx.cart.P1.qty=2;f.schedule();await f.flush();
 f.ctx.cart.P1.qty=7;f.schedule();
 held.resolve({ok:true});await tick();
 assert.equal(f.storage.size,1);
 assert.equal(JSON.parse(Array.from(f.storage.values())[0]).items[0].qty,7);
 // Confirm the final edit once queued.
 f.pendingWrites.delete('A');
 await f.flush();
 assert.equal(f.ctx.api.edits().join(','),'2,2');
 assert.equal(f.storage.size,0);
});


test('reloaded draft keeps newest-first order and later additions still go to row one',async()=>{
 const storage=new Map(),before=fixture(storage);
 before.ctx.cart={
  P1:{qty:2,price:0,name:'P1',__lastTouched:8},
  P2:{qty:5,price:0,name:'P2',__lastTouched:24}
 };
 before.schedule();
 const saved=JSON.parse(Array.from(storage.values())[0]);
 assert.deepEqual(saved.items.map(x=>x.product_code),['P2','P1']);
 const restored=fixture(storage);
 assert.equal(restored.ctx.api.restorePendingSharedCartDraft(),true);
 assert.ok(restored.ctx.cart.P2.__lastTouched>restored.ctx.cart.P1.__lastTouched);
 assert.equal(restored.ctx.api.touchSeq(),2);
 const oldStamp=restored.ctx.cart.P1.__lastTouched;
 restored.ctx.cart.P1.qty=9;
 assert.equal(restored.ctx.cart.P1.__lastTouched,oldStamp,
   'editing existing row must keep insertion stamp');
 vm.runInContext('__cartTouchSeq++;',restored.ctx);
 restored.ctx.cart.P3={qty:1,__lastTouched:restored.ctx.api.touchSeq()};
 assert.ok(restored.ctx.cart.P3.__lastTouched>restored.ctx.cart.P2.__lastTouched);
 // A pending outbound cart must include every item in current insertion order.
 const rows=Array.from(restored.ctx.api.sharedCartItems()).map(x=>x.product_code);
 assert.deepEqual(rows,['P3','P2','P1']);
});

test('duplicate product codes in stored cart are rejected without posting partial quantities',async()=>{
 const storage=new Map(),first=fixture(storage);
 first.schedule();
 const [key,raw]=Array.from(storage.entries())[0];
 const saved=JSON.parse(raw);
 saved.items.push({...saved.items[0],qty:90});
 storage.set(key,JSON.stringify(saved));
 const reloaded=fixture(storage);
 assert.equal(reloaded.ctx.api.restorePendingSharedCartDraft(),false);
 assert.equal(storage.size,0);
 await reloaded.flush();
 assert.equal(reloaded.requests.length,0);
 assert.equal(reloaded.ctx.cart.P1.qty,1);
});

test('malformed JSON draft is discarded without changing current cart or queuing a write',async()=>{
 const storage=new Map(),first=fixture(storage);
 first.schedule();
 const key=Array.from(storage.keys())[0];
 storage.set(key,'{broken');
 const next=fixture(storage);
 assert.equal(next.ctx.api.restorePendingSharedCartDraft(),false);
 assert.equal(storage.size,0);
 assert.equal(next.ctx.cart.P1.qty,1);
 await next.flush();
 assert.equal(next.requests.length,0);
});

test('empty confirmed cart remains valid and leaves insertion counter untouched',async()=>{
 const storage=new Map(),first=fixture(storage);
 first.ctx.cart={};first.schedule();
 const next=fixture(storage);
 assert.equal(next.ctx.api.restorePendingSharedCartDraft(),true);
 assert.equal(next.ctx.api.touchSeq(),0);
 await next.flush();
 assert.equal(next.ctx.api.edits().join(','),'1,1');
});


test('one settled snapshot releases poll slot and a new poll can fetch again',async()=>{
 const f=fixture();f.start();
 const first=f.firePoll();await tick();
 f.pendingReads[0].resolve(items('P1',3));await first;
 assert.equal(f.ctx.api.pollState()[0],false);
 const second=f.firePoll();await tick();
 assert.equal(f.pendingReads.length,2);
 f.pendingReads[1].resolve(items('P1',4));await second;
 assert.equal(f.ctx.cart.P1.qty,4);
});

test('failed snapshot releases slot for another poll without waiting 15 seconds',async()=>{
 const f=fixture();f.start();
 const first=f.firePoll();await tick();
 f.pendingReads[0].reject(Error('offline'));await first;
 assert.equal(f.ctx.api.pollState()[0],false);
 assert.equal(f.warns.length,1);
 const second=f.firePoll();await tick();
 assert.equal(f.pendingReads.length,2);
 f.pendingReads[1].resolve(items('P1',8));await second;
 assert.equal(f.ctx.cart.P1.qty,8);
});

test('resetting link owner drops pending poll slot and old result cannot affect new session',async()=>{
 const f=fixture();f.start();
 const old=f.firePoll();await tick();
 assert.equal(f.ctx.api.pollState()[0],true);
 f.switchTo('B');f.ctx.api.resetSharedCartSyncOwner();f.start();
 const fresh=f.firePoll();await tick();
 assert.equal(f.pendingReads.length,2);
 f.pendingReads[0].resolve(items('P1',70));await old;
 assert.equal(f.ctx.api.pollState()[0],true,'old poll cannot release new owner read');
 assert.equal(f.ctx.cart.P2.qty,7);
 f.pendingReads[1].resolve(items('P2',8));await fresh;
 assert.equal(f.ctx.cart.P2.qty,8);
 assert.equal(f.ctx.api.pollState()[0],false);
});


test('malformed partial server snapshots never clear or partially replace valid cart rows',()=>{
 const bad=[
  {items:[{product_code:'P1',employee_qty:7},{product_code:'P2'}]},
  {items:[{product_code:'P1',employee_qty:7},{product_code:'P1',employee_qty:8}]},
  {items:[{product_code:'P1',employee_qty:7},{product_code:'P2',employee_qty:'invalid'}]},
  {items:[{product_code:'P1',employee_qty:7},{product_code:'P2',employee_qty:-3}]},
  {items:[{product_code:'P1',employee_qty:7},{employee_qty:2}]},
  {items:[{product_code:'P1',employee_qty:7},{product_code:'P2',employee_qty:'   '}]},
  {ok:'error',items:[]}
 ];
 for(const snapshot of bad){
  const f=fixture();
  f.ctx.cart.P1.note='Giữ ghi chú trước';
  f.ctx.api.applySharedCartSnapshot(snapshot,{force:true});
  assert.equal(f.ctx.cart.P1.qty,1,JSON.stringify(snapshot));
  assert.equal(f.ctx.cart.P1.note,'Giữ ghi chú trước');
  assert.equal(f.ctx.cart.P2,undefined);
  assert.equal(f.ctx.api.signature(),'');
  assert.equal(f.renders.length,0);
 }
});

test('valid zero/null server counts remove only their own rows and valid positive counts survive',()=>{
 const f=fixture();
 f.ctx.cart.P2={qty:8,price:0,name:'Prod 2'};
 f.ctx.api.applySharedCartSnapshot({ok:true,items:[
  {product_code:'P1',employee_qty:0},
  {product_code:'P2',employee_qty:'4'}
 ]},{force:true});
 assert.equal(f.ctx.cart.P1,undefined);
 assert.equal(f.ctx.cart.P2.qty,4);
 f.ctx.api.applySharedCartSnapshot({items:[
  {product_code:'P2',employee_qty:null}
 ]},{force:true});
 assert.deepEqual(Object.keys(f.ctx.cart),[]);
});

test('invalid snapshot after good sync preserves signature and next valid response still applies',()=>{
 const f=fixture();
 f.ctx.api.applySharedCartSnapshot(items('P1',3),{force:true});
 const signature=f.ctx.api.signature();
 const before=f.renders.length;
 f.ctx.api.applySharedCartSnapshot({items:[
  {product_code:'P1',employee_qty:10},
  {product_code:'P2',employee_qty:NaN}
 ]},{force:true});
 assert.equal(f.ctx.cart.P1.qty,3);
 assert.equal(f.ctx.api.signature(),signature);
 assert.equal(f.renders.length,before);
 f.ctx.api.applySharedCartSnapshot(items('P1',9));
 assert.equal(f.ctx.cart.P1.qty,9);
 assert.equal(f.renders.length,before+2);
});

test('malformed polling response is ignored while next valid poll remains usable',async()=>{
 const f=fixture();f.start();
 const a=f.firePoll();await tick();
 f.pendingReads[0].resolve({items:[{product_code:'P1'}]});
 await a;
 assert.equal(f.ctx.cart.P1.qty,1);
 assert.equal(f.ctx.api.pollState()[0],false);
 const b=f.firePoll();await tick();
 f.pendingReads[1].resolve(items('P1',5));await b;
 assert.equal(f.ctx.cart.P1.qty,5);
});
