-- Recalculate stored sale prices so storefront/runtime data matches the automatic formula.
with changed as (
  update public.taphoa_products p
  set sale_price_vnd=public.taphoa_auto_sale_price(p.input_price_vnd,p.supplier_price_vnd),
      carton_price_vnd=public.taphoa_auto_sale_price(p.input_price_vnd,p.supplier_price_vnd),
      sale_price_basis='auto',
      applied_profit_vnd=case
        when p.input_price_vnd is not null
         and public.taphoa_auto_sale_price(p.input_price_vnd,p.supplier_price_vnd) is not null
        then greatest(public.taphoa_auto_sale_price(p.input_price_vnd,p.supplier_price_vnd)-p.input_price_vnd,0)
        else 0
      end,
      updated_at=now()
  where p.sync_status<>'deleted'
    and (
      p.sale_price_vnd is distinct from public.taphoa_auto_sale_price(p.input_price_vnd,p.supplier_price_vnd)
      or p.sale_price_basis is distinct from 'auto'
    )
  returning product_code
)
update public.taphoa_revisions
set revision=revision+1,updated_at=now()
where domain='products'
  and exists(select 1 from changed);
