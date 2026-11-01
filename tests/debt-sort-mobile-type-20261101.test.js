import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

// SPEC-DEBT-SORT-MOBILE-TYPE-20261101
// Given mobile PWA debt sorting, native picker must remain accessible
// and zoom-safe (16px) while the VISIBLE "Lâu chưa giao" label is 13px.
// On "Nợ cao nhất" selection, the visible label follows selection and the
// existing renderCongNo handler still owns sorting; no duplicate data writes.
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const markup=read('src/fixed-ui-markup-3.js');
const css=read('src/fixed-ui-debt-popup.css');
const js=read('src/fixed-ui-runtime-11.js');
const html=read('index.html');
const semantic=read('src/fixed-ui-semantic-columns.css');

test('sort uses the native accessible select over an inert visual label',()=>{
  assert.match(markup,/class=\\\"debt-sort-field\\\"/);
  assert.match(markup,/id=\\\"debtSortVisibleValue\\\" aria-hidden=\\\"true\\\">Lâu chưa giao/);
  assert.match(markup,/id=\\\"debtSortSelect\\\" aria-label=\\\"Sắp xếp danh sách công nợ\\\" onchange=\\\"renderCongNo\\(\\)\\\"/);
  assert.match(markup,/value=\\\"days\\\">Lâu chưa giao/);
  assert.match(markup,/value=\\\"amount\\\">Nợ cao nhất/);
  assert.equal((markup.match(/id=\\\"debtSortSelect\\\"/g)||[]).length,1,'exactly one native sort owner');
});

test('visible copy is 13px while focusable native select remains 16px and 44px touch-high',()=>{
  const block=css.slice(css.indexOf('SPEC-DEBT-SORT-MOBILE-TYPE-20261101'));
  assert.match(block,/#tab-cong-no \\.debt-sort-visible-value\\s*\\{[^}]*font-size:13px/);
  assert.match(block,/#tab-cong-no \\.debt-sort-field #debtSortSelect\\s*\\{[^}]*min-height:44px !important/);
  assert.match(block,/#tab-cong-no \\.debt-sort-field #debtSortSelect\\s*\\{[^}]*opacity:0/);
  assert.match(block,/#tab-cong-no \\.debt-sort-field #debtSortSelect\\s*\\{[^}]*font-size:16px !important/);
  assert.match(block,/#tab-cong-no \\.debt-sort-field:focus-within\\s*\\{/);
  assert.match(semantic,/#tab-cong-no \\.debt-sort-row\\s*\\{/);
});

test('visible sort text follows selected native option after data reload and sorting still uses select value',()=>{
  assert.match(js,/debtSortNative = document.getElementById\\('debtSortSelect'\\)/);
  assert.match(js,/debtSortVisible = document.getElementById\\('debtSortVisibleValue'\\)/);
  assert.match(js,/debtSortVisible.textContent = debtSortNative.options\\?\\.\\[debtSortNative.selectedIndex\\]\\?\\.text/);
  assert.match(js,/document.getElementById\\('debtSortSelect'\\).value/);
  assert.match(js,/if \\(sortVal === 'days'\\)/);
  assert.match(js,/filteredList.sort\\(\\(a, b\\) => b.debt - a.debt\\)/);

  const start=js.indexOf('            const debtSortNative = document.getElementById(');
  const end=js.indexOf('            if (!appData.khachhang',start);
  assert.ok(start>=0&&end>start,'single source-of-truth visual sync block');
  const selected={selectedIndex:0,options:[{text:'Lâu chưa giao'},{text:'Nợ cao nhất'}]};
  const visual={textContent:''};
  const ctx={document:{getElementById(id){return id==='debtSortSelect'?selected:id==='debtSortVisibleValue'?visual:null}}};
  vm.runInNewContext(js.slice(start,end),ctx,{timeout:1000});
  assert.equal(visual.textContent,'Lâu chưa giao');
  selected.selectedIndex=1;
  vm.runInNewContext(js.slice(start,end),ctx,{timeout:1000});
  assert.equal(visual.textContent,'Nợ cao nhất');
});

test('PWA reloads exact CSS, markup and runtime; no finance changes',()=>{
  assert.match(html,/fixed-ui-debt-popup\\.css[^"]*sort-type=20261101/);
  assert.match(html,/fixed-ui-markup-3\\.js[^"]*sort-visual=20261101/);
  assert.match(html,/fixed-ui-runtime-11\\.js[^"]*sort-visual=20261101/);
  assert.doesNotMatch(markup,/onclick=\\\"(?!renderCongNo)/);
});
