create or replace function public.taphoa_clamp_session_expiry()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.expires_at is null or new.expires_at > now() + interval '12 hours' then
    new.expires_at := now() + interval '12 hours';
  end if;
  return new;
end;
$$;

revoke execute on function public.taphoa_clamp_session_expiry() from public, anon, authenticated;
grant execute on function public.taphoa_clamp_session_expiry() to service_role;

drop trigger if exists trg_taphoa_clamp_session_expiry on public.sessions;
create trigger trg_taphoa_clamp_session_expiry
before insert or update of expires_at on public.sessions
for each row execute function public.taphoa_clamp_session_expiry();

create or replace function public.taphoa_revoke_sessions_on_password_change()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.password_hash is distinct from old.password_hash then
    delete from public.sessions where account_id = new.id;
  end if;
  return new;
end;
$$;

revoke execute on function public.taphoa_revoke_sessions_on_password_change() from public, anon, authenticated;
grant execute on function public.taphoa_revoke_sessions_on_password_change() to service_role;

drop trigger if exists trg_taphoa_revoke_sessions_on_password_change on public.accounts;
create trigger trg_taphoa_revoke_sessions_on_password_change
after update of password_hash on public.accounts
for each row execute function public.taphoa_revoke_sessions_on_password_change();
