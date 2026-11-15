# STAFF-ORDER-014 — Gửi một bản sao đơn cho nhân viên “gd me yeu”

## Nguồn sự thật (read-only, 15/11/2026)
- TAPHOA production `public.taphoa_save_order(jsonb,uuid)`: chỉ nhắn KH khi admin + có customer_id + trạng thái delivered; đơn pending chưa nhắn KH. Các lựa chọn customer được quyết định bởi `v21_private.chat_outbound_allowed`.
- `chat_outbound_options` đang bật send_order, send_order_edit, send_deliver, audience_linked/unlinked và global enabled. `chat_outbound_recipients`: 42 khách bật / 49 đã cấu hình.
- Tài khoản Chat **gd me yeu** khớp duy nhất, active, `role=user, contact_group=friend`, có hội thoại Chat và 1 liên kết Zalo với `thread_type=user`. Đây KHÔNG phải nhóm hoặc khách; target phải dùng ID ổn định, không dựa trên tên tìm gần đúng.
- `public.taphoa_deliver_order` là writer riêng cho đổi pending → delivered; phải được bao phủ.
- Hai repo TAPHOA và Chat dùng chung Supabase nhưng canonical writer đơn nằm trong TAPHOA. Không sửa Chat messaging pipeline/Zalo bridge.

## Given / When / Then
1. Given admin save đơn mới giao hoặc đơn tạm, có **hoặc không có khách**, when commit order được ghi, then một tin nội bộ riêng vào tài khoản **gd me yeu**, có mã DG/DT, tên khách/chưa chọn, trạng thái, giờ VN, mặt hàng (tối đa 18 dòng đầu), ghi chú, tổng. Không đưa PIN/link công nợ của khách cho nhân viên.
2. Given admin sửa đơn pending/delivered có thay đổi mặt hàng, SL, giá, STT, ghi chú đơn/dòng, khách hoặc trạng thái, when save, then một thông báo cập nhật và tóm tắt thay đổi đi cho nhân viên. No-op chỉnh lại đúng giá trị cũ KHÔNG gửi.
3. Given admin giao đơn pending qua RPC riêng, then nhân viên cũng nhận đúng một tin với trạng thái mới.
4. Given khách đã chọn, then luồng khách gốc chỉ gửi theo global/type/per-customer opt-in/audience như cũ; staff không dựa vào khách bật/tắt. Given chưa chọn khách, không sinh tin gửi KH khác, nhưng staff vẫn được thông báo.
5. Given retry cùng command UUID, then command log và `v21_messages(sender_account_id,client_id)` chống trùng. Không backfill và không gửi đơn cũ khi migration được cài.
6. Given target bị khoá, xoá, đổi nhóm, hoặc sender không còn là admin TAPHOA hợp lệ, then không đổi người nhận sang liên hệ gần giống; helper từ chối/không gửi.
7. Given lỗi tài khoản/bridge chưa được chứng minh, không tuyên bố Zalo đã nhận; cần quan sát status gửi thực tế. Không gửi tin test thật.

## Owner/Dependencies
- SQL owner: `supabase/migrations/20261115143000_taphoa_staff_order_copy_gd_me_yeu.sql` → chỉ cài helper nội bộ `v21_private.taphoa_staff_order_changed`/`taphoa_staff_order_notify`, thêm call vào 2 RPC admin hiện hữu qua exact anchor.
- Sử dụng duy nhất `v21_conversations` và `v21_messages`/Zalo pipeline có sẵn; không mở thêm transport/scheduler.
- Target là account ID cố định đã đối chiếu với DB, `role=user,contact_group=friend`, không phải giả vai trò employee.
- Lời nhắn nhân viên là nội bộ, **không phải hóa đơn PIN/ảnh PNG**. Ảnh PNG của khách vẫn giữ luồng cũ. Nếu muốn ảnh kèm, phải mở spec quyền media riêng trước.
- Không sửa customer-notification settings và không thêm toggle “người nhận” gây nhầm với khách.

## MUST-STAY/Negative
Giữ toàn bộ tiền/giá/vốn/thu nợ, phân quyền khách, order ID/lineNo, link và lịch sử; không gửi hàng loạt, không hồi tố. Không production DB edit/thực gửi thử ở bước soạn migration. KH đã tắt không được nhận vì staff bật. Không lộ PIN, không route Zalo group. Dòng quá dài rút gọn, báo số dòng còn lại.

## Acceptance E0–E5
- E0: metadata live + spec này.
- E1: migration source/contract tests và GitHub CI. Chưa là hành vi production.
- E2: SQL migration cần chạy trên DB thử nghiệm tách biệt và kiểm ACL, idempotent, no-op, không ảnh hưởng save_order; chưa được khẳng định cho tới khi có bằng chứng.
- E3: GitHub source commit không tự áp dụng migration; phải qua rollout DB được duyệt riêng, không dùng Pages deployment để thay thế.
- E4: chưa có tin thật kiểm chứng Chat/Zalo; sau rollout quan sát tự nhiên, không gửi test khách.
- E5: resource impact mỗi lệnh admin có thay đổi tối đa 1 message Chat thêm cho đúng một staff target (Zalo relay có sẵn), không cron/poller mới. Nếu target không hợp lệ helper trả null. Rollback bằng forward migration gỡ đúng hai lời gọi STAFF-ORDER-014 và helper sau kiểm tra; không xoá message lịch sử.
