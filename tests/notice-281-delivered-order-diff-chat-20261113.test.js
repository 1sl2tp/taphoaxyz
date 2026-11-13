import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration=fs.readFileSync(
 'supabase/migrations/20261113005500_notice281_delivered_edit_exact_diff_chat.sql','utf8');

test('NOTICE-281: a delivered-order edit preserves old → new details in Chat',()=>{
 assert.match(migration,/taphoa_chat_order_receipt\(v_order_json,'Cập nhật',null\)/);
 assert.match(migration,/✏️ Chi tiết sửa:/);
 assert.match(migration,/replace\(v_body,E'/);
 assert.match(migration,/v_body := public\.taphoa_chat_order_receipt/);
 assert.match(migration,/public\.taphoa_chat_order_diff/);
 assert.match(migration,/✏️ Thay đổi:/);
 assert.match(migration,/Tổng: /);
 assert.match(migration,/v_job\.client_id,v_send_body\);/);
 assert.match(migration,/ORDER BY c\.created_at DESC OFFSET 1 LIMIT 1/);
 assert.match(migration,/c\.result->'order'->>'id'=v_job\.order_id::text/);
 assert.match(migration,/position\('✏️ Chi tiết sửa:' IN v_send_body\)=0/);
 assert.match(migration,/v_latest_snapshot IS NOT NULL/);
});
test('NOTICE-281: no early Chat send or order/finance mutation',()=>{
 assert.match(migration,/taphoa_order_edit_quiet_dispatch/);
 assert.match(migration,/v_local_time<time ''08:05''/);
 assert.doesNotMatch(migration,/\b(?:INSERT INTO|UPDATE|DELETE FROM)\s+(?:public\.)?(?:v21_messages|taphoa_orders|taphoa_debt_ledger|taphoa_order_items)\b/i);
 assert.doesNotMatch(migration,/\bcron\.schedule\b/);
 assert.doesNotMatch(migration,/\bhttp_post\b|\bnet\.http\b/);
});
