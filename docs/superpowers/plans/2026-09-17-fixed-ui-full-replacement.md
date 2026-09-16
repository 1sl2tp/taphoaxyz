# TAPHOA FIXED UI Full Replacement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the entire production frontend with `TAPHOA_GEMINI_100_SAMPLE_FIXED.html` while retaining only the existing Supabase/business layer behind it.

**Architecture:** The FIXED HTML/CSS/JS becomes the sole UI runtime. A new production bridge imports the existing auth/business/state services and translates FIXED UI reads/actions to Supabase. The previous shell, per-screen renderers, and old UI styles are removed after the new runtime is wired and verified.

**Tech Stack:** Static HTML, browser JavaScript, Tailwind CDN as used by the FIXED source, Phosphor Icons, html2canvas, existing Supabase JS/auth/RPC services.

**Spec:** `docs/superpowers/specs/2026-09-17-fixed-ui-full-replacement-design.md`

## Global Constraints
- Work directly on `main` in `1sl2tp/taphoaxyz`.
- `TAPHOA_GEMINI_100_SAMPLE_FIXED.html` is the only UI source of truth.
- Carry over Login + all 5 menus + all FIXED CSS + all FIXED JavaScript UI behavior.
- Keep existing backend/business/auth/data services only; do not keep old UI render paths.
- Remove old UI CSS/JS/screens/contracts after replacement.
- Final `npm test` and `npm run build:production` must pass.

---

### Task 1: Lock the full-replacement contract

**Files:**
- Create: `tests/fixed-ui-full-replacement.test.js`

**Interfaces:**
- Consumes: repository files on disk.
- Produces: a failing contract until FIXED UI is the sole production frontend.

- [ ] **Step 1: Write the failing test** asserting `index.html` contains `loginScreen`, `appContainer`, `topNav`, all five FIXED tab IDs, loads the production bridge, and contains no old `screenHost/appNav/src/app.js` shell.
- [ ] **Step 2: Assert old UI renderer/style paths are absent** after migration.
- [ ] **Step 3: Run the test and confirm it fails against the current mixed UI.**

### Task 2: Add the Supabase production bridge

**Files:**
- Create: `src/fixed-production-bridge.js`
- Reuse: `src/core/auth.js`, `src/core/api.js`, `src/core/app-state.js`, `src/core/snapshot.js`

**Interfaces:**
- Consumes: existing Supabase auth/business services and FIXED UI transport calls.
- Produces: `window.TAPHOA_PRODUCTION` plus a `taphoa://production` fetch transport used by the FIXED runtime.

- [ ] **Step 1: Implement login/restore/logout through existing auth.**
- [ ] **Step 2: Implement bootstrap/domain refresh and translate products/customers/orders/debt into the FIXED row model.**
- [ ] **Step 3: Translate FIXED order/debt commands to `saveOrder`, `deliverOrder`, `reverseOrder`, `deletePending`, `batchOrders`, and `debtTransaction`.**
- [ ] **Step 4: Preserve production permissions/role in the FIXED runtime.**
- [ ] **Step 5: Verify bridge syntax and unit-level mapping helpers.**

### Task 3: Replace production index with the complete FIXED frontend

**Files:**
- Replace: `index.html`

**Interfaces:**
- Consumes: FIXED source HTML/CSS/JS and `src/fixed-production-bridge.js`.
- Produces: the production DOM/runtime for Login and all 5 menus.

- [ ] **Step 1: Copy the complete FIXED HTML structure and all 19 FIXED style blocks.**
- [ ] **Step 2: Copy the complete FIXED main UI JavaScript and FIXED behavior patch.**
- [ ] **Step 3: Remove only preview sample-data/mock transport and point `SheetDB` transport to `taphoa://production`.**
- [ ] **Step 4: Override FIXED login/logout/load hooks to call the production bridge without changing the FIXED presentation.**
- [ ] **Step 5: Keep the `app-build-id` meta required by production build stamping.**
- [ ] **Step 6: Run the replacement contract test and confirm green for the new shell.**

### Task 4: Remove the old frontend completely

**Files:**
- Delete: `src/app.js`
- Delete: `src/screens/sales.js`
- Delete: `src/screens/delivered.js`
- Delete: `src/screens/pending.js`
- Delete: `src/screens/debt.js`
- Delete: `src/screens/settings.js`
- Delete old UI-only files under `src/styles/` including the legacy/classic/chatgpt/per-screen/decorator/tailwind-built styles no longer referenced by FIXED.
- Delete old UI-only core helpers that are no longer imported by production.
- Delete old UI contract/geometry tests that explicitly lock the previous interface.

**Interfaces:**
- Consumes: final imports from Tasks 2-3.
- Produces: no alternate old UI render path.

- [ ] **Step 1: Search production imports and enumerate UI-only files with zero remaining references.**
- [ ] **Step 2: Delete old screens/styles/helpers.**
- [ ] **Step 3: Delete old UI-specific tests that conflict with the FIXED source of truth.**
- [ ] **Step 4: Re-run the replacement contract to prove those paths are gone.**

### Task 5: Simplify build and verify final HEAD

**Files:**
- Modify: `package.json` if the deleted local Tailwind entry/build is no longer needed.
- Keep: production build scripts/data/backend files required by GitHub Pages.

**Interfaces:**
- Consumes: complete FIXED production frontend.
- Produces: deployable `dist` with no dependency on deleted old UI files.

- [ ] **Step 1: Remove obsolete UI build invocation if it depends on deleted legacy Tailwind files.**
- [ ] **Step 2: Run `npm test`.**
- [ ] **Step 3: Run `npm run build:production`.**
- [ ] **Step 4: Verify final `index.html` and `dist/index.html` contain Login + all 5 FIXED tabs and no legacy UI imports.**
- [ ] **Step 5: Verify final GitHub Actions workflow run is green on the resulting `main` HEAD.**
