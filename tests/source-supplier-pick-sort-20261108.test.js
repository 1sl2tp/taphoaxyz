import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

// SPEC-SOURCE-SUPPLIER-PICK-SORT-20261108
// Given several delivered orders of the same product from different buyers,
// Gộp / Tên hàng groups the item and annotates each note "customer · SL",
// Gộp / Tên khách groups by buyer+product with no cross-buyer merging.
// The total quantity and order records are never mutated or re-fetched.
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const r8=read('src/fixed-ui-runtime-8.js');
const r9=read('src/fixed-ui-runtime-9.js');
const r10=read('src/fixed-ui-runtime-10.js');
const rawMarkup=read('src/fixed-ui-markup-4.js');
const markup=JSON.parse(rawMarkup.slice('document.write('.length,rawMarkup.lastIndexOf(');')));
const css=read('src/fixed-ui-source-4.css');
const index=read('index.html');
const extract=(source,start,end)=>{
  const from=source.indexOf(start),to=source.indexOf(end,from);
  assert.ok(from>=0&&to>from,'owner boundary '+start);
  return source.slice(from,to);
};

function fixture(){
  // Original source_row order intentionally differs from A-Z.
  const products=[['code','name','x','x','source'],
    ['P2','Đỏ',null,null,'Thuốc lá'],['P1','Bạc hà',null,null,'Thuốc lá']];
  const customers=[['code','name'],['C1','C Sâm'],['C2','A Bình']];
  const rows=[
    ['DG1','C1','P1',5,null,null,'01/11/2026 10:00','backend1',null,'Giao bạc hà, tránh nhầm xanh'],
    ['DG2','C2','P1',3,null,null,'01/11/2026 11:00','backend2',null,'Để riêng'],
    ['DG3','C1','P2',2,null,null,'01/11/2026 12:00','backend3',null,''],
    ['DG4','C1','P1',1,null,null,'01/11/2026 13:00','backend4',null,'Gửi thêm']
  ];
  const capture={innerHTML:''},selector={value:'product'};
  const esc=v=>String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;')
      .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  const context={
    appData:{sanpham:products,khachhang:customers},
    getRowsVisibleForOrderTab(sheet){assert.equal(sheet,'dongiao');return rows;},
    getOrderTimeRange(){return {detail:'08/11/2026',label:'08/11'};},
    document:{getElementById(id){
      if(id==='sourceDetailCaptureGrouped')return capture;
      if(id==='sourceDetailGroupSortSelect')return selector;
      return null;
    }},
    escapeProductEditorValue:esc
  };
  vm.createContext(context);
  vm.runInContext(extract(r8,'        let activeSourceDetailState = {',
    '        function openSourceDetailFromCell('),context,{timeout:2000});
  vm.runInContext(extract(r9,'        function sourceLineNoteEditorHtml(',
    '        function openSourceLineNoteEditor('),context,{timeout:2000});
  vm.runInContext(extract(r9,'        // SPEC-SOURCE-SUPPLIER-PICK-SORT-20261108: sorting never changes',
    '        function renderSourceDetailModal()'),context,{timeout:2000});
  const built=context.buildSourceDetailData('dongiao','Thuốc lá');
  context.fixtureState={...built,sheetName:'dongiao',source:'Thuốc lá',groupSort:'product'};
  vm.runInContext('activeSourceDetailState = fixtureState',context);
  return {context,capture,selector,built,rows};
}
test('product mode totals remain exact and notes identify customer with per-order quantity',()=>{
  const f=fixture();const {built,context,capture}=f;
  assert.equal(built.totalQty,11);
  assert.equal(built.groupedRows.length,2);
  assert.equal(built.groupedRows.find(x=>x.productCode==='P1').qty,9);
  assert.equal(built.groupedRows.find(x=>x.productCode==='P1').noteEntries.length,3);
  context.renderSourceDetailCaptureGrouped();
  const html=capture.innerHTML;
  assert.equal((html.match(/data-source-share-row/g)||[]).length,2);
  assert.ok(html.indexOf('Bạc hà')<html.indexOf('Đỏ'),'A-Z product sorting');
  assert.match(html,/C Sâm · SL 5/);
  assert.match(html,/A Bình · SL 3/);
  assert.match(html,/C Sâm · SL 1/);
  assert.match(html,/Giao bạc hà, tránh nhầm xanh/);
  assert.match(html,/Để riêng/);
  assert.match(html,/TỔNG · 2 mã/);
  assert.match(html,/source-detail-total-qty">11/);
});

test('customer mode groups buyer+product, sorts by buyer A-Z and keeps notes and quantities',()=>{
  const f=fixture();f.context.changeSourceDetailGroupSort('customer');
  const html=f.capture.innerHTML;
  assert.equal(f.selector.value,'customer');
  assert.equal((html.match(/data-source-share-row/g)||[]).length,3);
  assert.ok(html.indexOf('A Bình')<html.indexOf('C Sâm'),'customers sorted A-Z');
  assert.match(html,/Tên KH \/ tên hàng/);
  assert.match(html,/TỔNG · 3 dòng KH\/hàng/);
  assert.match(html,/source-detail-total-qty">11/);
  const samP1=f.built.customerRows.find(r=>r.buyerCode==='C1'&&r.productCode==='P1');
  assert.equal(samP1.qty,6);
  assert.equal(samP1.noteEntries.length,2);
  assert.equal(f.built.customerRows.find(r=>r.buyerCode==='C2'&&r.productCode==='P1').qty,3);
  assert.deepEqual(f.rows.map(r=>r[3]),[5,3,2,1],'sorting is read-only');
  f.context.changeSourceDetailGroupSort('product');
  assert.equal(f.selector.value,'product');
  assert.equal((f.capture.innerHTML.match(/data-source-share-row/g)||[]).length,2);
  assert.match(f.capture.innerHTML,/source-detail-total-qty">11/);
});

test('separate buyer codes never merge even when display names are identical',()=>{
  const f=fixture();
  const rows=[{buyerCode:'KH1',buyerName:'C Sâm',productCode:'P1',productName:'Bạc hà',qty:5},
    {buyerCode:'KH2',buyerName:'C Sâm',productCode:'P1',productName:'Bạc hà',qty:3}];
  const result=f.context.groupSourceRowsByCustomer(rows);
  assert.equal(result.length,2);
  assert.equal(result.reduce((n,r)=>n+r.qty,0),8);
});

test('notes and customer strings remain escaped for share capture',()=>{
  const f=fixture();const e=f.context.sourceGroupedNoteHtml({
    buyerName:'<img src=x onerror=alert(1)>',qty:5,note:'<script>bad</script>'
  });
  assert.doesNotMatch(e,/<img|<script>/);
  assert.match(e,/&lt;img/);
  assert.match(e,/&lt;script&gt;/);
});

test('sort chooser, share, note edit and responsive styling use existing local UI',()=>{
  assert.match(markup,/id="sourceDetailGroupSortSelect"/);
  assert.match(markup,/value="product">Theo tên hàng A–Z/);
  assert.match(markup,/value="customer">Theo tên khách A–Z/);
  assert.match(markup,/onchange="changeSourceDetailGroupSort\(this\.value\)"/);
  assert.match(css,/\.source-detail-note-context\{/);
  assert.match(css,/\.source-detail-group-buyer\{/);
  assert.match(css,/\.source-detail-sort-select\{/);
  assert.match(r9,/async function commitSourceLineNoteEditor\(input\)/);
  assert.match(r9,/customerRows: built\.customerRows/);
  assert.match(r10,/sortMode,/);
  assert.match(r10,/source\.innerText \|\| source\.textContent \|\| ''/);
  for(const asset of ['fixed-ui-runtime-8.js','fixed-ui-runtime-9.js','fixed-ui-runtime-10.js',
    'fixed-ui-markup-4.js','fixed-ui-source-4.css'])
    assert.ok(index.includes(asset)&&index.includes('pick-sort=20261108'));
});
