import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

// SPEC-DRAFT-DELETE-FRESH-20261104
// A PWA may display cached pending orders when production has none.
// A confirmed delete must resolve the exact backend UUID and fresh pending
// status, and must never send a second or wrong mutation for stale data.
const raw=readFileSync(new URL('../src/fixed-production-overrides.js',import.meta.url),'utf8');
const start=raw.indexOf('  requestClearSheet=function(sheetName){');
const end=raw.indexOf('\n  // DEBT-223:',start);
assert.ok(start>=0&&end>start,'draft deletion owner must exist');
const snippet=raw.slice(start,end);
const idA='11111111-1111-4111-8111-111111111111';
const idB='22222222-2222-4222-8222-222222222222';
const order=(id,code,status='pending')=>({
 id,order_id:id,backendOrderId:id,
 displayCode:code,status
});
function deferred(){
 let resolve;
 const promise=new Promise(r=>{resolve=r});
 return {promise,resolve};
}
function fixture({stateOrders=[],backendThrows='',readGate=null,listed=['DT101'],activeEdit=''}={}){
 const events=[],requests=[],dialogs=[],alerts=[],toasts=[],reads=[];
 let orders=[...stateOrders],identity={uid:'A'};
 const svc={
  getIdentity:()=>identity,
  getAccessMode:()=> 'account',
  getState:()=>({orders}),
  backendOrderId:o=>o.backendOrderId,
  orderDisplayCode:o=>o.displayCode,
  async refresh(domains){
   reads.push([...domains]);if(readGate)await readGate.promise;
   return {orders};
  },
  async deletePending(id){
   requests.push({action:'delete',id});
   if(backendThrows){
    const message=backendThrows;orders=[];
    throw Error(message);
   }
   orders=orders.filter(o=>o.id!==id);
   return {ok:true,deleted:id};
  },
  async reverseOrder(id){requests.push({action:'reverse',id});return {ok:true}},
  async batchOrders(action,ids){
   requests.push({action,ids});
   if(backendThrows)throw Error(backendThrows);
   const pending=new Set(orders.filter(o=>o.status==='pending').map(o=>o.id));
   const deleted=ids.filter(id=>pending.has(id)).length;
   orders=orders.filter(o=>!ids.includes(o.id)||o.status!=='pending');
   return {ok:true,deleted};
  }
 };
 const ctx={
  requestClearSheet:null,requestDeleteOrder:null,
  currentAuthRole:'admin',editingOrderId:activeEdit,
  appData:{dontam:[['id'],...listed.map(code=>[code])],dongiao:[['id']]},
  hasPermission:()=>true,denyPermission:msg=>{throw Error(msg)},
  uniqueOrderIds:rows=>[...new Set((rows||[]).slice(1).map(r=>String(r[7]||r[0]||'')))],
  backendOrderIdFor:(sheet,id)=>id==='DT102'?idB:idA,
  backend:()=>svc,
  showConfirmModal:(title,desc,action,color,confirm)=>dialogs.push(confirm),
  showToast:(...args)=>toasts.push(args),
  showAlertPopup:(...args)=>alerts.push(args),
  showLoading:()=>events.push('loading'),hideLoading:()=>events.push('hide'),
  closeOrderMobile:()=>events.push('close'),
  resetSaleSession:()=>events.push('reset'),
  refreshFixedSheets:async names=>{events.push('refresh:'+names.join(','))},
  console:{warn:(...msg)=>events.push('warn:'+msg[0])}
 };
 vm.createContext(ctx);
 vm.runInContext('let orderMutationInFlight=false;\n'+snippet,ctx);
 return {ctx,svc,events,requests,dialogs,alerts,toasts,reads,
  confirm:()=>dialogs[0](),setOrders:o=>{orders=o},switchIdentity:()=>{identity={uid:'B'}}};
}
test('stale pending row shown in PWA triggers one orders read but zero DELETE RPCs',async()=>{
 const f=fixture({stateOrders:[]});
 f.ctx.requestDeleteOrder('dontam','DT101');
 await f.confirm();
 assert.deepEqual(f.reads,[['orders']]);
 assert.equal(f.requests.length,0);
 assert.equal(f.alerts.length,0);
 assert.equal(f.toasts.length,1);
 assert.match(f.toasts[0][0],/không còn trên máy chủ/);
 assert.equal(f.toasts[0][1],'warning');
 assert.equal(f.events.includes('reset'),false);
 assert(f.events.includes('refresh:dontam,dongiao'));
});
test('an existing pending draft is deleted by verified backend UUID exactly once',async()=>{
 const f=fixture({stateOrders:[order(idA,'DT101')]});
 f.ctx.requestDeleteOrder('dontam','DT101');
 const [a,b]=await Promise.all([f.confirm(),f.confirm()]);
 assert.equal(f.requests.length,1);
 assert.deepEqual(f.requests[0],{action:'delete',id:idA});
 assert.equal(f.toasts.length,1);
 assert.equal(f.toasts[0][1],'success');
 assert.equal(f.events.includes('reset'),false,
  'deleting unrelated draft must not clear a customer cart');
 assert.equal(f.alerts.length,0);
});
test('deleting currently edited draft resets only that exact editing session',async()=>{
 const f=fixture({stateOrders:[order(idA,'DT101')],activeEdit:'DT101'});
 f.ctx.requestDeleteOrder('dontam','DT101');await f.confirm();
 assert.equal(f.events.filter(x=>x==='reset').length,1);
});
test('stale list must never reverse a delivered order through pending delete',async()=>{
 const f=fixture({stateOrders:[order(idA,'DT101','done')]});
 f.ctx.requestDeleteOrder('dontam','DT101');await f.confirm();
 assert.equal(f.requests.length,0);
 assert.equal(f.toasts[0][1],'warning');
});
test('server race order_not_found refreshes once and avoids repeat delete',async()=>{
 const f=fixture({stateOrders:[order(idA,'DT101')],backendThrows:'order_not_found'});
 f.ctx.requestDeleteOrder('dontam','DT101');await f.confirm();
 assert.equal(f.requests.length,1);
 assert.equal(f.alerts.length,0);
 assert.equal(f.toasts[0][1],'warning');
 assert.equal(f.reads.length,2,'one preflight and one recovery read');
});
test('server permission error is surfaced and cannot be disguised as a stale list',async()=>{
 const f=fixture({stateOrders:[order(idA,'DT101')],backendThrows:'taphoa_access_denied'});
 f.ctx.requestDeleteOrder('dontam','DT101');await f.confirm();
 assert.equal(f.requests.length,1);
 assert.equal(f.toasts.length,0);
 assert.equal(f.alerts.length,1);
});
test('switching signed-in account during preflight prevents an obsolete deletion',async()=>{
 const gate=deferred();
 const f=fixture({stateOrders:[order(idA,'DT101')],readGate:gate});
 f.ctx.requestDeleteOrder('dontam','DT101');
 const inflight=f.confirm();f.switchIdentity();gate.resolve();await inflight;
 assert.equal(f.requests.length,0);
 assert.equal(f.alerts.length,0);
 assert.equal(f.toasts.length,0);
});
test('bulk delete a stale cached list never sends a destructive batch',async()=>{
 const f=fixture({stateOrders:[],listed:['DT101','DT102']});
 f.ctx.requestClearSheet('dontam');await f.confirm();
 assert.deepEqual(f.reads,[['orders']]);
 assert.equal(f.requests.length,0);
 assert.equal(f.toasts[0][1],'warning');
 assert.equal(f.events.includes('reset'),false);
});
test('bulk delete only targets the still-pending orders found on server',async()=>{
 const f=fixture({stateOrders:[order(idA,'DT101')],listed:['DT101','DT102']});
 f.ctx.requestClearSheet('dontam');await f.confirm();
 assert.equal(f.requests.length,1);
 assert.deepEqual(Array.from(f.requests[0].ids),[idA]);
 assert.equal(f.toasts[0][1],'success');
 assert.match(f.toasts[0][0],/Đã xóa 1 đơn tạm/);
 assert.equal(f.alerts.length,0);
});
