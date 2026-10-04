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

Quy tắc bắt buộc dùng chung: `1sl2tp/infrastructure/rules/02-EXTERNAL-DATA-SINGLE-SOURCE-OF-TRUTH.md`.

- Supabase mới `1sl2tpvn` là canonical business data của TAPHOA.
- Google Drive/Sheet là source document và change signal, không phải database runtime thứ hai.
- TAPHOA là **watch owner duy nhất** của file Quản trị dùng chung.
- GETLINK không có runtime Google Drive/Sheet và không nhận wake từ TAPHOA.
- Web chỉ đọc business state từ Supabase; không merge live Sheet + Supabase.
