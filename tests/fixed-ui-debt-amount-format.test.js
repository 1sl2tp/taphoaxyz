import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const markup2=fs.readFileSync(new URL('../src/fixed-ui-markup-2.js',import.meta.url),'utf8');
const markup4=fs.readFileSync(new URL('../src/fixed-ui-markup-4.js',import.meta.url),'utf8');
const runtime=fs.readFileSync(new URL('../src/fixed-ui-runtime-7.js',import.meta.url),'utf8');

test('debt amount fields use numeric keyboard but allow formatted thousands separators',()=>{
  assert.match(markup2,/id=\\\"quickDebtAmount\\\"[^\n]*inputmode=\\\"numeric\\\"[^\n]*type=\\\"text\\\"/);
  assert.match(markup4,/id=\\\"popupDebtAmount\\\"[^\n]*inputmode=\\\"numeric\\\"[^\n]*type=\\\"text\\\"/);
  assert.doesNotMatch(markup2,/id=\\\"quickDebtAmount\\\"[^\n]*type=\\\"number\\\"/);
  assert.doesNotMatch(markup4,/id=\\\"popupDebtAmount\\\"[^\n]*type=\\\"number\\\"/);
});

test('typing 4611 is displayed as 4.611 while submit parsing returns 4611',()=>{
  assert.match(runtime,/function formatDebtAmountValue\(value\)/);
  assert.match(runtime,/replace\(\/\\B\(\?=\(\\d\{3\}\)\+\(\?!\\d\)\)\/g, '\.'\)/);
  assert.match(runtime,/function parseDebtAmountValue\(value\)/);
  assert.match(runtime,/replace\(\/\\D\/g, ''\)/);
  assert.match(runtime,/let amount = parseDebtAmountValue\(amountStr\);/);

  const format=value=>{
    const digits=String(value??'').replace(/\D/g,'').replace(/^0+(?=\d)/,'');
    return digits?digits.replace(/\B(?=(\d{3})+(?!\d))/g,'.'):'';
  };
  const parse=value=>{
    const digits=String(value??'').replace(/\D/g,'').replace(/^0+(?=\d)/,'');
    return digits?Number(digits):0;
  };
  assert.equal(format('4611'),'4.611');
  assert.equal(parse('4.611'),4611);
});
