import test from 'node:test';
import assert from 'node:assert/strict';
import {salesMarkup,salesActiveSurface} from '../src/screens/sales.js';
import {auditMarkupStructure} from '../src/core/ui-structure.js';
import {SCREEN_STRUCTURE_CONTRACTS} from '../src/contracts/ui-structure.js';

const html=salesMarkup({products:[{id:'p1',ten:'SP 1',gia:125,nhom:'N1'}],customers:[]});

test('Sales markup matches contract',()=>{
  const result=auditMarkupStructure(html,SCREEN_STRUCTURE_CONTRACTS.sales);
  assert.equal(result.pass,true,result.issues.map(x=>x.message).join('\n'));
});

test('Sales source order is Context -> Controls -> Product List',()=>{
  const ids=['sales-context-region','sales-product-controls','sales-product-list'];
  const p=ids.map(id=>html.indexOf(`data-ui-id="${id}"`));
  assert.ok(p.every(x=>x>=0));assert.deepEqual([...p].sort((a,b)=>a-b),p);
});

test('Cart is a Surface, not navigation overlay',()=>{
  assert.match(html,/data-ui-id="sales-cart-surface"/);
  assert.doesNotMatch(html,/sales-cart-backdrop/);
});

test('mobile active Surface derives from cartOpen only',()=>{
  assert.equal(salesActiveSurface({cartOpen:false}),'products');
  assert.equal(salesActiveSurface({cartOpen:true}),'cart');
});
