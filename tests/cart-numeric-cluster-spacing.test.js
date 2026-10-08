import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const css = fs.readdirSync('src')
  .filter(name => /^fixed-ui-.*\.css$/.test(name))
  .sort()
  .map(name => fs.readFileSync(path.join('src', name), 'utf8'))
  .join('\n');

const index = fs.readFileSync('index.html', 'utf8');

test('cart numeric cluster keeps fixed tracks around quantity and right-aligns total', () => {
  assert.match(css, /FIXED STYLE: compact-cart-numeric-cluster/);
  assert.match(css, /\.cart-compact-grid\s*\{[^}]*grid-template-columns:\s*minmax\(0,1fr\)\s+64px\s+124px\s+84px\s*!important;[^}]*column-gap:\s*8px\s*!important;[^}]*justify-content:\s*stretch\s*!important;/);
  assert.match(css, /\.cart-price\s*\{[^}]*text-align:\s*right\s*!important;/);
  assert.match(css, /\.cart-total\s*\{[^}]*text-align:\s*right\s*!important;/);
  assert.match(index, /fixed-ui-cart-spacing\.css/);
});

test('Sales and Cart quantity controls share one desktop and phone ruler', () => {
  const owner=fs.readFileSync('src/fixed-ui-cart-spacing.css','utf8');
  const media=fs.readFileSync('src/fixed-ui-product-media.css','utf8');
  assert.ok(owner.includes('#tab-ban-hang .product-card .flex.items-center.gap-1.border'));
  assert.ok(owner.includes('#cartItemList .cart-qty-control'));
  assert.ok(owner.includes('grid-template-columns:36px 40px 36px !important'));
  assert.ok(owner.includes('grid-template-columns:40px 40px 40px !important'));
  assert.ok(owner.includes('#cartBottomSheet .cart-compact-grid .cart-price'));
  assert.ok(owner.includes('#cartBottomSheet .cart-compact-grid .cart-total'));
  assert.ok(media.includes('width:40px !important'));
});

test('Order detail header and rows share one five-column ruler', () => {
  const owner=fs.readFileSync('src/fixed-ui-cart-spacing.css','utf8');
  assert.ok(owner.includes('grid-template-columns:26px minmax(0,1fr) 58px 30px 80px !important'));
  assert.ok(owner.includes('grid-template-columns:22px minmax(0,1fr) 52px 28px 72px !important'));
});

// Regression from iPhone IMG_9463/9464/9465: captions and quantity axes.
test('mobile cart label row and price/readonly/edit values share the same vertical geometry', () => {
  const css=fs.readFileSync('src/fixed-ui-cart-spacing.css','utf8');
  assert.ok(css.includes('#cartItemList .cart-compact-grid .cart-field-caption'));
  assert.ok(css.includes('#cartItemList .cart-price .cart-money-value'));
  assert.ok(css.includes('#cartItemList .cart-total .cart-money-value'));
  assert.ok(css.includes('min-height:46px'));
  assert.ok(css.includes('#cartItemList .cart-qty-readonly'));
  assert.ok(css.includes('#cartItemList .cart-qty > .cart-field-caption'));
  assert.ok(index.includes('fixed-ui-cart-spacing.css?ui=cart-height-preview-20261008'));
});
test('sales product quantity shares horizontal row on normal iPhone, with 340px fallback', () => {
  const css=fs.readFileSync('src/fixed-ui-product-media.css','utf8');
  assert.ok(css.includes('flex-wrap:nowrap;'));
  assert.ok(css.includes('flex:0 0 132px;'));
  assert.ok(css.includes('@media (max-width:340px)'));
});

// The one-item iPhone preview is content-height, editing and preview use equal
// sized Qty columns, and narrow phones preserve the full monetary amount.
test('mobile cart adapts sheet height and preserves the list inner scroll', () => {
  const css=fs.readFileSync('src/fixed-ui-cart-spacing.css','utf8');
  assert.match(css, /#cartBottomSheet\s*\{\s*height:auto !important;\s*max-height:88vh !important;\s*max-height:88dvh !important;/);
  assert.match(css, /#cartItemList\s*\{\s*flex:0 1 auto !important;\s*min-height:0 !important;\s*overflow-y:auto !important;/);
  assert.ok(css.includes('width:132px !important'));
  assert.ok(css.includes('@media (max-width:360px)'));
  assert.ok(index.includes('cart-height-preview-20261008'));
});
test('cart preview does not insert phantom empty note height when there is no note', () => {
  const js=fs.readFileSync('src/fixed-ui-runtime-6.js','utf8');
  assert.doesNotMatch(js, /: '<div class="min-h-\[18px\]"><\/div>'\)/);
  assert.ok(js.includes('cart-qty-readonly'));
});
