import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(path,'utf8');

test('product media is isolated from Sheet-authoritative pricing data',async()=>{
  const migration=await read('supabase/migrations/20260920183000_taphoa_product_media.sql');
  assert.match(migration,/create table if not exists public\.taphoa_product_media/);
  assert.match(migration,/product_code text primary key references public\.taphoa_products/);
  assert.match(migration,/taphoa_product_media_candidates/);
  assert.match(migration,/taphoa_set_product_media/);
  assert.match(migration,/taphoa_clear_product_media/);
  assert.match(migration,/taphoa_admin_required/);
  assert.match(migration,/'imageUrl',coalesce\(m\.image_url,''\)/);
  assert.match(migration,/left join public\.taphoa_product_media m/);
});

test('production bridge carries image URL into the existing row image slot',async()=>{
  const bridge=await read('src/fixed-production-bridge.js');
  const business=await read('src/core/business.js');
  assert.match(bridge,/\['Mã','Tên sản phẩm','Vốn','Giá bán','Nguồn','Ảnh','Quy cách','Giá lẻ'\]/);
  assert.match(bridge,/\['imageUrl','image_url','image'\]/);
  assert.match(bridge,/productMediaCandidates,setProductMedia,setProductMediaCompare,setProductMediaOwnQc,clearProductMedia/);
  assert.match(business,/taphoa_product_media_candidates/);
  assert.match(business,/taphoa_set_product_media/);
  assert.match(business,/taphoa_clear_product_media/);
});

test('product image mode remains optional and uses compact lazy thumbnails',async()=>{
  const [runtime,mediaCss,mediaJs,index]=await Promise.all([
    read('src/fixed-ui-runtime-4.js'),
    read('src/fixed-ui-product-media.css'),
    read('src/fixed-ui-product-media.js'),
    read('index.html')
  ]);
  assert.match(runtime,/productViewMode === 'image'/);
  assert.match(runtime,/class="product-thumb shrink-0" loading="lazy" decoding="async"/);
  assert.match(mediaCss,/width:48px/);
  assert.match(mediaCss,/height:48px/);
  assert.match(mediaCss,/object-fit:contain/);
  assert.match(mediaJs,/APP_PRODUCT_VIEW/);
  assert.match(mediaJs,/Ảnh sản phẩm/);
  assert.match(mediaJs,/Chọn ảnh từ siêu thị/);
  assert.match(index,/fixed-ui-product-media\.css/);
  assert.match(index,/fixed-ui-product-media\.js/);
});


test('image picker searches the full supermarket link catalog',async()=>{
  const [migration,accentFix,media]=await Promise.all([
    read('supabase/migrations/20260920192500_taphoa_product_media_full_catalog.sql'),
    read('supabase/migrations/20260920194500_taphoa_product_media_unaccent_fix.sql'),
    read('src/fixed-ui-product-media.js')
  ]);
  assert.match(migration,/from public\.getlink_links l/);
  assert.match(migration,/join public\.getlink_link_assets a on a\.link_url=l\.canonical_url/);
  assert.match(migration,/v_candidate_id like 'link:%'/);
  assert.match(accentFix,/extensions\.unaccent/);
  assert.match(accentFix,/regexp_split_to_table\(v_query_norm,'\\s\+'\)/);
  assert.match(accentFix,/l\.source in \('GO!','WinMart','Bách Hóa XANH'\)/);
  assert.match(accentFix,/'source',x\.source/);
  assert.match(media,/row\?\.source/);
  assert.match(media,/row\?\.packaging/);
  assert.match(media,/candidatePriceHtml/);
});

test('image picker shows carton and retail prices and sorts cheapest first',async()=>{
  const [migration,media]=await Promise.all([
    read('supabase/migrations/20260920200000_taphoa_product_media_price_details.sql'),
    read('src/fixed-ui-product-media.js')
  ]);
  assert.match(migration,/'carton_price',x\.carton_price/);
  assert.match(migration,/'retail_price',x\.retail_price/);
  assert.match(migration,/order by x\.rank_order,x\.sort_price nulls last/);
  assert.match(migration,/c\.pack_kind='carton'/);
  assert.match(media,/Thùng/);
  assert.match(media,/Lẻ/);
  assert.match(media,/candidatePriceHtml/);
});


test('image picker keeps own sell price, pack size and retail price visible while comparing',async()=>{
  const media=await read('src/fixed-ui-product-media.js');
  assert.match(media,/productImageOwnPriceSummary/);
  assert.match(media,/ownProductPriceSummary/);
  assert.match(media,/saleLabel=qc>1\?'Thùng':'Bán'/);
  assert.match(media,/retailVnd=saleVnd\/qc/);
  assert.match(media,/>MÌNH</);
  assert.match(media,/· QC/);
});


test('selected supermarket image persists market price and nested pack snapshot',async()=>{
  const [snapshot,orderFix,media]=await Promise.all([
    read('supabase/migrations/20260920202000_taphoa_product_media_market_snapshot.sql'),
    read('supabase/migrations/20260920203000_taphoa_product_media_candidate_order_fix.sql'),
    read('src/fixed-ui-product-media.js')
  ]);
  assert.match(snapshot,/market_carton_price_vnd/);
  assert.match(snapshot,/market_retail_price_vnd/);
  assert.match(snapshot,/market_units_per_carton/);
  assert.match(snapshot,/market_pack_qty2/);
  assert.match(snapshot,/market_pack_qty3/);
  assert.match(snapshot,/h\.qty2\*h\.qty3/);
  assert.match(snapshot,/'marketCartonPriceVnd'/);
  assert.match(snapshot,/'marketRetailPriceVnd'/);
  assert.match(orderFix,/limit v_limit/);
  assert.match(media,/productImageSelectedMarketSummary/);
  assert.match(media,/>HỌ</);
  assert.match(media,/selectedMarketStructure/);
  assert.match(media,/total\/q2/);
});


test('selected market item can be manually interpreted as carton or retail',async()=>{
  const [overrideMigration,optionalQcMigration,backfill,media,business,bridge]=await Promise.all([
    read('supabase/migrations/20260920210000_taphoa_product_media_compare_override.sql'),
    read('supabase/migrations/20260920211000_taphoa_product_media_compare_qc_optional.sql'),
    read('supabase/migrations/20260920212000_taphoa_product_media_backfill_snapshot.sql'),
    read('src/fixed-ui-product-media.js'),
    read('src/core/business.js'),
    read('src/fixed-production-bridge.js')
  ]);
  assert.match(overrideMigration,/market_selected_price_vnd/);
  assert.match(overrideMigration,/market_compare_kind/);
  assert.match(overrideMigration,/market_compare_units_per_carton/);
  assert.match(overrideMigration,/taphoa_set_product_media_compare/);
  assert.match(optionalQcMigration,/v_kind='carton' and v_selected is not null and coalesce\(v_qc,0\)>0/);
  assert.match(backfill,/canonical_product_id like 'link:%'/);
  assert.match(media,/data-market-kind-select/);
  assert.match(media,/data-market-qc-input/);
  assert.match(media,/marketCompareState/);
  assert.match(media,/marketSelectedPriceVnd/);
  assert.match(media,/productImageSelectedThumb/);
  assert.match(media,/>HỌ</);
  assert.match(business,/taphoa_set_product_media_compare/);
  assert.match(bridge,/setProductMediaCompare/);
});


test('saved market comparison rows align and preserve source link',async()=>{
  const [media,css]=await Promise.all([
    read('src/fixed-ui-product-media.js'),
    read('src/fixed-ui-product-media.css')
  ]);
  assert.match(media,/productImageCompareTable/);
  assert.match(media,/product-image-compare-source-own/);
  assert.match(media,/product-image-compare-label">MÌNH/);
  assert.match(media,/product-image-compare-label">HỌ/);
  assert.match(media,/Mở sản phẩm siêu thị gốc/);
  assert.match(media,/target="_blank"/);
  assert.match(media,/imageSourceUrl/);
  assert.match(css,/grid-template-columns:36px 44px 64px 84px 64px 80px 28px/);
  assert.match(css,/#productImageOwnPriceSummary,[\s\S]*#productImageSelectedMarketSummary\{display:contents;\}/);
  assert.match(css,/font-variant-numeric:tabular-nums/);
});


test('product media comparison assets bypass stale PWA cache',async()=>{
  const [index,sw]=await Promise.all([read('index.html'),read('sw.js')]);
  assert.match(index,/fixed-ui-product-media\.css\?v=market-detail-20260920/);
  assert.match(index,/fixed-ui-product-media\.js\?v=market-detail-20260920/);
  assert.match(sw,/taphoa-runtime-v10/);
});


test('saved supermarket name drives related search for abbreviated internal names',async()=>{
  const [media,css]=await Promise.all([
    read('src/fixed-ui-product-media.js'),
    read('src/fixed-ui-product-media.css')
  ]);
  assert.match(media,/relatedMarketQuery/);
  assert.match(media,/marketProductName/);
  assert.match(media,/data-market-related-search/);
  assert.match(media,/searchRelatedMarket/);
  assert.match(media,/productImage\(p\).*marketProductName/);
  assert.match(media,/loadCandidates\(relatedQuery\)/);
  assert.match(media,/Mở sản phẩm siêu thị gốc/);
  assert.match(css,/button\.product-image-compare-source/);
});


test('image picker exposes enough matching supermarket results to complete mapping',async()=>{
  const [migration,media,business]=await Promise.all([
    read('supabase/migrations/20260920221500_taphoa_product_media_search_coverage.sql'),
    read('src/fixed-ui-product-media.js'),
    read('src/core/business.js')
  ]);
  assert.match(migration,/p_limit integer default 150/);
  assert.match(migration,/coalesce\(p_limit,150\),200/);
  assert.match(media,/productMediaCandidates\?\.\(String\(query\|\|''\),150\)/);
  assert.match(media,/150\+/);
  assert.match(media,/kết quả/);
  assert.match(business,/Math\.min\(200/);
});


test('retail supermarket price stays in retail cell and both QC values are editable',async()=>{
  const [migration,media,business,bridge]=await Promise.all([
    read('supabase/migrations/20260920224000_taphoa_product_media_retail_qc_overrides.sql'),
    read('src/fixed-ui-product-media.js'),
    read('src/core/business.js'),
    read('src/fixed-production-bridge.js')
  ]);
  assert.match(migration,/market_selected_price_vnd=market_retail_price_vnd/);
  assert.match(migration,/market_compare_units_per_carton=v_qc/);
  assert.match(migration,/own_compare_units_per_carton/);
  assert.match(migration,/taphoa_set_product_media_own_qc/);
  assert.match(media,/data-own-qc-input/);
  assert.match(media,/data-market-qc-input/);
  assert.match(media,/const mainPrice=compare\.kind==='carton'/);
  assert.match(media,/const priceText=mainPrice>0\?formatComparePrice\(mainPrice\):'—'/);
  assert.match(media,/product\?\.ownCompareUnitsPerCarton/);
  assert.match(media,/setProductMediaOwnQc/);
  assert.match(business,/taphoa_set_product_media_own_qc/);
  assert.match(bridge,/setProductMediaOwnQc/);
});


test('unit breakdown is limited to lốc vỉ milk while ordinary boxes keep source package price',async()=>{
  const [media,migration]=await Promise.all([
    read('src/fixed-ui-product-media.js'),
    read('supabase/migrations/20260920233000_taphoa_product_media_source_pack_price.sql')
  ]);
  assert.match(media,/function marketAllowsUnitBreakdown/);
  assert.match(media,/packageHead==='loc'\|\|packageHead==='vi'/);
  assert.match(media,/marketSourcePriceVnd/);
  assert.match(media,/!allowsBreakdown&&sourcePrice>0\?sourcePrice/);
  assert.match(media,/rawKind!=='carton'&&!allowsBreakdown/);
  assert.match(media,/marketPackageLabel\(row\)/);
  assert.match(migration,/market_source_price_vnd/);
  assert.match(migration,/taphoa_market_allows_unit_breakdown/);
  assert.match(migration,/split_part\(packaging_norm,' ',1\) in \('loc','vi'\)/);
  assert.match(migration,/market_selected_price_vnd := new\.market_source_price_vnd/);
});


test('comparison price display rounds to nearest 500 VND without mutating source data',async()=>{
  const media=await read('src/fixed-ui-product-media.js');
  assert.match(media,/function roundComparePrice/);
  assert.match(media,/Math\.round\(amount\/500\)\*500/);
  assert.match(media,/formatComparePrice/);
  assert.match(media,/formatCandidatePrice/);
});


test('sales product image opens the saved market comparison detail',async()=>{
  const [runtime,media,css]=await Promise.all([
    read('src/fixed-ui-runtime-4.js'),
    read('src/fixed-ui-product-media.js'),
    read('src/fixed-ui-product-media.css')
  ]);
  assert.match(runtime,/openProductMarketDetail\(this\.dataset\.productCode\)/);
  assert.match(runtime,/product-thumb-button/);
  assert.match(media,/productMarketDetailWrapper/);
  assert.match(media,/window\.openProductMarketDetail/);
  assert.match(media,/marketProductName/);
  assert.match(media,/productMarketDetailRow\('MÌNH'/);
  assert.match(media,/productMarketDetailRow\('HỌ'/);
  assert.match(media,/Quy cách/);
  assert.match(media,/marketPackQty2/);
  assert.match(media,/marketPackQty3/);
  assert.match(css,/\.product-market-detail-table/);
  assert.match(css,/\.product-market-detail-hero/);
  assert.match(css,/grid-template-columns:160px minmax\(0,1fr\)/);
  assert.match(css,/width:160px/);
  assert.match(css,/grid-template-columns:120px minmax\(0,1fr\)/);
  assert.match(media,/marketPackagingValue/);
  assert.match(media,/marketPackQty2/);
  assert.match(media,/marketPackQty3/);
});
