# TAPHOA.XYZ Classic UI Restoration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the current TAPHOA.XYZ frontend to the user-approved classic `5555_fixed(1).html` visual language and interaction rhythm while preserving current Supabase/business behavior.

**Architecture:** Keep the modular vanilla-JS screens and current API/state contracts. Add one shared classic visual layer, then adapt screen markup where the classic geometry requires it. Search inputs remain stable/native; order image sharing is isolated to a receipt/share utility and never mutates data.

**Tech Stack:** HTML, CSS, ES modules, Node test runner, current Supabase API layer, browser `navigator.share`, html2canvas for receipt capture.

**Spec:** `docs/superpowers/specs/2026-09-15-taphoaxyz-classic-ui-restoration-design.md`

## Global Constraints

- TAPHOA.XYZ only; no SHOP88 rules or layout.
- Preserve current Supabase auth, TAPHOA namespaced APIs, permissions, sync, snapshots, and order/debt semantics.
- Do not restore Google Apps Script/Google Sheet APIs or retired mock/localStorage business data.
- Search input nodes must stay mounted while typing; no synthetic input commits.
- Mobile is compact one-column; desktop gets a distinct wider composition where useful.
- Main remains untouched until branch tests and CI are green.

---

### Task 1: Classic visual foundation and shell

**Files:**
- Create: `src/styles/classic.css`
- Modify: `index.html`
- Modify: `src/styles/shell.css`
- Test: `tests/classic-ui-contract.test.js`

**Interfaces:**
- Consumes: existing `.app-shell`, `.app-topbar`, `.app-nav`, `.screen-host`, account-sheet markup.
- Produces: classic CSS tokens and shared surface classes/overrides used by all screen tasks.

- [ ] **Step 1: Write the failing test** asserting classic color tokens, classic stylesheet load order, compact top nav, and blue→teal seller surface hooks.
- [ ] **Step 2: Run `npm test -- tests/classic-ui-contract.test.js` and verify RED.**
- [ ] **Step 3: Add `classic.css`, load it after screen styles but before scroll ownership, and align shell/account surfaces with the classic reference.**
- [ ] **Step 4: Run the focused test and full `npm test`; verify GREEN.**
- [ ] **Step 5: Commit `feat: restore TAPHOA classic visual foundation`.**

### Task 2: Restore classic Sales composition and native search behavior

**Files:**
- Modify: `src/screens/sales.js`
- Modify: `src/styles/sales.css`
- Modify: `src/styles/classic.css`
- Test: `tests/sales-classic-layout.test.js`
- Test: existing search/IME regression tests

**Interfaces:**
- Consumes: current Sales state, permissions, cart/order actions, `filterProducts`.
- Produces: classic region order `seller strip -> search -> groups -> products`, mobile cart sheet, desktop products/cart split, stable native search node.

- [ ] **Step 1: Write failing layout tests** for classic seller strip, search/group strip, compact rows, desktop split, and stable search DOM.
- [ ] **Step 2: Run focused tests and verify RED.**
- [ ] **Step 3: Adjust Sales markup/CSS only; preserve existing action handlers and business payloads. Search updates visibility/state without replacing the input or product-list markup.**
- [ ] **Step 4: Run Sales/IME tests and full `npm test`; verify GREEN.**
- [ ] **Step 5: Commit `feat: restore classic sales workspace`.**

### Task 3: Classic Delivered/Pending cards and detail tables

**Files:**
- Modify: `src/screens/delivered.js`
- Modify: `src/screens/pending.js`
- Modify: `src/styles/delivered.css`
- Modify: `src/styles/pending.css`
- Modify: `src/styles/classic.css`
- Test: `tests/order-detail-classic.test.js`

**Interfaces:**
- Consumes: existing order objects/actions and current overlay/detail state.
- Produces: compact classic order cards and detail surfaces with `TÊN | Đ.GIÁ | SL | T.TIỀN`, quantity summary, total summary, and current action semantics.

- [ ] **Step 1: Write failing detail/card structure tests.**
- [ ] **Step 2: Run focused tests and verify RED.**
- [ ] **Step 3: Rework only presentation markup/CSS; keep current edit/delete/complete behaviors and permissions.**
- [ ] **Step 4: Run focused tests plus full `npm test`; verify GREEN.**
- [ ] **Step 5: Commit `feat: restore classic order cards and details`.**

### Task 4: Share order detail as image

**Files:**
- Create: `src/core/share-receipt.js`
- Modify: `index.html`
- Modify: `src/screens/delivered.js`
- Modify: `src/screens/pending.js`
- Modify: `src/styles/classic.css`
- Test: `tests/share-receipt.test.js`

**Interfaces:**
- Produces: `shareReceiptImage(element,{fileName,title,text}) -> Promise<{shared:boolean,downloaded:boolean}>`.
- Consumes: a dedicated receipt DOM node from order detail; browser `html2canvas`, `navigator.share`, `navigator.canShare`.

- [ ] **Step 1: Write failing tests** for share-first behavior, abort handling, and fallback image path.
- [ ] **Step 2: Run focused tests and verify RED.**
- [ ] **Step 3: Add html2canvas load + isolated share utility; wire `Chia sẻ ảnh` buttons to receipt nodes.**
- [ ] **Step 4: Run focused tests and full `npm test`; verify GREEN.**
- [ ] **Step 5: Commit `feat: restore order image sharing`.**

### Task 5: Classic Debt and account/profile surfaces

**Files:**
- Modify: `src/screens/debt.js`
- Modify: `src/styles/debt.css`
- Modify: `src/styles/classic.css`
- Modify: `src/styles/shell.css`
- Test: `tests/classic-debt-account.test.js`

**Interfaces:**
- Consumes: current debt calculation/action contracts and account-sheet behavior.
- Produces: classic compact debt list/detail and profile/account presentation without adding retired mutations.

- [ ] **Step 1: Write failing visual-structure tests.**
- [ ] **Step 2: Run focused tests and verify RED.**
- [ ] **Step 3: Apply classic list/detail/account geometry while preserving debt logic and logout/auth behavior.**
- [ ] **Step 4: Run focused tests and full `npm test`; verify GREEN.**
- [ ] **Step 5: Commit `feat: restore classic debt and profile surfaces`.**

### Task 6: Full verification and preview PR

**Files:**
- Review all changed files
- No business-schema changes expected

**Interfaces:**
- Produces: one reviewable PR/preview branch; no main merge until verification.

- [ ] **Step 1: Run full `npm test` and production build command used by CI.**
- [ ] **Step 2: Open PR from `feature/restore-taphoaxyz-classic-ui` to `main`.**
- [ ] **Step 3: Wait for all repository workflows; inspect any failure logs and fix only branch.**
- [ ] **Step 4: Review PR diff for backend/business-scope drift and confirm none.**
- [ ] **Step 5: Report preview/PR status; merge only after green verification and user approval or an already-explicit merge instruction.**
