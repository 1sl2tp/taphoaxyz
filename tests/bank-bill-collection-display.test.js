import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const bridge=fs.readFileSync(new URL('../src/fixed-production-bridge.js',import.meta.url),'utf8');
const debtUI=fs.readFileSync(new URL('../src/fixed-ui-behavior.js',import.meta.url),'utf8');
const start=bridge.indexOf('function bankBillDisplayFromNote(');
const end=bridge.indexOf('\nfunction ledgerLabel(',start);
assert.ok(start>=0&&end>start,'bank bill display mapper must exist');
const display=new Function(bridge.slice(start,end)+'; return bankBillDisplayFromNote;')();

test('auto bill collection is labeled Thu chuyển khoản with bank and reference separate',()=>{
  const result=display('Tự động nhận bill chuyển khoản · TECHCOMBANK · FT26292079594993');
  assert.deepEqual(result,{label:'Thu chuyển khoản · Techcombank',reference:'FT26292079594993'});
  assert.equal(display('Thu tiền mặt'),null);
});

test('other banks share the same clear label policy without changing ledger numbers',()=>{
  assert.deepEqual(display('Tự động nhận bill chuyển khoản · VIETINBANK · 384K26ABCD'),{
    label:'Thu chuyển khoản · VietinBank',reference:'384K26ABCD'
  });
  assert.match(bridge,/if\(entryType==='collection'\)return bankBillDisplayFromNote\(note\)\?\.label\|\|note\|\|'Thu tiền'/);
  assert.match(bridge,/const billRef=entryType==='collection'\?/);
  assert.match(bridge,/\n      backendId,\n      billRef\n/);
});

test('debt popup shows small bank transaction reference independently of label',()=>{
  assert.match(debtUI,/billReference: String\(row\?\.\[9\] \|\| ''\)/);
  assert.match(debtUI,/Mã GD: \$\{billRef\}/);
  assert.match(debtUI,/break-all/);
  assert.match(debtUI,/h\.soTien\.toLocaleString\('vi-VN'\)/);
  assert.doesNotMatch(debtUI,/Math\.abs\(runningDebt\)\s*\/\s*1000/);
});

test('manual collection and debt PNG labels do not display units',()=>{
  assert.match(bridge,/kind==='collection'\?'SỐ TIỀN ĐÃ THU':'SỐ TIỀN GHI NỢ'/);
  assert.doesNotMatch(bridge,/SỐ TIỀN ĐÃ THU \(NGHÌN ĐỒNG\)/);
  assert.doesNotMatch(bridge,/SỐ TIỀN GHI NỢ \(NGHÌN ĐỒNG\)/);
});
