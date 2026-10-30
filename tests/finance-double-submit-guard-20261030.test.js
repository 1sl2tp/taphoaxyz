import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

// SPEC-FINANCE-DOUBLE-TAP-20261030
// Given a valid debt/collection form, when a second tap arrives before the
// first RPC settles, then there is exactly one finance mutation. After success
// or failure the same form remains usable. No DB/schema/permission changes.
const source=readFileSync(new URL('../src/fixed-production-overrides.js',import.meta.url),'utf8');
const start=source.indexOf('  submitQuickDebt=async function(');
const end=source.indexOf('\n  };',start);
assert.ok(start>=0&&end>start,'active quick debt handler must exist');
const handler=source.slice(start,end+5);

function deferred(){
 let resolve,reject;
 const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});
 return {promise,resolve,reject};
}
function fixture(){
 const calls=[],alerts=[],toasts=[],timers=[],load=[];
 const pending=[];
 const context={
  submitQuickDebt:null,
  hasPermission:()=>true,denyPermission:()=>{throw Error('permission should be allowed');},
  document:{getElementById(id){
   if(id==='quickDebtCustomer')return {value:'CUSTOMER-1'};
   if(id==='quickDebtAmount')return {value:'125000'};
   return null;
  }},
  parseDebtAmountValue:()=>125000,
  showAlertPopup:(...args)=>alerts.push(args),
  showLoading:()=>load.push('show'),
  hideLoading:()=>load.push('hide'),
  showToast:(...args)=>toasts.push(args),
  SheetDB:{read:async()=>[]},
  setTimeout:cb=>{timers.push(cb);},
  backend:()=>({debtTransaction:(...args)=>{
   calls.push(args);
   const hold=deferred();pending.push(hold);return hold.promise;
  }}),
  console
 };
 vm.createContext(context);
 vm.runInContext('let debtMutationInFlight=false;\n'+handler+'\nglobalThis.invoke=submitQuickDebt;',context,{timeout:1000});
 return {...context,calls,alerts,toasts,timers,load,pending};
}
async function microtasks(){for(let i=0;i<12;i++)await Promise.resolve();}

test('two immediate Thu tien taps submit only one backend command',async()=>{
 const f=fixture();
 const first=f.invoke('thu');
 const ignored=f.invoke('thu');
 await microtasks();
 assert.equal(f.calls.length,1,'second tap must not issue another financial mutation');
 assert.deepEqual(Array.from(f.calls[0]),['CUSTOMER-1','thu_tien',125000,'Thu tiền mặt']);
 f.pending[0].resolve({ok:true});
 await Promise.all([first,ignored]);
 assert.equal(f.toasts.length,1);
 assert.equal(f.timers.length,1);
 assert.deepEqual(f.load,['show','hide']);
 const third=f.invoke('thu');
 assert.equal(f.calls.length,2,'new deliberate transaction works once the first has settled');
 f.pending[1].resolve({ok:true});await third;
 assert.equal(f.toasts.length,2);
});

test('failed finance RPC releases in-flight guard for intentional retry',async()=>{
 const f=fixture();
 const first=f.invoke('no');
 void f.invoke('no');
 assert.equal(f.calls.length,1);
 f.pending[0].reject(Error('network unavailable'));
 await first;
 assert.equal(f.alerts.length,1);
 assert.equal(f.toasts.length,0);
 assert.deepEqual(f.load,['show','hide']);
 const retry=f.invoke('no');
 assert.equal(f.calls.length,2);
 assert.equal(f.calls[1][1],'ghi_no');
 f.pending[1].resolve({ok:true});
 await retry;
 assert.equal(f.toasts.length,1);
 assert.equal(f.timers.length,1);
});

test('empty/invalid finance input does not lock later valid submission',async()=>{
 const f=fixture();
 f.hasPermission=()=>true;
 f.document.getElementById=id=>id==='quickDebtCustomer'?{value:''}:({value:''});
 f.parseDebtAmountValue=()=>0;
 await f.invoke('thu');
 assert.equal(f.calls.length,0);
 assert.equal(f.alerts.length,1);
 f.document.getElementById=id=>id==='quickDebtCustomer'?{value:'CUSTOMER-1'}:{value:'125000'};
 f.parseDebtAmountValue=()=>125000;
 const submit=f.invoke('thu');
 assert.equal(f.calls.length,1);
 f.pending[0].resolve({ok:true});
 await submit;
});
