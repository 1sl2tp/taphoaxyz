import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const ui=fs.readFileSync('src/fixed-ui-runtime-6.js','utf8');
const bridge=fs.readFileSync('src/fixed-production-bridge.js','utf8');
const shell=fs.readFileSync('index.html','utf8');
const css=fs.readFileSync('src/fixed-ui-cart-spacing.css','utf8');
const start=ui.indexOf('        function editedCustomerPriceContext() {');
const end=ui.indexOf('        // SPEC-TAPHOA-CART-REVIEW-20261116',start);
assert(start>0&&end>start,'missing customer price edit owner');
const snippet=ui.slice(start,end);

const CUSTOMER='11111111-1111-4111-8111-111111111111';
const OTHER='22222222-2222-4222-8222-222222222222';
function harness({matrix=[],provider}={}){
  const toasts=[],alerts=[];
  const ctx={
    window:{TAPHOA_PRODUCTION:{
      getIdentity:()=>({uid:'admin-test',role:'admin'}),
      getAccessMode:()=> 'account',
      customerSpecialPriceMatrix:provider|| (async()=>matrix)
    }},
    editingOrderId:'DG370',editingOrderSheet:'dongiao',editingOrderInSaleMode:true,
    currentAuthRole:'admin',selectedCustomer:{id:CUSTOMER,name:'C Hà Trang'},
    cart:{
      'SP001':{name:'Sữa A',price:235,qty:10},
      'SP002':{name:'Sữa B',price:181,qty:5}
    },
    cartPriceRefreshInFlight:false,
    renderCartUI(){},renderProductList(){},
    showToast:(msg,status)=>toasts.push({msg,status}),
    showAlertPopup:(title,msg)=>alerts.push({title,msg}),
    console:{warn(){}},JSON,Number,String,Error,Array,Map,Set,Object,Promise
  };
  vm.createContext(ctx);
  vm.runInContext(snippet,ctx);
  const flush=()=>new Promise(resolve=>setImmediate(resolve));
  return {ctx,toasts,alerts,flush,
    apply:()=>vm.runInContext('applyEditedCustomerSpecialPrices()',ctx),
    eligible:()=>vm.runInContext('editedCustomerPriceContext()',ctx)
  };
}

test('price action stays visible for Admin edits even if list count is zero/stale',()=>{
  const h=harness();
  assert.equal(h.eligible().customerId,CUSTOMER);
  assert.match(ui,/specialButton\.classList\.toggle\('hidden',!canApplyCustomerPrice\)/);
  // Visible in new sale (even though the edit badge and 'Giá mới' are hidden).
  assert.match(ui,/const canApplyCustomerPrice=currentAuthRole==='admin'/);
  assert.match(ui,/&& \(!editingOrderId \|\| visible\)/);
  assert.match(ui,/specialButton\.disabled=cartPriceRefreshInFlight/);
  assert.match(ui,/!selectedCustomer\?\.id\|\|!Object\.keys\(cart\)\.length/);

  assert.doesNotMatch(snippet,/customerSpecialPriceCount|price_count|ensureEditedCustomerPriceProbe/);
  h.ctx.editingOrderInSaleMode=false;
  assert.equal(h.eligible(),null);
});
test('price actions occupy one visible row below cart title, not squeezed into title group',()=>{
  assert.match(ui,/priceActions\.id='cartPriceActions'/);
  assert.match(ui,/cartSheet\.querySelector\('\.cart-column-header'\)\?\.before\(priceActions\)/);
  assert.match(ui,/priceActions\.appendChild\(priceButton\)/);
  assert.match(ui,/priceActions\.appendChild\(specialButton\)/);
  assert.match(ui,/priceActions\.classList\.toggle\('hidden',!anyPriceAction\)/);
  assert.match(css,/#cartBottomSheet \.cart-price-actions\{/);
  assert.match(css,/#cartBottomSheet \.cart-price-actions\.hidden\{display:none!important;\}/);
  assert.match(shell,/src\/fixed-ui-runtime-6\.js[^"]*price-row=20261116/);
  assert.match(shell,/src\/fixed-ui-cart-spacing\.css[^"]*price-row=20261116/);
});
test('one customer-price action supports new order, draft edit and delivered edit',async()=>{
  const h=harness({matrix:[{customer_id:CUSTOMER,product_code:'SP001',price:200}]});
  // New order has no saved ID and no edit badge; selecting a customer is enough.
  h.ctx.editingOrderId=null;
  h.ctx.editingOrderSheet=null;
  h.ctx.editingOrderInSaleMode=false;
  assert.equal(h.eligible().mode,'new');
  await h.apply();
  assert.equal(h.ctx.cart.SP001.price,200);
  assert.match(h.toasts[0].msg,/Bán ngay hoặc Lưu tạm/);
  // Opening an existing draft must enable the same action.
  h.ctx.editingOrderId='DT249';
  h.ctx.editingOrderSheet='dontam';
  h.ctx.editingOrderInSaleMode=true;
  assert.equal(h.eligible().mode,'edit');
  assert.equal(h.eligible().sheet,'dontam');
  h.ctx.editingOrderId='DG370';
  h.ctx.editingOrderSheet='dongiao';
  assert.equal(h.eligible().mode,'edit');
  assert.equal(h.eligible().sheet,'dongiao');
  // Viewing a saved order is never a pricing edit.
  h.ctx.editingOrderInSaleMode=false;
  assert.equal(h.eligible(),null);
});
test('new order without customer and customer/PIN modes cannot apply prices',async()=>{
  const h=harness({matrix:[{customer_id:CUSTOMER,product_code:'SP001',price:200}]});
  h.ctx.editingOrderId=null;
  h.ctx.editingOrderSheet=null;
  h.ctx.editingOrderInSaleMode=false;
  h.ctx.selectedCustomer={id:'',name:'Chọn khách'};
  assert.equal(h.eligible(),null);
  await h.apply();
  assert.equal(h.ctx.cart.SP001.price,235);
  h.ctx.selectedCustomer={id:CUSTOMER,name:'C Hà Trang'};
  h.ctx.currentAuthRole='user';
  assert.equal(h.eligible(),null);
  h.ctx.currentAuthRole='admin';
  h.ctx.window.TAPHOA_PRODUCTION.getAccessMode=()=> 'public-link';
  assert.equal(h.eligible(),null);
});
test('price read from a previous new cart cannot overwrite a freshly reset cart',async()=>{
  let finish;
  const h=harness({provider:()=>new Promise(resolve=>{finish=resolve;})});
  h.ctx.editingOrderId=null;
  h.ctx.editingOrderSheet=null;
  h.ctx.editingOrderInSaleMode=false;
  const task=h.apply();
  h.ctx.cart={SP001:{name:'Sữa A',qty:10,price:235},
    SP002:{name:'Sữa B',qty:5,price:181}};
  finish([{customer_id:CUSTOMER,product_code:'SP001',price:120}]);
  await task;
  assert.equal(h.ctx.cart.SP001.price,235);
});
test('apply only exact customer product overrides; keep other prices and do not save order',async()=>{
  const h=harness({matrix:[{customer_id:CUSTOMER,product_code:'SP001',price:202.5}]});
  await h.apply();
  assert.equal(h.ctx.cart.SP001.price,202.5);
  assert.equal(h.ctx.cart.SP002.price,181);
  assert.equal(h.ctx.cartPriceRefreshInFlight,false);
  assert.equal(h.alerts.length,0);
  assert.match(h.toasts[0].msg,/Cập nhật đơn/);
});
test('no matched product leaves existing prices untouched',async()=>{
  const h=harness({matrix:[]});
  await h.apply();
  assert.equal(h.ctx.cart.SP001.price,235);
  assert.equal(h.ctx.cart.SP002.price,181);
  assert.match(h.toasts[0].msg,/Chưa có giá riêng đã lưu/);
});
test('foreign-customer or malformed override aborts all rows atomically',async()=>{
  const h=harness({matrix:[
    {customer_id:CUSTOMER,product_code:'SP001',price:190},
    {customer_id:OTHER,product_code:'SP002',price:1}
  ]});
  await h.apply();
  assert.equal(h.ctx.cart.SP001.price,235);
  assert.equal(h.ctx.cart.SP002.price,181);
  assert.match(h.alerts[0].title,/Không áp dụng/);
});
test('late response after switching orders cannot write to the next cart',async()=>{
  let finish;
  const h=harness({provider:()=>new Promise(resolve=>{finish=resolve;})});
  const task=h.apply();
  h.ctx.editingOrderId='DG371';
  finish([{customer_id:CUSTOMER,product_code:'SP001',price:120}]);
  await task;
  assert.equal(h.ctx.cart.SP001.price,235);
});
test('cart changed while waiting for price matrix cannot receive stale prices',async()=>{
  let finish;
  const h=harness({provider:()=>new Promise(resolve=>{finish=resolve;})});
  const task=h.apply();
  h.ctx.cart.SP002.qty=7; // same order/customer, but different cart snapshot
  finish([{customer_id:CUSTOMER,product_code:'SP001',price:120}]);
  await task;
  assert.equal(h.ctx.cart.SP001.price,235);
  assert.equal(h.ctx.cart.SP002.qty,7);
  assert.match(h.toasts[0].msg,/Giỏ hàng đã thay đổi/);
});
test('Admin RPC is read-only and role/session guarded; original general price and cost flow remains',()=>{
  assert.match(bridge,/async function customerSpecialPriceCount\(customerId\)/);
  assert.match(bridge,/async function customerSpecialPriceMatrix\(customerId,productCodes\)/);
  assert.match(bridge,/identity\?\.role!=='admin'/);
  assert.match(bridge,/taphoa_admin_customer_special_price_customers/);
  assert.match(bridge,/taphoa_admin_customer_special_price_matrix/);
  assert.match(bridge,/productionOwnerCurrent\(owner\)/);
  assert.doesNotMatch(bridge.slice(bridge.indexOf('async function customerSpecialPriceCount('),
    bridge.indexOf('async function stockCheckLinks(')),/taphoa_admin_customer_special_price_set/);
  assert.match(ui,/async function refreshEditedOrderPrices\(\)/);
  assert.match(ui,/window\.__TAPHOA_REPRICE_DRAFT_ID = isDraft \? orderId : null/);
  assert.match(ui,/cartPriceRefreshInFlight=true/);
  assert.match(ui,/specialButton\.classList\.toggle\('hidden',!canApplyCustomerPrice\)/);
  assert.match(css,/\.cart-price-special/);
  assert.match(shell,/src\/fixed-ui-runtime-6\.js[^"]*customer-price=20261116/);
});
