import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

// SPEC-PWA-RAIL-FOCUS-20261101 / SPEC-PWA-TAB-READABILITY-20261101
// SPEC-PWA-SALES-TYPE-20261101 / SPEC-PWA-DEBT-TYPE-20261101
// Given an iPhone PWA with policy rail and sales/debt tabs, when opening
// the screens and tapping policy, then no green clipped focus stripes remain,
// labels remain legible, and both screens share a restrained type scale.
// MUST-STAY: no change to tab route, debt math, prices, five-column cart,
// voice search, touch sizes, native iOS input zoom guards or data calls.
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const policy=read('src/customer-policy-notice.css');
const source4=read('src/fixed-ui-source-4.css');
const products=read('src/fixed-ui-product-media.css');
const debt=read('src/fixed-ui-debt-popup.css');
const html=read('index.html');
const markup=read('src/fixed-ui-markup-1.js');
const routing=read('src/fixed-ui-runtime-2.js');

test('policy rail replaces clipped outer green outline with inset keyboard cue and no touch focus border',()=>{
  assert.match(policy,/#statusBar\[data-policy-inline="true"\]/);
  assert.match(policy,/#statusBar \.tp-policy-reopen--bar\{/);
  const block=policy.slice(policy.indexOf('SPEC-PWA-RAIL-FOCUS-20261101'));
  assert.match(block,/#appContainer #statusBar \.tp-policy-reopen--bar:focus-visible\s*\{/);
  assert.match(block,/outline:none !important/);
  assert.match(block,/box-shadow:inset 0 0 0 2px rgba\(255,255,255,\.72\) !important/);
  assert.match(block,/@media \(hover:none\) and \(pointer:coarse\)/);
  assert.match(block,/box-shadow:none !important/);
  assert.match(markup,/id=\\"topNav\\"/);
});

test('mobile tabs use 11px labels, sufficient inactive contrast and retain dynamic active theme',()=>{
  const block=source4.slice(source4.indexOf('SPEC-PWA-TAB-READABILITY-20261101'),source4.indexOf('FIXED STYLE: sales-header-compact-capacity'));
  assert.match(block,/@media \(max-width:767px\)/);
  assert.match(block,/#topNav \.tab-btn\.text-gray-400\s*\{\s*color:#64748b !important/);
  assert.match(block,/#topNav \.tab-btn > span\s*\{[^}]*font-size:11[.]5px !important/);
  assert.match(block,/#topNav \.tab-btn > i\s*\{[^}]*font-size:18px !important/);
  assert.doesNotMatch(block,/#topNav \.tab-btn\.text-primary\s*\{|#topNav\s*\{[^}]*height\s*:/);
  assert.match(markup,/h-\[64px\]/);
  assert.match(routing,/function switchTab\(tabId, element\)/);
  assert.match(routing,/btn\.classList\.remove\('text-primary', 'border-primary'\)/);
});

test('sale and debtor names/amounts converge to 14px without shrinking touch or iOS-safe inputs',()=>{
  const sales=products.slice(products.indexOf('SPEC-PWA-SALES-TYPE-20261101'));
  const debtBlock=debt.slice(debt.indexOf('SPEC-PWA-DEBT-TYPE-20261101'),debt.indexOf('SPEC-DEBT-CARD-THIRD-ROW-20261101'));
  assert.match(sales,/#tab-ban-hang \.product-card \.line-clamp-1\s*\{[^}]*font-size:14px !important/);
  assert.match(sales,/#tab-ban-hang \.product-card \.sale-product-price-row\s*\{[^}]*margin-top:2px !important/);
  assert.match(debtBlock,/#tab-cong-no \.debt-customer-name\s*\{[^}]*font-size:14px !important/);
  assert.match(debtBlock,/#tab-cong-no \.debt-customer-money\s*\{[^}]*font-size:14px !important/);
  assert.match(debtBlock,/#tab-cong-no \.debt-customer-detail\s*\{[^}]*font-size:11\.5px !important/);
  assert.match(products,/#tab-ban-hang \.product-card button\[onclick\^="updateCart\("\]\s*\{\s*width:40px !important/);
  assert.match(products,/#tab-ban-hang \.product-card input\[data-qty-editor="product"\]\s*\{[^}]*font-size:16px !important/);
  assert.match(debt,/#tab-cong-no #debtSortSelect\{font-size:16px !important;\}/);
});

test('fresh stylesheet query keys reach iOS installed PWA without changing scripts',()=>{
  for(const key of ['nav-contrast=20261101','type-hierarchy=20261101','sales-type=20261101','focus-edge=20261101']){
    assert.ok(html.includes(key),'missing asset cache key '+key);
  }
  assert.match(html,/fixed-pwa-auto-update\.js\?v=pwa-auto-update-20260921/);
  assert.match(html,/fixed-ui-runtime-11\.js\?v=/);
});
