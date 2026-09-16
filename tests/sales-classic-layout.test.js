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

test('Sales customer selector is one compact row without a duplicated Khách label',()=>{
  assert.doesNotMatch(source,/sales-customer-field"><small>Khách<\/small>/);
  assert.match(source,/sales-customer-input/);
  assert.match(salesCss,/\.sales-customer-field\{[^}]*display:flex[^}]*align-items:center/s);
  assert.doesNotMatch(salesCss,/\.sales-customer-field>small/);
  assert.match(salesCss,/\.sales-customer-bar\{[^}]*min-height:52px/s);
});
