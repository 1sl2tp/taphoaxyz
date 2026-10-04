import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const runtime = readFileSync(new URL('../src/fixed-ui-runtime-4.js', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../supabase/migrations/20261004222500_restore_vnm_market_source_filter.sql', import.meta.url), 'utf8');

test('supermarket source chips match the canonical market-search source allowlist', () => {
  assert.match(runtime, /\['Tất cả', 'GO!', 'WinMart', 'Bách Hóa XANH', 'VNM'\]/);
  assert.match(migration, /v_source not in \('','GO!','WinMart','Bách Hóa XANH','VNM'\)/);
  assert.match(migration, /l\.source in \('GO!','WinMart','Bách Hóa XANH','VNM'\)/);
  assert.match(migration, /\(v_source='' or l\.source=v_source\)/);
});

test('compatibility overloads delegate to the four-argument source-filtered function', () => {
  assert.match(migration, /taphoa_market_search\(p_query,p_limit,p_source,0\)/);
  assert.match(migration, /taphoa_market_search\(p_query,p_limit,'',0\)/);
});
