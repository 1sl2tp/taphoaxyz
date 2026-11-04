import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const bridge=fs.readFileSync(new URL('../src/fixed-production-bridge.js',import.meta.url),'utf8');
const ui=fs.readFileSync(new URL('../src/fixed-ui-runtime-12.js',import.meta.url),'utf8');
const migration=fs.readFileSync(new URL('../supabase/migrations/20261104093000_taphoa_manual_debt_image_handoff.sql',import.meta.url),'utf8');
const start=bridge.indexOf('async function manualShareDebt(customerId,requestId,captureImage){');
const end=bridge.indexOf('\nasync function manualShareOrder(',start);
assert.ok(start>=0&&end>start,'manual debt sender owner is present');
const implementation=bridge.slice(start,end);
const customer='aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const otherCustomer='cccccccc-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const request='11111111-2222-4333-8444-555555555555';
const message='00000000-0000-4000-8000-000000000001';
const asset='00000000-0000-4000-8000-000000000002';
const storageKey='admin-account/conv/'+asset;

function fixture({textResponse={ok:true,message_id:message,customer_id:customer},ticketResponse={ok:true,message_id:message,asset_id:asset,storage_key:storageKey},ticketError=null,uploadError=null,attachResponse={ok:true,message_id:message,asset_id:asset},captureResult={blob:{size:321,type:'image/png'},width:700,height:1250}}={}){
  const events=[];let ownerCurrent=true,textCalls=0,captureCalls=0;
  const client={
    async rpc(name,args){
      events.push({name,args});
      if(name==='taphoa_manual_debt_image_ticket')return {data:ticketResponse,error:ticketError};
      if(name==='taphoa_manual_debt_image_attach')return {data:attachResponse,error:null};
      throw Error('unexpected RPC: '+name);
    },
    storage:{
      from(bucket){
        assert.equal(bucket,'v21-media');
        return {async upload(key,body,opts){
          events.push({name:'storage.upload',key,body,opts});
          return {error:uploadError};
        }};
      },
    },
  };
  const ctx={
    identity:{role:'admin'},
    publicAccess:null,employeeAccess:null,
    captureProductionOwner:()=>({token:'admin-session'}),
    productionOwnerCurrent:()=>ownerCurrent,
    business:{async manualShareDebt(...args){textCalls++;events.push({name:'text',args});return textResponse;}},
    auth:{async getClient(){events.push({name:'auth.getClient'});return client;}},
    console:{warn:(...a)=>events.push({name:'warn',args:a})},
  };
  vm.runInNewContext(implementation+'\nglobalThis.__share=manualShareDebt;',ctx,{timeout:1000});
  return {
    send:(captureImage=async()=>{captureCalls++;events.push({name:'capture'});return captureResult;})=>ctx.__share(customer,request,captureImage),
    disableOwner:()=>{ownerCurrent=false;},events,textCalls:()=>textCalls,captureCalls:()=>captureCalls
  };
}

test('single text creates exactly one PNG attached to same Chat message and requested customer',async()=>{
  const f=fixture();
  const x=await f.send();
  assert.equal(x.ok,true);
  assert.equal(x.image_attached,true);
  assert.equal(x.image_asset_id,asset);
  assert.equal(f.textCalls(),1);
  assert.equal(f.captureCalls(),1);
  assert.deepEqual(f.events.filter(x=>x.name==='taphoa_manual_debt_image_ticket').map(x=>JSON.parse(JSON.stringify(x.args))),
    [{p_customer_id:customer,p_request_id:request}]);
  assert.deepEqual(f.events.filter(x=>x.name==='taphoa_manual_debt_image_attach').map(x=>JSON.parse(JSON.stringify(x.args))),
    [{p_request_id:request,p_asset_id:asset,p_size_bytes:321,p_width_px:700,p_height_px:1250}]);
  assert.equal(f.events.filter(x=>x.name==='storage.upload').length,1);
  const upload=f.events.find(x=>x.name==='storage.upload');
  assert.equal(upload.key,storageKey);
  assert.equal(upload.opts.upsert,false);
  assert.deepEqual(f.events.filter(x=>['text','taphoa_manual_debt_image_ticket','capture','storage.upload','taphoa_manual_debt_image_attach'].includes(x.name)).map(x=>x.name),
    ['text','taphoa_manual_debt_image_ticket','capture','storage.upload','taphoa_manual_debt_image_attach']);
});

test('missing/unapplied DB ticket keeps already sent Chat text, never captures/uploads PNG',async()=>{
  const f=fixture({ticketError:{code:'PGRST202',message:'function missing'}});
  const x=await f.send();
  assert.equal(x.ok,true);
  assert.equal(x.image_attached,false);
  assert.equal(f.textCalls(),1);
  assert.equal(f.captureCalls(),0);
  assert.equal(f.events.filter(x=>x.name==='storage.upload').length,0);
  assert.equal(f.events.filter(x=>x.name==='taphoa_manual_debt_image_attach').length,0);
});

test('denied/expired ticket never renders or uploads any image',async()=>{
  const f=fixture({ticketResponse:{ok:false,reason:'manual_notice_not_found_or_expired'}});
  const x=await f.send();
  assert.equal(x.ok,true);
  assert.equal(x.image_attached,false);
  assert.equal(x.image_reason,'manual_notice_not_found_or_expired');
  assert.equal(f.captureCalls(),0);
});

test('wrong customer or wrong message ID from server cannot receive an image',async()=>{
  for(const response of [
    {ok:true,message_id:message,customer_id:otherCustomer},
    {ok:true,message_id:'not-a-uuid',customer_id:customer},
  ]){
    const f=fixture({textResponse:response});
    const x=await f.send();
    assert.equal(x.image_attached,false);
    assert.equal(x.image_reason,'message_identity_unverified');
    assert.equal(f.captureCalls(),0);
    assert.equal(f.events.filter(x=>x.name==='taphoa_manual_debt_image_ticket').length,0);
  }
  const f=fixture({ticketResponse:{ok:true,message_id:'00000000-0000-4000-8000-000000000003',asset_id:asset,storage_key:storageKey}});
  const x=await f.send();
  assert.equal(x.image_attached,false);
  assert.equal(f.captureCalls(),0);
  assert.equal(f.events.filter(x=>x.name==='storage.upload').length,0);
});

test('failed upload never attaches assets or resends the text',async()=>{
  const f=fixture({uploadError:{message:'local-only upload denied'}});
  const x=await f.send();
  assert.equal(x.ok,true);
  assert.equal(x.image_attached,false);
  assert.equal(f.textCalls(),1);
  assert.equal(f.captureCalls(),1);
  assert.equal(f.events.filter(x=>x.name==='taphoa_manual_debt_image_attach').length,0);
});

test('invalid image payload is rejected before any storage write',async()=>{
  const f=fixture({captureResult:{blob:{size:0,type:'image/png'},width:700,height:1250}});
  const x=await f.send();
  assert.equal(x.image_attached,false);
  assert.equal(f.events.filter(x=>x.name==='storage.upload').length,0);
});

test('login rotation after text acknowledgement prevents image RPC/capture/upload',async()=>{
  const f=fixture();
  const result=await f.send; // intentionally no side effects; ensure owner is explicitly invalidated before invocation
  assert.equal(typeof result,'function');
  f.disableOwner();
  const x=await f.send();
  assert.equal(x.image_attached,false);
  assert.equal(x.image_reason,'session_changed');
  assert.equal(f.captureCalls(),0);
  assert.equal(f.events.filter(x=>x.name==='taphoa_manual_debt_image_ticket').length,0);
});

test('already-attached server ticket is idempotent without duplicate PNG bytes',async()=>{
  const f=fixture({ticketResponse:{ok:true,already_attached:true,message_id:message,asset_id:asset}});
  const x=await f.send();
  assert.equal(x.image_attached,true);
  assert.equal(f.captureCalls(),0);
  assert.equal(f.events.filter(x=>x.name==='storage.upload').length,0);
});

test('manual image SQL isolates permissions, owner, storage, and outbound from finance',()=>{
  assert.match(migration,/CREATE TABLE IF NOT EXISTS v21_private\.taphoa_manual_debt_image_uploads/);
  assert.match(migration,/ALTER TABLE v21_private\.taphoa_manual_debt_image_uploads ENABLE ROW LEVEL SECURITY/);
  assert.match(migration,/m\.client_id='manual:debt:'\|\|p_request_id::text/);
  assert.match(migration,/m\.client_id='manual:debt:'\|\|t\.request_id::text/);
  assert.match(migration,/a\.auth_user_id=auth\.uid\(\)/);
  assert.match(migration,/recipient\.role='user'/);
  assert.match(migration,/m\.sender_account_id=a\.id/);
  assert.match(migration,/ON storage\.objects FOR INSERT TO authenticated/);
  assert.match(migration,/o\.owner_id=auth\.uid\(\)::text/);
  assert.match(migration,/v_message\.client_id IS DISTINCT FROM 'manual:debt:'\|\|p_request_id::text/);
  assert.match(migration,/v_mime IS DISTINCT FROM 'image\/png'/);
  assert.match(migration,/v_size IS DISTINCT FROM p_size_bytes/);
  assert.match(migration,/insert into public\.v21_media_assets/i);
  assert.doesNotMatch(migration,/update\s+public\.taphoa_debt_ledger/i);
  assert.doesNotMatch(migration,/insert\s+into\s+public\.v21_messages/i);
  assert.match(ui,/createCustomerDebtPngBlob\(\{withDimensions:true\}\)/);
  assert.match(ui,/response\.image_attached===true/);
  assert.match(ui,/ảnh chưa đính kèm/);
  assert.match(ui,/Chưa xác nhận gửi qua Zalo/);
});
