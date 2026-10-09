# TAPHOA.XYZ — RULE LÀM VIỆC HIỆN TẠI

## Phạm vi cố định
- Repo hiện tại: `1sl2tp/taphoaxyz`.
- Branch làm việc hiện tại: `main`.
- Mọi thay đổi phải đọc từ trạng thái `main` mới nhất rồi sửa trực tiếp vào `main`.
- Không tự chuyển sang repo khác, branch khác, PR khác, preview khác hoặc môi trường khác nếu người dùng chưa yêu cầu rõ.

## Cấm mở rộng ra ngoài repo
- Không tự kiểm tra, gọi, suy luận hoặc xử lý Vercel.
- Không tự kiểm tra hosting/deploy/service bên ngoài repo.
- Không tự dùng repo khác để tìm nguồn sự thật.
- Không tự tạo branch trung gian, PR trung gian, publish trung gian, version-marker trung gian hoặc bước chuyển tiếp tương tự nếu người dùng chưa yêu cầu.

## Cách sửa
- Với lỗi UI nhỏ: tìm đúng source đang dùng trong `main`, sửa tối thiểu đúng chỗ, không refactor lan rộng.
- Không vá vào file sinh ra nếu source build thật nằm ở file khác; phải sửa đúng owner/source gốc.
- Không đổi nghiệp vụ, backend, auth, dữ liệu hoặc cấu trúc ngoài phạm vi yêu cầu.
- Không sửa thêm hạng mục “tiện tay”.

## Kiểm tra
- Chỉ dùng GitHub/GitHub Actions của chính repo này khi cần xác minh.
- Không để kiểm tra phụ hoặc workflow cũ kéo việc sửa UI đơn giản sang phạm vi khác.
- Nếu một test cũ mâu thuẫn với source hiện tại, phải xác định rõ test đó đang khóa hành vi cũ trước khi sửa.

## Nhịp làm việc
- Khi người dùng nói “làm đi”, “sửa đi”, “làm ngay”: thực hiện trực tiếp trên `main` trong phạm vi đã nêu, không hỏi lại các chi tiết nhỏ đã rõ.
- Ưu tiên thao tác ngắn: đọc đúng file → sửa đúng chỗ → commit `main` → xác minh ngay.
- Không tạo thêm bước chờ hoặc quy trình trung gian nếu không cần thiết.

## Quy tắc ưu tiên
- Chỉ thay đổi repo/phạm vi/branch khi người dùng nói rõ muốn chuyển.
- Nếu có xung đột giữa thói quen cũ và file này, ưu tiên file này cho dự án `1sl2tp/taphoaxyz`.

## Rule giao diện đơn hàng dùng chung
- **BẮT BUỘC đọc** `docs/ORDER_CART_PREVIEW_SHARE_RULES.md` khi sửa giỏ hàng, đơn hàng, xem trước, chi tiết đơn, ảnh chia sẻ hoặc ảnh đơn công khai.
- Giữ cùng **5 cột: STT | Tên | Số lượng | Đơn giá | Thành tiền** (UI-111 canonical). Header và hàng dữ liệu phải thẳng cột; giỏ hàng **chỉ khác ô số lượng** có nút `− / +`.
- Trước khi kết luận, kiểm tra riêng cart edit, order read-only, share image và mobile 320–428px; không lấy kết quả CSS/test thay cho ảnh iPhone thật.

## SDD — SPEC → TEST → ACCEPTANCE (RULE 04, 2026-10-09)

Trước khi thay đổi TAPHOA, đọc [RULE 04 — SDD/Spec/Test/Acceptance](https://github.com/1sl2tp/infrastructure/blob/main/rules/04-SDD-SPEC-TEST-ACCEPTANCE.md) và [RULE CHUNG Google Sheets](https://docs.google.com/spreadsheets/d/1vu8mlXSr_E6klO3UjrsoWjos2MefCWkDra3MBbI6NHQ/edit) tab **08 - SDD SPEC TEST ACCEPTANCE**, sau các rule owner/resource hiện hành của repo.

- Mỗi task có SPEC ID; mô tả Given/When/Then, root owner và read/write path, MUST-STAY, case lỗi, rollback, nguồn chứng cứ và resource impact. Lỗi UI nhỏ dùng 1 dòng Spec, **không thêm tool GraphRAG/server/cron**.
- Trước patch khóa E0 SPEC + owner; test theo từng case E1/E2; đọc đúng commit/release E3; kiểm hành vi trên production/device thực E4; resource và user acceptance E5. Mock/unit xanh **không** phải bằng chứng UI thật đã sửa xong.
- Drift Check: không mở rộng file/provider/permission, không vô tình làm khác hành vi cũ. Với bug người dùng còn nhìn thấy, test string/CSS/CI đạt không được gọi DONE. Chưa có browser/account thực → `PROD PENDING`.
- Đơn hàng phải giữ orderId/STT/SL/note và lịch sử giá vốn; search voice một FINAL → một input; UI cần ảnh Chrome/Safari theo scope.
- Docs-only update **không deploy production** và không cập nhật trạng thái nguồn nghiệp vụ; không sửa task `CURRENT_WORK` đang chờ nghiệm thu chỉ vì thêm SDD rule.

