-- Sheet-authoritative identity and multi-directional reconciliation.
-- Final product codes come from the management workbook; Supabase stores only temporary request IDs.

create extension if not exists pgcrypto;

alter table public.taphoa_sources
  add column if not exists management_sheet_id bigint,
  add column if not exists sync_status text not null default 'active',
  add column if not exists is_core boolean not null default false,
  add column if not exists last_sheet_seen_at timestamptz,
  add column if not exists deleted_at timestamptz;

alter table public.taphoa_products
  add column if not exists sync_status text not null default 'active',
  add column if not exists deleted_at timestamptz;

do $$ begin
  alter table public.taphoa_sources add constraint taphoa_sources_management_sheet_id_key unique (management_sheet_id);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.taphoa_sources add constraint taphoa_sources_sync_status_check
    check (sync_status in ('pending_create','active','pending_delete','deleted','error'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.taphoa_products add constraint taphoa_products_sync_status_check
    check (sync_status in ('active','pending_delete','deleted','error'));
exception when duplicate_object then null; end $$;

update public.taphoa_sources
set management_sheet_id = case source_key
  when 'hang-u' then 305224020
  when 'thuoc-la' then 583030487
  when 'sua' then 1822935945
  when 'masan' then 1608078911
  when 'hang-thuong' then 1330446015
end,
    is_core = true,
    active = true,
    sync_status = 'active',
    deleted_at = null,
    updated_at = now()
where source_key in ('hang-u','thuoc-la','sua','masan','hang-thuong');

create table if not exists public.taphoa_product_create_requests (
  request_id uuid primary key default gen_random_uuid(),
  client_code text not null,
  source_key text not null references public.taphoa_sources(source_key),
  product_name text not null check (btrim(product_name) <> ''),
  input_price_vnd bigint,
  sale_price_vnd bigint,
  status text not null default 'pending_sheet' check (status in ('pending_sheet','sheet_written','finalized','cancelled','error')),
  management_sheet_id bigint,
  sheet_row integer,
  sheet_marker text not null default '',
  payload_hash text not null default '',
  final_product_code text,
  last_error text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  finalized_at timestamptz,
  constraint taphoa_product_create_input_nonnegative check (input_price_vnd is null or input_price_vnd >= 0),
  constraint taphoa_product_create_sale_nonnegative check (sale_price_vnd is null or sale_price_vnd >= 0)
);

create unique index if not exists taphoa_product_create_pending_client_idx
  on public.taphoa_product_create_requests(upper(client_code))
  where status in ('pending_sheet','sheet_written');
create index if not exists taphoa_product_create_status_idx
  on public.taphoa_product_create_requests(status,created_at);

create table if not exists public.taphoa_source_sync_requests (
  request_id uuid primary key default gen_random_uuid(),
  source_key text not null references public.taphoa_sources(source_key),
  operation text not null check (operation in ('create','delete')),
  status text not null default 'pending' check (status in ('pending','applied','cancelled','error')),
  management_sheet_id bigint,
  requested_name text not null default '',
  last_error text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  applied_at timestamptz
);

create unique index if not exists taphoa_source_sync_pending_idx
  on public.taphoa_source_sync_requests(source_key,operation)
  where status='pending';

revoke all on table public.taphoa_product_create_requests from anon, authenticated;
revoke all on table public.taphoa_source_sync_requests from anon, authenticated;
grant all on table public.taphoa_product_create_requests to service_role;
grant all on table public.taphoa_source_sync_requests to service_role;

-- Existing custom DB-only sources become pending Sheet creates so the workbook becomes authoritative.
update public.taphoa_sources
set active=false,
    sync_status='pending_create',
    updated_at=now()
where management_sheet_id is null
  and not is_core
  and sync_status='active';

insert into public.taphoa_source_sync_requests(source_key,operation,status,requested_name)
select s.source_key,'create','pending',s.name
from public.taphoa_sources s
where s.management_sheet_id is null
  and not s.is_core
  and s.sync_status='pending_create'
  and not exists (
    select 1 from public.taphoa_source_sync_requests r
    where r.source_key=s.source_key and r.operation='create' and r.status='pending'
  );

-- Retire final codes previously invented by Supabase during the temporary Web<->DB-only test.
update public.taphoa_products
set is_active=false,
    sync_status='deleted',
    deleted_at=coalesce(deleted_at,now()),
    stock_status='no_price',
    stock_label='Ngừng dùng',
    updated_at=now()
where sheet_updated_at is null
  and jsonb_typeof(raw_row)='object'
  and raw_row->>'origin'='web';

-- Outbox now carries both canonical updates and delete tombstones.
do $$ begin
  alter table public.taphoa_product_outbox drop constraint if exists taphoa_product_outbox_operation_check;
  alter table public.taphoa_product_outbox add constraint taphoa_product_outbox_operation_check check (operation in ('upsert','delete'));
end $$;

create or replace function public.taphoa_create_source_from_web(p_name text)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  ctx jsonb := public.taphoa_access_context();
  v_name text := btrim(coalesce(p_name,''));
  v_existing public.taphoa_sources;
  v_id uuid := gen_random_uuid();
  v_key text;
  v_sort integer;
begin
  if not coalesce((ctx->>'allowed')::boolean,false) or ctx->>'taphoa_role' <> 'admin' then
    raise exception 'taphoa_access_denied' using errcode='42501';
  end if;
  if v_name='' then raise exception 'source_name_required'; end if;

  select * into v_existing
  from public.taphoa_sources
  where lower(btrim(name))=lower(v_name)
    and sync_status <> 'deleted'
  order by case sync_status when 'active' then 0 when 'pending_create' then 1 else 2 end, sort_order
  limit 1;

  if found then
    return jsonb_build_object('ok',true,'created',false,'pending',v_existing.sync_status<>'active',
      'source_key',v_existing.source_key,'name',v_existing.name,'management_sheet_id',v_existing.management_sheet_id);
  end if;

  select coalesce(max(sort_order),0)+1 into v_sort from public.taphoa_sources;
  v_key := 'src-' || replace(v_id::text,'-','');

  insert into public.taphoa_sources(source_key,name,sort_order,active,sync_status,is_core,updated_at)
  values(v_key,v_name,v_sort,false,'pending_create',false,now());

  insert into public.taphoa_source_sync_requests(request_id,source_key,operation,status,requested_name)
  values(v_id,v_key,'create','pending',v_name);

  update public.taphoa_revisions set revision=revision+1,updated_at=now() where domain='products';
  return jsonb_build_object('ok',true,'created',true,'pending',true,'request_id',v_id,
    'source_key',v_key,'name',v_name);
end;
$$;

create or replace function public.taphoa_update_product_from_web(p_product jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  ctx jsonb := public.taphoa_access_context();
  current_row public.taphoa_products;
  pending_row public.taphoa_product_create_requests;
  v_requested_code text := upper(btrim(coalesce(p_product->>'product_code',p_product->>'maSP','')));
  v_name text;
  v_source_key text;
  v_input bigint;
  v_sale bigint;
  v_hash text;
  v_request_id uuid;
  v_changed boolean := false;
begin
  if not coalesce((ctx->>'allowed')::boolean,false) or ctx->>'taphoa_role' <> 'admin' then
    raise exception 'taphoa_access_denied' using errcode='42501';
  end if;
  if v_requested_code='' then raise exception 'product_code_required'; end if;

  -- Browser placeholders are temporary only. The Sheet will assign the final product code.
  if v_requested_code ~ '^SP[0-9]+$' or v_requested_code ~ '^TMP-[0-9A-F-]+$' then
    if v_requested_code ~ '^TMP-[0-9A-F-]+$' then
      begin v_request_id := substring(v_requested_code from 5)::uuid;
      exception when others then raise exception 'pending_product_not_found' using errcode='P0002'; end;
      select * into pending_row from public.taphoa_product_create_requests where request_id=v_request_id for update;
    else
      select * into pending_row
      from public.taphoa_product_create_requests
      where upper(client_code)=v_requested_code and status in ('pending_sheet','sheet_written')
      order by created_at desc limit 1 for update;
    end if;

    v_name := btrim(coalesce(p_product->>'name',case when found then pending_row.product_name else '' end));
    if v_name='' then raise exception 'product_name_required'; end if;
    v_source_key := btrim(coalesce(p_product->>'source_key',case when found then pending_row.source_key else '' end));
    if not exists(select 1 from public.taphoa_sources where source_key=v_source_key and sync_status in ('active','pending_create')) then
      raise exception 'source_not_found' using errcode='P0002';
    end if;
    v_input := case when p_product ? 'cost' then case when nullif(btrim(coalesce(p_product->>'cost','')),'') is null then null else round((p_product->>'cost')::numeric*1000)::bigint end else case when found then pending_row.input_price_vnd else null end end;
    v_sale := case when p_product ? 'price' then case when nullif(btrim(coalesce(p_product->>'price','')),'') is null then null else round((p_product->>'price')::numeric*1000)::bigint end else case when found then pending_row.sale_price_vnd else null end end;
    if v_input is not null and v_input<0 then raise exception 'invalid_cost'; end if;
    if v_sale is not null and v_sale<0 then raise exception 'invalid_price'; end if;

    if found then
      update public.taphoa_product_create_requests
      set product_name=v_name,source_key=v_source_key,input_price_vnd=v_input,sale_price_vnd=v_sale,
          status=case when status='error' then 'pending_sheet' else status end,last_error='',updated_at=now()
      where request_id=pending_row.request_id returning * into pending_row;
    else
      insert into public.taphoa_product_create_requests(client_code,source_key,product_name,input_price_vnd,sale_price_vnd)
      values(v_requested_code,v_source_key,v_name,v_input,v_sale) returning * into pending_row;
    end if;

    update public.taphoa_revisions set revision=revision+1,updated_at=now() where domain='products';
    return jsonb_build_object('ok',true,'created',true,'pending',true,'request_id',pending_row.request_id,
      'product_code','TMP-'||pending_row.request_id::text,'source_key',pending_row.source_key);
  end if;

  select * into current_row from public.taphoa_products where product_code=v_requested_code for update;
  if not found then raise exception 'product_not_found' using errcode='P0002'; end if;
  if current_row.sync_status='pending_delete' then raise exception 'product_pending_delete'; end if;

  v_name := case when p_product ? 'name' then btrim(coalesce(p_product->>'name','')) else current_row.product_name end;
  if v_name='' then raise exception 'product_name_required'; end if;
  v_source_key := case when p_product ? 'source_key' then btrim(coalesce(p_product->>'source_key','')) else current_row.source_key end;
  if not exists(select 1 from public.taphoa_sources where source_key=v_source_key and sync_status in ('active','pending_create')) then
    raise exception 'source_not_found' using errcode='P0002';
  end if;
  v_input := case when p_product ? 'cost' then case when nullif(btrim(coalesce(p_product->>'cost','')),'') is null then null else round((p_product->>'cost')::numeric*1000)::bigint end else current_row.input_price_vnd end;
  v_sale := case when p_product ? 'price' then case when nullif(btrim(coalesce(p_product->>'price','')),'') is null then null else round((p_product->>'price')::numeric*1000)::bigint end else current_row.sale_price_vnd end;
  if v_input is not null and v_input<0 then raise exception 'invalid_cost'; end if;
  if v_sale is not null and v_sale<0 then raise exception 'invalid_price'; end if;

  v_changed := current_row.product_name is distinct from v_name
    or current_row.source_key is distinct from v_source_key
    or current_row.input_price_vnd is distinct from v_input
    or current_row.sale_price_vnd is distinct from v_sale
    or current_row.is_active is distinct from true;
  if not v_changed then return jsonb_build_object('ok',true,'created',false,'changed',false,'product_code',v_requested_code); end if;

  update public.taphoa_products
  set product_name=v_name,source_key=v_source_key,input_price_vnd=v_input,sale_price_vnd=v_sale,carton_price_vnd=v_sale,
      retail_price_vnd=null,applied_profit_vnd=case when v_input is not null and v_sale is not null then greatest(v_sale-v_input,0) else 0 end,
      stock_status=case when v_sale is null or v_sale<=0 then 'no_price' else 'available' end,
      stock_label=case when v_sale is null or v_sale<=0 then 'Chưa có giá' else '' end,
      is_active=true,sync_status='active',deleted_at=null,updated_at=now()
  where product_code=v_requested_code;

  v_hash := public.taphoa_product_row_hash(v_requested_code,v_name,v_input,v_sale);
  update public.taphoa_product_outbox set status='superseded',updated_at=now() where product_code=v_requested_code and status='pending';
  insert into public.taphoa_product_outbox(product_code,source_key,operation,payload,row_hash)
  values(v_requested_code,v_source_key,'upsert',jsonb_build_object('product_code',v_requested_code,'product_name',v_name,
    'input_price_vnd',v_input,'sale_price_vnd',v_sale,'source_row',current_row.source_row,'old_source_key',current_row.source_key),v_hash);
  update public.taphoa_revisions set revision=revision+1,updated_at=now() where domain='products';
  return jsonb_build_object('ok',true,'created',false,'changed',true,'product_code',v_requested_code,'row_hash',v_hash);
end;
$$;

create or replace function public.taphoa_delete_product_from_web(p_product_code text)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  ctx jsonb := public.taphoa_access_context();
  v_code text := upper(btrim(coalesce(p_product_code,'')));
  current_row public.taphoa_products;
  v_request uuid;
begin
  if not coalesce((ctx->>'allowed')::boolean,false) or ctx->>'taphoa_role' <> 'admin' then raise exception 'taphoa_access_denied' using errcode='42501'; end if;
  if v_code='' then raise exception 'product_code_required'; end if;

  if v_code ~ '^TMP-[0-9A-F-]+$' then
    begin v_request := substring(v_code from 5)::uuid; exception when others then raise exception 'pending_product_not_found' using errcode='P0002'; end;
    update public.taphoa_product_create_requests set status='cancelled',updated_at=now() where request_id=v_request and status in ('pending_sheet','sheet_written');
    update public.taphoa_revisions set revision=revision+1,updated_at=now() where domain='products';
    return jsonb_build_object('ok',true,'deleted',true,'pending',true,'product_code',v_code);
  end if;

  select * into current_row from public.taphoa_products where product_code=v_code for update;
  if not found then raise exception 'product_not_found' using errcode='P0002'; end if;
  if current_row.sync_status in ('pending_delete','deleted') then return jsonb_build_object('ok',true,'deleted',false,'product_code',v_code); end if;

  update public.taphoa_products
  set is_active=false,sync_status='pending_delete',deleted_at=now(),stock_status='no_price',stock_label='Ngừng dùng',updated_at=now()
  where product_code=v_code;
  update public.taphoa_product_outbox set status='superseded',updated_at=now() where product_code=v_code and status='pending';
  insert into public.taphoa_product_outbox(product_code,source_key,operation,payload,row_hash)
  values(v_code,current_row.source_key,'delete',jsonb_build_object('product_code',v_code,'source_key',current_row.source_key),'');
  update public.taphoa_revisions set revision=revision+1,updated_at=now() where domain='products';
  return jsonb_build_object('ok',true,'deleted',true,'pending',true,'product_code',v_code);
end;
$$;

create or replace function public.taphoa_delete_source_from_web(p_source text)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  ctx jsonb := public.taphoa_access_context();
  v_source text := btrim(coalesce(p_source,''));
  current_source public.taphoa_sources;
begin
  if not coalesce((ctx->>'allowed')::boolean,false) or ctx->>'taphoa_role' <> 'admin' then raise exception 'taphoa_access_denied' using errcode='42501'; end if;
  if v_source='' then raise exception 'source_required'; end if;
  select * into current_source from public.taphoa_sources
  where sync_status<>'deleted' and (source_key=v_source or lower(btrim(name))=lower(v_source))
  order by case when source_key=v_source then 0 else 1 end,sort_order limit 1 for update;
  if not found then raise exception 'source_not_found' using errcode='P0002'; end if;
  if current_source.is_core then raise exception 'core_source_cannot_be_deleted' using errcode='42501'; end if;
  if exists(select 1 from public.taphoa_products where source_key=current_source.source_key and is_active)
     or exists(select 1 from public.taphoa_product_create_requests where source_key=current_source.source_key and status in ('pending_sheet','sheet_written')) then
    raise exception 'source_has_active_products' using errcode='23503';
  end if;

  if current_source.management_sheet_id is null then
    update public.taphoa_source_sync_requests set status='cancelled',updated_at=now() where source_key=current_source.source_key and status='pending';
    update public.taphoa_sources set active=false,sync_status='deleted',deleted_at=now(),updated_at=now() where source_key=current_source.source_key;
  else
    update public.taphoa_sources set active=false,sync_status='pending_delete',deleted_at=now(),updated_at=now() where source_key=current_source.source_key;
    insert into public.taphoa_source_sync_requests(source_key,operation,status,management_sheet_id,requested_name)
    values(current_source.source_key,'delete','pending',current_source.management_sheet_id,current_source.name)
    on conflict (source_key,operation) where status='pending' do nothing;
  end if;
  update public.taphoa_revisions set revision=revision+1,updated_at=now() where domain='products';
  return jsonb_build_object('ok',true,'deleted',true,'pending',current_source.management_sheet_id is not null,
    'source_key',current_source.source_key,'name',current_source.name);
end;
$$;

create or replace function public.taphoa_finalize_source_sheet(p_source_key text,p_sheet_id bigint,p_name text,p_sort_order integer)
returns void language plpgsql security definer set search_path=public as $$
begin
  update public.taphoa_sources set management_sheet_id=p_sheet_id,name=btrim(p_name),sort_order=coalesce(p_sort_order,sort_order),
    active=true,sync_status='active',deleted_at=null,last_sheet_seen_at=now(),updated_at=now() where source_key=p_source_key;
  update public.taphoa_source_sync_requests set status='applied',management_sheet_id=p_sheet_id,applied_at=now(),updated_at=now(),last_error=''
    where source_key=p_source_key and operation='create' and status='pending';
  update public.taphoa_revisions set revision=revision+1,updated_at=now() where domain='products';
end; $$;

create or replace function public.taphoa_mark_source_deleted(p_source_key text)
returns void language plpgsql security definer set search_path=public as $$
begin
  update public.taphoa_sources set active=false,sync_status='deleted',deleted_at=coalesce(deleted_at,now()),updated_at=now() where source_key=p_source_key;
  update public.taphoa_source_sync_requests set status='applied',applied_at=now(),updated_at=now(),last_error=''
    where source_key=p_source_key and operation='delete' and status='pending';
  update public.taphoa_revisions set revision=revision+1,updated_at=now() where domain='products';
end; $$;

create or replace function public.taphoa_finalize_product_create(
  p_request_id uuid,p_product_code text,p_sheet_id bigint,p_sheet_row integer,p_modified_time timestamptz,p_hash text
) returns jsonb language plpgsql security definer set search_path=public as $$
declare r public.taphoa_product_create_requests; v_code text:=upper(btrim(p_product_code));
begin
  select * into r from public.taphoa_product_create_requests where request_id=p_request_id for update;
  if not found then raise exception 'pending_product_not_found' using errcode='P0002'; end if;
  if r.status='finalized' then return jsonb_build_object('ok',true,'product_code',r.final_product_code,'already_finalized',true); end if;
  if r.status='cancelled' then raise exception 'pending_product_cancelled'; end if;
  if v_code='' or v_code like 'TMP-%' then raise exception 'final_product_code_required'; end if;
  if exists(select 1 from public.taphoa_products where product_code=v_code) then
    if not exists(select 1 from public.taphoa_products where product_code=v_code and raw_row->>'request_id'=p_request_id::text) then
      raise exception 'final_product_code_conflict' using errcode='23505';
    end if;
  else
    insert into public.taphoa_products(product_code,source_key,source_row,product_name,input_price_vnd,input_price_basis,expected_profit_percent,
      applied_profit_vnd,sale_price_vnd,carton_price_vnd,retail_price_vnd,units_per_carton,retail_unit,stock_status,stock_label,is_active,raw_row,sheet_updated_at,sync_status,updated_at)
    values(v_code,r.source_key,p_sheet_row,r.product_name,r.input_price_vnd,'carton',null,
      case when r.input_price_vnd is not null and r.sale_price_vnd is not null then greatest(r.sale_price_vnd-r.input_price_vnd,0) else 0 end,
      r.sale_price_vnd,r.sale_price_vnd,null,null,'',case when r.sale_price_vnd is null or r.sale_price_vnd<=0 then 'no_price' else 'available' end,
      case when r.sale_price_vnd is null or r.sale_price_vnd<=0 then 'Chưa có giá' else '' end,true,
      jsonb_build_object('origin','web','request_id',p_request_id::text,'client_code',r.client_code),p_modified_time,'active',now());
  end if;
  update public.taphoa_product_create_requests set status='finalized',management_sheet_id=p_sheet_id,sheet_row=p_sheet_row,payload_hash=p_hash,
    final_product_code=v_code,finalized_at=now(),updated_at=now(),last_error='' where request_id=p_request_id;
  insert into public.taphoa_product_sheet_state(product_code,source_key,sheet_row,sheet_hash,last_pushed_hash,last_sheet_modified_time,updated_at)
  values(v_code,r.source_key,p_sheet_row,p_hash,p_hash,p_modified_time,now())
  on conflict(product_code) do update set source_key=excluded.source_key,sheet_row=excluded.sheet_row,sheet_hash=excluded.sheet_hash,
    last_pushed_hash=excluded.last_pushed_hash,last_sheet_modified_time=excluded.last_sheet_modified_time,updated_at=now();
  update public.taphoa_revisions set revision=revision+1,updated_at=now() where domain='products';
  return jsonb_build_object('ok',true,'product_code',v_code,'request_id',p_request_id);
end; $$;

create or replace function public.taphoa_mark_product_delete_acked(p_product_code text,p_modified_time timestamptz)
returns void language plpgsql security definer set search_path=public as $$
begin
  update public.taphoa_products set is_active=false,sync_status='deleted',deleted_at=coalesce(deleted_at,now()),sheet_updated_at=p_modified_time,updated_at=now()
  where product_code=upper(btrim(p_product_code));
  delete from public.taphoa_product_sheet_state where product_code=upper(btrim(p_product_code));
  update public.taphoa_revisions set revision=revision+1,updated_at=now() where domain='products';
end; $$;

-- Sheet inbound delta remains authoritative, but a web tombstone cannot be resurrected while pending deletion.
create or replace function public.taphoa_apply_product_delta(
  p_products jsonb,p_source_codes jsonb,p_modified_time timestamptz,p_total_rows integer
) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_upserted integer:=0; v_deactivated integer:=0; v_revision bigint:=0;
begin
  if jsonb_typeof(p_products)<>'array' then raise exception 'taphoa_products_delta_invalid'; end if;
  if jsonb_typeof(p_source_codes)<>'array' then raise exception 'taphoa_source_codes_invalid'; end if;
  if jsonb_array_length(p_products)>0 then
    insert into public.taphoa_products(product_code,source_key,source_row,product_name,input_price_vnd,input_price_basis,expected_profit_percent,
      applied_profit_vnd,sale_price_vnd,carton_price_vnd,retail_price_vnd,units_per_carton,retail_unit,stock_status,stock_label,is_active,raw_row,sheet_updated_at,sync_status,deleted_at,updated_at)
    select x.product_code,x.source_key,x.source_row,x.product_name,x.input_price_vnd,x.input_price_basis,x.expected_profit_percent,coalesce(x.applied_profit_vnd,0),
      x.sale_price_vnd,x.carton_price_vnd,x.retail_price_vnd,x.units_per_carton,coalesce(x.retail_unit,''),x.stock_status,coalesce(x.stock_label,''),true,
      coalesce(x.raw_row,'[]'::jsonb),coalesce(x.sheet_updated_at,p_modified_time),'active',null,now()
    from jsonb_to_recordset(p_products) as x(product_code text,source_key text,source_row integer,product_name text,input_price_vnd bigint,
      input_price_basis text,expected_profit_percent numeric,applied_profit_vnd bigint,sale_price_vnd bigint,carton_price_vnd bigint,retail_price_vnd bigint,
      units_per_carton numeric,retail_unit text,stock_status text,stock_label text,is_active boolean,raw_row jsonb,sheet_updated_at timestamptz)
    on conflict(product_code) do update set source_key=excluded.source_key,source_row=excluded.source_row,product_name=excluded.product_name,
      input_price_vnd=excluded.input_price_vnd,input_price_basis=excluded.input_price_basis,expected_profit_percent=excluded.expected_profit_percent,
      applied_profit_vnd=excluded.applied_profit_vnd,sale_price_vnd=excluded.sale_price_vnd,carton_price_vnd=excluded.carton_price_vnd,
      retail_price_vnd=excluded.retail_price_vnd,units_per_carton=excluded.units_per_carton,retail_unit=excluded.retail_unit,
      stock_status=excluded.stock_status,stock_label=excluded.stock_label,is_active=true,raw_row=excluded.raw_row,sheet_updated_at=excluded.sheet_updated_at,
      sync_status='active',deleted_at=null,updated_at=now()
    where taphoa_products.sync_status <> 'pending_delete';
    get diagnostics v_upserted=row_count;
  end if;

  update public.taphoa_products p set is_active=false,sync_status='deleted',deleted_at=coalesce(p.deleted_at,now()),stock_status='no_price',stock_label='Ngừng dùng',
    sheet_updated_at=p_modified_time,updated_at=now()
  where p.sync_status<>'pending_delete' and p.is_active=true and exists(
    select 1 from jsonb_to_recordset(p_source_codes) as s(source_key text,codes jsonb)
    where s.source_key=p.source_key and not exists(select 1 from jsonb_array_elements_text(s.codes) c(code) where c.code=p.product_code)
  );
  get diagnostics v_deactivated=row_count;

  delete from public.taphoa_product_sheet_state st where exists(
    select 1 from jsonb_to_recordset(p_source_codes) as s(source_key text,codes jsonb)
    where s.source_key=st.source_key and not exists(select 1 from jsonb_array_elements_text(s.codes) c(code) where c.code=st.product_code)
  );

  if v_upserted+v_deactivated>0 then update public.taphoa_revisions set revision=revision+1,updated_at=now() where domain='products' returning revision into v_revision;
  else select revision into v_revision from public.taphoa_revisions where domain='products'; end if;
  update public.taphoa_sheet_sync_state set last_drive_modified_time=p_modified_time,last_success_at=now(),last_sync_status='success',last_error='',
    last_imported_row_count=greatest(coalesce(p_total_rows,0),0),updated_at=now() where id=1;
  return jsonb_build_object('upserted',v_upserted,'deactivated',v_deactivated,'revision',v_revision);
end; $$;

revoke all on function public.taphoa_create_source_from_web(text) from public,anon;
revoke all on function public.taphoa_update_product_from_web(jsonb) from public,anon;
revoke all on function public.taphoa_delete_product_from_web(text) from public,anon;
revoke all on function public.taphoa_delete_source_from_web(text) from public,anon;
grant execute on function public.taphoa_create_source_from_web(text) to authenticated;
grant execute on function public.taphoa_update_product_from_web(jsonb) to authenticated;
grant execute on function public.taphoa_delete_product_from_web(text) to authenticated;
grant execute on function public.taphoa_delete_source_from_web(text) to authenticated;

revoke all on function public.taphoa_finalize_source_sheet(text,bigint,text,integer) from public,anon,authenticated;
revoke all on function public.taphoa_mark_source_deleted(text) from public,anon,authenticated;
revoke all on function public.taphoa_finalize_product_create(uuid,text,bigint,integer,timestamptz,text) from public,anon,authenticated;
revoke all on function public.taphoa_mark_product_delete_acked(text,timestamptz) from public,anon,authenticated;
grant execute on function public.taphoa_finalize_source_sheet(text,bigint,text,integer) to service_role;
grant execute on function public.taphoa_mark_source_deleted(text) to service_role;
grant execute on function public.taphoa_finalize_product_create(uuid,text,bigint,integer,timestamptz,text) to service_role;
grant execute on function public.taphoa_mark_product_delete_acked(text,timestamptz) to service_role;
