import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../admin-gia.html',import.meta.url),'utf8');
const care=readFileSync(new URL('../src/admin-customer-care-report.js',import.meta.url),'utf8');
const start=care.indexOf('  function render(){');
const end=care.indexOf('\n  async function load(force=false){',start);
assert.ok(start>=0&&end>start);
function testFilter(value){
 const nodes={
 careSearch:{value:''},careFilter:{value},careCount:{textContent:''},
 careBody:{rows:[],replaceChildren(){this.rows=[]},insertRow(){
   const row={className:'',cells:[],insertCell(){
     const cell={textContent:'',append(){}};row.cells.push(cell);return cell;
   }};this.rows.push(row);return row;
 }}
 };
 const state={nodes};
 const ctx=vm.createContext({state});
 vm.runInContext(`
 let selected='';
 const rows=[
  {id:1,name:'A',period_delivered_count:3,total_revenue:90},
  {id:2,name:'B',period_delivered_count:1,total_revenue:30},
  {id:3,name:'C',period_delivered_count:0,total_revenue:0}
 ];
 const $=id=>state.nodes[id];
 const number=x=>String(x??0),amount=number,percent=number;
 const group=()=>'',address=r=>({name:r.name});
 const document={createElement:()=>({type:'',dataset:{},textContent:''})};
 const detail=()=>{};
 ${care.slice(start,end)}
 render();
 `,ctx);
 return nodes.careCount.textContent;
}
test('no-buyer filter cannot claim the orders of other customers',()=>{
 assert.equal(testFilter('no_period'),'1/3 khách · 0 đơn của nhóm · 4 đơn cả kỳ');
});
test('buyer filter reports only its own delivered orders',()=>{
 assert.equal(testFilter('period'),'2/3 khách · 4 đơn của nhóm');
});
test('filtered customer search/order count stays distinct from period-wide total',()=>{
 assert.match(care,/SPEC-CARE-FILTER-COUNTS-20261101/);
 assert.match(care,/const listOrders=list\.reduce\(/);
 assert.match(care,/listOrders!==periodOrders/);
});
test('failed goods catalog request rolls back search, source and page labels',()=>{
 assert.match(html,/SPEC-ADMIN-FAILED-CATALOG-ROLLBACK-20261101/);
 assert.match(html,/if\(!pageRefreshQueued\)\{\s*restoreBlockedCatalogNavigation\(\);\s*renderComparison\(\)/);
 assert.match(html,/Không tải được danh sách mới · thử lại/);
});
