-- TAPHOA independent business core.
-- Shared identity remains owned by public.v21_accounts.

create table if not exists public.taphoa_sources (
  source_key text primary key,
  name text not null,
  sort_order integer not null,
  active boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists public.taphoa_products (
  product_code text primary key,
  source_key text not null references public.taphoa_sources(source_key),
  source_row integer not null check (source_row > 0),
  product_name text not null check (btrim(product_name) <> ''),
  input_price_vnd bigint,
  input_price_basis text not null check (input_price_basis in ('carton','retail')),
  expected_profit_percent numeric,
  applied_profit_vnd bigint not null default 0,
  sale_price_vnd bigint,
  carton_price_vnd bigint,
  retail_price_vnd bigint,
  units_per_carton numeric,
  retail_unit text not null default '',
  stock_status text not null check (stock_status in ('available','out_of_stock','no_price')),
  stock_label text not null default '',
  is_active boolean not null default true,
  raw_row jsonb not null default '[]'::jsonb,
  sheet_updated_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint taphoa_products_input_price_nonnegative check (input_price_vnd is null or input_price_vnd >= 0),
  constraint taphoa_products_sale_price_nonnegative check (sale_price_vnd is null or sale_price_vnd >= 0),
  constraint taphoa_products_carton_price_nonnegative check (carton_price_vnd is null or carton_price_vnd >= 0),
  constraint taphoa_products_retail_price_nonnegative check (retail_price_vnd is null or retail_price_vnd >= 0),
  constraint taphoa_products_pack_positive check (units_per_carton is null or units_per_carton >= 1)
);

create index if not exists taphoa_products_source_active_idx
  on public.taphoa_products(source_key,is_active,source_row);
create index if not exists taphoa_products_name_idx
  on public.taphoa_products(product_name);

create table if not exists public.taphoa_orders (
  id uuid primary key default gen_random_uuid(),
  customer_account_id uuid not null references public.v21_accounts(id),
  status text not null check (status in ('pending','delivered','reversed')),
  note text not null default '',
  created_by_account_id uuid not null references public.v21_accounts(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  delivered_at timestamptz,
  reversed_at timestamptz
);

create index if not exists taphoa_orders_customer_status_idx
  on public.taphoa_orders(customer_account_id,status,created_at desc);
create index if not exists taphoa_orders_status_created_idx
  on public.taphoa_orders(status,created_at desc);

create table if not exists public.taphoa_order_items (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.taphoa_orders(id) on delete cascade,
  product_code text not null references public.taphoa_products(product_code),
  qty numeric not null check (qty > 0),
  unit_price_vnd bigint not null check (unit_price_vnd >= 0),
  line_no integer not null check (line_no > 0),
  note text not null default '',
  unique(order_id,line_no)
);

create index if not exists taphoa_order_items_order_idx
  on public.taphoa_order_items(order_id,line_no);

create table if not exists public.taphoa_debt_ledger (
  id bigint generated always as identity primary key,
  customer_account_id uuid not null references public.v21_accounts(id),
  order_id uuid references public.taphoa_orders(id),
  entry_type text not null check (entry_type in ('sale','reversal','payment','collection','adjustment')),
  amount_vnd bigint not null,
  note text not null default '',
  created_by_account_id uuid not null references public.v21_accounts(id),
  created_at timestamptz not null default now()
);

create index if not exists taphoa_debt_ledger_customer_created_idx
  on public.taphoa_debt_ledger(customer_account_id,created_at desc,id desc);
create index if not exists taphoa_debt_ledger_order_idx
  on public.taphoa_debt_ledger(order_id) where order_id is not null;

create table if not exists public.taphoa_revisions (
  domain text primary key check (domain in ('products','customers','orders','debt','settings')),
  revision bigint not null default 0 check (revision >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.taphoa_sheet_sync_state (
  id smallint primary key default 1 check (id = 1),
  management_file_id text not null,
  last_drive_modified_time timestamptz,
  last_success_at timestamptz,
  last_sync_status text not null default 'idle' check (last_sync_status in ('idle','running','success','error')),
  last_error text not null default '',
  last_imported_row_count integer not null default 0 check (last_imported_row_count >= 0),
  updated_at timestamptz not null default now()
);

insert into public.taphoa_sources(source_key,name,sort_order,active)
values
  ('hang-u','Hàng U',1,true),
  ('thuoc-la','Thuốc lá',2,true),
  ('sua','Sữa',3,true),
  ('masan','Hàng masan',4,true),
  ('hang-thuong','Hàng thường',5,true)
on conflict (source_key) do update
set name=excluded.name,
    sort_order=excluded.sort_order,
    active=excluded.active,
    updated_at=now();

insert into public.taphoa_revisions(domain,revision)
values
  ('products',0),
  ('customers',0),
  ('orders',0),
  ('debt',0),
  ('settings',0)
on conflict (domain) do nothing;

insert into public.taphoa_sheet_sync_state(id,management_file_id)
values (1,'1hGqAzIEqTMmULIeh5sCmed2R3XaiA9QZavtGRdNvyyU')
on conflict (id) do update
set management_file_id=excluded.management_file_id;

create or replace function public.taphoa_access_context()
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  a public.v21_accounts;
  v_allowed boolean := false;
  v_taphoa_role text := null;
begin
  if auth.uid() is null then
    return jsonb_build_object('allowed',false);
  end if;

  select * into a
  from public.v21_accounts
  where auth_user_id = auth.uid()
    and deleted_at is null
    and locked_at is null
  limit 1;

  if not found then
    return jsonb_build_object('allowed',false);
  end if;

  if a.role = 'admin' then
    v_allowed := true;
    v_taphoa_role := 'admin';
  elsif a.role = 'user' and a.contact_group = 'customer' then
    v_allowed := true;
    v_taphoa_role := 'customer';
  end if;

  return jsonb_build_object(
    'account_id',a.id,
    'username',a.username,
    'display_name',a.display_name,
    'role',a.role,
    'contact_group',a.contact_group,
    'taphoa_role',v_taphoa_role,
    'allowed',v_allowed
  );
end;
$$;

alter table public.taphoa_sources enable row level security;
alter table public.taphoa_products enable row level security;
alter table public.taphoa_orders enable row level security;
alter table public.taphoa_order_items enable row level security;
alter table public.taphoa_debt_ledger enable row level security;
alter table public.taphoa_revisions enable row level security;
alter table public.taphoa_sheet_sync_state enable row level security;

revoke all on table public.taphoa_sources from anon, authenticated;
revoke all on table public.taphoa_products from anon, authenticated;
revoke all on table public.taphoa_orders from anon, authenticated;
revoke all on table public.taphoa_order_items from anon, authenticated;
revoke all on table public.taphoa_debt_ledger from anon, authenticated;
revoke all on table public.taphoa_revisions from anon, authenticated;
revoke all on table public.taphoa_sheet_sync_state from anon, authenticated;

revoke all on function public.taphoa_access_context() from public;
grant execute on function public.taphoa_access_context() to authenticated;
