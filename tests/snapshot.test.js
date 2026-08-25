import test from 'node:test';
import assert from 'node:assert/strict';
import {createSnapshotStore} from '../src/core/snapshot.js';

function memoryStorage(){
  const map=new Map();
  return {
    getItem:key=>map.has(key)?map.get(key):null,
    setItem:(key,value)=>map.set(key,String(value)),
    removeItem:key=>map.delete(key)
  };
}

const state={
  version:'SUPABASE-1',syncSeconds:30,revisions:{products:2},
  products:[{id:'tl1',ten:'Cứng',gia:125,von:124}],sources:[],customers:[],orders:[],debtSummary:[],printSettings:{},selfCustomer:null
};

test('snapshot round-trips for the same uid',()=>{
  const store=createSnapshotStore({storage:memoryStorage(),cacheVersion:1});
  assert.equal(store.save('u1',state),true);
  const snap=store.load('u1');
  assert.equal(snap.uid,'u1');
  assert.equal(snap.data.products[0].gia,125);
});

test('snapshot never loads for another uid',()=>{
  const storage=memoryStorage();
  const store=createSnapshotStore({storage,cacheVersion:1});
  store.save('u1',state);
  assert.equal(store.load('u2'),null);
});

test('snapshot with a different cache version is rejected',()=>{
  const storage=memoryStorage();
  createSnapshotStore({storage,cacheVersion:1}).save('u1',state);
  assert.equal(createSnapshotStore({storage,cacheVersion:2}).load('u1'),null);
});

test('clear removes only the requested uid snapshot',()=>{
  const storage=memoryStorage();
  const store=createSnapshotStore({storage,cacheVersion:1});
  store.save('u1',state);store.save('u2',state);
  store.clear('u1');
  assert.equal(store.load('u1'),null);
  assert.ok(store.load('u2'));
});
