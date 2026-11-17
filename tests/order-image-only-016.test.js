import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const sql=readFileSync('supabase/migrations/20261115163000_order_notification_image_only_both_recipients.sql','utf8');
const bridge=readFileSync('src/fixed-production-bridge.js','utf8');
test('order images only: no automatic Chat/Zalo order text, other messages unaffected',()=>{
 assert.match(sql,/BEFORE INSERT ON public\.v21_messages/);
 assert.match(sql,/NEW\.body:='';/);
 assert.match(sql,/\(order\|order-edit\|deliver\|staff-order\)/);
 assert.match(sql,/a\.role='admin'/);
 assert(!sql.includes("INSERT INTO public.v21_messages"));
 assert(!sql.includes("UPDATE public.v21_messages"));
 assert.match(sql,/l\.command_id::text=split_part\(m\.client_id,':',2\)/);
 assert.match(sql,/l\.result->'order'->>'id'=p_order_id::text/);
 assert.match(sql,/v21_private\.chat_outbound_allowed/);
 assert.match(sql,/pending selected customer/);
});
test('both recipients share canonical PNG renderer for delivered orders only',()=>{
 assert(bridge.includes('window.TAPHOA_ORDER_PORTRAIT'));
 assert(bridge.includes('attachCommittedOrderNotices(result,result.staff_notice_command_id)'));
 assert(!bridge.includes('autoPending:true'));
 assert(!bridge.includes("savedStatus==='pending'&&result.order.customer_id"));
 assert(bridge.includes("['done','delivered'].includes(savedStatus)&&result?.order"));
 assert(bridge.includes("const eligible=delivered||(manual===true&&state==='pending'&&!staff)"));
 assert(bridge.includes('result.image_attached=await attachOrderNoticePortrait(result.order)===true'));
 assert(bridge.includes('staff_image_attached=await attachOrderNoticePortrait(result.order'));
 assert(bridge.includes("staff?'taphoa_staff_order_image_ticket':'taphoa_order_notice_image_ticket'"));
 assert(bridge.includes("staff?'taphoa_staff_order_image_attach':'taphoa_order_notice_image_attach'"));
});
