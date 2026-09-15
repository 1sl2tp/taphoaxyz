# TAPHOA Independent Reset + Shared Account + Sheet Sync Design

Date: 2026-09-15
Status: Approved in chat; written design pending final review before implementation
Owners: `1sl2tp/taphoaxyz` (primary), `1sl2tp/getlink` (decommission only)

## 1. Goal

Make `taphoa.xyz` the only Tạp hóa application.

The final system has these boundaries:

- `taphoa.xyz` owns Bán, Đơn, Đơn tạm, Công nợ and all future Tạp hóa business data.
- `taphoa.xyz` uses the existing shared account system in Supabase project `gcnoahqsrquxkwkjbuxy`.
- Shared account mapping is exact:
  - `role = 'admin'` => TAPHOA Admin.
  - `role = 'user' AND contact_group = 'customer'` => TAPHOA customer user.
  - `role = 'user' AND contact_group IN ('friend','other')` => no TAPHOA access.
- Product data is rebuilt from the management Google Sheet and synced one-way into TAPHOA.
- GETLINK no longer owns or exposes any Tạp hóa tab, Tạp hóa sales/order/debt runtime, or Tạp hóa dataset after cutover.

## 2. Current verified baseline

Shared account owner is `public.v21_accounts` in Supabase project `gcnoahqsrquxkwkjbuxy`.

Current active account population:

- Admin: 1 account.
- User / customer: 46 accounts.
- User / friend: 7 accounts.
- User / other: 22 accounts.

The old TAPHOA-shaped generic data currently present in that project is:

- `accounts`: 41 rows.
- `products`: 649 rows.
- `product_sources`: 5 rows.
- `orders`: 421 rows.
- `order_items`: 2258 rows.
- `debts`: 643 rows.

These old business rows are not migrated. They are explicitly reset as part of cutover.

GETLINK currently contains a separate Tạp hóa business/runtime surface and Tạp hóa data, including at minimum:

- `getlink_supplier_products`: 515 rows.
- `getlink_sales_orders`: 21 rows.
- `getlink_sales_order_items`: 157 rows.
- `getlink_debt_ledger`: 23 rows.
- `getlink_user_product_feedback`: 5 rows.
- Tạp hóa-specific frontend files with `taphoa-*` names.

GETLINK cleanup happens only after TAPHOA cutover is verified.

## 3. Non-negotiable reset boundary

### Delete/reset

The TAPHOA reset removes all old TAPHOA business state:

- old `accounts` business rows;
- old `products` rows;
- old `product_sources` rows;
- old `orders` rows;
- old `order_items` rows;
- old `debts` rows;
- old TAPHOA business cache/revision state that belongs to the retired data contract.

No old product/customer/order/debt row is copied into the new TAPHOA business tables.

### Never delete

The reset must not delete or rewrite shared identity/chat infrastructure:

- `auth.users`;
- `public.v21_accounts`;
- V21 auth/session/device tables/functions;
- Chat messages/media/calls/Zalo state;
- account avatars;
- user `contact_group` classification.

The shared account system is an upstream dependency, not TAPHOA-owned data.

## 4. Target architecture

```text
Shared Account System (gcno...)
  auth.users
  v21_accounts
      |
      | authenticated identity only
      v
TAPHOA app (taphoa.xyz)
  taphoa_* business tables
  taphoa_* RPCs
  taphoa-sheet-sync Edge Function
      ^
      |
      | one-way product sync
      |
Google management Sheet

GETLINK
  supermarket / price-compare / news only
  NO Tạp hóa tab
  NO Tạp hóa order/debt runtime
```

`taphoa.xyz` is an independent application even though authentication and business tables live in the same Supabase project as Chat. Independence is enforced by namespaced TAPHOA tables/RPCs and by not calling GETLINK APIs.

## 5. Shared account authentication

### 5.1 Supabase project

`taphoa.xyz` switches its runtime Supabase configuration to:

- URL: `https://gcnoahqsrquxkwkjbuxy.supabase.co`
- current project publishable key already used by Chat/GETLINK.

It stops using the old `crdbhkdeqyehsbzgggbs` runtime configuration.

### 5.2 Login mechanics

TAPHOA reuses the same username/password credentials as Chat:

- normalized username maps to `${username}@taphoa.chat`;
- sign-in uses `supabase.auth.signInWithPassword`;
- session persists in a TAPHOA-specific storage key so TAPHOA remains an independent app UI/session surface;
- no second account table is created.

### 5.3 TAPHOA access gate

Create RPC `taphoa_access_context()` as `SECURITY DEFINER` with fixed `search_path`.

It reads only the current authenticated row in `v21_accounts` via `auth.uid()` and returns:

```json
{
  "account_id": "uuid",
  "username": "...",
  "display_name": "...",
  "role": "admin|user",
  "contact_group": "customer|friend|other",
  "taphoa_role": "admin|customer",
  "allowed": true
}
```

Rules:

- active, unlocked Admin => `taphoa_role='admin'`, `allowed=true`;
- active, unlocked User + `contact_group='customer'` => `taphoa_role='customer'`, `allowed=true`;
- friend/other/deleted/locked/missing account => denied.

TAPHOA must not copy usernames/passwords into a separate account table.

## 6. New TAPHOA data model

All new business tables use the `taphoa_` prefix.

### `taphoa_sources`

- `source_key text primary key`
- `name text not null`
- `sort_order integer not null`
- `active boolean not null default true`
- `updated_at timestamptz not null default now()`

Initial sources, in order:

1. `hang-u` — Hàng U
2. `thuoc-la` — Thuốc lá
3. `sua` — Sữa
4. `masan` — Hàng masan
5. `hang-thuong` — Hàng thường

### `taphoa_products`

Primary identity is the stable management-sheet product code.

Columns:

- `product_code text primary key`
- `source_key text not null references taphoa_sources(source_key)`
- `source_row integer not null`
- `product_name text not null`
- `input_price_vnd bigint`
- `input_price_basis text not null check in ('carton','retail')`
- `expected_profit_percent numeric`
- `applied_profit_vnd bigint not null default 0`
- `sale_price_vnd bigint`
- `carton_price_vnd bigint`
- `retail_price_vnd bigint`
- `units_per_carton numeric`
- `retail_unit text not null default ''`
- `stock_status text not null check in ('available','out_of_stock','no_price')`
- `stock_label text not null default ''`
- `is_active boolean not null default true`
- `raw_row jsonb not null default '[]'::jsonb`
- `sheet_updated_at timestamptz`
- `updated_at timestamptz not null default now()`

Price normalization must match the proven GETLINK sheet rule:

- supplier cost comes from management column B and is stored as VND (`sheet value * 1000`);
- applied profit comes from management column G and is stored as VND (`sheet value * 1000`);
- `sale_price_vnd = input_price_vnd + applied_profit_vnd` when input price is positive;
- if basis is `retail`, `retail_price_vnd = sale_price_vnd`; carton price is retail price × `units_per_carton` when pack qty > 1;
- otherwise `carton_price_vnd = sale_price_vnd`; retail price is carton price / `units_per_carton` when pack qty > 1;
- no sell price is synthesized when the input price is missing/non-positive.

### `taphoa_orders`

- `id uuid primary key default gen_random_uuid()`
- `customer_account_id uuid not null references v21_accounts(id)`
- `status text not null check in ('pending','delivered','reversed')`
- `note text not null default ''`
- `created_by_account_id uuid not null references v21_accounts(id)`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`
- `delivered_at timestamptz`
- `reversed_at timestamptz`

### `taphoa_order_items`

- `id bigint generated always as identity primary key`
- `order_id uuid not null references taphoa_orders(id) on delete cascade`
- `product_code text not null references taphoa_products(product_code)`
- `qty numeric not null check (qty > 0)`
- `unit_price_vnd bigint not null check (unit_price_vnd >= 0)`
- `line_no integer not null`
- `note text not null default ''`

### `taphoa_debt_ledger`

- `id bigint generated always as identity primary key`
- `customer_account_id uuid not null references v21_accounts(id)`
- `order_id uuid references taphoa_orders(id)`
- `entry_type text not null check in ('sale','reversal','payment','collection','adjustment')`
- `amount_vnd bigint not null`
- `note text not null default ''`
- `created_by_account_id uuid not null references v21_accounts(id)`
- `created_at timestamptz not null default now()`

Debt balance is the running sum of ledger amounts; it is not stored as an editable balance column.

### `taphoa_revisions`

Rows for exactly:

- `products`
- `customers`
- `orders`
- `debt`
- `settings`

Each row stores monotonically increasing `revision bigint`.

### `taphoa_sheet_sync_state`

Single row (`id=1`) containing:

- management file id;
- last Google Drive `modifiedTime`;
- last successful sync time;
- last sync status;
- last error text;
- last imported row count.

## 7. Customer model

TAPHOA does not own a separate customer-account registry.

The customer list is derived from shared accounts:

```sql
role = 'user'
and contact_group = 'customer'
and deleted_at is null
and locked_at is null
```

Frontend customer objects keep the current TAPHOA-shaped interface by mapping:

- `maKH` => `v21_accounts.id` (UUID string)
- `ten` => `display_name`
- `username` => `username`

Admin can select any active customer-group user.

A customer user can only read their own orders/debt and cannot create/administer data outside the permitted customer actions.

## 8. RPC boundary

Create namespaced RPCs; do not create generic `app_*` functions in the shared project.

Required read RPCs:

- `taphoa_app_bootstrap()`
- `taphoa_app_meta()`
- `taphoa_app_domains(p_domains text[])`
- `taphoa_order_detail(p_order_id uuid)`
- `taphoa_debt_ledger_page(...)`

Required mutation RPCs preserving current frontend semantics:

- `taphoa_save_order(p_order jsonb, p_command_id uuid)`
- `taphoa_deliver_order(p_order_id uuid, p_command_id uuid)`
- `taphoa_reverse_order(p_order_id uuid, p_reason text, p_command_id uuid)`
- `taphoa_delete_pending_order(p_order_id uuid, p_command_id uuid)`
- `taphoa_batch_orders(p_action text, p_ids uuid[], p_command_id uuid)`
- `taphoa_debt_transaction(...)`

Authorization is checked inside every RPC from `auth.uid()` -> `v21_accounts`.

Admin mutations require `role='admin'`.
Customer reads are automatically scoped to their own `v21_accounts.id`.

## 9. Google Sheet product sync

### 9.1 Source file

Management spreadsheet id:

`1hGqAzIEqTMmULIeh5sCmed2R3XaiA9QZavtGRdNvyyU`

Sheets and product-code prefixes:

- `Hàng U` => `HU-`
- `Thuốc lá` => `TL-`
- `Sữa` => `SUA-`
- `Hàng masan` => `MAS-`
- `Hàng thường` => `HT-`

### 9.2 Column contract

The TAPHOA sync reads the management file only. It does not read NCC files and it does not write back to Google Sheets.

Columns used from each sheet:

- A: product name
- B: supplier/input price (thousand VND)
- C: status text
- D: input price basis (`Lẻ` => retail, otherwise carton)
- E: expected profit percent expressed as sheet ratio
- G: applied profit (thousand VND)
- K: units per carton
- L: retail unit
- P: stable product code

Rows without name or code are skipped.

Status mapping:

- `Ngừng dùng` => inactive + `no_price`
- `Đang hết` => active + `out_of_stock`
- missing price / `Chưa có giá` => active + `no_price`
- otherwise => active + `available`

If a previously imported product code disappears from its source sheet, it is marked inactive; it is not physically deleted because historical order items may reference it.

### 9.3 Sync worker

Create Edge Function `taphoa-sheet-sync` in `gcnoahqsrquxkwkjbuxy`.

The worker:

1. authenticates to Google APIs with the existing service-account secret;
2. checks the management file Drive `modifiedTime`;
3. returns without reading full sheets when the `modifiedTime` has not changed;
4. when changed, reads the five management tabs;
5. upserts sources/products into `taphoa_*` tables in chunks;
6. marks missing codes inactive;
7. increments only the `products` revision after a successful complete sync;
8. records sync state;
9. never writes to GETLINK tables.

A dedicated cron invokes it once per minute. The Drive metadata check is lightweight; full sheet reads happen only after actual file modification.

Manual sync remains available for Admin through an authenticated action.

## 10. Frontend cutover

`1sl2tp/taphoaxyz` keeps its current screen architecture:

`UI -> Screen -> Business Service -> Supabase RPC`

Changes are limited to owner boundaries:

- `src/core/config.js`: switch to shared project URL/key and TAPHOA-specific auth storage key.
- `src/core/auth.js`: use shared Chat credential format and `taphoa_access_context()`; remove old `shop_identities` dependency.
- `src/core/business.js`: call `taphoa_*` RPC names.
- `src/core/app-state.js` and `src/core/snapshot.js`: keep the current runtime contract; bump snapshot cache version so old cached business rows cannot reappear after reset.
- Screens continue reading `products`, `sources`, `customers`, `orders`, `debtSummary` from App State.

No screen may call GETLINK.

## 11. Destructive reset procedure

The reset is executed only after the new schema/RPC/auth path and sheet sync pass tests on production schema without exposing it to the live UI.

Order of operations:

1. deploy new `taphoa_*` schema/RPCs;
2. deploy `taphoa-sheet-sync`;
3. run one full sync and verify product/source counts and sample price math;
4. switch TAPHOA frontend to shared auth + `taphoa_*` RPCs;
5. verify Admin login and one customer-group User login;
6. verify friend/other users are denied;
7. bump TAPHOA snapshot version;
8. truncate old TAPHOA generic business data in FK-safe order;
9. verify old generic counts are zero;
10. verify `v21_accounts` counts are unchanged;
11. verify TAPHOA Bán/Đơn/Công nợ against the new empty business tables plus synced products.

The destructive statement must explicitly target only:

- `order_items`
- `orders`
- `debts`
- `products`
- `product_sources`
- `accounts`

It must not use broad schema wipes, `drop schema public`, or any wildcard logic.

## 12. GETLINK decommission

GETLINK cleanup is a separate implementation plan and begins only after TAPHOA cutover is green.

Remove from GETLINK:

- Tạp hóa navigation/tab and source selector entries;
- `taphoa-*` frontend runtime/assets loaded solely for the Tạp hóa sales workspace;
- Tạp hóa order/debt/customer endpoints and tests when no longer referenced by non-Tạp hóa features;
- Tạp hóa-only data rows/tables after dependency verification;
- Tạp hóa-specific cron/Edge Functions after TAPHOA sync owns sheet ingestion.

Preserve:

- supermarket catalog and scrapers (WinMart/BHX/GO);
- supermarket price-compare/search;
- news;
- GETLINK-only source normalization/canonicalization still used by supermarket data;
- unrelated Chat and account infrastructure.

GETLINK must not proxy or embed TAPHOA after cleanup. If navigation between apps is wanted later, it is a normal external link, not shared runtime.

## 13. Testing gates

### TAPHOA auth

- Admin shared account can sign in and receives TAPHOA Admin role.
- User/customer can sign in and receives customer role.
- User/friend and User/other are denied TAPHOA access.
- No row is created in old `accounts` during login.

### TAPHOA sheet sync

- unchanged Drive `modifiedTime` performs no product writes;
- changed file imports all five sheets;
- stable `product_code` is the upsert key;
- missing rows become inactive;
- price-basis calculations match the GETLINK reference rule;
- only `taphoa_revisions.products` increments on product sync failure/success semantics: increment only after complete success.

### TAPHOA data reset

Before and after counts are captured.

After reset:

- old generic `accounts/products/product_sources/orders/order_items/debts` rows = 0;
- `v21_accounts` active account counts exactly match pre-reset counts;
- new `taphoa_products` is populated from Sheet;
- new orders/debt ledger start at 0.

### TAPHOA frontend

- no network request targets `crdbhkdeqyehsbzgggbs`;
- no network request targets GETLINK for business data;
- reload cannot restore retired snapshot rows;
- Admin sees all customer-group users;
- customer user is scoped to self;
- Bán can create a pending order using a synced product;
- delivery/reversal/debt actions preserve existing semantics.

### GETLINK cleanup

- no Tạp hóa tab or Tạp hóa runtime is reachable;
- verify workflow no longer checks removed `taphoa-*` files;
- supermarket/news tests remain green;
- no GETLINK cron continues syncing the management Sheet into the retired Tạp hóa tables.

## 14. Cutover safety

- No destructive data statement runs before a successful full Sheet import into `taphoa_products`.
- No GETLINK Tạp hóa deletion runs before the TAPHOA production path is green.
- Every destructive operation captures row counts immediately before and immediately after.
- The final verification explicitly compares `v21_accounts` grouped counts before/after reset.
- Old TAPHOA generic data is intentionally not migrated or restored after cutover.

## 15. Success criteria

The migration is complete only when all are true:

1. `taphoa.xyz` authenticates against the shared account system.
2. Admin is Admin; only User/customer is a TAPHOA customer user.
3. old TAPHOA business data is empty.
4. TAPHOA products come only from the management Sheet sync.
5. TAPHOA uses only namespaced TAPHOA business tables/RPCs.
6. TAPHOA does not depend on GETLINK.
7. GETLINK contains no Tạp hóa tab/runtime/data-sync ownership.
8. Shared Chat/account data remains untouched.
