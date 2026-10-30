import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

// SPEC-ORDER-DELETE-DOUBLE-CONFIRM-20261030
// Given a confirmed deletion, repeated confirmation must not issue a second
// financial/order command while the first is pending. A committed DB deletion
// stays successful if only the UI projection refresh fails.
const raw=readFileSync(new URL('../src/fixed-production-overrides.js',import.meta.url),'utf8');
const start=raw.indexOf('  requestClearSheet=function(sheetName){');
const end=raw.indexOf('\n  // DEBT-223:',start);
assert.ok(start>=0&&end>start);
const snippet=raw.slice(start,end);
function deferred(){
 let resolve,reject;
 const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});
 return {promise,resolve,reject};
}
function fixture({refreshFails=false}={}){
 const confirmations=[],writes=[],alerts=[],toasts=[],events=[];
 const svc={
  batchOrders:(...args)=>issue('batch',args),
  reverseOrder:(...args)=>issue('reverse',args),
  deletePending:(...args)=>issue('delete',args)
 };
 function issue(name,args){
  const promise=deferred();writes.push({name,args,...promise});return promise.promise;
 }
 const ctx={
  requestClearSheet:null,requestDeleteOrder:null,
  currentAuthRole:'admin',editingOrderId:'',
  appData:{dontam:[['id'],['ORDER-1']],dongiao:[['id'],['DELIVERED-1']]},
  hasPermission:()=>true,denyPermission:msg=>{throw Error(msg);},
  uniqueOrderIds:()=>['ORDER-BACKEND-ID'],
  backendOrderIdFor:()=> 'ORDER-BACKEND-ID',
  backend:()=>svc,
  showConfirmModal:(...args)=>confirmations.push(args.at(-1)),
  showToast:(...args)=>toasts.push(args),
  showAlertPopup:(...args)=>alerts.push(args),
  showLoading:()=>events.push('loading'),hideLoading:()=>events.push('hide'),
  resetSaleSession:()=>events.push('reset'),closeOrderMobile:()=>events.push('close'),
  refreshFixedSheets:async()=>{events.push('refresh');if(refreshFails)throw Error('offline');},
  console:{warn:(...args)=>events.push('warning')}
 };
 vm.createContext(ctx);
 vm.runInContext('let orderMutationInFlight=false;\n'+snippet,ctx,{timeout:1000});
 return {...ctx,confirmations,writes,alerts,toasts,events,clear:ctx.requestClearSheet,remove:ctx.requestDeleteOrder};
}

test('double confirm of bulk draft deletion sends only one RPC',async()=>{
 const f=fixture({refreshFails:true});
 f.clear('dontam');
 const confirm=f.confirmations[0];
 const a=confirm(),b=confirm();
 assert.equal(f.writes.length,1);
 assert.equal(f.writes[0].name,'batch');
 assert.equal(f.writes[0].args[0],'delete_pending');
 f.writes[0].resolve({ok:true});
 await Promise.all([a,b]);
 assert.equal(f.alerts.length,0,'UI-only refresh failure cannot mark committed deletion failed');
 assert.equal(f.toasts.length,1);
 assert.deepEqual(f.events,['loading','reset','refresh','warning','hide']);
});

test('single delivered-order delete only reverses once, notifies success despite refresh outage',async()=>{
 const f=fixture({refreshFails:true});
 f.remove('dongiao','DG002');
 const confirm=f.confirmations[0];
 const a=confirm(),b=confirm();
 assert.equal(f.writes.length,1);
 assert.equal(f.writes[0].name,'reverse');
 assert.equal(f.writes[0].args[1],'Xóa đơn');
 f.writes[0].resolve({ok:true});
 await Promise.all([a,b]);
 assert.equal(f.alerts.length,0);
 assert.equal(f.toasts.length,1);
 assert(f.events.includes('warning'));
});

test('bulk delete and single delete share checkout mutation guard',async()=>{
 const f=fixture();
 f.clear('dontam');f.remove('dontam','DT001');
 const pendingBulk=f.confirmations[0]();
 const skippedSingle=f.confirmations[1]();
 assert.equal(f.writes.length,1);
 f.writes[0].resolve({ok:true});
 await Promise.all([pendingBulk,skippedSingle]);
 const nextSingle=f.confirmations[1]();
 assert.equal(f.writes.length,2);
 assert.equal(f.writes[1].name,'delete');
 f.writes[1].resolve({ok:true});
 await nextSingle;
 assert.equal(f.toasts.length,2);
});

test('backend deletion failure shows error and releases lock for retry',async()=>{
 const f=fixture();
 f.remove('dontam','DT001');
 const confirm=f.confirmations[0];
 const first=confirm();
 f.writes[0].reject(Error('DB unavailable'));
 await first;
 assert.equal(f.alerts.length,1);
 assert.equal(f.toasts.length,0);
 const retry=confirm();
 assert.equal(f.writes.length,2);
 f.writes[1].resolve({ok:true});
 await retry;
 assert.equal(f.toasts.length,1);
});
