create table if not exists public.login_rate_limits (
  key_hash text primary key,
  window_start timestamptz not null default now(),
  fail_count integer not null default 0 check (fail_count >= 0),
  locked_until timestamptz,
  updated_at timestamptz not null default now()
);

do $$
declare t text;
begin
  foreach t in array array[
    'product_sources','operation_requests','business_audit_log','customer_summary',
    'customer_product_summary','operation_audit','daily_summary','customer_daily_summary',
    'login_rate_limits'
  ] loop
    if to_regclass('public.'||t) is not null then
      execute format('alter table public.%I enable row level security',t);
      execute format('revoke all on table public.%I from public, anon, authenticated',t);
      execute format('grant all on table public.%I to service_role',t);
    end if;
  end loop;
end $$;

do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname like 'taphoa_%'
  loop
    execute format('revoke execute on function %s from public, anon, authenticated',r.sig);
    execute format('grant execute on function %s to service_role',r.sig);
  end loop;
end $$;

alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;
