import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

// SPEC-DEBT-LEDGER-OWNER-20261030
// A debt ledger response belongs to the account/mode that requested it.
// After a session rotation, neither customer data, modal, error UI nor
// optional image repair may be emitted from the obsolete response.
const raw=readFileSync(new URL('../src/fixed-production-overrides.js',import.meta.url),'utf8');
const start=raw.indexOf('  let debtModalOpenSeq=0;');
const end=raw.indexOf("  window.addEventListener('taphoa-finance-images-repaired'",start);
assert.ok(start>=0&&end>start);
const source=raw.slice(start,end);
function deferred(){
 let resolve,reject;
 const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});
 return {promise,resolve,reject};
}
async function tick(){for(let i=0;i<20;i++)await Promise.resolve();}
function fixture({holdOpened=false}={}){
 let uid='A',mode='account',renders=0,identity={uid:'A'};
 const pending=[],openings=[],alerts=[],repairs=[],warnings=[],modalGate=deferred();
 const appData={thuchi:[['header'],['A-DEBT', 'customer-a','private']]};
 const prod={
  getIdentity:()=>identity,
  getAccessMode:()=>mode,
  debtLedger:async(customer,opts)=>{
   const gate=deferred();pending.push({customer,opts,...gate});return gate.promise;
  },
  ledgerToRows:detail=>detail.transactions.map(x=>[x.id,detail.customer?.id]),
  repairRecentFinanceImages:customer=>{repairs.push(customer);return 0;}
 };
 const original=customer=>{
  openings.push(customer);
  return holdOpened?modalGate.promise:true;
 };
 const ctx={
  openCustomerDebtModal:original,
  hasPermission:()=>true,denyPermission:()=>{throw Error('permission denied');},
  backend:()=>prod,
  appData,
  window:{TAPHOA_DEBT_PAGE_STATE:null},
  renderCongNo:()=>{renders++;},
  showAlertPopup:(...args)=>alerts.push(args),
  console:{warn:(...args)=>warnings.push(args)},
  String,Array,Number,Promise,Error
 };
 vm.createContext(ctx);
 vm.runInContext(source,ctx,{timeout:1000});
 return {
  open:ctx.openCustomerDebtModal,appData,ctx,pending,openings,alerts,repairs,warnings,modalGate,
  get renders(){return renders;},
  switchTo(nextUid,nextMode='account'){uid=nextUid;mode=nextMode;identity={uid};}
 };
}
function result(customer,id='ENTRY'){
 return {customer:{id:customer},balance:200,transactions:[{id}]};
}
test('late account A ledger after switching to B cannot repaint or open modal',async()=>{
 const f=fixture();
 const old=f.open('customer-a');
 await tick();
 f.switchTo('B');
 f.pending[0].resolve(result('customer-a','PRIVATE-A'));
 assert.equal(await old,false);
 assert.equal(f.renders,0);
 assert.equal(f.openings.length,0);
 assert.equal(f.alerts.length,0);
 assert.deepEqual(f.appData.thuchi,[['header'],['A-DEBT','customer-a','private']]);
 assert.equal(f.ctx.window.TAPHOA_DEBT_PAGE_STATE,null);
 await tick();
 assert.equal(f.repairs.length,0);
});

test('late ledger failure from old link cannot display warning over new account',async()=>{
 const f=fixture();
 const old=f.open('customer-a');
 await tick();f.switchTo('A','public-link');
 f.pending[0].reject(Error('stale ledger error'));
 assert.equal(await old,false);
 assert.equal(f.alerts.length,0);
 assert.equal(f.warnings.length,0);
});

test('newer customer ledger wins when two modal opens complete out of order',async()=>{
 const f=fixture();
 const old=f.open('customer-a');
 const newer=f.open('customer-b');
 await tick();
 f.pending[1].resolve(result('customer-b','B-NEW'));
 assert.equal(await newer,true);
 f.pending[0].resolve(result('customer-a','A-OLD'));
 assert.equal(await old,false);
 assert.equal(f.renders,1);
 assert.deepEqual(f.openings,['customer-b']);
 assert.equal(f.ctx.window.TAPHOA_DEBT_PAGE_STATE.customerId,'customer-b');
 assert.equal(f.appData.thuchi.at(-1)[0],'B-NEW');
});

test('successful same-owner ledger still displays and repairs only after modal is opened',async()=>{
 const f=fixture({holdOpened:true});
 const operation=f.open('customer-a');
 await tick();
 f.pending[0].resolve(result('customer-a'));
 await tick();
 assert.equal(f.renders,1);
 assert.equal(f.openings.length,1);
 f.switchTo('B');
 f.modalGate.resolve(true);
 assert.equal(await operation,true);
 await tick();
 assert.equal(f.repairs.length,0,'deferred repair must not run after account switch');
});

test('same UID but new session cannot open old debt ledger modal',async()=>{
 const f=fixture();
 const old=f.open('customer-a');
 await tick();
 f.switchTo('A','account');
 f.pending[0].resolve(result('customer-a','STALE'));
 assert.equal(await old,false);
 assert.equal(f.renders,0);
 assert.equal(f.openings.length,0);
});
