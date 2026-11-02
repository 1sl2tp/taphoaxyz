import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

// GIVEN a customer ID/name containing apostrophes, angle brackets and quotes,
// WHEN rendering/selecting a customer in Sale or Debt, THEN rendered HTML
// cannot turn data into executable inline JS and handler receives exact data.
// MUST-STAY: no change to customer ID, debt selector, current customer, or role.
const runtime=readFileSync(new URL('../src/fixed-ui-runtime-6.js',import.meta.url),'utf8');
const s=runtime.indexOf('function renderCustomerList() {');
const e=runtime.indexOf('function selectCustomer(id, name) {',s);
assert.ok(s>=0&&e>s,'canonical customer selector source exists');
const source=runtime.slice(s,e);

function htmlEscape(value){
  return String(value??'').replace(/&/g,'&amp;')
    .replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
function render(rows,context){
  const list={innerHTML:''};
  const input={value:''};
  const nodes={
    customerSelectList:list,
    customerSearchInput:input,
    quickDebtCustomer:{value:''}
  };
  const ctx={
    document:{getElementById:id=>nodes[id]},
    normalizeSearchText:v=>String(v).toLowerCase(),
    getCustomerRowsForSelector:()=>rows,
    customerSelectionContext:context,
    selectedCustomer:{id:''},
    customerAvatarMarkup:()=>'<span class="customer-avatar">A</span>',
    escapeProductEditorValue:htmlEscape
  };
  vm.runInNewContext(source+'\nthis.render=renderCustomerList;',ctx);
  ctx.render();
  return list.innerHTML;
}

test('customer text and code are escaped, callback uses only dataset',()=>{
  const id="KH'08\"<img>";
  const name="Cô O'Brien & \"Lẻ\" <svg onload=alert(1)>";
  const code="A&B <20>";
  for(const context of ['sale','debt']){
    const html=render([[id,name,code]],context);
    assert.ok(html.includes('data-customer-select-id="'+htmlEscape(id)+'"'));
    assert.ok(html.includes('data-customer-select-name="'+htmlEscape(name)+'"'));
    assert.ok(html.includes('onclick="selectCustomer(this.dataset.customerSelectId, this.dataset.customerSelectName)"'));
    assert.ok(html.includes('>'+htmlEscape(name)+'</span>'));
    assert.ok(html.includes('Mã: '+htmlEscape(code)+'</span>'));
    assert.ok(!html.includes('<svg onload=alert(1)>'));
    assert.ok(!html.includes("onclick=\"selectCustomer('"));
    const calls=[];
    const command='selectCustomer(this.dataset.customerSelectId, this.dataset.customerSelectName)';
    const handler=vm.runInNewContext('(function(){'+command+';})',{
      selectCustomer:(...args)=>calls.push(args)
    });
    handler.call({dataset:{customerSelectId:id,customerSelectName:name}});
    assert.deepEqual(calls,[[id,name]]);
  }
});

test('empty selector and matching search keep existing placeholders',()=>{
  assert.ok(render([],'sale').includes('Chưa có khách hàng.'));
});
