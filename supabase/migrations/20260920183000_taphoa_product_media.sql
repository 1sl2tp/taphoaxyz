-- Product image metadata stays outside the Sheet-authoritative pricing/product row.
-- Images are selected explicitly from the supermarket canonical catalog.

create table if not exists public.taphoa_product_media (
  product_code text primary key references public.taphoa_products(product_code) on delete cascade,
  canonical_product_id text,
  image_url text not null default '',
  image_source_url text not null default '',
  updated_by_account_id uuid references public.v21_accounts(id),
  updated_at timestamptz not null default now()
);

alter table public.taphoa_product_media enable row level security;
revoke all on public.taphoa_product_media from public, anon, authenticated;

create or replace function public.taphoa_product_media_candidates(
  p_query text,
  p_limit integer default 12
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  v_ctx jsonb;
  v_query text := btrim(coalesce(p_query,''));
  v_limit integer := greatest(1,least(coalesce(p_limit,12),30));
begin
  v_ctx := public.taphoa_access_context();
  if coalesce(v_ctx->>'taphoa_role','') <> 'admin' then
    raise exception 'taphoa_admin_required' using errcode='42501';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id',x.id,
      'name',x.canonical_name,
      'image_url',x.image_url,
      'image_source_url',x.image_source_url,
      'brand',x.canonical_brand,
      'size_value',x.size_value,
      'size_unit',x.size_unit
    ) order by x.rank_order,x.updated_at desc,x.canonical_name)
    from (
      select
        c.id,c.canonical_name,c.image_url,c.image_source_url,c.canonical_brand,
        c.size_value,c.size_unit,c.updated_at,
        case
          when lower(c.canonical_name)=lower(v_query) then 0
          when lower(c.canonical_name) like lower(v_query)||'%' then 1
          else 2
        end as rank_order
      from public.getlink_canonical_products c
      where c.image_url is not null
        and btrim(c.image_url) <> ''
        and (
          v_query=''
          or c.canonical_name ilike '%'||v_query||'%'
          or coalesce(c.canonical_brand,'') ilike '%'||v_query||'%'
        )
      order by rank_order,c.updated_at desc,c.canonical_name
      limit v_limit
    ) x
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
  v_name text;
  v_image_url text;
  v_source_url text;
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

  select c.canonical_name,c.image_url,coalesce(c.image_source_url,'')
    into v_name,v_image_url,v_source_url
  from public.getlink_canonical_products c
  where c.id=btrim(coalesce(p_canonical_product_id,''))
    and c.image_url is not null
    and btrim(c.image_url)<>''
  limit 1;

  if not found then
    raise exception 'taphoa_image_candidate_not_found' using errcode='P0002';
  end if;

  insert into public.taphoa_product_media(
    product_code,canonical_product_id,image_url,image_source_url,updated_by_account_id,updated_at
  )
  values(
    btrim(p_product_code),btrim(p_canonical_product_id),v_image_url,v_source_url,v_account_id,now()
  )
  on conflict(product_code) do update
  set canonical_product_id=excluded.canonical_product_id,
      image_url=excluded.image_url,
      image_source_url=excluded.image_source_url,
      updated_by_account_id=excluded.updated_by_account_id,
      updated_at=excluded.updated_at;

  update public.taphoa_revisions
  set revision=revision+1,updated_at=now()
  where domain='products';

  return jsonb_build_object(
    'ok',true,
    'product_code',btrim(p_product_code),
    'canonical_product_id',btrim(p_canonical_product_id),
    'candidate_name',v_name,
    'image_url',v_image_url,
    'image_source_url',v_source_url
  );
end;
$$;

create or replace function public.taphoa_clear_product_media(
  p_product_code text
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_ctx jsonb;
  v_deleted integer := 0;
begin
  v_ctx := public.taphoa_access_context();
  if coalesce(v_ctx->>'taphoa_role','') <> 'admin' then
    raise exception 'taphoa_admin_required' using errcode='42501';
  end if;

  delete from public.taphoa_product_media
  where product_code=btrim(coalesce(p_product_code,''));
  get diagnostics v_deleted = row_count;

  if v_deleted > 0 then
    update public.taphoa_revisions
    set revision=revision+1,updated_at=now()
    where domain='products';
  end if;

  return jsonb_build_object('ok',true,'deleted',v_deleted>0);
end;
$$;

revoke all on function public.taphoa_product_media_candidates(text,integer) from public, anon;
revoke all on function public.taphoa_set_product_media(text,text) from public, anon;
revoke all on function public.taphoa_clear_product_media(text) from public, anon;
grant execute on function public.taphoa_product_media_candidates(text,integer) to authenticated;
grant execute on function public.taphoa_set_product_media(text,text) to authenticated;
grant execute on function public.taphoa_clear_product_media(text) to authenticated;

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
