-- Keep the selected supermarket image permanently linked to the TAPHOA product.
-- The link is the comparison identity; current market pack/retail prices are derived live.
-- Carton QC is normalized to the smallest known unit (e.g. 12 lốc x 4 hộp = 48).

alter table public.taphoa_product_media
  add column if not exists selected_link_url text not null default '',
  add column if not exists selected_source text not null default '',
  add column if not exists selected_name text not null default '';

update public.taphoa_product_media
set selected_link_url=image_source_url
where selected_link_url=''
  and canonical_product_id like 'link:%'
  and coalesce(image_source_url,'')<>'';

update public.taphoa_product_media m
set selected_source=coalesce(l.source,''),
    selected_name=coalesce(l.name,'')
from public.getlink_links l
where l.canonical_url=m.selected_link_url
  and m.selected_link_url<>'';

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
  v_name text;
  v_image_url text;
  v_source_url text;
  v_source text := '';
  v_candidate_id text := btrim(coalesce(p_canonical_product_id,''));
  v_link_id text;
  v_selected_link_url text := '';
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
    select l.name,a.image_url,l.canonical_url,l.source,l.canonical_url
      into v_name,v_image_url,v_source_url,v_source,v_selected_link_url
    from public.getlink_links l
    join public.getlink_link_assets a on a.link_url=l.canonical_url
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
    product_code,canonical_product_id,image_url,image_source_url,
    selected_link_url,selected_source,selected_name,
    updated_by_account_id,updated_at
  )
  values(
    btrim(p_product_code),v_candidate_id,v_image_url,coalesce(v_source_url,''),
    coalesce(v_selected_link_url,''),coalesce(v_source,''),coalesce(v_name,''),
    v_account_id,now()
  )
  on conflict(product_code) do update
  set canonical_product_id=excluded.canonical_product_id,
      image_url=excluded.image_url,
      image_source_url=excluded.image_source_url,
      selected_link_url=excluded.selected_link_url,
      selected_source=excluded.selected_source,
      selected_name=excluded.selected_name,
      updated_by_account_id=excluded.updated_by_account_id,
      updated_at=excluded.updated_at;

  update public.taphoa_revisions
  set revision=revision+1,updated_at=now()
  where domain='products';

  return jsonb_build_object(
    'ok',true,
    'product_code',btrim(p_product_code),
    'candidate_id',v_candidate_id,
    'candidate_name',v_name,
    'source',coalesce(v_source,''),
    'selected_link_url',coalesce(v_selected_link_url,''),
    'image_url',v_image_url,
    'image_source_url',coalesce(v_source_url,'')
  );
end;
$$;

revoke all on function public.taphoa_set_product_media(text,text) from public, anon;
grant execute on function public.taphoa_set_product_media(text,text) to authenticated;

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
      'marketLinkUrl',coalesce(m.selected_link_url,''),
      'marketSource',coalesce(nullif(gl.source,''),m.selected_source,''),
      'marketName',coalesce(nullif(gl.name,''),m.selected_name,''),
      'marketPackaging',coalesce(gl.packaging,''),
      'marketPackKind',coalesce(gc.pack_kind,''),
      'marketPackQuantity',case when calc.market_qc>1 then calc.market_qc else null end,
      'marketCartonPriceVnd',
        case when gc.pack_kind='carton' then calc.pack_price else null end,
      'marketRetailPriceVnd',
        case
          when gc.pack_kind='carton' and calc.market_qc>1 and calc.pack_price is not null
            then calc.pack_price / calc.market_qc
          when gc.pack_kind='middle'
            then coalesce(
              calc.source_unit_price,
              case when calc.market_qc>1 and calc.pack_price is not null
                   then calc.pack_price / calc.market_qc end,
              gl.current_price::numeric
            )
          else coalesce(calc.source_unit_price,gl.current_price::numeric)
        end,
      'active',p.is_active,
      'stockStatus',p.stock_status,
      'stockLabel',p.stock_label
    ) order by s.sort_order,p.source_row,p.product_code
  ),'[]'::jsonb)
  from public.taphoa_products p
  join public.taphoa_sources s on s.source_key=p.source_key
  left join public.taphoa_product_media m on m.product_code=p.product_code
  left join public.getlink_links gl on gl.canonical_url=nullif(m.selected_link_url,'')
  left join public.getlink_link_comparison gc on gc.link_url=gl.canonical_url
  left join public.getlink_link_pack_hierarchy gh on gh.link_url=gl.canonical_url
  left join lateral (
    select
      case
        when gc.pack_kind='carton' then greatest(
          coalesce(nullif(gc.pack_quantity,0),1),
          coalesce(nullif(gh.qty3,0),1),
          coalesce(nullif(gh.qty2,0),1)
        )
        when gc.pack_kind='middle'
             and coalesce(gc.pack_quantity,0) between 2 and 100
          then gc.pack_quantity
        else 1::numeric
      end as market_qc,
      coalesce(
        case when gc.promotion_active then gc.promo_pack_price end,
        gc.regular_pack_price,
        gl.current_price
      )::numeric as pack_price,
      coalesce(
        case when gc.promotion_active then gc.promo_unit_price end,
        gc.regular_unit_price
      )::numeric as source_unit_price
  ) calc on true
  where p.is_active and s.active;
$$;
