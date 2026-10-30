import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const raw=readFileSync(new URL('../src/fixed-production-bridge.js',import.meta.url),'utf8');
const source=raw.replace(/^import .*?;\s*$/gm,'');
function fixture(){
 let state={user:null,permissions:{},orders:[],revisions:{orders:0}};
 let meta={permissions:{canManageOrders:true,canManageDebt:true,canViewCost:true},revisions:{orders:1}};
 const snapshots=[],events=[];
 const appState={
   get:()=>state,
   reset(){state={user:null,permissions:{},orders:[],revisions:{orders:0}};},
   setBootstrap(data){state={...data};},
   mergeDomains(data){state={...state,...data};}
 };
 const client={channel(){return {on(){return this;},subscribe(){return this;}};},removeChannel(){}};
 const auth={
   async getClient(){return client;},
   async login(){return {identity:{uid:'owner',role:'admin'}};}
 };
 const business={
   async bootstrap(){return {
     user:{id:'owner',role:'admin'},
     permissions:{canManageOrders:true,canManageDebt:true,canViewCost:true},
     orders:[{id:'old'}],revisions:{orders:1}
   };},
   async meta(){return meta;},
   async domains(){return {orders:[{id:'new'}],revisions:{orders:2}};}
 };
 const win={addEventListener(){},dispatchEvent(e){events.push(e);}};
 const ctx={
   window:win,document:{hidden:false,addEventListener(){}},navigator:{onLine:true},
   console,URL,Date,Number,String,Boolean,Object,Array,Set,Map,Promise,JSON,Math,
   createAuthService:()=>auth,createApi:()=>business,createAppState:()=>appState,
   changedDomains:(before,after)=>
     Number(before?.orders||0)!==Number(after?.orders||0)?['orders']:[],
   createSnapshotStore:()=>({
     load(){return null;},
     save(uid,data){snapshots.push({uid,permissions:{...data.permissions},orders:data.orders});},
     clear(){}
   }),
   CONFIG:{supabaseUrl:'https://example.invalid'},
   CustomEvent:class CustomEvent{constructor(type,{detail}={}){this.type=type;this.detail=detail;}},
   setTimeout:()=>1,clearTimeout(){}
 };
 vm.createContext(ctx);vm.runInContext(source,ctx,{timeout:2000});
 return {
   runtime:win.TAPHOA_PRODUCTION,events,snapshots,
   setMeta(next){meta=next;}
 };
}
const denied={canManageOrders:false,canManageDebt:false,canViewCost:false};

test('domain refresh cannot hide a simultaneous permissions downgrade from metadata',async()=>{
 const f=fixture();
 await f.runtime.login('owner','pw');
 f.setMeta({permissions:denied,revisions:{orders:2}});
 await f.runtime.syncOnce();
 assert.deepEqual(f.runtime.getState().orders,[{id:'new'}]);
 assert.deepEqual({...f.runtime.getState().permissions},denied);
 assert.deepEqual(f.snapshots.at(-1).permissions,denied);
 assert.equal(f.events.at(-1).detail.permissionsChanged,true);
 assert.deepEqual(Array.from(f.events.at(-1).detail.changed),['orders']);
});

test('permissions-only downgrade is stored for a later cached reload',async()=>{
 const f=fixture();
 await f.runtime.login('owner','pw');
 const before=f.snapshots.length;
 f.setMeta({permissions:denied,revisions:{orders:1}});
 await f.runtime.syncOnce();
 assert.equal(f.snapshots.length,before+1);
 assert.deepEqual({...f.runtime.getState().permissions},denied);
 assert.deepEqual(f.snapshots.at(-1).permissions,denied);
 assert.equal(f.events.at(-1).detail.permissionsChanged,true);
 assert.deepEqual(Array.from(f.events.at(-1).detail.changed),[]);
});

test('unchanged permissions and revisions do not introduce extra storage writes',async()=>{
 const f=fixture();
 await f.runtime.login('owner','pw');
 const before=f.snapshots.length;
 await f.runtime.syncOnce();
 assert.equal(f.snapshots.length,before);
 assert.equal(f.events.length,0);
});
