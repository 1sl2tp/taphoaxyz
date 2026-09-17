-- Create one product source from the web editor.
-- Scope: Web <-> Supabase only. Sheet/tab creation is intentionally not part of this migration.

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
  v_base text;
  v_key text;
  v_suffix integer := 1;
  v_sort integer;
begin
  if not coalesce((ctx->>'allowed')::boolean,false) or ctx->>'taphoa_role' <> 'admin' then
    raise exception 'taphoa_access_denied' using errcode='42501';
  end if;

  if v_name = '' then
    raise exception 'source_name_required';
  end if;

  select * into v_existing
  from public.taphoa_sources
  where lower(btrim(name)) = lower(v_name)
  order by active desc, sort_order asc
  limit 1;

  if found then
    if not v_existing.active then
      update public.taphoa_sources
      set active=true, updated_at=now()
      where source_key=v_existing.source_key;

      update public.taphoa_revisions
      set revision=revision+1, updated_at=now()
      where domain='products';
    end if;

    return jsonb_build_object(
      'ok',true,
      'created',false,
      'source_key',v_existing.source_key,
      'name',v_existing.name
    );
  end if;

  v_base := trim(both '-' from regexp_replace(
    lower(extensions.unaccent(v_name)),
    '[^a-z0-9]+',
    '-',
    'g'
  ));
  if v_base = '' then v_base := 'nguon'; end if;

  v_key := v_base;
  while exists(select 1 from public.taphoa_sources where source_key=v_key) loop
    v_suffix := v_suffix + 1;
    v_key := v_base || '-' || v_suffix::text;
  end loop;

  select coalesce(max(sort_order),0)+1 into v_sort
  from public.taphoa_sources;

  insert into public.taphoa_sources(source_key,name,sort_order,active,updated_at)
  values(v_key,v_name,v_sort,true,now());

  update public.taphoa_revisions
  set revision=revision+1, updated_at=now()
  where domain='products';

  return jsonb_build_object(
    'ok',true,
    'created',true,
    'source_key',v_key,
    'name',v_name
  );
end;
$$;

revoke all on function public.taphoa_create_source_from_web(text) from public, anon;
grant execute on function public.taphoa_create_source_from_web(text) to authenticated;
