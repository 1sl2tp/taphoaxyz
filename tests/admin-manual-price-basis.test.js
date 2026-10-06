import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const admin=fs.readFileSync(new URL('../admin-gia.html',import.meta.url),'utf8');
const migrationUrl=new URL('../supabase/migrations/20261006053000_taphoa_manual_sale_price_basis.sql',import.meta.url);
const migration=fs.existsSync(migrationUrl)?fs.readFileSync(migrationUrl,'utf8'):'';

test('admin price table exposes the legacy reference profit as a selectable basis',()=>{
  assert.match(admin,/data-col="legacy_profit"[^>]*>Lãi tham chiếu</);
  assert.match(admin,/data-col="legacy_profit"[^>]*class="[^"]*price-choice[^"]*"[^>]*data-basis="cost"/);
  assert.match(admin,/item\.legacy_profit_vnd/);
});

test('all three NPP tiers can be selected per product',()=>{
  assert.match(admin,/supplier-x1[^"]*price-choice[^"]*"[^>]*data-basis="supplier_1"/);
  assert.match(admin,/data-basis="supplier_1_5"/);
  assert.match(admin,/data-basis="supplier_3"/);
  assert.match(admin,/const choice=e\.target\.closest\('\.price-choice'\)/);
  assert.match(admin,/item\.sale_price_basis=choice\.dataset\.basis/);
});

test('row save persists the selected basis instead of recomputing it',()=>{
  assert.match(admin,/sale_price_basis:item\?\.sale_price_basis\?\?'cost'/);
  assert.doesNotMatch(admin,/sale_price_basis:autoSaleBasis\(/);
});

test('database pricing respects the stored explicit basis',()=>{
  assert.equal(fs.existsSync(migrationUrl),true,'manual sale-price-basis migration must exist');
  assert.match(migration,/when p_basis='supplier_1' and p_supplier is not null then p_supplier/);
  assert.match(migration,/when p_basis='supplier_1_5' and p_supplier is not null then ceil\(p_supplier\*1\.015\)/);
  assert.match(migration,/when p_basis='supplier_3' and p_supplier is not null then ceil\(p_supplier\*1\.03\)/);
  assert.match(migration,/'sale_price_basis',p\.sale_price_basis/);
  assert.match(migration,/v_basis := case[\s\S]*p_product \? 'sale_price_basis'[\s\S]*current_row\.sale_price_basis/);
  assert.match(migration,/v_basis text := 'cost'/);
});

test('tobacco keeps the reference basis as its default without a special selector rule',()=>{
  assert.match(migration,/set legacy_profit_vnd=1,[\s\S]*sale_price_basis='cost'[\s\S]*where source_key='thuoc-la'/);
  assert.doesNotMatch(admin,/NPP tier is selected automatically from the profit-protection rule/);
});
