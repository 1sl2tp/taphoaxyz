import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const debt=read('src/screens/debt.js');
const css=read('src/styles/classic.css');

test('Debt uses the shared receipt sharing utility and classic receipt/table surfaces',()=>{
  assert.match(debt,/import \{shareReceiptImage\} from '\.\.\/core\/share-receipt\.js'/);
  assert.match(debt,/data-debt-share-target/);
  assert.match(debt,/data-order-share-target/);
  assert.match(css,/\.debt-receipt/);
  assert.match(css,/\.debt-ledger-head/);
  assert.match(css,/\.debt-order-head/);
});

test('Debt customer search keeps its input mounted while typing',()=>{
  const branch=debt.match(/if\(event\.target\.matches\('\[data-customer-query\]'\)\)\{([\s\S]*?)return;\}/)?.[1]||'';
  assert.match(branch,/applyDebtCustomerSearch\(root,state\)/);
  assert.doesNotMatch(branch,/render\(\)/);
  assert.doesNotMatch(branch,/\.focus\(/);
  assert.doesNotMatch(branch,/setSelectionRange/);
});

test('Account sheet follows classic white-card and blue-avatar styling',()=>{
  assert.match(css,/\.account-sheet-card[^{]*\{[^}]*background:#fff/s);
  assert.match(css,/\.account-sheet-avatar[^{]*\{[^}]*classic-blue-light/s);
});
