# SPEC-TAPHOA-MANUAL-DEBT-PNG-20261104 — Gửi ảnh công nợ TAPHOA → Chat → Zalo

## E0 · Given / When / Then
- **Given:** Admin được xác thực, đang mở đúng một modal công nợ khách hàng; khách tồn tại trong Chat; lệnh `manual:debt:<request_uuid>` đã được RPC TAPHOA xác nhận bằng `message_id`.
- **When:** Admin bấm **Gửi công nợ**. Một yêu cầu duy nhất tạo thông báo văn bản ở Chat rồi, nếu đủ điều kiện, phát hành ticket PNG cho **cùng message_id** và customer_id.
- **Then:** Đúng một ảnh PNG được tải vào `v21-media` với metadata đúng kích thước thực và được gắn vào `v21_media_assets` của **chính** tin nhắn. Kênh Zalo dùng owner hiện hữu, có trạng thái giao văn bản/ảnh độc lập; TAPHOA **không** tuyên bố Zalo đã nhận chỉ vì Chat đã có `message_id`.

## Owner / traversal
1. Nút menu `src/fixed-ui-debt-share-actions.js` (chỉ một click, giữ in-flight guard).
2. `src/fixed-ui-runtime-12.js` — handler `shareCustomerDebtImage`, chụp PNG chuẩn của modal.
3. `src/fixed-production-bridge.js::manualShareDebt` — `taphoa_manual_send_customer_debt` tạo text có idempotency; sau đó ticket / upload / attach có xác nhận.
4. Migration mới **chỉ có trong GitHub**: `supabase/migrations/20261104093000_taphoa_manual_debt_image_handoff.sql` (`v21_private.taphoa_manual_debt_image_uploads`, `taphoa_manual_debt_image_ticket`, `taphoa_manual_debt_image_attach`, Storage INSERT policy).
5. Chat `v21_media_assets` là nguồn media canonical; Zalo `bridge/zalo/` và `zalo_message_links` là transport owner, không thêm polling/worker.

## MUST-STAY / bảo mật
- Không đổi `taphoa_debt_ledger`, giao dịch thanh toán, order, giá/vốn hoặc chính sách nhắc nợ.
- Không gửi tin, giao dịch hay ảnh thật trong test; chỉ dữ liệu giả và mock.
- Không dùng `message_id` làm bằng chứng PNG hoặc Zalo đã nhận; không retry text khi RPC timeout/ambiguous.
- Validate Admin, đúng khách trong conversation, cùng `client_id`, `request_id`, `message_id`, Storage owner, MIME PNG, size và dimensions; ticket hết hạn sau 20 phút.
- Nếu đổi tài khoản, khách, đóng/mở modal hoặc modal epoch A→B→A trong lúc render thì hủy upload.
- Lưu/Sao chép PNG là hành động thiết bị độc lập, không thay đổi đường truyền Chat/Zalo.
- Một thao tác thành công phát sinh thêm đúng 1 ticket RPC + 1 Storage upload + 1 attach RPC; không thêm interval/cron/polling.
- Chat text fallback giữ nguyên nếu migration PNG chưa được triển khai; PNG/Zalo ACK phải hiển thị chưa xác minh.

## Kiểm thử và bằng chứng
- Unit/mocks TAPHOA: `tests/manual-debt-image-handoff-20261104.test.js`, `tests/debt-image-export-shared-capture.test.js`, `tests/debt-chat-zalo-handoff-20261104.test.js`, `tests/cart-debt-share-single-image.test.js`, `tests/notice-image-session-owner-20261101.test.js`.
- Unit/mocks Chat: `tests/test_chat_debt_png_zalo_ack_20261104.cjs` kiểm ACK text/media riêng, trường hợp PNG thất bại.
- Negative: wrong recipient, stale modal, chuyển user, response message mismatch, expired/denied ticket, lỗi upload, duplicate/timeout, missing migration, quyền Admin.
- Verify TAPHOA / Chat: luôn tra GitHub Actions **đúng SHA**. `npm test` thất bại ⇒ GitHub Pages publish phải BLOCK, không bỏ qua lỗi.
- **E2 integration thật:** PENDING — cần Supabase migration ở môi trường test và RLS/Storage integration test, tuyệt đối không dùng production để thử.
- **E3 release:** PENDING — không deploy thủ công, không coi CI PASS là đã phát hành.
- **E4 production/browser:** PENDING — cần xác minh click trên account test, tin Chat media thật và trạng thái Zalo; chưa có bằng chứng iOS PWA.
- **E5 resource/user acceptance:** PENDING — chưa đo trước/sau (RPC, storage bytes, outbound/egress), chưa nghiệm thu cuối.

## Kế hoạch phát hành và rollback
- Migration GitHub này **chưa được áp dụng vào DB production**. Không tự chạy SQL/DDL production. Chỉ áp dụng theo kế hoạch phát hành có rollback và người sở hữu DB kiểm soát.
- Nếu không có ticket, UI giữ kết quả text và báo rõ ảnh chưa đính kèm; không tự gửi lại.
- Rollback source: hoàn nguyên đúng các thay đổi liên quan `manualShareDebt` và callback chụp PNG, giữ đường text hiện hữu; không đụng dữ liệu nợ/đơn. Rollback schema chỉ sau khi xác minh asset/ticket còn sống và có kế hoạch bảo toàn dữ liệu.
- Không tự khởi chạy deploy, không tạo worker/cron/watch mới.
