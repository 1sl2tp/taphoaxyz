import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { JWT } from "npm:google-auth-library@9.15.1";

const SUPABASE_URL=Deno.env.get("SUPABASE_URL")??"";
const SERVICE_ROLE_KEY=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")??"";
const MANAGEMENT_FILE_ID="1hGqAzIEqTMmULIeh5sCmed2R3XaiA9QZavtGRdNvyyU";
const SYSTEM_TABS=new Set(["Lịch sử giá","__SYNC","__SYNC_LOG"]);
const MASAN_SHEET_ID=1608078911;
const TRACKING_ID_HEADER="__SYNC_ID";
const TRACKING_HASH_HEADER="__SYNC_HASH";
const TRACKING_ID_COL="AY";
const TRACKING_HASH_COL="AZ";
const TRACKING_ID_INDEX=50;
const TRACKING_HASH_INDEX=51;
const TRACKING_COLUMN_COUNT=52;
const CORE_KEYS=new Set(["hang-u","thuoc-la","sua","hang-thuong"]);
const NCC_PRICE_SOURCES=Object.freeze([
  {sourceKey:"sua",fileId:"15A3wy0YXlVajFWTTeLXCUh580QhwIlwaBIyn9RdR2XU",sheetName:"Sữa",managementSheetId:1822935945},
  {sourceKey:"hang-u",fileId:"1gzTLCx575q6pFtpIU5RU8D8SUmxCMft6_jrBOVRDIY8",sheetName:"Hàng U",managementSheetId:305224020},
  {sourceKey:"thuoc-la",fileId:"1dKwYp6LAR8Lb9YLy4xnf5CP2FA_VyENfZ9-1rEc3wa8",sheetName:"Thuốc lá",managementSheetId:583030487},
  {sourceKey:"hang-thuong",fileId:"1i1ge5hOPmWi7oxjE5F5hD96f9Zvvp_0HQzwgawZiFgs",sheetName:"Hàng thường",managementSheetId:1330446015},
]);

const admin=createClient(SUPABASE_URL,SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
let googleJwt:JWT|null=null;

type SheetMeta={sheetId:number;title:string;index:number;hidden:boolean;columnCount:number};
type SourceRow={source_key:string;name:string;sort_order:number;active:boolean;management_sheet_id:number|null;sync_status:string;is_core:boolean};
type ProductRow={
  product_code:string;source_key:string;source_row:number;product_name:string;input_price_vnd:number|null;
  input_price_basis:"carton";expected_profit_percent:null;applied_profit_vnd:number;sale_price_vnd:number|null;
  carton_price_vnd:number|null;retail_price_vnd:number|null;units_per_carton:number|null;retail_unit:string;
  stock_status:"available"|"no_price";stock_label:string;is_active:boolean;raw_row:unknown[];sheet_updated_at:string|null;
};
type SheetState={product_code:string;source_key:string;sheet_row:number;sheet_hash:string};
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


function json(body:unknown,status=200){return new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json","cache-control":"no-store"}});}
function quotedSheet(name:string){return `'${name.replace(/'/g,"''")}'`;}
function isEligibleTab(meta:SheetMeta){return !meta.hidden&&!SYSTEM_TABS.has(meta.title)&&!meta.title.startsWith("__")&&meta.sheetId!==MASAN_SHEET_ID;}
function productMarker(code:string){return `P:${clean(code).toUpperCase()}`;}
function canonicalText(code:string,name:string,input:number|null,sale:number|null,units:number|null,retail:number|null){return `${code.toUpperCase().trim()}|${name.trim()}|${input??""}|${sale??""}|${units??""}|${retail??""}`;}
async function sha256(text:string){
  const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest)).map(b=>b.toString(16).padStart(2,"0")).join("");
}
async function rowHash(product:ProductRow){return sha256(canonicalText(product.product_code,product.product_name,product.input_price_vnd,product.sale_price_vnd,product.units_per_carton,product.retail_price_vnd));}

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
  const fields="sheets(properties(sheetId,title,index,hidden,gridProperties(columnCount)))";
  const url=`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(MANAGEMENT_FILE_ID)}?fields=${encodeURIComponent(fields)}`;
  const data=await (await googleFetch(url)).json();
  return (Array.isArray(data?.sheets)?data.sheets:[]).map((s:any)=>({
    sheetId:Number(s?.properties?.sheetId),title:clean(s?.properties?.title),index:Number(s?.properties?.index||0),
    hidden:s?.properties?.hidden===true,columnCount:Number(s?.properties?.gridProperties?.columnCount||16)
  })).filter((s:SheetMeta)=>Number.isFinite(s.sheetId)&&!!s.title);
}
async function readSpreadsheetValues(spreadsheetId:string,tab:string,columns="A:C"){
  const range=`${quotedSheet(tab)}!${columns}`;
  const url=`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}?majorDimension=ROWS&valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING`;
  const data=await (await googleFetch(url)).json();
  return Array.isArray(data?.values)?data.values as unknown[][]:[];
}
async function readManagerTab(tab:string){
  return readSpreadsheetValues(MANAGEMENT_FILE_ID,tab,"A:AZ");
}
async function writeRanges(data:Array<{range:string;values:unknown[][]}>,valueInputOption="RAW"){
  if(!data.length)return;
  const url=`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(MANAGEMENT_FILE_ID)}/values:batchUpdate`;
  await googleFetch(url,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({valueInputOption,data:data.map(d=>({range:d.range,majorDimension:"ROWS",values:d.values}))})});
}
async function batchUpdate(requests:Record<string,unknown>[]){
  if(!requests.length)return;
  const url=`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(MANAGEMENT_FILE_ID)}:batchUpdate`;
  await googleFetch(url,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({requests})});
}
function nccPriceValue(value:unknown){
  if(value===null||value===undefined||clean(value)==="")return {valid:true,value:null as number|null};
  if(typeof value!=="number"&&!/\d/.test(clean(value)))return {valid:false,value:null as number|null};
  const parsed=num(value);
  if(parsed===null||!Number.isFinite(parsed)||parsed<0)return {valid:false,value:null as number|null};
  return {valid:true,value:parsed>0?parsed:null as number|null};
}
function managerPriceValue(value:unknown){
  const parsed=num(value);
  return parsed!==null&&Number.isFinite(parsed)&&parsed>0?parsed:null;
}
async function syncNccPricesToManager(meta:SheetMeta[]){
  let changedRows=0,matchedRows=0,ignoredCodes=0,invalidPrices=0,duplicateCodes=0;
  const errors:Array<{sourceKey:string;error:string}>=[];
  const writes:Array<{range:string;values:unknown[][]}>=[];
  for(const source of NCC_PRICE_SOURCES){
    try{
      const managerMeta=meta.find(sheet=>sheet.sheetId===source.managementSheetId);
      if(!managerMeta){errors.push({sourceKey:source.sourceKey,error:"manager_sheet_missing"});continue;}
      const [nccRows,managerRows]=await Promise.all([
        readSpreadsheetValues(source.fileId,source.sheetName,"A:C"),
        readSpreadsheetValues(MANAGEMENT_FILE_ID,managerMeta.title,"A:C")
      ]);
      const sourcePrices=new Map<string,number|null>();
      const duplicate=new Set<string>();
      for(let i=1;i<nccRows.length;i++){
        const row=nccRows[i]||[];const code=clean(row[0]).toUpperCase();
        if(!code)continue;
        const parsed=nccPriceValue(row[2]);
        if(!parsed.valid){invalidPrices++;continue;}
        if(sourcePrices.has(code)){duplicate.add(code);duplicateCodes++;continue;}
        sourcePrices.set(code,parsed.value);
      }
      const managerCodes=new Set<string>();
      for(let i=1;i<managerRows.length;i++){
        const row=managerRows[i]||[];const code=clean(row[0]).toUpperCase();
        if(!code)continue;
        managerCodes.add(code);
        if(!sourcePrices.has(code)||duplicate.has(code))continue;
        matchedRows++;
        const next=sourcePrices.get(code)??null;
        const current=managerPriceValue(row[2]);
        if(current===next)continue;
        writes.push({range:`${quotedSheet(managerMeta.title)}!C${i+1}`,values:[[next===null?"":next]]});
        changedRows++;
      }
      for(const code of sourcePrices.keys())if(!managerCodes.has(code))ignoredCodes++;
    }catch(error){
      const message=String((error as Error)?.message??error).slice(0,500);
      errors.push({sourceKey:source.sourceKey,error:message});
      console.warn("taphoa_ncc_price_sync_failed",source.sourceKey,message);
    }
  }
  await writeRanges(writes);
  return {changedRows,matchedRows,ignoredCodes,invalidPrices,duplicateCodes,errors};
}
async function ensureTrackingColumns(meta:SheetMeta){
  if(meta.columnCount<TRACKING_COLUMN_COUNT){
    await batchUpdate([{appendDimension:{sheetId:meta.sheetId,dimension:"COLUMNS",length:TRACKING_COLUMN_COUNT-meta.columnCount}}]);
    meta.columnCount=TRACKING_COLUMN_COUNT;
  }
  const rows=await readManagerTab(meta.title);const header=rows[0]||[];
  if(clean(header[TRACKING_ID_INDEX])!==TRACKING_ID_HEADER||clean(header[TRACKING_HASH_INDEX])!==TRACKING_HASH_HEADER){
    await writeRanges([{range:`${quotedSheet(meta.title)}!${TRACKING_ID_COL}1:${TRACKING_HASH_COL}1`,values:[[TRACKING_ID_HEADER,TRACKING_HASH_HEADER]]}]);
  }
  await batchUpdate([{updateDimensionProperties:{range:{sheetId:meta.sheetId,dimension:"COLUMNS",startIndex:50,endIndex:52},properties:{hiddenByUser:true},fields:"hiddenByUser"}}]);
  return rows;
}

type RetailLayout={unitsIndex:number;retailIndex:number};
function normalizeHeader(v:unknown){return clean(v).toLocaleLowerCase("vi-VN").normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/đ/g,"d").replace(/\s+/g," ").trim();}
function managerRetailLayout(header:unknown[]):RetailLayout{
  const normalized=(header||[]).map(normalizeHeader);
  return {unitsIndex:normalized.indexOf("quy cach"),retailIndex:normalized.indexOf("gia le")};
}
function mapManagerRow(sourceKey:string,row:unknown[],rowNo:number,modifiedTime:string|null,layout:RetailLayout):ProductRow|null{
  const code=clean(row?.[0]).toUpperCase();const name=clean(row?.[1]);
  if(!code||!name)return null;
  const inputSheet=num(row?.[2]);const saleSheet=num(row?.[3]);
  const unitsSheet=layout.unitsIndex>=0?num(row?.[layout.unitsIndex]):null;
  const retailSheet=layout.retailIndex>=0?num(row?.[layout.retailIndex]):null;
  const input=inputSheet!==null&&inputSheet>0?Math.round(inputSheet*1000):null;
  const sale=saleSheet!==null&&saleSheet>0?Math.round(saleSheet*1000):null;
  const units=unitsSheet!==null&&unitsSheet>0?unitsSheet:null;
  const retail=retailSheet!==null&&retailSheet>0?Math.round(retailSheet*1000):null;
  return {product_code:code,source_key:sourceKey,source_row:rowNo,product_name:name,input_price_vnd:input,input_price_basis:"carton",
    expected_profit_percent:null,applied_profit_vnd:input!==null&&sale!==null?Math.max(0,sale-input):0,sale_price_vnd:sale,carton_price_vnd:sale,
    retail_price_vnd:retail,units_per_carton:units,retail_unit:retail!==null?"lẻ":"",stock_status:sale!==null?"available":"no_price",stock_label:sale!==null?"":"Chưa có giá",
    is_active:true,raw_row:[...row.slice(0,4)],sheet_updated_at:modifiedTime};
}
function parseCode(code:string){const m=clean(code).toUpperCase().match(/^(.*?)(\d+)$/);return m?{prefix:m[1],n:Number(m[2])}:null;}
function allCodes(caches:Map<number,TabCache>){
  const out:string[]=[];for(const c of caches.values())for(let i=1;i<c.rows.length;i++){const code=clean(c.rows[i]?.[0]).toUpperCase();if(code)out.push(code);}return out;
}
function dominantPrefix(cache:TabCache){
  const counts=new Map<string,{count:number,max:number}>();
  for(let i=1;i<cache.rows.length;i++){
    const parsed=parseCode(clean(cache.rows[i]?.[0]));if(!parsed)continue;
    const item=counts.get(parsed.prefix)||{count:0,max:0};item.count++;item.max=Math.max(item.max,parsed.n);counts.set(parsed.prefix,item);
  }
  let prefix="";let best={count:0,max:0};for(const [p,v] of counts)if(v.count>best.count){prefix=p;best=v;}
  return {prefix,best};
}
export function allocateSheetCode(cache:TabCache,caches:Map<number,TabCache>,lastIssued=0,forcedPrefix=""){
  const {prefix:detected,best}=dominantPrefix(cache);const prefix=forcedPrefix||detected||"SP-";
  const codes=new Set(allCodes(caches));let maxSeen=Math.max(0,lastIssued,best.max);
  for(const code of codes){const parsed=parseCode(code);if(parsed?.prefix===prefix)maxSeen=Math.max(maxSeen,parsed.n);}
  let next=maxSeen+1;let candidate="";do{candidate=prefix+String(next++).padStart(6,"0");}while(codes.has(candidate));return candidate;
}
async function reserveSheetCode(cache:TabCache,caches:Map<number,TabCache>){
  const {prefix:detected,best}=dominantPrefix(cache);const prefix=detected||"SP-";
  const counterRows=await readManagerTab("__SYNC");const counterSheetId=prefix==="SP-"?0:cache.meta.sheetId;
  let counterIndex=-1;
  for(let i=1;i<counterRows.length;i++){
    const row=counterRows[i]||[];const kind=clean(row[11]);
    if(kind!=="source_counter"&&kind!=="global_counter")continue;
    if(Number(num(row[12])??-1)===counterSheetId&&clean(row[14]).toUpperCase()===prefix.toUpperCase()){counterIndex=i;break;}
  }
  let rowNo=0;let lastIssued=best.max;
  if(counterIndex>=1){rowNo=counterIndex+1;lastIssued=Math.max(lastIssued,Math.trunc(num(counterRows[counterIndex]?.[15])??0));}
  else{
    rowNo=2;while(rowNo<=counterRows.length&&(counterRows[rowNo-1]||[]).slice(11,16).some(v=>clean(v)))rowNo++;
    await writeRanges([{range:`'__SYNC'!L${rowNo}:P${rowNo}`,values:[[prefix==="SP-"?"global_counter":"source_counter",counterSheetId,prefix==="SP-"?"__generic__":cache.source.source_key,prefix,lastIssued]]}]);
  }
  const assigned=allocateSheetCode(cache,caches,lastIssued,prefix);const parsed=parseCode(assigned);if(!parsed)throw new Error("sheet_code_parse_failed");
  await writeRanges([{range:`'__SYNC'!P${rowNo}`,values:[[parsed.n]]}]);return assigned;
}

async function authorized(req:Request){
  const cron=clean(req.headers.get("x-taphoa-cron"));if(!cron)return false;
  const {data,error}=await admin.rpc("taphoa_validate_sheet_sync_cron",{p_secret:cron});return !error&&data===true;
}
async function readSyncState(){const {data,error}=await admin.from("taphoa_sheet_sync_state").select("*").eq("id",1).single();if(error)throw error;return data;}
async function setSyncState(patch:Record<string,unknown>){const {error}=await admin.from("taphoa_sheet_sync_state").update({...patch,updated_at:new Date().toISOString()}).eq("id",1);if(error)throw error;}
async function loadSources():Promise<SourceRow[]>{
  const {data,error}=await admin.from("taphoa_sources").select("source_key,name,sort_order,active,management_sheet_id,sync_status,is_core").order("sort_order");if(error)throw error;return (data||[]) as SourceRow[];
}

async function reconcileSources(meta:SheetMeta[]){
  const now=new Date().toISOString();const sources=await loadSources();const bySheet=new Map<number,SourceRow>();
  for(const source of sources)if(source.management_sheet_id!==null)bySheet.set(Number(source.management_sheet_id),source);
  let changed=false;
  for(const sheet of meta.filter(isEligibleTab)){
    const existing=bySheet.get(sheet.sheetId);
    if(existing){
      if(existing.name!==sheet.title||existing.sort_order!==sheet.index+1||!existing.active||existing.sync_status!=="active")changed=true;
      const {error}=await admin.from("taphoa_sources").update({name:sheet.title,sort_order:sheet.index+1,active:true,sync_status:"active",deleted_at:null,last_sheet_seen_at:now,updated_at:now}).eq("source_key",existing.source_key);if(error)throw error;
    }else{
      const key=`sheet-${sheet.sheetId}`;
      const {error}=await admin.from("taphoa_sources").insert({source_key:key,name:sheet.title,sort_order:sheet.index+1,active:true,management_sheet_id:sheet.sheetId,sync_status:"active",is_core:false,last_sheet_seen_at:now,updated_at:now});
      if(error&&!String(error.message||"").toLowerCase().includes("duplicate"))throw error;changed=true;
    }
  }
  const liveIds=new Set(meta.filter(isEligibleTab).map(s=>s.sheetId));
  for(const source of sources){
    if(source.management_sheet_id===null||liveIds.has(Number(source.management_sheet_id)))continue;
    const status=(source.is_core||CORE_KEYS.has(source.source_key))?"error":"deleted";
    if(source.active||source.sync_status!==status)changed=true;
    const {error}=await admin.from("taphoa_sources").update({active:false,sync_status:status,deleted_at:now,updated_at:now}).eq("source_key",source.source_key);if(error)throw error;
  }
  if(changed){const {error}=await admin.from("taphoa_revisions").update({revision:(await currentProductRevision())+1,updated_at:now}).eq("domain","products");if(error)throw error;}
}
async function currentProductRevision(){const {data,error}=await admin.from("taphoa_revisions").select("revision").eq("domain","products").single();if(error)throw error;return Number(data?.revision||0);}

async function loadCaches(meta:SheetMeta[]){
  const sources=await loadSources();const sourceBySheet=new Map<number,SourceRow>();
  for(const s of sources)if(s.management_sheet_id!==null&&s.active&&s.sync_status==="active")sourceBySheet.set(Number(s.management_sheet_id),s);
  const caches=new Map<number,TabCache>();
  for(const sheet of meta.filter(isEligibleTab)){
    const source=sourceBySheet.get(sheet.sheetId);if(!source)continue;
    const rows=await ensureTrackingColumns(sheet);caches.set(sheet.sheetId,{meta:sheet,source,rows});
  }
  return caches;
}

async function allocateBlankSheetRows(caches:Map<number,TabCache>){
  let changed=0;
  for(const cache of caches.values()){
    for(let i=1;i<cache.rows.length;i++){
      const row=cache.rows[i]||[];const code=clean(row[0]);const name=clean(row[1]);if(code||!name)continue;
      const assigned=await reserveSheetCode(cache,caches);const inputSheet=num(row[2]),saleSheet=num(row[3]);
      const input=inputSheet!==null&&inputSheet>0?Math.round(inputSheet*1000):null;const sale=saleSheet!==null&&saleSheet>0?Math.round(saleSheet*1000):null;
      const hash=await sha256(canonicalText(assigned,name,input,sale));
      await writeRanges([
        {range:`${quotedSheet(cache.meta.title)}!A${i+1}`,values:[[assigned]]},
        {range:`${quotedSheet(cache.meta.title)}!${TRACKING_ID_COL}${i+1}:${TRACKING_HASH_COL}${i+1}`,values:[[productMarker(assigned),hash]]}
      ]);
      cache.rows[i][0]=assigned;cache.rows[i][TRACKING_ID_INDEX]=productMarker(assigned);cache.rows[i][TRACKING_HASH_INDEX]=hash;changed++;
    }
  }
  return changed;
}

async function inboundScan(caches:Map<number,TabCache>,modifiedTime:string){
  const {data:stateRows,error:stateError}=await admin.from("taphoa_product_sheet_state").select("product_code,source_key,sheet_row,sheet_hash");if(stateError)throw stateError;
  const stateMap=new Map<string,SheetState>((stateRows||[]).map((s:SheetState)=>[s.product_code,s]));
  const changed:ProductRow[]=[];const stateUpserts:Record<string,unknown>[]=[];const sourceCodes:Record<string,unknown>[]=[];
  const trackingWrites:Array<{range:string;values:unknown[][]}>=[];let totalRows=0;
  const liveSourceKeys=new Set<string>();
  for(const cache of caches.values()){
    const codes:string[]=[];liveSourceKeys.add(cache.source.source_key);
    const retailLayout=managerRetailLayout(cache.rows[0]||[]);
    for(let i=1;i<cache.rows.length;i++){
      const product=mapManagerRow(cache.source.source_key,cache.rows[i]||[],i+1,modifiedTime,retailLayout);if(!product)continue;
      totalRows++;codes.push(product.product_code);const hash=await rowHash(product);const previous=stateMap.get(product.product_code);
      const rowMoved=!!previous&&previous.sheet_row!==product.source_row;const sourceMoved=!!previous&&previous.source_key!==product.source_key;const hashChanged=!previous||previous.sheet_hash!==hash;
      if(hashChanged||rowMoved||sourceMoved)changed.push(product);
      const marker=productMarker(product.product_code);
      if(clean(cache.rows[i]?.[TRACKING_ID_INDEX])!==marker||clean(cache.rows[i]?.[TRACKING_HASH_INDEX])!==hash){
        trackingWrites.push({range:`${quotedSheet(cache.meta.title)}!${TRACKING_ID_COL}${i+1}:${TRACKING_HASH_COL}${i+1}`,values:[[marker,hash]]});
      }
      stateUpserts.push({product_code:product.product_code,source_key:product.source_key,sheet_row:product.source_row,sheet_hash:hash,last_sheet_modified_time:modifiedTime,updated_at:new Date().toISOString()});
    }
    sourceCodes.push({source_key:cache.source.source_key,codes});
  }
  const sources=await loadSources();
  for(const source of sources)if(source.management_sheet_id!==null&&!liveSourceKeys.has(source.source_key))sourceCodes.push({source_key:source.source_key,codes:[]});
  await writeRanges(trackingWrites);
  if(totalRows===0)throw new Error("manager_import_empty");
  const {data:result,error:deltaError}=await admin.rpc("taphoa_apply_product_delta",{p_products:changed,p_source_codes:sourceCodes,p_modified_time:modifiedTime,p_total_rows:totalRows});if(deltaError)throw deltaError;
  if(stateUpserts.length){const {error}=await admin.from("taphoa_product_sheet_state").upsert(stateUpserts,{onConflict:"product_code"});if(error)throw error;}
  return {totalRows,changedRows:changed.length,result};
}

async function synchronize(force=false){
  const lockToken=crypto.randomUUID();
  const {data:locked,error:lockError}=await admin.rpc("taphoa_acquire_sheet_sync_lock",{p_token:lockToken,p_seconds:120});if(lockError)throw lockError;
  if(locked!==true)return {ok:true,busy:true,changed:false};
  try{
    await setSyncState({last_sync_status:"running",last_error:""});
    try{
      const meta=await spreadsheetMeta();
      const ncc=await syncNccPricesToManager(meta);
      const modifiedTime=await driveModifiedTime();const syncState=await readSyncState();
      if(!force&&ncc.changedRows===0&&syncState?.last_drive_modified_time&&new Date(syncState.last_drive_modified_time).getTime()===new Date(modifiedTime).getTime()){
        await setSyncState({last_sync_status:"success",last_success_at:new Date().toISOString(),last_error:""});
        return {ok:true,changed:false,modifiedTime,imported:Number(syncState.last_imported_row_count||0),metadataOnly:true,ncc};
      }
      await reconcileSources(meta);let caches=await loadCaches(meta);
      const allocated=await allocateBlankSheetRows(caches);if(allocated)caches=await loadCaches(meta);
      const scanModifiedTime=allocated?await driveModifiedTime():modifiedTime;
      const inbound=await inboundScan(caches,scanModifiedTime);
      const finalModifiedTime=await driveModifiedTime();
      await setSyncState({last_drive_modified_time:finalModifiedTime,last_sync_status:"success",last_success_at:new Date().toISOString(),last_error:"",last_imported_row_count:inbound.totalRows});
      return {ok:true,changed:ncc.changedRows>0||allocated>0||inbound.changedRows>0,modifiedTime:finalModifiedTime,ncc,allocated,...inbound};
    }catch(error){
      const message=String((error as Error)?.message??error).slice(0,1500);await setSyncState({last_sync_status:"error",last_error:message}).catch(()=>{});throw error;
    }
  }finally{
    try{
      const {error:releaseError}=await admin.rpc("taphoa_release_sheet_sync_lock",{p_token:lockToken});
      if(releaseError)console.error("taphoa_release_sheet_sync_lock_failed",releaseError.message);
    }catch(releaseError){
      console.error("taphoa_release_sheet_sync_lock_failed",String((releaseError as Error)?.message??releaseError));
    }
  }
}

Deno.serve(async req=>{
  try{
    if(req.method!=="GET"&&req.method!=="POST")return json({error:"method_not_allowed"},405);
    if(!await authorized(req))return json({error:"unauthorized"},401);
    const body=req.method==="POST"?await req.json().catch(()=>({})):{};
    return json(await synchronize(body?.force===true));
  }catch(error){return json({ok:false,error:String((error as Error)?.message??error)},500);}
});