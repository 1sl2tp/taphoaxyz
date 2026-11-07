import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

// SPEC-ORDER-FIVE-HEADERS-UPPERCASE-20261108
// Given left saved-order detail and right cart, including narrow/mobile mode,
// when either header is rendered, THEN all five title captions are uppercase.
// MUST-STAY: existing column order, measured grid, shortened adaptive price
// captions, cart quantity mode, order data, share/capture behavior.
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const css=read('src/fixed-ui-cart-spacing.css');
const entry=read('index.html');
const cart=read('src/fixed-ui-markup-3.js');
const detail=read('src/fixed-ui-markup-5.js');
const portrait=read('src/fixed-ui-portrait-order.js');
const cartRuntime=read('src/fixed-ui-runtime-6.js');

test('desktop cart and saved order title headers are uppercase in one owner',()=>{
  const at=css.indexOf('SPEC-ORDER-FIVE-HEADERS-UPPERCASE-20261108');
  assert.ok(at>0,'canonical header CSS must own capitalization');
  const section=css.slice(at,at+500);
  assert.match(section,/#cartBottomSheet \.cart-column-header\{[\s\S]*?text-transform:uppercase !important;/);
  assert.match(section,/#orderDetailContentToShare \.order-column-header\{[\s\S]*?text-transform:uppercase !important;/);
  assert.doesNotMatch(section,/text-transform:none/);
});

test('phone header typography cannot revert to title case',()=>{
  const mobile=css.indexOf('@media (max-width:480px){');
  const next=css.indexOf('  #cartBottomSheet .cart-column-header .cart-qty{text-align:center !important;}',mobile);
  assert.ok(mobile>0&&next>mobile);
  const phone=css.slice(mobile,next);
  assert.match(phone,/#cartBottomSheet \.cart-column-header \.cart-stt,[\s\S]*?#orderDetailContentToShare \.order-column-header > \*\{[\s\S]*?text-transform:uppercase !important;/);
  assert.doesNotMatch(phone,/text-transform:none/);
});

test('all five columns retain their labels and existing ruler on both sides',()=>{
  for(const [source,cls,qty] of [[cart,'cart','Số lượng'],[detail,'order','SL']]){
    for(const [suffix,label] of [['stt','STT'],['name','Tên'],['qty',qty],['price','Đơn giá'],['total','Thành tiền']]){
      assert.ok(source.includes('class=\\"'+cls+'-'+suffix+'\\">'+label+'</div>'),
        cls+' column '+suffix+' still has its canonical text');
    }
  }
  assert.match(css,/#cartBottomSheet \.cart-compact-grid/);
  assert.match(css,/#orderDetailContentToShare \.order-detail-compact-grid/);
  assert.match(cartRuntime,/isDeliveredReadOnlyPreview \? 'SL' : 'Số lượng'/);
  assert.match(cartRuntime,/const priceLabels = \['Đơn giá', 'Đ.giá', 'Giá', 'ĐG'\]/);
  assert.match(cartRuntime,/const totalLabelOptions = \['Thành tiền', 'T.tiền', 'Tiền', 'TT'\]/);
});

test('portrait image header keeps uppercase and cache-busts the live CSS owner',()=>{
  assert.match(portrait,/text-transform:uppercase/);
  assert.match(entry,/fixed-ui-cart-spacing\.css\?[^\"]+order-head-uppercase=20261108/);
});
