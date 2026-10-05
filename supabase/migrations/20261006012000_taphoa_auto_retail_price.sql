-- Auto retail price from current sale price and quantity.
-- Mirrors the Google Sheet formula ROUND(Giá bán / SL, 1).

create or replace function public.taphoa_retail_price(
  p_sale numeric,
  p_units numeric
)
returns numeric
language sql
immutable
set search_path=public
as $$
  select case
    when p_sale is null or p_units is null or p_units<=0 then null
    else round(p_sale/p_units,1)
  end;
$$;

update public.taphoa_products
set retail_price_vnd=public.taphoa_retail_price(sale_price_vnd,units_per_carton),
    updated_at=now()
where sync_status<>'deleted';

update public.taphoa_revisions
set revision=revision+1,updated_at=now()
where domain='products';
