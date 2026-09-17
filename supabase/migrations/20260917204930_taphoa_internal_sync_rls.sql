alter table public.taphoa_product_sheet_state enable row level security;
alter table public.taphoa_product_outbox enable row level security;
alter table public.taphoa_product_create_requests enable row level security;
alter table public.taphoa_source_sync_requests enable row level security;

revoke all on table public.taphoa_product_sheet_state from anon, authenticated;
revoke all on table public.taphoa_product_outbox from anon, authenticated;
revoke all on table public.taphoa_product_create_requests from anon, authenticated;
revoke all on table public.taphoa_source_sync_requests from anon, authenticated;
