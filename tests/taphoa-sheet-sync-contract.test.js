import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const worker=fs.readFileSync(new URL('../supabase/functions/taphoa-sheet-sync/index.ts',import.meta.url),'utf8');
const cron=fs.readFileSync(new URL('../supabase/migrations/20260915040000_taphoa_sheet_sync_cron.sql',import.meta.url),'utf8');
const realtime=fs.readFileSync(new URL('../supabase/migrations/20260917020000_taphoa_product_realtime_sheet_sync.sql',import.meta.url),'utf8');
const authority=fs.readFileSync(new URL('../supabase/migrations/20260917130000_taphoa_sheet_authoritative_identity.sql',import.meta.url),'utf8');

test('worker owns the exact management file and discovers product sources dynamically by sheetId',()=>{
  assert.match(worker,/1hGqAzIEqTMmULIeh5sCmed2R3XaiA9QZavtGRdNvyyU/);
  assert.match(worker,/spreadsheetMeta/);
  assert.match(worker,/sheetId/);
  assert.match(worker,/management_sheet_id/);
  assert.match(authority,/305224020/);
  assert.match(authority,/583030487/);
  assert.match(authority,/1822935945/);
  assert.match(authority,/1608078911/);
  assert.match(authority,/1330446015/);
  assert.doesNotMatch(worker,/const SOURCES=\[/);
});

test('manager business mapping stays A:D and sync metadata is isolated in hidden AY:AZ',()=>{
  assert.match(worker,/row\?\.\[0\]/);
  assert.match(worker,/row\?\.\[1\]/);
  assert.match(worker,/row\?\.\[2\]/);
  assert.match(worker,/row\?\.\[3\]/);
  assert.match(worker,/TRACKING_ID_HEADER/);
  assert.match(worker,/TRACKING_HASH_HEADER/);
  assert.match(worker,/TRACKING_ID_COL\s*=\s*"AY"/);
  assert.match(worker,/TRACKING_HASH_COL\s*=\s*"AZ"/);
  assert.match(worker,/TRACKING_ID_INDEX\s*=\s*50/);
  assert.match(worker,/TRACKING_HASH_INDEX\s*=\s*51/);
  assert.match(worker,/A:AZ/);
  assert.match(worker,/TRACKING_ID_COL\}1:\$\{TRACKING_HASH_COL\}1/);
  assert.match(worker,/startIndex:50,endIndex:52/);
  assert.doesNotMatch(worker,/O1:P1/);
  assert.doesNotMatch(worker,/\?\.\[14\]/);
  assert.doesNotMatch(worker,/\?\.\[15\]/);
  assert.doesNotMatch(worker,/sourceKey\s*===\s*["']sua["']/);
  assert.match(worker,/const code=clean\(row\?\.\[0\]\)\.toUpperCase\(\)/);
  assert.match(worker,/const name=clean\(row\?\.\[1\]\)/);
  assert.match(worker,/const inputSheet=num\(row\?\.\[2\]\)/);
  assert.match(worker,/const saleSheet=num\(row\?\.\[3\]\)/);
  assert.match(worker,/Math\.round\(inputSheet\*1000\)/);
  assert.match(worker,/Math\.round\(saleSheet\*1000\)/);
});

test('sync remains TAPHOA-only and never touches GETLINK or NCC pairing',()=>{
  assert.match(worker,/taphoa_products/);
  assert.match(worker,/taphoa_sources/);
  assert.match(worker,/taphoa_sheet_sync_state/);
  assert.match(authority,/taphoa_revisions/);
  assert.doesNotMatch(worker,/getlink_supplier_products|getlink_supplier_pair_state|getlink_canonical/i);
  assert.doesNotMatch(worker,/writePairToNcc|writePairToManager/i);
});

test('worker skips unchanged Drive versions and Sheet delta can tombstone missing product codes',()=>{
  assert.match(worker,/modifiedTime/);
  assert.match(worker,/last_drive_modified_time/);
  assert.match(worker,/changed:false/);
  assert.match(worker,/taphoa_apply_product_delta/);
  assert.match(authority,/update\s+public\.taphoa_products[\s\S]*is_active=false/i);
  assert.match(authority,/jsonb_array_elements_text\(s\.codes\)/i);
  assert.match(worker,/last_sync_status/);
  assert.match(authority,/domain='products'/i);
  assert.match(realtime,/taphoa_product_sheet_state/);
});

test('cron is TAPHOA-owned and runs once per minute',()=>{
  assert.match(cron,/taphoa_sheet_sync_every_minute/);
  assert.match(cron,/\* \* \* \* \*/);
  assert.match(cron,/functions\/v1\/taphoa-sheet-sync/);
  assert.match(cron,/x-taphoa-cron/);
  assert.doesNotMatch(cron,/getlink-sheet-sync|getlink-api/);
});
