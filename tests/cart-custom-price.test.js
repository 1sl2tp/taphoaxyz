import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(path,'utf8');

function extractFunction(source,name){
  const match=source.match(new RegExp(`function\\s+${name}\\s*\\([^)]*\\)\\s*\\{[^{}]*\\}`));
  assert.ok(match,`missing ${name}`);
  return match[0];
}

test('cart custom price formats 1000 as 1.000 and parses formatted values',async()=>{
  const behavior=await read('src/fixed-ui-behavior.js');
  const parseFn=extractFunction(behavior,'parseCartPriceInputValue');
  const formatFn=extractFunction(behavior,'formatCartPriceInputValue');
  const context={result:null};
  vm.runInNewContext(`${parseFn}\n${formatFn}\nresult=[formatCartPriceInputValue('1000'),parseCartPriceInputValue('1.000')];`,context);
  assert.deepEqual(Array.from(context.result),['1.000',1000]);
});

test('cart unit price is an invisible text editor that selects all on focus',async()=>{
  const behavior=await read('src/fixed-ui-behavior.js');
  assert.match(behavior,/data-price-editor="cart"/);
  assert.match(behavior,/inputmode="numeric"/);
  assert.match(behavior,/onfocus="selectCartPriceInputValue\(this\)"/);
  assert.match(behavior,/oninput="previewCartPriceInput\(this\)"/);
  assert.match(behavior,/onblur="commitCartPriceEditor\(this\)"/);
  assert.match(behavior,/bg-transparent border-0 outline-none focus:outline-none focus:ring-0/);
});

test('cart custom price remains authoritative when quantity changes and order save keeps item.price',async()=>{
  const behavior=await read('src/fixed-ui-behavior.js');
  const overrides=await read('src/fixed-production-overrides.js');
  assert.match(behavior,/existingPrice[\s\S]*existing\.price/);
  assert.match(overrides,/gia:Number\(item\.price\)\|\|0/);
});
