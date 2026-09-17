import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(path,'utf8');

test('edge function accepts direct source and product mutation actions',async()=>{
  const worker=await read('supabase/functions/taphoa-sheet-sync/index.ts');
  for(const action of ['create_source','delete_source','create_product','update_product','delete_product']){
    assert.match(worker,new RegExp(`action===['\"]${action}['\"]`));
  }
  assert.match(worker,/directMutation/);
  assert.match(worker,/taphoa_acquire_sheet_sync_lock/);
});

test('product create reserves the Sheet-owned code before appending A:D as one row snapshot',async()=>{
  const worker=await read('supabase/functions/taphoa-sheet-sync/index.ts');
  assert.match(worker,/reserveSheetCode\(cache,caches\)/);
  assert.match(worker,/rowWithTracking\(\[code,req\.product_name,sheetUnit\(num\(req\.input_price_vnd\)\),sheetUnit\(num\(req\.sale_price_vnd\)\)\]/);
  assert.match(worker,/appendManagerRow\(cache\.meta\.title,values\)/);
});

test('browser product and source mutations use one edge-function request instead of rpc plus sync',async()=>{
  const business=await read('src/core/business.js');
  const bridge=await read('src/fixed-production-bridge.js');
  assert.match(business,/directSheetMutation/);
  assert.match(business,/createSource:name=>directSheetMutation\('create_source'/);
  assert.match(business,/deleteSource:source=>directSheetMutation\('delete_source'/);
  assert.match(business,/updateProduct:payload=>directSheetMutation/);
  assert.match(business,/deleteProduct:code=>directSheetMutation\('delete_product'/);
  assert.doesNotMatch(bridge,/await syncSheetSoon\(\);/);
});

test('product editor saves one settled row snapshot after source selection',async()=>{
  const persistence=await read('src/fixed-product-persistence.js');
  assert.match(persistence,/scheduleProductEditorRowSave/);
  assert.match(persistence,/setTimeout/);
  assert.match(persistence,/#productEditorSourcePickerList \[data-picker-source\]/);
  assert.match(persistence,/scheduleProductEditorRowSave\(index/);
  assert.match(persistence,/payload\.source/);
  assert.match(persistence,/payload\.cost/);
  assert.match(persistence,/payload\.price/);
});

test('edge function never calls catch directly on Supabase PostgREST builders',async()=>{
  const worker=await read('supabase/functions/taphoa-sheet-sync/index.ts');
  assert.doesNotMatch(worker,/\.eq\([^\n;]*\)\.catch\(/);
  assert.doesNotMatch(worker,/admin\.rpc\([^\n;]*\)\.catch\(/);
});
