import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const runtime2=await readFile('src/fixed-ui-runtime-2.js','utf8');
const behavior=await readFile('src/fixed-ui-behavior.js','utf8');

test('choosing a source for an editor row persists that row before closing the picker',()=>{
  assert.match(runtime2,/async\s+function\s+chooseProductEditorSource\(source\)/);
  assert.match(runtime2,/const\s+selectedRow\s*=\s*productEditorSourcePickerRow/);
  assert.match(runtime2,/await\s+window\.saveProductEditorRow\(selectedRow\)/);
  assert.match(runtime2,/await\s+window\.saveProductEditorRow\(selectedRow\)[\s\S]{0,500}closeProductEditorSourcePicker\(\)/);
});

test('order detail opened from debt stays layered above debt and closing it returns to debt',()=>{
  const match=behavior.match(/clickOrderFromDebt\s*=\s*function\(orderId\)\s*\{([\s\S]*?)\n\};/);
  assert.ok(match,'clickOrderFromDebt override must exist');
  const body=match[1];
  assert.doesNotMatch(body,/closeCustomerDebtModal\s*\(/);
  assert.match(body,/showOrderDetailMobile\(orderId,\s*sheetName\)/);
  assert.doesNotMatch(body,/loadOrderIntoCart\s*\(/);
});
