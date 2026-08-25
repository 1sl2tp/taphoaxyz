import test from 'node:test';
import assert from 'node:assert/strict';
import {validateStructureContract,auditMarkupStructure} from '../src/core/ui-structure.js';
import {AUTH_STRUCTURE_CONTRACT,APP_STRUCTURE_CONTRACT,SCREEN_STRUCTURE_CONTRACTS} from '../src/contracts/ui-structure.js';

const owners={geometry:'parent',paint:'self',interaction:'probe-controller',state:'probe-controller',scroll:'none',focus:'none'};
const good={
  id:'probe',
  root:{id:'probe-root',kind:'root',attribute:'data-root-id',value:'probe',children:['probe-workspace']},
  nodes:[
    {id:'probe-workspace',kind:'workspace',parent:'probe-root',children:['probe-list'],purpose:'workspace',owners,order:1},
    {id:'probe-list',kind:'region',parent:'probe-workspace',children:[],purpose:'data list',owners:{...owners,scroll:'self'},order:1}
  ],
  flows:[{id:'probe.open',source:'probe-list',action:'open',mutationOwner:'probe-controller',targetState:'selected',targetRegion:'probe-list',back:'stay:probe'}]
};

test('complete contract is valid',()=>assert.deepEqual(validateStructureContract(good),[]));

test('missing owner is OWNER FAIL',()=>{
  const bad=structuredClone(good);delete bad.nodes[1].owners.scroll;
  const issues=validateStructureContract(bad);
  assert.ok(issues.some(x=>x.gate==='owner'&&/scroll/.test(x.message)));
});

test('unresolved parent is TREE FAIL',()=>{
  const bad=structuredClone(good);bad.nodes[1].parent='missing-parent';
  assert.ok(validateStructureContract(bad).some(x=>x.gate==='tree'));
});

test('mobile Surface outside Slot 1 is PLACEMENT FAIL',()=>{
  const bad=structuredClone(good);bad.nodes[1].kind='surface';bad.nodes[1].placement={mobile:2,wide:2};
  assert.ok(validateStructureContract(bad).some(x=>x.gate==='placement'));
});

test('all TAPHOA declared contracts validate',()=>{
  for(const contract of [AUTH_STRUCTURE_CONTRACT,APP_STRUCTURE_CONTRACT,...Object.values(SCREEN_STRUCTURE_CONTRACTS)]){
    assert.deepEqual(validateStructureContract(contract),[],contract.id);
  }
});

test('markup audit checks markers and source order',()=>{
  const html='<section data-root-id="probe"><div data-ui-node="workspace" data-ui-id="probe-workspace" data-parent-id="probe-root"><div data-ui-node="region" data-ui-id="probe-list" data-parent-id="probe-workspace"></div></div></section>';
  const result=auditMarkupStructure(html,good);
  assert.equal(result.pass,true,result.issues.map(x=>x.message).join('\n'));
});
