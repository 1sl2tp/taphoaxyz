import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

// SPEC-TAPHOA-MOBILE-CUSTOMER-INPUT-FOCUS-20261102
// The customer picker owns its two focused inputs; debt input already has
// an independent 16px / 44px rule and must not be overridden a second time.
const css=readFileSync(new URL('../src/fixed-ui-source-4.css',import.meta.url),'utf8');
const debtCss=readFileSync(new URL('../src/fixed-ui-debt-popup.css',import.meta.url),'utf8');
const picker=readFileSync(new URL('../src/fixed-ui-markup-5.js',import.meta.url),'utf8');
const money=readFileSync(new URL('../src/fixed-ui-markup-2.js',import.meta.url),'utf8');
const index=readFileSync(new URL('../index.html',import.meta.url),'utf8');

test('money field and receipt actions keep their preexisting debt CSS owner',()=>{
  assert.ok(money.includes('quickDebtAmount'));
  assert.ok(money.includes("submitQuickDebt('thu')"));
  assert.ok(money.includes("submitQuickDebt('no')"));
  assert.ok(debtCss.includes('#tab-cong-no #quickDebtAmount,'));
  assert.ok(debtCss.includes('font-size:16px !important;'));
  assert.ok(!css.includes('body[data-resolved-mode="mobile"] #quickDebtAmount{'),
    'do not duplicate existing debt input CSS in the product/editor stylesheet');
});

test('both customer-picker text fields use 16px and a 44px touch area on mobile',()=>{
  assert.ok(picker.includes('customerSearchInput'));
  assert.ok(picker.includes('newCustomerName'));
  assert.ok(picker.includes('text-[13px]'),'source markup retains compact desktop typography');
  const start=css.indexOf('body[data-resolved-mode="mobile"] #customerSearchInput,');
  assert.ok(start>=0);
  const rule=css.slice(start,css.indexOf('}',start)+1);
  assert.ok(rule.includes('body[data-resolved-mode="mobile"] #newCustomerName{'));
  assert.ok(rule.includes('font-size:16px !important;'));
  assert.ok(rule.includes('min-height:44px;'));
  assert.ok(index.includes('customer-picker-font=20261102'),
    'updated stylesheet query prevents old PWA CSS being used');
});
