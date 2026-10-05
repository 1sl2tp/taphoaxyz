-- Sale price rule: manual, NPP x1, or NPP +1.5%.
-- "Other price" is retired from the admin UI/runtime pricing rule.

alter table public.taphoa_products
  add column if not exists sale_price_basis text not null default 'manual';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.taphoa_products'::regclass
      and conname='taphoa_products_sale_price_basis_check'
  ) then
    alter table public.taphoa_products
      add constraint taphoa_products_sale_price_basis_check
      check (sale_price_basis in ('manual','supplier_1','supplier_1_5'));
  end if;
end;
$$;

update public.taphoa_products
set sale_price_basis='supplier_1'
where sync_status<>'deleted'
  and supplier_price_vnd is not null
  and sale_price_vnd=supplier_price_vnd;

update public.taphoa_products
set sale_price_basis='supplier_1_5'
where sync_status<>'deleted'
  and sale_price_basis='manual'
  and supplier_price_vnd is not null
  and sale_price_vnd=ceil(supplier_price_vnd*1.015);

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
            'source_active',s.active,
            'cost',p.input_price_vnd,
            'price',p.sale_price_vnd,
            'sale_price_basis',p.sale_price_basis,
            'supplier_price',p.supplier_price_vnd,
            'profit',case
              when p.input_price_vnd is null or p.sale_price_vnd is null then null
              else p.sale_price_vnd-p.input_price_vnd
            end,
            'profit_percent',case
              when p.input_price_vnd is null or p.input_price_vnd=0 or p.sale_price_vnd is null then null
              else round(((p.sale_price_vnd-p.input_price_vnd)/p.input_price_vnd)*100,2)
            end,
            'price_1_5',case when p.input_price_vnd is null then null else ceil(p.input_price_vnd*1.015) end,
            'price_3',case when p.input_price_vnd is null then null else ceil(p.input_price_vnd*1.03) end,
            'standard_profit_percent',p.expected_profit_percent,
            'units_per_carton',p.units_per_carton,
            'retail_unit',p.retail_unit,
            'retail_price',p.retail_price_vnd,
            'admin_state',p.admin_state,
            'history_costs',coalesce((
              select jsonb_agg(h.old_cost order by h.changed_at desc,h.id desc)
              from (
                select ph.old_cost,ph.changed_at,ph.id
                from public.taphoa_product_price_history ph
                where ph.product_code=p.product_code
                  and ph.old_cost is distinct from ph.new_cost
                  and ph.old_cost is not null
                order by ph.changed_at desc,ph.id desc
                limit 4
              ) h
            ),'[]'::jsonb),
            'last_price_change_at',(
              select max(ph.changed_at)
              from public.taphoa_product_price_history ph
              where ph.product_code=p.product_code
            ),
            'updated_at',p.updated_at
          ) as item
        from public.taphoa_products p
        join public.taphoa_sources s on s.source_key=p.source_key
        where p.sync_status <> 'deleted'
          and s.sync_status <> 'deleted'
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
    'total',(
      select count(*)
      from public.taphoa_products p
      join public.taphoa_sources s on s.source_key=p.source_key
      where p.sync_status <> 'deleted'
        and s.sync_status <> 'deleted'
        and (v_source='' or p.source_key=v_source)
        and (
          v_query=''
          or p.product_code ilike '%'||v_query||'%'
          or p.product_name ilike '%'||v_query||'%'
        )
    ),
    'sources',coalesce((
      select jsonb_agg(
        jsonb_build_object('source_key',s.source_key,'name',s.name,'active',s.active,'sync_status',s.sync_status)
        order by s.sort_order,s.source_key
      )
      from public.taphoa_sources s
      where s.sync_status <> 'deleted'
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
  v_name text;
  v_source_key text;
  v_input numeric;
  v_sale numeric;
  v_supplier numeric;
  v_basis text;
  v_standard numeric;
  v_units numeric;
  v_retail_price numeric;
  v_retail_unit text;
  v_admin_state text;
  v_changed boolean := false;
  v_price_changed boolean := false;
begin
  if not coalesce((ctx->>'allowed')::boolean,false) or ctx->>'taphoa_role' <> 'admin' then raise exception 'taphoa_access_denied' using errcode='42501'; end if;
  if v_code='' then raise exception 'product_code_required'; end if;
  select * into current_row from public.taphoa_products where product_code=v_code and sync_status <> 'deleted' for update;
  if not found then raise exception 'product_not_found' using errcode='P0002'; end if;

  v_name := case when p_product ? 'name' then btrim(coalesce(p_product->>'name','')) else current_row.product_name end;
  if v_name='' then raise exception 'product_name_required'; end if;
  v_source_key := case when p_product ? 'source_key' then btrim(coalesce(p_product->>'source_key','')) else current_row.source_key end;
  if not exists(select 1 from public.taphoa_sources where source_key=v_source_key and sync_status<>'deleted') then raise exception 'source_not_found' using errcode='P0002'; end if;

  v_input := case when p_product ? 'cost' then case when nullif(btrim(coalesce(p_product->>'cost','')),'') is null then null else (p_product->>'cost')::numeric end else current_row.input_price_vnd end;
  v_supplier := case when p_product ? 'supplier_price' then case when nullif(btrim(coalesce(p_product->>'supplier_price','')),'') is null then null else (p_product->>'supplier_price')::numeric end else current_row.supplier_price_vnd end;
  v_basis := case when p_product ? 'sale_price_basis' then lower(btrim(coalesce(p_product->>'sale_price_basis','manual'))) else current_row.sale_price_basis end;

  if v_basis not in ('manual','supplier_1','supplier_1_5') then raise exception 'invalid_sale_price_basis'; end if;
  if v_basis in ('supplier_1','supplier_1_5') and v_supplier is null then raise exception 'supplier_price_required'; end if;

  v_sale := case
    when v_basis='supplier_1' then v_supplier
    when v_basis='supplier_1_5' then ceil(v_supplier*1.015)
    when p_product ? 'price' then case when nullif(btrim(coalesce(p_product->>'price','')),'') is null then null else (p_product->>'price')::numeric end
    else current_row.sale_price_vnd
  end;

  v_standard := case when p_product ? 'standard_profit_percent' then case when nullif(btrim(coalesce(p_product->>'standard_profit_percent','')),'') is null then null else (p_product->>'standard_profit_percent')::numeric end else current_row.expected_profit_percent end;
  v_units := case when p_product ? 'units_per_carton' then case when nullif(btrim(coalesce(p_product->>'units_per_carton','')),'') is null then null else (p_product->>'units_per_carton')::numeric end else current_row.units_per_carton end;
  v_retail_price := case when p_product ? 'retail_price' then case when nullif(btrim(coalesce(p_product->>'retail_price','')),'') is null then null else (p_product->>'retail_price')::numeric end else current_row.retail_price_vnd end;
  v_retail_unit := case when p_product ? 'retail_unit' then btrim(coalesce(p_product->>'retail_unit','')) else current_row.retail_unit end;
  v_admin_state := case when p_product ? 'admin_state' then lower(btrim(coalesce(p_product->>'admin_state',''))) else current_row.admin_state end;

  if v_input is not null and v_input<0 then raise exception 'invalid_cost'; end if;
  if v_sale is not null and v_sale<0 then raise exception 'invalid_price'; end if;
  if v_supplier is not null and v_supplier<0 then raise exception 'invalid_supplier_price'; end if;
  if v_units is not null and v_units<1 then raise exception 'invalid_units_per_carton'; end if;
  if v_retail_price is not null and v_retail_price<0 then raise exception 'invalid_retail_price'; end if;
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
    or current_row.retail_price_vnd is distinct from v_retail_price
    or current_row.retail_unit is distinct from v_retail_unit
    or current_row.admin_state is distinct from v_admin_state;

  if not v_changed then
    return jsonb_build_object('ok',true,'changed',false,'product_code',v_code,'price',current_row.sale_price_vnd,'sale_price_basis',current_row.sale_price_basis);
  end if;

  v_price_changed := current_row.input_price_vnd is distinct from v_input
    or current_row.sale_price_vnd is distinct from v_sale
    or current_row.supplier_price_vnd is distinct from v_supplier
    or current_row.expected_profit_percent is distinct from v_standard;

  if v_price_changed then
    insert into public.taphoa_product_price_history(
      product_code,changed_by,old_cost,new_cost,old_sale,new_sale,old_supplier,new_supplier,old_standard_profit_percent,new_standard_profit_percent
    ) values (
      v_code,auth.uid(),current_row.input_price_vnd,v_input,current_row.sale_price_vnd,v_sale,
      current_row.supplier_price_vnd,v_supplier,current_row.expected_profit_percent,v_standard
    );
    delete from public.taphoa_product_price_history h
    where h.product_code=v_code and h.id not in (
      select h2.id from public.taphoa_product_price_history h2 where h2.product_code=v_code order by h2.changed_at desc,h2.id desc limit 50
    );
  end if;

  update public.taphoa_products
  set product_name=v_name,source_key=v_source_key,input_price_vnd=v_input,sale_price_vnd=v_sale,
      sale_price_basis=v_basis,carton_price_vnd=v_sale,supplier_price_vnd=v_supplier,
      expected_profit_percent=v_standard,units_per_carton=v_units,retail_price_vnd=v_retail_price,
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
    'sale_price_basis',v_basis,'supplier_price',v_supplier,'standard_profit_percent',v_standard,
    'units_per_carton',v_units,'retail_unit',v_retail_unit,'retail_price',v_retail_price,'admin_state',v_admin_state
  );
end;
$$;

revoke all on function public.taphoa_update_product_from_web(jsonb) from public, anon;
grant execute on function public.taphoa_update_product_from_web(jsonb) to authenticated;

create or replace function public.taphoa_admin_create_product(p_product jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  ctx jsonb := public.taphoa_access_context();
  v_source text := btrim(coalesce(p_product->>'source_key',''));
  v_name text := btrim(coalesce(p_product->>'name',''));
  v_prefix text; v_next integer; v_code text; v_row integer;
  v_cost numeric := nullif(btrim(coalesce(p_product->>'cost','')),'')::numeric;
  v_price numeric := nullif(btrim(coalesce(p_product->>'price','')),'')::numeric;
  v_supplier numeric := nullif(btrim(coalesce(p_product->>'supplier_price','')),'')::numeric;
  v_basis text := lower(btrim(coalesce(p_product->>'sale_price_basis','manual')));
  v_standard numeric := nullif(btrim(coalesce(p_product->>'standard_profit_percent','')),'')::numeric;
  v_units numeric := nullif(btrim(coalesce(p_product->>'units_per_carton','')),'')::numeric;
  v_retail_price numeric := nullif(btrim(coalesce(p_product->>'retail_price','')),'')::numeric;
  v_retail_unit text := btrim(coalesce(p_product->>'retail_unit',''));
begin
  if not coalesce((ctx->>'allowed')::boolean,false) or ctx->>'taphoa_role'<>'admin' then raise exception 'taphoa_access_denied' using errcode='42501'; end if;
  if v_name='' then raise exception 'product_name_required'; end if;
  if not exists(select 1 from public.taphoa_sources where source_key=v_source and sync_status<>'deleted') then raise exception 'source_not_found' using errcode='P0002'; end if;
  if v_basis not in ('manual','supplier_1','supplier_1_5') then raise exception 'invalid_sale_price_basis'; end if;
  if v_basis in ('supplier_1','supplier_1_5') and v_supplier is null then raise exception 'supplier_price_required'; end if;
  if v_basis='supplier_1' then v_price:=v_supplier; end if;
  if v_basis='supplier_1_5' then v_price:=ceil(v_supplier*1.015); end if;

  if v_cost is not null and v_cost<0 then raise exception 'invalid_cost'; end if;
  if v_price is not null and v_price<0 then raise exception 'invalid_price'; end if;
  if v_supplier is not null and v_supplier<0 then raise exception 'invalid_supplier_price'; end if;
  if v_units is not null and v_units<1 then raise exception 'invalid_units_per_carton'; end if;
  if v_retail_price is not null and v_retail_price<0 then raise exception 'invalid_retail_price'; end if;
  if v_standard is not null and (v_standard<0 or v_standard>100) then raise exception 'invalid_standard_profit_percent'; end if;

  v_prefix := case v_source when 'hang-thuong' then 'HT-' when 'thuoc-la' then 'TL-' when 'sua' then 'SUA-' when 'hang-u' then 'HU-' else 'SP-' end;
  perform pg_advisory_xact_lock(hashtext('taphoa-product-code:'||v_prefix));
  select coalesce(max((regexp_match(product_code,'([0-9]+)$'))[1]::integer),0)+1 into v_next
  from public.taphoa_products where product_code like v_prefix||'%';
  loop
    v_code := v_prefix||lpad(v_next::text,6,'0');
    exit when not exists(select 1 from public.taphoa_products where product_code=v_code);
    v_next := v_next+1;
  end loop;
  select coalesce(max(source_row),0)+1 into v_row from public.taphoa_products where source_key=v_source;

  insert into public.taphoa_products(
    product_code,source_key,source_row,product_name,input_price_vnd,input_price_basis,
    expected_profit_percent,applied_profit_vnd,sale_price_vnd,sale_price_basis,carton_price_vnd,
    retail_price_vnd,units_per_carton,retail_unit,stock_status,stock_label,is_active,raw_row,
    sheet_updated_at,updated_at,sync_status,deleted_at,supplier_price_vnd,admin_state
  ) values (
    v_code,v_source,v_row,v_name,v_cost,'carton',v_standard,
    case when v_cost is not null and v_price is not null then greatest(v_price-v_cost,0) else 0 end,
    v_price,v_basis,v_price,v_retail_price,v_units,v_retail_unit,
    case when v_price is null or v_price<=0 then 'no_price' else 'available' end,
    case when v_price is null or v_price<=0 then 'Chưa có giá' else '' end,
    true,'[]'::jsonb,null,now(),'active',null,v_supplier,'active'
  );
  update public.taphoa_revisions set revision=revision+1,updated_at=now() where domain='products';
  return jsonb_build_object('ok',true,'created',true,'product_code',v_code,'source_key',v_source);
end;
$$;

revoke all on function public.taphoa_admin_create_product(jsonb) from public, anon;
grant execute on function public.taphoa_admin_create_product(jsonb) to authenticated;

create or replace function public.taphoa_admin_product_history(p_product_code text,p_limit integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  ctx jsonb := public.taphoa_access_context();
  v_code text := upper(btrim(coalesce(p_product_code,'')));
  v_limit integer := greatest(1,least(50,coalesce(p_limit,30)));
  result jsonb;
begin
  if not coalesce((ctx->>'allowed')::boolean,false) or ctx->>'taphoa_role'<>'admin' then raise exception 'taphoa_access_denied' using errcode='42501'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',x.id,'changed_at',x.changed_at,'old_cost',x.old_cost,'new_cost',x.new_cost,
    'old_sale',x.old_sale,'new_sale',x.new_sale,'old_supplier',x.old_supplier,'new_supplier',x.new_supplier,
    'old_standard_profit_percent',x.old_standard_profit_percent,'new_standard_profit_percent',x.new_standard_profit_percent
  ) order by x.changed_at desc,x.id desc),'[]'::jsonb)
  into result
  from (
    select * from public.taphoa_product_price_history where product_code=v_code order by changed_at desc,id desc limit v_limit
  ) x;
  return result;
end;
$$;

revoke all on function public.taphoa_admin_product_history(text,integer) from public, anon;
grant execute on function public.taphoa_admin_product_history(text,integer) to authenticated;
