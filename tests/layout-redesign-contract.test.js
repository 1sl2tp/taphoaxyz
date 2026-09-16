import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {readTailwindSourceSync} from './helpers/tailwind-source.js';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('Tailwind is the only screen layout owner',async()=>{
  const html=await read('index.html');
  assert.doesNotMatch(html,/src\/styles\/(?:sales|delivered|pending|debt)\.css/);
  assert.match(html,/src\/styles\/taphoa-tailwind\.css/);
});

test('layout system separates shell main context data and popup surfaces',async()=>{
  const css=readTailwindSourceSync();
  for(const token of ['--tap-shell','--tap-main','--tap-context','--tap-data','--tap-popup','--tap-gutter','--tap-section-gap']){
    assert.ok(css.includes(token),`missing layout token ${token}`);
  }
  assert.match(css,/\.ui-main\s*\{[^}]*display:grid[^}]*gap:var\(--tap-section-gap\)/s);
  assert.match(css,/\.ui-zone-context\s*\{[^}]*background:var\(--tap-context\)/s);
  assert.match(css,/\.ui-zone-data\s*\{[^}]*background:var\(--tap-data\)/s);
  assert.match(css,/\.ui-popup-l1\s*\{[^}]*background:var\(--tap-popup\)/s);
  assert.match(css,/\.ui-popup-l2\s*\{[^}]*background:var\(--tap-popup\)/s);
});

test('business flows remain main to popup and Sales never becomes desktop split view',async()=>{
  const sales=await read('src/screens/sales.js');
  const delivered=await read('src/screens/delivered.js');
  const pending=await read('src/screens/pending.js');
  const debt=await read('src/screens/debt.js');
  const css=readTailwindSourceSync();
  assert.match(sales,/sales-cart-overlay/);
  assert.match(delivered,/delivered-overlay/);
  assert.match(pending,/pending-overlay/);
  assert.match(debt,/debt-overlay/);
  assert.match(css,/\.sales-cart-desktop\s*\{[^}]*display:none\s*!important/s);
  assert.doesNotMatch(css,/sales-workspace[^}]*grid-template-columns:\s*minmax\(0,1fr\)\s+minmax\(/s);
});

test('data collections read as tables and rows instead of card soup',async()=>{
  const css=readTailwindSourceSync();
  assert.match(css,/\.ui-table\s*\{[^}]*border-radius:var\(--tap-radius-section\)/s);
  assert.match(css,/\.ui-row\s*\{[^}]*border-radius:0[^}]*box-shadow:none/s);
  assert.match(css,/\.sales-product-row[^}]*border-radius:0/s);
  assert.match(css,/\.delivered-order-card[^}]*border-radius:0/s);
  assert.match(css,/\.pending-order-card[^}]*border-radius:0/s);
  assert.match(css,/\.debt-customer-row[^}]*border-radius:0/s);
});

test('popup level one and two have visibly different depth without changing navigation flow',async()=>{
  const css=readTailwindSourceSync();
  assert.match(css,/--tap-backdrop-l1:\s*rgba\(/);
  assert.match(css,/--tap-backdrop-l2:\s*rgba\(/);
  assert.match(css,/\.ui-popup-l1\s*\{[^}]*box-shadow:var\(--tap-shadow-popup\)/s);
  assert.match(css,/\.ui-popup-l2\s*\{[^}]*box-shadow:var\(--tap-shadow-l2\)/s);
  assert.match(css,/@media\s*\(max-width:767px\)[\s\S]*\.ui-popup-l1[^}]*border-radius:[^;]*0 0/s);
  assert.match(css,/@media\s*\(min-width:768px\)[\s\S]*\.ui-popup-l1[^}]*width:min\(92vw,760px\)/s);
});
