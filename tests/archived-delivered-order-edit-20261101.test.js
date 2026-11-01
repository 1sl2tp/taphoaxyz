import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

// SPEC-ARCHIVED-DELIVERED-LINE-EDIT-20261101
// Given a saved delivered order containing a now-archived product,
// when Admin corrects its existing lines, save must still succeed.
// New inactive products may NOT be injected into saved orders.
const sql=readFileSync(new URL(
  '../supabase/migrations/20261101131407_taphoa_preserve_archived_products_when_editing_delivered_20261101.sql',
  import.meta.url
),'utf8');

test('existing archived product is allowed only on Admin correction of delivered order',()=>{
  assert.match(sql,/join public\.taphoa_products p on p\.product_code=item->>'product_id'/);
  assert.match(sql,/and \(p\.is_active or \(\s*v_role='admin' and v_edit_id is not null and v_old_status='delivered'\s*and v_old_costs \? \(item->>'product_id'\)/);
  assert.match(sql,/jsonb_object_agg\(product_code,unit_cost_vnd_snapshot\)/);
  assert.match(sql,/from public\.taphoa_order_items\s*where order_id=v_order\.id/);
  assert.match(sql,/delete from public\.taphoa_order_items where order_id=v_order\.id/);
});

test('historical costs and financial status protections are unchanged',()=>{
  assert.match(sql,/v_old_costs->>\(item->>'product_id'\)/);
  assert.match(sql,/v_refresh_costs and v_old_status <> 'pending'/);
  assert.match(sql,/if v_old_status='delivered' and v_status<>'delivered' then raise exception 'delivered_order_cannot_be_pending'/);
  assert.match(sql,/SPEC-DELIVERED-NONZERO-ALL-CUSTOMERS-20261101/);
  assert.match(sql,/if v_total<=0 then raise exception 'order_total_invalid'/);
  assert.match(sql,/taphoa_command_log/);
  assert.match(sql,/\$\$;/);
});

test('archived-product allowance never bypasses customer ownership or line checks',()=>{
  assert.match(sql,/if v_role='customer' and \(\s*v_order\.customer_account_id is distinct from v_account_id/);
  assert.match(sql,/v_order\.status <> 'pending'/);
  assert.match(sql,/where coalesce\(\(item->>'qty'\)::numeric,0\)>0/);
  assert.match(sql,/if v_items<>v_expected then raise exception 'invalid_order_items'/);
});
