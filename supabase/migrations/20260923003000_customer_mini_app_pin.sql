begin;

alter table public.v21_customer_public_links
  add column if not exists pin_fail_count integer not null default 0,
  add column if not exists pin_locked_until timestamptz;

create or replace function public.taphoa_public_pin_value(p_access_key text)
returns text
language sql
immutable
security definer
set search_path = public,extensions
as $$
  select case
    when nullif(btrim(coalesce(p_access_key,'')),'') is null then null
    else lpad(
      (((('x'||substr(encode(extensions.digest(p_access_key,'sha256'),'hex'),1,12))::bit(48)::bigint)%1000000)::text),
      6,'0'
    )
  end;
$$;

revoke all on function public.taphoa_public_pin_value(text) from public,anon,authenticated;

create or replace function public.taphoa_public_pin_for_customer(p_customer_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select public.taphoa_public_pin_value(l.access_key)
  from public.v21_customer_public_links l
  where l.customer_account_id=p_customer_id
    and l.revoked_at is null
  limit 1;
$$;

revoke all on function public.taphoa_public_pin_for_customer(uuid) from public,anon,authenticated;
grant execute on function public.taphoa_public_pin_for_customer(uuid) to service_role;

create or replace function public.taphoa_public_pin_check(p_public_slug text,p_pin text)
returns jsonb
language plpgsql
security definer
set search_path = public
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

  if v_link.pin_locked_until is not null and v_link.pin_locked_until>now() then
    return jsonb_build_object(
      'ok',false,
      'error','pin_locked',
      'retry_after',greatest(1,ceil(extract(epoch from (v_link.pin_locked_until-now()))))::integer
    );
  end if;

  v_expected := public.taphoa_public_pin_value(v_link.access_key);
  if v_pin ~ '^[0-9]{6}$' and v_pin=v_expected then
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

revoke all on function public.taphoa_public_pin_check(text,text) from public,anon,authenticated;
grant execute on function public.taphoa_public_pin_check(text,text) to service_role;

commit;
