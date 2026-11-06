import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const sql=fs.readFileSync('supabase/migrations/20261106081500_public_stable_order_links.sql','utf8');
const bridge=fs.readFileSync('src/fixed-production-bridge.js','utf8');
const overrides=fs.readFileSync('src/fixed-production-overrides.js','utf8');
const gate=fs.readFileSync('kh/index.html','utf8');
const index=fs.readFileSync('index.html','utf8');
const detail=fs.readFileSync('src/fixed-ui-runtime-13.js','utf8');

test('old DT codes and current DG codes map to the same immutable order UUID',()=>{
  assert.match(sql,/create table if not exists v21_private\.taphoa_order_public_codes/);
  assert.match(sql,/old\.display_prefix\|\|old\.display_no::text/);
  assert.match(sql,/new\.display_prefix\|\|new\.display_no::text/);
  assert.match(sql,/from public\.taphoa_command_log l/);
  assert.match(sql,/create trigger taphoa_capture_order_public_code_trg/);
  assert.match(sql,/taphoa_deliver_order|taphoa_order_public_codes|taphoa_order_public_codes/);
});

test('resolver scopes order access to owner PIN or account, never trusts UUID alone',()=>{
  assert.match(sql,/v_customer:=public\.taphoa_public_customer_id_for_access\(p_public_slug,p_pin\)/);
  assert.match(sql,/id=p_order_id and customer_account_id=v_customer/);
  assert.match(sql,/c\.customer_account_id=v_customer/);
  assert.match(sql,/o\.customer_account_id=v_customer/);
  assert.match(sql,/revoke all on v21_private\.taphoa_order_public_codes from public,anon,authenticated/);
});

test('outgoing links keep readable code and stable ID, never include PIN',()=>{
  const start=sql.indexOf('create or replace function public.taphoa_customer_mini_link(');
  const end=sql.indexOf('$$;',start);
  assert.ok(start>=0&&end>start);
  const fn=sql.slice(start,end);
  assert.match(fn,/v_url:=v_url\|\|'&don='\|\|v_order/);
  assert.match(fn,/v_url:=v_url\|\|'&oid='\|\|v_order_id::text/);
  assert.doesNotMatch(fn,/v_url[^;]*p_pin/);
  assert.match(overrides,/p\.set\('oid',stableId\)/);
});

test('public deep links open original order details with one bounded recovery',()=>{
  assert.match(bridge,/resolvePublicOrderLink/);
  assert.match(bridge,/taphoa_public_resolve_order_access/);
  assert.match(overrides,/resolvePublicOrderLink\(q\.don,q\.oid\|\|null\)/);
  assert.match(overrides,/backend\(\)\.refresh\(\['orders'\]\)/);
  assert.match(overrides,/showOrderDetailMobile\(code,sheet\)/);
  assert.doesNotMatch(overrides.slice(overrides.indexOf('  function applyPublicDeepLink(){'),overrides.indexOf('  function sharedCartItems(){')),/clickOrder\(/);
  assert.match(detail,/orderSheet\.slice\(1\)/);
  assert.match(detail,/tenSpSafe = escapeProductEditorValue\(tenSp\)/);
});

test('public gate shows destination order and offers retry on a network error',()=>{
  assert.match(gate,/id="targetOrder"/);
  assert.match(gate,/id="retry"/);
  assert.match(gate,/retry\.addEventListener\('click'/);
  assert.match(gate,/Thử mở lại liên kết/);
  assert.match(index,/public-link-stable=20261106/);
});
