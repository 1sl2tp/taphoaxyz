import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const sql=readFileSync('supabase/migrations/20261115173500_staff_order_png_storage_permission.sql','utf8');
const fixture=readFileSync('tests/sql/staff-order-notice-014-isolated.sql','utf8');
test('the exact staff ticket alone permits PNG upload, no broad v21-media policy',()=>{
 for(const invariant of ['t.storage_key=p_object_name',"sender.auth_user_id=auth.uid()",
 "sender.role='admin'","staff.contact_group='friend'","o.status='delivered'",
 "m.body=''","log.operation IN ('save_order','deliver_order')",
 "log.result->'order'->>'id'=t.order_id::text","m.client_id='taphoa:'||log.command_id::text||':staff-order'",
 "t.attached_at IS NULL","interval '20 minutes'","bucket_id='v21-media'",
 'NOT EXISTS (',"FOR INSERT TO authenticated"]){
  assert(sql.includes(invariant),invariant);
 }
 assert(!sql.includes('ALTER POLICY v21_media_insert_member_image'));
 assert(!sql.includes('UPDATE public.v21_messages'));
 assert(!sql.includes('INSERT INTO public.v21_messages'));
 assert(!sql.includes('INSERT INTO public.taphoa_orders'));
 assert(fixture.includes('STAFF-MEDIA-018'));
 assert(fixture.includes('wrong authenticated owner may upload employee image'));
 assert(fixture.includes('locked staff recipient still allowed upload'));
});
