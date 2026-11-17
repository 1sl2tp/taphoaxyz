import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

// SPEC-PWA-ORDER-RESUME-20261117
const bridge=readFileSync('src/fixed-production-bridge.js','utf8');
const ui=readFileSync('src/fixed-production-overrides.js','utf8');
const begin=bridge.indexOf('function notifyOrderUiStage(');
const end=bridge.indexOf('async function splitPendingOrder(payload){',begin);
assert.ok(begin>0&&end>begin);

test('confirmed sale releases UI before slow refresh and PNG attach, without second write',async()=>{
  let resolveRead,resolveMedia;
  const read=new Promise(resolve=>{resolveRead=resolve;});
  const media=new Promise(resolve=>{resolveMedia=resolve;});
  const calls=[],events=[];
  const ctx=vm.createContext({
    console:{warn:()=>{}},
    employeeAccess:false,publicAccess:false,
    captureProductionOwner:()=>({uid:'A'}),
    productionOwnerCurrent:owner=>owner.uid==='A',
    business:{saveOrder:async()=>{calls.push('write');return{
      ok:true,staff_notice_command_id:'cmd-1',
      order:{status:'delivered',order_id:'order-1',customer_id:'customer-1'}
    };}},
    refresh:()=>{calls.push('refresh');return read;},
    noteCommittedRefreshFailure:()=>{throw Error('unexpected read error');},
    attachOrderNoticePortrait:async(_order,opts)=>{calls.push(opts?.staffCommandId?'staff':'customer');await media;return true;}
  });
  vm.runInContext(bridge.slice(begin,end)+'\nthis.saveOrderForTest=saveOrder;',ctx);
  const action=ctx.saveOrderForTest({
    onCommitted:()=>events.push('committed'),
    onReconciled:()=>events.push('reconciled')
  });
  await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(events,['committed']);
  assert.deepEqual(calls,['write','staff','customer','refresh']);
  resolveRead();
  await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(events,['committed','reconciled']);
  assert.deepEqual(calls,['write','staff','customer','refresh']);
  resolveMedia();
  const result=await action;
  assert.equal(result.ok,true);
  assert.equal(result.staff_image_attached,true);
  assert.equal(result.image_attached,true);
  assert.deepEqual(calls,['write','staff','customer','refresh']);
});


test('slow or failed staff PNG never blocks selected customer PNG',async()=>{
  let rejectStaff;
  const staff=new Promise((_,reject)=>{rejectStaff=reject;});
  const calls=[];
  const ctx=vm.createContext({
    console:{warn:()=>{}},
    employeeAccess:false,publicAccess:false,
    captureProductionOwner:()=>({uid:'A'}),
    productionOwnerCurrent:()=>true,
    business:{saveOrder:async()=>({ok:true,staff_notice_command_id:'staff-id',
      order:{status:'delivered',order_id:'order-1',customer_id:'customer-1'}})},
    refresh:async()=>{calls.push('read');},
    noteCommittedRefreshFailure:()=>{},
    attachOrderNoticePortrait:(_order,opts)=>{
      calls.push(opts?.staffCommandId?'staff':'customer');
      return opts?.staffCommandId?staff:Promise.resolve(true);
    }
  });
  vm.runInContext(bridge.slice(begin,end)+'\nthis.saveOrderForTest=saveOrder;',ctx);
  const action=ctx.saveOrderForTest({});
  await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(calls,['staff','customer','read']);
  rejectStaff(Error('staff upload timed out'));
  const result=await action;
  assert.equal(result.ok,true);
  assert.equal(result.image_attached,true);
  assert.equal(result.staff_image_attached,false);
});

test('pending create/edit remains silent even when customer and staff IDs exist',async()=>{
  const calls=[];
  const ctx=vm.createContext({
    console:{warn:()=>{}},employeeAccess:false,publicAccess:false,
    captureProductionOwner:()=>({uid:'A'}),productionOwnerCurrent:()=>true,
    business:{saveOrder:async()=>({ok:true,staff_notice_command_id:'id',
      order:{status:'pending',order_id:'draft',customer_id:'customer'}})},
    refresh:async()=>{calls.push('read');},
    noteCommittedRefreshFailure:()=>{},
    attachOrderNoticePortrait:async()=>{calls.push('image');return true;}
  });
  vm.runInContext(bridge.slice(begin,end)+'\nthis.saveOrderForTest=saveOrder;',ctx);
  const result=await ctx.saveOrderForTest({});
  assert.equal(result.ok,true);
  assert.deepEqual(calls,['read']);
});

test('failed server write cannot unlock UI or initiate image upload',async()=>{
  const events=[],calls=[];
  const ctx=vm.createContext({
    console:{warn:()=>{}},employeeAccess:false,publicAccess:false,
    captureProductionOwner:()=>({uid:'A'}),productionOwnerCurrent:()=>true,
    business:{saveOrder:async()=>{calls.push('write');throw Error('write rejected');}},
    refresh:async()=>{calls.push('read');},
    attachOrderNoticePortrait:async()=>{calls.push('image');}
  });
  vm.runInContext(bridge.slice(begin,end)+'\nthis.saveOrderForTest=saveOrder;',ctx);
  await assert.rejects(ctx.saveOrderForTest({onCommitted:()=>events.push('committed')}),/write rejected/);
  assert.deepEqual(events,[]);
  assert.deepEqual(calls,['write']);
});

test('resume guard keeps unacknowledged order locked; old media cannot unlock new order',()=>{
  const part=ui.slice(ui.indexOf('dayToanBoGioHang=async function(tab){'),
    ui.indexOf('submitQuickDebt=async function(',ui.indexOf('dayToanBoGioHang=async function(tab){')));
  assert.match(part,/if\(orderMutationInFlight\)\{/);
  assert.match(part,/Không gửi lại để tránh trùng/);
  assert.match(part,/Date\.now\(\)-startedAt<12000/);
  assert.match(part,/addEventListener\('pageshow',checkResumedOrder\)/);
  assert.match(part,/onCommitted:releaseConfirmedOrder/);
  assert.match(part,/onReconciled:scheduleOrderUiRepaint/);
  assert.match(part,/if\(!uiReleased\)\{\s*orderMutationInFlight=false;\s*hideLoading\(\)/);
  assert.match(part,/if\(!refreshQueued\)setTimeout/);
});
