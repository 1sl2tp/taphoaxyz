import test from 'node:test';
import assert from 'node:assert/strict';
import {salesMarkup,cartTotals,buildOrderDraft} from '../src/screens/sales.js';

const product={id:'tl1',ten:'Cứng',nhom:'Thuốc lá',gia:125,von:124,donVi:''};

test('sales UI keeps backend gia literal without x1000 conversion',()=>{
  const html=salesMarkup({products:[product],customers:[]});
  assert.match(html,/data-price-id="tl1"/);
  assert.match(html,/value="125"/);
  assert.doesNotMatch(html,/value="125000"/);
});

test('cart totals use literal backend sale price',()=>{
  const totals=cartTotals([product],{tl1:2},{});
  assert.equal(totals.total,250);
  assert.equal(totals.totalCost,248);
});

test('order draft sends literal gia as unit_price source value',()=>{
  const draft=buildOrderDraft({customerId:'kh1',cart:{tl1:1},products:[product]});
  assert.equal(draft.items.length,1);
  assert.equal(draft.items[0].gia,125);
});
