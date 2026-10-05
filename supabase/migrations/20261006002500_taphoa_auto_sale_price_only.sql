-- Sale price is fully automatic.
-- Formula:
-- 1) NPP exists and NPP >= cost => sale = NPP x1
-- 2) NPP exists but below cost => sale = max(NPP +1.5%, cost +1.5%)
-- 3) no NPP => sale = cost +1.5%
-- 4) neither cost nor NPP => null

do $$
begin
  if exists (
    select 1 from pg_constraint
    where conrelid='public.taphoa_products'::regclass
      and conname='taphoa_products_sale_price_basis_check'
  ) then
    alter table public.taphoa_products drop constraint taphoa_products_sale_price_basis_check;
  end if;
  alter table public.taphoa_products
    add constraint taphoa_products_sale_price_basis_check
    check (sale_price_basis in ('manual','supplier_1','supplier_1_5','auto'));
end;
$$;

update public.taphoa_products
set sale_price_basis='auto'
where sync_status<>'deleted';

create or replace function public.taphoa_auto_sale_price(p_cost numeric,p_supplier numeric)
returns numeric
language sql
immutable
set search_path=public
as $$
  select case
    when p_cost is null and p_supplier is null then null
    when p_supplier is not null and p_cost is null then p_supplier
    when p_supplier is null and p_cost is not null then ceil(p_cost*1.015)
    when p_supplier >= p_cost then p_supplier
    else greatest(ceil(p_supplier*1.015),ceil(p_cost*1.015))
  end;
$$;

-- The live database also replaces taphoa_admin_price_catalog,
-- taphoa_update_product_from_web and taphoa_admin_create_product
-- so sale_price_vnd is always computed server-side from cost + NPP.
