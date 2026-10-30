import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

// SPEC-SHEET-READ-OWNER-20261030
// Given overlapping sheet reads, when an earlier response arrives last,
// only the latest response from the same owner may update UI cache.
// Never alter stored orders, debt or authenticated identity.
const source=readFileSync(new URL('../src/fixed-production-overrides.js',import.meta.url),'utf8');
const tokenDeclaration='  const sheetReadTokens=new Map();';
const start=source.indexOf('  SheetDB.read=async function(sheetName){');
const end=source.indexOf('\n  };',start);
assert.ok(source.includes(tokenDeclaration)&&start>=0&&end>start);
const handler=source.slice(start,end+5);

function deferred(){
 let resolve,reject;
 const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});
 return {promise,resolve,reject};
}
function fixture(){
 const pending=[],notifications=[],store={};
 let uid='A',mode='account';
 const service={
  getIdentity:()=>({uid}),
  getAccessMode:()=>mode,
  readSheet:(sheet)=>{const d=deferred();pending.push({sheet,...d});return d.promise;}
 };
 const SheetDB={
  cache:store,
  notifyListeners(sheet){notifications.push({sheet,rows:this.cache[sheet]});}
 };
 const ctx={Map,Array,String,Error,SheetDB,backend:()=>service};
 vm.createContext(ctx);
 vm.runInContext(tokenDeclaration+'\n'+handler,ctx,{timeout:1000});
 return {
  read:(sheet)=>SheetDB.read(sheet),store,pending,notifications,
  switchTo(nextUid,nextMode='account'){uid=nextUid;mode=nextMode;}
 };
}

test('late older same-sheet response cannot overwrite the latest product cache',async()=>{
 const f=fixture();
 const old=f.read('sanpham'),newer=f.read('sanpham');
 f.pending[1].resolve([['id'],['new']]);
 await newer;
 f.pending[0].resolve([['id'],['old']]);
 await old;
 assert.deepEqual(f.store.sanpham,[['id'],['new']]);
 assert.equal(f.notifications.length,1);
});

test('old customer sheet response cannot notify listeners after account switch',async()=>{
 const f=fixture();
 const pending=f.read('khachhang');
 f.switchTo('B');
 f.pending[0].resolve([['id'],['A-private']]);
 await pending;
 assert.equal(Object.hasOwn(f.store,'khachhang'),false);
 assert.equal(f.notifications.length,0);
 const current=f.read('khachhang');
 f.pending[1].resolve([['id'],['B-row']]);
 await current;
 assert.deepEqual(f.store.khachhang,[['id'],['B-row']]);
 assert.equal(f.notifications.length,1);
});

test('public-link mode rotation cannot accept a late authenticated sheet read',async()=>{
 const f=fixture();
 const pending=f.read('thuchi');
 f.switchTo('A','public-link');
 f.pending[0].resolve([['id'],['private-debt']]);
 await pending;
 assert.equal(f.notifications.length,0);
 assert.equal(Object.hasOwn(f.store,'thuchi'),false);
});

test('independent sheet reads may complete in any order without suppressing one another',async()=>{
 const f=fixture();
 const products=f.read('sanpham'),orders=f.read('dontam');
 f.pending[1].resolve([['id'],['ORDER']]);
 await orders;
 f.pending[0].resolve([['id'],['PRODUCT']]);
 await products;
 assert.deepEqual(f.store.dontam,[['id'],['ORDER']]);
 assert.deepEqual(f.store.sanpham,[['id'],['PRODUCT']]);
 assert.equal(f.notifications.length,2);
});

test('failed newest read preserves last committed cache without stale notifications',async()=>{
 const f=fixture();
 f.store.sanpham=[['old']];
 const earlier=f.read('sanpham'),newer=f.read('sanpham');
 f.pending[1].reject(Error('offline'));
 await assert.rejects(newer,/offline/);
 f.pending[0].resolve([['stale']]);
 await earlier;
 assert.deepEqual(f.store.sanpham,[['old']]);
 assert.equal(f.notifications.length,0);
});
