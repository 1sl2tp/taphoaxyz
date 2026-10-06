import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const admin=fs.readFileSync(new URL('../admin-gia.html',import.meta.url),'utf8');
const migration=fs.readFileSync(new URL('../supabase/migrations/20261006052000_taphoa_tobacco_one_carton_unit.sql',import.meta.url),'utf8');

test('Thuốc lá defaults to one cây in admin price editor',()=>{
  assert.match(admin,/source==='thuoc-la'[\s\S]*newUnits'\)\.value='1'/);
  assert.match(admin,/source==='thuoc-la'[\s\S]*select\.value='cây'/);
  assert.doesNotMatch(admin,/source==='thuoc-la'[\s\S]{0,500}newUnits'\)\.value='50'/);
});

test('database keeps Thuốc lá at one cây',()=>{
  assert.match(migration,/set units_per_carton=1,/);
  assert.match(migration,/retail_unit='cây'/);
  assert.match(migration,/taphoa_admin_create_product/);
  assert.match(migration,/taphoa_update_product_from_web/);
  assert.match(migration,/v_units:=1;/);
  assert.doesNotMatch(migration,/v_units:=50;/);
});
