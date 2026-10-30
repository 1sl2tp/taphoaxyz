import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const raw=readFileSync(new URL('../src/fixed-production-bridge.js',import.meta.url),'utf8');
const source=raw.replace(/^import .*?;\s*$/gm,'');

function deferred(){
 let release;
 const promise=new Promise(resolve=>{release=resolve;});
 return {promise,release};
}
async function tick(){for(let i=0;i<16;i++)await Promise.resolve();}

function fixture(){
 let state={user:null,editOrder:null,products:[],revisions:{},permissions:{}};
 const gates=new Map(),calls=[];
 const appState={
   get(){return state;},
   reset(){state={user:null,editOrder:null,products:[],revisions:{},permissions:{}};},
   setBootstrap(data){state={...data,editOrder:state.editOrder};},
   mergeDomains(data){state={...state,...data};},
   setEditOrder(order){state.editOrder=order;}
 };
 const client={
   async rpc(name,args){
     calls.push({name,args});
     const gate=gates.get(args.p_public_slug);
     if(gate)await gate.promise;
     return {data:{
       user:{id:args.p_public_slug,name:args.p_public_slug},
       products:[],orders:[],revisions:{},permissions:{}
     },error:null};
   },
   channel(){return {on(){return this;},subscribe(){return this;}};},
   async removeChannel(){}
 };
 const ctx={
   window:{addEventListener(){},dispatchEvent(){}},
   document:{hidden:false,addEventListener(){}},navigator:{onLine:true},
   createAuthService:()=>({getClient:async()=>client}),
   createApi:()=>({}),createAppState:()=>appState,
   changedDomains:()=>[],
   createSnapshotStore:()=>({load:()=>null,save(){},clear(){}}),
   CONFIG:{supabaseUrl:'https://example.invalid'},
   CustomEvent:class CustomEvent{constructor(type){this.type=type;}},
   console,URL,Date,String,Number,Boolean,Object,Array,Map,Set,Promise,JSON,Math,
   setTimeout:()=>1,clearTimeout(){}
 };
 vm.createContext(ctx);
 vm.runInContext(source,ctx,{timeout:2500});
 function hold(slug){
   const gate=deferred();gates.set(slug,gate);
   return {release(){gates.delete(slug);gate.release();}};
 }
 return {runtime:ctx.window.TAPHOA_PRODUCTION,appState,hold,calls};
}

test('opening customer B clears customer A UI and any draft before link verification',async()=>{
 const f=fixture();
 await f.runtime.openPublicLink('a','1111');
 f.appState.setEditOrder({order_id:'A-DRAFT'});
 assert.equal(f.runtime.getState().user.id,'a');
 const b=f.hold('b'),pending=f.runtime.openPublicLink('b','2222');
 await tick();
 assert.equal(f.runtime.getIdentity(),null);
 assert.equal(f.runtime.getState().user,null);
 assert.equal(f.runtime.getState().editOrder,null);
 b.release();
 await pending;
 assert.equal(f.runtime.getIdentity().uid,'b');
 assert.equal(f.runtime.getState().user.id,'b');
 assert.equal(f.runtime.getState().editOrder,null);
 assert.deepEqual(f.calls.map(c=>c.args.p_public_slug),['a','b']);
 assert.deepEqual(f.calls.map(c=>c.args.p_pin),['1111','2222']);
});

test('old public-link response cannot revive A after customer B opens',async()=>{
 const f=fixture();
 const a=f.hold('a'),old=f.runtime.openPublicLink('a','1111');
 await tick();
 await f.runtime.openPublicLink('b','2222');
 a.release();
 await assert.rejects(old,/public_access_changed/);
 assert.equal(f.runtime.getIdentity().uid,'b');
 assert.equal(f.runtime.getState().user.id,'b');
});

test('reopening same public link clears stale edit order but still loads customer',async()=>{
 const f=fixture();
 await f.runtime.openPublicLink('same','1234');
 f.appState.setEditOrder({order_id:'STALE'});
 const result=await f.runtime.openPublicLink('same','1234');
 assert.equal(result.identity.uid,'same');
 assert.equal(f.runtime.getState().editOrder,null);
});