import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const sql=fs.readFileSync(new URL('../supabase/migrations/20260915030000_taphoa_mutation_rpcs.sql',import.meta.url),'utf8');

test('all TAPHOA mutations are namespaced and command-idempotent',()=>{
  for(const name of [
    'taphoa_save_order','taphoa_deliver_order','taphoa_reverse_order',
    'taphoa_delete_pending_order','taphoa_batch_orders','taphoa_debt_transaction'
  ]) assert.match(sql,new RegExp(`create\\s+or\\s+replace\\s+function\\s+public\\.${name}`,'i'));
  assert.match(sql,/create\s+table\s+if\s+not\s+exists\s+public\.taphoa_command_log/i);
  assert.match(sql,/command_id\s+uuid\s+primary\s+key/i);
  assert.match(sql,/pg_advisory_xact_lock/i);
  assert.doesNotMatch(sql,/\b(save_order|deliver_order|reverse_order|delete_pending_order|batch_orders|debt_transaction)\s*\(/i);
});

test('mutations require Admin from shared TAPHOA access context',()=>{
  const accessHits=(sql.match(/taphoa_access_context\s*\(\s*\)/gi)||[]).length;
  assert.ok(accessHits>=6,`expected an access check in each mutation, found ${accessHits}`);
  assert.match(sql,/taphoa_role[^\n;]*admin/i);
  assert.match(sql,/taphoa_access_denied/i);
});

test('order lifecycle reconciles order and debt revisions',()=>{
  assert.match(sql,/taphoa_bump_revision\s*\(\s*'orders'/i);
  assert.match(sql,/taphoa_bump_revision\s*\(\s*'debt'/i);
  assert.match(sql,/entry_type[^\n]*'sale'/i);
  assert.match(sql,/entry_type[^\n]*'reversal'/i);
  assert.match(sql,/status\s*=\s*'reversed'/i);
});

test('frontend thousand-unit amounts are stored as integer VND',()=>{
  assert.match(sql,/unit_price[^\n]*\*\s*1000/i);
  assert.match(sql,/p_amount[^\n]*\*\s*1000/i);
});
