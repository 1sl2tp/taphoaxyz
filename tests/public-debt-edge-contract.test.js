import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const src=fs.readFileSync(new URL('../supabase/functions/taphoa-public-debt/index.ts',import.meta.url),'utf8').toLowerCase();

test('public debt endpoint resolves only a valid customer public handle',()=>{
  for(const needle of [
    'v21_customer_public_links',
    "lastindexof('~')",
    "is('revoked_at',null)",
    "eq('role','user')",
    "eq('contact_group','customer')",
    "is('deleted_at',null)",
    "is('locked_at',null)",
  ])assert.ok(src.includes(needle),needle);
});

test('public debt endpoint exposes debt history and order detail without cost fields',()=>{
  for(const needle of [
    "from('taphoa_debt_ledger')",
    "from('taphoa_orders')",
    "from('taphoa_order_items')",
    "from('taphoa_products')",
    'balance_after_vnd',
    'total_delivered_vnd',
    'total_collected_vnd',
    'unit_price_vnd',
    'line_total_vnd',
  ])assert.ok(src.includes(needle),needle);
  for(const forbidden of ['input_price_vnd','unit_cost_vnd_snapshot','applied_profit_vnd'])assert.equal(src.includes(forbidden),false,forbidden);
});

test('public debt endpoint is read only',()=>{
  assert.equal(/\.insert\(|\.update\(|\.delete\(|\.upsert\(/.test(src),false);
  assert.ok(src.includes("req.method!=='get'"));
});
