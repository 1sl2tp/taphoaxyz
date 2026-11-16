// BANK-ZONE-OCR-20261117 — inspect transfer MEMO evidence, never authorize a debt write.
// Compare the printed bill's exact text with the official bank-notification MEMO.
// Bank-side routing wrappers must remain attached to the original evidence.
// This module returns REVIEW when formatting is unknown: amount/time/account
// and transactional idempotency are mandatory independently of any memo result.
export function normalizeTransferText(value){
  if(typeof value!=='string')return null;
  const raw=value.trim();
  if(!raw||raw.length>600)return null;
  return raw.normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/đ/g,'d').replace(/Đ/g,'D')
    .replace(/\s+/g,' ').toUpperCase().trim();
}
function meaningful(value){
  const canonical=normalizeTransferText(value);
  if(!canonical)return false;
  const characters=canonical.replace(/[^A-Z0-9]/g,'');
  // Common "chuyen tien" alone is not a distinguishing receipt memo.
  return characters.length>=16&&characters!=='CHUYENTIEN';
}
function explain(status,reason,bankFormat=null,routingCode=null){
  return {status,reason,bankFormat,routingCode,
    needsReview:status!=='consistent',
    bankTransferVerified:false,automaticCollectionAuthorized:false,
    ledgerWritten:false};
}
export function extractOfficialBankMemo(notificationBody){
  const text=String(notificationBody||'');
  // Agribank appends ". Số dư cuối:" as an OUTER notification delimiter.
// Remove that exact separator only; never erase arbitrary OCR punctuation.
  const match=/Nội dung giao dịch:\s*([\s\S]*?)(?:\.\s*Số dư cuối:|\s*Số dư cuối:|$)/i.exec(text);
  return match?.[1]?.trim()||null;
}
export function compareTransferMemo({printedMemo,bankMemo,bankNotificationBody,
  senderName=null,transferReference=null,expectedAccount=null}={}){
  const rawBank=bankMemo==null
    ?extractOfficialBankMemo(bankNotificationBody):String(bankMemo).trim();
  const printed=normalizeTransferText(printedMemo);
  const bank=normalizeTransferText(rawBank);
  if(!printed&&!bank)return explain('not_available','memo_missing_on_both_sides');
  if(!printed||!bank)return explain('manual_review','memo_missing_on_one_side');
  if(printed===bank)return explain(
    meaningful(printed)?'consistent':'manual_review',
    meaningful(printed)?'exact_memo':'generic_memo_not_distinctive','plain');
  // Strip ONLY an anchored, known bank-side technical envelope after comparing
  // the unchanged original text. Do not drop arbitrary words, digits or refs.
  const qr=/^QR\s*[-–:]\s+(.+)$/i.exec(rawBank);
  if(qr&&normalizeTransferText(qr[1])===printed){
    return explain(meaningful(printed)?'consistent':'manual_review',
      meaningful(printed)?'verified_qr_prefix':'qr_generic_memo','qr');
  }
  const mb=/^MB\((\d{6})\)\(([^()]*)\)\.?\s*$/i.exec(rawBank);
  if(mb&&normalizeTransferText(mb[2])===printed){
    return explain(meaningful(printed)?'consistent':'manual_review',
      meaningful(printed)?'verified_mb_envelope':'mb_generic_memo','mb',mb[1]);
  }
  // Twelve-character mixed-alphanumeric prefixes occur in ZaloPay -> Agribank
  // receipts. Require the entire suffix to match and be distinctive. The
  // prefix is a BANK routing token, NEVER the receipt transfer reference.
  const routed=/^([A-Z0-9]{12})-(.+)$/i.exec(rawBank);
  if(routed&&/[A-Z]/i.test(routed[1])&&/\d/.test(routed[1])&&
      normalizeTransferText(routed[2])===printed&&meaningful(printed)){
    return explain('consistent','verified_bank_routing_prefix','routing-id',routed[1]);
  }
  // IBFT/MCC may prepend bank routing information to the sender-bound memo.
  // Accept the memo evidence ONLY if the full visible sender is distinctive
  // and appears at the start of the unchanged original transfer description.
  const sender=normalizeTransferText(senderName);
  const senderBound=sender&&sender.replace(/[^A-Z0-9]/g,'').length>=12&&
    printed.startsWith(sender+' ')&&meaningful(printed);
  const ibft=/^IBFT\s+(.+)$/i.exec(rawBank);
  if(ibft&&senderBound&&normalizeTransferText(ibft[1])===printed)
    return explain('consistent','verified_ibft_sender_memo','ibft');
  const mcc=/^(\d{6})-(.+?);MCC;(20\d{12});(\d{9,20});(\d{6})\.?$/i.exec(rawBank);
  if(mcc&&senderBound&&normalizeTransferText(mcc[2])===printed)
    return explain('consistent','verified_mcc_sender_memo','mcc',mcc[1]);
  // Known MBVCB destination/sender envelope: verify *every* structural
  // component before accepting its embedded memo; require the exact transfer
  // reference when it is visible on the receipt.
  const mbvcb=/^MBVCB\.(\d{9,14})\.(\d{4,8})\.(.+?)\.CT tu (\d{9,20}) (.+?) toi (\d{9,20}) (.+?) tai AGRIBANK\.?$/i.exec(rawBank);
  const expected=String(expectedAccount||'').replace(/\D/g,'');
  const printedReference=String(transferReference||'').trim().replace(/^#/,'');
  if(mbvcb&&sender&&expected&&
      mbvcb[6]===expected&&normalizeTransferText(mbvcb[5])===sender&&
      printedReference===mbvcb[1]&&normalizeTransferText(mbvcb[3])===printed&&
      meaningful(printed)){
    return explain('consistent','verified_mbvcb_reference_sender_destination','mbvcb',mbvcb[1]);
  }
  return explain('manual_review','memo_mismatch_or_unverified_wrapper');
}
