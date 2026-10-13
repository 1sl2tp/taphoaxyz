import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';

const code=readFileSync('src/fixed-ui-cart-share-v3.js','utf8');

test('first press opens a bound KH Chat before awaiting image capture, never auto sends',()=>{
  const cart=code.slice(code.indexOf('async function shareCartOrderImageV3(){'),code.indexOf('  // UI-113:'));
  const detail=code.slice(code.indexOf('async function shareDetailOrderImageV3(){'),code.indexOf('async function shareCartOrderImageV3(){'));
  assert.match(cart,/const directChat=beginChatOrderShare\(cartChatCustomerId\(\)\)/);
  assert.ok(cart.indexOf('beginChatOrderShare(')<cart.indexOf('await prepareCartShareCache()'));
  assert.match(detail,/beginChatOrderShare\(detailChatCustomerId\(\)\)/);
  assert.ok(detail.indexOf('beginChatOrderShare(')<detail.indexOf('await prepareDetailShareCache()'));
  assert.doesNotMatch(cart,/v21_media_assets_send|sendMedia\(|navigator\.share\(/);
  assert.match(code,/function detailChatCustomerId\(/);
  assert.match(code,/return ids\.size===1\?\[\.\.\.ids\]\[0\]:'';/);
});

test('one-click share uses opener+nonce+exact recipient and sends the captured File only once',()=>{
  const start=code.indexOf('  const CHAT_URL=');
  const end=code.indexOf('  function getOrderMeta(){',start);
  assert.ok(start>0&&end>start);
  const customer='11111111-2222-4333-8444-555555555555';
  const another='aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
  const handlers=new Map();
  const events={open:[],posts:[],focus:0};
  const target={
    postMessage(...args){events.posts.push(args);},
    focus(){events.focus++;}
  };
  const context={
    crypto:webcrypto,Blob,Uint8Array,File:class File extends Blob{
      constructor(parts,name,options){super(parts,options);this.name=name;}
    },
    selectedCustomer:{id:customer,name:'A'},
    appData:{dongiao:[['order_id','maKh'],['DG19',another]]},
    document:{getElementById:()=>({textContent:'Mã đơn: DG19'})},
    window:{
      activeViewingSheet:'dongiao',
      open(url,name){events.open.push({url,name});return target;},
      addEventListener(type,fn){handlers.set(type,fn);},
      removeEventListener(type,fn){if(handlers.get(type)===fn)handlers.delete(type);}
    },
    showToast(){throw Error('no toast on direct share');}
  };
  const api=vm.runInNewContext('(()=>{'+code.slice(start,end)+
    ';return {cartChatCustomerId,detailChatCustomerId,beginChatOrderShare};})()',context);
  assert.equal(api.cartChatCustomerId(),customer);
  assert.equal(api.detailChatCustomerId(),another,'detail must NOT follow selected cart customer');
  const session=api.beginChatOrderShare(customer);
  assert.ok(session);assert.equal(events.open.length,1);
  assert.ok(events.open[0].url.startsWith('https://chat.taphoa.xyz/?taphoa_share='));
  assert.match(events.open[0].url,new RegExp(customer));
  assert.equal(events.posts.length,0,'no automatic send');
  assert.equal(session.setArtifact({blob:new Blob(['receipt'],{type:'image/png'}),fileName:'DG19.png'}),true);
  assert.equal(events.posts.length,0,'wait for Chat to verify recipient');
  const notify=(origin,contactId,type='TAPHOA_ORDER_IMAGE_READY')=>handlers.get('message')?.({
    origin,source:target,data:{type,token:session.token,contactId}
  });
  notify('https://evil.example',customer);assert.equal(events.posts.length,0);
  notify('https://chat.taphoa.xyz',another);assert.equal(events.posts.length,0);
  notify('https://chat.taphoa.xyz',customer);assert.equal(events.posts.length,1);
  assert.equal(events.posts[0][0].contactId,customer);
  assert.equal(events.posts[0][0].type,'TAPHOA_ORDER_IMAGE_FILE');
  assert.equal(events.posts[0][0].file.name,'DG19.png');
  notify('https://chat.taphoa.xyz',customer);assert.equal(events.posts.length,1);
  notify('https://chat.taphoa.xyz',customer,'TAPHOA_ORDER_IMAGE_ATTACHED');
  assert.equal(handlers.has('message'),false,'handler removed on ACK');
});

test('ambiguous or unbound customer can never be routed to a guessed KH',()=>{
  assert.match(code,/if\(!UUID_PATTERN\.test\(contactId\)/);
  assert.match(code,/new Set\(sheets\)/);
  assert.match(code,/return ids\.size===1/);
});
