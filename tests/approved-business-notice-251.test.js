import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const sql=fs.readFileSync('supabase/migrations/20261106154500_approved_business_notice_templates.sql','utf8');
test('five approved business notice templates share canonical links and amounts',()=>{
 for(const title of [
  '📦 ĐƠN HÀNG ĐÃ GIAO','✏️ ĐƠN HÀNG ĐÃ CẬP NHẬT',
  '✅ ĐƠN HÀNG ĐÃ ĐƯỢC GIAO','🧾 THÔNG BÁO GHI NỢ',
  '✅ XÁC NHẬN ĐÃ THU TIỀN'])assert.ok(sql.includes(title),title);
 for(const key of ['Xem đơn: ','Xem công nợ: ','public.taphoa_chat_money',
  'taphoa_chat_balance_label','v21_private.taphoa_order_cycle_policy_note',
  "':deliver'","':order-edit'","':order'",
  'taphoa_chat_notify_customer','p_command_id','public.taphoa_debt_ledger'])
  assert.ok(sql.includes(key),key);
 assert.equal((sql.match(/CREATE OR REPLACE FUNCTION public.taphoa_chat_finance_notice\(/g)||[]).length,1);
 assert.ok(sql.includes('REVOKE ALL ON FUNCTION public.taphoa_chat_finance_notice'));
 assert.ok(sql.includes("'collection',v_amount_vnd,v_balance_before,v_balance_after"));
 assert.ok(sql.includes("'payment',v_amount_vnd,v_balance_before,v_balance_after"));
 assert.ok(sql.includes("'Chuyển đơn tạm → đã giao', null::bigint)"));
 assert.ok(sql.includes("v_client_id")===false,'do not change common outbound sender');
 assert.ok(!sql.includes('cron.schedule('),'no new automatic schedule');
 assert.ok(!sql.includes('UPDATE public.v21_messages'),'no rewrite historical notices');
 assert.ok(!sql.includes('INSERT INTO public.v21_media_assets'),'no fabricated media');
});
