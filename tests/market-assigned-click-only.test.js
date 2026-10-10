import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const screen = readFileSync(new URL('../admin-gia.html',import.meta.url),'utf8');
const db = readFileSync(new URL('../supabase/migrations/20261010195500_taphoa_market_assigned_click_only.sql',import.meta.url),'utf8');

test('Taphoa supermarket refresh is labeled click-only, not weekly', () => {
  assert.match(screen,/Chỉ cập nhật khi bấm nút · nguồn đã gán/);
  assert.doesNotMatch(screen,/Tự động '\+Number\(settings\.interval_days/);
  assert.match(screen,/taphoa_admin_market_update_run_now/);
});
test('Admin-run migration creates only assigned mapped work, does not enable auto', () => {
  assert.match(db,/CREATE OR REPLACE FUNCTION public\.taphoa_admin_market_update_run_now\(\)/);
  assert.match(db,/public\.taphoa_product_market_links/);
  assert.match(db,/getlink_update_queue/);
  assert.match(db,/set enabled=false,last_started_at=v_now/);
  assert.doesNotMatch(db,/set enabled=true,last_started_at=v_now/);
  assert.match(db,/SET enabled=false, updated_at=now\(\)/);
  assert.doesNotMatch(db,/cron\.(?:schedule|unschedule|alter_job)\(/i);
  assert.doesNotMatch(db,/select public\.taphoa_admin_market_update_run_now\(\)/i);
});
