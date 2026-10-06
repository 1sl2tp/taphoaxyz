import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration=fs.readFileSync(
  new URL('../supabase/migrations/20261006160000_retire_legacy_generic_business_runtime.sql',import.meta.url),
  'utf8'
);
const business=fs.readFileSync(new URL('../src/core/business.js',import.meta.url),'utf8');

test('legacy generic order/debt runtime retirement is guarded and non-cascading',()=>{
  assert.match(migration,/legacy_generic_business_tables_not_empty/);
  assert.match(migration,/unexpected_legacy_generic_business_dependency/);
  assert.match(migration,/drop table if exists public\.order_items;/);
  assert.match(migration,/drop table if exists public\.debts;/);
  assert.match(migration,/drop table if exists public\.orders;/);
  assert.doesNotMatch(migration,/drop table[^;]*cascade/i);
});

test('retired GETLINK and TAPHOA generic order RPCs are removed',()=>{
  for(const name of [
    'getlink_create_v21_order',
    'getlink_approve_v21_order',
    'getlink_cancel_v21_order',
    'taphoa_create_order',
    'taphoa_update_order',
    'taphoa_approve_order',
    'taphoa_cancel_order',
    'taphoa_add_debt'
  ]){
    assert.match(migration,new RegExp('drop function if exists public\\.'+name));
    assert.doesNotMatch(business,new RegExp('gateway\\.rpc\\([\'"]'+name+'[\'"]'));
  }
});

test('current TAPHOA business service remains on canonical UUID RPCs',()=>{
  for(const name of [
    'taphoa_save_order',
    'taphoa_deliver_order',
    'taphoa_reverse_order',
    'taphoa_delete_pending_order',
    'taphoa_debt_transaction'
  ])assert.match(business,new RegExp(name));
});
