import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');
const UI_EMOJI=/[🛒✅⏳📝🗑️📦⚠️💚⚡💵📌🖼️✕]/u;

const TAILWIND_MODULES=[
  './tailwind/tokens.css',
  './tailwind/foundation.css',
  './tailwind/shell.css',
  './tailwind/sales.css',
  './tailwind/orders.css',
  './tailwind/debt.css',
  './tailwind/popups.css',
  './tailwind/responsive.css',
];

test('Tailwind retail source is modular and preserves semantic ownership',async()=>{
  const input=await read('src/styles/taphoa-tailwind.input.css');
  for(const modulePath of TAILWIND_MODULES){
    assert.ok(input.includes(`@import "${modulePath}";`),`missing Tailwind module import ${modulePath}`);
  }
  assert.doesNotMatch(input,/@theme\s*\{/,'input must not own theme tokens');
  assert.doesNotMatch(input,/@layer\s+(?:base|components)\s*\{/,'input must only compose modules');
  assert.doesNotMatch(input,/\[data-screen-id=/,'input must not own screen styles');

  const tokens=await read('src/styles/tailwind/tokens.css');
  const foundation=await read('src/styles/tailwind/foundation.css');
  const shell=await read('src/styles/tailwind/shell.css');
  const sales=await read('src/styles/tailwind/sales.css');
  const orders=await read('src/styles/tailwind/orders.css');
  const debt=await read('src/styles/tailwind/debt.css');
  const popups=await read('src/styles/tailwind/popups.css');
  const responsive=await read('src/styles/tailwind/responsive.css');

  for(const token of ['--tap-density:8','--tap-motion-fast:','--tap-motion-normal:','--tap-touch:44px','--tap-touch-lg:48px']){
    assert.ok(tokens.includes(token),`missing retail UX token ${token}`);
  }
  for(const selector of ['.ui-context','.ui-summary','.ui-table-head','.ui-form','.ui-action-group','.ui-action-secondary']){
    assert.match(foundation,new RegExp(`\\${selector.replace('.','.') }\\s*\\{`),`missing semantic component ${selector}`);
  }
  assert.match(shell,/\.app-nav\{/);
  assert.match(sales,/\[data-screen-id="sales"\]/);
  assert.doesNotMatch(sales,/\[data-screen-id="delivered"\]/);
  assert.match(orders,/\[data-screen-id="delivered"\]/);
  assert.match(orders,/\[data-screen-id="pending"\]/);
  assert.match(debt,/\[data-screen-id="debt"\]/);
  assert.match(popups,/\.delivered-detail-panel/);
  assert.match(popups,/\.debt-order-panel/);
  assert.match(responsive,/@media\s*\(prefers-reduced-motion:\s*reduce\)/);
});

test('business screen markup owns semantic roles directly instead of depending on a post-render skin',async()=>{
  const sales=await read('src/screens/sales.js');
  const delivered=await read('src/screens/delivered.js');
  const pending=await read('src/screens/pending.js');
  const debt=await read('src/screens/debt.js');

  assert.match(sales,/sales-screen ui-main/);
  assert.match(sales,/sales-pinned-head sales-main-context ui-context ui-toolbar/);
  assert.match(sales,/sales-customer-row sales-customer-bar/);
  assert.match(sales,/sales-search-row sales-search-tools/);
  assert.match(sales,/sales-groups sales-group-rail/);
  assert.match(sales,/sales-products sales-products-region ui-zone-data/);
  assert.match(sales,/sales-product-list ui-table/);
  assert.match(sales,/sales-product-row ui-row/);
  assert.match(sales,/sales-cart-panel[^"`]*ui-popup-l1/);

  assert.match(delivered,/delivered-screen ui-main/);
  assert.match(delivered,/delivered-filter ui-context ui-toolbar/);
  assert.match(delivered,/delivered-summary[^"`]*ui-summary/);
  assert.match(delivered,/delivered-list[^"`]*ui-table/);
  assert.match(delivered,/delivered-detail-panel[^"`]*ui-popup-l1/);
  assert.match(delivered,/delivered-print-panel[^"`]*ui-popup-l2/);

  assert.match(pending,/pending-screen ui-main/);
  assert.match(pending,/pending-summary[^"`]*ui-summary/);
  assert.match(pending,/pending-list[^"`]*ui-table/);
  assert.match(pending,/pending-detail-panel[^"`]*ui-popup-l1/);
  assert.match(pending,/pending-print-panel[^"`]*ui-popup-l2/);

  assert.match(debt,/debt-screen ui-main/);
  assert.match(debt,/debt-quick[^"`]*ui-form/);
  assert.match(debt,/debt-list[^"`]*ui-table/);
  assert.match(debt,/debt-detail-panel[^"`]*ui-popup-l1/);
  assert.match(debt,/debt-order-panel[^"`]*ui-popup-l2/);
});

test('business screen source contains no emoji UI glyphs',async()=>{
  for(const path of ['src/screens/sales.js','src/screens/delivered.js','src/screens/pending.js','src/screens/debt.js']){
    const source=await read(path);
    assert.doesNotMatch(source,UI_EMOJI,`${path} still contains UI emoji`);
  }
});

test('data rows remain rows while controls remain actions',async()=>{
  const semantic=await read('src/core/semantic-ui.js');
  assert.match(semantic,/Only true controls are actions/);
  assert.doesNotMatch(semantic,/ACTIONS\s*=\s*\[[\s\S]*data-order-open/);
  assert.doesNotMatch(semantic,/ACTIONS\s*=\s*\[[\s\S]*data-customer-open/);
});

test('redesign preserves current MAIN to popup flow and stable Sales search behavior',async()=>{
  const sales=await read('src/screens/sales.js');
  const delivered=await read('src/screens/delivered.js');
  const pending=await read('src/screens/pending.js');
  const debt=await read('src/screens/debt.js');

  assert.match(sales,/sales-cart-overlay/);
  assert.match(delivered,/delivered-overlay/);
  assert.match(pending,/pending-overlay/);
  assert.match(debt,/debt-overlay/);
  assert.match(sales,/if\(event\.target\.matches\('\[data-sales-search\]'\)\)[\s\S]*applySalesSearchVisibility\(root,state\)/);
  assert.doesNotMatch(sales,/if\(event\.target\.matches\('\[data-sales-search\]'\)\)[\s\S]{0,260}render\(\)/);
});