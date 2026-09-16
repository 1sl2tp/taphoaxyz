import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const source=read('src/screens/sales.js');
const salesCss=read('src/styles/taphoa-sales-redesign.css');

test('Sales V2 owns visible hierarchy without changing the MAIN to cart flow',()=>{
  for(const role of ['sales-main-context','sales-customer-bar','sales-search-tools','sales-group-rail','sales-products-region','sales-price-stack','sales-cart-header-copy','sales-cart-summary']){
    assert.ok(source.includes(role),`missing Sales V2 role ${role}`);
  }
  assert.match(source,/sales-cart-overlay/);
  assert.match(salesCss,/TAPHOA_SALES_LAYOUT_V2/);
  assert.match(salesCss,/\.sales-main-context[^}]*background:transparent[^}]*border:0/s);
  assert.match(salesCss,/\.sales-product-list[^}]*border:0[^}]*border-radius:0/s);
  assert.match(salesCss,/@media\s*\(max-width:479px\)[\s\S]*grid-template-areas:"name total" "price qty"/s);
});

test('Sales typing keeps the same input node and only toggles mounted product rows',()=>{
  const branch=source.match(/if\(event\.target\.matches\('\[data-sales-search\]'\)\)\{([\s\S]*?)\n    \}/)?.[1]||'';
  assert.match(branch,/applySalesSearchVisibility\(root,state\)/);
  assert.doesNotMatch(branch,/render\(\)/);
  assert.doesNotMatch(branch,/innerHTML/);
  assert.doesNotMatch(branch,/\.focus\(/);
  assert.doesNotMatch(branch,/setSelectionRange/);
});

test('Sales customer selector follows V75 one-band root geometry',()=>{
  assert.match(source,/sales-customer-input/);
  assert.doesNotMatch(source,/sales-customer-field"><small>Khách<\/small>/);
  assert.match(salesCss,/\.sales-customer-bar\{[^}]*--sales-context-control-h:48px[^}]*grid-template-columns:minmax\(0,1fr\) auto[^}]*background:transparent[^}]*border:0/s);
  assert.match(salesCss,/\.sales-customer-field\{[^}]*height:var\(--sales-context-control-h\)[^}]*border:1px solid var\(--tap-line\)/s);
  assert.match(salesCss,/\.sales-cart-quick\{[^}]*display:flex[^}]*height:var\(--sales-context-control-h\)/s);
  assert.match(salesCss,/@media\s*\(max-width:479px\)[\s\S]*\.sales-customer-bar\{--sales-context-control-h:46px;gap:6px\}/s);
});