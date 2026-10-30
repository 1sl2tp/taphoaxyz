import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../src/fixed-production-bridge.js',import.meta.url),'utf8');
function section(begin,end){
 const a=source.indexOf(begin),b=source.indexOf(end,a);
 assert(a>=0&&b>a,'owner source segment missing '+begin);
 return source.slice(a,b);
}
const owner=section('function currentUid(){','function saveSnapshot(){');
const rpc=section('async function publicRpc(name,args={}){','function sourceDisplayName(');
const pins=section('async function publicPinState(){','async function employeeSnapshot(){');
function hold(){let release;const promise=new Promise(r=>release=r);return{promise,release};}
function fixture(){
 const calls=[];let clientGate=null,rpcGate=null;
 const client={
  async rpc(name,args){
   calls.push({name,args});
   if(rpcGate)await rpcGate.promise;
   return{data:name==='taphoa_public_pin_manage_access'?{ok:true}:{ok:true,state:'active'},error:null};
  }
 };
 const auth={async getClient(){if(clientGate)await clientGate.promise;return client;}};
 const ctx={auth,console,Promise,String,Number,Object};
 vm.createContext(ctx);
 vm.runInContext(`
  let identity=null,publicAccess={slug:'customer-a',pin:'1111'},employeeAccess=null,sessionGeneration=1;
  const text=v=>String(v??'');
  ${owner}
  ${rpc}
  ${pins}
  globalThis.testOwner={
   rpc:publicRpc,pinState:publicPinState,setPin:setPublicPin,
   switchAccess(slug,pin){sessionGeneration+=1;publicAccess={slug,pin};},
   access(){return publicAccess;},
   clear(){sessionGeneration+=1;publicAccess=null;}
  };
 `,ctx);
 return{
  api:ctx.testOwner,calls,
  waitForClient(){const g=clientGate=hold();return g;},
  waitForRpc(){const g=rpcGate=hold();return g;}
 };
}
test('public RPC pins slug/PIN despite caller-supplied override',async()=>{
 const f=fixture();
 await f.api.rpc('taphoa_public_bootstrap_access',{
  p_public_slug:'some-other-customer',p_pin:'bad-pin',p_domains:['orders']
 });
 assert.equal(f.calls.length,1);
 assert.equal(f.calls[0].args.p_public_slug,'customer-a');
 assert.equal(f.calls[0].args.p_pin,'1111');
 assert.equal(Array.from(f.calls[0].args.p_domains)[0],'orders');
});
test('obsolete A request waiting on getClient never calls RPC as customer B',async()=>{
 const f=fixture(),gate=f.waitForClient();
 const old=f.api.rpc('taphoa_public_bootstrap_access');
 f.api.switchAccess('customer-b','2222');
 gate.release();
 await assert.rejects(old,/public_access_changed/);
 assert.equal(f.calls.length,0);
});
test('in-flight A public RPC result rejected after customer B switch',async()=>{
 const f=fixture(),g=f.waitForRpc(),old=f.api.rpc('taphoa_public_debt_ledger_access');
 await Promise.resolve();await Promise.resolve();
 assert.equal(f.calls.length,1);
 assert.equal(f.calls[0].args.p_public_slug,'customer-a');
 f.api.switchAccess('customer-b','2222');g.release();
 await assert.rejects(old,/public_access_changed/);
 assert.equal(f.api.access().slug,'customer-b');
});
test('public PIN state cannot look up new customer after old getClient await',async()=>{
 const f=fixture(),g=f.waitForClient(),old=f.api.pinState();
 f.api.switchAccess('customer-b','2222');g.release();
 await assert.rejects(old,/public_access_changed/);
 assert.equal(f.calls.length,0);
});
test('public PIN state uses captured slug and rejects old post-RPC result',async()=>{
 const f=fixture(),g=f.waitForRpc(),old=f.api.pinState();
 await Promise.resolve();await Promise.resolve();
 assert.equal(f.calls[0].args.p_public_slug,'customer-a');
 f.api.switchAccess('customer-b','2222');g.release();
 await assert.rejects(old,/public_access_changed/);
});
test('old A PIN success never writes its PIN into B local context',async()=>{
 const f=fixture(),g=f.waitForRpc(),old=f.api.setPin('9999');
 await Promise.resolve();await Promise.resolve();
 assert.equal(f.calls.length,1);
 assert.equal(f.calls[0].name,'taphoa_public_pin_manage_access');
 assert.equal(f.calls[0].args.p_new_pin,'9999');
 f.api.switchAccess('customer-b','2222');g.release();
 await assert.rejects(old,/public_access_changed/);
 assert.equal(f.api.access().pin,'2222');
});
test('current PIN save still makes one RPC and updates active local state',async()=>{
 const f=fixture();
 const result=await f.api.setPin(' 4321 ');
 assert.equal(result.ok,true);
 assert.equal(f.calls.length,1);
 assert.equal(f.calls[0].args.p_public_slug,'customer-a');
 assert.equal(f.calls[0].args.p_pin,'1111');
 assert.equal(f.calls[0].args.p_new_pin,'4321');
 assert.equal(f.api.access().pin,'4321');
});
