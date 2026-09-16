# TAPHOA Tailwind Retail UX Redesign — Design Specification

## Design read

Reading this as a **mobile-first grocery retail operations app** for repeated, high-frequency use by shop staff, with a **neutral, dense, touch-first product language**. Use **Tailwind CSS v4** as the final visual owner. Treat UI/UX Pro Max as the primary source for usability, accessibility, touch targets, responsive behavior and layout hierarchy. Treat Taste Skill only as a redesign/audit layer to prevent generic card soup, weak hierarchy, inconsistent typography, optical misalignment and unnecessary decoration.

Global dials:
- `DESIGN_VARIANCE = 2`
- `MOTION_INTENSITY = 1`
- `VISUAL_DENSITY = 8`

## Source precedence

When guidance conflicts, apply this order:
1. Existing TAPHOA business behavior and current navigation flow.
2. UI/UX Pro Max touch/accessibility/responsive rules.
3. Internal consistency and maintainability of the TAPHOA UI system.
4. Taste Skill visual-polish guidance.

Taste Skill explicitly says its main frontend skill is not a dashboard/data-table/multi-step-product-UI standard. Therefore TAPHOA uses its audit rules selectively rather than copying its marketing-page defaults.

## Non-negotiable business flow

No business logic, Supabase RPC, data model, search algorithm, order lifecycle, debt semantics, print or share behavior may change.

The navigation flow remains:
- **Sales:** MAIN Sales → Cart popup → Place / Sell / Update.
- **Delivered:** MAIN Delivered → Order detail popup level 1 → Print/deeper popup level 2.
- **Pending:** MAIN Pending → Order detail or Source detail popup level 1 → Print popup level 2.
- **Debt:** MAIN Debt → Customer detail popup level 1 → Linked delivered-order detail popup level 2.

Desktop must preserve the same MAIN → popup mental model as mobile. It may expose more columns and wider modal geometry, but must not convert these flows into persistent list/detail split views.

## Information architecture

Every screen must visibly separate these semantic roles:
- App shell
- Main screen
- Page/context controls
- Toolbar
- Search/filter/segment controls
- Summary
- Table/list
- Table header
- Data row
- Form
- Action group
- Primary action
- Secondary action
- Destructive action
- Popup level 1
- Popup level 2
- Confirmation
- Empty/loading/error state

A data row must never look like an ordinary action button. A summary must not look like a form. A popup must visibly sit above MAIN.

## Surface hierarchy

Use six visual layers:
- **L0 Shell:** navigation and account.
- **L1 Main:** business screen background.
- **L2 Context:** search, customer, date, filters, category chips, sort, quick forms.
- **L3 Data:** tables/lists/rows.
- **L4 Popup level 1:** cart, order detail, source detail, debt customer detail.
- **L5 Popup level 2:** print preview or linked order detail.

Use subtle background contrast, divider rhythm, spacing and typography to communicate depth. Avoid gradients for hierarchy, border-everything styling and excessive shadows.

## Tailwind architecture

Tailwind CSS v4 is the only visual owner. Keep `scroll-owner.css` exclusively for scroll ownership and gesture constraints. Existing compatibility CSS may remain temporarily for structural reset only, but must not compete with Tailwind for final component visuals.

Theme tokens must cover:
- Neutral page/shell/context/data/popup surfaces.
- Text primary/secondary/tertiary.
- Divider and strong divider.
- Semantic success/danger/warning.
- Touch sizes `44px` and important action height `48px`.
- Typography scale.
- Spacing rhythm.
- Control/section/popup radius.
- Popup/backdrop elevation.
- Z-index scale.
- Motion durations with reduced-motion fallback.

Reusable semantic classes:
- `.ui-main`
- `.ui-context`
- `.ui-toolbar`
- `.ui-summary`
- `.ui-table`
- `.ui-table-head`
- `.ui-row`
- `.ui-form`
- `.ui-action-group`
- `.ui-action`
- `.ui-action-primary`
- `.ui-action-secondary`
- `.ui-action-danger`
- `.ui-icon-button`
- `.ui-popup-l1`
- `.ui-popup-l2`

Use Tailwind utilities directly for one-off local layout where appropriate. Use `@layer components` only for repeated semantic patterns.

## Typography

Use the existing system UI stack for speed, familiarity and Vietnamese rendering stability.

Target scale:
- Page title: `20–22px`.
- Popup title: `18–20px`.
- Section title: `17–18px`.
- Product/customer/order primary text: `15–16px`.
- Body: `15px`.
- Button/input: `15–16px`.
- Metadata/nav: `12–13px`.
- Important money: `18–24px`.

Never use 8–9px functional text. All money and aligned numeric data use tabular figures. Names align left, numeric table cells align right.

## Touch and interaction

- Every interactive target is at least `44×44px`.
- Primary high-frequency actions prefer `48px` height.
- Visual icon size stays about `18–22px` inside the larger hit area.
- Do not rely on hover to communicate action.
- Pressed state must appear immediately without layout shift.
- Keyboard focus remains visible.
- Browser zoom remains enabled.
- Mobile text inputs remain at least `16px` to avoid Safari focus zoom.
- Icon-only controls require accessible labels.
- State must not rely only on color.
- Respect `prefers-reduced-motion`.

## Iconography

Use one icon family only. Do not show emoji as interface icons. Existing shared TAPHOA SVG registry remains the compatibility icon source for this redesign; do not add a second visual family during this pass. Standardize visual size and stroke across the system.

## Button hierarchy

Only these button roles exist:
- Primary
- Secondary
- Ghost/tertiary
- Destructive
- Icon-only

Primary business actions:
- Sell
- Approve
- Update order
- Collect payment

Secondary actions:
- Place pending order
- Edit
- Print
- Share

Destructive actions:
- Delete
- Delete all

Semantic green/red is reserved for real business meaning, not decoration.

## Data collections

TAPHOA is data-heavy. Main collections must render as table/list → row → divider, not card soup.

Rows must have:
- Stable horizontal alignment.
- Clear primary information.
- Right-aligned numeric data when tabular.
- Large tap area where clickable.
- Light pressed feedback.
- No per-row shadow.
- No per-row rounded-card shell.

## Sales layout

MAIN order:
1. Customer/context row with cart action.
2. Product search.
3. Horizontal product-group selector.
4. Product data list.

Product row:
- Product name, up to two lines.
- Price/unit metadata.
- Explicit `− / quantity / +` control on a stable axis.
- Row tap never increments quantity.

Cart stays popup level 1 at every viewport. Structure:
1. Header: Cart + item count + close.
2. Data table: Name / Unit price / Qty / Amount.
3. Summary: total quantity and total amount.
4. Footer actions: Delete / Place / Sell.
5. Edit mode: Cancel / Update order.

Sales search must preserve the currently mounted input node and only toggle mounted product rows while typing.

## Delivered layout

MAIN:
1. Search + date context.
2. Compact source summary table.
3. Delivered order list.

Order row priority:
1. Customer name.
2. Total amount.
3. Time + product-code count + quantity.
4. Profit, when permitted.
5. Short product preview.
6. Order ID as metadata rather than dominant title.

Popup level 1 uses shared order-detail geometry:
- Header
- Context
- Items table
- Total
- Actions

Print is popup level 2.

## Pending layout

MAIN:
1. Page heading / order count / low-emphasis destructive bulk action.
2. Source summary navigation table.
3. Pending order list.

Customer name is the dominant order-row label. Order ID is metadata.

Source popup level 1:
- Source name.
- Order/product count.
- `Product / Customer / Qty` table.
- Print detail / total-products actions.

Order popup level 1 must share the same structural geometry as Delivered detail. Actions differ by business state: Edit / Approve / Share / Print / Delete.

## Debt layout

MAIN:
1. Summary strip for debt and credit totals.
2. Quick transaction form, visually distinct from summary.
3. Customer ledger grouped by business state.

Customer row:
- Small avatar/initials.
- Customer name.
- Last transaction + debt age.
- Balance at right.
- Only the balance receives semantic red/green.

Customer detail popup level 1:
- Customer header with share/close.
- Current balance summary.
- Transaction ledger table.
- Fixed transaction footer when management is allowed.

Linked order opens shared order detail popup level 2.

## Popup behavior

Mobile:
- Popup level 1 uses bottom/full-height sheet depending on content.
- Popup level 2 is visually deeper.
- Header is fixed/sticky.
- Body owns scrolling.
- Action footer is sticky when needed.
- Safe-area bottom padding is mandatory.

Desktop:
- Centered modal with content-appropriate max width.
- Preserve flow; do not turn popup into a permanent side panel.

Both levels follow: Header → Context → Body/Data → Summary → Actions.

## Responsive gates

Verify at: `280, 320, 390, 480, 760, 761, 999, 1000, 1280, 1440`.

Requirements:
- Mobile remains one-column.
- Desktop gains width and data columns without changing flow.
- No accidental horizontal overflow.
- Controls never overlap.
- Popup never exceeds viewport.
- iPhone safe areas work.
- No input focus zoom caused by sub-16px fields.

## Motion

Motion intensity is 1. Use only short color/opacity/transform feedback. No cinematic transitions, scroll hijacking, parallax, spring-heavy motion or decorative loops.

## Behavior locks

Do not regress:
- Vietnamese IME.
- Stable Sales search input.
- Realtime local updates.
- Scroll-owner behavior.
- Order/debt delete semantics.
- Order lifecycle.
- Share receipt image.
- Print behavior.
- Permissions that hide cost/profit or management actions.

## Verification

Each architectural change gets a failing contract test first, then minimal implementation.

Final evidence requires:
- `npm test`
- Tailwind compile (`npm run ui:build`)
- production build (`npm run build:production`)
- security workflow
- scroll-owner workflow
- production smoke

The redesign is complete only when the code, CI and real browser layout agree with this specification.