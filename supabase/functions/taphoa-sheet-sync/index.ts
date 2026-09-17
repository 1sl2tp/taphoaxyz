import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { JWT } from "npm:google-auth-library@9.15.1";

const SUPABASE_URL=Deno.env.get("SUPABASE_URL")??"";
const SERVICE_ROLE_KEY=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")??"";
const ANON_KEY=Deno.env.get("SUPABASE_ANON_KEY")??"";
const MANAGEMENT_FILE_ID="1hGqAzIEqTMmULIeh5sCmed2R3XaiA9QZavtGRdNvyyU";
const TAPHOA_TABLES=["taphoa_products","taphoa_sources","taphoa_sheet_sync_state","taphoa_revisions","taphoa_product_sheet_state","taphoa_product_outbox"] as const;

const SOURCES=[
  {source_key:"hang-u",name:"Hàng U",sort_order:1,tab:"Hàng U",prefix:"HU-"},
  {source_key:"thuoc-la",name:"Thuốc lá",sort_order:2,tab:"Thuốc lá",prefix:"TL-"},
  {source_key:"sua",name:"Sữa",sort_order:3,tab:"Sữa",prefix:"SUA-"},
  {source_key:"masan",name:"Hàng masan",sort_order:4,tab:"Hàng masan",prefix:"MAS-"},
  {source_key:"hang-thuong",name:"Hàng thường",sort_order:5,tab:"Hàng thường",prefix:"HT-"}
] as const;

type StockStatus="available"|"out_of_stock"|"no_price";
type Source=(typeof SOURCES)[number];
type TaphoaProduct={
  product_code:string;source_key:string;source_row:number;product_name:string;
  input_price_vnd:number|null;input_price_basis:"carton"|"retail";expected_profit_percent:number|null;
  applied_profit_vnd:number;sale_price_vnd:number|null;carton_price_vnd:number|null;retail_price_vnd:number|null;
  units_per_carton:number|null;retail_unit:string;stock_status:StockStatus;stock_label:string;is_active:boolean;
  raw_row:unknown[];sheet_updated_at:string|null;
};
type SheetState={product_code:string;source_key:string;sheet_row:number;sheet_hash:string;last_pushed_hash:string};
type OutboxRow={id:number;product_code:string;source_key:string;payload:Record<string,unknown>;row_hash:string;attempts:number};

const admin=createClient(SUPABASE_URL,SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
let googleJwt:JWT|null=null;

export function clean(v:unknown):string{return String(v??"").trim();}
export function num(v:unknown):number|null{
  if(v===null||v===undefined||clean(v)==="")return null;
  if(typeof v==="number")return Number.isFinite(v)?v:null;
  let s=clean(v).replace(/\s+/g,"");
  if(/^[-+]?\d+(?:[.,]\d+)?$/.test(s)){
    if(s.includes(",")&&!s.includes("."))s=s.replace(",",".");
    const parsed=Number(s);return Number.isFinite(parsed)?parsed:null;
  }
  const parsed=Number(s.replace(/[^0-9.-]/g,""));
  return Number.isFinite(parsed)?parsed:null;
}
function sourceByKey(sourceKey:string):Source|undefined{return SOURCES.find(s=>s.source_key===sourceKey);}

export function mapManagerRow(sourceKey:string,row:unknown[],rowNo:number,modifiedTime:string|null=null):TaphoaProduct|null{
  const source=sourceByKey(sourceKey);if(!source)return null;
  const code=clean(row[0]).toUpperCase();
  const name=clean(row[1]);
  const inputSheet=num(row[2]);
  const saleSheet=num(row[3]);
  if(!code||!name)return null;
  const input_price_vnd=inputSheet!==null&&inputSheet>0?Math.round(inputSheet*1000):null;
  const sale_price_vnd=saleSheet!==null&&saleSheet>0?Math.round(saleSheet*1000):null;
  const applied_profit_vnd=input_price_vnd!==null&&sale_price_vnd!==null?Math.max(0,sale_price_vnd-input_price_vnd):0;
  const stock=sale_price_vnd!==null?{status:"available" as StockStatus,label:""}:{status:"no_price" as StockStatus,label:"Chưa có giá"};
  return {
    product_code:code,source_key:source.source_key,source_row:rowNo,product_name:name,
    input_price_vnd,input_price_basis:"carton",expected_profit_percent:null,applied_profit_vnd,
    sale_price_vnd,carton_price_vnd:sale_price_vnd,retail_price_vnd:null,units_per_carton:null,retail_unit:"",
    stock_status:stock.status,stock_label:stock.label,is_active:true,raw_row:[...row],sheet_updated_at:modifiedTime
  };
}

function canonicalRow(product:TaphoaProduct){
  return `${product.product_code.toUpperCase().trim()}|${product.product_name.trim()}|${product.input_price_vnd??""}|${product.sale_price_vnd??""}`;
}
async function rowHash(product:TaphoaProduct){
  const bytes=new TextEncoder().encode(canonicalRow(product));
  const digest=await crypto.subtle.digest("SHA-256",bytes);
  return Array.from(new Uint8Array(digest)).map(b=>b.toString(16).padStart(2,"0")).join("");
}
function json(body:unknown,status=200){return new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json","cache-control":"no-store","access-control-allow-origin":"*"}});}
function quotedSheet(name:string){return `'${name.replace(/'/g,"''")}'`;}

async function googleToken(){
  if(!googleJwt){
    const raw=Deno.env.get("GOOGLE_SERVICE_ACCOUNT_JSON");
    if(!raw)throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON_missing");
    const credentials=JSON.parse(raw);
    googleJwt=new JWT({email:credentials.client_email,key:credentials.private_key,scopes:[
      "https://www.googleapis.com/auth/spreadsheets",
      "https://www.googleapis.com/auth/drive.metadata.readonly"
    ]});
  }
  const token=await googleJwt.authorize();
  if(!token.access_token)throw new Error("google_access_token_missing");
  return token.access_token;
}
async function googleFetch(url:string,init:RequestInit={}){
  const headers=new Headers(init.headers||{});headers.set("authorization",`Bearer ${await googleToken()}`);
  const response=await fetch(url,{...init,headers});
  if(!response.ok)throw new Error(`google_http_${response.status}:${(await response.text()).slice(0,400)}`);
  return response;
}
async function driveModifiedTime(){
  const response=await googleFetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(MANAGEMENT_FILE_ID)}?fields=modifiedTime`);
  const data=await response.json();const value=clean(data?.modifiedTime);
  if(!value||Number.isNaN(Date.parse(value)))throw new Error("manager_modified_time_missing");
  return new Date(value).toISOString();
}
async function readManagerTab(tab:string){
  const range=`${quotedSheet(tab)}!A:D`;
  const url=`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(MANAGEMENT_FILE_ID)}/values/${encodeURIComponent(range)}?majorDimension=ROWS&valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING`;
  const data=await (await googleFetch(url)).json();
  return Array.isArray(data?.values)?data.values as unknown[][]:[];
}
async function writeManagerRow(tab:string,rowNo:number,values:unknown[]){
  const range=`${quotedSheet(tab)}!A${rowNo}:D${rowNo}`;
  const url=`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(MANAGEMENT_FILE_ID)}/values/${encodeURIComponent(range)}?valueInputOption=RAW`;
  await googleFetch(url,{method:"PUT",headers:{"content-type":"application/json"},body:JSON.stringify({range,majorDimension:"ROWS",values:[values]})});
}

async function authorized(req:Request){
  const cron=clean(req.headers.get("x-taphoa-cron"));
  if(cron){const {data,error}=await admin.rpc("taphoa_validate_sheet_sync_cron",{p_secret:cron});if(!error&&data===true)return {kind:"cron" as const};}
  const authorization=clean(req.headers.get("authorization"));
  if(!authorization.toLowerCase().startsWith("bearer ")||!ANON_KEY)return null;
  const userClient=createClient(SUPABASE_URL,ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false},global:{headers:{Authorization:authorization}}});
  const {data:ctx,error}=await userClient.rpc("taphoa_access_context");
  if(error||ctx?.allowed!==true||ctx?.taphoa_role!=="admin")return null;
  return {kind:"admin" as const};
}
async function readSyncState(){const {data,error}=await admin.from("taphoa_sheet_sync_state").select("*").eq("id",1).single();if(error)throw error;return data;}
async function setSyncState(patch:Record<string,unknown>){const {error}=await admin.from("taphoa_sheet_sync_state").update({...patch,updated_at:new Date().toISOString()}).eq("id",1);if(error)throw error;}

async function processOutbound(){
  const {data,error}=await admin.from("taphoa_product_outbox").select("id,product_code,source_key,payload,row_hash,attempts").eq("status","pending").order("id",{ascending:true}).limit(100);
  if(error)throw error;
  const pending=(data||[]) as OutboxRow[];if(!pending.length)return 0;
  const tabCache=new Map<string,unknown[][]>();let pushed=0;
  for(const item of pending){
    try{
      const source=sourceByKey(item.source_key);if(!source)throw new Error("source_not_found");
      let rows=tabCache.get(source.source_key);if(!rows){rows=await readManagerTab(source.tab);tabCache.set(source.source_key,rows);}
      const rowIndex=rows.findIndex((r,index)=>index>0&&clean(r?.[0]).toUpperCase()===item.product_code.toUpperCase());
      if(rowIndex<1)throw new Error(`sheet_row_not_found:${item.product_code}`);
      const payload=item.payload||{};
      const inputVnd=num(payload.input_price_vnd);const saleVnd=num(payload.sale_price_vnd);
      const values=[item.product_code,clean(payload.product_name),inputVnd===null?"":inputVnd/1000,saleVnd===null?"":saleVnd/1000];
      await writeManagerRow(source.tab,rowIndex+1,values);
      const now=new Date().toISOString();
      const {error:outError}=await admin.from("taphoa_product_outbox").update({status:"pushed",pushed_at:now,updated_at:now,last_error:""}).eq("id",item.id);if(outError)throw outError;
      const {error:stateError}=await admin.from("taphoa_product_sheet_state").upsert({product_code:item.product_code,source_key:item.source_key,sheet_row:rowIndex+1,last_pushed_hash:item.row_hash,last_pushed_at:now,updated_at:now},{onConflict:"product_code"});if(stateError)throw stateError;
      pushed++;
    }catch(e){
      const message=String((e as Error)?.message??e).slice(0,500);
      await admin.from("taphoa_product_outbox").update({attempts:(item.attempts||0)+1,last_error:message,updated_at:new Date().toISOString()}).eq("id",item.id).catch(()=>{});
    }
  }
  return pushed;
}

async function synchronize(force=false){
  void TAPHOA_TABLES;
  await setSyncState({last_sync_status:"running",last_error:""});
  try{
    const outbound=await processOutbound();
    if(outbound>0){
      await setSyncState({last_sync_status:"success",last_success_at:new Date().toISOString(),last_error:""});
      return {ok:true,changed:true,outbound};
    }

    const modifiedTime=await driveModifiedTime();
    const syncState=await readSyncState();
    if(!force&&syncState?.last_drive_modified_time&&new Date(syncState.last_drive_modified_time).getTime()===new Date(modifiedTime).getTime()){
      await setSyncState({last_sync_status:"success",last_success_at:new Date().toISOString(),last_error:""});
      return {ok:true,changed:false,modifiedTime,imported:Number(syncState.last_imported_row_count||0)};
    }

    const {data:stateRows,error:stateError}=await admin.from("taphoa_product_sheet_state").select("product_code,source_key,sheet_row,sheet_hash,last_pushed_hash");
    if(stateError)throw stateError;
    const stateMap=new Map<string,SheetState>((stateRows||[]).map((s:SheetState)=>[s.product_code,s]));
    const changed:TaphoaProduct[]=[];const stateUpserts:Record<string,unknown>[]=[];const sourceCodes:Record<string,unknown>[]=[];let totalRows=0;let acked=0;

    const tabs=await Promise.all(SOURCES.map(async source=>({source,rows:await readManagerTab(source.tab)})));
    for(const {source,rows} of tabs){
      const codes:string[]=[];
      for(let i=1;i<rows.length;i++){
        const product=mapManagerRow(source.source_key,rows[i]??[],i+1,modifiedTime);if(!product)continue;
        totalRows++;codes.push(product.product_code);
        const hash=await rowHash(product);const previous=stateMap.get(product.product_code);
        const samePushed=!!previous?.last_pushed_hash&&previous.last_pushed_hash===hash;
        const rowMoved=!!previous&&previous.sheet_row!==product.source_row;
        const hashChanged=!previous||previous.sheet_hash!==hash;
        if((hashChanged||rowMoved)&&!(samePushed&&!rowMoved))changed.push(product);
        if(samePushed&&hashChanged&&!rowMoved)acked++;
        stateUpserts.push({product_code:product.product_code,source_key:product.source_key,sheet_row:product.source_row,sheet_hash:hash,last_pushed_hash:previous?.last_pushed_hash||"",last_sheet_modified_time:modifiedTime,updated_at:new Date().toISOString()});
      }
      sourceCodes.push({source_key:source.source_key,codes});
    }
    if(totalRows===0)throw new Error("manager_import_empty");
    const {data:result,error:deltaError}=await admin.rpc("taphoa_apply_product_delta",{p_products:changed,p_source_codes:sourceCodes,p_modified_time:modifiedTime,p_total_rows:totalRows});
    if(deltaError)throw deltaError;
    if(stateUpserts.length){const {error}=await admin.from("taphoa_product_sheet_state").upsert(stateUpserts,{onConflict:"product_code"});if(error)throw error;}
    return {ok:true,changed:changed.length>0,modifiedTime,imported:totalRows,changedRows:changed.length,acked,result};
  }catch(error){
    const message=String((error as Error)?.message??error).slice(0,1500);
    await setSyncState({last_sync_status:"error",last_error:message}).catch(()=>{});throw error;
  }
}

Deno.serve(async req=>{
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers:{"access-control-allow-origin":"*","access-control-allow-headers":"authorization,content-type,x-taphoa-cron","access-control-allow-methods":"GET,POST,OPTIONS"}});
  try{
    if(req.method!=="GET"&&req.method!=="POST")return json({error:"method_not_allowed"},405);
    const access=await authorized(req);if(!access)return json({error:"unauthorized"},401);
    let force=false;if(req.method==="POST"){const body=await req.json().catch(()=>({}));force=body?.force===true;}
    return json(await synchronize(force));
  }catch(error){return json({ok:false,error:String((error as Error)?.message??error)},500);}
});
