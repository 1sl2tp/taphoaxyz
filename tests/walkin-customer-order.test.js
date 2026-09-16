import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {orderRpcPayload} from '../src/core/business.js';

const migrationPath=new URL('../supabase/migrations/20260916010000_taphoa_walkin_customer_orders.sql',import.meta.url);
const migration=fs.existsSync(migrationPath)?fs.readFileSync(migrationPath,'utf8'):'';

test('Khách lẻ is sent to the backend as null customer id',()=>{
  const payload=orderRpcPayload({maKH:'le',status:'done',items:[{maSP:'SP-1',sl:1,gia:10,lineNo:1}]});
  assert.equal(payload.customer_id,null);
});

test('walk-in order migration allows null customer and skips customer debt',()=>{
  assert.match(migration,/alter\s+table\s+public\.taphoa_orders[\s\S]*customer_account_id\s+drop\s+not\s+null/i);
  assert.match(migration,/v_customer\s+is\s+not\s+null[\s\S]*customer_not_found/i);
  assert.match(migration,/v_status\s*=\s*'delivered'\s+and\s+v_customer\s+is\s+not\s+null/i);
  assert.match(migration,/left\s+join\s+public\.v21_accounts\s+c/i);
  assert.match(migration,/coalesce\([^\n]*display_name[^\n]*'Khách lẻ'/i);
});
