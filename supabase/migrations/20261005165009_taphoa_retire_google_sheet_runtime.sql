-- Retire Google Sheet from the TAPHOA runtime price-management path.
-- Keep legacy sync objects only as dormant rollback/history structures.

do $$
declare
  r record;
begin
  if to_regclass('cron.job') is not null then
    for r in
      select jobid from cron.job
      where command ilike '%taphoa-sheet-sync%'
    loop
      perform cron.unschedule(r.jobid);
    end loop;
  end if;
exception
  when insufficient_privilege then
    null;
end;
$$;

update public.taphoa_sheet_watch_channels
set active=false,updated_at=now()
where active=true;

update public.taphoa_product_outbox
set status='superseded',updated_at=now()
where status='pending';
