import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const quote=readFileSync(new URL('../bao-gia/index.html',import.meta.url),'utf8');
const admin=readFileSync(new URL('../admin-gia.html',import.meta.url),'utf8');
const migration=readFileSync(new URL('../supabase/migrations/20261008010500_add_public_quote_visit_analytics.sql',import.meta.url),'utf8');

test('public quote records one lightweight anonymous visit without IP/geolocation',()=>{
  assert.match(quote,/taphoa_public_quote_record_visit/);
  assert.match(quote,/taphoa\.quote\.visitor\.v1/);
  assert.match(quote,/keepalive:true/);
  assert.doesNotMatch(quote,/navigator\.geolocation|ipify|ipinfo|ip-api/i);
});

test('admin analytics is lazy and exposes total plus per-day report',()=>{
  assert.match(admin,/id="analyticsTabBtn"[^>]*>Lượt truy cập</);
  assert.match(admin,/id="analyticsTotal"/);
  assert.match(admin,/id="analyticsDailyBody"/);
  assert.match(admin,/taphoa_admin_quote_visit_report/);
  assert.match(admin,/else if\(adminView==='analytics'\)\{\s*loadQuoteAnalytics\(false\)/);
  assert.doesNotMatch(admin,/setInterval\([^)]*loadQuoteAnalytics/);
});

test('analytics storage is RPC-only and hashes the anonymous browser id',()=>{
  assert.match(migration,/create table if not exists public\.taphoa_quote_visit_daily/i);
  assert.match(migration,/extensions\.digest\(v_id,'sha256'\)/);
  assert.match(migration,/revoke all on table public\.taphoa_quote_visit_daily from public,anon,authenticated/i);
  assert.match(migration,/grant execute on function public\.taphoa_public_quote_record_visit[^;]+to anon,authenticated/i);
  assert.match(migration,/taphoa_access_context\(\)/);
  assert.match(migration,/taphoa_role',''\) <> 'admin'/);
  assert.doesNotMatch(migration,/ip_address|latitude|longitude|geolocation/i);
});
