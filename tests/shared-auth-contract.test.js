import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const config=fs.readFileSync(new URL('../src/core/config.js',import.meta.url),'utf8');
const auth=fs.readFileSync(new URL('../src/core/auth.js',import.meta.url),'utf8');

test('TAPHOA runtime uses the shared V21 Supabase project with its own auth storage',()=>{
  assert.match(config,/https:\/\/gcnoahqsrquxkwkjbuxy\.supabase\.co/);
  assert.match(config,/sb_publishable_/);
  assert.match(config,/authStorageKey\s*:\s*['"]taphoa\.xyz\.auth\.v2['"]/);
  assert.match(config,/identityStorageKey\s*:\s*['"]taphoa\.identity\.v2['"]/);
  assert.doesNotMatch(config,/crdbhkdeqyehsbzgggbs|shop-auth/i);
});

test('login uses shared Chat credentials and TAPHOA access context',()=>{
  assert.match(auth,/signInWithPassword/);
  assert.match(auth,/@taphoa\.chat/);
  assert.match(auth,/taphoa_access_context/);
  assert.match(auth,/storageKey\s*:\s*config\.authStorageKey/);
  assert.doesNotMatch(auth,/shop_identities|shop-auth/i);
});

test('restore rechecks online access and stale identity hints cannot authorize',()=>{
  assert.match(auth,/taphoa_access_context/);
  assert.match(auth,/Tài khoản không có quyền vào Tạp hóa/);
  assert.doesNotMatch(auth,/offline\s*:\s*true|navigator\.onLine\s*===\s*false/);
});
