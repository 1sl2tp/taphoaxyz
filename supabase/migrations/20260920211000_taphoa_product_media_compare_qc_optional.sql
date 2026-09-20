-- Allow carton compare mode to be selected before the admin fills a trustworthy QC.
create or replace function public.taphoa_set_product_media_compare(
  p_product_code text,
  p_kind text,
  p_units_per_carton numeric default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_ctx jsonb;
  v_kind text := lower(btrim(coalesce(p_kind,'')));
  v_qc numeric := p_units_per_carton;
  v_selected numeric;
begin
  v_ctx := public.taphoa_access_context();
  if coalesce(v_ctx->>'taphoa_role','') <> 'admin' then
    raise exception 'taphoa_admin_required' using errcode='42501';
  end if;

  if v_kind not in ('carton','retail') then
    raise exception 'taphoa_market_compare_kind_invalid' using errcode='22023';
  end if;

  if v_qc is not null and v_qc<=0 then
    raise exception 'taphoa_market_compare_qc_invalid' using errcode='22023';
  end if;

  select market_selected_price_vnd
    into v_selected
  from public.taphoa_product_media
  where product_code=btrim(coalesce(p_product_code,''))
    and image_url<>''
  limit 1;

  if not found then
    raise exception 'taphoa_product_media_not_found' using errcode='P0002';
  end if;

  update public.taphoa_product_media
  set market_compare_kind=v_kind,
      market_compare_units_per_carton=case when v_kind='carton' then v_qc else null end,
      updated_at=now()
  where product_code=btrim(coalesce(p_product_code,''));

  update public.taphoa_revisions
  set revision=revision+1,updated_at=now()
  where domain='products';

  return jsonb_build_object(
    'ok',true,
    'product_code',btrim(p_product_code),
    'kind',v_kind,
    'selected_price',v_selected,
    'units_per_carton',case when v_kind='carton' then v_qc else null end,
    'retail_price',case
      when v_kind='carton' and v_selected is not null and coalesce(v_qc,0)>0
        then v_selected/v_qc
      when v_kind='retail' then v_selected
      else null
    end
  );
end;
$$;

revoke all on function public.taphoa_set_product_media_compare(text,text,numeric) from public, anon;
grant execute on function public.taphoa_set_product_media_compare(text,text,numeric) to authenticated;
