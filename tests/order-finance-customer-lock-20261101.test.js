import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

// SPEC-ORDER-FINANCE-CUSTOMER-LOCK-20261101
// Given a simultaneous order delivery/reversal and cash/bank collection,
// money mutations must share the same per-customer transactional lock.
// When editing a delivered order to change customer A -> B, take the
// two customer locks in a stable order; preserve historic costs and rights.
const sql=readFileSync(new URL(
  '../supabase/migrations/20261101132428_taphoa_order_finance_customer_lock_20261101.sql',
  import.meta.url
),'utf8');
function rpc(name){
  const start=sql.indexOf('CREATE OR REPLACE FUNCTION public.'+name+'(');
  assert.ok(start>=0,name+' missing');
  const end=sql.indexOf('$$;',start);
  assert.ok(end>start,name+' unterminated');
  return sql.slice(start,end+3);
}
const save=rpc('taphoa_save_order'),deliver=rpc('taphoa_deliver_order'),
 reverse=rpc('taphoa_reverse_order');

test('delivery takes the same finance lock after order row lock but before posting sale',()=>{
  const row=deliver.indexOf('where id=p_order_id for update');
  const money=deliver.indexOf("hashtextextended('taphoa-money:'");
  const posting=deliver.indexOf('insert into public.taphoa_debt_ledger');
  assert.ok(row>=0 && money>row && posting>money);
  assert.match(deliver,/if o\.customer_account_id is not null then[\s\S]*?hashtextextended\('taphoa-money:' \|\| o\.customer_account_id::text,0\)/);
  assert.match(deliver,/order_cost_missing/);
  assert.match(deliver,/taphoa_access_denied/);
});

test('reverse takes a customer finance lock before the reversal, skipping walk-ins',()=>{
  const row=reverse.indexOf('where id=p_order_id for update');
  const lock=reverse.indexOf("hashtextextended('taphoa-money:'");
  const insert=reverse.indexOf('insert into public.taphoa_debt_ledger');
  assert.ok(row>=0&&lock>row&&insert>lock);
  assert.match(reverse,/if o\.customer_account_id is not null then[\s\S]*?hashtextextended\('taphoa-money:' \|\| o\.customer_account_id::text,0\)/);
  assert.match(reverse,/SPEC-WALKIN-REVERSE-NO-DEBT-20261101/);
  assert.match(reverse,/o\.status<>'delivered'/);
});

test('direct sales and edits acquire locks before balance snapshots and sale ledger writes',()=>{
  const create=save.indexOf("if v_edit_id is null then");
  const direct=save.indexOf("hashtextextended('taphoa-money:' || v_customer::text,0)",create);
  const orderInsert=save.indexOf('insert into public.taphoa_orders',create);
  assert.ok(create>=0&&direct>create&&orderInsert>direct);

  const oldCustomer=save.indexOf('v_old_customer := v_order.customer_account_id');
  const oldBalance=save.indexOf('v_balance_before := public.taphoa_chat_customer_balance_value');
  const saleInsert=save.indexOf('insert into public.taphoa_debt_ledger');
  assert.ok(oldCustomer>=0&&oldBalance>oldCustomer&&saleInsert>oldBalance);
  assert.match(save,/least\(v_old_customer::text,v_customer::text\)/);
  assert.match(save,/greatest\(v_old_customer::text,v_customer::text\)/);
  assert.match(save,/coalesce\(v_old_customer,v_customer\)::text/);
  assert.match(save,/SPEC-DELIVERY-MISSING-COST-20261101/);
  assert.match(save,/SPEC-ARCHIVED-DELIVERED-LINE-EDIT-20261101/);
});

test('RPC permission boundaries and command idempotence are retained',()=>{
  for(const fn of [save,deliver,reverse]){
    assert.match(fn,/taphoa_access_context\(\)/);
    assert.match(fn,/pg_advisory_xact_lock\(hashtextextended\(p_command_id::text,0\)\)/);
    assert.match(fn,/select result into prior from public\.taphoa_command_log/);
    assert.match(fn,/insert into public\.taphoa_command_log/);
  }
  assert.match(reverse,/o\.status<>'delivered'/);
  assert.match(deliver,/o\.status<>'pending'/);
  assert.match(save,/customer_orders_pending_only/);
});
