-- Namespaced TAPHOA read boundary over the independent taphoa_* tables.

create or replace function public.taphoa_revisions_json()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_object_agg(r.domain,r.revision),'{}'::jsonb)
  from public.taphoa_revisions r;
$$;

create or replace function public.taphoa_products_frontend_json()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id',p.product_code,
      'maSP',p.product_code,
      'product_code',p.product_code,
      'ten',p.product_name,
      'product_name',p.product_name,
      'gia',coalesce(p.sale_price_vnd,0)::numeric / 1000.0,
      'von',case when p.input_price_vnd is null then null else p.input_price_vnd::numeric / 1000.0 end,
      'nhom',p.source_key,
      'product_group',p.source_key,
      'donVi',case when p.input_price_basis='retail' then coalesce(nullif(p.retail_unit,''),'lẻ') else 'thùng' end,
      'donViLe',p.retail_unit,
      'quyCach',p.units_per_carton,
      'quyDoiThung',p.units_per_carton,
      'giaLe',case when p.retail_price_vnd is null then null else p.retail_price_vnd::numeric / 1000.0 end,
      'active',p.is_active,
      'stockStatus',p.stock_status,
      'stockLabel',p.stock_label
    ) order by s.sort_order,p.source_row,p.product_code
  ),'[]'::jsonb)
  from public.taphoa_products p
  join public.taphoa_sources s on s.source_key=p.source_key
  where p.is_active and s.active;
$$;

create or replace function public.taphoa_sources_frontend_json()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(
    jsonb_build_object('id',s.source_key,'key',s.source_key,'name',s.name,'ten',s.name,'active',s.active)
    order by s.sort_order,s.source_key
  ),'[]'::jsonb)
  from public.taphoa_sources s
  where s.active;
$$;

create or replace function public.taphoa_customers_frontend_json(p_ctx jsonb)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id',a.id::text,
      'maKH',a.id::text,
      'ten',a.display_name,
      'name',a.display_name,
      'username',a.username,
      'active',true
    ) order by a.display_name,a.username
  ),'[]'::jsonb)
  from public.v21_accounts a
  where a.role = 'user'
    and a.contact_group = 'customer'
    and a.deleted_at is null
    and a.locked_at is null
    and (
      p_ctx->>'taphoa_role' = 'admin'
      or a.id = nullif(p_ctx->>'account_id','')::uuid
    );
$$;

create or replace function public.taphoa_order_frontend_json(o public.taphoa_orders)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with lines as (
    select
      coalesce(jsonb_agg(
        jsonb_build_object(
          'id',oi.id,
          'maSP',oi.product_code,
          'product_id',oi.product_code,
          'tenSP',p.product_name,
          'ten',p.product_name,
          'product_name',p.product_name,
          'sl',oi.qty,
          'qty',oi.qty,
          'gia',oi.unit_price_vnd::numeric / 1000.0,
          'unit_price',oi.unit_price_vnd::numeric / 1000.0,
          'von',case when p.input_price_vnd is null then 0 else p.input_price_vnd::numeric / 1000.0 end,
          'unit_cost',case when p.input_price_vnd is null then 0 else p.input_price_vnd::numeric / 1000.0 end,
          'nhom',p.source_key,
          'product_group',p.source_key,
          'lineNo',oi.line_no,
          'line_no',oi.line_no,
          'ghiChu',oi.note,
          'note',oi.note
        ) order by oi.line_no,oi.id
      ),'[]'::jsonb) as items,
      coalesce(sum(oi.qty),0) as total_qty,
      count(*)::integer as total_codes,
      coalesce(sum(oi.qty * oi.unit_price_vnd),0) as total_vnd,
      coalesce(sum(oi.qty * coalesce(p.input_price_vnd,0)),0) as cost_vnd
    from public.taphoa_order_items oi
    join public.taphoa_products p on p.product_code=oi.product_code
    where oi.order_id=o.id
  )
  select jsonb_build_object(
    'id',o.id::text,
    'maKH',o.customer_account_id::text,
    'customer_id',o.customer_account_id::text,
    'tenKH',c.display_name,
    'status',case when o.status = 'delivered' then 'done' when o.status='pending' then 'pending' else 'reversed' end,
    'trangThai',case when o.status = 'delivered' then 'done' when o.status='pending' then 'pending' else 'reversed' end,
    'note',o.note,
    'ghiChu',o.note,
    'ngay',coalesce(o.delivered_at,o.created_at),
    'ordered_at',o.created_at,
    'delivered_at',o.delivered_at,
    'tongMa',l.total_codes,
    'tongSL',l.total_qty,
    'tongTien',l.total_vnd::numeric / 1000.0,
    'tongVon',l.cost_vnd::numeric / 1000.0,
    'loiNhuan',(l.total_vnd-l.cost_vnd)::numeric / 1000.0,
    'items',l.items
  )
  from lines l
  join public.v21_accounts c on c.id=o.customer_account_id;
$$;

create or replace function public.taphoa_orders_frontend_json(p_ctx jsonb)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(public.taphoa_order_frontend_json(o) order by o.created_at desc,o.id),'[]'::jsonb)
  from public.taphoa_orders o
  where p_ctx->>'taphoa_role'='admin'
     or o.customer_account_id=nullif(p_ctx->>'account_id','')::uuid;
$$;

create or replace function public.taphoa_debt_summary_frontend_json(p_ctx jsonb)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id',a.id::text,
      'maKH',a.id::text,
      'ten',a.display_name,
      'name',a.display_name,
      'username',a.username,
      'soDu',coalesce(d.balance_vnd,0)::numeric / 1000.0,
      'balance',coalesce(d.balance_vnd,0)::numeric / 1000.0,
      'transactionCount',coalesce(d.tx_count,0),
      'count',coalesce(d.tx_count,0),
      'lastTransaction',d.last_at,
      'last',d.last_at
    ) order by abs(coalesce(d.balance_vnd,0)) desc,a.display_name
  ),'[]'::jsonb)
  from public.v21_accounts a
  left join lateral (
    select coalesce(sum(l.amount_vnd),0)::bigint as balance_vnd,
           count(*)::integer as tx_count,
           max(l.created_at) as last_at
    from public.taphoa_debt_ledger l
    where l.customer_account_id=a.id
  ) d on true
  where a.role = 'user'
    and a.contact_group = 'customer'
    and a.deleted_at is null
    and a.locked_at is null
    and (
      p_ctx->>'taphoa_role'='admin'
      or a.id=nullif(p_ctx->>'account_id','')::uuid
    );
$$;

create or replace function public.taphoa_app_meta()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  ctx jsonb := public.taphoa_access_context();
begin
  if not coalesce((ctx->>'allowed')::boolean,false) then
    raise exception 'taphoa_access_denied' using errcode='42501';
  end if;
  return jsonb_build_object(
    'version','taphoa-independent-v1',
    'syncSeconds',30,
    'permissions',jsonb_build_object(
      'canManageOrders',ctx->>'taphoa_role'='admin',
      'canManageDebt',ctx->>'taphoa_role'='admin',
      'canViewCost',ctx->>'taphoa_role'='admin'
    ),
    'revisions',public.taphoa_revisions_json()
  );
end;
$$;

create or replace function public.taphoa_app_bootstrap()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  ctx jsonb := public.taphoa_access_context();
  customers jsonb;
  self_customer jsonb := null;
  permissions jsonb;
begin
  if not coalesce((ctx->>'allowed')::boolean,false) then
    raise exception 'taphoa_access_denied' using errcode='42501';
  end if;

  customers := public.taphoa_customers_frontend_json(ctx);
  if ctx->>'taphoa_role'='customer' then
    self_customer := customers->0;
  end if;
  permissions := jsonb_build_object(
    'canManageOrders',ctx->>'taphoa_role'='admin',
    'canManageDebt',ctx->>'taphoa_role'='admin',
    'canViewCost',ctx->>'taphoa_role'='admin'
  );

  return jsonb_build_object(
    'user',jsonb_build_object(
      'id',ctx->>'account_id',
      'uid',ctx->>'account_id',
      'username',ctx->>'username',
      'ten',ctx->>'display_name',
      'displayName',ctx->>'display_name',
      'role',ctx->>'taphoa_role'
    ),
    'permissions',permissions,
    'products',public.taphoa_products_frontend_json(),
    'sources',public.taphoa_sources_frontend_json(),
    'customers',customers,
    'orders',public.taphoa_orders_frontend_json(ctx),
    'debtSummary',public.taphoa_debt_summary_frontend_json(ctx),
    'printSettings','{}'::jsonb,
    'selfCustomer',self_customer,
    'revisions',public.taphoa_revisions_json(),
    'version','taphoa-independent-v1',
    'syncSeconds',30
  );
end;
$$;

create or replace function public.taphoa_app_domains(p_domains text[])
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  ctx jsonb := public.taphoa_access_context();
  result jsonb := jsonb_build_object('revisions',public.taphoa_revisions_json());
  customers jsonb;
begin
  if not coalesce((ctx->>'allowed')::boolean,false) then
    raise exception 'taphoa_access_denied' using errcode='42501';
  end if;

  if 'products'=any(coalesce(p_domains,array[]::text[])) then
    result := result || jsonb_build_object(
      'products',public.taphoa_products_frontend_json(),
      'sources',public.taphoa_sources_frontend_json()
    );
  end if;
  if 'customers'=any(coalesce(p_domains,array[]::text[])) then
    customers := public.taphoa_customers_frontend_json(ctx);
    result := result || jsonb_build_object(
      'customers',customers,
      'selfCustomer',case when ctx->>'taphoa_role'='customer' then customers->0 else null end
    );
  end if;
  if 'orders'=any(coalesce(p_domains,array[]::text[])) then
    result := result || jsonb_build_object('orders',public.taphoa_orders_frontend_json(ctx));
  end if;
  if 'debt'=any(coalesce(p_domains,array[]::text[])) then
    result := result || jsonb_build_object('debtSummary',public.taphoa_debt_summary_frontend_json(ctx));
  end if;
  if 'settings'=any(coalesce(p_domains,array[]::text[])) then
    result := result || jsonb_build_object('printSettings','{}'::jsonb);
  end if;

  return result;
end;
$$;

create or replace function public.taphoa_order_detail(p_order_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  ctx jsonb := public.taphoa_access_context();
  o public.taphoa_orders;
begin
  if not coalesce((ctx->>'allowed')::boolean,false) then
    raise exception 'taphoa_access_denied' using errcode='42501';
  end if;

  select * into o from public.taphoa_orders where id=p_order_id;
  if not found then raise exception 'order_not_found' using errcode='P0002'; end if;
  if ctx->>'taphoa_role'<>'admin' and o.customer_account_id<>nullif(ctx->>'account_id','')::uuid then
    raise exception 'taphoa_access_denied' using errcode='42501';
  end if;

  return jsonb_build_object('order',public.taphoa_order_frontend_json(o));
end;
$$;

create or replace function public.taphoa_debt_ledger_page(
  p_customer_id uuid,
  p_before_at timestamptz default null,
  p_before_id bigint default null,
  p_limit integer default 50
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  ctx jsonb := public.taphoa_access_context();
  customer_row public.v21_accounts;
  limit_rows integer := greatest(1,least(100,coalesce(p_limit,50)));
  current_balance bigint;
  transactions jsonb;
begin
  if not coalesce((ctx->>'allowed')::boolean,false) then
    raise exception 'taphoa_access_denied' using errcode='42501';
  end if;
  if ctx->>'taphoa_role'<>'admin' and p_customer_id<>nullif(ctx->>'account_id','')::uuid then
    raise exception 'taphoa_access_denied' using errcode='42501';
  end if;

  select * into customer_row
  from public.v21_accounts
  where id=p_customer_id
    and role='user'
    and contact_group='customer'
    and deleted_at is null
    and locked_at is null;
  if not found then raise exception 'customer_not_found' using errcode='P0002'; end if;

  select coalesce(sum(amount_vnd),0)::bigint into current_balance
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
       or (created_at,id) < (p_before_at,coalesce(p_before_id,9223372036854775807::bigint))
    order by created_at desc,id desc
    limit limit_rows
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id',id,
      'maDon',case when order_id is null then '' else order_id::text end,
      'order_id',case when order_id is null then '' else order_id::text end,
      'entryType',entry_type,
      'soTien',abs(amount_vnd)::numeric / 1000.0,
      'amount',abs(amount_vnd)::numeric / 1000.0,
      'bienDong',amount_vnd::numeric / 1000.0,
      'movement',amount_vnd::numeric / 1000.0,
      'balanceAfter',balance_after::numeric / 1000.0,
      'balance_after',balance_after::numeric / 1000.0,
      'ghiChu',note,
      'note',note,
      'ngay',created_at,
      'occurred_at',created_at
    ) order by created_at desc,id desc
  ),'[]'::jsonb) into transactions
  from page;

  return jsonb_build_object(
    'customer',jsonb_build_object(
      'id',customer_row.id::text,
      'maKH',customer_row.id::text,
      'ten',customer_row.display_name,
      'name',customer_row.display_name,
      'username',customer_row.username
    ),
    'soDu',current_balance::numeric / 1000.0,
    'balance',current_balance::numeric / 1000.0,
    'transactions',transactions
  );
end;
$$;

revoke all on function public.taphoa_revisions_json() from public;
revoke all on function public.taphoa_products_frontend_json() from public;
revoke all on function public.taphoa_sources_frontend_json() from public;
revoke all on function public.taphoa_customers_frontend_json(jsonb) from public;
revoke all on function public.taphoa_order_frontend_json(public.taphoa_orders) from public;
revoke all on function public.taphoa_orders_frontend_json(jsonb) from public;
revoke all on function public.taphoa_debt_summary_frontend_json(jsonb) from public;

revoke all on function public.taphoa_app_meta() from public;
revoke all on function public.taphoa_app_bootstrap() from public;
revoke all on function public.taphoa_app_domains(text[]) from public;
revoke all on function public.taphoa_order_detail(uuid) from public;
revoke all on function public.taphoa_debt_ledger_page(uuid,timestamptz,bigint,integer) from public;

grant execute on function public.taphoa_app_meta() to authenticated;
grant execute on function public.taphoa_app_bootstrap() to authenticated;
grant execute on function public.taphoa_app_domains(text[]) to authenticated;
grant execute on function public.taphoa_order_detail(uuid) to authenticated;
grant execute on function public.taphoa_debt_ledger_page(uuid,timestamptz,bigint,integer) to authenticated;
