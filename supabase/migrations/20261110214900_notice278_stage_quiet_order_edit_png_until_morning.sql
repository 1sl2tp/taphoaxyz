-- NOTICE-278: stage the existing portrait PNG under its admin-authenticated
-- private Storage path; publish the same PNG with the Chat notice after 08:05.
-- Preserve existing immediate message+image path unchanged.
CREATE OR REPLACE FUNCTION v21_storage_private.can_upload_taphoa_order_notice(p_object_name text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'v21_private', 'auth', 'pg_temp'
AS $function$
select auth.uid() is not null and (exists(
 select 1
 from v21_private.taphoa_order_notice_image_uploads t
 join public.v21_accounts a on a.id=t.sender_account_id
 join public.taphoa_orders o on o.id=t.order_id
 join public.v21_messages m on m.id=t.message_id
 where t.storage_key=p_object_name
   and t.attached_at is null
   and t.created_at>=now()-interval '20 minutes'
   and a.auth_user_id=auth.uid()
   and a.role='admin' and a.deleted_at is null and a.locked_at is null
   and o.status in ('pending','delivered')
   and o.customer_account_id is not null
   and m.sender_account_id=a.id and m.conversation_id=t.conversation_id
   and (m.client_id like 'manual:order:%'
      or v21_private.chat_outbound_allowed(o.customer_account_id,m.client_id))
) OR EXISTS (
 SELECT 1
 FROM v21_private.taphoa_order_edit_quiet_queue q
 JOIN public.v21_accounts a ON a.id=q.sender_account_id
 JOIN public.taphoa_orders o ON o.id=q.order_id
 JOIN public.v21_conversations c ON c.id=q.staged_conversation_id
 WHERE q.staged_storage_key=p_object_name
   AND q.status='pending' AND q.staged_asset_id IS NOT NULL
   AND q.staged_ready_at IS NULL AND q.send_after>now()
   AND q.updated_at>=now()-interval '20 minutes'
   AND a.auth_user_id=auth.uid() AND a.role='admin'
   AND a.deleted_at IS NULL AND a.locked_at IS NULL
   AND o.status='delivered'
   AND o.customer_account_id=q.customer_account_id
   AND (c.member_a=q.sender_account_id OR c.member_b=q.sender_account_id)
   AND (c.member_a=q.customer_account_id OR c.member_b=q.customer_account_id)
   AND v21_private.chat_outbound_allowed(q.customer_account_id,q.client_id)
 ));
$function$;

CREATE OR REPLACE FUNCTION public.taphoa_order_notice_image_ticket(p_order_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'v21_private', 'auth', 'pg_temp'
AS $function$
declare
 v_ctx jsonb := public.taphoa_access_context();
 v_sender uuid := nullif(v_ctx->>'account_id','')::uuid;
 v_order public.taphoa_orders;
 v_code text;
 v_msg public.v21_messages;
 v_ticket v21_private.taphoa_order_notice_image_uploads;
 v_asset_id uuid;
 v_pending v21_private.taphoa_order_edit_quiet_queue%ROWTYPE;
 v_conversation_id uuid;
 v_member_a uuid;
 v_member_b uuid;
begin
 if not coalesce((v_ctx->>'allowed')::boolean,false) or v_ctx->>'taphoa_role' <> 'admin'
    or v_sender is null or auth.uid() is null then
   raise exception 'taphoa_admin_required' using errcode='42501';
 end if;
 select * into v_order from public.taphoa_orders where id=p_order_id;
 if not found or v_order.customer_account_id is null or v_order.status not in ('pending','delivered') then
   return jsonb_build_object('ok',false,'reason','not_saved_customer_order');
 end if;
 v_code := v_order.display_prefix||v_order.display_no::text;
 if v_code !~ '^(DG|DT)[0-9]+$' then
   return jsonb_build_object('ok',false,'reason','invalid_order_code');
 end if;
 -- NOTICE-278: prepare an original PNG privately while an edited order is
 -- queued. Do not create a Chat message, media row or Zalo outbox at night.
 SELECT q.* INTO v_pending
 FROM v21_private.taphoa_order_edit_quiet_queue q
 WHERE q.order_id=p_order_id AND q.customer_account_id=v_order.customer_account_id
   AND q.sender_account_id=v_sender AND q.status='pending'
   AND q.send_after>now()
   AND q.updated_at>=now()-interval '20 minutes'
   AND v21_private.chat_outbound_allowed(q.customer_account_id,q.client_id)
 ORDER BY q.dispatch_date_vn DESC LIMIT 1 FOR UPDATE;
 IF FOUND THEN
   IF v_pending.staged_ready_at IS NOT NULL THEN
     RETURN jsonb_build_object('ok',false,'reason','quiet_edit_image_already_staged');
   END IF;
   IF v_pending.staged_asset_id IS NULL THEN
     SELECT c.id INTO v_conversation_id
     FROM public.v21_conversations c
     WHERE (c.member_a=v_sender AND c.member_b=v_order.customer_account_id)
        OR (c.member_b=v_sender AND c.member_a=v_order.customer_account_id)
     ORDER BY c.created_at DESC,c.id LIMIT 1;
     IF v_conversation_id IS NULL THEN
       IF v_sender::text < v_order.customer_account_id::text THEN
         v_member_a:=v_sender;v_member_b:=v_order.customer_account_id;
       ELSE
         v_member_a:=v_order.customer_account_id;v_member_b:=v_sender;
       END IF;
       INSERT INTO public.v21_conversations(member_a,member_b)
       VALUES(v_member_a,v_member_b)
       ON CONFLICT(member_a,member_b) DO UPDATE SET member_a=excluded.member_a
       RETURNING id INTO v_conversation_id;
     END IF;
     v_asset_id:=gen_random_uuid();
     UPDATE v21_private.taphoa_order_edit_quiet_queue
       SET staged_asset_id=v_asset_id,
           staged_conversation_id=v_conversation_id,
           staged_storage_key=v_sender::text||'/'||v_conversation_id::text||'/'||v_asset_id::text
     WHERE order_id=v_pending.order_id AND dispatch_date_vn=v_pending.dispatch_date_vn;
     SELECT q.* INTO v_pending FROM v21_private.taphoa_order_edit_quiet_queue q
       WHERE q.order_id=p_order_id AND q.dispatch_date_vn=v_pending.dispatch_date_vn;
   END IF;
   RETURN jsonb_build_object('ok',true,'deferred',true,
      'send_after',v_pending.send_after,'order_id',v_pending.order_id,
      'asset_id',v_pending.staged_asset_id,'storage_key',v_pending.staged_storage_key);
 END IF;

 select m.* into v_msg
 from public.v21_messages m
 join public.v21_conversations c on c.id=m.conversation_id
 where m.sender_account_id=v_sender
  and m.deleted_at is null
  and (c.member_a=v_order.customer_account_id or c.member_b=v_order.customer_account_id)
  and (m.client_id like 'taphoa:%:order' or m.client_id like 'taphoa:%:order-edit'
   or m.client_id like 'taphoa:%:deliver' or m.client_id like 'manual:order:%')
  and (
    position(' · '||v_code||' · ' in m.body)>0
    or position(' · '||v_code||E'\n' in m.body)>0
  )
  and m.created_at>=greatest(v_order.updated_at-interval '90 seconds',now()-interval '20 minutes')
 order by m.created_at desc,m.id desc
 limit 1;
 if v_msg.id is null
  or not (
    v_msg.client_id like 'manual:order:%'
    or v21_private.chat_outbound_allowed(v_order.customer_account_id,v_msg.client_id)
  )
 then
   return jsonb_build_object('ok',false,'reason','notice_not_enabled_or_not_sent');
 end if;
 if exists(select 1 from public.v21_media_assets a
  where a.message_id=v_msg.id and a.kind='image' and a.deleted_at is null) then
   return jsonb_build_object('ok',false,'reason','image_already_attached');
 end if;
 v_asset_id:=gen_random_uuid();
 insert into v21_private.taphoa_order_notice_image_uploads(
  message_id,order_id,sender_account_id,conversation_id,asset_id,storage_key)
 values(v_msg.id,p_order_id,v_sender,v_msg.conversation_id,v_asset_id,
  v_sender::text||'/'||v_msg.conversation_id::text||'/'||v_asset_id::text)
 on conflict(message_id) do nothing;
 select * into v_ticket from v21_private.taphoa_order_notice_image_uploads
 where message_id=v_msg.id;
 if v_ticket.attached_at is not null or v_ticket.created_at<now()-interval '20 minutes' then
   return jsonb_build_object('ok',false,'reason','image_already_sent_or_expired');
 end if;
 return jsonb_build_object('ok',true,'order_id',v_ticket.order_id,'message_id',v_ticket.message_id,
  'asset_id',v_ticket.asset_id,'storage_key',v_ticket.storage_key);
end;
$function$;

CREATE OR REPLACE FUNCTION public.taphoa_order_notice_image_attach(p_order_id uuid, p_asset_id uuid, p_size_bytes bigint, p_width_px integer, p_height_px integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'v21_private', 'auth', 'storage', 'pg_temp'
AS $function$
declare
 v_ctx jsonb:=public.taphoa_access_context();
 v_sender uuid:=nullif(v_ctx->>'account_id','')::uuid;
 v_ticket v21_private.taphoa_order_notice_image_uploads;
 v_message public.v21_messages;
 v_order public.taphoa_orders;
 v_mime text;
 v_size bigint;
 v_pending v21_private.taphoa_order_edit_quiet_queue%ROWTYPE;
begin
 if not coalesce((v_ctx->>'allowed')::boolean,false) or v_ctx->>'taphoa_role'<>'admin'
  or v_sender is null or auth.uid() is null then
  raise exception 'taphoa_admin_required' using errcode='42501';
 end if;
 if p_asset_id is null or p_order_id is null
  or coalesce(p_size_bytes,0)<1 or p_size_bytes>15728640
  or coalesce(p_width_px,0)<1 or p_width_px>20000
  or coalesce(p_height_px,0)<1 or p_height_px>20000 then
  raise exception 'image_metadata_invalid';
 end if;
 select * into v_ticket from v21_private.taphoa_order_notice_image_uploads
 where asset_id=p_asset_id and order_id=p_order_id and sender_account_id=v_sender
 for update;
 IF NOT FOUND THEN
   -- NOTICE-278: the PNG is still private, pending the 08:05 Chat release.
   SELECT q.* INTO v_pending
   FROM v21_private.taphoa_order_edit_quiet_queue q
   WHERE q.staged_asset_id=p_asset_id AND q.order_id=p_order_id
     AND q.sender_account_id=v_sender AND q.status='pending'
     AND q.staged_ready_at IS NULL AND q.send_after>now()
     AND q.updated_at>=now()-interval '20 minutes'
   FOR UPDATE;
   IF NOT FOUND THEN RAISE EXCEPTION 'image_ticket_not_found' USING errcode='42501'; END IF;
   SELECT * INTO v_order FROM public.taphoa_orders WHERE id=p_order_id;
   IF v_order.id IS NULL OR v_order.status<>'delivered'
     OR v_order.customer_account_id IS DISTINCT FROM v_pending.customer_account_id
     OR NOT v21_private.chat_outbound_allowed(v_pending.customer_account_id,v_pending.client_id)
     OR v_pending.staged_storage_key IS NULL OR v_pending.staged_conversation_id IS NULL
   THEN RAISE EXCEPTION 'quiet_edit_image_no_longer_allowed' USING errcode='42501'; END IF;
   SELECT split_part(lower(coalesce(o.metadata->>'mimetype','')),';',1),
     coalesce((o.metadata->>'size')::bigint,(o.metadata->>'contentLength')::bigint,0)
   INTO v_mime,v_size FROM storage.objects o
   WHERE o.bucket_id='v21-media' AND o.name=v_pending.staged_storage_key
     AND o.owner_id=auth.uid()::text AND o.archived_at IS NULL
     AND NOT o.is_delete_marker
   LIMIT 1;
   IF v_mime IS DISTINCT FROM 'image/png' OR v_size IS DISTINCT FROM p_size_bytes
   THEN RAISE EXCEPTION 'image_storage_missing_or_invalid'; END IF;
   UPDATE v21_private.taphoa_order_edit_quiet_queue q
   SET staged_size_bytes=p_size_bytes,staged_width_px=p_width_px,
     staged_height_px=p_height_px,staged_ready_at=now()
   WHERE q.order_id=v_pending.order_id AND q.dispatch_date_vn=v_pending.dispatch_date_vn;
   RETURN jsonb_build_object('ok',true,'deferred',true,'order_id',p_order_id,
      'asset_id',p_asset_id,'send_after',v_pending.send_after);
 END IF;
 if v_ticket.attached_at is not null then
  return jsonb_build_object('ok',true,'already_attached',true,'message_id',v_ticket.message_id);
 end if;
 if v_ticket.created_at<now()-interval '20 minutes' then raise exception 'image_ticket_expired'; end if;
 select * into v_order from public.taphoa_orders where id=p_order_id;
 select * into v_message from public.v21_messages where id=v_ticket.message_id;
 if v_order.id is null or v_order.status not in ('pending','delivered')
   or v_message.id is null or v_message.deleted_at is not null
   or v_message.sender_account_id is distinct from v_sender
   or v_message.conversation_id is distinct from v_ticket.conversation_id
   or not (
     v_message.client_id like 'manual:order:%'
     or v21_private.chat_outbound_allowed(v_order.customer_account_id,v_message.client_id)
   ) then
   raise exception 'notification_no_longer_allowed' using errcode='42501';
 end if;
 select split_part(lower(coalesce(o.metadata->>'mimetype','')),';',1),
  coalesce((o.metadata->>'size')::bigint,(o.metadata->>'contentLength')::bigint,0)
 into v_mime,v_size from storage.objects o
 where o.bucket_id='v21-media' and o.name=v_ticket.storage_key
  and o.owner_id=auth.uid()::text and o.archived_at is null and not o.is_delete_marker
 limit 1;
 if v_mime is distinct from 'image/png' or v_size is distinct from p_size_bytes then
  raise exception 'image_storage_missing_or_invalid';
 end if;
 insert into public.v21_media_assets(
  id,conversation_id,message_id,owner_account_id,kind,mime_type,size_bytes,
  storage_key,width_px,height_px,sort_index)
 values(
  v_ticket.asset_id,v_ticket.conversation_id,v_ticket.message_id,v_sender,
  'image','image/png',p_size_bytes,v_ticket.storage_key,p_width_px,p_height_px,0)
 on conflict(id) do nothing;
 update v21_private.taphoa_order_notice_image_uploads
 set attached_at=now() where message_id=v_ticket.message_id;
 return jsonb_build_object('ok',true,'message_id',v_ticket.message_id,'asset_id',v_ticket.asset_id);
end;
$function$;
