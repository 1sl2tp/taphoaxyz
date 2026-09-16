# TAPHOA FIXED UI Full Replacement Design

## Source of truth
`TAPHOA_GEMINI_100_SAMPLE_FIXED.html` is the only frontend/UI source of truth.

## Required result
- Production must render the FIXED login screen and all 5 FIXED menus: Bán hàng, Đã giao, Đơn tạm, Công nợ, Cài đặt.
- Production must carry over the FIXED HTML structure, all FIXED CSS, and all FIXED JavaScript UI behavior including cart, filters, settings, modals, responsive behavior, sharing/capture behavior, quantity editing, order detail, debt detail, source detail, and UI preferences.
- No old taphoaxyz UI shell, screen renderer, legacy skin, decorator, or legacy CSS may remain as an alternate render path.
- After the FIXED frontend is connected successfully, old UI-only CSS/JS/screens/tests that describe or render the previous interface are deleted.

## Business/data boundary
Keep the existing production backend/business layer: Supabase auth, API/RPC calls, app data, order save/deliver/reverse/delete, debt transactions, snapshots/sync where still applicable. These are data/business services only and must not render old UI.

The FIXED UI runtime remains responsible for DOM, navigation, all five tabs, login presentation, cart, dialogs, filters, settings presentation, and responsive behavior. A production bridge translates FIXED UI actions/data into the existing Supabase business API.

## Production bridge rules
- Preview/sample data and Google Sheet endpoints are not production data sources.
- Login/logout/restore use the existing Supabase auth service.
- Product/customer/order/debt data come from the existing production bootstrap/domains APIs and are translated to the row model expected by the FIXED UI runtime.
- Order create/update uses `saveOrder`; pending delivery uses `deliverOrder`; pending deletion uses `deletePending`; delivered deletion means `reverseOrder`; debt mutations use `debtTransaction`; bulk pending deletion uses `batchOrders('delete_pending', ids)`.
- No fake sample data may be shown when production data is unavailable.
- UI-only functions from the FIXED file remain present unless they are strictly preview/sample transport code; preview transport is replaced by the production bridge, not by an old UI implementation.

## Deletion rule
Once the production FIXED UI is active and tests/build pass, delete the old screen renderers and old UI styles/decorators/contracts so future work cannot accidentally restore the previous interface.

## Verification
- Contract test proves Login + 5 FIXED tab roots exist and legacy shell imports are gone.
- Contract test proves known old screen/style sources no longer exist.
- Business/auth/data tests remain green.
- `npm test` and `npm run build:production` must pass on the final HEAD.
