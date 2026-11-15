# STAFF-IMAGE-015 — Gửi ảnh phiếu đơn cho gd me yeu

**Trigger:** Ảnh Chat của gd me yeu lúc 14:29 15/11/2026 hiển thị DG356 ở dạng chữ dài; người dùng yêu cầu “gửi dạng ảnh”.

**Root owner:** Không tạo renderer mới. `src/fixed-ui-portrait-order.js` là chủ ảnh chuẩn 5 cột, dùng lại từ `src/fixed-production-bridge.js::attachOrderNoticePortrait`; `src/core/business.js` chuyển command ID chính xác của save/deliver. SQL chỉ cung cấp ticket/attach độc lập cho staff trên cùng bảng media/ticket hiện có, không sửa customer opt-in/renderer.

**Given/When/Then**
- Given admin lưu đơn mới, sửa đơn, giao đơn; có hay chưa có khách, pending hoặc delivered; when server trả `order` và command id; then client tạo PNG từ **dữ liệu đơn đã lưu trong kết quả** và gắn vào **tin staff đã tồn tại**. Không tự tạo tin Chat mới. Sau khi gắn media, trigger hiện có enqueue outbound media Zalo.
- Given khách không nhận tin hoặc chưa chọn khách, when lưu, then vẫn gắn ảnh cho nhân viên nhưng customer image không đổi và không bị lách chọn nhận.
- Given no-op edit, when staff SQL không tạo Chat message, then staff ticket trả `ok:false` và không upload một hình vô chủ.
- Given đăng xuất/đổi account khi await, when chuẩn bị upload, then helper kiểm owner và bỏ qua; không gửi nhầm.
- Given text failure/canvas fail/no media/expired ticket, then văn bản staff vẫn là phương án dự phòng; không rollback order, không lặp sale, không phát lại đơn quá khứ.
- Given một command retry, then đúng một `message_id`, một ticket, một asset; không trùng thông báo.
- Given attacker authenticated không phải admin, then không có đường đọc ticket hoặc attach của người khác. Message phải thuộc cặp sender ↔ recipient cố định `gd me yeu`. Auth.uid, user-owned Storage, exact SHA command-log order identity, TTL 20 phút, PNG MIME 15 MB, kích thước 20000 đều được kiểm tra.
- Given Zalo chưa xác nhận, then chỉ nói `media queued` sau khi tồn tại `zalo_message_links.delivery_part='media'`; không tuyên bố “đã giao” khi chưa xác minh trạng thái provider.

**MUST-STAY:** giữ hóa đơn 5 cột, STT/SL/giá/tổng; KH bật/tắt độc lập, ticket khách vẫn nguyên, không lộ PIN, không tạo group, không cron, không tin test, không backfill DG356. Trên iPhone/Android dùng Canvas2D local (fallback cũ), size limit. Ảnh + nội dung chữ ở **cùng** Chat message để có fallback khi ảnh lỗi.

**E0** spec. **E1** contract + SQL PostgreSQL disposable tests. **E2** migration mới chưa tự chạy khi cập nhật GitHub; cần phê duyệt rollout DB riêng. **E3** GitHub Actions/Pages chứng minh code live chứ không chứng minh media gửi. **E4** kiểm chứng 1 đơn phát sinh *tự nhiên* sau rollout, bảng v21_media_assets và zalo_message_links. **E5** mỗi đơn admin tối đa 1 PNG upload staff cộng đường ảnh KH hợp lệ có sẵn; không poller/API renderer khác.

Rollback: revert client commit, forward DROP hai RPC staff-image-015; không xóa lịch sử đơn/tin/ảnh đã gửi.
