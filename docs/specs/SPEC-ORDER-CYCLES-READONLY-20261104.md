> **HISTORICAL / ĐÃ THAY THẾ VỀ HẠN THANH TOÁN (04/11/2026).**
> Văn bản dưới đây từng nhầm **mốc từng đơn** với **chu kỳ thanh toán**.
> Quy định gốc trong `src/customer-policy-notice.js` chỉ có **một chu kỳ
> thanh toán cho toàn bộ đợt nợ đang mở**; mốc tất toán là 3 ngày ngừng nhập
> hoặc D7 từ ngày mở nợ (hoặc đạt hạn mức theo thỏa thuận), điều kiện đến trước.
> Các mốc/giá trị theo đơn chỉ là dữ liệu lịch sử nhập hàng, **không được hiển thị
> như các hạn công nợ độc lập**. Xem quy định đang áp dụng:
> [SPEC-PAYMENT-PERIOD-CANONICAL-20261104](SPEC-PAYMENT-PERIOD-CANONICAL-20261104.md).
> Các phần dưới đây giữ lại chỉ để ghi nhận thay đổi đã thực hiện.

# SPEC-ORDER-CYCLES-READONLY-20261104

## E0 — Yêu cầu / Given–When–Then

Người vận hành yêu cầu **chỉ sửa cách tính và hiển thị**, chưa gửi nhắc khách, chưa sửa chính sách nhắc tự động.

- **Given** khách còn dư nợ dương (trong sổ TAPHOA, dư nợ dương là đang nợ) và nhận các đơn giao hợp lệ.
- **When** một đơn giao thành công được ghi trong sổ, **Then** mỗi **order_id** có một chu kỳ D1→D7 riêng. Hai đơn cùng ngày là hai chu kỳ, cùng D7. Mua thêm không gia hạn chu kỳ trước. Hạn D7 = ngày giao hàng ở Việt Nam **+ 6 ngày**.
- **When** khách mua lại, **Then** số ngày không mua tính lại từ ngày giao gần nhất, và mốc kiểm tra 3 ngày = ngày giao gần nhất **+3 ngày**. Không gửi thông báo tự động trong tính năng này.
- **When** khách trả một phần nhưng tổng nợ vẫn dương, **Then** giữ nguyên các chu kỳ theo đơn và hạn D7. Không tự phân bổ khoản thu vào đơn cụ thể khi không có chứng cứ phân bổ.
- **When** tổng dư nợ về **0 hoặc âm**, **Then** không còn chu kỳ đơn đang mở; vẫn giữ sổ và lịch sử đợt nợ. Nếu sau đó phát sinh nợ mới, đợt nợ mới mở và CK1 được đánh lại từ đơn giao đầu tiên.
- **When** đơn bị đảo/reversal, **Then** không tính là lượt mua hợp lệ; không tạo lại mốc D7 từ đơn đó.
- **When** User xem, **Then** RPC chỉ trả dữ liệu của tài khoản chính mình; Admin đọc được danh sách nhiều khách, không phải tài khoản không đăng nhập.

## E1 — Owner và hành vi giữ nguyên

- Source SQL **chỉ đọc**: `supabase/migrations/20261104211500_taphoa_order_cycles_readonly_admin_user.sql` — `public.taphoa_order_cycles_view()`. Lọc quyền bằng `taphoa_access_context`, không cho `anon`/PUBLIC EXECUTE, chỉ `authenticated`. SQL window xác định ranh giới đợt nợ từ **số dư chạy**; từ đợt đang mở tạo mốc theo **từng order_id**.
- API: `src/core/business.js`, `src/fixed-production-bridge.js` thêm **chỉ một lệnh đọc** `orderCycles()`. Chặn luồng link nhân viên/khách công khai chưa xác thực theo account; kiểm session owner sau await.
- UI: `src/fixed-ui-debt-cycles.js` hiển thị trên thẻ và modal Công nợ; Admin vẫn có lịch sử theo tháng và đợt nợ cũ dưới tên **đợt nợ**, không gọi đó là chu kỳ từng đơn. User xem mốc của chính mình. Danh sách chi tiết giới hạn 60 hàng để giảm tải modal; **tổng số và hạn sớm nhất tính trên toàn bộ đơn**.
- **Không chỉnh** `taphoa_debt_ledger`, `taphoa_orders`, tài khoản, số dư, hàm `taphoa_cycle_policy_snapshot`, các lịch cron hoặc bất cứ hàm gửi Chat/Zalo nào. Nhắc nợ tự động hiện hữu là nghiệp vụ độc lập, không được kích hoạt từ phần hiển thị.

## E2 — Kiểm thử

- Node: `tests/order-cycles-admin-user-readonly-20261104.test.js` test hai đơn cùng ngày, ba mốc D7 độc lập, Admin vs User và không lộ lịch sử Admin.
- PostgreSQL 17 cô lập (tài khoản và đơn giả): `tests/sql/order-cycles-readonly-isolated-20261104.sql`, chạy trong `.github/workflows/verify-manual-debt-png-postgres.yml`; test đủ điều kiện trả nợ một phần, tất toán toàn phần, mở lại đợt nợ, kiểm quyền và không có DML trong RPC.
- Kết quả cô lập: https://github.com/1sl2tp/taphoaxyz/actions/runs/41840744291 — PASS.
- Verify Node + build trên code source: https://github.com/1sl2tp/taphoaxyz/actions/runs/41840965810 — PASS.

## E3–E5 — Triển khai, đối chiếu và giới hạn

- Supabase migration tên `taphoa_order_cycles_readonly_admin_user_20261104` **SUCCESS** ngày 2026-11-04. SELECT xác minh hàm mới tồn tại, EXECUTE được cấp cho authenticated và không cấp cho anon/PUBLIC, chỉ phân phối User theo account ID, tính D7 và mốc 3 ngày, chỉ lấy đợt đang nợ.
- Frontend index cập nhật cache source để GitHub tự publish. Verify và publish cuối cùng phải xem tại Actions của đúng commit.
- **E4 trên thiết bị và tài khoản thật: PENDING** cho đến khi giao diện Admin và User được mở sau refresh. Không thực hiện ghi tiền, gửi nhắc, Zalo hay tạo đơn test trên production.
- Rollback: revert JS/CSS về bản trước và `DROP FUNCTION public.taphoa_order_cycles_view()` chỉ sau đánh giá quyền phụ thuộc; không xóa hoặc chỉnh sửa ledger/lịch sử.
