# TAPHOA retired generic data reset evidence

Date: 2026-09-15
Supabase project: `gcnoahqsrquxkwkjbuxy`

## Scope

The reset retired only the old generic TAPHOA business dependency graph. Shared V21 identity, Chat state, and the new `taphoa_*` namespace were outside the mutation set. FK discovery required explicit dependency-ordered deletes instead of the original six-table truncate draft.

## Pre-reset generic counts

| Table | Rows |
| --- | ---: |
| accounts | 41 |
| sessions | 4 |
| products | 649 |
| product_sources | 5 |
| orders | 421 |
| order_items | 2258 |
| debts | 643 |
| daily_summary | 50 |
| customer_summary | 40 |
| customer_daily_summary | 424 |
| customer_product_summary | 1329 |

Before deleting old products, 4 existing `chat_order_draft_lines` rows referenced retired generic `products`; the FK is `ON DELETE SET NULL`, so the draft lines were preserved while the retired product references were cleared.

## Reset order

The executed FK-safe order was:

1. `customer_product_summary`
2. `customer_daily_summary`
3. `customer_summary`
4. `sessions`
5. `debts`
6. `order_items`
7. `orders`
8. `daily_summary`
9. `products`
10. `product_sources`
11. `accounts`

No `CASCADE` was used.

## Immediate post-reset verification

All eleven retired generic tables above returned `0` rows. `chat_order_draft_lines` remained `91` rows and rows still linked to retired products returned `0`.

The new TAPHOA namespace remained populated and operational:

- `taphoa_products = 483`
- `taphoa_sources = 5`
- sheet sync state present and successful
- immediate post-reset `taphoa_orders = 0`
- immediate post-reset `taphoa_order_items = 0`
- immediate post-reset `taphoa_debt_ledger = 0`

## Fresh verification after reset

At `2026-09-15 08:32:11.438587+00`:

- active `v21_accounts = 76`
- active account groups: Admin/other `1`; User/customer `46`; User/friend `7`; User/other `22`
- `taphoa_products = 483`
- `taphoa_sources = 5`
- `taphoa_orders = 1`
- `taphoa_order_items = 1`
- `taphoa_debt_ledger = 0`
- every retired generic table listed above remained `0`

The one new namespaced order/item appeared after the clean reset and is treated as live TAPHOA activity; it is not deleted by the reset migration.

Latest sheet sync evidence:

- management file: `1hGqAzIEqTMmULIeh5sCmed2R3XaiA9QZavtGRdNvyyU`
- `last_success_at = 2026-09-15 07:19:08.409245+00`
- `last_sync_status = success`
- `last_imported_row_count = 483`

## V21 count limitation

A grouped V21 account snapshot was not captured immediately before the manual reset, so this document does not invent a pre/post grouped-count equality claim. The reset SQL contains no mutation of `v21_accounts`, `auth.users`, Chat tables, or `taphoa_*` business tables; the fresh post-reset V21 population is recorded above.

## Migration record

The final repository migration is `supabase/migrations/20260915060000_reset_retired_taphoa_generic_data.sql`. It contains product/source/sheet-sync guards and the exact explicit delete order above. The same migration has been applied to production after the manual reset as a guarded no-op for already-empty retired data, recording the reset in migration history without touching live `taphoa_*` orders.
