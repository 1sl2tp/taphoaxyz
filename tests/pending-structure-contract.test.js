import test from 'node:test';
import assert from 'node:assert/strict';
import {pendingMarkup,pendingActiveSurface} from '../src/screens/pending.js';
import {auditMarkupStructure} from '../src/core/ui-structure.js';
import {SCREEN_STRUCTURE_CONTRACTS} from '../src/contracts/ui-structure.js';

const order={id:'P1',trangThai:'pending',tenKH:'KH',ngay:new Date().toISOString(),tongTien:125,items:[{tenSP:'SP',sl:1,gia:125,nhom:'N1'}]};
const printData={title:'IN',date:'25/08/2026',rows:[{name:'SP',qty:1}]};
const html=pendingMarkup({orders:[order],selectedSource:'N1',selectedOrder:order,printData});

test('Pending full-state markup contains every declared Surface',()=>{
  const result=auditMarkupStructure(html,SCREEN_STRUCTURE_CONTRACTS.pending);
  assert.equal(result.pass,true,result.issues.map(x=>x.message).join('\n'));
});

test('active Surface priority is print > detail > source > list',()=>{
  assert.equal(pendingActiveSurface({}),'list');
  assert.equal(pendingActiveSurface({selectedSource:'N1'}),'source');
  assert.equal(pendingActiveSurface({selectedSource:'N1',selectedOrder:order}),'detail');
  assert.equal(pendingActiveSurface({selectedSource:'N1',selectedOrder:order,printData}),'print');
});

test('Pending navigation surfaces do not use backdrop wrappers',()=>{
  assert.match(html,/data-ui-id="pending-source-surface"/);
  assert.match(html,/data-ui-id="pending-detail-surface"/);
  assert.doesNotMatch(html,/pending-backdrop/);
});
