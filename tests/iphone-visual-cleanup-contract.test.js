import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8');

test('sales cart keeps compact copy while Tailwind owns semantic edit actions',()=>{
  const runtime=read('src/core/ui-system.js');
  const css=read('src/styles/taphoa-tailwind.input.css');
  assert.match(runtime,/SP ·/);
  assert.match(runtime,/setAttribute\('placeholder','Ghi chú'\)/);
  assert.match(css,/\[data-sales-action="update"\][^}]*bg-zinc-900/s);
  assert.match(css,/\[data-sales-action="clear"\][^}]*var\(--tap-danger\)/s);
});

test('pending cards lead with readable customer and compact order context',()=>{
  const runtime=read('src/core/ui-system.js');
  const css=read('src/styles/taphoa-tailwind.input.css');
  assert.match(runtime,/function decoratePendingCards/);
  assert.match(runtime,/pending-order-customer/);
  assert.match(runtime,/compactOrderId\(card\.dataset\.orderOpen\)/);
  assert.match(css,/\.pending-order-customer\s*\{[^}]*font-size:15px/s);
});

test('debt main uses separate information and action zones instead of a gradient/card stack',()=>{
  const css=read('src/styles/taphoa-tailwind.input.css');
  assert.match(css,/\.debt-hero\s*\{[^}]*bg-tap-page/s);
  assert.match(css,/\.debt-total-row>div\s*\{[^}]*bg-white/s);
  assert.match(css,/\.debt-customer-row\s*\{[^}]*border-radius:0!important/s);
  assert.match(css,/\.debt-quick-actions\s*\{[^}]*grid-template-columns/s);
});

test('Tailwind final owner loads after screen geometry and before scroll ownership',()=>{
  const html=read('index.html');
  const debt=html.indexOf('./src/styles/debt.css');
  const tailwind=html.indexOf('./src/styles/taphoa-tailwind.css');
  const scroll=html.indexOf('./src/styles/scroll-owner.css');
  assert.ok(debt>=0&&tailwind>debt&&scroll>tailwind);
  assert.doesNotMatch(html,/iphone-visual-cleanup\.css/);
});
