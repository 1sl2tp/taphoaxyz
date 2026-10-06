import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const admin=fs.readFileSync(new URL('../admin-gia.html',import.meta.url),'utf8');
const migrationUrl=new URL('../supabase/migrations/20261006064500_taphoa_split_reference_calculated_profit.sql',import.meta.url);
const migration=fs.existsSync(migrationUrl)?fs.readFileSync(migrationUrl,'utf8'):'';

test('reference profit and calculated profit are separate selectable bases',()=>{
  assert.match(admin,/data-col="legacy_profit"[^>]*data-basis="reference"/);
  assert.match(admin,/data-col="calculated_profit"[^>]*price-choice[^>]*data-basis="calculated_profit"/);
  assert.match(admin,/const allowed=\['reference','calculated_profit','supplier_1','supplier_1_5','supplier_3','cost_1_5','cost_3'\]/);
});

test('reference basis adds the entered profit directly while calculated basis uses balanced profit',()=>{
  assert.match(admin,/function referenceSalePrice\(cost,oldProfit\)/);
  assert.match(admin,/return cost\+Math\.max\(num\(oldProfit\)\?\?0,0\)/);
  assert.match(admin,/if\(selected==='reference'\)return referenceSalePrice\(cost,oldProfit\)/);
  assert.match(admin,/if\(selected==='calculated_profit'\)return calculatedSalePrice\(cost,oldProfit\)/);
});

test('auto falls back to calculated profit and no-NPP rows highlight Lãi tính',()=>{
  assert.match(admin,/if\(supplier===null\)return 'calculated_profit'/);
  assert.match(admin,/return 'calculated_profit';\s*\n\s*}/);
  const autoBlock=admin.match(/function autoSaleBasis[\s\S]*?function selectedSalePrice/)?.[0]||'';
  assert.doesNotMatch(autoBlock,/thuoc-la/);
});

test('database persists separate reference and calculated-profit bases',()=>{
  assert.equal(fs.existsSync(migrationUrl),true,'split reference/calculated-profit migration must exist');
  assert.match(migration,/sale_price_basis in \('auto','reference','calculated_profit','supplier_1','supplier_1_5','supplier_3','cost_1_5','cost_3','cost'\)/);
  assert.match(migration,/when p_basis='reference' then p_cost\+greatest\(coalesce\(p_old_profit,0\),0\)/);
  assert.match(migration,/when p_basis in \('calculated_profit','cost'\) then p_cost\+public\.taphoa_balanced_profit\(p_cost,p_old_profit\)/);
  assert.match(migration,/if p_supplier is null then\s+return 'calculated_profit'/);
});

test('existing manual choices are preserved while automatic/default rows use calculated profit',()=>{
  assert.match(migration,/sale_price_mode='manual'[\s\S]*source_key='thuoc-la'[\s\S]*sale_price_basis='reference'/);
  assert.match(migration,/Manual NPP selections[\s\S]*sale_price_basis='supplier_1'/);
  assert.match(migration,/sale_price_mode='auto'[\s\S]*taphoa_auto_sale_basis/);
});
