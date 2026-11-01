import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

// SPEC-PWA-PRODUCT-QUOTE-CART-20261101
// GIVEN a product name with apostrophes, quotes and ampersands,
// WHEN tapping +/- on PWA, THEN updateCart receives the exact product
// code, name and price, with no broken inline JavaScript or HTML.
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const source=read('src/fixed-ui-runtime-4.js');
const escSource=read('src/fixed-ui-runtime-3.js');

test('product display, dataset and quantity code are escaped and safe for HTML',()=>{
  assert.ok(source.includes('${escapeProductEditorValue(tenSp)}</p>'));
  assert.ok(source.includes('data-cart-product-code="${escapeProductEditorValue(maSp)}"'));
  assert.ok(source.includes('data-cart-product-name="${escapeProductEditorValue(tenSp)}"'));
  assert.ok(source.includes('data-qty-id="${escapeProductEditorValue(maSp)}"'));
  assert.ok(!source.includes("onclick=\"updateCart('"+String.fromCharCode(36)+"{maSp}'"));
  assert.ok(source.includes('onclick="updateCart(this.dataset.cartProductCode, this.dataset.cartProductName, Number(this.dataset.cartPrice), 1)"'));
  assert.ok(source.includes('onclick="updateCart(this.dataset.cartProductCode, this.dataset.cartProductName, Number(this.dataset.cartPrice), -1)"'));
});

test('HTML escaping keeps apostrophes and escapes double quotes and HTML punctuation',()=>{
  const start=escSource.indexOf('function escapeProductEditorValue(value)');
  const end=escSource.indexOf('document.addEventListener',start);
  assert.ok(start>=0&&end>start);
  const htmlEscape=vm.runInNewContext('('+escSource.slice(start,end).trim()+')');
  const name="O'Brien & \u0022Lẻ\u0022 <500>";
  assert.equal(htmlEscape(name),"O'Brien &amp; &quot;Lẻ&quot; &lt;500&gt;");
});

test('both inline handlers send original name/code including apostrophes to cart',()=>{
  const name="O'Brien & \u0022Lẻ\u0022 <500>";
  const code="SP'5";
  const button={dataset:{cartProductCode:code,cartProductName:name,cartPrice:'15900'}};
  for(const direction of [-1,1]){
    const command='updateCart(this.dataset.cartProductCode, this.dataset.cartProductName, Number(this.dataset.cartPrice), '+direction+')';
    assert.ok(source.includes('onclick="'+command+'"'));
    const calls=[];
    const fn=vm.runInNewContext('(function(){ '+command+'; })',{
      updateCart:(...args)=>calls.push(args),
      Number
    });
    fn.call(button);
    assert.deepEqual(calls,[[code,name,15900,direction]]);
  }
});
