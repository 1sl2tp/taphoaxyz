# RULE — BỐ CỤC ĐƠN HÀNG / GIỎ HÀNG / XEM TRƯỚC / CHIA SẺ

Cập nhật: 2026-10-08. Phạm vi: **1sl2tp/taphoaxyz**, giao diện đơn hàng của TAPHOA; không liên quan YouTube, Chat, Supabase hay nghiệp vụ định giá.

## Một chuẩn duy nhất

**Năm cột, đúng thứ tự:** `STT | Tên | Đơn giá | Số lượng | Thành tiền`.

- **Hàng tiêu đề** tách riêng, thẳng cột với tất cả dòng sản phẩm. Trên mobile **không ẩn hàng tiêu đề**, không đưa STT/tên sang hàng khác và không lặp nhãn phía trong từng dòng.
- Một sản phẩm là **một hàng lưới 5 cột**. Sản phẩm dài có thể rút gọn trong UI mobile; ảnh chia sẻ giữ đủ tên và ghi chú. Ghi chú không tạo dòng trống nếu chưa nhập.
- **Đơn đã giao / đơn tạm / hóa đơn xem trước:** cột Số lượng chỉ hiển thị **số**, không có nút.
- **Giỏ hàng / đang sửa đơn:** giữ nguyên 4 cột còn lại; **duy nhất cột Số lượng** đổi nội dung thành `− số +` và ô nhập; các hàng không thay vị trí khi đổi trạng thái.
- **Chia sẻ ảnh giỏ / ảnh hóa đơn / ảnh công khai**: dùng đúng năm cột, cùng thứ tự, **chỉ hiển thị số lượng**. Không đưa nút sửa, các input, thông tin nội bộ hay ô trống vào ảnh. Ảnh chia sẻ phải lấy đúng dữ liệu đang xem/chọn; tuyệt đối không gọi lại server chỉ để dựng ảnh.
- Căn **STT giữa, Tên trái, Đơn giá phải, Số lượng giữa, Thành tiền phải**. Giữ định dạng tiền vi-VN, tổng = đơn giá × số lượng. Không tự dịch/đổi tiền, không làm tròn mới.
- **Header và body dùng cùng ruler**. Trên điện thoại <=480px, các track: `22px minmax(0,1fr) 54px 104px 61px`, gap 4px; rút gọn **tên sản phẩm** nếu cần để bảo vệ tiền. Không cắt số tiền, không cho nút +/- lấn sang cột kế bên. Trên màn rộng dùng ruler desktop hiện có cho nội dung và ảnh chia sẻ; không sửa layout bán hàng ngoài giỏ.
- Nút +/- phải bấm được và vẫn dùng handlers đang có; giữ lối vào ghi chú, quyền xem/chỉnh, trạng thái đang sửa và việc lưu đơn.

## Nguồn mã và điểm kiểm soát

1. **Giỏ hàng**: `src/fixed-ui-markup-3.js` là hàng tiêu đề; `src/fixed-ui-runtime-6.js` dựng dòng; `src/fixed-ui-behavior.js` chỉ thay ô giá *khi được chỉnh*, không được xóa nhãn/ô tiền hay can thiệp đơn read-only.
2. **Hóa đơn xem trước / đơn đã lưu**: `src/fixed-ui-markup-5.js` là tiêu đề; `src/fixed-ui-runtime-13.js` dựng dòng. Sử dụng cùng ruler CSS với giỏ trên mobile.
3. **Chia sẻ**: `src/fixed-ui-cart-share-v3.js` là đường chia sẻ giỏ **đang dùng**, `src/fixed-ui-public-order-image.js` là ảnh đơn công khai. Giữ layout 5 cột và dữ liệu từ đơn gốc. `fixed-ui-cart-share-v2.js` là legacy, không được nối lại.
4. **Một chủ sở hữu căn cột**: `src/fixed-ui-cart-spacing.css`. Bất kỳ thay đổi header/row nào phải sửa ở đây và kiểm tra cả cart + order detail (cùng width và padding).
5. **Hiển thị chia sẻ**: không sửa logic `TAPHOA_SHARE_CAPTURE`, iOS fallback, việc chuẩn bị cache/click-to-share hay thêm network call. Không dựng thêm pack/không ghi DB/log/không thay Edge function.

## Checklist trước khi commit

- [ ] Kiểm tra header 5 cột ở cart, xem trước, đơn đã lưu, chia sẻ và ảnh công khai.
- [ ] Giỏ hàng chỉ khác hóa đơn ở ô số lượng `− số +`; mode read-only không sửa được.
- [ ] Mobile 320 / 375 / 390 / 428px: header-body theo cùng ruler, tiền và qty không đè; máy rất nhỏ rút gọn tên trước, không cắt tiền.
- [ ] Giá thay đổi, số lượng thay đổi, tổng tiền và ghi chú vẫn đúng; không thay logic lưu/đặt/bán.
- [ ] Ảnh chia sẻ có đủ cột, tên/ghi chú không bị cắt, không có nút/input.
- [ ] Cache-bust đúng CSS/markup/chia sẻ khi cần; chạy `npm test` + build, kiểm tra GitHub Actions/Pages.
- [ ] Chưa có ảnh Safari/PWA thực tế thì **không tuyên bố visual QA đã hoàn tất**.

Quy tắc này được viện dẫn từ `AGENTS.md`. Không tự chia layout giỏ thành 2-3 hàng hoặc thay nhãn bằng pseudo-element khi người dùng chỉ yêu cầu giống hóa đơn xem trước.
