import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 BILL_FIELDS,normalizeRecipientName,normalizeBillField,
 validateRegion,compareRegionRead,inspectBillZones
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
 assert.deepEqual(BILL_FIELDS,['amount','account','recipientName','transactionTime']);
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
   assert.equal(crops,4);
   assert.equal(result.fields.recipientName.status,'optional_absent');
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
