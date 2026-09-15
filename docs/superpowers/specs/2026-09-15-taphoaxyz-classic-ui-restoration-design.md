# TAPHOA.XYZ Classic UI Restoration Design

## Scope

Restore the current `taphoaxyz` app to the visual language and interaction rhythm of the user-provided `5555_fixed(1).html` reference. This work is TAPHOA.XYZ only and must not import SHOP88 layout or business rules.

## Source of truth

The uploaded classic HTML is the visual/interaction reference: light `#F0F4F8` page background, white cards, blue `#1565C0` primary color, blue→teal seller header, compact top navigation, white search/category strip, dense product/order rows, mobile one-column flow, desktop two-column selling workspace, compact modals, order-detail tables, and image sharing from the invoice/detail surface.

## Preserve current architecture

Keep the current Supabase auth, namespaced TAPHOA APIs, permissions, app-state, snapshots, sync, order/debt business actions, and four current business routes (`sales`, `delivered`, `pending`, `debt`). Do not restore Google Apps Script, Google Sheet APIs, mock data, or retired localStorage business storage from the classic file. The current account sheet remains the account/profile entry point and is visually aligned with the classic UI rather than reintroducing retired account APIs.

## Shared visual language

Use shared classic tokens: background `#F0F4F8`; primary `#1565C0`; secondary blue `#1976D2`; teal `#00838F`; green `#2E7D32`; red `#C62828`; orange `#E65100`; text `#1E293B`; secondary text `#64748B`; muted `#94A3B8`; border `#E2E8F0`; divider `#F1F5F9`. Keep system/SF/Segoe-style typography and compact radii/shadows close to the reference.

## Sales

Restore the classic order of regions: compact top nav; gradient seller strip containing customer/date/cart summary; white search row; horizontal group pills; product list; mobile cart sheet; desktop split with products on the left and a fixed/sticky cart panel on the right.

Search must behave natively. The active search input must stay mounted while typing; no full-screen render, no product-list `innerHTML` replacement, no forced refocus/caret manipulation, and no synthetic input event. Filtering may only change visibility/state of already-mounted product rows or otherwise preserve the same input node.

Product rows stay compact: product name first, cost→sell price metadata when permitted, optional unit/label, and explicit quantity controls. Existing permissions and pricing/order behavior remain unchanged.

## Delivered and Pending

Use compact classic cards with customer/order identity first, then time/summary. Opening an order uses a centered/bottom-sheet detail surface matching the classic invoice rhythm. Detail content is a real table/list with columns equivalent to `TÊN | Đ.GIÁ | SL | T.TIỀN`, followed by quantity and total summaries. Existing destructive/edit actions keep their current semantics.

## Share image

Order detail must expose `Chia sẻ ảnh`. Build the image from a dedicated receipt DOM node, matching the displayed detail content. Prefer `navigator.share({files:[...]})` when supported; otherwise fall back to a generated image download/open path. Use `html2canvas` only for rendering the receipt; it must not change order data.

## Debt and account/profile

Restyle debt list/detail and account sheet using the same classic surfaces, spacing, typography, buttons, and modal geometry. Preserve current debt calculations and permissions. Do not add retired business mutations just to match the old file.

## Responsive behavior

Mobile remains a compact one-column app. Desktop is a separate wider composition where useful, especially Sales with product list + cart. Do not simply scale mobile cards up. Existing scroll-owner constraints must remain valid.

## Non-goals

No SHOP88 code or rules. No backend migration. No Google Sheet reintroduction. No speculative new customer/account CRUD. No change to order/debt semantics. No rewrite to React; current modular vanilla JS stays in place.

## Verification

Add regression tests for classic tokens/layout markers, stable search DOM behavior, order-detail table structure, image-share wiring, and preservation of current business contracts. Run the full existing test suite and all repository CI checks before merging.