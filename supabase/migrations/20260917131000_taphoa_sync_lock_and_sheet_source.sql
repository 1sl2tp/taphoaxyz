-- Serialize multi-directional Sheet reconciliation and expose safe Sheet-owned identity helpers.

alter table public.taphoa_sheet_sync_state
  add column if not exists lock_token uuid,
  add column if not exists lock_until timestamptz;

create or replace function public.taphoa_acquire_sheet_sync_lock(p_token uuid,p_seconds integer default 120)
returns boolean
language plpgsql
security definer
set search_path=public
as $$
declare v_ok boolean:=false;
begin
  update public.taphoa_sheet_sync_state
  set lock_token=p_token,
      lock_until=now()+make_interval(secs=>greatest(15,least(coalesce(p_seconds,120),300))),
      updated_at=now()
  where id=1 and (lock_until is null or lock_until<now() or lock_token=p_token)
  returning true into v_ok;
  return coalesce(v_ok,false);
end;
$$;

create or replace function public.taphoa_release_sheet_sync_lock(p_token uuid)
returns void
language sql
security definer
set search_path=public
as $$
  update public.taphoa_sheet_sync_state
  set lock_token=null,lock_until=null,updated_at=now()
  where id=1 and lock_token=p_token;
$$;

create or replace function public.taphoa_resolve_product_code(p_code text)
returns text
language plpgsql
stable
security definer
set search_path=public,auth
as $$
declare
  ctx jsonb:=public.taphoa_access_context();
  v_code text:=upper(btrim(coalesce(p_code,'')));
  v_request uuid;
  v_final text;
begin
  if not coalesce((ctx->>'allowed')::boolean,false) then
    raise exception 'taphoa_access_denied' using errcode='42501';
  end if;
  if v_code !~ '^TMP-[0-9A-F-]+$' then return v_code; end if;
  begin v_request:=substring(v_code from 5)::uuid;
  exception when others then return v_code; end;
  select final_product_code into v_final
  from public.taphoa_product_create_requests
  where request_id=v_request and status='finalized';
  return coalesce(nullif(v_final,''),v_code);
end;
$$;

create or replace function public.taphoa_upsert_sheet_source(
  p_sheet_id bigint,p_name text,p_sort_order integer
) returns text
language plpgsql
security definer
set search_path=public
as $$
declare
  v_key text;
  v_old_name text;
  v_old_sort integer;
  v_changed boolean:=false;
begin
  select source_key,name,sort_order into v_key,v_old_name,v_old_sort
  from public.taphoa_sources
  where management_sheet_id=p_sheet_id
  limit 1 for update;

  if found then
    v_changed := v_old_name is distinct from btrim(p_name)
      or v_old_sort is distinct from coalesce(p_sort_order,v_old_sort);
    update public.taphoa_sources
    set name=btrim(p_name),sort_order=coalesce(p_sort_order,sort_order),active=true,
        sync_status='active',deleted_at=null,last_sheet_seen_at=now(),updated_at=now()
    where source_key=v_key;
  else
    v_key:='sheet-'||p_sheet_id::text;
    insert into public.taphoa_sources(source_key,name,sort_order,active,management_sheet_id,sync_status,is_core,last_sheet_seen_at,updated_at)
    values(v_key,btrim(p_name),coalesce(p_sort_order,999),true,p_sheet_id,'active',false,now(),now());
    v_changed:=true;
  end if;

  if v_changed then
    update public.taphoa_revisions set revision=revision+1,updated_at=now() where domain='products';
  end if;
  return v_key;
end;
$$;

revoke all on function public.taphoa_acquire_sheet_sync_lock(uuid,integer) from public,anon,authenticated;
revoke all on function public.taphoa_release_sheet_sync_lock(uuid) from public,anon,authenticated;
revoke all on function public.taphoa_upsert_sheet_source(bigint,text,integer) from public,anon,authenticated;
grant execute on function public.taphoa_acquire_sheet_sync_lock(uuid,integer) to service_role;
grant execute on function public.taphoa_release_sheet_sync_lock(uuid) to service_role;
grant execute on function public.taphoa_upsert_sheet_source(bigint,text,integer) to service_role;

revoke all on function public.taphoa_resolve_product_code(text) from public,anon;
grant execute on function public.taphoa_resolve_product_code(text) to authenticated;
