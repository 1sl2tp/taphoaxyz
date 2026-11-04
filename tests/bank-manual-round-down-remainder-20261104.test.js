import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

// SPEC-BANK-MANUAL-ROUND-DOWN-20261104
// Bank evidence must remain exact; only the manually booked debt drops 1-999
// dong, with an explicit audit trail and matching duplicate detection.
const migration=readFileSync(new URL(
  '../supabase/migrations/20261104193000_chat_bank_manual_round_down_remainder.sql',
  import.meta.url),'utf8');
const before=readFileSync(new URL(
  '../supabase/migrations/20261104184500_chat_bank_manual_collect_exact_vnd.sql',
  import.meta.url),'utf8');
const collectMarker='CREATE OR REPLACE FUNCTION public.chat_bank_manual_collect(';
const prepareMarker='CREATE OR REPLACE FUNCTION public.chat_bank_manual_collection_prepare(';
const original=before.slice(before.indexOf(collectMarker));
const prepare=migration.slice(migration.indexOf(prepareMarker),migration.indexOf(collectMarker));
const collect=migration.slice(migration.indexOf(collectMarker));

test('bank proof remains the full incoming VND amount; ledger rounds down only',()=>{
  assert.match(collect,/v_credit\[2\][\s\S]*?<>v_notice\.amount_vnd/);
  assert.match(collect,/v_notice\.bank_credit_account IS DISTINCT FROM '[0-9]+'/);
  assert.match(collect,/v_notice\.package_name IS DISTINCT FROM 'com\.vnpay\.Agribank3g'/);
  assert.match(collect,/v_notice\.is_own_transfer IS DISTINCT FROM false/);
  assert.match(collect,/v_notice\.status<>'credit_candidate'/);
  assert.match(collect,/v_notice\.amount_vnd<1000/);
  assert.match(collect,/v_notice\.amount_vnd>=1000000000000/);
  assert.match(collect,/v_ignored_vnd:=mod\(v_notice\.amount_vnd,1000\)/);
  assert.match(collect,/v_recorded_vnd:=v_notice\.amount_vnd-v_ignored_vnd/);
  assert.match(collect,/v_thousands:=v_recorded_vnd::numeric\/1000/);
  assert.match(collect,/v_audit_suffix:=CASE WHEN v_ignored_vnd>0/);
  assert.match(collect,/btrim\(p_note\)\|\|v_audit_suffix/);
  assert.match(collect,/'recorded_amount_vnd',v_recorded_vnd/);
  assert.match(collect,/'ignored_remainder_vnd',v_ignored_vnd/);
  assert.match(collect,/'amount_vnd',v_notice\.amount_vnd/);
  assert.match(original,/v_thousands:=v_notice\.amount_vnd::numeric\/1000/);
});

test('prepare, existing-ledger linkage and duplicate guards cover rounded and previous exact receipts',()=>{
  assert.match(prepare,/l\.amount_vnd IN \(-trunc\(v_notice\.amount_vnd::numeric\/1000\),\s*-v_notice\.amount_vnd::numeric\/1000\)/);
  assert.match(prepare,/'recorded_amount_vnd',v_notice\.amount_vnd-mod\(v_notice\.amount_vnd,1000\)/);
  assert.match(prepare,/'ignored_remainder_vnd',mod\(v_notice\.amount_vnd,1000\)/);
  assert.match(collect,/v_ledger\.amount_vnd NOT IN \(-v_thousands,-v_notice\.amount_vnd::numeric\/1000\)/);
  assert.match(collect,/l\.amount_vnd IN \(-v_thousands,-v_notice\.amount_vnd::numeric\/1000\)/);
  assert.match(collect,/SELECT \* INTO v_existing FROM public\.chat_bank_manual_collections/);
  assert.match(collect,/'already_auto_collected'/);
  assert.match(collect,/'possible_manual_collection'/);
  assert.match(collect,/pg_advisory_xact_lock\(17812026\)/);
  assert.match(collect,/hashtextextended\('taphoa-money:' \|\| p_customer_id::text,0\)/);
  assert.doesNotMatch(migration,/CREATE OR REPLACE FUNCTION public\.chat_bank_app_collect/);
  assert.doesNotMatch(migration,/CREATE OR REPLACE FUNCTION public\.chat_admin_quick_cash_collect/);
});

test('round-down is exact for 8 VND and never silently creates a zero receipt',()=>{
  for(const [received,booked,difference] of [[16_000_008n,16_000_000n,8n],
    [16_000_000n,16_000_000n,0n],[999n,0n,999n]]){
    const out=(received/1000n)*1000n;
    assert.equal(out,booked);assert.equal(received-out,difference);
  }
  assert.match(collect,/v_notice\.amount_vnd<1000/);
});
