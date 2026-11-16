# ADMIN-CP-001 · 16/11/2026 · Giá riêng theo khách trên bảng quản trị hàng hóa

**E0** Ảnh người dùng: bảng Hàng hóa hiển thị giá chung và cần `+ Khách`, mở nhiều cột theo tên khách, nhập giá riêng tại từng dòng sản phẩm; không sao chép/mất giá chung.
**Owner** `admin-gia.html` + `src/admin-customer-special-prices.js`; backend do migration riêng `20261116005500_admin_customer_special_price_columns.sql`.

**Given** Admin hiện hành, sản phẩm có giá vốn >0 và khách `role=user/contact_group=customer`.
**When** chạm + Khách → tìm khách → chọn → thêm một cột ngay sau Giá bán; nhập giá riêng cho mã SP; rời ô/Enter → Admin RPC ghi riêng.
**Then** DB đặt PK `(customer_id, product_code)`. Giá trống xóa ngoại lệ (fallback giá chung). Ẩn cột không xóa giá đã lưu, mở lại sẽ đọc lại. Tối đa 8 cột để giữ hiệu năng.
**Editing guard** Trước khi đổi trang/nguồn hoặc đăng xuất phải flush giá riêng, nếu chưa lưu thì không âm thầm mất giá.
**Error/security** không có RPC/mất mạng: khóa input, báo rõ; không xác nhận lưu giả; admin-only check ở SQL, bảng private RLS enabled/no open access; không đưa dữ liệu khách vào localStorage; async response kiểm tra phiên admin và trạng thái màn hình.

**Important staged gate:** Migration chỉ lưu ngoại lệ và hiển thị trong Admin. **Chưa tự điều chỉnh** giá của khách trong Web/PWA, PIN hay hóa đơn/giỏ đã lưu; các đường customer/PIN có security wrapper riêng cần một SPEC kiểm thử tích hợp trước khi bật giá thương mại. Không được quảng cáo giá riêng đã áp vào đơn hàng khi gate này chưa hoàn tất. KHÔNG tự apply production DB.
**MUST-STAY** không sửa giá sale mặc định, công nợ, lịch sử đơn, Chat/Zalo, OTP/PIN, Supabase server production hoặc cron; không có send thật; không triển khai migration bằng tay.
**Rollback** revert UI HTML+module; dữ liệu DB mới (nếu triển khai sau này) giữ nguyên, không drop.
**E1/E2** static/source + CI. **E3** frontend deployment may succeed, but feature will show disconnected until authorized DB rollout. **E4/E5** Admin device test & customer-specific effective pricing PENDING.
