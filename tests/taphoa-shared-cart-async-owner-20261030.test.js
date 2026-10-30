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
function fixture(){
 const timers=[],intervals=[],requests=[],reads=[],warns=[],renders=[];
 let identity={uid:'A'},mode='employee-link',token='A',slug='';
 const pendingWrites=new Map(),pendingReads=[];
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
  document:{hidden:false},
  renderProductList:()=>renders.push('products'),
  renderCartUI:()=>renders.push('cart'),
  console:{warn:(...args)=>warns.push(args)},
  Date,Number,String,Boolean,Array,Object,Map,Set,Promise,JSON,Math,
  setTimeout:fn=>{timers.push(fn);return timers.length;},
  clearTimeout:id=>{if(id)timers[id-1]=null;},
  setInterval:fn=>{intervals.push(fn);return intervals.length;},
  clearInterval:id=>{if(id)intervals[id-1]=null;}
 };
 const init=String.raw`
 let sharedCartSaveTimer=0;
 let sharedCartSaveChain=Promise.resolve();
 let sharedCartPoll=0;
 let sharedCartSignature='';
 let sharedCartLocalWriteAt=0;
 let sharedCartLocalEditSeq=0;
 let sharedCartCommittedEditSeq=0;
 let sharedCartPollRequestSeq=0;
 `;
 vm.createContext(ctx);
 vm.runInContext(init+'\n'+code+'\n'+
  'globalThis.api={scheduleSharedCartSave,startSharedCartSync,signature:()=>sharedCartSignature,edits:()=>[sharedCartLocalEditSeq,sharedCartCommittedEditSeq]};',
  ctx,{timeout:1000});
 return {
  ctx,requests,reads,pendingReads,pendingWrites,timers,intervals,renders,warns,
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
 assert.deepEqual(f.requests[1].items,[{product_code:'P2',qty:7}]);
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

test('older overlapping poll cannot replace later server snapshot',async()=>{
 const f=fixture();f.start();
 const a=f.firePoll();await tick();
 const b=f.firePoll();await tick();
 assert.equal(f.pendingReads.length,2);
 f.pendingReads[1].resolve(items('P1',6));await b;
 f.pendingReads[0].resolve(items('P1',2));await a;
 assert.equal(f.ctx.cart.P1.qty,6);
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
