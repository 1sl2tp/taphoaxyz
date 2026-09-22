begin;

create or replace function public.taphoa_shared_cart_save_for_customer(
  p_customer_id uuid,
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.taphoa_stock_check_sessions;
  v_now timestamptz := now();
  v_item jsonb;
  v_code text;
  v_qty numeric;
begin
  if jsonb_typeof(coalesce(p_items,'[]'::jsonb)) <> 'array' then
    raise exception 'stock_check_items_invalid';
  end if;

  select *
  into v_session
  from public.taphoa_stock_check_sessions s
  where s.customer_account_id=p_customer_id
    and s.status in ('open','employee_submitted')
  order by s.updated_at desc,s.created_at desc
  limit 1
  for update;

  if v_session.id is null then
    insert into public.taphoa_stock_check_sessions(
      customer_account_id,created_by_account_id,status
    )
    select p_customer_id,a.id,'open'
    from public.v21_accounts a
    where a.role='admin' and a.deleted_at is null and a.locked_at is null
    order by a.created_at,a.id
    limit 1
    returning * into v_session;
  end if;

  update public.taphoa_stock_check_items
  set employee_qty=0,employee_updated_at=v_now
  where session_id=v_session.id;

  for v_item in
    select * from jsonb_array_elements(coalesce(p_items,'[]'::jsonb))
  loop
    v_code := btrim(coalesce(v_item->>'product_code',''));
    v_qty := greatest(0,coalesce(nullif(v_item->>'qty','')::numeric,0));

    if v_code='' or not exists(
      select 1
      from public.taphoa_products p
      where p.product_code=v_code
        and p.is_active=true
        and p.deleted_at is null
    ) then
      continue;
    end if;

    insert into public.taphoa_stock_check_items(
      session_id,product_code,employee_qty,employee_updated_at
    )
    values(v_session.id,v_code,v_qty,v_now)
    on conflict(session_id,product_code)
    do update set
      employee_qty=excluded.employee_qty,
      employee_updated_at=excluded.employee_updated_at;
  end loop;

  update public.taphoa_stock_check_sessions
  set status='open',
      employee_submitted_at=null,
      updated_at=v_now
  where id=v_session.id
  returning * into v_session;

  return jsonb_build_object(
    'ok',true,
    'session_id',v_session.id,
    'status',v_session.status,
    'updated_at',v_session.updated_at
  );
end;
$$;

create or replace function public.taphoa_public_shared_cart_save_access(
  p_public_slug text,
  p_pin text,
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer uuid;
begin
  v_customer := public.taphoa_public_customer_id_for_access(p_public_slug,p_pin);
  return public.taphoa_shared_cart_save_for_customer(v_customer,p_items);
end;
$$;

create or replace function public.taphoa_stock_check_submit(
  p_token uuid,
  p_items jsonb,
  p_action text default 'save'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_link public.taphoa_stock_check_links;
  v_result jsonb;
begin
  select *
  into v_link
  from public.taphoa_stock_check_links
  where token=p_token and is_active=true;

  if not found then
    raise exception 'stock_check_link_invalid' using errcode='22023';
  end if;

  v_result := public.taphoa_shared_cart_save_for_customer(
    v_link.customer_account_id,
    p_items
  );

  return v_result || jsonb_build_object('role',v_link.link_role);
end;
$$;

revoke all on function public.taphoa_shared_cart_save_for_customer(uuid,jsonb)
  from public,anon,authenticated;
revoke all on function public.taphoa_public_shared_cart_save_access(text,text,jsonb)
  from public,anon,authenticated;
grant execute on function public.taphoa_public_shared_cart_save_access(text,text,jsonb)
  to anon,authenticated;

commit;
