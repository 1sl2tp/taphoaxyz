const num=value=>Number.isFinite(Number(value))?Number(value):0;

export function orderRpcPayload(payload={}) {
  return {
    customer_id:String(payload.maKH||payload.customer_id||''),
    status:String(payload.status||'pending'),
    note:String(payload.ghiChu||payload.note||''),
    edit_order_id:String(payload.editOrderId||payload.edit_order_id||''),
    items:(payload.items||[]).map((item,index)=>({
      product_id:String(item.maSP||item.product_id||''),
      qty:num(item.sl??item.qty),
      unit_price:num(item.gia??item.unit_price),
      line_no:Math.max(0,Math.trunc(num(item.lineNo??item.line_no??index+1))),
      note:String(item.ghiChu||item.note||'')
    }))
  };
}

function defaultIdFactory(){
  if(globalThis.crypto?.randomUUID)return globalThis.crypto.randomUUID();
  return `cmd-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function createBusinessService({gateway,idFactory=defaultIdFactory}={}) {
  if(!gateway?.rpc)throw new Error('gateway.rpc is required');
  const commandId=()=>String(idFactory());
  return {
    bootstrap:()=>gateway.rpc('app_bootstrap',{}),
    meta:()=>gateway.rpc('app_meta',{}),
    domains:domains=>gateway.rpc('app_domains',{p_domains:[...new Set((domains||[]).map(String))]}),
    orderDetail:id=>gateway.rpc('order_detail',{p_order_id:String(id||'')}),
    debtLedger:(maKH,{beforeAt=null,beforeId=null,limit=50}={})=>gateway.rpc('debt_ledger_page',{
      p_customer_id:String(maKH||''),p_before_at:beforeAt||null,p_before_id:beforeId??null,p_limit:Math.max(1,Math.min(100,num(limit)||50))
    }),
    saveOrder:payload=>gateway.rpc('save_order',{p_order:orderRpcPayload(payload),p_command_id:commandId()}),
    deliverOrder:id=>gateway.rpc('deliver_order',{p_order_id:String(id||''),p_command_id:commandId()}),
    reverseOrder:(id,reason='Hoàn đơn')=>gateway.rpc('reverse_order',{p_order_id:String(id||''),p_reason:String(reason||'Hoàn đơn'),p_command_id:commandId()}),
    deletePending:id=>gateway.rpc('delete_pending_order',{p_order_id:String(id||''),p_command_id:commandId()}),
    batchOrders:(action,ids)=>gateway.rpc('batch_orders',{p_action:String(action||''),p_ids:(ids||[]).map(String),p_command_id:commandId()}),
    debtTransaction:(maKH,type,amount,note='')=>gateway.rpc('debt_transaction',{
      p_customer_id:String(maKH||''),p_type:String(type)==='thu_tien'?'collection':'payment',p_amount:num(amount),p_note:String(note||''),p_command_id:commandId()
    })
  };
}
