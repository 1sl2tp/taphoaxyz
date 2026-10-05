-- Minimal supplier price feedback list.
-- Visible UI fields: product name, old cost, new cost.

create table if not exists public.taphoa_supplier_price_feedback (
  id bigint generated always as identity primary key,
  product_code text not null references public.taphoa_products(product_code) on delete cascade,
  old_price numeric,
  new_price numeric,
  created_by uuid null,
  created_at timestamptz not null default now()
);

create index if not exists taphoa_supplier_price_feedback_time_idx
  on public.taphoa_supplier_price_feedback(created_at desc,id desc);

alter table public.taphoa_supplier_price_feedback enable row level security;
revoke all on table public.taphoa_supplier_price_feedback from public,anon,authenticated;
grant all on table public.taphoa_supplier_price_feedback to service_role;
grant usage,select on sequence public.taphoa_supplier_price_feedback_id_seq to service_role;

-- RPCs are installed in Supabase:
-- taphoa_admin_add_supplier_price_feedback(text,numeric,numeric)
-- taphoa_admin_supplier_price_feedback()
-- taphoa_admin_delete_supplier_price_feedback(bigint)
