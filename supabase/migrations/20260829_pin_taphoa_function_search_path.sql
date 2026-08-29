do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname like 'taphoa_%'
  loop
    execute format('alter function %s set search_path = public',r.sig);
  end loop;
end $$;
