import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

// PUBLIC-LINK-241: a saved-order deep link must open the canonical order
// detail and may refresh orders once if the initial snapshot missed it.
const raw=readFileSync(new URL('../src/fixed-production-overrides.js',import.meta.url),'utf8');
const a=raw.indexOf('  function applyPublicDeepLink(){');
const b=raw.indexOf('  function sharedCartItems(){',a);
assert.ok(a>=0&&b>a);
const section=raw.slice(a,b);
function fixture({loaded=true}={}){
  let identity={uid:'customer-A'};
  const delayed=[],opened=[],switched=[],toasts=[],refreshes=[];
  const appData={dontam:loaded?[['header'],['DT0042']]:[['header']],dongiao:[['header']]};
  const ctx={
    publicQuery:()=>({tab:'don',don:'DT0042',muc:'',nguon:''}),
    window:{},document:{body:{dataset:{}},querySelector:()=>({})},
    sharedCartOwner:()=>({identity}),
    sharedCartOwnerCurrent:owner=>owner.identity===identity,
    setTimeout:fn=>{delayed.push(fn);return delayed.length;},
    appData,
    backend:()=>({refresh:async domains=>{refreshes.push(domains);}}),
    refreshFixedSheets:async()=>{},
    showOrderDetailMobile:(id,sheet)=>opened.push({id,sheet}),
    showToast:(message)=>toasts.push(message),
    console:{warn:()=>{}},
    switchTab:tab=>switched.push(tab),
    applyPublicSourceFilter:()=>{},
    renderProductList:()=>{},
    renderPublicTools:()=>{},
    String,Array,Promise
  };
  vm.createContext(ctx);
  vm.runInContext('let publicTabId="",ownProductRenderKey="";\n'+section+'\nglobalThis.openLink=applyPublicDeepLink;',ctx,{timeout:1000});
  return {
    schedule:()=>ctx.openLink(),
    switchSession:()=>{identity={uid:'customer-B'};},
    flush:()=>{for(const fn of delayed.splice(0))fn();},
    setOrderLoaded:()=>{appData.dontam.push(['DT0042']);},
    opened,switched,toasts,refreshes
  };
}
test('stale customer link timer cannot open a draft for another session',()=>{
  const f=fixture();
  f.schedule();f.switchSession();f.flush();
  assert.deepEqual(f.opened,[]);
  assert.deepEqual(f.switched,['tab-don-tam']);
});
test('valid customer link opens saved order detail rather than sales cart exactly once',()=>{
  const f=fixture();
  f.schedule();f.flush();
  assert.deepEqual(f.opened,[{id:'DT0042',sheet:'dontam'}]);
  assert.deepEqual(f.refreshes,[]);
});
test('missing order in initial snapshot triggers one orders-domain refresh and opens when found',async()=>{
  const f=fixture({loaded:false});
  f.schedule();f.flush();f.setOrderLoaded();
  await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(f.opened,[{id:'DT0042',sheet:'dontam'}]);
  assert.equal(f.refreshes.length,1);
});
test('missing order after refresh shows explicit notice rather than opening an empty cart',async()=>{
  const f=fixture({loaded:false});
  f.schedule();f.flush();
  await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(f.opened,[]);
  assert.match(f.toasts.join(' '),/Không tìm thấy đơn DT0042/);
});
test('customer switch during missing-order refresh cannot open old customer order',async()=>{
  const f=fixture({loaded:false});
  f.schedule();f.flush();f.switchSession();f.setOrderLoaded();
  await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(f.opened,[]);
});
