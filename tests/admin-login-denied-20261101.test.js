import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const page=readFileSync(new URL('../admin-gia.html',import.meta.url),'utf8');
const start=page.indexOf('    // SPEC-ADMIN-LOGIN-DENIED-20261101:');
const end=page.indexOf('    let loggingOutAdmin=false;',start);
assert.ok(start>=0&&end>start);
function fixture(){
 const nodes={
  loginForm:{addEventListener(type,fn){this.handle=fn}},
  loginMsg:{textContent:''},
  adminLoginSubmitBtn:{disabled:false},
  username:{value:'support'},
  password:{value:'secret'},
  appView:{hidden:true,classList:{contains(){return nodes.appView.hidden}}}
 };
 const state={nodes,logins:0,allow:false,release:null};
 const ctx=vm.createContext({state,Promise});
 vm.runInContext(`
   const $=id=>state.nodes[id];
   const auth={login:async()=>{state.logins++;return {identity:{role:'user'}}}};
   const showLogin=message=>{state.nodes.loginMsg.textContent=message;state.nodes.appView.hidden=true;};
   const enter=async()=>{
     if(!state.allow){showLogin('Trang này chỉ dành cho quản trị.');return;}
     state.nodes.appView.hidden=false;
   };
   ${page.slice(start,end)}
 `,ctx);
 return {state,submit:()=>nodes.loginForm.handle({preventDefault(){}})};
}
test('non-admin login does not erase the role-denied reason',async()=>{
 const f=fixture();
 await f.submit();
 assert.equal(f.state.nodes.loginMsg.textContent,'Trang này chỉ dành cho quản trị.');
 assert.equal(f.state.nodes.appView.hidden,true);
 assert.equal(f.state.nodes.adminLoginSubmitBtn.disabled,false);
 assert.equal(f.state.logins,1);
});
test('successful admin login removes only success-state message and password',async()=>{
 const f=fixture();f.state.allow=true;
 await f.submit();
 assert.equal(f.state.nodes.loginMsg.textContent,'');
 assert.equal(f.state.nodes.password.value,'');
 assert.equal(f.state.nodes.appView.hidden,false);
});
test('the login submit button is locked while the request is active',()=>{
 assert.match(page,/id="adminLoginSubmitBtn"/);
 assert.match(page,/if\(adminLoginInProgress\)return/);
 assert.match(page,/\$\('adminLoginSubmitBtn'\)\.disabled=true/);
 assert.match(page,/\$\('adminLoginSubmitBtn'\)\.disabled=false/);
});
