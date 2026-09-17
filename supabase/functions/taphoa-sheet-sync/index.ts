import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { JWT } from "npm:google-auth-library@9.15.1";

const SUPABASE_URL=Deno.env.get("SUPABASE_URL")??"";
const SERVICE_ROLE_KEY=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")??"";
const ANON_KEY=Deno.env.get("SUPABASE_ANON_KEY")??"";
const MANAGEMENT_FILE_ID="1hGqAzIEqTMmULIeh5sCmed2R3XaiA9QZavtGRdNvyyU";
const TAPHOA_TABLES=["taphoa_products","taphoa_sources","taphoa_sheet_sync_state","taphoa_revisions"] as const;

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
  product_code:string;
  source_key:string;
  source_row:number;
  product_name:string;
  input_price_vnd:number|null;
  input_price_basis:"carton"|"retail";
  expected_profit_percent:number|null;
  applied_profit_vnd:number;
  sale_price_vnd:number|null;
  carton_price_vnd:number|null;
  retail_price_vnd:number|null;
  units_per_carton:number|null;
  retail_unit:string;
  stock_status:StockStatus;
  stock_label:string;
  is_active:boolean;
  raw_row:unknown[];
  sheet_updated_at:string|null;
};

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
function folded(v:string){return clean(v).normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/đ/g,"d").toLowerCase();}
export function statusInfo(raw:string,price:number|null):{active:boolean;status:StockStatus;label:string}{
  const s=folded(raw);
  if(s==="ngung dung")return {active:false,status:"no_price",label:"Ngừng dùng"};
  if(s==="dang het")return {active:true,status:"out_of_stock",label:"Đang hết"};
  if(price===null||price<=0||s==="chua co gia")return {active:true,status:"no_price",label:"Chưa có giá"};
  return {active:true,status:"available",label:""};
}

function sourceByKey(sourceKey:string):Source|undefined{return SOURCES.find(s=>s.source_key===sourceKey);}

export function mapManagerRow(sourceKey:string,row:unknown[],rowNo:number,modifiedTime:string|null=null):TaphoaProduct|null{
  const source=sourceByKey(sourceKey);if(!source)return null;

  if(sourceKey==="sua"){
    const name=clean(row[0]);
    const inputSheet=num(row[1]);
    const saleSheet=num(row[2]);
    const unitsRaw=num(row[6]);
    const retailUnit=clean(row[7]);
    const code=clean(row[15]).toUpperCase();
    if(!name||!code)return null;
    const input_price_vnd=inputSheet!==null&&inputSheet>0?Math.round(inputSheet*1000):null;
    const sale_price_vnd=saleSheet!==null&&saleSheet>0?Math.round(saleSheet*1000):null;
    const units_per_carton=unitsRaw!==null&&unitsRaw>=1?unitsRaw:null;
    const applied_profit_vnd=input_price_vnd!==null&&sale_price_vnd!==null?Math.max(0,sale_price_vnd-input_price_vnd):0;
    const retail_price_vnd=sale_price_vnd!==null&&units_per_carton&&units_per_carton>1?Math.round(sale_price_vnd/units_per_carton):null;
    const stock=input_price_vnd!==null?{status:"available" as StockStatus,label:""}:{status:"no_price" as StockStatus,label:"Chưa có giá"};
    return {
      product_code:code,source_key:source.source_key,source_row:rowNo,product_name:name,
      input_price_vnd,input_price_basis:"carton",expected_profit_percent:null,applied_profit_vnd,
      sale_price_vnd,carton_price_vnd:sale_price_vnd,retail_price_vnd,units_per_carton,retail_unit:retailUnit,
      stock_status:stock.status,stock_label:stock.label,is_active:true,raw_row:[...row],sheet_updated_at:modifiedTime
    };
  }

  const name=clean(row[0]);
  const inputSheet=num(row[1]);
  const status=clean(row[2]);
  const basis:TaphoaProduct["input_price_basis"]=clean(row[3]).toLowerCase()==="lẻ"?"retail":"carton";
  const expectedRatio=num(row[4]);
  const appliedSheet=num(row[6]);
  const unitsRaw=num(row[10]);
  const retailUnit=clean(row[11]);
  const code=clean(row[15]).toUpperCase();
  if(!name||!code)return null;

  const input_price_vnd=inputSheet!==null&&inputSheet>0?Math.round(inputSheet*1000):null;
  const applied_profit_vnd=appliedSheet===null?0:Math.round(appliedSheet*1000);
  const expected_profit_percent=expectedRatio===null?null:expectedRatio*100;
  const units_per_carton=unitsRaw!==null&&unitsRaw>=1?unitsRaw:null;
  const stock=statusInfo(status,inputSheet!==null&&inputSheet>0?inputSheet:null);
  const sale_price_vnd=input_price_vnd===null?null:input_price_vnd+applied_profit_vnd;
  let carton_price_vnd:number|null=null;
  let retail_price_vnd:number|null=null;
  if(sale_price_vnd!==null){
    if(basis==="retail"){
      retail_price_vnd=sale_price_vnd;
      carton_price_vnd=units_per_carton&&units_per_carton>1?Math.round(sale_price_vnd*units_per_carton):null;
    }else{
      carton_price_vnd=sale_price_vnd;
      retail_price_vnd=units_per_carton&&units_per_carton>1?Math.round(sale_price_vnd/units_per_carton):null;
    }
  }

  return {
    product_code:code,source_key:source.source_key,source_row:rowNo,product_name:name,
    input_price_vnd,input_price_basis:basis,expected_profit_percent,applied_profit_vnd,
    sale_price_vnd,carton_price_vnd,retail_price_vnd,units_per_carton,retail_unit:retailUnit,
    stock_status:stock.status,stock_label:stock.label,is_active:stock.active,raw_row:[...row],sheet_updated_at:modifiedTime
  };
}

function json(body:unknown,status=200){return new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json","cache-control":"no-store","access-control-allow-origin":"*"}});}
function quotedSheet(name:string){return `'${name.replace(/'/g,"''")}'`;}

async function googleToken(){
  if(!googleJwt){
    const raw=Deno.env.get("GOOGLE_SERVICE_ACCOUNT_JSON");
    if(!raw)throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON_missing");
    const credentials=JSON.parse(raw);
    googleJwt=new JWT({email:credentials.client_email,key:credentials.private_key,scopes:[
      "https://www.googleapis.com/auth/spreadsheets.readonly",
      "https://www.googleapis.com/auth/drive.metadata.readonly"
    ]});
  }
  const token=await googleJwt.authorize();
  if(!token.access_token)throw new Error("google_access_token_missing");
  return token.access_token;
}
async function googleFetch(url:string){
  const response=await fetch(url,{headers:{authorization:`Bearer ${await googleToken()}`}});
  if(!response.ok)throw new Error(`google_http_${response.status}:${(await response.text()).slice(0,400)}`);
  return response;
}
async function driveModifiedTime(){
  const response=await googleFetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(MANAGEMENT_FILE_ID)}?fields=modifiedTime`);
  const data=await response.json();
  const value=clean(data?.modifiedTime);
  if(!value||Number.isNaN(Date.parse(value)))throw new Error("manager_modified_time_missing");
  return new Date(value).toISOString();
}
async function readManagerTab(tab:string){
  const range=`${quotedSheet(tab)}!A:P`;
  const url=`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(MANAGEMENT_FILE_ID)}/values/${encodeURIComponent(range)}?majorDimension=ROWS&valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING`;
  const data=await (await googleFetch(url)).json();
  return Array.isArray(data?.values)?data.values as unknown[][]:[];
}

async function authorized(req:Request){
  const cron=clean(req.headers.get("x-taphoa-cron"));
  if(cron){
    const {data,error}=await admin.rpc("taphoa_validate_sheet_sync_cron",{p_secret:cron});
    if(!error&&data===true)return {kind:"cron" as const};
  }
  const authorization=clean(req.headers.get("authorization"));
  if(!authorization.toLowerCase().startsWith("bearer ")||!ANON_KEY)return null;
  const userClient=createClient(SUPABASE_URL,ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false},global:{headers:{Authorization:authorization}}});
  const {data:ctx,error}=await userClient.rpc("taphoa_access_context");
  if(error||ctx?.allowed!==true||ctx?.taphoa_role!=="admin")return null;
  return {kind:"admin" as const};
}

async function readSyncState(){
  const {data,error}=await admin.from("taphoa_sheet_sync_state").select("*").eq("id",1).single();
  if(error)throw error;return data;
}
async function setSyncState(patch:Record<string,unknown>){
  const {error}=await admin.from("taphoa_sheet_sync_state").update({...patch,updated_at:new Date().toISOString()}).eq("id",1);
  if(error)throw error;
}

async function synchronize(force=false){
  void TAPHOA_TABLES;
  const modifiedTime=await driveModifiedTime();
  const state=await readSyncState();
  if(!force&&state?.last_drive_modified_time&&new Date(state.last_drive_modified_time).getTime()===new Date(modifiedTime).getTime()){
    return {ok:true,changed:false,modifiedTime,imported:Number(state.last_imported_row_count||0)};
  }
  await setSyncState({last_sync_status:"running",last_error:""});
  try{
    const products:TaphoaProduct[]=[];
    const sourceRows=SOURCES.map(s=>({source_key:s.source_key,name:s.name,sort_order:s.sort_order,active:true}));
    const tabs=await Promise.all(SOURCES.map(async source=>({source,rows:await readManagerTab(source.tab)})));
    for(const {source,rows} of tabs){
      for(let i=1;i<rows.length;i++){
        const product=mapManagerRow(source.source_key,rows[i]??[],i+1,modifiedTime);
        if(product)products.push(product);
      }
    }
    if(products.length===0)throw new Error("manager_import_empty");
    const {data,error}=await admin.rpc("taphoa_apply_product_sync",{p_sources:sourceRows,p_products:products,p_modified_time:modifiedTime});
    if(error)throw error;
    return {ok:true,changed:true,modifiedTime,imported:products.length,result:data};
  }catch(error){
    const message=String((error as Error)?.message??error).slice(0,1500);
    await setSyncState({last_sync_status:"error",last_error:message}).catch(()=>{});
    throw error;
  }
}

Deno.serve(async req=>{
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers:{"access-control-allow-origin":"*","access-control-allow-headers":"authorization,content-type,x-taphoa-cron","access-control-allow-methods":"GET,POST,OPTIONS"}});
  try{
    if(req.method!=="GET"&&req.method!=="POST")return json({error:"method_not_allowed"},405);
    const access=await authorized(req);if(!access)return json({error:"unauthorized"},401);
    let force=false;
    if(req.method==="POST"){
      const body=await req.json().catch(()=>({}));force=body?.force===true;
    }
    return json(await synchronize(force));
  }catch(error){
    return json({ok:false,error:String((error as Error)?.message??error)},500);
  }
});
