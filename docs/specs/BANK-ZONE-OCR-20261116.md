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
