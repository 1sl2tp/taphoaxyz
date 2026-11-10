import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const root='supabase/migrations/';
const foundation=fs.readFileSync(root+'20261110214709_notice276_edit_order_quiet_queue_foundation.sql','utf8');
const gate=fs.readFileSync(root+'20261110214757_notice277_queue_overnight_order_edits_before_message_insert.sql','utf8');
const image=fs.readFileSync(root+'20261110214900_notice278_stage_quiet_order_edit_png_until_morning.sql','utf8');
const dispatch=fs.readFileSync(root+'20261110215006_notice279_daylight_dispatch_quiet_order_edits_and_staged_png.sql','utf8');

test('NOTICE-276 timezone boundaries apply ONLY to edited orders from 20:00 to 07:59',()=>{
  assert.match(foundation,/AT TIME ZONE 'Asia\/Ho_Chi_Minh'/);
  assert.match(foundation,/>= time '20:00'/);
  assert.match(foundation,/< time '08:00'/);
  assert.match(foundation,/time '08:05'/);
  assert.match(foundation,/ELSE null::timestamptz/);
  assert.match(foundation,/PRIMARY KEY\(order_id,dispatch_date_vn\)/);
  assert.match(foundation,/status IN \('pending','sent','skipped'\)/);
  assert.match(foundation,/REVOKE ALL ON TABLE v21_private.taphoa_order_edit_quiet_queue/);
});

test('NOTICE-277 save immediately, defer only real meaningful delivered edits, one latest snapshot',()=>{
  const start=gate.indexOf("IF v_client_id LIKE 'taphoa:%:order-edit' THEN");
  const end=gate.indexOf('select c.id',start);
  assert(start>0&&end>start);
  const quiet=gate.slice(start,end);
  assert.match(gate,/if v_body like '%Không có thay đổi nội dung.%' then\s+return null;/i);
  assert.match(quiet,/taphoa_order_edit_quiet_release\(now\(\)\)/);
  assert.match(quiet,/v_order.id IS NULL OR v_order.status<>'delivered'/);
  assert.match(quiet,/ON CONFLICT\(order_id,dispatch_date_vn\) DO UPDATE SET/);
  assert.match(quiet,/body=excluded.body/);
  assert.match(quiet,/client_id=excluded.client_id/);
  assert.match(quiet,/staged_asset_id=NULL/);
  assert.match(quiet,/RETURN NULL;/);
  assert.match(quiet,/newer_daytime_order_edit/);
  assert.match(gate.slice(end),/insert into public.v21_messages/i,
    'insertion follows the quiet-hour gate');
  assert.doesNotMatch(quiet,/insert\s+into\s+public\.v21_messages/i,
    'never publish a customer message during quiet hours');
  assert.doesNotMatch(quiet,/public\.taphoa_debt_ledger/i,
    'editing notice delay must not modify customer debt');
});

test('NOTICE-278 privately stage real PNG and preserve existing authenticated attachment',()=>{
  assert.match(image,/CREATE OR REPLACE FUNCTION v21_storage_private.can_upload_taphoa_order_notice/);
  assert.match(image,/q\.staged_storage_key=p_object_name/);
  assert.match(image,/q\.status='pending' AND q\.staged_asset_id IS NOT NULL/);
  assert.match(image,/a\.auth_user_id=auth.uid\(\)/);
  assert.match(image,/v21_private\.chat_outbound_allowed\(q\.customer_account_id,q\.client_id\)/);
  assert.match(image,/RETURN jsonb_build_object\('ok',true,'deferred',true/);
  assert.match(image,/staged_ready_at=now\(\)/);
  assert.match(image,/o\.owner_id=auth.uid\(\)::text/);
  assert.match(image,/v_mime IS DISTINCT FROM 'image\/png'/);
  assert.match(image,/v_ticket\.attached_at is not null/,
    'the unchanged immediate image branch still prevents duplicates');
});

test('NOTICE-279 dispatch after 08:05 only, recheck opt-in and release text+PNG atomically',()=>{
  assert.match(dispatch,/v_local_time<time '08:05' OR v_local_time>=time '20:00'/);
  assert.match(dispatch,/send_after<=now\(\)/);
  assert.match(dispatch,/updated_at<=now\(\)-interval '90 seconds'/);
  assert.match(dispatch,/LIMIT 25 FOR UPDATE SKIP LOCKED/);
  assert.match(dispatch,/v_order.status<>'delivered'/);
  assert.match(dispatch,/v_order.customer_account_id IS DISTINCT FROM v_job.customer_account_id/);
  assert.match(dispatch,/v21_private\.chat_outbound_allowed\(v_job.customer_account_id,v_job.client_id\)/);
  const message=dispatch.indexOf('v_message_id:=public.taphoa_chat_notify_customer');
  const media=dispatch.indexOf('INSERT INTO public.v21_media_assets');
  assert(message>=0&&media>message,'original PNG becomes visible only after morning text message');
  assert.match(dispatch,/o\.owner_id=a\.auth_user_id::text/);
  assert.match(dispatch,/ON CONFLICT\(id\) DO NOTHING/);
  assert.match(dispatch,/SET status='sent',message_id=v_message.id,sent_at=now\(\)/);
  assert.match(dispatch,/EXCEPTION WHEN OTHERS/);
  assert.match(dispatch,/REVOKE ALL ON FUNCTION v21_private.taphoa_order_edit_quiet_dispatch\(\)/);
  assert.match(dispatch,/cron\.schedule\('taphoa-order-edit-after-0805-vn'/);
  assert.match(dispatch,/'5,15,25,35,45,55 1-12 \* \* \*'/,
    'UTC 01:05 = Vietnam 08:05, then bounded daytime catchups');
  assert.doesNotMatch(dispatch,/DELETE FROM public\.v21_messages/i);
});

console.log('NOTICE-276/279: quiet hours, single latest edit, staged portrait, Zalo-ready daylight dispatch PASS');
