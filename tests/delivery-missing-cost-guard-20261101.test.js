import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

// SPEC-DELIVERY-MISSING-COST-20261101
// GIVEN a pending draft or a directly saved sale for a product with unknown
// cost, WHEN finalizing a positive-priced line, THEN reject the transaction
// instead of recording zero as a known cost and overstating profit.
// Pending draft saves remain possible; free samples (unit price zero) remain
// possible, and deliberately zero cost from the catalog is distinguished.
const sql=readFileSync(new URL(
  '../supabase/migrations/20261101132141_taphoa_reject_priced_deliveries_with_missing_cost_20261101.sql',
  import.meta.url
),'utf8');

function rpc(name){
  const first=sql.indexOf('CREATE OR REPLACE FUNCTION public.'+name+'(');
  assert.ok(first>=0,name+' exists');
  const end=sql.indexOf('$$;',first);
  assert.ok(end>first,name+' body complete');
  return sql.slice(first,end+3);
}
const direct=rpc('taphoa_save_order');
const deliver=rpc('taphoa_deliver_order');

test('both direct delivery and promotion reject unresolved priced-line cost before financial posting',()=>{
  for(const fn of [direct,deliver]){
    assert.match(fn,/i\.unit_price_vnd>0/);
    assert.match(fn,/i\.unit_cost_vnd_snapshot=0 and p\.input_price_vnd is distinct from 0/);
    assert.match(fn,/raise exception 'order_cost_missing' using errcode='22023'/);
    const missing=fn.indexOf("raise exception 'order_cost_missing'");
    const sale=fn.indexOf("insert into public.taphoa_debt_ledger");
    assert.ok(missing>=0&&sale>missing,'reject unknown cost before posting sale ledger');
    assert.match(fn,/if v_total<=0 then raise exception 'order_total_invalid'/);
    assert.match(fn,/taphoa_access_context\(\)/);
    assert.match(fn,/pg_advisory_xact_lock/);
  }
});
test('pending edits still allowed; existing archived-line and cost-freeze protections stay intact',()=>{
  assert.match(direct,/if v_status='delivered' then\s+select coalesce\(sum\(qty\*unit_price_vnd\),0\)/);
  assert.match(direct,/if v_status='delivered' and v_customer is not null then/);
  assert.match(direct,/v_old_costs->>\(item->>'product_id'\)/);
  assert.match(direct,/SPEC-ARCHIVED-DELIVERED-LINE-EDIT-20261101/);
  assert.match(direct,/v_old_status='delivered'/);
  assert.match(direct,/if v_role='customer' then/);
  assert.match(direct,/customer_orders_pending_only/);
});
test('validation is based on frozen price and cost, not a prohibition of free samples',()=>{
  for(const fn of [direct,deliver]){
    assert.match(fn,/i\.unit_price_vnd>0/,'zero-priced item is outside the guard');
    assert.match(fn,/p\.input_price_vnd is distinct from 0/,'true zero-input-cost is outside guard');
    assert.doesNotMatch(fn,/update public\.taphoa_products/i);
  }
});
