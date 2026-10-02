-- Safety guard for the current cutover: do not burn Edge invocations while
-- GOOGLE_SERVICE_ACCOUNT_JSON is not installed on the new Supabase project.
do $$
declare j record;
begin
  for j in select jobid from cron.job where jobname='taphoa-sheet-sync-5m'
  loop
    perform cron.unschedule(j.jobid);
  end loop;
end;
$$;