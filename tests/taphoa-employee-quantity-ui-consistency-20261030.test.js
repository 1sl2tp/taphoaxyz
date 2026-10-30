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
function fixture({simulatePublicEdit=false}={}){
 const events=[],listeners={};
 let mode='employee-link';
 const ctx={
  window:{addEventListener:(kind,fn)=>{listeners[kind]=fn;}},
  document:{hidden:false,addEventListener:(kind,fn)=>{listeners[kind]=fn;}},
  retryPendingSharedCartSave:()=>events.push('reconnect'),
  isSharedCartMode:()=>mode==='employee-link'||mode==='public-link',
  backend:()=>({getAccessMode:()=>mode}),
  updateCart:function(code,name,price,change){
   events.push('original-update');
   if(simulatePublicEdit){
    const current=ctx.handle.cart();
    const next=(Number(current[code]?.qty)||0)+Number(change||0);
    if(next>0)current[code]={qty:next,name,price};
    else delete current[code];
   }
  },
  previewQtyInput:function(input){
   events.push('original-preview');
   if(simulatePublicEdit){
    const code=input?.dataset?.qtyId;
    if(code&&Number(input.value)>0)ctx.handle.cart()[code]={qty:Number(input.value)};
   }
  },
  commitQtyEditor:function(input){
   events.push('original-commit');
   if(simulatePublicEdit){
    const code=input?.dataset?.qtyId;
    if(code&&Number(input.value)>0)ctx.handle.cart()[code]={qty:Number(input.value)};
   }
  },
  clearCart:function(){events.push('original-clear');},
  getQtyMeta:code=>({name:code,price:0}),
  syncQtyEditors:()=>events.push('sync-editor'),
  refreshCartTotalsOnly:()=>events.push('totals'),
  renderCartUI:()=>events.push('cart-render'),
  scheduleSharedCartSave:()=>events.push('schedule-save'),
  String,Number,Object,Math
 };
 vm.createContext(ctx);
 vm.runInContext('let cart={};let __cartTouchSeq=0;let sharedCartLocalEditSeq=0;let sharedCartCommittedEditSeq=0;\n'+method+
  '\ninstallSharedCartQuantitySync();globalThis.handle={preview:previewQtyInput,commit:commitQtyEditor,update:updateCart,cart:()=>cart};',
  ctx,{timeout:1000});
 return {
  events,listeners,ctx,
  cart:()=>ctx.handle.cart(),
  preview:(code,value,qtyEditor='product')=>
   ctx.handle.preview({dataset:{qtyId:code,qtyEditor},value:String(value)}),
  commit:(code,value,qtyEditor='product')=>
   ctx.handle.commit({dataset:{qtyId:code,qtyEditor},value:String(value)}),
  update:(code,change)=>ctx.handle.update(code,code,0,change),
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
 assert.deepEqual(f.events,['original-preview','original-commit'],
   'delegated input that makes no quantity change must not post the full cart');
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

test('shared cart installs one reconnect and visible-tab recovery handler',()=>{
 const f=fixture();
 assert.equal(typeof f.listeners.online,'function');
 assert.equal(typeof f.listeners.visibilitychange,'function');
 f.listeners.online();
 f.ctx.document.hidden=true;
 f.listeners.visibilitychange();
 f.ctx.document.hidden=false;
 f.listeners.visibilitychange();
 assert.equal(f.events.filter(x=>x==='reconnect').length,2,
   'only online and becoming visible should retry unresolved saves');
});

test('blank mobile blur retains last valid employee quantity and does not trigger another save',()=>{
 const f=fixture();
 f.preview('P1',6);
 const savesBefore=f.events.filter(e=>e==='schedule-save').length;
 const rendersBefore=f.events.filter(e=>e==='cart-render').length;
 f.commit('P1','','cart');
 assert.equal(f.cart().P1.qty,6);
 assert.equal(f.events.filter(e=>e==='schedule-save').length,savesBefore);
 assert.equal(f.events.filter(e=>e==='cart-render').length,rendersBefore);
});
test('blurring untouched employee quantity does not send a full-cart overwrite',()=>{
 const f=fixture();
 f.commit('P2','','product');
 assert.equal(f.cart().P2,undefined);
 assert.equal(f.events.filter(e=>e==='schedule-save').length,0);
 f.preview('P1',3);
 f.commit('P1',3,'cart');
 assert.equal(f.events.filter(e=>e==='schedule-save').length,1,
   'same value preview then blur is one logical quantity change');
});


test('pageshow after back/forward restore checks if an unresolved cart save can resume',()=>{
 const f=fixture();
 assert.equal(typeof f.listeners.pageshow,'function');
 f.listeners.pageshow();
 assert.equal(f.events.filter(e=>e==='reconnect').length,1);
});

test('beforeunload warns only for unsynced shared-cart edits and never for normal accounts',()=>{
 const f=fixture();
 let prevented=0;
 const pageEvent=()=>({preventDefault(){prevented++;},returnValue:'unchanged'});
 assert.equal(typeof f.listeners.beforeunload,'function');
 const clean=pageEvent();
 f.listeners.beforeunload(clean);
 assert.equal(prevented,0);
 assert.equal(clean.returnValue,'unchanged');
 vm.runInContext('sharedCartLocalEditSeq=2;sharedCartCommittedEditSeq=1;',f.ctx);
 const pending=pageEvent();
 f.listeners.beforeunload(pending);
 assert.equal(prevented,1);
 assert.equal(pending.returnValue,'');
 f.switchMode('account');
 f.listeners.beforeunload(pageEvent());
 assert.equal(prevented,1,'normal account mode does not inherit shared cart warning');
});


test('public link saves on a real quantity change but not again on blur with the same quantity',()=>{
 const f=fixture({simulatePublicEdit:true});
 f.switchMode('public-link');
 f.preview('P1',4);
 f.commit('P1',4);
 assert.equal(f.cart().P1.qty,4);
 assert.equal(f.events.filter(x=>x==='schedule-save').length,1);
 f.preview('P1',6);
 f.commit('P1',6);
 assert.equal(f.events.filter(x=>x==='schedule-save').length,2);
});

test('blocked or zero-delta cart button does not post an unchanged full shared snapshot',()=>{
 const f=fixture();
 f.update('P1',1);
 f.update('P1',0);
 assert.equal(f.events.filter(x=>x==='original-update').length,2);
 assert.equal(f.events.filter(x=>x==='schedule-save').length,0);
 const actual=fixture({simulatePublicEdit:true});
 actual.update('P1',1);
 actual.update('P1',0);
 actual.update('P1',-1);
 assert.equal(actual.events.filter(x=>x==='schedule-save').length,2);
 assert.equal(actual.cart().P1,undefined);
});

test('employee typing the current quantity again does not resend full cart',()=>{
 const f=fixture();
 f.preview('P1',8);
 const first=f.events.filter(x=>x==='schedule-save').length;
 f.preview('P1',8,'cart');
 f.preview('P1',8,'product');
 f.commit('P1',8,'cart');
 assert.equal(f.events.filter(x=>x==='schedule-save').length,first);
 assert.equal(f.cart().P1.qty,8);
});


test('employee direct quantity preview and commit both retain existing cart note',()=>{
 const f=fixture();
 f.preview('P1',3);
 f.cart().P1.note='Hàng dễ vỡ, để riêng';
 f.preview('P1',4,'cart');
 assert.equal(f.cart().P1.note,'Hàng dễ vỡ, để riêng');
 f.commit('P1',5,'cart');
 assert.equal(f.cart().P1.note,'Hàng dễ vỡ, để riêng');
 assert.equal(f.cart().P1.qty,5);
});
