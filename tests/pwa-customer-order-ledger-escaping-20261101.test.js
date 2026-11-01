import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

// SPEC-DEBT-FILTER-HEADING-20261101: every debt group retains the heading.
// SPEC-DEBT-CARD-ESCAPE-20261101: customer/order labels cannot inject markup.
// MUST-STAY: sorting, ledger numbers, order data and native share unchanged.
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const debt=read('src/fixed-ui-runtime-11.js');
const drafts=read('src/fixed-ui-runtime-10.js');
const history=read('src/fixed-ui-runtime-12.js');
const css=read('src/fixed-ui-debt-popup.css');
const esc=read('src/fixed-ui-runtime-3.js');

test('debt filters keep the heading visible and suppress only irrelevant sorting',()=>{
  const begin=debt.indexOf('function setDebtFilter(filterType, btnElement)');
  assert.ok(begin>=0);
  const source=debt.slice(begin);
  assert.ok(source.includes('renderCongNo()'));
  assert.ok(!source.includes("sortContainer.style.display = 'none'"));
  assert.ok(!source.includes("sortContainer.style.display = 'flex'"));
  assert.ok(debt.includes("debtSortControl.hidden = currentDebtFilter !== 'no'"));
  assert.ok(css.includes('#tab-cong-no .debt-sort-control[hidden]{'));
  assert.ok(css.includes('#tab-cong-no .debt-sort-row:has(.debt-sort-control[hidden]){'));
  assert.ok(css.includes('min-height:24px;'));
  const buttons=Object.fromEntries(['btnFilterNo','btnFilterDu','btnFilterHet'].map(id=>[id,{className:''}]));
  const ctx={
    currentDebtFilter:'no',
    document:{getElementById:id=>buttons[id]},
    renderCongNo(){ctx.calls.push(ctx.currentDebtFilter);},
    calls:[]
  };
  vm.createContext(ctx);
  vm.runInContext(source,ctx,{timeout:1000});
  for(const [group,id] of [['no','btnFilterNo'],['du','btnFilterDu'],['het','btnFilterHet']]){
    ctx.setDebtFilter(group,buttons[id]);
    assert.equal(ctx.currentDebtFilter,group);
    assert.match(buttons[id].className,/bg-white/);
  }
  assert.deepEqual(ctx.calls,['no','du','het']);
});

test('customer cards escape names, dates, account identifiers and use dataset click',()=>{
  assert.ok(debt.includes('escapeProductEditorValue(c.maKh)'));
  assert.ok(debt.includes('openCustomerDebtModal(this.dataset.debtCustomerId)'));
  assert.ok(debt.includes('escapeProductEditorValue(c.name)'));
  assert.ok(debt.includes('escapeProductEditorValue(subText)'));
  assert.ok(!debt.includes("openCustomerDebtModal('"+String.fromCharCode(36)+"{c.maKh}')"));
});

test('pending and delivered order cards escape names, times and product previews',()=>{
  for(const code of [drafts,debt]){
    assert.ok(code.includes('escapeProductEditorValue(o.tenKh)'));
    assert.ok(code.includes('escapeProductEditorValue(shortTime)'));
    assert.ok(code.includes('escapeProductEditorValue(item)'));
    assert.ok(code.includes('clickOrder('));
  }
});

test('debt history escapes free-form entry description and datetime, not financial values',()=>{
  assert.ok(history.includes('escapeProductEditorValue(h.loaiGd)'));
  assert.ok(history.includes('escapeProductEditorValue(h.time)'));
  assert.ok(history.includes("h.soTien.toLocaleString('vi-VN')"));
  assert.ok(history.includes("h.currentDebt.toLocaleString('vi-VN')"));
});

test('HTML escaping preserves the text without creating tags',()=>{
  const begin=esc.indexOf('function escapeProductEditorValue(value)');
  const end=esc.indexOf('document.addEventListener',begin);
  assert.ok(begin>=0&&end>begin);
  const escape=vm.runInNewContext('('+esc.slice(begin,end).trim()+')');
  assert.equal(escape("Cô O'Brien & <Đơn mới>"),"Cô O'Brien &amp; &lt;Đơn mới&gt;");
  assert.equal(escape('Khách "An"'), 'Khách &quot;An&quot;');
});
