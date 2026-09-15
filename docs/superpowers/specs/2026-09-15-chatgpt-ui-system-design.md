# TAPHOA ChatGPT-Aligned UI System — Design

## Scope

This design applies only to `1sl2tp/taphoaxyz`. It does not introduce SHOP88 layout or business rules. The current TAPHOA screen structure, Supabase contracts, order flows, debt flows, account flows, search behavior, and sharing behavior remain intact.

The goal is to make all TAPHOA screens feel like one product by replacing the mixed classic/semantic chrome with one Chat/ChatGPT-aligned visual system.

## Source of truth

The visual source of truth is the existing `1sl2tp/chat` reference bundle already used by the Chat project:

- `reference/chatgpt/full-source/chatgpt-core-exact.css`
- `reference/chatgpt/chatgpt-token-aliases.css`
- `reference/chatgpt/chatgpt-reference.js`

The reference establishes these important values and behaviors:

- page/background neutrals: `#fcfcfc`, `#f9f9f9`, `#f3f3f3`, white surfaces
- primary text: `#0d0d0d`; secondary text: `#5d5d5d`; tertiary text: `#8f8f8f`
- borders from black at 5–10% opacity, rather than colored borders
- primary button: inverse dark surface with white content
- ghost actions: transparent at rest, `#f3f3f3`-family hover/pressed surfaces
- system font stack: `-apple-system-body, ui-sans-serif, -apple-system, system-ui, "Segoe UI", "Helvetica", "Apple Color Emoji", "Arial", sans-serif`
- icon language: thin SVG, normally 20px or 24px; compact controls may use 18px glyphs inside 32–36px hit areas

## Design principles

1. **Neutral by default.** White/near-white surfaces, near-black text, subtle gray borders. Color is not decoration.
2. **Semantic color only.** Red is destructive/error, green is success/positive balance, blue is informational/accent only where state needs it. Ordinary actions are not blue/green filled buttons.
3. **One action hierarchy.** Primary actions use dark fill; secondary actions use neutral bordered/ghost styles; destructive actions use red text or a destructive confirmation surface.
4. **One icon language.** Replace UI emoji characters with inline SVG icons using shared paths/components. Product/user content is unaffected.
5. **One popup family.** Every modal/detail/sheet uses the same surface, border, radius, shadow, header, close button, and action footer treatment.
6. **Do not change layout ownership.** Existing screen geometry, list/detail placement, desktop split behavior, mobile sheet behavior, scroll owners, and business logic stay in their current screen owners.
7. **Do not rewrite business handlers for appearance.** The design system decorates and styles existing controls; screen JS changes are limited to semantic classes/icon rendering when necessary.

## Token system

Create a dedicated stylesheet `src/styles/chatgpt-ui.css` loaded after `ui-system.css` and before screen-specific emergency cleanup. It defines TAPHOA-owned semantic tokens rather than importing Chat CSS at runtime.

Required tokens:

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
}
```

Existing `--ui-*` variables remain supported but are remapped to these tokens so current screens inherit the system without backend or markup rewrites.

## Icons

Create `src/core/icons.js` as the only owner for UI glyph markup. It exports `icon(name,{size=20,label=null})` and a frozen icon path registry.

Minimum icon set:

- search
- close
- plus
- minus
- cart
- calendar
- chevron-left
- chevron-right
- edit
- trash
- share
- print
- check
- clock
- user
- logout
- eye / eye-off
- more

Icons are inline SVG with `currentColor`, `fill="none"` unless the source path requires fill, and `aria-hidden="true"` when the button already has an accessible label. No interface action uses emoji such as `🔍`, `🛒`, `🖼️`, `×`, or `◉` as its final rendered glyph.

## Buttons and controls

The shared family is:

- `.ui-button`: neutral secondary button; 36–40px minimum height depending on context, 12px radius, subtle border, white/transparent surface.
- `.ui-button-primary`: dark `--tap-primary` fill with white text/icon.
- `.ui-button-ghost`: no border at rest, hover/pressed neutral surface.
- `.ui-button-danger`: neutral surface with red text/icon; destructive confirmation may use red fill only in the final confirmation action.
- `.ui-icon-button`: 32–36px square, 18–20px icon, no colored tile at rest.
- quantity controls: neutral minus, numeric center, dark/neutral plus; no unrelated green fill.
- inputs: white surface, subtle border, neutral focus ring; no large blue glow.

The design must retain readable touch targets and not make text/icon-only actions smaller than the current functional hit area.

## Popup / sheet family

All Delivered, Pending, Debt, account, source-detail, print/share detail, and destructive confirmation overlays use one family:

- desktop: centered modal, max width appropriate to content, `16px` radius
- mobile: bottom sheet, `16px 16px 0 0` radius or near-full-screen detail when the current screen requires it
- white surface, 1px subtle border, restrained shadow
- backdrop `rgba(0,0,0,.32)`
- header: title/context left, icon-only close right
- content owns scrolling; header/footer stay structurally stable
- footer actions use the shared button hierarchy
- no green share button, blue print button, or colored close tile merely to distinguish actions

Existing receipt/table structures remain intact.

## Screen application

### App shell / login / account

- theme color becomes neutral rather than classic blue
- navigation uses neutral labels with near-black active state and a subtle active indicator
- account control is neutral
- login eye, close, logout use shared icons/buttons
- account sheet uses the common sheet family

### Sales

Keep current classic TAPHOA geometry: customer strip, search/group area, product list, cart, desktop split.

Visual changes:

- remove blue→teal seller gradient; use neutral elevated/surface styling
- search icon becomes shared SVG
- group active state uses dark neutral fill, not blue
- product cards become flatter with subtle border/shadow
- prices may use strong text; informational blue is optional only when it improves scan, never mandatory
- quantity plus/minus become neutral/shared controls
- cart icon and actions use shared SVG/button system

### Delivered / Pending

- filters, date controls, cards, receipts and detail overlays use neutral surfaces
- status color remains semantic but is confined to compact badges/text/rail accents
- totals use strong text instead of default blue/green decoration
- share/print/edit/delete/close buttons use shared icons and action hierarchy
- current share-image behavior remains unchanged

### Debt

- remove decorative blue/teal hero gradient
- totals become neutral cards; owed/credit values retain red/green semantics where needed
- customer rows, transaction tables, order details and share controls use the common surface/button/icon system
- no debt calculation, balance, transaction, or linked-order logic changes

## Compatibility and non-goals

- No Supabase schema changes.
- No endpoint/RPC changes.
- No data migration.
- No change to order states, totals, debt semantics, authentication, realtime behavior, or share-image payload.
- No wholesale DOM rewrite.
- No runtime dependency on the Chat repo; only design values and approved SVG path data are copied into TAPHOA-owned source files.
- No dark mode in this change.

## Verification

Automated contracts must verify:

1. `chatgpt-ui.css` exists and is loaded after the existing shared UI layer.
2. required neutral tokens are present and classic blue/teal gradients are not used as default app chrome.
3. `icons.js` exports the required icon names and produces accessible inline SVG.
4. known UI emoji glyphs are removed from the shell/Sales/detail action markup after decoration.
5. button families and popup families are present and applied to Delivered/Pending/Debt/account surfaces.
6. existing business-contract tests continue to pass.
7. production build, security check, data-read check, and scroll-owner check remain green.

## Success criteria

A user moving between Bán, Đã giao, Đơn tạm, Công nợ, account and order/detail popups should see one consistent product language: white/neutral surfaces, near-black hierarchy, thin SVG icons, restrained color, compact uniform actions, and the same popup chrome everywhere—without any change to how TAPHOA business operations work.
