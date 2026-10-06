import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const admin=fs.readFileSync(new URL('../admin-gia.html',import.meta.url),'utf8');

test('admin shows the calculated reference profit beside the reference profit input',()=>{
  assert.match(admin,/data-col="calculated_profit"[^>]*>Lãi tính</);
  assert.match(admin,/{id:'calculated_profit',label:'Lãi tính'/);
  assert.match(admin,/data-col="calculated_profit" class="readonly calculated-profit"/);
});

test('calculated reference profit is exactly the reference price minus cost',()=>{
  assert.ok(admin.includes('const referenceTarget=costTargetSale(cost,item.source_key,legacyProfit);'));
  assert.ok(admin.includes('const calculatedProfit=referenceTarget===null||cost===null?null:referenceTarget-cost;'));
  assert.ok(admin.includes("row.querySelector('.calculated-profit').textContent=pretty(calculatedProfit);"));
});
