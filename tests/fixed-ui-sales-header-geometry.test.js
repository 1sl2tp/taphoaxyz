import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('sales header keeps customer and cart symmetric around the time block',async()=>{
  const css=await readFile('src/fixed-ui-source-4.css','utf8');
  assert.match(css,/#tab-ban-hang\s*>\s*header\s*\{[\s\S]{0,220}grid-template-columns:minmax\(0,1fr\) auto minmax\(0,1fr\)\s*!important/);
  assert.match(css,/#tab-ban-hang\s*>\s*header\s*>\s*:first-child\s*\{[\s\S]{0,120}justify-self:start/);
  assert.match(css,/#tab-ban-hang\s*>\s*header\s*>\s*\.text-center\s*\{[\s\S]{0,240}justify-self:center/);
  assert.match(css,/#tab-ban-hang\s*>\s*header\s*>\s*:last-child\s*\{[\s\S]{0,120}justify-self:end/);
});
