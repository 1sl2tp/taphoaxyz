import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const source=await readFile('src/fixed-production-overrides.js','utf8');
const start=source.indexOf('dayToanBoGioHang=async function(tab){');
const end=source.indexOf('\n  };',start);
assert.ok(start>=0&&end>start,'production save handler is missing');
const handler=source.slice(start,end+5);

function scenario({id='DT025',sheet='dontam',ok=true,renderFails=false}={}){
  const calls={saves:[],deliveries:[],reset:0,close:0,renderCart:0,renderFooter:0,
    hide:0,toasts:[],alerts:[],refresh:0};
  const state={
    cart:{'P1':{name:'Nước giặt',qty:2,price:683, note:'',__lastTouched:10},
      'P2':{name:'Tẩy',qty:1,price:265, note:'',__lastTouched:9}},
    editingOrderId:id,
    editingOrderSheet:id?sheet:null,
    editingOrderInSaleMode:Boolean(id),
    selectedCustomer:{id:'customer-1',name:'C Sâm pl'}
  };
  const prod={
    saveOrder:async data=>{
      calls.saves.push(data);
      if(!ok)throw new Error('Supabase rejected');
      return {ok:true,order:{id: data.editOrderId || 'new-uuid',status:data.status}};
    },
    deliverOrder:async key=>{
      calls.deliveries.push(key);
      if(!ok)throw new Error('Supabase rejected');
      return {ok:true};
    }
  };
  const ctx=vm.createContext({
    ...state,
    currentAuthRole:'admin',
    orderMutationInFlight:false,
    cartPriceRefreshInFlight:false,
    window:{__TAPHOA_REPRICE_DRAFT_ID:null},
    hasPermission:()=>true,
    backend:()=>prod,
    backendOrderIdFor:(origin,display)=>origin==='dontam'?'uuid-draft': 'uuid-delivered',
    refreshFixedSheets:async()=>{},
    assertDraftAlreadySavedForDelivery:async()=>{},
    showAlertPopup:(...args)=>calls.alerts.push(args),
    openCustomerModal:()=>{},
    denyPermission:()=>{},
    showLoading:()=>{},
    hideLoading:()=>{calls.hide++},
    showToast:(...args)=>calls.toasts.push(args),
    resetSaleSession:()=>{
      calls.reset++;
      ctx.cart={};ctx.editingOrderId=null;ctx.editingOrderSheet=null;
      ctx.editingOrderInSaleMode=false;ctx.selectedCustomer={id:'',name:'Chọn khách'};
    },
    closeCartMobile:()=>{calls.close++},
    renderCartUI:()=>{calls.renderCart++;if(renderFails)throw Error('cart paint unavailable')},
    renderCartFooterActions:()=>{calls.renderFooter++},
    refreshOrderUiAfterMutation:async()=>{calls.refresh++},
    setTimeout:(callback)=>{calls.refreshQueued=true; /* never create network wake in the test */},
    console:{warn:(...a)=>{calls.warn=a},error:(...a)=>{calls.error=a}}
  });
  vm.runInContext(handler,ctx);
  return {ctx,calls};
}

test('editing a pending order stays at "Cập nhật đơn", with same customer, lines and existing order ID',async()=>{
  const {ctx,calls}=scenario();
  await ctx.dayToanBoGioHang('dontam');
  assert.equal(calls.saves.length,1);
  assert.equal(calls.saves[0].editOrderId,'uuid-draft');
  assert.equal(calls.saves[0].status,'pending');
  assert.equal(ctx.editingOrderId,'DT025');
  assert.equal(ctx.editingOrderSheet,'dontam');
  assert.equal(ctx.editingOrderInSaleMode,true);
  assert.equal(ctx.selectedCustomer.id,'customer-1');
  assert.equal(Object.keys(ctx.cart).length,2);
  assert.equal(ctx.cart.P1.qty,2);
  assert.equal(calls.reset,0);
  assert.equal(calls.close,0);
  assert.equal(calls.renderCart,1);
  assert.equal(calls.renderFooter,1);
  assert.equal(calls.hide,1);
  assert.equal(calls.refreshQueued,true);
  assert.match(calls.toasts[0][0],/Đã cập nhật đơn/);
  // Next save must still edit the same UUID, not create a second order.
  await ctx.dayToanBoGioHang('dontam');
  assert.equal(calls.saves[1].editOrderId,'uuid-draft');
  assert.equal(calls.reset,0);
});

test('editing delivered order keeps that same existing delivery ID and does not start a new sale',async()=>{
  const {ctx,calls}=scenario({id:'DG104',sheet:'dongiao'});
  await ctx.dayToanBoGioHang('dongiao');
  assert.equal(calls.saves[0].editOrderId,'uuid-delivered');
  assert.equal(calls.saves[0].status,'done');
  assert.equal(ctx.editingOrderId,'DG104');
  assert.equal(ctx.selectedCustomer.name,'C Sâm pl');
  assert.equal(calls.reset,0);
  assert.equal(calls.close,0);
});

test('new checkout still clears the cart only after backend confirms success',async()=>{
  const {ctx,calls}=scenario({id:null});
  await ctx.dayToanBoGioHang('dontam');
  assert.equal(calls.saves[0].editOrderId,'');
  assert.equal(calls.reset,1);
  assert.equal(calls.close,1);
  assert.equal(Object.keys(ctx.cart).length,0);
  assert.equal(calls.renderCart,0);
});

test('draft promotion to delivered finishes the edit session; never duplicates using saveOrder',async()=>{
  const {ctx,calls}=scenario({id:'DT029'});
  await ctx.dayToanBoGioHang('dongiao');
  assert.deepEqual(calls.deliveries,['uuid-draft']);
  assert.equal(calls.saves.length,0);
  assert.equal(calls.reset,1);
  assert.equal(calls.close,1);
  assert.equal(ctx.editingOrderId,null);
});

test('failed mutation retains unsaved cart and edit context, without misleading success',async()=>{
  const {ctx,calls}=scenario({ok:false});
  await ctx.dayToanBoGioHang('dontam');
  assert.equal(calls.reset,0);
  assert.equal(calls.close,0);
  assert.equal(ctx.editingOrderId,'DT025');
  assert.equal(Object.keys(ctx.cart).length,2);
  assert.equal(calls.toasts.length,0);
  assert.equal(calls.alerts.length,1);
  assert.equal(calls.refreshQueued,undefined);
});

test('UI repaint error after financial commit cannot make a successful update fail',async()=>{
  const {ctx,calls}=scenario({renderFails:true});
  await ctx.dayToanBoGioHang('dontam');
  assert.equal(calls.toasts.length,1);
  assert.equal(calls.alerts.length,0);
  assert.equal(calls.reset,0);
  assert.equal(ctx.editingOrderId,'DT025');
  assert.equal(calls.refreshQueued,true);
});
