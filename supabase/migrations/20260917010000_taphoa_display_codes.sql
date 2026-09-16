-- Stable human-facing TAPHOA order numbers.
-- UUID remains the only database/RPC identity; order_no is display metadata only.

lock table public.taphoa_orders in share row exclusive mode;

create sequence if not exists public.taphoa_order_no_seq;

alter table public.taphoa_orders
  add column if not exists order_no bigint;

alter sequence public.taphoa_order_no_seq
  owned by public.taphoa_orders.order_no;

alter table public.taphoa_orders
  alter column order_no set default nextval('public.taphoa_order_no_seq');

with base as (
  select coalesce(max(order_no),0)::bigint as max_no
  from public.taphoa_orders
), numbered as (
  select o.id,
         (select max_no from base) + row_number() over(order by o.created_at,o.id) as next_no
  from public.taphoa_orders o
  where o.order_no is null
)
update public.taphoa_orders o
set order_no=n.next_no
from numbered n
where n.id=o.id;

select setval(
  'public.taphoa_order_no_seq',
  greatest(coalesce((select max(order_no) from public.taphoa_orders),0),1),
  coalesce((select max(order_no) from public.taphoa_orders),0) > 0
);

alter table public.taphoa_orders
  alter column order_no set not null;

create unique index if not exists taphoa_orders_order_no_uidx
  on public.taphoa_orders(order_no);

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
    'order_id',o.id::text,
    'orderNo',o.order_no,
    'order_no',o.order_no,
    'displayCode',(case when o.status='pending' then 'DT' else 'DG' end) || o.order_no::text,
    'orderDisplayCode',(case when o.status='pending' then 'DT' else 'DG' end) || o.order_no::text,
    'maKH',o.customer_account_id::text,
    'customer_id',o.customer_account_id::text,
    'tenKH',c.display_name,
    'status',case when o.status = 'delivered' then 'done' when o.status='pending' then 'pending' else 'reversed' end,
    'trangThai',case when o.status = 'delivered' then 'done' when o.status='pending' then 'pending' else 'reversed' end,
    'note',o.note,
    'ghiChu',o.note,
    'ngay',coalesce(o.delivered_at,o.created_at),
    'ordered_at',o.created_at,
    'created_at',o.created_at,
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
      o.order_no,
      sum(l.amount_vnd) over(order by l.created_at,l.id rows between unbounded preceding and current row) as balance_after
    from public.taphoa_debt_ledger l
    left join public.taphoa_orders o on o.id=l.order_id
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
      'orderNo',order_no,
      'order_no',order_no,
      'displayCode',case when order_id is null or order_no is null then '' else 'DG' || order_no::text end,
      'orderDisplayCode',case when order_id is null or order_no is null then '' else 'DG' || order_no::text end,
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

revoke all on function public.taphoa_order_frontend_json(public.taphoa_orders) from public;
revoke all on function public.taphoa_debt_ledger_page(uuid,timestamptz,bigint,integer) from public;
grant execute on function public.taphoa_debt_ledger_page(uuid,timestamptz,bigint,integer) to authenticated;
