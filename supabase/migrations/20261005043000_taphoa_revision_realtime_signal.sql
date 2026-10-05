-- RT-08: TAPHOA revision-only Realtime wake owner.
-- Business payloads continue to flow through TAPHOA RPC/read models.
-- This table exposes only five domain revision counters used as cache invalidation signals.

alter table public.taphoa_revisions enable row level security;

grant select on table public.taphoa_revisions to anon, authenticated;
revoke insert, update, delete on table public.taphoa_revisions from anon, authenticated;

drop policy if exists "taphoa_revisions_signal_read" on public.taphoa_revisions;
create policy "taphoa_revisions_signal_read"
on public.taphoa_revisions
for select
to anon, authenticated
using (true);

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname='supabase_realtime'
      and schemaname='public'
      and tablename='taphoa_revisions'
  ) then
    alter publication supabase_realtime add table public.taphoa_revisions;
  end if;
end
$$;
