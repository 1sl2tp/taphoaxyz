import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const css = fs.readFileSync('src/fixed-ui-cart-spacing.css','utf8');
const html = fs.readFileSync('index.html','utf8');
const source = fs.readFileSync('src/fixed-ui-runtime-6.js','utf8');
const owner = css.slice(css.indexOf('/* FIXED STYLE: cart-equal-visible-money-gaps-20261008'));

test('both mobile modes have TWO same-width flexible gaps between visible price, qty and subtotal',()=>{
  assert.ok(owner.startsWith('/* FIXED STYLE: cart-equal-visible-money-gaps-20261008'));
  assert.match(owner, /#cartBottomSheet \.cart-compact-grid\{[^}]*grid-template-columns:\s*22px minmax\(0,6fr\) var\(--cart-unit-track,54px\)\s+minmax\(0,1fr\) 96px minmax\(0,1fr\) var\(--cart-total-track,69px\) !important;[^}]*column-gap:0 !important;/);
  assert.match(owner, /#cartBottomSheet\[data-cart-mode="preview"\] \.cart-compact-grid\{[^}]*grid-template-columns:\s*22px minmax\(0,6fr\) var\(--cart-unit-track,54px\)\s+minmax\(0,1fr\) var\(--cart-qty-readonly-track,32px\)\s+minmax\(0,1fr\) var\(--cart-total-track,69px\) !important;/);
  assert.match(owner, /@media \(max-width:360px\)\{[\s\S]*?22px minmax\(0,8fr\)/);
});

test('all 5 data cells in BOTH header and body use grid tracks 1,2,3,5,7',()=>{
  for(const [selector,col] of [
    ['#cartBottomSheet .cart-compact-grid .cart-stt',1],
    ['#cartBottomSheet .cart-compact-grid .cart-price',3],
    ['#cartBottomSheet .cart-compact-grid .cart-qty',5],
    ['#cartBottomSheet .cart-compact-grid .cart-total',7],
  ]){
    const pos=owner.indexOf(selector+'{');
    assert.ok(pos>=0,selector);
    const rule=owner.slice(pos,owner.indexOf('}',pos));
    assert.ok(rule.includes('grid-column:'+col+' !important;'),selector);
    assert.ok(rule.includes('grid-row:1 !important;'),selector);
  }
  assert.match(owner, /#cartBottomSheet \.cart-column-header \.cart-name,\s*#cartBottomSheet #cartItemList \.cart-compact-grid \.cart-left > \.min-w-0\{[^}]*grid-column:2 !important;/);
  assert.match(owner, /#cartBottomSheet \.cart-compact-grid \.cart-left\{[^}]*display:contents !important;/);
});

test('geometry places visible unit price and subtotal exactly equidistant from quantity',()=>{
  // The visible right edge of unit price and left edge of total are the
  // track edges. Quantity control spans full track; readonly digits center.
  for(const viewport of [320,360,375,390,428,480]){
    const area=viewport-32; // sheet/list 16px padding on both sides
    const nameWeight=viewport<=360?8:6;
    for(const [mode,qtyWidth,visibleQtyWidth] of [['edit',96,96],['preview',32,9],['preview-large-qty',48,29]]){
      for(const [unitTrack,totalTrack] of [[54,69],[68,75]]){
        const free=area-22-unitTrack-qtyWidth-totalTrack;
        assert.ok(free>0,'five values fit at '+viewport+' '+mode);
        const gap=free/(nameWeight+2);
        const name=nameWeight*gap;
        const unitEdge=22+name+unitTrack;
        const qtyLeft=unitEdge+gap;
        const qtyRight=qtyLeft+qtyWidth;
        const totalBegin=qtyRight+gap;
        const qLeftVisible=qtyLeft+(qtyWidth-visibleQtyWidth)/2;
        const qRightVisible=qtyRight-(qtyWidth-visibleQtyWidth)/2;
        assert.ok(Math.abs((qLeftVisible-unitEdge)-(totalBegin-qRightVisible))<1e-10,
          'g1=g2 at '+viewport+' '+mode);
      }
    }
  }
});

test('two numeric anchors do not regress to margin-right / extra padding positioning',()=>{
  assert.match(owner, /#cartBottomSheet #cartItemList \.cart-compact-grid \.cart-price\{[^}]*justify-content:flex-end !important;/);
  assert.match(owner, /#cartBottomSheet #cartItemList \.cart-compact-grid \.cart-total\{[^}]*justify-content:flex-start !important;/);
  assert.match(owner, /#cartBottomSheet #cartItemList \.cart-compact-grid \.cart-qty\{[^}]*justify-content:center !important;/);
  assert.match(source, /qtyHeader\.textContent = isDeliveredReadOnlyPreview \? 'SL' : 'Số lượng'/);
  assert.match(html,/fixed-ui-cart-spacing\.css\?ui=[^"]*equal-money-gaps=20261008/);
});
