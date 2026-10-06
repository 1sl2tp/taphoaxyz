-- Tobacco is sold/administered as one cây by default.
-- Keep existing Thuốc lá rows and both admin product RPCs aligned with that unit.

begin;

update public.taphoa_products
set units_per_carton=1,
    retail_unit='cây',
    retail_price_vnd=coalesce(
      retail_price_override_vnd,
      public.taphoa_retail_price(sale_price_vnd,1)
    ),
    updated_at=now()
where source_key='thuoc-la'
  and sync_status<>'deleted'
  and (
    units_per_carton is distinct from 1
    or retail_unit is distinct from 'cây'
    or (
      retail_price_override_vnd is null
      and retail_price_vnd is distinct from public.taphoa_retail_price(sale_price_vnd,1)
    )
  );

do $do$
declare
  v_sql text;
begin
  select pg_get_functiondef('public.taphoa_admin_create_product(jsonb)'::regprocedure)
  into v_sql;
  if v_sql is null then
    raise exception 'taphoa_admin_create_product_missing';
  end if;
  v_sql:=regexp_replace(
    v_sql,
    'v_units[[:space:]]*:=[[:space:]]*50;',
    'v_units:=1;',
    'g'
  );
  if position('v_units:=1;' in v_sql)=0 then
    raise exception 'taphoa_admin_create_product_tobacco_unit_patch_failed';
  end if;
  execute v_sql;

  select pg_get_functiondef('public.taphoa_update_product_from_web(jsonb)'::regprocedure)
  into v_sql;
  if v_sql is null then
    raise exception 'taphoa_update_product_from_web_missing';
  end if;
  v_sql:=regexp_replace(
    v_sql,
    'v_units[[:space:]]*:=[[:space:]]*50;',
    'v_units:=1;',
    'g'
  );
  if position('v_units:=1;' in v_sql)=0 then
    raise exception 'taphoa_update_product_from_web_tobacco_unit_patch_failed';
  end if;
  execute v_sql;
end
$do$;

update public.taphoa_revisions
set revision=revision+1,updated_at=now()
where domain='products';

commit;
