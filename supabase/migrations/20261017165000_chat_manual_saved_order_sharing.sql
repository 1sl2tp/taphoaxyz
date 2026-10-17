-- Manual saved-order resend: no DB financial writes, no new order and no
-- automatic customer notifications. Only direct admin clicks authorize sends.
-- Explicit admin-only action: send the EXISTING saved order to its stored
-- customer. This is a manual message, not a new order or a scheduled notification.
-- Request id is idempotent; repeated clicks within 20 seconds are throttled.
CREATE OR REPLACE FUNCTION public.taphoa_manual_send_saved_order(
  p_order_id uuid,p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO public,v21_private,auth,pg_temp AS $$
DECLARE
  v_ctx jsonb:=public.taphoa_access_context();
  v_sender uuid:=nullif(v_ctx->>'account_id','')::uuid;
  v_order public.taphoa_orders;
  v_json jsonb;
  v_code text;
  v_msg_id uuid;
  v_target public.v21_accounts;
  v_client_id text;
BEGIN
  IF NOT coalesce((v_ctx->>'allowed')::boolean,false)
    OR v_ctx->>'taphoa_role'<>'admin'
    OR v_sender IS NULL OR auth.uid() IS NULL
  THEN RAISE EXCEPTION 'taphoa_admin_required' USING errcode='42501'; END IF;
  IF p_order_id IS NULL OR p_request_id IS NULL THEN
    RAISE EXCEPTION 'manual_send_request_required'; END IF;
  SELECT * INTO v_order FROM public.taphoa_orders
  WHERE id=p_order_id AND status IN ('pending','delivered');
  IF NOT FOUND OR v_order.customer_account_id IS NULL THEN
    RAISE EXCEPTION 'saved_customer_order_required'; END IF;
  SELECT * INTO v_target FROM public.v21_accounts
  WHERE id=v_order.customer_account_id AND role='user' AND contact_group='customer'
    AND deleted_at IS NULL AND locked_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'customer_not_found'; END IF;

  v_client_id:='manual:order:'||p_request_id::text;
  -- Retry the same client request returns the already-sent message.
  SELECT m.id INTO v_msg_id FROM public.v21_messages m
  WHERE m.sender_account_id=v_sender AND m.client_id=v_client_id
    AND m.deleted_at IS NULL LIMIT 1;
  IF v_msg_id IS NOT NULL THEN
    v_json:=public.taphoa_order_frontend_json(v_order);
    RETURN jsonb_build_object('ok',true,'already_sent',true,'message_id',v_msg_id,'order',v_json);
  END IF;

  v_json:=public.taphoa_order_frontend_json(v_order);
  v_code:=coalesce(nullif(v_json->>'displayCode',''),v_order.display_prefix||v_order.display_no::text);
  -- Cross-tab clicks sending the same order to the same customer close together
  -- should not produce a second message to Chat/Zalo.
  IF EXISTS (
    SELECT 1 FROM public.v21_messages m
    JOIN public.v21_conversations c ON c.id=m.conversation_id
    WHERE m.sender_account_id=v_sender AND m.deleted_at IS NULL
      AND m.client_id LIKE 'manual:order:%'
      AND (c.member_a=v_target.id OR c.member_b=v_target.id)
      AND (position(' · '||v_code||E'\n' in m.body)>0)
      AND m.created_at>now()-interval '20 seconds'
  ) THEN RETURN jsonb_build_object('ok',false,'reason','recently_sent'); END IF;

  v_msg_id:=public.taphoa_chat_notify_customer(
    v_target.id,v_sender,v_client_id,
    public.taphoa_chat_order_receipt(v_json,'Gửi lại đơn',null::bigint)
  );
  IF v_msg_id IS NULL THEN RAISE EXCEPTION 'manual_chat_send_failed'; END IF;
  RETURN jsonb_build_object('ok',true,'already_sent',false,'message_id',v_msg_id,'order',v_json);
END;
$$;
REVOKE ALL ON FUNCTION public.taphoa_manual_send_saved_order(uuid,uuid) FROM public,anon;
GRANT EXECUTE ON FUNCTION public.taphoa_manual_send_saved_order(uuid,uuid) TO authenticated;

-- Extend the existing receipt-image ticket to include manual share messages.
CREATE OR REPLACE FUNCTION public.taphoa_order_notice_image_ticket(p_order_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'v21_private', 'auth', 'pg_temp'
AS $$
declare
 v_ctx jsonb := public.taphoa_access_context();
 v_sender uuid := nullif(v_ctx->>'account_id','')::uuid;
 v_order public.taphoa_orders;
 v_code text;
 v_msg public.v21_messages;
 v_ticket v21_private.taphoa_order_notice_image_uploads;
 v_asset_id uuid;
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
$$;

create or replace function v21_storage_private.can_upload_taphoa_order_notice(p_object_name text)
returns boolean language sql stable security definer set search_path to 'public','v21_private','auth','pg_temp'
as $f$
select auth.uid() is not null and exists(
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
);
$f$;

create or replace function public.taphoa_order_notice_image_attach(
 p_order_id uuid,p_asset_id uuid,p_size_bytes bigint,p_width_px integer,p_height_px integer)
returns jsonb language plpgsql volatile security definer
set search_path to 'public','v21_private','auth','storage','pg_temp'
as $f$
declare
 v_ctx jsonb:=public.taphoa_access_context();
 v_sender uuid:=nullif(v_ctx->>'account_id','')::uuid;
 v_ticket v21_private.taphoa_order_notice_image_uploads;
 v_message public.v21_messages;
 v_order public.taphoa_orders;
 v_mime text;
 v_size bigint;
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
 if not found then raise exception 'image_ticket_not_found' using errcode='42501'; end if;
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
$f$;
