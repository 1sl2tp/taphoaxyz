# TAPHOA — Structural Region & Function Flow Guardrail

**Ngày:** 2026-08-25  
**Trạng thái:** DESIGN APPROVED — chờ duyệt tài liệu trước khi lập kế hoạch triển khai  
**Phạm vi:** Frontend TAPHOA; cấu trúc semantic, placement Mobile/PC, Cha–Con, owner, luồng chức năng, naming, scroll/focus, Auth/Login và tiêu chí kiểm tra.  
**Không thuộc phạm vi:** thay đổi nghiệp vụ, tài chính, Supabase schema/RPC/RLS, quyền, dữ liệu thật hoặc deploy production.

---

## 1. Mục tiêu

Tạo một bộ quy tắc có thể dùng để **kiểm tra và buộc frontend TAPHOA luôn có cấu trúc rõ ràng**, thay vì chỉ nhìn giao diện thấy đúng rồi coi là đạt.

Bộ quy tắc phải trả lời được cho mọi phần của website:

- đây là Root, Screen, Slot, Surface, Region hay Control;
- Cha trực tiếp là ai và các Con cùng cấp là gì;
- node này có một trách nhiệm chính nào;
- ai sở hữu geometry, interaction, state/data, scroll, focus/keyboard và paint;
- chức năng đi từ đâu → làm gì → đổi state nào → mở vùng nào → quay lại đâu;
- Mobile dùng vùng nào; PC mở thêm vùng nào;
- code, DOM và thứ tự semantic có phản ánh đúng bố cục/nghiệp vụ không;
- tên hiển thị có đúng với hành vi thật hay không.

**Nguyên tắc cốt lõi:** bố cục người dùng đã duyệt là chuẩn tham chiếu hình học/UX; code cũ không phải kiến trúc bắt buộc. Nếu code cũ chưa chia đúng hoặc tên vô nghĩa, phải chia lại, đổi tên và sắp thứ tự code cho đúng semantic mà không tự ý thay đổi bố cục đã duyệt.

---

## 2. Thứ tự hiệu lực và nguồn quy tắc

1. Yêu cầu mới nhất, rõ ràng của người dùng.
2. Business/Data/Auth/Security contract đang đúng và đã xác nhận.
3. `docs/TAPHOA_QUY_TAC_LAM_VIEC.txt` sau khi bộ quy tắc này được merge vào nguồn chính.
4. Checkpoint/trạng thái triển khai hiện tại.
5. Web/code cũ chỉ là bằng chứng cho bố cục, thói quen thao tác, luồng chức năng và contract thực tế.

Không tạo hai bộ quy tắc vận hành cạnh tranh. Tài liệu này là **design spec** để duyệt kiến trúc. Khi triển khai được duyệt, các điều đã chốt phải được merge vào nguồn quy tắc TAPHOA duy nhất thay vì duy trì song song vô thời hạn.

---

## 3. Thuật ngữ bắt buộc

### 3.1 Root

Cấp trạng thái ứng dụng ngay dưới Browser/Visual Viewport.

Chỉ có hai root application state thay thế nhau:

- **Auth Root** — khi chưa có phiên hợp lệ hoặc cần đăng nhập lại.
- **App Root** — khi đã có identity/session hợp lệ và ứng dụng được mở.

Auth Root và App Root là **sibling state**, không phải Cha–Con.

### 3.2 Screen

Một màn nghiệp vụ top-level được Screen Host mount. TAPHOA hiện có đúng 4 Screen nghiệp vụ:

- Sales / Bán hàng
- Delivered / Đã giao
- Pending / Đơn tạm
- Debt / Công nợ

Login/Auth không phải Screen nghiệp vụ.

### 3.3 Workspace

Root nội bộ của một Screen, chứa placement slots và các semantic surfaces/regions của Screen đó.

### 3.4 Slot

**Vùng bố trí vật lý**, không phải quan hệ nghiệp vụ.

- **Slot 1 — Primary:** vùng chính, luôn tồn tại về placement contract; Mobile chỉ hiển thị Slot 1.
- **Slot 2 — Secondary:** vùng phụ dành cho màn rộng/PC khi cần hiển thị song song.
- **Slot 3 — Tertiary:** vùng ngữ cảnh/chi tiết bổ sung hoặc dự trữ cho PC.

Slot không được dùng để suy luận semantic parent.

### 3.5 Surface

Một trạng thái trình bày có thể được đặt vào Slot. Trên Mobile, các Surface có thể replace/drill-down trong Slot 1 nhưng vẫn giữ semantic identity.

### 3.6 Region

Một vùng semantic có đúng một mục đích chính, ví dụ Customer Context, Product Controls, Product List, Order List, Order Detail, Debt Timeline.

### 3.7 Control / Leaf

Button, input, checkbox, row action hoặc phần tử tương tác cuối cùng. Control không được giả làm Region nếu nó không sở hữu một responsibility độc lập.

---

## 4. Cây nền bắt buộc

```text
Browser / Visual Viewport
│
├── Auth Root
│   └── Auth Workspace
│       ├── Brand Region
│       ├── Credential Region
│       ├── Preference Region
│       ├── Auth Status Region
│       └── Auth Action Region
│
└── App Root
    ├── Navigation
    ├── Screen Host
    │   └── Active Screen duy nhất
    │       └── Screen Workspace
    │           ├── Slot 1 — Primary
    │           ├── Slot 2 — Secondary
    │           └── Slot 3 — Tertiary
    └── System Layer
```

### 4.1 Quy tắc Root

- Auth Root và App Root thay thế nhau, không cùng active về interaction.
- Login không nằm trong Slot 1/2/3.
- System Layer là sibling của Screen Host dưới App Root.
- Screen Host là runtime container, không phải Screen nghiệp vụ và không sở hữu logic nội bộ của Screen.
- Chỉ một Active Screen được mount.

---

## 5. Hai cây bắt buộc phải tồn tại song song

Mỗi Screen phải có **Semantic Tree** và **Placement Tree**. Hai cây liên hệ với nhau qua placement map nhưng không được nhập làm một.

### 5.1 Semantic / Function Tree

Mô tả ý nghĩa và Cha–Con nghiệp vụ.

Ví dụ Sales:

```text
Sales Screen
├── Sales Context
│   ├── Customer Context
│   ├── Time Context
│   └── Quick Cart Status
├── Product Controls
│   ├── Product Search
│   └── Product Groups
├── Product List
│   └── Product Row × N
│       ├── Product Information
│       ├── Price Region
│       └── Quantity Control
└── Cart
    ├── Cart Header
    ├── Cart List
    ├── Cart Total
    └── Cart Actions
```

### 5.2 Placement Tree

Mô tả vùng vật lý theo kích thước màn hình.

```text
MOBILE
Slot 1
└── Active Surface

PC / WIDE
├── Slot 1
├── Slot 2
└── Slot 3
```

### 5.3 Rule cứng

**Không bao giờ suy semantic parent từ vị trí nhìn thấy.**

Ví dụ Cart có thể ở Slot 2 trên PC nhưng replace Product Surface trong Slot 1 trên Mobile. Cart vẫn là Cart Region của Sales Screen; nó không trở thành Con của Product List chỉ vì đang hiển thị cùng chỗ.

---

## 6. Contract Slot 1 / 2 / 3

### 6.1 Mobile

- Chỉ có một track nội dung chính: Slot 1.
- Slot 2 và Slot 3 không được chiếm geometry ẩn, tạo khoảng trống hoặc gây horizontal overflow.
- Chức năng sâu hơn dùng replace/drill-down trong Slot 1 nếu cần.
- Khi replace/drill-down phải giữ state/context/back path.

### 6.2 PC / Wide

- Slot 1 giữ nội dung primary.
- Slot 2 chỉ mở khi Screen có secondary surface hợp lệ.
- Slot 3 chỉ mở khi có tertiary/context/detail surface hợp lệ.
- Không bắt buộc cả 3 Slot phải có nội dung ở mọi Screen.
- Slot trống không được tạo wrapper/column vô nghĩa chỉ để "dự trữ chỗ".
- Việc bật Slot 2/3 là placement decision của Screen Workspace, không phải business flow mới.

### 6.3 Responsive

- Mobile và PC dùng cùng Semantic Tree và cùng state identity.
- Responsive chỉ thay đổi placement/reflow/replace strategy.
- Không tạo hai business flow riêng cho Mobile và PC.

---

## 7. Region Contract — 8 câu hỏi bắt buộc

Một Region chỉ được gọi là **STRUCTURALLY VALID** khi trả lời được đủ 8 mục:

1. **Name/ID:** tên semantic rõ nghĩa là gì?
2. **Parent:** Cha trực tiếp là node nào?
3. **Children:** các Con cùng cấp hợp lệ là gì?
4. **Purpose:** trách nhiệm chính duy nhất của Region là gì?
5. **Geometry Owner:** ai quyết width/height/grid/flex/gap/alignment/breakpoint?
6. **Interaction Owner:** ai nhận và xử lý action?
7. **State/Data Owner:** state/data nào thuộc Region hoặc Controller nào?
8. **Scroll/Focus Owner:** node nào được cuộn; input/keyboard/focus thuộc ai?

Thiếu một mục → **STRUCTURE FAIL** hoặc **OWNER FAIL** tùy loại.

---

## 8. Parent–Child Contract

- Parent sở hữu quan hệ hình học giữa các Con: grid/flex, tỷ lệ, gap, gutter, alignment và placement.
- Con sở hữu nội dung/padding nội bộ của chính nó, trừ shared component contract đã chốt.
- Không chữa lỗi Cha bằng margin/top/z-index/fixed/width hack ở Con.
- Trước khi sửa một Region phải xác định parent trực tiếp và sibling cùng cấp.
- Node không xác định được parent trực tiếp → BLOCKED.
- Hai owner cùng quyết một geometry/action/scroll/focus không có contract → BLOCKED.
- DOM Screen này không được phụ thuộc DOM Screen khác.

---

## 9. Naming & Code Order Contract

### 9.1 Naming

Tên code phải nói được ý nghĩa nghiệp vụ hoặc kiến trúc.

**Không đạt:**

- `box1`, `box2`
- `top2`
- `content-x`
- `wrapper-a`
- `abc`
- tên mang nghĩa vị trí tạm nhưng thực tế là semantic Region

**Đạt:**

- `sales-context-region`
- `sales-product-controls`
- `sales-product-list-region`
- `delivered-order-list`
- `debt-customer-list`
- `auth-credential-region`

Tên `wrapper`, `container`, `panel` chỉ được dùng khi vai trò container/panel thật sự rõ trong contract; không dùng để che việc chưa phân tích semantic.

### 9.2 Code order

Thứ tự source/DOM mặc định phải theo thứ tự semantic và luồng đọc của người dùng.

Nếu PC cần hiển thị khác thứ tự source, dùng placement/layout contract thay vì đảo semantic DOM vô cớ.

### 9.3 Refactor code cũ

Nếu bố cục hiển thị cũ đúng nhưng code chưa chia vùng hoặc tên vô nghĩa:

1. giữ bố cục/UX đã duyệt làm reference;
2. dựng lại Semantic Tree;
3. xác định owner;
4. đổi tên semantic;
5. sắp source theo cây và flow;
6. nối lại behavior/data qua contract hiện hành;
7. regression test để chứng minh không đổi nghiệp vụ.

Không giữ kiến trúc sai chỉ vì "đang chạy".

---

## 10. Function Flow Contract

Mỗi action quan trọng phải khai báo tối thiểu:

```text
SOURCE
→ ACTION
→ MUTATION/STATE OWNER
→ TARGET STATE
→ TARGET REGION/SURFACE
→ BACK/RETURN PATH
```

Nếu action phụ thuộc quyền, thêm **Permission Owner / Permission Gate**.

Ví dụ:

```text
Product Row
→ bấm +
→ Sales Controller / cart state
→ quantity tăng
→ Product Row + Cart cập nhật
→ không đổi Screen
```

```text
Delivered Order Card
→ mở đơn
→ selectedOrder
→ Order Detail Surface
→ Back
→ trở lại Order List với filter/selection/scroll trước đó
```

### 10.1 Rule cứng

- Một user action chỉ có một mutation owner.
- Không dùng row click + child click + dblclick để cùng sửa một state.
- Không dùng modal để thay cho một tầng điều hướng semantic nếu đó là drill-down thật.
- Back phải có target rõ và khôi phục context phù hợp.
- Sync/re-render không làm mất Screen, filter, selection, draft hoặc scroll nếu contract yêu cầu giữ.
- UI không tự quyết quyền/nghiệp vụ; quyền thuộc backend/business contract.

---

## 11. Scroll / Focus / Keyboard Contract

- Viewport/App Root/Active Screen không được cuộn thay cho danh sách dài nếu danh sách là scroll owner.
- Vùng nào là danh sách tăng theo dữ liệu thì chính vùng danh sách đó được ưu tiên làm scroll owner.
- Header, Context, Controls, Summary, Total và Actions đứng ngoài list scroll khi UX yêu cầu giữ cố định.
- Detail Panel không được vừa cuộn toàn panel vừa cuộn inner list nếu không có contract rõ.
- Mỗi thời điểm một trục chức năng chỉ có owner cuộn chính rõ ràng.
- Scroll state chỉ lưu/restore cho đúng owner.
- Full re-render không được làm list nhảy về đầu.
- Focus/keyboard thuộc Active Screen hoặc Active System Layer modal.
- Global Enter/Escape không kích action Screen nếu không có owner global rõ.

Scroll Owner layer đã triển khai trước đó phải được coi là một implementation của contract này, không phải lý do bỏ qua Semantic/Placement audit.

---

## 12. Auth/Login Contract và mâu thuẫn hiện tại

### 12.1 Auth Root không dùng Slot

Login/Auth là Root riêng, không phải Screen và không thuộc Slot 1/2/3.

Cây chuẩn:

```text
Auth Root
└── Auth Workspace
    ├── Brand Region
    ├── Credential Region
    │   ├── Username Field
    │   └── Password Field
    │       └── Password Visibility Action
    ├── Preference Region
    │   └── Remember Username
    ├── Auth Status Region
    └── Auth Action Region
        └── Login Action
```

HTML `form` có thể bao các vùng phù hợp vì form semantics, nhưng không được dùng một `login-card` vô danh để thay cho mọi responsibility mà không có semantic subdivision.

### 12.2 Mâu thuẫn label ↔ behavior hiện tại

UI hiện ghi **"Lưu mật khẩu"** nhưng runtime chỉ lưu **username** vào `localStorage`; password không được lưu bởi preference checkbox.

Contract chốt:

- Nếu behavior giữ nguyên, label phải đổi thành **"Nhớ tên đăng nhập"**.
- Không được sửa implementation thành tự lưu password chỉ để khớp label.
- Supabase persistent session/refresh token là cơ chế khác với "nhớ tên đăng nhập" và không được trộn ngữ nghĩa.

Đây là ví dụ chuẩn của lỗi:

**UI nói A nhưng runtime làm B → FUNCTION CONTRACT FAIL.**

### 12.3 Auth behavior không đổi trong mốc cấu trúc

Refactor semantic Login không được tự thay đổi:

- auth endpoint;
- Supabase session behavior;
- identity lookup;
- role/permission;
- offline identity hint;
- sign-out semantics;
- secret/storage policy.

Bất kỳ thay đổi Auth/Security behavior nào phải thành mốc riêng và có security review/test riêng.

---

## 13. Screen/Region Registry bắt buộc

Đích kiến trúc là mỗi Screen có một contract/registry có thể đọc và test được, tối thiểu mô tả:

- `screenId`
- semantic regions
- parent/children
- default surface
- placement map Mobile/PC
- Slot 1/2/3 eligibility
- scroll owners
- primary flows
- serialize/restore state requirements

App Root chỉ biết Screen Registry/top-level navigation; không biết DOM chi tiết của từng Screen.

Registry là nguồn để audit, không render debug metadata ra giao diện người dùng.

---

## 14. Initial structural audit theo code hiện tại

Đây là quan sát để định hướng triển khai, chưa phải implementation.

### 14.1 Root

**PARTIAL PASS**

- `login-screen` và `app-shell` đã là hai sibling dưới `taphoa-viewport` và thay nhau bằng `hidden`.
- Login chưa được chia semantic thành Credential / Preference / Status / Action Region rõ ràng.

### 14.2 App Root

**PARTIAL PASS**

- Có Navigation và Screen Host.
- `systemToast` là sibling của Screen Host nhưng chưa có semantic `System Layer` container rõ ràng.
- Chưa có Screen Workspace/Slot 1/2/3 contract chung.

### 14.3 Screens

**PARTIAL PASS**

- 4 Screen đã có `data-screen-id` và file riêng.
- Một số vùng hiển thị đã tách theo chức năng, nhưng chưa có Registry/Parent–Child/Placement contract machine-checkable.
- Scroll Owner mới đã giao quyền cuộn cho list đúng hơn, nhưng không thay thế việc chuẩn hóa toàn semantic tree.

### 14.4 Login wording

**FUNCTION CONTRACT FAIL**

- Label "Lưu mật khẩu" không khớp behavior chỉ lưu username.

---

## 15. PASS/FAIL taxonomy

Không dùng một chữ PASS chung cho mọi loại kiểm tra.

Một Screen/Root phải đi qua các gate phù hợp:

1. **TREE PASS** — cây Root/Screen/Region/Control đúng.
2. **NAMING PASS** — tên code/semantic có nghĩa và nhất quán.
3. **OWNER PASS** — geometry/interaction/state/scroll/focus owner không chồng.
4. **PLACEMENT PASS** — Slot 1/2/3 và Mobile/PC map đúng.
5. **FLOW PASS** — source/action/state/target/back path đúng.
6. **SCROLL/FOCUS PASS** — scroll/focus/keyboard đúng owner.
7. **RESPONSIVE PASS** — 280→1440 và resize ngược trong phạm vi liên quan.
8. **RUNTIME PASS** — mount/unmount/listener cleanup/state restore đúng.
9. **BUSINESS CONTRACT PASS** — behavior/data/permission không bị đổi ngoài ý muốn.

Chỉ khi tất cả gate cần thiết đều đạt mới gọi:

**SCREEN STRUCTURE PASS**

Static/parse PASS không đồng nghĩa browser/device PASS. Visual đúng không đồng nghĩa backend/business PASS.

---

## 16. Automatic audit / test direction

Mốc triển khai sau phải tạo contract tests có thể bắt ít nhất các lỗi:

- Screen thiếu `data-screen-id` hoặc registry entry;
- Region không có semantic ID/name;
- parent khai báo không tồn tại hoặc cycle;
- Slot placement trỏ tới Region không tồn tại;
- Mobile có Slot 2/3 chiếm geometry;
- Screen root tự scroll khi list đã được khai báo scroll owner;
- hai scroll owner lồng nhau không có explicit exception;
- code dùng forbidden generic names cho Region chính;
- flow thiếu back target ở drill-down;
- UI label Auth không khớp behavior contract;
- Screen inactive còn listener/runtime owner;
- source/DOM order phá semantic tree không có placement justification.

Test tự động là guardrail, không thay browser/device visual check.

---

## 17. Migration strategy

Không rewrite toàn app trong một commit chỉ để đạt tên đẹp.

Thực hiện theo lớp:

1. merge bộ quy tắc vào nguồn TAPHOA chính;
2. dựng schema/registry cho Root + 4 Screen;
3. tạo audit tests trước;
4. chuẩn hóa Auth Root;
5. chuẩn hóa App Root + Screen Workspace + Slot contract;
6. chuẩn hóa lần lượt 4 Screen dựa trên cùng registry/guardrail;
7. giữ bố cục đã duyệt và business behavior trong mỗi bước;
8. mỗi Screen chỉ chốt sau khi các gate liên quan PASS.

Nếu code cũ của một Screen quá rối, được phép viết lại sạch **trong phạm vi Screen đó**, nhưng không dùng lý do này để đổi backend/business contract hoặc phá Screen khác.

---

## 18. Non-goals / Guardrails

Bộ quy tắc này không cho phép tự động:

- thay đổi nghiệp vụ bán/đơn/công nợ;
- đổi giá, đơn vị, logic tiền;
- đổi Auth/Security contract;
- đổi Supabase schema/RPC/RLS;
- deploy production;
- thay bố cục người dùng đã duyệt chỉ để code "đẹp" hơn;
- sinh debug labels/region boxes ra UI production.

---

## 19. Tiêu chí hoàn tất chương trình chuẩn hóa

Chương trình được coi là hoàn tất khi:

- Auth Root và App Root đúng cây;
- cả 4 Screen có Semantic Tree + Placement Tree rõ;
- Slot 1/2/3 có contract dùng chung;
- mọi Region chính trả lời đủ 8 câu hỏi;
- mọi flow chính có source/action/state/target/back path;
- naming và source order semantic;
- scroll/focus/keyboard owner rõ;
- Login label/behavior mâu thuẫn được sửa đúng hướng không lưu password thủ công;
- automated structural tests PASS;
- responsive/browser checks cần thiết PASS;
- business/auth/data regression không bị phá.

---

## 20. Quyết định đã chốt

1. Mobile dùng Slot 1; PC có thể mở thêm Slot 2 và Slot 3.
2. Slot là placement, không phải semantic parent.
3. Mỗi Screen bắt buộc có Semantic Tree + Placement Tree.
4. Quan hệ Cha–Con và owner phải được kiểm như contract, không chỉ ghi chú.
5. Luồng chức năng là một phần của cấu trúc và phải có back/state owner rõ.
6. Code cũ chưa chia đúng hoặc tên vô nghĩa thì chia/đổi tên/sắp lại; bố cục hiển thị đã duyệt vẫn là reference.
7. Login/Auth là Root riêng, không thuộc các Slot của App Screen.
8. UI "Lưu mật khẩu" hiện tại mâu thuẫn behavior; hướng đúng là "Nhớ tên đăng nhập", không lưu password thủ công.
9. Bộ quy tắc phải có khả năng audit tự động và phân loại PASS/FAIL theo gate.
10. Khi triển khai xong, quy tắc đã xác nhận phải được merge vào nguồn quy tắc TAPHOA duy nhất, không duy trì luật cạnh tranh.
