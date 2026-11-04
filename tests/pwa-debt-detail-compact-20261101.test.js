import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

// SPEC-DEBT-DETAIL-SHEET-DENSITY-20261101
// Given a 320-428px iPhone debt sheet with a long cycle + ledger, when
// opening customer debt, then the opening balance uses one compact row,
// cycle warning/history remain accessible, transaction rows save space,
// and the input has a visible label with 16px iOS-safe font.
// MUST-STAY: ledger figures, timestamps, customer rights, native PNG
// share, pagination scroll owner and both 44px financial action buttons.
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const markup=read('src/fixed-ui-markup-4.js');
const style=read('src/fixed-ui-debt-popup.css');
const cycles=read('src/fixed-ui-debt-cycles.css');
const ledger=read('src/fixed-ui-runtime-12.js');
const cycleRuntime=read('src/fixed-ui-debt-cycles.js');
const pagination=read('src/fixed-ui-debt-pagination.js');
const page=read('index.html');

test('modal keeps the same amount input and both financial actions; visible label is bound to input',()=>{
  let html='';
  vm.runInNewContext(markup,{document:{write:s=>{html+=s;}}},{timeout:1000});
  assert.match(html, /id="customerDebtBottomSheet"/);
  assert.match(html, /id="customerDebtContentToShare"/);
  assert.match(html, /class="debt-popup-amount-wrap"/);
  assert.match(html, /<label class="debt-popup-amount-label" for="popupDebtAmount">Số tiền<\/label>/);
  assert.match(html, /id="popupDebtAmount" inputmode="numeric"/);
  assert.match(html, /onclick="submitPopupDebt\('thu'\)"/);
  assert.match(html, /onclick="submitPopupDebt\('no'\)"/);
  for(const id of ['popupDebtAmount','cDebtModalHistoryList','cDebtModalName']){
    assert.equal(html.split('id="'+id+'"').length-1,1,'single '+id);
  }
});

test('mobile style gains vertical room, but preserves independent scroll and iOS-safe monetary controls',()=>{
  const part=style.slice(style.indexOf('SPEC-DEBT-DETAIL-SHEET-DENSITY-20261101'));
  assert.ok(part.startsWith('SPEC-DEBT-DETAIL-SHEET-DENSITY-20261101'));
  assert.match(part, /@media \(max-width:767px\)/);
  assert.match(part, /body:not\(\.pc-mode\):not\(\[data-force-pc="1"\]\)/);
  assert.match(part, /height:90% !important/);
  assert.match(part, /#customerDebtContentToShare > div:first-child > div/);
  assert.match(part, /justify-content:space-between/);
  assert.match(part, /#cDebtModalHistoryList/);
  assert.match(part, /overflow-wrap:anywhere/);
  assert.match(part, /#popupDebtAmount\{[\s\S]*?min-height:48px;[\s\S]*?font-size:16px !important/);
  assert.match(part, /button\[onclick\^="submitPopupDebt\("\]\{[\s\S]*?min-height:44px/);
  assert.doesNotMatch(part, /overflow-y:hidden|display:none|visibility:hidden/);
  assert.match(style, /#customerDebtBottomSheet #cDebtModalHistoryList\{[\s\S]*?min-height:0/);
  assert.match(pagination,/list\.addEventListener\('scroll'/);
});

test('cycle information and both disclosures remain intact while spacing becomes compact',()=>{
  const c=cycles.slice(cycles.indexOf('SPEC-DEBT-CYCLE-DETAIL-DENSITY-20261101'));
  assert.ok(c.startsWith('SPEC-DEBT-CYCLE-DETAIL-DENSITY-20261101'));
  assert.match(c, /\.debt-cycle-detail\{[\s\S]*?padding:8px 14px 7px/);
  assert.match(c, /\.debt-cycle-advice > summary\{[\s\S]*?min-height:32px/);
  assert.match(c, /\.debt-cycle-history-title\{[\s\S]*?min-height:32px/);
  assert.match(cycleRuntime,/briefCycleStatus\(current\)/);
  assert.match(cycleRuntime,/Hạn '\+dayLabel\(current\.policyDueDay\)/);
  assert.match(cycleRuntime,/const advice=document\.createElement\('details'\)/);
  assert.match(cycleRuntime,/const details=document\.createElement\('details'\)/);
  assert.match(cycleRuntime,/Theo dõi mốc từng đơn và đợt công nợ/);
});

test('ledger details, share source and finance commands stay untouched',()=>{
  for(const content of [
    'h.soTien.toLocaleString',
    'h.currentDebt.toLocaleString',
    'escapeProductEditorValue(h.time)',
    "clickOrderFromDebt(orderId)"
  ])assert.ok(ledger.includes(content),content);
  assert.match(ledger, /const source = document.getElementById\('customerDebtContentToShare'\)/);
  assert.match(page,/fixed-ui-debt-popup\.css/);
  assert.match(page,/fixed-ui-debt-cycles\.css/);
});
