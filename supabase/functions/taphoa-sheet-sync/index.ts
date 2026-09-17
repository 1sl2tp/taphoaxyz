import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { JWT } from "npm:google-auth-library@9.15.1";

const SUPABASE_URL=Deno.env.get("SUPABASE_URL")??"";
const SERVICE_ROLE_KEY=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")??"";
const ANON_KEY=Deno.env.get("SUPABASE_ANON_KEY")??"";
const MANAGEMENT_FILE_ID="1hGqAzIEqTMmULIeh5sCmed2R3XaiA9QZavtGRdNvyyU";
const SYSTEM_TABS=new Set(["Lịch sử giá","__SYNC","__SYNC_LOG"]);
const TRACKING_ID_HEADER="__SYNC_ID";
const TRACKING_HASH_HEADER="__SYNC_HASH";
const CORE_KEYS=new Set(["hang-u","thuoc-la","sua","masan","hang-thuong"]);

const admin=createClient(SUPABASE_URL,SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
let googleJwt:JWT|null=null;

type SheetMeta={sheetId:number;title:string;index:number;hidden:boolean;rowCount:number;columnCount:number};
type SourceRow={source_key:string;name:string;sort_order:number;active:boolean;management_sheet_id:number|null;sync_status:string;is_core:boolean};
type ProductRow={
  product_code:string;source_key:string;source_row:number;product_name:string;input_price_vnd:number|null;
  input_price_basis:"carton";expected_profit_percent:null;applied_profit_vnd:number;sale_price_vnd:number|null;
  carton_price_vnd:number|null;retail_price_vnd:null;units_per_carton:null;retail_unit:string;
  stock_status:"available"|"no_price";stock_label:string;is_active:boolean;raw_row:unknown[];sheet_updated_at:string|null;
};
type SheetState={product_code:string;source_key:string;sheet_row:number;sheet_hash:string;last_pushed_hash:string};
type OutboxRow={id:number;product_code:string;source_key:string;operation:"upsert"|"delete";payload:Record<string,unknown>;row_hash:string;attempts:number};

type TabCache={meta:SheetMeta;source:SourceRow;rows:unknown[][]};

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
function json(body:unknown,status=200){return new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json","cache-control":"no-store","access-control-allow-origin":"*"}});}
function quotedSheet(name:string){return `'${name.replace(/'/g,"''")}'`;}
function isEligibleTab(meta:SheetMeta){return !meta.hidden&&!SYSTEM_TABS.has(meta.title)&&!meta.title.startsWith("__");}
function productMarker(code:string){return `P:${clean(code).toUpperCase()}`;}
function createMarker(id:string){return `C:${clean(id).toLowerCase()}`;}
function sheetUnit(v:number|null){return v===null?"":v/1000;}

function canonicalText(code:string,name:string,input:number|null,sale:number|null){
  return `${code.toUpperCase().trim()}|${name.trim()}|${input??""}|${sale??""}`;
}
async function sha256(text:string){
  const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest)).map(b=>b.toString(16).padStart(2,"0")).join("");
}
async function rowHash(product:ProductRow){return sha256(canonicalText(product.product_code,product.product_name,product.input_price_vnd,product.sale_price_vnd));}
async function pendingHash(name:string,input:number|null,sale:number|null){return sha256(`PENDING|${name.trim()}|${input??""}|${sale??""}`);}

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
  if(!response.ok)throw new Error(`google_http_${response.status}:${(await response.text()).slice(0,700)}`);
  return response;
}
async function driveModifiedTime(){
  const response=await googleFetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(MANAGEMENT_FILE_ID)}?fields=modifiedTime`);
  const data=await response.json();const value=clean(data?.modifiedTime);
  if(!value||Number.isNaN(Date.parse(value)))throw new Error("manager_modified_time_missing");
  return new Date(value).toISOString();
}
async function spreadsheetMeta():Promise<SheetMeta[]>{
  const fields="sheets(properties(sheetId,title,index,hidden,gridProperties(rowCount,columnCount)))";
  const url=`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(MANAGEMENT_FILE_ID)}?fields=${encodeURIComponent(fields)}`;
  const data=await (await googleFetch(url)).json();
  return (Array.isArray(data?.sheets)?data.sheets:[]).map((s:any)=>({
    sheetId:Number(s?.properties?.sheetId),title:clean(s?.properties?.title),index:Number(s?.properties?.index||0),
    hidden:s?.properties?.hidden===true,rowCount:Number(s?.properties?.gridProperties?.rowCount||1000),
    columnCount:Number(s?.properties?.gridProperties?.columnCount||16)
  })).filter((s:SheetMeta)=>Number.isFinite(s.sheetId)&&!!s.title);
}
async function readManagerTab(tab:string){
  const range=`${quotedSheet(tab)}!A:P`;
  const url=`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(MANAGEMENT_FILE_ID)}/values/${encodeURIComponent(range)}?majorDimension=ROWS&valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING`;
  const data=await (await googleFetch(url)).json();
  return Array.isArray(data?.values)?data.values as unknown[][]:[];
}
async function writeRanges(data:Array<{range:string;values:unknown[][]}>,valueInputOption="RAW"){
  if(!data.length)return;
  const url=`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(MANAGEMENT_FILE_ID)}/values:batchUpdate`;
  await googleFetch(url,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({valueInputOption,data:data.map(d=>({range:d.range,majorDimension:"ROWS",values:d.values}))})});
}
async function batchUpdate(requests:Record<string,unknown>[]){
  if(!requests.length)return {replies:[]};
  const url=`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(MANAGEMENT_FILE_ID)}:batchUpdate`;
  return (await (await googleFetch(url,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({requests})})).json()) as any;
}
async function appendManagerRow(tab:string,values:unknown[]){
  const range=`${quotedSheet(tab)}!A:P`;
  const url=`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(MANAGEMENT_FILE_ID)}/values/${encodeURIComponent(range)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS&includeValuesInResponse=false`;
  const data=await (await googleFetch(url,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({range,majorDimension:"ROWS",values:[values]})})).json();
  const updated=clean(data?.updates?.updatedRange);
  const m=updated.match(/![A-Z]+(\d+):/i)||updated.match(/![A-Z]+(\d+)$/i);
  return m?Number(m[1]):0;
}
async function deleteManagerRow(meta:SheetMeta,rowNo:number){
  if(rowNo<2)return;
  await batchUpdate([{deleteDimension:{range:{sheetId:meta.sheetId,dimension:"ROWS",startIndex:rowNo-1,endIndex:rowNo}}}]);
}
async function ensureSourceLayout(meta:SheetMeta){
  const rows=await readManagerTab(meta.title);
  const header=rows[0]||[];
  const writes: Array<{range:string;values:unknown[][]}>=[];
  if(clean(header[0])!=="Mã SP"||clean(header[1])!=="Tên sản phẩm"){
    writes.push({range:`${quotedSheet(meta.title)}!A1:D1`,values:[["Mã SP","Tên sản phẩm","Giá vốn","Giá bán của mình"]]});
  }
  if(clean(header[14])!==TRACKING_ID_HEADER||clean(header[15])!==TRACKING_HASH_HEADER){
    writes.push({range:`${quotedSheet(meta.title)}!O1:P1`,values:[[TRACKING_ID_HEADER,TRACKING_HASH_HEADER]]});
  }
  await writeRanges(writes);
  await batchUpdate([{updateDimensionProperties:{range:{sheetId:meta.sheetId,dimension:"COLUMNS",startIndex:14,endIndex:16},properties:{hiddenByUser:true},fields:"hiddenByUser"}}]);
}
async function addSourceSheet(title:string){
  const result=await batchUpdate([{addSheet:{properties:{title,gridProperties:{rowCount:1000,columnCount:16,frozenRowCount:1,frozenColumnCount:3}}}}]);
  const props=result?.replies?.[0]?.addSheet?.properties;
  if(!props?.sheetId)throw new Error("add_sheet_missing_sheet_id");
  const meta:SheetMeta={sheetId:Number(props.sheetId),title:clean(props.title||title),index:Number(props.index||0),hidden:false,rowCount:1000,columnCount:16};
  await ensureSourceLayout(meta);
  return meta;
}

function mapManagerRow(sourceKey:string,row:unknown[],rowNo:number,modifiedTime:string|null):ProductRow|null{
  const code=clean(row?.[0]).toUpperCase();const name=clean(row?.[1]);
  if(!code||!name)return null;
  const inputSheet=num(row?.[2]);const saleSheet=num(row?.[3]);
  const input=inputSheet!==null&&inputSheet>0?Math.round(inputSheet*1000):null;
  const sale=saleSheet!==null&&saleSheet>0?Math.round(saleSheet*1000):null;
  return {product_code:code,source_key:sourceKey,source_row:rowNo,product_name:name,input_price_vnd:input,input_price_basis:"carton",
    expected_profit_percent:null,applied_profit_vnd:input!==null&&sale!==null?Math.max(0,sale-input):0,sale_price_vnd:sale,carton_price_vnd:sale,
    retail_price_vnd:null,units_per_carton:null,retail_unit:"",stock_status:sale!==null?"available":"no_price",stock_label:sale!==null?"":"Chưa có giá",
    is_active:true,raw_row:[...row.slice(0,4)],sheet_updated_at:modifiedTime};
}
function parseCode(code:string){const m=clean(code).toUpperCase().match(/^(.*?)(\d+)$/);return m?{prefix:m[1],n:Number(m[2])}:null;}
function allCodes(caches:Map<number,TabCache>){const out:string[]=[];for(const c of caches.values())for(let i=1;i<c.rows.length;i++){const code=clean(c.rows[i]?.[0]).toUpperCase();if(code)out.push(code);}return out;}
export function allocateSheetCode(cache:TabCache,caches:Map<number,TabCache>){
  const prefixCounts=new Map<string,{count:number,max:number}>();
  for(let i=1;i<cache.rows.length;i++){
    const parsed=parseCode(clean(cache.rows[i]?.[0]));if(!parsed)continue;
    const item=prefixCounts.get(parsed.prefix)||{count:0,max:0};item.count++;item.max=Math.max(item.max,parsed.n);prefixCounts.set(parsed.prefix,item);
  }
  let prefix="";let best={count:0,max:0};
  for(const [p,v] of prefixCounts){if(v.count>best.count){prefix=p;best=v;}}
  const codes=new Set(allCodes(caches));
  let next=0;
  if(prefix){next=best.max+1;}else{
    prefix="SP-";
    for(const code of codes){const m=code.match(/^SP-(\d+)$/);if(m)next=Math.max(next,Number(m[1]));}
    next++;
  }
  let candidate="";
  do{candidate=prefix+String(next++).padStart(6,"0");}while(codes.has(candidate));
  return candidate;
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
async function loadSources():Promise<SourceRow[]>{const {data,error}=await admin.from("taphoa_sources").select("source_key,name,sort_order,active,management_sheet_id,sync_status,is_core").order("sort_order");if(error)throw error;return (data||[]) as SourceRow[];}

async function processSourceCreates(meta:SheetMeta[]){
  const {data,error}=await admin.from("taphoa_source_sync_requests").select("request_id,source_key,requested_name,status").eq("operation","create").eq("status","pending").order("created_at");
  if(error)throw error;let count=0;
  for(const req of data||[]){
    try{
      const sources=await loadSources();const claimed=new Set(sources.filter(s=>s.management_sheet_id!==null).map(s=>Number(s.management_sheet_id)));
      let sheet=meta.find(s=>isEligibleTab(s)&&s.title===clean(req.requested_name)&&!claimed.has(s.sheetId));
      if(!sheet){sheet=await addSourceSheet(clean(req.requested_name));meta.push(sheet);}else await ensureSourceLayout(sheet);
      const {error:rpcError}=await admin.rpc("taphoa_finalize_source_sheet",{p_source_key:req.source_key,p_sheet_id:sheet.sheetId,p_name:sheet.title,p_sort_order:sheet.index+1});
      if(rpcError)throw rpcError;count++;
    }catch(e){await admin.from("taphoa_source_sync_requests").update({status:"error",last_error:String((e as Error)?.message??e).slice(0,500),updated_at:new Date().toISOString()}).eq("request_id",req.request_id).catch(()=>{});}
  }
  return count;
}

async function reconcileSources(meta:SheetMeta[]){
  const sources=await loadSources();const bySheet=new Map<number,SourceRow>();for(const s of sources)if(s.management_sheet_id!==null)bySheet.set(Number(s.management_sheet_id),s);
  for(const sheet of meta.filter(isEligibleTab)){
    const existing=bySheet.get(sheet.sheetId);
    if(existing){
      const patch:Record<string,unknown>={name:sheet.title,sort_order:sheet.index+1,last_sheet_seen_at:new Date().toISOString(),updated_at:new Date().toISOString()};
      if(existing.sync_status!=="pending_delete"){patch.active=true;patch.sync_status="active";patch.deleted_at=null;}
      await admin.from("taphoa_sources").update(patch).eq("source_key",existing.source_key);
      continue;
    }
    const pending=sources.find(s=>s.management_sheet_id===null&&s.sync_status==="pending_create"&&s.name===sheet.title);
    if(pending){await ensureSourceLayout(sheet);const {error}=await admin.rpc("taphoa_finalize_source_sheet",{p_source_key:pending.source_key,p_sheet_id:sheet.sheetId,p_name:sheet.title,p_sort_order:sheet.index+1});if(error)throw error;continue;}
    await ensureSourceLayout(sheet);
    const key=`sheet-${sheet.sheetId}`;
    const {error}=await admin.from("taphoa_sources").insert({source_key:key,name:sheet.title,sort_order:sheet.index+1,active:true,management_sheet_id:sheet.sheetId,sync_status:"active",is_core:false,last_sheet_seen_at:new Date().toISOString()});
    if(error&&!String(error.message||"").includes("duplicate"))throw error;
  }
  const liveIds=new Set(meta.filter(isEligibleTab).map(s=>s.sheetId));
  for(const source of sources){
    if(source.management_sheet_id===null||liveIds.has(Number(source.management_sheet_id))||source.sync_status==="pending_delete")continue;
    if(source.is_core||CORE_KEYS.has(source.source_key)){
      await admin.from("taphoa_sources").update({sync_status:"error",active:false,updated_at:new Date().toISOString()}).eq("source_key",source.source_key);continue;
    }
    await admin.rpc("taphoa_mark_source_deleted",{p_source_key:source.source_key});
  }
}

export async function processSourceDeletes(meta:SheetMeta[]){
  const {data,error}=await admin.from("taphoa_source_sync_requests").select("request_id,source_key,management_sheet_id,status").eq("operation","delete").eq("status","pending").order("created_at");
  if(error)throw error;let count=0;
  for(const req of data||[]){
    try{
      const {count:productCount,error:pError}=await admin.from("taphoa_products").select("product_code",{count:"exact",head:true}).eq("source_key",req.source_key).eq("is_active",true);if(pError)throw pError;
      const {count:pendingCount,error:rError}=await admin.from("taphoa_product_create_requests").select("request_id",{count:"exact",head:true}).eq("source_key",req.source_key).in("status",["pending_sheet","sheet_written"]);if(rError)throw rError;
      if((productCount||0)>0||(pendingCount||0)>0)throw new Error("source_has_active_products");
      const sheetId=Number(req.management_sheet_id);const sheet=meta.find(s=>s.sheetId===sheetId);
      if(sheet){await batchUpdate([{deleteSheet:{sheetId}}]);meta.splice(meta.indexOf(sheet),1);}
      const {error:rpcError}=await admin.rpc("taphoa_mark_source_deleted",{p_source_key:req.source_key});if(rpcError)throw rpcError;count++;
    }catch(e){await admin.from("taphoa_source_sync_requests").update({status:"error",last_error:String((e as Error)?.message??e).slice(0,500),updated_at:new Date().toISOString()}).eq("request_id",req.request_id).catch(()=>{});}
  }
  return count;
}

async function loadCaches(meta:SheetMeta[]){
  const sources=await loadSources();const sourceBySheet=new Map<number,SourceRow>();for(const s of sources)if(s.management_sheet_id!==null&&s.sync_status!=="deleted")sourceBySheet.set(Number(s.management_sheet_id),s);
  const caches=new Map<number,TabCache>();
  for(const sheet of meta.filter(isEligibleTab)){
    const source=sourceBySheet.get(sheet.sheetId);if(!source)continue;
    const rows=await readManagerTab(sheet.title);caches.set(sheet.sheetId,{meta:sheet,source,rows});
  }
  return caches;
}
function findRow(caches:Map<number,TabCache>,code:string){
  const wanted=clean(code).toUpperCase();const marker=productMarker(wanted);
  for(const cache of caches.values())for(let i=1;i<cache.rows.length;i++){
    if(clean(cache.rows[i]?.[14])===marker||clean(cache.rows[i]?.[0]).toUpperCase()===wanted)return {cache,rowIndex:i,rowNo:i+1};
  }
  return null;
}
async function refreshCache(cache:TabCache){cache.rows=await readManagerTab(cache.meta.title);}

export async function finalizeProductCreate(req:any,cache:TabCache,caches:Map<number,TabCache>,modifiedTime:string){
  const marker=createMarker(req.request_id);let rowIndex=cache.rows.findIndex((r,index)=>index>0&&clean(r?.[14])===marker);
  if(rowIndex<1){
    const pHash=await pendingHash(req.product_name,num(req.input_price_vnd),num(req.sale_price_vnd));
    const values=["",req.product_name,sheetUnit(num(req.input_price_vnd)),sheetUnit(num(req.sale_price_vnd)),"","","","","","","","","","",marker,pHash];
    await appendManagerRow(cache.meta.title,values);await refreshCache(cache);
    rowIndex=cache.rows.findIndex((r,index)=>index>0&&clean(r?.[14])===marker);
    if(rowIndex<1)throw new Error("pending_sheet_row_not_found");
    await admin.from("taphoa_product_create_requests").update({status:"sheet_written",management_sheet_id:cache.meta.sheetId,sheet_row:rowIndex+1,sheet_marker:marker,updated_at:new Date().toISOString()}).eq("request_id",req.request_id);
  }
  let code=clean(cache.rows[rowIndex]?.[0]).toUpperCase();
  if(!code){
    code=allocateSheetCode(cache,caches);
    const input=num(req.input_price_vnd),sale=num(req.sale_price_vnd);const hash=await sha256(canonicalText(code,clean(req.product_name),input,sale));
    await writeRanges([
      {range:`${quotedSheet(cache.meta.title)}!A${rowIndex+1}`,values:[[code]]},
      {range:`${quotedSheet(cache.meta.title)}!O${rowIndex+1}:P${rowIndex+1}`,values:[[marker,hash]]}
    ]);
    await refreshCache(cache);
  }
  const input=num(req.input_price_vnd),sale=num(req.sale_price_vnd);const hash=await sha256(canonicalText(code,clean(req.product_name),input,sale));
  const {error}=await admin.rpc("taphoa_finalize_product_create",{p_request_id:req.request_id,p_product_code:code,p_sheet_id:cache.meta.sheetId,p_sheet_row:rowIndex+1,p_modified_time:modifiedTime,p_hash:hash});if(error)throw error;
  await writeRanges([{range:`${quotedSheet(cache.meta.title)}!O${rowIndex+1}:P${rowIndex+1}`,values:[[productMarker(code),hash]]}]);
  await refreshCache(cache);
  return code;
}

async function processProductCreates(caches:Map<number,TabCache>,modifiedTime:string){
  const {data,error}=await admin.from("taphoa_product_create_requests").select("*").in("status",["pending_sheet","sheet_written"]).order("created_at").limit(100);if(error)throw error;
  const sources=await loadSources();const byKey=new Map(sources.map(s=>[s.source_key,s]));let count=0;
  for(const req of data||[]){
    try{
      const source=byKey.get(req.source_key);if(!source||source.sync_status!=="active"||source.management_sheet_id===null)continue;
      const cache=caches.get(Number(source.management_sheet_id));if(!cache)continue;
      await finalizeProductCreate(req,cache,caches,modifiedTime);count++;
    }catch(e){await admin.from("taphoa_product_create_requests").update({status:"error",last_error:String((e as Error)?.message??e).slice(0,500),updated_at:new Date().toISOString()}).eq("request_id",req.request_id).catch(()=>{});}
  }
  return count;
}

export async function processProductDeletes(caches:Map<number,TabCache>,modifiedTime:string){
  const {data,error}=await admin.from("taphoa_product_outbox").select("id,product_code,source_key,operation,payload,row_hash,attempts").eq("status","pending").eq("operation","delete").order("id").limit(100);if(error)throw error;
  let count=0;
  for(const item of (data||[]) as OutboxRow[]){
    try{
      const found=findRow(caches,item.product_code);
      if(found){await deleteManagerRow(found.cache.meta,found.rowNo);await refreshCache(found.cache);}
      const now=new Date().toISOString();
      await admin.from("taphoa_product_outbox").update({status:"pushed",pushed_at:now,updated_at:now,last_error:""}).eq("id",item.id);
      const {error:rpcError}=await admin.rpc("taphoa_mark_product_delete_acked",{p_product_code:item.product_code,p_modified_time:modifiedTime});if(rpcError)throw rpcError;count++;
    }catch(e){await admin.from("taphoa_product_outbox").update({attempts:(item.attempts||0)+1,last_error:String((e as Error)?.message??e).slice(0,500),updated_at:new Date().toISOString()}).eq("id",item.id).catch(()=>{});}
  }
  return count;
}

async function processProductUpserts(caches:Map<number,TabCache>){
  const {data,error}=await admin.from("taphoa_product_outbox").select("id,product_code,source_key,operation,payload,row_hash,attempts").eq("status","pending").eq("operation","upsert").order("id").limit(100);if(error)throw error;
  const sources=await loadSources();const byKey=new Map(sources.map(s=>[s.source_key,s]));let count=0;
  for(const item of (data||[]) as OutboxRow[]){
    try{
      const source=byKey.get(item.source_key);if(!source||source.sync_status!=="active"||source.management_sheet_id===null)continue;
      const target=caches.get(Number(source.management_sheet_id));if(!target)continue;
      const payload=item.payload||{};const input=num(payload.input_price_vnd),sale=num(payload.sale_price_vnd);
      const values=[item.product_code,clean(payload.product_name),sheetUnit(input),sheetUnit(sale)];
      let found=findRow(caches,item.product_code);
      if(found&&found.cache.meta.sheetId!==target.meta.sheetId){await deleteManagerRow(found.cache.meta,found.rowNo);await refreshCache(found.cache);found=null;}
      let rowNo=0;
      if(found){rowNo=found.rowNo;await writeRanges([
        {range:`${quotedSheet(target.meta.title)}!A${rowNo}:D${rowNo}`,values:[values]},
        {range:`${quotedSheet(target.meta.title)}!O${rowNo}:P${rowNo}`,values:[[productMarker(item.product_code),item.row_hash]]}
      ]);await refreshCache(target);}else{
        rowNo=await appendManagerRow(target.meta.title,[...values,"","","","","","","","","","",productMarker(item.product_code),item.row_hash]);await refreshCache(target);
      }
      const now=new Date().toISOString();
      await admin.from("taphoa_product_outbox").update({status:"pushed",pushed_at:now,updated_at:now,last_error:""}).eq("id",item.id);
      await admin.from("taphoa_product_sheet_state").upsert({product_code:item.product_code,source_key:item.source_key,sheet_row:rowNo,last_pushed_hash:item.row_hash,last_pushed_at:now,updated_at:now},{onConflict:"product_code"});count++;
    }catch(e){await admin.from("taphoa_product_outbox").update({attempts:(item.attempts||0)+1,last_error:String((e as Error)?.message??e).slice(0,500),updated_at:new Date().toISOString()}).eq("id",item.id).catch(()=>{});}
  }
  return count;
}

async function allocateBlankSheetRows(caches:Map<number,TabCache>){
  let changed=0;
  for(const cache of caches.values()){
    for(let i=1;i<cache.rows.length;i++){
      const row=cache.rows[i]||[];const code=clean(row[0]);const name=clean(row[1]);if(code||!name)continue;
      const assigned=allocateSheetCode(cache,caches);const inputSheet=num(row[2]),saleSheet=num(row[3]);const input=inputSheet!==null&&inputSheet>0?Math.round(inputSheet*1000):null;const sale=saleSheet!==null&&saleSheet>0?Math.round(saleSheet*1000):null;
      const hash=await sha256(canonicalText(assigned,name,input,sale));
      await writeRanges([{range:`${quotedSheet(cache.meta.title)}!A${i+1}`,values:[[assigned]]},{range:`${quotedSheet(cache.meta.title)}!O${i+1}:P${i+1}`,values:[[productMarker(assigned),hash]]}]);
      cache.rows[i][0]=assigned;cache.rows[i][14]=productMarker(assigned);cache.rows[i][15]=hash;changed++;
    }
  }
  return changed;
}

async function inboundScan(caches:Map<number,TabCache>,modifiedTime:string){
  const {data:stateRows,error:stateError}=await admin.from("taphoa_product_sheet_state").select("product_code,source_key,sheet_row,sheet_hash,last_pushed_hash");if(stateError)throw stateError;
  const stateMap=new Map<string,SheetState>((stateRows||[]).map((s:SheetState)=>[s.product_code,s]));
  const changed:ProductRow[]=[];const stateUpserts:Record<string,unknown>[]=[];const sourceCodes:Record<string,unknown>[]=[];const trackingWrites:Array<{range:string;values:unknown[][]}>=[];let totalRows=0;let acked=0;
  for(const cache of caches.values()){
    const codes:string[]=[];
    for(let i=1;i<cache.rows.length;i++){
      const product=mapManagerRow(cache.source.source_key,cache.rows[i]||[],i+1,modifiedTime);if(!product)continue;
      totalRows++;codes.push(product.product_code);
      const hash=await rowHash(product);const previous=stateMap.get(product.product_code);const samePushed=!!previous?.last_pushed_hash&&previous.last_pushed_hash===hash;
      const rowMoved=!!previous&&previous.sheet_row!==product.source_row;const hashChanged=!previous||previous.sheet_hash!==hash;
      if((hashChanged||rowMoved)&&!(samePushed&&!rowMoved))changed.push(product);if(samePushed&&hashChanged&&!rowMoved)acked++;
      const marker=productMarker(product.product_code);if(clean(cache.rows[i]?.[14])!==marker||clean(cache.rows[i]?.[15])!==hash){trackingWrites.push({range:`${quotedSheet(cache.meta.title)}!O${i+1}:P${i+1}`,values:[[marker,hash]]});}
      stateUpserts.push({product_code:product.product_code,source_key:product.source_key,sheet_row:product.source_row,sheet_hash:hash,last_pushed_hash:previous?.last_pushed_hash||"",last_sheet_modified_time:modifiedTime,updated_at:new Date().toISOString()});
    }
    sourceCodes.push({source_key:cache.source.source_key,codes});
  }
  await writeRanges(trackingWrites);
  if(totalRows===0)throw new Error("manager_import_empty");
  const {data:result,error:deltaError}=await admin.rpc("taphoa_apply_product_delta",{p_products:changed,p_source_codes:sourceCodes,p_modified_time:modifiedTime,p_total_rows:totalRows});if(deltaError)throw deltaError;
  if(stateUpserts.length){const {error}=await admin.from("taphoa_product_sheet_state").upsert(stateUpserts,{onConflict:"product_code"});if(error)throw error;}
  return {totalRows,changedRows:changed.length,acked,result};
}

async function synchronize(force=false){
  await setSyncState({last_sync_status:"running",last_error:""});
  try{
    let meta=await spreadsheetMeta();
    const sourceCreates=await processSourceCreates(meta);
    if(sourceCreates)meta=await spreadsheetMeta();
    await reconcileSources(meta);
    const sourceDeletes=await processSourceDeletes(meta);
    if(sourceDeletes)meta=await spreadsheetMeta();
    await reconcileSources(meta);

    let caches=await loadCaches(meta);
    const modifiedBefore=await driveModifiedTime();
    const productCreates=await processProductCreates(caches,modifiedBefore);
    if(productCreates)caches=await loadCaches(meta);
    const productDeletes=await processProductDeletes(caches,modifiedBefore);
    if(productDeletes)caches=await loadCaches(meta);
    const productUpserts=await processProductUpserts(caches);
    if(productUpserts)caches=await loadCaches(meta);
    const allocated=await allocateBlankSheetRows(caches);
    if(allocated)caches=await loadCaches(meta);

    const modifiedTime=await driveModifiedTime();const syncState=await readSyncState();
    const outbound=sourceCreates+sourceDeletes+productCreates+productDeletes+productUpserts+allocated;
    if(!force&&outbound===0&&syncState?.last_drive_modified_time&&new Date(syncState.last_drive_modified_time).getTime()===new Date(modifiedTime).getTime()){
      await setSyncState({last_sync_status:"success",last_success_at:new Date().toISOString(),last_error:""});
      return {ok:true,changed:false,modifiedTime,imported:Number(syncState.last_imported_row_count||0)};
    }
    const inbound=await inboundScan(caches,modifiedTime);
    await setSyncState({last_sync_status:"success",last_success_at:new Date().toISOString(),last_error:""});
    return {ok:true,changed:outbound>0||inbound.changedRows>0,modifiedTime,outbound:{sourceCreates,sourceDeletes,productCreates,productDeletes,productUpserts,allocated},...inbound};
  }catch(error){
    const message=String((error as Error)?.message??error).slice(0,1500);await setSyncState({last_sync_status:"error",last_error:message}).catch(()=>{});throw error;
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
