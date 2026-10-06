import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const admin=fs.readFileSync(new URL('../admin-gia.html',import.meta.url),'utf8');

test('admin shows the calculated reference profit beside the reference profit input',()=>{
  assert.match(admin,/data-col="calculated_profit"[^>]*>Lãi tính</);
  assert.match(admin,/{id:'calculated_profit',label:'Lãi tính'/);
  assert.match(admin,/data-col="calculated_profit" class="readonly calculated-profit price-choice" data-basis="calculated_profit"/);
});

test('calculated profit is the balanced formula and shows its own price',()=>{
  assert.ok(admin.includes('const referenceTarget=referenceSalePrice(cost,legacyProfit);'));
  assert.ok(admin.includes('const calculatedProfit=balancedProfit(cost,legacyProfit);'));
  assert.ok(admin.includes('const calculatedTarget=calculatedSalePrice(cost,legacyProfit);'));
  assert.ok(admin.includes("row.querySelector('.calculated-profit-value').textContent=pretty(calculatedProfit);"));
});
