import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const raw=readFileSync(new URL('../src/fixed-production-bridge.js',import.meta.url),'utf8');
const source=raw.replace(/^import .*?;\s*$/gm,'');
function gate(){let release;const promise=new Promise(resolve=>{release=resolve;});return {promise,release};}
async function tick(){for(let i=0;i<24;i++)await Promise.resolve();}

function fixture({online=true}={}){
 let state={user:null,editOrder:null,orders:[],permissions:{},revisions:{}};
 let runtime,restoreIdentity=null;
 const cached=new Map(),pendingLogins=new Map(),pendingBootstraps=new Map(),bootstrapCalls=[];
 const appState={
   get:()=>state,
   reset(){state={user:null,editOrder:null,orders:[],permissions:{},revisions:{}};},
   setEditOrder(order){state={...state,editOrder:order};},
   setBootstrap(data){state={...data,editOrder:state.editOrder};},
   mergeDomains(data){state={...state,...data};}
 };
 const snapshot={
   load:uid=>cached.get(uid)||null,
   save(){return true;},clear(){}
 };
 const auth={
   async login(username){
     const pending=pendingLogins.get(username);
     if(pending)await pending.promise;
     return {identity:{uid:username,role:username==='owner'?'admin':'customer'}};
   },
   async restore(){return restoreIdentity?{identity:restoreIdentity}:null;},
   async getClient(){return {
     channel:()=>({on(){return this;},subscribe(){return this;}}),
     removeChannel:async()=>{}
   };},
   async logout(){}
 };
 const business={
   async bootstrap(){
     const uid=runtime.getIdentity()?.uid||'none';
     bootstrapCalls.push(uid);
     const pending=pendingBootstraps.get(uid);
     if(pending)await pending.promise;
     return {user:{id:uid,role:runtime.getIdentity()?.role},orders:[{customer:uid}],permissions:{},revisions:{}};
   },
   async meta(){return {revisions:{},permissions:{}};},
   async domains(){return {};}
 };
 const win={addEventListener(){},dispatchEvent(){}};
 const net={onLine:online};
 const ctx={
   window:win,document:{hidden:false,addEventListener(){}},
   navigator:net,console,URL,Date,Number,String,Boolean,Object,Array,
   Map,Set,Promise,JSON,Math,createAuthService:()=>auth,createApi:()=>business,
   createAppState:()=>appState,changedDomains:()=>[],
   createSnapshotStore:()=>snapshot,
   CONFIG:{supabaseUrl:'https://example.invalid'},
   CustomEvent:class CustomEvent{constructor(type){this.type=type;}},
   setTimeout:()=>1,clearTimeout(){}
 };
 vm.createContext(ctx);vm.runInContext(source,ctx,{timeout:2500});
 runtime=win.TAPHOA_PRODUCTION;
 return {
   runtime,appState,net,cached,bootstrapCalls,
   holdLogin:username=>{const g=gate();pendingLogins.set(username,g);return g;},
   holdBootstrap:uid=>{const g=gate();pendingBootstraps.set(uid,g);return g;},
   setRestore:identity=>{restoreIdentity=identity;}
 };
}

test('account A edit, orders and identity disappear while logging into account B',async()=>{
 const f=fixture();
 await f.runtime.login('owner','pw');
 f.appState.setEditOrder({order_id:'ORDER-A'});
 assert.equal(f.runtime.getState().user.id,'owner');
 const blocked=f.holdLogin('buyer');
 const next=f.runtime.login('buyer','pw');
 await tick();
 assert.equal(f.runtime.getIdentity(),null);
 assert.equal(f.runtime.getState().user,null);
 assert.equal(f.runtime.getState().editOrder,null);
 assert.deepEqual(f.runtime.getState().orders,[]);
 blocked.release();
 const result=await next;
 assert.equal(result.identity.uid,'buyer');
 assert.equal(result.state.user.id,'buyer');
 assert.equal(result.state.editOrder,null);
 assert.equal(result.state.orders[0].customer,'buyer');
});

test('verified role downgrade never displays an old admin snapshot during bootstrap',async()=>{
 const f=fixture();
 f.cached.set('buyer',{data:{
   user:{id:'buyer',role:'admin'},orders:[{customer:'owner',private:true}],
   permissions:{canMutateDebt:true},revisions:{}
 }});
 const blocked=f.holdBootstrap('buyer');
 const next=f.runtime.login('buyer','pw');
 await tick();
 assert.deepEqual(f.bootstrapCalls,['buyer']);
 assert.equal(f.runtime.getState().user,null);
 assert.deepEqual(f.runtime.getState().orders,[]);
 assert.equal(f.runtime.getState().permissions.canMutateDebt,undefined);
 blocked.release();
 const result=await next;
 assert.equal(result.identity.role,'customer');
 assert.equal(result.state.user.role,'customer');
 assert.deepEqual(result.state.orders,[{customer:'buyer'}]);
});

test('role mismatch cannot make an old admin snapshot available while offline',async()=>{
 const f=fixture({online:false});
 f.cached.set('buyer',{data:{
   user:{id:'buyer',role:'admin'},orders:[{private:true}],
   permissions:{canMutateDebt:true},revisions:{}
 }});
 await assert.rejects(f.runtime.login('buyer','pw'),/Chưa có dữ liệu đã lưu/);
 assert.equal(f.runtime.getState().user,null);
 assert.deepEqual(f.runtime.getState().orders,[]);
 assert.deepEqual(f.bootstrapCalls,[]);
});

test('verified same-role snapshot remains a fast login without refetch or old edit draft',async()=>{
 const f=fixture();
 f.cached.set('owner',{data:{
   user:{id:'owner',role:'admin'},orders:[{customer:'owner'}],permissions:{},revisions:{}
 }});
 f.appState.setEditOrder({order_id:'STALE-ORDER'});
 const result=await f.runtime.login('owner','pw');
 assert.equal(result.identity.uid,'owner');
 assert.equal(result.state.user.role,'admin');
 assert.equal(result.state.editOrder,null);
 assert.deepEqual(f.bootstrapCalls,[]);
});

test('restore of a new verified account also drops prior unsaved order edit',async()=>{
 const f=fixture();
 f.appState.setEditOrder({order_id:'OLD-EDIT'});
 f.setRestore({uid:'buyer',role:'customer'});
 const result=await f.runtime.restore();
 assert.equal(result.identity.uid,'buyer');
 assert.equal(result.state.editOrder,null);
 assert.equal(result.state.user.id,'buyer');
});
