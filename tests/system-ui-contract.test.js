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

test('index loads shared UI system before screen styles',()=>{
  const html=read('index.html');
  const shared=html.indexOf('./src/styles/ui-system.css');
  const sales=html.indexOf('./src/styles/sales.css');
  assert.ok(shared>0 && shared<sales);
});

test('all business order details use the shared five-column family',()=>{
  for(const file of ['src/screens/pending.js','src/screens/delivered.js','src/screens/debt.js']){
    const js=read(file);
    assert.match(js,/order-detail-panel/);
    assert.match(js,/order-detail-title/);
    assert.match(js,/order-detail-context/);
    assert.match(js,/order-detail-head/);
    assert.match(js,/order-detail-lines/);
    assert.match(js,/order-detail-total/);
  }
});

test('detail headings are semantic titles rather than raw order ids',()=>{
  const pending=read('src/screens/pending.js');
  const delivered=read('src/screens/delivered.js');
  assert.match(pending,/order-detail-title[^>]*>Đơn tạm</);
  assert.match(delivered,/order-detail-title[^>]*>Đã giao</);
});

test('shell and sales consume shared UI tokens',()=>{
  const shell=read('src/styles/shell.css');
  const sales=read('src/styles/sales.css');
  assert.match(shell,/var\(--ui-(?:panel|text|line|primary)/);
  assert.match(sales,/var\(--ui-(?:panel|text|line|primary)/);
});
