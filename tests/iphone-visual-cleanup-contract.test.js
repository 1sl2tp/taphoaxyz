import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8');

test('sales cart keeps compact copy while Tailwind owns semantic edit actions',()=>{
  const sales=read('src/screens/sales.js');
  const runtime=read('src/core/ui-system.js');
  const css=read('src/styles/taphoa-tailwind.input.css');
  assert.match(sales,/\$\{totals\.totalQty\} SP · \$\{money\(totals\.total\)\}/);
  assert.match(sales,/placeholder="Ghi chú"/);
  assert.doesNotMatch(runtime,/replaceChildren\(\)|uiCompact/);
  assert.match(css,/\[data-sales-action="update"\][^}]*bg-zinc-900/s);
  assert.match(css,/\[data-sales-action="clear"\][^}]*var\(--tap-danger\)/s);
});

test('pending cards lead with readable customer and compact order context in source markup',()=>{
  const pending=read('src/screens/pending.js');
  const runtime=read('src/core/ui-system.js');
  const css=read('src/styles/taphoa-th3.css');
  assert.doesNotMatch(runtime,/function decoratePendingCards/);
  assert.match(pending,/pending-order-top[^`]*tenKH/s);
  assert.match(pending,/compactOrderId\(order\.id\)/);
  assert.match(css,/pending-order-top b\{[^}]*font-size:15px/s);
});

test('debt main uses separate information and action zones instead of a gradient/card stack',()=>{
  const css=read('src/styles/taphoa-tailwind.input.css');
  assert.match(css,/\.debt-hero\s*\{[^}]*bg-tap-page/s);
  assert.match(css,/\.debt-total-row>div\s*\{[^}]*bg-white/s);
  assert.match(css,/\.debt-customer-row\s*\{[^}]*border-radius:0!important/s);
  assert.match(css,/\.debt-quick-actions\s*\{[^}]*grid-template-columns/s);
});

test('Tailwind is the final business layout owner before scroll ownership',()=>{
  const html=read('index.html');
  const tailwind=html.indexOf('./src/styles/taphoa-tailwind.css');
  const scroll=html.indexOf('./src/styles/scroll-owner.css');
  assert.ok(tailwind>=0&&scroll>tailwind);
  assert.doesNotMatch(html,/src\/styles\/(?:sales|delivered|pending|debt)\.css/);
  assert.doesNotMatch(html,/iphone-visual-cleanup\.css/);
});
