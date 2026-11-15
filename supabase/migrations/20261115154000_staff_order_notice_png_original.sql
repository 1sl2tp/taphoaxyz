-- STAFF-IMAGE-015: same-message PNG for employee notification (STAFF-ORDER-014).
-- No messages are created here. Customer ticket/consent is untouched.
BEGIN;
CREATE OR REPLACE FUNCTION public.taphoa_staff_order_image_ticket(
 p_order_id uuid,p_command_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public','v21_private','auth','pg_temp'
AS $staff_ticket$
DECLARE
 ctx jsonb:=public.taphoa_access_context();
 sender uuid:=nullif(ctx->>'account_id','')::uuid;
 staff constant uuid:='57fc1306-7030-4955-b174-afffeee2c3d2'::uuid;
 msg public.v21_messages%ROWTYPE;
 ticket v21_private.taphoa_order_notice_image_uploads%ROWTYPE;
 asset uuid;
BEGIN
 IF NOT coalesce((ctx->>'allowed')::boolean,false)
  OR ctx->>'taphoa_role' IS DISTINCT FROM 'admin'
  OR sender IS NULL OR auth.uid() IS NULL
  OR NOT EXISTS(SELECT 1 FROM public.v21_accounts a
   WHERE a.id=sender AND a.role='admin' AND a.deleted_at IS NULL AND a.locked_at IS NULL)
 THEN RAISE EXCEPTION 'staff_image_admin_only' USING errcode='42501'; END IF;
 IF p_order_id IS NULL OR p_command_id IS NULL
 THEN RAISE EXCEPTION 'staff_image_order_command_required' USING errcode='22023'; END IF;
 -- Exact committed command; never associate a later edit of the same order.
 IF NOT EXISTS(
   SELECT 1 FROM public.taphoa_command_log l
   WHERE l.command_id=p_command_id AND l.operation IN ('save_order','deliver_order')
     AND l.result->'order'->>'id'=p_order_id::text
 ) THEN RETURN jsonb_build_object('ok',false,'reason','order_commit_missing'); END IF;
 IF NOT EXISTS(SELECT 1 FROM public.v21_accounts a
   WHERE a.id=staff AND a.role='user' AND a.contact_group='friend'
     AND a.deleted_at IS NULL AND a.locked_at IS NULL)
 THEN RETURN jsonb_build_object('ok',false,'reason','staff_inactive'); END IF;
 SELECT m.* INTO msg FROM public.v21_messages m
 JOIN public.v21_conversations c ON c.id=m.conversation_id
 WHERE m.sender_account_id=sender
   AND m.client_id='taphoa:'||p_command_id::text||':staff-order'
   AND m.deleted_at IS NULL AND m.created_at>=now()-interval '20 minutes'
   AND ((c.member_a=sender AND c.member_b=staff)
      OR (c.member_b=sender AND c.member_a=staff))
 ORDER BY m.created_at DESC,m.id DESC LIMIT 1;
 IF NOT FOUND THEN
   RETURN jsonb_build_object('ok',false,'reason','staff_message_not_found');
 END IF;
 IF EXISTS(SELECT 1 FROM public.v21_media_assets a
   WHERE a.message_id=msg.id AND a.kind='image' AND a.deleted_at IS NULL)
 THEN RETURN jsonb_build_object('ok',false,'reason','image_already_attached'); END IF;
 SELECT * INTO ticket FROM v21_private.taphoa_order_notice_image_uploads
 WHERE message_id=msg.id FOR UPDATE;
 IF NOT FOUND THEN
   asset:=gen_random_uuid();
   INSERT INTO v21_private.taphoa_order_notice_image_uploads(
     message_id,order_id,sender_account_id,conversation_id,asset_id,storage_key)
   VALUES(msg.id,p_order_id,sender,msg.conversation_id,asset,
     sender::text||'/'||msg.conversation_id::text||'/'||asset::text)
   ON CONFLICT(message_id) DO NOTHING;
   SELECT * INTO ticket FROM v21_private.taphoa_order_notice_image_uploads
   WHERE message_id=msg.id FOR UPDATE;
 END IF;
 IF ticket.message_id IS NULL OR ticket.order_id IS DISTINCT FROM p_order_id
   OR ticket.sender_account_id IS DISTINCT FROM sender
   OR ticket.conversation_id IS DISTINCT FROM msg.conversation_id
   OR ticket.attached_at IS NOT NULL
   OR ticket.created_at<now()-interval '20 minutes'
 THEN RETURN jsonb_build_object('ok',false,'reason','ticket_expired_or_used'); END IF;
 RETURN jsonb_build_object('ok',true,'order_id',p_order_id,
   'message_id',ticket.message_id,'asset_id',ticket.asset_id,
   'storage_key',ticket.storage_key);
END;
$staff_ticket$;
REVOKE ALL ON FUNCTION public.taphoa_staff_order_image_ticket(uuid,uuid)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.taphoa_staff_order_image_ticket(uuid,uuid)
 TO authenticated;

CREATE OR REPLACE FUNCTION public.taphoa_staff_order_image_attach(
 p_order_id uuid,p_command_id uuid,p_asset_id uuid,
 p_size_bytes bigint,p_width_px integer,p_height_px integer
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public','v21_private','auth','storage','pg_temp'
AS $staff_attach$
DECLARE
 ctx jsonb:=public.taphoa_access_context();
 sender uuid:=nullif(ctx->>'account_id','')::uuid;
 staff constant uuid:='57fc1306-7030-4955-b174-afffeee2c3d2'::uuid;
 ticket v21_private.taphoa_order_notice_image_uploads%ROWTYPE;
 msg public.v21_messages%ROWTYPE;
 mime text;
 bytes bigint;
BEGIN
 IF NOT coalesce((ctx->>'allowed')::boolean,false)
  OR ctx->>'taphoa_role' IS DISTINCT FROM 'admin'
  OR sender IS NULL OR auth.uid() IS NULL
  OR NOT EXISTS(SELECT 1 FROM public.v21_accounts a
   WHERE a.id=sender AND a.role='admin' AND a.deleted_at IS NULL AND a.locked_at IS NULL)
 THEN RAISE EXCEPTION 'staff_image_admin_only' USING errcode='42501'; END IF;
 IF p_order_id IS NULL OR p_command_id IS NULL OR p_asset_id IS NULL
   OR coalesce(p_size_bytes,0)<1 OR p_size_bytes>15728640
   OR coalesce(p_width_px,0)<1 OR p_width_px>20000
   OR coalesce(p_height_px,0)<1 OR p_height_px>20000
 THEN RAISE EXCEPTION 'staff_image_metadata_invalid' USING errcode='22023'; END IF;
 SELECT * INTO ticket FROM v21_private.taphoa_order_notice_image_uploads t
 WHERE t.order_id=p_order_id AND t.asset_id=p_asset_id
   AND t.sender_account_id=sender FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'staff_image_ticket_missing' USING errcode='42501'; END IF;
 SELECT m.* INTO msg FROM public.v21_messages m
 JOIN public.v21_conversations c ON c.id=m.conversation_id
 WHERE m.id=ticket.message_id AND m.sender_account_id=sender
  AND m.deleted_at IS NULL AND m.conversation_id=ticket.conversation_id
  AND m.client_id='taphoa:'||p_command_id::text||':staff-order'
  AND ((c.member_a=sender AND c.member_b=staff)
    OR (c.member_b=sender AND c.member_a=staff));
 IF NOT FOUND
   OR ticket.created_at<now()-interval '20 minutes'
   OR NOT EXISTS(SELECT 1 FROM public.v21_accounts a
     WHERE a.id=staff AND a.role='user' AND a.contact_group='friend'
      AND a.deleted_at IS NULL AND a.locked_at IS NULL)
   OR NOT EXISTS(SELECT 1 FROM public.taphoa_command_log l
     WHERE l.command_id=p_command_id AND l.operation IN ('save_order','deliver_order')
      AND l.result->'order'->>'id'=p_order_id::text)
 THEN RAISE EXCEPTION 'staff_image_event_invalid' USING errcode='42501'; END IF;
 IF ticket.attached_at IS NOT NULL THEN
   RETURN jsonb_build_object('ok',true,'already_attached',true,
      'message_id',ticket.message_id,'asset_id',ticket.asset_id);
 END IF;
 SELECT split_part(lower(coalesce(o.metadata->>'mimetype','')),';',1),
   coalesce((o.metadata->>'size')::bigint,(o.metadata->>'contentLength')::bigint,0)
 INTO mime,bytes FROM storage.objects o
 WHERE o.bucket_id='v21-media' AND o.name=ticket.storage_key
   AND o.owner_id=auth.uid()::text AND o.archived_at IS NULL
   AND NOT o.is_delete_marker
 LIMIT 1;
 IF mime IS DISTINCT FROM 'image/png' OR bytes IS DISTINCT FROM p_size_bytes
 THEN RAISE EXCEPTION 'staff_image_storage_invalid' USING errcode='42501'; END IF;
 INSERT INTO public.v21_media_assets(
  id,conversation_id,message_id,owner_account_id,kind,mime_type,
  size_bytes,storage_key,width_px,height_px,sort_index)
 VALUES(
  ticket.asset_id,ticket.conversation_id,ticket.message_id,
  sender,'image','image/png',p_size_bytes,ticket.storage_key,
  p_width_px,p_height_px,0)
 ON CONFLICT(id) DO NOTHING;
 -- Only once a valid PNG is attached do we condense the Chat bubble to
 -- a legible caption. Full staff details remain as fallback if PNG fails;
 -- media is on the SAME message, and the Zalo text queue is unaffected.
 IF msg.body LIKE '📋 THÔNG BÁO ĐƠN CHO NHÂN VIÊN%' THEN
   UPDATE public.v21_messages m
   SET body = '📋 PHIẾU ĐƠN' || E'\n'
     || split_part(msg.body,E'\n',2) || E'\n'
     || split_part(msg.body,E'\n',3) || E'\n'
     || split_part(msg.body,E'\n',4) || E'\n'
     || (string_to_array(msg.body,E'\n'))[cardinality(string_to_array(msg.body,E'\n'))]
   WHERE m.id=msg.id;
 END IF;
 UPDATE v21_private.taphoa_order_notice_image_uploads
 SET attached_at=now() WHERE message_id=ticket.message_id;
 RETURN jsonb_build_object('ok',true,'message_id',ticket.message_id,
  'asset_id',ticket.asset_id);
END;
$staff_attach$;
REVOKE ALL ON FUNCTION public.taphoa_staff_order_image_attach(
 uuid,uuid,uuid,bigint,integer,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.taphoa_staff_order_image_attach(
 uuid,uuid,uuid,bigint,integer,integer) TO authenticated;
COMMIT;
