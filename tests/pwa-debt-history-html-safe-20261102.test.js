import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

// SPEC-TAPHOA-DEBT-HISTORY-HTML-SAFE-20261102
// Given ledger content with untrusted markup and quoted order IDs,
// when the live debt modal renders, text remains text, order click only
// accepts canonical DG/DT codes, and no financial values/data change.
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const source=read('src/fixed-ui-behavior.js');
const index=read('index.html');
const esc=read('src/fixed-ui-runtime-3.js');
const debtModal=read('src/fixed-ui-runtime-12.js');
const transitionStart=debtModal.indexOf('function nextCustomerDebtModalTransition(');
const transitionEnd=debtModal.indexOf('function openCustomerDebtModal(',transitionStart);
assert.ok(transitionStart>=0&&transitionEnd>transitionStart);
const start=source.indexOf('openCustomerDebtModal = function(maKh,');
const end=source.indexOf('// Page loader renders cached server data',start);
const escapeStart=esc.indexOf('function escapeProductEditorValue(value)');
const escapeEnd=esc.indexOf('document.addEventListener',escapeStart);
assert.ok(start>=0&&end>start&&escapeStart>=0&&escapeEnd>escapeStart);
const htmlEscape=vm.runInNewContext('('+esc.slice(escapeStart,escapeEnd).trim()+')');
function fixture(entry){
 const ids=['cDebtModalName','cDebtModalTotal','cDebtModalBalanceLabel',
  'cDebtModalHistoryList','customerDebtModalWrapper','customerDebtBottomSheet'];
 const el=Object.fromEntries(ids.map(id=>[id,{innerText:'',innerHTML:'',className:'',scrollTop:0,dataset:{},
  classList:{remove(){},add(){}}}]));
 const ctx={
  window:{customerDebtHistoryData:{sam:[entry]},customerDebtCurrentBalanceData:{sam:100}},
  appData:{khachhang:[['id','name'],['sam','C Sâm']]},
  document:{getElementById:id=>el[id]},
  hasPermission:()=>true,denyPermission(){throw Error('denied')},
  openCustomerDebtModal:null,activeDebtCustomerId:null,
  escapeProductEditorValue:htmlEscape,setTimeout(){},
 };
 vm.createContext(ctx);
 vm.runInContext(debtModal.slice(transitionStart,transitionEnd),ctx,{timeout:1000});
 vm.runInContext(source.slice(start,end),ctx,{timeout:1000});
 assert.equal(ctx.openCustomerDebtModal('sam'),undefined);
 assert.equal(ctx.activeDebtCustomerId,'sam');
 return el.cDebtModalHistoryList.innerHTML;
}
test('untrusted transaction labels/timestamps never become HTML or on-event attributes',()=>{
 const textLabel='<img src=x onerror="alert(1)">& Thu C Sâm';
 const stamp='<svg onload="alert(2)"></svg>';
 const out=fixture({loaiGd:textLabel,time:stamp,
  orderId:"DG1' onclick='alert(3)",soTien:-975,currentDebt:100});
 assert.ok(out.includes('&lt;img src=x onerror=&quot;alert(1)&quot;&gt;&amp; Thu C Sâm'));
 assert.ok(out.includes('Ghi sổ: &lt;svg onload=&quot;alert(2)&quot;&gt;&lt;/svg&gt;'));
 assert.doesNotMatch(out,/<img|<svg|onclick=/i);
 assert.ok(out.includes('975'));
});
test('valid order display codes remain clickable without changing ledger values',()=>{
 const out=fixture({loaiGd:'Thu tiền đơn hàng DG156',time:'02/11/2026 20:59',
  orderId:'DG156',soTien:-975,currentDebt:100});
 assert.ok(out.includes('onclick="clickOrderFromDebt(\'DG156\')"'));
 assert.ok(out.includes('Thu tiền đơn hàng DG156'));
 assert.ok(out.includes('Ghi sổ: 02/11/2026 20:59'));
});
test('untrusted ledger amount is never rendered as HTML or false zero',()=>{
 const out=fixture({loaiGd:'Thu tiền',time:'03/11/2026 10:00',
  soTien:'<img src=x onerror="alert(8)">',currentDebt:100});
 assert.doesNotMatch(out,/<img|onerror=/i);
 assert.match(out,/>—<\/p>/);
 assert.doesNotMatch(out,/\+0<\/p>|\+NaN<\/p>/);
});
test('numeric-string amounts keep safe sign and Vietnamese thousands formatting',()=>{
 const collected=fixture({loaiGd:'Thu tiền',time:'03/11/2026 10:00',
  soTien:'-975000',currentDebt:100});
 assert.match(collected,/>-975\.000<\/p>/);
 const charged=fixture({loaiGd:'Phát sinh nợ',time:'03/11/2026 10:00',
  soTien:'1234567',currentDebt:100});
 assert.match(charged,/>\+1\.234\.567<\/p>/);
 const missing=fixture({loaiGd:'Lịch sử',time:'03/11/2026 10:00',
  soTien:null,currentDebt:100});
 assert.match(missing,/>—<\/p>/);
});
test('an invalid running balance must not falsely claim the debt is settled',()=>{
 for(const bad of ['not a number', 'Infinity', 'NaN']){
  const out=fixture({loaiGd:'Thu tiền',time:'03/11/2026 10:00',
   soTien:-975,currentDebt:bad});
  assert.match(out,/Số dư chưa xác minh/);
  assert.doesNotMatch(out,/Đã hết nợ/);
 }
 const clear=fixture({loaiGd:'Thu tiền',time:'03/11/2026 10:00',
  soTien:-975,currentDebt:0});
 assert.match(clear,/Đã hết nợ/,'verified zero remains settled');
});
test('only original source escapes and PWA cache query is bumped',()=>{
 assert.match(source,/escapeProductEditorValue\(h\.loaiGd\)/);
 assert.match(source,/escapeProductEditorValue\(h\.time\)/);
 assert.match(source,/\^D\[GT\]\[0-9\]\{1,12\}\$/);
 assert.match(index,/fixed-ui-behavior\.js[^\n]*debt-html-safe=20261102/);
 assert.match(index,/fixed-ui-behavior\.js[^\n]*debt-amount-safe=20261103/);
 assert.match(index,/fixed-ui-behavior\.js[^\n]*debt-balance-finite=20261103/);
});
