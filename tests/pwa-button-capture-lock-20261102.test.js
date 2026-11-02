import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../src/fixed-ui-runtime-1.js',import.meta.url),'utf8');
const start=source.indexOf('/* SPEC-TAPHOA-PWA-BUTTON-HITTEST-20261102');
const end=source.indexOf('let confirmActionCallback = null;',start);
assert.ok(start>0 && end>start,'one canonical capture owner exists');
const policy=source.slice(start,end);

function fixture(){
  const timeouts=[];
  let capture=null;
  const document={
    activeElement:{tagName:'BUTTON',blur(){throw new Error('keyboard focus must be preserved');}},
    addEventListener(type,handler,captureFlag){
      assert.equal(type,'click');
      assert.equal(captureFlag,true);
      capture=handler;
    }
  };
  vm.runInNewContext(policy,{document,setTimeout(fn,ms){timeouts.push({fn,ms});}});
  function element({fast=false,opacity='',pointerEvents=''}={}){
    return{
      tagName:'BUTTON',
      dataset:{},
      style:{opacity,pointerEvents},
      classList:{contains:x=>fast&&x==='allow-fast-click'}
    };
  }
  function click(el){
    let stopped=false,prevented=false;
    capture({
      target:{closest:()=>el},
      preventDefault(){prevented=true;},
      stopPropagation(){stopped=true;}
    });
    return{stopped,prevented};
  }
  return{click,element,timeouts};
}

test('repeat clicks stay on the SAME button and cannot click through a dialog',()=>{
  const f=fixture();
  const button=f.element({pointerEvents:'',opacity:'1'});
  assert.deepEqual(f.click(button),{stopped:false,prevented:false});
  assert.equal(button.dataset.isLocked,'true');
  assert.equal(button.style.pointerEvents,'');
  assert.deepEqual(f.click(button),{stopped:true,prevented:true});
  assert.equal(f.timeouts.length,1);
  assert.equal(f.timeouts[0].ms,1500);
  f.timeouts[0].fn();
  assert.equal(button.dataset.isLocked,'false');
  assert.equal(button.style.opacity,'1');
  assert.equal(button.style.pointerEvents,'');
  assert.deepEqual(f.click(button),{stopped:false,prevented:false});
});

test('disabled pointer-events stay disabled after lock expires',()=>{
  const f=fixture();
  const button=f.element({pointerEvents:'none',opacity:''});
  f.click(button);
  f.timeouts[0].fn();
  assert.equal(button.style.pointerEvents,'none');
});

test('native button focus and rapid quantity/navigation actions are preserved',()=>{
  const f=fixture();
  const quantity=f.element({fast:true});
  f.click(quantity);
  f.click(quantity);
  assert.equal(f.timeouts.length,0,'quantity/nav never get the global 1500ms lock');
});
