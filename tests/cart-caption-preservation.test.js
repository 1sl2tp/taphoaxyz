import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const behavior=fs.readFileSync('src/fixed-ui-behavior.js','utf8');
const qty=fs.readFileSync('src/fixed-ui-runtime-5.js','utf8');
const css=fs.readFileSync('src/fixed-ui-cart-spacing.css','utf8');
const html=fs.readFileSync('index.html','utf8');

// Screenshot IMG_9468 11:51: the edit overlay removed the "Đơn giá" label.
test('cart price editor preserves label and numeric row',()=>{
  assert.match(behavior,/priceCell\.innerHTML\s*=\s*`<span class="cart-field-caption">Đơn giá<\/span><input/);
  assert.match(behavior,/class="cart-money-value cart-price-input/);
  assert.match(css,/#cartItemList \.cart-price input\.cart-money-value\{[^}]*height:46px !important;[^}]*text-align:left !important;/);
});

test('quantity and price previews retain the total caption',()=>{
  assert.equal((qty.match(/querySelector\('\.cart-total \.cart-money-value'\)/g)||[]).length,2);
  assert.match(behavior,/querySelector\('\.cart-total \.cart-money-value'\)/);
  assert.doesNotMatch(qty,/if \(totalEl\) totalEl\.innerText = \(qty \* meta\.price\)/);
  assert.doesNotMatch(behavior,/if \(totalEl\) totalEl\.innerText = \(\(Number\(item\.qty\)/);
});

test('cart label fix has fresh file URLs for mobile app',()=>{
  assert.match(html,/cart-caption-20261008/);
  assert.match(html,/fixed-ui-runtime-5\.js\?v=cart-total-caption-20261008/);
  assert.match(html,/fixed-ui-behavior\.js\?v=[^"]*cart-caption-20261008/);
});
