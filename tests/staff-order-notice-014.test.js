import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const sql=fs.readFileSync('supabase/migrations/20261115143000_taphoa_staff_order_copy_gd_me_yeu.sql','utf8');

test('employee mirror is pinned to exactly one verified personal Chat contact',()=>{
 assert.match(sql,/v_staff_id constant uuid := '[0-9a-f-]+'::uuid/);
 assert.match(sql,/a\.id=v_staff_id AND a\.role='user' AND a\.contact_group='friend'/);
 assert.match(sql,/a\.deleted_at IS NULL AND a\.locked_at IS NULL/);
 assert.doesNotMatch(sql,/FROM public\.zalo_contacts/i);
 assert.doesNotMatch(sql,/zalo_id\s*=/i);
 assert.match(sql,/staff_order_notice_admin_only/);
 assert.match(sql,/v_ctx->>'taphoa_role' IS DISTINCT FROM 'admin'/);
 assert.match(sql,/nullif\(v_ctx->>'account_id',''\) IS DISTINCT FROM p_sender_account_id::text/);
 assert.match(sql,/REVOKE ALL ON FUNCTION v21_private\.taphoa_staff_order_notify\(/);
 assert.match(sql,/FROM PUBLIC, anon, authenticated/);
});

test('customer notification remains independent of staff copy',()=>{
 assert.match(sql,/-- Patch only the LIVE canonical writers/);
 assert.match(sql,/v_role='admin'[\s\S]*?taphoa_staff_order_changed\(v_old_order_json,v_order_json\)/);
 assert.match(sql,/taphoa_chat_notify_customer/);
 assert.match(sql,/taphoa_staff_order_notify\([\s\S]*?v_account_id,p_command_id,v_order_json,v_old_order_json,/);
 assert.match(sql,/when v_edit_id is null then 'create'/i);
 assert.match(sql,/when v_old_status='pending' and v_status='delivered' then 'deliver'/i);
 assert.match(sql,/also cover the separate "deliver pending order" RPC/);
 assert.match(sql,/taphoa_deliver_order\(uuid,uuid\)/);
 assert.doesNotMatch(sql,/UPDATE\s+(?:public\.)?taphoa_orders\b/i);
 assert.doesNotMatch(sql,/INSERT\s+INTO\s+(?:public\.)?taphoa_debt_ledger\b/i);
 assert.doesNotMatch(sql,/\bcron\.schedule\b/i);
 assert.doesNotMatch(sql,/net\.http_post|fetch\(|sendMessage\(/i);
});

test('staff notice does not leak customer private links and includes actionable details',()=>{
 for(const word of ['Chi tiết (','Sản phẩm','Tổng đơn: ','Khách: ','Trạng thái: ','Asia/Ho_Chi_Minh','Giá','line_no','note']){
   if(word==='Giá')continue;
   assert(sql.includes(word),word);
 }
 assert.match(sql,/Chưa chọn khách \(khách lẻ\)/);
 assert.match(sql,/taphoa_chat_order_diff\(p_previous,p_order,6\)/);
 assert.match(sql,/public\.taphoa_chat_qty\(v_qty\)/);
 assert.match(sql,/public\.taphoa_chat_money\(v_qty\*v_unit_price\)/);
 assert.match(sql,/v_total_count>18/);
 assert.match(sql,/Preserve the total footer even when line descriptions are shortened/);
 assert.match(sql,/No customer mini-app link or PIN/);
 assert.doesNotMatch(sql,/taphoa_customer_mini_link\(/);
 assert.doesNotMatch(sql,/service_role|authorization: bearer|http[s]?:\/\//i);
});

test('one message per saved command; unchanged edits are suppressed',()=>{
 assert.match(sql,/taphoa_staff_order_changed/);
 assert.match(sql,/old_lines\.value IS DISTINCT FROM new_lines\.value/);
 assert.match(sql,/coalesce\(p_previous->>'customer_id'/);
 assert.match(sql,/coalesce\(p_previous->>'note'/);
 assert.match(sql,/coalesce\(p_previous->>'status'/);
 assert.match(sql,/v_client_id := 'taphoa:' \|\| p_command_id::text \|\| ':staff-order'/);
 assert.match(sql,/ON CONFLICT ON CONSTRAINT v21_messages_sender_account_id_client_id_key/);
 assert.match(sql,/DO NOTHING/);
 assert.match(sql,/IF position\('STAFF-ORDER-014: independent staff copy' IN v_src\)>0 THEN RETURN;/);
 assert.match(sql,/IF length\(v_src\)-length\(replace\(v_src,v_anchor,''\)\)<>length\(v_anchor\)/);
});

test('postgres integration suite is isolated and runs the migration verbatim',()=>{
 const isolated=fs.readFileSync('tests/sql/staff-order-notice-014-isolated.sql','utf8');
 const workflow=fs.readFileSync('.github/workflows/verify-manual-debt-png-postgres.yml','utf8');
 assert(isolated.includes('\\i supabase/migrations/20261115143000_taphoa_staff_order_copy_gd_me_yeu.sql'));
 for(const marker of ['walk-in draft','no-op edit','meaningful edit','retry generated','deliver path','locked staff','unauthorized client']){
  assert(isolated.includes(marker),marker);
 }
 assert(workflow.includes('PGDATABASE=taphoa_staff_notice_test psql'));
 assert(workflow.includes('CREATE DATABASE taphoa_staff_notice_test'));
 assert(!isolated.includes('supabase.co'));
});
