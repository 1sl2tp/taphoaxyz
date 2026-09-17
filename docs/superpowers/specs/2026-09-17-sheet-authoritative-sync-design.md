# Sheet-Authoritative Product & Source Sync Design

## Goal

Make Web, Supabase, and the Google management workbook behave as one safe multi-directional system without duplicate products, dropped edits, resurrected deletions, or Supabase inventing canonical identities.

## Authority rules

1. **Product canonical identity is owned by the management Sheet.** Supabase must never allocate the final `Mã SP`.
2. **Source canonical identity is the Google Sheet tab `sheetId`.** The tab title is mutable display text; `source_key` in Supabase is only an internal surrogate key.
3. **Supabase is realtime state + queue + reconciliation cache.** It may allocate temporary request IDs only.
4. **Web is an editor.** New products/sources enter Supabase as pending requests and become canonical only after the management workbook acknowledges them.

## Product lifecycle

### Web creates product

Web sends a local placeholder plus name/cost/sale/source. Supabase writes a `pending_create` row with a UUID request id; no final product code is created in `taphoa_products`.

The Sheet worker appends the product into the source tab with:

- A: blank initially
- B: product name
- C: cost in Sheet units
- D: sale price in Sheet units
- O: hidden sync marker `C:<request_id>`
- P: hidden SHA-256 payload hash

The worker then asks the **Sheet-side allocator** to populate A using counters/state stored in the workbook, never a Supabase sequence. Existing source prefixes are preserved; sources without an established prefix use the workbook's generic `SP-` counter. The assigned code is frozen as a value.

On the next read in the same worker pass, `C:<request_id>` + a real A code finalizes the pending request: Supabase inserts/updates the canonical `taphoa_products` row, records the Sheet row/hash, marks the pending request finalized, and the Web refreshes to the real code.

### Sheet creates product

A manually-added product row with B/C/D and no A is first tagged with a hidden sync marker. The worker uses the same Sheet-side allocator to fill A, then imports it as a canonical product. No temporary Supabase product code becomes canonical.

### Existing product edit

A row with a real code is an update. Web edits update Supabase immediately and enqueue a row update; the worker finds the canonical row by code/marker and writes A:D. Sheet edits are detected by row hash and imported to Supabase.

### Delete product

Deletion is a tombstone until both sides acknowledge it. Web delete writes a `pending_delete` mutation; worker removes the canonical Sheet row; only after the row is absent does Supabase mark the product inactive/deleted. If a row is deleted directly in Sheet, the missing canonical marker/code compared to the prior Sheet state creates the same tombstone. Missing rows are never re-created merely because Supabase still has an old copy.

## Source lifecycle

### Web creates source

Supabase creates a pending source request with an internal surrogate `source_key`; it is not canonical yet. Worker creates a new tab in the management workbook, gets the returned Google `sheetId`, writes the A:D headers plus hidden O/P sync columns, freezes the expected layout, and updates Supabase with that `sheetId`. Only then does the source become active/canonical.

### Sheet creates/renames source

The worker enumerates workbook tabs. Any eligible product tab not known by `sheetId` becomes a new canonical source in Supabase. If the same `sheetId` has a new title, only the source display name changes.

System tabs (`__*`, `Lịch sử giá`) are excluded.

### Delete source

Core source tabs remain protected. A custom source can be deleted only when it has no active/pending products. Web delete creates a pending delete request; worker deletes the Sheet tab; Supabase marks the source inactive only after the tab is absent. If a custom tab is deleted directly in Sheet, Supabase follows by `sheetId`.

## Reconciliation fields

### Supabase

- `taphoa_sources.management_sheet_id bigint unique`
- `taphoa_sources.sync_status` and timestamps
- `taphoa_product_create_requests` for pending Web/Sheet creations
- `taphoa_source_sync_requests` for source create/delete requests
- product delete/outbox operation states supporting `upsert` and `delete`
- canonical row/hash state in `taphoa_product_sheet_state`

### Workbook

Use existing hidden `__SYNC` as the workbook-side registry. Add columns after the current K fields for:

- record type
- management `sheetId`
- source surrogate key
- source title
- code prefix/counter scope
- last issued number
- request id
- canonical code
- sync marker/hash/status

Product tabs use hidden columns O/P:

- O = immutable sync marker (`P:<product_code>` or `C:<request_id>`)
- P = row payload hash

These fields move with rows and survive sorting, so reconciliation never depends on row number alone.

## Idempotency / anti-duplication

- Every Web create/delete has a UUID request id.
- Re-running worker on the same request must not append/create/delete twice.
- Canonical products are reconciled by final `Mã SP`; pending creates by `C:<request_id>` marker.
- Sources are reconciled by Google `sheetId`, not title.
- Hash ACKs distinguish worker-written edits from genuine Sheet edits.
- A deleted canonical marker/code remains a tombstone; stale Supabase state cannot resurrect it.

## Realtime behavior

Web mutation commits to Supabase immediately, then best-effort invokes the Sheet worker. Cron remains the retry safety net. The editing browser refreshes the product domain after the worker call; other browsers receive the revision through the existing polling path.

## Compatibility

The five current source tabs and their existing codes remain unchanged. Their current `sheetId` values are backfilled. Existing NCC/Manager Apps Script sync remains untouched for A:C on those five source tabs. New custom sources are management-only unless later explicitly paired with an NCC file.
