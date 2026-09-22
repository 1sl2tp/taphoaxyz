-- Send TAPHOA business lifecycle notices into the canonical V21 chat conversation.
-- The message insert is server-side and command-idempotent; existing V21 triggers fan it out to realtime/Zalo.

create or replace function public.taphoa_chat_notify_customer(
  p_customer_id uuid,
  p_sender_account_id uuid,
  p_client_id text,
  p_body text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member_a uuid;
  v_member_b uuid;
  v_conversation_id uuid;
  v_message_id uuid;
  v_client_id text := left(btrim(coalesce(p_client_id,'')),120);
  v_body text := btrim(coalesce(p_body,''));
begin
  if p_customer_id is null or p_sender_account_id is null then
    return null;
  end if;
  if v_client_id='' then raise exception 'chat_client_id_required'; end if;
  if v_body='' or char_length(v_body)>8000 then raise exception 'chat_message_invalid'; end if;

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

revoke all on function public.taphoa_chat_notify_customer(uuid,uuid,text,text) from public, anon, authenticated;

create or replace function public.taphoa_save_order(p_order jsonb,p_command_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
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
  v_prefix text;
  v_items integer := 0;
  v_expected integer := 0;
  v_total bigint := 0;
  v_order_json jsonb;
  v_display_code text;
  v_notice text;
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
    v_old_customer := v_order.customer_account_id;
    if v_old_status='delivered' and v_status<>'delivered' then raise exception 'delivered_order_cannot_be_pending'; end if;

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
         round((item->>'unit_price')::numeric * 1000)::bigint,
         coalesce(
           nullif(v_old_costs->>(item->>'product_id'),'')::bigint,
           p.input_price_vnd,
           0
         ),
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
    select coalesce(sum(qty*unit_price_vnd),0)::bigint into v_total
    from public.taphoa_order_items where order_id=v_order.id;
    insert into public.taphoa_debt_ledger(customer_account_id,order_id,entry_type,amount_vnd,note,created_by_account_id)
    values(v_customer,v_order.id,'sale',v_total,'Giao đơn',v_account_id);
  end if;

  perform public.taphoa_bump_revision('orders');
  if (v_old_status='delivered' and v_old_customer is not null)
     or (v_status='delivered' and v_customer is not null) then
    perform public.taphoa_bump_revision('debt');
  end if;

  select * into v_order from public.taphoa_orders where id=v_order.id;
  v_order_json := public.taphoa_order_frontend_json(v_order);
  v_display_code := coalesce(nullif(v_order_json->>'displayCode',''),v_order.id::text);
  v_result := jsonb_build_object('ok',true,'order',v_order_json);

  if v_role='admin' and v_customer is not null then
    if v_edit_id is null then
      if v_status='delivered' then
        v_notice := 'Đơn ' || v_display_code || ' đã được giao.';
      else
        v_notice := 'Đơn ' || v_display_code || ' đã được tạo.';
      end if;
    elsif v_old_status='pending' and v_status='delivered' then
      v_notice := 'Đơn ' || v_display_code || ' đã được giao.';
    else
      v_notice := 'Đơn ' || v_display_code || ' đã được cập nhật.';
    end if;

    perform public.taphoa_chat_notify_customer(
      v_customer,
      v_account_id,
      'taphoa:' || p_command_id::text || ':order',
      v_notice
    );
  end if;

  insert into public.taphoa_command_log(command_id,operation,result) values(p_command_id,'save_order',v_result);
  return v_result;
end;
$$;

create or replace function public.taphoa_deliver_order(p_order_id uuid,p_command_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  ctx jsonb := public.taphoa_access_context();
  prior jsonb;
  o public.taphoa_orders;
  v_total bigint;
  v_order_json jsonb;
  v_display_code text;
  v_result jsonb;
begin
  if not coalesce((ctx->>'allowed')::boolean,false) or ctx->>'taphoa_role'<>'admin' then
    raise exception 'taphoa_access_denied' using errcode='42501';
  end if;
  if p_command_id is null then raise exception 'command_id_required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_command_id::text,0));
  select result into prior from public.taphoa_command_log where command_id=p_command_id;
  if found then return prior; end if;

  select * into o from public.taphoa_orders where id=p_order_id for update;
  if not found then raise exception 'order_not_found'; end if;
  if o.status<>'pending' then raise exception 'order_not_pending'; end if;

  update public.taphoa_orders
  set status='delivered',
      delivered_at=now(),
      updated_at=now(),
      display_prefix='DG',
      display_no=nextval('public.taphoa_order_display_no_dg_seq'::regclass)
  where id=o.id returning * into o;
  select coalesce(sum(qty*unit_price_vnd),0)::bigint into v_total
  from public.taphoa_order_items where order_id=o.id;
  if v_total<=0 then raise exception 'order_total_invalid'; end if;

  if o.customer_account_id is not null then
    insert into public.taphoa_debt_ledger(customer_account_id,order_id,entry_type,amount_vnd,note,created_by_account_id)
    values(o.customer_account_id,o.id,'sale',v_total,'Giao đơn',(ctx->>'account_id')::uuid);
    perform public.taphoa_bump_revision('debt');
  end if;
  perform public.taphoa_bump_revision('orders');

  v_order_json := public.taphoa_order_frontend_json(o);
  v_display_code := coalesce(nullif(v_order_json->>'displayCode',''),o.id::text);
  v_result := jsonb_build_object('ok',true,'order',v_order_json);

  if o.customer_account_id is not null then
    perform public.taphoa_chat_notify_customer(
      o.customer_account_id,
      (ctx->>'account_id')::uuid,
      'taphoa:' || p_command_id::text || ':deliver',
      'Đơn ' || v_display_code || ' đã được giao.'
    );
  end if;

  insert into public.taphoa_command_log(command_id,operation,result) values(p_command_id,'deliver_order',v_result);
  return v_result;
end;
$$;

create or replace function public.taphoa_debt_transaction(
  p_customer_id uuid,
  p_type text,
  p_amount numeric,
  p_note text,
  p_command_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  ctx jsonb := public.taphoa_access_context();
  prior jsonb;
  v_amount_vnd bigint;
  v_entry_type text;
  v_signed bigint;
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
  if coalesce(p_amount,0)<=0 then raise exception 'amount_must_be_positive'; end if;

  v_amount_vnd := round(p_amount * 1000)::bigint;
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

  insert into public.taphoa_debt_ledger(customer_account_id,entry_type,amount_vnd,note,created_by_account_id)
  values(p_customer_id,v_entry_type,v_signed,coalesce(p_note,''),(ctx->>'account_id')::uuid);
  perform public.taphoa_bump_revision('debt');

  v_result := jsonb_build_object('ok',true,'customer_id',p_customer_id::text,'movement',v_signed::numeric/1000.0);

  if v_entry_type='collection' then
    perform public.taphoa_chat_notify_customer(
      p_customer_id,
      (ctx->>'account_id')::uuid,
      'taphoa:' || p_command_id::text || ':collection',
      'Đã thu tiền ' || replace(to_char(v_amount_vnd,'FM999,999,999,999,990'),',','.') || 'đ.'
    );
  end if;

  insert into public.taphoa_command_log(command_id,operation,result) values(p_command_id,'debt_transaction',v_result);
  return v_result;
end;
$$;

revoke all on function public.taphoa_save_order(jsonb,uuid) from public;
revoke all on function public.taphoa_deliver_order(uuid,uuid) from public;
revoke all on function public.taphoa_debt_transaction(uuid,text,numeric,text,uuid) from public;

grant execute on function public.taphoa_save_order(jsonb,uuid) to authenticated;
grant execute on function public.taphoa_deliver_order(uuid,uuid) to authenticated;
grant execute on function public.taphoa_debt_transaction(uuid,text,numeric,text,uuid) to authenticated;
