-- Clickable NPP sale-price choice.
-- If NPP exists, admin selects either NPP x1 or NPP +1.5%.
-- If NPP is absent, sale price falls back to cost +1.5%.
-- The selected choice is persisted in sale_price_basis.

alter table public.taphoa_products
  drop constraint if exists taphoa_products_sale_price_basis_check;

update public.taphoa_products
set sale_price_basis=case
  when supplier_price_vnd is null then 'auto'
  when sale_price_basis='supplier_1_5' then 'supplier_1_5'
  else 'supplier_1'
end
where sync_status<>'deleted'
   or sale_price_basis not in ('auto','supplier_1','supplier_1_5');

alter table public.taphoa_products
  add constraint taphoa_products_sale_price_basis_check
  check (sale_price_basis in ('auto','supplier_1','supplier_1_5'));

create or replace function public.taphoa_selected_sale_price(p_cost numeric,p_supplier numeric,p_basis text)
returns numeric
language sql
immutable
set search_path=public
as $$
  select case
    when p_supplier is not null and p_basis='supplier_1_5' then ceil(p_supplier*1.015)
    when p_supplier is not null then p_supplier
    when p_cost is not null then ceil(p_cost*1.015)
    else null
  end;
$$;

-- Live DB also replaces taphoa_admin_price_catalog, taphoa_update_product_from_web,
-- and taphoa_admin_create_product to persist supplier_1 / supplier_1_5 and recompute sale_price_vnd server-side.
