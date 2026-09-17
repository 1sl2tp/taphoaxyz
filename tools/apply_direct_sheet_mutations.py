from pathlib import Path


def replace_once(path, old, new, marker=None):
    p = Path(path)
    text = p.read_text()
    if old in text:
        p.write_text(text.replace(old, new, 1))
        print(f"patched {path}")
        return True
    if marker and marker in text:
        print(f"already patched {path}")
        return False
    raise SystemExit(f"expected block not found in {path}")


# 1) Edge function: preserve the authenticated admin client for direct mutations.
replace_once(
    "supabase/functions/taphoa-sheet-sync/index.ts",
    '  return {kind:"admin" as const};\n}',
    '  return {kind:"admin" as const,userClient};\n}',
    'return {kind:"admin" as const,userClient};'
)

# 2) New products must receive the Sheet-owned code before one atomic A:D append.
old_finalize = '''export async function finalizeProductCreate(req:any,cache:TabCache,caches:Map<number,TabCache>,modifiedTime:string){
  const marker=createMarker(req.request_id);let rowIndex=cache.rows.findIndex((r,index)=>index>0&&clean(r?.[TRACKING_ID_INDEX])===marker);
  if(rowIndex<1){
    const pHash=await pendingHash(req.product_name,num(req.input_price_vnd),num(req.sale_price_vnd));
    const values=rowWithTracking(["",req.product_name,sheetUnit(num(req.input_price_vnd)),sheetUnit(num(req.sale_price_vnd))],marker,pHash);
    await appendManagerRow(cache.meta.title,values);await refreshCache(cache);
    rowIndex=cache.rows.findIndex((r,index)=>index>0&&clean(r?.[TRACKING_ID_INDEX])===marker);
    if(rowIndex<1)throw new Error("pending_sheet_row_not_found");
    await admin.from("taphoa_product_create_requests").update({status:"sheet_written",management_sheet_id:cache.meta.sheetId,sheet_row:rowIndex+1,sheet_marker:marker,updated_at:new Date().toISOString()}).eq("request_id",req.request_id);
  }
  let code=clean(cache.rows[rowIndex]?.[0]).toUpperCase();
  if(!code){
    code=await reserveSheetCode(cache,caches);
    const input=num(req.input_price_vnd),sale=num(req.sale_price_vnd);const hash=await sha256(canonicalText(code,clean(req.product_name),input,sale));
    await writeRanges([
      {range:`${quotedSheet(cache.meta.title)}!A${rowIndex+1}`,values:[[code]]},
      {range:`${quotedSheet(cache.meta.title)}!${TRACKING_ID_COL}${rowIndex+1}:${TRACKING_HASH_COL}${rowIndex+1}`,values:[[marker,hash]]}
    ]);
    await refreshCache(cache);
  }
  const input=num(req.input_price_vnd),sale=num(req.sale_price_vnd);const hash=await sha256(canonicalText(code,clean(req.product_name),input,sale));
  const {error}=await admin.rpc("taphoa_finalize_product_create",{p_request_id:req.request_id,p_product_code:code,p_sheet_id:cache.meta.sheetId,p_sheet_row:rowIndex+1,p_modified_time:modifiedTime,p_hash:hash});if(error)throw error;
  await writeRanges([{range:`${quotedSheet(cache.meta.title)}!${TRACKING_ID_COL}${rowIndex+1}:${TRACKING_HASH_COL}${rowIndex+1}`,values:[[productMarker(code),hash]]}]);
  await refreshCache(cache);
  return code;
}'''
new_finalize = '''export async function finalizeProductCreate(req:any,cache:TabCache,caches:Map<number,TabCache>,modifiedTime:string){
  const marker=createMarker(req.request_id);let rowIndex=cache.rows.findIndex((r,index)=>index>0&&clean(r?.[TRACKING_ID_INDEX])===marker);
  let code=rowIndex>=1?clean(cache.rows[rowIndex]?.[0]).toUpperCase():"";
  if(rowIndex<1){
    code=await reserveSheetCode(cache,caches);
    const input=num(req.input_price_vnd),sale=num(req.sale_price_vnd);const hash=await sha256(canonicalText(code,clean(req.product_name),input,sale));
    const values=rowWithTracking([code,req.product_name,sheetUnit(num(req.input_price_vnd)),sheetUnit(num(req.sale_price_vnd))],marker,hash);
    const appendedRow=await appendManagerRow(cache.meta.title,values);await refreshCache(cache);
    rowIndex=appendedRow>1?appendedRow-1:cache.rows.findIndex((r,index)=>index>0&&clean(r?.[TRACKING_ID_INDEX])===marker);
    if(rowIndex<1)throw new Error("pending_sheet_row_not_found");
    await admin.from("taphoa_product_create_requests").update({status:"sheet_written",management_sheet_id:cache.meta.sheetId,sheet_row:rowIndex+1,sheet_marker:marker,updated_at:new Date().toISOString()}).eq("request_id",req.request_id);
  }else if(!code){
    code=await reserveSheetCode(cache,caches);
    const input=num(req.input_price_vnd),sale=num(req.sale_price_vnd);const hash=await sha256(canonicalText(code,clean(req.product_name),input,sale));
    await writeRanges([
      {range:`${quotedSheet(cache.meta.title)}!A${rowIndex+1}:D${rowIndex+1}`,values:[[code,req.product_name,sheetUnit(input),sheetUnit(sale)]]},
      {range:`${quotedSheet(cache.meta.title)}!${TRACKING_ID_COL}${rowIndex+1}:${TRACKING_HASH_COL}${rowIndex+1}`,values:[[marker,hash]]}
    ]);
    await refreshCache(cache);
  }
  const input=num(req.input_price_vnd),sale=num(req.sale_price_vnd);const hash=await sha256(canonicalText(code,clean(req.product_name),input,sale));
  const {error}=await admin.rpc("taphoa_finalize_product_create",{p_request_id:req.request_id,p_product_code:code,p_sheet_id:cache.meta.sheetId,p_sheet_row:rowIndex+1,p_modified_time:modifiedTime,p_hash:hash});if(error)throw error;
  await writeRanges([{range:`${quotedSheet(cache.meta.title)}!${TRACKING_ID_COL}${rowIndex+1}:${TRACKING_HASH_COL}${rowIndex+1}`,values:[[productMarker(code),hash]]}]);
  await refreshCache(cache);
  return code;
}'''
replace_once(
    "supabase/functions/taphoa-sheet-sync/index.ts",
    old_finalize,
    new_finalize,
    'rowWithTracking([code,req.product_name,sheetUnit(num(req.input_price_vnd)),sheetUnit(num(req.sale_price_vnd))]'
)

# 3) One browser request performs DB mutation + Sheet mutation while holding the existing sync lock.
worker = Path("supabase/functions/taphoa-sheet-sync/index.ts")
worker_text = worker.read_text()
if "async function directMutation(" not in worker_text:
    anchor = "\nasync function synchronize(force=false){\n"
    direct = r'''
async function directMutation(action:string,body:any,userClient:any){
  const lockToken=crypto.randomUUID();
  const {data:locked,error:lockError}=await admin.rpc("taphoa_acquire_sheet_sync_lock",{p_token:lockToken,p_seconds:120});
  if(lockError)throw lockError;
  if(locked!==true)throw new Error("sheet_sync_busy");
  try{
    const rpc=async(name:string,args:Record<string,unknown>)=>{
      const {data,error}=await userClient.rpc(name,args);
      if(error)throw error;
      return data;
    };

    if(action==="create_source"){
      const result=await rpc("taphoa_create_source_from_web",{p_name:clean(body?.name)});
      let meta=await spreadsheetMeta();
      const created=await processSourceCreates(meta);if(created)meta=await spreadsheetMeta();
      await reconcileSources(meta);
      const source=(await loadSources()).find(s=>s.source_key===clean(result?.source_key));
      if(!source||source.sync_status!=="active"||source.management_sheet_id===null)throw new Error("source_create_not_finalized");
      return {...result,pending:false,management_sheet_id:source.management_sheet_id};
    }

    if(action==="delete_source"){
      const result=await rpc("taphoa_delete_source_from_web",{p_source:clean(body?.source)});
      let meta=await spreadsheetMeta();await reconcileSources(meta);
      const deleted=await processSourceDeletes(meta);if(deleted)meta=await spreadsheetMeta();
      await reconcileSources(meta);
      const source=(await loadSources()).find(s=>s.source_key===clean(result?.source_key));
      if(source&&source.sync_status!=="deleted")throw new Error("source_delete_not_finalized");
      return {...result,pending:false};
    }

    if(action==="create_product"||action==="update_product"){
      const product=body?.product||{};
      const result=await rpc("taphoa_update_product_from_web",{p_product:product});
      let meta=await spreadsheetMeta();await reconcileSources(meta);
      let caches=await loadCaches(meta);const modifiedBefore=await driveModifiedTime();
      if(action==="create_product"||result?.pending===true||/^TMP-/i.test(clean(result?.product_code))){
        await processProductCreates(caches,modifiedBefore);
        const requestId=clean(result?.request_id);if(!requestId)throw new Error("product_create_request_missing");
        const {data:reqRow,error:reqError}=await admin.from("taphoa_product_create_requests").select("final_product_code,status").eq("request_id",requestId).single();
        if(reqError)throw reqError;
        if(reqRow?.status!=="finalized"||!clean(reqRow?.final_product_code))throw new Error("product_create_not_finalized");
        return {...result,pending:false,created:true,product_code:clean(reqRow.final_product_code)};
      }
      await processProductUpserts(caches);
      const code=clean(result?.product_code);
      const {count,error:pendingError}=await admin.from("taphoa_product_outbox").select("id",{count:"exact",head:true}).eq("product_code",code).eq("status","pending");
      if(pendingError)throw pendingError;if((count||0)>0)throw new Error("product_update_not_pushed");
      return {...result,pending:false};
    }

    if(action==="delete_product"){
      const result=await rpc("taphoa_delete_product_from_web",{p_product_code:clean(body?.product_code)});
      let meta=await spreadsheetMeta();await reconcileSources(meta);
      const caches=await loadCaches(meta);const modifiedBefore=await driveModifiedTime();
      await processProductDeletes(caches,modifiedBefore);
      const code=clean(result?.product_code||body?.product_code).toUpperCase();
      const {data:product,error:productError}=await admin.from("taphoa_products").select("sync_status").eq("product_code",code).maybeSingle();
      if(productError)throw productError;if(product&&product.sync_status!=="deleted")throw new Error("product_delete_not_finalized");
      return {...result,pending:false};
    }

    throw new Error("unsupported_action");
  }finally{
    await admin.rpc("taphoa_release_sheet_sync_lock",{p_token:lockToken}).catch(()=>{});
  }
}
'''
    if anchor not in worker_text:
        raise SystemExit("synchronize anchor missing")
    worker.write_text(worker_text.replace(anchor, "\n" + direct + anchor, 1))
    print("inserted directMutation")
else:
    print("directMutation already present")

# 4) Route POST action to directMutation, preserving force-sync for cron/manual requests.
old_serve = '''Deno.serve(async req=>{
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers:{"access-control-allow-origin":"*","access-control-allow-headers":"authorization,content-type,x-taphoa-cron","access-control-allow-methods":"GET,POST,OPTIONS"}});
  try{
    if(req.method!=="GET"&&req.method!=="POST")return json({error:"method_not_allowed"},405);
    const access=await authorized(req);if(!access)return json({error:"unauthorized"},401);
    let force=false;if(req.method==="POST"){const body=await req.json().catch(()=>({}));force=body?.force===true;}
    return json(await synchronize(force));
  }catch(error){return json({ok:false,error:String((error as Error)?.message??error)},500);}
});'''
new_serve = '''Deno.serve(async req=>{
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers:{"access-control-allow-origin":"*","access-control-allow-headers":"authorization,content-type,x-taphoa-cron","access-control-allow-methods":"GET,POST,OPTIONS"}});
  try{
    if(req.method!=="GET"&&req.method!=="POST")return json({error:"method_not_allowed"},405);
    const access=await authorized(req);if(!access)return json({error:"unauthorized"},401);
    const body=req.method==="POST"?await req.json().catch(()=>({})):{};
    const action=clean(body?.action);
    if(action){
      if(access.kind!=="admin")return json({error:"admin_required"},403);
      return json(await directMutation(action,body,access.userClient));
    }
    return json(await synchronize(body?.force===true));
  }catch(error){return json({ok:false,error:String((error as Error)?.message??error)},500);}
});'''
replace_once(
    "supabase/functions/taphoa-sheet-sync/index.ts",
    old_serve,
    new_serve,
    'return json(await directMutation(action,body,access.userClient));'
)

# 5) Bridge no longer does RPC + second sync request. The edge function already completed both sides.
bridge_path = Path("src/fixed-production-bridge.js")
bridge = bridge_path.read_text()
bridge = bridge.replace('''async function syncSheetSoon(){
  try{return await business.syncSheet({force:true});}
  catch(error){console.warn('taphoa sheet sync',error);return null;}
}

''', '')
bridge = bridge.replace('''  await syncSheetSoon();
  await refresh(['products']);''', '''  await refresh(['products']);''')
bridge = bridge.replace('''  await syncSheetSoon();
  if(sourceValue)pendingSourceAliases.delete(sourceValue.toLowerCase());''', '''  if(sourceValue)pendingSourceAliases.delete(sourceValue.toLowerCase());''')
old_update = '''async function updateProduct(payload={}){
  const sourceValue=text(payload.source_key??payload.source??payload.sourceName??'').trim();
  const source_key=sourceKeyFromDisplayName(sourceValue)||sourceValue;
  let result=await business.updateProduct({...payload,source_key});
  await syncSheetSoon();
  if(/^TMP-/i.test(text(result?.product_code))){
    try{
      const resolved=await business.updateProduct({...payload,product_code:result.product_code,source_key});
      if(resolved?.product_code)result=resolved;
    }catch(error){console.warn('resolve pending product',error);}
  }
  await refresh(['products']);
  window.dispatchEvent(new CustomEvent('taphoa-production-sync',{detail:{changed:['products']}}));
  return result;
}'''
new_update = '''async function updateProduct(payload={}){
  const sourceValue=text(payload.source_key??payload.source??payload.sourceName??'').trim();
  const source_key=sourceKeyFromDisplayName(sourceValue)||sourceValue;
  const result=await business.updateProduct({...payload,source_key});
  await refresh(['products']);
  window.dispatchEvent(new CustomEvent('taphoa-production-sync',{detail:{changed:['products']}}));
  return result;
}'''
if old_update in bridge:
    bridge = bridge.replace(old_update, new_update, 1)
elif new_update not in bridge:
    raise SystemExit("bridge updateProduct block missing")
bridge = bridge.replace('''  const result=await business.deleteProduct(String(code||'').trim());
  await syncSheetSoon();
  await refresh(['products']);''', '''  const result=await business.deleteProduct(String(code||'').trim());
  await refresh(['products']);''')
if 'syncSheetSoon' in bridge:
    raise SystemExit("syncSheetSoon still present in bridge")
bridge_path.write_text(bridge)
print("patched bridge")

# 6) Update the older contract test to the one-request architecture.
contract_path = Path("tests/taphoa-product-realtime-sync-contract.test.js")
contract = contract_path.read_text()
old_test = '''test('web mutations can kick the sheet worker immediately while cron remains retry safety',()=>{
  assert.match(gateway,/functions\\.invoke/);
  assert.match(business,/syncSheet/);
  assert.match(bridge,/syncSheetSoon/);
  assert.match(bridge,/createSource[\\s\\S]*syncSheetSoon/);
  assert.match(bridge,/updateProduct[\\s\\S]*syncSheetSoon/);
  assert.match(bridge,/deleteProduct[\\s\\S]*syncSheetSoon/);
});'''
new_test = '''test('web mutations use one direct sheet function request while cron remains retry safety',()=>{
  assert.match(gateway,/functions\\.invoke/);
  assert.match(business,/directSheetMutation/);
  assert.match(business,/create_source/);
  assert.match(business,/update_product/);
  assert.match(business,/delete_product/);
  assert.doesNotMatch(bridge,/syncSheetSoon/);
});'''
if old_test in contract:
    contract = contract.replace(old_test, new_test, 1)
elif new_test not in contract:
    raise SystemExit("old realtime direct test block missing")
old_ui = '''test('fixed production UI saves a blurred product row through Supabase instead of local-only state',()=>{
  assert.match(business,/updateProduct/);
  assert.match(business,/taphoa_update_product_from_web/);
  assert.match(bridge,/updateProduct/);
  assert.match(persistence,/saveProductEditorRow/);
  assert.match(persistence,/focusout/);
  assert.match(persistence,/TAPHOA_PRODUCTION\\.updateProduct/);
  assert.match(index,/fixed-product-persistence\\.js/);
});'''
new_ui = '''test('fixed production UI saves a settled product row through the direct Sheet mutation path',()=>{
  assert.match(business,/updateProduct/);
  assert.match(business,/directSheetMutation/);
  assert.match(bridge,/updateProduct/);
  assert.match(persistence,/saveProductEditorRow/);
  assert.match(persistence,/scheduleProductEditorRowSave/);
  assert.match(persistence,/updateProduct/);
  assert.match(index,/fixed-product-persistence\\.js/);
});'''
if old_ui in contract:
    contract = contract.replace(old_ui, new_ui, 1)
elif new_ui not in contract:
    raise SystemExit("old persistence contract block missing")
contract_path.write_text(contract)
print("patched realtime contract")
