import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const worker=fs.readFileSync(new URL('../supabase/functions/taphoa-sheet-sync/index.ts',import.meta.url),'utf8');
const business=fs.readFileSync(new URL('../src/core/business.js',import.meta.url),'utf8');
const bridge=fs.readFileSync(new URL('../src/fixed-production-bridge.js',import.meta.url),'utf8');
const index=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const cron=fs.readFileSync(new URL('../supabase/migrations/20261002144500_taphoa_drive_watch_sync.sql',import.meta.url),'utf8');
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

test('Drive watch wakes manager sync without periodic product polling',()=>{
  assert.match(cron,/taphoa_sheet_watch_channels/);
  assert.match(cron,/taphoa-sheet-watch-renew/);
  assert.match(cron,/'7 \*\/12 \* \* \*'/);
  assert.match(cron,/taphoa-sheet-sync\/register-watch/);
  assert.match(worker,/async function ensureDriveWatch/);
  assert.match(worker,/async function handleDriveWebhook/);
  assert.match(worker,/\/register-watch/);
  assert.match(worker,/\/webhook/);
  assert.match(worker,/driveModifiedTime/);
  assert.doesNotMatch(cron,/select cron\.schedule\([\s\S]*taphoa_sheet_sync_every_minute[\s\S]*'\* \* \* \* \*'/);
});

test('TAPHOA imports only the Manager file after Drive modifiedTime changes',()=>{
  for(const retiredNccId of [
    '15A3wy0YXlVajFWTTeLXCUh580QhwIlwaBIyn9RdR2XU',
    '1gzTLCx575q6pFtpIU5RU8D8SUmxCMft6_jrBOVRDIY8',
    '1dKwYp6LAR8Lb9YLy4xnf5CP2FA_VyENfZ9-1rEc3wa8',
    '1i1ge5hOPmWi7oxjE5F5hD96f9Zvvp_0HQzwgawZiFgs'
  ]) assert.ok(!worker.includes(retiredNccId),`retired NCC polling remains: ${retiredNccId}`);
  assert.doesNotMatch(worker,/syncNccPricesToManager/);
  assert.match(worker,/observedModifiedTime=await driveModifiedTime\(\);[\s\S]*const preflightState=await readSyncState\(\);/);
  assert.match(worker,/if\(!force&&syncState\?\.last_drive_modified_time[\s\S]*metadataOnly:true/);
  assert.match(worker,/metadataOnly:true[\s\S]*const meta=await spreadsheetMeta\(\)/);
  assert.match(worker,/readSpreadsheetValues\(MANAGEMENT_FILE_ID/);
});


test('TAPHOA sale price follows the value visibly formatted in Manager Sheet',()=>{
  assert.match(worker,/function viDisplayNumber/);
  assert.match(worker,/valueRenderOption","FORMATTED_VALUE"/);
  assert.match(worker,/values:batchGet/);
  assert.match(worker,/!D:D/);
  assert.match(worker,/cache\.rows\[i\]\[3\]=viDisplayNumber\(display\)/);
});
