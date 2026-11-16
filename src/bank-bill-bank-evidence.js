// BANK-ZONE-OCR — match independently captured Agribank credit EVIDENCE.
// Read-only candidate selector, never a financial authorization.
// Bank-printed transaction clock is authoritative; arrival/Chat time is not.
import {compareTransferMemo} from './bank-bill-transfer-content-ocr.js';

const OFFICIAL_PACKAGE='com.vnpay.Agribank3g';
const trim=s=>String(s??'').trim();
const number=s=>{
 const raw=trim(s);
 if(!/^\d{1,12}$/.test(raw))return null;
 const v=Number(raw);
 return Number.isSafeInteger(v)&&v>0&&v<1e12?v:null;
};
function utcVietnamClock(year,month,day,hour,minute,second=0){
 const y=Number(year),m=Number(month),d=Number(day);
 const h=Number(hour),min=Number(minute),sec=Number(second);
 if(y<2020||y>2099||m<1||m>12||h<0||h>23||min<0||min>59||sec<0||sec>59)return null;
 const cal=new Date(Date.UTC(y,m-1,d));
 if(cal.getUTCFullYear()!==y||cal.getUTCMonth()!==m-1||cal.getUTCDate()!==d)
   return null;
 return Date.UTC(y,m-1,d,h,min,sec)-7*3600000;
}
export function parsePrintedBillClock(value){
 const m=/^(20\d\d)-([01]\d)-([0-3]\d) ([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/
   .exec(trim(value).replace('T',' '));
 return m?utcVietnamClock(m[1],m[2],m[3],m[4],m[5],m[6]??0):null;
}
export function parseOfficialAgribankCredit(event,expectedAccount){
 if(!event||event.package_name!==OFFICIAL_PACKAGE||
    event.status!=='credit_candidate'||event.is_own_transfer!==false||
    !Number.isSafeInteger(event.id)||event.id<=0)return null;
 const expected=trim(expectedAccount).replace(/\D/g,'');
 if(!/^\d{9,20}$/.test(expected)||event.bank_credit_account!==expected)return null;
 const body=trim(event.body);
 const m=/^Agribank:\s*([01]\d|2[0-3]):([0-5]\d)\s+([0-3]\d)\/([01]\d)\/(20\d{2})\s+Tài khoản\s+(\d{9,20})\s*:\s*\+\s*([\d.,]+)\s*VND(?:\.|\s|$)/i.exec(body);
 if(!m||m[6]!==expected)return null;
 const a=m[7];
 if(!/^(?:\d{1,12}|\d{1,3}(?:[.,]\d{3})+)$/.test(a))return null;
 const amount=number(a.replace(/[.,]/g,''));
 if(amount===null||amount!==event.amount_vnd)return null;
 const transactionMs=utcVietnamClock(m[5],m[4],m[3],m[1],m[2]);
 if(transactionMs===null)return null;
 // A stored bank transaction timestamp, when available, corroborates the
 // bank-printed minute. Arrival/posting timestamps are NOT compared here.
 if(event.transfer_at!=null){
   const recorded=Date.parse(String(event.transfer_at));
   if(!Number.isFinite(recorded)||Math.abs(recorded-transactionMs)>60000)
     return null;
 }
 return {notificationId:event.id,amountVnd:amount,bankAccount:expected,
   transactionMs,body};
}
const info=(status,reason,extra={})=>({
 status,reason,...extra,automaticCollectionAuthorized:false,ledgerWritten:false
});
/**
 * Read-only proof gate: billRead is the result of inspectBillZones.
 * creditUsageKnown must mean a successful complete consumption lookup;
 * an empty usedNotificationIds array alone does NOT prove an unused credit.
 */
export function findAgribankBillEvidence({
 billRead,notifications,expectedAccount,
 usedNotificationIds=[],creditUsageKnown=false
}={}){
 const fields=billRead?.fields;
 if(!fields||!Array.isArray(notifications)||notifications.length>100)
   return info('review','evidence_unavailable');
 const amount=number(fields.amount?.value);
 const billTime=parsePrintedBillClock(fields.transactionTime?.value);
 if(fields.amount?.status!=='agreed'||fields.transactionTime?.status!=='agreed'||
    amount===null||billTime===null)
   return info('review','amount_or_transaction_clock_unverified');
 const expected=trim(expectedAccount).replace(/\D/g,'');
 if(!/^\d{9,20}$/.test(expected))return info('review','destination_account_missing');
 const account=trim(fields.account?.value).replace(/\D/g,'');
 if(fields.account?.status==='agreed'&&account&&account!==expected)
   return info('review','bill_destination_account_conflict');
 if(fields.account?.status==='conflict'||fields.account?.status==='outside_document')
   return info('review','bill_destination_account_unverified');
 if(fields.transactionStatus?.status==='agreed'&&fields.transactionStatus.value==='FAILED')
   return info('review','failed_transaction_printed');
 if(fields.recipientName?.status==='conflict')
   return info('review','recipient_name_conflict');
 const matches=[];
 const distinct=new Set();
 for(const e of notifications){
   const bank=parseOfficialAgribankCredit(e,expected);
   if(!bank||bank.amountVnd!==amount||Math.abs(bank.transactionMs-billTime)>60000)continue;
   if(distinct.has(bank.notificationId))continue;
   distinct.add(bank.notificationId);
   matches.push(bank);
 }
 if(matches.length===0)return info('waiting_bank_event','no_official_bank_credit_same_minute');
 if(matches.length>1)return info('review','multiple_official_bank_credits_same_minute',{
   candidateIds:matches.map(m=>m.notificationId)});
 const candidate=matches[0];
 const memo=compareTransferMemo({
   printedMemo:fields.transferContent?.status==='agreed'?fields.transferContent.value:null,
   bankNotificationBody:candidate.body,
   senderName:fields.senderName?.status==='agreed'?fields.senderName.value:null,
   transferReference:fields.transferReference?.status==='agreed'?fields.transferReference.value:null,
   expectedAccount:expected
 });
 const evidence={candidateId:candidate.notificationId,amountVnd:amount,
   bankTransactionTime:new Date(candidate.transactionMs).toISOString(),
   memoStatus:memo.status,memoReason:memo.reason,bankFormat:memo.bankFormat};
 if(!creditUsageKnown)return info('review','credit_consumption_check_unavailable',evidence);
 if(!Array.isArray(usedNotificationIds)||
    usedNotificationIds.some(x=>!Number.isSafeInteger(x)||x<=0))
   return info('review','credit_consumption_check_invalid',evidence);
 if(usedNotificationIds.includes(candidate.notificationId))
   return info('review','bank_credit_already_consumed',evidence);
 if(fields.account?.status!=='agreed'||account!==expected)
   return info('review','bill_account_requires_region_recheck',evidence);
 if(!['agreed','optional_absent'].includes(fields.recipientName?.status))
   return info('review','recipient_name_requires_region_recheck',evidence);
 if(fields.transferContent?.status!=='agreed'||memo.status!=='consistent')
   return info('review','transfer_memo_requires_region_recheck',evidence);
 // Candidate only: CURRENT financial RPC must revalidate competing bills,
 // bank proof, duplicate links and transactional locks before any payment.
 return info('candidate_for_financial_rpc','unique_credit_with_verified_memo',evidence);
}
