-- Per-source carton profit targets.
-- Numeric price units in TAPHOA are thousands of VND.
-- Ordinary goods: base profit 15k/carton, upper reference 20k/carton.
-- Tobacco: current pricing unit is one cây; 50 cây/carton, +1k/cây = +50k/carton.

alter table public.taphoa_sources
  add column if not exists target_profit_carton_min numeric,
  add column if not exists target_profit_carton_max numeric,
  add column if not exists pricing_unit text,
  add column if not exists default_units_per_carton numeric;

update public.taphoa_sources
set default_markup_vnd=15,
    default_markup_percent=null,
    target_profit_carton_min=15,
    target_profit_carton_max=20,
    pricing_unit='carton',
    default_units_per_carton=1,
    updated_at=now()
where source_key in ('hang-thuong','sua','hang-u','sheet-1150410221')
  and sync_status<>'deleted';

update public.taphoa_sources
set default_markup_vnd=1,
    default_markup_percent=null,
    target_profit_carton_min=50,
    target_profit_carton_max=50,
    pricing_unit='unit',
    default_units_per_carton=50,
    updated_at=now()
where source_key='thuoc-la'
  and sync_status<>'deleted';

update public.taphoa_products
set units_per_carton=50,
    retail_unit='cây',
    updated_at=now()
where source_key='thuoc-la'
  and sync_status<>'deleted';

update public.taphoa_products p
set sale_price_vnd=public.taphoa_selected_sale_price(
      p.input_price_vnd,p.supplier_price_vnd,p.sale_price_basis,
      s.default_markup_vnd,s.default_markup_percent
    ),
    carton_price_vnd=public.taphoa_selected_sale_price(
      p.input_price_vnd,p.supplier_price_vnd,p.sale_price_basis,
      s.default_markup_vnd,s.default_markup_percent
    ),
    applied_profit_vnd=case
      when p.input_price_vnd is not null
       and public.taphoa_selected_sale_price(
         p.input_price_vnd,p.supplier_price_vnd,p.sale_price_basis,
         s.default_markup_vnd,s.default_markup_percent
       ) is not null
      then greatest(
        public.taphoa_selected_sale_price(
          p.input_price_vnd,p.supplier_price_vnd,p.sale_price_basis,
          s.default_markup_vnd,s.default_markup_percent
        )-p.input_price_vnd,0
      )
      else 0
    end,
    updated_at=now()
from public.taphoa_sources s
where p.source_key=s.source_key
  and p.sync_status<>'deleted';

update public.taphoa_revisions
set revision=revision+1,updated_at=now()
where domain='products';
