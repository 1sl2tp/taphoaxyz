-- Split raw reference profit from calculated profit.
-- reference = cost + entered legacy/reference profit.
-- calculated_profit = cost + balanced-profit formula.
-- AUTO falls back to calculated_profit; existing manual choices are preserved.

begin;

alter table public.taphoa_products
  drop constraint if exists taphoa_products_sale_price_basis_check;
alter table public.taphoa_products
  add constraint taphoa_products_sale_price_basis_check
  check (sale_price_basis in ('auto','reference','calculated_profit','supplier_1','supplier_1_5','supplier_3','cost_1_5','cost_3','cost'));

alter table public.taphoa_products
  alter column sale_price_basis set default 'calculated_profit';

CREATE OR REPLACE FUNCTION public.taphoa_auto_sale_basis(
  p_cost numeric,
  p_supplier numeric,
  p_source_key text,
  p_old_profit numeric
)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $function$
declare
  v_supplier_15 numeric;
  v_cost_15 numeric;
  v_supplier_3 numeric;
  v_cost_3 numeric;
begin
  if p_cost is null then
    return case when p_supplier is null then 'calculated_profit' else 'supplier_1' end;
  end if;

  if p_supplier is null then
    return 'calculated_profit';
  end if;

  if p_supplier>p_cost then
    return 'supplier_1';
  end if;

  v_supplier_15:=ceil(p_supplier*1.015);
  v_cost_15:=ceil(p_cost*1.015);
  if v_supplier_15>p_cost or v_cost_15>p_cost then
    if v_supplier_15>p_cost and v_cost_15>p_cost then
      return case when v_supplier_15<=v_cost_15 then 'supplier_1_5' else 'cost_1_5' end;
    elsif v_supplier_15>p_cost then
      return 'supplier_1_5';
    else
      return 'cost_1_5';
    end if;
  end if;

  v_supplier_3:=ceil(p_supplier*1.03);
  v_cost_3:=ceil(p_cost*1.03);
  if v_supplier_3>p_cost or v_cost_3>p_cost then
    if v_supplier_3>p_cost and v_cost_3>p_cost then
      return case when v_supplier_3<=v_cost_3 then 'supplier_3' else 'cost_3' end;
    elsif v_supplier_3>p_cost then
      return 'supplier_3';
    else
      return 'cost_3';
    end if;
  end if;

  return 'calculated_profit';
end;
$function$;


CREATE OR REPLACE FUNCTION public.taphoa_product_sale_price(
  p_cost numeric,
  p_supplier numeric,
  p_basis text,
  p_source_key text,
  p_old_profit numeric
)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $function$
  select case
    when p_basis='reference' then p_cost+greatest(coalesce(p_old_profit,0),0)
    when p_basis in ('calculated_profit','cost') then p_cost+public.taphoa_balanced_profit(p_cost,p_old_profit)
    when p_basis='supplier_1' and p_supplier is not null then p_supplier
    when p_basis='supplier_1_5' and p_supplier is not null then ceil(p_supplier*1.015)
    when p_basis='supplier_3' and p_supplier is not null then ceil(p_supplier*1.03)
    when p_basis='cost_1_5' then ceil(p_cost*1.015)
    when p_basis='cost_3' then ceil(p_cost*1.03)
    else p_cost+public.taphoa_balanced_profit(p_cost,p_old_profit)
  end;
$function$;


-- Tobacco rows were explicitly chosen by the admin to use the raw reference
-- profit. Convert that old overloaded "cost" marker to the new reference basis.
update public.taphoa_products
set sale_price_basis='reference'
where sale_price_mode='manual'
  and source_key='thuoc-la'
  and sale_price_basis='cost';

-- Any other old manual "cost" selection meant the calculated formula.
update public.taphoa_products
set sale_price_basis='calculated_profit'
where sale_price_mode='manual'
  and source_key<>'thuoc-la'
  and sale_price_basis='cost';

-- Manual NPP selections (for example sale_price_basis='supplier_1') are untouched.

-- Resolve every automatic row with the canonical algorithm. Rows without an
-- NPP candidate resolve to calculated_profit.
with resolved as (
  select p.product_code,
         public.taphoa_auto_sale_basis(
           p.input_price_vnd,p.supplier_price_vnd,p.source_key,p.legacy_profit_vnd
         ) as basis
  from public.taphoa_products p
  where p.sync_status<>'deleted'
    and p.sale_price_mode='auto'
)
update public.taphoa_products p
set sale_price_basis=r.basis,
    sale_price_vnd=public.taphoa_product_sale_price(
      p.input_price_vnd,p.supplier_price_vnd,r.basis,p.source_key,p.legacy_profit_vnd
    ),
    carton_price_vnd=public.taphoa_product_sale_price(
      p.input_price_vnd,p.supplier_price_vnd,r.basis,p.source_key,p.legacy_profit_vnd
    ),
    applied_profit_vnd=case
      when p.input_price_vnd is null then 0
      else greatest(
        coalesce(public.taphoa_product_sale_price(
          p.input_price_vnd,p.supplier_price_vnd,r.basis,p.source_key,p.legacy_profit_vnd
        ),p.input_price_vnd)-p.input_price_vnd,0
      )
    end,
    retail_price_vnd=coalesce(
      p.retail_price_override_vnd,
      public.taphoa_retail_price(
        public.taphoa_product_sale_price(
          p.input_price_vnd,p.supplier_price_vnd,r.basis,p.source_key,p.legacy_profit_vnd
        ),
        p.units_per_carton
      )
    ),
    updated_at=now()
from resolved r
where p.product_code=r.product_code;

-- Recompute manual rows under the now-explicit basis semantics without
-- changing which basis the admin selected.
update public.taphoa_products p
set sale_price_vnd=public.taphoa_product_sale_price(
      p.input_price_vnd,p.supplier_price_vnd,p.sale_price_basis,p.source_key,p.legacy_profit_vnd
    ),
    carton_price_vnd=public.taphoa_product_sale_price(
      p.input_price_vnd,p.supplier_price_vnd,p.sale_price_basis,p.source_key,p.legacy_profit_vnd
    ),
    applied_profit_vnd=case
      when p.input_price_vnd is null then 0
      else greatest(
        coalesce(public.taphoa_product_sale_price(
          p.input_price_vnd,p.supplier_price_vnd,p.sale_price_basis,p.source_key,p.legacy_profit_vnd
        ),p.input_price_vnd)-p.input_price_vnd,0
      )
    end,
    retail_price_vnd=coalesce(
      p.retail_price_override_vnd,
      public.taphoa_retail_price(
        public.taphoa_product_sale_price(
          p.input_price_vnd,p.supplier_price_vnd,p.sale_price_basis,p.source_key,p.legacy_profit_vnd
        ),
        p.units_per_carton
      )
    ),
    updated_at=now()
where p.sync_status<>'deleted'
  and p.sale_price_mode='manual';

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
  v_mode text := lower(btrim(coalesce(p_product->>'sale_price_mode','auto')));
  v_basis text := 'calculated_profit'; v_price numeric; v_legacy numeric := nullif(btrim(coalesce(p_product->>'legacy_profit','')),'')::numeric;
  v_standard numeric := nullif(btrim(coalesce(p_product->>'standard_profit_percent','')),'')::numeric;
  v_units numeric := nullif(btrim(coalesce(p_product->>'units_per_carton','')),'')::numeric;
  v_retail_price numeric;
  v_retail_override numeric := nullif(btrim(coalesce(p_product->>'retail_price_override','')),'')::numeric;
  v_retail_unit text := btrim(coalesce(p_product->>'retail_unit',''));
begin
  if v_source='thuoc-la' then
    v_units:=1;
    v_retail_unit:='cây';
    if v_legacy is null then v_legacy:=1; end if;
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

  if v_mode not in ('auto','manual') then raise exception 'invalid_sale_price_mode'; end if;
  v_basis := case
    when v_mode='auto' then public.taphoa_auto_sale_basis(v_cost,v_supplier,v_source,v_legacy)
    when p_product ? 'sale_price_basis' then lower(btrim(coalesce(p_product->>'sale_price_basis','calculated_profit')))
    else 'calculated_profit'
  end;
  if v_basis='cost' then v_basis:='calculated_profit'; end if;
  if v_basis not in ('reference','calculated_profit','supplier_1','supplier_1_5','supplier_3','cost_1_5','cost_3') then raise exception 'invalid_sale_price_basis'; end if;
  if v_supplier is null and v_basis like 'supplier_%' then v_basis:='calculated_profit'; end if;
  v_price := public.taphoa_product_sale_price(v_cost,v_supplier,v_basis,v_source,v_legacy);
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
    expected_profit_percent,applied_profit_vnd,sale_price_vnd,sale_price_basis,sale_price_mode,carton_price_vnd,
    retail_price_vnd,retail_price_override_vnd,units_per_carton,retail_unit,stock_status,stock_label,is_active,raw_row,
    sheet_updated_at,updated_at,sync_status,deleted_at,supplier_price_vnd,admin_state
  ) values (
    v_code,v_source,v_row,v_name,v_cost,'carton',v_standard,
    case when v_cost is not null and v_price is not null then greatest(v_price-v_cost,0) else 0 end,
    v_price,v_basis,v_mode,v_price,v_retail_price,v_retail_override,v_units,v_retail_unit,
    case when v_price is null or v_price<=0 then 'no_price' else 'available' end,
    case when v_price is null or v_price<=0 then 'Chưa có giá' else '' end,
    true,'[]'::jsonb,null,now(),'active',null,v_supplier,'active'
  );

  update public.taphoa_products
  set legacy_profit_vnd=v_legacy
  where product_code=v_code;

  update public.taphoa_revisions
  set revision=revision+1,updated_at=now()
  where domain='products';

  return jsonb_build_object(
    'ok',true,'created',true,'product_code',v_code,'source_key',v_source,'price',v_price,
    'sale_price_mode',v_mode,'sale_price_basis',v_basis
  );
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
  v_mode text; v_requested_basis text; v_basis text; v_legacy numeric; v_markup numeric; v_markup_percent numeric; v_standard numeric; v_units numeric; v_retail_price numeric; v_retail_override numeric;
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
  v_mode := case
    when p_product ? 'sale_price_mode' then lower(btrim(coalesce(p_product->>'sale_price_mode','auto')))
    else coalesce(current_row.sale_price_mode,'auto')
  end;
  if v_mode not in ('auto','manual') then raise exception 'invalid_sale_price_mode'; end if;

  v_requested_basis := case
    when p_product ? 'sale_price_basis'
      then lower(btrim(coalesce(p_product->>'sale_price_basis','calculated_profit')))
    else coalesce(nullif(current_row.sale_price_basis,'auto'),'calculated_profit')
  end;
  v_basis := case
    when v_mode='auto' then public.taphoa_auto_sale_basis(v_input,v_supplier,v_source_key,v_legacy)
    else v_requested_basis
  end;
  if v_basis='cost' then v_basis:='calculated_profit'; end if;
  if v_basis not in ('reference','calculated_profit','supplier_1','supplier_1_5','supplier_3','cost_1_5','cost_3') then raise exception 'invalid_sale_price_basis'; end if;
  if v_supplier is null and v_basis like 'supplier_%' then v_basis:='calculated_profit'; end if;
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
    or current_row.sale_price_mode is distinct from v_mode
    or current_row.supplier_price_vnd is distinct from v_supplier
    or current_row.legacy_profit_vnd is distinct from v_legacy
    or current_row.expected_profit_percent is distinct from v_standard
    or current_row.units_per_carton is distinct from v_units
    or current_row.retail_price_override_vnd is distinct from v_retail_override
    or current_row.retail_price_vnd is distinct from v_retail_price
    or current_row.retail_unit is distinct from v_retail_unit
    or current_row.admin_state is distinct from v_admin_state;

  if not v_changed then return jsonb_build_object(
    'ok',true,'changed',false,'product_code',v_code,'price',current_row.sale_price_vnd,
    'sale_price_mode',current_row.sale_price_mode,'sale_price_basis',current_row.sale_price_basis
  ); end if;

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
      sale_price_basis=v_basis,sale_price_mode=v_mode,carton_price_vnd=v_sale,supplier_price_vnd=v_supplier,
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
    'sale_price_mode',v_mode,'sale_price_basis',v_basis,'supplier_price',v_supplier,'legacy_profit_vnd',v_legacy,
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
