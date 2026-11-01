import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

// SPEC-DELIVERED-NONZERO-ALL-CUSTOMERS-20261101
// Given a new delivered order, a draft promotion, or an edited delivered
// order, when the saved line sum is <= 0, then reject the entire mutation.
// Walk-in and named customers must have the same positive-total requirement.
// Pending orders remain allowed without creating sale debt.
const migration=readFileSync(new URL(
  '../supabase/migrations/20261101130840_taphoa_save_order_reject_zero_total_delivered_20261101.sql',
  import.meta.url
),'utf8');
const originalDeliver=readFileSync(new URL(
  '../supabase/migrations/20260915010000_taphoa_independent_core.sql',
  import.meta.url
),'utf8');

test('direct delivered save has the same positive-total guard as draft delivery',()=>{
  assert.match(migration,/create or replace function public\.taphoa_save_order\(/i);
  const delivered=migration.indexOf("if v_status='delivered' then\n    select coalesce(sum(qty*unit_price_vnd),0) into v_total");
  const guard=migration.indexOf("if v_total<=0 then raise exception 'order_total_invalid'; end if;",delivered);
  const ledger=migration.indexOf("if v_status='delivered' and v_customer is not null then",guard);
  assert.ok(delivered>=0&&guard>delivered&&ledger>guard,
    'validate all deliveries before branching on registered customer debt');
  assert.match(migration,/from public\.taphoa_order_items where order_id=v_order\.id/);
});

test('pending and walk-in sales keep existing business and debt semantics',()=>{
  assert.match(migration,/v_status := case when lower\(coalesce\(p_order->>'status','pending'\)\)/);
  assert.match(migration,/if v_status='delivered' and v_customer is not null then/);
  assert.match(migration,/if v_role='customer' then[\s\S]*?customer_orders_pending_only/);
  assert.match(migration,/if v_old_status='delivered' and v_status<>'delivered' then raise exception 'delivered_order_cannot_be_pending'/);
  assert.match(migration,/select result into prior from public\.taphoa_command_log where command_id=p_command_id/);
  assert.match(migration,/taphoa_bump_revision\('orders'\)/);
  assert.match(migration,/\$\$;/);
});

test('guard does not interfere with sale price, historical cost, or line order',()=>{
  assert.match(migration,/coalesce\(nullif\(v_old_costs->>\(item->>'product_id'\),''\)::numeric/);
  assert.match(migration,/\(item->>'line_no'\)::integer/);
  assert.match(migration,/if v_status='delivered' then\n    select coalesce\(sum\(qty\*unit_price_vnd\),0\)/);
  assert.doesNotMatch(migration,/delete from public\.taphoa_orders\b/i);
});
