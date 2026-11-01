import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../ncc/index.html',import.meta.url),'utf8');
const begin=html.indexOf('// SPEC-NCC-SUPPLIER-LOGIN-ATOMIC-20261101:');
const end=html.indexOf("\n\n$('costTab').addEventListener",begin);
assert.ok(begin>=0&&end>begin);
function fixture(loginResponse,loadResult){
 let release;const pending=new Promise(resolve=>release=resolve);
 const nodes={loginForm:{addEventListener(_,fn){this.submit=fn}},loginBtn:{disabled:false},
  source:{value:'sua'}};
 const state={nodes,calls:0,clears:0,errors:[],loads:0};
 const ctx=vm.createContext({state,pending,Promise});
 vm.runInContext(`
   let supplierLoginPending=false,supplierSessionGeneration=0,session=null;
   const $=id=>state.nodes[id]||{value:''};
   const setMsg=(id,msg)=>{if(id==='loginMsg')state.errors.push(msg)};
   const getPin=()=> '123456';
   const rpc=async()=>{state.calls++;return pending};
   const clearPin=()=>{};
   const saveSession=data=>{session=data;supplierSessionGeneration++};
   const clearSupplierSession=()=>{session=null;supplierSessionGeneration++;state.clears++};
   const loadCatalog=async()=>{state.loads++;if(${loadResult===false})throw Error('Catalog unavailable')};
   const showLogin=()=>{};
   ${html.slice(begin,end)}
   globalThis.api={submit:()=>state.nodes.loginForm.submit({preventDefault(){}}),session:()=>session};
 `,ctx);
 return {state,api:ctx.api,release};
}
test('duplicate submits while a PIN request is unresolved dispatch only one login RPC',async()=>{
 const f=fixture();
 const first=f.api.submit(),second=f.api.submit();
 assert.equal(f.state.calls,1);
 f.release({ok:true,token:'T1'});
 await Promise.all([first,second]);
 assert.equal(f.state.loads,1);
 assert.equal(f.state.nodes.loginBtn.disabled,false);
});
test('failed initial catalog clears the newly stored PIN session',async()=>{
 const f=fixture(undefined,false);
 const task=f.api.submit();
 f.release({ok:true,token:'T1'});
 await task;
 assert.equal(f.api.session(),null);
 assert.equal(f.state.clears,1);
 assert.match(f.state.errors.at(-1),/Catalog unavailable/);
});
test('invalid PIN does not store a session',async()=>{
 const f=fixture();
 const job=f.api.submit();
 f.release({ok:false,error:'pin_format'});
 await job;
 assert.equal(f.api.session(),null);
 assert.match(f.state.errors.at(-1),/đúng 6 số/);
});
