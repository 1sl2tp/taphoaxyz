# taphoa master spec

Mục tiêu: viết lại 100% frontend dự án `taphoa` theo quy tắc Cha → Con → Cháu, giữ 100% tên/bố cục/luồng đã duyệt từ mẫu tham khảo trong phạm vi 4 chức năng: Bán hàng, Đã giao, Đơn tạm, Công nợ; có Đăng nhập và giữ business contract Supabase hiện tại.

## Visible UI lock

Không tự hiển thị chữ kỹ thuật như Region, Owner, Semantic, Debug, Preview, PASS hay nội dung ngoài mẫu/chưa được duyệt.

## Kiến trúc

Viewport → Login/Auth hoặc App Shell → Navigation + Screen Host + System Layer → Active Screen → Region → Cha → Con → Cháu → Control.

Parent sở hữu geometry giữa các Con. Responsive do owner gần nhất quyết. Không vá lỗi Cha bằng margin/top/z-index/width ở Con.

## Backend

UI → Screen Controller → Business Service → Supabase RPC gateway.

Giữ các contract hiện có như app_bootstrap, app_domains, save_order, deliver_order, reverse_order, delete_pending_order, batch_orders, debt_transaction, order_detail, debt_ledger_page.
