import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

// SPEC-MUTATION-COMMIT-VS-REFRESH-20261030
// Given the server has committed a mutation, when the subsequent domain read
// fails, then the mutation retains its true success and a revision reconciliation
// is queued. A failed server mutation must still reject. No new writes or polling.
const source=readFileSync(new URL('../src/fixed-production-bridge.js',import.meta.url),'utf8')
 .replace(/^import .*?;\s*$/gm,'');
function fixture({readFails=true,writeFails=false}={}){
 let state={user:null,revisions:{},permissions:{},orders:[],debtSummary:[]};
 const calls=[],wake=[],warnings=[];
 const appState={
  get:()=>state,
  reset(){state={user:null,revisions:{},permissions:{},orders:[],debtSummary:[]};},
  setBootstrap(data){state={...data};},
  mergeDomains(data){state={...state,...data};}
 };
 const success={ok:true};
 const business={
  async bootstrap(){return {user:{id:'owner',role:'admin'},permissions:{},revisions:{},orders:[],debtSummary:[]};},
  async domains(domains){calls.push({method:'read',domains});if(readFails)throw Error('read outage');return {revisions:{}};},
  async saveOrder(){calls.push({method:'save'});if(writeFails)throw Error('save rejected');return {ok:true,order:{status:'pending'}};},
  async deliverOrder(){calls.push({method:'deliver'});if(writeFails)throw Error('delivery rejected');return {ok:true,order:{status:'delivered'}};},
  async reverseOrder(){calls.push({method:'reverse'});if(writeFails)throw Error('reverse rejected');return success;},
  async deletePending(){calls.push({method:'delete'});if(writeFails)throw Error('delete rejected');return success;},
  async batchOrders(){calls.push({method:'batch'});if(writeFails)throw Error('batch rejected');return success;},
  async debtTransaction(){calls.push({method:'debt'});if(writeFails)throw Error('debt rejected');return {ok:true,notice_sent:false};}
 };
 const client={
  channel(){return {on(){return this;},subscribe(){return this;}};},
  async removeChannel(){}
 };
 const auth={async login(){return {identity:{uid:'owner',role:'admin'}};},async getClient(){return client;}};
 const win={addEventListener(){},dispatchEvent(){}};
 const ctx={
  window:win,document:{hidden:false,addEventListener(){}},navigator:{onLine:true},
  console:{warn:(...args)=>warnings.push(args),error(){}},
  String,Number,Boolean,Object,Array,Map,Set,Date,JSON,Math,Promise,URL,
  createAuthService:()=>auth,createApi:()=>business,createAppState:()=>appState,
  changedDomains:()=>[],createSnapshotStore:()=>({load:()=>null,save(){},clear(){}}),
  CONFIG:{supabaseUrl:'https://example.invalid'},
  CustomEvent:class CustomEvent{constructor(type){this.type=type;}},
  setTimeout:(fn,ms)=>{wake.push({fn,ms});return wake.length;},
  clearTimeout(){}
 };
 vm.createContext(ctx);vm.runInContext(source,ctx,{timeout:2000});
 return {runtime:win.TAPHOA_PRODUCTION,calls,wake,warnings};
}
const cases=[
 ['saveOrder',x=>x.saveOrder({}), 'save'],
 ['deliverOrder',x=>x.deliverOrder('order-1'), 'deliver'],
 ['reverseOrder',x=>x.reverseOrder('order-1'), 'reverse'],
 ['deletePending',x=>x.deletePending('order-1'), 'delete'],
 ['batchOrders',x=>x.batchOrders('deliver',['order-1']), 'batch'],
 ['debtTransaction',x=>x.debtTransaction('customer-1','thu_tien',125), 'debt']
];
for(const [label,invoke,method] of cases){
 test(label+' returns committed success if canonical follow-up read is offline',async()=>{
  const f=fixture();
  await f.runtime.login('owner','pw');
  const result=await invoke(f.runtime);
  assert.equal(result.ok,true);
  assert.deepEqual(f.calls.filter(c=>c.method!=='read').map(c=>c.method),[method]);
  assert.equal(f.calls.filter(c=>c.method==='read').length,1);
  assert.equal(f.wake.length,1,'a single existing revision wake is scheduled');
  assert.equal(f.wake[0].ms,180);
  assert.equal(f.warnings.length,1);
 });
}
test('failed financial write stays a failure, never masked as successful commit',async()=>{
 const f=fixture({writeFails:true});
 await f.runtime.login('owner','pw');
 await assert.rejects(f.runtime.debtTransaction('customer-1','thu_tien',125),/debt rejected/);
 assert.equal(f.calls.filter(c=>c.method==='read').length,0);
 assert.equal(f.wake.length,0);
 assert.equal(f.warnings.length,0);
});
test('successful canonical refresh does not schedule any extra network reconciliation',async()=>{
 const f=fixture({readFails:false});
 await f.runtime.login('owner','pw');
 const result=await f.runtime.saveOrder({});
 assert.equal(result.ok,true);
 assert.equal(f.wake.length,0);
 assert.equal(f.warnings.length,0);
});
