import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const share=readFileSync('src/fixed-ui-cart-share-v3.js','utf8');
const bridge=readFileSync('src/fixed-production-bridge.js','utf8');
const business=readFileSync('src/core/business.js','utf8');
const sql=readFileSync('supabase/migrations/20261017165000_chat_manual_saved_order_sharing.sql','utf8');
const shell=readFileSync('index.html','utf8');

test('saved-order share uses exactly three explicit actions, not an automatic native share',()=>{
  const actions=[...share.matchAll(/data-order-share-action="(send|save|copy)"/g)].map(m=>m[1]);
  assert.deepEqual(actions,['send','save','copy']);
  assert.match(share,/Gửi đơn/);
  assert.match(share,/>Lưu<\/button>/);
  assert.match(share,/>Sao chép<\/button>/);
  assert.match(share,/detailShareBtn\.onclick=\(\)=>\{/);
  assert.match(share,/showDetailShareMenu\(\)/);
  assert.match(share,/resolveDetailBackendOrderId\(\)/);
  assert.match(share,/ids\.size===1/);
  assert.match(share,/prod\.manualShareOrder\(orderId,crypto\.randomUUID\(\)\)/);
  assert.match(share,/saveDetailOrderImage\(\)/);
  assert.match(share,/copyDetailOrderImage\(\)/);
  assert.match(share,/ClipboardItem\(\{'image\/png':png\}\)/);
  assert.match(shell,/detail-share-actions=20261017/);
});

test('manual share changes no orders or debt and attaches media to Chat notice',()=>{
  assert.match(business,/taphoa_manual_send_saved_order/);
  assert.match(bridge,/async function manualShareOrder\(orderId,requestId\)/);
  assert.match(bridge,/business\.manualShareOrder\(id,nonce\)/);
  assert.match(bridge,/attachOrderNoticePortrait\(response\.order\)/);
  assert.match(bridge,/image_attached:imageAttached===true/);
  assert.match(sql,/taphoa_role'<>'admin'/);
  assert.match(sql,/status IN \('pending','delivered'\)/);
  assert.match(sql,/v_order\.customer_account_id/);
  assert.match(sql,/v_client_id:='manual:order:'/);
  assert.match(sql,/20 seconds/);
  assert.match(sql,/taphoa_chat_notify_customer/);
  assert.match(sql,/manual:order:%/);
  assert.doesNotMatch(sql,/\b(insert into|update|delete from)\s+public\.(?:taphoa_orders|taphoa_order_items|taphoa_debt_ledger)\b/i);
});
