import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const SUPABASE_URL=String(Deno.env.get('SUPABASE_URL')||'').trim();
const SERVICE_KEY=String(Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'').trim();
const db=createClient(SUPABASE_URL,SERVICE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const corsHeaders={
  'access-control-allow-origin':'*',
  'access-control-allow-methods':'GET,OPTIONS',
  'access-control-allow-headers':'content-type,apikey,x-client-info',
  'cache-control':'no-store',
};

function clean(value:unknown,max=500){
  return String(value??'').replace(/\s+/g,' ').trim().slice(0,max);
}
function json(data:unknown,status=200){
  return new Response(JSON.stringify(data),{
    status,
    headers:{'content-type':'application/json; charset=utf-8',...corsHeaders},
  });
}
function publicSlug(value:unknown){
  const slug=clean(value,100).toLowerCase();
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)?slug:'';
}
async function resolveCustomer(value:string){
  const slug=publicSlug(value);
  if(!slug)return null;

  const link=await db.from('v21_customer_public_links')
    .select('customer_account_id')
    .eq('public_slug',slug)
    .is('revoked_at',null)
    .maybeSingle();
  if(link.error)throw link.error;
  if(!link.data?.customer_account_id)return null;

  const account=await db.from('v21_accounts')
    .select('id,username,display_name')
    .eq('id',link.data.customer_account_id)
    .eq('role','user')
    .eq('contact_group','customer')
    .is('deleted_at',null)
    .is('locked_at',null)
    .maybeSingle();
  if(account.error)throw account.error;
  return account.data||null;
}
function displayCode(order:any){
  const prefix=clean(order?.display_prefix,4);
  const no=Number(order?.display_no)||0;
  return prefix&&no>0?`${prefix}${no}`:'';
}
async function summary(customer:any){
  const ledger=await db.from('taphoa_debt_ledger')
    .select('id,order_id,entry_type,amount_vnd,note,created_at')
    .eq('customer_account_id',customer.id)
    .order('created_at',{ascending:true})
    .order('id',{ascending:true})
    .limit(2000);
  if(ledger.error)throw ledger.error;

  const rows=Array.isArray(ledger.data)?ledger.data:[];
  const orderIds=[...new Set(rows.map((row:any)=>clean(row?.order_id,80)).filter(Boolean))];
  const orderMap=new Map<string,any>();
  if(orderIds.length){
    const orders=await db.from('taphoa_orders')
      .select('id,note,created_at,updated_at,delivered_at,display_prefix,display_no')
      .in('id',orderIds);
    if(orders.error)throw orders.error;
    for(const order of (orders.data||[]))orderMap.set(String(order.id),order);
  }

  let balance=0;
  let delivered=0;
  let collected=0;
  const allEntries=rows.map((row:any)=>{
    const amount=Number(row?.amount_vnd)||0;
    balance+=amount;
    if(row?.entry_type==='sale'&&amount>0)delivered+=amount;
    if(row?.entry_type==='collection'&&amount<0)collected+=Math.abs(amount);
    const order=row?.order_id?orderMap.get(String(row.order_id)):null;
    return {
      id:String(row?.id||''),
      entry_type:clean(row?.entry_type,30),
      amount_vnd:amount,
      note:clean(row?.note,240),
      created_at:row?.created_at||null,
      balance_after_vnd:balance,
      order:order?{
        id:String(order.id),
        display_code:displayCode(order),
        note:clean(order.note,240),
        delivered_at:order.delivered_at||null,
      }:null,
    };
  });
  const entries=allEntries.filter((entry:any)=>entry.entry_type!=='reversal');

  return {
    ok:true,
    customer:{display_name:clean(customer.display_name,80),username:clean(customer.username,40)},
    balance_vnd:balance,
    total_delivered_vnd:delivered,
    total_collected_vnd:collected,
    entry_count:entries.length,
    entries:entries.reverse().slice(0,500),
    generated_at:new Date().toISOString(),
  };
}
async function orderDetail(customer:any,orderId:string,displayCodeValue:string=''){
  let orderQuery=db.from('taphoa_orders')
    .select('id,note,created_at,updated_at,delivered_at,display_prefix,display_no')
    .eq('customer_account_id',customer.id);
  if(orderId){
    if(!/^[0-9a-f-]{36}$/i.test(orderId))return null;
    orderQuery=orderQuery.eq('id',orderId);
  }else{
    const match=/^(DG|DT)(\d+)$/i.exec(clean(displayCodeValue,32));
    if(!match)return null;
    orderQuery=orderQuery
      .eq('display_prefix',match[1].toUpperCase())
      .eq('display_no',Number(match[2]));
  }
  const orderResult=await orderQuery.maybeSingle();
  if(orderResult.error)throw orderResult.error;
  const order=orderResult.data;
  if(!order)return null;

  const itemsResult=await db.from('taphoa_order_items')
    .select('product_code,qty,unit_price_vnd,line_no,note')
    .eq('order_id',order.id)
    .order('line_no',{ascending:true});
  if(itemsResult.error)throw itemsResult.error;
  const items=Array.isArray(itemsResult.data)?itemsResult.data:[];
  const codes=[...new Set(items.map((item:any)=>clean(item?.product_code,100)).filter(Boolean))];
  const names=new Map<string,string>();
  if(codes.length){
    const products=await db.from('taphoa_products').select('product_code,product_name').in('product_code',codes);
    if(products.error)throw products.error;
    for(const product of (products.data||[]))names.set(String(product.product_code),clean(product.product_name,200));
  }

  let total=0;
  const publicItems=items.map((item:any)=>{
    const qty=Number(item?.qty)||0;
    const price=Number(item?.unit_price_vnd)||0;
    const line=qty*price;
    total+=line;
    const code=clean(item?.product_code,100);
    return {
      product_code:code,
      product_name:names.get(code)||code,
      qty,
      unit_price_vnd:price,
      line_total_vnd:line,
      note:clean(item?.note,160),
    };
  });

  return {
    ok:true,
    customer:{display_name:clean(customer.display_name,80)},
    order:{
      id:String(order.id),
      display_code:displayCode(order),
      note:clean(order.note,240),
      created_at:order.created_at||null,
      delivered_at:order.delivered_at||null,
      total_vnd:total,
      items:publicItems,
    },
  };
}

Deno.serve(async(req:Request)=>{
  try{
    if(req.method==='OPTIONS')return new Response(null,{status:204,headers:corsHeaders});
    if(req.method!=='GET')return json({ok:false,error:'method_not_allowed'},405);
    const url=new URL(req.url);
    const customerSlug=clean(url.searchParams.get('kh'),160);
    if(!customerSlug)return json({ok:false,error:'link_required'},400);
    const customer=await resolveCustomer(customerSlug);
    if(!customer)return json({ok:false,error:'not_found'},404);

    const orderId=clean(url.searchParams.get('order'),80);
    const displayCode=clean(url.searchParams.get('don'),32);
    if(orderId||displayCode){
      const detail=await orderDetail(customer,orderId,displayCode);
      return detail?json(detail):json({ok:false,error:'order_not_found'},404);
    }
    return json(await summary(customer));
  }catch(error){
    console.error('[taphoa-public-debt]',error);
    return json({ok:false,error:'internal_error'},500);
  }
});
