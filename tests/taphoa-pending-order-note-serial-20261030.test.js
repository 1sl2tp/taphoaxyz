import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

// SPEC-ORDER-NOTE-SERIAL-20261030
// Given two edits of one saved pending order, each later read must see the
// preceding committed write. Order ID, line numbers, quantities, prices, and
// unrelated item notes must survive. A failed UI refresh is not a failed save.
const raw=readFileSync(new URL('../src/fixed-production-overrides.js',import.meta.url),'utf8');
const start=raw.indexOf('  const pendingOrderNoteSaves=new Map();');
const end=raw.indexOf('  window.savePendingOrderItemNoteDirect=savePendingOrderItemNoteDirect;',start);
assert.ok(start>0&&end>start);
const source=raw.slice(start,end+'  window.savePendingOrderItemNoteDirect=savePendingOrderItemNoteDirect;'.length);

function deferred(){
 let resolve,reject;
 const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});
 return {promise,resolve,reject};
}
async function tick(){for(let i=0;i<24;i++)await Promise.resolve();}
function fixture({refreshFails=false,holdRead=false}={}){
 let session={uid:'A'},readHold=holdRead?deferred():null;
 let order={
  customer_id:'CUSTOMER-1',status:'pending',note:'order header',
  items:[
   {product_id:'P1',qty:2,unit_price:100,line_no:1,note:'old 1'},
   {product_id:'P2',qty:3,unit_price:200,line_no:2,note:'old 2'}
  ]
 };
 const reads=[],writes=[],refreshes=[],warnings=[];
 const service={
  getIdentity:()=>session,
  getAccessMode:()=> 'account',
  async orderDetail(id){
   reads.push(id);
   if(readHold)await readHold.promise;
   return JSON.parse(JSON.stringify(order));
  },
  saveOrder(payload){
   const d=deferred();
   writes.push({payload,...d});
   return d.promise.then(result=>{
    if(result?.ok)order={
      ...order,note:payload.ghiChu,
      items:payload.items.map(x=>({
       product_id:x.maSP,qty:x.sl,unit_price:x.gia,line_no:x.lineNo,note:x.ghiChu
      }))
    };
    return result;
   });
  }
 };
 const win={};
 const ctx={
  Map,Promise,String,Number,Array,Error,
  backend:()=>service,
  window:win,
  refreshFixedSheets:async(names)=>{refreshes.push([...names]);if(refreshFails)throw Error('refresh unavailable');},
  console:{warn:(...parts)=>warnings.push(parts)}
 };
 vm.createContext(ctx);vm.runInContext(source,ctx,{timeout:1000});
 return {
  run:win.savePendingOrderItemNoteDirect,reads,writes,refreshes,warnings,current:()=>order,
  switchSession:()=>{session={uid:'B'};},
  releaseRead:()=>{readHold?.resolve();readHold=null;}
 };
}

test('two overlapping note edits on different lines preserve both notes and all order values',async()=>{
 const f=fixture();
 const first=f.run('ORDER-1','P1','new note 1');
 const second=f.run('ORDER-1','P2','new note 2');
 await tick();
 assert.equal(f.reads.length,1,'second edit waits for first commit before reading');
 assert.equal(f.writes.length,1);
 f.writes[0].resolve({ok:true});
 await first;
 await tick();
 assert.equal(f.reads.length,2);
 assert.equal(f.writes.length,2);
 f.writes[1].resolve({ok:true});
 assert.equal(await second,true);
 assert.deepEqual(f.current().items.map(x=>[x.product_id,x.qty,x.unit_price,x.line_no,x.note]),[
  ['P1',2,100,1,'new note 1'],
  ['P2',3,200,2,'new note 2']
 ]);
 assert.equal(f.current().customer_id,'CUSTOMER-1');
 assert.equal(f.current().note,'order header');
 assert.deepEqual(f.refreshes,[['dontam'],['dontam']]);
});

test('saving another order does not get blocked by an unrelated order note',async()=>{
 const f=fixture();
 const a=f.run('ORDER-1','P1','first');
 const b=f.run('ORDER-2','P2','other');
 await tick();
 assert.equal(f.reads.length,2);
 assert.equal(f.writes.length,2);
 f.writes[0].resolve({ok:true});f.writes[1].resolve({ok:true});
 await Promise.all([a,b]);
});

test('rejected note save does not poison next queued edit for same order',async()=>{
 const f=fixture();
 const a=f.run('ORDER-1','P1','bad');
 const b=f.run('ORDER-1','P2','good');
 await tick();
 f.writes[0].reject(Error('save rejected'));
 await assert.rejects(a,/save rejected/);
 await tick();
 assert.equal(f.writes.length,2);
 f.writes[1].resolve({ok:true});
 assert.equal(await b,true);
 assert.equal(f.current().items[0].note,'old 1');
 assert.equal(f.current().items[1].note,'good');
});

test('successful note commit remains successful even if UI list refresh fails',async()=>{
 const f=fixture({refreshFails:true});
 const promise=f.run('ORDER-1','P1','new note');
 await tick();
 f.writes[0].resolve({ok:true});
 assert.equal(await promise,true);
 assert.equal(f.warnings.length,1);
 assert.equal(f.writes.length,1);
 assert.equal(f.current().items[0].note,'new note');
});

test('server rejected update must not be presented as saved',async()=>{
 const f=fixture();
 const promise=f.run('ORDER-1','P1','new note');
 await tick();
 f.writes[0].resolve({ok:false});
 await assert.rejects(promise,/Không thể lưu ghi chú/);
 assert.equal(f.current().items[0].note,'old 1');
 assert.equal(f.refreshes.length,0);
});


test('old account note read resolving after account change must never write into the new session',async()=>{
 const f=fixture({holdRead:true});
 const pending=f.run('ORDER-1','P1','A-only note');
 await tick();
 assert.equal(f.reads.length,1);
 f.switchSession();
 f.releaseRead();
 await assert.rejects(pending,/Phiên tài khoản đã thay đổi/);
 assert.equal(f.writes.length,0);
 assert.equal(f.current().items[0].note,'old 1');
});

test('queued note captured in the old session is rejected before it can read after session change',async()=>{
 const f=fixture();
 const first=f.run('ORDER-1','P1','first');
 const queued=f.run('ORDER-1','P2','never');
 await tick();
 assert.equal(f.reads.length,1);
 f.switchSession();
 f.writes[0].resolve({ok:true});
 assert.equal(await first,true,'committed first update still succeeds');
 await assert.rejects(queued,/Phiên tài khoản đã thay đổi/);
 assert.equal(f.reads.length,1);
 assert.equal(f.writes.length,1);
 assert.equal(f.refreshes.length,0,'old session should not repaint the new account');
});

test('relogin with same UID but new identity object invalidates delayed note edit',async()=>{
 const f=fixture({holdRead:true});
 const pending=f.run('ORDER-1','P2','should not apply');
 await tick();
 f.switchSession();
 f.releaseRead();
 await assert.rejects(pending,/Phiên tài khoản đã thay đổi/);
 assert.equal(f.writes.length,0);
});
