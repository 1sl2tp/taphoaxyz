import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

// SPEC-PUBLIC-DEEPLINK-OWNER-20261030: a delayed link-opening callback
// belongs to the exact customer session which scheduled it.
const raw=readFileSync(new URL('../src/fixed-production-overrides.js',import.meta.url),'utf8');
const a=raw.indexOf('  function applyPublicDeepLink(){');
const b=raw.indexOf('  function sharedCartItems(){',a);
assert.ok(a>=0&&b>a);
const section=raw.slice(a,b);
function fixture(){
 let identity={uid:'customer-A'};
 const delayed=[],opened=[],switched=[];
 const ctx={
  publicQuery:()=>({tab:'don',don:'DT0042',muc:'',nguon:''}),
  window:{},document:{body:{dataset:{}},querySelector:()=>({})},
  sharedCartOwner:()=>({identity}),
  sharedCartOwnerCurrent:owner=>owner.identity===identity,
  setTimeout:fn=>{delayed.push(fn);return delayed.length;},
  clickOrder:(id,kind)=>opened.push({id,kind}),
  switchTab:tab=>switched.push(tab),
  applyPublicSourceFilter:()=>{},
  renderProductList:()=>{},
  renderPublicTools:()=>{},
  String
 };
 vm.createContext(ctx);
 vm.runInContext('let publicTabId="",ownProductRenderKey="";\n'+section+'\nglobalThis.openLink=applyPublicDeepLink;',ctx,{timeout:1000});
 return {
  schedule:()=>ctx.openLink(),
  switchSession:()=>{identity={uid:'customer-B'};},
  flush:()=>{for(const fn of delayed.splice(0))fn();},
  opened,switched
 };
}
test('old link timer never opens a draft after switching account',()=>{
 const f=fixture();
 f.schedule();
 f.switchSession();
 f.flush();
 assert.deepEqual(f.opened,[]);
 assert.deepEqual(f.switched,['tab-don-tam']);
});
test('live customer link still opens the correct existing draft exactly once',()=>{
 const f=fixture();
 f.schedule();f.flush();
 assert.deepEqual(f.opened,[{id:'DT0042',kind:'dontam'}]);
});
