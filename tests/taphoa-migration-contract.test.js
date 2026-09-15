import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const migrationUrl=new URL('../supabase/migrations/20260915010000_taphoa_independent_core.sql',import.meta.url);
const sql=fs.readFileSync(migrationUrl,'utf8');

test('TAPHOA core is namespaced and reads shared accounts',()=>{
  for(const name of [
    'taphoa_access_context','taphoa_sources','taphoa_products','taphoa_orders',
    'taphoa_order_items','taphoa_debt_ledger','taphoa_revisions','taphoa_sheet_sync_state'
  ]) assert.match(sql,new RegExp(`\\b${name}\\b`));
  assert.match(sql,/from\s+public\.v21_accounts/i);
  assert.match(sql,/contact_group\s*=\s*'customer'/i);
  assert.match(sql,/product_code\s+text\s+primary\s+key/i);
  assert.match(sql,/references\s+public\.v21_accounts\s*\(\s*id\s*\)/i);
});

test('migration cannot destroy shared identity or chat state',()=>{
  assert.doesNotMatch(sql,/truncate[^;]*(v21_accounts|auth\.users)/i);
  assert.doesNotMatch(sql,/delete\s+from\s+(public\.)?v21_accounts/i);
  assert.doesNotMatch(sql,/drop\s+schema\s+public/i);
  assert.doesNotMatch(sql,/\b(chat_|v21_messages|v21_calls|v21_devices)\b/i);
});

test('core schema seeds the five management sources and revisions',()=>{
  for(const source of ['hang-u','thuoc-la','sua','masan','hang-thuong']){
    assert.match(sql,new RegExp(`'${source}'`));
  }
  for(const domain of ['products','customers','orders','debt','settings']){
    assert.match(sql,new RegExp(`'${domain}'`));
  }
});
