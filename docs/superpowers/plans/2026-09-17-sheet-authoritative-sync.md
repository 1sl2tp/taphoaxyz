# Sheet-Authoritative Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Web ↔ Supabase ↔ management Sheet fully multi-directional while keeping final product codes and source identities authoritative in the Sheet.

**Architecture:** Supabase stores pending mutation requests and canonical cache, while the Edge worker reconciles against Google Sheet tabs identified by `sheetId`. Product rows carry hidden O/P sync markers; new products remain pending until the Sheet-side allocator gives them a final code.

**Tech Stack:** Vanilla JS, Supabase/Postgres RPC, Supabase Edge Functions (Deno/TypeScript), Google Sheets API, existing Node contract tests.

**Spec:** `docs/superpowers/specs/2026-09-17-sheet-authoritative-sync-design.md`

## Global Constraints

- Work directly on `main` per explicit user instruction.
- Supabase must never allocate final `Mã SP`.
- Google Sheet tab `sheetId` is canonical source identity; title is display text only.
- Existing five source tabs/codes remain unchanged.
- Existing NCC/Manager Apps Script A:C sync remains untouched.
- All Web create/delete operations are idempotent via UUID request ids.
- Destructive source deletion is blocked when active/pending products exist.
- System tabs beginning `__` and `Lịch sử giá` are not product sources.

---

### Task 1: Contract tests for Sheet authority

**Files:**
- Modify: `tests/taphoa-product-realtime-sync-contract.test.js`

**Interfaces:**
- Consumes: current worker/migrations/bridge.
- Produces: failing contract assertions for dynamic `sheetId` sources, pending create requests, delete operations, O/P markers, and no Supabase final-code allocator.

- [ ] **Step 1: Write failing assertions** for `management_sheet_id`, pending product/source request tables, `operation in ('upsert','delete')`, dynamic Sheets metadata enumeration, O/P markers, and removal of hardcoded final `SP-` allocator.
- [ ] **Step 2: Run** `node --test tests/taphoa-product-realtime-sync-contract.test.js` and confirm failures are specifically the missing new sync features.
- [ ] **Step 3: Commit** the red contract.

### Task 2: Supabase reconciliation schema and RPCs

**Files:**
- Create: `supabase/migrations/20260917130000_taphoa_sheet_authoritative_identity.sql`

**Interfaces:**
- Consumes: existing `taphoa_sources`, `taphoa_products`, revisions, outbox.
- Produces: `taphoa_sources.management_sheet_id`, `sync_status`; `taphoa_product_create_requests`; `taphoa_source_sync_requests`; RPCs for Web product/source create/delete/update using pending requests; service-role finalization helpers.

- [ ] **Step 1: Add schema/RPC assertions** to the contract and confirm red.
- [ ] **Step 2: Implement migration** with idempotent request tables and source sheet-id backfill hooks.
- [ ] **Step 3: Replace final-code allocation in `taphoa_update_product_from_web`**: local `SPnnn` placeholders create/update `taphoa_product_create_requests`; real codes update canonical product and outbox.
- [ ] **Step 4: Make Web delete enqueue tombstones** instead of immediately losing canonical Sheet intent.
- [ ] **Step 5: Make source create/delete pending Sheet operations** and keep core-source protection.
- [ ] **Step 6: Run contract tests** and SQL static tests.
- [ ] **Step 7: Apply migration to production** and read back schema/functions.
- [ ] **Step 8: Commit**.

### Task 3: Dynamic Google Sheet worker

**Files:**
- Modify: `supabase/functions/taphoa-sheet-sync/index.ts`

**Interfaces:**
- Consumes: pending requests, canonical products, source rows keyed by `management_sheet_id`.
- Produces: dynamic tab reconciliation, source create/delete, product create/finalize/delete, row hash ACK.

- [ ] **Step 1: Add worker contract assertions** for `spreadsheets.get`, `addSheet`, `deleteSheet`, O/P markers, blank-A pending append, and dynamic source map.
- [ ] **Step 2: Remove hardcoded `SOURCES` as authority**; enumerate workbook metadata and reconcile eligible tabs by `sheetId`.
- [ ] **Step 3: Process pending source create** with `addSheet`, A:D/O:P headers, hidden O:P, frozen header, then persist returned `sheetId`.
- [ ] **Step 4: Process pending source delete** only after product safety checks; delete tab and acknowledge Supabase.
- [ ] **Step 5: Process Web product create**: append blank A + B:D + O/P marker, allocate final code from workbook-side counters/prefix state, freeze code, finalize canonical product.
- [ ] **Step 6: Process blank-code Sheet-created rows** through the same Sheet-side allocator before import.
- [ ] **Step 7: Process product update/delete outbox** by canonical marker/code; delete row for tombstone and ACK only when absent.
- [ ] **Step 8: Inbound scan A:P** and reconcile rename/move/edit/delete without row-number identity assumptions.
- [ ] **Step 9: Run contract tests/build/full suite**.
- [ ] **Step 10: Deploy Edge function** and run a forced no-op production sync.
- [ ] **Step 11: Commit**.

### Task 4: Web pending-state integration and immediate worker kick

**Files:**
- Modify: `src/core/supabase.js`
- Modify: `src/core/business.js`
- Modify: `src/core/app-state.js`
- Modify: `src/fixed-production-bridge.js`
- Modify: `src/fixed-product-persistence.js`
- Modify: `src/fixed-ui-runtime-2.js`

**Interfaces:**
- Consumes: pending-product/source RPC responses and Edge worker.
- Produces: editor rows surviving refresh while pending; best-effort immediate Sheet sync after mutations.

- [ ] **Step 1: Add failing browser/static contract assertions** for pending products/sources and `functions.invoke('taphoa-sheet-sync')`.
- [ ] **Step 2: Add gateway `invoke`** and business sync helper.
- [ ] **Step 3: Extend app state** with pending product/source data included only for admin product editor.
- [ ] **Step 4: Bridge mutations** so create/update/delete invoke the worker best-effort, then refresh products.
- [ ] **Step 5: Persistence keeps `TMP-*` rows editable** until final code arrives; finalized refresh replaces them by marker/client request mapping.
- [ ] **Step 6: Source picker reflects pending/active custom sources and deletion errors cleanly.
- [ ] **Step 7: Run tests/build/full suite**.
- [ ] **Step 8: Commit**.

### Task 5: Workbook tracking fields and baseline backfill

**Files/Resources:**
- Management Sheet `1hGqAzIEqTMmULIeh5sCmed2R3XaiA9QZavtGRdNvyyU`

**Interfaces:**
- Consumes: current 5 source tabs and hidden `__SYNC`.
- Produces: O/P hidden marker/hash columns; `__SYNC` registry columns; seeded source sheet IDs/prefix counters.

- [ ] **Step 1: Confirm backup exists** before mutation.
- [ ] **Step 2: Add `__SYNC` registry headers after K** without removing existing data.
- [ ] **Step 3: Set O1/P1 headers on five source tabs**, populate canonical markers for existing products, and hide O:P.
- [ ] **Step 4: Seed source registry** with actual `sheetId`, source key/title, established prefix and maximum issued suffix.
- [ ] **Step 5: Read back sample rows and metadata** to verify no A:D business data changed.

### Task 6: Production end-to-end proof

**Files/Resources:** production Supabase + management Sheet + published main.

**Interfaces:** validates all prior tasks.

- [ ] **Step 1: Verify CI/security/publish are green** for final main SHA.
- [ ] **Step 2: Create a custom test source via RPC/Web-equivalent**, invoke worker, verify a real Sheet tab exists and Supabase has its `sheetId`.
- [ ] **Step 3: Create one pending product**, invoke worker, verify Sheet row gets a Sheet-allocated final code, Supabase finalizes to that code, and no duplicate row exists.
- [ ] **Step 4: Edit its name/cost/sale**, verify Supabase and Sheet converge with matching hash.
- [ ] **Step 5: Delete product**, verify row disappears and Supabase tombstone remains inactive.
- [ ] **Step 6: Delete custom source**, verify tab disappears and source becomes inactive.
- [ ] **Step 7: Clean test records/tabs** and verify existing active canonical product count/data remain intact except for intentional prior user test rows.
- [ ] **Step 8: Report exact evidence, remaining limitations, and final live state.**
