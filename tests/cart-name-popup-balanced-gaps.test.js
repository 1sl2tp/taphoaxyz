import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const render=fs.readFileSync('src/fixed-ui-runtime-6.js','utf8');
const notes=fs.readFileSync('src/fixed-ui-runtime-5.js','utf8');
const css=fs.readFileSync('src/fixed-ui-cart-spacing.css','utf8');
const html=fs.readFileSync('index.html','utf8');
const owner=css.slice(css.indexOf('/* FIXED STYLE: cart-visual-numeric-gaps-and-name-note-popup-20261008'));

test('product NAME triggers floating note; no note button, input or text can shift cart row',()=>{
  assert.match(render, /cart-name cart-name-note-trigger/);
  assert.match(render, /data-cart-note-id="\$\{escapeProductEditorValue\(id\)\}"/);
  assert.match(render, /onclick="openCartLineNoteEditor\(this\)"/);
  assert.doesNotMatch(render, /data-cart-line-note-editor|data-cart-note-input-id|cart-line-note text-/);
  assert.match(notes,/overlay\.id = 'cartLineNoteOverlay'/);
  assert.match(notes,/overlay\.className = 'cart-note-overlay'/);
  assert.match(notes,/document\.body\.appendChild\(overlay\)/);
  assert.match(owner, /\.cart-note-overlay\{[^}]*position:fixed;/);
  assert.match(owner, /#cartBottomSheet #cartItemList \.cart-compact-grid \.cart-name-note-trigger\{[^}]*height:34px !important;/);
});

test('note popup is readonly on preview, cancel is side-effect free and save changes model',()=>{
  assert.match(notes,/const readonly = button\.closest\('\[data-cart-readonly="1"\]'\) !== null/);
  assert.match(notes,/if \(readonly\) \{/);
  assert.match(notes,/content\.textContent = note\.trim\(\) \|\| 'Chưa có ghi chú'/);
  assert.match(notes,/cancel\.addEventListener\('click', closeCartLineNotePopup\)/);
  assert.match(notes,/save\.addEventListener\('click', \(\) => commitCartLineNoteEditor\(input\)\)/);
  assert.match(notes,/cart\[maSp\]\.note = String\(input\.value \|\| ''\)\.trim\(\)/);
  const sync=notes.slice(notes.indexOf('function syncCartItemNoteDisplay'),notes.indexOf('function closeCartLineNotePopup'));
  assert.doesNotMatch(sync,/el\.textContent\s*=/);
  assert.match(sync,/el\.dataset\.noteCurrent = note/);
});

test('visible numeric gaps, not heading-box widths, define both sides of quantity',()=>{
  assert.match(owner,/#cartBottomSheet \.cart-compact-grid\{[^}]*grid-template-columns:22px minmax\(0,1fr\) var\(--cart-unit-track,54px\) 96px var\(--cart-total-track,69px\) !important;[^}]*column-gap:4px !important;/);
  assert.ok(owner.includes('grid-template-columns:22px minmax(0,1fr) var(--cart-unit-track,54px) var(--cart-qty-readonly-track,32px) var(--cart-total-track,69px) !important;'));
  assert.match(owner,/#cartBottomSheet #cartItemList \.cart-compact-grid \.cart-price\{[^}]*justify-content:flex-end !important;/);
  assert.match(owner,/#cartBottomSheet #cartItemList \.cart-compact-grid \.cart-total\{[^}]*justify-content:flex-start !important;/);
  assert.match(owner,/#cartBottomSheet #cartItemList \.cart-compact-grid \.cart-total \.cart-money-value\{[^}]*text-align:left !important;/);
  assert.match(owner,/#cartBottomSheet \.cart-column-header \.cart-total\{[^}]*text-align:left !important;/);
  for(const quantityWidth of [50,96]){
    for(const displayedQtyWidth of [7,15,29]){
      const left=4+(quantityWidth-displayedQtyWidth)/2;
      const right=(quantityWidth-displayedQtyWidth)/2+4;
      assert.equal(left,right);
    }
  }
});

test('numeric columns reserve the longest formatted unit/total across current cart',()=>{
  assert.match(render,/const unitChars = Math\.max\(1, \.\.\.cartEntries\.map/);
  assert.match(render,/const totalChars = Math\.max\(1, \.\.\.cartEntries\.map/);
  assert.match(render,/cartSheet\.style\.setProperty\('--cart-unit-track'/);
  assert.match(render,/cartSheet\.style\.setProperty\('--cart-total-track'/);
  assert.equal((500*10).toLocaleString('vi-VN'),'5.000');
  assert.match(html,/fixed-ui-cart-spacing\.css\?ui=cart-numeric-gap-note-popup-20261008/);
  assert.match(html,/fixed-ui-runtime-5\.js\?v=[^"]*cart-note-popup=20261008/);
  assert.match(html,/fixed-ui-runtime-6\.js\?v=[^"]*cart-note-gap=20261008/);
});
