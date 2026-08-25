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
