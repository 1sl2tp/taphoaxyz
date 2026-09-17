import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const behavior=await readFile('src/fixed-ui-behavior.js','utf8');

test('order detail opened from debt stays layered above debt and closing it returns to debt',()=>{
  const match=behavior.match(/clickOrderFromDebt\s*=\s*function\(orderId\)\s*\{([\s\S]*?)\n\};/);
  assert.ok(match,'clickOrderFromDebt override must exist');
  const body=match[1];
  assert.doesNotMatch(body,/closeCustomerDebtModal\s*\(/);
  assert.match(body,/showOrderDetailMobile\(orderId,\s*sheetName\)/);
  assert.doesNotMatch(body,/loadOrderIntoCart\s*\(/);
});
