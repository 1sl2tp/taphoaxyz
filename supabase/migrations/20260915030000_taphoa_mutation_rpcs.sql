-- Admin-only namespaced TAPHOA mutations with command-id idempotency.

create table if not exists public.taphoa_command_log (
  command_id uuid primary key,
  operation text not null,
  result jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists taphoa_command_log_created_idx
  on public.taphoa_command_log(created_at desc);

alter table public.taphoa_command_log enable row level security;
revoke all on table public.taphoa_command_log from anon, authenticated;

create or replace function public.taphoa_bump_revision(p_domain text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.taphoa_revisions
  set revision=revision+1,updated_at=now()
  where domain=p_domain;
  if not found then raise exception 'unknown_revision_domain:%',p_domain; end if;
end;
$$;

revoke all on function public.taphoa_bump_revision(text) from public;

create or replace function public.taphoa_save_order(p_order jsonb,p_command_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  ctx jsonb := public.taphoa_access_context();
  prior jsonb;
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
  if not coalesce((ctx->>'allowed')::boolean,false) or ctx->>'taphoa_role'<>'admin' then
    raise exception 'taphoa_access_denied' using errcode='42501';
  end if;
  if p_command_id is null then raise exception 'command_id_required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_command_id::text,0));
  select result into prior from public.taphoa_command_log where command_id=p_command_id;
  if found then return prior; end if;

  v_customer := nullif(p_order->>'customer_id','')::uuid;
  if v_customer is null or not exists(
    select 1 from public.v21_accounts a
    where a.id=v_customer and a.role='user' and a.contact_group='customer'
      and a.deleted_at is null and a.locked_at is null
  ) then raise exception 'customer_not_found'; end if;

  v_status := case when lower(coalesce(p_order->>'status','pending')) in ('done','delivered') then 'delivered' else 'pending' end;
  v_edit_id := nullif(p_order->>'edit_order_id','')::uuid;
  v_expected := jsonb_array_length(coalesce(p_order->'items','[]'::jsonb));
  if v_expected<1 then raise exception 'order_items_required'; end if;

  if v_edit_id is null then
    insert into public.taphoa_orders(customer_account_id,status,note,created_by_account_id,delivered_at)
    values(v_customer,v_status,v_note,(ctx->>'account_id')::uuid,case when v_status='delivered' then now() else null end)
    returning * into v_order;
  else
    select * into v_order from public.taphoa_orders where id=v_edit_id for update;
    if not found then raise exception 'order_not_found'; end if;
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
    values(v_customer,v_order.id,'sale',v_total,'Giao đơn',(ctx->>'account_id')::uuid);
  end if;

  perform public.taphoa_bump_revision('orders');
  if v_status='delivered' or v_old_status='delivered' then perform public.taphoa_bump_revision('debt'); end if;

  select * into v_order from public.taphoa_orders where id=v_order.id;
  v_result := jsonb_build_object('ok',true,'order',public.taphoa_order_frontend_json(v_order));
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

  update public.taphoa_orders set status='delivered',delivered_at=now(),updated_at=now()
  where id=o.id returning * into o;
  select coalesce(sum(qty*unit_price_vnd),0)::bigint into v_total
  from public.taphoa_order_items where order_id=o.id;
  if v_total<=0 then raise exception 'order_total_invalid'; end if;

  insert into public.taphoa_debt_ledger(customer_account_id,order_id,entry_type,amount_vnd,note,created_by_account_id)
  values(o.customer_account_id,o.id,'sale',v_total,'Giao đơn',(ctx->>'account_id')::uuid);
  perform public.taphoa_bump_revision('orders');
  perform public.taphoa_bump_revision('debt');

  v_result := jsonb_build_object('ok',true,'order',public.taphoa_order_frontend_json(o));
  insert into public.taphoa_command_log(command_id,operation,result) values(p_command_id,'deliver_order',v_result);
  return v_result;
end;
$$;

create or replace function public.taphoa_reverse_order(p_order_id uuid,p_reason text,p_command_id uuid)
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
  if o.status<>'delivered' then raise exception 'order_not_delivered'; end if;

  select coalesce(sum(qty*unit_price_vnd),0)::bigint into v_total
  from public.taphoa_order_items where order_id=o.id;
  update public.taphoa_orders set status='reversed',reversed_at=now(),updated_at=now()
  where id=o.id returning * into o;
  insert into public.taphoa_debt_ledger(customer_account_id,order_id,entry_type,amount_vnd,note,created_by_account_id)
  values(o.customer_account_id,o.id,'reversal',-v_total,coalesce(nullif(btrim(p_reason),''),'Hoàn đơn'),(ctx->>'account_id')::uuid);
  perform public.taphoa_bump_revision('orders');
  perform public.taphoa_bump_revision('debt');

  v_result := jsonb_build_object('ok',true,'order',public.taphoa_order_frontend_json(o));
  insert into public.taphoa_command_log(command_id,operation,result) values(p_command_id,'reverse_order',v_result);
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
  o public.taphoa_orders;
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
  delete from public.taphoa_orders where id=o.id;
  perform public.taphoa_bump_revision('orders');

  v_result := jsonb_build_object('ok',true,'deleted',o.id::text);
  insert into public.taphoa_command_log(command_id,operation,result) values(p_command_id,'delete_pending_order',v_result);
  return v_result;
end;
$$;

create or replace function public.taphoa_batch_orders(p_action text,p_ids uuid[],p_command_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  ctx jsonb := public.taphoa_access_context();
  prior jsonb;
  v_deleted integer := 0;
  v_result jsonb;
begin
  if not coalesce((ctx->>'allowed')::boolean,false) or ctx->>'taphoa_role'<>'admin' then
    raise exception 'taphoa_access_denied' using errcode='42501';
  end if;
  if p_command_id is null then raise exception 'command_id_required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_command_id::text,0));
  select result into prior from public.taphoa_command_log where command_id=p_command_id;
  if found then return prior; end if;
  if lower(coalesce(p_action,''))<>'delete_pending' then raise exception 'unsupported_batch_action'; end if;

  perform 1 from public.taphoa_orders where id=any(coalesce(p_ids,array[]::uuid[])) order by id for update;
  delete from public.taphoa_orders where id=any(coalesce(p_ids,array[]::uuid[])) and status='pending';
  get diagnostics v_deleted=row_count;
  if v_deleted>0 then perform public.taphoa_bump_revision('orders'); end if;

  v_result := jsonb_build_object('ok',true,'action','delete_pending','deleted',v_deleted);
  insert into public.taphoa_command_log(command_id,operation,result) values(p_command_id,'batch_orders',v_result);
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
  insert into public.taphoa_command_log(command_id,operation,result) values(p_command_id,'debt_transaction',v_result);
  return v_result;
end;
$$;

revoke all on function public.taphoa_save_order(jsonb,uuid) from public;
revoke all on function public.taphoa_deliver_order(uuid,uuid) from public;
revoke all on function public.taphoa_reverse_order(uuid,text,uuid) from public;
revoke all on function public.taphoa_delete_pending_order(uuid,uuid) from public;
revoke all on function public.taphoa_batch_orders(text,uuid[],uuid) from public;
revoke all on function public.taphoa_debt_transaction(uuid,text,numeric,text,uuid) from public;

grant execute on function public.taphoa_save_order(jsonb,uuid) to authenticated;
grant execute on function public.taphoa_deliver_order(uuid,uuid) to authenticated;
grant execute on function public.taphoa_reverse_order(uuid,text,uuid) to authenticated;
grant execute on function public.taphoa_delete_pending_order(uuid,uuid) to authenticated;
grant execute on function public.taphoa_batch_orders(text,uuid[],uuid) to authenticated;
grant execute on function public.taphoa_debt_transaction(uuid,text,numeric,text,uuid) to authenticated;
