import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const migrationUrl=new URL('../supabase/migrations/20261006073500_taphoa_order_debt_idempotency.sql',import.meta.url);
const migration=fs.existsSync(migrationUrl)?fs.readFileSync(migrationUrl,'utf8'):'';

test('order-linked debt rows are unique per order and sale/reversal type',()=>{
  assert.equal(fs.existsSync(migrationUrl),true,'order debt idempotency migration must exist');
  assert.match(migration,/create unique index if not exists taphoa_debt_ledger_order_entry_unique/i);
  assert.match(migration,/on public\.taphoa_debt_ledger\s*\(order_id,entry_type\)/i);
  assert.match(migration,/where order_id is not null\s+and entry_type in \('sale','reversal'\)/i);
});
