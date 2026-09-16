-- Stable human-facing order numbers. UUID remains the internal primary key.

create sequence if not exists public.taphoa_order_display_no_seq as bigint start with 1 increment by 1;

alter table public.taphoa_orders
  add column if not exists display_no bigint;

-- Preserve any existing display numbers and deterministically backfill only missing rows.
with base as (
  select coalesce(max(display_no),0)::bigint as max_no
  from public.taphoa_orders
), missing as (
  select id,
         row_number() over(order by created_at,id)::bigint as rn
  from public.taphoa_orders
  where display_no is null
)
update public.taphoa_orders o
set display_no = base.max_no + missing.rn
from base, missing
where o.id = missing.id;

do $$
declare
  v_max bigint;
begin
  select max(display_no) into v_max from public.taphoa_orders;
  if coalesce(v_max,0) > 0 then
    perform setval('public.taphoa_order_display_no_seq'::regclass,v_max,true);
  else
    perform setval('public.taphoa_order_display_no_seq'::regclass,1,false);
  end if;
end $$;

alter table public.taphoa_orders
  alter column display_no set default nextval('public.taphoa_order_display_no_seq'::regclass),
  alter column display_no set not null;

alter sequence public.taphoa_order_display_no_seq owned by public.taphoa_orders.display_no;

create unique index if not exists taphoa_orders_display_no_uidx
  on public.taphoa_orders(display_no);

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
    'backendOrderId',o.id::text,
    'displayNo',o.display_no,
    'display_no',o.display_no,
    'displayCode',(case when o.status in ('delivered','reversed') then 'DG' else 'DT' end) || o.display_no::text,
    'display_code',(case when o.status in ('delivered','reversed') then 'DG' else 'DT' end) || o.display_no::text,
    'maDon',(case when o.status in ('delivered','reversed') then 'DG' else 'DT' end) || o.display_no::text,
    'maKH',case when o.customer_account_id is null then 'le' else o.customer_account_id::text end,
    'customer_id',case when o.customer_account_id is null then null else o.customer_account_id::text end,
    'tenKH',coalesce(c.display_name,'Khách lẻ'),
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
  left join public.v21_accounts c on c.id=o.customer_account_id;
$$;

revoke all on function public.taphoa_order_frontend_json(public.taphoa_orders) from public;
