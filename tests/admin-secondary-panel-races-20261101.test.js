import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../admin-gia.html',import.meta.url),'utf8');
const start=source.indexOf('    // SPEC-ADMIN-SECONDARY-PANEL-RACES-20261101:');
const end=source.indexOf("\n\n    $('goodsTabBtn').addEventListener",start);
assert.ok(start>=0&&end>start);
const functions=source.slice(start,end);
function fixture(impl){
 const nodes={
  supplierFeedbackBody:{innerHTML:'',replaceChildren(){this.innerHTML='';}},
  supplierFeedbackEmpty:{classList:{add(){},toggle(){}}},
  historyTitle:{textContent:''},
  historyBody:{innerHTML:''},
  historyEmpty:{classList:{add(){},toggle(){}}},
  historyDialog:{open:false,showModal(){this.open=true},close(){this.open=false}}
 };
 const state={nodes,impl};
 const context=vm.createContext({state,console,Promise,Array,Date});
 vm.runInContext(`
   let identity={uid:'admin'},items=[{product_code:'a',product_name:'A'},{product_code:'b',product_name:'B'}];
   let feedbackGeneration=0,historyGeneration=0;
   const $=id=>state.nodes[id];
   const rpc=(name,args)=>state.impl(name,args);
   const esc=s=>String(s??'');
   const pretty=s=>String(s??'');
   ${functions}
   globalThis.api={loadSupplierFeedback,showHistory,logout:()=>{identity=null;feedbackGeneration++;historyGeneration++;}};
 `,context);
 return {state,api:context.api};
}
test('older feedback RPC cannot replace latest NCC list',async()=>{
 let resolveOld;
 const old=new Promise(resolve=>{resolveOld=resolve});
 let calls=0;
 const f=fixture(async name=>{assert.equal(name,'taphoa_admin_supplier_price_feedback');return ++calls===1?old:[{id:2,product_name:'Latest'}]});
 const first=f.api.loadSupplierFeedback();
 await f.api.loadSupplierFeedback();
 resolveOld([{id:1,product_name:'Outdated'}]);
 await first;
 assert.match(f.state.nodes.supplierFeedbackBody.innerHTML,/Latest/);
 assert.doesNotMatch(f.state.nodes.supplierFeedbackBody.innerHTML,/Outdated/);
});
test('closing price history prevents late results from rendering into a closed dialog',async()=>{
 let release;
 const pending=new Promise(resolve=>{release=resolve;});
 const f=fixture(async()=>pending);
 const open=f.api.showHistory({dataset:{code:'a'}});
 f.state.nodes.historyDialog.close();
 release([{old_cost:1,new_cost:2}]);
 await open;
 assert.doesNotMatch(f.state.nodes.historyBody.innerHTML,/>1 → 2</);
});
test('newer history request wins after an older one completes out of order',async()=>{
 let resolveOld;
 const old=new Promise(resolve=>{resolveOld=resolve;});
 const f=fixture(async(_name,args)=>args.p_product_code==='a'?old:[{old_cost:22,new_cost:25}]);
 const first=f.api.showHistory({dataset:{code:'a'}});
 await f.api.showHistory({dataset:{code:'b'}});
 resolveOld([{old_cost:1,new_cost:2}]);
 await first;
 assert.match(f.state.nodes.historyTitle.textContent,/B/);
 assert.match(f.state.nodes.historyBody.innerHTML,/22 → 25/);
 assert.doesNotMatch(f.state.nodes.historyBody.innerHTML,/1 → 2/);
});
