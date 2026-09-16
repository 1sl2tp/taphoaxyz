import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('Thẻ 4 geometry owner is the last visual geometry layer',async()=>{
  const entry=await read('src/styles/taphoa-tailwind.entry.css');
  assert.match(entry,/taphoa-th4-geometry\.css/);
  assert.ok(entry.lastIndexOf('taphoa-th4-geometry.css')>entry.lastIndexOf('taphoa-th2-auth.css'));
});

test('Sales price and cart columns follow left middle right geometry',async()=>{
  const css=await read('src/styles/taphoa-th4-geometry.css');
  assert.match(css,/--th4-unit-price-width\s*:\s*5ch/);
  assert.match(css,/--th4-total-width\s*:\s*7ch/);
  assert.match(css,/--th4-qty-width\s*:\s*3ch/);
  assert.match(css,/\.sales-price-item[^}]*text-align\s*:\s*right/);
  assert.match(css,/\.sales-qty[^}]*justify-self\s*:\s*center/);
  assert.match(css,/\.sales-cart-table-head[^}]*grid-template-columns\s*:/);
  assert.match(css,/\.sales-cart-line[^}]*grid-template-columns\s*:/);
});

test('numeric cells use tabular numbers and right alignment',async()=>{
  const css=await read('src/styles/taphoa-th4-geometry.css');
  assert.match(css,/font-variant-numeric\s*:\s*tabular-nums/);
  assert.match(css,/\.sales-cart-price[^}]*text-align\s*:\s*right/);
  assert.match(css,/\.sales-cart-line>strong[^}]*text-align\s*:\s*right/);
});
