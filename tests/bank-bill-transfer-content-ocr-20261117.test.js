import test from 'node:test';
import assert from 'node:assert/strict';
import {
 normalizeTransferText,extractOfficialBankMemo,compareTransferMemo
} from '../src/bank-bill-transfer-content-ocr.js';

const billMemo='Hạnh dùng Zalopay chuyển tiền';
const bankLiteral='Hanh dung Zalopay chuyen tien';
const proof=content=>
 'Agribank: 15:25 16/11/2026 Tài khoản 2901181999999: +70,000VND. '
 +'Nội dung giao dịch: '+content+'. Số dư cuối: -212,394,230VND';

test('unaccented transfer memo preserves routing reference and rejects short generic text',()=>{
 assert.equal(normalizeTransferText(billMemo),'HANH DUNG ZALOPAY CHUYEN TIEN');
 assert.equal(normalizeTransferText('FT123456789 - chuyen tien'),'FT123456789 - CHUYEN TIEN');
 assert.equal(normalizeTransferText(null),null);
 assert.equal(extractOfficialBankMemo(proof('ABC123456789-Hanh dung Zalopay chuyen tien')),
  'ABC123456789-Hanh dung Zalopay chuyen tien');
 // The final period is part of the bank evidence; no arbitrary punctuation removal.
 const generic=compareTransferMemo({printedMemo:'Chuyển tiền',bankMemo:'chuyen tien'});
 assert.equal(generic.status,'manual_review');
 assert.equal(generic.automaticCollectionAuthorized,false);
});
test('real ZaloPay 70k memo: strict bank-only 12-char routing token matches the full payer memo',()=>{
 const bank='O5CH7L3VSMM4-Hanh dung Zalopay chuyen tien';
 const answer=compareTransferMemo({
   printedMemo:billMemo,bankMemo:bank
 });
 assert.equal(answer.status,'consistent');
 assert.equal(answer.reason,'verified_bank_routing_prefix');
 assert.equal(answer.routingCode,'O5CH7L3VSMM4');
 assert.equal(answer.bankTransferVerified,false);
 assert.equal(answer.automaticCollectionAuthorized,false);
 assert.equal(answer.ledgerWritten,false);
 const different=compareTransferMemo({printedMemo:billMemo,bankMemo:
  'O5CH7L3VSMM4-Nguyen Thi Ha chuyen tien'});
 assert.equal(different.status,'manual_review');
 const fake=compareTransferMemo({printedMemo:billMemo,bankMemo:
  'ABC-Hanh dung Zalopay chuyen tien'});
 assert.equal(fake.status,'manual_review');
});
test('QR and MB envelopes only unwrap fully anchored literals',()=>{
 const qr=compareTransferMemo({
   printedMemo:billMemo,bankMemo:'QR - '+bankLiteral});
 assert.equal(qr.status,'consistent');assert.equal(qr.bankFormat,'qr');
 const mb=compareTransferMemo({
   printedMemo:billMemo,bankMemo:'MB(123456)('+bankLiteral+')'});
 assert.equal(mb.status,'consistent');assert.equal(mb.bankFormat,'mb');
 assert.equal(compareTransferMemo({printedMemo:'Chuyen tien',
   bankMemo:'QR - CHUYEN TIEN'}).status,'manual_review');
 assert.equal(compareTransferMemo({printedMemo:billMemo,
   bankMemo:'MB(abcdef)('+bankLiteral+')'}).status,'manual_review');
});
test('IBFT and MCC need a distinctive original sender-bound memo',()=>{
 const text='Nguyễn Thị Hồng thanh toán đơn hàng 1234';
 const sender='Nguyễn Thị Hồng';
 const ibft=compareTransferMemo({printedMemo:text,bankMemo:'IBFT '+text,senderName:sender});
 assert.equal(ibft.status,'consistent');assert.equal(ibft.bankFormat,'ibft');
 assert.equal(compareTransferMemo({printedMemo:text,bankMemo:'IBFT '+text}).status,'manual_review');
 const mcc='123456-'+text+';MCC;20261116152500;123456789012;654321';
 const good=compareTransferMemo({printedMemo:text,bankMemo:mcc,senderName:sender});
 assert.equal(good.status,'consistent');assert.equal(good.bankFormat,'mcc');
 assert.equal(compareTransferMemo({printedMemo:text,bankMemo:mcc,
   senderName:'Trần Thị Hòa'}).status,'manual_review');
});
test('MBVCB must bind ref, sender AND target account to its envelope',()=>{
 const memo='Nguyễn Thị Hồng thanh toán đơn hàng 1234';
 const bank='MBVCB.1234567890.1234.'+memo+
  '.CT tu 123456789012 NGUYEN THI HONG toi 2901181999999 BUI XUAN TUNG tai AGRIBANK';
 const args={printedMemo:memo,bankMemo:bank,senderName:'Nguyễn Thị Hồng',
   transferReference:'#1234567890',expectedAccount:'2901181999999'};
 const ok=compareTransferMemo(args);
 assert.equal(ok.status,'consistent');assert.equal(ok.bankFormat,'mbvcb');
 assert.equal(compareTransferMemo({...args,transferReference:'1234567891'}).status,'manual_review');
 assert.equal(compareTransferMemo({...args,expectedAccount:'2901181999998'}).status,'manual_review');
 assert.equal(compareTransferMemo({...args,senderName:'Trần Thị Hà'}).status,'manual_review');
});
test('bank text cannot be inferred from receipt clock, amount or OCR alone',()=>{
 assert.equal(compareTransferMemo({printedMemo:billMemo}).status,'manual_review');
 assert.equal(compareTransferMemo({bankMemo:bankLiteral}).status,'manual_review');
 assert.equal(compareTransferMemo({}).status,'not_available');
 assert.equal(extractOfficialBankMemo('Giao dịch thành công 70.000đ'),null);
 // An unknown bank-side wrapper is not treated as a receipt reference.
 assert.equal(compareTransferMemo({
   printedMemo:billMemo,bankMemo:'UNKNOWN(1234) '+bankLiteral}).status,'manual_review');
});


test('official Agribank 70k body ends memo at its own punctuation, not at a phone banner',()=>{
 const official=proof('O5CH7L3VSMM4-Hanh dung Zalopay chuyen tien');
 const memo=extractOfficialBankMemo(official);
 assert.equal(memo,'O5CH7L3VSMM4-Hanh dung Zalopay chuyen tien');
 const result=compareTransferMemo({printedMemo:billMemo,bankNotificationBody:official});
 assert.equal(result.status,'consistent');
 assert.equal(result.reason,'verified_bank_routing_prefix');
 assert.equal(result.bankTransferVerified,false);
 assert.equal(result.automaticCollectionAuthorized,false);
});
