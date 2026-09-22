begin;

create or replace function public.taphoa_public_customer_product_signals(p_customer_id uuid)
returns table(
  product_code text,
  order_count integer,
  total_qty numeric,
  last_bought_at timestamptz,
  market_customer_count integer,
  market_qty numeric,
  last_market_bought_at timestamptz
)
language sql
stable
security definer
set search_path = public,pg_temp
as $$
  with personal as (
    select
      i.product_code,
      count(distinct o.id)::integer as order_count,
      sum(i.qty)::numeric as total_qty,
      max(o.delivered_at) as last_bought_at
    from public.taphoa_orders o
    join public.taphoa_order_items i on i.order_id=o.id
    where o.customer_account_id=p_customer_id
      and o.status='delivered'
    group by i.product_code
  ),
  market as (
    select
      i.product_code,
      count(distinct o.customer_account_id)::integer as market_customer_count,
      sum(i.qty)::numeric as market_qty,
      max(o.delivered_at) as last_market_bought_at
    from public.taphoa_orders o
    join public.taphoa_order_items i on i.order_id=o.id
    where o.status='delivered'
      and o.customer_account_id is not null
      and o.customer_account_id is distinct from p_customer_id
    group by i.product_code
  )
  select
    coalesce(p.product_code,m.product_code) as product_code,
    coalesce(p.order_count,0)::integer as order_count,
    coalesce(p.total_qty,0)::numeric as total_qty,
    p.last_bought_at,
    coalesce(m.market_customer_count,0)::integer as market_customer_count,
    coalesce(m.market_qty,0)::numeric as market_qty,
    m.last_market_bought_at
  from personal p
  full outer join market m using(product_code);
$$;

revoke all on function public.taphoa_public_customer_product_signals(uuid) from public,anon,authenticated;
grant execute on function public.taphoa_public_customer_product_signals(uuid) to service_role;

commit;
