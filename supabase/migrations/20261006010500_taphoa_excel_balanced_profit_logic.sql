-- Port the current QUẢN TRỊ NGUỒN HÀNG Excel pricing model to Supabase.
-- Fixed +15k/carton is NOT a sale-price rule.
-- For ordinary goods, balanced profit follows Excel "Chuẩn Dòng":
-- round((old_profit^2 + (cost*1.5%)^2 + (cost*3%)^2) / (old_profit + cost*1.5% + cost*3%)).
-- Tobacco remains cost +1 per cây. NPP selections remain explicit web overrides.

alter table public.taphoa_products
  add column if not exists legacy_profit_vnd numeric;

update public.taphoa_products set legacy_profit_vnd=null
where source_key in ('hang-thuong','sua','hang-u','sheet-1150410221');

with src(product_code,legacy_profit_vnd) as (
  values
  ('HT-000004',10),
('HT-000005',10),
('HT-000006',10),
('HT-000009',10),
('HT-000010',10),
('HT-000011',10),
('HT-000012',10),
('HT-000013',10),
('HT-000014',10),
('HT-000015',10),
('HT-000016',10),
('HT-000017',10),
('HT-000018',10),
('HT-000019',10),
('HT-000020',10),
('HT-000021',10),
('HT-000022',10),
('HT-000023',10),
('HT-000024',10),
('HT-000025',10),
('HT-000026',10),
('HT-000027',10),
('HT-000028',10),
('HT-000029',10),
('HT-000030',10),
('HT-000031',10),
('HT-000032',10),
('HT-000033',10),
('HT-000034',10),
('HT-000035',10),
('HT-000036',10),
('HT-000037',10),
('HT-000038',10),
('HT-000039',10),
('HT-000003',10),
('HT-000040',10),
('HT-000041',10),
('HT-000042',10),
('HT-000043',10),
('HT-000044',10),
('HT-000045',10),
('HT-000046',10),
('HT-000047',10),
('HT-000048',10),
('HT-000049',10),
('HT-000050',10),
('HT-000051',10),
('HT-000052',16),
('HT-000263',10),
('HT-000053',16),
('HT-000262',10),
('HT-000054',16),
('HT-000055',16),
('HT-000261',10),
('HT-000056',10),
('HT-000057',10),
('HT-000058',10),
('HT-000059',10),
('HT-000060',10),
('HT-000061',10),
('HT-000062',10),
('HT-000063',15),
('HT-000064',15),
('HT-000065',10),
('HT-000067',10),
('HT-000066',10),
('HT-000068',15),
('HT-000069',10),
('HT-000070',10),
('HT-000071',10),
('HT-000072',10),
('HT-000073',10),
('HT-000074',10),
('HT-000075',10),
('HT-000076',10),
('HT-000077',10),
('HT-000078',10),
('HT-000079',10),
('HT-000080',10),
('HT-000081',10),
('HT-000082',10),
('HT-000083',10),
('HT-000084',10),
('HT-000085',10),
('HT-000086',10),
('HT-000088',10),
('HT-000089',10),
('HT-000090',10),
('HT-000091',10),
('HT-000092',10),
('HT-000269',10),
('HT-000267',10),
('HT-000268',10),
('HT-000093',10),
('HT-000094',10),
('HT-000095',10),
('HT-000096',10),
('HT-000097',10),
('HT-000098',10),
('HT-000099',10),
('HT-000100',10),
('HT-000102',10),
('HT-000103',10),
('HT-000104',10),
('HT-000101',10),
('HT-000105',10),
('HT-000106',15),
('HT-000107',15),
('HT-000108',20),
('HT-000109',15),
('HT-000110',15),
('HT-000111',20),
('HT-000112',15),
('HT-000113',15),
('HT-000114',20),
('HT-000115',15),
('HT-000116',15),
('HT-000002',10),
('HT-000117',15),
('HT-000118',15),
('HT-000119',15),
('HT-000120',20),
('HT-000121',30),
('HT-000122',30),
('HT-000123',30),
('HT-000087',10),
('HT-000124',30),
('HT-000125',10),
('HT-000126',10),
('HT-000127',10),
('HT-000128',10),
('HT-000129',10),
('HT-000130',10),
('HT-000131',10),
('HT-000132',10),
('HT-000133',10),
('HT-000134',10),
('HT-000135',10),
('HT-000136',10),
('HT-000137',10),
('HT-000139',10),
('HT-000140',10),
('HT-000260',10),
('HT-000259',10),
('HT-000141',10),
('HT-000142',10),
('HT-000143',10),
('HT-000144',10),
('HT-000145',10),
('HT-000146',10),
('HT-000147',10),
('HT-000148',10),
('HT-000149',10),
('HT-000155',10),
('HT-000150',10),
('HT-000151',10),
('HT-000152',10),
('HT-000153',10),
('HT-000154',10),
('HT-000156',10),
('HT-000157',10),
('HT-000158',10),
('HT-000159',10),
('HT-000161',10),
('HT-000163',10),
('HT-000164',10),
('HT-000165',10),
('HT-000166',10),
('HT-000167',10),
('HT-000171',10),
('HT-000170',10),
('HT-000172',10),
('HT-000173',10),
('HT-000270',10),
('HT-000176',16.65),
('HT-000177',17.55),
('HT-000178',18.45),
('HT-000180',10),
('HT-000181',10),
('HT-000182',10),
('HT-000183',10),
('HT-000184',10),
('HT-000185',10),
('HT-000186',10),
('HT-000187',10),
('HT-000188',10),
('HT-000189',10),
('HT-000190',10),
('HT-000191',10),
('HT-000192',10),
('HT-000193',10),
('HT-000194',10),
('HT-000195',10),
('HT-000196',10),
('HT-000197',10),
('HT-000179',10),
('HT-000198',10),
('HT-000199',10),
('HT-000200',10),
('HT-000201',10),
('HT-000202',10),
('HT-000203',10),
('HT-000204',10),
('HT-000205',10),
('HT-000206',10),
('HT-000207',10),
('HT-000208',10),
('HT-000209',10),
('HT-000210',10),
('HT-000211',10),
('HT-000212',10),
('HT-000213',10),
('HT-000214',10),
('HT-000215',10),
('HT-000216',10),
('HT-000217',10),
('HT-000218',10),
('HT-000219',10),
('HT-000160',10),
('HT-000162',10),
('HT-000220',10),
('HT-000221',10),
('HT-000222',10),
('HT-000001',10),
('HT-000223',10),
('HT-000224',10),
('HT-000225',10),
('HT-000266',10),
('HT-000264',10),
('HT-000265',10),
('HT-000226',10),
('HT-000227',10),
('HT-000228',10),
('HT-000229',10),
('HT-000230',10),
('HT-000231',10),
('HT-000232',10),
('HT-000233',10),
('HT-000234',10),
('HT-000235',10),
('HT-000236',10),
('HT-000237',10),
('HT-000238',10),
('HT-000239',10),
('HT-000240',10),
('HT-000241',10),
('HT-000242',10),
('HT-000243',10),
('HT-000244',20),
('HT-000245',20),
('HT-000246',10),
('HT-000247',10),
('HT-000248',10),
('HT-000249',10),
('HT-000250',10),
('HT-000251',10),
('HT-000252',10),
('HT-000253',10),
('HT-000254',10),
('HT-000255',10),
('HT-000256',10),
('HT-000257',10),
('HT-000258',10),
('HT-000008',20),
('HT-000007',20),
('HT-000168',20),
('HT-000169',20),
('HT-000174',20),
('HT-000175',10),
('HT-000138',10),
('SUA-000001',10),
('SUA-000002',10),
('SUA-000003',10),
('SUA-000004',10),
('SUA-000005',10),
('SUA-000006',15),
('SUA-000010',15),
('SUA-000007',15),
('SUA-000008',15),
('SUA-000009',15),
('SUA-000011',15),
('SUA-000012',15),
('SUA-000013',15),
('SUA-000014',10),
('SUA-000015',10),
('SUA-000016',10),
('SUA-000017',10),
('SUA-000018',10),
('SUA-000019',10),
('SUA-000020',10),
('SUA-000021',10),
('SUA-000022',10),
('SUA-000023',10),
('SUA-000024',10),
('SUA-000025',10),
('SUA-000026',10),
('SUA-000027',20),
('SUA-000028',10),
('SUA-000029',10),
('SUA-000030',10),
('SUA-000031',10),
('SUA-000032',10),
('SUA-000033',10),
('SUA-000058',20),
('SUA-000034',20),
('SUA-000035',30),
('SUA-000036',10),
('SUA-000037',20),
('SUA-000038',20),
('SUA-000039',20),
('SUA-000040',20),
('SUA-000041',20),
('SUA-000042',15),
('SUA-000043',20),
('SUA-000057',20),
('SUA-000044',20),
('SUA-000045',20),
('SUA-000046',20),
('SUA-000047',15),
('SUA-000048',10),
('SUA-000049',10),
('SUA-000050',20),
('SUA-000051',20),
('SUA-000052',20),
('SUA-000053',20),
('SUA-000054',20),
('SUA-000055',20),
('SUA-000056',20),
('SUA-000060',15),
('HU-000001',15),
('HU-000002',15),
('HU-000003',15),
('HU-000004',15),
('HU-000005',15),
('HU-000006',20),
('HU-000007',15),
('HU-000008',15),
('HU-000009',15),
('HU-000010',15),
('HU-000011',15),
('HU-000012',15),
('HU-000013',15),
('HU-000014',15),
('HU-000015',15),
('HU-000016',15),
('HU-000017',15),
('HU-000018',15),
('HU-000162',15),
('HU-000019',20),
('HU-000020',21),
('HU-000021',20),
('HU-000022',20),
('HU-000023',19),
('HU-000024',20),
('HU-000026',20),
('HU-000028',20),
('HU-000029',20),
('HU-000030',20),
('HU-000032',20),
('HU-000033',2),
('HU-000034',2),
('HU-000035',2),
('HU-000036',21),
('HU-000038',20),
('HU-000039',20),
('HU-000040',20),
('HU-000041',20),
('HU-000042',20),
('HU-000043',20),
('HU-000044',20),
('HU-000045',20),
('HU-000046',20),
('HU-000047',20),
('HU-000048',20),
('HU-000050',20),
('HU-000051',20),
('HU-000052',20),
('HU-000053',20),
('HU-000054',20),
('HU-000055',20),
('HU-000056',10),
('HU-000057',10),
('HU-000058',10),
('HU-000059',5),
('HU-000060',15),
('HU-000061',15),
('HU-000062',15),
('HU-000063',15),
('HU-000064',20),
('HU-000065',20),
('HU-000160',2),
('HU-000066',20),
('HU-000067',20),
('HU-000068',20),
('HU-000069',20),
('HU-000070',20),
('HU-000071',20),
('HU-000072',20),
('HU-000073',2),
('HU-000074',2),
('HU-000075',2),
('HU-000076',2),
('HU-000077',2),
('HU-000078',2),
('HU-000079',2),
('HU-000080',20),
('HU-000161',20),
('HU-000081',20),
('HU-000082',20),
('HU-000083',20),
('HU-000084',20),
('HU-000085',20),
('HU-000086',20),
('HU-000089',20),
('HU-000090',20),
('HU-000091',20),
('HU-000092',20),
('HU-000093',20),
('HU-000094',20),
('HU-000095',20),
('HU-000096',20),
('HU-000097',25),
('HU-000098',20),
('HU-000099',20),
('HU-000100',20),
('HU-000101',20),
('HU-000102',20),
('HU-000103',20),
('HU-000104',20),
('HU-000105',20),
('HU-000106',20),
('HU-000107',15),
('HU-000108',15),
('HU-000109',15),
('HU-000110',15),
('HU-000111',15),
('HU-000112',15),
('HU-000113',15),
('HU-000114',15),
('HU-000115',15),
('HU-000116',15),
('HU-000117',15),
('HU-000118',15),
('HU-000120',15),
('HU-000122',15),
('HU-000123',15),
('HU-000124',15),
('HU-000125',15),
('HU-000126',15),
('HU-000127',20),
('HU-000128',20),
('HU-000129',20),
('HU-000130',20),
('HU-000131',20),
('HU-000132',20),
('HU-000133',20),
('HU-000134',20),
('HU-000135',20),
('HU-000159',20),
('HU-000136',20),
('HU-000137',19),
('HU-000138',20),
('HU-000139',20),
('HU-000140',20),
('HU-000141',21),
('HU-000143',20),
('HU-000144',20),
('HU-000145',20),
('HU-000146',20),
('HU-000147',20),
('HU-000148',20),
('HU-000149',20),
('HU-000150',20),
('HU-000151',20),
('HU-000152',20),
('HU-000153',20),
('HU-000154',20),
('HU-000155',21),
('HU-000156',20),
('HU-000157',20),
('HU-000142',1)
)
update public.taphoa_products p
set legacy_profit_vnd=src.legacy_profit_vnd
from src
where p.product_code=src.product_code;

update public.taphoa_sources
set default_markup_vnd=null,default_markup_percent=null,updated_at=now()
where source_key in ('hang-thuong','sua','hang-u','sheet-1150410221');

update public.taphoa_sources
set default_markup_vnd=1,default_markup_percent=null,updated_at=now()
where source_key='thuoc-la';

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
  v_retail_price numeric := nullif(btrim(coalesce(p_product->>'retail_price','')),'')::numeric;
  v_retail_unit text := btrim(coalesce(p_product->>'retail_unit',''));
begin
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
  if v_retail_price is not null and v_retail_price<0 then raise exception 'invalid_retail_price'; end if;

  v_basis := case when v_supplier is null then 'auto' else 'supplier_1' end;
  v_price := public.taphoa_product_sale_price(v_cost,v_supplier,v_basis,v_source,null);

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

  update public.taphoa_revisions
  set revision=revision+1,updated_at=now()
  where domain='products';

  return jsonb_build_object(
    'ok',true,'created',true,'product_code',v_code,'source_key',v_source,'price',v_price
  );
end;
$function$
;

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
            'retail_price',p.retail_price_vnd,'admin_state',p.admin_state,
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
          and (v_query='' or p.product_code ilike '%'||v_query||'%' or p.product_name ilike '%'||v_query||'%')
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
        and (v_query='' or p.product_code ilike '%'||v_query||'%' or p.product_name ilike '%'||v_query||'%')
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

CREATE OR REPLACE FUNCTION public.taphoa_balanced_profit(p_cost numeric, p_old_profit numeric)
 RETURNS numeric
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  select case
    when p_cost is null or p_cost<=0 then null
    else round(
      (
        power(greatest(coalesce(p_old_profit,0),0),2)
        + power(p_cost*0.015,2)
        + power(p_cost*0.03,2)
      )
      /
      nullif(
        greatest(coalesce(p_old_profit,0),0)
        + p_cost*0.015
        + p_cost*0.03,
        0
      ),
      0
    )
  end;
$function$
;

CREATE OR REPLACE FUNCTION public.taphoa_product_sale_price(p_cost numeric, p_supplier numeric, p_basis text, p_source_key text, p_old_profit numeric)
 RETURNS numeric
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  select case
    when p_supplier is not null and p_basis='supplier_1_5' then ceil(p_supplier*1.015)
    when p_supplier is not null then p_supplier
    when p_cost is null then null
    when p_source_key='thuoc-la' then p_cost+1
    when p_source_key in ('hang-thuong','sua','hang-u','sheet-1150410221')
      then p_cost + public.taphoa_balanced_profit(p_cost,p_old_profit)
    else p_cost
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
  v_basis text; v_markup numeric; v_markup_percent numeric; v_standard numeric; v_units numeric; v_retail_price numeric;
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
  v_retail_price := case when p_product ? 'retail_price' then nullif(btrim(coalesce(p_product->>'retail_price','')),'')::numeric else current_row.retail_price_vnd end;
  v_retail_unit := case when p_product ? 'retail_unit' then btrim(coalesce(p_product->>'retail_unit','')) else current_row.retail_unit end;
  v_admin_state := case when p_product ? 'admin_state' then lower(btrim(coalesce(p_product->>'admin_state',''))) else current_row.admin_state end;

  if v_input is not null and v_input<0 then raise exception 'invalid_cost'; end if;
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
    'sale_price_basis',v_basis,'supplier_price',v_supplier,
    'default_markup_vnd',v_markup,'default_markup_percent',v_markup_percent,
    'standard_profit_percent',v_standard,'units_per_carton',v_units,
    'retail_unit',v_retail_unit,'retail_price',v_retail_price,'admin_state',v_admin_state
  );
end;
$function$
;

update public.taphoa_products p
set sale_price_vnd=public.taphoa_product_sale_price(
      p.input_price_vnd,p.supplier_price_vnd,p.sale_price_basis,p.source_key,p.legacy_profit_vnd
    ),
    carton_price_vnd=public.taphoa_product_sale_price(
      p.input_price_vnd,p.supplier_price_vnd,p.sale_price_basis,p.source_key,p.legacy_profit_vnd
    ),
    applied_profit_vnd=case
      when p.input_price_vnd is not null
       and public.taphoa_product_sale_price(
         p.input_price_vnd,p.supplier_price_vnd,p.sale_price_basis,p.source_key,p.legacy_profit_vnd
       ) is not null
      then greatest(
        public.taphoa_product_sale_price(
          p.input_price_vnd,p.supplier_price_vnd,p.sale_price_basis,p.source_key,p.legacy_profit_vnd
        )-p.input_price_vnd,0
      )
      else 0
    end,
    updated_at=now()
where p.sync_status<>'deleted';

update public.taphoa_revisions
set revision=revision+1,updated_at=now()
where domain='products';
