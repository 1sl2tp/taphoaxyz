import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../src/fixed-production-bridge.js',import.meta.url),'utf8')
 .replace(/^import .*?;\s*$/gm,'');
function deferred(){
 let release;
 const promise=new Promise(resolve=>{release=resolve});
 return {promise,release};
}
function fixture(){
 const gate=deferred(),events=[];
 let state={revisions:{},permissions:{}};
 const business={
  async bootstrap(){return {user:{id:'B',role:'admin'},revisions:{},permissions:{}};},
  async domains(domains){events.push('refresh:'+domains.join(','));return {revisions:{}};},
  async saveOrder(){events.push('save');return gate.promise;},
  async deliverOrder(){events.push('deliver');return gate.promise;},
  async debtTransaction(){events.push('debt');return gate.promise;},
  async createCustomer(){events.push('create');return gate.promise;},
  async setProductMedia(){events.push('media');return gate.promise;}
 };
 const auth={
  async login(user){return {identity:{uid:user,role:'admin'}}},
  async getClient(){return {channel(){return {on(){return this},subscribe(){return this}}},async removeChannel(){}}},
  async logout(){}
 };
 const appState={
  get:()=>state,reset(){state={revisions:{},permissions:{}};},
  setBootstrap(data){state={...data}},mergeDomains(data){state={...state,...data}}
 };
 const context={
  window:{addEventListener(){},dispatchEvent(){}},
  document:{hidden:false,addEventListener(){}},
  navigator:{onLine:true},console,
  createAuthService:()=>auth,createApi:()=>business,createAppState:()=>appState,
  changedDomains:()=>[],createSnapshotStore:()=>({load:()=>null,save(){},clear(){}}),
  CONFIG:{supabaseUrl:'https://invalid.example'},
  setTimeout(){return 1;},clearTimeout(){},
  CustomEvent:class CustomEvent{constructor(){}},
  String,Number,Boolean,Object,Array,Map,Set,Date,JSON,Math,Promise,URL
 };
 vm.createContext(context);vm.runInContext(source,context,{timeout:1500});
 return {runtime:context.window.TAPHOA_PRODUCTION,events,gate};
}
for(const [name,params,call] of [
 ['saveOrder',[{status:'pending'}],'save'],
 ['deliverOrder',['order-1'],'deliver'],
 ['debtTransaction',['customer-1','thu_tien',1500],'debt'],
 ['createCustomer',['Khách A'],'create'],
 ['setProductMedia',['SP1','media1'],'media']
]){
 test('late '+name+' commit does not refresh state or attach media in a new login',async()=>{
  const f=fixture();await f.runtime.login('A','pw');
  const pending=f.runtime[name](...params);
  assert(f.events.includes(call));
  await f.runtime.login('B','pw');
  const start=f.events.length;
  f.gate.release({ok:true,order:{status:'pending',id:'old',customer_id:'old'}});
  const result=await pending;
  assert.equal(result.ok,true,'server confirmation remains successful for the original request');
  assert.deepEqual(f.events.slice(start),[],'obsolete continuation must not use account B');
 });
}
test('every order/customer/finance/media mutation guards post-commit continuation',()=>{
 for(const op of ['manualShareOrder','saveOrder','deliverOrder','reverseOrder',
  'deletePending','batchOrders','debtTransaction','createCustomer','setProductMedia',
  'setProductMediaCompare','setProductMediaOwnQc','clearProductMedia']){
  const start=source.indexOf('async function '+op+'(');
  const end=source.indexOf('\nasync function ',start+1);
  const segment=source.slice(start,end<0?undefined:end);
  assert.match(segment,/const mutationOwner=captureProductionOwner\(\)/,op);
  assert.match(segment,/productionOwnerCurrent\(mutationOwner\)/,op);
 }
});
