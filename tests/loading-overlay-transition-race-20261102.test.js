import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const src=readFileSync(new URL('../src/fixed-ui-runtime-1.js',import.meta.url),'utf8');
const start=src.indexOf('/* SPEC-TAPHOA-LOADING-TRANSITION-20261102');
const end=src.indexOf('const SheetDB =',start);
assert.ok(start>0&&end>start,'loading overlay owner exists');
const code=src.slice(start,end);

function fixture(){
  let id=0;const jobs=new Map();
  const overlay={classList:{
    values:new Set(['hidden','opacity-0']),
    add(...v){v.forEach(x=>this.values.add(x))},
    remove(...v){v.forEach(x=>this.values.delete(x))},
    contains(x){return this.values.has(x)}
  }};
  const label={innerText:''};
  const document={
    getElementById(name){
      return {loadingOverlay:overlay,loadingText:label,statusBar:null}[name]||null;
    }
  };
  const ctx={
    document,statusLoading:false,statusNoticeResetTimer:null,
    setTimeout(fn,ms){const key=++id;jobs.set(key,{fn,ms});return key;},
    clearTimeout(key){jobs.delete(key)},
    restoreStatusBarIdle(){}
  };
  vm.runInNewContext(code+'\nthis.ui={show:showLoading,hide:hideLoading};',ctx);
  return{
    ...ctx.ui,ctx,overlay,jobs,
    flush(){for(const [key,{fn}] of [...jobs]){jobs.delete(key);fn();}},
    visible(){return !overlay.classList.contains('hidden')&&!overlay.classList.contains('opacity-0')}
  };
}

test('loading from a later operation survives an older 300ms fade-out',()=>{
  const f=fixture();
  f.show('A');
  assert.equal(f.visible(),true);
  f.hide();
  assert.equal(f.jobs.size,1);
  f.show('B');
  f.flush();
  assert.equal(f.visible(),true);
  assert.equal(f.jobs.size,0);
  f.hide();f.flush();
  assert.equal(f.overlay.classList.contains('hidden'),true);
});

test('repeated hide requests do not accumulate visibility writes',()=>{
  const f=fixture();
  f.show('A');f.hide();f.hide();
  assert.equal(f.jobs.size,1);
  f.show('B');
  assert.equal(f.jobs.size,0);
  assert.equal(f.visible(),true);
});
