-- TAPHOA product/catalog business data is Supabase-only.
-- Remove every live Google Drive/Sheet synchronization path.

do $$
declare r record;
begin
  if to_regclass('cron.job') is not null then
    for r in
      select jobid
      from cron.job
      where jobname ilike '%taphoa%sheet%'
         or jobname ilike '%taphoa%drive%'
         or command ilike '%taphoa-sheet-sync%'
         or command ilike '%google%'
    loop
      perform cron.unschedule(r.jobid);
    end loop;
  end if;
exception
  when insufficient_privilege then null;
end $$;

drop function if exists public.taphoa_apply_product_sync(jsonb,jsonb,timestamptz);
drop function if exists public.taphoa_apply_product_delta(jsonb,jsonb,timestamptz,integer);
drop function if exists public.taphoa_acquire_sheet_sync_lock(uuid,integer);
drop function if exists public.taphoa_release_sheet_sync_lock(uuid);
drop function if exists public.taphoa_validate_sheet_sync_cron(text);
drop function if exists public.taphoa_upsert_sheet_source(bigint,text,integer);
drop function if exists public.taphoa_finalize_source_sheet(text,bigint,text,integer);
drop function if exists public.taphoa_finalize_product_create(uuid,text,bigint,integer,timestamptz,text);
drop function if exists public.taphoa_mark_product_delete_acked(text,timestamptz);
drop function if exists public.taphoa_mark_source_deleted(text);
drop function if exists public.taphoa_resolve_product_code(text);

drop table if exists public.taphoa_product_outbox;
drop table if exists public.taphoa_product_sheet_state;
drop table if exists public.taphoa_sheet_watch_channels;
drop table if exists public.taphoa_sheet_sync_state;
drop table if exists public.taphoa_product_create_requests;
drop table if exists public.taphoa_source_sync_requests;

update public.taphoa_sources
set management_sheet_id=null,last_sheet_seen_at=null,updated_at=now()
where management_sheet_id is not null or last_sheet_seen_at is not null;

update public.taphoa_products
set sheet_updated_at=null,updated_at=now()
where sheet_updated_at is not null;

do $$
begin
  begin
    delete from vault.secrets where name='taphoa_sheet_sync_cron_secret';
  exception
    when undefined_table or insufficient_privilege then null;
  end;
end $$;

update public.taphoa_revisions
set revision=revision+1,updated_at=now()
where domain='products';
