-- Lãi tham chiếu is editable per product.
-- Editing it does not change sale_price_basis. Giá bán continues to follow the
-- currently selected basis; the reference price only drives the sale when basis='cost'.

begin;

CREATE OR REPLACE FUNCTION public.taphoa_cost_target_sale(p_cost numeric, p_source_key text, p_old_profit numeric)
 RETURNS numeric
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  select case
    when p_cost is null then null
    when p_source_key='thuoc-la' then p_cost+greatest(coalesce(p_old_profit,1),0)
    when p_source_key in ('hang-thuong','sua','hang-u','sheet-1150410221')
      then p_cost + public.taphoa_balanced_profit(p_cost,p_old_profit)
    else p_cost
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
  v_basis text; v_legacy numeric; v_markup numeric; v_markup_percent numeric; v_standard numeric; v_units numeric; v_retail_price numeric; v_retail_override numeric;
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
  v_legacy := case when p_product ? 'legacy_profit'
    then case when nullif(btrim(coalesce(p_product->>'legacy_profit','')),'') is null then null else (p_product->>'legacy_profit')::numeric end
    else current_row.legacy_profit_vnd end;
  if v_source_key='thuoc-la' and v_legacy is null then v_legacy:=1; end if;
  v_basis := case
    when p_product ? 'sale_price_basis'
      then lower(btrim(coalesce(p_product->>'sale_price_basis','cost')))
    else coalesce(nullif(current_row.sale_price_basis,'auto'),'cost')
  end;
  if v_basis not in ('cost','supplier_1','supplier_1_5','supplier_3') then raise exception 'invalid_sale_price_basis'; end if;
  if v_supplier is null and v_basis like 'supplier_%' then v_basis:='cost'; end if;
  v_sale := public.taphoa_product_sale_price(v_input,v_supplier,v_basis,v_source_key,v_legacy);

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
  if v_legacy is not null and v_legacy<0 then raise exception 'invalid_legacy_profit'; end if;
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
    or current_row.legacy_profit_vnd is distinct from v_legacy
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
      legacy_profit_vnd=v_legacy,expected_profit_percent=v_standard,units_per_carton=v_units,
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
    'sale_price_basis',v_basis,'supplier_price',v_supplier,'legacy_profit_vnd',v_legacy,
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
