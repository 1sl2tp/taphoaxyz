# TAPHOA Tailwind Retail UX Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign TAPHOA's existing four business screens into one coherent, touch-first, data-dense Tailwind v4 UI system without changing any business flow or backend behavior.

**Architecture:** Keep every existing screen module and business handler. Add semantic UI roles directly to generated markup, keep current data selectors stable, and make Tailwind v4 the final visual owner. Retain `scroll-owner.css` only for scroll ownership; use the existing shared icon registry rather than adding a competing icon family.

**Tech Stack:** Vanilla ES modules, Tailwind CSS v4 CLI, Node test runner, existing Supabase/RPC runtime.

**Spec:** `docs/superpowers/specs/2026-09-16-taphoa-tailwind-retail-ux-redesign-design.md`

## Global Constraints

- Work on `main` because the user explicitly requested direct main updates.
- Do not change business logic, Supabase, RPC, data model, order/debt semantics, search semantics, print, or share behavior.
- Preserve MAIN → popup flow on mobile and desktop.
- Tailwind v4 remains the final visual owner.
- Minimum interactive target is 44×44px; important actions prefer 48px.
- Functional text must not use 8–9px sizes.
- No visible UI emoji in the four business screens.
- Preserve stable Sales search input and Vietnamese IME behavior.
- `DESIGN_VARIANCE=2`, `MOTION_INTENSITY=1`, `VISUAL_DENSITY=8`.

---

### Task 1: Lock the redesign contract

**Files:**
- Create: `tests/tailwind-retail-ux-contract.test.js`
- Read: `src/styles/taphoa-tailwind.input.css`
- Read: `src/screens/sales.js`
- Read: `src/screens/delivered.js`
- Read: `src/screens/pending.js`
- Read: `src/screens/debt.js`
- Read: `src/core/semantic-ui.js`

**Interfaces:**
- Consumes: existing screen class/data selectors.
- Produces: regression contract for semantic role classes, no UI emoji, typography/touch tokens, popup levels and flow preservation.

- [ ] **Step 1: Write the failing contract tests**

Create tests that assert:
```js
assert.match(css,/--tap-density:\s*8/);
assert.match(css,/--tap-motion-fast:/);
assert.match(css,/\.ui-summary\s*\{/);
assert.match(css,/\.ui-table-head\s*\{/);
assert.match(css,/\.ui-form\s*\{/);
assert.match(css,/\.ui-action-secondary\s*\{/);
assert.match(css,/@media\s*\(prefers-reduced-motion:\s*reduce\)/);
```

Assert all four screen markup files contain stable semantic classes and do not contain visible UI emoji glyphs such as `🛒`, `✅`, `⏳`, `📝`, `🗑️`, `📦`, `⚠️`, `💚`, `⚡`, `💵`, `📌`, `🖼️`.

- [ ] **Step 2: Run tests and verify RED**

Run:
```bash
npm test
```
Expected: new redesign-contract assertions fail while existing business tests remain green.

- [ ] **Step 3: Commit RED test**

```bash
git add tests/tailwind-retail-ux-contract.test.js
git commit -m "test: lock retail UX redesign contract"
```

---

### Task 2: Rebuild the Tailwind foundation and shell hierarchy

**Files:**
- Modify: `src/styles/taphoa-tailwind.input.css`
- Modify: `index.html` only if old visual-owner links conflict.
- Test: `tests/tailwind-retail-ux-contract.test.js`
- Test: existing shell/UI contracts.

**Interfaces:**
- Consumes: existing DOM class names and semantic `ui-*` classes.
- Produces: tokens and reusable component classes used by all screens.

- [ ] **Step 1: Add foundation tokens**

Add exact families for surface, text, divider, spacing, radius, touch, z-index and motion. Include:
```css
--tap-density:8;
--tap-motion-fast:100ms;
--tap-motion-normal:140ms;
--tap-touch:44px;
--tap-touch-lg:48px;
```

- [ ] **Step 2: Add semantic components**

Implement `.ui-context`, `.ui-summary`, `.ui-table`, `.ui-table-head`, `.ui-row`, `.ui-form`, `.ui-action-group`, `.ui-action-primary`, `.ui-action-secondary`, `.ui-action-danger`, `.ui-popup-l1`, `.ui-popup-l2`.

- [ ] **Step 3: Add reduced-motion and accessible focus**

Use `prefers-reduced-motion: reduce` to disable nonessential transitions. Keep browser zoom enabled and coarse-pointer input text at 16px.

- [ ] **Step 4: Normalize shell typography/touch**

Override legacy shell values so nav labels are 12–13px, account control is ≥44px and the shell uses the same neutral token family.

- [ ] **Step 5: Run UI contracts and full tests**

```bash
npm run ui:build
npm test
```
Expected: foundation contract passes; existing behavior tests remain green.

- [ ] **Step 6: Commit foundation**

```bash
git add src/styles/taphoa-tailwind.input.css src/styles/taphoa-tailwind.css index.html tests/tailwind-retail-ux-contract.test.js
git commit -m "feat: rebuild TAPHOA Tailwind UI foundation"
```

---

### Task 3: Make semantic roles explicit in screen markup

**Files:**
- Modify: `src/screens/sales.js`
- Modify: `src/screens/delivered.js`
- Modify: `src/screens/pending.js`
- Modify: `src/screens/debt.js`
- Modify: `src/core/semantic-ui.js`
- Test: `tests/tailwind-retail-ux-contract.test.js`

**Interfaces:**
- Consumes: existing business `data-*` selectors.
- Produces: stable semantic classes directly in markup; runtime decorator remains compatibility/a11y support rather than visual-structure owner.

- [ ] **Step 1: Add semantic classes without changing selectors**

Examples:
```html
<section class="sales-screen ui-main" ...>
<header class="sales-pinned-head ui-context ui-toolbar">
<div class="sales-product-list ui-table">
<article class="sales-product-row ui-row">
```

Use equivalent roles in Delivered, Pending and Debt.

- [ ] **Step 2: Tag table headers, summaries, forms and action groups**

Add `.ui-table-head`, `.ui-summary`, `.ui-form`, `.ui-action-group` to their real owners.

- [ ] **Step 3: Remove visible UI emoji from source markup**

Leave plain labels. Shared icon runtime inserts visual icons for controls where needed.

- [ ] **Step 4: Keep runtime decorator idempotent**

Update `semantic-ui.js` role lists so it never makes a data row look like an action and never rewrites already-correct static roles unnecessarily.

- [ ] **Step 5: Run tests**

```bash
npm test
```
Expected: no business selector regressions; no UI emoji contract failures.

- [ ] **Step 6: Commit semantic markup**

```bash
git add src/screens src/core/semantic-ui.js tests/tailwind-retail-ux-contract.test.js
git commit -m "refactor: encode semantic UI roles in screen markup"
```

---

### Task 4: Redesign Sales MAIN and Cart

**Files:**
- Modify: `src/styles/taphoa-tailwind.input.css`
- Modify: `src/screens/sales.js` only for display structure/copy, never handlers.
- Test: existing Sales search/IME/layout tests.

**Interfaces:**
- Consumes: Sales markup and stable data selectors.
- Produces: context row → search → groups → product rows; Cart popup level 1.

- [ ] **Step 1: Lock Sales context geometry**

Customer and cart on first row; search second; groups third. At ≤359px allow metadata to collapse before primary customer/cart controls.

- [ ] **Step 2: Redesign product rows**

Name supports two lines; price/unit metadata uses 13–15px; quantity control remains explicit and axis-stable.

- [ ] **Step 3: Redesign cart as real table**

Sticky table head, aligned numeric columns, compact notes below product name, summary strip and action footer.

- [ ] **Step 4: Preserve search stability**

Do not modify the input handler that only calls `applySalesSearchVisibility`.

- [ ] **Step 5: Verify Sales contracts**

```bash
node --test tests/ime-input-stability.test.js tests/sales-search-*.test.js tests/sales-classic-layout.test.js
npm test
```
Expected: all pass.

- [ ] **Step 6: Commit Sales**

```bash
git add src/styles/taphoa-tailwind.input.css src/styles/taphoa-tailwind.css src/screens/sales.js
git commit -m "feat: redesign Sales touch layout and cart"
```

---

### Task 5: Redesign Delivered MAIN and shared order-detail geometry

**Files:**
- Modify: `src/styles/taphoa-tailwind.input.css`
- Modify: `src/screens/delivered.js` display markup only.
- Modify: `src/core/ui-system.js` only for icon/status decoration if necessary.

**Interfaces:**
- Produces: filter context, summary table, customer-first order rows, popup level 1 detail and level 2 print.

- [ ] **Step 1: Make filter/context compact and stable**
- [ ] **Step 2: Style summary as table, not card stack**
- [ ] **Step 3: Make customer name + total the primary order-row axis**
- [ ] **Step 4: Normalize detail popup structure**
- [ ] **Step 5: Keep print/share and edit/delete handlers unchanged**
- [ ] **Step 6: Run delivered and full tests**

```bash
node --test tests/delivered-escape-regression.test.js tests/*.test.js
```

- [ ] **Step 7: Commit Delivered**

```bash
git add src/styles/taphoa-tailwind.input.css src/styles/taphoa-tailwind.css src/screens/delivered.js src/core/ui-system.js
git commit -m "feat: redesign Delivered data and detail hierarchy"
```

---

### Task 6: Redesign Pending MAIN, Source detail and Order detail

**Files:**
- Modify: `src/styles/taphoa-tailwind.input.css`
- Modify: `src/screens/pending.js` display markup only.

**Interfaces:**
- Produces: pending heading/count, source summary navigation table, customer-first order rows, shared order-detail geometry, source popup, print popup.

- [ ] **Step 1: Separate page heading from destructive bulk action**
- [ ] **Step 2: Treat source summary rows as data navigation rows**
- [ ] **Step 3: Prioritize customer name over order ID**
- [ ] **Step 4: Share order-detail visual geometry with Delivered**
- [ ] **Step 5: Keep source/order/print handlers unchanged**
- [ ] **Step 6: Run pending/full tests**
- [ ] **Step 7: Commit Pending**

```bash
git add src/styles/taphoa-tailwind.input.css src/styles/taphoa-tailwind.css src/screens/pending.js
git commit -m "feat: redesign Pending source and order hierarchy"
```

---

### Task 7: Redesign Debt as summary → form → ledger

**Files:**
- Modify: `src/styles/taphoa-tailwind.input.css`
- Modify: `src/screens/debt.js` display markup only.

**Interfaces:**
- Produces: neutral summary strip, distinct quick form, grouped customer ledger, popup level 1 customer ledger, popup level 2 linked order.

- [ ] **Step 1: Flatten debt summary into a strip**
- [ ] **Step 2: Make quick transaction area unmistakably a form**
- [ ] **Step 3: Keep semantic color on balances only**
- [ ] **Step 4: Normalize customer detail ledger**
- [ ] **Step 5: Normalize linked order popup as level 2**
- [ ] **Step 6: Run debt/full tests**

```bash
node --test tests/debt-row-geometry.test.js tests/iphone-empty-debt-detail.test.js tests/*.test.js
```

- [ ] **Step 7: Commit Debt**

```bash
git add src/styles/taphoa-tailwind.input.css src/styles/taphoa-tailwind.css src/screens/debt.js
git commit -m "feat: redesign Debt summary form and ledger"
```

---

### Task 8: Responsive, accessibility and source-guideline audit

**Files:**
- Modify: `src/styles/taphoa-tailwind.input.css`
- Modify: tests only for genuine new contracts.

**Interfaces:**
- Produces: final breakpoint and accessibility guarantees.

- [ ] **Step 1: Implement breakpoint gates**

Explicitly protect 280, 320, 390, 480, 760/761, 999/1000, 1280 and 1440 behavior.

- [ ] **Step 2: Audit touch targets and labels**

All true controls ≥44px. Inputs ≥16px on coarse pointer. Icon-only controls have labels.

- [ ] **Step 3: Audit card soup, emoji, shadow and color use**

Search screen source and Tailwind CSS for regressions.

- [ ] **Step 4: Audit popup depth and safe-area**

Level 1 and 2 must differ; headers/actions remain stable while body scrolls.

- [ ] **Step 5: Build and run full local contract suite**

```bash
npm run ui:build
npm test
npm run build:production
```
Expected: exit 0 for all commands.

- [ ] **Step 6: Verify GitHub gates on the exact final commit**

Required:
- V1.28 build check — success
- V1.29 security check — success
- TAPHOA data read check — success
- TAPHOA scroll owner check — success
- TAPHOA independent core TDD — success
- TAPHOA production cutover smoke — success

- [ ] **Step 7: Verify publish marker**

`version.json.build_id` must point to the final UI/business commit, not an intermediate commit.

- [ ] **Step 8: Final report**

Report exact head SHA, test counts, workflow conclusions and any browser-only visual QA still requiring a real-device screenshot.