import test from 'node:test';
import assert from 'node:assert/strict';
import {createAppState,changedDomains} from '../src/core/app-state.js';

const bootstrap={
  version:'SUPABASE-1',syncSeconds:30,
  user:{id:'u1'},permissions:{canSeeCost:true},
  products:[{id:'tl1',ten:'Cứng',gia:125,von:124,nhom:'Thuốc lá'}],
  sources:[{id:'src1',name:'Thuốc lá'}],
  customers:[{id:'kh1',ten:'Khách 1'}],
  orders:[{id:'o1'}],debtSummary:[{maKH:'kh1',soDu:0}],
  printSettings:{shopName:'TAPHOA'},selfCustomer:null,
  revisions:{products:2,customers:1,orders:1,debt:1,settings:1}
};

test('setBootstrap preserves the complete server bundle',()=>{
  const app=createAppState();
  app.setBootstrap(bootstrap);
  const s=app.get();
  assert.equal(s.version,'SUPABASE-1');
  assert.equal(s.syncSeconds,30);
  assert.equal(s.products.length,1);
  assert.equal(s.products[0].ten,'Cứng');
  assert.equal(s.products[0].gia,125);
  assert.equal(s.products[0].von,124);
  assert.equal(s.sources.length,1);
  assert.equal(s.customers.length,1);
  assert.equal(s.orders.length,1);
  assert.equal(s.debtSummary.length,1);
  assert.deepEqual(s.printSettings,{shopName:'TAPHOA'});
  assert.deepEqual(s.revisions,bootstrap.revisions);
});

test('mergeDomains changes only keys present in the domain bundle',()=>{
  const app=createAppState();
  app.setBootstrap(bootstrap);
  app.mergeDomains({products:[{id:'tl1',ten:'Cứng mới',gia:126}],sources:[{id:'src1',name:'Thuốc lá'}],revisions:{products:3}});
  const s=app.get();
  assert.equal(s.products[0].gia,126);
  assert.equal(s.customers[0].ten,'Khách 1');
  assert.equal(s.orders[0].id,'o1');
  assert.equal(s.debtSummary[0].maKH,'kh1');
  assert.equal(s.revisions.products,3);
  assert.equal(s.revisions.customers,1);
});

test('changedDomains returns only server revisions that differ',()=>{
  assert.deepEqual(changedDomains({products:2,customers:1,orders:4,debt:3,settings:1},{products:3,customers:1,orders:4,debt:5,settings:1}),['products','debt']);
});

test('subscribers receive changed domains and can unsubscribe',()=>{
  const app=createAppState();
  const calls=[];
  const unsubscribe=app.subscribe(event=>calls.push(event.changed));
  app.setBootstrap(bootstrap);
  app.mergeDomains({customers:[{id:'kh2',ten:'Khách 2'}],revisions:{customers:2}});
  unsubscribe();
  app.mergeDomains({orders:[],revisions:{orders:2}});
  assert.deepEqual(calls,[['bootstrap'],['customers']]);
});
