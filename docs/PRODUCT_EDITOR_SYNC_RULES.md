# PRODUCT DATA SYNC RULES

`Cài đặt → Cập nhật sản phẩm` đã nghỉ hẳn. Web không còn là nơi tạo, sửa hoặc xóa nguồn/sản phẩm.

## Luồng dữ liệu khóa

**Quản trị / Google Sheet → Supabase → Web**

1. Google Sheet Quản trị là nơi duy nhất tạo, sửa, xóa nguồn và sản phẩm.
2. Supabase là bản dữ liệu phục vụ ứng dụng; Web chỉ đọc sản phẩm/nguồn từ Supabase.
3. Không có luồng Web → Supabase → Sheet cho dữ liệu nguồn/sản phẩm.
4. Worker tự động kiểm tra file Quản trị mỗi phút. Nếu file không đổi thì không nhập lại dữ liệu.
5. Nguồn được nhận diện theo `sheetId`; đổi tên tab không đổi danh tính nguồn.
6. Dữ liệu sản phẩm của mỗi tab là A:D: `Mã SP | Tên sản phẩm | Giá vốn | Giá bán của mình`.
7. Nếu người quản trị thêm một dòng có tên nhưng chưa có Mã SP, worker được phép cấp Mã SP ngay trong Sheet. Đây là thao tác quản trị nội bộ từ chính Sheet, không phải dữ liệu đẩy ngược từ Web/Supabase.
8. Metadata kỹ thuật `__SYNC_ID` / `__SYNC_HASH` được phép nằm ở AY/AZ và không phải dữ liệu nghiệp vụ.
9. Xóa dòng/tab ở Quản trị được phản ánh một chiều xuống Supabase/Web; worker không được tạo/xóa/sửa dòng hoặc tab theo yêu cầu phát sinh từ Web.
10. Không chạy reset/fresh-start hoặc thao tác dữ liệu diện rộng để đổi sang kiến trúc một chiều.

## Gate

- Không còn pending outbound nào được phép đẩy từ Supabase lên Sheet.
- Cron `taphoa_sheet_sync_every_minute` phải hoạt động mỗi phút.
- Worker không được xử lý `taphoa_product_outbox`, `taphoa_product_create_requests`, `taphoa_source_sync_requests` như hàng đợi outbound.
- Production Web không được load persistence của product editor và business service không được expose create/update/delete source/product.
