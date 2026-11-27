// Candidate recovery worker: use existing authenticated client and canonical renderer.
// No business mutation, no implicit resend, no persistent customer payload.
export function createRecoveryWorker({client,ownerCurrent,renderOriginal,online=()=>true,visible=()=>true,report=()=>{}}){
 let running=null,lastRun=-Infinity;
 const ready=()=>ownerCurrent()&&online()&&visible();
 const call=async(name,args)=>{if(!ready())throw Error('interrupted');const {data,error}=await client.rpc(name,args);if(error)throw error;if(!ready())throw Error('interrupted');return data};
 async function pngMeta(blob){
  if(!blob||blob.type!=='image/png'||blob.size<24||blob.size>15728640)throw Error('invalid_png');
  const b=new Uint8Array(await blob.slice(0,24).arrayBuffer());
  if([137,80,78,71,13,10,26,10].some((v,i)=>b[i]!==v)||String.fromCharCode(...b.slice(12,16))!=='IHDR')throw Error('invalid_png');
  const v=new DataView(b.buffer),width=v.getUint32(16),height=v.getUint32(20);
  if(width<1||height<1||width>20000||height>20000)throw Error('invalid_dimensions');
  return {size:blob.size,width,height}
 }
 async function one(row){
  const t=await call('taphoa_order_notice_recover_prepare',{p_message_id:row.message_id});
  if(!t?.ok)return t?.reason||'review';
  if(t.message_id!==row.message_id||!t.asset_id||typeof t.storage_key!=='string'||!t.storage_key.endsWith('/'+t.asset_id))throw Error('ticket_mismatch');
  const bucket=client.storage.from('v21-media');
  let blob;
  if(t.mode==='reuse_upload'){
   const res=await bucket.download(t.storage_key);if(res.error)throw res.error;blob=res.data;
   if(blob.size!==t.size_bytes)throw Error('storage_size_mismatch');
  }else if(t.mode==='render_original'){
   blob=await renderOriginal(t.order);
  }else throw Error('unknown_mode');
  const m=await pngMeta(blob);
  if(!ready())throw Error('interrupted');
  if(t.mode==='render_original'){
   const res=await bucket.upload(t.storage_key,blob,{contentType:'image/png',upsert:false,cacheControl:'3600'});
   if(res.error)throw res.error; // ambiguous ACK: leave durable ticket for next lease; never overwrite
  }
  const ack=await call('taphoa_order_notice_recover_attach',{p_message_id:row.message_id,p_asset_id:t.asset_id,p_size_bytes:m.size,p_width_px:m.width,p_height_px:m.height});
  if(ack?.ok!==true||ack.message_id!==row.message_id||ack.asset_id!==t.asset_id)throw Error('unverified_ack');
  return 'attached'
 }
 function wake(now=Date.now(),{historical=false}={}){
  if(running)return running;
  if(!ready()||now-lastRun<60000)return Promise.resolve([]);
  lastRun=now;
  running=(async()=>{const rows=await call('taphoa_order_notice_recover_list',{p_limit:5,p_include_historical:historical===true});if(!Array.isArray(rows))throw Error('invalid_list');const out=[];
   for(const row of rows.slice(0,5)){if(!ready())break;let state;try{state=await one(row)}catch{state='interrupted_or_review'}out.push({message_id:row.message_id,state});report(state)}
   return out
  })().finally(()=>{running=null});
  return running
 }
 return {wake};
}
