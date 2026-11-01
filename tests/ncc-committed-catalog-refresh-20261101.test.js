import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../ncc/index.html',import.meta.url),'utf8');
const start=html.indexOf("$('saveBtn').addEventListener('click',async()=>{");
const end=html.indexOf("\n\n$('logoutBtn').addEventListener",start);
assert.ok(start>0&&end>start);
function fixture({writeFails=false,refreshFails=false}={}){
 const nodes={saveBtn:{disabled:false,textContent:'',addEventListener(type,handler){this.handler=handler;}},appMsg:{textContent:'',className:''}};
 const events=[],items=[{product_code:'P1',cost:500}];
 const state={nodes,events,items,writeCalls:0,refreshCalls:0};
 const ctx=vm.createContext({state,Map,Array,Number,String,Promise,console});
 vm.runInContext(`
   const $=id=>state.nodes[id]||{};
   const document={querySelectorAll:()=>[]};
   let supplierSessionGeneration=1,session={token:'token'},savingSupplierChanges=false;
   let pendingCostEdits=new Map([['P1','1.000']]);
   let pendingNewRows=[{name:'Hàng mới',cost:'2000'}];
   let originals=new Map([['P1',500]]);
   let items=state.items;
   const parseNum=x=>Number(String(x).replace(/\\./g,'').replace(',','.'));
   const captureDraftInputs=()=>{};
   const updateSaveState=()=>state.events.push('saveState');
   const setMsg=(id,msg,kind)=>{state.nodes[id].textContent=msg;state.nodes[id].kind=kind};
   const render=()=>state.events.push('render');
   const rpc=async()=>{state.writeCalls++;if(${writeFails})throw Error('write rejected');return{changed:1,created:1}};
   const loadCatalog=async()=>{state.refreshCalls++;if(${refreshFails})throw Error('network unavailable')};
   const clearSupplierSession=()=>{state.events.push('logout')};
   const showLogin=()=>{};
   ${html.slice(start,end)}
   globalThis.api={
    save:()=>state.nodes.saveBtn.handler(),
    draft:()=>({cost:pendingCostEdits.size,news:pendingNewRows.length,originals:originals.get('P1')})
   };
 `,ctx);
 return {state,api:ctx.api};
}
test('success even if refresh failed: no retry-able new rows or dirty old price remain',async()=>{
 const f=fixture({refreshFails:true});
 await f.api.save();
 assert.equal(f.state.writeCalls,1);
 assert.equal(f.state.refreshCalls,1);
 assert.equal(f.api.draft().cost,0);
 assert.equal(f.api.draft().news,0);
 assert.equal(f.api.draft().originals,1000);
 assert.equal(f.state.items[0].cost,1000);
 assert.match(f.state.nodes.appMsg.textContent,/Đã lưu 1 giá và thêm 1 sản phẩm mới/);
 assert.match(f.state.nodes.appMsg.textContent,/Chưa tải lại được/);
 assert.equal(f.state.nodes.appMsg.kind,'ok');
});
test('rejected write keeps draft inputs for retry and does not advance baseline',async()=>{
 const f=fixture({writeFails:true});
 await f.api.save();
 assert.equal(f.state.writeCalls,1);
 assert.equal(f.state.refreshCalls,0);
 assert.equal(f.api.draft().cost,1);
 assert.equal(f.api.draft().news,1);
 assert.equal(f.api.draft().originals,500);
 assert.equal(f.state.nodes.appMsg.kind,'error');
});
