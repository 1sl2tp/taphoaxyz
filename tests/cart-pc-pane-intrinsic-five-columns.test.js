import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const css=fs.readFileSync('src/fixed-ui-cart-spacing.css','utf8');
const js=fs.readFileSync('src/fixed-ui-runtime-6.js','utf8');
const html=fs.readFileSync('index.html','utf8');
const owner=css.slice(css.indexOf('/* FIXED STYLE: cart-five-intrinsic-columns-20261008'));

test('cart A-E ruler applies to desktop split pane regardless of 1080px viewport',()=>{
  assert.ok(owner.startsWith('/* FIXED STYLE: cart-five-intrinsic-columns-20261008'));
  assert.doesNotMatch(owner,/@media\s*\(/);
  assert.match(owner, /Applies to the cart panel at ANY viewport width, including \.pc-mode split pane/);
  assert.match(owner, /#cartBottomSheet \.cart-compact-grid,[\s\S]*?#cartBottomSheet\[data-cart-mode="preview"\] \.cart-compact-grid\{[^}]*display:grid !important;[^}]*grid-template-columns:\s*var\(--cart-stt-track,24px\)\s*minmax\(0,var\(--cart-name-track,60px\)\)\s*var\(--cart-unit-track,54px\)\s*var\(--cart-qty-track,96px\)\s*var\(--cart-total-track,69px\) !important;/);
  assert.match(owner, /column-gap:6px !important;/);
  assert.match(owner, /justify-content:start !important;/);
  assert.match(html,/fixed-ui-cart-spacing\.css\?ui=cart-intrinsic-5-cols-20261008&pc-panel=20261008/);
});

test('desktop cart header and item cells map A-E directly, no old combined name cell',()=>{
  for(const [cls,column] of [['cart-stt',1],['cart-price',3],['cart-qty',4],['cart-total',5]]){
    const selector='#cartBottomSheet .cart-compact-grid .'+cls+'{';
    const p=owner.indexOf(selector);
    assert.ok(p>=0,selector);
    const rule=owner.slice(p,owner.indexOf('}',p));
    assert.ok(rule.includes('grid-column:'+column+' !important;'),selector);
    assert.ok(rule.includes('grid-row:1 !important;'),selector);
  }
  assert.match(owner,/#cartBottomSheet \.cart-column-header \.cart-name,\s*#cartBottomSheet #cartItemList \.cart-compact-grid \.cart-left > \.min-w-0\{[^}]*grid-column:2 !important;/);
  assert.match(owner,/#cartBottomSheet \.cart-compact-grid \.cart-left\{[^}]*display:contents !important;/);
});

test('desktop number anchors and quantity control really occupy measured tracks',()=>{
  assert.match(owner, /#cartBottomSheet #cartItemList \.cart-compact-grid \.cart-price\{[^}]*display:flex !important;[^}]*justify-content:flex-end !important;/);
  assert.match(owner, /#cartBottomSheet #cartItemList \.cart-compact-grid \.cart-total\{[^}]*display:flex !important;[^}]*justify-content:flex-start !important;/);
  assert.match(owner, /#cartBottomSheet\[data-cart-mode="edit"\] #cartItemList \.cart-compact-grid \.cart-qty-control\{[^}]*flex:0 0 var\(--cart-qty-track,96px\) !important;[^}]*grid-template-columns:30px var\(--cart-qty-input-track,28px\) 30px !important;/);
  assert.match(owner, /#cartBottomSheet\[data-cart-mode="preview"\] #cartItemList \.cart-compact-grid \.cart-qty-readonly\{[^}]*width:var\(--cart-qty-track,32px\) !important;/);
  assert.match(owner, /#cartBottomSheet #cartItemList \.cart-compact-grid \.cart-name-note-trigger::after\{[^}]*content:none !important;/);
  assert.match(owner, /#cartBottomSheet #cartItemList \.cart-compact-grid \.cart-name-note-trigger\{[^}]*font-size:12px !important;/);
  assert.match(js,/const bodyInnerWidth = body\.clientWidth -/);
  assert.match(js,/Math\.max\(0, Math\.min\(headerInnerWidth, bodyInnerWidth\)\)/);
  assert.match(html,/fixed-ui-runtime-6\.js\?v=cart-intrinsic-widths-20261008&pc-panel=20261008/);
});
