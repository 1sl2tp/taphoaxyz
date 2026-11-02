import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
// SPEC-RUST-UI-PARITY-20261103: shared fixture set, production code is
// inspected and evaluated without altering live HTML, data, or permissions.
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const editor=read('src/fixed-ui-runtime-3.js');
const debt=read('src/fixed-ui-behavior.js');
const begin=editor.indexOf('function escapeProductEditorValue(value)');
const finish=editor.indexOf('document.addEventListener',begin);
assert(begin>=0&&finish>begin,'canonical JS escaping helper');
const escapeHtml=vm.runInNewContext('('+editor.slice(begin,finish).trim()+')');
const line=debt.split('\n').find(x=>x.includes('const orderId = /^D[GT][0-9]{1,12}$/i.test(rawOrderId)'));
assert(line,'canonical JS order navigation guard');
const orderId=vm.runInNewContext('(rawOrderId)=>{'+line+' return orderId; }');
const fixtures=read('rust/ui-boundary-check/fixtures/ui_cases.tsv')
 .split(/\r?\n/).filter(x=>x&&!x.startsWith('#'));
test('Rust pilot shares exact expected results with production JS functions',()=>{
 for(const row of fixtures){
  const columns=row.split('|');
  assert.equal(columns.length,3,row);
  const [kind,input,expected]=columns;
  const actual=kind==='escape'?escapeHtml(input):kind==='order'?(orderId(input)||'INVALID'):null;
  assert.notEqual(actual,null,'unknown fixture kind '+kind);
  assert.equal(actual,expected,kind+' input='+JSON.stringify(input));
 }
 assert(fixtures.length>=20,'meaningful common positive and negative fixtures');
});
