# ORDER-PORTRAIT-019 — Phiếu đơn dễ đọc trên iPhone / Chat

## Nguồn và vấn đề
- Ảnh DG361 (C Hoa Mễ, 2 mã, 25 sản phẩm, tổng 24.275) và ảnh Chat người dùng cho thấy chữ phiếu quá nhỏ khi ảnh thu vào khung hội thoại; phiếu HTML trước đó còn nhiều khoảng trắng.
- Canonical renderer: `src/fixed-ui-portrait-order.js`. `createPage` dùng cho giỏ/chi tiết/link xem trước, `renderCanvas` dùng cho ảnh tự động Chat và Zalo; cả hai phải được chỉnh cùng chủ đề.
- Không sửa ảnh cũ đã gửi hoặc tự gửi bù.

## Given / When / Then
- When renderCanvas tạo phiếu có 1–3 dòng, then giữ đúng 5 cột STT | TÊN | SL | ĐG | TIỀN, chiều cao theo số dòng (minHeight 380 logic, không 620) để ảnh xem trong Chat đủ lớn, ít khoảng trống; đầu trang và tổng không che nội dung.
- When rendered at 440 logical pixels, then customer title ~24px, code/time 14px, name 15–17px, digits 12–16px (giảm theo mức dài của số), captions 11–12px, total up to 28px, row min-height 68px. All money remains exact, right aligned and header/body use one ruler. No truncating long names, instead break by words; notes show smaller but legible at 13px.
- When HTML fallback/page is generated, then use matching typography, paddings, backgrounds and a compact footer, retaining same 5-column grid.
- When product names and prices are long, then numeric columns size to their actual pixel width (not fixed 50px). Reduce numeric font only when name-column would fall under 115px; fail closed if fewer than 72px remain, rather than overlap or truncate money.
- When font assets are unavailable offline, then system font fallback is used. Do not require external CDN to render.
- When browser PWA updates, then new script query `portrait-ui=20261115-019` and SW cache v42 are loaded.

## MUST-STAY
No edits to sale totals, product data, customer privacy, notification permissions, deliver/temporary-order rules, Supabase, storage, Zalo or Chat sending. No production transactions. Rollback via reverting renderer and cache version only.

## Evidence E0–E5
E0: user image + source code audit. E1: Node unit renderer tests including 2-row dimensions, text sizes, five-column alignment. E2/E3: CI + Pages publish confirmed separately. E4: physical iPhone Safari/PWA, Android Chrome, long names, 1/2/10/130 rows still require screenshot evidence; no device proof claimed solely from tests. E5: no new network, font fetch, persistent storage or scheduler.
