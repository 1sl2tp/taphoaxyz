-- Expand TAPHOA product image picker to the full supermarket catalog.
-- Search all image-bearing GETLINK links across BHX / GO! / WinMart.
-- Keep compatibility with previously selected canonical-product images.

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
  v_query text := btrim(coalesce(p_query,''));
  v_query_norm text := lower(unaccent(btrim(coalesce(p_query,''))));
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
      'current_price',x.current_price
    ) order by x.rank_order,x.source,x.name)
    from (
      select
        l.id,l.name,l.source,l.packaging,l.current_price,l.canonical_url,a.image_url,
        case
          when lower(unaccent(coalesce(l.name,'')))=v_query_norm then 0
          when v_query_norm<>'' and lower(unaccent(coalesce(l.name,''))) like v_query_norm||'%' then 1
          else 2
        end as rank_order
      from public.getlink_links l
      join public.getlink_link_assets a on a.link_url=l.canonical_url
      where a.image_url is not null
        and btrim(a.image_url)<>''
        and (
          v_query_norm=''
          or not exists (
            select 1
            from regexp_split_to_table(v_query_norm,'\s+') token
            where btrim(token)<>''
              and lower(unaccent(coalesce(l.name,''))) not like '%'||token||'%'
          )
        )
      order by rank_order,l.source,l.name,l.updated_at desc
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
  v_candidate_id text := btrim(coalesce(p_canonical_product_id,''));
  v_link_id text;
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
    select l.name,a.image_url,l.canonical_url
      into v_name,v_image_url,v_source_url
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
    product_code,canonical_product_id,image_url,image_source_url,updated_by_account_id,updated_at
  )
  values(
    btrim(p_product_code),v_candidate_id,v_image_url,coalesce(v_source_url,''),v_account_id,now()
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
    'candidate_id',v_candidate_id,
    'candidate_name',v_name,
    'image_url',v_image_url,
    'image_source_url',coalesce(v_source_url,'')
  );
end;
$$;

revoke all on function public.taphoa_product_media_candidates(text,integer) from public, anon;
revoke all on function public.taphoa_set_product_media(text,text) from public, anon;
grant execute on function public.taphoa_product_media_candidates(text,integer) to authenticated;
grant execute on function public.taphoa_set_product_media(text,text) to authenticated;
