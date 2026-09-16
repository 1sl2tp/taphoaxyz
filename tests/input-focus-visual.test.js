import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const base=fs.readFileSync(new URL('../src/styles/base.css',import.meta.url),'utf8');
const foundation=fs.readFileSync(new URL('../src/styles/tailwind/foundation.css',import.meta.url),'utf8');
const sales=fs.readFileSync(new URL('../src/styles/tailwind/sales.css',import.meta.url),'utf8');

test('text entry controls never draw a focus outline or focus shadow',()=>{
  const css=`${base}\n${foundation}`;
  assert.match(css,/input:focus[^\{]*\{[^}]*outline:\s*none\s*!important[^}]*box-shadow:\s*none\s*!important/i);
  assert.match(css,/textarea:focus[^\{]*\{[^}]*outline:\s*none\s*!important[^}]*box-shadow:\s*none\s*!important/i);
  assert.match(css,/select:focus[^\{]*\{[^}]*outline:\s*none\s*!important[^}]*box-shadow:\s*none\s*!important/i);
});

test('sales search focus does not add a focus ring',()=>{
  const focusRule=sales.match(/\.sales-search-row>input:focus\{([^}]*)\}/)?.[1]||'';
  assert.doesNotMatch(focusRule,/box-shadow\s*:/i);
  assert.doesNotMatch(focusRule,/border-color\s*:/i);
});
