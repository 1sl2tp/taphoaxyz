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
test('cart and order preview headers both render five same full names in identical order',()=>{
  const cart=markupHeader('src/fixed-ui-markup-3.js','cart-column-header','cartItemList');
  const order=markupHeader('src/fixed-ui-markup-5.js','order-column-header','detailModalItems');
  assertOrderedLabels(cart,columns,'cart');
  assertOrderedLabels(order,columns,'order preview');
});
test('share cart and public-order image headers keep same five full names',()=>{
  for(const source of ['src/fixed-ui-cart-share-v3.js','src/fixed-ui-public-order-image.js']){
    const file=read(source);
    const head=file.slice(file.indexOf('>STT</div>')-30,file.indexOf('>STT</div>')+440);
    assertOrderedLabels(head,columns,source);
    assert.doesNotMatch(head,/<input|onclick=|qty-edit-input/);
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
