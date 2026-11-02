import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const css=readFileSync(new URL('../src/fixed-ui-source-4.css',import.meta.url),'utf8');
const markup=readFileSync(new URL('../src/fixed-ui-markup-2.js',import.meta.url),'utf8');
const index=readFileSync(new URL('../index.html',import.meta.url),'utf8');

// SPEC-TAPHOA-MOBILE-DEBT-MONEY-FOCUS-20261102
test('quick debt amount remains a real numeric text field and is not rewritten',()=>{
  assert.ok(markup.includes('id=\\"quickDebtAmount\\"'));
  assert.ok(markup.includes('inputmode=\\"numeric\\"'));
  assert.ok(markup.includes('onclick=\\"submitQuickDebt(\\\'thu\\\')\\"'));
  assert.ok(markup.includes('onclick=\\"submitQuickDebt(\\\'no\\\')\\"'));
});

test('mobile debt input is Safari-safe without global font-size or browser zoom locks',()=>{
  const start=css.indexOf('body[data-resolved-mode="mobile"] #quickDebtAmount{');
  assert.ok(start>=0,'one mobile-only quick debt input owner');
  const rule=css.slice(start,css.indexOf('}',start)+1);
  assert.ok(rule.includes('font-size:16px !important;'));
  assert.ok(rule.includes('min-height:44px;'));
  assert.ok(index.includes('quick-debt-focus=20261102'),'stylesheet cache key updated');
});
