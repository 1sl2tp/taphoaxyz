import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const worker=fs.readFileSync(new URL('../supabase/functions/taphoa-sheet-sync/index.ts',import.meta.url),'utf8');
const cron=fs.readFileSync(new URL('../supabase/migrations/20260915040000_taphoa_sheet_sync_cron.sql',import.meta.url),'utf8');

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

test('manager row mapping is A B C D E G K L P and prices are thousand VND to VND',()=>{
  for(const index of [0,1,2,3,4,6,10,11,15]) assert.match(worker,new RegExp(`row\\[${index}\\]`));
  assert.match(worker,/input_price_vnd[^\n]*Math\.round\([^\n]*\*\s*1000\)/);
  assert.match(worker,/applied_profit_vnd[^\n]*Math\.round\([^\n]*\*\s*1000\)/);
  assert.match(worker,/expected_profit_percent[^\n]*\*\s*100/);
});

test('sync is strictly one-way into TAPHOA tables',()=>{
  assert.match(worker,/taphoa_products/);
  assert.match(worker,/taphoa_sources/);
  assert.match(worker,/taphoa_sheet_sync_state/);
  assert.match(worker,/taphoa_revisions/);
  assert.doesNotMatch(worker,/getlink_supplier_products|getlink_supplier_pair_state|getlink_canonical/i);
  assert.doesNotMatch(worker,/values:batchUpdate|:append\?|writePairToNcc|writePairToManager/i);
});

test('worker skips unchanged Drive versions and atomic import deactivates missing product codes',()=>{
  assert.match(worker,/modifiedTime/);
  assert.match(worker,/last_drive_modified_time/);
  assert.match(worker,/changed\s*:\s*false/);
  assert.match(worker,/taphoa_apply_product_sync/);
  assert.match(cron,/update\s+public\.taphoa_products[\s\S]*set\s+is_active\s*=\s*false/i);
  assert.match(cron,/not\s+exists\s*\([\s\S]*jsonb_to_recordset\(p_products\)/i);
  assert.match(worker,/last_sync_status/);
  assert.match(cron,/where\s+domain\s*=\s*'products'/i);
});

test('cron is TAPHOA-owned and runs once per minute',()=>{
  assert.match(cron,/taphoa_sheet_sync_every_minute/);
  assert.match(cron,/\* \* \* \* \*/);
  assert.match(cron,/functions\/v1\/taphoa-sheet-sync/);
  assert.match(cron,/x-taphoa-cron/);
  assert.doesNotMatch(cron,/getlink-sheet-sync|getlink-api/);
});
