import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(path,'utf8');

test('mobile edit from order detail closes popup and keeps edit session',async()=>{
  const html=await read('index.html');
  const flow=await read('src/fixed-ui-mobile-edit-flow.js');
  const cart=await read('src/fixed-ui-runtime-6.js');

  assert.ok(html.indexOf('fixed-ui-runtime-13.js') < html.indexOf('fixed-ui-mobile-edit-flow.js'));
  assert.ok(html.indexOf('fixed-ui-mobile-edit-flow.js') < html.indexOf('fixed-ui-cart-share-v3.js'));

  assert.match(flow,/window\.editOrder\s*=\s*function\(orderId,sheetName\)/);
  assert.match(flow,/closeOrderDetailOverlayNow\(\)/);
  assert.match(flow,/loadOrderIntoCart\(orderId,sheetName,\{switchToSale:true,showSuccessToast:true\}\)/);
  assert.match(flow,/setTimeout\(\(\)=>window\.openCartMobile\(\),360\)/);
  assert.match(flow,/orderDetailModalWrapper/);
  assert.match(flow,/pointer-events-none','opacity-0','hidden/);

  const c0=cart.indexOf('function closeCartMobile() {');
  const c1=cart.indexOf('function openCustomerModal',c0);
  const close=c0>=0&&c1>c0?cart.slice(c0,c1):'';
  assert.doesNotMatch(close,/if \(editingOrderInSaleMode[\s\S]{0,160}cancelEditingOrder\(\)/);
  assert.match(close,/editingOrderId && editingOrderSheet && !editingOrderInSaleMode/);
  assert.match(close,/cart\s*=\s*\{\}/);
});

test('public customer deep-linked order opens read-only detail instead of cart flow',async()=>{
  const flow=await read('src/fixed-ui-mobile-edit-flow.js');

  assert.match(flow,/const originalClickOrder=typeof window\.clickOrder==='function' \? window\.clickOrder : null/);
  assert.match(flow,/new URLSearchParams\(window\.location\.search\)/);
  assert.match(flow,/params\.get\('kh'\)/);
  assert.match(flow,/params\.get\('don'\)/);
  assert.match(flow,/window\.showOrderDetailMobile\(orderId,sheetName\)/);
  assert.match(flow,/viewingOrderId=orderId/);
  assert.match(flow,/window\.activeViewingSheet=sheetName/);
});

test('delivered orders stay read-only for every role',async()=>{
  const flow=await read('src/fixed-ui-mobile-edit-flow.js');

  assert.match(flow,/const originalShowOrderDetailMobile=typeof window\.showOrderDetailMobile==='function' \? window\.showOrderDetailMobile : null/);
  assert.match(flow,/window\.showOrderDetailMobile=function\(orderId,sheetName\)/);
  assert.match(flow,/sheetName==='dongiao'/);
  assert.match(flow,/btnEdit\.style\.display='none'/);
  assert.match(flow,/if\(sheetName==='dongiao'\)/);
  assert.match(flow,/Đơn đã giao chỉ để xem/);
});
