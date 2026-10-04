# PRODUCT DATA SYNC RULES

> **Current locked rule:** External-data Single Source of Truth in `1sl2tp/infrastructure/rules/02-EXTERNAL-DATA-SINGLE-SOURCE-OF-TRUTH.md`.

`Cài đặt → Cập nhật sản phẩm` đã nghỉ hẳn. Web không còn là nơi tạo, sửa hoặc xóa nguồn/sản phẩm.

## Luồng dữ liệu khóa

**Google Sheet Quản trị (source document) → Drive push watch → Supabase `1sl2tpvn` (canonical business data) → Web**

1. Google Sheet Quản trị là **source document do người quản trị chỉnh sửa** cho nguồn/sản phẩm.
2. Sau khi đồng bộ, Supabase là **canonical business state** mà ứng dụng sử dụng; Web chỉ đọc Supabase.
3. Không có luồng Web → Supabase → Sheet cho dữ liệu nguồn/sản phẩm.
4. **Không polling mỗi phút.** TAPHOA giữ đúng một Google Drive push watch cho file Quản trị. Chỉ khi Drive báo thay đổi mới chạy sync dữ liệu.
5. GETLINK không có runtime Google Drive/Sheet. TAPHOA không gửi event/wake nào sang GETLINK; file Quản trị chỉ phục vụ dữ liệu TAPHOA.
6. Watch renewal chỉ gia hạn subscription trước khi hết hạn; không đọc toàn bộ workbook để hỏi “có gì đổi không”.
7. Nguồn được nhận diện theo `sheetId`; đổi tên tab không đổi danh tính nguồn.
8. Dữ liệu sản phẩm của mỗi tab là A:D: `Mã SP | Tên sản phẩm | Giá vốn | Giá bán của mình`.
9. Nếu người quản trị thêm một dòng có tên nhưng chưa có Mã SP, worker được phép cấp Mã SP ngay trong Sheet. Đây là xử lý source document, không phải Web/Supabase write-back.
10. Metadata kỹ thuật `__SYNC_ID` / `__SYNC_HASH` được phép nằm ở AY/AZ và không phải dữ liệu nghiệp vụ.
11. Xóa dòng/tab ở Quản trị được phản ánh một chiều xuống Supabase/Web; worker không được tạo/xóa/sửa dòng hoặc tab theo yêu cầu phát sinh từ Web.
12. Không chạy reset/fresh-start hoặc thao tác dữ liệu diện rộng để đổi kiến trúc.

## Gate

- Supabase `1sl2tpvn` là canonical business data; Sheet không được dùng như database runtime song song.
- Không còn pending outbound nào được phép đẩy từ Supabase lên Sheet.
- Không có cron product polling mỗi phút.
- Chỉ `taphoa-sheet-watch-renew` được phép chạy định kỳ để gia hạn Drive watch; tick renewal không scan workbook.
- Chỉ một active Drive watch owner cho file Quản trị: TAPHOA.
- GETLINK không phải consumer của file Quản trị và không có OAuth/Edge Function/cron/watch liên quan Google Sheet.
- Worker không được xử lý `taphoa_product_outbox`, `taphoa_product_create_requests`, `taphoa_source_sync_requests` như hàng đợi outbound.
- Production Web không được load persistence của product editor và business service không được expose create/update/delete source/product.
