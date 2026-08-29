# TAPHOA V1.27 — Verification

Date: 2026-08-29
Baseline: TAPHOA_SUPABASE_V1_26.html
Candidate: TAPHOA_SUPABASE_V1_27.html

## Root database rules added

Migration:
- `normalize_names_and_integer_money_root`

Database normalization functions:
- `taphoa_normalize_customer_name(text)`
- `taphoa_normalize_entity_name(text)`

Rules:
- Customer names: title case each word.
  - `em quyên` → `Em Quyên`
- Product names: uppercase only first character of the whole name.
  - `sữa milo hộp` → `Sữa milo hộp`
- Source names: uppercase only first character of the whole name.
  - `đồ ăn vặt` → `Đồ ăn vặt`

Database triggers apply these rules on INSERT/UPDATE for:
- accounts (customer name)
- products
- product_sources
- orders customer_name snapshot
- debts customer_name snapshot
- order_items product_name / group_name snapshot

Existing data was normalized in place.

Post-migration bad-name counts:
- customer names: 0
- product names: 0
- source names: 0
- order customer snapshots: 0
- debt customer snapshots: 0
- order item product snapshots: 0
- order item source snapshots: 0

## Integer money at database root

Raw money columns remain `numeric`, but DB triggers now truncate fractional input and CHECK constraints guarantee integer storage for:
- products.price / products.cost
- orders.total_amount / orders.total_cost
- order_items.unit_price / order_items.unit_cost
- debts.amount

Fresh fractional-row counts:
- products: 0
- orders: 0
- order_items: 0
- debts: 0

Rollback write test:
- input customer `  em   quyên  ` → stored `Em Quyên`
- input product `  sữa   milo hộp ` → stored `Sữa milo hộp`
- input source `  đồ   ăn vặt ` → stored `Đồ ăn vặt`
- input price `6653.9` → stored `6653`
- input cost `6123.8` → stored `6123`
- transaction rolled back

## Report money

DB report RPCs now truncate monetary averages:
- `avg_order_value`
- `avg_profit_per_order`

Fresh all-period overview:
- avg_order_value = `6653`
- avg_profit_per_order = `211`

No decimal comma remains for those money fields at the RPC source.

## UI V1.27

The web does NOT implement name-capitalization logic.
Names come from normalized DB data.

UI only handles display-only fractional results such as normalized `/30 ngày` calculations:
- `fmt()` truncates before formatting
- `MoneyInput` truncates before formatting

Cache namespace bumped:
- current: `taphoa_ui_cache_v27_<uid>`
- previous v25 cache removed for current user

Frontend verification:
- required V1.27 contract: PASS
- TSX parse errors: 0
- V1.26 → V1.27 diff hunks: 4
- business API occurrence counts unchanged

## Reconciliation after migration

customer_daily_summary:
- 9/9 mismatch counts = 0

Existing summaries:
- customer_summary mismatch = 0
- customer_product_summary mismatch = 0
- daily_summary mismatch = 0

## Artifact

- File: `TAPHOA_SUPABASE_V1_27.html`
- Bytes: 199731
- SHA-256: `12d1cbe2dbf8f32507c8044329c52c5ab3b042b898af7c5481286931a047a983`
