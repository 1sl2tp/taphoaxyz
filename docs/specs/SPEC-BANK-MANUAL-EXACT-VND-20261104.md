# SPEC-BANK-MANUAL-EXACT-VND-20261104 — Thu Agribank thủ công đúng số đồng

## E0 — Bằng chứng và Given / When / Then
- **Lỗi được xác nhận bằng SELECT chỉ đọc (2026-11-04):** một thông báo Agribank `credit_candidate` có số tiền **16.000.008 VND**, xác nhận nguồn và tài khoản nhận, chưa có liên kết thu tự động/thủ công. RPC đang chạy `public.chat_bank_manual_collect(uuid,bigint,uuid,text,bigint)` loại bỏ chỉ vì `mod(v_notice.amount_vnd,1000)<>0`, trả `invalid_bank_notice`. Phần thân thông báo cũng đã được so khớp số tiền; không đọc/ghi sổ nợ thực.
- **Given:** Admin Chat có phiên hợp lệ và đã chủ động xác minh thông báo Agribank chứa tiền vào tài khoản hợp lệ; số tiền đúng theo ngân hàng nhưng có 1–999 đồng lẻ.
- **When:** Admin chọn đúng khách, ghi chú rồi nhấn Thu tiền **một lần**; backend tiếp tục xác thực toàn bộ chứng cứ, khóa ngân hàng và khóa khách trước ghi thu.
- **Then:** nếu đạt mọi guard khác, ghi đúng số tiền gốc qua `amount_vnd::numeric/1000` vào ledger vốn theo đơn vị nghìn, ví dụ **16.000.008 VND → 16000.008** trong sổ; không làm tròn/bỏ 8 đồng. Cùng một thông báo không được ghi lần hai. Nếu không đạt điều kiện, không đổi công nợ và Chat hiển thị lỗi dễ hiểu.

## Owner / phạm vi thay đổi
- TAPHOA migration nguồn, **chưa áp dụng database production**: `supabase/migrations/20261104184500_chat_bank_manual_collect_exact_vnd.sql`. Sao chép nguyên hàm từ `20261101131841_taphoa_finance_customer_lock_all_channels_20261101.sql`, chỉ bỏ một điều kiện chia hết 1.000 của **luồng Agribank thu tay**.
- TAPHOA kiểm thử: `tests/bank-manual-exact-vnd-20261104.test.js`, `tests/sql/bank-manual-exact-vnd-isolated.sql`; dùng workflow PostgreSQL cô lập chung hiện hành.
- Chat UI: `bank-report-dashboard.js::bankManualCollectionFailureMessage`; không hiển thị thẳng `invalid_bank_notice`, không sửa dữ liệu hoặc retry; test `tests/test_bank231_manual_collection_failure_message_20261104.cjs` trong Verify V21.

## MUST-STAY
- Không sửa đổi lịch sử nợ/đơn/công nợ/bank link hiện có; không gửi tiền, thu tiền, Zalo hay thông báo thật qua test.
- Giữ xác thực Admin, `credit_candidate`, `bank_credit_account`, `package_name`, `is_own_transfer=false`, `transfer_at`, đối chiếu số tiền trong **body gốc**, cảnh báo giao dịch nhập tay trước đó, kiểm tra trạng thái đã thu tự động, global bank lock `17812026` và customer money lock.
- Giữ quy tắc chặt hơn cho **Chat cash** và **thu tự động theo bill**; không mở rộng phạm vi auto matcher sang tiền có số lẻ. Không thêm cron, polling, retry hoặc gửi tin.
- Một `invalid_bank_notice` ở các trường hợp khác vẫn phải bị chặn, không được tự động suy ra đã nhận tiền. Không tuyên bố E4/E5 đã đạt chỉ vì CI xanh.

## Kiểm thử, nghiệm thu và triển khai
- **E1 source & Node:** khóa bằng test so sánh toàn bộ thân hàm mới với thân cũ, cho phép đúng một khác biệt là predicate `mod(...,1000)`.
- **E2 PostgreSQL cô lập:** chạy nguyên hàm trên DB tạm với thông báo ngân hàng **giả**, xác minh 16.000.008 được ghi là `-16000.008`, cùng notification chỉ ghi một lần, thông báo sai số tiền/account, chuyển khoản nội bộ và đã thu tự động vẫn thất bại.
- **E3 UI:** Chat hiển thị lỗi tiếng Việt và xác nhận chưa ghi thu. Việc deploy UI không thay thế cập nhật SQL production.
- **E4/E5:** **PENDING** — trước khi triển khai production cần review migration, đối chiếu tính tương thích Supabase staging, kiểm quyền và xác minh trên account test có kiểm soát; không gọi RPC ghi tiền thật để thử.
- **Rollback:** nếu bất thường, phục hồi định nghĩa `chat_bank_manual_collect` từ `20261101131841_taphoa_finance_customer_lock_all_channels_20261101.sql`; không xóa transaction hoặc tự động bù trừ. Chat UI có thể hoàn nguyên bản dịch thông báo riêng.
