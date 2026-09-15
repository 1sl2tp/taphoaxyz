import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const source=read('src/screens/sales.js');
const css=read('src/styles/sales.css')+read('src/styles/classic.css');

test('Sales restores the classic seller strip search pills and desktop split',()=>{
  assert.match(source,/class="sales-customer-row classic-seller-strip"/);
  assert.match(source,/class="sales-search-icon"[^>]*>🔍</);
  assert.match(source,/class="sales-groups"/);
  assert.match(source,/class="sales-workspace"/);
  assert.match(source,/class="sales-cart-desktop"/);
  assert.match(css,/grid-template-columns:minmax\(0,1fr\) minmax\(360px,1fr\)/);
});

test('Sales typing keeps the same input node and only toggles mounted product rows',()=>{
  const branch=source.match(/if\(event\.target\.matches\('\[data-sales-search\]'\)\)\{([\s\S]*?)\n    \}/)?.[1]||'';
  assert.match(branch,/applySalesSearchVisibility\(root,state\)/);
  assert.doesNotMatch(branch,/render\(\)/);
  assert.doesNotMatch(branch,/innerHTML/);
  assert.doesNotMatch(branch,/\.focus\(/);
  assert.doesNotMatch(branch,/setSelectionRange/);
});
