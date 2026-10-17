import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const code=readFileSync('src/fixed-ui-cart-share-v3.js','utf8');
const start=code.indexOf('  // Single tap: use the OS share sheet');
const end=code.indexOf('  // UI-113:',start);
const segment=code.slice(start,end);

test('saved-order detail shares its portrait PNG, while draft cart can share text',()=>{
  assert.match(segment,/async function shareNativeOrderText/);
  assert.match(segment,/navigator\.share\(\{title,text\}\)/);
  assert.match(segment,/cartNativeShareText\(entries\)/);
  assert.match(segment,/const artifact=await prepareDetailShareCache\(\)/);
  assert.match(segment,/shareOrDownloadPng\(artifact\.blob,artifact\.fileName,artifact\.title,artifact\.text\)/);
  assert.doesNotMatch(segment,/beginChatOrderShare|window\.open/);
  assert.doesNotMatch(segment,/await shareNativeOrderText\('Đơn hàng',detail\)/);
});
test('native share and clipboard fallback preserve 5 field order with no double action',async()=>{
  const events={share:[],copy:[],toasts:[]};
  const context={
    navigator:{share:async p=>{events.share.push(p);}},
    showToast:(...args)=>events.toasts.push(args),
    nativeShareInFlight:false,isShareCancel:()=>false,
    getOrderMeta:()=>({isCreatingSaleDraft:true,customer:'KH mẫu',time:'13/10 14:00',orderId:''}),
    currentCartEntries:()=>[['a',{name:'Sữa',qty:2,price:12000,note:'2 thùng'}]],
    document:{getElementById:id=>id==='orderDetailContentToShare'?null:null}
  };
  const api=vm.runInNewContext('(()=>{'+segment+'; return {cartNativeShareText,shareNativeOrderText,shareCartOrderImageV3};})()',context);
  const text=api.cartNativeShareText(context.currentCartEntries());
  for(const token of ['Sữa','2','12.000','24.000','Ghi chú','Tổng SL'])assert.ok(text.includes(token),token);
  await api.shareCartOrderImageV3();
  assert.equal(events.share.length,1);
  assert.match(events.share[0].text,/Tổng tiền: 24\.000/);
  context.navigator.share=undefined;
  context.navigator.clipboard={writeText:async text=>events.copy.push(text)};
  await api.shareCartOrderImageV3();
  assert.equal(events.copy.length,1);
  assert.equal(events.share.length,1);
  assert.equal(events.toasts.length,1);
});
test('cancelled OS share does not open alternative window or claim a copy',async()=>{
  const events={copy:0};
  const context={
    navigator:{share:async()=>{const e=new Error('cancel');e.name='AbortError';throw e;},clipboard:{writeText:async()=>events.copy++}},
    showToast:()=>{throw Error('unexpected toast')},
    isShareCancel:e=>e.name==='AbortError',nativeShareInFlight:false
  };
  const a=vm.runInNewContext('(()=>{'+segment.slice(segment.indexOf('  async function shareNativeOrderText('),segment.indexOf('  async function shareDetailOrderImageV3('))+';return shareNativeOrderText;})()',context);
  await a('Test','Text');
  assert.equal(events.copy,0);
});
