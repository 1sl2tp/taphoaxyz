-- Allow customer accounts to create/edit/delete only their own pending orders.
-- Delivered/reversal/batch/debt mutations remain Admin-only.

create or replace function public.taphoa_save_order(p_order jsonb,p_command_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  ctx jsonb := public.taphoa_access_context();
  prior jsonb;
  v_role text := coalesce(ctx->>'taphoa_role','');
  v_account_id uuid := nullif(ctx->>'account_id','')::uuid;
  v_customer uuid;
  v_status text;
  v_note text := coalesce(p_order->>'note','');
  v_edit_id uuid;
  v_order public.taphoa_orders;
  v_old_status text := null;
  v_items integer := 0;
  v_expected integer := 0;
  v_total bigint := 0;
  v_result jsonb;
begin
  if not coalesce((ctx->>'allowed')::boolean,false) or v_role not in ('admin','customer') then
    raise exception 'taphoa_access_denied' using errcode='42501';
  end if;
  if p_command_id is null then raise exception 'command_id_required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_command_id::text,0));
  select result into prior from public.taphoa_command_log where command_id=p_command_id;
  if found then return prior; end if;

  v_customer := nullif(p_order->>'customer_id','')::uuid;
  v_status := case when lower(coalesce(p_order->>'status','pending')) in ('done','delivered') then 'delivered' else 'pending' end;
  v_edit_id := nullif(p_order->>'edit_order_id','')::uuid;

  if v_role='customer' then
    if v_status<>'pending' then
      raise exception 'taphoa_access_denied' using errcode='42501';
    end if;
    if v_customer is distinct from v_account_id then
      raise exception 'taphoa_access_denied' using errcode='42501';
    end if;
  end if;

  if v_customer is null or not exists(
    select 1 from public.v21_accounts a
    where a.id=v_customer and a.role='user' and a.contact_group='customer'
      and a.deleted_at is null and a.locked_at is null
  ) then raise exception 'customer_not_found'; end if;

  v_expected := jsonb_array_length(coalesce(p_order->'items','[]'::jsonb));
  if v_expected<1 then raise exception 'order_items_required'; end if;

  if v_edit_id is null then
    insert into public.taphoa_orders(customer_account_id,status,note,created_by_account_id,delivered_at)
    values(v_customer,v_status,v_note,v_account_id,case when v_status='delivered' then now() else null end)
    returning * into v_order;
  else
    select * into v_order from public.taphoa_orders where id=v_edit_id for update;
    if not found then raise exception 'order_not_found'; end if;

    if v_role='customer' then
      if v_order.customer_account_id is distinct from v_account_id then
        raise exception 'taphoa_access_denied' using errcode='42501';
      end if;
      if v_order.status<>'pending' then
        raise exception 'taphoa_access_denied' using errcode='42501';
      end if;
    end if;

    if v_order.status='reversed' then raise exception 'order_reversed'; end if;
    v_old_status := v_order.status;
    if v_old_status='delivered' and v_status<>'delivered' then raise exception 'delivered_order_cannot_be_pending'; end if;

    delete from public.taphoa_debt_ledger where order_id=v_order.id and entry_type='sale';
    delete from public.taphoa_order_items where order_id=v_order.id;
    update public.taphoa_orders
    set customer_account_id=v_customer,
        status=v_status,
        note=v_note,
        updated_at=now(),
        delivered_at=case when v_status='delivered' then coalesce(v_order.delivered_at,now()) else null end
    where id=v_order.id
    returning * into v_order;
  end if;

  insert into public.taphoa_order_items(order_id,product_code,qty,unit_price_vnd,line_no,note)
  select v_order.id,
         item->>'product_id',
         (item->>'qty')::numeric,
         round((item->>'unit_price')::numeric * 1000)::bigint,
         (item->>'line_no')::integer,
         coalesce(item->>'note','')
  from jsonb_array_elements(p_order->'items') item
  join public.taphoa_products p on p.product_code=item->>'product_id' and p.is_active
  where coalesce((item->>'qty')::numeric,0)>0
    and coalesce((item->>'unit_price')::numeric,-1)>=0
    and coalesce((item->>'line_no')::integer,0)>0;
  get diagnostics v_items=row_count;
  if v_items<>v_expected then raise exception 'invalid_order_items'; end if;

  if v_status='delivered' then
    select coalesce(sum(qty*unit_price_vnd),0)::bigint into v_total
    from public.taphoa_order_items where order_id=v_order.id;
    insert into public.taphoa_debt_ledger(customer_account_id,order_id,entry_type,amount_vnd,note,created_by_account_id)
    values(v_customer,v_order.id,'sale',v_total,'Giao đơn',v_account_id);
  end if;

  perform public.taphoa_bump_revision('orders');
  if v_status='delivered' or v_old_status='delivered' then perform public.taphoa_bump_revision('debt'); end if;

  select * into v_order from public.taphoa_orders where id=v_order.id;
  v_result := jsonb_build_object('ok',true,'order',public.taphoa_order_frontend_json(v_order));
  insert into public.taphoa_command_log(command_id,operation,result) values(p_command_id,'save_order',v_result);
  return v_result;
end;
$$;

create or replace function public.taphoa_delete_pending_order(p_order_id uuid,p_command_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  ctx jsonb := public.taphoa_access_context();
  prior jsonb;
  v_role text := coalesce(ctx->>'taphoa_role','');
  v_account_id uuid := nullif(ctx->>'account_id','')::uuid;
  o public.taphoa_orders;
  v_result jsonb;
begin
  if not coalesce((ctx->>'allowed')::boolean,false) or v_role not in ('admin','customer') then
    raise exception 'taphoa_access_denied' using errcode='42501';
  end if;
  if p_command_id is null then raise exception 'command_id_required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_command_id::text,0));
  select result into prior from public.taphoa_command_log where command_id=p_command_id;
  if found then return prior; end if;

  select * into o from public.taphoa_orders where id=p_order_id for update;
  if not found then raise exception 'order_not_found'; end if;

  if v_role='customer' and o.customer_account_id is distinct from v_account_id then
    raise exception 'taphoa_access_denied' using errcode='42501';
  end if;
  if o.status<>'pending' then raise exception 'order_not_pending'; end if;

  delete from public.taphoa_orders where id=o.id;
  perform public.taphoa_bump_revision('orders');

  v_result := jsonb_build_object('ok',true,'deleted',o.id::text);
  insert into public.taphoa_command_log(command_id,operation,result) values(p_command_id,'delete_pending_order',v_result);
  return v_result;
end;
$$;

revoke all on function public.taphoa_save_order(jsonb,uuid) from public;
revoke all on function public.taphoa_delete_pending_order(uuid,uuid) from public;
grant execute on function public.taphoa_save_order(jsonb,uuid) to authenticated;
grant execute on function public.taphoa_delete_pending_order(uuid,uuid) to authenticated;
