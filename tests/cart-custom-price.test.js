import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(path,'utf8');

async function cartPriceFunctions(){
  const source=await read('src/fixed-ui-behavior.js');
  const start=source.indexOf('function parseCartPriceInputValue(value)');
  const end=source.indexOf('function selectCartPriceInputValue(input)',start);
  assert.ok(start>=0&&end>start,'missing cart money formatter');
  const context=vm.createContext({});
  vm.runInContext(source.slice(start,end),context);
  return {parse:context.parseCartPriceInputValue,format:context.formatCartPriceInputValue};
}

test('cart displays literal Vietnamese unit prices with fraction commas',async()=>{
  const {parse,format}=await cartPriceFunctions();
  for(const [raw,expected,display] of [
    [129.5,129.5,'129,5'],[129.95,129.95,'129,95'],
    [129.5,129.5,'129,5'],[140,140,'140'],[233,233,'233'],
    [1000,1000,'1.000'],[1295,1295,'1.295'],
    [1295.5,1295.5,'1.295,5'],[6500,6500,'6.500'],
    ['129,5',129.5,'129,5'],['1.295,5',1295.5,'1.295,5'],
    ['1.000',1000,'1.000'],['1000',1000,'1.000'],
    ['0,5',0.5,'0,5']
  ]){
    assert.equal(parse(raw),expected,'parse '+raw);
    assert.equal(format(raw),display,'display '+raw);
  }
  assert.equal(format(parse('129,5')*5),'647,5');
  assert.equal(format(parse('129,95')*5),'649,75');
});

test('ambiguous dot-decimal or malformed pasted values never change a line price',async()=>{
  const {parse,format}=await cartPriceFunctions();
  for(const raw of ['129.5','1,295.5','1.29,5','abc','12 đ','-129,5']){
    assert.ok(Number.isNaN(parse(raw)),raw);
    assert.equal(format(raw),'');
  }
  assert.equal(parse('129,'),129,'trailing comma is safe while entering a fraction');
  assert.equal(format('1.000'), '1.000');
});

test('cart unit price editor uses decimal mobile keyboard and validates before saving',async()=>{
  const behavior=await read('src/fixed-ui-behavior.js');
  assert.match(behavior,/data-price-editor="cart"/);
  assert.match(behavior,/inputmode="decimal"/);
  assert.match(behavior,/onfocus="selectCartPriceInputValue\(this\)"/);
  assert.match(behavior,/oninput="previewCartPriceInput\(this\)"/);
  assert.match(behavior,/onblur="commitCartPriceEditor\(this\)"/);
  assert.match(behavior,/if \(!Number\.isFinite\(price\)\) return;/);
  assert.match(behavior,/input\.value = raw\.endsWith\(','\) \? formatted \+ ',' : formatted;/);
  assert.match(behavior,/!Number\.isFinite\(parseCartPriceInputValue\(input\.value\)\)/);
  assert.match(behavior,/bg-transparent border-0 outline-none focus:outline-none focus:ring-0/);
});

test('cart custom price remains authoritative when quantity changes and order save keeps item.price',async()=>{
  const behavior=await read('src/fixed-ui-behavior.js');
  const overrides=await read('src/fixed-production-overrides.js');
  assert.match(behavior,/existingPrice[\s\S]*existing\.price/);
  assert.match(overrides,/gia:Number\(item\.price\)\|\|0/);
});

test('other money views use numeric vi-VN formatting, without re-parsing formatted strings',async()=>{
  const paths=['src/fixed-ui-runtime-4.js','src/fixed-ui-runtime-6.js',
    'src/fixed-ui-runtime-10.js','src/fixed-ui-runtime-13.js',
    'src/fixed-ui-cart-share-v3.js'];
  for(const path of paths){
    const source=await read(path);
    assert.match(source,/\.toLocaleString\('vi-VN'/,path);
    assert.doesNotMatch(source,/\.replace\(\/\\D\/g,\s*''\)/,path);
  }
});
