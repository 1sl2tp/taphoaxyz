import test from 'node:test';
import assert from 'node:assert/strict';
import {
 parsePrintedBillClock,parseOfficialAgribankCredit,findAgribankBillEvidence
} from '../src/bank-bill-bank-evidence.js';
import {analyzeBillWithRegions} from '../src/bank-bill-region-ocr.js';

const account='1234567890123';
const transferMemo='Hanh dung Zalopay chuyen tien';
const notice=(date='16/11/2026',hour='15:25',amount='70,000',memo='O5CH7L3VSMM4-'+transferMemo)=>
 'Agribank: '+hour+' '+date+' Tài khoản '+account+': +'+amount+
 'VND. Nội dung giao dịch: '+memo+'. Số dư cuối: 5,000,000VND';
const credit=(id=348,extra={})=>({
 id,package_name:'com.vnpay.Agribank3g',status:'credit_candidate',
 is_own_transfer:false,bank_credit_account:account,amount_vnd:70000,
 transfer_at:'2026-11-16T15:25:00+07:00',
 posted_at:'2026-11-16T17:51:00+07:00',
 body:notice(),...extra
});
const good=(extra={})=>({
 fields:{
  amount:{status:'agreed',value:'70000'},
  transactionTime:{status:'agreed',value:'2026-11-16 15:25'},
  account:{status:'agreed',value:account},
  transferContent:{status:'agreed',value:'HANH DUNG ZALOPAY CHUYEN TIEN'},
  recipientName:{status:'optional_absent',value:null},
  senderName:{status:'optional_absent',value:null},
  transferReference:{status:'optional_absent',value:null},
  transactionStatus:{status:'agreed',value:'SUCCESS'},
  ...extra
 }
});
const pair=(billRead=good(),notifications=[credit()],extra={})=>
 findAgribankBillEvidence({
   billRead,notifications,expectedAccount:account,
   usedNotificationIds:[],creditUsageKnown:true,...extra
 });

test('match bank-printed clock, not delayed Android push or server receipt',()=>{
 const c=credit();
 const parsed=parseOfficialAgribankCredit(c,account);
 assert.equal(parsed.notificationId,348);
 assert.equal(parsed.amountVnd,70000);
 assert.equal(parsed.transactionMs,Date.parse('2026-11-16T15:25:00+07:00'));
 const result=pair();
 assert.equal(result.status,'candidate_for_financial_rpc');
 assert.equal(result.reason,'unique_credit_with_verified_memo');
 assert.equal(result.candidateId,348);
 assert.equal(result.bankFormat,'routing-id');
 assert.equal(result.bankTransactionTime,'2026-11-16T08:25:00.000Z');
 assert.equal(result.automaticCollectionAuthorized,false);
 assert.equal(result.ledgerWritten,false);
});
test('notification crosses midnight after previous-day bill, no business-day filter',()=>{
 const overnight=credit(349,{
  body:notice('16/11/2026','23:58'),
  transfer_at:'2026-11-16T23:58:00+07:00',
  posted_at:'2026-11-17T03:20:00+07:00'
 });
 const bill=good({transactionTime:{status:'agreed',value:'2026-11-16 23:58'}});
 assert.equal(pair(bill,[overnight]).status,'candidate_for_financial_rpc');
});
test('bank event must be authenticated Agribank credit and internally consistent',()=>{
 const invalid=[
  credit(348,{package_name:'com.fake.Agribank'}),
  credit(348,{status:'unclassified'}),
  credit(348,{is_own_transfer:true}),
  credit(348,{bank_credit_account:'9999999999999'}),
  credit(348,{amount_vnd:90000}),
  credit(348,{body:notice('31/02/2026')}),
  credit(348,{body:notice('16/11/2026','28:25')}),
  credit(348,{body:notice('16/11/2026','15:25','70,00')}),
  credit(348,{body:notice().replace(account,'9999999999999')}),
  credit(348,{transfer_at:'2026-11-16T15:30:00+07:00'}),
  credit(348,{id:'348'})
 ];
 for(const bad of invalid)assert.equal(parseOfficialAgribankCredit(bad,account),null);
 assert.equal(pair(good(),invalid).status,'waiting_bank_event');
});
test('duplicate notification id can appear in a retry batch without becoming two credits',()=>{
 const same=credit(348,{posted_at:'2026-11-17T05:05:00+07:00'});
 assert.equal(pair(good(),[credit(348),same]).status,'candidate_for_financial_rpc');
});
test('two distinct incoming credits of equal amount and minute are ambiguous',()=>{
 const two=[credit(348),credit(350)];
 const result=pair(good(),two);
 assert.equal(result.status,'review');
 assert.equal(result.reason,'multiple_official_bank_credits_same_minute');
 assert.deepEqual(result.candidateIds,[348,350]);
});
test('missing consumption lookup must never be treated as unused',()=>{
 const noQuery=pair(good(),[credit()],{creditUsageKnown:false});
 assert.equal(noQuery.reason,'credit_consumption_check_unavailable');
 assert.equal(noQuery.automaticCollectionAuthorized,false);
 assert.equal(pair(good(),[credit()],{usedNotificationIds:[348]}).reason,
   'bank_credit_already_consumed');
 assert.equal(pair(good(),[credit()],{usedNotificationIds:['348']}).reason,
   'credit_consumption_check_invalid');
});
test('account missing/partial can discover a bank proof but never authorize final collection',()=>{
 const partial=good({account:{status:'single_source',value:'123456789012'}});
 const result=pair(partial);
 assert.equal(result.status,'review');
 assert.equal(result.candidateId,348);
 assert.equal(result.reason,'bill_account_requires_region_recheck');
 assert.equal(result.automaticCollectionAuthorized,false);
 assert.equal(pair(good({account:{status:'agreed',value:'9999999999999'}})).reason,
   'bill_destination_account_conflict');
 assert.equal(pair(good({account:{status:'conflict',value:null}})).reason,
   'bill_destination_account_unverified');
});
test('name absent is valid; mismatched visible name and failed bill are not',()=>{
 assert.equal(pair(good()).status,'candidate_for_financial_rpc');
 assert.equal(pair(good({recipientName:{status:'conflict',value:null}})).reason,
   'recipient_name_conflict');
 assert.equal(pair(good({transactionStatus:{status:'agreed',value:'FAILED'}})).reason,
   'failed_transaction_printed');
});
test('generic/incorrect transfer memo and missing OCR cannot approve a credit',()=>{
 const generic=good({transferContent:{status:'agreed',value:'CHUYEN TIEN'}});
 assert.equal(pair(generic).reason,'transfer_memo_requires_region_recheck');
 const absent=good({transferContent:{status:'optional_absent',value:null}});
 assert.equal(pair(absent).reason,'transfer_memo_requires_region_recheck');
 const other=good({transferContent:{status:'agreed',value:'NGUYEN THI HA CHUYEN TIEN'}});
 assert.equal(pair(other).reason,'transfer_memo_requires_region_recheck');
});
test('invalid printed time, absent AI amount and no events fail closed',()=>{
 assert.equal(parsePrintedBillClock('2026-11-31 15:25'),null);
 assert.equal(parsePrintedBillClock('15:25'),null);
 assert.equal(parsePrintedBillClock('2026-11-16 23:59'),'2026-11-16 16:59:00Z' && Date.parse('2026-11-16T23:59:00+07:00'));
 assert.equal(pair(good(),[]).status,'waiting_bank_event');
 assert.equal(pair(good({amount:{status:'single_source',value:'70000'}})).reason,
   'amount_or_transaction_clock_unverified');
 assert.equal(findAgribankBillEvidence({
   billRead:good(),notifications:Array.from({length:101},()=>credit()),expectedAccount:account
 }).reason,'evidence_unavailable');
});


test('full AI boxes + independent OCR + delayed bank event yield review-only candidate',async()=>{
 const bitmap=globalThis.createImageBitmap,canvas=globalThis.OffscreenCanvas;
 let crops=0,decoded=0;
 try{
  globalThis.createImageBitmap=async()=>{decoded++;return{width:1000,height:1000,close(){}}};
  globalThis.OffscreenCanvas=class{
   constructor(w,h){this.width=w;this.height=h}
   getContext(){return{drawImage(){crops++}}}
   async convertToBlob(){return new Blob(['crop'],{type:'image/png'})}
  };
  const bounds={
    amount:[0.15,0.2,0.3,0.05],account:[0.15,0.3,0.5,0.05],
    transactionTime:[0.15,0.4,0.3,0.05],
    transferContent:[0.15,0.5,0.7,0.05],
    transactionStatus:[0.15,0.6,0.4,0.05]
  };
  const locateRegions=async()=>({
   documentBox:[0.1,0.1,0.8,0.85],
   selectedTransaction:'single_detail',boxes:bounds,
   aiFields:{
    amount:'70.000đ',account,transactionTime:'2026-11-16 15:25',
    transferContent:'Hanh dung Zalopay chuyen tien',
    transactionStatus:'Giao dịch thành công'
   }
  });
  const readOcr=async({field})=>({
   amount:'70,000 VND',account,transactionTime:'15:25 16/11/2026',
   transferContent:'Hạnh dùng Zalopay chuyển tiền',
   transactionStatus:'Giao dịch thành công'
  })[field];
  const props={imageBlob:new Blob(['mock']),locateRegions,readOcr,
    expectedAccount:account,bankNotifications:[credit()],
    creditUsageKnown:true,usedNotificationIds:[]};
  const found=await analyzeBillWithRegions(props);
  assert.equal(decoded,1);
  assert.equal(crops,5);
  assert.equal(found.fields.recipientName.status,'optional_absent');
  assert.equal(found.bankEvidence.status,'candidate_for_financial_rpc');
  assert.equal(found.status,'bank_candidate_review');
  assert.equal(found.bankEvidence.candidateId,348);
  assert.equal(found.readyForIndependentBankMatch,true);
  assert.equal(found.automaticCollectionAuthorized,false);
  assert.equal(found.ledgerWritten,false);

  const unknownUsage=await analyzeBillWithRegions({...props,creditUsageKnown:false});
  assert.equal(unknownUsage.status,'review');
  assert.equal(unknownUsage.bankEvidence.reason,'credit_consumption_check_unavailable');
  assert.equal(unknownUsage.automaticCollectionAuthorized,false);

  const wrongAccount=await analyzeBillWithRegions({...props,
   readOcr:async({field})=>field==='account'?'123456789012':(await readOcr({field}))});
  assert.equal(wrongAccount.fields.account.status,'conflict');
  assert.equal(wrongAccount.status,'review');
  assert.equal(wrongAccount.bankEvidence.reason,'bill_destination_account_unverified');
  assert.equal(wrongAccount.ledgerWritten,false);
 }finally{
  if(bitmap===undefined)delete globalThis.createImageBitmap;
  else globalThis.createImageBitmap=bitmap;
  if(canvas===undefined)delete globalThis.OffscreenCanvas;
  else globalThis.OffscreenCanvas=canvas;
 }
});
