import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(path,'utf8');

test('sales product cards show retail price only when available',async()=>{
  const [runtime,bridge]=await Promise.all([
    read('src/fixed-ui-runtime-4.js'),
    read('src/fixed-production-bridge.js')
  ]);
  assert.match(bridge,/\['Mã','Tên sản phẩm','Vốn','Giá bán','Nguồn','Ảnh','Quy cách','Giá lẻ'\]/);
  assert.match(bridge,/\['giaLe','retail_price'\]/);
  assert.match(runtime,/let giaLe = Number\(r\[7\]\) \|\| 0/);
  assert.match(runtime,/giaLe > 0 \?/);
  assert.match(runtime,/>\$\{giaLe\.toLocaleString/);
  assert.doesNotMatch(runtime,/>Lẻ \$\{giaLe\.toLocaleString/);
});

test('retail price cache bust is wired into production shell',async()=>{
  const [index,sw]=await Promise.all([read('index.html'),read('sw.js')]);
  assert.match(index,/fixed-ui-runtime-4\.js\?v=retail-number-only-20260920/);
  assert.match(sw,/taphoa-runtime-v7/);
});

test('sheet sync imports Quy cách and Giá lẻ by header instead of fixed column',async()=>{
  const sync=await read('supabase/functions/taphoa-sheet-sync/index.ts');
  assert.match(sync,/managerRetailLayout/);
  assert.match(sync,/normalized\.indexOf\("quy cach"\)/);
  assert.match(sync,/normalized\.indexOf\("gia le"\)/);
  assert.match(sync,/retail_price_vnd:retail/);
  assert.match(sync,/units_per_carton:units/);
  assert.match(sync,/product\.units_per_carton,product\.retail_price_vnd/);
});
