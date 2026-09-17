-- Web <-> Supabase deletion for product editor.
-- Products and custom sources are deactivated to preserve immutable IDs/history.

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
begin
  if not coalesce((ctx->>'allowed')::boolean,false) or ctx->>'taphoa_role' <> 'admin' then
    raise exception 'taphoa_access_denied' using errcode='42501';
  end if;
  if v_code='' then raise exception 'product_code_required'; end if;

  select * into current_row
  from public.taphoa_products
  where product_code=v_code
  for update;

  if not found then raise exception 'product_not_found' using errcode='P0002'; end if;
  if not current_row.is_active then
    return jsonb_build_object('ok',true,'deleted',false,'product_code',v_code);
  end if;

  update public.taphoa_products
  set is_active=false,
      stock_status='no_price',
      stock_label='Ngừng dùng',
      updated_at=now()
  where product_code=v_code;

  update public.taphoa_product_outbox
  set status='superseded',updated_at=now()
  where product_code=v_code and status='pending';

  update public.taphoa_revisions
  set revision=revision+1,updated_at=now()
  where domain='products';

  return jsonb_build_object('ok',true,'deleted',true,'product_code',v_code);
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
  if not coalesce((ctx->>'allowed')::boolean,false) or ctx->>'taphoa_role' <> 'admin' then
    raise exception 'taphoa_access_denied' using errcode='42501';
  end if;
  if v_source='' then raise exception 'source_required'; end if;

  select * into current_source
  from public.taphoa_sources
  where active
    and (source_key=v_source or lower(btrim(name))=lower(v_source))
  order by case when source_key=v_source then 0 else 1 end, sort_order
  limit 1
  for update;

  if not found then raise exception 'source_not_found' using errcode='P0002'; end if;

  if current_source.source_key in ('hang-u','thuoc-la','sua','masan','hang-thuong') then
    raise exception 'core_source_cannot_be_deleted' using errcode='42501';
  end if;

  if exists(
    select 1 from public.taphoa_products
    where source_key=current_source.source_key and is_active
  ) then
    raise exception 'source_has_active_products' using errcode='23503';
  end if;

  update public.taphoa_sources
  set active=false,updated_at=now()
  where source_key=current_source.source_key;

  update public.taphoa_revisions
  set revision=revision+1,updated_at=now()
  where domain='products';

  return jsonb_build_object(
    'ok',true,
    'deleted',true,
    'source_key',current_source.source_key,
    'name',current_source.name
  );
end;
$$;

revoke all on function public.taphoa_delete_product_from_web(text) from public, anon;
revoke all on function public.taphoa_delete_source_from_web(text) from public, anon;
grant execute on function public.taphoa_delete_product_from_web(text) to authenticated;
grant execute on function public.taphoa_delete_source_from_web(text) to authenticated;
