import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const page=readFileSync(new URL('../admin-gia.html',import.meta.url),'utf8');
const a=page.indexOf('    // SPEC-ADMIN-AUTH-DENIAL-CLEANUP-20261101:');
const b=page.indexOf('\n\n    function switchAdminView(view){',a);
assert.ok(a>=0&&b>a);
function fixture(){
 const state={events:[],error:'',reset:false};
 const ctx=vm.createContext({state,console,Promise});
 vm.runInContext(`
  let identity={uid:'old',role:'admin'},client={previous:'secret'};
  const customerCare={reset:()=>state.events.push('careReset')};
  const resetAdminSessionDisplays=()=>{state.events.push('clearAdmin');state.reset=true};
  const showLogin=msg=>{state.events.push('login');state.error=msg};
  const showApp=()=>state.events.push('showApp');
  const auth={logout:async()=>state.events.push('signedOut'),getClient:async()=>({})};
  const loadPage=async()=>state.events.push('fetchCatalog');
  const loadSupplierFeedback=async()=>{};
  const loadMarketStatus=async()=>{};
  ${page.slice(a,b)}
  globalThis.api={enter,session:()=>({identity,client})};
 `,ctx);
 return {state,api:ctx.api};
}
test('inactive administrator cannot retain a prior admin session or catalog',async()=>{
 const f=fixture();
 await f.api.enter({identity:{uid:'disabled',role:'admin',active:false}});
 assert.equal(f.api.session().identity,null);
 assert.equal(f.api.session().client,null);
 assert.equal(f.state.reset,true);
 assert.equal(f.state.events.includes('showApp'),false);
 assert.equal(f.state.events.includes('fetchCatalog'),false);
 assert.equal(f.state.events.includes('signedOut'),true);
 assert.match(f.state.error,/không có quyền/);
});
test('ordinary user is signed out and shown authorization explanation',async()=>{
 const f=fixture();
 await f.api.enter({identity:{uid:'customer',role:'user',active:true}});
 assert.equal(f.api.session().identity,null);
 assert.equal(f.state.events.includes('fetchCatalog'),false);
 assert.equal(f.state.events.includes('signedOut'),true);
 assert.match(f.state.error,/chỉ dành cho quản trị/);
});
test('authorized administrator is initialized only after state reset',async()=>{
 const f=fixture();
 await f.api.enter({identity:{uid:'admin',role:'admin',active:true},client:{newSession:true}});
 assert.equal(f.api.session().identity.uid,'admin');
 assert.equal(f.api.session().client.newSession,true);
 assert.deepEqual(f.state.events.slice(0,3),['careReset','clearAdmin','showApp']);
 assert.equal(f.state.events.includes('signedOut'),false);
});
