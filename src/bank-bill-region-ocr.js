// BANK-ZONE-OCR-20261116 — evidence-only region reader (not a money writer).
// This module can be used by a future bank-bill image worker or an admin crop
// review screen. It never changes a bank notification, ledger or receipt status.
// Field names are canonical; the recipient's NAME is OPTIONAL, and if shown
// it is compared without Vietnamese diacritics.
export const BILL_FIELDS=Object.freeze(['amount','account','recipientName','transactionTime']);

export function normalizeRecipientName(value){
  const raw=String(value??'').trim();
  if(!raw)return null; // Absence is legitimate, never populate a known name.
  const result=raw.normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/đ/g,'d').replace(/Đ/g,'D')
    .toUpperCase().replace(/\s+/g,' ').trim();
  return result||null;
}
function amount(value){
  const raw=String(value??'').trim().replace(/(?:VND|VNĐ|Đ|đ)\s*$/iu,'').trim();
  if(!/^[+-]?\s*(?:\d{1,12}|\d{1,3}(?:[.,]\d{3})+)$/.test(raw))return null;
  const digits=raw.replace(/[.,\s+-]/g,'');
  const result=Number(digits);
  return Number.isSafeInteger(result)&&result>0&&result<1e12?String(result):null;
}
function account(value){
  const raw=String(value??'').trim().replace(/[\s.:-]/g,'');
  // Masks or ellipses are evidence that the account is not fully visible.
  if(!/^\d{9,20}$/.test(raw))return null;
  return raw;
}
function transactionTime(value){
  const s=String(value??'').trim().replace(/\s+/g,' ');
  const vn=/^(?:([0-2]?\d):([0-5]\d)(?::([0-5]\d))?\s+)?([0-3]?\d)\/([01]?\d)\/(20\d{2})(?:\s+([0-2]?\d):([0-5]\d)(?::([0-5]\d))?)?$/;
  const iso=/^(20\d{2})-([01]\d)-([0-3]\d)\s+([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/;
  let y,m,d,h,mi,sec;
  let x=iso.exec(s);
  if(x){[,y,m,d,h,mi,sec]=x;}
  else{
    x=vn.exec(s);if(!x)return null;
    if(x[1]&&x[7])return null; // Never accept two different clocks.
    [,h,mi,sec,d,m,y]=x;
    h=h??x[7];mi=mi??x[8];sec=sec??x[9];
  }
  if(h==null||mi==null)return null;
  y=Number(y);m=Number(m);d=Number(d);h=Number(h);mi=Number(mi);
  sec=sec==null?null:Number(sec);
  if(h>23||mi>59||sec!=null&&sec>59)return null;
  const cal=new Date(Date.UTC(y,m-1,d));
  if(cal.getUTCFullYear()!==y||cal.getUTCMonth()!==m-1||cal.getUTCDate()!==d)return null;
  const pad=n=>String(n).padStart(2,'0');
  return y+'-'+pad(m)+'-'+pad(d)+' '+pad(h)+':'+pad(mi)+(sec==null?'':':'+pad(sec));
}
export function normalizeBillField(field,value){
  switch(field){
    case 'amount':return amount(value);
    case 'account':return account(value);
    case 'recipientName':return normalizeRecipientName(value);
    case 'transactionTime':return transactionTime(value);
    default:throw Error('unknown_bill_zone');
  }
}
// Return normalized pixel coordinates from a normalized [x,y,w,h] bbox;
// reject frames outside the actual image, not silently another document area.
export function validateRegion(bbox,imageWidth,imageHeight){
  if(!Array.isArray(bbox)||bbox.length!==4||bbox.some(v=>typeof v!=='number'||!Number.isFinite(v)))
    return null;
  const [x,y,w,h]=bbox;
  if(x<0||y<0||w<=0||h<=0||x+w>1.000001||y+h>1.000001)return null;
  const px=Math.floor(x*imageWidth),py=Math.floor(y*imageHeight);
  const endX=Math.min(imageWidth,Math.ceil((x+w)*imageWidth));
  const endY=Math.min(imageHeight,Math.ceil((y+h)*imageHeight));
  if(endX-px<3||endY-py<3)return null;
  return {x:px,y:py,width:endX-px,height:endY-py};
}
// Browser-side crop of a user-supplied picture, with no network upload or
// OCR provider selection. Worker passes the resulting Blob to its OWN reader.
// Preserves the original image and never sends a crop on its own.
export async function cropBillRegion(imageBlob,bbox){
  if(typeof createImageBitmap!=='function')throw Error('image_decoder_unavailable');
  const image=await createImageBitmap(imageBlob);
  try{
    const bounds=validateRegion(bbox,image.width,image.height);
    if(!bounds)throw Error('invalid_bill_region');
    const canvas=typeof OffscreenCanvas==='function'
      ?new OffscreenCanvas(bounds.width,bounds.height)
      :(typeof document!=='undefined'?document.createElement('canvas'):null);
    if(!canvas)throw Error('canvas_unavailable');
    canvas.width=bounds.width;canvas.height=bounds.height;
    const ctx=canvas.getContext('2d');
    if(!ctx)throw Error('canvas_context_unavailable');
    ctx.drawImage(image,bounds.x,bounds.y,bounds.width,bounds.height,
      0,0,bounds.width,bounds.height);
    if(typeof canvas.convertToBlob==='function')
      return canvas.convertToBlob({type:'image/png'});
    return new Promise((resolve,reject)=>
      canvas.toBlob(blob=>blob?resolve(blob):reject(Error('crop_encode_failed')),'image/png'));
  }finally{image.close?.();}
}
// Only TWO agreeing independent reads are confirmed. A cropped account
// cannot be silently "repaired" from the configured Agribank account.
export function compareRegionRead(field,aiValue,ocrValue){
  const ai=normalizeBillField(field,aiValue),ocr=normalizeBillField(field,ocrValue);
  if(field==='recipientName'&&!ai&&!ocr)
    return {field,status:'optional_absent',value:null,needsReview:false};
  if(!ai&&!ocr)return {field,status:'unreadable',value:null,needsReview:true};
  if(!ai||!ocr)return {field,status:'single_source',value:ai||ocr,needsReview:true};
  if(ai!==ocr)return {field,status:'conflict',aiValue:ai,ocrValue:ocr,value:null,needsReview:true};
  return {field,status:'agreed',value:ai,needsReview:false};
}
// Invoke external readers only for detected boxes. The caller decides whether
// to show a manual crop editor for conflicts; this function cannot book money.
export async function inspectBillZones({imageBlob,boxes,aiFields,readOcr,expectedAccount=null}){
  if(typeof readOcr!=='function')throw Error('ocr_reader_required');
  const results={};
  for(const field of BILL_FIELDS){
    const bbox=boxes?.[field];
    if(!bbox){
      results[field]=compareRegionRead(field,aiFields?.[field],null);
      continue;
    }
    try{
      const crop=await cropBillRegion(imageBlob,bbox);
      const read=await readOcr({field,crop});
      results[field]=compareRegionRead(field,aiFields?.[field],read);
    }catch(_e){
      results[field]={field,status:'crop_or_ocr_unavailable',value:null,needsReview:true};
    }
  }
  const requiredFieldsAgreed=!['amount','account','transactionTime']
    .some(f=>results[f].needsReview);
  const expected=normalizeBillField('account',expectedAccount);
  const accountVerified=expected!==null&&results.account.value===expected;
  return {fields:results,readyForIndependentBankMatch:
    requiredFieldsAgreed&&accountVerified,
    // This flag only permits an independent lookup, never financial posting.
    ledgerWritten:false};
}
