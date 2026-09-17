import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const worker=fs.readFileSync(new URL('../supabase/functions/taphoa-sheet-sync/index.ts',import.meta.url),'utf8');
const cron=fs.readFileSync(new URL('../supabase/migrations/20260915040000_taphoa_sheet_sync_cron.sql',import.meta.url),'utf8');
const realtime=fs.readFileSync(new URL('../supabase/migrations/20260917020000_taphoa_product_realtime_sheet_sync.sql',import.meta.url),'utf8');

test('worker owns the exact management file and five source tabs',()=>{
  assert.match(worker,/1hGqAzIEqTMmULIeh5sCmed2R3XaiA9QZavtGRdNvyyU/);
  for(const [key,tab,prefix] of [
    ['hang-u','Hàng U','HU-'],['thuoc-la','Thuốc lá','TL-'],['sua','Sữa','SUA-'],
    ['masan','Hàng masan','MAS-'],['hang-thuong','Hàng thường','HT-']
  ]){
    assert.match(worker,new RegExp(key));
    assert.match(worker,new RegExp(tab));
    assert.match(worker,new RegExp(prefix));
  }
});

test('manager row mapping is uniformly A code, B name, C cost, D sale price',()=>{
  for(const index of [0,1,2,3]) assert.match(worker,new RegExp(`row\\[${index}\\]`));
  for(const oldIndex of [4,6,10,11,15]) assert.doesNotMatch(worker,new RegExp(`row\\[${oldIndex}\\]`));
  assert.doesNotMatch(worker,/sourceKey\s*===\s*["']sua["']/);
  assert.match(worker,/const\s+code\s*=\s*clean\(row\[0\]\)\.toUpperCase\(\)/);
  assert.match(worker,/const\s+name\s*=\s*clean\(row\[1\]\)/);
  assert.match(worker,/const\s+inputSheet\s*=\s*num\(row\[2\]\)/);
  assert.match(worker,/const\s+saleSheet\s*=\s*num\(row\[3\]\)/);
  assert.match(worker,/input_price_vnd[^\n]*Math\.round\([^\n]*\*\s*1000\)/);
  assert.match(worker,/sale_price_vnd[^\n]*Math\.round\([^\n]*\*\s*1000\)/);
});

test('sync remains TAPHOA-only and never touches GETLINK or NCC pairing',()=>{
  assert.match(worker,/taphoa_products/);
  assert.match(worker,/taphoa_sources/);
  assert.match(worker,/taphoa_sheet_sync_state/);
  assert.match(worker,/taphoa_revisions/);
  assert.doesNotMatch(worker,/getlink_supplier_products|getlink_supplier_pair_state|getlink_canonical/i);
  assert.doesNotMatch(worker,/writePairToNcc|writePairToManager/i);
});

test('worker skips unchanged Drive versions and delta import deactivates missing product codes',()=>{
  assert.match(worker,/modifiedTime/);
  assert.match(worker,/last_drive_modified_time/);
  assert.match(worker,/changed\s*:\s*false/);
  assert.match(worker,/taphoa_apply_product_delta/);
  assert.match(realtime,/update\s+public\.taphoa_products[\s\S]*set\s+is_active\s*=\s*false/i);
  assert.match(realtime,/jsonb_array_elements_text\(s\.codes\)/i);
  assert.match(worker,/last_sync_status/);
  assert.match(realtime,/domain\s*=\s*'products'/i);
});

test('cron is TAPHOA-owned and runs once per minute',()=>{
  assert.match(cron,/taphoa_sheet_sync_every_minute/);
  assert.match(cron,/\* \* \* \* \*/);
  assert.match(cron,/functions\/v1\/taphoa-sheet-sync/);
  assert.match(cron,/x-taphoa-cron/);
  assert.doesNotMatch(cron,/getlink-sheet-sync|getlink-api/);
});
