# TAPHOA System UI Standardization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Standardize TAPHOA typography, colors, tables, cards, modal/sheet chrome, and action hierarchy across the full web app without changing business/data/permission behavior.

**Architecture:** Keep the existing four screen modules and their screen-scoped geometry. Add one shared UI-system stylesheet for typography/component families, keep visual tokens in `base.css`, and add semantic classes/data roles to current HTML markup so Delivered/Pending/Debt can share one order-detail grammar while Sales/Login/Shell consume the same tokens. Existing scroll-owner and privacy layers remain authoritative and unchanged unless a regression test proves a compatibility adjustment is required.

**Tech Stack:** Static HTML, ES modules, CSS container queries, Node 22 `node:test`, existing GitHub Actions production/build/security/scroll gates.

**Spec:** `docs/superpowers/specs/2026-09-15-taphoa-system-ui-standardization-design.md`

## Global Constraints

- Keep exactly four business screens: Sales, Delivered, Pending, Debt.
- Login/Auth remains outside App Shell.
- Do not change financial, auth, data, permission, mutation, or RPC behavior.
- Screen geometry stays scoped under `data-screen-id`.
- Root/document viewport ownership and iPhone inner-scroll ownership remain intact.
- User privacy remains intact: cost/profit fields stay absent for User.
- Shared visual roles must use semantic tokens; no new parallel core palette.
- Verify relevant geometry at 280, 320, 390, 480, 760/761, 999/1000, 1280, 1440.
- Browser/device verification is a separate final gate; static tests cannot claim it.

---

### Task 1: Lock the shared visual system with a failing contract

**Files:**
- Create: `tests/system-ui-contract.test.js`
- Modify: `src/styles/base.css`
- Create: `src/styles/ui-system.css`
- Modify: `index.html`

**Interfaces:**
- Consumes: existing CSS variables (`--blue`, `--green`, `--red`, etc.) only as compatibility aliases.
- Produces: shared tokens `--ui-*`, semantic typography via `[data-ui-type]`, generic `.ui-*` controls, and shared `.order-detail-*` component classes.

- [ ] **Step 1: Write the failing test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8');

test('shared UI system owns core visual tokens and typography roles',()=>{
  const base=read('src/styles/base.css');
  const ui=read('src/styles/ui-system.css');
  for(const token of ['--ui-page','--ui-panel','--ui-text','--ui-muted','--ui-line','--ui-primary','--ui-success','--ui-warning','--ui-danger']){
    assert.match(base,new RegExp(token.replaceAll('-','\\-')));
  }
  for(const role of ['panel-title','name','body','meta','label','action','money-row','money-key','money-hero','summary-value','summary-total']){
    assert.ok(ui.includes(`[data-ui-type="${role}"]`),`missing typography role ${role}`);
  }
  assert.match(ui,/font-variant-numeric:\s*tabular-nums/);
});

test('index loads shared UI system before screen styles',()=>{
  const html=read('index.html');
  const shared=html.indexOf('./src/styles/ui-system.css');
  const sales=html.indexOf('./src/styles/sales.css');
  assert.ok(shared>0 && shared<sales);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/system-ui-contract.test.js`
Expected: FAIL because `ui-system.css` and `--ui-*` tokens do not yet exist.

- [ ] **Step 3: Add shared tokens and typography/component stylesheet**

Add to `base.css`:

```css
:root{
  --ui-page:#f1f3f4;
  --ui-panel:#fff;
  --ui-surface-soft:#f5f6f7;
  --ui-text:#171717;
  --ui-text-secondary:#525b66;
  --ui-muted:#707a86;
  --ui-line:#e1e4e7;
  --ui-line-strong:#cfd5dc;
  --ui-primary:#1565c0;
  --ui-success:#26735b;
  --ui-warning:#c36b12;
  --ui-danger:#a32920;
  --ui-radius:14px;
  --ui-sheet-radius:20px;
  --ui-control-h:46px;
}
```

Create `ui-system.css` with role floors and generic component families. Minimum required block:

```css
[data-ui-type]{font-family:inherit;font-kerning:normal;word-spacing:normal;text-rendering:optimizeLegibility}
[data-ui-type="panel-title"]{font-size:clamp(14px,4.4cqw,16px);line-height:1.18;font-weight:800}
[data-ui-type="name"]{font-size:clamp(11px,3.35cqw,12px);line-height:1.22;font-weight:600}
[data-ui-type="body"]{font-size:clamp(10.5px,3.1cqw,12px);line-height:1.22;font-weight:500}
[data-ui-type="meta"]{font-size:clamp(9.5px,2.7cqw,10px);line-height:1.3;font-weight:500;color:var(--ui-muted)}
[data-ui-type="label"]{font-size:clamp(9px,2.55cqw,10px);line-height:1.1;font-weight:600;color:var(--ui-muted)}
[data-ui-type="action"]{font-size:clamp(11px,3.2cqw,12px);line-height:1;font-weight:600}
[data-ui-type="money-row"],[data-ui-type="money-key"],[data-ui-type="money-hero"],[data-ui-type="summary-value"],[data-ui-type="summary-total"]{font-variant-numeric:tabular-nums;font-feature-settings:"tnum" 1}
[data-ui-type="money-row"]{font-size:clamp(10.5px,3.1cqw,12px);font-weight:600}
[data-ui-type="money-key"]{font-size:clamp(12.5px,3.65cqw,14px);font-weight:750}
[data-ui-type="money-hero"]{font-size:clamp(17px,4.8cqw,19px);font-weight:800}
[data-ui-type="summary-value"]{font-size:clamp(10.5px,3.05cqw,12px);font-weight:600}
[data-ui-type="summary-total"]{font-size:clamp(13.5px,3.85cqw,15px);font-weight:750}
```

Add `ui-system.css` after `base.css` and before screen CSS in `index.html`.

- [ ] **Step 4: Run the contract test**

Run: `node --test tests/system-ui-contract.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

Commit: `feat: add shared TAPHOA UI system tokens`

---

### Task 2: Normalize shell, login, navigation, account sheet, and Sales

**Files:**
- Modify: `src/styles/shell.css`
- Modify: `src/styles/sales.css`
- Modify: `index.html`
- Modify: `src/screens/sales.js`
- Test: `tests/system-ui-contract.test.js`
- Regression: `tests/mobile-viewport-auth-shell.test.js`, `tests/mobile-gesture-privacy-contract.test.js`, `tests/scroll-owner-contract.test.js`, `tests/sales-price-contract.test.js`

**Interfaces:**
- Consumes: `--ui-*` tokens and typography roles from Task 1.
- Produces: Login/Shell/Sales markup with semantic UI roles while preserving all current IDs, data attributes, permissions, event hooks, and scroll owners.

- [ ] **Step 1: Extend the failing contract**

Add assertions that `shell.css` and `sales.css` reference shared tokens and that markup contains semantic roles:

```js
test('shell and sales consume the shared UI family',()=>{
  const shell=read('src/styles/shell.css');
  const sales=read('src/styles/sales.css');
  const index=read('index.html');
  const salesJs=read('src/screens/sales.js');
  assert.match(shell,/var\(--ui-(?:panel|text|line|primary)/);
  assert.match(sales,/var\(--ui-(?:panel|text|line|primary)/);
  assert.match(index,/data-ui-type="panel-title"/);
  assert.match(salesJs,/data-ui-type="(?:name|money-key|meta)"/);
});
```

- [ ] **Step 2: Run and observe RED**

Run: `node --test tests/system-ui-contract.test.js`
Expected: FAIL on missing role markup/token consumption.

- [ ] **Step 3: Convert Shell/Login visual values to shared tokens**

Keep existing geometry and element IDs. Replace repeated core colors/borders with `--ui-*`; add role attributes to Login heading/account copy where static HTML permits.

- [ ] **Step 4: Convert Sales markup and CSS**

Add semantic role attributes to product name, price, metadata, cart table labels/values/totals. Preserve `sales-products`, `sales-groups`, `sales-cart-body`, quantity controls, User price privacy, and all current data hooks. Replace screen-level generic text/line/panel colors with shared tokens; retain green on plus/success and primary blue for selling price.

- [ ] **Step 5: Run focused regressions**

Run:

```bash
node --test tests/system-ui-contract.test.js tests/mobile-viewport-auth-shell.test.js tests/mobile-gesture-privacy-contract.test.js tests/scroll-owner-contract.test.js tests/sales-price-contract.test.js
```

Expected: PASS.

- [ ] **Step 6: Commit**

Commit: `refactor: align shell and sales with shared UI system`

---

### Task 3: Create one shared order-detail family for Pending, Delivered, and Debt

**Files:**
- Modify: `src/styles/ui-system.css`
- Modify: `src/screens/pending.js`
- Modify: `src/screens/delivered.js`
- Modify: `src/screens/debt.js`
- Modify: `src/styles/pending.css`
- Modify: `src/styles/delivered.css`
- Modify: `src/styles/debt.css`
- Test: `tests/system-ui-contract.test.js`

**Interfaces:**
- Consumes: `.order-detail-*` shared family and semantic typography roles.
- Produces: all three detail surfaces with the same header/context/table/total/action DOM grammar while keeping their existing screen-specific data hooks.

- [ ] **Step 1: Add RED assertions for shared detail grammar**

```js
test('all business order details use the shared five-column family',()=>{
  for(const file of ['src/screens/pending.js','src/screens/delivered.js','src/screens/debt.js']){
    const js=read(file);
    assert.match(js,/order-detail-panel/);
    assert.match(js,/order-detail-title/);
    assert.match(js,/order-detail-context/);
    assert.match(js,/order-detail-head/);
    assert.match(js,/order-detail-lines/);
    assert.match(js,/order-detail-total/);
  }
});

test('detail headings are semantic titles, not raw order ids',()=>{
  const pending=read('src/screens/pending.js');
  const delivered=read('src/screens/delivered.js');
  assert.match(pending,/order-detail-title[^>]*>Đơn tạm</);
  assert.match(delivered,/order-detail-title[^>]*>Đã giao</);
});
```

- [ ] **Step 2: Run and observe RED**

Run: `node --test tests/system-ui-contract.test.js`
Expected: FAIL because screens still use independent detail classes/UUID headings.

- [ ] **Step 3: Add shared detail CSS**

Implement generic classes in `ui-system.css`:

```css
.order-detail-panel{--order-accent:var(--ui-primary);position:relative;background:var(--ui-panel);border-radius:var(--ui-sheet-radius);color:var(--ui-text)}
.order-detail-header{display:grid;grid-template-columns:minmax(0,1fr) auto auto;align-items:center;gap:8px}
.order-detail-title{min-width:0;color:var(--ui-text)}
.order-detail-context{color:var(--ui-text-secondary);min-width:0;overflow:hidden;text-overflow:ellipsis}
.order-detail-head,.order-detail-line{display:grid;grid-template-columns:22px minmax(0,1fr) 34px 56px 64px;gap:4px;align-items:start}
.order-detail-head{border-block:1px dashed var(--ui-line-strong);padding:5px 0;color:var(--ui-muted)}
.order-detail-line{padding:7px 0;border-bottom:1px solid var(--ui-line)}
.order-detail-head>*:nth-child(n+3),.order-detail-line>*:nth-child(n+3){text-align:right}
.order-detail-total{display:flex;align-items:baseline;justify-content:space-between;gap:10px;border-top:1px solid var(--ui-line-strong);padding:10px 0}
.order-detail-total strong{color:var(--order-accent)}
.order-detail-actions{display:grid;gap:8px}
```

Add compact-ID helper markup by preserving full ID in `title`/data and rendering a shortened visible label in context. Do not alter IDs passed to handlers.

- [ ] **Step 4: Convert Pending detail markup**

Visible title becomes `Đơn tạm`; warning chip remains warning. Add shared classes alongside existing `pending-*` data hooks. Remove duplicated generic table styling from `pending.css`; keep only layout/state-specific rules and `--order-accent:var(--ui-warning)`.

- [ ] **Step 5: Convert Delivered detail markup**

Visible title becomes `Đã giao`; keep delivered status semantics. Add shared classes alongside existing data hooks. Move generic five-column/table/total/action styling out of `delivered.css`; keep only delivered-specific state/accent behavior.

- [ ] **Step 6: Convert Debt order detail markup**

Use visible title `Công nợ` or `Đơn công nợ` according to existing host semantics, while preserving customer/order context and debt actions. Add shared classes; keep debt-specific ledger semantics outside the order-detail family.

- [ ] **Step 7: Run contract + screen tests**

Run:

```bash
node --test tests/system-ui-contract.test.js tests/mobile-gesture-privacy-contract.test.js tests/scroll-owner-contract.test.js
```

Expected: PASS and no privacy/scroll regression.

- [ ] **Step 8: Commit**

Commit: `refactor: unify order detail UI family`

---

### Task 4: Normalize summaries, cards, tables, and action hierarchy on Delivered/Pending/Debt

**Files:**
- Modify: `src/styles/delivered.css`
- Modify: `src/styles/pending.css`
- Modify: `src/styles/debt.css`
- Modify: `src/screens/delivered.js`
- Modify: `src/screens/pending.js`
- Modify: `src/screens/debt.js`
- Test: `tests/system-ui-contract.test.js`

**Interfaces:**
- Consumes: shared tokens and semantic roles.
- Produces: consistent summary/table/card/action hierarchy while retaining each screen's semantic status colors and functionality.

- [ ] **Step 1: Add RED assertions against parallel core palettes**

Test that screen CSS uses `var(--ui-...)` for common text/panel/line values and does not redefine the shared page/text/panel palette. Permit literal colors only in screen-specific status accents/gradient where explicitly semantic.

- [ ] **Step 2: Run RED test**

Run: `node --test tests/system-ui-contract.test.js`
Expected: FAIL on current hard-coded `#f7f8fa`, `#1e293b`, `#e2e8f0`, etc.

- [ ] **Step 3: Normalize Delivered**

Use shared panel/page/line/text tokens; apply semantic roles to summary header/value/total/card name/meta/money. Keep active blue and delivered success meaning. Align card radius and border treatment with shared card family.

- [ ] **Step 4: Normalize Pending**

Replace the orange-dominant treatment with neutral shared text/panels. Keep warning on pending title/status chip/accent only. Price/revenue numbers use shared money roles instead of warning color by default. Delete/destructive remains danger.

- [ ] **Step 5: Normalize Debt**

Keep the debt hero gradient as a distinct semantic hero, but align all list cards, labels, typography, borders, order-detail chrome, input/button geometry, and totals with shared roles. Keep owed red and credit/received green.

- [ ] **Step 6: Normalize action hierarchy**

Across all screens, neutral actions use shared outline styling, primary forward action uses filled primary/success as semantically appropriate, destructive uses danger. Do not render four equal-weight footer buttons.

- [ ] **Step 7: Run contract + full maintained tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 8: Commit**

Commit: `refactor: standardize business screen visual hierarchy`

---

### Task 5: Add responsive/geometry guards for the standardized UI

**Files:**
- Modify: `tests/system-ui-contract.test.js`
- Modify: `src/styles/ui-system.css`
- Modify only if necessary: `src/styles/shell.css`, `src/styles/sales.css`, `src/styles/delivered.css`, `src/styles/pending.css`, `src/styles/debt.css`
- Regression: `tests/scroll-owner-contract.test.js`, `tests/mobile-viewport-auth-shell.test.js`

**Interfaces:**
- Consumes: all shared UI families from Tasks 1–4.
- Produces: explicit narrow-container rules that preserve title/actions/table readability without shrinking below typography floors.

- [ ] **Step 1: Add static responsive contracts**

Assert the shared detail family has a mobile container rule and that order titles/context can shrink/ellipsis while controls remain fixed.

- [ ] **Step 2: Add minimal container-query behavior**

At narrow `screen-host` widths, reduce spacing/gaps and context content before reducing required information. Preserve table columns and horizontal meaning; do not use transforms/margins to patch alignment.

- [ ] **Step 3: Verify existing scroll ownership remains unchanged**

Run:

```bash
node --test tests/system-ui-contract.test.js tests/scroll-owner-contract.test.js tests/mobile-viewport-auth-shell.test.js
```

Expected: PASS.

- [ ] **Step 4: Commit**

Commit: `test: lock standardized UI responsive contract`

---

### Task 6: Production build, CI, and review gate

**Files:**
- No business/data files expected.
- Update docs only if implementation deviates from the approved design.

**Interfaces:**
- Consumes: complete standardized UI branch.
- Produces: reviewable PR with green code gates; no claim of iPhone/browser PASS until observed on device.

- [ ] **Step 1: Run full tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 2: Build production artifact**

Run: `npm run build:production`
Expected: exit 0 and `dist/` contains the current modular app/styles.

- [ ] **Step 3: Verify no prohibited business/backend changes**

Review branch diff. Expected: UI/docs/tests only; no Supabase migration/RPC/auth/business mutation changes.

- [ ] **Step 4: Open PR**

Title: `Standardize TAPHOA system UI`
Body must summarize shared tokens/typography/order-detail family, list preserved privacy/scroll constraints, and state that real iPhone visual verification is still required.

- [ ] **Step 5: Wait for all PR workflows**

Required: build, security, data-read, scroll-owner (and any newly triggered maintained gate) are green.

- [ ] **Step 6: Device review checklist**

On `beta.taphoa.xyz`, verify:

```text
280/320/390/480 mobile widths where practical
- Login visual hierarchy
- 4-tab navigation + account sheet
- Sales vertical list scroll and horizontal category rail
- Cart bottom sheet
- Delivered detail table
- Pending detail table + actions
- Debt customer list + debt/order sheets
- User account never sees cost/profit
- Modal title/context/action hierarchy
- No outer document scroll or accidental zoom
```

Do not mark browser/device PASS until this is actually observed.
