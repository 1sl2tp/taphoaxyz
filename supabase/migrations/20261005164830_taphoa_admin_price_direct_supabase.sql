-- Supabase is the runtime source of truth for TAPHOA product prices.
-- Admin price management reads/writes only Supabase; no Google Sheet outbox is created.

create or replace function public.taphoa_admin_price_catalog(
  p_query text default '',
  p_source text default '',
  p_limit integer default 100,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  ctx jsonb := public.taphoa_access_context();
  v_query text := btrim(coalesce(p_query,''));
  v_source text := btrim(coalesce(p_source,''));
  v_limit integer := greatest(1,least(200,coalesce(p_limit,100)));
  v_offset integer := greatest(0,coalesce(p_offset,0));
  result jsonb;
begin
  if not coalesce((ctx->>'allowed')::boolean,false) or ctx->>'taphoa_role' <> 'admin' then
    raise exception 'taphoa_access_denied' using errcode='42501';
  end if;

  select jsonb_build_object(
    'items',
    coalesce((
      select jsonb_agg(x.item order by x.sort_order,x.source_row,x.product_code)
      from (
        select
          s.sort_order,
          p.source_row,
          p.product_code,
          jsonb_build_object(
            'product_code',p.product_code,
            'product_name',p.product_name,
            'source_key',p.source_key,
            'source_name',s.name,
            'cost',p.input_price_vnd,
            'price',p.sale_price_vnd,
            'profit',case
              when p.input_price_vnd is null or p.sale_price_vnd is null then null
              else p.sale_price_vnd-p.input_price_vnd
            end,
            'updated_at',p.updated_at
          ) as item
        from public.taphoa_products p
        join public.taphoa_sources s on s.source_key=p.source_key
        where p.is_active
          and s.active
          and (v_source='' or p.source_key=v_source)
          and (
            v_query=''
            or p.product_code ilike '%'||v_query||'%'
            or p.product_name ilike '%'||v_query||'%'
          )
        order by s.sort_order,p.source_row,p.product_code
        limit v_limit offset v_offset
      ) x
    ),'[]'::jsonb),
    'total',
    (
      select count(*)
      from public.taphoa_products p
      join public.taphoa_sources s on s.source_key=p.source_key
      where p.is_active
        and s.active
        and (v_source='' or p.source_key=v_source)
        and (
          v_query=''
          or p.product_code ilike '%'||v_query||'%'
          or p.product_name ilike '%'||v_query||'%'
        )
    ),
    'sources',
    coalesce((
      select jsonb_agg(
        jsonb_build_object('source_key',s.source_key,'name',s.name)
        order by s.sort_order,s.source_key
      )
      from public.taphoa_sources s
      where s.active
    ),'[]'::jsonb)
  ) into result;

  return result;
end;
$$;

revoke all on function public.taphoa_admin_price_catalog(text,text,integer,integer) from public, anon;
grant execute on function public.taphoa_admin_price_catalog(text,text,integer,integer) to authenticated;

create or replace function public.taphoa_update_product_from_web(p_product jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  ctx jsonb := public.taphoa_access_context();
  current_row public.taphoa_products;
  v_code text := upper(btrim(coalesce(p_product->>'product_code',p_product->>'maSP','')));
  v_input numeric;
  v_sale numeric;
  v_changed boolean := false;
begin
  if not coalesce((ctx->>'allowed')::boolean,false) or ctx->>'taphoa_role' <> 'admin' then
    raise exception 'taphoa_access_denied' using errcode='42501';
  end if;

  if v_code='' then
    raise exception 'product_code_required';
  end if;

  select * into current_row
  from public.taphoa_products
  where product_code=v_code
  for update;

  if not found then
    raise exception 'product_not_found' using errcode='P0002';
  end if;

  v_input := case
    when p_product ? 'cost'
      then case when nullif(btrim(coalesce(p_product->>'cost','')),'') is null
        then null else (p_product->>'cost')::numeric end
    else current_row.input_price_vnd
  end;

  v_sale := case
    when p_product ? 'price'
      then case when nullif(btrim(coalesce(p_product->>'price','')),'') is null
        then null else (p_product->>'price')::numeric end
    else current_row.sale_price_vnd
  end;

  if v_input is not null and v_input < 0 then raise exception 'invalid_cost'; end if;
  if v_sale is not null and v_sale < 0 then raise exception 'invalid_price'; end if;

  v_changed := current_row.input_price_vnd is distinct from v_input
    or current_row.sale_price_vnd is distinct from v_sale;

  if not v_changed then
    return jsonb_build_object(
      'ok',true,
      'changed',false,
      'product_code',v_code,
      'cost',current_row.input_price_vnd,
      'price',current_row.sale_price_vnd
    );
  end if;

  update public.taphoa_products
  set input_price_vnd=v_input,
      sale_price_vnd=v_sale,
      carton_price_vnd=v_sale,
      applied_profit_vnd=case
        when v_input is not null and v_sale is not null then greatest(v_sale-v_input,0)
        else 0
      end,
      stock_status=case when v_sale is null or v_sale<=0 then 'no_price' else 'available' end,
      stock_label=case when v_sale is null or v_sale<=0 then 'Chưa có giá' else '' end,
      is_active=true,
      sync_status='active',
      deleted_at=null,
      updated_at=now()
  where product_code=v_code;

  update public.taphoa_revisions
  set revision=revision+1,updated_at=now()
  where domain='products';

  return jsonb_build_object(
    'ok',true,
    'changed',true,
    'product_code',v_code,
    'cost',v_input,
    'price',v_sale
  );
end;
$$;

revoke all on function public.taphoa_update_product_from_web(jsonb) from public, anon;
grant execute on function public.taphoa_update_product_from_web(jsonb) to authenticated;
