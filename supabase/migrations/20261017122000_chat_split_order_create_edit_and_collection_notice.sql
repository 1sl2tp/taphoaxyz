-- Independent create/edit switches; new edit switch defaults OFF.
ALTER TABLE v21_private.chat_outbound_options
ADD COLUMN IF NOT EXISTS send_order_edit boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.chat_admin_outbound_settings_get()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'v21_private'
AS $$
declare v_ctx jsonb;v_options v21_private.chat_outbound_options;v_master boolean;
begin
 v_ctx:=public.platform_account_context();
 if coalesce((v_ctx->>'allowed')::boolean,false) is not true
   or coalesce(v_ctx->>'account_class','') <> 'admin' then
  raise exception 'admin_required' using errcode='42501';
 end if;
 select * into v_options from v21_private.chat_outbound_options where singleton;
 select coalesce(enabled,false) into v_master from v21_private.chat_automatic_outbound_control where singleton;
 return jsonb_build_object(
  'master',coalesce(v_master,false),
  'events',jsonb_build_object('order',coalesce(v_options.send_order,false),'order_edit',coalesce(v_options.send_order_edit,false),'deliver',coalesce(v_options.send_deliver,false),
     'debt',coalesce(v_options.send_debt,false),'collection',coalesce(v_options.send_collection,false),
     'care',coalesce(v_options.send_care,false)),
  'audience',jsonb_build_object('linked',coalesce(v_options.audience_linked,false),'unlinked',coalesce(v_options.audience_unlinked,false)),
  'care_schedule_paused',true,
  'customers',coalesce((
    select jsonb_agg(jsonb_build_object(
       'id',a.id,'name',coalesce(nullif(a.display_name,''),a.username),
       'username',a.username,'linked',exists(select 1 from public.zalo_user_links z where z.chat_account_id=a.id),
       'enabled',coalesce(r.enabled,false)
     ) order by lower(coalesce(nullif(a.display_name,''),a.username)),a.id)
    from public.v21_accounts a
    left join v21_private.chat_outbound_recipients r on r.customer_account_id=a.id
    where a.role='user' and a.contact_group='customer'
      and a.deleted_at is null and a.locked_at is null
   ),'[]'::jsonb)
 );
end;
$$;

CREATE OR REPLACE FUNCTION public.chat_admin_outbound_settings_set(p_key text, p_enabled boolean, p_customer_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'v21_private'
AS $$
declare v_ctx jsonb;v_admin_id uuid;
begin
 v_ctx:=public.platform_account_context();
 if coalesce((v_ctx->>'allowed')::boolean,false) is not true
  or coalesce(v_ctx->>'account_class','') <> 'admin' then
  raise exception 'admin_required' using errcode='42501';
 end if;
 v_admin_id:=(v_ctx->>'account_id')::uuid;
 if p_enabled is null then raise exception 'enabled_required'; end if;
 if p_key='master' then
  update v21_private.chat_automatic_outbound_control
  set enabled=p_enabled,updated_at=now(),reason='Admin notification settings'
  where singleton;
 elsif p_key='customer' then
  if p_customer_id is null or not exists(
   select 1 from public.v21_accounts a where a.id=p_customer_id and a.role='user' and a.contact_group='customer' and a.deleted_at is null and a.locked_at is null
  ) then raise exception 'customer_not_found'; end if;
  insert into v21_private.chat_outbound_recipients(customer_account_id,enabled,updated_at,updated_by)
  values(p_customer_id,p_enabled,now(),v_admin_id)
  on conflict(customer_account_id) do update
   set enabled=excluded.enabled,updated_at=excluded.updated_at,updated_by=excluded.updated_by;
 elsif p_key in ('order','order_edit','deliver','debt','collection','care','linked','unlinked') then
  update v21_private.chat_outbound_options set
   send_order=case when p_key='order' then p_enabled else send_order end,
   send_order_edit=case when p_key='order_edit' then p_enabled else send_order_edit end,
   send_deliver=case when p_key='deliver' then p_enabled else send_deliver end,
   send_debt=case when p_key='debt' then p_enabled else send_debt end,
   send_collection=case when p_key='collection' then p_enabled else send_collection end,
   send_care=case when p_key='care' then p_enabled else send_care end,
   audience_linked=case when p_key='linked' then p_enabled else audience_linked end,
   audience_unlinked=case when p_key='unlinked' then p_enabled else audience_unlinked end,
   updated_at=now(),updated_by=v_admin_id
  where singleton;
 else
  raise exception 'setting_unknown';
 end if;
 return public.chat_admin_outbound_settings_get();
end;
$$;

CREATE OR REPLACE FUNCTION v21_private.chat_outbound_allowed(p_customer_id uuid, p_client_id text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'v21_private'
AS $$
declare
 v_flags v21_private.chat_outbound_options;
 v_kind text;
 v_linked boolean;
 v_enabled boolean;
begin
 if p_customer_id is null then return false; end if;
 if p_client_id like 'care:auto:%' then
  v_kind:='care';
 elsif p_client_id like 'taphoa:%:order-edit' then
  v_kind:='order_edit';
 elsif p_client_id like 'taphoa:%:order' then
  v_kind:='order';
 elsif p_client_id like 'taphoa:%:deliver' then
  v_kind:='deliver';
 elsif p_client_id like 'taphoa:%:debt' then
  v_kind:='debt';
 elsif p_client_id like 'taphoa:%:collection' then
  v_kind:='collection';
 else
  return false;
 end if;
 if not coalesce((select c.enabled from v21_private.chat_automatic_outbound_control c where c.singleton),false) then
  return false;
 end if;
 select * into v_flags from v21_private.chat_outbound_options where singleton=true;
 if not found then return false; end if;
 if not exists (
  select 1 from public.v21_accounts a
  join v21_private.chat_outbound_recipients r on r.customer_account_id=a.id and r.enabled is true
  where a.id=p_customer_id and a.role='user' and a.contact_group='customer'
    and a.deleted_at is null and a.locked_at is null
 ) then return false; end if;
 v_enabled:=case v_kind
  when 'order' then v_flags.send_order
  when 'order_edit' then v_flags.send_order_edit
  when 'deliver' then v_flags.send_deliver
  when 'debt' then v_flags.send_debt
  when 'collection' then v_flags.send_collection
  when 'care' then v_flags.send_care
  else false end;
 if not v_enabled then return false; end if;
 select exists(select 1 from public.zalo_user_links z where z.chat_account_id=p_customer_id)
 into v_linked;
 return case when v_linked then v_flags.audience_linked else v_flags.audience_unlinked end;
end;
$$;

CREATE OR REPLACE FUNCTION public.taphoa_chat_notify_customer(p_customer_id uuid, p_sender_account_id uuid, p_client_id text, p_body text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
declare
  v_member_a uuid;
  v_member_b uuid;
  v_conversation_id uuid;
  v_message_id uuid;
  v_client_id text := left(btrim(coalesce(p_client_id,'')),120);
  v_body text := btrim(coalesce(p_body,''));
  v_display_code text;
  v_prefix text;
  v_no bigint;
  v_order public.taphoa_orders;
  v_order_json jsonb;
  v_amount_text text;
  v_balance numeric;
  v_url text;
begin
  -- All automated business messages require both global and per-customer opt-in.
  -- Never gate manual Chat/Zalo messages or change order/debt processing.
  if v_client_id like 'taphoa:%' or v_client_id like 'care:auto:%' then
    if not v21_private.chat_outbound_allowed(p_customer_id,v_client_id) then
      return null;
    end if;
  end if;
  if p_customer_id is null or p_sender_account_id is null then
    return null;
  end if;
  if v_client_id='' then raise exception 'chat_client_id_required'; end if;

  if not exists(
    select 1 from public.v21_accounts a
    where a.id=p_sender_account_id
      and a.role='admin'
      and a.deleted_at is null
      and a.locked_at is null
  ) then
    raise exception 'chat_sender_not_admin' using errcode='42501';
  end if;

  if not exists(
    select 1 from public.v21_accounts a
    where a.id=p_customer_id
      and a.role='user'
      and a.contact_group='customer'
      and a.deleted_at is null
      and a.locked_at is null
  ) then
    raise exception 'chat_customer_not_found';
  end if;

  if v_client_id like 'taphoa:%:order-edit'
     and lower(v_body) like '%đã được sửa%' then
    if v_body like '%Không có thay đổi nội dung.%' then
      return null;
    end if;

    v_display_code := upper(substring(v_body from '((DG|DT)[0-9]+)'));
    if v_display_code is not null then
      v_prefix := substring(v_display_code from '^([A-Z]+)');
      v_no := nullif(substring(v_display_code from '([0-9]+)$'),'')::bigint;

      select *
      into v_order
      from public.taphoa_orders o
      where o.customer_account_id=p_customer_id
        and o.display_prefix=v_prefix
        and o.display_no=v_no
      order by o.updated_at desc
      limit 1;

      if found then
        v_order_json := public.taphoa_order_frontend_json(v_order);
        v_body := public.taphoa_chat_order_receipt(v_order_json,'Cập nhật',null);
      end if;
    end if;
  end if;

  -- Preserve transaction-provided collection note, old/new balance and ledger URL.

  if v_body='' or char_length(v_body)>8000 then raise exception 'chat_message_invalid'; end if;

  select c.id
  into v_conversation_id
  from public.v21_conversations c
  left join lateral (
    select max(m.created_at) as latest_at
    from public.v21_messages m
    where m.conversation_id=c.id
      and m.deleted_at is null
      and m.client_id not like 'taphoa:%'
  ) activity on true
  where (
    c.member_a=p_sender_account_id and c.member_b=p_customer_id
  ) or (
    c.member_a=p_customer_id and c.member_b=p_sender_account_id
  )
  order by activity.latest_at desc nulls last,c.created_at desc,c.id
  limit 1;

  if v_conversation_id is null then
    if p_sender_account_id::text < p_customer_id::text then
      v_member_a := p_sender_account_id;
      v_member_b := p_customer_id;
    else
      v_member_a := p_customer_id;
      v_member_b := p_sender_account_id;
    end if;

    insert into public.v21_conversations(member_a,member_b)
    values(v_member_a,v_member_b)
    on conflict(member_a,member_b)
    do update set member_a=excluded.member_a
    returning id into v_conversation_id;
  end if;

  insert into public.v21_messages(conversation_id,sender_account_id,client_id,body)
  values(v_conversation_id,p_sender_account_id,v_client_id,v_body)
  on conflict on constraint v21_messages_sender_account_id_client_id_key
  do nothing
  returning id into v_message_id;

  if v_message_id is null then
    select m.id into v_message_id
    from public.v21_messages m
    where m.sender_account_id=p_sender_account_id
      and m.client_id=v_client_id
    limit 1;
  end if;

  return v_message_id;
end;
$$;

CREATE OR REPLACE FUNCTION public.taphoa_debt_transaction(p_customer_id uuid, p_type text, p_amount numeric, p_note text, p_command_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
declare
  ctx jsonb := public.taphoa_access_context();
  prior jsonb;
  v_amount_vnd numeric;
  v_entry_type text;
  v_signed numeric;
  v_balance_before numeric;
  v_balance_after numeric;
  v_notice text;
  v_url text;
  v_result jsonb;
begin
  if not coalesce((ctx->>'allowed')::boolean,false) or ctx->>'taphoa_role'<>'admin' then
    raise exception 'taphoa_access_denied' using errcode='42501';
  end if;
  if p_command_id is null then raise exception 'command_id_required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_command_id::text,0));
  select result into prior from public.taphoa_command_log where command_id=p_command_id;
  if found then return prior; end if;

  if not exists(
    select 1 from public.v21_accounts a
    where a.id=p_customer_id and a.role='user' and a.contact_group='customer'
      and a.deleted_at is null and a.locked_at is null
  ) then raise exception 'customer_not_found'; end if;

  if coalesce(p_amount,0)<=0 then
    raise exception 'amount_must_be_positive';
  end if;

  if p_amount<>trunc(p_amount) then
    raise exception 'amount_must_be_whole_number';
  end if;

  v_amount_vnd := p_amount;
  if lower(coalesce(p_type,''))='collection' then
    v_entry_type := 'collection';
    v_signed := -v_amount_vnd;
  elsif lower(coalesce(p_type,''))='payment' then
    v_entry_type := 'payment';
    v_signed := v_amount_vnd;
  else
    v_entry_type := 'adjustment';
    v_signed := v_amount_vnd;
  end if;

  v_balance_before := public.taphoa_chat_customer_balance_value(p_customer_id);

  insert into public.taphoa_debt_ledger(
    customer_account_id,entry_type,amount_vnd,note,created_by_account_id
  )
  values(
    p_customer_id,v_entry_type,v_signed,coalesce(p_note,''),
    (ctx->>'account_id')::uuid
  );
  perform public.taphoa_bump_revision('debt');

  v_balance_after := public.taphoa_chat_customer_balance_value(p_customer_id);
  v_result := jsonb_build_object(
    'ok',true,
    'customer_id',p_customer_id::text,
    'movement',v_signed
  );

  if v_entry_type='collection' then
    v_notice := 'Đã thu ' || public.taphoa_chat_money(v_amount_vnd)
      || E'
' || public.taphoa_chat_balance_label(v_balance_before,true)
      || E'
' || public.taphoa_chat_balance_label(v_balance_after,false);

    if btrim(coalesce(p_note,''))<>'' then
      v_notice := v_notice || E'
Ghi chú: ' || left(btrim(p_note),120);
    end if;

    v_url := public.taphoa_customer_mini_link(p_customer_id,'no',null,null,null);
    if coalesce(v_url,'')<>'' then
      v_notice := v_notice || E'\nXem công nợ: ' || v_url;
    end if;
    perform public.taphoa_chat_notify_customer(
      p_customer_id,
      (ctx->>'account_id')::uuid,
      'taphoa:' || p_command_id::text || ':collection',
      v_notice
    );

  elsif v_entry_type='payment' then
    v_url := public.taphoa_customer_mini_link(
      p_customer_id,'no',null,null,null
    );

    v_notice := 'Ghi nợ ' || public.taphoa_chat_money(v_amount_vnd)
      || E'
' || public.taphoa_chat_balance_label(v_balance_before,true)
      || E'
' || public.taphoa_chat_balance_label(v_balance_after,false)
      || E'
' || public.taphoa_chat_when(now());

    if btrim(coalesce(p_note,''))<>'' then
      v_notice := v_notice || E'
Ghi chú: ' || left(btrim(p_note),120);
    end if;

    if coalesce(v_url,'')<>'' then
      v_notice := v_notice || E'
Xem công nợ: ' || v_url;
    end if;

    perform public.taphoa_chat_notify_customer(
      p_customer_id,
      (ctx->>'account_id')::uuid,
      'taphoa:' || p_command_id::text || ':debt',
      v_notice
    );
  end if;

  insert into public.taphoa_command_log(command_id,operation,result)
  values(p_command_id,'debt_transaction',v_result);

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
 if not found or v_order.customer_account_id is null or v_order.status <> 'delivered' then
   return jsonb_build_object('ok',false,'reason','not_delivered_customer_order');
 end if;
 v_code := v_order.display_prefix||v_order.display_no::text;
 if v_code !~ '^DG[0-9]+$' then
   return jsonb_build_object('ok',false,'reason','invalid_order_code');
 end if;
 select m.* into v_msg
 from public.v21_messages m
 join public.v21_conversations c on c.id=m.conversation_id
 where m.sender_account_id=v_sender
  and m.deleted_at is null
  and (c.member_a=v_order.customer_account_id or c.member_b=v_order.customer_account_id)
  and (m.client_id like 'taphoa:%:order' or m.client_id like 'taphoa:%:order-edit' or m.client_id like 'taphoa:%:deliver')
  and position(' · '||v_code||' · ' in m.body)>0
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

  if v_role='admin' and v_customer is not null and v_status='delivered' then
    if v_edit_id is null then
      if v_status='delivered' then
        v_notice := public.taphoa_chat_order_receipt(
          v_order_json,
          'Đơn ' || v_display_code || ' đã giao', null::bigint);
      else
        v_notice := null;
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
        case when v_edit_id is not null and v_old_status='delivered'
          then ':order-edit' else ':order' end,
      v_notice
    );
  end if;

  insert into public.taphoa_command_log(command_id,operation,result) values(p_command_id,'save_order',v_result);
  return v_result;
end;
$$;

-- Existing function privileges are preserved when functions are replaced.
