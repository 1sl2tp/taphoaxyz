import test from 'node:test';
import assert from 'node:assert/strict';
import {salesMarkup} from '../src/screens/sales.js';
import {deliveredMarkup} from '../src/screens/delivered.js';
import {pendingMarkup} from '../src/screens/pending.js';

const userPermissions={canManageOrders:false,canManageDebt:false,canViewCost:false};
const product={id:'p1',ten:'Sua green',gia:120,von:90,donVi:'thung',nhom:'sua'};
const order={
  id:'o1',tenKH:'Khach A',status:'pending',trangThai:'pending',ngay:'2026-09-15T09:00:00Z',
  tongTien:240,tongVon:180,loiNhuan:60,
  items:[{id:'i1',tenSP:'Sua green',sl:2,gia:120,von:90,nhom:'sua'}]
};

test('customer sales tab is read-only and never renders input cost',()=>{
  const html=salesMarkup({products:[product],permissions:userPermissions});
  assert.doesNotMatch(html,/sales-cost/);
  assert.doesNotMatch(html,/data-price-id=/);
  assert.doesNotMatch(html,/data-qty-action=/);
  assert.doesNotMatch(html,/data-cart-open/);
  assert.match(html,/120/);
});

test('customer delivered tab hides cost profit and admin actions',()=>{
  const delivered={...order,status:'done',trangThai:'done'};
  const html=deliveredMarkup({orders:[delivered],selected:delivered,permissions:userPermissions});
  assert.doesNotMatch(html,/>CHI</);
  assert.doesNotMatch(html,/>LÃI</);
  assert.doesNotMatch(html,/Lợi nhuận/);
  assert.doesNotMatch(html,/data-detail-action="edit"/);
  assert.doesNotMatch(html,/data-detail-action="delete"/);
  assert.match(html,/240/);
});

test('customer pending tab hides cost profit and mutation controls',()=>{
  const html=pendingMarkup({orders:[order],selectedOrder:order,permissions:userPermissions});
  assert.doesNotMatch(html,/>CHI</);
  assert.doesNotMatch(html,/>LÃI</);
  assert.doesNotMatch(html,/data-delete-all/);
  assert.doesNotMatch(html,/data-order-action="edit"/);
  assert.doesNotMatch(html,/data-order-action="deliver"/);
  assert.doesNotMatch(html,/data-order-action="delete"/);
  assert.match(html,/240/);
});
