import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(path,'utf8');

test('DG and DT use independent display counters',async()=>{
  const migration=await read('supabase/migrations/20260919125000_taphoa_independent_dg_dt_display_codes.sql');
  const bridge=await read('src/fixed-production-bridge.js');

  assert.match(migration,/taphoa_order_display_no_dg_seq/);
  assert.match(migration,/taphoa_order_display_no_dt_seq/);
  assert.match(migration,/display_prefix/);
  assert.match(migration,/taphoa_orders_display_prefix_no_uidx/);
  assert.match(migration,/on public\.taphoa_orders\(display_prefix,display_no\)/);
  assert.match(migration,/partition by case when status in \('delivered','reversed'\) then 'DG' else 'DT' end/);

  assert.match(migration,/v_prefix := case when v_status='delivered' then 'DG' else 'DT' end/);
  assert.match(migration,/nextval\(\(case when v_prefix='DG' then 'public\.taphoa_order_display_no_dg_seq' else 'public\.taphoa_order_display_no_dt_seq' end\)::regclass\)/);
  assert.match(migration,/v_old_status='pending' and v_status='delivered'[\s\S]{0,220}nextval\('public\.taphoa_order_display_no_dg_seq'::regclass\)/);
  assert.match(migration,/display_prefix='DG'[\s\S]{0,120}display_no=nextval\('public\.taphoa_order_display_no_dg_seq'::regclass\)/);

  assert.match(migration,/'displayPrefix',code\.prefix/);
  assert.match(migration,/'displayCode',code\.prefix \|\| code\.no::text/);
  assert.match(bridge,/displayCode/);
  assert.match(bridge,/display_no/);
});
