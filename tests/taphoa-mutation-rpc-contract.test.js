import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const migrationsDir=fileURLToPath(new URL('../supabase/migrations/',import.meta.url));
const migrationFiles=fs.readdirSync(migrationsDir).filter(name=>name.endsWith('.sql')).sort();
const sql=migrationFiles.map(name=>fs.readFileSync(path.join(migrationsDir,name),'utf8')).join('\n\n');

function latestFunction(name){
  const marker=`create or replace function public.${name}`;
  const lower=sql.toLowerCase();
  const start=lower.lastIndexOf(marker.toLowerCase());
  assert.notEqual(start,-1,`missing function ${name}`);
  const end=sql.indexOf('$$;',start);
  assert.notEqual(end,-1,`unterminated function ${name}`);
  return sql.slice(start,end+3);
}

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

test('customer can save only their own pending order',()=>{
  const fn=latestFunction('taphoa_save_order');
  assert.match(fn,/taphoa_role[^\n;]*customer/i);
  assert.match(fn,/v_status\s*<>\s*'pending'/i);
  assert.match(fn,/v_customer[^\n;]*account_id/i);
  assert.match(fn,/customer_account_id[^\n;]*account_id/i);
  assert.match(fn,/v_order\.status\s*<>\s*'pending'/i);
});

test('customer can delete only their own pending order',()=>{
  const fn=latestFunction('taphoa_delete_pending_order');
  assert.match(fn,/taphoa_role[^\n;]*customer/i);
  assert.match(fn,/o\.customer_account_id[^\n;]*account_id/i);
  assert.match(fn,/o\.status\s*<>\s*'pending'/i);
});

test('delivered, reversal, batch and debt mutations remain Admin-only',()=>{
  for(const name of ['taphoa_deliver_order','taphoa_reverse_order','taphoa_batch_orders','taphoa_debt_transaction']){
    const fn=latestFunction(name);
    assert.match(fn,/taphoa_role[^\n;]*<>\s*'admin'/i,`${name} must remain admin-only`);
  }
});

test('order lifecycle reconciles order and debt revisions',()=>{
  assert.match(sql,/taphoa_bump_revision\s*\(\s*'orders'/i);
  assert.match(sql,/taphoa_bump_revision\s*\(\s*'debt'/i);
  assert.match(sql,/taphoa_debt_ledger[\s\S]{0,500}?'sale'/i);
  assert.match(sql,/taphoa_debt_ledger[\s\S]{0,500}?'reversal'/i);
  assert.match(sql,/status\s*=\s*'reversed'/i);
});

test('frontend thousand-unit amounts are stored as integer VND',()=>{
  assert.match(sql,/unit_price[^\n]*\*\s*1000/i);
  assert.match(sql,/p_amount[^\n]*\*\s*1000/i);
});
