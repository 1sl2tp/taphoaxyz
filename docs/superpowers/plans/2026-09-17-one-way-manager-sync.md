# One-way Manager Sync Implementation Plan

**Goal:** Khóa dữ liệu nguồn/sản phẩm theo một chiều `Quản trị / Google Sheet → Supabase → Web`; Web chỉ đọc Supabase.

**Architecture:** Giữ worker `taphoa-sheet-sync` và cron mỗi phút. Worker đọc workbook Quản trị, nhận diện nguồn theo `sheetId`, cấp Mã SP cho dòng mới chưa có mã, tính delta và ghi Supabase. Không xử lý bất kỳ outbox/request nào phát sinh từ Web và không nhận action create/update/delete từ browser.

**Tech Stack:** Supabase Edge Functions (Deno), PostgreSQL/pg_cron, Google Sheets API, JavaScript static frontend, Node test runner.

**Spec:** `docs/PRODUCT_EDITOR_SYNC_RULES.md`

## Task 1: Khóa contract một chiều bằng test

**Files:**
- Modify: `tests/taphoa-product-realtime-sync-contract.test.js`
- Remove/retire: `tests/taphoa-direct-sheet-mutations.test.js` nếu contract cũ xung đột

**Steps:**
1. Viết test yêu cầu worker giữ dynamic `sheetId`, cron/inbound delta, cấp Mã SP và lock.
2. Test cấm `directMutation`, product/source outbound queues và web mutation handlers trong worker.
3. Test cấm `fixed-product-persistence.js` trong production index và cấm create/update/delete source/product trong business service.
4. Chạy GitHub Actions và xác nhận test mới FAIL đúng vì code production còn hai chiều.

## Task 2: Thu gọn worker thành Sheet → Supabase

**Files:**
- Modify: `supabase/functions/taphoa-sheet-sync/index.ts`

**Steps:**
1. Giữ auth cron/admin-force, Drive modifiedTime gate, sync lock, dynamic sheet metadata.
2. Giữ source reconciliation theo `sheetId`, nhưng chỉ Sheet quyết định nguồn.
3. Giữ cấp Mã SP cho dòng Sheet trống mã và metadata kỹ thuật AY/AZ.
4. Giữ inbound scan + `taphoa_apply_product_delta` để upsert/deactivate Supabase.
5. Xóa đường source/product create/update/delete từ Supabase/Web lên Sheet và xóa action routing.

## Task 3: Khóa Web ở chế độ product read-only

**Files:**
- Modify: `index.html`
- Modify: `src/core/business.js`
- Modify as needed: `src/fixed-production-bridge.js`
- Delete or leave unloaded: `src/fixed-product-persistence.js`

**Steps:**
1. Bỏ product editor persistence khỏi production page.
2. Bỏ createSource/deleteSource/updateProduct/deleteProduct khỏi business service và bridge.
3. Không chạm order/debt mutations.

## Task 4: Retire hàng đợi outbound cũ

**Files:**
- Add migration: `supabase/migrations/20260917150000_taphoa_one_way_product_sync.sql`

**Steps:**
1. Chuyển mọi pending product outbox sang `superseded`.
2. Chuyển pending product/source request cũ sang `cancelled`.
3. Thu hồi quyền execute của các RPC product/source mutation từ Web nếu chữ ký hiện tại tồn tại; không xóa bảng để tránh migration phá hủy.
4. Áp migration lên project Supabase hiện tại.

## Task 5: Deploy và verify

**Files:**
- Deploy `supabase/functions/taphoa-sheet-sync/index.ts` + `deno.json`

**Steps:**
1. Deploy worker một chiều vào project `gcnoahqsrquxkwkjbuxy` với cơ chế auth hiện hữu.
2. Xác nhận cron `taphoa_sheet_sync_every_minute` vẫn active `* * * * *`.
3. Kích hoạt một lần sync qua cron/manual cron request và đọc `taphoa_sheet_sync_state`.
4. Xác nhận pending outbound = 0.
5. Chạy full GitHub Actions/build; chỉ kết luận hoàn tất khi tất cả PASS.
