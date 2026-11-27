import test from 'node:test';
import assert from 'node:assert/strict';
import {nextDeliveryStage,pushRecovery} from './delivery-policy.mjs';
const r={eventId:'fixture-event',recipientId:'fixture-recipient',messageId:'fixture-message'};
const p={...r,authorized:true,messageLive:true,revisionMatch:true,mediaLive:false,objectLive:false,snapshotVerified:true};
test('all notice adapters use same exact identity and verified evidence',()=>{
 for(const kind of ['order','staff','edit','manual','debt','collection','chat-media']){
  const a={...r,kind};
  assert.equal(nextDeliveryStage(a,p,100),'render_original');
  assert.equal(nextDeliveryStage(a,{...p,leaseActive:true},100),'wait');
  assert.equal(nextDeliveryStage(a,{...p,objectLive:true,assetMatches:true,pngVerified:true},100),'attach_existing');
  assert.equal(nextDeliveryStage(a,{...p,objectLive:true},100),'review');
  assert.equal(nextDeliveryStage(a,{...p,mediaLive:true,objectLive:true,assetMatches:true},100),'attached');
  assert.equal(nextDeliveryStage(a,{...p,mediaLive:true},100),'review');
  assert.equal(nextDeliveryStage(a,{...p,attachedAck:true},100),'review');
  for(const bad of [{recipientId:'other'},{eventId:'other'},{messageId:'other'},{authorized:false},{messageLive:false},{revisionMatch:false}])
   assert.equal(nextDeliveryStage(a,{...p,...bad},100),'blocked');
 }
});
test('unknown push outcome must never blindly retry',()=>{
 const a={...r,state:'processing',leaseUntil:90,attempts:1};
 assert.equal(pushRecovery(a,p,100),'review');
 assert.equal(pushRecovery({...a,leaseUntil:101},p,100),'wait');
 assert.equal(pushRecovery(a,{...p,providerConfirmed:true},100),'acknowledge');
 assert.equal(pushRecovery(a,{...p,providerNotSent:true},100),'review');
 assert.equal(pushRecovery(a,{...p,providerNotSent:true,fencedAttempt:true},100),'retry');
 assert.equal(pushRecovery({...a,attempts:3},{...p,providerNotSent:true,fencedAttempt:true},100),'review');
});
