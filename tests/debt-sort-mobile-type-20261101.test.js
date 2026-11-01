import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

// SPEC-DEBT-SORT-MOBILE-TYPE-20261101
// When sorting on iPhone, a readable 13px label represents the selected
// option, while the one native select remains accessible, 16px zoom-safe
// and 44px touch-high. Changing choice still calls existing renderCongNo.
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const markup=read('src/fixed-ui-markup-3.js');
const css=read('src/fixed-ui-debt-popup.css');
const js=read('src/fixed-ui-runtime-11.js');
const html=read('index.html');
const semantic=read('src/fixed-ui-semantic-columns.css');

test('native sorting remains the only interactive select over an inert visual label',()=>{
  // Source is document.write with escaped quotation marks; inspect real HTML.
  const visibleHtml=markup.replaceAll(String.fromCharCode(92)+'"', '"');
  assert.ok(visibleHtml.includes('class="debt-sort-field"'));
  assert.ok(visibleHtml.includes('id="debtSortVisibleValue" aria-hidden="true">Lâu chưa giao'));
  assert.ok(visibleHtml.includes('id="debtSortSelect" aria-label="Sắp xếp danh sách công nợ" onchange="renderCongNo()"'));
  assert.ok(visibleHtml.includes('value="days">Lâu chưa giao'));
  assert.ok(visibleHtml.includes('value="amount">Nợ cao nhất'));
  assert.equal(visibleHtml.split('id="debtSortSelect"').length-1,1);
});

test('visual copy is 13px; underlying select is 16px, 44px high and accessible to touch',()=>{
  const start=css.indexOf('/* SPEC-DEBT-SORT-MOBILE-TYPE-20261101:');
  assert.ok(start>=0);
  const block=css.slice(start);
  assert.ok(block.includes('.debt-sort-visible-value{'));
  assert.ok(block.includes('font-size:13px;'));
  assert.ok(block.includes('.debt-sort-field #debtSortSelect{'));
  assert.ok(block.includes('min-height:44px !important;'));
  assert.ok(block.includes('opacity:0;'));
  assert.ok(block.includes('font-size:16px !important;'));
  assert.ok(block.includes('.debt-sort-field:focus-within{'));
  assert.ok(semantic.includes('#tab-cong-no .debt-sort-row{'));
});

test('visible text tracks selected option; existing sorting still consumes select value',()=>{
  assert.ok(js.includes("debtSortNative = document.getElementById('debtSortSelect')"));
  assert.ok(js.includes("debtSortVisible = document.getElementById('debtSortVisibleValue')"));
  assert.ok(js.includes("debtSortVisible.textContent = debtSortNative.options?.[debtSortNative.selectedIndex]?.text"));
  assert.ok(js.includes("document.getElementById('debtSortSelect').value"));
  assert.ok(js.includes("sortVal === 'days'"));
  assert.ok(js.includes("filteredList.sort((a, b) => b.debt - a.debt)"));
  const start=js.indexOf("            const debtSortNative = document.getElementById(");
  const end=js.indexOf("            if (!appData.khachhang",start);
  assert.ok(start>=0&&end>start);
  const selected={selectedIndex:0,options:[{text:'Lâu chưa giao'},{text:'Nợ cao nhất'}]};
  const display={textContent:''};
  const ctx={document:{getElementById(id){
    return id==='debtSortSelect'?selected:id==='debtSortVisibleValue'?display:null;
  }}};
  vm.runInNewContext(js.slice(start,end),{document:ctx.document},{timeout:1000});
  assert.equal(display.textContent,'Lâu chưa giao');
  selected.selectedIndex=1;
  vm.runInNewContext(js.slice(start,end),{document:ctx.document},{timeout:1000});
  assert.equal(display.textContent,'Nợ cao nhất');
});

test('the three modified PWA assets have refreshed URLs',()=>{
  assert.ok(html.includes('sort-type=20261101'));
  assert.ok(html.includes('sort-visual=20261101'));
  assert.ok(html.includes('fixed-ui-debt-popup.css'));
  assert.ok(html.includes('fixed-ui-markup-3.js'));
  assert.ok(html.includes('fixed-ui-runtime-11.js'));
});
