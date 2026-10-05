-- Normalize QC / retail units and enforce tobacco packaging.
-- Generic old value "lẻ" is removed; obvious units are inferred from product names.
-- Tobacco is always 50 cây/thùng.

update public.taphoa_products
set retail_unit = case
  when source_key='thuoc-la' then 'cây'
  when lower(product_name) like '% túi %' or lower(product_name) like '% tui %'
    or lower(product_name) like '%túi%' or lower(product_name) like '%tui %' then 'túi'
  when lower(product_name) like '% bịch%' or lower(product_name) like '% bich%' then 'bịch'
  when lower(product_name) like '% gói%' or lower(product_name) like '% goi%' then 'gói'
  when lower(product_name) like '% hộp%' or lower(product_name) like '% hop%' then 'hộp'
  when lower(product_name) like '% chai%' or lower(product_name) like '%chai %' then 'chai'
  when lower(product_name) like '% lon%' or lower(product_name) like '%lon %' then 'lon'
  when lower(product_name) like '% can%' or lower(product_name) like '%can %' then 'can'
  when lower(product_name) like '% tuyp%' or lower(product_name) like '%tuýp%' then 'tuýp'
  when source_key='hang-thuong' and lower(product_name) like 'bia %' then 'lon'
  when source_key='hang-thuong' and lower(product_name) like 'mi %ly%' then 'ly'
  when source_key='hang-thuong' and lower(product_name) like 'mi %' then 'gói'
  when source_key='hang-thuong' and lower(product_name) like 'banh %' then 'gói'
  when source_key='hang-thuong' and lower(product_name) like 'chao %' then 'gói'
  when source_key='hang-thuong' and lower(product_name) like 'keo %' then 'gói'
  when source_key='hang-thuong' and lower(product_name) like 'aj %' then 'gói'
  when source_key='hang-thuong' and lower(product_name) like 'dau %' then 'chai'
  when source_key='hang-thuong' and lower(product_name) like 'mam %' then 'chai'
  when source_key='hang-thuong' and lower(product_name) like 'tuong %' then 'chai'
  when source_key='hang-thuong' and (lower(product_name) like 'ruou %' or lower(product_name) like 'ruoi %') then 'chai'
  when source_key='hang-thuong' and lower(product_name) like 'sua %tuyp%' then 'tuýp'
  when source_key='hang-thuong' and lower(product_name) like 'sua % vi' then 'vỉ'
  when source_key='hang-thuong' and lower(product_name) like 'sua %' then 'hộp'
  when source_key='hang-thuong' and lower(product_name) like 'duong %kg%' then 'kg'
  when source_key='hang-thuong' and lower(product_name) like 'mi chinh %' then 'gói'
  when source_key='hang-u' and lower(product_name) like 'bot giat %' and coalesce(units_per_carton,0)>12 then 'gói'
  when source_key='hang-u' and lower(product_name) like 'bot giat %' then 'túi'
  when source_key='hang-u' and lower(product_name) like 'dau goi %' then 'chai'
  when source_key='hang-u' and lower(product_name) like 'dau xa %' then 'chai'
  when source_key='hang-u' and lower(product_name) like 'gia vi %' then 'gói'
  when source_key='hang-u' and lower(product_name) like 'kem danh rang %' then 'tuýp'
  when source_key='hang-u' and lower(product_name) like 'lan khu mui %' then 'chai'
  when source_key='hang-u' and lower(product_name) like 'nuoc giat %' then 'túi'
  when source_key='hang-u' and lower(product_name) like 'rua bat %' then 'chai'
  when source_key='hang-u' and lower(product_name) like 'sap thom%' then 'hộp'
  when source_key='hang-u' and lower(product_name) like 'sua tam %' then 'chai'
  when source_key='hang-u' and lower(product_name) like 'sun can %' then 'can'
  when source_key='hang-u' and lower(product_name) like 'sun chai %' then 'chai'
  when source_key='hang-u' and lower(product_name) like 'xa bong %banh%' then 'bánh'
  when source_key='hang-u' and lower(product_name) like 'xit %' then 'chai'
  else ''
end,
updated_at=now()
where sync_status<>'deleted'
  and lower(btrim(coalesce(retail_unit,'')))='lẻ';

update public.taphoa_products
set units_per_carton=50,retail_unit='cây',updated_at=now()
where source_key='thuoc-la' and sync_status<>'deleted';

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
  v_basis text; v_price numeric;
  v_standard numeric := nullif(btrim(coalesce(p_product->>'standard_profit_percent','')),'')::numeric;
  v_units numeric := nullif(btrim(coalesce(p_product->>'units_per_carton','')),'')::numeric;
  v_retail_price numeric;
  v_retail_override numeric := nullif(btrim(coalesce(p_product->>'retail_price_override','')),'')::numeric;
  v_retail_unit text := btrim(coalesce(p_product->>'retail_unit',''));
begin
  if v_source='thuoc-la' then
    v_units:=50;
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

  v_basis := case when v_supplier is null then 'auto' else 'supplier_1' end;
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

  update public.taphoa_revisions
  set revision=revision+1,updated_at=now()
  where domain='products';

  return jsonb_build_object(
    'ok',true,'created',true,'product_code',v_code,'source_key',v_source,'price',v_price
  );
end;
$function$
;

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
    when v_supplier is null then 'auto'
    when p_product ? 'sale_price_basis' then lower(btrim(coalesce(p_product->>'sale_price_basis','supplier_1')))
    when current_row.sale_price_basis='supplier_1_5' then 'supplier_1_5'
    else 'supplier_1'
  end;
  if v_supplier is not null and v_basis not in ('supplier_1','supplier_1_5') then raise exception 'invalid_sale_price_basis'; end if;

  v_sale := public.taphoa_product_sale_price(v_input,v_supplier,v_basis,v_source_key,current_row.legacy_profit_vnd);

  v_standard := case when p_product ? 'standard_profit_percent' then nullif(btrim(coalesce(p_product->>'standard_profit_percent','')),'')::numeric else current_row.expected_profit_percent end;
  v_units := case when p_product ? 'units_per_carton' then nullif(btrim(coalesce(p_product->>'units_per_carton','')),'')::numeric else current_row.units_per_carton end;
  if v_source_key='thuoc-la' then v_units:=50; end if;
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
$function$
;
