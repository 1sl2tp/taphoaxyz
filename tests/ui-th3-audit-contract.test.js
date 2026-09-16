import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const index=read('index.html');
const ui=read('src/core/ui-system.js');
const entry=read('src/styles/taphoa-tailwind.entry.css');
const baseCss=read('src/styles/taphoa-tailwind.input.css');
const th3Css=read('src/styles/taphoa-th3.css');
const sales=read('src/screens/sales.js');
const delivered=read('src/screens/delivered.js');
const pending=read('src/screens/pending.js');
const debt=read('src/screens/debt.js');

test('Thẻ 3 ROOT: rendered markup owns hierarchy without semantic or structural post-render rewrites',()=>{
  assert.doesNotMatch(index,/src\/core\/semantic-ui\.js/);
  assert.doesNotMatch(ui,/decoratePendingCards|DETAIL_UI_CONFIG|replaceText\(/);
});

test('Thẻ 3 ROOT: Tailwind composes modules into one final visual output',()=>{
  assert.match(entry,/@import "\.\/taphoa-tailwind\.input\.css"/);
  assert.match(entry,/@import "\.\/taphoa-th3\.css"/);
  assert.match(baseCss,/@import "tailwindcss"/);
});

test('Thẻ 3 Sales: zero quantity keeps a fixed visible minus zero plus axis and customer row has no timestamp',()=>{
  assert.match(sales,/value="\$\{qty\}" aria-label="Số lượng/);
  assert.doesNotMatch(sales,/class="sales-time"/);
  assert.match(th3Css,/sales-qty button:disabled\{[^}]*visibility:visible[^}]*opacity:/s);
});

test('Thẻ 3 Sales: data zone is structural and only the table owns the visible frame',()=>{
  const zone=th3Css.match(/\.ui-zone-data\{([^}]*)\}/)?.[1]||'';
  assert.match(zone,/border:0/);
  assert.match(zone,/border-radius:0/);
  assert.match(baseCss,/\.ui-table\{[^}]*border:1px solid var\(--tap-line\)/s);
});

test('Thẻ 3 Delivered: customer is primary, section copy is concise, detail header owns share and close',()=>{
  assert.match(delivered,/delivered-order-top[^`]*tenKH/s);
  assert.match(delivered,/delivered-order-mid[^`]*compactOrderId|compactOrderId[^`]*delivered-order-mid/s);
  assert.doesNotMatch(delivered,/Tổng hợp đã giao/);
  assert.match(delivered,/<strong>Đơn đã giao<\/strong>/);
  assert.match(delivered,/ui-popup-header[^`]*data-receipt-share[^`]*data-detail-close/s);
});

test('Thẻ 3 Pending: customer-first markup is native and source/detail/print language is final',()=>{
  assert.match(pending,/pending-order-top[^`]*tenKH/s);
  assert.doesNotMatch(pending,/Tổng hợp đơn tạm/);
  assert.match(pending,/<strong>Đơn tạm<\/strong>/);
  assert.match(pending,/data-source-action="total">Gộp SP<\/button>/);
  assert.doesNotMatch(pending,/\+\$\{items\.length-3\} sp/);
});

test('Thẻ 3 Debt: grocery wording is concise and Ghi nợ is semantic debt not destructive',()=>{
  assert.match(debt,/>Còn nợ</);
  assert.match(debt,/>Dư tiền</);
  assert.match(debt,/>Thu \/ ghi nợ</);
  assert.match(debt,/groupMarkup\('Hết nợ'/);
  assert.doesNotMatch(debt,/data-quick-action="debt"[^>]*ui-action-danger/);
  assert.doesNotMatch(debt,/data-detail-action="debt"[^>]*ui-action-danger/);
  assert.match(debt,/ui-action-debt/);
  assert.match(th3Css,/\.ui-action-debt\{/);
});

test('Thẻ 3 Debt: customer row prioritizes debt age rather than exact transaction timestamp',()=>{
  const customerRow=debt.match(/function customerRow\(row\)\{([\s\S]*?)\n\}/)?.[1]||'';
  assert.doesNotMatch(customerRow,/GD cuối:/);
  assert.match(customerRow,/Nợ.*ngày/);
});

test('Thẻ 3 popups: print headers use title-left with right action cluster and scrolling gutters are stable',()=>{
  assert.match(delivered,/delivered-print-panel[^`]*<strong>[^<]+<\/strong><div class="ui-action-group">[^`]*data-print-now[^`]*data-print-close/s);
  assert.match(pending,/pending-print-panel[^`]*<strong>[^<]+<\/strong><div class="ui-action-group">[^`]*data-print-now[^`]*data-print-close/s);
  assert.match(th3Css,/scrollbar-gutter:stable/);
});

test('Thẻ 3 shell: login and account actions use the final semantic action system',()=>{
  assert.doesNotMatch(index,/Quản lý đơn hàng thông minh/);
  assert.doesNotMatch(index,/Đăng nhập →/);
  assert.match(index,/account-logout ui-action ui-action-danger/);
});
