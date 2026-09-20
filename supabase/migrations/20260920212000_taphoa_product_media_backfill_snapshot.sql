-- Backfill market snapshot for images chosen before snapshot fields existed.
with base as (
  select
    m.product_code,
    l.source,
    l.name,
    coalesce(c.pack_kind,'') as pack_kind,
    coalesce(l.packaging,'') as packaging,
    l.current_price,
    c.pack_quantity,
    c.promotion_active,
    c.regular_pack_price,
    c.promo_pack_price,
    c.regular_unit_price,
    c.promo_unit_price,
    coalesce(h.label2,'') as label2,
    h.qty2,
    coalesce(h.label3,'') as label3,
    h.qty3,
    case
      when c.pack_kind='carton' then greatest(
        coalesce(c.pack_quantity,0),
        case
          when coalesce(h.qty2,0)>1 and coalesce(h.qty3,0)>1 then
            case when h.qty3>=h.qty2 then h.qty3 else h.qty2*h.qty3 end
          when coalesce(h.qty3,0)>1 then h.qty3
          when coalesce(h.qty2,0)>1 then h.qty2
          else 0
        end
      )
      else null
    end as units_per_carton,
    case
      when c.pack_kind='carton' then coalesce(
        case when c.promotion_active then c.promo_pack_price end,
        c.regular_pack_price,l.current_price
      )
      else null
    end as carton_price,
    case
      when c.pack_kind='carton' then coalesce(
        case when c.promotion_active then c.promo_pack_price end,
        c.regular_pack_price,l.current_price
      )::numeric
      else l.current_price::numeric
    end as selected_price
  from public.taphoa_product_media m
  join public.getlink_links l on l.id=substr(m.canonical_product_id,6)
  left join public.getlink_link_comparison c on c.link_url=l.canonical_url
  left join public.getlink_link_pack_hierarchy h on h.link_url=l.canonical_url
  where m.canonical_product_id like 'link:%'
    and m.image_url<>''
),
calc as (
  select
    b.*,
    case
      when b.pack_kind='carton' and coalesce(b.units_per_carton,0)>0
        then b.selected_price/nullif(b.units_per_carton,0)
      else coalesce(
        case when b.promotion_active then b.promo_unit_price end,
        b.regular_unit_price,
        case
          when coalesce(b.pack_quantity,0)>1 and b.current_price is not null
            then b.current_price::numeric/nullif(b.pack_quantity,0)
          else b.current_price::numeric
        end
      )
    end as retail_price
  from base b
)
update public.taphoa_product_media m
set market_source=coalesce(c.source,''),
    market_product_name=coalesce(c.name,''),
    market_pack_kind=coalesce(c.pack_kind,''),
    market_packaging=coalesce(c.packaging,''),
    market_carton_price_vnd=c.carton_price,
    market_retail_price_vnd=c.retail_price,
    market_units_per_carton=c.units_per_carton,
    market_pack_label2=c.label2,
    market_pack_qty2=c.qty2,
    market_pack_label3=c.label3,
    market_pack_qty3=c.qty3,
    market_selected_price_vnd=c.selected_price
from calc c
where m.product_code=c.product_code
  and (m.market_source='' or m.market_selected_price_vnd is null);
