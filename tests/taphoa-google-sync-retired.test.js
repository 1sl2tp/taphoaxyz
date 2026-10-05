import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const rules=fs.readFileSync(new URL('../docs/PRODUCT_EDITOR_SYNC_RULES.md',import.meta.url),'utf8');
const migration=fs.readFileSync(new URL('../supabase/migrations/20261006023000_taphoa_remove_google_sheet_drive_runtime.sql',import.meta.url),'utf8');
const retiredSyncDir=new URL('../supabase/functions/taphoa-sheet-sync/',import.meta.url);

test('TAPHOA Google Sheet sync function source is physically absent',()=>{
  assert.equal(fs.existsSync(retiredSyncDir),false,'taphoa-sheet-sync source directory must not exist');
});

test('current product rule is Supabase-only',()=>{
  assert.match(rules,/SUPABASE ONLY/);
  assert.match(rules,/Supabase is the only product\/catalog writer/);
  assert.match(rules,/No Google Drive push watch/);
  assert.match(rules,/No Sheet → Supabase automatic import/);
  assert.match(rules,/No Supabase → Sheet automatic write-back/);
  assert.match(rules,/No TAPHOA Google Sheet\/Drive Edge Function/);
});

test('retirement migration removes cron state queues and mutating RPCs',()=>{
  for(const required of [
    "cron.unschedule",
    "drop function if exists public.taphoa_apply_product_sync",
    "drop function if exists public.taphoa_apply_product_delta",
    "drop table if exists public.taphoa_product_outbox",
    "drop table if exists public.taphoa_product_sheet_state",
    "drop table if exists public.taphoa_sheet_watch_channels",
    "drop table if exists public.taphoa_sheet_sync_state",
    "taphoa_sheet_sync_cron_secret"
  ]) assert.ok(migration.includes(required),`missing retirement guard: ${required}`);
});
