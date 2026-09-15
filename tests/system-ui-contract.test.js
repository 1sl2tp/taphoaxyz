import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8');

test('shared UI system owns core visual tokens and typography roles',()=>{
  const base=read('src/styles/base.css');
  const ui=read('src/styles/ui-system.css');
  for(const token of ['--ui-page','--ui-panel','--ui-text','--ui-muted','--ui-line','--ui-primary','--ui-success','--ui-warning','--ui-danger']){
    assert.match(base,new RegExp(token.replaceAll('-','\\-')));
  }
  for(const role of ['panel-title','name','body','meta','label','action','money-row','money-key','money-hero','summary-value','summary-total']){
    assert.ok(ui.includes(`[data-ui-type="${role}"]`),`missing typography role ${role}`);
  }
  assert.match(ui,/font-variant-numeric:\s*tabular-nums/);
});

test('index loads shared UI stylesheet after screen visuals but before scroll ownership, and loads UI runtime',()=>{
  const html=read('index.html');
  const debt=html.indexOf('./src/styles/debt.css');
  const shared=html.indexOf('./src/styles/ui-system.css');
  const owner=html.indexOf('./src/styles/scroll-owner.css');
  const runtime=html.indexOf('./src/core/ui-system.js');
  assert.ok(shared>debt && shared<owner);
  assert.ok(runtime>0);
});

test('shared UI runtime declares semantic order detail families',async()=>{
  const mod=await import('../src/core/ui-system.js');
  assert.deepEqual(Object.keys(mod.DETAIL_UI_CONFIG).sort(),['debt','delivered','pending']);
  assert.equal(mod.DETAIL_UI_CONFIG.pending.title,'Đơn tạm');
  assert.equal(mod.DETAIL_UI_CONFIG.delivered.title,'Đã giao');
  assert.equal(mod.DETAIL_UI_CONFIG.debt.title,'Công nợ');
  for(const config of Object.values(mod.DETAIL_UI_CONFIG)){
    for(const key of ['panel','header','title','context','head','lines','total'])assert.ok(config[key],`missing ${key}`);
  }
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

test('shared UI system covers every ancillary popup and print family',()=>{
  const ui=read('src/styles/ui-system.css');
  for(const selector of ['.pending-source-panel','.pending-print-panel','.delivered-print-panel','.debt-detail-panel']){
    assert.ok(ui.includes(selector),`shared UI system must cover ${selector}`);
  }
  for(const selector of ['.pending-backdrop','.delivered-backdrop','.debt-backdrop']){
    assert.ok(ui.includes(selector),`shared UI system must cover ${selector}`);
  }
});
