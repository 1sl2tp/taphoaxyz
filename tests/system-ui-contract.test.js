import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8');

test('shared UI system owns core visual tokens and typography roles',()=>{
  const base=read('src/styles/base.css');
  const ui=read('src/styles/ui-system.css');
  for(const token of ['--ui-page','--ui-panel','--ui-text','--ui-muted','--ui-line','--ui-primary','--ui-success','--ui-warning','--ui-danger'])assert.match(base,new RegExp(token.replaceAll('-','\\-')));
  for(const role of ['panel-title','name','body','meta','label','action','money-row','money-key','money-hero','summary-value','summary-total'])assert.ok(ui.includes(`[data-ui-type="${role}"]`),`missing typography role ${role}`);
  assert.match(ui,/font-variant-numeric:\s*tabular-nums/);
});

test('index loads one Tailwind visual owner and icon runtime before scroll ownership',()=>{
  const html=read('index.html');
  const tailwind=html.indexOf('./src/styles/taphoa-tailwind.css');
  const owner=html.indexOf('./src/styles/scroll-owner.css');
  const uiRuntime=html.indexOf('./src/core/ui-system.js');
  const scrollRuntime=html.indexOf('./src/core/scroll-owner.js');
  assert.ok(tailwind>=0&&tailwind<owner);
  assert.ok(uiRuntime>0&&scrollRuntime>uiRuntime);
  assert.doesNotMatch(html,/src\/core\/semantic-ui\.js/);
  assert.doesNotMatch(html,/src\/styles\/(?:sales|delivered|pending|debt)\.css/);
});

test('screen sources declare semantic order detail families without runtime structure rewriting',()=>{
  const runtime=read('src/core/ui-system.js');
  const delivered=read('src/screens/delivered.js');
  const pending=read('src/screens/pending.js');
  const debt=read('src/screens/debt.js');
  assert.doesNotMatch(runtime,/DETAIL_UI_CONFIG|decoratePendingCards|replaceText\(/);
  assert.match(delivered,/delivered-detail-panel ui-popup-l1/);
  assert.match(delivered,/delivered-print-panel ui-popup-l2/);
  assert.match(pending,/pending-detail-panel ui-popup-l1/);
  assert.match(pending,/pending-source-panel ui-popup-l1/);
  assert.match(pending,/pending-print-panel ui-popup-l2/);
  assert.match(debt,/debt-detail-panel ui-popup-l1/);
  assert.match(debt,/debt-order-panel ui-popup-l2/);
});

test('compactOrderId preserves short ids and abbreviates long technical ids',async()=>{
  const {compactOrderId}=await import('../src/core/ui-system.js');
  assert.equal(compactOrderId('DH12'),'DH12');
  assert.equal(compactOrderId('3848b81e-4815-4aa9-af59-6d408babf2b7'),'#f2b7');
});

test('shell and sales consume shared UI tokens',()=>{
  const shell=read('src/styles/shell.css');
  const sales=read('src/styles/sales.css');
  assert.match(shell,/var\(--ui-(?:panel|text|line|primary)/);
  assert.match(sales,/var\(--ui-(?:panel|text|line|primary)/);
});

test('legacy shared UI source still covers ancillary popup families kept for non-runtime reference',()=>{
  const ui=read('src/styles/ui-system.css');
  for(const selector of ['.pending-source-panel','.pending-print-panel','.delivered-print-panel','.debt-detail-panel'])assert.ok(ui.includes(selector),`shared UI reference must cover ${selector}`);
  for(const selector of ['.pending-backdrop','.delivered-backdrop','.debt-backdrop'])assert.ok(ui.includes(selector),`shared UI reference must cover ${selector}`);
});
