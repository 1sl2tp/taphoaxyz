import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const css=fs.readFileSync('src/fixed-ui-cart-spacing.css','utf8');
const runtime=fs.readFileSync('src/fixed-ui-runtime-6.js','utf8');
const html=fs.readFileSync('index.html','utf8');
const owner=css.slice(css.indexOf('/* FIXED STYLE: order-cart-share-five-columns-20261008'));

test('IMG_9482/9483: each mode uses one complete five-column ruler for both header and lines',()=>{
  assert.match(runtime,/cartSheet\.dataset\.cartMode = isDeliveredReadOnlyPreview \? 'preview' : 'edit'/);
  assert.match(owner,/#cartBottomSheet \.cart-compact-grid,[\s\S]*?#orderDetailContentToShare \.order-detail-compact-grid\{[^}]*grid-template-columns:22px minmax\(0,1fr\) 54px 96px 69px !important;/);
  assert.match(owner,/#cartBottomSheet\[data-cart-mode="preview"\] \.cart-compact-grid,[\s\S]*?#orderDetailContentToShare \.order-detail-compact-grid\{[^}]*grid-template-columns:22px minmax\(0,1fr\) 54px 50px 72px !important;/);
  assert.match(owner,/#cartItemList \.cart-compact-grid\.cart-qty-readonly|#cartBottomSheet\[data-cart-mode="preview"\] #cartItemList \.cart-compact-grid \.cart-qty-readonly/);
});

test('IMG_9483: stepper fits inside 96px edit track; header and subtotal remain separate',()=>{
  assert.match(owner,/#cartItemList \.cart-compact-grid \.cart-qty-control\{[^}]*grid-template-columns:30px 28px 30px !important;[^}]*gap:1px !important;/);
  assert.match(owner,/#cartBottomSheet #cartItemList \.cart-compact-grid \.cart-qty\{[^}]*width:100% !important;[^}]*min-width:0 !important;/);
  assert.equal(30+28+30+2*1+2*2+2,96);
  assert.match(owner,/#cartBottomSheet\[data-cart-mode="preview"\] #cartItemList \.cart-compact-grid \.cart-qty-readonly\{[^}]*width:50px !important;/);
});

test('IMG_9482: wider readonly name track and shorter edit control never eat name column',()=>{
  const nameWidth=(viewport,fixed)=>viewport-32-fixed-16;
  const editFixed=22+54+96+69,previewFixed=22+54+50+72;
  for(const viewport of [320,375,390,416,428]){
    assert.ok(nameWidth(viewport,editFixed)>0,'edit '+viewport);
    assert.ok(nameWidth(viewport,previewFixed)>nameWidth(viewport,editFixed),'preview '+viewport);
  }
  assert.match(owner,/#cartItemList \.cart-compact-grid\[data-cart-readonly="1"\] \.cart-line-note:not\(\[data-cart-note-id\]\)\{[^}]*max-width:48px !important;/);
  assert.match(html,/fixed-ui-cart-spacing\.css\?ui=[^"]*qty-modes=9482-9483/);
  assert.match(html,/fixed-ui-runtime-6\.js\?v=[^"]*qty-modes=9482-9483/);
});
