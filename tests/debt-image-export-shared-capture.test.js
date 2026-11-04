import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const code=fs.readFileSync('src/fixed-ui-runtime-12.js','utf8');
function sourceOf(name,next){
  const begin=code.indexOf('async function '+name+'(');
  const end=code.indexOf('async function '+next+'(',begin);
  assert.ok(begin>=0&&end>begin,'Unable to find '+name);
  return code.slice(begin,end).trim();
}
const generator=sourceOf('createCustomerDebtPngBlob','shareCustomerDebtImage');
const saveShare=code.slice(code.indexOf('async function shareCustomerDebtImage('),
  code.indexOf('function requestClearSheet(sheetName)')).trim();

test('debt image lazy-loads through the same helper as order images',async()=>{
  assert.match(generator,/window\.TAPHOA_SHARE_CAPTURE/);
  assert.match(generator,/capture\.captureElement\(clone/);
  assert.match(generator,/capture\.canvasToPngBlob\(canvas/);
  assert.doesNotMatch(generator,/(?:^|[^.\w])html2canvas\s*\(/);
  const actions=[];
  const canvas={width:672,height:896};
  const png={size:4803,type:'image/png'};
  const clone={style:{},scrollHeight:640,classList:{add(){}},prepend(){},removeAttribute(){},
    querySelector(){return null;}};
  const host={style:{},setAttribute(){},appendChild(){},remove(){actions.push('remove');}};
  const capture={
    captureElement:async(target,opts)=>{
      assert.equal(target,clone);
      assert.equal(opts.width,460);
      assert.equal(opts.height,644);
      assert.ok(opts.libraryTimeout>0&&opts.renderTimeout>0);
      actions.push('capture');
      return canvas;
    },
    canvasToPngBlob:async(value)=>{
      assert.equal(value,canvas);
      actions.push('png');
      return png;
    }
  };
  const context={
    window:{TAPHOA_SHARE_CAPTURE:capture},
    document:{
      getElementById:id=>id==='customerDebtContentToShare'
        ?{getBoundingClientRect:()=>({width:460}),cloneNode:()=>clone}
        :{innerText:''},
      createElement:()=>host,
      body:{appendChild:()=>actions.push('host')}
    },
    requestAnimationFrame:cb=>cb(),
    showLoading:()=>actions.push('loading'),
    hideLoading:()=>actions.push('hide')
  };
  const create=vm.runInNewContext('('+generator+')',context);
  assert.equal(await create(),png);
  assert.deepEqual(actions,['loading','host','capture','png','remove','hide']);
});

test('debt Save calls one direct PNG download even in installed iOS PWA',async()=>{
  const actions=[];
  const png={size:42,type:'image/png'};
  const context={
    createCustomerDebtPngBlob:async()=>png,
    window:{
      TAPHOA_IMAGE_SAVE:{savePng:(data,name)=>{
        assert.equal(data,png);assert.equal(name,'congno.png');actions.push('save');
      }},
      TAPHOA_IOS_SHARE_FALLBACK:{
        shouldUse:()=>true,
        open:()=>{throw Error('iOS preview must not appear on save');}
      }
    },
    navigator:{share:()=>{throw Error('native share must not open on save');}},
    File:class{constructor(){throw Error('Save must not instantiate a share File');}},
    showToast:()=>actions.push('toast'),
    showAlertPopup:(...args)=>{throw Error('unexpected alert '+args)},
  };
  const save=vm.runInNewContext('('+saveShare+')',context);
  await save('save');
  assert.deepEqual(actions,['save','toast']);
});


const manualDebtSql=fs.readFileSync('supabase/migrations/20261101013000_taphoa_manual_customer_debt_chat_zalo.sql','utf8');
const businessCode=fs.readFileSync('src/core/business.js','utf8');
const bridgeCode=fs.readFileSync('src/fixed-production-bridge.js','utf8');
const indexHtml=fs.readFileSync('index.html','utf8');
const aliceId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const requestId='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function debtSendFixture({role='admin',mode='account',response={ok:true},throwError=null,connected=true}={}){
  const calls=[],blobs=[],toasts=[],alerts=[],shares=[];
  const blob={size:2018,type:'image/png'};
  const window={
    TAPHOA_PRODUCTION:{
      getIdentity:()=>({role}),getAccessMode:()=>mode,
      manualShareDebt:async(...args)=>{
        calls.push(args);
        if(throwError)throw throwError;
        return response;
      }
    },
    TAPHOA_IOS_SHARE_FALLBACK:{shouldUse:()=>false}
  };
  if(!connected)delete window.TAPHOA_PRODUCTION.manualShareDebt;
  const context={
    window,
    activeDebtCustomerId:aliceId,
    crypto:{randomUUID:()=>requestId},
    createCustomerDebtPngBlob:async()=>{blobs.push(blob);return blob},
    navigator:{canShare:()=>true,share:async options=>{shares.push(options)}},
    File:class{constructor(parts,name,options){this.parts=parts;this.name=name;this.type=options.type}},
    showToast:(...args)=>toasts.push(args),
    showAlertPopup:(...args)=>alerts.push(args)
  };
  const fn=vm.runInNewContext('('+saveShare+')',context);
  return {fn,calls,blobs,toasts,alerts,shares,context,blob};
}

test('linked customer sends verified manual debt directly into their conversation, not to OS contact chooser',async()=>{
 const f=debtSendFixture({response:{ok:true,message_id:'confirmed'}});
 await f.fn('send');
 assert.deepEqual(f.calls.map(([id,nonce,capture])=>[id,nonce,typeof capture]),[[aliceId,requestId,'function']]);
 assert.equal(f.blobs.length,0,'no capture or native share for a known linked recipient');
 assert.equal(f.shares.length,0);
 assert.equal(f.alerts.length,0);
 assert.equal(f.toasts.length,1);
 assert.match(f.toasts[0][0],/Chat.*Zalo/);
});

test('failed Chat delivery reports error rather than opening PNG share',async()=>{
 const f=debtSendFixture({response:{ok:false,reason:'customer_not_found'}});
 await f.fn('send');
 assert.equal(f.calls.length,1);
 assert.equal(f.blobs.length,0);
 assert.equal(f.shares.length,0);
 assert.match(f.alerts[0][0],/Chưa gửi công nợ trực tiếp/);
});

test('non-admin or missing bridge cannot silently send a PNG instead of Chat',async()=>{
 for(const options of [{role:'user'},{mode:'public-link'},{connected:false}]){
  const f=debtSendFixture(options);
  await f.fn('send');
  assert.equal(f.calls.length,0);
  assert.equal(f.shares.length,0);
  assert.equal(f.blobs.length,0);
  assert.match(f.alerts[0][0],/Chưa thể gửi vào Chat/);
 }
});

test('recent duplicate manual debt send does not create a second OS share or another RPC',async()=>{
 const f=debtSendFixture({response:{ok:false,reason:'recently_sent'}});
 await f.fn('send');
 assert.equal(f.calls.length,1);
 assert.equal(f.blobs.length,0);
 assert.equal(f.shares.length,0);
 assert.match(f.toasts[0][0],/Không gửi lại/);
});

test('manual debt RPC failure never claims a successful Chat/Zalo message or shares elsewhere',async()=>{
 const f=debtSendFixture({throwError:Error('backend unavailable')});
 await f.fn('send');
 assert.equal(f.calls.length,1);
 assert.equal(f.blobs.length,0);
 assert.equal(f.shares.length,0);
 assert.equal(f.toasts.length,0);
 assert.match(f.alerts[0][0],/Chưa gửi công nợ trực tiếp/);
});

test('manual debt send is admin-only, bound to customer ID, and never mutates finance rows',()=>{
 assert.match(manualDebtSql,/create or replace function public\.taphoa_manual_send_customer_debt\(\s*p_customer_id uuid,p_request_id uuid/);
 assert.match(manualDebtSql,/taphoa_access_context\(\)/);
 assert.match(manualDebtSql,/v_ctx->>'taphoa_role'<>'admin'/);
 assert.match(manualDebtSql,/auth\.uid\(\) is null/);
 assert.match(manualDebtSql,/from public\.zalo_user_links z[\s\S]*?z\.chat_account_id=v_customer\.id/);
 assert.match(manualDebtSql,/reason','zalo_not_linked'/);
 assert.match(manualDebtSql,/pg_advisory_xact_lock/);
 assert.match(manualDebtSql,/manual:debt:/);
 assert.match(manualDebtSql,/m\.created_at>now\(\)-interval '20 seconds'/);
 assert.match(manualDebtSql,/taphoa_chat_customer_balance_value\(p_customer_id\)/);
 assert.match(manualDebtSql,/taphoa_customer_mini_link\(p_customer_id,'no'/);
 assert.match(manualDebtSql,/taphoa_chat_notify_customer\(\s*p_customer_id,v_sender,v_client_id,v_notice/);
 assert.match(manualDebtSql,/revoke all on function public\.taphoa_manual_send_customer_debt\(uuid,uuid\)/);
 assert.match(manualDebtSql,/grant execute on function public\.taphoa_manual_send_customer_debt\(uuid,uuid\)\s+to authenticated/);
 assert.doesNotMatch(manualDebtSql,/\b(?:insert|update|delete)\s+(?:into\s+|from\s+)?(?:public\.)?taphoa_debt_ledger\b/i);
 assert.doesNotMatch(manualDebtSql,/create table|alter table/i);
 assert.match(businessCode,/manualShareDebt:\(id,requestId\)=>gateway\.rpc\('taphoa_manual_send_customer_debt'/);
 assert.match(bridgeCode,/async function manualShareDebt\(customerId,requestId,captureImage\)/);
 assert.match(bridgeCode,/taphoa_manual_debt_image_ticket/);
 assert.match(bridgeCode,/taphoa_manual_debt_image_attach/);
 assert.match(bridgeCode,/manualShareOrder,manualShareDebt,reverseOrder/);
 assert.match(indexHtml,/fixed-production-bridge\.js\?v=[^"]*manual-debt=20261101/);
 assert.match(indexHtml,/fixed-ui-runtime-12\.js\?v=[^"]*linked-contact=20261101/);
});


test('unmigrated backend reports unavailable Chat instead of claiming PNG delivery',async()=>{
 const error=Object.assign(Error('Could not find the function'),{code:'PGRST202'});
 const f=debtSendFixture({throwError:error});
 await f.fn('send');
 assert.equal(f.calls.length,1);
 assert.equal(f.blobs.length,0);
 assert.equal(f.shares.length,0);
 assert.match(f.alerts[0][0],/Chưa thể gửi vào Chat/);
});

test('unknown network failure does not retry or fall back because message delivery may have occurred',async()=>{
 const error=Object.assign(Error('network timeout'),{code:'TIMEOUT'});
 const f=debtSendFixture({throwError:error});
 await f.fn('send');
 assert.equal(f.calls.length,1);
 assert.equal(f.blobs.length,0);
 assert.equal(f.shares.length,0);
 assert.equal(f.toasts.length,0);
 assert.equal(f.alerts.length,1);
});

test('debt PNG clone retains scoped IDs required for cycle and history layout',()=>{
  assert.doesNotMatch(generator,/clone\.removeAttribute\(['"]id['"]\)/);
  assert.doesNotMatch(generator,/cloneHistory\.removeAttribute\(['"]id['"]\)/);
  const css=fs.readFileSync('src/fixed-ui-debt-cycles.css','utf8');
  assert.match(css,/#customerDebtContentToShare \.debt-cycle-detail/);
  assert.match(css,/#customerDebtContentToShare \.debt-cycle-history ol/);
});

test('new manual debt migration sends to Chat without requiring a Zalo link',()=>{
 const sql=fs.readFileSync('supabase/migrations/20261104040000_taphoa_manual_debt_chat_without_zalo_requirement.sql','utf8');
 assert.match(sql,/create or replace function public\.taphoa_manual_send_customer_debt/);
 assert.match(sql,/taphoa_chat_notify_customer/);
 assert.doesNotMatch(sql,/from public\.zalo_user_links/);
 assert.match(sql,/taphoa_role'<>'admin'/);
 assert.match(sql,/pg_advisory_xact_lock/);
});
