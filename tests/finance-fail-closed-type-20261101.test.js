import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createBusinessService} from '../src/core/business.js';

// SPEC-DEBT-FAIL-CLOSED-TYPE-20261101
// GIVEN a valid customer finance form, WHEN submitting thu_tien/ghi_no,
// THEN exactly the respective collection/payment RPC is sent.
// Unknown types or invalid amounts MUST NOT create any financial RPC.
const sql=readFileSync(new URL(
  '../supabase/migrations/20261101125105_taphoa_debt_transaction_fail_closed_type_20261101.sql',
  import.meta.url
),'utf8');

function fixture(){
  const calls=[];
  const gateway={rpc:async(name,args)=>{calls.push({name,args});return {ok:true};}};
  const service=createBusinessService({
    gateway,idFactory:()=> '00000000-0000-4000-8000-000000000001'
  });
  return {calls,service};
}

test('business service maps thu tien and ghi no without altering amounts',async()=>{
  const {calls,service}=fixture();
  await service.debtTransaction('customer-1','thu_tien',125000,'Thu tiền');
  await service.debtTransaction('customer-1','ghi_no',45000,'Ghi nợ');
  assert.equal(calls.length,2);
  assert.deepEqual(calls.map(x=>x.name),['taphoa_debt_transaction','taphoa_debt_transaction']);
  assert.deepEqual(calls.map(x=>x.args.p_type),['collection','payment']);
  assert.deepEqual(calls.map(x=>x.args.p_amount),[125000,45000]);
});

test('unknown or missing type never silently increases customer debt',async()=>{
  const {calls,service}=fixture();
  for(const type of ['',null,undefined,'thu','collection','payment','ghi-no','adjustment','unknown']){
    await assert.rejects(service.debtTransaction('customer-1',type,100,'no-op'),
      /invalid_debt_transaction_type/);
  }
  assert.equal(calls.length,0);
});

test('non-positive, fractional and nonfinite finance amounts fail before RPC',async()=>{
  const {calls,service}=fixture();
  for(const amount of [0,-1,1.25,NaN,Infinity,-Infinity,'not-a-number','']){
    await assert.rejects(service.debtTransaction('customer-1','ghi_no',amount,'no-op'),
      /invalid_debt_amount/);
  }
  assert.equal(calls.length,0);
});

test('deployed database function rejects unknown types before any ledger insert',()=>{
  assert.match(sql,/if lower\(coalesce\(p_type,''\)\) not in \('collection','payment'\) then/i);
  assert.match(sql,/raise exception 'invalid_debt_transaction_type' using errcode='22023'/i);
  const guard=sql.indexOf('SPEC-DEBT-FAIL-CLOSED-TYPE-20261101:');
  const insert=sql.indexOf('insert into public.taphoa_debt_ledger');
  assert.ok(guard>=0&&insert>guard,'the guard executes before ledger insert');
  assert.match(sql,/taphoa_access_context\(\)/);
  assert.match(sql,/taphoa_command_log/);
});
