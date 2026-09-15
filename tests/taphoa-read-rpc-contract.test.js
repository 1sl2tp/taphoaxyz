import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const file=new URL('../supabase/migrations/20260915020000_taphoa_read_rpcs.sql',import.meta.url);
const sql=fs.readFileSync(file,'utf8');

test('read RPCs are TAPHOA namespaced',()=>{
  for(const name of [
    'taphoa_app_bootstrap','taphoa_app_meta','taphoa_app_domains',
    'taphoa_order_detail','taphoa_debt_ledger_page'
  ]) assert.match(sql,new RegExp(`create\\s+or\\s+replace\\s+function\\s+public\\.${name}`,'i'));
  assert.doesNotMatch(sql,/create\s+or\s+replace\s+function\s+public\.app_/i);
});

test('customers are derived from shared V21 customer accounts',()=>{
  assert.match(sql,/from\s+public\.v21_accounts/i);
  assert.match(sql,/role\s*=\s*'user'/i);
  assert.match(sql,/contact_group\s*=\s*'customer'/i);
  assert.match(sql,/deleted_at\s+is\s+null/i);
  assert.match(sql,/locked_at\s+is\s+null/i);
  assert.doesNotMatch(sql,/from\s+public\.accounts\b/i);
});

test('frontend product and order compatibility fields are explicit',()=>{
  for(const field of ['id','maSP','ten','gia','von','nhom','donVi','giaLe','quyCach']){
    assert.match(sql,new RegExp(`'${field}'`));
  }
  for(const field of ['tenKH','trangThai','tongTien','tongVon','loiNhuan','items']){
    assert.match(sql,new RegExp(`'${field}'`));
  }
  assert.match(sql,/when\s+o\.status\s*=\s*'delivered'\s+then\s*'done'/i);
});

test('every public bundle is gated by TAPHOA access context',()=>{
  const hits=(sql.match(/taphoa_access_context\s*\(\s*\)/gi)||[]).length;
  assert.ok(hits>=5,`expected at least five access checks, found ${hits}`);
});
