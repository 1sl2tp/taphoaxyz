import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const admin=readFileSync(new URL('../admin-gia.html',import.meta.url),'utf8');
const quote=readFileSync(new URL('../bao-gia/index.html',import.meta.url),'utf8');
const migration=readFileSync(new URL('../supabase/migrations/20261108033500_taphoa_hide_sale_without_positive_cost.sql',import.meta.url),'utf8');

// SPEC-PRICE-NO-COST-20261108: Given missing, zero or invalid cost,
// THEN price is absent for every selection mode. Valid cost retains the
// existing NPP/manual/reference calculations. No orders or costs are written.
const start=admin.indexOf('    function balancedProfit(');
const end=admin.indexOf('    function updateChoiceState(',start);
assert.ok(start>0&&end>start);
const sandbox={Math,Number,num(value){
  if(value===null||value===undefined||value==='')return null;
  const n=Number(value);return Number.isFinite(n)?n:null;
}};
vm.runInNewContext(admin.slice(start,end)+'\nthis.pricing={referenceSalePrice,calculatedSalePrice,autoSaleBasis,selectedSalePrice};',sandbox);
const pricing=sandbox.pricing;

test('zero or missing cost never creates sale from any source or manual basis',()=>{
  for(const cost of [null,0,-1]){
    assert.equal(pricing.referenceSalePrice(cost,10),null);
    assert.equal(pricing.calculatedSalePrice(cost,10),null);
    assert.equal(pricing.autoSaleBasis(cost,120,'thuoc-la',10),'calculated_profit');
    for(const basis of ['reference','calculated_profit','supplier_1','supplier_1_5','supplier_3','cost_1_5','cost_3']){
      assert.equal(pricing.selectedSalePrice(cost,120,basis,'thuoc-la',10),null,
        'basis '+basis+' / cost '+cost+' must not generate a selling price');
    }
  }
});

test('positive cost preserves existing reference, manual supplier and automatic selection',()=>{
  assert.equal(pricing.referenceSalePrice(100,10),110);
  assert.equal(pricing.selectedSalePrice(100,120,'supplier_1','thuoc-la',10),120);
  assert.equal(pricing.selectedSalePrice(100,120,'cost_1_5','hang-thuong',0),102);
  assert.equal(pricing.autoSaleBasis(100,120,'thuoc-la',10),'supplier_1');
  assert.equal(pricing.selectedSalePrice(100,120,'reference','thuoc-la',10),110);
});

test('admin cannot select a basis without cost and never displays 0 as a selling price',()=>{
  assert.match(admin,/cell\.classList\.toggle\('disabled',cost===null\|\|cost<=0\|\|\(needsSupplier&&supplier===null\)\)/);
  assert.match(admin,/saleValue\.textContent=sale===null\?'—':pretty\(sale\)/);
  assert.match(admin,/item\.retail_price=sale===null\?null:retail/);
  assert.match(admin,/item\.retail_price=payload\.cost===null\|\|payload\.cost<=0\?null:/);
  assert.match(admin,/updateNewRetailPreview\(\)/);
});

const qs=quote.indexOf('// SPEC-PRICE-NO-COST-20261108:');
const qe=quote.indexOf('function uniqueAttr(',qs);
assert.ok(qs>0&&qe>qs);
const quoteContext={Math,Number,fmt:v=>String(v)+' đ'};
vm.runInNewContext(quote.slice(qs,qe)+'\nthis.quoteFns={hasQuotedSalePrice,ownSaleText,retailOwnText};',quoteContext);
const q=quoteContext.quoteFns;

test('public quote shows no fake 1.000đ when cost is known to be zero',()=>{
  const noCost={price:1,retail_price:0.1,cost:0,retail_unit:'cây'};
  assert.equal(q.hasQuotedSalePrice(noCost),false);
  assert.equal(q.ownSaleText(noCost),'Chưa có giá');
  assert.equal(q.retailOwnText(noCost),'');
  assert.equal(q.ownSaleText({price:null}),'Chưa có giá');
  assert.equal(q.ownSaleText({price:2,cost:1}),'2 đ');
  assert.match(quote,/return hasQuotedSalePrice\(p\)&&p\.old_price/);
  assert.match(quote,/function marketRefHtml\(p\)\{\s*if\(!hasQuotedSalePrice\(p\)\)return ''/);
});

test('database pricing functions and all-writer trigger reject non-positive cost',()=>{
  assert.match(migration,/CREATE OR REPLACE FUNCTION public\.taphoa_product_sale_price/);
  assert.match(migration,/CREATE OR REPLACE FUNCTION public\.taphoa_auto_sale_price/);
  assert.equal((migration.match(/WHEN p_cost IS NULL OR p_cost<=0 THEN NULL/g)||[]).length,2);
  assert.match(migration,/BEFORE INSERT OR UPDATE ON public\.taphoa_products/);
  for(const col of ['sale_price_vnd','carton_price_vnd','retail_price_vnd']){
    assert.match(migration,new RegExp('NEW\\.'+col+' := NULL;'));
    assert.match(migration,new RegExp(col+'=NULL'));
  }
  assert.match(migration,/WHERE p\.sync_status IS DISTINCT FROM 'deleted'[\s\S]*?p\.input_price_vnd IS NULL OR p\.input_price_vnd<=0/);
  assert.match(migration,/IF v_repaired>0 THEN[\s\S]*?UPDATE public\.taphoa_revisions/);
  assert.doesNotMatch(migration,/UPDATE public\.taphoa_order_items|DELETE FROM public\.taphoa_orders/);
});
