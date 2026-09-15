import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const debt=read('src/screens/debt.js');
const css=read('src/styles/classic.css');

test('Debt preserves its existing share targets and restores classic receipt/table surfaces',()=>{
  assert.match(debt,/data-debt-share-target/);
  assert.match(debt,/data-order-share-target/);
  assert.match(debt,/data-debt-share/);
  assert.match(debt,/data-order-share/);
  assert.match(css,/\.debt-receipt/);
  assert.match(css,/\.debt-ledger-head/);
  assert.match(css,/\.debt-order-head/);
});

test('Debt keeps the classic summary, quick form, customer rows and detail panels',()=>{
  assert.match(debt,/class="debt-total-row"/);
  assert.match(debt,/class="debt-quick"/);
  assert.match(debt,/class="debt-customer-row"/);
  assert.match(debt,/class="debt-detail-panel"/);
  assert.match(css,/\.debt-total-row/);
  assert.match(css,/\.debt-quick/);
  assert.match(css,/\.debt-detail-panel/);
});

test('Account sheet follows classic white-card and blue-avatar styling',()=>{
  assert.match(css,/\.account-sheet-card[^{]*\{[^}]*background:#fff/s);
  assert.match(css,/\.account-sheet-avatar[^{]*\{[^}]*classic-blue-light/s);
});
