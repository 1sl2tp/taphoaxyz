# Direct Sheet Mutations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Web create/update/delete source and product operations complete in one request by writing Google Sheets and Supabase together, while keeping Sheet identity authoritative and the existing worker/cron only as repair.

**Architecture:** Extend `taphoa-sheet-sync` with authenticated direct mutation actions. Each action acquires the existing sync lock, mutates the canonical Sheet first, then finalizes Supabase state before replying. Product create writes A:D atomically after reserving the Sheet-owned code; existing products update A:D by immutable code. Existing queue/cron paths remain as recovery for old pending work and inbound Sheet edits.

**Tech Stack:** Supabase Edge Functions (Deno/TypeScript), Supabase Postgres/RPC, Google Sheets v4 API, vanilla browser JS, Node test runner.

**Spec:** User-approved architecture in chat: Web → one backend action → Sheet + Supabase; Sheet remains authority for `Mã SP` and `sheetId`; A:B:C:D is one record.

## Global Constraints

- Google Sheet is authoritative for final product code and source `sheetId`.
- Supabase must never invent a final product code independently of the Sheet counter.
- Product create/update must write A:D as one snapshot, never field-by-field.
- Existing worker/cron remains available as repair/reconciliation.
- Core source delete protection remains unchanged.
- Existing five core source identities remain unchanged.

---

### Task 1: Direct mutation contract

**Files:**
- Create: `tests/taphoa-direct-sheet-mutations.test.js`
- Modify: `supabase/functions/taphoa-sheet-sync/index.ts`

**Interfaces:**
- Consumes: authenticated admin request to the edge function.
- Produces: `{action:'create_product'|'update_product'|'delete_product'|'create_source'|'delete_source', payload:{...}}` request contract and a completed result.

- [ ] Write failing static contract tests requiring direct actions, Sheet-first A:D writes, Sheet code reservation, and source sheet creation/deletion.
- [ ] Verify the new test fails against the current worker.
- [ ] Implement direct action handlers under the existing sync lock.
- [ ] Verify the direct action test passes.

### Task 2: Browser uses direct actions

**Files:**
- Modify: `src/core/supabase.js`
- Modify: `src/core/business.js`
- Modify: `src/fixed-production-bridge.js`
- Modify: `src/fixed-product-persistence.js`
- Test: `tests/taphoa-direct-sheet-mutations.test.js`

**Interfaces:**
- Consumes: Edge Function direct mutation actions.
- Produces: bridge methods returning final Sheet-backed source/product state in one awaited request.

- [ ] Add failing contracts requiring business/bridge direct mutation invocation.
- [ ] Verify RED.
- [ ] Route create/update/delete source/product to direct actions and refresh local state after success.
- [ ] Make product row persistence send one row snapshot after source selection / focusout, with a short debounce so B:C:D:source settle together.
- [ ] Verify GREEN.

### Task 3: Sheet-side inbound webhook artifact

**Files:**
- Create: `apps-script/TAPHOA_REALTIME_V15_DIRECT.gs`
- Extend: `supabase/functions/taphoa-sheet-sync/index.ts`
- Test: `tests/taphoa-direct-sheet-mutations.test.js`

**Interfaces:**
- Consumes: onEdit/onChange payloads from Manager Sheet.
- Produces: direct Supabase reconciliation without waiting for cron; cron remains repair.

- [ ] Add failing tests requiring `sheet_row_upsert` and `sheet_sources_reconcile` webhook actions.
- [ ] Verify RED.
- [ ] Implement webhook handlers using a dedicated secret header.
- [ ] Add bounded Apps Script V15 with onEdit batching of A:D row snapshots and onChange source reconciliation.
- [ ] Verify GREEN.

### Task 4: Production verification

**Files:**
- No new feature files.

- [ ] Run production build and all relevant tests.
- [ ] Deploy the edge function.
- [ ] Verify a controlled product create returns final code and appears in both Supabase and the correct Sheet row with A:D complete.
- [ ] Verify update and delete complete without pending queue dependence.
- [ ] Verify source create/delete returns final `sheetId` / deleted state immediately.
- [ ] Keep cron/worker enabled and verify no duplicate row is created on its next run.
