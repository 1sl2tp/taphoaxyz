import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

// SPEC-ADMIN-NCC-PRICE-TIMELINE-20261108
// Given a feedback record with both reliable timestamps, display each price
// with its own Viet Nam-local time. If old history is unavailable, never copy
// the new timestamp or manufacture a date. Retain HTML escaping and RPC owner.
const html=readFileSync(new URL('../admin-gia.html',import.meta.url),'utf8');
const start=html.indexOf('    // SPEC-ADMIN-NCC-PRICE-TIMELINE-20261108:');
const end=html.indexOf('\n\n    async function showHistory(',start);
assert.ok(start>0&&end>start,'canonical feedback renderer found');
const source=html.slice(start,end);

function fixture(records){
  const elements={
    supplierFeedbackBody:{innerHTML:''},
    supplierFeedbackEmpty:{classList:{add(){},toggle(){}}}
  };
  const state={records,elements,called:0};
  const context=vm.createContext({Date,Intl,Promise,state});
  vm.runInContext(`
    let identity={uid:'admin'},feedbackGeneration=0;
    const $=id=>state.elements[id];
    const esc=value=>String(value??'').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    const pretty=value=>String(value??'');
    const rpc=async name=>{
      if(name!=='taphoa_admin_supplier_price_feedback')throw Error('wrong RPC');
      state.called+=1;
      return state.records;
    };
    ${source}
    globalThis.loadFeedback=loadSupplierFeedback;
  `,context);
  return {state,render:()=>context.loadFeedback()};
}

test('feedback lists old and new prices with their separate Vietnamese timestamps',async()=>{
  const f=fixture([{
    id:31,product_name:'Bia ha noi',old_price:264,new_price:266,
    old_price_at:'2026-11-06T12:05:00Z',created_at:'2026-11-07T12:20:00Z'
  }]);
  await f.render();
  const body=f.state.elements.supplierFeedbackBody.innerHTML;
  assert.equal(f.state.called,1,'no additional per-product RPC');
  assert.match(body,/Bia ha noi/);
  assert.match(body,/feedback-price-value">264/);
  assert.match(body,/feedback-price-value">266/);
  assert.match(body,/datetime="2026-11-06T12:05:00.000Z"/);
  assert.match(body,/datetime="2026-11-07T12:20:00.000Z"/);
  assert.match(body,/06\/11\/26/);
  assert.match(body,/07\/11\/26/);
  assert.match(body,/19:05/);
  assert.match(body,/19:20/);
});

test('missing old history is unknown, not the new price timestamp',async()=>{
  const f=fixture([{
    id:32,product_name:'Sữa hộp',old_price:425,new_price:430,
    created_at:'2026-11-08T02:25:00Z'
  }]);
  await f.render();
  const body=f.state.elements.supplierFeedbackBody.innerHTML;
  assert.equal((body.match(/<time /g)||[]).length,1);
  assert.match(body,/Giá cũ: chưa có mốc lịch sử/);
  assert.match(body,/datetime="2026-11-08T02:25:00.000Z"/);
  assert.match(body,/09:25/);
});

test('no timestamps or invalid values never invent a date',async()=>{
  const f=fixture([{
    id:33,product_name:'<b>unsafe</b>',old_price:10,new_price:11,
    old_changed_at:'not a date',created_at:''
  }]);
  await f.render();
  const body=f.state.elements.supplierFeedbackBody.innerHTML;
  assert.equal((body.match(/feedback-time-missing/g)||[]).length,2);
  assert.doesNotMatch(body,/<time /);
  assert.doesNotMatch(body,/<b>unsafe<\/b>/);
  assert.match(body,/&lt;b&gt;unsafe&lt;\/b&gt;/);
  assert.doesNotMatch(body,/1970|Invalid Date/);
});

test('table retains four columns, readable dual-line prices and compact mobile layout',()=>{
  assert.match(html,/<th>Giá cũ<span class="feedback-head-note">Thời điểm<\/span>/);
  assert.match(html,/<th>Giá mới<span class="feedback-head-note">Thời điểm<\/span>/);
  assert.match(html,/\.feedback-price-stack\{display:flex;min-width:0;flex-direction:column/);
  assert.match(html,/\.feedback-price-time\{font-size:11px;/);
  assert.ok(html.includes('@media(max-width:540px){'));
  assert.ok(html.includes('.feedback-table td{padding:5px 5px}'));
  assert.ok(html.includes('.feedback-price-time{font-size:10px}'));
  assert.match(html,/\$\{supplierFeedbackTimeMarkup\(x\.old_price_at\?\?x\.old_changed_at,'Giá cũ'\)\}/);
  assert.match(html,/\$\{supplierFeedbackTimeMarkup\(x\.new_price_at\?\?x\.created_at\?\?x\.changed_at,'Giá mới'\)\}/);
});
