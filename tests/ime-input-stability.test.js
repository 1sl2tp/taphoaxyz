import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8');

function handlerBody(source,name='onInput'){
  const match=source.match(new RegExp(`const ${name}=event=>\\{([\\s\\S]*?)\\n  \\};`));
  assert.ok(match,`${name} handler not found`);
  return match[1];
}

test('sales search does not replace the active input while typing',()=>{
  const source=read('src/screens/sales.js');
  const input=handlerBody(source);
  assert.doesNotMatch(input,/data-sales-search[\s\S]{0,220}render\(\)/);
  assert.match(source,/refreshSalesSearchResults/);
});

test('delivered search does not replace the active input while typing',()=>{
  const source=read('src/screens/delivered.js');
  const input=handlerBody(source);
  assert.doesNotMatch(input,/data-delivered-search[\s\S]{0,260}render\(\)/);
  assert.match(source,/refreshDeliveredSearchResults/);
  assert.doesNotMatch(input,/setSelectionRange/);
});

test('debt customer query does not replace the active input while typing',()=>{
  const source=read('src/screens/debt.js');
  const input=handlerBody(source);
  assert.doesNotMatch(input,/data-customer-query[\s\S]{0,260}render\(\)/);
  assert.match(source,/refreshDebtCustomerOptions/);
  assert.doesNotMatch(input,/setSelectionRange/);
});
