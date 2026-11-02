import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const src=fs.readFileSync(new URL('../src/fixed-ui-runtime-1.js',import.meta.url),'utf8');
const start=src.indexOf('let confirmActionCallback = null;');
const end=src.indexOf('function showAlertPopup(',start);
assert.ok(start>=0&&end>start,'canonical confirmation owner exists');
const code=src.slice(start,end);

function fixture(){
  const makeClassList=()=>({
    values:new Set(['opacity-0','pointer-events-none','scale-95']),
    add(...classes){for(const x of classes)this.values.add(x);},
    remove(...classes){for(const x of classes)this.values.delete(x);},
    contains(name){return this.values.has(name);}
  });
  const modal={classList:makeClassList()};
  const box={classList:makeClassList()};
  const btn={className:'',innerText:'',listeners:{},addEventListener(type,fn){this.listeners[type]=fn;}};
  const nodes={
    confirmTitle:{innerText:''},confirmDesc:{innerText:''},
    confirmBtn:btn,confirmModal:modal,confirmBox:box
  };
  const document={getElementById:id=>nodes[id]};
  const ctx={document};
  vm.runInNewContext(code+'\nthis.confirm={show:showConfirmModal,close:closeConfirmModal};',ctx);
  return{
    confirm:ctx.confirm,
    click:()=>btn.listeners.click(),
    visible:()=>!modal.classList.contains('opacity-0')&&!modal.classList.contains('pointer-events-none'),
    btn
  };
}

test('confirmation is consumed before action and second tap cannot repeat it',()=>{
  const f=fixture();
  let writes=0,visibleInsideAction=null;
  f.confirm.show('Xóa?','Bạn chắc chứ?','Xóa','bg-danger',()=>{
    visibleInsideAction=f.visible();
    writes++;
  });
  assert.equal(f.visible(),true);
  f.click();
  assert.equal(writes,1);
  assert.equal(visibleInsideAction,false,'modal closes before the side effect begins');
  f.click();
  assert.equal(writes,1,'a second click cannot duplicate the action');
});

test('a nested confirmation opened by a callback stays visible and actionable',()=>{
  const f=fixture();
  const fired=[];
  f.confirm.show('A','A','A','bg-danger',()=>{
    fired.push('A');
    f.confirm.show('B','B','B','bg-danger',()=>fired.push('B'));
  });
  f.click();
  assert.deepEqual(fired,['A']);
  assert.equal(f.visible(),true,'new dialog must not be closed by the old handler');
  f.click();
  assert.deepEqual(fired,['A','B']);
  assert.equal(f.visible(),false);
});

test('a failing action cannot leave the same modal clickable',()=>{
  const f=fixture();
  let attempts=0;
  f.confirm.show('A','A','A','bg-danger',()=>{
    attempts++;
    throw Error('simulated failure');
  });
  assert.throws(()=>f.click(),/simulated failure/);
  f.click();
  assert.equal(attempts,1);
  assert.equal(f.visible(),false);
});
