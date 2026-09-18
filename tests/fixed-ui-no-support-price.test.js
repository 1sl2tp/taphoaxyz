import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(path,'utf8');

test('retired support price is absent from active product UI and bridge',async()=>{
  const [runtime,bridge]=await Promise.all([
    read('src/fixed-ui-runtime-4.js'),
    read('src/fixed-production-bridge.js')
  ]);
  assert.doesNotMatch(runtime,/Giá hỗ trợ|supportFrom|supportTo|supportHtml/);
  assert.doesNotMatch(bridge,/Giá hỗ trợ|giaHoTroTu|giaHoTroDen|support_price_low|support_price_high|supportPriceLow|supportPriceHigh/);
});

test('sheet sync no longer imports support price columns',async()=>{
  const sync=await read('supabase/functions/taphoa-sheet-sync/index.ts');
  assert.doesNotMatch(sync,/support_price_low_vnd|support_price_high_vnd|supportLow|supportHigh/);
  assert.match(sync,/raw_row:\[\.\.\.row\.slice\(0,4\)\]/);
});

test('latest frontend payload migration omits support price fields',async()=>{
  const sql=await read('supabase/migrations/20260919070000_remove_taphoa_product_support_prices.sql');
  assert.match(sql,/create or replace function public\.taphoa_products_frontend_json\(\)/);
  assert.doesNotMatch(sql,/giaHoTroTu|giaHoTroDen|raw_row->>14|raw_row->>15/);
});
