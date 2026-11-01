import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const admin=read('admin-gia.html'),supplier=read('ncc/index.html');
const supplierAdmin=read('ncc/admin/index.html');
const care=read('src/admin-customer-care-report.js');

test('admin report labels and summary panels fit narrow screens',()=>{
 assert.match(admin,/SPEC-ADMIN-SUBPAGES-COMPACT-20261101/);
 assert.match(admin,/class="care-tool-field"[\s\S]*?for="careInactiveDays"/);
 assert.match(admin,/class="care-tool-field"[\s\S]*?for="carePeriod"/);
 assert.match(admin,/#customerCarePane>\.analytics-head\{flex-direction:column/);
 assert.match(admin,/#customerCarePane>\.analytics-head>\.care-tools\{display:grid;grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
 assert.match(admin,/#customerCarePane #careRefreshBtn\{grid-column:1\/-1;min-height:44px/);
 assert.match(admin,/\.admin-tabs\{width:100%;flex-wrap:nowrap;overflow-x:auto/);
 assert.match(admin,/#customerCarePane \.care-finance-cards strong\{font-size:clamp\(15px,4vw,19px\);overflow-wrap:anywhere/);
 assert.match(admin,/#customerCarePane #careSearch\{grid-column:1\/-1;min-width:0;width:100%;min-height:44px/);
 assert.match(admin,/id="marketShopSource"/);
 assert.match(admin,/id="goodsPane"/);
});

test('custom period selection invalidates an older in-flight customer report',()=>{
 assert.match(care,/SPEC-ADMIN-CARE-PERIOD-20261101/);
 assert.match(care,/generation\+\+;loading=false;reloadQueued=false/);
 assert.match(care,/if\(\$\('carePeriodStart'\)\.value&&\$\('carePeriodEnd'\)\.value\)refreshPeriod\(\)/);
 assert.match(care,/số liệu đang hiển thị thuộc kỳ trước/);
 assert.match(care,/generation!==requestGeneration\|\|getIdentity\(\)\?\.uid!==identity\.uid\|\|reloadQueued/);
});

function costEditorFixture(){
 const source=supplier.slice(supplier.indexOf('function captureDraftInputs(){'),supplier.indexOf('\nfunction fmtDate('));
 assert.ok(source.startsWith('function captureDraftInputs()'));
 const state={inputs:[],newRows:[],saveBtn:{disabled:true,textContent:''}};
 const ctx={
   document:{querySelectorAll:selector=>{
     if(selector==='.cost-input[data-code]')return state.inputs;
     if(selector==='tr.new-row')return state.newRows;
     throw Error('Unexpected selector: '+selector);
   }},
   parseNum:v=>{
     if(!String(v??'').trim())return null;
     const n=Number(String(v).trim().replace(',','.'));
     return Number.isFinite(n)?n:null;
   }
 };
 vm.createContext(ctx);
 vm.runInContext([
   "const originals=new Map([['A',100],['B',50]]);",
   'let pendingCostEdits=new Map(),pendingNewRows=[];',
   "const $=id=>id==='saveBtn'?globalThis.saveBtn:null;",
   source,
   'globalThis.api={updateSaveState,cost:()=>Object.fromEntries(pendingCostEdits),newRows:()=>pendingNewRows};'
 ].join('\n'),ctx);
 ctx.saveBtn=state.saveBtn;
 const input=(code,value)=>({dataset:{code},value,classList:{toggle(){}}});
 const row=(name,cost)=>({querySelector:sel=>({value:sel==='.new-name'?name:cost})});
 return {state,api:ctx.api,input,row};
}

test('supplier edits remain pending while search hides a product and its new item draft',()=>{
 const f=costEditorFixture();
 f.state.inputs=[f.input('A','150')];
 f.state.newRows=[f.row('Mặt hàng mới','450')];
 f.api.updateSaveState();
 assert.equal(f.state.saveBtn.textContent,'Lưu 2 thay đổi');
 f.state.inputs=[f.input('B','50')]; // A hidden by search
 f.api.updateSaveState();
 assert.equal(f.api.cost().A,'150');
 assert.equal(f.api.newRows()[0].name,'Mặt hàng mới');
 assert.equal(f.state.saveBtn.disabled,false);
 assert.equal(f.state.saveBtn.textContent,'Lưu 2 thay đổi');
 assert.ok(supplier.includes('pendingCostEdits.get(p.product_code)??pretty(p.cost)'));
 assert.ok(supplier.includes('for(const [code,raw] of pendingCostEdits)'));
 assert.ok(supplier.includes('for(const row of pendingNewRows)'));
});

test('supplier pending cost is cleared by reverting but not by hiding the row',()=>{
 const f=costEditorFixture();
 f.state.inputs=[f.input('A','150')];f.api.updateSaveState();
 f.state.inputs=[];f.api.updateSaveState();
 assert.equal(f.api.cost().A,'150');
 f.state.inputs=[f.input('A','100')];f.api.updateSaveState();
 assert.equal(Object.keys(f.api.cost()).length,0);
 assert.equal(f.state.saveBtn.disabled,true);
 f.state.inputs=[f.input('B','')];f.api.updateSaveState();
 assert.equal(f.api.cost().B,'');
 assert.equal(f.state.saveBtn.disabled,false);
 assert.match(supplier,/pendingCostEdits\.clear\(\);pendingNewRows=\[\];/);
});

function pinFixture(file){
 const source=read(file);
 const start=source.indexOf('function bindPinBoxes(');
 const end=source.indexOf(file==='ncc/admin/index.html'?'\nfunction pinValue(':'\n\nconst SUA_REPLACEMENTS=',start);
 assert.ok(start>=0&&end>start);
 const inputs=Array.from({length:6},()=>({
   value:'',listeners:{},
   addEventListener(type,fn){this.listeners[type]=fn},
   focus(){this.focused=true}
 }));
 const ctx={document:{querySelectorAll:()=>inputs}};
 vm.createContext(ctx);
 vm.runInContext((file==='ncc/index.html'?'const pinInputs=()=>document.querySelectorAll();\n':'')+source.slice(start,end)+'\nglobalThis.bind=bindPinBoxes',ctx);
 if(file==='ncc/admin/index.html')ctx.bind({querySelectorAll:()=>inputs});
 else ctx.bind();
 return inputs;
}

for(const file of ['ncc/admin/index.html','ncc/index.html']){
 test(file+' retains all six PIN digits from autofill and pastes from focused digit',()=>{
   const inputs=pinFixture(file);
   inputs[0].value='123456';inputs[0].listeners.input();
   assert.deepEqual(inputs.map(x=>x.value),['1','2','3','4','5','6']);
   inputs.forEach(x=>x.value='');
   inputs[2].listeners.paste({clipboardData:{getData:()=> '789'},preventDefault(){}});
   assert.deepEqual(inputs.map(x=>x.value),['','','7','8','9','']);
   inputs[4].listeners.paste({clipboardData:{getData:()=> '654321'},preventDefault(){}});
   assert.deepEqual(inputs.map(x=>x.value),['6','5','4','3','2','1']);
   assert.match(read(file),/SPEC-NCC-PIN-PASTE-20261101/);
 });
}

test('NCC mobile screens keep PIN and toolbar tappable and orders readable',()=>{
 assert.match(supplierAdmin,/SPEC-NCC-ADMIN-MOBILE-20261101/);
 assert.match(supplierAdmin,/\.link-row \.btn,\.pin-area \.btn\{min-height:44px/);
 assert.match(supplier,/SPEC-NCC-SUPPLIER-MOBILE-20261101/);
 assert.match(supplier,/#ordersTable\{min-width:470px\}/);
 assert.match(supplier,/#ordersPanel \.table-wrap\{overflow-x:auto/);
 assert.match(supplier,/\.btn,\.main-tab,\.seg button\{min-height:44px\}/);
});


test('goods, market and visit analytics use accessible responsive controls',()=>{
 assert.match(admin,/SPEC-ADMIN-SUBPAGES-TOOLS-20261101/);
 assert.match(admin,/\.top-actions \.btn\{min-height:44px/);
 assert.match(admin,/\.analytics-head\{flex-direction:column;align-items:stretch;gap:8px/);
 assert.match(admin,/\.analytics-actions select,\.analytics-actions \.btn\{min-height:44px/);
 assert.match(admin,/@media\(min-width:520px\) and \(max-width:700px\)\{\s*\.market-toolbar\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
 assert.match(admin,/\.market-toolbar input,\.market-toolbar select\{min-width:0;min-height:44px;font-size:16px/);
 assert.match(admin,/id="marketRunUpdateBtn"/);
 assert.match(admin,/id="analyticsRefreshBtn"/);
 assert.match(admin,/id="addProductBtn"/);
});
