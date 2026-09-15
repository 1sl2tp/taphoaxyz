-- customer_privacy: strip cost/profit fields at the RPC boundary for customer accounts.
-- Admin responses remain backward-compatible; customer responses never contain input cost,
-- unit cost, total cost, or profit keys.

create or replace function public.taphoa_products_frontend_json()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  ctx jsonb := public.taphoa_access_context();
  can_view_cost boolean := coalesce(ctx->>'taphoa_role','') = 'admin';
  result jsonb;
begin
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id',p.product_code,
      'maSP',p.product_code,
      'product_code',p.product_code,
      'ten',p.product_name,
      'product_name',p.product_name,
      'gia',coalesce(p.sale_price_vnd,0)::numeric / 1000.0,
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
    ) || case when can_view_cost then jsonb_build_object(
      'von',case when p.input_price_vnd is null then null else p.input_price_vnd::numeric / 1000.0 end
    ) else '{}'::jsonb end
    order by s.sort_order,p.source_row,p.product_code
  ),'[]'::jsonb)
  into result
  from public.taphoa_products p
  join public.taphoa_sources s on s.source_key=p.source_key
  where p.is_active and s.active;

  return result;
end;
$$;

create or replace function public.taphoa_order_frontend_json(o public.taphoa_orders)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  ctx jsonb := public.taphoa_access_context();
  can_view_cost boolean := coalesce(ctx->>'taphoa_role','') = 'admin';
  result jsonb;
begin
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
          'nhom',p.source_key,
          'product_group',p.source_key,
          'lineNo',oi.line_no,
          'line_no',oi.line_no,
          'ghiChu',oi.note,
          'note',oi.note
        ) || case when can_view_cost then jsonb_build_object(
          'von',case when p.input_price_vnd is null then 0 else p.input_price_vnd::numeric / 1000.0 end,
          'unit_cost',case when p.input_price_vnd is null then 0 else p.input_price_vnd::numeric / 1000.0 end
        ) else '{}'::jsonb end
        order by oi.line_no,oi.id
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
    'items',l.items
  ) || case when can_view_cost then jsonb_build_object(
    'tongVon',l.cost_vnd::numeric / 1000.0,
    'loiNhuan',(l.total_vnd-l.cost_vnd)::numeric / 1000.0
  ) else '{}'::jsonb end
  into result
  from lines l
  join public.v21_accounts c on c.id=o.customer_account_id;

  return result;
end;
$$;

revoke all on function public.taphoa_products_frontend_json() from public;
revoke all on function public.taphoa_order_frontend_json(public.taphoa_orders) from public;
