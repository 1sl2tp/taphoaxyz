import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../src/fixed-ui-runtime-6.js',import.meta.url),'utf8');
const start=source.indexOf('/* SPEC-TAPHOA-CART-TRANSITION-20261102');
const end=source.indexOf('function openCustomerModal(',start);
assert.ok(start>0&&end>start);
const owner=source.slice(start,end);

function makeClassList(initial=[]){
  const values=new Set(initial);
  return{
    add(...items){for(const x of items)values.add(x)},
    remove(...items){for(const x of items)values.delete(x)},
    contains(x){return values.has(x)}
  };
}
function fixture(){
  let id=0;const jobs=new Map();
  const setTimeout=(cb,delay)=>{const key=++id;jobs.set(key,{cb,delay});return key};
  const clearTimeout=key=>jobs.delete(key);
  const flush=(delay)=>{
    for(const [key,job] of [...jobs]){
      if(job.delay!==delay)continue;
      jobs.delete(key);
      job.cb();
    }
  };
  const wrapper={classList:makeClassList(['pointer-events-none','opacity-0'])};
  const sheet={classList:makeClassList(['translate-y-full'])};
  const badge={classList:makeClassList([])};
  const nodes={cartModalWrapper:wrapper,cartBottomSheet:sheet,cartEditBadge:badge};
  const ctx={
    window:{innerWidth:390},
    document:{body:{classList:makeClassList()},getElementById:id=>nodes[id]},
    setTimeout,clearTimeout,requestAnimationFrame:fn=>{fn();return 1},
    syncCartHeaderScrollbar(){},
    editingOrderId:null,editingOrderSheet:null,editingOrderInSaleMode:false
  };
  vm.runInNewContext(owner+'\nthis.cartUI={open:openCartMobile,close:closeCartMobile};',ctx);
  return{
    ...ctx.cartUI,wrapper,sheet,flush,jobs,
    visible:()=>!wrapper.classList.contains('opacity-0')&&
      !wrapper.classList.contains('pointer-events-none')&&
      !sheet.classList.contains('translate-y-full')
  };
}

test('a close scheduled in the past cannot hide a reopened cart',()=>{
  const f=fixture();
  f.open();f.flush(10);
  assert.equal(f.visible(),true);
  f.close();
  f.open();f.flush(10);f.flush(300);
  assert.equal(f.visible(),true);
  assert.equal(f.jobs.size,0,'old close timer was cancelled');
});

test('a pending open cannot reopen a cart after close',()=>{
  const f=fixture();
  f.open();
  f.close();
  f.flush(10);f.flush(300);
  assert.equal(f.visible(),false);
  assert.equal(f.jobs.size,0);
});

test('repeated state transitions leave exactly one pending visual intent',()=>{
  const f=fixture();
  f.open();f.open();f.close();f.close();f.open();
  assert.equal(f.jobs.size,1,'no leaked animation timers');
  f.flush(10);f.flush(300);
  assert.equal(f.visible(),true);
});
