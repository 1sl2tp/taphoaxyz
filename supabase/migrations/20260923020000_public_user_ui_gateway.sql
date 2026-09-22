begin;

create or replace function public.taphoa_public_bootstrap_for_customer(p_customer_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public,auth
as $$
declare
  ctx jsonb;
  customer_row public.v21_accounts;
  customers jsonb;
  signals jsonb;
begin
  select * into customer_row
  from public.v21_accounts
  where id=p_customer_id
    and role='user'
    and contact_group='customer'
    and deleted_at is null
    and locked_at is null;
  if not found then raise exception 'customer_not_found'; end if;

  ctx:=jsonb_build_object(
    'account_id',customer_row.id::text,
    'username',customer_row.username,
    'display_name',customer_row.display_name,
    'taphoa_role','customer',
    'allowed',true
  );
  customers:=public.taphoa_customers_frontend_json(ctx);

  select coalesce(jsonb_agg(to_jsonb(s) order by s.product_code),'[]'::jsonb)
  into signals
  from public.taphoa_public_customer_product_signals(p_customer_id) s;

  return jsonb_build_object(
    'user',jsonb_build_object(
      'id',customer_row.id::text,
      'uid',customer_row.id::text,
      'username',customer_row.username,
      'ten',customer_row.display_name,
      'displayName',customer_row.display_name,
      'role','customer'
    ),
    'permissions',jsonb_build_object(
      'canManageOrders',false,
      'canManageDebt',false,
      'canViewCost',false
    ),
    'products',public.taphoa_products_frontend_json(),
    'sources',public.taphoa_sources_frontend_json(),
    'customers',customers,
    'orders',public.taphoa_orders_frontend_json(ctx),
    'debtSummary',public.taphoa_debt_summary_frontend_json(ctx),
    'printSettings','{}'::jsonb,
    'selfCustomer',customers->0,
    'signals',signals,
    'revisions',public.taphoa_revisions_json(),
    'version','taphoa-public-user-v1',
    'syncSeconds',30
  );
end;
$$;

create or replace function public.taphoa_public_domains_for_customer(
  p_customer_id uuid,
  p_domains text[]
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public,auth
as $$
declare
  ctx jsonb;
  customer_row public.v21_accounts;
  customers jsonb;
  signals jsonb;
  result jsonb:=jsonb_build_object('revisions',public.taphoa_revisions_json());
begin
  select * into customer_row
  from public.v21_accounts
  where id=p_customer_id
    and role='user'
    and contact_group='customer'
    and deleted_at is null
    and locked_at is null;
  if not found then raise exception 'customer_not_found'; end if;

  ctx:=jsonb_build_object(
    'account_id',customer_row.id::text,
    'username',customer_row.username,
    'display_name',customer_row.display_name,
    'taphoa_role','customer',
    'allowed',true
  );

  if 'products'=any(coalesce(p_domains,array[]::text[])) then
    select coalesce(jsonb_agg(to_jsonb(s) order by s.product_code),'[]'::jsonb)
    into signals
    from public.taphoa_public_customer_product_signals(p_customer_id) s;
    result:=result||jsonb_build_object(
      'products',public.taphoa_products_frontend_json(),
      'sources',public.taphoa_sources_frontend_json(),
      'signals',signals
    );
  end if;

  if 'customers'=any(coalesce(p_domains,array[]::text[])) then
    customers:=public.taphoa_customers_frontend_json(ctx);
    result:=result||jsonb_build_object('customers',customers,'selfCustomer',customers->0);
  end if;

  if 'orders'=any(coalesce(p_domains,array[]::text[])) then
    result:=result||jsonb_build_object('orders',public.taphoa_orders_frontend_json(ctx));
  end if;

  if 'debt'=any(coalesce(p_domains,array[]::text[])) then
    result:=result||jsonb_build_object('debtSummary',public.taphoa_debt_summary_frontend_json(ctx));
  end if;

  return result;
end;
$$;

create or replace function public.taphoa_public_order_detail_for_customer(
  p_customer_id uuid,
  p_order_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public,auth
as $$
declare
  o public.taphoa_orders;
begin
  select * into o
  from public.taphoa_orders
  where id=p_order_id and customer_account_id=p_customer_id;
  if not found then raise exception 'order_not_found'; end if;
  return jsonb_build_object('order',public.taphoa_order_frontend_json(o));
end;
$$;

create or replace function public.taphoa_public_debt_ledger_for_customer(
  p_customer_id uuid,
  p_before_at timestamptz default null,
  p_before_id bigint default null,
  p_limit integer default 50
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  customer_row public.v21_accounts;
  limit_rows integer:=greatest(1,least(100,coalesce(p_limit,50)));
  current_balance numeric;
  transactions jsonb;
begin
  select * into customer_row
  from public.v21_accounts
  where id=p_customer_id
    and role='user'
    and contact_group='customer'
    and deleted_at is null
    and locked_at is null;
  if not found then raise exception 'customer_not_found'; end if;

  select coalesce(sum(amount_vnd),0) into current_balance
  from public.taphoa_debt_ledger
  where customer_account_id=p_customer_id;

  with running as (
    select l.*,
      sum(l.amount_vnd) over(order by l.created_at,l.id rows between unbounded preceding and current row) as balance_after
    from public.taphoa_debt_ledger l
    where l.customer_account_id=p_customer_id
  ), page as (
    select * from running
    where p_before_at is null
       or (created_at,id)<(p_before_at,coalesce(p_before_id,9223372036854775807::bigint))
    order by created_at desc,id desc
    limit limit_rows
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id',id,
      'maDon',case when order_id is null then '' else order_id::text end,
      'order_id',case when order_id is null then '' else order_id::text end,
      'entryType',entry_type,
      'soTien',abs(amount_vnd)::numeric/1000.0,
      'amount',abs(amount_vnd)::numeric/1000.0,
      'bienDong',amount_vnd::numeric/1000.0,
      'movement',amount_vnd::numeric/1000.0,
      'balanceAfter',balance_after::numeric/1000.0,
      'balance_after',balance_after::numeric/1000.0,
      'ghiChu',note,
      'note',note,
      'ngay',created_at,
      'occurred_at',created_at
    ) order by created_at desc,id desc
  ),'[]'::jsonb)
  into transactions
  from page;

  return jsonb_build_object(
    'customer',jsonb_build_object(
      'id',customer_row.id::text,
      'maKH',customer_row.id::text,
      'ten',customer_row.display_name,
      'name',customer_row.display_name,
      'username',customer_row.username
    ),
    'soDu',current_balance/1000.0,
    'balance',current_balance/1000.0,
    'transactions',transactions
  );
end;
$$;

create or replace function public.taphoa_public_save_pending_order(
  p_customer_id uuid,
  p_order jsonb,
  p_command_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  prior jsonb;
  customer_row public.v21_accounts;
  v_edit_id uuid:=nullif(p_order->>'edit_order_id','')::uuid;
  v_order public.taphoa_orders;
  v_expected integer:=jsonb_array_length(coalesce(p_order->'items','[]'::jsonb));
  v_items integer:=0;
  v_old_costs jsonb:='{}'::jsonb;
  v_result jsonb;
begin
  if p_command_id is null then raise exception 'command_id_required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_command_id::text,0));
  select result into prior from public.taphoa_command_log where command_id=p_command_id;
  if found then return prior; end if;

  select * into customer_row
  from public.v21_accounts
  where id=p_customer_id
    and role='user'
    and contact_group='customer'
    and deleted_at is null
    and locked_at is null;
  if not found then raise exception 'customer_not_found'; end if;
  if v_expected<1 then raise exception 'order_items_required'; end if;

  if v_edit_id is null then
    insert into public.taphoa_orders(
      customer_account_id,status,note,created_by_account_id,delivered_at,display_prefix,display_no
    )
    values(
      p_customer_id,'pending',coalesce(p_order->>'note',''),p_customer_id,null,
      'DT',nextval('public.taphoa_order_display_no_dt_seq'::regclass)
    )
    returning * into v_order;
  else
    select * into v_order
    from public.taphoa_orders
    where id=v_edit_id
      and customer_account_id=p_customer_id
      and status='pending'
    for update;
    if not found then raise exception 'order_not_found'; end if;

    select coalesce(jsonb_object_agg(product_code,unit_cost_vnd_snapshot),'{}'::jsonb)
    into v_old_costs
    from public.taphoa_order_items
    where order_id=v_order.id;

    delete from public.taphoa_order_items where order_id=v_order.id;
    update public.taphoa_orders
    set note=coalesce(p_order->>'note',''),updated_at=now()
    where id=v_order.id
    returning * into v_order;
  end if;

  insert into public.taphoa_order_items(
    order_id,product_code,qty,unit_price_vnd,unit_cost_vnd_snapshot,line_no,note
  )
  select
    v_order.id,
    item->>'product_id',
    (item->>'qty')::numeric,
    (item->>'unit_price')::numeric,
    coalesce(
      nullif(v_old_costs->>(item->>'product_id'),'')::numeric,
      p.input_price_vnd,
      0
    ),
    (item->>'line_no')::integer,
    coalesce(item->>'note','')
  from jsonb_array_elements(p_order->'items') item
  join public.taphoa_products p
    on p.product_code=item->>'product_id'
   and p.is_active
   and p.deleted_at is null
  where coalesce((item->>'qty')::numeric,0)>0
    and coalesce((item->>'unit_price')::numeric,-1)>=0
    and coalesce((item->>'line_no')::integer,0)>0;

  get diagnostics v_items=row_count;
  if v_items<>v_expected then raise exception 'invalid_order_items'; end if;

  perform public.taphoa_bump_revision('orders');
  select * into v_order from public.taphoa_orders where id=v_order.id;
  v_result:=jsonb_build_object('ok',true,'order',public.taphoa_order_frontend_json(v_order));
  insert into public.taphoa_command_log(command_id,operation,result)
  values(p_command_id,'public_save_pending_order',v_result);
  return v_result;
end;
$$;

create or replace function public.taphoa_public_delete_pending_order(
  p_customer_id uuid,
  p_order_id uuid,
  p_command_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  prior jsonb;
  o public.taphoa_orders;
  v_result jsonb;
begin
  if p_command_id is null then raise exception 'command_id_required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_command_id::text,0));
  select result into prior from public.taphoa_command_log where command_id=p_command_id;
  if found then return prior; end if;

  select * into o
  from public.taphoa_orders
  where id=p_order_id
    and customer_account_id=p_customer_id
    and status='pending'
  for update;
  if not found then raise exception 'order_not_found'; end if;

  delete from public.taphoa_orders where id=o.id;
  perform public.taphoa_bump_revision('orders');
  v_result:=jsonb_build_object('ok',true,'deleted',o.id::text);
  insert into public.taphoa_command_log(command_id,operation,result)
  values(p_command_id,'public_delete_pending_order',v_result);
  return v_result;
end;
$$;

revoke all on function public.taphoa_public_bootstrap_for_customer(uuid) from public,anon,authenticated;
revoke all on function public.taphoa_public_domains_for_customer(uuid,text[]) from public,anon,authenticated;
revoke all on function public.taphoa_public_order_detail_for_customer(uuid,uuid) from public,anon,authenticated;
revoke all on function public.taphoa_public_debt_ledger_for_customer(uuid,timestamptz,bigint,integer) from public,anon,authenticated;
revoke all on function public.taphoa_public_save_pending_order(uuid,jsonb,uuid) from public,anon,authenticated;
revoke all on function public.taphoa_public_delete_pending_order(uuid,uuid,uuid) from public,anon,authenticated;

grant execute on function public.taphoa_public_bootstrap_for_customer(uuid) to service_role;
grant execute on function public.taphoa_public_domains_for_customer(uuid,text[]) to service_role;
grant execute on function public.taphoa_public_order_detail_for_customer(uuid,uuid) to service_role;
grant execute on function public.taphoa_public_debt_ledger_for_customer(uuid,timestamptz,bigint,integer) to service_role;
grant execute on function public.taphoa_public_save_pending_order(uuid,jsonb,uuid) to service_role;
grant execute on function public.taphoa_public_delete_pending_order(uuid,uuid,uuid) to service_role;

commit;
