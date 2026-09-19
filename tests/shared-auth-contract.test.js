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


test('post-login refresh cannot turn a valid session into a login failure',()=>{
  const runtime=fs.readFileSync(new URL('../src/fixed-production-overrides.js',import.meta.url),'utf8');
  assert.match(runtime,/info=await backend\(\)\.login\(username,password\)/);
  assert.match(runtime,/showAppScreen\(\);[\s\S]{0,220}showToast\('Đăng nhập thành công\.'/);
  const postRefresh=runtime.match(/catch\(error\)\{\s*console\.error\('post-login refresh'[\s\S]*?\n\s*\}/)?.[0]||'';
  assert.doesNotMatch(postRefresh,/showLoginScreen\(\)/);
});

test('restore keeps a valid session even if UI refresh fails',()=>{
  const runtime=fs.readFileSync(new URL('../src/fixed-production-overrides.js',import.meta.url),'utf8');
  assert.match(runtime,/info=await backend\(\)\.restore\(\)/);
  assert.match(runtime,/if\(!info\)\{\s*showLoginScreen\(\);\s*return;\s*\}/);
  assert.match(runtime,/showAppScreen\(\);\s*try\{\s*await refreshFixedSheets\(\);\s*\}catch\(error\)\{\s*console\.error\('post-restore refresh'/);
});
