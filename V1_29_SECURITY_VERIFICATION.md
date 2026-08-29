# TAPHOA V1.29 — Security Hardening Verification

Date: 2026-08-29
Baseline: V1.28
Candidate: V1.29

## Frontend/session contract
- Remember checkbox now means **remember username only**.
- Login always sends `remember:false` to backend.
- `taphoa_session` is read/written only via `sessionStorage`.
- Legacy `localStorage` session token is purged on startup/session update.
- Password inputs request browser autocomplete off/new-password where applicable.
- New/changed customer passwords require at least 8 characters in UI.
- UI cache namespace bumped to `taphoa_ui_cache_v29_<uid>`.
- Supabase HTTPS endpoint unchanged.
- Business API call count unchanged: 29.

## Database hardening applied to project gcnoahqsrquxkwkjbuxy
Migration `lock_public_data_api_and_add_login_rate_limits`:
- RLS enabled on previously exposed internal/public helper tables.
- anon/authenticated direct table privileges revoked.
- `taphoa_*` RPC execute revoked from PUBLIC/anon/authenticated.
- explicit execute retained for `service_role`.
- default privileges hardened for future public tables/functions.
- `login_rate_limits` table reserved for a future Edge Function rate-limit implementation; it is RLS-protected and not exposed.

Migration `harden_sessions_password_changes`:
- any session expiry longer than 12 hours is clamped to 12 hours at DB level;
- changing `accounts.password_hash` revokes every active session for that account.

Migration `pin_taphoa_function_search_path`:
- every `public.taphoa_*` function is pinned to `search_path=public`.

## Runtime artifact
- V1.29 bytes: `186984`
- V1.29 SHA-256: `55d1d4696a93a5fa1eb8ff926c8b658258769a08b8699b62bc0b96c251e43b0d`

## Production verification
- Vercel production status: SUCCESS.
- old persistent sessions revoked: remaining sessions = 0 immediately after release.
- anon/authenticated executable `taphoa_*` RPC count = 0.
- targeted internal tables: RLS ON and direct anon/authenticated grants = 0.
- Security Advisor no longer reports RLS-disabled or public/authenticated SECURITY DEFINER execution warnings; remaining RLS-with-no-policy notices are INFO and are intentional deny-by-default because application data access goes through the service-role Edge Function.

## Business/data verification after hardening
- customer_summary reconciliation mismatch: 0
- customer_product_summary reconciliation mismatch: 0
- daily_summary reconciliation mismatch: 0
- invalid debt rows: 0
- invalid order-item qty/money rows: 0
- no business API action was added/removed by V1.29 frontend patch.

## Known residual risks / not changed in V1.29
- Edge Function still uses custom session auth with `verify_jwt=false` by design because login itself is handled by the function.
- CORS allowlist and login-attempt rate limiting require a later Edge Function source update; Data API/RPC bypass has already been closed at DB level.
- Browser password managers may still offer to save a password despite `autocomplete=off`; the application itself does not persist the password.
