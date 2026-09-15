import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8');

test('sales cart uses compact total summary and semantic edit actions',()=>{
  const runtime=read('src/core/ui-system.js');
  const css=read('src/styles/iphone-visual-cleanup.css');
  assert.match(runtime,/SP ·/);
  assert.match(runtime,/setAttribute\('placeholder','Ghi chú'\)/);
  assert.doesNotMatch(runtime,/if\(panel\.dataset\.uiCompact\)return/);
  assert.match(runtime,/if\(panel\.dataset\.uiCompact\)continue/);
  assert.match(css,/\[data-sales-action="cancel-edit"\][^{]*\{[^}]*var\(--ui-line\)/s);
  assert.match(css,/\[data-sales-action="update"\][^{]*\{[^}]*var\(--ui-primary\)/s);
});

test('pending cards lead with customer and compact order id',()=>{
  const runtime=read('src/core/ui-system.js');
  const css=read('src/styles/iphone-visual-cleanup.css');
  assert.match(runtime,/function decoratePendingCards/);
  assert.match(runtime,/pending-order-customer/);
  assert.match(runtime,/compactOrderId\(card\.dataset\.orderOpen\)/);
  assert.match(css,/\.pending-order-customer\{[^}]*font-weight:750/s);
  assert.match(css,/\.pending-order-context-line\{[^}]*var\(--ui-muted\)/s);
});

test('debt screen uses neutral shared surfaces instead of a separate gradient app',()=>{
  const css=read('src/styles/iphone-visual-cleanup.css');
  assert.match(css,/\[data-screen-id="debt"\] \.debt-hero\{[^}]*background:var\(--ui-page\)!important/s);
  assert.match(css,/\.debt-total-row>div\{[^}]*background:var\(--ui-panel\)!important/s);
  assert.match(css,/\.debt-shop:after\{[^}]*display:none!important/s);
  assert.match(css,/\.debt-shop-avatar\{[^}]*width:40px!important;[^}]*height:40px!important/s);
});

test('cleanup cascade loads after shared visuals but before scroll ownership',()=>{
  const html=read('index.html');
  const shared=html.indexOf('./src/styles/ui-system.css');
  const cleanup=html.indexOf('./src/styles/iphone-visual-cleanup.css');
  const scroll=html.indexOf('./src/styles/scroll-owner.css');
  assert.ok(shared>=0&&cleanup>shared&&scroll>cleanup);
});
