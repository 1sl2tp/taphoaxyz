import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const src=fs.readFileSync('src/fixed-production-overrides.js','utf8');
const start=src.indexOf('async function assertDraftAlreadySavedForDelivery(');
const end=src.indexOf('dayToanBoGioHang=async function(',start);
assert.ok(start>=0&&end>start,'Draft guard not present');
const code=src.slice(start,end).trim();
const item=(price=146,qty=1,note='')=>({
  product_id:'TL-000013',qty,unit_price:price,note
});
const cartItem=(price=146,qty=1,note='')=>({
  maSP:'TL-000013',sl:qty,gia:price,ghiChu:note
});
function guarded(saved){
  const calls=[];
  const backend=()=>({orderDetail:async id=>{calls.push(id);return {order:saved};}});
  return {fn:vm.runInNewContext('('+code+')',{backend}),calls};
}

test('draft promotion checks the authoritative saved version before delivery',async()=>{
  const {fn,calls}=guarded({
    status:'pending',customer_id:'customer-1',items:[item()]
  });
  await fn('draft-uuid','customer-1',[cartItem()]);
  assert.deepEqual(calls,['draft-uuid']);
  const body=src.slice(src.indexOf('if(isPromotingDraft){\n        await assertDraft'),src.indexOf('if(isPromotingDraft){\n        await assertDraft')+280);
  assert.match(body,/await assertDraftAlreadySavedForDelivery\(backendEditOrderId,selectedCustomer\.id,items\)/);
  assert.ok(body.indexOf('assertDraftAlreadySavedForDelivery')<body.indexOf('backend().deliverOrder'));
});

test('draft promotion does not discard unsaved changes or cross-customer edits',async()=>{
  for(const changed of [cartItem(151),cartItem(146,5),cartItem(146,1,'new')]){
    const {fn}=guarded({
      status:'pending',customer_id:'customer-1',items:[item()]
    });
    await assert.rejects(()=>fn('draft-uuid','customer-1',[changed]),/thay đổi chưa lưu/);
  }
  const mismatched=guarded({status:'pending',customer_id:'customer-2',items:[item()]});
  await assert.rejects(()=>mismatched.fn('draft-uuid','customer-1',[cartItem()]),/Khách đang chọn/);
  const delivered=guarded({status:'done',customer_id:'customer-1',items:[item()]});
  await assert.rejects(()=>delivered.fn('draft-uuid','customer-1',[cartItem()]),/thay đổi trạng thái/);
});
