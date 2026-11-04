# SPEC-PAYMENT-PERIOD-CANONICAL-20261104 — Một chu kỳ thanh toán cho một đợt nợ

## Chính sách gốc và lỗi
Nguồn chính sách khách hàng hiện tại: `src/customer-policy-notice.js`, mục **02 Thanh toán theo hạn mức**. Khách có thể nhập nhiều đơn trong **một chu kỳ nợ**. Toàn bộ công nợ phải tất toán ở điều kiện nào đến trước: **đạt hạn mức thỏa thuận**, **ngừng nhập đủ 3 ngày liên tiếp** (ngày mua là D1, nếu D2–D4 không mua thì D4 phải trả) hoặc **D7 từ ngày mở chu kỳ**. Mua tiếp không gia hạn D7 và không xóa hạn đã xảy ra trong quá khứ. Chỉ tất toán hết nợ thì kỳ nợ được đóng. Chính sách không áp dụng trả đuổi.

Lỗi UI đã được xác nhận từ ảnh user: Cô Ngọc tt, nợ 143.333 (nghìn), mở chu kỳ 04/10/2026, mua cuối 29/10, nhưng UI lại báo 7 “chu kỳ theo đơn”, 5 hạn D7, mốc 3 ngày 01/11 và các số tiền “còn ước tính” từng đơn. Đây là cách hiểu sai: **đơn không phải một chu kỳ thanh toán độc lập**.

Đối chiếu chỉ đọc trên production ngày 04/11/2026 bằng `v21_private.taphoa_cycle_policy_snapshot(uuid)`: **đợt nợ 1**, D7 10/10, mốc ngừng nhập đầu tiên 07/10, hạn chính sách **07/10**, đã quá hạn **28 ngày**. Lần mua 29/10 không được gia hạn hạn này.

## Contract sửa chữa
- **E0:** Một hạn thanh toán duy nhất cho đợt nợ đang mở: `paymentPolicy.dueDay`, do chính `v21_private.taphoa_cycle_policy_snapshot()` tính. Ưu tiên 3 ngày ngừng mua hoặc D7, điều kiện đến trước. Không tạo công thức độc lập trong JS. Hạn mức riêng của từng khách **chưa có trong schema hiện tại**, không tự suy diễn 50/100 triệu; giao diện nhắc quy định đạt hạn mức theo thỏa thuận nhưng chưa đánh dấu tự động.
- **E1:** `supabase/migrations/20261104224500_taphoa_payment_period_policy_projection.sql` chỉ bổ sung thuộc tính `paymentPolicy` vào RPC Admin/own User `taphoa_order_cycles_view()`, giữ quyền kiểm soát tài khoản đang dùng. Không sửa policy nguyên gốc, ledger hoặc đơn hàng.
- **E1 UI:** `src/fixed-ui-debt-cycles.js` trình bày **Đợt nợ / Chu kỳ nợ** duy nhất; trạng thái/hạn quá hạn, mốc ngừng mua, D7 và thanh tiến trình 7 ngày của **đợt nợ**, không của từng đơn. Lịch sử nhập đơn được gấp gọn, mới nhất lên trên, chỉ hiển thị ngày nhập và giá trị đơn, **không gán hạn riêng hoặc phân bổ thu tạm tính cho mỗi đơn**. Lịch sử tháng và đợt nợ cũ chỉ Admin xem.
- **E2:** `tests/order-cycles-admin-user-readonly-20261104.test.js` xác minh UI, và `tests/sql/order-cycles-readonly-isolated-20261104.sql` chạy chính sách SQL thực trên PostgreSQL giả: trường hợp ba ngày không nhập đến trước; khách mua đều thì D7 đến trước; mua sau khi đã trễ không reset hạn; trả một phần giữ nợ; hết nợ rồi mở kỳ mới; User không thấy người khác. Không chạy tin nhắn hay giao dịch production để thử.
- **E3:** Chỉ deploy RPC đọc và cache-bust bản UI qua GitHub chính repo. Không chỉnh cron, Zalo, Chat, thông báo tự động hoặc sổ tiền. `E4/E5` chỉ xác nhận sau khi người dùng xem được Admin/User trên thiết bị thực.
- **Rollback:** Revert JS/CSS nếu cần; phục hồi định nghĩa RPC đọc từ migration `20261104220000_taphoa_order_cycles_unpaid_due_readonly.sql` **chỉ sau khi đánh giá ảnh hưởng**. Không xóa dữ liệu và không áp dụng rollback của tiền.

## Phân biệt lịch sử mua và chu kỳ thanh toán
Mỗi đơn vẫn là một sự kiện nhập hàng với ID, ngày và giá trị riêng, dùng để xác định **ngày mua gần nhất** và **các khoảng ngừng nhập**. Nhưng không tự mở “CK2”, “CK3” khi công nợ chưa về 0; không gọi D7 của từng đơn là “hạn tất toán”. Khi đã có hạn ngừng nhập trong lịch sử, mua lại sau hạn không xóa nó. Mốc thanh toán tính trên toàn bộ công nợ còn lại, không cộng/trừ “nợ từng CK” theo phân bổ giả định.
