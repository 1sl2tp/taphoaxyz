import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const scrollCss=fs.readFileSync(path.join(root,'src/styles/scroll-owner.css'),'utf8');
const salesCss=fs.readFileSync(path.join(root,'src/styles/sales.css'),'utf8');
const appJs=fs.readFileSync(path.join(root,'src/app.js'),'utf8');
const migrationsDir=path.join(root,'supabase/migrations');
const migrations=fs.readdirSync(migrationsDir).filter(name=>name.endsWith('.sql')).sort().map(name=>fs.readFileSync(path.join(migrationsDir,name),'utf8')).join('\n');

test('mobile scroll owners explicitly preserve vertical and horizontal pan gestures',()=>{
  assert.match(scrollCss,/touch-action\s*:\s*pan-y/i);
  assert.match(salesCss,/\.sales-groups[^}]*touch-action\s*:\s*pan-x/is);
});

test('app shell swipes same-level tabs from list surfaces without stealing forms or overlays',()=>{
  assert.match(appJs,/bindTabSwipe/);
  assert.match(appJs,/input,textarea,select/);
  assert.match(appJs,/overlay|account-sheet/);
  assert.match(appJs,/delivered-order-card/);
  assert.match(appJs,/pending-order-card/);
  assert.match(appJs,/debt-customer-row/);
  assert.match(appJs,/suppressClick/i);
});

test('customer RPC payload strips cost and profit fields before data reaches the browser',()=>{
  assert.match(migrations,/customer_privacy/i);
  assert.match(migrations,/taphoa_role[^\n]*admin|admin[^\n]*taphoa_role/i);
  assert.match(migrations,/input_price|unit_cost|tongVon|loiNhuan/i);
  assert.match(migrations,/jsonb_build_object|jsonb_strip_nulls/i);
});
