begin;

-- Reassert self-managed PIN semantics after the legacy deterministic-PIN migration.
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
    -- Backward compatibility only. New UI treats this state as "PIN chưa tạo".
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

create or replace function public.taphoa_public_pin_manage_access(
  p_public_slug text,
  p_pin text,
  p_new_pin text
)
returns jsonb
language plpgsql
security definer
set search_path = public,extensions
as $$
declare
  v_customer uuid;
  v_link public.v21_customer_public_links;
  v_new text := btrim(coalesce(p_new_pin,''));
begin
  if v_new !~ '^[0-9]{6}$' then
    return jsonb_build_object('ok',false,'error','pin_format');
  end if;

  v_customer := public.taphoa_public_customer_id_for_access(p_public_slug,p_pin);

  select *
  into v_link
  from public.v21_customer_public_links l
  where l.customer_account_id=v_customer
    and l.revoked_at is null
  for update;

  if not found then
    return jsonb_build_object('ok',false,'error','not_found');
  end if;

  update public.v21_customer_public_links
  set pin_hash=extensions.digest(v_link.access_key||':'||v_new,'sha256'),
      pin_set_at=now(),
      pin_fail_count=0,
      pin_locked_until=null,
      updated_at=now()
  where customer_account_id=v_customer
    and revoked_at is null;

  return jsonb_build_object(
    'ok',true,
    'pin_configured',true,
    'public_slug',v_link.public_slug
  );
end;
$$;

revoke all on function public.taphoa_public_pin_manage_access(text,text,text)
  from public,anon,authenticated;
grant execute on function public.taphoa_public_pin_manage_access(text,text,text)
  to anon,authenticated;

revoke all on function public.taphoa_public_pin_check(text,text)
  from public,anon,authenticated;
grant execute on function public.taphoa_public_pin_check(text,text)
  to anon,authenticated;

commit;
