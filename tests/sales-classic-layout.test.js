import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const source=read('src/screens/sales.js');
const geometryCss=read('src/styles/sales.css')+read('src/styles/classic.css');
const finalCss=read('src/styles/chatgpt-ui.css');
const uiSystem=read('src/core/ui-system.js');

test('Sales keeps classic geometry while shared neutral UI owns search visuals',()=>{
  assert.match(source,/class="sales-customer-row"/);
  assert.match(source,/class="sales-search-row"/);
  assert.match(source,/class="sales-groups"/);
  assert.match(source,/class="sales-workspace"/);
  assert.match(source,/class="sales-cart-desktop"/);
  assert.match(geometryCss,/\.sales-customer-row[^}]*linear-gradient\(135deg,var\(--classic-blue\),var\(--classic-teal\)\)/s);
  assert.doesNotMatch(geometryCss,/\.sales-search-row::before[^}]*content:\s*"🔍"/s);
  assert.match(finalCss,/\.sales-search-row::before[^}]*content:\s*none/s);
  assert.match(uiSystem,/ui-search-leading-icon/);
  assert.match(uiSystem,/icon\('search'/);
  assert.match(geometryCss,/grid-template-columns:minmax\(0,1fr\) minmax\(360px,1fr\)/);
});

test('Sales typing keeps the same input node and only toggles mounted product rows',()=>{
  const branch=source.match(/if\(event\.target\.matches\('\[data-sales-search\]'\)\)\{([\s\S]*?)\n    \}/)?.[1]||'';
  assert.match(branch,/applySalesSearchVisibility\(root,state\)/);
  assert.doesNotMatch(branch,/render\(\)/);
  assert.doesNotMatch(branch,/innerHTML/);
  assert.doesNotMatch(branch,/\.focus\(/);
  assert.doesNotMatch(branch,/setSelectionRange/);
});
