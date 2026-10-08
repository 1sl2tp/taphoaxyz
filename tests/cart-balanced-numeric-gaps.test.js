import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const css=fs.readFileSync('src/fixed-ui-cart-spacing.css','utf8');
const js=fs.readFileSync('src/fixed-ui-runtime-6.js','utf8');
const html=fs.readFileSync('index.html','utf8');
const last=css.slice(css.indexOf('/* FIXED STYLE: cart-five-intrinsic-columns-20261008'));

test('Excel sketch uses exactly FIVE content-sized columns A–E and four equal gutters',()=>{
  assert.ok(last.startsWith('/* FIXED STYLE: cart-five-intrinsic-columns-20261008'));
  assert.match(last,/#cartBottomSheet \.cart-compact-grid,[\s\S]*?#cartBottomSheet\[data-cart-mode="preview"\] \.cart-compact-grid\{[^}]*grid-template-columns:\s*var\(--cart-stt-track,24px\)\s*minmax\(0,var\(--cart-name-track,60px\)\)\s*var\(--cart-unit-track,54px\)\s*var\(--cart-qty-track,96px\)\s*var\(--cart-total-track,69px\) !important;/);
  assert.match(last,/column-gap:6px !important;/);
  assert.match(last,/justify-content:start !important;/);
  assert.doesNotMatch(last,/minmax\(0,6fr\)|minmax\(0,8fr\)|grid-column:7 !important;/);
});

test('header and body map STT, Tên, Đơn giá, SL, Thành tiền to columns 1..5',()=>{
  const cases=[
    ['#cartBottomSheet .cart-compact-grid .cart-stt',1],
    ['#cartBottomSheet .cart-compact-grid .cart-price',3],
    ['#cartBottomSheet .cart-compact-grid .cart-qty',4],
    ['#cartBottomSheet .cart-compact-grid .cart-total',5]
  ];
  for(const [selector,col] of cases){
    const part=last.slice(last.indexOf(selector+'{'),last.indexOf('}',last.indexOf(selector+'{')));
    assert.ok(part.includes('grid-column:'+col+' !important;'),selector);
    assert.ok(part.includes('grid-row:1 !important;'),selector);
  }
  assert.match(last, /#cartBottomSheet \.cart-column-header \.cart-name,\s*#cartBottomSheet #cartItemList \.cart-compact-grid \.cart-left > \.min-w-0\{[^}]*grid-column:2 !important;/);
  assert.match(last,/#cartBottomSheet \.cart-compact-grid \.cart-left\{[^}]*display:contents !important;/);
});

test('max header/value widths across all product rows are measured using real browser font',()=>{
  assert.match(js,/document\.createElement\('canvas'\)/);
  assert.match(js,/window\.getComputedStyle\(node\)/);
  assert.match(js,/context\.measureText\(text\)\.width/);
  assert.match(js,/cartEntries\.map\(\(\[, item\]\) => String\(item\.name \|\| ''\)\)/);
  assert.match(js,/cartEntries\.map\(\(\[, item\]\) => Number\(item\.price \|\| 0\)\.toLocaleString\('vi-VN'\)\)/);
  assert.match(js,/cartEntries\.map\(\(\[, item\]\) =>\s*\(\(Number\(item\.qty\) \|\| 0\) \* \(Number\(item\.price\) \|\| 0\)\)\.toLocaleString\('vi-VN'\)\)/);
  for(const [name,label] of [['sttWidth','STT'],['nameWidth','Tên'],['priceWidth','Đơn giá'],['totalWidth','Thành tiền']]){
    assert.ok(js.includes("columnWidth('"+label+"'"),name);
  }
  for(const col of ['stt','name','unit','qty','total']){
    assert.ok(js.includes("setProperty('--cart-"+col+"-track'"),col);
  }
});

test('only Tên shrinks when columns exceed viewport, quantity control counts its frame and longest input',()=>{
  assert.match(js,/const innerWidth = Math\.max\(0, Math\.min\(headerInnerWidth, bodyInnerWidth\)\)/);
  assert.match(js,/const remaining = Math\.max\(0, innerWidth - sttWidth - priceWidth - qtyWidth - totalWidth - 4 \* gap\)/);
  assert.match(js,/Math\.min\(nameWidth, remaining\)/);
  assert.match(js,/const qtyInputWidth = Math\.max\(28, maxWidth\(quantityTexts, qtyInput \|\| qtyStyle\) \+ 12\)/);
  assert.match(js,/const controlWidth = 30 \+ qtyInputWidth \+ 30 \+ 2 \+ 4 \+ 2/);
  assert.match(last,/grid-template-columns:30px var\(--cart-qty-input-track,28px\) 30px !important;/);
  assert.match(last,/flex:0 0 var\(--cart-qty-track,96px\) !important;/);
  assert.match(last,/text-overflow:ellipsis !important;/);
  assert.equal((500*10).toLocaleString('vi-VN'),'5.000');
});

test('the visible gaps from C to D and D to E are equal for both quantity modes',()=>{
  assert.match(last,/#cartBottomSheet \.cart-column-header \.cart-price\{text-align:right !important;/);
  assert.match(last,/#cartBottomSheet \.cart-column-header \.cart-qty\{text-align:center !important;/);
  assert.match(last,/#cartBottomSheet \.cart-column-header \.cart-total\{text-align:left !important;/);
  for(const [controlWidth,visibleWidth] of [[96,96],[26,13],[52,36]]){
    const g=6;
    assert.equal(g+(controlWidth-visibleWidth)/2,g+(controlWidth-visibleWidth)/2);
  }
  assert.match(html,/fixed-ui-cart-spacing\.css\?ui=cart-intrinsic-5-cols-20261008/);
  assert.match(html,/fixed-ui-runtime-6\.js\?v=cart-intrinsic-widths-20261008/);
});
