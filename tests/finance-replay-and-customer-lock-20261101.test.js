import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createBusinessService} from '../src/core/business.js';

// SPEC-FINANCE-REPLAY-PAYLOAD-20261101 / SPEC-FINANCE-SAME-CUSTOMER-RECEIPT-20261101
// A replayed command ID only acknowledges the same financial payload.
// Concurrent manual Web/PWA commands for the same customer take a shared
// customer-scoped lock BEFORE reading the opening balance.
const sql=readFileSync(new URL(
  '../supabase/migrations/20261101130346_taphoa_finance_replay_payload_customer_lock_20261101.sql',
  import.meta.url
),'utf8');

test('a replayed debt command must match customer, type and amount',()=>{
  assert.match(sql,/select result into prior from public\.taphoa_command_log where command_id=p_command_id/);
  assert.match(sql,/\(prior->>'customer_id'\) is distinct from p_customer_id::text/);
  assert.match(sql,/\(prior->>'receipt_kind'\) is distinct from lower\(coalesce\(p_type,''\)\)/);
  assert.match(sql,/nullif\(prior->>'amount_vnd',''\)::numeric is distinct from p_amount/);
  assert.match(sql,/raise exception 'debt_command_payload_conflict' using errcode='22023'/);
  const check=sql.indexOf("debt_command_payload_conflict");
  const retry=sql.indexOf("return prior;",check);
  const insert=sql.indexOf("insert into public.taphoa_debt_ledger");
  assert.ok(check>=0&&retry>check&&insert>retry);
});

test('manual receipts serialize by customer before taking debt snapshots',()=>{
  const cmdLock=sql.indexOf("pg_advisory_xact_lock(hashtextextended(p_command_id::text,0))");
  const customerLock=sql.indexOf("pg_advisory_xact_lock(hashtextextended('taphoa-money:' || p_customer_id::text,0))");
  const before=sql.indexOf('v_balance_before := public.taphoa_chat_customer_balance_value(p_customer_id)');
  const insert=sql.indexOf("insert into public.taphoa_debt_ledger");
  const after=sql.indexOf('v_balance_after := public.taphoa_chat_customer_balance_value(p_customer_id)');
  assert.ok(cmdLock>=0&&customerLock>cmdLock&&before>customerLock&&insert>before&&after>insert);
  assert.match(sql,/ctx->>'taphoa_role'<>'admin'/);
  assert.match(sql,/invalid_debt_transaction_type/);
  assert.match(sql,/p_amount<>trunc\(p_amount\)/);
  assert.match(sql,/\$\$;/);
});

test('frontend rejects unsafe money integers that JS would silently round',async()=>{
  const calls=[];
  const service=createBusinessService({
    gateway:{rpc:async(name,args)=>{calls.push({name,args});return {ok:true};}},
    idFactory:()=> '00000000-0000-4000-8000-000000000008'
  });
  for(const amt of ['9007199254740993',Number.MAX_SAFE_INTEGER+1,
    -Number.MAX_SAFE_INTEGER-1,1.2,Infinity,0]){
    await assert.rejects(service.debtTransaction('kh-1','thu_tien',amt,'test'),
      /invalid_debt_amount/);
  }
  assert.equal(calls.length,0);
  await service.debtTransaction('kh-1','thu_tien',Number.MAX_SAFE_INTEGER,'test');
  assert.equal(calls.length,1);
  assert.equal(calls[0].args.p_amount,Number.MAX_SAFE_INTEGER);
  assert.equal(calls[0].args.p_type,'collection');
});
