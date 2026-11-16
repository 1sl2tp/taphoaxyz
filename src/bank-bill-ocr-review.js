// BANK-ZONE-OCR-20261117 — replay only suspicious image regions.
// Evidence-only: no bill status, notification, ledger or customer data writes.
import {
 BILL_FIELDS, normalizeBillField, compareRegionRead, cropBillRegion,
 isRegionInsideDocument
} from './bank-bill-region-ocr.js';

export function mapStoredBankBillToZoneFields(receipt){
 const raw=receipt?.raw_read??{};
 const first=(...values)=>values.find(x=>x!==null&&x!==undefined&&String(x).trim()!=='')??null;
 return {
  amount:first(receipt?.amount_vnd,raw.amount_vnd),
  account:first(raw.recipient_account_visible,receipt?.receiving_account),
  recipientName:first(raw.recipient_name_printed,raw.recipient_name,receipt?.receiving_name),
  transactionTime:first(raw.transaction_datetime_vn,receipt?.transfer_at_vn),
  transferContent:first(raw.transfer_content,raw.bill_fields_v1?.transfer_content),
  transferReference:first(raw.transfer_reference,receipt?.transfer_reference),
  senderName:first(raw.sender_name),
  sendingBank:first(raw.sending_bank,receipt?.sending_bank),
  receivingBank:first(raw.receiving_bank,receipt?.receiving_bank),
  transactionStatus:raw.transfer_success_visible===true?'GIAO DICH THANH CONG':
    raw.transfer_success_visible===false?'GIAO DICH THAT BAI':null
 };
}
export function buildBillOcrReviewQueue({analysis,boxes,documentBox}){
 const statuses=analysis?.fields??{};
 const items=[];
 for(const field of BILL_FIELDS){
  const state=statuses[field];
  if(!state?.needsReview)continue;
  const bbox=boxes?.[field]??null;
  const inside=bbox&&documentBox&&isRegionInsideDocument(bbox,documentBox);
  const action=state.status==='outside_document'||!bbox||!inside
   ?'redraw_region'
   :state.status==='conflict'?'compare_two_reads':'retry_only_this_crop';
  items.push({
    field,action,reason:state.status,
    bbox:inside?bbox:null,
    aiValue:state.aiValue??null,ocrValue:state.ocrValue??null,
    // Administrators can correct evidence without bypassing the money worker.
    collectionAuthorized:false
  });
 }
 return {items,requiresManualReview:items.length>0,ledgerWritten:false};
}
export async function recheckBillOcrReviewQueue({
 imageBlob,analysis,boxes,documentBox,readOcr
}){
 if(typeof readOcr!=='function')throw Error('ocr_reader_required');
 const queue=buildBillOcrReviewQueue({analysis,boxes,documentBox});
 const fields={...analysis?.fields};
 const retry=[];
 for(const item of queue.items){
  if(!item.bbox){retry.push({field:item.field,outcome:'redraw_region'});continue;}
  try{
   const crop=await cropBillRegion(imageBlob,item.bbox);
   const result=await readOcr({field:item.field,crop,attempt:'focused_retry'});
   const text=result&&typeof result==='object'?result.text:result;
   const conf=result&&typeof result==='object'?result.confidence:null;
   if(conf!==null&&conf!==undefined&&
      (typeof conf!=='number'||!Number.isFinite(conf)||conf<0.7||conf>1)){
     retry.push({field:item.field,outcome:'low_ocr_confidence'});
     continue;
   }
   // Do not replace AI evidence by the bank account from configuration.
   const originalAi=analysis?.originalAiFields?.[item.field]??item.aiValue;
   const compared=compareRegionRead(item.field,originalAi,text);
   fields[item.field]=compared;
   retry.push({field:item.field,outcome:compared.status});
  }catch(_err){retry.push({field:item.field,outcome:'retry_unavailable'});}
 }
 const reviewFields=BILL_FIELDS.filter(field=>fields[field]?.needsReview);
 return {
   ...analysis,fields,reviewFields,retry,
   // The entire bank pairing must be rerun and the financial RPC separately
   // revalidate it, even if all corrected fields are now consistent.
   readyForIndependentBankMatch:false,requiresFullReconciliation:true,
   collectionAuthorized:false,ledgerWritten:false
 };
}
export function assertReviewCorrectionIsIndependent(field,aiText,ocrText){
 if(!BILL_FIELDS.includes(field))return{status:'unknown_field',needsReview:true};
 const output=compareRegionRead(field,aiText,ocrText);
 const safe=output.status==='agreed'||output.status==='optional_absent';
 return {field,...output,canProceedToBankLookup:safe,
   bankMatchVerified:false,collectionAuthorized:false};
}
