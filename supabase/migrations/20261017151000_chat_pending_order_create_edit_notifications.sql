-- Draft order opt-ins previously existed only as UI settings. Add the
-- matching admin-created pending order event, pending edit event, and PNG.
-- No ledger modifications, no resends, and no new background jobs.
-- Same command ID remains idempotent; unmodified edits remain suppressed.

CREATE OR REPLACE FUNCTION public.taphoa_save_order(p_order jsonb, p_command_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $$
declare
  ctx jsonb := public.taphoa_access_context();
  prior jsonb;
  v_account_id uuid := nullif(ctx->>'account_id','')::uuid;
  v_role text := coalesce(ctx->>'taphoa_role','');
  v_customer uuid;
  v_customer_text text;
  v_status text;
  v_note text := coalesce(p_order->>'note','');
  v_edit_id uuid;
  v_order public.taphoa_orders;
  v_old_status text := null;
  v_old_customer uuid := null;
  v_old_costs jsonb := '{}'::jsonb;
  v_refresh_costs boolean := coalesce((p_order->>'refresh_cost_snapshot')::boolean,false);
  v_old_order_json jsonb := null;
  v_prefix text;
  v_items integer := 0;
  v_expected integer := 0;
  v_total numeric := 0;
  v_order_json jsonb;
  v_display_code text;
  v_notice text;
  v_diff text;
  v_old_total_vnd numeric := 0;
  v_new_total_vnd numeric := 0;
  v_balance_before numeric;
  v_balance_after numeric;
  v_result jsonb;
begin
  if not coalesce((ctx->>'allowed')::boolean,false) or v_role not in ('admin','customer') then
    raise exception 'taphoa_access_denied' using errcode='42501';
  end if;
  if p_command_id is null then raise exception 'command_id_required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_command_id::text,0));
  select result into prior from public.taphoa_command_log where command_id=p_command_id;
  if found then return prior; end if;

  v_customer_text := nullif(btrim(coalesce(p_order->>'customer_id','')),'');
  if lower(coalesce(v_customer_text,''))='le' then v_customer_text := null; end if;
  v_customer := v_customer_text::uuid;
  if v_customer is not null and not exists(
    select 1 from public.v21_accounts a
    where a.id=v_customer and a.role='user' and a.contact_group='customer'
      and a.deleted_at is null and a.locked_at is null
  ) then raise exception 'customer_not_found'; end if;

  v_status := case when lower(coalesce(p_order->>'status','pending')) in ('done','delivered') then 'delivered' else 'pending' end;
  if v_role='customer' then
    if v_status <> 'pending' then raise exception 'customer_orders_pending_only' using errcode='42501'; end if;
    if v_customer is distinct from v_account_id then raise exception 'customer_order_wrong_account' using errcode='42501'; end if;
  end if;

  v_edit_id := nullif(p_order->>'edit_order_id','')::uuid;
  if v_refresh_costs and (v_role <> 'admin' or v_edit_id is null or v_status <> 'pending') then
    raise exception 'draft_cost_refresh_admin_only' using errcode='42501';
  end if;
  v_expected := jsonb_array_length(coalesce(p_order->'items','[]'::jsonb));
  if v_expected<1 then raise exception 'order_items_required'; end if;

  if v_edit_id is null then
    v_prefix := case when v_status='delivered' then 'DG' else 'DT' end;
    insert into public.taphoa_orders(customer_account_id,status,note,created_by_account_id,delivered_at,display_prefix,display_no)
    values(
      v_customer,
      v_status,
      v_note,
      v_account_id,
      case when v_status='delivered' then now() else null end,
      v_prefix,
      nextval((case when v_prefix='DG' then 'public.taphoa_order_display_no_dg_seq' else 'public.taphoa_order_display_no_dt_seq' end)::regclass)
    )
    returning * into v_order;
  else
    select * into v_order from public.taphoa_orders where id=v_edit_id for update;
    if not found then raise exception 'order_not_found'; end if;
    if v_role='customer' and (
      v_order.customer_account_id is distinct from v_account_id
      or v_order.status <> 'pending'
    ) then raise exception 'customer_order_not_allowed' using errcode='42501'; end if;
    if v_order.status='reversed' then raise exception 'order_reversed'; end if;
    v_old_status := v_order.status;
    if v_refresh_costs and v_old_status <> 'pending' then
      raise exception 'draft_cost_refresh_pending_only' using errcode='42501';
    end if;
    v_old_customer := v_order.customer_account_id;
    v_old_order_json := public.taphoa_order_frontend_json(v_order);
    if v_old_status='delivered' and v_status<>'delivered' then raise exception 'delivered_order_cannot_be_pending'; end if;

    if v_old_status='delivered' and v_old_customer is not null and v_old_customer is not distinct from v_customer then
      v_balance_before := public.taphoa_chat_customer_balance_value(v_old_customer);
    end if;

    select coalesce(jsonb_object_agg(product_code,unit_cost_vnd_snapshot),'{}'::jsonb)
    into v_old_costs
    from public.taphoa_order_items
    where order_id=v_order.id;

    delete from public.taphoa_debt_ledger where order_id=v_order.id and entry_type='sale';
    delete from public.taphoa_order_items where order_id=v_order.id;
    update public.taphoa_orders
    set customer_account_id=v_customer,
        status=v_status,
        note=v_note,
        updated_at=now(),
        delivered_at=case when v_status='delivered' then coalesce(v_order.delivered_at,now()) else null end,
        display_prefix=case when v_old_status='pending' and v_status='delivered' then 'DG' else v_order.display_prefix end,
        display_no=case when v_old_status='pending' and v_status='delivered'
                        then nextval('public.taphoa_order_display_no_dg_seq'::regclass)
                        else v_order.display_no end
    where id=v_order.id
    returning * into v_order;
  end if;

  insert into public.taphoa_order_items(order_id,product_code,qty,unit_price_vnd,unit_cost_vnd_snapshot,line_no,note)
  select v_order.id,
         item->>'product_id',
         (item->>'qty')::numeric,
         (item->>'unit_price')::numeric,
         case when v_refresh_costs
           then coalesce(p.input_price_vnd,0)
           else coalesce(nullif(v_old_costs->>(item->>'product_id'),'')::numeric,
                         p.input_price_vnd,0)
         end,
         (item->>'line_no')::integer,
         coalesce(item->>'note','')
  from jsonb_array_elements(p_order->'items') item
  join public.taphoa_products p on p.product_code=item->>'product_id' and p.is_active
  where coalesce((item->>'qty')::numeric,0)>0
    and coalesce((item->>'unit_price')::numeric,-1)>=0
    and coalesce((item->>'line_no')::integer,0)>0;
  get diagnostics v_items=row_count;
  if v_items<>v_expected then raise exception 'invalid_order_items'; end if;

  if v_status='delivered' and v_customer is not null then
    select coalesce(sum(qty*unit_price_vnd),0) into v_total
    from public.taphoa_order_items where order_id=v_order.id;
    -- A correction to an already delivered order is NOT a new delivery.
    -- Keep the delivery timestamp when the sale ledger row is regenerated.
    insert into public.taphoa_debt_ledger(customer_account_id,order_id,entry_type,amount_vnd,note,created_by_account_id,created_at)
    values(v_customer,v_order.id,'sale',v_total,'Giao đơn',v_account_id,
           coalesce(v_order.delivered_at,now()));
  end if;

  perform public.taphoa_bump_revision('orders');
  if (v_old_status='delivered' and v_old_customer is not null)
     or (v_status='delivered' and v_customer is not null) then
    perform public.taphoa_bump_revision('debt');
  end if;

  select * into v_order from public.taphoa_orders where id=v_order.id;
  v_order_json := public.taphoa_order_frontend_json(v_order);
  v_display_code := coalesce(nullif(v_order_json->>'displayCode',''),v_order.id::text);
  v_new_total_vnd := coalesce(nullif(v_order_json->>'tongTien','')::numeric,0);
  if v_customer is not null then
    v_balance_after := public.taphoa_chat_customer_balance_value(v_customer);
  end if;
  v_result := jsonb_build_object('ok',true,'order',v_order_json);

  -- Three opt-in events: create draft, meaningful edit, and delivery.
  if v_role='admin' and v_customer is not null then
    if v_edit_id is null then
      if v_status='delivered' then
        v_notice := public.taphoa_chat_order_receipt(
          v_order_json,
          'Đơn ' || v_display_code || ' đã giao', null::bigint);
      else
        v_notice := public.taphoa_chat_order_receipt(
          v_order_json, 'Tạo đơn', null::bigint);
      end if;
    elsif v_old_status='pending' and v_status='delivered' then
      v_notice := public.taphoa_chat_order_receipt(
        v_order_json,
        'Đơn ' || v_display_code || ' đã giao', null::bigint);
    else
      v_diff := public.taphoa_chat_order_diff(v_old_order_json,v_order_json,6);
      v_old_total_vnd := coalesce(nullif(v_old_order_json->>'tongTien','')::numeric,0);
      v_notice := 'Đơn ' || v_display_code || ' đã được sửa';

      if btrim(coalesce(v_diff,''))<>'' then
        v_notice := v_notice || E'\n' || v_diff;
      end if;

      if v_old_total_vnd is distinct from v_new_total_vnd then
        v_notice := v_notice || E'\nTổng: '
          || public.taphoa_chat_money(v_old_total_vnd)
          || ' → '
          || public.taphoa_chat_money(v_new_total_vnd);
      end if;

      if coalesce(v_old_order_json->>'note','') is distinct from coalesce(v_order_json->>'note','') then
        v_notice := v_notice || E'\nGhi chú: '
          || case when btrim(coalesce(v_old_order_json->>'note',''))='' then '(trống)' else left(v_old_order_json->>'note',80) end
          || ' → '
          || case when btrim(coalesce(v_order_json->>'note',''))='' then '(trống)' else left(v_order_json->>'note',80) end;
      end if;

      if btrim(coalesce(v_diff,''))='' and v_old_total_vnd is not distinct from v_new_total_vnd
         and coalesce(v_old_order_json->>'note','') is not distinct from coalesce(v_order_json->>'note','') then
        v_notice := v_notice || E'\nKhông có thay đổi nội dung.';
      end if;

      if v_status='delivered' then
        if v_balance_before is not null and v_balance_before is distinct from v_balance_after then
          v_notice := v_notice || E'\n' || public.taphoa_chat_balance_label(v_balance_before,true);
        end if;
        v_notice := v_notice || E'\n' || public.taphoa_chat_balance_label(v_balance_after,false);
      end if;
    end if;

    perform public.taphoa_chat_notify_customer(
      v_customer,
      v_account_id,
      'taphoa:' || p_command_id::text ||
        case
          when v_edit_id is not null and v_old_status='pending' and v_status='delivered'
            then ':deliver'
          when v_edit_id is not null then ':order-edit'
          else ':order'
        end,
      v_notice
    );
  end if;

  insert into public.taphoa_command_log(command_id,operation,result) values(p_command_id,'save_order',v_result);
  return v_result;
end;
$$;

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
 if v_code !~ '^(DG|DT)[0-9]+ then
   return jsonb_build_object('ok',false,'reason','invalid_order_code');
 end if;
 select m.* into v_msg
 from public.v21_messages m
 join public.v21_conversations c on c.id=m.conversation_id
 where m.sender_account_id=v_sender
  and m.deleted_at is null
  and (c.member_a=v_order.customer_account_id or c.member_b=v_order.customer_account_id)
  and (m.client_id like 'taphoa:%:order' or m.client_id like 'taphoa:%:order-edit' or m.client_id like 'taphoa:%:deliver')
  and (
    position(' · '||v_code||' · ' in m.body)>0
    or position(' · '||v_code||E'\n' in m.body)>0
  )
  and m.created_at>=greatest(v_order.updated_at-interval '90 seconds',now()-interval '20 minutes')
 order by m.created_at desc,m.id desc
 limit 1;
 if v_msg.id is null
  or not v21_private.chat_outbound_allowed(v_order.customer_account_id,v_msg.client_id)
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
$$; then
   return jsonb_build_object('ok',false,'reason','invalid_order_code');
 end if;
 select m.* into v_msg
 from public.v21_messages m
 join public.v21_conversations c on c.id=m.conversation_id
 where m.sender_account_id=v_sender
  and m.deleted_at is null
  and (c.member_a=v_order.customer_account_id or c.member_b=v_order.customer_account_id)
  and (m.client_id like 'taphoa:%:order' or m.client_id like 'taphoa:%:order-edit' or m.client_id like 'taphoa:%:deliver')
  and (
    position(' · '||v_code||' · ' in m.body)>0
    or position(' · '||v_code||E'\n' in m.body)>0
  )
  and m.created_at>=greatest(v_order.updated_at-interval '90 seconds',now()-interval '20 minutes')
 order by m.created_at desc,m.id desc
 limit 1;
 if v_msg.id is null
  or not v21_private.chat_outbound_allowed(v_order.customer_account_id,v_msg.client_id)
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
   and v21_private.chat_outbound_allowed(o.customer_account_id,m.client_id)
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
   or not v21_private.chat_outbound_allowed(v_order.customer_account_id,v_message.client_id) then
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
