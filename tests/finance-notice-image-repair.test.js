import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const bridge=fs.readFileSync('src/fixed-production-bridge.js','utf8');
const production=fs.readFileSync('src/fixed-production-overrides.js','utf8');
const shell=fs.readFileSync('index.html','utf8');
const migration=fs.readFileSync('supabase/migrations/20261017140000_chat_test_finance_image_recovery.sql','utf8');

test('finance receipts are attached to the exact committed message without another payment',()=>{
  assert.match(bridge,/async function attachDebtNoticeImage\(result\)/);
  assert.match(bridge,/taphoa_debt_notice_image_ticket/);
  assert.match(bridge,/taphoa_debt_notice_image_attach/);
  assert.match(bridge,/if\(!ticket\?\.ok\)return/);
  assert.match(bridge,/storage\.from\('v21-media'\)\.upload/);
  assert.match(bridge,/const pngWidth=canvas\.width,pngHeight=canvas\.height/);
  assert.match(bridge,/void attachDebtNoticeImage\(result\)/);
  const repair=bridge.slice(bridge.indexOf('async function repairRecentFinanceImages('),bridge.indexOf('async function debtTransaction('));
  assert.match(repair,/username/);
  assert.match(repair,/!=='test'/);
  assert.match(repair,/repairRecentFinanceImagesAttempted/);
  assert.match(repair,/taphoa_test_finance_unattached_notices/);
  assert.match(repair,/await attachDebtNoticeImage\(receipt\)/);
  assert.doesNotMatch(repair,/business\.debtTransaction|taphoa_debt_transaction|setInterval|setTimeout/);
});

test('test-only backfill runs after explicit debt ledger open and is protected by admin and consent',()=>{
  assert.match(production,/const opened=fixedOpenCustomerDebtModal\(maKh\)/);
  assert.match(production,/repairRecentFinanceImages\?\.\(maKh\)/);
  assert.match(migration,/taphoa_role'<>'admin'/);
  assert.match(migration,/a\.username='test'/);
  assert.match(migration,/chat_outbound_allowed/);
  assert.match(migration,/cmd\.created_at>=now\(\)-interval '18 minutes'/);
  assert.match(migration,/NOT EXISTS \([\s\S]*?v21_media_assets/);
  assert.doesNotMatch(migration,/INSERT INTO (?:public\.)?taphoa_debt_ledger|INSERT INTO (?:public\.)?v21_messages/i);
  assert.match(shell,/finance-png=20261017d/);
  assert.match(shell,/finance-image-repair=20261017c/);
});
