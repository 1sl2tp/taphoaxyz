const num=value=>Number.isFinite(Number(value))?Number(value):0;
const customerId=value=>{const id=String(value??'').trim();return !id||id==='le'?null:id;};

export function orderRpcPayload(payload={}) {
  return {
    customer_id:customerId(payload.maKH??payload.customer_id),
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
    bootstrap:()=>gateway.rpc('taphoa_app_bootstrap',{}),
    meta:()=>gateway.rpc('taphoa_app_meta',{}),
    domains:domains=>gateway.rpc('taphoa_app_domains',{p_domains:[...new Set((domains||[]).map(String))]}),
    orderDetail:id=>gateway.rpc('taphoa_order_detail',{p_order_id:String(id||'')}),
    debtLedger:(maKH,{beforeAt=null,beforeId=null,limit=50}={})=>gateway.rpc('taphoa_debt_ledger_page',{
      p_customer_id:String(maKH||''),p_before_at:beforeAt||null,p_before_id:beforeId??null,p_limit:Math.max(1,Math.min(100,num(limit)||50))
    }),
    saveOrder:payload=>gateway.rpc('taphoa_save_order',{p_order:orderRpcPayload(payload),p_command_id:commandId()}),
    deliverOrder:id=>gateway.rpc('taphoa_deliver_order',{p_order_id:String(id||''),p_command_id:commandId()}),
    reverseOrder:(id,reason='Hoàn đơn')=>gateway.rpc('taphoa_reverse_order',{p_order_id:String(id||''),p_reason:String(reason||'Hoàn đơn'),p_command_id:commandId()}),
    deletePending:id=>gateway.rpc('taphoa_delete_pending_order',{p_order_id:String(id||''),p_command_id:commandId()}),
    batchOrders:(action,ids)=>gateway.rpc('taphoa_batch_orders',{p_action:String(action||''),p_ids:(ids||[]).map(String),p_command_id:commandId()}),
    debtTransaction:(maKH,type,amount,note='')=>gateway.rpc('taphoa_debt_transaction',{
      p_customer_id:String(maKH||''),p_type:String(type)==='thu_tien'?'collection':'payment',p_amount:num(amount),p_note:String(note||''),p_command_id:commandId()
    }),
    productMediaCandidates:(query,limit=150)=>gateway.rpc('taphoa_product_media_candidates',{
      p_query:String(query||''),p_limit:Math.max(1,Math.min(200,Math.trunc(num(limit)||150)))
    }),
    marketSearch:(query,limit=80,source='')=>gateway.rpc('taphoa_market_search',{
      p_query:String(query||''),
      p_limit:Math.max(1,Math.min(120,Math.trunc(num(limit)||80))),
      p_source:String(source||'')
    }),
    setProductMedia:(productCode,canonicalProductId)=>gateway.rpc('taphoa_set_product_media',{
      p_product_code:String(productCode||''),p_canonical_product_id:String(canonicalProductId||'')
    }),
    setProductMediaCompare:(productCode,kind,unitsPerCarton=null)=>gateway.rpc('taphoa_set_product_media_compare',{
      p_product_code:String(productCode||''),p_kind:String(kind||''),p_units_per_carton:unitsPerCarton===null?null:num(unitsPerCarton)
    }),
    setProductMediaOwnQc:(productCode,unitsPerCarton)=>gateway.rpc('taphoa_set_product_media_own_qc',{
      p_product_code:String(productCode||''),p_units_per_carton:num(unitsPerCarton)
    }),
    clearProductMedia:productCode=>gateway.rpc('taphoa_clear_product_media',{
      p_product_code:String(productCode||'')
    })
  };
}