import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../ncc/index.html',import.meta.url),'utf8');
const start=html.indexOf('async function loadCatalog(){');
const end=html.indexOf("\n\n// SPEC-NCC-SUPPLIER-LOGIN-ATOMIC-20261101:",start);
assert.ok(start>=0&&end>start);
test('expired catalog response cannot repaint NCC UI after logout',async()=>{
 let release;const pending=new Promise(resolve=>release=resolve);
 const state={renders:0,nodes:{title:{textContent:''}}};
 const ctx=vm.createContext({state,pending,Promise,Map,Array,console});
 vm.runInContext(`
  let session={token:'T1',source_key:'sua'},supplierSessionGeneration=1,catalogRequestGeneration=0,
    ordersRequestGeneration=0,items=[],originals=new Map(),pendingCostEdits=new Map(),
    pendingNewRows=[],orderRows=[],ordersLoaded=false,ordersSource='',activeView='cost',orderMode='detail';
  const $=id=>state.nodes[id]||{replaceChildren(){},set textContent(value){}};
  const rpc=async()=>pending;
  const saveSession=next=>{session=next;supplierSessionGeneration++};
  const clearPin=()=>{};
  const showApp=()=>{state.renders++};
  const render=()=>{state.renders++};
  const SOURCE_LABELS={};
  ${html.slice(start,end)}
  globalThis.api={loadCatalog,clearSupplierSession,items:()=>items};
 `,ctx);
 const job=ctx.api.loadCatalog();ctx.api.clearSupplierSession();
 release({source_key:'sua',source_name:'Sữa',items:[{product_code:'old'}]});
 await job;
 assert.equal(ctx.api.items().length,0);
 assert.equal(state.renders,0);
});
test('supplier logout is immediate, and new login clears all old draft values',()=>{
 assert.match(html,/SPEC-NCC-SUPPLIER-SESSION-20261101/);
 assert.match(html,/clearSupplierSession\(\);\s*setMsg\('loginMsg',''\);showLogin\(\)/);
 assert.match(html,/if\(token\)void rpc\('taphoa_supplier_logout'/);
 assert.match(html,/pendingCostEdits\.clear\(\);pendingNewRows=\[\]/);
 assert.match(html,/requestGeneration!==ordersRequestGeneration\|\|session\?\.token!==token/);
});
