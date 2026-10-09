# RULE — BỐ CỤC ĐƠN HÀNG / GIỎ HÀNG / XEM TRƯỚC / CHIA SẺ

Cập nhật: 2026-10-08. Phạm vi: **1sl2tp/taphoaxyz**, giao diện đơn hàng của TAPHOA; không liên quan YouTube, Chat, Supabase hay nghiệp vụ định giá.

## CANONICAL 09/10/2026 — 5 cột và nút cập nhật giá đơn tạm

- Chuẩn UI-111 hiện hành: **STT | Tên | Số lượng | Đơn giá | Thành tiền**. Mọi ví dụ bên dưới nói Giá trước SL, 7 tracks, hoặc căn trái Thành tiền là **LỊCH SỬ**, không dùng để sửa mới.
- Nút −/+ giỏ dùng SVG vector 16px, nét vẽ 2px thực; dấu trừ #334155 trên nền #e9eef5, dấu cộng trắng trên nền xanh. Riêng nút + giỏ hàng: nút HTML nền trong suốt, dùng SVG 30×30px chứa chính hình tròn xanh và dấu + trắng, viewBox vuông + preserveAspectRatio xMidYMid meet (UI-134). Không tô nền xanh lên HTML button để tránh hình bầu dục 30×34px khi khung bị co. Cụm điều khiển giữ 92px căn giữa track SL 96px, nút 32×32px; SVG luôn tròn dù viewport khác tỷ lệ, không shadow/ring mềm, không active:scale-95 hoặc transform, không thay đổi bố cục STT/SL. Nút sản phẩm dùng glyph 14px và dấu trừ tương phản tương đương. Không scale icon, đổi ruler 5 cột hoặc nghiệp vụ số lượng.
- Nút **Giá mới** cạnh **Đang sửa đơn** xuất hiện cho admin tài khoản thường đang sửa **đơn tạm hoặc đơn đã giao đã lưu**; không xuất hiện ở màn hình xem trước/user/link nhân viên. Chỉ click thật mới đọc domain products từ Supabase một lần, kiểm đủ mã SP + giá bán/vốn hợp lệ của mọi dòng rồi áp dụng tại chỗ. Thiếu một dòng = không đổi bất cứ dòng nào.
- Sau click, cart giữ nguyên mã đơn, số lượng, STT, thứ tự, ghi chú; chỉ thay giá bán hiển thị. Người dùng bấm **Cập nhật đơn** để lưu.
- **Đơn tạm:** SaveOrder dùng flag `refresh_cost_snapshot` tùy chọn sau khi bấm Giá mới; SQL `taphoa_save_order` chỉ cho admin + pending tồn tại + lưu pending lấy vốn mới từ `taphoa_products.input_price_vnd`. **Đơn đã giao:** nút Giá mới chỉ lấy giá bán hiện hành và lưu qua luồng sửa đơn đã giao bình thường, **không gửi flag** nên giữ vốn cũ; lưu có thể đổi tổng đơn/công nợ và phát thông báo sửa đơn cho khách theo cơ chế hiện hữu. Cấm refresh giá vốn đơn đã giao, role customer, đơn mới hay link nhân viên.
- 1 click giá = tối đa 1 products-domain read, 1 nút lưu = 1 canonical order mutation; không cron, media proxy hoặc Sheet query mới. Test order ID/STT/số lượng/ghi chú và ảnh thật sau deploy trước khi đóng gate.

## Một chuẩn duy nhất

**Năm cột, đúng thứ tự:** `STT | Tên | Đơn giá | Số lượng | Thành tiền`.

- **Hàng tiêu đề** tách riêng, thẳng cột với tất cả dòng sản phẩm. Trên mobile **không ẩn hàng tiêu đề**, không đưa STT/tên sang hàng khác và không lặp nhãn phía trong từng dòng.
- Một sản phẩm là **một hàng lưới 5 cột**. Sản phẩm dài có thể rút gọn trong UI mobile; ảnh chia sẻ giữ đủ tên và ghi chú. **Không đặt icon/nút/ô ghi chú bên cạnh Tên**; chạm Tên để mở hộp ghi chú nổi bên ngoài bảng, xem readonly hoặc chỉnh sửa khi được phép. Hộp ghi chú không chiếm cột hoặc đẩy lệch hàng.
- **Đơn đã giao / đơn tạm / hóa đơn xem trước:** cột Số lượng chỉ hiển thị **số**, không có nút.
- **Giỏ hàng / đang sửa đơn:** giữ nguyên 4 cột còn lại; **duy nhất cột Số lượng** đổi nội dung thành `− số +` và ô nhập; các hàng không thay vị trí khi đổi trạng thái.
- **Chia sẻ ảnh giỏ / ảnh hóa đơn / ảnh công khai**: dùng đúng năm cột, cùng thứ tự, **chỉ hiển thị số lượng**. Không đưa nút sửa, các input, thông tin nội bộ hay ô trống vào ảnh. Ảnh chia sẻ phải lấy đúng dữ liệu đang xem/chọn; tuyệt đối không gọi lại server chỉ để dựng ảnh.
- Căn **STT giữa, Tên trái, Đơn giá phải, Số lượng giữa, Thành tiền phải**. Giữ định dạng tiền vi-VN, tổng = đơn giá × số lượng. Không tự dịch/đổi tiền, không làm tròn mới.
- **Header và body dùng cùng ruler**. Trên điện thoại <=480px, các track edit: `22px minmax(0,1fr) 54px 96px 69px`, preview: `22px minmax(0,1fr) 54px 50px 72px`, gap 4px; tiêu đề và dòng dùng cùng ruler trong mỗi chế độ để có thêm chỗ cho Tên; rút gọn **tên sản phẩm** nếu cần để bảo vệ tiền. Không cắt số tiền, không cho nút +/- lấn sang cột kế bên. Trên màn rộng dùng ruler desktop hiện có cho nội dung và ảnh chia sẻ; không sửa layout bán hàng ngoài giỏ.
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

## Đối chiếu ảnh thực tế 17:40 — tránh grid implicit (IMG_9481)
- Trên mobile, CSS cũ từng gán `grid-area:line / unit / quantity / subtotal` cho bốn ô. Chỉ đặt `grid-template-areas:none` **không đủ**: các ô vẫn tham gia vào grid implicit và tạo hàng/cột ảo, khiến mất tên/đơn giá và đè Thành tiền.
- Source cuối trong `src/fixed-ui-cart-spacing.css` **bắt buộc reset** `grid-area:auto!important`, `grid-row:auto!important` và `grid-column:auto!important` cho `.cart-left/.cart-price/.cart-qty/.cart-total` trên mobile; một hàng phải chứa đủ 5 ô theo thứ tự.
- Khi cập nhật có CSS từ nhiều file `fixed-ui-source-*.css`, phải kiểm tra cascade thực tế. Không chỉ dựa vào test chuỗi selector: đối chiếu ảnh Safari/PWA có tên, đơn giá, SL, thành tiền, không chồng nút; ảnh 17:40 cho thấy test cũ PASS nhưng UI lỗi.

## QA IMG_9482 / IMG_9483 — tối ưu hai kiểu số lượng (08/10/2026)
- Hai ảnh đã xác nhận **lưới 5 cột hoạt động**, số lượng readonly `2/1/24` không có nút; edit `− 1 +` có nút. Không chuyển về bố cục 2 hàng hoặc quay lại CSS grid-area cũ.
- Width phải dựa trên **chế độ của bottom sheet** `data-cart-mode=preview|edit`, set trong `renderCartUI`: preview dùng 50px cho số, edit 96px cho ba control 30/28/30px. Header và body chọn cùng ruler theo `data-cart-mode`; không ẩn header hay đổi thứ tự.
- `STT` và tên chính vẫn căn theo trục dọc 34px. Ghi chú bên cạnh tên là thứ yếu; readonly giới hạn phần ghi chú để ưu tiên tên chính, không thay đổi dữ liệu ghi chú.
- Ảnh sau deploy phải kiểm xem tên dài tăng diện tích hiển thị, `Số lượng` không đè `Thành tiền`, thao tác +/- và số tổng đúng. Unit tests chỉ là contract, pixel thực tế Safari/PWA vẫn cần được xác nhận.

## Quy tắc mới — Gap đo từ MÉP SỐ & ghi chú nổi (2026-10-08)
- `Đơn giá 139 | Số lượng [− 1 +] | Thành tiền 139`: **g1** từ mép phải chữ số `139` đến mép ngoài trái của cụm `− 1 +`; **g2** từ mép ngoài phải cụm đó đến mép trái chữ số `139`. Yêu cầu **g1 = g2**. Trong readonly, số lượng căn giữa chính xác giữa mép phải đơn giá và mép trái thành tiền.
- Để làm được, **Đơn giá căn phải track** và **Thành tiền căn trái track** (khác cách căn phải tổng tiền cũ). Số lượng canh giữa; track SL edit 96px / preview 50px, column-gap hai bên 4px. Hàng tiêu đề *theo trục dữ liệu*, không dùng kích thước header để đo gap.
- Width `Đơn giá` và `Thành tiền` của tất cả dòng + header **dùng chung** CSS variable `--cart-unit-track` và `--cart-total-track` được cập nhật từ **số dài nhất đã format** trong giỏ. Nếu `500 × 10 = 5.000`, phải đủ chỗ cho `5.000`; cấm mỗi dòng tự co track một kiểu.
- 5 cột cùng 1 trục ngang; STT, Tên, Đơn giá, SL, Thành tiền là 1 hàng; **không hiển thị ghi chú trong dòng**. Chạm Tên mở hộp nổi ghi chú. Readonly chỉ xem; đang sửa được lưu/hủy độc lập; dữ liệu `cart[itemId].note` và ảnh chia sẻ vẫn giữ nguyên nguồn.
- CSS popup thuộc `fixed-ui-cart-spacing.css`, chức năng popup thuộc `fixed-ui-runtime-5.js`, nút tên/ruler-max thuộc `fixed-ui-runtime-6.js`. Không dùng interval, API, DB, Edge hoặc lưu binary để hiện ghi chú.
- PASS khi test + ảnh Safari/PWA ở cả 2 kiểu xác nhận gap mép nội dung trái=phải, không chồng số dài, click tên ghi chú không gây dịch dòng và không sửa nhầm đơn readonly; nếu chưa có ảnh sau deploy => VISUAL PENDING.

## Bổ sung 2026-10-08 — Header SL ngắn chỉ khi xem đơn
- **Giỏ đang chỉnh sửa**: cột số lượng có nút `− số +` nên tiêu đề vẫn là **Số lượng**; chiều rộng bộ nút 96px, không rút ngắn.
- **Xem trước/readonly**: tiêu đề của cùng cột hiển thị **SL**, không phải `Số lượng`. Trong `renderCartUI`, khi `data-cart-mode=preview` gán text header `SL`; khi về edit khôi phục `Số lượng`, tránh bị sót nhãn sau chuyển trạng thái.
- Cột SL readonly có độ rộng theo số lượng lớn nhất của tất cả dòng: `--cart-qty-readonly-track = max(32px, độ dài chuỗi vi-VN × 8px + 8px)`. Cả header và body dùng chung variable, nên không còn giữ 50px thừa. Nếu có số lượng lớn, cột tự tăng để không cắt số. Phần rộng dư dành cho Tên.
- **Gap theo mép dữ liệu**: Đơn giá căn phải, SL căn giữa, Thành tiền căn trái; khi giảm độ rộng SL, hai khoảng trống từ mép số hai bên tới số lượng vẫn cân. Các cột còn lại và tổng tiền, ảnh chia sẻ giữ nguyên.
- Source: `src/fixed-ui-runtime-6.js` (nhãn mode + tính width), `src/fixed-ui-cart-spacing.css` (grid), `index.html` (đổi version URL). Không thêm API/DB/Edge/log, không đổi nghiệp vụ.
- Kiểm cả hai mode trên 320/375/390/428px và chuyển qua lại (edit→preview→edit); test PASS chỉ xác nhận hợp đồng, cần ảnh iPhone mới để chốt Visual PASS.

## Chuẩn Excel 5 cột — đo max nội dung thực tế (thay thế quy tắc 7 track)

Nguồn: ảnh ví dụ bảng tính do người dùng gửi 2026-10-08 20:20.

- Chỉ có **5 cột A–E**, thứ tự `STT | Tên | Đơn giá | SL / Số lượng | Thành tiền`, mỗi sản phẩm một hàng. Bỏ hoàn toàn ý tưởng 7 CSS track với hai khoảng đệm linh hoạt. Cách đó làm tiêu đề và số xa nhau không cần thiết.
- **Cột A:** rộng bằng nội dung lớn nhất giữa nhãn `STT` và STT của mọi dòng, cộng đệm nhỏ. **Cột B:** rộng bằng `Tên` hoặc tên sản phẩm dài nhất, nhưng nếu vượt khung thì chỉ cột Tên co lại và hiện dấu ba chấm. **Cột C:** bằng giá trị lớn nhất giữa chữ `Đơn giá` và mọi đơn giá được định dạng vi-VN. **Cột D:** bằng nhãn `SL` hay `Số lượng` hoặc số lượng lớn nhất; **nếu có nút** thì bao gồm toàn bộ khung `− số +` (hai nút, giá trị dài nhất, padding và border). **Cột E:** bằng max nhãn `Thành tiền` hoặc thành tiền lớn nhất của các dòng, tính với hàng như `500 × 10 = 5.000`.
- Tất cả dùng **một bộ độ rộng tính đúng một lần mỗi render cho cả header và tất cả sản phẩm**. Đo chữ theo font trình duyệt bằng canvas sau render, không dự đoán chiều rộng từ số ký tự. Áp dụng `--cart-stt-track`, `--cart-name-track`, `--cart-unit-track`, `--cart-qty-track`, `--cart-total-track`; số lượng có thể dùng `--cart-qty-input-track`.
- Khoảng hở **4 vị trí đều 6px** giữa năm cột; không dùng hai spacer tracks. Giá căn phải cột C, SL/cụm nút ở giữa D, tiền căn trái cột E; chữ tiêu đề ăn theo trục nội dung. Không còn lấy toàn bộ chiều ngang màn hình kéo giãn khoảng trống giữa ba cột số.
- Chế độ sửa có nhãn **Số lượng**, bộ `− số +`; chế độ xem chỉ có nhãn **SL**, số thường. Nút ghi chú không ở bảng: chạm Tên sẽ nổi ghi chú, giữ nguyên dữ liệu. Không sửa phép tính tiền hay share/back-end.
- Đo width theo toàn bộ các dòng (không chỉ dòng 1/2 trong ví dụ). Nếu giá trị tăng khi sửa SL/giá thì lần render tiếp phải tính lại. Không gọi server, DB hay background job để đo chữ.
- **PASS yêu cầu ảnh Safari/PWA sau triển khai**: 5 cột thẳng hàng, A/C/D/E đủ rộng theo max, B co nếu cần, tên dài cắt dấu ba chấm, đơn giá/SL/thành tiền cách nhau đều theo mép thực. Không khẳng định visual PASS chỉ dựa vào CI.

## 2026-10-08 — Desktop split pane dùng cùng ruler với mobile
- Ảnh mới: cửa sổ Chrome rộng ~1080px nhưng Giỏ hàng là panel bên phải rộng ~480px. CSS `@media (max-width:480px)` **không bao giờ kích hoạt** trong trường hợp này dù panel hẹp. Do đó các bản sửa A–E trước đó không hiển thị trên desktop.
- Chuẩn **5 cột nội dung A–E theo max font** phải được áp dụng cho `#cartBottomSheet .cart-compact-grid` **không phụ thuộc vào viewport breakpoint**, bao gồm `.pc-mode` / panel bên phải / giao diện bottom sheet mobile. Selector owner cuối trong `src/fixed-ui-cart-spacing.css` phải để NGOÀI `@media`, header và rows cùng biến CSS `--cart-*-track`.
- `.cart-left {display:contents}` đưa STT và Tên thành hai grid cells; grid-column 1/2/3/4/5 cho STT/Tên/Đơn giá/SL/Thành tiền. Tên click ghi chú nổi, không xuất hiện icon bút pseudo-element, kể cả `data-note-current=""`; STT/Tên đều center theo 34px.
- Đơn giá right, SL center, Thành tiền left theo mép số. Khung edit sử dụng `--cart-qty-track`, hai nút 30px, input theo `--cart-qty-input-track`; readonly chỉ có số. Tất cả cột có gap 6px, không tự `space-between` trên desktop.
- Khi tính vùng còn lại cho Tên, lấy `Math.min(headerInnerWidth, bodyInnerWidth)` sau trừ padding cả hai để không tràn khi body có scrollbar. Tên là cột duy nhất co.
- Regression bắt buộc kiểm thử breakpoint **desktop 1080px với panel ~480px** và mobile 320/375/390/428px; đổi CSS version trong index.html. Tests và Pages PASS chưa thay cho screenshot Chrome thực tế sau triển khai.

## Canonical Rule 2026-10-08 — Bảng chia 2 nhóm LEFT DETAILS / RIGHT METRICS

**Quy tắc này THAY THẾ mọi hướng dẫn cũ nói Thành tiền căn trái, Tên là track cố định,
hoặc chừa khoảng trắng sau cột số cuối.** Google Sheet Rule chung AI-38/UI-100 là canonical.

- **Giỏ hàng (edit/readonly):** 5 cột STT | Tên | Đơn giá | Số lượng/SL | Thành tiền, nhưng chia 2 cụm:
  STT+Tên bám TRÁI; 3 cột số bám PHẢI. Track `Tên = minmax(0,1fr)` lấp phần
  trắng giữa cụm trái/phải. Các track STT/Đơn giá/SL/Thành tiền dùng width
  max đo từ header và mọi giá trị hiện có; E/Thành tiền **luôn căn phải**.
  Giữ 4 gap bằng nhau và bộ `− n +` ở edit, readonly chỉ số.
- **Tổng hợp theo nguồn** ở hai tab Đơn tạm/Đã giao: Nguồn là track linh hoạt
  bên trái; SL/Chi/Thu/Lãi dùng `max-content`, đều căn phải và Lãi cuối sát
  mép phải. Khi vai trò user ẩn Chi/Lãi, lưới đổi sang đúng **3 track**
  Nguồn | SL | Thu, không để cột rỗng.
- **Popup Chi tiết/Gộp nguồn đã giao hoặc đơn tạm:** STT + tên trái; cột SL cuối
  bám mép phải, `max-content` theo SL dài nhất và nhãn. Chi tiết có thêm
  Tên KH (text linh hoạt), có thể co; Gộp có Tên sản phẩm mở rộng phần giữa.
  Header/body/TỔNG/ảnh chia sẻ dùng cùng CSS, không đẩy tổng sang cột khác.
- **Các bảng tương tự:** Chỉ áp dụng khi cấu trúc có nhóm nhận diện/mô tả bên
  trái và nhóm số liệu bên phải; không áp dụng đại trà lên bảng không có
  số liệu ở cột cuối. Bảo vệ giá trị, nút nhập, scroll/ellipsis khi hẹp.
- **Owner trong repo:** `src/fixed-ui-cart-spacing.css` (giỏ), `src/fixed-ui-runtime-6.js`
  (đo track cố định, KHÔNG khóa Tên), `src/fixed-ui-source-3.css` (summary
  max-content đã có), `src/fixed-ui-source-4.css` (user-role 3 tracks +
  source detail shared grid). Không thay SQL/Auth/Giao dịch/API/ảnh dữ liệu.
- **PASS:** 4 ảnh đối chiếu: Tổng hợp, Chi tiết, Gộp, Giỏ readonly/edit.
  Ngoài CI/Pages, cần ảnh sau triển khai trên Safari/Chrome để xác nhận pixel.
