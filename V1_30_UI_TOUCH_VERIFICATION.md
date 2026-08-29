# TAPHOA V1.30 — iPhone Touch / Swipe / Search Verification

Date: 2026-08-29
Baseline: V1.29 Security Hardening
Candidate: V1.30

## Scope
UI/interaction only. No business API action, Supabase endpoint, order/debt logic, or V1.29 security contract was changed.

## V1.30 changes
- Mobile root is locked to `100dvh`; document/body overscroll is disabled on <=1023px.
- Seller top menu is outside the internal vertical scroll host, so iPhone pull-down does not drag the menu/sibling screen.
- Horizontal swipe changes seller menu in order: `Bán hàng -> Đã giao -> Đơn tạm -> Công nợ -> Hồ sơ`.
- Swipe is ignored when gesture starts on input/textarea/select/button/link/contenteditable or horizontal Pills.
- App text selection is disabled by default, while input/textarea/select/contenteditable remain selectable/editable. This preserves price/quantity editing.
- Product search uses native `input` + `compositionend` in addition to React `change`, so Vietnamese/iPhone typing updates results each input event without Enter/debounce.
- Logo keeps the existing source image but is rendered with transparent background / multiply blending on colored UI, removing the visible white field without changing the logo artwork.
- UI cache namespace bumped to `v30`.

## Locked regression checks
- Business `api.call(...)` count: 29 (unchanged).
- Supabase Edge Function endpoint unchanged: `https://gcnoahqsrquxkwkjbuxy.supabase.co/functions/v1/taphoa-api`.
- No `taphoa_session` read/write through `localStorage` reintroduced.
- V1.30 runtime bytes: `190838`.
- V1.30 runtime SHA-256: `6cb723e10067444e3095d494162a4739895ac1e514d5f7a870b8d0e5cd3efedc`.
- Vercel preview build: PASS.

## Note
This release uses static contract/build verification plus Vercel preview. Physical-device feel (swipe threshold / iOS keyboard ergonomics) should still be confirmed by the user on the target iPhone; the swipe threshold is 56px and requires a clearly horizontal gesture.
