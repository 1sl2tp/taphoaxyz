import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8');

test('sales cart uses compact total summary and semantic edit actions',()=>{
  const js=read('src/screens/sales.js');
  const css=read('src/styles/sales.css');
  assert.match(js,/\$\{totals\.totalQty\} sp · \$\{money\(totals\.total\)\}/);
  assert.doesNotMatch(js,/placeholder="\.\.\."/);
  assert.match(css,/\[data-sales-action="cancel-edit"\][^{]*\{[^}]*var\(--ui-line\)/s);
  assert.match(css,/\[data-sales-action="update"\][^{]*\{[^}]*var\(--ui-primary\)/s);
});

test('pending cards lead with customer and compact order id',()=>{
  const js=read('src/screens/pending.js');
  assert.match(js,/const compactOrderId=/);
  assert.match(js,/pending-order-customer/);
  assert.match(js,/compactOrderId\(order\.id\)/);
  const card=js.slice(js.indexOf('function orderCard'),js.indexOf('function sourceDetailMarkup'));
  assert.ok(card.indexOf('pending-order-customer')<card.indexOf('compactOrderId(order.id)'));
});

test('debt screen uses neutral shared surfaces instead of a separate gradient app',()=>{
  const ui=read('src/styles/ui-system.css');
  const debt=read('src/styles/debt.css');
  assert.doesNotMatch(ui,/\[data-screen-id="debt"\] \.debt-hero\{[^}]*linear-gradient/s);
  assert.match(ui,/\[data-screen-id="debt"\] \.debt-hero\{[^}]*var\(--ui-page\)/s);
  assert.doesNotMatch(debt,/border-bottom:2px solid #222/);
  assert.match(debt,/\.debt-shop-avatar\{[^}]*width:40px;[^}]*height:40px/s);
});
