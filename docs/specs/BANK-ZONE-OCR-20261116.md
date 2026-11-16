# BANK-ZONE-OCR-20261116 — Khoanh vùng và OCR từng trường bill

## Trạng thái
SOURCE-ONLY / CHƯA TÍCH HỢP WORKER / CHƯA PHÁT HÀNH SUPABASE PRODUCTION.
Bộ đọc mới định nghĩa vùng cho số tiền, tài khoản, tên người nhận, ngày giờ; kết quả chỉ là evidence, không phải lệnh ghi thu.

## Given / When / Then
- GIVEN một bill chụp màn hình/giấy/điện thoại khác; WHEN AI xác định 4 vùng theo tọa độ chuẩn hóa [x,y,w,h], THEN cắt từng vùng đúng ảnh và đưa crop cho OCR độc lập.
- GIVEN tên người nhận không xuất hiện, THEN tên=null, optional_absent, không vì thiếu tên mà chặn đối soát các chứng cứ mạnh khác.
- GIVEN tên có dấu hoặc khác kiểu hoa-thường, THEN chuẩn hóa về chữ HOA KHÔNG DẤU trước khi so sánh; tên hiển thị sai hoặc hai bộ đọc mâu thuẫn phải review.
- GIVEN số tài khoản thiếu một chữ số, hai vùng tiền khác nhau, hoặc giờ mâu thuẫn, THEN giữ nguyên kết quả gốc và khoanh đúng vùng để review; không tự suy đoán từ tài khoản lưu sẵn.
- GIVEN thông báo Agribank đến muộn, THEN lấy ngày giờ giao dịch trên thông báo ngân hàng; không lấy giờ nhận push làm giờ giao dịch.
- WHEN hai kết quả vùng thống nhất, THEN chỉ được sẵn sàng tìm chứng cứ Agribank tiếp theo, không tự cho phép ghi thu. Ghi thu qua RPC tài chính duy nhất với bảo vệ chống trùng.

## File owner/source
- Module: src/bank-bill-region-ocr.js — normalizeRecipientName, normalizeBillField, cropBillRegion, compareRegionRead, inspectBillZones.
- Migration nguồn: supabase/migrations/20261116234000_bank_zone_optional_recipient_ascii_20261116.sql. Được bảo vệ bằng kiểm tra mã gốc, chỉ sửa phép so tên qua extensions.unaccent; không đụng các guard khác.
- Bài kiểm thử: tests/bank-bill-region-ocr-20261116.test.js.
- Worker Supabase v21-bank-bill-event hiện **chưa** import module mới; code AI locator bbox và OCR callback của worker **chưa triển khai**. Không tạo bản mirror giả làm source runtime.

## MUST-STAY / negative cases
- Không thay đổi APK listener, thông báo Agribank nguyên bản, thời gian từ ngân hàng, hash ảnh, số tiền, STK, idempotency, phân quyền, khóa giao dịch và công nợ cũ.
- Không ghép nhầm do trùng số tiền; không lấy giờ trên thanh trạng thái điện thoại; không lấy tên khách Chat làm chủ tài khoản.
- Tên thiếu hợp lệ; tên khác review; tài khoản không đầy đủ review; crop thất bại review.
- Không tạo thêm cron, gửi tin thật, token mới hoặc ghi thu lịch sử.

## E0–E5
- E0: đã tìm mã so tên ở SQL trực tiếp và rule đọc bill hiện hành.
- E1: đã ghi source, migration và bài test; CI chưa xác nhận kết quả xanh.
- E2: chưa tích hợp worker + thử OCR ảnh thật, không coi module độc lập là tính năng production.
- E3: commit main không phải phát hành Supabase. Không tự deploy production.
- E4: PROD PENDING — chưa xác minh trên Web/PWA/APK.
- E5: RESOURCE PENDING — đo CPU/bytes và tác động network sau khi tích hợp.
- Rollback: revert commits; nếu migration từng apply phải restore body RPC từ bản lưu trước triển khai.

## Việc chưa hoàn tất
Tích hợp locator AI trả tọa độ chính xác, OCR crop độc lập trong v21-bank-bill-event canonical; chạy corpus kiểm thử gồm bill ZaloPay 70.000đ ngày 16/11, ảnh điện thoại lồng trong ảnh, tên thiếu/có dấu, STK thiếu chữ số và thông báo sang ngày; sau đó phát hành qua quy trình được phép, nghiệm thu E3–E5.

## BANK-ZONE-OCR-20261117 — Rà soát nội dung chuyển và AI locator (source-only)

Đã thêm src/bank-bill-transfer-content-ocr.js và mở rộng src/bank-bill-region-ocr.js thành 10 vùng:
- amount: số tiền giao dịch, không phải số dư
- account: số tài khoản nhận, không tự bù số thiếu
- recipientName: tên người nhận CÓ THỂ KHÔNG CÓ, chuẩn hóa không dấu
- transactionTime: ngày và giờ IN TRÊN BILL, không lấy giờ máy
- transferContent: nội dung nguyên văn khách gửi
- transferReference: mã giao dịch riêng; không đánh đồng routing token
- senderName: tên người gửi nếu có
- sendingBank: ngân hàng/ứng dụng bên gửi
- receivingBank: ngân hàng bên nhận
- transactionStatus: giao dịch hoàn tất hay thất bại nếu có

### Quy tắc khoanh và đọc
AI locator cung cấp documentBox ôm bill nội bộ, boxes[field] tỷ lệ 0..1, aiFields, selectedTransaction (single_detail hoặc latest_top_row). Bộ xác thực từ chối vùng nào ở ngoài bill, gồm giờ thanh trạng thái điện thoại, popup thông báo và quảng cáo. Từ chối bbox chồng nhau quá 55% cho các cặp số tiền/STK/thời gian, và quá 85% cho nội dung/mã tham chiếu.

Giải mã ảnh một lần, cắt từng vùng. Hai bộ đọc mâu thuẫn thì review đúng vùng; OCR confidence dưới 70% thì review. Thiếu tên người nhận là optional_absent, không chặn; tên có nhưng khác nhau thì review. Mô-đun chỉ xuất readyForIndependentBankMatch để TÌM chứng cứ Agribank, luôn ledgerWritten=false.

### Nội dung chuyển và mã kỹ thuật
Mọi bản sao phải giữ thông tin gốc. So sánh không dấu/hoa thường nhưng không tự bỏ chữ số hoặc mã tham chiếu. Chỉ bóc wrapper khi đúng mẫu và toàn bộ nội dung khớp:
- Nội dung thường: so nguyên chuỗi; chỉ "chuyen tien" không đủ phân biệt
- QR - : gỡ tiền tố có neo; nếu bill chỉ ghi "chuyen tien" yêu cầu tên người gửi đầy đủ khớp
- MB(sáu chữ số)(nội dung): chỉ gỡ wrapper nguyên vẹn
- Mã routing 12 ký tự chữ+số-nội dung: chỉ phân tách khi toàn bộ hậu tố khớp nội dung bill có tính phân biệt. Mã routing không phải mã giao dịch bill
- IBFT: yêu cầu nội dung gắn tên người gửi rõ ràng
- MCC: xác minh memo và tên người gửi; hậu tố FT chỉ gỡ khi mã FT in bill trùng tuyệt đối
- MBVCB: yêu cầu mã tham chiếu, người gửi, tài khoản đích và toàn bộ nội dung khớp
- Không xác định dạng / nội dung khác / nhiều ứng viên => đưa review, không tự ghi thu

### Bằng chứng read-only
Các thông báo Agribank 12–17/11/2026 gồm 70 dạng thường/khác, 16 QR, 3 MB, 2 mã định tuyến trước nội dung, 1 IBFT. Case 70.000đ có bill 15:25 ngày 16/11, thông báo #348 cũng 15:25, nhận trên máy chủ 17:51; memo bank thêm mã routing, AI từng thiếu một số tài khoản. Chưa tự ghi thu.

### E0–E5 và rollback
- 2 file test: tests/bank-bill-region-ocr-20261116.test.js và tests/bank-bill-transfer-content-ocr-20261117.test.js.
- 22/22 bài test cô lập PASS trong JS isolate giản lược, bao gồm crop giả lập; chưa phải kết quả Node CI/GitHub Actions hay OCR trên thiết bị thật.
- E1 SOURCE PASS (isolate); E2 PENDING tích hợp locator và OCR thực vào worker v21-bank-bill-event; E3 PENDING deploy; E4 PENDING kiểm tra ảnh thật trên Web/PWA/APK; E5 PENDING đo CPU/bytes.
- Không deploy Supabase thủ công, không viết dữ liệu production, không thêm cron hay tự ghi thu chứng từ lịch sử.
- Rollback: revert source commit hoặc restore chính xác last-known-good worker/RPC khi được triển khai, không sửa sổ lịch sử.
