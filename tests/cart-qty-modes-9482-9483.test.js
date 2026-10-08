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
  const final=css.slice(css.indexOf('/* FIXED STYLE: cart-visual-numeric-gaps-and-name-note-popup-20261008')); assert.ok(final.includes('var(--cart-qty-readonly-track,32px) var(--cart-total-track,69px)'));
  assert.match(owner,/#cartItemList \.cart-compact-grid\.cart-qty-readonly|#cartBottomSheet\[data-cart-mode="preview"\] #cartItemList \.cart-compact-grid \.cart-qty-readonly/);
});

test('IMG_9483: stepper fits inside 96px edit track; header and subtotal remain separate',()=>{
  assert.match(owner,/#cartItemList \.cart-compact-grid \.cart-qty-control\{[^}]*grid-template-columns:30px 28px 30px !important;[^}]*gap:1px !important;/);
  assert.match(owner,/#cartBottomSheet #cartItemList \.cart-compact-grid \.cart-qty\{[^}]*width:100% !important;[^}]*min-width:0 !important;/);
  assert.equal(30+28+30+2*1+2*2+2,96);
  assert.match(owner,/#cartBottomSheet\[data-cart-mode="preview"\] #cartItemList \.cart-compact-grid \.cart-qty-readonly\{[^}]*width:var\(--cart-qty-readonly-track,32px\) !important;/);
});

test('IMG_9482: wider readonly name track and shorter edit control never eat name column',()=>{
  const nameWidth=(viewport,fixed)=>viewport-32-fixed-16;
  const editFixed=22+54+96+69,previewFixed=22+54+32+72;
  for(const viewport of [320,375,390,416,428]){
    assert.ok(nameWidth(viewport,editFixed)>0,'edit '+viewport);
    assert.ok(nameWidth(viewport,previewFixed)>nameWidth(viewport,editFixed),'preview '+viewport);
  }
  assert.doesNotMatch(runtime,/data-cart-line-note-editor|cart-line-note text-/);
  assert.ok(html.includes('fixed-ui-cart-spacing.css?ui=cart-intrinsic-5-cols-20261008'));
  assert.ok(html.includes('cart-intrinsic-widths-20261008'));
});

test('readonly quantity uses short SL caption and a width sized to the maximum value',()=>{
  assert.match(runtime,/const qtyHeader = cartSheet\.querySelector\('\.cart-column-header \.cart-qty'\)/);
  assert.match(runtime,/qtyHeader\.textContent = isDeliveredReadOnlyPreview \? 'SL' : 'Số lượng'/);
  assert.match(runtime,/const qtyChars = Math\.max\(1, \.\.\.cartEntries\.map\(\(\[, item\]\) => formattedLen\(item\.qty\)\)\)/);
  assert.match(runtime,/setProperty\('--cart-qty-readonly-track',[\s\S]*?Math\.max\(32, Math\.ceil\(qtyChars \* 8 \+ 8\)\) \+ 'px'/);
  const cssFinal=css.slice(css.indexOf('/* FIXED STYLE: cart-visual-numeric-gaps-and-name-note-popup-20261008'));
  assert.match(cssFinal,/#cartBottomSheet\[data-cart-mode="preview"\] \.cart-compact-grid\{[^}]*grid-template-columns:[^;]*var\(--cart-qty-readonly-track,32px\)/);
  assert.match(css, /#cartBottomSheet\[data-cart-mode="preview"\] #cartItemList \.cart-compact-grid \.cart-qty-readonly\{[^}]*width:var\(--cart-qty-readonly-track,32px\)/);
  for(const values of [[1,2],[10,99],[123,1234]]){
    const longest=Math.max(...values.map(n=>n.toLocaleString('vi-VN').length));
    const width=Math.max(32,Math.ceil(longest*8+8));
    assert.ok(width>=32);
    if(values[0]===1) assert.equal(width,32);
    if(values[0]===123) assert.equal(width,48);
  }
  assert.match(html,/fixed-ui-cart-spacing\.css\?ui=[^"]*cart-intrinsic-5-cols-20261008/);
  assert.match(html,/fixed-ui-runtime-6\.js\?v=[^"]*cart-intrinsic-widths-20261008/);
});
