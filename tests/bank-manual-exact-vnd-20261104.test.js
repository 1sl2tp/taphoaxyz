import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

// SPEC-BANK-MANUAL-EXACT-VND-20261104
// Source-only patch: verified Agribank credits may have non-1000 remainders.
// Never round or drop real dong; all receipt proof/duplicate locks remain.
const predecessor=readFileSync(new URL(
  '../supabase/migrations/20261101131841_taphoa_finance_customer_lock_all_channels_20261101.sql',
  import.meta.url),'utf8');
const migration=readFileSync(new URL(
  '../supabase/migrations/20261104184500_chat_bank_manual_collect_exact_vnd.sql',
  import.meta.url),'utf8');
const signature='CREATE OR REPLACE FUNCTION public.chat_bank_manual_collect(';
const oldFunction=predecessor.slice(predecessor.indexOf(signature)).trim();
const newFunction=migration.slice(migration.indexOf(signature)).trim();
const oldThousandGuard=' OR mod(v_notice.amount_vnd,1000)<>0';
assert.equal((oldFunction.match(/mod\(v_notice\.amount_vnd,1000\)<>0/g)||[]).length,1);

test('migration changes ONLY the manual Agribank whole-thousand condition',()=>{
  assert.equal(newFunction,oldFunction.replace(oldThousandGuard,''),
    'Do not bypass bank proof, duplicates, financial locks, accounting, or existing ledger rules');
  assert.doesNotMatch(newFunction,/mod\(v_notice\.amount_vnd,1000\)/);
  assert.match(newFunction,/v_notice\.amount_vnd::numeric\/1000/);
  assert.match(newFunction,/v_notice\.amount_vnd>=1000000000000/);
  assert.match(newFunction,/v_notice\.amount_vnd<=0/);
  assert.match(newFunction,/v_notice\.is_own_transfer IS DISTINCT FROM false/);
  assert.match(newFunction,/v_notice\.status<>'credit_candidate'/);
  assert.match(newFunction,/v_notice\.package_name IS DISTINCT FROM 'com\.vnpay\.Agribank3g'/);
  assert.match(newFunction,/v_notice\.bank_credit_account IS DISTINCT FROM '[0-9]+'/);
  assert.match(newFunction,/replace\(replace\(v_credit\[2\],'\.',''\),',',''\)::bigint<>v_notice\.amount_vnd/);
  assert.match(newFunction,/pg_advisory_xact_lock\(17812026\)/);
  assert.match(newFunction,/hashtextextended\('taphoa-money:' \|\| p_customer_id::text,0\)/);
  assert.match(newFunction,/already_collected/);
  assert.match(newFunction,/already_auto_collected/);
  assert.match(newFunction,/possible_manual_collection/);
  assert.match(newFunction,/existing_collection_invalid/);
  assert.match(newFunction,/INSERT INTO public\.taphoa_debt_ledger/);
  assert.match(newFunction,/INSERT INTO public\.chat_bank_manual_collections/);
  assert.match(newFunction,/require_active_account\(p_app_session_id\)/);
});

test('bank amount 16,000,008 VND stays exact in thousand-unit ledger',()=>{
  const original=16_000_008n;
  assert.equal(original%1000n,8n);
  assert.equal(original/1000n,16_000n);
  assert.equal(String(original/1000n)+'.'+String(original%1000n).padStart(3,'0'),'16000.008');
  assert.equal(16_000_008/1000,16_000.008);
});

test('automatic bill and Chat cash collection retain stricter guards',()=>{
  const oldAutomatic=predecessor.slice(predecessor.indexOf('CREATE OR REPLACE FUNCTION public.chat_bank_app_collect('),
    predecessor.indexOf(signature));
  const oldCash=predecessor.slice(predecessor.indexOf('CREATE OR REPLACE FUNCTION public.chat_admin_quick_cash_collect('),
    predecessor.indexOf('CREATE OR REPLACE FUNCTION public.chat_bank_app_collect('));
  assert.match(oldAutomatic,/mod\(transfer_amount,1000\)<>0/);
  assert.match(oldCash,/mod\(p_amount_vnd,1000\)<>0/);
  assert.doesNotMatch(migration,/CREATE OR REPLACE FUNCTION public\.chat_bank_app_collect/);
  assert.doesNotMatch(migration,/CREATE OR REPLACE FUNCTION public\.chat_admin_quick_cash_collect/);
});
