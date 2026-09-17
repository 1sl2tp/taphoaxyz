import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(path,'utf8');

test('sheet sync preserves O/P support prices and hashes them',async()=>{
  const sync=await read('supabase/functions/taphoa-sheet-sync/index.ts');
  assert.match(sync,/support_price_low_vnd/);
  assert.match(sync,/support_price_high_vnd/);
  assert.match(sync,/raw_row:\[\.\.\.row\.slice\(0,16\)\]/);
});

test('frontend product payload exposes support price range',async()=>{
  const sql=await read('supabase/migrations/20260918010000_taphoa_product_support_prices.sql');
  assert.match(sql,/'giaHoTroTu'/);
  assert.match(sql,/'giaHoTroDen'/);
  assert.match(sql,/raw_row->>14/);
  assert.match(sql,/raw_row->>15/);
});

test('production bridge keeps support range beside the current sale price',async()=>{
  const bridge=await read('src/fixed-production-bridge.js');
  assert.match(bridge,/Giá hỗ trợ từ/);
  assert.match(bridge,/Giá hỗ trợ đến/);
  assert.match(bridge,/giaHoTroTu/);
  assert.match(bridge,/giaHoTroDen/);
});

test('product card shows a small dark support range without changing cart price',async()=>{
  const runtime=await read('src/fixed-ui-runtime-4.js');
  assert.match(runtime,/Giá hỗ trợ: khoảng/);
  assert.match(runtime,/text-\[11px\]/);
  assert.match(runtime,/text-gray-900/);
  assert.match(runtime,/updateCart\('\$\{maSp\}', '\$\{tenSp\}', \$\{giaBan\}, 1\)/);
});
