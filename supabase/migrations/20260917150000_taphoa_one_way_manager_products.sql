-- Products are one-way: Management Sheet -> Supabase -> Web.
-- Browser users can read product data through the existing read RPCs, but can no longer
-- create/update/delete products or product sources.

revoke all on function public.taphoa_create_source_from_web(text) from public, anon, authenticated;
revoke all on function public.taphoa_update_product_from_web(jsonb) from public, anon, authenticated;
revoke all on function public.taphoa_delete_product_from_web(text) from public, anon, authenticated;
revoke all on function public.taphoa_delete_source_from_web(text) from public, anon, authenticated;

-- Retire any work left in the old outbound Web/Supabase -> Sheet queues so the
-- one-way worker can never replay it later.
update public.taphoa_product_outbox
set status='superseded', updated_at=now(), last_error='retired_one_way_manager_sync'
where status='pending';

update public.taphoa_product_create_requests
set status='cancelled', updated_at=now(), last_error='retired_one_way_manager_sync'
where status in ('pending_sheet','sheet_written','error');

update public.taphoa_source_sync_requests
set status='cancelled', updated_at=now(), last_error='retired_one_way_manager_sync'
where status in ('pending','error');
