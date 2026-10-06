-- Make the sale-price source an explicit per-product choice.
-- The current selected basis is preserved; the UI can switch between
-- reference profit, NPP x1, NPP +1.5%, and NPP +3% without source-specific rules.

begin;

-- Freeze any legacy "auto" row to the value that was actually selected before
-- changing the pricing function to honor the persisted basis.
update public.taphoa_products p
set sale_price_basis=case
  when p.sale_price_basis in ('cost','supplier_1','supplier_1_5','supplier_3') then p.sale_price_basis
  else public.taphoa_product_sale_basis(
    p.input_price_vnd,p.supplier_price_vnd,p.source_key,p.legacy_profit_vnd
  )
end
where p.sync_status<>'deleted';

-- Tobacco starts from its reference profit of +1 per cây. After this migration
-- it uses the same selectable basis mechanism as every other product.
update public.taphoa_products
set legacy_profit_vnd=1,
    sale_price_basis='cost',
    sale_price_vnd=public.taphoa_cost_target_sale(input_price_vnd,source_key,1),
    carton_price_vnd=public.taphoa_cost_target_sale(input_price_vnd,source_key,1),
    applied_profit_vnd=case
      when input_price_vnd is null then 0
      else greatest(coalesce(public.taphoa_cost_target_sale(input_price_vnd,source_key,1),input_price_vnd)-input_price_vnd,0)
    end,
    retail_price_vnd=coalesce(
      retail_price_override_vnd,
      public.taphoa_retail_price(public.taphoa_cost_target_sale(input_price_vnd,source_key,1),units_per_carton)
    ),
    updated_at=now()
where source_key='thuoc-la'
  and sync_status<>'deleted';

CREATE OR REPLACE FUNCTION public.taphoa_product_sale_price(p_cost numeric, p_supplier numeric, p_basis text, p_source_key text, p_old_profit numeric)
 RETURNS numeric
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  select case
    when p_basis='supplier_1' and p_supplier is not null then p_supplier
    when p_basis='supplier_1_5' and p_supplier is not null then ceil(p_supplier*1.015)
    when p_basis='supplier_3' and p_supplier is not null then ceil(p_supplier*1.03)
    else public.taphoa_cost_target_sale(p_cost,p_source_key,p_old_profit)
  end;
$function$;


CREATE OR REPLACE FUNCTION public.taphoa_admin_create_product(p_product jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
declare
  ctx jsonb := public.taphoa_access_context();
  v_source text := btrim(coalesce(p_product->>'source_key',''));
  v_name text := btrim(coalesce(p_product->>'name',''));
  v_prefix text; v_next integer; v_code text; v_row integer;
  v_markup numeric; v_markup_percent numeric;
  v_cost numeric := nullif(btrim(coalesce(p_product->>'cost','')),'')::numeric;
  v_supplier numeric := nullif(btrim(coalesce(p_product->>'supplier_price','')),'')::numeric;
  v_basis text := 'cost'; v_price numeric;
  v_standard numeric := nullif(btrim(coalesce(p_product->>'standard_profit_percent','')),'')::numeric;
  v_units numeric := nullif(btrim(coalesce(p_product->>'units_per_carton','')),'')::numeric;
  v_retail_price numeric;
  v_retail_override numeric := nullif(btrim(coalesce(p_product->>'retail_price_override','')),'')::numeric;
  v_retail_unit text := btrim(coalesce(p_product->>'retail_unit',''));
begin
  if v_source='thuoc-la' then
    v_units:=1;
    v_retail_unit:='cây';
  end if;
  if not coalesce((ctx->>'allowed')::boolean,false) or ctx->>'taphoa_role'<>'admin' then
    raise exception 'taphoa_access_denied' using errcode='42501';
  end if;
  if v_name='' then raise exception 'product_name_required'; end if;

  select default_markup_vnd,default_markup_percent into v_markup,v_markup_percent
  from public.taphoa_sources
  where source_key=v_source and sync_status<>'deleted';
  if not found then raise exception 'source_not_found' using errcode='P0002'; end if;

  if v_cost is not null and v_cost<0 then raise exception 'invalid_cost'; end if;
  if v_supplier is not null and v_supplier<0 then raise exception 'invalid_supplier_price'; end if;
  if v_units is not null and v_units<1 then raise exception 'invalid_units_per_carton'; end if;
  if v_retail_override is not null and v_retail_override<0 then raise exception 'invalid_retail_price'; end if;

  v_basis := case
    when p_product ? 'sale_price_basis' then lower(btrim(coalesce(p_product->>'sale_price_basis','cost')))
    else 'cost'
  end;
  if v_basis not in ('cost','supplier_1','supplier_1_5','supplier_3') then raise exception 'invalid_sale_price_basis'; end if;
  if v_supplier is null and v_basis like 'supplier_%' then v_basis:='cost'; end if;
  v_price := public.taphoa_product_sale_price(v_cost,v_supplier,v_basis,v_source,null);
  v_retail_price := coalesce(v_retail_override,public.taphoa_retail_price(v_price,v_units));

  v_prefix := case v_source
    when 'hang-thuong' then 'HT-'
    when 'thuoc-la' then 'TL-'
    when 'sua' then 'SUA-'
    when 'hang-u' then 'HU-'
    else 'SP-'
  end;

  perform pg_advisory_xact_lock(hashtext('taphoa-product-code:'||v_prefix));
  select coalesce(max((regexp_match(product_code,'([0-9]+)$'))[1]::integer),0)+1
  into v_next
  from public.taphoa_products
  where product_code like v_prefix||'%';

  loop
    v_code:=v_prefix||lpad(v_next::text,6,'0');
    exit when not exists(select 1 from public.taphoa_products where product_code=v_code);
    v_next:=v_next+1;
  end loop;

  select coalesce(max(source_row),0)+1 into v_row
  from public.taphoa_products where source_key=v_source;

  insert into public.taphoa_products(
    product_code,source_key,source_row,product_name,input_price_vnd,input_price_basis,
    expected_profit_percent,applied_profit_vnd,sale_price_vnd,sale_price_basis,carton_price_vnd,
    retail_price_vnd,retail_price_override_vnd,units_per_carton,retail_unit,stock_status,stock_label,is_active,raw_row,
    sheet_updated_at,updated_at,sync_status,deleted_at,supplier_price_vnd,admin_state
  ) values (
    v_code,v_source,v_row,v_name,v_cost,'carton',v_standard,
    case when v_cost is not null and v_price is not null then greatest(v_price-v_cost,0) else 0 end,
    v_price,v_basis,v_price,v_retail_price,v_retail_override,v_units,v_retail_unit,
    case when v_price is null or v_price<=0 then 'no_price' else 'available' end,
    case when v_price is null or v_price<=0 then 'Chưa có giá' else '' end,
    true,'[]'::jsonb,null,now(),'active',null,v_supplier,'active'
  );

  if v_source='thuoc-la' then
    update public.taphoa_products
    set legacy_profit_vnd=1
    where product_code=v_code;
  end if;

  update public.taphoa_revisions
  set revision=revision+1,updated_at=now()
  where domain='products';

  return jsonb_build_object(
    'ok',true,'created',true,'product_code',v_code,'source_key',v_source,'price',v_price
  );
end;
$function$;


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
            'sale_price_basis',p.sale_price_basis,
            'supplier_price',p.supplier_price_vnd,
            'supplier_x1',p.supplier_price_vnd,
            'supplier_1_5',case when p.supplier_price_vnd is null then null else ceil(p.supplier_price_vnd*1.015) end,
            'supplier_3',case when p.supplier_price_vnd is null then null else ceil(p.supplier_price_vnd*1.03) end,
            'cost_1_5',case when p.input_price_vnd is null then null else ceil(p.input_price_vnd*1.015) end,
            'cost_3',case when p.input_price_vnd is null then null else ceil(p.input_price_vnd*1.03) end,
            'profit',case
              when p.input_price_vnd is null then null
              else public.taphoa_product_sale_price(
                p.input_price_vnd,p.supplier_price_vnd,p.sale_price_basis,
                p.source_key,p.legacy_profit_vnd
              )-p.input_price_vnd
            end,
            'profit_percent',case
              when p.input_price_vnd is null or p.input_price_vnd=0 then null
              else round((
                (public.taphoa_product_sale_price(
                  p.input_price_vnd,p.supplier_price_vnd,p.sale_price_basis,
                  p.source_key,p.legacy_profit_vnd
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
$function$;


CREATE OR REPLACE FUNCTION public.taphoa_update_product_from_web(p_product jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
declare
  ctx jsonb := public.taphoa_access_context();
  current_row public.taphoa_products;
  v_code text := upper(btrim(coalesce(p_product->>'product_code',p_product->>'maSP','')));
  v_name text; v_source_key text; v_input numeric; v_sale numeric; v_supplier numeric;
  v_basis text; v_markup numeric; v_markup_percent numeric; v_standard numeric; v_units numeric; v_retail_price numeric; v_retail_override numeric;
  v_retail_unit text; v_admin_state text; v_changed boolean := false; v_price_changed boolean := false;
begin
  if not coalesce((ctx->>'allowed')::boolean,false) or ctx->>'taphoa_role'<>'admin' then raise exception 'taphoa_access_denied' using errcode='42501'; end if;
  if v_code='' then raise exception 'product_code_required'; end if;
  select * into current_row from public.taphoa_products where product_code=v_code and sync_status<>'deleted' for update;
  if not found then raise exception 'product_not_found' using errcode='P0002'; end if;

  v_name := case when p_product ? 'name' then btrim(coalesce(p_product->>'name','')) else current_row.product_name end;
  if v_name='' then raise exception 'product_name_required'; end if;
  v_source_key := case when p_product ? 'source_key' then btrim(coalesce(p_product->>'source_key','')) else current_row.source_key end;

  select default_markup_vnd,default_markup_percent into v_markup,v_markup_percent
  from public.taphoa_sources
  where source_key=v_source_key and sync_status<>'deleted';
  if not found then raise exception 'source_not_found' using errcode='P0002'; end if;

  v_input := case when p_product ? 'cost'
    then case when nullif(btrim(coalesce(p_product->>'cost','')),'') is null then null else (p_product->>'cost')::numeric end
    else current_row.input_price_vnd end;
  v_supplier := case when p_product ? 'supplier_price'
    then case when nullif(btrim(coalesce(p_product->>'supplier_price','')),'') is null then null else (p_product->>'supplier_price')::numeric end
    else current_row.supplier_price_vnd end;
  v_basis := case
    when p_product ? 'sale_price_basis'
      then lower(btrim(coalesce(p_product->>'sale_price_basis','cost')))
    else coalesce(nullif(current_row.sale_price_basis,'auto'),'cost')
  end;
  if v_basis not in ('cost','supplier_1','supplier_1_5','supplier_3') then raise exception 'invalid_sale_price_basis'; end if;
  if v_supplier is null and v_basis like 'supplier_%' then v_basis:='cost'; end if;
  v_sale := public.taphoa_product_sale_price(v_input,v_supplier,v_basis,v_source_key,current_row.legacy_profit_vnd);

  v_standard := case when p_product ? 'standard_profit_percent' then nullif(btrim(coalesce(p_product->>'standard_profit_percent','')),'')::numeric else current_row.expected_profit_percent end;
  v_units := case when p_product ? 'units_per_carton' then nullif(btrim(coalesce(p_product->>'units_per_carton','')),'')::numeric else current_row.units_per_carton end;
  if v_source_key='thuoc-la' then v_units:=1; end if;
  v_retail_override := case
    when p_product ? 'retail_price_override'
      then nullif(btrim(coalesce(p_product->>'retail_price_override','')),'')::numeric
    else current_row.retail_price_override_vnd
  end;
  v_retail_price := coalesce(v_retail_override,public.taphoa_retail_price(v_sale,v_units));
  v_retail_unit := case when p_product ? 'retail_unit' then btrim(coalesce(p_product->>'retail_unit','')) else current_row.retail_unit end;
  if v_source_key='thuoc-la' then v_retail_unit:='cây'; end if;
  v_admin_state := case when p_product ? 'admin_state' then lower(btrim(coalesce(p_product->>'admin_state',''))) else current_row.admin_state end;

  if v_input is not null and v_input<0 then raise exception 'invalid_cost'; end if;
  if v_supplier is not null and v_supplier<0 then raise exception 'invalid_supplier_price'; end if;
  if v_units is not null and v_units<1 then raise exception 'invalid_units_per_carton'; end if;
  if v_retail_override is not null and v_retail_override<0 then raise exception 'invalid_retail_price'; end if;
  if v_standard is not null and (v_standard<0 or v_standard>100) then raise exception 'invalid_standard_profit_percent'; end if;
  if v_admin_state not in ('active','hidden','discontinued') then raise exception 'invalid_admin_state'; end if;

  v_changed := current_row.product_name is distinct from v_name
    or current_row.source_key is distinct from v_source_key
    or current_row.input_price_vnd is distinct from v_input
    or current_row.sale_price_vnd is distinct from v_sale
    or current_row.sale_price_basis is distinct from v_basis
    or current_row.supplier_price_vnd is distinct from v_supplier
    or current_row.expected_profit_percent is distinct from v_standard
    or current_row.units_per_carton is distinct from v_units
    or current_row.retail_price_override_vnd is distinct from v_retail_override
    or current_row.retail_price_vnd is distinct from v_retail_price
    or current_row.retail_unit is distinct from v_retail_unit
    or current_row.admin_state is distinct from v_admin_state;

  if not v_changed then return jsonb_build_object('ok',true,'changed',false,'product_code',v_code,'price',current_row.sale_price_vnd,'sale_price_basis',current_row.sale_price_basis); end if;

  v_price_changed := current_row.input_price_vnd is distinct from v_input
    or current_row.sale_price_vnd is distinct from v_sale
    or current_row.supplier_price_vnd is distinct from v_supplier
    or current_row.expected_profit_percent is distinct from v_standard;

  if v_price_changed then
    insert into public.taphoa_product_price_history(
      product_code,changed_by,old_cost,new_cost,old_sale,new_sale,old_supplier,new_supplier,
      old_standard_profit_percent,new_standard_profit_percent
    ) values (
      v_code,auth.uid(),current_row.input_price_vnd,v_input,current_row.sale_price_vnd,v_sale,
      current_row.supplier_price_vnd,v_supplier,current_row.expected_profit_percent,v_standard
    );
  end if;

  update public.taphoa_products
  set product_name=v_name,source_key=v_source_key,input_price_vnd=v_input,sale_price_vnd=v_sale,
      sale_price_basis=v_basis,carton_price_vnd=v_sale,supplier_price_vnd=v_supplier,
      expected_profit_percent=v_standard,units_per_carton=v_units,
      retail_price_override_vnd=v_retail_override,retail_price_vnd=v_retail_price,
      retail_unit=v_retail_unit,
      applied_profit_vnd=case when v_input is not null and v_sale is not null then greatest(v_sale-v_input,0) else 0 end,
      admin_state=v_admin_state,is_active=(v_admin_state='active'),
      stock_status=case when v_admin_state='discontinued' then 'out_of_stock' when v_sale is null or v_sale<=0 then 'no_price' else 'available' end,
      stock_label=case when v_admin_state='hidden' then 'Ẩn' when v_admin_state='discontinued' then 'Ngừng bán' when v_sale is null or v_sale<=0 then 'Chưa có giá' else '' end,
      sync_status='active',deleted_at=null,updated_at=now()
  where product_code=v_code;

  update public.taphoa_revisions set revision=revision+1,updated_at=now() where domain='products';
  return jsonb_build_object(
    'ok',true,'changed',true,'product_code',v_code,'name',v_name,'cost',v_input,'price',v_sale,
    'sale_price_basis',v_basis,'supplier_price',v_supplier,
    'default_markup_vnd',v_markup,'default_markup_percent',v_markup_percent,
    'standard_profit_percent',v_standard,'units_per_carton',v_units,
    'retail_unit',v_retail_unit,'retail_price_override',v_retail_override,
    'retail_price',v_retail_price,'admin_state',v_admin_state
  );
end;
$function$;


update public.taphoa_revisions
set revision=revision+1,updated_at=now()
where domain='products';

commit;
