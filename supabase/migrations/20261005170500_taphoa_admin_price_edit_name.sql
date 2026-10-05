-- Allow the admin price page to edit product names together with cost/sale price.
-- Supabase remains the only runtime source of truth; no Google Sheet outbox is written.

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
  v_input numeric;
  v_sale numeric;
  v_changed boolean := false;
begin
  if not coalesce((ctx->>'allowed')::boolean,false) or ctx->>'taphoa_role' <> 'admin' then
    raise exception 'taphoa_access_denied' using errcode='42501';
  end if;

  if v_code='' then
    raise exception 'product_code_required';
  end if;

  select * into current_row
  from public.taphoa_products
  where product_code=v_code
  for update;

  if not found then
    raise exception 'product_not_found' using errcode='P0002';
  end if;

  v_name := case
    when p_product ? 'name' then btrim(coalesce(p_product->>'name',''))
    else current_row.product_name
  end;
  if v_name='' then raise exception 'product_name_required'; end if;

  v_input := case
    when p_product ? 'cost'
      then case when nullif(btrim(coalesce(p_product->>'cost','')),'') is null
        then null else (p_product->>'cost')::numeric end
    else current_row.input_price_vnd
  end;

  v_sale := case
    when p_product ? 'price'
      then case when nullif(btrim(coalesce(p_product->>'price','')),'') is null
        then null else (p_product->>'price')::numeric end
    else current_row.sale_price_vnd
  end;

  if v_input is not null and v_input < 0 then raise exception 'invalid_cost'; end if;
  if v_sale is not null and v_sale < 0 then raise exception 'invalid_price'; end if;

  v_changed := current_row.product_name is distinct from v_name
    or current_row.input_price_vnd is distinct from v_input
    or current_row.sale_price_vnd is distinct from v_sale;

  if not v_changed then
    return jsonb_build_object(
      'ok',true,
      'changed',false,
      'product_code',v_code,
      'name',current_row.product_name,
      'cost',current_row.input_price_vnd,
      'price',current_row.sale_price_vnd
    );
  end if;

  update public.taphoa_products
  set product_name=v_name,
      input_price_vnd=v_input,
      sale_price_vnd=v_sale,
      carton_price_vnd=v_sale,
      applied_profit_vnd=case
        when v_input is not null and v_sale is not null then greatest(v_sale-v_input,0)
        else 0
      end,
      stock_status=case when v_sale is null or v_sale<=0 then 'no_price' else 'available' end,
      stock_label=case when v_sale is null or v_sale<=0 then 'Chưa có giá' else '' end,
      is_active=true,
      sync_status='active',
      deleted_at=null,
      updated_at=now()
  where product_code=v_code;

  update public.taphoa_revisions
  set revision=revision+1,updated_at=now()
  where domain='products';

  return jsonb_build_object(
    'ok',true,
    'changed',true,
    'product_code',v_code,
    'name',v_name,
    'cost',v_input,
    'price',v_sale
  );
end;
$$;

revoke all on function public.taphoa_update_product_from_web(jsonb) from public, anon;
grant execute on function public.taphoa_update_product_from_web(jsonb) to authenticated;
