begin;

alter table public.v21_customer_public_links
  add column if not exists pin_hash bytea,
  add column if not exists pin_set_at timestamptz;

create or replace function public.taphoa_public_gate_state(p_public_slug text)
returns jsonb
language plpgsql
security definer
set search_path = public,auth
as $$
declare
  v_link public.v21_customer_public_links;
  v_account public.v21_accounts;
  v_bypass boolean := false;
begin
  select *
  into v_link
  from public.v21_customer_public_links l
  where l.public_slug=lower(btrim(coalesce(p_public_slug,'')))
    and l.revoked_at is null
  limit 1;

  if not found then
    return jsonb_build_object('ok',false,'error','not_found');
  end if;

  if auth.uid() is not null then
    select *
    into v_account
    from public.v21_accounts a
    where a.auth_user_id=auth.uid()
      and a.deleted_at is null
      and a.locked_at is null
    limit 1;

    if found then
      v_bypass := v_account.role='admin'
        or (
          v_account.role='user'
          and v_account.contact_group='customer'
          and v_account.id=v_link.customer_account_id
        );
    end if;
  end if;

  return jsonb_build_object(
    'ok',true,
    'pin_configured',v_link.pin_hash is not null,
    'authenticated_bypass',v_bypass
  );
end;
$$;

create or replace function public.taphoa_public_pin_create(
  p_public_slug text,
  p_pin text
)
returns jsonb
language plpgsql
security definer
set search_path = public,extensions
as $$
declare
  v_link public.v21_customer_public_links;
  v_pin text := btrim(coalesce(p_pin,''));
begin
  if v_pin !~ '^[0-9]{6}$' then
    return jsonb_build_object('ok',false,'error','pin_format');
  end if;

  select *
  into v_link
  from public.v21_customer_public_links l
  where l.public_slug=lower(btrim(coalesce(p_public_slug,'')))
    and l.revoked_at is null
  for update;

  if not found then
    return jsonb_build_object('ok',false,'error','not_found');
  end if;

  if v_link.pin_hash is not null then
    return jsonb_build_object('ok',false,'error','pin_already_set');
  end if;

  update public.v21_customer_public_links
  set pin_hash=extensions.digest(v_link.access_key||':'||v_pin,'sha256'),
      pin_set_at=now(),
      pin_fail_count=0,
      pin_locked_until=null,
      updated_at=now()
  where customer_account_id=v_link.customer_account_id;

  return jsonb_build_object('ok',true,'pin_configured',true);
end;
$$;

create or replace function public.taphoa_public_pin_check(p_public_slug text,p_pin text)
returns jsonb
language plpgsql
security definer
set search_path = public,extensions
as $$
declare
  v_link public.v21_customer_public_links;
  v_expected text;
  v_pin text := btrim(coalesce(p_pin,''));
  v_fail integer;
begin
  select *
  into v_link
  from public.v21_customer_public_links l
  where l.public_slug=lower(btrim(coalesce(p_public_slug,'')))
    and l.revoked_at is null
  for update;

  if not found then
    return jsonb_build_object('ok',false,'error','not_found');
  end if;

  if v_link.pin_hash is null then
    -- Backward compatibility for already-open old clients. New clients treat this as "PIN not set".
    v_expected := public.taphoa_public_pin_value(v_link.access_key);
    if v_pin ~ '^[0-9]{6}$' and v_pin=v_expected then
      return jsonb_build_object(
        'ok',true,
        'legacy',true,
        'customer_account_id',v_link.customer_account_id,
        'public_slug',v_link.public_slug
      );
    end if;
    return jsonb_build_object('ok',false,'error','pin_not_set');
  end if;

  if v_link.pin_locked_until is not null and v_link.pin_locked_until>now() then
    return jsonb_build_object(
      'ok',false,
      'error','pin_locked',
      'retry_after',greatest(1,ceil(extract(epoch from (v_link.pin_locked_until-now()))))::integer
    );
  end if;

  if v_pin ~ '^[0-9]{6}$'
     and extensions.digest(v_link.access_key||':'||v_pin,'sha256')=v_link.pin_hash then
    update public.v21_customer_public_links
    set pin_fail_count=0,pin_locked_until=null,updated_at=now()
    where customer_account_id=v_link.customer_account_id;

    return jsonb_build_object(
      'ok',true,
      'customer_account_id',v_link.customer_account_id,
      'public_slug',v_link.public_slug
    );
  end if;

  v_fail := coalesce(v_link.pin_fail_count,0)+1;
  if v_fail>=5 then
    update public.v21_customer_public_links
    set pin_fail_count=0,pin_locked_until=now()+interval '10 minutes',updated_at=now()
    where customer_account_id=v_link.customer_account_id;

    return jsonb_build_object('ok',false,'error','pin_locked','retry_after',600);
  end if;

  update public.v21_customer_public_links
  set pin_fail_count=v_fail,pin_locked_until=null,updated_at=now()
  where customer_account_id=v_link.customer_account_id;

  return jsonb_build_object('ok',false,'error','pin_invalid','remaining',5-v_fail);
end;
$$;

create or replace function public.taphoa_public_customer_id_for_access(
  p_public_slug text,
  p_pin text default null
)
returns uuid
language plpgsql
security definer
set search_path = public,auth
as $$
declare
  v_link public.v21_customer_public_links;
  v_account public.v21_accounts;
  v_check jsonb;
begin
  select *
  into v_link
  from public.v21_customer_public_links l
  where l.public_slug=lower(btrim(coalesce(p_public_slug,'')))
    and l.revoked_at is null
  limit 1;

  if not found then
    raise exception 'customer_not_found';
  end if;

  if auth.uid() is not null then
    select *
    into v_account
    from public.v21_accounts a
    where a.auth_user_id=auth.uid()
      and a.deleted_at is null
      and a.locked_at is null
    limit 1;

    if found and (
      v_account.role='admin'
      or (
        v_account.role='user'
        and v_account.contact_group='customer'
        and v_account.id=v_link.customer_account_id
      )
    ) then
      return v_link.customer_account_id;
    end if;
  end if;

  if v_link.pin_hash is null then
    return v_link.customer_account_id;
  end if;

  v_check:=public.taphoa_public_pin_check(v_link.public_slug,p_pin);
  if coalesce((v_check->>'ok')::boolean,false) then
    return v_link.customer_account_id;
  end if;

  raise exception '%',coalesce(v_check->>'error','pin_invalid') using errcode='42501';
end;
$$;

create or replace function public.taphoa_public_bootstrap_access(
  p_public_slug text,
  p_pin text default null
)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select public.taphoa_public_bootstrap_for_customer(
    public.taphoa_public_customer_id_for_access(p_public_slug,p_pin)
  );
$$;

create or replace function public.taphoa_public_domains_access(
  p_public_slug text,
  p_pin text,
  p_domains text[]
)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select public.taphoa_public_domains_for_customer(
    public.taphoa_public_customer_id_for_access(p_public_slug,p_pin),
    p_domains
  );
$$;

create or replace function public.taphoa_public_order_detail_access(
  p_public_slug text,
  p_pin text,
  p_order_id uuid
)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select public.taphoa_public_order_detail_for_customer(
    public.taphoa_public_customer_id_for_access(p_public_slug,p_pin),
    p_order_id
  );
$$;

create or replace function public.taphoa_public_debt_ledger_access(
  p_public_slug text,
  p_pin text,
  p_before_at timestamptz default null,
  p_before_id bigint default null,
  p_limit integer default 50
)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select public.taphoa_public_debt_ledger_for_customer(
    public.taphoa_public_customer_id_for_access(p_public_slug,p_pin),
    p_before_at,p_before_id,p_limit
  );
$$;

create or replace function public.taphoa_public_save_pending_access(
  p_public_slug text,
  p_pin text,
  p_order jsonb,
  p_command_id uuid
)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select public.taphoa_public_save_pending_order(
    public.taphoa_public_customer_id_for_access(p_public_slug,p_pin),
    p_order,p_command_id
  );
$$;

create or replace function public.taphoa_public_delete_pending_access(
  p_public_slug text,
  p_pin text,
  p_order_id uuid,
  p_command_id uuid
)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select public.taphoa_public_delete_pending_order(
    public.taphoa_public_customer_id_for_access(p_public_slug,p_pin),
    p_order_id,p_command_id
  );
$$;

create or replace function public.taphoa_public_employee_link_access(
  p_public_slug text,
  p_pin text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer uuid:=public.taphoa_public_customer_id_for_access(p_public_slug,p_pin);
  v_admin uuid;
  v_link public.taphoa_stock_check_links;
begin
  select a.id into v_admin
  from public.v21_accounts a
  where a.role='admin'
    and a.deleted_at is null
    and a.locked_at is null
  order by a.created_at,a.id
  limit 1;
  if v_admin is null then raise exception 'admin_not_found'; end if;

  insert into public.taphoa_stock_check_links(
    customer_account_id,link_role,created_by_account_id,is_active
  )
  values(v_customer,'employee',v_admin,true)
  on conflict(customer_account_id,link_role)
  do update set
    created_by_account_id=excluded.created_by_account_id,
    is_active=true,
    updated_at=now()
  returning * into v_link;

  return jsonb_build_object(
    'ok',true,
    'employee_url','https://app.taphoa.xyz/kiemhang/?t='||v_link.token::text
  );
end;
$$;

create or replace function public.taphoa_public_employee_snapshot_access(
  p_public_slug text,
  p_pin text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer uuid:=public.taphoa_public_customer_id_for_access(p_public_slug,p_pin);
  v_session public.taphoa_stock_check_sessions;
  v_items jsonb;
begin
  select * into v_session
  from public.taphoa_stock_check_sessions s
  where s.customer_account_id=v_customer
  order by s.updated_at desc,s.created_at desc
  limit 1;

  if not found then
    return jsonb_build_object('ok',true,'session',null,'items','[]'::jsonb);
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'product_code',i.product_code,
    'employee_qty',i.employee_qty
  ) order by i.product_code),'[]'::jsonb)
  into v_items
  from public.taphoa_stock_check_items i
  where i.session_id=v_session.id;

  return jsonb_build_object(
    'ok',true,
    'session',jsonb_build_object(
      'id',v_session.id,
      'updated_at',v_session.updated_at,
      'employee_submitted_at',v_session.employee_submitted_at
    ),
    'items',v_items
  );
end;
$$;

revoke all on function public.taphoa_public_gate_state(text) from public,anon,authenticated;
revoke all on function public.taphoa_public_pin_create(text,text) from public,anon,authenticated;
revoke all on function public.taphoa_public_customer_id_for_access(text,text) from public,anon,authenticated;
revoke all on function public.taphoa_public_bootstrap_access(text,text) from public,anon,authenticated;
revoke all on function public.taphoa_public_domains_access(text,text,text[]) from public,anon,authenticated;
revoke all on function public.taphoa_public_order_detail_access(text,text,uuid) from public,anon,authenticated;
revoke all on function public.taphoa_public_debt_ledger_access(text,text,timestamptz,bigint,integer) from public,anon,authenticated;
revoke all on function public.taphoa_public_save_pending_access(text,text,jsonb,uuid) from public,anon,authenticated;
revoke all on function public.taphoa_public_delete_pending_access(text,text,uuid,uuid) from public,anon,authenticated;
revoke all on function public.taphoa_public_employee_link_access(text,text) from public,anon,authenticated;
revoke all on function public.taphoa_public_employee_snapshot_access(text,text) from public,anon,authenticated;

grant execute on function public.taphoa_public_gate_state(text) to anon,authenticated;
grant execute on function public.taphoa_public_pin_create(text,text) to anon,authenticated;
grant execute on function public.taphoa_public_bootstrap_access(text,text) to anon,authenticated;
grant execute on function public.taphoa_public_domains_access(text,text,text[]) to anon,authenticated;
grant execute on function public.taphoa_public_order_detail_access(text,text,uuid) to anon,authenticated;
grant execute on function public.taphoa_public_debt_ledger_access(text,text,timestamptz,bigint,integer) to anon,authenticated;
grant execute on function public.taphoa_public_save_pending_access(text,text,jsonb,uuid) to anon,authenticated;
grant execute on function public.taphoa_public_delete_pending_access(text,text,uuid,uuid) to anon,authenticated;
grant execute on function public.taphoa_public_employee_link_access(text,text) to anon,authenticated;
grant execute on function public.taphoa_public_employee_snapshot_access(text,text) to anon,authenticated;

commit;
