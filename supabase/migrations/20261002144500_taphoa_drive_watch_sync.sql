-- TAPHOA Google Drive push watch.
-- No periodic product polling: Drive wakes TAPHOA only when the manager file changes.

create table if not exists public.taphoa_sheet_watch_channels (
  channel_id text primary key,
  file_id text not null,
  channel_token text not null,
  resource_id text,
  resource_uri text,
  expires_at timestamptz not null,
  active boolean not null default true,
  last_notified_at timestamptz,
  last_resource_state text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists taphoa_sheet_watch_channels_active_expiry_idx
  on public.taphoa_sheet_watch_channels(active,expires_at desc);

alter table public.taphoa_sheet_watch_channels enable row level security;
revoke all on public.taphoa_sheet_watch_channels from public,anon,authenticated;
grant all on public.taphoa_sheet_watch_channels to service_role;

do $$
declare j record;
begin
  for j in
    select jobid from cron.job
    where jobname in (
      'taphoa_sheet_sync_every_minute',
      'taphoa-sheet-sync-5m',
      'taphoa-sheet-sync-10m',
      'taphoa-sheet-watch-renew'
    )
  loop
    perform cron.unschedule(j.jobid);
  end loop;
end $$;

select cron.schedule(
  'taphoa-sheet-watch-renew',
  '7 */12 * * *',
  $cron$
    select net.http_post(
      url := 'https://vtqhbhrkdxirqeqkgylo.supabase.co/functions/v1/taphoa-sheet-sync/register-watch',
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
      timeout_milliseconds := 30000
    );
  $cron$
);
