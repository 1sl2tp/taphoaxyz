import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(path,'utf8');

test('customer auth role is rendered with restricted user permissions',async()=>{
  const source=await read('src/fixed-production-overrides.js');
  assert.match(source,/role\s*===\s*['"]customer['"]\s*\?\s*['"]user['"]/);
});

test('cart keeps existing line position when quantity changes and only promotes a newly added item',async()=>{
  const runtime=await read('src/fixed-ui-runtime-6.js');
  const behavior=await read('src/fixed-ui-behavior.js');
  assert.match(behavior,/const\s+wasInCart\s*=\s*Boolean\(cart\[maSp\]\)/);
  assert.match(behavior,/if\s*\(!wasInCart\s*&&\s*change\s*>\s*0\)\s*cart\[maSp\]\.__lastTouched\s*=\s*\+\+__cartTouchSeq/);
  assert.doesNotMatch(behavior,/if\s*\(change\s*>\s*0\)\s*cart\[maSp\]\.__lastTouched\s*=\s*\+\+__cartTouchSeq/);
  assert.match(runtime,/__lastTouched/);
  assert.doesNotMatch(runtime,/String\(a\.name[^\n]*localeCompare/);
});

test('order lists are stabilized to backend newest-first order',async()=>{
  const behavior=await read('src/fixed-ui-behavior.js');
  assert.match(behavior,/function stabilizeNewestOrderCards/);
  assert.match(behavior,/stabilizeNewestOrderCards\('dontam'/);
  assert.match(behavior,/stabilizeNewestOrderCards\('dongiao'/);
});

test('customer selector displays username/code instead of internal uuid',async()=>{
  const bridge=await read('src/fixed-production-bridge.js');
  const runtime=await read('src/fixed-ui-runtime-6.js');
  assert.match(bridge,/username/);
  assert.match(runtime,/kh\[2\]\s*\|\|\s*kh\[0\]/);
});

test('selecting a sale customer immediately refreshes cart footer actions',async()=>{
  const runtime=await read('src/fixed-ui-runtime-6.js');
  assert.match(
    runtime,
    /selectedCustomer\s*=\s*\{\s*id,\s*name\s*\};[\s\S]{0,250}renderCartFooterActions\(\);[\s\S]{0,120}closeCustomerModal\(\);/
  );
});

test('order rows carry short display code and hidden backend uuid',async()=>{
  const bridge=await read('src/fixed-production-bridge.js');
  assert.match(bridge,/orderDisplayCode/);
  assert.match(bridge,/display_no/);
  assert.match(bridge,/backendOrderId/);
  const migration=await read('supabase/migrations/20260917010000_taphoa_short_order_display_codes.sql');
  assert.match(migration,/display_no/);
  assert.match(migration,/'DG'/);
  assert.match(migration,/'DT'/);
});

test('debt history hides reversals, keeps backend balance-after and opens order detail directly',async()=>{
  const bridge=await read('src/fixed-production-bridge.js');
  const behavior=await read('src/fixed-ui-behavior.js');
  assert.match(bridge,/balanceAfter/);
  assert.match(bridge,/entryType/);
  assert.match(behavior,/entryType\s*!==\s*['"]reversal['"]/);
  assert.match(behavior,/showOrderDetailMobile\(orderId,\s*sheetName\)/);
});

test('debt history hides both sides of a reversed order and recomputes visible running debt',async()=>{
  const behavior=await read('src/fixed-ui-behavior.js');
  assert.match(behavior,/const\s+reversedBackendOrderIds\s*=\s*new\s+Set/);
  assert.match(behavior,/h\.entryType\s*===\s*['"]reversal['"][\s\S]*h\.backendOrderId/);
  assert.match(behavior,/!reversedBackendOrderIds\.has\(String\(h\.backendOrderId\s*\|\|\s*['"]{2}\)\)/);
  assert.match(behavior,/let\s+displayRunningDebt\s*=\s*currentTotalDebt/);
  assert.match(behavior,/displayHistory\[i\]\.currentDebt\s*=\s*displayRunningDebt/);
  assert.match(behavior,/displayRunningDebt\s*-=\s*Number\(displayHistory\[i\]\.soTien\)/);
});

test('desktop debt detail uses the same left-workspace geometry as order detail',async()=>{
  const css=await read('src/fixed-ui-debt-popup.css');
  assert.match(css,/\.pc-mode\s+#customerDebtModalWrapper/);
  assert.match(css,/right:\s*480px\s*!important/);
  const html=await read('index.html');
  assert.match(html,/fixed-ui-debt-popup\.css/);
});

test('FIXED behavior runs before production bindings so Supabase wrappers stay outermost',async()=>{
  const html=await read('index.html');
  assert.ok(html.indexOf('fixed-ui-behavior.js') < html.indexOf('fixed-production-overrides.js'));
});


test('editing a pending order and selling now promotes the same backend order to delivered',async()=>{
  const source=await read('src/fixed-production-overrides.js');
  assert.match(source,/const\s+isPromotingDraft=Boolean\(editingOrderId\)&&sourceSheet===['"]dontam['"]&&tab===['"]dongiao['"]/);
  assert.match(source,/const\s+targetSheet=isPromotingDraft\?['"]dongiao['"]:sourceSheet/);
  assert.match(source,/backendOrderIdFor\(sourceSheet,editingOrderId\)/);
  assert.match(source,/const\s+status=targetSheet===['"]dongiao['"]\?['"]done['"]:['"]pending['"]/);
  assert.match(source,/Đã duyệt đơn sang Đã giao!/);
});


test('debt surplus is shown as a positive amount with surplus wording instead of negative debt',async()=>{
  const runtime=await read('src/fixed-ui-runtime-11.js');
  const behavior=await read('src/fixed-ui-behavior.js');
  const markup=await read('src/fixed-ui-markup-4.js');
  assert.match(runtime,/Math\.abs\(c\.debt\)\.toLocaleString\('vi-VN'\)/);
  assert.match(markup,/id=\\\"cDebtModalBalanceLabel\\\"/);
  assert.match(behavior,/currentTotalDebt\s*<\s*0[\s\S]{0,160}Số tiền còn dư/);
  assert.match(behavior,/Math\.abs\(currentTotalDebt\)\.toLocaleString\('vi-VN'\)/);
  assert.match(behavior,/runningDebt\s*<\s*0[\s\S]{0,160}Dư/);
  assert.doesNotMatch(behavior,/>Nợ \$\{Number\(h\.currentDebt/);
});


test('order opened from delivered or pending tab is preview-only until switching to sales',async()=>{
  const runtime=await read('src/fixed-ui-runtime-5.js');
  assert.match(runtime,/const\s+isOrderPreview\s*=\s*hasSelectedOrder\s*&&\s*\(isOrderTab \|\| isDebtOrderPreview\)/);
  const p0=runtime.indexOf('if (isOrderPreview) {');
  const p1=runtime.indexOf('// Đã giao:',p0);
  const preview=p0>=0&&p1>p0?runtime.slice(p0,p1):'';
  assert.match(preview,/requestDeleteEditingOrder\(\)/);
  assert.match(preview,/Xóa đơn/);
  assert.match(preview,/goToBanHangForEditing\(\)/);
  assert.match(preview,/> Sửa/);
  assert.doesNotMatch(preview,/Cập nhật|Lưu đã giao|clearEditingOrderContent\(\)/);
});


test('switching an opened order to sales enables its source-specific edit actions',async()=>{
  const runtime=await read('src/fixed-ui-runtime-5.js');
  const g0=runtime.indexOf('function goToBanHangForEditing() {');
  const g1=runtime.indexOf('function renderCartFooterActions()',g0);
  const go=g0>=0&&g1>g0?runtime.slice(g0,g1):'';
  assert.match(go,/editingOrderInSaleMode\s*=\s*true/);
  assert.match(go,/switchTab\(['"]tab-ban-hang['"]/);
  assert.match(go,/renderCartUI\(\)/);
  const d0=runtime.indexOf('if (isDeliveredOrderCart) {');
  const d1=runtime.indexOf('// Đơn tạm:',d0);
  const delivered=d0>=0&&d1>d0?runtime.slice(d0,d1):'';
  assert.match(delivered,/clearEditingOrderContent\(\)/);
  assert.match(delivered,/Xóa đơn/);
  assert.match(delivered,/Cập nhật/);
  const p0=runtime.indexOf('if (isPendingOrderCart) {');
  const p1=runtime.indexOf('// Ở tab đơn',p0);
  const pending=p0>=0&&p1>p0?runtime.slice(p0,p1):'';
  assert.match(pending,/clearEditingOrderContent\(\)/);
  assert.match(pending,/Xóa đơn/);
  assert.match(pending,/Cập nhật/);
  assert.match(pending,/Lưu đã giao/);
});


test('order-tab cart quantity is readonly until edit mode in sales',async()=>{
  const runtime=await read('src/fixed-ui-runtime-6.js');
  assert.match(runtime,/const\s+isOrderPreview\s*=\s*!!editingOrderId\s*&&\s*!!editingOrderSheet/);
  assert.match(runtime,/activeTabId\s*===\s*['"]tab-da-giao['"]/);
  assert.match(runtime,/activeTabId\s*===\s*['"]tab-don-tam['"]/);
  assert.match(runtime,/!editingOrderInSaleMode/);
  assert.match(runtime,/cart-qty-readonly/);
});


test('choosing a different customer clears old input and loaded-order identity',async()=>{
  const runtime=await read('src/fixed-ui-runtime-6.js');
  const s0=runtime.indexOf('function selectCustomer(id, name) {');
  const s1=runtime.indexOf('// ==========================================',s0);
  const select=s0>=0&&s1>s0?runtime.slice(s0,s1):'';
  assert.match(select,/isDifferentCustomer/);
  assert.match(select,/cart\s*=\s*\{\}/);
  assert.match(select,/editingOrderId\s*=\s*null/);
  assert.match(select,/editingOrderSheet\s*=\s*null/);
  assert.match(select,/editingOrderInSaleMode\s*=\s*false/);
  assert.match(select,/viewingOrderId\s*=\s*null/);
  assert.match(select,/renderProductList\(\)/);
  assert.match(select,/renderCartUI\(\)/);
});


test('loaded order cart shows the existing share action beside close',async()=>{
  const markup=await read('src/fixed-ui-markup-3.js');
  const runtime=await read('src/fixed-ui-runtime-5.js');
  assert.match(markup,/cartShareOrderBtn[\s\S]{0,260}shareCartOrderImage\(\)/);
  assert.match(markup,/cartShareOrderBtn[\s\S]{0,700}closeCartMobile\(\)/);
  assert.match(runtime,/isCreatingSaleDraft[\s\S]{0,320}cartShareOrderBtn[\s\S]{0,320}classList\.toggle\(['"]hidden['"],\s*!\(hasLoadedOrder \|\| isCreatingSaleDraft\)\)/);
});


test('cart share builds image from current cart values instead of stale detail DOM',async()=>{
  const runtime=await read('src/fixed-ui-runtime-13.js');
  assert.match(runtime,/async function shareCartOrderImage\(\)/);
  assert.match(runtime,/Object\.entries\(cart \|\| \{\}\)/);
  assert.match(runtime,/cloneItems\.innerHTML = rowsHtml/);
  assert.match(runtime,/detailLineCountDisplay[\s\S]{0,300}cartEntries\.length/);
  assert.match(runtime,/detailTotalQtyDisplay[\s\S]{0,300}totalQty/);
  assert.match(runtime,/detailModalTotal[\s\S]{0,300}totalPrice\.toLocaleString\('vi-VN'\)/);
  assert.match(runtime,/codeEl\.textContent = 'Mã đơn: ' \+ \(editingOrderId \|\| '--'\)/);
});


test('new sale cart exposes clear, save-draft, and save-delivered',async()=>{
  const runtime=await read('src/fixed-ui-runtime-5.js');
  assert.match(runtime,/clearCart\(\)[\s\S]{0,700}> Xóa/);
  assert.match(runtime,/dayToanBoGioHang\(\\?'dontam\\?'\)[\s\S]{0,700}Lưu tạm/);
  assert.match(runtime,/dayToanBoGioHang\(\\?'dongiao\\?'\)[\s\S]{0,700}Lưu đã giao/);
});


