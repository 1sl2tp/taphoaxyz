import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration=fs.readFileSync(new URL('../supabase/migrations/20261006085500_taphoa_lock_internal_rpc_surface.sql',import.meta.url),'utf8');
const business=fs.readFileSync(new URL('../src/core/business.js',import.meta.url),'utf8');
const bridge=fs.readFileSync(new URL('../src/fixed-production-bridge.js',import.meta.url),'utf8');

test('retired source mutation RPCs and internal access helper are not browser-callable',()=>{
  assert.match(migration,/revoke execute on function public\.taphoa_access_context\(\) from public, anon, authenticated/i);
  assert.match(migration,/revoke execute on function public\.taphoa_create_source_from_web\(text\) from public, anon, authenticated/i);
  assert.match(migration,/revoke execute on function public\.taphoa_delete_source_from_web\(text\) from public, anon, authenticated/i);
  assert.doesNotMatch(business,/taphoa_access_context|taphoa_create_source_from_web|taphoa_delete_source_from_web/);
  assert.doesNotMatch(bridge,/taphoa_access_context|taphoa_create_source_from_web|taphoa_delete_source_from_web/);
});

test('core TAPHOA tables remain RPC-only for browser roles',()=>{
  assert.match(migration,/revoke all on table[\s\S]*public\.taphoa_orders[\s\S]*public\.taphoa_products[\s\S]*from anon, authenticated/i);
});
