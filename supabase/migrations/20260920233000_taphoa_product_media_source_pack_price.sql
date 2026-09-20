-- Preserve the supermarket source package price and only derive child-unit prices
-- for cartons, lốc/vỉ packs, and milk products. Box/bottle/can/bag/etc.
-- keep their source package price; child quantity/weight stays descriptive.

alter table public.taphoa_product_media
  add column if not exists market_source_price_vnd numeric;

create or replace function public.taphoa_market_allows_unit_breakdown(
  p_name text,
  p_packaging text
)
returns boolean
language sql
stable
set search_path = public
as $$
  with x as (
    select
      btrim(regexp_replace(lower(extensions.unaccent(coalesce(p_packaging,''))),'[^a-z0-9]+',' ','g')) as packaging_norm,
      btrim(regexp_replace(lower(extensions.unaccent(coalesce(p_name,''))),'[^a-z0-9]+',' ','g')) as name_norm
  )
  select
    split_part(packaging_norm,' ',1) in ('loc','vi')
    or name_norm ~ '(^| )(sua|milk|vinamilk|nutifood|milo|ensure|pediasure|yomost|probi)( |$)'
  from x;
$$;

create or replace function public.taphoa_normalize_selected_market_price()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if coalesce(new.market_pack_kind,'') <> 'carton' then
    if public.taphoa_market_allows_unit_breakdown(new.market_product_name,new.market_packaging)
       and new.market_retail_price_vnd is not null
       and new.market_retail_price_vnd > 0 then
      new.market_selected_price_vnd := new.market_retail_price_vnd;
    elsif new.market_source_price_vnd is not null
       and new.market_source_price_vnd > 0 then
      new.market_selected_price_vnd := new.market_source_price_vnd;
    elsif new.market_retail_price_vnd is not null
       and new.market_retail_price_vnd > 0 then
      new.market_selected_price_vnd := new.market_retail_price_vnd;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists taphoa_normalize_selected_market_price_trg on public.taphoa_product_media;
create trigger taphoa_normalize_selected_market_price_trg
before insert or update of
  market_pack_kind,
  market_retail_price_vnd,
  market_selected_price_vnd,
  market_source_price_vnd,
  market_product_name,
  market_packaging
on public.taphoa_product_media
for each row
execute function public.taphoa_normalize_selected_market_price();

update public.taphoa_product_media m
set market_source_price_vnd=l.current_price::numeric
from public.getlink_links l
where m.canonical_product_id='link:'||l.id
  and l.current_price is not null
  and m.market_source_price_vnd is distinct from l.current_price::numeric;

update public.taphoa_product_media
set market_selected_price_vnd=case
  when public.taphoa_market_allows_unit_breakdown(market_product_name,market_packaging)
       and market_retail_price_vnd is not null
       and market_retail_price_vnd>0
    then market_retail_price_vnd
  when market_source_price_vnd is not null
       and market_source_price_vnd>0
    then market_source_price_vnd
  else market_retail_price_vnd
end
where coalesce(market_pack_kind,'')<>'carton';

create or replace function public.taphoa_set_product_media(
  p_product_code text,
  p_canonical_product_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_ctx jsonb;
  v_account_id uuid;
  v_candidate_id text := btrim(coalesce(p_canonical_product_id,''));
  v_link_id text;
  v_name text;
  v_image_url text;
  v_source_url text;
  v_source text := '';
  v_pack_kind text := '';
  v_packaging text := '';
  v_carton_price bigint;
  v_retail_price numeric;
  v_units numeric;
  v_selected_price numeric;
  v_source_price numeric;
  v_label2 text := '';
  v_qty2 numeric;
  v_label3 text := '';
  v_qty3 numeric;
begin
  v_ctx := public.taphoa_access_context();
  if coalesce(v_ctx->>'taphoa_role','') <> 'admin' then
    raise exception 'taphoa_admin_required' using errcode='42501';
  end if;
  v_account_id := nullif(v_ctx->>'account_id','')::uuid;

  if not exists(
    select 1 from public.taphoa_products
    where product_code=btrim(coalesce(p_product_code,''))
  ) then
    raise exception 'taphoa_product_not_found' using errcode='P0002';
  end if;

  if v_candidate_id like 'link:%' then
    v_link_id := substr(v_candidate_id,6);
    select
      l.name,a.image_url,l.canonical_url,l.source,coalesce(c.pack_kind,''),coalesce(l.packaging,''),
      case
        when c.pack_kind='carton' then coalesce(
          case when c.promotion_active then c.promo_pack_price end,
          c.regular_pack_price,l.current_price
        )
        else null
      end,
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
      end,
      coalesce(h.label2,''),h.qty2,coalesce(h.label3,''),h.qty3,
      case
        when c.pack_kind='carton' then
          coalesce(
            case when c.promotion_active then c.promo_pack_price end,
            c.regular_pack_price,l.current_price
          )::numeric /
          nullif(greatest(
            coalesce(c.pack_quantity,0),
            case
              when coalesce(h.qty2,0)>1 and coalesce(h.qty3,0)>1 then
                case when h.qty3>=h.qty2 then h.qty3 else h.qty2*h.qty3 end
              when coalesce(h.qty3,0)>1 then h.qty3
              when coalesce(h.qty2,0)>1 then h.qty2
              else 0
            end
          ),0)
        else coalesce(
          case when c.promotion_active then c.promo_unit_price end,
          c.regular_unit_price,
          case
            when coalesce(c.pack_quantity,0)>1 and l.current_price is not null
              then l.current_price::numeric/nullif(c.pack_quantity,0)
            else l.current_price::numeric
          end
        )
      end,
      coalesce(
        case
          when c.pack_kind='carton' then coalesce(
            case when c.promotion_active then c.promo_pack_price end,
            c.regular_pack_price,l.current_price
          )
          else l.current_price
        end,
        l.current_price
      )::numeric,
      l.current_price::numeric
    into
      v_name,v_image_url,v_source_url,v_source,v_pack_kind,v_packaging,
      v_carton_price,v_units,v_label2,v_qty2,v_label3,v_qty3,
      v_retail_price,v_selected_price,v_source_price
    from public.getlink_links l
    join public.getlink_link_assets a on a.link_url=l.canonical_url
    left join public.getlink_link_comparison c on c.link_url=l.canonical_url
    left join public.getlink_link_pack_hierarchy h on h.link_url=l.canonical_url
    where l.id=v_link_id
      and a.image_url is not null
      and btrim(a.image_url)<>''
    limit 1;
  else
    select c.canonical_name,c.image_url,coalesce(c.image_source_url,'')
      into v_name,v_image_url,v_source_url
    from public.getlink_canonical_products c
    where c.id=v_candidate_id
      and c.image_url is not null
      and btrim(c.image_url)<>''
    limit 1;
  end if;

  if v_image_url is null or btrim(v_image_url)='' then
    raise exception 'taphoa_image_candidate_not_found' using errcode='P0002';
  end if;

  insert into public.taphoa_product_media(
    product_code,canonical_product_id,image_url,image_source_url,updated_by_account_id,updated_at,
    market_source,market_product_name,market_pack_kind,market_packaging,
    market_carton_price_vnd,market_retail_price_vnd,market_units_per_carton,
    market_pack_label2,market_pack_qty2,market_pack_label3,market_pack_qty3,
    market_selected_price_vnd,market_compare_kind,market_compare_units_per_carton,
    market_source_price_vnd
  )
  values(
    btrim(p_product_code),v_candidate_id,v_image_url,coalesce(v_source_url,''),v_account_id,now(),
    coalesce(v_source,''),coalesce(v_name,''),coalesce(v_pack_kind,''),coalesce(v_packaging,''),
    v_carton_price,v_retail_price,v_units,
    coalesce(v_label2,''),v_qty2,coalesce(v_label3,''),v_qty3,
    coalesce(v_selected_price,v_carton_price::numeric,v_retail_price),null,null,
    v_source_price
  )
  on conflict(product_code) do update
  set canonical_product_id=excluded.canonical_product_id,
      image_url=excluded.image_url,
      image_source_url=excluded.image_source_url,
      updated_by_account_id=excluded.updated_by_account_id,
      updated_at=excluded.updated_at,
      market_source=excluded.market_source,
      market_product_name=excluded.market_product_name,
      market_pack_kind=excluded.market_pack_kind,
      market_packaging=excluded.market_packaging,
      market_carton_price_vnd=excluded.market_carton_price_vnd,
      market_retail_price_vnd=excluded.market_retail_price_vnd,
      market_units_per_carton=excluded.market_units_per_carton,
      market_pack_label2=excluded.market_pack_label2,
      market_pack_qty2=excluded.market_pack_qty2,
      market_pack_label3=excluded.market_pack_label3,
      market_pack_qty3=excluded.market_pack_qty3,
      market_selected_price_vnd=excluded.market_selected_price_vnd,
      market_compare_kind=null,
      market_compare_units_per_carton=null,
      market_source_price_vnd=excluded.market_source_price_vnd;

  update public.taphoa_revisions
  set revision=revision+1,updated_at=now()
  where domain='products';

  return jsonb_build_object(
    'ok',true,
    'product_code',btrim(p_product_code),
    'candidate_id',v_candidate_id,
    'candidate_name',v_name,
    'image_url',v_image_url,
    'image_source_url',coalesce(v_source_url,''),
    'source',v_source,
    'pack_kind',v_pack_kind,
    'carton_price',v_carton_price,
    'retail_price',v_retail_price,
    'selected_price',coalesce(v_selected_price,v_carton_price::numeric,v_retail_price),
    'source_price',v_source_price,
    'units_per_carton',v_units
  );
end;
$$;

create or replace function public.taphoa_products_frontend_json()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id',p.product_code,
      'maSP',p.product_code,
      'product_code',p.product_code,
      'ten',p.product_name,
      'product_name',p.product_name,
      'gia',coalesce(p.sale_price_vnd,0)::numeric / 1000.0,
      'von',case when p.input_price_vnd is null then null else p.input_price_vnd::numeric / 1000.0 end,
      'nhom',p.source_key,
      'product_group',p.source_key,
      'donVi',case when p.input_price_basis='retail' then coalesce(nullif(p.retail_unit,''),'lẻ') else 'thùng' end,
      'donViLe',p.retail_unit,
      'quyCach',p.units_per_carton,
      'quyDoiThung',p.units_per_carton,
      'giaLe',case when p.retail_price_vnd is null then null else p.retail_price_vnd::numeric / 1000.0 end,
      'imageUrl',coalesce(m.image_url,''),
      'image_url',coalesce(m.image_url,''),
      'imageSourceUrl',coalesce(m.image_source_url,''),
      'marketSource',coalesce(m.market_source,''),
      'marketProductName',coalesce(m.market_product_name,''),
      'marketPackKind',coalesce(m.market_pack_kind,''),
      'marketPackaging',coalesce(m.market_packaging,''),
      'marketCartonPriceVnd',m.market_carton_price_vnd,
      'marketRetailPriceVnd',m.market_retail_price_vnd,
      'marketSourcePriceVnd',m.market_source_price_vnd,
      'marketUnitsPerCarton',m.market_units_per_carton,
      'marketPackLabel2',coalesce(m.market_pack_label2,''),
      'marketPackQty2',m.market_pack_qty2,
      'marketPackLabel3',coalesce(m.market_pack_label3,''),
      'marketPackQty3',m.market_pack_qty3,
      'marketSelectedPriceVnd',m.market_selected_price_vnd,
      'marketCompareKind',coalesce(m.market_compare_kind,''),
      'marketCompareUnitsPerCarton',m.market_compare_units_per_carton,
      'ownCompareUnitsPerCarton',m.own_compare_units_per_carton,
      'active',p.is_active,
      'stockStatus',p.stock_status,
      'stockLabel',p.stock_label
    ) order by s.sort_order,p.source_row,p.product_code
  ),'[]'::jsonb)
  from public.taphoa_products p
  join public.taphoa_sources s on s.source_key=p.source_key
  left join public.taphoa_product_media m on m.product_code=p.product_code
  where p.is_active and s.active;
$$;

revoke all on function public.taphoa_market_allows_unit_breakdown(text,text) from public, anon;
revoke all on function public.taphoa_set_product_media(text,text) from public, anon;
grant execute on function public.taphoa_set_product_media(text,text) to authenticated;
