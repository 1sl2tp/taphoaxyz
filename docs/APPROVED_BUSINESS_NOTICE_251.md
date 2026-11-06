# APPROVED-NOTICE-251 — Business notifications (approval 2026-11-06)

**Given** an enabled, opted-in customer and a genuine recorded sale/payment; **When** a delivered order, edited order, draft→delivered conversion, debt entry or collection receipt creates a Chat notification; **Then** only the already-authorized single message uses the approved concise text, exact customer link, business amounts, and the existing order/debt image ticket if supported.

- Owner: Supabase `taphoa_chat_order_receipt`, `taphoa_debt_transaction`, `taphoa_save_order`, `taphoa_deliver_order`. Bank auto/manual ACK text owner is in `1sl2tp/chat` and remains separate.
- MUST-STAY: `taphoa_command_log` replay; order status change rules; debt ledger amount and snapshots; outbound allowlist; Zalo split text/media delivery; original image pixels renderer; all historical messages; no scheduled sends, extra polling, or auto backfill.
- Bank auto receipt image remains pending a secure independent renderer; do not send a bank screenshot or build a fake image from live mutable balance. The existing `taphoa_debt_notice_image_ticket` is tied to manual transaction command IDs and cannot attach arbitrary auto bank receipts.
- Validation: SQL pure format previews, db code invariant checks, repo test, Supabase migration verification. No live customer sends performed for acceptance.
- Rollback: restore the previous formatter and finance functions from migration history in a forward migration; preserve all order/debt entries and queued customer messages.
