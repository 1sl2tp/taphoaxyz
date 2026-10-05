# taphoa

Frontend mới của dự án `taphoa`, viết lại theo cấu trúc Cha → Con → Cháu.

Sau đăng nhập chỉ có 4 chức năng:

- Bán hàng
- Đã giao
- Đơn tạm
- Công nợ

## Chạy local

Chạy project qua HTTP server từ thư mục gốc, ví dụ:

```bash
python -m http.server 8080
```

Sau đó mở `http://localhost:8080`.

Không tách riêng `index.html` khỏi thư mục `src/`, vì source được tổ chức theo module để bảo trì.

## Backend

Frontend sử dụng Supabase backend hiện tại qua các RPC business contract đã có. Repository không chứa service-role key hoặc secret backend.


## External data — Single Source of Truth

Quy tắc hiện tại của TAPHOA:

- Supabase là **canonical business data** và là nơi duy nhất web đọc/ghi giá sản phẩm.
- Trang quản trị giá: `/admin-gia.html`. Chỉ tài khoản admin được phép đọc danh mục quản trị và sửa giá.
- Google Drive/Google Sheet đã rút khỏi runtime quản trị giá: không Drive Watch, không cron sheet-sync, không outbox đẩy giá về Sheet.
- Các bảng/cột sync Google cũ chỉ được giữ tạm như cấu trúc lịch sử/rollback; không được dùng làm nguồn sự thật.
- Web bán hàng nhận thay đổi giá qua revision/realtime của Supabase, không merge dữ liệu Sheet.
- GETLINK không tham gia luồng quản trị giá TAPHOA.
