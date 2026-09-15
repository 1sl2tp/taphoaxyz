# TAPHOA System UI Standardization — Design Spec

Date: 2026-09-15
Status: APPROVED IN CHAT
Repository: `1sl2tp/taphoaxyz`
Target branch: `refactor/system-ui-standardization`

## 1. Purpose

Standardize the entire TAPHOA web visual system without changing business logic, data contracts, authorization, or the existing four-screen product structure. The result must make Sales, Delivered, Pending, Debt, Login, Account Sheet, Cart, and all order/debt detail surfaces feel like one product rather than separate CSS families.

## 2. Governing Rules

This work follows `docs/TAPHOA_QUY_TAC_LAM_VIEC.txt` and the approved SHOP88/TAPHOA UI reference library.

- Keep exactly four business screens: Sales, Delivered, Pending, Debt.
- Login/Auth stays outside App Shell.
- Geometry remains owned by the nearest semantic parent; do not repair parent geometry with child offsets/hacks.
- Screen geometry remains scoped by `data-screen-id`.
- Responsive decisions belong to the nearest owner, preferring container queries when the relationship depends on container size.
- Do not change financial, auth, data, permission, mutation, or RPC behavior.
- Static/syntax tests do not replace browser/device verification.

## 3. Visual Token Contract

`src/styles/base.css` becomes the single source for shared visual tokens. Screen files may consume these tokens but must not invent parallel semantic palettes for the same role.

### 3.1 Core colors

- `--ui-page`: neutral application background.
- `--ui-panel`: primary white surface.
- `--ui-surface-soft`: quiet secondary surface.
- `--ui-text`: primary copy.
- `--ui-text-secondary`: supporting copy.
- `--ui-muted`: labels/metadata/empty state.
- `--ui-line`: normal separator/border.
- `--ui-line-strong`: stronger total/header separator.
- `--ui-primary`: active navigation and selling-price emphasis.
- `--ui-success`: delivered/received/success meaning.
- `--ui-warning`: pending/waiting meaning.
- `--ui-danger`: delete/debt/destructive meaning.

Semantic color is never used simply to decorate an entire screen. Pending uses warning only for state/status emphasis; Delivered uses success/primary only where state/value meaning requires it; Debt uses danger/success only for owed/credit meaning.

### 3.2 Radius and control sizes

- Content/card radius: 14px.
- Sheet/modal radius: 18–20px, with mobile bottom-sheet top corners only when hosted at viewport bottom.
- Standard field/button height: 44–46px.
- Compact icon controls: 32–40px depending on host.
- Pill radius is reserved for status/chip/segmented controls, not every button.

## 4. Typography Contract

All shared markup uses semantic typography roles instead of per-screen arbitrary font-size rules:

- `shell-title`
- `panel-title`
- `name`
- `body`
- `meta`
- `label`
- `action`
- `money-row`
- `money-key`
- `money-hero`
- `summary-value`
- `summary-total`
- `micro`

The CSS may implement these via `.ui-*` utility classes and/or `data-ui-type` selectors. Number/money roles use tabular numerals. Attention rank controls retention/compression, not color or boldness. Do not reduce type below the role floor to save horizontal space.

## 5. Shared Order Detail Family

Pending order detail, Delivered order detail, and Debt order detail use one visual family and one column grammar:

`# | Tên | SL | Đ.Giá | T.Tiền`

Requirements:

- Same column widths/gaps within the same container class.
- Same table header line treatment.
- Same row baseline and numeric alignment.
- Same total row structure.
- Same close/action control family.
- Status color is the only major semantic variation: pending=warning, delivered=success/primary, debt order=primary with debt state in debt semantics.
- User-role privacy remains unchanged: hidden cost/profit fields must not return simply because the shared table family exists.

## 6. Popup/Sheet Header Contract

Order/detail popup headers use semantic titles, not raw UUIDs as the visual heading.

Examples:

- `Đơn tạm`
- `Đã giao`
- `Công nợ`

Context is a separate row/segment and may include customer + compact order identifier + compact time/date. Long UUIDs must be visually compacted while the full identifier remains in `title`, `aria-label`, or data attributes for inspection/copy where applicable.

Header priority when narrow:

1. Semantic title.
2. Status/action controls.
3. Customer/context.
4. Full technical identifier yields first.

## 7. Buttons and Actions

Button styling is based on action meaning:

- Neutral/default: white/soft surface + standard border + primary text.
- Primary: filled primary color only for the main forward action.
- Success: filled success only where the action meaning is receiving/finishing.
- Warning: state/chip emphasis; avoid using it as a generic action style.
- Destructive: danger border/text by default; fill danger only when intentionally stronger emphasis is required.

Do not style all footer actions as equal visual weight.

## 8. Screen-Specific Responsibilities

### Sales

Keep the existing customer/search/group/product/cart geometry and current iPhone scroll-owner repair. Standardize product names, price roles, quantity control family, cart table typography, borders, and action hierarchy. Do not alter current permissions that hide cost for User.

### Delivered

Keep date/search behavior and data grouping. Replace the screen-specific table/detail visual grammar with shared summary/order-detail roles. Delivered cards use the common card language and only use semantic green/primary accents where meaningful.

### Pending

Keep source grouping and order management behavior. Remove the current 'orange everywhere' effect. Warning color is retained for pending state/status, not every numeric field/title. Pending detail adopts the shared order-detail family.

### Debt

Keep current debt hero and debt actions, but align typography, radius, borders, list rows, popup headers, order detail table, footer controls, and numeric roles with the global system. Owed/credit semantics remain red/green.

### Login / Account Sheet / Navigation

Use the same token system, typography hierarchy, line/radius grammar, and action family. Navigation remains compact; active tab uses primary emphasis. Account sheet remains a mobile bottom sheet and logout remains destructive.

## 9. Responsive and Scroll Constraints

Do not change document-level viewport ownership introduced by the iPhone fixes.

- Root/document remains locked against outer scroll/overscroll.
- Actual list owners keep `overflow:auto`, `-webkit-overflow-scrolling:touch`, and `touch-action:pan-y`.
- Horizontal group rails keep `pan-x`.
- Existing swipe-tab behavior and privacy behavior remain unchanged.
- Geometry must be checked at 280, 320, 390, 480, 760/761, 999/1000, 1280, 1440 widths when relevant.

## 10. Testing Contract

Add static UI-system contract tests that verify:

- shared tokens exist in base CSS;
- shared typography roles exist and money roles use tabular numerals;
- order detail screens expose common semantic markup/classes;
- semantic title is used instead of UUID-as-heading;
- screen CSS consumes shared tokens for common roles rather than reintroducing conflicting core palette values;
- current scroll-owner and privacy tests continue to pass.

Then run the full maintained test suite and production build. Browser/device verification remains a separate final gate, especially iPhone scroll and modal presentation.

## 11. Out of Scope

- Database/RPC changes.
- Authentication behavior changes.
- Permission model changes.
- New business screens.
- New order/debt behavior.
- Replacing navigation behavior.
- Rewriting the application framework.
