import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source=fs.readFileSync(new URL('../src/fixed-production-overrides.js',import.meta.url),'utf8');

test('draft promotion uses dedicated deliverOrder instead of re-saving the order',()=>{
  assert.match(source,/if\(isPromotingDraft\)\{[\s\S]*backend\(\)\.deliverOrder\(backendEditOrderId\)/);
  assert.match(source,/else\{[\s\S]*backend\(\)\.saveOrder\(\{maKH:String\(selectedCustomer\.id\),status/);
});

test('promotion refuses to operate without the real backend UUID',()=>{
  assert.match(source,/if\(isPromotingDraft&&!backendEditOrderId\)[\s\S]*refreshFixedSheets\(\['dontam'\]\)/);
  assert.match(source,/if\(isPromotingDraft&&!backendEditOrderId\)throw new Error\('Không tìm thấy ID database của đơn tạm\./);
});

test('successful order mutation is not reported as failed when UI refresh fails',()=>{
  assert.match(source,/async function refreshOrderUiAfterMutation\(\)/);
  assert.match(source,/catch\(refreshError\)\{\s*console\.warn\('refresh order UI after successful mutation'/);
  const block=source.match(/dayToanBoGioHang=async function\(tab\)\{[\s\S]*?\n  \};/)?.[0]||'';
  assert.match(block,/showToast\(/);
  assert.match(block,/await refreshOrderUiAfterMutation\(\)/);
});

test('order mutation prevents accidental concurrent double submit',()=>{
  assert.match(source,/let orderMutationInFlight=false/);
  assert.match(source,/if\(orderMutationInFlight\)return/);
  assert.match(source,/orderMutationInFlight=true/);
  assert.match(source,/orderMutationInFlight=false/);
});
