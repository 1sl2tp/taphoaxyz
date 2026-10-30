import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

// SPEC-LOGIN-DOUBLE-SUBMIT-20261030: one user tap sequence => one auth job.
// Rejected/obsolete login must not show the authenticated app or grant admin UI.
const source=readFileSync(new URL('../src/fixed-production-overrides.js',import.meta.url),'utf8');
const start=source.indexOf('  submitPreviewLogin=async function(event){');
const end=source.indexOf('\n  };',start);
assert.ok(start>=0&&end>start,'active preview login handler must be present');
const handler=source.slice(start,end+5);
function deferred(){
 let resolve,reject;
 const promise=new Promise((res,rej)=>{resolve=res;reject=rej;});
 return {promise,resolve,reject};
}
function fixture(){
 const calls=[],alerts=[],toasts=[],ui=[],pending=[];
 const fields={
  loginUsername:{value:'admin'},
  loginPassword:{value:'secret'}
 };
 const context={
  submitPreviewLogin:null,
  document:{getElementById:id=>fields[id]??null},
  backend:()=>({login:(username,password)=>{
   calls.push({username,password});
   const hold=deferred();pending.push(hold);return hold.promise;
  }}),
  productionRole:info=>info.identity.role,
  setAuthRole:role=>ui.push('role:'+role),
  syncSelfCustomer:()=>ui.push('customer'),
  showAppScreen:()=>ui.push('app'),
  showLoginScreen:()=>ui.push('login'),
  refreshFixedSheets:async()=>ui.push('refresh'),
  showLoading:()=>ui.push('loading'),
  hideLoading:()=>ui.push('hide'),
  showToast:(...args)=>toasts.push(args),
  showAlertPopup:(...args)=>alerts.push(args),
  console:{error(){}}
 };
 vm.createContext(context);
 vm.runInContext('let loginInFlight=false;\n'+handler+'\nglobalThis.invoke=submitPreviewLogin;',context,{timeout:1000});
 return {...context,calls,alerts,toasts,ui,pending,fields};
}
async function microtasks(){for(let i=0;i<12;i++)await Promise.resolve();}

test('rapid login taps generate one auth RPC and one authenticated UI transition',async()=>{
 const f=fixture();
 const a=f.invoke({preventDefault(){}});
 const b=f.invoke({preventDefault(){}});
 await microtasks();
 assert.equal(f.calls.length,1);
 assert.deepEqual(f.calls[0],{username:'admin',password:'secret'});
 f.pending[0].resolve({identity:{uid:'owner',role:'admin'}});
 await Promise.all([a,b]);
 assert.deepEqual(f.ui,['loading','role:admin','customer','app','refresh','hide']);
 assert.equal(f.toasts.length,1);
 assert.equal(f.alerts.length,0);
 assert.equal(f.fields.loginPassword.value,'');
});

test('superseded null login response never opens application or sets admin UI',async()=>{
 const f=fixture();
 const task=f.invoke();
 f.pending[0].resolve(null);
 await task;
 assert.deepEqual(f.ui,['loading','login','hide']);
 assert.equal(f.toasts.length,0);
 assert.equal(f.alerts.length,1);
 assert.match(f.alerts[0][1],/Phiên đăng nhập đã thay đổi/);
});

test('rejected login unlocks the control for an intentional retry',async()=>{
 const f=fixture();
 const a=f.invoke();
 f.pending[0].reject(Error('Temporary connection error'));
 await a;
 assert.equal(f.calls.length,1);
 assert.deepEqual(f.ui,['loading','login','hide']);
 const b=f.invoke();
 assert.equal(f.calls.length,2);
 f.pending[1].resolve({identity:{uid:'owner',role:'admin'}});
 await b;
 assert.equal(f.toasts.length,1);
 assert.equal(f.alerts.length,1);
});
