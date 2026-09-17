import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=path=>fs.readFileSync(new URL(path,import.meta.url),'utf8');
const migrationUrl=new URL('../supabase/migrations/20260917040000_taphoa_product_image_url.sql',import.meta.url);

test('product image URL is a first-class nullable product field exposed by the frontend RPC',()=>{
  assert.ok(fs.existsSync(migrationUrl),'missing product image URL migration');
  const sql=fs.readFileSync(migrationUrl,'utf8');
  assert.match(sql,/alter\s+table\s+public\.taphoa_products[\s\S]*add\s+column\s+if\s+not\s+exists\s+image_url\s+text/i);
  assert.match(sql,/'image_url'\s*,\s*p\.image_url/i);
  assert.match(sql,/'imageUrl'\s*,\s*p\.image_url/i);
  assert.match(sql,/create\s+or\s+replace\s+function\s+public\.taphoa_set_product_image_url/i);
  assert.match(sql,/taphoa_role[\s\S]*admin/i);
  assert.match(sql,/taphoa_bump_revision\s*\(\s*'products'\s*\)/i);
});

test('production bridge keeps image URL as the sixth product column',()=>{
  const bridge=read('../src/fixed-production-bridge.js');
  assert.match(bridge,/\['Mã','Tên sản phẩm','Vốn','Giá bán','Nguồn','Ảnh URL'\]/);
  assert.match(bridge,/first\(p,\['imageUrl','image_url','image'\]/);
  assert.match(bridge,/setProductImageUrl/);
});

test('business service exposes the admin image URL mutation',()=>{
  const business=read('../src/core/business.js');
  assert.match(business,/setProductImageUrl\s*:\s*\(productCode,imageUrl\)\s*=>\s*gateway\.rpc\('taphoa_set_product_image_url'/);
});

test('settings expose Danh sách and Ảnh product view controls',()=>{
  const markup=read('../src/fixed-ui-markup-3.js');
  assert.match(markup,/id=\\"btnProductViewDefault\\"/);
  assert.match(markup,/id=\\"btnProductViewImage\\"/);
  assert.match(markup,/setProductViewMode\('default'\)/);
  assert.match(markup,/setProductViewMode\('image'\)/);
});

test('product editor exposes image URL and production persists it on change',()=>{
  const runtime=read('../src/fixed-ui-runtime-3.js');
  const overrides=read('../src/fixed-production-overrides.js');
  assert.match(runtime,/data-editor-field=\\"5\\"[\s\S]*aria-label=\\"Ảnh URL\\"/);
  assert.match(runtime,/\['Mã','Tên sản phẩm','Vốn','Giá bán','Nguồn','Ảnh URL'\]/);
  assert.match(overrides,/setProductImageUrl/);
  assert.match(overrides,/data-editor-field=["']5["']/);
});
