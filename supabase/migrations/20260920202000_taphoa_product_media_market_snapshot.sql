-- Persist the selected supermarket product as a market snapshot tied to TAPHOA product media.
-- Do not write market values back into the Sheet-authoritative product price/QC columns.

alter table public.taphoa_product_media
  add column if not exists market_source text not null default '',
  add column if not exists market_product_name text not null default '',
  add column if not exists market_pack_kind text not null default '',
  add column if not exists market_packaging text not null default '',
  add column if not exists market_carton_price_vnd bigint,
  add column if not exists market_retail_price_vnd numeric,
  add column if not exists market_units_per_carton numeric,
  add column if not exists market_pack_label2 text not null default '',
  add column if not exists market_pack_qty2 numeric,
  add column if not exists market_pack_label3 text not null default '',
  add column if not exists market_pack_qty3 numeric;

create or replace function public.taphoa_product_media_candidates(
  p_query text,
  p_limit integer default 18
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  v_ctx jsonb;
  v_query_norm text := lower(extensions.unaccent(btrim(coalesce(p_query,''))));
  v_limit integer := greatest(1,least(coalesce(p_limit,18),50));
begin
  v_ctx := public.taphoa_access_context();
  if coalesce(v_ctx->>'taphoa_role','') <> 'admin' then
    raise exception 'taphoa_admin_required' using errcode='42501';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id','link:'||x.id,
      'name',x.name,
      'image_url',x.image_url,
      'image_source_url',x.canonical_url,
      'source',x.source,
      'packaging',x.packaging,
      'pack_kind',x.pack_kind,
      'pack_quantity',x.pack_quantity,
      'pack_unit',x.pack_unit,
      'carton_price',x.carton_price,
      'retail_price',x.retail_price,
      'units_per_carton',x.units_per_carton,
      'pack_label2',x.label2,
      'pack_qty2',x.qty2,
      'pack_label3',x.label3,
      'pack_qty3',x.qty3,
      'promotion_active',x.promotion_active,
      'current_price',x.current_price
    ) order by x.rank_order,x.sort_price nulls last,x.source,x.name)
    from (
      select
        q.*,
        case
          when q.pack_kind='carton' then q.pack_price
          else null
        end as carton_price,
        case
          when q.pack_kind='carton' and coalesce(q.units_per_carton,0)>1 and q.pack_price is not null
            then q.pack_price::numeric / q.units_per_carton
          else coalesce(
            case when q.promotion_active then q.promo_unit_price end,
            q.regular_unit_price,
            case
              when coalesce(q.pack_quantity,0)>1 and q.current_price is not null
                then q.current_price::numeric / nullif(q.pack_quantity,0)
              else q.current_price::numeric
            end
          )
        end as retail_price,
        coalesce(
          case
            when q.pack_kind='carton' and coalesce(q.units_per_carton,0)>1 and q.pack_price is not null
              then q.pack_price::numeric / q.units_per_carton
            else coalesce(
              case when q.promotion_active then q.promo_unit_price end,
              q.regular_unit_price,
              case
                when coalesce(q.pack_quantity,0)>1 and q.current_price is not null
                  then q.current_price::numeric / nullif(q.pack_quantity,0)
                else q.current_price::numeric
              end
            )
          end,
          q.pack_price::numeric
        ) as sort_price
      from (
        select
          l.id,l.name,l.source,l.packaging,l.current_price,l.canonical_url,a.image_url,
          c.pack_kind,c.pack_quantity,c.pack_unit,c.promotion_active,
          c.regular_unit_price,c.promo_unit_price,
          h.label2,h.qty2,h.label3,h.qty3,
          case
            when c.pack_kind='carton' then greatest(
              coalesce(c.pack_quantity,0),
              case
                when coalesce(h.qty2,0)>1 and coalesce(h.qty3,0)>1 then
                  case
                    when h.qty3>=h.qty2 then h.qty3
                    else h.qty2*h.qty3
                  end
                when coalesce(h.qty3,0)>1 then h.qty3
                when coalesce(h.qty2,0)>1 then h.qty2
                else 0
              end
            )
            else null
          end as units_per_carton,
          coalesce(
            case when c.promotion_active then c.promo_pack_price end,
            c.regular_pack_price,
            l.current_price
          ) as pack_price,
          case
            when lower(extensions.unaccent(coalesce(l.name,'')))=v_query_norm then 0
            when v_query_norm<>'' and lower(extensions.unaccent(coalesce(l.name,''))) like v_query_norm||'%' then 1
            else 2
          end as rank_order
        from public.getlink_links l
        join public.getlink_link_assets a on a.link_url=l.canonical_url
        left join public.getlink_link_comparison c on c.link_url=l.canonical_url
        left join public.getlink_link_pack_hierarchy h on h.link_url=l.canonical_url
        where a.image_url is not null
          and btrim(a.image_url)<>''
          and l.source in ('GO!','WinMart','Bách Hóa XANH')
          and (
            v_query_norm=''
            or not exists (
              select 1
              from regexp_split_to_table(v_query_norm,'\s+') token
              where btrim(token)<>''
                and lower(extensions.unaccent(coalesce(l.name,''))) not like '%'||token||'%'
            )
          )
      ) q
    ) x
    order by x.rank_order,x.sort_price nulls last,x.source,x.name
    limit v_limit
  ),'[]'::jsonb);
end;
$$;

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
      end
    into
      v_name,v_image_url,v_source_url,v_source,v_pack_kind,v_packaging,
      v_carton_price,v_units,v_label2,v_qty2,v_label3,v_qty3,v_retail_price
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
    market_pack_label2,market_pack_qty2,market_pack_label3,market_pack_qty3
  )
  values(
    btrim(p_product_code),v_candidate_id,v_image_url,coalesce(v_source_url,''),v_account_id,now(),
    coalesce(v_source,''),coalesce(v_name,''),coalesce(v_pack_kind,''),coalesce(v_packaging,''),
    v_carton_price,v_retail_price,v_units,
    coalesce(v_label2,''),v_qty2,coalesce(v_label3,''),v_qty3
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
      market_pack_qty3=excluded.market_pack_qty3;

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
      'marketUnitsPerCarton',m.market_units_per_carton,
      'marketPackLabel2',coalesce(m.market_pack_label2,''),
      'marketPackQty2',m.market_pack_qty2,
      'marketPackLabel3',coalesce(m.market_pack_label3,''),
      'marketPackQty3',m.market_pack_qty3,
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

revoke all on function public.taphoa_product_media_candidates(text,integer) from public, anon;
revoke all on function public.taphoa_set_product_media(text,text) from public, anon;
grant execute on function public.taphoa_product_media_candidates(text,integer) to authenticated;
grant execute on function public.taphoa_set_product_media(text,text) to authenticated;
