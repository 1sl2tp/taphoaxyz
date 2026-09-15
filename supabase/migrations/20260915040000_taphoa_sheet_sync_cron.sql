-- TAPHOA-owned one-way management Sheet sync support.

-- Cron authentication secret lives only in Vault and is never embedded in source.
do $$
begin
  if not exists (
    select 1 from vault.decrypted_secrets where name='taphoa_sheet_sync_cron_secret'
  ) then
    perform vault.create_secret(
      replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-',''),
      'taphoa_sheet_sync_cron_secret',
      'TAPHOA management Sheet sync cron secret'
    );
  end if;
end;
$$;

create or replace function public.taphoa_validate_sheet_sync_cron(p_secret text)
returns boolean
language sql
stable
security definer
set search_path = public, vault
as $$
  select coalesce(p_secret,'') <> ''
     and exists (
       select 1
       from vault.decrypted_secrets s
       where s.name='taphoa_sheet_sync_cron_secret'
         and s.decrypted_secret=p_secret
     );
$$;

revoke all on function public.taphoa_validate_sheet_sync_cron(text) from public, anon, authenticated;
grant execute on function public.taphoa_validate_sheet_sync_cron(text) to service_role;

-- Apply all five source snapshots atomically. Revision advances only after the
-- complete incoming set has been accepted.
create or replace function public.taphoa_apply_product_sync(
  p_sources jsonb,
  p_products jsonb,
  p_modified_time timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_imported integer := 0;
  v_deactivated integer := 0;
  v_revision bigint := 0;
begin
  if jsonb_typeof(p_sources) <> 'array' or jsonb_array_length(p_sources) <> 5 then
    raise exception 'taphoa_sources_snapshot_invalid';
  end if;
  if jsonb_typeof(p_products) <> 'array' or jsonb_array_length(p_products) = 0 then
    raise exception 'taphoa_products_snapshot_empty';
  end if;

  insert into public.taphoa_sources(source_key,name,sort_order,active,updated_at)
  select x.source_key,x.name,x.sort_order,coalesce(x.active,true),now()
  from jsonb_to_recordset(p_sources) as x(
    source_key text,
    name text,
    sort_order integer,
    active boolean
  )
  on conflict (source_key) do update
  set name=excluded.name,
      sort_order=excluded.sort_order,
      active=excluded.active,
      updated_at=excluded.updated_at;

  insert into public.taphoa_products(
    product_code,source_key,source_row,product_name,
    input_price_vnd,input_price_basis,expected_profit_percent,applied_profit_vnd,
    sale_price_vnd,carton_price_vnd,retail_price_vnd,units_per_carton,retail_unit,
    stock_status,stock_label,is_active,raw_row,sheet_updated_at,updated_at
  )
  select
    x.product_code,x.source_key,x.source_row,x.product_name,
    x.input_price_vnd,x.input_price_basis,x.expected_profit_percent,coalesce(x.applied_profit_vnd,0),
    x.sale_price_vnd,x.carton_price_vnd,x.retail_price_vnd,x.units_per_carton,coalesce(x.retail_unit,''),
    x.stock_status,coalesce(x.stock_label,''),coalesce(x.is_active,true),coalesce(x.raw_row,'[]'::jsonb),
    coalesce(x.sheet_updated_at,p_modified_time),now()
  from jsonb_to_recordset(p_products) as x(
    product_code text,
    source_key text,
    source_row integer,
    product_name text,
    input_price_vnd bigint,
    input_price_basis text,
    expected_profit_percent numeric,
    applied_profit_vnd bigint,
    sale_price_vnd bigint,
    carton_price_vnd bigint,
    retail_price_vnd bigint,
    units_per_carton numeric,
    retail_unit text,
    stock_status text,
    stock_label text,
    is_active boolean,
    raw_row jsonb,
    sheet_updated_at timestamptz
  )
  on conflict (product_code) do update
  set source_key=excluded.source_key,
      source_row=excluded.source_row,
      product_name=excluded.product_name,
      input_price_vnd=excluded.input_price_vnd,
      input_price_basis=excluded.input_price_basis,
      expected_profit_percent=excluded.expected_profit_percent,
      applied_profit_vnd=excluded.applied_profit_vnd,
      sale_price_vnd=excluded.sale_price_vnd,
      carton_price_vnd=excluded.carton_price_vnd,
      retail_price_vnd=excluded.retail_price_vnd,
      units_per_carton=excluded.units_per_carton,
      retail_unit=excluded.retail_unit,
      stock_status=excluded.stock_status,
      stock_label=excluded.stock_label,
      is_active=excluded.is_active,
      raw_row=excluded.raw_row,
      sheet_updated_at=excluded.sheet_updated_at,
      updated_at=excluded.updated_at;

  get diagnostics v_imported = row_count;

  update public.taphoa_products p
  set is_active=false,
      stock_status='no_price',
      stock_label='Ngừng dùng',
      sheet_updated_at=p_modified_time,
      updated_at=now()
  where p.source_key in (
    select s.source_key
    from jsonb_to_recordset(p_sources) as s(source_key text,name text,sort_order integer,active boolean)
  )
    and not exists (
      select 1
      from jsonb_to_recordset(p_products) as i(product_code text)
      where i.product_code=p.product_code
    )
    and p.is_active=true;

  get diagnostics v_deactivated = row_count;

  update public.taphoa_revisions
  set revision=revision+1,updated_at=now()
  where domain='products'
  returning revision into v_revision;

  update public.taphoa_sheet_sync_state
  set last_drive_modified_time=p_modified_time,
      last_success_at=now(),
      last_sync_status='success',
      last_error='',
      last_imported_row_count=v_imported,
      updated_at=now()
  where id=1;

  return jsonb_build_object(
    'imported',v_imported,
    'deactivated',v_deactivated,
    'revision',v_revision
  );
end;
$$;

revoke all on function public.taphoa_apply_product_sync(jsonb,jsonb,timestamptz) from public, anon, authenticated;
grant execute on function public.taphoa_apply_product_sync(jsonb,jsonb,timestamptz) to service_role;

do $$
declare
  j record;
begin
  for j in select jobid from cron.job where jobname='taphoa_sheet_sync_every_minute' loop
    perform cron.unschedule(j.jobid);
  end loop;
end;
$$;

select cron.schedule(
  'taphoa_sheet_sync_every_minute',
  '* * * * *',
  $cron$
    select net.http_post(
      url := 'https://gcnoahqsrquxkwkjbuxy.supabase.co/functions/v1/taphoa-sheet-sync',
      headers := jsonb_build_object(
        'content-type','application/json',
        'x-taphoa-cron',(
          select decrypted_secret
          from vault.decrypted_secrets
          where name='taphoa_sheet_sync_cron_secret'
          limit 1
        )
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 30000
    );
  $cron$
);
