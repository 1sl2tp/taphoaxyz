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
  assert.match(admin,/sale_price_basis:item\?\.sale_price_basis\?\?'calculated_profit'/);
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

test('migration terminates each generated function definition before the next statement',()=>{
  assert.doesNotMatch(migration,/\$function\$\s+CREATE OR REPLACE FUNCTION/);
});

test('clicking the editable NPP x1 value selects supplier_1 as the sale basis',()=>{
  assert.match(admin,/const choice=e\.target\.closest\('\.price-choice'\)/);
  assert.doesNotMatch(admin,/choice&&!choice\.classList\.contains\('disabled'\)&&!e\.target\.matches\('\.cell-input,\.cell-select'\)/);
  assert.match(admin,/item\.sale_price_basis=choice\.dataset\.basis/);
  assert.match(admin,/queueSave\(row\)/);
});

test('reference profit is editable without silently switching the selected price basis',()=>{
  assert.match(admin,/data-col="legacy_profit"[^>]*class="[^"]*price-choice[^"]*"[^>]*data-basis="cost"[\s\S]*data-field="legacy_profit"/);
  assert.match(admin,/const editingReference=e\.target\.matches\('\[data-field="legacy_profit"\]'\)/);
  assert.match(admin,/if\(choice&&!choice\.classList\.contains\('disabled'\)&&!editingReference\)/);
  assert.match(admin,/\['cost','supplier_price','legacy_profit','units_per_carton'\]\.includes\(e\.target\.dataset\.field\)/);
});

test('row save sends editable reference profit to the backend',()=>{
  assert.match(admin,/const numeric=\['cost','supplier_price','legacy_profit','standard_profit_percent','units_per_carton'\]/);
  assert.match(admin,/legacy_profit_vnd=result\?\.legacy_profit_vnd\?\?payload\.legacy_profit/);
});

test('backend persists reference profit and recalculates only from the already selected basis',()=>{
  const migration2Url=new URL('../supabase/migrations/20261006061000_taphoa_editable_reference_profit.sql',import.meta.url);
  assert.equal(fs.existsSync(migration2Url),true,'editable reference-profit migration must exist');
  const migration2=fs.readFileSync(migration2Url,'utf8');
  assert.match(migration2,/v_legacy numeric/);
  assert.match(migration2,/p_product \? 'legacy_profit'/);
  assert.match(migration2,/taphoa_product_sale_price\(v_input,v_supplier,v_basis,v_source_key,v_legacy\)/);
  assert.match(migration2,/legacy_profit_vnd=v_legacy/);
  assert.match(migration2,/'legacy_profit_vnd',v_legacy/);
});

test('tobacco reference price uses its editable reference profit, defaulting to one',()=>{
  const migration2=fs.readFileSync(new URL('../supabase/migrations/20261006061000_taphoa_editable_reference_profit.sql',import.meta.url),'utf8');
  assert.match(migration2,/when p_source_key='thuoc-la' then p_cost\+greatest\(coalesce\(p_old_profit,1\),0\)/);
});
