begin;

create or replace function public.taphoa_stock_check_links_for_customer(p_customer_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public,auth
as $$
declare
  ctx jsonb := public.taphoa_access_context();
  v_admin uuid := nullif(ctx->>'account_id','')::uuid;
  v_employee public.taphoa_stock_check_links;
  v_owner public.taphoa_stock_check_links;
  v_public jsonb;
  v_slug text;
begin
  if not coalesce((ctx->>'allowed')::boolean,false)
     or coalesce(ctx->>'taphoa_role','') <> 'admin' then
    raise exception 'taphoa_access_denied' using errcode='42501';
  end if;

  if not exists(
    select 1 from public.v21_accounts a
    where a.id=p_customer_id and a.role='user' and a.contact_group='customer'
      and a.deleted_at is null and a.locked_at is null
  ) then
    raise exception 'customer_not_found';
  end if;

  insert into public.taphoa_stock_check_links(customer_account_id,link_role,created_by_account_id)
  values(p_customer_id,'employee',v_admin)
  on conflict(customer_account_id,link_role)
  do update set created_by_account_id=excluded.created_by_account_id,is_active=true,updated_at=now()
  returning * into v_employee;

  insert into public.taphoa_stock_check_links(customer_account_id,link_role,created_by_account_id)
  values(p_customer_id,'owner',v_admin)
  on conflict(customer_account_id,link_role)
  do update set created_by_account_id=excluded.created_by_account_id,is_active=true,updated_at=now()
  returning * into v_owner;

  v_public := public.v21_customer_public_link_info_get_or_create(p_customer_id);
  v_slug := nullif(v_public->>'public_slug','');

  return jsonb_build_object(
    'ok',true,
    'customer_id',p_customer_id,
    'employee_url','https://app.taphoa.xyz/kiemhang/?t='||v_employee.token::text,
    'owner_url',case when v_slug is null then null else
      'https://app.taphoa.xyz/kh/?kh='||v_slug||'&tab=hang'
    end
  );
end;
$$;

commit;
