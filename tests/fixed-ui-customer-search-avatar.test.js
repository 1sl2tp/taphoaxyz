import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const markup5 = fs.readFileSync(path.join(root, 'src', 'fixed-ui-markup-5.js'), 'utf8');
const runtime6 = fs.readFileSync(path.join(root, 'src', 'fixed-ui-runtime-6.js'), 'utf8');
const bridge = fs.readFileSync(path.join(root, 'src', 'fixed-production-bridge.js'), 'utf8');
const migrations = fs.readdirSync(path.join(root, 'supabase', 'migrations'))
  .filter(name => name.endsWith('.sql'))
  .map(name => fs.readFileSync(path.join(root, 'supabase', 'migrations', name), 'utf8'))
  .join('\n');

test('customer selector has realtime accent-insensitive search shared by sales and debt', () => {
  assert.match(markup5, /id=\\?"customerSearchInput\\?"/);
  assert.match(markup5, /oninput=\\?"renderCustomerList\(\)\\?"/);
  assert.match(runtime6, /customerSearchInput/);
  assert.match(runtime6, /normalizeSearchText\s*\(/,
    'customer search must reuse accent-insensitive normalization');
  assert.match(runtime6, /filter\s*\(/,
    'customer selector must filter locally while typing');
});

test('customer avatar flows from v21 account data through frontend rows into selector UI', () => {
  assert.match(bridge, /avatar_path|avatar_url|avatar/,
    'customer sheet rows must carry an avatar field');
  assert.match(bridge, /function customerAvatarUrl\s*\(/,
    'storage avatar paths must be resolved into browser-safe URLs');
  assert.match(bridge, /storage\/v1\/object\/public\/v21-avatars/,
    'customer avatar resolver must use the shared public avatar bucket');
  assert.match(bridge, /CONFIG\.supabaseUrl/,
    'customer avatar URL must come from the shared Supabase configuration');
  assert.match(runtime6, /customer-avatar/,
    'customer rows must render an avatar or fallback');
  assert.match(runtime6, /kh\[5\]/,
    'customer avatar must use the appended customer row field without shifting existing role index');
  assert.match(migrations, /'avatar'\s*,\s*nullif\(a\.avatar_path\s*,\s*''\)/i,
    'customer frontend RPC must expose v21 avatar_path');
  assert.match(migrations, /taphoa_bump_customers_revision_from_v21_accounts[\s\S]*values\s*\(\s*'customers'\s*,\s*1\s*,\s*now\(\)\s*\)[\s\S]*on conflict\s*\(\s*domain\s*\)\s*do update[\s\S]*revision\s*=\s*public\.taphoa_revisions\.revision\s*\+\s*1/i,
    'customer/account changes must bump the customers revision so open web sessions refresh');
});
