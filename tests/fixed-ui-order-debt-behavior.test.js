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


test('order preview actions are minimal by source state',async()=>{
  const runtime=await read('src/fixed-ui-runtime-5.js');
  const p0=runtime.indexOf('if (isOrderPreview) {');
  const p1=runtime.indexOf('// Đã giao',p0);
  const preview=p0>=0&&p1>p0?runtime.slice(p0,p1):'';
  assert.match(preview,/> Xóa/);
  assert.match(preview,/> Sửa/);
  assert.match(preview,/isPendingOrderCart[\s\S]{0,700}Duyệt/);
  assert.doesNotMatch(preview,/Xóa đơn|Cập nhật đơn|Đặt|Bán/);
});


test('editing delivered order shows cancel and update-order only',async()=>{
  const runtime=await read('src/fixed-ui-runtime-5.js');
  const d0=runtime.indexOf('if (isDeliveredOrderCart) {');
  const d1=runtime.indexOf('// Đơn tạm',d0);
  const block=d0>=0&&d1>d0?runtime.slice(d0,d1):'';
  assert.match(block,/Hủy/);
  assert.match(block,/Cập nhật đơn/);
  assert.doesNotMatch(block,/Xóa hàng|Xóa đơn|Duyệt|Đặt|Bán/);
});


test('editing pending order shows cancel and update-order only',async()=>{
  const runtime=await read('src/fixed-ui-runtime-5.js');
  const p0=runtime.indexOf('if (isPendingOrderCart) {');
  const p1=runtime.indexOf('// Ở tab đơn',p0);
  const block=p0>=0&&p1>p0?runtime.slice(p0,p1):'';
  assert.match(block,/Hủy/);
  assert.match(block,/Cập nhật đơn/);
  assert.doesNotMatch(block,/Xóa hàng|Xóa đơn|Duyệt|Đặt|Bán/);
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


test('new sale cart shows delete, order, sell',async()=>{
  const runtime=await read('src/fixed-ui-runtime-5.js');
  const n0=runtime.lastIndexOf('owner.innerHTML = \`');
  const block=n0>=0?runtime.slice(n0):'';
  assert.match(block,/clearCart\(\)/);
  assert.match(block,/> Xóa/);
  assert.match(block,/> Đặt/);
  assert.match(block,/> Bán/);
  assert.doesNotMatch(block,/Xóa đơn|Cập nhật đơn|Duyệt|Lưu tạm|Đã giao/);
});
test('cancel edit clears loaded order state and returns to the source tab',async()=>{
  const runtime=await read('src/fixed-ui-runtime-5.js');
  const c0=runtime.indexOf('function cancelEditingOrder() {');
  const c1=runtime.indexOf('function renderCartFooterActions()',c0);
  const cancel=c0>=0&&c1>c0?runtime.slice(c0,c1):'';
  assert.match(cancel,/cart\s*=\s*\{\}/);
  assert.match(cancel,/editingOrderId\s*=\s*null/);
  assert.match(cancel,/editingOrderSheet\s*=\s*null/);
  assert.match(cancel,/editingOrderInSaleMode\s*=\s*false/);
  assert.match(cancel,/viewingOrderId\s*=\s*null/);
  assert.match(cancel,/switchTab\(targetTabId, targetTabBtn\)/);
  assert.doesNotMatch(cancel,/loadOrderIntoCart\(/);
  assert.doesNotMatch(cancel,/openCartMobile\(/);
});


test('closing cart cancels edit or clears preview instead of preserving the last opened order',async()=>{
  const runtime=await read('src/fixed-ui-runtime-6.js');
  const c0=runtime.indexOf('function closeCartMobile() {');
  const c1=runtime.indexOf('function openCustomerModal',c0);
  const close=c0>=0&&c1>c0?runtime.slice(c0,c1):'';
  assert.match(close,/editingOrderInSaleMode[\s\S]{0,180}cancelEditingOrder\(\)/);
  assert.match(close,/editingOrderId[\s\S]{0,500}cart\s*=\s*\{\}/);
  assert.match(close,/editingOrderId\s*=\s*null/);
  assert.match(close,/editingOrderSheet\s*=\s*null/);
  assert.match(close,/viewingOrderId\s*=\s*null/);
});


test('delete-order UI uses only common delete wording',async()=>{
  const source=await read('src/fixed-production-overrides.js');
  const s0=source.indexOf('requestDeleteOrder=function');
  const s1=source.indexOf('const fixedOpenCustomerDebtModal',s0);
  const block=s0>=0&&s1>s0?source.slice(s0,s1):'';
  assert.match(block,/Xóa đơn/);
  assert.match(block,/Đang xóa đơn/);
  assert.match(block,/Đã xóa đơn/);
  assert.doesNotMatch(block,/Hoàn|hoàn/);
});


test('switching away from an order preview clears the preview unless edit mode is active',async()=>{
  const runtime=await read('src/fixed-ui-runtime-2.js');
  const s0=runtime.indexOf('function clearOrderPreviewOnTabSwitch(tabId) {');
  const s1=runtime.indexOf('function switchTab(tabId, element) {',s0);
  const clear=s0>=0&&s1>s0?runtime.slice(s0,s1):'';
  assert.match(clear,/!editingOrderId \|\| !editingOrderSheet \|\| editingOrderInSaleMode/);
  assert.match(clear,/tab-da-giao/);
  assert.match(clear,/tab-don-tam/);
  assert.match(clear,/tab-cong-no/);
  assert.match(clear,/tabId !== activeTabId/);
  assert.match(clear,/cart\s*=\s*\{\}/);
  assert.match(clear,/editingOrderId\s*=\s*null/);
  assert.match(clear,/editingOrderSheet\s*=\s*null/);
  assert.match(clear,/viewingOrderId\s*=\s*null/);
  assert.match(clear,/selectedCustomer\s*=\s*\{ id: "", name: "Chọn khách" \}/);

  const sw0=runtime.indexOf('function switchTab(tabId, element) {');
  const sw1=runtime.indexOf('function resolveAutoMode()',sw0);
  const sw=sw0>=0&&sw1>sw0?runtime.slice(sw0,sw1):'';
  assert.match(sw,/clearOrderPreviewOnTabSwitch\(tabId\)/);
});


test('order list cards keep customer, order summary and product hint compact',async()=>{
  const [helper,pending,delivered]=await Promise.all([
    read('src/fixed-ui-runtime-9.js'),
    read('src/fixed-ui-runtime-10.js'),
    read('src/fixed-ui-runtime-11.js')
  ]);

  assert.ok(pending.includes('${o.tenKh}</p>'));
  assert.ok(delivered.includes('${o.tenKh}</p>'));
  assert.ok(!pending.includes('${o.tenKh} - <span'));
  assert.ok(!delivered.includes('${o.tenKh} - <span'));

  assert.ok(pending.includes('${shortTime} · ${k} · ${o.countSp} mã · ${o.tongSl} SP'));
  assert.ok(delivered.includes('${shortTime} · ${k} · ${o.countSp} mã · ${o.tongSl} SP'));
  assert.ok(!pending.includes('text-[#ea580c] font-extrabold">${k}'));
  assert.ok(!delivered.includes('text-success font-extrabold">${k}'));

  assert.match(helper,/function buildOrderProductPreview\(items, limit = 2\)/);
  assert.match(helper,/\.sort\(\(a, b\) => \(b\.qty - a\.qty\)/);
  assert.match(helper,/\.map\(item => `\$\{item\.name\}\$\{item\.qty > 0 \? ` × \$\{item\.qty\.toLocaleString\('vi-VN'\)\}` : ''\}`\)/);
  assert.match(helper,/return \{[\s\S]*items: visible,[\s\S]*remaining: Math\.max\(0, rows\.length - visible\.length\)[\s\S]*\}/);
  assert.match(pending,/items: \[\]/);
  assert.match(delivered,/items: \[\]/);
  assert.match(pending,/items\.push\(\{ code: maSp, name: spInfo\.ten \|\| maSp, qty: sl \}\)/);
  assert.match(delivered,/items\.push\(\{ code: maSp, name: spInfo\.ten \|\| maSp, qty: sl \}\)/);
  assert.match(pending,/buildOrderProductPreview\(o\.items, 2\)/);
  assert.match(delivered,/buildOrderProductPreview\(o\.items, 2\)/);
  assert.match(pending,/order-product-text-row/);
  assert.match(delivered,/order-product-text-row/);
  assert.match(pending,/class="order-product-text"/);
  assert.match(delivered,/class="order-product-text"/);
  assert.match(pending,/productPreview\.items\.map\(item =>/);
  assert.match(delivered,/productPreview\.items\.map\(item =>/);
  assert.match(pending,/productPreview\.remaining \? `<span class="order-product-more">\+\$\{productPreview\.remaining\} sp<\/span>`/);
  assert.match(delivered,/productPreview\.remaining \? `<span class="order-product-more">\+\$\{productPreview\.remaining\} sp<\/span>`/);
  assert.doesNotMatch(pending,/note-chip-bullet/);
  assert.doesNotMatch(delivered,/note-chip-bullet/);
  assert.match(pending,/order-card-title-row[\s\S]{0,220}\$\{o\.tenKh\}[\s\S]{0,220}order-card-total[\s\S]{0,160}\$\{o\.tongThu\.toLocaleString\('vi-VN'\)\}/);
  assert.match(delivered,/order-card-title-row[\s\S]{0,220}\$\{o\.tenKh\}[\s\S]{0,220}order-card-total[\s\S]{0,160}\$\{o\.tongThu\.toLocaleString\('vi-VN'\)\}/);
  assert.match(pending,/order-card-meta-row[\s\S]{0,260}\$\{shortTime\}[\s\S]{0,260}profit-only/);
  assert.match(delivered,/order-card-meta-row[\s\S]{0,260}\$\{shortTime\}[\s\S]{0,260}profit-only/);
});




test('order suggestions are plain black normal-weight text with no colored background',async()=>{
  const [pending,delivered,css]=await Promise.all([
    read('src/fixed-ui-runtime-10.js'),
    read('src/fixed-ui-runtime-11.js'),
    read('src/fixed-ui-source-4.css')
  ]);
  assert.match(css,/\.order-product-text-row\{/);
  assert.match(css,/\.order-product-text\{[\s\S]*color:#111827;[\s\S]*font-size:11px;[\s\S]*font-weight:400;/);
  assert.match(css,/\.order-product-more\{[\s\S]*font-size:11px;[\s\S]*font-weight:400;[\s\S]*color:#94a3b8;/);
  assert.match(pending,/order-rank-dot order-rank-dot-pending/);
  assert.match(delivered,/order-rank-dot order-rank-dot-delivered/);
  assert.match(css,/\.order-rank-dot-pending\{[\s\S]*background:#fffaf3;[\s\S]*color:#d97706;/);
  assert.match(css,/\.order-rank-dot-delivered\{[\s\S]*background:#f5faf6;[\s\S]*color:#2f855a;/);
  assert.doesNotMatch(css,/\.order-product-chip-pending\{/);
  assert.doesNotMatch(css,/\.order-product-chip-delivered\{/);
  assert.doesNotMatch(pending,/order-product-chip|note-chip-bullet/);
  assert.doesNotMatch(delivered,/order-product-chip|note-chip-bullet/);
});

test('order card reserves full third row for product suggestions',async()=>{
  const css=await read('src/fixed-ui-source-4.css');
  assert.match(css,/\.order-card-title-row,[\s\S]*\.order-card-meta-row\{/);
  assert.match(css,/grid-template-columns:minmax\(0,1fr\) auto/);
  assert.match(css,/\.order-card-total,[\s\S]*\.profit-only[\s\S]*white-space:nowrap/);
});

test('order item notes survive product edit cart save reload detail and share',async()=>{
  const [runtime4,runtime5,runtime6,runtime12,runtime13,bridge,overrides,business,share]=await Promise.all([
    read('src/fixed-ui-runtime-4.js'),
    read('src/fixed-ui-runtime-5.js'),
    read('src/fixed-ui-runtime-6.js'),
    read('src/fixed-ui-runtime-12.js'),
    read('src/fixed-ui-runtime-13.js'),
    read('src/fixed-production-bridge.js'),
    read('src/fixed-production-overrides.js'),
    read('src/core/business.js'),
    read('src/fixed-ui-cart-share-v3.js')
  ]);

  assert.ok(runtime4.includes('data-product-note-wrap="${escapeProductEditorValue(maSp)}"'));
  assert.ok(runtime4.includes('data-line-note-id="${escapeProductEditorValue(maSp)}"'));
  assert.ok(runtime4.includes('placeholder="Ghi chú màu / loại..."'));

  assert.match(runtime5,/function previewProductLineNote\(input\)/);
  assert.match(runtime5,/cart\[maSp\]\.note = String\(input\.value \|\| ''\)/);
  assert.match(runtime5,/const existing = cart\[maSp\] \|\| \{\};[\s\S]*?note: String\(existing\.note \|\| ''\)/);
  assert.match(runtime5,/function openCartLineNoteEditor\(button\)/);
  assert.match(runtime5,/function previewCartLineNote\(input\)/);
  assert.match(runtime5,/function commitCartLineNoteEditor\(input\)/);
  assert.match(runtime6,/data-cart-note-id=/);
  assert.match(runtime6,/data-cart-note-input-id=/);

  assert.match(overrides,/ghiChu:String\(item\.note\|\|''\)/);
  assert.match(overrides,/async function savePendingOrderItemNoteDirect\(orderId,productCode,note\)/);
  assert.match(overrides,/const detail=await backend\(\)\.orderDetail\(backendId\)/);
  assert.match(overrides,/isTarget\?String\(note\|\|''\):String\(\(item\?\.ghiChu\?\?item\?\.note\)\|\|''\)/);
  assert.match(business,/note:String\(item\.ghiChu\|\|item\.note\|\|''\)/);

  assert.match(bridge,/\['Mã đơn','Mã KH','Mã SP','SL','Đơn giá','Thành tiền','Thời gian','Mã đơn DB','Số đơn','Ghi chú'\]/);
  assert.match(bridge,/first\(item,\['ghiChu','note'\],''\)/);
  assert.match(runtime12,/let note = String\(r\[9\] \|\| ''\)/);

  assert.match(runtime13,/let note = String\(r\[9\] \|\| ''\)\.trim\(\)/);
  assert.match(runtime13,/class="order-line-note/);
  assert.match(share,/String\(item\?\.note \|\| ''\)\.trim\(\)/);
});


test('source summary keeps one product row and customer-owned editable notes',async()=>{
  const [runtime8,runtime9]=await Promise.all([
    read('src/fixed-ui-runtime-8.js'),
    read('src/fixed-ui-runtime-9.js')
  ]);

  assert.match(runtime8,/backendOrderId: String\(r\[7\] \|\| ''\)/);
  assert.match(runtime8,/note: String\(r\[9\] \|\| ''\)\.trim\(\)/);
  assert.match(runtime8,/const productKey = String\(row\.productCode \|\| ''\)\.trim\(\) \|\| normalizeSourceGroupName\(row\.productName\)/);
  assert.match(runtime8,/noteEntries: \[\]/);
  assert.match(runtime8,/grouped\.noteEntries\.push\(\{/);
  assert.ok(!runtime8.includes("productKey + '||' + noteKey"));

  assert.match(runtime9,/function sourceLineNoteEditorHtml\(row/);
  assert.match(runtime9,/function openSourceLineNoteEditor\(button\)/);
  assert.match(runtime9,/async function commitSourceLineNoteEditor\(input\)/);
  assert.match(runtime9,/savePendingOrderItemNoteDirect/);
  assert.match(runtime9,/row\.noteEntries \|\| \[\]/);
  assert.doesNotMatch(runtime9,/showBuyer: true/);
  assert.match(runtime9,/filter\(entry => String\(entry\?\.note \|\| ''\)\.trim\(\)\)/);
  assert.match(runtime9,/if \(!notes\.length\) return ''/);
  assert.doesNotMatch(runtime9,/Ghi chú \$\{noteIndex \+ 1\}/);
  assert.match(runtime9,/notes\.map\(entry => sourceLineNoteEditorHtml\(entry\)\)\.join\(''\)/);
  assert.match(runtime9,/const chip = `<span class="note-chip">/);
  assert.match(runtime9,/note-chip-bullet">•<\/span>/);
  assert.match(runtime9,/if \(!note\) return ''/);
  assert.match(runtime9,/TỔNG · \$\{rows\.length\} mã/);
  assert.match(runtime9,/source-detail-grid source-detail-grid-detail source-detail-data-row/);
  assert.match(runtime9,/Tên hàng<\/div><div>Tên KH<\/div><div class="text-right">SL/);
  assert.match(runtime9,/source-detail-product-cell/);
  assert.match(runtime9,/source-detail-buyer-cell/);
  assert.match(runtime9,/source-detail-product-cell[\s\S]{0,260}source-detail-name[\s\S]{0,220}sourceLineNoteEditorHtml\(row\)[\s\S]{0,220}source-detail-buyer-cell/);
  assert.doesNotMatch(runtime9,/source-detail-buyer-cell[\s\S]{0,260}sourceLineNoteEditorHtml\(row\)/);
  assert.doesNotMatch(runtime9,/Tên SP \/ Người mua/);
});

test('all visible notes use one bullet and one independent chip per note',async()=>{
  const [runtime9,css]=await Promise.all([
    read('src/fixed-ui-runtime-9.js'),
    read('src/fixed-ui-source-4.css')
  ]);
  assert.match(runtime9,/note-chip-row source-detail-note/);
  assert.match(runtime9,/note-chip-bullet/);
  assert.match(runtime9,/class="note-chip"/);
  assert.doesNotMatch(runtime9,/Ghi chú 1|Ghi chú 2/);
  assert.match(css,/\.note-chip-row\{/);
  assert.match(css,/\.note-chip-bullet\{/);
  assert.match(css,/\.note-chip\{/);
  assert.match(css,/background:#f1f3f5/);
});

test('source detail mobile grid keeps product buyer and quantity in separate columns',async()=>{
  const css=await read('src/fixed-ui-source-4.css');
  assert.match(css,/\.source-detail-grid-detail\{/);
  assert.match(css,/grid-template-columns:24px minmax\(0,1\.45fr\) minmax\(78px,\.8fr\) 42px/);
  assert.match(css,/\.source-detail-grid-detail \.source-detail-qty,[\s\S]*grid-column:4 \/ 5/);
  assert.match(css,/\.source-detail-grid-detail \.source-detail-total-label\{grid-column:1 \/ 4;\}/);
  assert.match(css,/\.source-detail-note\{white-space:normal;overflow-wrap:anywhere/);
});

test('login screen matches the outlined welcome layout',async()=>{
  const markup=await read('src/fixed-ui-markup-1.js');
  const css=await read('src/fixed-ui-source-4.css');
  const s0=markup.indexOf('id=\\\"loginScreen\\\"');
  const s1=markup.indexOf('id=\\\"appContainer\\\"',s0);
  const login=s0>=0&&s1>s0?markup.slice(s0,s1):'';

  assert.match(login,/Chào mừng trở lại/);
  assert.match(login,/login-outline-field/);
  assert.match(login,/login-outline-legend[^>]*for=\\\"loginUsername\\\"[^>]*>Tài khoản<\/label>/);
  assert.match(login,/login-outline-legend[^>]*for=\\\"loginPassword\\\"[^>]*>Mật khẩu<\/label>/);
  assert.match(login,/id=\\\"loginPasswordToggle\\\"/);
  assert.ok(login.includes('bg-[#171717] text-white font-bold text-[15px]'));
  assert.ok(login.includes('>Đăng nhập</button>'));
  assert.doesNotMatch(login,/placeholder=\\\"|Đăng nhập để tiếp tục bán hàng|ph-storefront/);
  assert.match(login,/autocomplete=\\\"off\\\"/);
  assert.match(login,/autocomplete=\\\"new-password\\\"/);

  assert.match(css,/LOGIN OUTLINE FIELD/);
  assert.match(css,/\.login-outline-field:focus-within/);
  assert.match(css,/#loginScreen input:-webkit-autofill/);
});
