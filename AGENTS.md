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
