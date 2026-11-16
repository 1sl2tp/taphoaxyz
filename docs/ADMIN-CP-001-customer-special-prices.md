# ADMIN-CP-001 · 16/11/2026 · Giá riêng theo khách trên bảng quản trị hàng hóa

## Trạng thái triển khai đã xác minh — 16/11/2026 (giờ Việt Nam)
- **ĐÃ ÁP DỤNG production theo cho phép cụ thể của chủ dự án**: Supabase migration `admin_customer_special_price_columns_20261116`, phiên bản cơ sở dữ liệu `20261116010111`.
- Đã xác minh: bảng `public.taphoa_customer_special_prices` tồn tại, RLS bật, bảng chưa có dữ liệu; cả ba RPC tồn tại, `anon` không thể gọi, `authenticated` có quyền gọi nhưng đều có kiểm tra Admin theo `taphoa_access_context()`.
- Đã thử cả ba RPC không có phiên đăng nhập: đều bị chặn `42501`.
- Có 60 tài khoản khách hàng đủ điều kiện tại thời điểm kiểm tra; chưa tạo giá thử, chưa viết dữ liệu giá cho bất kỳ khách nào.
- **Chưa E4 với phiên Admin thật trên Web/PWA**, và chưa bật hiệu lực giá riêng trên giá niêm yết của khách, giỏ, đơn, PIN; cần kiểm thử riêng trước khi thay đổi giá thương mại.
- Không triển khai lại migration đang có; các thay đổi tiếp theo yêu cầu migration mới, không cập nhật trực tiếp giá chung hoặc hóa đơn.


**E0** Ảnh người dùng: bảng Hàng hóa hiển thị giá chung và cần `+ Khách`, mở nhiều cột theo tên khách, nhập giá riêng tại từng dòng sản phẩm; không sao chép/mất giá chung.
**Owner** `admin-gia.html` + `src/admin-customer-special-prices.js`; backend do migration riêng `20261116005500_admin_customer_special_price_columns.sql`.

**Given** Admin hiện hành, sản phẩm có giá vốn >0 và khách `role=user/contact_group=customer`.
**When** chạm + Khách → tìm khách → chọn → thêm một cột ngay sau Giá bán; nhập giá riêng cho mã SP; rời ô/Enter → Admin RPC ghi riêng.
**Then** DB đặt PK `(customer_id, product_code)`. Giá trống xóa ngoại lệ (fallback giá chung). Ẩn cột không xóa giá đã lưu, mở lại sẽ đọc lại. Tối đa 8 cột để giữ hiệu năng.
**Editing guard** Trước khi đổi trang/nguồn hoặc đăng xuất phải flush giá riêng, nếu chưa lưu thì không âm thầm mất giá.
**Error/security** Trang không mở bộ chọn khi backend chưa có API; tự kiểm tra khi Admin đăng nhập, nút + Khách bị khóa cho tới khi RPC xác nhận, hiển thị trạng thái tiếng Việt và có nút “Kiểm tra lại”. Không có RPC/mất mạng: khóa input, báo rõ; không xác nhận lưu giả; admin-only check ở SQL, bảng private RLS enabled/no open access; không đưa dữ liệu khách vào localStorage; async response kiểm tra phiên admin và trạng thái màn hình.

**Important staged gate:** Migration chỉ lưu ngoại lệ và hiển thị trong Admin. **Chưa tự điều chỉnh** giá của khách trong Web/PWA, PIN hay hóa đơn/giỏ đã lưu; các đường customer/PIN có security wrapper riêng cần một SPEC kiểm thử tích hợp trước khi bật giá thương mại. Không được quảng cáo giá riêng đã áp vào đơn hàng khi gate này chưa hoàn tất. Production migration đã triển khai đúng phạm vi được cho phép ngày 16/11/2026; không tự triển khai migration khác.
**MUST-STAY** không sửa giá sale mặc định, công nợ, lịch sử đơn, Chat/Zalo, OTP/PIN, Supabase server production hoặc cron; không có send thật; không triển khai migration bằng tay.
**Rollback** revert UI HTML+module; dữ liệu DB mới (nếu triển khai sau này) giữ nguyên, không drop.
**E1** CI nguồn và cấu hình đã đạt. **E2** migration, DB schema, ACL, chặn các RPC khi không có phiên: PASS; chưa chạy thao tác lưu giá trong phiên Admin thật. **E3** frontend đã có bản build phát hành; backend 3 RPC đã sẵn sàng. **E4/E5** kiểm thử Admin Web/PWA thực tế và áp giá thương mại theo khách: CHƯA THỰC HIỆN.

## ADMIN-CP-002 · Gợi ý chọn lại khách đã áp giá riêng · 16/11/2026

- Trên bảng Quản trị hàng hóa, hiển thị các khách đã có ít nhất một sản phẩm với giá riêng trong mục **Khách đã có giá riêng**. Mỗi gợi ý hiển thị tên và số sản phẩm. Tối đa 8 gợi ý; còn lại xem tại bộ chọn.
- Bấm gợi ý mở lại cột giá riêng của khách, với giá theo mọi nhóm sản phẩm đã lưu. Nếu cột đang mở thì cuộn tới cột, không tự xóa hay ẩn. Khi thêm cột, phải đợi các lần lưu trước hoàn tất.
- API danh sách khách hiện có trả thêm trường `price_count` được tính trực tiếp từ `taphoa_customer_special_prices`, xếp người có giá riêng lên đầu theo cập nhật gần nhất. Chỉ admin được đọc qua RPC có `taphoa_access_context()`; không có quyền trực tiếp vào bảng.
- Gợi ý cập nhật sau khi Admin lưu hoặc xóa giá riêng thành công trong phiên; không dựa vào localStorage. Trường hợp chưa có giá riêng thì vùng gợi ý ẩn, nút **+ Khách** vẫn bình thường.
- Phần này là thao tác hiển thị/đọc, không thay đổi giá bán chung, giỏ, đơn hàng, công nợ, Chat/Zalo hoặc scheduler.
- E1: `tests/admin-customer-price-suggestions-20261116.test.js`. E2: xác nhận quyền Admin và count khớp DB. E3/E4: xác nhận Web/PWA sau khi phát hành.
