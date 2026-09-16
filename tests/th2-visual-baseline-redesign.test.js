import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('final visual owner is imported after legacy Tailwind sources',async()=>{
  const entry=await read('src/styles/taphoa-tailwind.entry.css');
  assert.match(entry,/taphoa-th2-final\.css/);
  assert.match(entry,/taphoa-th2-auth\.css/);
  assert.ok(entry.lastIndexOf('taphoa-th2-final.css')>entry.lastIndexOf('taphoa-tailwind.input.css'));
  assert.ok(entry.lastIndexOf('taphoa-th2-auth.css')>entry.lastIndexOf('taphoa-th2-final.css'));
});

test('main screens use flat regions instead of nested rounded cards',async()=>{
  const css=await read('src/styles/taphoa-th2-final.css');
  for(const screen of ['sales','delivered','pending','debt']){
    assert.ok(css.includes(`[data-screen-id="${screen}"]`),`missing ${screen} owner`);
  }
  assert.match(css,/\.ui-main[^}]*--th2-layout-owner/);
  assert.match(css,/\.ui-zone-data[^}]*border\s*:\s*0/);
  assert.match(css,/\.ui-table[^}]*border-radius\s*:\s*0/);
});

test('Sales keeps customer search groups products as distinct vertical regions',async()=>{
  const css=await read('src/styles/taphoa-th2-final.css');
  for(const selector of ['.sales-customer-bar','.sales-search-tools','.sales-group-rail','.sales-products-region']){
    assert.ok(css.includes(selector),`Sales missing ${selector}`);
  }
  assert.match(css,/\.sales-products-region[^}]*border-radius\s*:\s*0/);
  assert.match(css,/\.sales-product-row[^}]*min-height\s*:\s*72px/);
  assert.match(css,/\.sales-qty[^}]*grid-template-columns\s*:\s*44px\s+32px\s+44px/);
});

test('Delivered and Pending summary/list are table regions, not cards',async()=>{
  const css=await read('src/styles/taphoa-th2-final.css');
  assert.match(css,/\.delivered-summary[^}]*border-radius\s*:\s*0/);
  assert.match(css,/\.delivered-list[^}]*border-radius\s*:\s*0/);
  assert.match(css,/\.pending-summary[^}]*border-radius\s*:\s*0/);
  assert.match(css,/\.pending-list[^}]*border-radius\s*:\s*0/);
  assert.match(css,/\.delivered-order-card[^}]*min-height\s*:\s*76px/);
  assert.match(css,/\.pending-order-card[^}]*min-height\s*:\s*76px/);
});

test('Debt separates summary quick form and ledger with no giant hero card',async()=>{
  const css=await read('src/styles/taphoa-th2-final.css');
  assert.match(css,/\.debt-hero[^}]*background\s*:\s*transparent/);
  assert.match(css,/\.debt-total-row[^}]*border-radius\s*:\s*0/);
  assert.match(css,/\.debt-quick[^}]*border-radius\s*:\s*0/);
  assert.match(css,/\.debt-list[^}]*border-radius\s*:\s*0/);
  assert.match(css,/\.debt-customer-row[^}]*min-height\s*:\s*60px/);
});

test('popup layers have fixed chrome, scroll body and visibly different depth',async()=>{
  const css=await read('src/styles/taphoa-th2-final.css');
  assert.match(css,/\.ui-popup-l1[^}]*box-shadow\s*:/);
  assert.match(css,/\.ui-popup-l2[^}]*box-shadow\s*:/);
  assert.match(css,/\.ui-popup-l2[^}]*border-color\s*:/);
  assert.match(css,/\.ui-popup-header[^}]*position\s*:\s*sticky/);
  assert.match(css,/\.ui-popup-header[^}]*top\s*:\s*0/);
});

test('account sheet and login are part of the same touch-first system',async()=>{
  const css=await read('src/styles/taphoa-th2-auth.css');
  assert.match(css,/\.account-sheet-card[^}]*border-radius\s*:\s*20px\s+20px\s+0\s+0/);
  assert.match(css,/\.account-sheet-close[^}]*min-width\s*:\s*44px/);
  assert.match(css,/\.account-logout[^}]*min-height\s*:\s*48px/);
  assert.match(css,/\.login-card[^}]*box-shadow\s*:\s*none/);
  assert.match(css,/\.login-field[^}]*min-height\s*:\s*52px/);
  assert.match(css,/\.login-submit[^}]*min-height\s*:\s*52px/);
});

test('mobile and desktop preserve same MAIN to popup flow',async()=>{
  const css=await read('src/styles/taphoa-th2-final.css');
  assert.match(css,/@media\s*\(max-width:\s*479px\)/);
  assert.match(css,/@media\s*\(min-width:\s*760px\)/);
  assert.doesNotMatch(css,/grid-template-columns:[^;}]*1fr[^;}]*1fr[^;}]*detail/i);
});
