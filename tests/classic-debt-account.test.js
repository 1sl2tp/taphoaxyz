import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const debt=read('src/screens/debt.js');
const classic=read('src/styles/classic.css');
const theme=read('src/styles/chatgpt-ui.css');

test('Debt preserves its existing share targets and classic receipt/table geometry',()=>{
  assert.match(debt,/data-debt-share-target/);
  assert.match(debt,/data-order-share-target/);
  assert.match(debt,/data-debt-share/);
  assert.match(debt,/data-order-share/);
  assert.match(classic,/\.debt-receipt/);
  assert.match(classic,/\.debt-ledger-head/);
  assert.match(classic,/\.debt-order-head/);
});

test('Debt keeps the existing summary, quick form, customer rows and detail geometry',()=>{
  assert.match(debt,/class="debt-total-row"/);
  assert.match(debt,/class="debt-quick"/);
  assert.match(debt,/class="debt-customer-row"/);
  assert.match(debt,/class="debt-detail-panel"/);
  assert.match(classic,/\.debt-total-row/);
  assert.match(classic,/\.debt-quick/);
  assert.match(classic,/\.debt-detail-panel/);
});

test('Account sheet final visual owner is neutral rather than classic blue',()=>{
  assert.match(theme,/\.account-sheet-card[^{]*\{[^}]*background:var\(--tap-surface\)/s);
  assert.match(theme,/\.account-sheet-avatar[^{]*\{[^}]*background:var\(--tap-surface-hover\)/s);
  assert.match(theme,/\.account-sheet-avatar[^{]*\{[^}]*color:var\(--tap-text-secondary\)/s);
});
