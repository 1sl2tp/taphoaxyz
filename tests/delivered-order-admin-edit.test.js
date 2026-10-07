import test from 'node:test';
import assert from 'node:assert/strict';
import {readdir,readFile} from 'node:fs/promises';

const migrationsDir='supabase/migrations';

test('latest migration restores delivered-order edits for admin only',async()=>{
  const files=(await readdir(migrationsDir)).sort();
  const filename=[...files].reverse().find(name=>/admin_edit_delivered_order\.sql$/.test(name));
  assert.ok(filename,'missing admin_edit_delivered_order migration');

  const sql=await readFile(`${migrationsDir}/${filename}`,'utf8');
  assert.match(sql,/create or replace function public\.taphoa_save_order/i);
  assert.match(sql,/v_role not in \('admin','customer'\)/);
  assert.match(sql,/v_role='customer'[\s\S]{0,260}v_order\.status <> 'pending'/);
  assert.match(sql,/if v_old_status='delivered' and v_status<>'delivered' then raise exception 'delivered_order_cannot_be_pending'/);
  assert.doesNotMatch(sql,/delivered_order_read_only/);
  assert.match(sql,/delete from public\.taphoa_debt_ledger where order_id=v_order\.id and entry_type='sale'/);
  assert.match(sql,/insert into public\.taphoa_debt_ledger\(customer_account_id,order_id,entry_type,amount_vnd,note,created_by_account_id\)/);
});
