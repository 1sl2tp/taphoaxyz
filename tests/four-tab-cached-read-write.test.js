import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const load=path=>readFile(path,'utf8');

test('Bán hàng, Đơn tạm, Đã giao, Công nợ share one cached read owner',async()=>{
  const bridge=await load('src/fixed-production-bridge.js');
  const overrides=await load('src/fixed-production-overrides.js');
  const ui=await load('src/fixed-ui-runtime-4.js');
  const tabs=await load('src/fixed-ui-runtime-2.js');
  assert.ok(bridge.includes('snapshot.load(uid)'));
  assert.ok(bridge.includes("business.meta()"));
  assert.ok(bridge.includes("if(changed.length)await refresh(changed)"));
  assert.ok(overrides.includes("await Promise.all([...new Set(names)].map(name=>SheetDB.read(name)))"));
  assert.ok(ui.includes("document.querySelector('.tab-content.active')"));
  for(const name of ['tab-ban-hang','tab-don-tam','tab-da-giao','tab-cong-no'])
    assert.ok(ui.includes(name),'not routed '+name);
  for(const line of [
    "if (draft) renderDonTam();",
    "if (delivered) renderDaGiao();",
    "if (debt) renderCongNo();",
    "if (sales) { renderSourceTags(); renderProductList(); }"
  ])assert.ok(ui.includes(line),line);
  for(const line of [
    "if(tabId === 'tab-don-tam') renderDonTam();",
    "if(tabId === 'tab-da-giao') renderDaGiao();",
    "if(tabId === 'tab-cong-no') renderCongNo();"
  ])assert.ok(tabs.includes(line),'lazy selection '+line);
});

test('Save and collection wait for Supabase commit, but not for hidden tab rendering',async()=>{
  const bridge=await load('src/fixed-production-bridge.js');
  const overrides=await load('src/fixed-production-overrides.js');
  assert.ok(bridge.includes("await refresh(['orders','debt']);"));
  assert.ok(bridge.includes("await refresh(['debt']);"));
  const save=overrides.slice(overrides.indexOf('dayToanBoGioHang=async'),overrides.indexOf('submitQuickDebt=async'));
  const collect=overrides.slice(overrides.indexOf('submitQuickDebt=async'),overrides.indexOf('requestClearSheet=function'));
  assert.ok(save.includes("await backend().saveOrder("));
  assert.ok(save.includes("await backend().deliverOrder("));
  assert.ok(save.indexOf("hideLoading();")<save.indexOf("if(committed){"));
  assert.ok(save.indexOf("if(committed){")<save.indexOf("refreshOrderUiAfterMutation()"));
  assert.ok(collect.includes("await backend().debtTransaction("));
  assert.ok(collect.indexOf("hideLoading();")<collect.indexOf("if(committed){"));
  assert.ok(collect.indexOf("if(committed){")<collect.indexOf("SheetDB.read('thuchi')"));
  assert.ok(!collect.includes("if(activeDebtCustomerId)await openCustomerDebtModal"));
});

test('No extra HTTP polling or order/ledger mutation was introduced',async()=>{
  const ui=await load('src/fixed-ui-runtime-4.js');
  const overrides=await load('src/fixed-production-overrides.js');
  const core=await load('src/core/business.js');
  assert.ok(ui.includes("SheetDB.onChange(function(sheetName, data)"));
  assert.ok(overrides.includes("if(orderMutationInFlight)return"));
  assert.ok(core.includes("p_command_id:commandId()"));
  const listener=ui.slice(ui.indexOf('F-181:'),ui.indexOf('function normalizeSearchText'));
  assert.ok(!listener.includes('fetch('));
  assert.ok(!listener.includes('setInterval('));
});
