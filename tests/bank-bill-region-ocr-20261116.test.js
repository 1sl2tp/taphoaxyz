import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 BILL_FIELDS,normalizeRecipientName,normalizeBillField,
 validateRegion,isRegionInsideDocument,compareRegionRead,inspectBillZones,
 BILL_REGION_LOCATOR_RULES,validateBillRegionLayout,analyzeBillWithRegions
} from '../src/bank-bill-region-ocr.js';

const migration=readFileSync(new URL(
 '../supabase/migrations/20261116234000_bank_zone_optional_recipient_ascii_20261116.sql',
 import.meta.url),'utf8');

test('recipient account-holder name is OPTIONAL; if present compare without marks',()=>{
 for(const name of [null,undefined,'','  '])
   assert.equal(normalizeRecipientName(name),null);
 for(const name of ['Bùi Xuân Tùng','BUI XUAN TUNG','bui xuan tung','  Bùi  Xuân    Tùng '])
   assert.equal(normalizeRecipientName(name),'BUI XUAN TUNG');
 assert.deepEqual(compareRegionRead('recipientName',null,''),{
   field:'recipientName',status:'optional_absent',value:null,needsReview:false
 });
 assert.equal(compareRegionRead('recipientName','Bùi Xuân Tùng','BUI XUAN TUNG').status,'agreed');
 assert.equal(compareRegionRead('recipientName','Nguyễn Thị Hà','BUI XUAN TUNG').status,'conflict');
});

test('amount, account and printed transaction clock remain independently typed',()=>{
 assert.equal(normalizeBillField('amount','70.000đ'),'70000');
 assert.equal(normalizeBillField('amount','70,000 VND'),'70000');
 assert.equal(normalizeBillField('amount',70000),'70000');
 assert.equal(normalizeBillField('amount','70,00'),null);
 assert.equal(normalizeBillField('account','2901181999999'),'2901181999999');
 assert.equal(normalizeBillField('account','290118199999'),'290118199999');
 assert.equal(normalizeBillField('account','*****99999'),null);
 assert.equal(normalizeBillField('transactionTime','15:25 16/11/2026'),'2026-11-16 15:25');
 assert.equal(normalizeBillField('transactionTime','16/11/2026 15:25:16'),'2026-11-16 15:25:16');
 assert.equal(normalizeBillField('transactionTime','2026-11-16 15:25'),'2026-11-16 15:25');
 assert.equal(normalizeBillField('transactionTime','31/02/2026 15:25'),null);
 assert.equal(normalizeBillField('transactionTime','23:40'),null,
   'phone status-bar time cannot stand in for transaction date and time');
});
test('region coordinates must fit the real image, not the phone status bar',()=>{
 assert.deepEqual(BILL_FIELDS,[
   'amount','account','recipientName','transactionTime','transferContent',
   'transferReference','senderName','sendingBank','receivingBank','transactionStatus'
 ]);
 assert.deepEqual(validateRegion([0.10,0.20,0.40,0.05],1000,1200),
   {x:100,y:240,width:400,height:60});
 assert.equal(validateRegion([-0.1,0.2,0.4,0.1],1000,1200),null);
 assert.equal(validateRegion([0.9,0.2,0.4,0.1],1000,1200),null);
 assert.equal(validateRegion([0.1,0.1,0,0.1],1000,1200),null);
});
test('individual OCR mismatch stays review-only; cropped beneficiary number is not fabricated',()=>{
 const bad=compareRegionRead('account','290118199999','2901181999999');
 assert.equal(bad.status,'conflict');
 assert.equal(bad.needsReview,true);
 assert.equal(bad.value,null);
 assert.equal(compareRegionRead('amount','70.000đ','70000').status,'agreed');
 assert.equal(compareRegionRead('transactionTime','15:25 16/11/2026',
   '15:26 16/11/2026').status,'conflict');
});
test('crop/reader pass-through never posts money; required fields need independent agreement',async()=>{
 const originalBitmap=globalThis.createImageBitmap;
 const originalCanvas=globalThis.OffscreenCanvas;
 let crops=0;
 try{
   globalThis.createImageBitmap=async()=>({width:1000,height:1200,close(){}});
   globalThis.OffscreenCanvas=class {
     constructor(w,h){this.width=w;this.height=h;}
     getContext(){return {drawImage(){crops++;}};}
     async convertToBlob(){return new Blob(['crop'],{type:'image/png'});}
   };
   const boxes=Object.fromEntries(BILL_FIELDS.map(f=>[f,[0.1,0.2,0.35,0.06]]));
   const reads={
     amount:'70.000đ',account:'2901181999999',recipientName:null,
     transactionTime:'15:25 16/11/2026'
   };
   const aiFields={
     amount:70000,account:'2901181999999',recipientName:null,
     transactionTime:'2026-11-16 15:25'
   };
   const run=()=>inspectBillZones({
     imageBlob:new Blob(['mock']),boxes,aiFields,
     readOcr:async({field,crop})=>{assert.equal(crop.type,'image/png');return reads[field];},
     expectedAccount:'2901181999999'
   });
   let result=await run();
   assert.equal(crops,BILL_FIELDS.length);
   assert.equal(result.fields.recipientName.status,'optional_absent');
   assert.equal(result.fields.transferContent.status,'optional_absent');
   assert.equal(result.readyForIndependentBankMatch,true);
   assert.equal(result.ledgerWritten,false);
   reads.account='290118199999';result=await run();
   assert.equal(result.readyForIndependentBankMatch,false);
   assert.equal(result.fields.account.status,'conflict');
   reads.account='2901181999999';reads.recipientName='NGUYEN THI HA';result=await run();
   assert.equal(result.readyForIndependentBankMatch,false);
   assert.equal(result.fields.recipientName.status,'single_source');
   // A name seen in only one reader never substitutes for bank evidence.
   reads.recipientName='BÙI XUÂN TÙNG';aiFields.recipientName='NGUYEN THI HA';
   result=await run();
   assert.equal(result.fields.recipientName.status,'conflict');
   assert.equal(result.readyForIndependentBankMatch,false);
 }finally{
   if(originalBitmap===undefined)delete globalThis.createImageBitmap;
   else globalThis.createImageBitmap=originalBitmap;
   if(originalCanvas===undefined)delete globalThis.OffscreenCanvas;
   else globalThis.OffscreenCanvas=originalCanvas;
 }
});
test('SQL patch changes only normalized PRESENT name, no credit/ledger/duplication guards',()=>{
 assert.match(migration,/pg_get_functiondef\('public\.chat_bank_app_collect\(uuid,bigint\)'::regprocedure\)/);
 assert.match(migration,/v_original.*upper\(regexp_replace\(btrim\(r\.receiving_name\)/);
 assert.match(migration,/v_replacement.*extensions\.unaccent\(btrim\(r\.receiving_name\)\)/);
 assert.match(migration,/EXECUTE replace\(v_sql, v_original, v_replacement\)/);
 assert.doesNotMatch(migration,/INSERT INTO public\.taphoa_debt_ledger|UPDATE public\.chat_bank_bill_receipts/i);
});


test('all extra bill regions are independently typed; transfer memo is not a bank credit',()=>{
 assert.equal(normalizeBillField('transferContent','Hạnh dùng ZaloPay chuyển tiền'),
   'HANH DUNG ZALOPAY CHUYEN TIEN');
 assert.equal(normalizeBillField('transferReference','#261116003119208'),'261116003119208');
 assert.equal(normalizeBillField('senderName','  Đặng   Thị Hạnh'),'DANG THI HANH');
 assert.equal(normalizeBillField('sendingBank','ZaloPay'),'ZALOPAY');
 assert.equal(normalizeBillField('receivingBank','Agribank'),'AGRIBANK');
 assert.equal(normalizeBillField('transactionStatus','Giao dịch thành công'),'SUCCESS');
 assert.equal(normalizeBillField('transactionStatus','Giao dịch thất bại'),'FAILED');
 assert.equal(compareRegionRead('transferContent','abc 001','abc 002').status,'conflict');
 assert.equal(compareRegionRead('transferReference','#261116003119208','261116003119208').status,'agreed');
 assert.equal(compareRegionRead('transferContent',null,null).status,'optional_absent');
 assert.equal(compareRegionRead('senderName','Nguyen Thi Ha',null).status,'single_source');
});
test('nested receipt bounding box excludes phone clock and foreign banner',()=>{
 assert.equal(isRegionInsideDocument([0.15,0.24,0.6,0.12],[0.1,0.2,0.8,0.75]),true);
 assert.equal(isRegionInsideDocument([0.15,0.03,0.6,0.1],[0.1,0.2,0.8,0.75]),false);
 assert.equal(isRegionInsideDocument([0.91,0.3,0.12,0.1],[0.1,0.2,0.8,0.75]),false);
});
test('invalid or overlapping extraneous regions never make a financial collection',async()=>{
 const priorBitmap=globalThis.createImageBitmap,priorCanvas=globalThis.OffscreenCanvas;
 try{
  globalThis.createImageBitmap=async()=>({width:1000,height:1000,close(){}});
  globalThis.OffscreenCanvas=class{
   constructor(w,h){this.width=w;this.height=h;}
   getContext(){return {drawImage(){}}}
   async convertToBlob(){return new Blob(['crop'],{type:'image/png'})}
  };
  const boxes=Object.fromEntries(BILL_FIELDS.map(f=>[f,[0.15,0.25,0.5,0.08]]));
  boxes.transactionTime=[0.11,0.01,0.5,0.04];
  const result=await inspectBillZones({
   imageBlob:new Blob(['image']),boxes,
   documentBox:[0.1,0.2,0.8,0.75],
   expectedAccount:'2901181999999',
   aiFields:{amount:70000,account:'2901181999999',
     transactionTime:'2026-11-16 15:25'},
   readOcr:async({field})=>({
    amount:'70.000đ',account:'2901181999999',
    transactionTime:'15:25 16/11/2026'
   })[field]??null
  });
  assert.equal(result.fields.transactionTime.status,'outside_document');
  assert.ok(result.reviewFields.includes('transactionTime'));
  assert.equal(result.readyForIndependentBankMatch,false);
  assert.equal(result.ledgerWritten,false);
 }finally{
  if(priorBitmap===undefined)delete globalThis.createImageBitmap;
  else globalThis.createImageBitmap=priorBitmap;
  if(priorCanvas===undefined)delete globalThis.OffscreenCanvas;
  else globalThis.OffscreenCanvas=priorCanvas;
 }
});
test('OCR confidence cannot alone authorize a conflicting transfer',async()=>{
 const priorBitmap=globalThis.createImageBitmap,priorCanvas=globalThis.OffscreenCanvas;
 try{
  globalThis.createImageBitmap=async()=>({width:100,height:100,close(){}});
  globalThis.OffscreenCanvas=class{
   constructor(w,h){this.width=w;this.height=h;}
   getContext(){return {drawImage(){}}}
   async convertToBlob(){return new Blob(['x'],{type:'image/png'})}
  };
  const result=await inspectBillZones({
   imageBlob:new Blob(['x']),expectedAccount:'2901181999999',
   boxes:{account:[0.1,0.2,0.7,0.3]},
   aiFields:{account:'2901181999999'},
   readOcr:async()=>({text:'2901181999999',confidence:0.4})
  });
  assert.equal(result.fields.account.status,'low_ocr_confidence');
  assert.equal(result.readyForIndependentBankMatch,false);
 }finally{
  if(priorBitmap===undefined)delete globalThis.createImageBitmap;
  else globalThis.createImageBitmap=priorBitmap;
  if(priorCanvas===undefined)delete globalThis.OffscreenCanvas;
  else globalThis.OffscreenCanvas=priorCanvas;
 }
});


test('AI locator must bind one transaction and distinct bounded critical fields',()=>{
 const layout={
  documentBox:[0.1,0.15,0.8,0.8],selectedTransaction:'single_detail',
  boxes:{amount:[0.15,0.25,0.3,0.05],
   account:[0.15,0.4,0.5,0.05],
   transactionTime:[0.15,0.55,0.4,0.05]}
 };
 assert.equal(validateBillRegionLayout(layout).ok,true);
 assert.equal(validateBillRegionLayout({...layout,selectedTransaction:'unknown'}).ok,false);
 assert.equal(validateBillRegionLayout({
   ...layout,boxes:{...layout.boxes,account:[0.15,0.25,0.3,0.05]}
 }).reason,'overlapping_critical_regions');
 assert.equal(validateBillRegionLayout({
   ...layout,boxes:{...layout.boxes,transactionTime:[0.15,0.02,0.4,0.05]}
 }).reason,'invalid_or_outside_document');
 assert.equal(validateBillRegionLayout({
   ...layout,boxes:{...layout.boxes,transferContent:[0.15,0.65,0.5,0.05],
     transferReference:[0.15,0.65,0.5,0.05]}
 }).reason,'memo_reference_same_region');
 assert.ok(BILL_REGION_LOCATOR_RULES.includes('thanh trạng thái'));
});
test('AI locates -> single image decode -> OCR all detected regions -> evidence only',async()=>{
 const originalBitmap=globalThis.createImageBitmap;
 const originalCanvas=globalThis.OffscreenCanvas;
 let decodes=0,crops=0,locates=0;
 try{
  globalThis.createImageBitmap=async()=>{decodes++;return{width:1000,height:1000,close(){}}};
  globalThis.OffscreenCanvas=class{
   constructor(w,h){this.width=w;this.height=h}
   getContext(){return{drawImage(){crops++}}}
   async convertToBlob(){return new Blob(['crop'],{type:'image/png'})}
  };
  const boxes={amount:[0.15,0.25,0.3,0.05],
   account:[0.15,0.4,0.5,0.05],
   transactionTime:[0.15,0.55,0.4,0.05]};
  const result=await analyzeBillWithRegions({
   imageBlob:new Blob(['mock']),expectedAccount:'2901181999999',
   locateRegions:async()=>{locates++;return{
    documentBox:[0.1,0.15,0.8,0.8],selectedTransaction:'single_detail',
    boxes,aiFields:{amount:70000,account:'2901181999999',
      transactionTime:'2026-11-16 15:25'}
   }},
   readOcr:async({field})=>({
     amount:'70.000đ',account:'2901181999999',
     transactionTime:'15:25 16/11/2026'
   })[field]??null
  });
  assert.equal(locates,1);assert.equal(decodes,1);assert.equal(crops,3);
  assert.equal(result.status,'fields_compared');
  assert.equal(result.readyForIndependentBankMatch,true);
  assert.equal(result.ledgerWritten,false);
  assert.deepEqual(result.reviewFields,[]);
 }finally{
  if(originalBitmap===undefined)delete globalThis.createImageBitmap;
  else globalThis.createImageBitmap=originalBitmap;
  if(originalCanvas===undefined)delete globalThis.OffscreenCanvas;
  else globalThis.OffscreenCanvas=originalCanvas;
 }
});
test('AI locator failures never authorize collection or infer missing account numbers',async()=>{
 let called=0;
 const result=await analyzeBillWithRegions({
   imageBlob:null,expectedAccount:'2901181999999',
   locateRegions:async()=>{called++;throw Error('temporary_ai_failure')},
   readOcr:async()=>{throw Error('should_not_be_called')}
 });
 assert.equal(called,1);
 assert.equal(result.status,'review');
 assert.equal(result.reason,'locator_unavailable');
 assert.equal(result.ledgerWritten,false);
 assert.equal(result.readyForIndependentBankMatch,false);
});
