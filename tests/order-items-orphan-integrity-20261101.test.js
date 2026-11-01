import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const sql=readFileSync(new URL(
  '../supabase/migrations/20261101115932_taphoa_restore_order_item_fk_and_archive_deleted_drafts.sql',
  import.meta.url
),'utf8');

test('deleted pending orders leave no orphan item rows on later deletes',()=>{
  assert.match(sql,/ADD CONSTRAINT taphoa_order_items_order_id_fkey/i);
  assert.match(sql,/FOREIGN KEY \(order_id\) REFERENCES public\.taphoa_orders\(id\) ON DELETE CASCADE/i);
});

test('legacy orphan cleanup only covers audited deletions without finance',()=>{
  assert.match(sql,/c\.operation='delete_pending_order'/);
  assert.match(sql,/c\.result->>'deleted'=i\.order_id::text/);
  assert.match(sql,/JOIN public\.taphoa_debt_ledger l ON l\.order_id=i\.order_id/);
  assert.match(sql,/RAISE EXCEPTION 'orphan_order_item_with_financial_entry'/);
  const archive=sql.indexOf('INSERT INTO v21_private.taphoa_orphan_order_items_archive_20261101');
  const cleanup=sql.indexOf('DELETE FROM public.taphoa_order_items i');
  assert.ok(archive>=0&&cleanup>archive,'archive the deleted draft remnants before cleanup');
  assert.doesNotMatch(sql,/DELETE FROM public\.taphoa_debt_ledger/i);
  assert.doesNotMatch(sql,/DELETE FROM public\.taphoa_orders/i);
});

test('deleted draft archives are never directly readable by customers',()=>{
  assert.match(sql,/ALTER TABLE v21_private\.taphoa_orphan_order_items_archive_20261101 ENABLE ROW LEVEL SECURITY/i);
  assert.match(sql,/REVOKE ALL ON TABLE v21_private\.taphoa_orphan_order_items_archive_20261101\s+FROM PUBLIC, anon, authenticated/i);
});
