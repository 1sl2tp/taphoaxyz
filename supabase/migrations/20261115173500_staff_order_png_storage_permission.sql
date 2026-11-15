-- STAFF-MEDIA-018: narrowly grant existing staff-only order-image tickets access
-- to the same v21-media bucket used by customer PNG notices.  The existing
-- customer, manual Chat, Zalo and finance storage policies are NOT changed.
-- No orders, messages or objects are written by this DDL migration.
BEGIN;

CREATE OR REPLACE FUNCTION v21_storage_private.can_upload_taphoa_staff_order_notice(
 p_object_name text
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public','v21_private','v21_storage_private','auth','pg_temp'
AS $staff_upload_guard$
SELECT auth.uid() IS NOT NULL AND EXISTS (
 SELECT 1
 FROM v21_private.taphoa_order_notice_image_uploads t
 JOIN public.v21_accounts sender ON sender.id=t.sender_account_id
 JOIN public.v21_messages m ON m.id=t.message_id
 JOIN public.v21_conversations c ON c.id=t.conversation_id
 JOIN public.taphoa_orders o ON o.id=t.order_id
 JOIN public.taphoa_command_log log
   ON m.client_id='taphoa:'||log.command_id::text||':staff-order'
      AND log.operation IN ('save_order','deliver_order')
      AND log.result->'order'->>'id'=t.order_id::text
 JOIN public.v21_accounts staff
   ON staff.id='57fc1306-7030-4955-b174-afffeee2c3d2'::uuid
 WHERE t.storage_key=p_object_name
   AND t.attached_at IS NULL
   AND t.created_at>=now()-interval '20 minutes'
   AND sender.auth_user_id=auth.uid()
   AND sender.role='admin'
   AND sender.deleted_at IS NULL AND sender.locked_at IS NULL
   AND staff.role='user' AND staff.contact_group='friend'
   AND staff.deleted_at IS NULL AND staff.locked_at IS NULL
   AND o.status='delivered'
   AND m.sender_account_id=sender.id
   AND m.conversation_id=t.conversation_id
   AND m.deleted_at IS NULL
   AND m.body=''
   AND ((c.member_a=sender.id AND c.member_b=staff.id)
     OR (c.member_b=sender.id AND c.member_a=staff.id))
   AND NOT EXISTS (
      SELECT 1 FROM public.v21_media_assets a
      WHERE a.message_id=m.id AND a.kind='image' AND a.deleted_at IS NULL
   )
);
$staff_upload_guard$;

REVOKE ALL ON FUNCTION v21_storage_private.can_upload_taphoa_staff_order_notice(text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION v21_storage_private.can_upload_taphoa_staff_order_notice(text)
 TO authenticated;

DROP POLICY IF EXISTS v21_taphoa_staff_order_png_upload ON storage.objects;
CREATE POLICY v21_taphoa_staff_order_png_upload ON storage.objects
 FOR INSERT TO authenticated
 WITH CHECK (
  bucket_id='v21-media'
  AND v21_storage_private.can_upload_taphoa_staff_order_notice(name)
 );
COMMIT;
