// BANK-ZONE-OCR-20261117 — Optional LOCAL Tesseract OCR reader.
// Caller must supply a single already-initialized Tesseract worker with a
// pinned offline eng/vie language pack. No CDN, new credentials, provider or
// network request is created here. It cannot book payments.
import {BILL_FIELDS} from './bank-bill-region-ocr.js';

const PROFILES=Object.freeze({
 amount:{mode:'7',whitelist:'0123456789., +-đĐVNDvn'},
 account:{mode:'7',whitelist:'0123456789*xX'},
 transactionTime:{mode:'7',whitelist:'0123456789/: -'},
 transferReference:{mode:'7',whitelist:'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789#._/-'},
 senderName:{mode:'7',whitelist:''},
 recipientName:{mode:'7',whitelist:''},
 sendingBank:{mode:'7',whitelist:''},
 receivingBank:{mode:'7',whitelist:''},
 transactionStatus:{mode:'6',whitelist:''},
 transferContent:{mode:'6',whitelist:''}
});
export function createBankBillTesseractReader(worker){
 if(!worker||typeof worker.recognize!=='function'||
    typeof worker.setParameters!=='function')throw Error('initialized_local_ocr_worker_required');
 let inFlight=Promise.resolve();
 let disposed=false;
 const readOcr=({field,crop})=>{
  if(disposed)return Promise.reject(Error('ocr_worker_closed'));
  if(!BILL_FIELDS.includes(field))return Promise.reject(Error('unknown_region'));
  if(!(crop instanceof Blob)||crop.size===0||crop.size>2_000_000)
   return Promise.reject(Error('invalid_crop_size'));
  const profile=PROFILES[field];
  const job=async()=>{
   if(disposed)throw Error('ocr_worker_closed');
   await worker.setParameters({
     tessedit_pageseg_mode:profile.mode,
     tessedit_char_whitelist:profile.whitelist,
     preserve_interword_spaces:'1'
   });
   const result=await worker.recognize(crop);
   const raw=String(result?.data?.text??'').trim();
   const percent=Number(result?.data?.confidence);
   // Tesseract yields [0,100]; the region comparator expects [0,1].
   const confidence=Number.isFinite(percent)&&percent>=0&&percent<=100
    ?percent/100:0;
   return {text:raw,confidence,source:'local-tesseract-region'};
  };
  // Reuse exactly one worker in a sequential pipeline to avoid mixing the
  // per-field whitelist and PSM across concurrent bill crops.
  const promise=inFlight.then(job);
  inFlight=promise.catch(()=>{});
  return promise;
 };
 return {
  readOcr,
  close:async()=>{
   disposed=true;
   await inFlight;
   if(typeof worker.terminate==='function')await worker.terminate();
  }
 };
}
