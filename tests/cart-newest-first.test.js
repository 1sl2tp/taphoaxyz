import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const runtime = fs.readFileSync('src/fixed-ui-runtime-5.js', 'utf8');
const behavior = fs.readFileSync('src/fixed-ui-behavior.js', 'utf8');
const savedOrder = fs.readFileSync('src/fixed-ui-runtime-12.js', 'utf8');
const cartView = fs.readFileSync('src/fixed-ui-runtime-6.js', 'utf8');
const html = fs.readFileSync('index.html', 'utf8');
const between = (s, start, end) => {
  const a = s.indexOf(start);
  const b = s.indexOf(end, a + start.length);
  assert.ok(a >= 0 && b > a, 'missing source function '+start);
  return s.slice(a, b);
};
const qtyOwners = between(runtime, 'function previewQtyInput(input)', 'function updateCart(maSp');
const plusOwner = between(behavior, 'let __cartTouchSeq = 0;', 'function parseCartPriceInputValue');

function createHarness() {
  const renders = [];
  const ctx = {
    cart: {},
    currentAuthRole: 'admin',
    editingOrderSheet: null,
    updateCart() {},
    getQtyMeta: code => ({name:code, price:100}),
    clampQty: (value, fallback) => {
      const parsed = Number.parseInt(value, 10);
      return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
    },
    syncQtyEditors() {},
    refreshCartTotalsOnly() {},
    renderCartUI() {
      renders.push(Object.entries(ctx.cart)
        .sort(([,a], [,b]) => (Number(b.__lastTouched)||0)-(Number(a.__lastTouched)||0))
        .map(([key]) => key));
    }
  };
  vm.createContext(ctx);
  vm.runInContext(plusOwner + '\n' + qtyOwners, ctx);
  const input = (code, qty) => ({
    dataset: {qtyId:code,qtyEditor:'product'},
    value: String(qty)
  });
  return {ctx,renders,input,
    order:() => Object.entries(ctx.cart)
      .sort(([,a],[,b]) => (Number(b.__lastTouched)||0)-(Number(a.__lastTouched)||0))
      .map(([key]) => key),
    stamp:code => ctx.cart[code]?.__lastTouched,
    seq:() => vm.runInContext('__cartTouchSeq', ctx)
  };
}

test('new product via + and direct product-card quantity both move to top; edits do not', () => {
  const h = createHarness();
  const {ctx,input} = h;
  ctx.updateCart('older','older',100,1);
  assert.deepEqual(h.order(),['older']);
  assert.equal(h.stamp('older'),1);

  ctx.previewQtyInput(input('typed',10));
  assert.deepEqual(h.order(),['typed','older'],
    'first typed quantity must place new line above older plus-added line');
  assert.equal(h.stamp('typed'),2);
  ctx.commitQtyEditor(input('typed',10));
  ctx.previewQtyInput(input('typed',15));
  ctx.commitQtyEditor(input('typed',15));
  assert.deepEqual(h.order(),['typed','older'],'input and blur do not re-rank existing rows');
  assert.equal(h.stamp('typed'),2);
  assert.equal(ctx.cart.typed.qty,15);

  ctx.commitQtyEditor(input('commit-only',5));
  assert.deepEqual(h.order(),['commit-only','typed','older'],
    'new line committed without input event also has newest-first order');
  assert.equal(h.stamp('commit-only'),3);
  ctx.updateCart('older','older',100,2);
  assert.deepEqual(h.order(),['commit-only','typed','older'],
    'quantity plus of an existing line must not change its position');
  assert.equal(ctx.cart.older.qty,3);
  assert.equal(h.seq(),3,'exactly one sequence increment per new product');
});

test('deleting then adding same SKU is a new line; totals and item identity are unchanged', () => {
  const h = createHarness(), {ctx,input} = h;
  ctx.previewQtyInput(input('dau-nep-1',10));
  ctx.previewQtyInput(input('dau-nep-2',10));
  const qty=ctx.cart['dau-nep-2'].qty;
  ctx.updateCart('dau-nep-1','dau-nep-1',100,-10);
  assert.equal(ctx.cart['dau-nep-1'],undefined);
  ctx.updateCart('dau-nep-1','dau-nep-1',100,1);
  assert.deepEqual(h.order(),['dau-nep-1','dau-nep-2']);
  assert.equal(ctx.cart['dau-nep-1'].price,100);
  assert.equal(ctx.cart['dau-nep-2'].qty,qty);
  assert.equal(h.stamp('dau-nep-1'),3);
});

test('saved order keeps its line-number order and cart renderer uses same one rank', () => {
  assert.match(savedOrder,/const touchBase = __cartTouchSeq \+ items.length/);
  assert.match(savedOrder,/__lastTouched: touchBase - index/);
  assert.match(savedOrder,/__cartTouchSeq = touchBase/);
  assert.match(cartView,/Object\.entries\(cart\)\.sort\(\(\[, a\], \[, b\]\) =>\s*\(Number\(b\.__lastTouched\) \|\| 0\) - \(Number\(a\.__lastTouched\) \|\| 0\)/);
  assert.match(html,/fixed-ui-runtime-5\.js\?v=[^"]*&newest-cart-qty=20261015/);
});
