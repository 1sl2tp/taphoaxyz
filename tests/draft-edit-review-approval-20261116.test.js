import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const runtime=readFileSync('src/fixed-ui-runtime-5.js','utf8');
const review=readFileSync('src/fixed-ui-runtime-6.js','utf8');
const mutation=readFileSync('src/fixed-production-overrides.js','utf8');
const a=mutation.indexOf('  let draftReviewTransitionInFlight=false;');
const b=mutation.indexOf('  dayToanBoGioHang=async function(tab){',a);
assert(a>0&&b>a,'owner for review transition must exist');
const makeFunction=new Function('env','with(env){'+mutation.slice(a,b)+
  '\nreturn window.beginDraftReviewAfterEditing;}');

function scenario({role='admin',saved=true,delayed=false}={}){
  const calls={checked:0,delivered:0,saved:0,repaints:0,reset:0,alerts:[],toasts:[],loads:0,hides:0};
  const identity={uid:'admin-01',role:'admin'};
  const backendObject={
    getAccessMode:()=> 'account',
    getIdentity:()=>identity,
    deliverOrder:async()=>{calls.delivered++},
    saveOrder:async()=>{calls.saved++}
  };
  let continueCheck;
  const env={
    window:{__TAPHOA_REPRICE_DRAFT_ID:null},
    backend:()=>backendObject,
    backendOrderIdFor:()=> 'uuid-draft-268',
    refreshFixedSheets:async()=>{},
    assertDraftAlreadySavedForDelivery:async()=>{
      calls.checked++;
      if(delayed)await new Promise(resolve=>continueCheck=resolve);
      if(!saved)throw new Error('Đơn tạm có thay đổi chưa lưu');
    },
    editingOrderId:'DT268',
    editingOrderSheet:'dontam',
    editingOrderInSaleMode:true,
    selectedCustomer:{id:'customer-uuid-01',name:'E Quyết Tiến'},
    cart:{P1:{qty:1,price:435,note:'',__lastTouched:2},
      P2:{qty:2,price:364,note:'',__lastTouched:1}},
    cartPriceRefreshInFlight:false,
    currentAuthRole:role,
    orderMutationInFlight:false,
    document:{getElementById:()=>({innerText:'Đang sửa đơn',classList:{add(){},remove(){}}})},
    renderCartUI:()=>{calls.repaints++},
    renderCartFooterActions:()=>{calls.repaints++},
    resetCartReview:()=>{calls.reset++},
    showToast:(...x)=>calls.toasts.push(x),
    showAlertPopup:(...x)=>calls.alerts.push(x),
    showLoading:()=>{calls.loads++},
    hideLoading:()=>{calls.hides++},
    denyPermission:(text)=>calls.alerts.push(['permission',text])
  };
  const begin=makeFunction(env);
  return {begin,env,calls,finish:()=>continueCheck?.()};
}

test('saved draft enters read-only checklist, never submits delivery on first Duyệt',async()=>{
  const h=scenario();
  await h.begin();
  assert.equal(h.calls.checked,1);
  assert.equal(h.calls.delivered,0);
  assert.equal(h.calls.saved,0);
  assert.equal(h.env.editingOrderInSaleMode,false);
  assert.equal(h.calls.reset,1,'fresh review requires rechecking every row');
  assert.equal(h.calls.repaints,2);
  assert.match(h.calls.toasts[0][0],/Soát từng dòng/);
  assert.match(runtime,/isPendingOrderCart && !editingOrderInSaleMode/);
  assert.match(review,/cartReviewAvailable\(\)/);
  assert.match(mutation,/isPartialPromotion=isPromotingDraft&&!isCartReviewComplete\(\)/);
});

test('unsaved edits block transition and preserve edit mode and cart',async()=>{
  const h=scenario({saved:false});
  await h.begin();
  assert.equal(h.calls.delivered,0);
  assert.equal(h.calls.reset,0);
  assert.equal(h.env.editingOrderInSaleMode,true);
  assert.equal(h.env.cart.P1.price,435);
  assert.match(h.calls.alerts[0][1],/thay đổi chưa lưu/);
});

test('changed cart during server validation blocks old review transition',async()=>{
  const h=scenario({delayed:true});
  const pending=h.begin();
  await Promise.resolve();
  h.env.cart.P1.qty=5;
  h.finish();
  await pending;
  assert.equal(h.env.editingOrderInSaleMode,true);
  assert.equal(h.calls.reset,0);
  assert.match(h.calls.alerts[0][1],/thay đổi/);
});

test('only saved draft being edited by account admin can enter approval review',async()=>{
  const h=scenario({role:'user'});
  await h.begin();
  assert.equal(h.calls.checked,0);
  assert.equal(h.env.editingOrderInSaleMode,true);
  assert.equal(h.calls.alerts[0][0],'permission');
  const other=scenario();
  other.env.editingOrderSheet='dongiao';
  await other.begin();
  assert.equal(other.calls.checked,0);
  assert.equal(other.calls.reset,0);
});

test('edit footer offers Duyệt separately from saving and leaves delivery gated',()=>{
  const p=runtime.slice(runtime.indexOf('if (isPendingOrderCart) {'),
    runtime.indexOf('// Ở tab đơn',runtime.indexOf('if (isPendingOrderCart) {')));
  assert.match(p,/beginDraftReviewAfterEditing\(\)/);
  assert.match(p,/updateExistingOrder\(\)/);
  assert.doesNotMatch(p,/dayToanBoGioHang\('dongiao'\)/);
  assert.match(mutation,/await assertDraftAlreadySavedForDelivery\(backendId,customerId,items\)/);
});
