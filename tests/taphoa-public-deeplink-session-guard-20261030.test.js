import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

// PUBLIC-LINK-241: share links use immutable UUIDs and preserve old DT codes
// after delivery without opening an editable cart or crossing sessions.
const raw=readFileSync(new URL('../src/fixed-production-overrides.js',import.meta.url),'utf8');
const a=raw.indexOf('  function applyPublicDeepLink(){');
const b=raw.indexOf('  function sharedCartItems(){',a);
assert.ok(a>=0&&b>a);
const section=raw.slice(a,b);
const ORDER_ID='11111111-2222-4333-8444-555555555555';
const row=(code)=>[code,null,null,null,null,null,null,ORDER_ID];
function fixture({loaded=true,code='DT0042',resolvedCode=code,oid='',resolveOk=true}={}){
  let identity={uid:'customer-A'};
  const delayed=[],opened=[],switched=[],toasts=[],refreshes=[],resolves=[];
  const appData={dontam:[['header']],dongiao:[['header']]};
  if(loaded)appData[code.startsWith('DT')?'dontam':'dongiao'].push(row(code));
  const ctx={
    publicQuery:()=>({tab:'don',don:code,oid,muc:'',nguon:''}),
    window:{},document:{body:{dataset:{}},querySelector:()=>({})},
    sharedCartOwner:()=>({identity}),
    sharedCartOwnerCurrent:owner=>owner.identity===identity,
    setTimeout:fn=>{delayed.push(fn);return delayed.length;},
    appData,
    backend:()=>({
      refresh:async domains=>{refreshes.push(domains);},
      resolvePublicOrderLink:async(don,ref)=>{
        resolves.push({don,ref});
        return resolveOk?{ok:true,display_code:resolvedCode,order_id:ORDER_ID}:{ok:false,error:'order_not_found'};
      }
    }),
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
    setOrderLoaded:(currentCode=resolvedCode)=>appData[currentCode.startsWith('DT')?'dontam':'dongiao'].push(row(currentCode)),
    opened,switched,toasts,refreshes,resolves
  };
}
const settled=()=>new Promise(resolve=>setImmediate(resolve));

test('old link timer never opens another customer order',()=>{
  const f=fixture();f.schedule();f.switchSession();f.flush();
  assert.deepEqual(f.opened,[]);
  assert.deepEqual(f.switched,['tab-don-tam']);
});

test('live customer link opens the original detail without touching the editable cart',()=>{
  const f=fixture();f.schedule();f.flush();
  assert.deepEqual(f.opened,[{id:'DT0042',sheet:'dontam'}]);
  assert.deepEqual(f.refreshes,[]);
  assert.deepEqual(f.resolves,[]);
});

test('missing order resolves once, then refreshes orders before opening',async()=>{
  const f=fixture({loaded:false});
  f.schedule();f.flush();f.setOrderLoaded();
  await settled();
  assert.deepEqual(f.opened,[{id:'DT0042',sheet:'dontam'}]);
  assert.equal(f.refreshes.length,1);
  assert.equal(f.resolves.length,1);
});

test('old DT draft link resolves to new DG code after delivery by immutable ID',async()=>{
  const f=fixture({loaded:false,code:'DT0042',resolvedCode:'DG0099',oid:ORDER_ID});
  f.setOrderLoaded('DG0099');
  f.schedule();f.flush();await settled();
  assert.deepEqual(f.opened,[{id:'DG0099',sheet:'dongiao'}]);
  assert.deepEqual(f.switched,['tab-don-tam','tab-da-giao']);
  assert.deepEqual(f.refreshes,[]);
  assert.deepEqual(f.resolves,[{don:'DT0042',ref:ORDER_ID}]);
});

test('missing order after one refresh gives clear notice rather than a blank modal',async()=>{
  const f=fixture({loaded:false});
  f.schedule();f.flush();await settled();
  assert.deepEqual(f.opened,[]);
  assert.match(f.toasts.join(' '),/Chưa tải được chi tiết đơn DT0042/);
  assert.equal(f.refreshes.length,1);
});

test('unowned code cannot open another customer order',async()=>{
  const f=fixture({loaded:false,resolveOk:false});
  f.schedule();f.flush();await settled();
  assert.deepEqual(f.opened,[]);
  assert.match(f.toasts.join(' '),/Không tìm thấy đơn DT0042/);
});

test('customer switch during order resolution cancels stale link',async()=>{
  const f=fixture({loaded:false});
  f.schedule();f.flush();f.switchSession();f.setOrderLoaded();
  await settled();
  assert.deepEqual(f.opened,[]);
});
