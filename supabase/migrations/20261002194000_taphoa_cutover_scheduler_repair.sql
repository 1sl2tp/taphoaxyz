-- Post-cutover repair: run the authoritative management Sheet sync on the new
-- Business Core project without creating overlapping Edge invocations.
do $$
declare j record;
begin
  for j in
    select jobid
    from cron.job
    where jobname in ('taphoa_sheet_sync_every_minute','taphoa-sheet-sync-5m')
  loop
    perform cron.unschedule(j.jobid);
  end loop;
end;
$$;

select cron.schedule(
  'taphoa-sheet-sync-5m',
  '*/5 * * * *',
  $cron$
    select net.http_post(
      url := 'https://vtqhbhrkdxirqeqkgylo.supabase.co/functions/v1/taphoa-sheet-sync',
      headers := jsonb_build_object(
        'content-type','application/json',
        'x-taphoa-cron',(
          select decrypted_secret
          from vault.decrypted_secrets
          where name='taphoa_sheet_sync_cron_secret'
          order by created_at desc
          limit 1
        )
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 120000
    )
    where coalesce(
      (select lock_until from public.taphoa_sheet_sync_state where id=1),
      '-infinity'::timestamptz
    ) < now();
  $cron$
);