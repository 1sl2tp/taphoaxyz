import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(path,'utf8');
const bridge=read('src/fixed-production-bridge.js');
const share=read('src/fixed-ui-cart-share-v3.js');
const portrait=read('src/fixed-ui-portrait-order.js');
const business=read('src/core/business.js');
const shell=read('index.html');
const saver=read('src/fixed-ui-image-save.js');
const sql=read('supabase/migrations/20261017173000_notify_only_delivered_orders.sql');
const manual=read('supabase/migrations/20261017165000_chat_manual_saved_order_sharing.sql');

test('draft create/edit/delete stays silent; delivered order notifies only after saved',()=>{
  assert.match(sql,/v_customer is not null and v_status='delivered' then/);
  assert.doesNotMatch(sql,/'Tạo đơn', null::bigint/);
  assert.match(sql,/':deliver'/);
  assert.match(sql,/':order-edit'/);
  assert.match(bridge,/async function saveOrder\(payload\)/);
  assert.match(bridge,/void attachOrderNoticePortrait\(result\?\.order\)/);
  assert.match(bridge,/manual===true&&state==='pending'/);
  assert.match(bridge,/\['done','delivered'\]\.includes\(state\)/);
});

test('saved DT images are labeled draft in manual send, detail and cart',()=>{
  assert.match(bridge,/isDraft:state==='pending',orderId:displayCode/);
  assert.match(share,/isDraft:\/\^DT\[0-9\]\+\$\/\.test\(orderCode\|\|meta\.orderId\)/);
  assert.match(share,/isDraft:meta\.isCreatingSaleDraft\|\|\/\^DT\[0-9\]\+\$\/\.test\(meta\.orderId\)/);
  assert.match(portrait,/orderId\?'Đơn tạm: '\+orderId:'Đơn đang tạo'/);
  assert.match(portrait,/'Mã đơn: '\+\(orderId\|\|'--'\)/);
});

test('manual Send only shares the stored order; it creates no extra order or debt',()=>{
  assert.match(share,/resolveDetailBackendOrderId\(\)/);
  assert.match(share,/comparableLines\(cartRows\)/);
  assert.match(share,/comparableLines\(saved\.items\|\|\[\]\)/);
  assert.match(share,/prod\.manualShareOrder\(orderId,crypto\.randomUUID\(\)\)/);
  assert.match(bridge,/attachOrderNoticePortrait\(response\.order,\{manual:true\}\)/);
  assert.match(business,/taphoa_manual_send_saved_order/);
  assert.match(manual,/v_order\.customer_account_id/);
  assert.match(manual,/recently_sent/);
  assert.doesNotMatch(manual,/\b(?:insert into|update|delete from)\s+public\.(?:taphoa_orders|taphoa_debt_ledger)\b/i);
});

test('web and installed PWA Save never confuse blob navigation with saving to Photos',()=>{
  assert.match(saver,/if\(isIosWebkit\(\)\)/);
  assert.match(saver,/mode:'save'/);
  assert.match(saver,/return 'preview'/);
  assert.match(shell,/fixed-ui-image-save\.js/);
  assert.match(shell,/fixed-ui-ios-share-fallback\.js/);
  assert.match(shell,/fixed-ui-runtime-12\.js/);
});

test('Copy image never silently downgrades to text',()=>{
  const st=share.indexOf('async function copyDetailOrderImage(');
  const en=share.indexOf("detailShareMenu.addEventListener('click'",st);
  assert.ok(st>=0&&en>st);
  const handler=share.slice(st,en);
  assert.match(handler,/Thiết bị chưa hỗ trợ sao chép ảnh/);
  assert.doesNotMatch(handler,/writeText|detailNativeShareText/);
  assert.match(share,/ClipboardItem\(\{'image\/png':png\}\)/);
});
