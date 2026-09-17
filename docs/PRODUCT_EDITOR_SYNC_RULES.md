# PRODUCT EDITOR SYNC RULES

Áp dụng cho Cài đặt → Cập nhật sản phẩm.

1. Mỗi lần chỉ sửa và kiểm tra một thao tác: Tạo nguồn → Thêm sản phẩm → Sửa giá → Xóa dòng.
2. Gate đầu tiên luôn là Web ↔ Supabase. Chỉ khi thao tác đó ghi thật vào Supabase và web đọc lại đúng mới chuyển sang bước kế tiếp.
3. Không coi thay đổi local/UI là đã lưu.
4. Với phạm vi này, thay đổi được đưa trực tiếp vào `main` theo yêu cầu hiện tại của dự án; trước khi chốt phải chạy test/build hiện có và kiểm tra production publish.
5. Chỉ sau khi Web ↔ Supabase PASS mới nối/kiểm tra tiếp Supabase ↔ Quản trị/Google Sheet.
6. Mã sản phẩm là định danh bất biến; không đổi mã do sắp xếp, thêm hoặc xóa dòng.
7. Không chạy reset/fresh-start hoặc thao tác dữ liệu diện rộng để sửa một lỗi cục bộ.
