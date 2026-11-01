import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../admin-gia.html',import.meta.url),'utf8');
const from=source.indexOf('    const num=value=>');
const to=source.indexOf('    const pretty=value=>',from);
assert.ok(from>=0&&to>from);
const context=vm.createContext({});
vm.runInContext(source.slice(from,to)+'globalThis.numeric={num,editableNumber};',context);
const {num,editableNumber}=context.numeric;

test('Vietnamese money inputs use dot grouping and comma decimals',()=>{
 assert.equal(editableNumber('1.000'),1000);
 assert.equal(editableNumber('12.500'),12500);
 assert.equal(editableNumber('1.234.567,5'),1234567.5);
 assert.equal(editableNumber('0,75'),0.75);
 assert.equal(editableNumber('1.5'),1.5);
 assert.equal(editableNumber(' 1 000 '),1000);
 assert.equal(editableNumber('-1.000'),-1000);
});
test('invalid price text is rejected rather than silently converted into a different amount',()=>{
 for(const text of ['1.00.0','1,000,5','12.34.567','1abc','1.000.00'])
   assert.equal(editableNumber(text),null,text);
 assert.equal(editableNumber(''),null);
});
test('data values from Supabase still use decimal numeric parsing; percentages do not get group interpretation',()=>{
 assert.equal(num('1.000'),1);
 assert.equal(num('1000.0000'),1000);
 assert.match(source,/key==='standard_profit_percent'\?num\(raw\):editableNumber\(raw\)/);
 assert.match(source,/id==='newStandard'\?num\(raw\):editableNumber\(raw\)/);
});
test('price edit preview and persisted payload use the same localized parser',()=>{
 assert.match(source,/const cost=editableNumber\(row\.querySelector\('\[data-field="cost"\]'\)\?\.value\)/);
 assert.match(source,/const retailOverride=retailInput\?\.dataset\.mode==='manual'\?editableNumber\(retailRaw\)/);
 assert.match(source,/const supplier=editableNumber\(read\('supplier_price'\)\)/);
 assert.match(source,/const cost=editableNumber\(\$\('newCost'\)\.value\)/);
});
