import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {orderRpcPayload} from '../src/core/business.js';

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const script=read('src/fixed-ui-runtime-6.js');
const start=script.indexOf('async function refreshEditedOrderPrices()');
const end=script.indexOf('function renderCartUI()',start);
const action=script.slice(start,end).trim();

function fixture(products){
  let reads=0, paints=0, messages=[];
  const cart={
    '20':{name:'A',qty:2,price:100,note:'Giữ ghi chú',__lastTouched:9},
    '10':{name:'B',qty:4,price:150,note:'',__lastTouched:8}
  };
  const window={TAPHOA_PRODUCTION:{
    getAccessMode:()=> 'account',
    refresh:async domains=>{reads++; assert.deepEqual(Array.from(domains),['products']);return {products};}
  }};
  const sandbox={
    cart,window,editingOrderId:'DT77',editingOrderSheet:'dontam',
    editingOrderInSaleMode:true,currentAuthRole:'admin',cartPriceRefreshInFlight:false,
    document:{getElementById:()=>({disabled:false})},
    renderCartUI:()=>{paints++;},renderProductList:()=>{paints++;},
    showToast:msg=>messages.push(['ok',msg]),
    showAlertPopup:(_,msg)=>messages.push(['error',msg]),
    Object,Number,String,Array,Map,Error
  };
  vm.runInNewContext(action+'; globalThis.callRefresh=refreshEditedOrderPrices;',sandbox);
  return {sandbox,cart,messages,counts:()=>({reads,paints})};
}

test('pending edit price refresh is explicit, atomic and preserves line identities',async()=>{
  const x=fixture([
    {id:'20',gia:200,von:100,is_active:true},
    {id:'10',gia:300,von:180,is_active:true}
  ]);
  assert.equal(x.counts().reads,0);
  const original=Object.entries(x.cart).map(([id,line])=>[id,line.qty,line.note,line.__lastTouched]);
  await x.sandbox.callRefresh();
  assert.equal(x.counts().reads,1);
  assert.equal(x.cart['20'].price,200);
  assert.equal(x.cart['10'].price,300);
  assert.deepEqual(Object.entries(x.cart).map(([id,line])=>[id,line.qty,line.note,line.__lastTouched]),original);
  assert.equal(x.sandbox.window.__TAPHOA_REPRICE_DRAFT_ID,'DT77');
  assert.equal(x.counts().paints,2);
  assert.equal(x.messages[0][0],'ok');
});

test('missing product aborts all price changes and does not opt in cost change',async()=>{
  const x=fixture([{id:'20',gia:200,von:100}]);
  await x.sandbox.callRefresh();
  assert.equal(x.cart['20'].price,100);
  assert.equal(x.cart['10'].price,150);
  assert.equal(x.sandbox.window.__TAPHOA_REPRICE_DRAFT_ID,undefined);
  assert.equal(x.messages[0][0],'error');
});

test('preview/user/normal sale have no products read',async()=>{
  const x=fixture([]);
  x.sandbox.editingOrderInSaleMode=false;
  await x.sandbox.callRefresh();
  assert.equal(x.counts().reads,0);
});

test('optional cost snapshot flag travels only for explicit Save',()=>{
  const baseline=orderRpcPayload({editOrderId:'uuid',items:[{maSP:'a',sl:1,gia:300}]});
  const repriced=orderRpcPayload({editOrderId:'uuid',refreshCostSnapshot:true,items:[{maSP:'a',sl:1,gia:300}]});
  assert.equal('refresh_cost_snapshot' in baseline,false);
  assert.equal(repriced.refresh_cost_snapshot,true);
});

test('SQL and UI protect frozen cost and use vector quantity controls',()=>{
  const sql=read('supabase/migrations/20261009201500_taphoa_pending_draft_optin_reprice.sql');
  const overrides=read('src/fixed-production-overrides.js');
  const css=read('src/fixed-ui-cart-spacing.css');
  assert.match(sql,/v_role <> 'admin' or v_edit_id is null or v_status <> 'pending'/);
  assert.match(sql,/v_refresh_costs and v_old_status <> 'pending'/);
  assert.match(sql,/case when v_refresh_costs[\s\S]*then coalesce\(p\.input_price_vnd,0\)/);
  assert.match(overrides,/refreshCostSnapshot/);
  assert.match(overrides,/__lastTouched/);
  assert.match(script,/<svg viewBox="0 0 24 24"/);
  assert.match(css,/\.cart-qty-control > button svg/);
  assert.match(script,/cartRefreshPricesButton/);
});
