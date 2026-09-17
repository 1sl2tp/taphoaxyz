import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration=fs.readFileSync(new URL('../supabase/migrations/20260917020000_taphoa_product_realtime_sheet_sync.sql',import.meta.url),'utf8');
const deleteMigrationUrl=new URL('../supabase/migrations/20260917050000_taphoa_product_source_delete_from_web.sql',import.meta.url);
const deleteMigration=fs.existsSync(deleteMigrationUrl)?fs.readFileSync(deleteMigrationUrl,'utf8'):'';
const authorityMigrationUrl=new URL('../supabase/migrations/20260917130000_taphoa_sheet_authoritative_identity.sql',import.meta.url);
const authorityMigration=fs.existsSync(authorityMigrationUrl)?fs.readFileSync(authorityMigrationUrl,'utf8'):'';
const lockMigrationUrl=new URL('../supabase/migrations/20260917131000_taphoa_sync_lock_and_sheet_source.sql',import.meta.url);
const lockMigration=fs.existsSync(lockMigrationUrl)?fs.readFileSync(lockMigrationUrl,'utf8'):'';
const worker=fs.readFileSync(new URL('../supabase/functions/taphoa-sheet-sync/index.ts',import.meta.url),'utf8');
const gateway=fs.readFileSync(new URL('../src/core/supabase.js',import.meta.url),'utf8');
const business=fs.readFileSync(new URL('../src/core/business.js',import.meta.url),'utf8');
const bridge=fs.readFileSync(new URL('../src/fixed-production-bridge.js',import.meta.url),'utf8');
const persistence=fs.readFileSync(new URL('../src/fixed-product-persistence.js',import.meta.url),'utf8');
const runtime=fs.readFileSync(new URL('../src/fixed-ui-runtime-2.js',import.meta.url),'utf8');
const index=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');

test('product web edits are persisted to Supabase and queued for Sheet acknowledgement',()=>{
  assert.match(migration,/taphoa_product_sheet_state/);
  assert.match(migration,/taphoa_product_outbox/);
  assert.match(migration,/taphoa_update_product_from_web/);
  assert.match(migration,/digest\(/i);
  assert.match(migration,/taphoa_revisions[\s\S]*domain\s*=\s*'products'/i);
});

test('sheet is canonical for source identity and final product identity',()=>{
  assert.match(authorityMigration,/management_sheet_id/i);
  assert.match(authorityMigration,/taphoa_product_create_requests/i);
  assert.match(authorityMigration,/taphoa_source_sync_requests/i);
  assert.match(authorityMigration,/pending_create/i);
  assert.match(authorityMigration,/pending_delete/i);
  assert.match(authorityMigration,/final_product_code/i);
  assert.doesNotMatch(authorityMigration,/taphoa_product_code_allocator/i);
  assert.doesNotMatch(authorityMigration,/v_sp_max/i);
});

test('sheet sync enumerates dynamic tabs by sheetId and isolates row tracking in hidden AY/AZ',()=>{
  assert.match(worker,/management_sheet_id/i);
  assert.match(worker,/sheetId/);
  assert.match(worker,/spreadsheets\/.*fields=/i);
  assert.match(worker,/addSheet/);
  assert.match(worker,/deleteSheet/);
  assert.match(worker,/__SYNC_ID/);
  assert.match(worker,/__SYNC_HASH/);
  assert.match(worker,/TRACKING_ID_INDEX\s*=\s*50/);
  assert.match(worker,/TRACKING_HASH_INDEX\s*=\s*51/);
  assert.match(worker,/AY/);
  assert.match(worker,/AZ/);
  assert.match(worker,/A:AZ/);
  assert.doesNotMatch(worker,/O1:P1/);
  assert.doesNotMatch(worker,/const SOURCES=\[/);
});

test('sheet-issued product codes never reuse a deleted highest code and sync is serialized',()=>{
  assert.match(worker,/readManagerTab\("__SYNC"\)/);
  assert.match(worker,/counterRows\[counterIndex\]\?\.\[15\]/);
  assert.match(worker,/reserveSheetCode/i);
  assert.match(worker,/taphoa_acquire_sheet_sync_lock/);
  assert.match(worker,/taphoa_release_sheet_sync_lock/);
  assert.match(lockMigration,/taphoa_acquire_sheet_sync_lock/);
  assert.match(lockMigration,/taphoa_release_sheet_sync_lock/);
});

test('web-created products stay pending until the Sheet returns a final code',()=>{
  assert.match(authorityMigration,/taphoa_update_product_from_web/);
  assert.match(authorityMigration,/taphoa_product_create_requests/);
  assert.match(authorityMigration,/TMP-/);
  assert.match(worker,/finalizeProductCreate/i);
  assert.match(worker,/allocateSheetCode/i);
});

test('product/source deletes are queued until Sheet deletion is acknowledged',()=>{
  assert.match(authorityMigration,/operation[^\n]*delete/i);
  assert.match(authorityMigration,/taphoa_delete_product_from_web/);
  assert.match(authorityMigration,/taphoa_delete_source_from_web/);
  assert.match(worker,/processProductDeletes/i);
  assert.match(worker,/processSourceDeletes/i);
});

test('web mutations can kick the sheet worker immediately while cron remains retry safety',()=>{
  assert.match(gateway,/functions\.invoke/);
  assert.match(business,/syncSheet/);
  assert.match(bridge,/syncSheetSoon/);
  assert.match(bridge,/createSource[\s\S]*syncSheetSoon/);
  assert.match(bridge,/updateProduct[\s\S]*syncSheetSoon/);
  assert.match(bridge,/deleteProduct[\s\S]*syncSheetSoon/);
});

test('sheet sync uses modifiedTime gate plus per-row SHA hashes',()=>{
  assert.match(worker,/modifiedTime/);
  assert.match(worker,/rowHash/);
  assert.match(worker,/SHA-256/);
  assert.match(worker,/taphoa_product_outbox/);
  assert.match(worker,/last_pushed_hash/);
});

test('fixed production UI saves a blurred product row through Supabase instead of local-only state',()=>{
  assert.match(business,/updateProduct/);
  assert.match(business,/taphoa_update_product_from_web/);
  assert.match(bridge,/updateProduct/);
  assert.match(persistence,/saveProductEditorRow/);
  assert.match(persistence,/focusout/);
  assert.match(persistence,/TAPHOA_PRODUCTION\.updateProduct/);
  assert.match(index,/fixed-product-persistence\.js/);
});

test('product/source delete controls remain wired in the editor',()=>{
  assert.match(business,/deleteProduct/);
  assert.match(business,/deleteSource/);
  assert.match(bridge,/deleteProduct/);
  assert.match(bridge,/deleteSource/);
  assert.match(runtime,/data-delete-source/);
  assert.match(runtime,/TAPHOA_PRODUCTION\.deleteSource/);
  assert.match(runtime,/TAPHOA_PRODUCTION\.deleteProduct/);
});
