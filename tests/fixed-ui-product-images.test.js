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
  assert.match(bridge,/productMediaCandidates,marketSearch,setProductMedia,setProductMediaCompare,setProductMediaOwnQc,clearProductMedia/);
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
  assert.match(mediaCss,/width:58px/);
  assert.match(mediaCss,/height:58px/);
  assert.match(mediaCss,/@media \(max-width:767px\)\{[\s\S]*?\.product-thumb,[\s\S]*?\.market-quick-thumb\{[\s\S]*?width:64px;[\s\S]*?height:64px;/);
  assert.match(mediaCss,/object-fit:contain/);
  assert.match(mediaCss,/padding:0/);
  assert.match(mediaCss,/border:1px solid #f1f3f5/);
  assert.match(runtime,/class="market-quick-thumb shrink-0 overflow-hidden flex items-center justify-center"/);
  assert.match(mediaCss,/\.market-quick-thumb\{[\s\S]*?width:58px;[\s\S]*?height:58px;[\s\S]*?border:1px solid #f1f3f5;[\s\S]*?border-radius:11px;[\s\S]*?padding:0;/);
  assert.match(mediaCss,/\.market-quick-thumb img\{[\s\S]*?object-fit:contain;/);
  assert.match(mediaCss,/@media \(max-width:767px\)\{[\s\S]*?\.product-thumb,[\s\S]*?\.market-quick-thumb\{[\s\S]*?width:64px;[\s\S]*?height:64px;/);
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
  assert.match(css,/grid-template-columns:36px 42px 72px 78px 58px 76px 26px/);
  assert.match(css,/#productImageOwnPriceSummary,[\s\S]*#productImageSelectedMarketSummary\{display:contents;\}/);
  assert.match(css,/font-variant-numeric:tabular-nums/);
});


test('product media comparison assets bypass stale PWA cache',async()=>{
  const [index,sw]=await Promise.all([read('index.html'),read('sw.js')]);
  assert.match(index,/fixed-ui-product-media\.css\?v=visible-thumb-20260921/);
  assert.match(index,/fixed-ui-product-media\.js\?v=compare-fit-20260920/);
  assert.match(sw,/taphoa-runtime-v30/);
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
  assert.match(media,/const carton=formatComparePrice\(compare\.carton\)/);
  assert.match(media,/const retail=formatComparePrice\(compare\.retail\)/);
  assert.match(media,/const priceText=carton\|\|'—'/);
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
  assert.match(media,/rawKind!=='carton'&&!allowsBreakdown/);
  assert.match(media,/marketPackageLabel\(row\)/);
  assert.match(migration,/market_source_price_vnd/);
  assert.match(migration,/taphoa_market_allows_unit_breakdown/);
  assert.match(migration,/split_part\(packaging_norm,' ',1\) in \('loc','vi'\)/);
  assert.match(migration,/market_selected_price_vnd := new\.market_source_price_vnd/);
});


test('selected market kind controls directional carton and retail conversion',async()=>{
  const media=await read('src/fixed-ui-product-media.js');
  assert.match(media,/const carton=kind==='carton'[\s\S]*price>0&&qc>0\?price\*qc:0/);
  assert.match(media,/const retail=kind==='carton'[\s\S]*price>0&&qc>0\?price\/qc:0[\s\S]*: price/);
  assert.match(media,/const priceText=carton\|\|'—'/);
  assert.match(media,/const retailText=retail\|\|'—'/);
  assert.match(media,/productMarketDetailRow\('HỌ',market\)/);
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
  assert.match(media,/productMarketDetailPackTable/);
  assert.match(media,/product-market-pack-list/);
  assert.match(media,/product-market-detail-source-link-chip/);
  assert.match(media,/title="Mở sản phẩm siêu thị"/);
  assert.match(media,/marketPackQty2/);
  assert.match(media,/marketPackQty3/);
  assert.match(css,/\.product-market-detail-table/);
  assert.match(css,/\.product-market-detail-hero/);
  assert.match(css,/\.product-market-pack-list/);
  assert.match(css,/\.product-market-pack-item/);
  assert.match(css,/\.product-market-detail-source-link-chip/);
  assert.match(css,/grid-template-columns:184px minmax\(0,1fr\)/);
  assert.match(css,/width:184px/);
  assert.match(css,/grid-template-columns:124px minmax\(0,1fr\)/);
  assert.match(media,/marketPackagingValue/);
  assert.match(media,/marketPackQty2/);
  assert.match(media,/marketPackQty3/);
});


test('packaging hierarchy table shows carton middle pack and leaf detail',async()=>{
  const media=await read('src/fixed-ui-product-media.js');
  assert.match(media,/function productMarketDetailPackRows/);
  assert.match(media,/function productMarketDetailPackTable/);
  assert.match(media,/const selectedUnit=rawKind==='carton'/);
  assert.match(media,/if\(rawKind!=='carton'&&compareQc>1\)/);
  assert.match(media,/add\('Thùng',\`\$\{compareQc\.toLocaleString/);
  assert.match(media,/const perMiddle=q2>0\?q3\/q2:0/);
  assert.match(media,/add\(label2,\`\$\{perMiddle\.toLocaleString/);
  assert.match(media,/if\(leafMeasure\)add\(label3,leafMeasure\)/);
  assert.match(media,/product-market-pack-list/);
  assert.match(media,/product-market-pack-item/);
});

test('GO product links append the internal source product id only for browser opening',async()=>{
  const migration=await read('supabase/migrations/20260920235500_taphoa_go_open_url.sql');
  assert.match(migration,/taphoa_market_open_url/);
  assert.match(migration,/getlink_source_product_identity/);
  assert.match(migration,/source_product_id/);
  assert.match(migration,/p_url\|\|'-i\.'/);
  assert.match(migration,/taphoa_normalize_product_media_source_url_trg/);
  assert.match(migration,/update public\.taphoa_product_media/);
});

test('package label detail reads box type and size from supermarket product name',async()=>{
  const media=await read('src/fixed-ui-product-media.js');
  assert.match(media,/function marketPackageLabel/);
  assert.match(media,/nameWords=normalizedWords\(marketProductNameValue\(item\)\)/);
  assert.match(media,/function marketPackageDescriptor/);
  assert.match(media,/\(thùng\|lốc\|vỉ\|hộp\|chai\|lon\|gói\|hũ\|túi\|bịch\|khay\|ly\)/);
  assert.match(media,/const descriptor=marketPackageDescriptor\(product\)/);
  assert.match(media,/marketPackageDescriptor\(row\)/);
});


test('professional product detail layout keeps identity source and packaging hierarchy balanced',async()=>{
  const [media,css]=await Promise.all([
    read('src/fixed-ui-product-media.js'),
    read('src/fixed-ui-product-media.css')
  ]);
  assert.match(media,/product-market-detail-copy/);
  assert.match(media,/product-market-detail-own-name/);
  assert.match(media,/product-market-detail-market-name/);
  assert.match(media,/product-market-detail-source-row/);
  assert.match(media,/product-market-detail-source-link-chip/);
  assert.match(media,/product-market-pack-list/);
  assert.match(media,/product-market-pack-item/);
  assert.match(media,/max-w-\[600px\]/);
  assert.match(css,/\.product-market-detail-copy/);
  assert.match(css,/\.product-market-detail-own-name/);
  assert.match(css,/\.product-market-detail-source-link-chip/);
  assert.match(css,/\.product-market-pack-list/);
  assert.match(css,/\.product-market-pack-item/);
  assert.match(css,/font-size:10\.5px/);
});


test('single-flow product hero removes redundant owner and market labels',async()=>{
  const media=await read('src/fixed-ui-product-media.js');
  assert.match(media,/product-market-detail-own-name/);
  assert.match(media,/product-market-detail-market-name/);
  assert.match(media,/product-market-detail-source-row/);
  assert.match(media,/product-market-detail-source-link-chip/);
  assert.doesNotMatch(media,/product-market-detail-label">Mình/);
  assert.doesNotMatch(media,/product-market-detail-label">Họ/);
  assert.doesNotMatch(media,/>Mở sản phẩm<\/span>/);
  assert.match(media,/title="Mở sản phẩm siêu thị"/);
});


test('product detail keeps long market name full width and packaging compact',async()=>{
  const [media,css]=await Promise.all([
    read('src/fixed-ui-product-media.js'),
    read('src/fixed-ui-product-media.css')
  ]);
  assert.match(media,/product-market-detail-market-name/);
  assert.match(media,/product-market-detail-source-row/);
  assert.match(media,/product-market-pack-list/);
  assert.match(media,/product-market-pack-item/);
  assert.match(css,/\.product-market-detail-market-name\{[\s\S]*width:100%/);
  assert.match(css,/\.product-market-detail-source-row/);
  assert.match(css,/grid-template-columns:184px minmax\(0,1fr\)/);
  assert.match(css,/\.product-market-pack-list\{[\s\S]*display:flex/);
});


test('packaging hierarchy renders parent to child without redundant quantity one',async()=>{
  const media=await read('src/fixed-ui-product-media.js');
  assert.match(media,/rows\.push\(\{level:cleanLevel,detail:cleanDetail\}\)/);
  assert.match(media,/product-market-pack-item/);
  assert.match(media,/\<strong\>\$\{esc\(row\.level\)\}\<\/strong\>\<span\>\$\{esc\(row\.detail\)\}/);
  assert.doesNotMatch(media,/rawQty==='1'/);
});



test('pack hierarchy distinguishes carton middle leaf and measure',async()=>{
  const media=await read('src/fixed-ui-product-media.js');
  assert.match(media,/rawKind==='carton'/);
  assert.match(media,/rawKind==='middle'/);
  assert.match(media,/label3\|\|genericUnit\|\|label2/);
  assert.match(media,/marketPackMeasure\(marketProductNameValue\(product\)\)/);
  assert.match(media,/add\('Thùng'/);
  assert.match(media,/add\(selectedUnit/);
  assert.match(media,/add\(leafUnit,leafMeasure\)/);
});


test('supermarket price type selector has enough width for Lẻ',async()=>{
  const css=await read('src/fixed-ui-product-media.css');
  assert.match(css,/grid-template-columns:36px 42px 72px 78px 58px 76px 26px/);
  assert.match(css,/\.product-image-compare-kind-edit select\{[\s\S]*width:100%/);
});


test('comparison row fits without clipping the rightmost retail column',async()=>{
  const css=await read('src/fixed-ui-product-media.css');
  assert.match(css,/grid-template-columns:36px 42px 72px 78px 58px 76px 26px/);
  assert.match(css,/gap:4px/);
  assert.match(css,/max-width:100%/);
});


test('VNM participates in supermarket image candidates and quick search',async()=>{
  const migration=await read('supabase/migrations/20260921011000_taphoa_vnm_market_source.sql');
  assert.match(migration,/VNM/);
  assert.match(migration,/taphoa_product_media_candidates/);
  assert.match(migration,/taphoa_market_search/);
  assert.match(migration,/l\.source in \('GO!','WinMart','Bách Hóa XANH','VNM'\)/);
});
