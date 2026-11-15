# ORDER-IMAGE-016 — one image to selected customer and gd me yeu

User clarification (15/11/2026): **Tạo đơn / sửa đơn → khách đã chọn + gd me yeu; chỉ gửi phiếu ảnh, không kèm bubble chữ**. Deliver promotions use same rule. For unselected customer, only gd me yeu. No-op edits never notify.

- Database migration `supabase/migrations/20261115163000_order_notification_image_only_both_recipients.sql` adds ONE narrow BEFORE INSERT trigger on `v21_messages` affecting only canonical auto order events `taphoa:<UUID>:(order|order-edit|deliver|staff-order)` from a valid admin. `body=''` allows the pre-existing Zalo text outbox trigger to skip and Chat to render the media-only message after upload. No global Chat body changes: manual messages, finance receipts, product advice remain unchanged.
- The existing customer ticket is preserved with all checks and extended to find the blank message by **exact command_log ID → order ID**, not by text or nearest timestamp alone.
- `taphoa_save_order` now also adds image-only envelopes for selected customers for newly created/edited **pending** orders with real changes, using the same existing `chat_outbound_allowed` gate. Delivered events stay within original rules. No customer selected → no customer notification. A customer who disabled automatic notices is not overridden.
- `src/fixed-production-bridge.js` uses the existing Canvas2D portrait renderer and same media upload for a selected pending customer and staff; delivered customer image remains unchanged. Up to one PNG per qualifying recipient per command, tied to exact existing message.
- Image failure: no misleading “sent image” claim; no text fallback should be broadcast, no order resubmission. Retain committed order and return flags `image_attached` / `staff_image_attached` for visibility.
- Existing text + image messages created *before* migration remain untouched (no delete/backfill); only future committed orders use the image-only envelope.
- E0 this spec. E1 contracts and disposable PostgreSQL 17 tests PASS for source commit `9e1b700` (CI `43692708493`, `43692708497`). E2 migration `order_notification_image_only_both_recipients_20261115` applied successfully to production 15/11/2026, migration version `20261115080513`; postflight verified trigger enabled, customer ticket/pending hook, consent gate, staff media functions. E3 GitHub Pages publish PASS (`43692708469`) for `9e1b700`. E4 no new natural order notifications after rollout at the time of inspection, so actual Chat and Zalo media delivery is still unverified. E5 no cron/new route/no access broadening.
- Rollback: forward remove this narrow trigger, revert ticket lookup and pending hook via audited forward migration, revert frontend; preserve existing media and customer preferences.

## Correction ORDER-NOTIFY-017 — 15/11/2026

The user explicitly corrected the previous interpretation: **“đơn tạm không gửi gì cả”**. This supersedes the draft-notification section above. Final automatic matrix: pending created/edited => **NO** Chat/Zalo notice to customer OR staff; delivered created, promoted or meaningfully edited => image-only to permitted selected customer and pinned staff. Walk-in delivered => staff only. Existing unrelated manual explicit share remains a separate opt-in user action, not an automatic order notification.

The forward migration `supabase/migrations/20261115170000_disable_pending_order_auto_notice.sql` removes the pending customer branch, gates the staff hook by delivered state and adds a defense-in-depth pending check in the helper. The frontend does not request auto PNG for pending. No backfill, delete or historical message changes.

### ORDER-NOTIFY-017 deployed — 15/11/2026

- User correction: **đơn tạm không tự gửi**. Only delivered create, delivery transition and delivered edits produce image notices (selected, opted-in customer + gd me yeu).
- Source `src/fixed-production-bridge.js` no longer uploads automatic PNG for pending; frontend entry version `order-image=20261115-017`, service worker cache v41.
- Production migration `disable_pending_order_auto_notice_20261115` applied successfully, logged in Supabase migration history. Read-only verification: pending customer hook absent, staff save guard requires `v_status='delivered'`, staff helper rejects statuses other than done/delivered, existing customer delivered and standalone delivery paths retained, image-only trigger still active and staff account valid.
- Isolated PostgreSQL regression PASS (run `43693635542`) for pending create/edit silent and delivered notifications. GitHub application CI + publish PASS on final release SHA `7ab794e` (runs `43693879055`, `43693879127`).
- Do **not** backfill or delete older messages. E4 media delivery on a naturally occurring future delivered order still requires provider observation. No real test messages sent.
