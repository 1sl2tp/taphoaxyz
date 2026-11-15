# ORDER-PORTRAIT-020 — Tiêu đề ảnh phiếu tối đa 2 hàng mặc định

## Lỗi nhìn thấy
- Ảnh DG363 có 2 mã hàng: phần trên đang ghi 3 dòng riêng (`Mã đơn`, tên khách, `Thời gian`) với khoảng đệm lớn.
- Khi thu ảnh vào Chat/PWA, chiều cao đầu phiếu lớn làm tên hàng và tổng tiền bị thu nhỏ tương đối.

## Hướng sửa đã chọn
- Hàng 1: `Mã đơn: DG363` bên trái, `15/11/2026 15:39:16` bên phải, font 14px / 13px. Bỏ nhãn “Thời gian:” thừa nhưng vẫn giữ nguyên cả phút/giây.
- Hàng 2: tên khách 24px đậm, không ép nhỏ hay cắt; tên dài xuống dòng theo từ.
- Nếu mã đơn + thời gian không đủ 396px chiều ngang thì chuyển thời gian xuống dòng riêng có chủ ý; không cho tràn chữ hay đè nhau.
- Giảm chiều cao vùng đầu từ khoảng 121px còn khoảng 92px với tên một dòng; căn nền và đường phân cách thống nhất cho Canvas2D và createPage HTML.
- Khi ảnh có nhiều trang, vẫn giữ “Trang x/y” cạnh mã đơn.
- Không thay giá, tổng, cột STT/TÊN/SL/ĐG/TIỀN, chính sách thông báo (đơn tạm không tự gửi), nơi nhận và chức năng lưu ảnh.

## Nghiệm thu
E1: unit test metadata cùng hàng, full timestamp, tên khách dài, cột và tổng vẫn nguyên. E2: CI và publish Pages. E3: SW v43 và URL script `portrait-ui=20261115-020`. E4: ảnh iPhone/WebView thực tế cần nghiệm thu riêng.
