import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const admin=fs.readFileSync(new URL('../admin-gia.html',import.meta.url),'utf8');
const migrationUrl=new URL('../supabase/migrations/20261006063000_taphoa_auto_paired_price_basis.sql',import.meta.url);
const migration=fs.existsSync(migrationUrl)?fs.readFileSync(migrationUrl,'utf8'):'';

test('admin exposes automatic mode and both cost percentage candidates as selectable prices',()=>{
  assert.match(admin,/class="[^"]*auto-price-btn[^"]*"/);
  assert.match(admin,/data-col="cost15"[^>]*class="[^"]*price-choice[^"]*"[^>]*data-basis="cost_1_5"/);
  assert.match(admin,/data-col="cost3"[^>]*class="[^"]*price-choice[^"]*"[^>]*data-basis="cost_3"/);
});

test('automatic pricing checks NPP x1 first then paired 1.5 and 3 percent candidates then calculated profit',()=>{
  assert.match(admin,/function autoSaleBasis\(cost,supplier,sourceKey,oldProfit\)/);
  assert.match(admin,/if\(supplier!==null&&supplier>cost\)return 'supplier_1'/);
  assert.match(admin,/pickNearestAbove\(cost,\[\['supplier_1_5',supplier15\],\['cost_1_5',cost15\]\]\)/);
  assert.match(admin,/pickNearestAbove\(cost,\[\['supplier_3',supplier3\],\['cost_3',cost3\]\]\)/);
  assert.match(admin,/return 'calculated_profit';/);
});

test('manual price selection disables auto without adding source-specific rules',()=>{
  assert.match(admin,/item\.sale_price_mode='manual'/);
  assert.match(admin,/item\.sale_price_basis=choice\.dataset\.basis/);
  assert.match(admin,/item\.sale_price_mode='auto'/);
  assert.doesNotMatch(admin,/if\(item\.source_key==='thuoc-la'\).*sale_price_mode/s);
});

test('row payload persists auto versus manual mode per product',()=>{
  assert.match(admin,/sale_price_mode:item\?\.sale_price_mode\?\?'auto'/);
  assert.match(admin,/sale_price_basis:item\?\.sale_price_basis\?\?'calculated_profit'/);
});

test('database adds sale_price_mode and resolves automatic basis without a tobacco selection rule',()=>{
  assert.equal(fs.existsSync(migrationUrl),true,'auto price-basis migration must exist');
  assert.match(migration,/add column if not exists sale_price_mode text/);
  assert.match(migration,/alter column sale_price_mode set default 'auto'/);
  assert.match(migration,/alter column sale_price_mode set not null/);
  assert.match(migration,/create or replace function public\.taphoa_auto_sale_basis/i);
  const autoBlock=migration.match(/create or replace function public\.taphoa_auto_sale_basis[\s\S]*?\$function\$;/i)?.[0]||'';
  assert.doesNotMatch(autoBlock,/thuoc-la/i);
  assert.match(autoBlock,/p_supplier>p_cost[\s\S]*'supplier_1'/);
  assert.match(autoBlock,/'supplier_1_5'[\s\S]*'cost_1_5'/);
  assert.match(autoBlock,/'supplier_3'[\s\S]*'cost_3'/);
});

test('manual pricing supports reference NPP and cost percentage bases',()=>{
  assert.match(migration,/supplier_1','supplier_1_5','supplier_3','cost_1_5','cost_3/);
  assert.match(migration,/when p_basis='cost_1_5' then ceil\(p_cost\*1\.015\)/);
  assert.match(migration,/when p_basis='cost_3' then ceil\(p_cost\*1\.03\)/);
});

test('current tobacco selection is seeded as manual reference, not hard-coded in runtime auto logic',()=>{
  assert.match(migration,/set sale_price_mode='manual'[\s\S]*source_key='thuoc-la'/);
  assert.match(migration,/sale_price_mode='auto'/);
});
