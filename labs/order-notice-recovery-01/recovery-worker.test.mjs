import test from 'node:test';
import assert from 'node:assert/strict';
import {createRecoveryWorker} from '../../src/core/delivery-recovery.mjs';
function harness(){
 const bytes=new Uint8Array(24);bytes.set([137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82]);const v=new DataView(bytes.buffer);v.setUint32(16,528);v.setUint32(20,450);
 const blob=new Blob([bytes],{type:'image/png'});
 let live=true,uploaded=false,attached=false,cut=true,uploads=0,attaches=0,renders=0;
 const client={async rpc(n,a){
 if(n.endsWith('_list'))return {data:attached?[]:[{message_id:'m'}]};
 if(n.endsWith('_prepare'))return {data:{ok:true,message_id:'m',asset_id:'a',storage_key:'s/a',mode:uploaded?'reuse_upload':'render_original',size_bytes:24,order:{id:'o'}}};
 if(n.endsWith('_attach')){attaches++;assert.equal(a.p_message_id,'m');assert.equal(a.p_asset_id,'a');attached=true;return {data:{ok:true,message_id:'m',asset_id:'a'}}}
 throw Error('business replay');
 },storage:{from(){return {async upload(){uploads++;uploaded=true;if(cut)live=false;return {}},async download(){return {data:blob}}}}}};
 const make=()=>createRecoveryWorker({client,ownerCurrent:()=>live,renderOriginal:async()=>{renders++;return blob}});
 return {make,resume(){cut=false;live=true},counts:()=>({uploads,attaches,renders}),get attached(){return attached}};
}
test('after upload interruption, reload uses existing bytes without replay',async()=>{
 const h=harness(),w=h.make();assert.equal((await w.wake(0))[0].state,'interrupted_or_review');assert.deepEqual(h.counts(),{uploads:1,attaches:0,renders:1});
 h.resume();assert.equal((await h.make().wake(0))[0].state,'attached');assert.deepEqual(h.counts(),{uploads:1,attaches:1,renders:1});
 assert.deepEqual(await h.make().wake(0),[]);assert.equal(h.attached,true);
});
test('same worker shares flight and bounds wake frequency',async()=>{const h=harness();h.resume();const w=h.make();const a=w.wake(0),b=w.wake(0);assert.equal(a,b);await a;assert.deepEqual(await w.wake(1),[]);assert.deepEqual(h.counts(),{uploads:1,attaches:1,renders:1})});

test('manual recovery is restricted to one selected order and returns independent outcomes',async()=>{
 const id='00000000-0000-4000-8000-000000000001';let args;
 const client={async rpc(n,a){assert.equal(n,'taphoa_order_notice_recover_list');args=a;return {data:[]}}};
 const w=createRecoveryWorker({client,ownerCurrent:()=>true,renderOriginal:async()=>{throw Error('unexpected render')}});
 await assert.rejects(w.recoverOrder('DG466'),/invalid_order/);
 assert.deepEqual(await w.recoverOrder(id),[]);
 assert.deepEqual(args,{p_limit:10,p_include_historical:true,p_order_id:id});
});
