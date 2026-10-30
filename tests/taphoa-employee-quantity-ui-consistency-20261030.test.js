import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

// SPEC-EMPLOYEE-QUANTITY-UI-20261030
// Given an employee shared cart, first direct input inserts a visible row at
// the top; editing an existing quantity must not move the row or lose focus;
// entering 0 removes the visible row. No new API/business/price behavior.
const source=readFileSync(new URL('../src/fixed-production-overrides.js',import.meta.url),'utf8');
const start=source.indexOf('  function installSharedCartQuantitySync(){');
const end=source.indexOf('  function installEmployeeOrderActionGuard(){',start);
assert.ok(start>=0&&end>start);
const method=source.slice(start,end);
function fixture(){
 const events=[];
 let mode='employee-link';
 const ctx={
  window:{},
  backend:()=>({getAccessMode:()=>mode}),
  updateCart:function(){events.push('original-update');},
  previewQtyInput:function(){events.push('original-preview');},
  commitQtyEditor:function(){events.push('original-commit');},
  clearCart:function(){events.push('original-clear');},
  getQtyMeta:code=>({name:code,price:0}),
  syncQtyEditors:()=>events.push('sync-editor'),
  refreshCartTotalsOnly:()=>events.push('totals'),
  renderCartUI:()=>events.push('cart-render'),
  scheduleSharedCartSave:()=>events.push('schedule-save'),
  String,Number,Object,Math
 };
 vm.createContext(ctx);
 vm.runInContext('let cart={};let __cartTouchSeq=0;\n'+method+
  '\ninstallSharedCartQuantitySync();globalThis.handle={preview:previewQtyInput,commit:commitQtyEditor,cart:()=>cart};',
  ctx,{timeout:1000});
 return {
  events,
  cart:()=>ctx.handle.cart(),
  preview:(code,value,qtyEditor='product')=>
   ctx.handle.preview({dataset:{qtyId:code,qtyEditor},value:String(value)}),
  commit:(code,value,qtyEditor='product')=>
   ctx.handle.commit({dataset:{qtyId:code,qtyEditor},value:String(value)}),
  switchMode:value=>{mode=value;}
 };
}

test('employee first direct quantity entry immediately renders new cart row and stamps newest first',()=>{
 const f=fixture();
 f.preview('P1',3);
 assert.equal(f.cart().P1.qty,3);
 assert.equal(f.cart().P1.price,0);
 assert.equal(f.cart().P1.__lastTouched,1);
 assert.equal(f.events.filter(x=>x==='cart-render').length,1);
 f.preview('P2',5);
 assert.equal(f.cart().P2.__lastTouched,2);
 assert.ok(f.cart().P2.__lastTouched>f.cart().P1.__lastTouched);
 assert.equal(f.events.filter(x=>x==='cart-render').length,2);
});

test('existing employee cart editor update preserves row order and mounted input',()=>{
 const f=fixture();
 f.preview('P1',2);
 const stamp=f.cart().P1.__lastTouched;
 const before=f.events.filter(x=>x==='cart-render').length;
 f.preview('P1',9,'cart');
 f.commit('P1',10,'cart');
 assert.equal(f.cart().P1.qty,10);
 assert.equal(f.cart().P1.__lastTouched,stamp);
 assert.equal(f.events.filter(x=>x==='cart-render').length,before);
 assert.equal(f.events.filter(x=>x==='totals').length,2);
});

test('setting quantity to zero removes employee row and rerenders the cart',()=>{
 const f=fixture();
 f.preview('P1',3);
 const before=f.events.filter(x=>x==='cart-render').length;
 f.commit('P1',0,'cart');
 assert.equal(Object.hasOwn(f.cart(),'P1'),false);
 assert.equal(f.events.filter(x=>x==='cart-render').length,before+1);
 f.preview('P1',4);
 assert.equal(f.cart().P1.__lastTouched,2,'readded product gets a new top insertion stamp');
});

test('employee blur of product card inserts missing cart row without losing quantity',()=>{
 const f=fixture();
 f.commit('P3',6);
 assert.equal(f.cart().P3.qty,6);
 assert.equal(f.cart().P3.__lastTouched,1);
 assert.equal(f.events.filter(x=>x==='cart-render').length,1);
});

test('ordinary public link direct-input behavior remains delegated to original handler',()=>{
 const f=fixture();f.switchMode('public-link');
 f.preview('P1',4);f.commit('P1',4);
 assert.deepEqual(f.events,['original-preview','schedule-save','original-commit','schedule-save']);
 assert.equal(Object.keys(f.cart()).length,0);
});

test('incomplete or nonfinite employee quantity typing does not delete an existing row',()=>{
 const f=fixture();
 f.preview('P1',6);
 const initialStamp=f.cart().P1.__lastTouched;
 f.preview('P1','1e309');
 f.preview('P1','invalid');
 assert.equal(f.cart().P1.qty,6);
 assert.equal(f.cart().P1.__lastTouched,initialStamp);
 f.commit('P1','1e309','cart');
 assert.equal(f.cart().P1.qty,6);
 assert.equal(f.cart().P1.__lastTouched,initialStamp);
});
test('nonfinite employee entry never creates a new product row or a save',()=>{
 const f=fixture();
 f.preview('P2','Infinity');
 assert.equal(f.cart().P2,undefined);
 assert.equal(f.events.filter(e=>e==='schedule-save').length,0);
});
