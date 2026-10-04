import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const sql=fs.readFileSync(
  new URL('../supabase/migrations/20261004194000_restore_public_miniapp_execute.sql',import.meta.url),
  'utf8'
).toLowerCase();

test('cutover keeps every browser-facing public mini-app RPC executable',()=>{
  for(const fn of [
    'taphoa_public_gate_state(text)',
    'taphoa_public_pin_create(text,text)',
    'taphoa_public_pin_check(text,text)',
    'taphoa_public_pin_manage_access(text,text,text)',
    'taphoa_public_bootstrap_access(text,text)',
    'taphoa_public_domains_access(text,text,text[])',
    'taphoa_public_order_detail_access(text,text,uuid)',
    'taphoa_public_debt_ledger_access(text,text,timestamptz,bigint,integer)',
    'taphoa_public_save_pending_access(text,text,jsonb,uuid)',
    'taphoa_public_delete_pending_access(text,text,uuid,uuid)',
    'taphoa_public_employee_link_access(text,text)',
    'taphoa_public_employee_snapshot_access(text,text)',
    'taphoa_public_shared_cart_save_access(text,text,jsonb)'
  ]){
    assert.ok(sql.includes(`grant execute on function public.${fn}`),fn);
  }
  assert.match(sql,/to anon,authenticated;/);
});

test('internal customer-id and raw customer helpers are not exposed by the repair',()=>{
  for(const forbidden of [
    'grant execute on function public.taphoa_public_customer_id_for_access',
    'grant execute on function public.taphoa_public_customer_id_by_pin',
    'grant execute on function public.taphoa_public_bootstrap_for_customer',
    'grant execute on function public.taphoa_public_debt_ledger_for_customer'
  ]){
    assert.equal(sql.includes(forbidden),false,forbidden);
  }
});
