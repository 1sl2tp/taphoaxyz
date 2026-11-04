# SPEC-BANK-MANUAL-ROUND-DOWN-20261104 — Agribank: bỏ phần lẻ khi ghi thu thủ công

## E0 — Bằng chứng và quyết định
- User xác nhận ảnh Chat hiển thị **16.000,008** (đơn vị nghìn) và đề nghị **bỏ 8 đồng lẻ**.
- Kết quả đối chiếu SELECT production trước/sau release cho notification #198: thông báo ngân hàng **16.000.008 đ**; không có bản ghi thu tay/tự động liên kết, chưa có tiền nào được ghi thông qua lượt sửa này.
- **Given:** chứng từ Agribank đã được Admin xác thực độc lập, đầy đủ amount/body/account/time. **When:** Admin chọn đúng khách và chủ động bấm **Thu** một lần. **Then:** sổ nợ ghi **16.000.000 đ**, **8 đ** không tính vào công nợ nhưng được ghi dấu vết trong ledger note, bảng liên kết và UI; số gốc trên chứng từ ngân hàng giữ **16.000.008 đ**.

## Owner, SQL và điểm khóa
- **Current migration:** `supabase/migrations/20261104193000_chat_bank_manual_round_down_remainder.sql` thay **hai RPC**, `chat_bank_manual_collection_prepare` và `chat_bank_manual_collect`. Chuẩn bị và commit cùng làm tròn xuống bội số 1.000, dùng `recorded_amount_vnd` và `ignored_remainder_vnd`.
- Kiểm tra duplicate/candidate và liên kết `p_existing_ledger_id` nhận diện **cả khoản thu trước đó theo số chính xác** lẫn khoản thu làm tròn. Không coi hai thông báo có chứng cứ khác nhau nhưng cùng số tiền là cùng một giao dịch.
- Giữ y nguyên chứng từ ngân hàng, nhận diện tài khoản, khoản chuyển nội bộ, source package, bank timestamp, amount body, Admin session, global lock, customer lock, ràng buộc đã thu thủ công/tự động, thông báo một lần. **Không sửa thu tự động theo bill hoặc thu tiền mặt.**
- Đối với giao dịch dưới 1.000 đ không tạo khoản thu 0 đ; vẫn từ chối.
- **Old migration `20261104184500_chat_bank_manual_collect_exact_vnd.sql` đã bị thay thế, KHÔNG chạy riêng**: nếu chạy muộn hơn bản mới sẽ ghi phần lẻ trở lại.

## Kiểm thử và bằng chứng
- E1 Node: `tests/bank-manual-round-down-remainder-20261104.test.js`.
- E2 PostgreSQL 17 dùng ngân hàng và khách **giả**: `tests/sql/bank-manual-exact-vnd-isolated.sql` qua workflow `.github/workflows/verify-manual-debt-png-postgres.yml`. Bài test kiểm kê **-16000** đơn vị nghìn, ghi chú chênh 8 đ, không thu trùng notification #198, sai chứng từ, tài khoản, own transfer, auto link.
- **CI nguồn:** Verify TAPHOA và PostgreSQL PASS trên `d6ddf1c1b4a6b474bcc46a4c51ec8cdc5b31421f`:
  https://github.com/1sl2tp/taphoaxyz/actions/runs/41830152842
  https://github.com/1sl2tp/taphoaxyz/actions/runs/41830152861
- **Chat UI:** `bank-report-dashboard.js` hiển thị hai số và chênh lệch; `tests/test_bank232_manual_round_down_ui_20261104.cjs`. Deploy Pages PASS tại `aa439cabc0a206b100862c28903402a52a91dd6d`:
  https://github.com/1sl2tp/chat/actions/runs/41830360208
  Verify Chat PASS tại `9533a171ebacc7cd6c0eda322e886f1f94eba554`:
  https://github.com/1sl2tp/chat/actions/runs/41830458845
- **E3 DB:** Supabase `apply_migration` tên `taphoa_bank_manual_round_down_remainder_20261104` **SUCCESS ngày 2026-11-04**. SELECT hậu triển khai xác minh code mới, guard bội số 1.000 cũ đã mất, API EXECUTE permission giữ nguyên, prepare có amount/difference, notification #198 vẫn `credit_candidate`, **chưa có ghi thu**.
- **E4–E5: PENDING** — chưa có thao tác bấm thu thực tế sau thay đổi, chưa có xác nhận sổ công nợ của khách/nhật ký giao hàng và không gửi tin khách để kiểm thử.

## Resource / rollback
- Release chỉ cập nhật định nghĩa hai hàm qua migration; không chạy RPC ghi tiền thật, không UPDATE/DELETE ledger hoặc notification, không thêm polling/cron/retry.
- Mọi khoản đã thu cũ giữ nguyên. Chênh lệch này không bị xóa khỏi dữ liệu ngân hàng; người vận hành vẫn có thể đối soát đầy đủ.
- Rollback khi có lỗi: review và khôi phục `chat_bank_manual_collection_prepare` từ migration BANK-191 và `chat_bank_manual_collect` từ `20261101131841_taphoa_finance_customer_lock_all_channels_20261101.sql`, không xóa khoản thu đã ghi. Đánh giá ảnh hưởng trước khi đổi production.
