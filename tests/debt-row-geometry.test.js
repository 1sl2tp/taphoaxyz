import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const css=readFileSync(new URL('../src/styles/iphone-visual-cleanup.css',import.meta.url),'utf8');

test('debt customer rows lock a single vertical center axis on iPhone',()=>{
  assert.match(css,/\.debt-customer-row\{[^}]*min-height:64px[^}]*padding-block:0[^}]*align-items:center/s);
  assert.match(css,/\.debt-avatar,\[data-screen-id="debt"\] \.debt-customer-copy,\[data-screen-id="debt"\] \.debt-customer-row>strong\{[^}]*align-self:center/s);
});
