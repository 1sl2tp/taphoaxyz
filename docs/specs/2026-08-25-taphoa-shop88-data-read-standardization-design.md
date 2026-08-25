# TAPHOA — Chuẩn hóa đường đọc dữ liệu theo SHOP88

Ngày: 2026-08-25
Trạng thái: Chờ duyệt triển khai
Phạm vi: Data read/sync layer của TAPHOA; chưa thay đổi UI nghiệp vụ, schema, RPC, RLS, Edge Functions hay production deployment.

## 1. Mục tiêu

Đưa TAPHOA về cùng chuẩn đọc dữ liệu đang dùng ổn định ở SHOP88 để mọi Screen dùng một nguồn dữ liệu thống nhất và tự nhận thay đổi từ Supabase mà không cần reload thủ công.

Sau khi hoàn thành, TAPHOA phải lấy đúng dữ liệu từ cùng backend contract hiện tại:
- products: `ten`, `gia`, `von`, `nhom`, `donVi`, `donViLe`, `quyCach`, `quyDoiThung`, `giaLe`, `active`
- sources
- customers
- orders
- debtSummary
- revisions

Gate dữ liệu hiện tại:
- 649 sản phẩm
- 5 nguồn
- 38 khách
- mẫu `tl1 = Cứng / gia 125 / von 124`

## 2. Nguyên tắc bắt buộc

1. Giữ kiến trúc TAPHOA: `UI → Screen Controller → Business Service → Supabase RPC gateway`.
2. Không cho từng Screen tự đọc Supabase trực tiếp.
3. App State là nguồn dữ liệu runtime duy nhất cho 4 Screen nghiệp vụ.
4. Server revision quyết định khi nào phải tải lại một domain.
5. Cache chỉ dùng để mở nhanh/khôi phục; không được ghi đè dữ liệu mới hơn từ server.
6. Không thay schema, RPC, RLS, Auth hay nghiệp vụ tài chính.
7. Không port UI SHOP88 sang TAPHOA.
8. Không deploy production trong mốc này.

## 3. Luồng đọc dữ liệu chuẩn

### 3.1 Đăng nhập/khôi phục phiên

Giữ nguyên `shop-auth` và Supabase session hiện tại.

Sau khi có session hợp lệ:
1. đọc snapshot TAPHOA nếu có;
2. hiển thị dữ liệu cache hợp lệ để tránh màn trắng;
3. nếu online, gọi `app_bootstrap()` khi chưa có snapshot hoặc cần full bootstrap;
4. lưu kết quả vào App State;
5. lưu snapshot mới;
6. bắt đầu revision sync.

### 3.2 Bootstrap

`BusinessService.bootstrap()` tiếp tục gọi `app_bootstrap()`.

`AppState.setBootstrap()` nhận toàn bộ bundle server và phải giữ đúng:
- user
- permissions
- products
- sources
- customers
- orders
- debtSummary
- printSettings
- selfCustomer
- revisions
- version/syncSeconds nếu backend trả về

Không remap lại giá ở Screen. `product_frontend_json()` của backend là contract chuẩn cho frontend.

### 3.3 Revision/meta sync

Bổ sung `BusinessService.meta()` gọi `app_meta()`.

Sync loop:
1. gọi `app_meta()`;
2. so `remote.revisions` với `AppState.revisions`;
3. domain nào đổi thì gom vào một danh sách;
4. gọi duy nhất `app_domains(changedDomains)`;
5. merge bundle vào App State;
6. lưu snapshot;
7. báo cho active Screen render lại dữ liệu mới.

Mapping revision/domain:
- `products` → tải `products` + `sources`
- `customers` → tải `customers` + `selfCustomer`
- `orders` → tải `orders`
- `debt` → tải `debtSummary`
- `settings` → tải `printSettings`

### 3.4 Nhịp đồng bộ

Dùng `syncSeconds` backend trả về; fallback 30 giây.

Không poll khi:
- offline;
- app/tab không visible;
- đang logout hoặc chưa có session.

Khi tab trở lại visible hoặc browser trở lại online, chạy một lần meta sync ngay.

## 4. Snapshot/cache

Tạo snapshot riêng TAPHOA, không dùng key của SHOP88.

Snapshot tối thiểu chứa:
- cache version
- uid
- savedAt
- server version
- revisions
- products
- sources
- customers
- orders
- debtSummary
- printSettings
- selfCustomer

Quy tắc:
- snapshot phải thuộc đúng uid;
- cache version khác thì bỏ;
- logout phải xóa snapshot runtime của tài khoản đó;
- snapshot không thay thế revision check server;
- dữ liệu mới từ `app_bootstrap/app_domains` luôn thắng cache.

Mốc đầu dùng localStorage hoặc IndexedDB theo implementation nhỏ nhất an toàn; API snapshot phải được cô lập sau một module để có thể đổi storage mà không ảnh hưởng Screen.

## 5. Phân ranh module

### `src/core/supabase.js`
Chỉ gateway RPC/session client. Không giữ business state.

### `src/core/business.js`
Bổ sung API đọc:
- `bootstrap()`
- `meta()`
- `domains(domains)`

Các API ghi nghiệp vụ hiện tại giữ nguyên.

### `src/core/app-state.js`
Mở rộng state và merge domain có kiểm soát. Không tự gọi network.

### `src/core/snapshot.js` (mới)
Sở hữu load/save/clear snapshot và cache version.

### `src/app.js`
Sở hữu lifecycle:
- session restore/login
- bootstrap/cache restore
- start/stop sync loop
- online/visibility refresh
- phát tín hiệu data changed cho active Screen

### 4 Screen
Chỉ dùng `context.getData()` và callback refresh/lifecycle từ App Shell; không tự gọi Supabase trực tiếp.

## 6. Render khi dữ liệu thay đổi

Vì Screen TAPHOA hiện mount độc lập, App Shell cần một cơ chế notify active Screen khi App State đổi.

Thiết kế tối thiểu:
- `screenContext` cung cấp `subscribeData(listener)`;
- active Screen đăng ký listener khi mount;
- listener nhận state mới hoặc danh sách domain đổi;
- cleanup khi Screen unmount;
- chỉ ACTIVE SCREEN nhận update UI.

Điều này giữ đúng route/runtime isolation của TAPHOA và tránh remount toàn App Shell.

## 7. Giá sản phẩm

Không tạo công thức giá mới trong data layer.

Contract chuẩn:
- `p.gia` = `products.price` = Giá bán
- `p.von` = `products.cost` = Giá vốn, chỉ có khi quyền backend cho phép
- `p.giaLe` = backend tính từ `price / pack_qty` khi có quy cách
- `p.quyCach` = `pack_qty`

Screen Bán TAPHOA phải lấy giá mặc định từ `p.gia`; không nhân/chia 1000 và không tự suy luận giá từ tên/nguồn/đơn vị.

## 8. Error handling

- bootstrap lỗi do session: quay về Login.
- meta/domain refresh lỗi mạng: giữ state/cache hiện tại, không xóa dữ liệu đang hiển thị.
- lần sync sau được phép thử lại.
- lỗi một domain không được reset domain khác.
- không hiển thị dữ liệu trắng chỉ vì một refresh thất bại.

## 9. Kiểm thử bắt buộc

### Unit/static
1. `setBootstrap` giữ đầy đủ contract.
2. `mergeDomains` chỉ thay domain có trong response.
3. revision comparison phát hiện đúng domain thay đổi.
4. snapshot không nạp cho uid khác/cache version khác.
5. logout dừng timer và xóa runtime state.

### Integration với Supabase hiện tại
1. login admin thành công bằng session hợp lệ.
2. `app_bootstrap` trả 649 products, 5 sources, 38 customers.
3. `tl1` trong App State là `Cứng`, `gia=125`, `von=124`.
4. bump `products` revision rồi sync: TAPHOA gọi lại products domain và Screen nhận dữ liệu mới mà không reload trang.
5. đổi customer revision: chỉ customer domain refresh.
6. orders/debt không bị reset khi products refresh.

### Browser
- reload vẫn có dữ liệu từ snapshot;
- online sync thay dữ liệu cache bằng server mới hơn;
- chuyển 4 Screen không tạo nhiều sync timer;
- chỉ active Screen mount;
- không phát sinh console error.

## 10. Ngoài phạm vi mốc này

Chưa triển khai trong mốc GET:
- mutation queue/outbox;
- optimistic mutation/reconcile;
- realtime business event channel;
- push notification;
- thay đổi UI/geometry;
- customer Auth creation;
- production deployment.

Các phần ghi nghiệp vụ sẽ được chuẩn hóa theo SHOP88 ở mốc sau, sau khi GET layer PASS.

## 11. Tiêu chí PASS

Mốc này PASS khi:
1. TAPHOA dùng một App State chung cho dữ liệu backend;
2. bootstrap và domain refresh dùng đúng RPC hiện hữu;
3. revisions được dùng thực sự để kéo dữ liệu thay đổi;
4. có snapshot cô lập theo tài khoản;
5. active Screen tự cập nhật sau sync;
6. dữ liệu kiểm chứng: 649 SP / 5 nguồn / 38 khách / `tl1 Cứng 125 124`;
7. không thay schema/RPC/RLS/Auth/business contract;
8. không deploy production.
