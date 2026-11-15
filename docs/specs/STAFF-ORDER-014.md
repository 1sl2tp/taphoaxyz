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
- E2: có test thực thi migration nguyên văn trên PostgreSQL 17 tách biệt tại `tests/sql/staff-order-notice-014-isolated.sql` (không thông tin thật). Kiểm: khách lẻ, khách đã chọn, sửa có/không thay đổi, retry, chuyển đơn giao, tài khoản nhận khoá, quyền `authenticated` và ngữ cảnh admin giả. PASS chỉ khi GitHub Actions báo thành công trên commit tương ứng.
- E3: GitHub source commit không tự áp dụng migration; phải qua rollout DB được duyệt riêng, không dùng Pages deployment để thay thế.
- E4: chưa có tin thật kiểm chứng Chat/Zalo; sau rollout quan sát tự nhiên, không gửi test khách.
- E5: resource impact mỗi lệnh admin có thay đổi tối đa 1 message Chat thêm cho đúng một staff target (Zalo relay có sẵn), không cron/poller mới. Nếu target không hợp lệ helper trả null. Rollback bằng forward migration gỡ đúng hai lời gọi STAFF-ORDER-014 và helper sau kiểm tra; không xoá message lịch sử.

## E4 field evidence — 15/11/2026 (read-only)

- Người dùng tạo **DG355** (Đã giao) lúc **14:09:11 giờ Việt Nam**; ảnh danh sách Chat lúc 14:11 vẫn hiển thị cuộc trò chuyện **gd me yeu** gần nhất 10:41. Read-only SQL xác nhận DG355 tồn tại và có command log save_order (1 lệnh), **không có** tin Chat chứa DG355.
- Production Supabase kiểm tra cùng thời điểm: `v21_private.taphoa_staff_order_notify` absent; `taphoa_staff_order_changed` absent; các hook STAFF-ORDER-014 trong `taphoa_save_order` và `taphoa_deliver_order` đều absent. **Đây là blocker triển khai database, không phải lỗi CSS/PWA và không thể sửa bằng Pages publish.**
- Tài khoản nhân viên vẫn active, có một Chat thread và một Zalo link. Không có staff outbound mới kể từ 10:41.
- Đơn DG355 có customer_id, nhưng cài đặt nhận tin riêng của khách này `chat_outbound_recipients.enabled=false`; `chat_outbound_allowed(..., ':order')=false`. **Không thay đổi lựa chọn này.** Luồng nhân viên phải độc lập với lựa chọn nhận của khách.
- Migration đã vượt kiểm thử PostgreSQL 17 tách biệt trên GitHub Actions: `43688613503`, PASS. **Không thể suy ra production đã cài**. Bước E3 DB rollout vẫn **PENDING**; E4 Chat + trạng thái outbound Zalo sau rollout vẫn **PENDING**.
- Tránh gửi bù DG355 khi cài migration: hành vi được phép là chỉ nhận đơn **phát sinh sau khi cài**; nếu muốn bù đơn quá khứ phải có một yêu cầu riêng, chống gửi trùng và kiểm tra lại người nhận.
- Guardrail: không tự thay đổi production DB, không deploy thủ công hoặc gửi tin thật khi chưa có quyền thay đổi DB được phê duyệt. Rollout phải áp dụng chính migration source `20261115143000_taphoa_staff_order_copy_gd_me_yeu.sql`, ghi lịch sử migration, kiểm 4 hàm/hook, sau đó quan sát đơn tự nhiên; không kích hoạt lại các lịch gửi quảng bá cũ.
