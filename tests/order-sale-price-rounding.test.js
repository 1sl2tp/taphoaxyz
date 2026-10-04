import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const sql=fs.readFileSync(
  new URL('../supabase/migrations/20261004204500_round_order_item_sale_price.sql',import.meta.url),
  'utf8'
);

test('order item sale price is rounded before every insert/update',()=>{
  assert.match(sql,/create or replace function public\.taphoa_round_order_item_unit_price\(\)/i);
  assert.match(sql,/new\.unit_price_vnd\s*:=\s*round\(new\.unit_price_vnd\)/i);
  assert.match(sql,/before insert or update of unit_price_vnd/i);
  assert.match(sql,/on public\.taphoa_order_items/i);
});

test('DG47 repair keeps order and debt sale amount in sync',()=>{
  assert.match(sql,/product_code='HT-000064'/i);
  assert.match(sql,/sum\(qty\*unit_price_vnd\)/i);
  assert.match(sql,/update public\.taphoa_debt_ledger[\s\S]*set amount_vnd=v_total[\s\S]*entry_type='sale'/i);
  assert.match(sql,/taphoa_bump_revision\('orders'\)/i);
  assert.match(sql,/taphoa_bump_revision\('debt'\)/i);
});

test('rounding applies only to sale snapshot, not cost snapshot',()=>{
  assert.doesNotMatch(sql,/round\(new\.unit_cost_vnd_snapshot\)/i);
});

