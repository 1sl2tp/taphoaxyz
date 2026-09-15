# TAPHOA ChatGPT-Aligned UI System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace TAPHOA's mixed classic/colored chrome with one Chat/ChatGPT-aligned neutral design system while preserving all current TAPHOA layout ownership, Supabase contracts, business flows, and share behavior.

**Architecture:** Add a TAPHOA-owned neutral token layer and shared inline-SVG icon registry, then make the existing `ui-system.js` decorator apply semantic button/icon/popup classes to current DOM rather than rewriting screens. A final `chatgpt-ui.css` layer overrides legacy classic color treatment while preserving classic TAPHOA geometry.

**Tech Stack:** static HTML/CSS, ES modules, Node.js `node:test`, existing TAPHOA modular screen runtime.

**Spec:** `docs/superpowers/specs/2026-09-15-chatgpt-ui-system-design.md`

## Global Constraints

- Scope is only `1sl2tp/taphoaxyz`; no SHOP88 rules or layout.
- Preserve existing Supabase/RPC/data contracts and business semantics.
- Preserve screen geometry, mobile/desktop ownership, scroll ownership, search behavior, and share-image behavior.
- No dark mode in this change.
- No runtime dependency on `1sl2tp/chat`.
- UI actions use shared SVG icons rather than emoji glyphs.
- Primary actions are dark neutral; ordinary secondary actions are neutral/ghost; semantic colors are reserved for status/destructive/success meaning.
- Every implementation task follows RED → minimal GREEN → regression verification.

---

### Task 1: Neutral token layer and stylesheet ordering

**Files:**
- Create: `src/styles/chatgpt-ui.css`
- Modify: `index.html`
- Create: `tests/chatgpt-ui-system-contract.test.js`

**Interfaces:**
- Consumes: existing `--ui-*` variables from `src/styles/base.css`, `src/styles/ui-system.css`, and `src/styles/classic.css`.
- Produces: `--tap-*` neutral tokens plus remapped `--ui-*` aliases consumed by later tasks.

- [ ] **Step 1: Write the failing token/load-order test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8');

test('ChatGPT-aligned TAPHOA token layer is loaded after classic geometry',()=>{
  const html=read('index.html');
  const css=read('src/styles/chatgpt-ui.css');
  assert.match(css,/--tap-bg:\s*#fcfcfc/i);
  assert.match(css,/--tap-text:\s*#0d0d0d/i);
  assert.match(css,/--tap-text-secondary:\s*#5d5d5d/i);
  assert.match(css,/--tap-border:\s*rgba\(0,0,0,\.10\)/i);
  const classicIndex=html.indexOf('./src/styles/classic.css');
  const neutralIndex=html.indexOf('./src/styles/chatgpt-ui.css');
  const scrollIndex=html.indexOf('./src/styles/scroll-owner.css');
  assert.ok(classicIndex>=0&&neutralIndex>classicIndex&&scrollIndex>neutralIndex);
  assert.match(html,/<meta name="theme-color" content="#fcfcfc">/i);
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `node --test tests/chatgpt-ui-system-contract.test.js`

Expected: FAIL because `src/styles/chatgpt-ui.css` does not exist and `theme-color` is still classic blue.

- [ ] **Step 3: Add the minimal token stylesheet and load it**

Create `src/styles/chatgpt-ui.css` beginning with:

```css
:root{
  --tap-bg:#fcfcfc;
  --tap-surface:#fff;
  --tap-surface-subtle:#f9f9f9;
  --tap-surface-hover:#f3f3f3;
  --tap-surface-pressed:#e8e8e8;
  --tap-text:#0d0d0d;
  --tap-text-secondary:#5d5d5d;
  --tap-text-tertiary:#8f8f8f;
  --tap-border:rgba(0,0,0,.10);
  --tap-border-subtle:rgba(0,0,0,.05);
  --tap-border-strong:rgba(0,0,0,.20);
  --tap-primary:#0d0d0d;
  --tap-primary-text:#fff;
  --tap-info:#2c67c5;
  --tap-danger:#c83232;
  --tap-success:#18864b;
  --tap-warning:#a86408;
  --tap-radius-sm:8px;
  --tap-radius-md:12px;
  --tap-radius-lg:16px;
  --tap-radius-pill:999px;
  --tap-shadow-popover:0 12px 32px rgba(0,0,0,.12);

  --ui-page:var(--tap-bg);
  --ui-panel:var(--tap-surface);
  --ui-primary:var(--tap-primary);
  --ui-text:var(--tap-text);
  --ui-text-secondary:var(--tap-text-secondary);
  --ui-muted:var(--tap-text-tertiary);
  --ui-line:var(--tap-border);
  --ui-line-strong:var(--tap-border-strong);
  --ui-surface-soft:var(--tap-surface-subtle);
  --ui-danger:var(--tap-danger);
  --ui-success:var(--tap-success);
  --ui-warning:var(--tap-warning);
}
```

In `index.html`, change theme-color to `#fcfcfc` and insert:

```html
<link rel="stylesheet" href="./src/styles/chatgpt-ui.css">
```

after `classic.css` and before `scroll-owner.css`.

- [ ] **Step 4: Run focused and full tests**

Run:

```bash
node --test tests/chatgpt-ui-system-contract.test.js
npm test
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add index.html src/styles/chatgpt-ui.css tests/chatgpt-ui-system-contract.test.js
git commit -m "feat: add neutral TAPHOA UI tokens"
```

---

### Task 2: Shared inline-SVG icon registry

**Files:**
- Create: `src/core/icons.js`
- Modify: `tests/chatgpt-ui-system-contract.test.js`

**Interfaces:**
- Produces: `icon(name,{size=20,label=null}) -> string` and `ICON_NAMES`.
- Consumers: `src/core/ui-system.js`, shell/account decoration, screen action decoration.

- [ ] **Step 1: Add failing icon contracts**

Append:

```js
import {icon,ICON_NAMES} from '../src/core/icons.js';

test('shared icon registry owns required TAPHOA action glyphs',()=>{
  for(const name of ['search','close','plus','minus','cart','calendar','chevron-left','chevron-right','edit','trash','share','print','check','clock','user','logout','eye','eye-off','more']){
    assert.ok(ICON_NAMES.includes(name),`missing icon ${name}`);
  }
  const svg=icon('share',{size:20});
  assert.match(svg,/^<svg[^>]+viewBox=/);
  assert.match(svg,/width="20"/);
  assert.match(svg,/height="20"/);
  assert.match(svg,/currentColor/);
  assert.match(svg,/aria-hidden="true"/);
});
```

- [ ] **Step 2: Run and verify RED**

Run: `node --test tests/chatgpt-ui-system-contract.test.js`

Expected: FAIL because `src/core/icons.js` does not exist.

- [ ] **Step 3: Implement the registry**

Use a frozen object of SVG body strings and this public renderer:

```js
export const ICON_NAMES=Object.freeze(Object.keys(ICONS));

export function icon(name,{size=20,label=null}={}){
  const body=ICONS[name];
  if(!body)throw new Error(`Unknown UI icon: ${name}`);
  const a11y=label
    ? `role="img" aria-label="${escapeAttr(label)}"`
    : 'aria-hidden="true" focusable="false"';
  return `<svg class="ui-icon ui-icon-${name}" width="${size}" height="${size}" viewBox="0 0 24 24" ${a11y}>${body}</svg>`;
}
```

All line icons use `stroke="currentColor"`, `stroke-width="1.7"`, `stroke-linecap="round"`, and `stroke-linejoin="round"`. The `share` icon may use the approved Chat reference path converted to the local 24px viewBox if needed; no remote sprite dependency is allowed.

- [ ] **Step 4: Run focused/full tests**

Run:

```bash
node --test tests/chatgpt-ui-system-contract.test.js
npm test
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/icons.js tests/chatgpt-ui-system-contract.test.js
git commit -m "feat: add shared TAPHOA SVG icons"
```

---

### Task 3: Shared button, input, and popup chrome

**Files:**
- Modify: `src/styles/chatgpt-ui.css`
- Modify: `src/styles/ui-system.css`
- Modify: `tests/chatgpt-ui-system-contract.test.js`

**Interfaces:**
- Produces shared CSS classes `.ui-button`, `.ui-button-primary`, `.ui-button-ghost`, `.ui-button-danger`, `.ui-icon-button`, `.ui-modal-surface`, `.ui-sheet-surface`, `.ui-overlay-backdrop`.
- Existing screen-specific selectors remain valid; later tasks only map them to this family.

- [ ] **Step 1: Add failing shared-chrome contracts**

Append:

```js
test('shared actions and overlays use neutral ChatGPT-aligned chrome',()=>{
  const css=read('src/styles/chatgpt-ui.css');
  assert.match(css,/\.ui-button-primary[^}]*background:\s*var\(--tap-primary\)/s);
  assert.match(css,/\.ui-button-ghost[^}]*background:\s*transparent/s);
  assert.match(css,/\.ui-icon-button[^}]*min-(?:width|inline-size):\s*32px/s);
  assert.match(css,/\.ui-modal-surface[^}]*border-radius:\s*var\(--tap-radius-lg\)/s);
  assert.match(css,/\.ui-overlay-backdrop[^}]*rgba\(0,0,0,\.32\)/s);
  assert.doesNotMatch(css,/linear-gradient\(135deg,var\(--classic-blue\),var\(--classic-teal\)\)/);
});
```

- [ ] **Step 2: Run and verify RED**

Run: `node --test tests/chatgpt-ui-system-contract.test.js`

Expected: FAIL because the new families are not defined.

- [ ] **Step 3: Implement shared chrome**

Add neutral button/input/modal rules to `chatgpt-ui.css`, for example:

```css
.ui-button{min-height:38px;padding:0 13px;border:1px solid var(--tap-border);border-radius:var(--tap-radius-md);background:var(--tap-surface);color:var(--tap-text);font-weight:600}
.ui-button:hover{background:var(--tap-surface-hover)}
.ui-button-primary{border-color:var(--tap-primary)!important;background:var(--tap-primary)!important;color:var(--tap-primary-text)!important}
.ui-button-ghost{border-color:transparent!important;background:transparent!important;color:var(--tap-text-secondary)!important}
.ui-button-danger{border-color:transparent!important;background:transparent!important;color:var(--tap-danger)!important}
.ui-icon-button{min-width:32px!important;width:32px!important;height:32px!important;min-height:32px!important;border:0!important;border-radius:var(--tap-radius-sm)!important;background:transparent!important;color:var(--tap-text-secondary)!important}
.ui-icon-button:hover{background:var(--tap-surface-hover)!important;color:var(--tap-text)!important}
.ui-modal-surface,.ui-sheet-surface{background:var(--tap-surface)!important;border:1px solid var(--tap-border)!important;border-radius:var(--tap-radius-lg)!important;box-shadow:var(--tap-shadow-popover)!important;color:var(--tap-text)!important}
.ui-overlay-backdrop{background:rgba(0,0,0,.32)!important}
```

Modify conflicting base declarations in `ui-system.css` only where specificity prevents the final theme layer from working predictably; do not move screen geometry into the shared layer.

- [ ] **Step 4: Run tests**

Run:

```bash
node --test tests/chatgpt-ui-system-contract.test.js
npm test
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/styles/chatgpt-ui.css src/styles/ui-system.css tests/chatgpt-ui-system-contract.test.js
git commit -m "feat: unify TAPHOA action and popup chrome"
```

---

### Task 4: Decorator-driven icons and action hierarchy

**Files:**
- Modify: `src/core/ui-system.js`
- Modify: `index.html`
- Modify: `tests/chatgpt-ui-system-contract.test.js`

**Interfaces:**
- Consumes: `icon()` from `src/core/icons.js`.
- Produces: stable helpers `setButtonIcon(button,name,{text=null,size=20})` and `decorateShellUi(root)` plus existing `decorateUi(root)` behavior.

- [ ] **Step 1: Add failing decorator contracts**

Append:

```js
const uiSystem=read('src/core/ui-system.js');
const index=read('index.html');

test('UI decorator uses shared SVG icons instead of interface emoji',()=>{
  assert.match(uiSystem,/from ['"]\.\/icons\.js['"]/);
  assert.match(uiSystem,/setButtonIcon/);
  assert.doesNotMatch(uiSystem,/document\.createTextNode\(['"]🛒/);
  assert.doesNotMatch(index,/>◉<|>×</);
});
```

- [ ] **Step 2: Run and verify RED**

Run: `node --test tests/chatgpt-ui-system-contract.test.js`

Expected: FAIL because `ui-system.js` still creates a cart emoji and `index.html` contains text glyph controls.

- [ ] **Step 3: Implement semantic icon decoration**

At the top of `ui-system.js`:

```js
import {icon} from './icons.js';
```

Add:

```js
export function setButtonIcon(button,name,{text=null,size=20}={}){
  if(!button)return;
  const label=button.getAttribute('aria-label')||text||button.textContent?.trim()||name;
  button.setAttribute('aria-label',label);
  button.innerHTML=`${icon(name,{size})}${text?`<span>${text}</span>`:''}`;
  button.dataset.uiIcon=name;
}
```

Use it for cart/search-clear/close/share/print/edit/delete/calendar/navigation controls when their selectors are present. Replace the `decorateSalesCleanup()` cart emoji rewrite with a shared SVG cart plus the existing `SP · total` text.

In `index.html`, leave button accessible labels intact but remove literal `◉` and `×`; shell decoration inserts `eye` and `close` icons.

- [ ] **Step 4: Run focused/full tests**

Run:

```bash
node --test tests/chatgpt-ui-system-contract.test.js
npm test
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/ui-system.js index.html tests/chatgpt-ui-system-contract.test.js
git commit -m "feat: replace TAPHOA action emoji with SVG icons"
```

---

### Task 5: Shell, login, account, and Sales visual migration

**Files:**
- Modify: `src/styles/chatgpt-ui.css`
- Modify: `src/core/ui-system.js`
- Modify: `tests/chatgpt-ui-system-contract.test.js`
- Keep geometry owners: `src/styles/shell.css`, `src/styles/sales.css`, `src/styles/classic.css`

**Interfaces:**
- Consumes: neutral tokens, shared button family, shared icons.
- Produces: ChatGPT-aligned shell/account/Sales appearance while preserving existing Sales DOM/search/cart behavior.

- [ ] **Step 1: Add failing shell/Sales visual contracts**

Append:

```js
test('shell and Sales no longer use decorative classic color chrome',()=>{
  const css=read('src/styles/chatgpt-ui.css');
  assert.match(css,/\.app-topbar[^}]*background:\s*var\(--tap-surface\)/s);
  assert.match(css,/\.app-nav button\[aria-current="page"\][^}]*color:\s*var\(--tap-text\)/s);
  assert.match(css,/\.sales-customer-row[^}]*background:\s*var\(--tap-surface\)/s);
  assert.match(css,/\.sales-group\[aria-pressed="true"\][^}]*background:\s*var\(--tap-primary\)/s);
  assert.match(css,/\.sales-qty button:last-child[^}]*background:\s*var\(--tap-primary\)/s);
  assert.match(css,/\.account-sheet-card[^}]*border:\s*1px solid var\(--tap-border\)/s);
});
```

- [ ] **Step 2: Run and verify RED**

Run: `node --test tests/chatgpt-ui-system-contract.test.js`

Expected: FAIL because classic blue/teal and green action overrides still win.

- [ ] **Step 3: Add final-theme overrides without changing geometry**

In `chatgpt-ui.css`:

- neutralize `.app-topbar`, nav, account button and account sheet
- neutralize `.sales-customer-row,.classic-seller-strip`
- keep the current Sales grid, pinned head, desktop split, search widths, row heights and cart geometry untouched
- remove the CSS pseudo-element search emoji and let `ui-system.js` inject the SVG search icon owner
- active Sales group uses dark neutral fill
- quantity plus/minus are neutral/dark, not green
- product cards use white surface, subtle border, minimal shadow
- primary cart/order action uses dark fill; secondary cart actions remain neutral

- [ ] **Step 4: Run focused/full tests**

Run:

```bash
node --test tests/chatgpt-ui-system-contract.test.js
npm test
```

Expected: PASS, including existing Sales search and geometry contracts.

- [ ] **Step 5: Commit**

```bash
git add src/styles/chatgpt-ui.css src/core/ui-system.js tests/chatgpt-ui-system-contract.test.js
git commit -m "feat: align TAPHOA shell and Sales with Chat UI"
```

---

### Task 6: Delivered and Pending detail/action migration

**Files:**
- Modify: `src/styles/chatgpt-ui.css`
- Modify: `src/core/ui-system.js`
- Modify: `tests/chatgpt-ui-system-contract.test.js`
- Do not change business handlers in `src/screens/delivered.js` or `src/screens/pending.js` unless an action lacks a semantic selector needed solely for decoration.

**Interfaces:**
- Consumes shared popup/action/icon family.
- Preserves existing share-image utility and current order operations.

- [ ] **Step 1: Add failing Delivered/Pending contracts**

Append:

```js
test('Delivered and Pending share one neutral detail/popup family',()=>{
  const css=read('src/styles/chatgpt-ui.css');
  const ui=read('src/core/ui-system.js');
  assert.match(css,/\.delivered-detail-panel[^}]*background:\s*var\(--tap-surface\)/s);
  assert.match(css,/\.pending-detail-panel[^}]*background:\s*var\(--tap-surface\)/s);
  assert.match(css,/\.delivered-backdrop[^}]*rgba\(0,0,0,\.32\)/s);
  assert.match(css,/\.pending-backdrop[^}]*rgba\(0,0,0,\.32\)/s);
  assert.match(ui,/share/);
  assert.match(ui,/print/);
  assert.match(ui,/trash/);
});
```

- [ ] **Step 2: Run and verify RED**

Run: `node --test tests/chatgpt-ui-system-contract.test.js`

Expected: FAIL because current classic detail actions use colored fills and classic backdrop/shadow treatment.

- [ ] **Step 3: Apply common popup and action family**

- add `.ui-modal-surface` / `.ui-sheet-surface` to detail/source/print panels from `decorateDetailUi()` and ancillary decorators
- add `.ui-overlay-backdrop` to delivered/pending backdrops
- classify `deliver` as primary dark; `edit/share/print` as neutral/ghost; `delete` as danger
- insert shared icons while retaining visible text where it improves clarity
- keep receipt tables, totals, current line grids, share-image behavior and order action handlers unchanged
- confine success/pending color to compact badges/status accents

- [ ] **Step 4: Run tests**

Run:

```bash
node --test tests/chatgpt-ui-system-contract.test.js
npm test
```

Expected: PASS, including `delivered-escape-regression.test.js` and current share-image contracts.

- [ ] **Step 5: Commit**

```bash
git add src/styles/chatgpt-ui.css src/core/ui-system.js tests/chatgpt-ui-system-contract.test.js
git commit -m "feat: unify order detail actions and popups"
```

---

### Task 7: Debt visual migration

**Files:**
- Modify: `src/styles/chatgpt-ui.css`
- Modify: `src/core/ui-system.js`
- Modify: `tests/chatgpt-ui-system-contract.test.js`
- Keep debt calculations/transactions in `src/screens/debt.js` unchanged.

**Interfaces:**
- Consumes shared neutral surface, icon, popup, and button families.
- Preserves red/green only for owed/credit semantic values.

- [ ] **Step 1: Add failing Debt contracts**

Append:

```js
test('Debt uses neutral surfaces with semantic balance color only',()=>{
  const css=read('src/styles/chatgpt-ui.css');
  assert.match(css,/\.debt-hero[^}]*background:\s*var\(--tap-bg\)/s);
  assert.match(css,/\.debt-total-row>div[^}]*background:\s*var\(--tap-surface\)/s);
  assert.match(css,/\.debt-customer-row>strong\.is-owed[^}]*var\(--tap-danger\)/s);
  assert.match(css,/\.debt-customer-row>strong\.is-credit[^}]*var\(--tap-success\)/s);
  assert.match(css,/\.debt-detail-panel[^}]*background:\s*var\(--tap-surface\)/s);
});
```

- [ ] **Step 2: Run and verify RED**

Run: `node --test tests/chatgpt-ui-system-contract.test.js`

Expected: FAIL because the current classic/old shared rules still include decorative hero and colored controls.

- [ ] **Step 3: Apply neutral Debt theme**

In `chatgpt-ui.css`:

- remove decorative debt hero gradients
- keep total cards neutral
- retain `.is-owed` red and `.is-credit` green only
- normalize customer rows, inputs, ledger rows, order detail surfaces and overlays
- normalize debt share/order-share controls to ghost/neutral with SVG share icon
- preserve all balance math, linked orders, ledger rows and transaction handlers

- [ ] **Step 4: Run tests**

Run:

```bash
node --test tests/chatgpt-ui-system-contract.test.js
npm test
```

Expected: PASS, including debt geometry and iPhone debt tests.

- [ ] **Step 5: Commit**

```bash
git add src/styles/chatgpt-ui.css src/core/ui-system.js tests/chatgpt-ui-system-contract.test.js
git commit -m "feat: align TAPHOA Debt with neutral UI system"
```

---

### Task 8: Remove obsolete classic visual conflicts and verify production gates

**Files:**
- Modify: `src/styles/classic.css` only where obsolete color/icon declarations continue to fight the final theme
- Modify: `tests/classic-ui-contract.test.js` to lock classic **geometry/reference continuity**, not classic blue/teal as the final runtime palette
- Modify: `tests/chatgpt-ui-system-contract.test.js`

**Interfaces:**
- Produces a single predictable final cascade: geometry from existing screen/classic owners, final visual tokens from `chatgpt-ui.css`.

- [ ] **Step 1: Update the legacy classic contract RED-first**

Replace palette assertions in `tests/classic-ui-contract.test.js` with geometry ownership assertions:

```js
test('classic reference layer keeps TAPHOA geometry while final visual theme is separate',()=>{
  const html=read('index.html');
  const classic=read('src/styles/classic.css');
  assert.match(classic,/\.app-topbar[^{]*\{[^}]*min-height:\s*48px/s);
  assert.match(classic,/\.app-nav button[^{]*\{[^}]*height:\s*48px/s);
  const classicIndex=html.indexOf('./src/styles/classic.css');
  const themeIndex=html.indexOf('./src/styles/chatgpt-ui.css');
  assert.ok(classicIndex>=0&&themeIndex>classicIndex);
});
```

Add a final contract that `chatgpt-ui.css` does not use `--classic-blue` or `--classic-teal` as primary/default chrome.

- [ ] **Step 2: Run targeted tests and verify any conflicts**

Run:

```bash
node --test tests/classic-ui-contract.test.js tests/chatgpt-ui-system-contract.test.js
```

Expected before cleanup: at least one failure if obsolete declarations or ordering violate the final-theme contract.

- [ ] **Step 3: Remove only conflicting visual declarations**

Delete or neutralize obsolete `classic.css` pseudo-icon/color declarations that are no longer geometry owners. Do not move screen dimensions, grid rules, responsive breakpoints, or receipt geometry out of their existing files.

- [ ] **Step 4: Run the complete local verification suite**

Run:

```bash
npm test
npm run build:production
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/styles/classic.css tests/classic-ui-contract.test.js tests/chatgpt-ui-system-contract.test.js
git commit -m "refactor: make neutral theme the final TAPHOA visual owner"
```

- [ ] **Step 6: Open PR and verify all repository gates**

Open a PR from `feature/chatgpt-ui-system` to `main`. Verify these workflows on the final head:

- `V1.28 build check` → success
- `V1.29 security check` → success
- `TAPHOA data read check` → success
- `TAPHOA scroll owner check` → success

Do not merge until all four are green and the diff confirms no Supabase migration/function/business-handler changes.

- [ ] **Step 7: Review the final diff for scope**

The expected production changes are limited to:

- `index.html`
- `src/styles/chatgpt-ui.css`
- `src/styles/ui-system.css`
- narrowly scoped cleanup in `src/styles/classic.css`
- `src/core/icons.js`
- `src/core/ui-system.js`
- UI contract tests/docs

If any database, Supabase, order persistence, debt math, auth, realtime, or screen business-handler file appears unexpectedly, stop and remove/review that change before merge.
