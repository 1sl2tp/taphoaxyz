import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../ncc/index.html',import.meta.url),'utf8');
const from=html.indexOf('// SPEC-NCC-ORDERS-PRINT-READY-20261101:');
const end=html.indexOf('\n\nfunction render(',from);
assert.ok(from>=0&&end>from);
test('print cannot start while pending orders failed to load',async()=>{
 const state={prints:0,classes:new Set(),node:{textContent:''}};
 const ctx=vm.createContext({state,Promise});
 vm.runInContext(`
   let activeView='cost',session={token:'T1',source_key:'sua'},ordersLoaded=false,ordersSource='';
   const switchView=async view=>{activeView=view;ordersLoaded=false;return;};
   const loadOrders=async()=>{};
   const $=id=>state.node;
   const document={body:{classList:{add:x=>state.classes.add(x),remove:x=>state.classes.delete(x)}}};
   const window={addEventListener(){},print(){state.prints++}};
   const setTimeout=()=>{};
   ${html.slice(from,end)}
   globalThis.printOrders=printOrders;
 `,ctx);
 await ctx.printOrders();
 assert.equal(state.prints,0);
 assert.equal(state.classes.has('print-orders'),false);
 assert.match(state.node.textContent,/không thể in/);
});
test('print starts only with a fully loaded matching-source order list',async()=>{
 const state={prints:0,classes:new Set()};
 const ctx=vm.createContext({state,Promise});
 vm.runInContext(`
   let activeView='orders',session={token:'T1',source_key:'sua'},ordersLoaded=true,ordersSource='sua';
   const switchView=async()=>{};
   const loadOrders=async()=>{};
   const $=()=>({textContent:''});
   const document={body:{classList:{add:x=>state.classes.add(x),remove:x=>state.classes.delete(x)}}};
   const window={addEventListener(){},print(){state.prints++}};
   const setTimeout=(fn)=>{fn();};
   ${html.slice(from,end)}
   globalThis.printOrders=printOrders;
 `,ctx);
 await ctx.printOrders();
 assert.equal(state.prints,1);
});
test('fetch errors clear previously loaded order rows rather than showing stale details',()=>{
 assert.match(html,/orderRows=\[\];ordersLoaded=false;ordersSource='';\s*renderOrders\(\);\s*\$\('ordersSummary'\)\.textContent='Không tải được đơn tạm/);
 assert.match(html,/if\(view==='orders'&&\(!ordersLoaded\|\|ordersSource!==session\?\.source_key\)\)return loadOrders\(\)/);
});
