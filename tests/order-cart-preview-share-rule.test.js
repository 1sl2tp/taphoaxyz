import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=name=>fs.readFileSync(name,'utf8');
const columns=['STT','Tên','Đơn giá','Số lượng','Thành tiền'];

function markupHeader(file,selector,endSelector){
  const text=read(file);
  const start=text.indexOf(selector);
  const end=text.indexOf(endSelector,start);
  assert.ok(start>=0 && end>start,file+' header not found');
  return text.slice(start,end);
}
function assertOrderedLabels(markup,labels,origin){
  let last=-1;
  for(const label of labels){
    const position=markup.indexOf('>'+label+'</div>',last+1);
    assert.ok(position>last,origin+' missing/misordered header: '+label);
    last=position;
  }
}
test('rule and repository scope require one five-column invoice/cart/share design',()=>{
  const rule=read('docs/ORDER_CART_PREVIEW_SHARE_RULES.md');
  const agents=read('AGENTS.md');
  assert.match(rule,/STT \| Tên \| Đơn giá \| Số lượng \| Thành tiền/);
  assert.match(rule,/duy nhất cột Số lượng/);
  assert.match(rule,/ảnh.*(giỏ|hóa đơn)/i);
  assert.match(agents,/docs\/ORDER_CART_PREVIEW_SHARE_RULES\.md/);
});
test('cart and order preview retain five semantic fields and aligned numeric tracks',()=>{
  const cart=markupHeader('src/fixed-ui-markup-3.js','cart-column-header','cartItemList');
  const order=markupHeader('src/fixed-ui-markup-5.js','order-column-header','detailModalItems');
  for(const [markup,kind] of [[cart,'cart'],[order,'order']]){
    for(const label of ['STT','Tên','Đơn giá','Thành tiền']){
      assert.ok(markup.includes('>'+label+'</div>'),kind+' missing '+label);
    }
    assert.match(markup,/>Số lượng<\/div>|>SL<\/div>/);
  }
  const css=read('src/fixed-ui-cart-spacing.css');
  assert.match(css,/#cartBottomSheet \.cart-compact-grid \.cart-price\{[^}]*grid-column:3 !important;/);
  assert.match(css,/#cartBottomSheet \.cart-compact-grid \.cart-qty\{[^}]*grid-column:4 !important;/);
  assert.match(css,/#cartBottomSheet \.cart-compact-grid \.cart-total\{[^}]*grid-column:5 !important;/);
});
test('share-cart and public-order image use the same read-only portrait renderer',()=>{
  const portrait=read('src/fixed-ui-portrait-order.js');
  assert.match(portrait,/>STT<\/div>/);
  assert.match(portrait,/>Tên<\/div>/);
  assert.match(portrait,/>SL<\/div>/);
  assert.match(portrait,/title="Đơn giá" aria-label="Đơn giá"/);
  assert.match(portrait,/title="Thành tiền"/);
  assert.match(portrait,/Object\.freeze\(\{WIDTH,MIN_HEIGHT,createPage\}\)/);
  for(const f of ['src/fixed-ui-cart-share-v3.js','src/fixed-ui-public-order-image.js']){
    const share=read(f);
    assert.match(share,/TAPHOA_ORDER_PORTRAIT/);
    assert.match(share,/\.createPage\(\{/);
  }
});
test('cart readonly order preview and editing share source but quantity alone is editable',()=>{
  const render=read('src/fixed-ui-runtime-6.js');
  const behavior=read('src/fixed-ui-behavior.js');
  assert.match(render,/data-cart-readonly="\$\{isDeliveredReadOnlyPreview \? '1' : '0'\}"/);
  assert.match(render,/isDeliveredReadOnlyPreview\s*\? `<div class="cart-qty-readonly/);
  assert.match(render,/: `<div class="cart-qty-control/);
  assert.match(behavior,/if \(row\.dataset\.cartReadonly === '1'\) return;/);
  assert.match(behavior,/querySelector\('\.cart-total \.cart-money-value'\)/);
});
