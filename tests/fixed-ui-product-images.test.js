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
  assert.match(bridge,/productMediaCandidates,setProductMedia,clearProductMedia/);
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
  assert.match(media,/current_price/);
});
