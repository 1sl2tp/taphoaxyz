import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const ui=read('src/fixed-ui-runtime-9.js');
const share=read('src/fixed-ui-runtime-10.js');
const page=read('ncc/index.html');
const index=read('index.html');
const extract=(s,start,end)=>{
 const a=s.indexOf(start),b=s.indexOf(end,a);
 assert(a>=0&&b>a,'source boundary: '+start);
 return s.slice(a,b);
};
const vanilla=[{productName:'Sua bo lit co x',qty:2,noteEntries:[]},
 {productName:'Sua chua khong x',qty:4,noteEntries:[]},
 {productName:'Sua bo lit co',qty:3,noteEntries:[]}];
function adminFixture(source='Sữa'){
 const state={source,groupSort:'product',hideMilkX:true,groupedRows:vanilla,
   customerRows:vanilla,totalQty:9};
 const nodes={sourceDetailCaptureGrouped:{innerHTML:''},
   sourceDetailGroupSortSelect:{value:'product'},
   sourceDetailMilkXCount:{textContent:''}};
 const context=vm.createContext({state,
   normalizeSourceGroupName:s=>String(s||'').trim().toLocaleLowerCase('vi-VN'),
   escapeProductEditorValue:s=>String(s||''),
   document:{getElementById:id=>nodes[id]||null}});
 const block=extract(ui,'        function milkSourceHasXVariants(source) {',
   '        function renderSourceDetailModal() {');
 vm.runInContext('let activeSourceDetailState=state;\n'+block+
   '\nglobalThis.renderGroup=renderSourceDetailCaptureGrouped;\n'+
   'globalThis.filterName=sourceMilkXProduct;\n',context);
 return {state,nodes,context};
}
test('suffix X: only independent final x of a Milk name is filtered',()=>{
 const x=adminFixture();
 assert.equal(x.context.filterName('Sua chua khong x'),true);
 assert.equal(x.context.filterName('Sua bo lit co X  '),true);
 assert.equal(x.context.filterName('Sua chua xu'),false);
 assert.equal(x.context.filterName('Sua probi x 200ml'),false);
 assert.equal(x.context.filterName('Xa xit'),false);
});
test('Gộp Milk shows filtered quantity and sharing capture excludes only x names',()=>{
 const x=adminFixture();
 x.context.renderGroup();
 const html=x.nodes.sourceDetailCaptureGrouped.innerHTML;
 assert.doesNotMatch(html,/Sua bo lit co x|Sua chua khong x/);
 assert.match(html,/Sua bo lit co/);
 assert.match(html,/TỔNG · 1 mã/);
 assert.match(html,/source-detail-total-qty">3/);
 assert.equal(x.nodes.sourceDetailMilkXCount.textContent,'Đã ẩn 2 dòng');
 assert.equal(x.state.totalQty,9,'saved order total remains unchanged');
 x.state.hideMilkX=false;x.context.renderGroup();
 assert.match(x.nodes.sourceDetailCaptureGrouped.innerHTML,/TỔNG · 3 mã/);
 assert.match(x.nodes.sourceDetailCaptureGrouped.innerHTML,/source-detail-total-qty">9/);
});
test('other sources and existing sorted groups remain unchanged',()=>{
 const x=adminFixture('Thuốc lá');
 x.context.renderGroup();
 assert.match(x.nodes.sourceDetailCaptureGrouped.innerHTML,/TỔNG · 3 mã/);
 assert.match(x.nodes.sourceDetailCaptureGrouped.innerHTML,/source-detail-total-qty">9/);
 assert.match(share,/milkXFiltered.*grouped/s);
 assert.match(index,/milk-x-filter=20261116/);
});
test('NCC Sữa source list, detail/Gộp and print only hide X in view, keep edit drafts',()=>{
 assert.match(page,/id="milkXCostFilter" type="checkbox" checked/);
 assert.match(page,/id="milkXOrdersFilter" type="checkbox" checked/);
 assert.match(page,/function visibleSupplierOrders\(\)/);
 assert.match(page,/const shownRows=visibleSupplierOrders\(\)/);
 assert.match(page,/const grouped=groupedOrders\(shownRows\)/);
 assert.match(page,/sourceItems\s*\.filter\(p=>!shouldHideMilkX\(p.name,source\)\)/);
 assert.match(page,/function applyMilkXFilter\(checked\)\{[^}]*render\(\)/s);
 assert.match(page,/function render\(resetDraft=false\)\{\s*if\(!resetDraft\)captureDraftInputs\(\);/);
 const f=extract(page,'function isMilkXName(name){','async function rpc(name,args){');
 const rows=[{product_code:'S1',product_name:'Sua bo lit co x',qty:3,order_id:'a'},
             {product_code:'S2',product_name:'Sua bo lit co',qty:6,order_id:'b'}];
 const ctx=vm.createContext({state:{},rows,Map,Number,String,Array});
 vm.runInContext("let session={source_key:'sua'},hideMilkX=true,orderRows=rows; "+
   "const $=id=>({hidden:false,checked:true});\n"+f+
   "\nglobalThis.visible=visibleSupplierOrders;\n"+
   "globalThis.setHide=v=>{hideMilkX=v};\n"+
   "globalThis.setSource=v=>{session.source_key=v};",ctx);
 assert.deepEqual(Array.from(ctx.visible(),r=>r.product_code),['S2']);
 ctx.setHide(false);assert.equal(ctx.visible().length,2);
 ctx.setHide(true);ctx.setSource('hang-thuong');assert.equal(ctx.visible().length,2);
 assert.equal(rows[0].qty,3,'backing order not edited');
});
