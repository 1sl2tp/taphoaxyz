import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration=fs.readFileSync(new URL('../supabase/migrations/20260917020000_taphoa_product_realtime_sheet_sync.sql',import.meta.url),'utf8');
const deleteMigrationUrl=new URL('../supabase/migrations/20260917050000_taphoa_product_source_delete_from_web.sql',import.meta.url);
const deleteMigration=fs.existsSync(deleteMigrationUrl)?fs.readFileSync(deleteMigrationUrl,'utf8'):'';
const worker=fs.readFileSync(new URL('../supabase/functions/taphoa-sheet-sync/index.ts',import.meta.url),'utf8');
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

test('sheet sync uses modifiedTime gate plus per-row SHA hashes and writes pending web edits to A:D',()=>{
  assert.match(worker,/modifiedTime/);
  assert.match(worker,/rowHash/);
  assert.match(worker,/SHA-256/);
  assert.match(worker,/taphoa_product_outbox/);
  assert.match(worker,/last_pushed_hash/);
  assert.match(worker,/spreadsheets/);
  assert.match(worker,/valueInputOption=RAW/);
  assert.match(worker,/A:D/);
});

test('unchanged sheet sync leaves monitor state at success instead of running',()=>{
  assert.match(worker,/if\(!force&&syncState\?\.last_drive_modified_time[\s\S]*setSyncState\(\{last_sync_status:\"success\"[\s\S]*changed:false/);
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

test('deleting a product row persists to Supabase as inactive',()=>{
  assert.match(deleteMigration,/taphoa_delete_product_from_web/);
  assert.match(deleteMigration,/is_active\s*=\s*false/i);
  assert.match(business,/deleteProduct[\s\S]*taphoa_delete_product_from_web/);
  assert.match(bridge,/deleteProduct/);
  assert.match(runtime,/TAPHOA_PRODUCTION\.deleteProduct/);
});

test('custom sources can be deactivated but core sources and non-empty sources are protected',()=>{
  assert.match(deleteMigration,/taphoa_delete_source_from_web/);
  assert.match(deleteMigration,/hang-u[\s\S]*thuoc-la[\s\S]*sua[\s\S]*masan[\s\S]*hang-thuong/i);
  assert.match(deleteMigration,/source_has_active_products/);
  assert.match(deleteMigration,/active\s*=\s*false/i);
  assert.match(business,/deleteSource[\s\S]*taphoa_delete_source_from_web/);
  assert.match(bridge,/deleteSource/);
  assert.match(runtime,/data-delete-source/);
  assert.match(runtime,/TAPHOA_PRODUCTION\.deleteSource/);
});
