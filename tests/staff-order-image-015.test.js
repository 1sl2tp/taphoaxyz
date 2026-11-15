import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const sql=readFileSync('supabase/migrations/20261115154000_staff_order_notice_png_original.sql','utf8');
const client=readFileSync('src/fixed-production-bridge.js','utf8');
const business=readFileSync('src/core/business.js','utf8');
test('same-message staff PNG attaches after exact admin command',()=>{
 for(const field of ['taphoa_staff_order_image_ticket','taphoa_staff_order_image_attach','staff_notice_command_id'])
  assert(client.includes(field)||business.includes(field),field);
 assert.match(business,/saveOrder:async payload=>\{[\s\S]*?staff_notice_command_id:id/);
 assert.match(business,/deliverOrder:async id=>\{[\s\S]*?staff_notice_command_id:command/);
 assert(client.includes('staffCommandId:result.staff_notice_command_id'));
 assert(client.includes("staff?'taphoa_staff_order_image_ticket':'taphoa_order_notice_image_ticket'"));
 assert(client.includes("staff?'taphoa_staff_order_image_attach':'taphoa_order_notice_image_attach'"));
 assert(client.includes('result.image_attached=await attachOrderNoticePortrait(result.order)===true;'));
 assert(client.includes('window.TAPHOA_ORDER_PORTRAIT'));
 assert(client.includes('productionOwnerCurrent(noticeOwner)'));
});
test('authorization, exact recipient, TTL, idempotent media, no extra message',()=>{
 for(const text of ['taphoa_command_log','l.result->\'order\'->>\'id\'=p_order_id::text',
  ':staff-order','v21_media_assets','20 minutes','image_already_attached',
  "mime IS DISTINCT FROM 'image/png'","bytes IS DISTINCT FROM p_size_bytes",
  'auth.uid()','ticket.asset_id','ON CONFLICT(id) DO NOTHING'])
  assert(sql.includes(text),text);
 assert.match(sql,/staff constant uuid:='[a-f0-9-]+'::uuid/);
 assert.match(sql,/REVOKE ALL ON FUNCTION public.taphoa_staff_order_image_ticket/);
 assert.match(sql,/REVOKE ALL ON FUNCTION public.taphoa_staff_order_image_attach/);
 assert.doesNotMatch(sql,/INSERT INTO public\.v21_messages|taphoa_customer_mini_link|cron\.schedule|net\.http_post/i);
 assert(client.includes("(!staff&&!order?.customer_id)"));
 assert(client.includes("const eligible=delivered||(manual===true&&state==='pending'&&!staff)"));
});
