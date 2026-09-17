-- Realtime product edit path: Web -> Supabase -> Management Sheet -> Supabase ack -> Web.

create extension if not exists pgcrypto;

create table if not exists public.taphoa_product_sheet_state (
  product_code text primary key references public.taphoa_products(product_code) on delete cascade,
  source_key text not null references public.taphoa_sources(source_key),
  sheet_row integer not null check (sheet_row > 0),
  sheet_hash text not null default '',
  last_pushed_hash text not null default '',
  last_sheet_modified_time timestamptz,
  last_pushed_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.taphoa_product_outbox (
  id bigint generated always as identity primary key,
  product_code text not null references public.taphoa_products(product_code) on delete cascade,
  source_key text not null references public.taphoa_sources(source_key),
  operation text not null check (operation in ('upsert')),
  payload jsonb not null default '{}'::jsonb,
  row_hash text not null,
  status text not null default 'pending' check (status in ('pending','pushed','superseded')),
  attempts integer not null default 0 check (attempts >= 0),
  last_error text not null default '',
  created_at timestamptz not null default now(),
  pushed_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists taphoa_product_outbox_pending_idx
  on public.taphoa_product_outbox(status,id)
  where status='pending';

revoke all on table public.taphoa_product_sheet_state from anon, authenticated;
revoke all on table public.taphoa_product_outbox from anon, authenticated;

grant all on table public.taphoa_product_sheet_state to service_role;
grant all on table public.taphoa_product_outbox to service_role;
grant usage, select on sequence public.taphoa_product_outbox_id_seq to service_role;

create or replace function public.taphoa_product_row_hash(
  p_code text,
  p_name text,
  p_input_price_vnd bigint,
  p_sale_price_vnd bigint
)
returns text
language sql
immutable
set search_path = public
as $$
  select encode(
    extensions.digest(
      upper(btrim(coalesce(p_code,''))) || '|' ||
      btrim(coalesce(p_name,'')) || '|' ||
      coalesce(p_input_price_vnd::text,'') || '|' ||
      coalesce(p_sale_price_vnd::text,''),
      'sha256'
    ),
    'hex'
  );
$$;

revoke all on function public.taphoa_product_row_hash(text,text,bigint,bigint) from public, anon, authenticated;
grant execute on function public.taphoa_product_row_hash(text,text,bigint,bigint) to service_role;

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
  v_input bigint;
  v_sale bigint;
  v_hash text;
  v_changed boolean := false;
begin
  if not coalesce((ctx->>'allowed')::boolean,false) or ctx->>'taphoa_role' <> 'admin' then
    raise exception 'taphoa_access_denied' using errcode='42501';
  end if;

  select * into current_row
  from public.taphoa_products
  where product_code=v_code
  for update;

  if not found then
    raise exception 'product_not_found' using errcode='P0002';
  end if;

  v_name := case when p_product ? 'name' then btrim(coalesce(p_product->>'name','')) else current_row.product_name end;
  if v_name='' then raise exception 'product_name_required'; end if;

  v_source_key := case when p_product ? 'source_key' then btrim(coalesce(p_product->>'source_key','')) else current_row.source_key end;
  if not exists(select 1 from public.taphoa_sources where source_key=v_source_key and active) then
    raise exception 'source_not_found' using errcode='P0002';
  end if;

  if p_product ? 'cost' then
    v_input := case when nullif(btrim(coalesce(p_product->>'cost','')),'') is null then null else round((p_product->>'cost')::numeric*1000)::bigint end;
  else
    v_input := current_row.input_price_vnd;
  end if;

  if p_product ? 'price' then
    v_sale := case when nullif(btrim(coalesce(p_product->>'price','')),'') is null then null else round((p_product->>'price')::numeric*1000)::bigint end;
  else
    v_sale := current_row.sale_price_vnd;
  end if;

  if v_input is not null and v_input < 0 then raise exception 'invalid_cost'; end if;
  if v_sale is not null and v_sale < 0 then raise exception 'invalid_price'; end if;

  v_changed := current_row.product_name is distinct from v_name
    or current_row.source_key is distinct from v_source_key
    or current_row.input_price_vnd is distinct from v_input
    or current_row.sale_price_vnd is distinct from v_sale;

  if not v_changed then
    return jsonb_build_object('ok',true,'changed',false,'product_code',v_code);
  end if;

  update public.taphoa_products
  set product_name=v_name,
      source_key=v_source_key,
      input_price_vnd=v_input,
      sale_price_vnd=v_sale,
      carton_price_vnd=v_sale,
      retail_price_vnd=null,
      applied_profit_vnd=case when v_input is not null and v_sale is not null then greatest(v_sale-v_input,0) else 0 end,
      stock_status=case when v_sale is null or v_sale<=0 then 'no_price' else 'available' end,
      stock_label=case when v_sale is null or v_sale<=0 then 'Chưa có giá' else '' end,
      is_active=true,
      updated_at=now()
  where product_code=v_code;

  v_hash := public.taphoa_product_row_hash(v_code,v_name,v_input,v_sale);

  update public.taphoa_product_outbox
  set status='superseded',updated_at=now()
  where product_code=v_code and status='pending';

  insert into public.taphoa_product_outbox(product_code,source_key,operation,payload,row_hash)
  values (
    v_code,
    v_source_key,
    'upsert',
    jsonb_build_object(
      'product_code',v_code,
      'product_name',v_name,
      'input_price_vnd',v_input,
      'sale_price_vnd',v_sale,
      'source_row',current_row.source_row
    ),
    v_hash
  );

  update public.taphoa_revisions
  set revision=revision+1,updated_at=now()
  where domain='products';

  return jsonb_build_object('ok',true,'changed',true,'product_code',v_code,'row_hash',v_hash);
end;
$$;

revoke all on function public.taphoa_update_product_from_web(jsonb) from public, anon;
grant execute on function public.taphoa_update_product_from_web(jsonb) to authenticated;

create or replace function public.taphoa_apply_product_delta(
  p_products jsonb,
  p_source_codes jsonb,
  p_modified_time timestamptz,
  p_total_rows integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_upserted integer := 0;
  v_deactivated integer := 0;
  v_revision bigint := 0;
begin
  if jsonb_typeof(p_products) <> 'array' then raise exception 'taphoa_products_delta_invalid'; end if;
  if jsonb_typeof(p_source_codes) <> 'array' then raise exception 'taphoa_source_codes_invalid'; end if;

  if jsonb_array_length(p_products) > 0 then
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
    get diagnostics v_upserted = row_count;
  end if;

  update public.taphoa_products p
  set is_active=false,
      stock_status='no_price',
      stock_label='Ngừng dùng',
      sheet_updated_at=p_modified_time,
      updated_at=now()
  where p.is_active=true
    and exists (
      select 1
      from jsonb_to_recordset(p_source_codes) as s(source_key text,codes jsonb)
      where s.source_key=p.source_key
        and not exists (
          select 1 from jsonb_array_elements_text(s.codes) c(code)
          where c.code=p.product_code
        )
    );
  get diagnostics v_deactivated = row_count;

  delete from public.taphoa_product_sheet_state st
  where exists (
    select 1
    from jsonb_to_recordset(p_source_codes) as s(source_key text,codes jsonb)
    where s.source_key=st.source_key
      and not exists (
        select 1 from jsonb_array_elements_text(s.codes) c(code)
        where c.code=st.product_code
      )
  );

  if v_upserted + v_deactivated > 0 then
    update public.taphoa_revisions
    set revision=revision+1,updated_at=now()
    where domain='products'
    returning revision into v_revision;
  else
    select revision into v_revision from public.taphoa_revisions where domain='products';
  end if;

  update public.taphoa_sheet_sync_state
  set last_drive_modified_time=p_modified_time,
      last_success_at=now(),
      last_sync_status='success',
      last_error='',
      last_imported_row_count=greatest(coalesce(p_total_rows,0),0),
      updated_at=now()
  where id=1;

  return jsonb_build_object('upserted',v_upserted,'deactivated',v_deactivated,'revision',v_revision);
end;
$$;

revoke all on function public.taphoa_apply_product_delta(jsonb,jsonb,timestamptz,integer) from public, anon, authenticated;
grant execute on function public.taphoa_apply_product_delta(jsonb,jsonb,timestamptz,integer) to service_role;
