import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('dark action controls force readable white text and SVG icons in Safari',async()=>{
  const foundation=await read('src/styles/tailwind/foundation.css');
  const sales=await read('src/styles/taphoa-sales-redesign.css');
  const orders=await read('src/styles/tailwind/orders.css');
  assert.match(foundation,/\.ui-action-primary\{[^}]*color:#fff!important;[^}]*-webkit-text-fill-color:#fff!important/s);
  assert.match(foundation,/\.ui-action-primary \.ui-icon[^}]*color:#fff!important/s);
  assert.match(sales,/\.sales-group-rail \.sales-group\[aria-pressed="true"\]\{[^}]*color:#fff!important;[^}]*-webkit-text-fill-color:#fff!important/s);
  assert.match(sales,/\.sales-qty button:last-child\{[^}]*color:#fff!important;[^}]*-webkit-text-fill-color:#fff!important/s);
  assert.match(sales,/\.sales-qty button:last-child \.ui-icon\{[^}]*color:#fff!important/s);
  assert.match(orders,/\.delivered-time button\[aria-pressed="true"\]\{[^}]*color:#fff!important;[^}]*-webkit-text-fill-color:#fff!important/s);
  assert.match(orders,/\.delivered-time button\[aria-pressed="true"\] \.ui-icon\{[^}]*color:#fff!important;[^}]*stroke:currentColor!important/s);
  assert.match(orders,/\.delivered-days button\[aria-pressed="true"\]\{[^}]*color:#fff!important;[^}]*-webkit-text-fill-color:#fff!important/s);
});
