# NOTICE-282/283 — Thông báo đơn hàng theo sự kiện, không chờ 08:05

Ngày: **13/11/2026 (Asia/Ho_Chi_Minh)**. Owner: `1sl2tp/taphoaxyz:main`, Supabase project `vtqhbhrkdxirqeqkgylo`.

## Quy tắc vận hành sau sửa

- Khi **tạo đơn mới**, **chuyển đơn tạm thành đã giao**, hoặc **sửa thật đơn đã giao**, lưu và phát hành thông báo ngay qua `taphoa_chat_notify_customer` nếu toàn hệ thống/loại tin/khách được bật. Không có quiet hours 20:00–08:05 riêng cho đơn sửa. Không gửi thông báo nếu lưu no-op, khách tắt, giao dịch lỗi hoặc đơn không đúng trạng thái.
- Đơn sửa giữ được thay đổi **cũ → mới** qua `taphoa_chat_order_diff` rồi tiếp tục dùng Chat/Zalo/media pipeline, `client_id` duy nhất; không gửi hai lần khi retry.
- Các lịch **nghiệp vụ định kỳ** (tổng kết Agribank hôm trước, chu kỳ công nợ, bảng giá sáng) KHÔNG được dùng làm điều kiện trì hoãn thông báo đơn. Muốn sửa thời gian từng loại phải xử lý riêng; không kéo dài sang tất cả sự kiện.
- Các lịch **kỹ thuật** (OCR retry, tự thu, ACK, lưu trữ, keepalive) không phải giờ giới hạn và không bị tắt cùng luồng thông báo đơn.

## Chứng cứ và quy trình phát hành

- [NOTICE-282 migration](../supabase/migrations/20261113011000_notice282_immediate_order_edits.sql): đã chạy versioned Supabase migration `20261113010008`. Production read-only xác nhận `NOTICE-282: publication proceeds immediately` hiện diện, quiet-hour branch không còn.
- **DG333 / C Ngoan xx:** bản lưu 07:03 10 → 07:32 8. Queue có một ảnh đã staged. Dispatch idempotent có kiểm soát lúc **08:00:32 13/11/2026**: `sent=1, errors=0, images_attached=1`. Read-back `v21_messages` có **một** bản tin, nội dung “Duong trang 30kg: SL 10 → 8; Tổng: 6.450 → 5.160”. Zalo message links cho text và media đều `state=sent` với attempt=1. Không tuyên bố thiết bị khách đã đọc.
- [NOTICE-283 migration](../supabase/migrations/20261113011500_notice283_retire_0805_edit_cron.sql): đã chạy versioned migration `20261113010116`; chỉ `cron.unschedule('taphoa-order-edit-after-0805-vn')` **sau** khi queue không còn `pending`. Không xóa một tin nhắn, ảnh, ledger hay nhật ký nào.
- E2: [Verify TAPHOA](https://github.com/1sl2tp/taphoaxyz/actions/runs/43341420272) PASS cho migration/test NOTICE-282; [Publish TAPHOA](https://github.com/1sl2tp/taphoaxyz/actions/runs/43341420165) PASS. E4: read-back DB và Chat/Zalo outbound records; E5: việc khách mở/xem tin chưa được xác thực.

## Danh mục cron còn lại (kiểm tra Supabase 13/11/2026)

**Bật (11)**

| Job | Nhịp giờ VN | Phạm vi |
|---|---|---|
| `taphoa-price7d-advisory-0600-vn` | 06:00–06:44 mỗi ngày (cửa sổ thử gửi) | Báo giá nhóm |
| `taphoa-cycle-policy-due-notice-v1` | 08:00 mỗi ngày | Nhắc chu kỳ công nợ |
| `taphoa-bank-prevday-confirmed-0805-vn` | 08:05 mỗi ngày | Tổng kết chuyển khoản hôm trước |
| `chat-bank-report-0000-vn` | 00:00 mỗi ngày | Khóa báo cáo ngày |
| `taphoa-bank-auto-collection-ack-v1` | 2 phút/lần | Xử lý xác nhận tự thu |
| `taphoa-bank-verified-collect-retry-v1` | 2 phút/lần | Thử lại khoản thu đã đủ chứng cứ |
| `chat-bank-transient-bill-retry-5m` | 5 phút/lần | Thử lại lỗi OCR thoáng qua |
| `getlink-auto-update-worker` | 5 phút/lần | Worker cập nhật link |
| `v21-zalo-bridge-keepalive` | 10 phút/lần | Kiểm tra kết nối Zalo |
| `business-retention-daily` | 10:27 mỗi ngày | Dọn dữ liệu vận hành |
| `chat-operational-retention-daily` | 10:43 mỗi ngày | Dọn dữ liệu Chat |

**Đã tắt (5):** `taphoa-milk-advisory-0600-vn`, `taphoa-daily-advisory-0900-vn`, `chat-customer-care-auto-send`, `chat-customer-care-morning`, `chat-customer-summary-scan-5m`.

**Đã hủy (1):** `taphoa-order-edit-after-0805-vn`. Lịch này không còn tồn tại trong `cron.job`; chỉ luồng sự kiện mới có thể gửi thông báo sửa đơn, không trì hoãn đến 08:05.

## Rollback có kiểm soát

Khôi phục hàm qua migration duyệt riêng; không tái bật cron 08:05 khi hàm đã gửi tức thời vì sẽ tạo hai đường owner. Không hồi sinh các hàng queue trạng thái `sent` hoặc `skipped`, không tạo giao dịch giả để test.
