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
  assert.match(index,/fixed-ui-source-4\.css\?v=source-label-market-colors-20260920/);
  assert.match(index,/fixed-ui-runtime-4\.js\?v=source-label-market-colors-20260920/);
  assert.match(sw,/taphoa-runtime-v25/);
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


test('sales cards only surface a lower selected supermarket carton price',async()=>{
  const runtime=await read('src/fixed-ui-runtime-4.js');
  assert.match(runtime,/getSelectedMarketCartonPriceForSale/);
  assert.match(runtime,/marketCompareKind/);
  assert.match(runtime,/marketPackKind/);
  assert.match(runtime,/if \(kind !== 'carton'\) return 0/);
  assert.match(runtime,/marketSelectedPriceVnd/);
  assert.match(runtime,/marketCartonPriceVnd/);
  assert.match(runtime,/marketCartonPrice < giaBan/);
  assert.match(runtime,/text-primary tabular-nums/);
  assert.match(runtime,/font-normal text-gray-800 line-through/);
  assert.doesNotMatch(runtime,/text-gray-400 line-through/);
  assert.doesNotMatch(runtime,/marketRetailPriceVnd.*getSelectedMarketCartonPriceForSale/s);
});


test('mobile source filters use short labels without changing source values',async()=>{
  const [runtime,css]=await Promise.all([
    read('src/fixed-ui-runtime-4.js'),
    read('src/fixed-ui-source-4.css')
  ]);
  assert.match(runtime,/function getMobileSourceLabel/);
  assert.match(runtime,/'hang thuong': 'Thường'/);
  assert.match(runtime,/'thuoc la': 'Thuốc lá'/);
  assert.match(runtime,/'sua': 'Sữa'/);
  assert.match(runtime,/'hang u': 'Hàng U'/);
  assert.match(runtime,/source-tag-label-full/);
  assert.match(runtime,/source-tag-label-mobile/);
  assert.match(runtime,/filterSource\('\$\{src\}'\)/);
  assert.match(css,/mobile-source-filter-abbreviations/);
  assert.match(css,/source-tag-label-full\{display:none/);
  assert.match(css,/source-tag-label-mobile\{display:inline/);
});


test('sales search toggles between own products and supermarket quick results',async()=>{
  const [markup,runtime1,runtime4,business,bridge,css,migration,index]=await Promise.all([
    read('src/fixed-ui-markup-1.js'),
    read('src/fixed-ui-runtime-1.js'),
    read('src/fixed-ui-runtime-4.js'),
    read('src/core/business.js'),
    read('src/fixed-production-bridge.js'),
    read('src/fixed-ui-source-4.css'),
    read('supabase/migrations/20260921000500_taphoa_market_search.sql'),
    read('index.html')
  ]);
  assert.match(markup,/id=\\"salesSearchModeToggle\\"/);
  assert.match(markup,/toggleProductSearchMode\(\)/);
  assert.match(runtime1,/let productSearchMode = 'own'/);
  assert.match(runtime4,/function toggleProductSearchMode/);
  assert.match(runtime4,/ph-fill ph-storefront/);
  assert.match(runtime4,/Tìm sản phẩm siêu thị/);
  assert.match(runtime4,/sources\.classList\.toggle\('hidden', marketMode\)/);
  assert.match(runtime4,/window\.TAPHOA_PRODUCTION\?\.marketSearch/);
  assert.match(runtime4,/market-quick-card/);
  assert.match(runtime4,/current_price/);
  assert.doesNotMatch(runtime4,/market-quick-card[\s\S]{0,900}updateCart\(/);
  assert.match(business,/marketSearch:\(query,limit=80\)=>gateway\.rpc\('taphoa_market_search'/);
  assert.match(bridge,/async function marketSearch/);
  assert.match(bridge,/productMediaCandidates,marketSearch,setProductMedia/);
  assert.match(css,/sales-supermarket-search-toggle/);
  assert.match(migration,/taphoa_market_search/);
  assert.match(migration,/taphoa_role',''\) not in \('admin','customer'\)/);
  assert.match(migration,/l\.source in \('GO!','WinMart','Bách Hóa XANH'\)/);
  assert.match(index,/fixed-ui-markup-1\.js\?v=sales-market-search-20260920/);
  assert.match(index,/fixed-ui-runtime-1\.js\?v=sales-market-search-20260920/);
});


test('supermarket quick search loads default results when query is empty',async()=>{
  const [runtime,migration]=await Promise.all([
    read('src/fixed-ui-runtime-4.js'),
    read('supabase/migrations/20260921002000_taphoa_market_search_default_results.sql')
  ]);
  assert.doesNotMatch(runtime,/Nhập tên sản phẩm để tìm giá siêu thị/);
  assert.match(runtime,/Đang tải sản phẩm siêu thị/);
  assert.match(runtime,/marketSearch\?\.\(query, 80\)/);
  assert.match(migration,/v_query_norm=''/);
  assert.match(migration,/l\.updated_at/);
  assert.match(migration,/case when v_query_norm='' then l\.updated_at end desc/);
});


test('supermarket quick prices use source brand colors',async()=>{
  const [runtime,css]=await Promise.all([
    read('src/fixed-ui-runtime-4.js'),
    read('src/fixed-ui-source-4.css')
  ]);
  assert.match(runtime,/function getMarketQuickSourceClass/);
  assert.match(runtime,/market-source-winmart/);
  assert.match(runtime,/market-source-bhx/);
  assert.match(runtime,/market-source-go/);
  assert.match(runtime,/market-quick-price \$\{sourceClass\}/);
  assert.match(css,/\.market-quick-price\.market-source-winmart\{color:#d71920;\}/);
  assert.match(css,/\.market-quick-price\.market-source-bhx\{color:#087a40;\}/);
  assert.match(css,/\.market-quick-price\.market-source-go\{color:#e85d04;\}/);
});
