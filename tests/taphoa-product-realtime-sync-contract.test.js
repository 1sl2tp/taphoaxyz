import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const worker=fs.readFileSync(new URL('../supabase/functions/taphoa-sheet-sync/index.ts',import.meta.url),'utf8');
const business=fs.readFileSync(new URL('../src/core/business.js',import.meta.url),'utf8');
const bridge=fs.readFileSync(new URL('../src/fixed-production-bridge.js',import.meta.url),'utf8');
const index=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const cron=fs.readFileSync(new URL('../supabase/migrations/20260915040000_taphoa_sheet_sync_cron.sql',import.meta.url),'utf8');
const lock=fs.readFileSync(new URL('../supabase/migrations/20260917131000_taphoa_sync_lock_and_sheet_source.sql',import.meta.url),'utf8');

test('management Sheet remains the one-way product authority',()=>{
  assert.match(worker,/management_sheet_id/i);
  assert.match(worker,/sheetId/);
  assert.match(worker,/driveModifiedTime/);
  assert.match(worker,/inboundScan/);
  assert.match(worker,/taphoa_apply_product_delta/);
  assert.match(worker,/reserveSheetCode/);
  assert.match(worker,/readManagerTab\("__SYNC"\)/);
  assert.match(worker,/TRACKING_ID_INDEX\s*=\s*50/);
  assert.match(worker,/TRACKING_HASH_INDEX\s*=\s*51/);
  assert.match(worker,/taphoa_acquire_sheet_sync_lock/);
  assert.match(worker,/taphoa_release_sheet_sync_lock/);
  assert.match(lock,/taphoa_acquire_sheet_sync_lock/);
});

test('Masan is excluded from Supabase product sync while # remains eligible',()=>{
  assert.match(worker,/MASAN_SHEET_ID\s*=\s*1608078911/);
  assert.match(worker,/meta\.sheetId\s*!==\s*MASAN_SHEET_ID/);
  assert.doesNotMatch(worker,/CORE_KEYS[^\n]*masan/);
  assert.doesNotMatch(worker,/SYSTEM_TABS[^\n]*#/);
});

test('sheet worker has no Supabase/Web outbound mutation queue',()=>{
  for(const retired of [
    'directMutation(',
    'processSourceCreates',
    'processSourceDeletes',
    'processProductCreates',
    'processProductDeletes',
    'processProductUpserts',
    'taphoa_product_outbox',
    'taphoa_product_create_requests',
    'taphoa_source_sync_requests',
    'create_source',
    'delete_source',
    'create_product',
    'update_product',
    'delete_product'
  ]) assert.ok(!worker.includes(retired),`outbound worker path remains: ${retired}`);
  assert.doesNotMatch(worker,/addSheet\s*:/);
  assert.doesNotMatch(worker,/deleteSheet\s*:/);
});

test('production web exposes product data as read-only',()=>{
  assert.ok(!index.includes('fixed-product-persistence.js'),'product editor persistence is still loaded');
  for(const retired of ['directSheetMutation','createSource:','deleteSource:','updateProduct:','deleteProduct:'])
    assert.ok(!business.includes(retired),`business still exposes product mutation: ${retired}`);
  for(const retired of ['async function createSource','async function deleteSource','async function updateProduct','async function deleteProduct'])
    assert.ok(!bridge.includes(retired),`bridge still exposes product mutation: ${retired}`);
  assert.doesNotMatch(bridge,/Object\.freeze\(\{[\s\S]*createSource[\s\S]*deleteProduct/);
  for(const required of ['saveOrder','deliverOrder','reverseOrder','deletePending','batchOrders','debtTransaction']){
    assert.ok(business.includes(required),`order/debt mutation accidentally removed: ${required}`);
    assert.ok(bridge.includes(required),`bridge order/debt mutation accidentally removed: ${required}`);
  }
});

test('automatic manager sync stays scheduled every minute',()=>{
  assert.match(cron,/taphoa_sheet_sync_every_minute/);
  assert.match(cron,/'\* \* \* \* \*'/);
  assert.match(cron,/taphoa-sheet-sync/);
});


test('NCC cost prices are bridged into Manager by product code before the manager gate',()=>{
  for(const id of [
    '15A3wy0YXlVajFWTTeLXCUh580QhwIlwaBIyn9RdR2XU',
    '1gzTLCx575q6pFtpIU5RU8D8SUmxCMft6_jrBOVRDIY8',
    '1dKwYp6LAR8Lb9YLy4xnf5CP2FA_VyENfZ9-1rEc3wa8',
    '1i1ge5hOPmWi7oxjE5F5hD96f9Zvvp_0HQzwgawZiFgs'
  ]) assert.ok(worker.includes(id),`missing NCC file ${id}`);
  assert.match(worker,/async function syncNccPricesToManager/);
  assert.match(worker,/readSpreadsheetValues\(source\.fileId,source\.sheetName,"A:C"\)/);
  assert.match(worker,/managerMeta\.title,"A:C"/);
  assert.match(worker,/!C\$\{i\+1\}/);
  assert.match(worker,/const ncc=await syncNccPricesToManager\(meta\);[\s\S]*const modifiedTime=await driveModifiedTime/);
  assert.match(worker,/ncc\.changedRows===0[\s\S]*metadataOnly/);
  assert.doesNotMatch(worker,/writes\.push\(\{range:[^\n]*!A\$\{i\+1\}/);
  assert.doesNotMatch(worker,/writes\.push\(\{range:[^\n]*!B\$\{i\+1\}/);
});
