import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const debt=fs.readFileSync(new URL('../src/fixed-ui-behavior.js',import.meta.url),'utf8');
const bridge=fs.readFileSync(new URL('../src/fixed-production-bridge.js',import.meta.url),'utf8');
const overrides=fs.readFileSync(new URL('../src/fixed-production-overrides.js',import.meta.url),'utf8');

test('debt detail retains backend ledger ID as visible proof of bank collection',()=>{
  assert.match(bridge,/text\(first\(tx,\['id','maGD','transaction_id'\]/);
  assert.match(debt,/ledgerId:\s*\/\^\\d\+\$\/.test\(String\(row\?\.\[0\]\|\|''\)\)/);
  assert.match(debt,/Sổ #\$\{ledgerId\}/);
  assert.match(debt,/Ghi sổ: \$\{h\.time\}/);
  assert.match(debt,/const isThu = h\.soTien < 0/);
  assert.match(debt,/h\.soTien\.toLocaleString\('vi-VN'\)/);
});

test('opening debt reads server ledger page instead of treating report status as payment',()=>{
  assert.match(overrides,/const detail=await prod\.debtLedger\(maKh,\{limit:50\}\)/);
  assert.match(overrides,/if\(!ownerCurrent\(\)\)return false;/,
    'late ledger responses cannot render after account changes');
  assert.match(overrides,/backend\(\)\.ledgerToRows\(detail\)/);
  assert.match(overrides,/renderCongNo\(\)/);
  assert.match(overrides,/Chưa tải được sổ nợ mới/);
  assert.match(overrides,/Không dùng dữ liệu cũ để xác nhận thu/);
  assert.match(overrides,/return false;/);
  assert.doesNotMatch(debt,/\*\s*1000/);
});
