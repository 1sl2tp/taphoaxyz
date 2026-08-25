import test from 'node:test';
import assert from 'node:assert/strict';
import {deliveredMarkup,deliveredActiveSurface} from '../src/screens/delivered.js';
import {auditMarkupStructure} from '../src/core/ui-structure.js';
import {SCREEN_STRUCTURE_CONTRACTS} from '../src/contracts/ui-structure.js';

const order={id:'D1',trangThai:'done',tenKH:'KH',ngay:new Date().toISOString(),tongTien:125,items:[{tenSP:'SP',sl:1,gia:125}]};
const html=deliveredMarkup({orders:[order],selected:order,printOrder:order});

test('Delivered full-state markup contains every declared Surface',()=>{
  const result=auditMarkupStructure(html,SCREEN_STRUCTURE_CONTRACTS.delivered);
  assert.equal(result.pass,true,result.issues.map(x=>x.message).join('\n'));
});

test('active Surface priority is print > detail > list',()=>{
  assert.equal(deliveredActiveSurface({selected:null,printOrder:null}),'list');
  assert.equal(deliveredActiveSurface({selected:order,printOrder:null}),'detail');
  assert.equal(deliveredActiveSurface({selected:order,printOrder:order}),'print');
});

test('detail is not a navigation backdrop modal',()=>{
  assert.match(html,/data-ui-id="delivered-detail-surface"/);
  assert.doesNotMatch(html,/delivered-backdrop/);
});
