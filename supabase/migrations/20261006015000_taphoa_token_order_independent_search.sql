-- Tokenized, order-independent admin product search.
-- Normal searches match product-name tokens only; explicit product codes still work.

create or replace function public.taphoa_search_normalize(p_text text)
returns text
language sql
stable
set search_path=public,extensions
as $$
  select btrim(
    regexp_replace(
      lower(unaccent(coalesce(p_text,''))),
      '[^a-z0-9]+',
      ' ',
      'g'
    )
  );
$$;

create or replace function public.taphoa_search_matches(
  p_name text,
  p_code text,
  p_query text
)
returns boolean
language sql
stable
set search_path=public,extensions
as $$
  with norm as (
    select
      public.taphoa_search_normalize(p_query) as q,
      public.taphoa_search_normalize(coalesce(p_name,'')) as name_norm,
      public.taphoa_search_normalize(coalesce(p_code,'')) as code_norm
  )
  select case
    when q='' then true
    when q ~ '^(ht|tl|sua|hu|sp)\s+[0-9]+$'
      then strpos(code_norm,q)>0
    else not exists (
      select 1
      from unnest(regexp_split_to_array(q,'\s+')) token
      where token<>''
        and strpos(name_norm,token)=0
    )
  end
  from norm;
$$;

CREATE OR REPLACE FUNCTION public.taphoa_admin_price_catalog(p_query text DEFAULT ''::text, p_source text DEFAULT ''::text, p_limit integer DEFAULT 100, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
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
    'items',coalesce((
      select jsonb_agg(x.item order by x.sort_order,x.source_row,x.product_code)
      from (
        select s.sort_order,p.source_row,p.product_code,
          jsonb_build_object(
            'product_code',p.product_code,'product_name',p.product_name,
            'source_key',p.source_key,'source_name',s.name,'source_active',s.active,
            'default_markup_vnd',s.default_markup_vnd,
            'default_markup_percent',s.default_markup_percent,
            'legacy_profit_vnd',p.legacy_profit_vnd,
            'balanced_profit_vnd',public.taphoa_balanced_profit(p.input_price_vnd,p.legacy_profit_vnd),
            'cost',p.input_price_vnd,
            'price',public.taphoa_product_sale_price(
              p.input_price_vnd,p.supplier_price_vnd,p.sale_price_basis,
              p.source_key,p.legacy_profit_vnd
            ),
            'sale_price_basis',case
              when p.supplier_price_vnd is null then 'auto'
              when p.sale_price_basis='supplier_1_5' then 'supplier_1_5'
              else 'supplier_1'
            end,
            'supplier_price',p.supplier_price_vnd,
            'supplier_x1',p.supplier_price_vnd,
            'supplier_1_5',case when p.supplier_price_vnd is null then null else ceil(p.supplier_price_vnd*1.015) end,
            'cost_1_5',case when p.input_price_vnd is null then null else ceil(p.input_price_vnd*1.015) end,
            'cost_3',case when p.input_price_vnd is null then null else ceil(p.input_price_vnd*1.03) end,
            'profit',case
              when p.input_price_vnd is null then null
              else public.taphoa_selected_sale_price(
                p.input_price_vnd,p.supplier_price_vnd,p.sale_price_basis,
                s.default_markup_vnd,s.default_markup_percent
              )-p.input_price_vnd
            end,
            'profit_percent',case
              when p.input_price_vnd is null or p.input_price_vnd=0 then null
              else round((
                (public.taphoa_selected_sale_price(
                  p.input_price_vnd,p.supplier_price_vnd,p.sale_price_basis,
                  s.default_markup_vnd,s.default_markup_percent
                )-p.input_price_vnd)/p.input_price_vnd
              )*100,2)
            end,
            'standard_profit_percent',p.expected_profit_percent,
            'units_per_carton',p.units_per_carton,'retail_unit',p.retail_unit,
            'retail_price_override',p.retail_price_override_vnd,
            'retail_price',coalesce(
              p.retail_price_override_vnd,
              public.taphoa_retail_price(
                public.taphoa_product_sale_price(
                  p.input_price_vnd,p.supplier_price_vnd,p.sale_price_basis,p.source_key,p.legacy_profit_vnd
                ),
                p.units_per_carton
              )
            ),'admin_state',p.admin_state,
            'history_costs',coalesce((
              select jsonb_agg(h.old_cost order by h.changed_at desc,h.id desc)
              from (
                select ph.old_cost,ph.changed_at,ph.id
                from public.taphoa_product_price_history ph
                where ph.product_code=p.product_code
                  and ph.old_cost is distinct from ph.new_cost
                  and ph.old_cost is not null
                order by ph.changed_at desc,ph.id desc
                limit 2
              ) h
            ),'[]'::jsonb),
            'cost_history',public.taphoa_cost_history_snapshot(p.product_code),
            'updated_at',p.updated_at
          ) item
        from public.taphoa_products p
        join public.taphoa_sources s on s.source_key=p.source_key
        where p.sync_status<>'deleted'
          and s.sync_status<>'deleted'
          and (v_source='' or p.source_key=v_source)
          and public.taphoa_search_matches(p.product_name,p.product_code,v_query)
        order by s.sort_order,p.source_row,p.product_code
        limit v_limit offset v_offset
      ) x
    ),'[]'::jsonb),
    'total',(
      select count(*)
      from public.taphoa_products p
      join public.taphoa_sources s on s.source_key=p.source_key
      where p.sync_status<>'deleted' and s.sync_status<>'deleted'
        and (v_source='' or p.source_key=v_source)
        and public.taphoa_search_matches(p.product_name,p.product_code,v_query)
    ),
    'sources',coalesce((
      select jsonb_agg(jsonb_build_object(
        'source_key',s.source_key,'name',s.name,'active',s.active,'sync_status',s.sync_status,
        'default_markup_vnd',s.default_markup_vnd,'default_markup_percent',s.default_markup_percent
      ) order by s.sort_order,s.source_key)
      from public.taphoa_sources s
      where s.sync_status<>'deleted'
    ),'[]'::jsonb)
  ) into result;
  return result;
end;
$function$
;
