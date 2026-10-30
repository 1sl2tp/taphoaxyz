import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

// SPEC-SHARED-LINK-ENTRY-OWNER-20261030
// Given a link has been verified, its delayed sheet loads must not expose
// an obsolete customer's products or start polling after another link opens.
const src=readFileSync(new URL('../src/fixed-production-overrides.js',import.meta.url),'utf8');
function section(start,end){
 const a=src.indexOf(start),b=src.indexOf(end,a);
 assert.ok(a>=0&&b>a,start);
 return src.slice(a,b);
}
const employee=section('  async function enterEmployeeLink(info){','  async function openEmployeeLinkFromSession(){');
const customer=section('  async function enterPublicUser(info){','  async function openPublicUserFromSession(){');
function deferred(){let release;const promise=new Promise(resolve=>{release=resolve;});return {promise,release};}
async function tick(){for(let i=0;i<25;i++)await Promise.resolve();}
function fixture(kind,{holdSnapshot=false}={}){
 const events=[],wait=deferred(),snapshotWait=deferred();
 let mode=kind==='employee'?'employee-link':'public-link';
 let identity={uid:'A'};
 const backendService={
  getIdentity:()=>identity,
  getAccessMode:()=>mode,
  getEmployeeAccess:()=>({token:'A'}),
  getPublicAccess:()=>({slug:'A'}),
  getEmployeeSnapshot:async()=>{if(holdSnapshot)await snapshotWait.promise;return {items:[]};},
  employeeSnapshot:async()=>{if(holdSnapshot)await snapshotWait.promise;return {items:[]};}
 };
 const ctx={
  backend:()=>backendService,window:{},document:{
   body:{dataset:{}},
   querySelector:()=>({id:'sales-button'})
  },
  resetSharedCartSyncOwner:()=>events.push('reset-cart'),
  setAuthRole:role=>events.push('role:'+role),
  syncSelfCustomer:()=>events.push('self'),
  refreshFixedSheets:async()=>{events.push('refresh-start');await wait.promise;events.push('refresh-finish');},
  showAppScreen:()=>events.push('show-app'),
  switchTab:()=>events.push('switch-tab'),
  installSharedCartQuantitySync:()=>events.push('install-quantities'),
  installEmployeeOrderActionGuard:()=>events.push('install-action'),
  installPublicSwitchTracking:()=>events.push('install-tab'),
  applyPublicDeepLink:()=>events.push('deep-link'),
  applySharedCartSnapshot:()=>events.push('apply-cart'),
  renderProductList:()=>events.push('render-products'),
  renderPublicTools:()=>events.push('render-tools'),
  renderCartFooterActions:()=>events.push('render-actions'),
  startSharedCartSync:()=>events.push('start-poll'),
  sharedCartOwner:()=>({identity,mode,slug:'A',token:'A'}),
  sharedCartOwnerCurrent:owner=>owner.identity===identity&&owner.mode===mode,
  String,Promise,Array,Object,Error,
  console:{warn:()=>{}}
 };
 vm.createContext(ctx);
 const code=(kind==='employee'?employee:customer)+
  '\nlet sharedCartSignature="",sharedCartLocalEditSeq=0,sharedCartCommittedEditSeq=0,sharedCartPollRequestSeq=0,ownProductRenderKey="",publicTabId="";'+
  '\nglobalThis.enter='+(kind==='employee'?'enterEmployeeLink':'enterPublicUser')+';globalThis.markLocalEdit=()=>{sharedCartLocalEditSeq++};';
 vm.runInContext(code,ctx,{timeout:1000});
 return {
  info:()=>({identity}),
  enter:ctx.enter,
  events,
  markLocalEdit:()=>ctx.markLocalEdit(),
  release:()=>wait.release(),
  releaseSnapshot:()=>snapshotWait.release(),
  switchTo:(uid,nextMode=mode)=>{identity={uid};mode=nextMode;}
 };
}

for(const kind of ['employee','public']){
 test(kind+' old session never opens app after delayed sheet load',async()=>{
  const f=fixture(kind),prior=f.info();
  const loading=f.enter(prior);
  await tick();
  f.switchTo('B');
  f.release();
  await loading;
  assert.equal(f.events.includes('show-app'),false);
  assert.equal(f.events.includes('start-poll'),false);
  assert.equal(f.events.includes('apply-cart'),false);
 });
 test(kind+' current session loads the sheet before opening its app',async()=>{
  const f=fixture(kind),current=f.info();
  const loading=f.enter(current);
  await tick();
  assert.equal(f.events.includes('show-app'),false);
  f.release();
  await loading;
  assert.ok(f.events.indexOf('refresh-finish')<f.events.indexOf('show-app'));
  assert.equal(f.events.filter(x=>x==='show-app').length,1);
  assert.equal(f.events.filter(x=>x==='start-poll').length,1);
 });
}

for(const kind of ['employee','public']){
 test(kind+' initial server snapshot must not overwrite a quantity edited while snapshot was loading',async()=>{
  const f=fixture(kind,{holdSnapshot:true});
  const pending=f.enter(f.info());
  await tick();
  f.release();await tick();
  assert.equal(f.events.includes('show-app'),true);
  f.markLocalEdit();
  f.releaseSnapshot();
  await pending;
  assert.equal(f.events.includes('apply-cart'),false);
  assert.equal(f.events.includes('start-poll'),true,
    'normal polling remains available for the edited cart after its save');
 });
}
