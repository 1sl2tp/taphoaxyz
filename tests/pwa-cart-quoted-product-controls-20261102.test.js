import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

// SPEC-TAPHOA-CART-SAFE-HANDLERS-20261102
// Given a cart row with quotes/HTML characters in its name or code,
// +/- actions and numeric input keep the exact values, not an inline JS string.
const source=readFileSync(new URL('../src/fixed-ui-runtime-6.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');

test('cart +/- use escaped data attributes, not injected JS string arguments',()=>{
  for(const direction of [-1,1]){
    const command='updateCart(this.dataset.cartProductCode, this.dataset.cartProductName, Number(this.dataset.cartPrice), '+direction+')';
    assert.ok(source.includes('onclick="'+command+'"'),'both buttons use data-bound command');
    assert.ok(!source.includes("onclick=\"updateCart('${id}', '${item.name}'"),'no raw inline JS');
  }
  assert.equal(source.split('data-cart-product-code="${escapeProductEditorValue(id)}"').length-1,2);
  assert.equal(source.split('data-cart-product-name="${escapeProductEditorValue(item.name)}"').length-1,3,'two quantity buttons plus the existing note button');
  assert.ok(source.includes('data-qty-id="${escapeProductEditorValue(id)}"'));
  assert.ok(source.includes('data-qty-price="${Number(item.price)}"'));
  assert.ok(html.includes('safe-cart-quotes=20261102'),'fresh script query avoids stale handlers');
});

test('both buttons preserve product code, name and price even with quotes',()=>{
  const name='Cô O\'Brien & "Bánh" <sale>';
  const code='SP\'12" & <code>';
  const button={dataset:{cartProductCode:code,cartProductName:name,cartPrice:'12500'}};
  for(const direction of [-1,1]){
    const command='updateCart(this.dataset.cartProductCode, this.dataset.cartProductName, Number(this.dataset.cartPrice), '+direction+')';
    const calls=[];
    const handler=vm.runInNewContext('(function(){'+command+'})',{updateCart:(...args)=>calls.push(args)});
    handler.call(button);
    assert.deepEqual(calls,[[code,name,12500,direction]]);
  }
});
