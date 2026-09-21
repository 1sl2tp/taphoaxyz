# 10 · THẺ UI TAPHOAXYZ

**CARD:** UI-TAPHOA  
**VERSION:** UI-CARD-V1  
**TRẠNG THÁI:** Production current structure + target ownership.  
**PHẠM VI:** Chỉ UI.

## Chế độ hiển thị

- Mobile/touch là ưu tiên chính.
- Desktop là layout rộng riêng, không chỉ phóng mobile.
- PWA được hỗ trợ bằng `manifest.webmanifest` + `sw.js`.
- Auto-update do `src/fixed-pwa-auto-update.js`; có build mới thì chỉ reload khi không có giỏ đang hoạt động.

## Owner hiện tại

### P0 Platform
- `manifest.webmanifest`
- `sw.js`
- `src/fixed-pwa-auto-update.js`
- font/platform support: `src/fixed-ui-font-loader.js`, iOS share fallback hiện có.

### P1 Shell
Hiện **chưa có một owner sạch duy nhất**. Shell đang được tạo/phối hợp bởi:
- `index.html`
- `fixed-ui-markup-*.js`
- `fixed-ui-source-*.css`
- `fixed-ui-runtime-*.js`
- `fixed-production-overrides.js`

Đây là nợ UI chính. Cấm thêm một lớp global override mới nếu chưa chứng minh owner cũ không thể sửa.

### P2 Screen
Các vùng nghiệp vụ UI chính:
- Bán hàng;
- Giỏ/Xem đơn;
- Đã giao;
- Đơn tạm;
- Công nợ;
- Cài đặt/khác liên quan UI.

Screen phải sở hữu geometry nội bộ của chính nó; không sửa App Shell để chữa một row/component.

### P3/P4 hiện có
- product/media;
- cart;
- order list/detail/source summary;
- customer picker/search;
- quantity;
- share capture;
- debt popup;
- login fields.

Nhiều component hiện còn phân tán qua `fixed-ui-*`; khi chạm vùng nào phải xác định owner thật trước khi đổi tên/tách file.

## Responsive contract hiện tại

- Shell hiện có mobile app-width và `.pc-mode` cho desktop; CSS hiện có breakpoint desktop từ 768px.
- Khi phát triển tiếp, project phải test ít nhất các nhóm: mobile nhỏ, mobile chuẩn, tablet/desktop chạm, desktop fine-pointer.
- Không thêm breakpoint mới chỉ để chữa một ảnh chụp; nếu cần phải cập nhật thẻ này.

## Rule đặc biệt TAPHOA

- Quantity luôn `− 0 +`; row không tăng số lượng.
- Dữ liệu/giỏ đang thao tác không được mất vì auto-update UI.
- Bảng/tóm tắt đơn phải có một geometry owner; separator/background thuộc table/region, không thuộc từng cell vá riêng.
- Empty state căn theo vùng content owner, không căn theo viewport nếu content chỉ là một panel.
- Mobile Safari/PWA share dùng Platform/share path; feature không tự nhân đôi logic.
- Login/input không được làm Safari zoom/jump.

## Target khi dọn code

```text
src/
  platform/
  shell/
  components/
  features/
    sales/
    cart/
    orders/
    debt/
  styles/
```

Không rewrite toàn bộ. Mỗi lần sửa thật một vùng thì chuyển ownership của vùng đó dần về cấu trúc trên.

## Câu hỏi bắt buộc trước khi sửa

**Lỗi đang nằm ở Platform, Shell, Screen, Component hay Control?**  
Nếu chưa trả lời được thì chưa thêm CSS/JS.
