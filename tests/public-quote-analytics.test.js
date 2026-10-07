import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const quote=readFileSync(new URL('../bao-gia/index.html',import.meta.url),'utf8');
const admin=readFileSync(new URL('../admin-gia.html',import.meta.url),'utf8');
const baseMigration=readFileSync(new URL('../supabase/migrations/20261008010500_add_public_quote_visit_analytics.sql',import.meta.url),'utf8');
const geoMigration=readFileSync(new URL('../supabase/migrations/20261008012500_enrich_quote_visit_ip_geo.sql',import.meta.url),'utf8');

test('public quote records lightweight visit and enriches coarse IP location without GPS prompt',()=>{
  assert.match(quote,/taphoa_public_quote_record_visit/);
  assert.match(quote,/taphoa_public_quote_enrich_visit/);
  assert.match(quote,/taphoa\.quote\.visitor\.v1/);
  assert.match(quote,/https:\/\/ipapi\.co\/json\//);
  assert.match(quote,/maskPublicIp/);
  assert.match(quote,/3600000/);
  assert.doesNotMatch(quote,/navigator\.geolocation/);
});

test('admin analytics is lazy and exposes total, daily, device and coarse IP location',()=>{
  assert.match(admin,/id="analyticsTabBtn"[^>]*>Lượt truy cập</);
  assert.match(admin,/id="analyticsTotal"/);
  assert.match(admin,/id="analyticsDailyBody"/);
  assert.match(admin,/Khu vực \(IP\)/);
  assert.match(admin,/row\.ip_masked/);
  assert.match(admin,/row\.device_model/);
  assert.match(admin,/taphoa_admin_quote_visit_report/);
  assert.match(admin,/else if\(adminView==='analytics'\)\{\s*loadQuoteAnalytics\(false\)/);
  assert.doesNotMatch(admin,/setInterval\([^)]*loadQuoteAnalytics/);
});

test('analytics storage remains RPC-only and does not persist full raw IP',()=>{
  assert.match(baseMigration,/create table if not exists public\.taphoa_quote_visit_daily/i);
  assert.match(baseMigration,/extensions\.digest\(v_id,'sha256'\)/);
  assert.match(baseMigration,/revoke all on table public\.taphoa_quote_visit_daily from public,anon,authenticated/i);
  assert.match(geoMigration,/taphoa_public_quote_enrich_visit/);
  assert.match(geoMigration,/ip_masked text/);
  assert.doesNotMatch(geoMigration,/ip_address text|raw_ip text/i);
  assert.match(geoMigration,/taphoa_access_context\(\)/);
  assert.match(geoMigration,/taphoa_role',''\) <> 'admin'/);
});
