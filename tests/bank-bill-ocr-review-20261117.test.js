import test from 'node:test';
import assert from 'node:assert/strict';
import {
 mapStoredBankBillToZoneFields,buildBillOcrReviewQueue,
 recheckBillOcrReviewQueue,assertReviewCorrectionIsIndependent
} from '../src/bank-bill-ocr-review.js';
import {analyzeBillWithRegions,validateBillRegionLayout} from '../src/bank-bill-region-ocr.js';

test('map real read fields without inventing printed account or bank clock',()=>{
 const v=mapStoredBankBillToZoneFields({
  amount_vnd:70000,receiving_account:'290118199999',
  transfer_at_vn:'2026-11-16 15:25',
  raw_read:{
   amount_vnd:70000,recipient_account_visible:'290118199999',
   recipient_name_printed:null,transfer_content:'Hanh dùng Zalopay chuyển tiền',
   transaction_datetime_vn:'2026-11-16 15:25',sender_name:'HANH',
   transfer_success_visible:true
  }
 });
 assert.equal(v.amount,70000);
 assert.equal(v.account,'290118199999');
 assert.equal(v.recipientName,null);
 assert.equal(v.transferContent,'Hanh dùng Zalopay chuyển tiền');
 assert.equal(v.transactionTime,'2026-11-16 15:25');
 assert.equal(v.transactionStatus,'GIAO DICH THANH CONG');
 assert.equal(v.transferReference,null);
});
test('one missing account field still allows amount and date to be inspected',async()=>{
 const doc=[0.1,0.1,0.8,0.8];
 const box={amount:[0.2,0.3,0.2,0.05],
   transactionTime:[0.2,0.5,0.35,0.05]};
 const input={documentBox:doc,selectedTransaction:'single_detail',boxes:box,
   aiFields:{amount:70000,transactionTime:'2026-11-16 15:25'}};
 const layout=validateBillRegionLayout(input);
 assert.equal(layout.ok,true);
 assert.deepEqual(layout.missingFields,['account']);
 const originalBitmap=globalThis.createImageBitmap;
 const originalCanvas=globalThis.OffscreenCanvas;
 try{
  globalThis.createImageBitmap=async()=>({width:1000,height:1000,close(){}});
  globalThis.OffscreenCanvas=class {
    constructor(w,h){this.width=w;this.height=h;}
    getContext(){return{drawImage(){}}}
    async convertToBlob(){return new Blob(['crop'],{type:'image/png'})}
  };
  let count=0;
  const result=await analyzeBillWithRegions({
   imageBlob:new Blob(['x']),expectedAccount:'2901181999999',
   locateRegions:async()=>input,
   readOcr:async({field})=>{count++;return field==='amount'?'70.000đ':'15:25 16/11/2026'}
  });
  assert.equal(count,2);
  assert.equal(result.fields.amount.status,'agreed');
  assert.equal(result.fields.transactionTime.status,'agreed');
  assert.equal(result.fields.account.status,'unreadable');
  assert.deepEqual(result.reviewFields,['account']);
  assert.equal(result.readyForIndependentBankMatch,false);
  assert.equal(result.ledgerWritten,false);
 }finally{
  if(originalBitmap===undefined)delete globalThis.createImageBitmap;
  else globalThis.createImageBitmap=originalBitmap;
  if(originalCanvas===undefined)delete globalThis.OffscreenCanvas;
  else globalThis.OffscreenCanvas=originalCanvas;
 }
});
test('manual review queue distinguishes redraw, retry and conflicting reads',()=>{
 const analysis={fields:{
  account:{status:'conflict',needsReview:true,aiValue:'290118199999',ocrValue:'2901181999999'},
  amount:{status:'agreed',needsReview:false,value:'70000'},
  transactionTime:{status:'unreadable',needsReview:true,value:null},
  transferContent:{status:'crop_or_ocr_unavailable',needsReview:true}
 }};
 const boxes={account:[0.1,0.2,0.6,0.05],transferContent:[0.1,0.5,0.8,0.07]};
 const queue=buildBillOcrReviewQueue({analysis,boxes,documentBox:[0.05,0.05,0.9,0.9]});
 assert.equal(queue.items.length,3);
 assert.deepEqual(queue.items.map(x=>x.action),['compare_two_reads','redraw_region','retry_only_this_crop']);
 assert.ok(queue.items.every(x=>x.collectionAuthorized===false));
});
test('focused retry crops only the failed account, never writes or authorizes money',async()=>{
 const origBitmap=globalThis.createImageBitmap,origCanvas=globalThis.OffscreenCanvas;
 let crops=0,readerCalls=0;
 try{
  globalThis.createImageBitmap=async()=>({width:1000,height:1000,close(){}});
  globalThis.OffscreenCanvas=class{
   constructor(w,h){this.width=w;this.height=h;}
   getContext(){return{drawImage(){crops++}}}
   async convertToBlob(){return new Blob(['crop'],{type:'image/png'})}
  };
  const analysis={
   originalAiFields:{account:'2901181999999'},
   fields:{
    account:{status:'conflict',aiValue:'2901181999999',ocrValue:'290118199999',needsReview:true},
    amount:{status:'agreed',value:'70000',needsReview:false}
   },
   reviewFields:['account'],readyForIndependentBankMatch:false,ledgerWritten:false
  };
  const result=await recheckBillOcrReviewQueue({
   imageBlob:new Blob(['x']),analysis,
   boxes:{account:[0.12,0.25,0.5,0.08]},
   documentBox:[0.1,0.1,0.8,0.8],
   readOcr:async({field,crop,attempt})=>{
    readerCalls++;
    assert.equal(field,'account');assert.equal(crop.type,'image/png');
    assert.equal(attempt,'focused_retry');return{text:'2901181999999',confidence:0.98};
   }
  });
  assert.equal(crops,1);assert.equal(readerCalls,1);
  assert.equal(result.fields.account.status,'agreed');
  assert.equal(result.fields.amount.status,'agreed');
  assert.deepEqual(result.reviewFields,[]);
  assert.equal(result.readyForIndependentBankMatch,false);
  assert.equal(result.requiresFullReconciliation,true);
  assert.equal(result.ledgerWritten,false);
 }finally{
  if(origBitmap===undefined)delete globalThis.createImageBitmap;
  else globalThis.createImageBitmap=origBitmap;
  if(origCanvas===undefined)delete globalThis.OffscreenCanvas;
  else globalThis.OffscreenCanvas=origCanvas;
 }
});
test('unknown and contradictory manual values remain review-only',()=>{
 assert.equal(assertReviewCorrectionIsIndependent('account','290118199999','2901181999999').status,'conflict');
 assert.equal(assertReviewCorrectionIsIndependent('account','290118199999','2901181999999').collectionAuthorized,false);
 assert.equal(assertReviewCorrectionIsIndependent('unsafe','a','b').status,'unknown_field');
 assert.equal(assertReviewCorrectionIsIndependent('recipientName',null,null).status,'optional_absent');
});
