import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

// SPEC-FINANCE-CUSTOMER-LOCK-ALL-CHANNELS-20261101
// Given concurrent manual Web/PWA, Chat cash, and bank collections for
// the SAME customer, all money writers must serialize before balance
// snapshots, with the same advisory lock key. No change to amounts,
// bank proof validation, customer permissions, or notification consent.
const migration=readFileSync(new URL(
  '../supabase/migrations/20261101131841_taphoa_finance_customer_lock_all_channels_20261101.sql',
  import.meta.url
),'utf8');
const web=readFileSync(new URL(
  '../supabase/migrations/20261101130346_taphoa_finance_replay_payload_customer_lock_20261101.sql',
  import.meta.url
),'utf8');
function section(name){
  const start=migration.indexOf('CREATE OR REPLACE FUNCTION public.'+name+'(');
  assert.ok(start>=0,'missing '+name);
  const end=migration.indexOf('$$;',start);
  assert.ok(end>start,'unterminated '+name);
  return migration.slice(start,end+3);
}
const quick=section('chat_admin_quick_cash_collect');
const automatic=section('chat_bank_app_collect');
const manual=section('chat_bank_manual_collect');

test('all four money-entry channels share exactly one customer-specific lock key',()=>{
  const key=/hashtextextended\('taphoa-money:' \|\| (?:p_customer_id|customer)::text,0\)/;
  for(const sql of [web,quick,manual,automatic]){
    assert.match(sql,key);
    assert.match(sql,/taphoa_chat_customer_balance_value/);
  }
});
test('quick Chat cash collection locks after command replay but before before/after balances',()=>{
  const replay=quick.indexOf("IF FOUND THEN");
  const lock=quick.indexOf("hashtextextended('taphoa-money:'");
  const before=quick.indexOf('v_before:=public.taphoa_chat_customer_balance_value');
  const insert=quick.indexOf('INSERT INTO public.taphoa_debt_ledger');
  const after=quick.indexOf('v_after:=public.taphoa_chat_customer_balance_value');
  assert.ok(replay>=0&&lock>replay&&before>lock&&insert>before&&after>insert);
  assert.match(quick,/source_amount_vnd/);
  assert.match(quick,/mod\(p_amount_vnd,1000\)<>0/);
  assert.match(quick,/role='admin'/);
});
test('bank automatic flow locks customer before duplicate detection and balance snapshots',()=>{
  const bankLock=automatic.indexOf('pg_advisory_xact_lock(17812026)');
  const customerLock=automatic.indexOf("hashtextextended('taphoa-money:'");
  const duplicate=automatic.indexOf("'possible_manual_collection'");
  const before=automatic.indexOf('before_balance:=public.taphoa_chat_customer_balance_value');
  const insert=automatic.indexOf('insert into public.taphoa_debt_ledger');
  const after=automatic.indexOf('after_balance:=public.taphoa_chat_customer_balance_value');
  assert.ok(bankLock>=0&&customerLock>bankLock&&duplicate>customerLock&&before>duplicate&&insert>before&&after>insert);
  assert.match(automatic,/unverified|credit_candidate/);
  assert.match(automatic,/chat_bank_app_collection_links/);
});
test('bank manual flow preserves proof and idempotency checks before serialized new charge',()=>{
  const bankLock=manual.indexOf('pg_advisory_xact_lock(17812026)');
  const customerLock=manual.indexOf("hashtextextended('taphoa-money:'");
  const duplicate=manual.indexOf("'possible_manual_collection'");
  const before=manual.indexOf('v_before:=public.taphoa_chat_customer_balance_value');
  const insert=manual.indexOf('INSERT INTO public.taphoa_debt_ledger');
  assert.ok(bankLock>=0&&customerLock>bankLock&&duplicate>customerLock&&before>duplicate&&insert>before);
  assert.match(manual,/chat_bank_manual_collections/);
  assert.match(manual,/v_notice\.status<>'credit_candidate'/);
  assert.match(manual,/existing_collection_invalid/);
});
