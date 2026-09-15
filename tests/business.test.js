import test from 'node:test';
import assert from 'node:assert/strict';
import {createBusinessService} from '../src/core/business.js';

function fakeService(){
  const calls=[];
  const gateway={rpc:async(name,args)=>{calls.push([name,args]);return {name,args};}};
  return {service:createBusinessService({gateway,idFactory:()=>"00000000-0000-4000-8000-000000000001"}),calls};
}

test('read methods route only to TAPHOA namespaced RPCs',async()=>{
  const {service,calls}=fakeService();
  await service.bootstrap();
  await service.meta();
  await service.domains(['products','products','debt']);
  await service.orderDetail('order-1');
  await service.debtLedger('customer-1',{beforeAt:'2026-09-15T00:00:00Z',beforeId:9,limit:25});
  assert.deepEqual(calls,[
    ['taphoa_app_bootstrap',{}],
    ['taphoa_app_meta',{}],
    ['taphoa_app_domains',{p_domains:['products','debt']}],
    ['taphoa_order_detail',{p_order_id:'order-1'}],
    ['taphoa_debt_ledger_page',{p_customer_id:'customer-1',p_before_at:'2026-09-15T00:00:00Z',p_before_id:9,p_limit:25}]
  ]);
});

test('mutation methods route only to TAPHOA namespaced RPCs',async()=>{
  const {service,calls}=fakeService();
  await service.saveOrder({maKH:'customer-1',status:'pending',items:[{maSP:'HU-1',sl:2,gia:10,lineNo:1}]});
  await service.deliverOrder('order-1');
  await service.reverseOrder('order-1','Hoàn đơn');
  await service.deletePending('order-2');
  await service.batchOrders('delete_pending',['order-2','order-3']);
  await service.debtTransaction('customer-1','thu_tien',125,'Thu tiền');
  assert.deepEqual(calls.map(([name])=>name),[
    'taphoa_save_order','taphoa_deliver_order','taphoa_reverse_order',
    'taphoa_delete_pending_order','taphoa_batch_orders','taphoa_debt_transaction'
  ]);
  for(const [,args] of calls)assert.equal(args.p_command_id,'00000000-0000-4000-8000-000000000001');
  assert.equal(calls[0][1].p_order.items[0].unit_price,10);
  assert.equal(calls[5][1].p_type,'collection');
  assert.equal(calls[5][1].p_amount,125);
});
