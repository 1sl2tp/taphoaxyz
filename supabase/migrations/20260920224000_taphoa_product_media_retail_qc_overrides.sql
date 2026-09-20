-- Preserve the supermarket unit price exactly for non-carton selections.
-- Allow independent manual QC for both TAPHOA ("MÌNH") and supermarket ("HỌ") comparison.

alter table public.taphoa_product_media
  add column if not exists own_compare_units_per_carton numeric;

create or replace function public.taphoa_normalize_selected_market_price()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if coalesce(new.market_pack_kind,'') <> 'carton'
     and new.market_retail_price_vnd is not null
     and new.market_retail_price_vnd > 0 then
    new.market_selected_price_vnd := new.market_retail_price_vnd;
  end if;
  return new;
end;
$$;

drop trigger if exists taphoa_normalize_selected_market_price_trg on public.taphoa_product_media;
create trigger taphoa_normalize_selected_market_price_trg
before insert or update of market_pack_kind,market_retail_price_vnd,market_selected_price_vnd
on public.taphoa_product_media
for each row
execute function public.taphoa_normalize_selected_market_price();

update public.taphoa_product_media
set market_selected_price_vnd=market_retail_price_vnd
where coalesce(market_pack_kind,'') <> 'carton'
  and market_retail_price_vnd is not null
  and market_retail_price_vnd > 0
  and market_selected_price_vnd is distinct from market_retail_price_vnd;

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
      market_compare_units_per_carton=v_qc,
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
    'units_per_carton',v_qc,
    'retail_price',case
      when v_kind='carton' and v_selected is not null and coalesce(v_qc,0)>0
        then v_selected/v_qc
      when v_kind='retail' then v_selected
      else null
    end
  );
end;
$$;

create or replace function public.taphoa_set_product_media_own_qc(
  p_product_code text,
  p_units_per_carton numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_ctx jsonb;
  v_qc numeric := p_units_per_carton;
begin
  v_ctx := public.taphoa_access_context();
  if coalesce(v_ctx->>'taphoa_role','') <> 'admin' then
    raise exception 'taphoa_admin_required' using errcode='42501';
  end if;

  if v_qc is null or v_qc<=0 then
    raise exception 'taphoa_own_compare_qc_invalid' using errcode='22023';
  end if;

  update public.taphoa_product_media
  set own_compare_units_per_carton=v_qc,
      updated_at=now()
  where product_code=btrim(coalesce(p_product_code,''));

  if not found then
    raise exception 'taphoa_product_media_not_found' using errcode='P0002';
  end if;

  update public.taphoa_revisions
  set revision=revision+1,updated_at=now()
  where domain='products';

  return jsonb_build_object(
    'ok',true,
    'product_code',btrim(p_product_code),
    'units_per_carton',v_qc
  );
end;
$$;

create or replace function public.taphoa_products_frontend_json()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id',p.product_code,
      'maSP',p.product_code,
      'product_code',p.product_code,
      'ten',p.product_name,
      'product_name',p.product_name,
      'gia',coalesce(p.sale_price_vnd,0)::numeric / 1000.0,
      'von',case when p.input_price_vnd is null then null else p.input_price_vnd::numeric / 1000.0 end,
      'nhom',p.source_key,
      'product_group',p.source_key,
      'donVi',case when p.input_price_basis='retail' then coalesce(nullif(p.retail_unit,''),'lẻ') else 'thùng' end,
      'donViLe',p.retail_unit,
      'quyCach',p.units_per_carton,
      'quyDoiThung',p.units_per_carton,
      'giaLe',case when p.retail_price_vnd is null then null else p.retail_price_vnd::numeric / 1000.0 end,
      'imageUrl',coalesce(m.image_url,''),
      'image_url',coalesce(m.image_url,''),
      'imageSourceUrl',coalesce(m.image_source_url,''),
      'marketSource',coalesce(m.market_source,''),
      'marketProductName',coalesce(m.market_product_name,''),
      'marketPackKind',coalesce(m.market_pack_kind,''),
      'marketPackaging',coalesce(m.market_packaging,''),
      'marketCartonPriceVnd',m.market_carton_price_vnd,
      'marketRetailPriceVnd',m.market_retail_price_vnd,
      'marketUnitsPerCarton',m.market_units_per_carton,
      'marketPackLabel2',coalesce(m.market_pack_label2,''),
      'marketPackQty2',m.market_pack_qty2,
      'marketPackLabel3',coalesce(m.market_pack_label3,''),
      'marketPackQty3',m.market_pack_qty3,
      'marketSelectedPriceVnd',m.market_selected_price_vnd,
      'marketCompareKind',coalesce(m.market_compare_kind,''),
      'marketCompareUnitsPerCarton',m.market_compare_units_per_carton,
      'ownCompareUnitsPerCarton',m.own_compare_units_per_carton,
      'active',p.is_active,
      'stockStatus',p.stock_status,
      'stockLabel',p.stock_label
    ) order by s.sort_order,p.source_row,p.product_code
  ),'[]'::jsonb)
  from public.taphoa_products p
  join public.taphoa_sources s on s.source_key=p.source_key
  left join public.taphoa_product_media m on m.product_code=p.product_code
  where p.is_active and s.active;
$$;

revoke all on function public.taphoa_set_product_media_compare(text,text,numeric) from public, anon;
revoke all on function public.taphoa_set_product_media_own_qc(text,numeric) from public, anon;
grant execute on function public.taphoa_set_product_media_compare(text,text,numeric) to authenticated;
grant execute on function public.taphoa_set_product_media_own_qc(text,numeric) to authenticated;
