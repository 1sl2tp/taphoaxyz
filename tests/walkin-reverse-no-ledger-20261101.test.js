import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const sql=readFileSync(new URL(
  '../supabase/migrations/20261101130032_taphoa_reverse_walkin_no_debt_20261101.sql',
  import.meta.url
),'utf8');

// SPEC-WALKIN-REVERSE-NO-DEBT-20261101
// Given a delivered order for Khách lẻ (customer_account_id null),
// when Admin reverses it, the order status changes to reversed, but no
// customer debt row is created (there is no customer debt account).
// Named-customer orders continue to write a single matching reversal.
test('walk-in reversal changes order state even with no account ledger',()=>{
  assert.match(sql,/create or replace function public\.taphoa_reverse_order/i);
  assert.match(sql,/o\.status<>'delivered'/);
  assert.match(sql,/update public\.taphoa_orders set status='reversed'/);
  assert.match(sql,/if o\.customer_account_id is not null then[\s\S]*?insert into public\.taphoa_debt_ledger\([\s\S]*?'reversal'[\s\S]*?end if;/i);
  const guard=sql.indexOf('if o.customer_account_id is not null then');
  const ledgerInsert=sql.indexOf('insert into public.taphoa_debt_ledger',guard);
  const debtRevision=sql.indexOf("taphoa_bump_revision('debt')",guard);
  const endGuard=sql.indexOf('end if;',guard);
  assert.ok(guard>=0 && guard<ledgerInsert && ledgerInsert<debtRevision && debtRevision<endGuard);
  assert.ok(sql.indexOf("taphoa_bump_revision('orders')",endGuard)>endGuard,
    'reversing any order, including walk-ins, always refreshes order state');
});

test('the reversal keeps admin permission, status guard and command idempotence',()=>{
  assert.match(sql,/taphoa_access_context\(\)/);
  assert.match(sql,/ctx->>'taphoa_role'<>'admin'/);
  assert.match(sql,/p_command_id is null/);
  assert.match(sql,/pg_advisory_xact_lock/);
  assert.match(sql,/select result into prior from public\.taphoa_command_log/);
  assert.match(sql,/select \* into o from public\.taphoa_orders where id=p_order_id for update/);
  assert.match(sql,/coalesce\(nullif\(btrim\(p_reason\),''\),'Hoàn đơn'\)/);
  assert.match(sql,/insert into public\.taphoa_command_log\(command_id,operation,result\)/);
});

test('migration remains parseable by existing latestFunction extraction',()=>{
  assert.match(sql,/\bAS \$\$/);
  assert.match(sql,/\$\$;/);
  assert.doesNotMatch(sql,/DROP TABLE|TRUNCATE TABLE|DELETE FROM public\.taphoa_debt_ledger/i);
});
